import { dailyLossBreached, fundingChargeBetween, utcDay } from "../risk/limits.ts";
import { NativeBroker } from "./native-execution.ts";
import { CHANNEL_EXIT, REVERSION_CLASS, SIGNAL_EXIT_CLASS, nativeUnsupported } from "../strategy/library.ts";
import { applySlippage, feeOn, planStop, sizeQty } from "../risk/sizer.ts";
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
} from "../types.ts";
import { claimGate, computeMetrics, findLosingPeriods } from "./metrics.ts";

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
 * Intrabar fills are resolved pessimistically: if a stop and a take-profit are
 * both touchable in the same bar, the STOP fills first. Take-profits fill at
 * their limit prices; a bar reaching TP2 has necessarily crossed TP1, so both
 * partial fills execute in that bar.
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
  private dayStartEquity: number;
  private startEquity: number;
  private halted = false;
  native: NativeBroker | null = null;

  constructor(bars: FeatureBar[], cfg: DeskConfig, tf: Timeframe, startIndex?: number) {
    const unsupported=nativeUnsupported(cfg);if(unsupported)throw new Error(unsupported);
    this.bars = bars;
    this.cfg = cfg;
    this.tf = tf;
    this.startEquity = cfg.equity;
    this.equity = cfg.equity;
    this.dayStartEquity = cfg.equity;
    this.peak = cfg.equity;
    this.i = startIndex ?? cfg.warmup;
    if(cfg.executionMode==='source-native')this.native=new NativeBroker(this,cfg);
  }

  reset(startIndex?: number): void {
    this.i = startIndex ?? this.cfg.warmup;
    this.equity = this.cfg.equity;
    this.startEquity = this.cfg.equity;
    this.dayStartEquity = this.cfg.equity;
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
    if(this.cfg.executionMode==='source-native')this.native=new NativeBroker(this,this.cfg);
  }

  get done(): boolean {
    return this.i >= this.bars.length;
  }

  step(): EngineSnapshot {
    if (this.done) {
      return { i: this.i, equity: this.equity, position: this.position, lastEvent: null, done: true };
    }
    const bar = this.bars[this.i]!;
    if(this.native) {
      const n=this.native;const before=n.events.length;
      if(n.step(bar,this.i,bar.nativeIntents??[]))this.exposedBars++;
      if(this.i===this.bars.length-1)n.finish(bar);
      this.position=n.position;this.trades=n.trades;this.events=n.events;
      const mtm=n.markToMarket(bar.close);this.peak=Math.max(this.peak,mtm);
      this.equityCurve.push({time:bar.time,equity:mtm,drawdown:this.peak>0?(this.peak-mtm)/this.peak:0});
      this.i++;return {i:this.i,equity:mtm,position:this.position,lastEvent:n.events.length>before?n.events.at(-1)!:null,done:this.done};
    }
    const key = utcDay(bar.time);
    if (key !== this.dayKey) {

      this.dayKey = key;
      this.dayPnl = 0;
      // The daily loss cap is measured against equity at the START of the day.
      this.dayStartEquity = this.equityCurve.length
        ? this.equityCurve[this.equityCurve.length - 1]!.equity
        : this.startEquity;
      this.halted = false;
    }

    let event: PaperEvent | null = null;
    let exposed = this.position !== null;
    if (this.position) {
      this.chargeFunding(bar);
      // SIGNAL_EXIT profile: an opposite signal from the SAME strategy closes
      // the position at this bar's open (Pine reverses exactly like this),
      // and the fresh signal may open the reverse trade at the same open.
      const sigBar = this.i > 0 ? this.bars[this.i - 1]! : null;
      const exitSignal = sigBar?.exitSignal ?? sigBar?.signal ?? 0;
      const exitStrategy = sigBar?.exitSignal !== undefined ? sigBar.exitStrategy : sigBar?.strategy;
      if (
        this.position.signalExit &&
        sigBar &&
        exitSignal !== 0 &&
        exitStrategy === this.position.strategy
      ) {
        const opposite = this.position.side === "long" ? exitSignal === -1 : exitSignal === 1;
        if (opposite) {
          event = this.closePosition(bar, bar.open, "signal_flip", this.position.remainingQty) ?? event;
        }
      }
      if (this.position) {
        event = this.managePosition(bar) ?? event;
      }

    }

    event = this.checkDailyHalt(bar) ?? event;
    if (!this.position && !this.halted && this.i > 0) {
      const sigBar = this.bars[this.i - 1]!;
      if (sigBar.signal !== 0) {
        event = this.tryEnter(bar, sigBar) ?? event;
        if (this.position) {
          exposed = true;
          event = this.managePosition(bar) ?? event;
        }
      }
    }

    if (exposed) this.exposedBars += 1;
    // Terminal liquidation is shared by replay and batch; repeated step is inert.
    if (this.i === this.bars.length - 1 && this.position) {
      event = this.closePosition(bar, bar.close, "end_of_data", this.position.remainingQty) ?? event;
    }
    const mtm = this.markToMarket(bar.close);
    this.peak = Math.max(this.peak, mtm);
    const dd = this.peak > 0 ? (this.peak - mtm) / this.peak : 0;
    this.equityCurve.push({ time: bar.time, equity: mtm, drawdown: dd });

    event = this.checkDailyHalt(bar) ?? event;

    this.i += 1;
    return { i: this.i, equity: mtm, position: this.position, lastEvent: event, done: this.done };
  }

  runToEnd(): void {
    while (!this.done) this.step();

  }

  private checkDailyHalt(bar: FeatureBar): PaperEvent | null {
    if (this.halted || !dailyLossBreached(this.dayPnl, this.dayStartEquity, this.cfg)) return null;
    this.halted = true;
    this.dailyHaltDays += 1;
    const event: PaperEvent = { time: bar.time, kind: "halt", message: "Daily loss cap — dừng vào lệnh mới trong ngày UTC." };
    this.events.push(event);
    return event;
  }

  private chargeFunding(bar: FeatureBar): void {
    if (!this.position) return;
    const from = Math.max(this.position.entryTime, this.bars[this.i - 1]?.time ?? this.position.entryTime);
    const notional = this.position.remainingQty * bar.open;
    const fee = fundingChargeBetween(notional, this.cfg, from, bar.time);
    this.equity -= fee;
    this.dayPnl -= fee;
    // Kept on the position so each exit trade can report its funding share.
    this.position.fundingPaid += fee;
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
    const plan = planStop(this.bars, this.i - 1, side, strategy, sigBar.close, {
      stopAtrMin: this.cfg.stopAtrMin,
      stopAtrMax: this.cfg.stopAtrMax,
      mrStopAtr: this.cfg.mrStopAtr,
      swingLookback: 8,
    });
    if (!plan) return null;
    // Rebuild stop around actual fill, keep distance.
    const stop = side === "long" ? fill - plan.dist : fill + plan.dist;
    const riskPerUnit = Math.abs(fill - stop);
    if (riskPerUnit <= 0) return null;


    const signalExit =
      SIGNAL_EXIT_CLASS.has(strategy) || CHANNEL_EXIT[strategy] !== undefined;
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
      tp1: signalExit
        ? side === "long"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY
        : side === "long"
          ? fill + this.cfg.tp1R * riskPerUnit
          : fill - this.cfg.tp1R * riskPerUnit,
      tp2: signalExit
        ? side === "long"
          ? Number.POSITIVE_INFINITY
          : Number.NEGATIVE_INFINITY
        : side === "long"
          ? fill + this.cfg.tp2R * riskPerUnit
          : fill - this.cfg.tp2R * riskPerUnit,
      riskPerUnit,
      initialRiskUsdt: qty * riskPerUnit,
      fundingPaid: 0,
      barsHeld: 0,
      tp1Done: false,
      trailed: false,
      rReached: 0,
      maeR: 0,
      signalExit,
      exitChannelBars: CHANNEL_EXIT[strategy],
    };
    // Classic BB mean-reversion takes profit at the band mid. E0V1E is
    // exempt: its dip is typically ~0.5R below the mid already, so a mid
    // target would cap winners below 1R against a full-R stop (measured on
    // PEPE 5m: mid-distance averages 0.50R). It keeps the R ladder, which is
    // ATR-normalized through the stop distance.
    if (
      REVERSION_CLASS.has(strategy) &&
      strategy !== "e0v1e" &&
      sigBar.bbMid != null
    ) {
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
    // Existing protection resolves before learning favorable extrema or close exits.
    const hitStop = pos.side === "long" ? bar.low <= pos.stop : bar.high >= pos.stop;
    if (hitStop) {
      const raw = pos.side === "long" ? Math.min(bar.open, pos.stop) : Math.max(bar.open, pos.stop);
      return this.closePosition(bar, raw, "stop", pos.remainingQty);
    }
    const fav = pos.side === "long" ? bar.high - pos.entry : pos.entry - bar.low;
    pos.rReached = Math.max(pos.rReached, fav / pos.riskPerUnit);
    const adv = pos.side === "long" ? pos.entry - bar.low : bar.high - pos.entry;
    pos.maeR = Math.max(pos.maeR, adv / pos.riskPerUnit);

    if (pos.rReached >= this.cfg.breakevenR && !pos.trailed) {
      const be = pos.side === "long"
        ? pos.entry * (1 + this.cfg.takerFee * 2)
        : pos.entry * (1 - this.cfg.takerFee * 2);
      if (pos.side === "long") pos.stop = Math.max(pos.stop, be);
      else pos.stop = Math.min(pos.stop, be);
      pos.trailed = true;
    }

    // Turtle-style channel exit: a CLOSE beyond the opposite N-bar channel
    // (channel computed on bars strictly before this one) ends the trade.
    if (pos.exitChannelBars) {
      const n = pos.exitChannelBars;
      const from = Math.max(0, this.i - n);
      if (this.i - from >= n) {
        if (pos.side === "long") {
          let ll = this.bars[from]!.low;
          for (let k = from + 1; k < this.i; k++) ll = Math.min(ll, this.bars[k]!.low);
          if (bar.close < ll) {
            return this.closePosition(bar, bar.close, "channel_exit", pos.remainingQty);
          }
        } else {
          let hh = this.bars[from]!.high;
          for (let k = from + 1; k < this.i; k++) hh = Math.max(hh, this.bars[k]!.high);
          if (bar.close > hh) {
            return this.closePosition(bar, bar.close, "channel_exit", pos.remainingQty);
          }
        }
      }
    }

    const hitTp1 = !pos.signalExit && (pos.side === "long" ? bar.high >= pos.tp1 : bar.low <= pos.tp1);
    const hitTp2 = !pos.signalExit && (pos.side === "long" ? bar.high >= pos.tp2 : bar.low <= pos.tp2);



    if (!pos.tp1Done && hitTp1) {
      const qty = pos.remainingQty * this.cfg.tp1ClosePct;
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

    if (!pos.signalExit && pos.barsHeld >= this.cfg.timeStopBars) {
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
    const entryFeeShare = feeOn(fillQty * pos.entry, this.cfg.takerFee);
    const pnl = gross - fee - entryFeeShare;
    const pnlR = pos.riskPerUnit > 0 ? (px - pos.entry) * (pos.side === "long" ? 1 : -1) / pos.riskPerUnit : 0;
    // Funding was charged to equity while open; report it per trade pro-rata
    // by closed qty so the trade log reconciles with the equity curve.
    const fundingShare = (fillQty / pos.remainingQty) * pos.fundingPaid;
    pos.fundingPaid -= fundingShare;
    // Allocations report costs already paid; cash books only this exit.
    this.equity += gross - fee;
    this.dayPnl += gross - fee;
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
      mfeR: pos.rReached,
      maeR: pos.maeR,
      fees: fee + entryFeeShare,
      funding: fundingShare,
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
      mfeR: 0,
      maeR: 0,
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
