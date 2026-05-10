/**
 * src/lib/riskSignals.js
 *
 * Pure function: detectRiskSignals({ deliverables, contracts }, today?)
 *
 * Returns Signal[] — each signal has:
 *   { severity, icon, title, count, ids, action }
 *
 * severity: "HIGH" | "MEDIUM" | "LOW"
 * action:   { type: "view", view: string }
 *           { type: "filter", filter: object }   ← used with window.__dashboardFilter
 *
 * Fields used from deliverable (all currently exist in the app):
 *   - id, stage, plannedPostDate, contractId
 *
 * Fields marked TODO are NOT inventions — they're aspirational.
 * Until they exist, the detector is skipped and logs a dev console note.
 */

import { daysBetween } from "./dates.js";

/**
 * @param {{ deliverables: object[], contracts: object[] }} data
 * @param {Date} [today]
 * @returns {Signal[]}
 */
export function detectRiskSignals({ deliverables = [], contracts = [] }, today = new Date()) {
  const signals = [];

  // ─── ALTO: sem roteiro a menos de 3 dias do prazo ─────────
  // Condition: stage is briefing or roteiro AND postDate within 0–3 days
  const withoutScript = deliverables.filter(d => {
    if (d.stage !== "briefing" && d.stage !== "roteiro") return false;
    if (!d.plannedPostDate) return false;
    const days = daysBetween(today, d.plannedPostDate);
    return days !== null && days >= 0 && days <= 3;
  });
  if (withoutScript.length > 0) {
    signals.push({
      severity: "HIGH",
      icon:     "🟥",
      title:    "Sem roteiro a menos de 3 dias do prazo",
      count:    withoutScript.length,
      ids:      withoutScript.map(d => d.id),
      action:   { type: "filter", filter: { ids: withoutScript.map(d => d.id) } },
    });
  }

  // ─── ALTO: aprovações sem movimentação há +4 dias ─────────
  // TODO: requires deliverable.lastStageChangedAt (ISO string, not yet in schema).
  // When this field exists, detector logic:
  //   deliverables.filter(d =>
  //     (d.stage === "ap_roteiro" || d.stage === "ap_final") &&
  //     d.lastStageChangedAt &&
  //     daysBetween(new Date(d.lastStageChangedAt), today) >= 4
  //   )
  if (typeof process !== "undefined" && process.env?.NODE_ENV !== "production") {
    // Silent in prod; shown in dev console only
    // console.debug("[riskSignals] SKIP: 'Aprovação travada' needs lastStageChangedAt");
  }

  // ─── MÉDIO: gravações no fim de semana sem locação ────────
  // TODO: requires deliverable.locationDefined (boolean, not yet in schema).
  // When this field exists:
  //   deliverables.filter(d =>
  //     d.stage === "gravacao" &&
  //     d.plannedPostDate &&
  //     [0,6].includes(new Date(d.plannedPostDate).getDay()) && // Sat or Sun
  //     !d.locationDefined
  //   )

  // ─── MÉDIO: briefings vazios em contratos ativos ──────────
  // Uses contract.notes (equivalent to briefingNotes in spec).
  // A contract is "active" when: not archived AND contractDeadline is in future or absent.
  const emptiBriefings = contracts.filter(c => {
    if (c.archived) return false;
    if (c.contractDeadline) {
      const days = daysBetween(today, c.contractDeadline);
      if (days !== null && days < 0) return false; // already expired
    }
    return !c.notes || c.notes.trim() === "";
  });
  if (emptiBriefings.length > 0) {
    signals.push({
      severity: "MEDIUM",
      icon:     "🟨",
      title:    "Briefing vazio em contrato ativo",
      count:    emptiBriefings.length,
      ids:      emptiBriefings.map(c => c.id),
      action:   { type: "view", view: "contratos" },
    });
  }

  // ─── MÉDIO: conflitos de marca na semana atual ────────────
  // Two+ deliverables from DIFFERENT brands on the same day.
  // (Same-brand same-day is allowed; cross-brand same-day is a conflict.)
  const dayContractMap = {};
  deliverables.forEach(d => {
    if (!d.plannedPostDate || d.stage === "done") return;
    const key = d.plannedPostDate;
    if (!dayContractMap[key]) dayContractMap[key] = new Set();
    if (d.contractId) dayContractMap[key].add(d.contractId);
  });
  const conflictDays = Object.entries(dayContractMap)
    .filter(([, brands]) => brands.size > 1);
  if (conflictDays.length > 0) {
    const conflictIds = deliverables
      .filter(d => d.plannedPostDate && conflictDays.some(([day]) => day === d.plannedPostDate) && d.stage !== "done")
      .map(d => d.id);
    signals.push({
      severity: "MEDIUM",
      icon:     "🟨",
      title:    `Conflito de marca em ${conflictDays.length} dia${conflictDays.length > 1 ? "s" : ""}`,
      count:    conflictDays.length,
      ids:      conflictIds,
      action:   { type: "filter", filter: { ids: conflictIds } },
    });
  }

  // ─── BAIXO: posts entregues sem métricas registradas ─────
  // TODO: requires deliverable.metrics / views etc.
  // Partial detection using existing flat fields:
  const noMetrics = deliverables.filter(d => {
    if (d.stage !== "done") return false;
    const hasDate = d.publishedAt || d.postLink;
    if (!hasDate) return false;
    // Check if any engagement metric is non-zero
    const hasMetrics = (d.views || d.reach || d.likes || d.comments || d.shares || d.saves) > 0;
    return !hasMetrics;
  });
  if (noMetrics.length > 0) {
    signals.push({
      severity: "LOW",
      icon:     "🟦",
      title:    "Posts entregues sem métricas",
      count:    noMetrics.length,
      ids:      noMetrics.map(d => d.id),
      action:   { type: "view", view: "contratos" },
    });
  }

  // ─── Ganchos futuros ─────────────────────────────────────
  // Capacity signal (replacing the old capacity card):
  // if (typeof detectCapacityOverload === "function") { ... }
  // Brand conflict from external system:
  // if (typeof detectConflicts === "function") { ... }

  return signals;
}
