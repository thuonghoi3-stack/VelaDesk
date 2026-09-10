import { useEffect, useMemo, useState } from "react";
import { Download, LoaderCircle, RotateCcw, Settings2, SlidersHorizontal, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EquityChart } from "@/components/desk/equity-chart";
import { TradeInspector } from "@/components/desk/trade-inspector";
import type { TradeRunSnapshot } from "@/lib/quant/trade-focus";
import { useDesk } from "@/lib/quant/store";
import type { BacktestResult, DeskConfig, EquityPoint, Metrics, Trade } from "@/lib/quant/types";
import { runBacktest } from "@/lib/quant/backtest/engine";
import {
  GRID_LABELS,
  periodBreakdown,
  type PeriodRow,
  MAX_COMBOS,
  OBJECTIVE_LABELS,
  compareStrategies,
  monteCarlo,
  objectiveScore,
  runGrid,
  sliceBarsByRange,
  strategyBreakdown,
  walkForwardEfficiency,
  type CompareRow,
  type GridKey,
  type GridResult,
  type McResult,
  type Objective,
  type StrategyRow,
} from "@/lib/quant/backtest/lab";
import { STRATEGY_SELECT_OPTIONS } from "@/lib/quant/strategy/library";
import { UNIVERSE_SYMBOLS, barBudget as budgetFor, defaultConfig, htfBudget, HTF_FOR } from "@/lib/quant/config";
import { loadOhlcv } from "@/lib/quant/data/load-ohlcv";
import { buildDesk } from "@/lib/quant/pipeline";
import { runPortfolio, type PortfolioInput, type PortfolioResult } from "@/lib/quant/backtest/portfolio";
import { formatDateUtc, formatNumber, formatPct, formatUsd } from "@/lib/utils";

/* ---------------------------------- shared --------------------------------- */

function shortStrategy(id: string): string {
  if (id === "trend_pullback") return "trend";
  if (id === "mean_reversion") return "mr";
  return id.replace("_reversion", "").replace("_", " ");
}

function Metric({ label, value, warn, hero }: { label: string; value: string; warn?: boolean; hero?: boolean }) {
  return (
    <div className={`rounded-lg bg-surface-2 p-3 ${hero ? "col-span-2 md:col-span-1" : ""}`}>
      <p className="text-[11px] tracking-wide text-muted uppercase">{label}</p>
      <p className={`mt-1 font-mono tabular ${hero ? "text-2xl" : "text-lg"} ${warn ? "text-short" : "text-fg"}`}>
        {value}
      </p>
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
      <Metric label="Thời gian" value={`${Math.round(m.days)} ngày`} />
      <Metric label="Lãi gộp" value={formatUsd(m.grossProfit)} />
      <Metric label="Lỗ gộp" value={formatUsd(-m.grossLoss)} />
      <Metric label="Lệnh TB thắng" value={formatUsd(m.avgWin)} />
      <Metric label="Lệnh TB thua" value={formatUsd(m.avgLoss)} />
      <Metric label="Lệnh tốt nhất" value={formatUsd(m.best)} />
      <Metric label="Lệnh xấu nhất" value={formatUsd(m.worst)} warn={m.worst < 0} />
      <Metric label="Số nến" value={String(m.bars)} />
    </div>
  );
}

function Histogram({ bins, unit, warnFrom }: { bins: { label: string; count: number }[]; unit: string; warnFrom?: number }) {
  const max = Math.max(...bins.map((b) => b.count), 1);
  return (
    <div className="flex h-32 items-end gap-1">
      {bins.map((b) => (
        <div key={b.label} className="flex min-w-4 flex-1 flex-col items-center gap-1">
          <div
            className={
              warnFrom != null && Number(b.label.replace(/[^-\d.]/g, "")) >= warnFrom
                ? "w-full rounded-t bg-short/70"
                : "w-full rounded-t bg-accent/70"
            }
            style={{ height: `${(b.count / max) * 100}%` }}
            title={`${b.count} lệnh`}
          />
          <span className="text-[9px] text-subtle">{b.label}{unit}</span>
        </div>
      ))}
    </div>
  );
}

function binsFor(values: number[], edges: number[], fmt: (v: number) => string): { label: string; count: number }[] {
  const labels = edges.map((e, i) =>
    i === 0 ? `<${fmt(edges[1]!)}` : i === edges.length - 1 ? `≥${fmt(e)}` : `${fmt(e)}–${fmt(edges[i + 1]!)}`,
  );
  const counts = new Array(edges.length).fill(0) as number[];
  for (const v of values) {
    let placed = false;
    for (let i = 0; i < edges.length - 1; i++) {
      if (v >= edges[i]! && v < edges[i + 1]!) {
        counts[i]! += 1;
        placed = true;
        break;
      }
    }
    if (!placed) counts[edges.length - 1]! += 1;
  }
  return counts.map((count, i) => ({ label: labels[i]!, count }));
}

function statRow(label: string, r: StrategyRow) {
  return (
    <tr key={label} className="border-t border-border">
      <td className="py-1.5">{label}</td>
      <td className="py-1.5 text-right">{r.trades}</td>
      <td className="py-1.5 text-right">{formatPct(r.winRate, 1)}</td>
      <td className={r.pnl >= 0 ? "py-1.5 text-right text-long" : "py-1.5 text-right text-short"}>
        {formatUsd(r.pnl)}
      </td>
      <td className="py-1.5 text-right">{formatNumber(r.avgR, 2)}</td>
      <td className="py-1.5 text-right text-muted">
        {formatNumber(r.mfeAvg, 2)} / {formatNumber(r.maeAvg, 2)}
      </td>
      <td className="py-1.5 text-right">{formatNumber(r.avgBars, 1)}</td>
    </tr>
  );
}

function SideTable({ rows }: { rows: readonly (readonly [string, StrategyRow])[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="pb-2">Nhóm</th>
            <th className="pb-2 text-right">Lệnh</th>
            <th className="pb-2 text-right">Win rate</th>
            <th className="pb-2 text-right">PnL</th>
            <th className="pb-2 text-right">Avg R</th>
            <th className="pb-2 text-right">MFE / MAE (R)</th>
            <th className="pb-2 text-right">Nến TB</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular">{rows.map(([label, r]) => statRow(label, r))}</tbody>
      </table>
    </div>
  );
}

/* --------------------------------- dialogs --------------------------------- */

type FieldDef = { key: keyof DeskConfig; label: string; step?: number };

const INPUT_FIELDS: { group: string; fields: FieldDef[] }[] = [
  {group:"Source-native account assumptions (only native mode)",fields:[
    {key:"nativeFixedQty",label:"Fixed units when source omits size",step:0.01},
    {key:"nativeTickSize",label:"Instrument tick size (verify for symbol)",step:0.001},
    {key:"nativeFee",label:"Native fee ratio",step:0.0001},
    {key:"nativeSlippageBps",label:"Native slippage bps",step:1},
  ]},
  {
    group: "Tín hiệu",
    fields: [
      { key: "volSpikeMin", label: "Volume ≥ n × SMA20", step: 0.1 },
      { key: "mrRsiLongMax", label: "MR — RSI long ≤", step: 1 },
      { key: "mrRsiShortMin", label: "MR — RSI short ≥", step: 1 },
      { key: "mrAdxMax", label: "MR — ADX <", step: 1 },
    ],
  },
  {
    group: "Kỷ luật regime (port)",
    fields: [
      { key: "regimeFilterPorts", label: "Chặn signal ngược regime ADX (1 = bật)", step: 1 },
    ],
  },
  {
    group: "Keltner Breakout",
    fields: [
      { key: "kcEmaLen", label: "KC: EMA mid (nến)", step: 1 },
      { key: "kcAtrLen", label: "KC: ATR (nến)", step: 1 },
      { key: "kcMult", label: "KC: hệ số ×", step: 0.25 },
      { key: "portAdxMin", label: "ADX gate (≥)", step: 1 },
    ],
  },
  {
    group: "Ported (TradingView)",
    fields: [
      { key: "stAtrMult", label: "Supertrend factor (ATR 10)", step: 0.5 },
      { key: "donEntryLen", label: "Donchian breakout (nến)", step: 1 },
      { key: "emaFastLen", label: "EMA nhanh", step: 1 },
      { key: "emaSlowLen", label: "EMA chậm", step: 1 },
      { key: "stochLo", label: "Stoch quá bán <", step: 1 },
      { key: "stochHi", label: "Stoch quá mua >", step: 1 },
    ],
  },
  {
    group: "Exit ladder",
    fields: [
      { key: "tp1R", label: "TP1 (R)", step: 0.1 },
      { key: "tp1ClosePct", label: "TP1 đóng (% vị thế)", step: 0.05 },
      { key: "tp2R", label: "TP2 (R)", step: 0.1 },
      { key: "breakevenR", label: "Dời SL về hòa sau (R)", step: 0.1 },
    ],
  },
  {
    group: "Stop",
    fields: [
      { key: "stopAtrMin", label: "Stop min (× ATR)", step: 0.1 },
      { key: "stopAtrMax", label: "Stop max (× ATR)", step: 0.1 },
      { key: "mrStopAtr", label: "MR stop (× ATR)", step: 0.1 },
      { key: "timeStopBars", label: "Time stop (nến)", step: 1 },
    ],
  },
];

const PROPERTY_FIELDS: FieldDef[] = [
  { key: "equity", label: "Vốn ban đầu (USDT)", step: 500 },
  { key: "riskPct", label: "Risk / lệnh (0.01 = 1%)", step: 0.0025 },
  { key: "takerFee", label: "Taker fee mỗi khớp (0.0004 = 0.04%)", step: 0.0001 },
  { key: "slippageBps", label: "Slippage (bps)", step: 1 },
  { key: "fundingPer8h", label: "Funding / 8h (0.0001 = 0.01%)", step: 0.0001 },
  { key: "dailyLossCap", label: "Daily loss cap (0.03 = 3%)", step: 0.01 },
  { key: "maxExposure", label: "Max exposure (0.25 = 25%)", step: 0.05 },
  { key: "maxLeverage", label: "Đòn bẩy tối đa", step: 1 },
];

function EditDialog({
  title,
  sections,
  onClose,
}: {
  title: string;
  sections: { group: string; fields: FieldDef[] }[];
  onClose: () => void;
}) {
  const cfg = useDesk((s) => s.cfg);
  const setCfg = useDesk((s) => s.setCfg);
  const [draft, setDraft] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const sec of sections) for (const f of sec.fields) init[f.key as string] = String(cfg[f.key]);
    return init;
  });

  function apply() {
    const partial: Partial<DeskConfig> = {};
    for (const sec of sections) {
      for (const f of sec.fields) {
        if(cfg.executionMode === "source-native" && !String(f.key).startsWith("native") && f.key !== "equity" && f.key !== "warmup")continue;
        const v = Number(draft[f.key as string]);
        if (Number.isFinite(v) && v !== cfg[f.key]) {
          (partial as Record<string, number>)[f.key as string] = v;
        }
      }
    }
    if (Object.keys(partial).length > 0) setCfg(partial);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="max-h-[82dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl">{title}</h3>
          <button type="button" onClick={onClose} className="text-subtle hover:text-fg">
            <X className="size-4" />
          </button>
        </div>
        {sections.map((sec) => (
          <div key={sec.group} className="mb-4">
            <p className="mb-2 text-[11px] tracking-wide text-muted uppercase">{sec.group}</p>
            <div className="grid grid-cols-2 gap-2">
              {sec.fields.map((f) => (
                <label key={f.key as string} className="flex flex-col gap-1">
                  <span className="text-[11px] text-muted">{f.label}</span>
                  <input
                    type="number"
                    disabled={cfg.executionMode === "source-native" && !String(f.key).startsWith("native") && f.key !== "equity" && f.key !== "warmup"}
                    step={f.step ?? "any"}
                    value={draft[f.key as string] ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.key as string]: e.target.value }))}
                    className="h-9 rounded-md bg-surface-2 px-2 font-mono text-xs text-fg"
                  />
                </label>
              ))}
            </div>
          </div>
        ))}
        <p className="mb-3 text-[11px] text-subtle">
          Áp dụng là chạy lại backtest trên nến đang tải (và trong khoảng ngày đã chọn) — đúng mô
          hình Inputs của Strategy Tester.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button onClick={apply}>Áp dụng & chạy lại</Button>
        </div>
      </div>
    </div>
  );
}

function PeriodTables({ equity, trades, initialEquity }: { equity: EquityPoint[]; trades: Trade[]; initialEquity: number }) {
  const years = useMemo(() => periodBreakdown(equity, trades, initialEquity, "year"), [equity, trades, initialEquity]);
  const quarters = useMemo(() => periodBreakdown(equity, trades, initialEquity, "quarter"), [equity, trades, initialEquity]);
  const maxAbs = Math.max(1, ...[...years, ...quarters].map((r) => Math.abs(r.netPct)));

  function Table({ rows, unit }: { rows: PeriodRow[]; unit: string }) {
    if (rows.length === 0) return <p className="text-sm text-muted">Không đủ dữ liệu.</p>;
    return (
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>
            <th className="pb-2">{unit}</th>
            <th className="pb-2 text-right">Net %</th>
            <th className="pb-2 text-right">PnL</th>
            <th className="pb-2 text-right">Max DD</th>
            <th className="pb-2 text-right">Lệnh</th>
            <th className="pb-2 text-right">Win %</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular">
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-border">
              <td className="py-1.5 text-fg">{r.label}</td>
              <td className="py-1.5 text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-surface-2 md:block">
                    <div
                      className={r.netPct >= 0 ? "h-full rounded-full bg-long" : "h-full rounded-full bg-short"}
                      style={{ width: `${(Math.abs(r.netPct) / maxAbs) * 100}%` }}
                    />
                  </div>
                  <span className={r.netPct >= 0 ? "text-long" : "text-short"}>{formatPct(r.netPct, 1)}</span>
                </div>
              </td>
              <td className={r.netPnl >= 0 ? "py-1.5 text-right" : "py-1.5 text-right text-short"}>
                {formatUsd(r.netPnl)}
              </td>
              <td className="py-1.5 text-right text-muted">{formatPct(-r.maxDd, 1)}</td>
              <td className="py-1.5 text-right">{r.trades}</td>
              <td className="py-1.5 text-right">{r.trades ? formatPct(r.winRate, 0) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-3 font-display text-xl">Lợi nhuận theo năm</h3>
        <Table rows={years} unit="Năm" />
      </div>
      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-3 font-display text-xl">Lợi nhuận theo quý</h3>
        <Table rows={quarters} unit="Quý" />
        <p className="mt-2 text-[11px] text-subtle">PnL kỳ = vốn cuối kỳ − vốn đầu kỳ (mark-to-market). Lệnh tính theo thời điểm đóng.</p>
      </div>
    </div>
  );
}

/* ---------------------------------- panel ---------------------------------- */

type TesterTab = "overview" | "trades" | "performance" | "optimize" | "montecarlo" | "compare";

const TABS: { id: TesterTab; label: string }[] = [
  { id: "overview", label: "Tổng quan" },
  { id: "trades", label: "Danh sách lệnh" },
  { id: "performance", label: "Hiệu suất" },
  { id: "optimize", label: "Tối ưu" },
  { id: "montecarlo", label: "Monte Carlo" },
  { id: "compare", label: "Danh mục" },
];

export function TesterPanel() {
  const storeBt = useDesk((s) => s.backtest);
  const storeRun = useDesk((s) => s.backtestRun);
  const source = useDesk((s) => s.source);
  const sourceNote = useDesk((s) => s.sourceNote);
  const loading = useDesk((s) => s.loading);
  const runStoreBt = useDesk((s) => s.runBt);
  const ltf = useDesk((s) => s.ltf);
  const cfg = useDesk((s) => s.cfg);
  const setCfg = useDesk((s) => s.setCfg);
  const btNote = useDesk((s) => s.btNote);
  const [tab, setTab] = useState<TesterTab>("overview");
  const [dialog, setDialog] = useState<"inputs" | "properties" | null>(null);
  // TV-style date range: when set, the tester reruns on the slice locally.
  const [range, setRange] = useState<{ from: string; to: string }>({ from: "", to: "" });
  const [localBt, setLocalBt] = useState<(TradeRunSnapshot & { inputBars: typeof ltf; inputCfg: DeskConfig; range: typeof range }) | null>(null);
  // A replay handoff owns its research run until the user explicitly releases it.
  const [captured, setCaptured] = useState<{ run: TradeRunSnapshot; range: typeof range } | null>(null);
  const [rangeError, setRangeError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);

  const rangeActive = range.from !== "" || range.to !== "";

  useEffect(() => {
    setRerunning(false);
    if (captured) return;
    if (!rangeActive || loading || ltf.length === 0) {
      setLocalBt(null);
      setRangeError(null);
      return;
    }
    const from = range.from ? Date.parse(`${range.from}T00:00:00Z`) : 0;
    const to = range.to ? Date.parse(`${range.to}T23:59:59Z`) : Number.MAX_SAFE_INTEGER;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      setLocalBt(null);
      setRangeError("Khoảng ngày không hợp lệ: ngày bắt đầu phải trước ngày kết thúc.");
      return;
    }
    const sliced = sliceBarsByRange(ltf, from, to);
    if (sliced.length < cfg.warmup + 50) {
      setLocalBt(null);
      setRangeError(`Khoảng ngày chỉ còn ${sliced.length} nến — cần ≥ ${cfg.warmup + 50} để backtest.`);
      return;
    }
    setRangeError(null);
    setRerunning(true);
    const bars = structuredClone(sliced);
    const runCfg = structuredClone(cfg);
    const id = window.setTimeout(() => {
      try {
        const result = runBacktest(bars, runCfg, runCfg.ltf);
        setLocalBt({ result, bars, cfg: runCfg, source, sourceNote, datasetKey: crypto.randomUUID(), inputBars: ltf, inputCfg: cfg, range });
      } catch (error) {
        setLocalBt(null);
        setRangeError(error instanceof Error ? error.message : "Không thể chạy backtest trong khoảng ngày này.");
      } finally {
        setRerunning(false);
      }
    }, 30);
    return () => window.clearTimeout(id);
  }, [range, rangeActive, ltf, cfg, source, sourceNote, loading, captured]);

  // Never fall back to an unrelated full-sample result while a range is invalid or pending.
  const localRun = localBt?.inputBars === ltf && localBt.inputCfg === cfg && localBt.range === range && !loading ? localBt : null;
  const fullRun = !loading && storeRun?.result === storeBt ? storeRun : null;
  const run = captured?.run ?? (rangeActive ? localRun : fullRun);
  const shownCfg = run?.cfg ?? cfg;
  const bt = run?.result ?? null;
  const btTrades = bt?.trades ?? [];

  return (
    <div className="flex flex-col gap-4">
      {captured ? (
        <section data-testid="tester-historical-context" className="rounded-xl border border-border bg-surface p-4 text-sm">
          <p className="font-medium text-warn">Lần chạy lịch sử đã lưu</p>
          <p className="mt-1 break-words text-muted">
            {captured.run.cfg.symbol} · {captured.run.cfg.ltf} · {captured.run.cfg.market} · {captured.run.cfg.strategyId} · {captured.run.source}
            {" · "}{captured.range.from || "Toàn mẫu"} → {captured.range.to || "Cuối mẫu"}
            {" · "}{captured.run.sourceNote}
          </p>
          <p className="mt-2 text-xs text-muted">Bộ nến, kết quả và bộ lọc được giữ khi quay lại từ Replay. Cấu hình toàn cục hiện tại: {cfg.symbol} · {cfg.ltf}. Chuyển sang kết quả hiện tại để chỉnh Inputs/Properties hoặc khoảng ngày.</p>
          <Button className="mt-3" variant="secondary" onClick={() => setCaptured(null)}>Xem kết quả hiện tại</Button>
        </section>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4">
        <div>
          <h2 className="font-display text-2xl">Strategy Tester</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {shownCfg.symbol} · {shownCfg.ltf} · {shownCfg.executionMode === "source-native" ? "Source-native: next-tick markets / persistent stops; separate account assumptions below." : "tín hiệu đóng nến t khớp open t+1 · phí, slippage, funding, daily-loss halt."} {captured ? "Đang xem lần chạy lịch sử đã lưu, không phải cấu hình toàn cục hiện tại." : "Mô hình Strategy Tester: sửa Inputs/Properties là chạy lại."}
          </p>
          {bt && bt.equity.length > 1 ? (
            <p className="mt-1 text-xs text-subtle">
              Mẫu{rangeActive ? " (theo khoảng ngày)" : ""}: {formatDateUtc(bt.equity[0]!.time)} →{" "}
              {formatDateUtc(bt.equity[bt.equity.length - 1]!.time)} · {Math.round(bt.metrics.days)} ngày ·{" "}
              {btTrades.length.toLocaleString("en-US")} lệnh · {bt.metrics.bars.toLocaleString("en-US")} nến
            </p>
          ) : null}
        </div>
        <fieldset disabled={!!captured} className="flex min-w-0 flex-wrap items-center gap-2 disabled:opacity-60">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded-md bg-surface-2 px-2 py-1.5">
            <label className="flex min-w-0 items-center gap-1.5">
            <span className="text-[10px] text-subtle uppercase">Từ</span>
            <input
              type="date"
              value={range.from}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
              className="bg-transparent font-mono text-xs text-fg [color-scheme:dark]"
            />
            </label>
            <label className="flex min-w-0 items-center gap-1.5">
            <span className="text-[10px] text-subtle uppercase">Đến</span>
            <input
              type="date"
              value={range.to}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
              className="bg-transparent font-mono text-xs text-fg [color-scheme:dark]"
            />
            </label>
            {rangeActive ? (
              <button
                type="button"
                onClick={() => setRange({ from: "", to: "" })}
                className="text-subtle hover:text-fg"
                title="Quay lại toàn mẫu"
              >
                <X className="size-3.5" />
              </button>
            ) : null}
          </div>
          <select
            className="h-9 rounded-md bg-surface-2 px-2 text-xs text-fg"
            value={shownCfg.strategyId}
            onChange={(e) => setCfg({ strategyId: e.target.value as DeskConfig["strategyId"] })}
          >
            {STRATEGY_SELECT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
          <select aria-label="Execution mode" className="h-9 rounded-md bg-surface-2 px-2 text-xs text-fg"
            value={shownCfg.executionMode ?? "custom-risk"}
            onChange={e=>setCfg({executionMode:e.target.value as DeskConfig["executionMode"]})}>
            <option value="custom-risk">Custom-risk adaptation</option>
            <option value="source-native">Source-native · pinned defaults</option>
          </select>
          <Button variant="secondary" onClick={() => setDialog("inputs")}>
            <SlidersHorizontal />
            Inputs
          </Button>
          <Button variant="secondary" onClick={() => setDialog("properties")}>
            <Settings2 />
            Properties
          </Button>
          <Button
            onClick={() => {
              if (rangeActive) {
                setRange((r) => ({ ...r })); // re-trigger the local range run
              } else {
                runStoreBt();
              }
            }}
            disabled={rerunning || loading}
          >
            {rerunning ? <LoaderCircle className="animate-spin" /> : <RotateCcw />}
            Chạy lại
          </Button>
        </fieldset>
      </div>

      <div className="rounded-xl bg-surface p-4 text-xs text-muted" data-testid="execution-scope">
        {shownCfg.executionMode === "source-native" ? <>
          <strong>Source-native · local source translation. Not TradingView runtime parity.</strong>
          <p>Pinned formula defaults; both directions; no ADX gate, ATR protection, TP ladder, time stop or funding. Market orders fill next open; stop orders persist/cancel/OCA. OHLC path: open → nearest extreme → other extreme → close (ties low first). Terminal exit is VelaDesk end_of_data, not a source exit. R metrics are unavailable (reported 0), not ATR risk.</p>
          <p>Account assumptions: equity {shownCfg.equity}; {shownCfg.strategyId === "supertrend" ? "source-declared 15% equity" : `${shownCfg.nativeFixedQty ?? 1} fixed units (source omits quantity)`}; tick {shownCfg.nativeTickSize}; fee {shownCfg.nativeFee}; slippage {shownCfg.nativeSlippageBps} bps. Tick is user-supplied, not venue-verified. Execution starts at configured warmup {shownCfg.warmup}; no prior pending orders are inherited. Portfolio shares cash in symbol order, without custom-risk caps.</p>
        </> : <>Custom-risk adaptation: VelaDesk entry gates, sizing and exit rules; not a source-native backtest. E0V1E here retains ATR-normalized entries/R ladder, not pinned Freqtrade behavior.</>}
      </div>
      {btNote && !rangeActive && !captured ? <div className="rounded-xl bg-surface p-4 text-sm text-warn">{btNote}</div> : null}
      {rangeError && !captured ? <div className="rounded-xl bg-surface p-4 text-sm text-warn">{rangeError}</div> : null}

      <nav className="flex gap-1 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={
              tab === t.id
                ? "h-9 shrink-0 rounded-full bg-surface-2 px-4 text-sm text-fg"
                : "h-9 shrink-0 rounded-full px-4 text-sm text-muted hover:text-fg"
            }
          >
            {t.label}
          </button>
        ))}
      </nav>

      {!bt ? (
        <div className="rounded-xl bg-surface p-6 text-sm text-muted" role="status">
          {loading ? "Đang tải bộ nến mới; không ghép kết quả cũ với cấu hình mới."
            : rerunning ? "Đang chạy backtest cho khoảng ngày đã chọn…"
            : rangeActive ? "Chưa có kết quả cho khoảng ngày này. Điều chỉnh khoảng ngày hoặc xem thông báo phía trên."
            : "Bấm “Chạy lại” để mô phỏng trên nến đã tải."}
        </div>
      ) : tab === "overview" ? (
        <OverviewTab bt={bt} />
      ) : tab === "trades" ? (
        <TradesTab key={run?.datasetKey} trades={btTrades} startEquity={bt.metrics.startEquity} run={run} onReplay={() => { if (run) setCaptured({ run, range: { ...range } }); }} />
      ) : tab === "performance" ? (
        <PerformanceTab trades={btTrades} />
      ) : tab === "optimize" ? (
        <OptimizeTab />
      ) : tab === "montecarlo" ? (
        <MonteCarloTab trades={btTrades} startEquity={bt.metrics.startEquity} />
      ) : (
        <PortfolioTab />
      )}

      {dialog === "inputs" ? (
        <EditDialog title="Inputs — tham số chiến lược" sections={INPUT_FIELDS} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === "properties" ? (
        <EditDialog
          title="Properties — vốn & chi phí"
          sections={[{ group: "Backtest account", fields: PROPERTY_FIELDS }]}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/* -------------------------------- overview --------------------------------- */

function OverviewTab({ bt }: { bt: BacktestResult }) {
  const m = bt.metrics;
  return (
    <>
      <div className="rounded-xl bg-surface p-4">
        <Badge tone={bt.claimBlocked ? "warn" : "long"}>
          {bt.claimBlocked ? "Không được claim thắng" : "Ngưỡng tối thiểu đạt"}
        </Badge>
        <p className="mt-2 text-sm text-muted">{bt.claimReason}</p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        <Metric hero label="Net profit" value={formatUsd(m.endEquity - m.startEquity)} warn={m.endEquity < m.startEquity} />
        <Metric hero label="Net profit %" value={formatPct(m.endEquity / m.startEquity - 1)} warn={m.endEquity < m.startEquity} />
        <Metric hero label="Max drawdown" value={formatPct(-m.maxDd)} warn={m.maxDd > 0.25} />
        <Metric hero label="Total trades" value={String(m.trades)} />
      </div>

      <h3 className="font-display text-xl">Toàn mẫu</h3>
      {metricGrid(m)}

      {bt.testMetrics ? (
        <>
          <h3 className="font-display text-xl">Out-of-sample (30% cuối)</h3>
          {metricGrid(bt.testMetrics)}
        </>
      ) : null}

      <h3 className="font-display text-xl">Buy & hold cùng cặp</h3>
      {metricGrid(bt.buyHold)}

      <EquityChart equity={bt.equity} buyHold={bt.buyHoldEquity} />

      <PeriodTables equity={bt.equity} trades={bt.trades} initialEquity={bt.metrics.startEquity} />

      {bt.walkForward.length > 0 ? (
        <div className="rounded-xl bg-surface p-4">
          <h3 className="mb-3 font-display text-xl">Walk-forward folds</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2">Train từ</th>
                  <th className="pb-2">Test từ</th>
                  <th className="pb-2">Đến</th>
                  <th className="pb-2 text-right">Sharpe</th>
                  <th className="pb-2 text-right">Max DD</th>
                  <th className="pb-2 text-right">Lệnh</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular">
                {bt.walkForward.map((f) => (
                  <tr key={f.testStart} className="border-t border-border">
                    <td className="py-1.5">{formatDateUtc(f.trainStart)}</td>
                    <td className="py-1.5">{formatDateUtc(f.testStart)}</td>
                    <td className="py-1.5">{formatDateUtc(f.testEnd)}</td>
                    <td className="py-1.5 text-right">{f.test.sharpe.toFixed(2)}</td>
                    <td className="py-1.5 text-right">{formatPct(-f.test.maxDd)}</td>
                    <td className="py-1.5 text-right">{f.test.trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-3 font-display text-xl">Giai đoạn thua nặng</h3>
        {bt.losingPeriods.length === 0 ? (
          <p className="text-sm text-muted">Không có đợt DD ≥ 8%.</p>
        ) : (
          <ul className="space-y-3">
            {bt.losingPeriods.map((p) => {
              const total = Object.values(p.regimeMix).reduce((s, v) => s + v, 0);
              const mix = Object.entries(p.regimeMix)
                .filter(([, n]) => n > 0)
                .sort((a, b) => b[1] - a[1])
                .map(([regime, n]) => `${regime.replace("_", " ")} ${((n / total) * 100).toFixed(0)}%`)
                .join(" · ");
              return (
                <li key={p.start} className="text-sm">
                  <p className="text-fg">
                    {formatDateUtc(p.start)} → đáy {formatDateUtc(p.troughTime)} → {formatDateUtc(p.end)} · DD{" "}
                    {formatPct(-p.drawdown)}
                  </p>
                  {mix ? <p className="text-xs text-muted">Regime: {mix}</p> : null}
                  <p className="text-muted">{p.note}</p>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {bt.dailyHaltDays > 0 ? (
        <p className="text-xs text-warn">Số ngày bị daily-loss halt: {bt.dailyHaltDays}</p>
      ) : null}
    </>
  );
}

/* --------------------------------- trades ---------------------------------- */

function TradesTab({ trades, startEquity, run, onReplay }: { trades: Trade[]; startEquity: number; run: TradeRunSnapshot | null; onReplay: () => void }) {
  function exportCsv() {
    const header =
      "id,side,strategy,entry_time,entry,exit_time,exit,qty,pnl,pnl_r,mfe_r,mae_r,fees,funding,reason,bars_held";
    const lines = trades.map((t) =>
      [
        t.id,
        t.side,
        t.strategy,
        new Date(t.entryTime).toISOString(),
        t.entry,
        new Date(t.exitTime).toISOString(),
        t.exit,
        t.qty,
        t.pnl.toFixed(4),
        t.pnlR.toFixed(4),
        t.mfeR.toFixed(3),
        t.maeR.toFixed(3),
        t.fees.toFixed(4),
        t.funding.toFixed(4),
        t.reason,
        t.barsHeld,
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "vela-trades.csv";
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Đã xuất ${trades.length} lệnh ra vela-trades.csv`);
  }

  return (
    <div className="min-w-0 rounded-xl bg-surface p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted">Vốn ban đầu {formatUsd(startEquity)} · CSV luôn xuất toàn bộ {trades.length} nhánh, không theo bộ lọc.</p>
        <Button variant="secondary" onClick={exportCsv} disabled={trades.length === 0}>
          <Download />
          Xuất CSV
        </Button>
      </div>
      <TradeInspector trades={trades} run={run} onReplay={onReplay} />
    </div>
  );
}

/* -------------------------------- performance ------------------------------- */

function PerformanceTab({ trades }: { trades: Trade[] }) {
  const sides = useMemo(() => {
    const row = (list: Trade[]): StrategyRow => ({
      strategy: `${list.length} lệnh`,
      trades: list.length,
      winRate: list.length ? list.filter((t) => t.pnl > 0).length / list.length : 0,
      pnl: list.reduce((s, t) => s + t.pnl, 0),
      avgR: list.length ? list.reduce((s, t) => s + t.pnlR, 0) / list.length : 0,
      avgBars: list.length ? list.reduce((s, t) => s + t.barsHeld, 0) / list.length : 0,
      mfeAvg: list.length ? list.reduce((s, t) => s + t.mfeR, 0) / list.length : 0,
      maeAvg: list.length ? list.reduce((s, t) => s + t.maeR, 0) / list.length : 0,
    });
    return {
      long: row(trades.filter((t) => t.side === "long")),
      short: row(trades.filter((t) => t.side === "short")),
    };
  }, [trades]);

  const breakdown = useMemo(() => strategyBreakdown(trades), [trades]);
  const fees = useMemo(() => trades.reduce((s, t) => s + t.fees, 0), [trades]);
  const funding = useMemo(() => trades.reduce((s, t) => s + t.funding, 0), [trades]);
  const rHist = useMemo(
    () => binsFor(trades.map((t) => t.pnlR), [-3, -2, -1, 0, 1, 2, 3], (v) => v.toFixed(0)),
    [trades],
  );
  const durHist = useMemo(
    () => binsFor(trades.map((t) => t.barsHeld), [1, 6, 11, 21, 41], (v) => String(v)),
    [trades],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[11px] text-muted uppercase">Tổng phí giao dịch</p>
          <p className="mt-1 font-mono text-lg tabular text-short">−{formatUsd(fees)}</p>
        </div>
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[11px] text-muted uppercase">Tổng funding</p>
          <p className="mt-1 font-mono text-lg tabular text-short">−{formatUsd(funding)}</p>
        </div>
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[11px] text-muted uppercase">PnL ròng sau chi phí</p>
          <p className="mt-1 font-mono text-lg tabular">{formatUsd(trades.reduce((s, t) => s + t.pnl, 0))}</p>
        </div>
      </div>

      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-3 font-display text-xl">Long vs Short</h3>
        <SideTable rows={[["Long", sides.long], ["Short", sides.short]]} />
      </div>

      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-3 font-display text-xl">Đóng góp theo chiến lược</h3>
        <SideTable rows={breakdown.map((r) => [shortStrategy(r.strategy), r] as const)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-surface p-4">
          <h3 className="mb-3 font-display text-xl">Phân bố PnL (R mỗi lệnh)</h3>
          <Histogram bins={rHist} unit="R" warnFrom={1} />
          <p className="mt-2 text-[11px] text-subtle">Cột đỏ: các bin lệnh lãi lớn (≥ 1R) — kiểm tra đuôi phải.</p>
        </div>
        <div className="rounded-xl bg-surface p-4">
          <h3 className="mb-3 font-display text-xl">Thời gian giữ lệnh (nến)</h3>
          <Histogram bins={durHist} unit="" />
          <p className="mt-2 text-[11px] text-subtle">Time stop sẽ dồn khối lượng về bin cuối.</p>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- optimizer -------------------------------- */

function OptimizeTab() {
  const ltf = useDesk((s) => s.ltf);
  const cfg = useDesk((s) => s.cfg);
  const setCfg = useDesk((s) => s.setCfg);
  const runBt = useDesk((s) => s.runBt);
  const [axisA, setAxisA] = useState<GridKey>("tp1R");
  const [valsA, setValsA] = useState("1, 1.5, 2, 2.5");
  const [axisB, setAxisB] = useState<GridKey | "none">("tp2R");
  const [valsB, setValsB] = useState("2, 2.5, 3");
  const [objective, setObjective] = useState<Objective>("sharpe");
  const [minTrades, setMinTrades] = useState(10);
  const [result, setResult] = useState<GridResult | null>(null);
  const [running, setRunning] = useState(false);

  function parseVals(text: string): number[] {
    return [
      ...new Set(
        text
          .split(/[,\s]+/)
          .map((x) => Number(x))
          .filter((x) => Number.isFinite(x) && x > 0),
      ),
    ];
  }

  function run() {
    const axes = [{ key: axisA, values: parseVals(valsA) }];
    if (axisB !== "none") axes.push({ key: axisB, values: parseVals(valsB) });
    if (axes.some((a) => a.values.length === 0)) return;
    setRunning(true);
    setTimeout(() => {
      try {
        setResult(runGrid({ bars: ltf, cfg, tf: cfg.ltf, axes, objective, minTrades }));
      } finally {
        setRunning(false);
      }
    }, 30);
  }

  function applyParams(params: Partial<Pick<DeskConfig, GridKey>>) {
    setCfg(params);
    runBt();
  }

  const wfe =
    result?.best && result.test
      ? walkForwardEfficiency(result.best.score, objectiveScore(result.test, result.objective))
      : null;

  // Heatmap only when the sweep is exactly two axes with two params per combo.
  const heat = useMemo(() => {
    if (!result || result.combos.length === 0) return null;
    const keySets = result.combos.map((c) => Object.keys(c.params));
    if (!keySets.every((k) => k.length === 2)) return null;
    const [ka, kb] = keySets[0] as [GridKey, GridKey];
    const aVals = [...new Set(result.combos.map((c) => c.params[ka] as number))];
    const bVals = [...new Set(result.combos.map((c) => c.params[kb] as number))];
    const cell = new Map<string, GridResult["combos"][number]>();
    for (const c of result.combos) {
      cell.set(`${c.params[ka]}|${c.params[kb]}`, c);
    }
    const scores = result.combos.map((c) => c.score).filter((v) => Number.isFinite(v));
    if (scores.length === 0) return null;
    return {
      ka,
      kb,
      aVals,
      bVals,
      cell,
      min: Math.min(...scores),
      max: Math.max(...scores),
    };
  }, [result]);

  function heatColor(score: number): string {
    if (heat == null || !Number.isFinite(score) || heat.max === heat.min) return "rgba(216,212,204,0.08)";
    const t = Math.max(0, Math.min(1, (score - heat.min) / (heat.max - heat.min)));
    const r = Math.round(184 - 123 * t);
    const g = Math.round(92 + 118 * t);
    const b = Math.round(74 + 128 * t);
    return `rgba(${r},${g},${b},${0.25 + 0.5 * t})`;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-3 font-display text-xl">Tối ưu walk-forward (train 70% → test 30%)</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <AxisPicker
            label="Trục A"
            axis={axisA}
            setAxis={(k) => {
              if (k !== "none") setAxisA(k);
            }}
            vals={valsA}
            setVals={setValsA}
          />
          <AxisPicker label="Trục B (tuỳ chọn)" axis={axisB} setAxis={setAxisB} vals={valsB} setVals={setValsB} allowNone />
          <label className="flex flex-col gap-1 text-[11px] text-muted uppercase">
            Objective (trên train)
            <select
              className="h-9 rounded-md bg-surface-2 px-2 text-sm text-fg"
              value={objective}
              onChange={(e) => setObjective(e.target.value as Objective)}
            >
              {Object.entries(OBJECTIVE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] text-muted uppercase">
            Số lệnh tối thiểu trên train
            <input
              type="number"
              className="h-9 rounded-md bg-surface-2 px-2 font-mono text-sm text-fg"
              value={minTrades}
              min={1}
              onChange={(e) => setMinTrades(Math.max(1, Number(e.target.value) || 1))}
            />
          </label>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <Button onClick={run} disabled={running}>
            {running ? <LoaderCircle className="animate-spin" /> : null}
            Chạy tối ưu
          </Button>
          <p className="text-[11px] text-subtle">
            Tối đa {MAX_COMBOS} tổ hợp — mỗi combo chỉ được chấm điểm trên train; combo tốt nhất mới
            được mặt trên test. Không quét 20 tham số trên 1 coin. Trục tham số tầng tín hiệu
            (KC/ADX/Donchian…) sẽ re-signal từng combo trước khi backtest — chính xác nhưng chậm hơn.
          </p>
        </div>
      </div>

      {result ? (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-xl bg-surface p-4">
              <p className="text-[11px] text-muted uppercase">Combo tốt nhất (train)</p>
              <p className="mt-1 font-mono text-sm text-fg">{result.best?.label ?? "—"}</p>
              <p className="mt-1 font-mono text-xs text-muted">
                {result.best
                  ? `${OBJECTIVE_LABELS[result.objective]} ${formatNumber(result.best.score, 2)} · ${result.best.train.trades} lệnh · DD ${formatPct(-result.best.train.maxDd, 1)}`
                  : "Không combo nào đủ số lệnh tối thiểu"}
              </p>
            </div>
            <div className="rounded-xl bg-surface p-4">
              <p className="text-[11px] text-muted uppercase">Test — out-of-sample (30% cuối)</p>
              {result.test ? (
                <p className="mt-1 font-mono text-xs text-fg">
                  Sharpe {formatNumber(result.test.sharpe, 2)} · DD {formatPct(-result.test.maxDd, 1)} ·{" "}
                  {result.test.trades} lệnh · PF {formatNumber(result.test.profitFactor, 2)}
                </p>
              ) : (
                <p className="mt-1 text-xs text-subtle">—</p>
              )}
            </div>
            <div className="rounded-xl bg-surface p-4">
              <p className="text-[11px] text-muted uppercase">
                Walk-forward efficiency {wfe != null ? `= ${formatNumber(wfe, 2)}` : ""}
              </p>
              <p className="mt-1 text-xs text-muted">
                {wfe == null
                  ? "Chỉ có khi test có số liệu và objective train hữu hạn."
                  : wfe >= 0.7
                    ? "≥ 0.7 — edge sống sót tốt sau tối ưu (hiếm)."
                    : wfe >= 0.3
                      ? "0.3–0.7 — một phần edge sống sót, thận trọng."
                      : "< 0.3 — nghi overfit: sweep đang fit nhiễu của train."}
              </p>
            </div>
          </div>

          {heat ? (
            <div className="rounded-xl bg-surface p-4">
              <h3 className="mb-3 font-display text-xl">
                Heatmap {OBJECTIVE_LABELS[result.objective]} — {GRID_LABELS[heat.ka]} (cột) × {GRID_LABELS[heat.kb]} (hàng)
              </h3>
              <div className="overflow-x-auto">
                <table className="border-separate border-spacing-0.5 text-[11px]">
                  <thead>
                    <tr>
                      <th className="px-2 pb-1 text-left text-muted">
                        {GRID_LABELS[heat.kb]} ↓ / {GRID_LABELS[heat.ka]} →
                      </th>
                      {heat.aVals.map((a) => (
                        <th key={a} className="px-2 pb-1 font-mono text-muted">
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular">
                    {heat.bVals.map((b) => (
                      <tr key={b}>
                        <td className="px-2 font-mono text-muted">{b}</td>
                        {heat.aVals.map((a) => {
                          const c = heat.cell.get(`${a}|${b}`);
                          const s = c?.score ?? Number.NaN;
                          return (
                            <td key={a} className="p-0">
                              <button
                                type="button"
                                disabled={!c}
                                onClick={() => c && applyParams(c.params)}
                                style={{ background: heatColor(s) }}
                                className="h-9 w-16 rounded text-[10px] text-fg hover:outline hover:outline-1 hover:outline-accent disabled:opacity-40"
                                title={
                                  c
                                    ? `Sharpe ${c.train.sharpe.toFixed(2)} · DD ${formatPct(-c.train.maxDd, 1)} · ${c.train.trades} lệnh — bấm để áp dụng`
                                    : "Không đủ lệnh"
                                }
                              >
                                {Number.isFinite(s) ? s.toFixed(2) : "—"}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-subtle">
                Màu càng sáng càng tốt theo objective (trên TRAIN). Bấm ô để áp dụng combo đó.
              </p>
            </div>
          ) : null}

          {result.test && result.control ? (
            <p className="text-xs text-muted">
              Đọc kết quả: combo tốt nhất chỉ đáng tin khi test **không tệ hơn hẳn** control — train
              đẹp mà test sập là dấu hiệu overfit kinh điển. Kết quả tối ưu không được dùng để claim
              thắng; claim vẫn đi qua gate Sharpe ≥ 0.8 / DD ≤ 25% trên test.
            </p>
          ) : null}

          <div className="rounded-xl bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-display text-xl">Bảng combo (xếp theo {OBJECTIVE_LABELS[result.objective]} train)</h3>
              {result.best ? (
                <Button variant="secondary" onClick={() => applyParams(result.best!.params)}>
                  Áp dụng combo tốt nhất
                </Button>
              ) : null}
            </div>
            <div className="max-h-[50dvh] overflow-auto">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-surface text-muted">
                  <tr>
                    <th className="pb-2">Tham số</th>
                    <th className="pb-2 text-right">Train {OBJECTIVE_LABELS[result.objective]}</th>
                    <th className="pb-2 text-right">Sharpe</th>
                    <th className="pb-2 text-right">Sortino</th>
                    <th className="pb-2 text-right">DD</th>
                    <th className="pb-2 text-right">Lệnh</th>
                    <th className="pb-2 text-right">PF</th>
                    <th className="pb-2 text-right">Avg R</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular">
                  {result.combos.map((c, i) => (
                    <tr key={c.label} className="border-t border-border">
                      <td className="py-1.5">{c.label}</td>
                      <td className="py-1.5 text-right">
                        {formatNumber(c.score, 2)}
                        {i === 0 ? <span className="ml-1 text-long">←</span> : null}
                      </td>
                      <td className="py-1.5 text-right">{formatNumber(c.train.sharpe, 2)}</td>
                      <td className="py-1.5 text-right">{formatNumber(c.train.sortino, 2)}</td>
                      <td className="py-1.5 text-right">{formatPct(-c.train.maxDd, 1)}</td>
                      <td className="py-1.5 text-right">{c.train.trades}</td>
                      <td className="py-1.5 text-right">{formatNumber(c.train.profitFactor, 2)}</td>
                      <td className="py-1.5 text-right">{formatNumber(c.train.avgR, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {result.truncated ? (
              <p className="mt-2 text-[11px] text-warn">Lưới vượt {MAX_COMBOS} tổ hợp — đã cắt bớt.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}

function AxisPicker({
  label,
  axis,
  setAxis,
  vals,
  setVals,
  allowNone,
}: {
  label: string;
  axis: GridKey | "none";
  setAxis: (k: GridKey | "none") => void;
  vals: string;
  setVals: (v: string) => void;
  allowNone?: boolean;
}) {
  const keys = Object.keys(GRID_LABELS) as GridKey[];
  return (
    <div className="grid grid-cols-2 gap-2">
      <label className="flex flex-col gap-1 text-[11px] text-muted uppercase">
        {label}
        <select
          className="h-9 rounded-md bg-surface-2 px-2 text-sm text-fg"
          value={axis}
          onChange={(e) => setAxis(e.target.value as GridKey | "none")}
        >
          {allowNone ? <option value="none">— không —</option> : null}
          {keys.map((k) => (
            <option key={k} value={k}>
              {GRID_LABELS[k]}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-[11px] text-muted uppercase">
        Giá trị (phân tách bởi dấu phẩy)
        <input
          className="h-9 rounded-md bg-surface-2 px-2 font-mono text-sm text-fg"
          value={vals}
          onChange={(e) => setVals(e.target.value)}
          disabled={axis === "none"}
        />
      </label>
    </div>
  );
}

/* ------------------------------- monte carlo ------------------------------- */

function MonteCarloTab({ trades, startEquity }: { trades: Trade[]; startEquity: number }) {
  const [mc, setMc] = useState<McResult | null>(null);
  const [running, setRunning] = useState(false);

  function run() {
    setRunning(true);
    setTimeout(() => {
      try {
        setMc(monteCarlo(trades, startEquity, { paths: 500, seed: 42 }));
      } finally {
        setRunning(false);
      }
    }, 30);
  }

  const maxBin = mc ? Math.max(...mc.ddHistogram.map((b) => b.count), 1) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-2 font-display text-xl">Monte Carlo — bootstrap thứ tự lệnh</h3>
        <p className="mb-3 max-w-3xl text-sm text-muted">
          Lấy lại mẫu {trades.length} lệnh đã thực hiện (có hoàn lại, seed cố định → chạy lại ra
          cùng kết quả), ghép thành 500 đường vốn giả định. Trả lời câu hỏi: “thứ tự lệnh thực tế
          có may mắn hơn phân phối không?” — Max DD p95 mới là con số nên dùng khi đặt daily-loss cap.
        </p>
        <Button onClick={run} disabled={running || trades.length === 0}>
          {running ? <LoaderCircle className="animate-spin" /> : null}
          Chạy 500 đường vốn
        </Button>
        {trades.length === 0 ? <p className="mt-2 text-xs text-warn">Cần có lệnh trong mẫu trước.</p> : null}
      </div>

      {mc ? (
        <>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Max DD — p5" value={formatPct(-mc.maxDdP5, 1)} />
            <Metric label="Max DD — p50" value={formatPct(-mc.maxDdP50, 1)} />
            <Metric label="Max DD — p95 (xấu)" value={formatPct(-mc.maxDdP95, 1)} warn={mc.maxDdP95 > 0.25} />
            <Metric label="P(DD ≥ 25%)" value={formatPct(mc.probDd25, 1)} warn={mc.probDd25 > 0.2} />
            <Metric label="Final × — p5" value={`${formatNumber(mc.finalP5, 3)}×`} warn={mc.finalP5 < 1} />
            <Metric label="Final × — p50" value={`${formatNumber(mc.finalP50, 3)}×`} />
            <Metric label="Final × — p95" value={`${formatNumber(mc.finalP95, 3)}×`} />
            <Metric label="P(DD ≥ 50%)" value={formatPct(mc.probDd50, 1)} warn={mc.probDd50 > 0.05} />
          </div>

          <div className="rounded-xl bg-surface p-4">
            <h3 className="mb-3 font-display text-xl">Phân phối Max DD (bin 5%)</h3>
            <div className="flex h-40 items-end gap-1">
              {mc.ddHistogram.map((b) => (
                <div key={b.from} className="flex min-w-6 flex-1 flex-col items-center gap-1">
                  <div
                    className={b.from >= 25 ? "w-full rounded-t bg-short/70" : "w-full rounded-t bg-accent/70"}
                    style={{ height: `${(b.count / maxBin) * 100}%` }}
                    title={`${b.count} đường vốn`}
                  />
                  <span className="text-[9px] text-subtle">{b.from}%</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-subtle">Trục ngang: đáy của Max DD; cột ≥ 25% tô đỏ (ngưỡng claim gate).</p>
          </div>
        </>
      ) : null}
    </div>
  );
}

/* --------------------------------- compare ---------------------------------- */

function PortfolioTab() {
  const ltf = useDesk((s) => s.ltf);
  const cfg = useDesk((s) => s.cfg);
  const [symbols, setSymbols] = useState<string[]>(["BTC/USDT", "ETH/USDT", "SOL/USDT"]);
  const [maxPositions, setMaxPositions] = useState(2);
  const [res, setRes] = useState<PortfolioResult | null>(null);
  const [compareRows, setCompareRows] = useState<CompareRow[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  function toggleSymbol(sym: string) {
    setSymbols((list) =>
      list.includes(sym) ? list.filter((x) => x !== sym) : [...list, sym],
    );
  }

  async function runPortfolioBacktest() {
    if (symbols.length === 0) {
      toast.error("Chọn ít nhất một symbol.");
      return;
    }
    setLoading("Đang tải nến cho từng symbol…");
    try {
      const inputs: PortfolioInput[] = [];
      for (const symbol of symbols) {
        setLoading(`Đang tải ${symbol}…`);
        const bundle = await loadOhlcv({
          data: {
            symbol,
            ltf: cfg.ltf,
            htf: HTF_FOR[cfg.ltf],
            market: "usdm",
            ltfBars: budgetFor(cfg.ltf),
            htfBars: htfBudget(HTF_FOR[cfg.ltf]),
          },
        });
        setLoading(`Đang tính ${symbol}…`);
        const symCfg = { ...cfg, symbol, strategyId: cfg.strategyId };
        inputs.push({ symbol, bars: buildDesk(bundle.ltf, bundle.htf, symCfg).ltf });
      }
      setLoading("Đang mô phỏng danh mục…");
      const out = runPortfolio(inputs, { ...cfg, maxPositions }, cfg.ltf);
      setRes(out);
      toast.success(
        `Danh mục ${symbols.length} symbol · ${out.trades.length} lệnh · Net ${formatPct(
          out.metrics.endEquity / out.metrics.startEquity - 1,
          1,
        )}`,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Portfolio backtest thất bại");
    } finally {
      setLoading(null);
    }
  }

  function runCompare() {
    setLoading("Đang chạy toàn kho trên symbol hiện tại…");
    setTimeout(() => {
      try {
        setCompareRows(compareStrategies(ltf, cfg, cfg.ltf));
      } finally {
        setLoading(null);
      }
    }, 30);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-2 font-display text-xl">Backtest danh mục đa symbol</h3>
        <p className="mb-3 max-w-3xl text-sm text-muted">
          Vốn chung cho mọi symbol, mỗi vị thế rủi ro {formatPct(cfg.riskPct, 2)} vốn danh mục,
          tối đa {maxPositions} vị thế mở cùng lúc, daily-loss cap chặn vào lệnh mới trên TOÀN bộ
          danh mục. Cùng chiến lược đang chọn ({STRATEGY_SELECT_OPTIONS.find((o) => o.id === cfg.strategyId)?.label ?? cfg.strategyId})
          và cùng engine next-bar với tester đơn.
        </p>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {UNIVERSE_SYMBOLS.map((sym) => (
            <button
              key={sym}
              type="button"
              onClick={() => toggleSymbol(sym)}
              className={
                symbols.includes(sym)
                  ? "h-9 rounded-full bg-accent px-3 text-xs text-accent-fg"
                  : "h-9 rounded-full bg-surface-2 px-3 text-xs text-muted hover:text-fg"
              }
            >
              {sym.replace("/USDT", "")}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] text-muted uppercase">
            Max vị thế mở
            <input
              type="number"
              min={1}
              max={symbols.length || 1}
              value={maxPositions}
              onChange={(e) => setMaxPositions(Math.max(1, Math.min(symbols.length || 1, Number(e.target.value) || 1)))}
              className="h-9 w-24 rounded-md bg-surface-2 px-2 font-mono text-sm text-fg"
            />
          </label>
          <Button onClick={() => void runPortfolioBacktest()} disabled={loading != null}>
            {loading != null ? <LoaderCircle className="animate-spin" /> : null}
            Chạy danh mục
          </Button>
          {loading ? <span className="text-xs text-muted">{loading}</span> : null}
        </div>
      </div>

      {res ? (
        <>
          <div className="rounded-xl bg-surface p-4">
            <Badge tone={res.claimBlocked ? "warn" : "long"}>
              {res.claimBlocked ? "Không được claim thắng" : "Ngưỡng tối thiểu đạt"}
            </Badge>
            <p className="mt-2 text-sm text-muted">{res.claimReason}</p>
          </div>

          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric hero label="Net profit" value={formatUsd(res.metrics.endEquity - res.metrics.startEquity)} warn={res.metrics.endEquity < res.metrics.startEquity} />
            <Metric hero label="Net profit %" value={formatPct(res.metrics.endEquity / res.metrics.startEquity - 1)} warn={res.metrics.endEquity < res.metrics.startEquity} />
            <Metric hero label="Max drawdown" value={formatPct(-res.metrics.maxDd)} warn={res.metrics.maxDd > 0.25} />
            <Metric hero label="Total trades" value={String(res.metrics.trades)} />
          </div>

          <h3 className="font-display text-xl">Danh mục (toàn mẫu)</h3>
          {metricGrid(res.metrics)}

          {res.testMetrics ? (
            <>
              <h3 className="font-display text-xl">Out-of-sample (30% cuối)</h3>
              {metricGrid(res.testMetrics)}
            </>
          ) : null}

          <h3 className="font-display text-xl">Buy & hold đều trọng số</h3>
          {metricGrid(res.buyHold)}

          <EquityChart equity={res.equity} buyHold={res.buyHoldEquity} />

          <PeriodTables equity={res.equity} trades={res.trades} initialEquity={res.metrics.startEquity} />

          <div className="rounded-xl bg-surface p-4">
            <h3 className="mb-3 font-display text-xl">Theo symbol</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="pb-2">Symbol</th>
                    <th className="pb-2 text-right">Lệnh</th>
                    <th className="pb-2 text-right">Win rate</th>
                    <th className="pb-2 text-right">PnL</th>
                    <th className="pb-2 text-right">Avg R</th>
                    <th className="pb-2 text-right">PF</th>
                  </tr>
                </thead>
                <tbody className="font-mono tabular">
                  {res.perSymbol.map((r) => (
                    <tr key={r.symbol} className="border-t border-border">
                      <td className="py-1.5 text-fg">{r.symbol}</td>
                      <td className="py-1.5 text-right">{r.trades}</td>
                      <td className="py-1.5 text-right">{formatPct(r.winRate, 1)}</td>
                      <td className={r.netPnl >= 0 ? "py-1.5 text-right text-long" : "py-1.5 text-right text-short"}>
                        {formatUsd(r.netPnl)}
                      </td>
                      <td className="py-1.5 text-right">{formatNumber(r.avgR, 2)}</td>
                      <td className="py-1.5 text-right">{formatNumber(r.pf, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-subtle">
              Max vị thế mở đồng thời: {res.maxConcurrent} · Ngày bị daily-loss halt: {res.dailyHaltDays}
            </p>
          </div>
        </>
      ) : null}

      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-2 font-display text-xl">So sánh chiến lược (symbol hiện tại, 1 vị thế)</h3>
        <p className="mb-3 max-w-3xl text-sm text-muted">
          Chạy cả {STRATEGY_SELECT_OPTIONS.length} lựa chọn trên symbol đang mở desk ({cfg.symbol} ·{" "}
          {cfg.ltf}) — đầy đủ metrics full-sample, đối chiếu tương đối.
        </p>
        <Button onClick={runCompare} disabled={loading != null}>
          {loading != null ? <LoaderCircle className="animate-spin" /> : null}
          Chạy so sánh
        </Button>
      </div>

      {compareRows ? (
        <div className="rounded-xl bg-surface p-4">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2">Chiến lược</th>
                  <th className="pb-2 text-right">Net %</th>
                  <th className="pb-2 text-right">Sharpe</th>
                  <th className="pb-2 text-right">Sortino</th>
                  <th className="pb-2 text-right">Max DD</th>
                  <th className="pb-2 text-right">PF</th>
                  <th className="pb-2 text-right">Lệnh</th>
                  <th className="pb-2 text-right">Win %</th>
                  <th className="pb-2 text-right">Exposure</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular">
                {compareRows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="py-1.5">
                      <span className="text-fg">{r.label}</span>
                      <span className="ml-2 text-[10px] text-subtle">{r.group.split("·")[0]}</span>
                    </td>
                    <td
                      className={
                        r.metrics.endEquity >= r.metrics.startEquity
                          ? "py-1.5 text-right text-long"
                          : "py-1.5 text-right text-short"
                      }
                    >
                      {formatPct(r.metrics.endEquity / r.metrics.startEquity - 1, 1)}
                    </td>
                    <td className="py-1.5 text-right">{formatNumber(r.metrics.sharpe, 2)}</td>
                    <td className="py-1.5 text-right">{formatNumber(r.metrics.sortino, 2)}</td>
                    <td className="py-1.5 text-right">{formatPct(-r.metrics.maxDd, 1)}</td>
                    <td className="py-1.5 text-right">{formatNumber(r.metrics.profitFactor, 2)}</td>
                    <td className="py-1.5 text-right">{r.metrics.trades}</td>
                    <td className="py-1.5 text-right">{formatPct(r.metrics.winRate, 0)}</td>
                    <td className="py-1.5 text-right">{formatPct(r.metrics.exposure, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
