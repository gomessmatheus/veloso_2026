/**
 * src/lib/conflicts.js
 *
 * Pure conflict-detection for the scheduling system.
 * No side-effects, no React, no Firestore — safe to unit-test in isolation.
 *
 * Simplified TypeDoc shapes (no TypeScript runtime):
 *
 * Conflict {
 *   severity:                  'BLOCK' | 'WARN' | 'INFO'
 *   message:                   string
 *   conflictingDeliverableIds: string[]
 *   reason: 'SAME_CATEGORY' | 'STRICT_EXCLUSIVITY' | 'SAME_DAY_DIFFERENT_BRAND'
 * }
 *
 * Brand must have: { id, category, exclusivityWindowDays?, blockConflicts? }
 * Contract must have: { id, brandId?, exclusivityOverride? }
 *   exclusivityOverride: 'DEFAULT' | 'STRICT' | 'NONE'
 * Deliverable must have: { id, contractId, plannedPostDate, stage }
 */

/** Severity rank for deduplication — higher wins. */
const RANK = { BLOCK: 3, WARN: 2, INFO: 1 };

const DEFAULT_WINDOW = 7; // days

/**
 * Categorias genéricas não carregam semântica competitiva e não devem
 * acionar conflito de mesma categoria. "OUTROS" é o valor padrão de toda
 * marca criada sem categoria explícita — tratá-lo como exclusivo geraria
 * falsos positivos entre marcas de segmentos completamente diferentes.
 */
const GENERIC_CATEGORIES = new Set(["OUTROS", ""]);

// ─── Helpers ─────────────────────────────────────────────

/**
 * Parse "YYYY-MM-DD" to midnight UTC Date. Returns null on failure.
 * Using T12:00:00 avoids DST / timezone shifts that could change the day.
 * @param {string} s
 * @returns {Date|null}
 */
function parseDate(s) {
  if (!s || typeof s !== "string") return null;
  try {
    const d = new Date(s + "T12:00:00");
    return isNaN(d.getTime()) ? null : d;
  } catch { return null; }
}

/**
 * Calendar-day difference (ignores hours/minutes).
 * @param {Date} a
 * @param {Date} b
 * @returns {number}  absolute number of days
 */
function absDays(a, b) {
  const msPerDay = 86_400_000;
  const aDay = Math.floor(a.getTime() / msPerDay);
  const bDay = Math.floor(b.getTime() / msPerDay);
  return Math.abs(aDay - bDay);
}

/** "2026-06-10" → "10/06" */
function shortDate(s) {
  if (!s) return "?";
  const [, m, d] = s.split("-");
  return `${d}/${m}`;
}

// ─── Main function ────────────────────────────────────────

/**
 * Detect scheduling conflicts for a candidate deliverable date.
 *
 * Performance: only deliverables within the largest possible exclusivity
 * window (max 30 days) are evaluated. The rest are discarded early.
 *
 * @param {{ date: string, brandId: string|undefined, contractId: string }} candidate
 * @param {object[]} existing   All deliverables EXCEPT the candidate itself
 * @param {object[]} brands
 * @param {object[]} contracts
 * @returns {Conflict[]}  sorted: BLOCK first, then WARN, then INFO
 */
export function detectConflicts(candidate, existing, brands, contracts) {
  const { date, brandId, contractId } = candidate;

  const candidateDate = parseDate(date);
  if (!candidateDate) return []; // invalid date → can't check

  const candidateContract = contracts.find(c => c.id === contractId) || null;
  const candidateBrand    = brands.find(b => b.id === brandId) || null;

  // Contract-level override takes priority
  const candidateOverride = candidateContract?.exclusivityOverride || "DEFAULT";
  if (candidateOverride === "NONE") return []; // this contract is exempt

  const candidateWindow   = candidateBrand?.exclusivityWindowDays ?? DEFAULT_WINDOW;
  const candidateCategory = candidateBrand?.category || null;
  const candidateBlocks   = !!candidateBrand?.blockConflicts;

  // Pre-filter: keep only deliverables within MAX_WINDOW (perf guard)
  const MAX_WINDOW = 30;
  const near = existing.filter(d => {
    if (!d.plannedPostDate) return false;
    if (d.stage === "done")  return false; // published — done is done
    const dDate = parseDate(d.plannedPostDate);
    if (!dDate) return false;
    return absDays(candidateDate, dDate) <= MAX_WINDOW;
  });

  const conflicts = [];

  for (const d of near) {
    const otherContract = contracts.find(c => c.id === d.contractId) || null;
    const otherBrand    = brands.find(b => b.id === otherContract?.brandId) || null;

    // ── Same brand → never a conflict ───────────────────
    const sameBrandId   = candidateBrand && otherBrand && candidateBrand.id === otherBrand.id;
    const sameLegacyName =
      !candidateBrand && !otherBrand &&
      candidateContract?.company &&
      otherContract?.company === candidateContract.company;
    if (sameBrandId || sameLegacyName) continue;

    // ── Other contract is exempt ─────────────────────────
    const otherOverride = otherContract?.exclusivityOverride || "DEFAULT";
    if (otherOverride === "NONE") continue;

    const otherDate    = parseDate(d.plannedPostDate);
    const daysDiff     = absDays(candidateDate, otherDate);
    const otherWindow  = otherBrand?.exclusivityWindowDays ?? DEFAULT_WINDOW;
    const effectiveWin = Math.max(candidateWindow, otherWindow);
    const otherBlocks  = !!otherBrand?.blockConflicts;

    if (daysDiff > effectiveWin) continue; // outside effective window

    const isSameDay    = daysDiff === 0;
    const otherName    = otherBrand?.name || otherContract?.company || "outra marca";
    const dateLabel    = shortDate(d.plannedPostDate);

    // ── STRICT ───────────────────────────────────────────
    if (candidateOverride === "STRICT" || otherOverride === "STRICT") {
      conflicts.push({
        severity:                  "BLOCK",
        message:                   `Exclusividade estrita: ${otherName} está agendado para ${dateLabel}.`,
        conflictingDeliverableIds: [d.id],
        reason:                    "STRICT_EXCLUSIVITY",
      });
      continue;
    }

    // ── Same category ────────────────────────────────────
    // Categorias genéricas ("OUTROS") não têm semântica competitiva —
    // ignorá-las evita falsos positivos entre marcas de segmentos distintos
    // que nunca tiveram a categoria definida explicitamente.
    if (
      candidateCategory &&
      otherBrand?.category &&
      candidateCategory === otherBrand.category &&
      !GENERIC_CATEGORIES.has(candidateCategory)
    ) {
      const severity = (candidateBlocks || otherBlocks) ? "BLOCK" : "WARN";
      conflicts.push({
        severity,
        message:                   `Mesma categoria com ${otherName} em ${dateLabel} (dentro de ${effectiveWin}d).`,
        conflictingDeliverableIds: [d.id],
        reason:                    "SAME_CATEGORY",
      });
      continue;
    }

    // ── Same day, different category ─────────────────────
    if (isSameDay) {
      conflicts.push({
        severity:                  "INFO",
        message:                   `${otherName} também posta neste dia — atenção à saturação do feed.`,
        conflictingDeliverableIds: [d.id],
        reason:                    "SAME_DAY_DIFFERENT_BRAND",
      });
    }
  }

  // Deduplicate by deliverable id — keep highest severity per conflicting item
  const byId = new Map();
  for (const c of conflicts) {
    const key = c.conflictingDeliverableIds[0];
    const prev = byId.get(key);
    if (!prev || RANK[c.severity] > RANK[prev.severity]) byId.set(key, c);
  }

  // Sort: BLOCK → WARN → INFO
  return [...byId.values()].sort((a, b) => RANK[b.severity] - RANK[a.severity]);
}

/**
 * Convenience: given a list of deliverables, return a map of
 * { dateStr → highest-severity conflict found on that date }
 * for calendar visual marking.
 *
 * @param {object[]} deliverables
 * @param {object[]} brands
 * @param {object[]} contracts
 * @returns {{ [dateStr: string]: 'BLOCK'|'WARN'|'INFO' }}
 */
export function buildConflictDateMap(deliverables, brands, contracts) {
  const map = {};

  // Only worth running if there's brand data
  if (!brands.length) return map;

  deliverables.forEach(d => {
    if (!d.plannedPostDate || d.stage === "done") return;
    const contract = contracts.find(c => c.id === d.contractId);
    if (!contract) return;

    const candidate = {
      date:       d.plannedPostDate,
      brandId:    contract.brandId,
      contractId: d.contractId,
    };
    const others  = deliverables.filter(x => x.id !== d.id);
    const found   = detectConflicts(candidate, others, brands, contracts);
    if (!found.length) return;

    const highest = found[0].severity; // already sorted BLOCK first
    const prev    = map[d.plannedPostDate];
    if (!prev || RANK[highest] > RANK[prev]) {
      map[d.plannedPostDate] = highest;
    }
  });

  return map;
}
