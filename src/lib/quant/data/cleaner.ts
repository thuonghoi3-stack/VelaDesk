import { INTERVAL_MS } from "../config";
import type { Ohlcv, Timeframe } from "../types";

const EPS = 1e-12;

function isValidBar(bar: Ohlcv): boolean {
  return (
    Number.isFinite(bar.open) &&
    Number.isFinite(bar.high) &&
    Number.isFinite(bar.low) &&
    Number.isFinite(bar.close) &&
    Number.isFinite(bar.volume) &&
    bar.high + EPS >= Math.max(bar.open, bar.close, bar.low) &&
    bar.low - EPS <= Math.min(bar.open, bar.close, bar.high) &&
    bar.volume >= 0
  );
}

/**
 * Sort by time, drop duplicates, clamp OHLC, forward-fill a single missing bar,
 * and flag gaps larger than 1.5 intervals.
 */
export function cleanOhlcv(raw: Ohlcv[], timeframe: Timeframe): Ohlcv[] {
  const interval = INTERVAL_MS[timeframe];
  const byTime = new Map<number, Ohlcv>();
  for (const bar of raw) {
    if (!isValidBar(bar)) continue;
    const t = Math.floor(bar.time / interval) * interval;
    byTime.set(t, {
      time: t,
      open: bar.open,
      high: Math.max(bar.high, bar.open, bar.close, bar.low),
      low: Math.min(bar.low, bar.open, bar.close, bar.high),
      close: bar.close,
      volume: bar.volume,
    });
  }

  const times = [...byTime.keys()].sort((a, b) => a - b);
  if (times.length === 0) return [];

  const out: Ohlcv[] = [];
  for (let i = 0; i < times.length; i++) {
    const t = times[i]!;
    const bar = byTime.get(t)!;
    if (i > 0) {
      const prev = out[out.length - 1]!;
      const dt = t - prev.time;
      if (dt > interval * 1.5 && dt <= interval * 2.5) {
        out.push({
          time: prev.time + interval,
          open: prev.close,
          high: prev.close,
          low: prev.close,
          close: prev.close,
          volume: 0,
          gap: true,
        });
      } else if (dt > interval * 2.5) {
        bar.gap = true;
      }
    }
    out.push(bar);
  }
  return out;
}
