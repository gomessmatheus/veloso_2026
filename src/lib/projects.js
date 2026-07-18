/**
 * src/lib/projects.js
 *
 * Lógica pura dos Centros de Custo / Projetos (ex: Viagem Copa 2026).
 * Sem side-effects, sem React, sem Firestore — 100% testável em Node.
 *
 * Modelo:
 *   project = {
 *     id, name, description, status: "ativo" | "encerrado",
 *     createdAt, updatedAt,
 *     expenses: [expense, ...],
 *   }
 *   expense = {
 *     id, date: "YYYY-MM-DD", description, category,
 *     currency: "BRL" | "USD",
 *     amount: number,          // valor na moeda original
 *     fxRate: number | null,   // R$ por US$ (obrigatório se USD)
 *     paidBy: "Empresa" | "Matheus" | "Lucas",
 *     reimbursed: boolean,     // só relevante se paidBy !== "Empresa"
 *     reimbursedAt: "YYYY-MM-DD" | null,
 *     notes,
 *   }
 *
 * Integração com o Caixa:
 *   - Gastos pagos pela EMPRESA entram no fluxo como transações sintéticas
 *     agregadas (1 por projeto/mês) via projectAggregateTx() — não são
 *     persistidas em caixa_tx, apenas calculadas.
 *   - Gastos pagos por PESSOA FÍSICA não saem do caixa da empresa até o
 *     reembolso ser pago. O pagamento do reembolso gera uma transação REAL
 *     em caixa_tx (categoria REIMBURSEMENT_CATEGORY) — evita dupla contagem.
 */

import { round2, toAmount } from "./finance.js";

export const PROJECT_PAYERS = Object.freeze(["Empresa", "Matheus", "Lucas"]);

/** Categoria usada nas transações sintéticas agregadas de projeto. */
export const PROJECT_CATEGORY = "Projeto / Centro de Custo";

/** Categoria usada nas saídas reais de reembolso de projeto. */
export const REIMBURSEMENT_CATEGORY = "Reembolso de Projeto";

/** Prefixo de id das transações sintéticas (para detecção/dedup). */
export const AGGREGATE_TX_PREFIX = "projagg_";

/**
 * Valor do gasto convertido para BRL.
 * USD sem fxRate válido → 0 (o setter na UI deve impedir isso).
 * @param {object} e expense
 * @returns {number}
 */
export function expenseBRL(e) {
  if (!e) return 0;
  const amount = toAmount(e.amount);
  if (e.currency === "USD") {
    const rate = toAmount(e.fxRate);
    return rate > 0 ? round2(amount * rate) : 0;
  }
  return round2(amount);
}

/**
 * Totais gerais de um projeto.
 * @param {object} project
 * @returns {{
 *   totalBRL: number,
 *   totalUSD: number,            // soma dos amounts originais em USD
 *   companyBRL: number,          // pago pela empresa (entra no caixa agregado)
 *   personalBRL: number,         // pago por pessoas físicas (total)
 *   pendingBRL: number,          // pessoal ainda não reembolsado
 *   reimbursedBRL: number,       // pessoal já reembolsado
 *   count: number,
 * }}
 */
export function projectTotals(project) {
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  let totalBRL = 0, totalUSD = 0, companyBRL = 0, pendingBRL = 0, reimbursedBRL = 0;
  for (const e of list) {
    const brl = expenseBRL(e);
    totalBRL += brl;
    if (e.currency === "USD") totalUSD += toAmount(e.amount);
    if (!e.paidBy || e.paidBy === "Empresa") {
      companyBRL += brl;
    } else if (e.reimbursed) {
      reimbursedBRL += brl;
    } else {
      pendingBRL += brl;
    }
  }
  return {
    totalBRL: round2(totalBRL),
    totalUSD: round2(totalUSD),
    companyBRL: round2(companyBRL),
    personalBRL: round2(pendingBRL + reimbursedBRL),
    pendingBRL: round2(pendingBRL),
    reimbursedBRL: round2(reimbursedBRL),
    count: list.length,
  };
}

/**
 * Resumo de reembolsos por pessoa (exclui "Empresa").
 * @param {object} project
 * @returns {Array<{person: string, pendingBRL: number, reimbursedBRL: number,
 *                  pendingCount: number, pendingIds: string[]}>}
 */
export function reimbursementSummary(project) {
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  const byPerson = {};
  for (const e of list) {
    const p = e.paidBy;
    if (!p || p === "Empresa") continue;
    if (!byPerson[p]) byPerson[p] = { person: p, pendingBRL: 0, reimbursedBRL: 0, pendingCount: 0, pendingIds: [] };
    const brl = expenseBRL(e);
    if (e.reimbursed) {
      byPerson[p].reimbursedBRL = round2(byPerson[p].reimbursedBRL + brl);
    } else {
      byPerson[p].pendingBRL = round2(byPerson[p].pendingBRL + brl);
      byPerson[p].pendingCount += 1;
      byPerson[p].pendingIds.push(e.id);
    }
  }
  return Object.values(byPerson).sort((a, b) => a.person.localeCompare(b.person));
}

/**
 * Transações sintéticas agregadas para o fluxo de caixa.
 * Apenas gastos pagos pela EMPRESA, agrupados por projeto+mês.
 * A data usada é a maior data de gasto dentro do mês (nunca futura ao mês).
 *
 * IMPORTANTE: ids são determinísticos (`projagg_<projectId>_<YYYY-MM>`) para
 * que a UI possa filtrá-las/reconhecê-las de forma estável entre renders.
 *
 * @param {Array} projects
 * @returns {Array} transações no formato de caixa_tx (type "saida"),
 *                  com flags isProjectAggregate e projectId.
 */
export function projectAggregateTx(projects) {
  const out = [];
  for (const p of (Array.isArray(projects) ? projects : [])) {
    const byMonth = {};
    for (const e of (Array.isArray(p.expenses) ? p.expenses : [])) {
      if (e.paidBy && e.paidBy !== "Empresa") continue;
      if (!e.date || typeof e.date !== "string" || e.date.length < 7) continue;
      const ym = e.date.slice(0, 7);
      if (!byMonth[ym]) byMonth[ym] = { total: 0, maxDate: e.date, count: 0 };
      byMonth[ym].total = round2(byMonth[ym].total + expenseBRL(e));
      byMonth[ym].count += 1;
      if (e.date > byMonth[ym].maxDate) byMonth[ym].maxDate = e.date;
    }
    for (const [ym, m] of Object.entries(byMonth)) {
      if (m.total <= 0) continue;
      out.push({
        id: `${AGGREGATE_TX_PREFIX}${p.id}_${ym}`,
        type: "saida",
        date: m.maxDate,
        description: `Projeto: ${p.name}`,
        category: PROJECT_CATEGORY,
        amount: m.total,
        projectId: p.id,
        isProjectAggregate: true,
        aggregateCount: m.count,
      });
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Marca como reembolsados os gastos pendentes de uma pessoa e devolve o
 * projeto atualizado + o valor total. NÃO cria a transação de caixa — o
 * chamador decide (para poder escolher data/descrição).
 *
 * @param {object} project
 * @param {string} person
 * @param {string} dateIso "YYYY-MM-DD" do pagamento do reembolso
 * @returns {{project: object, totalBRL: number, count: number}}
 */
export function settleReimbursement(project, person, dateIso) {
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  let totalBRL = 0, count = 0;
  const expenses = list.map((e) => {
    if (e.paidBy === person && !e.reimbursed) {
      totalBRL = round2(totalBRL + expenseBRL(e));
      count += 1;
      return { ...e, reimbursed: true, reimbursedAt: dateIso };
    }
    return e;
  });
  return { project: { ...project, expenses }, totalBRL, count };
}
