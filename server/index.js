// Backend for the Campus Assistant. Zero dependencies (Node 18+).
// Routing + answers live in bots.js (keyword router + LLM fallback chain).
//
//   POST /api/route    { text, context? }       -> { domain, confidence, scores, reason }
//   POST /api/answer   { query, domainId }      -> { text, sources, entryId }
//   POST /api/events   { type, ... }            -> 204   (telemetry)
//   GET  /api/metrics                           -> aggregate metrics across all users
//   GET  /api/health

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { domains, domainMap, routeMessage, answerQuestion } from './bots.js';
import { providerNames } from './llm.js';
import { domainApiStatus } from './domainApis.js'; // NEW
import { openWebUiStatus } from './openWebUiApi.js'; // NEW

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = process.env.PORT || 8080;
const LOG_FILE = path.join(ROOT, 'server', 'events.jsonl');
const MAX_BODY = 8 * 1024;
const MAX_TEXT = 500;
const RATE_LIMIT = 60; // requests / minute / IP


// ---- telemetry ----------------------------------------------------------
const EVENT_TYPES = new Set(['question', 'clarify', 'handoff', 'feedback']);
let events = [];
if (fs.existsSync(LOG_FILE)) {
  events = fs.readFileSync(LOG_FILE, 'utf8').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } })
    .filter(Boolean);
}

function logEvent(e) {
  const clean = {
    type: e.type,
    domain: domainMap[e.domain] ? e.domain : null,
    confidence: typeof e.confidence === 'number' ? e.confidence : null,
    band: ['direct', 'clarify', 'handoff'].includes(e.band) ? e.band : undefined,
    entryId: typeof e.entryId === 'string' ? e.entryId.slice(0, 100) : undefined,
    resolved: typeof e.resolved === 'boolean' ? e.resolved : undefined,
    timestamp: Date.now()
  };
  events.push(clean);
  fs.appendFile(LOG_FILE, JSON.stringify(clean) + '\n', () => {});
}

function metrics() {
  const of = (t) => events.filter((e) => e.type === t);
  const questions = of('question'), feedback = of('feedback');
  const n = questions.length;
  const solved = feedback.filter((f) => f.resolved).length;
  const byDomain = {};
  for (const q of questions) byDomain[q.domain] = (byDomain[q.domain] || 0) + 1;
  return {
    totalQuestions: n,
    bands: {
      direct: questions.filter((q) => q.band === 'direct').length,
      clarify: questions.filter((q) => q.band === 'clarify').length,
      handoff: questions.filter((q) => q.band === 'handoff').length
    },
    avgConfidence: n ? questions.reduce((s, q) => s + (q.confidence || 0), 0) / n : 0,
    clarificationRate: n ? of('clarify').length / n : 0,
    handoffRate: n ? of('handoff').length / n : 0,
    feedbackCount: feedback.length,
    // true end-to-end resolution: of the answers users rated, how many solved it
    resolutionRate: feedback.length ? solved / feedback.length : 0,
    byDomain
  };
}

// ---- helpers ------------------------------------------------------------
const hits = new Map();
setInterval(() => hits.clear(), 60_000).unref();
const limited = (ip) => { const c = (hits.get(ip) || 0) + 1; hits.set(ip, c); return c > RATE_LIMIT; };

const CORS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type'
};

function send(res, status, body) {
  const data = body === undefined ? '' : JSON.stringify(body);
  res.writeHead(status, { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0, raw = '';
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject({ status: 413, msg: 'Body too large' }); req.destroy(); return; }
      raw += c;
    });
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject({ status: 400, msg: 'Invalid JSON' }); } });
  });
}

const isText = (v) => typeof v === 'string' && v.trim().length > 0 && v.length <= MAX_TEXT;

// ---- API ----------------------------------------------------------------
const api = {
  'POST /api/route': async (b) => {
    if (!isText(b.text)) throw { status: 400, msg: `"text" must be a non-empty string (max ${MAX_TEXT} chars)` };
    const lastDomain = domainMap[b.context?.lastDomain] ? b.context.lastDomain : null;
    return routeMessage(b.text, { lastDomain }, domains);
  },
  'POST /api/answer': async (b) => {
    if (!isText(b.query)) throw { status: 400, msg: `"query" must be a non-empty string (max ${MAX_TEXT} chars)` };
    const domain = domainMap[b.domainId];
    if (!domain) throw { status: 404, msg: 'Unknown domainId' };
    return answerQuestion(b.query, domain);
  },
  'POST /api/events': async (b) => {
    if (!EVENT_TYPES.has(b.type)) throw { status: 400, msg: 'Invalid event type' };
    logEvent(b);
    return null;
  },
  'GET /api/metrics': async () => metrics(),
  'GET /api/domain-apis': async () => domainApiStatus(domains), // NEW: shows which domain APIs are set
  'GET /api/openwebui': async () => openWebUiStatus(), // NEW: Open WebUI connection check
  'GET /api/health': async () => ({ ok: true, domains: domains.map((d) => d.id), llmProviders: providerNames() })
};

// ---- static frontend (allowlisted so server/ and package.json stay private)
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const PUBLIC = ['index.html', 'metrics.html', 'css', 'js', 'data'];

function serveStatic(req, res, pathname) {
  const rel = path.normalize(pathname === '/' ? 'index.html' : pathname.slice(1));
  const file = path.join(ROOT, rel);
  if (rel.startsWith('..') || !PUBLIC.includes(rel.split(path.sep)[0]) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, { error: 'Not found' });
  }
  res.writeHead(200, { 'Content-Type': (MIME[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}

// ---- server -------------------------------------------------------------
http.createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (!pathname.startsWith('/api/')) return serveStatic(req, res, pathname);
  if (req.method === 'OPTIONS') { res.writeHead(204, CORS); return res.end(); }

  try {
    if (limited(req.socket.remoteAddress)) throw { status: 429, msg: 'Too many requests' };
    const handler = api[`${req.method} ${pathname}`];
    if (!handler) throw { status: 404, msg: 'Not found' };
    const out = await handler(req.method === 'POST' ? await readBody(req) : {});
    send(res, out === null ? 204 : 200, out === null ? undefined : out);
  } catch (err) {
    if (err.status) return send(res, err.status, { error: err.msg });
    console.error(err);
    send(res, 500, { error: 'Internal error' });
  }
}).listen(PORT, () => console.log(`Campus Assistant on http://localhost:${PORT}`));
