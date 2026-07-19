/**
 * src/views/caixa/ProjectsTab.jsx
 *
 * Aba "Projetos" (centros de custo) do Controle Financeiro.
 * Casos de uso: Viagem Copa 2026, projetos grandes de YouTube etc.
 *
 * - Cada projeto guarda sua própria lista de gastos (BRL ou USD com cotação).
 * - Gastos pagos pela Empresa entram no caixa como 1 linha agregada por
 *   projeto/mês (calculada em src/lib/projects.js — nada é duplicado).
 * - Gastos pagos por Matheus/Lucas alimentam o painel de reembolsos; pagar um
 *   reembolso gera uma saída REAL no caixa (criada pelo CaixaView via
 *   onCreateReimbursementTx).
 */

import { useState, useMemo } from "react";
import { theme as ds, Button as DsButton, IconButton as DsIconButton, Icon as DsIcon } from "../../ui/index.js";
import {
  PROJECT_PAYERS, expenseBRL, projectTotals, reimbursementSummary,
  categoryBreakdown, monthlySpend,
} from "../../lib/projects.js";
import { readCache, fetchRates } from "../../lib/fx.js";

// Tokens locais (espelham CaixaView.jsx)
const B1  = "#FFFFFF";
const B2  = "#F8FAFC";
const LN  = "#E2E8F0";
const TX  = "#0F172A";
const TX2 = "#64748B";
const TX3 = "#94A3B8";
const RED = "#C8102E";
const GRN = "#16A34A";
const AMB = "#D97706";
const BLU = "#2563EB";
const G   = { background:ds.color.neutral[0], border:ds.border.thin, borderRadius:ds.radius.xl, boxShadow:ds.shadow.sm };
const TRANS = `all ${ds.motion.base}`;

const uid = () => Math.random().toString(36).substr(2, 9);

function fmtBRL(v) {
  if (v === null || v === undefined) return "—";
  return new Intl.NumberFormat("pt-BR", { style:"currency", currency:"BRL", minimumFractionDigits:0, maximumFractionDigits:0 }).format(v || 0);
}
function fmtUSD(v) {
  return new Intl.NumberFormat("en-US", { style:"currency", currency:"USD", minimumFractionDigits:0, maximumFractionDigits:0 }).format(v || 0);
}
const fmtDate = (s) => {
  if (!s) return "—";
  const [y, m, d] = String(s).split("-");
  return d ? `${d}/${m}/${y}` : "—";
};
const todayIso = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`;
};

function Field({ label, children }) {
  return (
    <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
      <label style={{ fontSize:ds.font.size.xs, fontWeight:ds.font.weight.medium, letterSpacing:".06em", textTransform:"uppercase", color:TX2 }}>{label}</label>
      {children}
    </div>
  );
}
const inputStyle = { width:"100%", padding:"8px 12px", fontSize:13, background:B1, border:`1px solid ${LN}`, borderRadius:6, color:TX, fontFamily:"inherit", outline:"none", boxSizing:"border-box" };

// ─── Modal genérico (mesmo padrão do CaixaView) ───────────
function Modal({ title, onClose, children, footer, width = 560 }) {
  const mob = window.innerWidth < 768;
  return (
    <div onClick={e=>{ if (e.target===e.currentTarget) onClose(); }}
      style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", backdropFilter:"blur(3px)", zIndex:600, display:"flex", alignItems:mob?"flex-end":"flex-start", justifyContent:"center", padding:mob?0:`${ds.space[12]} ${ds.space[4]}`, overflowY:"auto" }}>
      <div role="dialog" aria-modal="true"
        style={{ background:B1, borderRadius:mob?`${ds.radius.xl} ${ds.radius.xl} 0 0`:ds.radius.xl, border:mob?"none":ds.border.thin, width:"100%", maxWidth:mob?"100%":width, maxHeight:mob?"92vh":"calc(100vh - 96px)", display:"flex", flexDirection:"column", boxShadow:ds.shadow.lg, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:`${ds.space[4]} ${ds.space[5]}`, borderBottom:ds.border.thin, flexShrink:0 }}>
          <span style={{ fontSize:ds.font.size.sm, fontWeight:ds.font.weight.semibold, letterSpacing:"0.04em", textTransform:"uppercase", color:TX }}>{title}</span>
          <DsIconButton icon={<DsIcon name="x" size={16} color={ds.color.neutral[500]}/>} ariaLabel="Fechar" size="sm" variant="ghost" onClick={onClose}/>
        </div>
        <div style={{ padding:ds.space[5], overflowY:"auto", flex:1 }}>{children}</div>
        {footer && <div style={{ display:"flex", justifyContent:"flex-end", gap:ds.space[2], padding:`${ds.space[3]} ${ds.space[5]}`, borderTop:ds.border.thin, background:B2, borderRadius:`0 0 ${ds.radius.xl} ${ds.radius.xl}`, flexShrink:0 }}>{footer}</div>}
      </div>
    </div>
  );
}

// ─── Modal: criar/editar projeto ──────────────────────────
function ProjectModal({ initial, onClose, onSave }) {
  const isEdit = !!initial?.id;
  const [f, setF] = useState(initial || { name:"", description:"", status:"ativo" });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  return (
    <Modal title={isEdit ? "Editar Projeto" : "Novo Projeto"} onClose={onClose} width={460}
      footer={<>
        <DsButton variant="ghost" size="sm" onClick={onClose}>Cancelar</DsButton>
        <DsButton variant="primary" size="sm" onClick={()=>{
          if (!f.name?.trim()) return alert("Informe o nome do projeto.");
          onSave({ ...f, name:f.name.trim(), id:f.id || uid(), expenses:f.expenses || [] });
        }}>{isEdit ? "Salvar" : "Criar projeto"}</DsButton>
      </>}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <Field label="Nome do projeto">
          <input style={inputStyle} value={f.name} onChange={e=>set("name", e.target.value)} placeholder="ex: Viagem Copa 2026" autoFocus/>
        </Field>
        <Field label="Descrição (opcional)">
          <input style={inputStyle} value={f.description||""} onChange={e=>set("description", e.target.value)} placeholder="ex: Cobertura in loco, 40+ dias, gastos em dólar"/>
        </Field>
        <Field label="Status">
          <select style={{ ...inputStyle, height:40 }} value={f.status||"ativo"} onChange={e=>set("status", e.target.value)}>
            <option value="ativo">Ativo</option>
            <option value="encerrado">Encerrado</option>
          </select>
        </Field>
      </div>
    </Modal>
  );
}

// ─── Modal: criar/editar gasto ────────────────────────────
const EXPENSE_CATEGORIES = ["Passagem Aérea","Hospedagem","Alimentação","Transporte / Estacionamento","Uber / Táxi / App","Combustível","Produção de Conteúdo","Equipamento","Software / SaaS","Ingressos / Credenciais","Internet / Chip","Viagem / Outros","Outros"];

function ExpenseModal({ initial, onClose, onSave }) {
  const isEdit = !!initial?.id;
  const cachedRate = readCache()?.USD || null;
  const [f, setF] = useState(initial || {
    date: todayIso(), description:"", category:"", currency:"BRL",
    amount:"", fxRate: cachedRate ? Number(Number(cachedRate).toFixed(4)) : "",
    paidBy:"Empresa", reimbursed:false, reimbursedAt:null, notes:"",
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));
  const [fetchingRate, setFetchingRate] = useState(false);

  const brlPreview = expenseBRL({ ...f, amount:Number(f.amount)||0, fxRate:Number(f.fxRate)||0 });

  const suggestRate = async () => {
    setFetchingRate(true);
    try {
      const r = await fetchRates();
      if (r?.USD) set("fxRate", Number(Number(r.USD).toFixed(4)));
    } catch { /* mantém valor atual */ }
    setFetchingRate(false);
  };

  return (
    <Modal title={isEdit ? "Editar Gasto" : "Novo Gasto"} onClose={onClose} width={560}
      footer={<>
        <DsButton variant="ghost" size="sm" onClick={onClose}>Cancelar</DsButton>
        <DsButton variant="primary" size="sm" onClick={()=>{
          if (!f.description?.trim()) return alert("Informe a descrição.");
          if (!(Number(f.amount) > 0)) return alert("Informe um valor válido.");
          if (f.currency === "USD" && !(Number(f.fxRate) > 0)) return alert("Informe a cotação R$/US$.");
          onSave({
            ...f,
            id: f.id || uid(),
            description: f.description.trim(),
            amount: Number(f.amount),
            fxRate: f.currency === "USD" ? Number(f.fxRate) : null,
          });
        }}>Salvar</DsButton>
      </>}>
      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
          <Field label="Data"><input type="date" style={inputStyle} value={f.date} onChange={e=>set("date", e.target.value)}/></Field>
          <Field label="Categoria">
            <select style={{ ...inputStyle, height:40 }} value={f.category} onChange={e=>set("category", e.target.value)}>
              <option value="">Sem categoria</option>
              {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Descrição">
          <input style={inputStyle} value={f.description} onChange={e=>set("description", e.target.value)} placeholder="ex: Hotel em Dallas — 5 diárias" autoFocus={!isEdit}/>
        </Field>

        {/* Moeda + valor */}
        <div style={{ display:"grid", gridTemplateColumns:"auto 1fr 1fr", gap:12, alignItems:"end" }}>
          <Field label="Moeda">
            <div style={{ display:"flex", border:`1px solid ${LN}`, borderRadius:6, overflow:"hidden" }}>
              {["BRL","USD"].map(c => (
                <button key={c} onClick={()=>set("currency", c)}
                  style={{ padding:"9px 14px", fontSize:12, fontWeight:700, cursor:"pointer", border:"none", fontFamily:"inherit",
                    background:f.currency===c ? (c==="USD"?BLU:TX) : "none", color:f.currency===c ? "#fff" : TX2, transition:TRANS }}>
                  {c === "BRL" ? "R$" : "US$"}
                </button>
              ))}
            </div>
          </Field>
          <Field label={`Valor (${f.currency === "USD" ? "US$" : "R$"})`}>
            <input type="number" min="0" step="0.01" style={inputStyle} value={f.amount} onChange={e=>set("amount", e.target.value)} placeholder="0,00"/>
          </Field>
          {f.currency === "USD" && (
            <Field label="Cotação (R$/US$)">
              <div style={{ display:"flex", gap:6 }}>
                <input type="number" min="0" step="0.0001" style={inputStyle} value={f.fxRate} onChange={e=>set("fxRate", e.target.value)} placeholder="ex: 5,45"/>
                <button onClick={suggestRate} disabled={fetchingRate} title="Buscar cotação do dia"
                  style={{ padding:"0 10px", fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:6, background:`${BLU}10`, border:`1px solid ${BLU}30`, color:BLU, fontFamily:"inherit", whiteSpace:"nowrap" }}>
                  {fetchingRate ? "..." : "Hoje"}
                </button>
              </div>
            </Field>
          )}
        </div>
        {f.currency === "USD" && brlPreview > 0 && (
          <div style={{ padding:"8px 12px", background:`${BLU}08`, border:`1px solid ${BLU}20`, borderRadius:8, fontSize:12, color:TX2 }}>
            = <strong style={{ color:TX }}>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(brlPreview)}</strong> pela cotação informada
            <span style={{ color:TX3 }}> · dica: use a cotação da fatura do cartão quando ela fechar</span>
          </div>
        )}

        {/* Quem pagou */}
        <Field label="Pago por">
          <div style={{ display:"flex", gap:6 }}>
            {PROJECT_PAYERS.map(p => (
              <button key={p} onClick={()=>set("paidBy", p)}
                style={{ padding:"7px 14px", fontSize:12, fontWeight:f.paidBy===p?700:400, cursor:"pointer", borderRadius:99, fontFamily:"inherit",
                  border:`1.5px solid ${f.paidBy===p ? (p==="Empresa"?TX:AMB) : LN}`,
                  background:f.paidBy===p ? (p==="Empresa"?TX:AMB) : "none",
                  color:f.paidBy===p ? "#fff" : TX2, transition:TRANS }}>
                {p}
              </button>
            ))}
          </div>
          {f.paidBy !== "Empresa" && (
            <div style={{ fontSize:11, color:AMB, marginTop:4 }}>
              ↩ Gasto no cartão pessoal — entra no painel de reembolsos e só sai do caixa da empresa quando o reembolso for pago.
            </div>
          )}
        </Field>

        <Field label="Notas (opcional)">
          <input style={inputStyle} value={f.notes||""} onChange={e=>set("notes", e.target.value)} placeholder="Informações adicionais"/>
        </Field>
      </div>
    </Modal>
  );
}

// ─── Modal: pagar reembolso ───────────────────────────────
function SettleModal({ project, person, totalBRL, count, onClose, onConfirm }) {
  const [date, setDate] = useState(todayIso());
  return (
    <Modal title="Registrar Reembolso" onClose={onClose} width={420}
      footer={<>
        <DsButton variant="ghost" size="sm" onClick={onClose}>Cancelar</DsButton>
        <DsButton variant="primary" size="sm" onClick={()=>onConfirm(date)}>Confirmar pagamento</DsButton>
      </>}>
      <div style={{ fontSize:13, color:TX, lineHeight:1.6, marginBottom:14 }}>
        Marcar <strong>{count} gasto{count>1?"s":""}</strong> de <strong>{person}</strong> no projeto <strong>{project.name}</strong> como reembolsado{count>1?"s":""}, no total de <strong style={{ color:RED }}>{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(totalBRL)}</strong>.
      </div>
      <div style={{ fontSize:11, color:TX2, background:B2, border:`1px solid ${LN}`, borderRadius:8, padding:"8px 12px", marginBottom:14 }}>
        Será criada uma saída no caixa (categoria "Reembolso de Projeto") na data escolhida — é ela que representa o dinheiro saindo da empresa.
      </div>
      <Field label="Data do pagamento">
        <input type="date" style={inputStyle} value={date} onChange={e=>setDate(e.target.value)}/>
      </Field>
    </Modal>
  );
}

// ─── Detalhe do projeto ───────────────────────────────────
// ─── Dash de análise do projeto ───────────────────────────
function ProjectAnalytics({ project, hid }) {
  const cats   = useMemo(() => categoryBreakdown(project), [project]);
  const months = useMemo(() => monthlySpend(project), [project]);
  if (!cats.length) return null;

  const maxCat   = cats[0]?.totalBRL || 1;
  const maxMonth = Math.max(...months.map(m => m.totalBRL), 1);
  // Mesma paleta do card "Saídas por Categoria" do Caixa: saturação ∝ valor
  const barColor = (v) => `hsl(355,${Math.round(30 + (v / maxCat) * 45)}%,45%)`;

  return (
    <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))", gap:10, marginBottom:16 }}>
      {/* Por categoria */}
      <div style={{ ...G, padding:"16px 20px" }}>
        <div style={{ fontSize:12, fontWeight:700, color:TX, marginBottom:12 }}>Gastos por Categoria</div>
        {cats.map(c => (
          <div key={c.category} style={{ marginBottom:10 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"baseline", fontSize:12, marginBottom:4, gap:8 }}>
              <span style={{ color:TX, minWidth:0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                {c.category} <span style={{ color:TX3, fontSize:ds.font.size.xs }}>({c.count})</span>
              </span>
              <span style={{ flexShrink:0 }}>
                <strong style={{ color:TX }}>{hid(fmtBRL(c.totalBRL))}</strong>
                <span style={{ color:TX3, fontSize:ds.font.size.xs, marginLeft:6 }}>{c.pct}%</span>
              </span>
            </div>
            <div style={{ height:5, background:LN, borderRadius:3, overflow:"hidden" }}>
              <div title={`${c.pct}% do total do projeto${c.totalUSD>0?` · inclui ${fmtUSD(c.totalUSD)}`:""}`}
                style={{ height:5, borderRadius:3, background:barColor(c.totalBRL), width:`${(c.totalBRL/maxCat)*100}%`, transition:"width .3s" }}/>
            </div>
          </div>
        ))}
      </div>

      {/* Por mês */}
      {months.length > 0 && (
        <div style={{ ...G, padding:"16px 20px", display:"flex", flexDirection:"column" }}>
          <div style={{ fontSize:12, fontWeight:700, color:TX, marginBottom:12 }}>Gasto por Mês</div>
          <div style={{ display:"flex", alignItems:"flex-end", gap:10, flex:1, minHeight:120, paddingTop:18 }}>
            {months.map(m => (
              <div key={m.ym} title={`${m.label} · ${fmtBRL(m.totalBRL)} · ${m.count} gasto${m.count>1?"s":""}`}
                style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, minWidth:34, maxWidth:88 }}>
                <span style={{ fontSize:ds.font.size.xs, fontWeight:700, color:TX2, whiteSpace:"nowrap" }}>{hid(fmtBRL(m.totalBRL))}</span>
                <div style={{ width:"100%", height:96, display:"flex", alignItems:"flex-end" }}>
                  <div style={{ width:"100%", height:`${Math.max(6,(m.totalBRL/maxMonth)*100)}%`, background:`linear-gradient(180deg, ${RED}CC, ${RED})`, borderRadius:"6px 6px 2px 2px", transition:"height .3s" }}/>
                </div>
                <span style={{ fontSize:ds.font.size.xs, color:TX3 }}>{m.label}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:10 }}>
            Média: <strong style={{ color:TX2 }}>{hid(fmtBRL(Math.round(months.reduce((s,m)=>s+m.totalBRL,0)/months.length)))}</strong>/mês
            {months.length>1 && <> · {months.length} meses</>}
          </div>
        </div>
      )}
    </div>
  );
}

function ProjectDetail({ project, onBack, onUpdate, onDelete, onCreateReimbursementTx, valuesHidden, toast }) {
  const [expModal, setExpModal] = useState(null);   // null | {} | expense
  const [editProj, setEditProj] = useState(false);
  const [settle, setSettle] = useState(null);       // null | {person, totalBRL, count}
  const hid = (v) => valuesHidden ? "••••••" : v;

  const totals  = useMemo(() => projectTotals(project), [project]);
  const reimb   = useMemo(() => reimbursementSummary(project), [project]);
  const expenses = useMemo(
    () => [...(project.expenses||[])].sort((a,b) => (b.date||"").localeCompare(a.date||"")),
    [project.expenses]
  );

  const saveExpense = (exp) => {
    const list = project.expenses || [];
    const exists = list.some(e => e.id === exp.id);
    onUpdate({ ...project, expenses: exists ? list.map(e => e.id===exp.id ? exp : e) : [...list, exp] });
    setExpModal(null);
    toast?.(exists ? "Gasto atualizado" : "Gasto adicionado", "success");
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16, flexWrap:"wrap" }}>
        <button onClick={onBack} style={{ background:"none", border:`1px solid ${LN}`, borderRadius:6, width:32, height:32, cursor:"pointer", color:TX2, fontSize:16 }}>‹</button>
        <div style={{ flex:1, minWidth:200 }}>
          <div style={{ display:"flex", alignItems:"center", gap:8 }}>
            <span style={{ fontSize:16, fontWeight:700, color:TX }}>{project.name}</span>
            <span style={{ fontSize:ds.font.size.xs, padding:"2px 8px", borderRadius:99, fontWeight:700,
              background: project.status==="encerrado" ? `${TX3}18` : `${GRN}14`,
              color: project.status==="encerrado" ? TX3 : GRN }}>
              {project.status==="encerrado" ? "Encerrado" : "Ativo"}
            </span>
          </div>
          {project.description && <div style={{ fontSize:11, color:TX2, marginTop:2 }}>{project.description}</div>}
        </div>
        <DsButton variant="secondary" size="sm" onClick={()=>setEditProj(true)}>Editar</DsButton>
        <DsButton variant="primary" size="sm" onClick={()=>setExpModal({})} leftIcon={<DsIcon name="plus" size={13} color={ds.color.neutral[0]}/>}>Gasto</DsButton>
      </div>

      {/* Totais */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(170px,1fr))", gap:10, marginBottom:16 }}>
        <div style={{ ...G, padding:"14px 16px", borderLeft:`3px solid ${RED}` }}>
          <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX2, marginBottom:4 }}>Custo Total</div>
          <div style={{ fontFamily:ds.font.display, letterSpacing:"-0.02em", fontSize:20, fontWeight:800, color:RED }}>{hid(fmtBRL(totals.totalBRL))}</div>
          {totals.totalUSD > 0 && <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:2 }}>{hid(fmtUSD(totals.totalUSD))} em gastos USD</div>}
        </div>
        <div style={{ ...G, padding:"14px 16px", borderLeft:`3px solid ${TX}` }}>
          <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX2, marginBottom:4 }}>Pago pela Empresa</div>
          <div style={{ fontFamily:ds.font.display, letterSpacing:"-0.02em", fontSize:20, fontWeight:800, color:TX }}>{hid(fmtBRL(totals.companyBRL))}</div>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:2 }}>entra no caixa como linha agregada</div>
        </div>
        <div style={{ ...G, padding:"14px 16px", borderLeft:`3px solid ${AMB}` }}>
          <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX2, marginBottom:4 }}>Reembolso Pendente</div>
          <div style={{ fontFamily:ds.font.display, letterSpacing:"-0.02em", fontSize:20, fontWeight:800, color:totals.pendingBRL>0?AMB:TX3 }}>{hid(fmtBRL(totals.pendingBRL))}</div>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:2 }}>pago em cartão pessoal</div>
        </div>
        <div style={{ ...G, padding:"14px 16px", borderLeft:`3px solid ${GRN}` }}>
          <div style={{ fontSize:ds.font.size.xs, fontWeight:700, letterSpacing:".1em", textTransform:"uppercase", color:TX2, marginBottom:4 }}>Reembolsado</div>
          <div style={{ fontFamily:ds.font.display, letterSpacing:"-0.02em", fontSize:20, fontWeight:800, color:totals.reimbursedBRL>0?GRN:TX3 }}>{hid(fmtBRL(totals.reimbursedBRL))}</div>
          <div style={{ fontSize:ds.font.size.xs, color:TX3, marginTop:2 }}>{totals.count} gasto{totals.count!==1?"s":""} no projeto</div>
        </div>
      </div>

      {/* Painel de reembolsos por pessoa */}
      {reimb.length > 0 && (
        <div style={{ ...G, padding:"16px 20px", marginBottom:16, borderLeft:`3px solid ${AMB}` }}>
          <div style={{ fontSize:12, fontWeight:700, color:TX, marginBottom:10 }}>Reembolsos por Pessoa</div>
          {reimb.map(r => (
            <div key={r.person} style={{ display:"flex", alignItems:"center", gap:12, padding:"10px 0", borderBottom:`1px solid ${LN}` }}>
              <div style={{ width:32, height:32, borderRadius:"50%", background:`${AMB}14`, border:`2px solid ${AMB}30`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:AMB, flexShrink:0 }}>
                {r.person[0]}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:13, color:TX }}>{r.person}</div>
                <div style={{ fontSize:11, color:TX2 }}>
                  {r.pendingBRL > 0
                    ? <>Pendente: <strong style={{ color:AMB }}>{hid(fmtBRL(r.pendingBRL))}</strong> ({r.pendingCount} gasto{r.pendingCount>1?"s":""})</>
                    : <span style={{ color:GRN }}>✓ Tudo reembolsado</span>}
                  {r.reimbursedBRL > 0 && <> · Já pago: <span style={{ color:GRN }}>{hid(fmtBRL(r.reimbursedBRL))}</span></>}
                </div>
              </div>
              {r.pendingBRL > 0 && (
                <button onClick={()=>setSettle({ person:r.person, totalBRL:r.pendingBRL, count:r.pendingCount })}
                  style={{ padding:"6px 12px", fontSize:11, fontWeight:700, cursor:"pointer", borderRadius:6, background:`${GRN}10`, border:`1px solid ${GRN}40`, color:GRN, fontFamily:"inherit", whiteSpace:"nowrap" }}>
                  ✓ Registrar reembolso
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Análise: categorias + evolução mensal */}
      {expenses.length > 0 && <ProjectAnalytics project={project} hid={hid}/>}

      {/* Lista de gastos */}
      {expenses.length === 0 ? (
        <div style={{ textAlign:"center", padding:"48px 0", color:TX3 }}>
          Nenhum gasto neste projeto.
          <br/><DsButton variant="primary" size="sm" style={{ marginTop:12 }} onClick={()=>setExpModal({})}>+ Adicionar gasto</DsButton>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
          {expenses.map(e => {
            const brl = expenseBRL(e);
            const personal = e.paidBy && e.paidBy !== "Empresa";
            return (
              <div key={e.id} style={{ ...G, padding:"12px 16px", display:"flex", alignItems:"center", gap:14 }}>
                <div style={{ width:36, height:36, borderRadius:ds.radius.md, background:e.currency==="USD"?`${BLU}12`:`${RED}10`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, fontSize:11, fontWeight:800, color:e.currency==="USD"?BLU:RED }}>
                  {e.currency==="USD" ? "US$" : "R$"}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13, color:TX, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{e.description}</div>
                  <div style={{ fontSize:11, color:TX2, display:"flex", gap:8, marginTop:2, flexWrap:"wrap" }}>
                    <span>{fmtDate(e.date)}</span>
                    {e.category && <span>· {e.category}</span>}
                    {e.currency==="USD" && <span style={{ color:BLU }}>· {hid(fmtUSD(e.amount))} × {Number(e.fxRate).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:4})}</span>}
                    {personal && (
                      e.reimbursed
                        ? <span style={{ color:GRN, fontWeight:700, fontSize:ds.font.size.xs, padding:"1px 8px", borderRadius:99, background:`${GRN}12`, border:`1px solid ${GRN}30` }} title={e.reimbursedAt?`Reembolsado em ${fmtDate(e.reimbursedAt)}`:"Reembolsado"}>✓ {e.paidBy} reembolsado</span>
                        : <span style={{ color:AMB, fontWeight:700, fontSize:ds.font.size.xs, padding:"1px 8px", borderRadius:99, background:`${AMB}12`, border:`1px solid ${AMB}30` }}>↩ Reembolsar {e.paidBy}</span>
                    )}
                    {e.notes && <span style={{ color:TX3 }}>· {e.notes}</span>}
                  </div>
                </div>
                <div style={{ textAlign:"right", flexShrink:0 }}>
                  <div style={{ fontSize:15, fontWeight:700, color:RED }}>−{hid(fmtBRL(brl))}</div>
                </div>
                <div style={{ display:"flex", gap:4, flexShrink:0 }}>
                  <DsIconButton size="sm" variant="ghost" ariaLabel="Editar gasto" onClick={()=>setExpModal(e)}
                    icon={<DsIcon name="edit" size={13} color={ds.color.neutral[500]}/>}/>
                  <DsIconButton size="sm" variant="ghost" ariaLabel="Excluir gasto" onClick={()=>{
                    if (confirm("Excluir este gasto?")) onUpdate({ ...project, expenses:(project.expenses||[]).filter(x=>x.id!==e.id) });
                  }} icon={<DsIcon name="x" size={13} color={ds.color.danger[500]}/>}/>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Danger zone */}
      <div style={{ marginTop:24, display:"flex", justifyContent:"flex-end" }}>
        <button onClick={()=>{
          if (confirm(`Excluir o projeto "${project.name}" e todos os seus ${totals.count} gastos? A linha agregada sai do caixa (saídas de reembolso já criadas permanecem).`)) onDelete(project.id);
        }} style={{ background:"none", border:"none", color:TX3, fontSize:11, cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}>
          Excluir projeto
        </button>
      </div>

      {expModal !== null && (
        <ExpenseModal initial={expModal.id ? expModal : null} onClose={()=>setExpModal(null)} onSave={saveExpense}/>
      )}
      {editProj && (
        <ProjectModal initial={project} onClose={()=>setEditProj(false)} onSave={(p)=>{ onUpdate(p); setEditProj(false); }}/>
      )}
      {settle && (
        <SettleModal project={project} person={settle.person} totalBRL={settle.totalBRL} count={settle.count}
          onClose={()=>setSettle(null)}
          onConfirm={(date)=>{ onCreateReimbursementTx(project, settle.person, date); setSettle(null); }}/>
      )}
    </div>
  );
}

// ─── Lista de projetos ────────────────────────────────────
export default function ProjectsTab({ projects, onSaveProject, onDeleteProject, onCreateReimbursementTx, selectedId, onSelect, valuesHidden, toast }) {
  const [newProj, setNewProj] = useState(false);
  const hid = (v) => valuesHidden ? "••••••" : v;

  const selected = projects.find(p => p.id === selectedId) || null;
  if (selected) {
    return (
      <ProjectDetail project={selected}
        onBack={()=>onSelect(null)}
        onUpdate={onSaveProject}
        onDelete={(id)=>{ onDeleteProject(id); onSelect(null); }}
        onCreateReimbursementTx={onCreateReimbursementTx}
        valuesHidden={valuesHidden} toast={toast}/>
    );
  }

  const sorted = [...projects].sort((a, b) => {
    if ((a.status==="encerrado") !== (b.status==="encerrado")) return a.status==="encerrado" ? 1 : -1;
    return (b.updatedAt||"").localeCompare(a.updatedAt||"");
  });

  return (
    <div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, marginBottom:16, flexWrap:"wrap" }}>
        <div>
          <div style={{ fontSize:14, fontWeight:700, color:TX }}>Centros de Custo</div>
          <div style={{ fontSize:11, color:TX2, marginTop:2 }}>
            Agrupe gastos de viagens e projetos grandes. No fluxo de caixa entra apenas 1 linha agregada por projeto/mês.
          </div>
        </div>
        <DsButton variant="primary" size="sm" onClick={()=>setNewProj(true)} leftIcon={<DsIcon name="plus" size={13} color={ds.color.neutral[0]}/>}>Novo projeto</DsButton>
      </div>

      {sorted.length === 0 ? (
        <div style={{ textAlign:"center", padding:"56px 0", color:TX3 }}>
          <div style={{ fontSize:28, marginBottom:10 }}>🗂</div>
          <div style={{ fontSize:13, fontWeight:600, color:TX2, marginBottom:6 }}>Nenhum projeto ainda</div>
          <div style={{ fontSize:12, maxWidth:380, margin:"0 auto 16px" }}>
            Crie um centro de custo como "Viagem Copa 2026" e registre os gastos (em R$ ou US$) dentro dele — sem poluir a lista de lançamentos.
          </div>
          <DsButton variant="primary" size="sm" onClick={()=>setNewProj(true)}>+ Criar primeiro projeto</DsButton>
        </div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:12 }}>
          {sorted.map(p => {
            const t = projectTotals(p);
            const closed = p.status === "encerrado";
            return (
              <div key={p.id} onClick={()=>onSelect(p.id)}
                style={{ ...G, padding:"16px 18px", cursor:"pointer", opacity:closed?0.65:1, transition:TRANS }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow=ds.shadow.md||"0 4px 12px rgba(0,0,0,.08)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow=G.boxShadow}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:8, marginBottom:8 }}>
                  <div style={{ fontWeight:700, fontSize:14, color:TX }}>{p.name}</div>
                  <span style={{ fontSize:ds.font.size.xs, padding:"2px 8px", borderRadius:99, fontWeight:700, flexShrink:0,
                    background: closed ? `${TX3}18` : `${GRN}14`, color: closed ? TX3 : GRN }}>
                    {closed ? "Encerrado" : "Ativo"}
                  </span>
                </div>
                {p.description && <div style={{ fontSize:11, color:TX2, marginBottom:10, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.description}</div>}
                <div style={{ fontFamily:ds.font.display, letterSpacing:"-0.02em", fontSize:20, fontWeight:800, color:RED, marginBottom:2 }}>{hid(fmtBRL(t.totalBRL))}</div>
                <div style={{ fontSize:11, color:TX3 }}>
                  {t.count} gasto{t.count!==1?"s":""}
                  {t.totalUSD > 0 && <> · {hid(fmtUSD(t.totalUSD))} em USD</>}
                </div>
                {t.pendingBRL > 0 && (
                  <div style={{ marginTop:10, display:"inline-flex", alignItems:"center", gap:6, padding:"3px 10px", borderRadius:99, background:`${AMB}12`, border:`1px solid ${AMB}30`, fontSize:11, fontWeight:700, color:AMB }}>
                    ↩ {hid(fmtBRL(t.pendingBRL))} a reembolsar
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {newProj && (
        <ProjectModal onClose={()=>setNewProj(false)} onSave={(p)=>{ onSaveProject(p); setNewProj(false); onSelect(p.id); }}/>
      )}
    </div>
  );
}
