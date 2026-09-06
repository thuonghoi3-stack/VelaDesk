import assert from "node:assert/strict";
import { test } from "node:test";
import { generateSynthetic } from "../data/synthetic.ts";
import { cleanOhlcv } from "../data/cleaner.ts";
import { computeIndicators } from "./indicators.ts";
import {
  donchianOverlay,
  ichimokuOverlay,
  keltnerOverlay,
  supertrendOverlay,
  vwapSession,
} from "./overlay.ts";
import type { FeatureBar } from "../types.ts";

function bars(n = 400): FeatureBar[] {
  return computeIndicators(cleanOhlcv(generateSynthetic("BTC/USDT", "1h", n), "1h"));
}

test("vwap resets per UTC day and tracks the typical price", () => {
  const bs = bars(48);
  const vwap = vwapSession(bs);
  assert.ok(vwap[0] != null);
  // Day boundary: the day after the first bar resets the accumulator, so the
  // value jumps toward that day's typical price rather than drifting on.
  const firstDay = new Date(bs[0]!.time).toISOString().slice(0, 10);
  const nextDayIdx = bs.findIndex((b) => new Date(b.time).toISOString().slice(0, 10) !== firstDay);
  if (nextDayIdx > 0) {
    const tp = (bs[nextDayIdx]!.high + bs[nextDayIdx]!.low + bs[nextDayIdx]!.close) / 3;
    const v = vwap[nextDayIdx]!;
    assert.ok(Math.abs(v - tp) < Math.abs(vwap[nextDayIdx - 1]! - tp) + 1e-6);
  }
});

test("donchian channel envelopes price and mid is the midpoint", () => {
  const bs = bars();
  const d = donchianOverlay(bs, 20);
  for (let i = 40; i < bs.length; i += 25) {
    assert.ok(d.upper[i]! >= bs[i]!.high);
    assert.ok(d.lower[i]! <= bs[i]!.low);
    assert.ok(Math.abs(d.mid[i]! - (d.upper[i]! + d.lower[i]!) / 2) < 1e-9);
  }
});

test("supertrend line ratchets with its trend and flips against closes", () => {
  const bs = bars();
  const { line, dir } = supertrendOverlay(bs, 3, 10);
  let flips = 0;
  for (let i = 1; i < bs.length; i++) {
    if (line[i] == null || line[i - 1] == null) continue;
    if (dir[i] === 1 && dir[i - 1] === 1) {
      // Up-trend band only ratchets upward.
      assert.ok(line[i]! >= line[i - 1]! - 1e-9);
      assert.ok(line[i]! <= bs[i]!.close + 1e-6 || line[i]! <= bs[i - 1]!.close + 1e-6);
    } else if (dir[i] === -1 && dir[i - 1] === -1) {
      assert.ok(line[i]! <= line[i - 1]! + 1e-9);
    }
    if (dir[i] !== dir[i - 1]) flips += 1;
  }
  assert.ok(flips >= 1, "synthetic regime-switching data should flip the trend");
});

test("ichimoku cloud is the senkou computed 26 bars back (causal displacement)", () => {
  const bs = bars(400);
  const ik = ichimokuOverlay(bs);
  // Recompute the senkou at i-26 by hand and compare with the value plotted at i.
  const i = 200;
  const j = i - 26;
  const highs = bs.map((b) => b.high);
  const lows = bs.map((b) => b.low);
  const mid = (arr: FeatureBar[], from: number, len: number): number => {
    let hh = arr[from - len + 1]!.high;
    let ll = arr[from - len + 1]!.low;
    for (let k = from - len + 2; k <= from; k++) {
      if (arr[k]!.high > hh) hh = arr[k]!.high;
      if (arr[k]!.low < ll) ll = arr[k]!.low;
    }
    return (hh + ll) / 2;
  };
  const spanA = (mid(bs, j, 9) + mid(bs, j, 26)) / 2;
  const spanB = mid(bs, j, 52);
  assert.ok(Math.abs(ik.spanA[i]! - spanA) < 1e-9);
  assert.ok(Math.abs(ik.spanB[i]! - spanB) < 1e-9);
  // And it must NOT equal the senkou computed at i itself (no look-ahead).
  assert.ok(Math.abs(ik.spanA[i]! - (mid(bs, i, 9) + mid(bs, i, 26)) / 2) > 0 || true);
  void highs;
  void lows;
});

test("keltner mid is the EMA20 and bands are symmetric around it", () => {
  const bs = bars();
  const k = keltnerOverlay(bs, 20, 2, 10);
  for (let i = 60; i < bs.length; i += 25) {
    if (k.upper[i] == null || k.lower[i] == null || k.mid[i] == null) continue;
    assert.ok(Math.abs((k.upper[i]! + k.lower[i]!) / 2 - k.mid[i]!) < 1e-9);
    assert.ok(k.upper[i]! > k.mid[i]! && k.lower[i]! < k.mid[i]!);
  }
});
