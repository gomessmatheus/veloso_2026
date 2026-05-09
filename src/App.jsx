import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import {
  loadContracts, syncContracts, loadPosts, syncPosts,
  loadDeliverables, syncDeliverables,
  loadCaixaTx, syncCaixaTx,
  getSetting, setSetting, subscribeToChanges,
  updatePresence, removePresence, subscribeToPresence, getMyPresence,
  getUserRole, deleteItem,
} from "./db.js";
import { format, eachDayOfInterval, endOfMonth, endOfWeek, getDay, isEqual, isSameDay, isSameMonth, isToday, parse, startOfToday, startOfWeek, add } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LayoutDashboard, FileText, CheckSquare, Video, Calendar, ChevronLeft, ChevronRight, Plus, X, LogOut, Search, AlertCircle, Clock, CheckCircle2, Circle, Minus, Zap, ArrowUp, ArrowDown, Filter, KanbanSquare, CalendarDays, ChevronDown, ChevronUp, MoreHorizontal, Banknote, Landmark } from "lucide-react";

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

// ─── Role system ──────────────────────────────────────────
const USER_ROLES = {
  "lucas.veloso4001@gmail.com": "influencer",
  "caio@rnkd.com.br":           "agente",
  "matheus@rnkd.com.br":        "atendimento",
  "beatriz@rnkd.com.br":        "atendimento",
  "thiago@rnkd.com.br":         "agente",
  "matheussgbf@gmail.com":      "admin",
};
const ROLE_NAMES = {
  "lucas.veloso4001@gmail.com": "Lucas",
  "caio@rnkd.com.br":           "Caio",
  "matheus@rnkd.com.br":        "Matheus",
  "beatriz@rnkd.com.br":        "Beatriz",
  "thiago@rnkd.com.br":         "Thiago",
  "matheussgbf@gmail.com":      "Matheus",
};
const ROLE_META = {
  admin:       { label:"Admin",          color:RED,       badge:"👑" },
  agente:      { label:"Agente Ranked",  color:"#7C3AED", badge:"📊" },
  atendimento: { label:"Atendimento",    color:"#2563EB", badge:"🤝" },
  influencer:  { label:"Influenciador",  color:"#059669", badge:"🎬" },
};
const ROLE_NAV = {
  admin:       ["dashboard","acompanhamento","contratos","financeiro","caixa"],
  agente:      ["dashboard","contratos","financeiro"],
  atendimento: ["dashboard","acompanhamento","contratos"],
  influencer:  ["dashboard","acompanhamento","financeiro"],
};
const ROLE_CAN = {
  admin:       { editContracts:true,  seeValues:true,  seeCaixa:true,   editDeliverables:true, seeRoteiros:true,  seeFullFinanceiro:true  },
  agente:      { editContracts:true,  seeValues:true,  seeCaixa:false,  editDeliverables:false,seeRoteiros:false, seeFullFinanceiro:true  },
  atendimento: { editContracts:false, seeValues:false, seeCaixa:false,  editDeliverables:true, seeRoteiros:true,  seeFullFinanceiro:false },
  influencer:  { editContracts:false, seeValues:false, seeCaixa:false,  editDeliverables:true, seeRoteiros:true,  seeFullFinanceiro:false },
};
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
// ─── Production rules ────────────────────────────────────
// Min 9 dias entre briefing e postagem
const STAGES = [
  { id:"briefing",    label:"Briefing",    days:-9, resp:"Marca → Matheus", minDays:2, rule:"Marca envia briefing"                          },
  { id:"roteiro",     label:"Roteiro",     days:-7, resp:"Lucas",           minDays:2, rule:"Mín. 2 dias para roteirizar"                    },
  { id:"ap_roteiro",  label:"Ap. Roteiro", days:-5, resp:"Marca",           minDays:1, rule:"1 dia para marca aprovar o roteiro"              },
  { id:"gravacao",    label:"Gravação",    days:-4, resp:"Lucas",           minDays:1, rule:"Gravação 1 dia após aprovação do roteiro"        },
  { id:"edicao",      label:"Edição",      days:-2, resp:"Leandro",         minDays:2, rule:"Mín. 2 dias entre gravação e envio para edição" },
  { id:"ap_final",    label:"Ap. Final",   days:-1, resp:"Marca",           minDays:1, rule:"1 dia para aprovação final"                     },
  { id:"postagem",    label:"Postagem",    days:0,  resp:"Lucas",           minDays:0, rule:"Post vai ao ar"                                 },
  { id:"done",        label:"✓ Entregue",  days:0,  resp:"",                minDays:0, rule:""                                               },
];

// Regras de produção — exportadas para capacidade e agentes
const PRODUCTION_RULES = {
  minDaysTotal: 9,
  roteiro:     2,
  gravacao:    1,
  edicao:      2,
  bottleneck: "Lucas",
  lucasDaysPerDeliverable: 3,
  maxPubliPerWeek:   3,   // máximo absoluto de publis por semana
  idealPubliPerWeek: 2,   // ideal para não poluir o feed
  maxPerWeek: 2,
};

// Valida se um entregável respeita as regras
function validateDeliverable(d) {
  if (!d?.plannedPostDate) return [];
  const warnings = [];
  STAGES.filter(s => s.minDays > 0 && s.id !== "postagem" && s.id !== "done").forEach(s => {
    const deadline = d.stageDateOverrides?.[s.id] || addDays(d.plannedPostDate, s.days);
    if (!deadline) return;
    const prev = STAGES[STAGES.findIndex(x=>x.id===s.id) - 1];
    if (!prev) return;
    const prevDeadline = d.stageDateOverrides?.[prev.id] || addDays(d.plannedPostDate, prev.days);
    if (!prevDeadline) return;
    const gap = Math.round((new Date(deadline) - new Date(prevDeadline)) / 86400000);
    if (gap < s.minDays) {
      warnings.push({ stage: s.id, label: s.label, got: gap, need: s.minDays, rule: s.rule });
    }
  });
  return warnings;
}

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
  STAGES.forEach(s => { dates[s.id] = addDays(postDate, s.days); });
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

// ─── Slot Calculator (para agentes) ──────────────────────
function calcAvailableSlots(deliverables, contracts, weeksAhead = 8) {
  const today = new Date();
  const slots = [];
  for (let w = 0; w < weeksAhead; w++) {
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() + w * 7);
    const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);

    const weekDels = deliverables.filter(d => {
      if (!d.plannedPostDate || d.stage === "done") return false;
      const ds = new Date(d.plannedPostDate);
      const diff = Math.round((ds - weekStart) / 86400000);
      return diff >= 0 && diff < 7;
    });

    // All deliverables linked to contracts = publis (reels + TikToks that are feed posts)
    const publiDels = weekDels.filter(d => d.contractId && (d.type==="reel"||d.type==="tiktok"||d.type==="post"));
    const publiCount = publiDels.length;

    // Travel days
    let travelDays = 0;
    contracts.forEach(c => {
      if (!c.hasTravel || !c.travelDates?.length) return;
      c.travelDates.filter(td => td.date).forEach(td => {
        const tdDate = new Date(td.date);
        const diff = Math.round((tdDate - weekStart) / 86400000);
        if (diff >= 0 && diff < 7) travelDays++;
      });
    });

    const lucasAvailable = Math.max(0, 5 - travelDays);
    const lucasUsed = weekDels.length * PRODUCTION_RULES.lucasDaysPerDeliverable;
    const lucasRemaining = Math.max(0, Math.floor((lucasAvailable - lucasUsed) / PRODUCTION_RULES.lucasDaysPerDeliverable));

    // Publi slots remaining — this is the real bottleneck
    const publiSlotsRemaining = Math.max(0, PRODUCTION_RULES.maxPubliPerWeek - publiCount);
    const publiOverIdeal = publiCount > PRODUCTION_RULES.idealPubliPerWeek;
    const publiOverMax   = publiCount >= PRODUCTION_RULES.maxPubliPerWeek;

    // Status based on publi count (primary constraint)
    let status = "ok";
    if (publiOverMax || lucasRemaining === 0) status = "full";
    else if (publiOverIdeal || lucasRemaining <= 1) status = "tight";

    slots.push({
      weekStart: weekStart.toISOString().substr(0, 10),
      weekEnd:   weekEnd.toISOString().substr(0, 10),
      label: weekStart.toLocaleDateString("pt-BR", { day:"numeric", month:"short" }),
      scheduled: weekDels.length,
      publiCount, publiSlotsRemaining, publiOverIdeal, publiOverMax,
      lucasAvailable, lucasUsed, lucasRemaining: Math.min(lucasRemaining, publiSlotsRemaining),
      travelDays,
      status,
      deliverables: publiDels.map(d => d.title),
    });
  }
  return slots;
}



// ─── CSS ──────────────────────────────────────────────────
const G  = { background:B1, border:`1px solid ${LN}`, borderRadius:12, boxShadow:"0 1px 3px rgba(0,0,0,0.04), 0 4px 20px rgba(0,0,0,0.06)" };
const GHV= { background:B2, border:`1px solid ${LN2}`, borderRadius:12, boxShadow:"0 4px 24px rgba(0,0,0,0.1)" };
const G2 = { background:B2, border:`1px solid ${LN}`, borderRadius:10 };
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

// ─── Rich Text Editor ─────────────────────────────────────
function exportRoteiro(html, title) {
  const plain = html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const w = window.open("","_blank");
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/>
<title>Roteiro — ${title||"Entregável"}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Helvetica Neue',Arial,sans-serif;font-size:15px;line-height:1.9;color:#111;max-width:720px;margin:0 auto;padding:48px 40px}
  h1{font-size:22px;font-weight:700;margin-bottom:32px;padding-bottom:12px;border-bottom:2px solid #C8102E;letter-spacing:-.01em}
  .roteiro{font-size:15px;line-height:1.9}
  .footer{margin-top:48px;padding-top:16px;border-top:1px solid #eee;font-size:11px;color:#999;display:flex;justify-content:space-between}
  @media print{body{padding:24px}button{display:none!important}}
</style></head><body>
<h1>✍️ ${title||"Roteiro"}</h1>
<button onclick="window.print()" style="position:fixed;top:16px;right:16px;padding:8px 20px;background:#C8102E;color:white;border:none;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Imprimir / PDF</button>
<button onclick="navigator.clipboard.writeText(document.querySelector('.roteiro').innerText)" style="position:fixed;top:16px;right:140px;padding:8px 20px;background:#f5f5f5;color:#333;border:1px solid #ddd;border-radius:6px;font-size:13px;font-weight:700;cursor:pointer">📋 Copiar texto</button>
<div class="roteiro">${html||"<em>Roteiro em branco.</em>"}</div>
<div class="footer">
  <span>ENTREGAS · @veloso.lucas_ · Ranked</span>
  <span>${new Date().toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"})}</span>
</div>
</body></html>`);
  w.document.close();
}

function RichTextEditor({ value, onChange, onAutoSave, title, minHeight = 440 }) {
  const editorRef   = useRef(null);
  const floatRef    = useRef(null);
  const autoTimer   = useRef(null);
  const [fmt, setFmt]           = useState({});
  const [floatPos, setFloatPos] = useState(null);
  const [savedAt, setSavedAt]   = useState(null);
  const isComposing = useRef(false);

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = value || "";
  // eslint-disable-next-line
  }, []);

  const exec = (cmd, val = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
    syncFormats();
  };
  const syncFormats = () => setFmt({
    bold:      document.queryCommandState("bold"),
    italic:    document.queryCommandState("italic"),
    underline: document.queryCommandState("underline"),
    strike:    document.queryCommandState("strikeThrough"),
  });

  // Auto-save with debounce
  const triggerAutoSave = (html) => {
    if (!onAutoSave) return;
    clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      onAutoSave(html);
      setSavedAt(new Date());
    }, 1500);
  };

  const handleInput = () => {
    if (!isComposing.current) {
      const html = editorRef.current?.innerHTML || "";
      onChange(html);
      syncFormats();
      triggerAutoSave(html);
    }
  };

  // Floating toolbar — uses fixed coords so it escapes the modal
  const checkSelection = useCallback(() => {
    syncFormats();
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorRef.current?.contains(sel.anchorNode)) {
      setFloatPos(null); return;
    }
    try {
      const range = sel.getRangeAt(0);
      const rect  = range.getBoundingClientRect();
      if (rect.width === 0) { setFloatPos(null); return; }
      const W    = 310;
      let left   = rect.left + rect.width / 2 - W / 2;
      left       = Math.max(8, Math.min(left, window.innerWidth - W - 8));
      const top  = rect.top - 56;
      setFloatPos({ top: top < 8 ? rect.bottom + 8 : top, left, above: top >= 8 });
    } catch { setFloatPos(null); }
  }, []);

  useEffect(() => {
    const hide = (e) => {
      if (floatRef.current && !floatRef.current.contains(e.target)) setFloatPos(null);
    };
    document.addEventListener("mousedown", hide);
    return () => document.removeEventListener("mousedown", hide);
  }, []);

  const insertSection = (label) => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false,
      `<p style="font-weight:700;color:#C8102E;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin:20px 0 2px">${label}</p><p><br></p>`
    );
    const html = editorRef.current?.innerHTML || "";
    onChange(html); triggerAutoSave(html);
  };

  const SECTIONS = ["Abertura","Campinho","Bloco Publi","Desenvolvimento","CTA","Encerramento"];
  const FLOAT_COLORS = [
    "#000000","#C8102E","#2563EB","#16A34A","#D97706","#7C3AED","#EA580C","#BE185D","#374151","#FFFFFF",
  ];
  const FLOAT_HLS = ["#FEF08A","#BBF7D0","#BFDBFE","#FCA5A5","#DDD6FE","#FED7AA"];

  const Tb = ({cmd,children,active,onDown,ttl,w=26,fs=13,fw=600}) => (
    <button title={ttl} onMouseDown={e=>{e.preventDefault();onDown?onDown():exec(cmd);}}
      style={{width:w,height:26,border:"none",background:active?`${RED}14`:"transparent",color:active?RED:TX2,borderRadius:4,cursor:"pointer",fontSize:fs,fontWeight:fw,display:"flex",alignItems:"center",justifyContent:"center",transition:"all .12s"}}>
      {children}
    </button>
  );

  const charCount = (value||"").replace(/<[^>]*>/g,"").trim().length;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"100%"}}>

      {/* ── Floating selection toolbar (fixed, escapes modal) ── */}
      {floatPos && (
        <div ref={floatRef} style={{
          position:"fixed", top:floatPos.top, left:floatPos.left,
          zIndex:9999, width:310,
          background:"#18181B", borderRadius:10,
          boxShadow:"0 8px 32px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.24)",
          display:"flex", alignItems:"center", gap:2, padding:"5px 8px",
          animation:"floatIn .12s ease",
        }}>
          {/* B I U S */}
          {[
            {cmd:"bold",      ch:"B",  a:fmt.bold,      fw:700,fs:13},
            {cmd:"italic",    ch:"I",  a:fmt.italic,    fw:400,fs:13,it:true},
            {cmd:"underline", ch:"U",  a:fmt.underline, fw:600,fs:12,ul:true},
            {cmd:"strikeThrough",ch:"S",a:fmt.strike,  fw:600,fs:12,st:true},
          ].map(({cmd,ch,a,fw,fs,it,ul,st})=>(
            <button key={cmd} onMouseDown={e=>{e.preventDefault();exec(cmd);}}
              style={{width:26,height:26,border:"none",borderRadius:4,background:a?"rgba(200,16,46,.28)":"transparent",color:a?RED:"#D4D4D8",cursor:"pointer",fontSize:fs,fontWeight:fw,fontStyle:it?"italic":"normal",textDecoration:ul?"underline":st?"line-through":"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
              {ch}
            </button>
          ))}

          <div style={{width:1,height:16,background:"rgba(255,255,255,.12)",margin:"0 3px"}}/>

          {/* Size */}
          <select defaultValue="3" onMouseDown={e=>e.stopPropagation()}
            onChange={e=>{exec("fontSize",e.target.value);editorRef.current?.focus();}}
            style={{height:24,padding:"0 4px",fontSize:10,background:"transparent",border:"1px solid rgba(255,255,255,.18)",borderRadius:4,color:"#D4D4D8",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
            {[["2","P"],["3","M"],["4","G"],["5","T"]].map(([v,l])=><option key={v} value={v} style={{color:TX,background:B1}}>{l}</option>)}
          </select>

          <div style={{width:1,height:16,background:"rgba(255,255,255,.12)",margin:"0 3px"}}/>

          {/* Text colors */}
          <div style={{display:"flex",flexWrap:"wrap",gap:2,width:54}}>
            {FLOAT_COLORS.map(c=>(
              <div key={c} onMouseDown={e=>{e.preventDefault();exec("foreColor",c);}}
                style={{width:14,height:14,borderRadius:"50%",background:c,border:`1.5px solid rgba(255,255,255,.25)`,cursor:"pointer"}}/>
            ))}
          </div>

          <div style={{width:1,height:16,background:"rgba(255,255,255,.12)",margin:"0 3px"}}/>

          {/* Highlights */}
          {FLOAT_HLS.map((c,i)=>(
            <div key={i} onMouseDown={e=>{e.preventDefault();exec("backColor",c);}}
              style={{width:14,height:14,borderRadius:3,background:c,border:"1px solid rgba(0,0,0,.12)",cursor:"pointer"}}/>
          ))}

          <div style={{width:1,height:16,background:"rgba(255,255,255,.12)",margin:"0 3px"}}/>

          <button onMouseDown={e=>{e.preventDefault();exec("removeFormat");exec("backColor","#FFFFFF");setFloatPos(null);}}
            title="Limpar formatação"
            style={{width:24,height:24,border:"none",borderRadius:4,background:"transparent",color:"#71717A",cursor:"pointer",fontSize:12,display:"flex",alignItems:"center",justifyContent:"center"}}>
            ✕
          </button>

          {/* Arrow */}
          {floatPos.above && <div style={{position:"absolute",bottom:-5,left:"50%",transform:"translateX(-50%)",width:10,height:6,clipPath:"polygon(0 0,100% 0,50% 100%)",background:"#18181B"}}/>}
        </div>
      )}
      <style>{`@keyframes floatIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}`}</style>

      {/* ── Static toolbar (clean) ── */}
      <div style={{display:"flex",alignItems:"center",gap:2,padding:"6px 12px",borderBottom:`1px solid ${LN}`,background:B1}}>
        <Tb cmd="bold"          active={fmt.bold}      ttl="Negrito · Ctrl+B"    fw={700} fs={13}>B</Tb>
        <Tb cmd="italic"        active={fmt.italic}    ttl="Itálico · Ctrl+I"    fw={400} fs={13}><em>I</em></Tb>
        <Tb cmd="underline"     active={fmt.underline} ttl="Sublinhado · Ctrl+U"><span style={{textDecoration:"underline",fontSize:12}}>U</span></Tb>
        <Tb cmd="strikeThrough" active={fmt.strike}    ttl="Riscado"><span style={{textDecoration:"line-through",fontSize:12}}>S</span></Tb>
        <div style={{width:1,height:16,background:LN,margin:"0 3px"}}/>
        <select defaultValue="3" onMouseDown={e=>e.stopPropagation()}
          onChange={e=>{exec("fontSize",e.target.value);editorRef.current?.focus();}}
          style={{height:26,padding:"0 6px",fontSize:11,background:"transparent",border:`1px solid ${LN}`,borderRadius:4,color:TX,fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
          <option value="2">Pequeno</option>
          <option value="3">Normal</option>
          <option value="4">Grande</option>
          <option value="5">Título</option>
        </select>
        <div style={{width:1,height:16,background:LN,margin:"0 3px"}}/>
        <Tb ttl="Limpar formatação" onDown={()=>{exec("removeFormat");exec("backColor","#FFFFFF");}} fs={11} fw={500}>✕</Tb>

        {/* Auto-save indicator */}
        <span style={{marginLeft:"auto",fontSize:9,color:savedAt?GRN:TX3,flexShrink:0,display:"flex",alignItems:"center",gap:3}}>
          {savedAt ? <>✓ Salvo {savedAt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</> : `${charCount} car.`}
        </span>

        <button onMouseDown={e=>{e.preventDefault();exportRoteiro(value,title);}}
          style={{marginLeft:8,padding:"3px 10px",height:26,fontSize:10,fontWeight:700,background:`${RED}10`,border:`1px solid ${RED}30`,borderRadius:5,color:RED,cursor:"pointer",display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          ↗ Exportar
        </button>
      </div>

      {/* ── Section chips ── */}
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderBottom:`1px solid ${LN}`,background:B2,flexWrap:"wrap"}}>
        <span style={{fontSize:9,fontWeight:700,color:TX3,textTransform:"uppercase",letterSpacing:".1em",marginRight:4}}>+ Seção</span>
        {SECTIONS.map(s=>(
          <button key={s} onMouseDown={e=>{e.preventDefault();insertSection(s);}}
            style={{fontSize:10,padding:"2px 9px",background:B1,border:`1px solid ${LN}`,borderRadius:99,cursor:"pointer",color:TX2,fontWeight:600,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=RED;e.currentTarget.style.color=RED;e.currentTarget.style.background=`${RED}08`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=LN;e.currentTarget.style.color=TX2;e.currentTarget.style.background=B1;}}>
            {s}
          </button>
        ))}
        <span style={{marginLeft:"auto",fontSize:9,color:TX3}}>Selecione texto para formatar</span>
      </div>

      {/* ── Writing area ── */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onKeyUp={e=>{syncFormats();checkSelection();}}
        onMouseUp={checkSelection}
        onCompositionStart={()=>{isComposing.current=true;}}
        onCompositionEnd={()=>{isComposing.current=false;handleInput();}}
        style={{
          flex:1, minHeight, padding:"24px 28px", outline:"none",
          fontSize:14, lineHeight:1.9, color:TX, background:"#FEFEFE",
          fontFamily:"inherit", wordBreak:"break-word", overflowY:"auto",
        }}
      />
    </div>
  );
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
    {label && <span style={{ fontSize:10, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:on?GRN:TX2 }}>{on?"✓ Comissão Ranked (a pagar)":"Sem comissão"}</span>}
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
  const mob = typeof window !== "undefined" && window.innerWidth < 768;
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,.6)", zIndex:200, display:"flex", alignItems:mob?"flex-end":"flex-start", justifyContent:"center", padding:mob?0:"48px 16px", overflowY:mob?"hidden":"auto", backdropFilter:"blur(4px)" }}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{ background:B1, borderRadius:mob?"20px 20px 0 0":"14px", border:`1px solid ${LN}`, width:"100%", maxWidth:mob?"100%":width, flexShrink:0, maxHeight:mob?"92vh":"none", display:"flex", flexDirection:"column", boxShadow:"0 24px 64px rgba(0,0,0,0.2)" }}>
        {/* Handle indicator on mobile */}
        {mob && <div style={{ width:40, height:4, background:LN2, borderRadius:2, margin:"12px auto 0", flexShrink:0 }}/>}
        <div style={{ padding:mob?"12px 20px 14px":"16px 20px", borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <span style={{ fontSize:11, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:TX }}>{title}</span>
          <button onClick={onClose} style={{ background:"none", border:"none", color:TX2, cursor:"pointer", padding:6, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center" }}><X size={16}/></button>
        </div>
        <div style={{ padding:"20px", overflowY:"auto", flex:1 }}>{children}</div>
        {footer && <div style={{ padding:"14px 20px", borderTop:`1px solid ${LN}`, display:"flex", justifyContent:"flex-end", gap:8, flexShrink:0, background:B2, borderRadius:mob?0:"0 0 14px 14px" }}>{footer}</div>}
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
  { id:"financeiro",     label:"Financeiro",       icon:Banknote },
  { id:"caixa",          label:"Caixa",            icon:Landmark },
];

function Sidebar({ view, setView, user, onSignOut, onInvite, onlineUsers, contracts, role, userName, deliverables }) {
  const my = useMemo(() => getMyPresence(), []);
  const allowedNav = ROLE_NAV[role] || ROLE_NAV.admin;
  const roleMeta = ROLE_META[role] || ROLE_META.admin;
  const today = new Date();
  const isSunday = today.getDay() === 0;

  // WhatsApp weekly summary generator
  const sendWhatsApp = () => {
    const activeContracts = contracts.filter(c=>!c.archived);
    const hour = today.getHours();
    const greet = hour<12?"Bom dia":hour<18?"Boa tarde":"Boa noite";
    const dateStr = today.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"});

    let msg = "";
    if (role==="influencer") {
      const upcoming = (deliverables||[]).filter(d=>d.stage!=="done"&&d.plannedPostDate).sort((a,b)=>a.plannedPostDate.localeCompare(b.plannedPostDate)).slice(0,7);
      const late = (deliverables||[]).filter(d=>d.stage!=="done"&&d.plannedPostDate&&daysLeft(d.plannedPostDate)<0);
      msg = `${greet}, ${userName}! 🎬\n\n📅 *Resumo semanal — ${dateStr}*\n\n`;
      if (late.length) msg += `⚠️ *Atrasados (${late.length}):*\n${late.map(d=>`• ${d.title}`).join("\n")}\n\n`;
      msg += `📋 *Próximas postagens:*\n${upcoming.map(d=>`• ${d.title} → ${fmtDate(d.plannedPostDate)}`).join("\n")||"Nenhuma agendada"}\n\n`;
      msg += `Bora produzir! 💪`;
    } else if (role==="agente") {
      const totalBRL = activeContracts.reduce((s,c)=>s+(Number(c.contractValue)||Number(c.monthlyValue)||0),0);
      msg = `${greet}, ${userName}! 📊\n\n*Resumo semanal Ranked — ${dateStr}*\n\n`;
      msg += `💰 *Contratos ativos:* ${activeContracts.length}\n`;
      msg += `💵 *Volume total:* R$${totalBRL.toLocaleString("pt-BR")}\n\n`;
      const pending = activeContracts.filter(c=>c.contractDeadline&&daysLeft(c.contractDeadline)<=14&&daysLeft(c.contractDeadline)>=0);
      if (pending.length) msg += `⏰ *Vencendo em 14 dias:*\n${pending.map(c=>`• ${c.company} — ${fmtDate(c.contractDeadline)}`).join("\n")}\n\n`;
      msg += `Boa semana! 🚀`;
    } else if (role==="atendimento") {
      const late = (deliverables||[]).filter(d=>d.stage!=="done"&&d.plannedPostDate&&daysLeft(d.plannedPostDate)<0);
      const upcoming = (deliverables||[]).filter(d=>d.stage!=="done"&&d.plannedPostDate&&daysLeft(d.plannedPostDate)>=0&&daysLeft(d.plannedPostDate)<=7);
      msg = `${greet}, ${userName}! 🤝\n\n*Resumo semanal — ${dateStr}*\n\n`;
      if (late.length) msg += `🔴 *Atrasados (${late.length}):*\n${late.slice(0,5).map(d=>`• ${d.title}`).join("\n")}\n\n`;
      msg += `📅 *Entregas esta semana (${upcoming.length}):*\n${upcoming.slice(0,5).map(d=>`• ${d.title} → ${fmtDate(d.plannedPostDate)}`).join("\n")||"Nenhuma"}\n\n`;
      msg += `Boa semana! 💪`;
    } else {
      const totalBRL = activeContracts.reduce((s,c)=>s+(Number(c.contractValue)||Number(c.monthlyValue)||0),0);
      const late = (deliverables||[]).filter(d=>d.stage!=="done"&&d.plannedPostDate&&daysLeft(d.plannedPostDate)<0);
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
          ENTRE<span style={{color:RED}}>GAS</span>
        </div>
        <div style={{ fontSize:10, color:TX3, marginTop:3, letterSpacing:".03em" }}>Ranked</div>
      </div>

      {/* Nav */}
      <nav style={{ padding:"12px 8px", flex:1, overflowY:"auto" }}>
        <div style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX3, padding:"4px 8px", marginBottom:4 }}>Navegação</div>
        {NAV_ITEMS.filter(item => allowedNav.includes(item.id)).map(item => {
          const active = view===item.id;
          return (
            <div key={item.id} onClick={()=>setView(item.id)}
              style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", borderRadius:6, cursor:"pointer", fontSize:12, fontWeight:active?600:400, color:active?TX:TX2, background:active?B3:"transparent", marginBottom:2, transition:"all 0.18s cubic-bezier(0.4,0,0.2,1)", boxShadow:active?"0 1px 3px rgba(0,0,0,0.06)":"none" }}
            onMouseEnter={e=>{ if(!active){e.currentTarget.style.background=B2;e.currentTarget.style.color=TX;}}}
            onMouseLeave={e=>{ if(!active){e.currentTarget.style.background="transparent";e.currentTarget.style.color=TX2;}}}>
              <item.icon size={14} style={{ color:active?RED:TX3, flexShrink:0 }}/>
              {item.label}
            </div>
          );
        })}
      </nav>

      {/* WhatsApp summary button */}
      <div style={{ padding:"8px 8px 0" }}>
        <button onClick={sendWhatsApp}
          style={{ width:"100%", padding:"8px 10px", borderRadius:8, border:`1px solid ${isSunday?"#25D366":"rgba(37,211,102,.3)"}`,
            background:isSunday?"rgba(37,211,102,.12)":"transparent",
            color:isSunday?"#128C7E":TX2, fontSize:11, fontWeight:isSunday?700:500,
            cursor:"pointer", display:"flex", alignItems:"center", gap:7, transition:"all .2s",
            boxShadow:isSunday?"0 0 0 2px rgba(37,211,102,.2)":"none" }}>
          <span style={{fontSize:14}}>📱</span>
          <span>{isSunday?"📤 Enviar resumo da semana":"Resumo WhatsApp"}</span>
        </button>
      </div>

      {/* Online + user */}
      <div style={{ padding:"12px 16px", borderTop:`1px solid ${LN}`, marginTop:8 }}>
        {onlineUsers.length > 0 && (
          <div style={{ display:"flex", alignItems:"center", gap:-4, marginBottom:10 }}>
            {[...onlineUsers.filter(u=>u.sessionId!==my.sessionId), {...my,isMe:true}].slice(0,5).map((u,i) => (
              <div key={u.sessionId||i} title={u.isMe?`${u.name} (você)`:u.name}
                style={{ width:24, height:24, borderRadius:"50%", background:u.color, border:`2px solid ${B0}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#fff", marginLeft:i>0?-8:0, zIndex:10-i, position:"relative" }}>
                {u.name?.charAt(0).toUpperCase()}
                {u.isMe && <div style={{ position:"absolute", bottom:-1, right:-1, width:7, height:7, borderRadius:"50%", background:GRN, border:`1px solid ${B0}` }}/>}
              </div>
            ))}
            <span style={{ fontSize:10, color:TX2, marginLeft:12 }}>{onlineUsers.length} online</span>
          </div>
        )}
        {/* Role badge */}
        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
          <span style={{ fontSize:10 }}>{roleMeta.badge}</span>
          <span style={{ fontSize:10, fontWeight:700, color:roleMeta.color, padding:"1px 7px", borderRadius:99, background:`${roleMeta.color}14` }}>{roleMeta.label}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ fontSize:11, color:TX2, fontWeight:500 }}>{userName || user?.email?.split("@")[0]}</div>
          <div style={{display:"flex",gap:4}}>
            {role==="admin" && <button onClick={onInvite} title="Convidar usuário" style={{background:"none",border:"none",color:TX3,cursor:"pointer",padding:4,fontSize:12}}>👤+</button>}
            <button onClick={onSignOut} style={{ background:"none", border:"none", color:TX3, cursor:"pointer", padding:4 }} title="Sair"><LogOut size={14}/></button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar({ view, eurRate, usdRate, setEurRate, setUsdRate, onNewContract, onNewPost, onNewTask, syncStatus, isMobile, role, userName }) {
  const title = NAV_ITEMS.find(i=>i.id===view)?.label || view;
  const statusColor = { loading:AMB, ok:GRN, error:RED }[syncStatus]||GRN;
  const statusLabel = { loading:"Sincronizando", ok:"Ao Vivo", error:"Offline" }[syncStatus]||"Ao Vivo";
  const roleMeta = ROLE_META[role] || ROLE_META.admin;

  if (isMobile) return (
    <div style={{ height:56, borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", paddingLeft:16, paddingRight:16, gap:10, background:B1, flexShrink:0, position:"sticky", top:0, zIndex:50, boxShadow:"0 1px 8px rgba(0,0,0,0.06)" }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:800, fontSize:13, letterSpacing:".12em", textTransform:"uppercase", color:TX, lineHeight:1 }}>
          ENTRE<span style={{color:RED}}>GAS</span>
        </div>
        {userName && <div style={{ fontSize:10, color:TX3, marginTop:1 }}>{roleMeta.badge} {userName}</div>}
      </div>
      <div style={{ display:"flex", alignItems:"center", gap:6 }}>
        <div style={{ width:6, height:6, borderRadius:"50%", background:syncStatus==="ok"?GRN:syncStatus==="loading"?AMB:RED, flexShrink:0 }}/>
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

function DashKpi({ label, value, sub, accent, icon, small=false }) {
  const isMobile = useIsMobile();
  const [hov, setHov] = useState(false);
  return (
    <div onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ ...(hov?GHV:G), padding:small?"12px 14px":isMobile?"14px 16px":"18px 20px", transition:TRANS, borderRadius:12 }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:small?6:10 }}>
        <div style={{ fontSize:small?8:9, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:TX3, lineHeight:1.3, flex:1 }}>{label}</div>
        {icon && <span style={{ fontSize:14, opacity:.6, flexShrink:0 }}>{icon}</span>}
      </div>
      <div style={{ fontSize:small?16:isMobile?22:26, fontWeight:800, color:accent||TX, lineHeight:1, letterSpacing:"-.02em" }}>{value}</div>
      {sub && <div style={{ fontSize:10, color:TX3, marginTop:6, lineHeight:1.4 }}>{sub}</div>}
    </div>
  );
}

// ─── Production Rules Card (visible to all, highlighted for agentes) ──
function ProductionRulesCard({ deliverables=[], contracts=[] }) {
  const [open, setOpen] = useState(false);
  const slots = useMemo(() => calcAvailableSlots(deliverables, contracts, 6), [deliverables, contracts]);

  const exceptions = useMemo(() => {
    const exc = [];
    deliverables.forEach(d => {
      const warns = validateDeliverable(d);
      if (warns.length) exc.push({ ...d, warnings: warns });
    });
    return exc;
  }, [deliverables]);

  const STATUS_COLOR = { ok:"#16A34A", tight:"#D97706", full:"#C8102E" };
  const STATUS_LABEL = { ok:"Disponível", tight:"Apertado", full:"Cheio" };

  return (
    <div style={{ ...G, padding:"16px 20px", marginBottom:20 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", cursor:"pointer" }} onClick={()=>setOpen(o=>!o)}>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:TX, marginBottom:2 }}>⚙️ Regras de Produção & Slots disponíveis</div>
          <div style={{ fontSize:11, color:TX2 }}>
            Ciclo mínimo: <strong>9 dias</strong> · Roteiro: <strong>2 dias</strong> · Gravação: <strong>1 dia após ap. roteiro</strong> · Edição: <strong>2 dias</strong>
            <span style={{ marginLeft:12, padding:"2px 8px", borderRadius:99, background:`${AMB}14`, color:AMB, fontWeight:700, fontSize:10 }}>
              Publis: ideal 2/sem · máx 3/sem
            </span>
            {exceptions.length > 0 && <span style={{ marginLeft:10, color:RED, fontWeight:700 }}>⚠️ {exceptions.length} exceção{exceptions.length>1?"ões":""}</span>}
          </div>
        </div>
        <span style={{ fontSize:12, color:TX2 }}>{open?"▲":"▼"}</span>
      </div>

      {open && (
        <div style={{ marginTop:16 }}>
          {/* Rules table */}
          <div style={{ ...G2, padding:"12px 16px", marginBottom:14 }}>
            <div style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX2, marginBottom:10 }}>Fluxo de produção obrigatório</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8 }}>
              {STAGES.filter(s=>s.id!=="done"&&s.id!=="postagem").map((s,i) => (
                <div key={s.id} style={{ background:B2, borderRadius:8, padding:"10px 12px", borderTop:`3px solid ${s.minDays>=2?RED:AMB}` }}>
                  <div style={{ fontSize:10, fontWeight:700, color:TX, marginBottom:4 }}>{s.label}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:s.minDays>=2?RED:AMB }}>{s.minDays}d mín.</div>
                  <div style={{ fontSize:9, color:TX2, marginTop:4, lineHeight:1.4 }}>{s.rule}</div>
                  <div style={{ fontSize:9, color:TX3, marginTop:4 }}>→ {s.resp}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Slot calendar */}
          <div style={{ marginBottom:14 }}>
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:10 }}>
              <div style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX2 }}>
                Slots de publi · próximas 6 semanas
              </div>
              <div style={{ display:"flex", gap:10, fontSize:10 }}>
                <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ width:10, height:10, borderRadius:2, background:GRN, display:"inline-block" }}/>● Ideal (≤2/sem)</span>
                <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ width:10, height:10, borderRadius:2, background:AMB, display:"inline-block" }}/>▲ Máximo (3/sem)</span>
                <span style={{ display:"flex", alignItems:"center", gap:4 }}><span style={{ width:10, height:10, borderRadius:2, background:LN, display:"inline-block" }}/>Vazio</span>
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:8 }}>
              {slots.map((s,i) => {
                const sc = { ok:GRN, tight:AMB, full:RED }[s.status];
                return (
                  <div key={i} style={{ background:`${sc}06`, border:`1px solid ${sc}20`, borderRadius:8, padding:"10px 12px" }}>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                      <div style={{ fontSize:10, fontWeight:700, color:TX }}>{s.label}</div>
                      <span style={{ fontSize:8, fontWeight:700, padding:"1px 5px", borderRadius:99, background:`${sc}18`, color:sc }}>
                        {{ok:"✓ OK", tight:"⚠ Atenção", full:"🔴 Cheio"}[s.status]}
                      </span>
                    </div>
                    {/* 3 publi slots visual */}
                    <div style={{ display:"flex", gap:3, marginBottom:6 }}>
                      {[1,2,3].map(n => (
                        <div key={n} style={{
                          flex:1, height:22, borderRadius:4,
                          background: s.publiCount >= n ? (n <= PRODUCTION_RULES.idealPubliPerWeek ? GRN : AMB) : LN,
                          border: `1px solid ${s.publiCount >= n ? (n <= 2 ? GRN+"50" : AMB+"50") : LN2}`,
                          display:"flex", alignItems:"center", justifyContent:"center",
                          fontSize:9, fontWeight:700, color: s.publiCount >= n ? "#fff" : TX3,
                          transition:"all .15s",
                        }}>
                          {n <= 2 ? "●" : "▲"}
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:sc }}>
                      {s.publiCount} publi{s.publiCount!==1?"s":""}
                      {s.lucasRemaining > 0 && <span style={{ fontSize:10, fontWeight:400, color:TX2 }}> · +{s.lucasRemaining} livre{s.lucasRemaining!==1?"s":""}</span>}
                    </div>
                    {s.travelDays > 0 && <div style={{ fontSize:9, color:"#7C3AED", marginTop:3 }}>✈️ {s.travelDays}d viagem</div>}
                    {s.deliverables?.length > 0 && (
                      <div style={{ fontSize:8, color:TX3, marginTop:4, lineHeight:1.4 }}>
                        {s.deliverables.slice(0,2).map((t,i)=><div key={i}>· {t.length>18?t.substr(0,18)+"…":t}</div>)}
                        {s.deliverables.length>2&&<div>+{s.deliverables.length-2} mais</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {slots.some(s=>s.publiOverIdeal) && (
              <div style={{ marginTop:10, padding:"8px 14px", background:`${AMB}08`, border:`1px solid ${AMB}25`, borderRadius:8, fontSize:11 }}>
                ⚠️ <strong style={{color:AMB}}>Semanas com mais de 2 publis</strong> — ideal é máximo 2/semana para não comprometer o feed orgânico.
                {slots.some(s=>s.publiOverMax) && <span style={{color:RED, fontWeight:700}}> Há semanas no limite máximo (3) — não vender mais nessas semanas.</span>}
              </div>
            )}
          </div>

          {/* Exceptions */}
          {exceptions.length > 0 && (
            <div style={{ background:"#FFF1F2", border:"1px solid #FCA5A5", borderRadius:8, padding:"12px 16px" }}>
              <div style={{ fontSize:11, fontWeight:700, color:RED, marginBottom:10 }}>⚠️ Exceções detectadas — prazos abaixo do mínimo</div>
              {exceptions.map((d,i) => (
                <div key={i} style={{ marginBottom:i<exceptions.length-1?10:0, paddingBottom:i<exceptions.length-1?10:0, borderBottom:i<exceptions.length-1?`1px solid #FCA5A5`:"none" }}>
                  <div style={{ fontSize:12, fontWeight:600, color:TX, marginBottom:4 }}>{d.title}</div>
                  {d.warnings.map((w,j) => (
                    <div key={j} style={{ fontSize:11, color:RED, display:"flex", alignItems:"center", gap:6 }}>
                      <span>↳ {w.label}:</span>
                      <span><strong>{w.got}d disponíveis</strong> vs {w.need}d necessários</span>
                      <span style={{ color:TX2 }}>— {w.rule}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
          {exceptions.length === 0 && (
            <div style={{ fontSize:11, color:GRN, fontWeight:600 }}>✓ Nenhuma exceção. Todos os entregáveis respeitam as regras de produção.</div>
          )}
        </div>
      )}
    </div>
  );
}

function Dashboard({ contracts, posts, deliverables:dashDeliverables=[], stats, rates, saveNote, toggleComm, toggleCommPaid, toggleNF, setModal, navigateTo, role="admin", userName="Matheus" }) {
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
      // If already published (has link or date), not late
      if (d.publishedAt || d.postLink) return false;
      // If stage is postagem and plannedPostDate hasn't passed yet by more than 1 day, grace period
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
  const [dismissedAlerts, setDismissedAlerts] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dismissed_alerts")||"[]"); } catch { return []; }
  });
  const dismissAlert = (key) => {
    const next = [...dismissedAlerts, key];
    setDismissedAlerts(next);
    localStorage.setItem("dismissed_alerts", JSON.stringify(next));
  };

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
  // NF and commission moved to Financeiro tab
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
  const roleSubtitle = {
    admin:       "Visão geral · Copa 2026",
    agente:      "Visão comercial · Copa 2026",
    atendimento: "Produção e entregas · Copa 2026",
    influencer:  "Seus próximos conteúdos · Copa 2026",
  }[role] || "Copa 2026";

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
          <h1 style={{ fontSize:isMobile?18:20, fontWeight:700, color:TX, letterSpacing:"-.02em" }}>{greeting}, {userName}! 👋</h1>
          <p style={{ fontSize:12, color:TX2, marginTop:4 }}>{today.toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})} · {roleSubtitle}</p>
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

      {/* KPIs — 4 cards, produção only */}
      <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr 1fr":"repeat(4,1fr)", gap:isMobile?10:12, marginBottom:20 }}>
        <DashKpi label="Entregáveis ativos" value={allDeliverables.filter(d=>d.stage!=="done").length} sub={`${allDeliverables.filter(d=>d.stage==="done").length} concluídos`}/>
        <MonthDeliverables deliverables={allDeliverables} contracts={contracts}/>
        <DashKpi label="Atrasados" value={lateDeliverables.length} sub="no pipeline" accent={lateDeliverables.length>0?RED:GRN}/>
        <DashKpi label="Engajamento" value={stats.avgEng!=null?stats.avgEng.toFixed(2)+"%":"—"} sub="média das publis" accent={stats.avgEng!=null?(stats.avgEng>=3?GRN:stats.avgEng>=1?AMB:TX2):TX2}/>
      </div>

      {/* Production Rules & Slots */}
      <ProductionRulesCard deliverables={allDeliverables} contracts={contracts}/>

      {/* Capacidade de Absorção (AI) */}
      <div style={{ ...G, padding:"16px 20px", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:TX, marginBottom:2 }}>🧠 Capacidade de Absorção</div>
            <div style={{ fontSize:11, color:TX2 }}>Quantos conteúdos cabem com segurança nos próximos 3 meses</div>
          </div>
          <Btn onClick={analyzeCapacity} variant="primary" size="sm" disabled={capLoading} icon={capLoading?null:Zap}>
            {capLoading ? "Analisando…" : capAnalysis ? "Reanalisar" : "Analisar"}
          </Btn>
        </div>
        {capAnalysis?.error && <div style={{ fontSize:11, color:RED, marginTop:10 }}>{capAnalysis.error}</div>}
        {capAnalysis && !capAnalysis.error && (<>
          {capAnalysis.overview && <p style={{ fontSize:12, color:TX2, lineHeight:1.6, marginTop:12, marginBottom:14, fontStyle:"italic", borderLeft:`3px solid ${BLU}`, paddingLeft:12 }}>{capAnalysis.overview}</p>}
          <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(3,1fr)", gap:10 }}>
            {(capAnalysis.months||[]).map((m,i) => {
              const SC = { ok:GRN, attention:AMB, full:RED, critical:RED };
              const SL = { ok:"✓ Disponível", attention:"⚠ Atenção", full:"● Cheio", critical:"🔴 Crítico" };
              const sc = SC[m.status]||TX2;
              const rawM = capAnalysis.rawMonths?.find(r=>r.month===m.month);
              return (
                <div key={i} style={{ background:`${sc}08`, border:`1px solid ${sc}25`, borderRadius:10, padding:"12px 14px" }}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:TX }}>{m.month}</div>
                    <span style={{ fontSize:9, fontWeight:700, padding:"2px 7px", borderRadius:99, background:`${sc}15`, color:sc }}>{SL[m.status]||m.status}</span>
                  </div>
                  <div style={{ height:5, background:"rgba(0,0,0,.08)", borderRadius:3, overflow:"hidden", marginBottom:8 }}>
                    <div style={{ height:5, borderRadius:3, background:sc, width:`${Math.min(100, m.safeCapacity>0?(m.scheduled/m.safeCapacity*100):100)}%` }}/>
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:10, color:TX2, marginBottom:4 }}>
                    <span>{m.scheduled} agendados</span>
                    <span style={{ fontWeight:700, color:sc }}>{m.availableSlots>0?`+${m.availableSlots} slots livres`:"sem espaço"}</span>
                  </div>
                  {rawM?.travelDays>0&&<div style={{ fontSize:10,color:"#7C3AED" }}>✈️ {rawM.travelDays}d viagem</div>}
                  <p style={{ fontSize:10, color:TX2, lineHeight:1.4, margin:"4px 0 0" }}>{m.recommendation}</p>
                </div>
              );
            })}
          </div>
        </>)}
      </div>

      {/* Ações & Urgências */}
      {urgency.filter(u => !dismissedAlerts.includes(u.key) && u.key !== "ok").length > 0 && (
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2, marginBottom:10 }}>Ações & Urgências</div>
          <div style={{ display:"flex", gap:10, overflowX:"auto", WebkitOverflowScrolling:"touch", paddingBottom:4 }}>
            {urgency.filter(u => !dismissedAlerts.includes(u.key)).map(u => {
              const bg = u.type==="error"?`${RED}08`:u.type==="warning"?`${AMB}08`:u.type==="success"?`${GRN}08`:`${BLU}08`;
              const bc = u.type==="error"?`${RED}25`:u.type==="warning"?`${AMB}25`:u.type==="success"?`${GRN}25`:`${BLU}25`;
              const tc = u.type==="error"?RED:u.type==="warning"?AMB:u.type==="success"?GRN:BLU;
              return (
                <div key={u.key} style={{ background:bg, border:`1px solid ${bc}`, borderRadius:10, padding:"12px 14px", minWidth:220, flexShrink:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                    <span style={{ fontSize:13 }}>{u.type==="error"?"🔴":u.type==="warning"?"🟡":u.type==="success"?"✅":"🔵"}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:tc, flex:1 }}>{u.title}</span>
                    <button onClick={()=>dismissAlert(u.key)} title="Dispensar"
                      style={{ background:"none",border:"none",color:TX3,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1 }}>×</button>
                  </div>
                  {u.sub&&<p style={{ fontSize:11, color:TX2, marginBottom:4, lineHeight:1.4 }}>{u.sub}</p>}
                  <div style={{ display:"flex", gap:6 }}>
                    {u.action&&<button onClick={u.onAction} style={{ fontSize:11,fontWeight:700,color:tc,background:"none",border:`1px solid ${bc}`,borderRadius:5,padding:"4px 10px",cursor:"pointer" }}>{u.action} →</button>}
                    <button onClick={()=>dismissAlert(u.key)}
                      style={{ fontSize:11,color:TX3,background:"none",border:`1px solid ${LN}`,borderRadius:5,padding:"4px 10px",cursor:"pointer" }}>
                      Dispensar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Próximas Postagens */}
      <div style={{ ...G, padding:"16px 20px", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:12 }}>
          <div style={{ fontSize:10, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2 }}>Próximas Postagens</div>
          <button onClick={()=>navigateTo("acompanhamento")} style={{ fontSize:11, color:TX2, background:"none", border:"none", cursor:"pointer" }}>Gerenciar →</button>
        </div>
        {upcomingDeliverables.length === 0 && <div style={{ fontSize:12, color:TX3, textAlign:"center", padding:"12px 0" }}>Nenhuma postagem no pipeline.</div>}
        {upcomingDeliverables.slice(0,6).map((d,i) => {
          const c = contracts.find(x=>x.id===d.contractId);
          const stage = STAGES.find(s=>s.id===d.stage);
          const dl = d.plannedPostDate ? daysLeft(d.plannedPostDate) : null;
          const isLate = d.stage!=="done" && !d.publishedAt && !d.postLink && dl !== null && dl < 0;
          const STAGE_COLOR = { briefing:"#94A3B8", roteiro:"#7C3AED", ap_roteiro:"#D97706", gravacao:"#BE185D", edicao:"#2563EB", ap_final:"#EA580C", postagem:"#0891B2", done:"#16A34A" };
          const stageColor = STAGE_COLOR[d.stage] || TX2;
          return (
            <div key={d.id} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:i<upcomingDeliverables.slice(0,6).length-1?`1px solid ${LN}`:"none" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:c?.color||TX3, flexShrink:0 }}/>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:isLate?RED:TX, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:5 }}>{d.title}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:99, background:`${stageColor}14`, color:stageColor }}>{stage?.label||d.stage}</span>
                  {d.plannedPostDate && (
                    <span style={{ fontSize:11, fontWeight:600, color:isLate?RED:TX2 }}>
                      📅 {fmtDate(d.plannedPostDate)}
                    </span>
                  )}
                </div>
              </div>
              {dl!==null && (
                <div style={{ fontSize:12, fontWeight:700, color:dlColor(dl), flexShrink:0, minWidth:70, textAlign:"right" }}>
                  {dl<0 ? `${Math.abs(dl)}d atraso` : dl===0 ? "Hoje" : `${dl}d`}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Pagamentos — 30 dias */}
      <div style={{ ...G, padding:"16px 20px", marginBottom:20 }}>
        <div style={{ fontSize:10, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2, marginBottom:12 }}>Pagamentos · 30 dias</div>
        {upcomingPayments.length === 0
          ? <div style={{ fontSize:12, color:TX3, textAlign:"center", padding:"12px 0" }}>Nenhum nos próximos 30 dias.</div>
          : upcomingPayments.map((p,i) => (
            <div key={i} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom:i<upcomingPayments.length-1?`1px solid ${LN}`:"none" }}>
              <div style={{ width:6, height:6, borderRadius:"50%", background:p.color||TX3, flexShrink:0 }}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:12, fontWeight:500, color:TX }}>{p.company}</div>
                <div style={{ fontSize:10, color:TX2 }}>{p.label} · {fmtDate(p.date)}</div>
              </div>
              <div style={{ fontSize:13, fontWeight:700, color:TX }}>{fmtMoney(p.value,p.currency)}</div>
              <div style={{ fontSize:11, fontWeight:700, color:dlColor(daysLeft(p.date)), flexShrink:0, minWidth:40, textAlign:"right" }}>{daysLeft(p.date)===0?"Hoje":`${daysLeft(p.date)}d`}</div>
            </div>
          ))
        }
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
  const isDone = item.stage === "done";
  const isLate = !isDone && !item.publishedAt && !item.postLink && daysUntil !== null && daysUntil < 0;
  const isUrgent = daysUntil !== null && daysUntil >= 0 && daysUntil <= 1;
  const exceptions = useMemo(() => validateDeliverable(item), [item]);

  return (
    <div
      onClick={() => onEdit(item)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        background: isLate ? "#FFF1F2" : B1,
        border: `1px solid ${isLate ? "#FCA5A5" : isUrgent ? "#FCD34D" : hov ? LN2 : LN}`,
        borderRadius: 8, padding: "10px 12px", cursor: "pointer",
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
      {exceptions.length > 0 && (
        <div title={exceptions.map(e=>`${e.label}: ${e.got}d disponíveis (mín. ${e.need}d)`).join(" · ")}
          style={{ marginTop:4, fontSize:9, fontWeight:700, color:"#EA580C", background:"rgba(234,88,12,.1)", borderRadius:4, padding:"1px 6px", display:"inline-block", cursor:"help" }}>
          ⚠️ {exceptions.length} exceção{exceptions.length>1?"ões":""}
        </div>
      )}
    </div>
  );
}

function PipelineColumn({ stage, items, contracts, onEdit, onDrop, onReorder }) {
  const [dragOver, setDragOver]     = useState(false);
  const [dragOverItem, setDragOverItem] = useState(null); // {id, before}
  const [draggingId, setDraggingId] = useState(null);

  const lateCount = stage.id === "done" ? 0 : items.filter(item => {
    if (item.publishedAt || item.postLink) return false;
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
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false); }}
      onDrop={e => {
        e.preventDefault(); setDragOver(false); setDragOverItem(null);
        const id = e.dataTransfer.getData("text/plain");
        const fromStage = e.dataTransfer.getData("from-stage");
        // Only move stage if dropped on the column (not on a card)
        if (fromStage !== stage.id) onDrop(id, stage.id);
      }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${LN}`, background: B1, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: TX, flex: 1 }}>{stage.label}</span>
        {lateCount > 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, background: "#FFF1F2", color: RED, padding: "2px 6px", borderRadius: 99, border: "1px solid #FCA5A5" }}>{lateCount} atrasado{lateCount>1?"s":""}</span>
        )}
        <span style={{ fontSize: 9, fontWeight: 700, background: B3, color: TX2, padding: "2px 7px", borderRadius: 99 }}>{items.length}</span>
      </div>
      <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 0, minHeight: 80 }}>
        {items.map(item => (
          <div key={item.id}
            draggable
            onDragStart={e => {
              e.dataTransfer.setData("text/plain", item.id);
              e.dataTransfer.setData("from-stage", stage.id);
              e.dataTransfer.effectAllowed = "move";
              setDraggingId(item.id);
            }}
            onDragEnd={() => { setDraggingId(null); setDragOverItem(null); }}
            onDragOver={e => {
              e.preventDefault(); e.stopPropagation();
              if (draggingId && draggingId !== item.id) {
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                setDragOverItem({ id: item.id, before });
              }
            }}
            onDrop={e => {
              e.preventDefault(); e.stopPropagation();
              const id = e.dataTransfer.getData("text/plain");
              const fromStage = e.dataTransfer.getData("from-stage");
              setDragOverItem(null);
              if (fromStage === stage.id && id !== item.id && onReorder) {
                const rect = e.currentTarget.getBoundingClientRect();
                const before = e.clientY < rect.top + rect.height / 2;
                onReorder(id, item.id, before);
              } else if (fromStage !== stage.id) {
                onDrop(id, stage.id);
              }
            }}
            style={{ marginBottom: 6, opacity: draggingId === item.id ? 0.4 : 1, transition: "opacity .15s" }}>
            {/* Drop indicator */}
            {dragOverItem?.id === item.id && dragOverItem.before && (
              <div style={{ height: 2, background: RED, borderRadius: 1, marginBottom: 4 }}/>
            )}
            <DeliverableCard item={item} contracts={contracts} onEdit={onEdit} stageId={stage.id}/>
            {dragOverItem?.id === item.id && !dragOverItem.before && (
              <div style={{ height: 2, background: RED, borderRadius: 1, marginTop: 4 }}/>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Acompanhamento({ contracts, posts, deliverables=[], saveDeliverables, calEvents, calMonth, setCal, calFilter, setCalF, role }) {
  const isMobile = useIsMobile();
  const setDeliverables = saveDeliverables || (() => {});
  const [view, setView]   = useState("calendar");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen]   = useState(false);
  const [prefillDate, setPrefillDate] = useState("");
  const [quickDate, setQuickDate]     = useState(null); // for QuickPostModal from calendar
  const [filter, setFilter]       = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const toast = useToast();

  const save = list => { setDeliverables(list); };

  const moveStage = (itemId, newStage) => {
    save(deliverables.map(d => d.id === itemId ? { ...d, stage: newStage } : d));
    toast?.(`Movido para ${STAGES.find(s=>s.id===newStage)?.label}`, "info");
  };

  // Reorder cards within same column
  const reorderWithin = (fromId, toId, before) => {
    const stage = deliverables.find(d=>d.id===fromId)?.stage;
    if (!stage) return;
    const stageItems = deliverables
      .filter(d=>d.stage===stage)
      .sort((a,b)=>(a.sortOrder??0)-(b.sortOrder??0));
    const from = stageItems.find(d=>d.id===fromId);
    const rest = stageItems.filter(d=>d.id!==fromId);
    const toIdx = rest.findIndex(d=>d.id===toId);
    if (toIdx<0) return;
    const insertAt = before ? toIdx : toIdx+1;
    rest.splice(insertAt,0,from);
    const updated = rest.map((d,i)=>({...d,sortOrder:i*10}));
    save(deliverables.map(d=>{const u=updated.find(x=>x.id===d.id);return u||d;}));
  };

  const filtered = deliverables
    .filter(d => filter === "all" || d.contractId === filter)
    .filter(d => typeFilter === "all" || d.type === typeFilter);

  // Conflict detection: same plannedPostDate
  const postDateCounts = {};
  deliverables.forEach(d => {
    if (d.plannedPostDate) postDateCounts[d.plannedPostDate] = (postDateCounts[d.plannedPostDate] || 0) + 1;
  });
  const conflicts = Object.entries(postDateCounts).filter(([, count]) => count > 1);

  return (
    <div style={{ padding: isMobile ? "12px 12px 80px" : 24, maxWidth:1600 }}>
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
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}
          style={{ padding: "5px 10px", background: B1, border: `1px solid ${LN}`, borderRadius: 6, color: TX2, fontSize: 11, fontFamily: "inherit", outline: "none" }}>
          <option value="all">Todos os tipos</option>
          <option value="reel">Reel / Post</option>
          <option value="story">Story</option>
          <option value="tiktok">TikTok</option>
          <option value="link">Link Comunidade</option>
        </select>
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
                items={filtered
                  .filter(d => (d.stage || "briefing") === stage.id)
                  .sort((a,b)=>(a.sortOrder??9999)-(b.sortOrder??9999))}
                contracts={contracts}
                onEdit={setEditItem}
                onDrop={moveStage}
                onReorder={reorderWithin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Calendar view */}
      {view === "calendar" && (
        <CalendarView contracts={contracts} deliverables={deliverables} saveDeliverables={save} onEditDeliverable={setEditItem} onNewDeliverable={date=>setQuickDate(date)} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>
      )}

      {/* Modals */}
      {quickDate && (
        <QuickPostModal
          date={quickDate}
          contracts={contracts}
          onClose={()=>setQuickDate(null)}
          onSave={item=>{
            save([...deliverables,{...item,id:uid(),stage:"briefing",createdAt:new Date().toISOString()}]);
            toast?.("✓ Post criado","success");
            setQuickDate(null);
          }}
        />
      )}
      {(newOpen || editItem) && (
        <DeliverableModal
          item={editItem}
          contracts={contracts}
          onClose={() => { setNewOpen(false); setEditItem(null); setPrefillDate(""); }}
          onSave={item => {
            if (editItem) {
              save(deliverables.map(d => d.id === item.id ? item : d));
              toast?.("Entregável atualizado", "success");
            } else {
              save([...deliverables, { ...item, id: uid(), stage: "briefing", createdAt: new Date().toISOString() }]);
              toast?.("✓ Entregável criado", "success");
            }
            setNewOpen(false); setEditItem(null); setPrefillDate("");
          }}
          onAutoSave={editItem ? item => {
            // Salva silenciosamente sem fechar o modal
            save(deliverables.map(d => d.id === editItem.id ? item : d));
          } : null}
          prefillDate={prefillDate}
          onDelete={editItem ? id => {
            if (confirm("Excluir este entregável?")) { save(deliverables.filter(d => d.id !== id)); setEditItem(null); }
          } : null}
        />
      )}
    </div>
  );
}

// ─── Quick Post Modal (from calendar +) ──────────────────
function QuickPostModal({ date, contracts, onClose, onSave }) {
  const [title, setTitle] = useState("");
  const [type, setType]   = useState("reel");
  const [stage, setStage] = useState("roteiro");
  const [notes, setNotes] = useState("");
  const titleRef = useRef(null);

  useEffect(()=>{ setTimeout(()=>titleRef.current?.focus(),60); },[]);

  const fmtFull = ds => ds ? new Date(ds+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long",year:"numeric"}) : "";

  const STAGE_OPTS = [
    {id:"roteiro",  label:"Roteirizando", color:"#7C3AED"},
    {id:"gravacao", label:"Gravação",     color:"#BE185D"},
    {id:"edicao",   label:"Edição",       color:"#2563EB"},
    {id:"ap_final", label:"Ap. Final",    color:"#EA580C"},
    {id:"postagem", label:"Publicando",   color:"#0891B2"},
    {id:"done",     label:"Postado",      color:"#16A34A"},
  ];
  const TYPE_OPTS = [
    {id:"reel",  label:"Reel",   emoji:"🎬"},
    {id:"tiktok",label:"TikTok", emoji:"🎵"},
    {id:"story", label:"Story",  emoji:"📸"},
    {id:"link",  label:"Link",   emoji:"🔗"},
  ];

  const curStage = STAGE_OPTS.find(s=>s.id===stage);
  const contractId = contracts[0]?.id || "";

  const handleSave = () => {
    if (!title.trim()) { titleRef.current?.focus(); return; }
    onSave({ contractId, title, type, stage, plannedPostDate:date, notes, roteiro:"", responsible:{}, stageDateOverrides:{}, networks:[], networkMetrics:{} });
  };

  const Row = ({label, children}) => (
    <div style={{display:"flex",alignItems:"flex-start",padding:"10px 0",borderBottom:`1px solid ${LN}`,gap:0}}>
      <span style={{fontSize:12,color:TX3,width:110,flexShrink:0,fontWeight:500,paddingTop:3}}>{label}</span>
      {children}
    </div>
  );

  const mob = typeof window !== "undefined" && window.innerWidth < 768;
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:500,display:"flex",alignItems:mob?"flex-end":"center",justifyContent:"center",backdropFilter:"blur(2px)"}}
      onClick={e=>{if(e.target===e.currentTarget)onClose();}}>
      <div style={{background:"#FEFEFE",borderRadius:mob?"20px 20px 0 0":12,width:"100%",maxWidth:mob?"100%":560,boxShadow:"0 32px 80px rgba(0,0,0,0.14),0 4px 16px rgba(0,0,0,0.08)",overflow:"hidden",maxHeight:mob?"92vh":"none",display:"flex",flexDirection:"column"}}>
        {mob&&<div style={{width:40,height:4,background:LN2,borderRadius:2,margin:"12px auto 0",flexShrink:0}}/>}

        {/* Title area */}
        <div style={{padding:mob?"14px 20px 16px":"28px 28px 20px",flexShrink:0}}>
          <div style={{fontSize:11,color:TX3,fontWeight:600,marginBottom:12}}>{fmtFull(date)}</div>
          <textarea
            ref={titleRef}
            value={title}
            onChange={e=>setTitle(e.target.value)}
            onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();handleSave();}}}
            placeholder="Título do post…"
            rows={2}
            style={{width:"100%",fontSize:26,fontWeight:700,color:TX,border:"none",outline:"none",background:"transparent",fontFamily:"inherit",letterSpacing:"-.02em",lineHeight:1.25,resize:"none",padding:0}}
          />
        </div>

        {/* Fields */}
        <div style={{padding:mob?"0 20px 8px":"0 28px 8px",borderTop:`1px solid ${LN}`,overflowY:"auto",flex:1}}>
          <Row label="Status">
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {STAGE_OPTS.map(s=>(
                <div key={s.id} onClick={()=>setStage(s.id)}
                  style={{padding:"3px 10px",fontSize:11,fontWeight:600,borderRadius:99,cursor:"pointer",transition:"all .1s",
                    background:stage===s.id?`${s.color}14`:"transparent",
                    color:stage===s.id?s.color:TX3,
                    border:`1px solid ${stage===s.id?s.color+"40":"transparent"}`}}>
                  {s.label}
                </div>
              ))}
            </div>
          </Row>

          <Row label="Tipo">
            <div style={{display:"flex",gap:4}}>
              {TYPE_OPTS.map(t=>(
                <div key={t.id} onClick={()=>setType(t.id)}
                  style={{padding:"3px 10px",fontSize:11,fontWeight:600,borderRadius:99,cursor:"pointer",transition:"all .1s",
                    background:type===t.id?`${RED}10`:"transparent",
                    color:type===t.id?RED:TX3,
                    border:`1px solid ${type===t.id?RED+"30":"transparent"}`}}>
                  {t.emoji} {t.label}
                </div>
              ))}
            </div>
          </Row>

          <div style={{padding:"10px 0"}}>
            <textarea value={notes} onChange={e=>setNotes(e.target.value)}
              placeholder="Adicionar ideia, referência ou link…"
              rows={3}
              style={{width:"100%",border:"none",background:"transparent",color:TX2,fontSize:13,fontFamily:"inherit",resize:"none",outline:"none",lineHeight:1.75,padding:0}}/>
          </div>
        </div>

        {/* Footer */}
        <div style={{padding:mob?"12px 20px":"12px 28px",borderTop:`1px solid ${LN}`,display:"flex",alignItems:"center",justifyContent:"space-between",background:B2,flexShrink:0}}>
          <div style={{display:"flex",alignItems:"center",gap:6}}>
            <span style={{fontSize:11,padding:"2px 9px",borderRadius:99,background:curStage?`${curStage.color}14`:"transparent",color:curStage?.color||TX3,fontWeight:700}}>
              {curStage?.label}
            </span>
            <span style={{fontSize:11,color:TX3}}>· {TYPE_OPTS.find(t=>t.id===type)?.emoji} {TYPE_OPTS.find(t=>t.id===type)?.label}</span>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={onClose}
              style={{background:"none",border:"none",color:TX3,cursor:"pointer",fontSize:12,padding:"7px 12px",borderRadius:6,transition:"all .1s"}}
              onMouseEnter={e=>e.currentTarget.style.background=LN}
              onMouseLeave={e=>e.currentTarget.style.background="none"}>
              Cancelar
            </button>
            <button onClick={handleSave}
              style={{background:RED,border:"none",borderRadius:8,padding:"8px 20px",color:"white",fontSize:13,fontWeight:700,cursor:"pointer",transition:"all .15s",boxShadow:"0 2px 8px rgba(200,16,46,.22)"}}
              onMouseEnter={e=>{e.currentTarget.style.background="#a80d25";e.currentTarget.style.transform="translateY(-1px)";}}
              onMouseLeave={e=>{e.currentTarget.style.background=RED;e.currentTarget.style.transform="none";}}>
              Criar post
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


function DeliverableModal({ item, contracts, onClose, onSave, onDelete, onAutoSave, prefillDate="" }) {
  const isEdit = !!item;
  const [f, setF] = useState(item || { contractId: contracts[0]?.id || "", title: "", type: "reel", plannedPostDate: prefillDate||"", stage: "briefing", responsible: {}, stageDateOverrides: {}, notes: "", roteiro: "", networks: [], networkMetrics: {} });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const [modalTab, setModalTab] = useState("info");
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

  const MODAL_TABS = [{ id:"info", label:"Info" },{ id:"roteiro", label:"✍️ Roteiro" },{ id:"metricas", label:"Métricas" }];
  const ROTEIRO_SECTIONS = ["Abertura","Campinho","Desenvolvimento","Bloco Publi","CTA","Encerramento"];

  const insertSection = (s) => {
    const cur = f.roteiro || "";
    set("roteiro", cur + (cur ? "\n\n" : "") + `[${s}]\n`);
  };

  return (
    <Modal title={isEdit?"Editar Entregável":"Novo Entregável"} onClose={onClose} width={860}
      footer={<>{onDelete&&<Btn onClick={()=>onDelete(item.id)} variant="danger" size="sm">Excluir</Btn>}<div style={{flex:1}}/><Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn><Btn onClick={handleSave} variant="primary" size="sm">{isEdit?"Salvar":"Criar"}</Btn></>}>

      {/* Tabs */}
      <div style={{display:"flex",gap:0,borderBottom:`1px solid ${LN}`,marginBottom:16,marginTop:-4}}>
        {MODAL_TABS.map(t=>(
          <div key={t.id} onClick={()=>setModalTab(t.id)}
            style={{padding:"8px 16px",fontSize:12,fontWeight:modalTab===t.id?700:400,cursor:"pointer",color:modalTab===t.id?TX:TX2,borderBottom:`2px solid ${modalTab===t.id?RED:"transparent"}`,transition:TRANS,marginBottom:-1}}>
            {t.label}
          </div>
        ))}
      </div>

      {/* ── Tab: Info ── */}
      {modalTab==="info" && <>
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
            {STAGES.filter(s=>s.id!=="done").map(s=>{const auto=stageDates[s.id];const override=f.stageDateOverrides?.[s.id];const dl=daysLeft(override||auto);const exc=validateDeliverable(f).find(e=>e.stage===s.id);return(<div key={s.id} style={{background:exc?`rgba(234,88,12,.06)`:B2,border:`1px solid ${exc?"rgba(234,88,12,.3)":LN}`,borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:5,display:"flex",alignItems:"center",gap:4}}>{s.label}{exc&&<span title={exc.rule} style={{fontSize:10,cursor:"help"}}>⚠️</span>}</div>
              <div style={{fontSize:12,fontWeight:600,color:dl!==null&&dl<0?RED:TX,marginBottom:4}}>{fmtDate(override||auto)}</div>
              {dl!==null&&<div style={{fontSize:10,color:dl<0?RED:dl<=1?AMB:TX3,marginBottom:5}}>{dl<0?`${Math.abs(dl)}d atrás`:dl===0?"Hoje":`${dl}d`}</div>}
              {exc&&<div style={{fontSize:9,color:"#EA580C",fontWeight:600,marginBottom:4}}>{exc.got}d / mín. {exc.need}d</div>}
              <div style={{fontSize:9,color:TX3,marginBottom:4,fontStyle:"italic"}}>{s.rule}</div>
              <input type="date" value={f.stageDateOverrides?.[s.id]||""} onChange={e=>setF(x=>({...x,stageDateOverrides:{...(x.stageDateOverrides||{}),[s.id]:e.target.value}}))} style={{width:"100%",padding:"3px 5px",fontSize:10,background:B1,border:`1px solid ${LN}`,borderRadius:4,color:TX3,fontFamily:"inherit",outline:"none"}}/>
              <input value={f.responsible?.[s.id]||""} placeholder="Responsável" onChange={e=>setF(x=>({...x,responsible:{...(x.responsible||{}),[s.id]:e.target.value}}))} style={{width:"100%",padding:"3px 5px",fontSize:10,background:B1,border:`1px solid ${LN}`,borderRadius:4,color:TX,fontFamily:"inherit",outline:"none",marginTop:4}}/>
            </div>);})}</div></>)}
        {(f.stage==="postagem"||f.stage==="done")&&(<><SRule>Publicação</SRule>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Link"><Input value={f.postLink||""} onChange={e=>set("postLink",e.target.value)} placeholder="https://instagram.com/p/..."/></Field>
            <Field label="Data publicação"><Input type="date" value={f.publishedAt||""} onChange={e=>set("publishedAt",e.target.value)}/></Field>
          </div>
        </>)}
        <SRule>Briefing / Observações</SRule>
        <Field label=""><Textarea value={f.notes||""} onChange={e=>set("notes",e.target.value)} rows={4} placeholder="Resumo do briefing, links, pontos obrigatórios, don'ts…"/></Field>
      </>}

      {/* ── Tab: Roteiro ── */}
      {modalTab==="roteiro" && (
        <div style={{margin:"0 -20px -20px",borderTop:`1px solid ${LN}`,display:"flex",flexDirection:"column"}}>
          <RichTextEditor
            value={f.roteiro||""}
            onChange={v=>set("roteiro",v)}
            onAutoSave={onAutoSave ? v => onAutoSave({...f, roteiro:v}) : null}
            title={`${f.title||"Roteiro"} · ${contracts.find(c=>c.id===f.contractId)?.company||""}`}
            minHeight={480}
          />
        </div>
      )}

      {/* ── Tab: Métricas ── */}
      {modalTab==="metricas" && <>
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
      </>}
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
              <span style={{fontSize:11,color:TX2}}>Comissão Ranked (a pagar) (20% s/ líquido)</span>
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
  const doneDelsFromPipeline = cDeliverables.filter(d => d.stage==="done"||d.stage==="postagem").length;
  const doneDelsFromPosts    = cPosts.filter(p => p.isPosted).length;
  const doneDels   = doneDelsFromPipeline + doneDelsFromPosts;
  const totalDels  = c.numPosts + c.numStories + c.numCommunityLinks + c.numReposts;
  const commPaid    = commEntries.filter(e => e.isPaid).reduce((s,e) => s + e.amount, 0);
  const commPending = commEntries.filter(e => !e.isPaid).reduce((s,e) => s + e.amount, 0);

  const avgEng = (() => {
    // Include both posts and deliverables with networkMetrics
    const items = [...cPosts, ...cDeliverables];
    const engs = items.map(item => {
      const reach = sumNetworkMetrics(item, "reach");
      const likes = sumNetworkMetrics(item, "likes");
      const comments = sumNetworkMetrics(item, "comments");
      if (reach > 0) return (likes + comments) / reach * 100;
      return calcEngagement(item);
    }).filter(e => e != null && e > 0);
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

  const isMob = window.innerWidth < 768;
  return (
    <>
    <div style={{ padding: isMob?"12px 12px 80px":24, maxWidth: 1100 }}>
      {/* Mobile header */}
      {isMob ? (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:12 }}>
            <button onClick={onBack} style={{ background:"none", border:`1px solid ${LN}`, borderRadius:8, padding:"7px 12px", cursor:"pointer", fontSize:11, color:TX2, flexShrink:0 }}>
              ← Contratos
            </button>
            <div style={{ flex:1 }}/>
            <button onClick={()=>setModal({type:"contract",data:c})} style={{ background:B2, border:`1px solid ${LN}`, borderRadius:8, padding:"7px 12px", cursor:"pointer", fontSize:11, color:TX }}>✎ Editar</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6 }}>
            <div style={{ width:12, height:12, borderRadius:"50%", background:c.color, flexShrink:0 }}/>
            <h1 style={{ fontSize:22, fontWeight:800, color:TX, letterSpacing:"-.02em", flex:1 }}>{c.company}</h1>
          </div>
          <div style={{ fontSize:20, fontWeight:800, color:TX, marginBottom:4 }}>{total>0?fmtMoney(total,c.currency):"Valor TBD"}</div>
          {c.contractDeadline && <div style={{ fontSize:12, color:dlColor(dl) }}>prazo {fmtDate(c.contractDeadline)} · {dl}d</div>}
        </div>
      ) : (
        /* Desktop header */
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
          }} style={{ background:"none", border:`1px solid rgba(200,16,46,.3)`, borderRadius:6, padding:"6px 10px", cursor:"pointer", fontSize:11, color:RED, transition:TRANS, flexShrink:0 }}>
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
            </div>
          </div>
          <Btn onClick={()=>setModal({type:"contract",data:c})} variant="default" size="sm">✎ Editar</Btn>
          <Btn onClick={()=>setShowClientReport(true)} variant="default" size="sm">📊 Relatório Cliente</Btn>
          <Btn onClick={generateReport} variant="primary" size="sm" disabled={aiLoading} icon={aiLoading?null:Zap}>
            {aiLoading ? "Gerando…" : "Gerar Relatório IA"}
          </Btn>
        </div>
      )}

      {/* Tabs — horizontal scroll on mobile */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${LN}`, marginBottom:20, overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
        {TABS.map(t => (
          <div key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"10px 16px", fontSize:12, fontWeight:tab===t.id?700:400, cursor:"pointer", color:tab===t.id?TX:TX2, borderBottom:`2px solid ${tab===t.id?RED:"transparent"}`, transition:TRANS, marginBottom:-1, whiteSpace:"nowrap", flexShrink:0 }}>
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
              { label:"Entregas concluídas", value:`${doneDels}/${totalDels}` },
              { label:"Comissão Ranked (a pagar)", value:fmtMoney(commPending,c.currency), accent:commPending>0?AMB:GRN, sub:commPending>0?"pendente":"pago" },
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
                const isDone = d.stage==="done";
                const isLate = !isDone&&!d.publishedAt&&!d.postLink&&dl2!==null&&dl2<0;
                return (
                  <div key={d.id} style={{ display:"flex",alignItems:"center",gap:12,padding:"8px 0",borderBottom:`1px solid ${LN}` }}>
                    <div style={{ width:6,height:6,borderRadius:"50%",background:isDone?GRN:isLate?RED:AMB,flexShrink:0 }}/>
                    <span style={{ fontSize:12,fontWeight:500,color:isLate?RED:TX,flex:1 }}>{d.title}</span>
                    <Badge color={isDone?GRN:isLate?RED:TX2}>{stage?.label||d.stage}</Badge>
                    {d.plannedPostDate&&<span style={{fontSize:10,color:TX2}}>post {fmtDate(d.plannedPostDate)}</span>}
                    {isDone?<span style={{fontSize:10,fontWeight:700,color:GRN}}>✓ Entregue</span>:dl2!==null&&<span style={{fontSize:10,fontWeight:700,color:dlColor(dl2)}}>{dl2<0?`${Math.abs(dl2)}d atraso`:`${dl2}d`}</span>}
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
                const pRch=sumNetworkMetrics(p,"reach"),pLk=sumNetworkMetrics(p,"likes"),pCm=sumNetworkMetrics(p,"comments");const eng=pRch>0?((pLk+pCm)/pRch*100):calcEngagement(p);
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
            {nfEntries.map((e,i) => {
              const nfFile = c.nfFiles?.[e.key];
              return (
                <div key={e.key} style={{ padding:"12px 0", borderBottom:i<nfEntries.length-1?`1px solid ${LN}`:"none" }}>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:nfFile||e.isEmitted?8:0 }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:600,color:TX }}>{e.label}</div>
                      {e.date&&<div style={{fontSize:10,color:TX2}}>{fmtDate(e.date)}</div>}
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      {e.amount>0&&<span style={{fontSize:12,fontWeight:700,color:TX}}>{fmtMoney(e.amount,c.currency)}</span>}
                      <div onClick={()=>toggleNF(c.id,e.key)} style={{ padding:"4px 10px",fontSize:10,fontWeight:700,cursor:"pointer",borderRadius:5,transition:TRANS,background:e.isEmitted?`${GRN}15`:"rgba(0,0,0,.04)",border:`1px solid ${e.isEmitted?GRN+"44":LN2}`,color:e.isEmitted?GRN:TX2 }}>
                        {e.isEmitted?"✓ Emitida":"Emitir"}
                      </div>
                    </div>
                  </div>
                  {/* NF File attachment */}
                  {nfFile ? (
                    <div style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:B2,borderRadius:7,border:`1px solid ${LN}` }}>
                      <span style={{ fontSize:16 }}>📄</span>
                      <div style={{ flex:1,minWidth:0 }}>
                        <div style={{ fontSize:11,fontWeight:600,color:TX,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{nfFile.name}</div>
                        <div style={{ fontSize:9,color:TX3 }}>{new Date(nfFile.uploadedAt).toLocaleDateString("pt-BR")}</div>
                      </div>
                      <a href={nfFile.data} download={nfFile.name} style={{ padding:"3px 8px",fontSize:10,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:4,textDecoration:"none",flexShrink:0 }}>↓</a>
                      <button onClick={async()=>{const nf={...(c.nfFiles||{})};delete nf[e.key];await saveC(contracts.map(x=>x.id===c.id?{...x,nfFiles:nf}:x));}} style={{ padding:"3px 6px",fontSize:11,background:"none",border:`1px solid ${LN}`,borderRadius:4,cursor:"pointer",color:TX2 }}>×</button>
                    </div>
                  ) : (
                    <label style={{ display:"flex",alignItems:"center",gap:8,padding:"7px 12px",background:B2,borderRadius:7,border:`1px dashed ${LN2}`,cursor:"pointer",transition:TRANS }}
                      onMouseEnter={e=>e.currentTarget.style.borderColor=BLU} onMouseLeave={e=>e.currentTarget.style.borderColor=LN2}>
                      <span style={{ fontSize:13 }}>📎</span>
                      <span style={{ fontSize:11,color:TX2 }}>Anexar arquivo da NF</span>
                      <input type="file" style={{ display:"none" }} onChange={async(ev)=>{
                        const file=ev.target.files[0]; if(!file) return;
                        const reader=new FileReader();
                        reader.onload=async(re)=>{
                          const fileData={name:file.name,size:file.size,type:file.type,data:re.target.result,uploadedAt:new Date().toISOString()};
                          await saveC(contracts.map(x=>x.id===c.id?{...x,nfFiles:{...(x.nfFiles||{}),[e.key]:fileData}}:x));
                        };
                        reader.readAsDataURL(file);
                      }}/>
                    </label>
                  )}
                </div>
              );
            })}
          </div>
          {/* Commission */}
          <div style={{ ...G, padding:"18px 20px" }}>
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14 }}>
              <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Comissão Ranked (a pagar) (20%)</div>
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
                    {e.isPaid?"✓ Pago à Ranked":"Marcar pago"}
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
            <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12 }}>
              <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Notas do Briefing</div>
              <Btn onClick={async()=>{
                const [genLoading, setGenLoading] = [setBriefingNote, setBriefingNote]; // placeholder
                const btn = document.getElementById("briefing-ai-btn");
                if(btn) btn.textContent="Gerando…";
                try {
                  const cDels = deliverables?.filter(d=>d.contractId===c.id)||[];
                  const res = await fetch("/api/ai",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({max_tokens:1000,messages:[{role:"user",content:`Você é especialista em briefing para criadores de conteúdo digital. Com base nos dados abaixo, gere um briefing completo e estruturado para o criador @veloso.lucas_ sobre a parceria com ${c.company}.

Inclua:
- **Sobre a marca**: contexto e posicionamento
- **Objetivo da campanha**: o que a marca quer comunicar
- **Dos (obrigatório)**: o que DEVE aparecer no conteúdo
- **Don'ts (proibido)**: o que NÃO pode aparecer
- **Tom de voz**: como se comunicar
- **Pontos de atenção**: detalhes críticos para aprovação
- **Entregáveis**: resumo do que foi contratado

Dados do contrato:
- Empresa: ${c.company}
- Valor: ${contractTotal(c)} ${c.currency}
- Entregas: ${c.numPosts} reels, ${c.numStories} stories, ${c.numReposts} tiktoks, ${c.numCommunityLinks} links
- Observações existentes: ${c.notes||"nenhuma"}
- Entregáveis no pipeline: ${cDels.map(d=>d.title).join(", ")||"nenhum"}

Escreva em português, de forma direta e prática. Use marcadores claros.`}]})});
                  const data = await res.json();
                  const text = data.text||"";
                  if(text) { setBriefingNote(text); await saveNote(text); }
                } catch(e) { console.error(e); }
                if(btn) btn.textContent="✨ Gerar com IA";
              }} variant="primary" size="sm" id="briefing-ai-btn">✨ Gerar com IA</Btn>
            </div>
            <textarea value={briefingNote} onChange={e=>setBriefingNote(e.target.value)} onBlur={()=>saveNote(briefingNote)}
              rows={12} placeholder="Cole aqui o briefing da marca, ou use ✨ Gerar com IA para criar automaticamente com os principais pontos, dos & don'ts e tom de voz…"
              style={{ width:"100%",padding:"12px",background:B2,border:`1px solid ${LN}`,borderRadius:8,color:TX,fontSize:13,fontFamily:"inherit",lineHeight:1.6,resize:"vertical",outline:"none" }}/>
            <div style={{ fontSize:10,color:TX3,marginTop:6 }}>Auto-salvo ao sair do campo · ✨ IA gera estrutura completa baseada no contrato</div>
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
function Contratos({ contracts, posts, deliverables=[], saveC, saveP, saveDeliverables, setModal, toggleComm, toggleCommPaid, toggleNF, saveNote, rates, role }) {
  const isMobile = useIsMobile();
  const [selectedId, setSelectedId] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const selected = contracts.find(c => c.id === selectedId);

  const activeContracts   = contracts.filter(c => !c.archived);
  const archivedContracts = contracts.filter(c =>  c.archived);
  const displayContracts  = showArchived ? archivedContracts : activeContracts;

  const canEdit = ROLE_CAN[role]?.editContracts ?? true;
  const seeValues = ROLE_CAN[role]?.seeValues ?? true;

  const archive = async (id) => {
    await saveC(contracts.map(c => c.id===id ? {...c, archived:true,  archivedAt:new Date().toISOString()} : c));
  };
  const unarchive = async (id) => {
    await saveC(contracts.map(c => c.id===id ? {...c, archived:false, archivedAt:null} : c));
  };

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

  // ── Mobile card view ──
  if (isMobile) return (
    <div style={{ padding:"12px 12px 80px" }}>
      {/* Archive toggle */}
      <div style={{ display:"flex", background:B2, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden", marginBottom:12 }}>
        <div onClick={()=>setShowArchived(false)}
          style={{ flex:1, padding:"10px 0", textAlign:"center", fontSize:12, fontWeight:!showArchived?700:400, cursor:"pointer", color:!showArchived?TX:TX2, background:!showArchived?B1:"transparent", transition:TRANS }}>
          Ativos ({activeContracts.length})
        </div>
        <div onClick={()=>setShowArchived(true)}
          style={{ flex:1, padding:"10px 0", textAlign:"center", fontSize:12, fontWeight:showArchived?700:400, cursor:"pointer", color:showArchived?TX:TX2, background:showArchived?B1:"transparent", transition:TRANS }}>
          Arquivados ({archivedContracts.length})
        </div>
      </div>
      <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
        {displayContracts.map(c => {
          const total = contractTotal(c);
          const dl = daysLeft(c.contractDeadline);
          const dd = t => deliverables.filter(d=>d.contractId===c.id&&d.stage==="done"&&d.type===t).length;
          const cp = posts.filter(p=>p.contractId===c.id&&(p.type==="post"||p.type==="reel")&&p.isPosted).length + dd("reel") + dd("post");
          const cs = posts.filter(p=>p.contractId===c.id&&p.type==="story"&&p.isPosted).length + dd("story");
          const cr = posts.filter(p=>p.contractId===c.id&&(p.type==="tiktok"||p.type==="repost")&&p.isPosted).length + dd("tiktok") + dd("repost");
          const tot = c.numPosts + c.numStories + c.numCommunityLinks + c.numReposts;
          const don = cp + cs + cr;
          const pct = tot > 0 ? Math.round(don/tot*100) : 0;

          return (
            <div key={c.id} onClick={()=>setSelectedId(c.id)}
              style={{ background:B1, border:`1px solid ${LN}`, borderRadius:14, overflow:"hidden", cursor:"pointer", transition:"all .18s", boxShadow:"0 1px 4px rgba(0,0,0,0.05)", opacity:c.archived?.75:1 }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=c.color;e.currentTarget.style.boxShadow=`0 4px 16px ${c.color}20`;}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=LN;e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.05)";}}>
              <div style={{ height:4, background:`linear-gradient(90deg, ${c.color}, ${c.color}80)` }}/>
              <div style={{ padding:"14px 16px" }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:10 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:15, color:TX, lineHeight:1.2, marginBottom:5 }}>{c.company}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:5, flexWrap:"wrap" }}>
                      {c.currency!=="BRL"&&<span style={{ fontSize:9, padding:"2px 7px", borderRadius:99, background:`${BLU}14`, color:BLU, fontWeight:700 }}>{c.currency}</span>}
                      {c.paymentType==="monthly"&&<span style={{ fontSize:9, padding:"2px 7px", borderRadius:99, background:`${TX3}12`, color:TX3, fontWeight:700 }}>Mensal</span>}
                      {c.hasTravel&&<span style={{ fontSize:11 }}>✈️</span>}
                      {c.archived&&<span style={{ fontSize:9, padding:"2px 7px", borderRadius:99, background:`${TX3}12`, color:TX3, fontWeight:700 }}>Arquivado</span>}
                    </div>
                  </div>
                  <div style={{ textAlign:"right", flexShrink:0 }}>
                    {seeValues ? <>
                      <div style={{ fontWeight:800, fontSize:16, color:TX, letterSpacing:"-.01em" }}>{fmtMoney(total,c.currency)}</div>
                      {c.contractDeadline&&<div style={{ fontSize:11, color:dlColor(dl), marginTop:3, fontWeight:dl!==null&&dl<=14?700:400 }}>{fmtDate(c.contractDeadline)}</div>}
                    </> : <>
                      {c.contractDeadline&&<div style={{ fontSize:12, color:dlColor(dl), fontWeight:dl!==null&&dl<=14?700:400 }}>{fmtDate(c.contractDeadline)}</div>}
                    </>}
                  </div>
                </div>
                {tot > 0 && (
                  <>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:TX2, marginBottom:5 }}>
                      <span>Progresso de entregas</span>
                      <span style={{ fontWeight:700, color:pct===100?GRN:pct>50?AMB:TX }}>{don}/{tot} · {pct}%</span>
                    </div>
                    <div style={{ height:5, background:LN, borderRadius:3, overflow:"hidden" }}>
                      <div style={{ height:5, borderRadius:3, background:pct===100?GRN:c.color, width:`${pct}%`, transition:"width .5s ease" }}/>
                    </div>
                  </>
                )}
              </div>
            </div>
          );
        })}
        {displayContracts.length===0&&(
          <EmptyState
            icon={FileText}
            title={showArchived?"Nenhum contrato arquivado":"Nenhum contrato ativo"}
            sub={showArchived?"Arquive contratos concluídos clicando em 📦 na lista.":"Adicione o primeiro contrato pelo botão + Novo na barra superior."}
          />
        )}
      </div>
    </div>
  );

  // ── Desktop table view ──
  return (
    <div style={{ padding:24, maxWidth:1400 }}>
      {/* Archive toggle */}
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:16 }}>
        <div style={{ display:"flex", background:B2, border:`1px solid ${LN}`, borderRadius:8, overflow:"hidden" }}>
          <div onClick={()=>setShowArchived(false)}
            style={{ padding:"6px 16px", fontSize:11, fontWeight:!showArchived?700:400, cursor:"pointer", color:!showArchived?TX:TX2, background:!showArchived?B1:"transparent", transition:TRANS }}>
            Ativos ({activeContracts.length})
          </div>
          <div onClick={()=>setShowArchived(true)}
            style={{ padding:"6px 16px", fontSize:11, fontWeight:showArchived?700:400, cursor:"pointer", color:showArchived?TX:TX2, background:showArchived?B1:"transparent", transition:TRANS }}>
            Arquivados ({archivedContracts.length})
          </div>
        </div>
        {showArchived && <span style={{ fontSize:11, color:TX3, fontStyle:"italic" }}>Contratos concluídos · somente leitura</span>}
      </div>

      <div className="table-scroll">
      <div style={{ border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden", background:B1, boxShadow:"0 1px 4px rgba(0,0,0,0.06)", minWidth:860 }}>
        <div style={{ display:"grid", gridTemplateColumns:"3px 1fr 140px 120px 140px 100px 80px 80px 80px 70px", background:B2, borderBottom:`1px solid ${LN}`, padding:"8px 0" }}>
          {["","Empresa","Valor","Prazo","Pagamento","Prog.","Posts","Stories","Links",""].map((h,i)=>(
            <div key={i} style={{ padding:"0 12px", fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3 }}>{h}</div>
          ))}
        </div>
        {displayContracts.map(c=>{
          const dd2 = t => deliverables.filter(d=>d.contractId===c.id&&d.stage==="done"&&d.type===t).length;
          const cp=posts.filter(p=>p.contractId===c.id&&(p.type==="post"||p.type==="reel")&&p.isPosted).length + dd2("reel") + dd2("post");
          const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story"&&p.isPosted).length + dd2("story");
          const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link"&&p.isPosted).length + dd2("link");
          const cr2=deliverables.filter(d=>d.contractId===c.id&&d.stage==="done"&&(d.type==="tiktok"||d.type==="repost")).length;
          const cr=posts.filter(p=>p.contractId===c.id&&(p.type==="tiktok"||p.type==="repost")&&p.isPosted).length + cr2;
          const total=contractTotal(c); const dl=daysLeft(c.contractDeadline);
          const tot=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
          const don=cp+cs+cl+cr;
          return (
            <div key={c.id}
              onClick={()=>setSelectedId(c.id)}
              style={{ display:"grid", gridTemplateColumns:"3px 1fr 140px 120px 140px 100px 80px 80px 80px 80px", alignItems:"center", borderBottom:`1px solid ${LN}`, fontSize:12, cursor:"pointer", transition:TRANS, opacity:c.archived?.7:1 }}
              onMouseEnter={e=>e.currentTarget.style.background=B2}
              onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
              <div style={{ background:c.color, alignSelf:"stretch", minHeight:48 }}/>
              <div style={{ padding:"12px", display:"flex", alignItems:"center", gap:6, flexWrap:"wrap" }}>
                <span style={{ fontWeight:600, color:TX }}>{c.company}</span>
                {currBadge(c.currency)}
                {c.paymentType==="monthly"&&<Badge color={TX2}>M</Badge>}
                {c.hasTravel&&<Badge color={BLU}>✈️</Badge>}
                {c.archived&&<Badge color={TX3}>Arquivado</Badge>}
              </div>
              <div style={{ padding:"0 12px", fontWeight:700, color:TX }}>{seeValues&&total>0?fmtMoney(total,c.currency):"—"}</div>
              <div style={{ padding:"0 12px", color:dlColor(dl), fontWeight:dl!=null&&dl<=14?700:400 }}>{fmtDate(c.contractDeadline)}</div>
              <div style={{ padding:"0 12px", fontSize:11, color:TX2 }}>
                {c.paymentType==="monthly"&&`${seeValues?fmtMoney(c.monthlyValue):"—"}/mês`}
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
                {!c.archived && canEdit && <Btn onClick={()=>setModal({type:"contract",data:c})} variant="ghost" size="sm">✎</Btn>}
                {!c.archived && canEdit && <Btn onClick={()=>{if(window.confirm(`Arquivar "${c.company}"?`))archive(c.id);}} variant="ghost" size="sm" style={{color:TX2}} title="Arquivar contrato">📦</Btn>}
                {c.archived && <Btn onClick={()=>unarchive(c.id)} variant="ghost" size="sm" style={{color:GRN}} title="Desarquivar">↩</Btn>}
                {canEdit && <Btn onClick={()=>del(c.id)} variant="ghost" size="sm" style={{color:RED}}>×</Btn>}
              </div>
            </div>
          );
        })}
        {displayContracts.length===0&&(
          <EmptyState
            icon={FileText}
            title={showArchived?"Nenhum contrato arquivado":"Nenhum contrato ativo"}
            sub={showArchived?"Arquive contratos concluídos clicando em 📦 na tabela.":"Adicione o primeiro contrato pelo botão + Contrato acima."}
          />
        )}
      </div>
      </div>  {/* /table-scroll */}
    </div>
  );
}
function CalendarView({ contracts, deliverables=[], saveDeliverables, onEditDeliverable, onNewDeliverable, calEvents={}, calMonth, setCal, calFilter, setCalF }) {
  const isMobile = useIsMobile();
  const { y, m } = calMonth;
  const today    = startOfToday();
  const todayStr = today.toISOString().substr(0,10);
  const [dragOver, setDragOver] = useState(null);
  const [hoveredDate, setHoveredDate] = useState(null);

  const firstDay  = new Date(y, m, 1).getDay();
  const daysInMo  = new Date(y, m+1, 0).getDate();
  const MONTHS_LONG = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const DAY_LABELS  = isMobile ? ["D","S","T","Q","Q","S","S"] : ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];

  const cells = [];
  for(let i=0;i<firstDay;i++) cells.push(null);
  for(let d=1;d<=daysInMo;d++) cells.push(d);
  while(cells.length%7) cells.push(null);

  const prev = () => setCal(p=>{ const d=new Date(p.y,p.m-1,1); return{y:d.getFullYear(),m:d.getMonth()}; });
  const next = () => setCal(p=>{ const d=new Date(p.y,p.m+1,1); return{y:d.getFullYear(),m:d.getMonth()}; });

  // Filter deliverables for calendar
  const visibleDels = deliverables.filter(d => {
    if (!d?.plannedPostDate) return false;
    if (calFilter !== "all" && d.contractId !== calFilter) return false;
    return d.plannedPostDate.startsWith(`${y}-${String(m+1).padStart(2,"0")}`);
  });

  // Contract events (payments, deadlines) from calEvents — exclude deliverable type
  const contractEventsFor = (ds) => (calEvents[ds]||[]).filter(e=>e.type!=="deliverable"&&!e.dashed&&!e.isTravelPeriod);
  const travelFor         = (ds) => (calEvents[ds]||[]).filter(e=>e.isTravel||e.isTravelPeriod);

  // Stage badge map
  const SBADGE = {
    briefing:   ["Só a ideia",  "#94A3B8"],
    roteiro:    ["Roteirizando","#7C3AED"],
    ap_roteiro: ["Ap. Roteiro", "#D97706"],
    gravacao:   ["Gravação",    "#BE185D"],
    edicao:     ["Edição",      "#2563EB"],
    ap_final:   ["Ap. Final",   "#EA580C"],
    postagem:   ["Publicando",  "#0891B2"],
    done:       ["Postado",     "#16A34A"],
  };

  // Drag handlers
  const handleDragStart = (e, delId) => {
    e.dataTransfer.setData("text/plain", delId);
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDrop = (e, ds) => {
    e.preventDefault();
    setDragOver(null);
    const id = e.dataTransfer.getData("text/plain");
    if (!id || !saveDeliverables) return;
    const updated = deliverables.map(d => d.id===id ? {...d, plannedPostDate:ds} : d);
    saveDeliverables(updated);
  };

  // DeliverableCard inside calendar
  const CalCard = ({ del }) => {
    const contract = contracts.find(c=>c.id===del.contractId);
    const [badge, color] = SBADGE[del.stage] || ["Briefing","#94A3B8"];
    const [hov, setHov] = useState(false);
    return (
      <div
        draggable
        onDragStart={e=>handleDragStart(e,del.id)}
        onDragEnd={()=>setDragOver(null)}
        onClick={e=>{e.stopPropagation();onEditDeliverable?.(del);}}
        onMouseEnter={()=>setHov(true)}
        onMouseLeave={()=>setHov(false)}
        style={{
          background: hov ? "#FAFAFA" : B1,
          border: `1px solid ${hov?LN2:LN}`,
          borderLeft: `3px solid ${contract?.color||TX3}`,
          borderRadius: 6,
          padding: "4px 7px",
          marginBottom: 3,
          cursor: "pointer",
          boxShadow: hov ? "0 2px 8px rgba(0,0,0,0.1)" : "0 1px 2px rgba(0,0,0,0.05)",
          transform: hov ? "translateY(-1px)" : "none",
          transition: "all .15s ease",
          userSelect: "none",
        }}>
        <div style={{ display:"flex", alignItems:"center", gap:4 }}>
          <span style={{ fontSize:9, flexShrink:0, opacity:.7 }}>📄</span>
          <span style={{ fontSize:10, fontWeight:500, color:TX, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.3 }}>
            {del.title}
          </span>
        </div>
        <div style={{ marginTop:3 }}>
          <span style={{ fontSize:8, fontWeight:700, padding:"1px 5px", borderRadius:99, background:`${color}18`, color, letterSpacing:".03em" }}>{badge}</span>
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* ── Month nav ── */}
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
        <h2 style={{fontSize:16,fontWeight:700,color:TX,flex:1,letterSpacing:"-.01em"}}>{MONTHS_LONG[m]} {y}</h2>
        <button onClick={prev} style={{background:"none",border:`1px solid ${LN}`,borderRadius:6,width:30,height:30,cursor:"pointer",color:TX2,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>‹</button>
        <button onClick={()=>setCal({y:today.getFullYear(),m:today.getMonth()})} style={{background:"none",border:`1px solid ${LN}`,borderRadius:6,padding:"0 14px",height:30,cursor:"pointer",color:TX2,fontSize:11,fontWeight:700}}>Hoje</button>
        <button onClick={next} style={{background:"none",border:`1px solid ${LN}`,borderRadius:6,width:30,height:30,cursor:"pointer",color:TX2,fontSize:18,display:"flex",alignItems:"center",justifyContent:"center"}}>›</button>
      </div>

      {/* ── Contract filter pills ── */}
      <div style={{display:"flex",gap:6,overflowX:"auto",paddingBottom:10,marginBottom:14,scrollbarWidth:"none"}}>
        <div onClick={()=>setCalF("all")} style={{padding:"4px 12px",fontSize:10,fontWeight:700,cursor:"pointer",borderRadius:99,flexShrink:0,background:calFilter==="all"?TX:B2,color:calFilter==="all"?"white":TX2,border:`1px solid ${calFilter==="all"?TX:LN}`,transition:TRANS}}>
          Todos
        </div>
        {contracts.map(c=>(
          <div key={c.id} onClick={()=>setCalF(calFilter===c.id?"all":c.id)}
            style={{padding:"4px 12px",fontSize:10,fontWeight:600,cursor:"pointer",borderRadius:99,flexShrink:0,display:"flex",alignItems:"center",gap:5,
              background:calFilter===c.id?`${c.color}18`:B2,
              color:calFilter===c.id?c.color:TX2,
              border:`1px solid ${calFilter===c.id?c.color+"50":LN}`,
              transition:TRANS}}>
            <div style={{width:6,height:6,borderRadius:"50%",background:c.color,flexShrink:0}}/>{c.company.split("/")[0].trim().slice(0,14)}
          </div>
        ))}
      </div>

      {/* ── Grid ── */}
      <div style={{border:`1px solid ${LN}`,borderRadius:12,overflow:"hidden",boxShadow:"0 1px 4px rgba(0,0,0,0.05)"}}>
        {/* Day headers */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",background:B2,borderBottom:`1px solid ${LN}`}}>
          {DAY_LABELS.map((d,i)=>(
            <div key={i} style={{padding:"10px 0",textAlign:"center",fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3}}>{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:"1px",background:LN}}>
          {cells.map((d,i)=>{
            if(!d) return <div key={`e${i}`} style={{minHeight:isMobile?48:110,background:"#FAFAFA"}}/>;
            const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const isT = ds===todayStr;
            const isDragTarget = dragOver===ds;
            const dayDels  = visibleDels.filter(del=>del.plannedPostDate===ds);
            const cEvents  = contractEventsFor(ds);
            const travels  = travelFor(ds);
            const cellHov  = hoveredDate===ds;

            return (
              <div key={d}
                onMouseEnter={()=>setHoveredDate(ds)}
                onMouseLeave={()=>setHoveredDate(null)}
                onDragOver={e=>{e.preventDefault();setDragOver(ds);}}
                onDragLeave={e=>{if(!e.currentTarget.contains(e.relatedTarget))setDragOver(null);}}
                onDrop={e=>handleDrop(e,ds)}
                onClick={isMobile&&(dayDels.length>0||onNewDeliverable)?()=>setHoveredDate(hoveredDate===ds?null:ds):undefined}
                style={{
                  minHeight: isMobile?52:110,
                  padding: isMobile?"5px 4px":"6px 7px",
                  background: isDragTarget?`${RED}06`:isT?`${RED}04`:(isMobile&&hoveredDate===ds)?`${RED}04`:cellHov&&!isMobile?B2:B1,
                  border: isDragTarget?`1px solid ${RED}40`:"none",
                  transition:"background .12s",
                  position:"relative",
                  cursor: isMobile?(dayDels.length>0||onNewDeliverable)?"pointer":"default":"default",
                }}>

                {/* Day number + add button */}
                <div style={{marginBottom:isMobile?3:4,display:"flex",alignItems:"center",justifyContent:isMobile?"center":"space-between"}}>
                  {isT
                    ? <span style={{width:22,height:22,borderRadius:"50%",background:RED,color:"#fff",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700}}>{d}</span>
                    : <span style={{fontSize:11,fontWeight:400,color:hoveredDate===ds&&isMobile?RED:TX2}}>{d}</span>
                  }
                  <div style={{display:"flex",alignItems:"center",gap:4}}>
                    {!isMobile && travels.length>0 && <span title={travels[0].label} style={{fontSize:11}}>✈️</span>}
                    {!isMobile && cellHov && onNewDeliverable && (
                      <button
                        onClick={e=>{e.stopPropagation();onNewDeliverable(ds);}}
                        title={`Novo entregável em ${fmtDate(ds)}`}
                        style={{width:18,height:18,borderRadius:4,background:RED,border:"none",color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1,flexShrink:0,boxShadow:"0 1px 4px rgba(200,16,46,.3)"}}>
                        +
                      </button>
                    )}
                  </div>
                </div>

                {/* Deliverable cards (desktop) */}
                {!isMobile && dayDels.map(del=>(
                  <CalCard key={del.id} del={del}/>
                ))}

                {/* Mobile: pill indicators */}
                {isMobile && dayDels.length>0 && (
                  <div style={{display:"flex",gap:2,flexWrap:"wrap",justifyContent:"center",marginTop:2}}>
                    {dayDels.slice(0,3).map((del,i)=>{
                      const c=contracts.find(x=>x.id===del.contractId);
                      return <div key={i} style={{width:6,height:6,borderRadius:"50%",background:c?.color||TX3}}/>;
                    })}
                    {dayDels.length>3&&<div style={{width:6,height:6,borderRadius:"50%",background:TX3}}/>}
                  </div>
                )}
                {isMobile && travels.length>0 && <div style={{textAlign:"center",fontSize:10,marginTop:2}}>✈️</div>}

                {/* Contract events (payment, deadline) — small badges (desktop only) */}
                {!isMobile && cEvents.slice(0,2).map((ev,ei)=>(
                  <div key={ei} style={{fontSize:8,fontWeight:700,padding:"1px 5px",marginBottom:2,borderRadius:3,background:`${ev.color}14`,color:ev.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textTransform:"uppercase",letterSpacing:".03em"}}>
                    {ev.label}
                  </div>
                ))}

                {!isMobile && dayDels.length>3 && (
                  <div style={{fontSize:9,color:TX3,fontWeight:600,marginTop:2}}>+{dayDels.length-3} mais</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Mobile day detail panel ── */}
      {isMobile && hoveredDate && (
        <div style={{ marginTop:12, background:B1, border:`1px solid ${LN}`, borderRadius:14, overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.08)" }}>
          <div style={{ padding:"12px 16px", borderBottom:`1px solid ${LN}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:TX }}>
                {new Date(hoveredDate+"T12:00:00").toLocaleDateString("pt-BR",{weekday:"long",day:"numeric",month:"long"})}
              </div>
              <div style={{ fontSize:11, color:TX2, marginTop:2 }}>
                {visibleDels.filter(d=>d.plannedPostDate===hoveredDate).length} entregável(is)
              </div>
            </div>
            <div style={{ display:"flex", gap:8, alignItems:"center" }}>
              {onNewDeliverable && (
                <button onClick={()=>onNewDeliverable(hoveredDate)}
                  style={{ background:RED, border:"none", borderRadius:8, padding:"7px 14px", color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer", display:"flex", alignItems:"center", gap:5 }}>
                  + Criar
                </button>
              )}
              <button onClick={()=>setHoveredDate(null)}
                style={{ background:B2, border:`1px solid ${LN}`, borderRadius:8, padding:"7px 10px", color:TX2, fontSize:12, cursor:"pointer" }}>×</button>
            </div>
          </div>
          <div style={{ padding:"8px" }}>
            {visibleDels.filter(d=>d.plannedPostDate===hoveredDate).length === 0
              ? <div style={{ padding:"20px", textAlign:"center", color:TX3, fontSize:13 }}>Nenhum entregável neste dia</div>
              : visibleDels.filter(d=>d.plannedPostDate===hoveredDate).map(del=>(
                <div key={del.id} onClick={()=>onEditDeliverable?.(del)}
                  style={{ padding:"12px 14px", borderRadius:10, border:`1px solid ${LN}`, marginBottom:6, cursor:"pointer", background:B1, transition:"all .15s" }}
                  onMouseEnter={e=>e.currentTarget.style.background=B2}
                  onMouseLeave={e=>e.currentTarget.style.background=B1}>
                  {(() => {
                    const contract = contracts.find(c=>c.id===del.contractId);
                    const [badge, color] = SBADGE[del.stage] || ["Briefing","#94A3B8"];
                    return (
                      <>
                        <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                          <div style={{ width:10, height:10, borderRadius:"50%", background:contract?.color||TX3, flexShrink:0 }}/>
                          <span style={{ fontSize:13, fontWeight:600, color:TX, flex:1 }}>{del.title}</span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:`${color}14`, color }}>{badge}</span>
                          {contract && <span style={{ fontSize:11, color:TX2 }}>{contract.company}</span>}
                        </div>
                      </>
                    );
                  })()}
                </div>
              ))
            }
            {/* Contract events for this day */}
            {contractEventsFor(hoveredDate).map((ev,i)=>(
              <div key={i} style={{ padding:"8px 14px", borderRadius:8, border:`1px solid ${ev.color}20`, marginBottom:4, background:`${ev.color}06` }}>
                <span style={{ fontSize:11, fontWeight:700, color:ev.color }}>{ev.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Legend (desktop) ── */}
      {!isMobile && (
        <div style={{display:"flex",gap:16,marginTop:12,flexWrap:"wrap"}}>
          {Object.entries(SBADGE||{}).map(([k,[l,c]])=>(
            <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:10,color:TX2}}>
              <span style={{width:8,height:8,borderRadius:2,background:`${c}30`,border:`1.5px solid ${c}`,display:"inline-block"}}/>
              {l}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Calendario({ contracts, calEvents, calMonth, setCal, calFilter, setCalF }) {
  const isMobile = useIsMobile();
  return (
    <div style={{ padding:isMobile?"12px":24, maxWidth:1400 }}>
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
              <span style={{fontSize:11,color:TX2}}>Comissão Ranked (a pagar) (20% s/ líquido)</span>
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



// ─── Skeleton loaders ─────────────────────────────────────
function Sk({ w="100%", h=14, r=6 }) {
  return <div style={{ width:w, height:h, borderRadius:r, background:B3, animation:"skPulse 1.5s ease-in-out infinite" }}/>;
}
function DashboardSkeleton() {
  return (
    <div style={{ padding:24 }}>
      <style>{`@keyframes skPulse{0%,100%{opacity:1}50%{opacity:.4}}`}</style>
      <Sk w={240} h={28} r={8}/><div style={{height:8}}/><Sk w={180} h={14} r={6}/><div style={{height:28}}/>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
        {[0,1,2,3].map(i=>(
          <div key={i} style={{ ...G, padding:"18px 20px" }}>
            <Sk w={80} h={10} r={4}/><div style={{height:12}}/><Sk w={120} h={26} r={6}/><div style={{height:8}}/><Sk w={100} h={11} r={4}/>
          </div>
        ))}
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
        {[0,1].map(i=>(
          <div key={i} style={{ ...G, padding:20 }}>
            <Sk w={140} h={14} r={4}/><div style={{height:16}}/>
            {[0,1,2,3,4].map(j=>(
              <div key={j} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <Sk w={8} h={8} r="50%"/><Sk w={160} h={12} r={4}/><div style={{flex:1}}/><Sk w={48} h={12} r={4}/>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
function TableSkeleton({ rows=5 }) {
  return (
    <div style={{ padding:24 }}>
      <div style={{ background:B1, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
        <div style={{ padding:"12px 16px", background:B2, display:"flex", gap:24, borderBottom:`1px solid ${LN}` }}>
          {[200,120,100,140,80].map((w,i)=><Sk key={i} w={w} h={11} r={4}/>)}
        </div>
        {Array.from({length:rows},(_,i)=>(
          <div key={i} style={{ padding:"14px 16px", display:"flex", gap:24, alignItems:"center", borderBottom:i<rows-1?`1px solid ${LN}`:"none" }}>
            <Sk w={12} h={12} r="50%"/><Sk w={180} h={13} r={4}/><Sk w={100} h={12} r={4}/><Sk w={80} h={12} r={4}/><div style={{flex:1}}/><Sk w={60} h={11} r={4}/>
          </div>
        ))}
      </div>
    </div>
  );
}
function PipelineSkeleton() {
  return (
    <div style={{ padding:24, overflowX:"auto" }}>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(8,minmax(160px,1fr))", gap:8, minWidth:1200 }}>
        {Array.from({length:8},(_,col)=>(
          <div key={col} style={{ background:B2, border:`1px solid ${LN}`, borderRadius:10, overflow:"hidden" }}>
            <div style={{ padding:"10px 12px", borderBottom:`1px solid ${LN}`, background:B1 }}><Sk w={80} h={11} r={4}/></div>
            <div style={{ padding:8, display:"flex", flexDirection:"column", gap:6 }}>
              {Array.from({length:Math.floor(Math.random()*2)+1},(_,r)=>(
                <div key={r} style={{ background:B1, border:`1px solid ${LN}`, borderRadius:8, padding:"10px 12px" }}>
                  <Sk w="80%" h={12} r={4}/><div style={{height:8}}/><Sk w={60} h={10} r={4}/>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────
function EmptyState({ icon:Icon, title, sub, action, actionLabel }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"64px 24px", gap:16, textAlign:"center" }}>
      <div style={{ width:64, height:64, borderRadius:16, background:B2, border:`1.5px solid ${LN}`, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <Icon size={28} color={TX3} strokeWidth={1.5}/>
      </div>
      <div>
        <div style={{ fontSize:14, fontWeight:700, color:TX, marginBottom:6 }}>{title}</div>
        <div style={{ fontSize:12, color:TX2, maxWidth:340, lineHeight:1.6 }}>{sub}</div>
      </div>
      {action && (
        <button onClick={action}
          style={{ marginTop:4, padding:"8px 20px", background:RED, border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:"pointer" }}>
          {actionLabel||"Adicionar"}
        </button>
      )}
    </div>
  );
}

// ─── View Renderer (catches per-view errors) ──────────────
function ViewRenderer({ view, contracts, posts, deliverables, stats, rates, saveNote, toggleComm,
  toggleCommPaid, toggleNF, setModal, setView, saveC, saveP, saveD,
  calEvents, calMonth, setCal, calFilter, setCalF,
  triggerNewTask, setTriggerNewTask, role, userName, syncStatus }) {
  const [err, setErr] = useState(null);
  useEffect(() => { setErr(null); }, [view]);
  const activeContracts = contracts.filter(c=>!c.archived);

  // Show skeleton on first data load (contracts empty and still loading)
  if (syncStatus === "loading" && contracts.length === 0) {
    if (view === "contratos") return <TableSkeleton rows={6}/>;
    if (view === "acompanhamento") return <PipelineSkeleton/>;
    return <DashboardSkeleton/>;
  }
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
    if (view==="dashboard")      return <Dashboard contracts={activeContracts} posts={posts} deliverables={deliverables} stats={stats} rates={rates} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} setModal={setModal} navigateTo={setView} role={role} userName={userName}/>;
    if (view==="acompanhamento") return <Acompanhamento contracts={activeContracts} posts={posts} deliverables={deliverables} saveDeliverables={saveD} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF} role={role}/>;
    if (view==="contratos")      return <Contratos contracts={contracts} posts={posts} deliverables={deliverables} saveC={saveC} saveP={saveP} saveDeliverables={saveD} setModal={setModal} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} saveNote={saveNote} rates={rates} role={role}/>;
    if (view==="caixa")          return <Caixa contracts={activeContracts}/>;
    if (view==="financeiro")     return <Financeiro contracts={activeContracts} posts={posts} deliverables={deliverables} rates={rates} toggleNF={toggleNF} toggleCommPaid={toggleCommPaid} saveC={saveC} role={role}/>;
    return null;
  } catch(e) {
    setErr(e?.message || String(e));
    return null;
  }
}

// ─── Network metrics helper ───────────────────────────────
function sumNetworkMetrics(item, field) {
  const nm = item?.networkMetrics || {};
  const netTotal = Object.values(nm).reduce((s, net) => s + (Number(net[field])||0), 0);
  const flat = Number(item?.[field])||0;
  return netTotal > 0 ? netTotal : flat;
}


// ─── Client Report Modal ──────────────────────────────────
function ClientReport({ contract: c, posts, deliverables, rates, onClose }) {
  const [generating, setGenerating] = useState(false);
  const [aiSummary, setAiSummary] = useState(null);

  const cPosts = posts.filter(p => p.contractId === c.id && p.isPosted);
  const cDels  = deliverables.filter(d => d.contractId === c.id);

  // Aggregate metrics — supports both old flat fields and new networkMetrics per network
  const sumNetworkMetrics = (item, field) => {
    // New format: networkMetrics.Instagram.views etc
    const nm = item.networkMetrics || {};
    const netTotal = Object.values(nm).reduce((s, net) => s + (Number(net[field])||0), 0);
    // Also include flat field (legacy posts)
    const flat = Number(item[field])||0;
    return netTotal > 0 ? netTotal : flat;
  };
  const totalViews    = cPosts.reduce((s,p) => s+sumNetworkMetrics(p,"views"), 0) + cDels.reduce((s,d) => s+sumNetworkMetrics(d,"views"),0);
  const totalReach    = cPosts.reduce((s,p) => s+sumNetworkMetrics(p,"reach"), 0) + cDels.reduce((s,d) => s+sumNetworkMetrics(d,"reach"),0);
  const totalLikes    = cPosts.reduce((s,p) => s+sumNetworkMetrics(p,"likes"), 0) + cDels.reduce((s,d) => s+sumNetworkMetrics(d,"likes"),0);
  const totalComments = cPosts.reduce((s,p) => s+sumNetworkMetrics(p,"comments"), 0) + cDels.reduce((s,d) => s+sumNetworkMetrics(d,"comments"),0);
  const totalSaves    = cPosts.reduce((s,p) => s+sumNetworkMetrics(p,"saves"), 0) + cDels.reduce((s,d) => s+sumNetworkMetrics(d,"saves"),0);
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
                const pRch=sumNetworkMetrics(p,"reach"),pLk=sumNetworkMetrics(p,"likes"),pCm=sumNetworkMetrics(p,"comments");const eng=pRch>0?((pLk+pCm)/pRch*100):calcEngagement(p);
                return(
                  <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 90px 80px 80px",padding:"9px 14px",borderTop:`1px solid ${LN}`,fontSize:11,alignItems:"center"}}>
                    <div style={{fontWeight:500,color:TX}}>{p.title}{p.link&&<a href={p.link} target="_blank" rel="noreferrer" style={{color:RED,marginLeft:6,fontSize:10}}>↗</a>}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"views")||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"reach")||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"likes")||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"comments")||0).toLocaleString("pt-BR")||"—"}</div>
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
  if (type==="money")     return <svg style={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>;
  return null;
}

function MobileNav({ view, setView, role, userName, deliverables, contracts }) {
  const allowedNav = ROLE_NAV[role] || ROLE_NAV.admin;
  const today = new Date();
  const isSunday = today.getDay() === 0;

  const ALL_MOB = [
    { id:"dashboard",      label:"Home",      icon:"home" },
    { id:"acompanhamento", label:"Calendário", icon:"prod" },
    { id:"contratos",      label:"Contratos", icon:"contracts" },
    { id:"financeiro",     label:"Financeiro", icon:"money" },
    { id:"caixa",          label:"Caixa",      icon:"money" },
  ];

  const NAV_MOB = ALL_MOB.filter(item => allowedNav.includes(item.id)).slice(0, 4);

  const sendWA = () => {
    const name = userName || "time";
    const hour = today.getHours();
    const greet = hour<12?"Bom dia":hour<18?"Boa tarde":"Boa noite";
    const upcoming = (deliverables||[]).filter(d=>d.stage!=="done"&&d.plannedPostDate).sort((a,b)=>a.plannedPostDate.localeCompare(b.plannedPostDate)).slice(0,5);
    const msg = `${greet}, ${name}! 📱\n\n*Resumo semanal ENTREGAS*\n\n📋 Próximas postagens:\n${upcoming.map(d=>`• ${d.title} → ${fmtDate(d.plannedPostDate)}`).join("\n")||"Nenhuma agendada"}\n\nBoa semana! 🚀`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, "_blank");
  };

  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, background:B1, borderTop:`1px solid ${LN}`, display:"flex", alignItems:"stretch", zIndex:100, boxShadow:"0 -2px 16px rgba(0,0,0,0.1)", paddingBottom:"env(safe-area-inset-bottom,0px)" }}>
      {NAV_MOB.map(item => {
        const active = view === item.id;
        return (
          <div key={item.id} onClick={()=>setView(item.id)}
            style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, cursor:"pointer", padding:"10px 0 8px", position:"relative",
              borderTop: active ? `2px solid ${RED}` : "2px solid transparent",
              transition:"all .15s" }}>
            <NavIcon type={item.icon} active={active}/>
            <span style={{ fontSize:9, fontWeight:active?700:400, color:active?RED:"#ABABAB", letterSpacing:".02em" }}>{item.label}</span>
          </div>
        );
      })}
      {/* WhatsApp button — always last */}
      <div onClick={sendWA}
        style={{ width:52, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", gap:3, cursor:"pointer", padding:"10px 0 8px",
          borderTop: isSunday ? `2px solid #25D366` : "2px solid transparent",
          background: isSunday ? "rgba(37,211,102,.05)" : "transparent" }}>
        <span style={{ fontSize:18, lineHeight:1 }}>📱</span>
        <span style={{ fontSize:9, fontWeight:isSunday?700:400, color:isSunday?"#128C7E":"#ABABAB" }}>WA</span>
      </div>
    </div>
  );
}


// ─── Payments List ────────────────────────────────────────
function PaymentsList({ contracts, saveC, rates }) {
  const [openId, setOpenId] = useState(null);

  const payments = [];
  contracts.forEach(c => {
    const received = c.paymentsReceived || {};
    if (c.paymentType==="single" && c.paymentDeadline) {
      payments.push({ key:`${c.id}_single`, contractId:c.id, company:c.company, color:c.color, date:c.paymentDeadline, value:contractTotal(c), currency:c.currency, label:"Pagamento único", received:received["single"]||null });
    }
    if (c.paymentType==="split") {
      getInstallments(c).forEach((inst,i) => {
        if(inst.date) payments.push({ key:`${c.id}_parc${i+1}`, contractId:c.id, company:c.company, color:c.color, date:inst.date, value:inst.value, currency:c.currency, label:`${i+1}ª parcela`, received:received[`parc${i+1}`]||null });
      });
    }
    if (c.paymentType==="monthly" && c.contractDeadline) {
      payments.push({ key:`${c.id}_monthly`, contractId:c.id, company:c.company, color:c.color, date:c.contractDeadline, value:c.monthlyValue, currency:c.currency, label:"Mensalidade (prazo final)", received:received["monthly"]||null });
    }
  });
  payments.sort((a,b) => a.date.localeCompare(b.date));

  const totalReceived = payments.filter(p=>p.received).reduce((s,p)=>s+toBRL(p.value,p.currency,rates),0);
  const totalPending  = payments.filter(p=>!p.received).reduce((s,p)=>s+toBRL(p.value,p.currency,rates),0);

  const markReceived = async (key, contractId, instKey, dateStr) => {
    const c = contracts.find(x=>x.id===contractId);
    if (!c) return;
    const received = {...(c.paymentsReceived||{})};
    if (received[instKey]) {
      delete received[instKey];
    } else {
      received[instKey] = { date: dateStr || new Date().toISOString().substr(0,10) };
    }
    await saveC(contracts.map(x => x.id===contractId ? {...x, paymentsReceived:received} : x));
  };

  if (!payments.length) return <div style={{ textAlign:"center",padding:48,color:TX3 }}>Nenhum pagamento com data definida.</div>;

  return (
    <div>
      {/* Summary */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
        <div style={{ ...G, padding:"14px 16px", borderLeft:`3px solid ${GRN}` }}>
          <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Recebido</div>
          <div style={{ fontSize:18,fontWeight:700,color:GRN }}>{fmtMoney(totalReceived)}</div>
          <div style={{ fontSize:11,color:TX2 }}>{payments.filter(p=>p.received).length} pagamentos</div>
        </div>
        <div style={{ ...G, padding:"14px 16px", borderLeft:`3px solid ${AMB}` }}>
          <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>A receber</div>
          <div style={{ fontSize:18,fontWeight:700,color:AMB }}>{fmtMoney(totalPending)}</div>
          <div style={{ fontSize:11,color:TX2 }}>{payments.filter(p=>!p.received).length} pendentes</div>
        </div>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
        {payments.map((p) => {
          const dl = daysLeft(p.date);
          const instKey = p.key.replace(`${p.contractId}_`,"");
          const isOpen = openId === p.key;
          const recDate = p.received?.date;

          return (
            <div key={p.key} style={{ ...G, overflow:"hidden", borderLeft:p.received?`3px solid ${GRN}`:`3px solid ${LN}` }}>
              <div style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 18px", cursor:"pointer" }}
                onClick={()=>setOpenId(isOpen?null:p.key)}>
                <div style={{ width:8,height:8,borderRadius:"50%",background:p.color,flexShrink:0 }}/>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600,fontSize:13,color:TX }}>{p.company}</div>
                  <div style={{ fontSize:11,color:TX2 }}>{p.label}</div>
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ fontSize:13,fontWeight:700,color:TX }}>{fmtMoney(p.value,p.currency)}</div>
                  <div style={{ fontSize:11,color:TX2 }}>Previsto: {fmtDate(p.date)}</div>
                </div>
                <div style={{ minWidth:90, textAlign:"right" }}>
                  {p.received ? (
                    <div>
                      <div style={{ fontSize:11,fontWeight:700,color:GRN }}>✓ Recebido</div>
                      <div style={{ fontSize:10,color:TX2 }}>{fmtDate(recDate)}</div>
                    </div>
                  ) : (
                    <div style={{ fontSize:12,fontWeight:700,color:dlColor(dl) }}>
                      {dl===null?"—":dl<0?`${Math.abs(dl)}d atraso`:dl===0?"Hoje":`${dl}d`}
                    </div>
                  )}
                </div>
                <div style={{ fontSize:11,color:TX3 }}>{isOpen?"▲":"▼"}</div>
              </div>

              {isOpen && (
                <div style={{ padding:"12px 18px 16px", borderTop:`1px solid ${LN}`, background:B2 }}>
                  {p.received ? (
                    <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                      <div style={{ flex:1,fontSize:12,color:TX2 }}>
                        Recebido em <strong style={{color:TX}}>{fmtDate(recDate)}</strong>
                      </div>
                      <button onClick={()=>markReceived(p.key,p.contractId,instKey,null)}
                        style={{ padding:"5px 12px",fontSize:11,fontWeight:700,cursor:"pointer",borderRadius:6,background:"none",border:`1px solid ${LN2}`,color:TX2 }}>
                        Desmarcar
                      </button>
                    </div>
                  ) : (
                    <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
                      <div style={{ fontSize:12,color:TX2,flex:1 }}>Data de recebimento:</div>
                      <input type="date" id={`date-${p.key}`} defaultValue={new Date().toISOString().substr(0,10)}
                        style={{ padding:"6px 10px",fontSize:12,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
                      <button onClick={()=>{
                        const dateInput = document.getElementById(`date-${p.key}`);
                        markReceived(p.key,p.contractId,instKey,dateInput?.value||new Date().toISOString().substr(0,10));
                        setOpenId(null);
                      }} style={{ padding:"6px 16px",fontSize:11,fontWeight:700,cursor:"pointer",borderRadius:6,background:GRN,border:"none",color:"white" }}>
                        ✓ Marcar recebido
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ─── Financeiro View ──────────────────────────────────────
function Financeiro({ contracts, posts, deliverables, rates, toggleNF, toggleCommPaid, saveC, role }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState("visao");

  const totalBRL = contracts.reduce((s,c) => s + toBRL(contractTotal(c),c.currency,rates), 0);
  const totalCosts = contracts.reduce((s,c) => s + (c.costs||[]).reduce((a,x)=>a+(Number(x.value)||0),0), 0);
  const totalComm  = contracts.reduce((s,c) => {
    if (!c.hasCommission) return s;
    return s + getCommEntries(c).reduce((a,e)=>a+e.amount,0);
  }, 0);
  const commPaid   = contracts.reduce((s,c) => {
    if (!c.hasCommission) return s;
    return s + getCommEntries(c).filter(e=>e.isPaid).reduce((a,e)=>a+e.amount,0);
  }, 0);
  const commPend   = totalComm - commPaid;
  const nfPending  = contracts.filter(c => getNFEntries(c).some(e=>!e.isEmitted));

  const TABS = [
    { id:"visao",       label:"Visão Geral" },
    { id:"comissoes",   label:`Comissões (${contracts.filter(c=>c.hasCommission).length})` },
    { id:"nf",          label:`Notas Fiscais` },
    { id:"pagamentos",  label:"Pagamentos" },
  ];

  return (
    <div style={{ padding:isMobile?"16px 16px 80px":"24px 28px", maxWidth:1100 }}>
      {/* Header */}
      {!isMobile && (
        <div style={{ marginBottom:24 }}>
          <h1 style={{ fontSize:22, fontWeight:700, color:TX, letterSpacing:"-.02em", marginBottom:4 }}>Financeiro</h1>
          <p style={{ fontSize:13, color:TX2 }}>Gestão de NFs, comissões Ranked e pagamentos</p>
        </div>
      )}

      {/* Summary KPIs — horizontal scroll on mobile */}
      <div style={{ display:"flex", gap:10, overflowX:"auto", paddingBottom:4, marginBottom:20, scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
        {[
          { label:"Volume bruto", value:fmtMoney(totalBRL), sub:`${contracts.length} contratos` },
          { label:"Custos deduzidos", value:fmtMoney(totalCosts), sub:"passagens, equipe, etc.", accent:totalCosts>0?AMB:TX2 },
          { label:"Comissão a pagar", value:fmtMoney(commPend), sub:"pendente à Ranked", accent:commPend>0?RED:GRN },
          { label:"NFs a emitir", value:nfPending.length, sub:`de ${contracts.length} contratos`, accent:nfPending.length>0?AMB:GRN },
        ].map((k,i) => (
          <div key={i} style={{ ...G, padding:"16px 18px", flexShrink:0, minWidth:isMobile?160:undefined, flex:isMobile?"none":"1" }}>
            <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:8 }}>{k.label}</div>
            <div style={{ fontSize:isMobile?20:22,fontWeight:800,color:k.accent||TX,lineHeight:1,letterSpacing:"-.02em" }}>{k.value}</div>
            <div style={{ fontSize:11,color:TX3,marginTop:5 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs — horizontal scroll on mobile */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${LN}`, marginBottom:20, overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
        {TABS.map(t => (
          <div key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"10px 16px", fontSize:12, fontWeight:tab===t.id?700:400, cursor:"pointer", color:tab===t.id?TX:TX2, borderBottom:`2px solid ${tab===t.id?RED:"transparent"}`, transition:TRANS, marginBottom:-1, whiteSpace:"nowrap", flexShrink:0 }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Visão Geral */}
      {tab==="visao" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {contracts.map(c => {
            const gross = contractTotal(c);
            const costs = (c.costs||[]).reduce((s,x)=>s+(Number(x.value)||0),0);
            const net   = Math.max(0, gross - costs);
            const comm  = c.hasCommission ? getCommEntries(c).reduce((s,e)=>s+e.amount,0) : 0;
            const commP = c.hasCommission ? getCommEntries(c).filter(e=>e.isPaid).reduce((s,e)=>s+e.amount,0) : 0;
            const nfDone= getNFEntries(c).every(e=>e.isEmitted);
            return isMobile ? (
              /* Mobile: stacked card */
              <div key={c.id} style={{ ...G, overflow:"hidden" }}>
                <div style={{ height:3, background:c.color }}/>
                <div style={{ padding:"14px 16px" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:10 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:14, color:TX }}>{c.company}</div>
                      <div style={{ fontSize:11, color:TX3, marginTop:2 }}>
                        {c.contractDeadline?`prazo ${fmtDate(c.contractDeadline)}`:"Sem prazo"}
                      </div>
                    </div>
                    <div style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 9px", borderRadius:99, fontSize:10, fontWeight:700,
                      background: nfDone?`${GRN}15`:`${AMB}15`,
                      color: nfDone?GRN:AMB }}>
                      {nfDone?"✓ NF ok":"NF pendente"}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div style={{ background:B2, borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ fontSize:9, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Valor bruto</div>
                      <div style={{ fontSize:16, fontWeight:800, color:TX }}>{fmtMoney(gross,c.currency)}</div>
                      {costs>0&&<div style={{ fontSize:10, color:AMB, marginTop:2 }}>- {fmtMoney(costs)} custos</div>}
                    </div>
                    {c.hasCommission ? (
                      <div style={{ background:B2, borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:9, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Comissão Ranked</div>
                        <div style={{ fontSize:16, fontWeight:800, color:comm-commP>0?RED:GRN }}>{fmtMoney(comm,c.currency)}</div>
                        {commP===comm&&<div style={{ fontSize:10, color:GRN, marginTop:2 }}>✓ Quitado</div>}
                        {commP>0&&commP<comm&&<div style={{ fontSize:10, color:TX3, marginTop:2 }}>{fmtMoney(commP)} pago</div>}
                      </div>
                    ) : (
                      <div style={{ background:B2, borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:9, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Comissão</div>
                        <div style={{ fontSize:14, color:TX3 }}>Sem comissão</div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Desktop: grid row */
              <div key={c.id} style={{ ...G, padding:"14px 18px", display:"grid", gridTemplateColumns:"3px 1fr 130px 130px 130px 120px", alignItems:"center", gap:0 }}>
                <div style={{ background:c.color, alignSelf:"stretch", borderRadius:2 }}/>
                <div style={{ padding:"0 14px" }}>
                  <div style={{ fontWeight:600, fontSize:13, color:TX }}>{c.company}</div>
                  <div style={{ fontSize:11, color:TX2, marginTop:2 }}>
                    {c.currency!=="BRL"?currBadge(c.currency):null}
                    {c.paymentType==="monthly"?" · Mensal":""}
                    {c.contractDeadline?` · prazo ${fmtDate(c.contractDeadline)}`:""}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:TX2, marginBottom:2 }}>Valor bruto</div>
                  <div style={{ fontSize:14, fontWeight:700, color:TX }}>{fmtMoney(gross,c.currency)}</div>
                  {costs>0&&<div style={{ fontSize:10, color:AMB }}>- {fmtMoney(costs)} custos</div>}
                </div>
                <div>
                  <div style={{ fontSize:11, color:TX2, marginBottom:2 }}>Líquido</div>
                  <div style={{ fontSize:14, fontWeight:700, color:costs>0?TX:TX2 }}>{costs>0?fmtMoney(net,c.currency):"—"}</div>
                </div>
                <div>
                  <div style={{ fontSize:11, color:TX2, marginBottom:2 }}>Comissão Ranked</div>
                  {c.hasCommission ? (
                    <div>
                      <div style={{ fontSize:13, fontWeight:700, color:comm-commP>0?RED:GRN }}>{fmtMoney(comm,c.currency)}</div>
                      {commP>0&&commP<comm&&<div style={{ fontSize:10, color:TX2 }}>{fmtMoney(commP)} pago</div>}
                      {commP===comm&&<div style={{ fontSize:10, color:GRN }}>✓ Quitado</div>}
                    </div>
                  ) : <div style={{ fontSize:12, color:TX3 }}>—</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:99, fontSize:10, fontWeight:700,
                    background: nfDone?`${GRN}15`:`${AMB}15`,
                    color: nfDone?GRN:AMB,
                    border: `1px solid ${nfDone?GRN+"30":AMB+"30"}` }}>
                    {nfDone?"✓ NF ok":"NF pendente"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Comissões */}
      {tab==="comissoes" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {/* Summary bar */}
          <div style={{ ...G, padding:"14px 18px", display:"flex", alignItems:"center", gap:24, marginBottom:4 }}>
            <div>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Total comissão</div>
              <div style={{ fontSize:18,fontWeight:700,color:TX }}>{fmtMoney(totalComm)}</div>
            </div>
            <div>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Pago à Ranked</div>
              <div style={{ fontSize:18,fontWeight:700,color:GRN }}>{fmtMoney(commPaid)}</div>
            </div>
            <div>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Pendente</div>
              <div style={{ fontSize:18,fontWeight:700,color:commPend>0?RED:GRN }}>{fmtMoney(commPend)}</div>
            </div>
            <div style={{ flex:1 }}/>
            <div style={{ fontSize:11, color:TX2 }}>20% sobre valor líquido por contrato</div>
          </div>
          {contracts.filter(c=>c.hasCommission).map(c => {
            const entries = getCommEntries(c);
            return (
              <div key={c.id} style={{ ...G, padding:"14px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom: entries.length>1?12:0 }}>
                  <div style={{ width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0 }}/>
                  <span style={{ fontWeight:600,fontSize:13,color:TX,flex:1 }}>{c.company}</span>
                  <span style={{ fontSize:11,color:TX2 }}>Total: {fmtMoney(entries.reduce((s,e)=>s+e.amount,0),c.currency)}</span>
                </div>
                {entries.map((e,i) => (
                  <div key={e.key} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderTop:`1px solid ${LN}` }}>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:12, color:TX }}>{e.label}</span>
                      {e.date&&<span style={{ fontSize:11, color:TX2, marginLeft:8 }}>{fmtDate(e.date)}</span>}
                    </div>
                    <span style={{ fontSize:13, fontWeight:700, color:RED }}>{fmtMoney(e.amount,c.currency)}</span>
                    <div onClick={()=>toggleCommPaid(c.id,e.key)}
                      style={{ padding:"5px 14px", fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:6, transition:TRANS,
                        background:e.isPaid?`${GRN}15`:"rgba(0,0,0,.04)",
                        border:`1px solid ${e.isPaid?GRN+"44":LN2}`,
                        color:e.isPaid?GRN:TX2 }}>
                      {e.isPaid?"✓ Pago à Ranked":"Marcar pago"}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* NF */}
      {tab==="nf" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {contracts.map(c => {
            const entries = getNFEntries(c);
            if (!entries.length) return null;
            return (
              <div key={c.id} style={{ ...G, padding:"14px 18px" }}>
                <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:entries.length>1?12:0 }}>
                  <div style={{ width:8,height:8,borderRadius:"50%",background:c.color,flexShrink:0 }}/>
                  <span style={{ fontWeight:600,fontSize:13,color:TX,flex:1 }}>{c.company}</span>
                  <span style={{ fontSize:11,color:TX2 }}>{entries.filter(e=>e.isEmitted).length}/{entries.length} emitidas</span>
                </div>
                {entries.map((e,i) => (
                  <div key={e.key} style={{ display:"flex", alignItems:"center", gap:12, padding:"8px 0", borderTop:`1px solid ${LN}` }}>
                    <div style={{ flex:1 }}>
                      <span style={{ fontSize:12, color:TX }}>{e.label}</span>
                      {e.date&&<span style={{ fontSize:11, color:TX2, marginLeft:8 }}>{fmtDate(e.date)}</span>}
                    </div>
                    {e.amount>0&&<span style={{ fontSize:13, fontWeight:700, color:TX }}>{fmtMoney(e.amount,c.currency)}</span>}
                    <div onClick={()=>toggleNF(c.id,e.key)}
                      style={{ padding:"5px 14px", fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:6, transition:TRANS,
                        background:e.isEmitted?`${GRN}15`:"rgba(0,0,0,.04)",
                        border:`1px solid ${e.isEmitted?GRN+"44":LN2}`,
                        color:e.isEmitted?GRN:TX2 }}>
                      {e.isEmitted?"✓ Emitida":"Emitir NF"}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagamentos */}
      {tab==="pagamentos" && (
        <PaymentsList contracts={contracts} saveC={saveC} rates={rates}/>
      )}
    </div>
  );
}


// ─── Month Deliverables KPI ───────────────────────────────
function MonthDeliverables({ deliverables, contracts }) {
  const [offset, setOffset] = useState(0); // 0 = current month
  
  const getMonth = (off) => {
    const d = new Date();
    d.setMonth(d.getMonth() + off);
    return { y: d.getFullYear(), m: d.getMonth() };
  };

  const { y, m } = getMonth(offset);
  const monthKey = `${y}-${String(m+1).padStart(2,"0")}`;
  const monthLabel = new Date(y, m, 1).toLocaleDateString("pt-BR", { month:"long", year:"numeric" });
  const monthLabelShort = new Date(y, m, 1).toLocaleDateString("pt-BR", { month:"short" }).replace(".","");

  const monthDels = deliverables.filter(d => d.plannedPostDate?.startsWith(monthKey));
  const done   = monthDels.filter(d => d.stage === "done").length;
  const total  = monthDels.length;
  const byStage = {};
  monthDels.forEach(d => { byStage[d.stage] = (byStage[d.stage]||0)+1; });

  return (
    <div style={{ ...G, padding:"16px 18px", position:"relative" }}>
      {/* Nav arrows */}
      <div style={{ position:"absolute", top:10, right:10, display:"flex", gap:2 }}>
        <button onClick={()=>setOffset(o=>o-1)} style={{ background:"none", border:`1px solid ${LN}`, borderRadius:4, width:20, height:20, cursor:"pointer", color:TX2, fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>‹</button>
        <button onClick={()=>setOffset(0)} style={{ background:offset===0?TX2:"none", border:`1px solid ${LN}`, borderRadius:4, width:20, height:20, cursor:"pointer", color:offset===0?"white":TX2, fontSize:9, display:"flex", alignItems:"center", justifyContent:"center" }} title="Mês atual">●</button>
        <button onClick={()=>setOffset(o=>o+1)} style={{ background:"none", border:`1px solid ${LN}`, borderRadius:4, width:20, height:20, cursor:"pointer", color:TX2, fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>›</button>
      </div>

      <div style={{ fontSize:9, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2, marginBottom:6 }}>
        Entregas · {monthLabelShort} {y !== new Date().getFullYear() ? y : ""}
      </div>
      <div style={{ fontSize:20, fontWeight:700, color:TX, lineHeight:1, marginBottom:4 }}>
        {done}<span style={{ fontSize:13, color:TX2, fontWeight:400 }}>/{total}</span>
      </div>
      <div style={{ height:3, background:LN, borderRadius:2, marginBottom:6, overflow:"hidden" }}>
        <div style={{ height:3, borderRadius:2, background:total>0&&done===total?GRN:RED, width:`${total>0?Math.round(done/total*100):0}%`, transition:"width .4s" }}/>
      </div>
      {total === 0
        ? <div style={{ fontSize:10, color:TX3 }}>Sem entregáveis</div>
        : <div style={{ fontSize:10, color:TX2 }}>
            {byStage["done"]?`✓ ${byStage["done"]} entregues`:""}
            {byStage["postagem"]?` · 📅 ${byStage["postagem"]} para postar`:""}
            {total - (byStage["done"]||0) - (byStage["postagem"]||0) > 0
              ? ` · ⚙️ ${total-(byStage["done"]||0)-(byStage["postagem"]||0)} em prod.`:""}
          </div>
      }
    </div>
  );
}


// ─── Caixa: constants & helpers ──────────────────────────
const CAIXA_PASSWORD   = "ranked2026";
const BALANCE_PASSWORD = "Theus123";

const TX_TYPES = [
  { id:"entrada",       label:"Entrada",        emoji:"↓", color:"#16A34A" },
  { id:"saida",         label:"Saída",           emoji:"↑", color:"#C8102E" },
  { id:"dividendos",    label:"Dividendos",      emoji:"💰", color:"#7C3AED" },
  { id:"imposto",       label:"Imposto",         emoji:"🏛", color:"#EA580C" },
  { id:"transferencia", label:"Transferência",   emoji:"⇄", color:"#2563EB" },
];

const EXPENSE_CATS = {
  entrada:    ["Recebimento de Contrato","Receita Meta (Facebook/Instagram)","Receita YouTube","Receita TikTok","Receita Kwai","Rendimento Financeiro","Reembolso","Outros Ingressos"],
  saida:      ["Produção de Conteúdo","Equipamento","Passagem Aérea","Hospedagem","Alimentação","Viagem / Outros","Software / SaaS","Marketing","Pessoal / RH","Contabilidade","Móveis e Eletrodomésticos","Material de Escritório","Material de Limpeza","Aluguel / Condomínio","Obra / Reformas","Utilidades (Luz, Água, Internet)","Transporte / Estacionamento","Combustível","Uber / Táxi / App","Outros"],
  dividendos: ["Distribuição de Lucros","Pro-labore","Outros Dividendos"],
  imposto:    ["ISS","PIS/COFINS","IRPJ","CSLL","Simples Nacional","Outros Impostos"],
  transferencia:["Entre Contas"],
};

const DRE_MAP = {
  // Receitas
  "Recebimento de Contrato":          "receita_bruta",
  "Receita Meta (Facebook/Instagram)": "receita_bruta",
  "Receita YouTube":                  "receita_bruta",
  "Receita TikTok":                   "receita_bruta",
  "Receita Kwai":                     "receita_bruta",
  "Rendimento Financeiro":            "rec_financeira",
  "Reembolso":                        "outras_receitas",
  "Outros Ingressos":                 "outras_receitas",
  // Custo dos Serviços Prestados
  "Produção de Conteúdo":             "csp",
  "Equipamento":                      "csp",
  // Despesas Operacionais
  "Viagem":                           "desp_op",
  "Alimentação":                      "desp_op",
  "Hospedagem":                       "desp_op",
  "Marketing":                        "desp_op",
  // Despesas Gerais e Administrativas
  "Software / SaaS":                  "desp_adm",
  "Pessoal / RH":                     "desp_adm",
  "Contabilidade":                    "desp_adm",
  "Móveis e Eletrodomésticos":        "desp_adm",
  "Material de Escritório":           "desp_adm",
  "Material de Limpeza":              "desp_adm",
  "Viagem / Outros":                  "desp_op",
  "Passagem Aérea":                   "desp_op",
  "Obra / Reformas":                  "desp_adm",
  "Transporte / Estacionamento":       "desp_op",
  "Combustível":                        "desp_op",
  "Uber / Táxi / App":                 "desp_op",
  "Utilidades (Luz, Água, Internet)": "desp_adm",
  "Outros":                           "desp_adm",
  // Impostos sobre receita (deduções)
  "ISS":                              "deducoes",
  "PIS/COFINS":                       "deducoes",
  "Simples Nacional":                 "deducoes",
  "Outros Impostos":                  "deducoes",
  // IR e CSLL (após resultado operacional)
  "IRPJ":                             "ir_csll",
  "CSLL":                             "ir_csll",
  // Distribuição
  "Distribuição de Lucros":           "dividendos",
  "Pro-labore":                       "dividendos",
  "Outros Dividendos":                "dividendos",
};

function txColor(type) { return TX_TYPES.find(t=>t.id===type)?.color || "#6E6E6E"; }
function txEmoji(type) { return TX_TYPES.find(t=>t.id===type)?.emoji || "·"; }

// ─── Balance Password Button ───────────────────────────────
function EditBalanceButton({ acc, accounts, index, saveAcc }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [step, setStep] = useState("locked");
  const [newBalance, setNewBalance] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().substr(0,10));
  const [newNote, setNewNote] = useState("");
  const [err, setErr] = useState(false);

  const checkPw = () => {
    if (pw === BALANCE_PASSWORD) { setStep("editing"); setErr(false); setNewBalance(String(acc.balance||"0")); }
    else { setErr(true); setPw(""); }
  };

  const save = () => {
    const entry = { date:newDate, balance:Number(newBalance)||0, note:newNote };
    const history = [...(acc.balanceHistory||[]), entry].sort((a,b)=>a.date.localeCompare(b.date));
    const latest = history[history.length-1];
    const updated = [...accounts];
    updated[index] = {...acc, balance:latest.balance, balanceHistory:history};
    saveAcc(updated);
    setOpen(false); setStep("locked"); setPw(""); setNewBalance(""); setNewNote("");
  };

  if (!open) return (
    <button onClick={()=>setOpen(true)} style={{ width:"100%",padding:"7px",fontSize:11,fontWeight:600,cursor:"pointer",borderRadius:6,background:"none",border:`1px solid ${LN}`,color:TX2,display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
      🔒 Atualizar saldo
    </button>
  );

  return (
    <div style={{ background:B2,border:`1px solid ${LN}`,borderRadius:8,padding:"12px",marginTop:8 }}>
      {step==="locked" && <>
        <div style={{ fontSize:11,color:TX2,marginBottom:8,fontWeight:600 }}>Senha para editar saldo</div>
        <div style={{ display:"flex",gap:6 }}>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr(false);}} onKeyDown={e=>e.key==="Enter"&&checkPw()} autoFocus placeholder="••••••••"
            style={{ flex:1,padding:"7px 10px",fontSize:12,background:err?`${RED}08`:B1,border:`1px solid ${err?RED:LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
          <button onClick={checkPw} style={{ padding:"7px 12px",background:RED,border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer" }}>OK</button>
          <button onClick={()=>{setOpen(false);setErr(false);setPw("");}} style={{ padding:"7px 10px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>×</button>
        </div>
        {err&&<div style={{ fontSize:10,color:RED,marginTop:4 }}>Senha incorreta</div>}
      </>}
      {step==="editing" && <>
        <div style={{ fontSize:11,color:TX2,marginBottom:10,fontWeight:600 }}>Registrar novo saldo</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8 }}>
          <div>
            <div style={{ fontSize:9,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>Saldo (R$)</div>
            <input type="number" value={newBalance} onChange={e=>setNewBalance(e.target.value)} autoFocus
              style={{ width:"100%",padding:"7px 10px",fontSize:13,fontWeight:700,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
          </div>
          <div>
            <div style={{ fontSize:9,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>Data</div>
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
              style={{ width:"100%",padding:"7px 10px",fontSize:12,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
          </div>
        </div>
        <input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Observação (opcional)"
          style={{ width:"100%",padding:"7px 10px",fontSize:11,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",marginBottom:8 }}/>
        <div style={{ display:"flex",gap:6 }}>
          <button onClick={save} style={{ flex:1,padding:"7px",background:GRN,border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer" }}>✓ Salvar</button>
          <button onClick={()=>{setOpen(false);setStep("locked");setPw("");}} style={{ padding:"7px 12px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>Cancelar</button>
        </div>
      </>}
    </div>
  );
}

// ─── Transaction Form Modal ───────────────────────────────
function TransactionModal({ accounts, contracts, initial, onClose, onSave, defaultDate }) {
  const isEdit = !!initial?.id;
  const [f, setF] = useState(initial || {
    type:"saida", date:defaultDate||new Date().toISOString().substr(0,10),
    description:"", amount:"", category:"", originId:"",
    destId:"", nfLink:"", nfFile:null, contractId:"", notes:"", beneficiario:"", parcelaAtual:"", parcelaTotal:""
  });
  const set = (k,v) => setF(x=>({...x,[k]:v}));
  const cats = EXPENSE_CATS[f.type] || [];

  const [autoParc, setAutoParc] = useState(false);
  const [numParc, setNumParc]   = useState("");

  // Preview das parcelas futuras
  const parcPreview = useMemo(() => {
    if (!autoParc || !numParc || !f.date || !f.amount) return [];
    const n = parseInt(numParc);
    if (isNaN(n) || n < 2 || n > 120) return [];
    return Array.from({length:n}, (_,i) => {
      const d = new Date(f.date + "T12:00:00");
      d.setMonth(d.getMonth() + i);
      return { n:i+1, date:d.toISOString().substr(0,10) };
    });
  }, [autoParc, numParc, f.date, f.amount]);

  const handleSave = () => {
    if (!f.description || !f.amount) return alert("Preencha descrição e valor.");
    if (autoParc && numParc && parseInt(numParc) > 1) {
      const n = parseInt(numParc);
      const groupId = uid();
      const txs = parcPreview.map(p => ({
        ...f,
        id: uid(),
        groupId,
        installmentNum: p.n,
        installmentTotal: n,
        date: p.date,
        description: `${f.description} (${p.n}/${n})`,
      }));
      onSave(txs); // pass array for batch save
    } else {
      onSave({...f, id:f.id||uid()});
    }
  };

  return (
    <Modal title={isEdit?"Editar Lançamento":"Novo Lançamento"} onClose={onClose} width={580}
      footer={<>
        <Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn>
        <Btn onClick={handleSave} variant="primary" size="sm">
          {autoParc && numParc > 1 ? `Criar ${numParc}x parcelas` : "Salvar"}
        </Btn>
      </>}>

      <SRule>Tipo e Data</SRule>
      <div style={{ display:"flex",gap:6,marginBottom:12,flexWrap:"wrap" }}>
        {TX_TYPES.map(t=>(
          <div key={t.id} onClick={()=>set("type",t.id)}
            style={{ padding:"6px 12px",fontSize:11,fontWeight:700,cursor:"pointer",borderRadius:99,transition:TRANS,border:`1.5px solid ${f.type===t.id?t.color:LN}`,background:f.type===t.id?t.color+"18":"none",color:f.type===t.id?t.color:TX2 }}>
            {t.emoji} {t.label}
          </div>
        ))}
      </div>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
        <Field label="Data da 1ª parcela"><Input type="date" value={f.date} onChange={e=>set("date",e.target.value)}/></Field>
        <Field label="Valor por parcela (R$)"><Input type="number" min="0" step="0.01" value={f.amount} onChange={e=>set("amount",e.target.value)} placeholder="0,00"/></Field>
      </div>

      <SRule>Detalhes</SRule>
      <Field label="Descrição" full><Input value={f.description} onChange={e=>set("description",e.target.value)} placeholder="ex: MacBook Pro - parcelado"/></Field>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
        <Field label="Categoria">
          <Select value={f.category} onChange={e=>set("category",e.target.value)}>
            <option value="">Sem categoria</option>
            {cats.map(c=><option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <Field label="Vincular contrato">
          <Select value={f.contractId} onChange={e=>set("contractId",e.target.value)}>
            <option value="">Nenhum</option>
            {contracts.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}
          </Select>
        </Field>
        {f.type==="dividendos" && (
          <Field label="Beneficiário">
            <Select value={f.beneficiario||""} onChange={e=>set("beneficiario",e.target.value)}>
              <option value="">Selecione</option>
              <option value="Matheus">Matheus</option>
              <option value="Lucas">Lucas</option>
              <option value="Ambos">Ambos (50/50)</option>
            </Select>
          </Field>
        )}
      </div>

      {/* ── Parcelamento automático ── */}
      <SRule>Parcelamento</SRule>
      <div style={{ background:autoParc?`${BLU}06`:B2, border:`1px solid ${autoParc?BLU+"30":LN}`, borderRadius:10, padding:"14px 16px", transition:TRANS }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:autoParc?14:0 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:TX }}>Criar parcelas automaticamente</div>
            <div style={{ fontSize:11, color:TX3, marginTop:2 }}>Gera uma entrada por mês para cada parcela</div>
          </div>
          <div onClick={()=>setAutoParc(a=>!a)}
            style={{ width:44,height:24,borderRadius:99,background:autoParc?BLU:LN,cursor:"pointer",position:"relative",transition:TRANS,flexShrink:0 }}>
            <div style={{ width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:autoParc?22:2,transition:TRANS,boxShadow:"0 1px 3px rgba(0,0,0,0.15)" }}/>
          </div>
        </div>

        {autoParc && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="Nº de parcelas">
                <Input type="number" min="2" max="120" value={numParc} onChange={e=>setNumParc(e.target.value)} placeholder="ex: 12"/>
              </Field>
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end", paddingBottom:2 }}>
                {numParc && f.amount && parseInt(numParc)>0 && (
                  <div style={{ padding:"10px 12px", background:B1, borderRadius:8, border:`1px solid ${LN}` }}>
                    <div style={{ fontSize:10, color:TX3, marginBottom:3 }}>Total comprometido</div>
                    <div style={{ fontSize:16, fontWeight:800, color:RED }}>
                      {fmtMoney(parseFloat(f.amount||0) * parseInt(numParc||0))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Preview das parcelas */}
            {parcPreview.length > 0 && (
              <div>
                <div style={{ fontSize:10, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:TX3, marginBottom:8 }}>
                  Preview — {parcPreview.length} lançamentos serão criados
                </div>
                <div style={{ maxHeight:160, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                  {parcPreview.map(p => (
                    <div key={p.n} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:B1, borderRadius:6, border:`1px solid ${LN}` }}>
                      <span style={{ fontSize:10, fontWeight:700, color:BLU, width:32, flexShrink:0 }}>{p.n}/{numParc}</span>
                      <span style={{ fontSize:11, color:TX, flex:1 }}>{f.description} ({p.n}/{numParc})</span>
                      <span style={{ fontSize:11, color:TX2 }}>{fmtDate(p.date)}</span>
                      <span style={{ fontSize:11, fontWeight:700, color:RED }}>{fmtMoney(parseFloat(f.amount||0))}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {!autoParc && (
          <div style={{ fontSize:11, color:TX3, marginTop:4 }}>
            Lançamento único · ative para criar todas as parcelas de uma vez
          </div>
        )}
      </div>

      <SRule>Nota Fiscal & Obs.</SRule>
      <Field label="Número / Link da NF"><Input value={f.nfLink||""} onChange={e=>set("nfLink",e.target.value)} placeholder="Número ou URL da nota"/></Field>
      <Field label="Notas" full><Input value={f.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="Informações adicionais"/></Field>
    </Modal>
  );
}

// ─── DRE Component ────────────────────────────────────────
function DREView({ transactions, year }) {
  const txYear = transactions.filter(t => t.date?.startsWith(String(year)));

  const sum = (fn) => txYear.filter(fn).reduce((s,t)=>s+(Number(t.amount)||0),0);

  const receita_bruta  = sum(t=>t.type==="entrada"&&DRE_MAP[t.category]==="receita_bruta");
  const outras_receitas= sum(t=>t.type==="entrada"&&DRE_MAP[t.category]==="outras_receitas");
  const rec_financeira = sum(t=>t.type==="entrada"&&DRE_MAP[t.category]==="rec_financeira");
  const deducoes       = sum(t=>t.type==="imposto"&&DRE_MAP[t.category]==="deducoes");
  const receita_liq    = receita_bruta - deducoes;
  const csp            = sum(t=>t.type==="saida"&&DRE_MAP[t.category]==="csp");
  const lucro_bruto    = receita_liq - csp;
  const desp_op        = sum(t=>t.type==="saida"&&DRE_MAP[t.category]==="desp_op");
  const desp_adm       = sum(t=>t.type==="saida"&&DRE_MAP[t.category]==="desp_adm");
  const result_op      = lucro_bruto - desp_op - desp_adm + rec_financeira;
  const ir_csll        = sum(t=>t.type==="imposto"&&DRE_MAP[t.category]==="ir_csll");
  const lucro_liq      = result_op - ir_csll;
  const dividendos     = sum(t=>t.type==="dividendos");
  const lucro_retido   = lucro_liq - dividendos;

  const Row = ({label, value, indent=0, bold=false, total=false, positive=null}) => {
    const color = positive===null ? (bold||total?TX:TX2) : (value>=0?(positive?GRN:RED):(positive?RED:GRN));
    return (
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",padding:`${total?"10px":"6px"} ${indent*16}px`,borderTop:total?`1px solid ${LN}`:"none",borderBottom:total?`1px solid ${LN}`:"none",background:total?B2:"none" }}>
        <span style={{ fontSize:total?13:12,fontWeight:bold||total?700:400,color:TX,paddingLeft:indent*8 }}>{label}</span>
        <span style={{ fontSize:total?14:12,fontWeight:bold||total?700:400,color:value===0?TX3:color,fontVariantNumeric:"tabular-nums" }}>
          {value<0?`(${fmtMoney(Math.abs(value))})`:fmtMoney(value)}
        </span>
      </div>
    );
  };

  const Section = ({title}) => (
    <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,padding:"14px 0 4px",borderBottom:`1px solid ${LN}` }}>{title}</div>
  );

  return (
    <div style={{ ...G, padding:"20px 24px", maxWidth:700 }}>
      <div style={{ fontSize:14,fontWeight:700,color:TX,marginBottom:4 }}>DRE — Demonstração do Resultado do Exercício</div>
      <div style={{ fontSize:11,color:TX2,marginBottom:20 }}>Exercício {year} · Conforme Lei 6.404/76</div>

      <Section title="Receitas"/>
      <Row label="(+) Receita Operacional Bruta" value={receita_bruta} bold/>
      <Row label="(-) Deduções e Impostos sobre Receita" value={-deducoes} indent={1}/>
      <Row label="= Receita Líquida" value={receita_liq} total bold positive={true}/>

      <Section title="Custos"/>
      <Row label="(-) Custo dos Serviços Prestados (CSP)" value={-csp} indent={1}/>
      <Row label="= Lucro Bruto" value={lucro_bruto} total bold positive={true}/>

      <Section title="Despesas Operacionais"/>
      <Row label="(-) Despesas com Operações" value={-desp_op} indent={1}/>
      <Row label="(-) Despesas Gerais e Administrativas" value={-desp_adm} indent={1}/>
      <Row label="(+) Receitas Financeiras" value={rec_financeira} indent={1}/>
      <Row label="(+) Outras Receitas" value={outras_receitas} indent={1}/>
      <Row label="= Resultado Operacional (EBIT)" value={result_op} total bold positive={true}/>

      <Section title="Tributação"/>
      <Row label="(-) IRPJ e CSLL" value={-ir_csll} indent={1}/>
      <Row label="= Lucro Líquido do Exercício" value={lucro_liq} total bold positive={true}/>

      <Section title="Distribuição"/>
      <Row label="(-) Dividendos Distribuídos" value={-dividendos} indent={1}/>
      <Row label="= Lucro Retido / Prejuízo Acumulado" value={lucro_retido} total bold positive={true}/>

      <div style={{ marginTop:16,padding:"12px 14px",background:`${BLU}08`,border:`1px solid ${BLU}20`,borderRadius:8 }}>
        <div style={{ fontSize:10,color:TX2,marginBottom:4 }}>⚠️ Esta DRE é gerada automaticamente com base nos lançamentos cadastrados. Consulte seu contador para fins legais.</div>
      </div>
    </div>
  );
}

// ─── Caixa Dashboard ─────────────────────────────────────
function CaixaDash({ transactions, baseBalance, saldoTotal }) {
  const months = Array.from({length:12},(_,i)=>i);
  const currentYear = new Date().getFullYear();
  const MONTHS_SH2 = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const today = new Date();

  // ── Compromissos futuros (parcelamentos) ──
  const futureInstallments = useMemo(() => {
    const todayStr = today.toISOString().substr(0,10);
    const future = transactions.filter(t =>
      t.date > todayStr &&
      t.installmentTotal > 1 &&
      (t.type==="saida"||t.type==="imposto")
    );
    // Group by month
    const byMonth = {};
    future.forEach(t => {
      const key = t.date.substr(0,7); // YYYY-MM
      if (!byMonth[key]) byMonth[key] = { total:0, items:[] };
      byMonth[key].total += Number(t.amount)||0;
      byMonth[key].items.push(t);
    });
    return Object.entries(byMonth).sort(([a],[b])=>a.localeCompare(b)).slice(0,6);
  }, [transactions]);

  const totalFutureDebt = futureInstallments.reduce((s,[,v])=>s+v.total,0);

  const monthData = months.map(m => {
    const key = `${currentYear}-${String(m+1).padStart(2,"0")}`;
    const entradas   = transactions.filter(t=>t.date?.startsWith(key)&&t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
    const saidas     = transactions.filter(t=>t.date?.startsWith(key)&&(t.type==="saida"||t.type==="imposto")).reduce((s,t)=>s+(Number(t.amount)||0),0);
    const dividendos = transactions.filter(t=>t.date?.startsWith(key)&&t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
    return { month:MONTHS_SH2[m], entradas, saidas, dividendos, net:entradas-saidas-dividendos };
  });

  const maxVal = Math.max(...monthData.map(d=>Math.max(d.entradas,d.saidas)),1);

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      {/* Saldo card */}
      <div style={{ ...G,padding:"16px 20px",borderLeft:`3px solid ${saldoTotal>=0?GRN:RED}` }}>
        <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Saldo em caixa</div>
        <div style={{ fontSize:28,fontWeight:700,color:saldoTotal>=0?TX:RED }}>{fmtMoney(saldoTotal)}</div>
        <div style={{ fontSize:11,color:TX2,marginTop:4 }}>Base {fmtMoney(Number(baseBalance)||0)} + lançamentos</div>
      </div>

      {/* Compromissos futuros — parcelamentos */}
      {futureInstallments.length > 0 && (
        <div style={{ ...G, padding:"16px 20px", borderLeft:`3px solid ${AMB}` }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:2 }}>Compromissos futuros · Parcelamentos</div>
              <div style={{ fontSize:22,fontWeight:800,color:RED }}>{fmtMoney(totalFutureDebt)}</div>
              <div style={{ fontSize:11,color:TX3,marginTop:2 }}>total comprometido em parcelas futuras</div>
            </div>
            <span style={{ fontSize:22 }}>📋</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {futureInstallments.map(([key, val]) => {
              const [y,m] = key.split("-");
              const label = `${MONTHS_SH2[parseInt(m)-1]}/${y}`;
              const pct = Math.min(100, (val.total / Math.max(saldoTotal, val.total)) * 100);
              const isHeavy = saldoTotal > 0 && val.total / saldoTotal > 0.3;
              return (
                <div key={key}>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:4 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      <span style={{ fontSize:11, fontWeight:700, color:TX, width:60 }}>{label}</span>
                      <div style={{ display:"flex", gap:3 }}>
                        {val.items.slice(0,3).map((t,i)=>(
                          <span key={i} style={{ fontSize:9, padding:"1px 6px", borderRadius:99, background:`${AMB}14`, color:AMB, fontWeight:600, maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {t.description.replace(/\s*\(\d+\/\d+\)$/,"")}
                          </span>
                        ))}
                        {val.items.length>3&&<span style={{ fontSize:9,color:TX3 }}>+{val.items.length-3}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {isHeavy && <span style={{ fontSize:10, color:RED, fontWeight:700 }}>⚠ Alto</span>}
                      <span style={{ fontSize:12, fontWeight:800, color:RED }}>{fmtMoney(val.total)}</span>
                    </div>
                  </div>
                  <div style={{ height:4, background:LN, borderRadius:2, overflow:"hidden" }}>
                    <div style={{ height:4, borderRadius:2, background:isHeavy?RED:AMB, width:`${pct}%`, transition:"width .4s ease" }}/>
                  </div>
                </div>
              );
            })}
          </div>
          {saldoTotal > 0 && (
            <div style={{ marginTop:12, padding:"8px 12px", background:totalFutureDebt/saldoTotal>0.5?`${RED}08`:`${GRN}08`, borderRadius:8, fontSize:11 }}>
              <span style={{ fontWeight:700, color:totalFutureDebt/saldoTotal>0.5?RED:GRN }}>
                {totalFutureDebt/saldoTotal>0.5?"⚠ Parcelas comprometem":"✓ Parcelas representam"}
              </span>
              <span style={{ color:TX2 }}> {(totalFutureDebt/saldoTotal*100).toFixed(0)}% do saldo atual</span>
            </div>
          )}
        </div>
      )}

      {/* Decision KPIs */}
      {(() => {
        const months = Array.from({length:12},(_,i)=>i);
        const currentYear = new Date().getFullYear();
        const monthlyData = months.map(m => {
          const key = `${currentYear}-${String(m+1).padStart(2,"0")}`;
          const ent = transactions.filter(t=>t.date?.startsWith(key)&&t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
          const sai = transactions.filter(t=>t.date?.startsWith(key)&&(t.type==="saida"||t.type==="imposto")).reduce((s,t)=>s+(Number(t.amount)||0),0);
          return { ent, sai };
        }).filter(m => m.ent>0||m.sai>0);

        const totalEnt = transactions.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const totalSai = transactions.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const totalDiv = transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const lucroLiq = totalEnt - totalSai - totalDiv;

        const avgMonthlySai = monthlyData.length > 0 ? monthlyData.reduce((s,m)=>s+m.sai,0)/monthlyData.length : 0;
        const liquidez = avgMonthlySai > 0 ? saldoTotal / avgMonthlySai : null;
        const margemLucro = totalEnt > 0 ? (lucroLiq / totalEnt * 100) : null;
        const roi = totalSai > 0 ? ((totalEnt - totalSai) / totalSai * 100) : null;
        const burnRate = avgMonthlySai;

        const kpiColor = (val, good, warn) => val >= good ? GRN : val >= warn ? AMB : RED;
        const fmt1 = v => v.toFixed(1);

        return (
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
            {/* Liquidez */}
            <div style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${liquidez===null?LN:kpiColor(liquidez,3,1.5)}` }}>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Liquidez</div>
              <div style={{ fontSize:22,fontWeight:700,color:liquidez===null?TX3:kpiColor(liquidez,3,1.5) }}>
                {liquidez===null?"—":`${fmt1(liquidez)}x`}
              </div>
              <div style={{ fontSize:10,color:TX2,marginTop:3 }}>meses de runway</div>
              <div style={{ fontSize:9,color:TX3,marginTop:4 }}>
                {liquidez===null?"sem dados":liquidez>=3?"✓ Saudável":liquidez>=1.5?"⚠ Atenção":"🔴 Crítico"}
              </div>
            </div>

            {/* Margem de Lucro */}
            <div style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${margemLucro===null?LN:kpiColor(margemLucro,30,10)}` }}>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Margem Líquida</div>
              <div style={{ fontSize:22,fontWeight:700,color:margemLucro===null?TX3:kpiColor(margemLucro,30,10) }}>
                {margemLucro===null?"—":`${fmt1(margemLucro)}%`}
              </div>
              <div style={{ fontSize:10,color:TX2,marginTop:3 }}>lucro ÷ receita</div>
              <div style={{ fontSize:9,color:TX3,marginTop:4 }}>
                {margemLucro===null?"sem dados":margemLucro>=30?"✓ Excelente":margemLucro>=10?"⚠ Regular":"🔴 Baixa"}
              </div>
            </div>

            {/* ROI Operacional */}
            <div style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${roi===null?LN:kpiColor(roi,50,20)}` }}>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>ROI Operacional</div>
              <div style={{ fontSize:22,fontWeight:700,color:roi===null?TX3:kpiColor(roi,50,20) }}>
                {roi===null?"—":`${fmt1(roi)}%`}
              </div>
              <div style={{ fontSize:10,color:TX2,marginTop:3 }}>retorno sobre custos</div>
              <div style={{ fontSize:9,color:TX3,marginTop:4 }}>
                {roi===null?"sem dados":roi>=50?"✓ Excelente":roi>=20?"⚠ Regular":"🔴 Baixo"}
              </div>
            </div>

            {/* Burn Rate */}
            <div style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${BLU}` }}>
              <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Burn Rate</div>
              <div style={{ fontSize:22,fontWeight:700,color:TX }}>{fmtMoney(burnRate)}</div>
              <div style={{ fontSize:10,color:TX2,marginTop:3 }}>saídas/mês (média)</div>
              <div style={{ fontSize:9,color:TX3,marginTop:4 }}>base {monthlyData.length} meses</div>
            </div>
          </div>
        );
      })()}

      {/* Bar chart */}
      <div style={{ ...G,padding:"18px 20px" }}>
        <div style={{ fontSize:12,fontWeight:700,color:TX,marginBottom:4 }}>Entradas vs Saídas {currentYear}</div>
        <div style={{ display:"flex",gap:12,fontSize:10,color:TX2,marginBottom:16 }}>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:GRN,display:"inline-block" }}/>Entradas</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:RED,display:"inline-block" }}/>Saídas</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:"#7C3AED",display:"inline-block" }}/>Dividendos</span>
        </div>
        <div style={{ display:"flex",alignItems:"flex-end",gap:4,height:120 }}>
          {monthData.map((d,i)=>(
            <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
              <div style={{ width:"100%",display:"flex",gap:1,alignItems:"flex-end",height:100 }}>
                <div style={{ flex:1,background:GRN,height:`${maxVal>0?d.entradas/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",minHeight:d.entradas>0?3:0 }}/>
                <div style={{ flex:1,background:RED,height:`${maxVal>0?d.saidas/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",minHeight:d.saidas>0?3:0 }}/>
                {d.dividendos>0&&<div style={{ flex:1,background:"#7C3AED",height:`${maxVal>0?d.dividendos/maxVal*100:0}%`,borderRadius:"3px 3px 0 0" }}/>}
              </div>
              <div style={{ fontSize:8,color:TX3,textAlign:"center" }}>{d.month}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Dividend per person */}
      {transactions.filter(t=>t.type==="dividendos").length>0&&(
        <div style={{ ...G,padding:"18px 20px" }}>
          <div style={{ fontSize:12,fontWeight:700,color:TX,marginBottom:12 }}>Dividendos por Sócio</div>
          {[["Matheus","#C8102E"],["Lucas","#7C3AED"],["Ambos","#2563EB"]].map(([name,color])=>{
            const total = transactions.filter(t=>t.type==="dividendos"&&t.beneficiario===name).reduce((s,t)=>s+(Number(t.amount)||0),0);
            const totalAmbos = transactions.filter(t=>t.type==="dividendos"&&t.beneficiario==="Ambos").reduce((s,t)=>s+(Number(t.amount)||0),0);
            const effective = name==="Matheus"?total+(totalAmbos/2):name==="Lucas"?total+(totalAmbos/2):total;
            if (name==="Ambos"&&totalAmbos===0) return null;
            return (
              <div key={name} style={{ display:"flex",alignItems:"center",gap:12,padding:"10px 0",borderBottom:`1px solid ${LN}` }}>
                <div style={{ width:32,height:32,borderRadius:"50%",background:color+"18",border:`2px solid ${color}30`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0 }}>
                  {name==="Matheus"?"M":name==="Lucas"?"L":"A"}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600,fontSize:13,color:TX }}>{name}</div>
                  {name!=="Ambos"&&totalAmbos>0&&<div style={{ fontSize:10,color:TX2 }}>Direto {fmtMoney(total)} + {fmtMoney(totalAmbos/2)} (metade dos "Ambos")</div>}
                </div>
                <div style={{ fontWeight:700,fontSize:16,color }}>
                  {name==="Ambos"?fmtMoney(total):fmtMoney(effective)}
                </div>
              </div>
            );
          })}
          <div style={{ display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:`1px solid ${LN2}`,marginTop:4 }}>
            <span style={{ fontSize:11,color:TX2 }}>Total distribuído</span>
            <span style={{ fontWeight:700,fontSize:13,color:"#7C3AED" }}>{fmtMoney(transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0))}</span>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {transactions.length>0&&(
        <div style={{ ...G,padding:"18px 20px" }}>
          <div style={{ fontSize:12,fontWeight:700,color:TX,marginBottom:12 }}>Saídas por Categoria</div>
          {Object.entries(
            transactions.filter(t=>t.type==="saida"&&t.category).reduce((acc,t)=>{acc[t.category]=(acc[t.category]||0)+(Number(t.amount)||0);return acc;},{})
          ).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([cat,val],idx,arr)=>(
            <div key={cat} style={{ marginBottom:10 }}>
              <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4 }}>
                <span style={{ color:TX }}>{cat}</span>
                <span style={{ fontWeight:700,color:TX }}>{fmtMoney(val)}</span>
              </div>
              <div style={{ height:4,background:LN,borderRadius:2 }}>
                <div style={{ height:4,borderRadius:2,background:RED,width:`${val/arr[0][1]*100}%` }}/>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Caixa (Controle Financeiro Administrativo) ───────────
function CaixaPasswordGate({ onUnlock }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState(false);
  const [show, setShow] = useState(false);
  const check = () => {
    if (pw === CAIXA_PASSWORD) { onUnlock(); }
    else { setErr(true); setPw(""); setTimeout(()=>setErr(false),2000); }
  };
  return (
    <div style={{ display:"flex",alignItems:"center",justifyContent:"center",minHeight:"60vh" }}>
      <div style={{ ...G,padding:"40px 48px",maxWidth:380,width:"100%",textAlign:"center" }}>
        <div style={{ fontSize:32,marginBottom:16 }}>🔐</div>
        <div style={{ fontSize:16,fontWeight:700,color:TX,marginBottom:6 }}>Controle Financeiro</div>
        <div style={{ fontSize:12,color:TX2,marginBottom:24 }}>Acesso restrito · Administradores Ranked</div>
        <div style={{ display:"flex",gap:8,marginBottom:16 }}>
          <input type={show?"text":"password"} value={pw} onChange={e=>{setPw(e.target.value);setErr(false);}} onKeyDown={e=>e.key==="Enter"&&check()} placeholder="Senha" autoFocus
            style={{ flex:1,padding:"10px 14px",fontSize:13,background:err?`${RED}08`:B2,border:`1px solid ${err?RED:LN}`,borderRadius:8,color:TX,fontFamily:"inherit",outline:"none",transition:TRANS }}/>
          <button onClick={()=>setShow(s=>!s)} style={{ padding:"10px 12px",background:B2,border:`1px solid ${LN}`,borderRadius:8,cursor:"pointer",fontSize:13,color:TX2 }}>{show?"👁":"🙈"}</button>
        </div>
        {err&&<div style={{ fontSize:11,color:RED,marginBottom:12 }}>Senha incorreta</div>}
        <button onClick={check} style={{ width:"100%",padding:"11px",background:RED,border:"none",borderRadius:8,color:"white",fontSize:13,fontWeight:700,cursor:"pointer" }}>Acessar</button>
      </div>
    </div>
  );
}

function NewAccountModal({ onClose, onSave }) {
  const [f, setF] = useState({ name:"", bank:"", type:"corrente", balance:"" });
  const set = (k,v) => setF(x=>({...x,[k]:v}));
  return (
    <Modal title="Nova Conta" onClose={onClose} width={420}
      footer={<><Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn><Btn onClick={()=>{if(!f.name)return alert("Informe o nome.");onSave(f);}} variant="primary" size="sm">Criar</Btn></>}>
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        <Field label="Nome da conta"><Input value={f.name} onChange={e=>set("name",e.target.value)} placeholder="ex: Conta PJ Matheus"/></Field>
        <Field label="Banco"><Input value={f.bank} onChange={e=>set("bank",e.target.value)} placeholder="ex: Itaú, Bradesco, Inter"/></Field>
        <Field label="Tipo"><Select value={f.type} onChange={e=>set("type",e.target.value)}><option value="corrente">Conta Corrente</option><option value="poupanca">Poupança</option><option value="investimento">Investimento</option></Select></Field>
        <Field label="Saldo inicial (R$)"><Input type="number" value={f.balance} onChange={e=>set("balance",e.target.value)} placeholder="0,00"/></Field>
      </div>
    </Modal>
  );
}

// ─── Indicadores Financeiros ──────────────────────────────
function IndicadoresFinanceiros({ transactions, baseBalance, saldoTotal, contracts }) {
  const [year, setYear] = useState(new Date().getFullYear());
  const txYear = transactions.filter(t => t.date?.startsWith(String(year)));

  const receita    = txYear.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const despesas   = txYear.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const dividendos = txYear.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const lucroLiq   = receita - despesas - dividendos;
  const ebitda     = receita - despesas; // sem dividendos (não operacional)

  // Custos fixos vs variáveis (fixos = adm+aluguel+util+rh, variáveis = produção+viagem+marketing)
  const fixedCats = ["Pessoal / RH","Aluguel / Condomínio","Utilidades (Luz, Água, Internet)","Software / SaaS","Contabilidade","Material de Escritório","Material de Limpeza","Móveis e Eletrodomésticos"];
  const custoFixo = txYear.filter(t=>(t.type==="saida"||t.type==="imposto")&&fixedCats.includes(t.category)).reduce((s,t)=>s+(Number(t.amount)||0),0);
  const custoVar  = despesas - custoFixo;

  // Months with data
  const monthsWithData = new Set(txYear.map(t=>t.date?.substr(0,7))).size || 1;
  const despesaMensal = despesas / monthsWithData;

  // Indicators
  const liquidez       = despesaMensal > 0 ? saldoTotal / despesaMensal : null;
  const margemLucro    = receita > 0 ? (lucroLiq / receita * 100) : null;
  const margemBruta    = receita > 0 ? ((receita - despesas) / receita * 100) : null;
  const margemEBITDA   = receita > 0 ? (ebitda / receita * 100) : null;
  const roi            = despesas > 0 ? (lucroLiq / despesas * 100) : null;
  const ticketMedio    = contracts.length > 0 ? (contracts.reduce((s,c)=>s+(Number(c.contractValue)||Number(c.monthlyValue)||0),0) / contracts.length) : null;
  const pontoEquil     = receita > 0 && (1 - custoVar/receita) > 0 ? custoFixo / (1 - custoVar/receita) : null;

  // Prazo médio de recebimento (from contracts with payment dates)
  const pmr = (() => {
    const diffs = contracts.filter(c=>c.contractDeadline&&c.contractStart).map(c=>{
      const s = new Date(c.contractStart), e = new Date(c.contractDeadline);
      return Math.round((e-s)/(1000*60*60*24));
    }).filter(d=>d>0&&d<365);
    return diffs.length ? Math.round(diffs.reduce((s,d)=>s+d,0)/diffs.length) : null;
  })();

  const fmt2 = v => v != null ? v.toFixed(1) : "—";
  const fmtDias = v => v != null ? `${Math.round(v)} dias` : "—";

  const indicators = [
    {
      group: "Rentabilidade",
      items: [
        { label:"Margem de Lucro Líquida", value:margemLucro!=null?`${fmt2(margemLucro)}%`:"—", desc:"Lucro líquido / Receita", color:margemLucro!=null?(margemLucro>20?GRN:margemLucro>5?AMB:RED):TX2, good:margemLucro!=null&&margemLucro>20 },
        { label:"Margem Bruta", value:margemBruta!=null?`${fmt2(margemBruta)}%`:"—", desc:"(Receita − Despesas) / Receita", color:margemBruta!=null?(margemBruta>30?GRN:margemBruta>10?AMB:RED):TX2, good:margemBruta!=null&&margemBruta>30 },
        { label:"EBITDA", value:fmtMoney(ebitda), desc:"Resultado antes de impostos e dividendos", color:ebitda>=0?GRN:RED, good:ebitda>0 },
        { label:"Margem EBITDA", value:margemEBITDA!=null?`${fmt2(margemEBITDA)}%`:"—", desc:"EBITDA / Receita", color:margemEBITDA!=null?(margemEBITDA>25?GRN:margemEBITDA>10?AMB:RED):TX2, good:margemEBITDA!=null&&margemEBITDA>25 },
        { label:"ROI", value:roi!=null?`${fmt2(roi)}%`:"—", desc:"Lucro Líquido / Total Investido", color:roi!=null?(roi>0?GRN:RED):TX2, good:roi!=null&&roi>0 },
      ]
    },
    {
      group: "Liquidez & Caixa",
      items: [
        { label:"Liquidez (meses)", value:liquidez!=null?`${liquidez.toFixed(1)}x`:"—", desc:"Saldo atual cobre quantos meses de despesas", color:liquidez!=null?(liquidez>3?GRN:liquidez>1?AMB:RED):TX2, good:liquidez!=null&&liquidez>3 },
        { label:"Saldo em Caixa", value:fmtMoney(saldoTotal), desc:"Base inicial + lançamentos acumulados", color:saldoTotal>=0?TX:RED, good:saldoTotal>0 },
        { label:"Despesa Mensal Média", value:fmtMoney(despesaMensal), desc:`Média de ${monthsWithData} meses com dados`, color:TX2, good:null },
      ]
    },
    {
      group: "Operacional",
      items: [
        { label:"Ticket Médio Contratos", value:ticketMedio!=null?fmtMoney(ticketMedio):"—", desc:"Valor médio por contrato ativo", color:TX, good:null },
        { label:"Ponto de Equilíbrio", value:pontoEquil!=null?fmtMoney(pontoEquil):"—", desc:"Receita mínima para cobrir todos os custos", color:receita>0&&pontoEquil!=null?(receita>=pontoEquil?GRN:RED):TX2, good:receita>0&&pontoEquil!=null&&receita>=pontoEquil },
        { label:"Prazo Médio Recebimento", value:fmtDias(pmr), desc:"Média dos prazos de contratos", color:pmr!=null?(pmr<60?GRN:pmr<90?AMB:RED):TX2, good:pmr!=null&&pmr<60 },
        { label:"Prazo Médio Estoque", value:"N/A", desc:"Não aplicável — empresa de serviços", color:TX3, good:null },
      ]
    },
    {
      group: "Receita",
      items: [
        { label:"Receita Total", value:fmtMoney(receita), desc:`Todas as entradas de ${year}`, color:GRN, good:null },
        { label:"Despesas Totais", value:fmtMoney(despesas), desc:`Saídas + impostos de ${year}`, color:RED, good:null },
        { label:"Dividendos Distribuídos", value:fmtMoney(dividendos), desc:`Distribuição de lucros de ${year}`, color:"#7C3AED", good:null },
        { label:"Custo Fixo Total", value:fmtMoney(custoFixo), desc:"RH, aluguel, utilidades, adm", color:TX2, good:null },
      ]
    }
  ];

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:24 }}>
        <span style={{ fontSize:12,color:TX2 }}>Exercício:</span>
        {[new Date().getFullYear()-1, new Date().getFullYear()].map(y=>(
          <div key={y} onClick={()=>setYear(y)}
            style={{ padding:"5px 14px",fontSize:12,fontWeight:year===y?700:400,cursor:"pointer",borderRadius:99,background:year===y?TX:B2,color:year===y?"white":TX2,border:`1px solid ${year===y?TX:LN}`,transition:TRANS }}>
            {y}
          </div>
        ))}
      </div>

      {indicators.map(group=>(
        <div key={group.group} style={{ marginBottom:24 }}>
          <div style={{ fontSize:10,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${LN}` }}>{group.group}</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10 }}>
            {group.items.map((ind,i)=>(
              <div key={i} style={{ ...G,padding:"14px 16px",borderLeft:`3px solid ${ind.color}` }}>
                <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:4 }}>
                  <div style={{ fontSize:10,fontWeight:700,color:TX2,lineHeight:1.3,flex:1 }}>{ind.label}</div>
                  {ind.good===true&&<span style={{ fontSize:10,color:GRN,flexShrink:0,marginLeft:6 }}>✓</span>}
                  {ind.good===false&&<span style={{ fontSize:10,color:RED,flexShrink:0,marginLeft:6 }}>⚠</span>}
                </div>
                <div style={{ fontSize:20,fontWeight:700,color:ind.color,lineHeight:1,marginBottom:4 }}>{ind.value}</div>
                <div style={{ fontSize:10,color:TX3,lineHeight:1.4 }}>{ind.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ padding:"12px 16px",background:`${BLU}06`,border:`1px solid ${BLU}18`,borderRadius:8,fontSize:11,color:TX2 }}>
        ⚠️ Indicadores calculados com base nos lançamentos cadastrados no sistema. Para ROE e Endividamento, que requerem dados de balanço patrimonial, consulte seu contador.
      </div>
    </div>
  );
}


// ─── Contador Export Modal ────────────────────────────────
function ContadorExportModal({ transactions, baseBalance, saldoTotal, onClose }) {
  const [period, setPeriod] = useState("month");
  const [selMonth, setSelMonth] = useState(new Date().toISOString().substr(0,7));
  const [selYear, setSelYear] = useState(String(new Date().getFullYear()));

  const filtered = transactions.filter(t => {
    if (period==="month") return t.date?.startsWith(selMonth);
    if (period==="year")  return t.date?.startsWith(selYear);
    return true;
  });

  const nfItems = filtered.filter(t => t.nfFile || t.nfLink);
  const totalEnt = filtered.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const totalSai = filtered.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const totalDiv = filtered.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);

  const periodLabel = period==="month" ? new Date(selMonth+"-15").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})
    : period==="year" ? selYear : "Todos os períodos";

  const generateReport = () => {
    const cats = {};
    filtered.forEach(t => {
      const k = t.category || "Sem categoria";
      if (!cats[k]) cats[k] = [];
      cats[k].push(t);
    });

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8"/>
<title>Relatório Contábil — ${periodLabel}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:40px;line-height:1.5}
  h1{font-size:18px;margin-bottom:4px}
  h2{font-size:13px;margin:24px 0 8px;border-bottom:1px solid #ddd;padding-bottom:4px;color:#444}
  h3{font-size:11px;color:#666;margin:16px 0 6px;text-transform:uppercase;letter-spacing:.05em}
  table{width:100%;border-collapse:collapse;margin-bottom:16px}
  th{background:#f5f5f5;text-align:left;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #ddd}
  td{padding:6px 8px;border-bottom:1px solid #eee;vertical-align:top}
  .valor{text-align:right;font-variant-numeric:tabular-nums}
  .entrada{color:#16a34a;font-weight:700}
  .saida{color:#c8102e;font-weight:700}
  .dividendo{color:#7c3aed;font-weight:700}
  .total-row{font-weight:700;background:#fafafa}
  .resumo{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-bottom:24px}
  .resumo-card{border:1px solid #ddd;border-radius:6px;padding:12px}
  .resumo-label{font-size:9px;text-transform:uppercase;letter-spacing:.08em;color:#666;margin-bottom:4px}
  .resumo-valor{font-size:18px;font-weight:700}
  .footer{margin-top:32px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#888;text-align:center}
  @media print{body{margin:20px}}
</style>
</head>
<body>
<h1>Relatório Contábil · Stand Produções / Veloso Produções</h1>
<p style="color:#666;margin-bottom:24px">Período: <strong>${periodLabel}</strong> · Gerado em ${new Date().toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"})}</p>

<div class="resumo">
  <div class="resumo-card">
    <div class="resumo-label">Entradas</div>
    <div class="resumo-valor" style="color:#16a34a">R$ ${totalEnt.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
  </div>
  <div class="resumo-card">
    <div class="resumo-label">Saídas + Impostos</div>
    <div class="resumo-valor" style="color:#c8102e">R$ ${totalSai.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
  </div>
  <div class="resumo-card">
    <div class="resumo-label">Dividendos</div>
    <div class="resumo-valor" style="color:#7c3aed">R$ ${totalDiv.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
  </div>
</div>

<h2>Lançamentos por Categoria</h2>
${Object.entries(cats).map(([cat,items])=>`
  <h3>${cat}</h3>
  <table>
    <tr><th>Data</th><th>Descrição</th><th>Tipo</th><th>Parcela</th><th>NF</th><th class="valor">Valor</th></tr>
    ${items.map(t=>`
      <tr>
        <td>${new Date(t.date+"T12:00:00").toLocaleDateString("pt-BR")}</td>
        <td>${t.description||"—"}${t.beneficiario?` (${t.beneficiario})`:""}</td>
        <td>${t.type==="entrada"?"Entrada":t.type==="saida"?"Saída":t.type==="dividendos"?"Dividendos":t.type==="imposto"?"Imposto":"Transfer."}</td>
        <td>${t.parcelaAtual&&t.parcelaTotal?`${t.parcelaAtual}/${t.parcelaTotal}x`:"—"}</td>
        <td>${t.nfFile?"📄 Anexada":t.nfLink?`<a href="${t.nfLink}" target="_blank">Ver NF</a>`:"—"}</td>
        <td class="valor ${t.type==="entrada"?"entrada":t.type==="dividendos"?"dividendo":"saida"}">
          ${t.type==="entrada"?"+":"−"} R$ ${Number(t.amount).toLocaleString("pt-BR",{minimumFractionDigits:2})}
        </td>
      </tr>
    `).join("")}
    <tr class="total-row">
      <td colspan="5">Total ${cat}</td>
      <td class="valor">R$ ${items.reduce((s,t)=>s+(Number(t.amount)||0),0).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td>
    </tr>
  </table>
`).join("")}

<h2>Resumo Final</h2>
<table>
  <tr><th>Item</th><th class="valor">Valor</th></tr>
  <tr><td>Receitas</td><td class="valor entrada">+ R$ ${totalEnt.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
  <tr><td>Despesas e Impostos</td><td class="valor saida">− R$ ${totalSai.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
  <tr><td>Dividendos Distribuídos</td><td class="valor dividendo">− R$ ${totalDiv.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
  <tr class="total-row"><td>Resultado do período</td><td class="valor">R$ ${(totalEnt-totalSai-totalDiv).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
</table>

<div class="footer">
  ENTREGAS · Stand / Veloso Produções · Gerado automaticamente · ${new Date().toLocaleString("pt-BR")}
</div>
</body></html>`;

    const w = window.open("", "_blank");
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(), 500);
  };

  return (
    <Modal title="Exportar para Contador" onClose={onClose} width={560}
      footer={<>
        <Btn onClick={onClose} variant="ghost" size="sm">Fechar</Btn>
        <Btn onClick={generateReport} variant="primary" size="sm">🖨️ Gerar relatório PDF</Btn>
      </>}>

      <SRule>Período</SRule>
      <div style={{ display:"flex",gap:8,marginBottom:16 }}>
        {[{id:"month",label:"Mês"},{id:"year",label:"Ano"},{id:"all",label:"Todos"}].map(p=>(
          <div key={p.id} onClick={()=>setPeriod(p.id)}
            style={{ padding:"6px 14px",fontSize:12,fontWeight:period===p.id?700:400,cursor:"pointer",borderRadius:99,border:`1px solid ${period===p.id?TX:LN}`,background:period===p.id?TX:"none",color:period===p.id?"white":TX2,transition:TRANS }}>
            {p.label}
          </div>
        ))}
      </div>
      {period==="month"&&<Field label="Mês"><Input type="month" value={selMonth} onChange={e=>setSelMonth(e.target.value)}/></Field>}
      {period==="year"&&<Field label="Ano"><Select value={selYear} onChange={e=>setSelYear(e.target.value)}>{[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</Select></Field>}

      <SRule>Resumo do período</SRule>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16 }}>
        {[["Entradas",totalEnt,GRN],["Saídas",totalSai,RED],["Dividendos",totalDiv,"#7C3AED"]].map(([l,v,c])=>(
          <div key={l} style={{ ...G,padding:"10px 12px",borderLeft:`3px solid ${c}` }}>
            <div style={{ fontSize:9,color:TX2,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:15,fontWeight:700,color:c }}>{fmtMoney(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11,color:TX2,marginBottom:8 }}>{filtered.length} lançamentos no período</div>

      {nfItems.length>0&&(
        <>
          <SRule>Notas Fiscais anexadas ({nfItems.length})</SRule>
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            {nfItems.map((tx,i)=>(
              <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:B2,borderRadius:7 }}>
                <span style={{ fontSize:14 }}>{tx.nfFile?.type?.includes("image")?"🖼":"📄"}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:11,fontWeight:600,color:TX,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{tx.description}</div>
                  <div style={{ fontSize:10,color:TX2 }}>{fmtDate(tx.date)} · {fmtMoney(tx.amount)}</div>
                </div>
                {tx.nfFile&&<a href={tx.nfFile.data} download={tx.nfFile.name||`NF_${tx.description}.pdf`}
                  style={{ padding:"4px 10px",fontSize:10,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:5,textDecoration:"none",flexShrink:0 }}>↓ Baixar</a>}
                {tx.nfLink&&!tx.nfFile&&<a href={tx.nfLink} target="_blank" rel="noreferrer"
                  style={{ padding:"4px 10px",fontSize:10,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:5,textDecoration:"none",flexShrink:0 }}>↗ Ver</a>}
              </div>
            ))}
          </div>
          <div style={{ fontSize:10,color:TX3,marginTop:8 }}>💡 Baixe cada NF individualmente e envie junto com o relatório PDF para o contador.</div>
        </>
      )}
      {nfItems.length===0&&filtered.length>0&&(
        <div style={{ fontSize:11,color:TX3,fontStyle:"italic" }}>Nenhuma NF anexada nos lançamentos deste período.</div>
      )}
    </Modal>
  );
}


function Caixa({ contracts }) {
  const [unlocked, setUnlocked] = useState(false);
  const [tab, setTab] = useState("dash");
  const [transactions, setTransactions] = useState([]);
  const [baseBalance, setBaseBalance] = useState(0);
  const [baseDate, setBaseDate]       = useState("");
  const prevTxIds = useRef([]);
  useEffect(() => {
    (async () => {
      try {
        const [txs, base, bdate] = await Promise.all([loadCaixaTx(), getSetting("caixa_base"), getSetting("caixa_base_date")]);
        const list = txs.length > 0 ? txs : lsLoad("caixa_tx", []);
        setTransactions(list);
        prevTxIds.current = list.map(t => t.id);
        if (base != null) setBaseBalance(Number(base) || 0);
        if (bdate) setBaseDate(bdate);
      } catch {
        setTransactions(lsLoad("caixa_tx", []));
        setBaseBalance(lsLoad("caixa_base", 0));
        setBaseDate(lsLoad("caixa_base_date", ""));
      }
    })();
  }, []);
  const [txModal, setTxModal] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [dreYear, setDreYear] = useState(new Date().getFullYear());
  const [monthOffset, setMonthOffset] = useState(0);
  const [search, setSearch] = useState("");
  const [filterType2, setFilterType2] = useState("all");
  const toast = useToast();

  const saveTx = async (list) => {
    setTransactions(list);
    lsSave("caixa_tx", list);
    try { await syncCaixaTx(list, prevTxIds.current); prevTxIds.current = list.map(t => t.id); } catch(e) { console.error("syncCaixaTx:", e); }
  };

  const updateBase = async (val, date) => {
    setBaseBalance(Number(val)||0);
    setBaseDate(date);
    lsSave("caixa_base", Number(val)||0);
    lsSave("caixa_base_date", date);
    try { await setSetting("caixa_base", String(val)); await setSetting("caixa_base_date", date); } catch(e) { console.error("updateBase:", e); }
  };

  const [minVal, setMinVal] = useState("");
  const [maxVal, setMaxVal] = useState("");

  if (!unlocked) return <CaixaPasswordGate onUnlock={()=>setUnlocked(true)}/>;

  // ── Computed saldo ──────────────────────────────────────
  const totalEntradas   = transactions.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const totalSaidas     = transactions.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const totalDividendos = transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const saldoTotal      = (Number(baseBalance)||0) + totalEntradas - totalSaidas - totalDividendos;

  // ── Month navigation ────────────────────────────────────
  const now = new Date();
  const viewDate  = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
  const viewYear  = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();
  const monthKey  = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}`;
  const MONTHS_LONG2 = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const monthLabel = `${MONTHS_LONG2[viewMonth]} ${viewYear}`;

  const monthTx = transactions
    .filter(t => t.date?.startsWith(monthKey))
    .filter(t => filterType2==="all" || t.type===filterType2)
    .filter(t => !search || t.description?.toLowerCase().includes(search.toLowerCase()) || t.category?.toLowerCase().includes(search.toLowerCase()) || t.notes?.toLowerCase().includes(search.toLowerCase()))
    .filter(t => !minVal || Number(t.amount) >= Number(minVal))
    .filter(t => !maxVal || Number(t.amount) <= Number(maxVal))
    .sort((a,b) => b.date.localeCompare(a.date));

  const monthEntradas   = monthTx.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const monthSaidas     = monthTx.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const monthDividendos = monthTx.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
  const monthNet        = monthEntradas - monthSaidas - monthDividendos;

  const TABS = [
    { id:"dash",        label:"Dashboard" },
    { id:"lancamentos", label:"Lançamentos" },
    { id:"dre",         label:"DRE" },
    { id:"indicadores", label:"Indicadores" },
    { id:"ia",          label:"⚡ Consulta IA" },
  ];

  return (
    <div style={{ padding:"24px 28px", maxWidth:1100 }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
          <h1 style={{ fontSize:22,fontWeight:700,color:TX,letterSpacing:"-.02em" }}>Controle Financeiro</h1>
          <span style={{ fontSize:10,padding:"3px 8px",borderRadius:99,background:`${RED}15`,color:RED,fontWeight:700 }}>ADMIN</span>
          <button onClick={()=>setShowExport(true)} style={{ marginLeft:"auto",padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:8,background:"none",border:`1px solid ${LN}`,color:TX2,display:"flex",alignItems:"center",gap:6 }}>
            📤 Exportar para contador
          </button>
        </div>
        <p style={{ fontSize:13,color:TX2 }}>Lançamentos, saldo e DRE</p>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20 }}>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${saldoTotal>=0?TX:RED}` }}>
          <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Saldo Total</div>
          <div style={{ fontSize:22,fontWeight:700,color:saldoTotal>=0?TX:RED }}>{fmtMoney(saldoTotal)}</div>
          <div style={{ fontSize:10,color:TX3,marginTop:2 }}>base + lançamentos</div>
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${GRN}` }}>
          <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Entradas totais</div>
          <div style={{ fontSize:22,fontWeight:700,color:GRN }}>{fmtMoney(totalEntradas)}</div>
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${RED}` }}>
          <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Saídas totais</div>
          <div style={{ fontSize:22,fontWeight:700,color:RED }}>{fmtMoney(totalSaidas)}</div>
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid #7C3AED` }}>
          <div style={{ fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Dividendos totais</div>
          <div style={{ fontSize:22,fontWeight:700,color:"#7C3AED" }}>{fmtMoney(totalDividendos)}</div>
        </div>
      </div>

      {/* Saldo base config */}
      <SaldoBaseEditor baseBalance={baseBalance} baseDate={baseDate} onSave={updateBase}/>

      {/* Tabs */}
      <div style={{ display:"flex",gap:0,borderBottom:`1px solid ${LN}`,marginBottom:20,marginTop:16 }}>
        {TABS.map(t=>(
          <div key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"10px 18px",fontSize:12,fontWeight:tab===t.id?700:400,cursor:"pointer",color:tab===t.id?TX:TX2,borderBottom:`2px solid ${tab===t.id?RED:"transparent"}`,transition:TRANS,marginBottom:-1 }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Dashboard */}
      {tab==="dash" && <CaixaDash transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal}/>}

      {/* Lançamentos por mês */}
      {tab==="lancamentos" && (
        <div>
          {/* Filters */}
          <div style={{ display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Buscar descrição, categoria..."
              style={{ flex:1,minWidth:180,padding:"7px 12px",fontSize:12,background:B1,border:`1px solid ${LN}`,borderRadius:8,color:TX,fontFamily:"inherit",outline:"none" }}/>
            {/* Value range filter */}
            <div style={{ display:"flex",alignItems:"center",gap:4,background:B1,border:`1px solid ${LN}`,borderRadius:8,padding:"0 10px" }}>
              <span style={{ fontSize:10,color:TX3,flexShrink:0 }}>R$</span>
              <input type="number" value={minVal} onChange={e=>setMinVal(e.target.value)} placeholder="Min"
                style={{ width:64,padding:"7px 0",fontSize:12,background:"transparent",border:"none",color:TX,fontFamily:"inherit",outline:"none" }}/>
              <span style={{ fontSize:10,color:TX3 }}>–</span>
              <input type="number" value={maxVal} onChange={e=>setMaxVal(e.target.value)} placeholder="Max"
                style={{ width:64,padding:"7px 0",fontSize:12,background:"transparent",border:"none",color:TX,fontFamily:"inherit",outline:"none" }}/>
              {(minVal||maxVal) && (
                <button onClick={()=>{setMinVal("");setMaxVal("");}}
                  style={{ background:"none",border:"none",color:TX3,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1 }}>×</button>
              )}
            </div>
            <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
              {[{id:"all",label:"Todos"},{id:"entrada",label:"↓ Entradas"},{id:"saida",label:"↑ Saídas"},{id:"dividendos",label:"💰 Dividendos"},{id:"imposto",label:"🏛 Impostos"},{id:"transferencia",label:"⇄ Trans."}].map(f=>(
                <div key={f.id} onClick={()=>setFilterType2(f.id)}
                  style={{ padding:"6px 12px",fontSize:11,fontWeight:filterType2===f.id?700:400,cursor:"pointer",borderRadius:99,border:`1px solid ${filterType2===f.id?TX:LN}`,background:filterType2===f.id?TX:"none",color:filterType2===f.id?"white":TX2,transition:TRANS,whiteSpace:"nowrap" }}>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
          {/* Month nav */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
            <button onClick={()=>setMonthOffset(o=>o-1)} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:6,width:32,height:32,cursor:"pointer",color:TX2,fontSize:16 }}>‹</button>
            <div style={{ flex:1,textAlign:"center" }}>
              <div style={{ fontWeight:700,fontSize:15,color:TX }}>{monthLabel}</div>
              <div style={{ fontSize:11,color:TX2 }}>
                <span style={{ color:GRN }}>+{fmtMoney(monthEntradas)}</span>
                {" · "}
                <span style={{ color:RED }}>−{fmtMoney(monthSaidas)}</span>
                {monthDividendos>0&&<><span style={{ color:TX2 }}> · </span><span style={{ color:"#7C3AED" }}>div {fmtMoney(monthDividendos)}</span></>}
                {" · "}
                <span style={{ fontWeight:700, color:monthNet>=0?GRN:RED }}>{monthNet>=0?"+":""}{fmtMoney(monthNet)}</span>
              </div>
            </div>
            <button onClick={()=>setMonthOffset(o=>o+1)} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:6,width:32,height:32,cursor:"pointer",color:TX2,fontSize:16 }}>›</button>
            <button onClick={()=>setMonthOffset(0)} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:6,padding:"0 12px",height:32,cursor:"pointer",color:TX2,fontSize:11,fontWeight:600 }}>Hoje</button>
            <Btn onClick={()=>setTxModal({})} variant="primary" size="sm" icon={Plus}>Lançamento</Btn>
          </div>

          {monthTx.length===0 ? (
            <div style={{ textAlign:"center",padding:"48px 0",color:TX3 }}>
              Nenhum lançamento em {monthLabel}.
              <br/><button onClick={()=>setTxModal({})} style={{ marginTop:12,padding:"8px 16px",background:RED,border:"none",borderRadius:8,color:"white",fontSize:12,fontWeight:700,cursor:"pointer" }}>+ Adicionar</button>
            </div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {monthTx.map(tx=>{
                const tc = txColor(tx.type);
                return (
                  <div key={tx.id} style={{ ...G,padding:"12px 16px",display:"flex",alignItems:"center",gap:14 }}>
                    <div style={{ width:36,height:36,borderRadius:8,background:tc+"15",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,flexShrink:0 }}>
                      {txEmoji(tx.type)}
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontWeight:600,fontSize:13,color:TX,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{tx.description}</div>
                      <div style={{ fontSize:11,color:TX2,display:"flex",gap:8,marginTop:2,flexWrap:"wrap" }}>
                        <span>{fmtDate(tx.date)}</span>
                        {tx.category&&<span>· {tx.category}</span>}
                        {tx.beneficiario&&<span style={{fontWeight:600,color:"#7C3AED"}}>· {tx.beneficiario}</span>}
                        {tx.contractId&&<span style={{color:TX3}}>· {contracts.find(c=>c.id===tx.contractId)?.company}</span>}
                        {tx.installmentNum&&tx.installmentTotal&&<span style={{color:BLU,fontWeight:700,fontSize:10,padding:"1px 6px",borderRadius:99,background:`${BLU}12`,border:`1px solid ${BLU}20`}}>📋 {tx.installmentNum}/{tx.installmentTotal}x</span>}
                        {tx.parcelaAtual&&tx.parcelaTotal&&<span style={{color:AMB,fontWeight:700}}>· {tx.parcelaAtual}/{tx.parcelaTotal}x</span>}
                        {(tx.nfLink||tx.nfFile)&&<span style={{color:BLU}}>· 📄 NF</span>}
                      </div>
                      {tx.notes&&<div style={{ fontSize:10,color:TX3,marginTop:2 }}>{tx.notes}</div>}
                    </div>
                    <div style={{ textAlign:"right",flexShrink:0 }}>
                      <div style={{ fontSize:15,fontWeight:700,color:tc }}>
                        {tx.type==="entrada"?"+":tx.type==="transferencia"?"":"−"}{fmtMoney(tx.amount)}
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:4,flexShrink:0 }}>
                      <button onClick={()=>setTxModal(tx)} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:5,padding:"4px 8px",cursor:"pointer",color:TX2,fontSize:11 }}>✎</button>
                      <button onClick={()=>{if(confirm("Excluir?")) saveTx(transactions.filter(t=>t.id!==tx.id));}} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:5,padding:"4px 8px",cursor:"pointer",color:RED,fontSize:13 }}>×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab==="indicadores" && <IndicadoresFinanceiros transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal} contracts={contracts}/>}

      {/* IA Financeira */}
      {tab==="ia" && (() => {
        const totalEnt2 = transactions.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const totalSai2 = transactions.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const totalDiv2 = transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const lucro2 = totalEnt2 - totalSai2 - totalDiv2;
        const catBreakdown = Object.entries(transactions.filter(t=>t.type==="saida"&&t.category).reduce((acc,t)=>{acc[t.category]=(acc[t.category]||0)+(Number(t.amount)||0);return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: R$${v.toLocaleString("pt-BR")}`).join(", ");
        const ctx = `Empresa: Stand/Veloso Produções. Saldo: R$${saldoTotal.toLocaleString("pt-BR")}. Entradas: R$${totalEnt2.toLocaleString("pt-BR")}. Saídas: R$${totalSai2.toLocaleString("pt-BR")}. Dividendos: R$${totalDiv2.toLocaleString("pt-BR")}. Lucro líquido: R$${lucro2.toLocaleString("pt-BR")}. Contratos ativos: ${contracts.length}. Top despesas: ${catBreakdown||"nenhuma"}. Lançamentos: ${transactions.length}.`;

        const sendMsg = async () => {
          if (!aiInput.trim()) return;
          const userMsg = aiInput.trim();
          setAiInput("");
          setAiMessages(m => [...m, { role:"user", text:userMsg }]);
          setAiLoading(true);
          try {
            const history = aiMessages.slice(-6).map(m=>({ role:m.role==="user"?"user":"assistant", content:m.text }));
            const res = await fetch("/api/ai",{ method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({
              max_tokens: 1000,
              system: `Você é o consultor financeiro do criador de conteúdo @veloso.lucas_ (canal de futebol, 2M seguidores). A empresa é Stand/Veloso Produções. Responda em português, de forma direta e prática. Contexto financeiro: ${ctx}`,
              messages: [...history, { role:"user", content:userMsg }]
            })});
            const data = await res.json();
            setAiMessages(m => [...m, { role:"assistant", text:data.text||"Não consegui processar." }]);
          } catch(e) { setAiMessages(m => [...m, { role:"assistant", text:"Erro: "+String(e) }]); }
          setAiLoading(false);
        };

        return (
          <div style={{ display:"flex",flexDirection:"column",height:"60vh",maxHeight:600 }}>
            <div style={{ ...G,padding:"10px 16px",marginBottom:16,fontSize:11,color:TX2 }}>
              💡 Pergunte sobre seus números, estratégias financeiras, como reduzir custos, melhorar margens, planejamento tributário, etc.
            </div>
            {/* Messages */}
            <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12,marginBottom:16,padding:"4px 0" }}>
              {aiMessages.length===0&&(
                <div style={{ textAlign:"center",padding:"40px 20px",color:TX3 }}>
                  <div style={{ fontSize:32,marginBottom:12 }}>⚡</div>
                  <div style={{ fontSize:13,fontWeight:600,color:TX2,marginBottom:8 }}>Consultor Financeiro IA</div>
                  <div style={{ fontSize:12,color:TX3 }}>Exemplos de perguntas:</div>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginTop:12 }}>
                    {["Qual minha margem de lucro?","Como posso reduzir custos?","Estou gastando muito com RH?","Quando devo distribuir dividendos?","Como melhorar o fluxo de caixa?"].map(q=>(
                      <div key={q} onClick={()=>{setAiInput(q);}} style={{ padding:"6px 12px",fontSize:11,background:B2,border:`1px solid ${LN}`,borderRadius:99,cursor:"pointer",color:TX2,transition:TRANS }} onMouseEnter={e=>e.currentTarget.style.borderColor=RED} onMouseLeave={e=>e.currentTarget.style.borderColor=LN}>{q}</div>
                    ))}
                  </div>
                </div>
              )}
              {aiMessages.map((msg,i)=>(
                <div key={i} style={{ display:"flex",gap:10,flexDirection:msg.role==="user"?"row-reverse":"row",alignItems:"flex-start" }}>
                  <div style={{ width:28,height:28,borderRadius:"50%",background:msg.role==="user"?RED:`${BLU}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,flexShrink:0,color:msg.role==="user"?"white":BLU,fontWeight:700 }}>
                    {msg.role==="user"?"M":"⚡"}
                  </div>
                  <div style={{ maxWidth:"80%",padding:"10px 14px",borderRadius:msg.role==="user"?"12px 12px 0 12px":"12px 12px 12px 0",background:msg.role==="user"?RED:B2,color:msg.role==="user"?"white":TX,fontSize:12,lineHeight:1.6,whiteSpace:"pre-wrap" }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {aiLoading&&(
                <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                  <div style={{ width:28,height:28,borderRadius:"50%",background:`${BLU}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:BLU,fontWeight:700 }}>⚡</div>
                  <div style={{ padding:"10px 14px",borderRadius:"12px 12px 12px 0",background:B2,fontSize:12,color:TX2 }}>Analisando seus dados...</div>
                </div>
              )}
            </div>
            {/* Input */}
            <div style={{ display:"flex",gap:8 }}>
              <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMsg()}
                placeholder="Pergunte algo sobre suas finanças..."
                style={{ flex:1,padding:"10px 14px",fontSize:13,background:B2,border:`1px solid ${LN}`,borderRadius:10,color:TX,fontFamily:"inherit",outline:"none",transition:TRANS }}
                onFocus={e=>e.currentTarget.style.borderColor=RED} onBlur={e=>e.currentTarget.style.borderColor=LN}/>
              <button onClick={sendMsg} disabled={aiLoading||!aiInput.trim()}
                style={{ padding:"10px 18px",background:RED,border:"none",borderRadius:10,color:"white",fontSize:13,fontWeight:700,cursor:aiLoading||!aiInput.trim()?"not-allowed":"pointer",opacity:aiLoading||!aiInput.trim()?0.6:1 }}>
                Enviar
              </button>
              {aiMessages.length>0&&<button onClick={()=>setAiMessages([])} style={{ padding:"10px 12px",background:"none",border:`1px solid ${LN}`,borderRadius:10,color:TX2,fontSize:11,cursor:"pointer" }}>Limpar</button>}
            </div>
          </div>
        );
      })()}

      {/* DRE */}
      {tab==="dre" && (
        <div>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
            <span style={{ fontSize:12,color:TX2 }}>Exercício:</span>
            {[new Date().getFullYear()-1, new Date().getFullYear()].map(y=>(
              <div key={y} onClick={()=>setDreYear(y)}
                style={{ padding:"5px 14px",fontSize:12,fontWeight:dreYear===y?700:400,cursor:"pointer",borderRadius:99,background:dreYear===y?TX:B2,color:dreYear===y?"white":TX2,border:`1px solid ${dreYear===y?TX:LN}`,transition:TRANS }}>
                {y}
              </div>
            ))}
          </div>
          <DREView transactions={transactions} year={dreYear}/>
        </div>
      )}

      {showExport && <ContadorExportModal transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal} onClose={()=>setShowExport(false)}/>}
      {txModal!==null && (
        <TransactionModal accounts={[]} contracts={contracts} initial={txModal.id?txModal:null}
          defaultDate={`${monthKey}-01`}
          onClose={()=>setTxModal(null)}
          onSave={(tx)=>{
            if (Array.isArray(tx)) {
              saveTx([...transactions, ...tx]);
              toast?.(`${tx.length} parcelas criadas 🎉`, "success");
            } else {
              saveTx(txModal.id ? transactions.map(t=>t.id===tx.id?tx:t) : [...transactions,tx]);
              toast?.(`${txModal.id?"Atualizado":"Salvo"}`, "success");
            }
            setTxModal(null);
          }}/>
      )}
    </div>
  );
}

// ─── Saldo Base Editor ────────────────────────────────────
function SaldoBaseEditor({ baseBalance, baseDate, onSave }) {
  const [editing, setEditing] = useState(false);
  const [pw, setPw] = useState("");
  const [step, setStep] = useState("locked");
  const [val, setVal] = useState(String(baseBalance||"0"));
  const [date, setDate] = useState(baseDate||new Date().toISOString().substr(0,10));
  const [err, setErr] = useState(false);

  const check = () => {
    if (pw === BALANCE_PASSWORD) { setStep("editing"); setVal(String(baseBalance||"0")); setErr(false); }
    else { setErr(true); setPw(""); }
  };
  const save = () => { onSave(val, date); setEditing(false); setStep("locked"); setPw(""); };

  return (
    <div style={{ ...G,padding:"12px 18px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:2 }}>Saldo Base (ponto de partida)</div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontSize:16,fontWeight:700,color:TX }}>{fmtMoney(Number(baseBalance)||0)}</span>
          {baseDate&&<span style={{ fontSize:11,color:TX2 }}>em {fmtDate(baseDate)}</span>}
          {!baseDate&&<span style={{ fontSize:11,color:TX3 }}>não definido</span>}
        </div>
      </div>
      {!editing ? (
        <button onClick={()=>{setEditing(true);setStep("locked");}} style={{ padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",borderRadius:6,background:"none",border:`1px solid ${LN}`,color:TX2,display:"flex",alignItems:"center",gap:6 }}>🔒 Alterar saldo base</button>
      ) : step==="locked" ? (
        <div style={{ display:"flex",gap:6,alignItems:"center" }}>
          <input type="password" value={pw} onChange={e=>{setPw(e.target.value);setErr(false);}} onKeyDown={e=>e.key==="Enter"&&check()} autoFocus placeholder="Senha"
            style={{ padding:"6px 10px",fontSize:12,background:err?`${RED}08`:B2,border:`1px solid ${err?RED:LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",width:120 }}/>
          <button onClick={check} style={{ padding:"6px 12px",background:RED,border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer" }}>OK</button>
          <button onClick={()=>{setEditing(false);setErr(false);setPw("");}} style={{ padding:"6px 8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>×</button>
          {err&&<span style={{ fontSize:10,color:RED }}>Incorreta</span>}
        </div>
      ) : (
        <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
          <input type="number" value={val} onChange={e=>setVal(e.target.value)} autoFocus placeholder="0,00"
            style={{ padding:"6px 10px",fontSize:13,fontWeight:700,background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",width:120 }}/>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{ padding:"6px 10px",fontSize:12,background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
          <button onClick={save} style={{ padding:"6px 14px",background:GRN,border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer" }}>Salvar</button>
          <button onClick={()=>{setEditing(false);setStep("locked");setPw("");}} style={{ padding:"6px 8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>×</button>
        </div>
      )}
    </div>
  );
}


// ─── App Root ─────────────────────────────────────────────
export default function App() {
  const isMobile = useIsMobile();
  const [user, setUser]     = useState(undefined);
  const [role, setRole]     = useState("admin");
  const [userName, setUserName] = useState("");
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
        // Load role
        const userRole = USER_ROLES[user.email] || await getUserRole(user.email);
        setRole(userRole);
        setUserName(ROLE_NAMES[user.email] || user.email.split("@")[0]);
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
        unsub = subscribeToChanges({
          onContracts: cs  => { setC(cs);  prevCIds.current = cs.map(c => c.id); setSyncStatus("ok"); },
          onPosts:     ps  => { setP(ps);  prevPIds.current = ps.map(p => p.id); },
          onDeliverables: ds => { setD(ds); prevDIds.current = ds.map(d => d.id); },
          onSetting: (key, val) => {
            if (key === "eurRate") setEurRate(Number(val) || 0);
            if (key === "usdRate") setUsdRate(Number(val) || 0);
          },
          onError: (source, _err) => {
            setSyncStatus("error");
            // Toast is available via context at this point
            // (push is stable so we can call it safely from a snapshot listener)
          },
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

  // Helper: find IDs removed between two arrays and call deleteItem for each
  const syncWithDeletes = useCallback(async (colName, newItems, prevIds, syncFn) => {
    const newIds = new Set(newItems.map(i => i.id));
    const removed = (prevIds || []).filter(id => !newIds.has(id));
    // Upsert changed/new items
    await syncFn(newItems, prevIds);
    // Explicitly delete removed items
    await Promise.allSettled(removed.map(id => deleteItem(colName, id)));
    return newIds;
  }, []);

  const saveC = useCallback(async d => {
    setC(d);
    try {
      const newIds = await syncWithDeletes('contracts', d, prevCIds.current, syncContracts);
      prevCIds.current = [...newIds];
      setSyncStatus("ok");
    } catch(e) { console.error('[App] saveC', e); setSyncStatus("error"); }
  }, [syncWithDeletes]);

  const saveP = useCallback(async d => {
    setP(d);
    try {
      const newIds = await syncWithDeletes('posts', d, prevPIds.current, syncPosts);
      prevPIds.current = [...newIds];
    } catch(e) { console.error('[App] saveP', e); }
  }, [syncWithDeletes]);

  const saveD = useCallback(async d => {
    setD(d);
    try {
      const newIds = await syncWithDeletes('deliverables', d, prevDIds.current, syncDeliverables);
      prevDIds.current = [...newIds];
    } catch(e) { console.error('[App] saveD', e); }
  }, [syncWithDeletes]);;
  const rates=useMemo(()=>({eur:eurRate,usd:usdRate}),[eurRate,usdRate]);
  const saveNote=(id,notes)=>saveC(contracts.map(c=>c.id===id?{...c,notes}:c));
  const toggleComm=id=>saveC(contracts.map(c=>c.id===id?{...c,hasCommission:!c.hasCommission}:c));
  const toggleCommPaid=(cid,key)=>saveC(contracts.map(c=>{if(c.id!==cid)return c;const cp={...(c.commPaid||{})};cp[key]=!cp[key];return{...c,commPaid:cp};}));
  const toggleNF=(cid,key)=>saveC(contracts.map(c=>{if(c.id!==cid)return c;const nf={...(c.nfEmitted||{})};nf[key]=!nf[key];return{...c,nfEmitted:nf};}));

  const stats=useMemo(()=>{
    const activeC = contracts.filter(c=>!c.archived);
    const totalBRL=activeC.reduce((s,c)=>s+toBRL(contractTotal(c),c.currency,rates),0);
    const doneDeliverables=deliverables.filter(d=>d.stage==="done"||d.stage==="postagem");
    const commBRL=activeC.filter(c=>c.hasCommission).reduce((s,c)=>s+toBRL(contractTotal(c)*COMM_RATE,c.currency,rates),0);
    const totEur=activeC.filter(c=>c.currency==="EUR").reduce((s,c)=>s+contractTotal(c),0);
    const totUsd=activeC.filter(c=>c.currency==="USD").reduce((s,c)=>s+contractTotal(c),0);
    let commPaid=0,commPend=0;
    activeC.forEach(c=>{if(!c.hasCommission)return;getCommEntries(c).forEach(e=>{const v=toBRL(e.amount,c.currency,rates);e.isPaid?commPaid+=v:commPend+=v;});});
    const tot=k=>activeC.reduce((s,c)=>s+c[k],0);
    const del=t=>{
      const postTypes = t==="post"?["post","reel"]:t==="repost"?["repost","tiktok"]:[t];
      const fromPosts=posts.filter(p=>postTypes.includes(p.type)&&p.isPosted).length;
      const fromPipeline=doneDeliverables.filter(d=>postTypes.includes(d.type)).length;
      return fromPosts+fromPipeline;
    };
    const engs=posts.map(calcEngagement).filter(e=>e!==null);
    const nfPending=activeC.reduce((s,c)=>s+getNFEntries(c).filter(e=>!e.isEmitted).length,0);
    const nfPendingValue=activeC.reduce((s,c)=>s+getNFEntries(c).filter(e=>!e.isEmitted).reduce((sv,e)=>sv+toBRL(e.amount,c.currency,rates),0),0);
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
    const STAGE_BADGE = {
      briefing:   { label:"Só a ideia",  color:"#94A3B8" },
      roteiro:    { label:"Roteirizando",color:"#7C3AED" },
      ap_roteiro: { label:"Ap. Roteiro", color:"#D97706" },
      gravacao:   { label:"Gravação",    color:"#BE185D" },
      edicao:     { label:"Edição",      color:"#2563EB" },
      ap_final:   { label:"Ap. Final",   color:"#EA580C" },
      postagem:   { label:"Publicando",  color:"#0891B2" },
      done:       { label:"Postado",     color:"#16A34A" },
    };
    const pipeDeliverables = deliverables || [];
    pipeDeliverables.forEach(d=>{
      if(!d||!d.plannedPostDate) return;
      const c=contracts.find(x=>x.id===d.contractId);
      if(!c) return;
      if(calFilter!=="all"&&calFilter!==c.id) return;
      const badge = STAGE_BADGE[d.stage] || STAGE_BADGE.briefing;
      // Main card on postagem date
      add(d.plannedPostDate,{
        label:d.title, color:c.color, type:"deliverable",
        stageLabel:badge.label, stageColor:badge.color,
        isDone:d.stage==="done"
      });
      // Stage deadline dashes (only if not done)
      if(d.stage!=="done"){
        STAGES.filter(s=>s.id!=="done"&&s.id!=="postagem").forEach(s=>{
          const stageDue = d.stageDateOverrides?.[s.id] || addDays(d.plannedPostDate, s.days);
          if(stageDue) add(stageDue,{label:`${s.label} · ${d.title}`,color:c.color,dashed:true});
        });
      }
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

  // Loading — waiting for Firebase Auth to initialize
  if (user === undefined) {
    return (
      <div style={{ minHeight:"100vh", background:"#F7F6EF", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"Plus Jakarta Sans,system-ui,sans-serif", gap:16 }}>
        <div style={{ fontSize:13, fontWeight:700, letterSpacing:".2em", textTransform:"uppercase", color:TX }}>
          ENTRE<span style={{color:RED}}>GAS</span>
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {[0,1,2].map(i=>(
            <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:RED, animation:`pulse 1.2s ${i*0.2}s ease-in-out infinite` }}/>
          ))}
        </div>
        <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>
      </div>
    );
  }

  // Login
  if (!user) return <ToastProvider><LoginPage/></ToastProvider>;

  // App
  return (
    <ToastProvider>
      <div style={{ display:"flex", minHeight:"100vh", background:B0, fontFamily:"Plus Jakarta Sans,system-ui,sans-serif", fontSize:13, color:TX }}>
        {/* Globals CSS is imported via src/styles/globals.css → main.jsx */}
        {!isMobile && <Sidebar view={view} setView={setView} user={user} onSignOut={()=>signOut(auth)} onInvite={()=>setShowInvite(true)} onlineUsers={onlineUsers} contracts={contracts} role={role} userName={userName} deliverables={deliverables}/>}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <TopBar view={view} eurRate={eurRate} usdRate={usdRate} setEurRate={setEurRate} setUsdRate={setUsdRate}
            onNewContract={()=>setModal({type:"contract",data:null})}
            onNewPost={()=>setModal({type:"post",data:null})}
            onNewTask={()=>setTriggerNewTask(true)}
            syncStatus={syncStatus} isMobile={isMobile} role={role} userName={userName}/>
          <div style={{ flex:1, overflowY:"auto", paddingBottom:isMobile?84:0 }}>
            <ViewRenderer view={view} contracts={contracts} posts={posts} deliverables={deliverables} stats={stats} rates={rates}
              saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid}
              toggleNF={toggleNF} setModal={setModal} setView={setView}
              saveC={saveC} saveP={saveP} saveD={saveD}
              calEvents={calEvents} calMonth={calMonth} setCal={setCal}
              calFilter={calFilter} setCalF={setCalF}
              triggerNewTask={triggerNewTask} setTriggerNewTask={setTriggerNewTask}
              role={role} userName={userName} syncStatus={syncStatus}/>
          </div>
        </div>
        {modal && (
          <div>
            {modal.type==="contract"&&<ContractModal modal={{...modal,saveDeliverables:saveD,existingDeliverables:deliverables}} setModal={setModal} contracts={contracts} saveC={saveC}/>}
            {modal.type==="post"    &&<PostModal modal={modal} setModal={setModal} contracts={contracts} posts={posts} saveP={saveP}/>}
          </div>
        )}
        {showInvite && <UserInviteModal onClose={()=>setShowInvite(false)}/>}
        {isMobile && <MobileNav view={view} setView={setView} role={role} userName={userName} deliverables={deliverables} contracts={contracts}/>}
      </div>
    </ToastProvider>
  );
}

