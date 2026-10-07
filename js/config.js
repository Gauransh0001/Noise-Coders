// config.js
// Single place for the knobs that would otherwise be scattered through the
// app: which router implementation is live, and the confidence bands that
// decide whether we answer directly, ask a clarifying question, or hand off.
// Changing a threshold or swapping the router should never require touching
// any other file.

export const ACTIVE_ROUTER = 'remote'; // 'keyword' | 'remote'

export const THRESHOLDS = {
  direct: 0.65,   // >= this: route straight to the domain, show its badge
  clarify: 0.35   // >= this and < direct: ask a clarifying question
                  // below this: hand off to a human team
};

// Backend origin. '' = same origin (open http://localhost:8080).
// If the frontend is served from another port (e.g. Live Server), set this
// to 'http://localhost:8080'.
export const API_BASE = '';

export const MANIFEST_URL = 'data/manifest.json';
export const EVAL_SET_URL = 'data/eval-set.json';

export const STORAGE_KEY = 'campus-assistant-session-log';
