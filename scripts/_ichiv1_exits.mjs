// Exit-profile comparison for ichiv1_plus on 15m REAL data.
//   node --experimental-strip-types scripts/_ichiv1_exits.mjs
import { defaultConfig } from "../src/lib/quant/config.ts";
import { fetchMarketBundle } from "../src/lib/quant/data/binance.server.ts";
import { buildDesk } from "../src/lib/quant/pipeline.ts";
import { runBacktest } from "../src/lib/quant/backtest/engine.ts";

const PROFILES = [
  { name: "A mac-dinh", tp1R: 1.5, tp2R: 2.5, ts: 48 },
  { name: "B nhanh", tp1R: 1.0, tp2R: 1.5, ts: 24 },
  { name: "C chay duoi", tp1R: 2.0, tp2R: 4.0, ts: 96 },
  { name: "D time-only", tp1R: 99, tp2R: 99, ts: 24 },
];

const SYMBOLS = ["BTC/USDT", "SOL/USDT", "1000PEPE/USDT"];

for (const symbol of SYMBOLS) {
  const bundle = await fetchMarketBundle({
    symbol,
    ltf: "15m",
    htf: "4h",
    market: "usdm",
    ltfBars: 35000,
    htfBars: 6570,
  });
  const cfg0 = defaultConfig({ symbol, ltf: "15m", htf: "4h", market: bundle.market, strategyId: "ichiv1_plus" });
  const { ltf } = buildDesk(bundle.ltf, bundle.htf, cfg0);
  console.log(`\n=== ${symbol} 15m — ${ltf.length} bars từ ${new Date(ltf[0].time).toISOString().slice(0, 10)} — ${ltf.filter((b) => b.signal !== 0).length} signal ===`);
  const rows = [];
  for (const prof of PROFILES) {
    const cfg = { ...cfg0, tp1R: prof.tp1R, tp2R: prof.tp2R, timeStopBars: prof.ts };
    const res = runBacktest(ltf, cfg, "15m");
    const m = res.metrics;
    const t = res.testMetrics;
    rows.push({
      profile: prof.name,
      trades: m.trades,
      netPct: +(((m.endEquity - m.startEquity) / m.startEquity) * 100).toFixed(1),
      sharpe: +m.sharpe.toFixed(2),
      ddPct: +(-(m.maxDd * 100)).toFixed(1),
      pf: +m.profitFactor.toFixed(2),
      oosNet: t ? +(((t.endEquity - t.startEquity) / t.startEquity) * 100).toFixed(1) : null,
      oosSharpe: t ? +t.sharpe.toFixed(2) : null,
    });
  }
  rows.sort((a, b) => b.oosNet - a.oosNet);
  console.table(rows);
}
