import { useEffect, useRef, useState } from "react";
import type { IChartApi, LogicalRange } from "lightweight-charts";
import type { FeatureBar, Trade } from "@/lib/quant/types";
import { buildChartMarkers, compactExecutionMarker, chartTime, prepareChartData, syncSeries } from "./chart-data";

export type CandleChartProps = {
  bars: FeatureBar[];
  /** Epoch milliseconds. Applied once per changed pair, not on every replay tick. */
  focusRange?: { from: number; to: number };
  /** Increment for an explicit refocus of unchanged endpoints; ordinary updates preserve zoom. */
  focusRequestKey?: number;
  /** Actual executions for this chart's symbol. No inferred stop/target levels. */
  trades?: Trade[];
  /** Change only when dataset identity changes and an initial fit is desired. */
  datasetKey?: string;
};
let nextInstance = 0;

export function CandleChart(props: CandleChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  const sync = useRef<(() => void) | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  const { bars, trades, focusRange, focusRequestKey, datasetKey } = props;
  // Publish committed props even while the chart module is loading.
  useEffect(() => {
    latest.current = { bars, trades, focusRange, focusRequestKey, datasetKey };
    sync.current?.();
  }, [bars, trades, focusRange, focusRequestKey, datasetKey]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let disposed = false;
    let chart: IChartApi | undefined;
    let unsubscribe: (() => void) | undefined;
    void import("lightweight-charts")
      .then((lc) => {
        if (disposed) return;
        const created = lc.createChart(node, {
          layout: {
            background: { type: lc.ColorType.Solid, color: "#12141a" },
            textColor: "#8b8d94",
            fontFamily: "IBM Plex Sans, sans-serif",
            fontSize: 11,
          },
          grid: {
            vertLines: { color: "rgba(232,230,225,0.05)" },
            horzLines: { color: "rgba(232,230,225,0.05)" },
          },
          rightPriceScale: { borderColor: "rgba(232,230,225,0.08)" },
          timeScale: {
            borderColor: "rgba(232,230,225,0.08)",
            timeVisible: true,
            secondsVisible: false,
            shiftVisibleRangeOnNewBar: false,
          },
          crosshair: {
            horzLine: { color: "rgba(216,212,204,0.35)" },
            vertLine: { color: "rgba(216,212,204,0.35)" },
          },
          autoSize: true,
        });
        chart = created;
        node.dataset.chartInstance = String(++nextInstance);
        const candle = created.addSeries(lc.CandlestickSeries, {
          upColor: "#3d8b7a",
          downColor: "#b85c4a",
          borderVisible: false,
          wickUpColor: "#3d8b7a",
          wickDownColor: "#b85c4a",
        });
        const ema20 = created.addSeries(lc.LineSeries, {
          color: "#d8d4cc",
          lineWidth: 1,
          priceLineVisible: false,
        });
        const ema50 = created.addSeries(lc.LineSeries, {
          color: "#7a8799",
          lineWidth: 1,
          priceLineVisible: false,
        });
        const bbUpper = created.addSeries(lc.LineSeries, {
          color: "rgba(216,212,204,0.35)",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
        });
        const bbLower = created.addSeries(lc.LineSeries, {
          color: "rgba(216,212,204,0.35)",
          lineWidth: 1,
          lineStyle: 2,
          priceLineVisible: false,
        });
        const volume = created.addSeries(lc.HistogramSeries, {
          priceFormat: { type: "volume" },
          priceScaleId: "vol",
        });
        created
          .priceScale("vol")
          .applyOptions({ scaleMargins: { top: 0.82, bottom: 0 }, borderVisible: false });
        const updateBadges = () => {
          const visible = node.clientWidth >= 640;
          for (const series of [ema20, ema50, bbUpper, bbLower, volume]) {
            series.applyOptions({ lastValueVisible: visible });
          }
          node.dataset.secondaryBadges = visible ? "visible" : "hidden";
        };
        updateBadges();
        const badgeObserver = new ResizeObserver(updateBadges);
        badgeObserver.observe(node);
        const markers = lc.createSeriesMarkers(candle, [], { autoScale: false });
        const scale = created.timeScale();
        let previous = prepareChartData([]);
        let previousBars: FeatureBar[] | undefined;
        let fitted = false;
        let key = latest.current.datasetKey;
        let appliedFocus: string | undefined;
        let savedRange: LogicalRange | null = null;
        const reportRange = (range: LogicalRange | null) => {
          if (range) savedRange = range;
          node.dataset.visibleLogicalRange = JSON.stringify(range);
        };
        scale.subscribeVisibleLogicalRangeChange(reportRange);
        unsubscribe = () => {
          badgeObserver.disconnect();
          scale.unsubscribeVisibleLogicalRangeChange(reportRange);
          markers.detach();
        };
        sync.current = () => {
          if (disposed) return;
          const current = latest.current;
          const reset = key !== current.datasetKey;
          if (reset) {
            key = current.datasetKey;
            fitted = false;
            appliedFocus = undefined;
            savedRange = null;
          }
          const range = reset ? null : (scale.getVisibleLogicalRange() ?? savedRange);
          const dataChanged = previousBars !== current.bars || reset;
          const data = dataChanged ? prepareChartData(current.bars) : previous;
          if (dataChanged) {
            // Clear first: a rewind must never leave future executions on the series.
            markers.setMarkers([]);
            syncSeries(candle, previous.candle, data.candle);
            syncSeries(ema20, previous.ema20, data.ema20);
            syncSeries(ema50, previous.ema50, data.ema50);
            syncSeries(bbUpper, previous.bbUpper, data.bbUpper);
            syncSeries(bbLower, previous.bbLower, data.bbLower);
            syncSeries(volume, previous.volume, data.volume);
            previous = data;
            previousBars = current.bars;
          }
          const nextMarkers = buildChartMarkers(data.bars, current.trades);
          markers.setMarkers(nextMarkers.map(compactExecutionMarker));
          node.setAttribute("aria-label", `Price chart with EMA, Bollinger bands, volume and trade executions. ${nextMarkers.filter(m => m.id).map(m => `${m.id}: ${m.text}`).join("; ")}`);
          node.dataset.barCount = String(data.candle.length);
          node.dataset.markerCount = String(nextMarkers.length);
          const focus = current.focusRange;
          const validFocus =
            focus &&
            Number.isFinite(focus.from) &&
            Number.isFinite(focus.to) &&
            focus.from <= focus.to;
          const focusKey = validFocus
            ? `${focus.from}:${focus.to}:${current.focusRequestKey ?? 0}`
            : undefined;
          if (!focusKey) appliedFocus = undefined;
          if (data.candle.length) {
            if (!fitted) {
              scale.fitContent();
              fitted = true;
            } else if (dataChanged && range) scale.setVisibleLogicalRange(range);
            if (validFocus && focusKey !== appliedFocus) {
              const from = Math.max(chartTime(focus.from), data.candle[0].time);
              const to = Math.min(chartTime(focus.to), data.candle[data.candle.length - 1].time);
              // Defer unavailable focus until replay/data reaches it.
              if (from <= to) {
                scale.setVisibleRange({ from: chartTime(from * 1000), to: chartTime(to * 1000) });
                appliedFocus = focusKey;
              }
            }
          }
          reportRange(scale.getVisibleLogicalRange());
        };
        sync.current();
        setStatus("ready");
      })
      .catch((error) => {
        if (disposed) return;
        sync.current = null;
        unsubscribe?.();
        unsubscribe = undefined;
        chart?.remove();
        chart = undefined;
        node.dataset.chartError = error instanceof Error ? error.message : String(error);
        setStatus("error");
      });
    return () => {
      disposed = true;
      sync.current = null;
      unsubscribe?.();
      chart?.remove();
      // autoSize owns and disposes its ResizeObserver with the chart.
    };
  }, []);

  return (
    <div className="relative">
      <div
        ref={host}
        data-testid="candle-chart"
        data-chart-status={status}
        role="img"
        aria-label="Price chart with EMA, Bollinger bands, volume and trade executions"
        className="h-[280px] w-full overflow-hidden rounded-lg bg-surface md:h-[380px]"
      />
      {status !== "ready" && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted"
        >
          {status === "error" ? "Chart unavailable. Reload to retry." : "Loading chart…"}
        </div>
      )}
      {status === "ready" && props.bars.length === 0 && (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted"
        >
          No candles in this view.
        </div>
      )}
    </div>
  );
}
