import { test } from "node:test";
import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";

test("historical replay UI explicitly identifies its scope and offers current-data replay", () => {
  const ui = readFileSync(
    new URL("../src/components/desk/paper-panel.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(ui.includes("Replay dữ liệu hiện tại"));
  assert.ok(ui.includes("replay-historical-context"));
  assert.ok(ui.includes("e !== engine"));
  assert.ok(ui.includes("s.paper.historical !== historical"));
});
// Only the network boundary is stubbed: all store/simulator code is real.
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.endsWith("/data/load-ohlcv.ts"))
      return {
        url: 'data:text/javascript,export const loadOhlcv=async()=>{throw new Error("Network disabled in replay test")}',
        shortCircuit: true,
      };
    return next(specifier, context);
  },
});
const { useDesk } = await import("../src/lib/quant/store.ts");
const { defaultConfig } = await import("../src/lib/quant/config.ts");
const { buildDesk } = await import("../src/lib/quant/pipeline.ts");
const { generateSynthetic } = await import("../src/lib/quant/data/synthetic.ts");

function fixture() {
  const cfg = { ...defaultConfig(), warmup: 220 };
  const { ltf } = buildDesk(
    generateSynthetic(cfg.symbol, cfg.ltf, 600),
    generateSynthetic(cfg.symbol, cfg.htf, 400),
    cfg,
  );
  return { cfg, bars: ltf, entryTime: ltf[350].time };
}
test("historical handoff captures its own run and never replaces global inputs", () => {
  const before = useDesk.getState();
  const { cfg, bars, entryTime } = fixture();
  assert.equal(typeof before.startTradeReplay, "function");
  before.startTradeReplay(bars, cfg, entryTime, "binance", "Captured historical source");
  const s = useDesk.getState();
  assert.equal(s.tab, "paper");
  assert.equal(s.cfg, before.cfg);
  assert.equal(s.ltf, before.ltf);
  assert.equal(s.paper.playing, false);
  assert.equal(s.paper.engine.i, 350);
  assert.equal(s.paper.historical.entryTime, entryTime);
  assert.equal(s.paper.historical.source, "binance");
  assert.equal(s.paper.historical.sourceNote, "Captured historical source");
  assert.notEqual(s.paper.engine.bars, bars);
  assert.notEqual(s.paper.engine.cfg, cfg);
  const close = s.paper.engine.bars[350].close;
  bars[350].close = 1;
  cfg.symbol = "MUTATED";
  cfg.symbols.push("MUTATED");
  assert.equal(s.paper.engine.bars[350].close, close);
  assert.notEqual(s.paper.engine.cfg.symbol, "MUTATED");
  assert.ok(!s.paper.engine.cfg.symbols.includes("MUTATED"));
  assert.ok(Object.isFrozen(s.paper.historical));
  assert.ok(Object.isFrozen(s.paper.engine.bars[350]));
  const originalCash = s.paper.engine.equity;
  const history = s.paper.historical;
  s.paperStep();
  assert.equal(useDesk.getState().paper.engine.i, 351);
  assert.equal(useDesk.getState().paper.historical, history);
  assert.ok(useDesk.getState().paper.engine.events.every((e) => e.time <= entryTime));
  useDesk.getState().setCfg({ riskPct: 0.02 });
  assert.equal(useDesk.getState().paper.historical, history);
  useDesk.getState().paperReset();
  const reset = useDesk.getState().paper;
  assert.notEqual(reset.engine, s.paper.engine);
  assert.equal(reset.engine.i, 350);
  assert.equal(reset.engine.equity, originalCash);
  assert.equal(reset.historical.sourceNote, "Captured historical source");
  assert.ok(reset.engine.events.every((e) => e.time < entryTime));
  assert.throws(() => useDesk.getState().startTradeReplay(bars, cfg, -1, "bad", "bad"));
  assert.equal(useDesk.getState().paper, reset, "invalid handoff is atomic");
  const live = fixture();
  useDesk.getState().ingest(live.bars, live.bars, "synthetic", "Current source");
  assert.equal(useDesk.getState().paper, reset, "new global data cannot relabel historical replay");
  useDesk.getState().setCfg({ warmup: 230 });
  assert.equal(useDesk.getState().paper, reset, "re-signaling cannot replace historical replay");
  useDesk.getState().paperCurrent();
  const current = useDesk.getState();
  assert.equal(current.paper.historical, null);
  assert.equal(current.paper.engine.bars, current.ltf);
  assert.equal(current.paper.engine.cfg, current.cfg);
  assert.equal(current.paper.engine.i, current.cfg.warmup);
  assert.equal(current.paper.playing, false);
  current.setPlaying(true);
  current.paperStep();
  assert.equal(useDesk.getState().paper.engine.i, current.cfg.warmup + 1);
  useDesk.getState().paperReset();
  assert.equal(useDesk.getState().paper.engine.i, current.cfg.warmup);
});
