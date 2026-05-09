import { createContext, useContext, useState, useCallback } from "react";
import { uid } from "../utils/id.js";
import { G2, GRN, RED, BLU, AMB, TX } from "../constants/tokens.js";

export const ToastCtx = createContext(null);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);
  const mob = typeof window !== "undefined" && window.innerWidth < 768;

  const push = useCallback((msg, type = "success") => {
    const id = uid();
    setList(p => [...p, { id, msg, type }]);
    setTimeout(() => setList(p => p.filter(t => t.id !== id)), 4000); // 4 s auto-dismiss
  }, []);

  const dismiss = useCallback((id) => {
    setList(p => p.filter(t => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{
        position: "fixed",
        // Mobile: top-right; desktop: bottom-right
        ...(mob
          ? { top: 16, right: 16, left: 16 }
          : { bottom: 24, right: 24, width: 320 }
        ),
        zIndex: 999,
        display: "flex",
        flexDirection: mob ? "column" : "column-reverse",
        gap: 8,
        pointerEvents: "none",
      }}>
        {list.map(t => (
          <div key={t.id}
            style={{
              ...G2,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              fontSize: 12,
              fontWeight: 600,
              color: TX,
              minWidth: 220,
              borderLeft: `3px solid ${t.type === "success" ? GRN : t.type === "error" ? RED : t.type === "info" ? BLU : AMB}`,
              animation: mob ? "toastInTop .2s ease both" : "toastInRight .2s ease both",
              pointerEvents: "all",
              boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
            }}>
            <span style={{ fontSize: 16, flexShrink: 0 }}>
              {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "!"}
            </span>
            <span style={{ flex: 1, lineHeight: 1.4 }}>{t.msg}</span>
            <button
              onClick={() => dismiss(t.id)}
              aria-label="Fechar notificação"
              style={{ background: "none", border: "none", color: TX3, cursor: "pointer", padding: 2, fontSize: 16, lineHeight: 1, flexShrink: 0 }}>
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
