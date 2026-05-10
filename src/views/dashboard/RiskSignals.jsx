/**
 * src/views/dashboard/RiskSignals.jsx
 * Bloco 3 — Sinais de risco (semáforo da operação)
 *
 * Props:
 *   signals    {Signal[]}   — output of detectRiskSignals
 *   isMobile   {boolean}
 *   onSignalClick {(signal) => void}
 */

import { B1, B2, B3, LN, LN2, TX, TX2, TX3, RED, GRN, AMB, BLU, G, TRANS } from "../../constants/tokens.js";

const SEVERITY_BORDER = {
  HIGH:   RED,
  MEDIUM: AMB,
  LOW:    BLU,
};

const SEVERITY_BG = {
  HIGH:   `${RED}06`,
  MEDIUM: `${AMB}06`,
  LOW:    `${BLU}06`,
};

export function RiskSignals({ signals, isMobile, onSignalClick }) {
  return (
    <div style={{
      ...G,
      padding:       isMobile ? "16px" : "20px 24px",
      display:       "flex",
      flexDirection: "column",
    }}>
      {/* Header */}
      <div style={{
        fontSize:      10,
        fontWeight:    700,
        letterSpacing: ".12em",
        color:         TX3,
        marginBottom:  12,
        textTransform: "uppercase",
      }}>
        Sinais desta semana
      </div>

      {signals.length === 0 ? (
        <HealthyState />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {signals.map((s, i) => (
            <SignalRow key={i} signal={s} onClick={() => onSignalClick(s)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SignalRow({ signal, onClick }) {
  const borderColor = SEVERITY_BORDER[signal.severity] || BLU;
  const bgColor     = SEVERITY_BG[signal.severity] || `${BLU}06`;

  return (
    <div
      onClick={onClick}
      style={{
        display:      "flex",
        alignItems:   "center",
        gap:          10,
        padding:      "10px 12px",
        background:   bgColor,
        border:       `1px solid ${borderColor}25`,
        borderLeft:   `3px solid ${borderColor}`,
        borderRadius: 8,
        cursor:       "pointer",
        transition:   TRANS,
      }}
      onMouseEnter={e => { e.currentTarget.style.background = bgColor.replace("06", "10"); }}
      onMouseLeave={e => { e.currentTarget.style.background = bgColor; }}
    >
      <span style={{ fontSize: 14, flexShrink: 0 }}>{signal.icon}</span>
      <span style={{ fontSize: 12, fontWeight: 500, color: TX, flex: 1, lineHeight: 1.4 }}>
        {signal.title}
      </span>
      <span style={{
        fontSize:     11,
        fontWeight:   800,
        color:        borderColor,
        background:   `${borderColor}18`,
        padding:      "2px 8px",
        borderRadius: 99,
        flexShrink:   0,
      }}>
        {signal.count}
      </span>
    </div>
  );
}

function HealthyState() {
  return (
    <div style={{ padding: "20px 0", textAlign: "center" }}>
      <div style={{
        display:       "inline-flex",
        alignItems:    "center",
        gap:           8,
        padding:       "10px 18px",
        background:    `${GRN}10`,
        border:        `1px solid ${GRN}30`,
        borderRadius:  10,
        marginBottom:  10,
      }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: GRN }}>Operação saudável</span>
      </div>
      <div style={{ fontSize: 11, color: TX2, marginTop: 6, lineHeight: 1.5 }}>
        Nenhum sinal de risco detectado nesta semana.
      </div>
    </div>
  );
}
