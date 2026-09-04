import { i as __toESM } from "../_runtime.mjs";
import { n as require_react } from "../_libs/@radix-ui/react-compose-refs+[...].mjs";
import { v as require_jsx_runtime } from "../_libs/@tanstack/react-router+[...].mjs";
import { n as TSS_SERVER_FUNCTION, r as getServerFnById, t as createServerFn } from "./ssr.mjs";
import { n as SYMBOLS, r as TIME_STOP } from "./synthetic-sXCefcjM.mjs";
import { a as string, i as object, r as number, t as _enum } from "../_libs/zod.mjs";
import { a as Pause, c as ChartCandlestick, i as Play, n as SkipForward, o as LoaderCircle, r as RotateCcw, s as Download, t as TriangleAlert } from "../_libs/lucide-react.mjs";
import { n as useDesk, r as PATTERN_LABEL } from "./router-CKZwNOb4.mjs";
import { n as clsx, t as cva } from "../_libs/class-variance-authority+clsx.mjs";
import { t as twMerge } from "../_libs/tailwind-merge.mjs";
import { t as Slot } from "../_libs/radix-ui__react-slot.mjs";
import { a as CartesianGrid, i as Area, n as YAxis, o as ResponsiveContainer, r as XAxis, s as Tooltip, t as AreaChart } from "../_libs/recharts+[...].mjs";
//#region node_modules/.nitro/vite/services/ssr/assets/routes-ChOTTlv8.js
var import_react = /* @__PURE__ */ __toESM(require_react());
var import_jsx_runtime = require_jsx_runtime();
function cn(...inputs) {
	return twMerge(clsx(inputs));
}
function formatUsd(value, digits = 2) {
	const abs = Math.abs(value);
	const sign = value < 0 ? "-" : "";
	if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
	if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(2)}k`;
	return `${sign}$${abs.toFixed(digits)}`;
}
function formatPct(value, digits = 2) {
	if (!Number.isFinite(value)) return "—";
	const pct = value * 100;
	return `${pct > 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}
function formatNumber(value, digits = 2) {
	if (!Number.isFinite(value)) return "—";
	return value.toLocaleString("en-US", {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}
function formatTimeUtc(ms) {
	return new Date(ms).toISOString().replace("T", " ").replace(".000Z", " UTC");
}
function formatDateUtc(ms) {
	return new Date(ms).toISOString().slice(0, 10);
}
var badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-wide", {
	variants: { tone: {
		mute: "bg-surface-2 text-muted",
		fg: "bg-accent/15 text-accent",
		long: "bg-long/15 text-long",
		short: "bg-short/15 text-short",
		warn: "bg-warn/15 text-warn"
	} },
	defaultVariants: { tone: "mute" }
});
function Badge({ className, tone, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
		className: cn(badgeVariants({
			tone,
			className
		})),
		...props
	});
}
function CandleChart({ bars }) {
	const host = (0, import_react.useRef)(null);
	(0, import_react.useEffect)(() => {
		if (!host.current) return;
		let disposed = false;
		let chart = null;
		let ro = null;
		import("../_libs/lightweight-charts.mjs").then((n) => n.t).then((lc) => {
			if (disposed || !host.current) return;
			const node = host.current;
			const created = lc.createChart(node, {
				layout: {
					background: {
						type: lc.ColorType.Solid,
						color: "#12141a"
					},
					textColor: "#8b8d94",
					fontFamily: "IBM Plex Sans, sans-serif",
					fontSize: 11
				},
				grid: {
					vertLines: { color: "rgba(232,230,225,0.05)" },
					horzLines: { color: "rgba(232,230,225,0.05)" }
				},
				rightPriceScale: { borderColor: "rgba(232,230,225,0.08)" },
				timeScale: {
					borderColor: "rgba(232,230,225,0.08)",
					timeVisible: true,
					secondsVisible: false
				},
				crosshair: {
					horzLine: { color: "rgba(216,212,204,0.35)" },
					vertLine: { color: "rgba(216,212,204,0.35)" }
				},
				autoSize: true
			});
			chart = created;
			const candle = created.addSeries(lc.CandlestickSeries, {
				upColor: "#3d8b7a",
				downColor: "#b85c4a",
				borderVisible: false,
				wickUpColor: "#3d8b7a",
				wickDownColor: "#b85c4a"
			});
			const ema20 = created.addSeries(lc.LineSeries, {
				color: "#d8d4cc",
				lineWidth: 1,
				priceLineVisible: false
			});
			const ema50 = created.addSeries(lc.LineSeries, {
				color: "#7a8799",
				lineWidth: 1,
				priceLineVisible: false
			});
			const bbU = created.addSeries(lc.LineSeries, {
				color: "rgba(216,212,204,0.35)",
				lineWidth: 1,
				lineStyle: 2,
				priceLineVisible: false
			});
			const bbL = created.addSeries(lc.LineSeries, {
				color: "rgba(216,212,204,0.35)",
				lineWidth: 1,
				lineStyle: 2,
				priceLineVisible: false
			});
			const vol = created.addSeries(lc.HistogramSeries, {
				priceFormat: { type: "volume" },
				priceScaleId: "vol"
			});
			created.priceScale("vol").applyOptions({
				scaleMargins: {
					top: .82,
					bottom: 0
				},
				borderVisible: false
			});
			const ts = (t) => Math.floor(t / 1e3);
			candle.setData(bars.map((b) => ({
				time: ts(b.time),
				open: b.open,
				high: b.high,
				low: b.low,
				close: b.close
			})));
			ema20.setData(bars.filter((b) => b.ema20 != null).map((b) => ({
				time: ts(b.time),
				value: b.ema20
			})));
			ema50.setData(bars.filter((b) => b.ema50 != null).map((b) => ({
				time: ts(b.time),
				value: b.ema50
			})));
			bbU.setData(bars.filter((b) => b.bbUpper != null).map((b) => ({
				time: ts(b.time),
				value: b.bbUpper
			})));
			bbL.setData(bars.filter((b) => b.bbLower != null).map((b) => ({
				time: ts(b.time),
				value: b.bbLower
			})));
			vol.setData(bars.map((b) => ({
				time: ts(b.time),
				value: b.volume,
				color: b.close >= b.open ? "rgba(61,139,122,0.35)" : "rgba(184,92,74,0.35)"
			})));
			lc.createSeriesMarkers(candle, bars.filter((b) => b.signal !== 0).map((b) => ({
				time: ts(b.time),
				position: b.signal === 1 ? "belowBar" : "aboveBar",
				color: b.signal === 1 ? "#3d8b7a" : "#b85c4a",
				shape: b.signal === 1 ? "arrowUp" : "arrowDown",
				text: b.signal === 1 ? "L" : "S"
			})));
			created.timeScale().fitContent();
			ro = new ResizeObserver(() => created.applyOptions({ width: node.clientWidth }));
			ro.observe(node);
		});
		return () => {
			disposed = true;
			ro?.disconnect();
			chart?.remove();
		};
	}, [bars]);
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		ref: host,
		className: "h-[280px] w-full overflow-hidden rounded-lg bg-surface md:h-[380px]"
	});
}
var REGIME = {
	trending_up: {
		label: "Trending up",
		tone: "long"
	},
	trending_down: {
		label: "Trending down",
		tone: "short"
	},
	ranging: {
		label: "Ranging",
		tone: "mute"
	},
	mixed: {
		label: "Mixed",
		tone: "warn"
	}
};
function Cell({ k, v }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex items-baseline justify-between gap-3 border-b border-border py-1.5 last:border-0",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "text-xs text-muted",
			children: k
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
			className: "font-mono text-xs tabular text-fg",
			children: v
		})]
	});
}
function AnalyzePanel() {
	const analysis = useDesk((s) => s.analysis);
	const ltf = useDesk((s) => s.ltf);
	const sourceNote = useDesk((s) => s.sourceNote);
	const loading = useDesk((s) => s.loading);
	if (!analysis || ltf.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-xl bg-surface p-6 text-sm text-muted",
		children: loading ? "Đang tải nến…" : "Đang chờ dữ liệu nến. Bấm Tải nến hoặc Nến mô phỏng."
	});
	const r = REGIME[analysis.regime];
	const b = analysis.confluenceBreakdown;
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-3 md:p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-3 flex flex-wrap items-end justify-between gap-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-xs tracking-wide text-muted uppercase",
							children: [
								analysis.symbol,
								" · ",
								analysis.ltf,
								" / HTF ",
								analysis.htf
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-2xl tabular text-fg",
							children: formatUsd(analysis.lastClose, 2)
						})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex flex-wrap gap-2",
							children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									tone: r.tone,
									children: r.label
								}),
								analysis.highVol ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
									tone: "warn",
									children: "High vol"
								}) : null,
								/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Badge, {
									tone: analysis.htfBias === 1 ? "long" : analysis.htfBias === -1 ? "short" : "mute",
									children: ["HTF ", analysis.htfBias === 1 ? "long" : analysis.htfBias === -1 ? "short" : "flat"]
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CandleChart, { bars: ltf.slice(-800) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 text-[11px] text-subtle",
						children: sourceNote
					})
				]
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-3 flex items-baseline justify-between",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "font-display text-xl text-fg",
							children: "Confluence"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
							className: "font-mono text-2xl tabular",
							children: Math.round(analysis.confluence)
						})]
					}),
					[
						[
							"Trend",
							b.trend,
							25
						],
						[
							"Momentum",
							b.momentum,
							25
						],
						[
							"Volatility",
							b.volatility,
							20
						],
						[
							"Volume",
							b.volume,
							15
						],
						[
							"Pattern",
							b.pattern,
							15
						]
					].map(([label, val, cap]) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mb-2",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "mb-1 flex justify-between text-[11px] text-muted",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: label }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: "font-mono tabular",
								children: [
									val,
									"/",
									cap
								]
							})]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
							className: "h-1.5 overflow-hidden rounded-full bg-surface-2",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "h-full rounded-full bg-accent",
								style: { width: `${val / cap * 100}%` }
							})
						})]
					}, label)),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-[11px] text-subtle",
						children: [
							"Tổng ",
							Math.round(analysis.confluence),
							"/",
							100,
							" — không phải lệnh. Chỉ đo sự đồng thuận rule."
						]
					})
				]
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-col gap-4",
			children: [
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl bg-surface p-4",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
							className: "mb-2 font-display text-xl",
							children: "Chỉ báo nến đóng"
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "mb-3 text-[11px] text-subtle",
							children: formatTimeUtc(analysis.lastTime)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "EMA 20 / 50 / 200",
							v: `${fmt(analysis.indicators.ema20)} / ${fmt(analysis.indicators.ema50)} / ${fmt(analysis.indicators.ema200)}`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "ADX (14)",
							v: fmt(analysis.indicators.adx)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "RSI (14)",
							v: fmt(analysis.indicators.rsi)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "MACD hist",
							v: fmt(analysis.indicators.macdHist)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "Stoch %K",
							v: fmt(analysis.indicators.stochK)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "ATR / ATR SMA20",
							v: `${fmt(analysis.indicators.atr)} / ${fmt(analysis.indicators.atrSma20)}`
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "BB width",
							v: fmt(analysis.indicators.bbWidth, 4)
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cell, {
							k: "Vol spike",
							v: fmt(analysis.indicators.volSpike)
						})
					]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl bg-surface p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mb-3 font-display text-xl",
						children: "5 nến gần nhất"
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-x-auto",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
							className: "w-full text-left text-[11px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
								className: "text-muted",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "UTC"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Close"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Pattern"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2 font-medium",
										children: "Sig"
									})
								] })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
								className: "font-mono tabular",
								children: analysis.lastBars.map((bar) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1.5 text-muted",
											children: formatTimeUtc(bar.time).slice(5, 16)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1.5",
											children: formatNumber(bar.close, 2)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1.5",
											children: bar.pattern ? PATTERN_LABEL[bar.pattern.name] : "—"
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: bar.signal === 1 ? "text-long" : bar.signal === -1 ? "text-short" : "text-subtle",
											children: bar.signal === 1 ? "L" : bar.signal === -1 ? "S" : "—"
										})
									]
								}, bar.time))
							})]
						})
					})]
				}),
				/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "rounded-xl bg-surface p-4",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mb-3 font-display text-xl",
						children: "Pattern"
					}), analysis.patterns.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "text-sm text-muted",
						children: "Không có pattern đủ mạnh trên vài nến gần."
					}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
						className: "space-y-2",
						children: analysis.patterns.slice(0, 6).map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
							className: "flex items-center justify-between text-sm",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: PATTERN_LABEL[p.name] }), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
								className: p.direction === 1 ? "text-long" : p.direction === -1 ? "text-short" : "text-muted",
								children: [
									p.direction === 1 ? "+1" : p.direction === -1 ? "−1" : "0",
									" · ",
									(p.strength * 100).toFixed(0)
								]
							})]
						}, `${p.index}-${p.name}`))
					})]
				})
			]
		})]
	});
}
function fmt(v, d = 2) {
	if (typeof v !== "number" || !Number.isFinite(v)) return "—";
	return v.toFixed(d);
}
var buttonVariants = cva("inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[opacity,transform,background-color,box-shadow] duration-150 ease-out disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.98]", {
	variants: {
		variant: {
			default: "bg-accent text-accent-fg hover:opacity-90",
			secondary: "bg-surface-2 text-fg shadow-[var(--shadow-border)] hover:bg-surface",
			ghost: "text-muted hover:bg-surface-2 hover:text-fg",
			outline: "shadow-[var(--shadow-border)] text-fg hover:bg-surface-2",
			long: "bg-long text-fg hover:opacity-90",
			short: "bg-short text-fg hover:opacity-90"
		},
		size: {
			default: "h-11 px-4",
			sm: "h-9 px-3 text-xs",
			lg: "h-12 px-5",
			icon: "size-11"
		}
	},
	defaultVariants: {
		variant: "default",
		size: "default"
	}
});
function Button({ className, variant, size, asChild = false, ...props }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(asChild ? Slot : "button", {
		className: cn(buttonVariants({
			variant,
			size,
			className
		})),
		...props
	});
}
function EquityChart({ equity, buyHold }) {
	const [ready, setReady] = (0, import_react.useState)(false);
	(0, import_react.useEffect)(() => setReady(true), []);
	const bhMap = new Map(buyHold?.map((p) => [p.time, p.equity]));
	const data = equity.map((p) => ({
		t: p.time,
		strategy: p.equity,
		hold: bhMap.get(p.time)
	}));
	if (data.length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-lg bg-surface p-6 text-sm text-muted",
		children: "Chưa có đường vốn."
	});
	if (!ready) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "h-56 w-full rounded-lg bg-surface md:h-64" });
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "h-56 w-full rounded-lg bg-surface p-2 md:h-64",
		children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ResponsiveContainer, {
			width: "100%",
			height: "100%",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(AreaChart, {
				data,
				margin: {
					top: 8,
					right: 8,
					left: 0,
					bottom: 0
				},
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("linearGradient", {
						id: "eq",
						x1: "0",
						y1: "0",
						x2: "0",
						y2: "1",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "0%",
							stopColor: "#d8d4cc",
							stopOpacity: .28
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("stop", {
							offset: "100%",
							stopColor: "#d8d4cc",
							stopOpacity: 0
						})]
					}) }),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(CartesianGrid, {
						stroke: "rgba(232,230,225,0.06)",
						vertical: false
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(XAxis, {
						dataKey: "t",
						tickFormatter: (v) => formatDateUtc(v).slice(2),
						tick: {
							fill: "#8b8d94",
							fontSize: 10
						},
						axisLine: false,
						tickLine: false,
						minTickGap: 28
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(YAxis, {
						tickFormatter: (v) => formatUsd(v, 0),
						tick: {
							fill: "#8b8d94",
							fontSize: 10
						},
						axisLine: false,
						tickLine: false,
						width: 56
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Tooltip, {
						contentStyle: {
							background: "#1a1d24",
							border: "1px solid rgba(232,230,225,0.12)",
							borderRadius: 8,
							fontSize: 12
						},
						labelFormatter: (v) => formatDateUtc(Number(v)),
						formatter: (value, name) => [formatUsd(Number(value)), name === "strategy" ? "Chiến lược" : "Buy & hold"]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
						type: "monotone",
						dataKey: "strategy",
						stroke: "#d8d4cc",
						fill: "url(#eq)",
						strokeWidth: 1.5
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Area, {
						type: "monotone",
						dataKey: "hold",
						stroke: "#7a8799",
						fill: "none",
						strokeWidth: 1,
						strokeDasharray: "4 4"
					})
				]
			})
		})
	});
}
function Metric({ label, value, warn }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "rounded-lg bg-surface-2 p-3",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: "text-[11px] tracking-wide text-muted uppercase",
			children: label
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
			className: `mt-1 font-mono text-lg tabular ${warn ? "text-short" : "text-fg"}`,
			children: value
		})]
	});
}
function metricGrid(m) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "grid grid-cols-2 gap-2 md:grid-cols-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "CAGR",
				value: formatPct(m.cagr),
				warn: m.cagr < 0
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Sharpe",
				value: formatNumber(m.sharpe, 2),
				warn: m.sharpe < .8
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Sortino",
				value: formatNumber(m.sortino, 2)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Max DD",
				value: formatPct(-m.maxDd),
				warn: m.maxDd > .25
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Calmar",
				value: formatNumber(m.calmar, 2)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Win rate",
				value: formatPct(m.winRate)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Profit factor",
				value: formatNumber(m.profitFactor, 2)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Avg R",
				value: formatNumber(m.avgR, 2)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Expectancy",
				value: formatUsd(m.expectancy)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Số lệnh",
				value: String(m.trades)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Exposure",
				value: formatPct(m.exposure)
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Metric, {
				label: "Vốn cuối",
				value: formatUsd(m.endEquity)
			})
		]
	});
}
function BacktestPanel() {
	const backtest = useDesk((s) => s.backtest);
	const runBt = useDesk((s) => s.runBt);
	if (useDesk((s) => s.ltf).length === 0) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-xl bg-surface p-6 text-sm text-muted",
		children: "Tải nến trước khi backtest."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface p-4",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
				className: "font-display text-2xl",
				children: "Backtest next-bar"
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
				className: "mt-1 max-w-2xl text-sm text-muted",
				children: "Tín hiệu đóng nến t, khớp open nến t+1. Đã trừ taker fee, slippage, funding (nếu USDT-M). Walk-forward: 70/30 theo thời gian + 3 fold. Không tối ưu trên toàn bộ lịch sử."
			})] }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
				onClick: runBt,
				children: "Chạy backtest"
			})]
		}), !backtest ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
			className: "rounded-xl bg-surface p-6 text-sm text-muted",
			children: "Bấm chạy để mô phỏng trên nến đã tải."
		}) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: `rounded-xl p-4 ${backtest.claimBlocked ? "bg-surface" : "bg-surface"}`,
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
					tone: backtest.claimBlocked ? "warn" : "long",
					children: backtest.claimBlocked ? "Không được claim thắng" : "Ngưỡng tối thiểu đạt"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "mt-2 text-sm text-muted",
					children: backtest.claimReason
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Toàn mẫu"
			}),
			metricGrid(backtest.metrics),
			backtest.testMetrics ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Out-of-sample (30% cuối)"
			}), metricGrid(backtest.testMetrics)] }) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: "Buy & hold cùng cặp"
			}),
			metricGrid(backtest.buyHold),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)(EquityChart, {
				equity: backtest.equity,
				buyHold: backtest.buyHoldEquity
			}),
			backtest.walkForward.length > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "mb-3 font-display text-xl",
					children: "Walk-forward folds"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
					className: "overflow-x-auto",
					children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
						className: "w-full text-left text-xs",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
							className: "text-muted",
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "pb-2",
									children: "Test từ"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "pb-2",
									children: "Đến"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "pb-2",
									children: "Sharpe"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "pb-2",
									children: "Max DD"
								}),
								/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
									className: "pb-2",
									children: "Lệnh"
								})
							] })
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
							className: "font-mono tabular",
							children: backtest.walkForward.map((f) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
								className: "border-t border-border",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-1.5",
										children: formatDateUtc(f.testStart)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-1.5",
										children: formatDateUtc(f.testEnd)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-1.5",
										children: f.test.sharpe.toFixed(2)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-1.5",
										children: formatPct(-f.test.maxDd)
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
										className: "py-1.5",
										children: f.test.trades
									})
								]
							}, f.testStart))
						})]
					})
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "mb-3 font-display text-xl",
					children: "Giai đoạn thua nặng"
				}), backtest.losingPeriods.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Không có đợt DD ≥ 8%."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "space-y-3",
					children: backtest.losingPeriods.map((p) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "text-sm",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: "text-fg",
							children: [
								formatDateUtc(p.start),
								" → ",
								formatDateUtc(p.end),
								" · DD ",
								formatPct(-p.drawdown)
							]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-muted",
							children: p.note
						})]
					}, p.start))
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
						className: "mb-3 font-display text-xl",
						children: "Lệnh gần đây"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "overflow-x-auto",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("table", {
							className: "w-full text-left text-[11px]",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("thead", {
								className: "text-muted",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", { children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2",
										children: "Side"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2",
										children: "In"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2",
										children: "Out"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2",
										children: "PnL"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2",
										children: "R"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)("th", {
										className: "pb-2",
										children: "Lý do"
									})
								] })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("tbody", {
								className: "font-mono tabular",
								children: backtest.trades.slice(-12).reverse().map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("tr", {
									className: "border-t border-border",
									children: [
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: t.side === "long" ? "py-1.5 text-long" : "py-1.5 text-short",
											children: t.side
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1.5",
											children: t.entry.toFixed(2)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1.5",
											children: t.exit.toFixed(2)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: t.pnl >= 0 ? "py-1.5 text-long" : "py-1.5 text-short",
											children: formatUsd(t.pnl)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1.5",
											children: t.pnlR.toFixed(2)
										}),
										/* @__PURE__ */ (0, import_jsx_runtime.jsx)("td", {
											className: "py-1.5 text-muted",
											children: t.reason
										})
									]
								}, t.id))
							})]
						})
					}),
					backtest.dailyHaltDays > 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-xs text-warn",
						children: ["Số ngày bị daily-loss halt: ", backtest.dailyHaltDays]
					}) : null
				]
			})
		] })]
	});
}
var TREE = `crypto_bot/
  config.yaml
  .env.example
  requirements.txt
  src/
    data/fetcher.py        # ccxt + parquet cache
    data/cleaner.py        # sort, dedupe, gap flag
    features/indicators.py # EMA RSI MACD ATR BB ADX
    features/patterns.py   # pin/engulf/inside/doji
    features/regime.py     # trending / ranging / high_vol
    strategy/base.py
    strategy/trend_pullback.py
    strategy/mean_reversion.py
    risk/sizer.py          # % vốn / ATR
    risk/limits.py         # daily loss, exposure
    backtest/engine.py     # next-bar, fee, funding
    backtest/metrics.py
    report/charts.py       # plotly
    bot/paper.py
    bot/live_stub.py       # cố ý chưa gửi lệnh
  freqtrade/TrendPullback.py
  tests/`;
function CodePanel() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-4 md:p-5",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl",
						children: "Gói Python production"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-3xl text-sm leading-relaxed text-muted",
						children: "Cùng 5 lớp với engine đang chạy trên desk (Data / Features / Strategy / Risk / Execution). Terminal này chạy TypeScript trên trình duyệt; file Python để bạn paper trên máy local với ccxt. Không hard-code API key — dùng biến môi trường."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
						className: "mt-4",
						children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
							asChild: true,
							children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("a", {
								href: "/vela-crypto-bot.zip",
								download: true,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Download, {}), "Tải crypto_bot.zip"]
							})
						})
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsx)("pre", {
				className: "overflow-x-auto rounded-xl bg-surface p-4 font-mono text-[11px] leading-relaxed text-muted",
				children: TREE
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Cách tối ưu mà không overfit"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ol", {
					className: "mt-3 list-decimal space-y-2 pl-5 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Giữ bộ tham số nhỏ: EMA, RSI band, ATR clamp, volume spike. Đừng lưới 20 tham số trên 3 tháng một coin." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Chia thời gian: train / test theo lịch sử. Chỉ nhìn test khi chốt rule." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Walk-forward 3–4 cửa sổ. Bỏ rule nếu Sharpe test đổi dấu giữa các fold." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Chạy BTC, ETH, SOL cùng một bộ tham số. Nếu chỉ sống trên một cặp — gần như curve-fit." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Paper tối thiểu vài tuần, gồm tin tức. Rồi mới nghĩ tới live 1x, size nhỏ." })
					]
				})]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Rủi ro vận hành"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "mt-3 space-y-2 text-sm text-muted",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Funding 8h trên USDT-M có thể ăn hết edge của swing chậm." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Gap cuối tuần / bảo trì sàn: SL có thể trượt xa hơn ATR clamp." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "API ban, rate limit, clock drift — paper loop phải idempotent." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Sự kiện (CPI, FOMC, unlock): ADX và ATR nhảy, rule high_vol có thể lọc trễ một nến." }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Quá khứ không đảm bảo tương lai. Desk này không phải lời khuyên đầu tư." })
					]
				})]
			})
		]
	});
}
function PaperPanel() {
	const paper = useDesk((s) => s.paper);
	const ltf = useDesk((s) => s.ltf);
	const paperReset = useDesk((s) => s.paperReset);
	const paperStep = useDesk((s) => s.paperStep);
	const setPlaying = useDesk((s) => s.setPlaying);
	const cfg = useDesk((s) => s.cfg);
	(0, import_react.useEffect)(() => {
		if (!paper.playing) return;
		const id = window.setInterval(() => useDesk.getState().paperStep(), 280);
		return () => window.clearInterval(id);
	}, [paper.playing]);
	(0, import_react.useEffect)(() => {
		if (!paper.engine && ltf.length > 250) paperReset();
	}, [
		ltf.length,
		paper.engine,
		paperReset
	]);
	const engine = paper.engine;
	const pos = engine?.position ?? null;
	const equity = engine ? engine.equity : cfg.equity;
	const bar = engine && !engine.done ? ltf[Math.min(engine.i, ltf.length - 1)] : ltf[ltf.length - 1];
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl",
						children: "Paper replay"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-2xl text-sm text-muted",
						children: "Mô phỏng 180 nến gần nhất với cùng engine backtest (next-bar, phí, SL/TP). Không gửi lệnh lên sàn. Live stub trong gói Python cố ý chưa bật."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "mt-4 flex flex-wrap gap-2",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: paperReset,
								variant: "secondary",
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RotateCcw, {}), "Reset replay"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: paperStep,
								variant: "outline",
								disabled: !engine || engine.done,
								children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(SkipForward, {}), "Bước 1 nến"]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
								onClick: () => setPlaying(!paper.playing),
								variant: "outline",
								disabled: !engine || engine.done,
								children: [paper.playing ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Pause, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Play, {}), paper.playing ? "Dừng" : "Tự chạy"]
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-3 sm:grid-cols-3",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl bg-surface p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-muted uppercase",
							children: "Equity mark"
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "font-mono text-2xl tabular",
							children: formatUsd(equity)
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl bg-surface p-4",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-[11px] text-muted uppercase",
							children: "Vị thế"
						}), pos ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
							className: pos.side === "long" ? "text-long" : "text-short",
							children: [
								pos.side.toUpperCase(),
								" ",
								pos.qty.toFixed(4),
								" @ ",
								pos.entry.toFixed(2)
							]
						}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
							className: "text-muted",
							children: "Flat"
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "rounded-xl bg-surface p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "text-[11px] text-muted uppercase",
								children: "Nến replay"
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "font-mono tabular",
								children: engine ? `${engine.i} / ${ltf.length}` : "—"
							}),
							bar ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-xs text-subtle",
								children: ["close ", bar.close.toFixed(2)]
							}) : null
						]
					})
				]
			}),
			pos ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4 text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "mb-2 flex gap-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							tone: pos.side === "long" ? "long" : "short",
							children: pos.side
						}),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, { children: pos.strategy }),
						pos.trailed ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							tone: "fg",
							children: "BE trail"
						}) : null,
						pos.tp1Done ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
							tone: "long",
							children: "TP1 filled"
						}) : null
					]
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
					className: "font-mono text-xs text-muted",
					children: [
						"SL ",
						pos.stop.toFixed(2),
						" · TP1 ",
						pos.tp1.toFixed(2),
						" · TP2 ",
						pos.tp2.toFixed(2),
						" · held ",
						pos.barsHeld,
						"n · R max",
						" ",
						pos.rReached.toFixed(2)
					]
				})]
			}) : null,
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "mb-3 font-display text-xl",
					children: "Nhật ký"
				}), paper.events.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
					className: "text-sm text-muted",
					children: "Reset replay rồi bước nến để thấy fill / exit / halt."
				}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
					className: "max-h-72 space-y-2 overflow-auto font-mono text-xs",
					children: [...paper.events].reverse().map((e, i) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
						className: "text-muted",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "text-subtle",
								children: new Date(e.time).toISOString().slice(5, 16)
							}),
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: e.kind === "fill" ? "text-long" : e.kind === "exit" ? "text-fg" : "text-warn",
								children: e.kind
							}),
							" ",
							e.message
						]
					}, `${e.time}-${i}`))
				})]
			})
		]
	});
}
function RuleList({ title, rules, pass }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
		className: "rounded-xl bg-surface p-4",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
			className: "mb-3 flex items-center justify-between gap-2",
			children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
				className: "font-display text-xl",
				children: title
			}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
				tone: pass ? "long" : "mute",
				children: pass ? "Đủ điều kiện" : "Chưa đủ"
			})]
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("ul", {
			className: "space-y-2",
			children: rules.map((r) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("li", {
				className: "flex items-start gap-2 text-sm",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
					className: `mt-1 size-1.5 shrink-0 rounded-full ${r.pass ? "bg-long" : "bg-subtle"}`,
					"aria-hidden": true
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: r.pass ? "text-fg" : "text-muted",
						children: r.label
					}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "font-mono text-[11px] text-subtle",
						children: r.detail
					})]
				})]
			}, r.id))
		})]
	});
}
function StrategyPanel() {
	const explain = useDesk((s) => s.explain);
	const analysis = useDesk((s) => s.analysis);
	if (!explain || !analysis) return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
		className: "rounded-xl bg-surface p-6 text-sm text-muted",
		children: "Tải nến trước để soi rule trên nến đóng cuối."
	});
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "flex flex-col gap-4",
		children: [
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "rounded-xl bg-surface p-4",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h2", {
						className: "font-display text-2xl",
						children: "Trend Pullback + Momentum Confirm"
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
						className: "mt-2 max-w-3xl text-sm leading-relaxed text-muted",
						children: "Chiến lược chính: chỉ vào khi khung lớn có bias, giá hồi (không đuổi breakout), RSI/MACD xác nhận, volume đủ, nến tín hiệu rõ. Tín hiệu sinh ra lúc đóng nến LTF, khớp nến kế tiếp. Không pyramiding."
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
						className: "mt-2 text-xs text-subtle",
						children: [
							"Tín hiệu nến đóng:",
							" ",
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: analysis.pendingSignal === 1 ? "text-long" : analysis.pendingSignal === -1 ? "text-short" : "text-muted",
								children: analysis.pendingSignal === 1 ? `LONG · ${analysis.pendingReason}` : analysis.pendingSignal === -1 ? `SHORT · ${analysis.pendingReason}` : "không có"
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "grid gap-4 lg:grid-cols-2",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RuleList, {
						title: "Entry LONG",
						rules: explain.trendLong,
						pass: explain.trendLongPass
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RuleList, {
						title: "Entry SHORT",
						rules: explain.trendShort,
						pass: explain.trendShortPass
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RuleList, {
						title: "Mean reversion LONG",
						rules: explain.mrLong,
						pass: explain.mrLongPass
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)(RuleList, {
						title: "Mean reversion SHORT",
						rules: explain.mrShort,
						pass: explain.mrShortPass
					})
				]
			}),
			/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("section", {
				className: "rounded-xl bg-surface p-4",
				children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", {
					className: "font-display text-xl",
					children: "Quản trị lệnh"
				}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("ul", {
					className: "mt-3 grid gap-2 text-sm text-muted md:grid-cols-2",
					children: [
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "SL: swing ± clamp 1.2–2.5 ATR (MR: 1.8 ATR)" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "TP1: 1.5R đóng 50% · TP2: 2.5R hoặc EMA20 đảo + MACD yếu" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Trailing: sau +1R dời SL về hòa + phí" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Time stop: 48 nến 15m / 24 nến 1h / 16 nến 4h" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Size: risk_usdt = equity × risk% · qty = risk / stop_distance" }),
						/* @__PURE__ */ (0, import_jsx_runtime.jsx)("li", { children: "Daily loss cap 3% vốn · max expose 25% · đòn bẩy ≤ 3×" })
					]
				})]
			})
		]
	});
}
var createSsrRpc = (functionId) => {
	const url = "/_serverFn/" + functionId;
	const serverFnMeta = { id: functionId };
	const fn = async (...args) => {
		return (await getServerFnById(functionId, { origin: "server" }))(...args);
	};
	return Object.assign(fn, {
		url,
		serverFnMeta,
		[TSS_SERVER_FUNCTION]: true
	});
};
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
var loadOhlcv = createServerFn({ method: "POST" }).validator((data) => Schema.parse(data)).handler(createSsrRpc("b79c3e16a3945c23dd7aa59972587fbb49a208d6d62dab965fa76a94a780892c"));
var TABS = [
	{
		id: "analyze",
		label: "Phân tích"
	},
	{
		id: "strategy",
		label: "Chiến lược"
	},
	{
		id: "backtest",
		label: "Backtest"
	},
	{
		id: "paper",
		label: "Replay"
	},
	{
		id: "code",
		label: "Python"
	}
];
function barBudget(tf) {
	switch (tf) {
		case "15m": return 2500;
		case "1h": return 5e3;
		case "4h": return 3200;
		case "1d": return 1200;
	}
}
function DeskApp() {
	const cfg = useDesk((s) => s.cfg);
	const setCfg = useDesk((s) => s.setCfg);
	const tab = useDesk((s) => s.tab);
	const setTab = useDesk((s) => s.setTab);
	const loading = useDesk((s) => s.loading);
	const error = useDesk((s) => s.error);
	const ingest = useDesk((s) => s.ingest);
	const loadSynthetic = useDesk((s) => s.loadSynthetic);
	const runBt = useDesk((s) => s.runBt);
	const analysis = useDesk((s) => s.analysis);
	const source = useDesk((s) => s.source);
	async function loadLive() {
		const current = useDesk.getState().cfg;
		useDesk.setState({
			loading: true,
			error: null
		});
		try {
			const bundle = await loadOhlcv({ data: {
				symbol: current.symbol,
				ltf: current.ltf,
				htf: current.htf,
				market: current.market,
				ltfBars: barBudget(current.ltf),
				htfBars: barBudget(current.htf)
			} });
			ingest(bundle.ltf, bundle.htf, bundle.source, bundle.sourceNote);
			useDesk.getState().runBt();
		} catch (err) {
			useDesk.setState({
				loading: false,
				error: err instanceof Error ? err.message : "Không tải được nến"
			});
			useDesk.getState().loadSynthetic();
			useDesk.getState().runBt();
		}
	}
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
		className: "min-h-dvh bg-bg text-fg",
		children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("header", {
			className: "border-b border-border",
			children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
				className: "mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 md:px-6",
				children: [
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-wrap items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex items-center gap-3",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
								className: "flex size-9 items-center justify-center rounded-md bg-surface-2",
								children: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ChartCandlestick, { className: "size-4 text-accent" })
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { children: [/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "font-display text-2xl leading-none tracking-tight md:text-3xl",
								children: ["Vela ", /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", {
									className: "italic text-muted",
									children: "Desk"
								})]
							}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", {
								className: "mt-1 text-[11px] tracking-wide text-subtle uppercase",
								children: "Systematic research"
							})] })]
						}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
							className: "flex max-w-xl items-start gap-2 rounded-lg bg-surface px-3 py-2 text-xs text-muted",
							children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)(TriangleAlert, { className: "mt-0.5 size-3.5 shrink-0 text-warn" }), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { children: "Quá khứ không đảm bảo tương lai. Paper trade trước live. Đây không phải lời khuyên đầu tư." })]
						})]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
						className: "flex flex-col gap-3 rounded-xl bg-surface p-3 md:p-4",
						children: [
							/* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", {
								className: "flex flex-wrap gap-2",
								children: SYMBOLS.map((s) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
									type: "button",
									onClick: () => setCfg({ symbol: s }),
									className: cn("h-11 rounded-full px-4 text-sm", cfg.symbol === s ? "bg-accent text-accent-fg" : "bg-surface-2 text-muted"),
									children: s
								}, s))
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "LTF",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg",
											value: cfg.ltf,
											onChange: (e) => {
												const ltf = e.target.value;
												setCfg({
													ltf,
													timeStopBars: TIME_STOP[ltf]
												});
											},
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "15m",
													children: "15m intraday"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "1h",
													children: "1h"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "4h",
													children: "4h swing"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "1d",
													children: "1d"
												})
											]
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "HTF",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg",
											value: cfg.htf,
											onChange: (e) => setCfg({ htf: e.target.value }),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "1h",
													children: "1h"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "4h",
													children: "4h"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "1d",
													children: "1d"
												})
											]
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Thị trường",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg",
											value: cfg.market,
											onChange: (e) => setCfg({ market: e.target.value }),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "usdm",
												children: "USDT-M futures"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "spot",
												children: "Spot"
											})]
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Chiều",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg",
											value: cfg.side,
											onChange: (e) => setCfg({ side: e.target.value }),
											children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "both",
												children: "Long + short"
											}), /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
												value: "long_only",
												children: "Chỉ long"
											})]
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Risk / lệnh",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg",
											value: String(cfg.riskPct),
											onChange: (e) => setCfg({ riskPct: Number(e.target.value) }),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "0.005",
													children: "0.50%"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "0.0075",
													children: "0.75%"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "0.01",
													children: "1.00%"
												})
											]
										})
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Field, {
										label: "Đòn bẩy max",
										children: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("select", {
											className: "h-11 w-full rounded-md bg-surface-2 px-3 text-sm text-fg",
											value: String(cfg.maxLeverage),
											onChange: (e) => setCfg({ maxLeverage: Number(e.target.value) }),
											children: [
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "1",
													children: "1x"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "2",
													children: "2x"
												}),
												/* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", {
													value: "3",
													children: "3x"
												})
											]
										})
									})
								]
							}),
							/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", {
								className: "flex flex-wrap items-center gap-2",
								children: [
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)(Button, {
										onClick: () => void loadLive(),
										disabled: loading,
										children: [loading ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(LoaderCircle, { className: "animate-spin" }) : null, "Tải nến"]
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsx)(Button, {
										variant: "secondary",
										onClick: () => {
											loadSynthetic();
											runBt();
										},
										disabled: loading,
										children: "Nến mô phỏng"
									}),
									/* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
										className: "flex h-11 items-center gap-2 rounded-md bg-surface-2 px-3 text-sm text-muted",
										children: [/* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", {
											type: "checkbox",
											checked: cfg.tradeVolatility,
											onChange: (e) => setCfg({ tradeVolatility: e.target.checked }),
											className: "size-4 accent-accent"
										}), "Trade khi ATR cực đoan"]
									}),
									source ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Badge, {
										tone: source === "synthetic" ? "warn" : "fg",
										children: source
									}) : null,
									analysis ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", {
										className: "font-mono text-xs text-muted",
										children: [
											analysis.symbol,
											" ",
											formatMaybe(analysis.lastClose)
										]
									}) : null
								]
							}),
							error ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("p", {
								className: "text-xs text-short",
								children: [error, " — đã fallback mô phỏng nếu có."]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, import_jsx_runtime.jsx)("nav", {
						className: "-mx-1 flex gap-1 overflow-x-auto pb-1",
						"aria-label": "Mục desk",
						children: TABS.map((t) => /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", {
							type: "button",
							onClick: () => setTab(t.id),
							className: cn("h-11 shrink-0 rounded-full px-4 text-sm", tab === t.id ? "bg-accent text-accent-fg" : "text-muted hover:bg-surface-2 hover:text-fg"),
							children: t.label
						}, t.id))
					})
				]
			})
		}), /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("main", {
			className: "mx-auto max-w-6xl px-4 py-5 pb-16 md:px-6",
			children: [
				tab === "analyze" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(AnalyzePanel, {}) : null,
				tab === "strategy" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(StrategyPanel, {}) : null,
				tab === "backtest" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(BacktestPanel, {}) : null,
				tab === "paper" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(PaperPanel, {}) : null,
				tab === "code" ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CodePanel, {}) : null
			]
		})]
	});
}
function Field({ label, children }) {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", {
		className: "flex flex-col gap-1 text-[11px] tracking-wide text-muted uppercase",
		children: [label, children]
	});
}
function formatMaybe(n) {
	if (!Number.isFinite(n)) return "";
	return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}
function Home() {
	return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(DeskApp, {});
}
//#endregion
export { Home as component };
