/**
 * Chart overlay series — pure transforms from enriched bars for the /chart
 * indicator library. Causal by construction: value at i uses bars ≤ i (the
 * Ichimoku cloud is displaced BACK 26 bars, i.e. what TV plots under bar i).
 */
import { donchianMid, emaSeries, supertrendCore } from "../strategy/library.ts";
import type { FeatureBar } from "../types.ts";

export type Series = Array<number | null>;

export type BandSeries = { upper: Series; mid: Series; lower: Series };

/** Session VWAP, resetting each UTC day (typical price × volume). */
export function vwapSession(bars: FeatureBar[]): Series {
  const out: Series = new Array(bars.length).fill(null);
  let day = "";
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const d = new Date(b.time).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
    if (cumV > 0) out[i] = cumPV / cumV;
  }
  return out;
}

export function supertrendOverlay(bars: FeatureBar[], mult = 3, period = 10): { line: Series; dir: number[] } {
  return supertrendCore(bars, mult, period);
}

export function donchianOverlay(bars: FeatureBar[], length = 20): BandSeries {
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const upper: Series = new Array(bars.length).fill(null);
  const mid: Series = new Array(bars.length).fill(null);
  const lower: Series = new Array(bars.length).fill(null);
  for (let i = 0; i < bars.length; i++) {
    if (i < length - 1) continue;
    let hh = highs[i - length + 1]!;
    let ll = lows[i - length + 1]!;
    for (let k = i - length + 2; k <= i; k++) {
      if (highs[k]! > hh) hh = highs[k]!;
      if (lows[k]! < ll) ll = lows[k]!;
    }
    upper[i] = hh;
    lower[i] = ll;
    mid[i] = (hh + ll) / 2;
  }
  return { upper, mid, lower };
}

/** Ichimoku as plotted: tenkan/kijun at i, cloud at i = senkou computed at i−26. */
export function ichimokuOverlay(bars: FeatureBar[]): {
  tenkan: Series;
  kijun: Series;
  spanA: Series;
  spanB: Series;
} {
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const n = bars.length;
  const tenkan: Series = new Array(n).fill(null);
  const kijun: Series = new Array(n).fill(null);
  const spanA: Series = new Array(n).fill(null);
  const spanB: Series = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    tenkan[i] = donchianMid(highs, lows, i, 9);
    kijun[i] = donchianMid(highs, lows, i, 26);
    const j = i - 26;
    if (j >= 0) {
      const tj = donchianMid(highs, lows, j, 9);
      const kj = donchianMid(highs, lows, j, 26);
      const bj = donchianMid(highs, lows, j, 52);
      if (tj != null && kj != null && bj != null) {
        spanA[i] = (tj + kj) / 2;
        spanB[i] = bj;
      }
    }
  }
  return { tenkan, kijun, spanA, spanB };
}

export function keltnerOverlay(bars: FeatureBar[], length = 20, mult = 2, atrLength = 10): BandSeries {
  const closes = bars.map((b) => b.close);
  const n = bars.length;
  const mid = emaSeries(closes, length);
  const upper: Series = new Array(n).fill(null);
  const lower: Series = new Array(n).fill(null);
  // Wilder ATR(atrLength) over TR.
  const atr: Series = new Array(n).fill(null);
  if (n > atrLength) {
    let a = 0;
    for (let i = 1; i <= atrLength; i++) {
      a += Math.max(
        bars[i]!.high - bars[i]!.low,
        Math.abs(bars[i]!.high - closes[i - 1]!),
        Math.abs(bars[i]!.low - closes[i - 1]!),
      );
    }
    a /= atrLength;
    atr[atrLength] = a;
    for (let i = atrLength + 1; i < n; i++) {
      a =
        (a * (atrLength - 1) +
          Math.max(
            bars[i]!.high - bars[i]!.low,
            Math.abs(bars[i]!.high - closes[i - 1]!),
            Math.abs(bars[i]!.low - closes[i - 1]!),
          )) /
        atrLength;
      atr[i] = a;
    }
  }
  for (let i = 0; i < n; i++) {
    if (mid[i] != null && atr[i] != null) {
      upper[i] = mid[i]! + mult * atr[i]!;
      lower[i] = mid[i]! - mult * atr[i]!;
    }
  }
  return { upper, mid, lower };
}
