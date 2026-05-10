/**
 * src/lib/copilot/history.js
 * Conversation history stored in localStorage.
 * Max 50 messages — oldest dropped automatically.
 */

const KEY = "copilot_history_v1";
const MAX = 50;

/** @typedef {{ id:string, role:'user'|'assistant', text:string, ts:string }} Msg */

function uid() { return Math.random().toString(36).substr(2, 8); }

/** @returns {Msg[]} */
export function loadHistory() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

/** @param {Msg[]} messages */
export function saveHistory(messages) {
  try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-MAX))); }
  catch {}
}

export function clearHistory() {
  try { localStorage.removeItem(KEY); } catch {}
}

export function appendMessage(role, text, existing = []) {
  const next = [...existing, { id: uid(), role, text, ts: new Date().toISOString() }];
  saveHistory(next);
  return next.slice(-MAX);
}
