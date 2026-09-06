"""Freqtrade IStrategy: Weinstein Stage 2 — futures, đòn bẩy 2×.

Đồng bộ 1:1 với port `weinstein_s2` của VelaDesk
(`src/lib/quant/strategy/library.ts::portWeinsteinS2`):

- Stage 2 (LONG):  EMA200 ĐANG TĂNG (so với 10 nến trước) + close > EMA200
                   + close lập đỉnh mới 50 nến (rolling max, tính gồm nến hiện tại).
- Stage 4 (SHORT): EMA200 ĐANG GIẢM + close < EMA200 + close lập đáy mới 50 nến.
- Exit: signal flip — điều kiện entry chiều đối lập = exit (đúng SIGNAL_EXIT
  của desk). Không ROI, không trailing.
- Stop bảo vệ: 2.5 × ATR(14) tại nến gần nhất (custom_stoploss) — xấp xỉ
  clamp ATR của engine desk.

Cấu hình futures 2×: trong config.freqtrade đặt
    "trading_mode": "futures",
    "margin_mode": "isolated",
strategy tự khai báo trading_mode/margin_mode + leverage() trả về 2.0.

Lưu ý rủi ro: 2× nhân đôi LÃN lẫn LỖ; với stop khung -20%, thanh khoản
cách ly (isolated) giúp hạn chế nhưng vẫn có thể bị thanh lý khigap lớn.
Backtest tham chiếu từ engine VelaDesk (BTC 4h, ~6 năm, sau phí):
+156% · Sharpe 1.04 · PF 2.77 · MaxDD −17.4% — Freqtrade sẽ cho số lệch nhẹ
do mô hình fill/fee riêng. Quá khứ không đảm bảo tương lai — paper trước.

Cài đặt & backtest:
    cp WeinsteinS2.py freqtrade/user_data/strategies/
    freqtrade backtesting -s WeinsteinS2 --timeframe 4h \
        --trading-mode futures --pairs BTC/USDT:USDT ETH/USDT:USDT SOL/USDT:USDT
"""

from __future__ import annotations

import numpy as np
import pandas as pd
from pandas import DataFrame

try:
    from freqtrade.strategy import IStrategy
    import talib.abstract as ta
except ImportError:  # freqtrade là dependency tuỳ chọn — fallback thuần pandas
    class IStrategy:  # type: ignore
        INTERFACE_VERSION = 3
        timeframe = "4h"
        can_short = True
        startup_candle_count = 400

        def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
            return dataframe

        def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
            dataframe["enter_long"] = 0
            dataframe["enter_short"] = 0
            return dataframe

        def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
            dataframe["exit_long"] = 0
            dataframe["exit_short"] = 0
            return dataframe

    class ta:  # type: ignore
        """Fallbacks thật để file test được ngoài freqtrade (không phải hằng số)."""

        @staticmethod
        def EMA(df, timeperiod=200):
            return df["close"].ewm(span=timeperiod, adjust=False).mean()

        @staticmethod
        def ATR(df, timeperiod=14):
            prev = df["close"].shift(1)
            tr = pd.concat(
                [df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()],
                axis=1,
            ).max(axis=1)
            return tr.ewm(alpha=1 / timeperiod, adjust=False, min_periods=timeperiod).mean()


class WeinsteinS2(IStrategy):
    """Stage 2 breakout — trend-following, ít lệnh, giữ đuôi dài."""

    INTERFACE_VERSION = 3
    timeframe = "4h"
    can_short = True
    process_only_new_candles = True
    startup_candle_count = 400  # EMA200 + slope 10 nến

    # Futures 2× (cần config futures + isolated).
    trading_mode = "futures"
    margin_mode = "isolated"

    # Exit theo signal flip — tắt ROI/trailing.
    minimal_roi = {"0": 100}
    stoploss = -0.35  # khung ngoài; custom_stoploss là ranh giới thật (2.5×ATR)
    use_custom_stoploss = True
    trailing_stop = False

    # --- Inputs (hyperopt được) ---
    slope_lookback = 10  # "đang tăng/giảm" so với N nến trước
    high_lookback = 50  # đỉnh/đáy mới trên N nến close
    atr_stop_mult = 2.5

    @property
    def protections(self):
        return [
            {
                "method": "CooldownPeriod",
                "stop_duration_candles": 2,
            },
            {
                "method": "MaxDrawdown",
                "lookback_period_candles": 720,  # ~120 ngày trên 4h
                "trade_limit": 4,
                "stop_duration_candles": 24,
                "max_allowed_drawdown": 0.20,
            },
            {
                "method": "StoplossGuard",
                "lookback_period_candles": 144,  # ~24 ngày
                "trade_limit": 3,
                "stop_duration_candles": 18,
                "only_per_pair": True,
            },
        ]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        self._last_df = dataframe  # cho standalone/test ngoài freqtrade
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)
        dataframe["ema200_prev"] = dataframe["ema200"].shift(self.slope_lookback)
        # Đỉnh/đáy đóng cửa 50 nến — ROLLING (gồm nến hiện tại) như port desk.
        dataframe["hh50"] = dataframe["close"].rolling(self.high_lookback).max()
        dataframe["ll50"] = dataframe["close"].rolling(self.high_lookback).min()
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        rising = dataframe["ema200"] > dataframe["ema200_prev"]
        falling = dataframe["ema200"] < dataframe["ema200_prev"]
        above = dataframe["close"] > dataframe["ema200"]
        below = dataframe["close"] < dataframe["ema200"]
        new_high = dataframe["close"] >= dataframe["hh50"]
        new_low = dataframe["close"] <= dataframe["ll50"]

        dataframe.loc[rising & above & new_high, "enter_long"] = 1
        dataframe.loc[falling & below & new_low, "enter_short"] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # SIGNAL_EXIT: entry chiều đối lập (stage flip) chính là exit.
        rising = dataframe["ema200"] > dataframe["ema200_prev"]
        falling = dataframe["ema200"] < dataframe["ema200_prev"]
        above = dataframe["close"] > dataframe["ema200"]
        below = dataframe["close"] < dataframe["ema200"]
        new_high = dataframe["close"] >= dataframe["hh50"]
        new_low = dataframe["close"] <= dataframe["ll50"]

        # Short-entry điều kiện = exit_long; long-entry điều kiện = exit_short.
        dataframe.loc[falling & below & new_low, "exit_long"] = 1
        dataframe.loc[rising & above & new_high, "exit_short"] = 1
        return dataframe

    def custom_stoploss(
        self,
        pair: str,
        trade,
        current_time,
        current_rate: float,
        current_profit: float,
        after_fill: bool,
        **kwargs,
    ) -> float | None:
        # ATR stop bảo vệ: 2.5 × ATR(14) tại nến gần nhất (xấp xỉ clamp engine).
        # Freqtrade: dataframe từ DataProvider; standalone: cache populate cuối.
        dataframe = None
        if hasattr(self, "dp") and self.dp is not None:
            dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        if dataframe is None or dataframe.empty:
            dataframe = getattr(self, "_last_df", None)
        if dataframe is None or dataframe.empty:
            return None
        atr = dataframe.iloc[-1].get("atr")
        if atr is None or not np.isfinite(atr) or atr <= 0:
            return None
        dist = self.atr_stop_mult * atr
        if dist <= 0 or current_rate <= 0:
            return None
        return dist / current_rate

    def leverage(
        self,
        pair: str,
        current_time,
        current_rate: float,
        proposed_leverage: float,
        max_leverage: float,
        entry_tag: str | None,
        side: str,
        **kwargs,
    ) -> float:
        # "future x2": đòn bẩy 2× cách ly. Lệnh vẫn theo risk % vốn trong stake
        # (taker fee + slippage được nhân 2 theo đòn bẩy trên phần ký quỹ).
        return min(2.0, max_leverage)
