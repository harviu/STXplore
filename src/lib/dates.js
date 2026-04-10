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
 * Creates a date range from before the included date.
 * @param {number} pastDays - the number of days in the past
 * @param {string} anchorISO - the anchor date as an ISO string
 * @returns {Object} - an object with start and end dates
 */
export function sourceRange(pastStartOffset, pastEndOffset, anchorISO) {
  const start = addDaysISO(anchorISO, -pastEndOffset);
  const end = addDaysISO(anchorISO, -pastStartOffset);
  return { start, end };
}

/**
 * Creates a date range after the anchor: [anchor + startOffset, anchor + endOffset) in calendar-day steps.
 * @param {number} futureStartOffset - days after anchor where the window starts (≥ 0)
 * @param {number} futureEndOffset - days after anchor where the window ends (exclusive end date via addDays)
 * @param {string} anchorISO - the anchor date as an ISO string
 * @returns {{ start: string, end: string }}
 */
export function targetRange(futureStartOffset, futureEndOffset, anchorISO) {
  const start = addDaysISO(anchorISO, futureStartOffset);
  const end = addDaysISO(anchorISO, futureEndOffset);
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
