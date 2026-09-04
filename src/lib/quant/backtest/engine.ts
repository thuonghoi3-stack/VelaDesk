import { dailyLossBreached, fundingCharge, isFundingBar, utcDay } from "../risk/limits";
import { applySlippage, feeOn, planStop, sizeQty } from "../risk/sizer";
import type {
  BacktestResult,
  DeskConfig,
  EquityPoint,
  FeatureBar,
  OpenPosition,
  PaperEvent,
  Timeframe,
  Trade,
  WalkFold,
} from "../types";
import { claimGate, computeMetrics, findLosingPeriods } from "./metrics";

let tradeSeq = 1;

export type EngineSnapshot = {
  i: number;
  equity: number;
  position: OpenPosition | null;
  lastEvent: PaperEvent | null;
  done: boolean;
};

/**
 * Event-driven simulator. Signals at close[t] fill at open[t+1] (next-bar).
 * Intrabar SL vs TP: stop is assumed first (pessimistic).
 */
export class SimEngine {
  readonly bars: FeatureBar[];
  readonly cfg: DeskConfig;
  readonly tf: Timeframe;
  i: number;
  equity: number;
  peak: number;
  position: OpenPosition | null = null;
  trades: Trade[] = [];
  equityCurve: EquityPoint[] = [];
  events: PaperEvent[] = [];
  exposedBars = 0;
  dailyHaltDays = 0;
  private dayPnl = 0;
  private dayKey = "";
  private startEquity: number;
  private halted = false;

  constructor(bars: FeatureBar[], cfg: DeskConfig, tf: Timeframe, startIndex?: number) {
    this.bars = bars;
    this.cfg = cfg;
    this.tf = tf;
    this.startEquity = cfg.equity;
    this.equity = cfg.equity;
    this.peak = cfg.equity;
    this.i = startIndex ?? cfg.warmup;
  }

  reset(startIndex?: number): void {
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

  get done(): boolean {
    return this.i >= this.bars.length;
  }

  step(): EngineSnapshot {
    if (this.done) {
      return { i: this.i, equity: this.equity, position: this.position, lastEvent: null, done: true };
    }
    const bar = this.bars[this.i]!;
    const key = utcDay(bar.time);
    if (key !== this.dayKey) {
      if (this.halted) this.dailyHaltDays += 1;
      this.dayKey = key;
      this.dayPnl = 0;
      this.halted = false;
    }

    let event: PaperEvent | null = null;
    if (this.position) {
      this.chargeFunding(bar);
      event = this.managePosition(bar) ?? event;
      this.exposedBars += 1;
    }

    if (!this.position && !this.halted && this.i > 0) {
      const sigBar = this.bars[this.i - 1]!;
      if (sigBar.signal !== 0) {
        event = this.tryEnter(bar, sigBar) ?? event;
      }
    }

    const mtm = this.markToMarket(bar.close);
    this.peak = Math.max(this.peak, mtm);
    const dd = this.peak > 0 ? (this.peak - mtm) / this.peak : 0;
    this.equityCurve.push({ time: bar.time, equity: mtm, drawdown: dd });

    if (dailyLossBreached(this.dayPnl, this.startEquity, this.cfg)) {
      if (!this.halted) {
        this.halted = true;
        event = { time: bar.time, kind: "halt", message: "Daily loss cap — dừng vào lệnh mới trong ngày UTC." };
        this.events.push(event);
      }
    }

    this.i += 1;
    return { i: this.i, equity: mtm, position: this.position, lastEvent: event, done: this.done };
  }

  runToEnd(): void {
    while (!this.done) this.step();
    if (this.position) {
      const last = this.bars[this.bars.length - 1]!;
      this.closePosition(last, last.close, "end_of_data", this.position.remainingQty);
    }
  }

  private chargeFunding(bar: FeatureBar): void {
    if (!this.position) return;
    if (!isFundingBar(bar.time, this.tf)) return;
    const notional = this.position.remainingQty * bar.close;
    const fee = fundingCharge(notional, this.cfg, this.tf);
    this.equity -= fee;
    this.dayPnl -= fee;
    this.position.initialRiskUsdt += 0;
    if (fee >= 0.01) {
      this.events.push({
        time: bar.time,
        kind: "info",
        message: `Funding −${fee.toFixed(2)} USDT`,
      });
    }
  }

  private tryEnter(fillBar: FeatureBar, sigBar: FeatureBar): PaperEvent | null {
    const side = sigBar.signal === 1 ? "long" : "short";
    if (this.cfg.side === "long_only" && side === "short") return null;
    const strategy = sigBar.strategy === "none" ? "trend_pullback" : sigBar.strategy;
    const rawOpen = fillBar.open;
    const fill = applySlippage(rawOpen, side, true, this.cfg.slippageBps);
    const plan = planStop(this.bars, this.i - 1, side, strategy, sigBar.close);
    if (!plan) return null;
    // Rebuild stop around actual fill, keep distance.
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

    const pos: OpenPosition = {
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
      rReached: 0,
    };
    if (strategy === "mean_reversion" && sigBar.bbMid != null) {
      pos.tp1 = sigBar.bbMid;
      pos.tp2 = sigBar.bbMid;
    }
    this.position = pos;
    const ev: PaperEvent = {
      time: fillBar.time,
      kind: "fill",
      message: `${side.toUpperCase()} ${strategy} @ ${fill.toFixed(2)} qty ${qty.toFixed(4)} SL ${stop.toFixed(2)}`,
    };
    this.events.push(ev);
    return ev;
  }

  private managePosition(bar: FeatureBar): PaperEvent | null {
    const pos = this.position!;
    pos.barsHeld += 1;
    const fav = pos.side === "long" ? bar.high - pos.entry : pos.entry - bar.low;
    pos.rReached = Math.max(pos.rReached, fav / pos.riskPerUnit);

    if (pos.rReached >= 1 && !pos.trailed) {
      const be = pos.side === "long"
        ? pos.entry * (1 + this.cfg.takerFee * 2)
        : pos.entry * (1 - this.cfg.takerFee * 2);
      if (pos.side === "long") pos.stop = Math.max(pos.stop, be);
      else pos.stop = Math.min(pos.stop, be);
      pos.trailed = true;
    }

    const hitStop = pos.side === "long" ? bar.low <= pos.stop : bar.high >= pos.stop;
    const hitTp1 = pos.side === "long" ? bar.high >= pos.tp1 : bar.low <= pos.tp1;
    const hitTp2 = pos.side === "long" ? bar.high >= pos.tp2 : bar.low <= pos.tp2;

    if (hitStop) {
      return this.closePosition(bar, pos.stop, "stop", pos.remainingQty);
    }

    if (!pos.tp1Done && hitTp1) {
      const qty = pos.remainingQty * 0.5;
      const ev = this.closePosition(bar, pos.tp1, "tp1", qty);
      if (this.position) this.position.tp1Done = true;
      if (hitTp2 && this.position) {
        return this.closePosition(bar, pos.tp2, "tp2", this.position.remainingQty) ?? ev;
      }
      return ev;
    }
    if (pos.tp1Done && hitTp2) {
      return this.closePosition(bar, pos.tp2, "tp2", pos.remainingQty);
    }

    if (pos.strategy === "trend_pullback" && pos.tp1Done) {
      const emaFlip =
        pos.side === "long"
          ? bar.ema20 != null && bar.close < bar.ema20 && (bar.macdHist ?? 1) < 0
          : bar.ema20 != null && bar.close > bar.ema20 && (bar.macdHist ?? -1) > 0;
      if (emaFlip) return this.closePosition(bar, bar.close, "ema_macd_exit", pos.remainingQty);
    }

    if (pos.barsHeld >= this.cfg.timeStopBars) {
      return this.closePosition(bar, bar.close, "time_stop", pos.remainingQty);
    }
    return null;
  }

  private closePosition(bar: FeatureBar, rawPrice: number, reason: string, qty: number): PaperEvent | null {
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
      barsHeld: pos.barsHeld,
    });
    pos.remainingQty -= fillQty;
    const ev: PaperEvent = {
      time: bar.time,
      kind: "exit",
      message: `Exit ${reason} ${pos.side} @ ${px.toFixed(2)} PnL ${pnl.toFixed(2)} (${pnlR.toFixed(2)}R)`,
    };
    this.events.push(ev);
    if (pos.remainingQty <= 1e-8) this.position = null;
    return ev;
  }

  private markToMarket(close: number): number {
    if (!this.position) return this.equity;
    const pos = this.position;
    const u = pos.side === "long" ? close - pos.entry : pos.entry - close;
    return this.equity + u * pos.remainingQty;
  }
}

function buyHold(bars: FeatureBar[], cfg: DeskConfig): { equity: EquityPoint[]; metrics: ReturnType<typeof computeMetrics> } {
  const start = cfg.warmup;
  if (bars.length <= start + 2) {
    return { equity: [], metrics: computeMetrics(cfg.equity, [], [], 0, 0) };
  }
  const entry = applySlippage(bars[start]!.open, "long", true, cfg.slippageBps);
  const qty = (cfg.equity * 0.99) / entry;
  const entryFee = feeOn(qty * entry, cfg.takerFee);
  let peak = cfg.equity;
  const curve: EquityPoint[] = [];
  for (let i = start; i < bars.length; i++) {
    const px = bars[i]!.close;
    let eq = cfg.equity - entryFee + (px - entry) * qty;
    if (i === bars.length - 1) {
      const exit = applySlippage(px, "long", false, cfg.slippageBps);
      eq = cfg.equity - entryFee + (exit - entry) * qty - feeOn(qty * exit, cfg.takerFee);
    }
    peak = Math.max(peak, eq);
    curve.push({ time: bars[i]!.time, equity: eq, drawdown: peak > 0 ? (peak - eq) / peak : 0 });
  }
  const last = curve[curve.length - 1]?.equity ?? cfg.equity;
  const dummy: Trade[] = [
    {
      id: "bh",
      side: "long",
      strategy: "trend_pullback",
      entryTime: bars[start]!.time,
      exitTime: bars[bars.length - 1]!.time,
      entry,
      exit: bars[bars.length - 1]!.close,
      qty,
      pnl: last - cfg.equity,
      pnlR: 0,
      fees: entryFee,
      funding: 0,
      reason: "buy_hold",
      barsHeld: bars.length - start,
    },
  ];
  return { equity: curve, metrics: computeMetrics(cfg.equity, curve, dummy, curve.length, curve.length) };
}

function sliceEngine(bars: FeatureBar[], cfg: DeskConfig, tf: Timeframe, from: number, to: number): SimEngine {
  const slice = bars.slice(from, to);
  const e = new SimEngine(slice, { ...cfg, warmup: Math.min(cfg.warmup, Math.max(0, slice.length - 2)) }, tf);
  e.runToEnd();
  return e;
}

export function runBacktest(bars: FeatureBar[], cfg: DeskConfig, tf: Timeframe): BacktestResult {
  const engine = new SimEngine(bars, cfg, tf);
  engine.runToEnd();
  const metrics = computeMetrics(
    cfg.equity,
    engine.equityCurve,
    engine.trades,
    Math.max(0, bars.length - cfg.warmup),
    engine.exposedBars,
  );
  const bh = buyHold(bars, cfg);
  const regimes = bars.map((b) => ({ time: b.time, regime: b.regime }));
  const losingPeriods = findLosingPeriods(engine.equityCurve, regimes);

  const n = bars.length;
  const testStart = Math.floor(n * 0.7);
  const testEngine = new SimEngine(bars, cfg, tf, Math.max(cfg.warmup, testStart));
  testEngine.runToEnd();
  const testMetrics = computeMetrics(
    cfg.equity,
    testEngine.equityCurve,
    testEngine.trades,
    Math.max(0, n - testStart),
    testEngine.exposedBars,
  );

  const folds: WalkFold[] = [];
  const cuts = [0.5, 0.65, 0.8];
  for (const c of cuts) {
    const trainEnd = Math.floor(n * c);
    const testEnd = Math.min(n, trainEnd + Math.floor(n * 0.15));
    if (testEnd - trainEnd < 50) continue;
    const te = sliceEngine(bars, cfg, tf, Math.max(0, trainEnd - cfg.warmup), testEnd);
    folds.push({
      trainStart: bars[0]!.time,
      trainEnd: bars[trainEnd]!.time,
      testStart: bars[trainEnd]!.time,
      testEnd: bars[testEnd - 1]!.time,
      test: computeMetrics(cfg.equity, te.equityCurve, te.trades, te.equityCurve.length, te.exposedBars),
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
    dailyHaltDays: engine.dailyHaltDays,
  };
}
