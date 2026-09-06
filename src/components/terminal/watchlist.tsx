import { useEffect } from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";
import { loadQuotes, type Quote } from "@/lib/quant/data/quotes";
import { UNIVERSE_SYMBOLS } from "@/lib/quant/config";

type QuotesState = {
  quotes: Record<string, Quote>;
  status: "idle" | "loading" | "ok" | "error";
  at: number | null;
  refresh: (withSpark: boolean) => Promise<void>;
};

/** Shared quote poller — one refresh feeds watchlist, header and alerts. */
export const useQuotes = create<QuotesState>()((set, get) => ({
  quotes: {},
  status: "idle",
  at: null,
  refresh: async (withSpark) => {
    if (get().status === "loading") return;
    set({ status: "loading" });
    try {
      const res = await loadQuotes({ data: { symbols: [...UNIVERSE_SYMBOLS], withSpark } });
      set({
        quotes: Object.fromEntries(res.quotes.map((q) => [q.symbol, q])),
        status: "ok",
        at: res.at,
      });
    } catch {
      set({ status: "error" });
    }
  },
}));

function Spark({ values, up }: { values: number[]; up: boolean }) {
  if (values.length < 2) return <svg viewBox="0 0 72 24" className="h-6 w-[72px]" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values
    .map((v, i) => `${(i / (values.length - 1)) * 71 + 0.5},${22 - ((v - min) / span) * 20}`)
    .join(" ");
  return (
    <svg viewBox="0 0 72 24" className="h-6 w-[72px]" preserveAspectRatio="none">
      <polyline
        points={pts}
        fill="none"
        stroke={up ? "#3d8b7a" : "#b85c4a"}
        strokeWidth="1.25"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Watchlist({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (symbol: string) => void;
}) {
  const quotes = useQuotes((s) => s.quotes);
  const status = useQuotes((s) => s.status);
  const refresh = useQuotes((s) => s.refresh);

  useEffect(() => {
    // Sparklines only on first load; poll refreshes tickers only.
    const first = Object.keys(useQuotes.getState().quotes).length === 0;
    void refresh(first);
    const id = window.setInterval(() => void refresh(false), 20_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-[11px] tracking-wide text-muted uppercase">Watchlist USDT-M</p>
        <button
          type="button"
          onClick={() => void refresh(false)}
          className="text-[11px] text-subtle hover:text-fg"
          title="Làm mới giá"
        >
          {status === "loading" ? "…" : "↻"}
        </button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto">
        {UNIVERSE_SYMBOLS.map((s) => {
          const q = quotes[s];
          const up = (q?.changePct ?? 0) >= 0;
          return (
            <li key={s}>
              <button
                type="button"
                onClick={() => onSelect(s)}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left hover:bg-surface-2",
                  s === active && "bg-surface-2",
                )}
              >
                <span className="min-w-0">
                  <span className={cn("block truncate text-xs", s === active ? "text-fg" : "text-muted")}>
                    {s.replace("/USDT", "")}
                  </span>
                  <span className="block font-mono text-xs tabular text-fg">
                    {q?.price != null ? fmtPrice(q.price) : "—"}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {q?.spark.length ? <Spark values={q.spark} up={up} /> : null}
                  <span className={cn("w-14 text-right font-mono text-xs tabular", up ? "text-long" : "text-short")}>
                    {q?.changePct != null ? `${up ? "+" : ""}${q.changePct.toFixed(2)}%` : "—"}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function fmtPrice(p: number): string {
  return p >= 1000
    ? p.toLocaleString("en-US", { maximumFractionDigits: 1 })
    : p >= 1
      ? p.toFixed(3)
      : p.toFixed(5);
}
