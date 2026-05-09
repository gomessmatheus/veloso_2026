import { describe, it, expect } from 'vitest'
import {
  monthsBetween,
  getInstallments,
  contractTotal,
  contractTotalWithWarning,
  contractCalcWarnings,
  getCommEntries,
  toBRL,
  toBRLStrict,
  addDays,
  stageDeadline,
} from './contracts.js'

// ─── monthsBetween ────────────────────────────────────────
describe('monthsBetween', () => {
  it('returns 1 for same month', () => {
    expect(monthsBetween('2026-06-01', '2026-06-30')).toBe(1)
  })
  it('returns 3 for jun→aug', () => {
    expect(monthsBetween('2026-06-01', '2026-08-31')).toBe(3)
  })
  it('returns null when either date is missing', () => {
    expect(monthsBetween('', '2026-08-31')).toBeNull()
    expect(monthsBetween('2026-06-01', '')).toBeNull()
    expect(monthsBetween(null, null)).toBeNull()
  })
  it('handles year boundary', () => {
    expect(monthsBetween('2025-11-01', '2026-01-31')).toBe(3)
  })
})

// ─── getInstallments ─────────────────────────────────────
describe('getInstallments', () => {
  it('returns installments[] when present', () => {
    const c = { installments: [{ value: 1000, date: '2026-06-01' }] }
    expect(getInstallments(c)).toEqual([{ value: 1000, date: '2026-06-01' }])
  })
  it('falls back to legacy parc1/parc2 fields', () => {
    const c = { parc1Value: 5000, parc1Deadline: '2026-06-01', parc2Value: 5000, parc2Deadline: '2026-07-01' }
    expect(getInstallments(c)).toHaveLength(2)
    expect(getInstallments(c)[0].value).toBe(5000)
  })
  it('returns empty array when no installments', () => {
    expect(getInstallments({})).toEqual([])
  })
})

// ─── contractTotal ────────────────────────────────────────
describe('contractTotal', () => {
  it('single payment type returns contractValue', () => {
    expect(contractTotal({ paymentType: 'single', contractValue: 30000 })).toBe(30000)
  })
  it('monthly returns monthlyValue × months', () => {
    expect(contractTotal({
      paymentType: 'monthly',
      monthlyValue: 10000,
      contractStart: '2026-06-01',
      contractDeadline: '2026-08-31',
    })).toBe(30000)
  })
  it('monthly with no dates returns 0', () => {
    expect(contractTotal({ paymentType: 'monthly', monthlyValue: 10000 })).toBe(0)
  })
  it('split sums installments', () => {
    const c = {
      paymentType: 'split',
      installments: [{ value: 50000, date: '' }, { value: 50000, date: '' }],
    }
    expect(contractTotal(c)).toBe(100000)
  })
  it('split falls back to legacy parc fields', () => {
    const c = { paymentType: 'split', parc1Value: 25000, parc1Deadline: '', parc2Value: 25000, parc2Deadline: '' }
    expect(contractTotal(c)).toBe(50000)
  })
})

// ─── contractTotalWithWarning ─────────────────────────────
describe('contractTotalWithWarning', () => {
  it('warns when monthly has no dates', () => {
    const result = contractTotalWithWarning({ paymentType: 'monthly', monthlyValue: 10000, company: 'Acme' })
    expect(result.value).toBe(0)
    expect(result.warning).toContain('Acme')
    expect(result.warning).toContain('mensal')
  })
  it('no warning when monthly has valid dates', () => {
    const result = contractTotalWithWarning({
      paymentType: 'monthly', monthlyValue: 10000, company: 'Acme',
      contractStart: '2026-06-01', contractDeadline: '2026-08-31',
    })
    expect(result.warning).toBeNull()
    expect(result.value).toBe(30000)
  })
  it('no warning for single payment', () => {
    const { warning } = contractTotalWithWarning({ paymentType: 'single', contractValue: 5000, company: 'X' })
    expect(warning).toBeNull()
  })
})

// ─── contractCalcWarnings ─────────────────────────────────
describe('contractCalcWarnings', () => {
  it('collects warnings from multiple contracts', () => {
    const contracts = [
      { paymentType: 'monthly', monthlyValue: 1000, company: 'A' },
      { paymentType: 'single', contractValue: 5000, company: 'B' },
      { paymentType: 'monthly', monthlyValue: 2000, company: 'C' },
    ]
    const warnings = contractCalcWarnings(contracts)
    expect(warnings).toHaveLength(2)
    expect(warnings[0]).toContain('A')
    expect(warnings[1]).toContain('C')
  })
  it('returns empty array when all contracts are valid', () => {
    const contracts = [
      { paymentType: 'single', contractValue: 5000, company: 'B' },
    ]
    expect(contractCalcWarnings(contracts)).toHaveLength(0)
  })
  it('skips archived contracts', () => {
    const contracts = [
      { paymentType: 'monthly', monthlyValue: 1000, company: 'A', archived: true },
    ]
    expect(contractCalcWarnings(contracts)).toHaveLength(0)
  })
})

// ─── getCommEntries ───────────────────────────────────────
describe('getCommEntries', () => {
  it('returns empty when hasCommission is false', () => {
    expect(getCommEntries({ hasCommission: false })).toEqual([])
  })

  it('uses default COMM_RATE (0.20) when commissionRate not set', () => {
    const c = {
      hasCommission: true, paymentType: 'single',
      contractValue: 10000, currency: 'BRL',
    }
    const entries = getCommEntries(c)
    expect(entries[0].amount).toBeCloseTo(2000) // 10000 × 0.20
  })

  it('uses per-contract commissionRate when provided', () => {
    const c = {
      hasCommission: true, paymentType: 'single',
      contractValue: 10000, currency: 'BRL',
      commissionRate: 0.15,
    }
    const entries = getCommEntries(c)
    expect(entries[0].amount).toBeCloseTo(1500) // 10000 × 0.15
  })

  it('generates one entry per month for monthly contracts', () => {
    const c = {
      hasCommission: true, paymentType: 'monthly',
      monthlyValue: 10000, currency: 'BRL',
      contractStart: '2026-06-01', contractDeadline: '2026-08-31',
      commPaid: {},
    }
    const entries = getCommEntries(c)
    expect(entries).toHaveLength(3)
    expect(entries[0].key).toBe('2026-06')
    expect(entries[0].amount).toBeCloseTo(2000)
  })

  it('generates entries per installment for split contracts', () => {
    const c = {
      hasCommission: true, paymentType: 'split',
      installments: [{ value: 50000, date: '2026-06-01' }, { value: 50000, date: '2026-07-01' }],
      currency: 'BRL', commPaid: {}, costs: [],
    }
    const entries = getCommEntries(c)
    expect(entries).toHaveLength(2)
    expect(entries[0].amount).toBeCloseTo(10000)
  })
})

// ─── toBRL / toBRLStrict ──────────────────────────────────
describe('toBRL', () => {
  const rates = { eur: 6.0, usd: 5.5 }

  it('returns value unchanged for BRL', () => {
    expect(toBRL(1000, 'BRL', rates)).toBe(1000)
  })
  it('converts EUR correctly', () => {
    expect(toBRL(100, 'EUR', rates)).toBe(600)
  })
  it('converts USD correctly', () => {
    expect(toBRL(100, 'USD', rates)).toBe(550)
  })
  it('returns raw value when EUR rate is 0 (legacy behaviour)', () => {
    expect(toBRL(100, 'EUR', { eur: 0, usd: 5.5 })).toBe(100)
  })
})

describe('toBRLStrict', () => {
  it('returns null when EUR rate is 0', () => {
    expect(toBRLStrict(100, 'EUR', { eur: 0, usd: 5.5 })).toBeNull()
  })
  it('returns null when USD rate is 0', () => {
    expect(toBRLStrict(100, 'USD', { eur: 6, usd: 0 })).toBeNull()
  })
  it('returns converted value when rate is set', () => {
    expect(toBRLStrict(100, 'EUR', { eur: 6, usd: 5.5 })).toBe(600)
  })
  it('returns value unchanged for BRL regardless of rates', () => {
    expect(toBRLStrict(1000, 'BRL', { eur: 0, usd: 0 })).toBe(1000)
  })
})

// ─── addDays ──────────────────────────────────────────────
describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-06-10', 5)).toBe('2026-06-15')
  })
  it('adds negative days (subtract)', () => {
    expect(addDays('2026-06-10', -3)).toBe('2026-06-07')
  })
  it('returns null for empty input', () => {
    expect(addDays('', 5)).toBeNull()
    expect(addDays(null, 5)).toBeNull()
    expect(addDays('2026-06-10', null)).toBeNull()
  })
  it('handles month boundary', () => {
    expect(addDays('2026-06-28', 5)).toBe('2026-07-03')
  })
})
