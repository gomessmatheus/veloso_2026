/**
 * src/lib/copilot/intents.js
 * Regex-based intent detection — no LLM required.
 * Returns the best matching actionId, or null for fallback.
 */

const INTENTS = [
  { pattern: /resumo|status|semana|análise|analise|analisar/i,  actionId: "analyze-week" },
  { pattern: /whatsapp|recado|aviso|grupo|mensagem.*dia/i,       actionId: "whatsapp-daily" },
  { pattern: /conflito|conflitos|sobreposição|exclusividade/i,   actionId: "explain-conflicts" },
  { pattern: /briefing|brief/i,                                  actionId: "generate-briefing-structure", requires: ["contractId"] },
  { pattern: /relatório.*client|report.*client/i,                actionId: "generate-client-report",      requires: ["contractId"] },
  { pattern: /relatório|relatorio|report/i,                      actionId: "generate-contract-report",    requires: ["contractId"] },
  { pattern: /caixa|saldo|liquidez|margem|lucro|fluxo/i,         actionId: "ask-financial" },
  { pattern: /financeiro|finanças|financ/i,                      actionId: "summarize-financial" },
  { pattern: /marca|brand|histórico.*marca/i,                    actionId: "summarize-brand" },
];

/**
 * Detect intent from user input.
 * @param {string} text
 * @param {{ contractId?: string, brandId?: string }} context
 * @returns {{ actionId: string } | null}
 */
export function detectIntent(text, context = {}) {
  for (const intent of INTENTS) {
    if (intent.pattern.test(text)) {
      // Check requirements
      if (intent.requires?.includes("contractId") && !context.contractId) continue;
      return { actionId: intent.actionId };
    }
  }
  return null;
}
