import { create } from "zustand";
import { runBacktest, SimEngine } from "./backtest/engine.ts";
import { barBudget as budgetFor, defaultConfig, htfBudget } from "./config.ts";
import { generateSynthetic } from "./data/synthetic.ts";
import { explainLastBar, type StrategyExplain } from "./explain.ts";
import { loadOhlcv } from "./data/load-ohlcv.ts";
import { applySignals, buildDesk, snapshotOf } from "./pipeline.ts";
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

export type DeskTab = "analyze" | "strategy" | "backtest" | "paper" | "code";

/** Config fields that change WHAT data must be fetched (vs how it is traded). */
const DATA_KEYS: ReadonlySet<string> = new Set(["symbol", "ltf", "htf", "market"]);
/** Inputs that change the SIGNAL columns — bars must be re-signaled (cheap). */
const SIGNAL_KEYS: ReadonlySet<string> = new Set([
  "strategyId",
  "volSpikeMin",
  "mrRsiLongMax",
  "mrRsiShortMin",
  "mrAdxMax",
  "kcEmaLen",
  "kcAtrLen",
  "kcMult",
  "portAdxMin",
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

type PaperState = {
  engine: SimEngine | null;
  cursor: number;
  events: PaperEvent[];
  playing: boolean;
};

const emptyPaper = (): PaperState => ({ engine: null, cursor: 0, events: [], playing: false });

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
  };
}

export const useDesk = create<DeskState>()((set, get) => ({
  cfg: defaultConfig(),
  tab: "analyze",
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
  paper: emptyPaper(),
  loadSeq: 0,
  setCfg: (partial) => {
    set((s) => ({ cfg: { ...s.cfg, ...partial } }));
    const keys = Object.keys(partial);
    const touchesData = keys.some((k) => DATA_KEYS.has(k));
    if (touchesData) {
      // The bars on screen no longer match the request — drop derived state
      // and refetch. A failed refetch falls back to synthetic inside loadLive.
      set({ paper: emptyPaper() });
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
    set({ loadSeq: seq, loading: true, error: null });
    const current = get().cfg;
    try {
      const bundle = await loadOhlcv({
        data: {
          symbol: current.symbol,
          ltf: current.ltf,
          htf: current.htf,
          market: current.market,
          ltfBars: budgetFor(current.ltf),
          htfBars: htfBudget(current.htf),
        },
      });
      if (get().loadSeq !== seq) return; // superseded by a newer request
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
      paper: emptyPaper(),
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
      analysis: snapshotOf(re, cfg, get().source ?? "synthetic", get().sourceNote),
      explain: explainLastBar(re, cfg),
      paper: emptyPaper(),
    });
  },
  recomputeDerived: () => {
    const { ltf, cfg } = get();
    set({ explain: ltf.length > 0 ? explainLastBar(ltf, cfg) : null });
    get().runBt();
  },
  runBt: () => {
    const { ltf, cfg } = get();
    if (ltf.length < cfg.warmup + 50) {
      set({
        backtest: null,
        btNote: `Cần tối thiểu ${cfg.warmup + 50} nến LTF để backtest (đang có ${ltf.length}).`,
      });
      return;
    }
    set({ backtest: runBacktest(ltf, cfg, cfg.ltf), btNote: null });
  },
  paperReset: () => {
    const { ltf, cfg } = get();
    if (ltf.length < cfg.warmup + 10) return;
    const start = Math.max(cfg.warmup, ltf.length - 180);
    const engine = new SimEngine(ltf, cfg, cfg.ltf, start);
    set({ paper: { engine, cursor: start, events: [], playing: false } });
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
