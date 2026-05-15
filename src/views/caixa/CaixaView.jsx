/**
 * src/views/caixa/CaixaView.jsx
 *
 * View Controle Financeiro (Caixa) extraÃ­da de App.jsx.
 * MigraÃ§Ã£o incremental â Fase 5.
 *
 * Exporta: Caixa (default export via React.lazy em App.jsx)
 *
 * DependÃªncias externas:
 *   react Â· firebase/firestore (via db.js) Â· design system (ui/index.js)
 *   src/lib/finance.js Â· src/lib/format.js Â· src/lib/url-state.js
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useCaixaSession } from "../../lib/caixaSession.js";
import {
  loadCaixaTx, subscribeCaixaTx, syncCaixaTx, getSetting, setSetting, deleteItem,
} from "../../db.js";
import CaixaGate from "./CaixaGate.jsx";
import { theme as ds, Button as DsButton, IconButton as DsIconButton, Icon as DsIcon, Input as DsInput, Card as DsCard, Modal as DsModal, Toggle as DsToggle, Select as DsSelect } from "../../ui/index.js";
import {
  aggregate, monthlyBreakdown, burnRate as calcBurnRate,
  liquidityRatio, futureInstallments as calcFutureInstallments,
  isInflow, isOutflow, isDividend, isTax,
  TX_TYPES as FIN_TX, sum as finSum,
} from "../../lib/finance.js";
import { formatDate } from "../../lib/format.js";
import { useQueryState } from "../../lib/url-state.js";
import {
  defaultPeriod, periodForPreset, shiftPeriod, canNavigate,
  periodLabel as getPeriodLabel, periodDays, serializePeriod, parsePeriod,
  monthInPeriod,
} from "../../lib/period.js";

// âââ Tokens (local â mirrors App.jsx globals) âââââââââââââ
// These are duplicated intentionally until a shared tokens file exists.
// TODO Fase 6: move to src/lib/tokens.js and import from there.
const B1  = "#FEFEFE";
const B2  = "#F7F7F7";
const B3  = "#EFEFEF";
const LN  = "#F0F0F2";
const LN2 = "#D8D8D8";
const TX  = "#000000";
const TX2 = "#6E6E6E";
const TX3 = "#ABABAB";
const RED = "#C8102E";
const GRN = "#16A34A";
const AMB = "#D97706";
const BLU = "#2563EB";
const COPILOT_PURPLE = "#7C3AED";
const G   = { background:ds.color.neutral[0], border:ds.border.thin, borderRadius:ds.radius.xl, boxShadow:ds.shadow.sm };
const TRANS = `all ${ds.motion.base}`;

// âââ Mini utility functions (local copies) ââââââââââââââââ
// TODO Fase 6: import from src/lib/utils.js

function fmtMoney(v, currency = "BRL") {
  if (v === null || v === undefined) return "â";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency, minimumFractionDigits:0, maximumFractionDigits:0 }).format(v || 0);
}
const fmtDate = (s) => {
  try {
    if (!s) return "â";
    const parts = String(s).split("-");
    if (parts.length < 3) return "â";
    const [y,m,d] = parts;
    return `${d}/${m}/${y}`;
  } catch { return "â"; }
};
function lsLoad(k, fb) { try { const v=localStorage.getItem(k); return v!=null?JSON.parse(v):fb; } catch { return fb; } }
function lsSave(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
const uid = () => Math.random().toString(36).substr(2, 9);
function useIsMobile()  { const [m, setM] = useState(window.innerWidth < 768); useEffect(()=>{ const h=()=>setM(window.innerWidth<768); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]); return m; }



// âââ Local UI micro-components ââââââââââââââââââââââââââââ
function Btn({ children, onClick, variant="default", size="md", icon, style:xs, disabled }) {
  const v = variant==="primary"?"primary":variant==="danger"?"danger":variant==="ghost"?"ghost":"secondary";
  return <DsButton variant={v} size={size==="sm"?"sm":size==="lg"?"lg":"md"} onClick={onClick} disabled={disabled}
    leftIcon={icon} style={xs}>{children}</DsButton>;
}
function Field({ label, children, full }) {
  return (
    <div style={{ display:"flex",flexDirection:"column",gap:4,width:full?"100%":undefined }}>
      {label&&<label style={{ fontSize:ds.font.size.xs,fontWeight:ds.font.weight.medium,letterSpacing:".06em",textTransform:"uppercase",color:TX2 }}>{label}</label>}
      {children}
    </div>
  );
}
function SRule({ children }) {
  return <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX3,display:"flex",alignItems:"center",gap:10,margin:"18px 0 12px" }}>
    {children}<div style={{ flex:1,height:1,background:LN }}/>
  </div>;
}
function Input({ value, onChange, placeholder, type="text", style:xs, ...rest }) {
  return <input value={value} onChange={onChange} placeholder={placeholder} type={type}
    style={{ width:"100%",padding:"8px 12px",fontSize:13,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",...xs }}
    className="ranked-field" {...rest}/>;
}
function Select({ value, onChange, children, style:xs }) {
  return <select value={value} onChange={onChange} className="ranked-field"
    style={{ width:"100%",height:40,padding:"0 12px",fontSize:13,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",...xs }}>{children}</select>;
}
function Textarea({ value, onChange, placeholder, rows=3, style:xs }) {
  return <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows} className="ranked-field"
    style={{ width:"100%",padding:"8px 12px",fontSize:13,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",resize:"vertical",outline:"none",...xs }}/>;
}
function Modal({ title, onClose, children, footer, width=640 }) {
  useEffect(()=>{ const h=(e)=>{if(e.key==="Escape")onClose();}; window.addEventListener("keydown",h); return()=>window.removeEventListener("keydown",h); },[onClose]);
  useEffect(()=>{ document.body.style.overflow="hidden"; return()=>{document.body.style.overflow="";}; },[]);
  const mob = window.innerWidth < 768;
  return (
    <div onClick={e=>{if(e.target===e.currentTarget)onClose();}}
      style={{ position:"fixed",inset:0,background:"rgba(15,23,42,0.5)",backdropFilter:"blur(3px)",zIndex:600,display:"flex",alignItems:mob?"flex-end":"flex-start",justifyContent:"center",padding:mob?0:`${ds.space[12]} ${ds.space[4]}`,overflowY:"auto" }}>
      <div className={mob?"ranked-sheet-content":"ranked-modal-content"} role="dialog" aria-modal="true"
        style={{ background:ds.color.neutral[0],borderRadius:mob?`${ds.radius.xl} ${ds.radius.xl} 0 0`:ds.radius.xl,border:mob?"none":ds.border.thin,width:"100%",maxWidth:mob?"100%":width,maxHeight:mob?"92vh":"calc(100vh - 96px)",display:"flex",flexDirection:"column",boxShadow:ds.shadow.lg,flexShrink:0 }}>
        <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:`${ds.space[4]} ${ds.space[5]}`,borderBottom:ds.border.thin,flexShrink:0,gap:ds.space[3] }}>
          <span style={{ fontSize:ds.font.size.sm,fontWeight:ds.font.weight.semibold,letterSpacing:"0.04em",textTransform:"uppercase",color:ds.color.neutral[900] }}>{title}</span>
          <DsIconButton icon={<DsIcon name="x" size={16} color={ds.color.neutral[500]}/>} ariaLabel="Fechar" size="sm" variant="ghost" onClick={onClose}/>
        </div>
        <div style={{ padding:`${ds.space[5]}`,overflowY:"auto",flex:1,WebkitOverflowScrolling:"touch" }}>{children}</div>
        {footer&&<div style={{ display:"flex",justifyContent:"flex-end",alignItems:"center",gap:ds.space[2],padding:`${ds.space[3]} ${ds.space[5]}`,borderTop:ds.border.thin,background:ds.color.neutral[50],borderRadius:`0 0 ${ds.radius.xl} ${ds.radius.xl}`,flexShrink:0 }}>{footer}</div>}
      </div>
    </div>
  );
}


// âââ Caixa: constants & helpers ââââââââââââââââââââââââââ

const TX_TYPES = [
  { id:"entrada",       label:"Entrada",        iconName:"arrowDown",  color:ds.color.success[500]  },
  { id:"saida",         label:"SaÃ­da",           iconName:"arrowUp",    color:ds.color.brand[500]    },
  { id:"dividendos",    label:"Dividendos",      iconName:"zap",        color:ds.color.copilot[500]  },
  { id:"imposto",       label:"Imposto",         iconName:"landmark",   color:ds.color.warning[500]  },
  { id:"transferencia", label:"TransferÃªncia",   iconName:"arrowRight", color:ds.color.info[500]     },
];

const EXPENSE_CATS = {
  entrada:    ["Recebimento de Contrato","Receita Meta (Facebook/Instagram)","Receita YouTube","Receita TikTok","Receita Kwai","Rendimento Financeiro","Reembolso","Outros Ingressos"],
  saida:      ["ProduÃ§Ã£o de ConteÃºdo","Equipamento","Passagem AÃ©rea","Hospedagem","AlimentaÃ§Ã£o","Viagem / Outros","Software / SaaS","Marketing","Pessoal / RH","Contabilidade","MÃ³veis e EletrodomÃ©sticos","Material de EscritÃ³rio","Material de Limpeza","Aluguel / CondomÃ­nio","Obra / Reformas","Utilidades (Luz, Ãgua, Internet)","Transporte / Estacionamento","CombustÃ­vel","Uber / TÃ¡xi / App","Outros"],
  dividendos: ["DistribuiÃ§Ã£o de Lucros","Pro-labore","Outros Dividendos"],
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
  // Custo dos ServiÃ§os Prestados
  "ProduÃ§Ã£o de ConteÃºdo":             "csp",
  "Equipamento":                      "csp",
  // Despesas Operacionais
  "Viagem":                           "desp_op",
  "AlimentaÃ§Ã£o":                      "desp_op",
  "Hospedagem":                       "desp_op",
  "Marketing":                        "desp_op",
  // Despesas Gerais e Administrativas
  "Software / SaaS":                  "desp_adm",
  "Pessoal / RH":                     "desp_adm",
  "Contabilidade":                    "desp_adm",
  "MÃ³veis e EletrodomÃ©sticos":        "desp_adm",
  "Material de EscritÃ³rio":           "desp_adm",
  "Material de Limpeza":              "desp_adm",
  "Viagem / Outros":                  "desp_op",
  "Passagem AÃ©rea":                   "desp_op",
  "Obra / Reformas":                  "desp_adm",
  "Transporte / Estacionamento":       "desp_op",
  "CombustÃ­vel":                        "desp_op",
  "Uber / TÃ¡xi / App":                 "desp_op",
  "Utilidades (Luz, Ãgua, Internet)": "desp_adm",
  "Outros":                           "desp_adm",
  // Impostos sobre receita (deduÃ§Ãµes)
  "ISS":                              "deducoes",
  "PIS/COFINS":                       "deducoes",
  "Simples Nacional":                 "deducoes",
  "Outros Impostos":                  "deducoes",
  // IR e CSLL (apÃ³s resultado operacional)
  "IRPJ":                             "ir_csll",
  "CSLL":                             "ir_csll",
  // DistribuiÃ§Ã£o
  "DistribuiÃ§Ã£o de Lucros":           "dividendos",
  "Pro-labore":                       "dividendos",
  "Outros Dividendos":                "dividendos",
};

function txColor(type)    { return TX_TYPES.find(t=>t.id===type)?.color    || ds.color.neutral[500]; }
function txIconName(type) { return TX_TYPES.find(t=>t.id===type)?.iconName || "minus"; }
function txEmoji(type)    { return TX_TYPES.find(t=>t.id===type)?.iconName || "minus"; }

// âââ Balance Editor Button âââââââââââââââââââââââââââââââââ
function EditBalanceButton({ acc, accounts, index, saveAcc }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("editing");
  const [newBalance, setNewBalance] = useState("");
  const [newDate, setNewDate] = useState(new Date().toISOString().substr(0,10));
  const [newNote, setNewNote] = useState("");

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
      Atualizar saldo
    </button>
  );

  return (
    <div style={{ background:B2,border:`1px solid ${LN}`,borderRadius:8,padding:"12px",marginTop:8 }}>
      {step==="editing" && <>
        <div style={{ fontSize:11,color:TX2,marginBottom:10,fontWeight:600 }}>Registrar novo saldo</div>
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8 }}>
          <div>
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>Saldo (R$)</div>
            <input type="number" value={newBalance} onChange={e=>setNewBalance(e.target.value)} autoFocus
              style={{ width:"100%",padding:"7px 10px",fontSize:13,fontWeight:700,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
          </div>
          <div>
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>Data</div>
            <input type="date" value={newDate} onChange={e=>setNewDate(e.target.value)}
              style={{ width:"100%",padding:"7px 10px",fontSize:12,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
          </div>
        </div>
        <input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="ObservaÃ§Ã£o (opcional)"
          style={{ width:"100%",padding:"7px 10px",fontSize:11,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",marginBottom:8 }}/>
        <div style={{ display:"flex",gap:6 }}>
          <button onClick={save} style={{ flex:1,padding:"7px",background:GRN,border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer" }}>â Salvar</button>
          <button onClick={()=>{setOpen(false);setStep("editing");}} style={{ padding:"7px 12px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>Cancelar</button>
        </div>
      </>}
    </div>
  );
}

// âââ Transaction Form Modal âââââââââââââââââââââââââââââââ
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
    if (!f.description || !f.amount) return alert("Preencha descriÃ§Ã£o e valor.");
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
    <Modal title={isEdit?"Editar LanÃ§amento":"Novo LanÃ§amento"} onClose={onClose} width={580}
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
        <Field label="Data da 1Âª parcela"><Input type="date" value={f.date} onChange={e=>set("date",e.target.value)}/></Field>
        <Field label="Valor por parcela (R$)"><Input type="number" min="0" step="0.01" value={f.amount} onChange={e=>set("amount",e.target.value)} placeholder="0,00"/></Field>
      </div>

      <SRule>Detalhes</SRule>
      <Field label="DescriÃ§Ã£o" full><Input value={f.description} onChange={e=>set("description",e.target.value)} placeholder="ex: MacBook Pro - parcelado"/></Field>
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
          <Field label="BeneficiÃ¡rio">
            <Select value={f.beneficiario||""} onChange={e=>set("beneficiario",e.target.value)}>
              <option value="">Selecione</option>
              <option value="Matheus">Matheus</option>
              <option value="Lucas">Lucas</option>
              <option value="Ambos">Ambos (50/50)</option>
            </Select>
          </Field>
        )}
      </div>

      {/* ââ Parcelamento automÃ¡tico ââ */}
      <SRule>Parcelamento</SRule>
      <div style={{ background:autoParc?`${BLU}06`:B2, border:`1px solid ${autoParc?BLU+"30":LN}`, borderRadius:10, padding:"14px 16px", transition:TRANS }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:autoParc?14:0 }}>
          <div>
            <div style={{ fontSize:12, fontWeight:700, color:TX }}>Criar parcelas automaticamente</div>
            <div style={{ fontSize:11, color:TX3, marginTop:2 }}>Gera uma entrada por mÃªs para cada parcela</div>
          </div>
          <div onClick={()=>setAutoParc(a=>!a)}
            style={{ width:44,height:24,borderRadius:99,background:autoParc?BLU:LN,cursor:"pointer",position:"relative",transition:TRANS,flexShrink:0 }}>
            <div style={{ width:20,height:20,borderRadius:"50%",background:"#fff",position:"absolute",top:2,left:autoParc?22:2,transition:TRANS,boxShadow:"0 1px 3px rgba(0,0,0,0.15)" }}/>
          </div>
        </div>

        {autoParc && (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:12 }}>
              <Field label="NÂº de parcelas">
                <Input type="number" min="2" max="120" value={numParc} onChange={e=>setNumParc(e.target.value)} placeholder="ex: 12"/>
              </Field>
              <div style={{ display:"flex", flexDirection:"column", justifyContent:"flex-end", paddingBottom:2 }}>
                {numParc && f.amount && parseInt(numParc)>0 && (
                  <div style={{ padding:"10px 12px", background:B1, borderRadius:8, border:`1px solid ${LN}` }}>
                    <div style={{ fontSize:ds.font.size.xs, color:TX3, marginBottom:3 }}>Total comprometido</div>
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
                <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".08em", textTransform:"uppercase", color:TX3, marginBottom:8 }}>
                  Preview â {parcPreview.length} lanÃ§amentos serÃ£o criados
                </div>
                <div style={{ maxHeight:160, overflowY:"auto", display:"flex", flexDirection:"column", gap:4 }}>
                  {parcPreview.map(p => (
                    <div key={p.n} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:B1, borderRadius:6, border:`1px solid ${LN}` }}>
                      <span style={{ fontSize:ds.font.size.xs, fontWeight:700, color:BLU, width:32, flexShrink:0 }}>{p.n}/{numParc}</span>
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
            LanÃ§amento Ãºnico Â· ative para criar todas as parcelas de uma vez
          </div>
        )}
      </div>

      <SRule>Nota Fiscal & Obs.</SRule>
      <Field label="NÃºmero / Link da NF"><Input value={f.nfLink||""} onChange={e=>set("nfLink",e.target.value)} placeholder="NÃºmero ou URL da nota"/></Field>
      <Field label="Notas" full><Input value={f.notes||""} onChange={e=>set("notes",e.target.value)} placeholder="InformaÃ§Ãµes adicionais"/></Field>
    </Modal>
  );
}

// âââ DRE Component ââââââââââââââââââââââââââââââââââââââââ
function DREView({ transactions, year, valuesHidden }) {
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
          {value<0?`(${valuesHidden ? "••••••" : (fmtMoney(Math.abs(value)))})`:fmtMoney(value)}
        </span>
      </div>
    );
  };

  const Section = ({title}) => (
    <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,padding:"14px 0 4px",borderBottom:`1px solid ${LN}` }}>{title}</div>
  );

  return (
    <div style={{ ...G, padding:"20px 24px", maxWidth:700 }}>
      <div style={{ fontSize:14,fontWeight:700,color:TX,marginBottom:4 }}>DRE â DemonstraÃ§Ã£o do Resultado do ExercÃ­cio</div>
      <div style={{ fontSize:11,color:TX2,marginBottom:20 }}>ExercÃ­cio {year} Â· Conforme Lei 6.404/76</div>

      <Section title="Receitas"/>
      <Row label="(+) Receita Operacional Bruta" value={receita_bruta} bold/>
      <Row label="(-) DeduÃ§Ãµes e Impostos sobre Receita" value={-deducoes} indent={1}/>
      <Row label="= Receita LÃ­quida" value={receita_liq} total bold positive={true}/>

      <Section title="Custos"/>
      <Row label="(-) Custo dos ServiÃ§os Prestados (CSP)" value={-csp} indent={1}/>
      <Row label="= Lucro Bruto" value={lucro_bruto} total bold positive={true}/>

      <Section title="Despesas Operacionais"/>
      <Row label="(-) Despesas com OperaÃ§Ãµes" value={-desp_op} indent={1}/>
      <Row label="(-) Despesas Gerais e Administrativas" value={-desp_adm} indent={1}/>
      <Row label="(+) Receitas Financeiras" value={rec_financeira} indent={1}/>
      <Row label="(+) Outras Receitas" value={outras_receitas} indent={1}/>
      <Row label="= Resultado Operacional (EBIT)" value={result_op} total bold positive={true}/>

      <Section title="TributaÃ§Ã£o"/>
      <Row label="(-) IRPJ e CSLL" value={-ir_csll} indent={1}/>
      <Row label="= Lucro LÃ­quido do ExercÃ­cio" value={lucro_liq} total bold positive={true}/>

      <Section title="DistribuiÃ§Ã£o"/>
      <Row label="(-) Dividendos DistribuÃ­dos" value={-dividendos} indent={1}/>
      <Row label="= Lucro Retido / PrejuÃ­zo Acumulado" value={lucro_retido} total bold positive={true}/>

      <div style={{ marginTop:16,padding:"12px 14px",background:`${BLU}08`,border:`1px solid ${BLU}20`,borderRadius:8 }}>
        <div style={{ fontSize:ds.font.size.xs,color:TX2,marginBottom:4 }}>â ï¸ Esta DRE Ã© gerada automaticamente com base nos lanÃ§amentos cadastrados. Consulte seu contador para fins legais.</div>
      </div>
    </div>
  );
}

// âââ Caixa Dashboard âââââââââââââââââââââââââââââââââââââ

// âââ PeriodPicker popover / bottom-sheet âââââââââââââââââ
const PRESETS_LIST = [
  { id:"month",       label:"Este mÃªs" },
  { id:"prev_month",  label:"MÃªs anterior" },
  { id:"last_30d",    label:"Ãltimos 30 dias" },
  { id:"last_90d",    label:"Ãltimos 90 dias" },
  { id:"quarter",     label:"Trimestre atual" },
  { id:"ytd",         label:"Ano atÃ© hoje (YTD)" },
  { id:"fiscal_year", label:`Ano fiscal ${new Date().getFullYear()}` },
  { id:"custom",      label:"Personalizadoâ¦" },
];

function PeriodPicker({ period: initial, transactions, onApply, onClose, isMobile, colors }) {
  const { B1, B2, LN, LN2, TX, TX2, TX3, RED, GRN } = colors ?? {};
  const [draft, setDraft]         = useState(initial);
  const [customFrom, setCustomFrom] = useState(initial.from);
  const [customTo,   setCustomTo]   = useState(initial.to);
  const [error,      setError]      = useState(null);
  const presetRefs = useRef([]);

  // Trap focus inside picker
  useEffect(() => {
    const trap = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", trap);
    return () => window.removeEventListener("keydown", trap);
  }, [onClose]);

  // Auto-focus first preset on open
  useEffect(() => { presetRefs.current[0]?.focus(); }, []);

  const selectPreset = (id) => {
    if (id === "custom") {
      setDraft({ presetId:"custom", from:draft.from, to:draft.to });
    } else {
      const p = periodForPreset(id, new Date());
      setDraft(p);
      setCustomFrom(p.from);
      setCustomTo(p.to);
      setError(null);
    }
  };

  const handleKeyNav = (e, idx) => {
    if (e.key === "ArrowDown") { e.preventDefault(); presetRefs.current[Math.min(idx+1,PRESETS_LIST.length-1)]?.focus(); }
    if (e.key === "ArrowUp")   { e.preventDefault(); presetRefs.current[Math.max(idx-1,0)]?.focus(); }
    if (e.key === "Enter")     { selectPreset(PRESETS_LIST[idx].id); }
  };

  const apply = () => {
    if (draft.presetId === "custom") {
      if (!customFrom || !customTo) { setError("Preencha as duas datas."); return; }
      if (customFrom > customTo)    { setError("Data inicial deve ser anterior ou igual Ã  final."); return; }
      const days = Math.round((new Date(customTo+"T00:00:00") - new Date(customFrom+"T00:00:00")) / 86400000) + 1;
      if (days > 5 * 365) {
        if (!window.confirm("PerÃ­odo maior que 5 anos pode deixar a lista lenta. Continuar?")) return;
      }
      onApply({ presetId:"custom", from:customFrom, to:customTo });
    } else {
      onApply(draft);
    }
  };

  const popStyle = isMobile ? {
    position:"fixed", bottom:0, left:0, right:0,
    background:B1, borderRadius:"18px 18px 0 0",
    padding:"20px 18px 32px", boxShadow:"0 -8px 28px rgba(0,0,0,.16)",
    zIndex:500, maxHeight:"88vh", overflowY:"auto",
  } : {
    position:"absolute", top:"calc(100% + 8px)", left:"50%", transform:"translateX(-50%)",
    background:B1, border:`1px solid ${LN}`, borderRadius:12,
    padding:"18px 18px 14px", boxShadow:"0 8px 28px rgba(0,0,0,.13)",
    zIndex:300, minWidth:296, maxWidth:340,
  };

  const fieldStyle = {
    width:"100%", padding:"7px 10px", fontSize:12,
    background:B1, border:`1px solid ${LN}`,
    borderRadius:6, color:TX, fontFamily:"inherit",
    outline:"none", boxSizing:"border-box",
  };

  return (
    <>
      {isMobile && (
        <div onClick={onClose}
          style={{ position:"fixed",inset:0,background:"rgba(0,0,0,.38)",zIndex:499 }}/>
      )}
      <div role="dialog" aria-modal="false" aria-label="Selecionar perÃ­odo" style={popStyle}>
        {/* Mobile handle */}
        {isMobile && (
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
            <span style={{ fontWeight:700,fontSize:15,color:TX }}>PerÃ­odo</span>
            <button onClick={onClose} style={{ background:"none",border:"none",fontSize:20,cursor:"pointer",color:TX2 }}>Ã</button>
          </div>
        )}

        {/* Presets */}
        <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX3,textTransform:"uppercase",letterSpacing:".1em",marginBottom:6 }}>Presets</div>
        {PRESETS_LIST.map((p, idx) => (
          <button key={p.id}
            ref={el => presetRefs.current[idx] = el}
            onClick={() => selectPreset(p.id)}
            onKeyDown={e => handleKeyNav(e, idx)}
            style={{
              display:"flex", alignItems:"center", gap:10,
              width:"100%", padding:"8px 10px", marginBottom:1,
              background: draft.presetId===p.id ? `${TX}0a` : "none",
              border:"none", borderRadius:7,
              cursor:"pointer", fontFamily:"inherit",
              fontSize:13, color:TX, textAlign:"left",
              transition:"background .12s",
            }}
            onMouseEnter={e=>e.currentTarget.style.background=`${TX}07`}
            onMouseLeave={e=>e.currentTarget.style.background=draft.presetId===p.id?`${TX}0a`:"none"}
          >
            <span style={{
              width:14, height:14, borderRadius:"50%", flexShrink:0, display:"inline-block",
              border:`2px solid ${draft.presetId===p.id?"#2563EB":LN2}`,
              background: draft.presetId===p.id ? "#2563EB" : "none",
              transition:"border-color .12s, background .12s",
            }}/>
            {p.label}
          </button>
        ))}

        {/* Divider */}
        <div style={{ height:1, background:LN, margin:"10px -18px" }}/>

        {/* Date range inputs */}
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginTop:10 }}>
          <div>
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>De</div>
            <input type="date"
              value={draft.presetId==="custom" ? customFrom : draft.from}
              readOnly={draft.presetId!=="custom"}
              onChange={e=>{ setCustomFrom(e.target.value); setError(null); }}
              style={{ ...fieldStyle, background:draft.presetId!=="custom"?B2:B1, cursor:draft.presetId!=="custom"?"not-allowed":"auto" }}
            />
          </div>
          <div>
            <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>AtÃ©</div>
            <input type="date"
              value={draft.presetId==="custom" ? customTo : draft.to}
              readOnly={draft.presetId!=="custom"}
              onChange={e=>{ setCustomTo(e.target.value); setError(null); }}
              style={{ ...fieldStyle, background:draft.presetId!=="custom"?B2:B1, cursor:draft.presetId!=="custom"?"not-allowed":"auto" }}
            />
          </div>
        </div>

        {/* Error */}
        {error && (
          <p role="alert" style={{ fontSize:11,color:RED,margin:"6px 0 0",display:"flex",alignItems:"center",gap:4 }}>
            <DsIcon name="alertCircle" size={11} color={RED}/>{error}
          </p>
        )}

        {/* Actions */}
        <div style={{ display:"flex",justifyContent:"flex-end",gap:8,marginTop:14 }}>
          <button onClick={onClose}
            style={{ padding:"7px 14px",fontSize:12,cursor:"pointer",borderRadius:6,background:"none",border:`1px solid ${LN}`,color:TX2,fontFamily:"inherit" }}>
            Cancelar
          </button>
          <button onClick={apply}
            style={{ padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:6,background:TX,border:"none",color:"white",fontFamily:"inherit" }}
            onKeyDown={e=>e.key==="Enter"&&apply()}>
            Aplicar
          </button>
        </div>
      </div>
    </>
  );
}

function CaixaDash({ transactions, baseBalance, saldoTotal, activePeriod, valuesHidden }) {
  const months = Array.from({length:12},(_,i)=>i);
  const currentYear = new Date().getFullYear();
  const MONTHS_SH2 = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
  const today = new Date();

  // ââ Compromissos futuros (parcelamentos) â via finance.js ââ
  const futureInstallments = useMemo(
    () => calcFutureInstallments(transactions),
    [transactions]
  );

  const totalFutureDebt = futureInstallments.reduce((s,[,v])=>s+v.total,0);

  // Quebra mensal do ano â via finance.js (sem filter+reduce inline)
  const _breakdown = useMemo(
    () => monthlyBreakdown(transactions, currentYear),
    [transactions, currentYear]
  );
  const monthData = _breakdown.map((m) => ({
    month:     MONTHS_SH2[m.monthIndex],
    entradas:  m.ent,
    saidas:    m.sai + m.imp,  // combinado para o grÃ¡fico de barras
    dividendos: m.div,
    net:       m.net,
  }));

  const maxVal = Math.max(...monthData.map(d=>Math.max(d.entradas,d.saidas)),1);

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      {/* Compromissos futuros â parcelamentos */}
      {futureInstallments.length > 0 && (
        <div style={{ ...G, padding:"16px 20px", borderLeft:`3px solid ${AMB}` }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:2 }}>Compromissos futuros Â· Parcelamentos</div>
              <div style={{ fontSize:22,fontWeight:800,color:RED }}>{valuesHidden ? "••••••" : (fmtMoney(totalFutureDebt))}</div>
              <div style={{ fontSize:11,color:TX3,marginTop:2 }}>total comprometido em parcelas futuras</div>
            </div>
            <DsIcon name="calendar" size={20} color={ds.color.neutral[400]}/>
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
                          <span key={i} style={{ fontSize:ds.font.size.xs, padding:"1px 6px", borderRadius:99, background:`${AMB}14`, color:AMB, fontWeight:600, maxWidth:80, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {t.description.replace(/\s*\(\d+\/\d+\)$/,"")}
                          </span>
                        ))}
                        {val.items.length>3&&<span style={{ fontSize:ds.font.size.xs,color:TX3 }}>+{val.items.length-3}</span>}
                      </div>
                    </div>
                    <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                      {isHeavy && <span style={{ fontSize:ds.font.size.xs, color:RED, fontWeight:700 }}>â  Alto</span>}
                      <span style={{ fontSize:12, fontWeight:800, color:RED }}>{valuesHidden ? "••••••" : (fmtMoney(val.total))}</span>
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
                {totalFutureDebt/saldoTotal>0.5?"â  Parcelas comprometem":"â Parcelas representam"}
              </span>
              <span style={{ color:TX2 }}> {(totalFutureDebt/saldoTotal*100).toFixed(0)}% do saldo atual</span>
            </div>
          )}
        </div>
      )}

      {/* Decision KPIs */}
      {(() => {
        // KPIs via finance.js â sem filter+reduce inline
        const _kpiAgg   = aggregate(transactions, 0); // base 0: queremos % sobre receita pura
        const totalEnt  = _kpiAgg.totalEntradas;
        const totalSai  = _kpiAgg.totalOutflows;
        const lucroLiq  = _kpiAgg.lucroLiquido;

        const br        = calcBurnRate(transactions);
        const liq       = liquidityRatio(saldoTotal, transactions);
        const liquidez  = isFinite(liq) && br > 0 ? liq : null;
        const margemLucro = totalEnt > 0 ? _kpiAgg.margemLiquida : null;
        const roi = totalSai > 0 ? ((totalEnt - totalSai) / totalSai * 100) : null;
        const burnRate  = br;
        // monthlyData mantido apenas para o count de base no card
        const monthlyData = _breakdown.filter(m => (m.sai + m.imp) > 0);

        const kpiColor = (val, good, warn) => val >= good ? GRN : val >= warn ? AMB : RED;
        const fmt1 = v => v.toFixed(1);

        return (
          <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10 }}>
            {/* Liquidez */}
            <div title="Liquidez = Saldo atual Ã· Despesa mensal mÃ©dia. AtenÃ§Ã£o < 3x Â· Regular 3â6x Â· Excelente > 6x." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${liquidez===null?LN:kpiColor(liquidez,3,1.5)}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Liquidez</div>
              <div style={{ fontSize:22,fontWeight:700,color:liquidez===null?TX3:kpiColor(liquidez,3,1.5) }}>
                {liquidez===null?"â":`${fmt1(liquidez)}x`}
              </div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>meses de runway</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>
                {liquidez===null?"sem dados":liquidez>=3?"â SaudÃ¡vel":liquidez>=1.5?"â  AtenÃ§Ã£o":"ð´ CrÃ­tico"}
              </div>
            </div>

            {/* Margem de Lucro */}
            <div title="Margem LÃ­quida = Lucro LÃ­quido Ã· Receita. AtenÃ§Ã£o < 10% Â· Regular 10â20% Â· Excelente > 20%." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${margemLucro===null?LN:kpiColor(margemLucro,30,10)}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Margem LÃ­quida</div>
              <div style={{ fontSize:22,fontWeight:700,color:margemLucro===null?TX3:kpiColor(margemLucro,30,10) }}>
                {margemLucro===null?"â":`${fmt1(margemLucro)}%`}
              </div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>lucro Ã· receita</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>
                {margemLucro===null?"sem dados":margemLucro>=30?"â Excelente":margemLucro>=10?"â  Regular":"ð´ Baixa"}
              </div>
            </div>

            {/* ROI Operacional */}
            <div title="ROI Operacional = (Receita â Custos) Ã· Custos. AtenÃ§Ã£o < 50% Â· Regular 50â100% Â· Excelente > 100%." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${roi===null?LN:kpiColor(roi,50,20)}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>ROI Operacional</div>
              <div style={{ fontSize:22,fontWeight:700,color:roi===null?TX3:kpiColor(roi,50,20) }}>
                {roi===null?"â":`${fmt1(roi)}%`}
              </div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>retorno sobre custos</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>
                {roi===null?"sem dados":roi>=50?"â Excelente":roi>=20?"â  Regular":"ð´ Baixo"}
              </div>
            </div>

            {/* Burn Rate */}
            <div title="Burn Rate = mÃ©dia de saÃ­das mensais (meses com movimento). Quanto menor, melhor para runway." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${BLU}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Burn Rate</div>
              <div style={{ fontSize:22,fontWeight:700,color:TX }}>{valuesHidden ? "••••••" : (fmtMoney(burnRate))}</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>saÃ­das/mÃªs (mÃ©dia)</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>base {monthlyData.length} meses</div>
            </div>
          </div>
        );
      })()}

      {/* Bar chart with projection (Task 4) */}
      <div style={{ ...G,padding:"18px 20px" }}>
        <div style={{ fontSize:12,fontWeight:700,color:TX,marginBottom:4 }}>Entradas vs SaÃ­das {currentYear}</div>
        <div style={{ display:"flex",gap:12,fontSize:ds.font.size.xs,color:TX2,marginBottom:16,flexWrap:"wrap" }}>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:GRN,display:"inline-block" }}/>Entradas</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:RED,display:"inline-block" }}/>SaÃ­das</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:"#7C3AED",display:"inline-block" }}/>Dividendos</span>
          {currentYear===new Date().getFullYear()&&(
            <span style={{ display:"flex",alignItems:"center",gap:4 }}>
              <span style={{ width:10,height:10,borderRadius:2,border:`1px solid ${LN2}`,display:"inline-block",
                backgroundImage:"repeating-linear-gradient(45deg,transparent 0 3px,rgba(0,0,0,.12) 3px 6px)" }}/>
              ProjeÃ§Ã£o (parcelas futuras)
            </span>
          )}
        </div>
        <div style={{ display:"flex",alignItems:"flex-end",gap:4,height:120 }}>
          {monthData.map((d,i)=>{
            const isCurrentYear = currentYear===new Date().getFullYear();
            const isFuture  = isCurrentYear && i > new Date().getMonth();
            const inPeriod  = activePeriod ? monthInPeriod(activePeriod, currentYear, i) : false;
            const projStyle = isFuture ? {
              opacity:0.45,
              backgroundImage:"repeating-linear-gradient(45deg,transparent 0 4px,rgba(0,0,0,.08) 4px 8px)",
            } : {};
            return (
              <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2,
                borderRadius:"4px 4px 0 0",
                boxShadow: inPeriod ? `0 -2px 0 0 #2563EB` : "none",
                background: inPeriod ? "#2563EB08" : "none",
              }}>
                <div style={{ width:"100%",display:"flex",gap:1,alignItems:"flex-end",height:100 }}>
                  <div style={{ flex:1,background:GRN,height:`${maxVal>0?d.entradas/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",minHeight:d.entradas>0?3:0,...projStyle }}/>
                  <div style={{ flex:1,background:RED,height:`${maxVal>0?d.saidas/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",minHeight:d.saidas>0?3:0,...projStyle }}/>
                  {d.dividendos>0&&<div style={{ flex:1,background:"#7C3AED",height:`${maxVal>0?d.dividendos/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",...projStyle }}/>}
                </div>
                <div style={{ fontSize:8,color:inPeriod?BLU:isFuture?TX3+"88":TX3,fontWeight:inPeriod?700:400,textAlign:"center" }}>{d.month}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Dividend per person */}
      {transactions.filter(t=>t.type==="dividendos").length>0&&(
        <div style={{ ...G,padding:"18px 20px" }}>
          <div style={{ fontSize:12,fontWeight:700,color:TX,marginBottom:12 }}>Dividendos por SÃ³cio</div>
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
                  {name!=="Ambos"&&totalAmbos>0&&<div style={{ fontSize:ds.font.size.xs,color:TX2 }}>Direto {valuesHidden ? "••••••" : (fmtMoney(total))} + {valuesHidden ? "••••••" : (fmtMoney(totalAmbos/2))} (metade dos "Ambos")</div>}
                </div>
                <div style={{ fontWeight:700,fontSize:16,color }}>
                  {valuesHidden ? "••••••" : (name==="Ambos"?fmtMoney(total):fmtMoney(effective))}
                </div>
              </div>
            );
          })}
          <div style={{ display:"flex",justifyContent:"space-between",padding:"10px 0",borderTop:`1px solid ${LN2}`,marginTop:4 }}>
            <span style={{ fontSize:11,color:TX2 }}>Total distribuÃ­do</span>
            <span style={{ fontWeight:700,fontSize:13,color:"#7C3AED" }}>{valuesHidden ? "••••••" : (fmtMoney(transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0)))}</span>
          </div>
        </div>
      )}

      {/* Category breakdown */}
      {transactions.length>0&&(
        <div style={{ ...G,padding:"18px 20px" }}>
          <div style={{ fontSize:12,fontWeight:700,color:TX,marginBottom:12 }}>SaÃ­das por Categoria</div>
          {(() => {
            const cats = Object.entries(
              transactions.filter(t=>t.type==="saida"&&t.category).reduce((acc,t)=>{acc[t.category]=(acc[t.category]||0)+(Number(t.amount)||0);return acc;},{})
            ).sort((a,b)=>b[1]-a[1]).slice(0,8);
            const totalSaidas_ = cats.reduce((s,[,v])=>s+v,0);
            const maxCat = cats[0]?.[1] || 1;
            return cats.map(([cat,val])=>{
              const s = Math.round(30 + (val/maxCat)*45); // 30..75%
              const barColor = `hsl(355,${s}%,45%)`;
              const pct = totalSaidas_ > 0 ? (val/totalSaidas_*100).toFixed(1) : "0.0";
              return (
                <div key={cat} style={{ marginBottom:10 }}>
                  <div style={{ display:"flex",justifyContent:"space-between",fontSize:12,marginBottom:4 }}>
                    <span style={{ color:TX }}>{cat}</span>
                    <span style={{ fontWeight:700,color:TX }}>{valuesHidden ? "••••••" : (fmtMoney(val))}</span>
                  </div>
                  <div style={{ height:4,background:LN,borderRadius:2 }}>
                    <div title={`${pct}% do total de saÃ­das`}
                      style={{ height:4,borderRadius:2,background:barColor,width:`${val/maxCat*100}%`,transition:"width .3s" }}/>
                  </div>
                </div>
              );
            });
          })()}
        </div>
      )}
    </div>
  );
}

// âââ Caixa (Controle Financeiro Administrativo) âââââââââââ

function NewAccountModal({ onClose, onSave }) {
  const [f, setF] = useState({ name:"", bank:"", type:"corrente", balance:"" });
  const set = (k,v) => setF(x=>({...x,[k]:v}));
  return (
    <Modal title="Nova Conta" onClose={onClose} width={420}
      footer={<><Btn onClick={onClose} variant="ghost" size="sm">Cancelar</Btn><Btn onClick={()=>{if(!f.name)return alert("Informe o nome.");onSave(f);}} variant="primary" size="sm">Criar</Btn></>}>
      <div style={{ display:"flex",flexDirection:"column",gap:12 }}>
        <Field label="Nome da conta"><Input value={f.name} onChange={e=>set("name",e.target.value)} placeholder="ex: Conta PJ Matheus"/></Field>
        <Field label="Banco"><Input value={f.bank} onChange={e=>set("bank",e.target.value)} placeholder="ex: ItaÃº, Bradesco, Inter"/></Field>
        <Field label="Tipo"><Select value={f.type} onChange={e=>set("type",e.target.value)}><option value="corrente">Conta Corrente</option><option value="poupanca">PoupanÃ§a</option><option value="investimento">Investimento</option></Select></Field>
        <Field label="Saldo inicial (R$)"><Input type="number" value={f.balance} onChange={e=>set("balance",e.target.value)} placeholder="0,00"/></Field>
      </div>
    </Modal>
  );
}

// âââ Indicadores Financeiros ââââââââââââââââââââââââââââââ
function IndicadoresFinanceiros({ transactions, baseBalance, saldoTotal, contracts, year: yearProp, setYear: setYearProp }) {
  const [yearLocal, setYearLocal] = useState(new Date().getFullYear());
  const year = yearProp ?? yearLocal;
  const setYear = setYearProp ?? setYearLocal;
  const txYear = transactions.filter(t => t.date?.startsWith(String(year)));
  const _breakdown_ind = useMemo(() => monthlyBreakdown(txYear, year), [txYear, year]);

  // Agregados via finance.js â sem filter+reduce inline
  const _indAgg    = aggregate(txYear, 0);
  const receita    = _indAgg.totalEntradas;
  const despesas   = _indAgg.totalOutflows;  // saida+imposto (compat. legado)
  const dividendos = _indAgg.totalDividendos;
  const lucroLiq   = _indAgg.lucroLiquido;
  const ebitda     = _indAgg.ebitda;         // CORRIGIDO: receitaLiquida - CSP - despOp

  // Custos fixos (para ponto de equilÃ­brio) â mantÃ©m lÃ³gica existente
  const fixedCats = ["Pessoal / RH","Aluguel / CondomÃ­nio","Utilidades (Luz, Ãgua, Internet)","Software / SaaS","Contabilidade","Material de EscritÃ³rio","Material de Limpeza","MÃ³veis e EletrodomÃ©sticos"];
  const custoFixo = txYear.filter(t=>(t.type==="saida"||t.type==="imposto")&&fixedCats.includes(t.category)).reduce((s,t)=>s+(Number(t.amount)||0),0);
  const custoVar  = despesas - custoFixo;

  // Liquidez e burn rate via finance.js
  const br             = calcBurnRate(txYear, year);
  const monthsWithData = _breakdown_ind.filter(m => (m.sai + m.imp) > 0).length || 1;
  const despesaMensal  = br || (despesas / monthsWithData);
  const liquidez       = despesaMensal > 0 ? saldoTotal / despesaMensal : null;

  const margemLucro    = _indAgg.receitaLiquida > 0 ? _indAgg.margemLiquida : null;
  const margemBruta    = _indAgg.receitaLiquida > 0 ? _indAgg.margemBruta   : null;
  const margemEBITDA   = _indAgg.receitaLiquida > 0 ? _indAgg.margemEbitda  : null;
  const roi            = despesas > 0 ? (lucroLiq / despesas * 100) : null;
  const ticketMedio    = contracts.length > 0 ? (contracts.reduce((s,c)=>s+(Number(c.contractValue)||Number(c.monthlyValue)||0),0) / contracts.length) : null;
  const pontoEquil     = receita > 0 && (1 - custoVar/receita) > 0 ? custoFixo / (1 - custoVar/receita) : null;

  // Prazo mÃ©dio de recebimento (from contracts with payment dates)
  const pmr = (() => {
    const diffs = contracts.filter(c=>c.contractDeadline&&c.contractStart).map(c=>{
      const s = new Date(c.contractStart), e = new Date(c.contractDeadline);
      return Math.round((e-s)/(1000*60*60*24));
    }).filter(d=>d>0&&d<365);
    return diffs.length ? Math.round(diffs.reduce((s,d)=>s+d,0)/diffs.length) : null;
  })();

  const fmt2 = v => v != null ? v.toFixed(1) : "â";
  const fmtDias = v => v != null ? `${Math.round(v)} dias` : "â";

  const indicators = [
    {
      group: "Rentabilidade",
      items: [
        { label:"Margem de Lucro LÃ­quida", tooltip:"Lucro lÃ­quido Ã· Receita LÃ­quida.", value:margemLucro!=null?`${fmt2(margemLucro)}%`:"â", desc:"Lucro lÃ­quido / Receita", color:margemLucro!=null?(margemLucro>20?GRN:margemLucro>5?AMB:RED):TX2, good:margemLucro!=null&&margemLucro>20 },
        { label:"Margem Bruta", tooltip:"(Receita â Custos) Ã· Receita LÃ­quida.", value:margemBruta!=null?`${fmt2(margemBruta)}%`:"â", desc:"(Receita â Despesas) / Receita", color:margemBruta!=null?(margemBruta>30?GRN:margemBruta>10?AMB:RED):TX2, good:margemBruta!=null&&margemBruta>30 },
        { label:"EBITDA", tooltip:"Receita LÃ­quida â Custos â Despesas Operacionais (D&A=0).", value:fmtMoney(ebitda), desc:"Resultado antes de impostos e dividendos", color:ebitda>=0?GRN:RED, good:ebitda>0 },
        { label:"Margem EBITDA", tooltip:"EBITDA Ã· Receita LÃ­quida.", value:margemEBITDA!=null?`${fmt2(margemEBITDA)}%`:"â", desc:"EBITDA / Receita", color:margemEBITDA!=null?(margemEBITDA>25?GRN:margemEBITDA>10?AMB:RED):TX2, good:margemEBITDA!=null&&margemEBITDA>25 },
        { label:"ROI", tooltip:"Lucro LÃ­quido Ã· Total Investido.", value:roi!=null?`${fmt2(roi)}%`:"â", desc:"Lucro LÃ­quido / Total Investido", color:roi!=null?(roi>0?GRN:RED):TX2, good:roi!=null&&roi>0 },
      ]
    },
    {
      group: "Liquidez & Caixa",
      items: [
        { label:"Liquidez (meses)", tooltip:"Saldo atual Ã· Despesa mensal mÃ©dia.", value:liquidez!=null?`${liquidez.toFixed(1)}x`:"â", desc:"Saldo atual cobre quantos meses de despesas", color:liquidez!=null?(liquidez>3?GRN:liquidez>1?AMB:RED):TX2, good:liquidez!=null&&liquidez>3 },
        { label:"Saldo em Caixa", tooltip:"Saldo base + lanÃ§amentos acumulados.", value:fmtMoney(saldoTotal), desc:"Base inicial + lanÃ§amentos acumulados", color:saldoTotal>=0?TX:RED, good:saldoTotal>0 },
        { label:"Despesa Mensal MÃ©dia", tooltip:"MÃ©dia das saÃ­das dos meses com movimento.", value: valuesHidden ? "••••••" : fmtMoney(despesaMensal), desc:`MÃ©dia de ${monthsWithData} meses com dados`, color:TX2, good:null },
      ]
    },
    {
      group: "Operacional",
      items: [
        { label:"Ticket MÃ©dio Contratos", tooltip:"Soma dos contratos ativos Ã· nÂº de contratos.", value:ticketMedio!=null?fmtMoney(ticketMedio):"â", desc:"Valor mÃ©dio por contrato ativo", color:TX, good:null },
        { label:"Ponto de EquilÃ­brio", tooltip:"Receita mÃ­nima necessÃ¡ria para cobrir custos fixos + variÃ¡veis.", value:pontoEquil!=null?fmtMoney(pontoEquil):"â", desc:"Receita mÃ­nima para cobrir todos os custos", color:receita>0&&pontoEquil!=null?(receita>=pontoEquil?GRN:RED):TX2, good:receita>0&&pontoEquil!=null&&receita>=pontoEquil },
        { label:"Prazo MÃ©dio Recebimento", tooltip:"MÃ©dia dos prazos de pagamento dos contratos.", value:fmtDias(pmr), desc:"MÃ©dia dos prazos de contratos", color:pmr!=null?(pmr<60?GRN:pmr<90?AMB:RED):TX2, good:pmr!=null&&pmr<60 },
        { label:"Prazo MÃ©dio Estoque", tooltip:"N/A â empresa de serviÃ§os.", value:"N/A", desc:"NÃ£o aplicÃ¡vel â empresa de serviÃ§os", color:TX3, good:null },
      ]
    },
    {
      group: "Receita",
      items: [
        { label:"Receita Total", tooltip:"Soma das entradas do ano fiscal.", value: valuesHidden ? "••••••" : fmtMoney(receita), desc:`Todas as entradas de ${year}`, color:GRN, good:null },
        { label:"Despesas Totais", tooltip:"SaÃ­das + impostos do ano fiscal.", value: valuesHidden ? "••••••" : fmtMoney(despesas), desc:`SaÃ­das + impostos de ${year}`, color:RED, good:null },
        { label:"Dividendos DistribuÃ­dos", tooltip:"Soma dos lanÃ§amentos do tipo dividendos.", value: valuesHidden ? "••••••" : fmtMoney(dividendos), desc:`DistribuiÃ§Ã£o de lucros de ${year}`, color:"#7C3AED", good:null },
        {valuesHidden ? "••••••" : ( label:"Custo Fixo Total", tooltip:"RH + aluguel + utilidades + administrativo.", value:fmtMoney(custoFixo), desc:"RH, aluguel, utilidades, adm", color:TX2, good:null )},
      ]
    }
  ];

  return (
    <div>
      <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:24 }}>
        <span style={{ fontSize:12,color:TX2 }}>ExercÃ­cio:</span>
        {[new Date().getFullYear()-1, new Date().getFullYear()].map(y=>(
          <div key={y} onClick={()=>setYear(y)}
            style={{ padding:"5px 14px",fontSize:12,fontWeight:year===y?700:400,cursor:"pointer",borderRadius:99,background:year===y?TX:B2,color:year===y?"white":TX2,border:`1px solid ${year===y?TX:LN}`,transition:TRANS }}>
            {y}
          </div>
        ))}
      </div>

      {indicators.map(group=>(
        <div key={group.group} style={{ marginBottom:24 }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${LN}` }}>{group.group}</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10 }}>
            {group.items.map((ind,i)=>(
              <div key={i} title={ind.tooltip||""} style={{ ...G,padding:"14px 16px",borderLeft:`3px solid ${ind.color}` }}>
                <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:4 }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,lineHeight:1.3,flex:1 }}>{ind.label}</div>
                  {ind.good===true&&<span style={{ fontSize:ds.font.size.xs,color:GRN,flexShrink:0,marginLeft:6 }}>â</span>}
                  {ind.good===false&&<span style={{ fontSize:ds.font.size.xs,color:RED,flexShrink:0,marginLeft:6 }}>â </span>}
                </div>
                <div style={{ fontSize:20,fontWeight:700,color:ind.color,lineHeight:1,marginBottom:4 }}>{ind.value}</div>
                <div style={{ fontSize:ds.font.size.xs,color:TX3,lineHeight:1.4 }}>{ind.desc}</div>
              </div>
            ))}
          </div>
        </div>
      ))}

      <div style={{ padding:"12px 16px",background:`${BLU}06`,border:`1px solid ${BLU}18`,borderRadius:8,fontSize:11,color:TX2 }}>
        â ï¸ Indicadores calculados com base nos lanÃ§amentos cadastrados no sistema. Para ROE e Endividamento, que requerem dados de balanÃ§o patrimonial, consulte seu contador.
      </div>
    </div>
  );
}


// âââ Contador Export Modal ââââââââââââââââââââââââââââââââ
function ContadorExportModal({ transactions, baseBalance, saldoTotal, onClose, initialFrom, initialTo }) {
  const [period, setPeriod] = useState("month");
  const _defMonth = initialFrom ? initialFrom.slice(0,7) : new Date().toISOString().substr(0,7);
  const [selMonth, setSelMonth] = useState(_defMonth);
  const [selYear, setSelYear] = useState(String(new Date().getFullYear()));

  const filtered = transactions.filter(t => {
    if (period==="month") return t.date?.startsWith(selMonth);
    if (period==="year")  return t.date?.startsWith(selYear);
    return true;
  });

  const nfItems = filtered.filter(t => t.nfFile || t.nfLink);
  const _expAgg  = aggregate(filtered, 0);
  const totalEnt = _expAgg.totalEntradas;
  const totalSai = _expAgg.totalOutflows;
  const totalDiv = _expAgg.totalDividendos;

  const periodLabel = period==="month" ? new Date(selMonth+"-15").toLocaleDateString("pt-BR",{month:"long",year:"numeric"})
    : period==="year" ? selYear : "Todos os perÃ­odos";

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
<title>RelatÃ³rio ContÃ¡bil â ${periodLabel}</title>
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
<h1>RelatÃ³rio ContÃ¡bil Â· Stand ProduÃ§Ãµes / Veloso ProduÃ§Ãµes</h1>
<p style="color:#666;margin-bottom:24px">PerÃ­odo: <strong>${periodLabel}</strong> Â· Gerado em ${new Date().toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"})}</p>

<div class="resumo">
  <div class="resumo-card">
    <div class="resumo-label">Entradas</div>
    <div class="resumo-valor" style="color:#16a34a">R$ ${totalEnt.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
  </div>
  <div class="resumo-card">
    <div class="resumo-label">SaÃ­das + Impostos</div>
    <div class="resumo-valor" style="color:#c8102e">R$ ${totalSai.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
  </div>
  <div class="resumo-card">
    <div class="resumo-label">Dividendos</div>
    <div class="resumo-valor" style="color:#7c3aed">R$ ${totalDiv.toLocaleString("pt-BR",{minimumFractionDigits:2})}</div>
  </div>
</div>

<h2>LanÃ§amentos por Categoria</h2>
${Object.entries(cats).map(([cat,items])=>`
  <h3>${cat}</h3>
  <table>
    <tr><th>Data</th><th>DescriÃ§Ã£o</th><th>Tipo</th><th>Parcela</th><th>NF</th><th class="valor">Valor</th></tr>
    ${items.map(t=>`
      <tr>
        <td>${new Date(t.date+"T12:00:00").toLocaleDateString("pt-BR")}</td>
        <td>${t.description||"â"}${t.beneficiario?` (${t.beneficiario})`:""}</td>
        <td>${t.type==="entrada"?"Entrada":t.type==="saida"?"SaÃ­da":t.type==="dividendos"?"Dividendos":t.type==="imposto"?"Imposto":"Transfer."}</td>
        <td>${t.parcelaAtual&&t.parcelaTotal?`${t.parcelaAtual}/${t.parcelaTotal}x`:"â"}</td>
        <td>${t.nfFile?"ð Anexada":t.nfLink?`<a href="${t.nfLink}" target="_blank">Ver NF</a>`:"â"}</td>
        <td class="valor ${t.type==="entrada"?"entrada":t.type==="dividendos"?"dividendo":"saida"}">
          ${t.type==="entrada"?"+":"â"} R$ ${Number(t.amount).toLocaleString("pt-BR",{minimumFractionDigits:2})}
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
  <tr><td>Despesas e Impostos</td><td class="valor saida">â R$ ${totalSai.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
  <tr><td>Dividendos DistribuÃ­dos</td><td class="valor dividendo">â R$ ${totalDiv.toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
  <tr class="total-row"><td>Resultado do perÃ­odo</td><td class="valor">R$ ${(totalEnt-totalSai-totalDiv).toLocaleString("pt-BR",{minimumFractionDigits:2})}</td></tr>
</table>

<div class="footer">
  ENTREGAS Â· Stand / Veloso ProduÃ§Ãµes Â· Gerado automaticamente Â· ${new Date().toLocaleString("pt-BR")}
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
        <DsButton variant="secondary" size="sm" onClick={generateReport} leftIcon={<DsIcon name="printer" size={13} color={ds.color.neutral[600]}/>}>Gerar relatÃ³rio PDF</DsButton>
      </>}>

      <SRule>PerÃ­odo</SRule>
      <div style={{ display:"flex",gap:8,marginBottom:16 }}>
        {[{id:"month",label:"MÃªs"},{id:"year",label:"Ano"},{id:"all",label:"Todos"}].map(p=>(
          <div key={p.id} onClick={()=>setPeriod(p.id)}
            style={{ padding:"6px 14px",fontSize:12,fontWeight:period===p.id?700:400,cursor:"pointer",borderRadius:99,border:`1px solid ${period===p.id?TX:LN}`,background:period===p.id?TX:"none",color:period===p.id?"white":TX2,transition:TRANS }}>
            {p.label}
          </div>
        ))}
      </div>
      {period==="month"&&<Field label="MÃªs"><Input type="month" value={selMonth} onChange={e=>setSelMonth(e.target.value)}/></Field>}
      {period==="year"&&<Field label="Ano"><Select value={selYear} onChange={e=>setSelYear(e.target.value)}>{[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}</Select></Field>}

      <SRule>Resumo do perÃ­odo</SRule>
      <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:10,marginBottom:16 }}>
        {[["Entradas",totalEnt,GRN],["SaÃ­das",totalSai,RED],["Dividendos",totalDiv,"#7C3AED"]].map(([l,v,c])=>(
          <div key={l} style={{ ...G,padding:"10px 12px",borderLeft:`3px solid ${c}` }}>
            <div style={{ fontSize:ds.font.size.xs,color:TX2,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>{l}</div>
            <div style={{ fontSize:15,fontWeight:700,color:c }}>{fmtMoney(v)}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize:11,color:TX2,marginBottom:8 }}>{filtered.length} lanÃ§amentos no perÃ­odo</div>

      {nfItems.length>0&&(
        <>
          <SRule>Notas Fiscais anexadas ({nfItems.length})</SRule>
          <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
            {nfItems.map((tx,i)=>(
              <div key={i} style={{ display:"flex",alignItems:"center",gap:10,padding:"8px 12px",background:B2,borderRadius:7 }}>
                <span style={{ fontSize:14 }}>{tx.nfFile?.type?.includes("image")?"ð¼":"ð"}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:11,fontWeight:600,color:TX,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{tx.description}</div>
                  <div style={{ fontSize:ds.font.size.xs,color:TX2 }}>{fmtDate(tx.date)} Â· {fmtMoney(tx.amount)}</div>
                </div>
                {tx.nfFile&&<a href={tx.nfFile.data} download={tx.nfFile.name||`NF_${tx.description}.pdf`}
                  style={{ padding:"4px 10px",fontSize:ds.font.size.xs,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:5,textDecoration:"none",flexShrink:0 }}>â Baixar</a>}
                {tx.nfLink&&!tx.nfFile&&<a href={tx.nfLink} target="_blank" rel="noreferrer"
                  style={{ padding:"4px 10px",fontSize:ds.font.size.xs,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:5,textDecoration:"none",flexShrink:0 }}>â Ver</a>}
              </div>
            ))}
          </div>
          <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:8 }}>ð¡ Baixe cada NF individualmente e envie junto com o relatÃ³rio PDF para o contador.</div>
        </>
      )}
      {nfItems.length===0&&filtered.length>0&&(
        <div style={{ fontSize:11,color:TX3,fontStyle:"italic" }}>Nenhuma NF anexada nos lanÃ§amentos deste perÃ­odo.</div>
      )}
    </Modal>
  );
}


export default function Caixa({ contracts, openCopilot, role = "admin", syncStatus = "synced", onRetrySync, toast: toastProp }) {
  // ââ Step-up session ââââââââââââââââââââââââââââââââââââ
  const session = useCaixaSession();
  const { unlocked } = session;
  const isMobile = useIsMobile();

  // tab state moved to useQueryState above
  // ââ Seed from localStorage immediately so UI never flashes empty ââ
  const [transactions, setTransactions] = useState(() => lsLoad("caixa_tx", []));
  const [baseBalance, setBaseBalance]   = useState(() => lsLoad("caixa_base", 0));
  const [baseDate, setBaseDate]         = useState(() => lsLoad("caixa_base_date", ""));
  const [valuesHidden, setValuesHidden] = useState(false);
  const prevTxIds  = useRef([]);
  const syncTimer  = useRef(null);
  const pendingSync = useRef(null); // last list awaiting debounced sync

  // Carrega e mescla dados do Firebase com localStorage
  // EstratÃ©gia: merge por ID â Firebase + localStorage, item mais recente vence.
  // Isso evita perda de dados quando:
  //   - O sync falhou silenciosamente em uma sessÃ£o anterior
  //   - TransaÃ§Ãµes foram criadas em sessÃµes diferentes (mÃºltiplas abas/devices)
  useEffect(() => {
    let cancelled = false;
    const load = async (attempt = 0) => {
      try {
        const [remoteTxs, base, bdate] = await Promise.all([
          loadCaixaTx(),
          getSetting("caixa_base"),
          getSetting("caixa_base_date"),
        ]);
        if (cancelled) return;

        const localTxs = lsLoad("caixa_tx", []);

        // Se Firebase retornou vazio e localStorage tem dados â pode ser auth
        // ainda inicializando. Tenta 1 vez apÃ³s 1.5s.
        if ((!remoteTxs || remoteTxs.length === 0) && localTxs.length > 0 && attempt === 0) {
          setTimeout(() => load(1), 1500);
          return;
        }

        // ââ Merge por ID: une as duas fontes, item mais recente vence ââââââââââ
        // TransaÃ§Ãµes sem updatedAt sÃ£o tratadas como mais antigas (ts = "")
        const mergeTs = (t) => t.updatedAt || t.createdAt || "";
        const map = new Map();
        // 1. Seed com Firebase
        for (const t of (remoteTxs || [])) map.set(t.id, t);
        // 2. Local sobrescreve se for mais recente (ou se Firebase nÃ£o tem o item)
        for (const t of localTxs) {
          const existing = map.get(t.id);
          if (!existing || mergeTs(t) > mergeTs(existing)) map.set(t.id, t);
        }
        const merged = [...map.values()];

        setTransactions(merged);
        prevTxIds.current = merged.map(t => t.id);
        lsSave("caixa_tx", merged);

        // Se o merge adicionou itens que o Firebase nÃ£o tinha â re-sincroniza
        const remoteIds = new Set((remoteTxs || []).map(t => t.id));
        const hasNew    = merged.some(t => !remoteIds.has(t.id));
        if (hasNew) {
          console.warn("[Caixa] Itens locais nÃ£o encontrados no Firebase â re-sincronizando...");
          /* DESATIVADO: re-sync automatico de locais 'faltantes' ressuscitava docs deletados em outras maquinas. Firestore agora e autoridade. */
        }

        if (base  != null && base  !== "") setBaseBalance(Number(base) || 0);
        if (bdate && bdate !== "")         setBaseDate(bdate);

      } catch(e) {
        console.error("[Caixa] Erro ao carregar dados:", e);
        // localStorage jÃ¡ foi semeado no useState inicial â UI continua funcionando
      }
    };
    load();
    return () => { cancelled = true; };
  }, []);
  const [txModal, setTxModal] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  // ââ URL-persisted state (Task 3) âââââââââââââââââââââââââââââââââââââ
  // dreYear lives in IndicadoresFinanceiros but is lifted here for URL sync
  const [dreYear, setDreYear] = useQueryState("caixa_dre_ano", new Date().getFullYear(), {
    serialize: (v) => String(v),
    parse:     (v) => { const n = parseInt(v, 10); return n >= 2020 && n <= 2100 ? n : null; },
  });
  const tabRefs = useRef({});
  const [tab, setTab] = useQueryState("caixa_tab", "dash", {
    parse: (v) => ["dash","lancamentos","dre","indicadores"].includes(v) ? v : null,
  });
  const [period, setPeriod] = useQueryState("caixa_periodo", defaultPeriod(), {
    serialize: serializePeriod,
    parse: (s) => parsePeriod(s) ?? defaultPeriod(),
  });
  const [search, setSearch] = useQueryState("caixa_q", "");
  const [filterType2, setFilterType2] = useQueryState("caixa_tipo", "all");
  // toast comes as a prop from ViewRenderer (bypasses lazy module context boundary)
  const toast = toastProp ?? null;

  // ââ Executa o sync efetivo no Firestore (chamada por debounce) âââââââââââ
  const flushSync = useCallback(async (stamped) => {
    try {
      const newIds  = new Set(stamped.map(t => t.id));
      const removed = prevTxIds.current.filter(id => !newIds.has(id));
      if (removed.length > 0) {
        await Promise.allSettled(removed.map(id => deleteItem("caixa_tx", id)));
      }
      await syncCaixaTx(stamped, prevTxIds.current);
      prevTxIds.current = [...newIds];
    } catch(e) {
      console.error("[Caixa] flushSync falhou:", e);
      const errMsg = e?.code === "resource-exhausted"
        ? "Cota do banco atingida. Dados salvos localmente â serÃ£o sincronizados quando a cota resetar (meia-noite, horÃ¡rio de LA)."
        : "Falha ao sincronizar com o banco. Dados salvos localmente.";
      try { toast?.(errMsg, "error"); } catch {}
    }
  }, [toast]);

  // ââ saveTx: atualiza estado/localStorage imediatamente, debounce o Firestore ââ
  const saveTx = useCallback((list) => {
    const now = new Date().toISOString();
    const stamped = list.map(t => t.updatedAt ? t : { ...t, updatedAt: now });
    // 1. Estado local e localStorage â imediato (zero latÃªncia percebida)
    setTransactions(stamped);
    lsSave("caixa_tx", stamped);
    pendingSync.current = stamped;
    // 2. Firestore â debounce 2s (agrupa mÃºltiplas ediÃ§Ãµes em 1 escrita)
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => {
      if (pendingSync.current) flushSync(pendingSync.current);
    }, 2000);
  }, [flushSync]);

  // Flush pendente ao desmontar o componente
  useEffect(() => {
    return () => {
      clearTimeout(syncTimer.current);
      if (pendingSync.current) flushSync(pendingSync.current);
    };
  }, [flushSync]);

  const updateBase = async (val, date) => {
    setBaseBalance(Number(val)||0);
    setBaseDate(date);
    lsSave("caixa_base", Number(val)||0);
    lsSave("caixa_base_date", date);
    try {
      await setSetting("caixa_base", String(val));
      await setSetting("caixa_base_date", date);
    } catch(e) {
      if (import.meta.env.DEV) console.error("[Caixa] updateBase:", e);
      toast?.("Falha ao salvar saldo base remoto. CÃ³pia local OK.", "warning");
    }
  };

  const [minVal, setMinVal] = useQueryState("caixa_min", "");
  const [maxVal, setMaxVal] = useQueryState("caixa_max", "");
  // Period picker state
  const [periodPickerOpen, setPeriodPickerOpen] = useState(false);

  // ââ Role gate (Task 2) âââââââââââââââââââââââââââââââââ
  if (role !== "admin") {
    return (
      <div style={{ padding:ds.space[12], textAlign:"center", color:TX2 }}>
        <div style={{ width:48,height:48,borderRadius:ds.radius.full,background:ds.color.neutral[100],display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:ds.space[4] }}>
          <DsIcon name="lock" size={22} color={ds.color.neutral[500]}/>
        </div>
        <h2 style={{ fontSize:ds.font.size.lg,fontWeight:ds.font.weight.semibold,color:TX,marginBottom:ds.space[1],letterSpacing:"-.01em" }}>Acesso restrito</h2>
        <p style={{ fontSize:ds.font.size.sm,color:TX2,maxWidth:320,margin:"0 auto" }}>O Controle Financeiro estÃ¡ disponÃ­vel apenas para administradores.</p>
      </div>
    );
  }

  // ââ Step-up gate: if session is locked, show CaixaGate ââ
  // (hook is always called above â gate wraps the JSX output, not the hooks)
  if (!unlocked) {
    return <CaixaGate session={session}><div/></CaixaGate>;
  }

  // ââ Computed saldo ââââââââââââââââââââââââââââââââââââââ
  // Saldo REALIZADO: sÃ³ conta transaÃ§Ãµes com data <= hoje.
  // Parcelas futuras sÃ£o COMPROMISSOS (exibidos em "Parcelas futuras" no Dashboard),
  // nÃ£o devem desfalcar o caixa antes de vencer.
  const _today = useMemo(() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
  }, []);

  // TransaÃ§Ãµes realizadas (passado + hoje)
  const realizedTx = useMemo(
    () => transactions.filter(t => t.date && t.date <= _today),
    [transactions, _today]
  );
  // TransaÃ§Ãµes futuras (ainda nÃ£o vencidas)
  const futureTx = useMemo(
    () => transactions.filter(t => t.date && t.date > _today),
    [transactions, _today]
  );

  // Saldo atual = base + fluxo realizado
  const _aggRealized    = useMemo(() => aggregate(realizedTx, baseBalance), [realizedTx, baseBalance]);
  const saldoTotal      = _aggRealized.saldoTotal;
  const totalEntradas   = _aggRealized.totalEntradas;
  const totalSaidas     = _aggRealized.totalOutflows;
  const totalDividendos = _aggRealized.totalDividendos;

  // Comprometido futuro (para exibiÃ§Ã£o no Dashboard â nÃ£o altera saldo)
  const _aggFuture      = useMemo(() => aggregate(futureTx, 0), [futureTx]);
  const futureSaidas    = _aggFuture.totalOutflows;   // quanto ainda vai sair
  const futureEntradas  = _aggFuture.totalEntradas;   // quanto ainda vai entrar

  // ââ Period-based filtering âââââââââââââââââââââââââââââââ
  const periodTx = useMemo(() =>
    transactions.filter(t => t.date >= period.from && t.date <= period.to),
    [transactions, period.from, period.to]
  );
  const monthTx = useMemo(() =>
    periodTx
      .filter(t => filterType2==="all" || t.type===filterType2)
      .filter(t => !search || t.description?.toLowerCase().includes(search.toLowerCase()) || t.category?.toLowerCase().includes(search.toLowerCase()) || t.notes?.toLowerCase().includes(search.toLowerCase()))
      .filter(t => !minVal || Number(t.amount) >= Number(minVal))
      .filter(t => !maxVal || Number(t.amount) <= Number(maxVal))
      .sort((a,b) => b.date.localeCompare(a.date)),
    [periodTx, filterType2, search, minVal, maxVal]
  );

  const totalDoMes  = periodTx;
  const _monthAgg   = useMemo(() => aggregate(periodTx, 0), [periodTx]);
  const monthEntradas   = _monthAgg.totalEntradas;
  const monthSaidas     = _monthAgg.totalOutflows;
  const monthDividendos = _monthAgg.totalDividendos;
  const monthNet        = monthEntradas - monthSaidas - monthDividendos;
  const pDays           = periodDays(period);
  const pLabel          = getPeriodLabel(period);
  const pCanNav         = canNavigate(period.presetId);
  // backward compat aliases
  const monthLabel      = pLabel;
  const monthKey        = period.from.slice(0,7);

  const TABS = [
    { id:"dash",        label:"Dashboard" },
    { id:"lancamentos", label:"LanÃ§amentos" },
    { id:"dre",         label:"DRE" },
    { id:"indicadores", label:"Indicadores" },
    { id:"ia",          label:"Consulta IA", hidden:true },
  ];

  return (
    <CaixaGate session={session}>
    <div style={{ padding:"24px 28px", maxWidth:"min(1280px, calc(100% - 48px))" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
          <h1 style={{ fontSize:22,fontWeight:700,color:TX,letterSpacing:"-.02em" }}>Controle Financeiro</h1>
          <span style={{ fontSize:ds.font.size.xs,padding:"3px 8px",borderRadius:99,background:`${RED}15`,color:RED,fontWeight:700 }}>ADMIN</span>
          {/* Sync status chip â Task 4 */}
          {(() => {
            const map = {
              synced:  { label:"Sincronizado",   color:GRN,  icon:"checkCircle",  spin:false },
              ok:      { label:"Sincronizado",   color:GRN,  icon:"checkCircle",  spin:false },
              syncing: { label:"Sincronizando...",color:TX3,  icon:"refresh",      spin:true  },
              loading: { label:"Sincronizando...",color:TX3,  icon:"refresh",      spin:true  },
              offline: { label:"Offline",        color:AMB,  icon:"alertCircle",  spin:false },
              error:   { label:"Erro de sync",   color:RED,  icon:"alertTriangle",spin:false },
            };
            const s = map[syncStatus] || map.synced;
            return (
              <div aria-live="polite" style={{ display:"inline-flex",alignItems:"center",gap:4,
                padding:"3px 8px",borderRadius:99,background:`${s.color}12`,border:`1px solid ${s.color}25` }}>
                <DsIcon name={s.icon} size={11} color={s.color}
                  style={s.spin?{animation:"ranked-spin .9s linear infinite"}:undefined}/>
                <span style={{ fontSize:ds.font.size.xs,fontWeight:600,color:s.color }}>{s.label}</span>
                {syncStatus==="error" && onRetrySync && (
                  <button onClick={onRetrySync}
                    style={{ marginLeft:2,fontSize:ds.font.size.xs,color:RED,background:"none",border:"none",cursor:"pointer",fontWeight:700,padding:0,fontFamily:"inherit" }}>
                    Tentar novamente
                  </button>
                )}
              </div>
            );
          })()}
          <button onClick={()=>setValuesHidden(v=>!v)} style={{ padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:8,background:"none",border:`1px solid ${LN}`,color:TX2,display:"flex",alignItems:"center",gap:6 }}>
            <DsIcon name={valuesHidden?"eyeOff":"eye"} size={14} />
            {valuesHidden ? "Mostrar valores" : "Ocultar valores"}
          </button>
                    <button onClick={()=>setShowExport(true)} style={{ marginLeft:"auto",padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:8,background:"none",border:`1px solid ${LN}`,color:TX2,display:"flex",alignItems:"center",gap:6 }}>
            Exportar para contador
          </button>
        </div>
        <p style={{ fontSize:13,color:TX2 }}>LanÃ§amentos, saldo e DRE</p>
      </div>

      {/* KPIs â valores realizados (date <= hoje) */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20 }}>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${saldoTotal>=0?TX:RED}` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Saldo Total</div>
          <div style={{ fontSize:22,fontWeight:700,color:saldoTotal>=0?TX:RED }}>{valuesHidden ? "••••••" : fmtMoney(saldoTotal)}</div>
          <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:2 }}>
            base + realizados
            {futureSaidas>0&&<span style={{ color:AMB,marginLeft:6 }}>Â· â{valuesHidden ? "••••••" : fmtMoney(futureSaidas)} comprometido</span>}
          </div>
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${GRN}` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Entradas realizadas</div>
          <div style={{ fontSize:22,fontWeight:700,color:GRN }}>{valuesHidden ? "••••••" : fmtMoney(totalEntradas)}</div>
          {futureEntradas>0&&<div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:2 }}>+{valuesHidden ? "••••••" : fmtMoney(futureEntradas)} a receber</div>}
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${RED}` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>SaÃ­das realizadas</div>
          <div style={{ fontSize:22,fontWeight:700,color:RED }}>{valuesHidden ? "••••••" : fmtMoney(totalSaidas)}</div>
          {futureSaidas>0&&<div style={{ fontSize:ds.font.size.xs,color:AMB,marginTop:2 }}>{valuesHidden ? "••••••" : fmtMoney(futureSaidas)} agendado</div>}
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid #7C3AED` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Dividendos realizados</div>
          <div style={{ fontSize:22,fontWeight:700,color:"#7C3AED" }}>{valuesHidden ? "••••••" : fmtMoney(totalDividendos)}</div>
        </div>
      </div>

      {/* Saldo base config */}
      <SaldoBaseEditor baseBalance={baseBalance} baseDate={baseDate} onSave={updateBase} valuesHidden={valuesHidden}/>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="SeÃ§Ãµes do Controle Financeiro"
        style={{ display:"flex",gap:0,borderBottom:`1px solid ${LN}`,marginBottom:20,marginTop:16,alignItems:"center" }}
        onKeyDown={(e)=>{
          const visible = TABS.filter(t=>!t.hidden);
          const idx = visible.findIndex(t=>t.id===tab);
          let next = idx;
          if (e.key==="ArrowRight") next = (idx+1) % visible.length;
          else if (e.key==="ArrowLeft") next = (idx-1+visible.length) % visible.length;
          else if (e.key==="Home") next = 0;
          else if (e.key==="End") next = visible.length-1;
          else return;
          e.preventDefault();
          const nextId = visible[next].id;
          setTab(nextId);
          tabRefs.current[nextId]?.focus();
        }}>
        {TABS.filter(t=>!t.hidden).map(t=>(
          <button
            key={t.id}
            ref={el=>{ tabRefs.current[t.id]=el; }}
            id={`tab-${t.id}`}
            role="tab"
            aria-selected={tab===t.id}
            aria-controls={`tabpanel-${t.id}`}
            tabIndex={tab===t.id ? 0 : -1}
            onClick={()=>setTab(t.id)}
            style={{ padding:"10px 18px",fontSize:12,fontWeight:tab===t.id?700:400,cursor:"pointer",color:tab===t.id?TX:TX2,borderBottom:`2px solid ${tab===t.id?ds.color.neutral[900]:"transparent"}`,transition:TRANS,marginBottom:-1,background:"none",border:"none",fontFamily:"inherit",outline:"none" }}>
            {t.label}
          </button>
        ))}
        <div style={{ flex:1 }}/>
        <DsButton variant="secondary" size="sm"
          onClick={()=>openCopilot?.({actionId:"ask-financial"})}
          leftIcon={<DsIcon name="sparkles" size={13} color={ds.color.copilot[500]}/>}
          style={{ color:ds.color.copilot[500], borderColor:`${ds.color.copilot[500]}40`, marginBottom:1 }}>
          Copiloto
        </DsButton>
      </div>

      {/* Dashboard */}
      <div id="tabpanel-dash" role="tabpanel" aria-labelledby="tab-dash" tabIndex={0} hidden={tab!=="dash"}>
        {tab==="dash" && <CaixaDash transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal} activePeriod={period} valuesHidden={valuesHidden}/>}
      </div>

      {/* LanÃ§amentos por mÃªs */}
      <div id="tabpanel-lancamentos" role="tabpanel" aria-labelledby="tab-lancamentos" tabIndex={0} hidden={tab!=="lancamentos"}>
      {tab==="lancamentos" && (
        <div>
          {/* Filters */}
          <div style={{ display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar descriÃ§Ã£o, categoria..."
              style={{ flex:1,minWidth:180,padding:"7px 12px",fontSize:12,background:B1,border:`1px solid ${LN}`,borderRadius:8,color:TX,fontFamily:"inherit",outline:"none" }}/>
            {/* Value range filter */}
            <div style={{ display:"flex",alignItems:"center",gap:4,background:B1,border:`1px solid ${LN}`,borderRadius:8,padding:"0 10px" }}>
              <span style={{ fontSize:ds.font.size.xs,color:TX3,flexShrink:0 }}>R$</span>
              <input type="number" value={minVal} onChange={e=>setMinVal(e.target.value)} placeholder="Min"
                style={{ width:64,padding:"7px 0",fontSize:12,background:"transparent",border:"none",color:TX,fontFamily:"inherit",outline:"none" }}/>
              <span style={{ fontSize:ds.font.size.xs,color:TX3 }}>â</span>
              <input type="number" value={maxVal} onChange={e=>setMaxVal(e.target.value)} placeholder="Max"
                style={{ width:64,padding:"7px 0",fontSize:12,background:"transparent",border:"none",color:TX,fontFamily:"inherit",outline:"none" }}/>
              {(minVal||maxVal) && (
                <button onClick={()=>{setMinVal("");setMaxVal("");}}
                  style={{ background:"none",border:"none",color:TX3,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1 }}>Ã</button>
              )}
            </div>
            <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
              {[{id:"all",label:"Todos"},{id:"entrada",label:"â Entradas"},{id:"saida",label:"â SaÃ­das"},{id:"dividendos",label:"Dividendos"},{id:"imposto",label:"Impostos"},{id:"transferencia",label:"Trans."}].map(f=>(
                <div key={f.id} onClick={()=>setFilterType2(f.id)}
                  style={{ padding:"6px 12px",fontSize:11,fontWeight:filterType2===f.id?700:400,cursor:"pointer",borderRadius:99,border:`1px solid ${filterType2===f.id?TX:LN}`,background:filterType2===f.id?TX:"none",color:filterType2===f.id?"white":TX2,transition:TRANS,whiteSpace:"nowrap" }}>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
          {/* ââ Period nav ââââââââââââââââââââââââââââââââââ */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
            {/* â¹ prev */}
            <button
              onClick={()=>setPeriod(p=>shiftPeriod(p,-1))}
              disabled={!pCanNav}
              title={pCanNav?"PerÃ­odo anterior":"PerÃ­odo relativo â nÃ£o navegÃ¡vel"}
              style={{ background:"none",border:`1px solid ${pCanNav?LN:LN+"80"}`,borderRadius:6,width:32,height:32,cursor:pCanNav?"pointer":"not-allowed",color:pCanNav?TX2:TX3,fontSize:16,flexShrink:0 }}>
              â¹
            </button>

            {/* Period label + subtotals + picker */}
            <div style={{ flex:1,textAlign:"center",position:"relative" }}>
              <button
                onClick={()=>setPeriodPickerOpen(o=>!o)}
                aria-expanded={periodPickerOpen} aria-haspopup="dialog"
                style={{ background:"none",border:`1px solid transparent`,fontWeight:700,fontSize:15,color:TX,cursor:"pointer",fontFamily:"inherit",padding:"2px 8px",borderRadius:4,transition:"border-color .15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=LN}
                onMouseLeave={e=>e.currentTarget.style.borderColor="transparent"}>
                {pLabel} â¾
              </button>
              <div style={{ fontSize:11,color:TX2,marginTop:1 }}>
                <span style={{ color:GRN }}>+{valuesHidden ? "••••••" : fmtMoney(monthEntradas)}</span>
                {" Â· "}
                <span style={{ color:RED }}>â{valuesHidden ? "••••••" : fmtMoney(monthSaidas)}</span>
                {monthDividendos>0&&<><span style={{ color:TX2 }}> Â· </span><span style={{ color:"#7C3AED" }}>div {valuesHidden ? "••••••" : fmtMoney(monthDividendos)}</span></>}
                {" Â· "}
                <span style={{ fontWeight:700,color:monthNet>=0?GRN:RED }}>{monthNet>=0?"+":""}{valuesHidden ? "••••••" : fmtMoney(monthNet)}</span>
                {pDays>31&&<span style={{ marginLeft:6,fontSize:10,color:TX3,background:B2,border:`1px solid ${LN}`,borderRadius:99,padding:"1px 6px" }}>({pDays} dias)</span>}
              </div>

              {/* ââ Period picker popover âââ */}
              {periodPickerOpen&&(
                <PeriodPicker
                  period={period}
                  transactions={transactions}
                  onApply={(p)=>{ setPeriod(p); setPeriodPickerOpen(false); }}
                  onClose={()=>setPeriodPickerOpen(false)}
                  isMobile={isMobile}
                  colors={{ B1,B2,LN,LN2,TX,TX2,TX3,RED,GRN }}
                />
              )}
            </div>

            {/* âº next */}
            <button
              onClick={()=>setPeriod(p=>shiftPeriod(p,+1))}
              disabled={!pCanNav}
              title={pCanNav?"PrÃ³ximo perÃ­odo":"PerÃ­odo relativo â nÃ£o navegÃ¡vel"}
              style={{ background:"none",border:`1px solid ${pCanNav?LN:LN+"80"}`,borderRadius:6,width:32,height:32,cursor:pCanNav?"pointer":"not-allowed",color:pCanNav?TX2:TX3,fontSize:16,flexShrink:0 }}>
              âº
            </button>

            {/* Reset to current month */}
            <button onClick={()=>setPeriod(defaultPeriod())}
              style={{ background:"none",border:`1px solid ${LN}`,borderRadius:6,padding:"0 10px",height:32,cursor:"pointer",color:TX2,fontSize:11,fontWeight:600,flexShrink:0 }}>
              PadrÃ£o
            </button>

            <DsButton variant="primary" size="sm" onClick={()=>setTxModal({})} leftIcon={<DsIcon name="plus" size={13} color={ds.color.neutral[0]}/>}>LanÃ§amento</DsButton>
          </div>

          {/* Results counter + clear button (Task 1) */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12,fontSize:12,color:TX2 }}>
            <div role="status" aria-live="polite">
              Mostrando <strong style={{ color:TX }}>{monthTx.length}</strong> de {totalDoMes.length} lanÃ§amentos
            </div>
            {(search!==""||minVal!==""||maxVal!==""||filterType2!=="all") && (
              <button onClick={()=>{ setSearch(""); setMinVal(""); setMaxVal(""); setFilterType2("all"); }}
                style={{ background:"none",border:`1px solid ${LN}`,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer",color:TX2,transition:"all .15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=TX2}
                onMouseLeave={e=>e.currentTarget.style.borderColor=LN}>
                Ã Limpar filtros
              </button>
            )}
          </div>

          {monthTx.length===0 ? (
            <div style={{ textAlign:"center",padding:"48px 0",color:TX3 }}>
              Nenhum lanÃ§amento neste perÃ­odo.
              <br/><DsButton variant="primary" size="sm" style={{marginTop:12}} onClick={()=>setTxModal({})}>+ Adicionar</DsButton>
            </div>
          ) : (
            <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
              {monthTx.map(tx=>{
                const tc = txColor(tx.type);
                return (
                  <div key={tx.id} style={{ ...G,padding:"12px 16px",display:"flex",alignItems:"center",gap:14 }}>
                    <div style={{ width:36,height:36,borderRadius:ds.radius.md,background:tc+"15",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>
                      <DsIcon name={txIconName(tx.type)} size={16} color={tc}/>
                    </div>
                    <div style={{ flex:1,minWidth:0 }}>
                      <div style={{ fontWeight:600,fontSize:13,color:TX,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{tx.description}</div>
                      <div style={{ fontSize:11,color:TX2,display:"flex",gap:8,marginTop:2,flexWrap:"wrap" }}>
                        <span>{fmtDate(tx.date)}</span>
                        {tx.category&&<span>Â· {tx.category}</span>}
                        {tx.beneficiario&&<span style={{fontWeight:600,color:"#7C3AED"}}>Â· {tx.beneficiario}</span>}
                        {tx.contractId&&<span style={{color:TX3}}>Â· {contracts.find(c=>c.id===tx.contractId)?.company}</span>}
                        {tx.installmentNum&&tx.installmentTotal&&<span style={{color:BLU,fontWeight:700,fontSize:ds.font.size.xs,padding:"1px 6px",borderRadius:99,background:`${BLU}12`,border:`1px solid ${BLU}20`}}>{tx.installmentNum}/{tx.installmentTotal}x</span>}
                        {tx.parcelaAtual&&tx.parcelaTotal&&<span style={{color:AMB,fontWeight:700}}>Â· {tx.parcelaAtual}/{tx.parcelaTotal}x</span>}
                        {(tx.nfLink||tx.nfFile)&&<span style={{color:BLU}}>Â· NF</span>}
                      </div>
                      {tx.notes&&<div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:2 }}>{tx.notes}</div>}
                    </div>
                    <div style={{ textAlign:"right",flexShrink:0 }}>
                      <div style={{ fontSize:15,fontWeight:700,color:tc }}>
                        {tx.type==="entrada"?"+":tx.type==="transferencia"?"":"â"}{valuesHidden ? "•••••" : fmtMoney(tx.amount)}
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:4,flexShrink:0 }}>
                      <DsIconButton size="sm" variant="ghost" ariaLabel="Editar lanÃ§amento" onClick={()=>setTxModal(tx)}
                        icon={<DsIcon name="edit" size={13} color={ds.color.neutral[500]}/>}/>
                      <DsIconButton size="sm" variant="ghost" ariaLabel="Excluir lanÃ§amento" onClick={()=>{if(confirm("Excluir?")) saveTx(transactions.filter(t=>t.id!==tx.id));}}
                        icon={<DsIcon name="x" size={13} color={ds.color.danger[500]}/>}/>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      </div>{/* /tabpanel-lancamentos */}

      <div id="tabpanel-indicadores" role="tabpanel" aria-labelledby="tab-indicadores" tabIndex={0} hidden={tab!=="indicadores"}>
        {tab==="indicadores" && <IndicadoresFinanceiros transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal} contracts={contracts} year={dreYear} setYear={setDreYear} valuesHidden={valuesHidden}/>}
      </div>

      {/* IA Financeira */}
      {tab==="ia" && (() => {
        const totalEnt2 = transactions.filter(t=>t.type==="entrada").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const totalSai2 = transactions.filter(t=>t.type==="saida"||t.type==="imposto").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const totalDiv2 = transactions.filter(t=>t.type==="dividendos").reduce((s,t)=>s+(Number(t.amount)||0),0);
        const lucro2 = totalEnt2 - totalSai2 - totalDiv2;
        const catBreakdown = Object.entries(transactions.filter(t=>t.type==="saida"&&t.category).reduce((acc,t)=>{acc[t.category]=(acc[t.category]||0)+(Number(t.amount)||0);return acc;},{})).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: R$${v.toLocaleString("pt-BR")}`).join(", ");
        const ctx = `Empresa: Stand/Veloso ProduÃ§Ãµes. Saldo: R$${saldoTotal.toLocaleString("pt-BR")}. Entradas: R$${totalEnt2.toLocaleString("pt-BR")}. SaÃ­das: R$${totalSai2.toLocaleString("pt-BR")}. Dividendos: R$${totalDiv2.toLocaleString("pt-BR")}. Lucro lÃ­quido: R$${lucro2.toLocaleString("pt-BR")}. Contratos ativos: ${contracts.length}. Top despesas: ${catBreakdown||"nenhuma"}. LanÃ§amentos: ${transactions.length}.`;

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
              system: `VocÃª Ã© o consultor financeiro do criador de conteÃºdo @veloso.lucas_ (canal de futebol, 2M seguidores). A empresa Ã© Stand/Veloso ProduÃ§Ãµes. Responda em portuguÃªs, de forma direta e prÃ¡tica. Contexto financeiro: ${ctx}`,
              messages: [...history, { role:"user", content:userMsg }]
            })});
            const data = await res.json();
            setAiMessages(m => [...m, { role:"assistant", text:data.text||"NÃ£o consegui processar." }]);
          } catch(e) { setAiMessages(m => [...m, { role:"assistant", text:"Erro: "+String(e) }]); }
          setAiLoading(false);
        };

        return (
          <div style={{ display:"flex",flexDirection:"column",height:"60vh",maxHeight:600 }}>
            <div style={{ ...G,padding:"10px 16px",marginBottom:16,fontSize:11,color:TX2 }}>
              ð¡ Pergunte sobre seus nÃºmeros, estratÃ©gias financeiras, como reduzir custos, melhorar margens, planejamento tributÃ¡rio, etc.
            </div>
            {/* Messages */}
            <div style={{ flex:1,overflowY:"auto",display:"flex",flexDirection:"column",gap:12,marginBottom:16,padding:"4px 0" }}>
              {aiMessages.length===0&&(
                <div style={{ textAlign:"center",padding:"40px 20px",color:TX3 }}>
                  <div style={{ fontSize:32,marginBottom:12 }}>â¡</div>
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
                    {msg.role==="user"?"M":"â¡"}
                  </div>
                  <div style={{ maxWidth:"80%",padding:"10px 14px",borderRadius:msg.role==="user"?"12px 12px 0 12px":"12px 12px 12px 0",background:msg.role==="user"?RED:B2,color:msg.role==="user"?"white":TX,fontSize:12,lineHeight:1.6,whiteSpace:"pre-wrap" }}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {aiLoading&&(
                <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                  <div style={{ width:28,height:28,borderRadius:"50%",background:`${BLU}20`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:BLU,fontWeight:700 }}>â¡</div>
                  <div style={{ padding:"10px 14px",borderRadius:"12px 12px 12px 0",background:B2,fontSize:12,color:TX2 }}>Analisando seus dados...</div>
                </div>
              )}
            </div>
            {/* Input */}
            <div style={{ display:"flex",gap:8 }}>
              <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&sendMsg()}
                placeholder="Pergunte algo sobre suas finanÃ§as..."
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
      <div id="tabpanel-dre" role="tabpanel" aria-labelledby="tab-dre" tabIndex={0} hidden={tab!=="dre"}>
      {tab==="dre" && (
        <div>
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:20 }}>
            <span style={{ fontSize:12,color:TX2 }}>ExercÃ­cio:</span>
            {[new Date().getFullYear()-1, new Date().getFullYear()].map(y=>(
              <div key={y} onClick={()=>setDreYear(y)}
                style={{ padding:"5px 14px",fontSize:12,fontWeight:dreYear===y?700:400,cursor:"pointer",borderRadius:99,background:dreYear===y?TX:B2,color:dreYear===y?"white":TX2,border:`1px solid ${dreYear===y?TX:LN}`,transition:TRANS }}>
                {y}
              </div>
            ))}
          </div>
          <DREView transactions={transactions} year={dreYear} valuesHidden={valuesHidden}/>
        </div>
      )}

      </div>{/* /tabpanel-dre */}

      {showExport && <ContadorExportModal transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal} initialFrom={period.from} initialTo={period.to} onClose={()=>setShowExport(false)}/>}
      {txModal!==null && (
        <TransactionModal accounts={[]} contracts={contracts} initial={txModal.id?txModal:null}
          defaultDate={new Date().toISOString().slice(0,10)}
          onClose={()=>setTxModal(null)}
          onSave={(tx)=>{
            if (Array.isArray(tx)) {
              saveTx([...transactions, ...tx]);
              toast?.(`${tx.length} parcelas criadas ð`, "success");
            } else {
              saveTx(txModal.id ? transactions.map(t=>t.id===tx.id?tx:t) : [...transactions,tx]);
              toast?.(`${txModal.id?"Atualizado":"Salvo"}`, "success");
            }
            setTxModal(null);
          }}/>
      )}
    </div>
    </CaixaGate>
  );
}

// âââ Saldo Base Editor ââââââââââââââââââââââââââââââââââââ
function SaldoBaseEditor({ baseBalance, baseDate, onSave, valuesHidden }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(baseBalance||"0"));
  const [date, setDate] = useState(baseDate||new Date().toISOString().substr(0,10));

  const save = () => { onSave(val, date); setEditing(false); };

  return (
    <div style={{ ...G,padding:"12px 18px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap" }}>
      <div style={{ flex:1 }}>
        <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:2 }}>Saldo Base (ponto de partida)</div>
        <div style={{ display:"flex",alignItems:"center",gap:10 }}>
          <span style={{ fontSize:16,fontWeight:700,color:TX }}>{fmtMoney(Number(baseBalance)||0)}</span>
          {baseDate&&<span style={{ fontSize:11,color:TX2 }}>em {formatDate(baseDate)}</span>}
          {!baseDate&&<span style={{ fontSize:11,color:TX3 }}>nÃ£o definido</span>}
        </div>
      </div>
      {!editing ? (
        <button onClick={()=>{setEditing(true);}} style={{ padding:"6px 14px",fontSize:11,fontWeight:600,cursor:"pointer",borderRadius:6,background:"none",border:`1px solid ${LN}`,color:TX2,display:"flex",alignItems:"center",gap:6 }}>Alterar saldo base</button>
      ) : (
        <div style={{ display:"flex",gap:6,alignItems:"center",flexWrap:"wrap" }}>
          <input type="number" value={val} onChange={e=>setVal(e.target.value)} autoFocus placeholder="0,00"
            style={{ padding:"6px 10px",fontSize:13,fontWeight:700,background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",width:120 }}/>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)}
            style={{ padding:"6px 10px",fontSize:12,background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}/>
          <button onClick={save} style={{ padding:"6px 14px",background:GRN,border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer" }}>Salvar</button>
          <button onClick={()=>{setEditing(false);}} style={{ padding:"6px 8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>Ã</button>
        </div>
      )}
    </div>
  );
}

