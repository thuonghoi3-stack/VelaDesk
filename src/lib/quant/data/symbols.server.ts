import { z } from "zod";

export type SymbolSearchResult = {
  symbols: string[];
  at: number;
  source: "binance" | "none";
};

export type SymbolSearchArgs = { quote?: string };

/**
 * Full perpetual universe from Binance exchangeInfo (status TRADING,
 * USDT-quoted, PERPETUAL contracts) — used by the chart symbol search
 * (TradingView-style "/" lookup). Server-only; wrapped by symbols.ts.
 */
export async function fetchSymbolUniverse(args: SymbolSearchArgs): Promise<SymbolSearchResult> {
  const quote = args.quote ?? "USDT";
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch("https://fapi.binance.com/fapi/v1/exchangeInfo", {
      signal: ctrl.signal,
      headers: { "User-Agent": "VelaDesk/1.0 (research terminal; paper only)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as {
      symbols?: Array<{
        symbol: string;
        status: string;
        contractType: string;
        quoteAsset: string;
        baseAsset: string;
      }>;
    };
    const symbols = (json.symbols ?? [])
      .filter(
        (s) =>
          s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === quote,
      )
      .map((s) => `${s.baseAsset}/${s.quoteAsset}`)
      .sort((a, b) => a.localeCompare(b));
    return { symbols, at: Date.now(), source: "binance" };
  } catch {
    return { symbols: [], at: Date.now(), source: "none" };
  } finally {
    clearTimeout(timer);
  }
}

void z; // zod stays out of the server module — validator lives in the wrapper
