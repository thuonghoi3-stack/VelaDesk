import { defaultConfig } from "../config";
import { fetchMarketBundle } from "./binance.server";
import { buildDesk, snapshotOf } from "../pipeline";
import type { DataSource, Regime, StrategyId, Timeframe } from "../types";

export type ScanArgs = {
  symbols: string[];
  ltf: Timeframe;
  htf: Timeframe;
  market: "spot" | "usdm";
};

export type ScanRow = {
  symbol: string;
  source: DataSource;
  price: number | null;
  /** Change over the last 24 closed LTF bars (labelled "24 nến" in the UI). */
  changePct: number | null;
  regime: Regime | null;
  adx: number | null;
  rsi: number | null;
  /** ATR(14) as percent of price — cross-symbol comparable volatility. */
  atrPct: number | null;
  confluence: number | null;
  pendingSignal: -1 | 0 | 1;
  pendingStrategy: StrategyId | "none";
  htfBias: -1 | 0 | 1;
  bars: number;
};

export type ScanResult = {
  rows: ScanRow[];
  ltf: Timeframe;
  htf: Timeframe;
  scannedAt: number;
};

const num = (v: number | null | undefined): number | null =>
  v != null && Number.isFinite(v) ? v : null;

/**
 * Run the desk pipeline (indicators → regime → patterns → strategies) on every
 * symbol and return one rule-derived row each. Same engine as the desk — a
 * screener row is exactly what the chart would show for that symbol.
 */
export async function fetchScan(args: ScanArgs): Promise<ScanResult> {
    const rows = await Promise.all(
      args.symbols.map(async (symbol): Promise<ScanRow> => {
        try {
          const bundle = await fetchMarketBundle({
            symbol,
            ltf: args.ltf,
            htf: args.htf,
            market: args.market,
            ltfBars: 700,
            htfBars: 300,
          });
          const cfg = defaultConfig({
            symbol,
            ltf: args.ltf,
            htf: args.htf,
            market: bundle.market,
            warmup: 220,
          });
          const { ltf } = buildDesk(bundle.ltf, bundle.htf, cfg);
          const snap = snapshotOf(ltf, cfg, bundle.source, bundle.sourceNote);
          const lookback = Math.min(24, ltf.length - 1);
          const ref = ltf[ltf.length - 1 - lookback];
          const atr = num(snap.indicators.atr as number | null);
          const price = snap.lastClose || null;
          return {
            symbol,
            source: bundle.source,
            price,
            changePct:
              price != null && ref && ref.close > 0 ? (price / ref.close - 1) * 100 : null,
            regime: snap.lastBars.length ? snap.regime : null,
            adx: num(snap.indicators.adx as number | null),
            rsi: num(snap.indicators.rsi as number | null),
            atrPct: atr != null && price ? (atr / price) * 100 : null,
            confluence: snap.lastBars.length ? snap.confluence : null,
            pendingSignal: snap.pendingSignal,
            pendingStrategy: snap.pendingStrategy,
            htfBias: snap.htfBias,
            bars: ltf.length,
          };
        } catch {
          return {
            symbol,
            source: "synthetic",
            price: null,
            changePct: null,
            regime: null,
            adx: null,
            rsi: null,
            atrPct: null,
            confluence: null,
            pendingSignal: 0,
            pendingStrategy: "none",
            htfBias: 0,
            bars: 0,
          };
        }
      }),
    );
    return { rows, ltf: args.ltf, htf: args.htf, scannedAt: Date.now() } satisfies ScanResult;
}
