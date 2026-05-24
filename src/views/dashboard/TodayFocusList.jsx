/**
 * src/views/dashboard/TodayFocusList.jsx — FASE 4 (design system)
 * Bloco 2 — Foco de hoje (lista priorizada, máx 7 itens)
 */
import { daysBetween, fmtDayMonth } from "../../lib/dates.js";
import { theme as ds } from "../../lib/theme.js";
import { Icon as DsIcon } from "../../ui/index.js";

const G = {
  background:   ds.color.neutral[0],
  border:       ds.border.thin,
  borderRadius: ds.radius.xl,
  boxShadow:    ds.shadow.sm,
};

// Stage labels — text content, unchanged
const STAGE_LABELS = {
  briefing:"Briefing", roteiro:"Roteiro", ap_roteiro:"Ap. Roteiro",
  gravacao:"Gravação", edicao:"Edição", ap_final:"Ap. Final",
  postagem:"Postagem", done:"✓ Entregue",
};

// Stage colors — data visualization palette, intentionally outside token system
const STAGE_COLORS = {
  briefing:"#94A3B8", roteiro:"#7C3AED", ap_roteiro:"#D97706",
  gravacao:"#BE185D", edicao:"#2563EB", ap_final:"#EA580C",
  postagem:"#0891B2", done:"#16A34A",
};

const NEXT_ACTION = {
  briefing:"Iniciar roteiro", roteiro:"Enviar p/ aprov.",
  ap_roteiro:"Cobrar cliente", gravacao:"Marcar gravado",
  edicao:"Enviar p/ aprov.", ap_final:"Cobrar cliente",
  postagem:"Marcar postado", done:null,
};

// Versão curta para mobile (botão não pode ter minWidth grande em 360px)
const NEXT_ACTION_SHORT = {
  briefing:"Roteirizar", roteiro:"Aprovar",
  ap_roteiro:"Cobrar", gravacao:"Gravado",
  edicao:"Aprovar", ap_final:"Cobrar",
  postagem:"Postado", done:null,
};

function RelativeDate({ days }) {
  if (days === null) return <span style={{ color:ds.color.neutral[400] }}>sem data</span>;
  if (days < 0)  return <span style={{ color:ds.color.danger[500],  fontWeight:ds.font.weight.semibold }}>atrasado {Math.abs(days)}d</span>;
  if (days === 0) return <span style={{ color:ds.color.warning[500], fontWeight:ds.font.weight.semibold }}>hoje</span>;
  if (days === 1) return <span style={{ color:ds.color.warning[500], fontWeight:ds.font.weight.medium  }}>amanhã</span>;
  return <span style={{ color:ds.color.neutral[500] }}>em {days}d</span>;
}

function FocusItem({ d, idx, contract, today, isMobile, onOpenItem, onActionClick }) {
  const days       = daysBetween(today, d.plannedPostDate);
  const brandColor = contract?.color || ds.color.neutral[400];
  const stageLabel = STAGE_LABELS[d.stage] || d.stage;
  const stageColor = STAGE_COLORS[d.stage] || ds.color.neutral[500];
  const nextAction = (isMobile ? NEXT_ACTION_SHORT[d.stage] : NEXT_ACTION[d.stage]) || NEXT_ACTION[d.stage];
  const isTop      = idx < 3;

  return (
    <div onClick={() => onOpenItem(d)}
      style={{ display:"flex", alignItems:"center", gap: ds.space[3],
        padding: `${ds.space[3]} 0`,
        borderBottom: ds.border.thin,
        cursor:"pointer", transition:`background ${ds.motion.fast}` }}
      onMouseEnter={e => e.currentTarget.style.background = ds.color.neutral[50]}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {/* Priority number — top 3 destacados em vermelho */}
      <div style={{
        width:24, height:24, borderRadius:"50%",
        background: isTop ? ds.color.brand[500] : "transparent",
        border: isTop ? "none" : `1px solid ${ds.color.neutral[200]}`,
        color: isTop ? ds.color.neutral[0] : ds.color.neutral[500],
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize: ds.font.size.xs, fontWeight: ds.font.weight.semibold,
        fontVariantNumeric:"tabular-nums",
        flexShrink:0, marginLeft: ds.space[1],
      }}>
        {idx + 1}
      </div>
      {/* Brand dot */}
      <div style={{ width:8, height:8, borderRadius:"50%", background:brandColor,
        flexShrink:0 }} title={contract?.company || ""}/>
      {/* Title + meta */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize: ds.font.size.md, fontWeight: ds.font.weight.medium,
          color: ds.color.neutral[900], overflow:"hidden", textOverflow:"ellipsis",
          whiteSpace:"nowrap", marginBottom:3 }}>
          {d.title}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:ds.space[2], fontSize: ds.font.size.xs }}>
          <span style={{ padding:`1px ${ds.space[2]}`, borderRadius: ds.radius.full,
            background:`${stageColor}16`, color:stageColor,
            fontWeight: ds.font.weight.semibold, flexShrink:0 }}>
            {stageLabel}
          </span>
          <span style={{ color: ds.color.neutral[300] }}>·</span>
          <RelativeDate days={days}/>
          {d.plannedPostDate && (
            <span style={{ color: ds.color.neutral[400] }}>
              ({fmtDayMonth(new Date(d.plannedPostDate + "T12:00:00"))})
            </span>
          )}
        </div>
      </div>
      {/* Action button — no mobile o texto encurta e o minWidth some pra caber em 360px */}
      {nextAction && (
        <button onClick={e => { e.stopPropagation(); onOpenItem(d); }}
          title={nextAction}
          style={{ padding: isMobile ? `4px ${ds.space[2]}` : `4px ${ds.space[3]}`,
            fontSize: ds.font.size.xs,
            fontWeight: ds.font.weight.semibold,
            color: ds.color.info[500], background:"none",
            border:`1px solid ${ds.color.info[500]}40`,
            borderRadius: ds.radius.md, cursor:"pointer",
            flexShrink:0, fontFamily:"inherit", whiteSpace:"nowrap",
            minWidth: isMobile ? undefined : "130px",
            textAlign:"center",
            touchAction:"manipulation",
            transition:`background ${ds.motion.fast}` }}
          onMouseEnter={e => e.currentTarget.style.background = `${ds.color.info[500]}10`}
          onMouseLeave={e => e.currentTarget.style.background = "none"}>
          {nextAction}
        </button>
      )}
    </div>
  );
}

export function TodayFocusList({ items, contracts, today, isMobile, hasWeekItems,
  onOpenItem, onNavigate, onActionClick }) {
  const DAYS_PT = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
  const todayLabel = `HOJE, ${DAYS_PT[today.getDay()].toUpperCase()} ${today.getDate()}/${today.getMonth()+1}`;

  return (
    <div style={{ ...G, padding: isMobile ? ds.space[4] : `${ds.space[5]} ${ds.space[6]}`,
      display:"flex", flexDirection:"column" }}>
      <div style={{ marginBottom: ds.space[3] }}>
        <div style={{ fontSize: ds.font.size.xs, fontWeight: ds.font.weight.semibold, letterSpacing:"0.12em",
          color: ds.color.neutral[400], textTransform:"uppercase" }}>
          {todayLabel}
        </div>
        {items.length > 0 && (
          <div style={{ fontSize: ds.font.size.xs, color: ds.color.neutral[400], marginTop: 2 }}>
            Em ordem de prioridade — atrasados e à espera de você primeiro
          </div>
        )}
      </div>
      {items.length === 0 ? (
        <EmptyFocus hasWeekItems={hasWeekItems} onNavigate={onNavigate}/>
      ) : (
        <div>
          {items.map((d, idx) => (
            <FocusItem key={d.id} d={d} idx={idx}
              contract={contracts.find(c => c.id === d.contractId)}
              today={today} isMobile={isMobile} onOpenItem={onOpenItem} onActionClick={onActionClick}/>
          ))}
          {items.length === 7 && (
            <div style={{ fontSize: ds.font.size.xs, color: ds.color.info[500],
              marginTop: ds.space[3], cursor:"pointer", textAlign:"right" }}
              onClick={() => onNavigate("acompanhamento")}>
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
      <div style={{ padding:`${ds.space[8]} 0`, textAlign:"center" }}>
        {/* Icon in circle instead of ☕ emoji */}
        <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
          width:40, height:40, borderRadius:"50%", background: ds.color.neutral[100],
          marginBottom: ds.space[3] }}>
          <DsIcon name="check" size={18} color={ds.color.neutral[500]}/>
        </div>
        <div style={{ fontSize: ds.font.size.sm, fontWeight: ds.font.weight.semibold,
          color: ds.color.neutral[900], marginBottom: ds.space[2] }}>
          Hoje você está livre.
        </div>
        <div style={{ fontSize: ds.font.size.xs, color: ds.color.neutral[500],
          marginBottom: ds.space[4] }}>
          Aproveite para adiantar a semana.
        </div>
        <button onClick={() => onNavigate("acompanhamento")}
          style={{ fontSize: ds.font.size.xs, fontWeight: ds.font.weight.semibold,
            color: ds.color.info[500], background:"none",
            border:`1px solid ${ds.color.info[500]}30`, borderRadius: ds.radius.md,
            padding:`${ds.space[1]} ${ds.space[4]}`, cursor:"pointer", fontFamily:"inherit" }}>
          Ver semana →
        </button>
      </div>
    );
  }
  return (
    <div style={{ padding:`${ds.space[8]} 0`, textAlign:"center" }}>
      {/* Icon in circle instead of 📋 emoji */}
      <div style={{ display:"inline-flex", alignItems:"center", justifyContent:"center",
        width:40, height:40, borderRadius:"50%", background: ds.color.neutral[100],
        marginBottom: ds.space[3] }}>
        <DsIcon name="calendar" size={18} color={ds.color.neutral[500]}/>
      </div>
      <div style={{ fontSize: ds.font.size.sm, fontWeight: ds.font.weight.semibold,
        color: ds.color.neutral[900], marginBottom: ds.space[2] }}>
        Nenhuma entrega planejada.
      </div>
      <div style={{ fontSize: ds.font.size.xs, color: ds.color.neutral[500],
        marginBottom: ds.space[4] }}>
        Que tal cadastrar uma?
      </div>
      <button onClick={() => onNavigate("acompanhamento")}
        style={{ fontSize: ds.font.size.xs, fontWeight: ds.font.weight.semibold,
          color: ds.color.neutral[0], background: ds.color.neutral[900],
          border:"none", borderRadius: ds.radius.md,
          padding:`${ds.space[2]} ${ds.space[4]}`, cursor:"pointer", fontFamily:"inherit" }}>
        + Novo entregável
      </button>
    </div>
  );
}
