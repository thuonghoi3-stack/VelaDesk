import type { DeskConfig, FeatureBar } from "./types";
import type { RuleCheck } from "./strategy/base";
import { explainTrendLong, explainTrendShort } from "./strategy/trend-pullback";
import { explainMrLong, explainMrShort } from "./strategy/mean-reversion";

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
