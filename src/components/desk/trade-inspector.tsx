import { useMemo, useState } from "react";
import { Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDesk } from "@/lib/quant/store";
import type { Trade } from "@/lib/quant/types";
import { CandleChart } from "@/components/desk/candle-chart";
import { focusTrade, type TradeRunSnapshot } from "@/lib/quant/trade-focus";
import {
  inspectTrades,
  type TradeFilters,
  type TradeSort,
  type TradeSummary,
} from "@/lib/quant/trade-inspector";
import { formatNumber, formatUsd } from "@/lib/utils";

const INITIAL_FILTERS: TradeFilters = { side: "all", reason: "all", search: "" };
const REASONS: Record<string, string> = {
  stop: "Dừng lỗ / hòa vốn",
  tp1: "Chốt lời TP1",
  tp2: "Chốt lời TP2",
  time_stop: "Hết thời gian",
  signal_flip: "Đảo tín hiệu",
  channel_exit: "Thoát kênh",
  ema_macd_exit: "Thoát EMA / MACD",
  end_of_data: "Hết dữ liệu",
};
const control =
  "h-11 w-full min-w-0 rounded-lg border border-border bg-surface-2 px-3 text-sm text-fg focus-visible:outline-2 focus-visible:outline-accent";

function GroupSummary({
  label,
  group,
  testId,
}: {
  label: string;
  group: TradeSummary;
  testId: string;
}) {
  return (
    <section
      data-testid={`trade-summary-${testId}`}
      className="min-w-0 rounded-xl border border-border bg-surface-2 p-4"
    >
      <h4 className="text-xs font-medium text-muted">{label}</h4>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-3">
        <p className="font-mono text-2xl tabular">
          <span data-testid={`trade-${testId}-count`}>{group.count}</span>{" "}
          <span className="font-sans text-xs text-muted">nhánh thoát</span>
        </p>
        <p
          data-testid={`trade-${testId}-pnl`}
          className={`font-mono text-lg tabular ${group.pnl < 0 ? "text-short" : "text-long"}`}
        >
          {formatUsd(group.pnl)}
        </p>
      </div>
      <p className="mt-2 text-xs text-muted">
        EV / nhánh:{" "}
        <span data-testid={`trade-${testId}-ev`} className="font-mono text-fg">
          {group.ev == null ? "—" : formatUsd(group.ev)}
        </span>{" "}
        · PnL trade-log
      </p>
    </section>
  );
}

export function TradeInspector({
  trades,
  run,
  onReplay,
}: {
  trades: readonly Trade[];
  run?: TradeRunSnapshot | null;
  onReplay?: () => void;
}) {
  const startTradeReplay = useDesk((s) => s.startTradeReplay);
  const verifiedRun = run?.result.trades === trades ? run : null;
  const source = verifiedRun?.source;
  const [focusRequest, setFocusRequest] = useState(0);
  const [replayError, setReplayError] = useState<{ trade: Trade; message: string } | null>(null);
  const [filters, setFilters] = useState<TradeFilters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<TradeSort>("time-desc");
  // Reference identity prevents an old selection surviving replacement results.
  const [selection, setSelection] = useState<Trade | null>(null);
  const result = useMemo(() => inspectTrades(trades, filters, sort), [trades, filters, sort]);
  const reasons = useMemo(() => [...new Set(trades.map((t) => t.reason))].sort(), [trades]);
  const selected = selection && result.rows.includes(selection) ? selection : result.rows[0];

  const focus = useMemo(
    () =>
      selected && verifiedRun && (!selected.symbol || selected.symbol === verifiedRun.cfg.symbol)
        ? focusTrade(verifiedRun.bars, selected)
        : null,
    [selected, verifiedRun],
  );
  const focusRange = useMemo(
    () => (focus ? { from: focus.from, to: focus.to } : undefined),
    [focus],
  );
  const markers = useMemo(() => (selected ? [selected] : []), [selected]);

  return (
    <div data-testid="trade-inspector" className="min-w-0 space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="mb-1 flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-accent">
            <SlidersHorizontal className="size-4" /> Trade explorer
          </p>
          <h3 className="font-display text-2xl">Đọc từng nhánh thoát</h3>
          <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
            Mỗi dòng là một lần đóng một phần hoặc toàn bộ vị thế (exit leg), không phải một vị thế
            độc lập.
          </p>
        </div>
        <span
          data-testid="trade-source"
          className={`rounded-full border border-border px-3 py-1 text-xs ${source === "synthetic" ? "text-warn" : "text-muted"}`}
        >
          Nguồn:{" "}
          {source === "synthetic"
            ? "Synthetic · mô phỏng"
            : (source?.toUpperCase() ?? "Chưa xác định")}
        </span>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="min-w-0 space-y-1 text-xs text-muted">
          <span className="flex items-center gap-1">
            <Search className="size-3" /> Tìm trong nhật ký
          </span>
          <input
            data-testid="trade-search"
            type="search"
            className={control}
            placeholder="ID, chiến lược, lý do…"
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </label>
        <label className="space-y-1 text-xs text-muted">
          Chiều vị thế
          <select
            data-testid="trade-side-filter"
            className={control}
            value={filters.side}
            onChange={(e) =>
              setFilters((f) => ({ ...f, side: e.target.value as TradeFilters["side"] }))
            }
          >
            <option value="all">Tất cả chiều</option>
            <option value="long">Long · Mua</option>
            <option value="short">Short · Bán</option>
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Lý do thoát
          <select
            data-testid="trade-reason-filter"
            className={control}
            value={filters.reason}
            onChange={(e) => setFilters((f) => ({ ...f, reason: e.target.value }))}
          >
            <option value="all">Tất cả lý do</option>
            {reasons.map((reason) => (
              <option key={reason} value={reason}>
                {REASONS[reason] ?? reason} · {reason}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted">
          Sắp xếp
          <select
            data-testid="trade-sort"
            className={control}
            value={sort}
            onChange={(e) => setSort(e.target.value as TradeSort)}
          >
            <option value="time-desc">Thoát mới nhất</option>
            <option value="time-asc">Thoát cũ nhất</option>
            <option value="pnl-desc">PnL cao → thấp</option>
            <option value="pnl-asc">PnL thấp → cao</option>
          </select>
        </label>
      </div>

      <div aria-live="polite" className="grid gap-3 md:grid-cols-2">
        <GroupSummary label="Giữ lại sau bộ lọc" group={result.retained} testId="retained" />
        <GroupSummary label="Bị loại khỏi góc nhìn" group={result.excluded} testId="excluded" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
        <p>
          EV = tổng PnL / số nhánh. Lọc hậu kiểm, không chạy lại backtest; không chứng minh edge
          mới.
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            setFilters(INITIAL_FILTERS);
            setSort("time-desc");
            setSelection(null);
          }}
        >
          Xóa bộ lọc
        </Button>
      </div>

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section
          className="min-w-0 overflow-hidden rounded-xl border border-border"
          aria-label="Danh sách nhánh thoát"
        >
          <div className="max-h-96 overflow-auto">
            <table className="w-full text-left text-xs">
              <caption className="sr-only">
                Các nhánh thoát sau lọc; chọn Xem để đọc chi tiết
              </caption>
              <thead className="sticky top-0 z-10 bg-surface-2 text-muted">
                <tr>
                  <th scope="col" className="p-3">
                    Nhánh thoát
                  </th>
                  <th scope="col" className="p-3">
                    Thoát (UTC)
                  </th>
                  <th scope="col" className="p-3 text-right">
                    PnL log
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((t, i) => (
                  <tr
                    data-testid="trade-row"
                    key={`${t.id}-${i}`}
                    className={`border-t border-border ${selected === t ? "bg-accent/10" : "hover:bg-surface-2"}`}
                  >
                    <td className="p-3">
                      <button
                        type="button"
                        aria-pressed={selected === t}
                        aria-label={`Xem nhánh ${t.id}`}
                        onClick={() => {
                          setSelection(t);
                          setFocusRequest((n) => n + 1);
                        }}
                        className="min-h-11 max-w-full text-left focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        <span
                          className={`font-mono font-medium uppercase ${t.side === "long" ? "text-long" : "text-short"}`}
                        >
                          {t.side}
                        </span>
                        <span className="ml-2 text-fg">{t.reason}</span>
                        <span className="mt-1 block break-all text-muted">{t.id}</span>
                      </button>
                    </td>
                    <td className="p-3 font-mono text-muted">
                      <time dateTime={new Date(t.exitTime).toISOString()}>
                        {new Date(t.exitTime).toISOString().slice(0, 10)}
                        <span className="block">
                          {new Date(t.exitTime).toISOString().slice(11, 19)}
                        </span>
                      </time>
                    </td>
                    <td
                      className={`whitespace-nowrap p-3 text-right font-mono tabular ${t.pnl < 0 ? "text-short" : "text-long"}`}
                    >
                      {formatUsd(t.pnl)}
                      <span className="mt-1 block text-muted">{formatNumber(t.pnlR, 2)} R</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!result.rows.length && (
              <p data-testid="trade-empty" className="p-6 text-sm text-muted">
                {trades.length
                  ? "Không có nhánh thoát khớp bộ lọc. Thử xóa bộ lọc hoặc đổi từ khóa."
                  : "Chưa có nhánh thoát trong mẫu backtest này."}
              </p>
            )}
          </div>
        </section>
        {selected ? (
          <section
            data-testid="trade-detail"
            data-entry-time={selected.entryTime}
            data-trade-id={selected.id}
            aria-label="Chi tiết nhánh thoát"
            className="min-w-0 rounded-xl border border-border bg-surface-2 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted">Đang kiểm tra</p>
                <h4 className="mt-1 break-all font-mono text-sm">{selected.id}</h4>
                <p className="mt-1 break-all text-xs text-muted">
                  {selected.strategy} · {REASONS[selected.reason] ?? selected.reason}
                </p>
              </div>
              <p
                className={`font-mono text-2xl tabular ${selected.pnl < 0 ? "text-short" : "text-long"}`}
              >
                {formatUsd(selected.pnl)}
              </p>
            </div>
            <div className="mt-4 space-y-3" data-testid="trade-chart-panel">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  disabled={!focus}
                  onClick={() => setFocusRequest((n) => n + 1)}
                >
                  Tập trung điểm vào / ra
                </Button>
                <Button
                  variant="secondary"
                  disabled={!focus || !verifiedRun?.source}
                  onClick={() => {
                    if (!focus || !verifiedRun?.source) return;
                    try {
                      startTradeReplay(
                        verifiedRun.bars,
                        verifiedRun.cfg,
                        selected.entryTime,
                        verifiedRun.source,
                        verifiedRun.sourceNote,
                      );
                      onReplay?.();
                      setReplayError(null);
                    } catch (error) {
                      setReplayError({
                        trade: selected,
                        message:
                          error instanceof Error
                            ? error.message
                            : "Không thể mở replay cho nhánh này.",
                      });
                    }
                  }}
                >
                  Replay từ điểm vào
                </Button>
              </div>
              {focus && verifiedRun ? (
                <>
                  <p className="text-xs text-muted" data-testid="trade-run-provenance">
                    {verifiedRun.cfg.symbol} · {verifiedRun.cfg.ltf} · {verifiedRun.cfg.market} ·{" "}
                    {verifiedRun.cfg.strategyId} · nến và cấu hình của lần chạy
                  </p>
                  <CandleChart
                    bars={verifiedRun.bars}
                    focusRange={focusRange}
                    focusRequestKey={focusRequest}
                    trades={markers}
                    datasetKey={verifiedRun.datasetKey}
                  />
                  <p className="text-xs text-muted">
                    Mũi tên vào / ra là khớp lệnh; L / S là tín hiệu. Không suy diễn SL/TP.
                  </p>
                </>
              ) : (
                <p
                  data-testid="trade-chart-unavailable"
                  className="rounded-lg border border-dashed border-border p-4 text-xs text-warn"
                >
                  {verifiedRun
                    ? "Thời điểm vào / ra không khớp bộ nến của lần chạy. Không hiển thị biểu đồ khác thay thế."
                    : "Lần chạy này chưa lưu bộ nến và cấu hình gốc. Chạy lại để kiểm tra trên biểu đồ."}
                </p>
              )}
              {replayError?.trade === selected && (
                <p role="alert" className="text-xs text-short">
                  {replayError.message}
                </p>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              {[
                ["Giá vào · đã slippage", formatNumber(selected.entry, 8)],
                ["Giá ra · đã slippage", formatNumber(selected.exit, 8)],
                [
                  "Vào (UTC)",
                  new Date(selected.entryTime).toISOString().replace("T", " ").replace(".000Z", ""),
                ],
                [
                  "Ra (UTC)",
                  new Date(selected.exitTime).toISOString().replace("T", " ").replace(".000Z", ""),
                ],
                ["Khối lượng nhánh", formatNumber(selected.qty, 8)],
                [
                  "Thời gian giữ",
                  `${formatNumber(Math.max(0, selected.exitTime - selected.entryTime) / 60000, 1)} phút · ${selected.barsHeld} nến`,
                ],
                ["SL · không được lưu", "Không có trong trade log"],
                ["TP1 / TP2 · không được lưu", "Không có trong trade log"],
                ["MFE · thuận lợi tối đa", `${formatNumber(selected.mfeR, 2)} R`],
                ["MAE · bất lợi tối đa (độ lớn)", `${formatNumber(selected.maeR, 2)} R`],
                ["Phí thoát · đã trừ trong PnL", formatUsd(selected.fees)],
                ["Funding · phần engine ghi nhận", formatUsd(selected.funding)],
              ].map(([label, value]) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-muted">{label}</dt>
                  <dd className="mt-1 break-words font-mono text-fg">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 border-t border-border pt-3 text-xs leading-relaxed text-muted">
              Không suy ngược SL/TP từ cấu hình hiện tại: stop có thể đã dời, TP có thể tắt. MFE/MAE
              là cực trị engine ghi nhận đến nhánh thoát, không phải chuỗi giá intrabar.
            </p>
          </section>
        ) : (
          <div className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
            Chi tiết sẽ xuất hiện khi có nhánh thoát phù hợp.
          </div>
        )}
      </div>

      <details
        className="rounded-xl border border-border p-4 text-xs leading-relaxed text-muted"
        open
      >
        <summary className="cursor-pointer font-medium text-warn">
          Cách đọc PnL · giới hạn cash / mark-to-market
        </summary>
        <p className="mt-2">
          PnL trade-log = lãi/lỗ theo giá khớp đã slippage − phí vào phân bổ − phí thoát.
          Net mỗi nhánh = PnL − funding phân bổ. Không trừ phí thêm lần nữa. Khi toàn bộ vị thế
          đã đóng, tổng net toàn bộ nhánh bằng thay đổi cash so với vốn ban đầu.
        </p>
        <p className="mt-2">
          Equity curve là mark-to-market (cash + lãi/lỗ chưa thực hiện). Lần đóng end_of_data
          được tính trước điểm vốn cuối, gồm chi phí; MTM cuối bằng cash sau quyết toán.
          Bộ lọc chỉ thay góc nhìn nhật ký, không thay vốn hay metrics gốc.
        </p>
      </details>
    </div>
  );
}
