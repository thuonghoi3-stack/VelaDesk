import { create } from "zustand";
import { persist } from "zustand/middleware";
import { evaluateAlerts, type Alert, type AlertEvaluation } from "./alerts-core.ts";

type AlertsState = {
  alerts: Alert[];
  /** (symbol, tf, bar-time) keys of signal toasts already shown — no repeats. */
  seenSignals: string[];
  add: (a: Alert) => void;
  remove: (id: string) => void;
  clearTriggered: () => void;
  applyEvaluation: (result: AlertEvaluation) => void;
  markSignalSeen: (key: string) => void;
};

/**
 * Chart alerts persist in localStorage (this app has no accounts). Evaluation
 * runs wherever a fresh price lands — watchlist poll or data reload — and the
 * caller owns notifying (toast) from the `fired` list it passed in.
 */
export const useAlerts = create<AlertsState>()(
  persist(
    (set) => ({
      alerts: [],
      seenSignals: [],
      add: (a) => set((s) => ({ alerts: [...s.alerts, a] })),
      remove: (id) => set((s) => ({ alerts: s.alerts.filter((x) => x.id !== id) })),
      clearTriggered: () => set((s) => ({ alerts: s.alerts.filter((x) => x.triggeredAt == null) })),
      applyEvaluation: ({ fired }) => {
        if (fired.length === 0) return;
        set((s) => {
          const byId = new Map(fired.map((f) => [f.id, f]));
          return { alerts: s.alerts.map((a) => byId.get(a.id) ?? a) };
        });
      },
      markSignalSeen: (key) =>
        set((s) => ({ seenSignals: [...s.seenSignals, key].slice(-100) })),
    }),
    {
      name: "vela-alerts",
      version: 1,
    },
  ),
);

export { evaluateAlerts };
