/**
 * Strategy Tester lab — parameter sweep with a walk-forward split, Monte
 * Carlo robustness and per-strategy breakdown. Pure functions over the
 * enriched bars the desk already holds; no I/O, fully testable.
 *
 * Anti-overfit rules enforced here:
 * - Grid is capped (MAX_COMBOS); each combo is judged on TRAIN only, then the
 *   winner is revealed on the untouched TEST window.
 * - The untuned base config runs through the same test window as a control.
 */
import { mulberry32 } from "../math.ts";
import { applySignals } from "../pipeline.ts";
import { runBacktest, SimEngine } from "./engine.ts";
import { computeMetrics } from "./metrics.ts";
import { STRATEGY_SELECT_OPTIONS } from "../strategy/library.ts";
import type { DeskConfig, EquityPoint, FeatureBar, Metrics, Timeframe, Trade } from "../types.ts";

export const MAX_COMBOS = 36;

export type GridKey =
  // execution-layer params (signals stay baked)
  | "tp1R"
  | "tp2R"
  | "breakevenR"
  | "tp1ClosePct"
  | "stopAtrMin"
  | "stopAtrMax"
  | "timeStopBars"
  | "riskPct"
  // signal-layer params (each combo re-runs the signal pass)
  | "kcEmaLen"
  | "kcAtrLen"
  | "kcMult"
  | "portAdxMin"
  | "volSpikeMin"
  | "donEntryLen"
  | "stAtrMult"
  | "stochLo"
  | "stochHi"
  | "emaFastLen"
  | "emaSlowLen"
  | "mrAdxMax";

export const GRID_LABELS: Record<GridKey, string> = {
  tp1R: "TP1 (R)",
  tp2R: "TP2 (R)",
  breakevenR: "Break-even (R)",
  tp1ClosePct: "TP1 đóng %",
  stopAtrMin: "Stop ATR min",
  stopAtrMax: "Stop ATR max",
  timeStopBars: "Time stop (nến)",
  riskPct: "Risk / lệnh",
  kcEmaLen: "KC EMA",
  kcAtrLen: "KC ATR",
  kcMult: "KC ×",
  portAdxMin: "ADX gate",
  volSpikeMin: "Vol spike",
  donEntryLen: "Donchian N",
  stAtrMult: "ST ×",
  stochLo: "Stoch lo",
  stochHi: "Stoch hi",
  emaFastLen: "EMA nhanh",
  emaSlowLen: "EMA chậm",
  mrAdxMax: "MR ADX",
};

/** Grid axes whose combos must RE-RUN the signal pass before backtesting. */
export const SIGNAL_GRID_KEYS: ReadonlySet<string> = new Set([
  "kcEmaLen",
  "kcAtrLen",
  "kcMult",
  "portAdxMin",
  "volSpikeMin",
  "donEntryLen",
  "stAtrMult",
  "stochLo",
  "stochHi",
  "emaFastLen",
  "emaSlowLen",
  "mrAdxMax",
]);

export type Objective = "sharpe" | "sortino" | "calmar" | "expectancy" | "profitFactor" | "lowdd";

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  sharpe: "Sharpe",
  sortino: "Sortino",
  calmar: "Calmar",
  expectancy: "Expectancy",
  profitFactor: "Profit factor",
  lowdd: "DD thấp nhất",
};

export type GridAxis = { key: GridKey; values: number[] };

export type GridCombo = {
  params: Partial<Pick<DeskConfig, GridKey>>;
  label: string;
  train: Metrics;
  score: number;
};

export type GridResult = {
  combos: GridCombo[];
  best: GridCombo | null;
  test: Metrics | null;
  control: Metrics | null;
  trainBars: number;
  testBars: number;
  truncated: boolean;
  objective: Objective;
};

export function objectiveScore(m: Metrics, objective: Objective): number {
  if (objective === "lowdd") return -m.maxDd; // maximize the (negative) drawdown
  const v = m[objective];
  return Number.isFinite(v) ? v : -Infinity;
}

function score(m: Metrics, objective: Objective, minTrades: number): number {
  if (m.trades < minTrades) return -Infinity;
  return objectiveScore(m, objective);
}

/**
 * Walk-forward efficiency: how much of the in-sample edge survives out of
 * sample. ~1 means the tuned params generalize; far below 0 means the sweep
 * just curve-fit the train window.
 */
export function walkForwardEfficiency(trainScore: number, testScore: number): number | null {
  if (!Number.isFinite(trainScore) || !Number.isFinite(testScore) || Math.abs(trainScore) < 1e-9) {
    return null;
  }
  return testScore / trainScore;
}

/** Slice bars to [fromMs, toMs] (timestamps). Empty when nothing survives. */
export function sliceBarsByRange(bars: FeatureBar[], fromMs: number, toMs: number): FeatureBar[] {
  return bars.filter((b) => b.time >= fromMs && b.time <= toMs);
}

export type CompareRow = {
  id: string;
  label: string;
  group: string;
  metrics: Metrics;
  claimBlocked: boolean;
  trades: Trade[];
};

/**
 * Run EVERY strategy in the library (house + combo + ports) over the same
 * loaded bars with the same engine config. Full-sample metrics — the OOS gate
 * in the Tester still governs any "winning" claim.
 */
export function compareStrategies(bars: FeatureBar[], cfg: DeskConfig, tf: Timeframe): CompareRow[] {
  const rows: CompareRow[] = [];
  for (const opt of STRATEGY_SELECT_OPTIONS) {
    const strategyId = opt.id as DeskConfig["strategyId"];
    const rowCfg: DeskConfig = { ...cfg, strategyId };
    const signaled = applySignals(bars, rowCfg);
    const res = runBacktest(signaled, rowCfg, tf);
    rows.push({
      id: opt.id,
      label: opt.label,
      group: opt.group,
      metrics: res.metrics,
      claimBlocked: res.claimBlocked,
      trades: res.trades,
    });
  }
  return rows.sort((a, b) => b.metrics.sharpe - a.metrics.sharpe);
}

function runSlice(
  bars: FeatureBar[],
  cfg: DeskConfig,
  tf: Timeframe,
  from: number,
  to: number,
): { metrics: Metrics; trades: Trade[] } {
  const slice = bars.slice(from, to);
  const warmup = Math.min(cfg.warmup, Math.max(0, slice.length - 2));
  const e = new SimEngine(slice, { ...cfg, warmup }, tf);
  e.runToEnd();
  const metrics = computeMetrics(
    cfg.equity,
    e.equityCurve,
    e.trades,
    e.equityCurve.length,
    e.exposedBars,
  );
  return { metrics, trades: e.trades };
}

/**
 * Sweep the cartesian product of up to two axes. Every combo scores on the
 * train window; the best combo is then evaluated once on the untouched test
 * window next to the untuned control.
 */
export function runGrid({
  bars,
  cfg,
  tf,
  axes,
  objective,
  minTrades = 10,
  trainFrac = 0.7,
}: {
  bars: FeatureBar[];
  cfg: DeskConfig;
  tf: Timeframe;
  axes: GridAxis[];
  objective: Objective;
  minTrades?: number;
  trainFrac?: number;
}): GridResult {
  const validAxes = axes.filter((a) => a.values.length > 0);
  let combos: Array<Partial<Pick<DeskConfig, GridKey>>> = [{}];
  for (const axis of validAxes) {
    const next: Array<Partial<Pick<DeskConfig, GridKey>>> = [];
    for (const base of combos) {
      for (const v of axis.values) {
        next.push({ ...base, [axis.key]: v });
      }
    }
    combos = next;
  }
  const truncated = combos.length > MAX_COMBOS;
  if (truncated) combos = combos.slice(0, MAX_COMBOS);

  const n = bars.length;
  const trainEnd = Math.floor(n * trainFrac);
  let best: GridCombo | null = null;
  const rows: GridCombo[] = [];

  if (trainEnd > cfg.warmup + 50) {
    for (const params of combos) {
      const comboNeedsSignal = validAxes.some((a) => SIGNAL_GRID_KEYS.has(a.key));
      const comboBars = comboNeedsSignal
        ? applySignals(bars, { ...cfg, ...params })
        : bars;
      const { metrics } = runSlice(comboBars, { ...cfg, ...params }, tf, 0, trainEnd);
      const label = validAxes
        .map((a) => `${GRID_LABELS[a.key]}=${fmtVal(params[a.key])}`)
        .join(" · ");
      rows.push({ params, label, train: metrics, score: score(metrics, objective, minTrades) });
    }
    rows.sort((a, b) => b.score - a.score);
    best = rows[0] ?? null;
  }

  const testFrom = Math.max(0, trainEnd - cfg.warmup);
  const testBars = Math.max(0, n - testFrom);
  const bestNeedsSignal =
    best != null && validAxes.some((a) => SIGNAL_GRID_KEYS.has(a.key));
  const bestBars = bestNeedsSignal && best
    ? applySignals(bars, { ...cfg, ...best.params })
    : bars;
  const test = best && testBars > 100
    ? runSlice(bestBars, { ...cfg, ...best.params }, tf, testFrom, n).metrics
    : null;
  const control = testBars > 100 ? runSlice(bars, cfg, tf, testFrom, n).metrics : null;

  return {
    combos: rows,
    best,
    test,
    control,
    trainBars: trainEnd,
    testBars,
    truncated,
    objective,
  };
}

function fmtVal(v: unknown): string {
  if (v == null) return "mặc định";
  return typeof v === "number" ? String(v) : String(v);
}

// ---------------------------------------------------------------------------
// Monte Carlo
// ---------------------------------------------------------------------------

export type McResult = {
  paths: number;
  /** Percentiles of the final equity multiple (end / start). */
  finalP5: number;
  finalP50: number;
  finalP95: number;
  maxDdP5: number;
  maxDdP50: number;
  maxDdP95: number;
  probDd25: number;
  probDd50: number;
  /** Histogram bins of maxDD (width 5%, label = bin start). */
  ddHistogram: { from: number; count: number }[];
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[idx]!;
}

/**
 * Trade-sequence bootstrap: resample the realized trade PnLs with replacement
 * (seeded → deterministic), compound each path, and report the distribution
 * of max drawdown and final equity. Answers "how lucky was the order?".
 */
export function monteCarlo(
  trades: Trade[],
  initialEquity: number,
  opts: { paths?: number; seed?: number } = {},
): McResult {
  const paths = opts.paths ?? 500;
  const rng = mulberry32(opts.seed ?? 42);
  const pnls = trades.map((t) => t.pnl);
  const maxDds: number[] = [];
  const finals: number[] = [];
  for (let p = 0; p < paths; p++) {
    let eq = initialEquity;
    let peak = initialEquity;
    let dd = 0;
    for (let i = 0; i < pnls.length; i++) {
      // Index chosen with replacement from the same realized set.
      const pick = Math.floor(rng() * pnls.length);
      eq += pnls[pick]!;
      if (eq > peak) peak = eq;
      const draw = peak > 0 ? (peak - eq) / peak : 0;
      if (draw > dd) dd = draw;
    }
    maxDds.push(dd);
    finals.push(eq / initialEquity);
  }
  const dds = maxDds.slice().sort((a, b) => a - b);
  const fin = finals.slice().sort((a, b) => a - b);
  const bins = new Map<number, number>();
  for (const d of dds) {
    const from = Math.min(20, Math.floor((d * 100) / 5) * 5);
    bins.set(from, (bins.get(from) ?? 0) + 1);
  }
  return {
    paths,
    finalP5: percentile(fin, 5),
    finalP50: percentile(fin, 50),
    finalP95: percentile(fin, 95),
    maxDdP5: percentile(dds, 5),
    maxDdP50: percentile(dds, 50),
    maxDdP95: percentile(dds, 95),
    probDd25: dds.filter((d) => d >= 0.25).length / paths,
    probDd50: dds.filter((d) => d >= 0.5).length / paths,
    ddHistogram: [...bins.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([from, count]) => ({ from, count })),
  };
}

// ---------------------------------------------------------------------------
// Breakdown
// ---------------------------------------------------------------------------

export type StrategyRow = {
  strategy: string;
  trades: number;
  winRate: number;
  pnl: number;
  avgR: number;
  avgBars: number;
  mfeAvg: number;
  maeAvg: number;
};

/** Per-strategy contribution stats from one backtest's trade list. */
export function strategyBreakdown(trades: Trade[]): StrategyRow[] {
  const groups = new Map<string, Trade[]>();
  for (const t of trades) {
    const list = groups.get(t.strategy) ?? [];
    list.push(t);
    groups.set(t.strategy, list);
  }
  const rows: StrategyRow[] = [];
  for (const [strategy, list] of groups) {
    const wins = list.filter((t) => t.pnl > 0);
    rows.push({
      strategy,
      trades: list.length,
      winRate: list.length ? wins.length / list.length : 0,
      pnl: list.reduce((s, t) => s + t.pnl, 0),
      avgR: list.length ? list.reduce((s, t) => s + t.pnlR, 0) / list.length : 0,
      avgBars: list.length ? list.reduce((s, t) => s + t.barsHeld, 0) / list.length : 0,
      mfeAvg: list.length ? list.reduce((s, t) => s + t.mfeR, 0) / list.length : 0,
      maeAvg: list.length ? list.reduce((s, t) => s + t.maeR, 0) / list.length : 0,
    });
  }
  return rows.sort((a, b) => b.pnl - a.pnl);
}


// ---------------------------------------------------------------------------
// Period breakdown (per year / per quarter)
// ---------------------------------------------------------------------------

export type PeriodRow = {
  label: string;
  start: number;
  end: number;
  netPnl: number;
  /** Equity multiple over the period: end/start − 1 (start = equity at the period boundary). */
  netPct: number;
  /** Max drawdown measured within the period only. */
  maxDd: number;
  trades: number;
  winRate: number;
};

function periodKey(time: number, mode: "year" | "quarter"): string {
  const d = new Date(time);
  if (mode === "year") return String(d.getUTCFullYear());
  return `${d.getUTCFullYear()}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`;
}

/**
 * Split the equity curve into calendar periods (UTC) and report the PnL of
 * each: net pnl (absolute), net % (against equity at the period boundary),
 * in-period max drawdown, and the trades that CLOSED inside the period.
 * Mark-to-market curve means unrealized PnL lands in the period it happened.
 */
export function periodBreakdown(
  equity: EquityPoint[],
  trades: Trade[],
  initialEquity: number,
  mode: "year" | "quarter",
): PeriodRow[] {
  if (equity.length === 0) return [];
  const groups: Array<{ key: string; start: number; end: number; points: EquityPoint[] }> = [];
  for (const p of equity) {
    const key = periodKey(p.time, mode);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.points.push(p);
      last.end = p.time;
    } else {
      groups.push({ key, start: p.time, end: p.time, points: [p] });
    }
  }
  // Trade attribution uses the CALENDAR end of the period, not the last
  // equity point — the curve may have no samples near the boundary.
  const periodEndMs = (key: string): number => {
    if (mode === "year") return Date.UTC(Number(key) + 1, 0, 1) - 1;
    const [y, q] = key.split("-Q");
    return Date.UTC(Number(y), Number(q) * 3, 1) - 1;
  };

  const rows: PeriodRow[] = [];
  let boundary = initialEquity;
  for (const g of groups) {
    const endEquity = g.points[g.points.length - 1]!.equity;
    const netPct = boundary > 0 ? endEquity / boundary - 1 : 0;
    let peak = boundary;
    let maxDd = 0;
    for (const p of g.points) {
      peak = Math.max(peak, p.equity);
      const dd = peak > 0 ? (peak - p.equity) / peak : 0;
      if (dd > maxDd) maxDd = dd;
    }
    const closed = trades.filter((t) => t.exitTime >= g.start && t.exitTime <= periodEndMs(g.key));
    const wins = closed.filter((t) => t.pnl > 0);
    rows.push({
      label: g.key,
      start: g.start,
      end: g.end,
      netPnl: endEquity - boundary,
      netPct,
      maxDd,
      trades: closed.length,
      winRate: closed.length ? wins.length / closed.length : 0,
    });
    boundary = endEquity;
  }
  return rows;
}
