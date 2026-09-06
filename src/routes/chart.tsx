import { createFileRoute } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { ChartWorkspace } from "@/components/terminal/chart-workspace";
import { TermNav } from "@/components/terminal/term-nav";
import type { Timeframe } from "@/lib/quant/types";

type ChartSearch = { symbol?: string; tf?: Timeframe };

export const Route = createFileRoute("/chart")({
  validateSearch: (search: Record<string, unknown>): ChartSearch => {
    const symbol = typeof search.symbol === "string" && search.symbol.length >= 3 ? search.symbol : undefined;
    const tf = ["15m", "1h", "4h", "1d"].includes(String(search.tf)) ? (search.tf as Timeframe) : undefined;
    return { symbol, tf };
  },
  component: ChartPage,
});

function ChartPage() {
  const { symbol, tf } = Route.useSearch();
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <TermNav subtitle="Biểu đồ tương tác · watchlist · alert theo giá · signal theo rule" />
      <ChartWorkspace initialSymbol={symbol} initialTf={tf} />
      <Toaster theme="dark" position="bottom-right" />
    </div>
  );
}
