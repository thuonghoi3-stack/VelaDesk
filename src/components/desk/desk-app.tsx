import { type ReactNode } from "react";
import { AlertTriangle, CandlestickChart, LoaderCircle } from "lucide-react";
import { AnalyzePanel } from "@/components/desk/analyze-panel";
import { BacktestPanel } from "@/components/desk/backtest-panel";
import { CodePanel } from "@/components/desk/code-panel";
import { PaperPanel } from "@/components/desk/paper-panel";
import { StrategyPanel } from "@/components/desk/strategy-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { loadOhlcv } from "@/lib/quant/data/load-ohlcv";
import { SYMBOLS, TIME_STOP } from "@/lib/quant/config";
import { useDesk, type DeskTab } from "@/lib/quant/store";
import type { Timeframe } from "@/lib/quant/types";
import { cn } from "@/lib/utils";

const TABS: { id: DeskTab; label: string }[] = [
  { id: "analyze", label: "Phân tích" },
  { id: "strategy", label: "Chiến lược" },
  { id: "backtest", label: "Backtest" },
  { id: "paper", label: "Replay" },
  { id: "code", label: "Python" },
];

function barBudget(tf: Timeframe): number {
  switch (tf) {
    case "15m":
      return 2500;
    case "1h":
      return 5000;
    case "4h":
      return 3200;
    case "1d":
      return 1200;
  }
}

export function DeskApp() {
  const cfg = useDesk((s) => s.cfg);
  const setCfg = useDesk((s) => s.setCfg);
  const tab = useDesk((s) => s.tab);
  const setTab = useDesk((s) => s.setTab);
  const loading = useDesk((s) => s.loading);
  const error = useDesk((s) => s.error);
  const ingest = useDesk((s) => s.ingest);
  const loadSynthetic = useDesk((s) => s.loadSynthetic);
  const runBt = useDesk((s) => s.runBt);
  const analysis = useDesk((s) => s.analysis);
  const source = useDesk((s) => s.source);

  async function loadLive() {
    const current = useDesk.getState().cfg;
    useDesk.setState({ loading: true, error: null });
    try {
      const bundle = await loadOhlcv({
        data: {
          symbol: current.symbol,
          ltf: current.ltf,
          htf: current.htf,
          market: current.market,
          ltfBars: barBudget(current.ltf),
          htfBars: barBudget(current.htf),
        },
      });
      ingest(bundle.ltf, bundle.htf, bundle.source, bundle.sourceNote);
      useDesk.getState().runBt();
    } catch (err) {
      useDesk.setState({
        loading: false,
        error: err instanceof Error ? err.message : "Không tải được nến",
      });
      useDesk.getState().loadSynthetic();
      useDesk.getState().runBt();
    }
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-md bg-surface-2">
                <CandlestickChart className="size-4 text-accent" />
              </span>
              <div>
                <p className="font-display text-2xl leading-none tracking-tight md:text-3xl">
                  Vela <span className="italic text-muted">Desk</span>
                </p>
                <p className="mt-1 text-[11px] tracking-wide text-subtle uppercase">Systematic research</p>
              </div>
            </div>
            <div className="flex max-w-xl items-start gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warn" />
              <p>
                Quá khứ không đảm bảo tương lai. Paper trade trước live. Đây không phải lời khuyên đầu tư.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-xl bg-surface p-3 md:p-4">
            <div className="flex flex-wrap gap-2">
              {SYMBOLS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCfg({ symbol: s })}
                  className={cn(
                    "h-11 rounded-full px-4 text-sm",
                    cfg.symbol === s ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <Field label="LTF">
                <select
                  className="h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg"
                  value={cfg.ltf}
                  onChange={(e) => {
                    const ltf = e.target.value as Timeframe;
                    setCfg({ ltf, timeStopBars: TIME_STOP[ltf] });
                  }}
                >
                  <option value="15m">15m intraday</option>
                  <option value="1h">1h</option>
                  <option value="4h">4h swing</option>
                  <option value="1d">1d</option>
                </select>
              </Field>
              <Field label="HTF">
                <select
                  className="h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg"
                  value={cfg.htf}
                  onChange={(e) => setCfg({ htf: e.target.value as Timeframe })}
                >
                  <option value="1h">1h</option>
                  <option value="4h">4h</option>
                  <option value="1d">1d</option>
                </select>
              </Field>
              <Field label="Thị trường">
                <select
                  className="h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg"
                  value={cfg.market}
                  onChange={(e) => setCfg({ market: e.target.value as "spot" | "usdm" })}
                >
                  <option value="usdm">USDT-M futures</option>
                  <option value="spot">Spot</option>
                </select>
              </Field>
              <Field label="Chiều">
                <select
                  className="h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg"
                  value={cfg.side}
                  onChange={(e) => setCfg({ side: e.target.value as "long_only" | "both" })}
                >
                  <option value="both">Long + short</option>
                  <option value="long_only">Chỉ long</option>
                </select>
              </Field>
              <Field label="Risk / lệnh">
                <select
                  className="h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg"
                  value={String(cfg.riskPct)}
                  onChange={(e) => setCfg({ riskPct: Number(e.target.value) })}
                >
                  <option value="0.005">0.50%</option>
                  <option value="0.0075">0.75%</option>
                  <option value="0.01">1.00%</option>
                </select>
              </Field>
              <Field label="Đòn bẩy max">
                <select
                  className="h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg"
                  value={String(cfg.maxLeverage)}
                  onChange={(e) => setCfg({ maxLeverage: Number(e.target.value) })}
                >
                  <option value="1">1x</option>
                  <option value="2">2x</option>
                  <option value="3">3x</option>
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void loadLive()} disabled={loading}>
                {loading ? <LoaderCircle className="animate-spin" /> : null}
                Tải nến
              </Button>
              <Button variant="secondary" onClick={() => { loadSynthetic(); runBt(); }} disabled={loading}>
                Nến mô phỏng
              </Button>
              <label className="flex h-11 items-center gap-2 rounded-md bg-surface-2 px-3 text-sm text-muted">
                <input
                  type="checkbox"
                  checked={cfg.tradeVolatility}
                  onChange={(e) => setCfg({ tradeVolatility: e.target.checked })}
                  className="size-4 accent-accent"
                />
                Trade khi ATR cực đoan
              </label>
              {source ? <Badge tone={source === "synthetic" ? "warn" : "fg"}>{source}</Badge> : null}
              {analysis ? (
                <span className="font-mono text-xs text-muted">
                  {analysis.symbol} {formatMaybe(analysis.lastClose)}
                </span>
              ) : null}
            </div>
            {error ? <p className="text-xs text-short">{error} — đã fallback mô phỏng nếu có.</p> : null}
          </div>

          <nav className="-mx-1 flex gap-1 overflow-x-auto pb-1" aria-label="Mục desk">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "h-11 shrink-0 rounded-full px-4 text-sm",
                  tab === t.id ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg",
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5 pb-16 md:px-6">
        {tab === "analyze" ? <AnalyzePanel /> : null}
        {tab === "strategy" ? <StrategyPanel /> : null}
        {tab === "backtest" ? <BacktestPanel /> : null}
        {tab === "paper" ? <PaperPanel /> : null}
        {tab === "code" ? <CodePanel /> : null}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-[11px] tracking-wide text-muted uppercase">
      {label}
      {children}
    </label>
  );
}

function formatMaybe(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
