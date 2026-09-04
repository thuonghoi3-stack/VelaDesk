"""Freqtrade IStrategy wrapping Trend Pullback + Momentum Confirm.

Copy into user_data/strategies/. Does not enable live trading by itself.
Past performance does not guarantee future results.
"""

from __future__ import annotations

from pandas import DataFrame

try:
    from freqtrade.strategy import IStrategy
    import talib.abstract as ta
except ImportError:  # freqtrade is optional
    class IStrategy:  # type: ignore
        INTERFACE_VERSION = 3
        timeframe = "1h"
        can_short = True
        startup_candle_count = 220

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
        @staticmethod
        def EMA(df, timeperiod=20):
            return df["close"].ewm(span=timeperiod, adjust=False).mean()

        @staticmethod
        def RSI(df, timeperiod=14):
            return df["close"] * 0 + 50

        @staticmethod
        def ATR(df, timeperiod=14):
            return (df["high"] - df["low"]).rolling(timeperiod).mean()

        @staticmethod
        def MACD(df, fastperiod=12, slowperiod=26, signalperiod=9):
            macd = df["close"].ewm(span=fastperiod, adjust=False).mean() - df["close"].ewm(span=slowperiod, adjust=False).mean()
            return {"macd": macd, "macdsignal": macd.ewm(span=signalperiod, adjust=False).mean()}

        @staticmethod
        def ADX(df, timeperiod=14):
            return df["close"] * 0 + 20


class TrendPullback(IStrategy):
    INTERFACE_VERSION = 3
    timeframe = "1h"
    can_short = True
    startup_candle_count = 220
    stoploss = -0.04
    trailing_stop = True
    trailing_stop_positive = 0.01
    trailing_stop_positive_offset = 0.02
    trailing_only_offset_is_reached = True
    minimal_roi = {"0": 0.04, "24": 0.02, "48": 0}

    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["ema20"] = ta.EMA(dataframe, timeperiod=20)
        dataframe["ema50"] = ta.EMA(dataframe, timeperiod=50)
        dataframe["rsi"] = ta.RSI(dataframe, timeperiod=14)
        dataframe["atr"] = ta.ATR(dataframe, timeperiod=14)
        macd = ta.MACD(dataframe)
        dataframe["macd"] = macd["macd"]
        dataframe["macdsignal"] = macd["macdsignal"]
        dataframe["macdhist"] = dataframe["macd"] - dataframe["macdsignal"]
        dataframe["adx"] = ta.ADX(dataframe, timeperiod=14)
        dataframe["vol_sma"] = dataframe["volume"].rolling(20).mean()
        return dataframe

    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["enter_long"] = (
            (dataframe["close"] > dataframe["ema50"])
            & (dataframe["adx"] >= 20)
            & (dataframe["low"] <= dataframe["ema20"] * 1.003)
            & (dataframe["rsi"] > dataframe["rsi"].shift(1))
            & (dataframe["macdhist"] > 0)
            & (dataframe["volume"] >= 1.2 * dataframe["vol_sma"])
            & (dataframe["close"] > dataframe["open"])
        ).astype(int)
        dataframe["enter_short"] = (
            (dataframe["close"] < dataframe["ema50"])
            & (dataframe["adx"] >= 20)
            & (dataframe["high"] >= dataframe["ema20"] * 0.997)
            & (dataframe["rsi"] < dataframe["rsi"].shift(1))
            & (dataframe["macdhist"] < 0)
            & (dataframe["volume"] >= 1.2 * dataframe["vol_sma"])
            & (dataframe["close"] < dataframe["open"])
        ).astype(int)
        return dataframe

    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        dataframe["exit_long"] = ((dataframe["close"] < dataframe["ema20"]) & (dataframe["macdhist"] < 0)).astype(int)
        dataframe["exit_short"] = ((dataframe["close"] > dataframe["ema20"]) & (dataframe["macdhist"] > 0)).astype(int)
        return dataframe
