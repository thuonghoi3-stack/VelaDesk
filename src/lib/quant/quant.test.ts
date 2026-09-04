import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanOhlcv } from "./data/cleaner.ts";
import { generateSynthetic } from "./data/synthetic.ts";
import { detectPattern } from "./features/patterns.ts";
import { computeIndicators } from "./features/indicators.ts";
import { mapHtfToLtf } from "./features/regime.ts";
import { buildDesk } from "./pipeline.ts";
import { sizeQty } from "./risk/sizer.ts";
import { defaultConfig } from "./config.ts";
import { runBacktest } from "./backtest/engine.ts";
import type { FeatureBar, Ohlcv } from "./types.ts";

test("cleaner flags a two-interval gap and fills a single hole", () => {
  const raw: Ohlcv[] = [
    { time: 0, open: 1, high: 1.2, low: 0.9, close: 1.1, volume: 10 },
    { time: 2 * 3_600_000, open: 1.2, high: 1.3, low: 1.0, close: 1.25, volume: 11 },
  ];
  const out = cleanOhlcv(raw, "1h");
  assert.equal(out.length, 3);
  assert.equal(out[1]!.gap, true);
  assert.equal(out[1]!.close, 1.1);
});

test("hammer pattern is bullish", () => {
  const bars = [
    { open: 10, high: 10.2, low: 9.8, close: 10.1 },
    { open: 10.0, high: 10.05, low: 9.2, close: 10.02 },
  ].map((b, i) => ({ ...b, time: i, volume: 1, ema20: null, ema50: null, ema200: null, adx: null, rsi: null, macd: null, macdSignal: null, macdHist: null, stochK: null, stochD: null, atr: null, atrSma20: null, bbMid: null, bbUpper: null, bbLower: null, bbWidth: null, volSma20: null, volSpike: null, obv: null, regime: "mixed" as const, highVol: false, extremeVol: false, pattern: null, htfClose: null, htfEma50: null, htfAdx: null, htfBias: 0 as const, signal: 0 as const, signalReason: "", strategy: "none" as const })) as FeatureBar[];
  const hit = detectPattern(bars, 1);
  assert.ok(hit);
  assert.equal(hit!.direction, 1);
});

test("sizer respects exposure cap", () => {
  const cfg = defaultConfig({ maxExposure: 0.25, maxLeverage: 2, riskPct: 0.01 });
  const qty = sizeQty(10_000, cfg, 100, 2);
  assert.ok(qty <= (10_000 * 0.25 * 2) / 100 + 1e-9);
});

test("HTF map does not use a still-forming bar", () => {
  const ltfRaw = generateSynthetic("BTC/USDT", "1h", 400);
  const htfRaw = generateSynthetic("BTC/USDT", "4h", 120);
  const ltf = computeIndicators(cleanOhlcv(ltfRaw, "1h"));
  const htf = computeIndicators(cleanOhlcv(htfRaw, "4h"));
  mapHtfToLtf(ltf, htf, "4h");
  const last = ltf[ltf.length - 1]!;
  if (last.htfClose != null) {
    const interval = 4 * 3_600_000;
    const used = htf.filter((h) => h.time + interval <= last.time);
    assert.ok(used.length > 0);
    assert.equal(used[used.length - 1]!.close, last.htfClose);
  }
});

test("backtest runs next-bar without throwing", () => {
  const cfg = defaultConfig({ warmup: 220, equity: 10_000 });
  const ltfRaw = generateSynthetic("BTC/USDT", "1h", 900);
  const htfRaw = generateSynthetic("BTC/USDT", "4h", 400);
  const { ltf } = buildDesk(ltfRaw, htfRaw, cfg);
  const res = runBacktest(ltf, cfg, "1h");
  assert.ok(res.metrics.endEquity > 0);
  assert.ok(res.claimReason.length > 0);
});
