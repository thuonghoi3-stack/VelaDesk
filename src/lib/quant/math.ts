/** Small numeric helpers shared by indicators, risk, and backtest. */

export const EPS = 1e-12;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lastFinite(values: Array<number | null>, from: number): number | null {
  for (let i = from; i >= 0; i--) {
    const v = values[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

export function smaAt(src: number[], i: number, period: number): number | null {
  if (i + 1 < period) return null;
  let sum = 0;
  for (let k = i - period + 1; k <= i; k++) sum += src[k]!;
  return sum / period;
}

export function stdevAt(src: number[], i: number, period: number, ddof = 0): number | null {
  const mean = smaAt(src, i, period);
  if (mean == null) return null;
  let acc = 0;
  for (let k = i - period + 1; k <= i; k++) {
    const d = src[k]! - mean;
    acc += d * d;
  }
  const n = period - ddof;
  if (n <= 0) return null;
  return Math.sqrt(acc / n);
}

export function rollingMin(src: number[], i: number, period: number): number | null {
  if (i + 1 < period) return null;
  let m = src[i - period + 1]!;
  for (let k = i - period + 2; k <= i; k++) if (src[k]! < m) m = src[k]!;
  return m;
}

export function rollingMax(src: number[], i: number, period: number): number | null {
  if (i + 1 < period) return null;
  let m = src[i - period + 1]!;
  for (let k = i - period + 2; k <= i; k++) if (src[k]! > m) m = src[k]!;
  return m;
}

/** Seeded PRNG — mulberry32. Deterministic synthetic candles. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
