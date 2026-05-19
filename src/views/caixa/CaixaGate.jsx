// src/views/caixa/CaixaGate.jsx
// Gate de senha simples para apresentacao. Estado 100% local.
// IMPORTANTE: este componente sempre renderiza com a MESMA ordem de hooks
// independente de estar trancado ou nao. Sem early-returns antes dos hooks.

import { useState, useEffect, useRef } from "react";
import { theme as ds } from "../../lib/theme.js";

const STORAGE_KEY  = "caixa_unlocked_until";
const SESSION_MS   = 3_600_000; // 1h

function readUnlockedUntil() {
    try {
        const n = Number(sessionStorage.getItem(STORAGE_KEY));
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
    const [pw,    setPw]      = useState("");
    const [error, setError]   = useState(null);
    const [visible, setVisible] = useState(false);
    const inputRef = useRef(null);

    const unlocked = Date.now() < unlockedUntil;

    // Auto-focus quando trancado
    useEffect(() => {
        if (!unlocked && inputRef.current) {
                inputRef.current.focus();
        }
  }, [unlocked]);

  // Auto-lock quando expira
  useEffect(() => {
        if (!unlocked) return;
        const remaining = unlockedUntil - Date.now();
        const timer = setTimeout(() => setUnlockedUntil(0), remaining);
        return () => clearTimeout(timer);
  }, [unlocked, unlockedUntil]);

  function handleSubmit(e) {
        e.preventDefault();
        const PASSWORD = "veloso2026";
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
                        <div style={{
                            position: "fixed", bottom: ds.space[5], right: ds.space[5],
                            zIndex: ds.z.sticky,
                        }}>
                                <button
                                    onClick={handleLock}
                                    title="Bloquear Controle Financeiro"
                                    style={{
                                        display: "flex", alignItems: "center", gap: ds.space[2],
                                        padding: `${ds.space[2]} ${ds.space[3]}`,
                                        borderRadius: ds.radius.full,
                                        background: ds.color.neutral[100],
                                        border: ds.border.thin,
                                        color: ds.color.neutral[500],
                                        fontSize: ds.font.size.xs,
                                        fontWeight: ds.font.weight.medium,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        boxShadow: ds.shadow.xs,
                                        transition: `background ${ds.motion.fast}`,
                                    }}
                                    onMouseEnter={e => e.currentTarget.style.background = ds.color.neutral[200]}
                                    onMouseLeave={e => e.currentTarget.style.background = ds.color.neutral[100]}
                                >
                                    🔒 Bloquear
                                </button>
                        </div>
                        {children}
                </>
          );
  }
  
    return (
        <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            minHeight: "60vh", padding: `${ds.space[8]} ${ds.space[4]}`,
        }}>
                <form onSubmit={handleSubmit} style={{
                    width: "100%", maxWidth: 400,
                    background: ds.color.neutral[0],
                    border: ds.border.thin,
                    borderRadius: ds.radius.xl,
                    padding: ds.space[8],
                    boxShadow: ds.shadow.md,
                    textAlign: "center",
                }}>
                        {/* Ícone */}
                        <div style={{
                            width: 52, height: 52, borderRadius: ds.radius.full,
                            background: ds.color.neutral[100],
                            display: "inline-flex",
                            alignItems: "center", justifyContent: "center",
                            marginBottom: ds.space[4],
                            fontSize: 22,
                        }}>🔐</div>

                        {/* Título */}
                        <div style={{
                            fontSize: ds.font.size.lg,
                            fontWeight: ds.font.weight.semibold,
                            color: ds.color.neutral[900],
                            letterSpacing: "-0.02em",
                            marginBottom: ds.space[1],
                        }}>
                            Controle Financeiro
                        </div>

                        {/* Subtítulo */}
                        <div style={{
                            fontSize: ds.font.size.sm,
                            color: ds.color.neutral[500],
                            marginBottom: ds.space[6],
                            lineHeight: ds.font.lineHeight.relaxed,
                        }}>
                            Acesso restrito. Digite a senha do Controle Financeiro.
                        </div>

                        {/* Campo de senha */}
                        <div style={{ position: "relative", marginBottom: ds.space[3] }}>
                            <input
                                ref={inputRef}
                                type={visible ? "text" : "password"}
                                value={pw}
                                onChange={(e) => { setPw(e.target.value); if (error) setError(null); }}
                                placeholder="Senha do Controle Financeiro"
                                autoComplete="current-password"
                                style={{
                                    width: "100%",
                                    padding: `${ds.space[3]} ${ds.space[8]} ${ds.space[3]} ${ds.space[4]}`,
                                    fontSize: ds.font.size.base,
                                    fontFamily: "inherit",
                                    background: error ? `${ds.color.danger[500]}08` : ds.color.neutral[0],
                                    border: `1.5px solid ${error ? ds.color.danger[500] : ds.color.neutral[200]}`,
                                    borderRadius: ds.radius.md,
                                    color: ds.color.neutral[900],
                                    outline: "none",
                                    boxSizing: "border-box",
                                    transition: `border-color ${ds.motion.fast}`,
                                }}
                            />
                            <button
                                type="button"
                                onClick={() => setVisible(v => !v)}
                                aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
                                style={{
                                    position: "absolute", right: ds.space[2], top: "50%",
                                    transform: "translateY(-50%)",
                                    background: "none", border: "none",
                                    cursor: "pointer", padding: ds.space[2],
                                    color: ds.color.neutral[400],
                                    fontSize: ds.font.size.base,
                                }}
                            >{visible ? "🙈" : "👁"}</button>
                        </div>

                        {/* Erro */}
                        {error && (
                            <div style={{
                                fontSize: ds.font.size.xs,
                                color: ds.color.danger[500],
                                marginBottom: ds.space[3],
                                fontWeight: ds.font.weight.medium,
                            }}>
                                {error}
                            </div>
                        )}

                        {/* Botão */}
                        <button
                            type="submit"
                            style={{
                                width: "100%",
                                padding: `${ds.space[3]} ${ds.space[4]}`,
                                background: ds.color.brand[500],
                                color: ds.color.neutral[0],
                                border: "none",
                                borderRadius: ds.radius.md,
                                fontSize: ds.font.size.sm,
                                fontWeight: ds.font.weight.semibold,
                                fontFamily: "inherit",
                                cursor: "pointer",
                                transition: `background ${ds.motion.fast}`,
                                letterSpacing: "0.01em",
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = ds.color.brand[600]}
                            onMouseLeave={e => e.currentTarget.style.background = ds.color.brand[500]}
                        >
                            Desbloquear
                        </button>

                        {/* Aviso de sessão */}
                        <div style={{
                            fontSize: ds.font.size.xs,
                            color: ds.color.neutral[400],
                            marginTop: ds.space[4],
                        }}>
                            Sessão válida por 60 minutos
                        </div>
                </form>
        </div>
    );
}
