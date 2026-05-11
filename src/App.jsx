import React, { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase.js";
import {
  loadContracts, syncContracts, loadPosts, syncPosts,
  loadDeliverables, syncDeliverables,
  loadCaixaTx, syncCaixaTx,
  loadBrands, syncBrands, deleteBrand,
  getSetting, setSetting, subscribeToChanges,
  updatePresence, removePresence, subscribeToPresence, getMyPresence,
  getUserRole, deleteItem,
} from "./db.js";
import { format, eachDayOfInterval, endOfMonth, endOfWeek, getDay, isEqual, isSameDay, isSameMonth, isToday, parse, startOfToday, startOfWeek, add } from "date-fns";
import { ptBR } from "date-fns/locale";
import { LayoutDashboard, FileText, CheckSquare, Video, Calendar, ChevronLeft, ChevronRight, Plus, X, LogOut, Search, AlertCircle, Clock, CheckCircle2, Circle, Minus, Zap, ArrowUp, ArrowDown, Filter, KanbanSquare, CalendarDays, ChevronDown, ChevronUp, MoreHorizontal, Banknote, Landmark, Tag, Building2 } from "lucide-react";

// ─── Design System Ranked ─────────────────────────────────
import { theme as ds, Button as DsButton, IconButton as DsIconButton, Icon as DsIcon, Input as DsInput, Card as DsCard, Overline } from './ui/index.js';

// ─── FX — cotações cambiais ───────────────────────────────
import { FxProvider, useFx }                       from './lib/FxContext.jsx';
import { formatRate, formatRelativeTime, convert, saveManualRates, clearManualRates, calcLockedVariation } from './lib/fx.js';
import { CurrencyRateBadge }                       from './ui/CurrencyRateBadge.jsx';

// ─── Dashboard libs & sub-components ──────────────────────
import { startOfWeek as sowLib, endOfWeek as eowLib, weekDays, isInCurrentWeek, daysBetween, toDateStr } from "./lib/dates.js";
import { topPriorityItems } from "./lib/priority.js";
import { detectRiskSignals } from "./lib/riskSignals.js";
import { WeekHeader }     from "./views/dashboard/WeekHeader.jsx";
import { TodayFocusList } from "./views/dashboard/TodayFocusList.jsx";
import { RiskSignals }    from "./views/dashboard/RiskSignals.jsx";
import { WeekTimeline }   from "./views/dashboard/WeekTimeline.jsx";

// ─── Brand lib ─────────────────────────────────────────────
import { BRAND_CATEGORIES, slugify, inferCategory, runBrandsMigration } from "./lib/brands.js";
import { detectConflicts, buildConflictDateMap } from "./lib/conflicts.js";
import { formatDate } from "./lib/format.js";
import { useQueryState } from "./lib/url-state.js";
import {
  aggregate, monthlyBreakdown, burnRate as calcBurnRate,
  liquidityRatio, futureInstallments as calcFutureInstallments,
  isInflow, isOutflow, isDividend, isTax,
  TX_TYPES as FIN_TX,
} from "./lib/finance.js";

// ─── Copiloto Ranked ───────────────────────────────────────
import { getSuggestions }         from "./lib/copilot/suggestions.js";
import { runAction, ACTIONS }     from "./lib/copilot/actions.js";
import { detectIntent }           from "./lib/copilot/intents.js";
import { loadHistory, saveHistory, appendMessage, clearHistory } from "./lib/copilot/history.js";

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
// WhatsApp brand colors — cor de marca externa, exceção à regra de hex
const WA_GREEN = '#25D366';
const WA_DARK  = '#128C7E';

const ROLE_META = {
  admin:       { label:"Admin",          color: ds.color.brand[500]   },
  agente:      { label:"Agente Ranked",  color: ds.color.copilot[500] },
  atendimento: { label:"Atendimento",    color: ds.color.info[500]    },
  influencer:  { label:"Influenciador",  color: ds.color.success[500] },
};
const ROLE_NAV = {
  admin:       ["dashboard","acompanhamento","contratos","marcas","financeiro","caixa"],
  agente:      ["dashboard","contratos","marcas","financeiro"],
  atendimento: ["dashboard","acompanhamento","contratos","marcas"],
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
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency, minimumFractionDigits:0, maximumFractionDigits:0 }).format(v || 0);
}
function fmtEng(v) {
  // Etapa 4: show "—" when engagement is null (no reach data)
  if (v === null || v === undefined) return "—";
  return v.toFixed(1) + "%";
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

// Etapa 4: returns {value, warning} — warns when monthly has no dates
function contractTotalWithWarning(c) {
  if (c.paymentType==="monthly") {
    if (!c.contractStart||!c.contractDeadline) {
      return { value:0, warning:`"${c.company}" é mensal mas não tem datas de início/fim — valor não calculado.` };
    }
    const m=monthsBetween(c.contractStart,c.contractDeadline);
    return { value:m?(c.monthlyValue||0)*m:0, warning:null };
  }
  if (c.paymentType==="split") { const inst=getInstallments(c); if(inst.length) return { value:inst.reduce((s,i)=>s+(Number(i.value)||0),0), warning:null }; }
  return { value:c.contractValue||0, warning:null };
}
function contractTotal(c) { return contractTotalWithWarning(c).value; }

// Aggregates data-quality warnings across all contracts
function contractCalcWarnings(contracts) {
  return contracts.filter(c=>!c.archived).map(c=>contractTotalWithWarning(c).warning).filter(Boolean);
}

// Etapa 4: toBRL keeps old behavior (for sum reductions)
// toBRL — suporta { EUR, USD } (ISO) e { eur, usd } (legado)
function toBRL(value, currency, rates) {
  if (!value) return 0;
  if (currency === "BRL" || !currency) return value;
  const r = rates?.[currency] || rates?.[currency.toLowerCase()] || 0;
  return r > 0 ? value * r : value;
}
function toBRLStrict(value, currency, rates) {
  if (!value) return 0;
  if (currency === "BRL" || !currency) return value;
  const r = rates?.[currency] || rates?.[currency.toLowerCase()] || 0;
  return r > 0 ? value * r : null;
}

function calcEngagement(p) {
  const i=(p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0);
  if (!p.reach) return null; // Etapa 4: null means "no data", not 0%
  return i/p.reach*100;
}
function postRepostCount(p) {
  if (p.type==="repost") return 1;
  return Math.max(0,(p.networks||[]).length-1);
}

// Etapa 4: getCommEntries respects per-contract commissionRate
function getCommEntries(c) {
  if (!c.hasCommission) return [];
  const rate = (typeof c.commissionRate==="number" && c.commissionRate>0) ? c.commissionRate : COMM_RATE;
  const paid = c.commPaid||{};
  if (c.paymentType==="monthly") {
    if (!c.contractStart||!c.contractDeadline) return [];
    const entries=[]; const s=new Date(c.contractStart),e=new Date(c.contractDeadline);
    const cur=new Date(s.getFullYear(),s.getMonth(),1);
    while(cur<=e){const key=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`;entries.push({key,label:`${MONTHS_SH[cur.getMonth()]} ${cur.getFullYear()}`,amount:(c.monthlyValue||0)*rate,currency:c.currency,isPaid:!!paid[key]});cur.setMonth(cur.getMonth()+1);}
    return entries;
  }
  const totalCosts=(c.costs||[]).reduce((s,x)=>s+(Number(x.value)||0),0);
  if (c.paymentType==="split") {
    const O=["1ª","2ª","3ª","4ª","5ª","6ª"];
    const insts=getInstallments(c);
    const costPerInst=insts.length?totalCosts/insts.length:0;
    return insts.map((inst,i)=>({key:`parc${i+1}`,label:`${O[i]||`${i+1}ª`} Parcela`,amount:Math.max(0,(Number(inst.value)||0)-costPerInst)*rate,currency:c.currency,date:inst.date,isPaid:!!paid[`parc${i+1}`]}));
  }
  const total=contractTotal(c);
  const costs=(c.costs||[]).reduce((s,x)=>s+(Number(x.value)||0),0);
  const netTotal=Math.max(0,total-costs);
  return [{key:"single",label:"Pagamento Único",amount:netTotal*rate,currency:c.currency,date:c.paymentDeadline,isPaid:!!paid["single"]}];
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
function currBadge(cur, rates) {
  const s = { padding:"1px 6px",fontSize:8,fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",borderRadius:3 };
  const missingRate = rates && ((cur==="EUR"&&!rates.eur)||(cur==="USD"&&!rates.usd));
  const title = missingRate ? "Taxa de câmbio não definida — defina na barra superior" : undefined;
  if (cur==="EUR") return <span style={{...s,background:"rgba(99,102,241,.18)",border:`1px solid ${missingRate?"#F59E0B":"rgba(99,102,241,.3)"}`,color:missingRate?"#F59E0B":"#818CF8"}} title={title}>EUR{missingRate?" ⚠":""}</span>;
  if (cur==="USD") return <span style={{...s,background:"rgba(16,185,129,.18)",border:`1px solid ${missingRate?"#F59E0B":"rgba(16,185,129,.3)"}`,color:missingRate?"#F59E0B":"#34D399"}} title={title}>USD{missingRate?" ⚠":""}</span>;
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
const G  = { background:ds.color.neutral[0], border:ds.border.thin, borderRadius:ds.radius.xl, boxShadow:ds.shadow.sm };
const GHV= { background:ds.color.neutral[50], border:`1px solid ${ds.color.neutral[300]}`, borderRadius:ds.radius.xl, boxShadow:ds.shadow.md };
const G2 = { background:ds.color.neutral[50], border:ds.border.thin, borderRadius:ds.radius.lg };
const TRANS = `all ${ds.motion.base}`;

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
  return <span style={{ display:"inline-block", padding:"2px 7px", fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", borderRadius:4, background: bg||`${color}20`, border:`1px solid ${color}40`, color }}>{children}</span>;
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
            style={{height:28,padding:"0 6px",fontSize:ds.font.size.xs,background:"transparent",border:"1px solid rgba(255,255,255,.18)",borderRadius:4,color:"#D4D4D8",fontFamily:"inherit",cursor:"pointer",outline:"none"}}>
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
        <span style={{marginLeft:"auto",fontSize:ds.font.size.xs,color:savedAt?GRN:TX3,flexShrink:0,display:"flex",alignItems:"center",gap:3}}>
          {savedAt ? <>✓ Salvo {savedAt.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</> : `${charCount} car.`}
        </span>

        <button onMouseDown={e=>{e.preventDefault();exportRoteiro(value,title);}}
          style={{marginLeft:8,padding:"4px 10px",height:30,fontSize:ds.font.size.xs,fontWeight:700,background:`${RED}10`,border:`1px solid ${RED}30`,borderRadius:5,color:RED,cursor:"pointer",display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
          ↗ Exportar
        </button>
      </div>

      {/* ── Section chips ── */}
      <div style={{display:"flex",alignItems:"center",gap:5,padding:"5px 12px",borderBottom:`1px solid ${LN}`,background:B2,flexWrap:"wrap"}}>
        <span style={{fontSize:ds.font.size.xs,fontWeight:700,color:TX3,textTransform:"uppercase",letterSpacing:".1em",marginRight:4}}>+ Seção</span>
        {SECTIONS.map(s=>(
          <button key={s} onMouseDown={e=>{e.preventDefault();insertSection(s);}}
            style={{fontSize:ds.font.size.xs,padding:"2px 9px",background:B1,border:`1px solid ${LN}`,borderRadius:99,cursor:"pointer",color:TX2,fontWeight:600,transition:"all .12s"}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=RED;e.currentTarget.style.color=RED;e.currentTarget.style.background=`${RED}08`;}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor=LN;e.currentTarget.style.color=TX2;e.currentTarget.style.background=B1;}}>
            {s}
          </button>
        ))}
        <span style={{marginLeft:"auto",fontSize:ds.font.size.xs,color:TX3}}>Selecione texto para formatar</span>
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
  return <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".14em", textTransform:"uppercase", color:TX3, display:"flex", alignItems:"center", gap:10, margin:"18px 0 12px" }}>
    {children}<div style={{ flex:1, height:1, background:LN }}/>
  </div>;
}

function Field({ label, children, full }) {
  return <div style={{ display:"flex", flexDirection:"column", gap:4, gridColumn:full?"1/-1":"auto" }}>
    <label style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2 }}>{label}</label>
    {children}
  </div>;
}

function CommToggle({ on, onToggle, label }) {
  return <div style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }} onClick={e=>{e.stopPropagation();onToggle();}}>
    <Toggle on={on} onToggle={()=>{}}/>
    {label && <span style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", color:on?GRN:TX2 }}>{on?"✓ Comissão Ranked (a pagar)":"Sem comissão"}</span>}
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
  const [pass,  setPass]  = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  const handleLogin = async e => {
    e.preventDefault();
    if (!email || !pass) return setError("Preencha email e senha.");
    setLoading(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch {
      setError("Email ou senha inválidos.");
    } finally { setLoading(false); }
  };

  return (
    <div style={{
      minHeight:      '100vh',
      background:     ds.color.neutral[50],
      display:        'flex', flexDirection:'column',
      alignItems:     'center', justifyContent:'center',
      fontFamily:     ds.font.sans,
      position:       'relative', overflow:'hidden',
    }}>
      {/* Grid */}
      <div style={{ position:'absolute', inset:0,
        backgroundImage:`linear-gradient(${ds.color.neutral[200]} 1px, transparent 1px), linear-gradient(90deg, ${ds.color.neutral[200]} 1px, transparent 1px)`,
        backgroundSize:'64px 64px', opacity:.4, pointerEvents:'none' }}/>

      {/* Logo */}
      <div style={{ marginBottom:ds.space[10], textAlign:'center', position:'relative' }}>
        <div style={{ fontSize:ds.font.size.sm, fontWeight:ds.font.weight.semibold, letterSpacing:'0.2em', textTransform:'uppercase', color:ds.color.neutral[900] }}>
          ENTRE<span style={{ color:ds.color.brand[500] }}>GAS</span>
        </div>
        <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[400], marginTop:ds.space[2], letterSpacing:'0.04em' }}>
          Gestão de contratos e entregas · Ranked
        </div>
      </div>

      {/* Card */}
      <DsCard padding="lg" elevation="sm" bordered={false}
        style={{ width:'100%', maxWidth:380, margin:`0 ${ds.space[3]}` }}>
        <div style={{ marginBottom:ds.space[6] }}>
          <div style={{ fontSize:ds.font.size.xl, fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], letterSpacing:'-0.02em', marginBottom:ds.space[1] }}>
            Entrar na plataforma
          </div>
          <div style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[500] }}>
            Acesso restrito à equipe Ranked
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:ds.space[4] }}>
          <DsInput label="Email" type="email" value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="matheus@standproducoes.com"/>
          <DsInput label="Senha" type="password" value={pass}
            onChange={e => setPass(e.target.value)}
            placeholder="••••••••"/>
          {error && (
            <div style={{ fontSize:ds.font.size.xs, color:ds.color.danger[500],
              background:ds.color.danger[50], border:`1px solid ${ds.color.brand[100]}`,
              borderRadius:ds.radius.md, padding:`${ds.space[2]} ${ds.space[3]}` }}>
              {error}
            </div>
          )}
          <DsButton type="submit" variant="primary" size="lg" fullWidth loading={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </DsButton>
        </form>

        <div style={{ marginTop:ds.space[5], paddingTop:ds.space[5], borderTop:ds.border.thin,
          fontSize:ds.font.size.xs, color:ds.color.neutral[400], textAlign:'center' }}>
          Lucas Veloso @veloso.lucas_
        </div>
      </DsCard>
    </div>
  );
}

// ─── App shell ────────────────────────────────────────────
const NAV_ITEMS = [
  { id:"dashboard",      label:"Dashboard",  icon:"layoutDashboard" },
  { id:"acompanhamento", label:"Produção",   icon:"kanban"          },
  { id:"contratos",      label:"Contratos",  icon:"fileText"        },
  { id:"marcas",         label:"Marcas",     icon:"tag"             },
  { id:"financeiro",     label:"Financeiro", icon:"banknote"        },
  { id:"caixa",          label:"Caixa",      icon:"landmark"        },
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
    <div style={{
      width:220, flexShrink:0, position:'sticky', top:0,
      height:'100vh', display:'flex', flexDirection:'column',
      background:ds.color.neutral[0], borderRight:ds.border.thin,
    }}>
      {/* Logo */}
      <div style={{ padding:`${ds.space[5]} ${ds.space[4]}`, borderBottom:ds.border.thin, flexShrink:0 }}>
        <div style={{ fontSize:ds.font.size.sm, fontWeight:ds.font.weight.semibold, letterSpacing:'0.16em', textTransform:'uppercase', color:ds.color.neutral[900] }}>
          ENTRE<span style={{ color:ds.color.brand[500] }}>GAS</span>
        </div>
        <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[400], marginTop:ds.space[1] }}>
          Ranked
        </div>
      </div>

      {/* Nav */}
      <nav aria-label="Navegação principal" style={{ padding:`${ds.space[3]} ${ds.space[2]}`, flex:1, overflowY:'auto' }}>
        <div style={{ fontSize:ds.font.size.xs, fontWeight:ds.font.weight.semibold, letterSpacing:'0.12em', textTransform:'uppercase', color:ds.color.neutral[400], padding:`${ds.space[1]} ${ds.space[2]}`, marginBottom:ds.space[1] }}>
          Navegação
        </div>
        {NAV_ITEMS.filter(item => allowedNav.includes(item.id)).map(item => {
          const active = view===item.id;
          return (
            <div key={item.id} onClick={()=>setView(item.id)}
              role="button" tabIndex={0} aria-current={active?"page":undefined}
              onKeyDown={e=>e.key==="Enter"&&setView(item.id)}
              style={{ display:'flex', alignItems:'center', gap:ds.space[2], padding:`${ds.space[2]} ${ds.space[3]}`,
                borderRadius:ds.radius.md, cursor:'pointer', marginBottom:2, outline:'none',
                fontSize:ds.font.size.sm,
                fontWeight:active?ds.font.weight.semibold:ds.font.weight.regular,
                color:active?ds.color.neutral[900]:ds.color.neutral[500],
                background:active?ds.color.neutral[100]:'transparent',
                transition:`background ${ds.motion.fast}, color ${ds.motion.fast}` }}
              onMouseEnter={e=>{ if(!active){e.currentTarget.style.background=ds.color.neutral[50];e.currentTarget.style.color=ds.color.neutral[700];} }}
              onMouseLeave={e=>{ if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color=ds.color.neutral[500];} }}>
              <DsIcon name={item.icon} size={15} color={active?ds.color.neutral[900]:ds.color.neutral[400]}/>
              {item.label}
            </div>
          );
        })}
      </nav>

      {/* WhatsApp button */}
      <div style={{ padding:`0 ${ds.space[2]} ${ds.space[2]}`, flexShrink:0 }}>
        <button onClick={sendWhatsApp} style={{ width:'100%', padding:`${ds.space[2]} ${ds.space[3]}`,
          borderRadius:ds.radius.md, fontFamily:'inherit', cursor:'pointer',
          border:`1px solid ${isSunday?WA_GREEN:`${WA_GREEN}40`}`,
          background:isSunday?`${WA_GREEN}12`:'transparent',
          color:isSunday?WA_DARK:ds.color.neutral[500],
          fontSize:ds.font.size.xs,
          fontWeight:isSunday?ds.font.weight.semibold:ds.font.weight.regular,
          display:'flex', alignItems:'center', gap:ds.space[2],
          transition:`all ${ds.motion.fast}` }}>
          <DsIcon name="phone" size={13} color={isSunday?WA_DARK:ds.color.neutral[400]}/>
          <span>{isSunday?'Enviar resumo da semana':'Resumo WhatsApp'}</span>
        </button>
      </div>

      {/* User footer */}
      <div style={{ padding:`${ds.space[3]} ${ds.space[4]}`, borderTop:ds.border.thin, flexShrink:0 }}>
        {onlineUsers.length > 0 && (
          <div style={{ display:'flex', alignItems:'center', marginBottom:ds.space[3] }}>
            {[...onlineUsers.filter(u=>u.sessionId!==my.sessionId), {...my,isMe:true}].slice(0,5).map((u,i) => (
              <div key={u.sessionId||i} title={u.isMe?`${u.name} (você)`:u.name}
                style={{ width:26, height:26, borderRadius:'50%', background:u.color,
                  border:`2px solid ${ds.color.neutral[0]}`,
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:ds.font.size.xs, fontWeight:700, color:'#fff',
                  marginLeft:i>0?-8:0, zIndex:10-i, position:'relative', flexShrink:0 }}>
                {u.name?.charAt(0).toUpperCase()}
                {u.isMe && <div style={{ position:'absolute', bottom:-1, right:-1, width:6, height:6, borderRadius:'50%', background:ds.color.success[500], border:`1px solid ${ds.color.neutral[0]}` }}/>}
              </div>
            ))}
            <span style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[500], marginLeft:ds.space[3] }}>
              {onlineUsers.length} online
            </span>
          </div>
        )}
        {/* Role — colored dot, sem emoji */}
        <div style={{ display:'flex', alignItems:'center', gap:ds.space[2], marginBottom:ds.space[2] }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:roleMeta.color, flexShrink:0 }}/>
          <span style={{ fontSize:ds.font.size.xs, fontWeight:ds.font.weight.medium, color:roleMeta.color }}>
            {roleMeta.label}
          </span>
        </div>
        {/* Name + actions */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:ds.space[1] }}>
          <div style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[700], fontWeight:ds.font.weight.medium, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', flex:1 }}>
            {userName || user?.email?.split('@')[0]}
          </div>
          <div style={{ display:'flex', gap:2, flexShrink:0 }}>
            {role==="admin" && (
              <DsIconButton size="sm" variant="ghost" ariaLabel="Convidar usuário" onClick={onInvite}
                icon={<DsIcon name="userPlus" size={14} color={ds.color.neutral[400]}/>}/>
            )}
            <DsIconButton size="sm" variant="ghost" ariaLabel="Sair" onClick={onSignOut}
              icon={<DsIcon name="logOut" size={14} color={ds.color.neutral[400]}/>}/>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopBar({ view, onNewContract, onNewPost, onNewTask, syncStatus, isMobile, role, userName }) {
  const title = NAV_ITEMS.find(i=>i.id===view)?.label || view;

  // Mobile header
  if (isMobile) return (
    <div style={{ height:56, borderBottom:ds.border.thin, display:'flex', alignItems:'center',
      padding:`0 ${ds.space[4]}`, gap:ds.space[3],
      background:ds.color.neutral[0], flexShrink:0,
      position:'sticky', top:0, zIndex:ds.z.sticky, boxShadow:ds.shadow.xs }}>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:ds.font.weight.semibold, fontSize:ds.font.size.sm, letterSpacing:'0.14em', textTransform:'uppercase', color:ds.color.neutral[900], lineHeight:1 }}>
          ENTRE<span style={{ color:ds.color.brand[500] }}>GAS</span>
        </div>
        {userName && <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[400], marginTop:2 }}>{userName}</div>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:ds.space[2] }}>
        <div style={{ width:6, height:6, borderRadius:'50%', flexShrink:0,
          background: syncStatus==='ok' ? ds.color.success[500] : syncStatus==='loading' ? ds.color.warning[500] : ds.color.danger[500] }}/>
        <DsButton variant="primary" size="sm" onClick={onNewContract}>+ Novo</DsButton>
      </div>
    </div>
  );

  // Desktop header
  const statusColor = { loading:ds.color.warning[500], ok:ds.color.success[500], error:ds.color.danger[500] }[syncStatus] || ds.color.success[500];
  const statusLabel = { loading:'Sincronizando', ok:'Ao vivo', error:'Offline' }[syncStatus] || 'Ao vivo';

  return (
    <div style={{ height:48, background:ds.color.neutral[0], borderBottom:ds.border.thin,
      display:'flex', alignItems:'center', padding:`0 ${ds.space[5]}`, gap:ds.space[3],
      flexShrink:0, position:'sticky', top:0, zIndex:ds.z.sticky }}>
      <div style={{ fontSize:ds.font.size.md, fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], letterSpacing:'-0.01em' }}>
        {title}
      </div>
      <div style={{ flex:1 }}/>

      {/* Sync status dot (minimal) */}
      <div style={{ width:6, height:6, borderRadius:'50%', background:statusColor, flexShrink:0 }} title={statusLabel}/>

      {/* CTA */}
      {(view==="contratos"||view==="dashboard") && (
        <DsButton variant="primary" size="sm"
          leftIcon={<DsIcon name="plus" size={13} color={ds.color.neutral[0]}/>}
          onClick={onNewContract}>
          Contrato
        </DsButton>
      )}
    </div>
  );
}


// ─── Dashboard ────────────────────────────────────────────
/**
 * Dashboard — Centro de Comando Operacional Semanal
 *
 * ZERO informação financeira. Responde: "O que precisa
 * acontecer essa semana para nada atrasar?"
 *
 * 4 blocos:
 *   1. WeekHeader    — semana, chips, progresso
 *   2. TodayFocusList — foco de hoje (top 7 por urgência)
 *   3. RiskSignals   — semáforo de riscos
 *   4. WeekTimeline  — visualização da semana
 *
 * Navegação cross-view:
 *   Chips e sinais chamam navigateTo("acompanhamento") e
 *   gravam window.__dashboardFilter para que Acompanhamento
 *   possa ler e aplicar o filtro inicial.
 *   TODO: substituir window.__dashboardFilter por estado React
 *         passado via prop (requer ajuste em ViewRenderer).
 */
function Dashboard({ contracts, posts, deliverables: dashDeliverables = [], stats, rates, saveNote, toggleComm, toggleCommPaid, toggleNF, setModal, navigateTo, role = "admin", userName = "Matheus" }) {
  const isMobile       = useIsMobile();
  const today          = useMemo(() => new Date(), []);
  const allDeliverables = dashDeliverables || [];

  // ── Week bounds ──────────────────────────────────────────
  const wStart = useMemo(() => sowLib(today), [today]);
  const wEnd   = useMemo(() => eowLib(today), [today]);
  const wDays  = useMemo(() => weekDays(today), [today]);

  // ── Chip counts ──────────────────────────────────────────
  const weekDeliverables = useMemo(
    () => allDeliverables.filter(d => isInCurrentWeek(d.plannedPostDate, today)),
    [allDeliverables, today],
  );

  const weekDone   = useMemo(() => weekDeliverables.filter(d => d.stage === "done").length, [weekDeliverables]);
  const weekTotal  = weekDeliverables.length;

  // Chip a: deliver this week (not done)
  const deliverThisWeek = useMemo(
    () => weekDeliverables.filter(d => d.stage !== "done").length,
    [weekDeliverables],
  );

  // Chip b: in production (roteiro → edicao)
  const IN_PROD_STAGES = new Set(["roteiro", "ap_roteiro", "gravacao", "edicao"]);
  const inProd = useMemo(
    () => allDeliverables.filter(d => IN_PROD_STAGES.has(d.stage)).length,
    [allDeliverables],
  );

  // Chip c: awaiting approval
  const awaitingApproval = useMemo(
    () => allDeliverables.filter(d => d.stage === "ap_roteiro" || d.stage === "ap_final").length,
    [allDeliverables],
  );

  // ── Risk signals ─────────────────────────────────────────
  const signals = useMemo(
    () => detectRiskSignals({ deliverables: allDeliverables, contracts }, today),
    [allDeliverables, contracts, today],
  );

  // Chip d: at-risk count = HIGH signals count
  const atRisk = useMemo(() => signals.filter(s => s.severity === "HIGH").length, [signals]);

  // ── Focus list ───────────────────────────────────────────
  const focusList = useMemo(
    () => topPriorityItems(allDeliverables, 7, today),
    [allDeliverables, today],
  );

  // ── Navigation helpers ───────────────────────────────────
  const navigateWithFilter = (targetView, filter) => {
    // TODO: refactor to use React state/context instead of window global.
    //       For now, Acompanhamento can read window.__dashboardFilter on mount.
    if (filter) window.__dashboardFilter = filter;
    navigateTo(targetView);
  };

  const handleChipClick = (chipId) => {
    const filtersByChip = {
      entregar:  { type: "week_pending" },
      producao:  { type: "stages", stages: ["roteiro","ap_roteiro","gravacao","edicao"] },
      aprovacao: { type: "stages", stages: ["ap_roteiro","ap_final"] },
      risco:     { type: "ids", ids: signals.filter(s=>s.severity==="HIGH").flatMap(s=>s.ids) },
    };
    navigateWithFilter("acompanhamento", filtersByChip[chipId]);
  };

  const handleSignalClick = (signal) => {
    if (signal.action.type === "filter") {
      navigateWithFilter("acompanhamento", signal.action.filter);
    } else {
      navigateTo(signal.action.view);
    }
  };

  const handleOpenItem = (d) => {
    // Navigate to acompanhamento and pre-select the item
    navigateWithFilter("acompanhamento", { type: "ids", ids: [d.id] });
  };

  const handleActionClick = (d) => {
    // TODO: wire to actual stage-advance action or show inline modal.
    //       For now, open the deliverable detail via pipeline.
    handleOpenItem(d);
  };

  // ── Skeleton on first load ───────────────────────────────
  // (Handled by ViewRenderer — this component only renders when data is ready)

  return (
    <div style={{ padding: isMobile ? `${ds.space[3]} ${ds.space[3]} 88px` : `${ds.space[5]} ${ds.space[6]}`, maxWidth: 1320, margin: "0 auto" }}>

      {/* BLOCO 1 — Cabeçalho da semana */}
      <WeekHeader
        today={today}
        weekStart={wStart}
        weekEnd={wEnd}
        weekDone={weekDone}
        weekTotal={weekTotal}
        deliverThisWeek={deliverThisWeek}
        inProd={inProd}
        awaitingApproval={awaitingApproval}
        atRisk={atRisk}
        isMobile={isMobile}
        onChipClick={handleChipClick}
      />

      {/* BLOCOS 2 + 3 — Foco de hoje e Sinais (side by side) */}
      <div style={{
        display:             "grid",
        gridTemplateColumns: isMobile ? "1fr" : "60% 1fr",
        gap:                 ds.space[4],
        marginBottom:        ds.space[4],
        alignItems:          "start",
      }}>
        <TodayFocusList
          items={focusList}
          contracts={contracts}
          today={today}
          isMobile={isMobile}
          hasWeekItems={weekTotal > 0}
          onOpenItem={handleOpenItem}
          onNavigate={navigateTo}
          onActionClick={handleActionClick}
        />
        <RiskSignals
          signals={signals}
          isMobile={isMobile}
          onSignalClick={handleSignalClick}
        />
      </div>

      {/* BLOCO 4 — Linha do tempo da semana */}
      <WeekTimeline
        today={today}
        days={wDays}
        deliverables={weekDeliverables}
        contracts={contracts}
        isMobile={isMobile}
        onOpenItem={handleOpenItem}
        onNavigate={navigateTo}
      />
    </div>
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize:ds.font.size.xs, padding: "2px 7px", borderRadius: 99, background: B3, color: TX2 }}>
            <span style={{ width: 5, height: 5, borderRadius: "50%", background: contract.color, display: "inline-block" }} />
            {contract.company.split("/")[0].trim()}
          </span>
        )}
        <span style={{ fontSize:ds.font.size.xs, padding: "2px 7px", borderRadius: 99, background: B3, color: TX2 }}>{TYPE_LABEL[item.type] || item.type}</span>
        {item.plannedPostDate && (
          <span style={{ fontSize:ds.font.size.xs, padding: "2px 7px", borderRadius: 99, background: B3, color: TX2, marginLeft: "auto" }}>
            📅 {fmtDate(item.plannedPostDate)}
          </span>
        )}
      </div>
      {dl && stageId !== "done" && (
        <div style={{ marginTop: 6, fontSize:ds.font.size.xs, fontWeight: 600, color: isLate ? RED : isUrgent ? AMB : TX3 }}>
          {isLate ? `${Math.abs(daysUntil)}d atrasado` : daysUntil === 0 ? "Hoje" : `${daysUntil}d`}
          {item.stageDateOverrides?.[stageId] ? " (manual)" : ""}
        </div>
      )}
      {item.responsible?.[stageId] && (
        <div style={{ marginTop: 4, fontSize:ds.font.size.xs, color: TX3 }}>👤 {item.responsible[stageId]}</div>
      )}
      {exceptions.length > 0 && (
        <div title={exceptions.map(e=>`${e.label}: ${e.got}d disponíveis (mín. ${e.need}d)`).join(" · ")}
          style={{ marginTop:4, fontSize:ds.font.size.xs, fontWeight:700, color:"#EA580C", background:"rgba(234,88,12,.1)", borderRadius:4, padding:"1px 6px", display:"inline-block", cursor:"help" }}>
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
          <span style={{ fontSize:ds.font.size.xs, fontWeight: 700, background: "#FFF1F2", color: RED, padding: "2px 6px", borderRadius: 99, border: "1px solid #FCA5A5" }}>{lateCount} atrasado{lateCount>1?"s":""}</span>
        )}
        <span style={{ fontSize:ds.font.size.xs, fontWeight: 700, background: B3, color: TX2, padding: "2px 7px", borderRadius: 99 }}>{items.length}</span>
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

function Acompanhamento({ contracts, posts, deliverables=[], saveDeliverables, calEvents, calMonth, setCal, calFilter, setCalF, role, brands=[] }) {
  const isMobile = useIsMobile();
  const setDeliverables = saveDeliverables || (() => {});
  const [view, setView]   = useState("calendar");
  const [editItem, setEditItem] = useState(null);
  const [newOpen, setNewOpen]   = useState(false);
  const [prefillDate, setPrefillDate] = useState("");
  const [quickDate, setQuickDate]     = useState(null); // for QuickPostModal from calendar
  const [filter, setFilter]       = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [dismissedConflicts, setDismissedConflicts] = useState(new Set());
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
    <div style={{ padding: isMobile ? "12px 12px 88px" : 24, maxWidth:1600 }}>
      {/* Conflict summary — replaces the old "Conflito de postagem detectado" banner */}
      {(() => {
        const allConflicts = buildConflictDateMap(deliverables, brands, contracts);
        const blockDates = Object.entries(allConflicts).filter(([d,s])=>s==="BLOCK" && !dismissedConflicts.has(d));
        const warnDates  = Object.entries(allConflicts).filter(([d,s])=>s==="WARN"  && !dismissedConflicts.has(d));
        if (!blockDates.length && !warnDates.length) return null;
        const dismiss = (date) => setDismissedConflicts(prev => new Set([...prev, date]));
        return (
          <div style={{ background:`${AMB}08`, border:`1px solid ${AMB}30`, borderLeft:`3px solid ${AMB}`, borderRadius:8, padding:"10px 14px", marginBottom:16, display:"flex", alignItems:"flex-start", gap:10 }}>
            <DsIcon name="alertTriangle" size={16} color={AMB}/>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ fontSize:12, fontWeight:700, color:AMB, marginBottom:4 }}>
                Conflitos de agenda abertos —&nbsp;
                {blockDates.length>0&&<span style={{color:RED}}>{blockDates.length} bloqueante{blockDates.length>1?"s":""}</span>}
                {blockDates.length>0&&warnDates.length>0&&" · "}
                {warnDates.length>0&&<span style={{color:AMB}}>{warnDates.length} aviso{warnDates.length>1?"s":""}</span>}
              </div>
              {blockDates.slice(0,3).map(([date])=>(
                <div key={date} style={{fontSize:11,color:TX2,display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <strong style={{color:RED,flexShrink:0}}>⛔ {fmtDate(date)}</strong>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {deliverables.filter(d=>d.plannedPostDate===date).map(d=>d.title).join(", ")}
                  </span>
                </div>
              ))}
              {warnDates.slice(0,3).map(([date])=>(
                <div key={date} style={{fontSize:11,color:TX2,display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                  <strong style={{color:AMB,flexShrink:0}}>⚠️ {fmtDate(date)}</strong>
                  <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                    {deliverables.filter(d=>d.plannedPostDate===date).map(d=>d.title).join(", ")}
                  </span>
                  <button
                    onClick={()=>dismiss(date)}
                    aria-label={`Dispensar aviso de ${fmtDate(date)}`}
                    style={{fontSize:10,color:TX3,background:"none",border:`1px solid ${LN2}`,borderRadius:4,padding:"1px 7px",cursor:"pointer",flexShrink:0,lineHeight:1.6}}>
                    Dispensar
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

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
              style={{ padding: "5px 12px", fontSize:ds.font.size.xs, fontWeight: 700, cursor: "pointer", transition: TRANS, color: view===v?TX:TX2, background: view===v?B3:"transparent" }}>{l}</div>
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
        <CalendarView contracts={contracts} deliverables={deliverables} saveDeliverables={save} onEditDeliverable={setEditItem} onNewDeliverable={date=>setQuickDate(date)} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF} brands={brands}/>
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
          allDeliverables={deliverables}
          brands={brands}
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


function DeliverableModal({ item, contracts, onClose, onSave, onDelete, onAutoSave, prefillDate="", allDeliverables=[], brands=[] }) {
  const isEdit = !!item;
  const [f, setF] = useState(item || { contractId: contracts[0]?.id || "", title: "", type: "reel", plannedPostDate: prefillDate||"", stage: "briefing", responsible: {}, stageDateOverrides: {}, notes: "", roteiro: "", networks: [], networkMetrics: {} });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const [modalTab, setModalTab] = useState("info");
  const [openNet, setOpenNet] = useState(null);
  const [warnOk, setWarnOk] = useState(false); // user acknowledged WARN
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

  // ── Conflict detection ──────────────────────────────────
  const conflicts = useMemo(() => {
    if (!f.plannedPostDate || !f.contractId) return [];
    const contract = contracts.find(c => c.id === f.contractId);
    if (!contract) return [];
    const others = allDeliverables.filter(d => d.id !== (item?.id));
    return detectConflicts(
      { date: f.plannedPostDate, brandId: contract.brandId, contractId: f.contractId },
      others, brands, contracts
    );
  }, [f.plannedPostDate, f.contractId, allDeliverables, brands, contracts]);

  // Reset acknowledgement when conflicts change
  useEffect(() => { setWarnOk(false); }, [f.plannedPostDate, f.contractId]);

  const hasBlock = conflicts.some(c => c.severity === "BLOCK");
  const hasWarn  = conflicts.some(c => c.severity === "WARN");
  const saveDisabled = hasBlock || (hasWarn && !warnOk);

  const handleSave = () => {
    if (!f.title?.trim()) { alert("Preencha o título."); return; }
    if (!f.contractId) { alert("Selecione o contrato."); return; }
    if (saveDisabled) return;
    onSave(f);
  };

  const MODAL_TABS = [{ id:"info", label:"Info" },{ id:"roteiro", label:"✍️ Roteiro" },{ id:"metricas", label:"Métricas" }];
  const ROTEIRO_SECTIONS = ["Abertura","Campinho","Desenvolvimento","Bloco Publi","CTA","Encerramento"];

  const insertSection = (s) => {
    const cur = f.roteiro || "";
    set("roteiro", cur + (cur ? "\n\n" : "") + `[${s}]\n`);
  };

  // ── Conflict warning banner (rendered above footer) ──────
  const ConflictBanner = () => {
    if (!conflicts.length) return null;
    const topSeverity = conflicts[0].severity;
    const color = topSeverity === "BLOCK" ? RED : topSeverity === "WARN" ? AMB : BLU;
    const bg    = topSeverity === "BLOCK" ? `${RED}08` : topSeverity === "WARN" ? `${AMB}08` : `${BLU}06`;
    const icon  = topSeverity === "BLOCK" ? "⛔" : topSeverity === "WARN" ? "⚠️" : "ℹ️";
    return (
      <div style={{ background:bg, border:`1px solid ${color}30`, borderLeft:`3px solid ${color}`, borderRadius:8, padding:"12px 14px", marginTop:16 }}>
        <div style={{ fontWeight:700, fontSize:12, color, marginBottom:6 }}>
          {icon} {topSeverity === "BLOCK" ? "Conflito bloqueante" : topSeverity === "WARN" ? "Aviso de conflito" : "Informação"}
        </div>
        {conflicts.map((c,i) => (
          <div key={i} style={{ fontSize:11, color:TX2, marginBottom:4 }}>• {c.message}</div>
        ))}
        {hasWarn && !hasBlock && (
          <label style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, cursor:"pointer", fontSize:11, fontWeight:600, color:AMB }}>
            <input type="checkbox" checked={warnOk} onChange={e=>setWarnOk(e.target.checked)}/>
            Estou ciente, salvar mesmo assim
          </label>
        )}
        {hasBlock && (
          <div style={{ fontSize:11, color:RED, fontWeight:700, marginTop:6 }}>
            Resolva o conflito antes de salvar — altere a data ou a marca do entregável.
          </div>
        )}
      </div>
    );
  };

  return (
    <Modal title={isEdit?"Editar Entregável":"Novo Entregável"} onClose={onClose} width={860}
      footer={<>{onDelete&&<Btn onClick={()=>onDelete(item.id)} variant="danger" size="sm">Excluir</Btn>}<div style={{flex:1}}/><Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn><Btn onClick={handleSave} variant="primary" size="sm" disabled={saveDisabled}>{isEdit?"Salvar":"Criar"}</Btn></>}>

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
              <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:5,display:"flex",alignItems:"center",gap:4}}>{s.label}{exc&&<span title={exc.rule} style={{fontSize:ds.font.size.xs,cursor:"help"}}>⚠️</span>}</div>
              <div style={{fontSize:12,fontWeight:600,color:dl!==null&&dl<0?RED:TX,marginBottom:4}}>{fmtDate(override||auto)}</div>
              {dl!==null&&<div style={{fontSize:ds.font.size.xs,color:dl<0?RED:dl<=1?AMB:TX3,marginBottom:5}}>{dl<0?`${Math.abs(dl)}d atrás`:dl===0?"Hoje":`${dl}d`}</div>}
              {exc&&<div style={{fontSize:ds.font.size.xs,color:"#EA580C",fontWeight:600,marginBottom:4}}>{exc.got}d / mín. {exc.need}d</div>}
              <div style={{fontSize:ds.font.size.xs,color:TX3,marginBottom:4,fontStyle:"italic"}}>{s.rule}</div>
              <input type="date" value={f.stageDateOverrides?.[s.id]||""} onChange={e=>setF(x=>({...x,stageDateOverrides:{...(x.stageDateOverrides||{}),[s.id]:e.target.value}}))} style={{width:"100%",padding:"3px 5px",fontSize:ds.font.size.xs,background:B1,border:`1px solid ${LN}`,borderRadius:4,color:TX3,fontFamily:"inherit",outline:"none"}}/>
              <input value={f.responsible?.[s.id]||""} placeholder="Responsável" onChange={e=>setF(x=>({...x,responsible:{...(x.responsible||{}),[s.id]:e.target.value}}))} style={{width:"100%",padding:"3px 5px",fontSize:ds.font.size.xs,background:B1,border:`1px solid ${LN}`,borderRadius:4,color:TX,fontFamily:"inherit",outline:"none",marginTop:4}}/>
            </div>);})}</div></>)}
        {(f.stage==="postagem"||f.stage==="done")&&(<><SRule>Publicação</SRule>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <Field label="Link"><Input value={f.postLink||""} onChange={e=>set("postLink",e.target.value)} placeholder="https://instagram.com/p/..."/></Field>
            <Field label="Data publicação"><Input type="date" value={f.publishedAt||""} onChange={e=>set("publishedAt",e.target.value)}/></Field>
          </div>
        </>)}
        <SRule>Briefing / Observações</SRule>
        <Field label=""><Textarea value={f.notes||""} onChange={e=>set("notes",e.target.value)} rows={4} placeholder="Resumo do briefing, links, pontos obrigatórios, don'ts…"/></Field>
        <ConflictBanner/>
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
                {reach>0&&<span style={{fontSize:ds.font.size.xs,color:TX2}}>{reach.toLocaleString("pt-BR")} alcance</span>}
                {eng&&<span style={{fontSize:ds.font.size.xs,fontWeight:700,color:GRN}}>{eng}% eng.</span>}
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
        <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Custos do Contrato</div>
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
            {i===0 && <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:4}}>Descrição</div>}
            <input value={cost.label} placeholder="ex: Passagem aérea" onChange={e=>updCost(i,"label",e.target.value)} onBlur={saveCost}
              style={{width:"100%",padding:"8px 10px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
          </div>
          <div>
            {i===0 && <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:4}}>Valor R$</div>}
            <input type="number" min="0" value={cost.value} placeholder="0" onChange={e=>updCost(i,"value",e.target.value)} onBlur={saveCost}
              style={{width:"100%",padding:"8px 10px",background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontSize:12,fontFamily:"inherit",outline:"none"}}/>
          </div>
          <div>
            {i===0 && <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:4}}>Categoria</div>}
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
                <span style={{fontSize:ds.font.size.xs,padding:"1px 6px",borderRadius:99,background:`${CAT_COLOR[x.category]||TX3}15`,color:CAT_COLOR[x.category]||TX3}}>{CAT_LABEL[x.category]}</span>
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


/** Card de cotação FX para contratos em moeda estrangeira */
function FxContractCard({ contract: c, rates }) {
  const { fetchedAt, stale, source, refresh, loading } = useFx();
  const rate     = Number(rates?.[c.currency] ?? rates?.[c.currency?.toLowerCase()] ?? 0);
  const total    = contractTotal(c);
  const brlValue = rate > 0 ? toBRL(total, c.currency, rates) : null;

  if (!rate) return null;

  // Variação cambial — função pura testável, nunca NaN/Infinity/0% espúrio
  const lockedRate  = Number(c.lockedRate)  || 0;
  const variationPct = calcLockedVariation(rate, lockedRate); // number|null
  const variationFmt = variationPct != null
    ? `${variationPct >= 0 ? '+' : ''}${variationPct.toFixed(1)}%`
    : '—';
  const varColor = variationPct == null
    ? ds.color.neutral[400]
    : variationPct > 0
    ? ds.color.success[500]
    : ds.color.danger[500];

  // lockedRateAt: pode ser ISO string ou null
  const lockedDateFmt = c.lockedRateAt
    ? new Date(c.lockedRateAt).toLocaleDateString('pt-BR')
    : null;

  return (
    <div style={{ ...G2, padding:`${ds.space[3]} ${ds.space[4]}`, display:"flex", alignItems:"center", gap:ds.space[4], flexWrap:"wrap" }}>
      <div style={{ flex:1, minWidth:0 }}>
        {/* Valor original + conversão BRL */}
        <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[700], marginBottom:2, fontVariantNumeric:"tabular-nums" }}>
          <span style={{ fontWeight:ds.font.weight.semibold }}>{fmtMoney(total, c.currency)}</span>
          {brlValue != null && (
            <span style={{ color:ds.color.neutral[500] }}> ≈ {fmtMoney(brlValue)}</span>
          )}
        </div>

        {/* Cotação atual */}
        <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[400] }}>
          Cotação atual: {formatRate(rate)}
          {stale  && <span style={{ color:ds.color.warning[500] }}> · desatualizada</span>}
          {!stale && fetchedAt && <span> · {formatRelativeTime(fetchedAt)}</span>}
        </div>

        {/* Cotação travada na assinatura */}
        {lockedRate > 0 && (
          <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[400], marginTop:1 }}>
            {lockedDateFmt
              ? <span>Travada em <strong style={{ color:ds.color.neutral[700] }}>{lockedDateFmt}</strong> · {formatRate(lockedRate)}</span>
              : <span>Na assinatura: {formatRate(lockedRate)}</span>
            }
            {' '}
            <span style={{ color:varColor, fontWeight:ds.font.weight.semibold }}>
              {variationFmt}
            </span>
          </div>
        )}
      </div>
      <DsIconButton size="sm" variant="ghost" ariaLabel="Atualizar cotação" onClick={refresh}
        icon={<DsIcon name="refresh" size={13} color={ds.color.neutral[400]}
          style={{ animation: loading ? 'ranked-spin 0.8s linear infinite' : 'none' }}/>}/>
    </div>
  );
}

function ContractDetail({ contract: c, contracts, posts, deliverables, saveC, saveP, saveDeliverables, toggleComm, toggleCommPaid, toggleNF, rates, onBack, setModal, brands=[], navigateTo, setSelectedBrand, openCopilot }) {
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
  ];

  const scoreColor = aiReport?.performance?.score >= 70 ? GRN : aiReport?.performance?.score >= 40 ? AMB : RED;

  const isMob = window.innerWidth < 768;
  return (
    <>
    <div style={{ padding: isMob?"12px 12px 88px":24, maxWidth: 1100 }}>
      {/* Mobile header */}
      {isMob ? (
        <div style={{ marginBottom:16 }}>
          <div style={{ display:"flex", alignItems:"center", gap:ds.space[2], marginBottom:ds.space[3] }}>
            <DsButton variant="secondary" size="sm" onClick={onBack}
              leftIcon={<DsIcon name="chevronLeft" size={14}/>}>
              Contratos
            </DsButton>
            <div style={{ flex:1 }}/>
            <DsButton variant="secondary" size="sm" onClick={()=>setModal({type:"contract",data:c})}
              leftIcon={<DsIcon name="edit" size={13}/>}>
              Editar
            </DsButton>
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
        <div style={{ display:"flex", alignItems:"flex-start", gap:ds.space[3], marginBottom:ds.space[6] }}>
          <DsButton variant="secondary" size="sm" onClick={onBack}
            leftIcon={<DsIcon name="chevronLeft" size={14} color={ds.color.neutral[600]}/>}>
            Contratos
          </DsButton>
          <DsButton variant="ghost" size="sm" onClick={async()=>{
            if(!confirm("Excluir contrato "+c.company+" e todos os seus entregáveis?")) return;
            await saveC(contracts.filter(x=>x.id!==c.id));
            if(saveDeliverables) await saveDeliverables(deliverables.filter(d=>d.contractId!==c.id));
            onBack();
          }} leftIcon={<DsIcon name="trash" size={13} color={ds.color.danger[500]}/>}
            style={{ color:ds.color.danger[500] }}>
            Excluir
          </DsButton>
          <div style={{ flex:1 }}>
            <div style={{ display:"flex", alignItems:"center", gap:ds.space[3], marginBottom:ds.space[1] }}>
              <div style={{ width:10, height:10, borderRadius:"50%", background:c.color }}/>
              <h1 style={{ fontSize:ds.font.size['2xl'], fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], letterSpacing:"-.02em" }}>{c.company}</h1>
              {currBadge(c.currency)}
              {c.paymentType==="monthly" && <Badge color={TX2}>Mensal</Badge>}
              {c.hasTravel && <Badge color={BLU}>✈ {c.travelDestination||"Viagem"}</Badge>}
              {c.brandId && brands.find(b=>b.id===c.brandId) && (
                <button onClick={()=>{ setSelectedBrand&&setSelectedBrand(c.brandId); navigateTo&&navigateTo("marca-detalhe"); }}
                  style={{ display:"flex", alignItems:"center", gap:ds.space[1], padding:`2px ${ds.space[2]}`, borderRadius:ds.radius.full, background:`${BLU}10`, border:`1px solid ${BLU}30`, color:BLU, fontSize:ds.font.size.xs, fontWeight:ds.font.weight.semibold, cursor:"pointer", fontFamily:"inherit" }}>
                  <DsIcon name="tag" size={10} color={BLU}/> {brands.find(b=>b.id===c.brandId).name}
                </button>
              )}
            </div>
            <div style={{ display:"flex", gap:ds.space[4], fontSize:ds.font.size.sm, color:TX2 }}>
              <span style={{ fontWeight:ds.font.weight.semibold, fontSize:ds.font.size.lg, color:ds.color.neutral[900] }}>{total>0?fmtMoney(total,c.currency):"Valor TBD"}</span>
              {c.contractDeadline && <span style={{ color:dlColor(dl) }}>prazo {fmtDate(c.contractDeadline)} · {dl}d</span>}
            </div>
            {/* FX card — só aparece para contratos em moeda estrangeira */}
            {c.currency !== 'BRL' && <FxContractCard contract={c} rates={rates}/>}
          </div>
          <DsButton variant="secondary" size="sm" onClick={()=>setModal({type:"contract",data:c})}
            leftIcon={<DsIcon name="edit" size={13} color={ds.color.neutral[600]}/>}>
            Editar
          </DsButton>
          <DsButton variant="secondary" size="sm"
            onClick={()=>openCopilot?.({contractId:c.id,actionId:"generate-client-report"})}
            leftIcon={<DsIcon name="download" size={13} color={ds.color.neutral[600]}/>}>
            Relatório
          </DsButton>
          <DsButton variant="primary" size="sm"
            onClick={()=>openCopilot?.({contractId:c.id,actionId:"generate-contract-report"})}
            leftIcon={<DsIcon name="sparkles" size={13} color={ds.color.neutral[0]}/>}>
            Copiloto
          </DsButton>
        </div>
      )}

      {/* Tabs — horizontal scroll on mobile */}
      <div style={{ display:"flex", gap:0, borderBottom:ds.border.thin, marginBottom:ds.space[5], overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
        {TABS.map(t => (
          <div key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:`${ds.space[3]} ${ds.space[4]}`, fontSize:ds.font.size.sm,
              fontWeight:tab===t.id?ds.font.weight.semibold:ds.font.weight.regular,
              cursor:"pointer",
              color:tab===t.id?ds.color.neutral[900]:ds.color.neutral[500],
              borderBottom:`2px solid ${tab===t.id?ds.color.neutral[900]:"transparent"}`,
              transition:TRANS, marginBottom:-1, whiteSpace:"nowrap", flexShrink:0 }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* ── Tab: Visão Geral ── */}
      {tab==="overview" && (
        <div>
          <div style={{ display:"grid", gridTemplateColumns: isMob ? "1fr 1fr" : "repeat(4,1fr)", gap: isMob ? 8 : 12, marginBottom:24 }}>
            {[
              { label:"Valor total",    value:total>0?fmtMoney(total,c.currency):"TBD" },
              { label:"Entregas",       value:`${doneDels}/${totalDels}`, sub:totalDels>0?`${Math.round(doneDels/totalDels*100)}% concluído`:undefined },
              { label:"Comissão",       value:fmtMoney(commPending,c.currency), accent:commPending>0?AMB:GRN, sub:commPending>0?"a pagar Ranked":"quitado" },
              { label:"Engajamento",    value:fmtEng(avgEng), accent:avgEng!=null?(avgEng>=3?GRN:avgEng>=1?AMB:TX2):TX2 },
            ].map((k,i) => (
              <div key={i} style={{ ...G, padding: isMob ? "12px 14px" : "16px 18px" }}>
                <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:6 }}>{k.label}</div>
                <div style={{ fontSize: isMob ? 16 : 20, fontWeight:700,color:k.accent||TX,lineHeight:1 }}>{k.value}</div>
                {k.sub&&<div style={{fontSize:ds.font.size.xs,color:TX2,marginTop:4}}>{k.sub}</div>}
              </div>
            ))}
          </div>
          {c.notes && (
            <div style={{ ...G, padding:"16px 18px", marginBottom:16 }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:8 }}>Observações</div>
              <p style={{ fontSize:13,color:TX,lineHeight:1.6 }}>{c.notes}</p>
            </div>
          )}
          {/* Pipeline summary */}
          {cDeliverables.length>0 && (
            <div style={{ ...G, padding:"16px 18px" }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Pipeline de Produção</div>
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
                    {d.plannedPostDate&&<span style={{fontSize:ds.font.size.xs,color:TX2}}>post {fmtDate(d.plannedPostDate)}</span>}
                    {isDone?<span style={{fontSize:ds.font.size.xs,fontWeight:700,color:GRN}}>✓ Entregue</span>:dl2!==null&&<span style={{fontSize:ds.font.size.xs,fontWeight:700,color:dlColor(dl2)}}>{dl2<0?`${Math.abs(dl2)}d atraso`:`${dl2}d`}</span>}
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
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Pipeline</div>
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
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Posts registrados</div>
            <div style={{ border:`1px solid ${LN}`,borderRadius:10,overflow:"hidden" }}>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 80px 80px 80px 80px 80px 80px",padding:"8px 16px",background:B2,borderBottom:`1px solid ${LN}`,fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3 }}>
                <div>Título</div><div>Views</div><div>Alcance</div><div>Curtidas</div><div>Coment.</div><div>Engaj.</div><div>Link</div>
              </div>
              {cPosts.map((p,i) => {
                const pRch=sumNetworkMetrics(p,"reach"),pLk=sumNetworkMetrics(p,"likes"),pCm=sumNetworkMetrics(p,"comments");const eng=pRch>0?((pLk+pCm)/pRch*100):calcEngagement(p);
                return (
                  <div key={p.id} style={{ display:"grid",gridTemplateColumns:"1fr 80px 80px 80px 80px 80px 80px",padding:"10px 16px",borderBottom:i<cPosts.length-1?`1px solid ${LN}`:"none",fontSize:12,alignItems:"center" }}>
                    <div style={{ fontWeight:500,color:p.isPosted?TX:TX2 }}>{p.title}{!p.isPosted&&<span style={{fontSize:ds.font.size.xs,color:TX3,marginLeft:6}}>(planejado)</span>}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.views||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.reach||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.likes||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ color:TX2,fontVariantNumeric:"tabular-nums" }}>{Number(p.comments||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{ fontWeight:700,color:eng!=null?(eng>=3?GRN:eng>=1?AMB:TX3):TX3 }}>{fmtEng(eng)}</div>
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
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:14 }}>Nota Fiscal</div>
            {nfEntries.length===0&&<div style={{fontSize:12,color:TX3}}>Sem NF configurada</div>}
            {nfEntries.map((e,i) => {
              const nfFile = c.nfFiles?.[e.key];
              return (
                <div key={e.key} style={{ padding:"12px 0", borderBottom:i<nfEntries.length-1?`1px solid ${LN}`:"none" }}>
                  <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:nfFile||e.isEmitted?8:0 }}>
                    <div>
                      <div style={{ fontSize:12,fontWeight:600,color:TX }}>{e.label}</div>
                      {e.date&&<div style={{fontSize:ds.font.size.xs,color:TX2}}>{fmtDate(e.date)}</div>}
                    </div>
                    <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                      {e.amount>0&&<span style={{fontSize:12,fontWeight:700,color:TX}}>{fmtMoney(e.amount,c.currency)}</span>}
                      <div onClick={()=>toggleNF(c.id,e.key)} style={{ padding:"4px 10px",fontSize:ds.font.size.xs,fontWeight:700,cursor:"pointer",borderRadius:5,transition:TRANS,background:e.isEmitted?`${GRN}15`:"rgba(0,0,0,.04)",border:`1px solid ${e.isEmitted?GRN+"44":LN2}`,color:e.isEmitted?GRN:TX2 }}>
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
                        <div style={{ fontSize:ds.font.size.xs,color:TX3 }}>{new Date(nfFile.uploadedAt).toLocaleDateString("pt-BR")}</div>
                      </div>
                      <a href={nfFile.data} download={nfFile.name} style={{ padding:"3px 8px",fontSize:ds.font.size.xs,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:4,textDecoration:"none",flexShrink:0 }}>↓</a>
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
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Comissão Ranked (a pagar) (20%)</div>
              <CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/>
            </div>
            {!c.hasCommission&&<div style={{fontSize:12,color:TX3}}>Sem comissão neste contrato</div>}
            {c.hasCommission&&commEntries.length===0&&<div style={{fontSize:12,color:TX3}}>Sem parcelas definidas</div>}
            {c.hasCommission&&commEntries.map((e,i) => (
              <div key={e.key} style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:i<commEntries.length-1?`1px solid ${LN}`:"none" }}>
                <div>
                  <div style={{ fontSize:12,fontWeight:600,color:TX }}>{e.label}</div>
                  {e.date&&<div style={{fontSize:ds.font.size.xs,color:TX2}}>{fmtDate(e.date)}</div>}
                </div>
                <div style={{ display:"flex",alignItems:"center",gap:10 }}>
                  <span style={{ fontSize:13,fontWeight:700,color:RED }}>{fmtMoney(e.amount,c.currency)}</span>
                  <div onClick={()=>toggleCommPaid(c.id,e.key)} style={{ padding:"4px 12px",fontSize:ds.font.size.xs,fontWeight:700,cursor:"pointer",borderRadius:5,transition:TRANS,background:e.isPaid?`${GRN}15`:"rgba(0,0,0,.04)",border:`1px solid ${e.isPaid?GRN+"44":LN2}`,color:e.isPaid?GRN:TX2 }}>
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
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2 }}>Notas do Briefing</div>
              <DsButton variant="primary" size="sm"
                onClick={()=>openCopilot?.({contractId:c.id, actionId:"generate-briefing-structure"})}
                leftIcon={<DsIcon name="sparkles" size={13} color={ds.color.neutral[0]}/>}>
                Copiloto
              </DsButton>
            </div>
            <textarea value={briefingNote} onChange={e=>setBriefingNote(e.target.value)} onBlur={()=>saveNote(briefingNote)}
              rows={12} placeholder="Cole aqui o briefing da marca, ou use o Copiloto para criar automaticamente com os principais pontos, dos & don'ts e tom de voz…"
              style={{ width:"100%",padding:"12px",background:B2,border:`1px solid ${LN}`,borderRadius:8,color:TX,fontSize:13,fontFamily:"inherit",lineHeight:1.6,resize:"vertical",outline:"none" }}/>
            <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:6 }}>Auto-salvo ao sair do campo · Copiloto gera estrutura baseada no contrato</div>
          </div>
          <div style={{ ...G, padding:"18px 20px" }}>
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12 }}>Arquivo do Briefing</div>
            {briefingFile ? (
              <div style={{ display:"flex",alignItems:"center",gap:12,padding:"12px 14px",background:B2,borderRadius:8,border:`1px solid ${LN}` }}>
                <span style={{ fontSize:20 }}>📄</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:12,fontWeight:600,color:TX }}>{briefingFile.name}</div>
                  <div style={{ fontSize:ds.font.size.xs,color:TX2 }}>Enviado {new Date(briefingFile.uploadedAt).toLocaleDateString("pt-BR")}</div>
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
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",color:TX2,marginTop:4 }}>Score</div>
                </div>
                <div>
                  <div style={{ fontSize:14,fontWeight:700,color:TX,marginBottom:4 }}>{aiReport.performance?.label} · {c.company}</div>
                  <p style={{ fontSize:13,color:TX2,lineHeight:1.6 }}>{aiReport.summary}</p>
                </div>
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:16 }}>
                <div style={{ ...G, padding:"16px 18px" }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Entregas</div>
                  <p style={{ fontSize:12,color:TX,lineHeight:1.6 }}>{aiReport.deliveryStatus}</p>
                </div>
                <div style={{ ...G, padding:"16px 18px" }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Financeiro</div>
                  <p style={{ fontSize:12,color:TX,lineHeight:1.6 }}>{aiReport.financialStatus}</p>
                </div>
                {aiReport.engagementAnalysis&&<div style={{ ...G, padding:"16px 18px", gridColumn:"1/-1" }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10 }}>Engajamento</div>
                  <p style={{ fontSize:12,color:TX,lineHeight:1.6 }}>{aiReport.engagementAnalysis}</p>
                </div>}
              </div>
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
                {aiReport.highlights?.length>0&&<div style={{ ...G, padding:"16px 18px",borderLeft:`3px solid ${GRN}` }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:GRN,marginBottom:10 }}>✓ Pontos positivos</div>
                  {aiReport.highlights.map((h,i)=><div key={i} style={{fontSize:12,color:TX,padding:"4px 0",borderBottom:i<aiReport.highlights.length-1?`1px solid ${LN}`:"none"}}>{h}</div>)}
                </div>}
                {aiReport.risks?.length>0&&<div style={{ ...G, padding:"16px 18px",borderLeft:`3px solid ${RED}` }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:RED,marginBottom:10 }}>⚠ Riscos</div>
                  {aiReport.risks.map((r,i)=><div key={i} style={{fontSize:12,color:TX,padding:"4px 0",borderBottom:i<aiReport.risks.length-1?`1px solid ${LN}`:"none"}}>{r}</div>)}
                </div>}
                {aiReport.nextSteps?.length>0&&<div style={{ ...G, padding:"16px 18px",borderLeft:`3px solid ${BLU}` }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:BLU,marginBottom:10 }}>→ Próximos passos</div>
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

// ─── Marcas ───────────────────────────────────────────────

function BrandInitial({ brand, size = 44 }) {
  const letter = (brand.name || "?").charAt(0).toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 4, flexShrink: 0,
      background: brand.primaryColor || "#374151",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.42, fontWeight: 800, color: "#fff", letterSpacing: "-.01em",
    }}>
      {letter}
    </div>
  );
}

function brandLTV(brand, contracts, posts, deliverables) {
  const bContracts = contracts.filter(c => c.brandId === brand.id);
  return bContracts.reduce((s, c) => s + contractTotal(c), 0);
}

function brandAvgEng(brand, contracts, posts, deliverables) {
  const ids = new Set(contracts.filter(c => c.brandId === brand.id).map(c => c.id));
  const items = [
    ...posts.filter(p => ids.has(p.contractId) && p.isPosted),
    ...deliverables.filter(d => ids.has(d.contractId) && d.stage === "done"),
  ];
  // Usa sumNetworkMetrics para cobrir posts (campos flat) e entregáveis
  // (campos em networkMetrics). Guard reach < 10 evita % absurdos de
  // itens com reach=1 inserido por engano.
  const engs = items
    .map(item => {
      const reach    = sumNetworkMetrics(item, "reach");
      const likes    = sumNetworkMetrics(item, "likes");
      const comments = sumNetworkMetrics(item, "comments");
      if (!reach || reach < 10) return null;
      return (likes + comments) / reach * 100;
    })
    .filter(e => e !== null);
  return engs.length ? engs.reduce((s, v) => s + v, 0) / engs.length : null;
}

function Marcas({ brands, contracts, posts, deliverables, saveBrands, navigateTo, setSelectedBrand, role }) {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("all");
  const [sort, setSort] = useState("ltv"); // ltv | alpha | recent
  const [showNewModal, setShowNewModal] = useState(false);
  const toast = useToast();

  const filtered = useMemo(() => {
    let list = brands.filter(b => !b.archived);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(b => b.name.toLowerCase().includes(q));
    }
    if (catFilter !== "all") list = list.filter(b => b.category === catFilter);
    if (sort === "ltv")    list = [...list].sort((a, b) => brandLTV(b, contracts, posts, deliverables) - brandLTV(a, contracts, posts, deliverables));
    if (sort === "alpha")  list = [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
    if (sort === "recent") list = [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return list;
  }, [brands, contracts, posts, deliverables, search, catFilter, sort]);

  const handleCreate = async ({ name, category }) => {
    const now = new Date().toISOString();
    const brand = {
      id: uid(), name, slug: slugify(name), category,
      primaryColor: CONTRACT_COLORS[brands.length % CONTRACT_COLORS.length],
      contact: {}, exclusivityWindowDays: 7,
      recurringBriefing: "", notes: "", createdAt: now, updatedAt: now,
    };
    await saveBrands([...brands, brand]);
    toast?.(`Marca "${name}" criada`, "success");
    setShowNewModal(false);
  };

  return (
    <div style={{ padding: isMobile ? "12px 12px 88px" : "24px" }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:ds.space[3], marginBottom:ds.space[5], flexWrap:"wrap" }}>
        <div style={{ flex:1 }}>
          <h2 style={{ fontSize:ds.font.size['2xl'], fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], marginBottom:ds.space[1], letterSpacing:"-0.02em" }}>Marcas</h2>
          <div style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[500] }}>{brands.filter(b=>!b.archived).length} marcas cadastradas</div>
        </div>
        <DsButton variant="primary" size="sm" onClick={()=>setShowNewModal(true)}
          leftIcon={<DsIcon name="plus" size={13} color={ds.color.neutral[0]}/>}>
          Nova marca
        </DsButton>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:ds.space[2], marginBottom:ds.space[4], flexWrap:"wrap" }}>
        <div style={{ position:"relative", flex:1, minWidth:180 }}>
          <DsIcon name="search" size={13} color={ds.color.neutral[400]}
            style={{ position:"absolute", left:10, top:"50%", transform:"translateY(-50%)" }}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar marca…"
            style={{ width:"100%", padding:`${ds.space[2]} ${ds.space[3]} ${ds.space[2]} 32px`,
              background:ds.color.neutral[50], border:ds.border.thin, borderRadius:ds.radius.md,
              fontSize:ds.font.size.sm, color:ds.color.neutral[900], fontFamily:"inherit", outline:"none", boxSizing:"border-box" }}/>
        </div>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)}
          style={{ padding:`${ds.space[2]} ${ds.space[3]}`, background:ds.color.neutral[50], border:ds.border.thin, borderRadius:ds.radius.md, fontSize:ds.font.size.sm, color:ds.color.neutral[900], fontFamily:"inherit", outline:"none" }}>
          <option value="all">Todas as categorias</option>
          {Object.entries(BRAND_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </select>
        <select value={sort} onChange={e=>setSort(e.target.value)}
          style={{ padding:`${ds.space[2]} ${ds.space[3]}`, background:ds.color.neutral[50], border:ds.border.thin, borderRadius:ds.radius.md, fontSize:ds.font.size.sm, color:ds.color.neutral[900], fontFamily:"inherit", outline:"none" }}>
          <option value="ltv">Ordenar: LTV</option>
          <option value="alpha">Ordenar: A-Z</option>
          <option value="recent">Ordenar: Recente</option>
        </select>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <div style={{ textAlign:"center", padding:`${ds.space[16]} 0`, color:ds.color.neutral[400] }}>
          <DsIcon name="building" size={40} color={ds.color.neutral[300]}/>
          <div style={{ fontSize:ds.font.size.md, fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], marginTop:ds.space[3], marginBottom:ds.space[1] }}>Nenhuma marca encontrada</div>
          <div style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[500] }}>Crie uma nova marca ou ajuste os filtros.</div>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:isMobile?"1fr":"repeat(auto-fill,minmax(260px,1fr))", gap:14 }}>
          {filtered.map(brand => {
            const bContracts = contracts.filter(c=>c.brandId===brand.id);
            const active = bContracts.filter(c=>!c.archived).length;
            const ltv = brandLTV(brand, contracts, posts, deliverables);
            const eng = brandAvgEng(brand, contracts, posts, deliverables);
            const lastC = bContracts.map(c=>c.contractDeadline).filter(Boolean).sort().reverse()[0];
            const catLabel = BRAND_CATEGORIES[brand.category] || brand.category;
            return (
              <div key={brand.id}
                onClick={()=>{ setSelectedBrand(brand.id); navigateTo("marca-detalhe"); }}
                style={{ ...G, padding:"18px 20px", cursor:"pointer", transition:TRANS, borderLeft:`4px solid ${brand.primaryColor||"#374151"}` }}
                onMouseEnter={e=>{e.currentTarget.style.transform="translateY(-2px)";e.currentTarget.style.boxShadow=`0 6px 24px rgba(0,0,0,0.1)`;}}
                onMouseLeave={e=>{e.currentTarget.style.transform="none";e.currentTarget.style.boxShadow=G.boxShadow;}}>
                <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:12 }}>
                  <BrandInitial brand={brand} size={40}/>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:14, color:TX, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{brand.name}</div>
                    <span style={{ fontSize:ds.font.size.xs, fontWeight:700, padding:"1px 7px", borderRadius:99, background:`${brand.primaryColor||"#374151"}18`, color:brand.primaryColor||TX2 }}>{catLabel}</span>
                  </div>
                </div>
                <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
                  <div style={{ background:B2, borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontSize:ds.font.size.xs, color:TX3, marginBottom:2 }}>LTV</div>
                    <div style={{ fontSize:13, fontWeight:800, color:TX }}>{ltv>0?fmtMoney(ltv):"—"}</div>
                  </div>
                  <div style={{ background:B2, borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontSize:ds.font.size.xs, color:TX3, marginBottom:2 }}>Contratos</div>
                    <div style={{ fontSize:13, fontWeight:800, color:TX }}>{active} ativos</div>
                  </div>
                  <div style={{ background:B2, borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontSize:ds.font.size.xs, color:TX3, marginBottom:2 }}>Engajamento</div>
                    <div style={{ fontSize:13, fontWeight:800, color:eng!=null?(eng>=3?GRN:eng>=1?AMB:TX2):TX3 }}>{fmtEng(eng)}</div>
                  </div>
                  <div style={{ background:B2, borderRadius:8, padding:"8px 10px" }}>
                    <div style={{ fontSize:ds.font.size.xs, color:TX3, marginBottom:2 }}>Último prazo</div>
                    <div style={{ fontSize:12, fontWeight:600, color:TX }}>{lastC?fmtDate(lastC):"—"}</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* New brand modal */}
      {showNewModal && (
        <NewBrandModal onClose={()=>setShowNewModal(false)} onSave={handleCreate}/>
      )}
    </div>
  );
}

function NewBrandModal({ onClose, onSave }) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("OUTROS");
  const disabled = !name.trim();
  return (
    <Modal title="Nova Marca" onClose={onClose} width={420}
      footer={<>
        <Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn>
        <Btn onClick={()=>onSave({name:name.trim(),category})} variant="primary" size="sm" disabled={disabled}>Criar marca</Btn>
      </>}>
      <Field label="Nome da marca" full>
        <Input value={name} onChange={e=>setName(e.target.value)} placeholder="ex: Netshoes"/>
      </Field>
      <div style={{ height:12 }}/>
      <Field label="Categoria" full>
        <Select value={category} onChange={e=>setCategory(e.target.value)}>
          {Object.entries(BRAND_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
        </Select>
      </Field>
    </Modal>
  );
}

function MarcaDetalhe({ brandId, brands, contracts, posts, deliverables, saveBrands, onBack, navigateTo, setSelectedBrand, onNewContract }) {
  const brand = brands.find(b => b.id === brandId);
  const isMobile = useIsMobile();
  const toast = useToast();
  const [tab, setTab] = useState("contratos");
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);

  if (!brand) return (
    <div style={{ padding:40, textAlign:"center", color:TX2 }}>
      <div style={{ marginBottom:8 }}>Marca não encontrada.</div>
      <Btn onClick={onBack} variant="ghost" size="sm">← Voltar</Btn>
    </div>
  );

  const bContracts = contracts.filter(c => c.brandId === brand.id);
  const activeC    = bContracts.filter(c => !c.archived);
  const bPosts     = posts.filter(p => bContracts.some(c => c.id === p.contractId));
  const bDels      = deliverables.filter(d => bContracts.some(c => c.id === d.contractId));
  const ltv        = bContracts.reduce((s,c)=>s+contractTotal(c),0);
  const doneDels   = bDels.filter(d=>d.stage==="done"||d.stage==="postagem").length + bPosts.filter(p=>p.isPosted).length;
  const eng        = brandAvgEng(brand, contracts, posts, deliverables);
  const catLabel   = BRAND_CATEGORIES[brand.category] || brand.category;

  const saveField = async (field, val) => {
    const updated = brands.map(b => b.id === brand.id ? { ...b, [field]: val, updatedAt: new Date().toISOString() } : b);
    await saveBrands(updated);
    toast?.("Salvo", "success");
  };

  const TABS = [{ id:"contratos", label:"Contratos" }, { id:"performance", label:"Performance" }, { id:"briefing", label:"Briefing Recorrente" }];

  return (
    <div style={{ padding: isMobile ? "12px 12px 88px" : "24px" }}>
      {/* Back */}
      <button onClick={onBack}
        style={{ background:"none", border:`1px solid ${LN}`, borderRadius:6, padding:"6px 12px", cursor:"pointer", fontSize:11, color:TX2, marginBottom:20, fontFamily:"inherit" }}>
        ← Marcas
      </button>

      {/* Brand header */}
      <div style={{ ...G, padding:"20px 24px", marginBottom:20, borderLeft:`4px solid ${brand.primaryColor||"#374151"}` }}>
        <div style={{ display:"flex", alignItems:"flex-start", gap:16, flexWrap:"wrap" }}>
          <BrandInitial brand={brand} size={56}/>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:6, flexWrap:"wrap" }}>
              <h1 style={{ fontSize:22, fontWeight:800, color:TX, letterSpacing:"-.02em" }}>{brand.name}</h1>
              <span style={{ fontSize:ds.font.size.xs, fontWeight:700, padding:"2px 9px", borderRadius:99, background:`${brand.primaryColor||"#374151"}18`, color:brand.primaryColor||TX2 }}>{catLabel}</span>
            </div>
            {/* Contact chips */}
            {brand.contact?.email && <div style={{ fontSize:11, color:TX2, marginBottom:3 }}>📧 {brand.contact.email}</div>}
            {brand.contact?.phone && <div style={{ fontSize:11, color:TX2 }}>📞 {brand.contact.phone}</div>}
          </div>
          <DsButton variant="secondary" size="sm" onClick={() => { setEditForm({ ...brand }); setEditing(true); }}
            leftIcon={<DsIcon name="edit" size={13} color={ds.color.neutral[600]}/>}>
            Editar
          </DsButton>
        </div>

        {/* 4 KPIs */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginTop:20 }}>
          {[
            { label:"LTV total",          value: ltv>0?fmtMoney(ltv):"—",               accent:ltv>0?GRN:TX2 },
            { label:"Contratos ativos",   value: `${activeC.length} / ${bContracts.length}`, accent:activeC.length>0?BLU:TX2 },
            { label:"Posts entregues",    value: doneDels,                                accent:doneDels>0?GRN:TX2 },
            { label:"Eng. médio",         value: fmtEng(eng),                            accent:eng!=null?(eng>=3?GRN:eng>=1?AMB:TX2):TX2 },
          ].map(kpi => (
            <div key={kpi.label} style={{ background:B2, borderRadius:10, padding:"12px 14px" }}>
              <div style={{ fontSize:ds.font.size.xs, color:TX3, marginBottom:4, textTransform:"uppercase", letterSpacing:".08em", fontWeight:700 }}>{kpi.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:kpi.accent }}>{kpi.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:"flex", borderBottom:`1px solid ${LN}`, marginBottom:20 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"10px 18px", fontSize:12, fontWeight:tab===t.id?700:400, color:tab===t.id?TX:TX2, background:"none", border:"none", borderBottom:`2px solid ${tab===t.id?ds.color.neutral[900]:"transparent"}`, cursor:"pointer", fontFamily:"inherit", transition:TRANS }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Contratos */}
      {tab === "contratos" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
          {onNewContract && (
            <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:4 }}>
              <Btn variant="primary" size="sm" onClick={()=>onNewContract(brandId)}>+ Novo contrato</Btn>
            </div>
          )}
          {bContracts.length === 0 ? (
            <div style={{ textAlign:"center", padding:"32px 0", color:TX3 }}>
              Nenhum contrato vinculado.
              {onNewContract && <div style={{ marginTop:8 }}>
                <Btn variant="ghost" size="sm" onClick={()=>onNewContract(brandId)}>Criar primeiro contrato →</Btn>
              </div>}
            </div>
          ) : bContracts.map(c => {
            const total = contractTotal(c);
            const dl    = daysLeft(c.contractDeadline);
            return (
              <div key={c.id}
                onClick={()=>navigateTo&&navigateTo("contratos")}
                style={{ ...G, padding:"14px 16px", cursor:"pointer", display:"flex", alignItems:"center", gap:12, borderLeft:`3px solid ${c.color||brand.primaryColor}` }}
                onMouseEnter={e=>e.currentTarget.style.background=B2}
                onMouseLeave={e=>e.currentTarget.style.background=B1}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13, color:c.archived?TX2:TX, marginBottom:3 }}>
                    {c.company}{c.archived&&<span style={{ fontSize:ds.font.size.xs, color:TX3, marginLeft:6 }}>Arquivado</span>}
                  </div>
                  <div style={{ fontSize:11, color:TX2 }}>
                    {total>0?fmtMoney(total,c.currency):"Valor TBD"}
                    {c.contractDeadline&&<span style={{ marginLeft:10, color:dlColor(dl) }}>prazo {fmtDate(c.contractDeadline)}</span>}
                  </div>
                </div>
                <span style={{ fontSize:12, color:TX3 }}>→</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab: Performance */}
      {tab === "performance" && (
        <div>
          {bPosts.length === 0 && bDels.length === 0 ? (
            <div style={{ textAlign:"center", padding:"40px 0", color:TX3 }}>
              Nenhum post ou entregável registrado para esta marca.
              {/* TODO: quando o módulo de métricas existir, ligar aqui */}
            </div>
          ) : (
            <div>
              {/* Aggregate metrics */}
              {(() => {
                const items = [...bPosts.filter(p=>p.isPosted), ...bDels.filter(d=>d.stage==="done")];
                const totalViews = items.reduce((s,i)=>s+(Number(i.views)||0),0);
                const totalReach = items.reduce((s,i)=>s+(Number(i.reach)||0),0);
                const totalLikes = items.reduce((s,i)=>s+(Number(i.likes)||0),0);
                const engs = items.map(calcEngagement).filter(e=>e!==null);
                const avgE = engs.length ? engs.reduce((s,v)=>s+v,0)/engs.length : null;
                return (
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:10, marginBottom:20 }}>
                    {[
                      { label:"Views", value: totalViews>0?totalViews.toLocaleString("pt-BR"):"—" },
                      { label:"Alcance", value: totalReach>0?totalReach.toLocaleString("pt-BR"):"—" },
                      { label:"Curtidas", value: totalLikes>0?totalLikes.toLocaleString("pt-BR"):"—" },
                      { label:"Eng. médio", value: fmtEng(avgE) },
                    ].map(m=>(
                      <div key={m.label} style={{ background:B2, borderRadius:10, padding:"12px 14px" }}>
                        <div style={{ fontSize:ds.font.size.xs, color:TX3, marginBottom:4, textTransform:"uppercase", letterSpacing:".08em", fontWeight:700 }}>{m.label}</div>
                        <div style={{ fontSize:18, fontWeight:800, color:TX }}>{m.value}</div>
                      </div>
                    ))}
                  </div>
                );
              })()}
              <div style={{ fontSize:11, color:TX3 }}>
                {/* TODO: gráfico de evolução de engajamento por contrato quando módulo de métricas existir */}
                {bPosts.filter(p=>p.isPosted).length} posts · {bDels.filter(d=>d.stage==="done").length} entregáveis concluídos
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Briefing Recorrente */}
      {tab === "briefing" && (
        <div>
          <div style={{ fontSize:12, color:TX2, marginBottom:12, lineHeight:1.6 }}>
            Briefing permanente da marca — regras que se repetem em todos os contratos: tom de voz, hashtags obrigatórias, do's & don'ts.
          </div>
          <textarea
            value={brand.recurringBriefing || ""}
            onChange={e => {
              const updated = brands.map(b => b.id===brand.id ? {...b, recurringBriefing:e.target.value} : b);
              saveBrands(updated);
            }}
            placeholder="Ex: sempre usar #Copa2026, não mencionar concorrentes, tom animado e informal…"
            rows={10}
            style={{ width:"100%", padding:"14px", background:B2, border:`1px solid ${LN}`, borderRadius:10, fontSize:13, color:TX, fontFamily:"inherit", outline:"none", resize:"vertical", lineHeight:1.7 }}
          />
          <div style={{ fontSize:11, color:TX3, marginTop:8 }}>Salvo automaticamente ao editar.</div>
        </div>
      )}

      {/* Edit brand modal */}
      {editing && editForm && (
        <Modal title={`Editar: ${brand.name}`} onClose={()=>setEditing(false)} width={500}
          footer={<>
            <Btn onClick={()=>setEditing(false)} variant="ghost" size="sm">Cancelar</Btn>
            <Btn onClick={async()=>{
              const updated = brands.map(b=>b.id===brand.id?{...editForm,updatedAt:new Date().toISOString()}:b);
              await saveBrands(updated);
              setEditing(false);
              toast?.("Marca atualizada","success");
            }} variant="primary" size="sm">Salvar</Btn>
          </>}>
          <Field label="Nome" full><Input value={editForm.name} onChange={e=>setEditForm(f=>({...f,name:e.target.value}))}/></Field>
          <div style={{height:10}}/>
          <Field label="Categoria" full>
            <Select value={editForm.category} onChange={e=>setEditForm(f=>({...f,category:e.target.value}))}>
              {Object.entries(BRAND_CATEGORIES).map(([k,v])=><option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <SRule>Cor principal</SRule>
          <input type="color" value={editForm.primaryColor||"#374151"} onChange={e=>setEditForm(f=>({...f,primaryColor:e.target.value}))}
            style={{ width:"100%", height:40, padding:2, background:B2, border:`1px solid ${LN}`, borderRadius:8, cursor:"pointer" }}/>
          <SRule>Contato</SRule>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
            <Field label="Nome"><Input value={editForm.contact?.name||""} onChange={e=>setEditForm(f=>({...f,contact:{...f.contact,name:e.target.value}}))}/></Field>
            <Field label="Email"><Input type="email" value={editForm.contact?.email||""} onChange={e=>setEditForm(f=>({...f,contact:{...f.contact,email:e.target.value}}))}/></Field>
            <Field label="Telefone"><Input value={editForm.contact?.phone||""} onChange={e=>setEditForm(f=>({...f,contact:{...f.contact,phone:e.target.value}}))}/></Field>
            <Field label="Cargo"><Input value={editForm.contact?.role||""} onChange={e=>setEditForm(f=>({...f,contact:{...f.contact,role:e.target.value}}))}/></Field>
          </div>
          <SRule>Exclusividade</SRule>
          <Field label="Janela de exclusividade (dias)">
            <div style={{ display:"flex", alignItems:"center", gap:10 }}>
              <input type="range" min="0" max="30" value={editForm.exclusivityWindowDays||7}
                onChange={e=>setEditForm(f=>({...f,exclusivityWindowDays:Number(e.target.value)}))}
                style={{ flex:1 }}/>
              <span style={{ fontSize:13, fontWeight:700, color:TX, width:24, textAlign:"right" }}>
                {editForm.exclusivityWindowDays||7}
              </span>
            </div>
          </Field>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", background:B2, borderRadius:8, marginTop:8 }}>
            <div>
              <div style={{ fontSize:12, fontWeight:600, color:TX }}>Bloquear concorrentes na janela</div>
              <div style={{ fontSize:11, color:TX2 }}>Eleva de WARN para BLOCK conflitos de mesma categoria</div>
            </div>
            <div onClick={()=>setEditForm(f=>({...f,blockConflicts:!f.blockConflicts}))}
              style={{ width:44, height:24, borderRadius:99, background:editForm.blockConflicts?RED:LN, cursor:"pointer", position:"relative", transition:"background .2s", flexShrink:0 }}>
              <div style={{ width:20, height:20, borderRadius:"50%", background:"#fff", position:"absolute", top:2, left:editForm.blockConflicts?22:2, transition:"left .2s", boxShadow:"0 1px 3px rgba(0,0,0,.15)" }}/>
            </div>
          </div>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:4 }}>Usado para detectar conflitos de marca concorrente no agendamento.</div>
        </Modal>
      )}
    </div>
  );
}

// ─── Contratos list ────────────────────────────────────────
function Contratos({ contracts, posts, deliverables=[], saveC, saveP, saveDeliverables, setModal, toggleComm, toggleCommPaid, toggleNF, saveNote, rates, role, brands=[], navigateTo, setSelectedBrand, openCopilot }) {
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
      brands={brands} navigateTo={navigateTo} setSelectedBrand={setSelectedBrand}
      openCopilot={(ctx)=>openCopilot?.({...ctx,contractId:selected.id})}
    />
  );

  // ── Mobile card view ──
  if (isMobile) return (
    <div style={{ padding:"12px 12px 88px" }}>
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
                      {c.currency!=="BRL"&&<span style={{ fontSize:ds.font.size.xs, padding:"2px 7px", borderRadius:99, background:`${BLU}14`, color:BLU, fontWeight:700 }}>{c.currency}</span>}
                      {c.paymentType==="monthly"&&<span style={{ fontSize:ds.font.size.xs, padding:"2px 7px", borderRadius:99, background:`${TX3}12`, color:TX3, fontWeight:700 }}>Mensal</span>}
                      {c.hasTravel&&<span style={{ fontSize:11 }}>✈️</span>}
                      {c.archived&&<span style={{ fontSize:ds.font.size.xs, padding:"2px 7px", borderRadius:99, background:`${TX3}12`, color:TX3, fontWeight:700 }}>Arquivado</span>}
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
            iconName="fileText"
            title={showArchived?"Nenhum contrato arquivado":"Nenhum contrato ativo"}
            sub={showArchived?"Arquive contratos concluídos pelo menu de ações.":"Adicione o primeiro contrato pelo botão + Novo na barra superior."}
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
            <div key={i} style={{ padding:"0 12px", fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX3 }}>{h}</div>
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
              <div style={{ padding:"0 12px" }}>
                {seeValues && total>0 ? (
                  <div>
                    <div style={{ fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], fontVariantNumeric:"tabular-nums" }}>{fmtMoney(total,c.currency)}</div>
                    {c.currency!=="BRL" && rates?.[c.currency]>0 && (
                      <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[500], marginTop:1, fontVariantNumeric:"tabular-nums" }}>
                        ≈ {fmtMoney(toBRL(total,c.currency,rates))} · @ {formatRate(rates[c.currency])}
                      </div>
                    )}
                  </div>
                ) : "—"}
              </div>
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
                <div style={{ fontSize:ds.font.size.xs, color:TX3 }}>{don}/{tot}</div>
              </div>
              <div style={{ padding:"0 12px", color:TX2 }}>{cp}/{c.numPosts}</div>
              <div style={{ padding:"0 12px", color:TX2 }}>{cs}/{c.numStories}</div>
              <div style={{ padding:"0 12px", color:TX2 }}>{cl}/{c.numCommunityLinks}</div>
              <div style={{ padding:`0 ${ds.space[2]}`, display:"flex", gap:2 }} onClick={e=>e.stopPropagation()}>
                {!c.archived && canEdit && (
                  <DsIconButton size="sm" variant="ghost" ariaLabel="Editar contrato"
                    icon={<DsIcon name="edit" size={13} color={ds.color.neutral[500]}/>}
                    onClick={()=>setModal({type:"contract",data:c})}/>
                )}
                {!c.archived && canEdit && (
                  <DsIconButton size="sm" variant="ghost" ariaLabel="Arquivar contrato"
                    icon={<DsIcon name="save" size={13} color={ds.color.neutral[500]}/>}
                    onClick={()=>{if(window.confirm(`Arquivar "${c.company}"?`))archive(c.id);}}/>
                )}
                {c.archived && (
                  <DsIconButton size="sm" variant="ghost" ariaLabel="Desarquivar"
                    icon={<DsIcon name="refresh" size={13} color={ds.color.success[500]}/>}
                    onClick={()=>unarchive(c.id)}/>
                )}
                {canEdit && (
                  <DsIconButton size="sm" variant="ghost" ariaLabel="Excluir contrato"
                    icon={<DsIcon name="x" size={13} color={ds.color.danger[500]}/>}
                    onClick={()=>del(c.id)}/>
                )}
              </div>
            </div>
          );
        })}
        {displayContracts.length===0&&(
          <EmptyState
            iconName="fileText"
            title={showArchived?"Nenhum contrato arquivado":"Nenhum contrato ativo"}
            sub={showArchived?"Arquive contratos concluídos pela tabela.":"Adicione o primeiro contrato pelo botão + Contrato acima."}
          />
        )}
      </div>
      </div>  {/* /table-scroll */}
    </div>
  );
}
function CalendarView({ contracts, deliverables=[], saveDeliverables, onEditDeliverable, onNewDeliverable, calEvents={}, calMonth, setCal, calFilter, setCalF, brands=[] }) {
  const isMobile = useIsMobile();
  const toast    = useToast();
  const { y, m } = calMonth;
  const today    = startOfToday();
  const todayStr = today.toISOString().substr(0,10);
  const [dragOver, setDragOver] = useState(null);
  const [hoveredDate, setHoveredDate] = useState(null);

  // Pre-compute conflict severity per date for visual marking
  const conflictDateMap = useMemo(
    () => buildConflictDateMap(deliverables, brands, contracts),
    [deliverables, brands, contracts]
  );

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

    const dragged   = deliverables.find(d => d.id === id);
    const contract  = contracts.find(c => c.id === dragged?.contractId);
    const others    = deliverables.filter(d => d.id !== id);

    if (dragged && contract && brands.length) {
      const found = detectConflicts(
        { date: ds, brandId: contract.brandId, contractId: contract.id },
        others, brands, contracts
      );

      // BLOCK → revert (don't save)
      if (found.some(c => c.severity === "BLOCK")) {
        const msg = found.find(c => c.severity === "BLOCK")?.message || "Conflito bloqueante detectado.";
        toast?.(`⛔ ${msg}`, "error");
        return; // don't save
      }

      // WARN → save but toast warning
      if (found.some(c => c.severity === "WARN")) {
        const msg = found.find(c => c.severity === "WARN")?.message || "Aviso de conflito.";
        toast?.(`⚠️ ${msg}`, "warning");
        // fall through — save anyway (drag is harder to undo mid-flight)
      }
    }

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
          <span style={{ fontSize:ds.font.size.xs, flexShrink:0, opacity:.7 }}>📄</span>
          <span style={{ fontSize:ds.font.size.xs, fontWeight:500, color:TX, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", lineHeight:1.3 }}>
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
        <div onClick={()=>setCalF("all")} style={{padding:"4px 12px",fontSize:ds.font.size.xs,fontWeight:700,cursor:"pointer",borderRadius:99,flexShrink:0,background:calFilter==="all"?TX:B2,color:calFilter==="all"?"white":TX2,border:`1px solid ${calFilter==="all"?TX:LN}`,transition:TRANS}}>
          Todos
        </div>
        {contracts.map(c=>(
          <div key={c.id} onClick={()=>setCalF(calFilter===c.id?"all":c.id)}
            style={{padding:"4px 12px",fontSize:ds.font.size.xs,fontWeight:600,cursor:"pointer",borderRadius:99,flexShrink:0,display:"flex",alignItems:"center",gap:5,
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
            <div key={i} style={{padding:"10px 0",textAlign:"center",fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3}}>{d}</div>
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
            const conflictSev = conflictDateMap[ds]; // 'BLOCK' | 'WARN' | 'INFO' | undefined
            const conflictBorderColor = conflictSev === "BLOCK" ? RED : conflictSev === "WARN" ? AMB : conflictSev === "INFO" ? BLU : null;

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
                  border: isDragTarget ? `1px solid ${RED}40`
                        : conflictBorderColor ? `1.5px dashed ${conflictBorderColor}50`
                        : "none",
                  title: conflictSev ? `Conflito ${conflictSev} detectado nesta data` : undefined,
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
                {isMobile && travels.length>0 && <div style={{textAlign:"center",fontSize:ds.font.size.xs,marginTop:2}}>✈️</div>}

                {/* Contract events (payment, deadline) — small badges (desktop only) */}
                {!isMobile && cEvents.slice(0,2).map((ev,ei)=>(
                  <div key={ei} style={{fontSize:8,fontWeight:700,padding:"1px 5px",marginBottom:2,borderRadius:3,background:`${ev.color}14`,color:ev.color,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",textTransform:"uppercase",letterSpacing:".03em"}}>
                    {ev.label}
                  </div>
                ))}

                {!isMobile && dayDels.length>3 && (
                  <div style={{fontSize:ds.font.size.xs,color:TX3,fontWeight:600,marginTop:2}}>+{dayDels.length-3} mais</div>
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
            <div key={k} style={{display:"flex",alignItems:"center",gap:5,fontSize:ds.font.size.xs,color:TX2}}>
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
function ContractModal({ modal, setModal, contracts, saveC, brands=[] }) {
  const isEdit=!!modal.data;
  const [f,setF]=useState(modal.data||{
    company:"",cnpj:"",contractDeadline:"",contractValue:"",currency:"BRL",
    monthlyValue:"",contractStart:"",paymentType:"single",paymentDeadline:"",
    installments:[{value:"",date:""},{value:"",date:""}],
    parc1Value:"",parc1Deadline:"",parc2Value:"",parc2Deadline:"",
    hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,
    numPosts:0,numStories:0,numCommunityLinks:0,numReposts:0,
    exclusivityOverride:"DEFAULT",
    brandId: modal.prefillBrandId || "",
    color:CONTRACT_COLORS[contracts.length%CONTRACT_COLORS.length],notes:""
  });
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const setInst=(i,field,val)=>setF(x=>{const inst=[...(x.installments||[])];inst[i]={...inst[i],[field]:val};return{...x,installments:inst};});
  const addInst=()=>setF(x=>({...x,installments:[...(x.installments||[]),{value:"",date:""}]}));
  const rmInst=i=>setF(x=>({...x,installments:(x.installments||[]).filter((_,j)=>j!==i)}));
  const months=f.paymentType==="monthly"?monthsBetween(f.contractStart,f.contractDeadline):null;
  const liveTotal=f.paymentType==="monthly"?(months?(Number(f.monthlyValue)||0)*months:0):f.paymentType==="split"?(f.installments||[]).reduce((s,i)=>s+(Number(i.value)||0),0):Number(f.contractValue)||0;
  const ORDINALS=["1ª","2ª","3ª","4ª","5ª","6ª"];

  // ── Etapa 4: live validations (non-blocking warnings) ──
  const valWarnings = useMemo(() => {
    const w = [];
    if (!f.company?.trim()) w.push({ field:"company", msg:"Nome é obrigatório." });
    if (f.paymentType==="monthly") {
      if (Number(f.monthlyValue) < 0) w.push({ field:"monthlyValue", msg:"Valor mensal não pode ser negativo." });
      if (f.contractStart && f.contractDeadline && f.contractStart > f.contractDeadline)
        w.push({ field:"dates", msg:"Data de início deve ser anterior ao término." });
      if (!f.contractStart || !f.contractDeadline)
        w.push({ field:"dates", msg:"Contrato mensal precisa de datas de início e fim para calcular o valor total.", soft:true });
    }
    if (f.paymentType==="single" && Number(f.contractValue) < 0)
      w.push({ field:"contractValue", msg:"Valor não pode ser negativo." });
    if (f.paymentType==="split") {
      const instSum = (f.installments||[]).reduce((s,i)=>s+(Number(i.value)||0),0);
      const declared = Number(f.contractValue)||0;
      if (declared > 0 && Math.abs(instSum - declared) > 1)
        w.push({ field:"split", msg:`Soma das parcelas (${fmtMoney(instSum)}) difere do valor declarado (${fmtMoney(declared)}).`, soft:true });
    }
    return w;
  }, [f]);
  const hardErrors  = valWarnings.filter(w=>!w.soft);
  const softWarnings = valWarnings.filter(w=>w.soft);

  const handleSave=async()=>{
    if(hardErrors.length>0) return; // blocked by hard errors shown inline
    const entry={...f,id:f.id||uid(),contractValue:f.paymentType==="monthly"?0:Number(f.contractValue)||0,monthlyValue:Number(f.monthlyValue)||0,
      numPosts:Number(f.numPosts)||0,numStories:Number(f.numStories)||0,numCommunityLinks:Number(f.numCommunityLinks)||0,numReposts:Number(f.numReposts)||0,
      installments:f.paymentType==="split"?(f.installments||[]).map(i=>({value:Number(i.value)||0,date:i.date||""})):[],
      parc1Value:0,parc2Value:0,parc1Deadline:"",parc2Deadline:"",
      commPaid:f.commPaid||{},nfEmitted:f.nfEmitted||{},paymentDaysAfterNF:Number(f.paymentDaysAfterNF)||0};
    if(isEdit) {
      await saveC(contracts.map(c=>c.id===entry.id?entry:c));
    } else {
      await saveC([...contracts,entry]);
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

  // Inline warning banner component
  const WarnBanner = ({ field }) => {
    const hard = hardErrors.find(w=>w.field===field);
    const soft = softWarnings.find(w=>w.field===field);
    const item = hard || soft;
    if (!item) return null;
    return (
      <div style={{ fontSize:11, color:hard?RED:AMB, background:hard?`${RED}08`:`${AMB}08`, border:`1px solid ${hard?RED:AMB}30`, borderRadius:6, padding:"5px 10px", marginTop:4 }}>
        {hard?"⛔":"⚠"} {item.msg}
      </div>
    );
  };

  return (
    <Modal title={isEdit?"Editar Contrato":"Novo Contrato"} onClose={()=>setModal(null)}
      footer={<>
        <Btn onClick={()=>setModal(null)} variant="ghost" size="sm">Cancelar</Btn>
        <Btn onClick={handleSave} variant="primary" size="sm" disabled={hardErrors.length>0}>
          {isEdit?"Salvar":"Criar"}
        </Btn>
      </>}>
      <SRule>Empresa</SRule>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <Field label="Marca vinculada" full>
          <Select value={f.brandId||""} onChange={e=>set("brandId",e.target.value)}>
            <option value="">— Sem vínculo com marca —</option>
            {brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:3 }}>
            Vincula este contrato a uma marca para LTV, conflitos de agenda e métricas consolidadas.
          </div>
        </Field>
        <Field label="Nome" full>
          <Input value={f.company} onChange={e=>set("company",e.target.value)} placeholder="ex: Netshoes"/>
          <WarnBanner field="company"/>
        </Field>
        <Field label="CNPJ"><Input value={f.cnpj} onChange={e=>set("cnpj",e.target.value)} placeholder="00.000.000/0001-00"/></Field>
        <Field label="Cor"><input type="color" value={f.color} onChange={e=>set("color",e.target.value)} style={{width:"100%",height:36,padding:2,background:B2,border:`1px solid ${LN}`,borderRadius:6,cursor:"pointer"}}/></Field>
        <Field label="Obs." full><Textarea value={f.notes} onChange={e=>set("notes",e.target.value)} rows={2}/></Field>
        <Field label="Exclusividade neste contrato" full>
          <Select value={f.exclusivityOverride||"DEFAULT"} onChange={e=>set("exclusivityOverride",e.target.value)}>
            <option value="DEFAULT">Padrão da marca (usa categoria)</option>
            <option value="STRICT">Estrita (qualquer outra marca no período = conflito)</option>
            <option value="NONE">Nenhuma (este contrato não gera nem sofre conflito)</option>
          </Select>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:3 }}>Controla como conflitos de agenda são detectados para este contrato.</div>
        </Field>
      </div>

      <SRule>Financeiro & Pagamento</SRule>
      <div style={{display:"flex",background:B2,border:`1px solid ${LN}`,borderRadius:6,overflow:"hidden",marginBottom:14,width:"fit-content"}}>
        {[["single","Único"],["split","Parcelas"],["monthly","Mensal"]].map(([v,l])=>(
          <div key={v} onClick={()=>set("paymentType",v)}
            style={{padding:"6px 14px",fontSize:ds.font.size.xs,fontWeight:700,cursor:"pointer",color:f.paymentType===v?TX:TX2,background:f.paymentType===v?B3:"transparent",transition:"all .1s"}}>{l}</div>
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
          {f.currency!=="BRL"&&(
            <Field label={`Cotação na assinatura (${f.currency}/BRL)`}>
              <Input type="number" step="0.01"
                value={f.lockedRate||""}
                onChange={e => {
                  const v = Number(e.target.value) || null;
                  set("lockedRate", v);
                  // lockedRateAt registra QUANDO a taxa foi travada.
                  // Atualiza sempre que o valor muda (não só na primeira vez),
                  // para rastrear ajustes pós-assinatura.
                  // Nota: ISO string — serverTimestamp() não funciona em campos
                  // aninhados dentro de data:{} no syncCollection. Ver db.js:45.
                  set("lockedRateAt", v ? new Date().toISOString() : null);
                }}
                placeholder="Ex: 5.80"
                hint={f.lockedRateAt
                  ? `Travada em ${new Date(f.lockedRateAt).toLocaleDateString('pt-BR')}`
                  : "Taxa do dia em que o contrato foi assinado. Usada para comparar variação cambial."}
              />
            </Field>
          )}
          <div style={{gridColumn:"1/-1",display:"flex",alignItems:"center",gap:8}}><CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)} label/></div>
          <div style={{gridColumn:"1/-1"}}><WarnBanner field="dates"/></div>
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
          <WarnBanner field="split"/>
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
          <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:6}}>Datas de viagem</div>
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
          <div key={n} onClick={()=>toggleNet(n)} style={{padding:"5px 12px",fontSize:ds.font.size.xs,fontWeight:700,cursor:"pointer",borderRadius:99,background:sel?RED+"22":"rgba(255,255,255,.05)",color:sel?RED:TX2,border:`1px solid ${sel?RED+"44":LN}`,transition:"all .1s"}}>
            {sel&&"✓ "}{n}
          </div>
        );})}
      </div>
      {extraNets>0&&<div style={{fontSize:ds.font.size.xs,color:BLU,fontWeight:700,marginTop:6}}>✓ +{extraNets} repost{extraNets>1?"s":""} contabilizado{extraNets>1?"s":""} automaticamente</div>}

      <SRule>Métricas</SRule>
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
        <Field label={viewsLabel}><Input type="number" min="0" value={f.views} onChange={e=>set("views",e.target.value)} placeholder="0"/></Field>
        {[["reach","Alcance"],["likes","Curtidas"],["comments","Comentários"],["shares","Shares"],["saves","Saves"]].map(([k,l])=>(
          <Field key={k} label={l}><Input type="number" min="0" value={f[k]} onChange={e=>set(k,e.target.value)} placeholder="0"/></Field>
        ))}
      </div>
      <div style={{marginTop:12,padding:"10px 14px",background:B2,border:`1px solid ${LN}`,borderRadius:8}}>
        <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4}}>Engajamento calculado</div>
        <div style={{fontSize:18,fontWeight:700,color:liveEng!=null?(liveEng>=3?GRN:liveEng>=1?AMB:TX2):TX3}}>{fmtEng(liveEng)||"— preencha alcance e interações"}</div>
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
function EmptyState({ icon, iconName, title, sub, action, actionLabel }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      padding:`${ds.space[16]} ${ds.space[6]}`, gap:ds.space[4], textAlign:"center" }}>
      <div style={{ width:56, height:56, borderRadius:ds.radius.lg, background:ds.color.neutral[100],
        border:ds.border.thin, display:"flex", alignItems:"center", justifyContent:"center" }}>
        {iconName
          ? <DsIcon name={iconName} size={24} color={ds.color.neutral[400]}/>
          : icon ? (() => { const I = icon; return <I size={24} color={ds.color.neutral[400]} strokeWidth={1.5}/>; })() : null}
      </div>
      <div>
        <div style={{ fontSize:ds.font.size.md, fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], marginBottom:ds.space[2] }}>{title}</div>
        <div style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[500], maxWidth:340, lineHeight:ds.font.lineHeight.relaxed }}>{sub}</div>
      </div>
      {action && (
        <DsButton variant="primary" size="sm" onClick={action}>{actionLabel||"Adicionar"}</DsButton>
      )}
    </div>
  );
}

// ─── View Renderer (catches per-view errors) ──────────────
function ViewRenderer({ view, contracts, posts, deliverables, stats, rates, saveNote, toggleComm,
  toggleCommPaid, toggleNF, setModal, setView, saveC, saveP, saveD,
  calEvents, calMonth, setCal, calFilter, setCalF,
  triggerNewTask, setTriggerNewTask, role, userName, syncStatus,
  brands=[], saveBrands, setSelectedBrand, selectedBrand, openCopilot }) {
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
    if (view==="acompanhamento") return <Acompanhamento contracts={activeContracts} posts={posts} deliverables={deliverables} saveDeliverables={saveD} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF} role={role} brands={brands}/>;
    if (view==="contratos")      return <Contratos contracts={contracts} posts={posts} deliverables={deliverables} saveC={saveC} saveP={saveP} saveDeliverables={saveD} setModal={setModal} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} saveNote={saveNote} rates={rates} role={role} brands={brands} navigateTo={v=>{setView(v);}} setSelectedBrand={setSelectedBrand} openCopilot={openCopilot}/>;
    if (view==="marcas")         return <Marcas brands={brands} contracts={contracts} posts={posts} deliverables={deliverables} saveBrands={saveBrands} navigateTo={v=>{setView(v);}} setSelectedBrand={setSelectedBrand} role={role} openCopilot={openCopilot}/>;
    if (view==="marca-detalhe")  return <MarcaDetalhe brandId={selectedBrand} brands={brands} contracts={contracts} posts={posts} deliverables={deliverables} saveBrands={saveBrands} onBack={()=>setView("marcas")} navigateTo={v=>{setView(v);}} setSelectedBrand={setSelectedBrand} openCopilot={openCopilot} onNewContract={(prefillBrandId)=>setModal({type:"contract",data:null,prefillBrandId})}/>;
    if (view==="caixa")          return <Caixa contracts={activeContracts} openCopilot={openCopilot} role={role} syncStatus={syncStatus} onRetrySync={()=>{ /* retry via saveTx re-sync */ }}/>;
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
  // Etapa 4: use strict conversion — null when rate missing, shows "—" in KPIs
  const contractBRL   = toBRLStrict(contractValue, c.currency, rates);

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
      <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:6}}>{label}</div>
      <div style={{fontSize:20,fontWeight:700,color:color||TX,lineHeight:1}}>{value}</div>
      {sub&&<div style={{fontSize:ds.font.size.xs,color:TX3,marginTop:3}}>{sub}</div>}
    </div>
  );

  return (
    <Modal title={`Relatório de Performance · ${c.company}`} onClose={onClose} width={780}
      footer={<>
        <Btn onClick={()=>window.print()} variant="default" size="sm">Imprimir / PDF</Btn>
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
            <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:GRN,marginBottom:6}}>Resumo Executivo</div>
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
        <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Métricas de Performance</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          <MetricCard label="Visualizações" value={totalViews>0?totalViews.toLocaleString("pt-BR"):"—"} sub="total acumulado"/>
          <MetricCard label="Alcance" value={totalReach>0?totalReach.toLocaleString("pt-BR"):"—"} sub="pessoas únicas"/>
          <MetricCard label="Engajamento" value={fmtEng(avgEngRate)} sub="média geral" color={avgEngRate!=null?(avgEngRate>=3?GRN:avgEngRate>=1?AMB:TX2):TX2}/>
          <MetricCard label="Interações" value={totalEngagements>0?totalEngagements.toLocaleString("pt-BR"):"—"} sub="likes+comentários"/>
        </div>

        {/* ROI KPIs */}
        <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Custo por Resultado (ROI)</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10,marginBottom:20}}>
          <MetricCard label="CPM" value={CPM!=null?`R$ ${CPM.toFixed(2)}`:"—"} sub="custo por mil views" color={CPM!=null&&CPM<50?GRN:AMB}/>
          <MetricCard label="CPV" value={CPV!=null?`R$ ${CPV.toFixed(4)}`:"—"} sub="custo por visualização"/>
          <MetricCard label="CPE" value={CPE!=null?`R$ ${CPE.toFixed(2)}`:"—"} sub="custo por engajamento" color={CPE!=null&&CPE<20?GRN:AMB}/>
          <MetricCard label="CPM Alcance" value={CPR!=null?`R$ ${CPR.toFixed(2)}`:"—"} sub="custo por mil alcançados"/>
        </div>

        {/* Delivery */}
        <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Entregas do Contrato</div>
        <div style={{...G,padding:"14px 16px",marginBottom:20}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
            <span style={{fontSize:12,color:TX2}}>
            {doneDels} de {totalDels} entregas concluídas
            {doneDelsFromPosts>0&&<span style={{fontSize:ds.font.size.xs,color:TX3,marginLeft:6}}>({doneDelsFromPosts} via Posts{doneDelsFromPipeline>0?`, ${doneDelsFromPipeline} via Pipeline`:""})</span>}
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
            <div style={{fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:10}}>Detalhamento por Publicação</div>
            <div style={{border:`1px solid ${LN}`,borderRadius:8,overflow:"hidden",marginBottom:16}}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 90px 80px 80px",padding:"7px 14px",background:B2,fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:TX3}}>
                <div>Publicação</div><div>Views</div><div>Alcance</div><div>Curtidas</div><div>Coment.</div><div>Eng.%</div>
              </div>
              {cPosts.map((p,i)=>{
                const pRch=sumNetworkMetrics(p,"reach"),pLk=sumNetworkMetrics(p,"likes"),pCm=sumNetworkMetrics(p,"comments");const eng=pRch>0?((pLk+pCm)/pRch*100):calcEngagement(p);
                return(
                  <div key={p.id} style={{display:"grid",gridTemplateColumns:"1fr 90px 90px 90px 80px 80px",padding:"9px 14px",borderTop:`1px solid ${LN}`,fontSize:11,alignItems:"center"}}>
                    <div style={{fontWeight:500,color:TX}}>{p.title}{p.link&&<a href={p.link} target="_blank" rel="noreferrer" style={{color:RED,marginLeft:6,fontSize:ds.font.size.xs}}>↗</a>}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"views")||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"reach")||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"likes")||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{color:TX2,fontVariantNumeric:"tabular-nums"}}>{(sumNetworkMetrics(p,"comments")||0).toLocaleString("pt-BR")||"—"}</div>
                    <div style={{fontWeight:700,color:eng!=null?(eng>=3?GRN:eng>=1?AMB:TX3):TX3}}>{fmtEng(eng)}</div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        <div style={{fontSize:ds.font.size.xs,color:TX3,textAlign:"center",paddingTop:12,borderTop:`1px solid ${LN}`}}>
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
          <div style={{display:"flex",justifyContent:"center",marginBottom:12}}><DsIcon name="checkCircle" size={32} color={ds.color.success[500]}/></div>
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
// NavIcon removido — MobileNav agora usa <DsIcon name="..."/> diretamente.

function MobileNav({ view, setView, role, userName, deliverables, contracts }) {
  const allowedNav = ROLE_NAV[role] || ROLE_NAV.admin;
  const today = new Date();
  const isSunday = today.getDay() === 0;

  const ALL_MOB = [
    { id:"dashboard",      label:"Home",       icon:"layoutDashboard" },
    { id:"acompanhamento", label:"Produção",   icon:"kanban"          },
    { id:"contratos",      label:"Contratos",  icon:"fileText"        },
    { id:"financeiro",     label:"Financeiro", icon:"banknote"        },
    { id:"caixa",          label:"Caixa",      icon:"landmark"        },
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
    <div style={{ position:'fixed', bottom:0, left:0, right:0,
      background:ds.color.neutral[0], borderTop:ds.border.thin,
      display:'flex', alignItems:'stretch', zIndex:ds.z.sticky,
      boxShadow:`0 -1px 0 ${ds.color.neutral[200]}, 0 -4px 16px rgba(15,23,42,0.06)`,
      paddingBottom:'env(safe-area-inset-bottom,0px)', minHeight:58 }}>
      {NAV_MOB.map(item => {
        const active = view === item.id;
        return (
          <div key={item.id} onClick={()=>setView(item.id)}
            style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              gap:3, cursor:'pointer', padding:'10px 0 8px',
              borderTop: active ? `2px solid ${ds.color.neutral[900]}` : '2px solid transparent',
              transition:`border-color ${ds.motion.fast}` }}>
            <DsIcon name={item.icon} size={20}
              color={active ? ds.color.neutral[900] : ds.color.neutral[400]}/>
            <span style={{ fontSize:ds.font.size.xs, fontWeight:active?ds.font.weight.semibold:ds.font.weight.regular,
              color:active?ds.color.neutral[900]:ds.color.neutral[400], letterSpacing:'0.02em' }}>
              {item.label}
            </span>
          </div>
        );
      })}
      {/* WhatsApp — sempre o último */}
      <div onClick={sendWA}
        style={{ width:52, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          gap:3, cursor:'pointer', padding:'10px 0 8px',
          borderTop: isSunday ? `2px solid ${WA_GREEN}` : '2px solid transparent',
          background: isSunday ? `${WA_GREEN}08` : 'transparent' }}>
        <DsIcon name="phone" size={20} color={isSunday ? WA_DARK : ds.color.neutral[400]}/>
        <span style={{ fontSize:ds.font.size.xs, fontWeight:isSunday?ds.font.weight.semibold:ds.font.weight.regular,
          color:isSunday?WA_DARK:ds.color.neutral[400] }}>WA</span>
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
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Recebido</div>
          <div style={{ fontSize:18,fontWeight:700,color:GRN }}>{fmtMoney(totalReceived)}</div>
          <div style={{ fontSize:11,color:TX2 }}>{payments.filter(p=>p.received).length} pagamentos</div>
        </div>
        <div style={{ ...G, padding:"14px 16px", borderLeft:`3px solid ${AMB}` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>A receber</div>
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
                      <div style={{ fontSize:ds.font.size.xs,color:TX2 }}>{fmtDate(recDate)}</div>
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
    { id:"cotacoes",    label:"Cotações" },
  ];

  return (
    <div style={{ padding: isMobile ? "0 0 88px" : "24px 28px", maxWidth:1100 }}>
      {/* Header */}
      {!isMobile && (
        <div style={{ marginBottom:ds.space[5] }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:ds.space[4] }}>
            <div>
              <h1 style={{ fontSize:ds.font.size['2xl'], fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], letterSpacing:"-.02em", marginBottom:ds.space[1] }}>Financeiro</h1>
              <p style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[500] }}>Gestão de NFs, comissões Ranked e pagamentos</p>
            </div>

          </div>
        </div>
      )}
      {isMobile && (
        <div style={{ padding:"12px 16px 8px", borderBottom:`1px solid ${LN}`, background:B1 }}>
          <div style={{ fontSize:13, fontWeight:700, color:TX }}>Financeiro</div>
        </div>
      )}

      {/* Summary KPIs — horizontal scroll on mobile */}
      <div style={{ display:"flex", gap:10, overflowX:"auto", padding: isMobile?"12px 16px 4px":"0 0 4px 0", marginBottom:isMobile?8:20, scrollbarWidth:"none", WebkitOverflowScrolling:"touch" }}>
        {[
          { label:"Volume bruto", value:fmtMoney(totalBRL), sub:`${contracts.length} contratos` },
          { label:"Custos", value:fmtMoney(totalCosts), sub:"deduzidos", accent:totalCosts>0?AMB:TX2 },
          { label:"Comissão", value:fmtMoney(commPend), sub:"a pagar Ranked", accent:commPend>0?RED:GRN },
          { label:"NFs a emitir", value:nfPending.length, sub:`de ${contracts.length}`, accent:nfPending.length>0?AMB:GRN },
        ].map((k,i) => (
          <div key={i} style={{ ...G, padding: isMobile?"12px 14px":"16px 18px", flexShrink:0, minWidth:isMobile?140:undefined, flex:isMobile?"none":"1" }}>
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX3,marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:isMobile?18:22,fontWeight:800,color:k.accent||TX,lineHeight:1,letterSpacing:"-.02em" }}>{k.value}</div>
            <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>{k.sub}</div>
          </div>
        ))}
      </div>

      {/* Tabs — sticky on mobile */}
      <div style={{
        display:"flex", gap:0, borderBottom:`1px solid ${LN}`, marginBottom:16, overflowX:"auto", scrollbarWidth:"none", WebkitOverflowScrolling:"touch",
        ...(isMobile ? { position:"sticky", top:0, zIndex:10, background:B1, paddingLeft:16, paddingRight:16 } : {}),
      }}>
        {TABS.map(t => (
          <div key={t.id} onClick={()=>setTab(t.id)}
            style={{ padding:"10px 14px", fontSize:12, fontWeight:tab===t.id?700:400, cursor:"pointer", color:tab===t.id?TX:TX2, borderBottom:`2px solid ${tab===t.id?ds.color.neutral[900]:"transparent"}`, transition:TRANS, marginBottom:-1, whiteSpace:"nowrap", flexShrink:0 }}>
            {t.label}
          </div>
        ))}
      </div>

      {/* Visão Geral */}
      {tab==="visao" && (
        <div style={{ display:"flex", flexDirection:"column", gap:10, padding: isMobile ? "0 16px" : 0 }}>
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
                    <div style={{ display:"inline-flex", alignItems:"center", gap:4, padding:"3px 9px", borderRadius:99, fontSize:ds.font.size.xs, fontWeight:700,
                      background: nfDone?`${GRN}15`:`${AMB}15`,
                      color: nfDone?GRN:AMB }}>
                      {nfDone?"✓ NF ok":"NF pendente"}
                    </div>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                    <div style={{ background:B2, borderRadius:8, padding:"10px 12px" }}>
                      <div style={{ fontSize:ds.font.size.xs, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Valor bruto</div>
                      <div style={{ fontSize:16, fontWeight:800, color:TX }}>{fmtMoney(gross,c.currency)}</div>
                      {costs>0&&<div style={{ fontSize:ds.font.size.xs, color:AMB, marginTop:2 }}>- {fmtMoney(costs)} custos</div>}
                    </div>
                    {c.hasCommission ? (
                      <div style={{ background:B2, borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:ds.font.size.xs, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Comissão Ranked</div>
                        <div style={{ fontSize:16, fontWeight:800, color:comm-commP>0?RED:GRN }}>{fmtMoney(comm,c.currency)}</div>
                        {commP===comm&&<div style={{ fontSize:ds.font.size.xs, color:GRN, marginTop:2 }}>✓ Quitado</div>}
                        {commP>0&&commP<comm&&<div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:2 }}>{fmtMoney(commP)} pago</div>}
                      </div>
                    ) : (
                      <div style={{ background:B2, borderRadius:8, padding:"10px 12px" }}>
                        <div style={{ fontSize:ds.font.size.xs, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".08em", marginBottom:4 }}>Comissão</div>
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
                  {costs>0&&<div style={{ fontSize:ds.font.size.xs, color:AMB }}>- {fmtMoney(costs)} custos</div>}
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
                      {commP>0&&commP<comm&&<div style={{ fontSize:ds.font.size.xs, color:TX2 }}>{fmtMoney(commP)} pago</div>}
                      {commP===comm&&<div style={{ fontSize:ds.font.size.xs, color:GRN }}>✓ Quitado</div>}
                    </div>
                  ) : <div style={{ fontSize:12, color:TX3 }}>—</div>}
                </div>
                <div style={{ textAlign:"right" }}>
                  <div style={{ display:"inline-flex", alignItems:"center", gap:5, padding:"3px 9px", borderRadius:99, fontSize:ds.font.size.xs, fontWeight:700,
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
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Total comissão</div>
              <div style={{ fontSize:18,fontWeight:700,color:TX }}>{fmtMoney(totalComm)}</div>
            </div>
            <div>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Pago à Ranked</div>
              <div style={{ fontSize:18,fontWeight:700,color:GRN }}>{fmtMoney(commPaid)}</div>
            </div>
            <div>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Pendente</div>
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
      {tab==="cotacoes" && (
        <div style={{ paddingTop:ds.space[4] }}>
          <CotacoesView/>
        </div>
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
        <button onClick={()=>setOffset(0)} style={{ background:offset===0?TX2:"none", border:`1px solid ${LN}`, borderRadius:4, width:20, height:20, cursor:"pointer", color:offset===0?"white":TX2, fontSize:ds.font.size.xs, display:"flex", alignItems:"center", justifyContent:"center" }} title="Mês atual">●</button>
        <button onClick={()=>setOffset(o=>o+1)} style={{ background:"none", border:`1px solid ${LN}`, borderRadius:4, width:20, height:20, cursor:"pointer", color:TX2, fontSize:11, display:"flex", alignItems:"center", justifyContent:"center", lineHeight:1 }}>›</button>
      </div>

      <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX2, marginBottom:6 }}>
        Entregas · {monthLabelShort} {y !== new Date().getFullYear() ? y : ""}
      </div>
      <div style={{ fontSize:20, fontWeight:700, color:TX, lineHeight:1, marginBottom:4 }}>
        {done}<span style={{ fontSize:13, color:TX2, fontWeight:400 }}>/{total}</span>
      </div>
      <div style={{ height:3, background:LN, borderRadius:2, marginBottom:6, overflow:"hidden" }}>
        <div style={{ height:3, borderRadius:2, background:total>0&&done===total?GRN:RED, width:`${total>0?Math.round(done/total*100):0}%`, transition:"width .4s" }}/>
      </div>
      {total === 0
        ? <div style={{ fontSize:ds.font.size.xs, color:TX3 }}>Sem entregáveis</div>
        : <div style={{ fontSize:ds.font.size.xs, color:TX2 }}>
            {byStage["done"]?`✓ ${byStage["done"]} entregues`:""}
            {byStage["postagem"]?` · 📅 ${byStage["postagem"]} para postar`:""}
            {total - (byStage["done"]||0) - (byStage["postagem"]||0) > 0
              ? ` · ⚙️ ${total-(byStage["done"]||0)-(byStage["postagem"]||0)} em prod.`:""}
          </div>
      }
    </div>
  );
}


// ─── Caixa view — extracted (Fase 5) ─────────────────────
// Loaded lazily; ViewRenderer is already wrapped in <Suspense>.
const Caixa = React.lazy(() => import("./views/caixa/CaixaView.jsx"));


// ─── Copiloto Ranked ──────────────────────────────────────

const COPILOT_PURPLE = "#7C3AED";

function MarkdownText({ content }) {
  // Simple markdown renderer — bold, lists, headers, code
  if (!content) return null;
  const lines = String(content).split("\n");
  const elems = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("## "))    { elems.push(<div key={i} style={{ fontSize:14,fontWeight:800,color:TX,marginTop:14,marginBottom:6 }}>{line.slice(3)}</div>); }
    else if (line.startsWith("### ")) { elems.push(<div key={i} style={{ fontSize:12,fontWeight:700,color:TX,marginTop:10,marginBottom:4 }}>{line.slice(4)}</div>); }
    else if (line.startsWith("- ") || line.startsWith("• ")) {
      const text = line.slice(2);
      elems.push(<div key={i} style={{ fontSize:12,color:TX,paddingLeft:12,marginBottom:2,display:"flex",gap:6 }}><span style={{color:TX3}}>•</span><span dangerouslySetInnerHTML={{__html:text.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`(.+?)`/g,"<code style='background:#F1F5F9;padding:1px 4px;borderRadius:3px;fontSize:11px'>$1</code>")}}/></div>);
    }
    else if (line.startsWith("> ")) { elems.push(<div key={i} style={{ fontSize:11,color:TX2,background:`${COPILOT_PURPLE}08`,borderLeft:`3px solid ${COPILOT_PURPLE}`,padding:"6px 10px",borderRadius:"0 6px 6px 0",margin:"6px 0",fontStyle:"italic" }}>{line.slice(2)}</div>); }
    else if (line.startsWith("|")) { /* table row — simplified */ elems.push(<div key={i} style={{ fontSize:11,color:TX,fontFamily:"monospace",padding:"1px 0" }}>{line}</div>); }
    else if (line.startsWith("---")) { elems.push(<div key={i} style={{ height:1,background:LN,margin:"8px 0" }}/>); }
    else if (line.trim() === "") { elems.push(<div key={i} style={{ height:6 }}/>); }
    else { elems.push(<div key={i} style={{ fontSize:12,color:TX,lineHeight:1.6,marginBottom:2 }} dangerouslySetInnerHTML={{__html:line.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>").replace(/`(.+?)`/g,"<code style='background:#F1F5F9;padding:1px 4px;borderRadius:3px;fontSize:11px'>$1</code>")}}/>); }
    i++;
  }
  return <div>{elems}</div>;
}

// ─── Sparkline SVG inline ─────────────────────────────────────────────────────
function Sparkline({ values, color, width = 64, height = 24 }) {
  if (!values || values.length < 2) return (
    <svg width={width} height={height}><line x1={0} y1={height/2} x2={width} y2={height/2} stroke={ds.color.neutral[200]} strokeWidth={1}/></svg>
  );
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={width} height={height} style={{ display:'block', overflow:'visible' }}>
      <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round"/>
    </svg>
  );
}

// ─── CotacoesView ─────────────────────────────────────────────────────────────
function CotacoesView() {
  const {
    rates, loading, error, stale, fetchedAt, source, isManual, refresh,
    autoRefresh, setAutoRefresh, intervalMin, setIntervalMin, history,
  } = useFx();

  const [manualUSD, setManualUSD] = useState('');
  const [manualEUR, setManualEUR] = useState('');
  const [saved, setSaved]         = useState(false);

  const INTERVALS = [5, 15, 30, 60];

  const handleSaveManual = () => {
    if (!manualUSD && !manualEUR) return;
    saveManualRates(
      Number(manualUSD) || rates?.USD || 0,
      Number(manualEUR) || rates?.EUR || 0,
    );
    setSaved(true);
    refresh();
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClearManual = () => {
    clearManualRates();
    setManualUSD(''); setManualEUR('');
    refresh();
  };

  const eurHistory = history.map(r => r.EUR).filter(Boolean);
  const usdHistory = history.map(r => r.USD).filter(Boolean);

  // Label da fonte
  const SOURCE_LABEL = { awesomeapi:'AwesomeAPI', frankfurter:'Frankfurter', 'er-api':'ExchangeRate-API', manual:'Override manual', cache:'Cache' };

  return (
    <div style={{ padding:`${ds.space[6]} ${ds.space[8]}`, maxWidth:720 }}>
      {/* Header */}
      <div style={{ marginBottom:ds.space[6] }}>
        <h1 style={{ fontSize:ds.font.size['2xl'], fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], letterSpacing:'-.02em', marginBottom:ds.space[1] }}>Cotações cambiais</h1>
        <p style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[500] }}>
          Taxas de câmbio usadas em contratos USD/EUR.
          {autoRefresh ? ` Atualização automática a cada ${intervalMin} min.` : ' Atualização automática desativada.'}
        </p>
      </div>

      {/* Status atual */}
      <div style={{ ...G, padding:`${ds.space[5]} ${ds.space[6]}`, marginBottom:ds.space[4] }}>
        <Overline mb={ds.space[4]}>Cotação atual</Overline>
        <div style={{ display:'flex', alignItems:'center', gap:ds.space[4], marginBottom:ds.space[4] }}>
          <CurrencyRateBadge size="md" showRefresh/>
          {isManual && <span style={{ fontSize:ds.font.size.xs, padding:`2px ${ds.space[2]}`, borderRadius:ds.radius.full, background:ds.color.info[50], border:`1px solid ${ds.color.info[500]}30`, color:ds.color.info[500] }}>Override manual</span>}
          {stale    && <span style={{ fontSize:ds.font.size.xs, color:ds.color.warning[500] }}>⚠ Desatualizada</span>}
        </div>
        <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[500] }}>
          {source && <><strong>{SOURCE_LABEL[source] || source}</strong> · </>}
          {fetchedAt && <>Última atualização: {new Date(fetchedAt).toLocaleString('pt-BR')}</>}
        </div>
        {error && <div style={{ fontSize:ds.font.size.xs, color:ds.color.danger[500], marginTop:ds.space[2] }}>{error}</div>}
      </div>

      {/* KPIs */}
      {rates && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:ds.space[3], marginBottom:ds.space[4] }}>
          {[
            { label:'USD · Dólar', value:rates.USD, symbol:'US$', spark:usdHistory, color:ds.color.info[500]    },
            { label:'EUR · Euro',  value:rates.EUR, symbol:'€',   spark:eurHistory, color:ds.color.brand[500]   },
          ].map(item => (
            <div key={item.label} style={{ ...G, padding:`${ds.space[4]} ${ds.space[5]}` }}>
              <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:ds.space[2] }}>
                <Overline>{item.label}</Overline>
                <Sparkline values={item.spark} color={item.color} width={56} height={20}/>
              </div>
              <div style={{ fontSize:ds.font.size['3xl'], fontWeight:ds.font.weight.semibold, color:ds.color.neutral[900], fontVariantNumeric:'tabular-nums', letterSpacing:'-0.02em' }}>
                {formatRate(item.value)}
              </div>
              <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[400], marginTop:ds.space[1] }}>
                {item.symbol} 1 = R$ {item.value?.toFixed(4).replace('.', ',')}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-refresh prefs */}
      <div style={{ ...G, padding:`${ds.space[5]} ${ds.space[6]}`, marginBottom:ds.space[4] }}>
        <Overline mb={ds.space[4]}>Atualização automática</Overline>

        {/* Toggle */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:ds.space[4] }}>
          <div>
            <div style={{ fontSize:ds.font.size.sm, fontWeight:ds.font.weight.medium, color:ds.color.neutral[900] }}>Atualizar automaticamente</div>
            <div style={{ fontSize:ds.font.size.xs, color:ds.color.neutral[500], marginTop:2 }}>
              {autoRefresh ? `Busca cotação a cada ${intervalMin} min` : 'Desativado — use o botão de refresh manual'}
            </div>
          </div>
          <button
            role="switch" aria-checked={autoRefresh}
            onClick={() => setAutoRefresh(!autoRefresh)}
            style={{ width:44, height:24, borderRadius:ds.radius.full, background:autoRefresh ? ds.color.success[500] : ds.color.neutral[300], border:'none', cursor:'pointer', position:'relative', transition:'background .2s', flexShrink:0 }}>
            <div style={{ position:'absolute', top:2, left:autoRefresh ? 22 : 2, width:20, height:20, borderRadius:'50%', background:'#fff', boxShadow:ds.shadow.sm, transition:'left .2s' }}/>
          </button>
        </div>

        {/* Slider de intervalo */}
        {autoRefresh && (
          <div>
            <div style={{ fontSize:ds.font.size.xs, fontWeight:ds.font.weight.medium, color:ds.color.neutral[500], letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:ds.space[2] }}>
              Intervalo de atualização
            </div>
            <div style={{ display:'flex', gap:ds.space[2] }}>
              {INTERVALS.map(v => (
                <button key={v} onClick={() => setIntervalMin(v)}
                  style={{ flex:1, padding:`${ds.space[2]} 0`, fontSize:ds.font.size.xs, fontWeight:ds.font.weight.semibold, borderRadius:ds.radius.md, border:`1px solid ${intervalMin===v ? ds.color.neutral[900] : ds.color.neutral[200]}`, background:intervalMin===v ? ds.color.neutral[900] : 'transparent', color:intervalMin===v ? ds.color.neutral[0] : ds.color.neutral[500], cursor:'pointer', transition:'all .15s' }}>
                  {v} min
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Histórico das últimas 10 cotações */}
      <div style={{ ...G, padding:`${ds.space[5]} ${ds.space[6]}`, marginBottom:ds.space[4] }}>
        <Overline mb={ds.space[4]}>Histórico de cotações</Overline>
        {history.length === 0 ? (
          <div style={{ fontSize:ds.font.size.sm, color:ds.color.neutral[400], textAlign:'center', padding:`${ds.space[6]} 0` }}>
            Nenhuma cotação registrada ainda.<br/>As próximas buscas automáticas aparecerão aqui.
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:ds.font.size.xs }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${ds.color.neutral[200]}` }}>
                  {['Data/hora', 'EUR/BRL', 'USD/BRL', 'Fonte'].map(h => (
                    <th key={h} style={{ textAlign:'left', padding:`${ds.space[2]} ${ds.space[3]}`, fontWeight:ds.font.weight.semibold, color:ds.color.neutral[500], letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.map((rec, i) => (
                  <tr key={rec.recordedAt || i} style={{ borderBottom:`1px solid ${ds.color.neutral[100]}` }}>
                    <td style={{ padding:`${ds.space[2]} ${ds.space[3]}`, color:ds.color.neutral[700], fontVariantNumeric:'tabular-nums' }}>
                      {rec.fetchedAt ? new Date(rec.fetchedAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—'}
                    </td>
                    <td style={{ padding:`${ds.space[2]} ${ds.space[3]}`, color:ds.color.neutral[900], fontWeight:ds.font.weight.semibold, fontVariantNumeric:'tabular-nums' }}>
                      {formatRate(rec.EUR)}
                    </td>
                    <td style={{ padding:`${ds.space[2]} ${ds.space[3]}`, color:ds.color.neutral[900], fontWeight:ds.font.weight.semibold, fontVariantNumeric:'tabular-nums' }}>
                      {formatRate(rec.USD)}
                    </td>
                    <td style={{ padding:`${ds.space[2]} ${ds.space[3]}`, color:ds.color.neutral[500] }}>
                      {SOURCE_LABEL[rec.source] || rec.source || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Override manual */}
      <div style={{ ...G, padding:`${ds.space[5]} ${ds.space[6]}` }}>
        <Overline mb={ds.space[3]}>Override manual</Overline>
        {isManual && (
          <div style={{ fontSize:ds.font.size.xs, color:ds.color.warning[700], background:ds.color.warning[50], border:`1px solid ${ds.color.warning[500]}30`, borderRadius:ds.radius.md, padding:`${ds.space[2]} ${ds.space[3]}`, marginBottom:ds.space[3] }}>
            ⚠ Override ativo — auto-fetch desativado até ser removido.
          </div>
        )}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:ds.space[3], marginBottom:ds.space[3] }}>
          {[
            { label:'USD → BRL', val:manualUSD, set:setManualUSD, ph:rates?.USD?.toFixed(2) || 'Ex: 5.92' },
            { label:'EUR → BRL', val:manualEUR, set:setManualEUR, ph:rates?.EUR?.toFixed(2) || 'Ex: 6.40' },
          ].map(f => (
            <div key={f.label}>
              <label style={{ fontSize:ds.font.size.xs, fontWeight:ds.font.weight.medium, color:ds.color.neutral[500], letterSpacing:'0.06em', textTransform:'uppercase', display:'block', marginBottom:ds.space[1] }}>{f.label}</label>
              <input type="number" step="0.01" value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                style={{ width:'100%', padding:`0 ${ds.space[3]}`, height:40, fontSize:ds.font.size.base, fontFamily:'inherit', color:ds.color.neutral[900], background:ds.color.neutral[50], border:ds.border.thin, borderRadius:ds.radius.md, outline:'none', boxSizing:'border-box', fontVariantNumeric:'tabular-nums' }}/>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:ds.space[2] }}>
          <DsButton variant="primary" size="sm" onClick={handleSaveManual} disabled={!manualUSD && !manualEUR}>
            {saved ? '✓ Salvo' : 'Salvar override'}
          </DsButton>
          {isManual && (
            <DsButton variant="ghost" size="sm" onClick={handleClearManual} style={{ color:ds.color.danger[500] }}>
              Remover override
            </DsButton>
          )}
        </div>
      </div>
    </div>
  );
}

function CopilotButton({ onClick, hasAlert, isMobile }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      aria-label="Abrir Copiloto Ranked"
      style={{
        position:"fixed",
        bottom: isMobile ? 76 : 24,
        right: 24,
        zIndex: 150,
        display:"flex", alignItems:"center", gap:8,
        padding:"10px 20px",
        background: COPILOT_PURPLE,
        color:"#fff",
        border:"none",
        borderRadius:999,
        fontSize:13, fontWeight:700,
        cursor:"pointer",
        boxShadow: hov ? "0 8px 30px rgba(124,58,237,0.45)" : "0 4px 20px rgba(124,58,237,0.3)",
        transform: hov ? "scale(1.03)" : "scale(1)",
        transition:"all .15s ease",
        fontFamily:"inherit",
      }}>
      <DsIcon name="sparkles" size={15} color="#fff"/>
      Copiloto
      {hasAlert && (
        <span style={{ position:"absolute", top:-4, right:-4, width:16, height:16, background:RED, borderRadius:"50%", border:"2px solid #fff", fontSize:ds.font.size.xs, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff" }}>!</span>
      )}
    </button>
  );
}

function CopilotPanel({ isOpen, onClose, view, context={}, contracts=[], deliverables=[], posts=[], brands=[], transactions=[], role="admin", today=new Date(), signals=[], onSaveMetrics }) {
  const isMobile = useIsMobile();
  const [tab, setTab]               = useState("suggestions");
  const [messages, setMessages]     = useState(() => loadHistory());
  const [input, setInput]           = useState("");
  const [generating, setGenerating] = useState(null); // actionId
  const [results, setResults]       = useState({});   // { [suggId]: { content, type, title } }
  const [reports, setReports]       = useState(() => { try { return JSON.parse(localStorage.getItem("copilot_reports_v1")||"[]"); } catch { return []; } });
  const [warnOk, setWarnOk]         = useState({});
  const inputRef  = useRef(null);
  const chatRef   = useRef(null);
  const fileRef   = useRef(null); // for metrics image upload

  // ── Metrics extraction state ────────────────────────────
  const [mxState, setMxState] = useState("idle"); // idle | loading | preview | saved | error
  const [mxImage, setMxImage] = useState(null);   // { base64, type, url }
  const [mxResult, setMxResult] = useState(null); // parsed { platform, metrics, confidence, notes }
  const [mxEdited, setMxEdited] = useState({});   // user-edited values
  const [mxDelivId, setMxDelivId] = useState(""); // selected deliverable id
  const [mxError, setMxError]  = useState(null);

  const PLATFORM_COLOR = { Instagram:"#E1306C", TikTok:"#000000", YouTube:"#FF0000" };
  const PLATFORM_ICON  = { Instagram:"upload", TikTok:"zap", YouTube:"arrowRight" };

  // Field labels per platform
  const METRIC_LABELS = {
    views:           "Visualizações",
    likes:           "Curtidas",
    comments:        "Comentários",
    shares:          "Compartilhamentos / Envios",
    saves:           "Salvamentos",
    reach:           "Alcance / Espectadores únicos",
    reposts:         "Reposts",
    avgWatchTimeSec: "Tempo médio (seg)",
    retentionPct:    "Retenção (%)",
    newFollowers:    "Novos seguidores",
    skipRatePct:     "Taxa de skip (%)",
    totalWatchTimeHrs: "Tempo total (horas)",
  };

  // Fields actually used per platform (based on your screenshots)
  const PLATFORM_FIELDS = {
    Instagram: ["views","likes","comments","shares","saves","reposts","avgWatchTimeSec","skipRatePct","newFollowers"],
    TikTok:    ["views","likes","comments","shares","saves","avgWatchTimeSec","retentionPct","newFollowers","totalWatchTimeHrs"],
    YouTube:   ["views","reach","avgWatchTimeSec","retentionPct","newFollowers","totalWatchTimeHrs"],
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset state
    setMxState("loading");
    setMxResult(null);
    setMxEdited({});
    setMxError(null);

    // Read as base64
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target.result; // "data:image/jpeg;base64,..."
      const [header, base64] = dataUrl.split(",");
      const imageType = header.match(/:(.*?);/)?.[1] || "image/jpeg";
      const previewUrl = dataUrl;
      setMxImage({ base64, type: imageType, url: previewUrl });

      try {
        const result = await runAction("extract-metrics", { imageBase64: base64, imageType });
        if (result.type !== "metrics_extraction") throw new Error("Resposta inesperada");
        const parsed = result.content;
        setMxResult(parsed);
        // Pre-fill edited values with extracted metrics (only non-null)
        const initial = {};
        Object.entries(parsed.metrics || {}).forEach(([k, v]) => {
          if (v !== null) initial[k] = String(v);
        });
        setMxEdited(initial);
        // Auto-select deliverable if context has one
        if (context.deliverableId) setMxDelivId(context.deliverableId);
        setMxState("preview");
      } catch(err) {
        setMxError(String(err.message || err));
        setMxState("error");
      }
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  const handleSaveMetrics = async () => {
    if (!mxDelivId || !mxResult) return;
    const platform = mxResult.platform;
    // Build metrics object from edited values
    const metrics = {};
    Object.entries(mxEdited).forEach(([k, v]) => {
      const num = parseFloat(String(v).replace(",", "."));
      if (!isNaN(num)) metrics[k] = num;
    });
    await onSaveMetrics?.(mxDelivId, platform, metrics);
    setMxState("saved");
  };

  const resetMetrics = () => {
    setMxState("idle");
    setMxImage(null);
    setMxResult(null);
    setMxEdited({});
    setMxError(null);
    setMxDelivId("");
  };

  // Switch to conversa tab and focus input when ask-financial is selected
  useEffect(() => {
    if (context.actionId === "ask-financial") setTab("conversa");
  }, [context.actionId]);

  // Auto-scroll chat
  useEffect(() => {
    if (tab === "conversa" && chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, tab]);

  // Focus input when conversa tab opens
  useEffect(() => {
    if (tab === "conversa") setTimeout(() => inputRef.current?.focus(), 100);
  }, [tab]);

  // Esc to close
  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);

  const data = { contracts, deliverables, posts, brands, transactions, signals };

  const suggestions = useMemo(
    () => getSuggestions({ view, data: { contracts, deliverables, posts, brands, signals }, today, context }),
    [view, contracts, deliverables, posts, brands, signals, today, context]
  );

  // Pre-select action from context
  useEffect(() => {
    if (!isOpen || !context.actionId) return;
    const match = suggestions.find(s => s.actionId === context.actionId);
    if (match) { setTab("suggestions"); }
  }, [isOpen, context.actionId]);

  const handleRunAction = async (suggestion) => {
    const sid = suggestion.id;
    setGenerating(sid);
    try {
      const result = await runAction(suggestion.actionId, {
        data,
        today,
        role,
        contractId: suggestion.contextData?.contractId || context.contractId,
        brandId:    suggestion.contextData?.brandId    || context.brandId,
      });
      setResults(r => ({ ...r, [sid]: result }));
      // If result is chat_ready, seed the chat
      if (result.type === "chat_ready") {
        setTab("conversa");
      }
    } catch(e) {
      setResults(r => ({ ...r, [sid]: { type:"text", content:`Erro: ${String(e)}`, title:"Erro" } }));
    }
    setGenerating(null);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const q = input.trim();
    setInput("");
    const next = appendMessage("user", q, messages);
    setMessages(next);

    // Detect intent
    const intent = detectIntent(q, context);
    if (intent && intent.actionId !== "ask-financial") {
      setGenerating("chat");
      try {
        const result = await runAction(intent.actionId, { data, today, role, contractId: context.contractId, brandId: context.brandId });
        const m2 = appendMessage("assistant", result.content, next);
        setMessages(m2);
      } catch(e) {
        const m2 = appendMessage("assistant", `Erro: ${String(e)}`, next);
        setMessages(m2);
      }
      setGenerating(null);
      return;
    }

    // Default: financial chat or general
    setGenerating("chat");
    try {
      const result = await runAction("ask-financial", { data, today, role, question: q, history: messages.map(m=>({role:m.role,content:m.text})) });
      const reply = result.type === "chat_ready" ? "Pode perguntar à vontade sobre suas finanças!" : result.content;
      const m2 = appendMessage("assistant", reply, next);
      setMessages(m2);
    } catch(e) {
      const m2 = appendMessage("assistant", `Erro: ${String(e)}`, next);
      setMessages(m2);
    }
    setGenerating(null);
  };

  const saveReport = (result, title) => {
    const rep = {
      id: "rep_" + Math.random().toString(36).substr(2,8),
      title: title || result.title || "Relatório",
      contextLabel: view,
      actionId: result.actionId || "",
      contentMarkdown: result.content,
      createdAt: new Date().toISOString(),
      pinned: false,
    };
    const next = [rep, ...reports].slice(0, 100);
    setReports(next);
    try { localStorage.setItem("copilot_reports_v1", JSON.stringify(next)); } catch {}
  };

  const deleteReport = (id) => {
    const next = reports.filter(r => r.id !== id);
    setReports(next);
    try { localStorage.setItem("copilot_reports_v1", JSON.stringify(next)); } catch {}
  };

  const copyToClipboard = (text) => {
    navigator.clipboard?.writeText(text).catch(() => {});
  };

  const openWhatsApp = (text) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  const VIEW_LABELS = {
    dashboard:"Dashboard", acompanhamento:"Produção", contratos:"Contratos",
    marcas:"Marcas", financeiro:"Financeiro", caixa:"Caixa",
    "marca-detalhe":"Detalhe da Marca",
  };
  const contextLabel = context.contractId
    ? `Contrato · ${contracts.find(c=>c.id===context.contractId)?.company||""}`
    : context.brandId
    ? `Marca · ${brands.find(b=>b.id===context.brandId)?.name||""}`
    : VIEW_LABELS[view] || view;

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop on mobile */}
      {isMobile && (
        <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.35)", zIndex:179 }}/>
      )}

      {/* Panel */}
      <div style={{
        position:"fixed", top:0, right:0, bottom:0,
        width: isMobile ? "100%" : 420,
        background:B1,
        boxShadow:"-8px 0 32px rgba(15,23,42,0.10)",
        zIndex: 180,
        display:"flex", flexDirection:"column",
        animation:"copilot-slide-in .2s ease-out",
      }}>
        {/* Header */}
        <div style={{ padding:"16px 20px 12px", borderBottom:`1px solid ${LN}`, flexShrink:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:4 }}>
            <DsIcon name="sparkles" size={16} color={COPILOT_PURPLE}/>
            <span style={{ fontSize:14, fontWeight:ds.font.weight.semibold, color:COPILOT_PURPLE, letterSpacing:"-.01em" }}>Copiloto Ranked</span>
            <div style={{ flex:1 }}/>
            <DsIconButton size="sm" variant="ghost" ariaLabel="Fechar copiloto" onClick={onClose}
              icon={<DsIcon name="x" size={15} color={ds.color.neutral[500]}/>}/>
          </div>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginLeft:28 }}>Contexto: {contextLabel}</div>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", borderBottom:`1px solid ${LN}`, flexShrink:0 }}>
          {[["suggestions","Sugestões"],["conversa","Conversa"],["relatorios","Relatórios"]].map(([id,label]) => (
            <button key={id} onClick={()=>setTab(id)}
              style={{ flex:1, padding:"9px 4px", fontSize:11, fontWeight:tab===id?700:400, color:tab===id?COPILOT_PURPLE:TX2, background:"none", border:"none", borderBottom:`2px solid ${tab===id?COPILOT_PURPLE:"transparent"}`, cursor:"pointer", transition:TRANS, fontFamily:"inherit" }}>
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex:1, overflowY:"auto", padding:"14px 16px" }}>

          {/* ── Sugestões ── */}
          {tab === "suggestions" && (
            <div>
              <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX3, marginBottom:12 }}>
                Sugestões para agora
              </div>

              {/* ── Metrics extraction card — always at top ── */}
              <div style={{ ...G, padding:"14px 16px", marginBottom:14, border:`1.5px dashed ${COPILOT_PURPLE}40` }}>
                {/* Hidden file input */}
                <input ref={fileRef} type="file" accept="image/*" style={{ display:"none" }} onChange={handleImageSelect}/>

                {mxState === "idle" && (
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:36,height:36,borderRadius:ds.radius.md,background:ds.color.neutral[100],display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}><DsIcon name="upload" size={18} color={ds.color.neutral[500]}/></div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:TX }}>Extrair métricas de print</div>
                      <div style={{ fontSize:11, color:TX2 }}>Instagram · TikTok · YouTube</div>
                    </div>
                    <button onClick={()=>fileRef.current?.click()}
                      style={{ padding:"5px 14px", fontSize:ds.font.size.xs, fontWeight:700, color:"#fff", background:COPILOT_PURPLE, border:"none", borderRadius:6, cursor:"pointer", fontFamily:"inherit", whiteSpace:"nowrap" }}>
                      Enviar print
                    </button>
                  </div>
                )}

                {mxState === "loading" && (
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    {mxImage && <img src={mxImage.url} style={{ width:48, height:72, objectFit:"cover", borderRadius:6 }} alt="print"/>}
                    <div>
                      <div style={{ fontSize:12, fontWeight:600, color:TX, marginBottom:4 }}>Analisando o print…</div>
                      <div style={{ fontSize:11, color:TX2 }}>Identificando plataforma e extraindo métricas…</div>
                      <div style={{ height:4, background:LN, borderRadius:2, marginTop:8, overflow:"hidden" }}>
                        <div style={{ height:"100%", width:"60%", background:COPILOT_PURPLE, borderRadius:2, animation:"copilot-slide-in .6s ease infinite alternate" }}/>
                      </div>
                    </div>
                  </div>
                )}

                {mxState === "error" && (
                  <div>
                    <div style={{ fontSize:11, color:ds.color.danger[500], fontWeight:600, marginBottom:8, display:"flex", alignItems:"center", gap:6 }}><DsIcon name="alertTriangle" size={13} color={ds.color.danger[500]}/>{mxError}</div>
                    <button onClick={()=>fileRef.current?.click()}
                      style={{ padding:"4px 12px", fontSize:ds.font.size.xs, fontWeight:700, color:COPILOT_PURPLE, background:"none", border:`1px solid ${COPILOT_PURPLE}`, borderRadius:6, cursor:"pointer", fontFamily:"inherit" }}>
                      Tentar outro print
                    </button>
                  </div>
                )}

                {mxState === "saved" && (
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                    <div>
                      <div style={{ fontSize:12, fontWeight:700, color:ds.color.success[500], display:"flex", alignItems:"center", gap:5 }}><DsIcon name="checkCircle" size={14} color={ds.color.success[500]}/>Métricas salvas!</div>
                      <div style={{ fontSize:11, color:TX2 }}>
                        {mxResult?.platform} → {deliverables.find(d=>d.id===mxDelivId)?.title||"entregável"}
                      </div>
                    </div>
                    <button onClick={resetMetrics}
                      style={{ padding:"4px 12px", fontSize:ds.font.size.xs, fontWeight:600, color:TX2, background:"none", border:`1px solid ${LN}`, borderRadius:6, cursor:"pointer", fontFamily:"inherit" }}>
                      Novo print
                    </button>
                  </div>
                )}

                {mxState === "preview" && mxResult && (
                  <div>
                    {/* Platform badge + image */}
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                      {mxImage && <img src={mxImage.url} style={{ width:40, height:60, objectFit:"cover", borderRadius:6, flexShrink:0 }} alt="print"/>}
                      <div>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:4 }}>
                          <DsIcon name={PLATFORM_ICON[mxResult.platform]||"info"} size={16} color={PLATFORM_COLOR[mxResult.platform]||COPILOT_PURPLE}/>
                          <span style={{ fontSize:11, fontWeight:700, padding:"2px 8px", borderRadius:99, background:`${PLATFORM_COLOR[mxResult.platform]||COPILOT_PURPLE}18`, color:PLATFORM_COLOR[mxResult.platform]||COPILOT_PURPLE }}>
                            {mxResult.platform}
                          </span>
                          <span style={{ fontSize:ds.font.size.xs, color:TX3 }}>
                            {mxResult.confidence==="high"?"✓ Alta confiança":mxResult.confidence==="medium"?"⚠ Confiança média":"⚠ Baixa confiança"}
                          </span>
                        </div>
                        {mxResult.notes && <div style={{ fontSize:ds.font.size.xs, color:TX2, lineHeight:1.4 }}>{mxResult.notes}</div>}
                      </div>
                    </div>

                    {/* Metrics table — editable */}
                    <div style={{ background:B2, borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
                      <div style={{ fontSize:ds.font.size.xs, fontWeight:700, color:TX3, textTransform:"uppercase", letterSpacing:".1em", marginBottom:8 }}>Métricas extraídas (edite se necessário)</div>
                      {(PLATFORM_FIELDS[mxResult.platform] || Object.keys(mxResult.metrics || {})).map(key => {
                        const raw = mxResult.metrics?.[key];
                        if (raw === null || raw === undefined) return null;
                        return (
                          <div key={key} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                            <div style={{ fontSize:11, color:TX2, flex:1, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                              {METRIC_LABELS[key] || key}
                            </div>
                            <input
                              type="number"
                              value={mxEdited[key] ?? ""}
                              onChange={e => setMxEdited(prev => ({ ...prev, [key]: e.target.value }))}
                              style={{ width:90, padding:"3px 7px", fontSize:11, fontWeight:600, color:TX, background:B1, border:`1px solid ${LN}`, borderRadius:6, fontFamily:"inherit", outline:"none", textAlign:"right" }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* Deliverable selector */}
                    <div style={{ marginBottom:10 }}>
                      <div style={{ fontSize:ds.font.size.xs, fontWeight:700, color:TX2, marginBottom:4 }}>Salvar em qual entregável?</div>
                      <select value={mxDelivId} onChange={e=>setMxDelivId(e.target.value)}
                        style={{ width:"100%", padding:"7px 10px", fontSize:11, background:B2, border:`1px solid ${LN}`, borderRadius:8, color:TX, fontFamily:"inherit", outline:"none" }}>
                        <option value="">— Selecione o entregável —</option>
                        {deliverables.filter(d=>d.title).map(d => {
                          const c = contracts.find(x=>x.id===d.contractId);
                          return <option key={d.id} value={d.id}>{d.title}{c?` · ${c.company}`:""}</option>;
                        })}
                      </select>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display:"flex", gap:8 }}>
                      <button onClick={handleSaveMetrics} disabled={!mxDelivId}
                        style={{ flex:1, padding:"8px 0", fontSize:11, fontWeight:700, color:"#fff", background:mxDelivId?GRN:"#94A3B8", border:"none", borderRadius:8, cursor:mxDelivId?"pointer":"not-allowed", fontFamily:"inherit" }}>
                        ✓ Confirmar e salvar
                      </button>
                      <button onClick={resetMetrics}
                        style={{ padding:"8px 12px", fontSize:11, color:TX2, background:"none", border:`1px solid ${LN}`, borderRadius:8, cursor:"pointer", fontFamily:"inherit" }}>
                        ✕
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {suggestions.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0", color:TX3, fontSize:12 }}>
                  Nenhuma sugestão disponível para esta tela.
                </div>
              )}
              {suggestions.filter(s => s.actionId !== "extract-metrics").map(s => {
                const result   = results[s.id];
                const isGen    = generating === s.id;
                const isHighlight = context.actionId && context.actionId === s.actionId;
                return (
                  <div key={s.id} style={{
                    ...G,
                    padding:"14px 16px",
                    marginBottom:10,
                    cursor:"pointer",
                    border: isHighlight ? `1.5px solid ${COPILOT_PURPLE}` : `1px solid ${LN}`,
                    transition:TRANS,
                  }}
                    onMouseEnter={e=>{ e.currentTarget.style.borderColor=COPILOT_PURPLE; }}
                    onMouseLeave={e=>{ e.currentTarget.style.borderColor=isHighlight?COPILOT_PURPLE:LN; }}>
                    <div style={{ display:"flex", alignItems:"flex-start", gap:10, marginBottom: result ? 10 : 0 }}>
                      <span style={{ fontSize:18, flexShrink:0 }}>{s.icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:12, fontWeight:700, color:TX, marginBottom:2 }}>{s.title}</div>
                        <div style={{ fontSize:11, color:TX2 }}>{s.description}</div>
                      </div>
                      {!result && (
                        <button onClick={()=>handleRunAction(s)} disabled={!!generating}
                          style={{ padding:"5px 12px", fontSize:ds.font.size.xs, fontWeight:700, color: isGen?"#fff":COPILOT_PURPLE, background: isGen?COPILOT_PURPLE:"none", border:`1.5px solid ${COPILOT_PURPLE}`, borderRadius:6, cursor:generating?"wait":"pointer", flexShrink:0, fontFamily:"inherit", whiteSpace:"nowrap", transition:TRANS }}>
                          {isGen ? "Gerando…" : "Gerar"}
                        </button>
                      )}
                    </div>

                    {result && (
                      <div>
                        <div style={{ background:B2, borderRadius:8, padding:"12px 14px", marginBottom:8, maxHeight:280, overflowY:"auto" }}>
                          {result.type === "whatsapp" ? (
                            <pre style={{ fontSize:11, color:TX, whiteSpace:"pre-wrap", fontFamily:"inherit", margin:0 }}>{result.content}</pre>
                          ) : (
                            <MarkdownText content={result.content}/>
                          )}
                        </div>
                        <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                          <button onClick={()=>copyToClipboard(result.content)}
                            style={{ padding:"4px 10px", fontSize:ds.font.size.xs, fontWeight:600, color:TX2, background:"none", border:`1px solid ${LN}`, borderRadius:6, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
                            <DsIcon name="copy" size={11} color={ds.color.neutral[500]}/> Copiar
                          </button>
                          {result.type === "report" && (
                            <button onClick={()=>saveReport(result, s.title)}
                              style={{ padding:"4px 10px", fontSize:ds.font.size.xs, fontWeight:600, color:COPILOT_PURPLE, background:"none", border:`1px solid ${COPILOT_PURPLE}40`, borderRadius:6, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
                              <DsIcon name="save" size={11} color={COPILOT_PURPLE}/> Salvar
                            </button>
                          )}
                          {result.type === "whatsapp" && (
                            <button onClick={()=>openWhatsApp(result.content)}
                              style={{ padding:"4px 10px", fontSize:ds.font.size.xs, fontWeight:600, color:WA_DARK, background:"none", border:"1px solid rgba(37,211,102,.4)", borderRadius:6, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
                              <DsIcon name="phone" size={11} color={WA_DARK}/> WhatsApp
                            </button>
                          )}
                          <button onClick={()=>handleRunAction(s)} disabled={!!generating}
                            style={{ padding:"4px 10px", fontSize:ds.font.size.xs, fontWeight:600, color:TX3, background:"none", border:`1px solid ${LN}`, borderRadius:6, cursor:generating?"wait":"pointer", fontFamily:"inherit" }}>
                            ↺ Regenerar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Conversa ── */}
          {tab === "conversa" && (
            <div style={{ display:"flex", flexDirection:"column", height:"100%", minHeight:0 }}>
              <div ref={chatRef} style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:10, paddingBottom:4 }}>
                {messages.length === 0 && (
                  <div style={{ textAlign:"center", padding:"40px 0 20px" }}>
                    <div style={{ display:"inline-flex",alignItems:"center",justifyContent:"center",width:44,height:44,borderRadius:ds.radius.full,background:`${COPILOT_PURPLE}12`,marginBottom:10 }}><DsIcon name="sparkles" size={20} color={COPILOT_PURPLE}/></div>
                    <div style={{ fontSize:13, fontWeight:600, color:TX }}>Copiloto Ranked</div>
                    <div style={{ fontSize:11, color:TX2, marginTop:4 }}>Pergunte sobre contratos, entregas, finanças…</div>
                    <div style={{ display:"flex", flexWrap:"wrap", gap:6, justifyContent:"center", marginTop:14 }}>
                      {["Qual o status desta semana?","Resumo para WhatsApp","Tem algo atrasado?","Como está minha margem?"].map(q=>(
                        <div key={q} onClick={()=>setInput(q)}
                          style={{ padding:"5px 12px", fontSize:ds.font.size.xs, background:B2, border:`1px solid ${LN}`, borderRadius:99, cursor:"pointer", color:TX2, transition:TRANS }}
                          onMouseEnter={e=>e.currentTarget.style.borderColor=COPILOT_PURPLE}
                          onMouseLeave={e=>e.currentTarget.style.borderColor=LN}>
                          {q}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((m,i) => (
                  <div key={m.id||i} style={{ display:"flex", gap:8, flexDirection:m.role==="user"?"row-reverse":"row", alignItems:"flex-start" }}>
                    <div style={{ width:26, height:26, borderRadius:"50%", background:m.role==="user"?COPILOT_PURPLE:`${COPILOT_PURPLE}18`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, flexShrink:0, color:m.role==="user"?"#fff":COPILOT_PURPLE, fontWeight:700 }}>
                      {m.role==="user"?"M":<DsIcon name="sparkles" size={11} color={COPILOT_PURPLE}/>}
                    </div>
                    <div style={{ maxWidth:"80%", padding:"9px 13px", borderRadius:m.role==="user"?"12px 12px 0 12px":"12px 12px 12px 0", background:m.role==="user"?COPILOT_PURPLE:B2, color:m.role==="user"?"#fff":TX, fontSize:12, lineHeight:1.6, whiteSpace:"pre-wrap" }}>
                      {m.text}
                    </div>
                  </div>
                ))}
                {generating === "chat" && (
                  <div style={{ display:"flex", gap:8, alignItems:"center" }}>
                    <div style={{ width:26, height:26, borderRadius:"50%", background:`${COPILOT_PURPLE}18`, display:"flex", alignItems:"center", justifyContent:"center", color:COPILOT_PURPLE }}><DsIcon name="sparkles" size={12} color={COPILOT_PURPLE}/></div>
                    <div style={{ padding:"9px 13px", borderRadius:"12px 12px 12px 0", background:B2, fontSize:12, color:TX2 }}>Pensando…</div>
                  </div>
                )}
              </div>
              <div style={{ display:"flex", gap:6, marginTop:10, padding:"10px 0 0", borderTop:`1px solid ${LN}`, flexShrink:0 }}>
                <DsIconButton size="sm" variant="ghost" ariaLabel="Limpar conversa" title="Limpar conversa"
                  onClick={()=>{ clearHistory(); setMessages([]); }}
                  icon={<DsIcon name="trash" size={14} color={ds.color.neutral[400]}/>}/>
                <input ref={inputRef} value={input} onChange={e=>setInput(e.target.value)}
                  onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); handleSend(); }}}
                  placeholder="Pergunte alguma coisa… (Enter para enviar)"
                  style={{ flex:1, padding:"9px 12px", fontSize:12, background:B2, border:`1px solid ${LN}`, borderRadius:8, color:TX, fontFamily:"inherit", outline:"none", transition:TRANS }}
                  onFocus={e=>e.currentTarget.style.borderColor=COPILOT_PURPLE}
                  onBlur={e=>e.currentTarget.style.borderColor=LN}/>
                <button onClick={handleSend} disabled={!input.trim()||generating==="chat"}
                  style={{ padding:"8px 16px", background:COPILOT_PURPLE, border:"none", borderRadius:8, color:"#fff", fontSize:12, fontWeight:700, cursor:!input.trim()||generating==="chat"?"not-allowed":"pointer", opacity:!input.trim()||generating==="chat"?0.6:1, fontFamily:"inherit" }}>
                  →
                </button>
              </div>
            </div>
          )}

          {/* ── Relatórios ── */}
          {tab === "relatorios" && (
            <div>
              <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".12em", textTransform:"uppercase", color:TX3, marginBottom:12 }}>
                Relatórios salvos ({reports.length})
              </div>
              {reports.length === 0 && (
                <div style={{ textAlign:"center", padding:"40px 0", color:TX3, fontSize:12 }}>
                  Nenhum relatório salvo ainda.<br/>
                  <span style={{ fontSize:11 }}>Gere um relatório na aba Sugestões e clique em "Salvar".</span>
                </div>
              )}
              {reports.map(r => (
                <div key={r.id} style={{ ...G, padding:"12px 14px", marginBottom:8 }}>
                  <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:TX }}>{r.title}</div>
                      <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:2 }}>
                        {r.contextLabel} · {new Date(r.createdAt).toLocaleDateString("pt-BR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}
                      </div>
                    </div>
                    <DsIconButton size="sm" variant="ghost" ariaLabel="Remover relatório" onClick={()=>deleteReport(r.id)}
                      icon={<DsIcon name="x" size={13} color={ds.color.neutral[400]}/>}/>
                  </div>
                  <div style={{ background:B2, borderRadius:6, padding:"10px 12px", maxHeight:200, overflowY:"auto", marginBottom:8 }}>
                    <MarkdownText content={r.contentMarkdown}/>
                  </div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={()=>copyToClipboard(r.contentMarkdown)}
                      style={{ padding:"4px 10px", fontSize:ds.font.size.xs, fontWeight:600, color:TX2, background:"none", border:`1px solid ${LN}`, borderRadius:6, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", gap:4 }}>
                      <DsIcon name="copy" size={11} color={ds.color.neutral[500]}/> Copiar
                    </button>
                    <button onClick={()=>{
                      const blob = new Blob([r.contentMarkdown], {type:"text/markdown"});
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = `${r.title.replace(/[^a-z0-9]/gi,"_")}.md`;
                      a.click();
                    }}
                      style={{ padding:"4px 10px", fontSize:ds.font.size.xs, fontWeight:600, color:TX2, background:"none", border:`1px solid ${LN}`, borderRadius:6, cursor:"pointer", fontFamily:"inherit" }}>
                      <DsIcon name="download" size={11} color={ds.color.neutral[500]}/> .md
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sticky footer: WhatsApp shortcut */}
        {tab === "suggestions" && (
          <div style={{ padding:"10px 16px 14px", borderTop:`1px solid ${LN}`, flexShrink:0 }}>
            <button onClick={()=>{ const s=suggestions.find(x=>x.actionId==="whatsapp-daily"); if(s) handleRunAction(s); }}
              style={{ width:"100%", padding:"8px 0", fontSize:11, fontWeight:600, color:"#128C7E", background:"rgba(37,211,102,.06)", border:"1px solid rgba(37,211,102,.3)", borderRadius:8, cursor:"pointer", fontFamily:"inherit", display:"flex", alignItems:"center", justifyContent:"center", gap:7 }}>
              <DsIcon name="phone" size={13} color={WA_DARK}/> Resumo do dia para WhatsApp
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes copilot-slide-in {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

// ─── App Root ─────────────────────────────────────────────
// AppContent está DENTRO do FxProvider — pode chamar useFx() com segurança.
function AppContent() {
  const isMobile = useIsMobile();
  const [user, setUser]     = useState(undefined);
  const [role, setRole]     = useState("admin");
  const [userName, setUserName] = useState("");
  const [view, setView]     = useState("dashboard");
  const [contracts, setC]   = useState([]);
  const [posts, setP]       = useState([]);
  const [deliverables, setD] = useState([]);
  const [brands, setBrands] = useState([]);
  const [selectedBrand, setSelectedBrand] = useState(null); // id
  const [copilotOpen, setCopilotOpen]     = useState(false);
  const [copilotContext, setCopilotContext] = useState({});  // { actionId?, contractId?, brandId? }
  const [modal, setModal]   = useState(null);
  // FX rates now from useFx() / FxProvider — eurRate/usdRate removed
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
        const [cs,ps,ds,bs]=await Promise.all([loadContracts(),loadPosts(),loadDeliverables(),loadBrands()]);
        // Load role
        const userRole = USER_ROLES[user.email] || await getUserRole(user.email);
        setRole(userRole);
        setUserName(ROLE_NAMES[user.email] || user.email.split("@")[0]);
        const ic=cs.length>0?cs:SEED; const ip=ps.length>0?ps:SEED_POSTS; const id=ds||[]; const ib=bs||[];
        setC(ic); setP(ip); setD(id); setBrands(ib);
        prevCIds.current=ic.map(c=>c.id); prevPIds.current=ip.map(p=>p.id); prevDIds.current=id.map(d=>d.id);
        if(cs.length===0) await syncContracts(ic,[]);
        if(ps.length===0&&SEED_POSTS.length>0) await syncPosts(ip,[]);
        setSyncStatus("ok");
        // Run brand migration once — idempotent, guarded by localStorage flag
        runBrandsMigration({
          contracts: ic, brands: ib,
          saveBrands:    async b => { setBrands(b); await syncBrands(b, []); },
          saveContracts: async c => { setC(c);      await syncContracts(c, ic.map(x=>x.id)); },
          uid,
        }).catch(e => console.error('[brands] migration failed', e));
      } catch(err) { console.error(err); setSyncStatus("error"); setC(SEED); setP(SEED_POSTS); }
      try {
        unsub = subscribeToChanges({
          onContracts: cs  => { setC(cs);  prevCIds.current = cs.map(c => c.id); setSyncStatus("ok"); },
          onPosts:     ps  => { setP(ps);  prevPIds.current = ps.map(p => p.id); },
          onDeliverables: ds => { setD(ds); prevDIds.current = ds.map(d => d.id); },
          onSetting: (key, val) => {
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

  const saveBrands = useCallback(async b => {
    setBrands(b);
    try { await syncBrands(b, []); }
    catch(e) { console.error('[App] saveBrands', e); }
  }, []);

  const openCopilot = useCallback((ctx = {}) => {
    setCopilotContext(ctx);
    setCopilotOpen(true);
  }, []);

  // Save metrics from a screenshot extraction to a deliverable's networkMetrics
  const handleSaveMetrics = useCallback(async (deliverableId, platform, metrics) => {
    const updated = deliverables.map(d => {
      if (d.id !== deliverableId) return d;
      const existing = d.networkMetrics || {};
      const platformMetrics = { ...(existing[platform] || {}), ...metrics };
      return { ...d, networkMetrics: { ...existing, [platform]: platformMetrics } };
    });
    await saveD(updated);
  }, [deliverables, saveD]);
  const { ratesCompat: rates, fetchedAt: fxFetchedAt } = useFx();
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
      <div style={{ display:"flex", minHeight:"100vh", background:ds.color.neutral[50], fontFamily:ds.font.sans, fontSize:ds.font.size.base, color:ds.color.neutral[900] }}>
        {/* Globals CSS is imported via src/styles/globals.css → main.jsx */}
        {!isMobile && <Sidebar view={view} setView={setView} user={user} onSignOut={()=>signOut(auth)} onInvite={()=>setShowInvite(true)} onlineUsers={onlineUsers} contracts={contracts} role={role} userName={userName} deliverables={deliverables}/>}
        <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
          <TopBar view={view}
            onNewContract={()=>setModal({type:"contract",data:null})}
            onNewPost={()=>setModal({type:"post",data:null})}
            onNewTask={()=>setTriggerNewTask(true)}
            syncStatus={syncStatus} isMobile={isMobile} role={role} userName={userName}/>
          <div style={{ flex:1, overflowY:"auto", paddingBottom:isMobile?0:0 }}>
            <ViewRenderer view={view} contracts={contracts} posts={posts} deliverables={deliverables} stats={stats} rates={rates}
              saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid}
              toggleNF={toggleNF} setModal={setModal} setView={setView}
              saveC={saveC} saveP={saveP} saveD={saveD}
              calEvents={calEvents} calMonth={calMonth} setCal={setCal}
              calFilter={calFilter} setCalF={setCalF}
              triggerNewTask={triggerNewTask} setTriggerNewTask={setTriggerNewTask}
              role={role} userName={userName} syncStatus={syncStatus}
              brands={brands} saveBrands={saveBrands}
              selectedBrand={selectedBrand}
              setSelectedBrand={setSelectedBrand}
              openCopilot={openCopilot}/>
          </div>
        </div>
        {modal && (
          <div>
            {modal.type==="contract"&&<ContractModal modal={{...modal,saveDeliverables:saveD,existingDeliverables:deliverables}} setModal={setModal} contracts={contracts} saveC={saveC} brands={brands}/>}
            {modal.type==="post"    &&<PostModal modal={modal} setModal={setModal} contracts={contracts} posts={posts} saveP={saveP}/>}
          </div>
        )}
        {showInvite && <UserInviteModal onClose={()=>setShowInvite(false)}/>}
        {isMobile && <MobileNav view={view} setView={setView} role={role} userName={userName} deliverables={deliverables} contracts={contracts}/>}

        {/* ── Copiloto Ranked ── */}
        {!copilotOpen && (
          <CopilotButton onClick={()=>setCopilotOpen(true)} isMobile={isMobile}
            hasAlert={detectRiskSignals({deliverables,contracts},new Date()).some(s=>s.severity==="HIGH")}/>
        )}
        <CopilotPanel
          isOpen={copilotOpen}
          onClose={()=>{ setCopilotOpen(false); setCopilotContext({}); }}
          view={view}
          context={copilotContext}
          contracts={contracts}
          deliverables={deliverables}
          posts={posts}
          brands={brands}
          role={role}
          today={new Date()}
          signals={detectRiskSignals({deliverables,contracts},new Date())}
          onSaveMetrics={handleSaveMetrics}
        />
      </div>
    </ToastProvider>
  );
}

// App = FxProvider + AppContent.
// FxProvider DEVE ser pai de AppContent para que useFx() funcione.
export default function App() {
  const [uid, setUid] = useState(null);
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUid(u?.uid ?? null));
    return unsub;
  }, []);
  return (
    <FxProvider uid={uid}>
      <AppContent/>
    </FxProvider>
  );
}
