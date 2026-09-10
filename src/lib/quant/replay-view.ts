import type { SimEngine } from "./backtest/engine.ts";

/** Read-only replay projection. engine.i is the NEXT unprocessed bar.
 * Progress covers all loaded bars after warmup, or an explicit historical target.
 * The engine owns prices/accounting; this layer never recalculates fills or MTM.
 */
export function replayView(engine: SimEngine | null, initialEquity: number, startIndex = engine?.cfg.warmup ?? 0) {
  const length = engine?.bars.length ?? 0;
  const index =
    engine && Number.isFinite(engine.i) ? Math.min(length, Math.max(0, Math.floor(engine.i))) : 0;
  const start = engine ? Math.min(length, Math.max(startIndex, 0)) : 0;
  const total = length - start;
  const processed = Math.min(total, Math.max(0, index - start));
  const bars = engine?.bars.slice(0, index) ?? [];
  const cash = engine?.equity ?? initialEquity;
  const mtm = engine?.equityCurve.at(-1)?.equity ?? cash;
  const position = engine?.position
    ? { ...engine.position, qty: engine.position.remainingQty }
    : null;
  return {
    bars,
    lastBar: bars.at(-1) ?? null,
    index,
    start,
    total,
    processed,
    remaining: total - processed,
    progress: total ? (processed / total) * 100 : 0,
    cash,
    mtm,
    unrealized: mtm - cash,
    position,
  };
}
