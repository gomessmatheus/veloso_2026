import { useState, useEffect, useMemo, useRef } from "react";
import {
  loadContracts, syncContracts,
  loadPosts, syncPosts,
  getSetting, setSetting,
  subscribeToChanges,
} from "./db.js";

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

// ─── CSS ──────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body,#root{background:${WHT};min-height:100vh}
.app{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${BLK};min-height:100vh;background:${WHT}}
.nav{background:${BLK};display:flex;align-items:center;height:48px;padding:0 20px;border-bottom:2px solid ${RED};position:sticky;top:0;z-index:50}
.nav-logo{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#F6F5F0;margin-right:20px;white-space:nowrap}
.nav-logo span{color:${RED}}
.nav-tab{padding:0 13px;height:48px;display:flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s;white-space:nowrap}
.nav-tab:hover{color:#F6F5F0}
.nav-tab.act{color:${RED};border-bottom-color:${RED}}
.nav-right{margin-left:auto;display:flex;align-items:center;gap:8px}
.rate-widget{display:flex;align-items:center;gap:4px;background:rgba(255,255,255,.06);padding:3px 8px;border:1px solid rgba(255,255,255,.12)}
.rate-lbl{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:#888}
.rate-input{width:58px;background:transparent;border:none;outline:none;font-family:inherit;font-size:11px;font-weight:700;color:#F6F5F0;text-align:right;font-variant-numeric:tabular-nums}
.rate-input::placeholder{color:#444}
.nav-date{font-size:10px;color:#555;letter-spacing:.04em;white-space:nowrap;margin-left:4px}
.page{padding:28px;max-width:1440px}
.phd{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${MID};margin-bottom:20px;display:flex;align-items:center;gap:10px}
.rule{height:1px;background:${LN};flex:1}
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(128px,1fr));gap:1px;background:${LN};margin-bottom:20px}
.kpi{background:#fff;padding:14px 13px}
.kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:${MID};margin-bottom:6px}
.kpi-val{font-size:22px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:${BLK}}
.kpi-val.red{color:${RED}}
.kpi-val.sm{font-size:16px}
.kpi-val.xs{font-size:13px}
.kpi-sub{font-size:10px;color:${MID};margin-top:3px}
.kpi-sub.grn{color:${GRN}}
.blk{background:#fff;border:1px solid ${LN};margin-bottom:14px}
.blk-hd{padding:10px 14px;border-bottom:1px solid ${LN};display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
.blk-ttl{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MID}}
.blk-ttl-lg{font-size:13px;font-weight:600;color:${BLK}}
.blk-bd{padding:14px}
.prow{margin-bottom:10px}
.pmeta{display:flex;justify-content:space-between;margin-bottom:3px;font-size:11px}
.pbg{height:3px;background:${SUF}}
.pfill{height:3px;transition:width .4s}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${MID};padding:7px 8px;text-align:left;border-bottom:2px solid ${LN};white-space:nowrap}
.tbl td{padding:8px 8px;border-bottom:1px solid ${LN};vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:${SUF}}
.num{font-variant-numeric:tabular-nums;text-align:right}
.badge{display:inline-block;padding:2px 5px;font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.b-post{background:#FEF3C7;color:#92400E}
.b-story{background:#EDE9FE;color:#5B21B6}
.b-link{background:#D1FAE5;color:#065F46}
.b-repost{background:#DBEAFE;color:#1E40AF}
.b-tiktok{background:#FCE7F3;color:#9D174D}
.b-eur{background:#EEF2FF;color:#3730A3;font-size:9px;padding:1px 5px}
.b-usd{background:#ECFDF5;color:#065F46;font-size:9px;padding:1px 5px}
.b-tbd{background:${SUF};color:${MID}}
.b-monthly{background:transparent;color:${MID};border:1px solid ${LN};font-size:8px;padding:1px 5px;letter-spacing:.06em}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;border:1px solid ${LN};background:#fff;color:${BLK};transition:all .1s;font-family:inherit}
.btn:hover{background:${SUF}}
.btn.red{background:${RED};color:#fff;border-color:${RED}}
.btn.red:hover{background:#a00c24}
.btn.sm{padding:4px 9px;font-size:9px}
.btn.ghost{border:none;background:transparent;color:${MID};padding:4px 8px}
.btn.ghost:hover{color:${BLK};background:${SUF}}
.comm-toggle{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.toggle-track{width:30px;height:16px;border-radius:8px;background:${LN};position:relative;transition:background .2s;flex-shrink:0}
.toggle-track.on{background:${GRN}}
.toggle-thumb{width:12px;height:12px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:transform .2s}
.toggle-track.on .toggle-thumb{transform:translateX(14px)}
.toggle-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MID}}
.toggle-track.on + .toggle-lbl{color:${GRN}}
.status-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;border:1px solid;user-select:none;transition:all .15s}
.status-pill.done{background:${GRN}18;border-color:${GRN}44;color:${GRN}}
.status-pill.pend{background:${SUF};border-color:${LN};color:${MID}}
.status-pill.pend:hover{border-color:${GRN}44;color:${GRN}}
.notes-area{display:block;width:100%;padding:4px 8px;font-family:inherit;font-size:11px;font-style:italic;color:${MID};border:1px dashed transparent;background:transparent;resize:none;line-height:1.5;border-radius:0;outline:none;min-height:28px;border-left:2px solid ${LN};margin-top:6px}
.notes-area:hover{border-color:${LN};background:${SUF}}
.notes-area:focus{border-color:${BLK};background:#fff;font-style:normal;color:${BLK}}
.notes-area::placeholder{color:${MID};font-style:italic}
.net-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.net-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border:1px solid ${LN};background:#fff;color:${MID};user-select:none}
.net-chip.sel{background:${BLK};color:#fff;border-color:${BLK}}
.net-badge{display:inline-block;padding:1px 5px;font-size:8px;font-weight:700;background:${SUF};color:${MID};margin-right:2px}
.eng-pill{font-size:11px;font-variant-numeric:tabular-nums;font-weight:700}
.eng-pill.high{color:${GRN}}
.eng-pill.mid{color:${AMB}}
.eng-pill.low{color:${MID}}
.eng-auto{font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${GRN};margin-left:3px}
.dl-row{display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid ${LN}}
.dl-row:last-child{border-bottom:none}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
.modal{background:#fff;width:100%;max-width:680px;flex-shrink:0}
.modal-hd{padding:13px 18px;border-bottom:2px solid ${RED};display:flex;align-items:center;justify-content:space-between}
.modal-t{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.modal-bd{padding:20px 18px}
.modal-ft{padding:13px 18px;border-top:1px solid ${LN};display:flex;justify-content:flex-end;gap:8px}
.fgrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.fgrid.c3{grid-template-columns:1fr 1fr 1fr}
.fgrid.c4{grid-template-columns:1fr 1fr 1fr 1fr}
.fcol{grid-column:1/-1}
.field{display:flex;flex-direction:column;gap:3px}
.flbl{font-size:9px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${MID}}
.field input,.field select,.field textarea{padding:7px 9px;border:1px solid ${LN};font-family:inherit;font-size:13px;background:#fff;color:${BLK};outline:none;width:100%}
.field input:focus,.field select:focus,.field textarea:focus{border-color:${BLK}}
.field input[readonly]{background:${SUF};color:${GRN};font-weight:700}
.field input.red-ro{background:${SUF};color:${RED};font-weight:700}
.field textarea{resize:vertical;min-height:52px;font-size:12px}
.srule{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MID};margin:16px 0 12px;display:flex;align-items:center;gap:10px}
.srule::after{content:"";flex:1;height:1px;background:${LN}}
.ptoggle{display:flex;border:1px solid ${LN};overflow:hidden;width:fit-content;margin-bottom:12px}
.ptoggle-opt{padding:6px 14px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;color:${MID};background:#fff;white-space:nowrap}
.ptoggle-opt.act{background:${BLK};color:#fff}
.chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;border:1px solid ${LN};background:#fff;color:${MID}}
.chip.act{background:${BLK};color:#fff;border-color:${BLK}}
.cal-hd-row{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:${LN}}
.cal-hd-cell{background:#fff;text-align:center;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MID};padding:7px 0}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:${LN}}
.cal-day{background:#fff;min-height:80px;padding:5px}
.cal-empty{background:${SUF}}
.cal-today{outline:2px solid ${RED};outline-offset:-2px}
.cal-dnum{font-size:11px;font-weight:600;margin-bottom:3px}
.cal-ev{font-size:8px;font-weight:700;padding:2px 3px;margin-bottom:2px;border-left:3px solid;letter-spacing:.03em;text-transform:uppercase;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.metric-computed{padding:7px 9px;background:${SUF};border:1px solid ${LN};font-size:13px;font-weight:700;color:${GRN};font-variant-numeric:tabular-nums}
.sync-indicator{font-size:9px;padding:3px 8px;border-radius:3px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
@media(max-width:700px){.page{padding:14px}.fgrid,.fgrid.c3,.fgrid.c4{grid-template-columns:1fr 1fr}.rate-widget{display:none}}
`;

// ─── App ──────────────────────────────────────────────────
export default function App() {
  const [view, setView]       = useState("dashboard");
  const [contracts, setC]     = useState([]);
  const [posts, setP]         = useState([]);
  const [modal, setModal]     = useState(null);
  const [eurRate, setEurRate] = useState(0);
  const [usdRate, setUsdRate] = useState(0);
  const [syncStatus, setSyncStatus] = useState("loading"); // loading | ok | error
  const [calMonth, setCal]    = useState(() => { const n = new Date(); return { y: n.getFullYear(), m: n.getMonth() }; });
  const [calFilter, setCalF]  = useState("all");

  const prevCIds = useRef([]);
  const prevPIds = useRef([]);

  useEffect(() => {
    let unsub = null;
    setSyncStatus("loading");
    (async () => {
      try {
        const [cs, ps, eur, usd] = await Promise.all([
          loadContracts(),
          loadPosts(),
          getSetting("eurRate"),
          getSetting("usdRate"),
        ]);
        const initialContracts = cs.length > 0 ? cs : SEED;
        const initialPosts     = ps.length > 0 ? ps : SEED_POSTS;
        setC(initialContracts);
        setP(initialPosts);
        prevCIds.current = initialContracts.map(c => c.id);
        prevPIds.current = initialPosts.map(p => p.id);
        if (eur) setEurRate(Number(eur) || 0);
        if (usd) setUsdRate(Number(usd) || 0);

        // If we used seed data, push it to Firestore
        if (cs.length === 0) {
          await syncContracts(initialContracts, []);
        }
        if (ps.length === 0 && SEED_POSTS.length > 0) {
          await syncPosts(initialPosts, []);
        }

        setSyncStatus("ok");
      } catch (err) {
        console.error("Firebase load error:", err);
        setSyncStatus("error");
        // Fall back to seed so the app is usable
        setC(SEED);
        setP(SEED_POSTS);
      }

      // Real-time listener
      try {
        unsub = subscribeToChanges({
          onContracts: cs => { setC(cs); prevCIds.current = cs.map(c => c.id); setSyncStatus("ok"); },
          onPosts:     ps => { setP(ps); prevPIds.current = ps.map(p => p.id); },
          onSetting:   (key, val) => {
            if (key === "eurRate") setEurRate(Number(val) || 0);
            if (key === "usdRate") setUsdRate(Number(val) || 0);
          },
        });
      } catch (err) {
        console.warn("Realtime subscription error:", err);
      }
    })();
    return () => unsub?.();
  }, []);

  const saveC = async d => {
    setC(d);
    try {
      await syncContracts(d, prevCIds.current);
      prevCIds.current = d.map(c => c.id);
      setSyncStatus("ok");
    } catch(e) {
      console.error("syncContracts failed", e);
      setSyncStatus("error");
    }
  };

  const saveP = async d => {
    setP(d);
    try {
      await syncPosts(d, prevPIds.current);
      prevPIds.current = d.map(p => p.id);
    } catch(e) {
      console.error("syncPosts failed", e);
    }
  };

  const rates = useMemo(() => ({ eur: eurRate, usd: usdRate }), [eurRate, usdRate]);

  const saveNote       = async (id, notes)       => saveC(contracts.map(c => c.id === id ? { ...c, notes } : c));
  const toggleComm     = async id                => saveC(contracts.map(c => c.id === id ? { ...c, hasCommission: !c.hasCommission } : c));
  const toggleCommPaid = async (contractId, key) => saveC(contracts.map(c => {
    if (c.id !== contractId) return c;
    const commPaid = { ...(c.commPaid || {}) }; commPaid[key] = !commPaid[key]; return { ...c, commPaid };
  }));
  const toggleNF = async (contractId, key) => saveC(contracts.map(c => {
    if (c.id !== contractId) return c;
    const nfEmitted = { ...(c.nfEmitted || {}) }; nfEmitted[key] = !nfEmitted[key]; return { ...c, nfEmitted };
  }));

  const stats = useMemo(() => {
    const totalBRL = contracts.reduce((s, c) => s + toBRL(contractTotal(c), c.currency, rates), 0);
    const commBRL  = contracts.filter(c => c.hasCommission).reduce((s, c) => s + toBRL(contractTotal(c) * COMM_RATE, c.currency, rates), 0);
    const totEur = contracts.filter(c => c.currency === "EUR").reduce((s, c) => s + contractTotal(c), 0);
    const totUsd = contracts.filter(c => c.currency === "USD").reduce((s, c) => s + contractTotal(c), 0);
    const totBrlNative = contracts.filter(c => c.currency === "BRL").reduce((s, c) => s + contractTotal(c), 0);
    let commPaidBRL = 0, commPendBRL = 0;
    contracts.forEach(c => {
      if (!c.hasCommission) return;
      getCommEntries(c).forEach(e => {
        const v = toBRL(e.amount, c.currency, rates);
        e.isPaid ? commPaidBRL += v : commPendBRL += v;
      });
    });
    const tot = k => contracts.reduce((s, c) => s + c[k], 0);
    const del = t => posts.filter(p => p.type === t).length;
    const drDone = posts.reduce((s, p) => s + postRepostCount(p), 0);
    const engs = posts.map(calcEngagement).filter(e => e !== null);
    return {
      totalBRL, commBRL, commPaidBRL, commPendBRL,
      totEur, totUsd, totBrlNative,
      tp: tot("numPosts"), ts: tot("numStories"), tl: tot("numCommunityLinks"), tr: tot("numReposts"),
      dp: del("post"), ds: del("story"), dl: del("link"), dr: drDone,
      avgEng: engs.length ? engs.reduce((s, v) => s + v, 0) / engs.length : null,
      nfPending: contracts.reduce((s, c) => s + getNFEntries(c).filter(e => !e.isEmitted).length, 0),
    };
  }, [contracts, posts, rates]);

  const calEvents = useMemo(() => {
    const ev = {};
    const add = (ds, e) => { if (!ds) return; const k = ds.substr(0, 10); if (!ev[k]) ev[k] = []; ev[k].push(e); };
    contracts.forEach(c => {
      if (calFilter !== "all" && calFilter !== c.id) return;
      if (c.contractDeadline) add(c.contractDeadline, { label: `PRAZO · ${c.company}`, color: c.color });
      if (c.paymentType === "monthly" && c.contractStart) {
        const s = new Date(c.contractStart), e = new Date(c.contractDeadline || c.contractStart);
        const cur = new Date(s.getFullYear(), s.getMonth(), 1);
        while (cur <= e) { add(cur.toISOString().substr(0, 10), { label: `PGTO · ${c.company}`, color: c.color }); cur.setMonth(cur.getMonth() + 1); }
      } else if (c.paymentType === "split") {
        const ORDINALS = ["1ª","2ª","3ª","4ª","5ª","6ª"];
        getInstallments(c).forEach((inst, i) => {
          if (inst.date) add(inst.date, { label: `${ORDINALS[i]||`${i+1}ª`} PARC · ${c.company}`, color: c.color });
        });
      } else if (c.paymentDeadline) add(c.paymentDeadline, { label: `PGTO · ${c.company}`, color: c.color });
    });
    posts.forEach(p => {
      const c = contracts.find(x => x.id === p.contractId);
      if (!c) return;
      if (calFilter !== "all" && calFilter !== c.id) return;
      add(p.isPosted ? (p.publishDate||p.plannedDate) : p.plannedDate, { label: (p.isPosted?"":"📅 ")+p.title, color: c.color });
    });
    try {
      const cronos = JSON.parse(localStorage.getItem("copa6_cron") || "{}");
      Object.entries(cronos).forEach(([contractId, milestones]) => {
        const c = contracts.find(x => x.id === contractId);
        if (!c) return;
        if (calFilter !== "all" && calFilter !== c.id) return;
        (milestones || []).forEach(m => {
          if (!m.date || !m.fase) return;
          add(m.date, { label: `${m.fase}${m.resp ? ` · ${m.resp}` : ""}`, color: c.color, dashed: true });
        });
      });
    } catch {}
    return ev;
  }, [contracts, posts, calFilter]);

  const today = new Date();
  const VIEWS = ["dashboard", "contratos", "posts", "calendário"];

  const SyncDot = () => {
    if (syncStatus === "loading") return <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", border:"1px solid rgba(255,255,255,.15)", background:"rgba(255,255,255,.06)" }}><div style={{ width:6, height:6, borderRadius:"50%", background:AMB }} /><span style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:AMB }}>Sincronizando</span></div>;
    if (syncStatus === "error") return <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", border:"1px solid rgba(200,16,46,.35)", background:"rgba(200,16,46,.08)" }}><div style={{ width:6, height:6, borderRadius:"50%", background:RED }} /><span style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:RED }}>Offline</span></div>;
    return <div style={{ display:"flex", alignItems:"center", gap:5, padding:"3px 8px", border:"1px solid rgba(22,163,74,.35)", background:"rgba(22,163,74,.08)" }}><div style={{ width:6, height:6, borderRadius:"50%", background:GRN }} /><span style={{ fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:GRN }}>Ao Vivo</span></div>;
  };

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-logo">COPA<span>2026</span>·OPS</div>
          {VIEWS.map(v => (
            <div key={v} className={`nav-tab${view === v ? " act" : ""}`} onClick={() => setView(v)}>{v}</div>
          ))}
          <div className="nav-right">
            <div className="rate-widget">
              <span className="rate-lbl">€1=</span>
              <input className="rate-input" type="number" step="0.05" value={eurRate || ""} placeholder="—"
                onChange={e => setEurRate(Number(e.target.value) || 0)}
                onBlur={e => setSetting("eurRate", Number(e.target.value) || 0).catch(console.warn)} />
              <span className="rate-lbl">R$</span>
            </div>
            <div className="rate-widget">
              <span className="rate-lbl">$1=</span>
              <input className="rate-input" type="number" step="0.05" value={usdRate || ""} placeholder="—"
                onChange={e => setUsdRate(Number(e.target.value) || 0)}
                onBlur={e => setSetting("usdRate", Number(e.target.value) || 0).catch(console.warn)} />
              <span className="rate-lbl">R$</span>
            </div>
            <SyncDot />
            <span className="nav-date">{today.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" })}</span>
          </div>
        </nav>
        <div className="page">
          {view === "dashboard"  && <Dashboard  contracts={contracts} posts={posts} stats={stats} rates={rates} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} toggleNF={toggleNF} setModal={setModal} />}
          {view === "contratos"  && <Contratos  contracts={contracts} posts={posts} saveC={saveC} setModal={setModal} toggleComm={toggleComm} saveNote={saveNote} rates={rates} />}
          {view === "posts"      && <Posts      contracts={contracts} posts={posts} saveP={saveP} setModal={setModal} />}
          {view === "calendário" && <Calendario contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF} />}
        </div>
        {modal && (
          <div className="overlay" onClick={e => { if (e.target.className === "overlay") setModal(null); }}>
            {modal.type === "contract" && <ContractModal modal={modal} setModal={setModal} contracts={contracts} saveC={saveC} />}
            {modal.type === "post"     && <PostModal     modal={modal} setModal={setModal} contracts={contracts} posts={posts} saveP={saveP} />}
          </div>
        )}
      </div>
    </>
  );
}


// ─── Shared ───────────────────────────────────────────────
function CommToggle({ on, onToggle, label }) {
  return (
    <div className="comm-toggle" onClick={e => { e.stopPropagation(); onToggle(); }}>
      <div className={`toggle-track${on ? " on" : ""}`}><div className="toggle-thumb" /></div>
      {label && <span className="toggle-lbl">{on ? "Comissão ativa" : "Sem comissão"}</span>}
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

function StatusPill({ done, onToggle, labelDone = "✓ Pago", labelPend = "Pendente" }) {
  return (
    <div className={`status-pill${done ? " done" : " pend"}`} onClick={onToggle}>
      {done ? labelDone : labelPend}
    </div>
  );
}

function dlColor(d) { return d == null ? BLK : d <= 7 ? RED : d <= 14 ? AMB : GRN; }
function currBadge(cur) {
  if (cur === "EUR") return <span className="badge b-eur">EUR</span>;
  if (cur === "USD") return <span className="badge b-usd">USD</span>;
  return null;
}

// ─── Dashboard ────────────────────────────────────────────
// ─── Dashboard ────────────────────────────────────────────
function Dashboard({ contracts, posts, stats, rates, saveNote, toggleComm, toggleCommPaid, toggleNF, setModal }) {
  return (
    <>
      {/* Page header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:20 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, letterSpacing:".16em", textTransform:"uppercase", color:MID }}>
            VELOSO 2026 — OP
          </div>
        </div>
        <button className="btn red sm" onClick={() => setModal({ type:"contract", data:null })}>
          + Novo Contrato
        </button>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="kpi">
          <div className="kpi-lbl">Contratos</div>
          <div className="kpi-val">{contracts.length}</div>
          <div className="kpi-sub">{contracts.filter(c => c.paymentType === "monthly").length} mensais</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Volume BRL</div>
          <div className="kpi-val xs">{fmtMoney(stats.totalBRL)}</div>
          <div className="kpi-sub">
            {stats.totEur > 0 && rates.eur === 0
              ? <span style={{color:AMB}}>⚠ {fmtMoney(stats.totEur,"EUR")} sem cotação</span>
              : stats.totEur > 0
                ? <span>+ {fmtMoney(stats.totEur,"EUR")} ≈ {fmtMoney(stats.totEur*rates.eur)}</span>
                : null}
            {stats.totUsd > 0 && rates.usd === 0
              ? <span style={{color:AMB}}> ⚠ {fmtMoney(stats.totUsd,"USD")} sem cotação</span>
              : stats.totUsd > 0
                ? <span> + {fmtMoney(stats.totUsd,"USD")} ≈ {fmtMoney(stats.totUsd*rates.usd)}</span>
                : null}
          </div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Comissão Total</div>
          <div className="kpi-val xs red">{fmtMoney(stats.commBRL)}</div>
          <div className="kpi-sub">{fmtMoney(stats.commPaidBRL)} recebido</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Com. Pendente</div>
          <div className="kpi-val sm" style={{ color: stats.commPendBRL > 0 ? AMB : GRN }}>{fmtMoney(stats.commPendBRL)}</div>
          <div className="kpi-sub">a receber</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">NF Pendentes</div>
          <div className="kpi-val" style={{ color: stats.nfPending > 0 ? AMB : GRN }}>{stats.nfPending}</div>
          <div className="kpi-sub">não emitidas</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Posts/Reels</div>
          <div className="kpi-val">{stats.dp}<span style={{ fontSize:14, color:MID, fontWeight:400 }}>/{stats.tp}</span></div>
          <div className="kpi-sub">entregues</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Stories</div>
          <div className="kpi-val">{stats.ds}<span style={{ fontSize:14, color:MID, fontWeight:400 }}>/{stats.ts}</span></div>
          <div className="kpi-sub">entregues</div>
        </div>
        <div className="kpi">
          <div className="kpi-lbl">Engaj. Médio</div>
          <div className="kpi-val sm" style={{ color: stats.avgEng != null ? (stats.avgEng >= 3 ? GRN : stats.avgEng >= 1 ? AMB : MID) : MID }}>
            {stats.avgEng != null ? stats.avgEng.toFixed(2) + "%" : "—"}
          </div>
          <div className="kpi-sub" style={{ color:GRN }}>auto</div>
        </div>
      </div>

      {/* Contract accordion */}
      <ContractList
        contracts={contracts} posts={posts} rates={rates}
        saveNote={saveNote} toggleComm={toggleComm}
        toggleCommPaid={toggleCommPaid} toggleNF={toggleNF}
      />
    </>
  );
}

// ─── Contract Accordion List ──────────────────────────────
function ContractList({ contracts, posts, rates, saveNote, toggleComm, toggleCommPaid, toggleNF }) {
  const [open, setOpen] = useState(null);

  const [nfDetails, setNfDetails] = useState(() => {
    try { return JSON.parse(localStorage.getItem("copa6_nfd") || "{}"); } catch { return {}; }
  });
  const saveNfDetail = (cid, key, field, val) =>
    setNfDetails(prev => {
      const n = { ...prev, [cid]: { ...(prev[cid]||{}), [key]: { ...(prev[cid]?.[key]||{}), [field]: val } } };
      localStorage.setItem("copa6_nfd", JSON.stringify(n));
      return n;
    });

  const [cronos, setCronos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("copa6_cron") || "{}"); } catch { return {}; }
  });
  const saveCronos = (cid, arr) =>
    setCronos(prev => {
      const n = { ...prev, [cid]: arr };
      localStorage.setItem("copa6_cron", JSON.stringify(n));
      return n;
    });
  const addMilestone    = cid => saveCronos(cid, [...(cronos[cid]||[]), { id: Math.random().toString(36).substr(2,6), fase:"", date:"", resp:"", status:"pendente", note:"" }]);
  const updateMilestone = (cid, mid, field, val) => saveCronos(cid, (cronos[cid]||[]).map(m => m.id===mid ? {...m,[field]:val} : m));
  const removeMilestone = (cid, mid) => saveCronos(cid, (cronos[cid]||[]).filter(m => m.id!==mid));

  const FASES = ["Envio briefing","Envio roteiro","Aprovação roteiro","Gravação","Edição","Envio para aprovação","Aprovação final","Publicação Reel","Publicação TikTok","Publicação Stories","Publicação YouTube","Pagamento","NF emissão","Outro"];
  const ST_CLR = { pendente:["#FAEEDA","#633806"], "em andamento":["#E6F1FB","#0C447C"], aprovado:["#EAF3DE","#27500A"], publicado:["#EEEDFE","#3C3489"], cancelado:["#FCEBEB","#791F1F"] };

  const nfStatus = c => {
    const e = getNFEntries(c);
    if (!e.length) return null;
    if (e.every(x=>x.isEmitted)) return "emitida";
    if (e.every(x=>!x.isEmitted)) return "nao";
    return "parcial";
  };

  const toggle = id => setOpen(p => p===id ? null : id);

  return (
    <div className="blk" style={{ marginBottom:14 }}>
      <div style={{ display:"grid", gridTemplateColumns:"4px 1fr 150px 120px 1fr 140px 32px", borderBottom:`2px solid ${LN}`, background:SUF }}>
        {["","EMPRESA","VALOR TOTAL","PRAZO","ENTREGAS","NOTA FISCAL",""].map((h,i) => (
          <div key={i} style={{ padding:"7px 10px", fontSize:9, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:MID, textAlign:i===2||i===3?"right":"left" }}>{h}</div>
        ))}
      </div>

      {contracts.length===0 && (
        <div style={{ padding:"40px 14px", textAlign:"center", color:MID, fontSize:12 }}>Nenhum contrato cadastrado.</div>
      )}

      {contracts.map(c => {
        const isOpen = open===c.id;
        const cp = posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
        const cs = posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
        const cl = posts.filter(p=>p.contractId===c.id&&p.type==="link").length;
        const cr = posts.filter(p=>p.contractId===c.id).reduce((s,p)=>s+postRepostCount(p),0);
        const total  = contractTotal(c);
        const dl     = daysLeft(c.contractDeadline);
        const totDel = c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
        const doneDel= cp+cs+cl+cr;
        const pct    = totDel ? Math.min(100,doneDel/totDel*100) : 0;
        const st     = nfStatus(c);
        const nfEntries  = getNFEntries(c);
        const commEntries= getCommEntries(c);
        const milestones = cronos[c.id]||[];

        const convNote = (v,cur) => {
          if(cur==="EUR"&&rates.eur>0) return ` ≈ ${fmtMoney(v*rates.eur)}`;
          if(cur==="USD"&&rates.usd>0) return ` ≈ ${fmtMoney(v*rates.usd)}`;
          return "";
        };

        const NfPill = () => {
          if(!nfEntries.length) return <span style={{color:MID,fontSize:11}}>—</span>;
          if(st==="emitida") return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",background:`${GRN}18`,border:`1px solid ${GRN}44`,color:GRN}}>✓ Emitida</span>;
          if(st==="parcial") return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",background:`${AMB}18`,border:`1px solid ${AMB}44`,color:AMB}}>Parcial</span>;
          return <span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",background:`${RED}10`,border:`1px solid ${RED}44`,color:RED}}>Não Emitida</span>;
        };

        return (
          <div key={c.id} style={{borderBottom:`1px solid ${LN}`}}>

            {/* ── Summary row ── */}
            <div onClick={()=>toggle(c.id)}
              style={{display:"grid",gridTemplateColumns:"4px 1fr 150px 120px 1fr 140px 32px",alignItems:"center",cursor:"pointer",background:isOpen?SUF:"#fff",transition:"background .1s"}}>
              <div style={{background:c.color,alignSelf:"stretch",minHeight:48}}/>
              <div style={{padding:"12px 10px",display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                <span style={{fontWeight:700,fontSize:13}}>{c.company}</span>
                {currBadge(c.currency)}
                {c.paymentType==="monthly"&&<span className="badge b-monthly">Mensal</span>}
                {total===0&&<span className="badge b-tbd">TBD</span>}
              </div>
              <div style={{padding:"12px 10px",textAlign:"right"}}>
                <div style={{fontWeight:700,fontSize:13,fontVariantNumeric:"tabular-nums"}}>{total>0?fmtMoney(total,c.currency):"—"}</div>
                {total>0&&c.currency!=="BRL"&&<div style={{fontSize:10,color:MID}}>{convNote(total,c.currency)}</div>}
              </div>
              <div style={{padding:"12px 10px",textAlign:"right"}}>
                {c.contractDeadline
                  ? <><div style={{fontSize:12,fontWeight:600,color:dlColor(dl)}}>{fmtDate(c.contractDeadline)}</div><div style={{fontSize:10,color:dlColor(dl),fontVariantNumeric:"tabular-nums"}}>{dl!=null?`${dl}d`:""}</div></>
                  : <span style={{color:MID}}>—</span>}
              </div>
              <div style={{padding:"12px 10px"}}>
                {totDel>0
                  ? <><div style={{height:3,background:LN,marginBottom:4}}><div style={{height:3,background:pct===100?GRN:c.color,width:`${pct}%`,transition:"width .4s"}}/></div><div style={{fontSize:11,color:MID}}>{doneDel}/{totDel} entregas</div></>
                  : <span style={{fontSize:11,color:MID,fontStyle:"italic"}}>A definir</span>}
              </div>
              <div style={{padding:"12px 10px"}}><NfPill/></div>
              <div style={{padding:"12px 6px",textAlign:"center",fontSize:11,color:MID}}>{isOpen?"▲":"›"}</div>
            </div>

            {/* ── Expanded panel ── */}
            {isOpen && (
              <div style={{background:"#FAFAF8",borderTop:`1px solid ${LN}`}}>

                {/* 3-col row: entregas | comissoes | NF */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:0,borderBottom:`1px solid ${LN}`}}>

                  {/* Col 1 */}
                  <div style={{padding:"18px 20px",borderRight:`1px solid ${LN}`}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID,marginBottom:12}}>Entregas</div>
                    {[
                      {lbl:"Posts / Reels",done:cp,total:c.numPosts,color:c.color},
                      {lbl:"Stories",done:cs,total:c.numStories,color:"#7C3AED"},
                      {lbl:"Links Comun.",done:cl,total:c.numCommunityLinks,color:"#059669"},
                      {lbl:"Reposts / TT",done:cr,total:c.numReposts,color:"#0891B2"},
                    ].filter(b=>b.total>0||b.done>0).map(b=>(
                      <div key={b.lbl} style={{marginBottom:8}}>
                        <div style={{display:"flex",justifyContent:"space-between",fontSize:11,marginBottom:3}}>
                          <span style={{fontWeight:600}}>{b.lbl}</span>
                          <span style={{fontVariantNumeric:"tabular-nums",color:b.done>=b.total&&b.total>0?GRN:BLK,fontWeight:b.done>=b.total&&b.total>0?700:400}}>{b.done}/{b.total}</span>
                        </div>
                        <div style={{height:3,background:LN}}><div style={{height:3,background:b.color,width:`${b.total?Math.min(100,b.done/b.total*100):b.done>0?100:0}%`}}/></div>
                      </div>
                    ))}
                    {c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts===0&&cp+cs+cl+cr===0&&<div style={{fontSize:11,color:MID,fontStyle:"italic",marginBottom:8}}>Escopo a definir</div>}
                    <div style={{marginTop:12,paddingTop:10,borderTop:`1px solid ${LN}`,fontSize:11}}>
                      <div style={{fontWeight:700,letterSpacing:".06em",textTransform:"uppercase",fontSize:9,color:MID,marginBottom:6}}>Pagamento</div>
                      {c.paymentType==="monthly"&&<div style={{color:MID}}>{fmtMoney(c.monthlyValue)}/mês · {monthsBetween(c.contractStart,c.contractDeadline)||"?"}m · {fmtDate(c.contractStart)} → {fmtDate(c.contractDeadline)}</div>}
                      {c.paymentType==="split"&&<div style={{color:MID}}>{getInstallments(c).map((inst,i)=>{const O=["1ª","2ª","3ª","4ª","5ª","6ª"];return <span key={i}>{i>0?" · ":""}{O[i]||`${i+1}ª`} {fmtMoney(inst.value,c.currency)} {fmtDate(inst.date)}</span>;})}</div>}
                      {c.paymentType==="single"&&<div style={{color:MID}}>{fmtDate(c.paymentDeadline)}</div>}
                    </div>
                    {Number(c.paymentDaysAfterNF)>0&&<div style={{marginTop:8,display:"flex",alignItems:"center",gap:6,fontSize:11}}><span style={{color:MID}}>Pgto:</span><span style={{fontWeight:700}}>{c.paymentDaysAfterNF} dias</span><span style={{color:MID}}>após NF</span></div>}
                    <div style={{marginTop:10,display:"flex",alignItems:"center",gap:8}}><CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/></div>
                    <InlineNotes notes={c.notes} onSave={v=>saveNote(c.id,v)}/>
                  </div>

                  {/* Col 2: Comissões */}
                  <div style={{padding:"18px 20px",borderRight:`1px solid ${LN}`}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID,marginBottom:12,display:"flex",justifyContent:"space-between"}}>
                      <span>Comissões da Agência</span>
                      {commEntries.length>0&&<span style={{color:RED}}>{fmtMoney(commEntries.reduce((s,e)=>s+e.amount,0),c.currency)}</span>}
                    </div>
                    {commEntries.length===0&&<div style={{fontSize:11,color:MID,fontStyle:"italic"}}>Sem comissão neste contrato</div>}
                    {commEntries.map((e,i,arr)=>(
                      <div key={e.key} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 0",borderBottom:i<arr.length-1?`1px solid ${LN}`:"none",gap:8}}>
                        <div>
                          <div style={{fontSize:12,fontWeight:600}}>{e.label}</div>
                          {e.date&&<div style={{fontSize:10,color:MID}}>{fmtDate(e.date)}</div>}
                        </div>
                        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                          <span style={{fontSize:12,fontWeight:700,color:RED,fontVariantNumeric:"tabular-nums"}}>{e.amount>0?fmtMoney(e.amount,e.currency):"—"}</span>
                          <div className={`status-pill${e.isPaid?" done":" pend"}`} onClick={()=>toggleCommPaid(c.id,e.key)}>{e.isPaid?"✓ Pago":"Pendente"}</div>
                        </div>
                      </div>
                    ))}
                    {commEntries.length>0&&<div style={{marginTop:10,paddingTop:8,borderTop:`1px solid ${LN}`,display:"flex",justifyContent:"space-between",fontSize:11}}>
                      <span style={{color:MID}}>Recebido:</span>
                      <span style={{fontWeight:700,color:commEntries.filter(e=>e.isPaid).length>0?GRN:MID,fontVariantNumeric:"tabular-nums"}}>{fmtMoney(commEntries.filter(e=>e.isPaid).reduce((s,e)=>s+e.amount,0),c.currency)}</span>
                    </div>}
                  </div>

                  {/* Col 3: NF */}
                  <div style={{padding:"18px 20px"}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID,marginBottom:12}}>Nota Fiscal</div>
                    {nfEntries.length===0&&<div style={{fontSize:11,color:MID,fontStyle:"italic"}}>Sem NF configurada</div>}
                    {nfEntries.map((e,i,arr)=>{
                      const det=nfDetails?.[c.id]?.[e.key]||{};
                      return (
                        <div key={e.key} style={{marginBottom:i<arr.length-1?16:0,paddingBottom:i<arr.length-1?16:0,borderBottom:i<arr.length-1?`1px solid ${LN}`:"none"}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                            <span style={{fontSize:11,fontWeight:600}}>{e.label}</span>
                            {e.amount>0&&<span style={{fontSize:11,fontWeight:700,fontVariantNumeric:"tabular-nums"}}>{fmtMoney(e.amount,e.currency)}</span>}
                          </div>
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Status</div>
                            <div className={`status-pill${e.isEmitted?" done":" pend"}`} onClick={()=>toggleNF(c.id,e.key)} style={{width:"100%",justifyContent:"center"}}>{e.isEmitted?"✓ Emitida":"Não emitida"}</div>
                          </div>
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Número da NF</div>
                            <input style={{width:"100%",padding:"6px 8px",border:`1px solid ${LN}`,fontFamily:"inherit",fontSize:12,outline:"none",background:"#fff"}} placeholder="Ex: 1234" value={det.number||""} onChange={ev=>saveNfDetail(c.id,e.key,"number",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                          </div>
                          <div style={{marginBottom:8}}>
                            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Data de Emissão</div>
                            <input type="date" style={{width:"100%",padding:"6px 8px",border:`1px solid ${LN}`,fontFamily:"inherit",fontSize:12,outline:"none",background:"#fff"}} value={det.date||""} onChange={ev=>saveNfDetail(c.id,e.key,"date",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                          </div>
                          {Number(c.paymentDaysAfterNF)>0&&det.date&&(
                            <div style={{marginBottom:8,padding:"6px 8px",background:`${GRN}10`,border:`1px solid ${GRN}33`}}>
                              <div style={{fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:GRN,marginBottom:2}}>Pgto previsto</div>
                              <div style={{fontSize:12,fontWeight:700,color:GRN,fontVariantNumeric:"tabular-nums"}}>{(()=>{const d=new Date(det.date);d.setDate(d.getDate()+Number(c.paymentDaysAfterNF));return fmtDate(d.toISOString().substr(0,10));})()}</div>
                              <div style={{fontSize:10,color:GRN}}>+{c.paymentDaysAfterNF} dias após NF</div>
                            </div>
                          )}
                          <div>
                            <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Observações NF</div>
                            <textarea style={{width:"100%",padding:"6px 8px",border:`1px solid ${LN}`,fontFamily:"inherit",fontSize:11,outline:"none",background:"#fff",resize:"vertical",minHeight:52}} placeholder="Competência, empresa tomadora, ISS…" value={det.notes||""} onChange={ev=>saveNfDetail(c.id,e.key,"notes",ev.target.value)} onClick={ev=>ev.stopPropagation()}/>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* ── Cronograma section ── */}
                <div style={{padding:"16px 20px",borderTop:`1px solid ${LN}`}}>
                  <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                    <div style={{fontSize:9,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID}}>Cronograma de Campanha</div>
                    <button className="btn sm" onClick={ev=>{ev.stopPropagation();addMilestone(c.id);}} style={{fontSize:9,padding:"3px 10px"}}>+ Fase</button>
                  </div>
                  {milestones.length===0
                    ? <div style={{fontSize:11,color:MID,fontStyle:"italic",padding:"8px 0"}}>Nenhuma fase cadastrada — clique em "+ Fase" para montar o cronograma desta campanha.</div>
                    : <div style={{overflowX:"auto"}}>
                        <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                          <thead>
                            <tr style={{borderBottom:`1px solid ${LN}`}}>
                              {["Fase","Data","Responsável","Status","Observação",""].map((h,i)=>(
                                <th key={i} style={{padding:"5px 8px",textAlign:"left",fontSize:9,fontWeight:700,letterSpacing:".08em",textTransform:"uppercase",color:MID,whiteSpace:"nowrap"}}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {milestones.map(m=>{
                              const [bg,fg]=ST_CLR[m.status]||ST_CLR["pendente"];
                              const dl2=daysLeft(m.date);
                              return (
                                <tr key={m.id} style={{borderBottom:`1px solid ${LN}`}}>
                                  <td style={{padding:"6px 8px",minWidth:160}}>
                                    <select value={m.fase} onChange={e=>{e.stopPropagation();updateMilestone(c.id,m.id,"fase",e.target.value);}} onClick={e=>e.stopPropagation()} style={{border:`1px solid ${LN}`,background:"#fff",fontFamily:"inherit",fontSize:12,padding:"4px 6px",width:"100%",outline:"none",color:BLK}}>
                                      <option value="">Selecionar fase…</option>
                                      {FASES.map(f=><option key={f} value={f}>{f}</option>)}
                                    </select>
                                  </td>
                                  <td style={{padding:"6px 8px",whiteSpace:"nowrap"}}>
                                    <input type="date" value={m.date} onChange={e=>{e.stopPropagation();updateMilestone(c.id,m.id,"date",e.target.value);}} onClick={e=>e.stopPropagation()} style={{border:`1px solid ${LN}`,fontFamily:"inherit",fontSize:11,padding:"4px 6px",outline:"none"}}/>
                                    {m.date&&dl2!==null&&<div style={{fontSize:9,fontWeight:700,color:dlColor(dl2),marginTop:2}}>{dl2===0?"Hoje":dl2>0?`${dl2}d`:`${Math.abs(dl2)}d atrás`}</div>}
                                  </td>
                                  <td style={{padding:"6px 8px",minWidth:120}}>
                                    <input value={m.resp} placeholder="ex: Matheus" onChange={e=>{e.stopPropagation();updateMilestone(c.id,m.id,"resp",e.target.value);}} onClick={e=>e.stopPropagation()} style={{border:`1px solid ${LN}`,fontFamily:"inherit",fontSize:12,padding:"4px 6px",outline:"none",width:"100%"}}/>
                                  </td>
                                  <td style={{padding:"6px 8px"}}>
                                    <select value={m.status} onChange={e=>{e.stopPropagation();updateMilestone(c.id,m.id,"status",e.target.value);}} onClick={e=>e.stopPropagation()} style={{border:`1px solid ${LN}`,background:bg,color:fg,fontFamily:"inherit",fontSize:11,fontWeight:700,padding:"4px 6px",outline:"none",cursor:"pointer"}}>
                                      {Object.keys(ST_CLR).map(s=><option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
                                    </select>
                                  </td>
                                  <td style={{padding:"6px 8px",minWidth:160}}>
                                    <input value={m.note} placeholder="Observação…" onChange={e=>{e.stopPropagation();updateMilestone(c.id,m.id,"note",e.target.value);}} onClick={e=>e.stopPropagation()} style={{border:`1px solid ${LN}`,fontFamily:"inherit",fontSize:12,padding:"4px 6px",outline:"none",width:"100%"}}/>
                                  </td>
                                  <td style={{padding:"6px 4px",textAlign:"center"}}>
                                    <button className="btn ghost sm" style={{color:RED,padding:"2px 8px",fontSize:11}} onClick={e=>{e.stopPropagation();removeMilestone(c.id,m.id);}}>×</button>
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

// ─── Contratos ────────────────────────────────────────────
function Contratos({ contracts, posts, saveC, setModal, toggleComm, saveNote, rates }) {
  const del = async id => { if (confirm("Excluir este contrato?")) await saveC(contracts.filter(c => c.id !== id)); };
  const payCell = c => {
    if (c.paymentType === "monthly") {
      const months = monthsBetween(c.contractStart, c.contractDeadline);
      return <div style={{ fontSize: 11 }}><span className="badge b-monthly" style={{ marginRight: 4 }}>Mensal</span>{fmtMoney(c.monthlyValue)}/mês{months ? ` · ${months}m` : ""}</div>;
    }
    if (c.paymentType === "split") return (
      <div style={{ fontSize: 11, lineHeight: 1.7 }}>
        {getInstallments(c).map((inst,i) => {
          const ORDINALS = ["1ª","2ª","3ª","4ª","5ª","6ª"];
          return <div key={i}><b style={{ color: MID }}>{ORDINALS[i]||`${i+1}ª`}</b> {inst.value>0?fmtMoney(inst.value,c.currency):"—"} · {fmtDate(inst.date)}</div>;
        })}
      </div>
    );
    return <span style={{ fontSize: 12 }}>{fmtDate(c.paymentDeadline)}</span>;
  };
  return (
    <>
      <div className="phd">Contratos <div className="rule" />
        <button className="btn red sm" onClick={() => setModal({ type: "contract", data: null })}>+ Novo Contrato</button>
      </div>
      <div className="blk" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr>
            <th /><th>Empresa</th><th className="num">Valor Total</th><th>Comissão</th>
            <th>Pagamento</th><th>Prazo</th>
            <th className="num">Posts</th><th className="num">Stories</th><th className="num">Links</th><th className="num">Reposts</th>
            <th style={{ minWidth: 80 }}>Prog.</th><th style={{ minWidth: 180 }}>Observações</th><th />
          </tr></thead>
          <tbody>
            {contracts.map(c => {
              const cp = posts.filter(p => p.contractId === c.id && p.type === "post").length;
              const cs = posts.filter(p => p.contractId === c.id && p.type === "story").length;
              const cl = posts.filter(p => p.contractId === c.id && p.type === "link").length;
              const cr = posts.filter(p => p.contractId === c.id).reduce((s, p) => s + postRepostCount(p), 0);
              const tot = c.numPosts + c.numStories + c.numCommunityLinks + c.numReposts;
              const don = cp + cs + cl + cr;
              const dl = daysLeft(c.contractDeadline);
              const total = contractTotal(c);
              const brlEq = c.currency !== "BRL" ? toBRL(total, c.currency, rates) : 0;
              return (
                <tr key={c.id}>
                  <td><span className="dot" style={{ background: c.color }} /></td>
                  <td style={{ fontWeight: 600 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      {c.company}
                      {c.paymentType === "monthly" && <span className="badge b-monthly">Mensal</span>}
                      {currBadge(c.currency)}
                      {total === 0 && <span className="badge b-tbd">TBD</span>}
                    </div>
                  </td>
                  <td className="num" style={{ fontWeight: 600 }}>
                    <div>{total > 0 ? fmtMoney(total, c.currency) : "—"}</div>
                    {brlEq > 0 && <div style={{ fontSize: 10, color: MID }}>≈ {fmtMoney(brlEq)}</div>}
                  </td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <CommToggle on={c.hasCommission} onToggle={() => toggleComm(c.id)} label />
                      {c.hasCommission && total > 0 && <div style={{ fontSize: 10, color: RED, fontWeight: 700 }}>{fmtMoney(total * COMM_RATE, c.currency)}</div>}
                    </div>
                  </td>
                  <td>{payCell(c)}</td>
                  <td style={{ color: dl != null && dl <= 7 ? RED : dl != null && dl <= 14 ? AMB : BLK, fontWeight: dl != null && dl <= 7 ? 700 : 400 }}>{fmtDate(c.contractDeadline)}</td>
                  <td className="num">{cp}/{c.numPosts}</td>
                  <td className="num">{cs}/{c.numStories}</td>
                  <td className="num">{cl}/{c.numCommunityLinks}</td>
                  <td className="num">{cr}/{c.numReposts}</td>
                  <td>
                    <div style={{ width: 72, height: 4, background: SUF }}><div style={{ height: 4, background: c.color, width: `${tot ? don / tot * 100 : 0}%` }} /></div>
                    <div style={{ fontSize: 9, color: MID, marginTop: 2 }}>{don}/{tot}</div>
                  </td>
                  <td><InlineNotes notes={c.notes} onSave={v => saveNote(c.id, v)} /></td>
                  <td><div style={{ display: "flex", gap: 4 }}>
                    <button className="btn ghost sm" onClick={() => setModal({ type: "contract", data: c })}>editar</button>
                    <button className="btn ghost sm" style={{ color: RED }} onClick={() => del(c.id)}>×</button>
                  </div></td>
                </tr>
              );
            })}
            {contracts.length === 0 && <tr><td colSpan={13} style={{ textAlign: "center", padding: 40, color: MID }}>Nenhum contrato.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Posts ────────────────────────────────────────────────
function Posts({ contracts, posts, saveP, setModal }) {
  const [filter, setFilter] = useState("all");
  const filtered = [...(filter === "all" ? posts : posts.filter(p => p.contractId === filter))]
    .sort((a, b) => new Date(b.publishDate||b.plannedDate||0) - new Date(a.publishDate||a.plannedDate||0));
  const del = async id => { if (confirm("Excluir?")) await saveP(posts.filter(p => p.id !== id)); };
  const BADGE = { post: "b-post", story: "b-story", link: "b-link", repost: "b-repost", tiktok: "b-tiktok" };
  const LABEL = { post: "Reel/Post", story: "Story", link: "Link", repost: "Repost", tiktok: "TikTok" };
  const engClass = e => e == null ? "low" : e >= 3 ? "high" : e >= 1 ? "mid" : "low";
  const viewsLabel = type => VIEW_TYPES.has(type) ? "Views" : "Impressões";

  return (
    <>
      <div className="phd">Posts & Entregas <div className="rule" />
        <button className="btn red sm" onClick={() => setModal({ type: "post", data: null })}>+ Registrar</button>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <div className={`chip${filter === "all" ? " act" : ""}`} onClick={() => setFilter("all")}>Todos ({posts.length})</div>
        {contracts.map(c => (
          <div key={c.id} className={`chip${filter === c.id ? " act" : ""}`} onClick={() => setFilter(c.id)}
            style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="dot" style={{ background: c.color, width: 6, height: 6 }} />
            {c.company.split("/")[0].trim()}
          </div>
        ))}
      </div>
      <div className="blk" style={{ overflowX: "auto" }}>
        <table className="tbl">
          <thead><tr>
            <th>Planejado</th><th>Status</th><th>Tipo</th><th>Título</th><th>Contrato</th><th>Redes</th>
            <th className="num">Views</th><th className="num">Alcance</th>
            <th className="num">Curtidas</th><th className="num">Coment.</th><th className="num">Shares</th><th className="num">Saves</th>
            <th className="num">Engaj.%</th><th>Link</th><th />
          </tr></thead>
          <tbody>
            {filtered.map(p => {
              const c = contracts.find(x => x.id === p.contractId);
              const eng = calcEngagement(p);
              const reposts = postRepostCount(p);
              return (
                <tr key={p.id}>
                  <td style={{ whiteSpace:"nowrap", fontVariantNumeric:"tabular-nums" }}>
                    <div>{fmtDate(p.plannedDate || p.publishDate)}</div>
                    {p.isPosted && p.publishDate && p.publishDate !== p.plannedDate &&
                      <div style={{ fontSize:9, color:MID }}>pub. {fmtDate(p.publishDate)}</div>}
                  </td>
                  <td>
                    {p.isPosted
                      ? <span style={{ display:"inline-flex", alignItems:"center", gap:3, padding:"2px 7px", fontSize:9, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", background:`${GRN}18`, border:`1px solid ${GRN}44`, color:GRN }}>✓ Publicado</span>
                      : <span style={{ display:"inline-flex", alignItems:"center", gap:3, padding:"2px 7px", fontSize:9, fontWeight:700, letterSpacing:".06em", textTransform:"uppercase", background:SUF, border:`1px solid ${LN}`, color:MID }}>Planejado</span>
                    }
                  </td>
                  <td><span className={`badge ${BADGE[p.type] || "b-post"}`}>{LABEL[p.type] || p.type}</span></td>
                  <td style={{ maxWidth: 180, fontWeight: 500 }}>
                    {p.title}
                    {reposts > 0 && <div style={{ fontSize: 9, color: "#1D4ED8", marginTop: 1, fontWeight: 700 }}>+{reposts} repost{reposts > 1 ? "s" : ""}</div>}
                  </td>
                  <td>{c && <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span className="dot" style={{ background: c.color }} /><span style={{ fontSize: 11 }}>{c.company.split("/")[0].trim()}</span></span>}</td>
                  <td style={{ maxWidth: 130 }}><div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>{(p.networks || []).length > 0 ? (p.networks || []).map(n => <span key={n} className="net-badge">{n}</span>) : <span style={{ color: MID, fontSize: 11 }}>—</span>}</div></td>
                  <td className="num">{Number(p.views || 0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.reach || 0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.likes || 0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.comments || 0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.shares || 0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.saves || 0).toLocaleString("pt-BR")}</td>
                  <td className="num">{eng != null ? <span className={`eng-pill ${engClass(eng)}`}>{eng.toFixed(2)}%<span className="eng-auto">●</span></span> : <span style={{ color: MID }}>—</span>}</td>
                  <td>{p.link ? <a href={p.link} style={{ color: RED, fontSize: 11 }} target="_blank" rel="noreferrer">↗</a> : <span style={{ color: MID }}>—</span>}</td>
                  <td><div style={{ display: "flex", gap: 4 }}>
                    <button className="btn ghost sm" onClick={() => setModal({ type: "post", data: p })}>editar</button>
                    <button className="btn ghost sm" style={{ color: RED }} onClick={() => del(p.id)}>×</button>
                  </div></td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={15} style={{ textAlign: "center", padding: 36, color: MID }}>Nenhum post.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Calendário ───────────────────────────────────────────
function Calendario({ contracts, calEvents, calMonth, setCal, calFilter, setCalF }) {
  const { y, m } = calMonth;
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMo = new Date(y, m + 1, 0).getDate();
  const todayStr = new Date().toISOString().substr(0, 10);
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMo; d++) cells.push(d);
  while (cells.length % 7) cells.push(null);
  const prev = () => setCal(p => { const d = new Date(p.y, p.m - 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const next = () => setCal(p => { const d = new Date(p.y, p.m + 1, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  return (
    <>
      <div className="phd">Calendário <div className="rule" />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="btn sm" onClick={prev}>←</button>
          <span style={{ fontWeight: 700, fontSize: 11, minWidth: 150, textAlign: "center", letterSpacing: ".06em" }}>{MONTHS_PT[m].toUpperCase()} {y}</span>
          <button className="btn sm" onClick={next}>→</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        <div className={`chip${calFilter === "all" ? " act" : ""}`} onClick={() => setCalF("all")}>Todos</div>
        {contracts.map(c => (
          <div key={c.id} className={`chip${calFilter === c.id ? " act" : ""}`} onClick={() => setCalF(c.id)}
            style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span className="dot" style={{ background: c.color, width: 6, height: 6 }} />
            {c.company.split("/")[0].trim()}
          </div>
        ))}
      </div>
      <div className="blk">
        <div className="cal-hd-row">
          {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(d => <div key={d} className="cal-hd-cell">{d}</div>)}
        </div>
        <div className="cal-grid">
          {cells.map((d, i) => {
            if (!d) return <div key={`e${i}`} className="cal-day cal-empty" />;
            const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const evs = calEvents[ds] || [];
            const isT = ds === todayStr;
            return (
              <div key={d} className={`cal-day${isT ? " cal-today" : ""}`}>
                <div className="cal-dnum" style={{ color: isT ? RED : BLK }}>{d}</div>
                {evs.slice(0, 3).map((ev, ei) => (
                  <div key={ei} className="cal-ev" style={{ borderLeftColor: ev.color, background: ev.dashed ? "transparent" : ev.color + "1A", color: ev.color, borderLeftStyle: ev.dashed ? "dashed" : "solid", opacity: ev.dashed ? 0.8 : 1 }}>{ev.label}</div>
                ))}
                {evs.length > 3 && <div style={{ fontSize: 8, color: MID }}>+{evs.length - 3}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Contract Modal ───────────────────────────────────────
function ContractModal({ modal, setModal, contracts, saveC }) {
  const isEdit = !!modal.data;
  const [f, setF] = useState(modal.data || {
    company: "", cnpj: "", contractDeadline: "", contractValue: "", currency: "BRL",
    monthlyValue: "", contractStart: "",
    paymentType: "single", paymentDeadline: "",
    installments: modal.data ? getInstallments(modal.data) : [{ value:"", date:"" }, { value:"", date:"" }],
    parc1Value: "", parc1Deadline: "", parc2Value: "", parc2Deadline: "",
    hasCommission: true, commPaid: {}, nfEmitted: {}, paymentDaysAfterNF: 0,
    numPosts: 0, numStories: 0, numCommunityLinks: 0, numReposts: 0,
    color: CONTRACT_COLORS[contracts.length % CONTRACT_COLORS.length],
    notes: ""
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const setInst = (i, field, val) => setF(x => {
    const inst = [...(x.installments||[])];
    inst[i] = { ...inst[i], [field]: val };
    return { ...x, installments: inst };
  });
  const addInst    = () => setF(x => ({ ...x, installments: [...(x.installments||[]), { value:"", date:"" }] }));
  const removeInst = i  => setF(x => ({ ...x, installments: (x.installments||[]).filter((_,j)=>j!==i) }));
  const months = f.paymentType === "monthly" ? monthsBetween(f.contractStart, f.contractDeadline) : null;
  const liveTotal = f.paymentType === "monthly"
    ? (months ? (Number(f.monthlyValue)||0)*months : 0)
    : f.paymentType === "split"
      ? (f.installments||[]).reduce((s,i)=>s+(Number(i.value)||0),0)
      : Number(f.contractValue)||0;

  const handleSave = async () => {
    if (!f.company) return alert("Preencha o nome da empresa.");
    const entry = {
      ...f, id: f.id || uid(),
      contractValue: f.paymentType === "monthly" ? 0 : Number(f.contractValue) || 0,
      monthlyValue: Number(f.monthlyValue) || 0,
      numPosts: Number(f.numPosts) || 0, numStories: Number(f.numStories) || 0,
      numCommunityLinks: Number(f.numCommunityLinks) || 0, numReposts: Number(f.numReposts) || 0,
      installments: f.paymentType === "split"
        ? (f.installments||[]).map(i=>({ value: Number(i.value)||0, date: i.date||"" }))
        : [],
      parc1Value: 0, parc2Value: 0, parc1Deadline: "", parc2Deadline: "",
      commPaid: f.commPaid || {}, nfEmitted: f.nfEmitted || {},
      paymentDaysAfterNF: Number(f.paymentDaysAfterNF) || 0
    };
    if (isEdit) await saveC(contracts.map(c => c.id === entry.id ? entry : c));
    else await saveC([...contracts, entry]);
    setModal(null);
  };

  return (
    <div className="modal">
      <div className="modal-hd">
        <span className="modal-t">{isEdit ? "Editar Contrato" : "Novo Contrato"}</span>
        <button className="btn ghost sm" onClick={() => setModal(null)}>✕</button>
      </div>
      <div className="modal-bd">
        <div className="srule">Empresa</div>
        <div className="fgrid">
          <div className="field fcol"><label className="flbl">Nome da Empresa / Marca</label>
            <input value={f.company} onChange={e => set("company", e.target.value)} placeholder="ex: Netshoes" /></div>
          <div className="field"><label className="flbl">CNPJ</label>
            <input value={f.cnpj} onChange={e => set("cnpj", e.target.value)} placeholder="00.000.000/0001-00" /></div>
          <div className="field"><label className="flbl">Cor</label>
            <input type="color" value={f.color} onChange={e => set("color", e.target.value)} style={{ height: 36, padding: 2, cursor: "pointer" }} /></div>
          <div className="field fcol"><label className="flbl">Observações</label>
            <textarea value={f.notes} onChange={e => set("notes", e.target.value)} /></div>
        </div>

        <div className="srule">Financeiro & Pagamento</div>
        <div className="ptoggle">
          {[["single", "Único"], ["split", "2 Parcelas"], ["monthly", "Mensal"]].map(([v, lbl]) => (
            <div key={v} className={`ptoggle-opt${f.paymentType === v ? " act" : ""}`} onClick={() => set("paymentType", v)}>{lbl}</div>
          ))}
        </div>

        {f.paymentType === "monthly" ? (
          <div className="fgrid c3">
            <div className="field"><label className="flbl">Valor Mensal</label>
              <input type="number" value={f.monthlyValue} onChange={e => set("monthlyValue", e.target.value)} placeholder="0" /></div>
            <div className="field"><label className="flbl">Moeda</label>
              <select value={f.currency} onChange={e => set("currency", e.target.value)}>
                <option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option>
              </select></div>
            <div className="field">
              <label className="flbl" style={{ display: "flex", alignItems: "center", gap: 8 }}>Comissão 20%
                <CommToggle on={f.hasCommission} onToggle={() => set("hasCommission", !f.hasCommission)} />
              </label>
              <input readOnly className={f.hasCommission ? "red-ro" : ""} value={f.hasCommission && Number(f.monthlyValue) > 0 ? `${fmtMoney(Number(f.monthlyValue) * COMM_RATE, f.currency)}/mês` : "Desativada"} />
            </div>
            <div className="field"><label className="flbl">Início</label>
              <input type="date" value={f.contractStart} onChange={e => set("contractStart", e.target.value)} /></div>
            <div className="field"><label className="flbl">Término</label>
              <input type="date" value={f.contractDeadline} onChange={e => set("contractDeadline", e.target.value)} /></div>
            <div className="field"><label className="flbl">Total Calculado</label>
              <input readOnly value={liveTotal > 0 && months ? `${months}m = ${fmtMoney(liveTotal, f.currency)}` : "—"} /></div>
          </div>
        ) : f.paymentType === "split" ? (
          <>
            <div className="fgrid c3" style={{ marginBottom:12 }}>
              <div className="field"><label className="flbl">Moeda</label>
                <select value={f.currency} onChange={e => set("currency", e.target.value)}>
                  <option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option>
                </select></div>
              <div className="field">
                <label className="flbl" style={{ display:"flex", alignItems:"center", gap:8 }}>Comissão 20%
                  <CommToggle on={f.hasCommission} onToggle={() => set("hasCommission", !f.hasCommission)} />
                </label>
                <input readOnly className={f.hasCommission ? "red-ro" : ""} value={f.hasCommission && liveTotal > 0 ? fmtMoney(liveTotal * COMM_RATE, f.currency) : "Desativada"} />
              </div>
              <div className="field"><label className="flbl">Total Calculado</label>
                <input readOnly value={liveTotal > 0 ? fmtMoney(liveTotal, f.currency) : "—"} />
              </div>
            </div>

            {/* Dynamic installment rows */}
            {(f.installments||[]).map((inst, i) => {
              const ORDINALS = ["1ª","2ª","3ª","4ª","5ª","6ª"];
              return (
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 1fr 32px", gap:8, marginBottom:8, alignItems:"end" }}>
                  <div className="field">
                    <label className="flbl">{ORDINALS[i]||`${i+1}ª`} Parcela — Valor</label>
                    <input type="number" placeholder="0" value={inst.value}
                      onChange={e => setInst(i, "value", e.target.value)} />
                  </div>
                  <div className="field">
                    <label className="flbl">{ORDINALS[i]||`${i+1}ª`} Parcela — Data</label>
                    <input type="date" value={inst.date}
                      onChange={e => setInst(i, "date", e.target.value)} />
                  </div>
                  <button className="btn ghost sm" style={{ color:RED, padding:"7px 8px", alignSelf:"flex-end" }}
                    onClick={() => removeInst(i)}
                    disabled={(f.installments||[]).length <= 2}>×</button>
                </div>
              );
            })}
            <button className="btn sm" style={{ marginBottom:12 }} onClick={addInst}>+ Adicionar Parcela</button>

            <div className="fgrid" style={{ marginTop:4 }}>
              <div className="field"><label className="flbl">Prazo Final do Contrato</label>
                <input type="date" value={f.contractDeadline} onChange={e => set("contractDeadline", e.target.value)} /></div>
            </div>
          </>
        ) : (
          <>
            <div className="fgrid c3">
              <div className="field"><label className="flbl">Valor do Contrato</label>
                <input type="number" value={f.contractValue} onChange={e => set("contractValue", e.target.value)} placeholder="0" /></div>
              <div className="field"><label className="flbl">Moeda</label>
                <select value={f.currency} onChange={e => set("currency", e.target.value)}>
                  <option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option>
                </select></div>
              <div className="field">
                <label className="flbl" style={{ display: "flex", alignItems: "center", gap: 8 }}>Comissão 20%
                  <CommToggle on={f.hasCommission} onToggle={() => set("hasCommission", !f.hasCommission)} />
                </label>
                <input readOnly className={f.hasCommission ? "red-ro" : ""} value={f.hasCommission && f.contractValue ? fmtMoney(Number(f.contractValue) * COMM_RATE, f.currency) : "Desativada"} />
              </div>
            </div>
            <div className="fgrid" style={{ marginTop: 12 }}>
              <div className="field"><label className="flbl">Data de Pagamento</label>
                <input type="date" value={f.paymentDeadline} onChange={e => set("paymentDeadline", e.target.value)} /></div>
              <div className="field"><label className="flbl">Prazo Final do Contrato</label>
                <input type="date" value={f.contractDeadline} onChange={e => set("contractDeadline", e.target.value)} /></div>
            </div>
          </>
        )}

        <div className="srule">Condição de Pagamento</div>
        <div className="fgrid">
          <div className="field">
            <label className="flbl">Pgto após emissão da NF</label>
            <div style={{display:"flex",alignItems:"center",gap:8}}>
              <input type="number" min="0" max="365" value={f.paymentDaysAfterNF||""} placeholder="Não se aplica"
                onChange={e => set("paymentDaysAfterNF", e.target.value)}
                style={{flex:1}} />
              {Number(f.paymentDaysAfterNF)>0 && (
                <span style={{fontSize:11,color:MID,whiteSpace:"nowrap"}}>dias corridos</span>
              )}
            </div>
            <span style={{fontSize:9,color:MID,marginTop:2}}>Ex: 30 = pagamento em 30 dias após NF. Deixe vazio se não se aplica.</span>
          </div>
        </div>

        <div className="srule">Entregas Contratadas</div>
        <div className="fgrid c4">
          {[["numPosts", "Posts/Reels"], ["numStories", "Stories"], ["numCommunityLinks", "Links Comun."], ["numReposts", "Reposts/TikTok"]].map(([k, lbl]) => (
            <div key={k} className="field"><label className="flbl">{lbl}</label>
              <input type="number" min="0" value={f[k]} onChange={e => set(k, e.target.value)} /></div>
          ))}
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
        <button className="btn red" onClick={handleSave}>{isEdit ? "Salvar Alterações" : "Criar Contrato"}</button>
      </div>
    </div>
  );
}

// ─── Post Modal ───────────────────────────────────────────
function PostModal({ modal, setModal, contracts, posts, saveP }) {
  const isEdit = !!modal.data;
  const [f, setF] = useState(modal.data || {
    contractId: contracts[0]?.id || "", title: "", link: "", type: "post",
    plannedDate: new Date().toISOString().substr(0, 10),
    publishDate: "", isPosted: false,
    views: "", reach: "", likes: "", comments: "", shares: "", saves: "", networks: []
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const toggleNet = n => setF(x => ({ ...x, networks: (x.networks || []).includes(n) ? (x.networks || []).filter(v => v !== n) : [...(x.networks || []), n] }));

  const liveEng = useMemo(() => calcEngagement({
    likes: Number(f.likes) || 0, comments: Number(f.comments) || 0,
    shares: Number(f.shares) || 0, saves: Number(f.saves) || 0, reach: Number(f.reach) || 0
  }), [f.likes, f.comments, f.shares, f.saves, f.reach]);

  const extraNets  = Math.max(0, (f.networks || []).length - 1);
  const viewsLabel = VIEW_TYPES.has(f.type) ? "Views / Reproduções" : "Impressões";

  const handleSave = async () => {
    if (!f.contractId || !f.title) return alert("Preencha contrato e título.");
    const entry = {
      ...f, id: f.id || uid(),
      views: Number(f.views) || 0, reach: Number(f.reach) || 0,
      likes: Number(f.likes) || 0, comments: Number(f.comments) || 0,
      shares: Number(f.shares) || 0, saves: Number(f.saves) || 0,
      networks: f.networks || [],
      plannedDate: f.plannedDate || "", publishDate: f.isPosted ? (f.publishDate || f.plannedDate) : "",
      isPosted: !!f.isPosted
    };
    if (isEdit) await saveP(posts.map(p => p.id === entry.id ? entry : p));
    else await saveP([...posts, entry]);
    setModal(null);
  };

  return (
    <div className="modal">
      <div className="modal-hd">
        <span className="modal-t">{isEdit ? "Editar Post" : "Registrar Entrega"}</span>
        <button className="btn ghost sm" onClick={() => setModal(null)}>✕</button>
      </div>
      <div className="modal-bd">
        <div className="srule">Identificação</div>
        <div className="fgrid">
          <div className="field"><label className="flbl">Contrato</label>
            <select value={f.contractId} onChange={e => set("contractId", e.target.value)}>
              {contracts.map(c => <option key={c.id} value={c.id}>{c.company}</option>)}
            </select></div>
          <div className="field"><label className="flbl">Tipo de Entrega</label>
            <select value={f.type} onChange={e => set("type", e.target.value)}>
              <option value="post">Reel / Post Feed</option>
              <option value="story">Story</option>
              <option value="link">Link Comunidade</option>
              <option value="repost">Repost</option>
              <option value="tiktok">TikTok</option>
            </select></div>
          <div className="field fcol"><label className="flbl">Título / Descrição</label>
            <input value={f.title} onChange={e => set("title", e.target.value)} placeholder="ex: Reel Copa 2026 — Abertura" /></div>
          <div className="field"><label className="flbl">Data Planejada</label>
            <input type="date" value={f.plannedDate} onChange={e => set("plannedDate", e.target.value)} /></div>
          <div className="field" style={{ justifyContent:"flex-end" }}>
            <label className="flbl">Status de Postagem</label>
            <div style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0" }}>
              <label style={{ display:"flex", alignItems:"center", gap:7, cursor:"pointer", userSelect:"none" }}>
                <input type="checkbox" checked={!!f.isPosted} onChange={e => set("isPosted", e.target.checked)}
                  style={{ width:15, height:15, cursor:"pointer", accentColor:GRN }} />
                <span style={{ fontSize:12, fontWeight:600, color: f.isPosted ? GRN : MID }}>
                  {f.isPosted ? "✓ Publicado" : "Não publicado ainda"}
                </span>
              </label>
            </div>
          </div>
          {f.isPosted && (
            <div className="field">
              <label className="flbl">Data Real de Publicação</label>
              <input type="date" value={f.publishDate || f.plannedDate} onChange={e => set("publishDate", e.target.value)} />
            </div>
          )}
          <div className="field"><label className="flbl">Link do Post</label>
            <input value={f.link} onChange={e => set("link", e.target.value)} placeholder="https://instagram.com/reel/..." /></div>
        </div>

        <div className="srule">Redes Sociais</div>
        <div className="net-chips">
          {NETWORKS.map(n => (
            <div key={n} className={`net-chip${(f.networks || []).includes(n) ? " sel" : ""}`} onClick={() => toggleNet(n)}>
              {(f.networks || []).includes(n) && <span style={{ fontSize: 9 }}>✓</span>}{n}
            </div>
          ))}
        </div>
        {extraNets > 0 && (
          <div style={{fontSize:10,color:"#1D4ED8",fontStyle:"normal",fontWeight:700,marginTop:6}}>
            ✓ +{extraNets} repost{extraNets>1?"s":""} contabilizado{extraNets>1?"s":""} automaticamente ({(f.networks||[]).slice(1).join(", ")})
          </div>
        )}

        <div className="srule">Métricas</div>
        <div className="metric-grid">
          <div className="field">
            <label className="flbl">{viewsLabel}</label>
            <input type="number" min="0" value={f.views} onChange={e => set("views", e.target.value)} placeholder="0" />
          </div>
          {[["reach", "Alcance"], ["likes", "Curtidas"], ["comments", "Comentários"], ["shares", "Compartilhamentos"], ["saves", "Saves"]].map(([k, lbl]) => (
            <div key={k} className="field"><label className="flbl">{lbl}</label>
              <input type="number" min="0" value={f[k]} onChange={e => set(k, e.target.value)} placeholder="0" /></div>
          ))}
        </div>
        <div style={{ marginTop: 12, display: "flex", alignItems: "flex-start", gap: 12 }}>
          <div className="field" style={{ flex: 1 }}>
            <label className="flbl" style={{ display: "flex", alignItems: "center", gap: 5 }}>
              Taxa de Engajamento <span className="eng-auto">auto</span>
            </label>
            <div className="metric-computed">
              {liveEng != null ? liveEng.toFixed(2) + "%" : "— (preencha alcance e interações)"}
            </div>
          </div>
          <div style={{ fontSize: 10, color: MID, maxWidth: 190, lineHeight: 1.6, paddingTop: 16 }}>
            (curtidas + coment. + shares + saves) ÷ alcance × 100
          </div>
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn" onClick={() => setModal(null)}>Cancelar</button>
        <button className="btn red" onClick={handleSave}>{isEdit ? "Salvar Alterações" : "Registrar"}</button>
      </div>
    </div>
  );
}
