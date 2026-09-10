import assert from 'node:assert/strict';
import test from 'node:test';
import { applySignals } from '../pipeline.ts';
import { defaultConfig } from '../config.ts';
import { computeIndicators } from '../features/indicators.ts';

const cfg = defaultConfig({strategyId:'ema_cross',side:'both',warmup:4,emaFastLen:2,emaSlowLen:3,regimeFilterPorts:true});
function fixture(closes = [100,100,100,100,110,100,100,100]) {
  return computeIndicators(closes.map((close,i)=>({time:Date.UTC(2023,0,1)+i*3600000,open:close,high:close+1,low:close-1,close,volume:100}))).map(b=>({...b,adx:0}));
}

test('exit intents respect warmup and remain causal on every prefix', () => {
  const bars=fixture([100,100,100,100,110,100,100,100,120,90,100]);
  const full=applySignals(bars,cfg);
  for (let n=1;n<=bars.length;n++) {
    assert.deepEqual(applySignals(bars.slice(0,n),cfg),full.slice(0,n));
  }
  const reset=applySignals(full,{...cfg,warmup:100});
  assert.ok(reset.every(b=>b.exitSignal===0 && b.exitStrategy===undefined && b.signal===0));
  assert.ok(full.slice(0,cfg.warmup).every(b=>b.exitSignal===0));
  assert.equal(full[6].exitSignal,0);
  assert.equal(full[6].exitStrategy,undefined);
});

test('reapplication clears stale intents when switching to house and non-flip strategies', () => {
  const stale=applySignals(fixture(),cfg);
  const before=structuredClone(stale);
  for (const strategyId of ['combo','trend_pullback','mean_reversion','rsi_reversion'] as const) {
    const out=applySignals(stale,{...cfg,strategyId,warmup:100});
    assert.ok(out.every(b=>b.exitSignal===0 && b.exitStrategy===undefined));
    assert.ok(out.every(b=>b.signal===0));
  }
  assert.deepEqual(stale,before);
});

test('long-only forbids bearish entry while preserving bearish exit without regime gate', () => {
  const out=applySignals(fixture(),{...cfg,side:'long_only',regimeFilterPorts:false});
  assert.equal(out[4].signal,1);
  assert.equal(out[5].exitSignal,-1);
  assert.equal(out[5].exitStrategy,'ema_cross');
  assert.equal(out[5].signal,0);
  assert.equal(out[5].strategy,'none');
  assert.equal(out[5].signalReason,'');
});

test('regime-denied opposite entry retains strategy-scoped raw exit intent', () => {
  const out=applySignals(fixture(),cfg);
  const raw=applySignals(fixture(),{...cfg,regimeFilterPorts:false});
  assert.equal(raw[4].signal,1);
  assert.equal(raw[5].signal,-1);
  assert.equal(out[5].exitSignal,-1);
  assert.equal(out[5].exitStrategy,'ema_cross');
  assert.ok(out.every(b=>b.signal===0 && b.strategy==='none' && b.signalReason===''));
});
