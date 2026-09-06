# Vela crypto_bot

Rule-based crypto research stack. Five layers: **Data / Features / Strategy / Risk / Execution**.

**Quá khứ không đảm bảo tương lai. Paper trade trước live. Không phải lời khuyên đầu tư.**

## Default desk

| | |
|---|---|
| Venue | Binance USDT-M (Bybit compatible via ccxt) |
| Symbols | BTC/USDT, ETH/USDT, SOL/USDT |
| LTF / HTF | 1h / 4h (15m or 4h swing in config) |
| Equity | 10_000 USDT |
| Risk | 0.5%–1% per trade, ATR-clamped stop |
| Leverage | `max_leverage` in config (default 2×, keep ≤ 3×), 25% max notional |
| Side | long + short (`side: both`) |
| Fill | next-bar open + taker fee + slippage + funding |

Primary strategy: **Trend Pullback + Momentum Confirm**. Secondary: **mean reversion** only when HTF is ranging.

## Run

```bash
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env   # keys optional for public klines; .env is loaded by src/cli.py
python -m src.cli analyze --symbol BTC/USDT
python -m src.cli backtest --symbol BTC/USDT
python -m src.cli paper --symbol BTC/USDT            # one snapshot
python -m src.cli paper --symbol BTC/USDT --loop --interval 60
pytest
```

If the exchange is unreachable the fetcher returns **synthetic** regime-switching candles tagged
`synthetic=True`. Synthetic bars are deterministic per symbol/timeframe and are **never written to
the parquet cache** — a network outage cannot poison later runs. Real caches refresh incrementally
(paper loop passes `max_age_s`), so new bars actually reach the signals.

## Backtest contract

- Signal at close `t`, fill at open `t+1` (no same-bar lookahead).
- HTF features from the last **closed** HTF bar only.
- Stop vs take-profit in the same bar: the **stop** fills first (pessimistic). A fill bar that
  already pierces the planned stop vetoes the entry.
- Walk-forward: 3 expanding folds (50/65/80% train, 15% test) **plus** the 70-30 time split.
  Do not grid-search 20 parameters on 3 months of one coin.
- If test Sharpe < 0.8 or Max DD > 25%, **do not claim the strategy wins** — the CLI prints the
  gate verdict and the metrics honestly either way.

## Freqtrade

`freqtrade/TrendPullback.py` is a drop-in `IStrategy` sketch of the same rules. Outside freqtrade
its TA-Lib calls fall back to real pure-pandas formulas (Wilder RSI/ADX), so the file is testable
standalone. Use it for research, not as proof of edge.

`freqtrade/KeltnerBreakout.py` — Keltner Channel Breakout (EMA20 ± 2×ATR10, gate ADX ≥ 20 +
HTF EMA filter trên nến đã đóng, exit về mid, custom ATR stop). Cộng đồng freqtrade không có
Keltner breakout built-in (chỉ `qtpylib.keltner_channel` trong template; các mẫu phổ biến là
biến thể bounce/hyperopt) — file này tính kênh thủ công để khớp từng con số với port
`keltner` của desk. Backtest:
`freqtrade backtesting -s KeltnerBreakout --timeframe 4h --pairs BTC/USDT:USDT ETH/USDT:USDT SOL/USDT:USDT`.

## Live

`src/bot/live_stub.py` refuses to place orders. Enable live only after paper, a kill-switch, and keys that cannot withdraw.
