/**
 * src/views/dashboard/WeekHeader.jsx — FASE 4 (design system)
 * Bloco 1 — Cabeçalho da semana
 */
import { fmtDayMonth, fmtDayLong, dayIndex } from "../../lib/dates.js";
import { theme as ds } from "../../lib/theme.js";

const G = {
  background:   ds.color.neutral[0],
  border:       ds.border.thin,
  borderRadius: ds.radius.xl,
  boxShadow:    ds.shadow.sm,
};

const CHIP_DEFS = [
  { id:"entregar",  label:"Entregar esta semana", labelShort:"Entregar",  color:ds.color.neutral[500], bg:ds.color.neutral[100] },
  { id:"producao",  label:"Em produção agora",    labelShort:"Produção",  color:ds.color.info[500],    bg:`${ds.color.info[500]}12` },
  { id:"aprovacao", label:"Aguardando aprovação", labelShort:"Aprovação", color:ds.color.warning[500], bg:`${ds.color.warning[500]}12` },
  { id:"risco",     label:"Em risco",             labelShort:"Em risco",  color:ds.color.danger[500],  bg:`${ds.color.danger[500]}10` },
];

export function WeekHeader({ today, weekStart, weekEnd, weekDone, weekTotal,
  deliverThisWeek, inProd, awaitingApproval, atRisk, isMobile, onChipClick }) {

  const hour      = today.getHours();
  const greeting  = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
  const dayOfWeek = dayIndex(today) + 1;
  const weekLabel = `Semana de ${fmtDayMonth(weekStart)} a ${fmtDayMonth(weekEnd)}`;
  const subLabel  = `${greeting} · ${fmtDayLong(today)} · Dia ${dayOfWeek} de 7`;

  const pct    = weekTotal > 0 ? Math.round((weekDone / weekTotal) * 100) : 0;
  const progW  = weekTotal > 0 ? `${pct}%` : "0%";
  const progTx = weekTotal === 0
    ? "Sem entregas planejadas para esta semana"
    : `${weekDone} / ${weekTotal} · ${pct}%`;

  const counts = [deliverThisWeek, inProd, awaitingApproval, atRisk];

  return (
    <div style={{ ...G, padding: isMobile ? ds.space[4] : `${ds.space[5]} ${ds.space[6]}`,
      marginBottom: ds.space[4], borderLeft: `3px solid ${ds.color.brand[500]}` }}>

      {/* Título */}
      <div style={{ marginBottom: ds.space[4] }}>
        <div style={{ fontSize: isMobile ? ds.font.size.lg : ds.font.size.xl,
          fontWeight: ds.font.weight.semibold, color: ds.color.neutral[900],
          letterSpacing: "-0.02em" }}>
          {weekLabel}
        </div>
        <div style={{ fontSize: ds.font.size.sm, color: ds.color.neutral[500], marginTop: ds.space[1] }}>
          {subLabel}
        </div>
      </div>

      {/* 4 chips */}
      <div style={{ display:"flex", gap: isMobile ? ds.space[2] : ds.space[3],
        flexWrap: isMobile ? "wrap" : "nowrap", marginBottom: ds.space[4] }}>
        {CHIP_DEFS.map((def, i) => {
          const count     = counts[i];
          const clickable = count > 0;
          return (
            <button key={def.id}
              onClick={() => clickable && onChipClick(def.id)}
              title={clickable ? `Ver: ${def.label}` : undefined}
              style={{ display:"flex", alignItems:"center", gap: ds.space[2],
                padding: isMobile ? `${ds.space[2]} ${ds.space[3]}` : `${ds.space[2]} ${ds.space[4]}`,
                borderRadius: ds.radius.full,
                border: `1.5px solid ${clickable ? def.color + "40" : ds.color.neutral[200]}`,
                background: clickable ? def.bg : ds.color.neutral[50],
                cursor: clickable ? "pointer" : "default",
                opacity: clickable ? 1 : 0.55,
                transition: `opacity ${ds.motion.fast}`,
                fontFamily: "inherit", flexShrink: 0 }}>
              <span style={{ fontSize: ds.font.size.xs, fontWeight: ds.font.weight.medium,
                color: clickable ? def.color : ds.color.neutral[400] }}>
                {isMobile ? def.labelShort : def.label}
              </span>
              <span style={{ fontSize: ds.font.size.lg, fontWeight: ds.font.weight.semibold,
                color: clickable ? def.color : ds.color.neutral[400], lineHeight: 1 }}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Barra de progresso */}
      <div>
        <div style={{ height: 5, background: ds.color.neutral[100], borderRadius: ds.radius.full,
          overflow: "hidden", marginBottom: ds.space[2] }}>
          <div style={{ height: "100%", width: progW, background: ds.color.success[500],
            borderRadius: ds.radius.full, transition: "width 0.4s ease" }}/>
        </div>
        <div style={{ fontSize: ds.font.size.xs, color: ds.color.neutral[500] }}>{progTx}</div>
      </div>
    </div>
  );
}
