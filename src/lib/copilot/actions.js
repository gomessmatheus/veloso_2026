/**
 * src/lib/copilot/actions.js
 *
 * Each action: { id, label, icon, run: async (params) => { type, content, title } }
 *
 * type: 'markdown' | 'whatsapp' | 'report' | 'text'
 * content: string
 * title: string (used when saving as report)
 *
 * LLM actions call POST /api/ai — same endpoint as existing buttons.
 * Template actions are fully deterministic (no network).
 */

import { topPriorityItems } from "../priority.js";
import { detectRiskSignals } from "../riskSignals.js";
import { detectConflicts } from "../conflicts.js";

// ─── Helper ──────────────────────────────────────────────

async function callAPI({ messages, system, max_tokens = 1000 }) {
  const body = { max_tokens, messages };
  if (system) body.system = system;
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API ${res.status}`);
  const data = await res.json();
  return data.text || "";
}

function fmtDate(s) {
  if (!s) return "—";
  try { const [y,m,d]=s.split("-"); return `${d}/${m}`; }
  catch { return s; }
}

function fmtMoney(v) {
  if (v == null) return "—";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL", minimumFractionDigits:0, maximumFractionDigits:0 }).format(v||0);
}

function contractTotal(c) {
  if (!c) return 0;
  if (c.paymentType === "monthly" && c.monthlyValue) {
    const months = c.contractStart && c.contractDeadline
      ? Math.max(1, Math.round((new Date(c.contractDeadline) - new Date(c.contractStart)) / (30*86400000)))
      : 1;
    return (Number(c.monthlyValue)||0) * months;
  }
  if (c.paymentType === "split") return (c.installments||[]).reduce((s,i)=>s+(Number(i.value)||0),0);
  return Number(c.contractValue)||0;
}

const STAGE_LABELS = {
  briefing:"Briefing", roteiro:"Roteiro", ap_roteiro:"Ap. Roteiro",
  gravacao:"Gravação", edicao:"Edição", ap_final:"Ap. Final",
  postagem:"Postagem", done:"✓ Entregue",
};

// ─── Actions ─────────────────────────────────────────────

export const ACTIONS = {

  // ── Analisar semana (template + libs) ──────────────────
  "analyze-week": {
    id: "analyze-week",
    label: "Analisar minha semana",
    icon: "📋",
    async run({ data, today = new Date() }) {
      const { contracts = [], deliverables = [] } = data;
      const items    = topPriorityItems(deliverables, 7, today);
      const signals  = detectRiskSignals({ deliverables, contracts }, today);
      const lateList = deliverables.filter(d => {
        if (d.stage==="done"||!d.plannedPostDate) return false;
        return Math.ceil((new Date(d.plannedPostDate)-today)/86400000) < 0;
      });

      const weekDels = deliverables.filter(d => {
        if (!d.plannedPostDate) return false;
        const diff = Math.ceil((new Date(d.plannedPostDate)-today)/86400000);
        return diff >= 0 && diff <= 7;
      });

      let md = `## 📋 Análise da semana — ${today.toLocaleDateString("pt-BR",{day:"numeric",month:"long"})}\n\n`;

      md += `**Esta semana:** ${weekDels.length} entrega(s) planejada(s)\n\n`;

      if (lateList.length > 0) {
        md += `### ⚠️ Atrasados (${lateList.length})\n`;
        lateList.slice(0,5).forEach(d => {
          const days = Math.abs(Math.ceil((new Date(d.plannedPostDate)-today)/86400000));
          md += `- **${d.title}** — ${STAGE_LABELS[d.stage]||d.stage} · ${days}d atraso\n`;
        });
        md += "\n";
      }

      if (items.length > 0) {
        md += `### 🎯 Foco prioritário agora\n`;
        items.slice(0,5).forEach((d,i) => {
          const days = Math.ceil((new Date(d.plannedPostDate)-today)/86400000);
          const prazo = days < 0 ? `atrasado ${Math.abs(days)}d` : days === 0 ? "hoje" : `em ${days}d`;
          md += `${i+1}. **${d.title}** — ${STAGE_LABELS[d.stage]||d.stage} · ${prazo}\n`;
        });
        md += "\n";
      }

      if (signals.filter(s=>s.severity==="HIGH").length > 0) {
        md += `### 🔴 Sinais de risco\n`;
        signals.filter(s=>s.severity==="HIGH").forEach(s => {
          md += `- ${s.icon} ${s.title} (${s.count})\n`;
        });
        md += "\n";
      }

      const apList = deliverables.filter(d => d.stage==="ap_roteiro"||d.stage==="ap_final");
      if (apList.length > 0) {
        md += `### ⏳ Aguardando aprovação (${apList.length})\n`;
        apList.slice(0,4).forEach(d => md += `- ${d.title} — ${STAGE_LABELS[d.stage]}\n`);
        md += "\n";
      }

      if (lateList.length===0 && apList.length===0 && signals.filter(s=>s.severity==="HIGH").length===0) {
        md += `✅ **Operação saudável** — nenhum bloqueio crítico identificado.\n`;
      }

      return { type:"markdown", content:md, title:`Análise semana ${fmtDate(today.toISOString().substr(0,10))}` };
    }
  },

  // ── Resumo WhatsApp (template) ─────────────────────────
  "whatsapp-daily": {
    id: "whatsapp-daily",
    label: "Resumo para WhatsApp",
    icon: "📱",
    async run({ data, today = new Date(), role = "admin", userName = "Matheus" }) {
      const { contracts = [], deliverables = [] } = data;
      const activeContracts = contracts.filter(c => !c.archived);
      const hour   = today.getHours();
      const greet  = hour<12?"Bom dia":hour<18?"Boa tarde":"Boa noite";
      const dateStr = today.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});

      // Today's deliverables
      const todayStr  = today.toISOString().substr(0,10);
      const todayDels = deliverables.filter(d=>d.plannedPostDate===todayStr&&d.stage!=="done");
      const awaitAp   = deliverables.filter(d=>d.stage==="ap_roteiro"||d.stage==="ap_final");
      const nextRec   = deliverables.filter(d=>d.stage==="gravacao"&&d.plannedPostDate).sort((a,b)=>a.plannedPostDate.localeCompare(b.plannedPostDate))[0];
      const late      = deliverables.filter(d=>d.stage!=="done"&&d.plannedPostDate&&Math.ceil((new Date(d.plannedPostDate)-today)/86400000)<0);

      let msg = `${greet}! Status de hoje, ${today.toLocaleDateString("pt-BR",{day:"numeric",month:"numeric"})}:\n\n`;

      if (late.length > 0)      msg += `⚠️ Atrasados: ${late.slice(0,2).map(d=>d.title).join(", ")}${late.length>2?` +${late.length-2}`:""}\n`;
      if (todayDels.length > 0) msg += `✅ Postando hoje: ${todayDels.map(d=>d.title).join(", ")}\n`;
      if (awaitAp.length > 0)   msg += `⏳ Aguardando aprovação: ${awaitAp.slice(0,2).map(d=>`${d.title} (${STAGE_LABELS[d.stage]})`).join(", ")}${awaitAp.length>2?` +${awaitAp.length-2}`:""}\n`;
      if (nextRec)               msg += `📅 Próxima gravação: ${nextRec.title} (${fmtDate(nextRec.plannedPostDate)})\n`;
      if (!todayDels.length && !awaitAp.length && !late.length) {
        msg += `✅ Dia tranquilo — sem entregas ou pendências urgentes.\n`;
      }

      msg += `\nQualquer dúvida, estamos por aqui.\n— Ranked`;

      return { type:"whatsapp", content:msg, title:`Status ${fmtDate(todayStr)}` };
    }
  },

  // ── Explicar conflitos (template usando detectConflicts) ─
  "explain-conflicts": {
    id: "explain-conflicts",
    label: "Explicar conflitos",
    icon: "⚠️",
    async run({ data, today = new Date() }) {
      const { contracts = [], deliverables = [], brands = [] } = data;
      const signals = detectRiskSignals({ deliverables, contracts }, today);
      const highSignals = signals.filter(s => s.severity==="HIGH"||s.severity==="WARN");

      if (highSignals.length === 0) {
        return { type:"markdown", content:"✅ Nenhum conflito detectado esta semana.", title:"Conflitos da semana" };
      }

      let md = `## ⚠️ Conflitos detectados\n\n`;
      highSignals.forEach(s => {
        const color = s.severity==="HIGH" ? "🔴" : "🟡";
        md += `${color} **${s.title}** — ${s.count} item(s)\n`;
        const ids = s.ids || [];
        const items = deliverables.filter(d => ids.includes(d.id)).slice(0,3);
        items.forEach(d => {
          md += `  - ${d.title} (${fmtDate(d.plannedPostDate)})\n`;
        });
        md += "\n";
      });

      md += `---\n**Sugestão:** revise as datas dos entregáveis sinalizados no calendário para eliminar sobreposições de marca.\n`;

      return { type:"markdown", content:md, title:"Conflitos da semana" };
    }
  },

  // ── Gerar estrutura de briefing (LLM) ─────────────────
  "generate-briefing-structure": {
    id: "generate-briefing-structure",
    label: "Gerar estrutura de briefing",
    icon: "✍️",
    async run({ data, contractId }) {
      const { contracts = [], deliverables = [] } = data;
      const c    = contracts.find(x => x.id === contractId);
      const cDels = deliverables.filter(d => d.contractId === contractId);
      if (!c) return { type:"markdown", content:"Contrato não encontrado.", title:"Briefing" };

      const total = contractTotal(c);
      const text  = await callAPI({
        max_tokens: 1200,
        messages: [{ role:"user", content:
`Você é especialista em briefing para criadores de conteúdo digital. Gere um briefing completo e estruturado para o criador @veloso.lucas_ sobre a parceria com ${c.company}.

Inclua:
- **Sobre a marca**: contexto e posicionamento
- **Objetivo da campanha**: o que a marca quer comunicar
- **Dos (obrigatório)**: o que DEVE aparecer no conteúdo
- **Don'ts (proibido)**: o que NÃO pode aparecer
- **Tom de voz**: como se comunicar
- **Hashtags obrigatórias**: liste se inferível, senão [PREENCHER]
- **Disclaimer**: uso de "publi" ou "AD" se obrigatório
- **Entregáveis**: resumo do que foi contratado
- **Prazo de aprovação**: quantos dias a marca tem para aprovar

Dados do contrato:
- Empresa: ${c.company}
- Valor: ${fmtMoney(total)} ${c.currency!=="BRL"?`(${c.currency})`:""}
- Entregas: ${c.numPosts} reels, ${c.numStories} stories, ${c.numReposts} TikToks, ${c.numCommunityLinks} links
- Observações: ${c.notes||"nenhuma"}
- Entregáveis no pipeline: ${cDels.map(d=>d.title).slice(0,5).join(", ")||"nenhum"}

Use marcadores claros. Deixe [PREENCHER] onde não há informação suficiente.`
        }]
      });

      return { type:"markdown", content:text, title:`Briefing — ${c.company}` };
    }
  },

  // ── Relatório do contrato (LLM) ────────────────────────
  "generate-contract-report": {
    id: "generate-contract-report",
    label: "Gerar relatório do contrato",
    icon: "📋",
    async run({ data, contractId }) {
      const { contracts = [], deliverables = [], posts = [] } = data;
      const c     = contracts.find(x => x.id === contractId);
      const cDels = deliverables.filter(d => d.contractId === contractId);
      const cPosts= posts.filter(p => p.contractId === contractId);
      if (!c) return { type:"report", content:"Contrato não encontrado.", title:"Relatório" };

      const total = contractTotal(c);
      const doneDels = cDels.filter(d=>d.stage==="done"||d.stage==="postagem").length + cPosts.filter(p=>p.isPosted).length;
      const totalDels = c.numPosts + c.numStories + c.numCommunityLinks + c.numReposts;
      const avgEng = (() => {
        const items = [...cPosts, ...cDels];
        const engs = items.map(i => {
          const r=Number(i.reach)||0; const l=Number(i.likes)||0; const cm=Number(i.comments)||0;
          return r>0?(l+cm)/r*100:null;
        }).filter(e=>e!=null&&e>0);
        return engs.length ? engs.reduce((s,v)=>s+v,0)/engs.length : null;
      })();

      const ctx = {
        contract: { company:c.company, value:total, currency:c.currency, deadline:c.contractDeadline, paymentType:c.paymentType, notes:c.notes },
        deliverables: cDels.map(d=>({title:d.title,stage:d.stage,plannedPostDate:d.plannedPostDate})),
        doneDels, totalDels,
        avgEngagement: avgEng,
        briefing: c.briefingNote||"",
      };

      const raw = await callAPI({
        max_tokens: 1500,
        messages: [{ role:"user", content:
`Você é o assistente operacional do @veloso.lucas_ para a Copa 2026. Gere um relatório executivo do contrato com ${c.company} em JSON:
{
  "summary": "resumo executivo em 2 frases",
  "performance": { "score": 0-100, "label": "Excelente/Bom/Regular/Atenção" },
  "deliveryStatus": "texto sobre status das entregas",
  "financialStatus": "texto sobre situação financeira",
  "highlights": ["ponto positivo 1"],
  "risks": ["risco 1 se houver"],
  "nextSteps": ["próxima ação 1", "próxima ação 2"]
}
Dados: ${JSON.stringify(ctx)}
Responda APENAS com o JSON.`
        }]
      });

      let parsed;
      try { parsed = JSON.parse(raw.replace(/```json|```/g,"").trim()); }
      catch { return { type:"report", content:raw, title:`Relatório — ${c.company}` }; }

      const score  = parsed.performance?.score ?? 0;
      const emoji  = score>=70?"🟢":score>=40?"🟡":"🔴";
      let md = `## ${emoji} ${parsed.performance?.label||"Relatório"} — ${c.company}\n\n`;
      md += `**Score:** ${score}/100\n\n`;
      md += `${parsed.summary}\n\n`;
      md += `### Entregas\n${parsed.deliveryStatus}\n\n`;
      md += `### Financeiro\n${parsed.financialStatus}\n\n`;
      if (parsed.highlights?.length) {
        md += `### ✅ Destaques\n${parsed.highlights.map(h=>`- ${h}`).join("\n")}\n\n`;
      }
      if (parsed.risks?.length) {
        md += `### ⚠️ Riscos\n${parsed.risks.map(r=>`- ${r}`).join("\n")}\n\n`;
      }
      if (parsed.nextSteps?.length) {
        md += `### Próximos passos\n${parsed.nextSteps.map(s=>`- ${s}`).join("\n")}\n`;
      }

      return { type:"report", content:md, title:`Relatório — ${c.company}` };
    }
  },

  // ── Relatório para o cliente (LLM) ────────────────────
  "generate-client-report": {
    id: "generate-client-report",
    label: "Gerar relatório para o cliente",
    icon: "📊",
    async run({ data, contractId }) {
      const { contracts = [], deliverables = [], posts = [] } = data;
      const c     = contracts.find(x => x.id === contractId);
      const cDels = deliverables.filter(d => d.contractId === contractId);
      const cPosts= posts.filter(p => p.contractId === contractId && p.isPosted);
      if (!c) return { type:"report", content:"Contrato não encontrado.", title:"Relatório Cliente" };

      const totalViews = [...cPosts,...cDels].reduce((s,i)=>s+(Number(i.views)||0),0);
      const totalReach = [...cPosts,...cDels].reduce((s,i)=>s+(Number(i.reach)||0),0);
      const totalLikes = [...cPosts,...cDels].reduce((s,i)=>s+(Number(i.likes)||0),0);
      const doneDels   = cDels.filter(d=>d.stage==="done"||d.stage==="postagem").length + cPosts.length;
      const totalDels  = c.numPosts + c.numStories + c.numCommunityLinks + c.numReposts;
      const avgEngRate = totalReach>0 ? (totalLikes/totalReach*100) : null;
      const total      = contractTotal(c);

      const text = await callAPI({
        max_tokens: 900,
        messages: [{ role:"user", content:
`Você é especialista em marketing de influência. Gere um parágrafo executivo em português para um relatório de performance de campanha com a marca ${c.company}.

Dados: views=${totalViews.toLocaleString("pt-BR")}, alcance=${totalReach.toLocaleString("pt-BR")}, engajamento=${avgEngRate?.toFixed(2)||"—"}%, entregas=${doneDels}/${totalDels}.

Escreva em tom profissional e comercial, destacando resultados e ROI para a marca. Máx 3 frases. Sem markdown interno.`
        }]
      });

      let md = `> ⚠️ *Este relatório é destinado ao cliente **${c.company}**. Não inclui dados de comissão ou margens internas.*\n\n`;
      md += `## Relatório de Performance — @veloso.lucas_\n`;
      md += `**Parceria:** ${c.company} · ${new Date().toLocaleDateString("pt-BR",{month:"long",year:"numeric"})}\n\n`;
      md += `### Resumo executivo\n${text}\n\n`;
      md += `### Entregas\n`;
      md += `- **Concluídas:** ${doneDels} de ${totalDels}\n`;
      if (totalViews>0)  md += `- **Total de views:** ${totalViews.toLocaleString("pt-BR")}\n`;
      if (totalReach>0)  md += `- **Alcance total:** ${totalReach.toLocaleString("pt-BR")}\n`;
      if (avgEngRate)    md += `- **Engajamento médio:** ${avgEngRate.toFixed(2)}%\n`;

      return { type:"report", content:md, title:`Relatório Cliente — ${c.company}` };
    }
  },

  // ── Perguntar sobre caixa/financeiro (LLM chat) ────────
  "ask-financial": {
    id: "ask-financial",
    label: "Perguntar sobre finanças",
    icon: "💬",
    // This action opens the Conversa tab with a pre-seeded question
    async run({ data, question = "", history = [] }) {
      const { contracts = [], transactions = [] } = data;
      const totalEnt  = transactions.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
      const totalSai  = transactions.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
      const totalDiv  = transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
      const lucro     = totalEnt - totalSai - totalDiv;
      const catBreakdown = Object.entries(
        transactions.filter(t=>t.type==="saida"&&t.category)
          .reduce((acc,t)=>{acc[t.category]=(acc[t.category]||0)+(Number(t.amount)||0);return acc;},{})
      ).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: R$${v.toLocaleString("pt-BR")}`).join(", ");

      const systemCtx = `Você é o consultor financeiro do criador de conteúdo @veloso.lucas_. A empresa é Stand/Veloso Produções. Responda em português, de forma direta e prática. Contexto: entradas R$${totalEnt.toLocaleString("pt-BR")}, saídas R$${totalSai.toLocaleString("pt-BR")}, lucro R$${lucro.toLocaleString("pt-BR")}, contratos ativos ${contracts.filter(c=>!c.archived).length}, top despesas: ${catBreakdown||"sem dados"}.`;

      if (!question.trim()) {
        return { type:"chat_ready", content:systemCtx, title:"Consultor Financeiro" };
      }

      const msgs = [...history.slice(-6), { role:"user", content:question }];
      const text = await callAPI({ max_tokens:900, system:systemCtx, messages:msgs });
      return { type:"text", content:text, title:"Resposta financeira" };
    }
  },

  // ── Resumo de contratos (template) ───────────────────
  "summarize-contracts": {
    id: "summarize-contracts",
    label: "Resumo de contratos",
    icon: "📊",
    async run({ data, today = new Date() }) {
      const { contracts = [], deliverables = [] } = data;
      const active = contracts.filter(c=>!c.archived);
      let md = `## 📊 Resumo de contratos\n\n`;
      md += `**${active.length} contratos ativos**\n\n`;
      active.forEach(c => {
        const total = contractTotal(c);
        const cDels = deliverables.filter(d=>d.contractId===c.id);
        const done  = cDels.filter(d=>d.stage==="done").length;
        const days  = c.contractDeadline ? Math.ceil((new Date(c.contractDeadline)-today)/86400000) : null;
        md += `### ${c.company}\n`;
        md += `- Valor: ${fmtMoney(total)}${c.currency!=="BRL"?` (${c.currency})`:""}\n`;
        md += `- Entregas: ${done}/${cDels.length} concluídas\n`;
        if (days!==null) md += `- Prazo: ${days<0?`atrasado ${Math.abs(days)}d`:`${days}d restantes`}\n`;
        md += "\n";
      });
      return { type:"markdown", content:md, title:"Resumo de contratos" };
    }
  },

  // ── Resumo financeiro (template) ──────────────────────
  "summarize-financial": {
    id: "summarize-financial",
    label: "Resumir saúde financeira",
    icon: "📈",
    async run({ data }) {
      const { contracts = [], transactions = [] } = data;
      const totalEnt = transactions.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
      const totalSai = transactions.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
      const totalDiv = transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
      const lucro    = totalEnt - totalSai - totalDiv;
      const margem   = totalEnt>0 ? ((lucro/totalEnt)*100).toFixed(1) : null;

      let md = `## 📈 Saúde financeira\n\n`;
      md += `| Item | Valor |\n|---|---|\n`;
      md += `| Entradas | **${fmtMoney(totalEnt)}** |\n`;
      md += `| Saídas + Impostos | ${fmtMoney(totalSai)} |\n`;
      md += `| Dividendos | ${fmtMoney(totalDiv)} |\n`;
      md += `| **Lucro líquido** | **${fmtMoney(lucro)}** |\n`;
      if (margem) md += `| Margem | ${margem}% |\n`;
      md += "\n";
      md += `**Contratos ativos:** ${contracts.filter(c=>!c.archived).length}\n`;

      if (lucro < 0) md += `\n⚠️ **Atenção:** resultado negativo no período.`;
      else if (margem && Number(margem) > 40) md += `\n✅ Margem saudável acima de 40%.`;

      return { type:"markdown", content:md, title:"Saúde financeira" };
    }
  },

  // ── Resumo de entregas (template) ─────────────────────
  "summarize-deliveries": {
    id: "summarize-deliveries",
    label: "Resumir entregas do contrato",
    icon: "📦",
    async run({ data, contractId, today = new Date() }) {
      const { contracts = [], deliverables = [] } = data;
      const c     = contracts.find(x=>x.id===contractId);
      const cDels = deliverables.filter(d=>d.contractId===contractId);
      if (!c) return { type:"markdown", content:"Contrato não encontrado.", title:"Entregas" };

      let md = `## 📦 Entregas — ${c.company}\n\n`;
      const byStage = {};
      cDels.forEach(d => { (byStage[d.stage]||=[]).push(d); byStage[d.stage]=byStage[d.stage]; });
      Object.entries(byStage).forEach(([stage, items]) => {
        md += `### ${STAGE_LABELS[stage]||stage} (${items.length})\n`;
        items.forEach(d => {
          const days = d.plannedPostDate ? Math.ceil((new Date(d.plannedPostDate)-today)/86400000) : null;
          md += `- ${d.title}${days!==null?` · ${days<0?`${Math.abs(days)}d atrasado`:`${days}d`}`:""}  \n`;
        });
        md += "\n";
      });
      return { type:"markdown", content:md, title:`Entregas — ${c.company}` };
    }
  },

  // ── Histórico da marca (template) ─────────────────────
  "summarize-brand": {
    id: "summarize-brand",
    label: "Histórico narrativo da marca",
    icon: "🏷️",
    async run({ data, brandId }) {
      const { brands = [], contracts = [], deliverables = [], posts = [] } = data;
      const brand = brands.find(b=>b.id===brandId);
      if (!brand) return { type:"markdown", content:"Marca não encontrada.", title:"Histórico" };

      const bContracts = contracts.filter(c=>c.brandId===brandId);
      const bDels      = deliverables.filter(d=>bContracts.some(c=>c.id===d.contractId));
      const bPosts     = posts.filter(p=>bContracts.some(c=>c.id===p.contractId));
      const totalLTV   = bContracts.reduce((s,c)=>s+contractTotal(c),0);

      let md = `## 🏷️ Histórico — ${brand.name}\n\n`;
      md += `**${bContracts.length} contratos** · LTV: ${fmtMoney(totalLTV)}\n\n`;
      bContracts.forEach(c => {
        const cD = bDels.filter(d=>d.contractId===c.id);
        md += `### ${c.company}\n`;
        md += `- Valor: ${fmtMoney(contractTotal(c))}\n`;
        md += `- Entregas: ${cD.filter(d=>d.stage==="done").length}/${cD.length}\n`;
        if (c.contractDeadline) md += `- Prazo: ${fmtDate(c.contractDeadline)}\n`;
        md += "\n";
      });
      return { type:"markdown", content:md, title:`Histórico — ${brand.name}` };
    }
  },

};

/** Run an action by id. Returns { type, content, title } */
export async function runAction(actionId, params) {
  const action = ACTIONS[actionId];
  if (!action) return { type:"text", content:`Ação "${actionId}" não encontrada.`, title:"Erro" };
  return action.run(params);
}
