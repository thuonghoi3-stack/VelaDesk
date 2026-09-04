import { clamp } from "../math";
import type { DeskConfig, FeatureBar, PositionSide } from "../types";

export type StopPlan = {
  stop: number;
  riskPerUnit: number;
  dist: number;
};

/**
 * Stop = swing extremum, clamped to [1.2, 2.5] × ATR from reference price.
 * Mean-reversion uses a fixed 1.8 × ATR.
 */
export function planStop(
  bars: FeatureBar[],
  i: number,
  side: PositionSide,
  strategy: "trend_pullback" | "mean_reversion",
  refPrice: number,
): StopPlan | null {
  const atr = bars[i]!.atr;
  if (atr == null || atr <= 0) return null;
  if (strategy === "mean_reversion") {
    const dist = 1.8 * atr;
    const stop = side === "long" ? refPrice - dist : refPrice + dist;
    return { stop, dist, riskPerUnit: dist };
  }
  const look = 8;
  const from = Math.max(0, i - look);
  let swing = side === "long" ? bars[from]!.low : bars[from]!.high;
  for (let k = from; k <= i; k++) {
    if (side === "long") swing = Math.min(swing, bars[k]!.low);
    else swing = Math.max(swing, bars[k]!.high);
  }
  const raw = side === "long" ? refPrice - swing : swing - refPrice;
  const dist = clamp(raw, 1.2 * atr, 2.5 * atr);
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
