import test from 'node:test';
import assert from 'node:assert/strict';
import * as limits from './limits.ts';
import { defaultConfig } from '../config.ts';
const cfg = defaultConfig({market:'usdm',fundingPer8h:0.001});
test('legacy daily/weekly constant-notional charges cover 3/21 periods', () => {
 assert.equal(limits.fundingCharge(1000,cfg,'1d'),3);
 assert.equal(limits.fundingCharge(1000,cfg,'1w'),21);
});

const hour=3600000, base=Date.UTC(2026,0,1);
test('elapsed funding counts only crossed UTC boundaries for 1h/4h/1d/1w', () => {
 assert.equal(typeof limits.fundingPeriodsBetween, 'function');
 const cases = [[7,8,1],[8,9,0],[4,8,1],[8,12,0],[0,24,3],[0,168,21],[1,25,3],[7,175,21],[0,0,0],[8,7,0]];
 for (const [a,b,count] of cases) assert.equal(limits.fundingPeriodsBetween(base+a!*hour,base+b!*hour),count);
 assert.equal(limits.fundingPeriodsBetween(base+8*hour-1,base+8*hour),1);
 assert.equal(limits.fundingPeriodsBetween(base+8*hour,base+8*hour+1),0);
 assert.equal(limits.fundingPeriodsBetween(NaN,base),0);
 // Additivity prevents duplicate/missing funding when replay is subdivided.
 assert.equal(limits.fundingPeriodsBetween(base,base+168*hour),
  Array.from({length:168},(_,i)=>limits.fundingPeriodsBetween(base+i*hour,base+(i+1)*hour)).reduce((a,b)=>a+b,0));
});

test('elapsed charge uses unsigned constant supplied notional, no future close', () => {
 assert.equal(typeof limits.fundingChargeBetween,'function');
 for (const notional of [1000,-1000]) {
  assert.equal(limits.fundingChargeBetween(notional,cfg,base,base+168*hour),21);
  assert.equal(limits.fundingChargeBetween(notional,cfg,base+7*hour,base+8*hour),1);
  assert.equal(limits.fundingChargeBetween(notional,{...cfg,market:'spot'},base,base+168*hour),0);
 }
 // A caller at the 08:00 open supplies only open notional. Future close is
 // deliberately a throwing getter; helper accepts no OHLC / side argument.
 const bar={time:base+8*hour,open:100,get close(): number {throw Error('future close read');}};
 assert.equal(limits.fundingChargeBetween(10*bar.open,cfg,base+7*hour,bar.time),1);
 assert.equal(limits.fundingChargeBetween(1000,cfg,bar.time,bar.time),0);
});
test('legacy schedule/short timeframe signatures stay compatible', () => {
 for (const tf of ['1h','4h','1d','1w'] as const) {
  assert.equal(limits.isFundingBar(base,tf),true);
  assert.equal(limits.isFundingBar(base+60_000,tf),false);
 }
 for (const tf of ['1h','4h'] as const) {
  assert.equal(limits.fundingCharge(1000,cfg,tf),1);
  assert.equal(limits.isFundingBar(base+8*hour,tf),true);
  assert.equal(limits.isFundingBar(base+4*hour,tf),false);
 }
});
