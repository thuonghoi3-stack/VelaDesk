import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {resolve} from 'node:path';
const root=process.env.VELA_TEST_ROOT||process.cwd();
test('research surfaces integrate causal replay and trade inspector',()=>{
 const paper=readFileSync(resolve(root,'src/components/desk/paper-panel.tsx'),'utf8');
 const tester=readFileSync(resolve(root,'src/components/desk/tester-panel.tsx'),'utf8');
 assert.ok(paper.includes('replay-view'),'Replay uses tested causal view helper');
 assert.ok(paper.includes('CandleChart'),'Replay chart integrated');
 assert.ok(tester.includes('TradeInspector'),'Tester inspector integrated');
});
