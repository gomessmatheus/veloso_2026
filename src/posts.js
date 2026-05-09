/**
 * Calculate engagement rate for a post.
 * Returns null (not 0%) when reach is missing.
 */
export function calcEngagement(p) {
  const interactions = (p.likes || 0) + (p.comments || 0) + (p.shares || 0) + (p.saves || 0);
  if (!p.reach) return null;
  return (interactions / p.reach) * 100;
}

/**
 * Count how many additional network reposts a post generates.
 * A "repost" type counts as 1; otherwise it's (networks.length - 1).
 */
export function postRepostCount(p) {
  if (p.type === "repost") return 1;
  return Math.max(0, (p.networks || []).length - 1);
}
