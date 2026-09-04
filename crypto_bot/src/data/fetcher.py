"""OHLCV fetcher with parquet cache. Falls back to synthetic series if the venue is unreachable."""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Literal

import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)

Timeframe = Literal["15m", "1h", "4h", "1d"]

INTERVAL_MS = {"15m": 900_000, "1h": 3_600_000, "4h": 14_400_000, "1d": 86_400_000}


def _cache_path(cache_dir: Path, symbol: str, timeframe: str) -> Path:
    safe = symbol.replace("/", "")
    return cache_dir / f"{safe}_{timeframe}.parquet"


def _synthetic(symbol: str, timeframe: Timeframe, n: int = 1800) -> pd.DataFrame:
    """Regime-switching GBM. Labeled synthetic — not market data."""
    rng = np.random.default_rng(abs(hash(f"{symbol}:{timeframe}:vela")) % (2**32))
    px0 = 28000.0 if symbol.startswith("BTC") else 1800.0 if symbol.startswith("ETH") else 80.0
    drifts = [0.00035, -0.0009, 0.00002, 0.00045, -0.00055, 0.00008]
    vols = [0.012, 0.028, 0.009, 0.014, 0.02, 0.011]
    parts = np.array_split(np.arange(n), len(drifts))
    closes = []
    px = px0
    for idx, sl in enumerate(parts):
        for _ in sl:
            px = max(0.01, px * (1 + drifts[idx] + vols[idx] * rng.normal()))
            closes.append(px)
    close = np.array(closes)
    open_ = np.concatenate([[px0], close[:-1]])
    wick = np.abs(rng.normal(0, 0.004, n)) * close
    high = np.maximum(open_, close) + wick
    low = np.minimum(open_, close) - wick
    vol = rng.uniform(400, 3000, n) * (1 + np.array([vols[min(i * len(vols) // n, 5)] for i in range(n)]) * 30)
    end = pd.Timestamp.utcnow().floor("s")
    idx = pd.date_range(end=end, periods=n, freq=timeframe.replace("m", "min"), tz="UTC")
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": vol, "synthetic": True},
        index=idx,
    )


def fetch_ohlcv(
    symbol: str,
    timeframe: Timeframe,
    *,
    exchange: str = "binance",
    market: Literal["spot", "usdm"] = "usdm",
    since_days: int = 900,
    cache_dir: str | Path = "./data/cache",
    force: bool = False,
) -> pd.DataFrame:
    """
    Load OHLCV with columns open, high, low, close, volume and a UTC DatetimeIndex.

    Uses ccxt when installed and the network is available. Caches parquet as
    ``{symbol}_{tf}.parquet``. If the venue fails, returns a synthetic series
    with column ``synthetic=True``.
    """
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    path = _cache_path(cache, symbol, timeframe)
    if path.exists() and not force:
        df = pd.read_parquet(path)
        df.index = pd.to_datetime(df.index, utc=True)
        logger.info("cache hit %s", path)
        return df

    try:
        import ccxt  # type: ignore

        klass = getattr(ccxt, exchange)
        params = {"defaultType": "swap" if market == "usdm" else "spot"}
        ex = klass({"enableRateLimit": True, "options": params, "apiKey": os.getenv("BINANCE_API_KEY", ""), "secret": os.getenv("BINANCE_API_SECRET", "")})
        since = ex.milliseconds() - since_days * 86_400_000
        rows: list[list[float]] = []
        while True:
            batch = ex.fetch_ohlcv(symbol, timeframe=timeframe, since=since, limit=1000)
            if not batch:
                break
            rows.extend(batch)
            since = int(batch[-1][0]) + 1
            if len(batch) < 500:
                break
            if len(rows) > 25_000:
                break
        if len(rows) < 200:
            raise RuntimeError("too few bars from exchange")
        df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
        df["datetime"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
        df = df.set_index("datetime").drop(columns=["timestamp"])
        df["synthetic"] = False
        df.to_parquet(path)
        return df
    except Exception as exc:  # noqa: BLE001 — venue/network is optional at generate time
        logger.warning("fetch failed (%s); using synthetic OHLCV", exc)
        df = _synthetic(symbol, timeframe)
        df.to_parquet(path)
        return df
