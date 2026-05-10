/**
 * src/lib/useRates.js
 * Hook standalone — para contextos onde FxProvider não está disponível.
 * Preferir useFx() (do FxContext) quando dentro da árvore do Provider.
 */

import { useState, useEffect, useCallback } from 'react';
import { fetchRates } from './fx.js';

/**
 * @param {{ refreshInterval?: number }} options
 * @returns {{ rates, loading, error, stale, fetchedAt, source, refresh }}
 */
export function useRates({ refreshInterval = 15 * 60 * 1000 } = {}) {
  const [state, setState] = useState({
    rates: null, loading: true, error: null,
    stale: false, fetchedAt: null, source: null,
  });

  const load = useCallback(async (force = false) => {
    setState(s => ({ ...s, loading: true }));
    try {
      const data = await fetchRates({ force });
      setState({
        rates:     { USD: data.USD, EUR: data.EUR },
        loading:   false, error: null,
        stale:     !!data.stale,
        fetchedAt: data.fetchedAt,
        source:    data.source,
      });
    } catch (e) {
      setState(s => ({ ...s, loading: false, error: e.message }));
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(false), refreshInterval);
    const onFocus = () => load(false);
    window.addEventListener('focus', onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [load, refreshInterval]);

  return { ...state, refresh: () => load(true) };
}
