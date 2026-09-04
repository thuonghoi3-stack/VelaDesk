import { Badge } from "@/components/ui/badge";
import { CandleChart } from "@/components/desk/candle-chart";
import { PATTERN_LABEL } from "@/lib/quant/features/patterns";
import { useDesk } from "@/lib/quant/store";
import { formatNumber, formatTimeUtc, formatUsd } from "@/lib/utils";
import type { Regime } from "@/lib/quant/types";

const REGIME: Record<Regime, { label: string; tone: "long" | "short" | "mute" | "warn" }> = {
  trending_up: { label: "Trending up", tone: "long" },
  trending_down: { label: "Trending down", tone: "short" },
  ranging: { label: "Ranging", tone: "mute" },
  mixed: { label: "Mixed", tone: "warn" },
};

function Cell({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0">
      <span className="text-xs text-muted">{k}</span>
      <span className="font-mono text-xs tabular text-fg">{v}</span>
    </div>
  );
}

export function AnalyzePanel() {
  const analysis = useDesk((s) => s.analysis);
  const ltf = useDesk((s) => s.ltf);
  const sourceNote = useDesk((s) => s.sourceNote);
  const loading = useDesk((s) => s.loading);
  if (!analysis || ltf.length === 0) {
    return (
      <div className="rounded-xl bg-surface p-6 text-sm text-muted">
        {loading ? "Đang tải nến…" : "Đang chờ dữ liệu nến. Bấm Tải nến hoặc Nến mô phỏng."}
      </div>
    );
  }
  const r = REGIME[analysis.regime];
  const b = analysis.confluenceBreakdown;
  const max = 100;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-surface p-3 md:p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="text-xs tracking-wide text-muted uppercase">
                {analysis.symbol} · {analysis.ltf} / HTF {analysis.htf}
              </p>
              <p className="font-mono text-2xl tabular text-fg">{formatUsd(analysis.lastClose, 2)}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone={r.tone}>{r.label}</Badge>
              {analysis.highVol ? <Badge tone="warn">High vol</Badge> : null}
              <Badge tone={analysis.htfBias === 1 ? "long" : analysis.htfBias === -1 ? "short" : "mute"}>
                HTF {analysis.htfBias === 1 ? "long" : analysis.htfBias === -1 ? "short" : "flat"}
              </Badge>
            </div>
          </div>
          <CandleChart bars={ltf.slice(-800)} />
          <p className="mt-2 text-[11px] text-subtle">{sourceNote}</p>
        </div>

        <div className="rounded-xl bg-surface p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="font-display text-xl text-fg">Confluence</h3>
            <span className="font-mono text-2xl tabular">{Math.round(analysis.confluence)}</span>
          </div>
          {(
            [
              ["Trend", b.trend, 25],
              ["Momentum", b.momentum, 25],
              ["Volatility", b.volatility, 20],
              ["Volume", b.volume, 15],
              ["Pattern", b.pattern, 15],
            ] as const
          ).map(([label, val, cap]) => (
            <div key={label} className="mb-2">
              <div className="mb-1 flex justify-between text-[11px] text-muted">
                <span>{label}</span>
                <span className="font-mono tabular">
                  {val}/{cap}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent"
                  style={{ width: `${(val / cap) * 100}%` }}
                />
              </div>
            </div>
          ))}
          <p className="mt-2 text-[11px] text-subtle">Tổng {Math.round(analysis.confluence)}/{max} — không phải lệnh. Chỉ đo sự đồng thuận rule.</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        <div className="rounded-xl bg-surface p-4">
          <h3 className="mb-2 font-display text-xl">Chỉ báo nến đóng</h3>
          <p className="mb-3 text-[11px] text-subtle">{formatTimeUtc(analysis.lastTime)}</p>
          <Cell k="EMA 20 / 50 / 200" v={`${fmt(analysis.indicators.ema20)} / ${fmt(analysis.indicators.ema50)} / ${fmt(analysis.indicators.ema200)}`} />
          <Cell k="ADX (14)" v={fmt(analysis.indicators.adx)} />
          <Cell k="RSI (14)" v={fmt(analysis.indicators.rsi)} />
          <Cell k="MACD hist" v={fmt(analysis.indicators.macdHist)} />
          <Cell k="Stoch %K" v={fmt(analysis.indicators.stochK)} />
          <Cell k="ATR / ATR SMA20" v={`${fmt(analysis.indicators.atr)} / ${fmt(analysis.indicators.atrSma20)}`} />
          <Cell k="BB width" v={fmt(analysis.indicators.bbWidth, 4)} />
          <Cell k="Vol spike" v={fmt(analysis.indicators.volSpike)} />
        </div>

        <div className="rounded-xl bg-surface p-4">
          <h3 className="mb-3 font-display text-xl">5 nến gần nhất</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[11px]">
              <thead className="text-muted">
                <tr>
                  <th className="pb-2 font-medium">UTC</th>
                  <th className="pb-2 font-medium">Close</th>
                  <th className="pb-2 font-medium">Pattern</th>
                  <th className="pb-2 font-medium">Sig</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular">
                {analysis.lastBars.map((bar) => (
                  <tr key={bar.time} className="border-t border-border">
                    <td className="py-1.5 text-muted">{formatTimeUtc(bar.time).slice(5, 16)}</td>
                    <td className="py-1.5">{formatNumber(bar.close, 2)}</td>
                    <td className="py-1.5">
                      {bar.pattern ? PATTERN_LABEL[bar.pattern.name] : "—"}
                    </td>
                    <td className={bar.signal === 1 ? "text-long" : bar.signal === -1 ? "text-short" : "text-subtle"}>
                      {bar.signal === 1 ? "L" : bar.signal === -1 ? "S" : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl bg-surface p-4">
          <h3 className="mb-3 font-display text-xl">Pattern</h3>
          {analysis.patterns.length === 0 ? (
            <p className="text-sm text-muted">Không có pattern đủ mạnh trên vài nến gần.</p>
          ) : (
            <ul className="space-y-2">
              {analysis.patterns.slice(0, 6).map((p) => (
                <li key={`${p.index}-${p.name}`} className="flex items-center justify-between text-sm">
                  <span>{PATTERN_LABEL[p.name]}</span>
                  <span className={p.direction === 1 ? "text-long" : p.direction === -1 ? "text-short" : "text-muted"}>
                    {p.direction === 1 ? "+1" : p.direction === -1 ? "−1" : "0"} · {(p.strength * 100).toFixed(0)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function fmt(v: unknown, d = 2): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "—";
  return v.toFixed(d);
}
