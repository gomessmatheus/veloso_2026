/**
 * src/lib/fx.js
 * Serviço puro de cotações cambiais. Sem dependência de React.
 *
 * 3 provedores em fallback:
 *   1. AwesomeAPI     — economia.awesomeapi.com.br (BR, sem registro)
 *   2. Frankfurter    — api.frankfurter.app (EU, sem limite publicado)
 *   3. ExchangeRate-API — open.er-api.com (global, 1500/mês free)
 *
 * Cache em localStorage com TTL de 15 min.
 * Se todas as APIs falharem, retorna o cache expirado (stale) ou override manual.
 */

const CACHE_KEY  = 'fx_cache_v1';
const MANUAL_KEY = 'fx_manual_v1';
export const TTL_MS = 15 * 60 * 1000; // 15 min

// ─── Cache ────────────────────────────────────────────────

export function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function writeCache(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(payload)); } catch {}
}

// ─── Override manual ──────────────────────────────────────

export function saveManualRates(USD, EUR) {
  const payload = {
    USD: Number(USD), EUR: Number(EUR),
    fetchedAt: Date.now(), source: 'manual',
  };
  try { localStorage.setItem(MANUAL_KEY, JSON.stringify(payload)); } catch {}
  writeCache(payload);
  return payload;
}

export function clearManualRates() {
  try { localStorage.removeItem(MANUAL_KEY); } catch {}
}

export function readManualRates() {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ─── Providers ────────────────────────────────────────────

async function fromAwesomeAPI() {
  const res = await fetch(
    'https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL',
    { cache: 'no-store', signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) throw new Error(`awesomeapi ${res.status}`);
  const d = await res.json();
  const USD = parseFloat(d.USDBRL?.bid);
  const EUR = parseFloat(d.EURBRL?.bid);
  if (!USD || !EUR) throw new Error('awesomeapi: bad data');
  return { USD, EUR, fetchedAt: Date.now(), source: 'awesomeapi' };
}

async function fromFrankfurter() {
  // 1 call: BRL como base, pede EUR e USD → inverte para obter BRL por moeda
  const res = await fetch(
    'https://api.frankfurter.app/latest?from=BRL&to=EUR,USD',
    { signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) throw new Error(`frankfurter ${res.status}`);
  const d   = await res.json();
  const EUR = d.rates?.EUR > 0 ? parseFloat((1 / d.rates.EUR).toFixed(6)) : null;
  const USD = d.rates?.USD > 0 ? parseFloat((1 / d.rates.USD).toFixed(6)) : null;
  if (!EUR || !USD) throw new Error('frankfurter: bad data');
  return { USD, EUR, fetchedAt: Date.now(), source: 'frankfurter' };
}

async function fromExchangeRateAPI() {
  const res = await fetch(
    'https://open.er-api.com/v6/latest/BRL',
    { signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) throw new Error(`er-api ${res.status}`);
  const d = await res.json();
  // rates são X por BRL — invertemos para obter BRL por X
  const USD = d.rates?.USD > 0 ? parseFloat((1 / d.rates.USD).toFixed(6)) : null;
  const EUR = d.rates?.EUR > 0 ? parseFloat((1 / d.rates.EUR).toFixed(6)) : null;
  if (!USD || !EUR) throw new Error('er-api: bad data');
  return { USD, EUR, fetchedAt: Date.now(), source: 'er-api' };
}

const PROVIDERS = [
  { name: 'awesomeapi', fn: fromAwesomeAPI },
  { name: 'frankfurter', fn: fromFrankfurter },
  { name: 'er-api', fn: fromExchangeRateAPI },
];

// ─── fetchRates ───────────────────────────────────────────

/**
 * Busca cotações USD e EUR em BRL.
 * Retorna { USD, EUR, fetchedAt, source, fromCache?, stale? }
 */
export async function fetchRates({ force = false } = {}) {
  // Verificar override manual primeiro
  const manual = readManualRates();
  if (manual) {
    return { ...manual, fromCache: true, isManual: true };
  }

  const cache = readCache();
  if (!force && cache && (Date.now() - cache.fetchedAt) < TTL_MS) {
    return { ...cache, fromCache: true };
  }

  // Tentar provedores em sequência
  const errors = [];
  for (const { name, fn } of PROVIDERS) {
    try {
      const data = await fn();
      writeCache(data);
      return { ...data, fromCache: false };
    } catch (e) {
      errors.push({ name, error: e.message });
      // Continua para o próximo provedor
    }
  }

  // Todos falharam — retornar stale ou null (nunca throw — callers não precisam de try/catch)
  if (cache) return { ...cache, stale: true, errors };
  return null;
}

// ─── Utilitários ──────────────────────────────────────────

/**
 * Converte amount de fromCurrency para toCurrency.
 * @param {number} amount
 * @param {'BRL'|'USD'|'EUR'} fromCurrency
 * @param {'BRL'|'USD'|'EUR'} toCurrency
 * @param {{ USD: number, EUR: number }|null|undefined} rates
 * @returns {number} Sempre um número; nunca NaN, null ou undefined (Princípio #9).
 */
export function convert(amount, fromCurrency, toCurrency, rates) {
  // Garante retorno numérico em qualquer caso (sem NaN na UI)
  const n = Number(amount);
  if (!n || isNaN(n)) return 0;
  if (fromCurrency === toCurrency) return n;

  const r = (cur) => Number(rates?.[cur] ?? 0);

  if (toCurrency === 'BRL') {
    const rate = r(fromCurrency);
    return rate > 0 ? n * rate : n;
  }
  if (fromCurrency === 'BRL') {
    const rate = r(toCurrency);
    return rate > 0 ? n / rate : n;
  }
  // Cruzada via BRL
  const fromRate = r(fromCurrency);
  const toRate   = r(toCurrency);
  if (!fromRate || !toRate) return n;
  return (n * fromRate) / toRate;
}

/** Formata número como moeda no locale pt-BR */
export function formatMoney(amount, currency = 'BRL') {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(amount || 0);
}

/** "há 8 min", "há 2h", "há 3d" */
export function formatRelativeTime(ms) {
  if (!ms) return '—';
  const diff = Date.now() - ms;
  const min  = Math.floor(diff / 60000);
  if (min < 1)  return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24)   return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

/** Formata cotação: 5.8034 → "R$ 5,80" */
export function formatRate(rate) {
  if (!rate) return '—';
  return `R$ ${Number(rate).toFixed(2).replace('.', ',')}`;
}

/**
 * Calcula variação % entre cotação atual e cotação travada na assinatura.
 *
 * Garante Princípio #9 — nunca retorna NaN, Infinity ou 0% quando lockedRate
 * é nulo (o que indicaria "sem variação" erroneamente).
 *
 * @param {number|null|undefined} currentRate  — cotação atual (ex: 6.40)
 * @param {number|null|undefined} lockedRate   — cotação travada (ex: 5.80)
 * @returns {number|null}
 *   - null  se qualquer argumento for nulo/zero/inválido
 *   - number (ex: 10.34) se ambos forem válidos — sem toFixed, caller formata
 */
export function calcLockedVariation(currentRate, lockedRate) {
  const c = Number(currentRate);
  const l = Number(lockedRate);
  if (!c || !l || isNaN(c) || isNaN(l) || l === 0) return null;
  return ((c - l) / l) * 100;
}

// ─── Aliases (nomes alternativos para compatibilidade com spec) ────
/** @alias saveManualRates */
export const saveManualOverride  = saveManualRates;
/** @alias clearManualRates */
export const clearManualOverride = clearManualRates;
