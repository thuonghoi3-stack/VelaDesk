import { Badge } from "@/components/ui/badge";
import { useDesk } from "@/lib/quant/store";
import type { RuleCheck } from "@/lib/quant/strategy/base";

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

export function StrategyPanel() {
  const explain = useDesk((s) => s.explain);
  const analysis = useDesk((s) => s.analysis);
  if (!explain || !analysis) {
    return <div className="rounded-xl bg-surface p-6 text-sm text-muted">Tải nến trước để soi rule trên nến đóng cuối.</div>;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface p-4">
        <h2 className="font-display text-2xl">Trend Pullback + Momentum Confirm</h2>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          Chiến lược chính: chỉ vào khi khung lớn có bias, giá hồi (không đuổi breakout), RSI/MACD xác nhận,
          volume đủ, nến tín hiệu rõ. Tín hiệu sinh ra lúc đóng nến LTF, khớp nến kế tiếp. Không pyramiding.
        </p>
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
      <div className="grid gap-4 lg:grid-cols-2">
        <RuleList title="Entry LONG" rules={explain.trendLong} pass={explain.trendLongPass} />
        <RuleList title="Entry SHORT" rules={explain.trendShort} pass={explain.trendShortPass} />
        <RuleList title="Mean reversion LONG" rules={explain.mrLong} pass={explain.mrLongPass} />
        <RuleList title="Mean reversion SHORT" rules={explain.mrShort} pass={explain.mrShortPass} />
      </div>
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
    </div>
  );
}
