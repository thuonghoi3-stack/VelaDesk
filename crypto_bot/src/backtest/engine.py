"""Event-driven next-bar backtest with fees, slippage, optional funding.

Execution contract (mirrors src/lib/quant/backtest/engine.ts):
- Signals at close[t] fill at open[t+1] (next-bar).
- If a stop and a take-profit are both touchable in one bar, the STOP fills
  first (pessimistic). A bar reaching TP2 necessarily crossed TP1, so both
  partial fills execute in that bar.
- A fill bar whose range pierces the planned stop vetoes the entry.
- Funding (USDT-M only) is charged on open notional and attributed pro-rata
  to each partial exit.
"""

from __future__ import annotations

from dataclasses import dataclass

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
    funding: float = 0.0


@dataclass
class Result:
    equity: pd.Series
    trades: pd.DataFrame
    metrics_all: dict
    metrics_test: dict
    buy_hold: dict
    claim_blocked: bool
    claim_reason: str
    folds: list[dict]
    halt_days: int


def _slip(price: float, side: str, entry: bool, bps: float) -> float:
    s = bps / 10_000
    if side == "long":
        return price * (1 + s) if entry else price * (1 - s)
    return price * (1 - s) if entry else price * (1 + s)


def _core(df: pd.DataFrame, cfg: dict) -> dict:
    """Run the simulator over one contiguous frame. Returns curve/trades/exposure flags."""
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
    pos: dict | None = None
    curve: list[tuple[pd.Timestamp, float]] = []
    exposed_flags: list[bool] = []
    trades: list[Trade] = []
    halt_days = 0
    day_key = None
    day_pnl = 0.0
    day_start_eq = equity0
    halted = False

    idx = df.index
    for i in range(warmup, len(df)):
        row = df.iloc[i]
        ts = idx[i]
        key = ts.strftime("%Y-%m-%d")
        if key != day_key:
            if halted:
                halt_days += 1
            day_key, day_pnl, halted = key, 0.0, False
            # Daily loss cap is measured against equity at the START of the day.
            day_start_eq = curve[-1][1] if curve else equity0

        was_open = pos is not None
        if pos is not None:
            if market == "usdm" and is_funding_bar(ts):
                fund = abs(pos["qty"] * row["close"]) * float(cfg.get("funding_per_8h", 0.0001))
                equity -= fund
                day_pnl -= fund
                pos["funding"] += fund

        def _close(px_raw: float, reason: str, qty_close: float) -> None:
            nonlocal equity, day_pnl, pos
            px = _slip(px_raw, pos["side"], False, slip)
            pnl = (px - pos["entry"]) * qty_close if pos["side"] == "long" else (pos["entry"] - px) * qty_close
            pnl -= abs(qty_close * px) * fee
            funding_share = (qty_close / max(pos["qty0"], 1e-12)) * pos["funding"]
            pos["funding"] -= funding_share
            equity += pnl
            day_pnl += pnl
            # Per-unit R, independent of the closed size (matches the TS engine).
            sign = 1.0 if pos["side"] == "long" else -1.0
            pnl_r = sign * (px - pos["entry"]) / pos["rpu"] if pos["rpu"] > 0 else 0.0
            trades.append(
                Trade(pos["side"], pos["strategy"], pos["t"], ts, pos["entry"], px, qty_close, pnl, pnl_r, reason, funding_share)
            )
            pos["qty"] -= qty_close
            if reason == "tp1":
                pos["tp1_done"] = True
            if pos["qty"] <= 1e-8:
                pos = None

        if pos is not None:
            pos["held"] += 1
            hi, lo, close = float(row["high"]), float(row["low"]), float(row["close"])
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
            if hit_stop:
                # Pessimistic: when both stop and TP are touchable, stop wins.
                _close(pos["stop"], "stop", pos["qty"])
            elif not pos["tp1_done"] and hit_tp1:
                _close(pos["tp1"], "tp1", pos["qty"] * 0.5)
                if pos is not None and hit_tp2:
                    _close(pos["tp2"], "tp2", pos["qty"])
            elif pos["tp1_done"] and hit_tp2:
                _close(pos["tp2"], "tp2", pos["qty"])
            elif pos["held"] >= time_stop:
                _close(close, "time_stop", pos["qty"])

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
                        if float(row["low"]) <= stop:
                            sig = 0  # fill bar already pierces the stop — veto
                    else:
                        raw = float(look["high"].max()) - fill
                        dist = clamp(raw, 1.2 * atr, 2.5 * atr)
                        stop = fill + dist
                        if float(row["high"]) >= stop:
                            sig = 0
                    if sig != 0 and prev.get("strategy") == "mean_reversion":
                        dist = 1.8 * atr
                        stop = fill - dist if side == "long" else fill + dist
                    if sig != 0:
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
                                "qty0": qty,
                                "stop": stop,
                                "tp1": fill + (1.5 * rpu if side == "long" else -1.5 * rpu),
                                "tp2": fill + (2.5 * rpu if side == "long" else -2.5 * rpu),
                                "rpu": rpu,
                                "held": 0,
                                "tp1_done": False,
                                "trailed": False,
                                "r_max": 0.0,
                                "funding": 0.0,
                            }

        mtm = equity
        if pos is not None:
            u = (row["close"] - pos["entry"]) if pos["side"] == "long" else (pos["entry"] - row["close"])
            mtm += u * pos["qty"]
        peak = max(peak, mtm)
        curve.append((ts, mtm))
        exposed_flags.append(was_open or pos is not None)
        if daily_halt(day_pnl, day_start_eq, float(cfg["daily_loss_cap"])):
            halted = True

    if halted:
        halt_days += 1
    return {
        "curve": curve,
        "trades": trades,
        "exposed": exposed_flags,
        "halt_days": halt_days,
        "peak": peak,
    }


def _buy_hold(df: pd.DataFrame, cfg: dict, warmup: int, equity0: float) -> dict:
    fee = float(cfg["taker_fee"])
    slip = float(cfg["slippage_bps"])
    entry = _slip(float(df.iloc[warmup]["open"]), "long", True, slip)
    qty = (equity0 * 0.99) / entry
    entry_fee = abs(qty * entry) * fee
    pts: list[tuple[pd.Timestamp, float]] = []
    for i in range(warmup, len(df)):
        px = float(df.iloc[i]["close"])
        eq = equity0 - entry_fee + (px - entry) * qty
        if i == len(df) - 1:
            exit_px = _slip(px, "long", False, slip)
            eq = equity0 - entry_fee + (exit_px - entry) * qty - abs(qty * exit_px) * fee
        pts.append((df.index[i], eq))
    eq = pd.Series(dict(pts), name="equity")
    pnl = float(eq.iloc[-1]) - equity0 if len(eq) else 0.0
    bh_trades = pd.DataFrame([{"pnl": pnl, "pnl_r": 0.0}])
    return metrics(eq, bh_trades, equity0, len(eq))


def run_backtest(df: pd.DataFrame, cfg: dict) -> Result:
    warmup = int(cfg.get("warmup", 220))
    equity0 = float(cfg["equity"])

    core = _core(df, cfg)
    eq = pd.Series(dict(core["curve"]), name="equity")
    td = pd.DataFrame([t.__dict__ for t in core["trades"]])
    empty = pd.DataFrame(columns=["pnl", "pnl_r"])
    exposed_total = sum(core["exposed"])

    split_ts = eq.index[int(len(eq) * 0.7)] if len(eq) else None
    exposed_test = sum(1 for ts, flag in zip(eq.index, core["exposed"]) if flag and split_ts is not None and ts >= split_ts)
    test_eq = eq.iloc[int(len(eq) * 0.7) :] if len(eq) else eq
    test_td = td[td["exit_time"] >= split_ts] if len(td) and split_ts is not None else td

    all_m = metrics(eq, td if len(td) else empty, equity0, exposed_total)
    test_m = metrics(test_eq, test_td if len(test_td) else empty, equity0, exposed_test)
    bh = _buy_hold(df, cfg, warmup, equity0)

    # Walk-forward folds: train up to each cut, test the following 15% window.
    folds: list[dict] = []
    n = len(df)
    for cut in (0.5, 0.65, 0.8):
        train_end = int(n * cut)
        test_end = min(n, train_end + int(n * 0.15))
        if test_end - train_end < 50 or train_end - warmup < 10:
            continue
        sub = df.iloc[max(0, train_end - warmup) : test_end]
        if len(sub) <= warmup + 10:
            continue
        fc = _core(sub, cfg)
        feq = pd.Series(dict(fc["curve"]), name="equity")
        ftd = pd.DataFrame([t.__dict__ for t in fc["trades"]])
        folds.append(
            {
                "train_start": str(df.index[0]),
                "train_end": str(df.index[train_end]),
                "test_start": str(df.index[train_end]),
                "test_end": str(df.index[test_end - 1]),
                "metrics": metrics(feq, ftd if len(ftd) else empty, equity0, sum(fc["exposed"])),
            }
        )

    blocked, reason = claim_gate(test_m)
    return Result(eq, td, all_m, test_m, bh, blocked, reason, folds, core["halt_days"])
