import { Pause, Play, SkipForward, RotateCcw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useDesk } from "@/lib/quant/store";
import { formatUsd } from "@/lib/utils";

export function PaperPanel() {
  const paper = useDesk((s) => s.paper);
  const ltf = useDesk((s) => s.ltf);
  const paperReset = useDesk((s) => s.paperReset);
  const paperStep = useDesk((s) => s.paperStep);
  const setPlaying = useDesk((s) => s.setPlaying);
  const cfg = useDesk((s) => s.cfg);

  useEffect(() => {
    if (!paper.playing) return;
    const id = window.setInterval(() => useDesk.getState().paperStep(), 280);
    return () => window.clearInterval(id);
  }, [paper.playing]);

  useEffect(() => {
    if (!paper.engine && ltf.length > 250) paperReset();
  }, [ltf.length, paper.engine, paperReset]);

  const engine = paper.engine;
  const pos = engine?.position ?? null;
  const equity = engine ? engine.equity : cfg.equity;
  const bar = engine && !engine.done ? ltf[Math.min(engine.i, ltf.length - 1)] : ltf[ltf.length - 1];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-surface p-4">
        <h2 className="font-display text-2xl">Paper replay</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Mô phỏng 180 nến gần nhất với cùng engine backtest (next-bar, phí, SL/TP). Không gửi lệnh lên sàn.
          Live stub trong gói Python cố ý chưa bật.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={paperReset} variant="secondary">
            <RotateCcw />
            Reset replay
          </Button>
          <Button onClick={paperStep} variant="outline" disabled={!engine || engine.done}>
            <SkipForward />
            Bước 1 nến
          </Button>
          <Button
            onClick={() => setPlaying(!paper.playing)}
            variant="outline"
            disabled={!engine || engine.done}
          >
            {paper.playing ? <Pause /> : <Play />}
            {paper.playing ? "Dừng" : "Tự chạy"}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[11px] text-muted uppercase">Equity mark</p>
          <p className="font-mono text-2xl tabular">{formatUsd(equity)}</p>
        </div>
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[11px] text-muted uppercase">Vị thế</p>
          {pos ? (
            <p className={pos.side === "long" ? "text-long" : "text-short"}>
              {pos.side.toUpperCase()} {pos.qty.toFixed(4)} @ {pos.entry.toFixed(2)}
            </p>
          ) : (
            <p className="text-muted">Flat</p>
          )}
        </div>
        <div className="rounded-xl bg-surface p-4">
          <p className="text-[11px] text-muted uppercase">Nến replay</p>
          <p className="font-mono tabular">
            {engine ? `${engine.i} / ${ltf.length}` : "—"}
          </p>
          {bar ? <p className="text-xs text-subtle">close {bar.close.toFixed(2)}</p> : null}
        </div>
      </div>

      {pos ? (
        <div className="rounded-xl bg-surface p-4 text-sm">
          <div className="mb-2 flex gap-2">
            <Badge tone={pos.side === "long" ? "long" : "short"}>{pos.side}</Badge>
            <Badge>{pos.strategy}</Badge>
            {pos.trailed ? <Badge tone="fg">BE trail</Badge> : null}
            {pos.tp1Done ? <Badge tone="long">TP1 filled</Badge> : null}
          </div>
          <p className="font-mono text-xs text-muted">
            SL {pos.stop.toFixed(2)} · TP1 {pos.tp1.toFixed(2)} · TP2 {pos.tp2.toFixed(2)} · held {pos.barsHeld}n · R max{" "}
            {pos.rReached.toFixed(2)}
          </p>
        </div>
      ) : null}

      <div className="rounded-xl bg-surface p-4">
        <h3 className="mb-3 font-display text-xl">Nhật ký</h3>
        {paper.events.length === 0 ? (
          <p className="text-sm text-muted">Reset replay rồi bước nến để thấy fill / exit / halt.</p>
        ) : (
          <ul className="max-h-72 space-y-2 overflow-auto font-mono text-xs">
            {[...paper.events].reverse().map((e, i) => (
              <li key={`${e.time}-${i}`} className="text-muted">
                <span className="text-subtle">{new Date(e.time).toISOString().slice(5, 16)}</span>{" "}
                <span className={e.kind === "fill" ? "text-long" : e.kind === "exit" ? "text-fg" : "text-warn"}>
                  {e.kind}
                </span>{" "}
                {e.message}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
