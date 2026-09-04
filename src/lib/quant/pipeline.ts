import { defaultConfig } from "./config";
import { cleanOhlcv } from "./data/cleaner";
import { lastPatterns, latestIndicators, scoreConfluence } from "./features/confluence";
import { applyRegime, computeIndicators } from "./features/indicators";
import { applyPatterns } from "./features/patterns";
import { mapHtfToLtf } from "./features/regime";
import { applyMeanReversion } from "./strategy/mean-reversion";
import { applyTrendPullback } from "./strategy/trend-pullback";
import type {
  AnalysisSnapshot,
  DataSource,
  DeskConfig,
  FeatureBar,
  Ohlcv,
  Timeframe,
} from "./types";

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
  const allowShort = cfg.side === "both";
  applyTrendPullback(ltf, {
    tradeVolatility: cfg.tradeVolatility,
    allowShort,
    warmup: cfg.warmup,
  });
  applyMeanReversion(ltf, { allowShort, warmup: cfg.warmup });
  return { ltf, htf };
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

export function withConfig(partial?: Partial<DeskConfig>): DeskConfig {
  return defaultConfig(partial);
}
