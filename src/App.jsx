import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import {
  loadContracts, syncContracts, loadPosts, syncPosts,
  loadDeliverables, syncDeliverables,
  getSetting, setSetting, subscribeToChanges,
  updatePresence, removePresence, subscribeToPresence, getMyPresence,
} from "./db.js";
import { format, eachDayOfInterval, endOfMonth, endOfWeek, getDay, isEqual, isSameDay, isSameMonth, isToday, parse, startOfToday, startOfWeek, add } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LayoutDashboard, FileText, CheckSquare, Video, Calendar, ChevronLeft, ChevronRight, Plus, X, LogOut, Search, AlertCircle, Clock, CheckCircle2, Circle, Minus, Zap, ArrowUp, ArrowDown, Filter, KanbanSquare, CalendarDays, ChevronDown, ChevronUp, MoreHorizontal } from "lucide-react";

// ─── Design tokens ────────────────────────────────────────
const B0  = "#FEFEFE";           // background (oklch 0.9940 0 0)
const B1  = "#FEFEFE";           // card
const B2  = "#F7F7F7";           // muted (oklch 0.9702 0 0)
const B3  = "#EFEFEF";           // input (oklch 0.9401 0 0)
const LN  = "#F0F0F2";           // border default
const LN2 = "#D8D8D8";           // border strong
const TX  = "#000000";           // foreground
const TX2 = "#6E6E6E";           // muted foreground (oklch 0.4386)
const TX3 = "#ABABAB";           // tertiary
const RED = "#C8102E";           // brand red
const GRN = "#16A34A";           // brand green
const AMB = "#D97706";           // brand amber
const BLU = "#2563EB";           // brand blue
const BLUR = "blur(4px)";
const FONT = "'Plus Jakarta Sans', system-ui, sans-serif";

const CONTRACT_COLORS = ["#C8102E","#1D4ED8","#059669","#D97706","#7C3AED","#0891B2","#BE185D","#92400E","#374151","#0F766E","#B45309"];
const NETWORKS   = ["Instagram","TikTok","YouTube","X / Twitter","Facebook"];
const COMM_RATE  = 0.20;
const MONTHS_PT  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SH  = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const VIEW_TYPES = new Set(["post","tiktok","repost"]);
const TASK_STATUSES = [
  { id:"backlog",     label:"Backlog",       icon:Circle,        color:"#475569" },
  { id:"todo",        label:"A fazer",       icon:Circle,        color:"#94A3B8" },
  { id:"in_progress", label:"Em andamento",  icon:Clock,         color:AMB },
  { id:"in_review",   label:"Em revisão",    icon:AlertCircle,   color:BLU },
  { id:"done",        label:"Concluído",     icon:CheckCircle2,  color:GRN },
  { id:"cancelled",   label:"Cancelado",     icon:Minus,         color:"#334155" },
];
const TASK_PRIORITIES = [
  { id:"urgent", label:"Urgente", icon:Zap,      color:RED },
  { id:"high",   label:"Alto",    icon:ArrowUp,  color:AMB },
  { id:"medium", label:"Médio",   icon:Minus,    color:BLU },
  { id:"low",    label:"Baixo",   icon:ArrowDown,color:TX2 },
  { id:"none",   label:"Sem prio",icon:Minus,    color:TX3 },
];

// ─── Helpers ──────────────────────────────────────────────
const uid      = () => Math.random().toString(36).substr(2, 8);
const fmtDate  = s => { try { if (!s) return "—"; const parts = String(s).split("-"); if (parts.length < 3) return "—"; const [y,m,d] = parts; return `${d}/${m}/${y}`; } catch { return "—"; } };
const daysLeft = s => { try { if (!s) return null; const ms = new Date(s) - new Date(); if (isNaN(ms)) return null; return Math.ceil(ms / 864e5); } catch { return null; } };
const cn       = (...cls) => cls.filter(Boolean).join(" ");

function fmtMoney(v, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency, minimumFractionDigits:0, maximumFractionDigits:0 }).format(v || 0);
}
function monthsBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(start), e = new Date(end);
  return (e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth())+1;
}
function getInstallments(c) {
  if (c.installments?.length > 0) return c.installments;
  const arr = [];
  if (c.parc1Deadline||c.parc1Value) arr.push({ value:Number(c.parc1Value)||0, date:c.parc1Deadline||"" });
  if (c.parc2Deadline||c.parc2Value) arr.push({ value:Number(c.parc2Value)||0, date:c.parc2Deadline||"" });
  return arr.length ? arr : [];
}
function contractTotal(c) {
  if (c.paymentType==="monthly") { const m=monthsBetween(c.contractStart,c.contractDeadline); return m?(c.monthlyValue||0)*m:0; }
  if (c.paymentType==="split") { const inst=getInstallments(c); if(inst.length) return inst.reduce((s,i)=>s+(Number(i.value)||0),0); }
  return c.contractValue||0;
}
function toBRL(value, currency, rates) {
  if (currency==="BRL"||!currency) return value;
  if (currency==="EUR") return rates.eur>0?value*rates.eur:value;
  if (currency==="USD") return rates.usd>0?value*rates.usd:value;
  return value;
}
function calcEngagement(p) {
  const i=(p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0);
  if (!p.reach) return null;
  return i/p.reach*100;
}
function postRepostCount(p) {
  if (p.type==="repost") return 1;
  return Math.max(0,(p.networks||[]).length-1);
}
function getCommEntries(c) {
  if (!c.hasCommission) return [];
  const paid = c.commPaid||{};
  if (c.paymentType==="monthly") {
    if (!c.contractStart||!c.contractDeadline) return [];
    const entries=[]; const s=new Date(c.contractStart),e=new Date(c.contractDeadline);
    const cur=new Date(s.getFullYear(),s.getMonth(),1);
    while(cur<=e){const key=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`;entries.push({key,label:`${MONTHS_SH[cur.getMonth()]} ${cur.getFullYear()}`,amount:(c.monthlyValue||0)*COMM_RATE,currency:c.currency,isPaid:!!paid[key]});cur.setMonth(cur.getMonth()+1);}
    return entries;
  }
  const totalCosts=(c.costs||[]).reduce((s,x)=>s+(Number(x.value)||0),0);
  if (c.paymentType==="split") {
    const O=["1ª","2ª","3ª","4ª","5ª","6ª"];
    const insts=getInstallments(c);
    const costPerInst=insts.length?totalCosts/insts.length:0;
    return insts.map((inst,i)=>({key:`parc${i+1}`,label:`${O[i]||`${i+1}ª`} Parcela`,amount:Math.max(0,(Number(inst.value)||0)-costPerInst)*COMM_RATE,currency:c.currency,date:inst.date,isPaid:!!paid[`parc${i+1}`]}));
  }
  const total=contractTotal(c);
  const costs=(c.costs||[]).reduce((s,x)=>s+(Number(x.value)||0),0);
  const netTotal=Math.max(0,total-costs);
  return [{key:"single",label:"Pagamento Único",amount:netTotal*COMM_RATE,currency:c.currency,date:c.paymentDeadline,isPaid:!!paid["single"]}];
}
function getNFEntries(c) {
  const nf=c.nfEmitted||{};
  if (c.paymentType==="monthly") {
    if (!c.contractStart||!c.contractDeadline) return [];
    const entries=[]; const s=new Date(c.contractStart),e=new Date(c.contractDeadline);
    const cur=new Date(s.getFullYear(),s.getMonth(),1);
    while(cur<=e){const key=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`;entries.push({key,label:`NF ${MONTHS_SH[cur.getMonth()]} ${cur.getFullYear()}`,amount:c.monthlyValue||0,currency:c.currency,isEmitted:!!nf[key]});cur.setMonth(cur.getMonth()+1);}
    return entries;
  }
  if (c.paymentType==="split") {
    const O=["1ª","2ª","3ª","4ª","5ª","6ª"];
    return getInstallments(c).map((inst,i)=>({key:`parc${i+1}`,label:`NF ${O[i]||`${i+1}ª`} Parcela`,amount:Number(inst.value)||0,currency:c.currency,date:inst.date,isEmitted:!!nf[`parc${i+1}`]}));
  }
  const total=contractTotal(c);
  return [{key:"single",label:"NF Única",amount:total,currency:c.currency,date:c.paymentDeadline,isEmitted:!!nf["single"]}];
}
function dlColor(d) { return d==null?TX:d<=7?RED:d<=14?AMB:GRN; }
function currBadge(cur) {
  const s = { padding:"1px 6px",fontSize:8,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",borderRadius:3 };
  if (cur==="EUR") return <span style={{...s,background:"rgba(99,102,241,.18)",border:"1px solid rgba(99,102,241,.3)",color:"#818CF8"}}>EUR</span>;
  if (cur==="USD") return <span style={{...s,background:"rgba(16,185,129,.18)",border:"1px solid rgba(16,185,129,.3)",color:"#34D399"}}>USD</span>;
  return null;
}
function lsLoad(k, fb) { try { const v=localStorage.getItem(k); return v!=null?JSON.parse(v):fb; } catch { return fb; } }
function lsSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

// ─── Mobile detection ─────────────────────────────────────
function useIsMobile() {
  const [mob, setMob] = useState(() => window.innerWidth < 768);
  useEffect(() => {
    const fn = () => setMob(window.innerWidth < 768);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mob;
}

// ─── Seed data ────────────────────────────────────────────
const SEED = [
  { id:"c0",company:"Netshoes",cnpj:"07.187.493/0001-07",color:"#B45309",contractValue:0,monthlyValue:30000,contractStart:"2026-06-01",currency:"BRL",contractDeadline:"2026-08-31",paymentType:"monthly",paymentDeadline:"",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:4,numStories:8,numCommunityLinks:2,numReposts:1,notes:"Embaixador chuteiras · R$30k/mês · jun–ago",installments:[] },
  { id:"c1",company:"Play9 / GeTV",cnpj:"",color:"#C8102E",contractValue:200000,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"2026-07-15",paymentType:"split",paymentDeadline:"",parc1Value:100000,parc1Deadline:"2026-06-01",parc2Value:100000,parc2Deadline:"2026-07-15",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:0,numStories:0,numCommunityLinks:0,numReposts:0,notes:"Viagem Copa do Mundo — Brazil House / GeTV",installments:[] },
  { id:"c2",company:"FlashScore",cnpj:"",color:"#1D4ED8",contractValue:36000,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"2026-07-31",paymentType:"single",paymentDeadline:"2026-07-31",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:8,numStories:13,numCommunityLinks:12,numReposts:1,notes:"8 reels + repost TikTok · 13 stories · 12 links",installments:[] },
  { id:"c3",company:"Coca-Cola",cnpj:"45.997.418/0001-53",color:"#DC2626",contractValue:100000,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"2026-07-15",paymentType:"split",paymentDeadline:"",parc1Value:50000,parc1Deadline:"2026-06-15",parc2Value:50000,parc2Deadline:"2026-07-15",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:3,numStories:0,numCommunityLinks:0,numReposts:0,notes:"3 reels Copa",installments:[] },
  { id:"c4",company:"Kabum!",cnpj:"",color:"#F97316",contractValue:0,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"",paymentType:"single",paymentDeadline:"",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:0,numStories:0,numCommunityLinks:0,numReposts:0,notes:"Aguardando valores",installments:[] },
  { id:"c5",company:"Tramontina",cnpj:"",color:"#0891B2",contractValue:98000,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"",paymentType:"single",paymentDeadline:"",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:0,numStories:0,numCommunityLinks:0,numReposts:0,notes:"",installments:[] },
  { id:"c6",company:"Decolar",cnpj:"",color:"#059669",contractValue:14000,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"",paymentType:"single",paymentDeadline:"",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:0,numStories:0,numCommunityLinks:0,numReposts:1,notes:"1 TikTok",installments:[] },
  { id:"c7",company:"Cacau Show",cnpj:"",color:"#92400E",contractValue:25000,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"",paymentType:"single",paymentDeadline:"",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:2,numStories:0,numCommunityLinks:0,numReposts:0,notes:"2 reels",installments:[] },
  { id:"c8",company:"Paco Rabanne",cnpj:"",color:"#7C3AED",contractValue:2600,monthlyValue:0,contractStart:"",currency:"EUR",contractDeadline:"",paymentType:"single",paymentDeadline:"",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:1,numStories:0,numCommunityLinks:0,numReposts:0,notes:"1 reel · euros",installments:[] },
  { id:"c9",company:"Diamond Filmes",cnpj:"",color:"#BE185D",contractValue:18000,monthlyValue:0,contractStart:"",currency:"BRL",contractDeadline:"",paymentType:"single",paymentDeadline:"",parc1Value:0,parc1Deadline:"",parc2Value:0,parc2Deadline:"",hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,numPosts:1,numStories:0,numCommunityLinks:0,numReposts:0,notes:"1 reel",installments:[] },
];
const SEED_POSTS = [
  { id:"p1",contractId:"c3",title:"Reel Coca-Cola Copa #1",link:"",type:"post",plannedDate:"2026-06-05",publishDate:"",isPosted:false,views:0,reach:0,likes:0,comments:0,shares:0,saves:0,networks:["Instagram"] },
  { id:"p2",contractId:"c7",title:"Reel Cacau Show #1",link:"",type:"post",plannedDate:"2026-06-10",publishDate:"",isPosted:false,views:0,reach:0,likes:0,comments:0,shares:0,saves:0,networks:["Instagram"] },
];
const SEED_TASKS = [];

// ─── Pipeline constants ───────────────────────────────────
const STAGES = [
  { id:"briefing",    label:"Briefing",       days:-9, resp:"Marca → Matheus" },
  { id:"roteiro",     label:"Roteiro",         days:-7, resp:"Lucas"           },
  { id:"ap_roteiro",  label:"Ap. Roteiro",     days:-5, resp:"Marca"           },
  { id:"gravacao",    label:"Gravação",         days:-4, resp:"Lucas"           },
  { id:"edicao",      label:"Edição",           days:-3, resp:"Leandro"         },
  { id:"ap_final",    label:"Ap. Final",        days:-1, resp:"Marca"           },
  { id:"postagem",    label:"Postagem",         days:0,  resp:"Lucas"           },
  { id:"done",        label:"✓ Entregue",       days:0,  resp:""               },
];
const STAGE_IDS = STAGES.map(s => s.id);

function addDays(dateStr, n) {
  if (!dateStr || n == null) return null;
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + n);
    return d.toISOString().substr(0, 10);
  } catch { return null; }
}

function calcStageDates(postDate) {
  if (!postDate) return {};
  const dates = {};
  STAGES.forEach(s => {
    dates[s.id] = addDays(postDate, s.days);
  });
  return dates;
}

function stageDeadline(deliverable, stageId) {
  if (!deliverable) return null;
  if (deliverable.stageDateOverrides?.[stageId]) return deliverable.stageDateOverrides[stageId];
  if (!deliverable.plannedPostDate) return null;
  const stage = STAGES.find(s => s.id === stageId);
  if (!stage) return null;
  return addDays(deliverable.plannedPostDate, stage.days);
}



// ─── CSS ──────────────────────────────────────────────────
const G  = { background:B1, border:`1px solid ${LN}`, borderRadius:12, boxShadow:"0 1px 2px rgba(0,0,0,0.04), 0 4px 16px rgba(0,0,0,0.06)" };
const G2 = { background:B2, border:`1px solid ${LN}`, borderRadius:12, boxShadow:"0 1px 2px rgba(0,0,0,0.03)" };
const GHV = { background:B1, border:`1px solid ${LN2}`, borderRadius:12, boxShadow:"0 4px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)", transform:"translateY(-1px)" };
const TRANS = "all 0.18s cubic-bezier(0.4, 0, 0.2, 1)";

// ─── Toast ────────────────────────────────────────────────
const ToastCtx = createContext(null);
function useToast() { return useContext(ToastCtx); }
function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const push = useCallback((msg, type="success") => {
    const id = uid();
    setList(p => [...p, { id, msg, type }]);
    setTimeout(() => setList(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{ position:"fixed", bottom:24, right:24, zIndex:999, display:"flex", flexDirection:"column", gap:8, pointerEvents:"none" }}>
        {list.map(t => (
          <div key={t.id} style={{
            ...G2, padding:"12px 18px", display:"flex", alignItems:"center", gap:10,
            fontSize:12, fontWeight:600, color:TX, minWidth:220,
            borderLeft:`3px solid ${t.type==="success"?GRN:t.type==="error"?RED:t.type==="info"?BLU:AMB}`,
            animation:"toastIn .2s ease",
          }}>
            <span style={{fontSize:16}}>{t.type==="success"?"✓":t.type==="error"?"✕":"!"}</span>
            {t.msg}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </ToastCtx.Provider>
  );
}

// ─── Base components ──────────────────────────────────────
function Btn({ children, onClick, variant="default", size="md", icon:Icon, disabled, style:st }) {
  const [hov, setHov] = useState(false);
  const base = { display:"inline-flex", alignItems:"center", gap:6, fontFamily:"inherit", fontWeight:600, letterSpacing:".03em", cursor:disabled?"not-allowed":"pointer", opacity:disabled?.5:1, border:"none", outline:"none", transition:"all 0.18s cubic-bezier(0.4,0,0.2,1)", borderRadius:6, fontSize:size==="sm"?10:12 };
  const variants = {
    default: { background:hov?B3:B2, color:TX, border:`1px solid ${hov?LN2:LN}`, padding:size==="sm"?"5px 10px":"7px 14px", boxShadow:hov?"0 2px 6px rgba(0,0,0,0.08)":"none" },
    primary: { background:hov?"#a80d25":RED, color:"#fff", padding:size==="sm"?"5px 10px":"7px 14px", boxShadow:hov?"0 3px 10px rgba(200,16,46,0.35)":"0 1px 3px rgba(200,16,46,0.2)", transform:hov?"translateY(-1px)":"translateY(0)" },
    ghost: { background:hov?B2:"transparent", color:hov?TX:TX2, padding:size==="sm"?"5px 8px":"7px 10px", borderRadius:4 },
    danger: { background:hov?"rgba(200,16,46,.22)":"rgba(200,16,46,.1)", color:RED, border:`1px solid rgba(200,16,46,.3)`, padding:size==="sm"?"5px 10px":"7px 14px" },
  };
  return <button style={{...base,...variants[variant],...st}} onClick={onClick} disabled={disabled}
    onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}>
    {Icon && <Icon size={size==="sm"?11:13}/>}{children}
  </button>;
}

function Badge({ children, color="#475569", bg }) {
  return <span style={{ display:"inline-block", padding:"2px 7px", fontSize:9, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", borderRadius:4, background: bg||`${color}20`, border:`1px solid ${color}40`, color }}>{children}</span>;
}

function Input({ value, onChange, placeholder, type="text", style:st }) {
  return <input type={type} value={value} onChange={onChange} placeholder={placeholder}
    style={{ width:"100%", padding:"8px 12px", background:B2, border:`1px solid ${LN}`, borderRadius:6, color:TX, fontSize:12, fontFamily:"inherit", outline:"none", ...st }}
    onFocus={e=>e.target.style.borderColor=LN2} onBlur={e=>e.target.style.borderColor=LN}
  />;
}

function Select({ value, onChange, children, style:st }) {
  return <select value={value} onChange={onChange}
    style={{ width:"100%", padding:"8px 12px", background:B2, border:`1px solid ${LN}`, borderRadius:6, color:TX, fontSize:12, fontFamily:"inherit", outline:"none", ...st }}>
    {children}
  </select>;
}

function Textarea({ value, onChange, placeholder, rows=3, style:st }) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
    style={{ width:"100%", padding:"8px 12px", background:B2, border:`1px solid ${LN}`, borderRadius:6, color:TX, fontSize:12, fontFamily:"inherit", outline:"none", resize:"vertical", ...st }}
  />;
}

function Toggle({ on, onToggle }) {
  return <div onClick={onToggle} style={{ width:32, height:18, borderRadius:9, background:on?RED:"rgba(255,255,255,.1)", border:`1px solid ${on?RED:LN}`, position:"relative", cursor:"pointer", transition:"all .2s", flexShrink:0 }}>
    <div style={{ position:"absolute", top:2, left:on?14:2, width:12, height:12, borderRadius:"50%", background:"#fff", transition:"left .2s" }}/>
  </div>;
}

function SRule({ children }) {
  return <div style={{ fontSize:9, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:TX3, display:"flex", alignItems:"center", gap:10, margin:"18px 0 12px" }}>
    {children}<div style={{ flex:1, height:1, background:LN }}/>
  </div>;
}

function Field({ label, children, full }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:4, gridColumn:full?"1/-1":"auto" }}>
    <label style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2 }}>{label}</label>
    {children}
  </div>;
}

function CommToggle({ on, onToggle, label }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }} onClick={e=>{e.stopPropagation();onToggle();}}>
    <Toggle on={on} onToggle={()=>{}}/>
    {label && <span style={{ fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:on?GRN:TX2 }}>{on?"✓ Comissão Ranked":"Sem comissão Ranked"}</span>}
  </div>;
}

function InlineNotes({ notes, onSave }) {
  const [val, setVal] = useState(notes||"");
  const [dirty, setDirty] = useState(false);
  const ta = useRef(null);
  useEffect(() => { setVal(notes||""); }, [notes]);
  return <textarea ref={ta} rows={1} value={val} placeholder="Observações…"
    onChange={e=>{setVal(e.target.value);setDirty(true);}}
    onBlur={()=>{if(dirty){onSave(val);setDirty(false);}}}
    style={{ display:"block", width:"100%", background:"transparent", border:"none", borderLeft:`2px solid ${LN}`, color:TX2, fontSize:11, fontFamily:"inherit", padding:"4px 8px", resize:"none", outline:"none", fontStyle:"italic", marginTop:6 }}
  />;
}

// ─── Modal shell ──────────────────────────────────────────
function Modal({ title, onClose, children, footer, width=640 }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:200, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:window.innerWidth<768?"8px":"48px 16px", overflowY:"auto", backdropFilter:"blur(4px)" }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ ...G2, width:"100%", maxWidth:window.innerWidth<768?"100%":width, flexShrink:0 }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:TX }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:TX2, cursor:"pointer", padding:4 }}><X size={16}/></button>
        </div>
        <div style={{ padding:"20px" }}>{children}</div>
        {footer && <div style={{ padding:"14px 20px", borderTop:`1px solid ${LN}`, display:"flex", justifyContent:"flex-end", gap:8 }}>{footer}</div>}
      </div>
    </div>
  );
}


// ─── Login Page ───────────────────────────────────────────
function LoginPage() {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async e => {
    e.preventDefault();
    if (!email||!pass) return setError("Preencha email e senha.");
    setLoading(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch(err) {
      setError("Email ou senha inválidos.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#F7F6EF", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Plus Jakarta Sans,system-ui,sans-serif", position:"relative", overflow:"hidden" }}>
      {/* Background orbs */}
      <div style={{ position:"absolute", top:-200, left:-200, width:600, height:600, borderRadius:"50%", background:"radial-gradient(circle, rgba(200,16,46,.08) 0%, transparent 70%)", pointerEvents:"none" }}/>
      <div style={{ position:"absolute", bottom:-150, right:-100, width:500, height:500, borderRadius:"50%", background:"radial-gradient(circle, rgba(29,78,216,.06) 0%, transparent 70%)", pointerEvents:"none" }}/>
      {/* Grid lines */}
      <div style={{ position:"absolute", inset:0, backgroundImage:`linear-gradient(rgba(0,0,0,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.06) 1px, transparent 1px)`, backgroundSize:"60px 60px", opacity:.5, pointerEvents:"none" }}/>

      {/* Logo */}
      <div style={{ marginBottom:40, textAlign:"center", position:"relative" }}>
        <div style={{ fontSize:13, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:TX }}>
          ENTRE<span style={{color:RED}}>GAS</span>
        </div>
        <div style={{ fontSize:12, color:TX2, marginTop:6, letterSpacing:".04em" }}>Gestão de contratos e entregas · Ranked</div>
      </div>

      {/* Card */}
      <div style={{ background:"#FEFEFE", border:"1px solid #F0F0F2", borderRadius:16, width:"100%", maxWidth:380, padding:window.innerWidth<768?20:36, margin:window.innerWidth<768?"0 12px":"0", position:"relative", boxShadow:"0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:TX, marginBottom:6, letterSpacing:"-.01em" }}>Entrar na plataforma</h2>
        <p style={{ fontSize:12, color:TX2, marginBottom:24 }}>Acesso restrito à equipe Ranked</p>

        <form onSubmit={handleLogin} style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <Field label="Email">
            <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="matheus@standproducoes.com"/>
          </Field>
          <Field label="Senha">
            <Input type="password" value={pass} onChange={e=>setPass(e.target.value)} placeholder="••••••••"/>
          </Field>
          {error && <div style={{ fontSize:11, color:RED, background:"rgba(200,16,46,.1)", border:"1px solid rgba(200,16,46,.2)", borderRadius:6, padding:"8px 12px" }}>{error}</div>}
          <button type="submit" disabled={loading}
            style={{ width:"100%", padding:"11px", background:RED, color:"#fff", border:"none", borderRadius:6, fontSize:12, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", cursor:loading?"wait":"pointer", marginTop:4, opacity:loading?.7:1 }}>
            {loading ? "Entrando…" : "Entrar"}
          </button>
        </form>

        <div style={{ marginTop:20, paddingTop:20, borderTop:`1px solid ${LN}`, fontSize:10, color:TX3, textAlign:"center" }}>
          Lucas Veloso @veloso.lucas_
        </div>
      </div>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────
const NAV_ITEMS = [
  { id:"dashboard",      label:"Dashboard",       icon:LayoutDashboard },
  { id:"acompanhamento", label:"Produção",         icon:KanbanSquare },
  { id:"contratos",      label:"Contratos",        icon:FileText },
  { id:"posts",          label:"Posts",            icon:Video },
  { id:"calendario",     label:"Calendário",       icon:Calendar },
];

function Sidebar({ view, setView, user, onSignOut, onInvite, onlineUsers, contracts }) {
  const my = useMemo(() => getMyPresence(), []);
  return (
    <div style={{ width:220, background:B0, borderRight:`1px solid ${LN}`, display:"flex", flexDirection:"column", height:"100vh", flexShrink:0, position:"sticky", top:0 }}>
      {/* Logo */}
      <div style={{ padding:"20px 16px", borderBottom:`1px solid ${LN}` }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:".18em", textTransform:"uppercase", color:TX }}>
          ENTRE<span style={{color:RED}}>GAS</span>
        </div>
        <div style={{ fontSize:10, color:TX3, marginTop:3, letterSpacing:".03em" }}>Ranked</div>
      </div>

      {/* Nav */}
      <nav style={{ padding:"12px 8px", flex:1, overflowY:"auto" }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX3, padding:"4px 8px", marginBottom:4 }}>Navegação</div>
        {NAV_ITEMS.map(item => {
          const active = view===item.id;
          return (
            <div key={item.id} onClick={()=>setView(item.id)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:active?600:400, color:active?TX:TX2, background:active?B3:"transparent", marginBottom:2, transition:"all 0.18s cubic-bezier(0.4,0,0.2,1)", boxShadow:active?"0 1px 3px rgba(0,0,0,0.06)":"none" }}
            onMouseEnter={e=>{ if(!active){e.currentTarget.style.background=B2;e.currentTarget.style.color=TX;}}}
            onMouseLeave={e=>{ if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color=TX2;}}}>
              <item.icon size={14} style={{ color:active?RED:TX3, flexShrink:0 }}/>
              {item.label}
              {item.id==="tarefas" && (
                <span style={{ marginLeft:"auto", fontSize:9, background:"rgba(200,16,46,.2)", color:RED, padding:"1px 5px", borderRadius:99, fontWeight:700 }}>
                  {lsLoad("copa6_tasks",[]).filter(t=>t.status!=="done"&&t.status!=="cancelled").length||""}
                </span>
              )}
            </div>
          );
        })}


      </nav>

      {/* Online + user */}
      <div style={{ padding:"12px 16px", borderTop:`1px solid ${LN}` }}>
        {onlineUsers.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:-4, marginBottom:10 }}>
            {[...onlineUsers.filter(u=>u.sessionId!==my.sessionId), {...my,isMe:true}].slice(0,5).map((u,i) => (
              <div key={u.sessionId||i} title={u.isMe?`${u.name} (você)`:u.name}
                style={{ width:24, height:24, borderRadius:"50%", background:u.color, border:`2px solid ${B0}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff", marginLeft:i>0?-8:0, zIndex:10-i, position:"relative" }}>
                {u.name?.charAt(0).toUpperCase()}
                {u.isMe && <div style={{ position:"absolute", bottom:-1, right:-1, width:7, height:7, borderRadius:"50%", background:GRN, border:`1px solid ${B0}` }}/>}
              </div>
            ))}
            <span style={{ fontSize:10, color:TX2, marginLeft:12 }}>
              {onlineUsers.length} online
            </span>
          </div>
        )}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:11, color:TX2 }}>{user?.email?.split("@")[0]}</div>
          <div style={{display:"flex",gap:4}}>
            <button onClick={onInvite} title="Convidar usuário" style={{background:"none",border:"none",color:TX3,cursor:"pointer",padding:4,fontSize:12}}>👤+</button>
            <button onClick={onSignOut} style={{ background:"none", border:"none", color:TX3, cursor:"pointer", padding:4 }} title="Sair"><LogOut size={14}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar({ view, eurRate, usdRate, setEurRate, setUsdRate, onNewContract, onNewPost, onNewTask, syncStatus, isMobile }) {
  const title = NAV_ITEMS.find(i=>i.id===view)?.label || view;
  const statusColor = { loading:AMB, ok:GRN, error:RED }[syncStatus]||GRN;
  const statusLabel = { loading:"Sincronizando", ok:"Ao Vivo", error:"Offline" }[syncStatus]||"Ao Vivo";
  if (isMobile) return (
    <div style={{ height:50, borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", paddingLeft:16, paddingRight:16, gap:8, background:B1, flexShrink:0, position:"sticky", top:0, zIndex:50 }}>
      <div style={{ fontWeight:800, fontSize:12, letterSpacing:".15em", textTransform:"uppercase", color:TX, flex:1 }}>
        ENTRE<span style={{color:RED}}>GAS</span>
      </div>
      <div style={{ width:6, height:6, borderRadius:"50%", background:syncStatus==="synced"||syncStatus==="ok"?GRN:syncStatus==="syncing"||syncStatus==="loading"?AMB:RED, flexShrink:0 }}/>
      <button onClick={onNewContract}
        style={{ background:RED, border:"none", borderRadius:8, padding:"8px 16px", color:"white", fontSize:12, fontWeight:700, cursor:"pointer" }}>
        + Novo
      </button>
    </div>
  );

  return (
    <div style={{ height:48, background:B0, borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0, position:"sticky", top:0, zIndex:50 }}>
      <div style={{ fontSize:13, fontWeight:700, color:TX, letterSpacing:"-.01em" }}>{title}</div>
      <div style={{ flex:1 }}/>
      {/* EUR */}
      <div style={{ display:isMobile?"none":"flex", alignItems:"center", gap:4, background:B2, border:`1px solid ${LN}`, borderRadius:6, padding:"3px 8px" }}>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>€1=</span>
        <input type="number" step="0.05" value={eurRate||""} placeholder="—"
          onChange={e=>setEurRate(Number(e.target.value)||0)}
          onBlur={e=>setSetting("eurRate",Number(e.target.value)||0).catch(()=>{})}
          style={{ width:52, background:"none", border:"none", color:TX, fontSize:11, fontWeight:700, fontFamily:"inherit", outline:"none", textAlign:"right" }}/>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>R$</span>
      </div>
      {/* USD */}
      <div style={{ display:isMobile?"none":"flex", alignItems:"center", gap:4, background:B2, border:`1px solid ${LN}`, borderRadius:6, padding:"3px 8px" }}>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>$1=</span>
        <input type="number" step="0.05" value={usdRate||""} placeholder="—"
          onChange={e=>setUsdRate(Number(e.target.value)||0)}
          onBlur={e=>setSetting("usdRate",Number(e.target.value)||0).catch(()=>{})}
          style={{ width:52, background:"none", border:"none", color:TX, fontSize:11, fontWeight:700, fontFamily:"inherit", outline:"none", textAlign:"right" }}/>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>R$</span>
      </div>
      {/* Status */}
      <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 10px", background:`${statusColor}12`, border:`1px solid ${statusColor}30`, borderRadius:99 }}>
        <div style={{ width:6, height:6, borderRadius:"50%", background:statusColor }}/>
        <span style={{ fontSize:9, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:statusColor }}>{statusLabel}</span>
      </div>
      {/* CTA */}
      {view==="contratos"      && <Btn onClick={onNewContract}    variant="primary" size="sm" icon={Plus}>Contrato</Btn>}
      {view==="posts"          && <Btn onClick={onNewPost}        variant="primary" size="sm" icon={Plus}>Post</Btn>}
      {view==="dashboard"      && <Btn onClick={onNewContract}    variant="primary" size="sm" icon={Plus}>Contrato</Btn>}
    </div>
  );
}


// ─── Dashboard ────────────────────────────────────────────
function AlertCard({ type, title, sub, value, action, onAction, color }) {
  const [hov, setHov] = useState(false);
  const colors = {
    danger:  { bg: "#FFF1F2", border: "#FCA5A5", accent: RED,  icon: "🔴" },
    warning: { bg: "#FFFBEB", border: "#FCD34D", accent: AMB,  icon: "🟡" },
    info:    { bg: "#EFF6FF", border: "#BFDBFE", accent: BLU,  icon: "🔵" },
    success: { bg: "#F0FDF4", border: "#86EFAC", accent: GRN,  icon: "🟢" },
  };
  const c = colors[type] || colors.info;
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: c.bg, border: `1px solid ${hov ? c.accent : c.border}`,
        borderRadius: 10, padding: "14px 16px", transition: "all 0.18s ease",
        boxShadow: hov ? `0 4px 14px ${c.accent}20` : "0 1px 3px rgba(0,0,0,0.05)",
        transform: hov ? "translateY(-1px)" : "none",
      }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: c.accent, marginBottom: 3, display: "flex", alignItems: "center", gap: 6 }}>
            <span>{c.icon}</span>{title}
          </div>
          <div style={{ fontSize: 12, color: TX, lineHeight: 1.45 }}>{sub}</div>
        </div>
        {value && <div style={{ fontSize: 18, fontWeight: 700, color: c.accent, flexShrink: 0, lineHeight: 1 }}>{value}</div>}
      </div>
      {action && (
        <button onClick={onAction}
          style={{ marginTop: 10, fontSize: 10, fontWeight: 700, letterSpacing: ".04em", color: c.accent, background: "none", border: `1px solid ${c.accent}40`, borderRadius: 5, padding: "4px 10px", cursor: "pointer", transition: "all 0.15s ease" }}
          onMouseEnter={e => { e.currentTarget.style.background = `${c.accent}15`; }}
          onMouseLeave={e => { e.currentTarget.style.background = "none"; }}>
          {action} →
        </button>
      )}
    </div>
  );
}

function StatTile({ label, value, sub, trend }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ ...(hov ? GHV : G), padding: "18px 20px", transition: TRANS }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: TX2, marginBottom: 10 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-.02em", color: TX, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: TX2, marginTop: 5 }}>{sub}</div>}
      {trend && <div style={{ fontSize: 10, fontWeight: 600, marginTop: 4, color: trend > 0 ? GRN : RED }}>{trend > 0 ? "↑" : "↓"} {Math.abs(trend)}%</div>}
    </div>
  );
}

function DashKpi({ label, value, sub, accent }) {
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ ...(hov?GHV:G), padding:"16px 18px", transition:TRANS }}>
      <div style={{ fontSize:small?8:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:small?4:8 }}>{label}</div>
      <div style={{ fontSize:small?16:20,fontWeight:700,color:accent||TX,lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11,color:TX2,marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ contracts, posts, deliverables:dashDeliverables=[], stats, rates, saveNote, toggleComm, toggleCommPaid, toggleNF, setModal, navigateTo }) {
  const isMobile = useIsMobile();
  const today    = new Date();
  const todayStr = today.toISOString().substr(0, 10);
  const in7Str   = new Date(today.getTime() + 7 * 864e5).toISOString().substr(0, 10);
  const in30Str  = new Date(today.getTime() + 30 * 864e5).toISOString().substr(0, 10);
  const [aiInsight, setAiInsight] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const allDeliverables = useMemo(() => dashDeliverables || [], [dashDeliverables]);
  const lateDeliverables = useMemo(() => {
    try { return allDeliverables.filter(d => {
      if (!d || d.stage === "done") return false;
      const stageIdx = STAGE_IDS.indexOf(d.stage || "briefing");
      if (stageIdx < 0 || !d.plannedPostDate) return false;
      const currentStage = STAGES[stageIdx];
      if (!currentStage) return false;
      const dl = daysLeft(addDays(d.plannedPostDate, currentStage.days));
      return dl !== null && dl < 0;
    }); } catch { return []; }
  }, [allDeliverables]);

  const upcomingDeliverables = useMemo(() => {
    try { return allDeliverables
      .filter(d => d && d.stage !== "done" && d.plannedPostDate)
      .sort((a,b) => new Date(a.plannedPostDate) - new Date(b.plannedPostDate))
      .slice(0, 6);
    } catch { return []; }
  }, [allDeliverables]);

  // Conflict detection
  const postDateCounts = {};
  allDeliverables.forEach(d => { if (d?.plannedPostDate) postDateCounts[d.plannedPostDate] = (postDateCounts[d.plannedPostDate]||0)+1; });
  const conflicts = Object.entries(postDateCounts).filter(([,c]) => c > 1);

  // Urgency signals
  const urgency = [];
  if (lateDeliverables.length > 0) urgency.push({
    type:"danger", key:"pipe",
    title:`${lateDeliverables.length} entregável${lateDeliverables.length>1?"s":""} atrasado${lateDeliverables.length>1?"s":""}`,
    sub: lateDeliverables.slice(0,3).map(d=>d.title).join(", "),
    action:"Ver produção", onAction:()=>navigateTo("acompanhamento"),
  });
  if (conflicts.length > 0) urgency.push({
    type:"warning", key:"conflict",
    title:`${conflicts.length} conflito${conflicts.length>1?"s":""} de postagem`,
    sub: conflicts.map(([d])=>fmtDate(d)).join(", ") + " — 2+ publis no mesmo dia",
    action:"Ajustar", onAction:()=>navigateTo("acompanhamento"),
  });
  const postsDue = posts.filter(p => !p.isPosted && p.plannedDate && p.plannedDate <= in7Str && p.plannedDate >= todayStr);
  if (postsDue.length) urgency.push({
    type:"warning", key:"posts",
    title:`${postsDue.length} post${postsDue.length>1?"s":""} planejado${postsDue.length>1?"s":""} esta semana`,
    sub: postsDue.map(p=>p.title).slice(0,3).join(", "),
    action:"Ver posts", onAction:()=>navigateTo("posts"),
  });
  const nfPendingList = contracts.filter(c => getNFEntries(c).some(e => !e.isEmitted));
  if (nfPendingList.length >= 3) urgency.push({
    type:"info", key:"nf",
    title:`${stats.nfPending} NFs pendentes · ${fmtMoney(stats.nfPendingValue)}`,
    sub: nfPendingList.slice(0,3).map(c=>c.company).join(", "),
    action:"Ver NFs", onAction:()=>navigateTo("contratos"),
  });
  if (stats.commPendBRL > 0) urgency.push({
    type:"info", key:"comm",
    title:"Comissão a receber · Ranked",
    sub:"Pendente de recebimento",
    value:fmtMoney(stats.commPendBRL),
    action:"Ver comissões", onAction:()=>navigateTo("contratos"),
  });
  if (urgency.length === 0) urgency.push({ type:"success", key:"ok", title:"Tudo em dia", sub:"Nenhuma ação urgente. Bom trabalho!" });

  // Upcoming payments
  const upcomingPayments = [];
  contracts.forEach(c => {
    if (c.paymentType==="single" && c.paymentDeadline && c.paymentDeadline<=in30Str && c.paymentDeadline>=todayStr)
      upcomingPayments.push({company:c.company,color:c.color,date:c.paymentDeadline,value:contractTotal(c),currency:c.currency});
    if (c.paymentType==="split") getInstallments(c).forEach((inst,i) => {
      if (inst.date && inst.date<=in30Str && inst.date>=todayStr) {
        const O=["1ª","2ª","3ª","4ª","5ª","6ª"];
        upcomingPayments.push({company:`${c.company} · ${O[i]||`${i+1}ª`}`,color:c.color,date:inst.date,value:inst.value,currency:c.currency});
      }
    });
  });
  upcomingPayments.sort((a,b) => new Date(a.date)-new Date(b.date));

  // AI Analysis
  const runAI = async () => {
    setAiLoading(true); setAiInsight(null);
    try {
      const context = {
        contracts: contracts.map(c => ({
          company: c.company, value: contractTotal(c), currency: c.currency,
          deadline: c.contractDeadline, numPosts: c.numPosts, numStories: c.numStories,
        })),
        deliverables: allDeliverables.map(d => ({
          title: d.title, stage: d.stage, plannedPostDate: d.plannedPostDate,
          isLate: lateDeliverables.some(l => l.id === d.id),
        })),
        posts: posts.map(p => ({ title: p.title, isPosted: p.isPosted, plannedDate: p.plannedDate })),
        stats: { totalBRL: stats.totalBRL, commPendBRL: stats.commPendBRL, nfPending: stats.nfPending, avgEng: stats.avgEng },
        lateCount: lateDeliverables.length,
        conflictCount: conflicts.length,
        today: todayStr,
      };
      const res = await fetch("/api/ai", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          max_tokens:1000,
          messages:[{
            role:"user",
            content:`Você é o assistente operacional do influenciador Lucas Veloso (@veloso.lucas_) para a Copa 2026. A Ranked é a agência gestora.

Analise esses dados e retorne um JSON com: 
{ "risks": ["risco 1", "risco 2", "risco 3"], "priorities": ["prioridade 1", "prioridade 2", "prioridade 3"], "insight": "uma frase direta sobre o momento atual", "score": número de 0-100 indicando saúde geral do projeto }

Dados: ${JSON.stringify(context)}

Responda APENAS com o JSON, sem markdown.`
          }]
        })
      });
      if (!res.ok) {
        const errData = await res.json().catch(()=>({}));
        throw new Error(`API ${res.status}: ${JSON.stringify(errData).substr(0,200)}`);
      }
      const data = await res.json();
      const raw = data.text || "{}";
      const parsed = JSON.parse(raw.replace(/```json|```/g,"").trim());
      setAiInsight(parsed);
    } catch(e) { setAiInsight({ error: String(e) }); }
    setAiLoading(false);
  };

  const scoreColor = aiInsight?.score >= 70 ? GRN : aiInsight?.score >= 40 ? AMB : RED;

  const hour = today.getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  // Capacity analysis state
  const [capAnalysis, setCapAnalysis] = useState(null);
  const [capLoading, setCapLoading] = useState(false);

  const analyzeCapacity = async () => {
    setCapLoading(true); setCapAnalysis(null);
    try {
      // Build month-by-month data for next 6 months
      const months = [];
      for (let i = 0; i < 6; i++) {
        const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
        const monthKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`;
        const monthLabel = `${MONTHS_PT[d.getMonth()]} ${d.getFullYear()}`;
        const daysInMonth = new Date(d.getFullYear(), d.getMonth()+1, 0).getDate();
        
        // Count deliverables already scheduled this month
        const scheduled = allDeliverables.filter(del => del.plannedPostDate?.startsWith(monthKey));
        
        // Count days blocked by travel
        const travelDays = new Set();
        contracts.forEach(c => {
          if (!c.hasTravel || !c.travelDates?.length) return;
          const sortedT = c.travelDates.filter(td=>td.date).sort((a,b)=>a.date.localeCompare(b.date));
          if (sortedT.length < 2) { sortedT.forEach(td => { if(td.date.startsWith(monthKey)) travelDays.add(td.date); }); return; }
          let cur = sortedT[0].date;
          const end = sortedT[sortedT.length-1].date;
          while(cur <= end) { if(cur.startsWith(monthKey)) travelDays.add(cur); cur = addDays(cur,1); }
        });

        // Dates with conflicts (2+ posts)
        const dateCounts = {};
        scheduled.forEach(d => { if(d.plannedPostDate) dateCounts[d.plannedPostDate] = (dateCounts[d.plannedPostDate]||0)+1; });
        const conflictDates = Object.entries(dateCounts).filter(([,c])=>c>1).length;

        // Available days = total - travel - weekends (Sundays)
        let availableDays = 0;
        for(let day=1; day<=daysInMonth; day++) {
          const ds = `${monthKey}-${String(day).padStart(2,"0")}`;
          const dow = new Date(ds+"T12:00:00").getDay();
          if(dow !== 0 && !travelDays.has(ds)) availableDays++;
        }

        months.push({
          month: monthLabel,
          monthKey,
          daysInMonth,
          availableDays,
          travelDays: travelDays.size,
          scheduled: scheduled.length,
          conflicts: conflictDates,
          scheduledTitles: scheduled.map(d=>d.title).slice(0,5),
        });
      }

      // Total pipeline load
      const totalContracts = contracts.length;
      const pendingDeliverables = allDeliverables.filter(d=>d.stage!=="done").length;
      const unscheduled = allDeliverables.filter(d=>!d.plannedPostDate&&d.stage!=="done").length;

      // Only 3 months, compact prompt, robust parsing
      const months3 = months.slice(0, 3);
      const prompt = "Analise capacidade producao influencer. Dados por mes: " +
        months3.map(m => m.month+"[agendados="+m.scheduled+",diasUteis="+m.availableDays+",viagem="+m.travelDays+"]").join(" ") +
        " Regras: max1post/dia, 9dias producao. Contratos:"+totalContracts+" Pendentes:"+unscheduled+
        ". Retorne JSON: {overview:str,months:[{month:str,scheduled:int,safeCapacity:int,availableSlots:int,status:str,recommendation:str}],globalRisks:[str],suggestions:[str]}" +
        " status=ok/attention/full/critical. Recomendacoes max 8 palavras. APENAS JSON puro sem markdown.";
      const capRes = await fetch("/api/ai", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ max_tokens: 700, messages:[{ role:"user", content: prompt }] })
      });
      if (!capRes.ok) throw new Error("API "+capRes.status);
      const capData = await capRes.json();
      const raw = (capData.text||"").trim().replace(/^[^{]*/,"").replace(/[^}]*$/,"");
      if (!raw.startsWith("{")) throw new Error("JSON nao encontrado na resposta");
      const parsed = JSON.parse(raw);
      setCapAnalysis({ ...parsed, rawMonths: months });
    } catch(e) { setCapAnalysis({ error: String(e) }); }
    setCapLoading(false);
  };

  return (
    <div style={{ padding:isMobile?"14px 12px":24, maxWidth:1400 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:24 }}>
        <div>
          <h1 style={{ fontSize:isMobile?18:20, fontWeight:700, color:TX, letterSpacing:"-.02em" }}>{greeting}, Matheus 👋</h1>
          <p style={{ fontSize:12, color:TX2, marginTop:4 }}>{today.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})} · Copa 2026</p>
        </div>
        <Btn onClick={runAI} variant="primary" size="sm" disabled={aiLoading} icon={aiLoading?null:Zap}>
          {aiLoading ? "Analisando…" : "Análise IA"}
        </Btn>
      </div>

      {/* AI Insight Panel */}
      {aiInsight && !aiInsight.error && (
        <div style={{ ...G, padding:"18px 20px", marginBottom:20, borderLeft:`3px solid ${scoreColor}` }}>
          <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:TX2, flex:1 }}>⚡ Análise IA · Copilot</div>
            {aiInsight.score != null && (
              <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontSize:11, color:TX2 }}>Saúde do projeto</span>
                <div style={{ background:B2, borderRadius:99, padding:"2px 12px", fontSize:13, fontWeight:700, color:scoreColor }}>
                  {aiInsight.score}/100
                </div>
              </div>
            )}
          </div>
          {aiInsight.insight && <p style={{ fontSize:13, color:TX, fontWeight:500, marginBottom:14, lineHeight:1.5 }}>"{aiInsight.insight}"</p>}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
            {aiInsight.risks?.length > 0 && (
              <div>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:RED, marginBottom:8 }}>🔴 Riscos</div>
                {aiInsight.risks.map((r,i) => (
                  <div key={i} style={{ fontSize:12, color:TX, padding:"5px 0", borderBottom:`1px solid ${LN}`, display:"flex", gap:8 }}>
                    <span style={{ color:RED, flexShrink:0 }}>{i+1}.</span>{r}
                  </div>
                ))}
              </div>
            )}
            {aiInsight.priorities?.length > 0 && (
              <div>
                <div style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:AMB, marginBottom:8 }}>🟡 Prioridades</div>
                {aiInsight.priorities.map((p,i) => (
                  <div key={i} style={{ fontSize:12, color:TX, padding:"5px 0", borderBottom:`1px solid ${LN}`, display:"flex", gap:8 }}>
                    <span style={{ color:AMB, flexShrink:0 }}>{i+1}.</span>{p}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {aiInsight?.error && (
        <div style={{ ...G, padding:14, marginBottom:20, borderLeft:`3px solid ${RED}` }}>
          <span style={{ fontSize:12, color:RED }}>Erro na análise: {aiInsight.error}</span>
        </div>
      )}

      {/* KPIs - delivery focused */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(6,1fr)", gap:isMobile?10:12, marginBottom:20 }}>
        {[
          { label:"Volume Total Ano", value:fmtMoney(stats.totalBRL), sub:`${contracts.length} contratos` },
          { label:"Entregáveis ativos", value:allDeliverables.filter(d=>d.stage!=="done").length, sub:`${allDeliverables.filter(d=>d.stage==="done").length} concluídos` },
          { label:"Posts publicados", value:`${stats.dp}/${stats.tp}`, sub:`${stats.ds}/${stats.ts} stories` },
          { label:"Atrasados", value:lateDeliverables.length, sub:"no pipeline", accent:lateDeliverables.length>0?RED:GRN },
          { label:"Engajamento", value:stats.avgEng!=null?stats.avgEng.toFixed(2)+"%":"—", sub:"média das publis", accent:stats.avgEng!=null?(stats.avgEng>=3?GRN:stats.avgEng>=1?AMB:TX2):TX2 },
          { label:"Comissão Ranked", value:fmtMoney(stats.commPendBRL), sub:"pendente", accent:stats.commPendBRL>0?AMB:GRN },
        ].map((k,i) => <DashKpi key={i} label={k.label} value={k.value} sub={k.sub} accent={k.accent} small={isMobile}/>)}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"1fr 1fr", gap:isMobile?16:20 }}>
        {/* Left: Urgency + Pipeline */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Alerts */}
          <div>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Ações & Urgências</div>
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {urgency.map(u => <AlertCard key={u.key} type={u.type} title={u.title} sub={u.sub} value={u.value} action={u.action} onAction={u.onAction}/>)}
            </div>
          </div>

          {/* Upcoming deliverables */}
          {upcomingDeliverables.length > 0 && (
            <div style={{ ...G, padding:"16px 18px" }}>
              <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
                <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Próximas Postagens</div>
                <button onClick={()=>navigateTo("acompanhamento")} style={{ fontSize:10,color:TX2,background:"none",border:"none",cursor:"pointer",transition:TRANS }} onMouseEnter={e=>e.currentTarget.style.color=TX} onMouseLeave={e=>e.currentTarget.style.color=TX2}>Gerenciar →</button>
              </div>
              {upcomingDeliverables.map((d,i) => {
                const c = contracts.find(x=>x.id===d.contractId);
                const dl = daysLeft(d.plannedPostDate);
                const isLate = lateDeliverables.some(l=>l.id===d.id);
                const currentStage = STAGES.find(s=>s.id===(d.stage||"briefing"));
                return (
                  <div key={d.id} onClick={()=>navigateTo("acompanhamento")}
                    style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 0",borderBottom:i<upcomingDeliverables.length-1?`1px solid ${LN}`:"none",cursor:"pointer" }}>
                    {c && <div style={{ width:7,height:7,borderRadius:"50%",background:c.color,flexShrink:0 }}/>}
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12,fontWeight:500,color:isLate?RED:TX }}>{d.title}</div>
                      <div style={{ fontSize:10,color:TX2,marginTop:2 }}>{currentStage?.label} → postagem {fmtDate(d.plannedPostDate)}</div>
                    </div>
                    <div style={{ fontSize:11,fontWeight:700,color:dlColor(dl) }}>{dl!=null?(dl===0?"Hoje":`${dl}d`):""}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right: Payments + Delivery progress */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          {/* Delivery progress per contract */}
          <div style={{ ...G, padding:"16px 18px" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
              <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Entregas por Contrato</div>
              <button onClick={()=>navigateTo("contratos")} style={{ fontSize:10,color:TX2,background:"none",border:"none",cursor:"pointer",transition:TRANS }} onMouseEnter={e=>e.currentTarget.style.color=TX} onMouseLeave={e=>e.currentTarget.style.color=TX2}>Ver todos →</button>
            </div>
            {contracts.filter(c=>c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts>0).slice(0,7).map(c => {
              const dd2 = t => allDeliverables.filter(d=>d.contractId===c.id&&d.stage==="done"&&d.type===t).length;
              const cp=posts.filter(p=>p.contractId===c.id&&(p.type==="post"||p.type==="reel")&&p.isPosted).length + dd2("reel") + dd2("post");
              const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
              const tot=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
              const cr2=allDeliverables.filter(d=>d.contractId===c.id&&d.stage==="done"&&(d.type==="tiktok"||d.type==="repost")).length;
              const don=cp+cs+cr2;
              const dl=daysLeft(c.contractDeadline);
              const pct=tot?Math.min(100,don/tot*100):0;
              return (
                <div key={c.id} style={{ marginBottom:12 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4 }}>
                    <div style={{ display:"flex",alignItems:"center",gap:6 }}>
                      <div style={{ width:6,height:6,borderRadius:"50%",background:c.color }}/>
                      <span style={{ fontSize:12,fontWeight:500,color:TX }}>{c.company}</span>
                    </div>
                    <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                      <span style={{ fontSize:11,color:TX2 }}>{don}/{tot}</span>
                      {dl!=null&&<span style={{ fontSize:10,fontWeight:700,color:dlColor(dl) }}>{dl}d</span>}
                    </div>
                  </div>
                  <div style={{ height:5,background:LN,borderRadius:3 }}>
                    <div style={{ height:5,borderRadius:3,background:pct===100?GRN:c.color,width:`${pct}%`,transition:"width 0.6s ease" }}/>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Upcoming payments */}
          <div style={{ ...G, padding:"16px 18px" }}>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Pagamentos · 30 dias</div>
            {upcomingPayments.length===0
              ? <div style={{ fontSize:12,color:TX3,fontStyle:"italic",textAlign:"center",padding:"12px 0" }}>Nenhum nos próximos 30 dias</div>
              : upcomingPayments.slice(0,4).map((p,i) => (
                <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 10px",borderRadius:8,background:B2,marginBottom:6,transition:TRANS }}
                  onMouseEnter={e=>e.currentTarget.style.background=B3} onMouseLeave={e=>e.currentTarget.style.background=B2}>
                  <div style={{ width:6,height:6,borderRadius:"50%",background:p.color,flexShrink:0 }}/>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12,fontWeight:500,color:TX }}>{p.company}</div>
                    <div style={{ fontSize:10,color:TX2 }}>{fmtDate(p.date)}</div>
                  </div>
                  <div style={{ fontSize:12,fontWeight:700,color:TX }}>{fmtMoney(p.value,p.currency)}</div>
                  <div style={{ fontSize:10,fontWeight:700,color:dlColor(daysLeft(p.date)) }}>{daysLeft(p.date)}d</div>
                </div>
              ))
            }
          </div>
        </div>
      </div>
      {/* Capacity Analysis */}
      <div style={{ marginTop:24, ...G, padding:"18px 20px" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:capAnalysis?16:0 }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:TX, marginBottom:2 }}>🧠 Capacidade de Absorção</div>
            <div style={{ fontSize:11, color:TX2 }}>Quantos conteúdos cabem com segurança nos próximos meses</div>
          </div>
          <Btn onClick={analyzeCapacity} variant="primary" size="sm" disabled={capLoading} icon={capLoading?null:Zap}>
            {capLoading ? "Analisando…" : capAnalysis ? "Reanalisar" : "Analisar capacidade"}
          </Btn>
        </div>

        {capAnalysis?.error && (
          <div style={{ fontSize:11, color:RED, marginTop:12 }}>Erro: {capAnalysis.error}</div>
        )}

        {capAnalysis && !capAnalysis.error && (
          <>
            {capAnalysis.overview && (
              <p style={{ fontSize:12, color:TX2, lineHeight:1.6, marginBottom:16, fontStyle:"italic", borderLeft:`3px solid ${BLU}`, paddingLeft:12 }}>{capAnalysis.overview}</p>
            )}

            {/* Month grid */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:10, marginBottom:16 }} className="mob-col2">
              {(capAnalysis.months||[]).map((m,i) => {
                const STATUS_COLOR = { ok:GRN, attention:AMB, full:RED, critical:RED };
                const STATUS_LABEL = { ok:"✓ Disponível", attention:"⚠ Atenção", full:"● Cheio", critical:"🔴 Crítico" };
                const STATUS_BG    = { ok:`${GRN}08`, attention:`${AMB}08`, full:`${RED}08`, critical:`${RED}12` };
                const sc = STATUS_COLOR[m.status] || TX2;
                const rawM = capAnalysis.rawMonths?.find(r=>r.month===m.month);
                return (
                  <div key={i} style={{ background:STATUS_BG[m.status]||B2, border:`1px solid ${sc}30`, borderRadius:10, padding:"14px 16px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
                      <div style={{ fontSize:11, fontWeight:700, color:TX }}>{m.month}</div>
                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:99, background:`${sc}15`, color:sc }}>{STATUS_LABEL[m.status]||m.status}</span>
                    </div>

                    {/* Capacity bar */}
                    <div style={{ marginBottom:10 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:TX2, marginBottom:4 }}>
                        <span>{m.scheduled} agendados</span>
                        <span style={{ fontWeight:700, color:sc }}>{m.availableSlots > 0 ? `+${m.availableSlots} slots` : "sem espaço"}</span>
                      </div>
                      <div style={{ height:6, background:"rgba(0,0,0,.08)", borderRadius:3, overflow:"hidden" }}>
                        <div style={{ height:6, borderRadius:3, background:sc, width:`${Math.min(100, m.safeCapacity>0?(m.scheduled/m.safeCapacity*100):100)}%`, transition:"width .5s" }}/>
                      </div>
                      <div style={{ fontSize:9, color:TX3, marginTop:3 }}>cap. segura: {m.safeCapacity} conteúdos</div>
                    </div>

                    {rawM?.travelDays>0 && (
                      <div style={{ fontSize:10, color:"#7C3AED", marginBottom:6 }}>✈️ {rawM.travelDays} dias de viagem</div>
                    )}
                    {m.riskFactors?.length>0 && (
                      <div style={{ fontSize:10, color:AMB, marginBottom:6 }}>⚠ {m.riskFactors[0]}</div>
                    )}
                    <p style={{ fontSize:11, color:TX2, lineHeight:1.5, margin:0 }}>{m.recommendation}</p>
                  </div>
                );
              })}
            </div>

            {/* Global risks + suggestions */}
            {(capAnalysis.globalRisks?.length>0 || capAnalysis.suggestions?.length>0) && (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }} className="mob-col1">
                {capAnalysis.globalRisks?.length>0 && (
                  <div style={{ background:`${RED}06`, border:`1px solid ${RED}20`, borderRadius:8, padding:"12px 14px" }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:RED, marginBottom:8 }}>⚠ Riscos Globais</div>
                    {capAnalysis.globalRisks.map((r,i)=><div key={i} style={{fontSize:11,color:TX,padding:"3px 0",borderBottom:i<capAnalysis.globalRisks.length-1?`1px solid ${LN}`:"none"}}>{r}</div>)}
                  </div>
                )}
                {capAnalysis.suggestions?.length>0 && (
                  <div style={{ background:`${GRN}06`, border:`1px solid ${GRN}20`, borderRadius:8, padding:"12px 14px" }}>
                    <div style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:GRN, marginBottom:8 }}>→ Sugestões</div>
                    {capAnalysis.suggestions.map((s,i)=><div key={i} style={{fontSize:11,color:TX,padding:"3px 0",borderBottom:i<capAnalysis.suggestions.length-1?`1px solid ${LN}`:"none"}}>{s}</div>)}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Tarefas ──────────────────────────────────────────────
function TaskCard({ task, contracts, onEdit, onStatusChange, isDragOver }) {
  const [hov, setHov] = useState(false);
  const prio     = TASK_PRIORITIES.find(p => p.id === (task.priority||"none"));
  const contract = contracts.find(c => c.id === task.contractId);
  const dl       = daysLeft(task.dueDate);
  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/plain", task.id); e.currentTarget.style.opacity = "0.5"; }}
      onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
      onClick={() => onEdit(task)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: B1, borderRadius: 8, padding: "11px 13px", cursor: "grab",
        border: `1px solid ${hov ? LN2 : LN}`,
        boxShadow: hov ? "0 4px 14px rgba(0,0,0,0.1), 0 1px 4px rgba(0,0,0,0.06)" : "0 1px 3px rgba(0,0,0,0.05)",
        transform: hov ? "translateY(-2px)" : "translateY(0)",
        transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
        userSelect: "none",
      }}>
      <div style={{ fontSize: 12, fontWeight: 500, color: TX, marginBottom: 8, lineHeight: 1.45 }}>{task.title}</div>
      {task.description && (
        <div style={{ fontSize: 11, color: TX2, marginBottom: 8, lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{task.description}</div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {prio && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: `${prio.color}15`, color: prio.color }}>
            <prio.icon size={9} />{prio.label}
          </span>
        )}
        {contract && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9, color: TX2, padding: "2px 7px", borderRadius: 99, background: B3 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: contract.color, display: "inline-block" }} />
            {contract.company.split("/")[0].trim()}
          </span>
        )}
        {task.dueDate && (
          <span style={{ fontSize: 9, fontWeight: 600, marginLeft: "auto", color: dlColor(dl) }}>{fmtDate(task.dueDate)}</span>
        )}
      </div>
    </div>
  );
}

function KanbanColumn({ status, tasks, contracts, onEdit, onAddNew, onDrop }) {
  const [dragOver, setDragOver] = useState(false);
  return (
    <div
      style={{
        background: dragOver ? `${status.color}06` : B2,
        border: `1.5px solid ${dragOver ? status.color : LN}`,
        borderRadius: 12, overflow: "hidden",
        transition: "all 0.18s ease",
        minHeight: 200,
      }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(e.dataTransfer.getData("text/plain"), status.id); }}>
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${LN}`, display: "flex", alignItems: "center", gap: 6, background: B1 }}>
        <status.icon size={12} style={{ color: status.color }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: TX, flex: 1 }}>{status.label}</span>
        <span style={{ fontSize: 9, fontWeight: 700, background: B3, color: TX2, padding: "2px 7px", borderRadius: 99 }}>{tasks.length}</span>
      </div>
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
        {tasks.map(task => (
          <TaskCard key={task.id} task={task} contracts={contracts} onEdit={onEdit} />
        ))}
        <div
          onClick={onAddNew}
          style={{ padding: "9px 12px", fontSize: 11, color: TX3, cursor: "pointer", borderRadius: 8, border: `1.5px dashed ${LN2}`, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 4, transition: "all 0.18s ease" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = status.color; e.currentTarget.style.color = status.color; e.currentTarget.style.background = `${status.color}06`; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = LN2; e.currentTarget.style.color = TX3; e.currentTarget.style.background = "transparent"; }}>
          <Plus size={11} /> Adicionar
        </div>
      </div>
    </div>
  );
}

function Tarefas({ contracts, externalNewTask, onExternalNewTaskHandled, navigateTo }) {
  const [tasks, setTasks]               = useState(() => lsLoad("copa6_tasks", []));
  const [boardView, setBoardView]       = useState("board");
  const [filter, setFilter]             = useState("all");
  const [priorityFilter, setPriority]   = useState("all");
  const [editTask, setEditTask]         = useState(null);
  const [newOpen, setNewOpen]           = useState(false);
  const toast                           = useToast();

  useEffect(() => {
    if (externalNewTask) { setNewOpen(true); onExternalNewTaskHandled?.(); }
  }, [externalNewTask]);

  const save = list => { setTasks(list); lsSave("copa6_tasks", list); };
  const drop = (taskId, newStatus) => save(tasks.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

  const filtered = tasks.filter(t => {
    if (filter !== "all" && t.contractId !== filter) return false;
    if (priorityFilter !== "all" && t.priority !== priorityFilter) return false;
    return true;
  });

  const ACTIVE = TASK_STATUSES.filter(s => s.id !== "cancelled");
  const pending = tasks.filter(t => t.status !== "done" && t.status !== "cancelled").length;
  const done    = tasks.filter(t => t.status === "done").length;

  return (
    <div style={{ padding: 24, maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: TX }}>Tarefas</h2>
          <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>{pending} pendentes · {done} concluídas</p>
        </div>
        {/* View toggle */}
        <div style={{ display: "flex", background: B2, border: `1px solid ${LN}`, borderRadius: 6, overflow: "hidden" }}>
          {[["board","Kanban"],["list","Lista"]].map(([v,l]) => (
            <div key={v} onClick={() => setBoardView(v)}
              style={{ padding: "5px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", transition: TRANS,
                color: boardView === v ? TX : TX2, background: boardView === v ? B3 : "transparent" }}>{l}</div>
          ))}
        </div>
        {/* Filters */}
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ padding: "5px 10px", background: B1, border: `1px solid ${LN}`, borderRadius: 6, color: TX2, fontSize: 11, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
          <option value="all">Todos contratos</option>
          {contracts.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
        </select>
        <select value={priorityFilter} onChange={e => setPriority(e.target.value)}
          style={{ padding: "5px 10px", background: B1, border: `1px solid ${LN}`, borderRadius: 6, color: TX2, fontSize: 11, fontFamily: "inherit", outline: "none", cursor: "pointer" }}>
          <option value="all">Todas prioridades</option>
          {TASK_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <Btn onClick={() => setNewOpen(true)} variant="primary" size="sm" icon={Plus}>Nova tarefa</Btn>
      </div>

      {/* Kanban board */}
      {boardView === "board" && (
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${ACTIVE.length}, 1fr)`, gap: 10 }}>
          {ACTIVE.map(status => (
            <KanbanColumn
              key={status.id}
              status={status}
              tasks={filtered.filter(t => (t.status || "todo") === status.id)}
              contracts={contracts}
              onEdit={setEditTask}
              onAddNew={() => setNewOpen(true)}
              onDrop={drop}
            />
          ))}
        </div>
      )}

      {/* List view */}
      {boardView === "list" && (
        <div style={{ border: `1px solid ${LN}`, borderRadius: 10, overflow: "hidden", background: B1, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "grid", gridTemplateColumns: "24px 1fr 120px 120px 120px 100px", padding: "8px 16px", background: B2, borderBottom: `1px solid ${LN}`, fontSize: 9, fontWeight: 700, letterSpacing: ".1em", textTransform: "uppercase", color: TX3 }}>
            <div/><div>Título</div><div>Status</div><div>Prioridade</div><div>Contrato</div><div>Data</div>
          </div>
          {ACTIVE.map(status => {
            const col = filtered.filter(t => (t.status || "todo") === status.id);
            if (!col.length) return null;
            return (
              <div key={status.id}>
                <div style={{ padding: "6px 16px", background: B2, borderBottom: `1px solid ${LN}`, display: "flex", alignItems: "center", gap: 6 }}>
                  <status.icon size={11} style={{ color: status.color }} />
                  <span style={{ fontSize: 10, fontWeight: 700, color: TX2 }}>{status.label}</span>
                  <span style={{ fontSize: 9, color: TX3, marginLeft: 4 }}>{col.length}</span>
                </div>
                {col.map(task => {
                  const prio     = TASK_PRIORITIES.find(p => p.id === (task.priority||"none"));
                  const contract = contracts.find(c => c.id === task.contractId);
                  return (
                    <div key={task.id} onClick={() => setEditTask(task)}
                      style={{ display: "grid", gridTemplateColumns: "24px 1fr 120px 120px 120px 100px", padding: "10px 16px", borderBottom: `1px solid ${LN}`, cursor: "pointer", fontSize: 12, transition: TRANS }}
                      onMouseEnter={e => e.currentTarget.style.background = B2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div onClick={e => { e.stopPropagation(); drop(task.id, task.status === "done" ? "todo" : "done"); }} style={{ display: "flex", alignItems: "center" }}>
                        {task.status === "done"
                          ? <CheckCircle2 size={14} style={{ color: GRN }} />
                          : <Circle size={14} style={{ color: TX3 }} />}
                      </div>
                      <div style={{ color: task.status === "done" ? TX3 : TX, textDecoration: task.status === "done" ? "line-through" : "none" }}>{task.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: status.color, fontSize: 10 }}><status.icon size={10} />{status.label}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, color: prio?.color||TX3, fontSize: 10 }}>{prio && <prio.icon size={10} />}{prio?.label || "—"}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: TX2 }}>
                        {contract && <><span style={{ width: 5, height: 5, borderRadius: "50%", background: contract.color, display: "inline-block" }} />{contract.company.split("/")[0].trim()}</>}
                      </div>
                      <div style={{ fontSize: 10, color: task.dueDate ? dlColor(daysLeft(task.dueDate)) : TX3 }}>{fmtDate(task.dueDate)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {filtered.length === 0 && <div style={{ padding: 48, textAlign: "center", color: TX3 }}>Nenhuma tarefa.</div>}
        </div>
      )}

      {/* Modals */}
      {(newOpen || editTask) && (
        <TaskModal
          task={editTask}
          contracts={contracts}
          navigateTo={navigateTo}
          onClose={() => { setNewOpen(false); setEditTask(null); }}
          onSave={t => {
            if (editTask) {
              save(tasks.map(x => x.id === t.id ? t : x));
              toast?.("Tarefa atualizada", "success");
            } else {
              save([...tasks, { ...t, id: uid(), status: t.status || "todo", createdAt: new Date().toISOString() }]);
              toast?.("✓ Tarefa criada", "success");
            }
            setNewOpen(false);
            setEditTask(null);
          }}
          onDelete={editTask ? id => {
            if (confirm("Excluir esta tarefa?")) { save(tasks.filter(t => t.id !== id)); setEditTask(null); }
          } : null}
        />
      )}
    </div>
  );
}

function TaskModal({ task, contracts, onClose, onSave, onDelete, navigateTo }) {
  const isEdit = !!task;
  const [f, setF] = useState(task || { title: "", description: "", status: "todo", priority: "medium", contractId: "", dueDate: "" });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const handleSave = () => {
    if (!f.title?.trim()) { alert("Preencha o título."); return; }
    onSave(f);
  };

  return (
    <Modal
      title={isEdit ? "Editar Tarefa" : "Nova Tarefa"}
      onClose={onClose}
      footer={<>
        {onDelete && <Btn onClick={() => onDelete(task.id)} variant="danger" size="sm">Excluir</Btn>}
        <div style={{ flex: 1 }} />
        {isEdit && f.contractId && navigateTo && (
          <Btn onClick={() => { navigateTo("contratos"); onClose(); }} variant="ghost" size="sm">Ver contrato ↗</Btn>
        )}
        <Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn>
        <Btn onClick={handleSave} variant="primary" size="sm">{isEdit ? "Salvar" : "Criar tarefa"}</Btn>
      </>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <Field label="Título">
          <Input value={f.title} onChange={e => set("title", e.target.value)} placeholder="ex: Enviar roteiro Amazon até 04/mai" />
        </Field>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <Field label="Status">
            <Select value={f.status || "todo"} onChange={e => set("status", e.target.value)}>
              {TASK_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={f.priority || "medium"} onChange={e => set("priority", e.target.value)}>
              {TASK_PRIORITIES.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Contrato / Marca">
            <Select value={f.contractId || ""} onChange={e => set("contractId", e.target.value)}>
              <option value="">— Nenhum —</option>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          </Field>
          <Field label="Data / Prazo">
            <Input type="date" value={f.dueDate || ""} onChange={e => set("dueDate", e.target.value)} />
          </Field>
        </div>
        <Field label="Descrição / Detalhes">
          <Textarea value={f.description || ""} onChange={e => set("description", e.target.value)} placeholder="Contexto, links, referências…" rows={4} />
        </Field>
      </div>
    </Modal>
  );
}

// ─── Acompanhamento (Pipeline de Produção) ────────────────
function DeliverableCard({ item, contracts, onEdit, stageId }) {
  const [hov, setHov] = useState(false);
  const contract = contracts.find(c => c.id === item.contractId);
  const dl = stageDeadline(item, stageId);
  const daysUntil = dl ? daysLeft(dl) : null;
  const TYPE_LABEL = { reel:"Reel", story:"Story", link:"Link", tiktok:"TikTok", post:"Reel" };
  const isLate = daysUntil !== null && daysUntil < 0;
  const isUrgent = daysUntil !== null && daysUntil >= 0 && daysUntil <= 1;

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.setData("text/plain", item.id); e.currentTarget.style.opacity = "0.5"; }}
      onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
      onClick={() => onEdit(item)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: isLate ? "#FFF1F2" : B1,
        border: `1px solid ${isLate ? "#FCA5A5" : isUrgent ? "#FCD34D" : hov ? LN2 : LN}`,
        borderRadius: 8, padding: "10px 12px", cursor: "grab",
        boxShadow: hov ? "0 4px 12px rgba(0,0,0,0.09)" : "0 1px 3px rgba(0,0,0,0.05)",
        transform: hov ? "translateY(-1px)" : "none",
        transition: TRANS, userSelect: "none",
      }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: isLate ? RED : TX, marginBottom: 6, lineHeight: 1.3 }}>{item.title}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
        {contract && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 7px", borderRadius: 99, background: B3, color: TX2 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: contract.color, display: "inline-block" }} />
            {contract.company.split("/")[0].trim()}
          </span>
        )}
        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: B3, color: TX2 }}>{TYPE_LABEL[item.type] || item.type}</span>
        {item.plannedPostDate && (
          <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 99, background: B3, color: TX2, marginLeft: "auto" }}>
            📅 {fmtDate(item.plannedPostDate)}
          </span>
        )}
      </div>
      {dl && stageId !== "done" && (
        <div style={{ marginTop: 6, fontSize: 10, fontWeight: 600, color: isLate ? RED : isUrgent ? AMB : TX3 }}>
          {isLate ? `${Math.abs(daysUntil)}d atrasado` : daysUntil === 0 ? "Hoje" : `${daysUntil}d`}
          {item.stageDateOverrides?.[stageId] ? " (manual)" : ""}
        </div>
      )}
      {item.responsible?.[stageId] && (
        <div style={{ marginTop: 4, fontSize: 10, color: TX3 }}>👤 {item.responsible[stageId]}</div>
      )}
    </div>
  );
}

function PipelineColumn({ stage, items, contracts, onEdit, onDrop }) {
  const [dragOver, setDragOver] = useState(false);
  const lateCount = items.filter(item => {
    const dl = stageDeadline(item, stage.id);
    return dl && daysLeft(dl) < 0;
  }).length;

  return (
    <div
      style={{
        background: dragOver ? `rgba(200,16,46,0.04)` : B2,
        border: `1.5px solid ${dragOver ? RED : LN}`,
        borderRadius: 10, overflow: "hidden", minWidth: 160,
        transition: "all 0.18s ease",
      }}
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); onDrop(e.dataTransfer.getData("text/plain"), stage.id); }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${LN}`, background: B1, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: TX, flex: 1 }}>{stage.label}</span>
        {lateCount > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, background: "#FFF1F2", color: RED, padding: "2px 6px", borderRadius: 99, border: "1px solid #FCA5A5" }}>{lateCount} atrasado{lateCount>1?"s":""}</span>
        )}
        <span style={{ fontSize: 9, fontWeight: 700, background: B3, color: TX2, padding: "2px 7px", borderRadius: 99 }}>{items.length}</span>
      </div>
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6, minHeight: 80 }}>
        {items.map(item => (
          <DeliverableCard key={item.id} item={item} contracts={contracts} onEdit={onEdit} stageId={stage.id} />
        ))}
      </div>
    </div>
  );
}

function Acompanhamento({ contracts, posts, deliverables=[], saveDeliverables, calEvents, calMonth, setCal, calFilter, setCalF }) {
  const setDeliverables = saveDeliverables || (() => {});
  const [view, setView]   = useState("pipeline");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen]   = useState(false);
  const [filter, setFilter]     = useState("all");
  const toast = useToast();

  const save = list => { setDeliverables(list); };

  const moveStage = (itemId, newStage) => {
    save(deliverables.map(d => d.id === itemId ? { ...d, stage: newStage } : d));
    toast?.(`Movido para ${STAGES.find(s=>s.id===newStage)?.label}`, "info");
  };

  const filtered = filter === "all" ? deliverables : deliverables.filter(d => d.contractId === filter);

  // Conflict detection: same plannedPostDate
  const postDateCounts = {};
  deliverables.forEach(d => {
    if (d.plannedPostDate) postDateCounts[d.plannedPostDate] = (postDateCounts[d.plannedPostDate] || 0) + 1;
  });
  const conflicts = Object.entries(postDateCounts).filter(([, count]) => count > 1);

  return (
    <div style={{ padding: 24, maxWidth: 1600 }}>
      {/* Conflict alerts */}
      {conflicts.length > 0 && (
        <div style={{ background: "#FFF1F2", border: "1px solid #FCA5A5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, display: "flex", alignItems: "flex-start", gap: 10 }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 3 }}>Conflito de postagem detectado</div>
            {conflicts.map(([date, count]) => {
              const items = deliverables.filter(d => d.plannedPostDate === date);
              return (
                <div key={date} style={{ fontSize: 11, color: TX2 }}>
                  <strong style={{ color: TX }}>{fmtDate(date)}</strong> — {count} publicações: {items.map(i => i.title).join(", ")}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: TX }}>Produção</h2>
          <p style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
            {deliverables.filter(d => d.stage !== "done").length} em andamento · {deliverables.filter(d => d.stage === "done").length} entregues
          </p>
        </div>
        <div style={{ display: "flex", background: B2, border: `1px solid ${LN}`, borderRadius: 6, overflow: "hidden" }}>
          {[["pipeline","Pipeline"],["calendar","Calendário"]].map(([v,l]) => (
            <div key={v} onClick={() => setView(v)}
              style={{ padding: "5px 12px", fontSize: 10, fontWeight: 700, cursor: "pointer", transition: TRANS, color: view===v?TX:TX2, background: view===v?B3:"transparent" }}>{l}</div>
          ))}
        </div>
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ padding: "5px 10px", background: B1, border: `1px solid ${LN}`, borderRadius: 6, color: TX2, fontSize: 11, fontFamily: "inherit", outline: "none" }}>
          <option value="all">Todos contratos</option>
          {contracts.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
        </select>
        <Btn onClick={() => setNewOpen(true)} variant="primary" size="sm" icon={Plus}>Novo entregável</Btn>
      </div>

      {/* Pipeline view */}
      {view === "pipeline" && (
        <div style={{ overflowX: "auto", paddingBottom: 8, WebkitOverflowScrolling:"touch" }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${STAGES.length}, minmax(160px, 1fr))`, gap: 8, minWidth: 1200 }}>
            {STAGES.map(stage => (
              <PipelineColumn
                key={stage.id}
                stage={stage}
                items={filtered.filter(d => (d.stage || "briefing") === stage.id)}
                contracts={contracts}
                onEdit={setEditItem}
                onDrop={moveStage}
              />
            ))}
          </div>
        </div>
      )}

      {/* Calendar view */}
      {view === "calendar" && (
        <CalendarView contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>
      )}

      {/* Modals */}
      {(newOpen || editItem) && (
        <DeliverableModal
          item={editItem}
          contracts={contracts}
          onClose={() => { setNewOpen(false); setEditItem(null); }}
          onSave={item => {
            if (editItem) {
              save(deliverables.map(d => d.id === item.id ? item : d));
              toast?.("Entregável atualizado", "success");
            } else {
              save([...deliverables, { ...item, id: uid(), stage: "briefing", createdAt: new Date().toISOString() }]);
              toast?.("✓ Entregável criado", "success");
            }
            setNewOpen(false); setEditItem(null);
          }}
          onDelete={editItem ? id => {
            if (confirm("Excluir este entregável?")) { save(deliverables.filter(d => d.id !== id)); setEditItem(null); }
          } : null}
        />
      )}
    </div>
  );
}

function DeliverableModal({ item, contracts, onClose, onSave, onDelete }) {
  const isEdit = !!item;
  const [f, setF] = useState(item || { contractId: contracts[0]?.id || "", title: "", type: "reel", plannedPostDate: "", stage: "briefing", responsible: {}, stageDateOverrides: {}, notes: "", networks: [], networkMetrics: {} });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const [openNet, setOpenNet] = useState(null);
  const NETS = ["Instagram","TikTok","YouTube","Facebook","X / Twitter","Kwai"];
  const NET_EMOJI = {"Instagram":"📸","TikTok":"🎵","YouTube":"▶️","Facebook":"👥","X / Twitter":"𝕏","Kwai":"🎬"};
  const toggleNetwork = net => {
    const cur = f.networks || [];
    if (cur.includes(net)) { const nm={...(f.networkMetrics||{})}; delete nm[net]; setF(x=>({...x,networks:cur.filter(n=>n!==net),networkMetrics:nm})); }
    else { set("networks", [...cur, net]); }
  };
  const setMetric = (net,field,val) => setF(x=>({...x,networkMetrics:{...(x.networkMetrics||{}),[net]:{...(x.networkMetrics?.[net]||{}),[field]:val}}}));
  const getMetric = (net,field) => f.networkMetrics?.[net]?.[field] || "";
  const stageDates = f.plannedPostDate ? calcStageDates(f.plannedPostDate) : {};
  const handleSave = () => { if (!f.title?.trim()) { alert("Preencha o título."); return; } if (!f.contractId) { alert("Selecione o contrato."); return; } onSave(f); };
  return (
    <Modal title={isEdit?"Editar Entregável":"Novo Entregável"} onClose={onClose} width={680}
      footer={<>{onDelete&&<Btn onClick={()=>onDelete(item.id)} variant="danger" size="sm">Excluir</Btn>}<div style={{flex:1}}/><Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn><Btn onClick={handleSave} variant="primary" size="sm">{isEdit?"Salvar":"Criar"}</Btn></>}>
      <SRule>Identificação</SRule>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Contrato"><Select value={f.contractId} onChange={e=>set("contractId",e.target.value)}>{contracts.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
        <Field label="Tipo"><Select value={f.type} onChange={e=>set("type",e.target.value)}><option value="reel">Reel / Post Feed</option><option value="story">Story</option><option value="tiktok">TikTok</option><option value="link">Link Comunidade</option></Select></Field>
        <Field label="Título" full><Input value={f.title} onChange={e=>set("title",e.target.value)} placeholder="ex: Reel Amazon Copa #1"/></Field>
        <Field label="Etapa"><Select value={f.stage||"briefing"} onChange={e=>set("stage",e.target.value)}>{STAGES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</Select></Field>
        <Field label="Data Postagem (D)"><Input type="date" value={f.plannedPostDate} onChange={e=>set("plannedPostDate",e.target.value)}/></Field>
      </div>
      {f.plannedPostDate&&(<><SRule>Cronograma automático</SRule>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8}}>
          {STAGES.filter(s=>s.id!=="done").map(s=>{const auto=stageDates[s.id];const override=f.stageDateOverrides?.[s.id];const dl=daysLeft(override||auto);return(<div key={s.id} style={{background:B2,border:`1px solid ${LN}`,borderRadius:8,padding:"10px 12px"}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:5}}>{s.label}</div>
            <div style={{fontSize:12,fontWeight:600,color:dl!==null&&dl<0?RED:TX,marginBottom:4}}>{fmtDate(override||auto)}</div>
            {dl!==null&&<div style={{fontSize:10,color:dl<0?RED:dl<=1?AMB:TX3,marginBottom:5}}>{dl<0?`${Math.abs(dl)}d atrás`:dl===0?"Hoje":`${dl}d`}</div>}
            <input type="date" value={f.stageDateOverrides?.[s.id]||""} onChange={e=>setF(x=>({...x,stageDateOverrides:{...(x.stageDateOverrides||{}),[s.id]:e.target.value}}))} style={{width:"100%",padding:"3px 5px",fontSize:10,background:B1,border:`1px solid ${LN}`,borderRadius:4,color:TX3,fontFamily:"inherit",outline:"none"}}/>
            <input value={f.responsible?.[s.id]||""} placeholder="Responsável" onChange={e=>setF(x=>({...x,responsible:{...(x.responsible||{}),[s.id]:e.target.value}}))} style={{width:"100%",padding:"3px 5px",fontSize:10,background:B1,border:`1px solid ${LN}`,borderRadius:4,color:TX,fontFamily:"inherit",outline:"none",marginTop:4}}/>
          </div>);})}</div></>)}
      <SRule>Redes Sociais & Métricas</SRule>
      <div style={{fontSize:11,color:TX2,marginBottom:10}}>Selecione onde foi publicado. Clique na rede para ver/editar métricas.</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:12}}>
        {NETS.map(net=>{const sel=(f.networks||[]).includes(net);return(<div key={net} onClick={()=>toggleNetwork(net)} style={{padding:"5px 12px",fontSize:11,fontWeight:600,cursor:"pointer",borderRadius:99,transition:TRANS,display:"flex",alignItems:"center",gap:5,background:sel?`${RED}18`:B2,border:`1.5px solid ${sel?RED:LN}`,color:sel?RED:TX2}}>{NET_EMOJI[net]} {net}</div>);})}
      </div>
      {(f.networks||[]).map(net=>{
        const reach=Number(getMetric(net,"reach")||0);
        const eng=reach>0?((Number(getMetric(net,"likes")||0)+Number(getMetric(net,"comments")||0))/reach*100).toFixed(1):null;
        return(<div key={net} style={{marginBottom:8,border:`1px solid ${LN}`,borderRadius:8,overflow:"hidden"}}>
          <div onClick={()=>setOpenNet(openNet===net?null:net)} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 14px",cursor:"pointer",background:B2,transition:TRANS}} onMouseEnter={e=>e.currentTarget.style.background=B3} onMouseLeave={e=>e.currentTarget.style.background=B2}>
            <span style={{fontSize:12,fontWeight:600,color:TX}}>{NET_EMOJI[net]} {net}</span>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              {reach>0&&<span style={{fontSize:10,color:TX2}}>{reach.toLocaleString("pt-BR")} alcance</span>}
              {eng&&<span style={{fontSize:10,fontWeight:700,color:GRN}}>{eng}% eng.</span>}
              <span style={{fontSize:11,color:TX2}}>{openNet===net?"▲":"▼"}</span>
            </div>
          </div>
          {openNet===net&&(<div style={{padding:"12px 14px",display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10}}>
            {[["views","Views"],["reach","Alcance"],["likes","Curtidas"],["comments","Comentários"],["shares","Shares"],["saves","Saves"]].map(([k,l])=>(<Field key={k} label={l}><Input type="number" min="0" value={getMetric(net,k)} onChange={e=>setMetric(net,k,e.target.value)} placeholder="0"/></Field>))}
          </div>)}
        </div>);
      })}
      {(f.stage==="postagem"||f.stage==="done")&&(<><SRule>Publicação</SRule>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
          <Field label="Link"><Input value={f.postLink||""} onChange={e=>set("postLink",e.target.value)} placeholder="https://instagram.com/p/..."/></Field>
          <Field label="Data publicação"><Input type="date" value={f.publishedAt||""} onChange={e=>set("publishedAt",e.target.value)}/></Field>
        </div>
      </>)}
      <SRule>Notas</SRule>
      <Field label="Briefing / Observações"><Textarea value={f.notes||""} onChange={e=>set("notes",e.target.value)} rows={3} placeholder="Resumo do briefing, links, pontos obrigatórios…"/></Field>
    </Modal>
  );
}


// ─── Contract Detail Page ────────────────────────────────
// ─── Costs Section ────────────────────────────────────────
function CostsSection({ contract: c, saveC, contracts }) {
  const [costs, setCosts] = useState(c.costs || []);
  const toast = useToast();

  const save = async (newCosts) => {
    setCosts(newCosts);
    await saveC(contracts.map(x => x.id === c.id ? {...x, costs: newCosts} : x));
    toast?.("Custos salvos", "success");
  };

  const addCost = () => save([...costs, { id: uid(), label:"", value:"", category:"production" }]);
  const updCost = (i, field, val) => {
    const next = costs.map((c,j) => j===i ? {...c,[field]:val} : c);
    setCosts(next);
  };
  const saveCost = () => save(costs);
  const delCost = (i) => save(costs.filter((_,j) => j!==i));

  const totalCosts = costs.reduce((s,x) => s+(Number(x.value)||0), 0);
  const grossValue = contractTotal(c);
  const netValue = Math.max(0, grossValue - totalCosts);
  const commOnNet = netValue * 0.20;

  const CAT_LABEL = { production:"Produção", travel:"Viagem", equipment:"Equipamento", crew:"Equipe", other:"Outro" };
  const CAT_COLOR = { production:BLU, travel:"#8B5CF6", equipment:AMB, crew:GRN, other:TX2 };

  return (
    <div style={{ ...G, padding:"18px 20px" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
        <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Custos do Contrato</div>
        <Btn onClick={addCost} variant="ghost" size="sm" icon={Plus}>Adicionar</Btn>
      </div>

      {costs.length === 0 && (
        <div style={{ fontSize:12,color:TX3,fontStyle:"italic",textAlign:"center",padding:"16px 0" }}>
          Nenhum custo. A comissão Ranked incide sobre o valor bruto.
        </div>
      )}

      {costs.map((cost, i) => (
        <div key={cost.id||i} style={{ display:"grid", gridTemplateColumns:"1fr 130px 140px 32px", gap:8, marginBottom:8, alignItems:"end" }}>
          <div>
            {i===0 && <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:4}}>Descrição</div>}
            <input value={cost.label} placeholder="ex: Passagem aérea" onChange={e=>updCost(i,"label",e.target.value)} onBlur={saveCost}
              style={{width:"100%",padding:"8px 10px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
          </div>
          <div>
            {i===0 && <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:4}}>Valor R$</div>}
            <input type="number" min="0" value={cost.value} placeholder="0" onChange={e=>updCost(i,"value",e.target.value)} onBlur={saveCost}
              style={{width:"100%",padding:"8px 10px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
          </div>
          <div>
            {i===0 && <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:4}}>Categoria</div>}
            <select value={cost.category||"production"} onChange={e=>{updCost(i,"category",e.target.value);saveCost();}}
              style={{width:"100%",padding:"8px 10px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontSize:12,fontFamily:"inherit",outline:"none"}}>
              {Object.entries(CAT_LABEL).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <button onClick={()=>delCost(i)}
            style={{padding:"8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:RED,cursor:"pointer",alignSelf:"flex-end"}}>×</button>
        </div>
      ))}

      {totalCosts > 0 && (
        <div style={{ marginTop:14, padding:"12px 14px", background:`${BLU}06`, border:`1px solid ${BLU}18`, borderRadius:8 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6 }}>
            <span style={{fontSize:11,color:TX2}}>Valor bruto do contrato</span>
            <span style={{fontSize:12,color:TX}}>{fmtMoney(grossValue, c.currency)}</span>
          </div>
          {costs.filter(x=>Number(x.value)>0).map((x,i) => (
            <div key={i} style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
              <span style={{fontSize:11,color:TX3,display:"flex",alignItems:"center",gap:6}}>
                <span style={{fontSize:9,padding:"1px 6px",borderRadius:99,background:`${CAT_COLOR[x.category]||TX3}15`,color:CAT_COLOR[x.category]||TX3}}>{CAT_LABEL[x.category]}</span>
                {x.label||"Custo"}
              </span>
              <span style={{fontSize:11,color:RED}}>- {fmtMoney(Number(x.value))}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", padding:"8px 0 0", borderTop:`1px solid ${LN}`, marginTop:6 }}>
            <span style={{fontSize:12,fontWeight:700,color:TX}}>Valor líquido</span>
            <span style={{fontSize:13,fontWeight:700,color:TX}}>{fmtMoney(netValue, c.currency)}</span>
          </div>
          {c.hasCommission && (
            <div style={{ display:"flex", justifyContent:"space-between", marginTop:4 }}>
              <span style={{fontSize:11,color:TX2}}>Comissão Ranked (20% s/ líquido)</span>
              <span style={{fontSize:12,fontWeight:700,color:RED}}>{fmtMoney(commOnNet, c.currency)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


function ContractDetail({ contract: c, contracts, posts, deliverables, saveC, saveP, saveDeliverables, toggleComm, toggleCommPaid, toggleNF, rates, onBack, setModal }) {
  const [tab, setTab]         = useState("overview");
  const [aiReport, setAiReport] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [showClientReport, setShowClientReport] = useState(false);
  const [briefingNote, setBriefingNote] = useState(c.briefingNote || "");
  const [briefingFile, setBriefingFile] = useState(c.briefingFile || null);
  const toast = useToast();

  const cPosts = posts.filter(p => p.contractId === c.id);
  const cDeliverables = deliverables.filter(d => d.contractId === c.id);
  const total = contractTotal(c);
  const dl = daysLeft(c.contractDeadline);

  const nfEntries   = getNFEntries(c);
  const commEntries = getCommEntries(c);
  const commPaid    = commEntries.filter(e => e.isPaid).reduce((s,e) => s + e.amount, 0);
  const commPending = commEntries.filter(e => !e.isPaid).reduce((s,e) => s + e.amount, 0);

  const avgEng = (() => {
    const engs = cPosts.map(p => calcEngagement(p)).filter(e => e != null);
    return engs.length ? engs.reduce((s,v) => s+v, 0) / engs.length : null;
  })();

  const saveNote = async (note) => {
    setBriefingNote(note);
    await saveC(contracts.map(x => x.id === c.id ? {...x, briefingNote: note} : x));
  };

  const handleBriefingFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const fileData = { name: file.name, size: file.size, type: file.type, data: ev.target.result, uploadedAt: new Date().toISOString() };
      setBriefingFile(fileData);
      await saveC(contracts.map(x => x.id === c.id ? {...x, briefingFile: fileData} : x));
      toast?.("📎 Briefing salvo", "success");
    };
    reader.readAsDataURL(file);
  };

  const generateReport = async () => {
    setAiLoading(true); setAiReport(null);
    try {
      const context = {
        contract: { company: c.company, value: total, currency: c.currency, deadline: c.contractDeadline, paymentType: c.paymentType, hasTravel: c.hasTravel, travelDestination: c.travelDestination, notes: c.notes },
        deliverables: cDeliverables.map(d => ({ title: d.title, stage: d.stage, plannedPostDate: d.plannedPostDate })),
        posts: cPosts.map(p => ({ title: p.title, isPosted: p.isPosted, views: p.views, reach: p.reach, likes: p.likes, comments: p.comments, engagement: calcEngagement(p) })),
        commission: { total: commEntries.reduce((s,e)=>s+e.amount,0), paid: commPaid, pending: commPending },
        avgEngagement: avgEng,
        briefing: c.briefingNote || "",
      };
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          max_tokens: 1500,
          messages: [{ role: "user", content: `Você é o assistente operacional do @veloso.lucas_ para a Copa 2026. Gere um relatório executivo do contrato com ${c.company} em JSON:
{
  "summary": "resumo executivo em 2 frases",
  "performance": { "score": 0-100, "label": "Excelente/Bom/Regular/Atenção" },
  "deliveryStatus": "texto sobre status das entregas",
  "financialStatus": "texto sobre situação financeira",
  "engagementAnalysis": "análise do engajamento se houver posts",
  "highlights": ["ponto positivo 1", "ponto positivo 2"],
  "risks": ["risco 1 se houver"],
  "nextSteps": ["próxima ação 1", "próxima ação 2"]
}
Dados: ${JSON.stringify(context)}
Responda APENAS com o JSON.` }]
        })
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const raw = data.text || "{}";
      setAiReport(JSON.parse(raw.replace(/```json|```/g,"").trim()));
    } catch(e) { setAiReport({ error: String(e) }); }
    setAiLoading(false);
  };

  const TABS = [
    { id:"overview",    label:"Visão Geral" },
    { id:"deliveries",  label:`Entregas (${cDeliverables.length})` },
    { id:"financial",   label:"Financeiro" },
    { id:"briefing",    label:"Briefing" },
    { id:"report",      label:"Relatório IA" },
  ];

  const scoreColor = aiReport?.performance?.score >= 70 ? GRN : aiReport?.performance?.score >= 40 ? AMB : RED;

  return (
    <>
    <div style={{ padding: window.innerWidth<768?12:24, maxWidth: 1100 }}>
      {/* Back + header */}
      <div style={{ display:"flex", alignItems:"flex-start", gap:16, marginBottom:24 }}>
        <button onClick={onBack} style={{ background:"none", border:`1px solid ${LN}`, borderRadius:6, padding:"6px 12px", cursor:"pointer", fontSize:11, color:TX2, display:"flex", alignItems:"center", gap:6, transition:TRANS, flexShrink:0 }}
          onMouseEnter={e=>e.currentTarget.style.background=B2} onMouseLeave={e=>e.currentTarget.style.background="none"}>
          ← Contratos
        </button>
        <button onClick={async()=>{
          if(!confirm("Excluir contrato "+c.company+" e todos os seus entregáveis?")) return;
          await saveC(contracts.filter(x=>x.id!==c.id));
          if(saveDeliverables) await saveDeliverables(deliverables.filter(d=>d.contractId!==c.id));
          onBack();
        }} style={{ background:"none", border:`1px solid rgba(200,16,46,.3)`, borderRadius:6, padding:"6px 10px", cursor:"pointer", fontSize:11, color:RED, transition:TRANS, flexShrink:0 }}
          onMouseEnter={e=>e.currentTarget.style.background="rgba(200,16,46,.06)"} onMouseLeave={e=>e.currentTarget.style.background="none"}>
          🗑 Excluir contrato
        </button>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <div style={{ width:10, height:10, borderRadius:"50%", background:c.color }}/>
            <h1 style={{ fontSize:22, fontWeight:700, color:TX, letterSpacing:"-.02em" }}>{c.company}</h1>
            {currBadge(c.currency)}
            {c.paymentType==="monthly" && <Badge color={TX2}>Mensal</Badge>}
            {c.hasTravel && <Badge color={BLU}>✈️ {c.travelDestination||"Viagem"}</Badge>}
          </div>
          <div style={{ display:"flex", gap:16, fontSize:12, color:TX2 }}>
            <span style={{ fontWeight:700, fontSize:16, color:TX }}>{total>0?fmtMoney(total,c.currency):"Valor TBD"}</span>
            {c.contractDeadline && <span style={{ color:dlColor(dl) }}>prazo {fmtDate(c.contractDeadline)} · {dl}d</span>}
            {c.cnpj && <span>{c.cnpj}</span>}
          </div>
        </div>
        <Btn onClick={()=>setModal({type:"contract",data:c})} variant="default" size="sm">✎ Editar</Btn>
        <Btn onClick={()=>setShowClientReport(true)} variant="default" size="sm">📊 Relatório Cliente</Btn>
        <Btn onClick={generateReport} variant="primary" size="sm" disabled={aiLoading} icon={aiLoading?null:Zap}>
          {aiLoading ? "Gerando…" : "Gerar Relatório IA"}
        </Btn>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${LN}`, marginBottom:20 }}>
        {TABS.map(t => (
          <div key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"10px 18px", fontSize:12, fontWeight:tab===t.id?700:400, cursor:"pointer", color:tab===t.id?TX:TX2, borderBottom:`2px solid ${tab===t.id?RED:"transparent"}`, transition:TRANS, marginBottom:-1 }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* ── Tab: Visão Geral ── */}
      {tab==="overview" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
            {[
              { label:"Valor total",    value:total>0?fmtMoney(total,c.currency):"TBD" },
              { label:"Posts entregues", value:`${cPosts.filter(p=>p.isPosted).length}/${cDeliverables.length+cPosts.length}` },
              { label:"Comissão Ranked", value:fmtMoney(commPending,c.currency), accent:commPending>0?AMB:GRN, sub:commPending>0?"pendente":"pago" },
              { label:"Engajamento",     value:avgEng!=null?avgEng.toFixed(2)+"%":"—", accent:avgEng!=null?(avgEng>=3?GRN:avgEng>=1?AMB:TX2):TX2 },
            ].map((k,i) => (
              <div key={i} style={{ ...G, padding:"16px 18px" }}>
                <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:8 }}>{k.label}</div>
                <div style={{ fontSize:20,fontWeight:700,color:k.accent||TX,lineHeight:1 }}>{k.value}</div>
                {k.sub&&<div style={{fontSize:11,color:TX2,marginTop:4}}>{k.sub}</div>}
              </div>
            ))}
          </div>
          {c.notes && (
            <div style={{ ...G, padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:8 }}>Observações</div>
              <p style={{ fontSize:13,color:TX,lineHeight:1.6 }}>{c.notes}</p>
            </div>
          )}
          {/* Pipeline summary */}
          {cDeliverables.length>0 && (
            <div style={{ ...G, padding:"16px 18px" }}>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Pipeline de Produção</div>
              {cDeliverables.map(d => {
                const stage = STAGES.find(s=>s.id===d.stage);
                const dl2 = d.plannedPostDate&&stage ? daysLeft(addDays(d.plannedPostDate,stage.days)) : null;
                const isLate = dl2!==null&&dl2<0;
                return (
                  <div key={d.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${LN}` }}>
                    <div style={{ width:6,height:6,borderRadius:"50%",background:isLate?RED:stage?.id==="done"?GRN:AMB,flexShrink:0 }}/>
                    <span style={{ fontSize:12,fontWeight:500,color:isLate?RED:TX,flex:1 }}>{d.title}</span>
                    <Badge color={isLate?RED:TX2}>{stage?.label||d.stage}</Badge>
                    {d.plannedPostDate&&<span style={{fontSize:10,color:TX2}}>post {fmtDate(d.plannedPostDate)}</span>}
                    {dl2!==null&&<span style={{fontSize:10,fontWeight:700,color:dlColor(dl2)}}>{dl2<0?`${Math.abs(dl2)}d atraso`:`${dl2}d`}</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Entregas ── */}
      {tab==="deliveries" && (
        <div>
          {/* Deliverables */}
          {cDeliverables.length>0 && <>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Pipeline</div>
            <div style={{ border:`1px solid ${LN}`,borderRadius:10,overflow:"hidden",marginBottom:20 }}>
              {cDeliverables.map((d,i) => {
                const stage=STAGES.find(s=>s.id===d.stage);
                return (
                  <div key={d.id} style={{ display:"grid",gridTemplateColumns:"1fr 120px 120px 100px 120px",padding:"12px 16px",borderBottom:i<cDeliverables.length-1?`1px solid ${LN}`:"none",fontSize:12,alignItems:"center" }}>
                    <div style={{ fontWeight:500,color:TX }}>{d.title}</div>
                    <div><Badge color={TX2}>{stage?.label}</Badge></div>
                    <div style={{ color:TX2 }}>{d.plannedPostDate?fmtDate(d.plannedPostDate):"—"}</div>
                    <div>{d.postLink?<a href={d.postLink} target="_blank" rel="noreferrer" style={{color:RED,fontSize:11}}>↗ Ver post</a>:<span style={{color:TX3,fontSize:11}}>Sem link</span>}</div>
                    <div style={{ color:d.views>0?TX:TX3 }}>{d.views>0?`${Number(d.views).toLocaleString("pt-BR")} views`:"—"}</div>
                  </div>
                );
              })}
            </div>
          </>}
          {/* Posts */}
          {cPosts.length>0 && <>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Posts registrados</div>
            <div style={{ border:`1px solid ${LN}`,borderRadius:10,overflow:"hidden" }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 80px 80px 80px 80px 80px 80px",padding:"8px 16px",background:B2,borderBottom:`1px solid ${LN}`,fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3 }}>
                <div>Título</div><div>Views</div><div>Alcance</div><div>Curtidas</div><div>Coment.</div><div>Engaj.</div><div>Link</div>
              </div>
              {cPosts.map((p,i) => {
                const eng=calcEngagement(p);
                return (
                  <div key={p.id} style={{ display:"grid",gridTemplateColumns:"1fr 80px 80px 80px 80px 80px 80px",padding:"10px 16px",borderBottom:i<cPosts.length-1?`1px solid ${LN}`:"none",fontSize:12,alignItems:"center" }}>
                    <div style={{ fontWeight:500,color:p.isPosted?TX:TX2 }}>{p.title}{!p.isPosted&&<span style={{fontSize:10,color:TX3,marginLeft:6}}>(planejado)</span>}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.views||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.reach||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.likes||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.comments||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ fontWeight:700,color:eng!=null?(eng>=3?GRN:eng>=1?AMB:TX3):TX3 }}>{eng!=null?eng.toFixed(1)+"%":"—"}</div>
                    <div>{p.link?<a href={p.link} target="_blank" rel="noreferrer" style={{color:RED,fontSize:11}}>↗</a>:<span style={{color:TX3}}>—</span>}</div>
                  </div>
                );
              })}
            </div>
          </>}
          {cDeliverables.length===0&&cPosts.length===0&&(
            <div style={{ textAlign:"center",padding:48,color:TX3 }}>Nenhuma entrega registrada ainda.</div>
          )}
        </div>
      )}

      {/* ── Tab: Financeiro ── */}
      {tab==="financial" && (
        <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
        {/* Costs section */}
        <CostsSection contract={c} saveC={saveC} contracts={contracts}/>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
          {/* NF */}
          <div style={{ ...G, padding:"18px 20px" }}>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:14 }}>Nota Fiscal</div>
            {nfEntries.length===0&&<div style={{fontSize:12,color:TX3}}>Sem NF configurada</div>}
            {nfEntries.map((e,i) => (
              <div key={e.key} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:i<nfEntries.length-1?`1px solid ${LN}`:"none" }}>
                <div>
                  <div style={{ fontSize:12,fontWeight:600,color:TX }}>{e.label}</div>
                  {e.date&&<div style={{fontSize:10,color:TX2}}>{fmtDate(e.date)}</div>}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  {e.amount>0&&<span style={{fontSize:12,fontWeight:700,color:TX}}>{fmtMoney(e.amount,c.currency)}</span>}
                  <div onClick={()=>toggleNF(c.id,e.key)} style={{ padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",borderRadius:5,transition:TRANS,background:e.isEmitted?`${GRN}15`:"rgba(0,0,0,.04)",border:`1px solid ${e.isEmitted?GRN+"44":LN2}`,color:e.isEmitted?GRN:TX2 }}>
                    {e.isEmitted?"✓ Emitida":"Emitir"}
                  </div>
                </div>
              </div>
            ))}
          </div>
          {/* Commission */}
          <div style={{ ...G, padding:"18px 20px" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
              <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Comissão Ranked (20%)</div>
              <CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/>
            </div>
            {!c.hasCommission&&<div style={{fontSize:12,color:TX3}}>Sem comissão neste contrato</div>}
            {c.hasCommission&&commEntries.length===0&&<div style={{fontSize:12,color:TX3}}>Sem parcelas definidas</div>}
            {c.hasCommission&&commEntries.map((e,i) => (
              <div key={e.key} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:i<commEntries.length-1?`1px solid ${LN}`:"none" }}>
                <div>
                  <div style={{ fontSize:12,fontWeight:600,color:TX }}>{e.label}</div>
                  {e.date&&<div style={{fontSize:10,color:TX2}}>{fmtDate(e.date)}</div>}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:13,fontWeight:700,color:RED }}>{fmtMoney(e.amount,c.currency)}</span>
                  <div onClick={()=>toggleCommPaid(c.id,e.key)} style={{ padding:"4px 12px",fontSize:10,fontWeight:700,cursor:"pointer",borderRadius:5,transition:TRANS,background:e.isPaid?`${GRN}15`:"rgba(0,0,0,.04)",border:`1px solid ${e.isPaid?GRN+"44":LN2}`,color:e.isPaid?GRN:TX2 }}>
                    {e.isPaid?"✓ Pago":"Marcar pago"}
                  </div>
                </div>
              </div>
            ))}
            {c.hasCommission&&commEntries.length>0&&(
              <div style={{ marginTop:12,paddingTop:10,borderTop:`1px solid ${LN}`,display:"flex",justifyContent:"space-between" }}>
                <span style={{fontSize:11,color:TX2}}>Total pago</span>
                <span style={{fontSize:13,fontWeight:700,color:GRN}}>{fmtMoney(commPaid,c.currency)}</span>
              </div>
            )}
          </div>
        </div>
        </div>
      )}

      {/* ── Tab: Briefing ── */}
      {tab==="briefing" && (
        <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
          <div style={{ ...G, padding:"18px 20px" }}>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Notas do Briefing</div>
            <textarea value={briefingNote} onChange={e=>setBriefingNote(e.target.value)} onBlur={()=>saveNote(briefingNote)}
              rows={8} placeholder="Cole aqui o briefing da marca, pontos obrigatórios, referências, restrições, tom de voz…"
              style={{ width:"100%",padding:"12px",background:B2,border:`1px solid ${LN}`,borderRadius:8,color:TX,fontSize:13,fontFamily:"inherit",lineHeight:1.6,resize:"vertical",outline:"none" }}/>
            <div style={{ fontSize:10,color:TX3,marginTop:6 }}>Auto-salvo ao sair do campo</div>
          </div>
          <div style={{ ...G, padding:"18px 20px" }}>
            <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Arquivo do Briefing</div>
            {briefingFile ? (
              <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:B2,borderRadius:8,border:`1px solid ${LN}` }}>
                <span style={{ fontSize:20 }}>📄</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12,fontWeight:600,color:TX }}>{briefingFile.name}</div>
                  <div style={{ fontSize:10,color:TX2 }}>Enviado {new Date(briefingFile.uploadedAt).toLocaleDateString("pt-BR")}</div>
                </div>
                <a href={briefingFile.data} download={briefingFile.name}
                  style={{ padding:"5px 12px",fontSize:11,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:5,textDecoration:"none" }}>
                  ↓ Baixar
                </a>
                <button onClick={()=>{setBriefingFile(null);saveC(contracts.map(x=>x.id===c.id?{...x,briefingFile:null}:x));}}
                  style={{ background:"none",border:`1px solid ${LN}`,borderRadius:5,padding:"5px 8px",cursor:"pointer",color:TX2,fontSize:11 }}>×</button>
              </div>
            ) : (
              <label style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:10,padding:"32px",border:`2px dashed ${LN2}`,borderRadius:10,cursor:"pointer",transition:TRANS }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=RED} onMouseLeave={e=>e.currentTarget.style.borderColor=LN2}>
                <span style={{ fontSize:32 }}>📎</span>
                <span style={{ fontSize:12,fontWeight:600,color:TX }}>Clique para anexar o briefing</span>
                <span style={{ fontSize:11,color:TX3 }}>PDF, DOCX, imagens ou qualquer arquivo</span>
                <input type="file" style={{ display:"none" }} onChange={handleBriefingFile}/>
              </label>
            )}
          </div>
        </div>
      )}

      {/* ── Tab: Relatório IA ── */}
      {tab==="report" && (
        <div>
          {!aiReport&&!aiLoading&&(
            <div style={{ textAlign:"center",padding:60 }}>
              <div style={{ fontSize:32,marginBottom:12 }}>⚡</div>
              <div style={{ fontSize:14,fontWeight:700,color:TX,marginBottom:6 }}>Relatório de Desempenho</div>
              <div style={{ fontSize:12,color:TX2,marginBottom:20 }}>Análise completa do contrato com {c.company} baseada em todos os dados disponíveis.</div>
              <Btn onClick={generateReport} variant="primary" icon={Zap}>Gerar Relatório</Btn>
            </div>
          )}
          {aiLoading&&(
            <div style={{ textAlign:"center",padding:60,color:TX2 }}>
              <div style={{ fontSize:32,marginBottom:12 }}>⚡</div>
              <div style={{ fontSize:14 }}>Analisando contrato {c.company}…</div>
            </div>
          )}
          {aiReport&&!aiReport.error&&(
            <div style={{ display:"flex",flexDirection:"column",gap:16 }}>
              {/* Score */}
              <div style={{ ...G, padding:"20px 24px", borderLeft:`4px solid ${scoreColor}`, display:"flex",alignItems:"center",gap:20 }}>
                <div style={{ textAlign:"center",flexShrink:0 }}>
                  <div style={{ fontSize:36,fontWeight:700,color:scoreColor,lineHeight:1 }}>{aiReport.performance?.score}</div>
                  <div style={{ fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:TX2,marginTop:4 }}>Score</div>
                </div>
                <div>
                  <div style={{ fontSize:14,fontWeight:700,color:TX,marginBottom:4 }}>{aiReport.performance?.label} · {c.company}</div>
                  <p style={{ fontSize:13,color:TX2,lineHeight:1.6 }}>{aiReport.summary}</p>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                <div style={{ ...G, padding:"16px 18px" }}>
                  <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Entregas</div>
                  <p style={{ fontSize:12,color:TX,lineHeight:1.6 }}>{aiReport.deliveryStatus}</p>
                </div>
                <div style={{ ...G, padding:"16px 18px" }}>
                  <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Financeiro</div>
                  <p style={{ fontSize:12,color:TX,lineHeight:1.6 }}>{aiReport.financialStatus}</p>
                </div>
                {aiReport.engagementAnalysis&&<div style={{ ...G, padding:"16px 18px", gridColumn:"1/-1" }}>
                  <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Engajamento</div>
                  <p style={{ fontSize:12,color:TX,lineHeight:1.6 }}>{aiReport.engagementAnalysis}</p>
                </div>}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
                {aiReport.highlights?.length>0&&<div style={{ ...G, padding:"16px 18px",borderLeft:`3px solid ${GRN}` }}>
                  <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:GRN,marginBottom:10 }}>✓ Pontos positivos</div>
                  {aiReport.highlights.map((h,i)=><div key={i} style={{fontSize:12,color:TX,padding:"4px 0",borderBottom:i<aiReport.highlights.length-1?`1px solid ${LN}`:"none"}}>{h}</div>)}
                </div>}
                {aiReport.risks?.length>0&&<div style={{ ...G, padding:"16px 18px",borderLeft:`3px solid ${RED}` }}>
                  <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:RED,marginBottom:10 }}>⚠ Riscos</div>
                  {aiReport.risks.map((r,i)=><div key={i} style={{fontSize:12,color:TX,padding:"4px 0",borderBottom:i<aiReport.risks.length-1?`1px solid ${LN}`:"none"}}>{r}</div>)}
                </div>}
                {aiReport.nextSteps?.length>0&&<div style={{ ...G, padding:"16px 18px",borderLeft:`3px solid ${BLU}` }}>
                  <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:BLU,marginBottom:10 }}>→ Próximos passos</div>
                  {aiReport.nextSteps.map((s,i)=><div key={i} style={{fontSize:12,color:TX,padding:"4px 0",borderBottom:i<aiReport.nextSteps.length-1?`1px solid ${LN}`:"none"}}>{s}</div>)}
                </div>}
              </div>
              <div style={{ textAlign:"center" }}>
                <Btn onClick={generateReport} variant="ghost" size="sm" icon={Zap}>Regenerar</Btn>
              </div>
            </div>
          )}
          {aiReport?.error&&(
            <div style={{ ...G, padding:20, borderLeft:`3px solid ${RED}` }}>
              <div style={{ fontSize:12,color:RED }}>{aiReport.error}</div>
              <Btn onClick={generateReport} variant="primary" size="sm" style={{marginTop:12}} icon={Zap}>Tentar novamente</Btn>
            </div>
          )}
        </div>
      )}
    </div>
    {showClientReport && <ClientReport contract={c} posts={posts} deliverables={deliverables} rates={rates} onClose={()=>setShowClientReport(false)}/>}
    </>
  );
}

// ─── Contratos list ────────────────────────────────────────
function Contratos({ contracts, posts, deliverables=[], saveC, saveP, saveDeliverables, setModal, toggleComm, toggleCommPaid, toggleNF, saveNote, rates }) {
  const [selectedId, setSelectedId] = useState(null);
  const selected = contracts.find(c => c.id === selectedId);

  const del = async (id) => {
    if (!confirm("Excluir contrato e todos os entregáveis vinculados?")) return;
    await saveC(contracts.filter(c => c.id !== id));
    if (saveDeliverables) await saveDeliverables(deliverables.filter(d => d.contractId !== id));
  };


  if (selected) return (
    <ContractDetail
      contract={selected} contracts={contracts} posts={posts} deliverables={deliverables}
      saveC={saveC} saveP={saveP} saveDeliverables={saveDeliverables}
      toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF}
      rates={rates} onBack={()=>setSelectedId(null)} setModal={setModal}
    />
  );

  return (
    <div style={{ padding:window.innerWidth<768?12:24, maxWidth:1400 }}>
      <div className="mob-scroll" style={{ border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden", background:B1, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ display:"grid", gridTemplateColumns:"3px 1fr 140px 120px 140px 100px 80px 80px 80px 70px", background:B2, borderBottom:`1px solid ${LN}`, padding:"8px 0" }}>
          {["","Empresa","Valor","Prazo","Pagamento","Prog.","Posts","Stories","Links"].map((h,i)=>(
            <div key={i} style={{ padding:"0 12px", fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3 }}>{h}</div>
          ))}
        </div>
        {contracts.map(c=>{
          const done_del = d => deliverables.filter(x=>x.contractId===c.id&&x.stage==="done"&&x.type===d).length;
          const cp=posts.filter(p=>p.contractId===c.id&&(p.type==="post"||p.type==="reel")&&p.isPosted).length + done_del("reel") + done_del("post");
          const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story"&&p.isPosted).length + done_del("story");
          const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link"&&p.isPosted).length + done_del("link");
          const cr=posts.filter(p=>p.contractId===c.id&&(p.type==="tiktok"||p.type==="repost")&&p.isPosted).length + done_del("tiktok") + done_del("repost");
          const total=contractTotal(c); const dl=daysLeft(c.contractDeadline);
          const tot=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
          const don=cp+cs+cl+cr;
          return (
            <div key={c.id}
              onClick={()=>setSelectedId(c.id)}
              style={{ display:"grid", gridTemplateColumns:"3px 1fr 140px 120px 140px 100px 80px 80px 80px 70px", alignItems:"center", borderBottom:`1px solid ${LN}`, fontSize:12, cursor:"pointer", transition:TRANS }}
              onMouseEnter={e=>e.currentTarget.style.background=B2}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{ background:c.color, alignSelf:"stretch", minHeight:48 }}/>
              <div style={{ padding:"12px", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <span style={{ fontWeight:600, color:TX }}>{c.company}</span>
                {currBadge(c.currency)}
                {c.paymentType==="monthly"&&<Badge color={TX2}>M</Badge>}
                {c.hasTravel&&<Badge color={BLU}>✈️</Badge>}
              </div>
              <div style={{ padding:"0 12px", fontWeight:700, color:TX }}>{total>0?fmtMoney(total,c.currency):"—"}</div>
              <div style={{ padding:"0 12px", color:dlColor(dl), fontWeight:dl!=null&&dl<=14?700:400 }}>{fmtDate(c.contractDeadline)}</div>
              <div style={{ padding:"0 12px", fontSize:11, color:TX2 }}>
                {c.paymentType==="monthly"&&`${fmtMoney(c.monthlyValue)}/mês`}
                {c.paymentType==="split"&&`${getInstallments(c).length} parcelas`}
                {c.paymentType==="single"&&fmtDate(c.paymentDeadline)}
              </div>
              <div style={{ padding:"0 12px" }}>
                <div style={{ height:3, background:"rgba(0,0,0,.08)", borderRadius:2, marginBottom:3 }}>
                  <div style={{ height:3, background:tot&&don/tot===1?GRN:c.color, width:`${tot?Math.min(100,don/tot*100):0}%`, borderRadius:2 }}/>
                </div>
                <div style={{ fontSize:9, color:TX3 }}>{don}/{tot}</div>
              </div>
              <div style={{ padding:"0 12px", color:TX2 }}>{cp}/{c.numPosts}</div>
              <div style={{ padding:"0 12px", color:TX2 }}>{cs}/{c.numStories}</div>
              <div style={{ padding:"0 12px", color:TX2 }}>{cl}/{c.numCommunityLinks}</div>
              <div style={{ padding:"0 8px", display:"flex", gap:4 }} onClick={e=>e.stopPropagation()}>
                <Btn onClick={()=>setModal({type:"contract",data:c})} variant="ghost" size="sm">✎</Btn>
                <Btn onClick={()=>del(c.id)} variant="ghost" size="sm" style={{color:RED}}>×</Btn>
              </div>
            </div>
          );
        })}
        {contracts.length===0&&<div style={{padding:48,textAlign:"center",color:TX3}}>Nenhum contrato.</div>}
      </div>
    </div>
  );
}

// ─── Posts ────────────────────────────────────────────────
function Posts({ contracts, posts, saveP, setModal, toast }) {
  const [filter, setFilter] = useState("all");
  const filtered = [...(filter==="all"?posts:posts.filter(p=>p.contractId===filter))].sort((a,b)=>new Date(b.publishDate||b.plannedDate||0)-new Date(a.publishDate||a.plannedDate||0));
  const del = async id => { if(confirm("Excluir?")) await saveP(posts.filter(p=>p.id!==id)); };
  const TYPE_BADGE={post:[AMB,"Reel"],story:[BLU,"Story"],link:[GRN,"Link"],repost:["#8B5CF6","Repost"],tiktok:[RED,"TikTok"]};
  return (
    <div style={{ padding:24, maxWidth:1400 }}>
      <div style={{ display:"flex", gap:6, marginBottom:16, flexWrap:"wrap" }}>
        <div onClick={()=>setFilter("all")} style={{ padding:"4px 12px", fontSize:10, fontWeight:700, cursor:"pointer", borderRadius:99, background:filter==="all"?RED:"rgba(255,255,255,.05)", color:filter==="all"?"#fff":TX2, border:`1px solid ${filter==="all"?RED:LN}` }}>Todos ({posts.length})</div>
        {contracts.map(c=>(
          <div key={c.id} onClick={()=>setFilter(c.id)} style={{ padding:"4px 12px", fontSize:10, fontWeight:700, cursor:"pointer", borderRadius:99, background:filter===c.id?c.color+"22":"rgba(255,255,255,.05)", color:filter===c.id?c.color:TX2, border:`1px solid ${filter===c.id?c.color+"44":LN}`, display:"flex", alignItems:"center", gap:5 }}>
            <div style={{ width:5, height:5, borderRadius:"50%", background:c.color }}/>{c.company.split("/")[0].trim()}
          </div>
        ))}
      </div>
      <div style={{ border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 80px 100px 80px 80px 80px 70px 70px 70px 70px 80px 60px", background:B2, borderBottom:`1px solid ${LN}`, padding:"8px 0", fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3 }}>
          {["Título","Contrato","Status","Tipo","Planejado","Views","Alcance","Curtidas","Coment.","Engaj.","Link",""].map((h,i)=>(
            <div key={i} style={{ padding:"0 10px" }}>{h}</div>
          ))}
        </div>
        {filtered.map(p=>{
          const c=contracts.find(x=>x.id===p.contractId);
          const eng=calcEngagement(p);
          const [tcol,tlbl]=TYPE_BADGE[p.type]||[TX2,p.type];
          return (
            <div key={p.id} style={{ display:"grid", gridTemplateColumns:"1fr 80px 100px 80px 80px 80px 70px 70px 70px 70px 80px 60px", alignItems:"center", borderBottom:`1px solid ${LN}`, fontSize:11 }}
              onMouseEnter={e=>{e.currentTarget.style.background=B2;}}
              onMouseLeave={e=>{e.currentTarget.style.background="transparent";}}>
              <div style={{ padding:"10px", color:TX, fontWeight:500 }}>{p.title}</div>
              <div style={{ padding:"0 10px" }}>{c&&<div style={{display:"flex",alignItems:"center",gap:4}}><div style={{width:5,height:5,borderRadius:"50%",background:c.color}}/><span style={{fontSize:10,color:TX2}}>{c.company.split("/")[0].slice(0,8)}</span></div>}</div>
              <div style={{ padding:"0 10px" }}>
                {p.isPosted?<Badge color={GRN}>✓ Pub.</Badge>:<Badge color={AMB}>Planejado</Badge>}
              </div>
              <div style={{ padding:"0 10px" }}><Badge color={tcol}>{tlbl}</Badge></div>
              <div style={{ padding:"0 10px", color:TX2 }}>{fmtDate(p.plannedDate||p.publishDate)}</div>
              <div style={{ padding:"0 10px", color:TX2, fontVariantNumeric:"tabular-nums" }}>{Number(p.views||0).toLocaleString("pt-BR")}</div>
              <div style={{ padding:"0 10px", color:TX2, fontVariantNumeric:"tabular-nums" }}>{Number(p.reach||0).toLocaleString("pt-BR")}</div>
              <div style={{ padding:"0 10px", color:TX2, fontVariantNumeric:"tabular-nums" }}>{Number(p.likes||0).toLocaleString("pt-BR")}</div>
              <div style={{ padding:"0 10px", color:TX2, fontVariantNumeric:"tabular-nums" }}>{Number(p.comments||0).toLocaleString("pt-BR")}</div>
              <div style={{ padding:"0 10px", fontWeight:700, color:eng!=null?(eng>=3?GRN:eng>=1?AMB:TX3):TX3 }}>{eng!=null?eng.toFixed(1)+"%":"—"}</div>
              <div style={{ padding:"0 10px" }}>{p.link?<a href={p.link} style={{color:RED,fontSize:10}} target="_blank" rel="noreferrer">↗</a>:<span style={{color:TX3}}>—</span>}</div>
              <div style={{ padding:"0 8px", display:"flex", gap:2 }}>
                <Btn onClick={()=>setModal({type:"post",data:p})} variant="ghost" size="sm">✎</Btn>
                <Btn onClick={()=>del(p.id)} variant="ghost" size="sm" style={{color:RED}}>×</Btn>
              </div>
            </div>
          );
        })}
        {filtered.length===0&&<div style={{padding:48,textAlign:"center",color:TX3}}>Nenhum post.</div>}
      </div>
    </div>
  );
}

// ─── Calendar view ────────────────────────────────────────
function CalendarView({ contracts, calEvents, calMonth, setCal, calFilter, setCalF }) {
  const { y, m } = calMonth;
  const today = startOfToday();
  const [sel, setSel] = useState(today);
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMo = new Date(y, m+1, 0).getDate();
  const todayStr = today.toISOString().substr(0, 10);
  const cells = [];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=daysInMo;d++) cells.push(d);
  while(cells.length%7) cells.push(null);
  const MONTHS_LONG=["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const prev=()=>setCal(p=>{const d=new Date(p.y,p.m-1,1);return{y:d.getFullYear(),m:d.getMonth()};});
  const next=()=>setCal(p=>{const d=new Date(p.y,p.m+1,1);return{y:d.getFullYear(),m:d.getMonth()};});
  const selStr = `${y}-${String(m+1).padStart(2,"0")}-${String(sel.getDate()).padStart(2,"0")}`;
  const selEvs = calEvents[selStr]||[];
  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
        <div style={{ fontSize:13, fontWeight:700, color:TX }}>{MONTHS_LONG[m]} {y}</div>
        <Btn onClick={prev} variant="ghost" size="sm" icon={ChevronLeft}/>
        <Btn onClick={()=>setCal({y:today.getFullYear(),m:today.getMonth()})} variant="ghost" size="sm">Hoje</Btn>
        <Btn onClick={next} variant="ghost" size="sm" icon={ChevronRight}/>
        <div style={{flex:1}}/>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <div onClick={()=>setCalF("all")} style={{padding:"3px 10px",fontSize:9,fontWeight:700,cursor:"pointer",borderRadius:99,background:calFilter==="all"?B3:B2,color:calFilter==="all"?TX:TX2,border:`1px solid ${LN}`}}>Todos</div>
          {contracts.slice(0,6).map(c=>(
            <div key={c.id} onClick={()=>setCalF(c.id)} style={{padding:"3px 10px",fontSize:9,fontWeight:700,cursor:"pointer",borderRadius:99,background:calFilter===c.id?c.color+"22":B2,color:calFilter===c.id?c.color:TX2,border:`1px solid ${calFilter===c.id?c.color+"44":LN}`,display:"flex",alignItems:"center",gap:4}}>
              <div style={{width:5,height:5,borderRadius:"50%",background:c.color}}/>{c.company.split("/")[0].slice(0,8)}
            </div>
          ))}
        </div>
      </div>
      <div style={{ border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", background:B2 }}>
          {["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=>(
            <div key={d} style={{ padding:"8px 0", textAlign:"center", fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3 }}>{d}</div>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:1, background:LN }}>
          {cells.map((d,i)=>{
            if(!d) return <div key={`e${i}`} style={{ minHeight:90, background:B0 }}/>;
            const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const evs=calEvents[ds]||[];
            const isT=ds===todayStr;
            const isSel=ds===selStr;
            return (
              <div key={d} onClick={()=>setSel(new Date(y,m,d))}
                style={{ minHeight:90, padding:5, background:isSel?B2:B0, cursor:"pointer", outline:isT?`2px solid ${RED}`:"none", outlineOffset:-2 }}
                onMouseEnter={e=>!isSel&&(e.currentTarget.style.background=B1)}
                onMouseLeave={e=>!isSel&&(e.currentTarget.style.background=B0)}>
                <div style={{ fontSize:11, fontWeight:isT?700:400, color:isT?RED:TX, marginBottom:3 }}>{d}</div>
                {evs.slice(0,3).map((ev,ei)=>(
                  <div key={ei} style={{ fontSize:8, fontWeight:700, padding:"1px 4px", marginBottom:2, borderLeft:`2px solid ${ev.color}`, background:ev.dashed?"transparent":`${ev.color}18`, color:ev.color, borderLeftStyle:ev.dashed?"dashed":"solid", opacity:ev.dashed?.8:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", textTransform:"uppercase", letterSpacing:".03em" }}>{ev.label}</div>
                ))}
                {evs.length>3&&<div style={{fontSize:8,color:TX3}}>+{evs.length-3}</div>}
              </div>
            );
          })}
        </div>
      </div>
      {selEvs.length>0&&(
        <div style={{ marginTop:12, background:B1, border:`1px solid ${LN}`, borderRadius:10, padding:14 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:TX2, marginBottom:10 }}>
            {sel.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {selEvs.map((ev,i)=>(
              <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", borderRadius:7, background:B2, borderLeft:`3px solid ${ev.color}` }}>
                <div style={{ fontSize:12, fontWeight:500, color:TX, flex:1 }}>{ev.label}</div>
                {ev.dashed&&<Badge color={TX2}>Fase</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Calendario({ contracts, calEvents, calMonth, setCal, calFilter, setCalF }) {
  return (
    <div style={{ padding:24, maxWidth:1400 }}>
      <CalendarView contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>
    </div>
  );
}


// ─── Contract Modal ───────────────────────────────────────
function ContractModal({ modal, setModal, contracts, saveC }) {
  const isEdit=!!modal.data;
  const [f,setF]=useState(modal.data||{
    company:"",cnpj:"",contractDeadline:"",contractValue:"",currency:"BRL",
    monthlyValue:"",contractStart:"",paymentType:"single",paymentDeadline:"",
    installments:[{value:"",date:""},{value:"",date:""}],
    parc1Value:"",parc1Deadline:"",parc2Value:"",parc2Deadline:"",
    hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,
    numPosts:0,numStories:0,numCommunityLinks:0,numReposts:0,
    color:CONTRACT_COLORS[contracts.length%CONTRACT_COLORS.length],notes:""
  });
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const setInst=(i,field,val)=>setF(x=>{const inst=[...(x.installments||[])];inst[i]={...inst[i],[field]:val};return{...x,installments:inst};});
  const addInst=()=>setF(x=>({...x,installments:[...(x.installments||[]),{value:"",date:""}]}));
  const rmInst=i=>setF(x=>({...x,installments:(x.installments||[]).filter((_,j)=>j!==i)}));
  const months=f.paymentType==="monthly"?monthsBetween(f.contractStart,f.contractDeadline):null;
  const liveTotal=f.paymentType==="monthly"?(months?(Number(f.monthlyValue)||0)*months:0):f.paymentType==="split"?(f.installments||[]).reduce((s,i)=>s+(Number(i.value)||0),0):Number(f.contractValue)||0;
  const ORDINALS=["1ª","2ª","3ª","4ª","5ª","6ª"];
  const handleSave=async()=>{
    if(!f.company) return alert("Preencha o nome.");
    const entry={...f,id:f.id||uid(),contractValue:f.paymentType==="monthly"?0:Number(f.contractValue)||0,monthlyValue:Number(f.monthlyValue)||0,
      numPosts:Number(f.numPosts)||0,numStories:Number(f.numStories)||0,numCommunityLinks:Number(f.numCommunityLinks)||0,numReposts:Number(f.numReposts)||0,
      installments:f.paymentType==="split"?(f.installments||[]).map(i=>({value:Number(i.value)||0,date:i.date||""})):[],
      parc1Value:0,parc2Value:0,parc1Deadline:"",parc2Deadline:"",
      commPaid:f.commPaid||{},nfEmitted:f.nfEmitted||{},paymentDaysAfterNF:Number(f.paymentDaysAfterNF)||0};
    if(isEdit) {
      await saveC(contracts.map(c=>c.id===entry.id?entry:c));
    } else {
      await saveC([...contracts,entry]);
      // Auto-create deliverables in Briefing stage
      const TYPE_MAP = [
        {key:"numPosts",    type:"reel",    label:"Reel"},
        {key:"numStories",  type:"story",   label:"Story"},
        {key:"numReposts",  type:"tiktok",  label:"TikTok"},
        {key:"numCommunityLinks", type:"link", label:"Link"},
      ];
      const newDeliverables = [];
      TYPE_MAP.forEach(({key,type,label}) => {
        const n = Number(f[key])||0;
        for(let i=1;i<=n;i++) {
          newDeliverables.push({
            id:uid(), contractId:entry.id, title:`${label} ${f.company} #${i}`,
            type, stage:"briefing", plannedPostDate:"", notes:"",
            responsible:{}, stageDateOverrides:{}, createdAt:new Date().toISOString(),
          });
        }
      });
      if(newDeliverables.length>0 && modal.saveDeliverables) {
        const existing = modal.existingDeliverables || [];
        modal.saveDeliverables([...existing,...newDeliverables]);
      }
    }
    setModal(null);
  };
  return (
    <Modal title={isEdit?"Editar Contrato":"Novo Contrato"} onClose={()=>setModal(null)}
      footer={<><Btn onClick={()=>setModal(null)} variant="ghost" size="sm">Cancelar</Btn><Btn onClick={handleSave} variant="primary" size="sm">{isEdit?"Salvar":"Criar"}</Btn></>}>
      <SRule>Empresa</SRule>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Nome" full><Input value={f.company} onChange={e=>set("company",e.target.value)} placeholder="ex: Netshoes"/></Field>
        <Field label="CNPJ"><Input value={f.cnpj} onChange={e=>set("cnpj",e.target.value)} placeholder="00.000.000/0001-00"/></Field>
        <Field label="Cor"><input type="color" value={f.color} onChange={e=>set("color",e.target.value)} style={{width:"100%",height:36,padding:2,background:B2,border:`1px solid ${LN}`,borderRadius:6,cursor:"pointer"}}/></Field>
        <Field label="Obs." full><Textarea value={f.notes} onChange={e=>set("notes",e.target.value)} rows={2}/></Field>
      </div>

      <SRule>Financeiro & Pagamento</SRule>
      <div style={{display:"flex",background:B2,border:`1px solid ${LN}`,borderRadius:6,overflow:"hidden",marginBottom:14,width:"fit-content"}}>
        {[["single","Único"],["split","Parcelas"],["monthly","Mensal"]].map(([v,l])=>(
          <div key={v} onClick={()=>set("paymentType",v)}
            style={{padding:"6px 14px",fontSize:10,fontWeight:700,cursor:"pointer",color:f.paymentType===v?TX:TX2,background:f.paymentType===v?B3:"transparent",transition:"all .1s"}}>{l}</div>
        ))}
      </div>

      {f.paymentType==="monthly"?(
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
          <Field label="Valor Mensal"><Input type="number" value={f.monthlyValue} onChange={e=>set("monthlyValue",e.target.value)} placeholder="0"/></Field>
          <Field label="Moeda"><Select value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></Select></Field>
          <Field label="Comissão 20%"><input readOnly value={f.hasCommission&&Number(f.monthlyValue)>0?`${fmtMoney(Number(f.monthlyValue)*COMM_RATE,f.currency)}/mês`:"Desativada"} style={{width:"100%",padding:"8px 12px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:f.hasCommission?RED:TX2,fontSize:12,fontFamily:"inherit",outline:"none"}}/></Field>
          <Field label="Início"><Input type="date" value={f.contractStart} onChange={e=>set("contractStart",e.target.value)}/></Field>
          <Field label="Término"><Input type="date" value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></Field>
          <Field label="Total"><input readOnly value={liveTotal>0&&months?`${months}m = ${fmtMoney(liveTotal,f.currency)}`:"—"} style={{width:"100%",padding:"8px 12px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:GRN,fontSize:12,fontFamily:"inherit",outline:"none",fontWeight:700}}/></Field>
          <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8}}><CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)} label/></div>
        </div>
      ):f.paymentType==="split"?(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:12}}>
            <Field label="Moeda"><Select value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></Select></Field>
            <Field label="Total calculado"><input readOnly value={liveTotal>0?fmtMoney(liveTotal,f.currency):"—"} style={{width:"100%",padding:"8px 12px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:GRN,fontSize:12,fontFamily:"inherit",outline:"none",fontWeight:700}}/></Field>
            <Field label="Comissão 20%"><input readOnly value={f.hasCommission&&liveTotal>0?fmtMoney(liveTotal*COMM_RATE,f.currency):"Desativada"} style={{width:"100%",padding:"8px 12px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:f.hasCommission?RED:TX2,fontSize:12,fontFamily:"inherit",outline:"none"}}/></Field>
            <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8}}><CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)} label/></div>
          </div>
          {(f.installments||[]).map((inst,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 36px",gap:8,marginBottom:8,alignItems:"end"}}>
              <Field label={`${ORDINALS[i]||`${i+1}ª`} Parcela — Valor`}><Input type="number" placeholder="0" value={inst.value} onChange={e=>setInst(i,"value",e.target.value)}/></Field>
              <Field label={`${ORDINALS[i]||`${i+1}ª`} Parcela — Data`}><Input type="date" value={inst.date} onChange={e=>setInst(i,"date",e.target.value)}/></Field>
              <button onClick={()=>rmInst(i)} disabled={(f.installments||[]).length<=2} style={{padding:"8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:RED,cursor:"pointer",alignSelf:"flex-end"}}>×</button>
            </div>
          ))}
          <Btn onClick={addInst} variant="ghost" size="sm" icon={Plus} style={{marginBottom:12}}>Parcela</Btn>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Prazo Final"><Input type="date" value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></Field>
          </div>
        </>
      ):(
        <>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
            <Field label="Valor"><Input type="number" value={f.contractValue} onChange={e=>set("contractValue",e.target.value)} placeholder="0"/></Field>
            <Field label="Moeda"><Select value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></Select></Field>
            <Field label="Comissão 20%"><input readOnly value={f.hasCommission&&f.contractValue?fmtMoney(Number(f.contractValue)*COMM_RATE,f.currency):"Desativada"} style={{width:"100%",padding:"8px 12px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:f.hasCommission?RED:TX2,fontSize:12,fontFamily:"inherit",outline:"none"}}/></Field>
            <Field label="Data Pagamento"><Input type="date" value={f.paymentDeadline} onChange={e=>set("paymentDeadline",e.target.value)}/></Field>
            <Field label="Prazo Final"><Input type="date" value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></Field>
            <div style={{display:"flex",alignItems:"center",gap:8,alignSelf:"flex-end",paddingBottom:8}}><CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)} label/></div>
          </div>
        </>
      )}

      <SRule>Condição de Pagamento</SRule>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Pgto X dias após NF">
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <Input type="number" min="0" max="365" value={f.paymentDaysAfterNF||""} placeholder="Não se aplica" onChange={e=>set("paymentDaysAfterNF",e.target.value)} style={{flex:1}}/>
            {Number(f.paymentDaysAfterNF)>0&&<span style={{fontSize:11,color:TX2,whiteSpace:"nowrap"}}>dias</span>}
          </div>
        </Field>
      </div>

      <SRule>Entregas Contratadas</SRule>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:12}}>
        {[["numPosts","Posts/Reels"],["numStories","Stories"],["numCommunityLinks","Links"],["numReposts","Reposts/TT"]].map(([k,l])=>(
          <Field key={k} label={l}><Input type="number" min="0" value={f[k]} onChange={e=>set(k,e.target.value)}/></Field>
        ))}
      </div>

      <SRule>Viagem</SRule>
      <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
        <Toggle on={!!f.hasTravel} onToggle={()=>set("hasTravel",!f.hasTravel)}/>
        <span style={{fontSize:12,fontWeight:600,color:f.hasTravel?TX:TX2}}>Contrato exige viagem</span>
      </div>
      {f.hasTravel && (
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:8}}>
            <Field label="Destino"><Input value={f.travelDestination||""} onChange={e=>set("travelDestination",e.target.value)} placeholder="ex: Miami, EUA"/></Field>
            <Field label="Valor diária (R$)"><Input type="number" min="0" value={f.travelDailyRate||""} onChange={e=>set("travelDailyRate",e.target.value)} placeholder="0"/></Field>
            <Field label="Nº de diárias"><Input type="number" min="0" value={f.travelDays||""} onChange={e=>set("travelDays",e.target.value)} placeholder="0"/></Field>
          </div>
          {/* Travel dates */}
          <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:6}}>Datas de viagem</div>
          {(f.travelDates||[]).map((td,i)=>(
            <div key={i} style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr 32px",gap:8,alignItems:"end"}}>
              <Field label={`Dia ${i+1}`}><Input type="date" value={td.date||""} onChange={e=>{const d=[...(f.travelDates||[])];d[i]={...d[i],date:e.target.value};set("travelDates",d);}}/></Field>
              <Field label="Tipo"><select value={td.type||"travel"} onChange={e=>{const d=[...(f.travelDates||[])];d[i]={...d[i],type:e.target.value};set("travelDates",d);}} style={{width:"100%",padding:"8px 12px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontSize:12,fontFamily:"inherit",outline:"none"}}>
                <option value="travel">✈️ Viagem</option>
                <option value="recording">🎥 Gravação</option>
                <option value="event">🎯 Evento</option>
                <option value="return">🏠 Retorno</option>
              </select></Field>
              <Field label="Obs."><Input value={td.note||""} onChange={e=>{const d=[...(f.travelDates||[])];d[i]={...d[i],note:e.target.value};set("travelDates",d);}} placeholder="opcional"/></Field>
              <button onClick={()=>set("travelDates",(f.travelDates||[]).filter((_,j)=>j!==i))} style={{padding:"8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:RED,cursor:"pointer",alignSelf:"flex-end"}}>×</button>
            </div>
          ))}
          <Btn onClick={()=>set("travelDates",[...(f.travelDates||[]),{date:"",type:"travel",note:""}])} variant="ghost" size="sm" icon={Plus}>Adicionar data</Btn>
          {Number(f.travelDays)>0&&Number(f.travelDailyRate)>0&&(
            <div style={{marginTop:8,padding:"10px 14px",background:`${BLU}10`,border:`1px solid ${BLU}30`,borderRadius:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:12,color:TX2}}>Total diárias</span>
              <span style={{fontSize:14,fontWeight:700,color:BLU}}>{fmtMoney(Number(f.travelDays)*Number(f.travelDailyRate))}</span>
            </div>
          )}
        </div>
      )}
      <SRule>Custos do Contrato</SRule>
      <div style={{marginBottom:8,display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <span style={{fontSize:11,color:TX2}}>Deduza custos antes de calcular a comissão (passagens, produção, etc.)</span>
        <Btn onClick={()=>set("costs",[...(f.costs||[]),{id:uid(),label:"",value:"",category:"production"}])} variant="ghost" size="sm" icon={Plus}>Adicionar custo</Btn>
      </div>
      {(f.costs||[]).length===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic",marginBottom:8}}>Nenhum custo cadastrado</div>}
      {(f.costs||[]).map((cost,i)=>(
        <div key={cost.id||i} style={{display:"grid",gridTemplateColumns:"1fr 120px 140px 32px",gap:8,marginBottom:8,alignItems:"end"}}>
          <Field label={i===0?"Descrição":""}><Input value={cost.label} placeholder="ex: Passagem aérea" onChange={e=>{const c=[...(f.costs||[])];c[i]={...c[i],label:e.target.value};set("costs",c);}}/></Field>
          <Field label={i===0?"Valor (R$)":""}>
            <Input type="number" min="0" value={cost.value} placeholder="0" onChange={e=>{const c=[...(f.costs||[])];c[i]={...c[i],value:e.target.value};set("costs",c);}}/>
          </Field>
          <Field label={i===0?"Categoria":""}>
            <Select value={cost.category||"production"} onChange={e=>{const c=[...(f.costs||[])];c[i]={...c[i],category:e.target.value};set("costs",c);}}>
              <option value="production">Produção</option>
              <option value="travel">Viagem</option>
              <option value="equipment">Equipamento</option>
              <option value="crew">Equipe</option>
              <option value="other">Outro</option>
            </Select>
          </Field>
          <button onClick={()=>set("costs",(f.costs||[]).filter((_,j)=>j!==i))} style={{padding:"8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:RED,cursor:"pointer",alignSelf:"flex-end"}}>×</button>
        </div>
      ))}
      {(f.costs||[]).length>0&&(()=>{
        const totalCosts=(f.costs||[]).reduce((s,c)=>s+(Number(c.value)||0),0);
        const base=(()=>{if(f.paymentType==="monthly"){const m=monthsBetween(f.contractStart,f.contractDeadline);return m?(Number(f.monthlyValue)||0)*m:0;}if(f.paymentType==="split")return(f.installments||[]).reduce((s,i)=>s+(Number(i.value)||0),0);return Number(f.contractValue)||0;})();
        const netValue=base-totalCosts;
        const commOnNet=netValue>0&&f.hasCommission?netValue*0.20:0;
        return(
          <div style={{marginTop:4,padding:"12px 14px",background:`${BLU}08`,border:`1px solid ${BLU}20`,borderRadius:8}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:11,color:TX2}}>Total custos</span>
              <span style={{fontSize:12,fontWeight:700,color:RED}}>- {fmtMoney(totalCosts)}</span>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
              <span style={{fontSize:11,color:TX2}}>Valor líquido</span>
              <span style={{fontSize:12,fontWeight:700,color:TX}}>{fmtMoney(netValue)}</span>
            </div>
            {f.hasCommission&&<div style={{display:"flex",justifyContent:"space-between",paddingTop:6,borderTop:`1px solid ${LN}`}}>
              <span style={{fontSize:11,color:TX2}}>Comissão Ranked (20% s/ líquido)</span>
              <span style={{fontSize:12,fontWeight:700,color:RED}}>{fmtMoney(commOnNet)}</span>
            </div>}
          </div>
        );
      })()}
    </Modal>
  );
}

// ─── Post Modal ───────────────────────────────────────────
function PostModal({ modal, setModal, contracts, posts, saveP, toast }) {
  const isEdit=!!modal.data;
  const [f,setF]=useState(modal.data||{contractId:contracts[0]?.id||"",title:"",link:"",type:"post",plannedDate:new Date().toISOString().substr(0,10),publishDate:"",isPosted:false,views:"",reach:"",likes:"",comments:"",shares:"",saves:"",networks:[]});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const toggleNet=n=>setF(x=>({...x,networks:(x.networks||[]).includes(n)?(x.networks||[]).filter(v=>v!==n):[...(x.networks||[]),n]}));
  const liveEng=useMemo(()=>calcEngagement({likes:Number(f.likes)||0,comments:Number(f.comments)||0,shares:Number(f.shares)||0,saves:Number(f.saves)||0,reach:Number(f.reach)||0}),[f.likes,f.comments,f.shares,f.saves,f.reach]);
  const extraNets=Math.max(0,(f.networks||[]).length-1);
  const viewsLabel=VIEW_TYPES.has(f.type)?"Views":"Impressões";
  const handleSave=async()=>{
    if(!f.contractId||!f.title) return alert("Preencha contrato e título.");
    const entry={...f,id:f.id||uid(),views:Number(f.views)||0,reach:Number(f.reach)||0,likes:Number(f.likes)||0,comments:Number(f.comments)||0,shares:Number(f.shares)||0,saves:Number(f.saves)||0,networks:f.networks||[],plannedDate:f.plannedDate||"",publishDate:f.isPosted?(f.publishDate||f.plannedDate):"",isPosted:!!f.isPosted};
    if(isEdit){await saveP(posts.map(p=>p.id===entry.id?entry:p));toast?.("Post atualizado","success");}
    else{await saveP([...posts,entry]);toast?.(f.isPosted?"✓ Post publicado registrado":"📅 Post planejado cadastrado","success");}
    setModal(null);
  };
  return (
    <Modal title={isEdit?"Editar Post":"Registrar Entrega"} onClose={()=>setModal(null)}
      footer={<><Btn onClick={()=>setModal(null)} variant="ghost" size="sm">Cancelar</Btn><Btn onClick={handleSave} variant="primary" size="sm">{isEdit?"Salvar":"Registrar"}</Btn></>}>
      <SRule>Identificação</SRule>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Contrato"><Select value={f.contractId} onChange={e=>set("contractId",e.target.value)}>{contracts.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</Select></Field>
        <Field label="Tipo"><Select value={f.type} onChange={e=>set("type",e.target.value)}><option value="post">Reel / Post</option><option value="story">Story</option><option value="link">Link Comunidade</option><option value="repost">Repost</option><option value="tiktok">TikTok</option></Select></Field>
        <Field label="Título" full><Input value={f.title} onChange={e=>set("title",e.target.value)} placeholder="ex: Reel Copa 2026 — Abertura"/></Field>
        <Field label="Data Planejada"><Input type="date" value={f.plannedDate} onChange={e=>set("plannedDate",e.target.value)}/></Field>
        <Field label="Status">
          <div style={{display:"flex",alignItems:"center",gap:10,padding:"8px 0"}}>
            <Toggle on={!!f.isPosted} onToggle={()=>set("isPosted",!f.isPosted)}/>
            <span style={{fontSize:12,fontWeight:600,color:f.isPosted?GRN:TX2}}>{f.isPosted?"✓ Publicado":"Não publicado"}</span>
          </div>
        </Field>
        {f.isPosted&&<Field label="Data Real"><Input type="date" value={f.publishDate||f.plannedDate} onChange={e=>set("publishDate",e.target.value)}/></Field>}
        <Field label="Link" full><Input value={f.link} onChange={e=>set("link",e.target.value)} placeholder="https://..."/></Field>
      </div>

      <SRule>Redes Sociais</SRule>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
        {NETWORKS.map(n=>{const sel=(f.networks||[]).includes(n);return(
          <div key={n} onClick={()=>toggleNet(n)} style={{padding:"5px 12px",fontSize:10,fontWeight:700,cursor:"pointer",borderRadius:99,background:sel?RED+"22":"rgba(255,255,255,.05)",color:sel?RED:TX2,border:`1px solid ${sel?RED+"44":LN}`,transition:"all .1s"}}>
            {sel&&"✓ "}{n}
          </div>
        );})}
      </div>
      {extraNets>0&&<div style={{fontSize:10,color:BLU,fontWeight:700,marginTop:6}}>✓ +{extraNets} repost{extraNets>1?"s":""} contabilizado{extraNets>1?"s":""} automaticamente</div>}

      <SRule>Métricas</SRule>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <Field label={viewsLabel}><Input type="number" min="0" value={f.views} onChange={e=>set("views",e.target.value)} placeholder="0"/></Field>
        {[["reach","Alcance"],["likes","Curtidas"],["comments","Comentários"],["shares","Shares"],["saves","Saves"]].map(([k,l])=>(
          <Field key={k} label={l}><Input type="number" min="0" value={f[k]} onChange={e=>set(k,e.target.value)} placeholder="0"/></Field>
        ))}
      </div>
      <div style={{marginTop:12,padding:"10px 14px",background:B2,border:`1px solid ${LN}`,borderRadius:8}}>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4}}>Engajamento calculado</div>
        <div style={{fontSize:18,fontWeight:700,color:liveEng!=null?(liveEng>=3?GRN:liveEng>=1?AMB:TX2):TX3}}>{liveEng!=null?liveEng.toFixed(2)+"%":"— preencha alcance e interações"}</div>
      </div>
    </Modal>
  );
}



// ─── View Renderer (catches per-view errors) ──────────────
function ViewRenderer({ view, contracts, posts, deliverables, stats, rates, saveNote, toggleComm,
  toggleCommPaid, toggleNF, setModal, setView, saveC, saveP, saveD,
  calEvents, calMonth, setCal, calFilter, setCalF,
  triggerNewTask, setTriggerNewTask }) {
  const [err, setErr] = useState(null);
  useEffect(() => { setErr(null); }, [view]);
  if (err) return (
    <div style={{ padding:40, maxWidth:600 }}>
      <div style={{ background:"#FFF1F2", border:"1px solid #FCA5A5", borderRadius:10, padding:24 }}>
        <div style={{ fontSize:14, fontWeight:700, color:RED, marginBottom:8 }}>Erro na renderização</div>
        <div style={{ fontSize:12, color:TX, marginBottom:16, fontFamily:"monospace", background:B2, padding:12, borderRadius:6, whiteSpace:"pre-wrap", wordBreak:"break-all" }}>{String(err)}</div>
        <Btn onClick={() => setErr(null)} variant="primary" size="sm">Tentar novamente</Btn>
      </div>
    </div>
  );
  try {
    if (view==="dashboard")      return <Dashboard contracts={contracts} posts={posts} deliverables={deliverables} stats={stats} rates={rates} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} setModal={setModal} navigateTo={setView}/>;
    if (view==="acompanhamento") return <Acompanhamento contracts={contracts} posts={posts} deliverables={deliverables} saveDeliverables={saveD} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>;
    if (view==="contratos")      return <Contratos contracts={contracts} posts={posts} deliverables={deliverables} saveC={saveC} saveP={saveP} saveDeliverables={saveD} setModal={setModal} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} saveNote={saveNote} rates={rates}/>;

    if (view==="posts")          return <Posts contracts={contracts} posts={posts} saveP={saveP} setModal={setModal}/>;
    if (view==="calendario")     return <Calendario contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>;
    return null;
  } catch(e) {
    setErr(e?.message || String(e));
    return null;
  }
}

// ─── Client Report Modal ──────────────────────────────────
function ClientReport({ contract: c, posts, deliverables, rates, onClose }) {
  const [generating, setGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);

  const cPosts = posts.filter(p => p.contractId === c.id && p.isPosted);
  const cDels  = deliverables.filter(d => d.contractId === c.id);

  // Aggregate metrics
  const totalViews    = cPosts.reduce((s,p) => s+(Number(p.views)||0), 0) + cDels.reduce((s,d) => s+(Number(d.views)||0),0);
  const totalReach    = cPosts.reduce((s,p) => s+(Number(p.reach)||0), 0) + cDels.reduce((s,d) => s+(Number(d.reach)||0),0);
  const totalLikes    = cPosts.reduce((s,p) => s+(Number(p.likes)||0), 0) + cDels.reduce((s,d) => s+(Number(d.likes)||0),0);
  const totalComments = cPosts.reduce((s,p) => s+(Number(p.comments)||0), 0) + cDels.reduce((s,d) => s+(Number(d.comments)||0),0);
  const totalSaves    = cPosts.reduce((s,p) => s+(Number(p.saves)||0), 0);
  const totalEngagements = totalLikes + totalComments + totalSaves;
  const avgEngRate = totalReach > 0 ? (totalEngagements / totalReach * 100) : null;
  const contractValue = contractTotal(c);
  const contractBRL   = toBRL(contractValue, c.currency, rates);

  // Brand KPIs
  const CPM  = totalViews > 0   ? (contractBRL / totalViews * 1000) : null;
  const CPV  = totalViews > 0   ? (contractBRL / totalViews)        : null;
  const CPE  = totalEngagements > 0 ? (contractBRL / totalEngagements) : null;
  const CPR  = totalReach > 0   ? (contractBRL / totalReach * 1000) : null; // Cost per thousand reach

  const doneDelsFromPipeline = cDels.filter(d => d.stage === "done" || d.stage === "postagem").length;
  const doneDelsFromPosts    = cPosts.filter(p => p.isPosted).length;
  const doneDels   = doneDelsFromPipeline + doneDelsFromPosts;
  const totalDels  = c.numPosts + c.numStories + c.numCommunityLinks + c.numReposts;
  const completionRate = totalDels > 0 ? Math.round(Math.min(100, doneDels / totalDels * 100)) : (doneDels > 0 ? 100 : 0);

  const today = new Date().toLocaleDateString("pt-BR", {day:"numeric",month:"long",year:"numeric"});

  const generateAI = async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ max_tokens:800, messages:[{ role:"user", content:`
Você é especialista em marketing de influência. Gere um parágrafo executivo em português para um relatório de performance de campanha com a marca ${c.company}.

Dados: views=${totalViews.toLocaleString("pt-BR")}, alcance=${totalReach.toLocaleString("pt-BR")}, engajamento=${avgEngRate?.toFixed(2)||"—"}%, CPM=R$${CPM?.toFixed(2)||"—"}, entregas=${doneDels}/${totalDels}.

Escreva em tom profissional, destacando os pontos positivos e o ROI. Máx 3 frases. Sem markdown.`
        }] })
      });
      const data = await res.json();
      setAiSummary(data.text || "");
    } catch(e) { setAiSummary("Erro ao gerar resumo."); }
    setGenerating(false);
  };

  const MetricCard = ({label, value, sub, color}) => (
    <div style={{background:B2,border:`1px solid ${LN}`,borderRadius:8,padding:"14px 16px",textAlign:"center"}}>
      <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:6}}>{label}</div>
      <div style={{fontSize:20,fontWeight:700,color:color||TX,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:10,color:TX3,marginTop:3}}>{sub}</div>}
    </div>
  );

  return (
    <Modal title={`Relatório de Performance · ${c.company}`} onClose={onClose} width={780}
      footer={<>
        <Btn onClick={()=>window.print()} variant="default" size="sm">🖨️ Imprimir / PDF</Btn>
        <div style={{flex:1}}/>
        <Btn onClick={onClose} variant="ghost" size="sm">Fechar</Btn>
      </>}>
      <style>{`@media print { body * { visibility:hidden; } .print-area, .print-area * { visibility:visible; } .print-area { position:absolute;left:0;top:0;width:100%; } }`}</style>
      <div className="print-area">
        {/* Header */}
        <div style={{display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20,paddingBottom:16,borderBottom:`1px solid ${LN}`}}>
          <div>
            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
              <div style={{width:10,height:10,borderRadius:"50%",background:c.color}}/>
              <span style={{fontSize:18,fontWeight:700,color:TX}}>{c.company}</span>
            </div>
            <div style={{fontSize:12,color:TX2}}>Parceria com @veloso.lucas_ · Relatório de Performance</div>
            <div style={{fontSize:11,color:TX3,marginTop:2}}>Gerado em {today} · Stand Produções</div>
          </div>
          <div style={{textAlign:"right"}}>
            <div style={{fontSize:11,color:TX2}}>Investimento total</div>
            <div style={{fontSize:20,fontWeight:700,color:TX}}>{fmtMoney(contractValue, c.currency)}</div>
            {c.currency!=="BRL"&&<div style={{fontSize:11,color:TX3}}>≈ {fmtMoney(contractBRL)}</div>}
          </div>
        </div>

        {/* AI Summary */}
        {aiSummary ? (
          <div style={{background:`${GRN}08`,border:`1px solid ${GRN}25`,borderRadius:8,padding:"14px 16px",marginBottom:20}}>
            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:GRN,marginBottom:6}}>Resumo Executivo</div>
            <p style={{fontSize:13,color:TX,lineHeight:1.6}}>{aiSummary}</p>
          </div>
        ) : (
          <div style={{marginBottom:20,textAlign:"center"}}>
            <Btn onClick={generateAI} variant="primary" size="sm" disabled={generating}>
              {generating?"Gerando resumo…":"⚡ Gerar resumo executivo com IA"}
            </Btn>
          </div>
        )}

        {/* Brand KPIs */}
        <div style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Métricas de Performance</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          <MetricCard label="Visualizações" value={totalViews>0?totalViews.toLocaleString("pt-BR"):"—"} sub="total acumulado"/>
          <MetricCard label="Alcance" value={totalReach>0?totalReach.toLocaleString("pt-BR"):"—"} sub="pessoas únicas"/>
          <MetricCard label="Engajamento" value={avgEngRate!=null?avgEngRate.toFixed(2)+"%":"—"} sub="média geral" color={avgEngRate!=null?(avgEngRate>=3?GRN:avgEngRate>=1?AMB:TX2):TX2}/>
          <MetricCard label="Interações" value={totalEngagements>0?totalEngagements.toLocaleString("pt-BR"):"—"} sub="likes+comentários"/>
        </div>

        {/* ROI KPIs */}
        <div style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Custo por Resultado (ROI)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          <MetricCard label="CPM" value={CPM!=null?`R$ ${CPM.toFixed(2)}`:"—"} sub="custo por mil views" color={CPM!=null&&CPM<50?GRN:AMB}/>
          <MetricCard label="CPV" value={CPV!=null?`R$ ${CPV.toFixed(4)}`:"—"} sub="custo por visualização"/>
          <MetricCard label="CPE" value={CPE!=null?`R$ ${CPE.toFixed(2)}`:"—"} sub="custo por engajamento" color={CPE!=null&&CPE<20?GRN:AMB}/>
          <MetricCard label="CPM Alcance" value={CPR!=null?`R$ ${CPR.toFixed(2)}`:"—"} sub="custo por mil alcançados"/>
        </div>

        {/* Delivery */}
        <div style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Entregas do Contrato</div>
        <div style={{...G,padding:"14px 16px",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:12,color:TX2}}>
            {doneDels} de {totalDels} entregas concluídas
            {doneDelsFromPosts>0&&<span style={{fontSize:10,color:TX3,marginLeft:6}}>({doneDelsFromPosts} via Posts{doneDelsFromPipeline>0?`, ${doneDelsFromPipeline} via Pipeline`:""})</span>}
          </span>
            <span style={{fontSize:13,fontWeight:700,color:completionRate===100?GRN:completionRate>=50?AMB:RED}}>{completionRate}%</span>
          </div>
          <div style={{height:6,background:LN,borderRadius:3}}>
            <div style={{height:6,borderRadius:3,background:completionRate===100?GRN:c.color,width:`${completionRate}%`,transition:"width .5s"}}/>
          </div>
          {[["Posts/Reels",c.numPosts,cPosts.filter(p=>p.type==="post"||p.type==="reel").length],["Stories",c.numStories,cPosts.filter(p=>p.type==="story").length],["Links",c.numCommunityLinks,cPosts.filter(p=>p.type==="link").length],["TikTok/Reposts",c.numReposts,cPosts.filter(p=>p.type==="tiktok"||p.type==="repost").length]].filter(([,tot])=>tot>0).map(([lbl,tot,don],i)=>(
            <div key={i} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 0",borderTop:`1px solid ${LN}`,marginTop:6}}>
              <span style={{fontSize:12,color:TX2}}>{lbl}</span>
              <span style={{fontSize:12,fontWeight:600,color:don>=tot?GRN:TX}}>{don}/{tot}</span>
            </div>
          ))}
        </div>

        {/* Posts breakdown */}
        {cPosts.length > 0 && (
          <>
            <div style={{fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Detalhamento por Publicação</div>
            <div style={{border:`1px solid ${LN}`,borderRadius:8,overflow:"hidden",marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 90px 80px 80px",padding:"7px 14px",background:B2,fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:TX3}}>
                <div>Publicação</div><div>Views</div><div>Alcance</div><div>Curtidas</div><div>Coment.</div><div>Eng.%</div>
              </div>
              {cPosts.map((p,i)=>{
                const eng=calcEngagement(p);
                return(
                  <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 90px 80px 80px",padding:"9px 14px",borderTop:`1px solid ${LN}`,fontSize:11,alignItems:"center"}}>
                    <div style={{fontWeight:500,color:TX}}>{p.title}{p.link&&<a href={p.link} target="_blank" rel="noreferrer" style={{color:RED,marginLeft:6,fontSize:10}}>↗</a>}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{Number(p.views||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{Number(p.reach||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{Number(p.likes||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{Number(p.comments||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{fontWeight:700,color:eng!=null?(eng>=3?GRN:eng>=1?AMB:TX3):TX3}}>{eng!=null?eng.toFixed(1)+"%":"—"}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{fontSize:10,color:TX3,textAlign:"center",paddingTop:12,borderTop:`1px solid ${LN}`}}>
          Relatório gerado por ENTREGAS · @veloso.lucas_ · Ranked Produções
        </div>
      </div>
    </Modal>
  );
}

// ─── User Invite Modal ─────────────────────────────────────
function UserInviteModal({ onClose }) {
  const [email, setEmail]   = useState("");
  const [pass, setPass]     = useState(() => Math.random().toString(36).slice(2,10).toUpperCase() + "!" + Math.floor(Math.random()*90+10));
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const handleCreate = async () => {
    if (!email) return setError("Informe o email.");
    setLoading(true); setError("");
    try {
      const { createUserWithEmailAndPassword } = await import("firebase/auth");
      const { auth } = await import("./firebase.js");
      await createUserWithEmailAndPassword(auth, email, pass);
      setDone(true);
      toast?.("✓ Usuário criado com sucesso","success");
    } catch(e) {
      setError(e.message?.includes("email-already")?`${email} já tem conta.`:String(e.message));
    }
    setLoading(false);
  };

  return (
    <Modal title="Convidar Usuário" onClose={onClose} width={480}
      footer={<>
        <Btn onClick={onClose} variant="ghost" size="sm">Fechar</Btn>
        {!done&&<Btn onClick={handleCreate} variant="primary" size="sm" disabled={loading}>{loading?"Criando…":"Criar conta"}</Btn>}
      </>}>
      {done ? (
        <div style={{textAlign:"center",padding:"20px 0"}}>
          <div style={{fontSize:32,marginBottom:12}}>✅</div>
          <div style={{fontSize:14,fontWeight:700,color:TX,marginBottom:8}}>Conta criada!</div>
          <div style={{fontSize:12,color:TX2,marginBottom:16}}>Compartilhe as credenciais abaixo:</div>
          <div style={{background:B2,border:`1px solid ${LN}`,borderRadius:8,padding:16,textAlign:"left"}}>
            <div style={{fontSize:12,marginBottom:6}}><b>Email:</b> {email}</div>
            <div style={{fontSize:12}}><b>Senha temporária:</b> <code style={{background:B3,padding:"2px 6px",borderRadius:4}}>{pass}</code></div>
          </div>
          <div style={{fontSize:11,color:TX3,marginTop:10}}>O usuário pode alterar a senha após o primeiro login nas configurações do Firebase.</div>
        </div>
      ) : (
        <div style={{display:"flex",flexDirection:"column",gap:14}}>
          <Field label="Email do novo usuário">
            <Input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="lucas@veloso.com"/>
          </Field>
          <Field label="Senha temporária">
            <div style={{display:"flex",gap:8}}>
              <Input value={pass} onChange={e=>setPass(e.target.value)} style={{flex:1}}/>
              <Btn onClick={()=>setPass(Math.random().toString(36).slice(2,10).toUpperCase()+"!"+Math.floor(Math.random()*90+10))} variant="ghost" size="sm">🔄</Btn>
            </div>
          </Field>
          {error&&<div style={{fontSize:11,color:RED,background:"rgba(200,16,46,.08)",border:"1px solid rgba(200,16,46,.2)",borderRadius:6,padding:"8px 12px"}}>{error}</div>}
          <div style={{fontSize:11,color:TX3,padding:"10px 12px",background:B2,borderRadius:6}}>
            O usuário receberá acesso completo ao app. Após o primeiro login, pode alterar a própria senha em <b>veloso-2026.vercel.app</b>.
          </div>
        </div>
      )}
    </Modal>
  );
}


// ─── Mobile Bottom Nav ────────────────────────────────────
function NavIcon({ type, active }) {
  const c = active ? RED : "#ABABAB";
  const s = { width:22, height:22, display:"block" };
  if (type==="home")      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>;
  if (type==="prod")      return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>;
  if (type==="contracts") return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
  if (type==="posts")     return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>;
  if (type==="calendar")  return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>;
  return null;
}

function MobileNav({ view, setView }) {
  const NAV_MOB = [
    { id:"dashboard",      label:"Home",      icon:"home" },
    { id:"acompanhamento", label:"Produção",  icon:"prod" },
    { id:"contratos",      label:"Contratos", icon:"contracts" },
    { id:"posts",          label:"Posts",     icon:"posts" },
    { id:"calendario",     label:"Agenda",    icon:"calendar" },
  ];
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:B1, borderTop:`1px solid ${LN}`, display:"flex", alignItems:"stretch", zIndex:100, boxShadow:"0 -1px 12px rgba(0,0,0,0.08)", paddingBottom:"env(safe-area-inset-bottom,0px)" }}>
      {NAV_MOB.map(item => {
        const active = view === item.id;
        return (
          <div key={item.id} onClick={()=>setView(item.id)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, cursor:"pointer", padding:"10px 0 8px", position:"relative",
              borderTop: active ? `2px solid ${RED}` : "2px solid transparent" }}>
            <NavIcon type={item.icon} active={active}/>
            <span style={{ fontSize:9, fontWeight:active?700:400, color:active?RED:"#ABABAB", letterSpacing:".02em" }}>{item.label}</span>
          </div>
        );
      })}
    </div>
  );
}


// ─── App Root ─────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();
  const [user, setUser]     = useState(undefined); // undefined=loading
  const [view, setView]     = useState("dashboard");
  const [contracts, setC]   = useState([]);
  const [posts, setP]       = useState([]);
  const [deliverables, setD] = useState([]);
  const [modal, setModal]   = useState(null);
  const [eurRate, setEurRate] = useState(0);
  const [usdRate, setUsdRate] = useState(0);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [calMonth, setCal]  = useState(() => { const n=new Date(); return {y:n.getFullYear(),m:n.getMonth()}; });
  const [calFilter, setCalF] = useState("all");
  const [triggerNewTask, setTriggerNewTask] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const prevCIds = useRef([]); const prevPIds = useRef([]); const prevDIds = useRef([]);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u||null));
    return unsub;
  }, []);

  // Data loading
  useEffect(() => {
    if (!user) return;
    let unsub=null;
    setSyncStatus("loading");
    (async()=>{
      try {
        const [cs,ps,ds,eur,usd]=await Promise.all([loadContracts(),loadPosts(),loadDeliverables(),getSetting("eurRate"),getSetting("usdRate")]);
        const ic=cs.length>0?cs:SEED; const ip=ps.length>0?ps:SEED_POSTS; const id=ds||[];
        setC(ic); setP(ip); setD(id);
        prevCIds.current=ic.map(c=>c.id); prevPIds.current=ip.map(p=>p.id); prevDIds.current=id.map(d=>d.id);
        if(eur) setEurRate(Number(eur)||0);
        if(usd) setUsdRate(Number(usd)||0);
        if(cs.length===0) await syncContracts(ic,[]);
        if(ps.length===0&&SEED_POSTS.length>0) await syncPosts(ip,[]);
        setSyncStatus("ok");
      } catch(err) { console.error(err); setSyncStatus("error"); setC(SEED); setP(SEED_POSTS); }
      try {
        unsub=subscribeToChanges({
          onContracts:cs=>{setC(cs);prevCIds.current=cs.map(c=>c.id);setSyncStatus("ok");},
          onPosts:ps=>{setP(ps);prevPIds.current=ps.map(p=>p.id);},
          onDeliverables:ds=>{setD(ds);prevDIds.current=ds.map(d=>d.id);},
          onSetting:(key,val)=>{if(key==="eurRate")setEurRate(Number(val)||0);if(key==="usdRate")setUsdRate(Number(val)||0);},
        });
      } catch {}
    })();
    return ()=>unsub?.();
  }, [user]);

  // Presence
  useEffect(() => {
    if (!user) return;
    updatePresence();
    const interval=setInterval(updatePresence,45_000);
    const unsubP=subscribeToPresence(setOnlineUsers);
    const cleanup=()=>removePresence();
    window.addEventListener("beforeunload",cleanup);
    return ()=>{ clearInterval(interval); unsubP(); removePresence(); window.removeEventListener("beforeunload",cleanup); };
  }, [user]);

  const saveC=async d=>{setC(d);try{await syncContracts(d,prevCIds.current);prevCIds.current=d.map(c=>c.id);setSyncStatus("ok");}catch(e){console.error(e);setSyncStatus("error");}};
  const saveP=async d=>{setP(d);try{await syncPosts(d,prevPIds.current);prevPIds.current=d.map(p=>p.id);}catch(e){console.error(e);}};
  const saveD=async d=>{setD(d);try{await syncDeliverables(d,prevDIds.current);prevDIds.current=d.map(x=>x.id);}catch(e){console.error(e);}};
  const rates=useMemo(()=>({eur:eurRate,usd:usdRate}),[eurRate,usdRate]);
  const saveNote=(id,notes)=>saveC(contracts.map(c=>c.id===id?{...c,notes}:c));
  const toggleComm=id=>saveC(contracts.map(c=>c.id===id?{...c,hasCommission:!c.hasCommission}:c));
  const toggleCommPaid=(cid,key)=>saveC(contracts.map(c=>{if(c.id!==cid)return c;const cp={...(c.commPaid||{})};cp[key]=!cp[key];return{...c,commPaid:cp};}));
  const toggleNF=(cid,key)=>saveC(contracts.map(c=>{if(c.id!==cid)return c;const nf={...(c.nfEmitted||{})};nf[key]=!nf[key];return{...c,nfEmitted:nf};}));

  const stats=useMemo(()=>{
    const totalBRL=contracts.reduce((s,c)=>s+toBRL(contractTotal(c),c.currency,rates),0);
    // Count done deliverables as published posts per contract
    const doneDeliverables=deliverables.filter(d=>d.stage==="done"||d.stage==="postagem");
    const commBRL=contracts.filter(c=>c.hasCommission).reduce((s,c)=>s+toBRL(contractTotal(c)*COMM_RATE,c.currency,rates),0);
    const totEur=contracts.filter(c=>c.currency==="EUR").reduce((s,c)=>s+contractTotal(c),0);
    const totUsd=contracts.filter(c=>c.currency==="USD").reduce((s,c)=>s+contractTotal(c),0);
    let commPaid=0,commPend=0;
    contracts.forEach(c=>{if(!c.hasCommission)return;getCommEntries(c).forEach(e=>{const v=toBRL(e.amount,c.currency,rates);e.isPaid?commPaid+=v:commPend+=v;});});
    const tot=k=>contracts.reduce((s,c)=>s+c[k],0);
    // Combine posts + done deliverables for delivery counting
    const del=t=>{
      const postTypes = t==="post"?["post","reel"]:t==="repost"?["repost","tiktok"]:[t];
      const fromPosts=posts.filter(p=>postTypes.includes(p.type)&&p.isPosted).length;
      const fromPipeline=doneDeliverables.filter(d=>postTypes.includes(d.type)).length;
      return fromPosts+fromPipeline;
    };
    const engs=posts.map(calcEngagement).filter(e=>e!==null);
    const nfPending=contracts.reduce((s,c)=>s+getNFEntries(c).filter(e=>!e.isEmitted).length,0);
    const nfPendingValue=contracts.reduce((s,c)=>s+getNFEntries(c).filter(e=>!e.isEmitted).reduce((sv,e)=>sv+toBRL(e.amount,c.currency,rates),0),0);
    return {totalBRL,commBRL,commPaidBRL:commPaid,commPendBRL:commPend,totEur,totUsd,tp:tot("numPosts"),ts:tot("numStories"),tl:tot("numCommunityLinks"),tr:tot("numReposts"),dp:del("post"),ds:del("story"),dl:del("link"),dr:0,avgEng:engs.length?engs.reduce((s,v)=>s+v,0)/engs.length:null,nfPending,nfPendingValue};
  },[contracts,posts,rates]);

  const calEvents=useMemo(()=>{
    const ev={};
    const add=(ds,e)=>{if(!ds)return;const k=ds.substr(0,10);if(!ev[k])ev[k]=[];ev[k].push(e);};
    contracts.forEach(c=>{
      if(calFilter!=="all"&&calFilter!==c.id)return;
      if(c.contractDeadline)add(c.contractDeadline,{label:`PRAZO · ${c.company}`,color:c.color});
      if(c.paymentType==="monthly"&&c.contractStart){const s=new Date(c.contractStart),e=new Date(c.contractDeadline||c.contractStart);const cur=new Date(s.getFullYear(),s.getMonth(),1);while(cur<=e){add(cur.toISOString().substr(0,10),{label:`PGTO · ${c.company}`,color:c.color});cur.setMonth(cur.getMonth()+1);}}
      else if(c.paymentType==="split"){const O=["1ª","2ª","3ª","4ª","5ª","6ª"];getInstallments(c).forEach((inst,i)=>{if(inst.date)add(inst.date,{label:`${O[i]||`${i+1}ª`} PARC · ${c.company}`,color:c.color});});}
      else if(c.paymentDeadline)add(c.paymentDeadline,{label:`PGTO · ${c.company}`,color:c.color});
    });
    posts.forEach(p=>{const c=contracts.find(x=>x.id===p.contractId);if(!c)return;if(calFilter!=="all"&&calFilter!==c.id)return;add(p.isPosted?(p.publishDate||p.plannedDate):p.plannedDate,{label:(p.isPosted?"✓ ":"📅 ")+p.title,color:c.color});});
    // Pipeline deliverables on calendar (by plannedPostDate)
    const pipeDeliverables = deliverables || [];
    pipeDeliverables.forEach(d=>{
      if(!d||!d.plannedPostDate||d.stage==="done") return;
      const c=contracts.find(x=>x.id===d.contractId);
      if(!c) return;
      if(calFilter!=="all"&&calFilter!==c.id) return;
      // Stage deadlines
      STAGES.filter(s=>s.id!=="done"&&s.id!=="postagem").forEach(s=>{
        const stageDue = d.stageDateOverrides?.[s.id] || addDays(d.plannedPostDate, s.days);
        if(stageDue) add(stageDue,{label:`${s.label} · ${d.title}`,color:c.color,dashed:true});
      });
      // Postagem
      add(d.plannedPostDate,{label:`📅 ${d.title}`,color:c.color});
    });
    try{const cronos=JSON.parse(localStorage.getItem("copa6_cron")||"{}");Object.entries(cronos).forEach(([cid,ms])=>{const c=contracts.find(x=>x.id===cid);if(!c)return;if(calFilter!=="all"&&calFilter!==c.id)return;(ms||[]).forEach(m=>{if(m.date&&m.fase)add(m.date,{label:`${m.fase}${m.resp?` · ${m.resp}`:""}`,color:c.color,dashed:true});});});}catch{}
    // Travel dates + period + conflict detection
    contracts.forEach(c => {
      if (!c.hasTravel||!c.travelDates?.length) return;
      if (calFilter!=="all"&&calFilter!==c.id) return;
      const TYPE_EMOJI = {travel:"✈️",recording:"🎥",event:"🎯",return:"🏠"};
      const sortedDates = [...c.travelDates].filter(td=>td.date).sort((a,b)=>a.date.localeCompare(b.date));
      if(!sortedDates.length) return;
      // Mark each travel date
      sortedDates.forEach(td => {
        add(td.date, { label:`${TYPE_EMOJI[td.type]||"✈️"} ${c.company}${td.note?` · ${td.note}`:""}`, color:BLU, isTravel:true });
      });
      // Fill travel period (between first and last date)
      if(sortedDates.length >= 2) {
        const start = sortedDates[0].date;
        const end   = sortedDates[sortedDates.length-1].date;
        let cur = start;
        while(cur <= end) {
          const isMarked = sortedDates.some(td=>td.date===cur);
          if(!isMarked) add(cur, { label:`━ ${c.company} (viagem)`, color:BLU, dashed:true, isTravelPeriod:true });
          // Check conflict: any deliverable posting during travel period
          const hasPipeConflict = (deliverables||[]).some(d=>d.plannedPostDate===cur&&d.contractId!==c.id);
          if(hasPipeConflict) add(cur, { label:`⚠️ Conflito com viagem`, color:AMB, isConflict:true });
          cur = addDays(cur, 1);
        }
      }
    });
    return ev;
  },[contracts,posts,deliverables,calFilter]);

  // Loading
  if (user===undefined) {
    return (
      <div style={{ minHeight:"100vh", background:"#F7F6EF", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Plus Jakarta Sans,system-ui,sans-serif" }}>
        <div style={{ fontSize:13, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:TX3 }}>ENTREGAS</div>
      </div>
    );
  }

  // Login
  if (!user) return <ToastProvider><LoginPage/></ToastProvider>;

  // App
  return (
    <ToastProvider>
      <div style={{ display:"flex", minHeight:"100vh", background:B0, fontFamily:"Plus Jakarta Sans,system-ui,sans-serif", fontSize:13, color:TX }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700&display=swap');
*{box-sizing:border-box;margin:0;padding:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif}
button,a,[role=button]{transition:all 0.18s cubic-bezier(0.4,0,0.2,1)!important;cursor:pointer}
input,select,textarea{transition:border-color 0.15s ease,box-shadow 0.15s ease!important}
input:focus,select:focus,textarea:focus{outline:none!important;border-color:#000!important;box-shadow:0 0 0 2px rgba(0,0,0,0.08)!important}
input[type=date]::-webkit-calendar-picker-indicator{opacity:.5}
select option{background:#FEFEFE;color:#000}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:rgba(0,0,0,.15);border-radius:3px}
::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.25)}
::placeholder{color:#ABABAB}
a{color:${RED}}
.hover-lift{transition:${TRANS}!important}
.hover-lift:hover{transform:translateY(-1px)!important;box-shadow:0 4px 12px rgba(0,0,0,0.08),0 1px 3px rgba(0,0,0,0.06)!important}
.hover-row:hover{background:#F7F7F7!important}
`}</style>
        {!isMobile && <Sidebar view={view} setView={setView} user={user} onSignOut={()=>signOut(auth)} onInvite={()=>setShowInvite(true)} onlineUsers={onlineUsers} contracts={contracts}/>}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <TopBar view={view} eurRate={eurRate} usdRate={usdRate} setEurRate={setEurRate} setUsdRate={setUsdRate}
            onNewContract={()=>setModal({type:"contract",data:null})}
            onNewPost={()=>setModal({type:"post",data:null})}
            onNewTask={()=>setTriggerNewTask(true)}
            syncStatus={syncStatus} isMobile={isMobile}/>
          <div style={{ flex:1, overflowY:"auto", paddingBottom:isMobile?84:0 }}>
            <ViewRenderer view={view} contracts={contracts} posts={posts} deliverables={deliverables} stats={stats} rates={rates}
              saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid}
              toggleNF={toggleNF} setModal={setModal} setView={setView}
              saveC={saveC} saveP={saveP} saveD={saveD}
              calEvents={calEvents} calMonth={calMonth} setCal={setCal}
              calFilter={calFilter} setCalF={setCalF}
              triggerNewTask={triggerNewTask} setTriggerNewTask={setTriggerNewTask}/>
          </div>
        </div>
        {modal && (
          <div>
            {modal.type==="contract"&&<ContractModal modal={{...modal,saveDeliverables:saveD,existingDeliverables:deliverables}} setModal={setModal} contracts={contracts} saveC={saveC}/>}
            {modal.type==="post"    &&<PostModal modal={modal} setModal={setModal} contracts={contracts} posts={posts} saveP={saveP}/>}
          </div>
        )}
        {showInvite && <UserInviteModal onClose={()=>setShowInvite(false)}/>}
        {isMobile && <MobileNav view={view} setView={setView} onNew={()=>{
          if(view==="contratos") setModal({type:"contract",data:null});
          else if(view==="posts") setModal({type:"post",data:null});
          else if(view==="acompanhamento") setView("acompanhamento");
        }}/>}
      </div>
    </ToastProvider>
  );
}

