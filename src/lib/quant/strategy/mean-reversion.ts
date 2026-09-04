import type { FeatureBar } from "../types";
import { type RuleCheck, type SignalContext, bandwidthSqueezeRelease } from "./base";

export function explainMrLong(ctx: SignalContext): RuleCheck[] {
  const bar = ctx.bars[ctx.i]!;
  const squeeze = bandwidthSqueezeRelease(ctx.bars, ctx.i);
  return [
    {
      id: "ranging",
      label: "Regime ranging (ADX < 20)",
      pass: (bar.adx ?? 99) < 20 && bar.htfBias === 0,
      detail: `ADX=${fmt(bar.adx)} htfBias=${bar.htfBias}`,
    },
    {
      id: "bb",
      label: "Close dưới lower Bollinger",
      pass: bar.bbLower != null && bar.close < bar.bbLower,
      detail: `close=${bar.close.toFixed(2)} lower=${fmt(bar.bbLower)}`,
    },
    {
      id: "rsi",
      label: "RSI < 30",
      pass: bar.rsi != null && bar.rsi < 30,
      detail: `RSI=${fmt(bar.rsi)}`,
    },
    {
      id: "squeeze",
      label: "Không phải squeeze vừa bung",
      pass: !squeeze,
      detail: squeeze ? "bandwidth tăng đột biến" : "ok",
    },
  ];
}

export function explainMrShort(ctx: SignalContext): RuleCheck[] {
  const bar = ctx.bars[ctx.i]!;
  const squeeze = bandwidthSqueezeRelease(ctx.bars, ctx.i);
  return [
    {
      id: "ranging",
      label: "Regime ranging (ADX < 20)",
      pass: (bar.adx ?? 99) < 20 && bar.htfBias === 0,
      detail: `ADX=${fmt(bar.adx)} htfBias=${bar.htfBias}`,
    },
    {
      id: "bb",
      label: "Close trên upper Bollinger",
      pass: bar.bbUpper != null && bar.close > bar.bbUpper,
      detail: `close=${bar.close.toFixed(2)} upper=${fmt(bar.bbUpper)}`,
    },
    {
      id: "rsi",
      label: "RSI > 70",
      pass: bar.rsi != null && bar.rsi > 70,
      detail: `RSI=${fmt(bar.rsi)}`,
    },
    {
      id: "squeeze",
      label: "Không phải squeeze vừa bung",
      pass: !squeeze,
      detail: squeeze ? "bandwidth tăng đột biến" : "ok",
    },
  ];
}

export function meanReversionSignal(ctx: SignalContext): {
  signal: -1 | 0 | 1;
  reason: string;
} {
  const longRules = explainMrLong(ctx);
  if (longRules.every((r) => r.pass)) return { signal: 1, reason: "mean_reversion_long" };
  if (ctx.allowShort) {
    const shortRules = explainMrShort(ctx);
    if (shortRules.every((r) => r.pass)) return { signal: -1, reason: "mean_reversion_short" };
  }
  return { signal: 0, reason: "" };
}

export function applyMeanReversion(
  bars: FeatureBar[],
  opts: { allowShort: boolean; warmup: number },
): void {
  for (let i = opts.warmup; i < bars.length; i++) {
    if (bars[i]!.signal !== 0) continue;
    const { signal, reason } = meanReversionSignal({
      bars,
      i,
      tradeVolatility: false,
      allowShort: opts.allowShort,
    });
    if (signal !== 0) {
      bars[i]!.signal = signal;
      bars[i]!.signalReason = reason;
      bars[i]!.strategy = "mean_reversion";
    }
  }
}

function fmt(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toFixed(3);
}
