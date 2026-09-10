import assert from "node:assert/strict";
import test from "node:test";
import * as data from "./chart-data.ts";
import type { FeatureBar, Trade } from "../../lib/quant/types.ts";

test("compact canvas labels preserve execution identity, exact prices and causal semantic descriptions", () => {
  const bars = [1000, 2000].map(time => ({time, signal: 0}) as FeatureBar);
  for (const side of ["long", "short"] as const) {
    const trade = {id:"exact", side, entryTime:1000, exitTime:2000, entry:12345.678901234, exit:12345.679012345, reason:"stop"} as Trade;
    const original = structuredClone(trade);
    const markers = data.buildChartMarkers(bars, [trade]);
    const compact = data.compactExecutionMarker;
    assert.equal(typeof compact, "function", "compact renderer must exist");
    assert.deepEqual(markers.map(compact).map((m: any) => m.text), ["Entry", "Exit"]);
    markers.forEach((marker, i) => {
      const shown = compact(marker);
      assert.ok("price" in shown);
      assert.equal(shown.id, marker.id);
      assert.equal(shown.time, marker.time);
      assert.equal(shown.price, i ? trade.exit : trade.entry);
      assert.ok(marker.text?.includes(String(i ? trade.exit : trade.entry)));
    });
    assert.deepEqual(trade, original);
    assert.equal(data.buildChartMarkers(bars.slice(0,1), [trade]).map(compact).length, 1);
    const signal = {time:1, text:"S", shape:"arrowDown"} as Parameters<typeof compact>[0];
    assert.deepEqual(compact(signal), signal);
  }
});
