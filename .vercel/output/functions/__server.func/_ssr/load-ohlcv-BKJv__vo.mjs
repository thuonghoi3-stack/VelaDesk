import { n as TSS_SERVER_FUNCTION, t as createServerFn } from "./ssr.mjs";
import { o as generateSynthetic, t as INTERVAL_MS } from "./synthetic-sXCefcjM.mjs";
import { a as string, i as object, r as number, t as _enum } from "../_libs/zod.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/load-ohlcv-BKJv__vo.js
var createServerRpc = (serverFnMeta, splitImportFn) => {
	const url = "/_serverFn/" + serverFnMeta.id;
	return Object.assign(splitImportFn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
var BINANCE_TF = {
	"15m": "15m",
	"1h": "1h",
	"4h": "4h",
	"1d": "1d"
};
var OKX_TF = {
	"15m": "15m",
	"1h": "1H",
	"4h": "4H",
	"1d": "1Dutc"
};
function toSymbol(sym) {
	return sym.replace("/", "").replace(":", "");
}
function parseBinance(row) {
	if (!Array.isArray(row) || row.length < 6) return null;
	const time = Number(row[0]);
	const open = Number(row[1]);
	const high = Number(row[2]);
	const low = Number(row[3]);
	const close = Number(row[4]);
	const volume = Number(row[5]);
	if (![
		time,
		open,
		high,
		low,
		close,
		volume
	].every(Number.isFinite)) return null;
	return {
		time,
		open,
		high,
		low,
		close,
		volume
	};
}
async function getJson(url, timeoutMs = 5e3) {
	const ctrl = new AbortController();
	const t = setTimeout(() => ctrl.abort(), timeoutMs);
	try {
		const res = await fetch(url, {
			signal: ctrl.signal,
			headers: { "User-Agent": "VelaDesk/1.0 (research terminal; paper only)" }
		});
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return await res.json();
	} finally {
		clearTimeout(t);
	}
}
async function fetchBinancePages(base, symbol, tf, maxBars) {
	INTERVAL_MS[tf];
	const out = [];
	let endTime;
	const pages = Math.min(4, Math.ceil(maxBars / 1e3));
	for (let p = 0; p < pages; p++) {
		const params = new URLSearchParams({
			symbol: toSymbol(symbol),
			interval: BINANCE_TF[tf],
			limit: "1000"
		});
		if (endTime) params.set("endTime", String(endTime));
		const data = await getJson(`${base}?${params.toString()}`);
		if (!Array.isArray(data) || data.length === 0) break;
		const chunk = [];
		for (const row of data) if (Array.isArray(row)) {
			const b = parseBinance(row);
			if (b) chunk.push(b);
		}
		if (chunk.length === 0) break;
		out.unshift(...chunk);
		endTime = chunk[0].time - 1;
		if (chunk.length < 1e3) break;
		if (out.length >= maxBars) break;
	}
	const byTime = /* @__PURE__ */ new Map();
	for (const b of out) byTime.set(b.time, b);
	return [...byTime.values()].sort((a, b) => a.time - b.time).slice(-maxBars);
}
async function fetchOkx(symbol, tf, maxBars) {
	const inst = symbol.replace("/", "-");
	const rows = (await getJson(`https://www.okx.com/api/v5/market/candles?${new URLSearchParams({
		instId: inst,
		bar: OKX_TF[tf],
		limit: String(Math.min(300, maxBars))
	}).toString()}`)).data ?? [];
	const out = [];
	for (const row of rows) {
		const time = Number(row[0]);
		const open = Number(row[1]);
		const high = Number(row[2]);
		const low = Number(row[3]);
		const close = Number(row[4]);
		const volume = Number(row[5]);
		if ([
			time,
			open,
			high,
			low,
			close,
			volume
		].every(Number.isFinite)) out.push({
			time,
			open,
			high,
			low,
			close,
			volume
		});
	}
	return out.sort((a, b) => a.time - b.time);
}
async function fetchOne(symbol, tf, market, maxBars) {
	const bases = market === "usdm" ? ["https://fapi.binance.com/fapi/v1/klines", "https://api.binance.com/api/v3/klines"] : ["https://api.binance.com/api/v3/klines", "https://fapi.binance.com/fapi/v1/klines"];
	for (const base of bases) try {
		const bars = await fetchBinancePages(base, symbol, tf, maxBars);
		if (bars.length >= 200) return {
			bars,
			source: base.includes("fapi") ? "binance" : "binance"
		};
	} catch {}
	try {
		const bars = await fetchOkx(symbol, tf, maxBars);
		if (bars.length >= 200) return {
			bars,
			source: "okx"
		};
	} catch {}
	return {
		bars: [],
		source: "synthetic"
	};
}
async function fetchMarketBundle(args) {
	const [ltfRes, htfRes] = await Promise.all([fetchOne(args.symbol, args.ltf, args.market, args.ltfBars), fetchOne(args.symbol, args.htf, args.market, args.htfBars)]);
	if (ltfRes.bars.length >= 300 && htfRes.bars.length >= 80) {
		const src = ltfRes.source;
		return {
			ltf: ltfRes.bars,
			htf: htfRes.bars,
			source: src,
			sourceNote: src === "okx" ? "Nến từ OKX public API (fallback). Không cần API key." : "Nến từ Binance public klines. Không cần API key. Khớp lệnh backtest vẫn là next-bar."
		};
	}
	return {
		ltf: generateSynthetic(args.symbol, args.ltf, args.ltfBars),
		htf: generateSynthetic(args.symbol, args.htf, args.htfBars),
		source: "synthetic",
		sourceNote: "Sàn public API không tới được từ máy chủ. Đang dùng nến mô phỏng regime-switching (bull / crash / range) — chỉ để chạy desk, không phải giá thật."
	};
}
var Schema = object({
	symbol: string().min(3).max(20),
	ltf: _enum([
		"15m",
		"1h",
		"4h",
		"1d"
	]),
	htf: _enum([
		"15m",
		"1h",
		"4h",
		"1d"
	]),
	market: _enum(["spot", "usdm"]),
	ltfBars: number().int().min(400).max(12e3),
	htfBars: number().int().min(200).max(4e3)
});
var loadOhlcv_createServerFn_handler = createServerRpc({
	id: "b79c3e16a3945c23dd7aa59972587fbb49a208d6d62dab965fa76a94a780892c",
	name: "loadOhlcv",
	filename: "src/lib/quant/data/load-ohlcv.ts"
}, (opts) => loadOhlcv.__executeServer(opts));
var loadOhlcv = createServerFn({ method: "POST" }).validator((data) => Schema.parse(data)).handler(loadOhlcv_createServerFn_handler, async ({ data }) => {
	return fetchMarketBundle(data);
});
//#endregion
export { loadOhlcv_createServerFn_handler };
