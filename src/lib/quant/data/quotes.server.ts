import { fetchKlines } from "./binance.server";

export type QuotesArgs = {
  symbols: string[];
  /** Sparklines cost one extra kline call per symbol — poll them rarely. */
  withSpark?: boolean;
};

export type Quote = {
  symbol: string;
  price: number | null;
  /** 24h change in percent (positive = up). */
  changePct: number | null;
  high24h: number | null;
  low24h: number | null;
  quoteVolume: number | null;
  /** Last 24 one-hour closes for the watchlist sparkline. */
  spark: number[];
  source: "binance" | "okx" | "none";
};

type BinanceTicker = {
  lastPrice?: string;
  priceChangePercent?: string;
  highPrice?: string;
  lowPrice?: string;
  quoteVolume?: string;
};

type OkxTicker = {
  data?: Array<{ last?: string; open24h?: string; high24h?: string; low24h?: string; volCcy24h?: string }>;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

async function getJson(url: string, timeoutMs = 6000): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "VelaDesk/1.0 (research terminal; paper only)" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

const compact = (sym: string): string => sym.replace("/", "").replace(":", "");
const okxInst = (sym: string): string => sym.replace("/", "-").replace(":", "-");

/**
 * One quote row per symbol: 24h ticker from Binance USDT-M, falling back to
 * Binance spot, then OKX. A sparkline (24 × 1h closes) rides along; when the
 * tickers all fail the row degrades to nulls instead of erroring the batch.
 */
async function loadOne(symbol: string, withSpark: boolean): Promise<Quote> {
  const base: Quote = {
    symbol,
    price: null,
    changePct: null,
    high24h: null,
    low24h: null,
    quoteVolume: null,
    spark: [],
    source: "none",
  };

  const endpoints = [
    `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${compact(symbol)}`,
    `https://api.binance.com/api/v3/ticker/24hr?symbol=${compact(symbol)}`,
  ];
  for (const url of endpoints) {
    try {
      const t = (await getJson(url)) as BinanceTicker;
      const price = num(t.lastPrice);
      if (price == null) continue;
      const spark = withSpark ? await loadSpark(symbol) : [];
      return {
        symbol,
        price,
        changePct: num(t.priceChangePercent),
        high24h: num(t.highPrice),
        low24h: num(t.lowPrice),
        quoteVolume: num(t.quoteVolume),
        spark,
        source: "binance",
      };
    } catch {
      /* next endpoint */
    }
  }

  try {
    const data = (await getJson(`https://www.okx.com/api/v5/market/ticker?instId=${okxInst(symbol)}`)) as OkxTicker;
    const row = data.data?.[0];
    const price = num(row?.last);
    const open = num(row?.open24h);
    if (price != null) {
      const spark = withSpark ? await loadSpark(symbol) : [];
      return {
        symbol,
        price,
        changePct: open && open > 0 ? (price / open - 1) * 100 : null,
        high24h: num(row?.high24h),
        low24h: num(row?.low24h),
        quoteVolume: num(row?.volCcy24h),
        spark,
        source: "okx",
      };
    }
  } catch {
    /* degrade to nulls */
  }
  return base;
}

async function loadSpark(symbol: string): Promise<number[]> {
  try {
    const bars = await fetchKlines(symbol, "1h", "usdm", 24);
    return bars.map((b) => b.close);
  } catch {
    return [];
  }
}

export async function fetchQuotesBundle(args: QuotesArgs): Promise<{ quotes: Quote[]; at: number }> {
  const spark = args.withSpark ?? false;
  const quotes = await Promise.all(args.symbols.map((s) => loadOne(s, spark)));
  return { quotes, at: Date.now() };
}

