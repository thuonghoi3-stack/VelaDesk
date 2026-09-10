import type { DeskConfig, Timeframe } from "../types.ts";

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const FUNDING_INTERVAL_MS = 8 * 60 * 60 * 1000;

/** Count UTC 00/08/16 boundaries in (fromExclusive, toInclusive].
 * Entry instant is excluded; a settlement at the current instant is included.
 * No timeframe rounding, future timestamps or interpolated prices are used.
 */
export function fundingPeriodsBetween(fromExclusive: number, toInclusive: number): number {
  if (!Number.isFinite(fromExclusive) || !Number.isFinite(toInclusive) || toInclusive <= fromExclusive) return 0;
  return Math.floor(toInclusive / FUNDING_INTERVAL_MS) - Math.floor(fromExclusive / FUNDING_INTERVAL_MS);
}

/** Legacy schedule predicate. For elapsed-time accounting use fundingPeriodsBetween. */
export function isFundingBar(time: number, tf: Timeframe): boolean {
  const d = new Date(time);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  if (m !== 0) return false;
  if (tf === "1d") return h === 0;
  return h % 8 === 0;
}

/** Legacy whole-bar approximation; subdaily callers gate with isFundingBar.
 * Daily/weekly assume constant notional for the entire bar. Prefer elapsed API.
 */
export function fundingCharge(
  notional: number,
  cfg: DeskConfig,
  tf: Timeframe,
): number {
  if (cfg.market !== "usdm") return 0;
  if (tf === "1w") return Math.abs(notional) * cfg.fundingPer8h * 21;
  if (tf === "1d") return Math.abs(notional) * cfg.fundingPer8h * 3;
  return Math.abs(notional) * cfg.fundingPer8h;
}

/** Fixed configured-rate approximation, charged equally to longs and shorts.
 * Not historical signed exchange funding: positive rates are costs for BOTH
 * sides; negative configured rates (legacy compatibility) credit BOTH sides.
 * At an opening-time settlement supply known OPEN notional, never that bar's
 * future close. Caller owns position eligibility and clamps from to entry time.
 * Elapsed intervals are retrospective; do not pass a future bar-end timestamp.
 */
export function fundingChargeBetween(
  notional: number,
  cfg: DeskConfig,
  fromExclusive: number,
  toInclusive: number,
): number {
  if (cfg.market !== "usdm") return 0;
  return Math.abs(notional) * cfg.fundingPer8h * fundingPeriodsBetween(fromExclusive, toInclusive);
}

export function dailyLossBreached(
  dayPnl: number,
  startEquity: number,
  cfg: DeskConfig,
): boolean {
  return dayPnl <= -cfg.dailyLossCap * startEquity;
}
