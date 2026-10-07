// Quick check:  node server/testApis.js "your question"
import { domains } from './bots.js';
import { callDomainApi, domainApiStatus } from './domainApis.js';

console.log('Configured APIs:', domainApiStatus(domains));
const q = process.argv[2] || 'When is the semester fee deadline?';
for (const d of domains) {
  const out = await callDomainApi(q, d);
  console.log(`\n[${d.id}]`, out ? out : 'no external API answer (not configured, not covered, or it failed)');
}
