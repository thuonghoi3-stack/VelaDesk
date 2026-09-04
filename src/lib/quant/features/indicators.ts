import { smaAt, stdevAt } from "../math";
import type { FeatureBar, Ohlcv, Regime } from "../types";

function seedBar(bar: Ohlcv): FeatureBar {
  return {
    ...bar,
    ema20: null,
    ema50: null,
    ema200: null,
    adx: null,
    rsi: null,
    macd: null,
    macdSignal: null,
    macdHist: null,
    stochK: null,
    stochD: null,
    atr: null,
    atrSma20: null,
    bbMid: null,
    bbUpper: null,
    bbLower: null,
    bbWidth: null,
    volSma20: null,
    volSpike: null,
    obv: null,
    regime: "mixed",
    highVol: false,
    extremeVol: false,
    pattern: null,
    htfClose: null,
    htfEma50: null,
    htfAdx: null,
    htfBias: 0,
    signal: 0,
    signalReason: "",
    strategy: "none",
  };
}

function wilderInit(values: number[], period: number): number {
  let s = 0;
  for (let i = 0; i < period; i++) s += values[i]!;
  return s / period;
}

/**
 * Compute classic TA on a cleaned OHLCV series.
 * Every value at index i uses only bars 0..i (no look-ahead).
 */
export function computeIndicators(ohlcv: Ohlcv[]): FeatureBar[] {
  const n = ohlcv.length;
  const out = ohlcv.map(seedBar);
  if (n === 0) return out;

  const close = ohlcv.map((b) => b.close);
  const high = ohlcv.map((b) => b.high);
  const low = ohlcv.map((b) => b.low);
  const vol = ohlcv.map((b) => b.volume);

  const k20 = 2 / (20 + 1);
  const k50 = 2 / (50 + 1);
  const k200 = 2 / (200 + 1);
  const k12 = 2 / (12 + 1);
  const k26 = 2 / (26 + 1);
  const k9 = 2 / (9 + 1);

  let ema20: number | null = null;
  let ema50: number | null = null;
  let ema200: number | null = null;
  let ema12: number | null = null;
  let ema26: number | null = null;
  let macdSignal: number | null = null;
  let obv = 0;

  const tr: number[] = new Array(n).fill(0);
  const plusDm: number[] = new Array(n).fill(0);
  const minusDm: number[] = new Array(n).fill(0);
  const gain: number[] = new Array(n).fill(0);
  const loss: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    const c = close[i]!;
    const prevC = i > 0 ? close[i - 1]! : c;
    const ch = c - prevC;
    gain[i] = Math.max(ch, 0);
    loss[i] = Math.max(-ch, 0);

    if (i === 0) {
      tr[i] = high[i]! - low[i]!;
    } else {
      tr[i] = Math.max(
        high[i]! - low[i]!,
        Math.abs(high[i]! - prevC),
        Math.abs(low[i]! - prevC),
      );
      const up = high[i]! - high[i - 1]!;
      const down = low[i - 1]! - low[i]!;
      plusDm[i] = up > down && up > 0 ? up : 0;
      minusDm[i] = down > up && down > 0 ? down : 0;
    }

    if (i > 0) {
      obv += c > prevC ? vol[i]! : c < prevC ? -vol[i]! : 0;
    }
    out[i]!.obv = obv;

    if (i === 0) {
      ema20 = ema50 = ema200 = ema12 = ema26 = c;
    } else {
      ema20 = c * k20 + ema20! * (1 - k20);
      ema50 = c * k50 + ema50! * (1 - k50);
      ema200 = c * k200 + ema200! * (1 - k200);
      ema12 = c * k12 + ema12! * (1 - k12);
      ema26 = c * k26 + ema26! * (1 - k26);
    }
    if (i >= 19) out[i]!.ema20 = ema20;
    if (i >= 49) out[i]!.ema50 = ema50;
    if (i >= 199) out[i]!.ema200 = ema200;

    if (i >= 25 && ema12 != null && ema26 != null) {
      const macd = ema12 - ema26;
      out[i]!.macd = macd;
      macdSignal = macdSignal == null ? macd : macd * k9 + macdSignal * (1 - k9);
      out[i]!.macdSignal = macdSignal;
      out[i]!.macdHist = macd - macdSignal;
    }

    const bbMid = smaAt(close, i, 20);
    const bbSd = stdevAt(close, i, 20, 0);
    if (bbMid != null && bbSd != null) {
      out[i]!.bbMid = bbMid;
      out[i]!.bbUpper = bbMid + 2 * bbSd;
      out[i]!.bbLower = bbMid - 2 * bbSd;
      out[i]!.bbWidth = bbMid > 0 ? (4 * bbSd) / bbMid : null;
    }

    out[i]!.volSma20 = smaAt(vol, i, 20);
    if (out[i]!.volSma20 && out[i]!.volSma20! > 0) {
      out[i]!.volSpike = vol[i]! / out[i]!.volSma20!;
    }
  }

  // RSI (Wilder 14)
  if (n > 14) {
    let avgGain = wilderInit(gain.slice(1, 15), 14);
    let avgLoss = wilderInit(loss.slice(1, 15), 14);
    const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    out[14]!.rsi = 100 - 100 / (1 + rs0);
    for (let i = 15; i < n; i++) {
      avgGain = (avgGain * 13 + gain[i]!) / 14;
      avgLoss = (avgLoss * 13 + loss[i]!) / 14;
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      out[i]!.rsi = 100 - 100 / (1 + rs);
    }
  }

  // ATR (Wilder 14)
  const atr: Array<number | null> = new Array(n).fill(null);
  if (n > 14) {
    let a = wilderInit(tr.slice(1, 15), 14);
    atr[14] = a;
    out[14]!.atr = a;
    for (let i = 15; i < n; i++) {
      a = (a * 13 + tr[i]!) / 14;
      atr[i] = a;
      out[i]!.atr = a;
    }
  }
  const atrNums = atr.map((v) => v ?? 0);
  for (let i = 0; i < n; i++) {
    if (atr[i] == null) continue;
    const s = smaAt(
      atrNums.map((v, idx) => (atr[idx] == null ? Number.NaN : v)),
      i,
      20,
    );
    // SMA of ATR over indices that have ATR
    if (i >= 14 + 19) {
      let sum = 0;
      let ok = true;
      for (let k = i - 19; k <= i; k++) {
        if (atr[k] == null) {
          ok = false;
          break;
        }
        sum += atr[k]!;
      }
      out[i]!.atrSma20 = ok ? sum / 20 : s;
    }
  }

  // Stochastic 14,3
  const kArr: Array<number | null> = new Array(n).fill(null);
  for (let i = 13; i < n; i++) {
    let hh = high[i - 13]!;
    let ll = low[i - 13]!;
    for (let k = i - 12; k <= i; k++) {
      if (high[k]! > hh) hh = high[k]!;
      if (low[k]! < ll) ll = low[k]!;
    }
    const den = hh - ll;
    kArr[i] = den <= 0 ? 50 : ((close[i]! - ll) / den) * 100;
    out[i]!.stochK = kArr[i];
  }
  for (let i = 15; i < n; i++) {
    const a = kArr[i]!;
    const b = kArr[i - 1]!;
    const c = kArr[i - 2]!;
    if (a == null || b == null || c == null) continue;
    out[i]!.stochD = (a + b + c) / 3;
  }

  // ADX 14
  if (n > 28) {
    let smTr = wilderInit(tr.slice(1, 15), 14);
    let smP = wilderInit(plusDm.slice(1, 15), 14);
    let smM = wilderInit(minusDm.slice(1, 15), 14);
    const dx: number[] = [];
    for (let i = 14; i < n; i++) {
      if (i > 14) {
        smTr = (smTr * 13 + tr[i]!) / 14;
        smP = (smP * 13 + plusDm[i]!) / 14;
        smM = (smM * 13 + minusDm[i]!) / 14;
      }
      const pDi = smTr === 0 ? 0 : (100 * smP) / smTr;
      const mDi = smTr === 0 ? 0 : (100 * smM) / smTr;
      const den = pDi + mDi;
      dx.push(den === 0 ? 0 : (100 * Math.abs(pDi - mDi)) / den);
      if (dx.length === 14) {
        let adx = dx.reduce((s, v) => s + v, 0) / 14;
        out[i]!.adx = adx;
        for (let j = i + 1; j < n; j++) {
          smTr = (smTr * 13 + tr[j]!) / 14;
          smP = (smP * 13 + plusDm[j]!) / 14;
          smM = (smM * 13 + minusDm[j]!) / 14;
          const p = smTr === 0 ? 0 : (100 * smP) / smTr;
          const m = smTr === 0 ? 0 : (100 * smM) / smTr;
          const d = p + m;
          const dxj = d === 0 ? 0 : (100 * Math.abs(p - m)) / d;
          adx = (adx * 13 + dxj) / 14;
          out[j]!.adx = adx;
        }
        break;
      }
    }
  }

  return out;
}

export function classifyRegime(bar: FeatureBar): Regime {
  const adx = bar.adx;
  const ema50 = bar.ema50;
  if (adx == null || ema50 == null) return "mixed";
  if (adx < 20) return "ranging";
  if (adx >= 25 && bar.close > ema50) return "trending_up";
  if (adx >= 25 && bar.close < ema50) return "trending_down";
  return "mixed";
}

export function applyRegime(bars: FeatureBar[]): void {
  for (const bar of bars) {
    bar.regime = classifyRegime(bar);
    const atr = bar.atr;
    const sma = bar.atrSma20;
    bar.highVol = atr != null && sma != null && atr > 1.5 * sma;
    bar.extremeVol = atr != null && sma != null && atr > 2.0 * sma;
  }
}
