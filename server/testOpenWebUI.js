// Quick check:  node server/testOpenWebUI.js "your IT question"
import { domains } from './bots.js';
import { askOpenWebUI, openWebUiStatus } from './openWebUiApi.js';

console.log('Open WebUI status:', await openWebUiStatus());
const it = domains.find((d) => d.id === 'it');
const q = process.argv[2] || 'My wifi is not connecting';
const out = await askOpenWebUI(q, it);
console.log('\nAnswer:', out || 'no answer (not configured, not covered, or Open WebUI failed - see warnings above)');
