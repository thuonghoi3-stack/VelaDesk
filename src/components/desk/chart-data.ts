import type {
  CandlestickData,
  HistogramData,
  LineData,
  SeriesMarker,
  UTCTimestamp,
  WhitespaceData,
} from "lightweight-charts";
import type { FeatureBar, Trade } from "../../lib/quant/types.ts";

/** Execution markers require a candle at that second: never snap across gaps or expose future exits. */
export function buildChartMarkers(
  bars: readonly FeatureBar[],
  trades: readonly Trade[] = [],
): SeriesMarker<UTCTimestamp>[] {
  const times = new Set(bars.map((b) => chartTime(b.time)));
  const markers: SeriesMarker<UTCTimestamp>[] = bars
    .filter((b) => b.signal === 1 || b.signal === -1)
    .map((b) => ({
      time: chartTime(b.time),
      position: b.signal === 1 ? "belowBar" : "aboveBar",
      color: b.signal === 1 ? "#3d8b7a" : "#b85c4a",
      shape: b.signal === 1 ? "arrowUp" : "arrowDown",
      text: b.signal === 1 ? "L" : "S",
    }));
  for (const trade of trades) {
    const long = trade.side === "long";
    if (
      Number.isFinite(trade.entryTime) &&
      Number.isFinite(trade.entry) &&
      times.has(chartTime(trade.entryTime))
    ) {
      markers.push({
        id: `${trade.id}:entry`,
        time: chartTime(trade.entryTime),
        position: "atPriceMiddle",
        price: trade.entry,
        color: long ? "#3d8b7a" : "#b85c4a",
        shape: long ? "arrowUp" : "arrowDown",
        text: `${long ? "Long" : "Short"} entry ${trade.entry}`,
      });
    }
    if (
      Number.isFinite(trade.exitTime) &&
      Number.isFinite(trade.exit) &&
      times.has(chartTime(trade.exitTime))
    ) {
      markers.push({
        id: `${trade.id}:exit`,
        time: chartTime(trade.exitTime),
        position: "atPriceMiddle",
        price: trade.exit,
        color: "#d8d4cc",
        shape: "circle",
        text: `Exit ${trade.exit} · ${trade.reason}`,
      });
    }
  }
  return markers.sort((a, b) => a.time - b.time);
}

/** Canvas-only abbreviation. Keep full descriptions and exact prices in the semantic model. */
export function compactExecutionMarker(marker: SeriesMarker<UTCTimestamp>): SeriesMarker<UTCTimestamp> {
  if (marker.id?.endsWith(":entry")) return { ...marker, text: "Entry" };
  if (marker.id?.endsWith(":exit")) return { ...marker, text: "Exit" };
  return marker;
}

/** Incremental tail updates; any changed history, shrink, or replacement uses setData. */
export function syncSeries<T extends { time: unknown }>(
  series: { setData(data: T[]): void; update(point: T): void },
  previous: T[],
  next: T[],
): void {
  const equal = (a: T, b: T) => JSON.stringify(a) === JSON.stringify(b);
  if (
    !previous.length ||
    next.length < previous.length ||
    previous.some((p, i) =>
      i < previous.length - 1 ? !equal(p, next[i]) : p.time !== next[i]?.time,
    )
  ) {
    series.setData(next);
    return;
  }
  for (let i = previous.length - 1; i < next.length; i++) {
    if (i >= previous.length || !equal(previous[i], next[i])) series.update(next[i]);
  }
}

export const chartTime = (milliseconds: number) => Math.floor(milliseconds / 1000) as UTCTimestamp;
export type ChartData = {
  candle: CandlestickData<UTCTimestamp>[];
  ema20: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[];
  ema50: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[];
  bbUpper: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[];
  bbLower: (LineData<UTCTimestamp> | WhitespaceData<UTCTimestamp>)[];
  volume: HistogramData<UTCTimestamp>[];
  bars: FeatureBar[];
};

/** Chart-boundary sanitation only; feature computation remains upstream. Last duplicate wins. */
export function prepareChartData(input: readonly FeatureBar[]): ChartData {
  const byTime = new Map<number, FeatureBar>();
  for (const bar of input) {
    if (![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite)) continue;
    if (
      bar.high < Math.max(bar.open, bar.close, bar.low) ||
      bar.low > Math.min(bar.open, bar.close)
    )
      continue;
    byTime.set(chartTime(bar.time), bar);
  }
  const bars = [...byTime.values()].sort((a, b) => a.time - b.time);
  const line = (key: "ema20" | "ema50" | "bbUpper" | "bbLower") =>
    bars.map((b) =>
      b[key] != null && Number.isFinite(b[key])
        ? { time: chartTime(b.time), value: b[key]! }
        : { time: chartTime(b.time) },
    );
  return {
    bars,
    candle: bars.map((b) => ({
      time: chartTime(b.time),
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    })),
    ema20: line("ema20"),
    ema50: line("ema50"),
    bbUpper: line("bbUpper"),
    bbLower: line("bbLower"),
    volume: bars.map((b) => ({
      time: chartTime(b.time),
      value: Number.isFinite(b.volume) ? Math.max(0, b.volume) : 0,
      color: b.close >= b.open ? "rgba(61,139,122,0.35)" : "rgba(184,92,74,0.35)",
    })),
  };
}
