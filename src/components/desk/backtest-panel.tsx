import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EquityChart } from "@/components/desk/equity-chart";
import { useDesk } from "@/lib/quant/store";
import type { Metrics } from "@/lib/quant/types";
import { formatDateUtc, formatNumber, formatPct, formatUsd } from "@/lib/utils";

function Metric({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-lg bg-surface-2 p-3">
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 font-mono text-lg tabular ${warn ? "text-short" : "text-fg"}`}>{value}</p>
    </div>
  );
}

function metricGrid(m: Metrics) {
  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
      <Metric label="CAGR" value={formatPct(m.cagr)} warn={m.cagr < 0} />
      <Metric label="Sharpe" value={formatNumber(m.sharpe, 2)} warn={m.sharpe < 0.8} />
      <Metric label="Sortino" value={formatNumber(m.sortino, 2)} />
      <Metric label="Max DD" value={formatPct(-m.maxDd)} warn={m.maxDd > 0.25} />
      <Metric label="Calmar" value={formatNumber(m.calmar, 2)} />
      <Metric label="Win rate" value={formatPct(m.winRate)} />
      <Metric label="Profit factor" value={formatNumber(m.profitFactor, 2)} />
      <Metric label="Avg R" value={formatNumber(m.avgR, 2)} />
      <Metric label="Expectancy" value={formatUsd(m.expectancy)} />
      <Metric label="Số lệnh" value={String(m.trades)} />
      <Metric label="Exposure" value={formatPct(m.exposure)} />
      <Metric label="Vốn cuối" value={formatUsd(m.endEquity)} />
    </div>
  );
}

export function BacktestPanel() {
  const backtest = useDesk((s) => s.backtest);
  const runBt = useDesk((s) => s.runBt);
  const ltf = useDesk((s) => s.ltf);

  if (ltf.length === 0) {
    return <div className="rounded-xl bg-surface p-6 text-sm text-muted">Tải nến trước khi backtest.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4">
        <div>
          <h2 className="font-display text-2xl">Backtest next-bar</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Tín hiệu đóng nến t, khớp open nến t+1. Đã trừ taker fee, slippage, funding (nếu USDT-M).
            Walk-forward: 70/30 theo thời gian + 3 fold. Không tối ưu trên toàn bộ lịch sử.
          </p>
        </div>
        <Button onClick={runBt}>Chạy backtest</Button>
      </div>

      {!backtest ? (
        <div className="rounded-xl bg-surface p-6 text-sm text-muted">Bấm chạy để mô phỏng trên nến đã tải.</div>
      ) : (
        <>
          <div
            className={`rounded-xl p-4 ${backtest.claimBlocked ? "bg-surface" : "bg-surface"}`}
          >
            <Badge tone={backtest.claimBlocked ? "warn" : "long"}>
              {backtest.claimBlocked ? "Không được claim thắng" : "Ngưỡng tối thiểu đạt"}
            </Badge>
            <p className="mt-2 text-sm text-muted">{backtest.claimReason}</p>
          </div>

          <h3 className="font-display text-xl">Toàn mẫu</h3>
          {metricGrid(backtest.metrics)}

          {backtest.testMetrics ? (
            <>
              <h3 className="font-display text-xl">Out-of-sample (30% cuối)</h3>
              {metricGrid(backtest.testMetrics)}
            </>
          ) : null}

          <h3 className="font-display text-xl">Buy & hold cùng cặp</h3>
          {metricGrid(backtest.buyHold)}

          <EquityChart equity={backtest.equity} buyHold={backtest.buyHoldEquity} />

          {backtest.walkForward.length > 0 ? (
            <div className="rounded-xl bg-surface p-4">
              <h3 className="mb-3 font-display text-xl">Walk-forward folds</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="text-muted">
                    <tr>
                      <th className="pb-2">Test từ</th>
                      <th className="pb-2">Đến</th>
                      <th className="pb-2">Sharpe</th>
                      <th className="pb-2">Max DD</th>
                      <th className="pb-2">Lệnh</th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular">
                    {backtest.walkForward.map((f) => (
                      <tr key={f.testStart} className="border-t border-border">
                        <td className="py-1.5">{formatDateUtc(f.testStart)}</td>
                        <td className="py-1.5">{formatDateUtc(f.testEnd)}</td>
                        <td className="py-1.5">{f.test.sharpe.toFixed(2)}</td>
                        <td className="py-1.5">{formatPct(-f.test.maxDd)}</td>
                        <td className="py-1.5">{f.test.trades}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          <div className="rounded-xl bg-surface p-4">
            <h3 className="mb-3 font-display text-xl">Giai đoạn thua nặng</h3>
            {backtest.losingPeriods.length === 0 ? (
              <p className="text-sm text-muted">Không có đợt DD ≥ 8%.</p>
            ) : (
              <ul className="space-y-3">
                {backtest.losingPeriods.map((p) => (
                  <li key={p.start} className="text-sm">
                    <p className="text-fg">
                      {formatDateUtc(p.start)} → {formatDateUtc(p.end)} · DD {formatPct(-p.drawdown)}
                    </p>
                    <p className="text-muted">{p.note}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="rounded-xl bg-surface p-4">
            <h3 className="mb-3 font-display text-xl">Lệnh gần đây</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[11px]">
                <thead className="text-muted">
                  <tr>
                    <th className="pb-2">Side</th>
                    <th className="pb-2">In</th>
                    <th className="pb-2">Out</th>
                    <th className="pb-2">PnL</th>
                    <th className="pb-2">R</th>
                    <th className="pb-2">Lý do</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular">
                  {backtest.trades.slice(-12).reverse().map((t) => (
                    <tr key={t.id} className="border-t border-border">
                      <td className={t.side === "long" ? "py-1.5 text-long" : "py-1.5 text-short"}>
                        {t.side}
                      </td>
                      <td className="py-1.5">{t.entry.toFixed(2)}</td>
                      <td className="py-1.5">{t.exit.toFixed(2)}</td>
                      <td className={t.pnl >= 0 ? "py-1.5 text-long" : "py-1.5 text-short"}>
                        {formatUsd(t.pnl)}
                      </td>
                      <td className="py-1.5">{t.pnlR.toFixed(2)}</td>
                      <td className="py-1.5 text-muted">{t.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {backtest.dailyHaltDays > 0 ? (
              <p className="mt-2 text-xs text-warn">Số ngày bị daily-loss halt: {backtest.dailyHaltDays}</p>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}
