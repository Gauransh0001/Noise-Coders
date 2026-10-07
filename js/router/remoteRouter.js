// router/remoteRouter.js
// Calls the backend /api/route. Same contract as keywordRouter:
// { domain, confidence, scores, reason }. Falls back to the local keyword
// router if the server is unreachable so the UI never dead-ends.

import * as keywordRouter from './keywordRouter.js';
import { API_BASE } from '../config.js';

export async function route(text, context, domains) {
  try {
    const res = await fetch(`${API_BASE}/api/route`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, context })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('remote router failed, using local keyword router:', err.message);
    return keywordRouter.route(text, context, domains);
  }
}
