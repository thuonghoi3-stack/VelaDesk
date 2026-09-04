import { useEffect, useRef } from "react";
import type { FeatureBar } from "@/lib/quant/types";

type Props = { bars: FeatureBar[] };

export function CandleChart({ bars }: Props) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let chart: { remove: () => void } | null = null;
    let ro: ResizeObserver | null = null;

    void import("lightweight-charts").then((lc) => {
      if (disposed || !host.current) return;
      const node = host.current;
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
        },
        crosshair: {
          horzLine: { color: "rgba(216,212,204,0.35)" },
          vertLine: { color: "rgba(216,212,204,0.35)" },
        },
        autoSize: true,
      });
      chart = created;

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
      const bbU = created.addSeries(lc.LineSeries, {
        color: "rgba(216,212,204,0.35)",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
      });
      const bbL = created.addSeries(lc.LineSeries, {
        color: "rgba(216,212,204,0.35)",
        lineWidth: 1,
        lineStyle: 2,
        priceLineVisible: false,
      });
      const vol = created.addSeries(lc.HistogramSeries, {
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
      });
      created.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
        borderVisible: false,
      });

      type Ts = import("lightweight-charts").UTCTimestamp;
      const ts = (t: number) => Math.floor(t / 1000) as Ts;
      candle.setData(
        bars.map((b) => ({ time: ts(b.time), open: b.open, high: b.high, low: b.low, close: b.close })),
      );
      ema20.setData(bars.filter((b) => b.ema20 != null).map((b) => ({ time: ts(b.time), value: b.ema20! })));
      ema50.setData(bars.filter((b) => b.ema50 != null).map((b) => ({ time: ts(b.time), value: b.ema50! })));
      bbU.setData(bars.filter((b) => b.bbUpper != null).map((b) => ({ time: ts(b.time), value: b.bbUpper! })));
      bbL.setData(bars.filter((b) => b.bbLower != null).map((b) => ({ time: ts(b.time), value: b.bbLower! })));
      vol.setData(
        bars.map((b) => ({
          time: ts(b.time),
          value: b.volume,
          color: b.close >= b.open ? "rgba(61,139,122,0.35)" : "rgba(184,92,74,0.35)",
        })),
      );
      lc.createSeriesMarkers(
        candle,
        bars
          .filter((b) => b.signal !== 0)
          .map((b) => ({
            time: ts(b.time),
            position: (b.signal === 1 ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
            color: b.signal === 1 ? "#3d8b7a" : "#b85c4a",
            shape: (b.signal === 1 ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
            text: b.signal === 1 ? "L" : "S",
          })),
      );
      created.timeScale().fitContent();
      ro = new ResizeObserver(() => created.applyOptions({ width: node.clientWidth }));
      ro.observe(node);
    });

    return () => {
      disposed = true;
      ro?.disconnect();
      chart?.remove();
    };
  }, [bars]);

  return <div ref={host} className="h-[280px] w-full overflow-hidden rounded-lg bg-surface md:h-[380px]" />;
}
