/** Reference of vaskosmihaylov/nfi-custom-strategies binance.py (GPL-3.0).
 * Commit d4b642187d6c87b437e99b7af2cfd95aa344d250.
 * SHA256 6a509820785852e65b077ef42b8b2f31389ca60d1fb5736b152ab878a2a90277.
 * Pure source-default decisions; NOT a Freqtrade execution simulator.
 */
export interface E0V1EEntryIndicators {
  close: number; low: number; ema8: number; ema16: number; ewo: number;
  rsi: number; rsiFast: number; rsiSlow: number; sma15: number; cti: number;
}
export interface E0V1ECandle { close: number; low: number }

/** Default TA-Lib compatibility, unstable period zero; finite contiguous input only. */
export function e0v1eIndicators(candles: readonly E0V1ECandle[]): E0V1EEntryIndicators[] {
  if (candles.some(r => !Number.isFinite(r.close) || !Number.isFinite(r.low))) throw new Error('Expected finite close/low samples');
  const closes = candles.map(r => r.close);
  const ema = (period: number) => {
    let value = NaN;
    return closes.map((close, i) => {
      if (i === period - 1) value = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
      else if (i >= period) value += (close - value) * (2 / (period + 1));
      return value;
    });
  };
  const rsi = (period: number) => {
    let gain = 0, loss = 0;
    return closes.map((close, i) => {
      if (!i) return NaN;
      const delta = close - closes[i - 1];
      if (i <= period) { gain += Math.max(delta, 0); loss += Math.max(-delta, 0); }
      if (i < period) return NaN;
      if (i === period) { gain /= period; loss /= period; }
      else { gain = (gain * (period - 1) + Math.max(delta, 0)) / period; loss = (loss * (period - 1) + Math.max(-delta, 0)) / period; }
      return gain + loss === 0 ? 0 : 100 * gain / (gain + loss);
    });
  };
  const ema8 = ema(8), ema16 = ema(16), ema50 = ema(50), ema200 = ema(200);
  const rsi14 = rsi(14), rsi4 = rsi(4), rsi20 = rsi(20);
  return candles.map((row, i) => {
    let cti = NaN;
    if (i >= 19) {
      const values = closes.slice(i - 19, i + 1);
      const mean = values.reduce((a, b) => a + b, 0) / 20;
      let covariance = 0, variance = 0, timeVariance = 0;
      values.forEach((v, j) => { covariance += (v - mean) * (j - 9.5); variance += (v - mean) ** 2; timeVariance += (j - 9.5) ** 2; });
      cti = covariance / Math.sqrt(variance * timeVariance);
    }
    return { close: row.close, low: row.low, ema8: ema8[i], ema16: ema16[i], ewo: (ema50[i] - ema200[i]) / row.low * 100,
      rsi: rsi14[i], rsiFast: rsi4[i], rsiSlow: rsi20[i], cti,
      sma15: i >= 14 ? closes.slice(i - 14, i + 1).reduce((a, b) => a + b, 0) / 15 : NaN };
  });
}

export function e0v1eEntry(row: E0V1EEntryIndicators, previousRsiSlow: number) {
  const ewo = row.rsiFast < 50 && row.close < row.ema8 * .956 && row.ewo > -1.238 && row.close < row.ema16 * .986 && row.rsi < 30;
  const buy1 = row.rsiSlow < previousRsiSlow && row.rsiFast < 63 && row.rsi > 16 && row.close < row.sma15 * .932 && row.cti < -.8;
  return { enterLong: ewo || buy1, enterTag: (ewo ? 'ewo' : '') + (buy1 ? 'buy_1' : ''), ewo, buy1 };
}


export const E0V1E_SOURCE = {
  commit: 'd4b642187d6c87b437e99b7af2cfd95aa344d250',
  sha256: '6a509820785852e65b077ef42b8b2f31389ca60d1fb5736b152ab878a2a90277',
  path: 'user_data/strategies/e0v1e/binance.py', license: 'GPL-3.0',
  timeframe: '5m', startupCandleCount: 20, processOnlyNewCandles: true,
  stoploss: -.99, useCustomStoploss: true, minimalRoi: { '0': 10 },
  orderTypes: { entry: 'market', exit: 'market', emergency_exit: 'market', force_entry: 'market', force_exit: 'market', stoploss: 'market', stoploss_on_exchange: false, stoploss_on_exchange_interval: 60, stoploss_on_exchange_market_ratio: .99 },
  exitTrend: { exitLong: 0, exitTag: 'long_out' },
  runtimeParity: 'unresolved',
} as const;

/** UTC milliseconds; profit is the caller's Freqtrade fee/leverage-aware ratio.
 * fastk must come from the exact last analyzed candle, not an intrabar guess.
 */
export interface E0V1EStoplossContext {
  currentTimeMs: number; openTimeMs: number; currentProfit: number;
  enterTag?: string | null; fastk: number;
}
/** Raw callback return: distance from CURRENT rate, not an exit or an R target.
 * Applying monotonic stops, leverage and callback/fill timing is unresolved here.
 */
export function e0v1eCustomStoploss(context: E0V1EStoplossContext): number {
  const { currentTimeMs, openTimeMs, currentProfit, enterTag, fastk } = context;
  if (currentTimeMs - 3600000 > openTimeMs && fastk > 75 && currentProfit > -.01) return -.001;
  if (currentTimeMs - 86400000 > openTimeMs && fastk > 75 && currentProfit > -.05) return -.001;
  if ((enterTag ?? '').split(/\s+/).includes('ewo') && currentProfit >= .05) return -.005;
  if (currentProfit > 0 && fastk > 75) return -.001;
  return -.99;
}

/** Indicators supplied by exact external analyzed dataframe; no approximation. */
export interface E0V1EExitContext {
  currentProfit: number; bbWidth: number; close: number; bbMiddle: number;
  volumeMean12: number; volumeMean24: number;
}
export function e0v1eCustomExit(candle: E0V1EExitContext): 'sell_stoploss_deadfish' | null {
  return candle.currentProfit < -.05 && candle.bbWidth < .05 && candle.close > candle.bbMiddle && candle.volumeMean12 < candle.volumeMean24 ? 'sell_stoploss_deadfish' : null;
}
