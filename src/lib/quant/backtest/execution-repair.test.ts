import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig } from "../config.ts";
import type { FeatureBar, DeskConfig } from "../types.ts";
import { SimEngine } from "./engine.ts";
import { PortfolioEngine } from "./portfolio.ts";
const base = Date.UTC(2026, 0, 1, 6);
const cfg = defaultConfig({warmup:1,equity:10000,riskPct:.01,maxExposure:1,maxLeverage:1,stopAtrMin:1,stopAtrMax:1,mrStopAtr:1,tp1R:1,tp2R:2,breakevenR:99,tp1ClosePct:.5,takerFee:0,slippageBps:0,fundingPer8h:0,timeStopBars:99,dailyLossCap:.5});
const b = (i:number, p:Partial<FeatureBar> = {}) => ({time:base+i*3600000,open:100,high:101,low:99,close:100,volume:100,atr:10,bbMid:null,ema20:null,macdHist:null,regime:"mixed",signal:0,strategy:"trend_pullback",...p} as FeatureBar);
const near = (actual:number, expected:number) => assert.ok(Math.abs(actual-expected)<1e-8, `${actual} != ${expected}`);
for (const mode of ["single", "portfolio"] as const) {
  function run(bars:FeatureBar[], patch:Partial<DeskConfig>={}) {
    const c={...cfg,...patch};
    const e=mode === "single" ? new SimEngine(bars,c,"1h") : new PortfolioEngine([{symbol:"A",bars}],c,"1h");
    if(e instanceof SimEngine)e.runToEnd(); else e.run();
    return e;
  }
  for (const side of [1,-1] as const) {
    test(`${mode}: entry fills before entry candle stop ${side}`,()=>{
      const e=run([b(0,{signal:side}),b(1,side===1?{low:89}:{high:111}),b(2),b(3)]);
      assert.equal(e.trades.length,1);assert.equal(e.trades[0]!.reason,"stop");near(e.equity,9900);assert.equal(e.exposedBars,1);
    });
    test(`${mode}: adverse gap plus exit slippage ${side}`,()=>{
      const e=run([b(0,{signal:side}),b(1),b(2,side===1?{open:80,high:85,low:75,close:80}:{open:120,high:125,low:115,close:120}),b(3)],{slippageBps:10});
      near(e.trades[0]!.exit,side===1?79.92:120.12);
    });
    test(`${mode}: split entry fees and funding conserve cash ${side}`,()=>{
      const e=run([b(0,{signal:side}),b(1),b(2,side===1?{high:125,close:120}:{low:75,close:80}),b(3)],{market:"usdm",takerFee:.001,fundingPer8h:.001});
      const funding=1, fees=side===1?2.15:1.85;
      near(e.trades.reduce((s,t)=>s+t.funding,0),funding);
      near(e.trades.reduce((s,t)=>s+t.fees,0),fees);
      near(e.trades.reduce((s,t)=>s+t.pnl-t.funding,0),150-fees-funding);
      near(e.equity,10000+150-fees-funding);
    });
  }
  test(`${mode}: funding settles elapsed boundaries at known open not future close`,()=>{
    const bars=[b(0,{signal:1,strategy:"macd"}),b(1),b(2,{time:base+26*3600000,open:100,high:106,close:105}),b(3,{time:base+27*3600000})];
    const e=run(bars,{market:"usdm",fundingPer8h:.001});
    // Held from Jan 1 07:00 through Jan 2 08:00: four 8h boundaries.
    near(e.trades.reduce((s,t)=>s+t.funding,0),4);near(e.equity,9996);
  });
  test(`${mode}: entry gate cannot suppress explicit opposite exit intent`,()=>{
    const bars=[b(0,{signal:1,strategy:"macd"}),b(1,{signal:0,strategy:"none",exitSignal:-1,exitStrategy:"macd"}),b(2,{open:105,high:106,close:105}),b(3)];
    const e=run(bars);assert.equal(e.trades.length,1);assert.equal(e.trades[0]!.reason,"signal_flip");near(e.equity,10050);
  });
  test(`${mode}: explicit zero exit intent disables legacy fallback`,()=>{
    const bars=[b(0,{signal:1,strategy:"macd"}),b(1,{signal:-1,strategy:"macd",exitSignal:0,exitStrategy:"macd"}),b(2,{open:105,high:106,close:105}),b(3)];
    const e=run(bars);assert.equal(e.trades.length,1);assert.equal(e.trades[0]!.reason,"end_of_data");near(e.equity,10000);
  });
  test(`${mode}: old stop beats simultaneous break-even and TP`,()=>{
    const e=run([b(0,{signal:1}),b(1),b(2,{high:125,low:85}),b(3)],{breakevenR:1});
    assert.equal(e.trades.length,1);near(e.trades[0]!.exit,90);near(e.equity,9900);
  });
  test(`${mode}: protective stop precedes close-based channel exit`,()=>{
    const bars=Array.from({length:13},(_,i)=>b(i));
    bars[10]=b(10,{signal:1,strategy:"turtle_s1"});
    bars[12]=b(12,{low:80,close:85});
    const e=run(bars);
    assert.equal(e.trades.length,1);assert.equal(e.trades[0]!.reason,"stop");near(e.trades[0]!.exit,90);
  });
  test(`${mode}: break-even learned from candle activates next candle`,()=>{
    const e=run([b(0,{signal:1}),b(1,{high:115,low:95,close:105}),b(2,{open:105,high:106,low:99,close:100}),b(3)],{breakevenR:1,tp1R:3,tp2R:4});
    assert.equal(e.trades.length,1);assert.equal(e.trades[0]!.exitTime,base+2*3600000);near(e.trades[0]!.exit,100);
  });
  test(`${mode}: entry candle TP ladder`,()=>{
    const e=run([b(0,{signal:1}),b(1,{high:125,close:120}),b(2),b(3)]);
    assert.equal(e.trades.length,2);near(e.equity,10150);
  });
  test(`${mode}: halt gates replacement and includes terminal day`,()=>{
    const e=run([b(0,{signal:1}),b(1,{signal:1}),b(2,{open:85,high:86,low:80,close:85}),b(3)],{dailyLossCap:.005});
    assert.equal(e.trades.length,1);assert.equal(e.dailyHaltDays,1);assert.equal(e.exposedBars,2);
  });
  test(`${mode}: E0V1E retains R ladder`,()=>{
    const e=run([b(0,{signal:1,strategy:"e0v1e",bbMid:105}),b(1),b(2,{high:109,close:108}),b(3,{high:109,close:108})]);near(e.equity,10080);
  });
  test(`${mode}: terminal cash curve and repeat finalization`,()=>{
    const e=run([b(0,{signal:1}),b(1),b(2,{high:106,close:105}),b(3,{high:106,close:105})],{slippageBps:10,takerFee:.001});
    near(e.equity,10045.90005);near(e.equityCurve.at(-1)!.equity,10045.90005);
    const before=JSON.stringify([e.trades,e.equityCurve,e.equity,e.exposedBars,e.dailyHaltDays]);
    if(e instanceof SimEngine){e.step();e.runToEnd();}else e.run();
    assert.equal(JSON.stringify([e.trades,e.equityCurve,e.equity,e.exposedBars,e.dailyHaltDays]),before);
  });
}
test("stepping to terminal is independently flat with exit costs",()=>{
 const e=new SimEngine([b(0,{signal:1}),b(1),b(2,{high:106,close:105}),b(3,{high:106,close:105})],{...cfg,takerFee:.001,slippageBps:10},"1h");
 while(!e.done)e.step(); assert.equal(e.position,null);near(e.equity,10045.90005);
});
