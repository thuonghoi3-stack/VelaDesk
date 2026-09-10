import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  BookOpen,
  FlaskConical,
  Play,
  RotateCcw,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EquityChart } from "./equity-chart";
import { useDesk } from "@/lib/quant/store";
import { STRATEGY_SELECT_OPTIONS } from "@/lib/quant/strategy/library";
import {
  NOTEBOOK_KEY,
  parseNotebook,
  runExperiment,
  serializeNotebook,
  type PlaybookDraft,
  type PlaybookNotebook,
  type ExperimentRun,
} from "@/lib/quant/playbook";
import type { Metrics } from "@/lib/quant/types";

const presets: PlaybookDraft[] = [
  {
    name: "01 / Theo dấu xu hướng",
    hypothesis: "Giao cắt EMA có giữ được hiệu quả sau chi phí ở đoạn thị trường tiếp theo?",
    strategyId: "ema_cross",
    notes: "Đối chiếu số lệnh và drawdown train/test. Không chọn cấu hình bằng kết quả test.",
  },
  {
    name: "02 / Trở về trung bình",
    hypothesis: "RSI hồi khỏi vùng cực trị có tạo tín hiệu hồi quy đủ bù phí và trượt giá?",
    strategyId: "rsi_reversion",
    notes: "Quan sát độ nhạy với regime gate và mẫu giao dịch nhỏ.",
  },
  {
    name: "03 / Phá vỡ biên giá",
    hypothesis: "Phá vỡ kênh Donchian có tiếp diễn trên phần dữ liệu giữ lại?",
    strategyId: "donchian",
    notes: "Kiểm tra chuỗi thua, drawdown và rủi ro phá vỡ giả. Giữ nguyên quy tắc engine.",
  },
];
const field = "mt-2 w-full rounded-md border border-border bg-bg px-3 py-3 text-sm text-fg";
const fmt = (n: number, digits = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })
    : n === Infinity
      ? "∞"
      : "—";
const pct = (n: number) => `${fmt(n * 100)}%`;
const date = (time: number) => new Date(time).toISOString().slice(0, 16).replace("T", " ");
const ret = (m: Metrics) => (m.startEquity > 0 ? m.endEquity / m.startEquity - 1 : 0);

export function PlaybookPanel() {
  const { cfg, ltf, source, loading, analysis } = useDesk();
  const [book, setBook] = useState<PlaybookNotebook>({
    version: 1,
    draft: { ...presets[0]! },
    runs: [],
  });
  const [ready, setReady] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  const [selected, setSelected] = useState("");
  const [compare, setCompare] = useState("");
  const [window, setWindow] = useState<"train" | "test">("test");
  const [latest, setLatest] = useState<ExperimentRun | null>(null);
  useEffect(() => {
    try {
      const text = localStorage.getItem(NOTEBOOK_KEY);
      if (text) {
        const loaded = parseNotebook(text);
        setBook(loaded);
        setSelected(loaded.runs[0]?.id ?? "");
      }
    } catch (e) {
      setStorageBlocked(true);
      setStorageError(e instanceof Error ? e.message : "Không đọc được bộ nhớ trình duyệt.");
    }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready || storageBlocked) return;
    setSaved(false);
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(NOTEBOOK_KEY, serializeNotebook(book));
        setStorageError("");
        setSaved(true);
      } catch {
        setStorageError(
          "Chưa lưu: bộ nhớ bị chặn hoặc đã đầy. Xuất JSON để giữ kết quả trước khi đóng trang.",
        );
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [book, ready, storageBlocked]);
  const active =
    book.runs.find((r) => r.id === selected) ?? (latest?.id === selected ? latest : null);
  const baseline = book.runs.find((r) => r.id === compare);
  const aligned =
    !!analysis &&
    analysis.symbol === cfg.symbol &&
    analysis.ltf === cfg.ltf &&
    analysis.htf === cfg.htf &&
    analysis.source === source &&
    analysis.lastTime === ltf.at(-1)?.time;
  const enough =
    Math.floor(ltf.length * 0.7) >= cfg.warmup + 50 &&
    ltf.length - Math.floor(ltf.length * 0.7) >= 50;
  const edit = (partial: Partial<PlaybookDraft>) =>
    setBook((b) => ({ ...b, draft: { ...b.draft, ...partial } }));
  const run = () => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    // Capture at the click, not after the deferred paint. No store writes or requests.
    const state = useDesk.getState();
    const captured = {
      bars: state.ltf,
      cfg: structuredClone(state.cfg),
      source: state.source ?? "",
      sourceNote: state.sourceNote,
      draft: { ...book.draft },
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
    };
    setTimeout(() => {
      try {
        if (state.loading || !aligned)
          throw new Error("Dữ liệu đang tải hoặc chưa khớp cấu hình. Chờ tải xong trước khi chạy.");
        const result = runExperiment(captured);
        setLatest(result);
        setSelected(result.id);
        setWindow("test");
        if (book.runs.length >= 20) {
          setError(
            "Notebook đã có 20 lần chạy. Kết quả mới vẫn hiển thị; xuất JSON hoặc xóa một bản cũ rồi lưu kết quả này.",
          );
        } else setBook((b) => ({ ...b, runs: [result, ...b.runs] }));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Không chạy được thí nghiệm.");
      } finally {
        running.current = false;
        setBusy(false);
      }
    }, 30);
  };
  const download = (only?: ExperimentRun) => {
    try {
      const payload = only ? { version: 1 as const, draft: only.draft, runs: [only] } : book;
      const url = URL.createObjectURL(
        new Blob([serializeNotebook(payload)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = only ? `veladesk-${only.id}.json` : "veladesk-playbook-notebook.json";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Không xuất được JSON. Thử lại trước khi đóng trang.");
    }
  };
  const comparable =
    active &&
    baseline &&
    JSON.stringify(active.provenance) === JSON.stringify(baseline.provenance) &&
    active.config.symbol === baseline.config.symbol &&
    active.config.ltf === baseline.config.ltf &&
    active.config.market === baseline.config.market;
  return (
    <section className="space-y-5" aria-label="Playbook Lab">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="mb-2 flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-muted">
            <FlaskConical className="size-4" /> Research workstation / 01
          </div>
          <h2 className="font-display text-3xl">Playbook Lab</h2>
          <p className="mt-2 max-w-2xl text-sm text-muted">
            Viết giả thuyết. Đóng băng cấu hình. Đọc bằng chứng — không tự động nâng cấp chiến lược.
          </p>
        </div>
        <Button variant="outline" onClick={() => download()} disabled={!ready}>
          <ArrowDownToLine /> Xuất notebook
        </Button>
      </header>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-md border border-border bg-surface px-4 py-3 font-mono text-xs">
        <span>
          {cfg.symbol} · {cfg.market.toUpperCase()} · {cfg.ltf} / {cfg.htf}
        </span>
        <span className={source === "synthetic" ? "text-warn" : "text-muted"}>
          {source === "synthetic"
            ? "SYNTHETIC / NẾN MÔ PHỎNG"
            : source
              ? `${source.toUpperCase()} / DỮ LIỆU ĐÃ TẢI`
              : "CHƯA CÓ NGUỒN"}
        </span>
        <span className="text-muted">
          {ltf.length.toLocaleString()} nến · snapshot, không streaming
        </span>
      </div>
      {(storageError || error) && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-warn/40 bg-surface p-4 text-sm text-warn"
        >
          {storageError && <p>{storageError}</p>}
          {error && <p>{error}</p>}
          {storageBlocked && (
            <Button
              variant="outline"
              onClick={() => {
                if (confirm("Tạo notebook mới sẽ thay bản lưu không đọc được. Bạn có chắc?")) {
                  setStorageBlocked(false);
                  setStorageError("");
                }
              }}
            >
              Tạo lại bộ nhớ notebook
            </Button>
          )}
        </div>
      )}
      <div className="grid min-w-0 gap-5 xl:grid-cols-3">
        <aside className="min-w-0 space-y-4 rounded-lg border border-border bg-surface p-5">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-medium">
              <BookOpen className="size-4" /> Bàn soạn giả thuyết
            </h3>
            <span className="font-mono text-xs text-muted">01 / EDIT</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {presets.map((p, i) => (
              <button
                key={p.strategyId}
                disabled={busy}
                onClick={() => setBook((b) => ({ ...b, draft: { ...p } }))}
                className="min-h-11 rounded-md border border-border px-2 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-2 hover:text-fg"
              >
                <span className="block font-mono text-fg">0{i + 1}</span>
                {["EMA cross", "RSI hồi quy", "Donchian"][i]}
              </button>
            ))}
          </div>
          <label className="block text-xs text-muted">
            Tên playbook
            <input
              className={field}
              value={book.draft.name}
              maxLength={120}
              onChange={(e) => edit({ name: e.target.value })}
            />
          </label>
          <label className="block text-xs text-muted">
            Giả thuyết có thể kiểm chứng
            <textarea
              className={field + " min-h-24 resize-y"}
              value={book.draft.hypothesis}
              maxLength={4000}
              onChange={(e) => edit({ hypothesis: e.target.value })}
            />
          </label>
          <label className="block text-xs text-muted">
            Thuật toán thực thi
            <select
              className={field}
              value={book.draft.strategyId}
              onChange={(e) => edit({ strategyId: e.target.value as PlaybookDraft["strategyId"] })}
            >
              {STRATEGY_SELECT_OPTIONS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-muted">
            Ghi chú / điều kiện bác bỏ
            <textarea
              className={field + " min-h-24 resize-y"}
              value={book.draft.notes}
              maxLength={8000}
              onChange={(e) => edit({ notes: e.target.value })}
            />
          </label>
          <div className="border-t border-border pt-4 text-xs leading-relaxed text-muted">
            <p>
              Giữ toàn bộ tham số hiện tại của Desk; chỉ thay strategy ID trong bản chạy riêng.
              Preset là khung ghi chú, không phải tối ưu tham số.
            </p>
            <p className="mt-2 font-mono">
              Risk {pct(cfg.riskPct)} · phí {pct(cfg.takerFee)} · slip {cfg.slippageBps} bps
            </p>
          </div>
          <Button
            className="w-full"
            disabled={
              !ready ||
              busy ||
              loading ||
              !aligned ||
              !enough ||
              !book.draft.name.trim() ||
              !book.draft.hypothesis.trim()
            }
            onClick={run}
          >
            <Play />
            {busy ? "Đang chạy engine…" : "Run experiment"}
          </Button>
          <p role="status" className="text-xs leading-relaxed text-muted">
            {loading
              ? "Đang tải dữ liệu — tạm khóa chạy."
              : !aligned
                ? "Chưa có bộ nến khớp cấu hình hiện tại."
                : !enough
                  ? "Cần train ≥ warmup + 50 và test ≥ 50 nến."
                  : "70% train / 30% holdout theo thời gian. Không gọi AI, không gọi API."}
          </p>
          <p className="flex items-center gap-2 text-xs text-muted">
            <Save className="size-3" />
            {saved ? "Đã lưu trên trình duyệt này" : "Notebook cục bộ · chưa xác nhận lưu"}
          </p>
        </aside>
        <div className="min-w-0 space-y-4 xl:col-span-2">
          {active ? (
            <>
              <div className="rounded-lg border border-border bg-surface p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-widest text-muted">
                      02 / Inspect ·{" "}
                      {active.provenance.source === "synthetic"
                        ? "SYNTHETIC"
                        : active.provenance.source}
                    </p>
                    <h3 className="mt-2 break-words text-lg font-medium">{active.draft.name}</h3>
                    <p className="mt-1 font-mono text-xs text-muted">
                      {active.config.strategyId} · {active.config.symbol} · {active.config.ltf} ·{" "}
                      {active.createdAt.slice(0, 19).replace("T", " ")} UTC
                    </p>
                  </div>
                  <Button variant="ghost" onClick={() => download(active)}>
                    <ArrowDownToLine /> JSON run
                  </Button>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted">{active.draft.hypothesis}</p>
                <div className="mt-5 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="text-muted">
                      <tr>
                        <th className="py-3 font-normal">Chẩn đoán</th>
                        <th className="py-3 font-normal">Train / 70%</th>
                        <th className="py-3 font-normal">Holdout / 30%</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {[
                        [
                          "Lợi suất MTM engine",
                          pct(ret(active.train.metrics)),
                          pct(ret(active.test.metrics)),
                        ],
                        [
                          "Max drawdown",
                          pct(active.train.metrics.maxDd),
                          pct(active.test.metrics.maxDd),
                        ],
                        [
                          "Sharpe",
                          fmt(active.train.metrics.sharpe),
                          fmt(active.test.metrics.sharpe),
                        ],
                        [
                          "Profit factor",
                          active.train.metrics.grossLoss === 0
                            ? "Không có lỗ / N/A"
                            : fmt(active.train.metrics.profitFactor),
                          active.test.metrics.grossLoss === 0
                            ? "Không có lỗ / N/A"
                            : fmt(active.test.metrics.profitFactor),
                        ],
                        [
                          "Số lượt thoát lệnh",
                          active.train.metrics.trades,
                          active.test.metrics.trades,
                        ],
                      ].map(([label, a, b]) => (
                        <tr key={String(label)} className="border-t border-border">
                          <td className="py-3 font-sans text-muted">{label}</td>
                          <td className="py-3">{a}</td>
                          <td className="py-3">{b}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="mt-4 flex gap-2">
                  {(["test", "train"] as const).map((w) => (
                    <Button
                      key={w}
                      variant={window === w ? "secondary" : "ghost"}
                      aria-pressed={window === w}
                      onClick={() => setWindow(w)}
                    >
                      {w === "test" ? "Đường vốn holdout" : "Đường vốn train"}
                    </Button>
                  ))}
                </div>
                <div className="mt-3">
                  <EquityChart equity={active[window].equity} />
                </div>
                <p className="mt-2 font-mono text-xs text-muted">
                  {date(active[window].equity[0]!.time)} →{" "}
                  {date(active[window].equity.at(-1)!.time)} UTC · USDT · MTM engine
                </p>
                <p className="mt-2 text-xs text-muted">
                  Đường vốn cuối đã gồm chi phí đóng vị thế cuối mẫu và bằng cash sau quyết toán.
                  PF không xác định khi chưa có lệnh lỗ. Tổng PnL realized (theo trade log):{" "}
                  {fmt(active[window].trades.reduce((sum, trade) => sum + trade.pnl, 0))} USDT; đã trừ
                  phí vào phân bổ và phí thoát, chưa trừ funding phân bổ. Net = PnL − funding.
                </p>
                <div className="mt-4 flex gap-3 rounded-md border border-warn/30 p-3 text-xs leading-relaxed text-muted">
                  <ShieldAlert className="size-4 shrink-0 text-warn" />
                  <p>
                    {active.provenance.source === "synthetic" &&
                      "Nến mô phỏng, không phải giá thật. "}
                    {active.test.metrics.trades < 30 && "Mẫu holdout ít hơn 30 lượt thoát lệnh. "}
                    Đây là chẩn đoán holdout theo thời gian, không phải xác nhận độc lập. Xem test
                    nhiều lần tạo thiên lệch lựa chọn. Không suy ra khả năng sinh lời hay tự động
                    đưa vào giao dịch.
                  </p>
                </div>
                <details className="mt-4 border-t border-border pt-4">
                  <summary className="cursor-pointer text-xs text-muted">
                    Snapshot bất biến / nguồn / cấu hình / ghi chú
                  </summary>
                  <p className="mt-3 break-words text-xs text-muted">
                    {active.provenance.sourceNote || "Nguồn không cung cấp ghi chú."}
                  </p>
                  <p className="mt-2 text-xs text-muted">
                    {active.provenance.fingerprint} (dấu vân tay mẫu, không phải chứng thực) ·{" "}
                    {active.provenance.barCount} nến · {date(active.provenance.firstTime)} →{" "}
                    {date(active.provenance.lastTime)} UTC. Train và test khởi tạo vốn riêng; giữ
                    lịch sử chỉ báo để warmup, không mang vị thế train sang test. Quy tắc khớp lệnh
                    và cách hạch toán giữ nguyên engine VelaDesk.
                  </p>
                  <p className="mt-3 whitespace-pre-wrap text-sm">{active.draft.notes}</p>
                  <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-bg p-3 font-mono text-xs text-muted">
                    {JSON.stringify(active.config, null, 2)}
                  </pre>
                </details>
              </div>
            </>
          ) : (
            <div className="flex min-h-96 flex-col justify-center rounded-lg border border-dashed border-border bg-surface p-8">
              <FlaskConical className="mb-5 size-8 text-muted" />
              <p className="font-mono text-xs uppercase tracking-widest text-muted">
                Chưa có kết quả chạy
              </p>
              <h3 className="mt-3 font-display text-3xl">Giả thuyết trước. Bằng chứng sau.</h3>
              <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
                Chọn một khung nghiên cứu, ghi điều gì sẽ bác bỏ ý tưởng của bạn rồi chạy trên bộ
                nến đang tải. Kết quả không xuất hiện cho đến khi engine thực sự chạy.
              </p>
            </div>
          )}
          <div className="rounded-lg border border-border bg-surface p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-medium">Notebook / lịch sử thí nghiệm</h3>
              <span className="font-mono text-xs text-muted">{book.runs.length} / 20</span>
            </div>
            {latest && !book.runs.some((r) => r.id === latest.id) && (
              <Button
                className="mt-3"
                variant="outline"
                disabled={book.runs.length >= 20}
                onClick={() => setBook((b) => ({ ...b, runs: [latest, ...b.runs] }))}
              >
                <Save />
                Lưu kết quả mới
              </Button>
            )}
            {!book.runs.length ? (
              <p className="mt-4 text-xs text-muted">
                Mỗi lần chạy được lưu riêng; sửa bản nháp không thay đổi lịch sử.
              </p>
            ) : (
              <div className="mt-4 space-y-2">
                {book.runs.map((r) => (
                  <div
                    key={r.id}
                    className={
                      "flex items-center gap-2 rounded-md border p-2 " +
                      (selected === r.id ? "border-border-strong bg-surface-2" : "border-border")
                    }
                  >
                    <button
                      className="min-h-11 min-w-0 flex-1 px-2 text-left"
                      onClick={() => setSelected(r.id)}
                    >
                      <span className="block truncate text-sm">{r.draft.name}</span>
                      <span className="block truncate font-mono text-xs text-muted">
                        {r.config.symbol} · {r.config.ltf} · {r.provenance.source} · OOS{" "}
                        {pct(ret(r.test.metrics))}
                      </span>
                    </button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Soạn lại ${r.draft.name}`}
                      onClick={() => setBook((b) => ({ ...b, draft: { ...r.draft } }))}
                    >
                      <RotateCcw />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Xóa ${r.draft.name}`}
                      onClick={() => {
                        if (confirm(`Xóa bản chạy “${r.draft.name}”?`)) {
                          setBook((b) => ({ ...b, runs: b.runs.filter((v) => v.id !== r.id) }));
                          if (latest?.id === r.id) setLatest(null);
                        }
                      }}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            {active && book.runs.some((r) => r.id !== active.id) && (
              <div className="mt-5 border-t border-border pt-4">
                <label className="text-xs text-muted">
                  So sánh holdout với bản đã lưu
                  <select
                    className={field}
                    value={compare}
                    onChange={(e) => setCompare(e.target.value)}
                  >
                    <option value="">Chọn bản đối chiếu…</option>
                    {book.runs
                      .filter((r) => r.id !== active.id)
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.draft.name} · {r.createdAt}
                        </option>
                      ))}
                  </select>
                </label>
                {baseline && (
                  <>
                    <p className="mt-3 text-xs text-muted">
                      {comparable
                        ? "Cùng nguồn / cửa sổ ghi nhận. Kiểm tra chênh lệch cấu hình trước khi diễn giải."
                        : "Khác nguồn hoặc cửa sổ dữ liệu: chỉ đối chiếu mô tả, không xếp hạng."}
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-3 font-mono text-sm">
                      <div className="rounded-md border border-border p-3">
                        <span className="block text-xs text-muted">Δ lợi suất OOS</span>
                        {pct(ret(active.test.metrics) - ret(baseline.test.metrics))}
                        <span className="block text-xs text-muted">điểm phần trăm</span>
                      </div>
                      <div className="rounded-md border border-border p-3">
                        <span className="block text-xs text-muted">Δ Sharpe OOS</span>
                        {fmt(active.test.metrics.sharpe - baseline.test.metrics.sharpe)}
                      </div>
                    </div>
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-muted">
                        Cấu hình bản đối chiếu
                      </summary>
                      <pre className="mt-2 max-h-48 overflow-auto text-xs text-muted">
                        {JSON.stringify(baseline.config, null, 2)}
                      </pre>
                    </details>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
