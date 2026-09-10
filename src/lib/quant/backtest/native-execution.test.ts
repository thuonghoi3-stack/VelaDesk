import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultConfig } from "../config.ts";
import { SimEngine } from "./engine.ts";
import { applySignals, enrichSeries } from "../pipeline.ts";
import { createReplaySession } from "../replay-session.ts";
import { PortfolioEngine } from "./portfolio.ts";

test("native MACD flows through pipeline engine portfolio and exact historical replay", () => {
 const cfg=defaultConfig({executionMode:"source-native",strategyId:"macd",warmup:0,side:"long_only",regimeFilterPorts:true});
 const raw=Array.from({length:80},(_,i)=>bar(i,{open:100+10*Math.sin((i-1)/4),close:100+10*Math.sin(i/4),high:112,low:88}));
 const bars=applySignals(enrichSeries(raw,"1h"),cfg);
 assert.ok(bars.some(b=>b.nativeIntents?.some(o=>o.kind==='entry'&&o.side==='short')));
 const e=new SimEngine(bars,cfg,"1h");e.runToEnd();
 assert.ok(e.trades.length>2);assert.ok(e.trades.every(t=>t.reason==='source_reversal'||t.reason==='end_of_data'));
 const replay=createReplaySession(bars,cfg,e.trades[1]!.entryTime);replay.runToEnd();
 const strip=(ts:typeof e.trades)=>ts.map(({id,symbol,...t})=>t);
 assert.deepEqual(strip(replay.trades),strip(e.trades));assert.deepEqual(replay.equityCurve,e.equityCurve);
 const p=new PortfolioEngine([{symbol:'A',bars}],cfg,'1h');p.run();assert.deepEqual(strip(p.trades),strip(e.trades));assert.deepEqual(p.equityCurve,e.equityCurve);
});
const native = await import("./native-execution.ts").catch(() => ({} as typeof import("./native-execution.ts")));
import type { NativeIntent } from "../strategy/native-reference.ts";
const market: NativeIntent = {kind:"entry",id:"L",side:"long",order:{kind:"market"},quantity:{kind:"unresolved-source-default"},reversal:"pine-entry-auto"};
function bar(i:number, p={}) { return {time:i*3600000,open:100,high:101,low:99,close:100,volume:1,...p}; }
test("source markets fill next open and never add ATR protection", () => {
  assert.equal(typeof native.NativeBroker, "function");
  const ledger={equity:10000};
  const b=new native.NativeBroker(ledger,defaultConfig({strategyId:"macd",executionMode:"source-native"}));
  b.step(bar(0),0,[market]);
  assert.equal(Boolean(b.position),false);
  b.step(bar(1,{open:110,high:120,low:1,close:115}),1,[]);
  assert.equal(b.position?.entry,110);
  assert.equal(b.position?.qty,1);
  assert.equal(b.trades.length,0);
  b.finish(bar(1,{close:115}));
  assert.equal(ledger.equity,10005);
});

test("stops persist until touched, cancel in source order, and marketable stops survive gaps away", () => {
  const b=new native.NativeBroker({equity:10000},defaultConfig({strategyId:"keltner"}));
  const stop={...market,order:{kind:"stop" as const,price:110}};
  b.step(bar(0),0,[stop]); b.step(bar(1),1,[]);
  assert.equal(Boolean(b.position),false); assert.equal(b.pending.size,1);
  b.step(bar(2,{high:112,close:111}),2,[]);assert.equal(b.position?.entry,110);
  const c=new native.NativeBroker({equity:10000},defaultConfig({strategyId:"bb_reversion"}));
  c.step(bar(0),0,[{...stop,order:{kind:"stop",price:90}}]);
  c.step(bar(1,{open:80,high:85,close:82}),1,[]);assert.equal(c.position?.entry,80);
  const d=new native.NativeBroker({equity:10000},defaultConfig({strategyId:"keltner"}));
  d.step(bar(0),0,[stop]);d.step(bar(1),1,[{kind:"cancel",id:"L"}]);d.step(bar(2,{high:120}),2,[]);assert.equal(d.position,null);
});

test("reversals settle cash and percent equity without pyramiding", () => {
 const ledger={equity:10000};const b=new native.NativeBroker(ledger,defaultConfig({strategyId:"supertrend"}));
 const l={...market,quantity:{kind:"percent-of-equity" as const,value:15 as const}};
 b.step(bar(0),0,[l]);b.step(bar(1),1,[l]);b.step(bar(2,{close:110}),2,[{...l,id:"S",side:"short"}]);
 assert.equal(b.position?.qty,15);assert.equal(b.trades.length,0);
 b.step(bar(3,{open:110,close:110}),3,[]);
 assert.equal(b.trades[0]?.reason,"source_reversal");assert.equal(ledger.equity,10150);
 assert.equal(b.position?.qty,10150*.15/110);
});
test("OCA resolves touched stops along open-nearest-extreme path",()=>{
 const b=new native.NativeBroker({equity:10000},defaultConfig({strategyId:"bb_reversion"}));
 const oca={name:"bands",type:"cancel" as const};
 b.step(bar(0),0,[{...market,order:{kind:"stop",price:110},oca},{...market,id:"S",side:"short",order:{kind:"stop",price:90},oca}]);
 b.step(bar(1,{open:98,high:115,low:89}),1,[]);
 assert.equal(b.position?.side,"short");assert.equal(b.position?.entry,90);assert.equal(b.pending.size,0);assert.equal(b.trades.length,0);assert.equal(b.events.filter(e=>e.kind==='fill').length,1);
});

for(const id of ['macd','rsi_reversion','bb_reversion','stoch_reversion','supertrend','keltner','psar'] as const)test(`native ${id}: full history, every prefix, no custom risk leakage`,()=>{
 const cfg=defaultConfig({executionMode:'source-native',strategyId:id,warmup:0});
 const raw=Array.from({length:180},(_,i)=>bar(i,{open:100+20*Math.sin((i-1)/4),close:100+20*Math.sin(i/4),high:Math.max(100+20*Math.sin((i-1)/4),100+20*Math.sin(i/4))+1,low:Math.min(100+20*Math.sin((i-1)/4),100+20*Math.sin(i/4))-1}));
 const bars=applySignals(enrichSeries(raw,'1h'),cfg);const e=new SimEngine(bars,cfg,'1h');e.runToEnd();
 assert.ok(bars.some(b=>(b.nativeIntents?.length??0)>0));
 for(let n=2;n<=bars.length;n++){const prefix=applySignals(enrichSeries(raw.slice(0,n),'1h'),cfg);assert.deepEqual(prefix.map(b=>b.nativeIntents),bars.slice(0,n).map(b=>b.nativeIntents));}
 const p=new PortfolioEngine([{symbol:'A',bars}],cfg,'1h');p.run();
 assert.equal(p.equity,e.equity);assert.ok(e.trades.every(t=>['source_reversal','end_of_data'].includes(t.reason)));
 const before=JSON.stringify([e.trades,e.equityCurve]);e.step();assert.equal(JSON.stringify([e.trades,e.equityCurve]),before);
});

test("same-side non-pyramiding order does not cancel opposite OCA order",()=>{
 const b=new native.NativeBroker({equity:10000},defaultConfig({strategyId:'macd'}));
 b.step(bar(0),0,[market]);b.step(bar(1),1,[{...market,oca:{name:'g',type:'cancel'}},{...market,id:'S',side:'short',order:{kind:'stop',price:90},oca:{name:'g',type:'cancel'}}]);
 b.step(bar(2),2,[]);assert.equal(b.pending.size,1);
 b.step(bar(3,{low:85}),3,[]);assert.equal(b.position?.side,'short');
});
test("native fees and slippage conserve cash through reversal and terminal close",()=>{
 const ledger={equity:10000};const b=new native.NativeBroker(ledger,defaultConfig({strategyId:'macd',nativeFee:.001,nativeSlippageBps:10}));
 b.step(bar(0),0,[market]);b.step(bar(1),1,[{...market,id:'S',side:'short'}]);b.step(bar(2,{open:110,close:105}),2,[]);b.finish(bar(2,{close:105}));
 assert.ok(Math.abs(ledger.equity-10000-b.trades.reduce((a,t)=>a+t.pnl,0))<1e-9);
 assert.equal(b.trades[0]?.entry,100*1.001);assert.equal(b.trades[0]?.exit,110*.999);
});

test("native properties reject invalid account assumptions",()=>{
 for(const partial of [{nativeFixedQty:0},{nativeTickSize:0},{nativeFee:-1},{nativeSlippageBps:NaN}])assert.throws(()=>new native.NativeBroker({equity:10000},defaultConfig(partial)),/native.*invalid/i);
});

test("unsupported native selection fails closed rather than silently adapting", () => {
  assert.throws(() => new SimEngine([], defaultConfig({ strategyId: "e0v1e", executionMode: "source-native" }), "1h"), /native.*unsupported/i);
});

test("native execution is explicit and never changes legacy default fixtures", () => {
  const cfg = defaultConfig();
  assert.equal(cfg.executionMode, "custom-risk");
  assert.equal(cfg.nativeFixedQty, 1);
  assert.equal(cfg.nativeTickSize, 0.01);
  assert.equal(cfg.nativeFee, 0);
  assert.equal(cfg.nativeSlippageBps, 0);
});
