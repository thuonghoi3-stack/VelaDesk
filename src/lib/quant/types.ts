export type Timeframe = "15m" | "1h" | "4h" | "1d";
export type MarketType = "spot" | "usdm";
export type TradeSide = "long_only" | "both";
export type Regime = "trending_up" | "trending_down" | "ranging" | "mixed";
export type DataSource = "binance" | "binance_us" | "bitget" | "okx" | "synthetic";

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
  strategy: "trend_pullback" | "mean_reversion" | "none";
};

export type PositionSide = "long" | "short";

export type OpenPosition = {
  id: string;
  side: PositionSide;
  strategy: "trend_pullback" | "mean_reversion";
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
  barsHeld: number;
  tp1Done: boolean;
  trailed: boolean;
  rReached: number;
};

export type Trade = {
  id: string;
  side: PositionSide;
  strategy: "trend_pullback" | "mean_reversion";
  entryTime: number;
  exitTime: number;
  entry: number;
  exit: number;
  qty: number;
  pnl: number;
  pnlR: number;
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
};

export type PaperEvent = {
  time: number;
  kind: "signal" | "fill" | "exit" | "halt" | "info";
  message: string;
};
