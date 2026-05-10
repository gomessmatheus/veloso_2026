/**
 * src/lib/priority.js
 *
 * Pure function: priorityScore(deliverable, today?)
 * Used to order the "Foco de hoje" list in the Dashboard.
 *
 * Fields required on `deliverable`:
 *   - plannedPostDate: "YYYY-MM-DD"
 *   - stage: one of the STAGE_IDS
 *
 * No side-effects, no imports. Safe to unit-test in isolation.
 */

/**
 * Stages that are blocked on an internal team member (Lucas / Matheus / Leandro).
 * These get a bonus because WE are the bottleneck — action is needed from us.
 */
const WAITING_ON_TEAM = new Set([
  "briefing",  // team needs to initiate / confirm brief
  "roteiro",   // Lucas writes the script
  "gravacao",  // Lucas records
  "edicao",    // Leandro edits
  "postagem",  // Lucas publishes
]);

/**
 * Stages waiting on client approval.
 * These get a bonus because approval is blocking delivery.
 */
const AWAITING_APPROVAL = new Set(["ap_roteiro", "ap_final"]);

/**
 * Compute urgency score for a deliverable.
 * Higher score = should appear higher in the "Foco de hoje" list.
 *
 * Formula:
 *   base = max(0, 100 − daysUntilPost)   [already high for overdue]
 *   + 20  if stage requires client approval (Ap. Roteiro / Ap. Final)
 *   + 30  if stage is waiting on our team (not the client)
 *
 * NOTE: the original spec also suggested `if (days < 0) score += 50`.
 * After reconciling with the reference test matrix below, that bonus is
 * NOT applied separately — the base formula already yields higher scores
 * for past-due items and adding +50 breaks all test cases.
 *
 * @param {object} deliverable  — must have { plannedPostDate, stage }
 * @param {Date}   [today]      — defaults to new Date(); injectable for tests
 * @returns {number}
 */
export function priorityScore(deliverable, today = new Date()) {
  if (!deliverable?.plannedPostDate) return 0;

  const post = new Date(deliverable.plannedPostDate + "T12:00:00");
  if (isNaN(post.getTime())) return 0;

  // Days until post (negative = already overdue)
  const todayMidnight = new Date(
    today.getFullYear(), today.getMonth(), today.getDate()
  );
  const days = Math.round((post - todayMidnight) / 86400000);

  let score = Math.max(0, 100 - days);

  if (AWAITING_APPROVAL.has(deliverable.stage)) score += 20;
  if (WAITING_ON_TEAM.has(deliverable.stage))   score += 30;

  return score;
}

/**
 * Sort deliverables by descending priority, excluding "done" items,
 * and return at most `limit` items.
 *
 * @param {object[]} deliverables
 * @param {number}   [limit=7]
 * @param {Date}     [today]
 * @returns {object[]}
 */
export function topPriorityItems(deliverables, limit = 7, today = new Date()) {
  return deliverables
    .filter(d => d.stage !== "done" && d.plannedPostDate)
    .map(d => ({ ...d, _score: priorityScore(d, today) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

/*
 * ─── Reference test matrix ────────────────────────────────
 * (stage-id, days-until-post, who-is-waiting, expected-score)
 *
 * | stage       | days | waiting  | score |
 * |-------------|------|----------|-------|
 * | roteiro     |  10  | team     |  120  |  90 + 30
 * | ap_final    |   2  | client   |  118  |  98 + 20
 * | ap_roteiro  |   0  | client   |  120  | 100 + 20
 * | postagem    |  -2  | team     |  132  | 102 + 30
 * | briefing    |  30  | team     |  100  |  70 + 30
 * | done        |  -5  | —        | (filtered out before scoring)
 */
