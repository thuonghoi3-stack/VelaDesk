import { Pause, Play, SkipForward, RotateCcw, FastForward, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CandleChart } from "./candle-chart";
import { useDesk } from "@/lib/quant/store";
import { replayView } from "@/lib/quant/replay-view";
import { formatUsd } from "@/lib/utils";

const eventLabels = {
  signal: "Tín hiệu",
  fill: "Khớp lệnh",
  exit: "Thoát lệnh",
  halt: "Dừng rủi ro",
  info: "Thông tin",
};
const utc = (time: number) => new Date(time).toISOString().replace("T", " ").slice(0, 16);
const price = (value: number) =>
  Number.isFinite(value)
    ? value.toLocaleString("en-US", { maximumFractionDigits: 6 })
    : "Không áp dụng";

export function PaperPanel() {
  const paper = useDesk((s) => s.paper);
  const ltf = useDesk((s) => s.ltf);
  const cfg = useDesk((s) => s.cfg);
  const loading = useDesk((s) => s.loading);
  const currentSource = useDesk((s) => s.source);
  const currentSourceNote = useDesk((s) => s.sourceNote);
  const paperCurrent = useDesk((s) => s.paperCurrent);
  const paperReset = useDesk((s) => s.paperReset);
  const setPlaying = useDesk((s) => s.setPlaying);
  const [speed, setSpeed] = useState(1);
  const engine = paper.engine;
  const historical = paper.historical;
  const source = historical?.source ?? currentSource;
  const sourceNote = historical?.sourceNote ?? currentSourceNote;
  const sessionCfg = historical?.config ?? engine?.cfg ?? cfg;
  const sessionLoading = !historical && loading;
  const stale = !!engine && !historical && (engine.cfg !== cfg || engine.bars !== ltf);
  const blocked = sessionLoading || stale || !engine || engine.done;
  // SimEngine mutates in place; cursor is the store's revision for its view.
  const view = useMemo(
    () => replayView(engine, sessionCfg.equity, historical?.startIndex),
    [engine, paper.cursor, sessionCfg.equity, historical],
  );
  const pos = view.position;
  const bar = view.lastBar;
  const events = engine?.events ?? [];

  useEffect(() => {
    if (!engine && !loading && ltf.length >= cfg.warmup + 10) paperReset();
  }, [engine, loading, ltf, cfg.warmup, paperReset]);

  useEffect(() => {
    if (sessionLoading || stale) setPlaying(false);
  }, [sessionLoading, stale, setPlaying]);

  useEffect(() => () => setPlaying(false), [setPlaying]);

  useEffect(() => {
    if (!paper.playing || blocked) return;
    const id = window.setInterval(() => {
      const s = useDesk.getState();
      const e = s.paper.engine;
      // Check the live store too: a fetch/config edit can beat React's cleanup.
      if (e !== engine || s.paper.historical !== historical) return;
      if (
        !s.paper.playing ||
        !e ||
        e.done ||
        (!historical && (s.loading || e.cfg !== s.cfg || e.bars !== s.ltf))
      ) {
        s.setPlaying(false);
        return;
      }
      s.paperStep();
    }, 1000 / speed);
    return () => window.clearInterval(id);
  }, [paper.playing, blocked, speed, engine, historical]);

  const step = (count: number) => {
    setPlaying(false);
    for (let n = 0; n < count; n++) {
      const s = useDesk.getState();
      const e = s.paper.engine;
      if (
        e !== engine ||
        s.paper.historical !== historical ||
        !e ||
        e.done ||
        (!historical && (s.loading || e.cfg !== s.cfg || e.bars !== s.ltf))
      )
        break;
      s.paperStep();
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-4" data-testid="replay-panel">
      <section className="rounded-xl border border-border bg-surface p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-widest text-muted">
              Phòng thực hành · Replay
            </p>
            <h2 className="mt-1 font-display text-xl">{sessionCfg.symbol} · {sessionCfg.ltf} · {historical ? "Replay lịch sử" : "Replay"}</h2>
            <p className="sr-only sm:not-sr-only sm:mt-2 sm:max-w-2xl sm:text-sm sm:leading-relaxed sm:text-muted">
              {historical
                ? "Phát lại giao dịch từ bản chụp backtest gốc. Trạng thái tài khoản được dựng lại từ warm-up đến trước nến vào lệnh; tương lai vẫn được ẩn."
                : "Phát lại toàn bộ nến đã tải sau warm-up bằng engine backtest. Nến warm-up chỉ làm ngữ cảnh; nến tương lai được ẩn. Không gửi lệnh lên sàn."}
            </p>
          </div>
          <Badge tone={paper.playing && !blocked ? "long" : "mute"}>
            {sessionLoading
              ? "Đang tải dữ liệu"
              : stale
                ? "Cần đặt lại"
                : engine?.done
                  ? "Đã hoàn tất"
                  : paper.playing
                    ? "Đang phát"
                    : "Đã tạm dừng"}
          </Badge>
        </div>
        <div className="mt-4 flex flex-wrap justify-between gap-2 text-xs text-muted">
          <span data-testid="replay-progress-text">
            Đã xử lý {view.processed} / {view.total} nến · còn {view.remaining}
          </span>
          <span>1× = 1 nến / giây</span>
        </div>
        <div
          role="progressbar"
          aria-label="Tiến độ replay"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={view.progress}
          data-testid="replay-progress"
          data-processed={view.processed}
          data-index={view.index}
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2"
        >
          <div className="h-full rounded-full bg-accent" style={{ width: `${view.progress}%` }} />
        </div>
        {stale && (
          <p role="status" className="mt-3 text-sm text-warn">
            Cấu hình đã thay đổi. Replay đã dừng; đặt lại để áp dụng cấu hình mới. Số liệu bên dưới
            vẫn thuộc phiên cũ.
          </p>
        )}
        {!engine && !loading && (
          <p role="status" className="mt-3 text-sm text-warn">
            Cần ít nhất {cfg.warmup + 10} nến để khởi tạo replay (đang có {ltf.length}).
          </p>
        )}
      </section>

      <section className="min-w-0 rounded-xl border border-border bg-surface p-4">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl">
              {engine?.cfg.symbol ?? cfg.symbol}{" "}
              <span className="text-muted">/ {engine?.tf ?? cfg.ltf}</span>
            </h3>
            <p className="mt-1 text-xs text-muted" data-testid="replay-source">
              Nguồn:{" "}
              {source === "synthetic"
                ? "MÔ PHỎNG · không phải giá thật"
                : source
                  ? source.toUpperCase()
                  : "Chưa có dữ liệu"}{" "}
              · {engine?.cfg.market === "usdm" ? "USDT-M" : "Spot"}
            </p>
          </div>
          <div className="text-sm sm:text-right">
            <p className="text-xs text-muted">Nến đã lộ gần nhất · UTC (thời gian mở)</p>
            <p
              className="mt-1 font-mono"
              data-testid="replay-current-time"
              data-time={bar?.time ?? ""}
            >
              {bar ? utc(bar.time) : "—"}
            </p>
            <p className="font-mono text-muted">
              Đóng cửa{" "}
              <span
                className="text-fg"
                data-testid="replay-current-close"
                data-close={bar?.close ?? ""}
              >
                {bar ? price(bar.close) : "—"}
              </span>
            </p>
          </div>
        </div>
        <div data-testid="replay-transport" className="mb-3 grid grid-cols-2 items-center gap-2 [&_button]:px-2 [&_button]:text-xs [&_button_svg]:hidden sm:flex sm:flex-wrap sm:[&_button]:px-4 sm:[&_button]:text-sm sm:[&_button_svg]:block">
          <Button
            className="min-h-11"
            disabled={blocked}
            onClick={() => setPlaying(!paper.playing)}
            data-testid="replay-play"
          >
            {paper.playing ? <Pause /> : <Play />}
            {paper.playing ? "Tạm dừng" : "Phát replay"}
          </Button>
          <Button className="min-h-11" variant="outline" disabled={blocked} onClick={() => step(1)}>
            <SkipForward />
            Bước 1 nến
          </Button>
          <Button
            className="min-h-11"
            variant="outline"
            disabled={blocked}
            onClick={() => step(10)}
          >
            <FastForward />
            Bước 10 nến
          </Button>
          <label className="flex min-h-11 items-center gap-2 rounded-md border border-border px-3 text-sm text-muted">
            Tốc độ
            <select
              aria-label="Tốc độ replay"
              className="min-h-11 bg-surface text-fg outline-offset-2"
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value={0.5}>0.5×</option>
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={4}>4×</option>
            </select>
          </label>
          <Button
            className="min-h-11 sm:ml-auto"
            variant="secondary"
            disabled={!historical && (loading || ltf.length < cfg.warmup + 10)}
            onClick={() => {
              setPlaying(false);
              paperReset();
            }}
          >
            <RotateCcw />
            Đặt lại replay
          </Button>
        </div>
        {bar ? (
          <CandleChart bars={view.bars} />
        ) : (
          <div className="flex h-64 items-center justify-center rounded-lg bg-surface-2 text-sm text-muted">
            {loading ? "Đang tải nến…" : "Chưa có nến được tiết lộ"}
          </div>
        )}
        <div className="mt-3 flex gap-2 text-xs leading-relaxed text-muted">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          <p>
            Chỉ hiển thị nến trước con trỏ xử lý. Tín hiệu tại đóng cửa nến t có thể khớp ở mở cửa
            nến t+1, nếu qua bộ lọc rủi ro. Mũi tên trên biểu đồ là tín hiệu, không phải xác nhận
            khớp lệnh.
          </p>
        </div>
        {sourceNote && <p className="mt-2 break-words text-xs text-muted">{sourceNote}</p>}
        {engine?.done && (
          <p className="mt-3 text-sm text-warn">
            Đã hết dữ liệu. Replay đã đóng vị thế còn lại tại giá đóng nến cuối, gồm chi phí; MTM cuối bằng cash. Đặt lại
            để luyện tập lại.
          </p>
        )}
      </section>

      <div data-testid="replay-account-strip" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border xl:grid-cols-4">
        <section className="min-w-0 bg-surface p-3">
          <h3 className="text-xs text-muted">Vốn theo thị trường (MTM)</h3>
          <p data-testid="replay-mtm" className="mt-1 break-words font-mono text-base sm:text-xl tabular-nums">
            {formatUsd(view.mtm)}
          </p>
          <p className="mt-1 text-xs text-muted">Gồm lãi/lỗ vị thế còn mở</p>
        </section>
        <section className="min-w-0 bg-surface p-3">
          <h3 className="text-xs text-muted">Số dư tiền (cash)</h3>
          <p data-testid="replay-cash" className="mt-1 break-words font-mono text-base sm:text-xl tabular-nums">
            {formatUsd(view.cash)}
          </p>
          <p className="mt-1 text-xs text-muted">Sổ tiền engine · chưa cộng lãi/lỗ mở</p>
        </section>
        <section className="min-w-0 bg-surface p-3">
          <h3 className="text-xs text-muted">Lãi/lỗ chưa thực hiện</h3>
          <p
            className={`mt-1 break-words font-mono text-base sm:text-xl tabular-nums ${view.unrealized < 0 ? "text-short" : view.unrealized > 0 ? "text-long" : "text-fg"}`}
          >
            {formatUsd(view.unrealized)}
          </p>
          <p className="mt-1 text-xs text-muted">MTM − cash · tại nến đã lộ</p>
        </section>
        <section className="min-w-0 bg-surface p-3">
          <h3 className="text-xs text-muted">Vị thế đang mở</h3>
          <p
            className={`mt-1 break-words font-mono text-sm sm:text-lg ${pos?.side === "long" ? "text-long" : pos ? "text-short" : "text-fg"}`}
          >
            {pos ? `${pos.side.toUpperCase()} · ${price(pos.qty)}` : "Không có vị thế"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {pos
              ? `Khối lượng còn lại · giá vào ${price(pos.entry)}`
              : "Chờ tín hiệu hợp lệ từ engine"}
          </p>
        </section>
      </div>

        {historical && (
          <div
            data-testid="replay-historical-context"
            className="mt-4 rounded-lg border border-accent/30 bg-accent/5 p-3 text-sm"
          >
            <p className="font-medium">
              Replay lịch sử · {sessionCfg.symbol} · {sessionCfg.ltf} · {sessionCfg.strategyId}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Mốc vào lệnh: {utc(historical.entryTime)} UTC. Đã dựng lại{" "}
              {historical.startIndex - sessionCfg.warmup} nến trước mốc. Tiến độ bên dưới chỉ tính
              từ mốc này đến cuối bản chụp. Cấu hình và nguồn dữ liệu hiện tại không thay đổi phiên
              này. Không hiển thị kết quả thoát lệnh tương lai; không gửi lệnh lên sàn.
            </p>
            <Button
              className="mt-3 min-h-11"
              variant="outline"
              disabled={loading}
              onClick={paperCurrent}
            >
              Replay dữ liệu hiện tại
            </Button>
          </div>
        )}
      {sessionCfg.executionMode === "source-native" && <section className="rounded-xl border border-border bg-surface p-4 text-xs text-muted" data-testid="native-pending-orders">
        <strong>Source-native · pending orders ({engine?.native?.pending.size ?? 0})</strong>
        <p>Local OHLC executor, not TradingView runtime parity. No source protective stop/TP; R metrics unavailable. Orders submitted at this close cannot fill before next bar.</p>
        {[...(engine?.native?.pending.values() ?? [])].map(o=><p key={o.id}>{o.id} · {o.side} · {o.order.kind}{o.order.kind === "stop" ? ` @ ${price(o.order.price)}` : " · next open"}{o.oca ? ` · OCA ${o.oca.name}` : ""}{o.activated ? " · activated" : ""}</p>)}
      </section>}
      <div className="grid gap-4 lg:grid-cols-3">
        <section className="rounded-xl border border-border bg-surface p-4">
          <h3 className="font-display text-xl">Kế hoạch vị thế</h3>
          {pos ? (
            <>
              <div className="my-3 flex flex-wrap gap-2">
                <Badge tone={pos.side === "long" ? "long" : "short"}>
                  {pos.side.toUpperCase()}
                </Badge>
                <Badge>{pos.strategy}</Badge>
                {pos.tp1Done && <Badge tone="long">Đã chốt TP1</Badge>}
                {pos.trailed && <Badge tone="fg">Đã dời dừng lỗ</Badge>}
              </div>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Dừng lỗ</dt>
                  <dd className="font-mono">{Number.isFinite(pos.stop) ? price(pos.stop) : "None — source reversal only"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Chốt lời 1 / 2</dt>
                  <dd className="text-right font-mono">
                    {Number.isFinite(pos.tp1) ? `${price(pos.tp1)} / ${price(pos.tp2)}` : "None — source reversal only"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Đã giữ</dt>
                  <dd className="font-mono">{pos.barsHeld} nến</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">R cao nhất</dt>
                  <dd className="font-mono">{pos.riskPerUnit > 0 ? `${pos.rReached.toFixed(2)}R` : "N/A — no initial risk stop"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Chưa có lệnh đang mở. Tiếp tục từng nến để quan sát tín hiệu và quyết định của bộ quản
              trị rủi ro.
            </p>
          )}
        </section>
        <section className="min-w-0 rounded-xl border border-border bg-surface p-4 lg:col-span-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-display text-xl">Nhật ký sự kiện</h3>
            <span className="text-xs text-muted">{events.length} sự kiện · mới nhất trước</span>
          </div>
          <p className="mt-1 text-xs text-muted">
            Toàn bộ sự kiện engine, gồm các lần khớp trong cùng nến và funding.
          </p>
          {events.length === 0 ? (
            <p className="mt-5 text-sm text-muted">
              Chưa phát sinh sự kiện. Bước nến hoặc phát replay để theo dõi khớp lệnh, thoát lệnh và
              giới hạn rủi ro.
            </p>
          ) : (
            <ol
              aria-label="Nhật ký replay"
              tabIndex={0}
              className="mt-3 max-h-80 divide-y divide-border overflow-auto"
            >
              {[...events].reverse().map((event, i) => (
                <li key={`${event.time}-${events.length - i}`} className="py-3 text-sm">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <time className="font-mono text-xs text-muted">{utc(event.time)} UTC</time>
                    <Badge
                      tone={
                        event.kind === "fill" ? "long" : event.kind === "halt" ? "warn" : "mute"
                      }
                    >
                      {eventLabels[event.kind]}
                    </Badge>
                  </div>
                  <p className="break-words text-muted">{event.message}</p>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}
