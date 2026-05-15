/**
 * src/lib/caixaSession.js
 *
 * Manages the Caixa step-up session on the client side.
 *
 * MODO SIMPLES (apresentacao): validacao 100% client-side com senha em
 * constante. Sem chamada a Supabase / Edge Functions. Persistencia em
 * sessionStorage (limpa ao fechar a aba).
 *
 * Usage:
 *   import { useCaixaSession } from './caixaSession.js';
 *   const { unlocked, unlock, lockout, loading, error } = useCaixaSession();
 */

import { useState, useEffect, useCallback, useRef } from "react";

// -- Config --------------------------------------------------------------
const SESSION_KEY    = "caixa_step_up_token";
const EXPIRES_KEY    = "caixa_step_up_expires";
const SESSION_TTL_MS = 60 * 60 * 1000;  // 60 min
const WARN_BEFORE_MS = 2 * 60 * 1000;   // warn 2 min before expiry

// Senha simples para a apresentacao. Trocar/remover depois.
const CAIXA_PASSWORD = "veloso2026";

// -- Helpers -------------------------------------------------------------

function readSession() {
    try {
          const token  = sessionStorage.getItem(SESSION_KEY);
          const expStr = sessionStorage.getItem(EXPIRES_KEY);
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

function writeSession(token, expiresAt) {
    try {
          sessionStorage.setItem(SESSION_KEY, token);
          sessionStorage.setItem(EXPIRES_KEY, expiresAt);
    } catch (e) {
          console.warn("[caixaSession] sessionStorage write failed:", e);
    }
}

function clearSession() {
    try {
          sessionStorage.removeItem(SESSION_KEY);
          sessionStorage.removeItem(EXPIRES_KEY);
    } catch {}
}

export function getCaixaToken() {
    return readSession()?.token ?? null;
}

// -- API (no-op / local) -------------------------------------------------

export async function attemptUnlock(password) {
    // Validacao local simples
  if (password !== CAIXA_PASSWORD) {
        const err = new Error("Senha incorreta. Tente novamente.");
        // @ts-ignore
      err.status = 401;
        throw err;
  }
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    const token = "local-" + Math.random().toString(36).slice(2);
    writeSession(token, expiresAt);
    return { ok: true, expiresAt: new Date(expiresAt) };
}

export async function revokeSession() {
    clearSession();
}

export async function caixaData() {
    // No-op: nesta versao simples nao ha backend especifico do caixa.
  return null;
}

// -- React hook ----------------------------------------------------------

export function useCaixaSession() {
    const [unlocked,     setUnlocked]     = useState(() => !!readSession());
    const [expiresAt,    setExpiresAt]    = useState(() => readSession()?.expiresAt ?? null);
    const [expiresIn,    setExpiresIn]    = useState(null);
    const [loading,      setLoading]      = useState(false);
    const [error,        setError]        = useState(null);
    const [attemptsLeft, setAttemptsLeft] = useState(null);
    const [expiringSoon, setExpiringSoon] = useState(false);

  const timerRef = useRef(null);

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
        timerRef.current = setInterval(tick, 5000);
        return () => clearInterval(timerRef.current);
  }, [unlocked]);

  const unlock = useCallback(async (password) => {
        setLoading(true);
        setError(null);
        setAttemptsLeft(null);
        try {
                const { expiresAt: exp } = await attemptUnlock(password);
                setUnlocked(true);
                setExpiresAt(exp);
        } catch (e) {
                setError(e.message || "Erro ao desbloquear.");
                throw e;
        } finally {
                setLoading(false);
        }
  }, []);

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
