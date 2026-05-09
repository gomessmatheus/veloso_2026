import { B1, LN, RED } from "../constants/tokens.js";
import { ROLE_NAV } from "../constants/roles.js";
import { fmtDate } from "../utils/format.js";

function NavIcon({ type, active }) {
  const c = active ? RED : "#ABABAB";
  const s = { width:22, height:22, display:"block" };
  if (type === "home")      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  if (type === "prod")      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
  if (type === "contracts") return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
  if (type === "money")     return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
  return null;
}

export function MobileNav({ view, setView, role, userName, deliverables, contracts }) {
  const allowedNav = ROLE_NAV[role] || ROLE_NAV.admin;
  const today    = new Date();
  const isSunday = today.getDay() === 0;

  const ALL_MOB = [
    { id:"dashboard",      label:"Home",       icon:"home"      },
    { id:"acompanhamento", label:"Calendário",  icon:"prod"      },
    { id:"contratos",      label:"Contratos",  icon:"contracts" },
    { id:"financeiro",     label:"Financeiro", icon:"money"     },
    { id:"caixa",          label:"Caixa",      icon:"money"     },
  ];

  const NAV_MOB = ALL_MOB.filter(item => allowedNav.includes(item.id)).slice(0, 4);

  const sendWA = () => {
    const name  = userName || "time";
    const hour  = today.getHours();
    const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const upcoming = (deliverables || []).filter(d => d.stage !== "done" && d.plannedPostDate).sort((a, b) => a.plannedPostDate.localeCompare(b.plannedPostDate)).slice(0, 5);
    const msg = `${greet}, ${name}! 📱\n\n*Resumo semanal ENTREGAS*\n\n📋 Próximas postagens:\n${upcoming.map(d => `• ${d.title} → ${fmtDate(d.plannedPostDate)}`).join("\n") || "Nenhuma agendada"}\n\nBoa semana! 🚀`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:B1, borderTop:`1px solid ${LN}`, display:"flex", alignItems:"stretch", zIndex:100, boxShadow:"0 -2px 16px rgba(0,0,0,0.1)", paddingBottom:"env(safe-area-inset-bottom,0px)" }}>
      {NAV_MOB.map(item => {
        const active = view === item.id;
        return (
          <div key={item.id} onClick={() => setView(item.id)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, cursor:"pointer", padding:"10px 0 8px", borderTop:active ? `2px solid ${RED}` : "2px solid transparent", transition:"all .15s" }}>
            <NavIcon type={item.icon} active={active} />
            <span style={{ fontSize:9, fontWeight:active ? 700 : 400, color:active ? RED : "#ABABAB", letterSpacing:".02em" }}>{item.label}</span>
          </div>
        );
      })}
      <div onClick={sendWA}
        style={{ width:52, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, cursor:"pointer", padding:"10px 0 8px", borderTop:isSunday ? "2px solid #25D366" : "2px solid transparent", background:isSunday ? "rgba(37,211,102,.05)" : "transparent" }}>
        <span style={{ fontSize:18, lineHeight:1 }}>📱</span>
        <span style={{ fontSize:9, fontWeight:isSunday ? 700 : 400, color:isSunday ? "#128C7E" : "#ABABAB" }}>WA</span>
      </div>
    </div>
  );
}
