import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSynthetic } from "../data/synthetic.ts";
import { defaultConfig } from "../config.ts";
import { buildDesk } from "../pipeline.ts";
import { SimEngine } from "./engine.ts";
import { PortfolioEngine, runPortfolio } from "./portfolio.ts";
import type { DeskConfig, FeatureBar } from "../types.ts";

function barsFor(cfg: DeskConfig, symbol: string): FeatureBar[] {
  return buildDesk(
    generateSynthetic(symbol, cfg.ltf, 1200),
    generateSynthetic(symbol, "4h", 420),
    cfg,
  ).ltf;
}

test("one-symbol portfolio is identical to the single-symbol engine", () => {
  const cfg = defaultConfig({ warmup: 220 });
  for (const strategyId of ["combo", "supertrend", "turtle_s1"] as const) {
    const bars = barsFor({ ...cfg, strategyId }, "BTC/USDT");
    const single = new SimEngine(bars, { ...cfg, strategyId }, cfg.ltf);
    single.runToEnd();
    const pf = runPortfolio([{ symbol: "BTC/USDT", bars }], { ...cfg, strategyId }, cfg.ltf);
    assert.equal(pf.trades.length, single.trades.length, `${strategyId}: trade count diverged`);
    for (let i = 0; i < single.trades.length; i++) {
      const a = single.trades[i]!;
      const b = pf.trades[i]!;
      assert.ok(Math.abs(a.pnl - b.pnl) < 1e-9, `${strategyId}: trade ${i} pnl diverged`);
      assert.equal(a.reason, b.reason, `${strategyId}: trade ${i} reason diverged`);
    }
    const singleFinal = single.equityCurve[single.equityCurve.length - 1]!.equity;
    const pfFinal = pf.equity[pf.equity.length - 1]!.equity;
    assert.ok(
      Math.abs(singleFinal - pfFinal) < 1e-6,
      `${strategyId}: final equity ${singleFinal} vs ${pfFinal}`,
    );
    assert.equal(pf.equity.length, single.equityCurve.length);
  }
});

test("multi-symbol portfolio respects maxPositions", () => {
  const cfg = defaultConfig({ warmup: 220, maxPositions: 2, strategyId: "supertrend" });
  const inputs = ["BTC/USDT", "ETH/USDT", "SOL/USDT"].map((symbol) => ({
    symbol,
    bars: barsFor(cfg, symbol),
  }));
  const res = runPortfolio(inputs, cfg, cfg.ltf);
  assert.ok(res.trades.length > 0);
  assert.ok(res.maxConcurrent <= 2, `maxConcurrent ${res.maxConcurrent} > 2`);
  assert.ok(res.perSymbol.length === 3);
  assert.equal(res.trades.reduce((s, t) => s + (t.symbol ? 1 : 0), 0), res.trades.length);
  // Trades from different symbols may overlap in time — that's the point.
  const symbols = new Set(res.trades.map((t) => t.symbol));
  assert.ok(symbols.size >= 2, "expected trades from at least two symbols");
});

test("maxPositions=1 serializes entries across symbols", () => {
  const cfg = defaultConfig({ warmup: 220, maxPositions: 1, strategyId: "supertrend" });
  const inputs = ["BTC/USDT", "ETH/USDT"].map((symbol) => ({
    symbol,
    bars: barsFor(cfg, symbol),
  }));
  const engine = new PortfolioEngine(inputs, cfg, cfg.ltf);
  engine.run();
  assert.equal(engine.maxConcurrent, 1);
  // No two trades from different symbols ever overlap in [entryTime, exitTime).
  const byOpen = engine.trades
    .map((t) => ({ s: t.symbol!, in: t.entryTime, out: t.exitTime }))
    .sort((a, b) => a.in - b.in);
  for (let i = 1; i < byOpen.length; i++) {
    if (byOpen[i]!.s !== byOpen[i - 1]!.s) {
      assert.ok(byOpen[i]!.in >= byOpen[i - 1]!.out, "cross-symbol trades overlapped");
    }
  }
});

test("portfolio rejects symbols with too little history", () => {
  const cfg = defaultConfig({ warmup: 220 });
  // generateSynthetic clamps to ≥ 400 bars, so slice a real frame instead.
  const short = barsFor(cfg, "BTC/USDT").slice(0, 100);
  assert.throws(
    () => new PortfolioEngine([{ symbol: "BTC/USDT", bars: short }], cfg, "1h"),
    /cần ≥/,
  );
});
