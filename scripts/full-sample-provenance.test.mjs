import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';

// Isolate only the network boundary; run the real store, pipeline and engine.
registerHooks({
  load(url, context, nextLoad) {
    if (url.endsWith('/quant/data/load-ohlcv.ts')) return {
      format: 'module', shortCircuit: true,
      source: 'export const loadOhlcv = () => new Promise(() => {});',
    };
    return nextLoad(url, context);
  },
});
const { useDesk } = await import('../src/lib/quant/store.ts');
const { runBacktest } = await import('../src/lib/quant/backtest/engine.ts');
const { focusTrade } = await import('../src/lib/quant/trade-focus.ts');
const initial = useDesk.getState();
const { default: ts } = await import('typescript');
const { runInNewContext } = await import('node:vm');
function component(path, name) {
  const output = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  runInNewContext(output, { exports, require: id => {
    if (id === 'react') return {
      useEffect() {}, useMemo: fn => fn(),
      useState: value => [typeof value === 'function' ? value() : value === 'overview' ? 'trades' : value, () => {}],
    };
    if (id === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) };
    if (id.endsWith('/store')) return { useDesk: select => select(useDesk.getState()) };
    if (id.endsWith('/trade-focus')) return { focusTrade };
    if (id.endsWith('/strategy/library')) return { STRATEGY_SELECT_OPTIONS: [] };
    return new Proxy({}, { get: (_, key) => key === 'inspectTrades' ? (trades => ({ rows: trades, retained: {}, excluded: {} })) : (() => null) });
  } });
  return exports[name];
}
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...[node.props?.children].flat(Infinity).flatMap(nodes)];
}
test('Tester forwards validated full-sample provenance to selectable chart and replay controls', () => {
  const state = seed();
  const Tester = component('../src/components/desk/tester-panel.tsx', 'TesterPanel');
  const tradesTab = nodes(Tester()).find(n => n.type?.name === 'TradesTab');
  assert.ok(tradesTab);
  assert.ok(tradesTab.props.run === state.backtestRun, 'Tester must forward the store run by identity');
  assert.ok(tradesTab.props.run, 'default full-sample run must not be disabled');
  const Inspector = component('../src/components/desk/trade-inspector.tsx', 'TradeInspector');
  const tree = nodes(Inspector({ trades: state.backtest.trades, run: tradesTab.props.run }));
  const chart = tree.find(n => n.props?.datasetKey === state.backtestRun.datasetKey);
  assert.ok(chart, 'selected full-sample trade renders its chart');
  assert.equal(chart.props.bars, state.backtestRun.bars);
  const replay = tree.find(n => n.props?.children === 'Replay từ điểm vào');
  assert.ok(replay);
  assert.equal(replay.props.disabled, false);
  replay.props.onClick();
  assert.equal(useDesk.getState().tab, 'paper');
  assert.ok(useDesk.getState().paper.historical);
  useDesk.setState({ backtest: { ...state.backtest } });
  assert.equal(nodes(Tester()).find(n => n.type?.name === 'TradesTab')?.props.run ?? null, null);
});

test('config, data load, resignal and insufficient data invalidate provenance without disturbing historical replay', () => {
  const state = seed();
  const run = state.backtestRun;
  state.startTradeReplay(run.bars, run.cfg, run.result.trades[0].entryTime, run.source, run.sourceNote);
  const historical = useDesk.getState().paper.historical;
  const states = [];
  const off = useDesk.subscribe(s => states.push(s));
  state.setCfg({ riskPct: state.cfg.riskPct / 2 });
  off();
  assert.ok(states.every(s => !s.backtestRun || s.backtestRun.cfg.riskPct === s.cfg.riskPct), 'no transient stale config labeling');
  assert.equal(useDesk.getState().paper.historical, historical);
  state.resignal();
  assert.equal(useDesk.getState().backtestRun, null);
  state.runBt();
  void state.loadLive();
  assert.equal(useDesk.getState().backtestRun, null);
  assert.equal(useDesk.getState().backtest, null);
  state.setCfg({ takerFee: 0.001 });
  state.runBt();
  assert.equal(useDesk.getState().backtestRun, null, 'old bars cannot be relabeled while loading');
  assert.equal(useDesk.getState().paper.historical, historical);
  useDesk.setState({ loading: false, ltf: [] });
  state.runBt();
  assert.equal(useDesk.getState().backtestRun, null);
  assert.equal(useDesk.getState().backtest, null);
});

function seed() {
  useDesk.setState(initial, true);
  useDesk.getState().loadSynthetic();
  return useDesk.getState();
}

test('full-sample result and deeply cloned exact inputs publish atomically and support chart/replay', () => {
  const publications = [];
  const unsubscribe = useDesk.subscribe(s => publications.push(s));
  const state = seed();
  unsubscribe();
  const run = state.backtestRun;
  assert.ok(run, 'completed full sample must have provenance');
  assert.equal(run.result, state.backtest);
  assert.ok(publications.every(s => !s.backtest || s.backtestRun?.result === s.backtest));
  assert.notEqual(run.bars, state.ltf);
  assert.notEqual(run.bars[0], state.ltf[0]);
  assert.notEqual(run.cfg, state.cfg);
  assert.notEqual(run.cfg.symbols, state.cfg.symbols);
  assert.deepEqual(run.bars, state.ltf);
  assert.deepEqual(run.cfg, state.cfg);
  assert.equal(run.source, state.source);
  assert.equal(run.sourceNote, state.sourceNote);
  // Engine trade IDs use a module-level sequence; all economic outputs must match.
  const normalize = result => ({ ...result, trades: result.trades.map(({ id, ...trade }) => trade) });
  assert.deepEqual(normalize(run.result), normalize(runBacktest(run.bars, run.cfg, run.cfg.ltf)));
  assert.ok(run.result.trades.length > 0, 'fixture must exercise actual trades');
  for (const trade of run.result.trades) assert.ok(focusTrade(run.bars, trade));
  const trade = run.result.trades[0];
  state.startTradeReplay(run.bars, run.cfg, trade.entryTime, run.source, run.sourceNote);
  const historical = useDesk.getState().paper.historical;
  assert.ok(historical);
  assert.equal(historical.entryTime, trade.entryTime);
  assert.deepEqual(historical.bars, run.bars);
  assert.deepEqual(historical.config, run.cfg);
  const savedBars = structuredClone(run.bars);
  const savedCfg = structuredClone(run.cfg);
  state.ltf[0].close += 123;
  state.cfg.symbols.push('MUTATED');
  assert.deepEqual(run.bars, savedBars);
  assert.deepEqual(run.cfg, savedCfg);
  state.runBt();
  assert.notEqual(useDesk.getState().backtestRun.datasetKey, run.datasetKey);
});
