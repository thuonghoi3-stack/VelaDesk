import { z } from "zod";
import { STRATEGY_SELECT_OPTIONS } from "./strategy/library.ts";
import { defaultConfig } from "./config.ts";
import { SimEngine } from "./backtest/engine.ts";
import { computeMetrics } from "./backtest/metrics.ts";
import { applySignals } from "./pipeline.ts";
import type {
  DeskConfig,
  FeatureBar,
  StrategySelection,
  Metrics,
  EquityPoint,
  Trade,
} from "./types.ts";

export type PlaybookDraft = {
  name: string;
  hypothesis: string;
  strategyId: StrategySelection;
  notes: string;
};
export type ExperimentWindow = { metrics: Metrics; equity: EquityPoint[]; trades: Trade[] };
export type ExperimentRun = {
  id: string;
  createdAt: string;
  draft: PlaybookDraft;
  config: DeskConfig;
  provenance: {
    fingerprint: string;
    source: string;
    sourceNote: string;
    barCount: number;
    firstTime: number;
    lastTime: number;
    testStart: number;
    split: number;
  };
  train: ExperimentWindow;
  test: ExperimentWindow;
};
export type PlaybookNotebook = { version: 1; draft: PlaybookDraft; runs: ExperimentRun[] };
export const NOTEBOOK_KEY = "veladesk.playbook.v1";
const draftSchema = z.object({
  name: z.string(),
  hypothesis: z.string(),
  notes: z.string(),
  strategyId: z.string().refine((id) => STRATEGY_SELECT_OPTIONS.some((s) => s.id === id)),
});
const numberSchema = z.custom<number>((v) => typeof v === "number" && !Number.isNaN(v));
const metricsSchema = z.object(
  Object.fromEntries(
    Object.keys(computeMetrics(10000, [], [], 0, 0)).map((key) => [key, numberSchema]),
  ),
);
const configSchema = z.object(
  Object.fromEntries(
    Object.entries(defaultConfig()).map(([key, value]) => [
      key,
      typeof value === "number"
        ? z.number()
        : typeof value === "boolean"
          ? z.boolean()
          : Array.isArray(value)
            ? z.array(z.string())
            : z.string(),
    ]),
  ),
);
const windowSchema = z.object({
  metrics: metricsSchema,
  equity: z.array(z.object({ time: z.number(), equity: z.number(), drawdown: z.number() })),
  trades: z.array(
    z
      .object({ id: z.string(), entryTime: z.number(), exitTime: z.number(), pnl: z.number() })
      .passthrough(),
  ),
});
const notebookSchema = z.object({
  version: z.literal(1),
  draft: draftSchema,
  runs: z
    .array(
      z.object({
        id: z.string(),
        createdAt: z.string(),
        draft: draftSchema,
        config: configSchema,
        provenance: z.object({
          fingerprint: z.string(),
          source: z.string(),
          sourceNote: z.string(),
          barCount: z.number(),
          firstTime: z.number(),
          lastTime: z.number(),
          testStart: z.number(),
          split: z.number(),
        }),
        train: windowSchema,
        test: windowSchema,
      }),
    )
    .max(20),
});
export function serializeNotebook(book: PlaybookNotebook): string {
  return JSON.stringify(
    book,
    (_key, value) =>
      typeof value === "number" && !Number.isFinite(value) ? { $number: String(value) } : value,
    2,
  );
}
export function parseNotebook(text: string): PlaybookNotebook {
  try {
    const value = JSON.parse(text, (_key, v) =>
      v &&
      typeof v === "object" &&
      Object.keys(v).length === 1 &&
      (v.$number === "Infinity" || v.$number === "-Infinity")
        ? Number(v.$number)
        : v,
    );
    return freeze(notebookSchema.parse(value) as unknown as PlaybookNotebook);
  } catch {
    throw new Error(
      "Notebook không hợp lệ hoặc phiên bản không được hỗ trợ. Dữ liệu cũ chưa bị ghi đè.",
    );
  }
}
function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export function runExperiment(input: {
  bars: FeatureBar[];
  cfg: DeskConfig;
  source: string;
  sourceNote: string;
  draft: PlaybookDraft;
  id: string;
  createdAt: string;
}): ExperimentRun {
  if (!input.source.trim()) throw new Error("Chưa xác định nguồn dữ liệu.");
  if (!input.draft.name.trim()) throw new Error("Tên playbook không được để trống.");
  if (
    Object.values(input.cfg).some((v) => typeof v === "number" && !Number.isFinite(v)) ||
    input.cfg.equity <= 0 ||
    !Number.isInteger(input.cfg.warmup) ||
    input.cfg.warmup < 0
  )
    throw new Error("Kiểm tra cấu hình vốn và warmup.");
  const trainCount = Math.floor(input.bars.length * 0.7);
  if (trainCount < input.cfg.warmup + 50 || input.bars.length - trainCount < 50)
    throw new Error("Thiếu nến: train cần warmup + 50, test cần ít nhất 50 nến.");
  if (!STRATEGY_SELECT_OPTIONS.some((s) => s.id === input.draft.strategyId))
    throw new Error("ID chiến lược không hợp lệ.");
  let hash = 2166136261;
  for (let i = 0; i < input.bars.length; i++) {
    const b = input.bars[i]!;
    if (
      ![b.time, b.open, b.high, b.low, b.close, b.volume].every(Number.isFinite) ||
      b.open <= 0 ||
      b.close <= 0 ||
      b.low <= 0 ||
      b.high < Math.max(b.open, b.close, b.low) ||
      b.low > Math.min(b.open, b.close) ||
      b.volume < 0 ||
      (i > 0 && b.time <= input.bars[i - 1]!.time)
    )
      throw new Error("Dữ liệu nến không hợp lệ hoặc thời gian không tăng.");
    // Non-cryptographic sample identifier, not an authenticity proof. Include enriched causal inputs.
    const { signal: _signal, signalReason: _reason, strategy: _strategy, ...features } = b;
    for (const char of JSON.stringify(features))
      hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  }
  const fingerprint = `fnv1a32:${(hash >>> 0).toString(16).padStart(8, "0")}`;
  const config = structuredClone({ ...input.cfg, strategyId: input.draft.strategyId });
  const bars = applySignals(input.bars, config);
  const cut = Math.floor(bars.length * 0.7);
  const train = new SimEngine(bars.slice(0, cut), config, config.ltf);
  const test = new SimEngine(bars, config, config.ltf, cut);
  const result = (engine: SimEngine): ExperimentWindow => {
    engine.runToEnd();
    return {
      metrics: computeMetrics(
        config.equity,
        engine.equityCurve,
        engine.trades,
        engine.equityCurve.length,
        engine.exposedBars,
      ),
      equity: engine.equityCurve,
      trades: engine.trades,
    };
  };
  return freeze({
    id: input.id,
    createdAt: input.createdAt,
    draft: structuredClone(input.draft),
    config,
    provenance: {
      fingerprint,
      source: input.source,
      sourceNote: input.sourceNote,
      barCount: bars.length,
      firstTime: bars[0]!.time,
      lastTime: bars.at(-1)!.time,
      testStart: bars[cut]!.time,
      split: 0.7,
    },
    train: result(train),
    test: result(test),
  });
}
