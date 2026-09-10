import type { Trade } from "./types.ts";

export type TradeSort = "pnl-asc" | "pnl-desc" | "time-asc" | "time-desc";

export function sortTrades(trades: readonly Trade[], sort: TradeSort): Trade[] {
  const field = sort.startsWith("pnl") ? "pnl" : "exitTime";
  const direction = sort.endsWith("asc") ? 1 : -1;
  return [...trades].sort((a, b) => direction * (a[field] - b[field]));
}

export type TradeSummary = { count: number; pnl: number; ev: number | null };

export function inspectTrades(trades: readonly Trade[], filters: TradeFilters, sort: TradeSort) {
  const rows = filterTrades(trades, filters);
  const retainedSet = new Set(rows);
  const summarize = (group: readonly Trade[]): TradeSummary => {
    const pnl = group.reduce((sum, t) => sum + t.pnl, 0);
    return { count: group.length, pnl, ev: group.length ? pnl / group.length : null };
  };
  return {
    rows: sortTrades(rows, sort),
    retained: summarize(rows),
    excluded: summarize(trades.filter((t) => !retainedSet.has(t))),
  };
}

export type TradeFilters = { side: "all" | Trade["side"]; reason: string; search: string };

/** Each input record is an exit leg, never deduplicated into a position. */
export function filterTrades(trades: readonly Trade[], filters: TradeFilters): Trade[] {
  const query = filters.search.trim().toLowerCase();
  return trades.filter(
    (t) =>
      (filters.side === "all" || t.side === filters.side) &&
      (filters.reason === "all" || t.reason === filters.reason) &&
      (!query ||
        [t.id, t.symbol ?? "", t.side, t.strategy, t.reason]
          .join(" ")
          .toLowerCase()
          .includes(query)),
  );
}
