import { useState, useEffect, useMemo, useRef } from "react";
import { loadContracts, syncContracts, loadPosts, syncPosts, getSetting, setSetting, subscribeToChanges } from "./db.js";

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
const NETWORKS  = ["Instagram","TikTok","YouTube","X / Twitter","Facebook"];
const COMM_RATE = 0.20;
const MONTHS_PT = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                   "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const MONTHS_SHORT = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const uid      = () => Math.random().toString(36).substr(2,8);
const fmtDate  = s => { if(!s) return "—"; const[y,m,d]=s.split("-"); return `${d}/${m}/${y}`; };
const daysLeft = s => { if(!s) return null; return Math.ceil((new Date(s)-new Date())/(864e5)); };

function fmtMoney(v, currency="BRL") {
  return new Intl.NumberFormat("pt-BR",{style:"currency",currency,minimumFractionDigits:0,maximumFractionDigits:0}).format(v||0);
}
function monthsBetween(start, end) {
  if(!start||!end) return null;
  const s=new Date(start), e=new Date(end);
  return (e.getFullYear()-s.getFullYear())*12+(e.getMonth()-s.getMonth())+1;
}
function contractTotal(c) {
  if(c.paymentType==="monthly"){const m=monthsBetween(c.contractStart,c.contractDeadline);return m?(c.monthlyValue||0)*m:0;}
  return c.contractValue||0;
}
function calcEngagement(p) {
  const i=(p.likes||0)+(p.comments||0)+(p.shares||0)+(p.saves||0);
  if(!p.reach||p.reach===0) return null;
  return i/p.reach*100;
}
function getCommEntries(c) {
  if(!c.hasCommission) return [];
  const paid=c.commPaid||{};
  if(c.paymentType==="monthly"){
    if(!c.contractStart||!c.contractDeadline) return [];
    const entries=[];
    const s=new Date(c.contractStart), e=new Date(c.contractDeadline);
    const cur=new Date(s.getFullYear(),s.getMonth(),1);
    while(cur<=e){
      const key=`${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,"0")}`;
      entries.push({key, label:`${MONTHS_SHORT[cur.getMonth()]} ${cur.getFullYear()}`, amount:(c.monthlyValue||0)*COMM_RATE, currency:c.currency, isPaid:!!paid[key]});
      cur.setMonth(cur.getMonth()+1);
    }
    return entries;
  }
  if(c.paymentType==="split") return [
    {key:"parc1", label:"1ª Parcela", amount:(c.parc1Value||0)*COMM_RATE, currency:c.currency, date:c.parc1Deadline, isPaid:!!paid["parc1"]},
    {key:"parc2", label:"2ª Parcela", amount:(c.parc2Value||0)*COMM_RATE, currency:c.currency, date:c.parc2Deadline, isPaid:!!paid["parc2"]},
  ];
  const total=contractTotal(c);
  return [{key:"single", label:"Pagamento Único", amount:total*COMM_RATE, currency:c.currency, date:c.paymentDeadline, isPaid:!!paid["single"]}];
}

// NF status options
const NF_STATUS = ["Não emitida","Emitida","Enviada ao cliente","Paga"];
const NF_COLORS = {
  "Não emitida": {bg:"#FEF2F2",color:RED,border:"#FECACA"},
  "Emitida":     {bg:"#FEF9C3",color:"#854D0E",border:"#FDE68A"},
  "Enviada ao cliente": {bg:"#EFF6FF",color:"#1D4ED8",border:"#BFDBFE"},
  "Paga":        {bg:"#F0FDF4",color:GRN,border:"#86EFAC"},
};

// ─── Seed ──────────────────────────────────────────────────
const SEED = [
  { id:"c0", company:"Netshoes", cnpj:"07.187.493/0001-07", color:"#B45309",
    contractValue:0, monthlyValue:30000, contractStart:"2026-06-01", currency:"BRL",
    contractDeadline:"2026-08-31", paymentType:"monthly",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:4, numStories:8, numCommunityLinks:2, numReposts:1,
    notes:"Embaixador chuteiras · R$30k/mês · jun–ago" },
  { id:"c1", company:"Play9 / GeTV", cnpj:"", color:"#C8102E",
    contractValue:200000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"2026-07-15", paymentType:"split",
    paymentDeadline:"", parc1Value:100000, parc1Deadline:"2026-06-01", parc2Value:100000, parc2Deadline:"2026-07-15",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"Viagem Copa do Mundo — Brazil House / GeTV" },
  { id:"c2", company:"FlashScore", cnpj:"", color:"#1D4ED8",
    contractValue:36000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"2026-07-31", paymentType:"single",
    paymentDeadline:"2026-07-31", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:8, numStories:13, numCommunityLinks:12, numReposts:1,
    notes:"8 reels + repost TikTok · 13 stories · 12 links (3x/mês)" },
  { id:"c3", company:"Coca-Cola", cnpj:"45.997.418/0001-53", color:"#DC2626",
    contractValue:100000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"2026-07-15", paymentType:"split",
    paymentDeadline:"", parc1Value:50000, parc1Deadline:"2026-06-15", parc2Value:50000, parc2Deadline:"2026-07-15",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:3, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"3 reels Copa — 1 já entregue" },
  { id:"c4", company:"Kabum!", cnpj:"", color:"#F97316",
    contractValue:0, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"Aguardando valores e escopo" },
  { id:"c5", company:"Tramontina", cnpj:"", color:"#0891B2",
    contractValue:98000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"Aguardando prazo e escopo" },
  { id:"c6", company:"Decolar", cnpj:"", color:"#059669",
    contractValue:14000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:0, numStories:0, numCommunityLinks:0, numReposts:1,
    notes:"1 TikTok" },
  { id:"c7", company:"Cacau Show", cnpj:"", color:"#92400E",
    contractValue:25000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:2, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"2 reels — 1 já entregue" },
  { id:"c8", company:"Paco Rabanne", cnpj:"", color:"#7C3AED",
    contractValue:2600, monthlyValue:0, contractStart:"", currency:"EUR",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:1, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"1 reel · pagamento em euros" },
  { id:"c9", company:"Diamond Filmes", cnpj:"", color:"#BE185D",
    contractValue:18000, monthlyValue:0, contractStart:"", currency:"BRL",
    contractDeadline:"", paymentType:"single",
    paymentDeadline:"", parc1Value:0, parc1Deadline:"", parc2Value:0, parc2Deadline:"",
    hasCommission:true, commPaid:{},
    nfStatus:"Não emitida", nfNumber:"", nfDate:"", nfNotes:"",
    numPosts:1, numStories:0, numCommunityLinks:0, numReposts:0,
    notes:"1 reel" },
];
const SEED_POSTS = [
  { id:"p1", contractId:"c3", title:"Reel Coca-Cola — Copa 2026 #1", link:"", type:"post", publishDate:"2026-06-05", impressions:0, reach:0, likes:0, comments:0, shares:0, saves:0, networks:["Instagram"] },
  { id:"p2", contractId:"c7", title:"Reel Cacau Show #1", link:"", type:"post", publishDate:"2026-06-10", impressions:0, reach:0, likes:0, comments:0, shares:0, saves:0, networks:["Instagram"] },
];


// ─── CSS ──────────────────────────────────────────────────
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
body,#root{background:${WHT};min-height:100vh}
.app{font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;font-size:13px;color:${BLK};min-height:100vh;background:${WHT}}
.nav{background:${BLK};display:flex;align-items:center;height:48px;padding:0 20px;border-bottom:2px solid ${RED};position:sticky;top:0;z-index:50;gap:0}
.nav-logo{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#F6F5F0;margin-right:24px;white-space:nowrap}
.nav-logo span{color:${RED}}
.nav-tab{padding:0 14px;height:48px;display:flex;align-items:center;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;cursor:pointer;color:#666;border-bottom:2px solid transparent;margin-bottom:-2px;transition:color .15s;white-space:nowrap}
.nav-tab:hover{color:#F6F5F0}
.nav-tab.act{color:${RED};border-bottom-color:${RED}}
.nav-right{margin-left:auto;display:flex;align-items:center;gap:12px}
.eur-widget{display:flex;align-items:center;gap:6px;background:rgba(255,255,255,.06);padding:4px 10px;border:1px solid rgba(255,255,255,.12)}
.eur-lbl{font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#aaa}
.eur-input{width:64px;background:transparent;border:none;outline:none;font-family:inherit;font-size:12px;font-weight:700;color:#F6F5F0;text-align:right;font-variant-numeric:tabular-nums}
.eur-input::placeholder{color:#555}
.nav-date{font-size:10px;color:#555;letter-spacing:.04em;white-space:nowrap}
.page{padding:24px 28px;max-width:1440px}
.phd{font-size:10px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:${MID};margin-bottom:20px;display:flex;align-items:center;gap:10px}
.rule{height:1px;background:${LN};flex:1}

/* KPI strip */
.kpi-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(118px,1fr));gap:1px;background:${LN};margin-bottom:24px}
.kpi{background:#fff;padding:14px 13px}
.kpi-lbl{font-size:9px;font-weight:700;letter-spacing:.11em;text-transform:uppercase;color:${MID};margin-bottom:6px}
.kpi-val{font-size:22px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums;color:${BLK}}
.kpi-val.red{color:${RED}}
.kpi-val.sm{font-size:15px}
.kpi-val.xs{font-size:12px}
.kpi-sub{font-size:9px;color:${MID};margin-top:3px}
.kpi-sub.grn{color:${GRN}}

/* List dashboard */
.contract-list{border:1px solid ${LN};background:#fff;margin-bottom:14px}
.contract-row{border-bottom:1px solid ${LN};cursor:pointer}
.contract-row:last-child{border-bottom:none}
.contract-row-hd{display:flex;align-items:center;gap:0;padding:0;transition:background .12s}
.contract-row-hd:hover{background:${SUF}}
.contract-row.open .contract-row-hd{background:${SUF}}

/* Color bar */
.c-bar{width:4px;align-self:stretch;flex-shrink:0}

/* Row main content */
.crow-main{display:flex;align-items:center;gap:12px;flex:1;padding:12px 14px;min-width:0}
.crow-name{font-weight:700;font-size:13px;min-width:140px;flex-shrink:0}
.crow-badges{display:flex;gap:4px;align-items:center;flex-shrink:0}
.crow-val{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;min-width:110px;text-align:right;flex-shrink:0}
.crow-deadline{font-size:11px;min-width:80px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}
.crow-prog{display:flex;align-items:center;gap:8px;min-width:130px;flex-shrink:0}
.crow-prog-bar{flex:1;height:3px;background:${SUF};max-width:80px}
.crow-prog-fill{height:3px}
.crow-prog-txt{font-size:9px;font-weight:700;color:${MID};font-variant-numeric:tabular-nums;white-space:nowrap}
.crow-nf{flex-shrink:0}
.crow-comm{font-size:11px;min-width:90px;text-align:right;flex-shrink:0;font-variant-numeric:tabular-nums}
.crow-chevron{width:36px;display:flex;align-items:center;justify-content:center;color:${MID};font-size:12px;flex-shrink:0;transition:transform .2s}
.contract-row.open .crow-chevron{transform:rotate(90deg)}

/* Expanded panel */
.contract-panel{border-top:1px solid ${LN};background:${WHT};padding:20px 20px 20px 18px}
.panel-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px}
.panel-section{display:flex;flex-direction:column;gap:10px}
.panel-ttl{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MID};padding-bottom:6px;border-bottom:1px solid ${LN};margin-bottom:4px}

/* Delivery rows inside panel */
.del-row{display:flex;align-items:center;gap:10px;font-size:12px}
.del-lbl{flex:1;color:${MID};font-weight:600}
.del-prog{display:flex;align-items:center;gap:6px}
.del-bar{width:60px;height:3px;background:${LN}}
.del-fill{height:3px;transition:width .4s}
.del-num{font-size:10px;font-weight:700;color:${MID};font-variant-numeric:tabular-nums;min-width:28px;text-align:right}

/* NF panel */
.nf-select{appearance:none;padding:5px 28px 5px 8px;border:1px solid ${LN};font-family:inherit;font-size:11px;font-weight:700;background:#fff url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%236a6a68'/%3E%3C/svg%3E") no-repeat right 8px center;cursor:pointer;outline:none;width:100%}
.nf-field{padding:5px 8px;border:1px solid ${LN};font-family:inherit;font-size:12px;background:#fff;color:${BLK};outline:none;width:100%}
.nf-field:focus,.nf-select:focus{border-color:${BLK}}
.nf-status-badge{display:inline-block;padding:2px 8px;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;border:1px solid}

/* Commission entries */
.comm-entry{display:flex;align-items:center;gap:8px;font-size:11px;padding:4px 0;border-bottom:1px dashed ${LN}}
.comm-entry:last-child{border-bottom:none}
.comm-status{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;border:1px solid;transition:all .15s;white-space:nowrap}
.comm-status.paid{background:${GRN}18;border-color:${GRN}44;color:${GRN}}
.comm-status.pending{background:${SUF};border-color:${LN};color:${MID}}
.comm-status.pending:hover{border-color:${GRN}44;color:${GRN}}

/* Notes inline */
.notes-area{display:block;width:100%;padding:4px 8px;font-family:inherit;font-size:11px;font-style:italic;color:${MID};border:1px dashed transparent;background:transparent;resize:none;line-height:1.5;border-radius:0;outline:none;min-height:28px;border-left:2px solid ${LN}}
.notes-area:hover{border-color:${LN};background:${SUF}}
.notes-area:focus{border-color:${BLK};background:#fff;font-style:normal;color:${BLK}}
.notes-area::placeholder{color:${MID};font-style:italic}

/* General */
.badge{display:inline-block;padding:2px 5px;font-size:8px;font-weight:700;letter-spacing:.07em;text-transform:uppercase}
.b-eur{background:#EEF2FF;color:#3730A3;font-size:9px;padding:1px 5px}
.b-tbd{background:${SUF};color:${MID}}
.b-monthly{background:transparent;color:${MID};border:1px solid ${LN};font-size:8px;padding:1px 5px}
.b-post{background:#FEF3C7;color:#92400E}
.b-story{background:#EDE9FE;color:#5B21B6}
.b-link{background:#D1FAE5;color:#065F46}
.b-repost{background:#DBEAFE;color:#1E40AF}
.b-tiktok{background:#FCE7F3;color:#9D174D}
.dot{width:8px;height:8px;border-radius:50%;display:inline-block;flex-shrink:0}
.btn{display:inline-flex;align-items:center;gap:5px;padding:7px 13px;font-size:10px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;border:1px solid ${LN};background:#fff;color:${BLK};transition:all .1s;font-family:inherit}
.btn:hover{background:${SUF}}
.btn.red{background:${RED};color:#fff;border-color:${RED}}
.btn.red:hover{background:#a00c24}
.btn.sm{padding:4px 9px;font-size:9px}
.btn.ghost{border:none;background:transparent;color:${MID};padding:4px 8px}
.btn.ghost:hover{color:${BLK};background:${SUF}}
.comm-toggle{display:inline-flex;align-items:center;gap:6px;cursor:pointer;user-select:none}
.toggle-track{width:28px;height:15px;border-radius:8px;background:${LN};position:relative;transition:background .2s;flex-shrink:0}
.toggle-track.on{background:${GRN}}
.toggle-thumb{width:11px;height:11px;border-radius:50%;background:#fff;position:absolute;top:2px;left:2px;transition:transform .2s}
.toggle-track.on .toggle-thumb{transform:translateX(13px)}
.toggle-lbl{font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${MID}}
.toggle-track.on + .toggle-lbl{color:${GRN}}
.net-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}
.net-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;border:1px solid ${LN};background:#fff;color:${MID};user-select:none}
.net-chip.sel{background:${BLK};color:#fff;border-color:${BLK}}
.net-badge{display:inline-block;padding:1px 5px;font-size:8px;font-weight:700;background:${SUF};color:${MID};margin-right:2px}
.eng-auto{font-size:8px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${GRN};margin-left:3px}
.dl-row{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid ${LN}}
.dl-row:last-child{border-bottom:none}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th{font-size:9px;font-weight:700;letter-spacing:.09em;text-transform:uppercase;color:${MID};padding:7px 8px;text-align:left;border-bottom:2px solid ${LN};white-space:nowrap}
.tbl td{padding:8px 8px;border-bottom:1px solid ${LN};vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tr:hover td{background:${SUF}}
.num{font-variant-numeric:tabular-nums;text-align:right}
.blk{background:#fff;border:1px solid ${LN};margin-bottom:14px}
.blk-hd{padding:10px 14px;border-bottom:1px solid ${LN};display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px}
.blk-ttl{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MID}}
.blk-bd{padding:14px}
.chip{display:inline-flex;align-items:center;gap:4px;padding:3px 10px;font-size:9px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;cursor:pointer;border:1px solid ${LN};background:#fff;color:${MID}}
.chip.act{background:${BLK};color:#fff;border-color:${BLK}}
.cal-hd-row{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:${LN}}
.cal-hd-cell{background:#fff;text-align:center;font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${MID};padding:7px 0}
.cal-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:1px;background:${LN}}
.cal-day{background:#fff;min-height:84px;padding:5px}
.cal-empty{background:${SUF}}
.cal-today{outline:2px solid ${RED};outline-offset:-2px}
.cal-dnum{font-size:11px;font-weight:600;margin-bottom:3px}
.cal-ev{font-size:8px;font-weight:700;padding:2px 3px;margin-bottom:2px;border-left:3px solid;letter-spacing:.03em;text-transform:uppercase;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.metric-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
.metric-computed{padding:7px 9px;background:${SUF};border:1px solid ${LN};font-size:13px;font-weight:700;color:${GRN};font-variant-numeric:tabular-nums}
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
.field textarea{resize:vertical;min-height:48px;font-size:12px}
.srule{font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${MID};margin:14px 0 10px;display:flex;align-items:center;gap:10px}
.srule::after{content:"";flex:1;height:1px;background:${LN}}
.ptoggle{display:flex;border:1px solid ${LN};overflow:hidden;width:fit-content;margin-bottom:12px}
.ptoggle-opt{padding:6px 13px;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;cursor:pointer;color:${MID};background:#fff;white-space:nowrap}
.ptoggle-opt.act{background:${BLK};color:#fff}
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;display:flex;align-items:flex-start;justify-content:center;padding:40px 16px;overflow-y:auto}
.modal{background:#fff;width:100%;max-width:680px;flex-shrink:0}
.modal-hd{padding:13px 18px;border-bottom:2px solid ${RED};display:flex;align-items:center;justify-content:space-between}
.modal-t{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}
.modal-bd{padding:20px 18px}
.modal-ft{padding:13px 18px;border-top:1px solid ${LN};display:flex;justify-content:flex-end;gap:8px}
@media(max-width:900px){.panel-grid{grid-template-columns:1fr 1fr}.crow-prog{display:none}}
@media(max-width:600px){.page{padding:12px}.panel-grid{grid-template-columns:1fr}.crow-val{display:none}.eur-widget{display:none}}
`;

export default function App() {
  const [view, setView]       = useState("dashboard");
  const [contracts, setC]     = useState([]);
  const [posts, setP]         = useState([]);
  const [modal, setModal]     = useState(null);
  const [eurRate, setEurRate] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [synced, setSynced]   = useState(false); // shows live indicator
  const [calMonth, setCal]    = useState(()=>{const n=new Date();return{y:n.getFullYear(),m:n.getMonth()};});
  const [calFilter, setCalF]  = useState("all");

  // Keep ref to previous IDs so we can detect deletions when syncing
  const prevContractIds = useRef([]);
  const prevPostIds     = useRef([]);

  // ── Initial load from Supabase ───────────────────────────
  useEffect(()=>{
    let cancelled = false;
    (async()=>{
      try {
        let [dbContracts, dbPosts, eurVal] = await Promise.all([
          loadContracts(),
          loadPosts(),
          getSetting("eurRate"),
        ]);

        if (cancelled) return;

        // First run: seed the database if empty
        if (dbContracts.length === 0) {
          await syncContracts(SEED, []);
          await syncPosts(SEED_POSTS, []);
          dbContracts = SEED;
          dbPosts     = SEED_POSTS;
        }

        setC(dbContracts);
        setP(dbPosts);
        prevContractIds.current = dbContracts.map(c => c.id);
        prevPostIds.current     = dbPosts.map(p => p.id);
        if (eurVal) setEurRate(Number(eurVal) || 0);
        setSynced(true);
      } catch (err) {
        if (!cancelled) setDbError(err.message || "Erro ao conectar ao banco de dados");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // ── Real-time subscription ───────────────────────────
    const unsubscribe = subscribeToChanges({
      onContracts: (updated) => {
        setC(updated);
        prevContractIds.current = updated.map(c => c.id);
      },
      onPosts: (updated) => {
        setP(updated);
        prevPostIds.current = updated.map(p => p.id);
      },
      onSetting: (key, value) => {
        if (key === "eurRate") setEurRate(Number(value) || 0);
      },
    });

    return () => { cancelled = true; unsubscribe(); };
  },[]);

  const saveC = async d => {
    setC(d);
    await syncContracts(d, prevContractIds.current);
    prevContractIds.current = d.map(c => c.id);
  };
  const saveP = async d => {
    setP(d);
    await syncPosts(d, prevPostIds.current);
    prevPostIds.current = d.map(p => p.id);
  };
  const saveEur = async v => { const n=Number(v)||0; setEurRate(n); await setSetting("eurRate", n); };
  const saveNote    = async (id,notes) => saveC(contracts.map(c=>c.id===id?{...c,notes}:c));
  const toggleComm  = async id => saveC(contracts.map(c=>c.id===id?{...c,hasCommission:!c.hasCommission}:c));
  const toggleCommPaid = async (contractId, key) => {
    saveC(contracts.map(c=>{
      if(c.id!==contractId) return c;
      const commPaid={...(c.commPaid||{})};
      commPaid[key]=!commPaid[key];
      return {...c,commPaid};
    }));
  };
  const saveNF = async (id, nfData) => saveC(contracts.map(c=>c.id===id?{...c,...nfData}:c));

  const stats = useMemo(()=>{
    const brl=contracts.filter(c=>c.currency!=="EUR"&&c.currency!=="USD");
    const eur=contracts.filter(c=>c.currency==="EUR");
    const totBrl=brl.reduce((s,c)=>s+contractTotal(c),0);
    const totEur=eur.reduce((s,c)=>s+contractTotal(c),0);
    const commBrl=brl.filter(c=>c.hasCommission).reduce((s,c)=>s+contractTotal(c)*COMM_RATE,0);
    let commPaid=0,commPending=0;
    contracts.forEach(c=>{
      if(!c.hasCommission) return;
      getCommEntries(c).forEach(e=>{
        if(c.currency!=="EUR"){e.isPaid?commPaid+=e.amount:commPending+=e.amount;}
      });
    });
    const tot=k=>contracts.reduce((s,c)=>s+c[k],0);
    const del=t=>posts.filter(p=>p.type===t).length;
    const engs=posts.map(calcEngagement).filter(e=>e!==null);
    const nfPendente=contracts.filter(c=>c.nfStatus==="Não emitida"&&contractTotal(c)>0).length;
    return {
      totBrl,totEur,commBrl,commPaid,commPending,nfPendente,
      tp:tot("numPosts"),ts:tot("numStories"),tl:tot("numCommunityLinks"),tr:tot("numReposts"),
      dp:del("post"),ds:del("story"),dl:del("link"),dr:del("repost")+del("tiktok"),
      avgEng:engs.length?engs.reduce((s,v)=>s+v,0)/engs.length:null,
    };
  },[contracts,posts]);

  const calEvents = useMemo(()=>{
    const ev={};
    const add=(ds,e)=>{if(!ds)return;const k=ds.substr(0,10);if(!ev[k])ev[k]=[];ev[k].push(e);};
    contracts.forEach(c=>{
      if(calFilter!=="all"&&calFilter!==c.id) return;
      if(c.contractDeadline) add(c.contractDeadline,{label:`PRAZO · ${c.company}`,color:c.color});
      if(c.paymentType==="monthly"&&c.contractStart){
        const s=new Date(c.contractStart),e=new Date(c.contractDeadline||c.contractStart);
        const cur=new Date(s.getFullYear(),s.getMonth(),1);
        while(cur<=e){add(cur.toISOString().substr(0,10),{label:`PGTO · ${c.company}`,color:c.color});cur.setMonth(cur.getMonth()+1);}
      } else if(c.paymentType==="split"){
        if(c.parc1Deadline) add(c.parc1Deadline,{label:`1ª PARC · ${c.company}`,color:c.color});
        if(c.parc2Deadline) add(c.parc2Deadline,{label:`2ª PARC · ${c.company}`,color:c.color});
      } else if(c.paymentDeadline) add(c.paymentDeadline,{label:`PGTO · ${c.company}`,color:c.color});
    });
    posts.forEach(p=>{
      const c=contracts.find(x=>x.id===p.contractId);
      if(!c) return;
      if(calFilter!=="all"&&calFilter!==c.id) return;
      add(p.publishDate,{label:p.title,color:c.color});
    });
    return ev;
  },[contracts,posts,calFilter]);

  const today=new Date();
  const VIEWS=["dashboard","contratos","posts","calendário"];

  if (loading) return (
    <>
      <style>{CSS}</style>
      <div className="app" style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:16}}>
        <div style={{fontSize:11,fontWeight:700,letterSpacing:".14em",textTransform:"uppercase",color:MID}}>Carregando dados…</div>
        <div style={{width:120,height:2,background:LN,overflow:"hidden"}}><div style={{width:"40%",height:2,background:RED,animation:"none"}}/></div>
      </div>
    </>
  );

  if (dbError) return (
    <>
      <style>{CSS}</style>
      <div className="app" style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100vh",flexDirection:"column",gap:12,padding:24}}>
        <div style={{fontSize:13,fontWeight:700,color:RED}}>Erro de conexão com o banco de dados</div>
        <div style={{fontSize:12,color:MID,maxWidth:480,textAlign:"center"}}>{dbError}</div>
        <div style={{fontSize:11,color:MID,maxWidth:480,textAlign:"center"}}>Verifique se as variáveis <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> estão configuradas corretamente no arquivo <code>.env</code>.</div>
        <button className="btn red" onClick={()=>window.location.reload()}>Tentar novamente</button>
      </div>
    </>
  );

  return (
    <>
      <style>{CSS}</style>
      <div className="app">
        <nav className="nav">
          <div className="nav-logo">VELOSO<span>2026</span>·OP</div>
          {VIEWS.map(v=>(
            <div key={v} className={`nav-tab${view===v?" act":""}`} onClick={()=>setView(v)}>{v}</div>
          ))}
          <div className="nav-right">
            <div className="eur-widget">
              <span className="eur-lbl">€1 =</span>
              <input className="eur-input" type="number" step="0.05" value={eurRate||""} placeholder="0,00"
                onChange={e=>setEurRate(Number(e.target.value)||0)}
                onBlur={e=>saveEur(e.target.value)}/>
              <span className="eur-lbl">BRL</span>
            </div>
            {synced && <span style={{display:"flex",alignItems:"center",gap:4,fontSize:9,color:"#3f3",fontWeight:700,letterSpacing:".08em",textTransform:"uppercase"}}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"#3f3",display:"inline-block"}}/>ao vivo
            </span>}
            <span className="nav-date">{today.toLocaleDateString("pt-BR",{weekday:"short",day:"numeric",month:"short"})}</span>
          </div>
        </nav>
        <div className="page">
          {view==="dashboard"  && <Dashboard  contracts={contracts} posts={posts} stats={stats} eurRate={eurRate} saveNote={saveNote} toggleComm={toggleComm} toggleCommPaid={toggleCommPaid} saveNF={saveNF} setModal={setModal}/>}
          {view==="contratos"  && <Contratos  contracts={contracts} posts={posts} saveC={saveC} setModal={setModal} toggleComm={toggleComm} saveNote={saveNote} eurRate={eurRate}/>}
          {view==="posts"      && <Posts      contracts={contracts} posts={posts} saveP={saveP} setModal={setModal}/>}
          {view==="calendário" && <Calendario contracts={contracts} calEvents={calEvents} calMonth={calMonth} setCal={setCal} calFilter={calFilter} setCalF={setCalF}/>}
        </div>
        {modal&&(
          <div className="overlay" onClick={e=>{if(e.target.className==="overlay")setModal(null);}}>
            {modal.type==="contract"&&<ContractModal modal={modal} setModal={setModal} contracts={contracts} saveC={saveC}/>}
            {modal.type==="post"    &&<PostModal     modal={modal} setModal={setModal} contracts={contracts} posts={posts} saveP={saveP}/>}
          </div>
        )}
      </div>
    </>
  );
}

function CommToggle({on,onToggle,label}){
  return(
    <div className="comm-toggle" onClick={e=>{e.stopPropagation();onToggle();}}>
      <div className={`toggle-track${on?" on":""}`}><div className="toggle-thumb"/></div>
      {label&&<span className="toggle-lbl">{on?"Com. ativa":"Sem comissão"}</span>}
    </div>
  );
}
function InlineNotes({notes,onSave}){
  const [val,setVal]=useState(notes||"");
  const [dirty,setDirty]=useState(false);
  const ta=useRef(null);
  useEffect(()=>{setVal(notes||"");},[notes]);
  return(
    <textarea ref={ta} className="notes-area" value={val} rows={Math.max(1,Math.ceil((val.length||1)/54))}
      placeholder="Observações…"
      onChange={e=>{setVal(e.target.value);setDirty(true);}}
      onBlur={()=>{if(dirty){onSave(val);setDirty(false);}}}
      onKeyDown={e=>{if(e.key==="Escape"){setVal(notes||"");setDirty(false);ta.current?.blur();}}}/>
  );
}
function NfBadge({status}){
  const s=NF_COLORS[status]||NF_COLORS["Não emitida"];
  return <span className="nf-status-badge" style={{background:s.bg,color:s.color,borderColor:s.border}}>{status}</span>;
}
function dlColor(d){return d==null?BLK:d<=7?RED:d<=14?AMB:GRN;}

// ─── Dashboard (list) ─────────────────────────────────────
function Dashboard({contracts,posts,stats,eurRate,saveNote,toggleComm,toggleCommPaid,saveNF,setModal}){
  const [open,setOpen]=useState({});
  const toggle=id=>setOpen(p=>({...p,[id]:!p[id]}));

  return(
    <>
      <div className="phd">Veloso 2026 — OP <div className="rule"/>
        <button className="btn red sm" onClick={()=>setModal({type:"contract",data:null})}>+ Novo Contrato</button>
      </div>

      {/* KPIs */}
      <div className="kpi-row">
        <div className="kpi"><div className="kpi-lbl">Contratos</div><div className="kpi-val">{contracts.length}</div><div className="kpi-sub">{contracts.filter(c=>c.paymentType==="monthly").length} mensais</div></div>
        <div className="kpi"><div className="kpi-lbl">Volume BRL</div><div className="kpi-val xs">{fmtMoney(stats.totBrl)}</div>{stats.totEur>0&&<div className="kpi-sub">+ {fmtMoney(stats.totEur,"EUR")}{eurRate>0?` ≈ ${fmtMoney(stats.totEur*eurRate)}`:""}</div>}</div>
        <div className="kpi"><div className="kpi-lbl">Comissão Total</div><div className="kpi-val xs red">{fmtMoney(stats.commBrl)}</div><div className="kpi-sub">{fmtMoney(stats.commPaid)} recebido</div></div>
        <div className="kpi"><div className="kpi-lbl">Com. Pendente</div><div className="kpi-val sm" style={{color:stats.commPending>0?AMB:GRN}}>{fmtMoney(stats.commPending)}</div><div className="kpi-sub">a receber</div></div>
        <div className="kpi"><div className="kpi-lbl">NF Pendentes</div><div className="kpi-val" style={{color:stats.nfPendente>0?AMB:GRN}}>{stats.nfPendente}</div><div className="kpi-sub">não emitidas</div></div>
        <div className="kpi"><div className="kpi-lbl">Posts/Reels</div><div className="kpi-val">{stats.dp}<span style={{fontSize:13,color:MID,fontWeight:400}}>/{stats.tp}</span></div><div className="kpi-sub">entregues</div></div>
        <div className="kpi"><div className="kpi-lbl">Stories</div><div className="kpi-val">{stats.ds}<span style={{fontSize:13,color:MID,fontWeight:400}}>/{stats.ts}</span></div><div className="kpi-sub">entregues</div></div>
        <div className="kpi"><div className="kpi-lbl">Engaj. Médio</div>
          <div className="kpi-val sm" style={{color:stats.avgEng!=null?(stats.avgEng>=3?GRN:stats.avgEng>=1?AMB:MID):MID}}>
            {stats.avgEng!=null?stats.avgEng.toFixed(2)+"%":"—"}
          </div><div className="kpi-sub grn">auto</div></div>
      </div>

      {/* Contract list */}
      <div className="contract-list">
        {/* Header row */}
        <div style={{display:"flex",alignItems:"center",padding:"6px 14px 6px 18px",borderBottom:`2px solid ${LN}`,background:SUF}}>
          <div style={{flex:"0 0 4px",marginLeft:0,marginRight:14}}/>
          <div style={{flex:1,fontSize:"9px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID}}>Empresa</div>
          <div style={{width:120,fontSize:"9px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID,textAlign:"right"}}>Valor Total</div>
          <div style={{width:100,fontSize:"9px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID,textAlign:"right"}}>Prazo</div>
          <div style={{width:140,fontSize:"9px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID,textAlign:"center"}}>Entregas</div>
          <div style={{width:120,fontSize:"9px",fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:MID,textAlign:"center"}}>Nota Fiscal</div>
          <div style={{width:36}}/>
        </div>

        {contracts.map(c=>{
          const isOpen=!!open[c.id];
          const cp=posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
          const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
          const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link").length;
          const cr=posts.filter(p=>p.contractId===c.id&&(p.type==="repost"||p.type==="tiktok")).length;
          const totDel=c.numPosts+c.numStories+c.numCommunityLinks+c.numReposts;
          const doneDel=cp+cs+cl+cr;
          const total=contractTotal(c);
          const dl=daysLeft(c.contractDeadline);
          const commEntries=getCommEntries(c);

          return(
            <div key={c.id} className={`contract-row${isOpen?" open":""}`}>
              {/* Row */}
              <div className="contract-row-hd" onClick={()=>toggle(c.id)}>
                <div className="c-bar" style={{background:c.color}}/>
                <div className="crow-main">
                  {/* Name + badges */}
                  <div className="crow-name">
                    <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap"}}>
                      {c.company}
                      {c.paymentType==="monthly"&&<span className="badge b-monthly">Mensal</span>}
                      {c.currency==="EUR"&&<span className="badge b-eur">EUR</span>}
                      {total===0&&<span className="badge b-tbd">TBD</span>}
                    </div>
                  </div>

                  {/* Spacer */}
                  <div style={{flex:1}}/>

                  {/* Value */}
                  <div className="crow-val" style={{width:120}}>
                    <div style={{fontWeight:700}}>{total>0?fmtMoney(total,c.currency):"—"}</div>
                    {c.currency==="EUR"&&eurRate>0&&total>0&&<div style={{fontSize:10,color:MID}}>≈{fmtMoney(total*eurRate)}</div>}
                  </div>

                  {/* Deadline */}
                  <div className="crow-deadline" style={{width:100,color:dl!=null?dlColor(dl):MID}}>
                    {c.contractDeadline?(
                      <>
                        <div style={{fontWeight:dl!=null&&dl<=7?700:400}}>{fmtDate(c.contractDeadline)}</div>
                        {dl!=null&&<div style={{fontSize:9,fontWeight:700}}>{dl}d</div>}
                      </>
                    ):<span style={{color:MID,fontSize:11}}>—</span>}
                  </div>

                  {/* Deliveries progress */}
                  <div className="crow-prog" style={{width:140,justifyContent:"center",flexDirection:"column",alignItems:"stretch",gap:3}}>
                    <div className="crow-prog-bar" style={{maxWidth:"100%"}}>
                      <div className="crow-prog-fill" style={{width:`${totDel?Math.min(100,doneDel/totDel*100):0}%`,background:c.color}}/>
                    </div>
                    <div className="crow-prog-txt" style={{fontSize:9,textAlign:"center"}}>
                      {doneDel}/{totDel} entregas
                    </div>
                  </div>

                  {/* NF badge */}
                  <div className="crow-nf" style={{width:120,display:"flex",justifyContent:"center"}} onClick={e=>e.stopPropagation()}>
                    <NfBadge status={c.nfStatus||"Não emitida"}/>
                  </div>
                </div>
                {/* Chevron */}
                <div className="crow-chevron">›</div>
              </div>

              {/* Expanded panel */}
              {isOpen&&(
                <div className="contract-panel">
                  <div className="panel-grid">

                    {/* 1 — Entregas */}
                    <div className="panel-section">
                      <div className="panel-ttl">Entregas</div>
                      {[
                        {lbl:"Posts / Reels", done:cp, total:c.numPosts, color:c.color},
                        {lbl:"Stories",       done:cs, total:c.numStories, color:"#7C3AED"},
                        {lbl:"Links Comun.",  done:cl, total:c.numCommunityLinks, color:"#059669"},
                        {lbl:"Reposts / TT",  done:cr, total:c.numReposts, color:"#0891B2"},
                      ].map(b=>(
                        <div key={b.lbl} className="del-row">
                          <span className="del-lbl">{b.lbl}</span>
                          <div className="del-prog">
                            <div className="del-bar"><div className="del-fill" style={{width:`${b.total?Math.min(100,b.done/b.total*100):0}%`,background:b.color}}/></div>
                            <span className="del-num">{b.done}/{b.total}</span>
                          </div>
                        </div>
                      ))}
                      <div style={{marginTop:6}}>
                        <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Pagamento</div>
                        <div style={{fontSize:11,color:MID}}>
                          {c.paymentType==="monthly"?(
                            <span>{fmtMoney(c.monthlyValue)}/mês · {monthsBetween(c.contractStart,c.contractDeadline)||"?"} meses</span>
                          ):c.paymentType==="split"?(
                            <span>1ª {fmtMoney(c.parc1Value)} {fmtDate(c.parc1Deadline)} · 2ª {fmtMoney(c.parc2Value)} {fmtDate(c.parc2Deadline)}</span>
                          ):(
                            <span>{fmtDate(c.paymentDeadline)}</span>
                          )}
                        </div>
                      </div>
                      <div style={{marginTop:6}}>
                        <CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/>
                      </div>
                      <InlineNotes notes={c.notes} onSave={v=>saveNote(c.id,v)}/>
                    </div>

                    {/* 2 — Comissões */}
                    <div className="panel-section">
                      <div className="panel-ttl">Comissões da Agência</div>
                      {commEntries.length===0&&<div style={{fontSize:11,color:MID,fontStyle:"italic"}}>Sem comissão neste contrato</div>}
                      {commEntries.map(e=>(
                        <div key={e.key} className="comm-entry">
                          <div style={{flex:1,fontWeight:600}}>{e.label}</div>
                          {e.date&&<div style={{color:MID,fontSize:10}}>{fmtDate(e.date)}</div>}
                          <div style={{fontWeight:700,color:RED,fontVariantNumeric:"tabular-nums",fontSize:12}}>{fmtMoney(e.amount,e.currency)}</div>
                          <div className={`comm-status${e.isPaid?" paid":" pending"}`}
                            onClick={()=>toggleCommPaid(c.id,e.key)}>
                            {e.isPaid?"✓ Pago":"Pendente"}
                          </div>
                        </div>
                      ))}
                      {commEntries.length>0&&(
                        <div style={{marginTop:8,paddingTop:8,borderTop:`1px solid ${LN}`,display:"flex",justifyContent:"space-between",fontSize:11}}>
                          <span style={{color:MID}}>Recebido:</span>
                          <span style={{color:GRN,fontWeight:700}}>{fmtMoney(commEntries.filter(e=>e.isPaid).reduce((s,e)=>s+e.amount,0),c.currency)}</span>
                        </div>
                      )}
                    </div>

                    {/* 3 — Nota Fiscal */}
                    <div className="panel-section">
                      <div className="panel-ttl">Nota Fiscal</div>
                      <NFPanel c={c} onSave={data=>saveNF(c.id,data)}/>
                    </div>

                  </div>
                </div>
              )}
            </div>
          );
        })}
        {contracts.length===0&&<div style={{padding:40,textAlign:"center",color:MID}}>Nenhum contrato. Clique em "+ Novo Contrato".</div>}
      </div>
    </>
  );
}

// ─── NF Panel ─────────────────────────────────────────────
function NFPanel({c, onSave}){
  const [nfStatus, setNfStatus] = useState(c.nfStatus||"Não emitida");
  const [nfNumber, setNfNumber] = useState(c.nfNumber||"");
  const [nfDate,   setNfDate]   = useState(c.nfDate||"");
  const [nfNotes,  setNfNotes]  = useState(c.nfNotes||"");

  useEffect(()=>{
    setNfStatus(c.nfStatus||"Não emitida");
    setNfNumber(c.nfNumber||"");
    setNfDate(c.nfDate||"");
    setNfNotes(c.nfNotes||"");
  },[c.id]);

  const save = (overrides={}) => onSave({
    nfStatus: overrides.nfStatus??nfStatus,
    nfNumber: overrides.nfNumber??nfNumber,
    nfDate:   overrides.nfDate??nfDate,
    nfNotes:  overrides.nfNotes??nfNotes,
  });

  const nfColors = NF_COLORS[nfStatus]||NF_COLORS["Não emitida"];

  return(
    <div style={{display:"flex",flexDirection:"column",gap:8}}>
      <div>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Status</div>
        <select className="nf-select" value={nfStatus}
          style={{borderColor:nfColors.border,color:nfColors.color,background:nfColors.bg,fontWeight:700}}
          onChange={e=>{setNfStatus(e.target.value);save({nfStatus:e.target.value});}}>
          {NF_STATUS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
        <div>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Número da NF</div>
          <input className="nf-field" value={nfNumber} placeholder="Ex: 1234"
            onChange={e=>setNfNumber(e.target.value)}
            onBlur={()=>save()}/>
        </div>
        <div>
          <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Data de Emissão</div>
          <input className="nf-field" type="date" value={nfDate}
            onChange={e=>{setNfDate(e.target.value);save({nfDate:e.target.value});}}/>
        </div>
      </div>
      <div>
        <div style={{fontSize:9,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:MID,marginBottom:4}}>Observações NF</div>
        <textarea className="nf-field" value={nfNotes} rows={2}
          placeholder="Competência, empresa tomadora, ISS…"
          style={{resize:"none"}}
          onChange={e=>setNfNotes(e.target.value)}
          onBlur={()=>save()}/>
      </div>
      {nfNumber&&<div style={{fontSize:10,color:MID}}>NF #{nfNumber}{nfDate?` · emitida em ${fmtDate(nfDate)}`:""}</div>}
    </div>
  );
}

// ─── Contratos ────────────────────────────────────────────
function Contratos({contracts,posts,saveC,setModal,toggleComm,saveNote,eurRate}){
  const del=async id=>{if(confirm("Excluir?"))await saveC(contracts.filter(c=>c.id!==id));};
  const payCell=c=>{
    if(c.paymentType==="monthly"){const m=monthsBetween(c.contractStart,c.contractDeadline);return <div style={{fontSize:11}}><span className="badge b-monthly" style={{marginRight:4}}>Mensal</span>{fmtMoney(c.monthlyValue)}/mês{m?` · ${m}m`:""}</div>;}
    if(c.paymentType==="split")return(<div style={{fontSize:11,lineHeight:1.7}}><div><b style={{color:MID}}>1ª</b> {fmtMoney(c.parc1Value,c.currency)} · {fmtDate(c.parc1Deadline)}</div><div><b style={{color:MID}}>2ª</b> {fmtMoney(c.parc2Value,c.currency)} · {fmtDate(c.parc2Deadline)}</div></div>);
    return <span style={{fontSize:12}}>{fmtDate(c.paymentDeadline)}</span>;
  };
  return(
    <>
      <div className="phd">Contratos <div className="rule"/>
        <button className="btn red sm" onClick={()=>setModal({type:"contract",data:null})}>+ Novo Contrato</button>
      </div>
      <div className="blk" style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr>
            <th/><th>Empresa</th><th className="num">Valor</th><th>Comissão</th>
            <th>Pagamento</th><th>Prazo</th>
            <th className="num">Posts</th><th className="num">Stories</th><th className="num">Links</th><th className="num">Rep.</th>
            <th>NF</th><th style={{minWidth:160}}>Obs.</th><th/>
          </tr></thead>
          <tbody>
            {contracts.map(c=>{
              const cp=posts.filter(p=>p.contractId===c.id&&p.type==="post").length;
              const cs=posts.filter(p=>p.contractId===c.id&&p.type==="story").length;
              const cl=posts.filter(p=>p.contractId===c.id&&p.type==="link").length;
              const cr=posts.filter(p=>p.contractId===c.id&&(p.type==="repost"||p.type==="tiktok")).length;
              const dl=daysLeft(c.contractDeadline);
              const total=contractTotal(c);
              return(
                <tr key={c.id}>
                  <td><span className="dot" style={{background:c.color}}/></td>
                  <td style={{fontWeight:600}}><div style={{display:"flex",alignItems:"center",gap:4,flexWrap:"wrap"}}>{c.company}{c.paymentType==="monthly"&&<span className="badge b-monthly">Mensal</span>}{c.currency==="EUR"&&<span className="badge b-eur">EUR</span>}</div></td>
                  <td className="num" style={{fontWeight:600}}>{total>0?fmtMoney(total,c.currency):"—"}{c.currency==="EUR"&&eurRate>0&&total>0&&<div style={{fontSize:10,color:MID}}>≈{fmtMoney(total*eurRate)}</div>}</td>
                  <td><CommToggle on={c.hasCommission} onToggle={()=>toggleComm(c.id)} label/>{c.hasCommission&&total>0&&<div style={{fontSize:10,color:RED,fontWeight:700}}>{fmtMoney(total*COMM_RATE,c.currency)}</div>}</td>
                  <td>{payCell(c)}</td>
                  <td style={{color:dl!=null&&dl<=7?RED:dl!=null&&dl<=14?AMB:BLK,fontWeight:dl!=null&&dl<=7?700:400}}>{fmtDate(c.contractDeadline)}</td>
                  <td className="num">{cp}/{c.numPosts}</td>
                  <td className="num">{cs}/{c.numStories}</td>
                  <td className="num">{cl}/{c.numCommunityLinks}</td>
                  <td className="num">{cr}/{c.numReposts}</td>
                  <td><NfBadge status={c.nfStatus||"Não emitida"}/>{c.nfNumber&&<div style={{fontSize:9,color:MID,marginTop:2}}>#{c.nfNumber}</div>}</td>
                  <td><InlineNotes notes={c.notes} onSave={v=>saveNote(c.id,v)}/></td>
                  <td><div style={{display:"flex",gap:4}}><button className="btn ghost sm" onClick={()=>setModal({type:"contract",data:c})}>editar</button><button className="btn ghost sm" style={{color:RED}} onClick={()=>del(c.id)}>×</button></div></td>
                </tr>
              );
            })}
            {contracts.length===0&&<tr><td colSpan={13} style={{textAlign:"center",padding:40,color:MID}}>Nenhum contrato.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Posts ────────────────────────────────────────────────
function Posts({contracts,posts,saveP,setModal}){
  const [filter,setFilter]=useState("all");
  const filtered=[...(filter==="all"?posts:posts.filter(p=>p.contractId===filter))].sort((a,b)=>new Date(b.publishDate)-new Date(a.publishDate));
  const del=async id=>{if(confirm("Excluir?"))await saveP(posts.filter(p=>p.id!==id));};
  const BADGE={post:"b-post",story:"b-story",link:"b-link",repost:"b-repost",tiktok:"b-tiktok"};
  const LABEL={post:"Reel/Post",story:"Story",link:"Link",repost:"Repost",tiktok:"TikTok"};
  const engClass=e=>e==null?"low":e>=3?"high":e>=1?"mid":"low";
  return(
    <>
      <div className="phd">Posts & Entregas <div className="rule"/>
        <button className="btn red sm" onClick={()=>setModal({type:"post",data:null})}>+ Registrar</button>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        <div className={`chip${filter==="all"?" act":""}`} onClick={()=>setFilter("all")}>Todos ({posts.length})</div>
        {contracts.map(c=>(
          <div key={c.id} className={`chip${filter===c.id?" act":""}`} onClick={()=>setFilter(c.id)} style={{display:"flex",alignItems:"center",gap:4}}>
            <span className="dot" style={{background:c.color,width:6,height:6}}/>{c.company.split("/")[0].trim()}
          </div>
        ))}
      </div>
      <div className="blk" style={{overflowX:"auto"}}>
        <table className="tbl">
          <thead><tr>
            <th>Data</th><th>Tipo</th><th>Título</th><th>Contrato</th><th>Redes</th>
            <th className="num">Impr.</th><th className="num">Alcance</th>
            <th className="num">Curtidas</th><th className="num">Com.</th><th className="num">Shares</th><th className="num">Saves</th>
            <th className="num">Engaj.%</th><th>Link</th><th/>
          </tr></thead>
          <tbody>
            {filtered.map(p=>{
              const c=contracts.find(x=>x.id===p.contractId);
              const eng=calcEngagement(p);
              return(
                <tr key={p.id}>
                  <td style={{whiteSpace:"nowrap",fontVariantNumeric:"tabular-nums"}}>{fmtDate(p.publishDate)}</td>
                  <td><span className={`badge ${BADGE[p.type]||"b-post"}`}>{LABEL[p.type]||p.type}</span></td>
                  <td style={{maxWidth:180,fontWeight:500}}>{p.title}</td>
                  <td>{c&&<span style={{display:"flex",alignItems:"center",gap:5}}><span className="dot" style={{background:c.color}}/><span style={{fontSize:11}}>{c.company.split("/")[0].trim()}</span></span>}</td>
                  <td style={{maxWidth:130}}><div style={{display:"flex",flexWrap:"wrap",gap:3}}>{(p.networks||[]).length>0?(p.networks||[]).map(n=><span key={n} className="net-badge">{n}</span>):<span style={{color:MID,fontSize:11}}>—</span>}</div></td>
                  <td className="num">{Number(p.impressions||0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.reach||0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.likes||0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.comments||0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.shares||0).toLocaleString("pt-BR")}</td>
                  <td className="num">{Number(p.saves||0).toLocaleString("pt-BR")}</td>
                  <td className="num">{eng!=null?<span className={`eng-pill ${engClass(eng)}`} style={{fontWeight:700,fontVariantNumeric:"tabular-nums",color:eng>=3?GRN:eng>=1?AMB:MID}}>{eng.toFixed(2)}%<span className="eng-auto">●</span></span>:<span style={{color:MID}}>—</span>}</td>
                  <td>{p.link?<a href={p.link} style={{color:RED,fontSize:11}} target="_blank" rel="noreferrer">↗</a>:<span style={{color:MID}}>—</span>}</td>
                  <td><div style={{display:"flex",gap:4}}><button className="btn ghost sm" onClick={()=>setModal({type:"post",data:p})}>editar</button><button className="btn ghost sm" style={{color:RED}} onClick={()=>del(p.id)}>×</button></div></td>
                </tr>
              );
            })}
            {filtered.length===0&&<tr><td colSpan={14} style={{textAlign:"center",padding:36,color:MID}}>Nenhum post.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Calendário ───────────────────────────────────────────
function Calendario({contracts,calEvents,calMonth,setCal,calFilter,setCalF}){
  const {y,m}=calMonth;
  const firstDay=new Date(y,m,1).getDay(),daysInMo=new Date(y,m+1,0).getDate();
  const todayStr=new Date().toISOString().substr(0,10);
  const cells=[];
  for(let i=0;i<firstDay;i++)cells.push(null);
  for(let d=1;d<=daysInMo;d++)cells.push(d);
  while(cells.length%7)cells.push(null);
  const prev=()=>setCal(p=>{const d=new Date(p.y,p.m-1,1);return{y:d.getFullYear(),m:d.getMonth()};});
  const next=()=>setCal(p=>{const d=new Date(p.y,p.m+1,1);return{y:d.getFullYear(),m:d.getMonth()};});
  return(
    <>
      <div className="phd">Calendário <div className="rule"/>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button className="btn sm" onClick={prev}>←</button>
          <span style={{fontWeight:700,fontSize:11,minWidth:150,textAlign:"center",letterSpacing:".06em"}}>{MONTHS_PT[m].toUpperCase()} {y}</span>
          <button className="btn sm" onClick={next}>→</button>
        </div>
      </div>
      <div style={{display:"flex",gap:6,marginBottom:14,flexWrap:"wrap"}}>
        <div className={`chip${calFilter==="all"?" act":""}`} onClick={()=>setCalF("all")}>Todos</div>
        {contracts.map(c=>(
          <div key={c.id} className={`chip${calFilter===c.id?" act":""}`} onClick={()=>setCalF(c.id)} style={{display:"flex",alignItems:"center",gap:4}}>
            <span className="dot" style={{background:c.color,width:6,height:6}}/>{c.company.split("/")[0].trim()}
          </div>
        ))}
      </div>
      <div className="blk">
        <div className="cal-hd-row">{["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"].map(d=><div key={d} className="cal-hd-cell">{d}</div>)}</div>
        <div className="cal-grid">
          {cells.map((d,i)=>{
            if(!d)return<div key={`e${i}`} className="cal-day cal-empty"/>;
            const ds=`${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
            const evs=calEvents[ds]||[];
            const isT=ds===todayStr;
            return(
              <div key={d} className={`cal-day${isT?" cal-today":""}`}>
                <div className="cal-dnum" style={{color:isT?RED:BLK}}>{d}</div>
                {evs.slice(0,3).map((ev,ei)=><div key={ei} className="cal-ev" style={{borderLeftColor:ev.color,background:ev.color+"1A",color:ev.color}}>{ev.label}</div>)}
                {evs.length>3&&<div style={{fontSize:8,color:MID}}>+{evs.length-3}</div>}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ─── Contract Modal ───────────────────────────────────────
function ContractModal({modal,setModal,contracts,saveC}){
  const isEdit=!!modal.data;
  const [f,setF]=useState(modal.data||{
    company:"",cnpj:"",contractDeadline:"",contractValue:"",currency:"BRL",
    monthlyValue:"",contractStart:"",
    paymentType:"single",paymentDeadline:"",
    parc1Value:"",parc1Deadline:"",parc2Value:"",parc2Deadline:"",
    hasCommission:true,commPaid:{},
    nfStatus:"Não emitida",nfNumber:"",nfDate:"",nfNotes:"",
    numPosts:0,numStories:0,numCommunityLinks:0,numReposts:0,
    color:CONTRACT_COLORS[contracts.length%CONTRACT_COLORS.length],
    notes:""
  });
  const [pct,setPct]=useState(50);
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const syncPct=(p,tot)=>{const v1=Math.round((tot||Number(f.contractValue)||0)*(p/100));setF(x=>({...x,parc1Value:v1,parc2Value:(tot||Number(f.contractValue)||0)-v1}));setPct(p);};
  const months=f.paymentType==="monthly"?monthsBetween(f.contractStart,f.contractDeadline):null;
  const liveTotal=f.paymentType==="monthly"?(months?(Number(f.monthlyValue)||0)*months:0):Number(f.contractValue)||0;

  const handleSave=async()=>{
    if(!f.company)return alert("Preencha o nome da empresa.");
    const entry={...f,id:f.id||uid(),
      contractValue:f.paymentType==="monthly"?0:Number(f.contractValue)||0,
      monthlyValue:Number(f.monthlyValue)||0,
      numPosts:Number(f.numPosts)||0,numStories:Number(f.numStories)||0,
      numCommunityLinks:Number(f.numCommunityLinks)||0,numReposts:Number(f.numReposts)||0,
      parc1Value:Number(f.parc1Value)||0,parc2Value:Number(f.parc2Value)||0,
      commPaid:f.commPaid||{}};
    if(isEdit)await saveC(contracts.map(c=>c.id===entry.id?entry:c));
    else await saveC([...contracts,entry]);
    setModal(null);
  };

  return(
    <div className="modal">
      <div className="modal-hd">
        <span className="modal-t">{isEdit?"Editar Contrato":"Novo Contrato"}</span>
        <button className="btn ghost sm" onClick={()=>setModal(null)}>✕</button>
      </div>
      <div className="modal-bd">
        <div className="srule">Empresa</div>
        <div className="fgrid">
          <div className="field fcol"><label className="flbl">Nome da Empresa / Marca</label><input value={f.company} onChange={e=>set("company",e.target.value)} placeholder="ex: Netshoes"/></div>
          <div className="field"><label className="flbl">CNPJ</label><input value={f.cnpj} onChange={e=>set("cnpj",e.target.value)} placeholder="00.000.000/0001-00"/></div>
          <div className="field"><label className="flbl">Cor</label><input type="color" value={f.color} onChange={e=>set("color",e.target.value)} style={{height:36,padding:2,cursor:"pointer"}}/></div>
          <div className="field fcol"><label className="flbl">Observações</label><textarea value={f.notes} onChange={e=>set("notes",e.target.value)} placeholder="ex: embaixador chuteiras…"/></div>
        </div>

        <div className="srule">Financeiro & Pagamento</div>
        <div className="ptoggle">
          {[["single","Único"],["split","2 Parcelas"],["monthly","Mensal"]].map(([v,lbl])=>(
            <div key={v} className={`ptoggle-opt${f.paymentType===v?" act":""}`} onClick={()=>set("paymentType",v)}>{lbl}</div>
          ))}
        </div>

        {f.paymentType==="monthly"?(
          <div className="fgrid c3">
            <div className="field"><label className="flbl">Valor Mensal</label><input type="number" value={f.monthlyValue} onChange={e=>set("monthlyValue",e.target.value)} placeholder="0"/></div>
            <div className="field"><label className="flbl">Moeda</label><select value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></div>
            <div className="field"><label className="flbl" style={{display:"flex",alignItems:"center",gap:8}}>Comissão 20%<CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)}/></label><input readOnly className={f.hasCommission?"red-ro":""} value={f.hasCommission&&Number(f.monthlyValue)>0?`${fmtMoney(Number(f.monthlyValue)*COMM_RATE,f.currency)}/mês`:"Desativada"}/></div>
            <div className="field"><label className="flbl">Início</label><input type="date" value={f.contractStart} onChange={e=>set("contractStart",e.target.value)}/></div>
            <div className="field"><label className="flbl">Término</label><input type="date" value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></div>
            <div className="field"><label className="flbl">Total</label><input readOnly value={liveTotal>0&&months?`${months}m = ${fmtMoney(liveTotal,f.currency)}`:"—"}/></div>
          </div>
        ):f.paymentType==="split"?(
          <>
            <div className="fgrid c3" style={{marginBottom:10}}>
              <div className="field"><label className="flbl">Valor Total</label><input type="number" value={f.contractValue} onChange={e=>{set("contractValue",e.target.value);syncPct(pct,Number(e.target.value)||0);}} placeholder="0"/></div>
              <div className="field"><label className="flbl">Moeda</label><select value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></div>
              <div className="field"><label className="flbl" style={{display:"flex",alignItems:"center",gap:8}}>Comissão<CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)}/></label><input readOnly className={f.hasCommission?"red-ro":""} value={f.hasCommission&&f.contractValue?fmtMoney(Number(f.contractValue)*COMM_RATE,f.currency):"Desativada"}/></div>
            </div>
            <div style={{marginBottom:10}}><div className="flbl" style={{marginBottom:4}}>Divisão: {pct}% / {100-pct}%{Number(f.contractValue)>0?` = ${fmtMoney(Math.round(Number(f.contractValue)*pct/100),f.currency)} / ${fmtMoney(Number(f.contractValue)-Math.round(Number(f.contractValue)*pct/100),f.currency)}`:""}</div><input type="range" min="10" max="90" step="5" value={pct} onChange={e=>syncPct(Number(e.target.value))} style={{width:"100%"}}/></div>
            <div className="fgrid" style={{marginBottom:10}}>
              <div className="field"><label className="flbl">1ª Parcela — Valor</label><input type="number" value={f.parc1Value} onChange={e=>set("parc1Value",e.target.value)}/></div>
              <div className="field"><label className="flbl">1ª Parcela — Data</label><input type="date" value={f.parc1Deadline} onChange={e=>set("parc1Deadline",e.target.value)}/></div>
              <div className="field"><label className="flbl">2ª Parcela — Valor</label><input type="number" value={f.parc2Value} onChange={e=>set("parc2Value",e.target.value)}/></div>
              <div className="field"><label className="flbl">2ª Parcela — Data</label><input type="date" value={f.parc2Deadline} onChange={e=>set("parc2Deadline",e.target.value)}/></div>
            </div>
            <div className="fgrid"><div className="field"><label className="flbl">Prazo Final</label><input type="date" value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></div></div>
          </>
        ):(
          <>
            <div className="fgrid c3">
              <div className="field"><label className="flbl">Valor</label><input type="number" value={f.contractValue} onChange={e=>set("contractValue",e.target.value)} placeholder="0"/></div>
              <div className="field"><label className="flbl">Moeda</label><select value={f.currency} onChange={e=>set("currency",e.target.value)}><option value="BRL">BRL</option><option value="EUR">EUR</option><option value="USD">USD</option></select></div>
              <div className="field"><label className="flbl" style={{display:"flex",alignItems:"center",gap:8}}>Comissão<CommToggle on={f.hasCommission} onToggle={()=>set("hasCommission",!f.hasCommission)}/></label><input readOnly className={f.hasCommission?"red-ro":""} value={f.hasCommission&&f.contractValue?fmtMoney(Number(f.contractValue)*COMM_RATE,f.currency):"Desativada"}/></div>
            </div>
            <div className="fgrid" style={{marginTop:10}}>
              <div className="field"><label className="flbl">Data de Pagamento</label><input type="date" value={f.paymentDeadline} onChange={e=>set("paymentDeadline",e.target.value)}/></div>
              <div className="field"><label className="flbl">Prazo Final</label><input type="date" value={f.contractDeadline} onChange={e=>set("contractDeadline",e.target.value)}/></div>
            </div>
          </>
        )}

        <div className="srule">Entregas</div>
        <div className="fgrid c4">
          {[["numPosts","Posts/Reels"],["numStories","Stories"],["numCommunityLinks","Links"],["numReposts","Reposts/TT"]].map(([k,lbl])=>(
            <div key={k} className="field"><label className="flbl">{lbl}</label><input type="number" min="0" value={f[k]} onChange={e=>set(k,e.target.value)}/></div>
          ))}
        </div>
      </div>
      <div className="modal-ft">
        <button className="btn" onClick={()=>setModal(null)}>Cancelar</button>
        <button className="btn red" onClick={handleSave}>{isEdit?"Salvar":"Criar Contrato"}</button>
      </div>
    </div>
  );
}

// ─── Post Modal ───────────────────────────────────────────
function PostModal({modal,setModal,contracts,posts,saveP}){
  const isEdit=!!modal.data;
  const [f,setF]=useState(modal.data||{contractId:contracts[0]?.id||"",title:"",link:"",type:"post",publishDate:new Date().toISOString().substr(0,10),impressions:"",reach:"",likes:"",comments:"",shares:"",saves:"",networks:[]});
  const set=(k,v)=>setF(x=>({...x,[k]:v}));
  const toggleNet=n=>setF(x=>({...x,networks:(x.networks||[]).includes(n)?(x.networks||[]).filter(v=>v!==n):[...(x.networks||[]),n]}));
  const liveEng=useMemo(()=>calcEngagement({likes:Number(f.likes)||0,comments:Number(f.comments)||0,shares:Number(f.shares)||0,saves:Number(f.saves)||0,reach:Number(f.reach)||0}),[f.likes,f.comments,f.shares,f.saves,f.reach]);
  const handleSave=async()=>{
    if(!f.contractId||!f.title)return alert("Preencha contrato e título.");
    const entry={...f,id:f.id||uid(),impressions:Number(f.impressions)||0,reach:Number(f.reach)||0,likes:Number(f.likes)||0,comments:Number(f.comments)||0,shares:Number(f.shares)||0,saves:Number(f.saves)||0,networks:f.networks||[]};
    if(isEdit)await saveP(posts.map(p=>p.id===entry.id?entry:p));
    else await saveP([...posts,entry]);
    setModal(null);
  };
  return(
    <div className="modal">
      <div className="modal-hd"><span className="modal-t">{isEdit?"Editar Post":"Registrar Entrega"}</span><button className="btn ghost sm" onClick={()=>setModal(null)}>✕</button></div>
      <div className="modal-bd">
        <div className="srule">Identificação</div>
        <div className="fgrid">
          <div className="field"><label className="flbl">Contrato</label><select value={f.contractId} onChange={e=>set("contractId",e.target.value)}>{contracts.map(c=><option key={c.id} value={c.id}>{c.company}</option>)}</select></div>
          <div className="field"><label className="flbl">Tipo de Entrega</label><select value={f.type} onChange={e=>set("type",e.target.value)}><option value="post">Reel / Post Feed</option><option value="story">Story</option><option value="link">Link Comunidade</option><option value="repost">Repost</option><option value="tiktok">TikTok</option></select></div>
          <div className="field fcol"><label className="flbl">Título / Descrição</label><input value={f.title} onChange={e=>set("title",e.target.value)} placeholder="ex: Reel Copa 2026 — Abertura"/></div>
          <div className="field"><label className="flbl">Data de Publicação</label><input type="date" value={f.publishDate} onChange={e=>set("publishDate",e.target.value)}/></div>
          <div className="field"><label className="flbl">Link</label><input value={f.link} onChange={e=>set("link",e.target.value)} placeholder="https://instagram.com/reel/..."/></div>
        </div>
        <div className="srule">Redes Sociais</div>
        <div className="net-chips">{NETWORKS.map(n=><div key={n} className={`net-chip${(f.networks||[]).includes(n)?" sel":""}`} onClick={()=>toggleNet(n)}>{(f.networks||[]).includes(n)&&<span style={{fontSize:9}}>✓</span>}{n}</div>)}</div>
        <div className="srule">Métricas</div>
        <div className="metric-grid">
          {[["impressions","Impressões"],["reach","Alcance"],["likes","Curtidas"],["comments","Comentários"],["shares","Compartilhamentos"],["saves","Saves"]].map(([k,lbl])=>(
            <div key={k} className="field"><label className="flbl">{lbl}</label><input type="number" min="0" value={f[k]} onChange={e=>set(k,e.target.value)} placeholder="0"/></div>
          ))}
        </div>
        <div style={{marginTop:12,display:"flex",alignItems:"flex-start",gap:12}}>
          <div className="field" style={{flex:1}}>
            <label className="flbl" style={{display:"flex",alignItems:"center",gap:5}}>Taxa de Engajamento<span className="eng-auto">auto</span></label>
            <div className="metric-computed">{liveEng!=null?liveEng.toFixed(2)+"%":"— (preencha alcance e interações)"}</div>
          </div>
          <div style={{fontSize:10,color:MID,maxWidth:180,lineHeight:1.6,paddingTop:16}}>(curtidas + com. + shares + saves) ÷ alcance × 100</div>
        </div>
      </div>
      <div className="modal-ft"><button className="btn" onClick={()=>setModal(null)}>Cancelar</button><button className="btn red" onClick={handleSave}>{isEdit?"Salvar":"Registrar"}</button></div>
    </div>
  );
}
