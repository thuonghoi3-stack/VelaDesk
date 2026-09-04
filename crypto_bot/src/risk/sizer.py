"""Position size from equity % risk and stop distance."""

from __future__ import annotations


def size_qty(equity: float, risk_pct: float, fill: float, risk_per_unit: float, max_exposure: float, max_leverage: float) -> float:
    if risk_per_unit <= 0 or fill <= 0 or equity <= 0:
        return 0.0
    qty = (equity * risk_pct) / risk_per_unit
    cap = (equity * max_exposure * max_leverage) / fill
    qty = min(qty, cap)
    if qty * fill < 10:
        return 0.0
    return float(qty)


def clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))
