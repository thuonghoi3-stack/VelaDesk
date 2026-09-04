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
| Leverage | 1–3× cap, 25% max notional |
| Side | long + short |
| Fill | next-bar open + taker fee + slippage + funding |

Primary strategy: **Trend Pullback + Momentum Confirm**. Secondary: **mean reversion** only when HTF is ranging.

## Run

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # keys optional for public klines
python -m src.cli analyze --symbol BTC/USDT
python -m src.cli backtest --symbol BTC/USDT
python -m src.cli paper --symbol BTC/USDT
pytest
```

If the exchange is unreachable the fetcher writes **synthetic** regime-switching candles and tags `synthetic=True`.

## Backtest contract

- Signal at close `t`, fill at open `t+1` (no same-bar lookahead).
- HTF features from the last **closed** HTF bar only.
- Walk-forward / 70-30 time split. Do not grid-search 20 parameters on 3 months of one coin.
- If test Sharpe < 0.8 or Max DD > 25%, **do not claim the strategy wins**.

## Freqtrade

`freqtrade/TrendPullback.py` is a drop-in `IStrategy` sketch of the same rules. Use it for research, not as proof of edge.

## Live

`src/bot/live_stub.py` refuses to place orders. Enable live only after paper, a kill-switch, and keys that cannot withdraw.
