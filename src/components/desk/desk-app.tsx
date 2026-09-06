import { type ReactNode, useEffect } from "react";
import { AlertTriangle, LoaderCircle } from "lucide-react";
import { AnalyzePanel } from "@/components/desk/analyze-panel";
import { TesterPanel } from "@/components/desk/tester-panel";
import { CodePanel } from "@/components/desk/code-panel";
import { PaperPanel } from "@/components/desk/paper-panel";
import { StrategyPanel } from "@/components/desk/strategy-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TermNav } from "@/components/terminal/term-nav";
import { TIME_STOP, UNIVERSE_SYMBOLS } from "@/lib/quant/config";
import { STRATEGY_SELECT_OPTIONS } from "@/lib/quant/strategy/library";
import { useDesk, type DeskTab } from "@/lib/quant/store";
import type { DeskConfig, Timeframe } from "@/lib/quant/types";
import { cn } from "@/lib/utils";

const TABS: { id: DeskTab; label: string }[] = [
  { id: "analyze", label: "Phân tích" },
  { id: "strategy", label: "Chiến lược" },
  { id: "backtest", label: "Tester" },
  { id: "paper", label: "Replay" },
  { id: "code", label: "Python" },
];

const LTF_OPTIONS: { value: Timeframe; label: string }[] = [
  { value: "5m", label: "5m scalp" },
  { value: "15m", label: "15m" },
  { value: "30m", label: "30m" },
  { value: "1h", label: "1h" },
  { value: "2h", label: "2h" },
  { value: "4h", label: "4h swing" },
  { value: "1d", label: "1d" },
  { value: "1w", label: "1w" },
];

export function DeskApp() {
  const cfg = useDesk((s) => s.cfg);
  const setCfg = useDesk((s) => s.setCfg);
  const tab = useDesk((s) => s.tab);
  const setTab = useDesk((s) => s.setTab);
  const loading = useDesk((s) => s.loading);
  const error = useDesk((s) => s.error);
  const loadLive = useDesk((s) => s.loadLive);
  const loadSynthetic = useDesk((s) => s.loadSynthetic);
  const analysis = useDesk((s) => s.analysis);
  const source = useDesk((s) => s.source);

  useEffect(() => {
    // Client-only seed: SSR renders the empty shell, the store fills after
    // mount (synthetic timestamps use Date.now() — never during SSR).
    if (useDesk.getState().ltf.length === 0) {
      useDesk.getState().loadSynthetic();
    }
  }, []);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <TermNav />

      {/* — compact config toolbar (TV-style single strip) — */}
      <div className="border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
          <CompactField label="Symbol">
            <select
              className="h-9 w-32 rounded-md bg-surface-2 px-2 font-display text-sm text-fg"
              value={cfg.symbol}
              onChange={(e) => setCfg({ symbol: e.target.value })}
            >
              {UNIVERSE_SYMBOLS.map((sym) => (
                <option key={sym} value={sym}>
                  {sym.replace("/USDT", "")}
                </option>
              ))}
            </select>
          </CompactField>
          <CompactField label="LTF">
            <Select
              value={cfg.ltf}
              onChange={(v) => {
                const ltf = v as Timeframe;
                setCfg({ ltf, timeStopBars: TIME_STOP[ltf] });
              }}
              options={LTF_OPTIONS}
            />
          </CompactField>
          <CompactField label="HTF">
            <Select
              value={cfg.htf}
              onChange={(v) => setCfg({ htf: v as Timeframe })}
              options={(["1h", "4h", "1d", "1w"] as Timeframe[]).map((t) => ({ value: t, label: t }))}
            />
          </CompactField>
          <CompactField label="Chiến lược">
            <Select
              value={cfg.strategyId}
              onChange={(v) => setCfg({ strategyId: v as DeskConfig["strategyId"] })}
              options={STRATEGY_SELECT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
            />
          </CompactField>
          <CompactField label="Thị trường">
            <Select
              value={cfg.market}
              onChange={(v) => setCfg({ market: v as "spot" | "usdm" })}
              options={[
                { value: "usdm", label: "USDT-M" },
                { value: "spot", label: "Spot" },
              ]}
            />
          </CompactField>
          <CompactField label="Chiều">
            <Select
              value={cfg.side}
              onChange={(v) => setCfg({ side: v as "long_only" | "both" })}
              options={[
                { value: "both", label: "L + S" },
                { value: "long_only", label: "Chỉ long" },
              ]}
            />
          </CompactField>
          <CompactField label="Risk">
            <Select
              value={String(cfg.riskPct)}
              onChange={(v) => setCfg({ riskPct: Number(v) })}
              options={[
                { value: "0.005", label: "0.50%" },
                { value: "0.0075", label: "0.75%" },
                { value: "0.01", label: "1.00%" },
              ]}
            />
          </CompactField>
          <CompactField label="Đòn bẩy">
            <Select
              value={String(cfg.maxLeverage)}
              onChange={(v) => setCfg({ maxLeverage: Number(v) })}
              options={[
                { value: "1", label: "1x" },
                { value: "2", label: "2x" },
                { value: "3", label: "3x" },
              ]}
            />
          </CompactField>
          <label
            className="flex h-9 cursor-pointer items-center gap-1.5 rounded-md bg-surface-2 px-2.5 text-xs text-muted"
            title="Cho phép vào lệnh khi ATR > 2× SMA"
          >
            <input
              type="checkbox"
              checked={cfg.tradeVolatility}
              onChange={(e) => setCfg({ tradeVolatility: e.target.checked })}
              className="size-3.5 accent-accent"
            />
            ATR cực đoan
          </label>

          <div className="ml-auto flex items-center gap-2">
            {source ? <Badge tone={source === "synthetic" ? "warn" : "fg"}>{source}</Badge> : null}
            {analysis ? (
              <span className="hidden font-mono text-xs tabular text-muted md:inline">
                {analysis.symbol} {formatMaybe(analysis.lastClose)}
              </span>
            ) : null}
            <Button onClick={() => void loadLive()} disabled={loading} className="h-9">
              {loading ? <LoaderCircle className="animate-spin" /> : null}
              Tải nến
            </Button>
            <Button variant="secondary" onClick={loadSynthetic} disabled={loading} className="h-9">
              Mô phỏng
            </Button>
          </div>
        </div>
        {error ? (
          <p className="mt-2 flex items-center gap-1.5 text-[11px] text-short">
            <AlertTriangle className="size-3 shrink-0" />
            {error} — đã fallback mô phỏng nếu có.
          </p>
        ) : null}
      </div>

      <nav
        className="flex gap-1 overflow-x-auto border-b border-border px-3 py-1.5"
        aria-label="Mục desk"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "h-9 shrink-0 rounded-full px-4 text-sm",
              tab === t.id
                ? "bg-surface-2 text-fg"
                : "text-muted hover:bg-surface-2/60 hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-16 md:px-6">
        {tab === "analyze" ? <AnalyzePanel /> : null}
        {tab === "strategy" ? <StrategyPanel /> : null}
        {tab === "backtest" ? <TesterPanel /> : null}
        {tab === "paper" ? <PaperPanel /> : null}
        {tab === "code" ? <CodePanel /> : null}
      </main>

      <footer className="border-t border-border px-4 py-2 text-[11px] text-subtle">
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="size-3 text-warn" />
          Quá khứ không đảm bảo tương lai · Paper trade trước live · Không phải lời khuyên đầu tư.
        </span>
      </footer>
    </div>
  );
}

/* --------------------------------- toolbar bits ----------------------------- */

function CompactField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-0.5">
      <span className="text-[10px] leading-none tracking-wide text-subtle uppercase">{label}</span>
      {children}
    </label>
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      className="h-9 rounded-md bg-surface-2 px-2 text-xs text-fg"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function formatMaybe(n: number): string {
  if (!Number.isFinite(n)) return "";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
