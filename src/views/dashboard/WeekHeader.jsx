/**
 * src/views/dashboard/WeekHeader.jsx
 * Bloco 1 — Cabeçalho da semana
 *
 * Props:
 *   today         {Date}
 *   weekStart     {Date}
 *   weekEnd       {Date}
 *   weekDone      {number}  — deliverables with stage==="done" this week
 *   weekTotal     {number}  — deliverables with plannedPostDate this week
 *   inProd        {number}  — stage in [roteiro, ap_roteiro, gravacao, edicao]
 *   awaitingApproval {number}
 *   atRisk        {number}  — HIGH signals count
 *   isMobile      {boolean}
 *   onChipClick   {(chipId) => void}
 */

import { fmtDayMonth, fmtDayLong, dayIndex } from "../../lib/dates.js";
// ─── Tokens inline (sem dependência de src/constants/) ──────
const B1   = "#FEFEFE";
const B2   = "#F7F7F7";
const B3   = "#EFEFEF";
const LN   = "#F0F0F2";
const LN2  = "#D8D8D8";
const TX   = "#000000";
const TX2  = "#6E6E6E";
const TX3  = "#ABABAB";
const RED  = "#C8102E";
const GRN  = "#16A34A";
const AMB  = "#D97706";
const BLU  = "#2563EB";
const G    = { background:"#FEFEFE", border:"1px solid #F0F0F2", borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.06)" };
const TRANS = "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)";

const CHIP_DEFS = [
  {
    id:     "entregar",
    label:  "Entregar esta semana",
    labelShort: "Entregar",
    color:  TX2,
    bg:     B3,
  },
  {
    id:     "producao",
    label:  "Em produção agora",
    labelShort: "Em produção",
    color:  BLU,
    bg:     `${BLU}12`,
  },
  {
    id:     "aprovacao",
    label:  "Aguardando aprovação",
    labelShort: "Aprovação",
    color:  AMB,
    bg:     `${AMB}12`,
  },
  {
    id:     "risco",
    label:  "Em risco",
    labelShort: "Em risco",
    color:  RED,
    bg:     `${RED}10`,
  },
];

export function WeekHeader({
  today,
  weekStart,
  weekEnd,
  weekDone,
  weekTotal,
  deliverThisWeek,
  inProd,
  awaitingApproval,
  atRisk,
  isMobile,
  onChipClick,
}) {
  const hour = today.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dayOfWeek = dayIndex(today) + 1; // 1–7
  const weekLabel = `Semana de ${fmtDayMonth(weekStart)} a ${fmtDayMonth(weekEnd)}`;
  const subLabel  = `${greeting} · ${fmtDayLong(today)} · Dia ${dayOfWeek} de 7`;

  const pct    = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
  const progW  = weekTotal > 0 ? `${pct}%` : "0%";
  const progTx = weekTotal === 0
    ? "Sem entregas planejadas para esta semana"
    : `${weekDone} / ${weekTotal} · ${pct}%`;

  const counts = [deliverThisWeek, inProd, awaitingApproval, atRisk];

  return (
    <div style={{
      ...G,
      padding: isMobile ? "16px" : "20px 24px",
      marginBottom: 16,
      borderLeft: `4px solid ${RED}`,
    }}>
      {/* Título e subtítulo */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: isMobile ? 15 : 17, fontWeight: 800, color: TX, letterSpacing: "-.01em" }}>
          {weekLabel}
        </div>
        <div style={{ fontSize: 12, color: TX2, marginTop: 3 }}>{subLabel}</div>
      </div>

      {/* 4 chips */}
      <div style={{
        display: "flex",
        gap: isMobile ? 6 : 10,
        flexWrap: isMobile ? "wrap" : "nowrap",
        marginBottom: 16,
      }}>
        {CHIP_DEFS.map((def, i) => {
          const count    = counts[i];
          const clickable = count > 0;
          return (
            <button
              key={def.id}
              onClick={() => clickable && onChipClick(def.id)}
              title={clickable ? `Ver: ${def.label}` : undefined}
              style={{
                display:        "flex",
                alignItems:     "center",
                gap:            8,
                padding:        isMobile ? "6px 10px" : "7px 14px",
                borderRadius:   99,
                border:         `1.5px solid ${clickable ? def.color + "40" : LN}`,
                background:     clickable ? def.bg : B2,
                cursor:         clickable ? "pointer" : "default",
                opacity:        clickable ? 1 : 0.6,
                transition:     TRANS,
                fontFamily:     "inherit",
                flexShrink:     0,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 600, color: clickable ? def.color : TX3 }}>
                {isMobile ? def.labelShort : def.label}
              </span>
              <span style={{
                fontSize:   15,
                fontWeight: 800,
                color:      clickable ? def.color : TX3,
                lineHeight: 1,
              }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Barra de progresso */}
      <div>
        <div style={{
          height:       6,
          background:   B3,
          borderRadius: 3,
          overflow:     "hidden",
          marginBottom: 6,
        }}>
          <div style={{
            height:     "100%",
            width:      progW,
            background: GRN,
            borderRadius: 3,
            transition: "width .4s ease",
          }} />
        </div>
        <div style={{ fontSize: 11, color: TX2 }}>{progTx}</div>
      </div>
    </div>
  );
}
