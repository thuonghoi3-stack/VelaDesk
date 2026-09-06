// Optimize Keltner breakout parameters with the VelaDesk engine (walk-forward).
//   node --experimental-strip-types scripts/_keltner_optimize.mjs
import { defaultConfig } from "../src/lib/quant/config.ts";
import { fetchMarketBundle } from "../src/lib/quant/data/binance.server.ts";
import { buildDesk } from "../src/lib/quant/pipeline.ts";
import { runBacktest, SimEngine } from "../src/lib/quant/backtest/engine.ts";
import { runGrid, walkForwardEfficiency } from "../src/lib/quant/backtest/lab.ts";

const bundle = await fetchMarketBundle({
  symbol: "BTC/USDT",
  ltf: "4h",
  htf: "1d",
  market: "usdm",
  ltfBars: 13140,
  htfBars: 2800,
});
console.log(`data: ${bundle.ltf.length} BTC/USDT 4h bars (${bundle.source})`);

const cfg = defaultConfig({ symbol: "BTC/USDT", ltf: "4h", htf: "1d", market: bundle.market, strategyId: "keltner" });
const bars = buildDesk(bundle.ltf, bundle.htf, cfg).ltf;

const res = runGrid({
  bars,
  cfg,
  tf: "4h",
  axes: [
    { key: "kcMult", values: [1.5, 2, 2.5] },
    { key: "kcEmaLen", values: [10, 20, 30] },
    { key: "portAdxMin", values: [0, 15, 20, 25] },
  ],
  objective: "sharpe",
  minTrades: 15,
});

const top = res.combos.slice(0, 10);
console.log("\nTop 10 combo (train 70%, objective = Sharpe):");
console.table(
  top.map((c) => ({
    combo: c.label,
    trainSharpe: +c.score.toFixed(2),
    trades: c.train.trades,
    trainDD: +(c.train.maxDd * 100).toFixed(1) + "%",
    trainPF: +c.train.profitFactor.toFixed(2),
  })),
);

console.log(`\nTổng combo: ${res.combos.length}${res.truncated ? " (bị cắt)" : ""}`);
if (res.best && res.test && res.control) {
  const wfe = walkForwardEfficiency(res.best.score, res.test.sharpe);
  console.log(`Best (train): ${res.best.label} — Sharpe ${res.best.score.toFixed(2)}`);
  console.log(
    `Best trên TEST 30%: Sharpe ${res.test.sharpe.toFixed(2)} · DD ${(res.test.maxDd * 100).toFixed(1)}% · PF ${res.test.profitFactor.toFixed(2)} · ${res.test.trades} lệnh · net ${(((res.test.endEquity - res.test.startEquity) / res.test.startEquity) * 100).toFixed(1)}%`,
  );
  console.log(
    `Control (mặc định) trên TEST: Sharpe ${res.control.sharpe.toFixed(2)} · DD ${(res.control.maxDd * 100).toFixed(1)}% · PF ${res.control.profitFactor.toFixed(2)} · ${res.control.trades} lệnh · net ${(((res.control.endEquity - res.control.startEquity) / res.control.startEquity) * 100).toFixed(1)}%`,
  );
  console.log(`Walk-forward efficiency: ${wfe == null ? "—" : wfe.toFixed(2)}`);

  // Full-sample backtest with the winning combo applied.
  const fullCfg = { ...cfg, ...res.best.params };
  const full = runBacktest(bars, fullCfg, "4h");
  const m = full.metrics;
  console.log(
    `Best combo full-sample: net ${(((m.endEquity - m.startEquity) / m.startEquity) * 100).toFixed(1)}% · Sharpe ${m.sharpe.toFixed(2)} · DD ${(m.maxDd * 100).toFixed(1)}% · PF ${m.profitFactor.toFixed(2)} · ${m.trades} lệnh · OOS-gate ${full.claimBlocked ? "CHẶN" : "ĐẠT"} (${full.claimReason})`,
  );
}
