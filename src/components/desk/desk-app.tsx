import { type ReactNode, useEffect, useState } from "react";
import { AlertTriangle, ChevronDown, LoaderCircle, SlidersHorizontal } from "lucide-react";
import { AnalyzePanel } from "@/components/desk/analyze-panel";
import { TesterPanel } from "@/components/desk/tester-panel";
import { CodePanel } from "@/components/desk/code-panel";
import { PaperPanel } from "@/components/desk/paper-panel";
import { StrategyPanel } from "@/components/desk/strategy-panel";
import { PlaybookPanel } from "@/components/desk/playbook-panel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TermNav } from "@/components/terminal/term-nav";
import { TIME_STOP, UNIVERSE_SYMBOLS } from "@/lib/quant/config";
import { STRATEGY_SELECT_OPTIONS } from "@/lib/quant/strategy/library";
import { useDesk, type DeskTab } from "@/lib/quant/store";
import type { DeskConfig, Timeframe } from "@/lib/quant/types";
import { cn } from "@/lib/utils";
import "./desk-shell.css";

const TABS: { id: DeskTab; label: string }[] = [
  { id: "playbook", label: "Playbook Lab" },
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
  const [executionOpen, setExecutionOpen] = useState(false);
  const cfg = useDesk((s) => s.cfg);
  const setCfg = useDesk((s) => s.setCfg);
  const tab = useDesk((s) => s.tab);
  const setTab = useDesk((s) => s.setTab);
  const [testerVisited, setTesterVisited] = useState(tab === "backtest");
  useEffect(() => {
    if (tab === "backtest") setTesterVisited(true);
  }, [tab]);
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
    <div className="desk-shell flex min-h-dvh flex-col bg-bg text-fg">
      <TermNav />

      <section className="desk-controls" aria-label="Cấu hình desk">
        <div className="desk-primary">
          <fieldset className="desk-instrument">
            <legend>Thị trường & khung thời gian</legend>
            <div className="desk-instrument-fields">
              <CompactField label="Symbol">
                <select
                  className="desk-select desk-symbol"
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
                  options={(["1h", "4h", "1d", "1w"] as Timeframe[]).map((t) => ({
                    value: t,
                    label: t,
                  }))}
                />
              </CompactField>
            </div>
          </fieldset>
          <div className="desk-strategy">
            <CompactField label="Chiến lược">
              <Select
                value={cfg.strategyId}
                onChange={(v) => setCfg({ strategyId: v as DeskConfig["strategyId"] })}
                options={STRATEGY_SELECT_OPTIONS.map((o) => ({ value: o.id, label: o.label }))}
              />
            </CompactField>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="desk-execution-toggle"
            aria-expanded={executionOpen}
            aria-controls="desk-execution-settings"
            onClick={() => setExecutionOpen((open) => !open)}
          >
            <SlidersHorizontal aria-hidden="true" />
            Thiết lập thực thi
            <ChevronDown aria-hidden="true" className={executionOpen ? "rotate-180" : undefined} />
          </Button>
        </div>
        <div id="desk-execution-settings" hidden={!executionOpen}>
          <fieldset className="desk-execution">
            <legend>Thực thi & quản trị rủi ro</legend>
            <div className="desk-execution-fields">
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
              <label className="desk-volatility" title="Cho phép vào lệnh khi ATR > 2× SMA">
                <input
                  type="checkbox"
                  checked={cfg.tradeVolatility}
                  onChange={(e) => setCfg({ tradeVolatility: e.target.checked })}
                  className="size-3.5 accent-accent"
                />
                ATR cực đoan
              </label>
            </div>
          </fieldset>
        </div>
        <div className="desk-data-row">
          <div className="desk-source" role="status">
            {source ? <Badge tone={source === "synthetic" ? "warn" : "fg"}>{source}</Badge> : null}
            {analysis ? (
              <span className="font-mono text-xs tabular text-muted">
                {analysis.symbol} {formatMaybe(analysis.lastClose)}
              </span>
            ) : null}
          </div>
          <div className="desk-data-actions">
            <Button onClick={() => void loadLive()} disabled={loading} className="h-11">
              {loading ? <LoaderCircle className="animate-spin" /> : null}
              Tải nến
            </Button>
            <Button variant="secondary" onClick={loadSynthetic} disabled={loading} className="h-11">
              Mô phỏng
            </Button>
          </div>
        </div>
        {error ? (
          <p role="alert" className="desk-error">
            <AlertTriangle className="size-3 shrink-0" />
            {error} — đã fallback mô phỏng nếu có.
          </p>
        ) : null}
      </section>

      <nav className="desk-tabs" aria-label="Mục desk">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => setTab(t.id)}
            className={cn(
              "desk-tab",
              tab === t.id
                ? "bg-surface-2 text-fg"
                : "text-muted hover:bg-surface-2/60 hover:text-fg",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="desk-main mx-auto w-full max-w-7xl flex-1 px-3 py-4 pb-16 md:px-6">
        {tab === "playbook" ? <PlaybookPanel /> : null}
        {tab === "analyze" ? <AnalyzePanel /> : null}
        {tab === "strategy" ? <StrategyPanel /> : null}
        {testerVisited || tab === "backtest" ? (
          <div hidden={tab !== "backtest"}>
            <TesterPanel />
          </div>
        ) : null}
        {tab === "paper" ? <PaperPanel /> : null}
        {tab === "code" ? <CodePanel /> : null}
      </main>

      <footer className="desk-footer">
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
    <label className="desk-field">
      <span className="desk-field-label">{label}</span>
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
    <select className="desk-select" value={value} onChange={(e) => onChange(e.target.value)}>
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
