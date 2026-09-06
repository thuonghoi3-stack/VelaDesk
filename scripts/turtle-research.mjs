// Research: Donchian/Turtle family variants on REAL data, with OOS (30%) metrics.
//   node --experimental-strip-types scripts/_turtle_research.mjs
import { defaultConfig } from "../src/lib/quant/config.ts";
import { fetchMarketBundle } from "../src/lib/quant/data/binance.server.ts";
import { buildDesk } from "../src/lib/quant/pipeline.ts";
import { runBacktest } from "../src/lib/quant/backtest/engine.ts";

const IDS = ["donchian", "turtle_s1", "turtle_s2", "donchian_trend"];
const CASES = [
  { symbol: "BTC/USDT", ltf: "4h", htf: "1d", ltfBars: 13140, htfBars: 2800 },
  { symbol: "ETH/USDT", ltf: "4h", htf: "1d", ltfBars: 13140, htfBars: 2800 },
  { symbol: "SOL/USDT", ltf: "4h", htf: "1d", ltfBars: 13140, htfBars: 2800 },
  { symbol: "BTC/USDT", ltf: "1d", htf: "1d", ltfBars: 2800, htfBars: 2800 },
];

for (const c of CASES) {
  const bundle = await fetchMarketBundle({
    symbol: c.symbol,
    ltf: c.ltf,
    htf: c.htf,
    market: "usdm",
    ltfBars: c.ltfBars,
    htfBars: c.htfBars,
  });
  console.log(
    `\n=== ${c.symbol} ${c.ltf} — ${bundle.ltf.length} bars (${bundle.source}) ===`,
  );
  const rows = [];
  for (const id of IDS) {
    const cfg = defaultConfig({
      symbol: c.symbol,
      ltf: c.ltf,
      htf: c.htf,
      market: bundle.market,
      strategyId: id,
    });
    const { ltf: bars } = buildDesk(bundle.ltf, bundle.htf, cfg);
    const res = runBacktest(bars, cfg, c.ltf);
    const m = res.metrics;
    const t = res.testMetrics;
    rows.push({
      id,
      trades: m.trades,
      netPct: +(((m.endEquity - m.startEquity) / m.startEquity) * 100).toFixed(1),
      sharpe: +m.sharpe.toFixed(2),
      ddPct: +(-(m.maxDd * 100)).toFixed(1),
      pf: +m.profitFactor.toFixed(2),
      oosNetPct:
        t == null
          ? null
          : +(((t.endEquity - t.startEquity) / t.startEquity) * 100).toFixed(1),
      oosSharpe: t == null ? null : +t.sharpe.toFixed(2),
    });
  }
  rows.sort((a, b) => b.sharpe - a.sharpe);
  console.table(rows);
}
