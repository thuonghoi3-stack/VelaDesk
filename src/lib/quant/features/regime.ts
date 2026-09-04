import { INTERVAL_MS } from "../config";
import type { FeatureBar, Timeframe } from "../types";
import { applyRegime } from "./indicators";

/**
 * Map last *closed* HTF bar onto each LTF bar.
 * HTF bar at open `h` is closed at `h + htfInterval`. It is available
 * for an LTF bar opening at `t` iff `h + htfInterval <= t`.
 */
export function mapHtfToLtf(
  ltf: FeatureBar[],
  htf: FeatureBar[],
  htfTf: Timeframe,
): void {
  const interval = INTERVAL_MS[htfTf];
  if (ltf.length === 0 || htf.length === 0) return;

  let j = 0;
  for (let i = 0; i < ltf.length; i++) {
    const t = ltf[i]!.time;
    while (j + 1 < htf.length && htf[j + 1]!.time + interval <= t) j++;
    const h = htf[j]!;
    if (h.time + interval <= t) {
      ltf[i]!.htfClose = h.close;
      ltf[i]!.htfEma50 = h.ema50;
      ltf[i]!.htfAdx = h.adx;
      if (h.ema50 != null && h.adx != null) {
        if (h.close > h.ema50 && h.adx >= 20) ltf[i]!.htfBias = 1;
        else if (h.close < h.ema50 && h.adx >= 20) ltf[i]!.htfBias = -1;
        else ltf[i]!.htfBias = 0;
      }
    }
  }
}

export { applyRegime };
