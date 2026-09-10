import type { BacktestResult, DataSource, DeskConfig, FeatureBar, Trade } from "./types.ts";

/** Owned by a single completed run; never inferred from the current desk. */
export type TradeRunSnapshot = {
  result: BacktestResult;
  bars: FeatureBar[];
  cfg: DeskConfig;
  source: DataSource | null;
  sourceNote: string;
  datasetKey: string;
};

/** Epoch-ms bounds are actual bar timestamps, not guessed timeframe arithmetic. */
export function focusTrade(
  bars: readonly { time: number }[],
  trade: Pick<Trade, "entryTime" | "exitTime">,
  context = 24,
): { entryIndex: number; exitIndex: number; from: number; to: number } | null {
  if (!Number.isSafeInteger(context) || context < 0) return null;
  if (!Number.isFinite(trade.entryTime) || !Number.isFinite(trade.exitTime)) return null;
  if (bars.some((bar, i) => !Number.isFinite(bar.time) || (i > 0 && bar.time <= bars[i - 1]!.time)))
    return null;
  const entryIndex = bars.findIndex((bar) => bar.time === trade.entryTime);
  const exitIndex = bars.findIndex((bar) => bar.time === trade.exitTime);
  if (entryIndex < 0 || exitIndex < entryIndex) return null;
  return {
    entryIndex,
    exitIndex,
    from: bars[Math.max(0, entryIndex - context)]!.time,
    to: bars[Math.min(bars.length - 1, exitIndex + context)]!.time,
  };
}
