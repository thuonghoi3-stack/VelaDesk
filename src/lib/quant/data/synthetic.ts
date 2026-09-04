import { INTERVAL_MS, maxBarsForTf } from "../config";
import { hashSeed, mulberry32 } from "../math";
import type { Ohlcv, Timeframe } from "../types";

type RegimeSpec = { bars: number; drift: number; vol: number };

/**
 * Regime-switching geometric Brownian candles so the desk can run
 * without an exchange. Clearly labeled as synthetic in the UI.
 */
export function generateSynthetic(
  symbol: string,
  tf: Timeframe,
  bars: number,
  endTime = Date.now(),
): Ohlcv[] {
  const n = Math.min(Math.max(bars, 400), maxBarsForTf(tf));
  const interval = INTERVAL_MS[tf];
  const start = endTime - n * interval;
  const rng = mulberry32(hashSeed(`${symbol}:${tf}:vela-v1`));
  const startPx = symbol.startsWith("BTC") ? 28_000 : symbol.startsWith("ETH") ? 1_800 : 80;

  const blocks: RegimeSpec[] = [
    { bars: Math.floor(n * 0.18), drift: 0.00035, vol: 0.012 },
    { bars: Math.floor(n * 0.1), drift: -0.0009, vol: 0.028 },
    { bars: Math.floor(n * 0.22), drift: 0.00002, vol: 0.009 },
    { bars: Math.floor(n * 0.2), drift: 0.00045, vol: 0.014 },
    { bars: Math.floor(n * 0.12), drift: -0.00055, vol: 0.02 },
    { bars: Math.floor(n * 0.18), drift: 0.00008, vol: 0.011 },
  ];
  const specs: RegimeSpec[] = [];
  let acc = 0;
  for (const b of blocks) {
    specs.push(b);
    acc += b.bars;
  }
  if (acc < n) specs[specs.length - 1]!.bars += n - acc;

  const out: Ohlcv[] = [];
  let px = startPx;
  let idx = 0;
  for (const spec of specs) {
    for (let k = 0; k < spec.bars && idx < n; k++, idx++) {
      const z1 = Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(2 * Math.PI * rng());
      const ret = spec.drift + spec.vol * z1 * (tf === "1d" ? 2.2 : tf === "4h" ? 1.2 : 0.7);
      const open = px;
      const close = Math.max(0.01, open * (1 + ret));
      const wick = spec.vol * (0.3 + rng()) * open;
      const high = Math.max(open, close) + wick * rng();
      const low = Math.max(0.01, Math.min(open, close) - wick * rng());
      const volume = (800 + rng() * 2200) * (1 + spec.vol * 40) * (0.6 + rng());
      out.push({
        time: start + idx * interval,
        open,
        high,
        low,
        close,
        volume,
      });
      px = close;
    }
  }
  return out;
}
