/**
 * Portfolio backtest — N symbols, one shared equity, one strategy.
 *
 * Parity contract with the single-symbol SimEngine (backtest/engine.ts):
 * the intrabar logic (pessimistic stop-first fills, TP ladder, break-even
 * trail, MAE/MFE, funding, signal-flip and channel exits) is ported 1:1, and
 * portfolio.test.ts pins a one-symbol run to the single engine's output —
 * if you change one engine, change the other in the same commit.
 *
 * Portfolio-level rules layered on top:
 * - `cfg.maxPositions` open positions at once (entries in symbol order).
 * - Each position risks `cfg.riskPct` of the SHARED equity and its notional
 *   is capped at `cfg.maxExposure × cfg.maxLeverage` of it.
 * - Daily-loss cap halts NEW entries portfolio-wide for the UTC day.
 */
import { claimGate, computeMetrics } from "./metrics.ts";
import {
  CHANNEL_EXIT,
  REVERSION_CLASS,
  SIGNAL_EXIT_CLASS,
} from "../strategy/library.ts";
import { dailyLossBreached, fundingCharge, isFundingBar, utcDay } from "../risk/limits.ts";
import { applySlippage, feeOn, planStop, sizeQty } from "../risk/sizer.ts";
import type {
  DeskConfig,
  EquityPoint,
  FeatureBar,
  Metrics,
  OpenPosition,
  Timeframe,
  Trade,
} from "../types.ts";

export type PortfolioInput = { symbol: string; bars: FeatureBar[] };

export type SymbolStats = {
  symbol: string;
  trades: number;
  netPnl: number;
  winRate: number;
  avgR: number;
  pf: number;
};

export type PortfolioResult = {
  metrics: Metrics;
  testMetrics: Metrics | null;
  buyHold: Metrics;
  equity: EquityPoint[];
  buyHoldEquity: EquityPoint[];
  trades: Trade[];
  perSymbol: SymbolStats[];
  maxConcurrent: number;
  dailyHaltDays: number;
  claimBlocked: boolean;
  claimReason: string;
};

let tradeSeq = 1;

export class PortfolioEngine {
  readonly inputs: PortfolioInput[];
  readonly cfg: DeskConfig;
  readonly tf: Timeframe;
  private ptrs: number[];
  private times: number[];
  private positions: Array<OpenPosition | null>;
  private lastClose: number[];
  equity: number;
  private peak: number;
  private dayPnl = 0;
  private dayKey = "";
  private dayStartEquity: number;
  private halted = false;
  trades: Trade[] = [];
  equityCurve: EquityPoint[] = [];
  exposedFlags: boolean[] = [];
  exposedBars = 0;
  dailyHaltDays = 0;
  maxConcurrent = 0;

  constructor(inputs: PortfolioInput[], cfg: DeskConfig, tf: Timeframe) {
    if (inputs.length === 0) throw new Error("portfolio needs at least one symbol");
    for (const inp of inputs) {
      if (inp.bars.length < cfg.warmup + 3) {
        throw new Error(`${inp.symbol}: chỉ có ${inp.bars.length} nến — cần ≥ ${cfg.warmup + 3}`);
      }
    }
    this.inputs = inputs;
    this.cfg = cfg;
    this.tf = tf;
    this.ptrs = inputs.map(() => 0);
    this.positions = inputs.map(() => null);
    this.lastClose = inputs.map((inp) => inp.bars[0]?.close ?? 0);
    this.equity = cfg.equity;
    this.peak = cfg.equity;
    this.dayStartEquity = cfg.equity;

    const timeSet = new Set<number>();
    for (const inp of inputs) for (const b of inp.bars) timeSet.add(b.time);
    const startAt = Math.min(
      ...inputs.map((inp) => inp.bars[Math.min(cfg.warmup, inp.bars.length - 1)]!.time),
    );
    this.times = [...timeSet].filter((t) => t >= startAt).sort((a, b) => a - b);
  }

  run(): void {
    for (const t of this.times) this.step(t);
    // Force-close whatever is still open on each symbol's last bar.
    for (let s = 0; s < this.inputs.length; s++) {
      const pos = this.positions[s]!;
      if (!pos) continue;
      const bars = this.inputs[s]!.bars;
      this.closeAt(s, bars[bars.length - 1]!, bars[bars.length - 1]!.close, "end_of_data", pos.remainingQty);
    }
  }

  private step(t: number): void {
    // Catch up each symbol's pointer to its first bar at or after t — needed
    // on the first step (t starts at warmup) and for sparse symbol calendars.
    for (let s = 0; s < this.inputs.length; s++) {
      const bars = this.inputs[s]!.bars;
      while (this.ptrs[s]! < bars.length && bars[this.ptrs[s]!]!.time < t) this.ptrs[s]! += 1;
    }
    const key = utcDay(t);
    if (key !== this.dayKey) {
      if (this.halted) this.dailyHaltDays += 1;
      this.dayKey = key;
      this.dayPnl = 0;
      this.dayStartEquity = this.equityCurve.length
        ? this.equityCurve[this.equityCurve.length - 1]!.equity
        : this.cfg.equity;
      this.halted = false;
    }

    const hadOpen = this.positions.some((p) => p != null);
    if (hadOpen) this.exposedBars += 1;
    this.exposedFlags.push(hadOpen);

    // — manage every open position on its own bar at time t —
    for (let s = 0; s < this.inputs.length; s++) {
      const bars = this.inputs[s]!.bars;
      const ptr = this.ptrs[s]!;
      if (ptr >= bars.length || bars[ptr]!.time !== t) continue;
      const bar = bars[ptr]!;
      this.lastClose[s] = bar.close;
      const pos = this.positions[s];
      if (!pos) continue;
      this.chargeFunding(s, bar);
      // SIGNAL_EXIT profile: opposite signal from the same strategy reverses.
      if (ptr > 0) {
        const sigBar = bars[ptr - 1]!;
        if (
          pos.signalExit &&
          sigBar.signal !== 0 &&
          sigBar.strategy === pos.strategy &&
          (pos.side === "long" ? sigBar.signal === -1 : sigBar.signal === 1)
        ) {
          this.closeAt(s, bar, bar.open, "signal_flip", pos.remainingQty);
        }
      }
      if (this.positions[s]) this.managePosition(s, bar);
    }

    // — entries: symbols without a position, in input order, capacity-limited —
    if (!this.halted) {
      for (let s = 0; s < this.inputs.length; s++) {
        if (this.positions.filter((p) => p != null).length >= this.cfg.maxPositions) break;
        if (this.positions[s]) continue;
        const bars = this.inputs[s]!.bars;
        const ptr = this.ptrs[s]!;
        if (ptr === 0 || ptr >= bars.length || bars[ptr]!.time !== t) continue;
        const sigBar = bars[ptr - 1]!;
        if (sigBar.signal === 0) continue;
        this.tryEnter(s, bars[ptr]!, sigBar, ptr);
      }
    }

    // advance past the current bar
    for (let s = 0; s < this.inputs.length; s++) {
      const bars = this.inputs[s]!.bars;
      if (this.ptrs[s]! < bars.length && bars[this.ptrs[s]!]!.time === t) this.ptrs[s]! += 1;
    }

    const open = this.positions.filter((p) => p != null).length;
    this.maxConcurrent = Math.max(this.maxConcurrent, open);

    const mtm = this.markToMarket();
    this.peak = Math.max(this.peak, mtm);
    const dd = this.peak > 0 ? (this.peak - mtm) / this.peak : 0;
    this.equityCurve.push({ time: t, equity: mtm, drawdown: dd });

    if (dailyLossBreached(this.dayPnl, this.dayStartEquity, this.cfg)) {
      this.halted = true;
    }
  }

  private chargeFunding(s: number, bar: FeatureBar): void {
    const pos = this.positions[s]!;
    if (!isFundingBar(bar.time, this.tf)) return;
    const notional = pos.remainingQty * bar.close;
    const fee = fundingCharge(notional, this.cfg, this.tf);
    this.equity -= fee;
    this.dayPnl -= fee;
    pos.fundingPaid += fee;
  }

  private tryEnter(s: number, fillBar: FeatureBar, sigBar: FeatureBar, ptr: number): void {
    const side = sigBar.signal === 1 ? "long" : "short";
    if (this.cfg.side === "long_only" && side === "short") return;
    const strategy = sigBar.strategy === "none" ? "trend_pullback" : sigBar.strategy;
    const fill = applySlippage(fillBar.open, side, true, this.cfg.slippageBps);
    const plan = planStop(this.inputs[s]!.bars, ptr - 1, side, strategy, sigBar.close, {
      stopAtrMin: this.cfg.stopAtrMin,
      stopAtrMax: this.cfg.stopAtrMax,
      mrStopAtr: this.cfg.mrStopAtr,
      swingLookback: 8,
    });
    if (!plan) return;
    const stop = side === "long" ? fill - plan.dist : fill + plan.dist;
    const riskPerUnit = Math.abs(fill - stop);
    if (riskPerUnit <= 0) return;
    if (side === "long" && fillBar.low <= stop) return;
    if (side === "short" && fillBar.high >= stop) return;

    const signalExit = SIGNAL_EXIT_CLASS.has(strategy) || CHANNEL_EXIT[strategy] !== undefined;
    const qty = sizeQty(this.equity, this.cfg, fill, riskPerUnit);
    if (qty <= 0) return;

    const entryFee = feeOn(qty * fill, this.cfg.takerFee);
    this.equity -= entryFee;
    this.dayPnl -= entryFee;

    const pos: OpenPosition = {
      id: `p${tradeSeq++}`,
      side,
      strategy,
      entryTime: fillBar.time,
      entryBar: ptr,
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
    if (REVERSION_CLASS.has(strategy) && sigBar.bbMid != null) {
      pos.tp1 = sigBar.bbMid;
      pos.tp2 = sigBar.bbMid;
    }
    this.positions[s] = pos;
  }

  private managePosition(s: number, bar: FeatureBar): void {
    const pos = this.positions[s]!;
    pos.barsHeld += 1;
    const fav = pos.side === "long" ? bar.high - pos.entry : pos.entry - bar.low;
    pos.rReached = Math.max(pos.rReached, fav / pos.riskPerUnit);
    const adv = pos.side === "long" ? pos.entry - bar.low : bar.high - pos.entry;
    pos.maeR = Math.max(pos.maeR, adv / pos.riskPerUnit);

    if (pos.rReached >= this.cfg.breakevenR && !pos.trailed) {
      const be =
        pos.side === "long"
          ? pos.entry * (1 + this.cfg.takerFee * 2)
          : pos.entry * (1 - this.cfg.takerFee * 2);
      if (pos.side === "long") pos.stop = Math.max(pos.stop, be);
      else pos.stop = Math.min(pos.stop, be);
      pos.trailed = true;
    }

    // Turtle channel exit: close beyond the opposite N-bar channel (channel
    // computed on bars strictly before this one).
    if (pos.exitChannelBars) {
      const n = pos.exitChannelBars;
      const bars = this.inputs[s]!.bars;
      const i = this.ptrs[s]!;
      const from = Math.max(0, i - n);
      if (i - from >= n) {
        if (pos.side === "long") {
          let ll = bars[from]!.low;
          for (let k = from + 1; k < i; k++) ll = Math.min(ll, bars[k]!.low);
          if (bar.close < ll) {
            this.closeAt(s, bar, bar.close, "channel_exit", pos.remainingQty);
            return;
          }
        } else {
          let hh = bars[from]!.high;
          for (let k = from + 1; k < i; k++) hh = Math.max(hh, bars[k]!.high);
          if (bar.close > hh) {
            this.closeAt(s, bar, bar.close, "channel_exit", pos.remainingQty);
            return;
          }
        }
      }
    }

    const hitStop = pos.side === "long" ? bar.low <= pos.stop : bar.high >= pos.stop;
    const hitTp1 = !pos.signalExit && (pos.side === "long" ? bar.high >= pos.tp1 : bar.low <= pos.tp1);
    const hitTp2 = !pos.signalExit && (pos.side === "long" ? bar.high >= pos.tp2 : bar.low <= pos.tp2);

    if (hitStop) {
      this.closeAt(s, bar, pos.stop, "stop", pos.remainingQty);
      return;
    }

    if (!pos.tp1Done && hitTp1) {
      this.closeAt(s, bar, pos.tp1, "tp1", pos.remainingQty * this.cfg.tp1ClosePct);
      if (this.positions[s] && hitTp2) {
        this.closeAt(s, bar, pos.tp2, "tp2", this.positions[s]!.remainingQty);
      }
      return;
    }
    if (pos.tp1Done && hitTp2) {
      this.closeAt(s, bar, pos.tp2, "tp2", pos.remainingQty);
      return;
    }

    if (pos.strategy === "trend_pullback" && pos.tp1Done) {
      const emaFlip =
        pos.side === "long"
          ? bar.ema20 != null && bar.close < bar.ema20 && (bar.macdHist ?? 1) < 0
          : bar.ema20 != null && bar.close > bar.ema20 && (bar.macdHist ?? -1) > 0;
      if (emaFlip) {
        this.closeAt(s, bar, bar.close, "ema_macd_exit", pos.remainingQty);
        return;
      }
    }

    if (!pos.signalExit && pos.barsHeld >= this.cfg.timeStopBars) {
      this.closeAt(s, bar, bar.close, "time_stop", pos.remainingQty);
    }
  }

  private closeAt(s: number, bar: FeatureBar, rawPrice: number, reason: string, qty: number): void {
    const pos = this.positions[s];
    if (!pos || qty <= 0) return;
    const fillQty = Math.min(qty, pos.remainingQty);
    const px = applySlippage(rawPrice, pos.side, false, this.cfg.slippageBps);
    const gross = pos.side === "long" ? (px - pos.entry) * fillQty : (pos.entry - px) * fillQty;
    const fee = feeOn(fillQty * px, this.cfg.takerFee);
    const pnl = gross - fee;
    const pnlR =
      pos.riskPerUnit > 0
        ? ((px - pos.entry) * (pos.side === "long" ? 1 : -1)) / pos.riskPerUnit
        : 0;
    const fundingShare = (fillQty / Math.max(pos.qty, 1e-12)) * pos.fundingPaid;
    pos.fundingPaid -= fundingShare;
    this.equity += pnl;
    this.dayPnl += pnl;
    this.trades.push({
      id: `${pos.id}-${reason}-${this.trades.length}`,
      symbol: this.inputs[s]!.symbol,
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
      fees: fee,
      funding: fundingShare,
      reason,
      barsHeld: pos.barsHeld,
    });
    pos.remainingQty -= fillQty;
    if (reason === "tp1") pos.tp1Done = true;
    if (pos.remainingQty <= 1e-8) this.positions[s] = null;
  }

  private markToMarket(): number {
    let mtm = this.equity;
    for (let s = 0; s < this.inputs.length; s++) {
      const pos = this.positions[s];
      if (!pos) continue;
      const px = this.lastClose[s]!;
      const u = pos.side === "long" ? px - pos.entry : pos.entry - px;
      mtm += u * pos.remainingQty;
    }
    return mtm;
  }
}

function symbolStats(symbol: string, trades: Trade[]): SymbolStats {
  const wins = trades.filter((t) => t.pnl > 0);
  const gp = wins.reduce((acc, t) => acc + t.pnl, 0);
  const gl = Math.abs(trades.filter((t) => t.pnl <= 0).reduce((acc, t) => acc + t.pnl, 0));
  return {
    symbol,
    trades: trades.length,
    netPnl: trades.reduce((acc, t) => acc + t.pnl, 0),
    winRate: trades.length ? wins.length / trades.length : 0,
    avgR: trades.length ? trades.reduce((acc, t) => acc + t.pnlR, 0) / trades.length : 0,
    pf: gl > 0 ? gp / gl : gp > 0 ? 99 : 0,
  };
}

/** Equal-weight buy & hold across all symbols over the portfolio's window. */
function buyHold(inputs: PortfolioInput[], cfg: DeskConfig, times: number[]): { curve: EquityPoint[]; metrics: Metrics } {
  const n = inputs.length;
  const share = (cfg.equity * 0.99) / n;
  const starts = inputs.map((inp) => {
    const first = inp.bars.find((b) => b.time >= times[0]!) ?? inp.bars[0]!;
    return { entry: applySlippage(first.open, "long", true, cfg.slippageBps), qty: share / first.open, bars: inp.bars };
  });
  const entryFees = starts.reduce((acc, st) => acc + feeOn(st.qty * st.entry, cfg.takerFee), 0);
  const lastIdx = inputs.map(() => 0);
  let peak = cfg.equity;
  const curve: EquityPoint[] = [];
  for (const t of times) {
    for (let s = 0; s < n; s++) {
      const bars = starts[s]!.bars;
      while (lastIdx[s]! < bars.length - 1 && bars[lastIdx[s]! + 1]!.time <= t) lastIdx[s]! += 1;
    }
    let eq = cfg.equity - entryFees;
    for (let s = 0; s < n; s++) {
      const st = starts[s]!;
      eq += (st.bars[lastIdx[s]!]!.close - st.entry) * st.qty;
    }
    peak = Math.max(peak, eq);
    curve.push({ time: t, equity: eq, drawdown: peak > 0 ? (peak - eq) / peak : 0 });
  }
  const last = curve[curve.length - 1]?.equity ?? cfg.equity;
  const bhTrades = [{ pnl: last - cfg.equity, pnlR: 0 }] as Trade[];
  return { curve, metrics: computeMetrics(cfg.equity, curve, bhTrades, curve.length, curve.length) };
}

export function runPortfolio(inputs: PortfolioInput[], cfg: DeskConfig, tf: Timeframe): PortfolioResult {
  const engine = new PortfolioEngine(inputs, cfg, tf);
  engine.run();
  const metrics = computeMetrics(
    cfg.equity,
    engine.equityCurve,
    engine.trades,
    engine.equityCurve.length,
    engine.exposedBars,
  );

  const split = Math.floor(engine.equityCurve.length * 0.7);
  const splitTime = engine.equityCurve[split]?.time;
  // OOS metrics must be measured WITHIN the window: start equity is the
  // portfolio value at the split, drawdown restarts from that peak, and
  // exposure counts only tail bars — otherwise the OOS "net %" would just
  // echo the full-sample total.
  const tailRaw = engine.equityCurve.slice(split);
  let oosPeak = tailRaw[0]?.equity ?? cfg.equity;
  const testCurve = tailRaw.map((p) => {
    oosPeak = Math.max(oosPeak, p.equity);
    return { time: p.time, equity: p.equity, drawdown: oosPeak > 0 ? (oosPeak - p.equity) / oosPeak : 0 };
  });
  const startEq = engine.equityCurve[Math.max(0, split - 1)]?.equity ?? cfg.equity;
  const tailExposed = engine.exposedFlags.slice(split).filter(Boolean).length;
  const testTrades = splitTime == null ? [] : engine.trades.filter((t) => t.exitTime >= splitTime);
  const testMetrics = testCurve.length > 50
    ? computeMetrics(startEq, testCurve, testTrades, testCurve.length, tailExposed)
    : null;

  const bh = buyHold(inputs, cfg, engine.equityCurve.map((p) => p.time));
  const perSymbol = inputs
    .map((inp) => symbolStats(inp.symbol, engine.trades.filter((t) => t.symbol === inp.symbol)))
    .sort((a, b) => b.netPnl - a.netPnl);

  const gate = testMetrics ? claimGate(testMetrics) : { blocked: true, reason: "Không đủ dữ liệu OOS." };
  return {
    metrics,
    testMetrics,
    buyHold: bh.metrics,
    equity: engine.equityCurve,
    buyHoldEquity: bh.curve,
    trades: engine.trades,
    perSymbol,
    maxConcurrent: engine.maxConcurrent,
    dailyHaltDays: engine.dailyHaltDays,
    claimBlocked: gate.blocked,
    claimReason: gate.reason,
  };
}
