/**
 * src/lib/__tests__/period.test.js
 *
 * Unit tests for src/lib/period.js
 * Run: npx vitest run src/lib/__tests__/period.test.js
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  periodForPreset,
  defaultPeriod,
  shiftPeriod,
  canNavigate,
  periodLabel,
  periodDays,
  serializePeriod,
  parsePeriod,
  monthInPeriod,
  firstDayOfMonth,
  lastDayOfMonth,
  firstDayOfQuarter,
  lastDayOfQuarter,
  firstDayOfYear,
  lastDayOfYear,
  todayIso,
  parseLocal,
} from "../period.js";

// ── Test date anchor: 11/05/2026 ──────────────────────────
const ANCHOR = new Date(2026, 4, 11); // May 11, 2026

// ── Boundary helpers ──────────────────────────────────────
describe("boundary helpers", () => {
  it("firstDayOfMonth(May 2026)", () => {
    expect(firstDayOfMonth(ANCHOR)).toBe("2026-05-01");
  });

  it("lastDayOfMonth(May 2026)", () => {
    expect(lastDayOfMonth(ANCHOR)).toBe("2026-05-31");
  });

  it("lastDayOfMonth — February non-leap (2025)", () => {
    expect(lastDayOfMonth(new Date(2025, 1, 1))).toBe("2025-02-28");
  });

  it("lastDayOfMonth — February leap (2024)", () => {
    expect(lastDayOfMonth(new Date(2024, 1, 1))).toBe("2024-02-29");
  });

  it("firstDayOfQuarter — Q2 (May 2026)", () => {
    expect(firstDayOfQuarter(ANCHOR)).toBe("2026-04-01");
  });

  it("lastDayOfQuarter — Q2 (May 2026)", () => {
    expect(lastDayOfQuarter(ANCHOR)).toBe("2026-06-30");
  });

  it("firstDayOfQuarter — Q1 (Jan 2026)", () => {
    expect(firstDayOfQuarter(new Date(2026, 0, 1))).toBe("2026-01-01");
  });

  it("lastDayOfQuarter — Q4 (Nov 2026)", () => {
    expect(lastDayOfQuarter(new Date(2026, 10, 1))).toBe("2026-12-31");
  });

  it("firstDayOfYear", () => {
    expect(firstDayOfYear(2026)).toBe("2026-01-01");
  });

  it("lastDayOfYear", () => {
    expect(lastDayOfYear(2026)).toBe("2026-12-31");
  });
});

// ── periodForPreset ───────────────────────────────────────
describe("periodForPreset", () => {
  it("month — 11/05/2026", () => {
    const p = periodForPreset("month", ANCHOR);
    expect(p.presetId).toBe("month");
    expect(p.from).toBe("2026-05-01");
    expect(p.to).toBe("2026-05-31");
  });

  it("prev_month — 11/05/2026 → April 2026", () => {
    const p = periodForPreset("prev_month", ANCHOR);
    expect(p.presetId).toBe("prev_month");
    expect(p.from).toBe("2026-04-01");
    expect(p.to).toBe("2026-04-30");
  });

  it("quarter — Q2 2026", () => {
    const p = periodForPreset("quarter", ANCHOR);
    expect(p.from).toBe("2026-04-01");
    expect(p.to).toBe("2026-06-30");
  });

  it("fiscal_year — 2026", () => {
    const p = periodForPreset("fiscal_year", ANCHOR);
    expect(p.from).toBe("2026-01-01");
    expect(p.to).toBe("2026-12-31");
  });

  it("last_30d — includes today (29 days back + today)", () => {
    // Mock today
    vi.setSystemTime(ANCHOR);
    const p = periodForPreset("last_30d");
    expect(p.from).toBe("2026-04-12"); // May 11 - 29 days = Apr 12
    expect(p.to).toBe("2026-05-11");
    vi.useRealTimers();
  });

  it("last_30d — does NOT skip February (leap year 2024)", () => {
    // Feb 29, 2024 → last_30d should go back to Jan 31
    vi.setSystemTime(new Date(2024, 1, 29)); // Feb 29, 2024 (leap)
    const p = periodForPreset("last_30d");
    expect(p.from).toBe("2024-01-31");
    expect(p.to).toBe("2024-02-29");
    vi.useRealTimers();
  });

  it("ytd — Jan 1 of this year to today", () => {
    vi.setSystemTime(ANCHOR);
    const p = periodForPreset("ytd");
    const year = new Date().getFullYear();
    expect(p.from).toBe(`${year}-01-01`);
    expect(p.to).toBe("2026-05-11");
    vi.useRealTimers();
  });
});

// ── shiftPeriod ───────────────────────────────────────────
describe("shiftPeriod", () => {
  it("month +1 (May → June)", () => {
    const p = periodForPreset("month", ANCHOR);
    const next = shiftPeriod(p, +1);
    expect(next.from).toBe("2026-06-01");
    expect(next.to).toBe("2026-06-30");
  });

  it("month -1 (May → April)", () => {
    const p = periodForPreset("month", ANCHOR);
    const prev = shiftPeriod(p, -1);
    expect(prev.from).toBe("2026-04-01");
    expect(prev.to).toBe("2026-04-30");
  });

  it("month -1 across year boundary (Jan → Dec)", () => {
    const jan = periodForPreset("month", new Date(2026, 0, 15));
    const dec = shiftPeriod(jan, -1);
    expect(dec.from).toBe("2025-12-01");
    expect(dec.to).toBe("2025-12-31");
  });

  it("quarter +1 (Q2 → Q3)", () => {
    const p = periodForPreset("quarter", ANCHOR);
    const next = shiftPeriod(p, +1);
    expect(next.from).toBe("2026-07-01");
    expect(next.to).toBe("2026-09-30");
  });

  it("quarter -1 (Q2 → Q1)", () => {
    const p = periodForPreset("quarter", ANCHOR);
    const prev = shiftPeriod(p, -1);
    expect(prev.from).toBe("2026-01-01");
    expect(prev.to).toBe("2026-03-31");
  });

  it("fiscal_year +1 (2026 → 2027)", () => {
    const p = periodForPreset("fiscal_year", ANCHOR);
    const next = shiftPeriod(p, +1);
    expect(next.from).toBe("2027-01-01");
    expect(next.to).toBe("2027-12-31");
  });

  it("last_30d is NOT navigable — returns unchanged", () => {
    const p = periodForPreset("last_30d");
    const shifted = shiftPeriod(p, +1);
    expect(shifted).toBe(p); // same reference
  });

  it("custom is NOT navigable — returns unchanged", () => {
    const p = { presetId: "custom", from: "2026-03-01", to: "2026-04-15" };
    expect(shiftPeriod(p, -1)).toBe(p);
  });
});

// ── canNavigate ───────────────────────────────────────────
describe("canNavigate", () => {
  it.each([
    ["month",       true],
    ["prev_month",  true],
    ["quarter",     true],
    ["fiscal_year", true],
    ["last_30d",    false],
    ["last_90d",    false],
    ["ytd",         false],
    ["custom",      false],
  ])("%s → %s", (id, expected) => {
    expect(canNavigate(id)).toBe(expected);
  });
});

// ── periodLabel ───────────────────────────────────────────
describe("periodLabel", () => {
  it("month — May 2026", () => {
    const p = periodForPreset("month", ANCHOR);
    expect(periodLabel(p)).toBe("Maio 2026");
  });

  it("quarter — Q2 2026", () => {
    const p = periodForPreset("quarter", ANCHOR);
    expect(periodLabel(p)).toContain("T2 2026");
    expect(periodLabel(p)).toContain("Abr");
    expect(periodLabel(p)).toContain("Jun");
  });

  it("fiscal_year — 2026", () => {
    expect(periodLabel(periodForPreset("fiscal_year", ANCHOR))).toBe("Ano fiscal 2026");
  });

  it("last_30d — includes date range", () => {
    vi.setSystemTime(ANCHOR);
    const label = periodLabel(periodForPreset("last_30d"));
    expect(label).toContain("30 dias");
    vi.useRealTimers();
  });

  it("custom — shows BR dates", () => {
    const p = { presetId: "custom", from: "2026-03-01", to: "2026-04-15" };
    expect(periodLabel(p)).toBe("01/03/2026 → 15/04/2026");
  });
});

// ── periodDays ────────────────────────────────────────────
describe("periodDays", () => {
  it("single day → 1", () => {
    expect(periodDays({ from: "2026-05-11", to: "2026-05-11" })).toBe(1);
  });

  it("May 2026 → 31 days", () => {
    expect(periodDays({ from: "2026-05-01", to: "2026-05-31" })).toBe(31);
  });

  it("Feb 2024 leap → 29 days", () => {
    expect(periodDays({ from: "2024-02-01", to: "2024-02-29" })).toBe(29);
  });
});

// ── monthInPeriod ─────────────────────────────────────────
describe("monthInPeriod", () => {
  it("May 2026 period contains month index 4 (May)", () => {
    const p = periodForPreset("month", ANCHOR);
    expect(monthInPeriod(p, 2026, 4)).toBe(true);
  });

  it("May 2026 period does not contain April (3)", () => {
    const p = periodForPreset("month", ANCHOR);
    expect(monthInPeriod(p, 2026, 3)).toBe(false);
  });

  it("Q2 period contains Apr(3), May(4), Jun(5)", () => {
    const p = periodForPreset("quarter", ANCHOR);
    expect(monthInPeriod(p, 2026, 3)).toBe(true);
    expect(monthInPeriod(p, 2026, 4)).toBe(true);
    expect(monthInPeriod(p, 2026, 5)).toBe(true);
    expect(monthInPeriod(p, 2026, 6)).toBe(false);
  });

  it("custom spanning two months", () => {
    const p = { presetId: "custom", from: "2026-04-20", to: "2026-05-10" };
    expect(monthInPeriod(p, 2026, 3)).toBe(true); // April
    expect(monthInPeriod(p, 2026, 4)).toBe(true); // May
    expect(monthInPeriod(p, 2026, 2)).toBe(false); // March
  });
});

// ── serialize/parse round-trip ────────────────────────────
describe("serialize/parse round-trip", () => {
  const cases = [
    { presetId: "month",       anchor: ANCHOR,               expected: "2026-05" },
    { presetId: "prev_month",  anchor: ANCHOR,               expected: "prev:2026-04" },
    { presetId: "quarter",     anchor: ANCHOR,               expected: "quarter:2026-2" },
    { presetId: "fiscal_year", anchor: ANCHOR,               expected: "fiscal:2026" },
    { presetId: "last_30d",    anchor: null,                 expected: "last_30d" },
    { presetId: "last_90d",    anchor: null,                 expected: "last_90d" },
    { presetId: "ytd",         anchor: null,                 expected: "ytd" },
    { presetId: "custom",      custom: { from:"2026-03-01", to:"2026-04-15" }, expected: "custom:2026-03-01_2026-04-15" },
  ];

  it.each(cases)("$presetId serializes to $expected", ({ presetId, anchor, custom, expected }) => {
    const p = custom
      ? { presetId: "custom", ...custom }
      : periodForPreset(presetId, anchor ?? ANCHOR);
    expect(serializePeriod(p)).toBe(expected);
  });

  it.each(cases)("$expected parses back correctly", ({ presetId, expected }) => {
    const parsed = parsePeriod(expected);
    expect(parsed).not.toBeNull();
    expect(parsed.presetId).toBe(presetId === "prev_month" ? "prev_month" : presetId);
    expect(parsed.from).toBeTruthy();
    expect(parsed.to).toBeTruthy();
    expect(parsed.from <= parsed.to).toBe(true);
  });

  it("invalid YYYY-13 → null", () => {
    expect(parsePeriod("2026-13")).toBeNull();
  });

  it("invalid custom from > to → null", () => {
    expect(parsePeriod("custom:2026-05-31_2026-01-01")).toBeNull();
  });

  it("empty string → null", () => {
    expect(parsePeriod("")).toBeNull();
    expect(parsePeriod(null)).toBeNull();
  });

  it("unknown string → null", () => {
    expect(parsePeriod("last_7d")).toBeNull();
  });
});
