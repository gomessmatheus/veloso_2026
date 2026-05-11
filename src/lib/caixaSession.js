/**
 * src/lib/caixaSession.js
 *
 * Manages the Caixa step-up session on the client side.
 *
 * The step-up token is stored in sessionStorage (never localStorage —
 * sessionStorage is cleared when the tab closes, reducing exposure).
 * The cookie httpOnly version is handled by the browser automatically.
 *
 * Usage:
 *   import { useCaixaSession } from './caixaSession.js';
 *   const { unlocked, unlock, lockout, loading, error } = useCaixaSession();
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "./supabaseClient.js"; // your existing supabase client

// ── Config ────────────────────────────────────────────────
const SESSION_KEY      = "caixa_step_up_token";
const EXPIRES_KEY      = "caixa_step_up_expires";
const SESSION_TTL_MS   = 15 * 60 * 1000;   // 15 min (matches server)
const WARN_BEFORE_MS   = 2 * 60 * 1000;    // warn 2 min before expiry
const EDGE_BASE        = import.meta.env.VITE_SUPABASE_FUNCTIONS_URL
                         ?? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

// ── Helpers ───────────────────────────────────────────────

/** Get Supabase auth JWT for function calls */
async function getAuthHeader() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Not authenticated");
  return `Bearer ${session.access_token}`;
}

/** Read session from sessionStorage */
function readSession() {
  try {
    const token   = sessionStorage.getItem(SESSION_KEY);
    const expStr  = sessionStorage.getItem(EXPIRES_KEY);
    if (!token || !expStr) return null;
    const exp = new Date(expStr);
    if (exp <= new Date()) {
      clearSession();
      return null;
    }
    return { token, expiresAt: exp };
  } catch {
    return null;
  }
}

/** Persist session to sessionStorage */
function writeSession(token, expiresAt) {
  try {
    sessionStorage.setItem(SESSION_KEY, token);
    sessionStorage.setItem(EXPIRES_KEY, expiresAt);
  } catch (e) {
    console.warn("[caixaSession] sessionStorage write failed:", e);
  }
}

/** Remove session from sessionStorage */
function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  } catch {}
}

/** Get current token (null if absent or expired) */
export function getCaixaToken() {
  return readSession()?.token ?? null;
}

// ── API calls ─────────────────────────────────────────────

/**
 * Attempt to unlock the Caixa view with a password.
 * Returns { ok: true, expiresAt } on success, throws on failure.
 */
export async function attemptUnlock(password) {
  const authHeader = await getAuthHeader();
  const res = await fetch(`${EDGE_BASE}/caixa-unlock`, {
    method:      "POST",
    credentials: "include", // send/receive cookies
    headers: {
      "Content-Type":  "application/json",
      "Authorization": authHeader,
    },
    body: JSON.stringify({ password }),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || "Unlock failed");
    // @ts-ignore
    err.status      = res.status;
    // @ts-ignore
    err.retryAfter  = data.retry_after;
    // @ts-ignore
    err.code        = data.code;
    throw err;
  }

  writeSession(data.token, data.expires_at);
  return { ok: true, expiresAt: new Date(data.expires_at) };
}

/**
 * Revoke the current step-up session on the server.
 */
export async function revokeSession() {
  const token = getCaixaToken();
  clearSession();

  if (!token) return;
  try {
    const authHeader = await getAuthHeader();
    await fetch(`${EDGE_BASE}/caixa-data`, {
      method:      "POST",
      credentials: "include",
      headers: {
        "Content-Type":    "application/json",
        "Authorization":   authHeader,
        "X-Caixa-Token":   token,
      },
      body: JSON.stringify({ action: "revoke" }),
    });
  } catch (e) {
    console.warn("[caixaSession] server revoke failed (session cleared locally):", e);
  }
}

/**
 * Call a caixa-data Edge Function action.
 * Auto-attaches the current step-up token.
 * Throws with code CAIXA_LOCKED if session is expired.
 */
export async function caixaData(action, payload = {}) {
  const token = getCaixaToken();
  if (!token) {
    const err = new Error("Caixa session required");
    // @ts-ignore
    err.code = "CAIXA_LOCKED";
    throw err;
  }

  const authHeader = await getAuthHeader();
  const res = await fetch(`${EDGE_BASE}/caixa-data`, {
    method:      "POST",
    credentials: "include",
    headers: {
      "Content-Type":  "application/json",
      "Authorization": authHeader,
      "X-Caixa-Token": token,
    },
    body: JSON.stringify({ action, payload }),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = new Error(data.error || "Request failed");
    // @ts-ignore
    err.status = res.status;
    // @ts-ignore
    err.code   = data.code;
    if (data.code === "CAIXA_LOCKED") clearSession();
    throw err;
  }

  return data.data;
}

// ── React hook ────────────────────────────────────────────

/**
 * Hook for managing Caixa step-up session state in React.
 *
 * Returns:
 *   unlocked     {boolean}  — true if valid session exists
 *   unlock(pwd)  {Function} — call with password; returns void, throws on error
 *   lockout()    {Function} — manually lock / revoke session
 *   expiresAt    {Date|null}
 *   expiresIn    {number|null} — seconds remaining (null if locked)
 *   loading      {boolean}
 *   error        {string|null}
 *   clearError   {Function}
 *   attemptsLeft {number|null} — estimated remaining attempts (from 429 header)
 */
export function useCaixaSession() {
  const [unlocked,     setUnlocked]     = useState(() => !!readSession());
  const [expiresAt,    setExpiresAt]    = useState(() => readSession()?.expiresAt ?? null);
  const [expiresIn,    setExpiresIn]    = useState(null);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState(null);
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [expiringSoon, setExpiringSoon] = useState(false);

  const timerRef = useRef(null);

  // ── Expiry countdown & auto-lockout ────────────────────
  useEffect(() => {
    function tick() {
      const s = readSession();
      if (!s) {
        setUnlocked(false);
        setExpiresAt(null);
        setExpiresIn(null);
        setExpiringSoon(false);
        return;
      }
      const remaining = Math.max(0, Math.floor((s.expiresAt - Date.now()) / 1000));
      setExpiresIn(remaining);
      setExpiringSoon(remaining < WARN_BEFORE_MS / 1000);
      if (remaining === 0) {
        setUnlocked(false);
        setExpiresAt(null);
        setExpiresIn(null);
      }
    }

    tick();
    timerRef.current = setInterval(tick, 5000); // update every 5s
    return () => clearInterval(timerRef.current);
  }, [unlocked]);

  // ── Unlock ─────────────────────────────────────────────
  const unlock = useCallback(async (password) => {
    setLoading(true);
    setError(null);
    setAttemptsLeft(null);
    try {
      const { expiresAt: exp } = await attemptUnlock(password);
      setUnlocked(true);
      setExpiresAt(exp);
    } catch (e) {
      let msg = e.message || "Erro ao desbloquear.";
      if (e.status === 429) {
        const mins = Math.ceil((e.retryAfter ?? 1800) / 60);
        msg = `Muitas tentativas. Tente novamente em ${mins} minutos.`;
      } else if (e.status === 401 && e.code === "NO_CREDENTIAL") {
        msg = "Senha do Caixa não configurada. Contate o administrador.";
      }
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Lockout ────────────────────────────────────────────
  const lockout = useCallback(async () => {
    await revokeSession();
    setUnlocked(false);
    setExpiresAt(null);
    setExpiresIn(null);
    setExpiringSoon(false);
    setError(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    unlocked,
    unlock,
    lockout,
    expiresAt,
    expiresIn,
    expiringSoon,
    loading,
    error,
    clearError,
    attemptsLeft,
  };
}
