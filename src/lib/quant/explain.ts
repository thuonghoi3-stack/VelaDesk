import type { DeskConfig, FeatureBar } from "./types.ts";
import type { RuleCheck } from "./strategy/base.ts";
import { explainTrendLong, explainTrendShort } from "./strategy/trend-pullback.ts";
import { explainMrLong, explainMrShort } from "./strategy/mean-reversion.ts";

export type StrategyExplain = {
  trendLong: RuleCheck[];
  trendShort: RuleCheck[];
  mrLong: RuleCheck[];
  mrShort: RuleCheck[];
  trendLongPass: boolean;
  trendShortPass: boolean;
  mrLongPass: boolean;
  mrShortPass: boolean;
};

export function explainLastBar(bars: FeatureBar[], cfg: DeskConfig): StrategyExplain | null {
  if (bars.length === 0) return null;
  const ctx = {
    bars,
    i: bars.length - 1,
    tradeVolatility: cfg.tradeVolatility,
    allowShort: cfg.side === "both",
    volSpikeMin: cfg.volSpikeMin,
    mrRsiLongMax: cfg.mrRsiLongMax,
    mrRsiShortMin: cfg.mrRsiShortMin,
    mrAdxMax: cfg.mrAdxMax,
  };
  const trendLong = explainTrendLong(ctx);
  const trendShort = explainTrendShort(ctx);
  const mrLong = explainMrLong(ctx);
  const mrShort = explainMrShort(ctx);
  return {
    trendLong,
    trendShort,
    mrLong,
    mrShort,
    trendLongPass: trendLong.every((r) => r.pass),
    trendShortPass: trendShort.every((r) => r.pass),
    mrLongPass: mrLong.every((r) => r.pass),
    mrShortPass: mrShort.every((r) => r.pass),
  };
}
