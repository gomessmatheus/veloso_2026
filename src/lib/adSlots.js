/**
 * src/lib/adSlots.js
 *
 * Inteligência de slots de produção disponíveis por mês.
 *
 * Premissas do negócio:
 *   P1 — Stories, links de comunidade e reposts NÃO ocupam slot de produção.
 *        Apenas reels e tiktoks consomem capacidade.
 *   P2 — Capacidade atual: 6 reels/tiktoks por semana → ~26/mês.
 *   P3 — Até final de julho/2026 a produção pode crescer 30% → ~34/mês a partir de ago/2026.
 *   P4 — Exibe apenas mês corrente + 2 próximos (3 meses no total).
 *
 * Conceitos:
 *   "Capacidade mensal" = slots de reels/tiktok que a equipe consegue produzir
 *                         no mês. Usa rampa: ≤ jul/2026 → 26, ≥ ago/2026 → 34.
 *
 *   "Slots comprometidos" = reels/tiktoks ativos (não done) com plannedPostDate
 *                           no mês OU, sem data, estimados proporcionalmente
 *                           dentro do prazo do contrato.
 *
 *   "Slots disponíveis"  = capacidade − comprometidos (mínimo 0).
 *
 * Exporta:
 *   calcAdSlots({ deliverables, contracts }, months?, today?)
 *   → AdSlotsMonth[]
 */

// ─── Tipos que ocupam slot de produção ───────────────────────────────────────
const SLOT_TYPES = new Set(["reel", "tiktok"]);

/** Retorna true se o deliverable ocupa um slot de produção */
function isSlotType(d) {
  return SLOT_TYPES.has((d.type || "").toLowerCase());
}

// ─── Capacidade mensal com rampa ─────────────────────────────────────────────
const CAP_BASE    = 26;  // reels+tiktoks/mês hoje  (6/semana × ~4.33 semanas)
const CAP_RAMP    = Math.round(CAP_BASE * 1.3); // 34 — após ago/2026
const RAMP_FROM   = "2026-08"; // primeiro mês com capacidade aumentada

/** Retorna a capacidade de produção para um dado "YYYY-MM" */
function capacityForMonth(ym) {
  return ym >= RAMP_FROM ? CAP_RAMP : CAP_BASE;
}

// ─── Helpers de data ─────────────────────────────────────────────────────────

/** Converte "YYYY-MM-DD" → "YYYY-MM" */
function toYearMonth(dateStr) {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.substring(0, 7);
}

/** Retorna "YYYY-MM" para um Date */
function dateToYM(d) {
  return d.toISOString().substring(0, 7);
}

/** Adiciona N meses a um Date (retorna novo Date) */
function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

// ─── Tipos para JSDoc ────────────────────────────────────────────────────────
/**
 * @typedef {Object} AdSlotsMonth
 * @property {string}  month     - "YYYY-MM"
 * @property {string}  label     - "Mai 2026"
 * @property {number}  capacity  - slots de produção disponíveis no mês
 * @property {number}  committed - reels/tiktoks já planejados
 * @property {number}  available - max(0, capacity − committed)
 * @property {number}  pctUsed   - 0–100
 * @property {AdSlotsBreakdown[]} breakdown
 */

/**
 * @typedef {Object} AdSlotsBreakdown
 * @property {string}  contractId
 * @property {string}  company
 * @property {number}  count
 * @property {boolean} estimated
 */

// ─── Função principal ────────────────────────────────────────────────────────
/**
 * Calcula slots de produção disponíveis para os próximos N meses.
 * Por padrão retorna 3 meses (mês atual + 2 próximos).
 *
 * SIMPLIFICADO: entregáveis SEM data de postagem não são mais distribuídos
 * "estimativamente" pelos meses (era confuso) — são contados à parte em
 * `undated` para exibição como aviso ("N sem data").
 *
 * @param {{ deliverables: object[], contracts: object[] }} data
 * @param {number} [months=3]
 * @param {Date}   [today]
 * @returns {{ months: AdSlotsMonth[], undated: { count: number, byContract: AdSlotsBreakdown[] } }}
 */
export function calcAdSlots({ deliverables = [], contracts = [] }, months = 3, today = new Date()) {
  const todayYM       = dateToYM(today);
  const activeContracts = contracts.filter(c => !c.archived);

  // Mapa: "YYYY-MM" → { [contractId]: { company, count } }
  const slotMap = {};
  const addSlot = (ym, contractId, company) => {
    if (!slotMap[ym]) slotMap[ym] = {};
    if (!slotMap[ym][contractId]) slotMap[ym][contractId] = { company, count: 0 };
    slotMap[ym][contractId].count += 1;
  };

  const undatedByContract = new Map();

  for (const contract of activeContracts) {
    // Apenas reels e tiktoks — stories/links/reposts não ocupam slot (P1)
    const cDelivs = deliverables.filter(
      d => d.contractId === contract.id &&
           d.stage !== "done" &&
           isSlotType(d)
    );

    for (const d of cDelivs) {
      const ym = toYearMonth(d.plannedPostDate);
      if (ym) {
        if (ym >= todayYM) addSlot(ym, contract.id, contract.company);
      } else {
        const cur = undatedByContract.get(contract.id) || { contractId: contract.id, company: contract.company, count: 0 };
        cur.count += 1;
        undatedByContract.set(contract.id, cur);
      }
    }
  }

  // Monta resultado para N meses a partir do mês atual
  const result = [];
  for (let i = 0; i < months; i++) {
    const d   = addMonths(today, i);
    const ym  = dateToYM(d);
    const cap = capacityForMonth(ym); // P2 + P3

    const breakdown = slotMap[ym]
      ? Object.entries(slotMap[ym]).map(([cid, info]) => ({
          contractId: cid, company: info.company, count: info.count, estimated: false,
        }))
      : [];

    const committed = breakdown.reduce((s, b) => s + b.count, 0);
    const available = Math.max(0, cap - committed);
    const pctUsed   = Math.min(100, Math.round((committed / cap) * 100));

    const label = d
      .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(".", "")
      .replace(/^\w/, c => c.toUpperCase());

    result.push({ month: ym, label, capacity: cap, committed, available, pctUsed, breakdown });
  }

  const undatedList = [...undatedByContract.values()].sort((a, b) => b.count - a.count);
  return {
    months: result,
    undated: { count: undatedList.reduce((s, u) => s + u.count, 0), byContract: undatedList },
  };
}
