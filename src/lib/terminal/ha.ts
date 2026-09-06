import type { Ohlcv } from "@/lib/quant/types.ts";

export type HaBar = { time: number; open: number; high: number; low: number; close: number };

/**
 * Heikin Ashi transform (TradingView formula):
 *   HA close = (o + h + l + c) / 4
 *   HA open  = (prev HA open + prev HA close) / 2, seeded with (o + c) / 2
 *   HA high  = max(h, HA open, HA close); HA low = min(l, HA open, HA close)
 */
export function heikinAshi(bars: Ohlcv[]): HaBar[] {
  const out: HaBar[] = [];
  let prevOpen = 0;
  let prevClose = 0;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const haClose = (b.open + b.high + b.low + b.close) / 4;
    const haOpen = i === 0 ? (b.open + b.close) / 2 : (prevOpen + prevClose) / 2;
    const haHigh = Math.max(b.high, haOpen, haClose);
    const haLow = Math.min(b.low, haOpen, haClose);
    out.push({ time: b.time, open: haOpen, high: haHigh, low: haLow, close: haClose });
    prevOpen = haOpen;
    prevClose = haClose;
  }
  return out;
}
