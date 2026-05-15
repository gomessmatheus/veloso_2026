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

/** Número de dias úteis em um mês (aprox. — exclui sáb/dom) */
function weekdaysInMonth(yearMonth) {
  const [y, m] = yearMonth.split("-").map(Number);
  const days = new Date(y, m, 0).getDate();
  let count = 0;
  for (let d = 1; d <= days; d++) {
    const dow = new Date(y, m - 1, d).getDay();
    if (dow !== 0 && dow !== 6) count++;
  }
  return count;
}

// ─── Distribuição de entregáveis sem data ────────────────────────────────────
/**
 * Distribui reels/tiktoks sem data ao longo dos meses disponíveis
 * dentro do prazo do contrato (ou próximos 3 meses se sem prazo).
 * Retorna Map<"YYYY-MM", number>.
 */
function distributeUndated({ contract, undatedCount, today }) {
  const result = new Map();
  if (undatedCount <= 0) return result;

  const start = today;
  let end;
  if (contract.contractDeadline) {
    end = new Date(contract.contractDeadline + "T12:00:00");
    if (end < start) end = addMonths(start, 3);
  } else {
    end = addMonths(start, 3); // sem prazo → janela de 3 meses
  }

  const months = [];
  let cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endYM = dateToYM(end);
  while (dateToYM(cur) <= endYM) {
    months.push(dateToYM(cur));
    cur = addMonths(cur, 1);
  }
  if (months.length === 0) return result;

  const weights = months.map(m => weekdaysInMonth(m));
  const totalW  = weights.reduce((a, b) => a + b, 0);
  months.forEach((m, i) => {
    result.set(m, (undatedCount * weights[i]) / totalW);
  });
  return result;
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
 * @param {{ deliverables: object[], contracts: object[] }} data
 * @param {number} [months=3]
 * @param {Date}   [today]
 * @returns {AdSlotsMonth[]}
 */
export function calcAdSlots({ deliverables = [], contracts = [] }, months = 3, today = new Date()) {
  const todayYM       = dateToYM(today);
  const activeContracts = contracts.filter(c => !c.archived);

  // Mapa: "YYYY-MM" → { [contractId]: { company, count, estimated } }
  const slotMap = {};

  const ensureMonth = (ym) => { if (!slotMap[ym]) slotMap[ym] = {}; };

  const addSlot = (ym, contractId, company, amount, estimated) => {
    ensureMonth(ym);
    if (!slotMap[ym][contractId]) {
      slotMap[ym][contractId] = { company, count: 0, estimated };
    }
    slotMap[ym][contractId].count += amount;
    // Se ao menos 1 item tem data confirmada, marca como confirmado
    if (!estimated) slotMap[ym][contractId].estimated = false;
  };

  for (const contract of activeContracts) {
    // Apenas reels e tiktoks — stories/links/reposts não ocupam slot (P1)
    const cDelivs = deliverables.filter(
      d => d.contractId === contract.id &&
           d.stage !== "done" &&
           isSlotType(d)
    );

    const withDate    = cDelivs.filter(d => d.plannedPostDate && d.plannedPostDate.length >= 7);
    const withoutDate = cDelivs.filter(d => !d.plannedPostDate || d.plannedPostDate.length < 7);

    // (a) Com data → contribui direto ao mês
    for (const d of withDate) {
      const ym = toYearMonth(d.plannedPostDate);
      if (ym && ym >= todayYM) {
        addSlot(ym, contract.id, contract.company, 1, false);
      }
    }

    // (b) Sem data → distribui estimado dentro do prazo
    const distMap = distributeUndated({ contract, undatedCount: withoutDate.length, today });
    for (const [ym, frac] of distMap.entries()) {
      if (ym >= todayYM) {
        addSlot(ym, contract.id, contract.company, frac, true);
      }
    }
  }

  // Monta resultado para N meses a partir do mês atual
  const result = [];
  for (let i = 0; i < months; i++) {
    const d   = addMonths(today, i);
    const ym  = dateToYM(d);
    const cap = capacityForMonth(ym); // P2 + P3

    const contractEntries = slotMap[ym] ? Object.entries(slotMap[ym]) : [];
    const breakdown = contractEntries.map(([cid, info]) => ({
      contractId: cid,
      company:    info.company,
      count:      info.count,
      estimated:  info.estimated,
    }));

    const committed = breakdown.reduce((s, b) => s + b.count, 0);
    const available = Math.max(0, cap - committed);
    const pctUsed   = Math.min(100, Math.round((committed / cap) * 100));

    const label = d
      .toLocaleDateString("pt-BR", { month: "short", year: "numeric" })
      .replace(".", "")
      .replace(/^\w/, c => c.toUpperCase());

    result.push({ month: ym, label, capacity: cap, committed, available, pctUsed, breakdown });
  }

  return result;
}
