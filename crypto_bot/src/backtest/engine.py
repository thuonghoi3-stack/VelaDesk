"""Event-driven next-bar backtest with fees, slippage, optional funding."""

from __future__ import annotations

from dataclasses import dataclass, field

import pandas as pd

from ..risk.limits import daily_halt, is_funding_bar
from ..risk.sizer import clamp, size_qty
from .metrics import claim_gate, metrics


@dataclass
class Trade:
    side: str
    strategy: str
    entry_time: pd.Timestamp
    exit_time: pd.Timestamp
    entry: float
    exit: float
    qty: float
    pnl: float
    pnl_r: float
    reason: str


@dataclass
class Result:
    equity: pd.Series
    trades: pd.DataFrame
    metrics_all: dict
    metrics_test: dict
    buy_hold: dict
    claim_blocked: bool
    claim_reason: str


def _slip(price: float, side: str, entry: bool, bps: float) -> float:
    s = bps / 10_000
    if side == "long":
        return price * (1 + s) if entry else price * (1 - s)
    return price * (1 - s) if entry else price * (1 + s)


def run_backtest(df: pd.DataFrame, cfg: dict) -> Result:
    warmup = int(cfg.get("warmup", 220))
    equity0 = float(cfg["equity"])
    fee = float(cfg["taker_fee"])
    slip = float(cfg["slippage_bps"])
    risk = float(cfg["risk_pct"])
    side_mode = cfg.get("side", "both")
    market = cfg.get("market", "usdm")
    time_stop = int(cfg.get("time_stop", 24))
    allow_short = side_mode == "both"

    equity = equity0
    peak = equity0
    pos = None
    curve = []
    trades: list[Trade] = []
    exposed = 0
    day_key = None
    day_pnl = 0.0
    halted = False

    idx = df.index
    for i in range(warmup, len(df)):
        row = df.iloc[i]
        ts = idx[i]
        key = ts.strftime("%Y-%m-%d")
        if key != day_key:
            day_key, day_pnl, halted = key, 0.0, False

        if pos is not None:
            exposed += 1
            if market == "usdm" and is_funding_bar(ts):
                fund = abs(pos["qty"] * row["close"]) * float(cfg.get("funding_per_8h", 0.0001))
                equity -= fund
                day_pnl -= fund
            pos["held"] += 1
            hi, lo, close = row["high"], row["low"], row["close"]
            if pos["side"] == "long":
                r_now = (hi - pos["entry"]) / pos["rpu"]
            else:
                r_now = (pos["entry"] - lo) / pos["rpu"]
            pos["r_max"] = max(pos["r_max"], r_now)
            if pos["r_max"] >= 1 and not pos["trailed"]:
                be = pos["entry"] * (1 + 2 * fee) if pos["side"] == "long" else pos["entry"] * (1 - 2 * fee)
                pos["stop"] = max(pos["stop"], be) if pos["side"] == "long" else min(pos["stop"], be)
                pos["trailed"] = True
            hit_stop = lo <= pos["stop"] if pos["side"] == "long" else hi >= pos["stop"]
            hit_tp1 = hi >= pos["tp1"] if pos["side"] == "long" else lo <= pos["tp1"]
            hit_tp2 = hi >= pos["tp2"] if pos["side"] == "long" else lo <= pos["tp2"]
            exit_px = None
            reason = ""
            qty_close = 0.0
            if hit_stop:
                exit_px, reason, qty_close = pos["stop"], "stop", pos["qty"]
            elif not pos["tp1_done"] and hit_tp1:
                exit_px, reason, qty_close = pos["tp1"], "tp1", pos["qty"] * 0.5
            elif pos["tp1_done"] and hit_tp2:
                exit_px, reason, qty_close = pos["tp2"], "tp2", pos["qty"]
            elif pos["held"] >= time_stop:
                exit_px, reason, qty_close = close, "time_stop", pos["qty"]
            if exit_px is not None:
                px = _slip(exit_px, pos["side"], False, slip)
                pnl = (px - pos["entry"]) * qty_close if pos["side"] == "long" else (pos["entry"] - px) * qty_close
                pnl -= abs(qty_close * px) * fee
                equity += pnl
                day_pnl += pnl
                trades.append(Trade(pos["side"], pos["strategy"], pos["t"], ts, pos["entry"], px, qty_close, pnl, pnl / (pos["rpu"] * qty_close) * qty_close, reason))
                pos["qty"] -= qty_close
                if reason == "tp1":
                    pos["tp1_done"] = True
                if pos["qty"] <= 1e-8:
                    pos = None

        if pos is None and not halted and i > 0:
            sig = int(df.iloc[i - 1]["signal"])
            if sig != 0 and (allow_short or sig > 0):
                side = "long" if sig == 1 else "short"
                prev = df.iloc[i - 1]
                atr = float(prev["atr"]) if pd.notna(prev["atr"]) else 0.0
                if atr > 0:
                    fill = _slip(float(row["open"]), side, True, slip)
                    look = df.iloc[max(0, i - 9) : i]
                    if side == "long":
                        raw = fill - float(look["low"].min())
                        dist = clamp(raw, 1.2 * atr, 2.5 * atr)
                        stop = fill - dist
                    else:
                        raw = float(look["high"].max()) - fill
                        dist = clamp(raw, 1.2 * atr, 2.5 * atr)
                        stop = fill + dist
                    if prev.get("strategy") == "mean_reversion":
                        dist = 1.8 * atr
                        stop = fill - dist if side == "long" else fill + dist
                    rpu = abs(fill - stop)
                    qty = size_qty(equity, risk, fill, rpu, float(cfg["max_exposure"]), float(cfg["max_leverage"]))
                    if qty > 0:
                        entry_fee = abs(qty * fill) * fee
                        equity -= entry_fee
                        day_pnl -= entry_fee
                        pos = {
                            "side": side,
                            "strategy": prev.get("strategy", "trend_pullback"),
                            "t": ts,
                            "entry": fill,
                            "qty": qty,
                            "stop": stop,
                            "tp1": fill + (1.5 * rpu if side == "long" else -1.5 * rpu),
                            "tp2": fill + (2.5 * rpu if side == "long" else -2.5 * rpu),
                            "rpu": rpu,
                            "held": 0,
                            "tp1_done": False,
                            "trailed": False,
                            "r_max": 0.0,
                        }

        mtm = equity
        if pos is not None:
            u = (row["close"] - pos["entry"]) if pos["side"] == "long" else (pos["entry"] - row["close"])
            mtm += u * pos["qty"]
        peak = max(peak, mtm)
        curve.append((ts, mtm))
        if daily_halt(day_pnl, equity0, float(cfg["daily_loss_cap"])):
            halted = True

    eq = pd.Series({t: v for t, v in curve}, name="equity")
    td = pd.DataFrame([t.__dict__ for t in trades])
    all_m = metrics(eq, td if len(td) else pd.DataFrame(columns=["pnl", "pnl_r"]), equity0, exposed)
    split = int(len(eq) * 0.7)
    test_eq = eq.iloc[split:]
    test_td = td[td["exit_time"] >= eq.index[split]] if len(td) else td
    test_m = metrics(test_eq, test_td if len(test_td) else pd.DataFrame(columns=["pnl", "pnl_r"]), equity0, 0)
    # buy & hold
    start = df.iloc[warmup]
    end = df.iloc[-1]
    bh_qty = (equity0 * 0.99) / float(start["open"])
    bh_end = equity0 + (float(end["close"]) - float(start["open"])) * bh_qty
    bh = {"end_equity": bh_end, "cagr": (bh_end / equity0) ** (365 / max((eq.index[-1] - eq.index[0]).days, 1)) - 1 if len(eq) else 0, "sharpe": 0, "max_dd": 0, "trades": 1, "profit_factor": 0, "win_rate": 1 if bh_end > equity0 else 0, "avg_r": 0, "expectancy": bh_end - equity0, "sortino": 0, "calmar": 0, "exposure": 1}
    blocked, reason = claim_gate(test_m)
    return Result(eq, td, all_m, test_m, bh, blocked, reason)
