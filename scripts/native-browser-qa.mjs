import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
const url=process.env.VELA_QA_URL||'http://127.0.0.1:8096/';
const out='.hermes/artifacts/native-parity/integration/browser';mkdirSync(out,{recursive:true});
const browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}});
const report={url,checks:[],errors:[]};page.on('pageerror',e=>report.errors.push(e.message));
const click=n=>page.getByRole('button',{name:n,exact:true}).click();
try{
 await page.goto(url,{waitUntil:'networkidle'});assert.ok(!(await page.content()).includes('/@vite/client'));
 await click('Mô phỏng');await click('Tester');
 const strategy=page.locator('select').filter({has:page.locator('option[value="macd"]')}).last();
 await strategy.selectOption('macd');await page.getByLabel('Execution mode').selectOption('source-native');
 await click('Inputs');assert.ok(await page.getByLabel('Fixed units when source omits size',{exact:true}).isEnabled());
 await page.getByLabel('Fixed units when source omits size',{exact:true}).fill('2');await click('Áp dụng & chạy lại');
 assert.match(await page.getByTestId('execution-scope').innerText(),/2 fixed units/);
 for(const id of ['macd','rsi_reversion','bb_reversion','stoch_reversion','supertrend','keltner','psar']){
  await strategy.selectOption(id);await click('Danh sách lệnh');
  const rows=await page.getByTestId('trade-row').count();assert.ok(rows>0,`${id} has actual trades`);
  const text=await page.getByTestId('trade-row').allTextContents();assert.ok(text.every(t=>t.includes('source_reversal')||t.includes('end_of_data')),id+' source exits only');
  report.checks.push({strategy:id,visibleRows:rows,first:text[0]});
 }
 await strategy.selectOption('macd');await page.getByTestId('trade-row').first().getByRole('button').click();
 const entry=Number(await page.getByTestId('trade-detail').getAttribute('data-entry-time'));
 await click('Replay từ điểm vào');await page.getByTestId('replay-historical-context').waitFor();
 await click('Bước 1 nến');assert.equal(Number(await page.getByTestId('replay-current-time').getAttribute('data-time')),entry);
 await page.getByTestId('native-pending-orders').waitFor();assert.match(await page.getByTestId('native-pending-orders').innerText(),/not TradingView runtime parity/);
 await page.screenshot({path:out+'/native-handoff.png',fullPage:true});
 await click('Đặt lại replay');await click('Replay dữ liệu hiện tại');
 const progress=page.getByTestId('replay-progress');assert.equal(Number(await progress.getAttribute('data-processed')),0);
 for(let i=0;i<601;i++){const b=page.getByRole('button',{name:'Bước 10 nến',exact:true});if(await b.isDisabled())break;await b.click();}
 assert.equal(Number(await progress.getAttribute('aria-valuenow')),100);assert.equal(await page.getByTestId('replay-cash').innerText(),await page.getByTestId('replay-mtm').innerText());
 report.checks.push({name:'native all bars completed, terminal flat, historical exact entry',entry});
 await page.screenshot({path:out+'/native-terminal.png',fullPage:true});
 await click('Tester');await click('Xem kết quả hiện tại');await strategy.selectOption('e0v1e');
 assert.match(await page.locator('body').innerText(),/Source-native e0v1e unsupported/);
 await page.getByLabel('Execution mode').selectOption('custom-risk');assert.match(await page.getByTestId('execution-scope').innerText(),/Custom-risk adaptation/);
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:out+'/mobile.png',fullPage:true});assert.deepEqual(report.errors,[]);report.pass=true;
}catch(e){report.failure=e.stack;process.exitCode=1;await page.screenshot({path:out+'/failure.png',fullPage:true});}
finally{writeFileSync(out+'/result.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));await browser.close();}
