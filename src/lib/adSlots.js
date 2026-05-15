/**
 * src/lib/adSlots.js
 *
 * Inteligência de slots de publicidade disponíveis por mês.
 *
 * Conceito:
 *   - "Capacidade mensal" = número máximo de posts patrocinados que o criador
 *     pode publicar em um mês. Calculado como média de posts dos últimos 3 meses
 *     com base nos deliverables done, ou fallback para um valor configurável.
 *
 *   - "Slots comprometidos" = deliverables ativos (não done) cujo plannedPostDate
 *     cai no mês OU, para deliverables sem data, estimados proporcionalmente
 *     dentro do prazo do contrato.
 *
 *   - "Slots disponíveis" = capacidade - comprometidos (mínimo 0)
 *
 * Campos usados:
 *   deliverable: { id, contractId, type, stage, plannedPostDate }
 *   contract:    { id, archived, contractDeadline, contractStart,
 *                  numPosts, numStories, numCommunityLinks, numReposts }
 *
 * Exporta:
 *   calcAdSlots({ deliverables, contracts }, months?, today?)
 *   → AdSlotsResult[]  (um item por mês)
 */

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
    const [y, m] = yearMonth.split('-').map(Number);
    const days = new Date(y, m, 0).getDate(); // total de dias no mês
  let count = 0;
    for (let d = 1; d <= days; d++) {
          const dow = new Date(y, m - 1, d).getDay();
          if (dow !== 0 && dow !== 6) count++;
    }
    return count;
}

/**
 * Estima quantos deliverables "sem data" de um contrato caem em cada mês.
 *
 * Estratégia: distribui uniformemente os entregáveis pendentes sem data ao
 * longo dos meses ainda disponíveis dentro do prazo (ou dos próximos 6 meses
 * se não houver prazo).
 *
 * Retorna um Map<"YYYY-MM", number> com a fração de cada mês.
 */
function distributeUndated({ contract, undatedCount, today }) {
    const result = new Map();
    if (undatedCount <= 0) return result;

  const start = today;
    let end;
    if (contract.contractDeadline) {
          end = new Date(contract.contractDeadline + 'T12:00:00');
          if (end < start) end = addMonths(start, 3); // prazo já passou → distribui 3 meses
    } else {
          end = addMonths(start, 6); // sem prazo → janela de 6 meses
    }

  // Monta lista de meses entre start e end
  const months = [];
    let cur = new Date(start.getFullYear(), start.getMonth(), 1);
    const endYM = dateToYM(end);
    while (dateToYM(cur) <= endYM) {
          months.push(dateToYM(cur));
          cur = addMonths(cur, 1);
    }
    if (months.length === 0) return result;

  // Distribui proporcionalmente pelo número de dias úteis de cada mês
  const weights = months.map(m => weekdaysInMonth(m));
    const totalW = weights.reduce((a, b) => a + b, 0);

  months.forEach((m, i) => {
        result.set(m, (undatedCount * weights[i]) / totalW);
  });

  return result;
}

/**
 * Calcula a capacidade mensal histórica do criador.
 *
 * Usa os deliverables marcados como "done" nos últimos `lookbackMonths` meses.
 * Retorna a média de posts/mês, com mínimo de FALLBACK_CAPACITY.
 */
const FALLBACK_CAPACITY = 12; // posts patrocinados/mês se não houver histórico

function calcMonthlyCapacity(deliverables, today, lookbackMonths = 3) {
    const cutoff = addMonths(today, -lookbackMonths);
    const cutoffYM = dateToYM(cutoff);
    const todayYM  = dateToYM(today);

  const counts = {};
    for (const d of deliverables) {
          if (d.stage !== 'done') continue;
          const ym = toYearMonth(d.plannedPostDate);
          if (!ym || ym < cutoffYM || ym >= todayYM) continue;
          counts[ym] = (counts[ym] || 0) + 1;
    }

  const vals = Object.values(counts);
    if (vals.length === 0) return FALLBACK_CAPACITY;

  // Preenche meses vazios no período (mês sem post = 0)
  for (let i = 0; i < lookbackMonths; i++) {
        const ym = dateToYM(addMonths(today, -(i + 1)));
        if (!counts[ym]) vals.push(0);
  }

  return Math.round(vals.reduce((a, b) => a + b, 0) / lookbackMonths);
}

/**
 * @typedef {Object} AdSlotsMonth
 * @property {string} month         - "YYYY-MM"
 * @property {string} label         - "Mai 2026"
 * @property {number} capacity      - capacidade estimada do criador no mês
 * @property {number} committed     - slots já comprometidos (contratos ativos)
 * @property {number} available     - max(0, capacity - committed)
 * @property {number} pctUsed       - 0–100 percentual comprometido
 * @property {AdSlotsBreakdown[]} breakdown - detalhe por contrato
 */

/**
 * @typedef {Object} AdSlotsBreakdown
 * @property {string} contractId
 * @property {string} company
 * @property {number} count         - slots comprometidos neste contrato neste mês
 * @property {boolean} estimated    - true = estimativa (sem data definida)
 */

/**
 * Calcula slots de publicidade disponíveis para os próximos N meses.
 *
 * @param {{ deliverables: object[], contracts: object[] }} data
 * @param {number} [months=6]  - quantos meses futuros calcular
 * @param {Date}   [today]
 * @returns {AdSlotsMonth[]}
 */
export function calcAdSlots({ deliverables = [], contracts = [] }, months = 6, today = new Date()) {
    const todayYM = dateToYM(today);
    const activeContracts = contracts.filter(c => !c.archived);

  // 1. Capacidade histórica
  const capacity = calcMonthlyCapacity(deliverables, today);

  // 2. Para cada contrato ativo, separar:
  //    (a) deliverables com data  → contribuem direto ao seu mês
  //    (b) deliverables sem data → distribuir por distributeUndated

  // Mapa: "YYYY-MM" → { [contractId]: { company, count, estimated } }
  const slotMap = {};

  const ensureMonth = (ym) => {
        if (!slotMap[ym]) slotMap[ym] = {};
  };
    const addSlot = (ym, contractId, company, amount, estimated) => {
          ensureMonth(ym);
          if (!slotMap[ym][contractId]) {
                  slotMap[ym][contractId] = { company, count: 0, estimated };
          }
          slotMap[ym][contractId].count += amount;
          if (!estimated) slotMap[ym][contractId].estimated = false; // marca como confirmado se ao menos 1 tem data
    };

  for (const contract of activeContracts) {
        const cDelivs = deliverables.filter(
                d => d.contractId === contract.id && d.stage !== 'done'
              );
        const withDate    = cDelivs.filter(d => d.plannedPostDate && d.plannedPostDate.length >= 7);
        const withoutDate = cDelivs.filter(d => !d.plannedPostDate || d.plannedPostDate.length < 7);

      // (a) Com data — só conta meses futuros/correntes
      for (const d of withDate) {
              const ym = toYearMonth(d.plannedPostDate);
              if (ym && ym >= todayYM) {
                        addSlot(ym, contract.id, contract.company, 1, false);
              }
      }

      // (b) Sem data — distribui estimado
      const distMap = distributeUndated({
              contract,
              undatedCount: withoutDate.length,
              today,
      });
        for (const [ym, frac] of distMap.entries()) {
                if (ym >= todayYM) {
                          addSlot(ym, contract.id, contract.company, frac, true);
                }
        }
  }

  // 3. Monta resultado para os próximos N meses
  const result = [];
    for (let i = 0; i < months; i++) {
          const d = addMonths(today, i);
          const ym = dateToYM(d);

      const contractEntries = slotMap[ym] ? Object.entries(slotMap[ym]) : [];
          const breakdown = contractEntries.map(([cid, info]) => ({
                  contractId: cid,
                  company: info.company,
                  count: info.count,
                  estimated: info.estimated,
          }));

      const committed = breakdown.reduce((s, b) => s + b.count, 0);
          const available = Math.max(0, capacity - committed);
          const pctUsed   = capacity > 0 ? Math.min(100, Math.round((committed / capacity) * 100)) : 100;

      // Label em pt-BR
      const label = d.toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' })
            .replace('.', '').replace(/^\w/, c => c.toUpperCase());

      result.push({ month: ym, label, capacity, committed, available, pctUsed, breakdown });
    }

  return result;
}
