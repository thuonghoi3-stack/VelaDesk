"""Performance metrics. Claim gate: Sharpe < 0.8 or MaxDD > 25% on test → do not claim a winning strategy."""

from __future__ import annotations

import numpy as np
import pandas as pd


def max_drawdown(equity: pd.Series) -> float:
    peak = equity.cummax()
    dd = (peak - equity) / peak.replace(0, np.nan)
    return float(dd.max()) if len(dd) else 0.0


def metrics(equity: pd.Series, trades: pd.DataFrame, start_equity: float, exposed: int) -> dict:
    if equity.empty:
        return {"cagr": 0, "sharpe": 0, "sortino": 0, "max_dd": 0, "calmar": 0, "win_rate": 0, "profit_factor": 0, "avg_r": 0, "expectancy": 0, "trades": 0, "exposure": 0, "end_equity": start_equity}
    days = max((equity.index[-1] - equity.index[0]).total_seconds() / 86400, 1)
    end = float(equity.iloc[-1])
    cagr = (end / start_equity) ** (365 / days) - 1 if start_equity > 0 else 0
    daily = equity.resample("1D").last().dropna().pct_change().dropna()
    sharpe = float(daily.mean() / daily.std() * np.sqrt(365)) if daily.std() > 0 else 0.0
    down = daily[daily < 0]
    sortino = float(daily.mean() / down.std() * np.sqrt(365)) if len(down) and down.std() > 0 else 0.0
    mdd = max_drawdown(equity)
    gp = float(trades.loc[trades["pnl"] > 0, "pnl"].sum()) if len(trades) else 0.0
    gl = float(-trades.loc[trades["pnl"] <= 0, "pnl"].sum()) if len(trades) else 0.0
    return {
        "cagr": cagr,
        "sharpe": sharpe,
        "sortino": sortino,
        "max_dd": mdd,
        "calmar": cagr / mdd if mdd else 0.0,
        "win_rate": float((trades["pnl"] > 0).mean()) if len(trades) else 0.0,
        "profit_factor": gp / gl if gl else (99 if gp else 0),
        "avg_r": float(trades["pnl_r"].mean()) if len(trades) else 0.0,
        "expectancy": float(trades["pnl"].mean()) if len(trades) else 0.0,
        "trades": int(len(trades)),
        "exposure": exposed / max(len(equity), 1),
        "end_equity": end,
    }


def claim_gate(test: dict) -> tuple[bool, str]:
    if test["trades"] < 20:
        return True, f"Test only {test['trades']} trades — insufficient."
    if test["sharpe"] < 0.8:
        return True, f"Test Sharpe {test['sharpe']:.2f} < 0.8 — do not claim a winning strategy."
    if test["max_dd"] > 0.25:
        return True, f"Test Max DD {test['max_dd']:.1%} > 25% — do not claim a winning strategy."
    return False, "Test clears the minimum gate. Past results still do not guarantee the future."
