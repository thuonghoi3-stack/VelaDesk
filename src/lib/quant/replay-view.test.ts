import assert from "node:assert/strict";
import { test } from "node:test";
import { SimEngine } from "./backtest/engine.ts";
import { defaultConfig } from "./config.ts";
import { generateSynthetic } from "./data/synthetic.ts";
import { computeIndicators } from "./features/indicators.ts";
import { replayView } from "./replay-view.ts";

import type { OpenPosition } from "./types.ts";

const fixture = () => {
  const bars = computeIndicators(generateSynthetic("BTC/USDT", "1h", 400, Date.UTC(2025, 0, 1)));
  return new SimEngine(bars, defaultConfig({ warmup: 220 }), "1h", 220);
};

test("reveals only bars before the next unprocessed index, including after a step", () => {
  const engine = fixture();
  for (let n = 0; n < 3; n++) {
    const view = replayView(engine, 10_000);
    assert.equal(view.bars.length, engine.i);
    assert.equal(view.lastBar, engine.bars[engine.i - 1]);
    assert.ok(!view.bars.includes(engine.bars[engine.i]!));
    engine.step();
  }
});

test("MTM uses latest curve point while cash stays engine equity, with startup fallback", () => {
  const engine = fixture();
  engine.equity = 9_950;
  assert.equal(replayView(engine, 10_000).mtm, 9_950);
  engine.equityCurve.push({ time: engine.bars[219]!.time, equity: 10_100, drawdown: 0 });
  engine.equityCurve.push({ time: engine.bars[219]!.time, equity: 10_200, drawdown: 0 });
  const view = replayView(engine, 10_000);
  assert.equal(view.cash, 9_950);
  assert.equal(view.mtm, 10_200);
  assert.equal(view.unrealized, 250);
});

test("position display reports remaining quantity after a partial exit without mutating engine", () => {
  const engine = fixture();
  engine.position = {
    id: "fixture",
    side: "long",
    strategy: "trend_pullback",
    entryTime: engine.bars[219]!.time,
    entryBar: 219,
    entry: 100,
    qty: 10,
    remainingQty: 4,
    stop: 95,
    tp1: 110,
    tp2: 120,
    riskPerUnit: 5,
    initialRiskUsdt: 50,
    fundingPaid: 0,
    barsHeld: 1,
    tp1Done: true,
    trailed: false,
    rReached: 2,
    maeR: 0,
    signalExit: false,
  } satisfies OpenPosition;
  const view = replayView(engine, 10_000);
  assert.equal(view.position?.qty, 4);
  assert.equal(engine.position.qty, 10);
  assert.notEqual(view.position, engine.position);
});

test("bounds clamp empty, invalid, start and completed replay progress", () => {
  const empty = replayView(null, 12_345);
  assert.deepEqual(empty.bars, []);
  assert.equal(empty.lastBar, null);
  assert.equal(empty.mtm, 12_345);
  assert.equal(empty.progress, 0);
  const engine = fixture();
  assert.equal(replayView(engine, 10_000).processed, 0);
  assert.equal(replayView(engine, 10_000).total, 180);
  engine.i = 230;
  assert.equal(replayView(engine, 10_000).processed, 10);
  assert.equal(replayView(engine, 10_000).remaining, 170);
  for (const i of [-10, NaN, 0]) {
    engine.i = i;
    const view = replayView(engine, 10_000);
    assert.equal(view.bars.length, 0);
    assert.equal(view.progress, 0);
  }
  engine.i = 999;
  const done = replayView(engine, 10_000);
  assert.equal(done.bars.length, 400);
  assert.equal(done.lastBar, engine.bars[399]);
  assert.equal(done.progress, 100);
  assert.equal(done.remaining, 0);
});
