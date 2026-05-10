/**
 * src/lib/dates.js
 * Pure date utilities used by the Dashboard.
 * No external dependencies — all standard JS.
 * ISO week starts on Monday (locale BR standard).
 */

/** @param {Date} date @returns {Date} Monday 00:00:00 of the same week */
export function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 1=Mon … 6=Sat
  const diff = day === 0 ? -6 : 1 - day; // step back to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** @param {Date} date @returns {Date} Sunday 23:59:59 of the same week */
export function endOfWeek(date) {
  const start = startOfWeek(date);
  const end   = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Returns an array of 7 Date objects [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
 * for the ISO week that contains `today`.
 * @param {Date} today
 * @returns {Date[]}
 */
export function weekDays(today = new Date()) {
  const start = startOfWeek(today);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

/**
 * "YYYY-MM-DD" from a Date object.
 * @param {Date} date
 * @returns {string}
 */
export function toDateStr(date) {
  return date.toISOString().substr(0, 10);
}

/**
 * Number of calendar days from `today` to the date represented by `dateStr`.
 * Positive = future, negative = past, 0 = today.
 * Returns null for invalid/empty input.
 * @param {Date}   today
 * @param {string} dateStr  "YYYY-MM-DD"
 * @returns {number|null}
 */
export function daysBetween(today, dateStr) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return null;
    const t = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    return Math.round((d - t) / 86400000);
  } catch { return null; }
}

/**
 * True when the date represented by `dateStr` falls within the ISO week
 * that contains `today`.  Invalid dates silently return false.
 * @param {string} dateStr  "YYYY-MM-DD"
 * @param {Date}   today
 * @returns {boolean}
 */
export function isInCurrentWeek(dateStr, today = new Date()) {
  if (!dateStr) return false;
  try {
    const d = new Date(dateStr + "T12:00:00");
    if (isNaN(d.getTime())) return false;
    return d >= startOfWeek(today) && d <= endOfWeek(today);
  } catch { return false; }
}

// ─── Formatting helpers ────────────────────────────────────

const PT_DAYS_LONG  = ["Domingo","Segunda-feira","Terça-feira","Quarta-feira","Quinta-feira","Sexta-feira","Sábado"];
const PT_DAYS_SHORT = ["Dom","Seg","Ter","Qua","Qui","Sex","Sáb"];
const PT_MONTHS     = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];

/**
 * "Sábado, 9 de maio"
 * @param {Date} date
 */
export function fmtDayLong(date) {
  return `${PT_DAYS_LONG[date.getDay()]}, ${date.getDate()} de ${PT_MONTHS[date.getMonth()]}`;
}

/**
 * "SEG" / "TER" / "SÁB" …
 * @param {Date} date
 */
export function fmtDayShort(date) {
  return PT_DAYS_SHORT[date.getDay()].toUpperCase();
}

/**
 * "04/05"
 * @param {Date} date
 */
export function fmtDayMonth(date) {
  return `${String(date.getDate()).padStart(2, "0")}/${String(date.getMonth() + 1).padStart(2, "0")}`;
}

/** Day-of-week index relative to Monday: Mon=0 … Sun=6 */
export function dayIndex(date) {
  return (date.getDay() + 6) % 7;
}
