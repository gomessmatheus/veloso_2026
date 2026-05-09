import { useState, useRef, useEffect } from "react";
import { X } from "lucide-react";
import { B1, B2, B3, LN, LN2, TX, TX2, TX3, RED, GRN, TRANS } from "../constants/tokens.js";

// ─── Button ───────────────────────────────────────────────
export function Btn({ children, onClick, variant = "default", size = "md", icon: Icon, disabled, style: st }) {
  const [hov, setHov] = useState(false);
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6,
    fontFamily: "inherit", fontWeight: 600, letterSpacing: ".03em",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? .5 : 1,
    border: "none", outline: "none",
    transition: "all 0.18s cubic-bezier(0.4,0,0.2,1)",
    borderRadius: 6, fontSize: size === "sm" ? 10 : 12,
  };
  const variants = {
    default: { background: hov ? B3 : B2, color: TX, border: `1px solid ${hov ? LN2 : LN}`, padding: size === "sm" ? "5px 10px" : "7px 14px", boxShadow: hov ? "0 2px 6px rgba(0,0,0,0.08)" : "none" },
    primary: { background: hov ? "#a80d25" : RED, color: "#fff", padding: size === "sm" ? "5px 10px" : "7px 14px", boxShadow: hov ? "0 3px 10px rgba(200,16,46,0.35)" : "0 1px 3px rgba(200,16,46,0.2)", transform: hov ? "translateY(-1px)" : "translateY(0)" },
    ghost:   { background: hov ? B2 : "transparent", color: hov ? TX : TX2, padding: size === "sm" ? "5px 8px" : "7px 10px", borderRadius: 4 },
    danger:  { background: hov ? "rgba(200,16,46,.22)" : "rgba(200,16,46,.1)", color: RED, border: `1px solid rgba(200,16,46,.3)`, padding: size === "sm" ? "5px 10px" : "7px 14px" },
  };
  return (
    <button style={{ ...base, ...variants[variant], ...st }} onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
      {Icon && <Icon size={size === "sm" ? 11 : 13} />}{children}
    </button>
  );
}

// ─── Badge ────────────────────────────────────────────────
export function Badge({ children, color = "#475569", bg }) {
  return (
    <span style={{
      display: "inline-block", padding: "2px 7px", fontSize: 9,
      fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase",
      borderRadius: 4, background: bg || `${color}20`,
      border: `1px solid ${color}40`, color,
    }}>
      {children}
    </span>
  );
}

// ─── Form controls ────────────────────────────────────────
export function Input({ value, onChange, placeholder, type = "text", style: st }) {
  return (
    <input type={type} value={value} onChange={onChange} placeholder={placeholder}
      style={{ width: "100%", padding: "8px 12px", background: B2, border: `1px solid ${LN}`, borderRadius: 6, color: TX, fontSize: 12, fontFamily: "inherit", outline: "none", ...st }}
      onFocus={e => e.target.style.borderColor = LN2}
      onBlur={e => e.target.style.borderColor = LN}
    />
  );
}

export function Select({ value, onChange, children, style: st }) {
  return (
    <select value={value} onChange={onChange}
      style={{ width: "100%", padding: "8px 12px", background: B2, border: `1px solid ${LN}`, borderRadius: 6, color: TX, fontSize: 12, fontFamily: "inherit", outline: "none", ...st }}>
      {children}
    </select>
  );
}

export function Textarea({ value, onChange, placeholder, rows = 3, style: st }) {
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      style={{ width: "100%", padding: "8px 12px", background: B2, border: `1px solid ${LN}`, borderRadius: 6, color: TX, fontSize: 12, fontFamily: "inherit", outline: "none", resize: "vertical", ...st }}
    />
  );
}

// ─── Toggle ───────────────────────────────────────────────
export function Toggle({ on, onToggle }) {
  return (
    <div onClick={onToggle}
      style={{ width: 32, height: 18, borderRadius: 9, background: on ? RED : "rgba(255,255,255,.1)", border: `1px solid ${on ? RED : LN}`, position: "relative", cursor: "pointer", transition: "all .2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: "50%", background: "#fff", transition: "left .2s" }} />
    </div>
  );
}

// ─── Section rule ─────────────────────────────────────────
export function SRule({ children }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: TX3, display: "flex", alignItems: "center", gap: 10, margin: "18px 0 12px" }}>
      {children}<div style={{ flex: 1, height: 1, background: LN }} />
    </div>
  );
}

// ─── Field wrapper ────────────────────────────────────────
export function Field({ label, children, full }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, gridColumn: full ? "1/-1" : "auto" }}>
      <label style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".12em", textTransform: "uppercase", color: TX2 }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Commission toggle ────────────────────────────────────
export function CommToggle({ on, onToggle, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}
      onClick={e => { e.stopPropagation(); onToggle(); }}>
      <Toggle on={on} onToggle={() => {}} />
      {label && (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: on ? GRN : TX2 }}>
          {on ? "✓ Comissão Ranked (a pagar)" : "Sem comissão"}
        </span>
      )}
    </div>
  );
}

// ─── Inline notes ─────────────────────────────────────────
export function InlineNotes({ notes, onSave }) {
  const [val, setVal] = useState(notes || "");
  const [dirty, setDirty] = useState(false);
  const ta = useRef(null);
  useEffect(() => { setVal(notes || ""); }, [notes]);
  return (
    <textarea ref={ta} rows={1} value={val} placeholder="Observações…"
      onChange={e => { setVal(e.target.value); setDirty(true); }}
      onBlur={() => { if (dirty) { onSave(val); setDirty(false); } }}
      style={{ display: "block", width: "100%", background: "transparent", border: "none", borderLeft: `2px solid ${LN}`, color: TX2, fontSize: 11, fontFamily: "inherit", padding: "4px 8px", resize: "none", outline: "none", fontStyle: "italic", marginTop: 6 }}
    />
  );
}

// ─── Modal shell ──────────────────────────────────────────
export function Modal({ title, onClose, children, footer, width = 640 }) {
  const mob = typeof window !== "undefined" && window.innerWidth < 768;
  return (
    <div
      className="modal-backdrop"
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.6)", zIndex: 200, display: "flex", alignItems: mob ? "flex-end" : "flex-start", justifyContent: "center", padding: mob ? 0 : "48px 16px", overflowY: mob ? "hidden" : "auto", backdropFilter: "blur(4px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        className={mob ? "modal-sheet" : "modal-dialog"}
        style={{ background: B1, borderRadius: mob ? "20px 20px 0 0" : "14px", border: `1px solid ${LN}`, width: "100%", maxWidth: mob ? "100%" : width, flexShrink: 0, maxHeight: mob ? "92vh" : "none", display: "flex", flexDirection: "column", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        {mob && <div style={{ width: 40, height: 4, background: LN2, borderRadius: 2, margin: "12px auto 0", flexShrink: 0 }} />}
        <div style={{ padding: mob ? "12px 20px 14px" : "16px 20px", borderBottom: `1px solid ${LN}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".14em", textTransform: "uppercase", color: TX }}>{title}</span>
          <button
            onClick={onClose}
            aria-label="Fechar modal"
            style={{ background: "none", border: "none", color: TX2, cursor: "pointer", padding: 6, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <X size={16} />
          </button>
        </div>
        <div style={{ padding: "20px", overflowY: "auto", flex: 1 }}>{children}</div>
        {footer && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${LN}`, display: "flex", justifyContent: "flex-end", gap: 8, flexShrink: 0, background: B2, borderRadius: mob ? 0 : "0 0 14px 14px" }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
