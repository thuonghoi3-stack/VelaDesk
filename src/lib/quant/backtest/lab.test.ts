import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSynthetic } from "../data/synthetic.ts";
import { defaultConfig } from "../config.ts";
import { buildDesk } from "../pipeline.ts";
import { runBacktest } from "./engine.ts";
import {
  compareStrategies,
  periodBreakdown,
  monteCarlo,
  runGrid,
  sliceBarsByRange,
  strategyBreakdown,
  walkForwardEfficiency,
} from "./lab.ts";
import type { DeskConfig, FeatureBar } from "../types.ts";

function barsFor(cfg: DeskConfig): FeatureBar[] {
  const ltfRaw = generateSynthetic("BTC/USDT", cfg.ltf, 900);
  const htfRaw = generateSynthetic("BTC/USDT", "4h", 400);
  return buildDesk(ltfRaw, htfRaw, cfg).ltf;
}

test("walk-forward efficiency ratio and guards", () => {
  assert.equal(walkForwardEfficiency(2, 1), 0.5);
  assert.equal(walkForwardEfficiency(0, 1), null); // zero train edge
  assert.equal(walkForwardEfficiency(Number.NaN, 1), null);
});

test("sliceBarsByRange keeps only bars inside the window", () => {
  const cfg = defaultConfig({ warmup: 220 });
  const bars = barsFor(cfg);
  const midFrom = bars[300]!.time;
  const midTo = bars[600]!.time;
  const sliced = sliceBarsByRange(bars, midFrom, midTo);
  assert.ok(sliced.length > 0 && sliced.length < bars.length);
  assert.ok(sliced.every((b) => b.time >= midFrom && b.time <= midTo));
  assert.equal(sliced[0]!.time, midFrom);
});

test("compareStrategies returns the full library sorted by sharpe", () => {
  const cfg = defaultConfig({ warmup: 220 });
  const bars = barsFor(cfg);
  const rows = compareStrategies(bars, cfg, cfg.ltf);
  assert.equal(rows.length, 32); // combo + 2 house + 29 ports
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i - 1]!.metrics.sharpe >= rows[i]!.metrics.sharpe);
  }
  const ids = new Set(rows.map((r) => r.id));
  assert.equal(ids.size, rows.length);
});

test("grid search picks the best train combo and evaluates it on test", () => {
  const cfg = defaultConfig({ warmup: 220 });
  const bars = barsFor(cfg);
  const res = runGrid({
    bars,
    cfg,
    tf: cfg.ltf,
    axes: [
      { key: "tp1R", values: [1, 1.5, 2] },
      { key: "tp2R", values: [2, 2.5] },
    ],
    objective: "sharpe",
    minTrades: 1,
  });
  assert.ok(res.combos.length === 6);
  assert.ok(res.best != null);
  // Best has the highest train score among the rows.
  for (const c of res.combos) assert.ok(res.best!.score >= c.score);
  // Test and control windows exist and use the untouched tail.
  assert.ok(res.test != null && res.control != null);
  assert.ok(res.testBars > 100 && res.trainBars > 300);
});

test("grid caps the number of combos", () => {
  const cfg = defaultConfig({ warmup: 220 });
  const bars = barsFor(cfg);
  const values = [0.5, 1, 1.5, 2, 2.5, 3, 3.5];
  const res = runGrid({
    bars,
    cfg,
    tf: cfg.ltf,
    axes: [
      { key: "tp1R", values },
      { key: "tp2R", values },
      { key: "breakevenR", values },
    ],
    objective: "sharpe",
    minTrades: 1,
  });
  assert.equal(res.combos.length, 36); // 343 combos truncated to MAX_COMBOS
  assert.equal(res.truncated, true);
});

test("monte carlo is deterministic and reports the full distribution", () => {
  const cfg = defaultConfig({ warmup: 220 });
  const bars = barsFor(cfg);
  const { trades } = runBacktest(bars, cfg, cfg.ltf);
  assert.ok(trades.length >= 0);
  const a = monteCarlo(trades, cfg.equity, { paths: 100, seed: 7 });
  const b = monteCarlo(trades, cfg.equity, { paths: 100, seed: 7 });
  assert.equal(a.finalP50, b.finalP50);
  assert.equal(a.maxDdP95, b.maxDdP95);
  assert.ok(a.maxDdP5 <= a.maxDdP50 && a.maxDdP50 <= a.maxDdP95);
  assert.ok(a.probDd25 >= 0 && a.probDd25 <= 1);
  assert.ok(a.ddHistogram.length > 0);
  // Empty trade list still yields a sane all-flat result.
  const empty = monteCarlo([], cfg.equity, { paths: 10 });
  assert.equal(empty.maxDdP50, 0);
});

test("strategy breakdown aggregates per strategy", () => {
  const cfg = defaultConfig({ warmup: 220 });
  const bars = barsFor(cfg);
  const { trades } = runBacktest(bars, cfg, cfg.ltf);
  const rows = strategyBreakdown(trades);
  assert.equal(rows.reduce((s, r) => s + r.trades, 0), trades.length);
  const pnlSum = rows.reduce((s, r) => s + r.pnl, 0);
  const tradePnl = trades.reduce((s, t) => s + t.pnl, 0);
  assert.ok(Math.abs(pnlSum - tradePnl) < 1e-6);
  for (const r of rows) {
    assert.ok(r.winRate >= 0 && r.winRate <= 1);
    assert.ok(r.mfeAvg >= 0 && r.maeAvg >= 0);
  }
});

test("periodBreakdown splits years and quarters from the equity curve", () => {
  const Y = (y: number, m: number, d: number) => Date.UTC(y, m - 1, d);
  const eq = [
    { time: Y(2024, 1, 2), equity: 10_000, drawdown: 0 },
    { time: Y(2024, 6, 15), equity: 11_000, drawdown: 0 },
    { time: Y(2025, 1, 2), equity: 9_000, drawdown: 0.18 },
    { time: Y(2025, 6, 15), equity: 9_900, drawdown: 0.08 },
  ];
  const trades = [
    { pnl: 800, exitTime: Y(2024, 5, 1) },
    { pnl: 300, exitTime: Y(2024, 11, 1) },
    { pnl: -1_500, exitTime: Y(2025, 2, 1) },
    { pnl: 1_000, exitTime: Y(2025, 7, 1) },
  ] as unknown as import("../types.ts").Trade[];

  const years = periodBreakdown(eq, trades, 10_000, "year");
  assert.equal(years.length, 2);
  assert.equal(years[0]!.label, "2024");
  assert.equal(years[0]!.netPnl, 1_000); // 10_000 -> 11_000
  assert.ok(Math.abs(years[0]!.netPct - 0.1) < 1e-9);
  assert.equal(years[0]!.trades, 2);
  assert.equal(years[1]!.label, "2025");
  // Boundary = equity at the END of 2024 (11_000): 9_900 − 11_000 = −1_100.
  // (Trades sum ≠ period PnL — the boundary drop is unrealized mark-to-market.)
  assert.equal(years[1]!.netPnl, -1_100);
  assert.ok(Math.abs(years[1]!.netPct + 0.1) < 1e-9);
  assert.ok(Math.abs(years[1]!.maxDd - (11_000 - 9_000) / 11_000) < 1e-9); // dd measured in-period
  assert.equal(years[1]!.trades, 2);

  const quarters = periodBreakdown(eq, trades, 10_000, "quarter");
  assert.equal(quarters.length, 4);
  assert.equal(quarters[0]!.label, "2024-Q1");
  assert.equal(quarters[2]!.label, "2025-Q1");
  assert.ok(quarters[2]!.netPct < 0);
});
