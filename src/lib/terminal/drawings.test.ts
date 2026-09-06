import assert from "node:assert/strict";
import { test } from "node:test";
import { distToSegment, drawingHitPx, drawingStorageKey, fibPrices, FIB_LEVELS, makeDrawing } from "./drawings.ts";

test("fib levels span the anchor range in canonical ratios", () => {
  const levels = fibPrices(100, 200);
  assert.deepEqual(levels, FIB_LEVELS.map((r) => 100 + r * 100));
  // Direction-agnostic: reversed anchors give the same levels.
  assert.deepEqual(fibPrices(200, 100), levels);
});

test("distance to segment clamps to endpoints", () => {
  assert.equal(distToSegment(0, 0, 10, 0, 20, 0), 10); // before start
  assert.equal(distToSegment(15, 5, 10, 0, 20, 0), 5); // perpendicular
  assert.equal(distToSegment(30, 0, 10, 0, 20, 0), 10); // after end
  assert.equal(distToSegment(10, 0, 10, 0, 10, 10), 0); // degenerate segment
});

test("eraser hit-test measures hlines by y and fib by nearest level", () => {
  const toXY = (p: { time: number; price: number }) => ({ x: p.time, y: 100 - p.price });
  const hline = makeDrawing("hline", [{ time: 0, price: 90 }], "BTC/USDT", "1h");
  assert.equal(drawingHitPx(hline, 500, 15, toXY, 1000), 5); // y(90)=10
  const fib = makeDrawing(
    "fib",
    [
      { time: 0, price: 100 },
      { time: 10, price: 200 },
    ],
    "BTC/USDT",
    "1h",
  );
  // Level 0 (price 100 → y 0) is far closer than level 1 (price 200 → y −100).
  const d = drawingHitPx(fib, 5, 2, toXY, 1000);
  assert.ok(d != null && d < 3);
  // Out-of-range anchors (toXY null) → no hit.
  const miss = drawingHitPx(fib, 5, 2, () => null, 1000);
  assert.equal(miss, null);
});

test("storage key isolates drawings per symbol and timeframe", () => {
  assert.equal(drawingStorageKey("BTC/USDT", "4h"), "vela-drawings:BTC/USDT:4h");
  assert.notEqual(drawingStorageKey("BTC/USDT", "4h"), drawingStorageKey("BTC/USDT", "1h"));
  assert.ok(makeDrawing("trend", [], "BTC/USDT", "1h").id.length > 0);
});
