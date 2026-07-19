import { describe, it, expect } from "vitest";
import {
  expenseBRL, projectTotals, reimbursementSummary,
  projectAggregateTx, settleReimbursement,
  categoryBreakdown, monthlySpend,
  PROJECT_CATEGORY, AGGREGATE_TX_PREFIX,
} from "../projects.js";

const exp = (over = {}) => ({
  id: over.id || Math.random().toString(36).slice(2),
  date: "2026-06-15",
  description: "Gasto",
  category: "Alimentação",
  currency: "BRL",
  amount: 100,
  fxRate: null,
  paidBy: "Empresa",
  reimbursed: false,
  reimbursedAt: null,
  ...over,
});

describe("expenseBRL", () => {
  it("BRL retorna o próprio valor", () => {
    expect(expenseBRL(exp({ amount: 123.45 }))).toBe(123.45);
  });
  it("USD converte pela fxRate", () => {
    expect(expenseBRL(exp({ currency: "USD", amount: 100, fxRate: 5.5 }))).toBe(550);
  });
  it("USD sem fxRate válida retorna 0", () => {
    expect(expenseBRL(exp({ currency: "USD", amount: 100, fxRate: 0 }))).toBe(0);
    expect(expenseBRL(exp({ currency: "USD", amount: 100, fxRate: null }))).toBe(0);
  });
  it("valores inválidos retornam 0", () => {
    expect(expenseBRL(null)).toBe(0);
    expect(expenseBRL(exp({ amount: "abc" }))).toBe(0);
  });
});

describe("projectTotals", () => {
  const project = {
    id: "p1", name: "Copa",
    expenses: [
      exp({ amount: 1000, paidBy: "Empresa" }),
      exp({ currency: "USD", amount: 200, fxRate: 5, paidBy: "Matheus" }),           // 1000 pendente
      exp({ currency: "USD", amount: 100, fxRate: 5, paidBy: "Matheus", reimbursed: true }), // 500 pago
      exp({ amount: 300, paidBy: "Lucas" }),                                          // 300 pendente
    ],
  };
  it("soma totais por origem do pagamento", () => {
    const t = projectTotals(project);
    expect(t.totalBRL).toBe(2800);
    expect(t.totalUSD).toBe(300);
    expect(t.companyBRL).toBe(1000);
    expect(t.personalBRL).toBe(1800);
    expect(t.pendingBRL).toBe(1300);
    expect(t.reimbursedBRL).toBe(500);
    expect(t.count).toBe(4);
  });
  it("projeto vazio ou inválido", () => {
    expect(projectTotals(null).totalBRL).toBe(0);
    expect(projectTotals({}).count).toBe(0);
  });
  it("paidBy ausente conta como Empresa (legado)", () => {
    const t = projectTotals({ expenses: [exp({ paidBy: undefined })] });
    expect(t.companyBRL).toBe(100);
    expect(t.pendingBRL).toBe(0);
  });
});

describe("reimbursementSummary", () => {
  it("agrupa por pessoa, excluindo Empresa", () => {
    const s = reimbursementSummary({
      expenses: [
        exp({ id: "a", amount: 100, paidBy: "Matheus" }),
        exp({ id: "b", amount: 50, paidBy: "Matheus", reimbursed: true }),
        exp({ id: "c", amount: 70, paidBy: "Lucas" }),
        exp({ id: "d", amount: 999, paidBy: "Empresa" }),
      ],
    });
    expect(s).toHaveLength(2);
    const mat = s.find((x) => x.person === "Matheus");
    expect(mat.pendingBRL).toBe(100);
    expect(mat.reimbursedBRL).toBe(50);
    expect(mat.pendingCount).toBe(1);
    expect(mat.pendingIds).toEqual(["a"]);
  });
});

describe("projectAggregateTx", () => {
  it("agrega gastos da empresa por projeto+mês", () => {
    const txs = projectAggregateTx([{
      id: "p1", name: "Copa",
      expenses: [
        exp({ date: "2026-06-10", amount: 100 }),
        exp({ date: "2026-06-20", amount: 50 }),
        exp({ date: "2026-07-02", amount: 30 }),
        exp({ date: "2026-06-25", amount: 500, paidBy: "Matheus" }), // fora do agregado
      ],
    }]);
    expect(txs).toHaveLength(2);
    const jun = txs.find((t) => t.id === `${AGGREGATE_TX_PREFIX}p1_2026-06`);
    expect(jun.amount).toBe(150);
    expect(jun.date).toBe("2026-06-20"); // maior data do mês
    expect(jun.type).toBe("saida");
    expect(jun.category).toBe(PROJECT_CATEGORY);
    expect(jun.isProjectAggregate).toBe(true);
    expect(jun.aggregateCount).toBe(2);
  });
  it("ignora meses sem gasto da empresa e datas inválidas", () => {
    const txs = projectAggregateTx([{
      id: "p1", name: "X",
      expenses: [exp({ paidBy: "Lucas" }), exp({ date: null })],
    }]);
    expect(txs).toHaveLength(0);
  });
  it("lista vazia/inválida", () => {
    expect(projectAggregateTx(null)).toEqual([]);
  });
});

describe("categoryBreakdown", () => {
  const project = {
    expenses: [
      exp({ category: "Hospedagem", amount: 600 }),
      exp({ category: "Hospedagem", currency: "USD", amount: 100, fxRate: 5 }), // 500
      exp({ category: "Alimentação", amount: 300 }),
      exp({ category: "", amount: 100 }),
    ],
  };
  it("agrupa, soma e ordena por valor", () => {
    const b = categoryBreakdown(project);
    expect(b.map((x) => x.category)).toEqual(["Hospedagem", "Alimentação", "Sem categoria"]);
    expect(b[0].totalBRL).toBe(1100);
    expect(b[0].totalUSD).toBe(100);
    expect(b[0].count).toBe(2);
    expect(b[0].pct).toBe(73.3); // 1100/1500
    expect(b[2].category).toBe("Sem categoria");
  });
  it("projeto vazio → lista vazia", () => {
    expect(categoryBreakdown({})).toEqual([]);
    expect(categoryBreakdown(null)).toEqual([]);
  });
});

describe("monthlySpend", () => {
  it("agrupa por mês em ordem cronológica com label pt-BR", () => {
    const m = monthlySpend({
      expenses: [
        exp({ date: "2026-07-02", amount: 50 }),
        exp({ date: "2026-06-15", amount: 100 }),
        exp({ date: "2026-06-20", currency: "USD", amount: 10, fxRate: 5 }), // 50
        exp({ date: null, amount: 999 }), // ignorado
      ],
    });
    expect(m).toHaveLength(2);
    expect(m[0]).toMatchObject({ ym: "2026-06", label: "Jun/26", totalBRL: 150, count: 2 });
    expect(m[1]).toMatchObject({ ym: "2026-07", label: "Jul/26", totalBRL: 50 });
  });
});

describe("settleReimbursement", () => {
  it("marca pendentes da pessoa e retorna total", () => {
    const project = {
      id: "p1",
      expenses: [
        exp({ id: "a", amount: 100, paidBy: "Matheus" }),
        exp({ id: "b", currency: "USD", amount: 10, fxRate: 5, paidBy: "Matheus" }),
        exp({ id: "c", amount: 70, paidBy: "Lucas" }),
        exp({ id: "d", amount: 30, paidBy: "Matheus", reimbursed: true, reimbursedAt: "2026-06-01" }),
      ],
    };
    const { project: updated, totalBRL, count } = settleReimbursement(project, "Matheus", "2026-07-18");
    expect(totalBRL).toBe(150);
    expect(count).toBe(2);
    expect(updated.expenses.find((e) => e.id === "a").reimbursed).toBe(true);
    expect(updated.expenses.find((e) => e.id === "a").reimbursedAt).toBe("2026-07-18");
    expect(updated.expenses.find((e) => e.id === "c").reimbursed).toBe(false);
    expect(updated.expenses.find((e) => e.id === "d").reimbursedAt).toBe("2026-06-01");
  });
});
