import { INTERVAL_MS } from "../config";
import { generateSynthetic } from "./synthetic";
import type { DataSource, Ohlcv, Timeframe } from "../types";

const BINANCE_TF: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1h",
  "4h": "4h",
  "1d": "1d",
};

const OKX_TF: Record<Timeframe, string> = {
  "15m": "15m",
  "1h": "1H",
  "4h": "4H",
  "1d": "1Dutc",
};

export type MarketBundle = {
  ltf: Ohlcv[];
  htf: Ohlcv[];
  source: DataSource;
  sourceNote: string;
};

function toSymbol(sym: string): string {
  return sym.replace("/", "").replace(":", "");
}

function parseBinance(row: unknown[]): Ohlcv | null {
  if (!Array.isArray(row) || row.length < 6) return null;
  const time = Number(row[0]);
  const open = Number(row[1]);
  const high = Number(row[2]);
  const low = Number(row[3]);
  const close = Number(row[4]);
  const volume = Number(row[5]);
  if (![time, open, high, low, close, volume].every(Number.isFinite)) return null;
  return { time, open, high, low, close, volume };
}

async function getJson(url: string, timeoutMs = 5000): Promise<unknown> {
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

async function fetchBinancePages(
  base: string,
  symbol: string,
  tf: Timeframe,
  maxBars: number,
): Promise<Ohlcv[]> {
  const interval = INTERVAL_MS[tf];
  const out: Ohlcv[] = [];
  let endTime: number | undefined;
  const pages = Math.min(4, Math.ceil(maxBars / 1000));
  for (let p = 0; p < pages; p++) {
    const params = new URLSearchParams({
      symbol: toSymbol(symbol),
      interval: BINANCE_TF[tf],
      limit: "1000",
    });
    if (endTime) params.set("endTime", String(endTime));
    const data = await getJson(`${base}?${params.toString()}`);
    if (!Array.isArray(data) || data.length === 0) break;
    const chunk: Ohlcv[] = [];
    for (const row of data) {
      if (Array.isArray(row)) {
        const b = parseBinance(row as unknown[]);
        if (b) chunk.push(b);
      }
    }
    if (chunk.length === 0) break;
    out.unshift(...chunk);
    const first = chunk[0]!.time;
    endTime = first - 1;
    if (chunk.length < 1000) break;
    if (out.length >= maxBars) break;
    void interval;
  }
  const byTime = new Map<number, Ohlcv>();
  for (const b of out) byTime.set(b.time, b);
  return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-maxBars);
}

async function fetchOkx(symbol: string, tf: Timeframe, maxBars: number): Promise<Ohlcv[]> {
  const inst = symbol.replace("/", "-");
  const params = new URLSearchParams({
    instId: inst,
    bar: OKX_TF[tf],
    limit: String(Math.min(300, maxBars)),
  });
  const data = (await getJson(`https://www.okx.com/api/v5/market/candles?${params.toString()}`)) as {
    data?: string[][];
  };
  const rows = data.data ?? [];
  const out: Ohlcv[] = [];
  for (const row of rows) {
    const time = Number(row[0]);
    const open = Number(row[1]);
    const high = Number(row[2]);
    const low = Number(row[3]);
    const close = Number(row[4]);
    const volume = Number(row[5]);
    if ([time, open, high, low, close, volume].every(Number.isFinite)) {
      out.push({ time, open, high, low, close, volume });
    }
  }
  return out.sort((a, b) => a.time - b.time);
}

async function fetchOne(symbol: string, tf: Timeframe, market: "spot" | "usdm", maxBars: number): Promise<{
  bars: Ohlcv[];
  source: DataSource;
}> {
  const bases =
    market === "usdm"
      ? [
          "https://fapi.binance.com/fapi/v1/klines",
          "https://api.binance.com/api/v3/klines",
        ]
      : [
          "https://api.binance.com/api/v3/klines",
          "https://fapi.binance.com/fapi/v1/klines",
        ];
  for (const base of bases) {
    try {
      const bars = await fetchBinancePages(base, symbol, tf, maxBars);
      if (bars.length >= 200) {
        return { bars, source: base.includes("fapi") ? "binance" : "binance" };
      }
    } catch {
      /* try next */
    }
  }
  try {
    const bars = await fetchOkx(symbol, tf, maxBars);
    if (bars.length >= 200) return { bars, source: "okx" };
  } catch {
    /* synthetic fallback */
  }
  return { bars: [], source: "synthetic" };
}

export async function fetchMarketBundle(args: {
  symbol: string;
  ltf: Timeframe;
  htf: Timeframe;
  market: "spot" | "usdm";
  ltfBars: number;
  htfBars: number;
}): Promise<MarketBundle> {
  const [ltfRes, htfRes] = await Promise.all([
    fetchOne(args.symbol, args.ltf, args.market, args.ltfBars),
    fetchOne(args.symbol, args.htf, args.market, args.htfBars),
  ]);

  if (ltfRes.bars.length >= 300 && htfRes.bars.length >= 80) {
    const src = ltfRes.source;
    return {
      ltf: ltfRes.bars,
      htf: htfRes.bars,
      source: src,
      sourceNote:
        src === "okx"
          ? "Nến từ OKX public API (fallback). Không cần API key."
          : "Nến từ Binance public klines. Không cần API key. Khớp lệnh backtest vẫn là next-bar.",
    };
  }

  return {
    ltf: generateSynthetic(args.symbol, args.ltf, args.ltfBars),
    htf: generateSynthetic(args.symbol, args.htf, args.htfBars),
    source: "synthetic",
    sourceNote:
      "Sàn public API không tới được từ máy chủ. Đang dùng nến mô phỏng regime-switching (bull / crash / range) — chỉ để chạy desk, không phải giá thật.",
  };
}
