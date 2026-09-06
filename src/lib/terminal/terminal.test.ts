import assert from "node:assert/strict";
import { test } from "node:test";
import { heikinAshi } from "./ha.ts";
import { evaluateAlerts, makeAlert, type Alert } from "./alerts-core.ts";

const bar = { time: 0, open: 100, high: 110, low: 90, close: 104, volume: 1 };

test("heikin ashi close is the OHLC mean and first open is seeded with (o+c)/2", () => {
  const [first, second] = heikinAshi([
    bar,
    { time: 1, open: 104, high: 112, low: 100, close: 108, volume: 1 },
  ]);
  assert.equal(first!.close, (100 + 110 + 90 + 104) / 4);
  assert.equal(first!.open, (100 + 104) / 2);
  // second open = (haOpen1 + haClose1) / 2
  const expectedOpen = (first!.open + first!.close) / 2;
  assert.equal(second!.open, expectedOpen);
  assert.equal(second!.high, Math.max(112, expectedOpen, second!.close));
  assert.equal(second!.low, Math.min(100, expectedOpen, second!.close));
});

test("heikin ashi high/low envelope the raw range", () => {
  const bars = heikinAshi([bar]);
  assert.ok(bars[0]!.high >= 110);
  assert.ok(bars[0]!.low <= 90);
});

test("price alert fires in the right direction exactly once", () => {
  const alerts: Alert[] = [
    makeAlert("BTC/USDT", "price_above", 105, 100),
    makeAlert("BTC/USDT", "price_below", 95, 100),
    makeAlert("ETH/USDT", "price_above", 105, 100),
  ];
  const kindOf = alerts.map((a) => a.kind);
  assert.deepEqual(kindOf, ["price_above", "price_below", "price_above"]);

  // ETH alert must not fire for a BTC price; the below-alert must.
  const first = evaluateAlerts(alerts, "BTC/USDT", { price: 94 });
  assert.equal(first.fired.length, 1);
  assert.equal(first.fired[0]!.price, 95);
  assert.ok(first.fired[0]!.triggeredAt != null);
  assert.equal(first.remaining.length, 2);

  // Already-triggered alerts never re-fire.
  const stored = [...first.fired, ...first.remaining];
  const second = evaluateAlerts(stored, "BTC/USDT", { price: 200 });
  assert.equal(second.fired.length, 1);
  assert.equal(second.fired[0]!.price, 105);
  const third = evaluateAlerts([...second.fired, ...second.remaining], "BTC/USDT", { price: 200 });
  assert.equal(third.fired.length, 0);
});

test("rsi and 24h-move alerts evaluate on their own context", () => {
  const alerts: Alert[] = [
    makeAlert("BTC/USDT", "rsi_below", 30, null),
    makeAlert("BTC/USDT", "pct_up", 0.05, null),
  ];
  // RSI context fires only the RSI alert; the pct one waits for a changePct.
  const rsiEval = evaluateAlerts(alerts, "BTC/USDT", { rsi: 27 });
  assert.equal(rsiEval.fired.length, 1);
  assert.equal(rsiEval.fired[0]!.kind, "rsi_below");
  const pctEval = evaluateAlerts(rsiEval.remaining, "BTC/USDT", { changePct: 0.062 });
  assert.equal(pctEval.fired.length, 1);
  assert.equal(pctEval.fired[0]!.kind, "pct_up");
  // A percent alert with no changePct in context stays pending.
  const pending = evaluateAlerts([makeAlert("BTC/USDT", "pct_down", 0.1, null)], "BTC/USDT", { price: 100 });
  assert.equal(pending.fired.length, 0);
  assert.equal(pending.remaining.length, 1);
});

test("non-finite context evaluates to nothing", () => {
  const res = evaluateAlerts([makeAlert("BTC/USDT", "price_above", 1, null)], "BTC/USDT", { price: Number.NaN });
  assert.equal(res.fired.length, 0);
  assert.equal(res.remaining.length, 1);
});
