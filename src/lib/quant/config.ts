import type { DeskConfig, Timeframe } from "./types.ts";

export const SYMBOLS = ["BTC/USDT", "ETH/USDT", "SOL/USDT"] as const;

/** Desk universe — liquid Binance USDT-M perps (mỗi symbol tồn tại đúng dạng
 * {base}USDT trên futures; tránh coin có prefix 1000x của sàn). */
export const UNIVERSE_SYMBOLS = [
  "BTC/USDT",
  "ETH/USDT",
  "BNB/USDT",
  "SOL/USDT",
  "XRP/USDT",
  "DOGE/USDT",
  "ADA/USDT",
  "AVAX/USDT",
  "LINK/USDT",
  "DOT/USDT",
  "LTC/USDT",
  "ATOM/USDT",
  "NEAR/USDT",
  "ARB/USDT",
  "OP/USDT",
  "SUI/USDT",
  "APT/USDT",
  "INJ/USDT",
  "FIL/USDT",
  "ETC/USDT",
  "UNI/USDT",
  "AAVE/USDT",
  "XLM/USDT",
  "HBAR/USDT",
  "ICP/USDT",
  "TIA/USDT",
  "SEI/USDT",
  "FET/USDT",
  "LDO/USDT",
  "CRV/USDT",
  "SAND/USDT",
  "AXS/USDT",
  "RUNE/USDT",
  "GRT/USDT",
] as const;

export const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m", "1h", "2h", "4h", "1d", "1w"];

export const INTERVAL_MS: Record<Timeframe, number> = {
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "30m": 30 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "2h": 2 * 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
};

export const TIME_STOP: Record<Timeframe, number> = {
  "5m": 96,
  "15m": 48,
  "30m": 48,
  "1h": 24,
  "2h": 24,
  "4h": 16,
  "1d": 8,
  "1w": 4,
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
    strategyId: "combo",
    regimeFilterPorts: true,
    kcEmaLen: 20,
    kcAtrLen: 10,
    kcMult: 2.0,
    portAdxMin: 20,
    e0v1eDip8: 2.0,
    e0v1eDip16: 3.0,
    e0v1eDip15: 3.5,
    stAtrMult: 3,
    donEntryLen: 20,
    emaFastLen: 20,
    emaSlowLen: 50,
    stochLo: 20,
    stochHi: 80,
    volSpikeMin: 1.2,
    stopAtrMin: 1.2,
    stopAtrMax: 2.5,
    mrStopAtr: 1.8,
    mrRsiLongMax: 30,
    mrRsiShortMin: 70,
    mrAdxMax: 20,
    tp1R: 1.5,
    tp2R: 2.5,
    breakevenR: 1.0,
    tp1ClosePct: 0.5,
    ...partial,
  };
}

export function maxBarsForTf(tf: Timeframe): number {
  switch (tf) {
    case "5m":
      return 50_000;
    case "15m":
      return 36_000;
    case "30m":
      return 36_000;
    case "1h":
      return 27_000;
    case "2h":
      return 13_200;
    case "4h":
      return 13_200;
    case "1d":
      return 2_800;
    case "1w":
      return 520;
  }
}

/**
 * Backtest depth (TV-style deep backtesting). The venue serves 1000 bars per
 * request, so these budgets mean 3–35 paginated requests — the point is a
 * multi-year sample, not a 7-month one:
 *   15m ≈ 1 năm · 1h ≈ 3 năm · 4h ≈ 6 năm · 1d ≈ toàn bộ lịch sử futures.
 */
export function barBudget(tf: Timeframe): number {
  switch (tf) {
    case "5m":
      return 35_000;
    case "15m":
      return 35_000;
    case "30m":
      return 35_000;
    case "1h":
      return 26_280;
    case "2h":
      return 13_140;
    case "4h":
      return 13_140;
    case "1d":
      return 2_800;
    case "1w":
      return 520;
  }
}

/** Confirmation timeframe paired with each LTF (desk convention). */
export const HTF_FOR: Record<Timeframe, Timeframe> = {
  "5m": "4h",
  "15m": "4h",
  "30m": "4h",
  "1h": "4h",
  "2h": "1d",
  "4h": "1d",
  "1d": "1d",
  "1w": "1w",
};

/** HTF companion depth — enough for bias/threshold columns over the same span. */
export function htfBudget(tf: Timeframe): number {
  switch (tf) {
    case "5m":
    case "15m":
    case "30m":
    case "1h":
      return 6_570; // 4h × ~3 năm
    case "2h":
    case "4h":
    case "1d":
      return 2_800; // 1d
    case "1w":
      return 520;
  }
}
