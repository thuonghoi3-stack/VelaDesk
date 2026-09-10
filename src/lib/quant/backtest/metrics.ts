import type { EquityPoint, LosingPeriod, Metrics, Regime, Trade } from "../types.ts";

// Curves contain post-bar marks; include initial capital to first observed
// UTC-day final mark. Missing calendar days are not fabricated as flat returns.
function dailyReturns(startEquity: number, equity: EquityPoint[]): number[] {
  if (equity.length === 0) return [];
  const byDay = new Map<string, number>();
  for (const p of equity) {
    const d = new Date(p.time).toISOString().slice(0, 10);
    byDay.set(d, p.equity);
  }
  const days = [...byDay.keys()].sort();
  const rets: number[] = [];
  for (let i = 0; i < days.length; i++) {
    const a = i === 0 ? startEquity : byDay.get(days[i - 1]!)!;
    const b = byDay.get(days[i]!)!;
    if (a > 0) rets.push(b / a - 1);
  }
  return rets;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((s, v) => s + v, 0) / xs.length;
}

function std(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let a = 0;
  for (const x of xs) a += (x - m) ** 2;
  return Math.sqrt(a / (xs.length - 1));
}

export function computeMetrics(
  startEquity: number,
  equity: EquityPoint[],
  trades: Trade[],
  bars: number,
  exposedBars: number,
): Metrics {
  const endEquity = equity.length ? equity[equity.length - 1]!.equity : startEquity;
  // API has no initial-capital timestamp or bar duration: retain observed
  // timestamp-span CAGR convention (minimum one day), not invented timing.
  const t0 = equity[0]?.time ?? 0;
  const t1 = equity[equity.length - 1]?.time ?? t0;
  const days = Math.max(1, (t1 - t0) / 86_400_000);
  const cagr = startEquity > 0 ? (endEquity / startEquity) ** (365 / days) - 1 : 0;
  const rets = dailyReturns(startEquity, equity);
  const m = mean(rets);
  const s = std(rets);
  const sharpe = s > 0 ? (m / s) * Math.sqrt(365) : 0;
  // Zero-target downside deviation uses ALL daily observations, not the
  // sample standard deviation of losses. No downside => finite 0 sentinel
  // (not infinity / a claim of risk-free performance).
  const ds = Math.sqrt(mean(rets.map((r) => Math.min(r, 0) ** 2)));
  const sortino = ds > 0 ? (m / ds) * Math.sqrt(365) : 0;
  let maxDd = 0;
  for (const p of equity) maxDd = Math.max(maxDd, p.drawdown);
  const calmar = maxDd > 0 ? cagr / maxDd : 0;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const gp = wins.reduce((s, t) => s + t.pnl, 0);
  const gl = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = trades.length ? wins.length / trades.length : 0;
  const profitFactor = gl > 0 ? gp / gl : gp > 0 ? 99 : 0;
  const avgR = trades.length ? mean(trades.map((t) => t.pnlR)) : 0;
  const expectancy = trades.length ? mean(trades.map((t) => t.pnl)) : 0;
  return {
    bars,
    days,
    startEquity,
    endEquity,
    cagr,
    sharpe,
    sortino,
    maxDd,
    calmar,
    winRate,
    profitFactor,
    avgR,
    expectancy,
    trades: trades.length,
    exposure: bars > 0 ? exposedBars / bars : 0,
    grossProfit: gp,
    grossLoss: gl,
    avgWin: wins.length ? gp / wins.length : 0,
    avgLoss: losses.length ? -gl / losses.length : 0,
    best: trades.length ? Math.max(...trades.map((t) => t.pnl)) : 0,
    worst: trades.length ? Math.min(...trades.map((t) => t.pnl)) : 0,
  };
}

export function findLosingPeriods(
  equity: EquityPoint[],
  regimes: Array<{ time: number; regime: Regime }>,
  threshold = 0.08,
): LosingPeriod[] {
  const out: LosingPeriod[] = [];
  let peak = equity[0]?.equity ?? 0;
  let start = equity[0]?.time ?? 0;
  let inDd = false;
  let trough = 0;
  let troughTime = start;

  const flush = (end: number) => {
    if (!inDd) return;
    const dd = trough;
    if (dd >= threshold) {
      const mix: Record<Regime, number> = {
        trending_up: 0,
        trending_down: 0,
        ranging: 0,
        mixed: 0,
      };
      let n = 0;
      for (const r of regimes) {
        if (r.time >= start && r.time <= end) {
          mix[r.regime] += 1;
          n++;
        }
      }
      const top = (Object.entries(mix) as Array<[Regime, number]>).sort((a, b) => b[1] - a[1])[0];
      const note =
        top && n
          ? `Regime chiếm đa số: ${top[0].replace("_", " ")} (${((top[1] / n) * 100).toFixed(0)}% nến).`
          : "Không đủ dữ liệu regime.";
      out.push({ start, end, troughTime, drawdown: dd, regimeMix: mix, note });
    }
    inDd = false;
  };

  for (const p of equity) {
    if (p.equity >= peak) {
      flush(p.time);
      peak = p.equity;
      start = p.time;
      trough = 0;
    } else {
      const dd = peak > 0 ? (peak - p.equity) / peak : 0;
      if (!inDd) {
        inDd = true;
        start = p.time;
        trough = dd;
        troughTime = p.time;
      } else if (dd > trough) {
        trough = dd;
        troughTime = p.time;
      }
    }
  }
  if (equity.length) flush(equity[equity.length - 1]!.time);
  return out.sort((a, b) => b.drawdown - a.drawdown).slice(0, 5);
}

export function claimGate(test: Metrics): { blocked: boolean; reason: string } {
  if (test.trades < 20) {
    return {
      blocked: true,
      reason: `Mẫu test chỉ ${test.trades} lệnh — không đủ để tuyên bố hiệu quả.`,
    };
  }
  if (test.sharpe < 0.8) {
    return {
      blocked: true,
      reason: `Sharpe test ${test.sharpe.toFixed(2)} < 0.8 — không được claim "chiến lược thắng".`,
    };
  }
  if (test.maxDd > 0.25) {
    return {
      blocked: true,
      reason: `Max DD test ${(test.maxDd * 100).toFixed(1)}% > 25% — không được claim "chiến lược thắng".`,
    };
  }
  return {
    blocked: false,
    reason: "Test sample vượt ngưỡng tối thiểu (Sharpe ≥ 0.8, Max DD ≤ 25%). Vẫn không đảm bảo tương lai.",
  };
}
