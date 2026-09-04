"""Live execution stub — intentionally does not send orders in v1."""

from __future__ import annotations

import logging

logger = logging.getLogger("vela.live")


class LiveDisabledError(RuntimeError):
    pass


def place_order(*_args, **_kwargs) -> None:
    """Hard stop. Enable only after a written go-live checklist and paper track record."""
    raise LiveDisabledError(
        "Live trading is disabled in v1. Complete paper trading, then implement "
        "signed ccxt create_order with reduce-only SL, max notionals, and kill-switch."
    )


def go_live_checklist() -> list[str]:
    return [
        "Paper ≥ 20 trades across >1 regime",
        "Daily loss kill-switch tested",
        "API keys in env, IP whitelist, no withdrawal permission",
        "Funding and slippage logged",
        "Size capped at 0.25% risk for the first live week",
        "Manual flatten path documented",
    ]
