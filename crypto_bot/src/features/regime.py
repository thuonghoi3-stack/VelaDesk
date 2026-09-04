"""Regime labels and HTF→LTF mapping without look-ahead."""

from __future__ import annotations

import pandas as pd


def add_regime(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    adx, ema50, close = out["adx"], out["ema50"], out["close"]
    regime = pd.Series("mixed", index=out.index)
    regime = regime.mask(adx < 20, "ranging")
    regime = regime.mask((adx >= 25) & (close > ema50), "trending_up")
    regime = regime.mask((adx >= 25) & (close < ema50), "trending_down")
    out["regime"] = regime
    out["high_vol"] = out["atr"] > 1.5 * out["atr_sma20"]
    out["extreme_vol"] = out["atr"] > 2.0 * out["atr_sma20"]
    return out


def map_htf(ltf: pd.DataFrame, htf: pd.DataFrame, htf_rule: str) -> pd.DataFrame:
    """Attach last *closed* HTF bar. HTF bar starting at t is closed at t + rule."""
    out = ltf.copy()
    h = htf.copy()
    delta = pd.Timedelta(htf_rule.replace("m", "min"))
    h = h.add_prefix("htf_")
    h["htf_close_time"] = h.index + delta
    # merge_asof backward on LTF open vs HTF close time
    left = out.reset_index().rename(columns={"index": "time"})
    if "time" not in left.columns:
        left = out.reset_index()
        left = left.rename(columns={left.columns[0]: "time"})
    right = h.reset_index().rename(columns={h.reset_index().columns[0]: "htf_open"})
    right["htf_available"] = right["htf_open"] + delta
    merged = pd.merge_asof(
        left.sort_values("time"),
        right.sort_values("htf_available"),
        left_on="time",
        right_on="htf_available",
        direction="backward",
    )
    merged = merged.set_index("time")
    bias = pd.Series(0, index=merged.index, dtype=int)
    up = (merged["htf_close"] > merged["htf_ema50"]) & (merged["htf_adx"] >= 20)
    down = (merged["htf_close"] < merged["htf_ema50"]) & (merged["htf_adx"] >= 20)
    bias = bias.mask(up, 1).mask(down, -1)
    merged["htf_bias"] = bias
    return merged
