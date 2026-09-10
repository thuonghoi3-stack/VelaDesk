import { cleanOhlcv } from "./data/cleaner.ts";
import { lastPatterns, latestIndicators, scoreConfluence } from "./features/confluence.ts";
import { applyRegime, computeIndicators } from "./features/indicators.ts";
import { applyPatterns } from "./features/patterns.ts";
import { mapHtfToLtf } from "./features/regime.ts";
import { applyLibraryStrategy } from "./strategy/library.ts";
import { applyMeanReversion } from "./strategy/mean-reversion.ts";
import { applyTrendPullback } from "./strategy/trend-pullback.ts";
import type {
  AnalysisSnapshot,
  DataSource,
  DeskConfig,
  FeatureBar,
  Ohlcv,
  Timeframe,
} from "./types.ts";

export function enrichSeries(raw: Ohlcv[], tf: Timeframe): FeatureBar[] {
  const clean = cleanOhlcv(raw, tf);
  const feat = computeIndicators(clean);
  applyRegime(feat);
  applyPatterns(feat);
  return feat;
}

export function buildDesk(
  ltfRaw: Ohlcv[],
  htfRaw: Ohlcv[],
  cfg: DeskConfig,
): { ltf: FeatureBar[]; htf: FeatureBar[] } {
  const ltf = enrichSeries(ltfRaw, cfg.ltf);
  const htf = enrichSeries(htfRaw, cfg.htf);
  mapHtfToLtf(ltf, htf, cfg.htf);
  // applySignals is pure — it returns fresh copies carrying the signal columns.
  return { ltf: applySignals(ltf, cfg), htf };
}

/**
 * Reset and re-apply both strategy signal passes from the CURRENT config
 * inputs. Enriched columns (indicators/patterns) are causal and stay valid —
 * only the signal fields are recomputed, so input edits re-run in ms.
 */
export function applySignals(bars: FeatureBar[], cfg: DeskConfig): FeatureBar[] {
  const out = bars.map((b) => ({
    ...b,
    nativeIntents: undefined,
    signal: 0 as const,
    // Explicit zero prevents legacy signal fallback on recomputed bars.
    exitSignal: 0 as const,
    exitStrategy: undefined,
    signalReason: "",
    strategy: "none" as const,
  }));
  const allowShort = cfg.side === "both";
  const warmup = cfg.warmup;
  if (cfg.strategyId === "combo") {
    // Desk default: both house strategies layered (TP wins ties — applied first).
    applyTrendPullback(out, {
      tradeVolatility: cfg.tradeVolatility,
      allowShort,
      warmup,
      volSpikeMin: cfg.volSpikeMin,
    });
    applyMeanReversion(out, {
      allowShort,
      warmup,
      mrRsiLongMax: cfg.mrRsiLongMax,
      mrRsiShortMin: cfg.mrRsiShortMin,
      mrAdxMax: cfg.mrAdxMax,
    });
  } else if (cfg.strategyId === "trend_pullback") {
    applyTrendPullback(out, {
      tradeVolatility: cfg.tradeVolatility,
      allowShort,
      warmup,
      volSpikeMin: cfg.volSpikeMin,
    });
  } else if (cfg.strategyId === "mean_reversion") {
    applyMeanReversion(out, {
      allowShort,
      warmup,
      mrRsiLongMax: cfg.mrRsiLongMax,
      mrRsiShortMin: cfg.mrRsiShortMin,
      mrAdxMax: cfg.mrAdxMax,
    });
  } else {
    // Ported TradingView strategy — each port is self-contained.
    applyLibraryStrategy(out, cfg.strategyId, cfg);
  }
  return out;
}

export function snapshotOf(
  ltf: FeatureBar[],
  cfg: DeskConfig,
  source: DataSource,
  sourceNote: string,
): AnalysisSnapshot {
  const last = ltf[ltf.length - 1];
  if (!last) {
    return {
      symbol: cfg.symbol,
      ltf: cfg.ltf,
      htf: cfg.htf,
      source,
      sourceNote,
      lastTime: 0,
      lastClose: 0,
      regime: "mixed",
      highVol: false,
      confluence: 0,
      confluenceBreakdown: { trend: 0, momentum: 0, volatility: 0, volume: 0, pattern: 0 },
      indicators: {},
      lastBars: [],
      patterns: [],
      htfBias: 0,
      pendingSignal: 0,
      pendingReason: "",
      pendingStrategy: "none",
    };
  }
  const breakdown = scoreConfluence(last);
  const confluence = Object.values(breakdown).reduce((s, v) => s + v, 0);
  return {
    symbol: cfg.symbol,
    ltf: cfg.ltf,
    htf: cfg.htf,
    source,
    sourceNote,
    lastTime: last.time,
    lastClose: last.close,
    regime: last.regime,
    highVol: last.highVol,
    confluence,
    confluenceBreakdown: breakdown,
    indicators: latestIndicators(last),
    lastBars: ltf.slice(-5),
    patterns: lastPatterns(ltf, 8),
    htfBias: last.htfBias,
    pendingSignal: last.signal,
    pendingReason: last.signalReason,
    pendingStrategy: last.strategy,
  };
}
