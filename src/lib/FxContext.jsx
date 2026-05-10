/**
 * src/lib/FxContext.jsx
 * Provider global de cotações. Wrapa a aplicação inteira para evitar
 * múltiplos fetches de componentes distintos.
 *
 * Uso:
 *   // No App root:
 *   <FxProvider><App/></FxProvider>
 *
 *   // Em qualquer componente:
 *   const { rates, loading, stale, fetchedAt, refresh } = useFx();
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchRates } from './fx.js';

const FxCtx = createContext(null);

const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 min

const INITIAL = {
  rates:     null,   // { USD: number, EUR: number }
  loading:   true,
  error:     null,
  stale:     false,
  fetchedAt: null,
  source:    null,
  fromCache: false,
  isManual:  false,
};

export function FxProvider({ children }) {
  const [state, setState] = useState(INITIAL);

  const load = useCallback(async (force = false) => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const data = await fetchRates({ force });
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
    } catch (e) {
      setState(s => ({
        ...s, loading: false,
        error: e.message || 'FX_UNAVAILABLE',
      }));
    }
  }, []);

  useEffect(() => {
    load();

    // Auto-refresh periódico
    const id = setInterval(() => {
      if (navigator.onLine) load(false);
    }, REFRESH_INTERVAL);

    // Refresh ao recuperar foco ou conectividade
    const onFocus  = () => { if (navigator.onLine) load(false); };
    const onOnline = () => load(false);

    window.addEventListener('focus',  onFocus);
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(id);
      window.removeEventListener('focus',  onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [load]);

  const value = {
    ...state,
    refresh: () => load(true),
    // Objeto de compatibilidade com toBRL({ eur, usd }) existente
    // + novo formato ISO ({ EUR, USD })
    ratesCompat: state.rates
      ? {
          EUR: state.rates.EUR, USD: state.rates.USD,
          eur: state.rates.EUR, usd: state.rates.USD, // retrocompat
        }
      : { EUR: 0, USD: 0, eur: 0, usd: 0 },
  };

  return <FxCtx.Provider value={value}>{children}</FxCtx.Provider>;
}

/** Hook para consumir cotações em qualquer componente. */
export function useFx() {
  const ctx = useContext(FxCtx);
  if (!ctx) throw new Error('[useFx] Componente não está dentro de <FxProvider>.');
  return ctx;
}
