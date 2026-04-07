import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { addDaysISO, sourceRange } from "../lib/dates.js";
import { fillDaily } from "../lib/crimeAggregates.js";

/**
 * Fetches daily series data for each community in selectedCommunities,
 * switching data source based on the active map mode.
 *
 * - Past (source): extracts from heatData directly (no fetch needed)
 * - Instance Level (SHAP): one predictionInstanceShap call, extract column per community
 * - Model Level (SAGE) / Data Level (MI): one get4dData call per community (parallel)
 */
export function useClusterDailySeries({
  mode,
  relationDataMode,
  selectedCommunities,
  heatData,
  targetCommunityId,
  forecastAnchorDate,
  shapHorizon,
  relationModel,
  pastDays,
  futureEnd,
  anchorDate,
  rangeStart,
  rangeEnd,
}) {
  const [communitySeriesList, setCommunitySeriesList] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    console.log("useClusterDailySeries", { mode, targetCommunityId, relationModel, anchorDate, selectedCommunities });
    if (!selectedCommunities || selectedCommunities.length === 0) {
      setCommunitySeriesList([]);
      return;
    }

    // ── Past (source) mode: derive from heatData, no fetch needed ──
    if (mode === "source") {
      if (!heatData || !Array.isArray(heatData)) {
        setCommunitySeriesList([]);
        return;
      }
      const leafIds = selectedCommunities.filter(id => id != null && !String(id).includes("-"));
      const result = leafIds
        .filter(id => id != null)
        .map(id => {
          const rows = heatData
            .filter(d => String(d.id) === String(id))
            .map(d => ({ date: d.date, count: d.count }));
          const series = (rangeStart && rangeEnd)
            ? fillDaily(rangeStart, rangeEnd, rows)
            : rows.sort((a, b) => a.date.localeCompare(b.date));
          return { id, label: `Community ${id}`, series };
        })
        .filter(c => c.series.length > 0);
      setCommunitySeriesList(result);
      return;
    }

    // ── Non-source modes: require targetCommunityId ──
    if (!targetCommunityId || !relationModel || !anchorDate) {
      setCommunitySeriesList([]);
      return;
    }

    const ac = new AbortController();
    setLoading(true);

    // ── Instance Level (SHAP): one call, extract column per community ──
    if (mode === "instance") {
      if (!forecastAnchorDate || !shapHorizon) {
        setCommunitySeriesList([]);
        setLoading(false);
        return;
      }
      api.predictionInstanceShap(
        forecastAnchorDate,
        relationModel,
        shapHorizon,
        Number(targetCommunityId),
        { signal: ac.signal }
      ).then(data => {
        const rows = data?.shap_values ?? [];
        const leafIds = selectedCommunities.filter(id => id != null && !String(id).includes("-"));
        const result = leafIds
          .filter(id => id != null)
          .map(commIdx => {
            const series = rows.map((row, i) => ({
              date: addDaysISO(anchorDate, -(rows.length - 1 - i)),
              count: row.values?.[commIdx] ?? 0,
            }));
            return { id: commIdx, label: `Community ${commIdx + 1}`, series };
          });
        setCommunitySeriesList(result);
        setLoading(false);
      }).catch(err => {
        if (err?.name === "AbortError") return;
        console.error("useClusterDailySeries SHAP fetch failed:", err);
        setCommunitySeriesList([]);
        setLoading(false);
      });
      return () => ac.abort();
    }
    // ── Model Level (SAGE) / Data Level (MI): extract directly from heatData ──
    // heatData is the correct 2D array (77 communities × 90 days) already used by the heatmap,
    // so reading from it guarantees the temporal graphs match the heatmap cells exactly.
    if (mode === "relation") {
      if (!heatData || !Array.isArray(heatData)) {
        setCommunitySeriesList([]);
        setLoading(false);
        return;
      }
      const leafIds = selectedCommunities.filter(id => id != null && !String(id).includes("-"));
      const result = leafIds.map(commIdx => {
        const dailyValues = heatData[commIdx] ?? [];
        const series = dailyValues.map((val, i) => ({
          date: addDaysISO(anchorDate, -(i + 1)),
          count: val,
        }));
        return { id: commIdx, label: `Community ${commIdx + 1}`, series };
      }).filter(r => r.series.length > 0);
      setCommunitySeriesList(result);
      setLoading(false);
      return;
    }

    setCommunitySeriesList([]);
    setLoading(false);
  }, [
    mode,
    relationDataMode,
    JSON.stringify(selectedCommunities),
    heatData,
    targetCommunityId,
    forecastAnchorDate,
    shapHorizon,
    relationModel,
    pastDays,
    futureEnd,
    anchorDate,
    rangeStart,
    rangeEnd,
  ]);

  return { communitySeriesList, loading };
}