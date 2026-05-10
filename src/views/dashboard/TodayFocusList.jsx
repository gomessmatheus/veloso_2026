/**
 * src/views/dashboard/TodayFocusList.jsx
 * Bloco 2 — Foco de hoje (lista priorizada, máx 7 itens)
 *
 * Props:
 *   items         {object[]}   — already sorted by priority, max 7, stage!=="done"
 *   contracts     {object[]}   — for brand color lookup
 *   today         {Date}
 *   isMobile      {boolean}
 *   hasWeekItems  {boolean}    — true if there are any deliverables this week
 *   onOpenItem    {(d) => void}
 *   onNavigate    {(view) => void}
 *   onActionClick {(d) => void}
 */

import { daysBetween, fmtDayMonth } from "../../lib/dates.js";
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

// Stage label map (using real stage IDs from App.jsx STAGES constant)
const STAGE_LABELS = {
  briefing:   "Briefing",
  roteiro:    "Roteiro",
  ap_roteiro: "Ap. Roteiro",
  gravacao:   "Gravação",
  edicao:     "Edição",
  ap_final:   "Ap. Final",
  postagem:   "Postagem",
  done:       "✓ Entregue",
};

// Stage badge colors
const STAGE_COLORS = {
  briefing:   "#94A3B8",
  roteiro:    "#7C3AED",
  ap_roteiro: "#D97706",
  gravacao:   "#BE185D",
  edicao:     "#2563EB",
  ap_final:   "#EA580C",
  postagem:   "#0891B2",
  done:       "#16A34A",
};

// Next action label per stage
const NEXT_ACTION = {
  briefing:   "Iniciar roteiro",
  roteiro:    "Enviar p/ aprov.",
  ap_roteiro: "Cobrar cliente",
  gravacao:   "Marcar gravado",
  edicao:     "Enviar p/ aprov.",
  ap_final:   "Cobrar cliente",
  postagem:   "Marcar postado",
  done:       null,
};

function RelativeDate({ days }) {
  if (days === null) return <span style={{ color: TX3 }}>sem data</span>;
  if (days < 0)      return <span style={{ color: RED, fontWeight: 700 }}>atrasado {Math.abs(days)}d</span>;
  if (days === 0)    return <span style={{ color: AMB, fontWeight: 700 }}>hoje</span>;
  if (days === 1)    return <span style={{ color: "#D97706", fontWeight: 600 }}>amanhã</span>;
  return <span style={{ color: TX2 }}>em {days}d</span>;
}

function FocusItem({ d, contract, today, onOpenItem, onActionClick }) {
  const days       = daysBetween(today, d.plannedPostDate);
  const brandColor = contract?.color || "#94A3B8";
  const stageLabel = STAGE_LABELS[d.stage] || d.stage;
  const stageColor = STAGE_COLORS[d.stage] || TX2;
  const nextAction = NEXT_ACTION[d.stage];
  const [hov, setHov] = (typeof window !== "undefined")
    ? [false, () => {}]  // placeholder — see useState below
    : [false, () => {}];

  return (
    <div
      onClick={() => onOpenItem(d)}
      style={{
        display:       "flex",
        alignItems:    "center",
        gap:           12,
        padding:       "11px 0",
        borderBottom:  `1px solid ${LN}`,
        cursor:        "pointer",
        transition:    TRANS,
      }}
      onMouseEnter={e => e.currentTarget.style.background = B2}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >
      {/* Brand color dot */}
      <div style={{
        width:        10,
        height:       10,
        borderRadius: "50%",
        background:   brandColor,
        flexShrink:   0,
        marginLeft:   4,
      }} />

      {/* Title + meta */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:      14,
          fontWeight:    500,
          color:         TX,
          overflow:      "hidden",
          textOverflow:  "ellipsis",
          whiteSpace:    "nowrap",
          marginBottom:  3,
        }}>
          {d.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
          {/* Stage badge */}
          <span style={{
            padding:      "1px 7px",
            borderRadius: 99,
            background:   `${stageColor}16`,
            color:        stageColor,
            fontWeight:   700,
            fontSize:     10,
            flexShrink:   0,
          }}>
            {stageLabel}
          </span>
          <span style={{ color: TX3 }}>·</span>
          <RelativeDate days={days} />
          {d.plannedPostDate && (
            <span style={{ color: TX3, fontSize: 10 }}>({fmtDayMonth(new Date(d.plannedPostDate + "T12:00:00"))})</span>
          )}
        </div>
      </div>

      {/* Action button */}
      {nextAction && (
        <button
          onClick={e => { e.stopPropagation(); onActionClick(d); }}
          title={nextAction}
          style={{
            padding:      "4px 10px",
            fontSize:     10,
            fontWeight:   700,
            color:        BLU,
            background:   "none",
            border:       `1px solid ${BLU}40`,
            borderRadius: 6,
            cursor:       "pointer",
            flexShrink:   0,
            fontFamily:   "inherit",
            whiteSpace:   "nowrap",
            transition:   TRANS,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = `${BLU}10`; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}
        >
          {nextAction}
        </button>
      )}
    </div>
  );
}

export function TodayFocusList({
  items,
  contracts,
  today,
  isMobile,
  hasWeekItems,
  onOpenItem,
  onNavigate,
  onActionClick,
}) {
  const DAYS_PT  = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const MONTHS_SHORT = ["jan","fev","mar","abr","mai","jun","jul","ago","set","out","nov","dez"];
  const todayLabel = `HOJE, ${DAYS_PT[today.getDay()].toUpperCase()} ${today.getDate()}/${today.getMonth()+1}`;

  return (
    <div style={{
      ...G,
      padding:     isMobile ? "16px" : "20px 24px",
      display:     "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: ".12em",
        color:         TX3,
        marginBottom:  12,
        textTransform: "uppercase",
      }}>
        {todayLabel}
      </div>

      {/* List */}
      {items.length === 0 ? (
        <EmptyFocus hasWeekItems={hasWeekItems} onNavigate={onNavigate} />
      ) : (
        <div>
          {items.map(d => (
            <FocusItem
              key={d.id}
              d={d}
              contract={contracts.find(c => c.id === d.contractId)}
              today={today}
              onOpenItem={onOpenItem}
              onActionClick={onActionClick}
            />
          ))}
          {items.length === 7 && (
            <div
              style={{ fontSize: 11, color: BLU, marginTop: 12, cursor: "pointer", textAlign: "right" }}
              onClick={() => onNavigate("acompanhamento")}
            >
              Ver todos no pipeline →
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function EmptyFocus({ hasWeekItems, onNavigate }) {
  if (hasWeekItems) {
    return (
      <div style={{ padding: "32px 0", textAlign: "center" }}>
        <div style={{ fontSize: 28, marginBottom: 10 }}>☕</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: TX, marginBottom: 6 }}>
          Hoje você está livre.
        </div>
        <div style={{ fontSize: 12, color: TX2, marginBottom: 14 }}>
          Aproveite para adiantar a semana.
        </div>
        <button
          onClick={() => onNavigate("acompanhamento")}
          style={{
            fontSize:     11,
            fontWeight:   700,
            color:        BLU,
            background:   "none",
            border:       `1px solid ${BLU}30`,
            borderRadius: 6,
            padding:      "5px 14px",
            cursor:       "pointer",
            fontFamily:   "inherit",
          }}
        >
          Ver semana →
        </button>
      </div>
    );
  }
  return (
    <div style={{ padding: "32px 0", textAlign: "center" }}>
      <div style={{ fontSize: 28, marginBottom: 10 }}>📋</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: TX, marginBottom: 6 }}>
        Nenhuma entrega planejada.
      </div>
      <div style={{ fontSize: 12, color: TX2, marginBottom: 14 }}>
        Que tal cadastrar uma?
      </div>
      <button
        onClick={() => onNavigate("acompanhamento")}
        style={{
          fontSize:     11,
          fontWeight:   700,
          color:        "#fff",
          background:   RED,
          border:       "none",
          borderRadius: 6,
          padding:      "6px 16px",
          cursor:       "pointer",
          fontFamily:   "inherit",
        }}
      >
        + Novo entregável
      </button>
    </div>
  );
}
