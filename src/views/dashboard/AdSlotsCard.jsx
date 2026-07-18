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
const B1   = "#FFFFFF";
const LN   = "#E2E8F0";
const TX   = "#0F172A";
const TX2  = "#64748B";
const TX3  = "#94A3B8";
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
function MonthCard({ data, expanded, onToggle, isMobile = false }) {
  const { label, capacity, committed, available, pctUsed, breakdown } = data;
  const ac = availColor(available);

  return (
    <div style={{ border: `1px solid ${LN}`, borderRadius: 8, overflow: "hidden", marginBottom: 8 }}>
      {/* Cabeçalho clicável */}
      {isMobile ? (
        <div onClick={onToggle}
          style={{ padding: "12px 14px", cursor: "pointer", background: expanded ? "#F9F9FB" : B1 }}>
          {/* Linha 1: mês + livres + chevron */}
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8 }}>
            <span style={{ fontWeight:600, fontSize:14, color:TX, flex:1, minWidth:0 }}>{label}</span>
            <span style={{ fontWeight:700, fontSize:15, color:ac, whiteSpace:"nowrap" }}>
              {Math.floor(available)} livres
            </span>
            <span style={{ fontSize:11, color:TX3, marginLeft:2 }}>{expanded ? "▲" : "▼"}</span>
          </div>
          {/* Linha 2: barra */}
          <ProgressBar pct={pctUsed} />
          {/* Linha 3: capacidade */}
          <div style={{ fontSize:11, color:TX3, marginTop:6 }}>
            {Math.ceil(committed)} de {capacity} comprometidos
          </div>
        </div>
      ) : (
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
          <div style={{ flex: 1, minWidth: 0 }}>
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
          <span style={{ fontSize: 11, color: TX3, marginLeft: 4 }}>
            {expanded ? "▲" : "▼"}
          </span>
        </div>
      )}

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
                  <span style={{ fontSize: 12, color: TX }}>{b.company}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: TX2 }}>
                    {Math.ceil(b.count)} posts
                  </span>
                </div>
              ))
          )}
          {/* Legenda capacidade */}
          <p style={{ margin: "8px 0 0", fontSize: 11, color: TX3 }}>
            Capacidade: {capacity} reels/mês
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
  const [showUndated, setShowUndated] = React.useState(false);

  const { months: slots, undated } = React.useMemo(
    () => calcAdSlots({ deliverables, contracts }, 3),
    [deliverables, contracts]
  );

  // Mês com mais slots disponíveis
  const best = slots.reduce((b, s) => (s.available > b.available ? s : b), slots[0] || {});

  const toggle = (month) => setExpanded(prev => (prev === month ? null : month));

  return (
    <div style={{ ...G, padding: isMobile ? 14 : 20 }}>
      {/* Título */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: TX }}>
          Slots disponíveis para venda
        </h2>
        {best && best.available > 0 && (
          <span style={{
            fontSize: 11, fontWeight: 600, color: GRN,
            background: "#DCFCE7", borderRadius: 6, padding: "2px 8px",
            whiteSpace: "nowrap",
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
          isMobile={isMobile}
        />
      ))}

      {/* Reels/TikToks sem data — fora do cálculo, exibidos como aviso */}
      {undated.count > 0 && (
        <div style={{ marginTop: 10 }}>
          <button onClick={() => setShowUndated(v => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none",
                     cursor: "pointer", fontFamily: "inherit", padding: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: AMB }}>
              ⚠ {undated.count} reel{undated.count > 1 ? "s" : ""}/tiktok{undated.count > 1 ? "s" : ""} sem data de postagem
            </span>
            <span style={{ fontSize: 10, color: TX3 }}>{showUndated ? "▲" : "▼"}</span>
          </button>
          {showUndated && (
            <div style={{ marginTop: 6 }}>
              {undated.byContract.map(u => (
                <div key={u.contractId} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
                  <span style={{ color: TX }}>{u.company}</span>
                  <span style={{ color: TX2, fontWeight: 600 }}>{u.count}</span>
                </div>
              ))}
              <p style={{ margin: "4px 0 0", fontSize: 11, color: TX3 }}>
                Defina a data de postagem para que entrem no cálculo do mês.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Rodapé explicativo */}
      <p style={{ margin: "10px 0 0", fontSize: 11, color: TX3, lineHeight: 1.5 }}>
        Capacidade de produção: {slots[0]?.capacity ?? 26} reels+tiktoks/mês. Só entram no cálculo entregáveis com data definida.
      </p>
    </div>
  );
}
