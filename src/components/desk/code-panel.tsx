import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

const TREE = `crypto_bot/
  config.yaml
  .env.example
  requirements.txt
  src/
    data/fetcher.py        # ccxt + parquet cache
    data/cleaner.py        # sort, dedupe, gap flag
    features/indicators.py # EMA RSI MACD ATR BB ADX
    features/patterns.py   # pin/engulf/inside/doji
    features/regime.py     # trending / ranging / high_vol
    strategy/base.py
    strategy/trend_pullback.py
    strategy/mean_reversion.py
    risk/sizer.py          # % vốn / ATR
    risk/limits.py         # daily loss, exposure
    backtest/engine.py     # next-bar, fee, funding
    backtest/metrics.py
    report/charts.py       # plotly
    bot/paper.py
    bot/live_stub.py       # cố ý chưa gửi lệnh
  freqtrade/TrendPullback.py
  tests/`;

export function CodePanel() {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl bg-surface p-4 md:p-5">
        <h2 className="font-display text-2xl">Gói Python production</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Cùng 5 lớp với engine đang chạy trên desk (Data / Features / Strategy / Risk / Execution).
          Terminal này chạy TypeScript trên trình duyệt; file Python để bạn paper trên máy local với ccxt.
          Không hard-code API key — dùng biến môi trường.
        </p>
        <div className="mt-4">
          <Button asChild>
            <a href="/vela-crypto-bot.zip" download>
              <Download />
              Tải crypto_bot.zip
            </a>
          </Button>
        </div>
      </section>

      <pre className="overflow-x-auto rounded-xl bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted">
        {TREE}
      </pre>

      <section className="rounded-xl bg-surface p-4">
        <h3 className="font-display text-xl">Cách tối ưu mà không overfit</h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-muted">
          <li>Giữ bộ tham số nhỏ: EMA, RSI band, ATR clamp, volume spike. Đừng lưới 20 tham số trên 3 tháng một coin.</li>
          <li>Chia thời gian: train / test theo lịch sử. Chỉ nhìn test khi chốt rule.</li>
          <li>Walk-forward 3–4 cửa sổ. Bỏ rule nếu Sharpe test đổi dấu giữa các fold.</li>
          <li>Chạy BTC, ETH, SOL cùng một bộ tham số. Nếu chỉ sống trên một cặp — gần như curve-fit.</li>
          <li>Paper tối thiểu vài tuần, gồm tin tức. Rồi mới nghĩ tới live 1x, size nhỏ.</li>
        </ol>
      </section>

      <section className="rounded-xl bg-surface p-4">
        <h3 className="font-display text-xl">Rủi ro vận hành</h3>
        <ul className="mt-3 space-y-2 text-sm text-muted">
          <li>Funding 8h trên USDT-M có thể ăn hết edge của swing chậm.</li>
          <li>Gap cuối tuần / bảo trì sàn: SL có thể trượt xa hơn ATR clamp.</li>
          <li>API ban, rate limit, clock drift — paper loop phải idempotent.</li>
          <li>Sự kiện (CPI, FOMC, unlock): ADX và ATR nhảy, rule high_vol có thể lọc trễ một nến.</li>
          <li>Quá khứ không đảm bảo tương lai. Desk này không phải lời khuyên đầu tư.</li>
        </ul>
      </section>
    </div>
  );
}
