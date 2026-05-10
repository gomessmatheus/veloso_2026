/**
 * src/lib/copilot/suggestions.js
 * Pure function — returns ranked Suggestion[] for the current view + data state.
 *
 * Suggestion = {
 *   id, icon, title, description, actionId, priority,
 *   contextData?   // extra data to pass to the action (contractId, brandId, etc.)
 * }
 */

/**
 * @param {{ view:string, data:object, today:Date, context?:object }} params
 * @returns {object[]}
 */
export function getSuggestions({ view, data = {}, today = new Date(), context = {} }) {
  const {
    contracts     = [],
    deliverables  = [],
    posts         = [],
    brands        = [],
    signals       = [],   // from detectRiskSignals
  } = data;

  const { contractId, brandId } = context;
  const suggestions = [];
  const push = (s) => suggestions.push(s);

  // ── Contract-detail context ───────────────────────────────
  if (contractId) {
    const c = contracts.find(x => x.id === contractId);
    const cDels = deliverables.filter(d => d.contractId === contractId);

    push({
      id: "gen-contract-report",
      icon: "📋",
      title: "Gerar relatório do contrato",
      description: `Análise executiva — ${c?.company || "contrato"}`,
      actionId: "generate-contract-report",
      priority: 12,
      contextData: { contractId },
    });

    push({
      id: "gen-client-report",
      icon: "📊",
      title: "Gerar relatório para o cliente",
      description: "Versão comercial sem dados internos",
      actionId: "generate-client-report",
      priority: 11,
      contextData: { contractId },
    });

    const hasEmptyBriefing = !c?.briefingNote?.trim();
    push({
      id: "gen-briefing",
      icon: hasEmptyBriefing ? "⚠️" : "✍️",
      title: "Gerar estrutura de briefing",
      description: hasEmptyBriefing ? "Briefing vazio — criar estrutura" : "Atualizar briefing com IA",
      actionId: "generate-briefing-structure",
      priority: hasEmptyBriefing ? 13 : 9,
      contextData: { contractId },
    });

    if (cDels.length >= 3) {
      push({
        id: "summarize-deliveries",
        icon: "📦",
        title: "Resumir entregas do contrato",
        description: `${cDels.length} entregáveis vinculados`,
        actionId: "summarize-deliveries",
        priority: 8,
        contextData: { contractId },
      });
    }
  }

  // ── Brand-detail context ──────────────────────────────────
  if (brandId) {
    const bContracts = contracts.filter(c => c.brandId === brandId);
    if (bContracts.length >= 2) {
      push({
        id: "summarize-brand",
        icon: "🏷️",
        title: "Histórico narrativo da marca",
        description: `${bContracts.length} contratos com essa marca`,
        actionId: "summarize-brand",
        priority: 10,
        contextData: { brandId },
      });
    }
  }

  // ── Dashboard ─────────────────────────────────────────────
  if (view === "dashboard" || view === "acompanhamento") {
    push({
      id: "analyze-week",
      icon: "📋",
      title: "Analisar minha semana",
      description: "Prioridades, riscos e próximas decisões",
      actionId: "analyze-week",
      priority: 10,
    });

    const highSignals = signals.filter(s => s.severity === "HIGH" || s.severity === "WARN");
    if (highSignals.length > 0) {
      push({
        id: "explain-conflicts",
        icon: "⚠️",
        title: "Explicar conflitos detectados",
        description: `${highSignals.length} sinal(is) de risco esta semana`,
        actionId: "explain-conflicts",
        priority: 15,
      });
    }

    const lateItems = deliverables.filter(d => {
      if (d.stage === "done" || !d.plannedPostDate) return false;
      return Math.ceil((new Date(d.plannedPostDate) - today) / 86400000) < 0;
    });
    if (lateItems.length >= 5) {
      push({
        id: "suggest-priority",
        icon: "🎯",
        title: "Sugerir ordem de prioridade",
        description: `${lateItems.length} itens atrasados ou em risco`,
        actionId: "analyze-week",
        priority: 13,
      });
    }
  }

  // ── Contratos ─────────────────────────────────────────────
  if (view === "contratos" && !contractId) {
    push({
      id: "summarize-contracts",
      icon: "📊",
      title: "Resumo de todos os contratos",
      description: `${contracts.filter(c => !c.archived).length} contratos ativos`,
      actionId: "summarize-contracts",
      priority: 7,
    });
  }

  // ── Financeiro ────────────────────────────────────────────
  if (view === "financeiro") {
    push({
      id: "summarize-financial",
      icon: "📈",
      title: "Resumir saúde financeira",
      description: "Entradas, saídas e margem do período",
      actionId: "summarize-financial",
      priority: 9,
    });
    push({
      id: "ask-financial",
      icon: "💬",
      title: "Perguntar sobre o financeiro",
      description: "Análise livre, dicas de gestão",
      actionId: "ask-financial",
      priority: 8,
    });
  }

  // ── Caixa ─────────────────────────────────────────────────
  if (view === "caixa") {
    push({
      id: "ask-caixa",
      icon: "⚡",
      title: "Perguntar sobre o caixa",
      description: "Consultor financeiro sobre seus números",
      actionId: "ask-financial",
      priority: 11,
    });
  }

  // ── Marcas ────────────────────────────────────────────────
  if (view === "marcas" && !brandId) {
    push({
      id: "gen-media-kit",
      icon: "🎨",
      title: "Gerar mídia kit",
      description: "Resumo de alcance e resultados para marcas",
      actionId: "generate-media-kit",
      priority: 7,
    });
  }

  // ── Always available ─────────────────────────────────────
  // Extract metrics from screenshot — show when there are deliverables
  if ((data.deliverables?.length || 0) > 0) {
    push({
      id: "extract-metrics",
      icon: "📸",
      title: "Extrair métricas de um print",
      description: "Instagram, TikTok ou YouTube — preenche automaticamente",
      actionId: "extract-metrics",
      priority: 9,
    });
  }

  const hasWA = suggestions.some(s => s.actionId === "whatsapp-daily");
  if (!hasWA) {
    push({
      id: "whatsapp-daily",
      icon: "📱",
      title: "Resumo do dia para WhatsApp",
      description: "Mensagem pronta para o grupo",
      actionId: "whatsapp-daily",
      priority: 6,
    });
  } else {
    suggestions.find(s => s.actionId === "whatsapp-daily") || push({
      id: "whatsapp-always",
      icon: "📱",
      title: "Resumo do dia para WhatsApp",
      description: "Mensagem pronta para o grupo",
      actionId: "whatsapp-daily",
      priority: 6,
    });
  }

  // Sort by priority descending, deduplicate by id
  const seen = new Set();
  return suggestions
    .sort((a, b) => b.priority - a.priority)
    .filter(s => { if (seen.has(s.id)) return false; seen.add(s.id); return true; });
}
