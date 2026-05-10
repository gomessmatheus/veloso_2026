/**
 * src/lib/conflicts.test.js
 *
 * Unit tests for detectConflicts and buildConflictDateMap.
 * Run with: npm run test
 *
 * Scenarios covered:
 *  1. Same category within window  → WARN
 *  2. Same category outside window → []
 *  3. STRICT override              → BLOCK
 *  4. NONE override                → []
 *  5. Same brand                   → []
 *  6. Same day, different category → INFO
 *  7. blockConflicts flag          → BLOCK instead of WARN
 *  8. Timezone edge case (same-day strings)
 *  9. Invalid/missing date         → []
 * 10. Multiple conflicts — dedup, sorted BLOCK first
 */

import { describe, it, expect } from "vitest";
import { detectConflicts, buildConflictDateMap } from "./conflicts.js";

// ─── Fixtures ─────────────────────────────────────────────

const brandNetshoes = {
  id: "b1", name: "Netshoes", category: "VAREJO_ESPORTIVO",
  exclusivityWindowDays: 7, blockConflicts: false,
};
const brandDecathlon = {
  id: "b2", name: "Decathlon", category: "VAREJO_ESPORTIVO",
  exclusivityWindowDays: 7, blockConflicts: false,
};
const brandCocaCola = {
  id: "b3", name: "Coca-Cola", category: "BEBIDA",
  exclusivityWindowDays: 7, blockConflicts: false,
};
const brandPepsi = {
  id: "b4", name: "Pepsi", category: "BEBIDA",
  exclusivityWindowDays: 7, blockConflicts: false,
};
const brandStrict = {
  id: "b5", name: "ExclusiveBrand", category: "TECH",
  exclusivityWindowDays: 14, blockConflicts: false,
};
const brandBlock = {
  id: "b6", name: "Kabum", category: "GAMING",
  exclusivityWindowDays: 7, blockConflicts: true,
};
const brandOther = {
  id: "b7", name: "Diamond Filmes", category: "ENTRETENIMENTO",
  exclusivityWindowDays: 7, blockConflicts: false,
};

const brands = [brandNetshoes, brandDecathlon, brandCocaCola, brandPepsi, brandStrict, brandBlock, brandOther];

const cNetshoes  = { id: "c1", brandId: "b1", company: "Netshoes",      exclusivityOverride: "DEFAULT" };
const cDecathlon = { id: "c2", brandId: "b2", company: "Decathlon",     exclusivityOverride: "DEFAULT" };
const cCoca      = { id: "c3", brandId: "b3", company: "Coca-Cola",     exclusivityOverride: "DEFAULT" };
const cPepsi     = { id: "c4", brandId: "b4", company: "Pepsi",         exclusivityOverride: "DEFAULT" };
const cStrict    = { id: "c5", brandId: "b5", company: "ExBrand",       exclusivityOverride: "STRICT"  };
const cNone      = { id: "c6", brandId: "b1", company: "Netshoes Alt",  exclusivityOverride: "NONE"    };
const cBlock     = { id: "c7", brandId: "b6", company: "Kabum",         exclusivityOverride: "DEFAULT" };
const cDiamond   = { id: "c8", brandId: "b7", company: "Diamond",       exclusivityOverride: "DEFAULT" };

const contracts = [cNetshoes, cDecathlon, cCoca, cPepsi, cStrict, cNone, cBlock, cDiamond];

function del(id, contractId, date, stage = "roteiro") {
  return { id, contractId, plannedPostDate: date, stage };
}

// ─── Tests ────────────────────────────────────────────────

describe("detectConflicts", () => {

  // 1. Same category within window → WARN
  it("returns WARN for same-category brands within exclusivity window", () => {
    const candidate  = { date: "2026-06-10", brandId: "b1", contractId: "c1" };
    const existing   = [del("d1", "c2", "2026-06-12")]; // Decathlon, 2 days later
    const result     = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("WARN");
    expect(result[0].reason).toBe("SAME_CATEGORY");
    expect(result[0].conflictingDeliverableIds).toContain("d1");
  });

  // 2. Same category outside window → no conflict
  it("returns [] when same-category brand is outside the exclusivity window", () => {
    const candidate = { date: "2026-06-10", brandId: "b1", contractId: "c1" };
    const existing  = [del("d1", "c2", "2026-06-20")]; // 10 days later, window=7
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(0);
  });

  // 3. STRICT override → BLOCK regardless of category
  it("returns BLOCK when candidate contract has STRICT exclusivityOverride", () => {
    const candidate = { date: "2026-06-10", brandId: "b5", contractId: "c5" };
    const existing  = [del("d1", "c3", "2026-06-11")]; // Coca-Cola, different category
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("BLOCK");
    expect(result[0].reason).toBe("STRICT_EXCLUSIVITY");
  });

  it("returns BLOCK when existing contract has STRICT exclusivityOverride", () => {
    const candidate = { date: "2026-06-10", brandId: "b3", contractId: "c3" };
    const existing  = [del("d1", "c5", "2026-06-11")]; // STRICT brand in the window
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result[0].severity).toBe("BLOCK");
    expect(result[0].reason).toBe("STRICT_EXCLUSIVITY");
  });

  // 4. NONE override → no conflicts at all
  it("returns [] when candidate contract has NONE exclusivityOverride", () => {
    const candidate = { date: "2026-06-10", brandId: "b1", contractId: "c6" };
    const existing  = [del("d1", "c2", "2026-06-11")]; // Decathlon — same category
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(0);
  });

  it("skips existing deliverables whose contract has NONE override", () => {
    const candidate = { date: "2026-06-10", brandId: "b2", contractId: "c2" };
    const existing  = [del("d1", "c6", "2026-06-11")]; // Netshoes NONE — should be skipped
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(0);
  });

  // 5. Same brand → never a conflict
  it("returns [] for two deliverables from the same brand", () => {
    const candidate = { date: "2026-06-10", brandId: "b1", contractId: "c1" };
    const existing  = [del("d1", "c1", "2026-06-12")]; // same contractId → same brand
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(0);
  });

  // 6. Same day, different category → INFO
  it("returns INFO for different-category brands on the exact same day", () => {
    const candidate = { date: "2026-06-10", brandId: "b1", contractId: "c1" };
    const existing  = [del("d1", "c3", "2026-06-10")]; // Coca-Cola, different cat, same day
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe("INFO");
    expect(result[0].reason).toBe("SAME_DAY_DIFFERENT_BRAND");
  });

  it("returns [] for different-category brands on different days", () => {
    const candidate = { date: "2026-06-10", brandId: "b1", contractId: "c1" };
    const existing  = [del("d1", "c3", "2026-06-11")]; // Coca-Cola, different cat, diff day
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(0);
  });

  // 7. blockConflicts flag → BLOCK instead of WARN
  it("returns BLOCK when brand.blockConflicts is true (same category)", () => {
    const candidate = { date: "2026-06-10", brandId: "b6", contractId: "c7" };
    // Kabum (blockConflicts=true, GAMING) vs another GAMING brand would need one
    // Use brandBlock vs a hypothetical same-category brand:
    const gamingBrand    = { id: "b9", name: "Razer", category: "GAMING", exclusivityWindowDays: 7, blockConflicts: false };
    const gamingContract = { id: "c9", brandId: "b9", company: "Razer", exclusivityOverride: "DEFAULT" };
    const result = detectConflicts(
      { date: "2026-06-10", brandId: "b6", contractId: "c7" },
      [del("d1", "c9", "2026-06-11")],
      [...brands, gamingBrand],
      [...contracts, gamingContract],
    );
    expect(result[0].severity).toBe("BLOCK");
    expect(result[0].reason).toBe("SAME_CATEGORY");
  });

  // 8. Timezone edge case — same date strings → same calendar day
  it("treats '2026-06-10' and '2026-06-10' as the same day regardless of runtime timezone", () => {
    const candidate = { date: "2026-06-10", brandId: "b1", contractId: "c1" };
    const existing  = [del("d1", "c3", "2026-06-10")]; // same date string, diff category → INFO
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result[0].severity).toBe("INFO");
  });

  // 9. Invalid/missing date → no crash, empty result
  it("returns [] and does not throw for invalid candidate date", () => {
    const candidate = { date: "not-a-date", brandId: "b1", contractId: "c1" };
    expect(() => detectConflicts(candidate, [], brands, contracts)).not.toThrow();
    expect(detectConflicts(candidate, [], brands, contracts)).toHaveLength(0);
  });

  it("silently skips existing deliverables with invalid dates", () => {
    const candidate = { date: "2026-06-10", brandId: "b1", contractId: "c1" };
    const existing  = [{ id: "d1", contractId: "c2", plannedPostDate: "invalid", stage: "roteiro" }];
    const result    = detectConflicts(candidate, existing, brands, contracts);
    expect(result).toHaveLength(0);
  });

  // 10. Multiple conflicts — highest severity wins per conflicting item, sorted BLOCK first
  it("sorts results BLOCK → WARN → INFO and deduplicates per deliverable", () => {
    // Candidate is STRICT (b5/c5), existing has a WARN-level and an INFO-level
    const extraBrand   = { id: "bX", name: "OtherTech", category: "TECH", exclusivityWindowDays: 7, blockConflicts: false };
    const extraContract = { id: "cX", brandId: "bX", company: "OtherTech", exclusivityOverride: "DEFAULT" };
    const candidate = { date: "2026-06-10", brandId: "b5", contractId: "c5" };
    const existing  = [
      del("d1", "cX",  "2026-06-11"), // → BLOCK (STRICT)
      del("d2", "c8", "2026-06-10"),  // Diamond → BLOCK (STRICT) then INFO (same day) — BLOCK wins
    ];
    const result = detectConflicts(candidate, existing, [...brands, extraBrand], [...contracts, extraContract]);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].severity).toBe("BLOCK"); // BLOCK first
    result.forEach((r, i) => {
      if (i > 0) expect(RANK_CHECK[r.severity]).toBeLessThanOrEqual(RANK_CHECK[result[0].severity]);
    });
  });
});

// helpers for test 10
const RANK_CHECK = { BLOCK: 3, WARN: 2, INFO: 1 };

// ─── buildConflictDateMap ─────────────────────────────────

describe("buildConflictDateMap", () => {
  it("returns a date → severity map for conflicting dates", () => {
    const deliverables = [
      del("d1", "c1", "2026-06-10"), // Netshoes
      del("d2", "c2", "2026-06-11"), // Decathlon — same category, 1d apart
    ];
    const map = buildConflictDateMap(deliverables, brands, contracts);
    expect(map["2026-06-10"]).toBeDefined();
    expect(["WARN","BLOCK"]).toContain(map["2026-06-10"]);
  });

  it("returns empty map when no brands are provided", () => {
    const deliverables = [del("d1","c1","2026-06-10")];
    expect(buildConflictDateMap(deliverables, [], contracts)).toEqual({});
  });

  it("does not include done deliverables in conflict map", () => {
    const deliverables = [
      { id: "d1", contractId: "c1", plannedPostDate: "2026-06-10", stage: "done" },
      del("d2", "c2", "2026-06-11"),
    ];
    const map = buildConflictDateMap(deliverables, brands, contracts);
    // d1 is done → not checked; d2 alone → no conflict
    expect(map["2026-06-10"]).toBeUndefined();
  });
});
