import pandas as pd

from src.data.cleaner import clean_ohlcv
from src.risk.sizer import size_qty
from src.bot.live_stub import LiveDisabledError, place_order


def test_cleaner_sorts_and_flags_gap():
    idx = pd.to_datetime(["2024-01-01 00:00Z", "2024-01-01 02:00Z", "2024-01-01 00:00Z"])
    df = pd.DataFrame(
        {"open": [1, 3, 1.1], "high": [1.2, 3.2, 1.3], "low": [0.9, 2.8, 0.8], "close": [1.1, 3.1, 1.05], "volume": [10, 11, 9]},
        index=idx,
    )
    out = clean_ohlcv(df, "1h")
    assert out.index.is_monotonic_increasing
    assert not out.index.has_duplicates
    assert "gap" in out.columns


def test_sizer_caps_notional():
    qty = size_qty(10_000, 0.01, 100, 2.0, max_exposure=0.25, max_leverage=2)
    assert qty <= (10_000 * 0.25 * 2) / 100
    assert qty == 50  # 100 / 2


def test_live_stub_refuses():
    try:
        place_order()
        raise AssertionError("live stub must refuse")
    except LiveDisabledError:
        pass
