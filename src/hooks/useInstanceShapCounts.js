import { useEffect, useState } from "react";
import { api } from "../lib/api.js";

/**
 * Fetches the first-stage SHAP explanation for a prediction target. Each feature
 * is one source community's complete 90-day history, so the result maps directly
 * to the 77 source-map communities without calculating daily attributions.
 */
export function useInstanceShapCounts(activeMode, targetCommunityId, model, forecastAnchorDate, horizonStart, horizonEnd) {
  const [counts, setCounts] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (activeMode !== "instance" || !targetCommunityId || !forecastAnchorDate || !horizonStart || !horizonEnd) {
      setCounts(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const ac = new AbortController();
    setLoading(true);
    setError(null);

    api.predictionInstanceShap(
      forecastAnchorDate,
      model,
      null,
      Number(targetCommunityId),
      {
        explanationLevel: "community",
        horizonStart,
        horizonEnd,
        signal: ac.signal,
      }
    ).then((data) => {
      if (cancelled) return;
      if (!Array.isArray(data?.community_values)) {
        setCounts(null);
        setLoading(false);
        return;
      }
      const result = {};
      for (const item of data.community_values) {
        result[String(item.community_id)] = Number(item.value ?? 0);
      }
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
  }, [activeMode, targetCommunityId, model, forecastAnchorDate, horizonStart, horizonEnd]);

  return { counts, loading, error };
}
