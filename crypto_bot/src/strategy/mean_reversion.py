"""Mean reversion only when ranging. Does not overwrite an existing trend signal."""

from __future__ import annotations

import pandas as pd


def generate_signals(df: pd.DataFrame, *, allow_short: bool = True) -> pd.DataFrame:
    out = df.copy()
    bw = out["bb_width"]
    bw_sma = bw.rolling(20, min_periods=10).mean()
    squeeze = (bw > 1.5 * bw_sma) & (bw > bw.shift(1))
    ranging = (out["adx"] < 20) & (out["htf_bias"] == 0)
    long_ = ranging & (out["close"] < out["bb_lower"]) & (out["rsi"] < 30) & (~squeeze)
    short_ = ranging & (out["close"] > out["bb_upper"]) & (out["rsi"] > 70) & (~squeeze)
    if "signal" not in out.columns:
        out["signal"] = 0
        out["strategy"] = "none"
    m = (out["signal"] == 0) & long_
    out.loc[m, "signal"] = 1
    out.loc[m, "strategy"] = "mean_reversion"
    if allow_short:
        s = (out["signal"] == 0) & short_
        out.loc[s, "signal"] = -1
        out.loc[s, "strategy"] = "mean_reversion"
    return out
