/**
 * src/lib/checklist.js
 *
 * Checklist de produção por entregável — substitui o kanban de 9 colunas
 * e o "cronograma automático" (datas+responsáveis por etapa).
 * Sem side-effects, sem React, sem Firestore — 100% testável em Node.
 *
 * Modelo novo no deliverable:
 *   checks: { roteiro, ap_marca, gravacao, edicao, ap_final, postado }
 *     — valor: "YYYY-MM-DD" (data em que foi marcado) ou true (migrado).
 *   owner: string (responsável único, opcional)
 *
 * COMPATIBILIDADE: o campo `stage` continua existindo e é DERIVADO dos
 * checks (deriveStage). Consumidores antigos (adSlots, riskSignals,
 * conflicts, calendário, contadores stage==="done") continuam funcionando.
 * Entregáveis antigos sem `checks` são interpretados via checksFromStage.
 */

// ─── Etapas do checklist ──────────────────────────────────
// offset = dias em relação à data de postagem (D). Herdado das STAGES.
// stageWhenPending = stage derivado quando esta é a primeira etapa em aberto.
export const CHECK_STEPS = Object.freeze([
  { id: "roteiro",  label: "Roteiro",       short: "Rot", offset: -7, stageWhenPending: "roteiro",    defaultResp: "Lucas"   },
  { id: "ap_marca", label: "Aprov. roteiro", short: "ApR", offset: -5, stageWhenPending: "ap_roteiro", defaultResp: "Marca"   },
  { id: "gravacao", label: "Gravação",      short: "Grv", offset: -4, stageWhenPending: "gravacao",   defaultResp: "Lucas"   },
  { id: "edicao",   label: "Edição",        short: "Edi", offset: -2, stageWhenPending: "edicao",     defaultResp: "Leandro" },
  { id: "ap_final", label: "Aprov. final",  short: "ApF", offset: -1, stageWhenPending: "ap_final",   defaultResp: "Marca"   },
  { id: "postado",  label: "Postado",       short: "Post", offset: 0,  stageWhenPending: "postagem",   defaultResp: "Lucas"   },
]);

export const CHECK_IDS = CHECK_STEPS.map((s) => s.id);

/** Etapas em que a bola está com a marca (aguardando aprovação). */
export const APPROVAL_STEPS = Object.freeze(["ap_marca", "ap_final"]);

// ─── Helpers de data ──────────────────────────────────────

/** Soma n dias a "YYYY-MM-DD" (fuso-seguro via T12:00). null se inválido. */
export function addDays(dateStr, n) {
  if (!dateStr || n == null) return null;
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

/** Data-limite sugerida de uma etapa, derivada da data de postagem. */
export function stepDeadline(plannedPostDate, stepId) {
  const step = CHECK_STEPS.find((s) => s.id === stepId);
  if (!step || !plannedPostDate) return null;
  return addDays(plannedPostDate, step.offset);
}

// ─── Checks ───────────────────────────────────────────────

const isChecked = (checks, id) => !!(checks && checks[id]);

/**
 * Checks efetivos de um deliverable: usa `checks` se existir,
 * senão infere do `stage` legado (entregáveis criados antes do checklist).
 */
export function effectiveChecks(d) {
  if (d?.checks && typeof d.checks === "object") return d.checks;
  return checksFromStage(d?.stage);
}

/**
 * Infere checks a partir do stage legado (kanban de 9 etapas).
 * "ajuste" conta como pós-edição (aguardando nova aprovação final).
 */
export function checksFromStage(stage) {
  const order = {
    briefing: 0, roteiro: 0,
    ap_roteiro: 1,
    gravacao: 2,
    edicao: 3,
    ap_final: 4, ajuste: 4,
    postagem: 5,
    done: 6,
  };
  const n = order[stage] ?? 0;
  const checks = {};
  CHECK_STEPS.slice(0, n).forEach((s) => { checks[s.id] = true; });
  return checks;
}

/**
 * Stage derivado: a primeira etapa em aberto define onde o trabalho está.
 * Tudo marcado → "done".
 */
export function deriveStage(checks) {
  for (const s of CHECK_STEPS) {
    if (!isChecked(checks, s.id)) return s.stageWhenPending;
  }
  return "done";
}

/** Primeira etapa em aberto (para "próxima ação"). null se concluído. */
export function nextStep(checks) {
  return CHECK_STEPS.find((s) => !isChecked(checks, s.id)) || null;
}

/** Progresso: {done, total, pct}. */
export function checklistProgress(checks) {
  const done = CHECK_STEPS.filter((s) => isChecked(checks, s.id)).length;
  return { done, total: CHECK_STEPS.length, pct: Math.round((done / CHECK_STEPS.length) * 100) };
}

/**
 * Etapas em aberto cujo prazo derivado já venceu.
 * @returns {Array<{id,label,deadline,daysLate}>}
 */
export function overdueSteps(d, todayIso) {
  if (!d?.plannedPostDate || !todayIso) return [];
  const checks = effectiveChecks(d);
  const out = [];
  for (const s of CHECK_STEPS) {
    if (isChecked(checks, s.id)) continue;
    const deadline = stepDeadline(d.plannedPostDate, s.id);
    if (deadline && deadline < todayIso) {
      const daysLate = Math.round((new Date(todayIso + "T12:00:00") - new Date(deadline + "T12:00:00")) / 86400000);
      out.push({ id: s.id, label: s.label, deadline, daysLate });
    }
  }
  return out;
}

/**
 * Alterna um check e devolve o deliverable atualizado (novo objeto).
 * - Marca com a data de hoje; desmarca removendo o valor.
 * - `stage` é re-derivado (compatibilidade com o resto do app).
 * - Desmarcar uma APROVAÇÃO já concedida conta como revisão
 *   (incrementa revisionCount — substitui a antiga etapa "ajuste").
 */
export function toggleCheck(d, stepId, todayIso) {
  const prev = effectiveChecks(d);
  const wasChecked = isChecked(prev, stepId);
  const checks = { ...prev };
  if (wasChecked) delete checks[stepId];
  else checks[stepId] = todayIso || true;

  const updated = { ...d, checks, stage: deriveStage(checks) };
  if (wasChecked && APPROVAL_STEPS.includes(stepId)) {
    updated.revisionCount = (Number(d.revisionCount) || 0) + 1;
  }
  if (stepId === "postado") {
    updated.publishedAt = wasChecked ? null : (todayIso || d.publishedAt || null);
  }
  return updated;
}

// ─── Métricas ─────────────────────────────────────────────

/**
 * Total de views de um deliverable: soma networkMetrics de todas as redes,
 * com fallback para o campo plano legado (posts migrados).
 */
export function totalViews(d) {
  const nm = d?.networkMetrics;
  if (nm && typeof nm === "object") {
    const sum = Object.values(nm).reduce((s, m) => s + (Number(m?.views) || 0), 0);
    if (sum > 0) return sum;
  }
  return Number(d?.views) || 0;
}

// ─── Migração posts → deliverables ────────────────────────

/**
 * Converte um post (modelo antigo) em deliverable.
 * - isPosted → tudo marcado (done); senão → aguardando postagem.
 * - Métricas planas viram networkMetrics na primeira rede (ou instagram).
 * - id determinístico ("mig_<postId>") + migratedFromPostId para dedupe.
 */
export function postToDeliverable(post, nowIso) {
  const posted = !!post.isPosted;
  const checks = {};
  CHECK_STEPS.forEach((s) => {
    if (posted || s.id !== "postado") checks[s.id] = true;
  });
  const net = (post.networks && post.networks[0]) || "instagram";
  const hasMetrics = ["views", "reach", "likes", "comments", "shares", "saves"]
    .some((k) => Number(post[k]) > 0);
  return {
    id: `mig_${post.id}`,
    migratedFromPostId: post.id,
    contractId: post.contractId || "",
    title: post.title || "Post migrado",
    type: post.type || "post",
    stage: deriveStage(checks),
    checks,
    plannedPostDate: post.plannedDate || post.publishDate || null,
    publishedAt: post.publishDate || (posted ? post.plannedDate : null) || null,
    postLink: post.link || "",
    networks: post.networks || [],
    networkMetrics: hasMetrics ? {
      [net]: {
        views: Number(post.views) || 0,
        reach: Number(post.reach) || 0,
        likes: Number(post.likes) || 0,
        comments: Number(post.comments) || 0,
        shares: Number(post.shares) || 0,
        saves: Number(post.saves) || 0,
      },
    } : {},
    createdAt: post.createdAt || nowIso,
    migratedAt: nowIso,
  };
}

/**
 * Migra uma lista de posts, pulando os já migrados.
 * @returns {Array} novos deliverables a criar
 */
export function migratePosts(posts, existingDeliverables, nowIso) {
  const migrated = new Set(
    (existingDeliverables || []).map((d) => d.migratedFromPostId).filter(Boolean)
  );
  return (posts || [])
    .filter((p) => p && p.id && !migrated.has(p.id))
    .map((p) => postToDeliverable(p, nowIso));
}
