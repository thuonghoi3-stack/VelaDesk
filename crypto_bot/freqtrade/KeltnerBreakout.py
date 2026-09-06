"""Freqtrade IStrategy: Keltner Channel Breakout — đồng bộ với port VelaDesk.

Nguồn tham khảo khi xây (community research):
- freqtrade templates/sample_strategy.py — qtpylib có keltner_channel() (EMA
  typical price), nhưng để khớp từng con số với backtest của desk, file này
  TỰ TÍNH kênh theo công thức port: mid = EMA(close, 20), band = ±2×ATR(10).
- Mẫu cộng đồng phổ biến: KeltnerBounceV1 (bounce dải dưới, SMA−2.5×ATR25),
  freqtrade issues #10133/#7248 (keltner_length hyperopt / resample 1h),
  #5330 (BB trong Keltner ≈ TTM Squeeze). Breakout breakout-style như dưới
  đây ít gặp hơn — đa số cộng đồng dùng biến thể bounce/reversion.
- Logic entry/exit khớp `src/lib/quant/strategy/library.ts::portKeltner`:
  entry khi close cắt LÊN dải trên (long) / XUỐNG dải dưới (short), gate
  ADX(14) ≥ 20, exit khi close quay lại cắt mid, kèm ATR stop bảo vệ.

Cài đặt & backtest:
    cp KeltnerBreakout.py freqtrade/user_data/strategies/
    freqtrade backtesting -s KeltnerBreakout --timeframe 4h \
        --pairs BTC/USDT:USDT ETH/USDT:USDT SOL/USDT:USDT --timerange 20230101-

Số liệu tham chiếu từ engine VelaDesk (BTC 4h, ~6 năm, sau phí + slippage +
funding): +66,4% · Sharpe 0,91 · PF 2,07 · MaxDD −12,6% (full-sample); danh
mục BTC+ETH+SOL: +349% full / +10,5% OOS. Freqtrade sẽ cho số khác nhẹ do
mô hình fill/fee riêng của nó. Quá khứ không đảm bảo tương lai — paper trước.
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
        """Fallbacks thật (không phải hằng số) để file test được ngoài freqtrade."""

        @staticmethod
        def _wilder(s, timeperiod):
            return s.ewm(alpha=1 / timeperiod, adjust=False, min_periods=timeperiod).mean()

        @staticmethod
        def EMA(df, timeperiod=20):
            return df["close"].ewm(span=timeperiod, adjust=False).mean()

        @staticmethod
        def ATR(df, timeperiod=10):
            prev = df["close"].shift(1)
            tr = pd.concat(
                [df["high"] - df["low"], (df["high"] - prev).abs(), (df["low"] - prev).abs()],
                axis=1,
            ).max(axis=1)
            return ta._wilder(tr, timeperiod)

        @staticmethod
        def ADX(df, timeperiod=14):
            up = df["high"].diff()
            down = -df["low"].diff()
            plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0), index=df.index)
            minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0), index=df.index)
            atr = ta.ATR(df, timeperiod)
            pdi = 100 * ta._wilder(plus_dm, timeperiod) / atr.replace(0, pd.NA)
            mdi = 100 * ta._wilder(minus_dm, timeperiod) / atr.replace(0, pd.NA)
            dx = 100 * (pdi - mdi).abs() / (pdi + mdi).replace(0, pd.NA)
            return ta._wilder(dx, timeperiod)


class KeltnerBreakout(IStrategy):
    """Keltner breakout: EMA20 ± 2×ATR10, gate ADX ≥ 20, exit về mid."""

    INTERFACE_VERSION = 3
    timeframe = "4h"
    # Khung HTF xác nhận xu hướng — cùng quy ước desk (4h cho ltf ≤ 1h).
    informative_timeframe = "1d"
    can_short = True
    process_only_new_candles = True
    startup_candle_count = 400  # đủ warmup cho EMA200 + Wilder ADX

    # Exit theo tín hiệu đảo chiều (đóng về mid) — tắt ROI; stop ATR tự quản.
    minimal_roi = {"0": 100}
    stoploss = -0.20  # khung ngoài; custom_stoploss là ranh giới thật
    use_custom_stoploss = True
    trailing_stop = False

    # --- Inputs (hyperopt được) ---
    kc_ema_len = 20
    kc_atr_len = 10
    kc_mult = 2.0
    adx_min = 20.0
    atr_stop_mult = 2.5  # catastrophic stop ≈ clamp max của engine desk
    htf_ema_len = 50

    def informative_pairs(self):
        if not self.dp:
            return []
        pairs = self.dp.current_whitelist()
        return [(pair, self.informative_timeframe) for pair in pairs]

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        self._last_df = dataframe  # cho standalone/test ngoài freqtrade
        dataframe["kc_mid"] = ta.EMA(dataframe, timeperiod=self.kc_ema_len)
        dataframe["kc_atr"] = ta.ATR(dataframe, timeperiod=self.kc_atr_len)
        dataframe["kc_upper"] = dataframe["kc_mid"] + self.kc_mult * dataframe["kc_atr"]
        dataframe["kc_lower"] = dataframe["kc_mid"] - self.kc_mult * dataframe["kc_atr"]
        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)
        dataframe["ema200"] = ta.EMA(dataframe, timeperiod=200)

        dp = getattr(self, "dp", None)  # chưa được inject khi chạy standalone
        htf = dp.get_pair_dataframe(metadata["pair"], self.informative_timeframe) if dp else None
        if htf is not None and not htf.empty:
            htf["htf_ema"] = ta.EMA(htf, timeperiod=self.htf_ema_len)
            # Chỉ dùng nến HTF ĐÃ ĐÓNG (shift 1) — không look-ahead.
            htf_shift = htf[["date", "htf_ema"]].copy()
            htf_shift["htf_ema"] = htf_shift["htf_ema"].shift(1)
            dataframe = pd.merge_asof(
                dataframe.sort_values("date"),
                htf_shift.sort_values("date"),
                on="date",
                direction="backward",
            )
        else:
            dataframe["htf_ema"] = np.nan
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Regime gate của desk: ADX ≥ 20 + HTF cùng chiều (nến HTF đã đóng).
        htf_long = (dataframe["htf_ema"].isna()) | (dataframe["close"] > dataframe["htf_ema"])
        htf_short = (dataframe["htf_ema"].isna()) | (dataframe["close"] < dataframe["htf_ema"])
        gate_long = (dataframe["adx"] >= self.adx_min) & htf_long
        gate_short = (dataframe["adx"] >= self.adx_min) & htf_short

        dataframe.loc[
            (
                qtpylib_cross_up(dataframe["close"], dataframe["kc_upper"])
                & gate_long
            ),
            "enter_long",
        ] = 1
        dataframe.loc[
            (
                qtpylib_cross_down(dataframe["close"], dataframe["kc_lower"])
                & gate_short
            ),
            "enter_short",
        ] = 1
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        # Signal flip của port: giá quay lại cắt mid (EMA20).
        dataframe.loc[qtpylib_cross_down(dataframe["close"], dataframe["kc_mid"]), "exit_long"] = 1
        dataframe.loc[qtpylib_cross_up(dataframe["close"], dataframe["kc_mid"]), "exit_short"] = 1
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
        # ATR stop bảo vệ: mult × ATR tại nến vào lệnh (gần đúng clamp engine).
        # Freqtrade: dataframe từ DataProvider; standalone: cache populate cuối.
        dataframe = None
        if hasattr(self, "dp") and self.dp is not None:
            dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        if dataframe is None or dataframe.empty:
            dataframe = getattr(self, "_last_df", None)
        if dataframe is None or dataframe.empty:
            return None
        candle = dataframe.iloc[-1]
        atr = candle.get("kc_atr")
        if atr is None or not np.isfinite(atr) or atr <= 0:
            return None
        dist = self.atr_stop_mult * atr
        if dist <= 0:
            return None
        # freqtrade custom_stoploss trả về khoảng cách dạng số dương (ratio).
        return (dist / current_rate) if current_rate > 0 else None


def qtpylib_cross_up(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a > b) & (a.shift(1) <= b.shift(1))


def qtpylib_cross_down(a: pd.Series, b: pd.Series) -> pd.Series:
    return (a < b) & (a.shift(1) >= b.shift(1))
