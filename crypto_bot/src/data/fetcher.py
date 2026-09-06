"""OHLCV fetcher with parquet cache. Falls back to synthetic series if the venue is unreachable.

Cache rules:
- Only REAL exchange data is cached — synthetic fallback is never written to
  the cache, so a network outage can never poison later runs with fake bars.
- With ``max_age_s`` set, a stale cache triggers an incremental refetch of just
  the missing tail (used by the paper loop); on any failure the cache is
  returned as-is.
"""

from __future__ import annotations

import hashlib
import logging
import os
import time
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


def _seed(symbol: str, timeframe: str) -> int:
    """Stable across processes (unlike builtin hash(), which is salted)."""
    digest = hashlib.sha256(f"{symbol}:{timeframe}:vela".encode()).hexdigest()
    return int(digest[:8], 16)


def _synthetic(symbol: str, timeframe: Timeframe, n: int = 1800) -> pd.DataFrame:
    """Regime-switching GBM. Labeled synthetic — not market data."""
    rng = np.random.default_rng(_seed(symbol, timeframe))
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
    end = pd.Timestamp.now(tz="UTC").floor("s")
    idx = pd.date_range(end=end, periods=n, freq=timeframe.replace("m", "min"), tz="UTC")
    return pd.DataFrame(
        {"open": open_, "high": high, "low": low, "close": close, "volume": vol, "synthetic": True},
        index=idx,
    )


def _read_cache(path: Path) -> pd.DataFrame | None:
    try:
        df = pd.read_parquet(path)
        df.index = pd.to_datetime(df.index, utc=True)
        # A cache holding synthetic bars is not authoritative — refetch.
        if "synthetic" in df.columns and bool(df["synthetic"].all()):
            return None
        return df
    except Exception as exc:  # noqa: BLE001 — a corrupt cache is refetched
        logger.warning("cache unreadable (%s): %s", path, exc)
        return None


def _fetch_pages(ex, symbol: str, timeframe: str, since_ms: int, max_bars: int = 25_000) -> list[list[float]]:
    rows: list[list[float]] = []
    while True:
        batch = ex.fetch_ohlcv(symbol, timeframe=timeframe, since=since_ms, limit=1000)
        if not batch:
            break
        rows.extend(batch)
        since_ms = int(batch[-1][0]) + 1
        if len(batch) < 500 or len(rows) > max_bars:
            break
    return rows


def _rows_to_frame(rows: list[list[float]]) -> pd.DataFrame:
    df = pd.DataFrame(rows, columns=["timestamp", "open", "high", "low", "close", "volume"])
    df["datetime"] = pd.to_datetime(df["timestamp"], unit="ms", utc=True)
    return df.set_index("datetime").drop(columns=["timestamp"])


def _exchange(exchange: str, market: Literal["spot", "usdm"]):
    import ccxt  # type: ignore

    klass = getattr(ccxt, exchange)
    params = {"defaultType": "swap" if market == "usdm" else "spot"}
    # Public OHLCV needs no keys; they are only passed through for private
    # endpoints and always come from the environment, never hard-coded.
    return klass(
        {
            "enableRateLimit": True,
            "options": params,
            "apiKey": os.getenv("VELA_EXCHANGE_API_KEY", ""),
            "secret": os.getenv("VELA_EXCHANGE_API_SECRET", ""),
        }
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
    max_age_s: float | None = None,
) -> pd.DataFrame:
    """
    Load OHLCV with columns open, high, low, close, volume and a UTC DatetimeIndex.

    Uses ccxt when installed and the network is available. Caches real exchange
    data as ``{symbol}_{tf}.parquet``; ``max_age_s`` (paper loop) refreshes a
    stale cache incrementally. If the venue fails, returns a synthetic series
    with column ``synthetic=True`` — never cached.
    """
    cache = Path(cache_dir)
    cache.mkdir(parents=True, exist_ok=True)
    path = _cache_path(cache, symbol, timeframe)

    if path.exists() and not force:
        cached = _read_cache(path)
        if cached is not None:
            age = time.time() - path.stat().st_mtime
            if max_age_s is None or age <= max_age_s:
                logger.info("cache hit %s", path)
                return cached
            # Stale cache: top up the missing tail incrementally.
            try:
                ex = _exchange(exchange, market)
                since_ms = int(cached.index[-1].timestamp() * 1000) + 1
                rows = _fetch_pages(ex, symbol, timeframe, since_ms)
                if rows:
                    fresh = _rows_to_frame(rows)
                    fresh["synthetic"] = False
                    merged = pd.concat([cached, fresh])
                    merged = merged[~merged.index.duplicated(keep="last")].sort_index()
                    merged.to_parquet(path)
                    logger.info("cache refreshed +%d bars %s", len(fresh), path)
                    return merged
                logger.info("no new bars from venue; serving cache %s", path)
                return cached
            except Exception as exc:  # noqa: BLE001 — network is optional
                logger.warning("incremental refresh failed (%s); serving cache", exc)
                return cached

    try:
        ex = _exchange(exchange, market)
        since = ex.milliseconds() - since_days * 86_400_000
        rows = _fetch_pages(ex, symbol, timeframe, since)
        if len(rows) < 200:
            raise RuntimeError("too few bars from exchange")
        df = _rows_to_frame(rows)
        df["synthetic"] = False
        df.to_parquet(path)
        return df
    except Exception as exc:  # noqa: BLE001 — venue/network is optional at generate time
        logger.warning("fetch failed (%s); using synthetic OHLCV (not cached)", exc)
        return _synthetic(symbol, timeframe)
