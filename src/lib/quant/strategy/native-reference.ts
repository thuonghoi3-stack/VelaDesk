/** Local source translation, NOT externally verified Pine runtime parity. See NATIVE_CONTRACT.md. */
export type NativeStrategy =
  "macd" | "rsi" | "stochastic-slow" | "supertrend" | "bollinger-bands" | "keltner" | "psar";
export interface NativeBar {
  open: number;
  high: number;
  low: number;
  close: number;
  confirmed?: boolean;
}
export type NativeQuantity =
  { kind: "unresolved-source-default" } | { kind: "percent-of-equity"; value: 15 };
export type NativeIntent =
  | { kind: "cancel"; id: string }
  | {
      kind: "entry";
      id: string;
      side: "long" | "short";
      order: { kind: "market" } | { kind: "stop"; price: number };
      reversal: "pine-entry-auto";
      quantity: NativeQuantity;
      oca?: { name: string; type: "cancel" };
    };
export interface NativeFrame {
  barIndex: number;
  values: Record<string, number>;
  intents: NativeIntent[];
  status: "warmup" | "ready";
}
export const nativeReferenceEvidence = {
  status: "source-translated-local-reference",
  externalRuntimeVerified: false,
  unresolved: [
    "v6 builtin parity against secondary v5 documentation",
    "RSI flat builtin versus explicit indicator branch",
    "stochastic startup and zero range runtime parity",
    "stdev near-zero sample ambiguity",
    "unspecified strategy properties and quantity",
  ],
} as const;
const entry = (
  id: string,
  side: "long" | "short",
  price?: number,
  oca?: string,
  percent = false,
): NativeIntent => ({
  kind: "entry",
  id,
  side,
  order: price === undefined ? { kind: "market" } : { kind: "stop", price },
  reversal: "pine-entry-auto",
  quantity: percent
    ? { kind: "percent-of-equity", value: 15 }
    : { kind: "unresolved-source-default" },
  ...(oca ? { oca: { name: oca, type: "cancel" as const } } : {}),
});
const cross = (a: number, b: number, pa: number, pb: number) => a > b && pa <= pb;
function ema(xs: number[], n: number): number[] {
  let prev = NaN;
  const a = 2 / (n + 1);
  return xs.map(
    (x) => (prev = Number.isNaN(x) ? prev : Number.isNaN(prev) ? x : a * x + (1 - a) * prev),
  );
}
function sma(xs: number[], n: number): number[] {
  const valid: number[] = [];
  return xs.map((x) => {
    if (!Number.isNaN(x)) valid.push(x);
    return valid.length < n ? NaN : valid.slice(-n).reduce((a, b) => a + b, 0) / n;
  });
}
function rma(xs: number[], n: number): number[] {
  const seed = sma(xs, n);
  let prev = NaN;
  return xs.map(
    (x, i) =>
      (prev = Number.isNaN(x) ? prev : Number.isNaN(prev) ? seed[i] : x / n + (1 - 1 / n) * prev),
  );
}
/** All bars are historical evaluations. No fills/position state are inferred. */
export function evaluateNative(
  strategy: NativeStrategy,
  bars: readonly NativeBar[],
  options: { mintick?: number } = {},
): NativeFrame[] {
  if (bars.some((b) => ![b.open, b.high, b.low, b.close].every(Number.isFinite) || b.high < b.low))
    throw new Error("Finite OHLC bars required");
  const close = bars.map((b) => b.close);
  if (strategy === "rsi") {
    const changes = close.map((x, i) => x - close[i - 1]),
      up = rma(
        changes.map((x) => Math.max(x, 0)),
        14,
      ),
      down = rma(
        changes.map((x) => -Math.min(x, 0)),
        14,
      );
    const rsi = up.map((x, i) =>
      down[i] === 0 ? 100 : x === 0 ? 0 : 100 - 100 / (1 + x / down[i]),
    );
    return rsi.map((x, i) => ({
      barIndex: i,
      status: Number.isNaN(x) ? "warmup" : "ready",
      values: { rsi: x, up: up[i], down: down[i] },
      intents: [
        ...(cross(x, 30, rsi[i - 1], 30) ? [entry("RsiLE", "long")] : []),
        ...(cross(70, x, 70, rsi[i - 1]) ? [entry("RsiSE", "short")] : []),
      ],
    }));
  }
  if (strategy === "stochastic-slow") {
    const raw = bars.map((b, i) => {
      const window = bars.slice(Math.max(0, i - 13), i + 1),
        lo = Math.min(...window.map((b) => b.low)),
        hi = Math.max(...window.map((b) => b.high));
      return hi === lo ? NaN : (100 * (b.close - lo)) / (hi - lo);
    });
    const k = sma(raw, 3),
      d = sma(k, 3);
    return k.map((x, i) => ({
      barIndex: i,
      status: Number.isNaN(x) || Number.isNaN(d[i]) ? "warmup" : "ready",
      values: { raw: raw[i], k: x, d: d[i] },
      intents: [
        ...(x < 20 && cross(x, d[i], k[i - 1], d[i - 1]) ? [entry("StochLE", "long")] : []),
        ...(x > 80 && cross(d[i], x, d[i - 1], k[i - 1]) ? [entry("StochSE", "short")] : []),
      ],
    }));
  }
  if (strategy === "bollinger-bands") {
    const basis = sma(close, 20),
      dev = basis.map(
        (x, i) =>
          2 *
          Math.sqrt(
            close.slice(Math.max(0, i - 19), i + 1).reduce((sum, v) => sum + (v - x) ** 2, 0) / 20,
          ),
      ),
      upper = basis.map((x, i) => x + dev[i]),
      lower = basis.map((x, i) => x - dev[i]);
    return bars.map((b, i) => ({
      barIndex: i,
      status: Number.isNaN(basis[i]) ? "warmup" : "ready",
      values: { basis: basis[i], dev: dev[i], upper: upper[i], lower: lower[i] },
      intents: [
        cross(b.close, lower[i], close[i - 1], lower[i - 1])
          ? entry("BBandLE", "long", lower[i], "BollingerBands")
          : { kind: "cancel", id: "BBandLE" },
        cross(upper[i], b.close, upper[i - 1], close[i - 1])
          ? entry("BBandSE", "short", upper[i], "BollingerBands")
          : { kind: "cancel", id: "BBandSE" },
      ],
    }));
  }
  if (strategy === "keltner") {
    const tick = options.mintick;
    if (tick === undefined || !Number.isFinite(tick) || tick <= 0)
      throw new Error("Explicit positive mintick required");
    const ma = ema(close, 20),
      atr = rma(
        bars.map((b, i) =>
          i === 0
            ? b.high - b.low
            : Math.max(
                b.high - b.low,
                Math.abs(b.high - close[i - 1]),
                Math.abs(b.low - close[i - 1]),
              ),
        ),
        10,
      ),
      upper = ma.map((x, i) => x + 2 * atr[i]),
      lower = ma.map((x, i) => x - 2 * atr[i]);
    let bprice = 0,
      sprice = 0,
      crossBcond = false,
      crossScond = false;
    return bars.map((b, i) => {
      const buy = cross(b.close, upper[i], close[i - 1], upper[i - 1]),
        sell = cross(lower[i], b.close, lower[i - 1], close[i - 1]);
      if (buy) {
        bprice = b.high + tick;
        crossBcond = true;
      }
      if (sell) {
        sprice = b.low - tick;
        crossScond = true;
      }
      const intents: NativeIntent[] = [];
      if (crossBcond && (b.close < ma[i] || b.high >= bprice))
        intents.push({ kind: "cancel", id: "KltChLE" });
      if (buy) intents.push(entry("KltChLE", "long", bprice));
      if (crossScond && (b.close > ma[i] || b.low <= sprice))
        intents.push({ kind: "cancel", id: "KltChSE" });
      if (sell) intents.push(entry("KltChSE", "short", sprice));
      return {
        barIndex: i,
        status: Number.isNaN(atr[i]) ? "warmup" : "ready",
        values: {
          ma: ma[i],
          atr: atr[i],
          upper: upper[i],
          lower: lower[i],
          bprice,
          sprice,
          crossBcond: Number(crossBcond),
          crossScond: Number(crossScond),
        },
        intents,
      };
    });
  }
  if (strategy === "supertrend") {
    const atr = rma(
      bars.map((b, i) =>
        i === 0
          ? b.high - b.low
          : Math.max(
              b.high - b.low,
              Math.abs(b.high - close[i - 1]),
              Math.abs(b.low - close[i - 1]),
            ),
      ),
      10,
    );
    let lower = NaN,
      upper = NaN,
      st = NaN,
      dir = NaN;
    return bars.map((b, i) => {
      const pl = Number.isNaN(lower) ? 0 : lower,
        pu = Number.isNaN(upper) ? 0 : upper,
        pst = st,
        pdir = dir,
        mid = (b.high + b.low) / 2;
      lower = mid - 3 * atr[i];
      upper = mid + 3 * atr[i];
      lower = lower > pl || close[i - 1] < pl ? lower : pl;
      upper = upper < pu || close[i - 1] > pu ? upper : pu;
      dir =
        i === 0 || Number.isNaN(atr[i - 1])
          ? 1
          : pst === pu
            ? b.close > upper
              ? -1
              : 1
            : b.close < lower
              ? 1
              : -1;
      st = dir === -1 ? lower : upper;
      return {
        barIndex: i,
        status: Number.isNaN(atr[i]) ? "warmup" : "ready",
        values: { atr: atr[i], lower, upper, supertrend: st, direction: dir },
        intents:
          dir - pdir < 0
            ? [entry("My Long Entry Id", "long", undefined, undefined, true)]
            : dir - pdir > 0
              ? [entry("My Short Entry Id", "short", undefined, undefined, true)]
              : [],
      };
    });
  }
  if (strategy === "psar") {
    let uptrend = false,
      ep = NaN,
      sar = NaN,
      af = 0.02,
      nextBarSAR = NaN;
    return bars.map((b, i) => {
      const intents: NativeIntent[] = [];
      if (i > 0) {
        let firstTrendBar = false;
        sar = nextBarSAR;
        if (i === 1) {
          uptrend = b.close > close[i - 1];
          ep = uptrend ? b.high : b.low;
          const prevSAR = uptrend ? bars[i - 1].low : bars[i - 1].high;
          firstTrendBar = true;
          sar = prevSAR + 0.02 * (ep - prevSAR);
        }
        if (uptrend) {
          if (sar > b.low) {
            firstTrendBar = true;
            uptrend = false;
            sar = Math.max(ep, b.high);
            ep = b.low;
            af = 0.02;
          }
        } else if (sar < b.high) {
          firstTrendBar = true;
          uptrend = true;
          sar = Math.min(ep, b.low);
          ep = b.high;
          af = 0.02;
        }
        if (!firstTrendBar) {
          if (uptrend && b.high > ep) {
            ep = b.high;
            af = Math.min(af + 0.02, 0.2);
          } else if (!uptrend && b.low < ep) {
            ep = b.low;
            af = Math.min(af + 0.02, 0.2);
          }
        }
        if (uptrend) {
          sar = Math.min(sar, bars[i - 1].low);
          if (i > 1) sar = Math.min(sar, bars[i - 2].low);
        } else {
          sar = Math.max(sar, bars[i - 1].high);
          if (i > 1) sar = Math.max(sar, bars[i - 2].high);
        }
        nextBarSAR = sar + af * (ep - sar);
        if (b.confirmed !== false) {
          intents.push(entry(uptrend ? "ParSE" : "ParLE", uptrend ? "short" : "long", nextBarSAR));
          intents.push({ kind: "cancel", id: uptrend ? "ParLE" : "ParSE" });
        }
      }
      return {
        barIndex: i,
        status: i === 0 ? "warmup" : "ready",
        values: { sar, nextBarSAR, ep, af, uptrend: Number(uptrend) },
        intents,
      };
    });
  }
  if (strategy !== "macd") throw new Error("Unknown native strategy");
  const fast = ema(close, 12),
    slow = ema(close, 26),
    macd = close.map((_, i) => fast[i] - slow[i]),
    signal = ema(macd, 9),
    delta = macd.map((x, i) => x - signal[i]);
  return bars.map((_, i) => ({
    barIndex: i,
    status: "ready",
    values: { fast: fast[i], slow: slow[i], macd: macd[i], signal: signal[i], delta: delta[i] },
    intents: cross(delta[i], 0, delta[i - 1], 0)
      ? [entry("MacdLE", "long")]
      : cross(0, delta[i], 0, delta[i - 1])
        ? [entry("MacdSE", "short")]
        : [],
  }));
}
