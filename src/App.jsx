import { useState, useEffect, useMemo, useRef, useCallback, createContext, useContext } from "react";
import {
  loadContracts, syncContracts,
  loadPosts, syncPosts,
  getSetting, setSetting,
  subscribeToChanges,
  updatePresence, removePresence, subscribeToPresence, getMyPresence,
} from "./db.js";
import {
  format, add, eachDayOfInterval, endOfMonth, endOfWeek,
  getDay, isEqual, isSameDay, isSameMonth, isToday,
  parse, startOfToday, startOfWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

const RED = "#C8102E";
const BLK = "#0F0F0F";
const MID = "#6A6A68";
const LN  = "#DDDCD8";
const SUF = "#EDECE8";
const WHT = "#F6F5F0";
const GRN = "#16A34A";
const AMB = "#D97706";

const CONTRACT_COLORS = [
  "#C8102E","#1D4ED8","#059669","#D97706","#7C3AED",
  "#0891B2","#BE185D","#92400E","#374151","#0F766E","#B45309"
];
const NETWORKS   = ["Instagram","TikTok","YouTube","X / Twitter","Facebook"];
const COMM_RATE  = 0.20;
const MONTHS_PT  = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                    "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SH  = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const VIEW_TYPES = new Set(["post","tiktok","repost"]);

const uid      = () => Math.random().toString(36).substr(2, 8);
const fmtDate  = s => { if (!s) return "—"; const [y,m,d] = s.split("-"); return `${d}/${m}/${y}`; };
const daysLeft = s => { if (!s) return null; return Math.ceil((new Date(s) - new Date()) / 864e5); };

function fmtMoney(v, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency", currency,
    minimumFractionDigits: 0, maximumFractionDigits: 0
  }).format(v || 0);
}

function monthsBetween(start, end) {
  if (!start || !end) return null;
  const s = new Date(start), e = new Date(end);
  return (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth()) + 1;
}

function getInstallments(c) {
  if (c.installments && c.installments.length > 0) return c.installments;
  const arr = [];
  if (c.parc1Deadline || c.parc1Value) arr.push({ value: Number(c.parc1Value)||0, date: c.parc1Deadline||"" });
  if (c.parc2Deadline || c.parc2Value) arr.push({ value: Number(c.parc2Value)||0, date: c.parc2Deadline||"" });
  return arr.length ? arr : [];
}

function contractTotal(c) {
  if (c.paymentType === "monthly") {
    const m = monthsBetween(c.contractStart, c.contractDeadline);
    return m ? (c.monthlyValue || 0) * m : 0;
  }
  if (c.paymentType === "split") {
    const inst = getInstallments(c);
    if (inst.length) return inst.reduce((s,i) => s + (Number(i.value)||0), 0);
  }
  return c.contractValue || 0;
}

function toBRL(value, currency, rates) {
  if (currency === "BRL" || !currency) return value;
  if (currency === "EUR") return rates.eur > 0 ? value * rates.eur : value;
  if (currency === "USD") return rates.usd > 0 ? value * rates.usd : value;
  return value;
}

function calcEngagement(p) {
  const i = (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
  if (!p.reach || p.reach === 0) return null;
  return i / p.reach * 100;
}

function postRepostCount(p) {
  if (p.type === "repost") return 1;
  const nets = (p.networks || []).length;
  return Math.max(0, nets - 1);
}

function getCommEntries(c) {
  if (!c.hasCommission) return [];
  const paid = c.commPaid || {};
  if (c.paymentType === "monthly") {
    if (!c.contractStart || !c.contractDeadline) return [];
    const entries = [];
    const s = new Date(c.contractStart), e = new Date(c.contractDeadline);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`;
      entries.push({ key, label: `${MONTHS_SH[cur.getMonth()]} ${cur.getFullYear()}`, amount: (c.monthlyValue || 0) * COMM_RATE, currency: c.currency, isPaid: !!paid[key] });
      cur.setMonth(cur.getMonth() + 1);
    }
    return entries;
  }
  if (c.paymentType === "split") {
    const ORDINALS = ["1ª","2ª","3ª","4ª","5ª","6ª"];
    return getInstallments(c).map((inst, i) => ({
      key: `parc${i+1}`, label: `${ORDINALS[i]||`${i+1}ª`} Parcela`,
      amount: (Number(inst.value)||0) * COMM_RATE, currency: c.currency,
      date: inst.date, isPaid: !!paid[`parc${i+1}`]
    }));
  }
  const total = contractTotal(c);
  return [{ key: "single", label: "Pagamento Único", amount: total * COMM_RATE, currency: c.currency, date: c.paymentDeadline, isPaid: !!paid["single"] }];
}

function getNFEntries(c) {
  const nf = c.nfEmitted || {};
  if (c.paymentType === "monthly") {
    if (!c.contractStart || !c.contractDeadline) return [];
    const entries = [];
    const s = new Date(c.contractStart), e = new Date(c.contractDeadline);
    const cur = new Date(s.getFullYear(), s.getMonth(), 1);
    while (cur <= e) {
      const key = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`;
      entries.push({ key, label: `NF ${MONTHS_SH[cur.getMonth()]} ${cur.getFullYear()}`, amount: c.monthlyValue || 0, currency: c.currency, isEmitted: !!nf[key] });
      cur.setMonth(cur.getMonth() + 1);
    }
    return entries;
  }
  if (c.paymentType === "split") {
    const ORDINALS = ["1ª","2ª","3ª","4ª","5ª","6ª"];
    return getInstallments(c).map((inst, i) => ({
      key: `parc${i+1}`, label: `NF ${ORDINALS[i]||`${i+1}ª`} Parcela`,
      amount: Number(inst.value)||0, currency: c.currency,
      date: inst.date, isEmitted: !!nf[`parc${i+1}`]
    }));
  }
  const total = contractTotal(c);
  return [{ key: "single", label: "NF Única", amount: total, currency: c.currency, date: c.paymentDeadline, isEmitted: !!nf["single"] }];
}

// localStorage only for auxiliary data (NF details, cronograma)
function lsLoad(k, fb) { try { const v = localStorage.getItem(k); return v != null ? JSON.parse(v) : fb; } catch { return fb; } }
function lsSave(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }

const SEED = [
  { id:"c0", company:"Netshoes", cnpj:"07.187.493/0001-07", color:"#B45309",
    contractValue:0, monthlyValue:30000, contractStart:"2026-06-01", currency:"BRL",
    contractDeadline:"2026-08-31", paymentType:"monthly",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:4, numStories:8, numCommunityLinks:2, numReposts:1,
    notes:"Embaixador chuteiras · R$30k/mês · jun–ago" },
  { id:"c1", company:"Play9 / GeTV", cnpj:"", color:"#C8102E",
    contractValue:200000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"2026-07-15", paymentType:"split",
    paymentDeadline:"", parc1Value:100000, parc1Deadline:"2026-06-01", parc2Value:100000, parc2Deadline:"2026-07-15",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"Viagem Copa do Mundo — Brazil House / GeTV" },
  { id:"c2", company:"FlashScore", cnpj:"", color:"#1D4ED8",
    contractValue:36000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"2026-07-31", paymentType:"single",
    paymentDeadline:"2026-07-31", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:8, numStories:13, numCommunityLinks:12, numReposts:1,
    notes:"8 reels + repost TikTok · 13 stories · 12 links (3x/mês)" },
  { id:"c3", company:"Coca-Cola", cnpj:"45.997.418/0001-53", color:"#DC2626",
    contractValue:100000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"2026-07-15", paymentType:"split",
    paymentDeadline:"", parc1Value:50000, parc1Deadline:"2026-06-15", parc2Value:50000, parc2Deadline:"2026-07-15",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:3, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"3 reels Copa — 1 já entregue" },
  { id:"c4", company:"Kabum!", cnpj:"", color:"#F97316",
    contractValue:0, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"Aguardando valores e escopo" },
  { id:"c5", company:"Tramontina", cnpj:"", color:"#0891B2",
    contractValue:98000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"Aguardando prazo e escopo" },
  { id:"c6", company:"Decolar", cnpj:"", color:"#059669",
    contractValue:14000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:1,
    notes:"1 TikTok" },
  { id:"c7", company:"Cacau Show", cnpj:"", color:"#92400E",
    contractValue:25000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:2, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"2 reels — 1 já entregue" },
  { id:"c8", company:"Paco Rabanne", cnpj:"", color:"#7C3AED",
    contractValue:2600, monthlyValue:0, contractStart:"", currency:"EUR",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:1, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"1 reel · pagamento em euros" },
  { id:"c9", company:"Diamond Filmes", cnpj:"", color:"#BE185D",
    contractValue:18000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{}, nfEmitted:{}, paymentDaysAfterNF:0,
    numPosts:1, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"1 reel" },
];

const SEED_POSTS = [
  { id:"p1", contractId:"c3", title:"Reel Coca-Cola — Copa 2026 #1", link:"",
    type:"post", plannedDate:"2026-06-05", publishDate:"", isPosted:false,
    views:0, reach:0, likes:0, comments:0, shares:0, saves:0, networks:["Instagram"] },
  { id:"p2", contractId:"c7", title:"Reel Cacau Show #1", link:"",
    type:"post", plannedDate:"2026-06-10", publishDate:"", isPosted:false,
    views:0, reach:0, likes:0, comments:0, shares:0, saves:0, networks:["Instagram"] },
];

// ─── Toast system ────────────────────────────────────────
const ToastContext = createContext(null);
export function useToast() { return useContext(ToastContext); }

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const add = useCallback((msg, type = "success") => {
    const id = Math.random().toString(36).substr(2, 6);
    setToasts(p => [...p, { id, msg, type }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3500);
  }, []);
  const ICONS = { success: "✓", error: "✕", info: "ℹ" };
  const COLORS = {
    success: "bg-brand-green text-white",
    error:   "bg-brand-red text-white",
    info:    "bg-secondary text-secondary-foreground",
  };
  return (
    <ToastContext.Provider value={add}>
      {children}
      <div className="fixed bottom-5 right-5 z-[300] flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id}
            className={`flex items-center gap-2.5 px-4 py-3 shadow-lg text-sm font-semibold min-w-[220px] max-w-[340px] animate-in slide-in-from-right-5 fade-in duration-200 ${COLORS[t.type]}`}>
            <span className="text-base leading-none">{ICONS[t.type]}</span>
            <span>{t.msg}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// ─── Helpers ──────────────────────────────────────────────
const cn = (...classes) => classes.filter(Boolean).join(" ");

function dlColor(d) {
  if (d == null) return "#0F0F0F";
  if (d <= 7) return "#C8102E";
  if (d <= 14) return "#D97706";
  return "#16A34A";
}
function dlTextClass(d) {
  if (d == null) return "text-foreground";
  if (d <= 7) return "text-brand-red font-bold";
  if (d <= 14) return "text-brand-amber";
  return "text-brand-green";
}
function currBadge(cur) {
  if (cur === "EUR") return <span className="badge-eur">EUR</span>;
  if (cur === "USD") return <span className="badge-usd">USD</span>;
  return null;
}

// ─── Shared components ────────────────────────────────────
function CommToggle({ on, onToggle, label }) {
  return (
    <div className="inline-flex items-center gap-1.5 cursor-pointer select-none"
      onClick={e => { e.stopPropagation(); onToggle(); }}>
      <div className={cn("relative w-[30px] h-4 rounded-full transition-colors duration-200", on ? "bg-brand-green" : "bg-muted-foreground/30")}>
        <div className={cn("toggle-thumb", on && "toggle-on")} />
      </div>
      {label && <span className={cn("text-2xs font-bold uppercase tracking-wide", on ? "text-brand-green" : "text-muted-foreground")}>
        {on ? "Comissão ativa" : "Sem comissão"}
      </span>}
    </div>
  );
}

function InlineNotes({ notes, onSave }) {
  const [val, setVal] = useState(notes || "");
  const [dirty, setDirty] = useState(false);
  const ta = useRef(null);
  useEffect(() => { setVal(notes || ""); }, [notes]);
  return (
    <textarea ref={ta} className="notes-area" value={val}
      rows={Math.max(1, Math.ceil((val.length || 1) / 52))}
      placeholder="Clique para adicionar observações…"
      onChange={e => { setVal(e.target.value); setDirty(true); }}
      onBlur={() => { if (dirty) { onSave(val); setDirty(false); } }}
      onKeyDown={e => { if (e.key === "Escape") { setVal(notes || ""); setDirty(false); ta.current?.blur(); } }}
    />
  );
}

// ─── App ──────────────────────────────────────────────────
export default function App() {
  const [view, setView]           = useState("dashboard");
  const [contracts, setC]         = useState([]);
  const [posts, setP]             = useState([]);
  const [modal, setModal]         = useState(null);
  const [eurRate, setEurRate]     = useState(0);
  const [usdRate, setUsdRate]     = useState(0);
  const [syncStatus, setSyncStatus] = useState("loading");
  const [calMonth, setCal]        = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [calFilter, setCalF]      = useState("all");
  const prevCIds = useRef([]);
  const prevPIds = useRef([]);

  useEffect(() => {
    let unsub = null;
    setSyncStatus("loading");
    (async () => {
      try {
        const [cs, ps, eur, usd] = await Promise.all([loadContracts(), loadPosts(), getSetting("eurRate"), getSetting("usdRate")]);
        const ic = cs.length > 0 ? cs : SEED;
        const ip = ps.length > 0 ? ps : SEED_POSTS;
        setC(ic); setP(ip);
        prevCIds.current = ic.map(c => c.id);
        prevPIds.current = ip.map(p => p.id);
        if (eur) setEurRate(Number(eur) || 0);
        if (usd) setUsdRate(Number(usd) || 0);
        if (cs.length === 0) await syncContracts(ic, []);
        if (ps.length === 0 && SEED_POSTS.length > 0) await syncPosts(ip, []);
        setSyncStatus("ok");
      } catch (err) {
        console.error("Firebase load error:", err);
        setSyncStatus("error");
        setC(SEED); setP(SEED_POSTS);
      }
      try {
        unsub = subscribeToChanges({
          onContracts: cs => { setC(cs); prevCIds.current = cs.map(c => c.id); setSyncStatus("ok"); },
          onPosts:     ps => { setP(ps); prevPIds.current = ps.map(p => p.id); },
          onSetting:   (key, val) => {
            if (key === "eurRate") setEurRate(Number(val) || 0);
            if (key === "usdRate") setUsdRate(Number(val) || 0);
          },
        });
      } catch (err) { console.warn("Realtime error:", err); }
    })();
    return () => unsub?.();
  }, []);

  const saveC = async d => {
    setC(d);
    try { await syncContracts(d, prevCIds.current); prevCIds.current = d.map(c => c.id); setSyncStatus("ok"); }
    catch(e) { console.error(e); setSyncStatus("error"); }
  };
  const saveP = async d => {
    setP(d);
    try { await syncPosts(d, prevPIds.current); prevPIds.current = d.map(p => p.id); }
    catch(e) { console.error(e); }
  };
  const rates        = useMemo(() => ({ eur: eurRate, usd: usdRate }), [eurRate, usdRate]);
  const saveNote     = async (id, notes) => saveC(contracts.map(c => c.id === id ? { ...c, notes } : c));
  const toggleComm   = async id          => saveC(contracts.map(c => c.id === id ? { ...c, hasCommission: !c.hasCommission } : c));
  const toggleCommPaid = async (cid, key) => saveC(contracts.map(c => {
    if (c.id !== cid) return c;
    const cp = { ...(c.commPaid || {}) }; cp[key] = !cp[key]; return { ...c, commPaid: cp };
  }));
  const toggleNF = async (cid, key) => saveC(contracts.map(c => {
    if (c.id !== cid) return c;
    const nf = { ...(c.nfEmitted || {}) }; nf[key] = !nf[key]; return { ...c, nfEmitted: nf };
  }));

  const stats = useMemo(() => {
    const totalBRL  = contracts.reduce((s,c) => s + toBRL(contractTotal(c), c.currency, rates), 0);
    const commBRL   = contracts.filter(c => c.hasCommission).reduce((s,c) => s + toBRL(contractTotal(c)*COMM_RATE, c.currency, rates), 0);
    const totEur    = contracts.filter(c => c.currency==="EUR").reduce((s,c) => s + contractTotal(c), 0);
    const totUsd    = contracts.filter(c => c.currency==="USD").reduce((s,c) => s + contractTotal(c), 0);
    const totBrlN   = contracts.filter(c => c.currency==="BRL").reduce((s,c) => s + contractTotal(c), 0);
    let commPaid=0, commPend=0;
    contracts.forEach(c => {
      if (!c.hasCommission) return;
      getCommEntries(c).forEach(e => {
        const v = toBRL(e.amount, c.currency, rates);
        e.isPaid ? commPaid+=v : commPend+=v;
      });
    });
    const tot = k => contracts.reduce((s,c) => s+c[k], 0);
    const del = t => posts.filter(p => p.type===t).length;
    const engs = posts.map(calcEngagement).filter(e => e!==null);
    return {
      totalBRL, commBRL, commPaidBRL:commPaid, commPendBRL:commPend,
      totEur, totUsd, totBrlNative:totBrlN,
      tp:tot("numPosts"), ts:tot("numStories"), tl:tot("numCommunityLinks"), tr:tot("numReposts"),
      dp:del("post"), ds:del("story"), dl:del("link"),
      dr:posts.reduce((s,p)=>s+postRepostCount(p),0),
      avgEng: engs.length ? engs.reduce((s,v)=>s+v,0)/engs.length : null,
      nfPending: contracts.reduce((s,c)=>s+getNFEntries(c).filter(e=>!e.isEmitted).length, 0),
    };
  }, [contracts, posts, rates]);

  const calEvents = useMemo(() => {
    const ev = {};
    const add = (ds,e) => { if(!ds) return; const k=ds.substr(0,10); if(!ev[k]) ev[k]=[]; ev[k].push(e); };
    contracts.forEach(c => {
      if (calFilter!=="all" && calFilter!==c.id) return;
      if (c.contractDeadline) add(c.contractDeadline, {label:`PRAZO · ${c.company}`, color:c.color});
      if (c.paymentType==="monthly" && c.contractStart) {
        const s=new Date(c.contractStart), e=new Date(c.contractDeadline||c.contractStart);
        const cur=new Date(s.getFullYear(),s.getMonth(),1);
        while(cur<=e) { add(cur.toISOString().substr(0,10),{label:`PGTO · ${c.company}`,color:c.color}); cur.setMonth(cur.getMonth()+1); }
      } else if (c.paymentType==="split") {
        const ORD=["1ª","2ª","3ª","4ª","5ª","6ª"];
        getInstallments(c).forEach((inst,i)=>{ if(inst.date) add(inst.date,{label:`${ORD[i]||`${i+1}ª`} PARC · ${c.company}`,color:c.color}); });
      } else if (c.paymentDeadline) add(c.paymentDeadline,{label:`PGTO · ${c.company}`,color:c.color});
    });
    posts.forEach(p => {
      const c=contracts.find(x=>x.id===p.contractId);
      if(!c) return;
      if(calFilter!=="all"&&calFilter!==c.id) return;
      add(p.isPosted?(p.publishDate||p.plannedDate):p.plannedDate, {label:(p.isPosted?"":"📅 ")+p.title,color:c.color});
    });
    try {
      const cronos=JSON.parse(localStorage.getItem("copa6_cron")||"{}");
      Object.entries(cronos).forEach(([cid,ms])=>{
        const c=contracts.find(x=>x.id===cid);
        if(!c) return;
        if(calFilter!=="all"&&calFilter!==c.id) return;
        (ms||[]).forEach(m=>{ if(m.date&&m.fase) add(m.date,{label:`${m.fase}${m.resp?` · ${m.resp}`:""}`,color:c.color,dashed:true}); });
      });
    } catch {}
    return ev;
  }, [contracts, posts, calFilter]);

  const today = new Date();
  const VIEWS = ["dashboard","contratos","posts","calendário"];

  // Online avatars component
  const OnlineAvatars = () => {
    const others = onlineUsers.filter(u => u.sessionId !== myPresence.sessionId);
    const all = [
      ...others,
      { ...myPresence, isMe: true },
    ];
    return (
      <div className="flex items-center -space-x-1.5">
        {all.slice(0, 5).map((u, i) => (
          <div key={u.sessionId || i}
            title={u.isMe ? `${u.name} (você)` : u.name}
            className="relative w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white border-2 border-secondary cursor-default select-none"
            style={{ background: u.color, zIndex: 10 - i }}>
            {u.name?.charAt(0).toUpperCase()}
            {u.isMe && <div className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-brand-green border border-secondary"/>}
          </div>
        ))}
      </div>
    );
  };

  const SyncDot = () => {
    const map = { loading:["#D97706","Sincronizando"], ok:["#16A34A","Ao Vivo"], error:["#C8102E","Offline"] };
    const [color, label] = map[syncStatus] || map.ok;
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 border" style={{borderColor:`${color}44`, background:`${color}10`}}>
        <div className="w-1.5 h-1.5 rounded-full" style={{background:color}}/>
        <span className="text-2xs font-bold uppercase tracking-widest" style={{color}}>{label}</span>
      </div>
    );
  };

  // ── Presence tracking ──
  const [onlineUsers, setOnlineUsers] = useState([]);
  const myPresence = useMemo(() => getMyPresence(), []);

  useEffect(() => {
    updatePresence();
    const interval = setInterval(updatePresence, 45_000);
    const unsubPresence = subscribeToPresence(setOnlineUsers);
    const handleUnload = () => removePresence();
    window.addEventListener("beforeunload", handleUnload);
    return () => {
      clearInterval(interval);
      unsubPresence();
      removePresence();
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, []);

  const toast = useToast();

  return (
    <ToastProvider>
    <div className="font-sans text-base text-foreground min-h-screen bg-background">
      {/* Nav */}
      <nav className="bg-secondary flex items-center h-12 px-5 border-b-2 border-brand-red sticky top-0 z-50">
        <div className="text-xs font-bold tracking-[.14em] uppercase text-secondary-foreground mr-5 whitespace-nowrap">
          COPA<span className="text-brand-red">2026</span>·OPS
        </div>
        {VIEWS.map(v => (
          <div key={v} onClick={()=>setView(v)}
            className={cn("px-3 h-12 flex items-center text-xs font-bold tracking-[.1em] uppercase cursor-pointer border-b-2 -mb-px transition-colors whitespace-nowrap",
              view===v ? "text-brand-red border-brand-red" : "text-secondary-foreground/40 border-transparent hover:text-secondary-foreground")}>
            {v}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {/* EUR */}
          <div className="flex items-center gap-1 bg-card/5 px-2 py-1 border border-white/10">
            <span className="text-2xs font-bold uppercase text-[#888] tracking-wide">€1=</span>
            <input className="w-14 bg-transparent border-none outline-none text-xs font-bold text-[#F6F5F0] text-right tabular-nums placeholder-[#444]"
              type="number" step="0.05" value={eurRate||""} placeholder="—"
              onChange={e=>setEurRate(Number(e.target.value)||0)}
              onBlur={e=>setSetting("eurRate",Number(e.target.value)||0).catch(console.warn)}/>
            <span className="text-2xs font-bold uppercase text-[#888] tracking-wide">R$</span>
          </div>
          {/* USD */}
          <div className="flex items-center gap-1 bg-card/5 px-2 py-1 border border-white/10">
            <span className="text-2xs font-bold uppercase text-[#888] tracking-wide">$1=</span>
            <input className="w-14 bg-transparent border-none outline-none text-xs font-bold text-[#F6F5F0] text-right tabular-nums placeholder-[#444]"
              type="number" step="0.05" value={usdRate||""} placeholder="—"
              onChange={e=>setUsdRate(Number(e.target.value)||0)}
              onBlur={e=>setSetting("usdRate",Number(e.target.value)||0).catch(console.warn)}/>
            <span className="text-2xs font-bold uppercase text-[#888] tracking-wide">R$</span>
          </div>
          <OnlineAvatars/>
          <SyncDot/>
          <span className="text-xs text-[#555] tracking-wide ml-1">{today.toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"})}</span>
        </div>
      </nav>

      {/* Page */}
      <div className="px-7 py-7 max-w-[1440px]">
        {view==="dashboard"  && <Dashboard  contracts={contracts} posts={posts} stats={stats} rates={rates} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} setModal={setModal}/>}
        {view==="contratos"  && <Contratos  contracts={contracts} posts={posts} saveC={saveC} setModal={setModal} toggleComm={toggleComm} saveNote={saveNote} rates={rates}/>}
        {view==="posts"      && <Posts      contracts={contracts} posts={posts} saveP={saveP} setModal={setModal} toast={toast}/>}
        {view==="calendário" && <Calendario contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>}
      </div>

      {/* Modal overlay */}
      {modal && (
        <div className="fixed inset-0 bg-black/55 z-[200] flex items-start justify-center p-10 overflow-y-auto"
          onClick={e=>{if(e.target===e.currentTarget)setModal(null);}}>
          {modal.type==="contract" && <ContractModal modal={modal} setModal={setModal} contracts={contracts} saveC={saveC}/>}
          {modal.type==="post"     && <PostModal     modal={modal} setModal={setModal} contracts={contracts} posts={posts} saveP={saveP} toast={toast}/>}
        </div>
      )}
    </div>
    </ToastProvider>
  );
}

// ─── KPI + Dashboard ──────────────────────────────────────
function Kpi({ label, value, sub, subClass="" }) {
  return (
    <div className="bg-card p-3.5">
      <div className="text-2xs font-bold uppercase tracking-[.11em] text-muted-foreground mb-1.5">{label}</div>
      <div className="text-2xl font-bold leading-none tabular-nums">{value}</div>
      {sub && <div className={cn("text-xs text-muted-foreground mt-1", subClass)}>{sub}</div>}
    </div>
  );
}

function Dashboard({ contracts, posts, stats, rates, saveNote, toggleComm, toggleCommPaid, toggleNF, setModal }) {
  return (
    <>
      <div className="flex items-center justify-between mb-5">
        <div className="text-xs font-bold tracking-[.16em] uppercase text-muted-foreground">VELOSO 2026 — OP</div>
        <button onClick={()=>setModal({type:"contract",data:null})}
          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-brand-red text-white border border-brand-red hover:bg-[#a00c24] transition-colors">
          + Novo Contrato
        </button>
      </div>

      {/* KPIs */}
      <div className="grid gap-px bg-border mb-5" style={{gridTemplateColumns:"repeat(auto-fit,minmax(128px,1fr))"}}>
        <Kpi label="Contratos" value={contracts.length} sub={`${contracts.filter(c=>c.paymentType==="monthly").length} mensais`}/>
        <Kpi label="Volume BRL" value={<span className="text-[13px]">{fmtMoney(stats.totalBRL)}</span>}
          sub={stats.totEur>0 ? (rates.eur===0 ? <span className="text-brand-amber">⚠ {fmtMoney(stats.totEur,"EUR")} sem cotação</span> : `+ ${fmtMoney(stats.totEur,"EUR")} ≈ ${fmtMoney(stats.totEur*rates.eur)}`) : null}/>
        <Kpi label="Comissão Total" value={<span className="text-[13px] text-brand-red">{fmtMoney(stats.commBRL)}</span>}
          sub={`${fmtMoney(stats.commPaidBRL)} recebido`}/>
        <Kpi label="Com. Pendente" value={<span className={cn("text-base", stats.commPendBRL>0?"text-brand-amber":"text-brand-green")}>{fmtMoney(stats.commPendBRL)}</span>}
          sub="a receber"/>
        <Kpi label="NF Pendentes" value={<span className={stats.nfPending>0?"text-brand-amber":"text-brand-green"}>{stats.nfPending}</span>}
          sub="não emitidas"/>
        <Kpi label="Posts/Reels" value={<span>{stats.dp}<span className="text-sm text-muted-foreground font-normal">/{stats.tp}</span></span>} sub="entregues"/>
        <Kpi label="Stories" value={<span>{stats.ds}<span className="text-sm text-muted-foreground font-normal">/{stats.ts}</span></span>} sub="entregues"/>
        <Kpi label="Engaj. Médio"
          value={<span className={cn("text-base", stats.avgEng!=null ? (stats.avgEng>=3?"text-brand-green":stats.avgEng>=1?"text-brand-amber":"text-muted-foreground") : "text-muted-foreground")}>
            {stats.avgEng!=null ? stats.avgEng.toFixed(2)+"%" : "—"}
          </span>}
          sub="auto" subClass="text-brand-green"/>
      </div>

      <ContractList contracts={contracts} posts={posts} rates={rates}
        saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF}/>
    </>
  );
}

// ─── ContractList accordion ───────────────────────────────
function ContractList({ contracts, posts, rates, saveNote, toggleComm, toggleCommPaid, toggleNF }) {
  const [open, setOpen]     = useState(null);
  const [nfDetails, setNfd] = useState(() => { try { return JSON.parse(localStorage.getItem("copa6_nfd")||"{}"); } catch { return {}; } });
  const [cronos, setCronos] = useState(() => { try { return JSON.parse(localStorage.getItem("copa6_cron")||"{}"); } catch { return {}; } });

  const saveNfd = (cid,key,field,val) => setNfd(prev => {
    const n={...prev,[cid]:{...(prev[cid]||{}),[key]:{...(prev[cid]?.[key]||{}),[field]:val}}};
    localStorage.setItem("copa6_nfd",JSON.stringify(n)); return n;
  });
  const saveCronos = (cid,arr) => setCronos(prev => {
    const n={...prev,[cid]:arr}; localStorage.setItem("copa6_cron",JSON.stringify(n)); return n;
  });
  const addMs    = cid => saveCronos(cid,[...(cronos[cid]||[]),{id:Math.random().toString(36).substr(2,6),fase:"",date:"",resp:"",status:"pendente",note:""}]);
  const updMs    = (cid,mid,field,val) => saveCronos(cid,(cronos[cid]||[]).map(m=>m.id===mid?{...m,[field]:val}:m));
  const delMs    = (cid,mid) => saveCronos(cid,(cronos[cid]||[]).filter(m=>m.id!==mid));
  const FASES    = ["Envio briefing","Envio roteiro","Aprovação roteiro","Gravação","Edição","Envio para aprovação","Aprovação final","Publicação Reel","Publicação TikTok","Publicação Stories","Publicação YouTube","Pagamento","NF emissão","Outro"];
  const ST_CLR   = {pendente:["#FAEEDA","#633806"],"em andamento":["#E6F1FB","#0C447C"],aprovado:["#EAF3DE","#27500A"],publicado:["#EEEDFE","#3C3489"],cancelado:["#FCEBEB","#791F1F"]};

  const nfStatus = c => {
    const e=getNFEntries(c); if(!e.length) return null;
    if(e.every(x=>x.isEmitted)) return "emitida";
    if(e.every(x=>!x.isEmitted)) return "nao";
    return "parcial";
  };

  const toggle = id => setOpen(p=>p===id?null:id);

  // Shared cell style for input/select inside panel
  const iStyle = "w-full px-2 py-1 border border-border font-sans text-sm bg-card outline-none focus:border-foreground";

  return (
    <div className="bg-card border border-border mb-3.5">
      {/* Header */}
      <div className="grid gap-0 border-b-2 border-border bg-muted"
        style={{gridTemplateColumns:"4px 1fr 150px 120px 1fr 140px 32px"}}>
        {["","EMPRESA","VALOR TOTAL","PRAZO","ENTREGAS","NOTA FISCAL",""].map((h,i)=>(
          <div key={i} className={cn("px-2.5 py-1.5 text-2xs font-bold uppercase tracking-[.1em] text-muted-foreground", i===2||i===3?"text-right":"text-left")}>{h}</div>
        ))}
      </div>

      {contracts.length===0 && <div className="py-10 text-center text-muted-foreground text-sm">Nenhum contrato cadastrado.</div>}

      {contracts.map(c => {
        const isOpen = open===c.id;
        const cp=posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
        const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
        const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link").length;
        const cr=posts.filter(p=>p.contractId===c.id).reduce((s,p)=>s+postRepostCount(p),0);
        const total=contractTotal(c);
        const dl=daysLeft(c.contractDeadline);
        const totDel=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
        const doneDel=cp+cs+cl+cr;
        const pct=totDel?Math.min(100,doneDel/totDel*100):0;
        const st=nfStatus(c);
        const nfEntries=getNFEntries(c);
        const commEntries=getCommEntries(c);
        const milestones=cronos[c.id]||[];

        const convNote=(v,cur)=>{ if(cur==="EUR"&&rates.eur>0) return ` ≈ ${fmtMoney(v*rates.eur)}`; if(cur==="USD"&&rates.usd>0) return ` ≈ ${fmtMoney(v*rates.usd)}`; return ""; };

        const NfPill=()=>{
          if(!nfEntries.length) return <span className="text-sm text-muted-foreground">—</span>;
          if(st==="emitida") return <span className="pill-done">✓ Emitida</span>;
          if(st==="parcial") return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide border cursor-pointer select-none" style={{borderColor:"#D9770644",background:"#D9770618",color:"#D97706"}}>Parcial</span>;
          return <span className="inline-flex items-center gap-1 px-2 py-0.5 text-2xs font-bold uppercase tracking-wide border cursor-pointer select-none" style={{borderColor:"#C8102E44",background:"#C8102E10",color:"#C8102E"}}>Não Emitida</span>;
        };

        return (
          <div key={c.id} className="border-b border-border">
            {/* Summary row */}
            <div className={cn("grid items-center cursor-pointer transition-colors", isOpen?"bg-muted":"bg-card hover:bg-muted/50")}
              style={{gridTemplateColumns:"4px 1fr 150px 120px 1fr 140px 32px"}}
              onClick={()=>toggle(c.id)}>
              <div style={{background:c.color}} className="self-stretch min-h-12"/>
              <div className="px-2.5 py-3 flex items-center gap-1.5 flex-wrap">
                <span className="font-bold text-base">{c.company}</span>
                {currBadge(c.currency)}
                {c.paymentType==="monthly"&&<span className="badge-monthly">Mensal</span>}
                {total===0&&<span className="badge-tbd">TBD</span>}
              </div>
              <div className="px-2.5 py-3 text-right">
                <div className="font-bold text-base tabular-nums">{total>0?fmtMoney(total,c.currency):"—"}</div>
                {total>0&&c.currency!=="BRL"&&<div className="text-xs text-muted-foreground">{convNote(total,c.currency)}</div>}
              </div>
              <div className="px-2.5 py-3 text-right">
                {c.contractDeadline
                  ?<><div className={cn("text-sm font-semibold", dlTextClass(dl))}>{fmtDate(c.contractDeadline)}</div><div className={cn("text-xs tabular-nums", dlTextClass(dl))}>{dl!=null?`${dl}d`:""}</div></>
                  :<span className="text-muted-foreground">—</span>}
              </div>
              <div className="px-2.5 py-3">
                {totDel>0
                  ?<><div className="h-[3px] bg-border mb-1"><div className="h-[3px] transition-all" style={{background:pct===100?"#16A34A":c.color,width:`${pct}%`}}/></div><div className="text-sm text-muted-foreground">{doneDel}/{totDel} entregas</div></>
                  :<span className="text-sm text-muted-foreground italic">A definir</span>}
              </div>
              <div className="px-2.5 py-3"><NfPill/></div>
              <div className="px-1.5 py-3 text-center text-sm text-muted-foreground">{isOpen?"▲":"›"}</div>
            </div>

            {/* Expanded panel */}
            {isOpen && (
              <div className="bg-[#FAFAF8] border-t border-border">
                {/* 3 cols */}
                <div className="grid border-b border-border" style={{gridTemplateColumns:"1fr 1fr 1fr"}}>
                  {/* Col 1: Entregas + financeiro */}
                  <div className="p-5 border-r border-border">
                    <div className="text-2xs font-bold uppercase tracking-[.12em] text-muted-foreground mb-3">Entregas</div>
                    {[{lbl:"Posts / Reels",done:cp,total:c.numPosts,color:c.color},{lbl:"Stories",done:cs,total:c.numStories,color:"#7C3AED"},{lbl:"Links Comun.",done:cl,total:c.numCommunityLinks,color:"#059669"},{lbl:"Reposts / TT",done:cr,total:c.numReposts,color:"#0891B2"}]
                      .filter(b=>b.total>0||b.done>0).map(b=>(
                        <div key={b.lbl} className="mb-2">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-semibold">{b.lbl}</span>
                            <span className={cn("tabular-nums", b.done>=b.total&&b.total>0?"text-brand-green font-bold":"")}>
                              {b.done}/{b.total}
                            </span>
                          </div>
                          <div className="h-[3px] bg-border"><div className="h-[3px]" style={{background:b.color,width:`${b.total?Math.min(100,b.done/b.total*100):b.done>0?100:0}%`}}/></div>
                        </div>
                      ))}
                    {c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts===0&&cp+cs+cl+cr===0&&<div className="text-sm text-muted-foreground italic mb-2">Escopo a definir</div>}
                    <div className="mt-3 pt-2.5 border-t border-border text-sm">
                      <div className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mb-1.5">Pagamento</div>
                      {c.paymentType==="monthly"&&<div className="text-muted-foreground">{fmtMoney(c.monthlyValue)}/mês · {monthsBetween(c.contractStart,c.contractDeadline)||"?"}m · {fmtDate(c.contractStart)} → {fmtDate(c.contractDeadline)}</div>}
                      {c.paymentType==="split"&&<div className="text-muted-foreground">{getInstallments(c).map((inst,i)=>{const O=["1ª","2ª","3ª","4ª","5ª","6ª"];return <span key={i}>{i>0?" · ":""}{O[i]||`${i+1}ª`} {fmtMoney(inst.value,c.currency)} {fmtDate(inst.date)}</span>;})}</div>}
                      {c.paymentType==="single"&&<div className="text-muted-foreground">{fmtDate(c.paymentDeadline)}</div>}
                    </div>
                    {Number(c.paymentDaysAfterNF)>0&&<div className="mt-2 flex items-center gap-1.5 text-sm"><span className="text-muted-foreground">Pgto:</span><span className="font-bold">{c.paymentDaysAfterNF} dias</span><span className="text-muted-foreground">após NF</span></div>}
                    <div className="mt-2.5"><CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/></div>
                    <InlineNotes notes={c.notes} onSave={v=>saveNote(c.id,v)}/>
                  </div>

                  {/* Col 2: Comissões */}
                  <div className="p-5 border-r border-border">
                    <div className="text-2xs font-bold uppercase tracking-[.12em] text-muted-foreground mb-3 flex justify-between">
                      <span>Comissões da Agência</span>
                      {commEntries.length>0&&<span className="text-brand-red">{fmtMoney(commEntries.reduce((s,e)=>s+e.amount,0),c.currency)}</span>}
                    </div>
                    {commEntries.length===0&&<div className="text-sm text-muted-foreground italic">Sem comissão neste contrato</div>}
                    {commEntries.map((e,i,arr)=>(
                      <div key={e.key} className={cn("flex items-center justify-between py-2 gap-2", i<arr.length-1?"border-b border-border":"")}>
                        <div>
                          <div className="text-sm font-semibold">{e.label}</div>
                          {e.date&&<div className="text-xs text-muted-foreground">{fmtDate(e.date)}</div>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-brand-red tabular-nums">{e.amount>0?fmtMoney(e.amount,e.currency):"—"}</span>
                          <div className={e.isPaid?"pill-done":"pill-pend"} onClick={()=>toggleCommPaid(c.id,e.key)}>{e.isPaid?"✓ Pago":"Pendente"}</div>
                        </div>
                      </div>
                    ))}
                    {commEntries.length>0&&(
                      <div className="mt-2.5 pt-2 border-t border-border flex justify-between text-sm">
                        <span className="text-muted-foreground">Recebido:</span>
                        <span className={cn("font-bold tabular-nums", commEntries.filter(e=>e.isPaid).length>0?"text-brand-green":"text-muted-foreground")}>
                          {fmtMoney(commEntries.filter(e=>e.isPaid).reduce((s,e)=>s+e.amount,0),c.currency)}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Col 3: NF */}
                  <div className="p-5">
                    <div className="text-2xs font-bold uppercase tracking-[.12em] text-muted-foreground mb-3">Nota Fiscal</div>
                    {nfEntries.length===0&&<div className="text-sm text-muted-foreground italic">Sem NF configurada</div>}
                    {nfEntries.map((e,i,arr)=>{
                      const det=nfDetails?.[c.id]?.[e.key]||{};
                      return (
                        <div key={e.key} className={cn(i<arr.length-1?"mb-4 pb-4 border-b border-border":"")}>
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-sm font-semibold">{e.label}</span>
                            {e.amount>0&&<span className="text-sm font-bold tabular-nums">{fmtMoney(e.amount,e.currency)}</span>}
                          </div>
                          <div className="mb-2">
                            <div className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Status</div>
                            <div className={cn(e.isEmitted?"pill-done":"pill-pend","w-full justify-center")} onClick={()=>toggleNF(c.id,e.key)}>{e.isEmitted?"✓ Emitida":"Não emitida"}</div>
                          </div>
                          <div className="mb-2">
                            <div className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Número da NF</div>
                            <input className={iStyle} placeholder="Ex: 1234" value={det.number||""} onChange={ev=>saveNfd(c.id,e.key,"number",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                          </div>
                          <div className="mb-2">
                            <div className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Data de Emissão</div>
                            <input type="date" className={iStyle} value={det.date||""} onChange={ev=>saveNfd(c.id,e.key,"date",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                          </div>
                          {Number(c.paymentDaysAfterNF)>0&&det.date&&(
                            <div className="mb-2 px-2 py-1.5" style={{background:"#16A34A10",border:"1px solid #16A34A33"}}>
                              <div className="text-2xs font-bold uppercase tracking-wide text-brand-green mb-0.5">Pgto previsto</div>
                              <div className="text-sm font-bold text-brand-green tabular-nums">{(()=>{const d=new Date(det.date);d.setDate(d.getDate()+Number(c.paymentDaysAfterNF));return fmtDate(d.toISOString().substr(0,10));})()}</div>
                              <div className="text-xs text-brand-green">+{c.paymentDaysAfterNF} dias após NF</div>
                            </div>
                          )}
                          <div>
                            <div className="text-2xs font-bold uppercase tracking-wide text-muted-foreground mb-1">Observações NF</div>
                            <textarea className={cn(iStyle,"resize-y min-h-[52px] text-xs")} placeholder="Competência, empresa tomadora, ISS…" value={det.notes||""} onChange={ev=>saveNfd(c.id,e.key,"notes",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Cronograma */}
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="text-2xs font-bold uppercase tracking-[.12em] text-muted-foreground">Cronograma de Campanha</div>
                    <button className="px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide border border-border bg-card hover:bg-muted transition-colors"
                      onClick={ev=>{ev.stopPropagation();addMs(c.id);}}>+ Fase</button>
                  </div>
                  {milestones.length===0
                    ? <div className="text-sm text-muted-foreground italic py-2">Nenhuma fase cadastrada — clique em "+ Fase" para montar o cronograma.</div>
                    : <div className="overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="border-b border-border">
                              {["Fase","Data","Responsável","Status","Observação",""].map((h,i)=>(
                                <th key={i} className="px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted-foreground whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {milestones.map(m=>{
                              const [bg,fg]=ST_CLR[m.status]||ST_CLR["pendente"];
                              const dl2=daysLeft(m.date);
                              return (
                                <tr key={m.id} className="border-b border-border">
                                  <td className="px-2 py-1.5 min-w-[160px]">
                                    <select value={m.fase} className={iStyle} onChange={e=>{e.stopPropagation();updMs(c.id,m.id,"fase",e.target.value);}} onClick={e=>e.stopPropagation()}>
                                      <option value="">Selecionar fase…</option>
                                      {FASES.map(f=><option key={f} value={f}>{f}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5 whitespace-nowrap">
                                    <input type="date" value={m.date} className={iStyle} onChange={e=>{e.stopPropagation();updMs(c.id,m.id,"date",e.target.value);}} onClick={e=>e.stopPropagation()}/>
                                    {m.date&&dl2!==null&&<div className="text-[9px] font-bold mt-0.5" style={{color:dlColor(dl2)}}>{dl2===0?"Hoje":dl2>0?`${dl2}d`:`${Math.abs(dl2)}d atrás`}</div>}
                                  </td>
                                  <td className="px-2 py-1.5 min-w-[120px]">
                                    <input value={m.resp} placeholder="ex: Matheus" className={iStyle} onChange={e=>{e.stopPropagation();updMs(c.id,m.id,"resp",e.target.value);}} onClick={e=>e.stopPropagation()}/>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <select value={m.status} className={iStyle} style={{background:bg,color:fg,fontWeight:700}} onChange={e=>{e.stopPropagation();updMs(c.id,m.id,"status",e.target.value);}} onClick={e=>e.stopPropagation()}>
                                      {Object.keys(ST_CLR).map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                                    </select>
                                  </td>
                                  <td className="px-2 py-1.5 min-w-[160px]">
                                    <input value={m.note} placeholder="Observação…" className={iStyle} onChange={e=>{e.stopPropagation();updMs(c.id,m.id,"note",e.target.value);}} onClick={e=>e.stopPropagation()}/>
                                  </td>
                                  <td className="px-1 py-1.5 text-center">
                                    <button className="px-2 py-0.5 text-xs text-brand-red hover:bg-muted transition-colors border-none bg-transparent cursor-pointer"
                                      onClick={e=>{e.stopPropagation();delMs(c.id,m.id);}}>×</button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                  }
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Contratos (table view) ───────────────────────────────
function Contratos({ contracts, posts, saveC, setModal, toggleComm, saveNote, rates }) {
  const del = async id => { if(confirm("Excluir este contrato?")) await saveC(contracts.filter(c=>c.id!==id)); };
  const iBase = "w-full px-2 py-1.5 border border-border font-sans text-sm bg-card outline-none focus:border-foreground";
  return (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="text-xs font-bold tracking-[.16em] uppercase text-muted-foreground">Contratos</div>
        <div className="flex-1 h-px bg-border"/>
        <button onClick={()=>setModal({type:"contract",data:null})}
          className="inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide bg-brand-red text-white border border-brand-red hover:bg-[#a00c24] transition-colors">
          + Novo Contrato
        </button>
      </div>
      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["","Empresa","Valor Total","Comissão","Pagamento","Prazo","Posts","Stories","Links","Reposts","Prog.","Observações",""].map((h,i)=>(
                <th key={i} className={cn("px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-[.09em] text-muted-foreground border-b-2 border-border whitespace-nowrap", i>=6&&i<=9?"text-right":"")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {contracts.map(c=>{
              const cp=posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
              const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
              const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link").length;
              const cr=posts.filter(p=>p.contractId===c.id).reduce((s,p)=>s+postRepostCount(p),0);
              const tot=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
              const don=cp+cs+cl+cr;
              const dl=daysLeft(c.contractDeadline);
              const total=contractTotal(c);
              const brlEq=c.currency!=="BRL"?toBRL(total,c.currency,rates):0;
              return (
                <tr key={c.id} className="border-b border-border hover:bg-muted/50 last:border-0">
                  <td className="px-2 py-2"><div className="w-2 h-2 rounded-full" style={{background:c.color}}/></td>
                  <td className="px-2 py-2 font-semibold">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {c.company}
                      {c.paymentType==="monthly"&&<span className="badge-monthly">Mensal</span>}
                      {currBadge(c.currency)}
                      {total===0&&<span className="badge-tbd">TBD</span>}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums">
                    <div>{total>0?fmtMoney(total,c.currency):"—"}</div>
                    {brlEq>0&&<div className="text-xs text-muted-foreground">≈ {fmtMoney(brlEq)}</div>}
                  </td>
                  <td className="px-2 py-2">
                    <div className="flex flex-col gap-1">
                      <CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/>
                      {c.hasCommission&&total>0&&<div className="text-xs text-brand-red font-bold tabular-nums">{fmtMoney(total*COMM_RATE,c.currency)}</div>}
                    </div>
                  </td>
                  <td className="px-2 py-2 text-sm">
                    {c.paymentType==="monthly"&&<div><span className="badge-monthly mr-1">Mensal</span>{fmtMoney(c.monthlyValue)}/mês</div>}
                    {c.paymentType==="split"&&<div className="leading-relaxed">{getInstallments(c).map((inst,i)=>{const O=["1ª","2ª","3ª","4ª","5ª","6ª"];return <div key={i}><b className="text-muted-foreground">{O[i]||`${i+1}ª`}</b> {inst.value>0?fmtMoney(inst.value,c.currency):"—"} · {fmtDate(inst.date)}</div>;})}</div>}
                    {c.paymentType==="single"&&fmtDate(c.paymentDeadline)}
                  </td>
                  <td className={cn("px-2 py-2", dlTextClass(dl))}>{fmtDate(c.contractDeadline)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{cp}/{c.numPosts}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{cs}/{c.numStories}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{cl}/{c.numCommunityLinks}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{cr}/{c.numReposts}</td>
                  <td className="px-2 py-2">
                    <div className="w-[72px] h-1 bg-muted"><div className="h-1" style={{background:c.color,width:`${tot?don/tot*100:0}%`}}/></div>
                    <div className="text-[9px] text-muted-foreground mt-0.5">{don}/{tot}</div>
                  </td>
                  <td className="px-2 py-2 max-w-[180px]"><InlineNotes notes={c.notes} onSave={v=>saveNote(c.id,v)}/></td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button className="px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-foreground hover:bg-muted border-none bg-transparent cursor-pointer tracking-wide" onClick={()=>setModal({type:"contract",data:c})}>editar</button>
                      <button className="px-2 py-1 text-[9px] font-bold uppercase text-brand-red hover:bg-muted border-none bg-transparent cursor-pointer" onClick={()=>del(c.id)}>×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {contracts.length===0&&<tr><td colSpan={13} className="py-10 text-center text-muted-foreground text-sm">Nenhum contrato.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Posts ────────────────────────────────────────────────
function Posts({ contracts, posts, saveP, setModal, toast }) {
  const [filter, setFilter] = useState("all");
  const filtered=[...(filter==="all"?posts:posts.filter(p=>p.contractId===filter))]
    .sort((a,b)=>new Date(b.publishDate||b.plannedDate||0)-new Date(a.publishDate||a.plannedDate||0));
  const del=async id=>{ if(confirm("Excluir?")) await saveP(posts.filter(p=>p.id!==id)); };
  const BADGE={post:"badge-post",story:"badge-story",link:"badge-link",repost:"badge-repost",tiktok:"badge-tiktok"};
  const LABEL={post:"Reel/Post",story:"Story",link:"Link",repost:"Repost",tiktok:"TikTok"};
  const engCls=e=>e==null?"text-muted-foreground":e>=3?"text-brand-green":e>=1?"text-brand-amber":"text-muted-foreground";
  return (
    <>
      <div className="flex items-center gap-2.5 mb-5">
        <div className="text-xs font-bold tracking-[.16em] uppercase text-muted-foreground">Posts & Entregas</div>
        <div className="flex-1 h-px bg-border"/>
        <button onClick={()=>setModal({type:"post",data:null})}
          className="inline-flex items-center px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide bg-brand-red text-white border border-brand-red hover:bg-[#a00c24] transition-colors">
          + Registrar
        </button>
      </div>
      <div className="flex gap-1.5 mb-4 flex-wrap">
        <div className={cn("inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide cursor-pointer border transition-colors", filter==="all"?"bg-secondary text-white border-foreground":"bg-card border-border text-muted-foreground hover:border-foreground")}
          onClick={()=>setFilter("all")}>Todos ({posts.length})</div>
        {contracts.map(c=>(
          <div key={c.id} className={cn("inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide cursor-pointer border transition-colors", filter===c.id?"bg-secondary text-white border-foreground":"bg-card border-border text-muted-foreground hover:border-foreground")}
            onClick={()=>setFilter(c.id)}>
            <div className="w-1.5 h-1.5 rounded-full" style={{background:c.color}}/>
            {c.company.split("/")[0].trim()}
          </div>
        ))}
      </div>
      <div className="bg-card border border-border overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {["Planejado","Status","Tipo","Título","Contrato","Redes","Views","Alcance","Curtidas","Coment.","Shares","Saves","Engaj.%","Link",""].map((h,i)=>(
                <th key={i} className={cn("px-2 py-1.5 text-left text-2xs font-bold uppercase tracking-wide text-muted-foreground border-b-2 border-border whitespace-nowrap", i>=6&&i<=13?"text-right":"")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p=>{
              const c=contracts.find(x=>x.id===p.contractId);
              const eng=calcEngagement(p);
              const rp=postRepostCount(p);
              return (
                <tr key={p.id} className="border-b border-border hover:bg-muted/50 last:border-0">
                  <td className="px-2 py-2 whitespace-nowrap tabular-nums">
                    <div>{fmtDate(p.plannedDate||p.publishDate)}</div>
                    {p.isPosted&&p.publishDate&&p.publishDate!==p.plannedDate&&<div className="text-[9px] text-muted-foreground">pub. {fmtDate(p.publishDate)}</div>}
                  </td>
                  <td className="px-2 py-2">
                    {p.isPosted
                      ?<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide" style={{background:"#16A34A18",border:"1px solid #16A34A44",color:"#16A34A"}}>✓ Publicado</span>
                      :<span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-muted border border-border text-muted-foreground">Planejado</span>}
                  </td>
                  <td className="px-2 py-2"><span className={BADGE[p.type]||"badge-post"}>{LABEL[p.type]||p.type}</span></td>
                  <td className="px-2 py-2 max-w-[180px] font-medium">
                    {p.title}
                    {rp>0&&<div className="text-[9px] text-blue-700 mt-0.5 font-bold">+{rp} repost{rp>1?"s":""}</div>}
                  </td>
                  <td className="px-2 py-2">{c&&<div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full" style={{background:c.color}}/><span className="text-xs">{c.company.split("/")[0].trim()}</span></div>}</td>
                  <td className="px-2 py-2 max-w-[130px]"><div className="flex flex-wrap gap-0.5">{(p.networks||[]).length>0?(p.networks||[]).map(n=><span key={n} className="inline-block px-1 py-0.5 text-[8px] font-bold bg-muted text-muted-foreground mr-0.5">{n}</span>):<span className="text-muted-foreground text-sm">—</span>}</div></td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(p.views||0).toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(p.reach||0).toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(p.likes||0).toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(p.comments||0).toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(p.shares||0).toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{Number(p.saves||0).toLocaleString("pt-BR")}</td>
                  <td className="px-2 py-2 text-right">
                    {eng!=null?<span className={cn("font-bold tabular-nums text-sm",engCls(eng))}>{eng.toFixed(2)}%<span className="text-[8px] font-bold uppercase tracking-wide text-brand-green ml-0.5">●</span></span>:<span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-2 py-2 text-right">{p.link?<a href={p.link} className="text-brand-red text-xs" target="_blank" rel="noreferrer">↗</a>:<span className="text-muted-foreground">—</span>}</td>
                  <td className="px-2 py-2">
                    <div className="flex gap-1">
                      <button className="px-2 py-1 text-[9px] font-bold uppercase text-muted-foreground hover:text-foreground hover:bg-muted border-none bg-transparent cursor-pointer tracking-wide" onClick={()=>setModal({type:"post",data:p})}>editar</button>
                      <button className="px-2 py-1 text-[9px] font-bold uppercase text-brand-red hover:bg-muted border-none bg-transparent cursor-pointer" onClick={()=>del(p.id)}>×</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length===0&&<tr><td colSpan={15} className="py-9 text-center text-muted-foreground text-sm">Nenhum post.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── FullScreen Calendário ───────────────────────────────
const colStartClasses = ["","col-start-2","col-start-3","col-start-4","col-start-5","col-start-6","col-start-7"];

function Calendario({ contracts, calEvents, calMonth, setCal, calFilter, setCalF }) {
  // Convert calEvents {dateStr: [{label,color,dashed}]} → date-fns compatible
  const calData = useMemo(() => {
    const map = {};
    Object.entries(calEvents).forEach(([ds, evs]) => {
      const day = new Date(ds + "T12:00:00");
      const key = ds;
      if (!map[key]) map[key] = { day, events: [] };
      evs.forEach((ev, i) => {
        map[key].events.push({
          id: `${ds}-${i}`,
          name: ev.label,
          time: "",
          datetime: ds,
          color: ev.color,
          dashed: ev.dashed,
        });
      });
    });
    return Object.values(map);
  }, [calEvents]);

  const today = startOfToday();
  const [selectedDay, setSelectedDay] = useState(today);

  // Sync calMonth with date-fns month state
  const currentMonthStr = `${String(calMonth.m + 1).padStart(2,"0")}-${calMonth.y}`;
  const firstDayCurrentMonth = parse(currentMonthStr, "MM-yyyy", new Date());

  const days = eachDayOfInterval({
    start: startOfWeek(firstDayCurrentMonth, { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(firstDayCurrentMonth), { weekStartsOn: 0 }),
  });

  const prev = () => setCal(p => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const next = () => setCal(p => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const goToday = () => setCal({ y: today.getFullYear(), m: today.getMonth() });

  const DAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
  const MONTHS_LONG = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex flex-col space-y-4 p-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div className="flex items-center gap-4">
          <div className="hidden md:flex flex-col items-center justify-center rounded-lg border bg-muted p-0.5 w-20">
            <span className="p-1 text-xs uppercase text-muted-foreground">{format(today, "MMM")}</span>
            <div className="flex w-full items-center justify-center rounded-lg border bg-card p-0.5 text-lg font-bold">
              {format(today, "d")}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">{MONTHS_LONG[calMonth.m]}, {calMonth.y}</h2>
            <p className="text-sm text-muted-foreground">
              {format(firstDayCurrentMonth, "d MMM")} — {format(endOfMonth(firstDayCurrentMonth), "d MMM, yyyy")}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-4 md:flex-row">
          {/* Filter chips */}
          <div className="flex gap-1.5 flex-wrap">
            <div className={cn("inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide cursor-pointer border transition-colors", calFilter==="all"?"bg-secondary text-secondary-foreground border-secondary":"bg-card border-border text-muted-foreground hover:border-foreground")}
              onClick={()=>setCalF("all")}>Todos</div>
            {contracts.map(c=>(
              <div key={c.id} className={cn("inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide cursor-pointer border transition-colors", calFilter===c.id?"bg-secondary text-secondary-foreground border-secondary":"bg-card border-border text-muted-foreground hover:border-foreground")}
                onClick={()=>setCalF(c.id)}>
                <div className="w-1.5 h-1.5 rounded-full" style={{background:c.color}}/>
                {c.company.split("/")[0].trim()}
              </div>
            ))}
          </div>

          {/* Nav buttons */}
          <div className="flex -space-x-px">
            <button onClick={prev} className="flex items-center justify-center w-9 h-9 border border-border bg-card hover:bg-muted transition-colors rounded-s-lg">
              <ChevronLeft size={16}/>
            </button>
            <button onClick={goToday} className="flex items-center justify-center px-4 h-9 border-y border-border bg-card hover:bg-muted transition-colors text-sm font-medium">
              Hoje
            </button>
            <button onClick={next} className="flex items-center justify-center w-9 h-9 border border-border bg-card hover:bg-muted transition-colors rounded-e-lg">
              <ChevronRight size={16}/>
            </button>
          </div>
        </div>
      </div>

      {/* Calendar grid */}
      <div className="flex flex-auto flex-col border rounded-lg overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 border-b text-center text-xs font-semibold">
          {DAYS_SHORT.map((d,i) => (
            <div key={d} className={cn("py-2.5 text-muted-foreground", i < 6 ? "border-r border-border" : "")}>{d}</div>
          ))}
        </div>

        {/* Days */}
        <div className="grid grid-cols-7 flex-auto" style={{gridAutoRows:"minmax(100px,1fr)"}}>
          {days.map((day, dayIdx) => {
            const dayData = calData.filter(d => isSameDay(d.day, day));
            const allEvents = dayData.flatMap(d => d.events);
            const isSelected = isEqual(day, selectedDay);
            const isCurrentMonth = isSameMonth(day, firstDayCurrentMonth);
            return (
              <div key={dayIdx}
                onClick={() => setSelectedDay(day)}
                className={cn(
                  "relative flex flex-col border-b border-r border-border cursor-pointer hover:bg-muted/50 transition-colors",
                  dayIdx % 7 === 6 && "border-r-0",
                  !isCurrentMonth && "bg-muted/30",
                )}>
                <div className="flex items-center justify-between p-2">
                  <button className={cn(
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    isToday(day) && "bg-brand-red text-white",
                    isSelected && !isToday(day) && "bg-foreground text-background",
                    !isSelected && !isToday(day) && isCurrentMonth && "text-foreground hover:bg-muted",
                    !isCurrentMonth && "text-muted-foreground",
                  )}>
                    {format(day, "d")}
                  </button>
                </div>
                <div className="flex-1 px-1.5 pb-1.5 space-y-0.5 overflow-hidden">
                  {allEvents.slice(0, 3).map(ev => (
                    <div key={ev.id}
                      className={cn("flex flex-col rounded px-1.5 py-1 text-[9px] leading-tight border-l-2")}
                      style={{
                        borderLeftColor: ev.color,
                        background: ev.dashed ? "transparent" : ev.color + "18",
                        color: ev.color,
                        borderLeftStyle: ev.dashed ? "dashed" : "solid",
                        opacity: ev.dashed ? 0.8 : 1,
                      }}>
                      <span className="font-bold uppercase tracking-tight truncate">{ev.name}</span>
                      {ev.time && <span className="text-[8px] opacity-70">{ev.time}</span>}
                    </div>
                  ))}
                  {allEvents.length > 3 && (
                    <div className="text-[9px] text-muted-foreground font-medium px-1">+{allEvents.length - 3} mais</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected day detail */}
      {calData.filter(d => isSameDay(d.day, selectedDay)).flatMap(d => d.events).length > 0 && (
        <div className="mt-3 border border-border rounded-lg bg-card p-4">
          <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">
            {format(selectedDay, "EEEE, d 'de' MMMM", { locale: ptBR })}
          </div>
          <div className="space-y-2">
            {calData.filter(d => isSameDay(d.day, selectedDay)).flatMap(d => d.events).map(ev => (
              <div key={ev.id} className="flex items-center gap-3 p-2 rounded border-l-2"
                style={{ borderLeftColor: ev.color, background: ev.color + "10" }}>
                <div className="flex-1">
                  <div className="text-sm font-semibold" style={{ color: ev.color }}>{ev.name}</div>
                  {ev.time && <div className="text-xs text-muted-foreground">{ev.time}</div>}
                </div>
                {ev.dashed && <span className="text-[9px] font-bold uppercase tracking-wide text-muted-foreground border border-border px-1.5 py-0.5">Fase</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Modal base ───────────────────────────────────────────
function ModalShell({ title, onClose, children, footer }) {
  return (
    <div className="bg-card w-full max-w-[680px] flex-shrink-0">
      <div className="px-4.5 py-3 border-b-2 border-brand-red flex items-center justify-between" style={{padding:"13px 18px"}}>
        <span className="text-2xs font-bold uppercase tracking-[.14em]">{title}</span>
        <button className="border-none bg-transparent cursor-pointer text-muted-foreground hover:text-foreground text-base px-2 py-1" onClick={onClose}>✕</button>
      </div>
      <div style={{padding:"20px 18px"}}>{children}</div>
      <div className="border-t border-border flex justify-end gap-2" style={{padding:"13px 18px"}}>{footer}</div>
    </div>
  );
}

function SRule({ children }) {
  return (
    <div className="text-2xs font-bold uppercase tracking-[.14em] text-muted-foreground flex items-center gap-2.5 my-4">
      {children}<div className="flex-1 h-px bg-border"/>
    </div>
  );
}

function Field({ label, children, full=false }) {
  return (
    <div className={cn("flex flex-col gap-0.5", full&&"col-span-full")}>
      <label className="text-2xs font-bold uppercase tracking-[.12em] text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full px-2 py-1.5 border border-border font-sans text-base bg-card text-foreground outline-none focus:border-foreground";
const inpRo = "w-full px-2 py-1.5 border border-border font-sans text-base bg-muted text-brand-green font-bold outline-none";
const inpRed = "w-full px-2 py-1.5 border border-border font-sans text-base bg-muted text-brand-red font-bold outline-none";

// ─── Contract Modal ───────────────────────────────────────
function ContractModal({ modal, setModal, contracts, saveC }) {
  const isEdit=!!modal.data;
  const [f,setF]=useState(modal.data||{
    company:"",cnpj:"",contractDeadline:"",contractValue:"",currency:"BRL",
    monthlyValue:"",contractStart:"",
    paymentType:"single",paymentDeadline:"",
    installments:modal.data?getInstallments(modal.data):[{value:"",date:""},{value:"",date:""}],
    parc1Value:"",parc1Deadline:"",parc2Value:"",parc2Deadline:"",
    hasCommission:true,commPaid:{},nfEmitted:{},paymentDaysAfterNF:0,
    numPosts:0,numStories:0,numCommunityLinks:0,numReposts:0,
    color:CONTRACT_COLORS[contracts.length%CONTRACT_COLORS.length],
    notes:""
  });
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const setInst=(i,field,val)=>setF(x=>{const inst=[...(x.installments||[])];inst[i]={...inst[i],[field]:val};return{...x,installments:inst};});
  const addInst=()=>setF(x=>({...x,installments:[...(x.installments||[]),{value:"",date:""}]}));
  const rmInst=i=>setF(x=>({...x,installments:(x.installments||[]).filter((_,j)=>j!==i)}));
  const months=f.paymentType==="monthly"?monthsBetween(f.contractStart,f.contractDeadline):null;
  const liveTotal=f.paymentType==="monthly"?(months?(Number(f.monthlyValue)||0)*months:0):f.paymentType==="split"?(f.installments||[]).reduce((s,i)=>s+(Number(i.value)||0),0):Number(f.contractValue)||0;
  const handleSave=async()=>{
    if(!f.company) return alert("Preencha o nome da empresa.");
    const entry={...f,id:f.id||uid(),
      contractValue:f.paymentType==="monthly"?0:Number(f.contractValue)||0,
      monthlyValue:Number(f.monthlyValue)||0,
      numPosts:Number(f.numPosts)||0,numStories:Number(f.numStories)||0,
      numCommunityLinks:Number(f.numCommunityLinks)||0,numReposts:Number(f.numReposts)||0,
      installments:f.paymentType==="split"?(f.installments||[]).map(i=>({value:Number(i.value)||0,date:i.date||""})):[],
      parc1Value:0,parc2Value:0,parc1Deadline:"",parc2Deadline:"",
      commPaid:f.commPaid||{},nfEmitted:f.nfEmitted||{},
      paymentDaysAfterNF:Number(f.paymentDaysAfterNF)||0};
    if(isEdit) await saveC(contracts.map(c=>c.id===entry.id?entry:c));
    else await saveC([...contracts,entry]);
    setModal(null);
  };
  const ORDINALS=["1ª","2ª","3ª","4ª","5ª","6ª"];
  return (
    <ModalShell title={isEdit?"Editar Contrato":"Novo Contrato"} onClose={()=>setModal(null)}
      footer={<>
        <button className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide border border-border bg-card hover:bg-muted transition-colors" onClick={()=>setModal(null)}>Cancelar</button>
        <button className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-brand-red text-white border border-brand-red hover:bg-[#a00c24] transition-colors" onClick={handleSave}>{isEdit?"Salvar Alterações":"Criar Contrato"}</button>
      </>}>
      <SRule>Empresa</SRule>
      <div className="grid grid-cols-2 gap-3 mb-0">
        <Field label="Nome da Empresa / Marca" full><input className={inp} value={f.company} onChange={e=>set("company",e.target.value)} placeholder="ex: Netshoes"/></Field>
        <Field label="CNPJ"><input className={inp} value={f.cnpj} onChange={e=>set("cnpj",e.target.value)} placeholder="00.000.000/0001-00"/></Field>
        <Field label="Cor"><input type="color" value={f.color} onChange={e=>set("color",e.target.value)} className="h-9 w-full p-0.5 border border-border cursor-pointer"/></Field>
        <Field label="Observações" full><textarea className={cn(inp,"resize-y min-h-[52px] text-sm")} value={f.notes} onChange={e=>set("notes",e.target.value)} placeholder="ex: 3 reels Copa…"/></Field>
      </div>

      <SRule>Financeiro & Pagamento</SRule>
      <div className="flex border border-border overflow-hidden w-fit mb-3">
        {[["single","Único"],["split","Parcelas"],["monthly","Mensal"]].map(([v,lbl])=>(
          <div key={v} className={cn("px-3.5 py-1.5 text-[9px] font-bold uppercase tracking-wide cursor-pointer whitespace-nowrap", f.paymentType===v?"bg-secondary text-white":"bg-card text-muted-foreground hover:bg-muted")}
            onClick={()=>set("paymentType",v)}>{lbl}</div>
        ))}
      </div>

      {f.paymentType==="monthly"?(
        <div className="grid grid-cols-3 gap-3">
          <Field label="Valor Mensal"><input type="number" className={inp} value={f.monthlyValue} onChange={e=>set("monthlyValue",e.target.value)} placeholder="0"/></Field>
          <Field label="Moeda"><select className={inp} value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></Field>
          <Field label={<div className="flex items-center gap-2">Comissão 20%<CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)}/></div>}>
            <input readOnly className={f.hasCommission?inpRed:inpRo} value={f.hasCommission&&Number(f.monthlyValue)>0?`${fmtMoney(Number(f.monthlyValue)*COMM_RATE,f.currency)}/mês`:"Desativada"}/>
          </Field>
          <Field label="Início"><input type="date" className={inp} value={f.contractStart} onChange={e=>set("contractStart",e.target.value)}/></Field>
          <Field label="Término"><input type="date" className={inp} value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></Field>
          <Field label="Total Calculado"><input readOnly className={inpRo} value={liveTotal>0&&months?`${months}m = ${fmtMoney(liveTotal,f.currency)}`:"—"}/></Field>
        </div>
      ):f.paymentType==="split"?(
        <>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <Field label="Moeda"><select className={inp} value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></Field>
            <Field label={<div className="flex items-center gap-2">Comissão 20%<CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)}/></div>}>
              <input readOnly className={f.hasCommission?inpRed:inpRo} value={f.hasCommission&&liveTotal>0?fmtMoney(liveTotal*COMM_RATE,f.currency):"Desativada"}/>
            </Field>
            <Field label="Total Calculado"><input readOnly className={inpRo} value={liveTotal>0?fmtMoney(liveTotal,f.currency):"—"}/></Field>
          </div>
          {(f.installments||[]).map((inst,i)=>(
            <div key={i} className="grid gap-2 mb-2" style={{gridTemplateColumns:"1fr 1fr 32px", alignItems:"end"}}>
              <Field label={`${ORDINALS[i]||`${i+1}ª`} Parcela — Valor`}><input type="number" className={inp} placeholder="0" value={inst.value} onChange={e=>setInst(i,"value",e.target.value)}/></Field>
              <Field label={`${ORDINALS[i]||`${i+1}ª`} Parcela — Data`}><input type="date" className={inp} value={inst.date} onChange={e=>setInst(i,"date",e.target.value)}/></Field>
              <button className="self-end pb-0 px-2 py-2 text-brand-red hover:bg-muted border-none bg-transparent cursor-pointer text-base" onClick={()=>rmInst(i)} disabled={(f.installments||[]).length<=2}>×</button>
            </div>
          ))}
          <button className="mb-3 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide border border-border bg-card hover:bg-muted transition-colors" onClick={addInst}>+ Adicionar Parcela</button>
          <div className="grid grid-cols-2 gap-3 mt-1">
            <Field label="Prazo Final do Contrato"><input type="date" className={inp} value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></Field>
          </div>
        </>
      ):(
        <div className="grid grid-cols-3 gap-3">
          <Field label="Valor do Contrato"><input type="number" className={inp} value={f.contractValue} onChange={e=>set("contractValue",e.target.value)} placeholder="0"/></Field>
          <Field label="Moeda"><select className={inp} value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></Field>
          <Field label={<div className="flex items-center gap-2">Comissão 20%<CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)}/></div>}>
            <input readOnly className={f.hasCommission?inpRed:inpRo} value={f.hasCommission&&f.contractValue?fmtMoney(Number(f.contractValue)*COMM_RATE,f.currency):"Desativada"}/>
          </Field>
          <Field label="Data de Pagamento"><input type="date" className={inp} value={f.paymentDeadline} onChange={e=>set("paymentDeadline",e.target.value)}/></Field>
          <Field label="Prazo Final"><input type="date" className={inp} value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></Field>
        </div>
      )}

      <SRule>Condição de Pagamento</SRule>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Pgto após emissão da NF">
          <div className="flex items-center gap-2">
            <input type="number" min="0" max="365" className={cn(inp,"flex-1")} value={f.paymentDaysAfterNF||""} placeholder="Não se aplica" onChange={e=>set("paymentDaysAfterNF",e.target.value)}/>
            {Number(f.paymentDaysAfterNF)>0&&<span className="text-sm text-muted-foreground whitespace-nowrap">dias corridos</span>}
          </div>
          <span className="text-[9px] text-muted-foreground mt-0.5">Ex: 30 = pagamento 30 dias após NF</span>
        </Field>
      </div>

      <SRule>Entregas Contratadas</SRule>
      <div className="grid grid-cols-4 gap-3">
        {[["numPosts","Posts/Reels"],["numStories","Stories"],["numCommunityLinks","Links Comun."],["numReposts","Reposts/TikTok"]].map(([k,lbl])=>(
          <Field key={k} label={lbl}><input type="number" min="0" className={inp} value={f[k]} onChange={e=>set(k,e.target.value)}/></Field>
        ))}
      </div>
    </ModalShell>
  );
}

// ─── Post Modal ───────────────────────────────────────────
function PostModal({ modal, setModal, contracts, posts, saveP, toast }) {
  const isEdit=!!modal.data;
  const [f,setF]=useState(modal.data||{
    contractId:contracts[0]?.id||"",title:"",link:"",type:"post",
    plannedDate:new Date().toISOString().substr(0,10),
    publishDate:"",isPosted:false,
    views:"",reach:"",likes:"",comments:"",shares:"",saves:"",networks:[]
  });
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const toggleNet=n=>setF(x=>({...x,networks:(x.networks||[]).includes(n)?(x.networks||[]).filter(v=>v!==n):[...(x.networks||[]),n]}));
  const liveEng=useMemo(()=>calcEngagement({likes:Number(f.likes)||0,comments:Number(f.comments)||0,shares:Number(f.shares)||0,saves:Number(f.saves)||0,reach:Number(f.reach)||0}),[f.likes,f.comments,f.shares,f.saves,f.reach]);
  const extraNets=Math.max(0,(f.networks||[]).length-1);
  const viewsLabel=VIEW_TYPES.has(f.type)?"Views / Reproduções":"Impressões";
  const handleSave=async()=>{
    if(!f.contractId||!f.title) return alert("Preencha contrato e título.");
    const entry={...f,id:f.id||uid(),
      views:Number(f.views)||0,reach:Number(f.reach)||0,
      likes:Number(f.likes)||0,comments:Number(f.comments)||0,
      shares:Number(f.shares)||0,saves:Number(f.saves)||0,
      networks:f.networks||[],
      plannedDate:f.plannedDate||"",publishDate:f.isPosted?(f.publishDate||f.plannedDate):"",
      isPosted:!!f.isPosted};
    if(isEdit) { await saveP(posts.map(p=>p.id===entry.id?entry:p)); toast?.("Post atualizado", "success"); }
    else { await saveP([...posts,entry]); toast?.(entry.isPosted?"✓ Post publicado registrado":"📅 Post planejado cadastrado", "success"); }
    setModal(null);
  };
  return (
    <ModalShell title={isEdit?"Editar Post":"Registrar Entrega"} onClose={()=>setModal(null)}
      footer={<>
        <button className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide border border-border bg-card hover:bg-muted transition-colors" onClick={()=>setModal(null)}>Cancelar</button>
        <button className="px-3.5 py-1.5 text-xs font-bold uppercase tracking-wide bg-brand-red text-white border border-brand-red hover:bg-[#a00c24] transition-colors" onClick={handleSave}>{isEdit?"Salvar Alterações":"Registrar"}</button>
      </>}>
      <SRule>Identificação</SRule>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contrato"><select className={inp} value={f.contractId} onChange={e=>set("contractId",e.target.value)}>{contracts.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</select></Field>
        <Field label="Tipo de Entrega">
          <select className={inp} value={f.type} onChange={e=>set("type",e.target.value)}>
            <option value="post">Reel / Post Feed</option>
            <option value="story">Story</option>
            <option value="link">Link Comunidade</option>
            <option value="repost">Repost</option>
            <option value="tiktok">TikTok</option>
          </select>
        </Field>
        <Field label="Título / Descrição" full><input className={inp} value={f.title} onChange={e=>set("title",e.target.value)} placeholder="ex: Reel Copa 2026 — Abertura"/></Field>
        <Field label="Data Planejada"><input type="date" className={inp} value={f.plannedDate} onChange={e=>set("plannedDate",e.target.value)}/></Field>
        <Field label="Status de Postagem">
          <div className="flex items-center gap-2.5 py-2">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input type="checkbox" checked={!!f.isPosted} onChange={e=>set("isPosted",e.target.checked)} className="w-4 h-4 cursor-pointer accent-brand-green"/>
              <span className={cn("text-sm font-semibold", f.isPosted?"text-brand-green":"text-muted-foreground")}>{f.isPosted?"✓ Publicado":"Não publicado ainda"}</span>
            </label>
          </div>
        </Field>
        {f.isPosted&&<Field label="Data Real de Publicação"><input type="date" className={inp} value={f.publishDate||f.plannedDate} onChange={e=>set("publishDate",e.target.value)}/></Field>}
        <Field label="Link do Post"><input className={inp} value={f.link} onChange={e=>set("link",e.target.value)} placeholder="https://instagram.com/reel/..."/></Field>
      </div>

      <SRule>Redes Sociais</SRule>
      <div className="flex flex-wrap gap-1.5 mt-2">
        {NETWORKS.map(n=>(
          <div key={n} className={cn("inline-flex items-center gap-1 px-2.5 py-1 text-[9px] font-bold uppercase tracking-wide cursor-pointer border transition-colors select-none", (f.networks||[]).includes(n)?"bg-secondary text-white border-foreground":"bg-card border-border text-muted-foreground hover:border-foreground")}
            onClick={()=>toggleNet(n)}>
            {(f.networks||[]).includes(n)&&<span className="text-[9px]">✓</span>}{n}
          </div>
        ))}
      </div>
      {extraNets>0&&<div className="text-xs font-bold text-blue-700 mt-1.5">✓ +{extraNets} repost{extraNets>1?"s":""} contabilizado{extraNets>1?"s":""} automaticamente ({(f.networks||[]).slice(1).join(", ")})</div>}

      <SRule>Métricas</SRule>
      <div className="grid grid-cols-3 gap-3">
        <Field label={viewsLabel}><input type="number" min="0" className={inp} value={f.views} onChange={e=>set("views",e.target.value)} placeholder="0"/></Field>
        {[["reach","Alcance"],["likes","Curtidas"],["comments","Comentários"],["shares","Compartilhamentos"],["saves","Saves"]].map(([k,lbl])=>(
          <Field key={k} label={lbl}><input type="number" min="0" className={inp} value={f[k]} onChange={e=>set(k,e.target.value)} placeholder="0"/></Field>
        ))}
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="flex-1">
          <div className="text-2xs font-bold uppercase tracking-[.12em] text-muted-foreground mb-1 flex items-center gap-1.5">
            Taxa de Engajamento <span className="text-[8px] font-bold uppercase tracking-wide text-brand-green">auto</span>
          </div>
          <div className="px-2 py-1.5 bg-muted border border-border text-base font-bold text-brand-green tabular-nums">
            {liveEng!=null?liveEng.toFixed(2)+"%":"— (preencha alcance e interações)"}
          </div>
        </div>
        <div className="text-xs text-muted-foreground max-w-[190px] leading-relaxed pt-4">(curtidas + coment. + shares + saves) ÷ alcance × 100</div>
      </div>
    </ModalShell>
  );
}

