"""CLI: python -m src.cli analyze --symbol BTC/USDT"""

from __future__ import annotations

import argparse
import json
import logging
from pathlib import Path

import yaml
from dotenv import load_dotenv

from .backtest.engine import run_backtest
from .bot.paper import build_frame, paper_once, loop
from .report.charts import write_html_report


def load_cfg(path: str) -> dict:
    return yaml.safe_load(Path(path).read_text())


def main() -> None:
    # API keys always come from the environment / .env — never hard-coded.
    load_dotenv()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    p = argparse.ArgumentParser(description="Vela crypto_bot")
    p.add_argument("cmd", choices=["analyze", "backtest", "paper"])
    p.add_argument("--config", default="config.yaml")
    p.add_argument("--symbol", default=None)
    p.add_argument("--loop", action="store_true", help="paper only: keep polling instead of one snapshot")
    p.add_argument("--interval", type=int, default=60, help="paper loop interval in seconds")
    args = p.parse_args()
    cfg = load_cfg(args.config)
    symbol = args.symbol or cfg["symbols"][0]
    if args.cmd == "analyze":
        df = build_frame(symbol, cfg["ltf"], cfg["htf"], cfg)
        last = df.iloc[-1]
        print(json.dumps({"symbol": symbol, "close": float(last["close"]), "regime": str(last["regime"]), "signal": int(last["signal"]), "rsi": float(last["rsi"]) if last["rsi"] == last["rsi"] else None}, indent=2))
        write_html_report(df.tail(400), None, f"reports/{symbol.replace('/', '')}_{cfg['ltf']}.html")
    elif args.cmd == "backtest":
        df = build_frame(symbol, cfg["ltf"], cfg["htf"], cfg)
        res = run_backtest(df, {**cfg, "time_stop": cfg.get("time_stop_bars", {}).get(cfg["ltf"], 24)})
        print(json.dumps({
            "metrics": res.metrics_all,
            "test": res.metrics_test,
            "claim": res.claim_reason,
            "buy_hold": res.buy_hold,
            "walk_forward": res.folds,
            "halt_days": res.halt_days,
        }, indent=2, default=str))
        write_html_report(df.tail(500), res.equity, f"reports/{symbol.replace('/', '')}_bt.html")
    elif args.loop:
        loop(cfg, interval_sec=args.interval)
    else:
        print(json.dumps(paper_once(cfg, symbol), indent=2))


if __name__ == "__main__":
    main()
