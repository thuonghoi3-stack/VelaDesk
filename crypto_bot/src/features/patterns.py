"""Rule-based candlestick patterns. No ML in v1."""

from __future__ import annotations

import pandas as pd


def add_patterns(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    o, h, l, c = out["open"], out["high"], out["low"], out["close"]
    body = (c - o).abs()
    rng = (h - l).clip(lower=1e-12)
    uw = h - pd.concat([o, c], axis=1).max(axis=1)
    lw = pd.concat([o, c], axis=1).min(axis=1) - l
    close_pos = (c - l) / rng
    prev_o, prev_c = o.shift(1), c.shift(1)
    prev_body = (prev_c - prev_o).abs()
    prev_top = pd.concat([prev_o, prev_c], axis=1).max(axis=1)
    prev_bot = pd.concat([prev_o, prev_c], axis=1).min(axis=1)
    top = pd.concat([o, c], axis=1).max(axis=1)
    bot = pd.concat([o, c], axis=1).min(axis=1)

    doji = body / rng <= 0.1
    hammer = (lw >= 2 * body) & (lw >= 0.55 * rng) & (close_pos >= 0.66) & (c >= o)
    star = (uw >= 2 * body) & (uw >= 0.55 * rng) & ((h - c) / rng >= 0.66) & (c <= o)
    bull_eng = (prev_c < prev_o) & (c > o) & (bot <= prev_bot) & (top >= prev_top) & (body > prev_body)
    bear_eng = (prev_c > prev_o) & (c < o) & (bot <= prev_bot) & (top >= prev_top) & (body > prev_body)
    inside = (h < h.shift(1)) & (l > l.shift(1))

    name = pd.Series("none", index=out.index)
    direction = pd.Series(0, index=out.index, dtype=int)
    strength = pd.Series(0.0, index=out.index)
    name = name.mask(doji, "doji")
    name = name.mask(inside, "inside_bar")
    name = name.mask(star, "shooting_star")
    name = name.mask(hammer, "hammer")
    name = name.mask(bear_eng, "bearish_engulfing")
    name = name.mask(bull_eng, "bullish_engulfing")
    direction = direction.mask(hammer | bull_eng, 1)
    direction = direction.mask(star | bear_eng, -1)
    strength = strength.mask(hammer | star, (lw.clip(lower=uw) / rng).clip(0, 1))
    strength = strength.mask(bull_eng | bear_eng, (body / (prev_body + 1e-12)).clip(0, 1))
    strength = strength.mask(doji, (1 - body / rng).clip(0, 1))
    out["pattern"] = name
    out["pattern_dir"] = direction
    out["pattern_strength"] = strength
    return out
