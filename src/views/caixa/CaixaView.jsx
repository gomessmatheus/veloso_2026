/**
 * src/views/caixa/CaixaView.jsx
 *
 * View Controle Financeiro (Caixa) extraída de App.jsx.
 * Migração incremental — Fase 5.
 *
 * Exporta: Caixa (default export via React.lazy em App.jsx)
 *
 * Dependências externas:
 *   react · firebase/firestore (via db.js) · design system (ui/index.js)
 *   src/lib/finance.js · src/lib/format.js · src/lib/url-state.js
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  loadCaixaTx, syncCaixaTx, getSetting, setSetting,
} from "../../db.js";
import { theme as ds, Button as DsButton, IconButton as DsIconButton, Icon as DsIcon, Input as DsInput, Card as DsCard, Modal as DsModal, Toggle as DsToggle, Select as DsSelect } from "../../ui/index.js";
import {
  aggregate, monthlyBreakdown, burnRate as calcBurnRate,
  liquidityRatio, futureInstallments as calcFutureInstallments,
  isInflow, isOutflow, isDividend, isTax,
  TX_TYPES as FIN_TX, sum as finSum,
} from "../../lib/finance.js";
import { formatDate } from "../../lib/format.js";
import { useQueryState } from "../../lib/url-state.js";

// ─── Tokens (local — mirrors App.jsx globals) ─────────────
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

// ─── Mini utility functions (local copies) ────────────────
// TODO Fase 6: import from src/lib/utils.js

function fmtMoney(v, currency = "BRL") {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency, minimumFractionDigits:0, maximumFractionDigits:0 }).format(v || 0);
}
const fmtDate = (s) => {
  try {
    if (!s) return "—";
    const parts = String(s).split("-");
    if (parts.length < 3) return "—";
    const [y,m,d] = parts;
    return `${d}/${m}/${y}`;
  } catch { return "—"; }
};
function lsLoad(k, fb) { try { const v=localStorage.getItem(k); return v!=null?JSON.parse(v):fb; } catch { return fb; } }
function lsSave(k, v)   { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function useIsMobile()  { const [m, setM] = useState(window.innerWidth < 768); useEffect(()=>{ const h=()=>setM(window.innerWidth<768); window.addEventListener("resize",h); return()=>window.removeEventListener("resize",h); },[]); return m; }

// ─── Toast ───────────────────────────────────────────────
// ToastCtx is created in App.jsx. To reach it from a React.lazy chunk,
// we import it from the shared module created in Fase 5.
// TODO Fase 6: move ToastCtx to src/lib/toast.js
// For now: hook returns a safe no-op — toasts are optional feedback.
function useToast() {
  // Returns null safely; all call-sites use optional chaining (toast?.()).
  return null;
}

// ─── Local UI micro-components ────────────────────────────
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


// ─── Caixa: constants & helpers ──────────────────────────

const TX_TYPES = [
  { id:"entrada",       label:"Entrada",        iconName:"arrowDown",  color:ds.color.success[500]  },
  { id:"saida",         label:"Saída",           iconName:"arrowUp",    color:ds.color.brand[500]    },
  { id:"dividendos",    label:"Dividendos",      iconName:"zap",        color:ds.color.copilot[500]  },
  { id:"imposto",       label:"Imposto",         iconName:"landmark",   color:ds.color.warning[500]  },
  { id:"transferencia", label:"Transferência",   iconName:"arrowRight", color:ds.color.info[500]     },
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

function txColor(type)    { return TX_TYPES.find(t=>t.id===type)?.color    || ds.color.neutral[500]; }
function txIconName(type) { return TX_TYPES.find(t=>t.id===type)?.iconName || "minus"; }
function txEmoji(type)    { return TX_TYPES.find(t=>t.id===type)?.iconName || "minus"; }

// ─── Balance Editor Button ─────────────────────────────────
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
        <input value={newNote} onChange={e=>setNewNote(e.target.value)} placeholder="Observação (opcional)"
          style={{ width:"100%",padding:"7px 10px",fontSize:11,background:B1,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none",marginBottom:8 }}/>
        <div style={{ display:"flex",gap:6 }}>
          <button onClick={save} style={{ flex:1,padding:"7px",background:GRN,border:"none",borderRadius:6,color:"white",fontSize:11,fontWeight:700,cursor:"pointer" }}>✓ Salvar</button>
          <button onClick={()=>{setOpen(false);setStep("editing");}} style={{ padding:"7px 12px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>Cancelar</button>
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
                  Preview — {parcPreview.length} lançamentos serão criados
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
    <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,padding:"14px 0 4px",borderBottom:`1px solid ${LN}` }}>{title}</div>
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
        <div style={{ fontSize:ds.font.size.xs,color:TX2,marginBottom:4 }}>⚠️ Esta DRE é gerada automaticamente com base nos lançamentos cadastrados. Consulte seu contador para fins legais.</div>
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

  // ── Compromissos futuros (parcelamentos) — via finance.js ──
  const futureInstallments = useMemo(
    () => calcFutureInstallments(transactions),
    [transactions]
  );

  const totalFutureDebt = futureInstallments.reduce((s,[,v])=>s+v.total,0);

  // Quebra mensal do ano — via finance.js (sem filter+reduce inline)
  const _breakdown = useMemo(
    () => monthlyBreakdown(transactions, currentYear),
    [transactions, currentYear]
  );
  const monthData = _breakdown.map((m) => ({
    month:     MONTHS_SH2[m.monthIndex],
    entradas:  m.ent,
    saidas:    m.sai + m.imp,  // combinado para o gráfico de barras
    dividendos: m.div,
    net:       m.net,
  }));

  const maxVal = Math.max(...monthData.map(d=>Math.max(d.entradas,d.saidas)),1);

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:20 }}>
      {/* Saldo card */}
      <div style={{ ...G,padding:"16px 20px",borderLeft:`3px solid ${saldoTotal>=0?GRN:RED}` }}>
        <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Saldo em caixa</div>
        <div style={{ fontSize:28,fontWeight:700,color:saldoTotal>=0?TX:RED }}>{fmtMoney(saldoTotal)}</div>
        <div style={{ fontSize:11,color:TX2,marginTop:4 }}>Base {fmtMoney(Number(baseBalance)||0)} + lançamentos</div>
      </div>

      {/* Compromissos futuros — parcelamentos */}
      {futureInstallments.length > 0 && (
        <div style={{ ...G, padding:"16px 20px", borderLeft:`3px solid ${AMB}` }}>
          <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:12 }}>
            <div>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:2 }}>Compromissos futuros · Parcelamentos</div>
              <div style={{ fontSize:22,fontWeight:800,color:RED }}>{fmtMoney(totalFutureDebt)}</div>
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
                      {isHeavy && <span style={{ fontSize:ds.font.size.xs, color:RED, fontWeight:700 }}>⚠ Alto</span>}
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
        // KPIs via finance.js — sem filter+reduce inline
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
            <div title="Liquidez = Saldo atual ÷ Despesa mensal média. Atenção < 3x · Regular 3–6x · Excelente > 6x." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${liquidez===null?LN:kpiColor(liquidez,3,1.5)}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Liquidez</div>
              <div style={{ fontSize:22,fontWeight:700,color:liquidez===null?TX3:kpiColor(liquidez,3,1.5) }}>
                {liquidez===null?"—":`${fmt1(liquidez)}x`}
              </div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>meses de runway</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>
                {liquidez===null?"sem dados":liquidez>=3?"✓ Saudável":liquidez>=1.5?"⚠ Atenção":"🔴 Crítico"}
              </div>
            </div>

            {/* Margem de Lucro */}
            <div title="Margem Líquida = Lucro Líquido ÷ Receita. Atenção < 10% · Regular 10–20% · Excelente > 20%." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${margemLucro===null?LN:kpiColor(margemLucro,30,10)}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Margem Líquida</div>
              <div style={{ fontSize:22,fontWeight:700,color:margemLucro===null?TX3:kpiColor(margemLucro,30,10) }}>
                {margemLucro===null?"—":`${fmt1(margemLucro)}%`}
              </div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>lucro ÷ receita</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>
                {margemLucro===null?"sem dados":margemLucro>=30?"✓ Excelente":margemLucro>=10?"⚠ Regular":"🔴 Baixa"}
              </div>
            </div>

            {/* ROI Operacional */}
            <div title="ROI Operacional = (Receita − Custos) ÷ Custos. Atenção < 50% · Regular 50–100% · Excelente > 100%." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${roi===null?LN:kpiColor(roi,50,20)}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>ROI Operacional</div>
              <div style={{ fontSize:22,fontWeight:700,color:roi===null?TX3:kpiColor(roi,50,20) }}>
                {roi===null?"—":`${fmt1(roi)}%`}
              </div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>retorno sobre custos</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>
                {roi===null?"sem dados":roi>=50?"✓ Excelente":roi>=20?"⚠ Regular":"🔴 Baixo"}
              </div>
            </div>

            {/* Burn Rate */}
            <div title="Burn Rate = média de saídas mensais (meses com movimento). Quanto menor, melhor para runway." style={{ ...G,padding:"14px 16px",borderTop:`3px solid ${BLU}` }}>
              <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".1em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Burn Rate</div>
              <div style={{ fontSize:22,fontWeight:700,color:TX }}>{fmtMoney(burnRate)}</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX2,marginTop:3 }}>saídas/mês (média)</div>
              <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:4 }}>base {monthlyData.length} meses</div>
            </div>
          </div>
        );
      })()}

      {/* Bar chart with projection (Task 4) */}
      <div style={{ ...G,padding:"18px 20px" }}>
        <div style={{ fontSize:12,fontWeight:700,color:TX,marginBottom:4 }}>Entradas vs Saídas {currentYear}</div>
        <div style={{ display:"flex",gap:12,fontSize:ds.font.size.xs,color:TX2,marginBottom:16,flexWrap:"wrap" }}>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:GRN,display:"inline-block" }}/>Entradas</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:RED,display:"inline-block" }}/>Saídas</span>
          <span style={{ display:"flex",alignItems:"center",gap:4 }}><span style={{ width:10,height:10,borderRadius:2,background:"#7C3AED",display:"inline-block" }}/>Dividendos</span>
          {currentYear===new Date().getFullYear()&&(
            <span style={{ display:"flex",alignItems:"center",gap:4 }}>
              <span style={{ width:10,height:10,borderRadius:2,border:`1px solid ${LN2}`,display:"inline-block",
                backgroundImage:"repeating-linear-gradient(45deg,transparent 0 3px,rgba(0,0,0,.12) 3px 6px)" }}/>
              Projeção (parcelas futuras)
            </span>
          )}
        </div>
        <div style={{ display:"flex",alignItems:"flex-end",gap:4,height:120 }}>
          {monthData.map((d,i)=>{
            const isCurrentYear = currentYear===new Date().getFullYear();
            const isFuture = isCurrentYear && i > new Date().getMonth();
            const projStyle = isFuture ? {
              opacity:0.45,
              backgroundImage:"repeating-linear-gradient(45deg,transparent 0 4px,rgba(0,0,0,.08) 4px 8px)",
            } : {};
            return (
              <div key={i} style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:2 }}>
                <div style={{ width:"100%",display:"flex",gap:1,alignItems:"flex-end",height:100 }}>
                  <div style={{ flex:1,background:GRN,height:`${maxVal>0?d.entradas/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",minHeight:d.entradas>0?3:0,...projStyle }}/>
                  <div style={{ flex:1,background:RED,height:`${maxVal>0?d.saidas/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",minHeight:d.saidas>0?3:0,...projStyle }}/>
                  {d.dividendos>0&&<div style={{ flex:1,background:"#7C3AED",height:`${maxVal>0?d.dividendos/maxVal*100:0}%`,borderRadius:"3px 3px 0 0",...projStyle }}/>}
                </div>
                <div style={{ fontSize:8,color:isFuture?TX3+"88":TX3,textAlign:"center" }}>{d.month}</div>
              </div>
            );
          })}
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
                  {name!=="Ambos"&&totalAmbos>0&&<div style={{ fontSize:ds.font.size.xs,color:TX2 }}>Direto {fmtMoney(total)} + {fmtMoney(totalAmbos/2)} (metade dos "Ambos")</div>}
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
                    <span style={{ fontWeight:700,color:TX }}>{fmtMoney(val)}</span>
                  </div>
                  <div style={{ height:4,background:LN,borderRadius:2 }}>
                    <div title={`${pct}% do total de saídas`}
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

// ─── Caixa (Controle Financeiro Administrativo) ───────────

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
function IndicadoresFinanceiros({ transactions, baseBalance, saldoTotal, contracts, year: yearProp, setYear: setYearProp }) {
  const [yearLocal, setYearLocal] = useState(new Date().getFullYear());
  const year = yearProp ?? yearLocal;
  const setYear = setYearProp ?? setYearLocal;
  const txYear = transactions.filter(t => t.date?.startsWith(String(year)));
  const _breakdown_ind = useMemo(() => monthlyBreakdown(txYear, year), [txYear, year]);

  // Agregados via finance.js — sem filter+reduce inline
  const _indAgg    = aggregate(txYear, 0);
  const receita    = _indAgg.totalEntradas;
  const despesas   = _indAgg.totalOutflows;  // saida+imposto (compat. legado)
  const dividendos = _indAgg.totalDividendos;
  const lucroLiq   = _indAgg.lucroLiquido;
  const ebitda     = _indAgg.ebitda;         // CORRIGIDO: receitaLiquida - CSP - despOp

  // Custos fixos (para ponto de equilíbrio) — mantém lógica existente
  const fixedCats = ["Pessoal / RH","Aluguel / Condomínio","Utilidades (Luz, Água, Internet)","Software / SaaS","Contabilidade","Material de Escritório","Material de Limpeza","Móveis e Eletrodomésticos"];
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
        { label:"Margem de Lucro Líquida", tooltip:"Lucro líquido ÷ Receita Líquida.", value:margemLucro!=null?`${fmt2(margemLucro)}%`:"—", desc:"Lucro líquido / Receita", color:margemLucro!=null?(margemLucro>20?GRN:margemLucro>5?AMB:RED):TX2, good:margemLucro!=null&&margemLucro>20 },
        { label:"Margem Bruta", tooltip:"(Receita − Custos) ÷ Receita Líquida.", value:margemBruta!=null?`${fmt2(margemBruta)}%`:"—", desc:"(Receita − Despesas) / Receita", color:margemBruta!=null?(margemBruta>30?GRN:margemBruta>10?AMB:RED):TX2, good:margemBruta!=null&&margemBruta>30 },
        { label:"EBITDA", tooltip:"Receita Líquida − Custos − Despesas Operacionais (D&A=0).", value:fmtMoney(ebitda), desc:"Resultado antes de impostos e dividendos", color:ebitda>=0?GRN:RED, good:ebitda>0 },
        { label:"Margem EBITDA", tooltip:"EBITDA ÷ Receita Líquida.", value:margemEBITDA!=null?`${fmt2(margemEBITDA)}%`:"—", desc:"EBITDA / Receita", color:margemEBITDA!=null?(margemEBITDA>25?GRN:margemEBITDA>10?AMB:RED):TX2, good:margemEBITDA!=null&&margemEBITDA>25 },
        { label:"ROI", tooltip:"Lucro Líquido ÷ Total Investido.", value:roi!=null?`${fmt2(roi)}%`:"—", desc:"Lucro Líquido / Total Investido", color:roi!=null?(roi>0?GRN:RED):TX2, good:roi!=null&&roi>0 },
      ]
    },
    {
      group: "Liquidez & Caixa",
      items: [
        { label:"Liquidez (meses)", tooltip:"Saldo atual ÷ Despesa mensal média.", value:liquidez!=null?`${liquidez.toFixed(1)}x`:"—", desc:"Saldo atual cobre quantos meses de despesas", color:liquidez!=null?(liquidez>3?GRN:liquidez>1?AMB:RED):TX2, good:liquidez!=null&&liquidez>3 },
        { label:"Saldo em Caixa", tooltip:"Saldo base + lançamentos acumulados.", value:fmtMoney(saldoTotal), desc:"Base inicial + lançamentos acumulados", color:saldoTotal>=0?TX:RED, good:saldoTotal>0 },
        { label:"Despesa Mensal Média", tooltip:"Média das saídas dos meses com movimento.", value:fmtMoney(despesaMensal), desc:`Média de ${monthsWithData} meses com dados`, color:TX2, good:null },
      ]
    },
    {
      group: "Operacional",
      items: [
        { label:"Ticket Médio Contratos", tooltip:"Soma dos contratos ativos ÷ nº de contratos.", value:ticketMedio!=null?fmtMoney(ticketMedio):"—", desc:"Valor médio por contrato ativo", color:TX, good:null },
        { label:"Ponto de Equilíbrio", tooltip:"Receita mínima necessária para cobrir custos fixos + variáveis.", value:pontoEquil!=null?fmtMoney(pontoEquil):"—", desc:"Receita mínima para cobrir todos os custos", color:receita>0&&pontoEquil!=null?(receita>=pontoEquil?GRN:RED):TX2, good:receita>0&&pontoEquil!=null&&receita>=pontoEquil },
        { label:"Prazo Médio Recebimento", tooltip:"Média dos prazos de pagamento dos contratos.", value:fmtDias(pmr), desc:"Média dos prazos de contratos", color:pmr!=null?(pmr<60?GRN:pmr<90?AMB:RED):TX2, good:pmr!=null&&pmr<60 },
        { label:"Prazo Médio Estoque", tooltip:"N/A — empresa de serviços.", value:"N/A", desc:"Não aplicável — empresa de serviços", color:TX3, good:null },
      ]
    },
    {
      group: "Receita",
      items: [
        { label:"Receita Total", tooltip:"Soma das entradas do ano fiscal.", value:fmtMoney(receita), desc:`Todas as entradas de ${year}`, color:GRN, good:null },
        { label:"Despesas Totais", tooltip:"Saídas + impostos do ano fiscal.", value:fmtMoney(despesas), desc:`Saídas + impostos de ${year}`, color:RED, good:null },
        { label:"Dividendos Distribuídos", tooltip:"Soma dos lançamentos do tipo dividendos.", value:fmtMoney(dividendos), desc:`Distribuição de lucros de ${year}`, color:"#7C3AED", good:null },
        { label:"Custo Fixo Total", tooltip:"RH + aluguel + utilidades + administrativo.", value:fmtMoney(custoFixo), desc:"RH, aluguel, utilidades, adm", color:TX2, good:null },
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
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:12,paddingBottom:8,borderBottom:`1px solid ${LN}` }}>{group.group}</div>
          <div style={{ display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))",gap:10 }}>
            {group.items.map((ind,i)=>(
              <div key={i} title={ind.tooltip||""} style={{ ...G,padding:"14px 16px",borderLeft:`3px solid ${ind.color}` }}>
                <div style={{ display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:4 }}>
                  <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,lineHeight:1.3,flex:1 }}>{ind.label}</div>
                  {ind.good===true&&<span style={{ fontSize:ds.font.size.xs,color:GRN,flexShrink:0,marginLeft:6 }}>✓</span>}
                  {ind.good===false&&<span style={{ fontSize:ds.font.size.xs,color:RED,flexShrink:0,marginLeft:6 }}>⚠</span>}
                </div>
                <div style={{ fontSize:20,fontWeight:700,color:ind.color,lineHeight:1,marginBottom:4 }}>{ind.value}</div>
                <div style={{ fontSize:ds.font.size.xs,color:TX3,lineHeight:1.4 }}>{ind.desc}</div>
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
  const _expAgg  = aggregate(filtered, 0);
  const totalEnt = _expAgg.totalEntradas;
  const totalSai = _expAgg.totalOutflows;
  const totalDiv = _expAgg.totalDividendos;

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
        <DsButton variant="secondary" size="sm" onClick={generateReport} leftIcon={<DsIcon name="printer" size={13} color={ds.color.neutral[600]}/>}>Gerar relatório PDF</DsButton>
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
            <div style={{ fontSize:ds.font.size.xs,color:TX2,fontWeight:700,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>{l}</div>
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
                  <div style={{ fontSize:ds.font.size.xs,color:TX2 }}>{fmtDate(tx.date)} · {fmtMoney(tx.amount)}</div>
                </div>
                {tx.nfFile&&<a href={tx.nfFile.data} download={tx.nfFile.name||`NF_${tx.description}.pdf`}
                  style={{ padding:"4px 10px",fontSize:ds.font.size.xs,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:5,textDecoration:"none",flexShrink:0 }}>↓ Baixar</a>}
                {tx.nfLink&&!tx.nfFile&&<a href={tx.nfLink} target="_blank" rel="noreferrer"
                  style={{ padding:"4px 10px",fontSize:ds.font.size.xs,fontWeight:700,color:BLU,background:`${BLU}12`,border:`1px solid ${BLU}30`,borderRadius:5,textDecoration:"none",flexShrink:0 }}>↗ Ver</a>}
              </div>
            ))}
          </div>
          <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:8 }}>💡 Baixe cada NF individualmente e envie junto com o relatório PDF para o contador.</div>
        </>
      )}
      {nfItems.length===0&&filtered.length>0&&(
        <div style={{ fontSize:11,color:TX3,fontStyle:"italic" }}>Nenhuma NF anexada nos lançamentos deste período.</div>
      )}
    </Modal>
  );
}


export default function Caixa({ contracts, openCopilot, role = "admin", syncStatus = "synced", onRetrySync }) {
  // tab state moved to useQueryState above
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
      } catch(e) {
        if (import.meta.env.DEV) console.error("[Caixa] carregamento remoto:", e);
        toast?.("Falha ao carregar dados do caixa. Usando cópia local.", "warning");
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
  // ── URL-persisted state (Task 3) ─────────────────────────────────────
  // dreYear lives in IndicadoresFinanceiros but is lifted here for URL sync
  const [dreYear, setDreYear] = useQueryState("caixa_dre_ano", new Date().getFullYear(), {
    serialize: (v) => String(v),
    parse:     (v) => { const n = parseInt(v, 10); return n >= 2020 && n <= 2100 ? n : null; },
  });
  const tabRefs = useRef({});
  const [tab, setTab] = useQueryState("caixa_tab", "dash", {
    parse: (v) => ["dash","lancamentos","dre","indicadores"].includes(v) ? v : null,
  });
  const [monthOffset, setMonthOffset] = useQueryState("caixa_mes", 0, {
    serialize: (offset) => {
      const d = new Date();
      const t = new Date(d.getFullYear(), d.getMonth() + offset, 1);
      return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}`;
    },
    parse: (str) => {
      const m = /^(\d{4})-(\d{2})$/.exec(str);
      if (!m) return null;
      const y = parseInt(m[1],10), mo = parseInt(m[2],10);
      if (mo < 1 || mo > 12) return null;
      const now = new Date();
      return (y - now.getFullYear()) * 12 + (mo - 1 - now.getMonth());
    },
  });
  const [search, setSearch] = useQueryState("caixa_q", "");
  const [filterType2, setFilterType2] = useQueryState("caixa_tipo", "all");
  const toast = useToast();

  const saveTx = async (list) => {
    setTransactions(list);
    lsSave("caixa_tx", list);
    try {
      await syncCaixaTx(list, prevTxIds.current);
      prevTxIds.current = list.map(t => t.id);
    } catch(e) {
      if (import.meta.env.DEV) console.error("[Caixa] syncCaixaTx:", e);
      toast?.("Falha ao sincronizar lançamento. Tentaremos novamente.", "error");
    }
  };

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
      toast?.("Falha ao salvar saldo base remoto. Cópia local OK.", "warning");
    }
  };

  const [minVal, setMinVal] = useQueryState("caixa_min", "");
  const [maxVal, setMaxVal] = useQueryState("caixa_max", "");
  // Month/year picker (Task 2)
  const [pickerOpen, setPickerOpen]   = useState(false);
  const [pickerMonth, setPickerMonth] = useState(0); // 0-based
  const [pickerYear, setPickerYear]   = useState(new Date().getFullYear());
  const pickerRef = useRef(null);

  // ── Role gate (Task 2) ─────────────────────────────────
  if (role !== "admin") {
    return (
      <div style={{ padding:ds.space[12], textAlign:"center", color:TX2 }}>
        <div style={{ width:48,height:48,borderRadius:ds.radius.full,background:ds.color.neutral[100],display:"inline-flex",alignItems:"center",justifyContent:"center",marginBottom:ds.space[4] }}>
          <DsIcon name="lock" size={22} color={ds.color.neutral[500]}/>
        </div>
        <h2 style={{ fontSize:ds.font.size.lg,fontWeight:ds.font.weight.semibold,color:TX,marginBottom:ds.space[1],letterSpacing:"-.01em" }}>Acesso restrito</h2>
        <p style={{ fontSize:ds.font.size.sm,color:TX2,maxWidth:320,margin:"0 auto" }}>O Controle Financeiro está disponível apenas para administradores.</p>
      </div>
    );
  }

  // ── Computed saldo ──────────────────────────────────────
  // Agregados centralizados — via finance.js (sem filter+reduce inline)
  const _agg            = aggregate(transactions, baseBalance);
  const totalEntradas   = _agg.totalEntradas;
  const totalSaidas     = _agg.totalOutflows;  // saida+imposto combinados (display "Saídas totais")
  const totalDividendos = _agg.totalDividendos;
  const saldoTotal      = _agg.saldoTotal;

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

  // Unfiltered total for the counter (Task 1)
  const totalDoMes = transactions.filter(t => t.date?.startsWith(monthKey));
  const _monthAgg       = aggregate(monthTx, 0);
  const monthEntradas   = _monthAgg.totalEntradas;
  const monthSaidas     = _monthAgg.totalOutflows;
  const monthDividendos = _monthAgg.totalDividendos;
  const monthNet        = monthEntradas - monthSaidas - monthDividendos;

  const TABS = [
    { id:"dash",        label:"Dashboard" },
    { id:"lancamentos", label:"Lançamentos" },
    { id:"dre",         label:"DRE" },
    { id:"indicadores", label:"Indicadores" },
    { id:"ia",          label:"Consulta IA", hidden:true },
  ];

  return (
    <div style={{ padding:"24px 28px", maxWidth:"min(1280px, calc(100% - 48px))" }}>
      <div style={{ marginBottom:20 }}>
        <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:4 }}>
          <h1 style={{ fontSize:22,fontWeight:700,color:TX,letterSpacing:"-.02em" }}>Controle Financeiro</h1>
          <span style={{ fontSize:ds.font.size.xs,padding:"3px 8px",borderRadius:99,background:`${RED}15`,color:RED,fontWeight:700 }}>ADMIN</span>
          {/* Sync status chip — Task 4 */}
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
          <button onClick={()=>setShowExport(true)} style={{ marginLeft:"auto",padding:"7px 16px",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:8,background:"none",border:`1px solid ${LN}`,color:TX2,display:"flex",alignItems:"center",gap:6 }}>
            Exportar para contador
          </button>
        </div>
        <p style={{ fontSize:13,color:TX2 }}>Lançamentos, saldo e DRE</p>
      </div>

      {/* KPIs */}
      <div style={{ display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12,marginBottom:20 }}>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${saldoTotal>=0?TX:RED}` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Saldo Total</div>
          <div style={{ fontSize:22,fontWeight:700,color:saldoTotal>=0?TX:RED }}>{fmtMoney(saldoTotal)}</div>
          <div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:2 }}>base + lançamentos</div>
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${GRN}` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Entradas totais</div>
          <div style={{ fontSize:22,fontWeight:700,color:GRN }}>{fmtMoney(totalEntradas)}</div>
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid ${RED}` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Saídas totais</div>
          <div style={{ fontSize:22,fontWeight:700,color:RED }}>{fmtMoney(totalSaidas)}</div>
        </div>
        <div style={{ ...G,padding:"16px 18px",borderLeft:`3px solid #7C3AED` }}>
          <div style={{ fontSize:ds.font.size.xs,fontWeight:700,letterSpacing:".12em",textTransform:"uppercase",color:TX2,marginBottom:4 }}>Dividendos totais</div>
          <div style={{ fontSize:22,fontWeight:700,color:"#7C3AED" }}>{fmtMoney(totalDividendos)}</div>
        </div>
      </div>

      {/* Saldo base config */}
      <SaldoBaseEditor baseBalance={baseBalance} baseDate={baseDate} onSave={updateBase}/>

      {/* Tabs */}
      <div
        role="tablist"
        aria-label="Seções do Controle Financeiro"
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
            style={{ padding:"10px 18px",fontSize:12,fontWeight:tab===t.id?700:400,cursor:"pointer",color:tab===t.id?TX:TX2,borderBottom:`2px solid ${tab===t.id?ds.color.neutral[900]:"transparent"}`,transition:TRANS,marginBottom:-1,background:"none",border:"none",borderBottom:`2px solid ${tab===t.id?ds.color.neutral[900]:"transparent"}`,fontFamily:"inherit",outline:"none" }}>
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
        {tab==="dash" && <CaixaDash transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal}/>}
      </div>

      {/* Lançamentos por mês */}
      <div id="tabpanel-lancamentos" role="tabpanel" aria-labelledby="tab-lancamentos" tabIndex={0} hidden={tab!=="lancamentos"}>
      {tab==="lancamentos" && (
        <div>
          {/* Filters */}
          <div style={{ display:"flex",gap:8,marginBottom:12,flexWrap:"wrap" }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar descrição, categoria..."
              style={{ flex:1,minWidth:180,padding:"7px 12px",fontSize:12,background:B1,border:`1px solid ${LN}`,borderRadius:8,color:TX,fontFamily:"inherit",outline:"none" }}/>
            {/* Value range filter */}
            <div style={{ display:"flex",alignItems:"center",gap:4,background:B1,border:`1px solid ${LN}`,borderRadius:8,padding:"0 10px" }}>
              <span style={{ fontSize:ds.font.size.xs,color:TX3,flexShrink:0 }}>R$</span>
              <input type="number" value={minVal} onChange={e=>setMinVal(e.target.value)} placeholder="Min"
                style={{ width:64,padding:"7px 0",fontSize:12,background:"transparent",border:"none",color:TX,fontFamily:"inherit",outline:"none" }}/>
              <span style={{ fontSize:ds.font.size.xs,color:TX3 }}>–</span>
              <input type="number" value={maxVal} onChange={e=>setMaxVal(e.target.value)} placeholder="Max"
                style={{ width:64,padding:"7px 0",fontSize:12,background:"transparent",border:"none",color:TX,fontFamily:"inherit",outline:"none" }}/>
              {(minVal||maxVal) && (
                <button onClick={()=>{setMinVal("");setMaxVal("");}}
                  style={{ background:"none",border:"none",color:TX3,cursor:"pointer",fontSize:14,padding:"0 2px",lineHeight:1 }}>×</button>
              )}
            </div>
            <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
              {[{id:"all",label:"Todos"},{id:"entrada",label:"↓ Entradas"},{id:"saida",label:"↑ Saídas"},{id:"dividendos",label:"Dividendos"},{id:"imposto",label:"Impostos"},{id:"transferencia",label:"Trans."}].map(f=>(
                <div key={f.id} onClick={()=>setFilterType2(f.id)}
                  style={{ padding:"6px 12px",fontSize:11,fontWeight:filterType2===f.id?700:400,cursor:"pointer",borderRadius:99,border:`1px solid ${filterType2===f.id?TX:LN}`,background:filterType2===f.id?TX:"none",color:filterType2===f.id?"white":TX2,transition:TRANS,whiteSpace:"nowrap" }}>
                  {f.label}
                </div>
              ))}
            </div>
          </div>
          {/* Month nav with picker (Task 2) */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:16 }}>
            <button onClick={()=>setMonthOffset(o=>o-1)} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:6,width:32,height:32,cursor:"pointer",color:TX2,fontSize:16 }}>‹</button>
            <div style={{ flex:1,textAlign:"center",position:"relative" }}>
              {/* Clickable month label */}
              <button onClick={()=>{
                  setPickerMonth(viewMonth);
                  setPickerYear(viewYear);
                  setPickerOpen(p=>!p);
                }}
                style={{ background:"none",border:"none",fontWeight:700,fontSize:15,color:TX,cursor:"pointer",fontFamily:"inherit",padding:"2px 8px",borderRadius:4,
                  border:`1px solid transparent`,transition:"border-color .15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=LN}
                onMouseLeave={e=>e.currentTarget.style.borderColor="transparent"}
                aria-expanded={pickerOpen} aria-haspopup="dialog">
                {monthLabel} ▾
              </button>
              <div style={{ fontSize:11,color:TX2 }}>
                <span style={{ color:GRN }}>+{fmtMoney(monthEntradas)}</span>
                {" · "}
                <span style={{ color:RED }}>−{fmtMoney(monthSaidas)}</span>
                {monthDividendos>0&&<><span style={{ color:TX2 }}> · </span><span style={{ color:"#7C3AED" }}>div {fmtMoney(monthDividendos)}</span></>}
                {" · "}
                <span style={{ fontWeight:700, color:monthNet>=0?GRN:RED }}>{monthNet>=0?"+":""}{fmtMoney(monthNet)}</span>
              </div>
              {/* Month/year picker popover */}
              {pickerOpen && (() => {
                const txYears = [...new Set(transactions.map(t=>t.date?.substr(0,4)).filter(Boolean).map(Number))];
                const currY = new Date().getFullYear();
                const years = [...new Set([...txYears, currY, currY-1, currY-2])].sort((a,b)=>b-a);
                return (
                  <div ref={pickerRef} role="dialog" aria-modal="false" aria-label="Selecionar mês e ano"
                    style={{ position:"absolute",top:"calc(100% + 6px)",left:"50%",transform:"translateX(-50%)",
                      background:B1,border:`1px solid ${LN}`,borderRadius:10,padding:"16px",
                      boxShadow:"0 8px 24px rgba(0,0,0,.12)",zIndex:200,display:"flex",flexDirection:"column",gap:10,minWidth:220 }}
                    onKeyDown={e=>{if(e.key==="Escape") setPickerOpen(false);}}>
                    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:8 }}>
                      <div>
                        <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>Mês</div>
                        <select autoFocus value={pickerMonth} onChange={e=>setPickerMonth(Number(e.target.value))}
                          style={{ width:"100%",padding:"6px 8px",fontSize:12,background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}>
                          {["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].map((m,i)=>(
                            <option key={i} value={i}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div style={{ fontSize:ds.font.size.xs,fontWeight:700,color:TX2,textTransform:"uppercase",letterSpacing:".08em",marginBottom:4 }}>Ano</div>
                        <select value={pickerYear} onChange={e=>setPickerYear(Number(e.target.value))}
                          style={{ width:"100%",padding:"6px 8px",fontSize:12,background:B2,border:`1px solid ${LN}`,borderRadius:6,color:TX,fontFamily:"inherit",outline:"none" }}>
                          {years.map(y=><option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:6 }}>
                      <button onClick={()=>{
                          const now2=new Date();
                          const offset=(pickerYear-now2.getFullYear())*12+(pickerMonth-now2.getMonth());
                          setMonthOffset(offset);
                          setPickerOpen(false);
                        }}
                        style={{ flex:1,padding:"7px",fontSize:12,fontWeight:700,cursor:"pointer",borderRadius:6,background:TX,border:"none",color:"white" }}>
                        Ir
                      </button>
                      <button onClick={()=>setPickerOpen(false)}
                        style={{ padding:"7px 10px",fontSize:12,cursor:"pointer",borderRadius:6,background:"none",border:`1px solid ${LN}`,color:TX2 }}>
                        ×
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
            <button onClick={()=>setMonthOffset(o=>o+1)} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:6,width:32,height:32,cursor:"pointer",color:TX2,fontSize:16 }}>›</button>
            <button onClick={()=>setMonthOffset(0)} style={{ background:"none",border:`1px solid ${LN}`,borderRadius:6,padding:"0 12px",height:32,cursor:"pointer",color:TX2,fontSize:11,fontWeight:600 }}>Hoje</button>
            <DsButton variant="primary" size="sm" onClick={()=>setTxModal({})} leftIcon={<DsIcon name="plus" size={13} color={ds.color.neutral[0]}/>}>Lançamento</DsButton>
          </div>

          {/* Results counter + clear button (Task 1) */}
          <div style={{ display:"flex",alignItems:"center",gap:10,marginBottom:12,fontSize:12,color:TX2 }}>
            <div role="status" aria-live="polite">
              Mostrando <strong style={{ color:TX }}>{monthTx.length}</strong> de {totalDoMes.length} lançamentos
            </div>
            {(search!==""||minVal!==""||maxVal!==""||filterType2!=="all") && (
              <button onClick={()=>{ setSearch(""); setMinVal(""); setMaxVal(""); setFilterType2("all"); }}
                style={{ background:"none",border:`1px solid ${LN}`,borderRadius:99,padding:"3px 10px",fontSize:11,fontWeight:600,cursor:"pointer",color:TX2,transition:"all .15s" }}
                onMouseEnter={e=>e.currentTarget.style.borderColor=TX2}
                onMouseLeave={e=>e.currentTarget.style.borderColor=LN}>
                × Limpar filtros
              </button>
            )}
          </div>

          {monthTx.length===0 ? (
            <div style={{ textAlign:"center",padding:"48px 0",color:TX3 }}>
              Nenhum lançamento em {monthLabel}.
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
                        {tx.category&&<span>· {tx.category}</span>}
                        {tx.beneficiario&&<span style={{fontWeight:600,color:"#7C3AED"}}>· {tx.beneficiario}</span>}
                        {tx.contractId&&<span style={{color:TX3}}>· {contracts.find(c=>c.id===tx.contractId)?.company}</span>}
                        {tx.installmentNum&&tx.installmentTotal&&<span style={{color:BLU,fontWeight:700,fontSize:ds.font.size.xs,padding:"1px 6px",borderRadius:99,background:`${BLU}12`,border:`1px solid ${BLU}20`}}>{tx.installmentNum}/{tx.installmentTotal}x</span>}
                        {tx.parcelaAtual&&tx.parcelaTotal&&<span style={{color:AMB,fontWeight:700}}>· {tx.parcelaAtual}/{tx.parcelaTotal}x</span>}
                        {(tx.nfLink||tx.nfFile)&&<span style={{color:BLU}}>· NF</span>}
                      </div>
                      {tx.notes&&<div style={{ fontSize:ds.font.size.xs,color:TX3,marginTop:2 }}>{tx.notes}</div>}
                    </div>
                    <div style={{ textAlign:"right",flexShrink:0 }}>
                      <div style={{ fontSize:15,fontWeight:700,color:tc }}>
                        {tx.type==="entrada"?"+":tx.type==="transferencia"?"":"−"}{fmtMoney(tx.amount)}
                      </div>
                    </div>
                    <div style={{ display:"flex",gap:4,flexShrink:0 }}>
                      <DsIconButton size="sm" variant="ghost" ariaLabel="Editar lançamento" onClick={()=>setTxModal(tx)}
                        icon={<DsIcon name="edit" size={13} color={ds.color.neutral[500]}/>}/>
                      <DsIconButton size="sm" variant="ghost" ariaLabel="Excluir lançamento" onClick={()=>{if(confirm("Excluir?")) saveTx(transactions.filter(t=>t.id!==tx.id));}}
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
        {tab==="indicadores" && <IndicadoresFinanceiros transactions={transactions} baseBalance={baseBalance} saldoTotal={saldoTotal} contracts={contracts} year={dreYear} setYear={setDreYear}/>}
      </div>

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
      <div id="tabpanel-dre" role="tabpanel" aria-labelledby="tab-dre" tabIndex={0} hidden={tab!=="dre"}>
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

      </div>{/* /tabpanel-dre */}

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
          {!baseDate&&<span style={{ fontSize:11,color:TX3 }}>não definido</span>}
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
          <button onClick={()=>{setEditing(false);}} style={{ padding:"6px 8px",background:"none",border:`1px solid ${LN}`,borderRadius:6,color:TX2,fontSize:11,cursor:"pointer" }}>×</button>
        </div>
      )}
    </div>
  );
}

