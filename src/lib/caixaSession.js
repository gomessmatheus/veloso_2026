// src/lib/caixaSession.js - bypass total (gate vive em CaixaGate.jsx)
export function getCaixaToken() { return null; }
export async function attemptUnlock() { return { ok: true, expiresAt: null }; }
export async function revokeSession() {}
export async function caixaData() { return null; }
export function useCaixaSession() {
      return {
              unlocked: true,
              unlock: async () => {},
              lockout: async () => {},
              expiresAt: null,
              expiresIn: null,
              expiringSoon: false,
              loading: false,
              error: null,
              clearError: () => {},
              attemptsLeft: null,
      };
}
