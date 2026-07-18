/**
 * src/lib/priority.js
 *
 * Pure function: priorityScore(deliverable, today?)
 * Used to order the "Foco de hoje" list in the Dashboard.
 *
 * Fields required on `deliverable`:
 *   - plannedPostDate: "YYYY-MM-DD"
 *   - stage: one of the STAGE_IDS
 *   - stageDateOverrides: { [stage]: "YYYY-MM-DD" } — datas preenchidas manualmente
 *
 * No side-effects, no imports. Safe to unit-test in isolation.
 */

/**
 * Stages that are blocked on an internal team member (Lucas / Matheus / Leandro).
 * These get a bonus because WE are the bottleneck — action is needed from us.
 */
const WAITING_ON_TEAM = new Set([
  "briefing", // team needs to initiate / confirm brief
  "roteiro",  // Lucas writes the script
  "gravacao", // Lucas records
  "edicao",   // Leandro edits
  "postagem", // Lucas publishes
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
 *   base = max(0, 100 − daysUntilPost)
 *   + 20 if stage requires client approval (Ap. Roteiro / Ap. Final)
 *   + 30 if stage is waiting on our team (not the client)
 *   + stageOverdueBonus: se a etapa atual tem data manual preenchida
 *     e essa data já passou (ou é hoje), adiciona bônus proporcional
 *     ao atraso da etapa (mín 40 se hoje, +10 por dia de atraso, máx 80).
 *     Isso garante que cronogramas preenchidos e atrasados apareçam na lista.
 *
 * @param {object} deliverable — must have { plannedPostDate, stage, stageDateOverrides? }
 * @param {Date} [today] — defaults to new Date(); injectable for tests
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
  if (WAITING_ON_TEAM.has(deliverable.stage))  score += 30;

  // ── Bônus por etapa atual atrasada no cronograma manual ──────────────
  // Se o entregável tem data manual preenchida para a etapa atual
  // e essa data já chegou (≤ hoje), a etapa está bloqueada/atrasada
  // e precisa aparecer na lista independente da data de postagem.
  const overrides = deliverable.stageDateOverrides;
  if (overrides && deliverable.stage && overrides[deliverable.stage]) {
    const stageDate = new Date(overrides[deliverable.stage] + "T12:00:00");
    if (!isNaN(stageDate.getTime())) {
      const stageDaysLate = Math.round((todayMidnight - stageDate) / 86400000);
      // stageDaysLate >= 0 significa que a data da etapa chegou ou já passou
      if (stageDaysLate >= 0) {
        // Bônus base de 40 (garante entrada no top 7 na maioria dos casos),
        // +10 por dia de atraso, limitado a 80 para não distorcer demais.
        score += Math.min(40 + stageDaysLate * 10, 80);
      }
    }
  }

  return score;
}

/**
 * Sort deliverables by descending priority, excluding "done" items,
 * and return at most `limit` items.
 *
 * @param {object[]} deliverables
 * @param {number} [limit=7]
 * @param {Date} [today]
 * @returns {object[]}
 */
export function topPriorityItems(deliverables, limit = 7, today = new Date()) {
  return deliverables
    .filter(d => d.stage !== "done" && d.plannedPostDate)
    .map(d => ({ ...d, _score: priorityScore(d, today) }))
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

/**
 * "Foco de hoje" em grupos autoexplicativos (substitui o score numérico
 * na exibição — priorityScore continua disponível para ordenação interna).
 *
 * Grupos, em ordem (cada item entra apenas no primeiro que casar):
 *   atrasados  — data de postagem já passou
 *   hoje       — posta hoje
 *   aguardando — bola com a marca (ap_roteiro / ap_final)
 *   semana     — posta nos próximos 7 dias
 *   semData    — em produção mas sem data de postagem definida
 *
 * @param {object[]} deliverables
 * @param {Date} [today]
 * @returns {Array<{id:string,label:string,items:object[]}>} só grupos não vazios
 */
export function groupFocus(deliverables, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const iso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
  const todayIso = iso(t);
  const weekEnd = new Date(t); weekEnd.setDate(weekEnd.getDate() + 7);
  const weekEndIso = iso(weekEnd);

  const buckets = {
    atrasados:  [],
    hoje:       [],
    aguardando: [],
    semana:     [],
    semData:    [],
  };

  for (const d of deliverables) {
    if (!d || d.stage === "done") continue;
    const date = d.plannedPostDate || null;
    if (!date) {
      if (AWAITING_APPROVAL.has(d.stage)) buckets.aguardando.push(d);
      else buckets.semData.push(d);
    } else if (date < todayIso) {
      buckets.atrasados.push(d);
    } else if (date === todayIso) {
      buckets.hoje.push(d);
    } else if (AWAITING_APPROVAL.has(d.stage)) {
      buckets.aguardando.push(d);
    } else if (date <= weekEndIso) {
      buckets.semana.push(d);
    }
  }

  const byDate = (a, b) => (a.plannedPostDate || "9999").localeCompare(b.plannedPostDate || "9999");
  Object.values(buckets).forEach(list => list.sort(byDate));

  const META = [
    { id: "atrasados",  label: "Atrasados" },
    { id: "hoje",       label: "Posta hoje" },
    { id: "aguardando", label: "Aguardando marca" },
    { id: "semana",     label: "Esta semana" },
    { id: "semData",    label: "Sem data definida" },
  ];
  return META
    .filter(m => buckets[m.id].length > 0)
    .map(m => ({ ...m, items: buckets[m.id] }));
}
