"""Daily loss cap, exposure, funding helpers."""

from __future__ import annotations

import pandas as pd


def utc_day(ts: pd.Timestamp) -> str:
    return ts.tz_convert("UTC").strftime("%Y-%m-%d")


def is_funding_bar(ts: pd.Timestamp) -> bool:
    ts = ts.tz_convert("UTC")
    return ts.minute == 0 and ts.hour % 8 == 0


def daily_halt(day_pnl: float, equity0: float, cap: float) -> bool:
    return day_pnl <= -cap * equity0
