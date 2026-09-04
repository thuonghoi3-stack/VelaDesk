"""Paper-trade loop. Polls public OHLCV, never sends orders."""

from __future__ import annotations

import json
import logging
import time
from pathlib import Path

from ..backtest.engine import run_backtest
from ..data.cleaner import clean_ohlcv
from ..data.fetcher import fetch_ohlcv
from ..features.indicators import add_indicators
from ..features.patterns import add_patterns
from ..features.regime import add_regime, map_htf
from ..strategy.mean_reversion import generate_signals as mr_signals
from ..strategy.trend_pullback import generate_signals as tp_signals

logger = logging.getLogger("vela.paper")


def build_frame(symbol: str, ltf: str, htf: str, cfg: dict):
    raw_l = fetch_ohlcv(symbol, ltf, exchange=cfg.get("exchange", "binance"), market=cfg.get("market", "usdm"), cache_dir=cfg.get("cache_dir", "./data/cache"))
    raw_h = fetch_ohlcv(symbol, htf, exchange=cfg.get("exchange", "binance"), market=cfg.get("market", "usdm"), cache_dir=cfg.get("cache_dir", "./data/cache"))
    l = add_regime(add_patterns(add_indicators(clean_ohlcv(raw_l, ltf))))
    h = add_regime(add_patterns(add_indicators(clean_ohlcv(raw_h, htf))))
    l = map_htf(l, h, htf)
    l = tp_signals(l, allow_short=cfg.get("side", "both") == "both", trade_volatility=cfg.get("trade_volatility", False))
    l = mr_signals(l, allow_short=cfg.get("side", "both") == "both")
    return l


def paper_once(cfg: dict, symbol: str, out_dir: str = "./reports") -> dict:
    ltf, htf = cfg["ltf"], cfg["htf"]
    df = build_frame(symbol, ltf, htf, cfg)
    last = df.iloc[-1]
    result = run_backtest(df, {**cfg, "time_stop": cfg.get("time_stop_bars", {}).get(ltf, 24)})
    snapshot = {
        "symbol": symbol,
        "time": str(df.index[-1]),
        "close": float(last["close"]),
        "regime": str(last["regime"]),
        "signal": int(last["signal"]),
        "strategy": str(last.get("strategy", "none")),
        "claim_blocked": result.claim_blocked,
        "claim_reason": result.claim_reason,
        "metrics": result.metrics_all,
        "warning": "Past results do not guarantee the future. Paper before live.",
    }
    Path(out_dir).mkdir(parents=True, exist_ok=True)
    path = Path(out_dir) / f"paper_{symbol.replace('/', '')}.json"
    path.write_text(json.dumps(snapshot, indent=2, default=str))
    logger.info("paper snapshot %s signal=%s", symbol, snapshot["signal"])
    return snapshot


def loop(cfg: dict, interval_sec: int = 60) -> None:
    """Polling loop for paper. Ctrl+C to stop. Does not place live orders."""
    while True:
        for symbol in cfg.get("symbols", ["BTC/USDT"]):
            try:
                paper_once(cfg, symbol)
            except Exception:
                logger.exception("paper failed for %s", symbol)
        time.sleep(interval_sec)
