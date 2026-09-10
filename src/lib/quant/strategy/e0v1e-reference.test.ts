import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as reference from './e0v1e-reference.ts';

test('source percent-dip predicates preserve strict boundaries and literal tags', () => {
  assert.equal(typeof reference.e0v1eEntry, 'function');
  const row = { close: 90, low: 89, ema8: 100, ema16: 100, ewo: 0, rsi: 25, rsiFast: 20, rsiSlow: 30, sma15: 100, cti: -0.9 };
  assert.deepEqual(reference.e0v1eEntry(row, 31), { enterLong: true, enterTag: 'ewobuy_1', ewo: true, buy1: true });
  for (const patch of [{ rsiFast: 50 }, { close: 95.6 }, { ewo: -1.238 }, { ema16: 90 / .986 }, { rsi: 30 }]) {
    assert.equal(reference.e0v1eEntry({ ...row, ...patch }, 31).ewo, false);
  }
  for (const patch of [{ rsiSlow: 31 }, { rsiFast: 63 }, { rsi: 16 }, { close: 93.2 }, { cti: -.8 }]) {
    assert.equal(reference.e0v1eEntry({ ...row, ...patch }, 31).buy1, false);
  }
  assert.equal(reference.e0v1eEntry({ ...row, rsi: NaN }, 31).enterLong, false);
});

test('indicators match independent nonflat closed-sum Python oracle and prefix causality', () => {
  assert.equal(typeof reference.e0v1eIndicators, 'function');
  const oracle = JSON.parse(readFileSync(new URL('../../../../.hermes/artifacts/native-parity/e0v1e/oracle.json', import.meta.url), 'utf8'));
  const actual = reference.e0v1eIndicators(oracle.candles);
  for (let i = 0; i < actual.length; i++) {
    for (const [key, value] of Object.entries(oracle.expected[i])) {
      const got = actual[i][key as keyof reference.E0V1EEntryIndicators];
      if (value === null) assert.ok(Number.isNaN(got), `${i} ${key} warmup`);
      else assert.ok(Math.abs(got - (value as number)) < 1e-9, `${i} ${key}: ${got} != ${value}`);
    }
  }
  assert.ok(actual.some(r => r.cti > .8));
  assert.ok(actual.some(r => r.cti < -.8));
  for (const end of [1, 20, 21, 80, 200, 230]) assert.deepEqual(reference.e0v1eIndicators(oracle.candles.slice(0, end)), actual.slice(0, end));
  const flat = reference.e0v1eIndicators(Array.from({ length: 205 }, () => ({ close: 100, low: 99 })));
  assert.equal(flat[20].rsiSlow, 0);
  assert.ok(Number.isNaN(flat[20].cti));
  assert.ok(Number.isNaN(actual[198].ewo));
  assert.ok(Number.isFinite(actual[199].ewo));
  assert.throws(() => reference.e0v1eIndicators([{ close: NaN, low: 1 }]), /finite/);
});


test('source settings and raw callbacks preserve thresholds, order and tag bug', () => {
  assert.equal(typeof reference.e0v1eCustomStoploss, 'function');
  assert.equal(reference.E0V1E_SOURCE.startupCandleCount, 20);
  assert.equal(reference.E0V1E_SOURCE.timeframe, '5m');
  assert.deepEqual(reference.E0V1E_SOURCE.minimalRoi, { '0': 10 });
  assert.equal(reference.E0V1E_SOURCE.runtimeParity, 'unresolved');
  const base = { currentTimeMs: 0, openTimeMs: 0, currentProfit: -.009, enterTag: null, fastk: 76 };
  const stop = (patch: Partial<reference.E0V1EStoplossContext>) => reference.e0v1eCustomStoploss({ ...base, ...patch });
  assert.equal(stop({ currentTimeMs: 3600000 }), -.99);
  assert.equal(stop({ currentTimeMs: 3600001 }), -.001);
  assert.equal(stop({ currentTimeMs: 3600001, currentProfit: -.01 }), -.99);
  assert.equal(stop({ currentTimeMs: 86400000, currentProfit: -.049 }), -.99);
  assert.equal(stop({ currentTimeMs: 86400001, currentProfit: -.049 }), -.001);
  assert.equal(stop({ currentTimeMs: 86400001, currentProfit: -.05 }), -.99);
  assert.equal(stop({ currentProfit: .05, enterTag: 'ewo', fastk: 75 }), -.005);
  assert.equal(stop({ currentProfit: .049, enterTag: 'ewo', fastk: 75 }), -.99);
  assert.equal(stop({ currentProfit: .05, enterTag: 'ewobuy_1', fastk: 75 }), -.99);
  assert.equal(stop({ currentProfit: .05, enterTag: 'ewo buy_1', fastk: 75 }), -.005);
  assert.equal(stop({ currentProfit: .05, enterTag: 'ewo' }), -.005);
  assert.equal(stop({ currentTimeMs: 3600001, currentProfit: .05, enterTag: 'ewo' }), -.001);
  assert.equal(stop({ currentProfit: 0 }), -.99);
  assert.equal(stop({ currentProfit: .001 }), -.001);
  const fish = { currentProfit: -.051, bbWidth: .049, close: 101, bbMiddle: 100, volumeMean12: 99, volumeMean24: 100 };
  assert.equal(reference.e0v1eCustomExit(fish), 'sell_stoploss_deadfish');
  for (const patch of [{ currentProfit: -.05 }, { bbWidth: .05 }, { close: 100 }, { volumeMean12: 100 }, { bbWidth: NaN }]) assert.equal(reference.e0v1eCustomExit({ ...fish, ...patch }), null);
});
