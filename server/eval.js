// Routing accuracy report.   Usage: node server/eval.js
//
// Compares keyword-only routing against the hybrid router (keyword + LLM,
// when API keys are set) on two sets:
//   - data/eval-set.json     : the set the keyword weights were tuned on (optimistic)
//   - data/holdout-set.json  : never used for tuning (the honest number)
// "Confident-wrong" = answered directly (>= direct threshold) but to the wrong team,
// the error users actually feel.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { route as keywordRoute } from '../js/router/keywordRouter.js';
import { THRESHOLDS } from '../js/config.js';
import { domains, routeMessage, llmEnabled } from './bots.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DELAY_MS = Number(process.env.EVAL_DELAY_MS) || 3000;   // pause between LLM calls (free-tier RPM)
const RETRY_MS = Number(process.env.EVAL_RETRY_MS) || 15000;  // base wait after a rate-limit failure

// The router falls back to keywords when every LLM provider fails. Below the
// direct threshold with no "llm:" reason means exactly that - so we wait and
// retry instead of silently scoring a rate-limit as a wrong answer.
const llmFailed = (r) => r.confidence < THRESHOLDS.direct && !String(r.reason).startsWith('llm');

async function routeWithRetry(router, text) {
  for (let attempt = 0; ; attempt++) {
    const r = await router(text, { lastDomain: null }, domains);
    if (!llmFailed(r)) return { r, failed: false };
    if (attempt >= 3) return { r, failed: true };
    await sleep(RETRY_MS * (attempt + 1));
  }
}
const pct = (n, d) => (d ? ((100 * n) / d).toFixed(1) : '0.0') + '%';

async function run(label, set, router, throttle) {
  let correct = 0, confidentWrong = 0, direct = 0, unavailable = 0;
  const misses = [];
  for (const q of set) {
    let r;
    if (throttle) {
      const out = await routeWithRetry(router, q.text);
      r = out.r;
      if (out.failed) unavailable++;
    } else {
      r = await router(q.text, { lastDomain: null }, domains);
    }
    if (r.domain === q.expectedDomain) correct++;
    else misses.push({ text: q.text, expected: q.expectedDomain, got: r.domain, conf: r.confidence.toFixed(2) });
    if (r.confidence >= THRESHOLDS.direct) {
      direct++;
      if (r.domain !== q.expectedDomain) confidentWrong++;
    }
    if (throttle && String(r.reason).startsWith('llm')) await sleep(DELAY_MS); // stay under free-tier RPM
    process.stdout.write('.');
  }
  console.log('');
  if (unavailable) console.log(`  WARNING: LLM unreachable for ${unavailable} question(s) after retries (rate limits). They fell back to keywords, so this accuracy is UNDERSTATED. Wait a few minutes and rerun.`);
  console.log(`  ${label.padEnd(14)} top-1 accuracy ${pct(correct, set.length).padStart(6)}  (${correct}/${set.length})` +
    `   answered directly ${pct(direct, set.length)}   confident-wrong ${confidentWrong}`);
  return misses;
}

const sets = [['tuned set', load('eval-set.json')], ['HELD-OUT set', load('holdout-set.json')]];
console.log(llmEnabled() ? 'LLM keys detected: hybrid router will be tested.\n' : 'No LLM keys set (X/Y/Z placeholders): keyword-only results.\n');

for (const [name, set] of sets) {
  console.log(`${name} (${set.length} questions)`);
  const kwMisses = await run('keyword-only', set, keywordRoute, false);
  if (llmEnabled()) {
    const hybridMisses = await run('hybrid (LLM)', set, routeMessage, true);
    if (name.startsWith('HELD') && hybridMisses.length) {
      console.log('\n  Hybrid misses:'); hybridMisses.forEach((m) => console.log(`   - "${m.text}" expected ${m.expected}, got ${m.got} (${m.conf})`));
    }
  } else if (name.startsWith('HELD')) {
    console.log(`\n  Keyword-only misses: ${kwMisses.length} (first 10)`);
    kwMisses.slice(0, 10).forEach((m) => console.log(`   - "${m.text}" expected ${m.expected}, got ${m.got} (${m.conf})`));
  }
  console.log();
}