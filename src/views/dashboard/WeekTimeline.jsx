/**
 * src/views/dashboard/WeekTimeline.jsx — FASE 4 (design system)
 * Bloco 4 — Linha do tempo da semana
 */
import { toDateStr, fmtDayShort, daysBetween } from "../../lib/dates.js";
import { theme as ds } from "../../lib/theme.js";

const G = {
  background:   ds.color.neutral[0],
  border:       ds.border.thin,
  borderRadius: ds.radius.xl,
  boxShadow:    ds.shadow.sm,
};

const MAX_CHIPS = 4;
const PT_DAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

function isToday(date, today) {
  return date.getDate()  === today.getDate()  &&
    date.getMonth()  === today.getMonth()  &&
    date.getFullYear()=== today.getFullYear();
}
function isWeekend(d) { const day=d.getDay(); return day===0||day===6; }

function DelivChip({ d, contract, today, onOpenItem }) {
  const brandColor = contract?.color || ds.color.neutral[400];
  const days       = daysBetween(today, d.plannedPostDate);
  const shortTitle = d.title.length > 14 ? d.title.substr(0,13)+"…" : d.title;
  const stageMap   = { briefing:"Briefing", roteiro:"Roteiro", ap_roteiro:"Ap. Roteiro",
    gravacao:"Gravação", edicao:"Edição", ap_final:"Ap. Final", postagem:"Postagem", done:"✓" };
  const tooltip = `${d.title} · ${stageMap[d.stage]||d.stage} · ${
    days===null?"—":days===0?"hoje":days>0?`em ${days}d`:`atrasado ${Math.abs(days)}d`}`;

  return (
    <div onClick={e => { e.stopPropagation(); onOpenItem(d); }}
      title={tooltip}
      style={{ height:22, padding:`0 ${ds.space[2]}`, borderRadius: ds.radius.sm,
        background:`${brandColor}18`, borderLeft:`3px solid ${brandColor}`,
        color:brandColor, fontSize: ds.font.size.xs, fontWeight: ds.font.weight.semibold,
        cursor:"pointer", display:"flex", alignItems:"center",
        whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
        transition:`background ${ds.motion.fast}`, marginBottom:3 }}
      onMouseEnter={e => e.currentTarget.style.background=`${brandColor}30`}
      onMouseLeave={e => e.currentTarget.style.background=`${brandColor}18`}>
      {shortTitle}
    </div>
  );
}

function DayColumn({ date, deliverables, contracts, today, onOpenItem }) {
  const isCurrentDay = isToday(date, today);
  const isWknd       = isWeekend(date);
  const dateStr      = toDateStr(date);
  const dayDeliverables = deliverables.filter(d => d.plannedPostDate === dateStr);
  const visible         = dayDeliverables.slice(0, MAX_CHIPS);
  const overflow        = dayDeliverables.length - MAX_CHIPS;

  // TODAY uses brand.500 as contextual accent — NOT a danger/error indicator
  const accentColor = ds.color.brand[500];

  return (
    <div style={{ minWidth:120, flex:"1 1 0", padding: `${ds.space[3]} ${ds.space[2]}`,
      background: isCurrentDay ? `${accentColor}05` : isWknd ? ds.color.neutral[50] : "transparent",
      borderRadius: ds.radius.md,
      border: isCurrentDay ? `1.5px solid ${accentColor}20` : ds.border.thin,
      display:"flex", flexDirection:"column" }}>
      {/* Column header */}
      <div style={{ textAlign:"center", marginBottom: ds.space[2] }}>
        <div style={{ fontSize: ds.font.size.xs, fontWeight: ds.font.weight.semibold,
          color: isCurrentDay ? accentColor : isWknd ? ds.color.neutral[400] : ds.color.neutral[500],
          letterSpacing:"0.06em" }}>
          {PT_DAYS_SHORT[date.getDay()].toUpperCase()} {date.getDate()}
        </div>
        {isCurrentDay && (
          <div style={{ fontSize:9, color: accentColor, fontWeight: ds.font.weight.semibold,
            letterSpacing:"0.04em" }}>
            HOJE
          </div>
        )}
      </div>
      {/* Chips */}
      <div style={{ flex:1 }}>
        {visible.map(d => (
          <DelivChip key={d.id} d={d}
            contract={contracts.find(c => c.id === d.contractId)}
            today={today} onOpenItem={onOpenItem}/>
        ))}
        {overflow > 0 && (
          <div style={{ height:22, padding:`0 ${ds.space[2]}`, borderRadius: ds.radius.sm,
            background: ds.color.neutral[100], border: ds.border.thin,
            color: ds.color.neutral[500], fontSize: ds.font.size.xs,
            fontWeight: ds.font.weight.semibold, cursor:"default",
            display:"flex", alignItems:"center" }}>
            +{overflow}
          </div>
        )}
      </div>
    </div>
  );
}

export function WeekTimeline({ today, days, deliverables, contracts, isMobile,
  onOpenItem, onNavigate }) {
  return (
    <div style={{ ...G, padding: isMobile ? ds.space[4] : `${ds.space[5]} ${ds.space[6]}` }}>
      <div style={{ marginBottom: ds.space[3] }}>
        <div style={{ fontSize:9, fontWeight: ds.font.weight.semibold, letterSpacing:"0.12em",
          color: ds.color.neutral[400], textTransform:"uppercase" }}>
          Linha do tempo da semana
        </div>
      </div>
      <div style={{ overflowX: isMobile?"auto":"visible", WebkitOverflowScrolling:"touch" }}>
        <div style={{ display:"grid",
          gridTemplateColumns:`repeat(7, ${isMobile?"minmax(120px,1fr)":"1fr"})`,
          gap: ds.space[2], minWidth: isMobile ? 840 : "auto" }}>
          {days.map((date, i) => (
            <DayColumn key={i} date={date} deliverables={deliverables}
              contracts={contracts} today={today} onOpenItem={onOpenItem}/>
          ))}
        </div>
      </div>
      <div style={{ textAlign:"right", marginTop: ds.space[3] }}>
        <span onClick={() => onNavigate("acompanhamento")}
          style={{ fontSize: ds.font.size.xs, fontWeight: ds.font.weight.semibold,
            color: ds.color.info[500], cursor:"pointer",
            transition:`opacity ${ds.motion.fast}` }}
          onMouseEnter={e => e.currentTarget.style.textDecoration="underline"}
          onMouseLeave={e => e.currentTarget.style.textDecoration="none"}>
          Ver mês completo →
        </span>
      </div>
    </div>
  );
}
