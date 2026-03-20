/** @param {Date} d */
export function toYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function addDaysISO(iso, days) {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toYYYYMMDD(d);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

/** Inclusive of start, exclusive of end (each day as YYYY-MM-DD). */
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

export function sourceRange(pastDays, anchorISO) {
  const start = addDaysISO(anchorISO, -pastDays);
  const end = anchorISO;
  return { start, end };
}

export function targetRange(futureDays, anchorISO) {
  const start = anchorISO;
  const end = addDaysISO(anchorISO, futureDays);
  return { start, end };
}
