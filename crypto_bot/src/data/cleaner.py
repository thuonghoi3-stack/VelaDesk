"""Sort, dedupe, clamp OHLC, forward-fill a single missing bar, flag large gaps."""

from __future__ import annotations

import pandas as pd

INTERVAL = {"15m": "15min", "1h": "1h", "4h": "4h", "1d": "1d"}


def clean_ohlcv(df: pd.DataFrame, timeframe: str) -> pd.DataFrame:
    if df.empty:
        return df.copy()
    out = df.copy()
    if not isinstance(out.index, pd.DatetimeIndex):
        raise ValueError("OHLCV index must be DatetimeIndex UTC")
    if out.index.tz is None:
        out.index = out.index.tz_localize("UTC")
    else:
        out.index = out.index.tz_convert("UTC")
    out = out.sort_index()
    out = out[~out.index.duplicated(keep="last")]
    for col in ("open", "high", "low", "close", "volume"):
        if col not in out.columns:
            raise ValueError(f"missing column {col}")
        out[col] = pd.to_numeric(out[col], errors="coerce")
    out = out.dropna(subset=["open", "high", "low", "close"])
    out["high"] = out[["high", "open", "close"]].max(axis=1)
    out["low"] = out[["low", "open", "close"]].min(axis=1)
    out["volume"] = out["volume"].clip(lower=0)
    freq = INTERVAL[timeframe]
    full = pd.date_range(out.index.min(), out.index.max(), freq=freq, tz="UTC")
    out = out.reindex(full)
    gap_bars = out["close"].isna()
    # forward-fill a single missing bar from previous close
    out[["open", "high", "low", "close"]] = out[["open", "high", "low", "close"]].ffill(limit=1)
    out.loc[out["volume"].isna() & out["close"].notna(), "volume"] = 0
    out["gap"] = gap_bars & out["close"].notna()
    still = out["close"].isna()
    out.loc[still, "gap"] = True
    out = out.dropna(subset=["close"])
    return out
