import { Badge } from "@/components/ui/badge";
import { useDesk } from "@/lib/quant/store";
import {
  REVERSION_CLASS,
  SIGNAL_EXIT_CLASS,
  STRATEGY_LIBRARY,
  STRATEGY_SELECT_OPTIONS,
} from "@/lib/quant/strategy/library";
import type { RuleCheck } from "@/lib/quant/strategy/base";
import type { DeskConfig } from "@/lib/quant/types";
import { cn } from "@/lib/utils";

function RuleList({ title, rules, pass }: { title: string; rules: RuleCheck[]; pass: boolean }) {
  return (
    <section className="rounded-xl bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="font-display text-xl">{title}</h3>
        <Badge tone={pass ? "long" : "mute"}>{pass ? "Đủ điều kiện" : "Chưa đủ"}</Badge>
      </div>
      <ul className="space-y-2">
        {rules.map((r) => (
          <li key={r.id} className="flex items-start gap-2 text-sm">
            <span
              className={`mt-1 size-1.5 shrink-0 rounded-full ${r.pass ? "bg-long" : "bg-subtle"}`}
              aria-hidden
            />
            <div className="min-w-0">
              <p className={r.pass ? "text-fg" : "text-muted"}>{r.label}</p>
              <p className="font-mono text-[11px] text-subtle">{r.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const STYLE_TONE: Record<string, "long" | "warn" | "mute"> = {
  Trend: "long",
  Reversion: "warn",
  Breakout: "mute",
};

export function StrategyPanel() {
  const explain = useDesk((s) => s.explain);
  const analysis = useDesk((s) => s.analysis);
  const cfg = useDesk((s) => s.cfg);
  const setCfg = useDesk((s) => s.setCfg);
  const active = cfg.strategyId;
  const activePort = STRATEGY_LIBRARY.find((s) => s.id === active);

  if (!analysis) {
    return <div className="rounded-xl bg-surface p-6 text-sm text-muted">Tải nến trước để soi rule trên nến đóng cuối.</div>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl">
            {active === "combo"
              ? "Tổ hợp: Trend Pullback + Mean Reversion"
              : (activePort?.name ?? STRATEGY_SELECT_OPTIONS.find((o) => o.id === active)?.label ?? active)}
          </h2>
          <select
            className="h-10 rounded-md bg-surface-2 px-3 text-sm text-fg"
            value={active}
            onChange={(e) => setCfg({ strategyId: e.target.value as DeskConfig["strategyId"] })}
          >
            {STRATEGY_SELECT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {activePort ? (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            Port từ <span className="text-fg">{activePort.origin}</span>. Entry giữ nguyên logic Pine
            (đóng nến t, khớp open t+1); exit được quản bởi risk engine của desk (ATR stop, TP
            ladder, break-even, time stop) — kết quả sẽ khác tester của TradingView một cách chủ ý.
          </p>
        ) : (
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
            {active === "combo"
              ? "Mặc định của desk: Trend Pullback (chính) xếp lớp với Mean Reversion (phụ) — TP thắng nếu cả hai cùng firing."
              : "Chiến lược nội bộ của desk — chỉnh tham số trong tab Tester → Inputs."}
          </p>
        )}
        <p className="mt-2 text-xs text-subtle">
          Tín hiệu nến đóng:{" "}
          <span className={analysis.pendingSignal === 1 ? "text-long" : analysis.pendingSignal === -1 ? "text-short" : "text-muted"}>
            {analysis.pendingSignal === 1
              ? `LONG · ${analysis.pendingReason}`
              : analysis.pendingSignal === -1
                ? `SHORT · ${analysis.pendingReason}`
                : "không có"}
          </span>
        </p>
      </div>

      {activePort ? (
        <section className="rounded-xl bg-surface p-4">
          <h3 className="mb-3 font-display text-xl">Rule port từ Pine Script</h3>
          <ul className="space-y-2">
            {activePort.rules.map((r) => (
              <li key={r} className="flex items-start gap-2 text-sm text-muted">
                <span className="mt-1 size-1.5 shrink-0 rounded-full bg-accent" aria-hidden />
                <span className="text-fg">{r}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-subtle">
            Explain từng điều kiện trên nến đóng cuối hiện chỉ khả dụng cho các chiến lược nội bộ
            (Trend Pullback / Mean Reversion).
          </p>
        </section>
      ) : explain ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {active !== "mean_reversion" ? (
            <>
              <RuleList title="Entry LONG" rules={explain.trendLong} pass={explain.trendLongPass} />
              <RuleList title="Entry SHORT" rules={explain.trendShort} pass={explain.trendShortPass} />
            </>
          ) : null}
          {active !== "trend_pullback" ? (
            <>
              <RuleList title="Mean reversion LONG" rules={explain.mrLong} pass={explain.mrLongPass} />
              <RuleList title="Mean reversion SHORT" rules={explain.mrShort} pass={explain.mrShortPass} />
            </>
          ) : null}
        </div>
      ) : null}

      {active === "combo" ? (
        <section className="rounded-xl bg-surface p-4">
          <h3 className="font-display text-xl">Quản trị lệnh</h3>
          <ul className="mt-3 grid gap-2 text-sm text-muted md:grid-cols-2">
            <li>SL: swing ± clamp 1.2–2.5 ATR (MR: 1.8 ATR)</li>
            <li>TP1: 1.5R đóng 50% · TP2: 2.5R hoặc EMA20 đảo + MACD yếu</li>
            <li>Trailing: sau +1R dời SL về hòa + phí</li>
            <li>Time stop: 48 nến 15m / 24 nến 1h / 16 nến 4h</li>
            <li>Size: risk_usdt = equity × risk% · qty = risk / stop_distance</li>
            <li>Daily loss cap 3% vốn · max expose 25% · đòn bẩy ≤ 3×</li>
          </ul>
        </section>
      ) : null}

      <section className="rounded-xl bg-surface p-4">
        <h3 className="mb-1 font-display text-xl">Kho chiến lược port từ TradingView</h3>
        <p className="mb-3 text-xs text-subtle">
          Chọn để chạy lại toàn bộ desk (chart, tester, screener) với chiến lược đó — cùng engine
          risk, cùng next-bar fill, cùng phí.
        </p>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {STRATEGY_LIBRARY.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setCfg({ strategyId: s.id })}
              className={cn(
                "rounded-xl border p-3 text-left transition-colors",
                active === s.id
                  ? "border-border-strong bg-surface-2"
                  : "border-border bg-surface hover:bg-surface-2/60",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-fg">{s.name}</p>
                <Badge tone={STYLE_TONE[s.style] ?? "mute"}>{s.style}</Badge>
              </div>
              <p className="mt-1 text-[10px] text-subtle uppercase">
                {SIGNAL_EXIT_CLASS.has(s.id)
                  ? "Exit: tín hiệu đảo chiều"
                  : REVERSION_CLASS.has(s.id)
                    ? "Exit: TP + time stop"
                    : "Exit: ladder chuẩn"}
              </p>
              <p className="mt-1 text-[11px] text-subtle">{s.origin}</p>
              <ul className="mt-2 space-y-1">
                {s.rules.slice(0, 3).map((r) => (
                  <li key={r} className="text-[11px] leading-snug text-muted">
                    · {r}
                  </li>
                ))}
              </ul>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
