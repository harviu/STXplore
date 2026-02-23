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
};
