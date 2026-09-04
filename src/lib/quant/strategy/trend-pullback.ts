import type { FeatureBar } from "../types";
import {
  type RuleCheck,
  type SignalContext,
  bullishTrigger,
  bearishTrigger,
  macdFalling,
  macdRising,
  pulledBackLong,
  pulledBackShort,
  rsiDippedThenLifted,
  rsiPeakedThenDropped,
} from "./base";

export function explainTrendLong(ctx: SignalContext): RuleCheck[] {
  const bar = ctx.bars[ctx.i]!;
  const volOk = !bar.extremeVol || ctx.tradeVolatility;
  const rsiOk = rsiDippedThenLifted(ctx.bars, ctx.i, 40, 52);
  const macdOk = macdRising(ctx.bars, ctx.i);
  const volSpike = (bar.volSpike ?? 0) >= 1.2;
  return [
    {
      id: "htf_up",
      label: "Bias HTF = up (close > EMA50 và ADX ≥ 20)",
      pass: bar.htfBias === 1,
      detail: `htfBias=${bar.htfBias}, ADX_HTF=${fmt(bar.htfAdx)}`,
    },
    {
      id: "pullback",
      label: "Giá hồi EMA20 / EMA50 / dải giữa-dưới BB",
      pass: pulledBackLong(bar),
      detail: `low=${bar.low.toFixed(2)} ema20=${fmt(bar.ema20)} ema50=${fmt(bar.ema50)}`,
    },
    {
      id: "rsi",
      label: "RSI(14) từng xuống 40–50 rồi cắt lên",
      pass: rsiOk,
      detail: `RSI=${fmt(bar.rsi)}`,
    },
    {
      id: "macd",
      label: "MACD histogram > 0 hoặc tăng 2 nến",
      pass: macdOk,
      detail: `hist=${fmt(bar.macdHist)}`,
    },
    {
      id: "volume",
      label: "Volume ≥ 1.2 × SMA20",
      pass: volSpike,
      detail: `spike=${fmt(bar.volSpike)}`,
    },
    {
      id: "candle",
      label: "Nến: engulfing / pin bar tăng / close mạnh trên EMA20",
      pass: bullishTrigger(bar),
      detail: bar.pattern ? `${bar.pattern.name} ${bar.pattern.direction}` : "close vs EMA20",
    },
    {
      id: "vol_cap",
      label: "Không cực đoan ATR (trừ khi bật trade volatility)",
      pass: volOk,
      detail: bar.extremeVol ? "ATR > 2.0 × SMA" : "vol bình thường",
    },
  ];
}

export function explainTrendShort(ctx: SignalContext): RuleCheck[] {
  const bar = ctx.bars[ctx.i]!;
  const volOk = !bar.extremeVol || ctx.tradeVolatility;
  return [
    {
      id: "htf_down",
      label: "Bias HTF = down (close < EMA50 và ADX ≥ 20)",
      pass: bar.htfBias === -1,
      detail: `htfBias=${bar.htfBias}, ADX_HTF=${fmt(bar.htfAdx)}`,
    },
    {
      id: "pullback",
      label: "Giá hồi EMA20 / EMA50 / dải giữa-trên BB",
      pass: pulledBackShort(bar),
      detail: `high=${bar.high.toFixed(2)} ema20=${fmt(bar.ema20)}`,
    },
    {
      id: "rsi",
      label: "RSI(14) từng lên 50–60 rồi cắt xuống",
      pass: rsiPeakedThenDropped(ctx.bars, ctx.i, 48, 60),
      detail: `RSI=${fmt(bar.rsi)}`,
    },
    {
      id: "macd",
      label: "MACD histogram < 0 hoặc giảm 2 nến",
      pass: macdFalling(ctx.bars, ctx.i),
      detail: `hist=${fmt(bar.macdHist)}`,
    },
    {
      id: "volume",
      label: "Volume ≥ 1.2 × SMA20",
      pass: (bar.volSpike ?? 0) >= 1.2,
      detail: `spike=${fmt(bar.volSpike)}`,
    },
    {
      id: "candle",
      label: "Nến: engulfing / shooting star / close mạnh dưới EMA20",
      pass: bearishTrigger(bar),
      detail: bar.pattern ? `${bar.pattern.name}` : "close vs EMA20",
    },
    {
      id: "vol_cap",
      label: "Không cực đoan ATR (trừ khi bật trade volatility)",
      pass: volOk,
      detail: bar.extremeVol ? "ATR > 2.0 × SMA" : "vol bình thường",
    },
  ];
}

export function trendPullbackSignal(ctx: SignalContext): {
  signal: -1 | 0 | 1;
  reason: string;
} {
  const longRules = explainTrendLong(ctx);
  if (longRules.every((r) => r.pass)) {
    return { signal: 1, reason: "trend_pullback_long" };
  }
  if (ctx.allowShort) {
    const shortRules = explainTrendShort(ctx);
    if (shortRules.every((r) => r.pass)) {
      return { signal: -1, reason: "trend_pullback_short" };
    }
  }
  return { signal: 0, reason: "" };
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(3);
}

/** Apply trend-pullback signals; does not overwrite an existing non-zero signal. */
export function applyTrendPullback(
  bars: FeatureBar[],
  opts: { tradeVolatility: boolean; allowShort: boolean; warmup: number },
): void {
  for (let i = opts.warmup; i < bars.length; i++) {
    if (bars[i]!.signal !== 0) continue;
    const { signal, reason } = trendPullbackSignal({
      bars,
      i,
      tradeVolatility: opts.tradeVolatility,
      allowShort: opts.allowShort,
    });
    if (signal !== 0) {
      bars[i]!.signal = signal;
      bars[i]!.signalReason = reason;
      bars[i]!.strategy = "trend_pullback";
    }
  }
}
