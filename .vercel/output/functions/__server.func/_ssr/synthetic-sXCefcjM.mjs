//#region node_modules/.nitro/vite/services/ssr/assets/synthetic-sXCefcjM.js
var SYMBOLS = [
	"BTC/USDT",
	"ETH/USDT",
	"SOL/USDT"
];
var INTERVAL_MS = {
	"15m": 9e5,
	"1h": 36e5,
	"4h": 144e5,
	"1d": 864e5
};
var TIME_STOP = {
	"15m": 48,
	"1h": 24,
	"4h": 16,
	"1d": 8
};
function defaultConfig(partial) {
	const ltf = partial?.ltf ?? "1h";
	return {
		exchange: "binance",
		market: "usdm",
		symbols: [...SYMBOLS],
		symbol: "BTC/USDT",
		ltf,
		htf: "4h",
		lookbackYears: 2.5,
		equity: 1e4,
		riskPct: .0075,
		maxLeverage: 2,
		side: "both",
		maxPositions: 1,
		maxExposure: .25,
		dailyLossCap: .03,
		takerFee: 4e-4,
		slippageBps: 2,
		fundingPer8h: 1e-4,
		tradeVolatility: false,
		timeStopBars: TIME_STOP[ltf],
		warmup: 220,
		...partial
	};
}
function maxBarsForTf(tf) {
	switch (tf) {
		case "15m": return 18e3;
		case "1h": return 22e3;
		case "4h": return 1e4;
		case "1d": return 2600;
	}
}
function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}
function smaAt(src, i, period) {
	if (i + 1 < period) return null;
	let sum = 0;
	for (let k = i - period + 1; k <= i; k++) sum += src[k];
	return sum / period;
}
function stdevAt(src, i, period, ddof = 0) {
	const mean = smaAt(src, i, period);
	if (mean == null) return null;
	let acc = 0;
	for (let k = i - period + 1; k <= i; k++) {
		const d = src[k] - mean;
		acc += d * d;
	}
	const n = period - ddof;
	if (n <= 0) return null;
	return Math.sqrt(acc / n);
}
/** Seeded PRNG — mulberry32. Deterministic synthetic candles. */
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a += 1831565813;
		let t = a;
		t = Math.imul(t ^ t >>> 15, t | 1);
		t ^= t + Math.imul(t ^ t >>> 7, t | 61);
		return ((t ^ t >>> 14) >>> 0) / 4294967296;
	};
}
function hashSeed(input) {
	let h = 2166136261;
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}
/**
* Regime-switching geometric Brownian candles so the desk can run
* without an exchange. Clearly labeled as synthetic in the UI.
*/
function generateSynthetic(symbol, tf, bars, endTime = Date.now()) {
	const n = Math.min(Math.max(bars, 400), maxBarsForTf(tf));
	const interval = INTERVAL_MS[tf];
	const start = endTime - n * interval;
	const rng = mulberry32(hashSeed(`${symbol}:${tf}:vela-v1`));
	const startPx = symbol.startsWith("BTC") ? 28e3 : symbol.startsWith("ETH") ? 1800 : 80;
	const blocks = [
		{
			bars: Math.floor(n * .18),
			drift: 35e-5,
			vol: .012
		},
		{
			bars: Math.floor(n * .1),
			drift: -9e-4,
			vol: .028
		},
		{
			bars: Math.floor(n * .22),
			drift: 2e-5,
			vol: .009
		},
		{
			bars: Math.floor(n * .2),
			drift: 45e-5,
			vol: .014
		},
		{
			bars: Math.floor(n * .12),
			drift: -55e-5,
			vol: .02
		},
		{
			bars: Math.floor(n * .18),
			drift: 8e-5,
			vol: .011
		}
	];
	const specs = [];
	let acc = 0;
	for (const b of blocks) {
		specs.push(b);
		acc += b.bars;
	}
	if (acc < n) specs[specs.length - 1].bars += n - acc;
	const out = [];
	let px = startPx;
	let idx = 0;
	for (const spec of specs) for (let k = 0; k < spec.bars && idx < n; k++, idx++) {
		const z1 = Math.sqrt(-2 * Math.log(Math.max(rng(), 1e-9))) * Math.cos(2 * Math.PI * rng());
		const ret = spec.drift + spec.vol * z1 * (tf === "1d" ? 2.2 : tf === "4h" ? 1.2 : .7);
		const open = px;
		const close = Math.max(.01, open * (1 + ret));
		const wick = spec.vol * (.3 + rng()) * open;
		const high = Math.max(open, close) + wick * rng();
		const low = Math.max(.01, Math.min(open, close) - wick * rng());
		const volume = (800 + rng() * 2200) * (1 + spec.vol * 40) * (.6 + rng());
		out.push({
			time: start + idx * interval,
			open,
			high,
			low,
			close,
			volume
		});
		px = close;
	}
	return out;
}
//#endregion
export { defaultConfig as a, stdevAt as c, clamp as i, SYMBOLS as n, generateSynthetic as o, TIME_STOP as r, smaAt as s, INTERVAL_MS as t };
