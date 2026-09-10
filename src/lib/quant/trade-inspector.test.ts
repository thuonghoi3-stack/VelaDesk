import assert from "node:assert/strict";
import { test } from "node:test";
import type { Trade } from "./types.ts";
import * as inspector from "./trade-inspector.ts";

const base: Trade = {
  id: "a",
  side: "long",
  strategy: "trend_pullback",
  entryTime: 0,
  exitTime: 3600000,
  entry: 100,
  exit: 110,
  qty: 2,
  pnl: 18,
  pnlR: 1,
  mfeR: 2,
  maeR: 0.5,
  fees: 2,
  funding: 1,
  reason: "tp1",
  barsHeld: 4,
};
const trades: readonly Trade[] = Object.freeze([
  Object.freeze(base),
  Object.freeze({
    ...base,
    id: "b",
    side: "short" as const,
    reason: "stop",
    pnl: -12,
    exitTime: 7200000,
  }),
  Object.freeze({ ...base, id: "c", reason: "tp2", pnl: 30, exitTime: 7200000 }),
  Object.freeze({
    ...base,
    id: "d",
    strategy: "mean_reversion" as const,
    reason: "stop",
    pnl: 0,
    exitTime: 1800000,
  }),
]);
test("summarizes retained and excluded exit legs using log PnL, not fee-adjusted account net", () => {
  assert.equal(typeof inspector.inspectTrades, "function");
  const result = inspector.inspectTrades(
    trades,
    { side: "long", reason: "all", search: "" },
    "pnl-desc",
  );
  assert.deepEqual(result.retained, { count: 3, pnl: 48, ev: 16 });
  assert.deepEqual(result.excluded, { count: 1, pnl: -12, ev: -12 });
  assert.deepEqual(
    result.rows.map((t) => t.id),
    ["c", "a", "d"],
  );
  const empty = inspector.inspectTrades(
    [],
    { side: "all", reason: "all", search: "" },
    "time-desc",
  );
  assert.deepEqual(empty.retained, { count: 0, pnl: 0, ev: null });
  assert.deepEqual(empty.excluded, empty.retained);
  const none = inspector.inspectTrades(
    trades,
    { side: "all", reason: "missing", search: "" },
    "time-desc",
  );
  assert.deepEqual(none.retained, empty.retained);
  assert.deepEqual(none.excluded, { count: 4, pnl: 36, ev: 9 });
});

test("sorts PnL and exit time in both directions, retaining input order on ties", () => {
  assert.equal(typeof inspector.sortTrades, "function");
  const ids = (sort: import("./trade-inspector.ts").TradeSort) =>
    inspector.sortTrades(trades, sort).map((t) => t.id);
  assert.deepEqual(ids("pnl-desc"), ["c", "a", "d", "b"]);
  assert.deepEqual(ids("pnl-asc"), ["b", "d", "a", "c"]);
  assert.deepEqual(ids("time-desc"), ["b", "c", "a", "d"]);
  assert.deepEqual(ids("time-asc"), ["d", "a", "b", "c"]);
  assert.deepEqual(
    trades.map((t) => t.id),
    ["a", "b", "c", "d"],
  );
});

test("filters side, exact exit reason and case-insensitive trimmed search without mutating legs", () => {
  assert.equal(typeof inspector.filterTrades, "function");
  assert.deepEqual(
    inspector
      .filterTrades(trades, { side: "long", reason: "tp1", search: " TREND " })
      .map((t) => t.id),
    ["a"],
  );
  assert.deepEqual(
    inspector.filterTrades(trades, { side: "short", reason: "tp1", search: "" }),
    [],
  );
  assert.deepEqual(
    inspector.filterTrades(trades, { side: "all", reason: "all", search: "STOP" }).map((t) => t.id),
    ["b", "d"],
  );
  assert.deepEqual(
    inspector.filterTrades(trades, { side: "all", reason: "all", search: "  " }),
    trades,
  );
});
