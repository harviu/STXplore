import { isoRangeDays } from "./dates.js";

/**Fills in missing daily counts between start and end dates.
 * 
 * @param {string} start YYYY-MM-DD
 * @param {string} end YYYY-MM-DD
 * @param {{ date: string, count: number }[] | null | undefined} rows
 */
export function fillDaily(start, end, rows) {
  const by = new Map((rows ?? []).map((r) => [r.date, Number(r.count) || 0]));
  const dates = isoRangeDays(start, end);
  return dates.map((dt) => ({ date: dt, count: by.get(dt) ?? 0 }));
}

/** Backend shape: { data: [{ feature_id, count }, ...] } → id → count */
export function responseToCounts(resp) {
  const rows = resp?.data ?? [];
  const out = {};
  for (const r of rows) {
    if (r?.feature_id == null) continue;
    out[String(r.feature_id)] = Number(r.count) || 0;
  }
  return out;
}