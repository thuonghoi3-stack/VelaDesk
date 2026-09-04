"""Trend Pullback + Momentum Confirm. Next-bar execution is applied in the backtest engine."""

from __future__ import annotations

import pandas as pd

from .base import macd_falling, macd_rising, rsi_dropped, rsi_lifted


def generate_signals(df: pd.DataFrame, *, allow_short: bool = True, trade_volatility: bool = False) -> pd.DataFrame:
    out = df.copy()
    rng = (out["high"] - out["low"]).clip(lower=1e-12)
    body = out["close"] - out["open"]
    vol_ok = (~out["extreme_vol"]) | trade_volatility
    pull_long = (
        (out["low"] <= out["ema20"] * 1.003)
        | (out["low"] <= out["ema50"] * 1.003)
        | (out["low"] <= out["bb_mid"] * 1.002)
        | (out["close"] <= out["bb_lower"] * 1.01)
    )
    pull_short = (
        (out["high"] >= out["ema20"] * 0.997)
        | (out["high"] >= out["ema50"] * 0.997)
        | (out["high"] >= out["bb_mid"] * 0.998)
        | (out["close"] >= out["bb_upper"] * 0.99)
    )
    bull_trig = (
        out["pattern"].isin(["bullish_engulfing", "hammer", "pin_bar"])
        | ((out["close"] > out["ema20"]) & (body > 0) & (body >= 0.45 * rng))
    )
    bear_trig = (
        out["pattern"].isin(["bearish_engulfing", "shooting_star", "pin_bar"])
        | ((out["close"] < out["ema20"]) & (body < 0) & (-body >= 0.45 * rng))
    )
    long_ = (
        (out["htf_bias"] == 1)
        & pull_long
        & rsi_lifted(out)
        & macd_rising(out)
        & (out["vol_spike"] >= 1.2)
        & bull_trig
        & vol_ok
    )
    short_ = (
        (out["htf_bias"] == -1)
        & pull_short
        & rsi_dropped(out)
        & macd_falling(out)
        & (out["vol_spike"] >= 1.2)
        & bear_trig
        & vol_ok
    )
    signal = pd.Series(0, index=out.index, dtype=int)
    signal = signal.mask(long_, 1)
    if allow_short:
        signal = signal.mask(short_ & (signal == 0), -1)
    out["signal"] = signal
    out["strategy"] = "none"
    out.loc[signal != 0, "strategy"] = "trend_pullback"
    return out
