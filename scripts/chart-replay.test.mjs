import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the real workspace component with deterministic hooks; no network/chart canvas needed.
const source = readFileSync(new URL('../src/components/terminal/chart-workspace.tsx', import.meta.url), 'utf8');
function harness() {
  const state = [], memos = [], effects = [];
  let cursor = 0, tree, listener, delay, tick, fired = 0;
  const equal = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    useState(initial) { const i = cursor++; if (!(i in state)) state[i] = typeof initial === 'function' ? initial() : initial; return [state[i], v => { state[i] = typeof v === 'function' ? v(state[i]) : v; }]; },
    useRef(initial) { const [ref] = react.useState({ current: initial }); return ref; },
    useMemo(fn, deps) { const i = cursor++; if (!memos[i] || !equal(memos[i].deps, deps)) memos[i] = { value: fn(), deps }; return memos[i].value; },
    useCallback(fn, deps) { return react.useMemo(() => fn, deps); },
    useEffect(fn, deps) { const i = cursor++; if (!effects[i] || !equal(effects[i].deps, deps)) { effects[i]?.cleanup?.(); effects[i] = { fn, deps, pending: true }; } },
  };
  const alertState = { alerts: [], seenSignals: [], applyEvaluation() { fired++; }, markSignalSeen() { fired++; } };
  const store = selector => selector(alertState); store.getState = () => alertState;
  const jsx = (type, props) => ({ type, props });
  const context = { exports: {}, window: { addEventListener(_, fn) { listener = fn; }, removeEventListener() {}, setInterval(fn, ms) { tick = fn; delay = ms; return 1; }, clearInterval() { tick = null; } }, localStorage: { getItem() { return null; }, setItem() {} }, console };
  context.require = name => {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'zustand') return { create: () => init => { const s = init(() => {}); return selector => selector(s); } };
    if (name === 'zustand/middleware') return { persist: fn => fn };
    if (name.endsWith('/watchlist')) return { Watchlist: 'Watchlist', useQuotes: selector => selector({ quotes: { 'BTC/USDT': { price: 999, changePct: 99 } } }) };
    if (name.endsWith('/alerts-store')) return { useAlerts: store };
    if (name.endsWith('/alerts-core')) return { evaluateAlerts: () => ({ fired: [{ symbol: 'BTC', rsi: 99 }], remaining: [] }), alertLabel: () => 'alert' };
    if (name.endsWith('/config')) return { TIMEFRAMES: [], HTF_FOR: {}, defaultConfig: () => ({}) };
    if (name.endsWith('/library')) return { STRATEGY_SELECT_OPTIONS: [] };
    if (name.endsWith('/data-prefs')) return { getSourcePref: () => 'auto', getLastOkSource: () => null };
    if (name.endsWith('/utils')) return { cn: (...s) => s.join(' '), formatDateUtc: t => String(t) };
    if (name === 'sonner') return { toast: { warning() {}, message() {} } };
    return new Proxy({}, { get: (_, key) => key });
  };
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, context);
  function render() { cursor = 0; tree = context.exports.ChartWorkspace({}); return tree; }
  function nodes(node = tree) { if (!node || typeof node !== 'object') return []; if (Array.isArray(node)) return node.flatMap(n => nodes(n)); return [node, ...nodes(node.props?.children ?? null)]; }
  render();
  // Resolve state slots by their initial values rather than hook positions.
  const barsSlot = state.findIndex(v => Array.isArray(v));
  const replaySlot = state.findIndex((v, i) => v === null && i > state.findIndex(v => v === 'cursor'));
  const hoverSlot = state.findIndex((v, i) => v === null && i > barsSlot + 2);
  return { state, render, nodes, setBars(v) { state[barsSlot] = v; }, setReplay(v) { state[replaySlot] = v; }, hover(v) { state[hoverSlot] = v; }, chart() { return nodes().find(n => n.props?.onHover); }, runEffects() { for (const e of effects) if (e?.pending) { e.pending = false; if (!String(e.fn).includes('void load(') && !String(e.fn).includes('buildDesk(')) e.cleanup = e.fn(); } }, key(key) { listener({ key, target: { tagName: 'DIV' }, preventDefault() {} }); }, get delay() { return delay; }, tick() { tick?.(); }, get fired() { return fired; } };
}
const bars = Array.from({ length: 50 }, (_, i) => ({ time: i + 1, open: i + 10, high: i + 12, low: i + 9, close: i + 11, volume: 100, rsi: i, atr: i, adx: i, signal: 1 }));
test('replay header and chart share a causal bar; future hover is rejected and slice is stable', () => {
  const h = harness(); h.setBars(bars); h.setReplay({ index: 20, playing: false }); h.hover(bars[49]); h.render();
  const slice = h.chart().props.bars;
  assert.equal(slice.length, 20);
  const text = JSON.stringify(h.nodes().filter(n => typeof n.type === 'string').map(n => n.props.children));
  assert.ok(text.includes('C 30.00'), 'header must show replay close rather than future hover close');
  assert.ok(!text.includes('C 60.00'));
  h.hover(bars[4]); h.render(); assert.equal(h.chart().props.bars, slice, 'hover-only render must reuse visible bars');
  h.runEffects(); assert.equal(h.fired, 0, 'replay must not fire live ticker, RSI or signal alerts');
});
test('speed changes restart playback at the selected delay and stop exactly at the final bar', () => {
  const h = harness(); h.setBars(bars); h.setReplay({ index: 48, playing: true }); h.render(); h.runEffects();
  for (const ms of [800, 160, 80, 320]) {
    h.nodes().find(n => n.props?.title === 'Tốc độ phát').props.onChange({ target: { value: String(ms) } });
    h.render(); h.runEffects(); assert.equal(h.delay, ms);
  }
  h.tick(); h.render(); assert.equal(h.chart().props.bars.length, 49);
  h.tick(); h.render(); h.runEffects(); assert.equal(h.chart().props.bars.length, 50);
  assert.ok(h.nodes().some(n => n.props?.children?.includes?.('Tự chạy')), 'stops on the final tick');
});
test('R exits active replay and cancels pick mode without stale keyboard state', () => {
  const h = harness(); h.setBars(bars); h.render(); h.runEffects();
  h.key('r'); h.render(); h.runEffects(); assert.equal(h.chart().props.replayPick, true);
  h.key('r'); h.render(); h.runEffects(); assert.equal(h.chart().props.replayPick, false);
  h.setReplay({ index: 20, playing: false }); h.render(); h.runEffects();
  h.key('r'); h.render(); assert.equal(h.chart().props.bars.length, 50); assert.equal(h.chart().props.replayPick, false);
});
test('chart click converts zero-based position to inclusive visible count', () => {
  const call = source.match(/onPickReplayRef\.current\(([^;]+)\);/);
  assert.ok(call);
  for (const best of [0, 1, 48, 49]) assert.equal(vm.runInNewContext(call[1], { best }), best + 1);
});
test('picking a bar includes exactly that bar even near the beginning or end', () => {
  const h = harness(); h.setBars(bars); h.render();
  for (const count of [1, 2, 49, 50]) {
    h.chart().props.onPickReplay(count); h.render(); assert.equal(h.chart().props.bars.length, count);
  }
});
test('transport wraps on mobile instead of enforcing a single overflowing row', () => {
  const h = harness(); h.setBars(bars); h.setReplay({ index: 20, playing: false }); h.render();
  const transport = h.nodes().find(n => Array.isArray(n.props?.children) && n.props.children.some(c => c?.props?.children === 'REPLAY'));
  assert.match(transport.props.className, /flex-wrap/);
});

