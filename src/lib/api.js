const BASE = ""; // Vite proxy handles /api -> backend

export async function request(path, { signal, method = "GET", body, headers } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(headers ?? {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${method} ${path}: ${text}`);
  }

  return res.json();
}

export const api = {
  health: (opts) => request("/api/health", opts),

  dateRange: (opts) => request("/api/date-range", opts),

  selectionSummary: (layer, id, start, end, opts) =>
    request(
      `/api/selection-summary?layer=${encodeURIComponent(layer)}&id=${encodeURIComponent(
        id
      )}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      opts
    ),
  
  mapTotals: (layer, start, end, opts) =>
    request(
      `/api/map/totals?layer=${encodeURIComponent(layer)}&start=${encodeURIComponent(
        start
      )}&end=${encodeURIComponent(end)}`,
      opts
    ),

  mapPredictions: (layer, start, end, opts) =>
    request(
      `/api/map/predictions?layer=${encodeURIComponent(layer)}&start=${encodeURIComponent(
        start
      )}&end=${encodeURIComponent(end)}`,
      opts
    ),

  selectionDaily: (layer, id, start, end, opts) =>
    request(
      `/api/selection-daily?layer=${encodeURIComponent(layer)}&id=${encodeURIComponent(
        id
      )}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      opts
    ),

  selectionAllDaily: (layer, start, end, opts) =>
    request(
      `/api/selection-all-daily?layer=${encodeURIComponent(layer)}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      opts
    ),

  relationalModel: (source, opts) =>
    request(`/api/model_level_relation?source=${encodeURIComponent(source)}`, opts),

  instanceLevelRelation: (sourceIdx, pastDays, futureDays, opts) =>
    request (
      `/api/instance_level_relation?source=${encodeURIComponent(sourceIdx)}&past_days=${encodeURIComponent(pastDays)}&future_days=${encodeURIComponent(futureDays)}`,
      opts
    ),

  get4dData: (d1, d2, d3, d4, opts) => {
    const params = new URLSearchParams();
    if (d1 !== null && d1 !== undefined) params.append("d1", d1);
    if (d2 !== null && d2 !== undefined) params.append("d2", d2);
    if (d3 !== null && d3 !== undefined) params.append("d3", d3);
    if (d4 !== null && d4 !== undefined) params.append("d4", d4);
    return request(`/api/data4d?${params.toString()}`, opts);
  }
    
};
