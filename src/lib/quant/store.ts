import { create } from "zustand";
import { runBacktest } from "./backtest/engine";
import { SimEngine } from "./backtest/engine";
import { defaultConfig } from "./config";
import { generateSynthetic } from "./data/synthetic";
import { explainLastBar, type StrategyExplain } from "./explain";
import { buildDesk, snapshotOf } from "./pipeline";
import type {
  AnalysisSnapshot,
  BacktestResult,
  DataSource,
  DeskConfig,
  FeatureBar,
  PaperEvent,
} from "./types";

export type DeskTab = "analyze" | "strategy" | "backtest" | "paper" | "code";

type PaperState = {
  engine: SimEngine | null;
  cursor: number;
  events: PaperEvent[];
  playing: boolean;
};

type DeskState = {
  cfg: DeskConfig;
  tab: DeskTab;
  loading: boolean;
  error: string | null;
  source: DataSource | null;
  sourceNote: string;
  ltf: FeatureBar[];
  htf: FeatureBar[];
  analysis: AnalysisSnapshot | null;
  explain: StrategyExplain | null;
  backtest: BacktestResult | null;
  paper: PaperState;
  setCfg: (partial: Partial<DeskConfig>) => void;
  setTab: (tab: DeskTab) => void;
  ingest: (
    ltfRaw: import("./types").Ohlcv[],
    htfRaw: import("./types").Ohlcv[],
    source: DataSource,
    note: string,
  ) => void;
  loadSynthetic: () => void;
  runBt: () => void;
  paperReset: () => void;
  paperStep: () => void;
  setPlaying: (v: boolean) => void;
};

function applyBundle(
  cfg: DeskConfig,
  ltfRaw: import("./types").Ohlcv[],
  htfRaw: import("./types").Ohlcv[],
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
  source: null,
  sourceNote: "",
  ltf: [],
  htf: [],
  analysis: null,
  explain: null,
  backtest: null,
  paper: { engine: null, cursor: 0, events: [], playing: false },
      setCfg: (partial) => set((s) => ({ cfg: { ...s.cfg, ...partial } })),
      setTab: (tab) => set({ tab }),
      ingest: (ltfRaw, htfRaw, source, note) => {
        const cfg = get().cfg;
        const next = applyBundle(cfg, ltfRaw, htfRaw, source, note);
        set({
          ...next,
          source,
          sourceNote: note,
          loading: false,
          error: null,
          paper: { engine: null, cursor: 0, events: [], playing: false },
        });
      },
      loadSynthetic: () => {
        const cfg = get().cfg;
        const ltfRaw = generateSynthetic(cfg.symbol, cfg.ltf, 1200);
        const htfRaw = generateSynthetic(cfg.symbol, cfg.htf, 420);
        get().ingest(
          ltfRaw,
          htfRaw,
          "synthetic",
          "Nến mô phỏng (regime-switching). Dùng khi không gọi được API sàn — không phải giá thật.",
        );
      },
      runBt: () => {
        const { ltf, cfg } = get();
        if (ltf.length < cfg.warmup + 50) return;
        set({ backtest: runBacktest(ltf, cfg, cfg.ltf) });
      },
      paperReset: () => {
        const { ltf, cfg } = get();
        if (ltf.length < cfg.warmup + 10) return;
        const start = Math.max(cfg.warmup, ltf.length - 180);
        const engine = new SimEngine(ltf, cfg, cfg.ltf, start);
        set({
          paper: { engine, cursor: start, events: [], playing: false },
        });
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

useDesk.getState().loadSynthetic();
