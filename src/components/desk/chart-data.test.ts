import assert from "node:assert/strict";
import test from "node:test";
import { prepareChartData, syncSeries, buildChartMarkers } from "./chart-data.ts";
import type { FeatureBar, Trade } from "../../lib/quant/types.ts";

test("trade markers use actual execution prices and omit future or unmatched times", () => {
  const bars = [bar(1000), bar(2000)];
  const trade = {
    id: "t",
    side: "long",
    entryTime: 1000,
    exitTime: 3000,
    entry: 10.2,
    exit: 11.8,
    reason: "signal",
  } as Trade;
  const before = buildChartMarkers(bars, [trade]);
  assert.equal(before.length, 1);
  assert.equal(before[0].text, "Long entry 10.2");
  assert.equal("price" in before[0] && before[0].price, 10.2);
  const after = buildChartMarkers([...bars, bar(3000)], [trade]);
  assert.equal(after.length, 2);
  assert.equal(after[1].text, "Exit 11.8 · signal");
  assert.equal(buildChartMarkers([], [trade]).length, 0);
  assert.equal(buildChartMarkers(bars, [{ ...trade, entryTime: 1500 }]).length, 1);
  assert.equal(buildChartMarkers(bars, [{ ...trade, entryTime: 4000 }]).length, 0);
});

const bar = (time: number, patch: Partial<FeatureBar> = {}): FeatureBar =>
  ({
    time,
    open: 10,
    high: 12,
    low: 9,
    close: 11,
    volume: 100,
    ema20: null,
    ema50: null,
    bbUpper: null,
    bbLower: null,
    signal: 0,
    ...patch,
  }) as FeatureBar;

test("prepares sorted unique seconds without changing inputs or computing indicators", () => {
  const input = [bar(2000), bar(1000), bar(2500, { close: 12, ema20: 10.5 }), bar(NaN)];
  const data = prepareChartData(input);
  assert.deepEqual(
    data.candle.map((b) => [b.time, b.close]),
    [
      [1, 11],
      [2, 12],
    ],
  );
  assert.deepEqual(data.ema20, [{ time: 1 }, { time: 2, value: 10.5 }]);
  assert.equal(input[0].time, 2000);
  assert.equal(data.volume[1].value, 100);
});

test("series appends incrementally but replaces on rewind, historical edit and empty reset", () => {
  type Point = { time: number; value: number };
  let stored: Point[] = [];
  let replacements = 0;
  let updates = 0;
  const sink = {
    setData(data: Point[]) {
      replacements++;
      stored = [...data];
    },
    update(point: Point) {
      updates++;
      const i = stored.findIndex((p) => p.time === point.time);
      if (i < 0) stored.push(point);
      else stored[i] = point;
    },
  };
  const a = [{ time: 1, value: 2 }];
  syncSeries(sink, [], a);
  const b = [...a, { time: 2, value: 3 }];
  syncSeries(sink, a, b);
  assert.equal(replacements, 1);
  assert.equal(updates, 1);
  syncSeries(
    sink,
    b,
    b.map((p) => ({ ...p })),
  );
  assert.equal(updates, 1);
  const revised = [{ time: 1, value: 8 }, b[1]];
  syncSeries(sink, b, revised);
  assert.equal(replacements, 2);
  syncSeries(sink, revised, a);
  assert.deepEqual(stored, a);
  syncSeries(sink, a, []);
  assert.deepEqual(stored, []);
  assert.equal(replacements, 4);
});
