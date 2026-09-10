import assert from 'node:assert/strict';
import test from 'node:test';
import { SimEngine } from '../backtest/engine.ts';
import { applySignals } from '../pipeline.ts';
import { defaultConfig } from '../config.ts';
import { computeIndicators } from '../features/indicators.ts';

test('ADX first valid index 27 is available without a future 29th bar', () => {
  const raw=candles(Array.from({length:40},(_,i)=>100+i));
  const short=computeIndicators(raw.slice(0,28));
  assert.equal(short[26].adx,null);
  assert.equal(short[27].adx,100); // +DM only => every DX is 100
  assert.deepEqual(short,computeIndicators(raw).slice(0,28));
});

test('configured warmup does not shrink on a short EMA cross history', () => {
  const bars=computeIndicators(candles([100,100,100,100,110,100]));
  const cfg=defaultConfig({strategyId:'ema_cross',warmup:20,emaFastLen:2,emaSlowLen:3,regimeFilterPorts:false});
  assert.deepEqual(applySignals(bars,cfg).map(b=>b.signal),[0,0,0,0,0,0]);
  const extended=computeIndicators(candles([100,100,100,100,110,100,...Array(20).fill(100)]));
  assert.deepEqual(applySignals(bars,cfg),applySignals(extended,cfg).slice(0,bars.length));
});

test('RSI BB respects configured warmup while retaining later signals', () => {
  const bars=computeIndicators(candles(Array.from({length:700},(_,i)=>100+12*Math.sin(i/11)+6*Math.sin(i/37))));
  const cfg=defaultConfig({strategyId:'rsi_bb',warmup:650,regimeFilterPorts:false});
  const out=applySignals(bars,cfg);
  assert.equal(out.slice(0,650).filter(b=>b.signal).length,0);
  const ready=applySignals(bars,{...cfg,warmup:40});
  assert.ok(ready.slice(0,650).some(b=>b.signal));
  assert.deepEqual(out.slice(650),ready.slice(650));
});

test('long-only retains EMA opposite exit intent and engine closes without short entry', () => {
  const bars=computeIndicators(candles([100,100,100,100,110,100,100,100])).map(b=>({...b,atr:20}));
  const cfg=defaultConfig({strategyId:'ema_cross',side:'long_only',warmup:4,emaFastLen:2,emaSlowLen:3,regimeFilterPorts:false,breakevenR:100,slippageBps:0,takerFee:0,fundingPer8h:0});
  const out=applySignals(bars,cfg);
  assert.equal(out[4].signal,1);
  // Explicit exit intent survives the long-only entry gate; bearish entry stays forbidden.
  assert.equal(out[5].signal,0);
  assert.equal(out[5].exitSignal,-1);
  assert.equal(out[5].exitStrategy,'ema_cross');
  const engine=new SimEngine(out,cfg,cfg.ltf);
  engine.runToEnd();
  assert.equal(engine.trades.length,1);
  assert.equal(engine.trades[0].side,'long');
  assert.equal(engine.trades[0].reason,'signal_flip');
  assert.equal(engine.trades[0].exitTime,bars[6].time);
  assert.equal(engine.position,null);
  assert.equal(engine.events.filter(e=>e.kind==='fill').length,1);
});

function candles(closes: number[]) {
  return closes.map((close, i) => ({ time: Date.UTC(2023,0,1)+i*3600000, open:close, high:close+1, low:close-1, close, volume:100 }));
}

test('Wilder RSI zero-loss is 100 at seed and recurrence; flat uses no-loss-first convention', () => {
  // RSI = 100 * gain/(gain+loss) for positive movement; loss=0 =>100.
  // Flat 0/0 is undefined mathematically: desk convention is 100, matching library RSI.
  for (const closes of [Array.from({length:30},(_,i)=>100+i), Array(30).fill(100)]) {
    const out=computeIndicators(candles(closes));
    assert.equal(out[13].rsi,null);
    assert.equal(out[14].rsi,100);
    assert.equal(out[29].rsi,100);
  }
  assert.equal(computeIndicators(candles(Array.from({length:30},(_,i)=>100-i)))[29].rsi,0);
  const mixed=computeIndicators(candles(Array.from({length:16},(_,i)=>100+(i%2))));
  assert.equal(mixed[14].rsi,50); // seven +1 and seven -1 deltas
  assert.ok(Math.abs(mixed[15].rsi! - (100*(7.5/14)))<1e-12);
});
