/** 
 * Converts a Date object to a YYYY-MM-DD string.
 * @param {Date} d
 * @returns {string}
 */
export function toYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Adds a specified number of days to an ISO date string.
 * @param {string} iso - an ISO date string
 * @param {number} days - the number of days to add
 * @returns {string}
 */
export function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toYYYYMMDD(d);
}

/**
 * Calls the default date constructor and formats it
 * @returns {string}
 */
export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Creates an array of ISO date strings for each day in the range.
 * Inclusive of start, exclusive of end (each day as YYYY-MM-DD).
 * @param {string} startISO - the start date as an ISO string
 * @param {string} endISO - the end date as an ISO string
 * @returns {string[]}
 */
export function isoRangeDays(startISO, endISO) {
  const out = [];
  const d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d < end) {
    out.push(toYYYYMMDD(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 * Convert a half-open history-lag slice to calendar dates.
 * Lag 0 is the anchor itself, so [0, 90) maps to [D-89, D+1):
 * model history D-89 through D, inclusive.
 */
export function sourceRange(pastStartOffset, pastEndOffset, anchorISO) {
  if (!Number.isFinite(pastStartOffset) || !Number.isFinite(pastEndOffset) || !anchorISO) {
    return { start: null, end: null };
  }
  const start = addDaysISO(anchorISO, -(pastEndOffset - 1));
  const end = addDaysISO(anchorISO, 1 - pastStartOffset);
  return { start, end };
}

/**
 * Convert a half-open forecast-index slice to calendar dates.
 * Forecast index 0 is D+1, so [0, 30) maps to [D+1, D+31):
 * prediction days D+1 through D+30, inclusive.
 */
export function targetRange(futureStartOffset, futureEndOffset, anchorISO) {
  if (!Number.isFinite(futureStartOffset) || !Number.isFinite(futureEndOffset) || !anchorISO) {
    return { start: null, end: null };
  }
  const start = addDaysISO(anchorISO, futureStartOffset + 1);
  const end = addDaysISO(anchorISO, futureEndOffset + 1);
  return { start, end };
}
/**
 * Clamp a calendar day (YYYY-MM-DD) to [minIso, maxIso] inclusive.
 * @param {string} iso
 * @param {string} minIso
 * @param {string} maxIso
 * @returns {string}
 */
export function clampDateIso(iso, minIso, maxIso) {
  const d = iso?.slice(0, 10) ?? "";
  if (!d || !minIso || !maxIso) return d;
  if (d < minIso) return minIso;
  if (d > maxIso) return maxIso;
  return d;
}
