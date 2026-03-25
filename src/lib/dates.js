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
export function sourceRange(pastDays, anchorISO) {
  const start = addDaysISO(anchorISO, -pastDays);
  const end = anchorISO;
  return { start, end };
}

/**
 * Creates a date range from after the included date.
 * @param {number} futureDays - the number of days in the future
 * @param {string} anchorISO - the anchor date as an ISO string
 * @returns {Object} - an object with start and end dates
 */
export function targetRange(futureDays, anchorISO) {
  const start = anchorISO;
  const end = addDaysISO(anchorISO, futureDays);
  return { start, end };
}
