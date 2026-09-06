#!/usr/bin/env node
/**
 * Run the whole strategy library over one symbol/timeframe on REAL Binance
 * data and print a metrics table sorted by Sharpe.
 *
 *   node scripts/compare-library.mjs [symbol] [ltf]
 *   default: BTC/USDT 4h
 *
 * Research aid only — past results do not guarantee future results.
 */
import { defaultConfig } from "../src/lib/quant/config.ts";
import { fetchMarketBundle } from "../src/lib/quant/data/binance.server.ts";
import { buildDesk } from "../src/lib/quant/pipeline.ts";
import { runBacktest } from "../src/lib/quant/backtest/engine.ts";
import { STRATEGY_SELECT_OPTIONS } from "../src/lib/quant/strategy/library.ts";

const symbol = process.argv[2] ?? "BTC/USDT";
const ltf = process.argv[3] ?? "4h";
const htf = ltf === "1h" ? "4h" : "1d";

const bundle = await fetchMarketBundle({
  symbol,
  ltf,
  htf,
  market: "usdm",
  ltfBars: { "5m": 35000, "15m": 35000, "30m": 35000, "1h": 26280, "2h": 13140, "4h": 13140, "1d": 2800, "1w": 520 }[ltf] ?? 5000,
  htfBars: htf === "4h" ? 6570 : 2800,
});
console.log(`data: ${bundle.ltf.length} ${ltf} bars (${bundle.source}, ${bundle.market})`);

const rows = [];
for (const opt of STRATEGY_SELECT_OPTIONS) {
  const cfg = defaultConfig({ symbol, ltf, htf, market: bundle.market, strategyId: opt.id });
  const { ltf: bars } = buildDesk(bundle.ltf, bundle.htf, cfg);
  const signals = bars.filter((b) => b.signal !== 0).length;
  const res = runBacktest(bars, cfg, ltf);
  const m = res.metrics;
  rows.push({
    id: opt.id,
    trades: m.trades,
    signals,
    netPct: +(((m.endEquity - m.startEquity) / m.startEquity) * 100).toFixed(1),
    sharpe: +m.sharpe.toFixed(2),
    ddPct: +(-(m.maxDd * 100)).toFixed(1),
    pf: +m.profitFactor.toFixed(2),
    avgBars: res.trades.length ? +(res.trades.reduce((s, t) => s + t.barsHeld, 0) / res.trades.length).toFixed(1) : 0,
  });
}
rows.sort((a, b) => b.sharpe - a.sharpe);
console.table(rows);
