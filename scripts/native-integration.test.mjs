import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
test('native mode UI discloses execution scope and exposes separate source properties',()=>{
 const ui=read('src/components/desk/tester-panel.tsx');
 assert.match(ui,/aria-label="Execution mode"/);
 for(const key of ['nativeFixedQty','nativeTickSize','nativeFee','nativeSlippageBps'])assert.ok(ui.includes(key));
 assert.match(ui,/Not TradingView runtime parity/);
 assert.match(ui,/Source-native/);
 assert.match(read('src/components/desk/paper-panel.tsx'),/data-testid="native-pending-orders"/);
});
