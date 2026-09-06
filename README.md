# Vela Desk

**Research terminal cho giao dịch crypto theo quy tắc (rule-based)** — chart, phân tích đa khung,
chiến lược Trend Pullback + Momentum Confirm, backtest next-bar có phí/slippage/funding,
walk-forward và paper replay. Kèm gói Python `crypto_bot/` chạy CLI.

> **Quá khứ không đảm bảo tương lai. Paper trade trước khi nghĩ đến live.**
> Đây là công cụ nghiên cứu, không phải lời khuyên đầu tư.

## Kiến trúc

Năm lớp tách bạch, cùng một contract ở cả web (TypeScript) và CLI (Python):

| Layer | Web (`src/lib/quant/`) | Python (`crypto_bot/src/`) |
|---|---|---|
| Data | `data/binance.server.ts` (Binance klines → OKX fallback → synthetic) | `data/fetcher.py` (ccxt + parquet cache) |
| Features | `features/indicators.ts`, `patterns.ts`, `regime.ts`, `confluence.ts` | `features/indicators.py`, `patterns.py`, `regime.py` |
| Strategy | `strategy/trend-pullback.ts`, `mean-reversion.ts` | `strategy/trend_pullback.py`, `mean_reversion.py` |
| Risk | `risk/sizer.ts` (% vốn × ATR stop), `risk/limits.ts` (funding, daily halt) | `risk/sizer.py`, `risk/limits.py` |
| Execution | `backtest/engine.ts` (event-driven, next-bar) + `bot/paper` replay | `backtest/engine.py`, `bot/paper.py` |

UI desk: `src/components/desk/` — 5 tab: **Phân tích** (regime, confluence score, pattern),
**Chiến lược** (rule + giải thích từng điều kiện), **Tester** (Strategy Tester kiểu TradingView),
**Replay** (paper bar-by-bar), **Python** (gói CLI).

### Kho chiến lược port từ TradingView (Pine Script)

Ngoài 2 chiến lược nội bộ (Trend Pullback + Momentum Confirm, Mean Reversion), desk port thêm
**9 chiến lược kinh điển** từ Pine Script — chọn ở dropdown "Chiến lược" (header) hoặc trong tab
**Chiến lược** (có thẻ mô tả rule + nguồn):

| Port | Nguồn | Kiểu |
|---|---|---|
| MACD Strategy | TV built-in (12/26/9, cross MACD ↔ signal) | Trend |
| RSI Strategy | TV built-in (RSI cắt mức 30/70) | Reversion |
| Bollinger Bands Strategy | TV built-in (close cắt vào lại từ ngoài dải) | Reversion |
| Stochastic Strategy | TV built-in (%K cắt %D trong vùng 20/80) | Reversion |
| Supertrend | Cộng đồng (ATR 10, factor 3, lật xu hướng) | Trend |
| EMA Cross | Cổ điển (EMA 20/50, chỉnh được 50/200) | Trend |
| Donchian Turtle Breakout | Hệ thống Turtle (kênh 20 nến trước đó) | Breakout |
| Ichimoku Cloud | 9/26/52 (tenkan/kijun cross + lọc mây, cloud dịch ngược 26 nến — không look-ahead) | Trend |
| Keltner Breakout | EMA20 ± 2×ATR10 | Breakout |
| Connors RSI-2 | Larry Connors (RSI 2 kỳ + lọc EMA200) | Reversion |
| TTM Squeeze | John Carter (BB trong Keltner → bung) | Breakout |
| Parabolic SAR | Wilder (0.02/0.02/0.2, lật SAR) | Trend |
| Heikin Ashi Trend | HA color flip + EMA50 | Trend |
| Fisher Transform | John Ehlers (9, cut trigger) | Trend |
| VWAP Z-Score Fade | VWAP deviation ±2σ (cửa sổ 100) | Reversion |
| Turtle S1 (20/10) | Hệ Turtle gốc — vào kênh 20, thoát kênh đối 10 | Breakout |
| Turtle S2 (55/20) | Hệ Turtle gốc — hệ chậm, vào 55 thoát 20 | Breakout |
| Donchian 55 + EMA200 | Biến thể cộng đồng + lọc EMA200 | Breakout |
| EMA 9/21 Scalper | Kinh điển crypto scalp (cross 9/21) | Trend |
| Stochastic RSI | TV built-in 14/14/3/3 (cross 20/80) | Reversion |
| VWAP Reclaim | Giá đòi lại VWAP phiên | Trend |
| Opening Range Breakout | Range 6 nến đầu ngày UTC | Breakout |
| RSI-7 Momentum | RSI 7 cắt 50 | Trend |
| Time-Series Momentum | Moskowitz–Ooi–Pedersen 2012 (momentum 90 nến) | Trend |
| 52-Week High | George & Hwang 2004 (đỉnh 252 nến) | Trend |
| MA200 Gravity | Mean reversion ±5% quanh SMA200 | Reversion |
| Turn-of-Month | Hiệu ứng lịch cuối tháng (Kaiser 2019) | Reversion |
| Weinstein Stage 2 | Stage Analysis (EMA200 tăng + đỉnh 50 nến) | Trend |

Quy ước port (ghi trong `src/lib/quant/strategy/library.ts`):

1. **Entry 1:1 với Pine** — cùng công thức, cùng điều kiện cross; mỗi port tự tính chuỗi chỉ báo
   của riêng mình từ OHLCV nên có thể so từng dòng với script gốc.
2. **Entry khớp đúng mô hình Pine** (đóng nến t, khớp open t+1) — trùng với next-bar fill của desk.
3. **Exit được điều chỉnh chủ ý**: mọi lệnh do risk engine quản (ATR stop, TP ladder theo R,
   break-even trail, time stop, phí/slippage/funding, size theo % vốn) — vì vậy số liệu sẽ khác
   tester của TradingView, đúng như mong đợi. Nhóm reversion (RSI/BB/Stoch) lấy TP tại giữa
   Bollinger khi có, khớp tinh thần của script gốc.
4. **Exit profile theo họ chiến lược** — điểm khác biệt lớn nhất so với port thô:
   - Nhóm **trend/breakout** (Supertrend, Donchian, MACD, EMA Cross, Ichimoku, Keltner, Squeeze,
     PSAR, HA Trend, Fisher) thoát theo **tín hiệu đảo chiều** của chính nó — đúng cách Pine
     đảo vị thế — với ATR stop chỉ làm bảo hiểm. Không cap TP, không time stop: cap lợi nhuận
     cắt đúng cái đuôi phải mập nuôi sống trend-follower win-rate thấp.
   - Nhóm **reversion** (RSI, BB, Stochastic, RSI-2, VWAP fade) giữ TP ladder theo R + time stop.
5. **Regime gate ADX** (bật mặc định, tắt được trong Tester → Inputs): signal của port bị chặn
   nếu ngược regime — trend/breakout cần ADX ≥ 20, reversion cần ADX < 20 — đúng kỷ luật hai
   chiến lược nội bộ dùng, ngưỡng 20/25 có sẵn trong classifier (không phải tham số tune).
6. **Khung thời gian là một phần của chiến lược**: chạy thực nghiệm trên Binance thật (BTC 3–6
   năm, sau phí) cho thấy hầu hết port thua trên 1h vì chi phí + nhiễu, nhưng nhóm trend
   sinh lời rõ trên **4h** — dùng `node scripts/compare-library.mjs [symbol] [ltf]` để tái lập
   bảng so sánh toàn kho ở bất kỳ khung nào.
7. Đổi chiến lược = chạy lại toàn desk (chart, tester, screener) — signal pass chạy lại trên nến
   đã enrich, trong vài ms. Mỗi port có unit test: phải sinh signal + lệnh đóng trên dữ liệu
   synthetic, không rò signal của strategy khác, và nhóm SIGNAL_EXIT không bao giờ thoát qua
   TP/time stop.
8. **Nhóm scalping (5m/15m) đi kèm cảnh báo chi phí thực nghiệm**: EMA 9/21, StochRSI,
   VWAP Reclaim, ORB, RSI-7 đều đúng entry kinh điển nhưng **âm sau chi phí** trên Binance thật
   (vd. RSI-7 trên 5m: 3.173 lệnh, taker round-trip ~0,12% ăn sạch edge → −87%). Scalp kiếm
   được tiền cần maker fee (limit entry), fee tier thấp, hoặc lọc tín hiệu gắt — hãy dùng
   `compare-library.mjs` để tự kiểm chứng trước khi tin bất kỳ con số nào.
   E0V1E có **dip chuẩn hóa ATR**: ngưỡng đo bằng số lần ATR(14) giá nằm dưới
   EMA8/EMA16/SMA15 (mặc định 2.0/3.0/3.5 — đúng mức p99.5 thực đo trên BTC/ETH/SOL 5m), nhờ
   vậy cùng một ngưỡng cho tần suất tín hiệu tương đương trên mọi coin — BTC 5m: 950 signal,
   ETH 904, SOL 934 (trước khi chuẩn hóa: BTC = 0 vì % dip cố định dành cho altcoin vol cao).
9. **Nhóm "chất lượng" (literature-backed, khung 1d/4h)** — BTC thật, sau chi phí:
   Weinstein S2 **+156%** (4h, Sharpe 1.04, PF 2.77) · High 52w +97% (PF 3.22) ·
   **TSM +31,6% với OOS +11,9% (Sharpe 0,63)** — một trong số ít chiến lược có OOS dương;
   MA200 Gravity OOS +8,6%. Trên 1d: TSM PF 5.07, Weinstein S2 PF 6.42. Đây là nhóm
   được thiết kế cho khung cao + ít lệnh — đúng điều kiện edge sống sót qua chi phí.
10. **Biến thể Turtle có exit kênh riêng**: S1 (20/10) và S2 (55/20) thoát khi **close thủng kênh
   đối diện** (N=10/20) — exit gốc trong sách, engine xử lý bằng `exitChannelBars`, không phải
   signal flip. Nghiên cứu thực nghiệm (`node scripts/turtle-research.mjs`) cho thấy không có
   biến thể nào thắng mọi symbol: BTC 4h mở 20 signal-flip tốt nhất (+99% full-sample), ETH 4h
   nhường cho Donchian 55+EMA200 (OOS dương), BTC 1d là S1 (PF 3.38, OOS dương) — hãy tự chạy
   bảng này trước khi chọn.

### Strategy Tester (mô hình TradingView)

Tab **Tester** trong Desk dựng theo mô hình Strategy Tester của TradingView:

- **Inputs & Properties** (dialog): mọi tham số strategy/exit-ladder/stop và vốn, risk, phí,
  slippage, funding, daily-loss cap đều chỉnh được — bấm Áp dụng là chạy lại backtest tức thì
  trên cùng dữ liệu (không refetch). Tham số tầng tín hiệu (volume spike, ngưỡng RSI/ADX của
  mean reversion) tự chạy lại signal pass trên nến đã enrich (`applySignals`).
- **Tổng quan**: thẻ số lớn (Net profit, Max DD, PF, trades), metrics đầy đủ cho toàn mẫu /
  out-of-sample 30% / buy & hold, equity curve, **đóng góp theo từng chiến lược** (win rate,
  avg R, MFE/MAE trung bình), walk-forward folds, giai đoạn thua nặng kèm regime.
- **Danh sách lệnh**: từng lệnh với PnL, R, **MFE/MAE (R)**, lý do thoát, cumulative PnL.
- **Tối ưu**: grid search tối đa 36 tổ hợp trên ≤ 2 trục tham số (TP1/TP2 R, break-even,
  TP1 close %, stop ATR bounds, time stop, risk) — mỗi combo chỉ chấm điểm trên **train 70%**,
  combo tốt nhất mới được mặt trên **test 30%** kèm control (tham số mặc định) để so sánh
  overfit; objective chọn được (Sharpe/Calmar/Expectancy/PF) và guard số lệnh tối thiểu.
- **Monte Carlo**: bootstrap 500 đường vốn từ các lệnh đã thực hiện (seed cố định) —
  phân vị Max DD p5/p50/p95, P(DD ≥ 25%/50%), phân phối final equity ×, histogram DD.
- **Khoảng ngày backtest** (Từ/Đến) ngay trên header — chạy lại tester trên cửa sổ bất kỳ của
  mẫu sâu, không cần tải lại dữ liệu.
- **Tab Hiệu suất** (Performance Summary): breakdown **Long vs Short**, đóng góp theo chiến
  lược, tổng phí + funding đã trả, histogram phân bố PnL (R) và thời gian giữ lệnh.
- **Tối ưu**: heatmap 2 trục màu theo objective (bấm ô để áp dụng combo), **walk-forward
  efficiency** (test/train — < 0.3 nghi overfit), objective thêm Sortino và "DD thấp nhất",
  Sortino trong bảng combo. Hỗ trợ quét **tham số tầng tín hiệu** của port (KC EMA/ATR/×,
  ADX gate, Donchian N, Supertrend ×, Stoch, EMA cross…) — mỗi combo re-signal trước khi
  backtest. Ví dụ đã chạy: Keltner breakout trên BTC 4h, 36 combo (KC× × KC EMA × ADX gate) —
  combo thắng train (Sharpe 1,28) **thua control trên test** (−4,8% vs +4,1%, WFE −0,27) →
  mặc định KC×2/EMA20/ADX20 vẫn là lựa chọn đúng, gate chặn đúng claim overfit.
- **Tab So sánh kho**: chạy cả 12 lựa chọn (tổ hợp + nội bộ + 9 port) cùng mẫu, cùng engine,
  xếp theo Sharpe — full-sample, đối chiếu tương đối.
- **Danh sách lệnh**: xuất CSV đầy đủ (PnL, R, MFE/MAE, phí, funding, lý do thoát).
- **Tab Danh mục**: backtest đa symbol trên **một vốn chung** — chọn symbol từ 14 hợp đồng,
  giới hạn số vị thế mở đồng thời (`maxPositions`), daily-loss cap chặn vào lệnh mới trên toàn
  danh mục, mỗi vị thế vẫn size theo % vốn chung và cap notional riêng. Kết quả: metrics toàn
  mẫu + OOS (đo trong cửa sổ, không cộng dồn từ đầu kỳ), buy & hold đều trọng số, bảng
  per-symbol, số vị thế mở lớn nhất từng đạt. Engine danh mục có **test tương đương**: chạy với
  1 symbol phải cho từng lệnh và đường vốn trùng khít engine đơn.``
- Equity curve có **vùng drawdown** bên dưới.
- Gate tuyên bố vẫn nằm trên đầu tab: Sharpe test ≥ 0.8, Max DD ≤ 25%, ≥ 20 lệnh.
- **Deep backtesting**: desk tải sâu theo khung — 15m ≈ 1 năm, 1h ≈ 3 năm (26.280 nến),
  4h ≈ 6 năm, 1d ≈ toàn bộ lịch sử futures. Klines fetch theo trang song song (mỗi trang
  là một cửa sổ startTime biết trước) nên mẫu 3 năm tải trong ~15–20s; header Tester
  luôn hiển thị khoảng thời gian mẫu để không ai nhầm sample ngắn với sample dài.

Engine + lab là hàm thuần (`backtest/lab.ts`) — có unit test cho grid (cap tổ hợp, chọn best
train, test/control) và Monte Carlo (deterministic theo seed, phân vị đúng thứ tự).

### Terminal kiểu TradingView

Ba trang dùng chung thanh điều hướng:

- **`/chart`** — workspace biểu đồ toàn màn hình theo mô hình TradingView:
  - **Thư viện chỉ báo** (nút f(x)): tìm kiếm + bật/tắt 14 chỉ báo — overlay (EMA, Bollinger,
    VWAP theo ngày UTC, Supertrend 2 màu, Donchian, Ichimoku có mây dịch ngược không
    look-ahead, Keltner) và pane riêng (Volume, RSI, MACD, Stochastic, ADX, OBV, ATR).
  - **Bar Replay** (phím R): ẩn các nến sau một mốc, bước từng nến hoặc tự chạy — luyện đọc
    chart/backtest tâm thế "không biết tương lai".
  - 5 loại chart: Nến / Heikin Ashi / Line / Area / **Baseline**.
  - **Alert 6 điều kiện**: giá ≥/≤, RSI ≥/≤, 24h ±% (chọn loại trong panel; click chart đặt
    alert giá nhanh). Persist localStorage, evaluated mỗi lần giá poll hoặc nến mới đóng.
  - **Công cụ vẽ** kiểu TV: đường ngang, trendline (2 điểm), **Fibonacci retracement**
    (0/0.236/…/1 với nhãn giá), eraser xóa theo vị trí bấm, clear-all — lưu theo symbol + khung
    trong localStorage, vẽ lại đúng vị trí khi đổi khung/zoom (SVG overlay map qua
    priceToCoordinate/timeToCoordinate).
  - **Tìm symbol toàn sàn** (nút symbol hoặc phím `/`): ~500 hợp đồng USDT-M perpetual từ
    exchangeInfo, lọc tức thì.
  - Phím tắt: 1–8 đổi khung (5m → 1W) · A alert · R replay · / tìm symbol.
  - Khung mở rộng: **5m · 15m · 30m · 1h · 2h · 4h · 1D · 1W**.
  - Snapshot chart **PNG thật** (chart.takeScreenshot) tải về máy.
  - Bộ chỉ báo bật/tắt **persist localStorage** giữa các phiên.
  - Watchlist 14 hợp đồng USDT-M (ticker 24h + sparkline, poll 20s); crosshair legend OHLCV;
    mũi tên signal từ engine; deep data theo khung (1h ≈ 3 năm).
- **`/screener`** — quét 14 symbol bằng **cùng pipeline với chart** (indicators → regime →
  patterns → strategies, HTF 4h): bảng sortable với giá, đổi 24 nến, ADX, RSI, ATR%, confluence,
  HTF bias, tín hiệu chờ; filter theo regime/chỉ hiển thị có signal; click symbol mở `/chart`
  với đúng symbol + khung (deep-link qua search params `?symbol=&tf=`).
- **`/` (Desk)** — nghiên cứu sâu một cặp: phân tích, giải thích rule, backtest, replay, Python.


## Web app

```bash
npm install
npm run dev        # http://localhost:8080
npm test           # unit tests (scripts + quant + auth)
npm run typecheck
npm run build      # production build (vercel/nitro output)
npm run lint
```

- Stack: TanStack Start (React 19, SSR) + Tailwind v4 + lightweight-charts + zustand.
- Dữ liệu: Binance public klines (USDT-M futures hoặc spot), fallback OKX, cuối cùng là
  nến mô phỏng regime-switching (được gắn nhãn rõ, không bao giờ là giá thật).
- Không cần API key để chạy. Không có key nào được hard-code; env chỉ qua platform.

## Backtest contract (cả hai engine)

- Tín hiệu tính từ close `t` → khớp **open `t+1`** (next-bar, không look-ahead).
- Stop và TP cùng chạm trong 1 nến → **stop khớp trước** (bảo thủ). Nến vào lệnh đã
  xuyên stop → hủy lệnh.
- Chi phí: taker fee mỗi khớp, slippage bps bất lợi mỗi khớp, funding 8h (chỉ USDT-M,
  được ghi nhận từng lệnh).
- Risk: size theo `% vốn / khoảng cách stop`, cap notional theo exposure × leverage,
  daily loss cap đối chiếu vốn đầu ngày.
- Walk-forward: 3 fold (50/65/80% train) + split 70/30. Gate tuyên bố: test Sharpe ≥ 0.8,
  Max DD ≤ 25%, đủ ≥ 20 lệnh — nếu không, app tự chặn câu "chiến lược thắng".

## Gói Python (crypto_bot/)

```bash
cd crypto_bot
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                 # không cần key cho public klines
python -m src.cli analyze --symbol BTC/USDT
python -m src.cli backtest --symbol BTC/USDT
python -m src.cli paper --symbol BTC/USDT --loop --interval 60
pytest
```

Chi tiết: [crypto_bot/README.md](crypto_bot/README.md).

## Tối ưu tham số mà không overfit (nguyên tắc)

1. Chỉ chỉnh ≤ 2–3 tham số mỗi lần; mọi thay đổi phải qua **cả hai** cửa sổ train và test.
2. Quyết định trên **out-of-sample** (30% cuối) — mẫu in-sample chỉ để đọc hành vi.
3. Ưu tiên tham số "tròn" (20/50/200, 1.5R/2.5R) thay vì tối vi mô kiểu 0.83R.
4. Chỉ tin kết quả khi sample trải qua nhiều regime (bull/bear/range); 3 tháng một coin chưa đủ.

## Rủi ro cần biết

- **Quá khứ ≠ tương lai** — mọi metrics chỉ mô tả sample đã chạy.
- Funding thật biến động theo thời gian; engine dùng mức phẳng từ config.
- Gap cuối tuần / gap phiên: lệnh có thể khớp lệch hơn mô phỏng next-bar.
- API public có thể bị rate-limit/block IP máy chủ; app fallback OKX rồi synthetic (có nhãn).
- Sự kiện vĩ mô (CPI, FOMC…) làm ATR cực đoan — chiến lược chính có veto ATR, không phải lá chắn tuyệt đối.
- Slippage thực tế lúc thanh khoản mỏng thường xấu hơn 2 bps mặc định.

## Ghi chú triển khai

- Repo này xuất từ Grok App Builder: `AGENTS.md`, `.grok/`, `scripts/grok-pwa-*`, `server/`,
  `public/__grok/` là chrome của nền tảng — giữ nguyên khi sửa app.
- Deploy: Vercel (nitro output). `startup.sh` là điểm khởi động lại của sandbox Grok.
