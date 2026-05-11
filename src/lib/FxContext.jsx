/**
 * src/lib/FxContext.jsx
 *
 * Provider global de cotações. Wrapa a aplicação inteira para evitar
 * múltiplos fetches de componentes distintos.
 *
 * Props do FxProvider:
 *   uid?  — UID do usuário Firebase. Se fornecido:
 *           • Lê preferências (autoRefresh, intervalMin) do Firestore
 *           • Grava histórico das últimas 10 cotações
 *           • Persiste prefs ao alterá-las via setAutoRefresh / setIntervalMin
 *
 * Uso:
 *   // No App:
 *   <FxProvider uid={user?.uid}><AppContent/></FxProvider>
 *
 *   // Em qualquer componente:
 *   const { rates, loading, stale, refresh, autoRefresh, setAutoRefresh,
 *           intervalMin, setIntervalMin, history } = useFx();
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { fetchRates } from './fx.js';
import { getFxPrefs, setFxPrefs, getFxHistory, appendFxHistory } from '../../db.js';

const FxCtx = createContext(null);

const DEFAULT_PREFS = { autoRefresh: true, intervalMin: 15 };

const INITIAL = {
  rates:       null,
  loading:     true,
  error:       null,
  stale:       false,
  fetchedAt:   null,
  source:      null,
  fromCache:   false,
  isManual:    false,
  autoRefresh: true,
  intervalMin: 15,
  history:     [],
};

export function FxProvider({ children, uid }) {
  const [state,       setState]       = useState(INITIAL);
  const [autoRefresh, setAutoRefreshS] = useState(true);
  const [intervalMin, setIntervalMinS] = useState(15);
  const [history,     setHistory]     = useState([]);
  const timerRef = useRef(null);

  // ── Carregar prefs do Firestore ao montar / uid mudar ─────
  useEffect(() => {
    if (!uid) return;
    (async () => {
      const [prefs, hist] = await Promise.all([
        getFxPrefs(uid),
        getFxHistory(uid),
      ]);
      if (prefs) {
        if (typeof prefs.autoRefresh === 'boolean') setAutoRefreshS(prefs.autoRefresh);
        if (typeof prefs.intervalMin === 'number')  setIntervalMinS(prefs.intervalMin);
      }
      if (Array.isArray(hist)) setHistory(hist);
    })();
  }, [uid]);

  // ── Fetch ──────────────────────────────────────────────────
  const load = useCallback(async (force = false) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchRates({ force });
      if (!data) {
        setState(s => ({ ...s, loading: false, error: 'FX_UNAVAILABLE' }));
        return;
      }

      setState({
        rates:     { USD: data.USD, EUR: data.EUR },
        loading:   false,
        error:     null,
        stale:     !!data.stale,
        fetchedAt: data.fetchedAt,
        source:    data.source,
        fromCache: !!data.fromCache,
        isManual:  !!data.isManual,
      });

      // Gravar histórico apenas para fetches reais (não cache, não manual)
      if (!data.fromCache && !data.isManual && !data.stale && uid) {
        const record = {
          EUR:        data.EUR,
          USD:        data.USD,
          fetchedAt:  data.fetchedAt,
          source:     data.source,
          recordedAt: new Date().toISOString(),
        };
        appendFxHistory(uid, record); // fire-and-forget
        setHistory(prev => [record, ...prev].slice(0, 10));
      }
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message || 'FX_UNAVAILABLE' }));
    }
  }, [uid]);

  // ── Auto-refresh com intervalo dinâmico ───────────────────
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (!autoRefresh) return;

    const ms = intervalMin * 60 * 1000;
    timerRef.current = setInterval(() => {
      if (navigator.onLine) load(false);
    }, ms);

    return () => clearInterval(timerRef.current);
  }, [autoRefresh, intervalMin, load]);

  useEffect(() => {
    const onFocus  = () => { if (navigator.onLine && autoRefresh) load(false); };
    const onOnline = () => load(false);
    window.addEventListener('focus',  onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('focus',  onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [load, autoRefresh]);

  // ── Setters com persistência ──────────────────────────────
  const setAutoRefresh = useCallback((val) => {
    setAutoRefreshS(val);
    if (uid) setFxPrefs(uid, { autoRefresh: val, intervalMin });
  }, [uid, intervalMin]);

  const setIntervalMin = useCallback((val) => {
    setIntervalMinS(val);
    if (uid) setFxPrefs(uid, { autoRefresh, intervalMin: val });
  }, [uid, autoRefresh]);

  const value = {
    ...state,
    autoRefresh,
    intervalMin,
    history,
    setAutoRefresh,
    setIntervalMin,
    refresh: () => load(true),
    // Objeto compat: expõe { EUR, USD, eur, usd } para toBRL()
    ratesCompat: state.rates
      ? { EUR: state.rates.EUR, USD: state.rates.USD,
          eur: state.rates.EUR, usd: state.rates.USD }
      : { EUR: 0, USD: 0, eur: 0, usd: 0 },
  };

  return <FxCtx.Provider value={value}>{children}</FxCtx.Provider>;
}

export function useFx() {
  const ctx = useContext(FxCtx);
  if (!ctx) throw new Error('[useFx] Componente não está dentro de <FxProvider>.');
  return ctx;
}
