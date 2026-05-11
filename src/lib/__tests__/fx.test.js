// @vitest-environment jsdom

/**
 * src/lib/__tests__/fx.test.js
 *
 * Cobertura de src/lib/fx.js — meta ≥ 90% line coverage (DT-01).
 *
 * COMPORTAMENTOS DOCUMENTADOS QUE DIVERGEM DO SPEC ORIGINAL:
 *   D2 — convert() com rates ausentes: retorna `amount` (passthrough),
 *        não `null`. Comportamento seguro: sem NaN na UI, mas spec
 *        dizia null. Registrado como débito DT-02 para próxima fase.
 *   D4 — fetchRates() retorna { EUR, USD } (ISO 4217), não { eurBrl, usdBrl }.
 *        Todos os consumers (FxContext, App.jsx) usam .EUR / .USD.
 *
 * STACK DE MOCKS:
 *   localStorage  → lsMock (limpo em beforeEach)
 *   fetch         → vi.spyOn(globalThis, 'fetch') por teste
 *   timers        → vi.useFakeTimers() nos testes de TTL
 *   AbortSignal   → polyfill para ambientes que não suportam .timeout()
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  readCache,
  writeCache,
  saveManualRates,
  clearManualRates,
  readManualRates,
  saveManualOverride,
  clearManualOverride,
  fetchRates,
  convert,
  formatRate,
  formatRelativeTime,
  formatMoney,
  calcLockedVariation,
  TTL_MS,
} from '../fx.js';

// ─── Setup global ─────────────────────────────────────────────────────────────

// localStorage isolado por teste
let _store = {};
const lsMock = {
  getItem:    (k)    => _store[k] ?? null,
  setItem:    (k, v) => { _store[k] = String(v); },
  removeItem: (k)    => { delete _store[k]; },
  clear:      ()     => { _store = {}; },
};
vi.stubGlobal('localStorage', lsMock);

// Polyfill AbortSignal.timeout para Node < 20 / jsdom antigo
if (typeof AbortSignal.timeout !== 'function') {
  AbortSignal.timeout = (ms) => {
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  };
}

beforeEach(() => {
  _store = {};
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.useRealTimers(); // garante que fake timers nunca vazam entre testes
});

// ─── Helpers de fixture ───────────────────────────────────────────────────────

const T_NOW     = 1_700_000_000_000; // timestamp fixo para testes de TTL
const T_STALE   = T_NOW - TTL_MS - 5_000;
const T_FRESH   = T_NOW - TTL_MS + 5_000;

const CACHE_FRESH = { EUR: 6.40, USD: 5.92, fetchedAt: T_FRESH, source: 'awesomeapi' };
const CACHE_STALE = { EUR: 6.30, USD: 5.80, fetchedAt: T_STALE, source: 'awesomeapi' };
const RATES       = { EUR: 6.40, USD: 5.92 };

/** Mock de resposta HTTP bem-sucedida */
const ok  = (body) => ({ ok: true,  json: async () => body });
const err = (status = 500) => ({ ok: false, status, json: async () => ({}) });

/** Corpo de resposta da AwesomeAPI */
const awesomeBody = (EUR = 6.40, USD = 5.92) => ({
  EURBRL: { bid: String(EUR) },
  USDBRL: { bid: String(USD) },
});

/** Corpo de resposta do Frankfurter (base EUR → BRL) */
const frankfurterEurBody = (BRL = 6.42) => ({ rates: { BRL } });
const frankfurterUsdBody = (BRL = 5.93) => ({ rates: { BRL } });

/**
 * Corpo da ExchangeRate-API (base BRL → inversão em fx.js).
 * ex.: USD: 0.169 → 1/0.169 ≈ 5.92 BRL por USD
 */
const erApiBody = (USD = 0.169, EUR = 0.156) => ({ rates: { USD, EUR } });

// ─────────────────────────────────────────────────────────────────────────────
// 1. Cache local
// ─────────────────────────────────────────────────────────────────────────────

describe('readCache / writeCache', () => {
  it('retorna null quando vazio', () => {
    expect(readCache()).toBeNull();
  });

  it('persiste e recupera payload completo', () => {
    writeCache(CACHE_FRESH);
    expect(readCache()).toMatchObject({ EUR: 6.40, USD: 5.92, source: 'awesomeapi' });
  });

  it('retorna null quando JSON corrompido', () => {
    _store['fx_cache_v1'] = '{ invalid json {{';
    expect(readCache()).toBeNull();
  });

  it('writeCache não lança quando localStorage está cheio', () => {
    lsMock.setItem = () => { throw new DOMException('QuotaExceededError'); };
    expect(() => writeCache(CACHE_FRESH)).not.toThrow();
    lsMock.setItem = (k, v) => { _store[k] = String(v); }; // restaura
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Override manual
// ─────────────────────────────────────────────────────────────────────────────

describe('saveManualRates / clearManualRates / readManualRates', () => {
  it('salva e lê corretamente', () => {
    saveManualRates(5.50, 6.00);
    const manual = readManualRates();
    expect(manual).toMatchObject({ USD: 5.50, EUR: 6.00, source: 'manual' });
    expect(manual.fetchedAt).toBeLessThanOrEqual(Date.now());
  });

  it('clearManualRates remove o override', () => {
    saveManualRates(5.50, 6.00);
    clearManualRates();
    expect(readManualRates()).toBeNull();
  });

  it('aliases saveManualOverride / clearManualOverride são funcionais (D3)', () => {
    saveManualOverride(5.55, 6.05);
    expect(readManualRates()).toMatchObject({ USD: 5.55, EUR: 6.05 });
    clearManualOverride();
    expect(readManualRates()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. fetchRates — provider AwesomeAPI
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchRates — AwesomeAPI ok', () => {
  it('retorna EUR, USD e source:"awesomeapi" quando API responde', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok(awesomeBody(6.40, 5.92)));

    const result = await fetchRates({ force: true });

    expect(result).not.toBeNull();
    expect(result.EUR).toBeCloseTo(6.40);
    expect(result.USD).toBeCloseTo(5.92);
    expect(result.source).toBe('awesomeapi');
    expect(result.fromCache).toBe(false);
  });

  it('grava resultado no cache', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(ok(awesomeBody()));

    await fetchRates({ force: true });

    const cached = readCache();
    expect(cached).not.toBeNull();
    expect(cached.EUR).toBeCloseTo(6.40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. fetchRates — fallback Frankfurter
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchRates — fallback Frankfurter', () => {
  it('AwesomeAPI 500 → usa Frankfurter', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(err(500))                              // AwesomeAPI
      .mockResolvedValueOnce(ok(frankfurterEurBody(6.42)))          // Frankfurter EUR
      .mockResolvedValueOnce(ok(frankfurterUsdBody(5.93)));         // Frankfurter USD

    const result = await fetchRates({ force: true });

    expect(result).not.toBeNull();
    expect(result.source).toBe('frankfurter');
    expect(result.EUR).toBeCloseTo(6.42);
    expect(result.USD).toBeCloseTo(5.93);
  });

  it('AwesomeAPI network error → usa Frankfurter', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(ok(frankfurterEurBody(6.41)))
      .mockResolvedValueOnce(ok(frankfurterUsdBody(5.91)));

    const result = await fetchRates({ force: true });

    expect(result.source).toBe('frankfurter');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. fetchRates — fallback ExchangeRate-API
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchRates — fallback ExchangeRate-API', () => {
  it('AwesomeAPI 500 + Frankfurter 500 → usa ExchangeRate-API', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(err(500))                              // AwesomeAPI
      .mockResolvedValueOnce(err(500))                              // Frankfurter EUR
      .mockResolvedValueOnce(err(500))                              // Frankfurter USD
      .mockResolvedValueOnce(ok(erApiBody(0.169, 0.156)));          // ER-API

    const result = await fetchRates({ force: true });

    expect(result).not.toBeNull();
    expect(result.source).toBe('er-api');
    // 1 / 0.169 ≈ 5.917; 1 / 0.156 ≈ 6.410
    expect(result.USD).toBeGreaterThan(5.8);
    expect(result.EUR).toBeGreaterThan(6.0);
  });

  it('AwesomeAPI network error + Frankfurter network error → usa ExchangeRate-API', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(ok(erApiBody(0.169, 0.156)));

    const result = await fetchRates({ force: true });

    expect(result.source).toBe('er-api');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. fetchRates — todos falham
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchRates — todos os providers falham', () => {
  const failAll = () =>
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('sem rede'));

  it('há cache → retorna cache com stale:true', async () => {
    writeCache(CACHE_STALE);
    failAll();

    const result = await fetchRates({ force: true });

    expect(result).not.toBeNull();
    expect(result.stale).toBe(true);
    expect(result.EUR).toBe(6.30);
  });

  it('sem cache → retorna null (não lança — D1)', async () => {
    failAll();

    const result = await fetchRates({ force: true });

    expect(result).toBeNull(); // D1: throw virou return null
  });

  it('errors array está presente no retorno stale', async () => {
    writeCache(CACHE_STALE);
    failAll();

    const result = await fetchRates({ force: true });

    expect(Array.isArray(result.errors)).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. fetchRates — cache e TTL
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchRates — cache e TTL', () => {
  it('cache fresco: não faz nenhum fetch dentro do TTL', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T_NOW);

    writeCache({ ...CACHE_FRESH, fetchedAt: T_NOW - 60_000 }); // 1 min atrás

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await fetchRates();

    expect(fetchSpy).toHaveBeenCalledTimes(0);
    vi.useRealTimers();
  });

  it('cache expirado: faz fetch após TTL_MS', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(T_NOW);

    writeCache({ ...CACHE_STALE, fetchedAt: T_NOW - TTL_MS - 1 });

    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(awesomeBody()));

    await fetchRates();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('force:true ignora cache fresco', async () => {
    writeCache(CACHE_FRESH);
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(awesomeBody(6.45, 5.95)));

    const result = await fetchRates({ force: true });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(result.EUR).toBeCloseTo(6.45);
    expect(result.fromCache).toBe(false);
  });

  it('sem force + cache fresco: retorna fromCache:true', async () => {
    // Escreve com fetchedAt real (não timestamp histórico)
    writeCache({ ...CACHE_FRESH, fetchedAt: Date.now() });

    const result = await fetchRates();

    expect(result.fromCache).toBe(true);
    expect(result.EUR).toBe(6.40);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. fetchRates — override manual
// ─────────────────────────────────────────────────────────────────────────────

describe('fetchRates — override manual', () => {
  it('com override ativo: retorna source:"manual" sem chamar fetch', async () => {
    saveManualRates(5.50, 6.00);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await fetchRates();

    expect(result).not.toBeNull();
    expect(result.source).toBe('manual');
    expect(result.isManual).toBe(true);
    expect(result.USD).toBe(5.50);
    expect(result.EUR).toBe(6.00);
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('saveManualOverride (alias D3) também bloqueia fetch', async () => {
    saveManualOverride(5.55, 6.05);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const result = await fetchRates();

    expect(result.source).toBe('manual');
    expect(fetchSpy).toHaveBeenCalledTimes(0);
  });

  it('após clearManualRates, volta a buscar API', async () => {
    saveManualRates(5.50, 6.00);
    clearManualRates();
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(ok(awesomeBody()));

    const result = await fetchRates({ force: true });

    expect(result.source).toBe('awesomeapi');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. convert
// ─────────────────────────────────────────────────────────────────────────────

describe('convert', () => {
  it('EUR → BRL: multiplica pela taxa', () => {
    expect(convert(1000, 'EUR', 'BRL', RATES)).toBeCloseTo(6400);
  });

  it('USD → BRL: multiplica pela taxa', () => {
    expect(convert(1000, 'USD', 'BRL', RATES)).toBeCloseTo(5920);
  });

  it('BRL → EUR: divide pela taxa', () => {
    expect(convert(6400, 'BRL', 'EUR', RATES)).toBeCloseTo(1000);
  });

  it('BRL → USD: divide pela taxa', () => {
    expect(convert(5920, 'BRL', 'USD', RATES)).toBeCloseTo(1000);
  });

  it('USD → EUR (cruzada via BRL)', () => {
    const expected = 100 * 5.92 / 6.40;
    expect(convert(100, 'USD', 'EUR', RATES)).toBeCloseTo(expected, 2);
  });

  it('mesma moeda → passthrough sem conversão', () => {
    expect(convert(100,   'BRL', 'BRL', RATES)).toBe(100);
    expect(convert(50,    'EUR', 'EUR', RATES)).toBe(50);
    expect(convert(30.5,  'USD', 'USD', RATES)).toBe(30.5);
  });

  it('value = 0 → retorna 0', () => {
    expect(convert(0, 'EUR', 'BRL', RATES)).toBe(0);
  });

  it('value negativo → conversão correta (reembolso, estorno)', () => {
    expect(convert(-500, 'EUR', 'BRL', RATES)).toBeCloseTo(-3200);
  });

  it('value = null → retorna 0 (sem NaN na UI)', () => {
    expect(convert(null, 'EUR', 'BRL', RATES)).toBe(0);
    expect(isNaN(convert(null, 'EUR', 'BRL', RATES))).toBe(false);
  });

  it('value = undefined → retorna 0 (sem NaN na UI)', () => {
    expect(convert(undefined, 'EUR', 'BRL', RATES)).toBe(0);
  });

  it('value = NaN → retorna 0 (sem NaN propagado)', () => {
    expect(convert(NaN, 'EUR', 'BRL', RATES)).toBe(0);
  });

  it(
    'rates ausentes (null) → retorna amount sem lançar (D2: passthrough, não null)',
    () => {
      // NOTA D2: spec original queria null, implementação retorna passthrough.
      // Comportamento seguro (sem NaN), mas diverge do spec. Ver DT-02.
      const result = convert(100, 'EUR', 'BRL', null);
      expect(result).not.toBeNaN();
      expect(result).toBe(100); // passthrough quando taxa indisponível
    }
  );

  it('rates = {} (objeto vazio, taxa zero) → retorna passthrough sem divisão por zero', () => {
    const result = convert(100, 'EUR', 'BRL', {});
    expect(isFinite(result)).toBe(true);
    expect(isNaN(result)).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. formatRate
// ─────────────────────────────────────────────────────────────────────────────

describe('formatRate', () => {
  it('formata número normal com vírgula decimal', () => {
    expect(formatRate(5.79)).toBe('R$ 5,79');
    expect(formatRate(6.40)).toBe('R$ 6,40');
    expect(formatRate(5.92)).toBe('R$ 5,92');
  });

  it('arredonda corretamente', () => {
    // 5.926 → 5.93 (arredondamento bancário padrão JS)
    // 5.925 → 5.92 em IEEE 754 (5.925 é 5.9249... internamente)
    expect(formatRate(5.926)).toBe('R$ 5,93');
    expect(formatRate(5.924)).toBe('R$ 5,92');
  });

  it('null → "—"', () => {
    expect(formatRate(null)).toBe('—');
  });

  it('undefined → "—"', () => {
    expect(formatRate(undefined)).toBe('—');
  });

  it('NaN → "—"', () => {
    expect(formatRate(NaN)).toBe('—');
  });

  it('0 → "—" (zero não é cotação válida)', () => {
    expect(formatRate(0)).toBe('—');
  });

  it('valor negativo → formata corretamente (não é "—")', () => {
    // Taxas negativas não existem em produção, mas não devem quebrar
    const result = formatRate(-5.92);
    expect(result).not.toBe('—');
    expect(result).toContain('5,92');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. formatRelativeTime
// ─────────────────────────────────────────────────────────────────────────────

describe('formatRelativeTime', () => {
  // "agora" = menos de 1 minuto
  it('"agora" para menos de 1 minuto atrás', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('agora');
    expect(formatRelativeTime(Date.now() - 59_000)).toBe('agora');
  });

  it('"há X min" para menos de 60 minutos', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('há 5 min');
    expect(formatRelativeTime(Date.now() - 1 * 60_000)).toBe('há 1 min');
    expect(formatRelativeTime(Date.now() - 59 * 60_000)).toBe('há 59 min');
  });

  it('"há Xh" para menos de 24 horas', () => {
    expect(formatRelativeTime(Date.now() - 2  * 3_600_000)).toBe('há 2h');
    expect(formatRelativeTime(Date.now() - 1  * 3_600_000)).toBe('há 1h');
    expect(formatRelativeTime(Date.now() - 23 * 3_600_000)).toBe('há 23h');
  });

  it('"há Xd" para 24 horas ou mais', () => {
    expect(formatRelativeTime(Date.now() - 1 * 86_400_000)).toBe('há 1d');
    expect(formatRelativeTime(Date.now() - 7 * 86_400_000)).toBe('há 7d');
  });

  it('null → "—"', () => {
    expect(formatRelativeTime(null)).toBe('—');
  });

  it('undefined → "—"', () => {
    expect(formatRelativeTime(undefined)).toBe('—');
  });

  it('0 → "—"', () => {
    expect(formatRelativeTime(0)).toBe('—');
  });

  it('timestamp futuro → "agora" (não negativo)', () => {
    // Um timestamp levemente no futuro (clock skew) não deve gerar "-1 min"
    const result = formatRelativeTime(Date.now() + 5_000);
    expect(result).toBe('agora');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. formatMoney (cobertura das linhas 175-179)
// ─────────────────────────────────────────────────────────────────────────────

describe('formatMoney', () => {
  it('formata BRL com separador de milhar', () => {
    const r = formatMoney(1500, 'BRL');
    expect(r).toMatch(/1\.500/);
    expect(r).toContain('R$');
  });

  it('zero → "R$ 0" (sem NaN)', () => {
    const r = formatMoney(0, 'BRL');
    expect(r).not.toContain('NaN');
    expect(r).toMatch(/R\$\s*0/);
  });

  it('null → "R$ 0" (sem crash)', () => {
    expect(() => formatMoney(null, 'BRL')).not.toThrow();
    expect(formatMoney(null, 'BRL')).not.toContain('NaN');
  });

  it('EUR formata com símbolo correto', () => {
    const r = formatMoney(2600, 'EUR');
    expect(r).toContain('2.600');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. calcLockedVariation
// ─────────────────────────────────────────────────────────────────────────────

describe('calcLockedVariation', () => {
  // Casos normais
  it('alta: cotação subiu 10%', () => {
    expect(calcLockedVariation(6.38, 5.80)).toBeCloseTo(10.0, 1);
  });

  it('queda: cotação caiu 5%', () => {
    expect(calcLockedVariation(5.51, 5.80)).toBeCloseTo(-5.0, 1);
  });

  it('sem variação: retorna 0 (não null)', () => {
    expect(calcLockedVariation(5.80, 5.80)).toBeCloseTo(0, 5);
  });

  // Princípio #9 — nunca NaN, Infinity, 0% espúrio
  it('lockedRate = null → retorna null (nunca NaN)', () => {
    const result = calcLockedVariation(6.40, null);
    expect(result).toBeNull();
    expect(result).not.toBeNaN?.();
  });

  it('lockedRate = undefined → retorna null', () => {
    expect(calcLockedVariation(6.40, undefined)).toBeNull();
  });

  it('lockedRate = 0 → retorna null (evita divisão por zero)', () => {
    expect(calcLockedVariation(6.40, 0)).toBeNull();
  });

  it('currentRate = null → retorna null', () => {
    expect(calcLockedVariation(null, 5.80)).toBeNull();
  });

  it('currentRate = 0 → retorna null', () => {
    expect(calcLockedVariation(0, 5.80)).toBeNull();
  });

  it('ambos null → retorna null', () => {
    expect(calcLockedVariation(null, null)).toBeNull();
  });

  it('ambos NaN → retorna null', () => {
    expect(calcLockedVariation(NaN, NaN)).toBeNull();
  });

  it('lockedRate = "abc" (string inválida) → retorna null', () => {
    expect(calcLockedVariation(6.40, 'abc')).toBeNull();
  });

  // Precisão numérica
  it('resultado nunca tem Infinity', () => {
    const result = calcLockedVariation(6.40, 5.80);
    expect(isFinite(result)).toBe(true);
  });

  it('resultado nunca tem NaN', () => {
    const result = calcLockedVariation(6.40, 5.80);
    expect(isNaN(result)).toBe(false);
  });

  // Casos de fronteira
  it('valor muito pequeno de lockedRate (sem Infinity)', () => {
    const result = calcLockedVariation(6.40, 0.001);
    expect(isFinite(result)).toBe(true);
    expect(isNaN(result)).toBe(false);
  });

  it('retorna number, não string — caller é responsável por toFixed()', () => {
    const result = calcLockedVariation(6.38, 5.80);
    expect(typeof result).toBe('number');
  });
});
