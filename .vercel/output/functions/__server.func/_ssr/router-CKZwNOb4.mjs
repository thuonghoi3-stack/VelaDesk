import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { _ as useRouter, f as createRouter, g as createRootRoute, h as createFileRoute, l as Scripts, m as lazyRouteComponent, p as Outlet, u as HeadContent, v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { a as defaultConfig, c as stdevAt, i as clamp, o as generateSynthetic, s as smaAt, t as INTERVAL_MS } from "./synthetic-sXCefcjM.mjs";
import { a as string, i as object, n as literal, o as union, r as number } from "../_libs/zod.mjs";
import { t as TriangleAlert } from "../_libs/lucide-react.mjs";
import { t as create } from "../_libs/zustand.mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/router-CKZwNOb4.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
var __defProp = Object.defineProperty;
var __exportAll = (all, no_symbols) => {
	let target = {};
	for (var name in all) __defProp(target, name, {
		get: all[name],
		enumerable: true
	});
	if (!no_symbols) __defProp(target, Symbol.toStringTag, { value: "Module" });
	return target;
};
function AppErrorComponent({ error }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
		className: "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
				className: "text-red-500",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, {
					className: "size-10",
					strokeWidth: 2
				})
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h1", {
				className: "text-lg font-semibold",
				children: "Something went wrong"
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "max-w-md text-sm break-words text-zinc-500 dark:text-zinc-400",
				children: error.message || "An unexpected error occurred. Try reloading the page."
			})
		]
	});
}
/**
* App-wide client provider mounted once near the root (in `src/routes/__root.tsx`):
*
*   <AuthProvider><Outlet /></AuthProvider>
*
* Better Auth's React client (`@/lib/auth/client`) needs NO context provider —
* its `useSession()` works standalone — so this is a passthrough today. It's
* kept as the single, stable mount point for any future client-side providers
* (e.g. a toast or theme provider) without churning the root shell.
*/
function AuthProvider({ children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(import_jsx_runtime.Fragment, { children });
}
function isGrokEmbedderOrigin(origin) {
	try {
		const url = new URL(origin);
		if (url.protocol !== "https:" && url.protocol !== "http:") return false;
		const host = url.hostname.toLowerCase();
		if (host === "grok.com" || host.endsWith(".grok.com")) return true;
		if (host === "localhost" || host === "127.0.0.1" || host === "[::1]") return true;
		return false;
	} catch {
		return false;
	}
}
function isSandboxPreviewGuestHost(hostname) {
	const host = hostname.toLowerCase();
	return host === "grok-sandbox.com" || host.endsWith(".grok-sandbox.com");
}
function isRemintPreviewPair(guestHost, parentHost) {
	const guest = guestHost.toLowerCase();
	const parent = parentHost.toLowerCase();
	const i = guest.indexOf(".preview.");
	if (i <= 0) return false;
	const label = guest.slice(0, i);
	const rest = guest.slice(i + 9);
	if (label.includes(".") || !rest.includes(".")) return false;
	return parent === rest || parent === `grok.${rest}`;
}
function resolveParentEmbedderOrigin(parentIsSelf, referrer, ancestorOrigin, guestHostname = "") {
	if (parentIsSelf) return null;
	for (const candidate of [referrer, ancestorOrigin ?? ""].filter(Boolean)) try {
		const url = new URL(candidate.includes("://") ? candidate : `https://${candidate}`);
		if (url.protocol !== "https:" && url.protocol !== "http:") continue;
		if (isGrokEmbedderOrigin(url.origin)) return url.origin;
		if (isSandboxPreviewGuestHost(guestHostname) || isRemintPreviewPair(guestHostname, url.hostname)) return url.origin;
	} catch {}
	return null;
}
/**
* Guest side of the grok-web ↔ sandbox preview postMessage bridge.
*
* Activates only when this page is framed by an allowlisted Grok embedder.
* Top-level runs (download/export, local `npm run dev`, deployed sites) noop.
*/
var PREVIEW_BRIDGE_CHANNEL = "grok-preview-bridge";
var EnvelopeSchema = object({
	channel: literal(PREVIEW_BRIDGE_CHANNEL),
	version: number().int().positive(),
	type: string().min(1)
});
var HelloSchema = EnvelopeSchema.extend({ type: literal("hello") });
var NavigateSchema = EnvelopeSchema.extend({
	type: literal("navigate"),
	path: string().min(1)
});
var HistorySchema = EnvelopeSchema.extend({
	type: literal("history"),
	delta: union([literal(-1), literal(1)])
});
function isSafeBridgePath(path) {
	if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
	try {
		return new URL(path, "https://preview.invalid").origin === "https://preview.invalid";
	} catch {
		return false;
	}
}
/**
* Install host↔guest messaging. Returns a dispose function.
* Noops (returns a no-op dispose) when not embedded under a Grok parent.
*/
function installPreviewHostBridge(options = {}) {
	if (typeof window === "undefined") return () => {};
	const ancestorOrigin = typeof location.ancestorOrigins !== "undefined" && location.ancestorOrigins.length > 0 ? location.ancestorOrigins[0] : null;
	const parentOrigin = resolveParentEmbedderOrigin(window.parent === window, document.referrer, ancestorOrigin, window.location.hostname);
	if (parentOrigin === null) return () => {};
	const ROOT_STATE_KEY = "__grokPreviewBridgeRoot";
	const originalPushState = window.history.pushState.bind(window.history);
	const originalReplaceState = window.history.replaceState.bind(window.history);
	const isAtHistoryRoot = () => {
		const state = window.history.state;
		return Boolean(state && typeof state === "object" && state[ROOT_STATE_KEY] === true);
	};
	try {
		const current = window.history.state;
		if (!(current !== null && typeof current === "object" && Object.prototype.hasOwnProperty.call(current, ROOT_STATE_KEY))) {
			const isRoot = window.history.length <= 1;
			originalReplaceState(current && typeof current === "object" ? {
				...current,
				[ROOT_STATE_KEY]: isRoot
			} : { [ROOT_STATE_KEY]: isRoot }, "", window.location.href);
		}
	} catch {}
	const post = (message) => {
		window.parent.postMessage(message, parentOrigin);
	};
	const reportLocation = () => {
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "location",
			path: window.location.pathname || "/",
			search: window.location.search,
			hash: window.location.hash
		});
	};
	const reportRoutes = () => {
		const paths = options.getRoutePaths?.() ?? [];
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "routes",
			paths
		});
	};
	const defaultNavigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		try {
			const url = new URL(path, window.location.origin);
			if (url.origin !== window.location.origin) return;
			const next = `${url.pathname}${url.search}${url.hash}`;
			window.history.pushState(window.history.state, "", next);
			window.dispatchEvent(new PopStateEvent("popstate", { state: window.history.state }));
		} catch {}
	};
	const navigate = (path) => {
		if (!isSafeBridgePath(path)) return;
		if (options.navigate) {
			options.navigate(path);
			return;
		}
		defaultNavigate(path);
	};
	const announce = () => {
		reportLocation();
		reportRoutes();
		post({
			channel: PREVIEW_BRIDGE_CHANNEL,
			version: 1,
			type: "ready"
		});
	};
	const onMessage = (event) => {
		if (event.source !== window.parent) return;
		if (event.origin !== parentOrigin) return;
		const envelope = EnvelopeSchema.safeParse(event.data);
		if (!envelope.success || envelope.data.version !== 1) return;
		if (envelope.data.type === "hello") {
			if (!HelloSchema.safeParse(event.data).success) return;
			announce();
			return;
		}
		if (envelope.data.type === "navigate") {
			const parsed = NavigateSchema.safeParse(event.data);
			if (!parsed.success) return;
			navigate(parsed.data.path);
			queueMicrotask(reportLocation);
			return;
		}
		if (envelope.data.type === "history") {
			const parsed = HistorySchema.safeParse(event.data);
			if (!parsed.success) return;
			if (parsed.data.delta === -1 && isAtHistoryRoot()) return;
			window.history.go(parsed.data.delta);
		}
	};
	const onPopState = () => {
		reportLocation();
	};
	const onHashChange = () => {
		reportLocation();
	};
	window.history.pushState = (data, unused, url) => {
		const next = data && typeof data === "object" ? {
			...data,
			[ROOT_STATE_KEY]: false
		} : data;
		originalPushState(next, unused, url);
		reportLocation();
	};
	window.history.replaceState = (data, unused, url) => {
		const next = isAtHistoryRoot() ? {
			...data && typeof data === "object" ? data : {},
			[ROOT_STATE_KEY]: true
		} : data;
		originalReplaceState(next, unused, url);
		reportLocation();
	};
	window.addEventListener("message", onMessage);
	window.addEventListener("popstate", onPopState);
	window.addEventListener("hashchange", onHashChange);
	announce();
	return () => {
		window.removeEventListener("message", onMessage);
		window.removeEventListener("popstate", onPopState);
		window.removeEventListener("hashchange", onHashChange);
		window.history.pushState = originalPushState;
		window.history.replaceState = originalReplaceState;
	};
}
/** Collect static path patterns from a TanStack route tree (best-effort). */
function collectRoutePathsFromTree(routeTree) {
	const paths = /* @__PURE__ */ new Set();
	const walk = (node) => {
		if (!node || typeof node !== "object") return;
		const record = node;
		const full = typeof record.fullPath === "string" ? record.fullPath : typeof record.path === "string" ? record.path : null;
		if (full !== null && full !== "") paths.add(full.startsWith("/") ? full : `/${full}`);
		else if (full === "") paths.add("/");
		const children = record.children;
		if (Array.isArray(children)) for (const child of children) walk(child);
		else if (children && typeof children === "object") for (const child of Object.values(children)) walk(child);
	};
	walk(routeTree);
	return [...paths];
}
/**
* Mount once in `__root.tsx` so the Grok preview chrome can drive navigation
* (and later receive registered routes). Noops when the app is not embedded.
*/
function PreviewHostBridge() {
	const router = useRouter();
	(0, import_react.useEffect)(() => {
		return installPreviewHostBridge({
			navigate: (path) => {
				router.history.push(path);
			},
			getRoutePaths: () => collectRoutePathsFromTree(router.routeTree)
		});
	}, [router]);
	return null;
}
var styles_default = "/assets/styles-X8srVLcI.css";
var APP_NAME = "Vela Desk";
var Route$1 = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{
				name: "viewport",
				content: "width=device-width, initial-scale=1"
			},
			{ title: APP_NAME },
			{
				name: "description",
				content: "Terminal nghiên cứu crypto hệ thống — phân tích nến, confluence, backtest rule-based, paper trade."
			},
			{
				name: "theme-color",
				content: "#0a0b0d"
			}
		],
		links: [
			{
				rel: "icon",
				type: "image/svg+xml",
				href: "/favicon.svg"
			},
			{
				rel: "stylesheet",
				href: styles_default
			},
			{
				rel: "manifest",
				href: "/__grok/manifest.webmanifest"
			},
			{
				rel: "apple-touch-icon",
				href: "/__grok/icon-180.png"
			},
			{
				rel: "preconnect",
				href: "https://fonts.googleapis.com"
			},
			{
				rel: "preconnect",
				href: "https://fonts.gstatic.com",
				crossOrigin: "anonymous"
			},
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&family=Instrument+Serif:ital@0;1&display=swap"
			}
		]
	}),
	component: () => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("html", {
		lang: "vi",
		className: "antialiased",
		suppressHydrationWarning: true,
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("head", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeadContent, {}) }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("body", {
			className: "bg-bg text-fg",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(PreviewHostBridge, {}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(AuthProvider, { children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Outlet, {}) }),
				/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Scripts, {})
			]
		})]
	})
});
function utcDay(ms) {
	return new Date(ms).toISOString().slice(0, 10);
}
function isFundingBar(time, tf) {
	const d = new Date(time);
	const h = d.getUTCHours();
	if (d.getUTCMinutes() !== 0) return false;
	if (tf === "1d") return h === 0;
	return h % 8 === 0;
}
function fundingCharge(notional, cfg, tf) {
	if (cfg.market !== "usdm") return 0;
	if (tf === "1d") return Math.abs(notional) * cfg.fundingPer8h * 3;
	return Math.abs(notional) * cfg.fundingPer8h;
}
function dailyLossBreached(dayPnl, startEquity, cfg) {
	return dayPnl <= -cfg.dailyLossCap * startEquity;
}
/**
* Stop = swing extremum, clamped to [1.2, 2.5] × ATR from reference price.
* Mean-reversion uses a fixed 1.8 × ATR.
*/
function planStop(bars, i, side, strategy, refPrice) {
	const atr = bars[i].atr;
	if (atr == null || atr <= 0) return null;
	if (strategy === "mean_reversion") {
		const dist = 1.8 * atr;
		return {
			stop: side === "long" ? refPrice - dist : refPrice + dist,
			dist,
			riskPerUnit: dist
		};
	}
	const from = Math.max(0, i - 8);
	let swing = side === "long" ? bars[from].low : bars[from].high;
	for (let k = from; k <= i; k++) if (side === "long") swing = Math.min(swing, bars[k].low);
	else swing = Math.max(swing, bars[k].high);
	const raw = side === "long" ? refPrice - swing : swing - refPrice;
	const dist = clamp(raw, 1.2 * atr, 2.5 * atr);
	return {
		stop: side === "long" ? refPrice - dist : refPrice + dist,
		dist,
		riskPerUnit: dist
	};
}
function sizeQty(equity, cfg, fill, riskPerUnit) {
	if (riskPerUnit <= 0 || fill <= 0 || equity <= 0) return 0;
	let qty = equity * cfg.riskPct / riskPerUnit;
	const maxNotional = equity * cfg.maxExposure * cfg.maxLeverage;
	qty = Math.min(qty, maxNotional / fill);
	if (qty * fill < 10) return 0;
	return qty;
}
function applySlippage(price, side, isEntry, bps) {
	const slip = bps / 1e4;
	if (side === "long") return isEntry ? price * (1 + slip) : price * (1 - slip);
	return isEntry ? price * (1 - slip) : price * (1 + slip);
}
function feeOn(notional, takerFee) {
	return Math.abs(notional) * takerFee;
}
function dailyReturns(equity) {
	if (equity.length < 2) return [];
	const byDay = /* @__PURE__ */ new Map();
	for (const p of equity) {
		const d = new Date(p.time).toISOString().slice(0, 10);
		byDay.set(d, p.equity);
	}
	const days = [...byDay.keys()].sort();
	const rets = [];
	for (let i = 1; i < days.length; i++) {
		const a = byDay.get(days[i - 1]);
		const b = byDay.get(days[i]);
		if (a > 0) rets.push(b / a - 1);
	}
	return rets;
}
function mean(xs) {
	if (xs.length === 0) return 0;
	return xs.reduce((s, v) => s + v, 0) / xs.length;
}
function std(xs) {
	if (xs.length < 2) return 0;
	const m = mean(xs);
	let a = 0;
	for (const x of xs) a += (x - m) ** 2;
	return Math.sqrt(a / (xs.length - 1));
}
function computeMetrics(startEquity, equity, trades, bars, exposedBars) {
	const endEquity = equity.length ? equity[equity.length - 1].equity : startEquity;
	const t0 = equity[0]?.time ?? 0;
	const t1 = equity[equity.length - 1]?.time ?? t0;
	const days = Math.max(1, (t1 - t0) / 864e5);
	const cagr = startEquity > 0 ? (endEquity / startEquity) ** (365 / days) - 1 : 0;
	const rets = dailyReturns(equity);
	const m = mean(rets);
	const s = std(rets);
	const sharpe = s > 0 ? m / s * Math.sqrt(365) : 0;
	const down = rets.filter((r) => r < 0);
	const ds = std(down.length ? down : [0]);
	const sortino = ds > 0 ? m / ds * Math.sqrt(365) : 0;
	let maxDd = 0;
	for (const p of equity) maxDd = Math.max(maxDd, p.drawdown);
	const calmar = maxDd > 0 ? cagr / maxDd : 0;
	const wins = trades.filter((t) => t.pnl > 0);
	const losses = trades.filter((t) => t.pnl <= 0);
	const gp = wins.reduce((s, t) => s + t.pnl, 0);
	const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
	const winRate = trades.length ? wins.length / trades.length : 0;
	const profitFactor = gl > 0 ? gp / gl : gp > 0 ? 99 : 0;
	const avgR = trades.length ? mean(trades.map((t) => t.pnlR)) : 0;
	const expectancy = trades.length ? mean(trades.map((t) => t.pnl)) : 0;
	return {
		bars,
		days,
		startEquity,
		endEquity,
		cagr,
		sharpe,
		sortino,
		maxDd,
		calmar,
		winRate,
		profitFactor,
		avgR,
		expectancy,
		trades: trades.length,
		exposure: bars > 0 ? exposedBars / bars : 0,
		grossProfit: gp,
		grossLoss: gl,
		avgWin: wins.length ? gp / wins.length : 0,
		avgLoss: losses.length ? -gl / losses.length : 0,
		best: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
		worst: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0
	};
}
function findLosingPeriods(equity, regimes, threshold = .08) {
	const out = [];
	let peak = equity[0]?.equity ?? 0;
	let start = equity[0]?.time ?? 0;
	let inDd = false;
	let trough = 0;
	const flush = (end) => {
		if (!inDd) return;
		const dd = trough;
		if (dd >= threshold) {
			const mix = {
				trending_up: 0,
				trending_down: 0,
				ranging: 0,
				mixed: 0
			};
			let n = 0;
			for (const r of regimes) if (r.time >= start && r.time <= end) {
				mix[r.regime] += 1;
				n++;
			}
			const top = Object.entries(mix).sort((a, b) => b[1] - a[1])[0];
			const note = top && n ? `Regime chiếm đa số: ${top[0].replace("_", " ")} (${(top[1] / n * 100).toFixed(0)}% nến).` : "Không đủ dữ liệu regime.";
			out.push({
				start,
				end,
				drawdown: dd,
				regimeMix: mix,
				note
			});
		}
		inDd = false;
	};
	for (const p of equity) if (p.equity >= peak) {
		flush(p.time);
		peak = p.equity;
		start = p.time;
		trough = 0;
	} else {
		const dd = peak > 0 ? (peak - p.equity) / peak : 0;
		if (!inDd) {
			inDd = true;
			start = p.time;
			trough = dd;
			p.time;
		} else if (dd > trough) {
			trough = dd;
			p.time;
		}
	}
	if (equity.length) flush(equity[equity.length - 1].time);
	return out.sort((a, b) => b.drawdown - a.drawdown).slice(0, 5);
}
function claimGate(test) {
	if (test.trades < 20) return {
		blocked: true,
		reason: `Mẫu test chỉ ${test.trades} lệnh — không đủ để tuyên bố hiệu quả.`
	};
	if (test.sharpe < .8) return {
		blocked: true,
		reason: `Sharpe test ${test.sharpe.toFixed(2)} < 0.8 — không được claim "chiến lược thắng".`
	};
	if (test.maxDd > .25) return {
		blocked: true,
		reason: `Max DD test ${(test.maxDd * 100).toFixed(1)}% > 25% — không được claim "chiến lược thắng".`
	};
	return {
		blocked: false,
		reason: "Test sample vượt ngưỡng tối thiểu (Sharpe ≥ 0.8, Max DD ≤ 25%). Vẫn không đảm bảo tương lai."
	};
}
var tradeSeq = 1;
/**
* Event-driven simulator. Signals at close[t] fill at open[t+1] (next-bar).
* Intrabar SL vs TP: stop is assumed first (pessimistic).
*/
var SimEngine = class {
	bars;
	cfg;
	tf;
	i;
	equity;
	peak;
	position = null;
	trades = [];
	equityCurve = [];
	events = [];
	exposedBars = 0;
	dailyHaltDays = 0;
	dayPnl = 0;
	dayKey = "";
	startEquity;
	halted = false;
	constructor(bars, cfg, tf, startIndex) {
		this.bars = bars;
		this.cfg = cfg;
		this.tf = tf;
		this.startEquity = cfg.equity;
		this.equity = cfg.equity;
		this.peak = cfg.equity;
		this.i = startIndex ?? cfg.warmup;
	}
	reset(startIndex) {
		this.i = startIndex ?? this.cfg.warmup;
		this.equity = this.cfg.equity;
		this.startEquity = this.cfg.equity;
		this.peak = this.cfg.equity;
		this.position = null;
		this.trades = [];
		this.equityCurve = [];
		this.events = [];
		this.exposedBars = 0;
		this.dailyHaltDays = 0;
		this.dayPnl = 0;
		this.dayKey = "";
		this.halted = false;
	}
	get done() {
		return this.i >= this.bars.length;
	}
	step() {
		if (this.done) return {
			i: this.i,
			equity: this.equity,
			position: this.position,
			lastEvent: null,
			done: true
		};
		const bar = this.bars[this.i];
		const key = utcDay(bar.time);
		if (key !== this.dayKey) {
			if (this.halted) this.dailyHaltDays += 1;
			this.dayKey = key;
			this.dayPnl = 0;
			this.halted = false;
		}
		let event = null;
		if (this.position) {
			this.chargeFunding(bar);
			event = this.managePosition(bar) ?? event;
			this.exposedBars += 1;
		}
		if (!this.position && !this.halted && this.i > 0) {
			const sigBar = this.bars[this.i - 1];
			if (sigBar.signal !== 0) event = this.tryEnter(bar, sigBar) ?? event;
		}
		const mtm = this.markToMarket(bar.close);
		this.peak = Math.max(this.peak, mtm);
		const dd = this.peak > 0 ? (this.peak - mtm) / this.peak : 0;
		this.equityCurve.push({
			time: bar.time,
			equity: mtm,
			drawdown: dd
		});
		if (dailyLossBreached(this.dayPnl, this.startEquity, this.cfg)) {
			if (!this.halted) {
				this.halted = true;
				event = {
					time: bar.time,
					kind: "halt",
					message: "Daily loss cap — dừng vào lệnh mới trong ngày UTC."
				};
				this.events.push(event);
			}
		}
		this.i += 1;
		return {
			i: this.i,
			equity: mtm,
			position: this.position,
			lastEvent: event,
			done: this.done
		};
	}
	runToEnd() {
		while (!this.done) this.step();
		if (this.position) {
			const last = this.bars[this.bars.length - 1];
			this.closePosition(last, last.close, "end_of_data", this.position.remainingQty);
		}
	}
	chargeFunding(bar) {
		if (!this.position) return;
		if (!isFundingBar(bar.time, this.tf)) return;
		const fee = fundingCharge(this.position.remainingQty * bar.close, this.cfg, this.tf);
		this.equity -= fee;
		this.dayPnl -= fee;
		this.position.initialRiskUsdt += 0;
		if (fee >= .01) this.events.push({
			time: bar.time,
			kind: "info",
			message: `Funding −${fee.toFixed(2)} USDT`
		});
	}
	tryEnter(fillBar, sigBar) {
		const side = sigBar.signal === 1 ? "long" : "short";
		if (this.cfg.side === "long_only" && side === "short") return null;
		const strategy = sigBar.strategy === "none" ? "trend_pullback" : sigBar.strategy;
		const rawOpen = fillBar.open;
		const fill = applySlippage(rawOpen, side, true, this.cfg.slippageBps);
		const plan = planStop(this.bars, this.i - 1, side, strategy, sigBar.close);
		if (!plan) return null;
		const stop = side === "long" ? fill - plan.dist : fill + plan.dist;
		const riskPerUnit = Math.abs(fill - stop);
		if (riskPerUnit <= 0) return null;
		if (side === "long" && fillBar.low <= stop) return null;
		if (side === "short" && fillBar.high >= stop) return null;
		const qty = sizeQty(this.equity, this.cfg, fill, riskPerUnit);
		if (qty <= 0) return null;
		const entryFee = feeOn(qty * fill, this.cfg.takerFee);
		this.equity -= entryFee;
		this.dayPnl -= entryFee;
		const pos = {
			id: `t${tradeSeq++}`,
			side,
			strategy,
			entryTime: fillBar.time,
			entryBar: this.i,
			entry: fill,
			qty,
			remainingQty: qty,
			stop,
			tp1: side === "long" ? fill + 1.5 * riskPerUnit : fill - 1.5 * riskPerUnit,
			tp2: side === "long" ? fill + 2.5 * riskPerUnit : fill - 2.5 * riskPerUnit,
			riskPerUnit,
			initialRiskUsdt: qty * riskPerUnit,
			barsHeld: 0,
			tp1Done: false,
			trailed: false,
			rReached: 0
		};
		if (strategy === "mean_reversion" && sigBar.bbMid != null) {
			pos.tp1 = sigBar.bbMid;
			pos.tp2 = sigBar.bbMid;
		}
		this.position = pos;
		const ev = {
			time: fillBar.time,
			kind: "fill",
			message: `${side.toUpperCase()} ${strategy} @ ${fill.toFixed(2)} qty ${qty.toFixed(4)} SL ${stop.toFixed(2)}`
		};
		this.events.push(ev);
		return ev;
	}
	managePosition(bar) {
		const pos = this.position;
		pos.barsHeld += 1;
		const fav = pos.side === "long" ? bar.high - pos.entry : pos.entry - bar.low;
		pos.rReached = Math.max(pos.rReached, fav / pos.riskPerUnit);
		if (pos.rReached >= 1 && !pos.trailed) {
			const be = pos.side === "long" ? pos.entry * (1 + this.cfg.takerFee * 2) : pos.entry * (1 - this.cfg.takerFee * 2);
			if (pos.side === "long") pos.stop = Math.max(pos.stop, be);
			else pos.stop = Math.min(pos.stop, be);
			pos.trailed = true;
		}
		const hitStop = pos.side === "long" ? bar.low <= pos.stop : bar.high >= pos.stop;
		const hitTp1 = pos.side === "long" ? bar.high >= pos.tp1 : bar.low <= pos.tp1;
		const hitTp2 = pos.side === "long" ? bar.high >= pos.tp2 : bar.low <= pos.tp2;
		if (hitStop) return this.closePosition(bar, pos.stop, "stop", pos.remainingQty);
		if (!pos.tp1Done && hitTp1) {
			const qty = pos.remainingQty * .5;
			const ev = this.closePosition(bar, pos.tp1, "tp1", qty);
			if (this.position) this.position.tp1Done = true;
			if (hitTp2 && this.position) return this.closePosition(bar, pos.tp2, "tp2", this.position.remainingQty) ?? ev;
			return ev;
		}
		if (pos.tp1Done && hitTp2) return this.closePosition(bar, pos.tp2, "tp2", pos.remainingQty);
		if (pos.strategy === "trend_pullback" && pos.tp1Done) {
			if (pos.side === "long" ? bar.ema20 != null && bar.close < bar.ema20 && (bar.macdHist ?? 1) < 0 : bar.ema20 != null && bar.close > bar.ema20 && (bar.macdHist ?? -1) > 0) return this.closePosition(bar, bar.close, "ema_macd_exit", pos.remainingQty);
		}
		if (pos.barsHeld >= this.cfg.timeStopBars) return this.closePosition(bar, bar.close, "time_stop", pos.remainingQty);
		return null;
	}
	closePosition(bar, rawPrice, reason, qty) {
		const pos = this.position;
		if (!pos || qty <= 0) return null;
		const fillQty = Math.min(qty, pos.remainingQty);
		const px = applySlippage(rawPrice, pos.side, false, this.cfg.slippageBps);
		const gross = pos.side === "long" ? (px - pos.entry) * fillQty : (pos.entry - px) * fillQty;
		const fee = feeOn(fillQty * px, this.cfg.takerFee);
		const pnl = gross - fee;
		const pnlR = pos.riskPerUnit > 0 ? (px - pos.entry) * (pos.side === "long" ? 1 : -1) / pos.riskPerUnit : 0;
		this.equity += pnl;
		this.dayPnl += pnl;
		this.trades.push({
			id: `${pos.id}-${reason}-${this.trades.length}`,
			side: pos.side,
			strategy: pos.strategy,
			entryTime: pos.entryTime,
			exitTime: bar.time,
			entry: pos.entry,
			exit: px,
			qty: fillQty,
			pnl,
			pnlR,
			fees: fee,
			funding: 0,
			reason,
			barsHeld: pos.barsHeld
		});
		pos.remainingQty -= fillQty;
		const ev = {
			time: bar.time,
			kind: "exit",
			message: `Exit ${reason} ${pos.side} @ ${px.toFixed(2)} PnL ${pnl.toFixed(2)} (${pnlR.toFixed(2)}R)`
		};
		this.events.push(ev);
		if (pos.remainingQty <= 1e-8) this.position = null;
		return ev;
	}
	markToMarket(close) {
		if (!this.position) return this.equity;
		const pos = this.position;
		const u = pos.side === "long" ? close - pos.entry : pos.entry - close;
		return this.equity + u * pos.remainingQty;
	}
};
function buyHold(bars, cfg) {
	const start = cfg.warmup;
	if (bars.length <= start + 2) return {
		equity: [],
		metrics: computeMetrics(cfg.equity, [], [], 0, 0)
	};
	const entry = applySlippage(bars[start].open, "long", true, cfg.slippageBps);
	const qty = cfg.equity * .99 / entry;
	const entryFee = feeOn(qty * entry, cfg.takerFee);
	let peak = cfg.equity;
	const curve = [];
	for (let i = start; i < bars.length; i++) {
		const px = bars[i].close;
		let eq = cfg.equity - entryFee + (px - entry) * qty;
		if (i === bars.length - 1) {
			const exit = applySlippage(px, "long", false, cfg.slippageBps);
			eq = cfg.equity - entryFee + (exit - entry) * qty - feeOn(qty * exit, cfg.takerFee);
		}
		peak = Math.max(peak, eq);
		curve.push({
			time: bars[i].time,
			equity: eq,
			drawdown: peak > 0 ? (peak - eq) / peak : 0
		});
	}
	const last = curve[curve.length - 1]?.equity ?? cfg.equity;
	const dummy = [{
		id: "bh",
		side: "long",
		strategy: "trend_pullback",
		entryTime: bars[start].time,
		exitTime: bars[bars.length - 1].time,
		entry,
		exit: bars[bars.length - 1].close,
		qty,
		pnl: last - cfg.equity,
		pnlR: 0,
		fees: entryFee,
		funding: 0,
		reason: "buy_hold",
		barsHeld: bars.length - start
	}];
	return {
		equity: curve,
		metrics: computeMetrics(cfg.equity, curve, dummy, curve.length, curve.length)
	};
}
function sliceEngine(bars, cfg, tf, from, to) {
	const slice = bars.slice(from, to);
	const e = new SimEngine(slice, {
		...cfg,
		warmup: Math.min(cfg.warmup, Math.max(0, slice.length - 2))
	}, tf);
	e.runToEnd();
	return e;
}
function runBacktest(bars, cfg, tf) {
	const engine = new SimEngine(bars, cfg, tf);
	engine.runToEnd();
	const metrics = computeMetrics(cfg.equity, engine.equityCurve, engine.trades, Math.max(0, bars.length - cfg.warmup), engine.exposedBars);
	const bh = buyHold(bars, cfg);
	const regimes = bars.map((b) => ({
		time: b.time,
		regime: b.regime
	}));
	const losingPeriods = findLosingPeriods(engine.equityCurve, regimes);
	const n = bars.length;
	const testStart = Math.floor(n * .7);
	const testEngine = new SimEngine(bars, cfg, tf, Math.max(cfg.warmup, testStart));
	testEngine.runToEnd();
	const testMetrics = computeMetrics(cfg.equity, testEngine.equityCurve, testEngine.trades, Math.max(0, n - testStart), testEngine.exposedBars);
	const folds = [];
	for (const c of [
		.5,
		.65,
		.8
	]) {
		const trainEnd = Math.floor(n * c);
		const testEnd = Math.min(n, trainEnd + Math.floor(n * .15));
		if (testEnd - trainEnd < 50) continue;
		const te = sliceEngine(bars, cfg, tf, Math.max(0, trainEnd - cfg.warmup), testEnd);
		folds.push({
			trainStart: bars[0].time,
			trainEnd: bars[trainEnd].time,
			testStart: bars[trainEnd].time,
			testEnd: bars[testEnd - 1].time,
			test: computeMetrics(cfg.equity, te.equityCurve, te.trades, te.equityCurve.length, te.exposedBars)
		});
	}
	const gate = claimGate(testMetrics);
	return {
		metrics,
		testMetrics,
		buyHold: bh.metrics,
		equity: engine.equityCurve,
		buyHoldEquity: bh.equity,
		trades: engine.trades,
		losingPeriods,
		walkForward: folds,
		claimBlocked: gate.blocked,
		claimReason: gate.reason,
		dailyHaltDays: engine.dailyHaltDays
	};
}
function rsiDippedThenLifted(bars, i, lo, hi, lookback = 8) {
	const now = bars[i].rsi;
	const prev = i > 0 ? bars[i - 1].rsi : null;
	if (now == null || prev == null) return false;
	if (!(now > prev && now >= lo)) return false;
	let dipped = false;
	const from = Math.max(0, i - lookback);
	for (let k = from; k < i; k++) {
		const r = bars[k].rsi;
		if (r != null && r >= lo && r <= hi) dipped = true;
	}
	return dipped;
}
function rsiPeakedThenDropped(bars, i, lo, hi, lookback = 8) {
	const now = bars[i].rsi;
	const prev = i > 0 ? bars[i - 1].rsi : null;
	if (now == null || prev == null) return false;
	if (!(now < prev && now <= hi)) return false;
	let peaked = false;
	const from = Math.max(0, i - lookback);
	for (let k = from; k < i; k++) {
		const r = bars[k].rsi;
		if (r != null && r >= lo && r <= hi) peaked = true;
	}
	return peaked;
}
function macdRising(bars, i) {
	const a = bars[i].macdHist;
	const b = i > 0 ? bars[i - 1].macdHist : null;
	const c = i > 1 ? bars[i - 2].macdHist : null;
	if (a == null) return false;
	if (a > 0) return true;
	return b != null && c != null && a > b && b > c;
}
function macdFalling(bars, i) {
	const a = bars[i].macdHist;
	const b = i > 0 ? bars[i - 1].macdHist : null;
	const c = i > 1 ? bars[i - 2].macdHist : null;
	if (a == null) return false;
	if (a < 0) return true;
	return b != null && c != null && a < b && b < c;
}
function pulledBackLong(bar) {
	const { ema20, ema50, bbMid, bbLower, low, close } = bar;
	if (ema20 != null && low <= ema20 * 1.003) return true;
	if (ema50 != null && low <= ema50 * 1.003) return true;
	if (bbMid != null && low <= bbMid * 1.002) return true;
	if (bbLower != null && close <= bbLower * 1.01) return true;
	return false;
}
function pulledBackShort(bar) {
	const { ema20, ema50, bbMid, bbUpper, high, close } = bar;
	if (ema20 != null && high >= ema20 * .997) return true;
	if (ema50 != null && high >= ema50 * .997) return true;
	if (bbMid != null && high >= bbMid * .998) return true;
	if (bbUpper != null && close >= bbUpper * .99) return true;
	return false;
}
function bullishTrigger(bar) {
	const p = bar.pattern;
	if (p && p.direction === 1 && (p.name === "bullish_engulfing" || p.name === "pin_bar" || p.name === "hammer")) return true;
	if (bar.ema20 == null) return false;
	const range = bar.high - bar.low;
	const body = bar.close - bar.open;
	return bar.close > bar.ema20 && body > 0 && range > 0 && body >= .45 * range;
}
function bearishTrigger(bar) {
	const p = bar.pattern;
	if (p && p.direction === -1 && (p.name === "bearish_engulfing" || p.name === "pin_bar" || p.name === "shooting_star")) return true;
	if (bar.ema20 == null) return false;
	const range = bar.high - bar.low;
	const body = bar.open - bar.close;
	return bar.close < bar.ema20 && body > 0 && range > 0 && body >= .45 * range;
}
function bandwidthSqueezeRelease(bars, i) {
	const bar = bars[i];
	if (bar.bbWidth == null || i < 21) return false;
	let sum = 0;
	let n = 0;
	for (let k = i - 20; k < i; k++) {
		const w = bars[k].bbWidth;
		if (w != null) {
			sum += w;
			n++;
		}
	}
	if (n < 10) return false;
	const avg = sum / n;
	const prev = bars[i - 1].bbWidth;
	return bar.bbWidth > 1.5 * avg && prev != null && bar.bbWidth > prev;
}
function explainTrendLong(ctx) {
	const bar = ctx.bars[ctx.i];
	const volOk = !bar.extremeVol || ctx.tradeVolatility;
	const rsiOk = rsiDippedThenLifted(ctx.bars, ctx.i, 40, 52);
	const macdOk = macdRising(ctx.bars, ctx.i);
	const volSpike = (bar.volSpike ?? 0) >= 1.2;
	return [
		{
			id: "htf_up",
			label: "Bias HTF = up (close > EMA50 và ADX ≥ 20)",
			pass: bar.htfBias === 1,
			detail: `htfBias=${bar.htfBias}, ADX_HTF=${fmt$1(bar.htfAdx)}`
		},
		{
			id: "pullback",
			label: "Giá hồi EMA20 / EMA50 / dải giữa-dưới BB",
			pass: pulledBackLong(bar),
			detail: `low=${bar.low.toFixed(2)} ema20=${fmt$1(bar.ema20)} ema50=${fmt$1(bar.ema50)}`
		},
		{
			id: "rsi",
			label: "RSI(14) từng xuống 40–50 rồi cắt lên",
			pass: rsiOk,
			detail: `RSI=${fmt$1(bar.rsi)}`
		},
		{
			id: "macd",
			label: "MACD histogram > 0 hoặc tăng 2 nến",
			pass: macdOk,
			detail: `hist=${fmt$1(bar.macdHist)}`
		},
		{
			id: "volume",
			label: "Volume ≥ 1.2 × SMA20",
			pass: volSpike,
			detail: `spike=${fmt$1(bar.volSpike)}`
		},
		{
			id: "candle",
			label: "Nến: engulfing / pin bar tăng / close mạnh trên EMA20",
			pass: bullishTrigger(bar),
			detail: bar.pattern ? `${bar.pattern.name} ${bar.pattern.direction}` : "close vs EMA20"
		},
		{
			id: "vol_cap",
			label: "Không cực đoan ATR (trừ khi bật trade volatility)",
			pass: volOk,
			detail: bar.extremeVol ? "ATR > 2.0 × SMA" : "vol bình thường"
		}
	];
}
function explainTrendShort(ctx) {
	const bar = ctx.bars[ctx.i];
	const volOk = !bar.extremeVol || ctx.tradeVolatility;
	return [
		{
			id: "htf_down",
			label: "Bias HTF = down (close < EMA50 và ADX ≥ 20)",
			pass: bar.htfBias === -1,
			detail: `htfBias=${bar.htfBias}, ADX_HTF=${fmt$1(bar.htfAdx)}`
		},
		{
			id: "pullback",
			label: "Giá hồi EMA20 / EMA50 / dải giữa-trên BB",
			pass: pulledBackShort(bar),
			detail: `high=${bar.high.toFixed(2)} ema20=${fmt$1(bar.ema20)}`
		},
		{
			id: "rsi",
			label: "RSI(14) từng lên 50–60 rồi cắt xuống",
			pass: rsiPeakedThenDropped(ctx.bars, ctx.i, 48, 60),
			detail: `RSI=${fmt$1(bar.rsi)}`
		},
		{
			id: "macd",
			label: "MACD histogram < 0 hoặc giảm 2 nến",
			pass: macdFalling(ctx.bars, ctx.i),
			detail: `hist=${fmt$1(bar.macdHist)}`
		},
		{
			id: "volume",
			label: "Volume ≥ 1.2 × SMA20",
			pass: (bar.volSpike ?? 0) >= 1.2,
			detail: `spike=${fmt$1(bar.volSpike)}`
		},
		{
			id: "candle",
			label: "Nến: engulfing / shooting star / close mạnh dưới EMA20",
			pass: bearishTrigger(bar),
			detail: bar.pattern ? `${bar.pattern.name}` : "close vs EMA20"
		},
		{
			id: "vol_cap",
			label: "Không cực đoan ATR (trừ khi bật trade volatility)",
			pass: volOk,
			detail: bar.extremeVol ? "ATR > 2.0 × SMA" : "vol bình thường"
		}
	];
}
function trendPullbackSignal(ctx) {
	if (explainTrendLong(ctx).every((r) => r.pass)) return {
		signal: 1,
		reason: "trend_pullback_long"
	};
	if (ctx.allowShort) {
		if (explainTrendShort(ctx).every((r) => r.pass)) return {
			signal: -1,
			reason: "trend_pullback_short"
		};
	}
	return {
		signal: 0,
		reason: ""
	};
}
function fmt$1(v) {
	if (v == null || !Number.isFinite(v)) return "—";
	return v.toFixed(3);
}
/** Apply trend-pullback signals; does not overwrite an existing non-zero signal. */
function applyTrendPullback(bars, opts) {
	for (let i = opts.warmup; i < bars.length; i++) {
		if (bars[i].signal !== 0) continue;
		const { signal, reason } = trendPullbackSignal({
			bars,
			i,
			tradeVolatility: opts.tradeVolatility,
			allowShort: opts.allowShort
		});
		if (signal !== 0) {
			bars[i].signal = signal;
			bars[i].signalReason = reason;
			bars[i].strategy = "trend_pullback";
		}
	}
}
function explainMrLong(ctx) {
	const bar = ctx.bars[ctx.i];
	const squeeze = bandwidthSqueezeRelease(ctx.bars, ctx.i);
	return [
		{
			id: "ranging",
			label: "Regime ranging (ADX < 20)",
			pass: (bar.adx ?? 99) < 20 && bar.htfBias === 0,
			detail: `ADX=${fmt(bar.adx)} htfBias=${bar.htfBias}`
		},
		{
			id: "bb",
			label: "Close dưới lower Bollinger",
			pass: bar.bbLower != null && bar.close < bar.bbLower,
			detail: `close=${bar.close.toFixed(2)} lower=${fmt(bar.bbLower)}`
		},
		{
			id: "rsi",
			label: "RSI < 30",
			pass: bar.rsi != null && bar.rsi < 30,
			detail: `RSI=${fmt(bar.rsi)}`
		},
		{
			id: "squeeze",
			label: "Không phải squeeze vừa bung",
			pass: !squeeze,
			detail: squeeze ? "bandwidth tăng đột biến" : "ok"
		}
	];
}
function explainMrShort(ctx) {
	const bar = ctx.bars[ctx.i];
	const squeeze = bandwidthSqueezeRelease(ctx.bars, ctx.i);
	return [
		{
			id: "ranging",
			label: "Regime ranging (ADX < 20)",
			pass: (bar.adx ?? 99) < 20 && bar.htfBias === 0,
			detail: `ADX=${fmt(bar.adx)} htfBias=${bar.htfBias}`
		},
		{
			id: "bb",
			label: "Close trên upper Bollinger",
			pass: bar.bbUpper != null && bar.close > bar.bbUpper,
			detail: `close=${bar.close.toFixed(2)} upper=${fmt(bar.bbUpper)}`
		},
		{
			id: "rsi",
			label: "RSI > 70",
			pass: bar.rsi != null && bar.rsi > 70,
			detail: `RSI=${fmt(bar.rsi)}`
		},
		{
			id: "squeeze",
			label: "Không phải squeeze vừa bung",
			pass: !squeeze,
			detail: squeeze ? "bandwidth tăng đột biến" : "ok"
		}
	];
}
function meanReversionSignal(ctx) {
	if (explainMrLong(ctx).every((r) => r.pass)) return {
		signal: 1,
		reason: "mean_reversion_long"
	};
	if (ctx.allowShort) {
		if (explainMrShort(ctx).every((r) => r.pass)) return {
			signal: -1,
			reason: "mean_reversion_short"
		};
	}
	return {
		signal: 0,
		reason: ""
	};
}
function applyMeanReversion(bars, opts) {
	for (let i = opts.warmup; i < bars.length; i++) {
		if (bars[i].signal !== 0) continue;
		const { signal, reason } = meanReversionSignal({
			bars,
			i,
			tradeVolatility: false,
			allowShort: opts.allowShort
		});
		if (signal !== 0) {
			bars[i].signal = signal;
			bars[i].signalReason = reason;
			bars[i].strategy = "mean_reversion";
		}
	}
}
function fmt(v) {
	if (v == null || !Number.isFinite(v)) return "—";
	return v.toFixed(3);
}
function explainLastBar(bars, cfg) {
	if (bars.length === 0) return null;
	const ctx = {
		bars,
		i: bars.length - 1,
		tradeVolatility: cfg.tradeVolatility,
		allowShort: cfg.side === "both"
	};
	const trendLong = explainTrendLong(ctx);
	const trendShort = explainTrendShort(ctx);
	const mrLong = explainMrLong(ctx);
	const mrShort = explainMrShort(ctx);
	return {
		trendLong,
		trendShort,
		mrLong,
		mrShort,
		trendLongPass: trendLong.every((r) => r.pass),
		trendShortPass: trendShort.every((r) => r.pass),
		mrLongPass: mrLong.every((r) => r.pass),
		mrShortPass: mrShort.every((r) => r.pass)
	};
}
var EPS = 1e-12;
function isValidBar(bar) {
	return Number.isFinite(bar.open) && Number.isFinite(bar.high) && Number.isFinite(bar.low) && Number.isFinite(bar.close) && Number.isFinite(bar.volume) && bar.high + EPS >= Math.max(bar.open, bar.close, bar.low) && bar.low - EPS <= Math.min(bar.open, bar.close, bar.high) && bar.volume >= 0;
}
/**
* Sort by time, drop duplicates, clamp OHLC, forward-fill a single missing bar,
* and flag gaps larger than 1.5 intervals.
*/
function cleanOhlcv(raw, timeframe) {
	const interval = INTERVAL_MS[timeframe];
	const byTime = /* @__PURE__ */ new Map();
	for (const bar of raw) {
		if (!isValidBar(bar)) continue;
		const t = Math.floor(bar.time / interval) * interval;
		byTime.set(t, {
			time: t,
			open: bar.open,
			high: Math.max(bar.high, bar.open, bar.close, bar.low),
			low: Math.min(bar.low, bar.open, bar.close, bar.high),
			close: bar.close,
			volume: bar.volume
		});
	}
	const times = [...byTime.keys()].sort((a, b) => a - b);
	if (times.length === 0) return [];
	const out = [];
	for (let i = 0; i < times.length; i++) {
		const t = times[i];
		const bar = byTime.get(t);
		if (i > 0) {
			const prev = out[out.length - 1];
			const dt = t - prev.time;
			if (dt > interval * 1.5 && dt <= interval * 2.5) out.push({
				time: prev.time + interval,
				open: prev.close,
				high: prev.close,
				low: prev.close,
				close: prev.close,
				volume: 0,
				gap: true
			});
			else if (dt > interval * 2.5) bar.gap = true;
		}
		out.push(bar);
	}
	return out;
}
function clip(n, lo, hi) {
	return Math.min(hi, Math.max(lo, n));
}
/**
* Confluence 0–100 = trend 25 + momentum 25 + volatility 20 + volume 15 + pattern 15.
* All scores use the last closed LTF bar only.
*/
function scoreConfluence(bar) {
	let trend = 6;
	if (bar.adx != null && bar.ema50 != null) {
		const aligned = bar.close > bar.ema50 && bar.htfBias >= 0 || bar.close < bar.ema50 && bar.htfBias <= 0;
		if (bar.adx >= 25 && aligned) trend = 25;
		else if (bar.adx >= 25) trend = 18;
		else if (bar.adx >= 20) trend = 14;
		else if (bar.adx < 18) trend = 8;
	}
	if (bar.htfBias !== 0) trend = Math.min(25, trend + 3);
	let momentum = 8;
	if (bar.rsi != null) {
		if (bar.rsi >= 45 && bar.rsi <= 65) momentum += 8;
		else if (bar.rsi < 30 || bar.rsi > 70) momentum += 4;
		else momentum += 5;
	}
	if (bar.macdHist != null) {
		if (bar.macdHist > 0) momentum += 7;
		else momentum += 2;
	}
	momentum = clip(momentum, 0, 25);
	let volatility = 10;
	if (bar.extremeVol) volatility = 4;
	else if (bar.highVol) volatility = 9;
	else if (bar.atr != null && bar.atrSma20 != null) volatility = 20;
	else if (bar.bbWidth != null) volatility = 14;
	let volume = 5;
	if (bar.volSpike != null) {
		if (bar.volSpike >= 1.4) volume = 15;
		else if (bar.volSpike >= 1.2) volume = 12;
		else if (bar.volSpike >= 1) volume = 9;
		else volume = 5;
	}
	let pattern = 0;
	if (bar.pattern) {
		const aligned = bar.pattern.direction === 0 ? .5 : bar.htfBias === 0 || bar.pattern.direction === bar.htfBias ? 1 : .25;
		pattern = Math.round(bar.pattern.strength * 15 * aligned);
	}
	return {
		trend,
		momentum,
		volatility,
		volume,
		pattern
	};
}
function latestIndicators(bar) {
	return {
		close: bar.close,
		ema20: bar.ema20,
		ema50: bar.ema50,
		ema200: bar.ema200,
		adx: bar.adx,
		rsi: bar.rsi,
		macd: bar.macd,
		macdHist: bar.macdHist,
		stochK: bar.stochK,
		atr: bar.atr,
		atrSma20: bar.atrSma20,
		bbMid: bar.bbMid,
		bbUpper: bar.bbUpper,
		bbLower: bar.bbLower,
		bbWidth: bar.bbWidth,
		volSpike: bar.volSpike,
		htfAdx: bar.htfAdx,
		htfEma50: bar.htfEma50,
		htfBias: bar.htfBias,
		regime: bar.regime
	};
}
function lastPatterns(bars, n = 8) {
	const out = [];
	for (let i = bars.length - 1; i >= 0 && out.length < n; i--) {
		const p = bars[i].pattern;
		if (p && p.strength >= .3) out.push(p);
	}
	return out;
}
function seedBar(bar) {
	return {
		...bar,
		ema20: null,
		ema50: null,
		ema200: null,
		adx: null,
		rsi: null,
		macd: null,
		macdSignal: null,
		macdHist: null,
		stochK: null,
		stochD: null,
		atr: null,
		atrSma20: null,
		bbMid: null,
		bbUpper: null,
		bbLower: null,
		bbWidth: null,
		volSma20: null,
		volSpike: null,
		obv: null,
		regime: "mixed",
		highVol: false,
		extremeVol: false,
		pattern: null,
		htfClose: null,
		htfEma50: null,
		htfAdx: null,
		htfBias: 0,
		signal: 0,
		signalReason: "",
		strategy: "none"
	};
}
function wilderInit(values, period) {
	let s = 0;
	for (let i = 0; i < period; i++) s += values[i];
	return s / period;
}
/**
* Compute classic TA on a cleaned OHLCV series.
* Every value at index i uses only bars 0..i (no look-ahead).
*/
function computeIndicators(ohlcv) {
	const n = ohlcv.length;
	const out = ohlcv.map(seedBar);
	if (n === 0) return out;
	const close = ohlcv.map((b) => b.close);
	const high = ohlcv.map((b) => b.high);
	const low = ohlcv.map((b) => b.low);
	const vol = ohlcv.map((b) => b.volume);
	const k20 = 2 / 21;
	const k50 = 2 / 51;
	const k200 = 2 / 201;
	const k12 = 2 / 13;
	const k26 = 2 / 27;
	const k9 = 2 / 10;
	let ema20 = null;
	let ema50 = null;
	let ema200 = null;
	let ema12 = null;
	let ema26 = null;
	let macdSignal = null;
	let obv = 0;
	const tr = new Array(n).fill(0);
	const plusDm = new Array(n).fill(0);
	const minusDm = new Array(n).fill(0);
	const gain = new Array(n).fill(0);
	const loss = new Array(n).fill(0);
	for (let i = 0; i < n; i++) {
		const c = close[i];
		const prevC = i > 0 ? close[i - 1] : c;
		const ch = c - prevC;
		gain[i] = Math.max(ch, 0);
		loss[i] = Math.max(-ch, 0);
		if (i === 0) tr[i] = high[i] - low[i];
		else {
			tr[i] = Math.max(high[i] - low[i], Math.abs(high[i] - prevC), Math.abs(low[i] - prevC));
			const up = high[i] - high[i - 1];
			const down = low[i - 1] - low[i];
			plusDm[i] = up > down && up > 0 ? up : 0;
			minusDm[i] = down > up && down > 0 ? down : 0;
		}
		if (i > 0) obv += c > prevC ? vol[i] : c < prevC ? -vol[i] : 0;
		out[i].obv = obv;
		if (i === 0) ema20 = ema50 = ema200 = ema12 = ema26 = c;
		else {
			ema20 = c * k20 + ema20 * .9047619047619048;
			ema50 = c * k50 + ema50 * .9607843137254902;
			ema200 = c * k200 + ema200 * .9900497512437811;
			ema12 = c * k12 + ema12 * .8461538461538461;
			ema26 = c * k26 + ema26 * .9259259259259259;
		}
		if (i >= 19) out[i].ema20 = ema20;
		if (i >= 49) out[i].ema50 = ema50;
		if (i >= 199) out[i].ema200 = ema200;
		if (i >= 25 && ema12 != null && ema26 != null) {
			const macd = ema12 - ema26;
			out[i].macd = macd;
			macdSignal = macdSignal == null ? macd : macd * k9 + macdSignal * .8;
			out[i].macdSignal = macdSignal;
			out[i].macdHist = macd - macdSignal;
		}
		const bbMid = smaAt(close, i, 20);
		const bbSd = stdevAt(close, i, 20, 0);
		if (bbMid != null && bbSd != null) {
			out[i].bbMid = bbMid;
			out[i].bbUpper = bbMid + 2 * bbSd;
			out[i].bbLower = bbMid - 2 * bbSd;
			out[i].bbWidth = bbMid > 0 ? 4 * bbSd / bbMid : null;
		}
		out[i].volSma20 = smaAt(vol, i, 20);
		if (out[i].volSma20 && out[i].volSma20 > 0) out[i].volSpike = vol[i] / out[i].volSma20;
	}
	if (n > 14) {
		let avgGain = wilderInit(gain.slice(1, 15), 14);
		let avgLoss = wilderInit(loss.slice(1, 15), 14);
		const rs0 = avgLoss === 0 ? 100 : avgGain / avgLoss;
		out[14].rsi = 100 - 100 / (1 + rs0);
		for (let i = 15; i < n; i++) {
			avgGain = (avgGain * 13 + gain[i]) / 14;
			avgLoss = (avgLoss * 13 + loss[i]) / 14;
			const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
			out[i].rsi = 100 - 100 / (1 + rs);
		}
	}
	const atr = new Array(n).fill(null);
	if (n > 14) {
		let a = wilderInit(tr.slice(1, 15), 14);
		atr[14] = a;
		out[14].atr = a;
		for (let i = 15; i < n; i++) {
			a = (a * 13 + tr[i]) / 14;
			atr[i] = a;
			out[i].atr = a;
		}
	}
	const atrNums = atr.map((v) => v ?? 0);
	for (let i = 0; i < n; i++) {
		if (atr[i] == null) continue;
		const s = smaAt(atrNums.map((v, idx) => atr[idx] == null ? NaN : v), i, 20);
		if (i >= 33) {
			let sum = 0;
			let ok = true;
			for (let k = i - 19; k <= i; k++) {
				if (atr[k] == null) {
					ok = false;
					break;
				}
				sum += atr[k];
			}
			out[i].atrSma20 = ok ? sum / 20 : s;
		}
	}
	const kArr = new Array(n).fill(null);
	for (let i = 13; i < n; i++) {
		let hh = high[i - 13];
		let ll = low[i - 13];
		for (let k = i - 12; k <= i; k++) {
			if (high[k] > hh) hh = high[k];
			if (low[k] < ll) ll = low[k];
		}
		const den = hh - ll;
		kArr[i] = den <= 0 ? 50 : (close[i] - ll) / den * 100;
		out[i].stochK = kArr[i];
	}
	for (let i = 15; i < n; i++) {
		const a = kArr[i];
		const b = kArr[i - 1];
		const c = kArr[i - 2];
		if (a == null || b == null || c == null) continue;
		out[i].stochD = (a + b + c) / 3;
	}
	if (n > 28) {
		let smTr = wilderInit(tr.slice(1, 15), 14);
		let smP = wilderInit(plusDm.slice(1, 15), 14);
		let smM = wilderInit(minusDm.slice(1, 15), 14);
		const dx = [];
		for (let i = 14; i < n; i++) {
			if (i > 14) {
				smTr = (smTr * 13 + tr[i]) / 14;
				smP = (smP * 13 + plusDm[i]) / 14;
				smM = (smM * 13 + minusDm[i]) / 14;
			}
			const pDi = smTr === 0 ? 0 : 100 * smP / smTr;
			const mDi = smTr === 0 ? 0 : 100 * smM / smTr;
			const den = pDi + mDi;
			dx.push(den === 0 ? 0 : 100 * Math.abs(pDi - mDi) / den);
			if (dx.length === 14) {
				let adx = dx.reduce((s, v) => s + v, 0) / 14;
				out[i].adx = adx;
				for (let j = i + 1; j < n; j++) {
					smTr = (smTr * 13 + tr[j]) / 14;
					smP = (smP * 13 + plusDm[j]) / 14;
					smM = (smM * 13 + minusDm[j]) / 14;
					const p = smTr === 0 ? 0 : 100 * smP / smTr;
					const m = smTr === 0 ? 0 : 100 * smM / smTr;
					const d = p + m;
					const dxj = d === 0 ? 0 : 100 * Math.abs(p - m) / d;
					adx = (adx * 13 + dxj) / 14;
					out[j].adx = adx;
				}
				break;
			}
		}
	}
	return out;
}
function classifyRegime(bar) {
	const adx = bar.adx;
	const ema50 = bar.ema50;
	if (adx == null || ema50 == null) return "mixed";
	if (adx < 20) return "ranging";
	if (adx >= 25 && bar.close > ema50) return "trending_up";
	if (adx >= 25 && bar.close < ema50) return "trending_down";
	return "mixed";
}
function applyRegime(bars) {
	for (const bar of bars) {
		bar.regime = classifyRegime(bar);
		const atr = bar.atr;
		const sma = bar.atrSma20;
		bar.highVol = atr != null && sma != null && atr > 1.5 * sma;
		bar.extremeVol = atr != null && sma != null && atr > 2 * sma;
	}
}
function body(bar) {
	return Math.abs(bar.close - bar.open);
}
function range(bar) {
	return Math.max(bar.high - bar.low, 1e-12);
}
function upperWick(bar) {
	return bar.high - Math.max(bar.open, bar.close);
}
function lowerWick(bar) {
	return Math.min(bar.open, bar.close) - bar.low;
}
function strength01(value, lo, hi) {
	return Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
}
/**
* Rule-based candle patterns at bar i using only bars <= i.
* Returns the strongest pattern for that bar, or null.
*/
function detectPattern(bars, i) {
	if (i < 0 || i >= bars.length) return null;
	const c = bars[i];
	const r = range(c);
	const b = body(c);
	const uw = upperWick(c);
	const lw = lowerWick(c);
	const hits = [];
	if (b / r <= .1) hits.push({
		name: "doji",
		direction: 0,
		strength: strength01(1 - b / r, .9, 1),
		index: i
	});
	const closePos = (c.close - c.low) / r;
	if (lw >= 2 * b && lw >= .55 * r && closePos >= .66 && c.close >= c.open) {
		hits.push({
			name: "hammer",
			direction: 1,
			strength: strength01(lw / r, .55, .8),
			index: i
		});
		hits.push({
			name: "pin_bar",
			direction: 1,
			strength: strength01(lw / r, .5, .78),
			index: i
		});
	}
	const closeFromHigh = (c.high - c.close) / r;
	if (uw >= 2 * b && uw >= .55 * r && closeFromHigh >= .66 && c.close <= c.open) {
		hits.push({
			name: "shooting_star",
			direction: -1,
			strength: strength01(uw / r, .55, .8),
			index: i
		});
		hits.push({
			name: "pin_bar",
			direction: -1,
			strength: strength01(uw / r, .5, .78),
			index: i
		});
	}
	if (i >= 1) {
		const p = bars[i - 1];
		const pb = body(p);
		const prevBull = p.close > p.open;
		const prevBear = p.close < p.open;
		const currBull = c.close > c.open;
		const currBear = c.close < c.open;
		const pTop = Math.max(p.open, p.close);
		const pBot = Math.min(p.open, p.close);
		const cTop = Math.max(c.open, c.close);
		const cBot = Math.min(c.open, c.close);
		if (prevBear && currBull && cBot <= pBot && cTop >= pTop && b > pb) hits.push({
			name: "bullish_engulfing",
			direction: 1,
			strength: strength01(b / (pb + 1e-12), 1, 2.2),
			index: i
		});
		if (prevBull && currBear && cBot <= pBot && cTop >= pTop && b > pb) hits.push({
			name: "bearish_engulfing",
			direction: -1,
			strength: strength01(b / (pb + 1e-12), 1, 2.2),
			index: i
		});
		if (c.high < p.high && c.low > p.low) hits.push({
			name: "inside_bar",
			direction: 0,
			strength: strength01((p.high - p.low - r) / (p.high - p.low), 0, .5),
			index: i
		});
	}
	if (hits.length === 0) return null;
	hits.sort((a, b2) => b2.strength - a.strength);
	return hits[0];
}
function applyPatterns(bars) {
	const found = [];
	for (let i = 1; i < bars.length; i++) {
		const hit = detectPattern(bars, i);
		bars[i].pattern = hit;
		if (hit && hit.strength >= .35) found.push(hit);
	}
	return found;
}
var PATTERN_LABEL = {
	pin_bar: "Pin bar",
	hammer: "Hammer",
	shooting_star: "Shooting star",
	bullish_engulfing: "Bullish engulfing",
	bearish_engulfing: "Bearish engulfing",
	inside_bar: "Inside bar",
	doji: "Doji"
};
/**
* Map last *closed* HTF bar onto each LTF bar.
* HTF bar at open `h` is closed at `h + htfInterval`. It is available
* for an LTF bar opening at `t` iff `h + htfInterval <= t`.
*/
function mapHtfToLtf(ltf, htf, htfTf) {
	const interval = INTERVAL_MS[htfTf];
	if (ltf.length === 0 || htf.length === 0) return;
	let j = 0;
	for (let i = 0; i < ltf.length; i++) {
		const t = ltf[i].time;
		while (j + 1 < htf.length && htf[j + 1].time + interval <= t) j++;
		const h = htf[j];
		if (h.time + interval <= t) {
			ltf[i].htfClose = h.close;
			ltf[i].htfEma50 = h.ema50;
			ltf[i].htfAdx = h.adx;
			if (h.ema50 != null && h.adx != null) {
				if (h.close > h.ema50 && h.adx >= 20) ltf[i].htfBias = 1;
				else if (h.close < h.ema50 && h.adx >= 20) ltf[i].htfBias = -1;
				else ltf[i].htfBias = 0;
			}
		}
	}
}
function enrichSeries(raw, tf) {
	const feat = computeIndicators(cleanOhlcv(raw, tf));
	applyRegime(feat);
	applyPatterns(feat);
	return feat;
}
function buildDesk(ltfRaw, htfRaw, cfg) {
	const ltf = enrichSeries(ltfRaw, cfg.ltf);
	const htf = enrichSeries(htfRaw, cfg.htf);
	mapHtfToLtf(ltf, htf, cfg.htf);
	const allowShort = cfg.side === "both";
	applyTrendPullback(ltf, {
		tradeVolatility: cfg.tradeVolatility,
		allowShort,
		warmup: cfg.warmup
	});
	applyMeanReversion(ltf, {
		allowShort,
		warmup: cfg.warmup
	});
	return {
		ltf,
		htf
	};
}
function snapshotOf(ltf, cfg, source, sourceNote) {
	const last = ltf[ltf.length - 1];
	if (!last) return {
		symbol: cfg.symbol,
		ltf: cfg.ltf,
		htf: cfg.htf,
		source,
		sourceNote,
		lastTime: 0,
		lastClose: 0,
		regime: "mixed",
		highVol: false,
		confluence: 0,
		confluenceBreakdown: {
			trend: 0,
			momentum: 0,
			volatility: 0,
			volume: 0,
			pattern: 0
		},
		indicators: {},
		lastBars: [],
		patterns: [],
		htfBias: 0,
		pendingSignal: 0,
		pendingReason: "",
		pendingStrategy: "none"
	};
	const breakdown = scoreConfluence(last);
	const confluence = Object.values(breakdown).reduce((s, v) => s + v, 0);
	return {
		symbol: cfg.symbol,
		ltf: cfg.ltf,
		htf: cfg.htf,
		source,
		sourceNote,
		lastTime: last.time,
		lastClose: last.close,
		regime: last.regime,
		highVol: last.highVol,
		confluence,
		confluenceBreakdown: breakdown,
		indicators: latestIndicators(last),
		lastBars: ltf.slice(-5),
		patterns: lastPatterns(ltf, 8),
		htfBias: last.htfBias,
		pendingSignal: last.signal,
		pendingReason: last.signalReason,
		pendingStrategy: last.strategy
	};
}
function applyBundle(cfg, ltfRaw, htfRaw, source, note) {
	const { ltf, htf } = buildDesk(ltfRaw, htfRaw, cfg);
	return {
		ltf,
		htf,
		analysis: snapshotOf(ltf, cfg, source, note),
		explain: explainLastBar(ltf, cfg),
		backtest: null
	};
}
var useDesk = create()((set, get) => ({
	cfg: defaultConfig(),
	tab: "analyze",
	loading: false,
	error: null,
	source: null,
	sourceNote: "",
	ltf: [],
	htf: [],
	analysis: null,
	explain: null,
	backtest: null,
	paper: {
		engine: null,
		cursor: 0,
		events: [],
		playing: false
	},
	setCfg: (partial) => set((s) => ({ cfg: {
		...s.cfg,
		...partial
	} })),
	setTab: (tab) => set({ tab }),
	ingest: (ltfRaw, htfRaw, source, note) => {
		const cfg = get().cfg;
		set({
			...applyBundle(cfg, ltfRaw, htfRaw, source, note),
			source,
			sourceNote: note,
			loading: false,
			error: null,
			paper: {
				engine: null,
				cursor: 0,
				events: [],
				playing: false
			}
		});
	},
	loadSynthetic: () => {
		const cfg = get().cfg;
		const ltfRaw = generateSynthetic(cfg.symbol, cfg.ltf, 1200);
		const htfRaw = generateSynthetic(cfg.symbol, cfg.htf, 420);
		get().ingest(ltfRaw, htfRaw, "synthetic", "Nến mô phỏng (regime-switching). Dùng khi không gọi được API sàn — không phải giá thật.");
	},
	runBt: () => {
		const { ltf, cfg } = get();
		if (ltf.length < cfg.warmup + 50) return;
		set({ backtest: runBacktest(ltf, cfg, cfg.ltf) });
	},
	paperReset: () => {
		const { ltf, cfg } = get();
		if (ltf.length < cfg.warmup + 10) return;
		const start = Math.max(cfg.warmup, ltf.length - 180);
		set({ paper: {
			engine: new SimEngine(ltf, cfg, cfg.ltf, start),
			cursor: start,
			events: [],
			playing: false
		} });
	},
	paperStep: () => {
		const paper = get().paper;
		if (!paper.engine || paper.engine.done) {
			set({ paper: {
				...paper,
				playing: false
			} });
			return;
		}
		const snap = paper.engine.step();
		const events = snap.lastEvent ? [...paper.events, snap.lastEvent].slice(-40) : paper.events;
		set({ paper: {
			engine: paper.engine,
			cursor: snap.i,
			events,
			playing: paper.playing && !snap.done
		} });
	},
	setPlaying: (v) => set((s) => ({ paper: {
		...s.paper,
		playing: v
	} }))
}));
useDesk.getState().loadSynthetic();
var $$splitComponentImporter = () => import("./routes-ChOTTlv8.mjs");
var rootRouteChildren = { IndexRoute: createFileRoute("/")({
	loader: () => {
		const desk = useDesk.getState();
		if (desk.ltf.length === 0) desk.loadSynthetic();
		return { bars: useDesk.getState().ltf.length };
	},
	component: lazyRouteComponent($$splitComponentImporter, "component")
}).update({
	id: "/",
	path: "/",
	getParentRoute: () => Route$1
}) };
var routeTree = Route$1._addFileChildren(rootRouteChildren)._addFileTypes();
var router_exports = /* @__PURE__ */ __exportAll({ getRouter: () => getRouter });
function getRouter() {
	return createRouter({
		routeTree,
		defaultErrorComponent: AppErrorComponent
	});
}
//#endregion
export { useDesk as n, PATTERN_LABEL as r, router_exports as t };
