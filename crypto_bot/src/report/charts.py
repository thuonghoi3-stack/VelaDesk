"""Plotly HTML report: candles + EMA + BB + RSI + MACD + volume + equity."""

from __future__ import annotations

from pathlib import Path

import pandas as pd


def write_html_report(df: pd.DataFrame, equity: pd.Series | None, path: str | Path) -> Path:
    try:
        import plotly.graph_objects as go
        from plotly.subplots import make_subplots
    except ImportError as exc:  # pragma: no cover
        raise RuntimeError("plotly is required for HTML reports") from exc

    fig = make_subplots(
        rows=4,
        cols=1,
        shared_xaxes=True,
        row_heights=[0.45, 0.2, 0.15, 0.2],
        vertical_spacing=0.03,
        subplot_titles=("OHLC", "Volume / RSI", "MACD", "Equity"),
    )
    fig.add_trace(
        go.Candlestick(x=df.index, open=df["open"], high=df["high"], low=df["low"], close=df["close"], name="OHLC"),
        row=1,
        col=1,
    )
    for col, name in (("ema20", "EMA20"), ("ema50", "EMA50"), ("bb_upper", "BB"), ("bb_lower", "BB")):
        if col in df.columns:
            fig.add_trace(go.Scatter(x=df.index, y=df[col], name=name, line=dict(width=1)), row=1, col=1)
    fig.add_trace(go.Bar(x=df.index, y=df["volume"], name="Vol", marker_color="#7a8799"), row=2, col=1)
    if "rsi" in df.columns:
        fig.add_trace(go.Scatter(x=df.index, y=df["rsi"], name="RSI"), row=2, col=1)
    if "macd_hist" in df.columns:
        fig.add_trace(go.Bar(x=df.index, y=df["macd_hist"], name="MACD hist"), row=3, col=1)
    if equity is not None and len(equity):
        fig.add_trace(go.Scatter(x=equity.index, y=equity.values, name="Equity"), row=4, col=1)
    fig.update_layout(template="plotly_dark", height=900, xaxis_rangeslider_visible=False, title="Vela Desk report")
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.write_html(path)
    return path
