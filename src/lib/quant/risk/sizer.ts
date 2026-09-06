import { clamp } from "../math.ts";
import { REVERSION_CLASS } from "../strategy/library.ts";
import type { DeskConfig, FeatureBar, PositionSide, StrategyId } from "../types.ts";

export type StopPlan = {
  stop: number;
  riskPerUnit: number;
  dist: number;
};

export type StopOptions = {
  stopAtrMin: number;
  stopAtrMax: number;
  mrStopAtr: number;
  swingLookback: number;
};

export const DEFAULT_STOP_OPTIONS: StopOptions = {
  stopAtrMin: 1.2,
  stopAtrMax: 2.5,
  mrStopAtr: 1.8,
  swingLookback: 8,
};

/**
 * Stop = swing extremum, clamped to [stopAtrMin, stopAtrMax] × ATR from the
 * reference price. Mean-reversion uses a fixed mrStopAtr × ATR.
 */
export function planStop(
  bars: FeatureBar[],
  i: number,
  side: PositionSide,
  strategy: StrategyId,
  refPrice: number,
  opts: StopOptions = DEFAULT_STOP_OPTIONS,
): StopPlan | null {
  const atr = bars[i]!.atr;
  if (atr == null || atr <= 0) return null;
  if (REVERSION_CLASS.has(strategy)) {
    const dist = opts.mrStopAtr * atr;
    const stop = side === "long" ? refPrice - dist : refPrice + dist;
    return { stop, dist, riskPerUnit: dist };
  }
  const from = Math.max(0, i - opts.swingLookback);
  let swing = side === "long" ? bars[from]!.low : bars[from]!.high;
  for (let k = from; k <= i; k++) {
    if (side === "long") swing = Math.min(swing, bars[k]!.low);
    else swing = Math.max(swing, bars[k]!.high);
  }
  const raw = side === "long" ? refPrice - swing : swing - refPrice;
  const dist = clamp(raw, opts.stopAtrMin * atr, opts.stopAtrMax * atr);
  const stop = side === "long" ? refPrice - dist : refPrice + dist;
  return { stop, dist, riskPerUnit: dist };
}

export function sizeQty(
  equity: number,
  cfg: DeskConfig,
  fill: number,
  riskPerUnit: number,
): number {
  if (riskPerUnit <= 0 || fill <= 0 || equity <= 0) return 0;
  const riskUsdt = equity * cfg.riskPct;
  let qty = riskUsdt / riskPerUnit;
  const maxNotional = equity * cfg.maxExposure * cfg.maxLeverage;
  qty = Math.min(qty, maxNotional / fill);
  if (qty * fill < 10) return 0;
  return qty;
}

export function applySlippage(price: number, side: PositionSide, isEntry: boolean, bps: number): number {
  const slip = bps / 10_000;
  if (side === "long") return isEntry ? price * (1 + slip) : price * (1 - slip);
  return isEntry ? price * (1 - slip) : price * (1 + slip);
}

export function feeOn(notional: number, takerFee: number): number {
  return Math.abs(notional) * takerFee;
}
