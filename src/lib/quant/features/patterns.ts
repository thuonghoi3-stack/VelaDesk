import type { FeatureBar, PatternHit, PatternName } from "../types";

function body(bar: FeatureBar): number {
  return Math.abs(bar.close - bar.open);
}

function range(bar: FeatureBar): number {
  return Math.max(bar.high - bar.low, 1e-12);
}

function upperWick(bar: FeatureBar): number {
  return bar.high - Math.max(bar.open, bar.close);
}

function lowerWick(bar: FeatureBar): number {
  return Math.min(bar.open, bar.close) - bar.low;
}

function strength01(value: number, lo: number, hi: number): number {
  return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}

/**
 * Rule-based candle patterns at bar i using only bars <= i.
 * Returns the strongest pattern for that bar, or null.
 */
export function detectPattern(bars: FeatureBar[], i: number): PatternHit | null {
  if (i < 0 || i >= bars.length) return null;
  const c = bars[i]!;
  const r = range(c);
  const b = body(c);
  const uw = upperWick(c);
  const lw = lowerWick(c);
  const hits: PatternHit[] = [];

  // Doji: tiny body vs range
  if (b / r <= 0.1) {
    hits.push({
      name: "doji",
      direction: 0,
      strength: strength01(1 - b / r, 0.9, 1),
      index: i,
    });
  }

  // Hammer / pin bar bullish: long lower wick, close in upper third
  const closePos = (c.close - c.low) / r;
  if (lw >= 2 * b && lw >= 0.55 * r && closePos >= 0.66 && c.close >= c.open) {
    hits.push({
      name: "hammer",
      direction: 1,
      strength: strength01(lw / r, 0.55, 0.8),
      index: i,
    });
    hits.push({
      name: "pin_bar",
      direction: 1,
      strength: strength01(lw / r, 0.5, 0.78),
      index: i,
    });
  }

  // Shooting star / pin bar bearish
  const closeFromHigh = (c.high - c.close) / r;
  if (uw >= 2 * b && uw >= 0.55 * r && closeFromHigh >= 0.66 && c.close <= c.open) {
    hits.push({
      name: "shooting_star",
      direction: -1,
      strength: strength01(uw / r, 0.55, 0.8),
      index: i,
    });
    hits.push({
      name: "pin_bar",
      direction: -1,
      strength: strength01(uw / r, 0.5, 0.78),
      index: i,
    });
  }

  if (i >= 1) {
    const p = bars[i - 1]!;
    const pb = body(p);
    const prevBull = p.close > p.open;
    const prevBear = p.close < p.open;
    const currBull = c.close > c.open;
    const currBear = c.close < c.open;
    const pTop = Math.max(p.open, p.close);
    const pBot = Math.min(p.open, p.close);
    const cTop = Math.max(c.open, c.close);
    const cBot = Math.min(c.open, c.close);

    if (prevBear && currBull && cBot <= pBot && cTop >= pTop && b > pb) {
      hits.push({
        name: "bullish_engulfing",
        direction: 1,
        strength: strength01(b / (pb + 1e-12), 1, 2.2),
        index: i,
      });
    }
    if (prevBull && currBear && cBot <= pBot && cTop >= pTop && b > pb) {
      hits.push({
        name: "bearish_engulfing",
        direction: -1,
        strength: strength01(b / (pb + 1e-12), 1, 2.2),
        index: i,
      });
    }

    // Inside bar
    if (c.high < p.high && c.low > p.low) {
      hits.push({
        name: "inside_bar",
        direction: 0,
        strength: strength01((p.high - p.low - r) / (p.high - p.low), 0, 0.5),
        index: i,
      });
    }
  }

  if (hits.length === 0) return null;
  hits.sort((a, b2) => b2.strength - a.strength);
  return hits[0]!;
}

export function applyPatterns(bars: FeatureBar[]): PatternHit[] {
  const found: PatternHit[] = [];
  for (let i = 1; i < bars.length; i++) {
    const hit = detectPattern(bars, i);
    bars[i]!.pattern = hit;
    if (hit && hit.strength >= 0.35) found.push(hit);
  }
  return found;
}

export const PATTERN_LABEL: Record<PatternName, string> = {
  pin_bar: "Pin bar",
  hammer: "Hammer",
  shooting_star: "Shooting star",
  bullish_engulfing: "Bullish engulfing",
  bearish_engulfing: "Bearish engulfing",
  inside_bar: "Inside bar",
  doji: "Doji",
};
