/**
 * Generate a short unique ID.
 * Uses crypto.randomUUID when available (Node ≥ 19, modern browsers),
 * falls back to Math.random for older environments.
 */
export const uid = () => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID().slice(0, 8);
    }
  } catch {}
  return Math.random().toString(36).substr(2, 8);
};
