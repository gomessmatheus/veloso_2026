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
/**
 * Quanto de um gasto pessoal já foi reembolsado (em BRL).
 * Suporta reembolso PARCIAL via e.reimbursedAmountBRL.
 * @param {object} e expense
 */
export function reimbursedOf(e) {
  if (!e || !e.paidBy || e.paidBy === "Empresa") return 0;
  const brl = expenseBRL(e);
  if (e.reimbursed) return brl;
  const partial = Number(e.reimbursedAmountBRL) || 0;
  return round2(Math.min(Math.max(partial, 0), brl));
}

/**
 * Quanto de um gasto pessoal ainda falta reembolsar (em BRL).
 * @param {object} e expense
 */
export function pendingOf(e) {
  if (!e || !e.paidBy || e.paidBy === "Empresa") return 0;
  return round2(expenseBRL(e) - reimbursedOf(e));
}

export function projectTotals(project) {
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  let totalBRL = 0, totalUSD = 0, companyBRL = 0, pendingBRL = 0, reimbursedBRL = 0;
  for (const e of list) {
    const brl = expenseBRL(e);
    totalBRL += brl;
    if (e.currency === "USD") totalUSD += toAmount(e.amount);
    if (!e.paidBy || e.paidBy === "Empresa") {
      companyBRL += brl;
    } else {
      pendingBRL += pendingOf(e);
      reimbursedBRL += reimbursedOf(e);
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
 * Considera reembolsos parciais (reimbursedAmountBRL).
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
    const pend = pendingOf(e);
    byPerson[p].reimbursedBRL = round2(byPerson[p].reimbursedBRL + reimbursedOf(e));
    if (pend > 0) {
      byPerson[p].pendingBRL = round2(byPerson[p].pendingBRL + pend);
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
 * Gastos agrupados por categoria, ordenados do maior para o menor.
 * @param {object} project
 * @returns {Array<{category:string, totalBRL:number, totalUSD:number,
 *                  count:number, pct:number}>} pct = % do total do projeto
 */
export function categoryBreakdown(project) {
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  const byCat = new Map();
  let grand = 0;
  for (const e of list) {
    const cat = e.category || "Sem categoria";
    const brl = expenseBRL(e);
    grand += brl;
    if (!byCat.has(cat)) byCat.set(cat, { category: cat, totalBRL: 0, totalUSD: 0, count: 0 });
    const c = byCat.get(cat);
    c.totalBRL = round2(c.totalBRL + brl);
    if (e.currency === "USD") c.totalUSD = round2(c.totalUSD + toAmount(e.amount));
    c.count += 1;
  }
  return [...byCat.values()]
    .sort((a, b) => b.totalBRL - a.totalBRL)
    .map((c) => ({ ...c, pct: grand > 0 ? Math.round((c.totalBRL / grand) * 1000) / 10 : 0 }));
}

/**
 * Evolução mensal do gasto do projeto (todas as origens de pagamento).
 * @param {object} project
 * @returns {Array<{ym:string, label:string, totalBRL:number, count:number}>}
 *          ordenado cronologicamente; meses sem gasto não aparecem.
 */
export function monthlySpend(project) {
  const MONTHS_PT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  const byMonth = new Map();
  for (const e of list) {
    if (!e.date || typeof e.date !== "string" || e.date.length < 7) continue;
    const ym = e.date.slice(0, 7);
    if (!byMonth.has(ym)) byMonth.set(ym, { ym, totalBRL: 0, count: 0 });
    const m = byMonth.get(ym);
    m.totalBRL = round2(m.totalBRL + expenseBRL(e));
    m.count += 1;
  }
  return [...byMonth.values()]
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map((m) => {
      const [y, mo] = m.ym.split("-");
      return { ...m, label: `${MONTHS_PT[parseInt(mo, 10) - 1]}/${y.slice(2)}` };
    });
}

/**
 * Marca como TOTALMENTE reembolsados os gastos com os ids informados.
 * O valor devolvido é a soma do que ainda estava pendente em cada um
 * (desconta parciais já pagos). NÃO cria a transação de caixa.
 *
 * @param {object} project
 * @param {string[]} ids  ids dos gastos a liquidar
 * @param {string} dateIso "YYYY-MM-DD" do pagamento
 * @returns {{project: object, totalBRL: number, count: number}}
 */
export function settleExpenses(project, ids, dateIso) {
  const idSet = new Set(ids || []);
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  let totalBRL = 0, count = 0;
  const expenses = list.map((e) => {
    if (!idSet.has(e.id)) return e;
    const pend = pendingOf(e);
    if (pend <= 0) return e;
    totalBRL = round2(totalBRL + pend);
    count += 1;
    const { reimbursedAmountBRL, ...rest } = e;
    return { ...rest, reimbursed: true, reimbursedAt: dateIso };
  });
  return { project: { ...project, expenses }, totalBRL, count };
}

/**
 * Aloca um VALOR PERSONALIZADO de reembolso nos gastos pendentes da
 * pessoa, do mais antigo para o mais novo (FIFO). Gastos cobertos
 * integralmente ficam reimbursed; o que sobrar vira parcial
 * (reimbursedAmountBRL) no gasto seguinte.
 *
 * @param {object} project
 * @param {string} person
 * @param {number} amountBRL  valor pago (será limitado ao pendente total)
 * @param {string} dateIso
 * @returns {{project: object, totalBRL: number, count: number,
 *            applied: Array<{id:string, amount:number, fully:boolean}>}}
 *          totalBRL = valor efetivamente alocado; count = gastos tocados
 */
export function allocateReimbursement(project, person, amountBRL, dateIso) {
  const list = Array.isArray(project?.expenses) ? project.expenses : [];
  let remaining = round2(Math.max(0, Number(amountBRL) || 0));
  const applied = [];

  const orderedPending = list
    .filter((e) => e.paidBy === person && pendingOf(e) > 0)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));

  const updates = new Map();
  for (const e of orderedPending) {
    if (remaining <= 0) break;
    const pend = pendingOf(e);
    if (remaining >= pend) {
      const { reimbursedAmountBRL, ...rest } = e;
      updates.set(e.id, { ...rest, reimbursed: true, reimbursedAt: dateIso });
      applied.push({ id: e.id, amount: pend, fully: true });
      remaining = round2(remaining - pend);
    } else {
      updates.set(e.id, {
        ...e,
        reimbursedAmountBRL: round2(reimbursedOf(e) + remaining),
        reimbursedAt: dateIso,
      });
      applied.push({ id: e.id, amount: remaining, fully: false });
      remaining = 0;
    }
  }

  const expenses = list.map((e) => updates.get(e.id) || e);
  const totalBRL = round2(applied.reduce((s, a) => s + a.amount, 0));
  return { project: { ...project, expenses }, totalBRL, count: applied.length, applied };
}
