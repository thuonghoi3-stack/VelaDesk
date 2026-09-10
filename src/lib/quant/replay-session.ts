import { SimEngine } from "./backtest/engine.ts";
import type { DeskConfig, FeatureBar } from "./types.ts";

/**
 * Restore the uninterrupted simulation immediately BEFORE the exact entry bar.
 * Replay all history from warmup: jumping the cursor would lose cash, daily
 * limits, funding and partial positions. Own snapshots isolate later desk edits.
 * No liquidation occurs here; callers explicitly finish with runToEnd().
 * Position/trade IDs are newly allocated by SimEngine's process-global sequence.
 */
export function createReplaySession(bars: FeatureBar[], config: DeskConfig, entryTime: number): SimEngine {
  if (!Number.isFinite(entryTime)) throw new RangeError("Entry timestamp must be finite.");
  if (!Array.isArray(bars) || bars.length === 0) throw new RangeError("Replay bars are required.");
  if (!config || !Number.isInteger(config.warmup) || config.warmup < 0 || config.warmup >= bars.length) {
    throw new RangeError("Replay warmup must be a valid bar index.");
  }
  const entryIndex = bars.findIndex((bar) => bar.time === entryTime);
  if (entryIndex < 0) throw new RangeError("Entry timestamp was not found in replay bars.");
  if (bars.some((bar, index) => index !== entryIndex && bar.time === entryTime)) {
    throw new RangeError("Entry timestamp must be unique.");
  }
  if (entryIndex < config.warmup) throw new RangeError("Entry index precedes warmup.");
  const sessionConfig = structuredClone(config);
  const engine = new SimEngine(structuredClone(bars), sessionConfig, sessionConfig.ltf);
  while (engine.i < entryIndex) engine.step();
  return engine;
}
