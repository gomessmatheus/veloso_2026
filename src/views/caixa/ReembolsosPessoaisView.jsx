/**
 * src/views/caixa/ReembolsosPessoaisView.jsx
 *
 * Controle de gastos pessoais reembolsáveis.
 *
 * Mecanismo:
 *   1. Cada gasto pago no cartão pessoal vira um registro com status
 *      'pendente' ou 'reembolsado'.
 *   2. Ao cadastrar, o sistema detecta possíveis duplicatas comparando
 *      (data ± 3 dias, valor exato, fornecedor normalizado).
 *   3. Para reembolsar, o usuário seleciona N gastos pendentes e o sistema
 *      cria uma transação no caixa (entrada / categoria "Reembolso") cujo
 *      valor bate com a soma dos selecionados. Cada gasto recebe a
 *      referência da transação (txId) e muda para 'reembolsado'.
 *   4. Trava: itens já 'reembolsado' não aparecem na seleção.
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { theme as ds, Button as DsButton, Icon as DsIcon, Input as DsInput, Card as DsCard, Modal as DsModal, Select as DsSelect } from "../../ui/index.js";
import {
  loadReembolsos, subscribeReembolsos, syncReembolsos, deleteReembolso,
} from "../../db.js";

const TX  = ds.color.neutral[900];
const TX2 = ds.color.neutral[600];
const TX3 = ds.color.neutral[400];
const LN  = ds.color.neutral[200];
const B1  = ds.color.neutral[0];
const RED = ds.color.brand[500];
const GRN = ds.color.success[500];
const WARN = ds.color.warning[500];

const CATEGORIAS = [
  "Alimentação", "Transporte", "Passagem Aérea", "Hospedagem",
  "Equipamento", "Software / SaaS", "Material de Escritório",
  "Marketing", "Produção de Conteúdo", "Outros",
];

// ─── Helpers ────────────────────────────────────────────────
function fmtMoney(v, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(v || 0);
}

function uid() {
  try { return crypto.randomUUID(); } catch { return "r_" + Math.random().toString(36).slice(2, 12) + Date.now().toString(36); }
}

function normalizeFornecedor(s) {
  return (s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function hashGasto(g) {
  // Hash leve: (valor em centavos)::fornecedor normalizado
  // (data fica para janela ± 3 dias na detecção)
  const cents = Math.round(Number(g.valor || 0) * 100);
  return cents + "::" + normalizeFornecedor(g.fornecedor);
}

function diasEntre(a, b) {
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  return Math.abs(da - db) / 86400000;
}

function isDuplicata(novo, lista) {
  return lista.find(g =>
    g.id !== novo.id &&
    hashGasto(g) === hashGasto(novo) &&
    diasEntre(g.data, novo.data) <= 3
  );
}

function diasDesde(data) {
  return Math.floor((Date.now() - new Date(data).getTime()) / 86400000);
}

// ─── Modal de novo gasto / edição ──────────────────────────
function GastoModal({ initial, onClose, onSave, lista }) {
  const isEdit = !!(initial && initial.id);
  const [f, setF] = useState(initial || {
    data: new Date().toISOString().slice(0, 10),
    descricao: "",
    valor: "",
    categoria: "",
    fornecedor: "",
    notas: "",
  });
  const set = (k, v) => setF(x => ({ ...x, [k]: v }));

  const dup = useMemo(() => {
    if (!f.valor || !f.fornecedor) return null;
    return isDuplicata({ ...f, id: initial?.id }, lista);
  }, [f, lista, initial]);

  const valid = f.data && f.descricao.trim() && Number(f.valor) > 0;

  function submit() {
    if (!valid) return;
    const now = new Date().toISOString();
    const payload = {
      id: initial?.id || uid(),
      data: f.data,
      descricao: f.descricao.trim(),
      valor: Number(f.valor),
      categoria: f.categoria || "Outros",
      fornecedor: f.fornecedor.trim(),
      notas: f.notas.trim(),
      status: initial?.status || "pendente",
      txId: initial?.txId || null,
      createdAt: initial?.createdAt || now,
      updatedAt: now,
    };
    onSave(payload);
  }

  const footer = (
    <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
      <DsButton variant="ghost" onClick={onClose}>Cancelar</DsButton>
      <DsButton variant="primary" onClick={submit} disabled={!valid}>{isEdit ? "Salvar alterações" : "Cadastrar gasto"}</DsButton>
    </div>
  );

  return (
    <DsModal title={isEdit ? "Editar gasto pessoal" : "Novo gasto pessoal"} onClose={onClose} footer={footer} width={560}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TX2, textTransform: "uppercase", letterSpacing: ".06em" }}>Data</label>
            <DsInput type="date" value={f.data} onChange={e => set("data", e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TX2, textTransform: "uppercase", letterSpacing: ".06em" }}>Valor (R$)</label>
            <DsInput type="number" step="0.01" value={f.valor} onChange={e => set("valor", e.target.value)} placeholder="0,00" />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: TX2, textTransform: "uppercase", letterSpacing: ".06em" }}>Descrição</label>
          <DsInput value={f.descricao} onChange={e => set("descricao", e.target.value)} placeholder="Ex: Uber para reunião com cliente" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TX2, textTransform: "uppercase", letterSpacing: ".06em" }}>Fornecedor</label>
            <DsInput value={f.fornecedor} onChange={e => set("fornecedor", e.target.value)} placeholder="Ex: Uber, iFood, Amazon" />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: TX2, textTransform: "uppercase", letterSpacing: ".06em" }}>Categoria</label>
            <DsSelect value={f.categoria} onChange={e => set("categoria", e.target.value)}>
              <option value="">Selecione...</option>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </DsSelect>
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: TX2, textTransform: "uppercase", letterSpacing: ".06em" }}>Notas (opcional)</label>
          <DsInput value={f.notas} onChange={e => set("notas", e.target.value)} placeholder="Observações" />
        </div>

        {dup && (
          <div style={{ padding: "10px 12px", background: WARN + "15", border: `1px solid ${WARN}`, borderRadius: 8, fontSize: 12, color: TX }}>
            <strong style={{ color: WARN }}>⚠ Possível duplicata</strong> — já existe um gasto de <strong>{fmtMoney(dup.valor)}</strong> com fornecedor <strong>"{dup.fornecedor}"</strong> em {new Date(dup.data).toLocaleDateString("pt-BR")}. Verifique antes de salvar.
          </div>
        )}
      </div>
    </DsModal>
  );
}

// ─── Componente principal ──────────────────────────────────
export default function ReembolsosPessoaisView({ transactions, saveTx, toast }) {
  const [reembolsos, setReembolsos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroStatus, setFiltroStatus] = useState("pendente");
  const [busca, setBusca] = useState("");
  const [selecionados, setSelecionados] = useState(new Set());
  const [modal, setModal] = useState(null);
  const [confirmReembolso, setConfirmReembolso] = useState(false);

  useEffect(() => {
    loadReembolsos().then(list => {
      setReembolsos(list);
      setLoading(false);
    });
    const unsub = subscribeReembolsos(list => {
      setReembolsos(list);
      setLoading(false);
    });
    return () => unsub && unsub();
  }, []);

  const persistir = useCallback(async (novaLista, changedIds) => {
    setReembolsos(novaLista);
    try {
      await syncReembolsos(novaLista, [], changedIds);
    } catch (e) {
      toast?.("Erro ao salvar no Firestore: " + e.message, "error");
    }
  }, [toast]);

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return reembolsos
      .filter(r => filtroStatus === "todos" || r.status === filtroStatus)
      .filter(r => !q || r.descricao.toLowerCase().includes(q) || (r.fornecedor || "").toLowerCase().includes(q) || (r.categoria || "").toLowerCase().includes(q))
      .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  }, [reembolsos, filtroStatus, busca]);

  const pendentes = useMemo(() => reembolsos.filter(r => r.status === "pendente"), [reembolsos]);
  const totalPendente = useMemo(() => pendentes.reduce((s, r) => s + Number(r.valor || 0), 0), [pendentes]);
  const maisAntigo = useMemo(() => {
    if (pendentes.length === 0) return null;
    const ordenado = [...pendentes].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
    return ordenado[0];
  }, [pendentes]);
  const diasMaisAntigo = maisAntigo ? diasDesde(maisAntigo.data) : 0;

  const toggleSel = (id) => {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selAll = () => {
    const ids = visiveis.filter(r => r.status === "pendente").map(r => r.id);
    setSelecionados(new Set(ids));
  };
  const selNone = () => setSelecionados(new Set());

  const totalSelecionado = useMemo(() => {
    return reembolsos.filter(r => selecionados.has(r.id)).reduce((s, r) => s + Number(r.valor || 0), 0);
  }, [reembolsos, selecionados]);

  function handleSave(payload) {
    const exists = reembolsos.find(r => r.id === payload.id);
    const nova = exists
      ? reembolsos.map(r => r.id === payload.id ? payload : r)
      : [...reembolsos, payload];
    persistir(nova, new Set([payload.id]));
    setModal(null);
    toast?.(exists ? "Gasto atualizado" : "Gasto cadastrado", "success");
  }

  function handleDelete(r) {
    if (r.status === "reembolsado") {
      toast?.("Não é possível excluir um gasto já reembolsado. Estorne primeiro.", "error");
      return;
    }
    if (!confirm(`Excluir gasto "${r.descricao}" de ${fmtMoney(r.valor)}?`)) return;
    deleteReembolso(r.id).then(() => {
      setReembolsos(prev => prev.filter(x => x.id !== r.id));
      toast?.("Gasto excluído", "success");
    }).catch(e => toast?.("Erro: " + e.message, "error"));
  }

  function executarReembolso() {
    const ids = Array.from(selecionados);
    const itens = reembolsos.filter(r => ids.includes(r.id) && r.status === "pendente");
    if (itens.length === 0) return;
    const total = itens.reduce((s, r) => s + Number(r.valor || 0), 0);
    const hoje = new Date().toISOString().slice(0, 10);

    const txId = uid();
    const novaTx = {
      id: txId,
      type: "entrada",
      date: hoje,
      description: `Reembolso pessoal — ${itens.length} ${itens.length === 1 ? "item" : "itens"}`,
      amount: total,
      category: "Reembolso",
      originId: "",
      destId: "",
      nfLink: "",
      contractId: "",
      notes: "Gerado automaticamente pelo controle de Reembolsos Pessoais. IDs: " + ids.join(", "),
      beneficiario: "",
      reembolsoIds: ids,
      updatedAt: new Date().toISOString(),
    };
    saveTx([...(transactions || []), novaTx]);

    const now = new Date().toISOString();
    const changedIds = new Set();
    const novaLista = reembolsos.map(r => {
      if (ids.includes(r.id)) {
        changedIds.add(r.id);
        return { ...r, status: "reembolsado", txId, dataReembolso: hoje, updatedAt: now };
      }
      return r;
    });
    persistir(novaLista, changedIds);
    setSelecionados(new Set());
    setConfirmReembolso(false);
    toast?.(`${itens.length} ${itens.length === 1 ? "gasto reembolsado" : "gastos reembolsados"} — ${fmtMoney(total)} lançado no caixa.`, "success");
  }

  function handleEstorno(r) {
    if (!confirm("Estornar este reembolso? O gasto volta para 'pendente'. A transação no caixa NÃO é apagada — remova manualmente se necessário.")) return;
    const now = new Date().toISOString();
    const nova = reembolsos.map(x => x.id === r.id ? { ...x, status: "pendente", txId: null, dataReembolso: null, updatedAt: now } : x);
    persistir(nova, new Set([r.id]));
    toast?.("Reembolso estornado. Revise a transação no caixa.", "warning");
  }

  return (
    <div>
      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginBottom: 18 }}>
        <DsCard>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: TX3, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>Pendente de reembolso</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: TX, marginTop: 6 }}>{fmtMoney(totalPendente)}</div>
            <div style={{ fontSize: 12, color: TX2, marginTop: 4 }}>{pendentes.length} {pendentes.length === 1 ? "gasto" : "gastos"}</div>
          </div>
        </DsCard>
        <DsCard>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: TX3, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>Gasto pendente mais antigo</div>
            {maisAntigo ? (
              <>
                <div style={{ fontSize: 24, fontWeight: 700, color: diasMaisAntigo > 30 ? WARN : TX, marginTop: 6 }}>{diasMaisAntigo} dias</div>
                <div style={{ fontSize: 12, color: TX2, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{maisAntigo.descricao}</div>
              </>
            ) : (
              <div style={{ fontSize: 14, color: TX2, marginTop: 6 }}>Tudo em dia ✓</div>
            )}
          </div>
        </DsCard>
        <DsCard>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: TX3, textTransform: "uppercase", letterSpacing: ".08em", fontWeight: 700 }}>Selecionados</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: selecionados.size > 0 ? GRN : TX, marginTop: 6 }}>{fmtMoney(totalSelecionado)}</div>
            <div style={{ fontSize: 12, color: TX2, marginTop: 4 }}>{selecionados.size} {selecionados.size === 1 ? "item" : "itens"}</div>
          </div>
        </DsCard>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <DsInput value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar descrição, fornecedor, categoria..." style={{ flex: 1, minWidth: 220 }} />
        <DsSelect value={filtroStatus} onChange={e => { setFiltroStatus(e.target.value); setSelecionados(new Set()); }}>
          <option value="pendente">Pendentes</option>
          <option value="reembolsado">Reembolsados</option>
          <option value="todos">Todos</option>
        </DsSelect>
        <DsButton variant="primary" onClick={() => setModal({})}>+ Novo gasto</DsButton>
      </div>

      {/* Barra de ação em massa */}
      {selecionados.size > 0 && (
        <div style={{ padding: "10px 14px", background: GRN + "10", border: `1px solid ${GRN}`, borderRadius: 8, marginBottom: 12, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 13, color: TX, flex: 1 }}>
            <strong>{selecionados.size}</strong> selecionados — total <strong>{fmtMoney(totalSelecionado)}</strong>
          </div>
          <DsButton variant="ghost" size="sm" onClick={selNone}>Limpar seleção</DsButton>
          <DsButton variant="primary" size="sm" onClick={() => setConfirmReembolso(true)}>Marcar como reembolsado</DsButton>
        </div>
      )}

      {filtroStatus === "pendente" && visiveis.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <button onClick={selecionados.size === visiveis.length ? selNone : selAll}
            style={{ background: "none", border: "none", color: TX2, fontSize: 12, cursor: "pointer", padding: 0, textDecoration: "underline" }}>
            {selecionados.size === visiveis.length ? "Desmarcar todos" : "Selecionar todos visíveis"}
          </button>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <div style={{ padding: 40, textAlign: "center", color: TX2 }}>Carregando...</div>
      ) : visiveis.length === 0 ? (
        <div style={{ padding: 40, textAlign: "center", color: TX2, border: `1px dashed ${LN}`, borderRadius: 8 }}>
          {filtroStatus === "pendente" ? "Nenhum gasto pendente de reembolso. 🎉" : "Nenhum gasto encontrado."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {visiveis.map(r => {
            const sel = selecionados.has(r.id);
            const dias = diasDesde(r.data);
            const atrasado = r.status === "pendente" && dias > 30;
            return (
              <div key={r.id}
                style={{
                  display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 14px", background: sel ? GRN + "08" : B1,
                  border: `1px solid ${sel ? GRN : LN}`, borderRadius: 8,
                }}>
                {r.status === "pendente" && (
                  <input type="checkbox" checked={sel} onChange={() => toggleSel(r.id)}
                    style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0 }} />
                )}
                {r.status === "reembolsado" && (
                  <div style={{ width: 16, flexShrink: 0, display: "flex", justifyContent: "center" }}>
                    <DsIcon name="checkCircle" size={16} color={GRN} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: TX, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.descricao}
                  </div>
                  <div style={{ fontSize: 11, color: TX2, marginTop: 2 }}>
                    {new Date(r.data).toLocaleDateString("pt-BR")} · {r.categoria || "Outros"}
                    {r.fornecedor ? ` · ${r.fornecedor}` : ""}
                    {atrasado && <span style={{ color: WARN, fontWeight: 600 }}> · {dias}d sem reembolso</span>}
                    {r.status === "reembolsado" && r.dataReembolso && (
                      <span style={{ color: GRN, fontWeight: 600 }}> · reembolsado em {new Date(r.dataReembolso).toLocaleDateString("pt-BR")}</span>
                    )}
                  </div>
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: TX, flexShrink: 0 }}>{fmtMoney(r.valor)}</div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => setModal(r)} title="Editar"
                    style={{ background: "none", border: `1px solid ${LN}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: TX2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <DsIcon name="edit" size={12} color={TX2} />
                  </button>
                  {r.status === "pendente" ? (
                    <button onClick={() => handleDelete(r)} title="Excluir"
                      style={{ background: "none", border: `1px solid ${LN}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: RED, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <DsIcon name="trash" size={12} color={RED} />
                    </button>
                  ) : (
                    <button onClick={() => handleEstorno(r)} title="Estornar reembolso"
                      style={{ background: "none", border: `1px solid ${LN}`, borderRadius: 6, width: 28, height: 28, cursor: "pointer", color: WARN, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <DsIcon name="refresh" size={12} color={WARN} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && (
        <GastoModal
          initial={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
          lista={reembolsos}
        />
      )}

      {confirmReembolso && (
        <DsModal title="Confirmar reembolso" onClose={() => setConfirmReembolso(false)} width={480}
          footer={
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <DsButton variant="ghost" onClick={() => setConfirmReembolso(false)}>Cancelar</DsButton>
              <DsButton variant="primary" onClick={executarReembolso}>Confirmar reembolso</DsButton>
            </div>
          }>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ fontSize: 13, color: TX, margin: 0 }}>
              Isso vai marcar <strong>{selecionados.size} {selecionados.size === 1 ? "gasto" : "gastos"}</strong> como reembolsado(s) e criar uma <strong>entrada no caixa</strong> de <strong>{fmtMoney(totalSelecionado)}</strong> (categoria: Reembolso).
            </p>
            <p style={{ fontSize: 12, color: TX2, margin: 0 }}>
              Esses gastos saem da lista de pendentes. Você pode estornar individualmente se precisar.
            </p>
          </div>
        </DsModal>
      )}
    </div>
  );
}
