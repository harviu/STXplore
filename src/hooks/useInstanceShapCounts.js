import { useEffect, useState, useMemo } from "react";
import { api } from "../lib/api.js";

/**
 * Fetches SHAP values for a target community and aggregates them per source community
 * for use as instance-level map counts.
 * shap_values shape: (90 history days, 77 communities)
 * We sum abs SHAP across history days per community to get a single attribution weight per community.
 */
export function useInstanceShapCounts(activeMode, instanceSelectedId, model, forecastAnchorDate, horizon, pastStart = 0, pastEnd = 90) {
  const [counts, setCounts] = useState(null);
  const [matrix, setMatrix] = useState(null); // raw (77x90) for cluster heatmap
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (activeMode !== "instance" || !instanceSelectedId || !forecastAnchorDate || !horizon) {
      setCounts(null);
      setLoading(false);
      setError(null);
      setMatrix(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    api.predictionInstanceShap(
      forecastAnchorDate,
      model,
      horizon,
      Number(instanceSelectedId),
      { signal: ac.signal }
    ).then((data) => {
      if (cancelled) return;
      if (!data?.shap_values) {
        setCounts(null);
        setLoading(false);
        return;
      }

      // Slice to the past window the slider controls
      const windowedShap = data.shap_values.slice(pastStart, pastEnd);
      // Build 77xdays matrix for cluster heatmap
      const rawMatrix = [];
      for (let c = 0; c < 77; c++) {
        rawMatrix.push(windowedShap.map(row => row.values[c] ?? 0));
      }
      setMatrix(rawMatrix);
      // Sum absolute SHAP values across the windowed history days per community
      const perCommunity = new Array(77).fill(0);
      for (const row of windowedShap) {
        row.values.forEach((v, i) => {
          perCommunity[i] += v;
        });
      }
      // Convert to { "1": val, "2": val, ... } keyed by 1-based community id
      const result = {};
      perCommunity.forEach((v, i) => { result[String(i + 1)] = v; });
      setCounts(result);
      setLoading(false);
    }).catch((err) => {
      if (err?.name === "AbortError") return;
      if (cancelled) return;
      console.error("instanceShap failed:", err);
      setError(String(err?.message ?? err));
      setCounts(null);
      setLoading(false);
    });

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [activeMode, instanceSelectedId, model, forecastAnchorDate, horizon, pastStart, pastEnd]);

  return { counts, loading, error, matrix};
}