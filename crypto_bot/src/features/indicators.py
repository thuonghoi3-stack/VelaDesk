"""Trend / momentum / volatility / volume indicators. Values at i use only bars <= i."""

from __future__ import annotations

import numpy as np
import pandas as pd


def _ema(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(span=n, adjust=False, min_periods=n).mean()


def _wilder(s: pd.Series, n: int) -> pd.Series:
    return s.ewm(alpha=1 / n, adjust=False, min_periods=n).mean()


def add_indicators(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    c, h, l, v = out["close"], out["high"], out["low"], out["volume"]
    out["ema20"] = _ema(c, 20)
    out["ema50"] = _ema(c, 50)
    out["ema200"] = _ema(c, 200)
    out["rsi"] = _rsi(c, 14)
    macd = _ema(c, 12) - _ema(c, 26)
    out["macd"] = macd
    out["macd_signal"] = _ema(macd.fillna(0), 9)
    out["macd_hist"] = out["macd"] - out["macd_signal"]
    prev_c = c.shift(1)
    tr = pd.concat([(h - l), (h - prev_c).abs(), (l - prev_c).abs()], axis=1).max(axis=1)
    out["atr"] = _wilder(tr, 14)
    out["atr_sma20"] = out["atr"].rolling(20, min_periods=20).mean()
    mid = c.rolling(20, min_periods=20).mean()
    sd = c.rolling(20, min_periods=20).std(ddof=0)
    out["bb_mid"] = mid
    out["bb_upper"] = mid + 2 * sd
    out["bb_lower"] = mid - 2 * sd
    out["bb_width"] = (out["bb_upper"] - out["bb_lower"]) / mid.replace(0, np.nan)
    out["vol_sma20"] = v.rolling(20, min_periods=20).mean()
    out["vol_spike"] = v / out["vol_sma20"].replace(0, np.nan)
    out["obv"] = (np.sign(c.diff().fillna(0)) * v).cumsum()
    lowest = l.rolling(14, min_periods=14).min()
    highest = h.rolling(14, min_periods=14).max()
    out["stoch_k"] = 100 * (c - lowest) / (highest - lowest).replace(0, np.nan)
    out["stoch_d"] = out["stoch_k"].rolling(3, min_periods=3).mean()
    out["adx"] = _adx(h, l, c, 14)
    return out


def _rsi(close: pd.Series, n: int) -> pd.Series:
    d = close.diff()
    gain = d.clip(lower=0)
    loss = -d.clip(upper=0)
    ag = _wilder(gain, n)
    al = _wilder(loss, n)
    rs = ag / al.replace(0, np.nan)
    return 100 - 100 / (1 + rs)


def _adx(high: pd.Series, low: pd.Series, close: pd.Series, n: int) -> pd.Series:
    up = high.diff()
    down = -low.diff()
    plus_dm = np.where((up > down) & (up > 0), up, 0.0)
    minus_dm = np.where((down > up) & (down > 0), down, 0.0)
    prev = close.shift(1)
    tr = pd.concat([(high - low), (high - prev).abs(), (low - prev).abs()], axis=1).max(axis=1)
    atr = _wilder(tr, n)
    pdi = 100 * _wilder(pd.Series(plus_dm, index=high.index), n) / atr.replace(0, np.nan)
    mdi = 100 * _wilder(pd.Series(minus_dm, index=high.index), n) / atr.replace(0, np.nan)
    dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, np.nan)
    return _wilder(dx, n)
