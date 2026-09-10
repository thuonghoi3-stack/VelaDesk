import {chromium} from 'playwright';
const b=await chromium.launch();const p=await b.newPage({viewport:{width:1440,height:1000}});
await p.goto('http://127.0.0.1:8080/',{waitUntil:'networkidle'});
await p.getByRole('button',{name:'Tester',exact:true}).click();
await p.getByRole('button',{name:'Danh sách lệnh',exact:true}).click();
console.log('TESTER', (await p.locator('main').innerText()).slice(0,10000));
await p.getByRole('button',{name:'Replay',exact:true}).click();
console.log('REPLAY',(await p.locator('main').innerText()).slice(0,7000));
console.log('CONTROLS',await p.locator('main button,main select,main input').evaluateAll(es=>es.map(e=>({tag:e.tagName,text:e.innerText,label:e.getAttribute('aria-label')}))));await b.close();