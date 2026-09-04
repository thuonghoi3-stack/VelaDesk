from .mean_reversion import generate_signals as mean_reversion_signals
from .trend_pullback import generate_signals as trend_pullback_signals

__all__ = ["trend_pullback_signals", "mean_reversion_signals"]
