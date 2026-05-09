import { AMB, BLU, GRN, RED, TX2, TX3 } from "./tokens.js";
import {
  LayoutDashboard, FileText, Circle, Clock, AlertCircle, CheckCircle2,
  Minus, Zap, ArrowUp, ArrowDown, KanbanSquare, Banknote, Landmark,
} from "lucide-react";

// ─── View types ───────────────────────────────────────────
export const VIEW_TYPES = new Set(["post","tiktok","repost"]);

// ─── Task board ───────────────────────────────────────────
export const TASK_STATUSES = [
  { id:"backlog",     label:"Backlog",       icon:Circle,        color:"#475569" },
  { id:"todo",        label:"A fazer",       icon:Circle,        color:"#94A3B8" },
  { id:"in_progress", label:"Em andamento",  icon:Clock,         color:AMB },
  { id:"in_review",   label:"Em revisão",    icon:AlertCircle,   color:BLU },
  { id:"done",        label:"Concluído",     icon:CheckCircle2,  color:GRN },
  { id:"cancelled",   label:"Cancelado",     icon:Minus,         color:"#334155" },
];

export const TASK_PRIORITIES = [
  { id:"urgent", label:"Urgente", icon:Zap,      color:RED },
  { id:"high",   label:"Alto",    icon:ArrowUp,  color:AMB },
  { id:"medium", label:"Médio",   icon:Minus,    color:BLU },
  { id:"low",    label:"Baixo",   icon:ArrowDown,color:TX2 },
  { id:"none",   label:"Sem prio",icon:Minus,    color:TX3 },
];

// ─── Navigation ───────────────────────────────────────────
export const NAV_ITEMS = [
  { id:"dashboard",      label:"Dashboard",  icon:LayoutDashboard },
  { id:"acompanhamento", label:"Produção",   icon:KanbanSquare },
  { id:"contratos",      label:"Contratos",  icon:FileText },
  { id:"financeiro",     label:"Financeiro", icon:Banknote },
  { id:"caixa",          label:"Caixa",      icon:Landmark },
];

// ─── Pipeline / Production ────────────────────────────────
export const STAGES = [
  { id:"briefing",    label:"Briefing",    days:-9, resp:"Marca → Matheus", minDays:2, rule:"Marca envia briefing"                         },
  { id:"roteiro",     label:"Roteiro",     days:-7, resp:"Lucas",           minDays:2, rule:"Mín. 2 dias para roteirizar"                   },
  { id:"ap_roteiro",  label:"Ap. Roteiro", days:-5, resp:"Marca",           minDays:1, rule:"1 dia para marca aprovar o roteiro"             },
  { id:"gravacao",    label:"Gravação",    days:-4, resp:"Lucas",           minDays:1, rule:"Gravação 1 dia após aprovação do roteiro"       },
  { id:"edicao",      label:"Edição",      days:-2, resp:"Leandro",         minDays:2, rule:"Mín. 2 dias entre gravação e envio para edição" },
  { id:"ap_final",    label:"Ap. Final",   days:-1, resp:"Marca",           minDays:1, rule:"1 dia para aprovação final"                    },
  { id:"postagem",    label:"Postagem",    days:0,  resp:"Lucas",           minDays:0, rule:"Post vai ao ar"                                },
  { id:"done",        label:"✓ Entregue",  days:0,  resp:"",                minDays:0, rule:""                                              },
];

export const STAGE_IDS = STAGES.map(s => s.id);

export const PRODUCTION_RULES = {
  minDaysTotal: 9,
  roteiro:     2,
  gravacao:    1,
  edicao:      2,
  bottleneck: "Lucas",
  lucasDaysPerDeliverable: 3,
  maxPubliPerWeek:   3,
  idealPubliPerWeek: 2,
  maxPerWeek: 2,
};

// ─── Seed data ────────────────────────────────────────────
export const SEED = [
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

export const SEED_POSTS = [
  { id:"p1",contractId:"c3",title:"Reel Coca-Cola Copa #1",link:"",type:"post",plannedDate:"2026-06-05",publishDate:"",isPosted:false,views:0,reach:0,likes:0,comments:0,shares:0,saves:0,networks:["Instagram"] },
  { id:"p2",contractId:"c7",title:"Reel Cacau Show #1",link:"",type:"post",plannedDate:"2026-06-10",publishDate:"",isPosted:false,views:0,reach:0,likes:0,comments:0,shares:0,saves:0,networks:["Instagram"] },
];
