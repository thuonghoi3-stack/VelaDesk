import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
registerHooks({ resolve(specifier, context, next) {
  if (specifier.endsWith("/data/load-ohlcv.ts")) return {
    url: 'data:text/javascript,export const loadOhlcv=async()=>{throw new Error("Network disabled in replay test")}', shortCircuit: true,
  };
  return next(specifier, context);
} });
const { useDesk } = await import("../src/lib/quant/store.ts");
const { defaultConfig } = await import("../src/lib/quant/config.ts");
const { computeIndicators } = await import("../src/lib/quant/features/indicators.ts");
const { generateSynthetic } = await import("../src/lib/quant/data/synthetic.ts");
const { replayView } = await import("../src/lib/quant/replay-view.ts");
test("invalid warmup never creates a replay cursor outside loaded bars", () => {
  for (const warmup of [-1, 1.5, NaN, Infinity, 600, 601]) {
    fixture(warmup);
    assert.equal(useDesk.getState().paper.engine, null, `warmup ${warmup}`);
  }
});

test("historical progress starts at its exact entry target and reset reconstructs it", () => {
  const { cfg, ltf } = fixture();
  useDesk.getState().startTradeReplay(ltf, cfg, ltf[350].time, "synthetic", "Test snapshot");
  const project = () => {
    const p = useDesk.getState().paper;
    return replayView(p.engine, cfg.equity, p.historical.startIndex);
  };
  assert.equal(project().start, 350);
  assert.equal(project().processed, 0);
  assert.equal(project().total, 250);
  assert.equal(project().lastBar.time, ltf[349].time);
  useDesk.getState().paperStep();
  assert.equal(project().processed, 1);
  assert.equal(project().lastBar.time, ltf[350].time);
  useDesk.getState().paperReset();
  assert.equal(project().processed, 0);
  assert.equal(project().index, 350);
  assert.equal(project().lastBar.time, ltf[349].time);
});

test("step, full completion and reset cover each loaded post-warmup candle exactly once", () => {
  for (const [warmup, length] of [[0, 600], [220, 600], [590, 600], [220, 6000]]) {
    const { cfg, ltf } = fixture(warmup, length);
    const initial = useDesk.getState().paper.engine;
    useDesk.getState().setPlaying(true);
    for (let processed = 1; processed <= length - warmup; processed++) {
      useDesk.getState().paperStep();
      const p = useDesk.getState().paper;
      const view = replayView(p.engine, cfg.equity);
      assert.equal(p.cursor, warmup + processed);
      assert.equal(view.processed, processed);
      assert.equal(view.remaining, length - warmup - processed);
      assert.equal(view.lastBar, ltf[warmup + processed - 1]);
      assert.equal(view.bars.length, warmup + processed);
      assert.ok(p.engine.events.every(e => e.time <= view.lastBar.time));
    }
    // step() marks done on the subsequent boundary call; preserve that contract.
    useDesk.getState().paperStep();
    const p = useDesk.getState().paper;
    assert.equal(p.engine.done, true);
    assert.equal(p.playing, false);
    assert.equal(p.engine.equityCurve.length, length - warmup);
    assert.equal(replayView(p.engine, cfg.equity).progress, 100);
    assert.ok(!p.engine.trades.some(t => t.reason === "end_of_data"));
    const lastCash = p.engine.equity;
    useDesk.getState().paperStep();
    assert.equal(p.engine.equity, lastCash);
    useDesk.getState().paperReset();
    const reset = useDesk.getState().paper;
    assert.notEqual(reset.engine, initial);
    assert.equal(reset.cursor, warmup);
    assert.equal(reset.engine.equity, cfg.equity);
    assert.equal(reset.engine.equityCurve.length, 0);
    assert.equal(reset.playing, false);
    assert.equal(replayView(reset.engine, cfg.equity).processed, 0);
  }
  fixture(591, 600);
  assert.equal(useDesk.getState().paper.engine, null, "retain minimum ten post-warmup bars");
});

function fixture(warmup = 220, length = 600) {
  const cfg = defaultConfig({ warmup });
  const ltf = computeIndicators(generateSynthetic(cfg.symbol, cfg.ltf, length, Date.UTC(2025, 0, 1)));
  useDesk.setState({ cfg, ltf, loading: false });
  useDesk.getState().paperCurrent();
  return { cfg, ltf };
}
test("normal replay starts at warmup across every loaded bar, with context but no future display", () => {
  const { cfg, ltf } = fixture();
  const { engine, cursor, playing } = useDesk.getState().paper;
  assert.equal(engine.i, cfg.warmup);
  assert.equal(cursor, cfg.warmup);
  assert.equal(playing, false);
  const view = replayView(engine, cfg.equity);
  assert.equal(view.start, cfg.warmup);
  assert.equal(view.total, ltf.length - cfg.warmup);
  assert.equal(view.processed, 0);
  assert.equal(view.progress, 0);
  assert.equal(view.bars.length, cfg.warmup);
  assert.equal(view.lastBar, ltf[cfg.warmup - 1]);
  assert.ok(!view.bars.includes(ltf[cfg.warmup]));
});
