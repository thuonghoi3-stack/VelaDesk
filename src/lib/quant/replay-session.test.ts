import assert from "node:assert/strict";
import { test } from "node:test";
import { SimEngine } from "./backtest/engine.ts";
import { defaultConfig } from "./config.ts";
import { generateSynthetic } from "./data/synthetic.ts";
import { applySignals, enrichSeries } from "./pipeline.ts";
import { createReplaySession } from "./replay-session.ts";

function fixture() {
  const config = defaultConfig({
    strategyId: "combo", regimeFilterPorts: false, tp1R: 0.3,
    tp2R: 8, breakevenR: 10, timeStopBars: 100, dailyLossCap: 0.0001,
  });
  const bars = applySignals(enrichSeries(
    generateSynthetic("BTC/USDT", "1h", 3000, Date.UTC(2025, 0, 1)), "1h",
  ), config);
  return { config, bars };
}

// Compare every enumerable engine field, including private daily-risk state.
// Only process-global position/trade IDs are intentionally excluded.
function state(engine: SimEngine) {
  const { bars: _bars, cfg: _cfg, ...rest } = engine;
  return {
    ...rest,
    position: engine.position ? { ...engine.position, id: undefined } : null,
    trades: engine.trades.map((trade) => ({ ...trade, id: undefined })),
  };
}

test("warmup, halted-day and last-candle handoffs match uninterrupted stepping", () => {
  const { config, bars } = fixture();
  for (const target of [config.warmup, 1404, bars.length - 1]) {
    const original = new SimEngine(bars, config, config.ltf);
    while (original.i < target) original.step();
    const replay = createReplaySession(bars, config, bars[target]!.time);
    assert.deepEqual(state(replay), state(original));
    assert.equal(replay.i, target);
    if (target === 1404) {
      assert.equal((state(replay) as unknown as { halted: boolean }).halted, true);
    }
    original.step();
    replay.step();
    assert.deepEqual(state(replay), state(original));
  }
});

test("does not liquidate a partial position at a truncated data boundary until explicitly finished", () => {
  const { config, bars } = fixture();
  const truncated = bars.slice(0, 1408);
  const replay = createReplaySession(truncated, config, truncated[1407]!.time);
  assert.ok(replay.position?.tp1Done);
  assert.equal(replay.trades.some((trade) => trade.reason === "end_of_data"), false);
  replay.runToEnd();
  assert.equal(replay.done, true);
  assert.equal(replay.position, null);
});

test("owns deep snapshots of bars and config so later edits cannot relabel replay", () => {
  const { config, bars } = fixture();
  const beforeBars = structuredClone(bars);
  const beforeConfig = structuredClone(config);
  const replay = createReplaySession(bars, config, bars[1407]!.time);
  assert.equal(replay.bars === bars, false, "replay must own its bars");
  assert.notEqual(replay.cfg, config);
  assert.notEqual(replay.cfg.symbols, config.symbols);
  const patternIndex = bars.findIndex((bar) => bar.pattern !== null);
  assert.ok(patternIndex >= 0);
  assert.notEqual(replay.bars[patternIndex]!.pattern, bars[patternIndex]!.pattern);
  assert.deepEqual(bars, beforeBars);
  assert.deepEqual(config, beforeConfig);
  config.symbol = "ETH/USDT";
  config.symbols.push("OTHER/USDT");
  config.ltf = "5m";
  config.equity = 1;
  bars[1407]!.signal = 1;
  bars[1407]!.close = 1;
  bars[patternIndex]!.pattern!.strength = -100;
  assert.deepEqual(replay.bars, beforeBars);
  assert.deepEqual(replay.cfg, beforeConfig);
  assert.equal(replay.tf, "1h");
  replay.cfg.symbols.push("SESSION/USDT");
  replay.bars[0]!.close = 2;
  assert.equal(config.symbols.includes("SESSION/USDT"), false);
  assert.equal(bars[0]!.close, beforeBars[0]!.close);
});

test("rejects invalid, missing, ambiguous and pre-warmup entry timestamps without fallback", () => {
  const { config, bars } = fixture();
  for (const time of [NaN, Infinity, -Infinity, bars[1407]!.time + 1, bars[0]!.time]) {
    assert.throws(() => createReplaySession(bars, config, time), /entry|timestamp|warmup/i);
  }
  assert.throws(() => createReplaySession([], config, 0), /bars|entry/i);
  const duplicate = structuredClone(bars);
  duplicate[1408]!.time = duplicate[1407]!.time;
  assert.throws(() => createReplaySession(duplicate, config, duplicate[1407]!.time), /timestamp|ambiguous|unique/i);
  for (const warmup of [-1, 1.5, NaN, Infinity, bars.length]) {
    assert.throws(() => createReplaySession(bars, { ...config, warmup }, bars[1407]!.time), /warmup/i);
  }
});

test("reconstructs historical cash, daily risk and partial position before the target candle", () => {
  const { config, bars } = fixture();
  const original = new SimEngine(bars, config, config.ltf);
  const target = 1407;
  while (original.i < target) original.step();
  assert.ok(original.trades.length > 0);
  assert.notEqual(original.equity, config.equity);
  assert.ok(original.position?.tp1Done);
  assert.ok(original.position.remainingQty < original.position.qty);
  assert.ok(original.events.some((event) => event.kind === "halt"));
  const replay = createReplaySession(bars, config, bars[target]!.time);
  assert.deepEqual(state(replay), state(original));
  assert.equal(replay.i, target);
  assert.equal(replay.done, false);
  assert.equal(replay.equityCurve.length, target - config.warmup);
  assert.ok(replay.equityCurve.every((point) => point.time < bars[target]!.time));
  assert.ok(replay.events.every((event) => event.time < bars[target]!.time));
  assert.ok(replay.trades.every((trade) => trade.reason !== "end_of_data"));
  // Continuation must use the restored risk/account state too.
  for (let i = 0; i < 30; i++) {
    original.step();
    replay.step();
    assert.deepEqual(state(replay), state(original));
  }
});
