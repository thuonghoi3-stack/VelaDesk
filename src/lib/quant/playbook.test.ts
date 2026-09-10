import assert from "node:assert/strict";
import { test } from "node:test";
import * as lab from "./playbook.ts";
import { defaultConfig } from "./config.ts";
import { generateSynthetic } from "./data/synthetic.ts";
import { applySignals, buildDesk } from "./pipeline.ts";
import { SimEngine } from "./backtest/engine.ts";
import { computeMetrics } from "./backtest/metrics.ts";

const cfg = defaultConfig();
const bars = buildDesk(
  generateSynthetic(cfg.symbol, cfg.ltf, 900),
  generateSynthetic(cfg.symbol, cfg.htf, 400),
  cfg,
).ltf;
const draft = {
  name: "EMA research",
  hypothesis: "Does trend persist?",
  strategyId: "ema_cross" as const,
  notes: "No optimization",
};
test("experiment captures immutable inputs and runs independent chronological train/test engines", () => {
  assert.equal(typeof lab.runExperiment, "function");
  const inputCfg = structuredClone(cfg);
  const run = lab.runExperiment({
    bars,
    cfg: inputCfg,
    source: "synthetic",
    sourceNote: "fixture",
    draft,
    id: "run-1",
    createdAt: "2026-09-10T00:00:00.000Z",
  });
  const signaled = applySignals(bars, { ...cfg, strategyId: "ema_cross" });
  const cut = Math.floor(bars.length * 0.7);
  const engine = new SimEngine(signaled, { ...cfg, strategyId: "ema_cross" }, cfg.ltf, cut);
  engine.runToEnd();
  assert.deepEqual(
    run.test.metrics,
    computeMetrics(
      cfg.equity,
      engine.equityCurve,
      engine.trades,
      engine.equityCurve.length,
      engine.exposedBars,
    ),
  );
  assert.equal(run.train.equity.at(-1)?.time, bars[cut - 1]!.time);
  assert.equal(run.test.equity[0]?.time, bars[cut]!.time);
  assert.equal(run.provenance.source, "synthetic");
  assert.equal(run.provenance.barCount, bars.length);
  inputCfg.symbols.push("CHANGED");
  assert.deepEqual(run.config.symbols, cfg.symbols);
  assert.ok(Object.isFrozen(run.config.symbols));
  assert.ok(Object.isFrozen(run.test.metrics));
  assert.equal(cfg.strategyId, "combo");
});

test("notebook round-trips frozen runs and rejects corrupt or unknown versions", () => {
  assert.equal(typeof lab.parseNotebook, "function");
  const run = lab.runExperiment({
    bars,
    cfg,
    source: "synthetic",
    sourceNote: "fixture",
    draft,
    id: "saved",
    createdAt: "2026-09-10T00:00:00Z",
  });
  const book = { version: 1 as const, draft, runs: [run] };
  assert.deepEqual(lab.parseNotebook(lab.serializeNotebook(book)), book);
  assert.ok(Object.isFrozen(lab.parseNotebook(lab.serializeNotebook(book)).runs[0]!.config));
  assert.throws(() => lab.parseNotebook('{"version":2}'), /notebook/i);
  assert.throws(() => lab.parseNotebook('{"version":1,"draft":{},"runs":[{}]}'), /notebook/i);
  assert.throws(() => lab.parseNotebook("no json"), /notebook/i);
});

test("provenance fingerprints sample content and rejects malformed bars or strategy", () => {
  const input = {
    bars,
    cfg,
    source: "synthetic",
    sourceNote: "",
    draft,
    id: "x",
    createdAt: "2026-09-10T00:00:00Z",
  };
  const a = lab.runExperiment(input);
  assert.equal(typeof a.provenance.fingerprint, "string");
  const changed = bars.map((b, i) => (i === 500 ? { ...b, volume: b.volume + 1 } : b));
  assert.notEqual(
    a.provenance.fingerprint,
    lab.runExperiment({ ...input, bars: changed }).provenance.fingerprint,
  );
  assert.throws(
    () =>
      lab.runExperiment({
        ...input,
        bars: bars.map((b, i) => (i === 5 ? { ...b, close: NaN } : b)),
      }),
    /nến/,
  );
  assert.throws(() => lab.runExperiment({ ...input, bars: [...bars].reverse() }), /nến/);
  assert.throws(
    () => lab.runExperiment({ ...input, draft: { ...draft, strategyId: "unknown" as never } }),
    /chiến lược/,
  );
});

test("experiment rejects insufficient windows and unidentified sources", () => {
  const input = {
    bars,
    cfg,
    source: "synthetic",
    sourceNote: "",
    draft,
    id: "x",
    createdAt: "2026-09-10T00:00:00Z",
  };
  assert.throws(() => lab.runExperiment({ ...input, bars: bars.slice(0, 300) }), /nến/);
  assert.throws(() => lab.runExperiment({ ...input, source: "" }), /nguồn/);
  assert.throws(() => lab.runExperiment({ ...input, draft: { ...draft, name: " " } }), /Tên/);
  assert.throws(() => lab.runExperiment({ ...input, cfg: { ...cfg, equity: NaN } }), /cấu hình/);
});
