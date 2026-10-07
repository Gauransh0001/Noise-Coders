// skills/index.js
// Answers come from the backend /api/answer; falls back to the local skill
// if the server is unreachable.

import * as localSkill from './localSkill.js';
import { API_BASE } from '../config.js';

export async function answer(query, domain) {
  try {
    const res = await fetch(`${API_BASE}/api/answer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, domainId: domain.id })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.warn('remote skill failed, using local skill:', err.message);
    return localSkill.answer(query, domain);
  }
}
