import { useMemo } from "react";
import { LogOut } from "lucide-react";
import { getMyPresence } from "../db.js";
import { B0, B2, B3, LN, TX, TX2, TX3, RED, GRN, TRANS } from "../constants/tokens.js";
import { NAV_ITEMS } from "../constants/tasks.js";
import { ROLE_NAV, ROLE_META } from "../constants/roles.js";
import { fmtDate, daysLeft } from "../utils/format.js";

export function Sidebar({ view, setView, user, onSignOut, onInvite, onlineUsers, contracts, role, userName, deliverables }) {
  const my = useMemo(() => getMyPresence(), []);
  const allowedNav = ROLE_NAV[role] || ROLE_NAV.admin;
  const roleMeta   = ROLE_META[role] || ROLE_META.admin;
  const today   = new Date();
  const isSunday = today.getDay() === 0;

  const sendWhatsApp = () => {
    const activeContracts = contracts.filter(c => !c.archived);
    const hour  = today.getHours();
    const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
    const dateStr = today.toLocaleDateString("pt-BR", { weekday:"long", day:"numeric", month:"long" });

    let msg = "";
    if (role === "influencer") {
      const upcoming = (deliverables || []).filter(d => d.stage !== "done" && d.plannedPostDate).sort((a, b) => a.plannedPostDate.localeCompare(b.plannedPostDate)).slice(0, 7);
      const late = (deliverables || []).filter(d => d.stage !== "done" && d.plannedPostDate && daysLeft(d.plannedPostDate) < 0);
      msg = `${greet}, ${userName}! 🎬\n\n📅 *Resumo semanal — ${dateStr}*\n\n`;
      if (late.length) msg += `⚠️ *Atrasados (${late.length}):*\n${late.map(d => `• ${d.title}`).join("\n")}\n\n`;
      msg += `📋 *Próximas postagens:*\n${upcoming.map(d => `• ${d.title} → ${fmtDate(d.plannedPostDate)}`).join("\n") || "Nenhuma agendada"}\n\n`;
      msg += `Bora produzir! 💪`;
    } else if (role === "agente") {
      const totalBRL = activeContracts.reduce((s, c) => s + (Number(c.contractValue) || Number(c.monthlyValue) || 0), 0);
      msg = `${greet}, ${userName}! 📊\n\n*Resumo semanal Ranked — ${dateStr}*\n\n`;
      msg += `💰 *Contratos ativos:* ${activeContracts.length}\n`;
      msg += `💵 *Volume total:* R$${totalBRL.toLocaleString("pt-BR")}\n\n`;
      const pending = activeContracts.filter(c => c.contractDeadline && daysLeft(c.contractDeadline) <= 14 && daysLeft(c.contractDeadline) >= 0);
      if (pending.length) msg += `⏰ *Vencendo em 14 dias:*\n${pending.map(c => `• ${c.company} — ${fmtDate(c.contractDeadline)}`).join("\n")}\n\n`;
      msg += `Boa semana! 🚀`;
    } else if (role === "atendimento") {
      const late = (deliverables || []).filter(d => d.stage !== "done" && d.plannedPostDate && daysLeft(d.plannedPostDate) < 0);
      const upcoming = (deliverables || []).filter(d => d.stage !== "done" && d.plannedPostDate && daysLeft(d.plannedPostDate) >= 0 && daysLeft(d.plannedPostDate) <= 7);
      msg = `${greet}, ${userName}! 🤝\n\n*Resumo semanal — ${dateStr}*\n\n`;
      if (late.length) msg += `🔴 *Atrasados (${late.length}):*\n${late.slice(0, 5).map(d => `• ${d.title}`).join("\n")}\n\n`;
      msg += `📅 *Entregas esta semana (${upcoming.length}):*\n${upcoming.slice(0, 5).map(d => `• ${d.title} → ${fmtDate(d.plannedPostDate)}`).join("\n") || "Nenhuma"}\n\n`;
      msg += `Boa semana! 💪`;
    } else {
      const totalBRL = activeContracts.reduce((s, c) => s + (Number(c.contractValue) || Number(c.monthlyValue) || 0), 0);
      const late = (deliverables || []).filter(d => d.stage !== "done" && d.plannedPostDate && daysLeft(d.plannedPostDate) < 0);
      msg = `${greet}, ${userName}! 👑\n\n*Resumo semanal ENTREGAS — ${dateStr}*\n\n`;
      msg += `📊 Contratos ativos: ${activeContracts.length} | Volume: R$${totalBRL.toLocaleString("pt-BR")}\n`;
      msg += `⚙️ Entregáveis atrasados: ${late.length}\n\n`;
      msg += `Boa semana! 🚀`;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div style={{ width:220, background:B0, borderRight:`1px solid ${LN}`, display:"flex", flexDirection:"column", height:"100vh", flexShrink:0, position:"sticky", top:0 }}>
      {/* Logo */}
      <div style={{ padding:"20px 16px", borderBottom:`1px solid ${LN}` }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:".18em", textTransform:"uppercase", color:TX }}>
          ENTRE<span style={{ color:RED }}>GAS</span>
        </div>
        <div style={{ fontSize:10, color:TX3, marginTop:3, letterSpacing:".03em" }}>Ranked</div>
      </div>

      {/* Nav */}
      <nav style={{ padding:"12px 8px", flex:1, overflowY:"auto" }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX3, padding:"4px 8px", marginBottom:4 }}>Navegação</div>
        {NAV_ITEMS.filter(item => allowedNav.includes(item.id)).map(item => {
          const active = view === item.id;
          return (
            <div key={item.id} onClick={() => setView(item.id)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:active ? 600 : 400, color:active ? TX : TX2, background:active ? B3 : "transparent", marginBottom:2, transition:TRANS, boxShadow:active ? "0 1px 3px rgba(0,0,0,0.06)" : "none" }}
              onMouseEnter={e => { if (!active) { e.currentTarget.style.background = B2; e.currentTarget.style.color = TX; } }}
              onMouseLeave={e => { if (!active) { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = TX2; } }}>
              <item.icon size={14} style={{ color: active ? RED : TX3, flexShrink:0 }} />
              {item.label}
            </div>
          );
        })}
      </nav>

      {/* WhatsApp summary */}
      <div style={{ padding:"8px 8px 0" }}>
        <button onClick={sendWhatsApp}
          style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${isSunday ? "#25D366" : "rgba(37,211,102,.3)"}`, background:isSunday ? "rgba(37,211,102,.12)" : "transparent", color:isSunday ? "#128C7E" : TX2, fontSize:11, fontWeight:isSunday ? 700 : 500, cursor:"pointer", display:"flex", alignItems:"center", gap:7, transition:"all .2s", boxShadow:isSunday ? "0 0 0 2px rgba(37,211,102,.2)" : "none" }}>
          <span style={{ fontSize:14 }}>📱</span>
          <span>{isSunday ? "📤 Enviar resumo da semana" : "Resumo WhatsApp"}</span>
        </button>
      </div>

      {/* Presence + user */}
      <div style={{ padding:"12px 16px", borderTop:`1px solid ${LN}`, marginTop:8 }}>
        {onlineUsers.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:-4, marginBottom:10 }}>
            {[...onlineUsers.filter(u => u.sessionId !== my.sessionId), { ...my, isMe:true }].slice(0, 5).map((u, i) => (
              <div key={u.sessionId || i} title={u.isMe ? `${u.name} (você)` : u.name}
                style={{ width:24, height:24, borderRadius:"50%", background:u.color, border:`2px solid ${B0}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff", marginLeft:i > 0 ? -8 : 0, zIndex:10 - i, position:"relative" }}>
                {u.name?.charAt(0).toUpperCase()}
                {u.isMe && <div style={{ position:"absolute", bottom:-1, right:-1, width:7, height:7, borderRadius:"50%", background:GRN, border:`1px solid ${B0}` }} />}
              </div>
            ))}
            <span style={{ fontSize:10, color:TX2, marginLeft:12 }}>{onlineUsers.length} online</span>
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
          <span style={{ fontSize:10 }}>{roleMeta.badge}</span>
          <span style={{ fontSize:10, fontWeight:700, color:roleMeta.color, padding:"1px 7px", borderRadius:99, background:`${roleMeta.color}14` }}>{roleMeta.label}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:11, color:TX2, fontWeight:500 }}>{userName || user?.email?.split("@")[0]}</div>
          <div style={{ display:"flex", gap:4 }}>
            {role === "admin" && (
              <button onClick={onInvite} title="Convidar usuário" style={{ background:"none", border:"none", color:TX3, cursor:"pointer", padding:4, fontSize:12 }}>👤+</button>
            )}
            <button onClick={onSignOut} title="Sair" style={{ background:"none", border:"none", color:TX3, cursor:"pointer", padding:4 }}>
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
