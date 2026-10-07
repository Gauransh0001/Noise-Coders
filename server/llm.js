// LLM access: one chat() call that walks a fallback chain of free providers
// (Groq -> Gemini -> OpenRouter). All three speak the OpenAI chat format.
// Keys come from .env (placeholders X/Y/Z are treated as "not set").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Minimal .env loader (no dependency). Real environment variables win.
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const isReal = (v) => !!v && !/^(x|y|z)$/i.test(v.trim()) && !/^your/i.test(v.trim());
const env = process.env;

const PROVIDERS = [
  { name: 'groq', key: env.GROQ_API_KEY,
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: env.GROQ_MODEL || 'llama-3.3-70b-versatile' },
  { name: 'gemini', key: env.GEMINI_API_KEY,
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    model: env.GEMINI_MODEL || 'gemini-flash-latest' },
  { name: 'openrouter', key: env.OPENROUTER_API_KEY,
    url: 'https://openrouter.ai/api/v1/chat/completions',
    model: env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free' }
].filter((p) => isReal(p.key)).map((p) => ({ ...p, coolUntil: 0 }));

const TIMEOUT_MS = 8000;
const COOLDOWN_MS = 30_000; // skip a failing provider briefly instead of retrying it every call

export const providerNames = () => PROVIDERS.map((p) => p.name);
export const llmEnabled = () => PROVIDERS.length > 0;

export async function chat(system, user) {
  const now = Date.now();
  const ready = PROVIDERS.filter((p) => p.coolUntil <= now);
  const order = ready.length ? ready : PROVIDERS; // everyone cooling? try anyway
  let lastErr = new Error('No LLM provider configured');

  for (const p of order) {
    try {
      const res = await fetch(p.url, {
        method: 'POST',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.key}` },
        body: JSON.stringify({
          model: p.model,
          temperature: 0,
          max_tokens: 1500,
          // gpt-oss models "think" first; keep it short to save tokens/rate limit
          ...(p.name === 'groq' && p.model.includes('gpt-oss') ? { reasoning_effort: 'low' } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
        })
      });
      if (!res.ok) throw new Error(`${p.name}: HTTP ${res.status}`);
      const text = (await res.json()).choices?.[0]?.message?.content;
      if (!text) throw new Error(`${p.name}: empty response`);
      return text;
    } catch (err) {
      p.coolUntil = Date.now() + COOLDOWN_MS;
      lastErr = err;
      console.warn(`[llm] ${err.message} - trying next provider`);
    }
  }
  throw lastErr;
}

// Models sometimes wrap JSON in prose or code fences; grab the outermost object.
export function parseJson(text) {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('No JSON in model output');
  return JSON.parse(m[0]);
}