import test from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from './metrics.ts';
const day = 86_400_000;
const base = Date.UTC(2026, 0, 1);
function metric(values: number[], start = 100) {
  return computeMetrics(start, values.map((equity, i) => ({ time: base + i * day, equity, drawdown: 0 })), [], values.length, 0);
}
function close(actual: number, expected: number) { assert.ok(Math.abs(actual - expected) < 1e-10, `${actual} != ${expected}`); }
test('Sortino uses zero-target downside RMS over every daily return', () => {
  const returns = [0, -0.1, 0.1, -0.1];
  const average = returns.reduce((a,b) => a+b, 0)/returns.length;
  const downside = Math.sqrt((0.1**2 + 0.1**2)/returns.length);
  close(metric([100, 90, 99, 89.1]).sortino, average / downside * Math.sqrt(365));
});
test('Sortino has a finite zero-denominator sentinel', () => {
  for (const values of [[], [100], [100,100], [100,110,121]]) assert.equal(metric(values).sortino, 0);
});

test('first observed UTC day includes capital-to-close loss', () => {
 close(metric([90]).sortino, -Math.sqrt(365));
 close(metric([90,81]).sortino, -Math.sqrt(365));
 const points = [95,90].map((equity,i) => ({time:base+i*3600000,equity,drawdown:0}));
 close(computeMetrics(100,points,[],2,0).sortino,-Math.sqrt(365));
});
