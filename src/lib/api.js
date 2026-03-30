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

  mapCountsPivot: (start, end, opts) =>
    request(
      `/api/map/counts/pivot?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
      opts
    ),

  predictionAnchorBounds: (opts) => request("/api/predictions/anchor-bounds", opts),

  predictionByDate: (date, model, opts) =>
    request(
      `/api/predictions/by-date?date=${encodeURIComponent(date)}&model=${encodeURIComponent(
        model
      )}`,
      opts
    ),

  predictionInstanceShap: (date, model, horizon, targetCommunity, opts = {}) => {
    const params = new URLSearchParams();
    params.append("date", String(date));
    params.append("model", String(model));
    params.append("horizon", String(horizon));
    params.append("target_community", String(targetCommunity));
    return request(`/api/predictions/instance-shap?${params.toString()}`, opts);
  },

  mapPredictions: (layer, date, model, opts) =>
    request(
      `/api/map/predictions?layer=${encodeURIComponent(layer)}&date=${encodeURIComponent(
        date
      )}&model=${encodeURIComponent(model)}`,
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

  instanceLevelRelation: (sourceIdx, pastDays, futureStart, futureEnd, opts) =>
    request(
      `/api/instance_level_relation?source=${encodeURIComponent(sourceIdx)}&past_days=${encodeURIComponent(pastDays)}&future_days=${encodeURIComponent(futureEnd)}&future_start=${encodeURIComponent(futureStart)}`,
      opts
    ),

  instanceLevelSource: (_pastDays, _futureStart, _futureEnd, _opts) => Promise.resolve({ data: [] }),

  get4dData: (d1, b1, d2, d3, b3, d4, opts = {}) => {
    const { signal, d3Start, ...rest } = opts;
    const params = new URLSearchParams();
    if (d1 !== null && d1 !== undefined) params.append("d1", d1);
    if (b1 !== null && b1 !== undefined) params.append("b1", b1);
    if (d2 !== null && d2 !== undefined) params.append("d2", d2);
    if (d3 !== null && d3 !== undefined) params.append("d3", d3);
    if (b3 !== null && b3 !== undefined) params.append("b3", b3);
    if (d4 !== null && d4 !== undefined) params.append("d4", d4);
    if (d3Start != null) params.append("d3_start", d3Start);
    return request(`/api/data4d?${params.toString()}`, { signal, ...rest });
  },
    
};
