import type { AnalysisSnapshot, FeatureBar, PatternHit } from "../types";

function clip(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/**
 * Confluence 0–100 = trend 25 + momentum 25 + volatility 20 + volume 15 + pattern 15.
 * All scores use the last closed LTF bar only.
 */
export function scoreConfluence(bar: FeatureBar): AnalysisSnapshot["confluenceBreakdown"] {
  let trend = 6;
  if (bar.adx != null && bar.ema50 != null) {
    const aligned =
      (bar.close > bar.ema50 && bar.htfBias >= 0) ||
      (bar.close < bar.ema50 && bar.htfBias <= 0);
    if (bar.adx >= 25 && aligned) trend = 25;
    else if (bar.adx >= 25) trend = 18;
    else if (bar.adx >= 20) trend = 14;
    else if (bar.adx < 18) trend = 8;
  }
  if (bar.htfBias !== 0) trend = Math.min(25, trend + 3);

  let momentum = 8;
  if (bar.rsi != null) {
    if (bar.rsi >= 45 && bar.rsi <= 65) momentum += 8;
    else if (bar.rsi < 30 || bar.rsi > 70) momentum += 4;
    else momentum += 5;
  }
  if (bar.macdHist != null) {
    if (bar.macdHist > 0) momentum += 7;
    else momentum += 2;
  }
  momentum = clip(momentum, 0, 25);

  let volatility = 10;
  if (bar.extremeVol) volatility = 4;
  else if (bar.highVol) volatility = 9;
  else if (bar.atr != null && bar.atrSma20 != null) volatility = 20;
  else if (bar.bbWidth != null) volatility = 14;

  let volume = 5;
  if (bar.volSpike != null) {
    if (bar.volSpike >= 1.4) volume = 15;
    else if (bar.volSpike >= 1.2) volume = 12;
    else if (bar.volSpike >= 1.0) volume = 9;
    else volume = 5;
  }

  let pattern = 0;
  if (bar.pattern) {
    const aligned =
      bar.pattern.direction === 0
        ? 0.5
        : bar.htfBias === 0 || bar.pattern.direction === bar.htfBias
          ? 1
          : 0.25;
    pattern = Math.round(bar.pattern.strength * 15 * aligned);
  }

  return { trend, momentum, volatility, volume, pattern };
}

export function latestIndicators(bar: FeatureBar): Record<string, number | string | null> {
  return {
    close: bar.close,
    ema20: bar.ema20,
    ema50: bar.ema50,
    ema200: bar.ema200,
    adx: bar.adx,
    rsi: bar.rsi,
    macd: bar.macd,
    macdHist: bar.macdHist,
    stochK: bar.stochK,
    atr: bar.atr,
    atrSma20: bar.atrSma20,
    bbMid: bar.bbMid,
    bbUpper: bar.bbUpper,
    bbLower: bar.bbLower,
    bbWidth: bar.bbWidth,
    volSpike: bar.volSpike,
    htfAdx: bar.htfAdx,
    htfEma50: bar.htfEma50,
    htfBias: bar.htfBias,
    regime: bar.regime,
  };
}

export function lastPatterns(bars: FeatureBar[], n = 8): PatternHit[] {
  const out: PatternHit[] = [];
  for (let i = bars.length - 1; i >= 0 && out.length < n; i--) {
    const p = bars[i]!.pattern;
    if (p && p.strength >= 0.3) out.push(p);
  }
  return out;
}
