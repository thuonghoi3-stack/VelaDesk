import type { FeatureBar } from "../types";

export type RuleCheck = {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
};

export type SignalContext = {
  bars: FeatureBar[];
  i: number;
  tradeVolatility: boolean;
  allowShort: boolean;
};

export function barAt(ctx: SignalContext, offset = 0): FeatureBar | null {
  const idx = ctx.i + offset;
  if (idx < 0 || idx >= ctx.bars.length) return null;
  return ctx.bars[idx]!;
}

export function rsiDippedThenLifted(
  bars: FeatureBar[],
  i: number,
  lo: number,
  hi: number,
  lookback = 8,
): boolean {
  const now = bars[i]!.rsi;
  const prev = i > 0 ? bars[i - 1]!.rsi : null;
  if (now == null || prev == null) return false;
  if (!(now > prev && now >= lo)) return false;
  let dipped = false;
  const from = Math.max(0, i - lookback);
  for (let k = from; k < i; k++) {
    const r = bars[k]!.rsi;
    if (r != null && r >= lo && r <= hi) dipped = true;
  }
  return dipped;
}

export function rsiPeakedThenDropped(
  bars: FeatureBar[],
  i: number,
  lo: number,
  hi: number,
  lookback = 8,
): boolean {
  const now = bars[i]!.rsi;
  const prev = i > 0 ? bars[i - 1]!.rsi : null;
  if (now == null || prev == null) return false;
  if (!(now < prev && now <= hi)) return false;
  let peaked = false;
  const from = Math.max(0, i - lookback);
  for (let k = from; k < i; k++) {
    const r = bars[k]!.rsi;
    if (r != null && r >= lo && r <= hi) peaked = true;
  }
  return peaked;
}

export function macdRising(bars: FeatureBar[], i: number): boolean {
  const a = bars[i]!.macdHist;
  const b = i > 0 ? bars[i - 1]!.macdHist : null;
  const c = i > 1 ? bars[i - 2]!.macdHist : null;
  if (a == null) return false;
  if (a > 0) return true;
  return b != null && c != null && a > b && b > c;
}

export function macdFalling(bars: FeatureBar[], i: number): boolean {
  const a = bars[i]!.macdHist;
  const b = i > 0 ? bars[i - 1]!.macdHist : null;
  const c = i > 1 ? bars[i - 2]!.macdHist : null;
  if (a == null) return false;
  if (a < 0) return true;
  return b != null && c != null && a < b && b < c;
}

export function pulledBackLong(bar: FeatureBar): boolean {
  const { ema20, ema50, bbMid, bbLower, low, close } = bar;
  if (ema20 != null && low <= ema20 * 1.003) return true;
  if (ema50 != null && low <= ema50 * 1.003) return true;
  if (bbMid != null && low <= bbMid * 1.002) return true;
  if (bbLower != null && close <= bbLower * 1.01) return true;
  return false;
}

export function pulledBackShort(bar: FeatureBar): boolean {
  const { ema20, ema50, bbMid, bbUpper, high, close } = bar;
  if (ema20 != null && high >= ema20 * 0.997) return true;
  if (ema50 != null && high >= ema50 * 0.997) return true;
  if (bbMid != null && high >= bbMid * 0.998) return true;
  if (bbUpper != null && close >= bbUpper * 0.99) return true;
  return false;
}

export function bullishTrigger(bar: FeatureBar): boolean {
  const p = bar.pattern;
  if (p && p.direction === 1 && (p.name === "bullish_engulfing" || p.name === "pin_bar" || p.name === "hammer")) {
    return true;
  }
  if (bar.ema20 == null) return false;
  const range = bar.high - bar.low;
  const body = bar.close - bar.open;
  return bar.close > bar.ema20 && body > 0 && range > 0 && body >= 0.45 * range;
}

export function bearishTrigger(bar: FeatureBar): boolean {
  const p = bar.pattern;
  if (p && p.direction === -1 && (p.name === "bearish_engulfing" || p.name === "pin_bar" || p.name === "shooting_star")) {
    return true;
  }
  if (bar.ema20 == null) return false;
  const range = bar.high - bar.low;
  const body = bar.open - bar.close;
  return bar.close < bar.ema20 && body > 0 && range > 0 && body >= 0.45 * range;
}

export function bandwidthSqueezeRelease(bars: FeatureBar[], i: number): boolean {
  const bar = bars[i]!;
  if (bar.bbWidth == null || i < 21) return false;
  let sum = 0;
  let n = 0;
  for (let k = i - 20; k < i; k++) {
    const w = bars[k]!.bbWidth;
    if (w != null) {
      sum += w;
      n++;
    }
  }
  if (n < 10) return false;
  const avg = sum / n;
  const prev = bars[i - 1]!.bbWidth;
  return bar.bbWidth > 1.5 * avg && prev != null && bar.bbWidth > prev;
}
