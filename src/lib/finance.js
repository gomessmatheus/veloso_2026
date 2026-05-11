/**
 * src/lib/finance.js
 *
 * Única fonte da verdade para toda lógica financeira do Caixa.
 * Sem side-effects, sem React, sem Firestore — 100% testável em Node.
 *
 * Dependências: nenhuma (zero imports externos).
 * Compatível com ESM.
 */

// ─── Tipos canônicos ──────────────────────────────────────

/**
 * Tipos canônicos de transação no Caixa.
 * Espelha os `id` do array TX_TYPES visual em App.jsx.
 * Alterar aqui exige alterar o schema do Firestore — versionado.
 * @type {Readonly<{ENTRADA:string,SAIDA:string,IMPOSTO:string,DIVIDENDOS:string,TRANSFERENCIA:string}>}
 */
export const TX_TYPES = Object.freeze({
  ENTRADA:       "entrada",
  SAIDA:         "saida",
  IMPOSTO:       "imposto",
  DIVIDENDOS:    "dividendos",
  TRANSFERENCIA: "transferencia",
});

// ─── Predicados ───────────────────────────────────────────

/** @param {object} t transação */
export const isInflow   = (t) => t?.type === TX_TYPES.ENTRADA;

/**
 * Retorna true para saída de caixa (saida + imposto).
 * Imposto é saída para fins de SALDO mas aparece em DRE como
 * "Deduções e Impostos sobre Receita". Quem precisa do recorte
 * contábil deve usar totalSaidas + totalImpostos separadamente.
 * @param {object} t
 */
export const isOutflow  = (t) => t?.type === TX_TYPES.SAIDA
                               || t?.type === TX_TYPES.IMPOSTO;

/** @param {object} t */
export const isTax      = (t) => t?.type === TX_TYPES.IMPOSTO;

/** @param {object} t */
export const isDividend = (t) => t?.type === TX_TYPES.DIVIDENDOS;

/** @param {object} t */
export const isTransfer = (t) => t?.type === TX_TYPES.TRANSFERENCIA;

// ─── Helpers de valor ────────────────────────────────────

/**
 * Converte valor bruto para número seguro.
 * Aceita string, number, null, undefined, NaN — retorna 0 nesses casos.
 * Não tenta parsear formato BR ("1.234,56") — o setter deve normalizar.
 * @param {*} v
 * @returns {number}
 */
export function toAmount(v) {
  if (v == null) return 0;
  const n = Number(v);
  return isFinite(n) ? n : 0;
}

/**
 * Arredonda para 2 casas decimais (Math.round, sem bias de banker).
 * Aplicar apenas no retorno final de uma soma — não a cada parcela.
 * @param {number} n
 * @returns {number}
 */
export function round2(n) {
  return Math.round(n * 100) / 100;
}

/**
 * Soma os amounts de uma lista filtrando por predicado.
 * Retorna número arredondado a 2 casas.
 * @param {Array}    list
 * @param {Function} predicate  (item) => boolean
 * @returns {number}
 */
export function sum(list, predicate) {
  if (!Array.isArray(list)) return 0;
  return round2(list.filter(predicate).reduce((s, t) => s + toAmount(t.amount), 0));
}

// ─── Categorias de Custo dos Serviços Prestados (CSP) ────

/**
 * Categorias consideradas Custo direto do serviço (CSP).
 * Derivadas do DRE_MAP em App.jsx: todas mapeadas para "csp".
 *
 * TODO: confirmar com Matheus se há produtos/serviços de terceiros
 * que devem entrar no CSP mas ainda usam categoria genérica "Outros".
 * Por ora, apenas as entradas canônicas do DRE_MAP.
 *
 * @type {ReadonlyArray<string>}
 */
export const COST_CATEGORIES = Object.freeze([
  "Produção de Conteúdo",
  "Equipamento",
]);

// ─── Helper de data ───────────────────────────────────────

/**
 * Retorna "YYYY-MM-DD" de hoje em fuso local (não UTC).
 * Usando toLocaleDateString evita o bug de UTC-3 que faz
 * new Date().toISOString().substr(0,10) retornar ontem.
 * @returns {string}
 */
export function todayIsoLocal() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

// ─── Função principal de agregação ────────────────────────

/**
 * Calcula o pacote completo de agregados financeiros a partir de
 * uma lista de transações e um saldo base.
 *
 * Separação entre saida e imposto:
 *   - `totalSaidas`  = apenas type === "saida"
 *   - `totalImpostos`= apenas type === "imposto" (deduções/IR)
 *   - `totalOutflows`= totalSaidas + totalImpostos (para display "Saídas totais")
 *
 * Cadeia da DRE:
 *   receitaBruta → (- deducoes) → receitaLiquida
 *   → (- custos CSP) → lucroBruto  → margemBruta
 *   → (- despesasOperacionais) → ebitda → margemEbitda
 *   → (- dividendos) → lucroLiquido → margemLiquida
 *
 * EBITDA ≠ Margem Bruta quando há despesas operacionais além do CSP.
 * A versão anterior usava `receita - despesas` para ambos — corrigido.
 *
 * @param {Array}  transactions  Lista de objetos { type, amount, category, date, ... }
 * @param {number|string} baseBalance  Saldo base; aceita string numérica.
 * @returns {{
 *   totalEntradas: number,
 *   totalSaidas: number,
 *   totalImpostos: number,
 *   totalDividendos: number,
 *   totalOutflows: number,
 *   receitaBruta: number,
 *   deducoes: number,
 *   receitaLiquida: number,
 *   custos: number,
 *   lucroBruto: number,
 *   despesasOperacionais: number,
 *   ebitda: number,
 *   margemBruta: number,
 *   margemEbitda: number,
 *   lucroLiquido: number,
 *   margemLiquida: number,
 *   saldoTotal: number,
 * }}
 */
export function aggregate(transactions, baseBalance) {
  const txs   = Array.isArray(transactions) ? transactions : [];
  const base  = toAmount(baseBalance);

  const totalEntradas   = sum(txs, isInflow);
  const totalSaidas     = sum(txs, (t) => t?.type === TX_TYPES.SAIDA);
  const totalImpostos   = sum(txs, isTax);
  const totalDividendos = sum(txs, isDividend);
  const totalOutflows   = round2(totalSaidas + totalImpostos);

  // DRE
  const receitaBruta  = totalEntradas;
  const deducoes      = totalImpostos;
  const receitaLiquida = round2(receitaBruta - deducoes);

  const custos = round2(
    txs
      .filter((t) => t?.type === TX_TYPES.SAIDA && COST_CATEGORIES.includes(t.category))
      .reduce((s, t) => s + toAmount(t.amount), 0)
  );

  const lucroBruto           = round2(receitaLiquida - custos);
  const despesasOperacionais = round2(totalSaidas - custos); // saida não-CSP
  const ebitda               = round2(receitaLiquida - custos - despesasOperacionais);
  // ↑ simplifica para: receitaLiquida - totalSaidas

  const margemBruta  = receitaLiquida > 0 ? round2(lucroBruto  / receitaLiquida * 100) : 0;
  const margemEbitda = receitaLiquida > 0 ? round2(ebitda       / receitaLiquida * 100) : 0;

  const lucroLiquido  = round2(ebitda - totalDividendos);
  const margemLiquida = receitaLiquida > 0 ? round2(lucroLiquido / receitaLiquida * 100) : 0;

  const saldoTotal = round2(base + totalEntradas - totalOutflows - totalDividendos);

  return {
    totalEntradas,
    totalSaidas,
    totalImpostos,
    totalDividendos,
    totalOutflows,
    receitaBruta,
    deducoes,
    receitaLiquida,
    custos,
    lucroBruto,
    despesasOperacionais,
    ebitda,
    margemBruta,
    margemEbitda,
    lucroLiquido,
    margemLiquida,
    saldoTotal,
  };
}

// ─── Quebra mensal ────────────────────────────────────────

/**
 * Retorna 12 meses do ano fiscal, incluindo meses sem movimento (zerados).
 * Útil para o gráfico anual de Entradas vs Saídas.
 *
 * NOTA: comparações de data usam string ISO "YYYY-MM-DD". É O.K.
 * ordenar lexicograficamente PORQUE o formato é fixo. Se o schema
 * mudar, trocar para Date.parse().
 *
 * @param {Array}  transactions
 * @param {number} year  Ano fiscal (ex: 2026).
 * @returns {Array<{
 *   monthIndex: number,
 *   key: string,
 *   ent: number,
 *   sai: number,
 *   imp: number,
 *   div: number,
 *   net: number,
 * }>}  sai inclui apenas type==="saida"; imp separado; net = ent-sai-imp-div
 */
export function monthlyBreakdown(transactions, year) {
  const txs = Array.isArray(transactions) ? transactions : [];
  const y   = String(year);

  return Array.from({ length: 12 }, (_, m) => {
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const month = txs.filter((t) => t.date?.startsWith(key));

    const ent = round2(month.filter(isInflow).reduce((s, t) => s + toAmount(t.amount), 0));
    const sai = round2(month.filter((t) => t?.type === TX_TYPES.SAIDA).reduce((s, t) => s + toAmount(t.amount), 0));
    const imp = round2(month.filter(isTax).reduce((s, t) => s + toAmount(t.amount), 0));
    const div = round2(month.filter(isDividend).reduce((s, t) => s + toAmount(t.amount), 0));
    const net = round2(ent - sai - imp - div);

    return { monthIndex: m, key, ent, sai, imp, div, net };
  });
}

// ─── Burn Rate ───────────────────────────────────────────

/**
 * Burn Rate = média de saídas (saida + imposto) dos meses com
 * algum movimento de saída > 0 no ano informado.
 * Meses zerados NÃO entram no denominador.
 * Retorna 0 se nenhum mês qualificar.
 *
 * @param {Array}  transactions
 * @param {number} [year=currentYear]
 * @returns {number}
 */
export function burnRate(transactions, year = new Date().getFullYear()) {
  const months = monthlyBreakdown(transactions, year);
  const active = months.filter((m) => (m.sai + m.imp) > 0);
  if (!active.length) return 0;
  const total = active.reduce((s, m) => s + m.sai + m.imp, 0);
  return round2(total / active.length);
}

// ─── Liquidez ─────────────────────────────────────────────

/**
 * Liquidez em meses = saldoTotal / despesaMensalMédia.
 * despesaMensalMédia = burnRate(transactions, year).
 * Retorna Infinity se despesa média for 0 (UI deve exibir "—").
 *
 * @param {number} saldoTotal
 * @param {Array}  transactions
 * @param {number} [year=currentYear]
 * @returns {number}
 */
export function liquidityRatio(saldoTotal, transactions, year = new Date().getFullYear()) {
  const br = burnRate(transactions, year);
  if (br === 0) return Infinity;
  return round2(saldoTotal / br);
}

// ─── Compromissos futuros ─────────────────────────────────

/**
 * Compromissos futuros (parcelamentos) agrupados por mês.
 * Apenas transações com installmentTotal > 1 e date > fromIso.
 *
 * NOTA: comparações de data usam string ISO "YYYY-MM-DD". É O.K.
 * ordenar lexicograficamente PORQUE o formato é fixo. Se o schema
 * mudar, trocar para Date.parse().
 *
 * @param {Array}  transactions
 * @param {string} [fromIso=todayIsoLocal()]  Data de corte no formato "YYYY-MM-DD".
 * @returns {Array<[string, {total:number, items:Array}]>}  top 6, ordenado asc.
 */
export function futureInstallments(transactions, fromIso = todayIsoLocal()) {
  const txs = Array.isArray(transactions) ? transactions : [];
  const future = txs.filter(
    (t) =>
      t.date > fromIso &&
      t.installmentTotal > 1 &&
      (t.type === TX_TYPES.SAIDA || t.type === TX_TYPES.IMPOSTO)
  );

  /** @type {Record<string, {total:number, items:Array}>} */
  const byMonth = {};
  future.forEach((t) => {
    const key = t.date.substr(0, 7); // YYYY-MM
    if (!byMonth[key]) byMonth[key] = { total: 0, items: [] };
    byMonth[key].total = round2(byMonth[key].total + toAmount(t.amount));
    byMonth[key].items.push(t);
  });

  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(0, 6);
}
