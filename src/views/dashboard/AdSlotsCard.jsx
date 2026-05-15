/**
 * src/views/dashboard/AdSlotsCard.jsx
 * Bloco — Slots de publicidade disponíveis por mês
 *
 * Props:
 *   slots   {AdSlotsMonth[]}  — output de calcAdSlots
 *   isMobile {boolean}
 */

import React, { useState } from "react";
import { calcAdSlots } from "../../lib/adSlots.js";

// ── Tokens inline ──────────────────────────────────────────
const B1   = "#FEFEFE";
const LN   = "#F0F0F2";
const TX   = "#000000";
const TX2  = "#6E6E6E";
const TX3  = "#ABABAB";
const GRN  = "#16A34A";
const AMB  = "#D97706";
const RED  = "#C8102E";
const BLU  = "#2563EB";
const G    = { background: B1, border: `1px solid ${LN}`, borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.06)" };

function barColor(pct) {
  if (pct >= 90) return RED;
  if (pct >= 70) return AMB;
  return GRN;
}

function availColor(avail) {
  if (avail === 0) return RED;
  if (avail <= 3)  return AMB;
  return GRN;
}

/** Barra horizontal de progresso */
function ProgressBar({ pct }) {
  const color = barColor(pct);
  return (
    <div style={{ height: 6, borderRadius: 3, background: LN, overflow: "hidden" }}>
      <div style={{
        width: `${Math.min(100, pct)}%`,
        height: "100%",
        background: color,
        borderRadius: 3,
        transition: "width 0.3s ease",
      }} />
    </div>
  );
}

/** Card de um único mês */
function MonthCard({ data, expanded, onToggle }) {
  const { label, capacity, committed, available, pctUsed, breakdown } = data;
  const ac = availColor(available);

  return (
    <div style={{ border: `1px solid ${LN}`, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
      {/* Cabeçalho clicável */}
      <div
        onClick={onToggle}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          padding: "10px 14px", cursor: "pointer",
          background: expanded ? "#F9F9FB" : B1,
        }}
      >
        {/* Mês */}
        <span style={{ fontWeight: 600, fontSize: 14, color: TX, minWidth: 80 }}>{label}</span>

        {/* Barra */}
        <div style={{ flex: 1 }}>
          <ProgressBar pct={pctUsed} />
        </div>

        {/* Disponíveis */}
        <span style={{ fontWeight: 700, fontSize: 15, color: ac, minWidth: 30, textAlign: "right" }}>
          {Math.floor(available)}
        </span>
        <span style={{ fontSize: 11, color: TX3, whiteSpace: "nowrap" }}>
          disponíveis
        </span>

        {/* Comprometidos / capacidade */}
        <span style={{ fontSize: 11, color: TX2, whiteSpace: "nowrap", marginLeft: 6 }}>
          {Math.ceil(committed)}/{capacity}
        </span>

        {/* Chevron */}
        <span style={{ fontSize: 10, color: TX3, marginLeft: 4 }}>
          {expanded ? "▲" : "▼"}
        </span>
      </div>

      {/* Detalhe por contrato */}
      {expanded && (
        <div style={{ padding: "8px 14px 12px", background: "#F9F9FB", borderTop: `1px solid ${LN}` }}>
          {breakdown.length === 0 ? (
            <p style={{ margin: 0, fontSize: 12, color: TX3 }}>Nenhum slot comprometido.</p>
          ) : (
            breakdown
              .slice()
              .sort((a, b) => b.count - a.count)
              .map(b => (
                <div key={b.contractId} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "4px 0", borderBottom: `1px solid ${LN}`,
                }}>
                  <span style={{ fontSize: 12, color: TX }}>
                    {b.company}
                    {b.estimated && (
                      <span style={{ fontSize: 10, color: TX3, marginLeft: 4 }}>~estimado</span>
                    )}
                  </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TX2 }}>
                    {Math.ceil(b.count)} posts
                  </span>
                </div>
              ))
          )}
          {/* Legenda capacidade */}
          <p style={{ margin: "8px 0 0", fontSize: 11, color: TX3 }}>
            Capacidade: {capacity} posts/mês (média histórica)
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * Componente principal do card de slots.
 *
 * @param {{ deliverables: object[], contracts: object[], isMobile: boolean }} props
 */
export function AdSlotsCard({ deliverables = [], contracts = [], isMobile = false }) {
  const [expanded, setExpanded] = React.useState(null);

  const slots = React.useMemo(
    () => calcAdSlots({ deliverables, contracts }, 6),
    [deliverables, contracts]
  );

  // Mês com mais slots disponíveis
  const best = slots.reduce((b, s) => (s.available > b.available ? s : b), slots[0] || {});

  const toggle = (month) => setExpanded(prev => (prev === month ? null : month));

  return (
    <div style={{ ...G, padding: isMobile ? 14 : 20 }}>
      {/* Título */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TX }}>
          Slots disponíveis para venda
        </h2>
        {best && best.available > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: GRN,
            background: "#DCFCE7", borderRadius: 6, padding: "2px 8px",
          }}>
            Melhor mês: {best.label} ({Math.floor(best.available)} livres)
          </span>
        )}
      </div>

      {/* Lista de meses */}
      {slots.map(s => (
        <MonthCard
          key={s.month}
          data={s}
          expanded={expanded === s.month}
          onToggle={() => toggle(s.month)}
        />
      ))}

      {/* Rodapé explicativo */}
      <p style={{ margin: "10px 0 0", fontSize: 11, color: TX3, lineHeight: 1.5 }}>
        Barras verdes = capacity &gt;= 30% livre · amarelo = 10-30% · vermelho = quase lotado.
        Posts sem data são distribuídos estimativamente dentro do prazo de cada contrato.
      </p>
    </div>
  );
}
