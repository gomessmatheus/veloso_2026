import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import {
  loadContracts, syncContracts, loadPosts, syncPosts,
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
const fmtDate  = s => { if (!s) return "—"; const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };
const daysLeft = s => { if (!s) return null; return Math.ceil((new Date(s) - new Date()) / 864e5); };
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
  if (c.paymentType==="split") {
    const O=["1ª","2ª","3ª","4ª","5ª","6ª"];
    return getInstallments(c).map((inst,i)=>({key:`parc${i+1}`,label:`${O[i]||`${i+1}ª`} Parcela`,amount:(Number(inst.value)||0)*COMM_RATE,currency:c.currency,date:inst.date,isPaid:!!paid[`parc${i+1}`]}));
  }
  const total=contractTotal(c);
  return [{key:"single",label:"Pagamento Único",amount:total*COMM_RATE,currency:c.currency,date:c.paymentDeadline,isPaid:!!paid["single"]}];
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


// ─── CSS ──────────────────────────────────────────────────
const G = { // card style (shadow-sm from config)
  background: B1, border: `1px solid ${LN}`,
  borderRadius: 12, boxShadow: "0 1px 3px rgba(0,0,0,0.10), 0 1px 2px -1px rgba(0,0,0,0.10)",
};
const G2 = { ...G, background: B2, boxShadow: "0 1px 3px rgba(0,0,0,0.05)" };

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
            borderLeft:`3px solid ${t.type==="success"?GRN:t.type==="error"?RED:AMB}`,
            animation:"toastIn .2s ease",
          }}>
            <span style={{fontSize:16}}>{t.type==="success"?"✓":t.type==="error"?"✕":"!"}</span>
            {msg}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </ToastCtx.Provider>
  );
}

// ─── Base components ──────────────────────────────────────
function Btn({ children, onClick, variant="default", size="md", icon:Icon, disabled, style:st }) {
  const base = { display:"inline-flex", alignItems:"center", gap:6, fontFamily:"inherit", fontWeight:600, letterSpacing:".03em", cursor:disabled?"not-allowed":"pointer", opacity:disabled?.5:1, border:"none", outline:"none", transition:"all .15s", borderRadius:6, fontSize: size==="sm"?10:12 };
  const variants = {
    default: { background:B2, color:TX, border:`1px solid ${LN2}`, padding:size==="sm"?"5px 10px":"7px 14px" },
    primary: { background:RED, color:"#fff", padding:size==="sm"?"5px 10px":"7px 14px" },
    ghost: { background:"transparent", color:TX2, padding:size==="sm"?"5px 8px":"7px 10px" },
    danger: { background:"rgba(200,16,46,.15)", color:RED, border:`1px solid rgba(200,16,46,.25)`, padding:size==="sm"?"5px 10px":"7px 14px" },
  };
  return <button style={{...base,...variants[variant],...st}} onClick={onClick} disabled={disabled}>
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
    {label && <span style={{ fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:on?GRN:TX2 }}>{on?"Com. ativa":"Sem comissão"}</span>}
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
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.7)", zIndex:200, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:"48px 16px", overflowY:"auto", backdropFilter:"blur(4px)" }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ ...G2, width:"100%", maxWidth:width, flexShrink:0 }}>
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
          COPA<span style={{color:RED}}>2026</span>·OPS
        </div>
        <div style={{ fontSize:12, color:TX2, marginTop:6, letterSpacing:".04em" }}>Gestão de contratos e entregas · Stand Produções</div>
      </div>

      {/* Card */}
      <div style={{ background:"#FEFEFE", border:"1px solid #F0F0F2", borderRadius:16, width:"100%", maxWidth:380, padding:36, position:"relative", boxShadow:"0 1px 3px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.04)" }}>
        <h2 style={{ fontSize:18, fontWeight:700, color:TX, marginBottom:6, letterSpacing:"-.01em" }}>Entrar na plataforma</h2>
        <p style={{ fontSize:12, color:TX2, marginBottom:24 }}>Acesso restrito à equipe Stand Produções</p>

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
          Copa do Mundo 2026 · Lucas Veloso @veloso.lucas_
        </div>
      </div>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────
const NAV_ITEMS = [
  { id:"dashboard",      label:"Dashboard",       icon:LayoutDashboard },
  { id:"acompanhamento", label:"Acompanhamento",  icon:KanbanSquare },
  { id:"contratos",      label:"Contratos",        icon:FileText },
  { id:"tarefas",        label:"Tarefas",          icon:CheckSquare },
  { id:"posts",          label:"Posts",            icon:Video },
  { id:"calendario",     label:"Calendário",       icon:Calendar },
];

function Sidebar({ view, setView, user, onSignOut, onlineUsers, contracts }) {
  const my = useMemo(() => getMyPresence(), []);
  return (
    <div style={{ width:220, background:B0, borderRight:`1px solid ${LN}`, display:"flex", flexDirection:"column", height:"100vh", flexShrink:0, position:"sticky", top:0 }}>
      {/* Logo */}
      <div style={{ padding:"20px 16px", borderBottom:`1px solid ${LN}` }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:".18em", textTransform:"uppercase", color:TX }}>
          COPA<span style={{color:RED}}>2026</span>·OPS
        </div>
        <div style={{ fontSize:10, color:TX3, marginTop:3, letterSpacing:".03em" }}>Stand Produções</div>
      </div>

      {/* Nav */}
      <nav style={{ padding:"12px 8px", flex:1, overflowY:"auto" }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX3, padding:"4px 8px", marginBottom:4 }}>Navegação</div>
        {NAV_ITEMS.map(item => {
          const active = view===item.id;
          return (
            <div key={item.id} onClick={()=>setView(item.id)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:active?600:400, color:active?TX:TX2, background:active?B2:"transparent", marginBottom:2, transition:"all .1s" }}>
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

        {/* Contract shortcuts */}
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX3, padding:"4px 8px", marginTop:16, marginBottom:4 }}>Contratos</div>
        {contracts.slice(0,6).map(c => (
          <div key={c.id} onClick={()=>setView("contratos")}
            style={{ display:"flex", alignItems:"center", gap:6, padding:"5px 10px", borderRadius:6, cursor:"pointer", fontSize:11, color:TX2, marginBottom:1 }}>
            <div style={{ width:6, height:6, borderRadius:"50%", background:c.color, flexShrink:0 }}/>
            {c.company.split("/")[0].trim()}
          </div>
        ))}
        {contracts.length>6 && <div style={{ fontSize:10, color:TX3, padding:"4px 10px" }}>+{contracts.length-6} mais</div>}
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
          <button onClick={onSignOut} style={{ background:"none", border:"none", color:TX3, cursor:"pointer", padding:4 }} title="Sair"><LogOut size={14}/></button>
        </div>
      </div>
    </div>
  );
}

function TopBar({ view, eurRate, usdRate, setEurRate, setUsdRate, onNewContract, onNewPost, onNewTask, syncStatus }) {
  const title = NAV_ITEMS.find(i=>i.id===view)?.label || view;
  const statusColor = { loading:AMB, ok:GRN, error:RED }[syncStatus]||GRN;
  const statusLabel = { loading:"Sincronizando", ok:"Ao Vivo", error:"Offline" }[syncStatus]||"Ao Vivo";
  return (
    <div style={{ height:48, background:B0, borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", padding:"0 20px", gap:12, flexShrink:0, position:"sticky", top:0, zIndex:50 }}>
      <div style={{ fontSize:13, fontWeight:700, color:TX, letterSpacing:"-.01em" }}>{title}</div>
      <div style={{ flex:1 }}/>
      {/* EUR */}
      <div style={{ display:"flex", alignItems:"center", gap:4, background:B2, border:`1px solid ${LN}`, borderRadius:6, padding:"3px 8px" }}>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>€1=</span>
        <input type="number" step="0.05" value={eurRate||""} placeholder="—"
          onChange={e=>setEurRate(Number(e.target.value)||0)}
          onBlur={e=>setSetting("eurRate",Number(e.target.value)||0).catch(()=>{})}
          style={{ width:52, background:"none", border:"none", color:TX, fontSize:11, fontWeight:700, fontFamily:"inherit", outline:"none", textAlign:"right" }}/>
        <span style={{ fontSize:9, fontWeight:700, color:TX3 }}>R$</span>
      </div>
      {/* USD */}
      <div style={{ display:"flex", alignItems:"center", gap:4, background:B2, border:`1px solid ${LN}`, borderRadius:6, padding:"3px 8px" }}>
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
      {view==="contratos"  && <Btn onClick={onNewContract} variant="primary" size="sm" icon={Plus}>Contrato</Btn>}
      {view==="posts"      && <Btn onClick={onNewPost}     variant="primary" size="sm" icon={Plus}>Post</Btn>}
      {view==="tarefas"    && <Btn onClick={onNewTask}      variant="primary" size="sm" icon={Plus}>Tarefa</Btn>}
      {view==="dashboard"  && <Btn onClick={onNewContract} variant="primary" size="sm" icon={Plus}>Contrato</Btn>}
    </div>
  );
}


// ─── Dashboard ────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{ ...G, padding:"18px 20px" }}>
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2, marginBottom:10 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:700, letterSpacing:"-.02em", color:accent||TX, lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:TX3, marginTop:5 }}>{sub}</div>}
    </div>
  );
}

function Dashboard({ contracts, posts, stats, rates, saveNote, toggleComm, toggleCommPaid, toggleNF, setModal }) {
  const [open, setOpen] = useState(null);
  const [nfDetails, setNfd] = useState(() => lsLoad("copa6_nfd",{}));
  const saveNfd = (cid,key,field,val) => setNfd(prev=>{const n={...prev,[cid]:{...(prev[cid]||{}),[key]:{...(prev[cid]?.[key]||{}),[field]:val}}};lsSave("copa6_nfd",n);return n;});

  return (
    <div style={{ padding:24, maxWidth:1400 }}>
      {/* Welcome */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:20, fontWeight:700, color:TX, letterSpacing:"-.02em" }}>Visão Geral</h1>
        <p style={{ fontSize:12, color:TX2, marginTop:4 }}>Copa do Mundo 2026 · Lucas Veloso @veloso.lucas_</p>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        <KpiCard label="Volume Total" value={<span style={{fontSize:16}}>{fmtMoney(stats.totalBRL)}</span>}
          sub={`${contracts.length} contratos · ${contracts.filter(c=>c.paymentType==="monthly").length} mensais`}/>
        <KpiCard label="Comissão Pendente" value={fmtMoney(stats.commPendBRL)} sub="a receber · Stand" accent={AMB}/>
        <KpiCard label="Valor a Receber" value={<span style={{fontSize:16}}>{fmtMoney(stats.commPendBRL + stats.nfPendingValue)}</span>}
          sub={`${stats.nfPending} NFs pendentes`} accent={stats.nfPending>0?RED:GRN}/>
        <KpiCard label="Engajamento" value={stats.avgEng!=null?stats.avgEng.toFixed(2)+"%":"—"} sub="média calculada auto" accent={stats.avgEng!=null?(stats.avgEng>=3?GRN:stats.avgEng>=1?AMB:TX2):TX2}/>
      </div>

      {/* Second row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:28 }}>
        <KpiCard label="Posts/Reels" value={<span>{stats.dp}<span style={{fontSize:14,color:TX3,fontWeight:400}}>/{stats.tp}</span></span>} sub="entregues"/>
        <KpiCard label="Stories" value={<span>{stats.ds}<span style={{fontSize:14,color:TX3,fontWeight:400}}>/{stats.ts}</span></span>} sub="entregues"/>
        <KpiCard label="Links Comun." value={<span>{stats.dl}<span style={{fontSize:14,color:TX3,fontWeight:400}}>/{stats.tl}</span></span>} sub="entregues"/>
        <KpiCard label="NFs Pendentes" value={stats.nfPending} sub="não emitidas" accent={stats.nfPending>0?RED:GRN}/>
      </div>

      {/* Contracts accordion */}
      <div style={{ fontSize:9, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:TX3, marginBottom:12 }}>Contratos</div>
      <div style={{ display:"flex", flexDirection:"column", gap:0, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
        {/* Table header */}
        <div style={{ display:"grid", gridTemplateColumns:"3px 1fr 130px 110px 180px 140px 32px", background:B2, borderBottom:`1px solid ${LN}`, padding:"8px 0" }}>
          {["","EMPRESA","VALOR","PRAZO","ENTREGAS","NOTA FISCAL",""].map((h,i) => (
            <div key={i} style={{ padding:"0 12px", fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3, textAlign:i===2||i===3?"right":"left" }}>{h}</div>
          ))}
        </div>
        {contracts.map(c => {
          const isOpen = open===c.id;
          const cp=posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
          const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
          const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link").length;
          const cr=posts.filter(p=>p.contractId===c.id).reduce((s,p)=>s+postRepostCount(p),0);
          const total=contractTotal(c), dl=daysLeft(c.contractDeadline);
          const totDel=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
          const doneDel=cp+cs+cl+cr;
          const pct=totDel?Math.min(100,doneDel/totDel*100):0;
          const nfE=getNFEntries(c);
          const nfSt=nfE.length===0?null:nfE.every(e=>e.isEmitted)?"ok":nfE.every(e=>!e.isEmitted)?"nao":"parcial";
          const NfPill = () => {
            if(!nfE.length) return <span style={{color:TX3,fontSize:11}}>—</span>;
            if(nfSt==="ok") return <Badge color={GRN}>✓ Emitida</Badge>;
            if(nfSt==="parcial") return <Badge color={AMB}>Parcial</Badge>;
            return <Badge color={RED}>Não Emitida</Badge>;
          };
          return (
            <div key={c.id} style={{ borderBottom:`1px solid ${LN}` }}>
              <div onClick={()=>setOpen(isOpen?null:c.id)}
                style={{ display:"grid", gridTemplateColumns:"3px 1fr 130px 110px 180px 140px 32px", alignItems:"center", cursor:"pointer", background:isOpen?B2:B0, transition:"background .1s" }}
                onMouseEnter={e=>!isOpen&&(e.currentTarget.style.background=B1)}
                onMouseLeave={e=>!isOpen&&(e.currentTarget.style.background=B0)}>
                <div style={{ background:c.color, alignSelf:"stretch", minHeight:48 }}/>
                <div style={{ padding:"12px", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                  <span style={{ fontWeight:600, fontSize:13, color:TX }}>{c.company}</span>
                  {currBadge(c.currency)}
                  {c.paymentType==="monthly"&&<Badge color={TX2}>Mensal</Badge>}
                  {total===0&&<Badge color={TX3}>TBD</Badge>}
                </div>
                <div style={{ padding:"12px", textAlign:"right" }}>
                  <div style={{ fontWeight:700, fontSize:13, color:TX }}>{total>0?fmtMoney(total,c.currency):"—"}</div>
                  {total>0&&c.currency!=="BRL"&&rates.eur>0&&c.currency==="EUR"&&<div style={{fontSize:10,color:TX3}}>≈{fmtMoney(total*rates.eur)}</div>}
                </div>
                <div style={{ padding:"12px", textAlign:"right" }}>
                  {c.contractDeadline?<>
                    <div style={{ fontSize:12,fontWeight:600,color:dlColor(dl) }}>{fmtDate(c.contractDeadline)}</div>
                    <div style={{ fontSize:10,color:dlColor(dl) }}>{dl!=null?`${dl}d`:""}</div>
                  </>:<span style={{color:TX3}}>—</span>}
                </div>
                <div style={{ padding:"12px" }}>
                  {totDel>0?<>
                    <div style={{ height:2, background:"rgba(255,255,255,.1)", borderRadius:2, marginBottom:4 }}>
                      <div style={{ height:2, background:pct===100?GRN:c.color, width:`${pct}%`, borderRadius:2, transition:"width .4s" }}/>
                    </div>
                    <div style={{ fontSize:11,color:TX2 }}>{doneDel}/{totDel} entregas</div>
                  </>:<span style={{fontSize:11,color:TX3,fontStyle:"italic"}}>A definir</span>}
                </div>
                <div style={{ padding:"12px" }}><NfPill/></div>
                <div style={{ textAlign:"center",fontSize:11,color:TX3 }}>{isOpen?"▲":"›"}</div>
              </div>

              {/* Expanded */}
              {isOpen && (
                <div style={{ background:B1, borderTop:`1px solid ${LN}` }}>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", borderBottom:`1px solid ${LN}` }}>
                    {/* Col 1: Entregas */}
                    <div style={{ padding:"18px 20px", borderRight:`1px solid ${LN}` }}>
                      <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Entregas</div>
                      {[{lbl:"Posts/Reels",done:cp,total:c.numPosts,col:c.color},{lbl:"Stories",done:cs,total:c.numStories,col:BLU},{lbl:"Links",done:cl,total:c.numCommunityLinks,col:GRN},{lbl:"Reposts",done:cr,total:c.numReposts,col:AMB}]
                        .filter(b=>b.total>0||b.done>0).map(b=>(
                          <div key={b.lbl} style={{ marginBottom:8 }}>
                            <div style={{ display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3 }}>
                              <span style={{color:TX2}}>{b.lbl}</span>
                              <span style={{color:b.done>=b.total&&b.total>0?GRN:TX,fontWeight:b.done>=b.total&&b.total>0?700:400}}>{b.done}/{b.total}</span>
                            </div>
                            <div style={{ height:2,background:"rgba(255,255,255,.08)",borderRadius:2 }}>
                              <div style={{ height:2,background:b.col,width:`${b.total?Math.min(100,b.done/b.total*100):b.done>0?100:0}%`,borderRadius:2 }}/>
                            </div>
                          </div>
                        ))}
                      {c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts===0&&cp+cs+cl+cr===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic"}}>Escopo a definir</div>}
                      <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${LN}`,fontSize:11,color:TX2}}>
                        <div style={{fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:TX3,marginBottom:6}}>Pagamento</div>
                        {c.paymentType==="monthly"&&<div>{fmtMoney(c.monthlyValue)}/mês · {monthsBetween(c.contractStart,c.contractDeadline)||"?"}m</div>}
                        {c.paymentType==="split"&&<div>{getInstallments(c).map((inst,i)=>{const O=["1ª","2ª","3ª","4ª","5ª","6ª"];return <span key={i}>{i>0?" · ":""}{O[i]||`${i+1}ª`} {fmtMoney(inst.value,c.currency)} {fmtDate(inst.date)}</span>;})}</div>}
                        {c.paymentType==="single"&&<div>{fmtDate(c.paymentDeadline)}</div>}
                      </div>
                      {Number(c.paymentDaysAfterNF)>0&&<div style={{marginTop:6,fontSize:11,color:TX2}}>Pgto {c.paymentDaysAfterNF}d após NF</div>}
                      <div style={{marginTop:10}}><CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/></div>
                      <InlineNotes notes={c.notes} onSave={v=>saveNote(c.id,v)}/>
                    </div>
                    {/* Col 2: Comissões */}
                    <div style={{ padding:"18px 20px", borderRight:`1px solid ${LN}` }}>
                      <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12,display:"flex",justifyContent:"space-between" }}>
                        <span>Comissões</span>
                        {getCommEntries(c).length>0&&<span style={{color:RED}}>{fmtMoney(getCommEntries(c).reduce((s,e)=>s+e.amount,0),c.currency)}</span>}
                      </div>
                      {getCommEntries(c).length===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic"}}>Sem comissão</div>}
                      {getCommEntries(c).map((e,i,arr)=>(
                        <div key={e.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:i<arr.length-1?`1px solid ${LN}`:"none",gap:8}}>
                          <div><div style={{fontSize:12,fontWeight:600,color:TX}}>{e.label}</div>{e.date&&<div style={{fontSize:10,color:TX2}}>{fmtDate(e.date)}</div>}</div>
                          <div style={{display:"flex",alignItems:"center",gap:8}}>
                            <span style={{fontSize:12,fontWeight:700,color:RED}}>{e.amount>0?fmtMoney(e.amount,e.currency):"—"}</span>
                            <div onClick={()=>toggleCommPaid(c.id,e.key)}
                              style={{padding:"3px 8px",fontSize:9,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",borderRadius:4,background:e.isPaid?`${GRN}18`:"rgba(255,255,255,.05)",border:`1px solid ${e.isPaid?GRN+"44":LN}`,color:e.isPaid?GRN:TX2}}>
                              {e.isPaid?"✓ Pago":"Pendente"}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Col 3: NF */}
                    <div style={{ padding:"18px 20px" }}>
                      <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Nota Fiscal</div>
                      {getNFEntries(c).length===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic"}}>Sem NF</div>}
                      {getNFEntries(c).map((e,i,arr)=>{
                        const det=nfDetails?.[c.id]?.[e.key]||{};
                        return (
                          <div key={e.key} style={{marginBottom:i<arr.length-1?14:0,paddingBottom:i<arr.length-1?14:0,borderBottom:i<arr.length-1?`1px solid ${LN}`:"none"}}>
                            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                              <span style={{fontSize:11,fontWeight:600,color:TX}}>{e.label}</span>
                              {e.amount>0&&<span style={{fontSize:11,fontWeight:700,color:TX}}>{fmtMoney(e.amount,e.currency)}</span>}
                            </div>
                            <div onClick={()=>toggleNF(c.id,e.key)}
                              style={{width:"100%",textAlign:"center",padding:"5px 0",fontSize:9,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",cursor:"pointer",borderRadius:4,background:e.isEmitted?`${GRN}18`:"rgba(255,255,255,.04)",border:`1px solid ${e.isEmitted?GRN+"44":LN}`,color:e.isEmitted?GRN:TX2,marginBottom:8}}>
                              {e.isEmitted?"✓ Emitida":"Não emitida"}
                            </div>
                            <div style={{marginBottom:6}}>
                              <div style={{fontSize:9,color:TX3,marginBottom:3}}>Número NF</div>
                              <input style={{width:"100%",padding:"5px 8px",background:B2,border:`1px solid ${LN}`,borderRadius:4,color:TX,fontSize:11,fontFamily:"inherit",outline:"none"}} placeholder="Ex: 1234" value={det.number||""} onChange={ev=>saveNfd(c.id,e.key,"number",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                            </div>
                            <div>
                              <div style={{fontSize:9,color:TX3,marginBottom:3}}>Data de Emissão</div>
                              <input type="date" style={{width:"100%",padding:"5px 8px",background:B2,border:`1px solid ${LN}`,borderRadius:4,color:TX,fontSize:11,fontFamily:"inherit",outline:"none"}} value={det.date||""} onChange={ev=>saveNfd(c.id,e.key,"date",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                            </div>
                            {Number(c.paymentDaysAfterNF)>0&&det.date&&(
                              <div style={{marginTop:6,padding:"6px 8px",background:`${GRN}10`,border:`1px solid ${GRN}30`,borderRadius:4}}>
                                <div style={{fontSize:9,color:GRN,fontWeight:700,marginBottom:2}}>Pgto previsto</div>
                                <div style={{fontSize:11,color:GRN,fontWeight:700}}>{(()=>{const d=new Date(det.date);d.setDate(d.getDate()+Number(c.paymentDaysAfterNF));return fmtDate(d.toISOString().substr(0,10));})()}</div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Tarefas (Linear-inspired) ────────────────────────────
function Tarefas({ contracts, setNewTaskOpen }) {
  const [tasks, setTasks] = useState(() => lsLoad("copa6_tasks", SEED_TASKS));
  const [filter, setFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [view, setView] = useState("board"); // board | list
  const [editTask, setEditTask] = useState(null);
  const [newOpen, setNewOpen] = useState(false);
  const toast = useToast();

  // Expose new task opener to parent
  useEffect(() => { if(setNewTaskOpen) setNewTaskOpen(()=>()=>setNewOpen(true)); }, []);

  const saveTasks = (t) => { setTasks(t); lsSave("copa6_tasks", t); };

  const filtered = tasks.filter(t => {
    if (filter!=="all" && t.contractId!==filter) return false;
    if (priorityFilter!=="all" && t.priority!==priorityFilter) return false;
    return true;
  });

  const byStatus = (statusId) => filtered.filter(t => (t.status||"todo")===statusId);

  const updateStatus = (taskId, newStatus) => {
    saveTasks(tasks.map(t => t.id===taskId ? {...t, status:newStatus} : t));
  };

  const ACTIVE_STATUSES = TASK_STATUSES.filter(s => s.id!=="cancelled");

  return (
    <div style={{ padding:24, maxWidth:1400 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <div style={{ flex:1 }}>
          <h2 style={{ fontSize:14, fontWeight:700, color:TX }}>Tarefas</h2>
          <p style={{ fontSize:11, color:TX2, marginTop:2 }}>{tasks.filter(t=>t.status!=="done"&&t.status!=="cancelled").length} pendentes · {tasks.filter(t=>t.status==="done").length} concluídas</p>
        </div>
        {/* View toggle */}
        <div style={{ display:"flex", background:B2, border:`1px solid ${LN}`, borderRadius:6, overflow:"hidden" }}>
          {[["board","Kanban"],["list","Lista"]].map(([v,l]) => (
            <div key={v} onClick={()=>setView(v)}
              style={{ padding:"5px 12px", fontSize:10, fontWeight:700, cursor:"pointer", color:view===v?TX:TX2, background:view===v?B3:"transparent", transition:"all .1s" }}>{l}</div>
          ))}
        </div>
        {/* Filters */}
        <select value={filter} onChange={e=>setFilter(e.target.value)}
          style={{ padding:"5px 10px", background:B2, border:`1px solid ${LN}`, borderRadius:6, color:TX2, fontSize:11, fontFamily:"inherit", outline:"none" }}>
          <option value="all">Todos contratos</option>
          {contracts.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}
        </select>
        <select value={priorityFilter} onChange={e=>setPriorityFilter(e.target.value)}
          style={{ padding:"5px 10px", background:B2, border:`1px solid ${LN}`, borderRadius:6, color:TX2, fontSize:11, fontFamily:"inherit", outline:"none" }}>
          <option value="all">Todas prioridades</option>
          {TASK_PRIORITIES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <Btn onClick={()=>setNewOpen(true)} variant="primary" size="sm" icon={Plus}>Nova tarefa</Btn>
      </div>

      {/* Board view */}
      {view==="board" && (
        <div style={{ display:"grid", gridTemplateColumns:`repeat(${ACTIVE_STATUSES.length},1fr)`, gap:10 }}>
          {ACTIVE_STATUSES.map(status => {
            const col = byStatus(status.id);
            return (
              <div key={status.id} style={{ background:B1, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
                <div style={{ padding:"12px 14px", borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", gap:6 }}>
                  <status.icon size={12} style={{color:status.color}}/>
                  <span style={{ fontSize:11, fontWeight:700, color:TX, flex:1 }}>{status.label}</span>
                  <span style={{ fontSize:9, fontWeight:700, background:`rgba(255,255,255,.06)`, color:TX2, padding:"1px 6px", borderRadius:99 }}>{col.length}</span>
                </div>
                <div style={{ padding:8, display:"flex", flexDirection:"column", gap:6, minHeight:100 }}>
                  {col.map(task => {
                    const prio = TASK_PRIORITIES.find(p=>p.id===(task.priority||"none"));
                    const contract = contracts.find(c=>c.id===task.contractId);
                    return (
                      <div key={task.id} onClick={()=>setEditTask(task)}
                        style={{ background:B2, border:`1px solid ${LN}`, borderRadius:7, padding:"10px 12px", cursor:"pointer", transition:"border .1s" }}
                        onMouseEnter={e=>e.currentTarget.style.borderColor=LN2}
                        onMouseLeave={e=>e.currentTarget.style.borderColor=LN}>
                        <div style={{ fontSize:12, fontWeight:500, color:TX, marginBottom:6, lineHeight:1.4 }}>{task.title}</div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                          {prio && <div title={prio.label} style={{ display:"flex", alignItems:"center", gap:3, fontSize:9, color:prio.color }}>
                            <prio.icon size={10}/>{prio.label}
                          </div>}
                          {contract && <div style={{ display:"flex", alignItems:"center", gap:3, fontSize:9, color:TX2 }}>
                            <div style={{ width:5, height:5, borderRadius:"50%", background:contract.color }}/>{contract.company.split("/")[0].trim()}
                          </div>}
                          {task.dueDate && <div style={{ fontSize:9, color:dlColor(daysLeft(task.dueDate)) }}>{fmtDate(task.dueDate)}</div>}
                        </div>
                        {/* Quick status change */}
                        <div style={{ marginTop:8, display:"flex", gap:4, flexWrap:"wrap" }} onClick={e=>e.stopPropagation()}>
                          {ACTIVE_STATUSES.filter(s=>s.id!==status.id).slice(0,3).map(s=>(
                            <div key={s.id} onClick={()=>updateStatus(task.id,s.id)}
                              style={{ fontSize:8, padding:"2px 6px", borderRadius:3, cursor:"pointer", background:B3, color:TX3, fontWeight:700 }}>
                              → {s.label}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  <div onClick={()=>{setNewOpen(true);}}
                    style={{ padding:"8px 12px", fontSize:11, color:TX3, cursor:"pointer", borderRadius:6, border:`1px dashed ${LN}`, textAlign:"center", display:"flex", alignItems:"center", justifyContent:"center", gap:4 }}>
                    <Plus size={11}/> Adicionar
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List view */}
      {view==="list" && (
        <div style={{ border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
          <div style={{ display:"grid", gridTemplateColumns:"20px 1fr 120px 120px 120px 100px", padding:"8px 16px", background:B2, borderBottom:`1px solid ${LN}`, fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3 }}>
            <div/><div>Título</div><div>Status</div><div>Prioridade</div><div>Contrato</div><div>Data</div>
          </div>
          {ACTIVE_STATUSES.map(status => {
            const col = byStatus(status.id);
            if(!col.length) return null;
            return (
              <div key={status.id}>
                <div style={{ padding:"6px 16px", background:B1, borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", gap:6 }}>
                  <status.icon size={11} style={{color:status.color}}/>
                  <span style={{ fontSize:10, fontWeight:700, color:TX2 }}>{status.label}</span>
                  <span style={{ fontSize:9, color:TX3, marginLeft:4 }}>{col.length}</span>
                </div>
                {col.map(task => {
                  const prio = TASK_PRIORITIES.find(p=>p.id===(task.priority||"none"));
                  const contract = contracts.find(c=>c.id===task.contractId);
                  return (
                    <div key={task.id} onClick={()=>setEditTask(task)}
                      style={{ display:"grid", gridTemplateColumns:"20px 1fr 120px 120px 120px 100px", padding:"10px 16px", borderBottom:`1px solid ${LN}`, cursor:"pointer", fontSize:12 }}
                      onMouseEnter={e=>e.currentTarget.style.background=B1}
                      onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                      <div onClick={e=>{e.stopPropagation();updateStatus(task.id,"done");}}>
                        {task.status==="done"
                          ? <CheckCircle2 size={14} style={{color:GRN}}/>
                          : <Circle size={14} style={{color:TX3}}/>}
                      </div>
                      <div style={{ color:task.status==="done"?TX3:TX, textDecoration:task.status==="done"?"line-through":"none" }}>{task.title}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:4, color:status.color, fontSize:10 }}><status.icon size={10}/>{status.label}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:4, color:prio?.color||TX3, fontSize:10 }}>{prio&&<prio.icon size={10}/>}{prio?.label||"—"}</div>
                      <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:TX2 }}>
                        {contract&&<><div style={{width:5,height:5,borderRadius:"50%",background:contract.color}}/>{contract.company.split("/")[0].trim()}</>}
                      </div>
                      <div style={{ fontSize:10, color:task.dueDate?dlColor(daysLeft(task.dueDate)):TX3 }}>{fmtDate(task.dueDate)}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      {/* Task modal */}
      {(newOpen || editTask) && (
        <TaskModal
          task={editTask}
          contracts={contracts}
          onClose={()=>{setNewOpen(false);setEditTask(null);}}
          onSave={task=>{
            if(editTask) saveTasks(tasks.map(t=>t.id===task.id?task:t));
            else saveTasks([...tasks, {...task,id:uid(),status:"todo",createdAt:new Date().toISOString()}]);
            toast?.(editTask?"Tarefa atualizada":"✓ Tarefa criada","success");
            setNewOpen(false); setEditTask(null);
          }}
          onDelete={editTask?(id=>{
            if(confirm("Excluir esta tarefa?")) {
              saveTasks(tasks.filter(t=>t.id!==id));
              setEditTask(null);
            }
          }):null}
        />
      )}
    </div>
  );
}

function TaskModal({ task, contracts, onClose, onSave, onDelete }) {
  const [f, setF] = useState(task || { title:"", description:"", status:"todo", priority:"medium", contractId:"", dueDate:"" });
  const set = (k,v) => setF(x=>({...x,[k]:v}));
  return (
    <Modal title={task?"Editar Tarefa":"Nova Tarefa"} onClose={onClose}
      footer={<>
        {onDelete && <Btn onClick={()=>onDelete(task.id)} variant="danger" size="sm">Excluir</Btn>}
        <div style={{flex:1}}/>
        <Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn>
        <Btn onClick={()=>onSave(f)} variant="primary" size="sm">{task?"Salvar":"Criar"}</Btn>
      </>}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <Field label="Título">
          <Input value={f.title} onChange={e=>set("title",e.target.value)} placeholder="ex: Enviar roteiro Amazon até 04/mai"/>
        </Field>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Status">
            <Select value={f.status} onChange={e=>set("status",e.target.value)}>
              {TASK_STATUSES.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}
            </Select>
          </Field>
          <Field label="Prioridade">
            <Select value={f.priority||"medium"} onChange={e=>set("priority",e.target.value)}>
              {TASK_PRIORITIES.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
            </Select>
          </Field>
          <Field label="Contrato / Marca">
            <Select value={f.contractId||""} onChange={e=>set("contractId",e.target.value)}>
              <option value="">— Nenhum —</option>
              {contracts.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}
            </Select>
          </Field>
          <Field label="Data / Prazo">
            <Input type="date" value={f.dueDate||""} onChange={e=>set("dueDate",e.target.value)}/>
          </Field>
        </div>
        <Field label="Descrição / Detalhes">
          <Textarea value={f.description||""} onChange={e=>set("description",e.target.value)} placeholder="Contexto, links, referências…" rows={4}/>
        </Field>
      </div>
    </Modal>
  );
}


// ─── Acompanhamento (Kanban de entregas) ──────────────────
function Acompanhamento({ contracts, posts, calEvents, calMonth, setCal, calFilter, setCalF }) {
  const [view, setView] = useState("kanban"); // kanban | calendar | priorities
  const today = new Date(); const todayStr = today.toISOString().substr(0,10);
  const in7 = new Date(today.getTime()+7*864e5).toISOString().substr(0,10);

  // Posts kanban: planned → in_review → published
  const planned   = posts.filter(p=>!p.isPosted);
  const published = posts.filter(p=>p.isPosted);

  // Contract delivery priorities
  const priorities = contracts.map(c => {
    const cp=posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
    const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
    const tot=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
    const don=cp+cs;
    const dl=daysLeft(c.contractDeadline);
    return { ...c, dl, tot, don, pct:tot?Math.min(100,don/tot*100):0 };
  }).filter(c=>c.contractDeadline).sort((a,b)=>(a.dl||999)-(b.dl||999));

  const todayEvents = Object.entries(calEvents).filter(([ds])=>ds===todayStr).flatMap(([,evs])=>evs);
  const weekEvents  = Object.entries(calEvents).filter(([ds])=>ds>=todayStr&&ds<=in7).flatMap(([,evs])=>evs);

  return (
    <div style={{ padding:24, maxWidth:1400 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <h2 style={{ fontSize:14, fontWeight:700, color:TX, flex:1 }}>Acompanhamento</h2>
        <div style={{ display:"flex", background:B2, border:`1px solid ${LN}`, borderRadius:6, overflow:"hidden" }}>
          {[["kanban","Kanban"],["priorities","Prioridades"],["calendar","Calendário"]].map(([v,l]) => (
            <div key={v} onClick={()=>setView(v)}
              style={{ padding:"5px 12px", fontSize:10, fontWeight:700, cursor:"pointer", color:view===v?TX:TX2, background:view===v?B3:"transparent", transition:"all .1s" }}>{l}</div>
          ))}
        </div>
      </div>

      {/* Kanban */}
      {view==="kanban" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {/* Planned */}
          <div style={{ background:B1, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:AMB }}/>
              <span style={{ fontSize:11, fontWeight:700, color:TX }}>Planejado</span>
              <span style={{ marginLeft:"auto", fontSize:9, background:"rgba(255,255,255,.06)", color:TX2, padding:"1px 6px", borderRadius:99 }}>{planned.length}</span>
            </div>
            <div style={{ padding:10, display:"flex", flexDirection:"column", gap:6 }}>
              {planned.map(p=>{
                const c=contracts.find(x=>x.id===p.contractId);
                const TYPE_LABEL={post:"Reel",story:"Story",link:"Link",repost:"Repost",tiktok:"TikTok"};
                return (
                  <div key={p.id} style={{ background:B2, border:`1px solid ${LN}`, borderRadius:7, padding:"10px 12px" }}>
                    <div style={{ fontSize:12, fontWeight:500, color:TX, marginBottom:5 }}>{p.title}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {c&&<><div style={{width:5,height:5,borderRadius:"50%",background:c.color}}/><span style={{fontSize:10,color:TX2}}>{c.company.split("/")[0].trim()}</span></>}
                      <Badge color={AMB}>{TYPE_LABEL[p.type]||p.type}</Badge>
                      {p.plannedDate&&<span style={{fontSize:10,color:TX2,marginLeft:"auto"}}>{fmtDate(p.plannedDate)}</span>}
                    </div>
                  </div>
                );
              })}
              {planned.length===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic",padding:8,textAlign:"center"}}>Nenhum post planejado</div>}
            </div>
          </div>
          {/* Published */}
          <div style={{ background:B1, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", gap:6 }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:GRN }}/>
              <span style={{ fontSize:11, fontWeight:700, color:TX }}>Publicado</span>
              <span style={{ marginLeft:"auto", fontSize:9, background:"rgba(255,255,255,.06)", color:TX2, padding:"1px 6px", borderRadius:99 }}>{published.length}</span>
            </div>
            <div style={{ padding:10, display:"flex", flexDirection:"column", gap:6 }}>
              {published.map(p=>{
                const c=contracts.find(x=>x.id===p.contractId);
                const TYPE_LABEL={post:"Reel",story:"Story",link:"Link",repost:"Repost",tiktok:"TikTok"};
                const eng=calcEngagement(p);
                return (
                  <div key={p.id} style={{ background:B2, border:`1px solid ${LN}`, borderRadius:7, padding:"10px 12px" }}>
                    <div style={{ fontSize:12, fontWeight:500, color:TX, marginBottom:5 }}>{p.title}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                      {c&&<><div style={{width:5,height:5,borderRadius:"50%",background:c.color}}/><span style={{fontSize:10,color:TX2}}>{c.company.split("/")[0].trim()}</span></>}
                      <Badge color={GRN}>{TYPE_LABEL[p.type]||p.type}</Badge>
                      {eng!=null&&<span style={{fontSize:10,color:GRN,marginLeft:"auto",fontWeight:700}}>{eng.toFixed(1)}%</span>}
                    </div>
                  </div>
                );
              })}
              {published.length===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic",padding:8,textAlign:"center"}}>Nenhum post publicado</div>}
            </div>
          </div>
        </div>
      )}

      {/* Priorities */}
      {view==="priorities" && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          {/* Today */}
          <div style={{ background:B1, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${LN}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:TX }}>Hoje</div>
              <div style={{ fontSize:10, color:TX2, marginTop:2 }}>{today.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}</div>
            </div>
            <div style={{ padding:12, display:"flex", flexDirection:"column", gap:6 }}>
              {todayEvents.length===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic",textAlign:"center",padding:8}}>Nenhum evento hoje</div>}
              {todayEvents.map((ev,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"8px 10px", borderRadius:7, background:B2, borderLeft:`3px solid ${ev.color}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:TX }}>{ev.label}</div>
                  </div>
                  {ev.dashed&&<Badge color={TX2}>Fase</Badge>}
                </div>
              ))}
            </div>
          </div>
          {/* Week */}
          <div style={{ background:B1, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${LN}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:TX }}>Próximos 7 dias</div>
              <div style={{ fontSize:10, color:TX2, marginTop:2 }}>{weekEvents.length} eventos agendados</div>
            </div>
            <div style={{ padding:12, display:"flex", flexDirection:"column", gap:4 }}>
              {weekEvents.length===0&&<div style={{fontSize:11,color:TX3,fontStyle:"italic",textAlign:"center",padding:8}}>Nenhum evento esta semana</div>}
              {weekEvents.slice(0,8).map((ev,i)=>(
                <div key={i} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, background:B2, borderLeft:`3px solid ${ev.color}` }}>
                  <div style={{ fontSize:11, color:TX }}>{ev.label}</div>
                </div>
              ))}
            </div>
          </div>
          {/* Contract priorities */}
          <div style={{ gridColumn:"1/-1", background:B1, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px", borderBottom:`1px solid ${LN}` }}>
              <div style={{ fontSize:11, fontWeight:700, color:TX }}>Contratos por prazo</div>
            </div>
            <div style={{ padding:12, display:"flex", flexDirection:"column", gap:6 }}>
              {priorities.map(c=>(
                <div key={c.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:8, background:B2 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:c.color, flexShrink:0 }}/>
                  <div style={{ fontSize:12, fontWeight:600, color:TX, width:160 }}>{c.company}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ height:3, background:"rgba(255,255,255,.08)", borderRadius:2 }}>
                      <div style={{ height:3, background:c.pct===100?GRN:c.color, width:`${c.pct}%`, borderRadius:2 }}/>
                    </div>
                    <div style={{ fontSize:10, color:TX2, marginTop:3 }}>{c.don}/{c.tot} entregas</div>
                  </div>
                  <div style={{ fontSize:12, fontWeight:700, color:dlColor(c.dl), width:60, textAlign:"right" }}>{c.dl!=null?`${c.dl}d`:"—"}</div>
                  <div style={{ fontSize:11, color:TX2, width:90 }}>{fmtDate(c.contractDeadline)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Calendar */}
      {view==="calendar" && (
        <CalendarView contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>
      )}
    </div>
  );
}


// ─── Contratos full view ──────────────────────────────────
function Contratos({ contracts, posts, saveC, setModal, toggleComm, saveNote, rates }) {
  const del = async id => { if(confirm("Excluir?")) await saveC(contracts.filter(c=>c.id!==id)); };
  return (
    <div style={{ padding:24, maxWidth:1400 }}>
      <div style={{ border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ display:"grid", gridTemplateColumns:"3px 1fr 130px 100px 160px 100px 80px 80px 80px 100px 60px", background:B2, borderBottom:`1px solid ${LN}`, padding:"8px 0" }}>
          {["","Empresa","Valor","Prazo","Pagamento","Prog.","Posts","Stories","Links","Comissão",""].map((h,i)=>(
            <div key={i} style={{ padding:"0 10px", fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3 }}>{h}</div>
          ))}
        </div>
        {contracts.map(c=>{
          const cp=posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
          const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
          const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link").length;
          const total=contractTotal(c); const dl=daysLeft(c.contractDeadline);
          const tot=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
          const don=cp+cs+cl;
          return (
            <div key={c.id} style={{ display:"grid", gridTemplateColumns:"3px 1fr 130px 100px 160px 100px 80px 80px 80px 100px 60px", alignItems:"center", borderBottom:`1px solid ${LN}`, fontSize:12 }}
              onMouseEnter={e=>e.currentTarget.style.background=B1}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{ background:c.color, alignSelf:"stretch", minHeight:44 }}/>
              <div style={{ padding:"10px", display:"flex", alignItems:"center", gap:6 }}>
                <span style={{ fontWeight:600, color:TX }}>{c.company}</span>
                {currBadge(c.currency)}
                {c.paymentType==="monthly"&&<Badge color={TX2}>M</Badge>}
                {total===0&&<Badge color={TX3}>TBD</Badge>}
              </div>
              <div style={{ padding:"0 10px", fontWeight:700, color:TX }}>{total>0?fmtMoney(total,c.currency):"—"}</div>
              <div style={{ padding:"0 10px", color:dlColor(dl), fontWeight:dl!=null&&dl<=14?700:400 }}>{fmtDate(c.contractDeadline)}</div>
              <div style={{ padding:"0 10px", fontSize:11, color:TX2 }}>
                {c.paymentType==="monthly"&&`${fmtMoney(c.monthlyValue)}/mês`}
                {c.paymentType==="split"&&`${getInstallments(c).length} parcelas`}
                {c.paymentType==="single"&&fmtDate(c.paymentDeadline)}
              </div>
              <div style={{ padding:"0 10px" }}>
                <div style={{ height:2, background:"rgba(255,255,255,.08)", borderRadius:2, marginBottom:3 }}>
                  <div style={{ height:2, background:tot&&don/tot===1?GRN:c.color, width:`${tot?Math.min(100,don/tot*100):0}%`, borderRadius:2 }}/>
                </div>
                <div style={{ fontSize:9, color:TX3 }}>{don}/{tot}</div>
              </div>
              <div style={{ padding:"0 10px", color:TX2 }}>{cp}/{c.numPosts}</div>
              <div style={{ padding:"0 10px", color:TX2 }}>{cs}/{c.numStories}</div>
              <div style={{ padding:"0 10px", color:TX2 }}>{cl}/{c.numCommunityLinks}</div>
              <div style={{ padding:"0 10px" }}>
                <CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)}/>
                {c.hasCommission&&total>0&&<div style={{fontSize:9,color:RED,marginTop:2}}>{fmtMoney(total*COMM_RATE,c.currency)}</div>}
              </div>
              <div style={{ padding:"0 8px", display:"flex", gap:4 }}>
                <Btn onClick={()=>setModal({type:"contract",data:c})} variant="ghost" size="sm">✎</Btn>
                <Btn onClick={()=>del(c.id)} variant="ghost" size="sm" style={{color:RED}}>×</Btn>
              </div>
            </div>
          );
        })}
        {contracts.length===0&&<div style={{padding:48,textAlign:"center",color:TX3}}>Nenhum contrato. Clique em + Contrato para começar.</div>}
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
              onMouseEnter={e=>e.currentTarget.style.background=B1}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
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
    if(isEdit) await saveC(contracts.map(c=>c.id===entry.id?entry:c));
    else await saveC([...contracts,entry]);
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


// ─── App Root ─────────────────────────────────────────────
export default function App() {
  const [user, setUser]     = useState(undefined); // undefined=loading
  const [view, setView]     = useState("dashboard");
  const [contracts, setC]   = useState([]);
  const [posts, setP]       = useState([]);
  const [modal, setModal]   = useState(null);
  const [eurRate, setEurRate] = useState(0);
  const [usdRate, setUsdRate] = useState(0);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [calMonth, setCal]  = useState(() => { const n=new Date(); return {y:n.getFullYear(),m:n.getMonth()}; });
  const [calFilter, setCalF] = useState("all");
  const [newTaskOpener, setNewTaskOpener] = useState(null);
  const prevCIds = useRef([]); const prevPIds = useRef([]);

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
        const [cs,ps,eur,usd]=await Promise.all([loadContracts(),loadPosts(),getSetting("eurRate"),getSetting("usdRate")]);
        const ic=cs.length>0?cs:SEED; const ip=ps.length>0?ps:SEED_POSTS;
        setC(ic); setP(ip);
        prevCIds.current=ic.map(c=>c.id); prevPIds.current=ip.map(p=>p.id);
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
  const rates=useMemo(()=>({eur:eurRate,usd:usdRate}),[eurRate,usdRate]);
  const saveNote=(id,notes)=>saveC(contracts.map(c=>c.id===id?{...c,notes}:c));
  const toggleComm=id=>saveC(contracts.map(c=>c.id===id?{...c,hasCommission:!c.hasCommission}:c));
  const toggleCommPaid=(cid,key)=>saveC(contracts.map(c=>{if(c.id!==cid)return c;const cp={...(c.commPaid||{})};cp[key]=!cp[key];return{...c,commPaid:cp};}));
  const toggleNF=(cid,key)=>saveC(contracts.map(c=>{if(c.id!==cid)return c;const nf={...(c.nfEmitted||{})};nf[key]=!nf[key];return{...c,nfEmitted:nf};}));

  const stats=useMemo(()=>{
    const totalBRL=contracts.reduce((s,c)=>s+toBRL(contractTotal(c),c.currency,rates),0);
    const commBRL=contracts.filter(c=>c.hasCommission).reduce((s,c)=>s+toBRL(contractTotal(c)*COMM_RATE,c.currency,rates),0);
    const totEur=contracts.filter(c=>c.currency==="EUR").reduce((s,c)=>s+contractTotal(c),0);
    const totUsd=contracts.filter(c=>c.currency==="USD").reduce((s,c)=>s+contractTotal(c),0);
    let commPaid=0,commPend=0;
    contracts.forEach(c=>{if(!c.hasCommission)return;getCommEntries(c).forEach(e=>{const v=toBRL(e.amount,c.currency,rates);e.isPaid?commPaid+=v:commPend+=v;});});
    const tot=k=>contracts.reduce((s,c)=>s+c[k],0);
    const del=t=>posts.filter(p=>p.type===t).length;
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
    posts.forEach(p=>{const c=contracts.find(x=>x.id===p.contractId);if(!c)return;if(calFilter!=="all"&&calFilter!==c.id)return;add(p.isPosted?(p.publishDate||p.plannedDate):p.plannedDate,{label:(p.isPosted?"":"📅 ")+p.title,color:c.color});});
    try{const cronos=JSON.parse(localStorage.getItem("copa6_cron")||"{}");Object.entries(cronos).forEach(([cid,ms])=>{const c=contracts.find(x=>x.id===cid);if(!c)return;if(calFilter!=="all"&&calFilter!==c.id)return;(ms||[]).forEach(m=>{if(m.date&&m.fase)add(m.date,{label:`${m.fase}${m.resp?` · ${m.resp}`:""}`,color:c.color,dashed:true});});});}catch{}
    return ev;
  },[contracts,posts,calFilter]);

  // Loading
  if (user===undefined) {
    return (
      <div style={{ minHeight:"100vh", background:"#F7F6EF", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"Plus Jakarta Sans,system-ui,sans-serif" }}>
        <div style={{ fontSize:11, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:TX3 }}>COPA<span style={{color:RED}}>2026</span>·OPS</div>
      </div>
    );
  }

  // Login
  if (!user) return <ToastProvider><LoginPage/></ToastProvider>;

  // App
  return (
    <ToastProvider>
      <div style={{ display:"flex", minHeight:"100vh", background:B0, fontFamily:"Plus Jakarta Sans,system-ui,sans-serif", fontSize:13, color:TX }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'); *{box-sizing:border-box;margin:0;padding:0;font-family:'Plus Jakarta Sans',system-ui,sans-serif} input[type=date]::-webkit-calendar-picker-indicator{opacity:.5} select option{background:#F7F6EF;color:#1E2140} ::-webkit-scrollbar{width:5px;height:5px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(0,0,0,.12);border-radius:3px} ::placeholder{color:#A8B0C8} a{color:${RED}} `}</style>
        <Sidebar view={view} setView={setView} user={user} onSignOut={()=>signOut(auth)} onlineUsers={onlineUsers} contracts={contracts}/>
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <TopBar view={view} eurRate={eurRate} usdRate={usdRate} setEurRate={setEurRate} setUsdRate={setUsdRate}
            onNewContract={()=>setModal({type:"contract",data:null})}
            onNewPost={()=>setModal({type:"post",data:null})}
            onNewTask={()=>newTaskOpener?.()}
            syncStatus={syncStatus}/>
          <div style={{ flex:1, overflowY:"auto" }}>
            {view==="dashboard"      && <Dashboard contracts={contracts} posts={posts} stats={stats} rates={rates} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} setModal={setModal}/>}
            {view==="acompanhamento" && <Acompanhamento contracts={contracts} posts={posts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>}
            {view==="contratos"      && <Contratos contracts={contracts} posts={posts} saveC={saveC} setModal={setModal} toggleComm={toggleComm} saveNote={saveNote} rates={rates}/>}
            {view==="tarefas"        && <Tarefas contracts={contracts} setNewTaskOpener={setNewTaskOpener}/>}
            {view==="posts"          && <Posts contracts={contracts} posts={posts} saveP={saveP} setModal={setModal}/>}
            {view==="calendario"     && <Calendario contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>}
          </div>
        </div>
        {modal && (
          <div>
            {modal.type==="contract"&&<ContractModal modal={modal} setModal={setModal} contracts={contracts} saveC={saveC}/>}
            {modal.type==="post"    &&<PostModal modal={modal} setModal={setModal} contracts={contracts} posts={posts} saveP={saveP}/>}
          </div>
        )}
      </div>
    </ToastProvider>
  );
}

