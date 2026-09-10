import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  BellRing,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Eraser,
  Gauge,
  LoaderCircle,
  Minus,
  MousePointer2,
  Pause,
  Play,
  Ruler,
  Search,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Badge } from "@/components/ui/badge";
import { Watchlist, useQuotes } from "@/components/terminal/watchlist";
import { barBudget as budgetFor, defaultConfig, htfBudget, HTF_FOR, TIMEFRAMES } from "@/lib/quant/config";
import { STRATEGY_SELECT_OPTIONS } from "@/lib/quant/strategy/library";
import type { DeskConfig, MarketType, Ohlcv } from "@/lib/quant/types";
import { loadOhlcv } from "@/lib/quant/data/load-ohlcv";
import { searchSymbols } from "@/lib/quant/data/symbols";
import { getSourcePref, setSourcePref, getLastOkSource, setLastOkSource, type SourcePref } from "@/lib/terminal/data-prefs";
import { buildDesk } from "@/lib/quant/pipeline";
import {
  donchianOverlay,
  ichimokuOverlay,
  keltnerOverlay,
  supertrendOverlay,
  vwapSession,
} from "@/lib/quant/features/overlay";
import type { DataSource, FeatureBar, Timeframe } from "@/lib/quant/types";
import { cn, formatDateUtc } from "@/lib/utils";
import { alertLabel, evaluateAlerts, makeAlert, type AlertKind } from "@/lib/terminal/alerts-core";
import { useAlerts } from "@/lib/terminal/alerts-store";
import { heikinAshi } from "@/lib/terminal/ha";
import {
  drawingHitPx,
  drawingStorageKey,
  fibPrices,
  makeDrawing,
  FIB_LEVELS,
  type Drawing,
  type DrawingTool,
} from "@/lib/terminal/drawings";

type ChartType = "candles" | "heikin" | "line" | "area" | "baseline";

export type IndicatorId =
  | "ema"
  | "bb"
  | "vwap"
  | "supertrend"
  | "donchian"
  | "ichimoku"
  | "keltner"
  | "vol"
  | "rsi"
  | "macd"
  | "stoch"
  | "adx"
  | "obv"
  | "atr";

/** TV-style indicator catalog: overlays draw on the price pane, the rest open their own pane. */
export const INDICATOR_CATALOG: { id: IndicatorId; name: string; group: "Overlay" | "Pane"; def?: boolean }[] = [
  { id: "ema", name: "EMA 20/50/200", group: "Overlay", def: true },
  { id: "bb", name: "Bollinger Bands (20, 2)", group: "Overlay", def: true },
  { id: "vwap", name: "VWAP (theo ngày UTC)", group: "Overlay" },
  { id: "supertrend", name: "Supertrend (10, 3)", group: "Overlay" },
  { id: "donchian", name: "Donchian (20)", group: "Overlay" },
  { id: "ichimoku", name: "Ichimoku (9/26/52)", group: "Overlay" },
  { id: "keltner", name: "Keltner (EMA20 ± 2×ATR10)", group: "Overlay" },
  { id: "vol", name: "Volume", group: "Pane", def: true },
  { id: "rsi", name: "RSI (14)", group: "Pane", def: true },
  { id: "macd", name: "MACD (12/26/9)", group: "Pane" },
  { id: "stoch", name: "Stochastic (14/3)", group: "Pane" },
  { id: "adx", name: "ADX (14)", group: "Pane" },
  { id: "obv", name: "OBV", group: "Pane" },
  { id: "atr", name: "ATR (14)", group: "Pane" },
];

/** Indicator toggles persist across sessions (TV-like workspace memory). */
const useChartPrefs = create<{
  indicators: Record<IndicatorId, boolean>;
  setIndicator: (id: IndicatorId, v: boolean) => void;
}>()(
  persist(
    (set) => ({
      indicators: Object.fromEntries(INDICATOR_CATALOG.map((i) => [i.id, i.def ?? false])) as Record<
        IndicatorId,
        boolean
      >,
      setIndicator: (id, v) => set((s) => ({ indicators: { ...s.indicators, [id]: v } })),
    }),
    { name: "vela-indicators", version: 1 },
  ),
);

const PANE_ORDER: IndicatorId[] = ["vol", "rsi", "macd", "stoch", "adx", "obv", "atr"];

const TF_LABEL: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "1d": "1D",
  "1w": "1W",
};

const CHART_TYPES: { id: ChartType; label: string }[] = [
  { id: "candles", label: "Nến" },
  { id: "heikin", label: "Heikin Ashi" },
  { id: "line", label: "Line" },
  { id: "area", label: "Area" },
  { id: "baseline", label: "Baseline" },
];

const ALERT_KIND_OPTIONS: { id: AlertKind; label: string }[] = [
  { id: "price_above", label: "Giá ≥ mức" },
  { id: "price_below", label: "Giá ≤ mức" },
  { id: "rsi_above", label: "RSI ≥ mức" },
  { id: "rsi_below", label: "RSI ≤ mức" },
  { id: "pct_up", label: "24h tăng ≥" },
  { id: "pct_down", label: "24h giảm ≥" },
];

const TOOL_BUTTONS: { id: DrawingTool; icon: typeof MousePointer2; title: string }[] = [
  { id: "cursor", icon: MousePointer2, title: "Con trỏ" },
  { id: "hline", icon: Minus, title: "Đường ngang" },
  { id: "trend", icon: TrendingUp, title: "Trendline (2 điểm)" },
  { id: "fib", icon: Ruler, title: "Fibonacci retracement (2 điểm)" },
  { id: "erase", icon: Eraser, title: "Xóa một đường (bấm gần đường)" },
];

export function ChartWorkspace({
  initialSymbol,
  initialTf,
}: {
  initialSymbol?: string;
  initialTf?: Timeframe;
}) {
  const [symbol, setSymbol] = useState(initialSymbol ?? "BTC/USDT");
  const [tf, setTf] = useState<Timeframe>(initialTf ?? "1h");
  const [chartType, setChartType] = useState<ChartType>("candles");
  const indicators = useChartPrefs((s) => s.indicators);
  const setIndicator = useChartPrefs((s) => s.setIndicator);
  const [indicatorDialog, setIndicatorDialog] = useState(false);
  const [symbolSearch, setSymbolSearch] = useState(false);
  const [strategyId, setStrategyId] = useState<DeskConfig["strategyId"]>("combo");
  const [bars, setBars] = useState<FeatureBar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<DataSource | null>(null);
  const [hovered, setHovered] = useState<FeatureBar | null>(null);
  const [alertMode, setAlertMode] = useState(false);
  const [tool, setTool] = useState<DrawingTool>("cursor");
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [replay, setReplay] = useState<{ index: number; playing: boolean } | null>(null);
  const [replayPick, setReplayPick] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(320);
  const [sourcePref, setSourcePrefState] = useState<SourcePref>(() => getSourcePref());
  const chartApiRef = useRef<{ takeScreenshot: () => HTMLCanvasElement } | null>(null);
  // Stable callback — an inline arrow here would rebuild the chart every render.
  const onApiReadyStable = useCallback((api: { takeScreenshot: () => HTMLCanvasElement }) => {
    chartApiRef.current = api;
  }, []);
  const loadSeq = useRef(0);

  const quotesPrice = useQuotes((s) => s.quotes[symbol]?.price ?? null);
  const quotesChange = useQuotes((s) => s.quotes[symbol]?.changePct ?? null);
  const alerts = useAlerts((s) => s.alerts);
  const applyEvaluation = useAlerts((s) => s.applyEvaluation);
  const markSignalSeen = useAlerts((s) => s.markSignalSeen);

  const replayIndex = replay?.index;
  const visibleBars = useMemo(
    () => replayIndex == null ? bars : bars.slice(0, replayIndex),
    [bars, replayIndex],
  );
  const lastBar = visibleBars[visibleBars.length - 1] ?? null;
  // Resolve against the visible dataset: future/stale crosshair objects cannot leak.
  const display = (hovered ? visibleBars.find((bar) => bar.time === hovered.time) : null) ?? lastBar;
  const liveAlertsEnabled = replay === null && !replayPick;
  const indKey = useMemo(
    () => INDICATOR_CATALOG.filter((i) => indicators[i.id]).map((i) => i.id).join(","),
    [indicators],
  );

  // Raw candles are kept so switching strategy only re-signals locally —
  // no refetch, the data is identical.
  const [raw, setRaw] = useState<{ ltf: Ohlcv[]; htf: Ohlcv[]; market: MarketType } | null>(null);

  const load = useCallback(
    async (
      sym: string,
      timeframe: Timeframe,
      sid: DeskConfig["strategyId"],
      preferredSource: "binance" | "okx" | null,
    ) => {
      const seq = ++loadSeq.current;
      setLoading(true);
      setError(null);
      try {
        const htf = HTF_FOR[timeframe];
        const bundle = await loadOhlcv({
          data: {
            symbol: sym,
            ltf: timeframe,
            htf,
            market: "usdm",
            ltfBars: budgetFor(timeframe),
            htfBars: htfBudget(htf),
            // null (chưa có last-ok) phải được OMIT — zod .nullish() chịu,null
            // nhưng cứ omit cho sạch.
            ...(preferredSource ? { preferred: preferredSource } : {}),
          },
        });
        if (loadSeq.current !== seq) return;
        if (bundle.source === "binance" || bundle.source === "okx") {
          setLastOkSource(bundle.source);
        }
        setRaw({ ltf: bundle.ltf, htf: bundle.htf, market: bundle.market });
        setSource(bundle.source);
        setLoading(false);
        setReplay(null);
        const cfg = defaultConfig({
          symbol: sym,
          ltf: timeframe,
          htf,
          market: bundle.market,
          warmup: 220,
          strategyId: sid,
        });
        setBars(buildDesk(bundle.ltf, bundle.htf, cfg).ltf);
      } catch (err) {
        if (loadSeq.current !== seq) return;
        setError(err instanceof Error ? err.message : "Không tải được nến");
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    // Sticky source: "auto" tries whatever worked last time first.
    void load(symbol, tf, strategyId, sourcePref === "auto" ? getLastOkSource() : sourcePref);
  }, [symbol, tf, strategyId, sourcePref, load]);

  // Strategy switch: re-signal the raw candles in place (ms, no refetch).
  useEffect(() => {
    if (!raw) return;
    const cfg = defaultConfig({
      symbol,
      ltf: tf,
      htf: HTF_FOR[tf],
      market: raw.market,
      warmup: 220,
      strategyId,
    });
    setBars(buildDesk(raw.ltf, raw.htf, cfg).ltf);
  }, [strategyId, raw, symbol, tf]);

  // Drawings persist per symbol + timeframe (localStorage).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(drawingStorageKey(symbol, tf));
      setDrawings(raw ? (JSON.parse(raw) as Drawing[]) : []);
    } catch {
      setDrawings([]);
    }
  }, [symbol, tf]);

  useEffect(() => {
    try {
      localStorage.setItem(drawingStorageKey(symbol, tf), JSON.stringify(drawings));
    } catch {
      /* storage full/unavailable — drawings stay in memory */
    }
  }, [drawings, symbol, tf]);

  // Alerts evaluate wherever fresh context lands: ticker poll (price + 24h
  // change) and data reloads (RSI of the last closed bar).
  useEffect(() => {
    if (!liveAlertsEnabled || (quotesPrice == null && quotesChange == null)) return;
    const { fired, remaining } = evaluateAlerts(alerts, symbol, {
      price: quotesPrice,
      changePct: quotesChange == null ? null : quotesChange / 100,
    });
    if (fired.length === 0) return;
    applyEvaluation({ fired, remaining });
    for (const f of fired) {
      toast.warning(`${f.symbol} alert ${alertLabel(f)}`, {
        description: "Mức đã chạm — kiểm tra chart.",
      });
    }
  }, [liveAlertsEnabled, quotesPrice, quotesChange, symbol, alerts, applyEvaluation]);

  useEffect(() => {
    if (!liveAlertsEnabled) return;
    const last = lastBar;
    if (!last || last.rsi == null) return;
    const { fired, remaining } = evaluateAlerts(alerts, symbol, { rsi: last.rsi });
    if (fired.length === 0) return;
    applyEvaluation({ fired, remaining });
    for (const f of fired) {
      toast.warning(`${f.symbol} alert ${alertLabel(f)}`, {
        description: `RSI nến đóng cuối: ${last.rsi.toFixed(1)}`,
      });
    }
  }, [liveAlertsEnabled, lastBar, symbol, alerts, applyEvaluation]);

  // One toast per closed bar that carries an entry signal (no repeats).
  useEffect(() => {
    if (!liveAlertsEnabled) return;
    const last = lastBar;
    if (!last || last.signal === 0) return;
    const key = `${symbol}|${tf}|${last.time}`;
    if (useAlerts.getState().seenSignals.includes(key)) return;
    markSignalSeen(key);
    toast.message(`Signal ${last.signal === 1 ? "LONG" : "SHORT"} ${symbol}`, {
      description: `${last.strategy} · close ${last.close.toFixed(2)} · ${last.signalReason || "đủ rule"}`,
    });
  }, [liveAlertsEnabled, lastBar, symbol, tf, markSignalSeen]);

  // Bar replay playback.
  useEffect(() => {
    if (!replay?.playing) return;
    const id = window.setInterval(() => {
      setReplay((r) => {
        if (!r || !r.playing) return r;
        const index = Math.min(bars.length, r.index + 1);
        return { index, playing: index < bars.length };
      });
    }, replaySpeed);
    return () => window.clearInterval(id);
  }, [replay?.playing, bars.length, replaySpeed]);

  const toggleReplay = useCallback(() => {
    setHovered(null);
    if (replay || replayPick) {
      setReplay(null);
      setReplayPick(false);
      return;
    }
    if (bars.length === 0) return;
    setAlertMode(false);
    // TV-style: first press arms the pick mode — click a bar to start there.
    setReplayPick(true);
  }, [replay, replayPick, bars.length]);

  // Keyboard shortcuts: 1–8 timeframes, A alerts, R replay, "/" symbol search.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement | null)?.tagName ?? "";
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey ||
          (e.target as HTMLElement | null)?.isContentEditable ||
          ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(tag)) return;
      const tfMap: Record<string, Timeframe> = {
        "1": "15m",
        "2": "1h",
        "3": "4h",
        "4": "1d",
        "5": "5m",
        "6": "30m",
        "7": "2h",
        "8": "1w",
      };
      if (tfMap[e.key]) setTf(tfMap[e.key]!);
      else if (e.key.toLowerCase() === "a") setAlertMode((v) => !v);
      else if (e.key.toLowerCase() === "r") toggleReplay();
      else if (e.key === " ") {
        // Space toggles replay playback (TV-like).
        e.preventDefault();
        setReplay((r) => (r ? { ...r, playing: !r.playing } : r));
      }
      else if (e.key === "/") {
        e.preventDefault();
        setSymbolSearch(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleReplay]);

  const onCreateAlert = useCallback(
    (price: number) => {
      const a = makeAlert(symbol, "price_above", price, lastBar?.close ?? null, `vẽ từ chart ${tf}`);
      useAlerts.getState().add(a);
      toast.success(`Alert ${symbol} ${alertLabel(a)}`, {
        description: a.kind === "price_above" ? "Báo khi giá ≥ mức" : "Báo khi giá ≤ mức",
      });
    },
    [symbol, tf, lastBar],
  );

  function snapshot() {
    const canvas = chartApiRef.current?.takeScreenshot();
    if (!canvas) {
      toast.error("Chart chưa sẵn sàng để chụp.");
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `vela-${symbol.replace("/", "")}-${tf}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Đã tải ảnh chart PNG.");
    }, "image/png");
  }


  return (
    <div className="flex h-[calc(100dvh-2.75rem)] min-h-0">
      <aside className="hidden w-56 shrink-0 border-r border-border md:block">
        <Watchlist active={symbol} onSelect={setSymbol} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border px-2 py-1.5">
          <button
            type="button"
            onClick={() => setSymbolSearch(true)}
            className="flex h-8 items-center gap-1 rounded-md bg-surface-2 px-2 font-display text-sm text-fg hover:text-accent md:px-3 md:text-lg"
            title="Tìm symbol (phím /)"
          >
            <Search className="size-3.5 text-muted" />
            {symbol.replace("/USDT", "")}
          </button>
          <span className="hidden text-[10px] text-subtle uppercase md:inline">USDT-M</span>

          <div className="mx-1 h-5 w-px bg-border" />

          {TIMEFRAMES.map((t, idx) => (
            <button
              key={t}
              type="button"
              onClick={() => setTf(t)}
              title={`Phím ${idx + 1}`}
              className={cn(
                "h-8 rounded-md px-2 text-xs",
                tf === t ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
            >
              {TF_LABEL[t]}
            </button>
          ))}

          <div className="mx-1 h-5 w-px bg-border" />

          <select
            className="h-8 max-w-44 rounded-md bg-surface-2 px-2 text-xs text-fg"
            value={strategyId}
            onChange={(e) => setStrategyId(e.target.value as DeskConfig["strategyId"])}
            title="Chiến lược sinh signal trên chart"
          >
            {STRATEGY_SELECT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>

          <select
            className="h-8 rounded-md bg-surface-2 px-2 text-xs text-fg"
            value={chartType}
            onChange={(e) => setChartType(e.target.value as ChartType)}
          >
            {CHART_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <select
            className="h-8 rounded-md bg-surface-2 px-2 text-xs text-muted"
            value={sourcePref}
            onChange={(e) => {
              const v = e.target.value as SourcePref;
              setSourcePrefState(v);
              setSourcePref(v);
            }}
            title="Nguồn dữ liệu nến — Auto nhớ nguồn thành công gần nhất"
          >
            <option value="auto">Nguồn: Auto</option>
            <option value="binance">Binance</option>
            <option value="okx">OKX</option>
          </select>

          <button
            type="button"
            onClick={() => setIndicatorDialog(true)}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted hover:bg-surface-2 hover:text-fg"
            title="Thư viện chỉ báo"
          >
            <Gauge className="size-3.5" />
            f(x)
          </button>

          <div className="mx-1 hidden h-5 w-px bg-border md:block" />

          <div className="hidden items-center gap-1 md:flex" title="Công cụ vẽ">
            {TOOL_BUTTONS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTool(t.id)}
                className={cn(
                  "flex h-8 items-center rounded-md px-2 text-xs",
                  tool === t.id ? "bg-surface-2 text-fg" : "text-subtle hover:bg-surface-2 hover:text-muted",
                )}
                title={t.title}
              >
                <t.icon className="size-3.5" />
              </button>
            ))}
            {drawings.length > 0 ? (
              <button
                type="button"
                onClick={() => setDrawings([])}
                className="flex h-8 items-center rounded-md px-2 text-xs text-subtle hover:text-short"
                title="Xóa tất cả hình vẽ"
              >
                <Trash2 className="size-3.5" />
              </button>
            ) : null}
          </div>

          <div className="ml-auto flex items-center gap-2">
            {source ? <Badge tone={source === "synthetic" ? "warn" : "fg"}>{source}</Badge> : null}
            <button
              type="button"
              onClick={toggleReplay}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs",
                replay ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
              title="Bar replay (phím R)"
            >
              <Play className="size-3.5" />
              Replay
            </button>
            <button
              type="button"
              onClick={snapshot}
              className="hidden h-8 items-center rounded-md px-2 text-xs text-muted hover:bg-surface-2 hover:text-fg md:flex"
              title="Chụp ảnh chart PNG"
            >
              📷
            </button>
            <button
              type="button"
              onClick={() => setAlertMode((v) => !v)}
              className={cn(
                "flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs",
                alertMode ? "bg-warn/20 text-warn" : "text-muted hover:bg-surface-2 hover:text-fg",
              )}
              title="Bật rồi bấm lên chart để đặt alert tại giá (phím A)"
            >
              {alertMode ? <BellRing className="size-3.5" /> : <Bell className="size-3.5" />}
              Alert
            </button>
          </div>
        </div>

        {tool !== "cursor" ? (
          <p className="border-b border-border bg-accent/10 px-3 py-1 text-[11px] text-muted">
            {tool === "hline"
              ? "Bấm lên pane giá để đặt đường ngang."
              : tool === "trend"
                ? "Bấm 2 điểm để vẽ trendline."
                : tool === "fib"
                  ? "Bấm 2 điểm (đỉnh → đáy hoặc ngược lại) để vẽ Fibonacci retracement."
                  : "Bấm gần một đường để xóa nó."}
          </p>
        ) : null}
        {replay ? (
          <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 border-b border-border bg-surface px-3 py-1.5 text-xs">
            <span className="text-warn">REPLAY</span>
            <button
              type="button"
              onClick={() => setReplay((r) => (r ? { ...r, index: Math.max(1, r.index - 1) } : r))}
              className="rounded bg-surface-2 p-1 text-muted hover:text-fg"
              title="Lùi 1 nến"
            >
              <ChevronLeft className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setReplay((r) => (r ? { ...r, index: Math.min(bars.length, r.index + 1) } : r))}
              className="rounded bg-surface-2 p-1 text-muted hover:text-fg"
              title="Tới 1 nến"
            >
              <ChevronRight className="size-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setReplay((r) => (r ? { ...r, playing: !r.playing } : r))}
              className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-muted hover:text-fg"
            >
              {replay.playing ? <Pause className="size-3" /> : <Play className="size-3" />}
              {replay.playing ? "Dừng" : "Tự chạy"}
            </button>
            <select
              className="h-7 rounded-md bg-surface-2 px-2 text-[11px] text-fg"
              value={replaySpeed}
              onChange={(e) => setReplaySpeed(Number(e.target.value))}
              title="Tốc độ phát"
            >
              <option value={800}>0.4×</option>
              <option value={320}>1×</option>
              <option value={160}>2×</option>
              <option value={80}>4×</option>
            </select>
            <span className="font-mono tabular text-subtle">
              {replay.index} / {bars.length}
            </span>
            {bars[Math.max(0, replay.index - 1)] ? (
              <span className="hidden text-[11px] text-subtle md:inline">
                {formatDateUtc(bars[Math.max(0, replay.index - 1)]!.time)}
              </span>
            ) : null}
            <button
              type="button"
              onClick={() => setReplay((r) => (r ? { ...r, index: bars.length, playing: false } : r))}
              className="flex items-center gap-1 rounded bg-surface-2 px-2 py-1 text-muted hover:text-fg"
              title="Nhảy tới hiện tại"
            >
              <ChevronsRight className="size-3" />
              Hiện tại
            </button>
            <span className="w-full text-[11px] text-subtle sm:ml-auto sm:w-auto">Ẩn nến tương lai · tạm dừng alert trực tiếp.</span>
          </div>
        ) : null}

        {alertMode ? (
          <p className="border-b border-border bg-warn/10 px-3 py-1 text-[11px] text-warn">
            Chế độ alert: bấm vào chart (pane giá) để đặt báo thức tại mức giá đó.
          </p>
        ) : null}
        {replayPick ? (
          <p className="border-b border-border bg-accent/10 px-3 py-1 text-[11px] text-muted">
            Chế độ chọn replay: bấm lên chart (pane giá) tại nến muốn bắt đầu — nến sau đó sẽ bị ẩn.
          </p>
        ) : null}

        <div className="relative min-h-0 flex-1">
          <TermChart
            bars={visibleBars}
            chartType={chartType}
            indicators={indicators}
            indKey={indKey}
            alertMode={alertMode}
            tool={tool}
            drawings={drawings}
            replayPick={replayPick}
            replayBoundaryTime={
              replay ? (bars[Math.max(0, Math.min(replay.index, bars.length) - 1)]?.time ?? null) : null
            }
            onPickReplay={(idx) => {
              setReplayPick(false);
              setHovered(null);
              setReplay({ index: Math.min(Math.max(1, idx), bars.length), playing: false });
            }}
            onHover={setHovered}
            onCreateAlert={onCreateAlert}
            onAddDrawing={(d) => setDrawings((list) => [...list, d])}
            onDeleteDrawing={(id) => setDrawings((list) => list.filter((d) => d.id !== id))}
            onApiReady={onApiReadyStable}
          />
          <div className="pointer-events-none absolute left-3 right-3 top-2 z-10 flex flex-col gap-0.5 break-words font-mono text-[11px] tabular">
            <span className="text-fg">
              {symbol} · {TF_LABEL[tf]}
              {display ? ` · O ${display.open.toFixed(2)} H ${display.high.toFixed(2)} L ${display.low.toFixed(2)} C ${display.close.toFixed(2)}` : ""}
            </span>
            {display ? (
              <span className="text-muted">
                Chg {(((display.close - display.open) / display.open) * 100).toFixed(2)}% · Vol{" "}
                {Math.round(display.volume).toLocaleString("en-US")}
                {display.rsi != null ? ` · RSI ${display.rsi.toFixed(1)}` : ""}
                {display.atr != null ? ` · ATR ${display.atr.toFixed(2)}` : ""}
                {display.adx != null ? ` · ADX ${display.adx.toFixed(1)}` : ""}
              </span>
            ) : null}
          </div>
          {loading ? (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/60">
              <LoaderCircle className="size-6 animate-spin text-muted" />
            </div>
          ) : null}
          {error ? (
            <div className="absolute inset-x-0 top-0 z-20 bg-short/20 px-3 py-1 text-center text-xs text-short">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-border px-3 py-1 text-[11px] text-subtle">
          <span>
            {lastBar ? `Nến đóng ${formatDateUtc(lastBar.time)} · ${visibleBars.length.toLocaleString("en-US")} nến` : "Chưa có dữ liệu"}
          </span>
          <span className="hidden md:inline">
            Phím: 1–8 khung · A alert · R replay · / tìm symbol · {drawings.length} hình vẽ
          </span>
        </div>
      </div>

      <AlertsPanel symbol={symbol} referencePrice={lastBar?.close ?? (liveAlertsEnabled ? quotesPrice : null)} />

      {indicatorDialog ? (
        <IndicatorDialog
          indicators={indicators}
          onToggle={(id) => setIndicator(id, !indicators[id])}
          onClose={() => setIndicatorDialog(false)}
        />
      ) : null}
      {symbolSearch ? (
        <SymbolSearchDialog
          onPick={(sym) => {
            setSymbol(sym);
            setSymbolSearch(false);
          }}
          onClose={() => setSymbolSearch(false)}
        />
      ) : null}
    </div>
  );
}

/* ------------------------------ symbol search ------------------------------- */

let symbolCache: { symbols: string[]; at: number } | null = null;

function SymbolSearchDialog({
  onPick,
  onClose,
}: {
  onPick: (symbol: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [symbols, setSymbols] = useState<string[]>(symbolCache?.symbols ?? []);
  const [loading, setLoading] = useState(!symbolCache);

  useEffect(() => {
    let alive = true;
    if (symbolCache && Date.now() - symbolCache.at < 24 * 3600_000) {
      setSymbols(symbolCache.symbols);
      return;
    }
    setLoading(true);
    searchSymbols({ data: {} })
      .then((res) => {
        if (!alive) return;
        symbolCache = { symbols: res.symbols, at: res.at };
        setSymbols(res.symbols);
        if (res.source === "none") toast.error("Không lấy được danh sách symbol từ sàn.");
      })
      .catch((err) => {
        if (!alive) return;
        toast.error(err instanceof Error ? err.message : "Không tải được danh sách symbol.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const q = query.trim().toUpperCase();
  const filtered = symbols.filter((s) => s.includes(q)).slice(0, 50);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[10dvh]" onClick={onClose}>
      <div
        className="max-h-[75dvh] w-full max-w-sm overflow-y-auto rounded-xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl">Tìm hợp đồng USDT-M</h3>
          <button type="button" onClick={onClose} className="text-subtle hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="BTC, SOL, DOGE…"
          className="mb-3 h-9 w-full rounded-md bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle"
        />
        {loading && symbols.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">
            <LoaderCircle className="mr-2 inline size-4 animate-spin" />
            Đang tải danh sách sàn…
          </p>
        ) : (
          <ul>
            {filtered.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  onClick={() => onPick(s)}
                  className="w-full rounded-md px-2 py-2 text-left text-sm text-muted hover:bg-surface-2 hover:text-fg"
                >
                  {s}
                </button>
              </li>
            ))}
            {filtered.length === 0 && !loading ? (
              <li className="py-4 text-center text-sm text-subtle">Không khớp hợp đồng nào.</li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ indicator dialog ---------------------------- */

function IndicatorDialog({
  indicators,
  onToggle,
  onClose,
}: {
  indicators: Record<IndicatorId, boolean>;
  onToggle: (id: IndicatorId) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const filtered = INDICATOR_CATALOG.filter((i) => i.name.toLowerCase().includes(q));
  const groups: Array<["Overlay" | "Pane", typeof INDICATOR_CATALOG]> = [
    ["Overlay", filtered.filter((i) => i.group === "Overlay")],
    ["Pane", filtered.filter((i) => i.group === "Pane")],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[10dvh]" onClick={onClose}>
      <div
        className="max-h-[75dvh] w-full max-w-md overflow-y-auto rounded-xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl">Chỉ báo</h3>
          <button type="button" onClick={onClose} className="text-subtle hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm chỉ báo…"
          className="mb-3 h-9 w-full rounded-md bg-surface-2 px-3 text-sm text-fg placeholder:text-subtle"
        />
        {groups.map(([group, items]) =>
          items.length === 0 ? null : (
            <div key={group} className="mb-3">
              <p className="mb-1.5 text-[11px] tracking-wide text-muted uppercase">{group}</p>
              <ul>
                {items.map((i) => (
                  <li key={i.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(i.id)}
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-surface-2"
                    >
                      <span className={indicators[i.id] ? "text-fg" : "text-muted"}>{i.name}</span>
                      <span
                        className={cn(
                          "rounded px-1.5 py-0.5 text-[10px]",
                          indicators[i.id] ? "bg-accent text-accent-fg" : "bg-surface-2 text-subtle",
                        )}
                      >
                        {indicators[i.id] ? "BẬT" : "TẮT"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
        )}
        <p className="text-[11px] text-subtle">
          Overlay vẽ trên pane giá; Pane mở khung riêng. Tất cả tính từ nến đã tải — không gọi thêm API.
        </p>
      </div>
    </div>
  );
}

/* --------------------------------- the chart -------------------------------- */

type TermChartProps = {
  bars: FeatureBar[];
  chartType: ChartType;
  indicators: Record<IndicatorId, boolean>;
  indKey: string;
  alertMode: boolean;
  tool: DrawingTool;
  drawings: Drawing[];
  replayPick: boolean;
  replayBoundaryTime: number | null;
  onHover: (bar: FeatureBar | null) => void;
  onCreateAlert: (price: number) => void;
  onAddDrawing: (d: Drawing) => void;
  onDeleteDrawing: (id: string) => void;
  onPickReplay: (index: number) => void;
  onApiReady: (api: { takeScreenshot: () => HTMLCanvasElement }) => void;
};

const LINE_COLORS = {
  fg: "#d8d4cc",
  muted: "#8b8d94",
  long: "#3d8b7a",
  short: "#b85c4a",
  warn: "#b08a4a",
  blue: "#6a8fd8",
  purple: "#9a7ab8",
};

function TermChart({
  bars,
  chartType,
  indicators,
  indKey,
  alertMode,
  tool,
  drawings,
  replayPick,
  replayBoundaryTime,
  onHover,
  onCreateAlert,
  onAddDrawing,
  onDeleteDrawing,
  onPickReplay,
  onApiReady,
}: TermChartProps) {
  const host = useRef<HTMLDivElement>(null);
  const alertModeRef = useRef(alertMode);
  alertModeRef.current = alertMode;
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const replayPickRef = useRef(replayPick);
  replayPickRef.current = replayPick;
  const onPickReplayRef = useRef(onPickReplay);
  onPickReplayRef.current = onPickReplay;
  const boundaryRef = useRef(replayBoundaryTime);
  boundaryRef.current = replayBoundaryTime;
  const onCreateAlertRef = useRef(onCreateAlert);
  onCreateAlertRef.current = onCreateAlert;
  const onHoverRef = useRef(onHover);
  onHoverRef.current = onHover;
  const onAddDrawingRef = useRef(onAddDrawing);
  onAddDrawingRef.current = onAddDrawing;
  const onDeleteDrawingRef = useRef(onDeleteDrawing);
  onDeleteDrawingRef.current = onDeleteDrawing;
  const drawingsRef = useRef(drawings);
  drawingsRef.current = drawings;
  const [, forceRender] = useState(0);
  const pendingRef = useRef<Array<{ time: number; price: number }>>([]);
  const chartRef = useRef<{ takeScreenshot: () => HTMLCanvasElement } | null>(null);
  const seriesRef = useRef<{
    priceToCoordinate: (price: number) => number | null;
    coordinateToPrice: (y: number) => number | null;
  } | null>(null);
  const timeScaleRef = useRef<{
    timeToCoordinate: (time: number) => number | null;
  } | null>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let disposed = false;
    let chart: { remove: () => void } | null = null;

    void import("lightweight-charts").then((lc) => {
      if (disposed || !host.current) return;
      const created = lc.createChart(el, {
        layout: {
          background: { type: lc.ColorType.Solid, color: "#0a0b0d" },
          textColor: "#8b8d94",
          fontFamily: "IBM Plex Mono, monospace",
          fontSize: 11,
          panes: { separatorColor: "rgba(232,230,225,0.12)", separatorHoverColor: "rgba(216,212,204,0.25)" },
        },
        grid: {
          vertLines: { color: "rgba(232,230,225,0.04)" },
          horzLines: { color: "rgba(232,230,225,0.04)" },
        },
        rightPriceScale: { borderColor: "rgba(232,230,225,0.08)" },
        timeScale: { borderColor: "rgba(232,230,225,0.08)", timeVisible: true, secondsVisible: false },
        crosshair: {
          mode: lc.CrosshairMode.Normal,
          horzLine: { color: "rgba(216,212,204,0.35)", labelBackgroundColor: "#2a2d35" },
          vertLine: { color: "rgba(216,212,204,0.35)", labelBackgroundColor: "#2a2d35" },
        },
        autoSize: true,
      });
      chart = created;
      const savedRange = el.dataset.range ? (JSON.parse(el.dataset.range) as { from: number; to: number }) : null;

      type Ts = import("lightweight-charts").UTCTimestamp;
      type Ws = import("lightweight-charts").WhitespaceData;
      const ts = (t: number) => Math.floor(t / 1000) as Ts;
      const nullsToWs = (series: Array<number | null>) =>
        series.map<Ws | { time: Ts; value: number }>((v, i) =>
          v == null ? { time: ts(bars[i]!.time) } : { time: ts(bars[i]!.time), value: v },
        );

      // ---- price pane ----
      const candleOpts = {
        upColor: LINE_COLORS.long,
        downColor: LINE_COLORS.short,
        borderVisible: false,
        wickUpColor: LINE_COLORS.long,
        wickDownColor: LINE_COLORS.short,
      };
      const priceSeries =
        chartType === "line"
          ? created.addSeries(lc.LineSeries, { color: LINE_COLORS.fg, lineWidth: 2, priceLineVisible: false })
          : chartType === "area"
            ? created.addSeries(lc.AreaSeries, {
                lineColor: LINE_COLORS.long,
                topColor: "rgba(61,139,122,0.35)",
                bottomColor: "rgba(61,139,122,0.02)",
                priceLineVisible: false,
              })
            : chartType === "baseline"
              ? created.addSeries(lc.BaselineSeries, {
                  baseValue: { type: "price", price: bars[0]?.close ?? 0 },
                  topLineColor: LINE_COLORS.long,
                  topFillColor1: "rgba(61,139,122,0.28)",
                  topFillColor2: "rgba(61,139,122,0.03)",
                  bottomLineColor: LINE_COLORS.short,
                  bottomFillColor1: "rgba(184,92,74,0.03)",
                  bottomFillColor2: "rgba(184,92,74,0.28)",
                  priceLineVisible: false,
                })
              : created.addSeries(lc.CandlestickSeries, candleOpts);

      if (chartType === "line" || chartType === "area" || chartType === "baseline") {
        priceSeries.setData(bars.map((b) => ({ time: ts(b.time), value: b.close })));
      } else {
        const ohlc = chartType === "heikin" ? heikinAshi(bars) : bars;
        priceSeries.setData(
          ohlc.map((b) => ({ time: ts(b.time), open: b.open, high: b.high, low: b.low, close: b.close })),
        );
      }

      // expose APIs for the drawing overlay + snapshot
      seriesRef.current = {
        priceToCoordinate: (price: number) =>
          (priceSeries as import("lightweight-charts").ISeriesApi<"Candlestick">).priceToCoordinate(price),
        coordinateToPrice: (y: number) =>
          (priceSeries as import("lightweight-charts").ISeriesApi<"Candlestick">).coordinateToPrice(y),
      };
      timeScaleRef.current = {
        timeToCoordinate: (time: number) =>
          created.timeScale().timeToCoordinate(Math.floor(time / 1000) as Ts),
      };
      chartRef.current = { takeScreenshot: () => created.takeScreenshot() };
      onApiReady(chartRef.current);

      const line = (color: string, paneIndex?: number, extra: Record<string, unknown> = {}) =>
        created.addSeries(
          lc.LineSeries,
          { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, ...extra },
          paneIndex,
        );
      const dashed = { lineStyle: 2 };

      if (indicators.ema) {
        line(LINE_COLORS.fg).setData(nullsToWs(bars.map((b) => b.ema20)));
        line(LINE_COLORS.muted).setData(nullsToWs(bars.map((b) => b.ema50)));
        line(LINE_COLORS.warn).setData(nullsToWs(bars.map((b) => b.ema200)));
      }

      if (indicators.bb) {
        line("rgba(216,212,204,0.5)", undefined, dashed).setData(nullsToWs(bars.map((b) => b.bbMid)));
        line("rgba(216,212,204,0.3)", undefined, dashed).setData(nullsToWs(bars.map((b) => b.bbUpper)));
        line("rgba(216,212,204,0.3)", undefined, dashed).setData(nullsToWs(bars.map((b) => b.bbLower)));
      }

      if (indicators.vwap) {
        line(LINE_COLORS.warn, undefined, { lineWidth: 1 }).setData(nullsToWs(vwapSession(bars)));
      }

      if (indicators.supertrend) {
        const { line: stLine, dir } = supertrendOverlay(bars, 3, 10);
        const up: Array<Ws | { time: Ts; value: number }> = [];
        const dn: Array<Ws | { time: Ts; value: number }> = [];
        stLine.forEach((v, i) => {
          const t = ts(bars[i]!.time);
          if (v == null) {
            up.push({ time: t });
            dn.push({ time: t });
          } else if (dir[i] === 1) {
            up.push({ time: t, value: v });
            dn.push({ time: t });
          } else {
            up.push({ time: t });
            dn.push({ time: t, value: v });
          }
        });
        line(LINE_COLORS.long).setData(up);
        line(LINE_COLORS.short).setData(dn);
      }

      if (indicators.donchian) {
        const d = donchianOverlay(bars, 20);
        line("rgba(106,143,216,0.55)", undefined, dashed).setData(nullsToWs(d.upper));
        line("rgba(106,143,216,0.35)", undefined, dashed).setData(nullsToWs(d.lower));
        line("rgba(106,143,216,0.3)", undefined, { lineStyle: 3 }).setData(nullsToWs(d.mid));
      }

      if (indicators.ichimoku) {
        const ik = ichimokuOverlay(bars);
        line(LINE_COLORS.blue).setData(nullsToWs(ik.tenkan));
        line(LINE_COLORS.short).setData(nullsToWs(ik.kijun));
        line("rgba(61,139,122,0.45)", undefined, dashed).setData(nullsToWs(ik.spanA));
        line("rgba(184,92,74,0.45)", undefined, dashed).setData(nullsToWs(ik.spanB));
      }

      if (indicators.keltner) {
        const k = keltnerOverlay(bars, 20, 2, 10);
        line("rgba(154,122,184,0.5)", undefined, dashed).setData(nullsToWs(k.upper));
        line("rgba(154,122,184,0.5)", undefined, dashed).setData(nullsToWs(k.lower));
        line("rgba(154,122,184,0.35)", undefined, { lineStyle: 3 }).setData(nullsToWs(k.mid));
      }

      if (chartType === "candles") {
        lc.createSeriesMarkers(
          priceSeries as import("lightweight-charts").ISeriesApi<"Candlestick">,
          bars
            .filter((b) => b.signal !== 0)
            .map((b) => ({
              time: ts(b.time),
              position: (b.signal === 1 ? "belowBar" : "aboveBar") as "belowBar" | "aboveBar",
              color: b.signal === 1 ? LINE_COLORS.long : LINE_COLORS.short,
              shape: (b.signal === 1 ? "arrowUp" : "arrowDown") as "arrowUp" | "arrowDown",
              text: b.signal === 1 ? "L" : "S",
            })),
        );
      }

      // ---- indicator panes ----
      let nextPane = 1;
      const paneOf: Partial<Record<IndicatorId, number>> = {};
      for (const id of PANE_ORDER) {
        if (indicators[id]) paneOf[id] = nextPane++;
      }

      const priceLines = (
        series: import("lightweight-charts").ISeriesApi<"Line">,
        levels: Array<[number, string]>,
      ) => {
        for (const [price, color] of levels) {
          series.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: String(price) });
        }
      };

      if (paneOf.vol != null) {
        const vol = created.addSeries(
          lc.HistogramSeries,
          { priceFormat: { type: "volume" }, priceLineVisible: false, lastValueVisible: false },
          paneOf.vol,
        );
        vol.setData(
          bars.map((b) => ({
            time: ts(b.time),
            value: b.volume,
            color: b.close >= b.open ? "rgba(61,139,122,0.45)" : "rgba(184,92,74,0.45)",
          })),
        );
      }

      if (paneOf.rsi != null) {
        const rsi = line(LINE_COLORS.muted, paneOf.rsi);
        rsi.setData(nullsToWs(bars.map((b) => b.rsi)));
        priceLines(rsi, [
          [70, "rgba(184,92,74,0.5)"],
          [30, "rgba(61,139,122,0.5)"],
        ]);
      }

      if (paneOf.macd != null) {
        const hist = created.addSeries(
          lc.HistogramSeries,
          { priceLineVisible: false, lastValueVisible: false },
          paneOf.macd,
        );
        hist.setData(
          bars
            .filter((b) => b.macdHist != null)
            .map((b) => ({
              time: ts(b.time),
              value: b.macdHist!,
              color: b.macdHist! >= 0 ? "rgba(61,139,122,0.5)" : "rgba(184,92,74,0.5)",
            })),
        );
        line(LINE_COLORS.fg, paneOf.macd).setData(nullsToWs(bars.map((b) => b.macd)));
        line(LINE_COLORS.warn, paneOf.macd).setData(nullsToWs(bars.map((b) => b.macdSignal)));
      }

      if (paneOf.stoch != null) {
        const k = line(LINE_COLORS.blue, paneOf.stoch);
        k.setData(nullsToWs(bars.map((b) => b.stochK)));
        line(LINE_COLORS.warn, paneOf.stoch).setData(nullsToWs(bars.map((b) => b.stochD)));
        priceLines(k, [
          [80, "rgba(184,92,74,0.4)"],
          [20, "rgba(61,139,122,0.4)"],
        ]);
      }

      if (paneOf.adx != null) {
        line(LINE_COLORS.purple, paneOf.adx).setData(nullsToWs(bars.map((b) => b.adx)));
      }

      if (paneOf.obv != null) {
        line(LINE_COLORS.blue, paneOf.obv).setData(nullsToWs(bars.map((b) => b.obv)));
      }

      if (paneOf.atr != null) {
        line(LINE_COLORS.warn, paneOf.atr).setData(nullsToWs(bars.map((b) => b.atr)));
      }

      created.subscribeCrosshairMove((param) => {
        if (!param.time || !param.point) {
          onHoverRef.current(null);
          return;
        }
        const t = Number(param.time) * 1000;
        const hit = bars.find((b) => Math.floor(b.time / 1000) === Math.floor(t / 1000));
        onHoverRef.current(hit ?? null);
      });

      created.subscribeClick((param) => {
        // Replay pick mode: click a bar to start the replay there.
        if (replayPickRef.current && param.point && (param.paneIndex ?? 0) === 0) {
          const price = seriesRef.current?.coordinateToPrice(param.point.y);
          if (price == null) return;
          const time = param.time != null ? Number(param.time) * 1000 : null;
          if (time == null) return;
          let best = 0;
          let bestDist = Number.POSITIVE_INFINITY;
          bars.forEach((b, idx) => {
            const d = Math.abs(b.time - time);
            if (d < bestDist) {
              bestDist = d;
              best = idx;
            }
          });
          onPickReplayRef.current(best + 1);
          return;
        }
        const activeTool = toolRef.current;
        // Drawing tools take precedence over the alert mode.
        if (activeTool !== "cursor" && param.point) {
          const price = seriesRef.current?.coordinateToPrice(param.point.y);
          if (price == null) return;
          const time = param.time != null ? Number(param.time) * 1000 : null;
          if (time == null) return;
          const point = { time, price };
          if (activeTool === "erase") {
            const width = host.current?.clientWidth ?? 0;
            let bestId: string | null = null;
            let bestDist = 12;
            for (const d of drawingsRef.current) {
              const dist = drawingHitPx(
                d,
                param.point.x,
                param.point.y,
                (pt) => {
                  const x = timeScaleRef.current?.timeToCoordinate(pt.time) ?? null;
                  const y = seriesRef.current?.priceToCoordinate(pt.price) ?? null;
                  return x == null || y == null ? null : { x, y };
                },
                width,
              );
              if (dist != null && dist < bestDist) {
                bestDist = dist;
                bestId = d.id;
              }
            }
            if (bestId) onDeleteDrawingRef.current(bestId);
            return;
          }
          if (activeTool === "hline") {
            onAddDrawingRef.current(makeDrawing("hline", [point], "", ""));
            return;
          }
          // trend / fib need two clicks.
          const pending = pendingRef.current;
          pending.push(point);
          if (pending.length >= 2) {
            const [a, b] = pending;
            pendingRef.current = [];
            onAddDrawingRef.current(makeDrawing(activeTool === "fib" ? "fib" : "trend", [a!, b!], "", ""));
          }
          forceRender((v) => v + 1);
          return;
        }
        if (!alertModeRef.current || !param.point || (param.paneIndex ?? 0) !== 0) return;
        const price = (priceSeries as import("lightweight-charts").ISeriesApi<"Candlestick">).coordinateToPrice(
          param.point.y,
        );
        if (price != null) onCreateAlertRef.current(Number(price));
      });

      created.timeScale().subscribeVisibleLogicalRangeChange(() => {
        // Redraw the drawing overlay whenever the viewport moves.
        forceRender((v) => v + 1);
      });

      created.timeScale().fitContent();
      if (savedRange) {
        created.timeScale().setVisibleLogicalRange({ from: savedRange.from, to: savedRange.to });
      }
    });

    return () => {
      disposed = true;
      if (chart && host.current) {
        try {
          const range = (chart as unknown as {
            timeScale: () => { getVisibleLogicalRange: () => { from: number; to: number } | null };
          }).timeScale().getVisibleLogicalRange();
          if (range) host.current.dataset.range = JSON.stringify(range);
        } catch {
          /* chart already gone */
        }
      }
      chart?.remove();
    };
  }, [bars, chartType, indKey, indicators.vol, indicators.rsi, indicators.macd, indicators.stoch, indicators.adx, indicators.obv, indicators.atr, onApiReady]);

  function renderDrawings(): React.ReactNode {
    const series = seriesRef.current;
    const ts = timeScaleRef.current;
    if (!series || !ts) return null;
    const toXY = (p: { time: number; price: number }) => {
      const x = ts.timeToCoordinate(Math.floor(p.time / 1000));
      const y = series.priceToCoordinate(p.price);
      return x == null || y == null ? null : { x, y };
    };
    const out: React.ReactNode[] = [];
    if (boundaryRef.current != null) {
      const bx = ts.timeToCoordinate(Math.floor(boundaryRef.current / 1000));
      if (bx != null) {
        out.push(
          <line key="replay-boundary" x1={bx} y1={0} x2={bx} y2="100%" stroke="rgba(176,138,74,0.9)" strokeWidth={1.25} strokeDasharray="6 4" />,
        );
        out.push(
          <text key="replay-boundary-l" x={bx + 6} y={14} fill="#b08a4a" fontSize={10} fontFamily="IBM Plex Mono">
            REPLAY ▶
          </text>,
        );
      }
    }
    for (const d of drawings) {
      const pts = d.points.map(toXY);
      if (pts.some((pt) => pt == null) || pts.length === 0) continue;
      if (d.kind === "hline") {
        const y = pts[0]!.y;
        out.push(
          <line key={d.id} x1={0} y1={y} x2="100%" y2={y} stroke="#b08a4a" strokeWidth={1.25} />,
        );
        out.push(
          <text key={`${d.id}-l`} x={8} y={y - 4} fill="#b08a4a" fontSize={10} fontFamily="IBM Plex Mono">
            {d.points[0]!.price.toFixed(2)}
          </text>,
        );
      } else if (d.kind === "trend" && pts.length === 2) {
        const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
        out.push(
          <line key={d.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#6a8fd8" strokeWidth={1.5} />,
        );
      } else if (d.kind === "fib" && d.points.length === 2) {
        const [a, b] = pts as [{ x: number; y: number }, { x: number; y: number }];
        const x1 = Math.min(a.x, b.x);
        const x2 = Math.max(a.x, b.x);
        const prices = fibPrices(d.points[0]!.price, d.points[1]!.price);
        FIB_LEVELS.forEach((level, i) => {
          const y = series.priceToCoordinate(prices[i]!);
          if (y == null) return;
          out.push(
            <g key={`${d.id}-${level}`}>
              <line x1={x1} y1={y} x2={x2} y2={y} stroke="rgba(176,138,74,0.75)" strokeWidth={1} strokeDasharray="4 3" />
              <text x={x2 + 4} y={y + 3} fill="#b08a4a" fontSize={9} fontFamily="IBM Plex Mono">
                {level.toFixed(3)} · {prices[i]!.toFixed(2)}
              </text>
            </g>,
          );
        });
      }
    }
    for (const p of pendingRef.current) {
      const x = ts.timeToCoordinate(Math.floor(p.time / 1000));
      const y = series.priceToCoordinate(p.price);
      if (x == null || y == null) continue;
      out.push(<circle key={`pend-${x}-${y}`} cx={x} cy={y} r={3} fill="#d8d4cc" />);
    }
    return out;
  }

  return (
    <div
      ref={host}
      data-testid="chart-host"
      className={cn(
        "relative h-full w-full",
        alertMode || tool !== "cursor" ? "cursor-crosshair" : "cursor-default",
      )}
    >
      <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full">{renderDrawings()}</svg>
    </div>
  );
}

/* ------------------------------- alerts panel ------------------------------- */

function AlertsPanel({ symbol, referencePrice }: { symbol: string; referencePrice: number | null }) {
  const alerts = useAlerts((s) => s.alerts);
  const [mounted, setMounted] = useState(false);
  const [kind, setKind] = useState<AlertKind>("price_above");
  const [input, setInput] = useState("");

  useEffect(() => setMounted(true), []);

  const mine = alerts.filter((a) => a.symbol === symbol);
  const others = alerts.filter((a) => a.symbol !== symbol);

  function addManual() {
    const value = Number(input.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      toast.error("Mức alert không hợp lệ");
      return;
    }
    const a = makeAlert(symbol, kind, value, referencePrice, "nhập tay");
    useAlerts.getState().add(a);
    setInput("");
    toast.success(`Alert ${symbol} ${alertLabel(a)}`);
  }

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-l border-border lg:flex">
      <div className="border-b border-border px-3 py-2">
        <p className="text-[11px] tracking-wide text-muted uppercase">Alerts</p>
      </div>
      <div className="space-y-1.5 border-b border-border px-3 py-2">
        <select
          className="h-8 w-full rounded-md bg-surface-2 px-2 text-xs text-fg"
          value={kind}
          onChange={(e) => setKind(e.target.value as AlertKind)}
        >
          {ALERT_KIND_OPTIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <div className="flex gap-1.5">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
            inputMode="decimal"
            placeholder={
              kind.startsWith("price")
                ? `Giá ${symbol.replace("/USDT", "")}`
                : kind.startsWith("rsi")
                  ? "0–100"
                  : "0.05 = 5%"
            }
            className="h-8 min-w-0 flex-1 rounded-md bg-surface-2 px-2 font-mono text-xs text-fg placeholder:text-subtle"
          />
          <button type="button" onClick={addManual} className="h-8 rounded-md bg-accent px-2.5 text-xs text-accent-fg">
            Đặt
          </button>
        </div>
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {!mounted ? null : mine.length === 0 ? (
          <li className="px-3 py-3 text-xs text-subtle">
            Chưa có alert cho {symbol}. Bấm biểu tượng Alert rồi bấm lên chart, hoặc nhập điều kiện ở trên.
          </li>
        ) : (
          mine
            .slice()
            .sort((a, b) => (b.triggeredAt ?? Infinity) - (a.triggeredAt ?? Infinity))
            .map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                <span className="min-w-0">
                  <span className={cn("block font-mono text-xs tabular", a.triggeredAt ? "text-warn" : "text-fg")}>
                    {alertLabel(a)} {a.triggeredAt ? "· đã chạm" : ""}
                  </span>
                  <span className="block text-[10px] text-subtle">{a.note || a.kind}</span>
                </span>
                <button
                  type="button"
                  onClick={() => useAlerts.getState().remove(a.id)}
                  className="text-subtle hover:text-short"
                  title="Xóa alert"
                >
                  <X className="size-3.5" />
                </button>
              </li>
            ))
        )}
        {mounted && others.length > 0 ? (
          <li className="border-b border-border px-3 py-1.5 text-[10px] text-subtle uppercase">
            {others.length} alert ở symbol khác
          </li>
        ) : null}
      </ul>

      {mounted && alerts.some((a) => a.triggeredAt != null) ? (
        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => useAlerts.getState().clearTriggered()}
            className="h-8 w-full rounded-md bg-surface-2 text-xs text-muted hover:text-fg"
          >
            Xóa alert đã kích hoạt
          </button>
        </div>
      ) : null}
    </aside>
  );
}
