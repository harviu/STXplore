import { useEffect, useState } from "react";
import { api } from "../lib/api.js";
import { addDaysISO } from "../lib/dates.js";
import { fillDaily } from "../lib/crimeAggregates.js";

/**
 * Fetches daily series data for each community in selectedCommunities,
 * switching data source based on the active map mode.
 *
 * - Past (source): extracts from heatData directly (no fetch needed)
 * - Instance Level (SHAP): calculate 90 daily values for the selected source community
 * - Model Level (SAGE) / Data Level (MI): one get4dData call per community (parallel)
 */
export function useClusterDailySeries({
  mode,
  relationDataMode,
  selectedCommunities,
  heatData,
  targetCommunityId,
  sourceCommunityId,
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
    // Instance mode is a second, on-demand SHAP calculation. It explains the
    // selected source community with 90 daily features and returns one row.
    if (mode === "instance") {
      if (!sourceCommunityId || !targetCommunityId || !forecastAnchorDate || !shapHorizon || !relationModel) {
        setCommunitySeriesList([]);
        setLoading(false);
        return;
      }

      const ac = new AbortController();
      setCommunitySeriesList([]);
      setLoading(true);
      api.predictionInstanceShap(
        forecastAnchorDate,
        relationModel,
        shapHorizon,
        Number(targetCommunityId),
        {
          explanationLevel: "history",
          sourceCommunity: Number(sourceCommunityId),
          signal: ac.signal,
        }
      ).then(data => {
        const series = (data?.history_values ?? []).map(row => ({
          date: row.date,
          count: Number(row.value ?? 0),
        }));
        setCommunitySeriesList(series.length > 0 ? [{
          id: sourceCommunityId,
          label: `Community ${sourceCommunityId}`,
          series,
        }] : []);
        setLoading(false);
      }).catch(err => {
        if (err?.name === "AbortError") return;
        console.error("useClusterDailySeries SHAP fetch failed:", err);
        setCommunitySeriesList([]);
        setLoading(false);
      });
      return () => ac.abort();
    }

    if (!selectedCommunities || selectedCommunities.length === 0) {
      setCommunitySeriesList([]);
      setLoading(false);
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

    setLoading(true);

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
      const result = leafIds.map(commId => {
        const commIdx = Number(commId) - 1; // selectedCommunities are 1-based for relation mode
        const dailyValues = heatData[commIdx] ?? [];
        // dailyValues[0] is most recent (reversed in MapPanel) — reverse again so series
        // goes oldest → newest left to right, matching the heatmap x-axis direction.
        const series = [...dailyValues].reverse().map((val, i) => ({
          date: addDaysISO(anchorDate, -(dailyValues.length - i)),
          count: val,
        }));
        return { id: commId, label: `Community ${commId}`, series };
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
    sourceCommunityId,
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
