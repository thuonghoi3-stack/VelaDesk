import { INTERVAL_MS } from "../config";
import type { DeskConfig, Timeframe } from "../types";

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isFundingBar(time: number, tf: Timeframe): boolean {
  const d = new Date(time);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (m !== 0) return false;
  if (tf === "1d") return h === 0;
  return h % 8 === 0;
}

export function fundingCharge(
  notional: number,
  cfg: DeskConfig,
  tf: Timeframe,
): number {
  if (cfg.market !== "usdm") return 0;
  if (tf === "1d") return Math.abs(notional) * cfg.fundingPer8h * 3;
  return Math.abs(notional) * cfg.fundingPer8h;
}

export function dailyLossBreached(
  dayPnl: number,
  startEquity: number,
  cfg: DeskConfig,
): boolean {
  return dayPnl <= -cfg.dailyLossCap * startEquity;
}

export function barsUntilFundingHint(tf: Timeframe): number {
  return Math.max(1, Math.round((8 * 60 * 60 * 1000) / INTERVAL_MS[tf]));
}
