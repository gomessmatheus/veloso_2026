import { Plus } from "lucide-react";
import { setSetting } from "../db.js";
import { B0, B2, LN, TX, TX2, TX3, RED, GRN, AMB } from "../constants/tokens.js";
import { NAV_ITEMS } from "../constants/tasks.js";
import { ROLE_META } from "../constants/roles.js";
import { Btn } from "./ui.jsx";

export function TopBar({ view, eurRate, usdRate, setEurRate, setUsdRate, onNewContract, syncStatus, isMobile, role, userName }) {
  const title     = NAV_ITEMS.find(i => i.id === view)?.label || view;
  const statusColor = { loading:AMB, ok:GRN, error:RED }[syncStatus] || GRN;
  const statusLabel = { loading:"Sincronizando", ok:"Ao Vivo", error:"Offline" }[syncStatus] || "Ao Vivo";
  const roleMeta  = ROLE_META[role] || ROLE_META.admin;

  if (isMobile) return (
    <div style={{ height:56, borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", paddingLeft:16, paddingRight:16, gap:10, background:"#FEFEFE", flexShrink:0, position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:800, fontSize:13, letterSpacing:".12em", textTransform:"uppercase", color:TX, lineHeight:1 }}>
          ENTRE<span style={{ color:RED }}>GAS</span>
        </div>
        {userName && <div style={{ fontSize:10, color:TX3, marginTop:1 }}>{roleMeta.badge} {userName}</div>}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ width:6, height:6, borderRadius:"50%", background:syncStatus === "ok" ? GRN : syncStatus === "loading" ? AMB : RED, flexShrink:0 }} />
        <button onClick={onNewContract}
          style={{ background:RED, border:"none", borderRadius:10, padding:"9px 18px", color:"white", fontSize:12, fontWeight:700, cursor:"pointer", boxShadow:"0 2px 8px rgba(200,16,46,.25)" }}>
          + Novo
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ height:48, background:B0, borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0, position:"sticky", top:0, zIndex:50 }}>
      <div style={{ fontSize:13, fontWeight:700, color:TX, letterSpacing:"-.01em" }}>{title}</div>
      <div style={{ flex:1 }} />

      {/* EUR rate */}
      <div style={{ display:"flex", alignItems:"center", gap:4, background:B2, border:`1px solid ${LN}`, borderRadius:6, padding:"3px 8px" }}>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>€1=</span>
        <input type="number" step="0.05" value={eurRate || ""} placeholder="—"
          onChange={e => setEurRate(Number(e.target.value) || 0)}
          onBlur={e => setSetting("eurRate", Number(e.target.value) || 0).catch(() => {})}
          style={{ width:52, background:"none", border:"none", color:TX, fontSize:11, fontWeight:700, fontFamily:"inherit", outline:"none", textAlign:"right" }} />
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>R$</span>
      </div>

      {/* USD rate */}
      <div style={{ display:"flex", alignItems:"center", gap:4, background:B2, border:`1px solid ${LN}`, borderRadius:6, padding:"3px 8px" }}>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>$1=</span>
        <input type="number" step="0.05" value={usdRate || ""} placeholder="—"
          onChange={e => setUsdRate(Number(e.target.value) || 0)}
          onBlur={e => setSetting("usdRate", Number(e.target.value) || 0).catch(() => {})}
          style={{ width:52, background:"none", border:"none", color:TX, fontSize:11, fontWeight:700, fontFamily:"inherit", outline:"none", textAlign:"right" }} />
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>R$</span>
      </div>

      {/* Sync status */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 10px", background:`${statusColor}12`, border:`1px solid ${statusColor}30`, borderRadius:99 }}>
        <div style={{ width:6, height:6, borderRadius:"50%", background:statusColor }} />
        <span style={{ fontSize:9, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:statusColor }}>{statusLabel}</span>
      </div>

      {(view === "contratos" || view === "dashboard") && (
        <Btn onClick={onNewContract} variant="primary" size="sm" icon={Plus}>Contrato</Btn>
      )}
    </div>
  );
}
