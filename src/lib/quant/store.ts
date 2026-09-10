import { nativeUnsupported } from "./strategy/library.ts";
import { create } from "zustand";
import type { TradeRunSnapshot } from "./trade-focus.ts";
import { createReplaySession } from "./replay-session.ts";
import { runBacktest, SimEngine } from "./backtest/engine.ts";
import { barBudget as budgetFor, defaultConfig, htfBudget } from "./config.ts";
import { generateSynthetic } from "./data/synthetic.ts";
import { explainLastBar, type StrategyExplain } from "./explain.ts";
import { loadOhlcv } from "./data/load-ohlcv.ts";
import { applySignals, buildDesk, snapshotOf } from "./pipeline.ts";
import { getLastOkSource, setLastOkSource, getSourcePref } from "../terminal/data-prefs.ts";
import type {
  AnalysisSnapshot,
  BacktestResult,
  DataSource,
  DeskConfig,
  FeatureBar,
  MarketType,
  Ohlcv,
  PaperEvent,
  Timeframe,
} from "./types.ts";

export type DeskTab = "playbook" | "analyze" | "strategy" | "backtest" | "paper" | "code";

/** Config fields that change WHAT data must be fetched (vs how it is traded). */
const DATA_KEYS: ReadonlySet<string> = new Set(["symbol", "ltf", "htf", "market"]);
/** Inputs that change the SIGNAL columns — bars must be re-signaled (cheap). */
const SIGNAL_KEYS: ReadonlySet<string> = new Set([
  "strategyId",
  "executionMode",
  "nativeTickSize",
  "volSpikeMin",
  "mrRsiLongMax",
  "mrRsiShortMin",
  "mrAdxMax",
  "kcEmaLen",
  "kcAtrLen",
  "kcMult",
  "portAdxMin",
  "e0v1eDip8",
  "e0v1eDip16",
  "e0v1eDip15",
  "stAtrMult",
  "donEntryLen",
  "emaFastLen",
  "emaSlowLen",
  "stochLo",
  "stochHi",
  "regimeFilterPorts",
  "side",
  "tradeVolatility",
  "warmup",
]);

type HistoricalReplay = Readonly<{
  bars: FeatureBar[];
  config: DeskConfig;
  entryTime: number;
  source: string;
  sourceNote: string;
  startIndex: number;
}>;

type PaperState = {
  historical: HistoricalReplay | null;
  engine: SimEngine | null;
  cursor: number;
  events: PaperEvent[];
  playing: boolean;
};

const emptyPaper = (): PaperState => ({
  engine: null,
  cursor: 0,
  events: [],
  playing: false,
  historical: null,
});

type DeskState = {
  cfg: DeskConfig;
  tab: DeskTab;
  loading: boolean;
  error: string | null;
  /** Set when runBt cannot run (not enough bars) so the UI can say why. */
  btNote: string | null;
  source: DataSource | null;
  sourceNote: string;
  ltf: FeatureBar[];
  htf: FeatureBar[];
  analysis: AnalysisSnapshot | null;
  explain: StrategyExplain | null;
  backtest: BacktestResult | null;
  backtestRun: TradeRunSnapshot | null;
  paper: PaperState;
  /** Monotonic request id — a slower older fetch must never overwrite a newer one. */
  loadSeq: number;
  setCfg: (partial: Partial<DeskConfig>) => void;
  setTab: (tab: DeskTab) => void;
  loadLive: () => Promise<void>;
  ingest: (
    ltfRaw: Ohlcv[],
    htfRaw: Ohlcv[],
    source: DataSource,
    note: string,
    actualMarket?: MarketType,
  ) => void;
  loadSynthetic: () => void;
  resignal: () => void;
  recomputeDerived: () => void;
  runBt: () => void;
  startTradeReplay: (
    bars: FeatureBar[],
    config: DeskConfig,
    entryTime: number,
    source: string,
    sourceNote: string,
  ) => void;
  paperCurrent: () => void;
  paperReset: () => void;
  paperStep: () => void;
  setPlaying: (v: boolean) => void;
};

function applyBundle(
  cfg: DeskConfig,
  ltfRaw: Ohlcv[],
  htfRaw: Ohlcv[],
  source: DataSource,
  note: string,
) {
  const { ltf, htf } = buildDesk(ltfRaw, htfRaw, cfg);
  return {
    ltf,
    htf,
    analysis: snapshotOf(ltf, cfg, source, note),
    explain: explainLastBar(ltf, cfg),
    backtest: null as BacktestResult | null,
    backtestRun: null as TradeRunSnapshot | null,
  };
}

export const useDesk = create<DeskState>()((set, get) => ({
  cfg: defaultConfig(),
  tab: "playbook",
  loading: false,
  error: null,
  btNote: null,
  source: null,
  sourceNote: "",
  ltf: [],
  htf: [],
  analysis: null,
  explain: null,
  backtest: null,
  backtestRun: null,
  paper: emptyPaper(),
  loadSeq: 0,
  setCfg: (partial) => {
    set((s) => ({ cfg: { ...s.cfg, ...partial }, backtest: null, backtestRun: null, btNote: null }));
    const keys = Object.keys(partial);
    const touchesData = keys.some((k) => DATA_KEYS.has(k));
    if (touchesData) {
      // The bars on screen no longer match the request — drop derived state
      // and refetch. A failed refetch falls back to synthetic inside loadLive.
      set({ paper: get().paper.historical ? get().paper : emptyPaper() });
      void get().loadLive();
      return;
    }
    // Trading-parameter change: everything can be recomputed in place.
    if (keys.some((k) => SIGNAL_KEYS.has(k))) get().resignal();
    get().recomputeDerived();
  },
  setTab: (tab) => set({ tab }),
  loadLive: async () => {
    const seq = get().loadSeq + 1;
    set({ loadSeq: seq, loading: true, error: null, backtest: null, backtestRun: null, btNote: null });
    const current = get().cfg;
    try {
      const pref = getSourcePref();
      const bundle = await loadOhlcv({
        data: {
          symbol: current.symbol,
          ltf: current.ltf,
          htf: current.htf,
          market: current.market,
          ltfBars: budgetFor(current.ltf),
          htfBars: htfBudget(current.htf),
          ...(pref === "auto"
            ? getLastOkSource()
              ? { preferred: getLastOkSource() }
              : {}
            : { preferred: pref }),
        },
      });
      if (get().loadSeq !== seq) return;
      if (bundle.source === "binance" || bundle.source === "okx") {
        setLastOkSource(bundle.source);
      } // superseded by a newer request
      get().ingest(bundle.ltf, bundle.htf, bundle.source, bundle.sourceNote, bundle.market);
      get().runBt();
    } catch (err) {
      if (get().loadSeq !== seq) return;
      const msg = err instanceof Error ? err.message : "Không tải được nến";
      get().loadSynthetic();
      // Set AFTER the fallback ingest — ingest clears error, and the user must
      // still see why live data is not on screen.
      set({ error: `${msg} — đang hiển thị nến mô phỏng thay thế.` });
    }
  },
  ingest: (ltfRaw, htfRaw, source, note, actualMarket) => {
    const state = get();
    // The fetcher may answer a USDT-M request with spot klines (exchange
    // fallback). Trade with the market the data actually is, and say so.
    const cfg =
      actualMarket && actualMarket !== state.cfg.market
        ? { ...state.cfg, market: actualMarket }
        : state.cfg;
    const next = applyBundle(cfg, ltfRaw, htfRaw, source, note);
    set({
      ...next,
      cfg,
      source,
      sourceNote: note,
      loading: false,
      error: null,
      btNote: null,
      paper: get().paper.historical ? get().paper : emptyPaper(),
    });
  },
  loadSynthetic: () => {
    const cfg = get().cfg;
    const ltfRaw = generateSynthetic(cfg.symbol, cfg.ltf, 6000);
    const htfRaw = generateSynthetic(cfg.symbol, cfg.htf, 1500);
    get().ingest(
      ltfRaw,
      htfRaw,
      "synthetic",
      "Nến mô phỏng (regime-switching). Dùng khi không gọi được API sàn — không phải giá thật.",
    );
    get().runBt();
  },
  resignal: () => {
    // Signal-affecting inputs changed: recompute the signal columns on the
    // enriched bars already in memory (no refetch — features are causal).
    const { ltf, cfg } = get();
    if (ltf.length === 0) return;
    const re = applySignals(ltf, cfg);
    set({
      ltf: re,
      backtest: null,
      backtestRun: null,
      analysis: snapshotOf(re, cfg, get().source ?? "synthetic", get().sourceNote),
      explain: explainLastBar(re, cfg),
      paper: get().paper.historical ? get().paper : emptyPaper(),
    });
  },
  recomputeDerived: () => {
    const { ltf, cfg } = get();
    set({ explain: ltf.length > 0 ? explainLastBar(ltf, cfg) : null });
    get().runBt();
  },
  runBt: () => {
    const { ltf, cfg, source, sourceNote, loading } = get();
    // During a fetch the retained bars belong to the previous data request.
    if (loading) {
      set({ backtest: null, backtestRun: null, btNote: null });
      return;
    }
    if (ltf.length < cfg.warmup + 50) {
      set({
        backtest: null,
        backtestRun: null,
        btNote: `Cần tối thiểu ${cfg.warmup + 50} nến LTF để backtest (đang có ${ltf.length}).`,
      });
      return;
    }
    const unsupported=nativeUnsupported(cfg);if(unsupported){set({backtest:null,backtestRun:null,btNote:unsupported});return;}
    const bars = structuredClone(ltf);
    const runCfg = structuredClone(cfg);
    const result = runBacktest(bars, runCfg, runCfg.ltf);
    const backtestRun: TradeRunSnapshot = {
      result, bars, cfg: runCfg, source, sourceNote, datasetKey: crypto.randomUUID(),
    };
    set({ backtest: result, backtestRun, btNote: null });
  },
  startTradeReplay: (bars, config, entryTime, source, sourceNote) => {
    // Construct first: an invalid target must not disturb the active session.
    const engine = createReplaySession(bars, config, entryTime);
    for (const bar of engine.bars) {
      if (bar.pattern) Object.freeze(bar.pattern);
      Object.freeze(bar);
    }
    Object.freeze(engine.bars);
    Object.freeze(engine.cfg.symbols);
    Object.freeze(engine.cfg);
    const historical = Object.freeze({
      bars: engine.bars,
      config: engine.cfg,
      entryTime,
      source,
      sourceNote,
      startIndex: engine.i,
    });
    set({
      tab: "paper",
      paper: {
        engine,
        historical,
        cursor: engine.i,
        events: engine.events.slice(-40),
        playing: false,
      },
    });
  },
  paperReset: () => {
    const h = get().paper.historical;
    if (h) {
      get().startTradeReplay(h.bars, h.config, h.entryTime, h.source, h.sourceNote);
      return;
    }
    get().paperCurrent();
  },
  paperCurrent: () => {
    const { ltf, cfg } = get();
    if (!Number.isInteger(cfg.warmup) || cfg.warmup < 0 || ltf.length < cfg.warmup + 10) {
      set({ paper: emptyPaper() });
      return;
    }
    if(nativeUnsupported(cfg)){set({paper:emptyPaper(),btNote:nativeUnsupported(cfg)});return;}
    const start = cfg.warmup;
    const engine = new SimEngine(ltf, cfg, cfg.ltf, start);
    set({ paper: { engine, historical: null, cursor: start, events: [], playing: false } });
  },
  paperStep: () => {
    const paper = get().paper;
    if (!paper.engine || paper.engine.done) {
      set({ paper: { ...paper, playing: false } });
      return;
    }
    const snap = paper.engine.step();
    const events = snap.lastEvent ? [...paper.events, snap.lastEvent].slice(-40) : paper.events;
    set({
      paper: {
        ...paper,
        engine: paper.engine,
        cursor: snap.i,
        events,
        playing: paper.playing && !snap.done,
      },
    });
  },
  setPlaying: (v) => set((s) => ({ paper: { ...s.paper, playing: v } })),
}));

// NOTE: no module-scope seed here on purpose. Synthetic bars are stamped with
// Date.now(); running this during SSR would bake server timestamps into HTML
// that the client then re-renders with its own — a hydration mismatch waiting
// for a timezone boundary. DeskApp seeds the store in a mount effect instead.
