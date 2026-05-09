import { createContext, useContext, useState, useCallback } from "react";
import { uid } from "../utils/id.js";
import { G2, GRN, RED, BLU, AMB, TX } from "../constants/tokens.js";

export const ToastCtx = createContext(null);

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }) {
  const [list, setList] = useState([]);

  const push = useCallback((msg, type = "success") => {
    const id = uid();
    setList(p => [...p, { id, msg, type }]);
    setTimeout(() => setList(p => p.filter(t => t.id !== id)), 3500);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div style={{
        position: "fixed", bottom: 24, right: 24, zIndex: 999,
        display: "flex", flexDirection: "column", gap: 8, pointerEvents: "none",
      }}>
        {list.map(t => (
          <div key={t.id} style={{
            ...G2, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10,
            fontSize: 12, fontWeight: 600, color: TX, minWidth: 220,
            borderLeft: `3px solid ${t.type === "success" ? GRN : t.type === "error" ? RED : t.type === "info" ? BLU : AMB}`,
            animation: "toastIn .2s ease",
          }}>
            <span style={{ fontSize: 16 }}>
              {t.type === "success" ? "✓" : t.type === "error" ? "✕" : "!"}
            </span>
            {t.msg}
          </div>
        ))}
      </div>
      <style>{`@keyframes toastIn{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}`}</style>
    </ToastCtx.Provider>
  );
}
