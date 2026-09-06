/**
 * Drawing tools — pure helpers for the /chart overlay (TradingView-style).
 * Drawings are stored per symbol+timeframe with time/price anchors; the
 * chart component maps anchors to pixels via the lightweight-charts APIs.
 */

export type DrawingTool = "cursor" | "hline" | "trend" | "fib" | "erase";

export type DrawingPoint = { time: number; price: number };

export type DrawingKind = "hline" | "trend" | "fib";

export type Drawing = {
  id: string;
  kind: DrawingKind;
  points: DrawingPoint[];
  symbol: string;
  tf: string;
};

/** Fibonacci retracement ratios between two anchors (ordered low→high). */
export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

let seq = 1;

export function makeDrawing(kind: DrawingKind, points: DrawingPoint[], symbol: string, tf: string): Drawing {
  return {
    id: `d${Date.now().toString(36)}${(seq++).toString(36)}`,
    kind,
    points,
    symbol,
    tf,
  };
}

export function drawingStorageKey(symbol: string, tf: string): string {
  return `vela-drawings:${symbol}:${tf}`;
}

/** Price levels of a fib retracement drawn between two anchor prices. */
export function fibPrices(a: number, b: number): number[] {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const span = hi - lo;
  return FIB_LEVELS.map((r) => lo + r * span);
}

/** Shortest distance from point (px,py) to segment (x1,y1)→(x2,y2). */
export function distToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/** Eraser hit-test: distance in px from the click to a drawing's geometry. */
export function drawingHitPx(
  d: Drawing,
  px: number,
  py: number,
  toXY: (p: DrawingPoint) => { x: number; y: number } | null,
  width: number,
): number | null {
  const pts = d.points.map(toXY);
  if (pts.some((q) => q == null) || pts.length === 0) return null;
  if (d.kind === "hline") {
    return Math.abs(pts[0]!.y - py);
  }
  if (d.kind === "trend") {
    const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
    if (!b) return null;
    return distToSegment(px, py, a.x, a.y, b.x, b.y);
  }
  // fib: each level is a horizontal segment from anchor x1 to anchor x2.
  const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
  if (!b) return null;
  const prices = fibPrices(d.points[0]!.price, d.points[1]!.price);
  let best: number | null = null;
  for (const price of prices) {
    const y = toXY({ time: d.points[0]!.time, price })?.y;
    if (y == null) continue;
    const dist = distToSegment(px, py, Math.min(a.x, b.x), y, Math.max(a.x, b.x), y);
    if (best == null || dist < best) best = dist;
  }
  void width;
  return best;
}
