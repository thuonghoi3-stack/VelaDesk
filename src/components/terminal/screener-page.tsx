import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowUpDown, LoaderCircle, RefreshCw } from "lucide-react";
import { Toaster } from "sonner";
import { Badge } from "@/components/ui/badge";
import { TermNav } from "@/components/terminal/term-nav";
import { UNIVERSE_SYMBOLS } from "@/lib/quant/config";
import { scanMarket, type ScanRow } from "@/lib/quant/data/scan";
import type { Regime, Timeframe } from "@/lib/quant/types";
import { cn, formatDateUtc } from "@/lib/utils";

const REGIME_TONE: Record<Regime, "long" | "short" | "mute" | "warn"> = {
  trending_up: "long",
  trending_down: "short",
  ranging: "mute",
  mixed: "warn",
};

const REGIME_LABEL: Record<Regime, string> = {
  trending_up: "Up",
  trending_down: "Down",
  ranging: "Range",
  mixed: "Mixed",
};

type SortKey = "symbol" | "price" | "changePct" | "adx" | "rsi" | "atrPct" | "confluence";

const COLUMNS: { key: SortKey; label: string; numeric: boolean }[] = [
  { key: "symbol", label: "Symbol", numeric: false },
  { key: "price", label: "Giá", numeric: true },
  { key: "changePct", label: "24 nến", numeric: true },
  { key: "adx", label: "ADX", numeric: true },
  { key: "rsi", label: "RSI", numeric: true },
  { key: "atrPct", label: "ATR%", numeric: true },
  { key: "confluence", label: "Confluence", numeric: true },
];

export function ScreenerPage() {
  const [ltf, setLtf] = useState<Timeframe>("1h");
  const [rows, setRows] = useState<ScanRow[]>([]);
  const [scannedAt, setScannedAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [regimeFilter, setRegimeFilter] = useState<Regime | "all">("all");
  const [onlySignal, setOnlySignal] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "confluence", dir: -1 });
  const [autoRefresh, setAutoRefresh] = useState<0 | 30 | 60>(0);

  function exportCsv() {
    const header = "symbol,price,change24bars,regime,adx,rsi,atr_pct,confluence,htf_bias,pending_signal,strategy,source";
    const lines = visible.map((r) =>
      [
        r.symbol,
        r.price ?? "",
        r.changePct?.toFixed(3) ?? "",
        r.regime ?? "",
        r.adx?.toFixed(2) ?? "",
        r.rsi?.toFixed(2) ?? "",
        r.atrPct?.toFixed(3) ?? "",
        r.confluence?.toFixed(0) ?? "",
        r.htfBias,
        r.pendingSignal,
        r.pendingStrategy,
        r.source,
      ].join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vela-screener-${ltf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const run = useCallback(async (timeframe: Timeframe) => {
    setLoading(true);
    try {
      const res = await scanMarket({
        data: { symbols: [...UNIVERSE_SYMBOLS], ltf: timeframe, htf: "4h", market: "usdm" },
      });
      setRows(res.rows);
      setScannedAt(res.scannedAt);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void run(ltf);
  }, [ltf, run]);

  const ltfRef = useRef(ltf);
  ltfRef.current = ltf;
  const runRef = useRef(run);
  runRef.current = run;

  useEffect(() => {
    if (!autoRefresh) return;
    const id = window.setInterval(() => void runRef.current(ltfRef.current), autoRefresh * 1000);
    return () => window.clearInterval(id);
  }, [autoRefresh]);

  const visible = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (regimeFilter !== "all" && r.regime !== regimeFilter) return false;
      if (onlySignal && r.pendingSignal === 0) return false;
      return true;
    });
    const val = (r: ScanRow): number | string => {
      if (sort.key === "symbol") return r.symbol;
      const v = r[sort.key];
      return typeof v === "number" && Number.isFinite(v) ? v : -Infinity;
    };
    return filtered.sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (typeof va === "string" || typeof vb === "string") {
        return String(va).localeCompare(String(vb)) * sort.dir;
      }
      return (va - vb) * sort.dir;
    });
  }, [rows, regimeFilter, onlySignal, sort]);

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <TermNav subtitle="Quét theo cùng rule với chart — regime, confluence, tín hiệu chờ" />
      <Toaster theme="dark" position="bottom-right" />

      <main className="mx-auto w-full max-w-6xl flex-1 px-3 py-4 md:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="mr-2 font-display text-2xl">Screener</h1>
          {(["15m", "1h", "4h", "1d"] as Timeframe[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLtf(t)}
              className={cn(
                "h-9 rounded-md px-3 text-xs",
                ltf === t ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted hover:text-fg",
              )}
            >
              {t}
            </button>
          ))}
          <select
            className="h-9 rounded-md bg-surface-2 px-2 text-xs text-fg"
            value={regimeFilter}
            onChange={(e) => setRegimeFilter(e.target.value as Regime | "all")}
          >
            <option value="all">Mọi regime</option>
            <option value="trending_up">trending_up</option>
            <option value="trending_down">trending_down</option>
            <option value="ranging">ranging</option>
            <option value="mixed">mixed</option>
          </select>
          <label className="flex h-9 items-center gap-2 rounded-md bg-surface-2 px-3 text-xs text-muted">
            <input
              type="checkbox"
              checked={onlySignal}
              onChange={(e) => setOnlySignal(e.target.checked)}
              className="size-3.5 accent-accent"
            />
            Chỉ có signal
          </label>
          <button
            type="button"
            onClick={() => void run(ltf)}
            disabled={loading}
            className="flex h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-xs text-accent-fg disabled:opacity-60"
          >
            {loading ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Quét lại
          </button>
          <select
            className="h-9 rounded-md bg-surface-2 px-2 text-xs text-fg"
            value={autoRefresh}
            onChange={(e) => setAutoRefresh(Number(e.target.value) as 0 | 30 | 60)}
            title="Tự quét lại định kỳ"
          >
            <option value={0}>Tự quét: tắt</option>
            <option value={30}>Tự quét: 30s</option>
            <option value={60}>Tự quét: 60s</option>
          </select>
          <button
            type="button"
            onClick={exportCsv}
            disabled={visible.length === 0}
            className="h-9 rounded-md bg-surface-2 px-3 text-xs text-muted hover:text-fg disabled:opacity-50"
            title="Tải bảng hiện tại dưới dạng CSV"
          >
            Xuất CSV
          </button>
          {scannedAt ? (
            <span className="text-[11px] text-subtle">Chạy lúc {formatDateUtc(scannedAt)}</span>
          ) : null}
        </div>

        <div className="mt-4 overflow-x-auto rounded-xl bg-surface">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-muted">
                {COLUMNS.map((c) => (
                  <th key={c.key} className={cn("py-2.5 pl-3", c.numeric ? "text-right" : "")}>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 hover:text-fg"
                      onClick={() =>
                        setSort((s) => ({ key: c.key, dir: s.key === c.key && s.dir === -1 ? 1 : -1 }))
                      }
                    >
                      {c.label}
                      <ArrowUpDown className={cn("size-3", sort.key === c.key ? "text-fg" : "text-subtle")} />
                    </button>
                  </th>
                ))}
                <th className="py-2.5 pl-3 text-right">HTF bias</th>
                <th className="py-2.5 pl-3 text-right">Signal</th>
                <th className="py-2.5 px-3 text-right">Nguồn</th>
              </tr>
            </thead>
            <tbody className="font-mono tabular">
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-3 py-6 text-center text-subtle">
                    {loading ? "Đang quét…" : "Không có dòng nào khớp bộ lọc."}
                  </td>
                </tr>
              ) : (
                visible.map((r) => (
                  <tr key={r.symbol} className="border-t border-border hover:bg-surface-2/60">
                    <td className="py-2 pl-3">
                      <Link
                        to="/chart"
                        search={{ symbol: r.symbol, tf: ltf }}
                        className="text-fg hover:text-accent"
                      >
                        {r.symbol}
                      </Link>
                    </td>
                    <NumCell v={r.price} digits={r.price != null && r.price >= 100 ? 1 : 4} />
                    <NumCell v={r.changePct} digits={2} pct />
                    <NumCell v={r.adx} digits={1} />
                    <NumCell v={r.rsi} digits={1} />
                    <NumCell v={r.atrPct} digits={2} pct />
                    <td className="py-2 pl-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-surface-2 md:block">
                          <div
                            className="h-full rounded-full bg-accent"
                            style={{ width: `${Math.max(0, Math.min(100, r.confluence ?? 0))}%` }}
                          />
                        </div>
                        <span>{r.confluence != null ? Math.round(r.confluence) : "—"}</span>
                      </div>
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {r.regime ? (
                        <Badge tone={REGIME_TONE[r.regime]}>{REGIME_LABEL[r.regime]}</Badge>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="py-2 pl-3 text-right">
                      {r.pendingSignal === 1 ? (
                        <span className="text-long">LONG</span>
                      ) : r.pendingSignal === -1 ? (
                        <span className="text-short">SHORT</span>
                      ) : (
                        <span className="text-subtle">—</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right">
                      <span className={r.source === "synthetic" ? "text-warn" : "text-subtle"}>{r.source}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <p className="mt-3 text-[11px] text-subtle">
          Confluence 0–100 là thước đo đồng thuận rule (trend + momentum + volatility + volume + pattern),
          không phải lệnh. Nguồn synthetic nghĩa là sàn không tới được lúc quét — hàng đó chỉ để demo.
        </p>
      </main>
    </div>
  );
}

function NumCell({ v, digits, pct }: { v: number | null; digits: number; pct?: boolean }) {
  const finite = v != null && Number.isFinite(v);
  return (
    <td
      className={cn(
        "py-2 pl-3 text-right",
        !finite ? "text-subtle" : pct && v < 0 ? "text-short" : pct && v > 0 ? "text-long" : "text-fg",
      )}
    >
      {finite
        ? `${pct && v > 0 ? "+" : ""}${v.toFixed(digits)}${pct ? "%" : ""}`
        : "—"}
    </td>
  );
}
