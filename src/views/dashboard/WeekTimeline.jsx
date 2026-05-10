/**
 * src/views/dashboard/WeekTimeline.jsx
 * Bloco 4 — Linha do tempo da semana
 *
 * Props:
 *   today        {Date}
 *   days         {Date[]}    — 7 Date objects [Mon…Sun] from weekDays()
 *   deliverables {object[]}  — already filtered to current week
 *   contracts    {object[]}
 *   isMobile     {boolean}
 *   onOpenItem   {(d) => void}
 *   onNavigate   {(view) => void}
 */

import { toDateStr, fmtDayShort, daysBetween } from "../../lib/dates.js";
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

const MAX_CHIPS = 4;

const PT_DAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function isToday(date, today) {
  return (
    date.getDate()     === today.getDate() &&
    date.getMonth()    === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
}

function isWeekend(date) {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function DelivChip({ d, contract, today, onOpenItem }) {
  const brandColor = contract?.color || "#94A3B8";
  const days       = daysBetween(today, d.plannedPostDate);
  const shortTitle = d.title.length > 14 ? d.title.substr(0, 13) + "…" : d.title;
  const stageMap   = {
    briefing:"Briefing", roteiro:"Roteiro", ap_roteiro:"Ap. Roteiro",
    gravacao:"Gravação", edicao:"Edição", ap_final:"Ap. Final",
    postagem:"Postagem", done:"✓ Entregue",
  };
  const tooltip = `${d.title} · ${stageMap[d.stage] || d.stage} · ${days === null ? "—" : days === 0 ? "hoje" : days > 0 ? `em ${days}d` : `atrasado ${Math.abs(days)}d`}`;

  return (
    <div
      onClick={e => { e.stopPropagation(); onOpenItem(d); }}
      title={tooltip}
      style={{
        height:       22,
        padding:      "0 8px",
        borderRadius: 4,
        background:   `${brandColor}18`,
        borderLeft:   `3px solid ${brandColor}`,
        color:        brandColor,
        fontSize:     10,
        fontWeight:   600,
        cursor:       "pointer",
        display:      "flex",
        alignItems:   "center",
        whiteSpace:   "nowrap",
        overflow:     "hidden",
        textOverflow: "ellipsis",
        transition:   TRANS,
        marginBottom: 3,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = `${brandColor}30`; }}
      onMouseLeave={e => { e.currentTarget.style.background = `${brandColor}18`; }}
    >
      {shortTitle}
    </div>
  );
}

function DayColumn({ date, deliverables, contracts, today, onOpenItem }) {
  const isCurrentDay  = isToday(date, today);
  const isWknd        = isWeekend(date);
  const dateStr       = toDateStr(date);
  const dayDeliverables = deliverables.filter(d => d.plannedPostDate === dateStr);
  const visible       = dayDeliverables.slice(0, MAX_CHIPS);
  const overflow      = dayDeliverables.length - MAX_CHIPS;

  return (
    <div style={{
      minWidth:     120,
      flex:         "1 1 0",
      padding:      "10px 8px",
      background:   isCurrentDay ? `${RED}06` : isWknd ? "#F9FAFB" : "transparent",
      borderRadius: 8,
      border:       isCurrentDay ? `1.5px solid ${RED}20` : `1px solid ${LN}`,
      display:      "flex",
      flexDirection:"column",
    }}>
      {/* Column header */}
      <div style={{
        textAlign:  "center",
        marginBottom: 8,
      }}>
        <div style={{
          fontSize:   10,
          fontWeight: 700,
          color:      isCurrentDay ? RED : isWknd ? TX3 : TX2,
          letterSpacing: ".06em",
        }}>
          {PT_DAYS_SHORT[date.getDay()].toUpperCase()} {date.getDate()}
        </div>
        {isCurrentDay && (
          <div style={{ fontSize: 9, color: RED, fontWeight: 700, letterSpacing: ".04em" }}>
            HOJE
          </div>
        )}
      </div>

      {/* Chips */}
      <div style={{ flex: 1 }}>
        {visible.map(d => (
          <DelivChip
            key={d.id}
            d={d}
            contract={contracts.find(c => c.id === d.contractId)}
            today={today}
            onOpenItem={onOpenItem}
          />
        ))}
        {overflow > 0 && (
          <div style={{
            height:       22,
            padding:      "0 8px",
            borderRadius: 4,
            background:   B3,
            border:       `1px solid ${LN2}`,
            color:        TX2,
            fontSize:     10,
            fontWeight:   700,
            cursor:       "default",
            display:      "flex",
            alignItems:   "center",
          }}>
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}

export function WeekTimeline({
  today,
  days,
  deliverables,
  contracts,
  isMobile,
  onOpenItem,
  onNavigate,
}) {
  return (
    <div style={{ ...G, padding: isMobile ? "16px" : "20px 24px" }}>
      {/* Header */}
      <div style={{ marginBottom: 12 }}>
        <div style={{
          fontSize:      10,
          fontWeight:    700,
          letterSpacing: ".12em",
          color:         TX3,
          textTransform: "uppercase",
        }}>
          Linha do tempo da semana
        </div>
      </div>

      {/* 7-column grid — horizontal scroll on mobile */}
      <div style={{
        overflowX:         isMobile ? "auto" : "visible",
        WebkitOverflowScrolling: "touch",
      }}>
        <div style={{
          display:             "grid",
          gridTemplateColumns: `repeat(7, ${isMobile ? "minmax(120px,1fr)" : "1fr"})`,
          gap:                 8,
          minWidth:            isMobile ? 840 : "auto",
        }}>
          {days.map((date, i) => (
            <DayColumn
              key={i}
              date={date}
              deliverables={deliverables}
              contracts={contracts}
              today={today}
              onOpenItem={onOpenItem}
            />
          ))}
        </div>
      </div>

      {/* Footer link */}
      <div style={{ textAlign: "right", marginTop: 12 }}>
        <span
          onClick={() => onNavigate("acompanhamento")}
          style={{
            fontSize:   11,
            fontWeight: 600,
            color:      BLU,
            cursor:     "pointer",
            transition: TRANS,
          }}
          onMouseEnter={e => { e.currentTarget.style.textDecoration = "underline"; }}
          onMouseLeave={e => { e.currentTarget.style.textDecoration = "none"; }}
        >
          Ver mês completo →
        </span>
      </div>
    </div>
  );
}
