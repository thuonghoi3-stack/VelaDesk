import test from "node:test";
import assert from "node:assert/strict";
import { evaluateNative, nativeReferenceEvidence } from "./native-reference.ts";
import type { NativeStrategy, NativeBar } from "./native-reference.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
test("RSI explicit source branch flat=100 and SMA-seeded 14 changes", () => {
  const out = evaluateNative("rsi", bars(Array(20).fill(10)));
  assert.ok(out.slice(0, 14).every((x) => Number.isNaN(x.values.rsi)));
  assert.equal(out[14].values.rsi, 100);
  assert.ok(out.every((x) => x.intents.length === 0));
  const down = evaluateNative("rsi", bars(Array.from({ length: 20 }, (_, i) => 30 - i)));
  assert.equal(down[14].values.rsi, 0);
});
test("slow stochastic uses 3/3 smoothing partial range and no fabricated flat neutral", () => {
  const out = evaluateNative("stochastic-slow", bars([10, 11, 12, 13, 14, 15]));
  assert.ok(Number.isNaN(out[1].values.k));
  assert.ok(Math.abs(out[2].values.k - (50 + 200 / 3 + 75) / 3) < 1e-12);
  assert.ok(Number.isNaN(out[3].values.d));
  assert.ok(Number.isFinite(out[4].values.d));
  assert.ok(
    evaluateNative(
      "stochastic-slow",
      Array.from({ length: 30 }, () => ({ open: 1, high: 1, low: 1, close: 1 })),
    ).every((x) => Number.isNaN(x.values.k)),
  );
});
test("BB population bands and same-bar OCA stop/cancel commands", () => {
  const out = evaluateNative("bollinger-bands", bars([...Array(20).fill(10), 0, 10]));
  assert.equal(out[19].values.basis, 10);
  assert.equal(out[19].values.dev, 0);
  assert.ok(Math.abs(out[20].values.dev - 2 * Math.sqrt(4.75)) < 1e-12);
  const orders = out[21].intents;
  assert.equal(orders[0].kind, "entry");
  if (orders[0].kind === "entry") {
    assert.equal(orders[0].order.kind, "stop");
    assert.deepEqual(orders[0].oca, { name: "BollingerBands", type: "cancel" });
  }
  assert.deepEqual(orders[1], { kind: "cancel", id: "BBandSE" });
  assert.deepEqual(out[0].intents, [
    { kind: "cancel", id: "BBandLE" },
    { kind: "cancel", id: "BBandSE" },
  ]);
});
test("Keltner requires mintick, ATR10 and persistent cancellation flags", () => {
  const input = bars([...Array(20).fill(10), 30, 10, 10]);
  assert.throws(() => evaluateNative("keltner", input), /mintick/);
  const out = evaluateNative("keltner", input, { mintick: 0.25 });
  assert.equal(out[9].values.atr, 2);
  assert.equal(out[20].values.bprice, 31.25);
  assert.deepEqual(
    out[20].intents.map((x) => x.kind),
    ["entry"],
  );
  assert.deepEqual(out[21].intents, [{ kind: "cancel", id: "KltChLE" }]);
  assert.deepEqual(out[22].intents, [{ kind: "cancel", id: "KltChLE" }]);
});
test("Supertrend documented carried bands initialize +1; flips size 15 percent", () => {
  const out = evaluateNative("supertrend", bars([...Array(20).fill(10), 30, 0]));
  assert.ok(out.slice(0, 20).every((x) => x.values.direction === 1));
  assert.equal(out[9].values.supertrend, 16);
  assert.equal(out[20].values.direction, -1);
  assert.equal(out[21].values.direction, 1);
  for (const i of [20, 21]) {
    const order = out[i].intents[0];
    assert.equal(order.kind, "entry");
    if (order.kind === "entry")
      assert.deepEqual(order.quantity, { kind: "percent-of-equity", value: 15 });
  }
});
test("PSAR explicit second-bar initialization predicts opposite stop before cancel", () => {
  const input = bars([10, 11, 12, 8]);
  const out = evaluateNative("psar", input);
  assert.ok(Number.isNaN(out[0].values.sar));
  assert.equal(out[0].intents.length, 0);
  assert.equal(out[1].values.sar, 9);
  assert.equal(out[1].values.nextBarSAR, 9.06);
  assert.equal(out[2].values.sar, 9);
  assert.equal(out[2].values.af, 0.04);
  assert.equal(out[2].values.nextBarSAR, 9.16);
  assert.equal(out[3].values.sar, 13);
  assert.equal(out[3].values.nextBarSAR, 12.88);
  assert.deepEqual(
    out[1].intents.map((x) => [x.kind, x.id]),
    [
      ["entry", "ParSE"],
      ["cancel", "ParLE"],
    ],
  );
  assert.deepEqual(
    out[3].intents.map((x) => [x.kind, x.id]),
    [
      ["entry", "ParLE"],
      ["cancel", "ParSE"],
    ],
  );
  input[3] = { ...input[3], confirmed: false } as (typeof input)[number];
  assert.equal(evaluateNative("psar", input)[3].intents.length, 0);
});
const artifacts = new URL("../../../../.hermes/artifacts/native-parity/", import.meta.url);
const fixture = JSON.parse(
  readFileSync(new URL("golden.json", artifacts), "utf8"),
  (_key, value) => (value === "NaN" ? NaN : value),
);
function compare(actual: unknown, expected: unknown, path = "root"): void {
  if (typeof expected === "number" && typeof actual === "number") {
    assert.ok(
      Number.isNaN(expected)
        ? Number.isNaN(actual)
        : Math.abs(actual - expected) <= 1e-10 * Math.max(1, Math.abs(expected)),
      `${path}: ${actual} vs ${expected}`,
    );
    return;
  }
  if (Array.isArray(expected)) {
    assert.ok(Array.isArray(actual), path);
    assert.equal(actual.length, expected.length, path);
    expected.forEach((v, i) => compare(actual[i], v, `${path}[${i}]`));
    return;
  }
  if (expected && typeof expected === "object") {
    assert.ok(actual && typeof actual === "object", path);
    assert.deepEqual(Object.keys(actual).sort(), Object.keys(expected).sort(), path);
    for (const [key, val] of Object.entries(expected))
      compare((actual as Record<string, unknown>)[key], val, `${path}.${key}`);
    return;
  }
  assert.equal(actual, expected, path);
}
for (const name of Object.keys(fixture.expected) as NativeStrategy[])
  test(`${name}: independent Python full history + every prefix + complete order contract`, () => {
    const input = fixture.bars as NativeBar[];
    const expected = fixture.expected[name];
    const actual = evaluateNative(name, input, { mintick: fixture.mintick });
    compare(actual, expected, name);
    for (let end = 0; end <= input.length; end++)
      compare(
        evaluateNative(name, input.slice(0, end), { mintick: fixture.mintick }),
        expected.slice(0, end),
        `${name} prefix ${end}`,
      );
  });
test("all seven pins immutable; counts audited without claiming external runtime", () => {
  const pins = JSON.parse(readFileSync(new URL("source-pins.json", artifacts), "utf8"));
  assert.equal(Object.keys(pins).length, 7);
  for (const [name, pin] of Object.entries(pins) as [string, { sha256: string }][]) {
    const bytes = readFileSync(new URL(`../logic-repair/source-search/${name}.pine`, artifacts));
    assert.equal(createHash("sha256").update(bytes).digest("hex"), pin.sha256);
  }
  assert.equal(nativeReferenceEvidence.externalRuntimeVerified, false);
  const rows = Object.keys(fixture.expected).map((name) => {
    const a = evaluateNative(name as NativeStrategy, fixture.bars, { mintick: fixture.mintick });
    return {
      name,
      bars: a.length,
      warmup: a.filter((x) => x.status === "warmup").length,
      ready: a.filter((x) => x.status === "ready").length,
      entries: a.flatMap((x) => x.intents).filter((x) => x.kind === "entry").length,
      cancels: a.flatMap((x) => x.intents).filter((x) => x.kind === "cancel").length,
      status: "source-translated-local-reference",
      externalRuntimeVerified: false,
    };
  });
  assert.equal(rows.length, 7);
  assert.deepEqual(
    rows.map((x) => [x.warmup, x.ready, x.entries, x.cancels]),
    [
      [0, 285, 11, 0],
      [14, 271, 12, 0],
      [4, 281, 29, 0],
      [9, 276, 20, 0],
      [19, 266, 13, 557],
      [9, 276, 15, 416],
      [1, 284, 284, 284],
    ],
  );
  if (process.env.NATIVE_EVIDENCE === "1")
    writeFileSync(
      new URL("verification.json", artifacts),
      JSON.stringify({ strategies: 7, externalRuntimeVerified: 0, rows }, null, 2),
    );
});
test("reject invalid OHLC rather than silently seeding missing prices", () => {
  assert.throws(
    () => evaluateNative("macd", [{ open: 1, high: 2, low: 0, close: NaN }]),
    /Finite OHLC/,
  );
});
function bars(xs: number[]): NativeBar[] {
  return xs.map((close) => ({ open: close, high: close + 1, low: close - 1, close }));
}
test("MACD source first-price EMA seed and zero equality crossing", () => {
  const out = evaluateNative("macd", bars([10, 11, 8]));
  assert.equal(out[0].values.delta, 0);
  assert.deepEqual(
    out.map((x) => x.intents.map((y) => y.id)),
    [[], ["MacdLE"], ["MacdSE"]],
  );
  assert.ok(Math.abs(out[1].values.delta - (2 / 13 - 2 / 27) * 0.8) < 1e-14);
});
