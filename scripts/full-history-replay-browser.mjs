import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const url = process.env.VELA_QA_URL || 'http://127.0.0.1:8080/';
const mode = process.env.VELA_QA_MODE || 'dev';
const out = `.hermes/artifacts/engine-strategy-audit/replay-browser-${mode}`;
mkdirSync(out, {recursive:true});
const browser = await chromium.launch();
const page = await browser.newPage({viewport:{width:1440,height:1000}});
const result = {url,checks:[],errors:[],consoleErrors:[]};
page.on('pageerror', e => result.errors.push(e.message));
page.on('console', m => {if(m.type() === 'error') result.consoleErrors.push({text:m.text(),url:m.location().url});});
const click = name => page.getByRole('button',{name,exact:true}).click();
const state = async () => ({
  index:Number(await page.getByTestId('replay-progress').getAttribute('data-index')),
  processed:Number(await page.getByTestId('replay-progress').getAttribute('data-processed')),
  progress:Number(await page.getByTestId('replay-progress').getAttribute('aria-valuenow')),
  time:Number(await page.getByTestId('replay-current-time').getAttribute('data-time')),
  text:await page.getByTestId('replay-progress-text').innerText(),
});
try {
  assert.equal((await page.goto(url,{waitUntil:'networkidle'})).status(),200);
  await click('Mô phỏng'); await click('Replay');
  await page.getByTestId('replay-current-time').waitFor();
  const start = await state();
  assert.equal(start.processed,0);assert.equal(start.progress,0);
  // Synthetic button loads the application's own documented 6000-bar data.
  const total = Number(start.text.match(/\/ (\d+) nến/)[1]);
  assert.equal(total,6000-start.index);assert.ok(total>180);
  if(mode==='dev') {
    result.store = await page.evaluate(async()=>{
      const {useDesk}=await import('/src/lib/quant/store.ts');const s=useDesk.getState();
      return {length:s.ltf.length,warmup:s.cfg.warmup,index:s.paper.engine.i,expectedPreviousTime:s.ltf[s.cfg.warmup-1].time,nextTime:s.ltf[s.cfg.warmup].time};
    });
    assert.equal(start.index,result.store.warmup);
    assert.equal(start.time,result.store.expectedPreviousTime);
  }
  result.checks.push({name:'Full-history start, warmup context, zero progress',start,total});
  await page.screenshot({path:`${out}/start.png`,fullPage:true});
  await click('Bước 1 nến');const one=await state();
  assert.equal(one.index,start.index+1);assert.equal(one.processed,1);
  assert.ok(Math.abs(one.progress-100/total)<1e-10);assert.ok(one.time>start.time);
  if(result.store)assert.equal(one.time,result.store.nextTime);
  await click('Bước 10 nến');const eleven=await state();
  assert.equal(eleven.index,start.index+11);assert.equal(eleven.processed,11);
  result.checks.push({name:'One and ten candle buttons advance causally',one,eleven});
  await click('Đặt lại replay');assert.deepEqual(await state(),start);
  await page.getByTestId('replay-play').click();
  await page.waitForFunction(()=>Number(document.querySelector('[data-testid="replay-progress"]').dataset.processed)>=2);
  await page.getByTestId('replay-play').click();const paused=await state();
  await page.waitForTimeout(1200);assert.deepEqual(await state(),paused);
  await click('Đặt lại replay');assert.deepEqual(await state(),start);
  result.checks.push({name:'Reset restores exact start; autoplay advances and pause stops',paused});
  await page.screenshot({path:`${out}/reset.png`,fullPage:true});
  await click('Tester');await click('Danh sách lệnh');
  await page.getByTestId('trade-row').first().getByRole('button').click();
  const entry=Number(await page.getByTestId('trade-detail').getAttribute('data-entry-time'));
  await click('Replay từ điểm vào');await page.getByTestId('replay-historical-context').waitFor();
  const historical=await state();assert.equal(historical.processed,0);assert.ok(historical.time<entry);
  await click('Bước 1 nến');assert.equal((await state()).time,entry);assert.equal((await state()).processed,1);
  await click('Đặt lại replay');assert.deepEqual(await state(),historical);
  await click('Replay dữ liệu hiện tại');assert.deepEqual(await state(),start);
  result.checks.push({name:'Historical target/reset and return to full current history preserved',historical,entry});
  await page.setViewportSize({width:390,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:`${out}/mobile.png`,fullPage:true});
  assert.deepEqual(result.errors,[]);
  assert.deepEqual(result.consoleErrors.filter(e => !e.url.startsWith("https://grok.com/")),[]);
  result.pass=true;
} catch(e) {result.failure=e.stack; await page.screenshot({path:`${out}/failure.png`,fullPage:true});process.exitCode=1;}
finally {writeFileSync(`${out}/result.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));await browser.close();}
