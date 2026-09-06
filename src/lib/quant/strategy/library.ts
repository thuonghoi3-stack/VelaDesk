/**
 * Strategy library — ports of well-known TradingView strategies.
 *
 * Porting contract (read before touching):
 * - Each port keeps the Pine entry logic 1:1 (same formulas, same crossover
 *   conditions) and is self-contained like a Pine script: it computes its own
 *   series from OHLCV instead of leaning on the desk's feature columns, so a
 *   port can be diffed against its Pine source line by line.
 * - Pine's default execution model (signal evaluated at bar close, order
 *   filled at the NEXT bar's open) maps exactly onto this desk's next-bar
 *   fill, so no timing adaptation is needed on entries.
 * - EXITS ARE ADAPTED, not ported: the VelaDesk risk engine (ATR stop +
 *   TP ladder + break-even trail + time stop) manages every trade. A port
 *   that exits on its own flip in Pine (Supertrend) here re-enters on flips
 *   but exits through the shared risk engine. Backtest numbers will therefore
 *   differ from TradingView's own tester — by design, since fees/slippage/
 *   funding and position sizing also differ.
 * - Everything is causal: values at i use bars ≤ i (the Ichimoku cloud is
 *   displaced BACK 26 bars — the value plotted at i on TV — never forward).
 */

import { heikinAshi } from "../../terminal/ha.ts";
import type { DeskConfig, FeatureBar, PortedStrategyId } from "../types.ts";

// ------------------------------- Pine helpers -------------------------------

/** EMA series exactly as ta.ema: seeded with the first value, NaN-free. */
export function emaSeries(values: number[], length: number): Array<number | null> {
  const out: Array<number | null> = new Array(values.length).fill(null);
  if (values.length === 0 || length <= 0) return out;
  const k = 2 / (length + 1);
  let e = values[0]!;
  for (let i = 0; i < values.length; i++) {
    e = values[i]! * k + e * (1 - k);
    if (i >= length - 1) out[i] = e;
  }
  return out;
}

/** Wilder RSI over `length` — same smoothing as ta.rsi. */
export function rsiSeries(values: number[], length: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (n <= length) return out;
  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= length; i++) {
    const d = values[i]! - values[i - 1]!;
    avgGain += Math.max(d, 0);
    avgLoss += Math.max(-d, 0);
  }
  avgGain /= length;
  avgLoss /= length;
  out[length] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = length + 1; i < n; i++) {
    const d = values[i]! - values[i - 1]!;
    avgGain = (avgGain * (length - 1) + Math.max(d, 0)) / length;
    avgLoss = (avgLoss * (length - 1) + Math.max(-d, 0)) / length;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

/** Wilder ATR over `length` (true-range smoothing identical to ta.atr). */
export function atrSeries(
  bars: Array<{ high: number; low: number; close: number }>,
  length: number,
): Array<number | null> {
  const n = bars.length;
  const out: Array<number | null> = new Array(n).fill(null);
  if (n <= length) return out;
  let a = 0;
  for (let i = 1; i <= length; i++) {
    a += Math.max(
      bars[i]!.high - bars[i]!.low,
      Math.abs(bars[i]!.high - bars[i - 1]!.close),
      Math.abs(bars[i]!.low - bars[i - 1]!.close),
    );
  }
  a /= length;
  out[length] = a;
  for (let i = length + 1; i < n; i++) {
    a =
      (a * (length - 1) +
        Math.max(
          bars[i]!.high - bars[i]!.low,
          Math.abs(bars[i]!.high - bars[i - 1]!.close),
          Math.abs(bars[i]!.low - bars[i - 1]!.close),
        )) /
      length;
    out[i] = a;
  }
  return out;
}

/** ta.sma over `length` bars ending at i (null during warmup). */
export function smaSeries(values: number[], length: number): Array<number | null> {
  const n = values.length;
  const out: Array<number | null> = new Array(n).fill(null);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += values[i]!;
    if (i >= length) sum -= values[i - length]!;
    if (i >= length - 1) out[i] = sum / length;
  }
  return out;
}

/** ta.crossover at i: a crossed strictly above b between i-1 and i. */
export function crossover(a: Array<number | null>, b: Array<number | null>, i: number): boolean {
  if (i < 1) return false;
  const a0 = a[i];
  const a1 = a[i - 1];
  const b0 = b[i];
  const b1 = b[i - 1];
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  return a1 <= b1 && a0 > b0;
}

/** ta.crossunder at i: a crossed strictly below b between i-1 and i. */
export function crossunder(a: Array<number | null>, b: Array<number | null>, i: number): boolean {
  if (i < 1) return false;
  const a0 = a[i];
  const a1 = a[i - 1];
  const b0 = b[i];
  const b1 = b[i - 1];
  if (a0 == null || a1 == null || b0 == null || b1 == null) return false;
  return a1 >= b1 && a0 < b0;
}

/** Donchian midpoint — (highest high + lowest low) / 2 over `length` bars ≤ i. */
export function donchianMid(high: number[], low: number[], i: number, length: number): number | null {
  if (i < length - 1) return null;
  let hh = high[i - length + 1]!;
  let ll = low[i - length + 1]!;
  for (let k = i - length + 2; k <= i; k++) {
    if (high[k]! > hh) hh = high[k]!;
    if (low[k]! < ll) ll = low[k]!;
  }
  return (hh + ll) / 2;
}

/** Highest high over the `length` bars STRICTLY BEFORE i (Turtle entry channel). */
function priorHigh(high: number[], i: number, length: number): number | null {
  if (i < length) return null;
  let hh = high[i - length]!;
  for (let k = i - length + 1; k < i; k++) if (high[k]! > hh) hh = high[k]!;
  return hh;
}

function priorLow(low: number[], i: number, length: number): number | null {
  if (i < length) return null;
  let ll = low[i - length]!;
  for (let k = i - length + 1; k < i; k++) if (low[k]! < ll) ll = low[k]!;
  return ll;
}

// --------------------------- strategy classifications -----------------------

/**
 * Reversion-flavored ports share the mean-reversion exit adaptation
 * (fixed ATR stop, take-profit at the BB mid when present).
 */
export const REVERSION_CLASS: ReadonlySet<string> = new Set([
  "rsi_reversion",
  "bb_reversion",
  "stoch_reversion",
  "stoch_rsi",
  "tom",
  "e0v1e",
]);

/**
 * Trend-flavored ports exit on their OWN opposite signal (faithful to the
 * Pine source), with the ATR stop kept as catastrophic protection only:
 * no TP caps and no time stop — profit caps would truncate exactly the fat
 * right tail that pays for a trend follower's low win rate.
 */
export const SIGNAL_EXIT_CLASS: ReadonlySet<string> = new Set([
  "supertrend",
  "donchian",
  "macd",
  "ema_cross",
  "ichimoku",
  "keltner",
  "squeeze",
  "psar",
  "ha_trend",
  "fisher",
  "scalper_ema",
  "vwap_reclaim",
  "orb",
  "rsi7_momentum",
  "tsm",
  "high_52w",
  "ma200_gravity",
  "weinstein_s2",
]);

/**
 * Channel-exit ports: entry is a Donchian breakout, exit is a close beyond
 * the OPPOSITE channel of `bars` length (the actual Turtle exit rule) —
 * enforced by the engine, not by a reverse signal. Like SIGNAL_EXIT these
 * positions carry no TP cap and no time stop.
 */
export const CHANNEL_EXIT: Readonly<Record<string, number>> = {
  turtle_s1: 10,
  turtle_s2: 20,
};

// ------------------------------ the ports -----------------------------------

type PortCtx = {
  bars: FeatureBar[];
  cfg: DeskConfig;
  warmup: number;
  allowShort: boolean;
};

function mark(bar: FeatureBar, signal: -1 | 1, id: PortedStrategyId): void {
  bar.signal = signal;
  bar.signalReason = `${id}_${signal === 1 ? "long" : "short"}`;
  bar.strategy = id;
}

/** TV built-in "MACD Strategy": crossover/crossunder of MACD vs signal (12/26/9). */
function portMacd(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const macd = bars.map((b) => b.macd);
  const sig = bars.map((b) => b.macdSignal);
  for (let i = warmup; i < bars.length; i++) {
    if (crossover(macd, sig, i)) mark(bars[i]!, 1, "macd");
    else if (allowShort && crossunder(macd, sig, i)) mark(bars[i]!, -1, "macd");
  }
}

/** TV built-in "RSI Strategy": RSI crossing up through the oversold level (and down through overbought). */
function portRsi(ctx: PortCtx): void {
  const { bars, cfg, warmup, allowShort } = ctx;
  const rsi = bars.map((b) => b.rsi);
  const loLine = bars.map(() => cfg.mrRsiLongMax as number | null);
  const hiLine = bars.map(() => cfg.mrRsiShortMin as number | null);
  for (let i = warmup; i < bars.length; i++) {
    if (crossover(rsi, loLine, i)) mark(bars[i]!, 1, "rsi_reversion");
    else if (allowShort && crossunder(rsi, hiLine, i)) mark(bars[i]!, -1, "rsi_reversion");
  }
}

/** TV built-in "Bollinger Bands Strategy": close crossing back inside from below/above the bands. */
function portBb(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const close = bars.map((b) => b.close);
  const upper = bars.map((b) => b.bbUpper);
  const lower = bars.map((b) => b.bbLower);
  for (let i = warmup; i < bars.length; i++) {
    if (crossover(close, lower, i)) mark(bars[i]!, 1, "bb_reversion");
    else if (allowShort && crossunder(close, upper, i)) mark(bars[i]!, -1, "bb_reversion");
  }
}

/** TV built-in "Stochastic Strategy": %K crossing %D while oversold/overbought. */
function portStoch(ctx: PortCtx): void {
  const { bars, cfg, warmup, allowShort } = ctx;
  const k = bars.map((b) => b.stochK);
  const d = bars.map((b) => b.stochD);
  for (let i = warmup; i < bars.length; i++) {
    const ki = k[i];
    if (ki == null) continue;
    if (crossover(k, d, i) && ki < cfg.stochLo) mark(bars[i]!, 1, "stoch_reversion");
    else if (allowShort && crossunder(k, d, i) && ki > cfg.stochHi) mark(bars[i]!, -1, "stoch_reversion");
  }
}

/**
 * Classic "Supertrend" (ATR 10 by default, factor `mult`) core series.
 * The band only ratchets in its own direction and the trend flips when close
 * crosses the OPPOSITE band — the canonical implementation. Shared by the
 * strategy port (signals on flips) and the chart overlay (the drawn line).
 */
export function supertrendCore(
  bars: Array<{ high: number; low: number; close: number }>,
  mult: number,
  period = 10,
): { line: Array<number | null>; dir: number[] } {
  const n = bars.length;
  const closes = bars.map((b) => b.close);
  const atr = atrSeries(bars, period);
  const line: Array<number | null> = new Array(n).fill(null);
  const dir: number[] = new Array(n).fill(1);
  let upPrev: number | null = null;
  let dnPrev: number | null = null;
  let trend = 1;
  for (let i = 0; i < n; i++) {
    const atrI = atr[i];
    dir[i] = trend;
    if (atrI == null) continue;
    const hl2 = (bars[i]!.high + bars[i]!.low) / 2;
    let up = hl2 - mult * atrI;
    let dn = hl2 + mult * atrI;
    const prevClose = i > 0 ? closes[i - 1]! : closes[i]!;
    if (upPrev != null && prevClose > upPrev) up = Math.max(up, upPrev);
    if (dnPrev != null && prevClose < dnPrev) dn = Math.min(dn, dnPrev);
    const prevTrend = trend;
    if (prevTrend === -1 && closes[i]! > (dnPrev ?? dn)) trend = 1;
    else if (prevTrend === 1 && closes[i]! < (upPrev ?? up)) trend = -1;
    dir[i] = trend;
    line[i] = trend === 1 ? up : dn;
    upPrev = up;
    dnPrev = dn;
  }
  return { line, dir };
}

/** Port: signal on trend flip. */
function portSupertrend(ctx: PortCtx): void {
  const { bars, cfg, warmup, allowShort } = ctx;
  const { dir } = supertrendCore(bars, cfg.stAtrMult, 10);
  for (let i = Math.max(1, warmup); i < bars.length; i++) {
    if (dir[i] !== dir[i - 1]) {
      if (dir[i] === 1) mark(bars[i]!, 1, "supertrend");
      else if (allowShort) mark(bars[i]!, -1, "supertrend");
    }
  }
}

/** Classic "EMA Cross": fast EMA crossing slow EMA (20/50 by default). */
function portEmaCross(ctx: PortCtx): void {
  const { bars, cfg, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  const fast = emaSeries(closes, Math.round(cfg.emaFastLen));
  const slow = emaSeries(closes, Math.round(cfg.emaSlowLen));
  for (let i = warmup; i < bars.length; i++) {
    if (crossover(fast, slow, i)) mark(bars[i]!, 1, "ema_cross");
    else if (allowShort && crossunder(fast, slow, i)) mark(bars[i]!, -1, "ema_cross");
  }
}

/** Turtle-style Donchian breakout: close beyond the PRIOR N-bar channel (N = cfg.donEntryLen). */
function portDonchian(ctx: PortCtx): void {
  const { bars, cfg, warmup, allowShort } = ctx;
  const len = Math.max(5, Math.round(cfg.donEntryLen));
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  for (let i = warmup; i < bars.length; i++) {
    const hh = priorHigh(highs, i, len);
    const ll = priorLow(lows, i, len);
    if (hh != null && bars[i]!.close > hh) mark(bars[i]!, 1, "donchian");
    else if (allowShort && ll != null && bars[i]!.close < ll) mark(bars[i]!, -1, "donchian");
  }
}

/**
 * Ichimoku Cloud: tenkan(9)/kijun(26) midpoint cross, filtered by the cloud.
 * The cloud under bar i on the TV chart is senkou computed at i-26 (displaced
 * forward when plotted) — using it displaced BACK keeps the filter causal.
 */
function portIchimoku(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  const closes = bars.map((b) => b.close);
  const n = bars.length;
  const tenkan: Array<number | null> = new Array(n).fill(null);
  const kijun: Array<number | null> = new Array(n).fill(null);
  const cloudTop: Array<number | null> = new Array(n).fill(null);
  const cloudBot: Array<number | null> = new Array(n).fill(null);
  const DISP = 26;
  for (let i = 0; i < n; i++) {
    tenkan[i] = donchianMid(highs, lows, i, 9);
    kijun[i] = donchianMid(highs, lows, i, 26);
    const j = i - DISP;
    if (j >= 25 && tenkan[j] != null && kijun[j] != null) {
      const senkouA = (tenkan[j]! + kijun[j]!) / 2;
      const senkouB = donchianMid(highs, lows, j, 52);
      if (senkouB != null) {
        cloudTop[i] = Math.max(senkouA, senkouB);
        cloudBot[i] = Math.min(senkouA, senkouB);
      }
    }
  }
  for (let i = warmup; i < n; i++) {
    const top = cloudTop[i];
    const bot = cloudBot[i];
    if (top == null || bot == null) continue;
    if (crossover(tenkan, kijun, i) && closes[i]! > top) mark(bars[i]!, 1, "ichimoku");
    else if (allowShort && crossunder(tenkan, kijun, i) && closes[i]! < bot) mark(bars[i]!, -1, "ichimoku");
  }
}

/** Keltner channel breakout: close crossing EMA(len) ± mult×ATR(atrLen). */
function portKeltner(ctx: PortCtx): void {
  const { bars, cfg, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  const n = bars.length;
  const mid = emaSeries(closes, Math.max(2, Math.round(cfg.kcEmaLen)));
  const atr = atrSeries(bars, Math.max(2, Math.round(cfg.kcAtrLen)));
  const up: Array<number | null> = new Array(n).fill(null);
  const lo: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (mid[i] != null && atr[i] != null) {
      up[i] = mid[i]! + cfg.kcMult * atr[i]!;
      lo[i] = mid[i]! - cfg.kcMult * atr[i]!;
    }
  }
  for (let i = warmup; i < n; i++) {
    if (crossover(closes, up, i)) mark(bars[i]!, 1, "keltner");
    else if (allowShort && crossunder(closes, lo, i)) mark(bars[i]!, -1, "keltner");
  }
}

// --------------------------- wave-2 ports (new families) --------------------

/** Larry Connors RSI-2: buy deep short-term oversold WITH the 200-EMA trend filter. */
function portRsi2(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  const rsi2 = rsiSeries(closes, 2);
  for (let i = warmup; i < bars.length; i++) {
    const r = rsi2[i];
    const e = bars[i]!.ema200;
    if (r == null || e == null) continue;
    if (r < 10 && bars[i]!.close > e) mark(bars[i]!, 1, "rsi2");
    else if (allowShort && r > 90 && bars[i]!.close < e) mark(bars[i]!, -1, "rsi2");
  }
}

/**
 * TTM Squeeze: Bollinger(20,2) fully inside Keltner(20, 2×ATR10) compresses;
 * the release bar trades the break in the midline-momentum direction.
 */
function portSqueeze(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  const mid = emaSeries(closes, 20);
  const atr = atrSeries(bars, 10);
  const squeezeOn: boolean[] = bars.map((b, i) => {
    if (mid[i] == null || atr[i] == null || b.bbUpper == null || b.bbLower == null) return false;
    const ku = mid[i]! + 2 * atr[i]!;
    const kl = mid[i]! - 2 * atr[i]!;
    return b.bbUpper! < ku && b.bbLower! > kl;
  });
  for (let i = warmup + 1; i < bars.length; i++) {
    if (!(squeezeOn[i - 1] && !squeezeOn[i])) continue;
    const m = bars[i]!.bbMid;
    if (m == null) continue;
    if (bars[i]!.close > m) mark(bars[i]!, 1, "squeeze");
    else if (allowShort) mark(bars[i]!, -1, "squeeze");
  }
}

/** Parabolic SAR flip (af 0.02, step 0.02, max 0.2) — signal on direction change. */
function portPsar(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const AF0 = 0.02;
  const STEP = 0.02;
  const MAX = 0.2;
  if (bars.length < 2) return;
  let trend = 1;
  let sar = bars[0]!.low;
  let ep = bars[0]!.high;
  let af = AF0;
  for (let i = 1; i < bars.length; i++) {
    const b = bars[i]!;
    sar = sar + af * (ep - sar);
    if (trend === 1) {
      if (b.low < sar) {
        if (i >= warmup && allowShort) mark(b, -1, "psar");
        trend = -1;
        sar = ep;
        ep = b.low;
        af = AF0;
      } else if (b.high > ep) {
        ep = b.high;
        af = Math.min(MAX, af + STEP);
      }
    } else {
      if (b.high > sar) {
        if (i >= warmup) mark(b, 1, "psar");
        trend = 1;
        sar = ep;
        ep = b.high;
        af = AF0;
      } else if (b.low < ep) {
        ep = b.low;
        af = Math.min(MAX, af + STEP);
      }
    }
  }
}

/** Heikin Ashi trend: trade the HA color flip, filtered by EMA50. */
function portHaTrend(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const ha = heikinAshi(bars);
  for (let i = warmup; i < bars.length; i++) {
    const e = bars[i]!.ema50;
    if (e == null || i < 1) continue;
    const prevGreen = ha[i - 1]!.close > ha[i - 1]!.open;
    const nowGreen = ha[i]!.close > ha[i]!.open;
    if (!prevGreen && nowGreen && bars[i]!.close > e) mark(bars[i]!, 1, "ha_trend");
    else if (prevGreen && !nowGreen && bars[i]!.close < e && allowShort) mark(bars[i]!, -1, "ha_trend");
  }
}

/** Ehlers Fisher Transform (9): fisher vs its one-bar-delayed trigger. */
function portFisher(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const n = bars.length;
  const fisher: Array<number | null> = new Array(n).fill(null);
  let value = 0;
  let fish = 0;
  for (let i = 8; i < n; i++) {
    let hh = (bars[i - 8]!.high + bars[i - 8]!.low) / 2;
    let ll = hh;
    for (let k = i - 8; k <= i; k++) {
      const m = (bars[k]!.high + bars[k]!.low) / 2;
      if (m > hh) hh = m;
      if (m < ll) ll = m;
    }
    const mid = (bars[i]!.high + bars[i]!.low) / 2;
    const raw = hh === ll ? 0 : (2 * (mid - ll)) / (hh - ll) - 1;
    value = 0.66 * raw + 0.67 * value;
    const v = Math.max(-0.999, Math.min(0.999, value));
    fish = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * fish;
    fisher[i] = fish;
  }
  const trigger = fisher.map((_, i) => (i > 0 ? fisher[i - 1] : null));
  for (let i = warmup; i < n; i++) {
    if (crossover(fisher, trigger, i)) mark(bars[i]!, 1, "fisher");
    else if (allowShort && crossunder(fisher, trigger, i)) mark(bars[i]!, -1, "fisher");
  }
}

/** VWAP fade: session-VWAP deviation z-score stretching past ±2σ reverts. */
function portVwapFade(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const n = bars.length;
  const dev: Array<number | null> = new Array(n).fill(null);
  let day = "";
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    const d = new Date(b.time).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
    if (cumV > 0) dev[i] = b.close - cumPV / cumV;
  }
  const W = 100;
  const Z = 2;
  for (let i = Math.max(warmup, W); i < n; i++) {
    // Stats over the PRIOR window only — the current bar is what we z-score.
    let sum = 0;
    let sumSq = 0;
    let cnt = 0;
    for (let k = i - W; k < i; k++) {
      const v = dev[k];
      if (v != null) {
        sum += v;
        sumSq += v * v;
        cnt++;
      }
    }
    if (cnt < 50 || dev[i] == null || dev[i - 1] == null) continue;
    const mean = sum / cnt;
    const variance = Math.max(sumSq / cnt - mean * mean, 0);
    const sd = Math.sqrt(variance);
    if (sd <= 0) continue;
    const zNow = (dev[i]! - mean) / sd;
    const zPrev = (dev[i - 1]! - mean) / sd;
    if (zPrev >= -Z && zNow < -Z) mark(bars[i]!, 1, "vwap_fade");
    else if (allowShort && zPrev <= Z && zNow > Z) mark(bars[i]!, -1, "vwap_fade");
  }
}

/** Turtle System 1: 20-bar breakout entry (channel exit handled by the engine). */
function portTurtleS1(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  for (let i = warmup; i < bars.length; i++) {
    const hh = priorHigh(highs, i, 20);
    const ll = priorLow(lows, i, 20);
    if (hh != null && bars[i]!.close > hh) mark(bars[i]!, 1, "turtle_s1");
    else if (allowShort && ll != null && bars[i]!.close < ll) mark(bars[i]!, -1, "turtle_s1");
  }
}

/** Turtle System 2: the slower 55-bar breakout. */
function portTurtleS2(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  for (let i = warmup; i < bars.length; i++) {
    const hh = priorHigh(highs, i, 55);
    const ll = priorLow(lows, i, 55);
    if (hh != null && bars[i]!.close > hh) mark(bars[i]!, 1, "turtle_s2");
    else if (allowShort && ll != null && bars[i]!.close < ll) mark(bars[i]!, -1, "turtle_s2");
  }
}

/** 55-bar Donchian with an EMA200 regime filter, classic signal-flip exit. */
function portDonchianTrend(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const highs = bars.map((b) => b.high);
  const lows = bars.map((b) => b.low);
  for (let i = warmup; i < bars.length; i++) {
    const e = bars[i]!.ema200;
    if (e == null) continue;
    const hh = priorHigh(highs, i, 55);
    const ll = priorLow(lows, i, 55);
    if (hh != null && bars[i]!.close > hh && bars[i]!.close > e) mark(bars[i]!, 1, "donchian_trend");
    else if (allowShort && ll != null && bars[i]!.close < ll && bars[i]!.close < e) mark(bars[i]!, -1, "donchian_trend");
  }
}
/** EMA 9/21 Scalper: the classic crypto scalp cross, exit on flip. */
function portScalperEma(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  const fast = emaSeries(closes, 9);
  const slow = emaSeries(closes, 21);
  for (let i = warmup; i < bars.length; i++) {
    if (crossover(fast, slow, i)) mark(bars[i]!, 1, "scalper_ema");
    else if (allowShort && crossunder(fast, slow, i)) mark(bars[i]!, -1, "scalper_ema");
  }
}

/** Stochastic RSI (14/14/3/3): %K/%D cross inside the 20/80 zones. */
function portStochRsi(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const rsi = rsiSeries(bars.map((b) => b.close), 14);
  const n = bars.length;
  const stochRaw: Array<number | null> = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    const r = rsi[i];
    if (i < 13 || r == null) continue;
    let lo = rsi[i - 13]!;
    let hi = rsi[i - 13]!;
    for (let k = i - 12; k <= i; k++) {
      const v = rsi[k];
      if (v == null) continue;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
    stochRaw[i] = hi === lo ? 50 : ((r - lo) / (hi - lo)) * 100;
  }
  // %K = SMA3 of raw, %D = SMA3 of %K.
  const k3 = smaSeries(stochRaw.map((v) => v ?? 0), 3).map((v, i) => (stochRaw[i] == null ? null : v));
  const kSeries: Array<number | null> = k3;
  const dSeries = smaSeries(k3.map((v) => v ?? 0), 3).map((v, i) => (k3[i] == null ? null : v));
  for (let i = warmup; i < n; i++) {
    const kv = kSeries[i];
    if (kv == null) continue;
    if (crossover(kSeries, dSeries, i) && kv < 20) mark(bars[i]!, 1, "stoch_rsi");
    else if (allowShort && crossunder(kSeries, dSeries, i) && kv > 80) mark(bars[i]!, -1, "stoch_rsi");
  }
}

/** VWAP Reclaim: close crosses back through the session VWAP. */
function portVwapReclaim(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const n = bars.length;
  const vwap: Array<number | null> = new Array(n).fill(null);
  let day = "";
  let cumPV = 0;
  let cumV = 0;
  for (let i = 0; i < n; i++) {
    const b = bars[i]!;
    const d = new Date(b.time).toISOString().slice(0, 10);
    if (d !== day) {
      day = d;
      cumPV = 0;
      cumV = 0;
    }
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
    if (cumV > 0) vwap[i] = cumPV / cumV;
  }
  for (let i = warmup; i < n; i++) {
    const v = vwap[i];
    if (v == null) continue;
    if (crossover(bars.map((b) => b.close), vwap, i)) mark(bars[i]!, 1, "vwap_reclaim");
    else if (allowShort && crossunder(bars.map((b) => b.close), vwap, i)) mark(bars[i]!, -1, "vwap_reclaim");
  }
}

/** Opening Range Breakout: break of the first 6 bars' range of each UTC day. */
function portOrb(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const ORB = 6;
  const dayStart: number[] = [];
  let day = "";
  for (let i = 0; i < bars.length; i++) {
    const d = new Date(bars[i]!.time).toISOString().slice(0, 10);
    dayStart.push(d === day ? dayStart[i - 1] ?? i : i);
    day = d;
  }
  for (let i = warmup; i < bars.length; i++) {
    const start = dayStart[i]!;
    if (i - start < ORB || i === 0) continue;
    let hi = bars[start]!.high;
    let lo = bars[start]!.low;
    for (let k = start + 1; k < start + ORB; k++) {
      if (bars[k]!.high > hi) hi = bars[k]!.high;
      if (bars[k]!.low < lo) lo = bars[k]!.low;
    }
    const brokeUp = bars[i]!.close > hi && bars[i - 1]!.close <= hi;
    const brokeDown = bars[i]!.close < lo && bars[i - 1]!.close >= lo;
    if (brokeUp) mark(bars[i]!, 1, "orb");
    else if (allowShort && brokeDown) mark(bars[i]!, -1, "orb");
  }
}

/** RSI-7 momentum: fast RSI crossing the 50 line. */
function portRsi7Momentum(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const rsi7 = rsiSeries(bars.map((b) => b.close), 7);
  const line = bars.map(() => 50 as number | null);
  for (let i = warmup; i < bars.length; i++) {
    if (crossover(rsi7, line, i)) mark(bars[i]!, 1, "rsi7_momentum");
    else if (allowShort && crossunder(rsi7, line, i)) mark(bars[i]!, -1, "rsi7_momentum");
  }
}
/**
 * Quality/literature-backed strategies — designed for 1d/4h where the desk's
 * empirical results show edges survive costs (few, long trades).
 *
 * - TSM: time-series momentum (Moskowitz–Ooi–Pedersen 2012). Position =
 *   sign of the trailing return over `LOOKBACK` bars.
 * - HIGH52W: 52-week-high premium (George & Hwang 2004). Long on a new
 *   closing high over the lookback, short on a new low (mirror).
 * - MA200_GRAVITY: discount/premium around the SMA200 — enter when price
 *   crosses the ±5% band, exit back at the mean (signal flip).
 * - TOM: turn-of-the-month seasonality (Lakonishok–Smidt; Kaiser 2019 for
 *   Bitcoin) — long the last 3 calendar days of the month.
 * - WEINSTEIN_S2: Stage 2 breakout (Stan Weinstein) — price above a rising
 *   200-EMA and a new 50-bar closing high.
 * All causal: value at i uses bars ≤ i.
 */

const TSM_LOOKBACK = 90;
const HIGH_LOOKBACK = 252;
const GRAVITY_BAND = 0.05;
const WEINSTEIN_HIGH = 50;
const WEINSTEIN_SLOPE = 10;

/** Time-series momentum: long while the trailing return is positive. */
function portTsm(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  for (let i = Math.max(warmup, TSM_LOOKBACK + 1); i < bars.length; i++) {
    const retPrev = closes[i - 1]! / closes[i - 1 - TSM_LOOKBACK]! - 1;
    const retNow = closes[i]! / closes[i - TSM_LOOKBACK]! - 1;
    if (retPrev <= 0 && retNow > 0) mark(bars[i]!, 1, "tsm");
    else if (allowShort && retPrev >= 0 && retNow < 0) mark(bars[i]!, -1, "tsm");
  }
}

/** 52-week high / low breakout on closes. */
function portHigh52w(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  for (let i = Math.max(warmup, HIGH_LOOKBACK + 1); i < bars.length; i++) {
    let hh = closes[i - HIGH_LOOKBACK]!;
    let ll = hh;
    for (let k = i - HIGH_LOOKBACK + 1; k < i; k++) {
      const v = closes[k]!;
      if (v > hh) hh = v;
      if (v < ll) ll = v;
    }
    const c = closes[i]!;
    if (c > hh) mark(bars[i]!, 1, "high_52w");
    else if (allowShort && c < ll) mark(bars[i]!, -1, "high_52w");
  }
}

/** Gravity: long a ≥5% discount below SMA200, exit back at the mean; mirrored short. */
function portMa200Gravity(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  for (let i = Math.max(warmup, 1); i < bars.length; i++) {
    const m = bars[i]!.ema200;
    const mPrev = bars[i - 1]!.ema200;
    if (m == null || mPrev == null) continue;
    const c = bars[i]!.close;
    const cPrev = bars[i - 1]!.close;
    const bandLo = m * (1 - GRAVITY_BAND);
    const bandHi = m * (1 + GRAVITY_BAND);
    const crossedLo = cPrev >= mPrev * (1 - GRAVITY_BAND) && c < bandLo;
    const crossedHi = cPrev <= mPrev * (1 + GRAVITY_BAND) && c > bandHi;
    if (crossedLo) mark(bars[i]!, 1, "ma200_gravity");
    else if (allowShort && crossedHi) mark(bars[i]!, -1, "ma200_gravity");
  }
}

/** Turn-of-the-month: long the last 3 calendar days of each UTC month. */
function portTom(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const inTail = (time: number): boolean => {
    const d = new Date(time);
    const dom = d.getUTCDate();
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    return dom >= last - 2; // last 3 days of the month
  };
  let prev = false;
  for (let i = warmup; i < bars.length; i++) {
    const now = inTail(bars[i]!.time);
    if (now && !prev) mark(bars[i]!, 1, "tom");
    else if (allowShort && !now && prev && i + 1 <= bars.length) {
      // First days of the new month: fade the reversal only once per month.
      if (!inTail(bars[Math.max(0, i - 4)]!.time)) mark(bars[i]!, -1, "tom");
    }
    prev = now;
  }
}

/** Weinstein Stage 2: price above a rising EMA200 + new 50-bar closing high. */
function portWeinsteinS2(ctx: PortCtx): void {
  const { bars, warmup, allowShort } = ctx;
  const closes = bars.map((b) => b.close);
  for (let i = Math.max(warmup, WEINSTEIN_SLOPE + 1); i < bars.length; i++) {
    const e = bars[i]!.ema200;
    const ePrev = bars[i - WEINSTEIN_SLOPE]!.ema200;
    const c = closes[i]!;
    if (e == null || ePrev == null) continue;
    const rising = e > ePrev;
    const falling = e < ePrev;
    let hh = closes[i - WEINSTEIN_HIGH]!;
    let ll = hh;
    for (let k = i - WEINSTEIN_HIGH + 1; k <= i; k++) {
      const v = closes[k]!;
      if (v > hh) hh = v;
      if (v < ll) ll = v;
    }
    if (rising && c > e && c >= hh) mark(bars[i]!, 1, "weinstein_s2");
    else if (allowShort && falling && c < e && c <= ll) mark(bars[i]!, -1, "weinstein_s2");
  }
}
/**
 * E0V1E (NFI-family long scalper, 5m): LONG-ONLY dip buys with two
 * conditions, ported 1:1 from vaskosmihaylov/nfi-custom-strategies
 * user_data/strategies/e0v1e/binance.py (hyperopt defaults kept):
 *
 * ewo:   RSI4 < 50 && close < EMA8 x 0.956 && EWO > -1.238
 *        && close < EMA16 x 0.986 && RSI14 < 30
 *        with EWO = (EMA50 - EMA200) / low * 100
 * dip32: RSI20 falling && RSI4 < 63 && RSI14 > 16
 *        && close < SMA15 x 0.932 && CTI20 < -0.8
 *        with CTI = (close - SMA20) / (0.1 * sum|close - SMA20|)
 *
 * Exits in the source are a custom fastk/profit-lock scheme — the desk runs
 * this through its reversion class (TP ladder + time stop = the bounce
 * scalp) instead. LONG-ONLY by design: the source has no short logic.
 */
function portE0v1e(ctx: PortCtx): void {
  const { bars, warmup } = ctx;
  const cfg = ctx.cfg;
  const closes = bars.map((b) => b.close);
  const rsi4 = rsiSeries(closes, 4);
  const rsi14 = rsiSeries(closes, 14);
  const rsi20 = rsiSeries(closes, 20);
  const ema8 = emaSeries(closes, 8);
  const ema16 = emaSeries(closes, 16);
  const sma15 = smaSeries(closes, 15);
  const ema50 = emaSeries(closes, 50);
  const ema200s = emaSeries(closes, 200);
  const atr14 = atrSeries(bars, 14);
  const lows = bars.map((b) => b.low);

  // CTI(20) = (close - SMA20) / (0.1 * sum|close - SMA20|) — range ~[-1, 1].
  const mean20 = smaSeries(closes, 20);
  const cti: Array<number | null> = new Array(bars.length).fill(null);
  for (let i = 19; i < bars.length; i++) {
    const m = mean20[i]!;
    let absDev = 0;
    for (let k = i - 19; k <= i; k++) absDev += Math.abs(closes[k]! - m);
    const denom = 0.1 * absDev;
    if (denom > 0) cti[i] = (closes[i]! - m) / denom;
  }

  for (let i = warmup; i < bars.length; i++) {
    const rf = rsi4[i]!;
    const r = rsi14[i]!;
    const rs = rsi20[i]!;
    const ctiI = cti[i]!;
    const c = closes[i]!;
    const e8 = ema8[i]!;
    const e16 = ema16[i]!;
    const s15 = sma15[i]!;
    const w = ((ema50[i]! - ema200s[i]!) / lows[i]!) * 100;
    const atrI = atr14[i] ?? 0;

    // ATR-normalized dips: how many ATRs the price sits BELOW each mean —
    // the same threshold adapts to every coin's volatility.
    const dip8Atr = atrI > 0 ? (e8 - c) / atrI : 0;
    const dip16Atr = atrI > 0 ? (e16 - c) / atrI : 0;
    const dip15Atr = atrI > 0 ? (s15 - c) / atrI : 0;

    const isEwo =
      rf < 50 &&
      dip8Atr > cfg.e0v1eDip8 &&
      w > -1.238 &&
      dip16Atr > cfg.e0v1eDip16 &&
      r < 30;
    const rsFalling = i > 0 && rsi20[i - 1] != null && rs < rsi20[i - 1]!;
    const isDip32 = rsFalling && rf < 63 && r > 16 && dip15Atr > cfg.e0v1eDip15 && ctiI < -0.8;

    if (isEwo) mark(bars[i]!, 1, "e0v1e");
    else if (isDip32) mark(bars[i]!, 1, "e0v1e");
  }
}

// --------------------------------- registry ---------------------------------

export type StrategyMeta = {
  id: PortedStrategyId;
  name: string;
  origin: string;
  style: "Trend" | "Reversion" | "Breakout";
  rules: string[];
};

export const STRATEGY_LIBRARY: StrategyMeta[] = [
  {
    id: "macd",
    name: "MACD Strategy",
    origin: "TradingView built-in · MACD Strategy (12/26/9)",
    style: "Trend",
    rules: [
      "Long: MACD cắt LÊN đường signal",
      "Short: MACD cắt XUỐNG đường signal",
      "Dùng cột macd/macdSignal đã tính trên LTF",
    ],
  },
  {
    id: "rsi_reversion",
    name: "RSI Strategy",
    origin: "TradingView built-in · RSI Strategy (RSI 14)",
    style: "Reversion",
    rules: [
      "Long: RSI cắt LÊN qua mức quá bán (mặc định 30)",
      "Short: RSI cắt XUỐNG qua mức quá mua (mặc định 70)",
    ],
  },
  {
    id: "bb_reversion",
    name: "Bollinger Bands Strategy",
    origin: "TradingView built-in · Bollinger Bands Strategy (20, 2)",
    style: "Reversion",
    rules: [
      "Long: close cắt LÊN qua dải dưới BB",
      "Short: close cắt XUỐNG qua dải trên BB",
    ],
  },
  {
    id: "stoch_reversion",
    name: "Stochastic Strategy",
    origin: "TradingView built-in · Stochastic Strategy (14/3/3)",
    style: "Reversion",
    rules: [
      "Long: %K cắt LÊN %D khi %K < 20",
      "Short: %K cắt XUỐNG %D khi %K > 80",
    ],
  },
  {
    id: "supertrend",
    name: "Supertrend",
    origin: "Cộng đồng TradingView · Supertrend (ATR 10, factor 3)",
    style: "Trend",
    rules: [
      "Băng trên/dưới = hl2 ± factor × ATR(10), chỉ ratchet một chiều",
      "Long: xu hướng lật từ xuống → lên (close xuyên băng trên)",
      "Short: lật từ lên → xuống (close xuyên băng dưới)",
      "Exit gốc của Pine (lật chiều) → thay bằng risk engine của desk",
    ],
  },
  {
    id: "ema_cross",
    name: "EMA Cross",
    origin: "Cổ điển · EMA 20/50 (golden/death cross khi 50/200)",
    style: "Trend",
    rules: [
      "Long: EMA nhanh cắt LÊN EMA chậm",
      "Short: EMA nhanh cắt XUỐNG EMA chậm",
    ],
  },
  {
    id: "donchian",
    name: "Donchian Turtle Breakout",
    origin: "Hệ thống Turtle · kênh Donchian 20 nến",
    style: "Breakout",
    rules: [
      "Long: close VƯỢT qua đỉnh của 20 nến TRƯỚC đó (không tính nến hiện tại)",
      "Short: close thủng đáy 20 nến trước",
    ],
  },
  {
    id: "ichimoku",
    name: "Ichimoku Cloud",
    origin: "Goichi Hosoda · Ichimoku Kinko Hyo (9/26/52)",
    style: "Trend",
    rules: [
      "Tenkan(9) / Kijun(26) = trung điểm Donchian",
      "Long: tenkan cắt LÊN kijun VÀ close trên mây",
      "Short: tenkan cắt XUỐNG kijun VÀ close dưới mây",
      "Mây tại nến i = senkou tính từ nến i−26 (đảo displacement — không look-ahead)",
    ],
  },
  {
    id: "keltner",
    name: "Keltner Breakout",
    origin: "Cộng đồng TradingView · Keltner Channel (EMA20 ± 2×ATR10)",
    style: "Breakout",
    rules: [
      "Long: close cắt LÊN qua dải trên Keltner",
      "Short: close cắt XUỐNG qua dải dưới Keltner",
    ],
  },
  {
    id: "rsi2",
    name: "Connors RSI-2",
    origin: "Larry Connors · Short Term Trading Strategies (RSI 2 kỳ)",
    style: "Reversion",
    rules: [
      "Bộ lọc xu hướng: close trên EMA200 mới được long (dưới mới được short)",
      "Long: RSI(2) < 10 — oversold ngắn hạn trong xu hướng lên",
      "Short: RSI(2) > 90 — overbought ngắn hạn trong xu hướng xuống",
      "Edge kinh điển của họ reversion ngắn hạn, tần suất lệnh cao",
    ],
  },
  {
    id: "squeeze",
    name: "TTM Squeeze",
    origin: "John Carter · TTM Squeeze (BB trong Keltner → bung)",
    style: "Breakout",
    rules: [
      "Nén: Bollinger(20,2) nằm hoàn toàn trong Keltner(20, 2×ATR10)",
      "Nến bung khỏi nén = tín hiệu; hướng theo close vs giữa BB",
      "Thoát theo tín hiệu đảo chiều (SIGNAL_EXIT) — không cap TP",
    ],
  },
  {
    id: "psar",
    name: "Parabolic SAR",
    origin: "J. Welles Wilder · Parabolic SAR (0.02 / 0.02 / 0.2)",
    style: "Trend",
    rules: [
      "SAR trôi theo xu hướng, tăng tốc (af +0.02, tối đa 0.2) khi lập đỉnh/đáy mới",
      "Long: giá xuyên lên SAR khi đang xu hướng xuống (lật chiều lên)",
      "Short: giá thủng SAR khi đang xu hướng lên",
    ],
  },
  {
    id: "ha_trend",
    name: "Heikin Ashi Trend",
    origin: "Cộng đồng TradingView · HA color flip + EMA50",
    style: "Trend",
    rules: [
      "Dùng chuỗi Heikin Ashi: nến xanh khi HA close > HA open",
      "Long: HA lật từ đỏ sang xanh VÀ close > EMA50",
      "Short: HA lật từ xanh sang đỏ VÀ close < EMA50",
    ],
  },
  {
    id: "fisher",
    name: "Fisher Transform",
    origin: "John Ehlers · Fisher Transform (9)",
    style: "Trend",
    rules: [
      "Chuẩn hoá mid-price trong kênh 9 nến → giá trị ±0.999 → Fisher",
      "Fisher làm đuôi phân phối béo — cắt ngang rõ ràng hơn giá thường",
      "Long: Fisher cắt LÊN trigger (Fisher trễ 1 nến); short: cắt XUỐNG",
    ],
  },
  {
    id: "vwap_fade",
    name: "VWAP Z-Score Fade",
    origin: "Cộng đồng · VWAP deviation z-score (cửa sổ 100, ±2σ)",
    style: "Reversion",
    rules: [
      "VWAP reset theo ngày UTC; độ lệch close − VWAP chuẩn hoá z theo 100 nến trước",
      "Long: z cắt XUỐNG −2 (giá giãn 2σ dưới VWAP — mua về trung bình)",
      "Short: z cắt LÊN +2",
    ],
  },
  {
    id: "turtle_s1",
    name: "Turtle S1 (20/10)",
    origin: "Hệ Turtle gốc · System 1: vào kênh 20, thoát kênh đối 10",
    style: "Breakout",
    rules: [
      "Long: close vượt đỉnh 20 nến trước (chưa tính nến hiện tại)",
      "Exit: close thủng đáy kênh 10 nến đối diện — exit gốc trong sách",
      "ATR stop vẫn là bảo hiểm; không cap TP, không time stop",
    ],
  },
  {
    id: "turtle_s2",
    name: "Turtle S2 (55/20)",
    origin: "Hệ Turtle gốc · System 2: vào kênh 55, thoát kênh đối 20",
    style: "Breakout",
    rules: [
      "Hệ chậm của Dennis: breakout 55 nến, ít tín hiệu hơn S1",
      "Exit: close thủng kênh đối 20 nến",
      "Giữ lệnh dài hơn — ưu thế khi trend chạy xa",
    ],
  },
  {
    id: "donchian_trend",
    name: "Donchian 55 + EMA200",
    origin: "Biến thể cộng đồng · kênh 55 + lọc xu hướng EMA200",
    style: "Breakout",
    rules: [
      "Long: breakout 55 nến VÀ close trên EMA200",
      "Short: thủng đáy 55 nến VÀ close dưới EMA200",
      "Exit: tín hiệu đảo chiều (SIGNAL_EXIT)",
    ],
  },
  {
    id: "scalper_ema",
    name: "EMA 9/21 Scalper",
    origin: "Kinh điển crypto scalp · EMA 9/21 cross",
    style: "Trend",
    rules: [
      "Long: EMA9 cắt LÊN EMA21; Short: cắt XUỐNG",
      "Exit: tín hiệu đảo chiều — cặp EMA lật là exit tự nhiên của scalp",
      "Thiết kế cho 5m/15m; 1h trở lên nên đổi sang EMA Cross 20/50",
    ],
  },
  {
    id: "stoch_rsi",
    name: "Stochastic RSI",
    origin: "TV built-in quen dùng cho scalp · 14/14/3/3",
    style: "Reversion",
    rules: [
      "StochRSI = RSI(14) đưa vào stochastic 14 kỳ → %K = SMA3, %D = SMA3 của %K",
      "Long: %K cắt LÊN %D khi %K < 20",
      "Short: %K cắt XUỐNG %D khi %K > 80",
    ],
  },
  {
    id: "vwap_reclaim",
    name: "VWAP Reclaim",
    origin: "Staple intraday · giá đòi lại VWAP phiên",
    style: "Trend",
    rules: [
      "VWAP reset theo ngày UTC",
      "Long: close cắt LÊN VWAP sau khi nằm dưới (reclaim)",
      "Short: close cắt XUỐNG VWAP sau khi nằm trên (loss of VWAP)",
      "Exit: mất lại VWAP theo chiều ngược (signal flip)",
    ],
  },
  {
    id: "orb",
    name: "Opening Range Breakout",
    origin: "Kinh điển intraday · phá vỡ range 6 nến đầu ngày UTC",
    style: "Breakout",
    rules: [
      "Range = high/low của 6 nến ĐẦU ngày UTC (30 phút đầu trên 5m)",
      "Long: close vượt đỉnh range; Short: thủng đáy range",
      "Một tín hiệu mỗi chiều mỗi ngày; exit qua signal flip hoặc stop",
    ],
  },
  {
    id: "rsi7_momentum",
    name: "RSI-7 Momentum",
    origin: "Momentum scalp · RSI 7 kỳ cắt 50",
    style: "Trend",
    rules: [
      "Long: RSI(7) cắt LÊN 50 — momentum nhanh quay theo hướng trend ngắn",
      "Short: RSI(7) cắt XUỐNG 50",
      "Exit: RSI cắt ngược lại 50 (signal flip)",
    ],
  },
  {
    id: "tsm",
    name: "Time-Series Momentum",
    origin: "Moskowitz–Ooi–Pedersen (2012) · momentum 90 nến",
    style: "Trend",
    rules: [
      "Position = dấu của lợi nhuận trễ 90 nến (long khi dương)",
      "Flip khi momentum đổi dấu — ít lệnh, nắm trọn pha",
      "Edge được tài liệu học thuật xác nhận trên mọi asset class",
    ],
  },
  {
    id: "high_52w",
    name: "52-Week High",
    origin: "George & Hwang (2004) · breakout đỉnh 252 nến",
    style: "Trend",
    rules: [
      "Long: close lập đỉnh mới 252 nến (hiệu ứng 52-week high)",
      "Short (mirror): thủng đáy 252 nến",
      "Signal flip — hệ thống nắm đuôi dài đúng như nghiên cứu",
    ],
  },
  {
    id: "ma200_gravity",
    name: "MA200 Gravity",
    origin: "Mean reversion về SMA200 (De Bondt–Thaler style)",
    style: "Reversion",
    rules: [
      "Long: close cắt vào vùng chiết khấu ≥5% dưới SMA200",
      "Short: close cắt vào vùng premium ≥5% trên SMA200",
      "Exit: giá quay về đúng SMA200 (signal flip tại fair value)",
    ],
  },
  {
    id: "tom",
    name: "Turn-of-Month",
    origin: "Lakonishok–Smidt · Kaiser (2019) cho Bitcoin",
    style: "Reversion",
    rules: [
      "Long 3 ngày lịch CUỐI tháng (hiệu ứng turn-of-month có tài liệu)",
      "Short 2 ngày đầu tháng kế tiếp (tuỳ chọn)",
      "Reversion class: TP ladder + time stop 8 nến (1d) quản lý lệnh",
    ],
  },
  {
    id: "weinstein_s2",
    name: "Weinstein Stage 2",
    origin: "Stan Weinstein · Stage Analysis (EMA200 tăng + đỉnh 50 nến)",
    style: "Trend",
    rules: [
      "Stage 2: EMA200 ĐANG TĂNG + close trên EMA200",
      "Long: close lập đỉnh 50 nến trong stage 2",
      "Short mirror ở stage 4 (EMA200 giảm + đáy mới)",
    ],
  },
  {
    id: "e0v1e",
    name: "E0V1E Scalper",
    origin: "vaskosmihaylov/nfi-custom-strategies · e0v1e (long scalp 5m)",
    style: "Reversion",
    rules: [
      "LONG-ONLY dip-buy scalp 5m, hai điều kiện OR:",
      "EWO: RSI4 < 50 · close < EMA8×0.956 · EWO(50/200) > −1.238 · close < EMA16×0.986 · RSI14 < 30",
      "Dip32: RSI20 giảm · RSI4 < 63 · RSI14 > 16 · close < SMA15×0.932 · CTI20 < −0.8",
      "Exit gốc là fastk/profit-lock — desk chạy reversion class (TP + time stop)",
    ],
  },
];




const PORTS: Record<PortedStrategyId, (ctx: PortCtx) => void> = {
  macd: portMacd,
  rsi_reversion: portRsi,
  bb_reversion: portBb,
  stoch_reversion: portStoch,
  supertrend: portSupertrend,
  ema_cross: portEmaCross,
  donchian: portDonchian,
  ichimoku: portIchimoku,
  keltner: portKeltner,
  rsi2: portRsi2,
  squeeze: portSqueeze,
  psar: portPsar,
  ha_trend: portHaTrend,
  fisher: portFisher,
  vwap_fade: portVwapFade,
  turtle_s1: portTurtleS1,
  turtle_s2: portTurtleS2,
  donchian_trend: portDonchianTrend,
  scalper_ema: portScalperEma,
  stoch_rsi: portStochRsi,
  vwap_reclaim: portVwapReclaim,
  orb: portOrb,
  rsi7_momentum: portRsi7Momentum,
  tsm: portTsm,
  high_52w: portHigh52w,
  ma200_gravity: portMa200Gravity,
  tom: portTom,
  weinstein_s2: portWeinsteinS2,
  e0v1e: portE0v1e,
};

/**
 * Apply one ported strategy's signals in place (columns reset beforehand).
 * With cfg.regimeFilterPorts on, signals that fight the ADX regime are
 * stripped: trend/breakout ports keep ADX ≥ 20, reversion ports keep ADX < 20
 * — the same discipline the house strategies apply. ADX thresholds are the
 * ones already used by the desk's regime classifier (20/25), not tuned knobs.
 */
export function applyLibraryStrategy(bars: FeatureBar[], id: PortedStrategyId, cfg: DeskConfig): void {
  const port = PORTS[id];
  port({
    bars,
    cfg,
    warmup: Math.min(cfg.warmup, Math.max(0, bars.length - 2)),
    allowShort: cfg.side === "both",
  });
  if (!cfg.regimeFilterPorts) return;
  const gate = REVERSION_CLASS.has(id) ? "range" : "trend";
  const adxMin = cfg.portAdxMin;
  for (const b of bars) {
    if (b.strategy !== id || b.signal === 0) continue;
    const adx = b.adx;
    if (gate === "trend" && (adx == null || adx < adxMin)) {
      b.signal = 0;
      b.signalReason = "";
      b.strategy = "none";
    } else if (gate === "range" && (adx == null || adx >= adxMin)) {
      b.signal = 0;
      b.signalReason = "";
      b.strategy = "none";
    }
  }
}

/** Options for strategy selects across the UI (desk header, tester, panel). */
export const STRATEGY_SELECT_OPTIONS: { id: string; label: string; group: string }[] = [
  { id: "combo", label: "Tổ hợp (TP + MR)", group: "VelaDesk" },
  { id: "trend_pullback", label: "Trend Pullback + Momentum", group: "VelaDesk" },
  { id: "mean_reversion", label: "Mean Reversion (BB/RSI)", group: "VelaDesk" },
  ...STRATEGY_LIBRARY.map((s) => ({ id: s.id, label: s.name, group: s.origin })),
];
