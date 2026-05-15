// src/views/caixa/CaixaGate.jsx
// Gate de senha simples para apresentacao. Estado 100% local.
// IMPORTANTE: este componente sempre renderiza com a MESMA ordem de hooks
// independente de estar trancado ou nao. Sem early-returns antes dos hooks.

import { useState, useEffect, useRef } from "react";

const PASSWORD     = "veloso2026";
const STORAGE_KEY  = "caixa_gate_unlocked_until";
const SESSION_MS   = 60 * 60 * 1000; // 1h

function readUnlockedUntil() {
    try {
          const v = sessionStorage.getItem(STORAGE_KEY);
          if (!v) return 0;
          const n = parseInt(v, 10);
          return Number.isFinite(n) ? n : 0;
    } catch { return 0; }
}

function writeUnlockedUntil(ts) {
    try { sessionStorage.setItem(STORAGE_KEY, String(ts)); } catch {}
}

function clearUnlocked() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export default function CaixaGate({ children }) {
    const [unlockedUntil, setUnlockedUntil] = useState(() => readUnlockedUntil());
    const [pw, setPw]           = useState("");
    const [error, setError]     = useState(null);
    const [visible, setVisible] = useState(false);
    const inputRef = useRef(null);

  const now      = Date.now();
    const unlocked = unlockedUntil > now;

  // Auto-focus quando trancado
  useEffect(() => {
        if (!unlocked && inputRef.current) {
                inputRef.current.focus();
        }
  }, [unlocked]);

  // Auto-lock quando expira
  useEffect(() => {
        if (!unlocked) return;
        const ms = Math.max(0, unlockedUntil - Date.now());
        const t = setTimeout(() => setUnlockedUntil(0), ms);
        return () => clearTimeout(t);
  }, [unlocked, unlockedUntil]);

  function handleSubmit(e) {
        if (e && e.preventDefault) e.preventDefault();
        if (pw === PASSWORD) {
                const until = Date.now() + SESSION_MS;
                writeUnlockedUntil(until);
                setUnlockedUntil(until);
                setPw("");
                setError(null);
        } else {
                setError("Senha incorreta.");
                setPw("");
        }
  }

  function handleLock() {
        clearUnlocked();
        setUnlockedUntil(0);
  }

  if (unlocked) {
        return (
                <>
                        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 50 }}>
                                  <button
                                                onClick={handleLock}
                                                title="Bloquear Controle Financeiro"
                                                style={{
                                                                display: "flex", alignItems: "center", gap: 6,
                                                                padding: "8px 14px", borderRadius: 99,
                                                                background: "#F7F7F7", border: "1px solid #F0F0F2",
                                                                color: "#ABABAB", fontSize: 11, fontWeight: 600,
                                                                cursor: "pointer", fontFamily: "inherit",
                                                }}
                                              >
                                              Bloquear
                                  </button>
                        </div>
                  {children}
                </>
              );
  }
  
    return (
          <div style={{
                  display: "flex", alignItems: "center", justifyContent: "center",
                  minHeight: "60vh", padding: "32px 16px",
          }}>
                <form onSubmit={handleSubmit} style={{
                    width: "100%", maxWidth: 380,
                    background: "#FEFEFE", border: "1px solid #F0F0F2",
                    borderRadius: 16, padding: 32, boxShadow: "0 1px 3px rgba(0,0,0,.04)",
                    textAlign: "center",
          }}>
                        <div style={{
                      width: 48, height: 48, borderRadius: "50%",
                      background: "#F7F7F7", display: "inline-flex",
                      alignItems: "center", justifyContent: "center",
                      marginBottom: 16, fontSize: 20,
          }}>{"\u{1F512}"}</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#000", marginBottom: 6 }}>
                                  Controle Financeiro
                        </div>
                        <div style={{ fontSize: 13, color: "#6E6E6E", marginBottom: 24 }}>
                                  Acesso restrito. Digite a senha do Controle Financeiro.
                        </div>
                        <div style={{ position: "relative", marginBottom: 12 }}>
                                  <input
                                                ref={inputRef}
                                                type={visible ? "text" : "password"}
                                                value={pw}
                                                onChange={(e) => { setPw(e.target.value); if (error) setError(null); }}
                                                placeholder="Senha do Controle Financeiro"
                                                autoComplete="current-password"
                                                style={{
                                                                width: "100%", padding: "12px 44px 12px 16px",
                                                                fontSize: 15, fontFamily: "inherit",
                                                                background: error ? "#C8102E08" : "#FEFEFE",
                                                                border: "1.5px solid " + (error ? "#C8102E" : "#F0F0F2"),
                                                                borderRadius: 12, color: "#000",
                                                                outline: "none", boxSizing: "border-box",
                                                }}
                                              />
                                  <button
                                                type="button"
                                                onClick={() => setVisible(v => !v)}
                                                aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                                                style={{
                                                                position: "absolute", right: 8, top: "50%",
                                                                transform: "translateY(-50%)",
                                                                background: "none", border: "none",
                                                                cursor: "pointer", padding: 8,
                                                                color: "#ABABAB", fontSize: 14,
                                                }}
                                              >{visible ? "\u{1F648}" : "\u{1F441}"}</button>
                        </div>
                  {error && (
                      <div style={{ color: "#C8102E", fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
                        {error}
                      </div>
                        )}
                        <button
                                    type="submit"
                                    disabled={!pw.trim()}
                                    style={{
                                                  width: "100%", padding: "12px 16px",
                                                  background: pw.trim() ? "#000" : "#ABABAB",
                                                  color: "#FEFEFE", border: "none", borderRadius: 12,
                                                  fontSize: 14, fontWeight: 700,
                                                  cursor: pw.trim() ? "pointer" : "not-allowed",
                                                  fontFamily: "inherit",
                                    }}
                                  >Desbloquear</button>
                        <div style={{ fontSize: 11, color: "#ABABAB", marginTop: 14 }}>
                                  Sessao valida por 60 minutos
                        </div>
                </form>
          </div>
        );
}
