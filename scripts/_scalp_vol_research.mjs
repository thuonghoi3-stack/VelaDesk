// High-vol coin scalper research: e0v1e + scalping family on 5m REAL data.
//   node --experimental-strip-types scripts/_scalp_vol_research.mjs
import { defaultConfig } from "../src/lib/quant/config.ts";
import { fetchMarketBundle } from "../src/lib/quant/data/binance.server.ts";
import { buildDesk } from "../src/lib/quant/pipeline.ts";
import { runBacktest } from "../src/lib/quant/backtest/engine.ts";

const IDS = ["e0v1e", "scalper_ema", "stoch_rsi", "vwap_reclaim", "orb", "rsi7_momentum"];
const SYMBOLS = ["1000PEPE/USDT", "1000FLOKI/USDT", "WIF/USDT", "ORDI/USDT", "SUI/USDT"];

for (const symbol of SYMBOLS) {
  const bundle = await fetchMarketBundle({
    symbol,
    ltf: "5m",
    htf: "4h",
    market: "usdm",
    ltfBars: 35000,
    htfBars: 6570,
  });
  if (bundle.ltf.length < 2000) {
    console.log(`\n=== ${symbol}: quá ít dữ liệu (${bundle.ltf.length}) — bỏ qua ===`);
    continue;
  }
  const first = new Date(bundle.ltf[0].time).toISOString().slice(0, 10);
  console.log(`\n=== ${symbol} 5m — ${bundle.ltf.length} bars từ ${first} (${bundle.source}) ===`);
  const rows = [];
  for (const id of IDS) {
    const cfg = defaultConfig({ symbol, ltf: "5m", htf: "4h", market: bundle.market, strategyId: id });
    const { ltf } = buildDesk(bundle.ltf, bundle.htf, cfg);
    const res = runBacktest(ltf, cfg, "5m");
    const m = res.metrics;
    const t = res.testMetrics;
    rows.push({
      id,
      trades: m.trades,
      netPct: +(((m.endEquity - m.startEquity) / m.startEquity) * 100).toFixed(1),
      sharpe: +m.sharpe.toFixed(2),
      ddPct: +(-(m.maxDd * 100)).toFixed(1),
      pf: +m.profitFactor.toFixed(2),
      oosNet: t ? +(((t.endEquity - t.startEquity) / t.startEquity) * 100).toFixed(1) : null,
    });
  }
  rows.sort((a, b) => b.netPct - a.netPct);
  console.table(rows);
}
