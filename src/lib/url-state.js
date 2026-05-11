/**
 * src/lib/url-state.js
 *
 * Hook para sincronizar estado React com window.location.search.
 * Usa history.replaceState (sem reload). Reage a popstate (voltar/avançar).
 *
 * Compatível com ESM, sem dependências externas.
 */

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Sincroniza um valor React com uma chave em window.location.search.
 *
 * - Valores iguais ao defaultValue NÃO aparecem na URL (mantém a URL limpa).
 * - Suporta functional updates: setValue(prev => prev + 1).
 * - Suporta serialize/parse customizados (ex.: número, date-offset).
 * - Reage a popstate do navegador (voltar/avançar refletem no state).
 *
 * @template T
 * @param {string}   key           Chave na querystring (ex.: "caixa_tab")
 * @param {T}        defaultValue  Valor padrão quando a chave está ausente
 * @param {{ serialize?: (v: T) => string, parse?: (raw: string) => T | null }} [opts]
 * @returns {[T, (v: T | ((prev: T) => T)) => void]}
 *
 * @example
 *   const [tab, setTab] = useQueryState("caixa_tab", "dash");
 *   const [offset, setOffset] = useQueryState("caixa_mes", 0, {
 *     serialize: offsetToYYYYMM,
 *     parse:     yyyymmToOffset,
 *   });
 */
export function useQueryState(key, defaultValue, opts = {}) {
  const {
    serialize = (v) => (v == null ? "" : String(v)),
    parse     = (v) => /** @type {T} */ (v),
  } = opts;

  // Snapshot actual parse/serialize into refs so callbacks never go stale
  const serRef = useRef(serialize);
  const parRef = useRef(parse);
  serRef.current = serialize;
  parRef.current = parse;

  const readFromUrl = useCallback(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get(key);
      if (raw == null) return defaultValue;
      const parsed = parRef.current(raw);
      return parsed != null ? parsed : defaultValue;
    } catch {
      return defaultValue;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]); // defaultValue intentionally omitted (should be stable)

  const [value, setValueRaw] = useState(readFromUrl);

  // Keep a ref so functional updates can read current value without re-binding setValue
  const valueRef = useRef(value);
  valueRef.current = value;

  // React to browser back/forward
  useEffect(() => {
    const handler = () => setValueRaw(readFromUrl());
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [readFromUrl]);

  const setValue = useCallback((newValOrFn) => {
    const next = typeof newValOrFn === "function"
      ? newValOrFn(valueRef.current)
      : newValOrFn;

    setValueRaw(next);

    const params = new URLSearchParams(window.location.search);
    const serialized = serRef.current(next);

    // Remove key when value equals default or serialized is empty
    if (next === defaultValue || !serialized || serialized === serRef.current(defaultValue)) {
      params.delete(key);
    } else {
      params.set(key, serialized);
    }

    const qs = params.toString();
    history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]); // defaultValue intentionally omitted

  return [value, setValue];
}
