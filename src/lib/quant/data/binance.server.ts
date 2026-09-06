import { INTERVAL_MS } from "../config.ts";
import { generateSynthetic } from "./synthetic.ts";
import type { DataSource, MarketType, Ohlcv, Timeframe } from "../types.ts";

const BINANCE_TF: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1h",
  "2h": "2h",
  "4h": "4h",
  "1d": "1d",
  "1w": "1w",
};

const OKX_TF: Record<Timeframe, string> = {
  "5m": "5m",
  "15m": "15m",
  "30m": "30m",
  "1h": "1H",
  "2h": "2H",
  "4h": "4H",
  "1d": "1Dutc",
  "1w": "1Wutc",
};

export type MarketBundle = {
  ltf: Ohlcv[];
  htf: Ohlcv[];
  source: DataSource;
  sourceNote: string;
  /** The market the returned candles actually are — a USDT-M request may fall back to spot. */
  market: MarketType;
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

async function getJson(url: string, timeoutMs = 12_000): Promise<unknown> {
  // 12s default: a multi-page klines backfill is sequential, and a 5s budget
  // made the whole bundle fall back to synthetic on a merely slow — not
  // down — venue API.
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
  // Deep backtesting: up to 60 pages (60k bars) per series. Pages are windows
  // of 1000 bars with known startTime, so they fetch in PARALLEL — a 3-year
  // 1h backfill is ~27 requests instead of 27 sequential round-trips.
  const pages = Math.min(60, Math.ceil(maxBars / 1000));
  const interval = INTERVAL_MS[tf];
  const firstStart = Date.now() - maxBars * interval;
  const chunks = await Promise.all(
    Array.from({ length: pages }, (_, p) =>
      getJson(
        `${base}?${new URLSearchParams({
          symbol: toSymbol(symbol),
          interval: BINANCE_TF[tf],
          limit: "1000",
          startTime: String(firstStart + p * 1000 * interval),
        }).toString()}`,
      ).catch(() => null),
    ),
  );
  const byTime = new Map<number, Ohlcv>();
  for (const data of chunks) {
    if (!Array.isArray(data)) continue;
    for (const row of data) {
      if (!Array.isArray(row)) continue;
      const b = parseBinance(row as unknown[]);
      if (b) byTime.set(b.time, b);
    }
  }
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

async function fetchOne(
  symbol: string,
  tf: Timeframe,
  market: "spot" | "usdm",
  maxBars: number,
): Promise<{ bars: Ohlcv[]; source: DataSource; market: MarketType }> {
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
        return { bars, source: "binance", market: base.includes("fapi") ? "usdm" : "spot" };
      }
    } catch {
      /* try next */
    }
  }
  try {
    const bars = await fetchOkx(symbol, tf, maxBars);
    if (bars.length >= 200) return { bars, source: "okx", market: "spot" };
  } catch {
    /* synthetic fallback */
  }
  return { bars: [], source: "synthetic", market };
}

/** Best-effort klines only (no bundle gating) — used by the watchlist sparks. */
export async function fetchKlines(
  symbol: string,
  tf: Timeframe,
  market: MarketType,
  maxBars: number,
): Promise<Ohlcv[]> {
  const res = await fetchOne(symbol, tf, market, maxBars);
  return res.bars;
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
    // Only claim USDT-M when BOTH series came from the futures API — otherwise
    // funding would be charged on spot candles the exchange never financed.
    const actualMarket: MarketType =
      ltfRes.market === "usdm" && htfRes.market === "usdm" ? "usdm" : "spot";
    const src = ltfRes.source;
    const fellBack = actualMarket !== args.market;
    return {
      ltf: ltfRes.bars,
      htf: htfRes.bars,
      source: src,
      market: actualMarket,
      sourceNote: fellBack
        ? `Yêu cầu ${args.market === "usdm" ? "USDT-M" : "spot"} nhưng sàn chỉ trả dữ liệu ${actualMarket === "usdm" ? "USDT-M" : "spot"} — desk đã chuyển sang ${actualMarket === "usdm" ? "USDT-M" : "spot"} (funding chỉ tính cho USDT-M).`
        : src === "okx"
          ? "Nến từ OKX public API (fallback). Không cần API key."
          : "Nến từ Binance public klines. Không cần API key. Khớp lệnh backtest vẫn là next-bar.",
    };
  }

  return {
    ltf: generateSynthetic(args.symbol, args.ltf, args.ltfBars),
    htf: generateSynthetic(args.symbol, args.htf, args.htfBars),
    source: "synthetic",
    market: args.market,
    sourceNote:
      "Sàn public API không tới được từ máy chủ. Đang dùng nến mô phỏng regime-switching (bull / crash / range) — chỉ để chạy desk, không phải giá thật.",
  };
}
