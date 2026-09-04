import type { DeskConfig, Timeframe } from "./types";

export const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;

export const TIMEFRAMES: Timeframe[] = ["15m", "1h", "4h", "1d"];

export const INTERVAL_MS: Record<Timeframe, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

export const TIME_STOP: Record<Timeframe, number> = {
  "15m": 48,
  "1h": 24,
  "4h": 16,
  "1d": 8,
};

export function defaultConfig(partial?: Partial<DeskConfig>): DeskConfig {
  const ltf = partial?.ltf ?? "1h";
  return {
    exchange: "binance",
    market: "usdm",
    symbols: [...SYMBOLS],
    symbol: "BTC/USDT",
    ltf,
    htf: "4h",
    lookbackYears: 2.5,
    equity: 10_000,
    riskPct: 0.0075,
    maxLeverage: 2,
    side: "both",
    maxPositions: 1,
    maxExposure: 0.25,
    dailyLossCap: 0.03,
    takerFee: 0.0004,
    slippageBps: 2,
    fundingPer8h: 0.0001,
    tradeVolatility: false,
    timeStopBars: TIME_STOP[ltf],
    warmup: 220,
    ...partial,
  };
}

export function toCcxtSymbol(symbol: string): string {
  return symbol.replace("/", "");
}

export function maxBarsForTf(tf: Timeframe): number {
  switch (tf) {
    case "15m":
      return 18_000;
    case "1h":
      return 22_000;
    case "4h":
      return 10_000;
    case "1d":
      return 2_600;
  }
}
