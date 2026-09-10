import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const root = process.env.VELA_TEST_ROOT || process.cwd();
test('Playbook Lab is the default native desk surface and preserves existing tools',()=>{
 const store=readFileSync(resolve(root,'src/lib/quant/store.ts'),'utf8');
 const app=readFileSync(resolve(root,'src/components/desk/desk-app.tsx'),'utf8');
 assert.match(store,/tab: "playbook"/);
 assert.match(app,/<PlaybookPanel\s*\/>/);
 for(const component of ['AnalyzePanel','StrategyPanel','TesterPanel','PaperPanel','CodePanel']) assert.ok(app.includes(`<${component} />`),component);
});
