/**
 * Data-source preference — persisted per browser (localStorage).
 * "auto" tries the last source that actually worked (sticky); explicit
 * binance/okx forces the order for the whole desk.
 */
export type SourcePref = "auto" | "binance" | "okx";

const KEY = "vela-source-pref";
const LAST_OK_KEY = "vela-source-last-ok";

export function getSourcePref(): SourcePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "binance" || v === "okx" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function setSourcePref(v: SourcePref): void {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    /* ignore */
  }
}

export function getLastOkSource(): "binance" | "okx" | null {
  try {
    const v = localStorage.getItem(LAST_OK_KEY);
    return v === "binance" || v === "okx" ? v : null;
  } catch {
    return null;
  }
}

export function setLastOkSource(v: "binance" | "okx"): void {
  try {
    localStorage.setItem(LAST_OK_KEY, v);
  } catch {
    /* ignore */
  }
}
