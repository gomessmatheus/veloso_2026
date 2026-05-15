/**
 * src/lib/monthlyRollover.js
 *
 * Rollover automático de contratos mensais.
 *
 * Conceito:
 *   Contratos com paymentType === "monthly" têm um número fixo de
 *   entregáveis por mês (numPosts reels, numStories stories, etc.).
 *   Na virada de cada mês, o sistema cria automaticamente os
 *   entregáveis do novo mês se ainda não existirem.
 *
 * Regras:
 *   1. Só processa contratos com paymentType === "monthly".
 *   2. Só processa se o contrato tiver contractStart e contractDeadline.
 *   3. Para cada mês entre contractStart e contractDeadline (inclusive)
 *      que seja <= mês atual, verifica se já existem entregáveis com
 *      título contendo o sufixo " · <AAAA-MM>". Se não existirem,
 *      cria-os com stage "briefing" e plannedPostDate vazio.
 *   4. Nunca duplica: se o mês já tem entregáveis, não cria novos.
 *   5. Retorna array de novos entregáveis criados (pode ser vazio).
 *
 * Exporta:
 *   rolloverMonthlyContracts({ contracts, deliverables, today? })
 *   → deliverable[]   (os novos a serem persistidos)
 */

/** Mapa de campos do contrato → tipo de entregável */
const TYPE_MAP = [
  { key: "numPosts",           type: "reel",    label: "Reel"  },
  { key: "numStories",         type: "story",   label: "Story" },
  { key: "numCommunityLinks",  type: "link",    label: "Link"  },
  { key: "numReposts",         type: "tiktok",  label: "TikTok"},
];

/** Gera um id simples baseado em timestamp + random */
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/** Converte "YYYY-MM-DD" (ou "YYYY-MM") para "YYYY-MM" */
function toYM(dateStr) {
  if (!dateStr || dateStr.length < 7) return null;
  return dateStr.substring(0, 7);
}

/** Retorna lista de "YYYY-MM" entre start e end (inclusive) */
function monthsInRange(startYM, endYM) {
  const months = [];
  const [sy, sm] = startYM.split("-").map(Number);
  const [ey, em] = endYM.split("-").map(Number);
  let y = sy, m = sm;
  while (y < ey || (y === ey && m <= em)) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return months;
}

/**
 * Calcula os entregáveis mensais que ainda precisam ser criados.
 *
 * @param {{ contracts: object[], deliverables: object[], today?: Date }} param
 * @returns {object[]}  — novos entregáveis prontos para persistir
 */
export function rolloverMonthlyContracts({ contracts = [], deliverables = [], today = new Date() }) {
  const todayYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
  const toCreate = [];

  for (const c of contracts) {
    // Somente contratos mensais com datas válidas
    if (c.paymentType !== "monthly") continue;
    if (!c.contractStart || !c.contractDeadline) continue;
    if (c.archived) continue;

    const startYM = toYM(c.contractStart);
    const endYM   = toYM(c.contractDeadline);
    if (!startYM || !endYM) continue;

    // Meses a processar: do início até hoje (não cria meses futuros além do corrente)
    const capYM   = todayYM < endYM ? todayYM : endYM;
    const months  = monthsInRange(startYM, capYM);

    for (const ym of months) {
      // Entregáveis já existentes para este contrato neste mês
      const suffix  = ` · ${ym}`;
      const existing = deliverables.filter(
        d => d.contractId === c.id && d.title && d.title.endsWith(suffix)
      );

      // Se já existe pelo menos um entregável com esse sufixo, pula o mês
      if (existing.length > 0) continue;

      // Cria entregáveis para o mês
      TYPE_MAP.forEach(({ key, type, label }) => {
        const n = Number(c[key]) || 0;
        for (let i = 1; i <= n; i++) {
          toCreate.push({
            id:                uid(),
            contractId:        c.id,
            title:             `${label} ${c.company} #${i}${suffix}`,
            type,
            stage:             "briefing",
            plannedPostDate:   "",
            notes:             "",
            responsible:       {},
            stageDateOverrides:{},
            sortOrder:         0,
            createdAt:         new Date().toISOString(),
          });
        }
      });
    }
  }

  return toCreate;
}
