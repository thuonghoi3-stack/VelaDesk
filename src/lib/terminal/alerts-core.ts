/**
 * Alert core — pure, storage-free (the persisted zustand store wraps this).
 * Alert kinds mirror TradingView's condition picker: price crossing a level,
 * an indicator (RSI) crossing a level, or a 24h percent move.
 */

export type AlertKind = "price_above" | "price_below" | "rsi_above" | "rsi_below" | "pct_up" | "pct_down";

export type Alert = {
  id: string;
  symbol: string;
  kind: AlertKind;
  /** Threshold: a price, an RSI level, or a percent (0.05 = 5%) by kind. */
  price: number;
  note: string;
  createdAt: number;
  triggeredAt: number | null;
};

let seq = 1;

/** Value below which a threshold is interpreted as a percent move (0.05 = 5%). */
const PCT_KINDS: ReadonlySet<AlertKind> = new Set(["pct_up", "pct_down"]);
const RSI_KINDS: ReadonlySet<AlertKind> = new Set(["rsi_above", "rsi_below"]);

export function makeAlert(
  symbol: string,
  kind: AlertKind,
  value: number,
  currentPrice: number | null,
  note = "",
): Alert {
  // Price alerts drawn without an explicit direction pick the side the level
  // sits on relative to the reference price.
  let resolved: AlertKind = kind;
  if ((kind === "price_above" || kind === "price_below") && currentPrice != null) {
    resolved = value < currentPrice ? "price_below" : "price_above";
  }
  return {
    id: `a${Date.now().toString(36)}${(seq++).toString(36)}`,
    symbol,
    kind: resolved,
    price: value,
    note,
    createdAt: Date.now(),
    triggeredAt: null,
  };
}

export function alertLabel(a: Alert): string {
  const v = a.price >= 100 ? a.price.toFixed(1) : a.price >= 1 ? a.price.toFixed(3) : a.price.toFixed(5);
  switch (a.kind) {
    case "price_above":
      return `giá ≥ ${v}`;
    case "price_below":
      return `giá ≤ ${v}`;
    case "rsi_above":
      return `RSI ≥ ${v}`;
    case "rsi_below":
      return `RSI ≤ ${v}`;
    case "pct_up":
      return `24h ≥ +${(a.price * 100).toFixed(1)}%`;
    case "pct_down":
      return `24h ≤ −${(a.price * 100).toFixed(1)}%`;
  }
}

export type AlertContext = {
  price?: number | null;
  rsi?: number | null;
  /** 24h change as a fraction (0.05 = 5%). */
  changePct?: number | null;
};

export type AlertEvaluation<AlertT extends Alert = Alert> = {
  fired: AlertT[];
  remaining: AlertT[];
};

function kindValue(a: Alert, ctx: AlertContext): number | null {
  if (PCT_KINDS.has(a.kind)) return ctx.changePct ?? null;
  if (RSI_KINDS.has(a.kind)) return ctx.rsi ?? null;
  return ctx.price ?? null;
}

/**
 * Evaluate alerts for one symbol against whatever context is available
 * (price from the watchlist poll, RSI from the last closed bar, 24h change
 * from the ticker). Alerts whose context field is missing stay pending, and
 * already-triggered alerts never re-fire.
 */
export function evaluateAlerts<AlertT extends Alert>(
  alerts: AlertT[],
  symbol: string,
  ctx: AlertContext,
): AlertEvaluation<AlertT> {
  const fired: AlertT[] = [];
  const remaining: AlertT[] = [];
  for (const a of alerts) {
    if (a.symbol !== symbol || a.triggeredAt != null) {
      remaining.push(a);
      continue;
    }
    const v = kindValue(a, ctx);
    if (v == null || !Number.isFinite(v)) {
      remaining.push(a);
      continue;
    }
    let hit: boolean;
    switch (a.kind) {
      case "price_above":
      case "rsi_above":
      case "pct_up":
        hit = v >= a.price;
        break;
      default:
        hit = v <= a.price;
    }
    if (hit) fired.push({ ...a, triggeredAt: Date.now() });
    else remaining.push(a);
  }
  return { fired, remaining };
}
