import assert from "node:assert/strict";
import { test } from "node:test";
import { focusTrade } from "./trade-focus.ts";
import { generateSynthetic } from "./data/synthetic.ts";
import { defaultConfig } from "./config.ts";
import { buildDesk } from "./pipeline.ts";
import { runBacktest } from "./backtest/engine.ts";

test("locates actual engine exit legs in the exact run bars, including a date slice", () => {
  const cfg = defaultConfig();
  const ltf = generateSynthetic(cfg.symbol, cfg.ltf, 1200);
  const htf = generateSynthetic(cfg.symbol, cfg.htf, 500);
  const all = buildDesk(ltf, htf, cfg).ltf;
  for (const bars of [all, all.slice(200)]) {
    const result = runBacktest(bars, cfg, cfg.ltf);
    assert.ok(result.trades.length > 0);
    for (const trade of result.trades) {
      const focus = focusTrade(bars, trade);
      assert.ok(focus);
      assert.equal(bars[focus.entryIndex]!.time, trade.entryTime);
      assert.equal(bars[focus.exitIndex]!.time, trade.exitTime);
      assert.ok(focus.from <= trade.entryTime && focus.to >= trade.exitTime);
    }
  }
});

test("rejects mismatches, malformed chronology and invalid context rather than snapping", () => {
  const trade = { entryTime: 120_000, exitTime: 600_000 };
  for (const input of [
    [],
    [{ time: 120_000 }],
    [...bars].reverse(),
    [...bars, bars[5]!],
    [{ time: NaN }, ...bars],
  ]) {
    assert.equal(focusTrade(input, trade), null);
  }
  assert.equal(focusTrade(bars, { ...trade, entryTime: 120_001 }), null);
  assert.equal(focusTrade(bars, { entryTime: 600_000, exitTime: 120_000 }), null);
  for (const context of [-1, 0.5, NaN, Infinity])
    assert.equal(focusTrade(bars, trade, context), null);
});
test("clamps context and allows same-bar exits without mutating inputs", () => {
  assert.deepEqual(focusTrade(bars, { entryTime: 0, exitTime: 0 }), {
    entryIndex: 0,
    exitIndex: 0,
    from: 0,
    to: 720_000,
  });
  assert.deepEqual(focusTrade(bars, { entryTime: 720_000, exitTime: 720_000 }, 0), {
    entryIndex: 5,
    exitIndex: 5,
    from: 720_000,
    to: 720_000,
  });
  assert.equal(bars.length, 6);
});

const bars = [0, 60_000, 120_000, 600_000, 660_000, 720_000].map((time) => Object.freeze({ time }));
test("focuses exact entry/exit bars with bounded real-bar context across gaps", () => {
  assert.deepEqual(focusTrade(bars, { entryTime: 120_000, exitTime: 600_000 }, 1), {
    entryIndex: 2,
    exitIndex: 3,
    from: 60_000,
    to: 660_000,
  });
});
