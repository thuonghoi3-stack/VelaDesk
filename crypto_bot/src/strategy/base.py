"""Shared rule helpers. Signals are -1 / 0 / +1 at bar close."""

from __future__ import annotations

import pandas as pd


def rsi_lifted(df: pd.DataFrame, lo: float = 40, hi: float = 52, lookback: int = 8) -> pd.Series:
    rsi = df["rsi"]
    now_up = (rsi > rsi.shift(1)) & (rsi >= lo)
    dipped = rsi.shift(1).rolling(lookback, min_periods=3).apply(lambda s: ((s >= lo) & (s <= hi)).any(), raw=False)
    return now_up & (dipped == 1)


def rsi_dropped(df: pd.DataFrame, lo: float = 48, hi: float = 60, lookback: int = 8) -> pd.Series:
    rsi = df["rsi"]
    now_dn = (rsi < rsi.shift(1)) & (rsi <= hi)
    peaked = rsi.shift(1).rolling(lookback, min_periods=3).apply(lambda s: ((s >= lo) & (s <= hi)).any(), raw=False)
    return now_dn & (peaked == 1)


def macd_rising(df: pd.DataFrame) -> pd.Series:
    h = df["macd_hist"]
    return (h > 0) | ((h > h.shift(1)) & (h.shift(1) > h.shift(2)))


def macd_falling(df: pd.DataFrame) -> pd.Series:
    h = df["macd_hist"]
    return (h < 0) | ((h < h.shift(1)) & (h.shift(1) < h.shift(2)))
