/**
 * src/lib/fx.test.js
 *
 * Cobertura obrigatória (Princípio #2):
 *   - Cache: read/write/TTL/corrupção
 *   - Manual override: save/read/clear
 *   - fetchRates: cache hit, stale, force, fallback entre provedores,
 *     stale-on-all-fail, throw quando sem cache
 *   - convert: todos os pares de moeda, edge cases (null, 0, taxa ausente)
 *   - Formatters: formatRelativeTime, formatRate, formatMoney
 *
 * Para rodar:
 *   npx vitest run src/lib/fx.test.js
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  readCache,
  writeCache,
  saveManualRates,
  clearManualRates,
  readManualRates,
  fetchRates,
  convert,
  formatMoney,
  formatRelativeTime,
  formatRate,
  TTL_MS,
} from './fx.js';

// ─── Mocks globais ─────────────────────────────────────────────

/** localStorage isolado por test */
let _store = {};
const lsMock = {
  getItem:    (k)    => _store[k] ?? null,
  setItem:    (k, v) => { _store[k] = String(v); },
  removeItem: (k)    => { delete _store[k]; },
  clear:      ()     => { _store = {}; },
};
vi.stubGlobal('localStorage', lsMock);

/** AbortSignal.timeout polyfill para jsdom/Node < 20 */
if (!globalThis.AbortSignal?.timeout) {
  globalThis.AbortSignal = Object.assign(globalThis.AbortSignal ?? {}, {
    timeout: () => new AbortController().signal,
  });
}

beforeEach(() => {
  _store = {};
  vi.restoreAllMocks();
});

// ─── Helpers de fixture ────────────────────────────────────────

const FRESH_CACHE = {
  USD: 5.92, EUR: 6.40,
  fetchedAt: Date.now(),
  source: 'awesomeapi',
};

const STALE_CACHE = {
  USD: 5.80, EUR: 6.30,
  fetchedAt: Date.now() - TTL_MS - 5_000, // 5s além do TTL
  source: 'awesomeapi',
};

const RATES = { USD: 5.92, EUR: 6.40 };

// Mock response factories
const mockAwesomeAPIRes = (USD = 5.92, EUR = 6.40) => ({
  ok: true,
  json: async () => ({
    USDBRL: { bid: String(USD) },
    EURBRL: { bid: String(EUR) },
  }),
});

const mockFrankfurterRes = (value) => ({
  ok: true,
  json: async () => ({ rates: { BRL: value } }),
});

const mockERAPIRes = (usdFraction = 0.169, eurFraction = 0.156) => ({
  ok: true,
  json: async () => ({
    rates: { USD: usdFraction, EUR: eurFraction }, // BRL-base → invertido em fx.js
  }),
});

// ─────────────────────────────────────────────────────────────────
// 1. Cache
// ─────────────────────────────────────────────────────────────────

describe('readCache / writeCache', () => {
  it('retorna null quando cache vazio', () => {
    expect(readCache()).toBeNull();
  });

  it('round-trip: o que gravou, lê igual', () => {
    writeCache(FRESH_CACHE);
    expect(readCache()).toMatchObject({ USD: 5.92, EUR: 6.40, source: 'awesomeapi' });
  });

  it('retorna null se JSON corrompido', () => {
    _store['fx_cache_v1'] = 'não-é-json{{{';
    expect(readCache()).toBeNull();
  });

  it('writeCache não lança exceção se localStorage cheio', () => {
    lsMock.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => writeCache(FRESH_CACHE)).not.toThrow();
    // restaurar
    lsMock.setItem = (k, v) => { _store[k] = String(v); };
  });
});

// ─────────────────────────────────────────────────────────────────
// 2. Manual override
// ─────────────────────────────────────────────────────────────────

describe('saveManualRates / clearManualRates / readManualRates', () => {
  it('salva e lê override manual', () => {
    const result = saveManualRates(5.50, 6.00);
    expect(result).toMatchObject({ USD: 5.50, EUR: 6.00, source: 'manual' });
    expect(readManualRates()).toMatchObject({ USD: 5.50, EUR: 6.00 });
  });

  it('clearManualRates remove o override', () => {
    saveManualRates(5.50, 6.00);
    clearManualRates();
    expect(readManualRates()).toBeNull();
  });

  it('override substitui cache no fetchRates (sem fetch)', async () => {
    saveManualRates(5.50, 6.00);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchRates();
    expect(result.isManual).toBe(true);
    expect(result.USD).toBe(5.50);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('após clearManualRates, fetchRates volta a buscar API', async () => {
    saveManualRates(5.50, 6.00);
    clearManualRates();
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockAwesomeAPIRes());
    const result = await fetchRates({ force: true });
    expect(result.isManual).toBeUndefined();
    expect(result.source).toBe('awesomeapi');
  });
});

// ─────────────────────────────────────────────────────────────────
// 3. fetchRates — cache behavior
// ─────────────────────────────────────────────────────────────────

describe('fetchRates — cache', () => {
  it('retorna do cache quando fresco, sem chamar fetch', async () => {
    writeCache(FRESH_CACHE);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const result = await fetchRates();
    expect(result.fromCache).toBe(true);
    expect(result.USD).toBe(5.92);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('busca API quando cache está expirado', async () => {
    writeCache(STALE_CACHE);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockAwesomeAPIRes(5.92, 6.40));
    const result = await fetchRates();
    expect(result.fromCache).toBe(false);
    expect(result.USD).toBeCloseTo(5.92);
  });

  it('force=true ignora cache fresco', async () => {
    writeCache(FRESH_CACHE);
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockAwesomeAPIRes(5.95, 6.45));
    const result = await fetchRates({ force: true });
    expect(result.fromCache).toBe(false);
    expect(result.USD).toBeCloseTo(5.95);
  });

  it('grava no cache após fetch bem-sucedido', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockAwesomeAPIRes(5.92, 6.40));
    await fetchRates({ force: true });
    const cached = readCache();
    expect(cached).not.toBeNull();
    expect(cached.USD).toBeCloseTo(5.92);
  });
});

// ─────────────────────────────────────────────────────────────────
// 4. fetchRates — fallback de provedores
// ─────────────────────────────────────────────────────────────────

describe('fetchRates — fallback entre provedores', () => {
  it('usa AwesomeAPI quando disponível', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(mockAwesomeAPIRes(5.92, 6.40));
    const result = await fetchRates({ force: true });
    expect(result.source).toBe('awesomeapi');
    expect(result.USD).toBeCloseTo(5.92);
    expect(result.EUR).toBeCloseTo(6.40);
  });

  it('cai para Frankfurter quando AwesomeAPI falha', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('awesomeapi down'))  // AwesomeAPI
      .mockResolvedValueOnce(mockFrankfurterRes(6.42))      // Frankfurter EUR
      .mockResolvedValueOnce(mockFrankfurterRes(5.93));     // Frankfurter USD
    const result = await fetchRates({ force: true });
    expect(result.source).toBe('frankfurter');
    expect(result.EUR).toBeCloseTo(6.42);
    expect(result.USD).toBeCloseTo(5.93);
  });

  it('cai para ExchangeRate-API quando AwesomeAPI e Frankfurter falham', async () => {
    // USD/BRL = 1/0.169 ≈ 5.92; EUR/BRL = 1/0.156 ≈ 6.41
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('awesomeapi down'))
      .mockRejectedValueOnce(new Error('frankfurter down'))
      .mockRejectedValueOnce(new Error('frankfurter down'))
      .mockResolvedValueOnce(mockERAPIRes(0.169, 0.156));
    const result = await fetchRates({ force: true });
    expect(result.source).toBe('er-api');
    expect(result.USD).toBeGreaterThan(5);
    expect(result.EUR).toBeGreaterThan(5);
  });

  it('retorna cache stale quando TODOS os provedores falham', async () => {
    writeCache(STALE_CACHE);
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sem rede'));
    const result = await fetchRates({ force: true });
    expect(result.stale).toBe(true);
    expect(result.USD).toBe(5.80);
    expect(result.source).toBe('awesomeapi');
  });

  it('lança FX_UNAVAILABLE quando todos falham e não há cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sem rede'));
    await expect(fetchRates({ force: true })).rejects.toThrow('FX_UNAVAILABLE');
  });

  it('AwesomeAPI com resposta 4xx aciona fallback (não lança)', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce({ ok: false, status: 429 })   // AwesomeAPI 429
      .mockResolvedValueOnce(mockFrankfurterRes(6.40))      // Frankfurter EUR
      .mockResolvedValueOnce(mockFrankfurterRes(5.92));     // Frankfurter USD
    const result = await fetchRates({ force: true });
    expect(result.source).toBe('frankfurter');
  });
});

// ─────────────────────────────────────────────────────────────────
// 5. convert
// ─────────────────────────────────────────────────────────────────

describe('convert', () => {
  it('mesma moeda retorna o mesmo valor', () => {
    expect(convert(100, 'BRL', 'BRL', RATES)).toBe(100);
    expect(convert(50,  'USD', 'USD', RATES)).toBe(50);
    expect(convert(30,  'EUR', 'EUR', RATES)).toBe(30);
  });

  it('EUR → BRL: multiplica pela taxa EUR', () => {
    expect(convert(1_000, 'EUR', 'BRL', RATES)).toBeCloseTo(6_400);
  });

  it('USD → BRL: multiplica pela taxa USD', () => {
    expect(convert(1_000, 'USD', 'BRL', RATES)).toBeCloseTo(5_920);
  });

  it('BRL → EUR: divide pela taxa EUR', () => {
    expect(convert(6_400, 'BRL', 'EUR', RATES)).toBeCloseTo(1_000);
  });

  it('BRL → USD: divide pela taxa USD', () => {
    expect(convert(5_920, 'BRL', 'USD', RATES)).toBeCloseTo(1_000);
  });

  it('USD → EUR (cruzada via BRL)', () => {
    // 100 USD × 5.92 / 6.40 ≈ 92.5 EUR
    const expected = 100 * 5.92 / 6.40;
    expect(convert(100, 'USD', 'EUR', RATES)).toBeCloseTo(expected, 2);
  });

  it('EUR → USD (cruzada via BRL)', () => {
    const expected = 100 * 6.40 / 5.92;
    expect(convert(100, 'EUR', 'USD', RATES)).toBeCloseTo(expected, 2);
  });

  it('retorna 0 para amount === 0', () => {
    expect(convert(0, 'EUR', 'BRL', RATES)).toBe(0);
  });

  it('retorna 0 para amount === null (sem NaN na UI)', () => {
    // Princípio #9: nunca renderizar NaN — convert deve retornar 0
    expect(convert(null, 'EUR', 'BRL', RATES)).toBe(0);
  });

  it('retorna 0 para amount === undefined', () => {
    expect(convert(undefined, 'EUR', 'BRL', RATES)).toBe(0);
  });

  it('moeda desconhecida não lança exceção, retorna amount', () => {
    expect(() => convert(100, 'GBP', 'BRL', RATES)).not.toThrow();
    expect(convert(100, 'GBP', 'BRL', RATES)).toBe(100);
  });

  it('taxa zero não causa divisão por zero (BRL → USD com USD=0)', () => {
    const badRates = { USD: 0, EUR: 6.40 };
    expect(() => convert(100, 'BRL', 'USD', badRates)).not.toThrow();
    const result = convert(100, 'BRL', 'USD', badRates);
    expect(isNaN(result)).toBe(false);
    expect(isFinite(result) || result === 100).toBe(true);
  });

  it('rates undefined não lança exceção', () => {
    expect(() => convert(100, 'EUR', 'BRL', undefined)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────
// 6. formatRelativeTime
// ─────────────────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  it('retorna "—" para null', () => expect(formatRelativeTime(null)).toBe('—'));
  it('retorna "—" para undefined', () => expect(formatRelativeTime(undefined)).toBe('—'));
  it('retorna "—" para 0', () => expect(formatRelativeTime(0)).toBe('—'));

  it('retorna "agora" para menos de 1 minuto', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('agora');
    expect(formatRelativeTime(Date.now() - 59_000)).toBe('agora');
  });

  it('retorna "há X min" para menos de 60 minutos', () => {
    expect(formatRelativeTime(Date.now() - 8 * 60_000)).toBe('há 8 min');
    expect(formatRelativeTime(Date.now() - 1 * 60_000)).toBe('há 1 min');
    expect(formatRelativeTime(Date.now() - 59 * 60_000)).toBe('há 59 min');
  });

  it('retorna "há Xh" para menos de 24 horas', () => {
    expect(formatRelativeTime(Date.now() - 3 * 3_600_000)).toBe('há 3h');
    expect(formatRelativeTime(Date.now() - 1 * 3_600_000)).toBe('há 1h');
    expect(formatRelativeTime(Date.now() - 23 * 3_600_000)).toBe('há 23h');
  });

  it('retorna "há Xd" para 24h ou mais', () => {
    expect(formatRelativeTime(Date.now() - 2 * 86_400_000)).toBe('há 2d');
    expect(formatRelativeTime(Date.now() - 1 * 86_400_000)).toBe('há 1d');
  });
});

// ─────────────────────────────────────────────────────────────────
// 7. formatRate
// ─────────────────────────────────────────────────────────────────

describe('formatRate', () => {
  it('retorna "—" para null', () => expect(formatRate(null)).toBe('—'));
  it('retorna "—" para undefined', () => expect(formatRate(undefined)).toBe('—'));
  it('retorna "—" para 0', () => expect(formatRate(0)).toBe('—'));

  it('formata com 2 casas e vírgula', () => {
    expect(formatRate(5.9234)).toBe('R$ 5,92');
    expect(formatRate(6.40)).toBe('R$ 6,40');
    expect(formatRate(5.90)).toBe('R$ 5,90');
  });

  it('arredonda corretamente (não trunca)', () => {
    expect(formatRate(5.925)).toBe('R$ 5,93'); // arredondamento padrão
  });
});

// ─────────────────────────────────────────────────────────────────
// 8. formatMoney
// ─────────────────────────────────────────────────────────────────

describe('formatMoney', () => {
  it('formata BRL corretamente', () => {
    const r = formatMoney(1_500, 'BRL');
    expect(r).toMatch(/R\$\s*1\.500/);
  });

  it('formata zero sem NaN', () => {
    const r = formatMoney(0, 'BRL');
    expect(r).not.toContain('NaN');
    expect(r).toMatch(/R\$\s*0/);
  });

  it('null não lança exceção e não exibe NaN', () => {
    expect(() => formatMoney(null, 'BRL')).not.toThrow();
    expect(formatMoney(null, 'BRL')).not.toContain('NaN');
  });

  it('undefined não lança exceção e não exibe NaN', () => {
    expect(() => formatMoney(undefined, 'BRL')).not.toThrow();
    expect(formatMoney(undefined, 'BRL')).not.toContain('NaN');
  });

  it('formata EUR com símbolo correto', () => {
    const r = formatMoney(2_600, 'EUR');
    expect(r).toContain('2.600');
  });

  it('formata USD com símbolo correto', () => {
    const r = formatMoney(1_000, 'USD');
    expect(r).toContain('1.000');
  });
});
