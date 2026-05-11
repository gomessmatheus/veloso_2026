/**
 * src/lib/period.js
 *
 * Helpers para o sistema de Período do Controle Financeiro.
 * Sem dependências externas — usa apenas APIs nativas do browser/Node.
 *
 * Exports:
 *   defaultPeriod()
 *   periodForPreset(presetId, anchor?)
 *   shiftPeriod(period, direction)
 *   canNavigate(presetId)
 *   periodLabel(period)          → rótulo legível
 *   periodDays(period)           → nº de dias
 *   serializePeriod(period)      → string para URL
 *   parsePeriod(str)             → Period | null
 */

// ── Constants ─────────────────────────────────────────────
const MONTHS_LONG = [
  "Janeiro","Fevereiro","Março","Abril","Maio","Junho",
  "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro",
];
const MONTHS_SHORT = [
  "Jan","Fev","Mar","Abr","Mai","Jun",
  "Jul","Ago","Set","Out","Nov","Dez",
];

// ── Low-level date utilities ──────────────────────────────

/** Zero-pad number */
function pad(n) { return String(n).padStart(2, "0"); }

/** Build ISO YYYY-MM-DD (local, no UTC shift) */
function iso(y, m, d) { return `${y}-${pad(m)}-${pad(d)}`; }

/** Parse ISO date as LOCAL Date (avoids UTC shift) */
export function parseLocal(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Today's ISO date in local time */
export function todayIso() {
  const t = new Date();
  return iso(t.getFullYear(), t.getMonth() + 1, t.getDate());
}

/** Add n days to an ISO string */
function addDays(isoStr, n) {
  const d = parseLocal(isoStr);
  d.setDate(d.getDate() + n);
  return iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

// ── Month/quarter/year boundaries ─────────────────────────

export function firstDayOfMonth(date = new Date()) {
  return iso(date.getFullYear(), date.getMonth() + 1, 1);
}

export function lastDayOfMonth(date = new Date()) {
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return iso(last.getFullYear(), last.getMonth() + 1, last.getDate());
}

export function firstDayOfQuarter(date = new Date()) {
  const q = Math.floor(date.getMonth() / 3);
  return iso(date.getFullYear(), q * 3 + 1, 1);
}

export function lastDayOfQuarter(date = new Date()) {
  const q = Math.floor(date.getMonth() / 3);
  const last = new Date(date.getFullYear(), q * 3 + 3, 0);
  return iso(last.getFullYear(), last.getMonth() + 1, last.getDate());
}

export function firstDayOfYear(year) { return iso(year, 1, 1); }
export function lastDayOfYear(year)  { return iso(year, 12, 31); }

// ── Core period functions ─────────────────────────────────

/**
 * Build a Period object for the given presetId.
 * `anchor` is the reference Date (default: today).
 */
export function periodForPreset(presetId, anchor = new Date()) {
  const today = todayIso();

  switch (presetId) {
    case "month":
      return { presetId: "month",       from: firstDayOfMonth(anchor),    to: lastDayOfMonth(anchor) };

    case "prev_month": {
      const prev = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
      return { presetId: "prev_month",  from: firstDayOfMonth(prev),      to: lastDayOfMonth(prev) };
    }

    case "last_30d":
      return { presetId: "last_30d",    from: addDays(today, -29),        to: today };

    case "last_90d":
      return { presetId: "last_90d",    from: addDays(today, -89),        to: today };

    case "quarter":
      return { presetId: "quarter",     from: firstDayOfQuarter(anchor),  to: lastDayOfQuarter(anchor) };

    case "ytd":
      return { presetId: "ytd",         from: firstDayOfYear(new Date().getFullYear()), to: today };

    case "fiscal_year":
      return {
        presetId: "fiscal_year",
        from: firstDayOfYear(anchor.getFullYear()),
        to:   lastDayOfYear(anchor.getFullYear()),
      };

    default:
      return defaultPeriod();
  }
}

/** Default period = current month */
export function defaultPeriod() {
  return periodForPreset("month", new Date());
}

/**
 * Shift a navigable period by `direction` (+1 / -1).
 * Non-navigable presets (relative/custom) are returned unchanged.
 */
export function shiftPeriod(period, direction) {
  const { presetId, from } = period;

  switch (presetId) {
    case "month":
    case "prev_month": {
      const d = parseLocal(from);
      const next = new Date(d.getFullYear(), d.getMonth() + direction, 1);
      return { presetId: "month", from: firstDayOfMonth(next), to: lastDayOfMonth(next) };
    }

    case "quarter": {
      const d = parseLocal(from);
      const next = new Date(d.getFullYear(), d.getMonth() + direction * 3, 1);
      return { presetId: "quarter", from: firstDayOfQuarter(next), to: lastDayOfQuarter(next) };
    }

    case "fiscal_year": {
      const d    = parseLocal(from);
      const year = d.getFullYear() + direction;
      return { presetId: "fiscal_year", from: firstDayOfYear(year), to: lastDayOfYear(year) };
    }

    default:
      return period; // relative/custom — unchanged
  }
}

/**
 * Returns true if the preset supports ‹ › step navigation.
 */
export function canNavigate(presetId) {
  return ["month", "prev_month", "quarter", "fiscal_year"].includes(presetId);
}

/**
 * Human-readable label for a period.
 */
export function periodLabel(period) {
  const { presetId, from, to } = period;

  switch (presetId) {
    case "month":
    case "prev_month": {
      const d = parseLocal(from);
      return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
    }

    case "quarter": {
      const d  = parseLocal(from);
      const q  = Math.floor(d.getMonth() / 3) + 1;
      const m0 = MONTHS_SHORT[d.getMonth()];
      const m2 = MONTHS_SHORT[d.getMonth() + 2];
      return `T${q} ${d.getFullYear()} (${m0}–${m2})`;
    }

    case "fiscal_year": {
      const d = parseLocal(from);
      return `Ano fiscal ${d.getFullYear()}`;
    }

    case "ytd":
      return `Ano até hoje · até ${_fmtShort(to)}`;

    case "last_30d":
      return `Últimos 30 dias · ${_fmtShort(from)}–${_fmtShort(to)}`;

    case "last_90d":
      return `Últimos 90 dias · ${_fmtShort(from)}–${_fmtShort(to)}`;

    case "custom":
      return `${_fmtBR(from)} → ${_fmtBR(to)}`;

    default:
      return `${from} → ${to}`;
  }
}

/** Days spanned by the period (inclusive) */
export function periodDays(period) {
  const a = parseLocal(period.from);
  const b = parseLocal(period.to);
  return Math.round((b - a) / 86_400_000) + 1;
}

/**
 * Check if a given bar-chart month index `mi` (0=Jan) of `year`
 * is fully or partially within the period.
 */
export function monthInPeriod(period, year, mi) {
  const monthStart = iso(year, mi + 1, 1);
  const monthEnd   = lastDayOfMonth(new Date(year, mi, 1));
  return period.to >= monthStart && period.from <= monthEnd;
}

// ── URL serialization ─────────────────────────────────────

/**
 * Serialize period to a compact, human-readable URL token.
 *
 * Examples:
 *   month        → "2026-05"
 *   prev_month   → "prev:2026-04"
 *   quarter      → "quarter:2026-2"
 *   fiscal_year  → "fiscal:2026"
 *   ytd          → "ytd"
 *   last_30d     → "last_30d"
 *   last_90d     → "last_90d"
 *   custom       → "custom:2026-03-01_2026-04-15"
 */
export function serializePeriod(period) {
  const { presetId, from, to } = period;

  switch (presetId) {
    case "month":
      return from.slice(0, 7);                                       // YYYY-MM

    case "prev_month":
      return `prev:${from.slice(0, 7)}`;                            // prev:YYYY-MM

    case "quarter": {
      const d = parseLocal(from);
      const q = Math.floor(d.getMonth() / 3) + 1;
      return `quarter:${d.getFullYear()}-${q}`;                     // quarter:2026-2
    }

    case "fiscal_year": {
      const d = parseLocal(from);
      return `fiscal:${d.getFullYear()}`;                           // fiscal:2026
    }

    case "custom":
      return `custom:${from}_${to}`;                                // custom:YYYY-MM-DD_YYYY-MM-DD

    default:
      return presetId;                                              // ytd | last_30d | last_90d
  }
}

/**
 * Parse a URL token back to a Period object.
 * Returns null on invalid input (caller should fall back to defaultPeriod()).
 */
export function parsePeriod(str) {
  if (!str) return null;

  // YYYY-MM → month
  if (/^\d{4}-\d{2}$/.test(str)) {
    const [y, m] = str.split("-").map(Number);
    if (m < 1 || m > 12) return null;
    const d = new Date(y, m - 1, 1);
    return { presetId: "month", from: firstDayOfMonth(d), to: lastDayOfMonth(d) };
  }

  // prev:YYYY-MM
  const prevM = /^prev:(\d{4})-(\d{2})$/.exec(str);
  if (prevM) {
    const y = Number(prevM[1]), m = Number(prevM[2]);
    if (m < 1 || m > 12) return null;
    const d = new Date(y, m - 1, 1);
    return { presetId: "prev_month", from: firstDayOfMonth(d), to: lastDayOfMonth(d) };
  }

  // quarter:YYYY-Q
  const qM = /^quarter:(\d{4})-([1-4])$/.exec(str);
  if (qM) {
    const year = Number(qM[1]), q = Number(qM[2]);
    const d    = new Date(year, (q - 1) * 3, 1);
    return { presetId: "quarter", from: firstDayOfQuarter(d), to: lastDayOfQuarter(d) };
  }

  // fiscal:YYYY
  const fM = /^fiscal:(\d{4})$/.exec(str);
  if (fM) {
    const year = Number(fM[1]);
    return { presetId: "fiscal_year", from: firstDayOfYear(year), to: lastDayOfYear(year) };
  }

  // custom:YYYY-MM-DD_YYYY-MM-DD
  const cM = /^custom:(\d{4}-\d{2}-\d{2})_(\d{4}-\d{2}-\d{2})$/.exec(str);
  if (cM) {
    if (cM[1] > cM[2]) return null;  // invalid range
    return { presetId: "custom", from: cM[1], to: cM[2] };
  }

  // Relative presets (no anchor needed — always relative to today)
  if (["last_30d", "last_90d", "ytd"].includes(str)) {
    return periodForPreset(str, new Date());
  }

  return null;
}

// ── Private formatters ────────────────────────────────────

function _fmtShort(isoStr) {
  const [, m, d] = isoStr.split("-").map(Number);
  return `${pad(d)}/${pad(m)}`;
}

function _fmtBR(isoStr) {
  const [y, m, d] = isoStr.split("-").map(Number);
  return `${pad(d)}/${pad(m)}/${y}`;
}
