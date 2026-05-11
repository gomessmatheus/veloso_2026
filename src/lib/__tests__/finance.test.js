/**
 * src/lib/__tests__/finance.test.js
 *
 * Cenários mínimos para src/lib/finance.js.
 * Executa com: npm test  (vitest)
 */

import { describe, it, expect } from "vitest";
import {
  aggregate,
  monthlyBreakdown,
  burnRate,
  liquidityRatio,
  futureInstallments,
  isInflow,
  isOutflow,
  isTax,
  isDividend,
  isTransfer,
  toAmount,
  round2,
  TX_TYPES,
} from "../finance.js";

// ─── Fixtures helpers ──────────────────────────────────────

const T = (type, amount, opts = {}) => ({ type, amount, date: "2026-05-01", ...opts });
const TDate = (type, amount, date, opts = {}) => ({ type, amount, date, ...opts });

// ─── a) aggregate: saldo com dados reais aproximados ─────

describe("aggregate — saldo total", () => {
  it("combina baseBalance + entradas - saídas - impostos - dividendos corretamente", () => {
    // fixture: 285765 entradas, 116180 saidas+imposto, 111804 dividendos, base 8855
    const txs = [
      T(TX_TYPES.ENTRADA,    285765),
      T(TX_TYPES.SAIDA,       90000),
      T(TX_TYPES.IMPOSTO,     26180),
      T(TX_TYPES.DIVIDENDOS, 111804),
    ];
    const result = aggregate(txs, 8855);
    // saldoTotal = 8855 + 285765 - (90000 + 26180) - 111804 = 66636
    expect(result.saldoTotal).toBeCloseTo(66636, 0);
    expect(result.totalEntradas).toBe(285765);
    expect(result.totalOutflows).toBe(116180); // 90000 + 26180
    expect(result.totalDividendos).toBe(111804);
  });
});

// ─── b) EBITDA ≠ Margem Bruta quando há despesa operacional ─

describe("aggregate — EBITDA vs Margem Bruta", () => {
  it("margemBruta !== margemEbitda quando há despesas além do CSP", () => {
    // receita 1000, custo CSP 200, despesa operacional não-CSP 300
    const txs = [
      T(TX_TYPES.ENTRADA, 1000),
      T(TX_TYPES.SAIDA,    200, { category: "Produção de Conteúdo" }), // CSP
      T(TX_TYPES.SAIDA,    300, { category: "Software / SaaS" }),       // despesa op
    ];
    const r = aggregate(txs, 0);
    // receitaLiquida = 1000 (sem imposto)
    // lucroBruto = 1000 - 200 = 800
    // margemBruta = 800/1000 = 0.8 → 80%
    // ebitda = 1000 - 200 - 300 = 500
    // margemEbitda = 500/1000 = 0.5 → 50%
    expect(r.margemBruta).toBeCloseTo(80, 1);
    expect(r.margemEbitda).toBeCloseTo(50, 1);
    expect(r.margemBruta).not.toBe(r.margemEbitda);
    expect(r.ebitda).toBeCloseTo(500, 0);
    expect(r.lucroBruto).toBeCloseTo(800, 0);
  });

  it("quando só há CSP (sem outros custos), margemBruta = margemEbitda", () => {
    const txs = [
      T(TX_TYPES.ENTRADA, 1000),
      T(TX_TYPES.SAIDA,    200, { category: "Produção de Conteúdo" }),
    ];
    const r = aggregate(txs, 0);
    expect(r.margemBruta).toBeCloseTo(r.margemEbitda, 5);
  });
});

// ─── c) monthlyBreakdown: mês sem movimento aparece zerado ─

describe("monthlyBreakdown — meses zerados", () => {
  it("retorna exatamente 12 meses mesmo sem nenhuma transação", () => {
    const result = monthlyBreakdown([], 2026);
    expect(result).toHaveLength(12);
  });

  it("meses sem movimento têm todos os campos em 0", () => {
    const txs = [TDate(TX_TYPES.ENTRADA, 1000, "2026-03-15")];
    const result = monthlyBreakdown(txs, 2026);
    const jan = result.find((m) => m.monthIndex === 0); // Janeiro
    expect(jan.ent).toBe(0);
    expect(jan.sai).toBe(0);
    expect(jan.imp).toBe(0);
    expect(jan.div).toBe(0);
    expect(jan.net).toBe(0);
  });

  it("meses zerados NÃO entram no burnRate", () => {
    // 3 meses com saídas (10, 20, 30) e 9 meses zerados
    const txs = [
      TDate(TX_TYPES.SAIDA, 10, "2026-01-01"),
      TDate(TX_TYPES.SAIDA, 20, "2026-02-01"),
      TDate(TX_TYPES.SAIDA, 30, "2026-03-01"),
    ];
    expect(burnRate(txs, 2026)).toBeCloseTo(20, 1); // (10+20+30)/3
  });
});

// ─── d) burnRate: média apenas dos meses com movimento ────

describe("burnRate", () => {
  it("retorna média das saídas dos meses com movimento (ignora zerados)", () => {
    const txs = [
      TDate(TX_TYPES.SAIDA, 10,  "2026-01-01"),
      TDate(TX_TYPES.SAIDA, 20,  "2026-06-01"),
      TDate(TX_TYPES.IMPOSTO, 30, "2026-12-01"),
    ];
    // 3 meses com movimento: 10, 20, 30 → média = 20
    expect(burnRate(txs, 2026)).toBeCloseTo(20, 1);
  });

  it("retorna 0 quando não há saídas", () => {
    const txs = [TDate(TX_TYPES.ENTRADA, 500, "2026-01-01")];
    expect(burnRate(txs, 2026)).toBe(0);
  });

  it("retorna 0 para lista vazia", () => {
    expect(burnRate([], 2026)).toBe(0);
  });
});

// ─── e) isOutflow: imposto conta; transferência não ───────

describe("predicados", () => {
  it("isOutflow inclui tipo saida", () => {
    expect(isOutflow(T(TX_TYPES.SAIDA, 100))).toBe(true);
  });

  it("isOutflow inclui tipo imposto", () => {
    expect(isOutflow(T(TX_TYPES.IMPOSTO, 50))).toBe(true);
  });

  it("isOutflow NÃO inclui transferência", () => {
    expect(isOutflow(T(TX_TYPES.TRANSFERENCIA, 200))).toBe(false);
  });

  it("transferência não entra em nenhum agregado de saldo", () => {
    const txs = [
      T(TX_TYPES.TRANSFERENCIA, 999),
      T(TX_TYPES.ENTRADA, 100),
    ];
    const r = aggregate(txs, 0);
    expect(r.saldoTotal).toBe(100);
    expect(r.totalEntradas).toBe(100);
    expect(r.totalOutflows).toBe(0);
  });

  it("isInflow aceita tipo entrada", () => {
    expect(isInflow(T(TX_TYPES.ENTRADA, 100))).toBe(true);
    expect(isInflow(T(TX_TYPES.SAIDA,   100))).toBe(false);
  });

  it("isDividend aceita tipo dividendos", () => {
    expect(isDividend(T(TX_TYPES.DIVIDENDOS, 50))).toBe(true);
    expect(isDividend(T(TX_TYPES.SAIDA, 50))).toBe(false);
  });

  it("isTax aceita tipo imposto", () => {
    expect(isTax(T(TX_TYPES.IMPOSTO, 30))).toBe(true);
    expect(isTax(T(TX_TYPES.SAIDA,   30))).toBe(false);
  });
});

// ─── f) futureInstallments ────────────────────────────────

describe("futureInstallments", () => {
  it("lançamento com installmentTotal=1 NUNCA aparece, mesmo no futuro", () => {
    const txs = [
      {
        type: TX_TYPES.SAIDA,
        amount: 500,
        date: "2099-01-01",
        installmentTotal: 1,
      },
    ];
    const result = futureInstallments(txs, "2020-01-01");
    expect(result).toHaveLength(0);
  });

  it("lançamento com installmentTotal=3 e data futura aparece no mês correto", () => {
    const txs = [
      {
        type: TX_TYPES.SAIDA,
        amount: 300,
        date: "2099-06-15",
        installmentTotal: 3,
        description: "parcela 1",
      },
    ];
    const result = futureInstallments(txs, "2020-01-01");
    expect(result).toHaveLength(1);
    const [key, val] = result[0];
    expect(key).toBe("2099-06");
    expect(val.total).toBe(300);
    expect(val.items).toHaveLength(1);
  });

  it("lançamento passado não aparece", () => {
    const txs = [
      {
        type: TX_TYPES.SAIDA,
        amount: 100,
        date: "2020-01-01",
        installmentTotal: 3,
      },
    ];
    const result = futureInstallments(txs, "2026-01-01");
    expect(result).toHaveLength(0);
  });
});

// ─── g) edge cases — zeros, null, undefined ───────────────

describe("edge cases", () => {
  it("aggregate([], 0) retorna todos os campos numéricos sem NaN nem Infinity", () => {
    const r = aggregate([], 0);
    Object.values(r).forEach((v) => {
      expect(typeof v).toBe("number");
      expect(Number.isNaN(v)).toBe(false);
      expect(v).not.toBe(Infinity);
      expect(v).not.toBe(-Infinity);
    });
  });

  it("aggregate com transactions=undefined trata como lista vazia", () => {
    expect(() => aggregate(undefined, 1000)).not.toThrow();
    const r = aggregate(undefined, 1000);
    expect(r.saldoTotal).toBe(1000);
  });

  it("toAmount converte string, null, undefined, NaN para 0", () => {
    expect(toAmount(null)).toBe(0);
    expect(toAmount(undefined)).toBe(0);
    expect(toAmount(NaN)).toBe(0);
    expect(toAmount("")).toBe(0);
    expect(toAmount("1234.5")).toBe(1234.5);
    expect(toAmount(100)).toBe(100);
  });

  it("aggregate aceita baseBalance como string numérica", () => {
    const r = aggregate([], "8855");
    expect(r.saldoTotal).toBe(8855);
  });

  it("t.date ausente não quebra monthlyBreakdown", () => {
    const txs = [{ type: TX_TYPES.ENTRADA, amount: 100 }]; // sem date
    expect(() => monthlyBreakdown(txs, 2026)).not.toThrow();
    const result = monthlyBreakdown(txs, 2026);
    result.forEach((m) => {
      expect(m.ent).toBe(0); // a transação sem data é ignorada
    });
  });

  it("year fora dos lançamentos retorna 12 entradas zeradas", () => {
    const txs = [TDate(TX_TYPES.ENTRADA, 500, "2020-01-01")];
    const result = monthlyBreakdown(txs, 2099);
    expect(result).toHaveLength(12);
    result.forEach((m) => expect(m.ent).toBe(0));
  });

  it("round2 arredonda corretamente", () => {
    expect(round2(0.1 + 0.2)).toBe(0.3);
    expect(round2(1.005)).toBe(1.01);
  });
});
