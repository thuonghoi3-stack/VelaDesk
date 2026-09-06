export type Timeframe = "5m" | "15m" | "30m" | "1h" | "2h" | "4h" | "1d" | "1w";
export type MarketType = "spot" | "usdm";
export type TradeSide = "long_only" | "both";
export type Regime = "trending_up" | "trending_down" | "ranging" | "mixed";
export type DataSource = "binance" | "okx" | "synthetic";

/** House strategies (the two this desk was built around). */
export type HouseStrategyId = "trend_pullback" | "mean_reversion";

/**
 * Strategies ported from TradingView Pine Script. Entries follow the Pine
 * default execution model (signal at bar close, fill at next bar open);
 * exits are adapted to the VelaDesk risk engine (see strategy/library.ts).
 */
export type PortedStrategyId =
  | "macd" // TV built-in "MACD Strategy"
  | "rsi_reversion" // TV built-in "RSI Strategy"
  | "bb_reversion" // TV built-in "Bollinger Bands Strategy"
  | "stoch_reversion" // TV built-in "Stochastic Strategy"
  | "supertrend" // classic "Supertrend" (ATR 10, factor 3)
  | "ema_cross" // classic "EMA Cross" (golden/death)
  | "donchian" // Turtle-style Donchian channel breakout
  | "ichimoku" // Ichimoku Cloud (tenkan/kijun cross + cloud filter)
  | "keltner" // Keltner channel breakout (EMA20 ± 2×ATR10)
  | "rsi2" // Larry Connors RSI 2-period reversion + EMA200 filter
  | "squeeze" // TTM Squeeze (BB inside Keltner → release breakout)
  | "psar" // Parabolic SAR flip (Wilder 0.02/0.02/0.2)
  | "ha_trend" // Heikin Ashi color flip + EMA50 filter
  | "fisher" // Ehlers Fisher Transform (9) cross
  | "vwap_fade" // VWAP session z-score fade (100, ±2σ)
  | "turtle_s1" // Turtle System 1: 20-bar entry, 10-bar channel exit
  | "turtle_s2" // Turtle System 2: 55-bar entry, 20-bar channel exit
  | "donchian_trend" // 55-bar entry + EMA200 filter, signal-flip exit
  | "scalper_ema" // EMA 9/21 scalper cross
  | "stoch_rsi" // Stochastic RSI (14/14/3/3)
  | "vwap_reclaim" // session VWAP reclaim/loss
  | "orb" // opening range breakout (6 bars, UTC day)
  | "rsi7_momentum" // RSI(7) 50-line momentum
  | "tsm" // time-series momentum (90-bar lookback)
  | "high_52w" // 52-week-high breakout
  | "ma200_gravity" // ±5% band around SMA200, exit at the mean
  | "tom" // turn-of-the-month seasonality
  | "weinstein_s2" // Weinstein Stage 2 breakout
  | "e0v1e" // NFI-family long scalper (EWO + CTI dip buys)
  | "ichiv1_plus"; // HA Ichimoku fan scalper (entry-only port)

export type StrategyId = HouseStrategyId | PortedStrategyId;
/** "combo" = both house strategies layered (the desk default). */
export type StrategySelection = "combo" | StrategyId;

export type Ohlcv = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  gap?: boolean;
};

export type PatternName =
  | "pin_bar"
  | "hammer"
  | "shooting_star"
  | "bullish_engulfing"
  | "bearish_engulfing"
  | "inside_bar"
  | "doji";

export type PatternHit = {
  name: PatternName;
  direction: -1 | 0 | 1;
  strength: number;
  index: number;
};

export type FeatureBar = Ohlcv & {
  ema20: number | null;
  ema50: number | null;
  ema200: number | null;
  adx: number | null;
  rsi: number | null;
  macd: number | null;
  macdSignal: number | null;
  macdHist: number | null;
  stochK: number | null;
  stochD: number | null;
  atr: number | null;
  atrSma20: number | null;
  bbMid: number | null;
  bbUpper: number | null;
  bbLower: number | null;
  bbWidth: number | null;
  volSma20: number | null;
  volSpike: number | null;
  obv: number | null;
  regime: Regime;
  highVol: boolean;
  extremeVol: boolean;
  pattern: PatternHit | null;
  htfClose: number | null;
  htfEma50: number | null;
  htfAdx: number | null;
  htfBias: -1 | 0 | 1;
  signal: -1 | 0 | 1;
  signalReason: string;
  strategy: StrategyId | "none";
};

export type PositionSide = "long" | "short";

export type OpenPosition = {
  id: string;
  side: PositionSide;
  strategy: StrategyId;
  entryTime: number;
  entryBar: number;
  entry: number;
  qty: number;
  remainingQty: number;
  stop: number;
  tp1: number;
  tp2: number;
  riskPerUnit: number;
  initialRiskUsdt: number;
  /** Funding charged while the position has been open — attributed pro-rata to each partial exit. */
  fundingPaid: number;
  barsHeld: number;
  tp1Done: boolean;
  trailed: boolean;
  rReached: number;
  /** Worst adverse excursion in R seen while open. */
  maeR: number;
  /** SIGNAL_EXIT strategies: no TP caps, no time stop — exit on opposite signal. */
  signalExit: boolean;
  /** Turtle channel exit: close beyond the opposite N-bar channel ends the trade. */
  exitChannelBars?: number;
};

export type Trade = {
  id: string;
  /** Set by the portfolio engine; single-symbol backtests leave it undefined. */
  symbol?: string;
  side: PositionSide;
  strategy: StrategyId;
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  pnlR: number;
  /** Best and worst excursion during the trade, in R (risk units). */
  mfeR: number;
  maeR: number;
  fees: number;
  funding: number;
  reason: string;
  barsHeld: number;
};

export type EquityPoint = {
  time: number;
  equity: number;
  drawdown: number;
};

export type Metrics = {
  bars: number;
  days: number;
  startEquity: number;
  endEquity: number;
  cagr: number;
  sharpe: number;
  sortino: number;
  maxDd: number;
  calmar: number;
  winRate: number;
  profitFactor: number;
  avgR: number;
  expectancy: number;
  trades: number;
  exposure: number;
  grossProfit: number;
  grossLoss: number;
  avgWin: number;
  avgLoss: number;
  best: number;
  worst: number;
};

export type LosingPeriod = {
  start: number;
  end: number;
  /** Time of the deepest drawdown point inside [start, end]. */
  troughTime: number;
  drawdown: number;
  regimeMix: Record<Regime, number>;
  note: string;
};

export type WalkFold = {
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  test: Metrics;
};

export type BacktestResult = {
  metrics: Metrics;
  testMetrics: Metrics | null;
  buyHold: Metrics;
  equity: EquityPoint[];
  buyHoldEquity: EquityPoint[];
  trades: Trade[];
  losingPeriods: LosingPeriod[];
  walkForward: WalkFold[];
  claimBlocked: boolean;
  claimReason: string;
  dailyHaltDays: number;
};

export type AnalysisSnapshot = {
  symbol: string;
  ltf: Timeframe;
  htf: Timeframe;
  source: DataSource;
  sourceNote: string;
  lastTime: number;
  lastClose: number;
  regime: Regime;
  highVol: boolean;
  confluence: number;
  confluenceBreakdown: {
    trend: number;
    momentum: number;
    volatility: number;
    volume: number;
    pattern: number;
  };
  indicators: Record<string, number | string | null>;
  lastBars: FeatureBar[];
  patterns: PatternHit[];
  htfBias: -1 | 0 | 1;
  pendingSignal: -1 | 0 | 1;
  pendingReason: string;
  pendingStrategy: FeatureBar["strategy"];
};

export type DeskConfig = {
  exchange: "binance" | "bybit";
  market: MarketType;
  symbols: string[];
  symbol: string;
  ltf: Timeframe;
  htf: Timeframe;
  lookbackYears: number;
  equity: number;
  riskPct: number;
  maxLeverage: number;
  side: TradeSide;
  maxPositions: number;
  maxExposure: number;
  dailyLossCap: number;
  takerFee: number;
  slippageBps: number;
  fundingPer8h: number;
  tradeVolatility: boolean;
  timeStopBars: number;
  warmup: number;
  /** Which strategy drives signals: "combo" layers both house strategies. */
  strategyId: StrategySelection;
  /** Port discipline: block ported signals against the ADX regime (trend
   * ports need ADX ≥ 20, reversion ports need ADX < 20) — same rule the two
   * house strategies apply. Turn off to see raw Pine behavior. */
  regimeFilterPorts: boolean;
  // — Ported-strategy inputs (TradingView equivalents) —
  /** Supertrend factor (ATR period fixed at 10, TV default 3). */
  /** Keltner channel construction (port `keltner`). */
  kcEmaLen: number;
  kcAtrLen: number;
  kcMult: number;
  /** E0V1E dip thresholds, ATR-NORMALIZED: long when the price sits more
   * than dip8/dip16/dip15 × ATR(14) BELOW EMA8/EMA16/SMA15. ATR scaling
   * adapts the same rule to every coin's volatility (measured p99.5 on
   * BTC/ETH/SOL 5m: ~2.2/3.3/3.6 ATR). */
  e0v1eDip8: number;
  e0v1eDip16: number;
  e0v1eDip15: number;
  /** ADX regime-gate threshold for ported strategies (trend ≥, reversion <). */
  portAdxMin: number;
  stAtrMult: number;
  /** Donchian breakout channel length (Turtle default 20). */
  donEntryLen: number;
  /** EMA cross lengths (classic 20/50; 50/200 = golden/death). */
  emaFastLen: number;
  emaSlowLen: number;
  /** Stochastic built-in thresholds (TV default 20/80). */
  stochLo: number;
  stochHi: number;
  // — Strategy Tester inputs (TV-style: editable, re-run on change) —
  /** Trend pullback: volume must exceed volSpikeMin × SMA20 on the signal bar. */
  volSpikeMin: number;
  /** Stop distance clamp in ATR multiples (swing-stop strategy). */
  stopAtrMin: number;
  stopAtrMax: number;
  /** Mean reversion: fixed ATR stop multiple. */
  mrStopAtr: number;
  mrRsiLongMax: number;
  mrRsiShortMin: number;
  mrAdxMax: number;
  /** Exit ladder: TP1 at tp1R (close tp1ClosePct), TP2 at tp2R, break-even after breakevenR. */
  tp1R: number;
  tp2R: number;
  breakevenR: number;
  tp1ClosePct: number;
};

export type PaperEvent = {
  time: number;
  kind: "signal" | "fill" | "exit" | "halt" | "info";
  message: string;
};
