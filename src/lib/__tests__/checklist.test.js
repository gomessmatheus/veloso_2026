import { describe, it, expect } from "vitest";
import {
  CHECK_STEPS, addDays, stepDeadline, effectiveChecks, checksFromStage,
  deriveStage, nextStep, checklistProgress, overdueSteps, toggleCheck,
  totalViews, postToDeliverable, migratePosts,
} from "../checklist.js";

describe("stepDeadline / addDays", () => {
  it("deriva prazos a partir da data de postagem", () => {
    expect(stepDeadline("2026-07-20", "roteiro")).toBe("2026-07-13");
    expect(stepDeadline("2026-07-20", "gravacao")).toBe("2026-07-16");
    expect(stepDeadline("2026-07-20", "postado")).toBe("2026-07-20");
  });
  it("null sem data ou etapa inválida", () => {
    expect(stepDeadline(null, "roteiro")).toBeNull();
    expect(stepDeadline("2026-07-20", "xxx")).toBeNull();
    expect(addDays("data-invalida", 2)).toBeNull();
  });
});

describe("checksFromStage (compat legado)", () => {
  it("mapeia stages do kanban antigo", () => {
    expect(checksFromStage("briefing")).toEqual({});
    expect(checksFromStage("roteiro")).toEqual({});
    expect(checksFromStage("ap_roteiro")).toEqual({ roteiro: true });
    expect(Object.keys(checksFromStage("edicao"))).toHaveLength(3);
    expect(Object.keys(checksFromStage("ajuste"))).toHaveLength(4);
    expect(Object.keys(checksFromStage("postagem"))).toHaveLength(5);
    expect(Object.keys(checksFromStage("done"))).toHaveLength(6);
  });
  it("stage desconhecido → nada marcado", () => {
    expect(checksFromStage(undefined)).toEqual({});
  });
});

describe("deriveStage / nextStep / progresso", () => {
  it("nada marcado → roteiro", () => {
    expect(deriveStage({})).toBe("roteiro");
    expect(nextStep({}).id).toBe("roteiro");
  });
  it("roteiro marcado → aguardando aprovação (ap_roteiro)", () => {
    expect(deriveStage({ roteiro: "2026-07-01" })).toBe("ap_roteiro");
  });
  it("tudo menos postado → postagem; tudo → done", () => {
    const c = { roteiro: 1, ap_marca: 1, gravacao: 1, edicao: 1, ap_final: 1 };
    expect(deriveStage(c)).toBe("postagem");
    expect(deriveStage({ ...c, postado: 1 })).toBe("done");
    expect(nextStep({ ...c, postado: 1 })).toBeNull();
  });
  it("progresso", () => {
    expect(checklistProgress({})).toEqual({ done: 0, total: 6, pct: 0 });
    expect(checklistProgress({ roteiro: 1, ap_marca: 1, gravacao: 1 }).pct).toBe(50);
  });
  it("ida e volta stage → checks → stage", () => {
    for (const s of ["ap_roteiro", "gravacao", "edicao", "ap_final", "postagem", "done"]) {
      expect(deriveStage(checksFromStage(s))).toBe(s);
    }
  });
});

describe("effectiveChecks", () => {
  it("usa checks quando existem", () => {
    expect(effectiveChecks({ checks: { roteiro: true }, stage: "done" })).toEqual({ roteiro: true });
  });
  it("infere do stage legado quando não há checks", () => {
    expect(effectiveChecks({ stage: "gravacao" })).toEqual({ roteiro: true, ap_marca: true });
  });
});

describe("overdueSteps", () => {
  const d = { plannedPostDate: "2026-07-20", checks: { roteiro: "2026-07-10" } };
  it("aponta etapas em aberto com prazo vencido", () => {
    const late = overdueSteps(d, "2026-07-18");
    // ap_marca (D-5 = 15/07, 3 dias) e gravacao (D-4 = 16/07, 2 dias) e edicao (D-2 = 18/07 não venceu)
    expect(late.map((x) => x.id)).toEqual(["ap_marca", "gravacao"]);
    expect(late[0].daysLate).toBe(3);
  });
  it("sem data de postagem → sem alertas", () => {
    expect(overdueSteps({ checks: {} }, "2026-07-18")).toEqual([]);
  });
});

describe("toggleCheck", () => {
  it("marca com a data e re-deriva o stage", () => {
    const d = { checks: {}, stage: "roteiro" };
    const u = toggleCheck(d, "roteiro", "2026-07-18");
    expect(u.checks.roteiro).toBe("2026-07-18");
    expect(u.stage).toBe("ap_roteiro");
    expect(d.checks.roteiro).toBeUndefined(); // imutável
  });
  it("desmarca removendo o valor", () => {
    const d = { checks: { roteiro: "2026-07-01" }, stage: "ap_roteiro" };
    const u = toggleCheck(d, "roteiro", "2026-07-18");
    expect(u.checks.roteiro).toBeUndefined();
    expect(u.stage).toBe("roteiro");
  });
  it("desmarcar aprovação conta revisão", () => {
    const d = { checks: { roteiro: 1, ap_marca: 1, gravacao: 1, edicao: 1, ap_final: "2026-07-10" }, revisionCount: 1 };
    const u = toggleCheck(d, "ap_final", "2026-07-18");
    expect(u.revisionCount).toBe(2);
    expect(u.stage).toBe("ap_final");
  });
  it("marcar aprovação NÃO conta revisão", () => {
    const u = toggleCheck({ checks: { roteiro: 1 } }, "ap_marca", "2026-07-18");
    expect(u.revisionCount).toBeUndefined();
  });
  it("postado seta publishedAt; desmarcar limpa", () => {
    const c = { roteiro: 1, ap_marca: 1, gravacao: 1, edicao: 1, ap_final: 1 };
    const u = toggleCheck({ checks: c }, "postado", "2026-07-18");
    expect(u.publishedAt).toBe("2026-07-18");
    expect(u.stage).toBe("done");
    const v = toggleCheck(u, "postado", "2026-07-19");
    expect(v.publishedAt).toBeNull();
    expect(v.stage).toBe("postagem");
  });
  it("entregável legado (sem checks) parte do stage", () => {
    const d = { stage: "edicao" }; // roteiro+ap_marca+gravacao inferidos
    const u = toggleCheck(d, "edicao", "2026-07-18");
    expect(u.stage).toBe("ap_final");
    expect(u.checks.roteiro).toBe(true);
  });
});

describe("totalViews", () => {
  it("soma networkMetrics de todas as redes", () => {
    expect(totalViews({ networkMetrics: { instagram: { views: 100 }, tiktok: { views: 50 } } })).toBe(150);
  });
  it("fallback para campo plano legado", () => {
    expect(totalViews({ views: 77 })).toBe(77);
    expect(totalViews({ networkMetrics: {}, views: 77 })).toBe(77);
  });
  it("zero por padrão", () => {
    expect(totalViews({})).toBe(0);
  });
});

describe("migração posts → deliverables", () => {
  const post = {
    id: "p1", contractId: "c1", title: "Reels lançamento", type: "post",
    link: "https://insta.gr/x", plannedDate: "2026-05-10", publishDate: "2026-05-11",
    isPosted: true, views: 1000, likes: 50, networks: ["instagram"],
  };
  it("post publicado vira deliverable done com métricas", () => {
    const d = postToDeliverable(post, "2026-07-18T00:00:00Z");
    expect(d.id).toBe("mig_p1");
    expect(d.migratedFromPostId).toBe("p1");
    expect(d.stage).toBe("done");
    expect(d.publishedAt).toBe("2026-05-11");
    expect(d.networkMetrics.instagram.views).toBe(1000);
    expect(totalViews(d)).toBe(1000);
  });
  it("post não publicado fica aguardando postagem", () => {
    const d = postToDeliverable({ ...post, isPosted: false, publishDate: null }, "x");
    expect(d.stage).toBe("postagem");
    expect(d.checks.postado).toBeUndefined();
  });
  it("post sem métricas não cria networkMetrics fantasma", () => {
    const d = postToDeliverable({ id: "p2", isPosted: true }, "x");
    expect(d.networkMetrics).toEqual({});
  });
  it("migratePosts pula já migrados", () => {
    const existing = [{ id: "mig_p1", migratedFromPostId: "p1" }];
    const out = migratePosts([post, { ...post, id: "p9" }], existing, "x");
    expect(out.map((d) => d.id)).toEqual(["mig_p9"]);
  });
});
