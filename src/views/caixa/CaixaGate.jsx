/**
 * src/views/caixa/CaixaGate.jsx
 *
 * Step-up authentication gate rendered in front of CaixaView.
 * Displays:
 *   1. Password entry screen (when locked)
 *   2. Expiry warning banner (when unlocked but < 2 min remaining)
 *
 * Props:
 *   session   {ReturnType<useCaixaSession>}   — from useCaixaSession() hook
 *   children  {ReactNode}                     — the protected view
 */

import { useState, useEffect, useRef } from "react";
import { theme as ds, Button as DsButton, Icon as DsIcon, IconButton as DsIconButton } from "../../ui/index.js";

// ── Tokens (mirrors App.jsx palette) ─────────────────────
const B1   = "#FEFEFE";
const B2   = "#F7F7F7";
const LN   = "#F0F0F2";
const TX   = "#000000";
const TX2  = "#6E6E6E";
const TX3  = "#ABABAB";
const RED  = "#C8102E";
const AMB  = "#D97706";
const GRN  = "#16A34A";
const G    = { background: B1, border: `1px solid ${LN}`, borderRadius: ds.radius.xl, boxShadow: ds.shadow.sm };
const TRANS = `all ${ds.motion.base}`;

// ── Sub-components ────────────────────────────────────────

function PasswordInput({ value, onChange, onSubmit, disabled, error }) {
  const [visible, setVisible] = useState(false);
  const inputRef = useRef(null);

  // Auto-focus on mount
  useEffect(() => { inputRef.current?.focus(); }, []);

  return (
    <div style={{ position: "relative" }}>
      <input
        ref={inputRef}
        type={visible ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => e.key === "Enter" && !disabled && onSubmit()}
        placeholder="Senha do Controle Financeiro"
        disabled={disabled}
        autoComplete="current-password"
        aria-label="Senha do Controle Financeiro"
        aria-invalid={!!error}
        aria-describedby={error ? "caixa-pw-error" : undefined}
        style={{
          width:        "100%",
          padding:      "12px 44px 12px 16px",
          fontSize:     15,
          fontFamily:   "inherit",
          background:   error ? `${RED}08` : B1,
          border:       `1.5px solid ${error ? RED : LN}`,
          borderRadius: ds.radius.lg,
          color:        TX,
          outline:      "none",
          transition:   TRANS,
          boxSizing:    "border-box",
        }}
        onFocus={e  => !error && (e.target.style.borderColor = TX2)}
        onBlur={e   => !error && (e.target.style.borderColor = LN)}
      />
      {/* Toggle visibility */}
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        style={{
          position:   "absolute",
          right:      12,
          top:        "50%",
          transform:  "translateY(-50%)",
          background: "none",
          border:     "none",
          cursor:     "pointer",
          padding:    4,
          color:      TX3,
          display:    "flex",
          alignItems: "center",
        }}
      >
        <DsIcon name={visible ? "eyeOff" : "eye"} size={16} color={TX3} />
      </button>
    </div>
  );
}

function AttemptDots({ failCount, maxAttempts = 5 }) {
  if (failCount === 0) return null;
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "center", margin: "8px 0 0" }}>
      {Array.from({ length: maxAttempts }).map((_, i) => (
        <div
          key={i}
          style={{
            width:        8,
            height:       8,
            borderRadius: "50%",
            background:   i < failCount ? RED : LN,
            transition:   TRANS,
          }}
        />
      ))}
    </div>
  );
}

function ExpiryChip({ expiresIn, onRenew, onLock, loading }) {
  if (!expiresIn || expiresIn > 120) return null;  // only show in last 2 min

  const mins  = Math.floor(expiresIn / 60);
  const secs  = expiresIn % 60;
  const label = mins > 0
    ? `Sessão expira em ${mins}m ${secs}s`
    : `Sessão expira em ${secs}s`;
  const color = expiresIn < 30 ? RED : AMB;

  return (
    <div
      aria-live="polite"
      role="status"
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "space-between",
        gap:            12,
        padding:        "10px 16px",
        borderRadius:   ds.radius.lg,
        background:     `${color}10`,
        border:         `1px solid ${color}30`,
        marginBottom:   16,
        fontSize:       12,
        color,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <DsIcon name="clock" size={13} color={color} />
        <span style={{ fontWeight: 600 }}>{label}</span>
      </div>
      <div style={{ display: "flex", gap: 6 }}>
        <button
          onClick={onRenew}
          disabled={loading}
          style={{
            fontSize:     11,
            fontWeight:   700,
            padding:      "4px 10px",
            borderRadius: 99,
            background:   color,
            color:        "white",
            border:       "none",
            cursor:       loading ? "not-allowed" : "pointer",
            fontFamily:   "inherit",
            opacity:      loading ? 0.6 : 1,
          }}
        >
          Renovar
        </button>
        <button
          onClick={onLock}
          style={{
            fontSize:     11,
            fontWeight:   600,
            padding:      "4px 10px",
            borderRadius: 99,
            background:   "none",
            color:        TX2,
            border:       `1px solid ${LN}`,
            cursor:       "pointer",
            fontFamily:   "inherit",
          }}
        >
          Sair
        </button>
      </div>
    </div>
  );
}

// ── Main Gate component ───────────────────────────────────

export default function CaixaGate({ session, children }) {
  const {
    unlocked, unlock, lockout,
    expiresIn, expiringSoon,
    loading, error, clearError,
  } = session;

  const [pw,          setPw]          = useState("");
  const [localError,  setLocalError]  = useState(null);
  const [failCount,   setFailCount]   = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [renewMode,   setRenewMode]   = useState(false);

  // Countdown for temporary lockout display
  const [lockCountdown, setLockCountdown] = useState(0);
  useEffect(() => {
    if (!lockedUntil) return;
    const iv = setInterval(() => {
      const secs = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockCountdown(secs);
      if (secs === 0) { setLockedUntil(null); setLocalError(null); }
    }, 1000);
    return () => clearInterval(iv);
  }, [lockedUntil]);

  // Sync server errors to local state
  useEffect(() => {
    if (error) {
      setLocalError(error);
      if (error.includes("Muitas tentativas")) {
        // Parse lockout duration from message if possible
        setLockedUntil(Date.now() + 30 * 60 * 1000);
      }
    }
  }, [error]);

  const displayError = localError || null;

  async function handleSubmit() {
    if (!pw.trim() || loading) return;
    setLocalError(null);
    clearError();
    try {
      await unlock(pw);
      setPw("");
      setFailCount(0);
      setRenewMode(false);
    } catch (e) {
      setFailCount(n => Math.min(n + 1, 5));
      setPw("");
      if (e.status !== 429) {
        setLocalError(e.message || "Senha incorreta. Tente novamente.");
      }
    }
  }

  // ── Renew mode: shown when expiring soon ─────────────
  if (unlocked && expiringSoon && !renewMode) {
    // Show the children + expiry banner above
    return (
      <>
        <ExpiryChip
          expiresIn={expiresIn}
          loading={loading}
          onRenew={() => setRenewMode(true)}
          onLock={lockout}
        />
        {children}
      </>
    );
  }

  // ── Unlocked: render children ─────────────────────────
  if (unlocked && !renewMode) {
    return (
      <>
        {/* Non-intrusive lock button in top-right */}
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 50 }}>
          <button
            onClick={lockout}
            title="Bloquear Controle Financeiro"
            style={{
              display:        "flex",
              alignItems:     "center",
              gap:            6,
              padding:        "8px 14px",
              borderRadius:   99,
              background:     B2,
              border:         `1px solid ${LN}`,
              color:          TX3,
              fontSize:       11,
              fontWeight:     600,
              cursor:         "pointer",
              fontFamily:     "inherit",
              boxShadow:      ds.shadow.sm,
              transition:     TRANS,
            }}
            onMouseEnter={e => { e.currentTarget.style.color = TX; e.currentTarget.style.borderColor = TX2; }}
            onMouseLeave={e => { e.currentTarget.style.color = TX3; e.currentTarget.style.borderColor = LN; }}
          >
            <DsIcon name="lock" size={11} color={TX3} />
            {expiresIn && expiresIn < 300 ? `${Math.ceil(expiresIn / 60)}m` : "Bloquear"}
          </button>
        </div>
        {children}
      </>
    );
  }

  // ── Locked / Renew mode: show password form ───────────
  const isRateLimited = !!lockedUntil;
  const isRenew       = renewMode && unlocked;

  return (
    <div
      role="main"
      aria-label="Controle Financeiro — autenticação"
      style={{
        display:        "flex",
        alignItems:     "center",
        justifyContent: "center",
        minHeight:      "60vh",
        padding:        `${ds.space[8]} ${ds.space[4]}`,
      }}
    >
      <div
        style={{
          ...G,
          width:     "100%",
          maxWidth:  400,
          padding:   `${ds.space[8]} ${ds.space[7]}`,
          textAlign: "center",
        }}
      >
        {/* Icon */}
        <div
          style={{
            width:           52,
            height:          52,
            borderRadius:    "50%",
            background:      isRateLimited ? `${RED}12` : `${TX}08`,
            border:          `1px solid ${isRateLimited ? RED + "25" : LN}`,
            display:         "inline-flex",
            alignItems:      "center",
            justifyContent:  "center",
            marginBottom:    ds.space[5],
          }}
        >
          <DsIcon
            name={isRateLimited ? "alertCircle" : "lock"}
            size={22}
            color={isRateLimited ? RED : TX2}
          />
        </div>

        {/* Heading */}
        <h2 style={{
          fontSize:      ds.font.size.xl,
          fontWeight:    ds.font.weight.semibold,
          color:         TX,
          letterSpacing: "-.02em",
          margin:        `0 0 ${ds.space[1]} 0`,
        }}>
          {isRenew ? "Renovar sessão" : "Controle Financeiro"}
        </h2>
        <p style={{
          fontSize:     ds.font.size.sm,
          color:        TX2,
          margin:       `0 0 ${ds.space[6]} 0`,
          lineHeight:   1.5,
        }}>
          {isRateLimited
            ? `Acesso bloqueado. Tente novamente em ${Math.ceil(lockCountdown / 60)} min.`
            : isRenew
            ? "Sua sessão expira em breve. Digite a senha para renovar."
            : "Acesso restrito. Digite a senha do Controle Financeiro."}
        </p>

        {/* Rate limited: show countdown only */}
        {isRateLimited ? (
          <div style={{
            padding:      "20px",
            borderRadius: ds.radius.lg,
            background:   `${RED}06`,
            border:       `1px solid ${RED}15`,
          }}>
            <div style={{ fontSize: 32, fontWeight: 700, color: RED, fontVariantNumeric: "tabular-nums" }}>
              {Math.floor(lockCountdown / 60)}:{String(lockCountdown % 60).padStart(2, "0")}
            </div>
            <div style={{ fontSize: 12, color: TX2, marginTop: 4 }}>restante do bloqueio</div>
          </div>
        ) : (
          <>
            {/* Password input */}
            <div style={{ marginBottom: ds.space[3] }}>
              <PasswordInput
                value={pw}
                onChange={v => { setPw(v); if (localError) { setLocalError(null); clearError(); } }}
                onSubmit={handleSubmit}
                disabled={loading}
                error={displayError}
              />
            </div>

            {/* Error message */}
            {displayError && (
              <p
                id="caixa-pw-error"
                role="alert"
                style={{
                  fontSize:     12,
                  color:        RED,
                  margin:       `0 0 ${ds.space[3]} 0`,
                  textAlign:    "left",
                  display:      "flex",
                  alignItems:   "center",
                  gap:          4,
                }}
              >
                <DsIcon name="alertCircle" size={12} color={RED} />
                {displayError}
              </p>
            )}

            {/* Attempt dots */}
            <AttemptDots failCount={failCount} />

            {/* Submit */}
            <DsButton
              variant="primary"
              size="lg"
              fullWidth
              onClick={handleSubmit}
              disabled={!pw.trim() || loading}
              style={{ marginTop: ds.space[5] }}
            >
              {loading
                ? "Verificando..."
                : isRenew
                ? "Renovar"
                : "Desbloquear"}
            </DsButton>

            {/* Cancel renew */}
            {isRenew && (
              <button
                onClick={() => { setRenewMode(false); setPw(""); setLocalError(null); }}
                style={{
                  marginTop:  ds.space[3],
                  background: "none",
                  border:     "none",
                  color:      TX2,
                  fontSize:   12,
                  cursor:     "pointer",
                  fontFamily: "inherit",
                }}
              >
                Cancelar — continuar com sessão atual
              </button>
            )}
          </>
        )}

        {/* Footer note */}
        <p style={{ fontSize: 11, color: TX3, marginTop: ds.space[6], marginBottom: 0 }}>
          Sessão válida por 15 minutos · Dados financeiros sensíveis
        </p>
      </div>
    </div>
  );
}
