import { TX, RED, AMB, GRN, BLU, LN } from "../constants/tokens.js";

// ─── Date & string helpers ────────────────────────────────
export const fmtDate = s => {
  try {
    if (!s) return "—";
    const parts = String(s).split("-");
    if (parts.length < 3) return "—";
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  } catch { return "—"; }
};

export const daysLeft = s => {
  try {
    if (!s) return null;
    const ms = new Date(s) - new Date();
    if (isNaN(ms)) return null;
    return Math.ceil(ms / 864e5);
  } catch { return null; }
};

export const cn = (...cls) => cls.filter(Boolean).join(" ");

// ─── Money formatting ─────────────────────────────────────
export function fmtMoney(v, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(v || 0);
}

// ─── Colour helpers ───────────────────────────────────────
export function dlColor(d) {
  return d == null ? TX : d <= 7 ? RED : d <= 14 ? AMB : GRN;
}

export function currBadge(cur) {
  const s = {
    padding: "1px 6px", fontSize: 8, fontWeight: 700,
    letterSpacing: ".06em", textTransform: "uppercase", borderRadius: 3,
  };
  if (cur === "EUR") return (
    <span style={{ ...s, background:"rgba(99,102,241,.18)", border:"1px solid rgba(99,102,241,.3)", color:"#818CF8" }}>EUR</span>
  );
  if (cur === "USD") return (
    <span style={{ ...s, background:"rgba(16,185,129,.18)", border:"1px solid rgba(16,185,129,.3)", color:"#34D399" }}>USD</span>
  );
  return null;
}

// ─── localStorage helpers ─────────────────────────────────
export function lsLoad(k, fb) {
  try {
    const v = localStorage.getItem(k);
    return v != null ? JSON.parse(v) : fb;
  } catch { return fb; }
}

export function lsSave(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}
