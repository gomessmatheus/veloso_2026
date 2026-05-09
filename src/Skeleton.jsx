import { FileText, Package, Video, BarChart2, Inbox } from "lucide-react";
import { B1, B2, B3, LN, TX, TX2, TX3, G } from "../constants/tokens.js";

// ─── Skeleton block ───────────────────────────────────────
export function Skeleton({ w = "100%", h = 16, r = 6, style: st }) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: r, ...st }}
    />
  );
}

// ─── App-level loading screen ─────────────────────────────
export function AppLoadingScreen() {
  return (
    <div style={{
      minHeight: "100vh", background: "#F7F6EF",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", gap: 16,
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".2em", textTransform: "uppercase", color: "#000" }}>
        ENTRE<span style={{ color: "#C8102E" }}>GAS</span>
      </div>
      {/* Pulsing dots */}
      <div style={{ display: "flex", gap: 6 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            width: 6, height: 6, borderRadius: "50%", background: "#C8102E",
            animation: `skeletonPulse 1.2s ${i * 0.2}s ease-in-out infinite`,
          }} />
        ))}
      </div>
      <style>{`
        @keyframes skeletonPulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ─── Dashboard skeleton ───────────────────────────────────
export function DashboardSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      {/* Greeting */}
      <Skeleton w={240} h={28} r={8} style={{ marginBottom: 8 }} />
      <Skeleton w={180} h={14} r={6} style={{ marginBottom: 28 }} />

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...G, padding: "18px 20px" }}>
            <Skeleton w={80}  h={10} r={4} style={{ marginBottom: 12 }} />
            <Skeleton w={120} h={26} r={6} style={{ marginBottom: 8 }}  />
            <Skeleton w={100} h={11} r={4} />
          </div>
        ))}
      </div>

      {/* Two-column section */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {[0, 1].map(i => (
          <div key={i} style={{ ...G, padding: 20 }}>
            <Skeleton w={140} h={14} r={4} style={{ marginBottom: 16 }} />
            {[0, 1, 2, 3, 4].map(j => (
              <div key={j} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <Skeleton w={8}   h={8}  r="50%" />
                <Skeleton w={160} h={12} r={4} />
                <Skeleton w={48}  h={12} r={4} style={{ marginLeft: "auto" }} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Pipeline skeleton ────────────────────────────────────
export function PipelineSkeleton() {
  return (
    <div style={{ padding: 24, overflowX: "auto" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(8, minmax(160px, 1fr))", gap: 8, minWidth: 1200 }}>
        {Array.from({ length: 8 }, (_, col) => (
          <div key={col} style={{ background: B2, border: `1px solid ${LN}`, borderRadius: 10, overflow: "hidden" }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${LN}`, background: B1 }}>
              <Skeleton w={80} h={11} r={4} />
            </div>
            <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
              {Array.from({ length: Math.floor(Math.random() * 3) + 1 }, (_, r) => (
                <div key={r} style={{ background: B1, border: `1px solid ${LN}`, borderRadius: 8, padding: "10px 12px" }}>
                  <Skeleton w="80%" h={12} r={4} style={{ marginBottom: 8 }} />
                  <Skeleton w={60}  h={10} r={4} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Table skeleton ───────────────────────────────────────
export function TableSkeleton({ rows = 5 }) {
  return (
    <div style={{ padding: 24 }}>
      <div style={{ background: B1, border: `1px solid ${LN}`, borderRadius: 10, overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "12px 16px", background: B2, display: "flex", gap: 24, borderBottom: `1px solid ${LN}` }}>
          {[200, 120, 100, 140, 80].map((w, i) => (
            <Skeleton key={i} w={w} h={11} r={4} />
          ))}
        </div>
        {/* Rows */}
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} style={{ padding: "14px 16px", display: "flex", gap: 24, alignItems: "center", borderBottom: i < rows - 1 ? `1px solid ${LN}` : "none" }}>
            <Skeleton w={12} h={12} r="50%" />
            <Skeleton w={180} h={13} r={4} />
            <Skeleton w={100} h={12} r={4} />
            <Skeleton w={80}  h={12} r={4} />
            <Skeleton w={120} h={12} r={4} />
            <Skeleton w={60}  h={11} r={4} style={{ marginLeft: "auto" }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Empty State ──────────────────────────────────────────
const EMPTY_CONFIGS = {
  contracts: {
    icon: FileText,
    title: "Nenhum contrato ainda",
    sub: "Adicione o primeiro contrato clicando em + Contrato na barra superior.",
  },
  posts: {
    icon: Video,
    title: "Nenhum post cadastrado",
    sub: "Registre posts publicados para acompanhar métricas de engajamento.",
  },
  deliverables: {
    icon: Package,
    title: "Pipeline vazio",
    sub: "Nenhum entregável em produção. Crie um novo usando o botão + Novo entregável.",
  },
  financeiro: {
    icon: BarChart2,
    title: "Sem dados financeiros",
    sub: "As informações aparecerão aqui conforme os contratos forem cadastrados.",
  },
  default: {
    icon: Inbox,
    title: "Nada aqui ainda",
    sub: "Este espaço ainda está vazio.",
  },
};

export function EmptyState({ type = "default", action, actionLabel }) {
  const cfg = EMPTY_CONFIGS[type] || EMPTY_CONFIGS.default;
  const Icon = cfg.icon;
  return (
    <div style={{
      display: "flex", flexDirection: "column", alignItems: "center",
      justifyContent: "center", padding: "64px 24px", gap: 16, textAlign: "center",
    }}>
      <div style={{
        width: 64, height: 64, borderRadius: 16,
        background: B2, border: `1.5px solid ${LN}`,
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <Icon size={28} color={TX3} strokeWidth={1.5} />
      </div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: TX, marginBottom: 6 }}>{cfg.title}</div>
        <div style={{ fontSize: 12, color: TX2, maxWidth: 340, lineHeight: 1.6 }}>{cfg.sub}</div>
      </div>
      {action && (
        <button onClick={action}
          style={{ marginTop: 4, padding: "8px 20px", background: "#C8102E", border: "none", borderRadius: 8, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
          {actionLabel || "Adicionar"}
        </button>
      )}
    </div>
  );
}
