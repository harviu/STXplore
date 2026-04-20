import { useMemo, useRef, useState, useEffect, useReducer, act } from "react";
import { createPortal } from "react-dom";
import Panel from "./Panel.jsx";
import MapBoxMap, { CHICAGO_ZOOM } from "./MapBoxMap.jsx";
import { BOUNDARY_GEO, getBoundaryId, getBoundaryLabel } from "../lib/boundaries.js";
import { indexById } from "../lib/indexById.js";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import { useHoverDailySeries } from "../hooks/useHoverDailySeries.js";
import { useModelRelationCounts } from "../hooks/useModelRelationCounts.js";
import { useInstanceRelationCounts } from "../hooks/useInstanceRelationCounts.js";
import TooltipMap from "./tooltipMap.jsx";
import Slider from "@mui/material/Slider";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { addDaysISO, clampDateIso, sourceRange, targetRange, todayISO } from "../lib/dates.js";
import { responseToCounts } from "../lib/crimeAggregates.js";
import { initialMapFaces, mapFacesReducer } from "../lib/mapFacesReducer.js";
import { useInstanceShapCounts } from "../hooks/useInstanceShapCounts.js";

// Function to prevent so many api calls, this will only call the api after the user has stopped changing the slider for 150ms
function useDebounced(value, delay = 150) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const RTL_THEME = createTheme({
  direction: "rtl",
  typography: {
    fontFamily:
      'Inter, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
});

/** Visual emphasis for the active map tab (disabled when selected matches browser defaults poorly). */
function mapTabButtonStyle(selected, extra = {}) {
  const base = {
    padding: "var(--space-2) var(--space-3)",
    borderRadius: 8,
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: selected ? 600 : 500,
    transition: "background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease",
    color: "inherit",
    opacity: 1,
    ...extra,
  };
  if (selected) {
    return {
      ...base,
      background: "var(--color-accent-soft)",
      border: "2px solid var(--color-accent-border)",
      boxShadow: "0 0 14px var(--color-accent-glow)",
    };
  }
  return {
    ...base,
    background: "var(--color-surface-ghost)",
    border: "1px solid var(--color-border)",
  };
}

/** Divide each feature count by spanDays (e.g. total → average per day over the target window). */
function scaleCountsPerDay(counts, spanDays) {
  if (counts == null || spanDays <= 0) return counts;
  const out = {};
  for (const [id, val] of Object.entries(counts)) out[id] = val / spanDays;
  return out;
}

const UI_TO_API_LAYER = { community: "community_area", beat: "beat", district: "district" };

/** Folder names under `models/` with checkpoints (see backend prediction API). */
const FORECAST_MODEL_OPTIONS = ["Transformer", "iTransformer"];

/**
 * The MapPanel component is responsible for rendering the main map interface and managing the state of the selected boundaries on both the left and right maps. 
 * It handles user interactions with the maps and updates the selection and summary data accordingly.
 * The physical maps are handled by the MapBoxMap component.
 * 
 * @param {Object} props 
 * @param {(selection: Object) => void} props.onSelectionChange Callback that receives the current selection object whenever it changes. The selection object has the shape: {activemode, secondaryMode, anchorDate, source: {mode, layer, id, name, days, dateISO, feature}, relation: {...}, instance: {...}, target: {...}, actual: {...}, error: {...}, heatData - has general structure:{communityId: id, date: date, count: c}, targetHeatData: similar to heatData but for target/actual map}
 * @param {(summary: Object) => void} props.onSummaryChange Callback that receives the current summary data for the left and right maps whenever it changes. The summary object has the shape: {left: {selection, summary, loading, error, range, days}, right: {selection, summary, loading, error, range, days}}. Keeps track of the returns from api calls regarding the maps. Note that values from this component are in onSelectionChange.
 * @returns {JSX.Element}
 */
export default function MapPanel({ onSelectionChange, onSummaryChange, sourceHighlight=[], targetHighlight=[] }) {
  const MAP_H = "clamp(450px, 55vh, 550px)";
  const [activeMode, setActiveMode] = useState("source"); // "source" | "relation" | "instance"
  const [secondaryMode, setSecondaryMode] = useState("target"); // "target" | "actual" | "error" | "relation"

  // Per-tab layer + selection (left: source | relation | instance; right: target | actual | error)
  const [mapFaces, dispatchMapFaces] = useReducer(mapFacesReducer, initialMapFaces);

  const layer = mapFaces[activeMode].layer;
  const selectedId = mapFaces[activeMode].selectedId;
  const setLayer = (newLayer) =>
    dispatchMapFaces({ type: "SET_FACET_LAYER", facet: activeMode, layer: newLayer, clearSelection: true });
  const setSelectedId = (newId) =>
    dispatchMapFaces({ type: "SET_FACET_SELECTION", facet: activeMode, selectedId: newId });

  // "relation" is not a right-map facet in mapFaces — fall back to "target" facet for layer/selection
  const secondaryFacet = secondaryMode === "relation" ? "target" : secondaryMode;
  const secondaryLayer = mapFaces[secondaryFacet].layer;
  const secondarySelectedId = mapFaces[secondaryFacet].selectedId;
  const setSecondaryLayer = (newLayer) =>
    dispatchMapFaces({ type: "SET_FACET_LAYER", facet: secondaryFacet, layer: newLayer, clearSelection: true });
  const setSecondarySelectedId = (newId) =>
    dispatchMapFaces({ type: "SET_FACET_SELECTION", facet: secondaryFacet, selectedId: newId });

  const sourceLayer = mapFaces.source.layer;
  const sourceSelectedId = mapFaces.source.selectedId;
  const relationLayer = mapFaces.relation.layer;
  const relationSelectedId = mapFaces.relation.selectedId;
  const instanceLayer = mapFaces.instance.layer;
  const instanceSelectedId = mapFaces.instance.selectedId;
  const targetLayer = mapFaces.target.layer;
  const targetSelectedId = mapFaces.target.selectedId;
  const relationTargetCommunityReady = targetLayer === "community" && !!targetSelectedId;
  const actualLayer = mapFaces.actual.layer;
  const actualSelectedId = mapFaces.actual.selectedId;
  const errorLayer = mapFaces.error.layer;
  const errorSelectedId = mapFaces.error.selectedId;

  //date sliders
  const [pastDays, setPastDays] = useState([0,90]);
  const [pastStart, pastEnd] = pastDays;
  const pastSpanDays = pastEnd - pastStart;
  /** Inclusive start / exclusive end as day offsets after anchor (matches targetRange / tensor slice). */
  const [futureRange, setFutureRange] = useState([0, 30]);
  const [futureStart, futureEnd] = futureRange;
  const futureSpanDays = futureEnd - futureStart;
  const dPastStart = useDebounced(pastStart);
  const dPastEnd = useDebounced(pastEnd);
  const dFutureStart = useDebounced(futureStart);
  const dFutureEnd = useDebounced(futureEnd);

  // Source map: show total crime count vs average per day
  const [sourceCountMode, setSourceCountMode] = useState("average"); // "total" | "average"
  // Target/Actual map: show total crime count vs average per day
  const [targetCountMode, setTargetCountMode] = useState("average"); // "total" | "average"

  // Target map + Community: ML forecast loads automatically (API sums full model horizon)
  const [model, setModel] = useState(FORECAST_MODEL_OPTIONS[0]);

  // "mi" = mutual information (ground truth from data)
  // "sage" = model attribution (what the model learned to pay attention to)
  const [relationDataMode, setRelationDataMode] = useState("mi");


  // "target" = classic mode: select right community, left map shows attribution
  // "source" = new mode: select left community, right map shows attribution
  const [relationMode, setRelationMode] = useState("target");

  // Horizon for SHAP — midpoint of future range slider, clamped to 1..30
  const shapHorizon = useMemo(() => {
    const mid = Math.round((futureStart + futureEnd) / 2);
    return Math.max(1, Math.min(30, mid || 1));
  }, [futureStart, futureEnd]);

  // Anchor date — defaults to latest date in dataset once loaded; user can pick another via calendar
  const [anchorDate, setAnchorDate] = useState(() => todayISO());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef(null);

  const [hover, setHover] = useState(null);

  // Increment to recenter both maps to CHICAGO_ZOOM
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  
  //Get boundary geometry
  const geo = BOUNDARY_GEO[layer];
  const secondaryGeo = BOUNDARY_GEO[secondaryLayer];

  const targetForecastEligible = secondaryLayer === "community";

  const wantPredBounds = targetForecastEligible;

  const { data: predBounds, loading: predBoundsLoading, error: predBoundsError } = useApi(
    ({ signal }) => (wantPredBounds ? api.predictionAnchorBounds({ signal }) : Promise.resolve(null)),
    [wantPredBounds]
  );

  const anchorDay = anchorDate?.slice(0, 10) ?? "";

  const forecastAnchorDate = useMemo(() => {
    if (!predBounds?.anchor_min || !predBounds?.anchor_max) return anchorDay;
    return clampDateIso(anchorDay, predBounds.anchor_min, predBounds.anchor_max);
  }, [anchorDay, predBounds]);
  
  //Hover daily series
  const tensorSourceId = targetSelectedId ?? null;
  const { hoverDaily, hoverDailyLoading, canShowHoverData } = useHoverDailySeries({hover, activeMode, secondaryMode, tensorSourceId, model, pastStart, pastEnd, futureStart, futureEnd, anchorDate, dataMode: relationDataMode, forecastAnchorDate, shapHorizon, });

  //Model relation counts
  const { counts: relationCounts, loading: relationLoading } = useModelRelationCounts(activeMode, layer, targetSelectedId, model, relationDataMode, dPastStart, dPastEnd, dFutureStart, dFutureEnd);

  //Instance relation counts
  const { counts: instanceRelationCounts, loading: instanceRelationLoading, error: instanceRelationError } = useInstanceRelationCounts(activeMode, targetSelectedId, model, dPastStart, dPastEnd, dFutureStart, dFutureEnd, relationDataMode);

  // Instance-level SHAP: predicted-map community = attribution target; left map shows per-source community weights
  const shapTargetCommunityId = relationTargetCommunityReady ? targetSelectedId : null;
  const { counts: shapCounts, loading: shapLoading, error: shapError, matrix: shapMatrix } = useInstanceShapCounts(
    activeMode,
    shapTargetCommunityId,
    model,
    forecastAnchorDate,
    shapHorizon,
    dPastStart,
    dPastEnd
  );

  // Source-direction: left map selection drives right map attribution
  const leftActiveSelectedId = mapFaces[activeMode]?.selectedId ?? null;
  const isSourceMode = relationMode === "source";

  const relationSourceReady = layer === "community" && !!leftActiveSelectedId;
  // The gate that tab buttons check — depends on which mode we're in
  const relationReady = relationMode === "source" ? relationSourceReady : relationTargetCommunityReady;

  // Source-direction model-level counts (SAGE or MI, source → all targets) for right map
  const { counts: sourceRelationCounts, loading: sourceRelationLoading } = useModelRelationCounts(
    isSourceMode && (activeMode === "relation" || activeMode === "instance") ? activeMode : "__disabled__",
    layer,
    leftActiveSelectedId,
    model,
    relationDataMode,
    dPastStart,
    dPastEnd,
    dFutureStart,
    dFutureEnd,
    "source"
  );

  // Source-direction instance-level counts (SAGE, source → all targets) for right map
  const { counts: sourceInstanceRelationCounts, loading: sourceInstanceRelationLoading } = useInstanceRelationCounts(
    isSourceMode && activeMode === "instance" ? activeMode : "__disabled__",
    leftActiveSelectedId,
    model,
    dPastStart,
    dPastEnd,
    dFutureStart,
    dFutureEnd,
    relationDataMode
  );
  // Relation tab: community-only on both sides; snap right map to Target
  useEffect(() => {
    if (activeMode === "relation") {
      dispatchMapFaces({ type: "SET_FACET_LAYER", facet: "relation", layer: "community", clearSelection: false });
      // In source mode keep whatever the right map is showing; in target mode snap to Predicted
      if (!isSourceMode) {
        setSecondaryMode("target");
        dispatchMapFaces({ type: "SET_FACET_LAYER", facet: "target", layer: "community", clearSelection: false });
      }
    }
  }, [activeMode, isSourceMode]);

  // Source heatmap: daily crime counts for all communities over the source window.
  const { data: crimeCountsResp, loading: crimeCountsLoading } = useApi(({ signal }) => {
    if (activeMode !== "source") return Promise.resolve(null);
    const { start, end } = sourceRange(dPastStart, dPastEnd, anchorDate);
    return api.selectionAllDaily(layer, start, end, { signal });
  }, [activeMode, layer, dPastStart, dPastEnd, anchorDate]);

  const crimeCounts = crimeCountsResp?.daily ?? null;

  // Relational heatmap: 4D tensor sliced to the current slider window.
  const { data: relationValuesRaw, loading: relationValuesLoading } = useApi(({ signal }) => {
    if (activeMode === "source") return Promise.resolve(null);
    if (!relationTargetCommunityReady || !targetSelectedId) return Promise.resolve(null);
    return api.get4dData(pastEnd, true, null, 30, true, Number(targetSelectedId) - 1, model, relationDataMode, {
      signal,
      d3Start: 0,
      normalize: false,
    });
  }, [activeMode, pastEnd, targetSelectedId, model, relationDataMode, relationTargetCommunityReady]);
  // Slice to the past window client-side — no re-fetch needed when only pastStart changes.
  const relationValues = useMemo(
    () => relationValuesRaw ? relationValuesRaw.map(row => [...row].reverse().slice(pastStart)) : null,
    [relationValuesRaw, pastStart]
  );

  // Instance-level map on source side: 4D array → per-community time-averaged over slider date range.
  const {data: instanceSourceResp, loading: instanceSourceLoading, error: instanceSourceError} = useApi(({ signal }) => {
    if (activeMode !== "instance") return Promise.resolve(null);
    return api.instanceLevelSource(pastEnd, futureStart, futureEnd, { signal });
  }, [activeMode, pastEnd, futureStart, futureEnd]);

  //Get Data for Source HeatMap (used when activeMode is "source"; instance mode uses instanceSourceResp)
  const {data: leftTotalsResp, loading: leftTotalsLoading, error: leftTotalsError} = useApi(({ signal }) => {
    const { start, end } = sourceRange(dPastStart, dPastEnd, anchorDate);
    const apiLayer = UI_TO_API_LAYER[layer];
    return api.mapTotals(apiLayer, start, end, { signal });
  }, [layer, dPastStart, dPastEnd, anchorDate]);

  const leftCrimeCounts = useMemo(
    () =>
      activeMode === "instance"
        ? responseToCounts(instanceSourceResp)
        : responseToCounts(leftTotalsResp),
    [activeMode, instanceSourceResp, leftTotalsResp]
  );

  // When source map and "average" mode: show count / days; otherwise raw counts
  const leftCountsForMap = useMemo(() => {
    const raw =
      activeMode === "relation"
        ? relationCounts
        : activeMode === "instance" && !isSourceMode && relationTargetCommunityReady && shapCounts
          ? shapCounts
          : leftCrimeCounts;
    if (raw == null) return raw;
    if (
      activeMode === "source" &&
      sourceCountMode === "average" &&
      pastSpanDays > 0
    ) {
      const out = {};
      for (const [id, val] of Object.entries(raw)) out[id] = val / pastSpanDays;
      return out;
    }
    return raw;
  }, [activeMode, relationCounts, relationTargetCommunityReady, shapCounts, leftCrimeCounts, sourceCountMode, pastSpanDays]);


  //Get Data for Actual Heatmap
  const {data: rightTotalsResp, loading: rightTotalsLoading, error: rightTotalsError} = useApi(({ signal }) => {
      const { start, end } = targetRange(futureStart, futureEnd, anchorDate);
      const apiLayer = UI_TO_API_LAYER[secondaryLayer];
      return api.mapTotals(apiLayer, start, end, { signal });
    },
    [secondaryLayer, anchorDate, futureStart, futureEnd]
  );
  const rightCrimeCounts = useMemo(
    () => responseToCounts(rightTotalsResp),
    [rightTotalsResp]
  );
  const anchorIsClamped = targetForecastEligible && predBounds?.anchor_max && anchorDay > predBounds.anchor_max;

  const targetForecastReady =
    targetForecastEligible &&
    predBounds != null &&
    Boolean(predBounds.anchor_min) &&
    Boolean(predBounds.anchor_max);

  // Daily forecast series for selected right-map community (for side panel tootip)
  const { data: forecastDailyResp, loading: forecastDailyLoading, error: forecastDailyError } = useApi(({ signal }) => {
    if (!targetForecastReady) return Promise.resolve(null);
    return api.predictionByDate(forecastAnchorDate, model, { signal });
  }, [targetForecastReady, forecastAnchorDate, model, secondarySelectedId]);
  
  const forecastDailySeries = useMemo(() => {
    if (!forecastDailyResp?.forecast_daily || !secondarySelectedId) return null;
    const commIndex = parseInt(secondarySelectedId) - 1;
    return forecastDailyResp.forecast_daily.map((row) => ({
      date: row.date,
      count: row.values[commIndex] ?? 0,
    }));
  }, [forecastDailyResp, secondarySelectedId]);

  const forecastTotal = useMemo(() => {
    if (!forecastDailyResp?.forecast_totals || !secondarySelectedId) return null;
    const entry = forecastDailyResp.forecast_totals.find((t) => t.feature_id === String(secondarySelectedId));
    return entry?.count ?? null;
  }, [forecastDailyResp, secondarySelectedId]);

    const forecastCountsForMap = useMemo(() => {
  if (!forecastDailyResp?.forecast_daily) return null;
  const sliced = forecastDailyResp.forecast_daily.slice(futureStart, futureEnd);
  if (sliced.length === 0) return null;
  const totals = {};
  sliced.forEach((row) => {
    row.values.forEach((val, i) => {
      const id = String(i + 1);
      totals[id] = (totals[id] ?? 0) + val;
    });
  });
  return totals;
  }, [forecastDailyResp, futureStart, futureEnd]);

  // Error for error map = actual - forecast
  const errorForMap = useMemo(() => {
    if (forecastCountsForMap == null || rightCrimeCounts == null) return null;
    const out = {};
    for (const id of Object.keys(forecastCountsForMap)) {
      const forecastVal = forecastCountsForMap[id] ?? 0;
      const actualVal = rightCrimeCounts[id] ?? 0;
      out[id] = actualVal - forecastVal;
    }
    return out;
  }, [forecastCountsForMap, rightCrimeCounts]);

  // Right map: totals vs average per day over the target window (Predicted, Actual, Error)
  const rightCountsForMap = useMemo(() => {
    // Relation tab: show attribution from active left tab (source mode only)
    if (secondaryMode === "relation" && isSourceMode) {
      const counts = activeMode === "instance" ? sourceInstanceRelationCounts : sourceRelationCounts;
      return counts ?? null;
    }

    const span = futureSpanDays;
    const wantAvg = targetCountMode === "average" && span > 0;

    if (secondaryMode === "target") {
      if (
        !targetForecastEligible ||
        forecastCountsForMap == null ||
        Object.keys(forecastCountsForMap).length === 0
      ) {
        return null;
      }
      return wantAvg ? scaleCountsPerDay(forecastCountsForMap, span) : forecastCountsForMap;
    }

    if (secondaryMode === "actual") {
      if (rightCrimeCounts == null) return null;
      return wantAvg ? scaleCountsPerDay(rightCrimeCounts, span) : rightCrimeCounts;
    }

    if (secondaryMode === "error") {
      if (errorForMap == null) return null;
      return wantAvg ? scaleCountsPerDay(errorForMap, span) : errorForMap;
    }

    return null;
  }, [
    secondaryMode,
    isSourceMode,
    activeMode,
    sourceRelationCounts,
    sourceInstanceRelationCounts,
    targetForecastEligible,
    forecastCountsForMap,
    rightCrimeCounts,
    errorForMap,
    targetCountMode,
    futureSpanDays,
  ]);

  const rightMapLegendTitle = useMemo(() => {
    if (secondaryMode === "relation" && isSourceMode) {
      if (!leftActiveSelectedId) return "Select a community on the left map";
      return relationDataMode === "sage"
        ? "SAGE — source influence on all targets"
        : "MI — source influence on all targets";
    }
    if (secondaryMode === "error") {
      return targetCountMode === "average"
        ? "Avg difference per day"
        : "Difference (actual - target)";
    }
    if (secondaryMode === "target") {
      if (targetForecastEligible) {
        return targetCountMode === "average"
          ? "Avg forecast per day"
          : `Forecast total (${model}, full horizon)`;
      }
      return targetCountMode === "average" ? "Avg predicted crimes per day" : "Predicted Crime Count";
    }
    if (secondaryMode === "actual") {
      return targetCountMode === "average" ? "Avg crimes per day" : "Crime Count";
    }
    return "Crime Count";
  }, [secondaryMode, isSourceMode, leftActiveSelectedId, relationDataMode, activeMode, targetCountMode, targetForecastEligible, model]);

  const rightMapLoading = secondaryMode === "relation" && isSourceMode
    ? (activeMode === "instance" ? sourceInstanceRelationLoading : sourceRelationLoading)
    : targetForecastEligible
      ? predBoundsLoading || (targetForecastReady && forecastDailyLoading)
      : rightTotalsLoading;

  const forecastErrorText = predBoundsError || forecastDailyError;

  function makeSelection(mode, layerX, idX, daysX, anchorISO, dateOffsetDays) {
    if (!idX) return null;
    const geoX = BOUNDARY_GEO[layerX];

    const getIdxId = (f) => getBoundaryId(layerX, f);
    const idx = indexById(geoX.features, getIdxId);
    const feature = idx.get(idX);
    if (!feature) return null;

    const anchor = new Date(anchorISO + "T00:00:00");
    if (isNaN(anchor.getTime())) return null;
    const date = new Date(anchor);
    date.setDate(date.getDate() + dateOffsetDays);
    const dateISO = date.toISOString().slice(0, 10);
    return {mode, layer: layerX, id: idX, name: getBoundaryLabel(layerX, feature), days: daysX, dateISO, feature};
  }

  const sourceSelection = useMemo(() => makeSelection("source", sourceLayer, sourceSelectedId, pastSpanDays, anchorDate, -pastEnd), [sourceLayer, sourceSelectedId, pastSpanDays, pastEnd, anchorDate]);
  const relationSelection = useMemo(() => makeSelection("relation", relationLayer, relationSelectedId, pastSpanDays, anchorDate, -pastEnd), [relationLayer, relationSelectedId, pastEnd, anchorDate]);
  const instanceSelection = useMemo(() => makeSelection("instance", instanceLayer, instanceSelectedId, pastSpanDays, anchorDate, -pastEnd), [instanceLayer, instanceSelectedId, pastEnd, anchorDate]);
  const targetSelection = useMemo(() => makeSelection("target", targetLayer, targetSelectedId, futureSpanDays, anchorDate, futureEnd),[targetLayer, targetSelectedId, futureSpanDays, futureEnd, anchorDate]);
  const actualSelection = useMemo(() => makeSelection("actual", actualLayer, actualSelectedId, futureSpanDays, anchorDate, futureEnd),[actualLayer, actualSelectedId, futureSpanDays, futureEnd, anchorDate]);
  const errorSelection = useMemo(() => makeSelection("error", errorLayer, errorSelectedId, futureSpanDays, anchorDate, futureEnd),[errorLayer, errorSelectedId, futureSpanDays, futureEnd, anchorDate]);

  //Chooses what selection should drive the Left map summary
  const leftSelection = activeMode === "source" ? sourceSelection: activeMode === "relation" ? relationSelection : instanceSelection;

  //Chooses what selection should drive the Right map summary
  const rightSelection = secondaryMode === "target" ? targetSelection 
    : secondaryMode === "actual" ? actualSelection 
    : secondaryMode === "error" ? errorSelection 
    : null; // "relation" mode has no single right-map community selection

  const {data: leftSummary, loading: leftSummaryLoading, error: leftSummaryError} = useApi(({ signal }) => {
      if (!leftSelection) return Promise.resolve(null);
      const { start, end } = sourceRange(pastStart, pastEnd, anchorDate);
      if (!start || !end) return Promise.resolve(null);
      return api.selectionSummary(leftSelection.layer, leftSelection.id, start, end, { signal });
    },
    [leftSelection?.mode, leftSelection?.layer, leftSelection?.id, pastStart, pastEnd, anchorDate]
  );

  const {data: leftDailyResp} = useApi(({ signal }) => {
    if (!leftSelection) return Promise.resolve(null);
    const { start, end } = sourceRange(pastStart, pastEnd, anchorDate);
    if (!start || !end) return Promise.resolve(null);
    return api.selectionDaily(leftSelection.layer, leftSelection.id, start, end, { signal });
  }, [leftSelection?.mode, leftSelection?.layer, leftSelection?.id, pastStart, pastEnd, anchorDate]);

  const {data: rightSummary, loading: rightSummaryLoading, error: rightSummaryError} = useApi(({ signal }) => {
      if (!rightSelection) return Promise.resolve(null);

      const { start, end } = targetRange(futureStart, futureEnd, anchorDate);
      if (!start || !end) return Promise.resolve(null);
      return api.selectionSummary(rightSelection.layer, rightSelection.id, start, end, { signal });
    },
    [rightSelection?.mode, rightSelection?.layer, rightSelection?.id, futureStart, futureEnd, anchorDate]
  );

  //const { data: dateRange } = useApi(({ signal }) => api.dateRange({ signal }), []);

  // Disable dates after the latest date in the DB. Use start of next day (local) so "after" disables that day and all later.
  const maxDataDate = useMemo(() => {
    if (!predBounds?.anchor_max) return new Date(); // fallback: at least disable future if API not loaded
    const dateOnly = predBounds.anchor_max.slice(0, 10); // in case API returns "YYYY-MM-DD HH:mm:ss"
    const [y, m, d] = dateOnly.split("-").map(Number);
    return new Date(y, m - 1, d + 1); // 00:00:00 on the day after max
  }, [predBounds?.anchor_max]);

  // Default anchor date to latest date in dataset when date range loads (store date-only, no time)
  useEffect(() => {
    if (predBounds?.anchor_max) setAnchorDate(predBounds.anchor_max.slice(0, 10));
  }, [predBounds?.anchor_max]);

  const thirtyDaysAgo = new Date();
  // fallback to today if max date not loaded yet
  if (maxDataDate) thirtyDaysAgo.setTime(maxDataDate.getTime());
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const canShowActualError = useMemo(()=>{return maxDataDate && new Date(addDaysISO(anchorDate, futureEnd) + "T00:00:00") <= maxDataDate},[maxDataDate, anchorDate, futureEnd]);

  //Reset to target if invalid actual/error
  useEffect(() => {
    if (secondaryMode !== "target" && !canShowActualError) {
      setSecondaryMode("target");
    }
  }, [canShowActualError]);

  // Actual/error heatmap: daily crime counts for all communities over the target window.
  // The +1s sync with the forecast which predicts one day ahead of anchor.
  const { data: futureCountsResp } = useApi(({ signal }) => {
    if (secondaryMode !== "actual" && secondaryMode !== "error") return Promise.resolve(null);
    if (!canShowActualError) return Promise.resolve(null);
    const { start, end } = targetRange(futureStart + 1, futureEnd + 1, anchorDate);
    return api.selectionAllDaily(secondaryLayer, start, end, { signal });
  }, [secondaryMode, secondaryLayer, futureStart, futureEnd, anchorDate, canShowActualError]);
  const futureCounts = futureCountsResp?.daily ?? null;

  const dailyForHeatMap = useMemo(()=>{
    if (forecastDailyResp === null || forecastDailyResp.forecast_daily === null) return null;
    return forecastDailyResp.forecast_daily.flatMap((day) => {
      return day.values.map((val,index) => ({
        id: (index+1).toString(),
        date: day.date,
        count: Math.round(val)
      }))
    });
  },[forecastDailyResp]);

  const errorSideValues = useMemo(()=>{
    if (!forecastDailySeries || ! futureCounts) return;
    const actual = futureCounts?.filter((day)=>{return day?.id === secondarySelectedId});
    const totals = actual.reduce((acc, item) => {
      acc[item.date] = item.count;
      return acc;
    }, {});
    forecastDailySeries.forEach(item => {
      if (totals[item.date] !== undefined) {
        totals[item.date] -= item.count;
      }
    });
    return Object.keys(totals).map(date => ({
      date: date,
      count: totals[date]
    }));
  },[forecastDailySeries, futureCounts]);

  /*
  useEffect(()=>{
    //use for error clusterheatmap
    //console.log(futureCounts);
    //console.log(dailyForHeatMap);
  },[futureCounts,dailyForHeatMap]);*/

  //pass selection and data up
  useEffect(() => {
    onSelectionChange?.({
      //modes
      activeMode,
      secondaryMode,
      anchorDate,
      relationDataMode,

      //selections
      source: sourceSelection,
      relation: relationSelection,
      instance: instanceSelection,
      target: targetSelection,
      actual: actualSelection,
      error: errorSelection,
      //data for heatmaps
      heatData: activeMode === "source" ? crimeCounts : activeMode === "instance" ? shapMatrix : relationValues,
      targetHeatData: secondaryMode === "actual" ? futureCounts : secondaryMode === "target" ? dailyForHeatMap : null,
    });
  }, [
    activeMode,
    secondaryMode,
    anchorDate,

    sourceSelection,
    relationSelection,
    instanceSelection,
    targetSelection,
    actualSelection,
    errorSelection,

    crimeCounts,
    relationValues,
    shapMatrix,

    futureCounts,
    dailyForHeatMap,

    onSelectionChange,
  ]);

  //pass summary data up
  useEffect(() => {
    onSummaryChange?.({
      //summaries (split)
      left: {selection: leftSelection, summary: leftSummary, loading: leftSummaryLoading, error: leftSummaryError, range: sourceRange(pastStart, pastEnd, anchorDate), days: pastSpanDays, offset: pastStart, daily: leftDailyResp?.daily ?? null},
      right: {selection: rightSelection, summary: rightSummary, loading: rightSummaryLoading, error: rightSummaryError, range: targetRange(futureStart, futureEnd, anchorDate), days: futureSpanDays, offset: futureStart, forecastDaily: secondaryMode === "error" ? [forecastDailySeries, futureCounts?.filter((day)=>{return day?.id === secondarySelectedId}), errorSideValues] : secondaryMode === "actual" ? futureCounts?.filter((day)=>{return day?.id === secondarySelectedId}) : forecastDailySeries, forecastTotal,},
    });
  }, [
    leftSelection,
    leftSummary,
    leftSummaryLoading,
    leftSummaryError,
    leftDailyResp,
    pastEnd,

    rightSelection,
    rightSummary,
    rightSummaryLoading,
    rightSummaryError,
    futureStart,
    futureEnd,
    futureSpanDays,
    onSummaryChange,
  ]);


  // Close calendar when clicking outside
  useEffect(() => {
    if (!calendarOpen) return;
    function handleClickOutside(e) {
      if (calendarRef.current && !calendarRef.current.contains(e.target)) {
        setCalendarOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [calendarOpen]);

  const isLoadingLeft = activeMode === "source" 
    ? leftTotalsLoading 
    : activeMode === "relation" 
        ? relationLoading 
        : (shapLoading || instanceSourceLoading);

  const showMapHoverTooltip =
    !!hover &&
    (hover.which === "right" ? !rightMapLoading : true) &&
    (hover.which === "left" ? !isLoadingLeft : true);

  return (
    <Panel title="Crime Map" fill style={{ minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 auto", minHeight: 0 }}>
        {/* Top toolbar: Anchor date + Relationship Mode + Recenter */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", padding: "var(--space-3) 0 0" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--space-4)", rowGap: "var(--space-2)", width: "100%", padding: "0 0 var(--space-2)", justifyContent: "center" }}>
            {/* Anchor date */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <strong style={{ fontWeight: 600, opacity: 0.95 }}>Anchor date</strong>
              <div ref={calendarRef} style={{ position: "relative" }}>
                <button
                  type="button"
                  onClick={() => setCalendarOpen((open) => !open)}
                  title="Pick start date (anchor for source/target days)"
                  style={{padding: "6px 14px", cursor: "pointer", border: "1px solid var(--color-border-strong)", borderRadius: 8, background: "var(--color-surface-raised)", color: "inherit", fontSize: "inherit", fontWeight: 500, minWidth: 120}}
                >
                  {anchorDate?.slice(0, 10) ?? anchorDate}
                </button>
                {calendarOpen && (
                  <div style={{position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 1000, background: "var(--color-surface-popover)", border: "1px solid var(--color-panel-border)", borderRadius: 8, boxShadow: "0 4px 20px var(--color-shadow-drop)", padding: 8}}>
                    <DayPicker
                      mode="single"
                      autoFocus
                      defaultMonth={anchorDate ? new Date(anchorDate) : undefined}
                      selected={anchorDate ? new Date(anchorDate + "T12:00:00") : undefined}
                      onSelect={(date) => {
                        if (date) {
                          setAnchorDate(date.toISOString().slice(0, 10));
                          setCalendarOpen(false);
                          if (thirtyDaysAgo < date) setSecondaryMode("target");
                        }
                      }}
                      startMonth={new Date(2001, 0)}
                      disabled={{ before: new Date(2001, 3, 2), after: new Date((predBounds?.anchor_max) + "T12:00:00") }}
                      navLayout="around"
                      showOutsideDays
                      animate
                      captionLayout="dropdown"
                    />
                  </div>
                )}
              </div>
            </div>

            <span style={{width: 1, height: 22, background: "var(--color-separator)", borderRadius: 1, flexShrink: 0}} aria-hidden />

            {/* Relationship Mode */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <strong style={{ fontWeight: 600, opacity: 0.95 }}>Relationship mode</strong>
              <select
                value={relationMode}
                onChange={(e) => setRelationMode(e.target.value)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-surface-input)",
                  color: "inherit",
                  fontSize: "inherit",
                }}
              >
                <option value="target">All sources → Target</option>
                <option value="source">Source → All targets</option>
              </select>
            </div>

            <span style={{width: 1, height: 22, background: "var(--color-separator)", borderRadius: 1, flexShrink: 0}} aria-hidden />

            {/* Model */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <strong style={{ fontWeight: 600, opacity: 0.95 }}>Model</strong>
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                aria-label="Model"
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid var(--color-border-strong)",
                  background: "var(--color-surface-input)",
                  color: "inherit",
                  fontSize: "inherit",
                }}
              >
                {FORECAST_MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>

            <span style={{width: 1, height: 22, background: "var(--color-separator)", borderRadius: 1, flexShrink: 0}} aria-hidden />

            {/* Recenter */}
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
              <strong style={{ fontWeight: 600, opacity: 0.95 }}>Recenter</strong>
              <button
                type="button"
                onClick={() => setRecenterTrigger((t) => t + 1)}
                title={`Recenter both maps to Chicago (zoom ${CHICAGO_ZOOM})`}
                style={{padding: "6px 14px", cursor: "pointer", border: "1px solid var(--color-border-strong)", borderRadius: 8, background: "var(--color-surface-raised)", color: "inherit", fontSize: "inherit", fontWeight: 500}}
              >
                Recenter maps
              </button>
            </div>
          </div>

          {/* Hint line — changes based on relationship mode */}
          <div style={{ fontSize: 12, opacity: 0.7, paddingBottom: "var(--space-2)", textAlign: "center", fontStyle: "italic" }}>
            {relationMode === "source"
              ? "Source → All targets: select a community on the left (Past) map to see its influence on all other communities"
              : "All sources → Target: select a community on the right (Predicted) map to see what influenced its prediction"}
          </div>
        </div>

        <hr style={{ width: "100%", margin: "var(--space-3) 0", border: "none", height: 1, background: "var(--color-border-muted)" }} />

        <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", width: "100%", height: "100%", flexWrap: "wrap"}}>
          {/* Source/Relation Map */}
          <div style={{ flex: "1", flexDirection: "column", padding: "var(--space-4)", display: "flex", alignItems: "center" }}>
            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "flex-start", width: "100%" }}>
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
                <strong>Map:</strong>
                <button
                  type="button"
                  onClick={() => setActiveMode("source")}
                  disabled={activeMode === "source"}
                  style={mapTabButtonStyle(activeMode === "source")}
                >
                  Past
                </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSourceMode && sourceSelectedId) {
                        dispatchMapFaces({ type: "SET_FACET_SELECTION", facet: "instance", selectedId: sourceSelectedId });
                      }
                      setActiveMode("instance");
                    }}
                    disabled={activeMode === "instance" || !relationReady}
                    title={!relationReady && activeMode !== "instance"
                      ? isSourceMode ? "Select a community on the Past map first." : "Select a community on the Predicted map first."
                      : undefined}
                    style={mapTabButtonStyle(activeMode === "instance", {
                      fontSize: "0.65rem",
                      lineHeight: 1.2,
                      opacity: !relationReady ? 0.25 : 1,
                    })}
                  >
                  Instance <br/> Level{relationMode === "source" ? " (SAGE)" : " (SHAP)"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSourceMode && sourceSelectedId) {
                        dispatchMapFaces({ type: "SET_FACET_SELECTION", facet: "relation", selectedId: sourceSelectedId });
                      }
                      setActiveMode("relation");
                      setRelationDataMode("sage");
                      if (!isSourceMode) setSecondaryMode("target");
                    }}
                    disabled={(activeMode === "relation" && relationDataMode === "sage") || !relationReady}
                    title={!relationReady && activeMode !== "instance"
                      ? relationMode === "source"
                        ? "Select a community on the left map first."
                        : "Select a community on the Predicted map first."
                      : undefined}
                    style={mapTabButtonStyle(activeMode === "relation" && relationDataMode === "sage", {
                      fontSize: "0.65rem",
                      lineHeight: 1.2,
                      opacity: !relationReady ? 0.25 : 1,
                    })}
                  >
                    Model <br/> Level
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (isSourceMode && sourceSelectedId) {
                        dispatchMapFaces({ type: "SET_FACET_SELECTION", facet: "relation", selectedId: sourceSelectedId });
                      }
                      setActiveMode("relation");
                      setRelationDataMode("mi");
                      if (!isSourceMode) setSecondaryMode("target");
                    }}
                    disabled={(relationDataMode === "mi" && activeMode === "relation") || !relationReady}
                    title={!relationReady && activeMode !== "relation"
                      ? isSourceMode ? "Select a community on the left map first." : "Select a community on the Predicted map first."
                      : undefined}
                    style={mapTabButtonStyle(activeMode === "relation" && relationDataMode === "mi", {
                      fontSize: "0.65rem",
                      lineHeight: 1.2,
                      opacity: !relationReady ? 0.25 : 1,
                    })}
                  >
                    Data <br/> Level
                  </button>
              </div>
              {activeMode === "instance" && relationTargetCommunityReady && (
                <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", fontSize: 13, opacity: 0.8 }}>
                  <strong>SHAP horizon:</strong>
                  <span>day {shapHorizon} (slider midpoint)</span>
                </div>
              )}
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                <strong>Layer:</strong>
                <label>
                  <input
                    type="radio"
                    name="layer"
                    checked={layer === "community"}
                    onChange={() => {
                      setLayer("community");
                      setSelectedId(null);
                    }}
                  />
                  Community
                </label>
                <label style={{ opacity: (activeMode === "relation" || activeMode === "instance") ? 0.25 : 1 }}>
                  <input
                    type="radio"
                    name="layer"
                    checked={layer === "beat"}
                    disabled={activeMode === "relation" || activeMode === "instance"}
                    onChange={() => {
                      setLayer("beat");
                      setSelectedId(null);
                    }}
                  />
                  Beat
                </label>
                <label style={{ opacity: (activeMode === "relation" || activeMode === "instance") ? 0.25 : 1 }}>
                  <input
                    type="radio"
                    name="layer"
                    checked={layer === "district"}
                    disabled={activeMode === "relation" || activeMode === "instance"}
                    onChange={() => {
                      setLayer("district");
                      setSelectedId(null);
                    }}
                  />
                  District
                </label>
              </div>
              {/* Past map only: total vs average per day (disabled on Instance / Model / Data level) */}
              <div
                style={{
                  display: "flex",
                  gap: "var(--space-3)",
                  alignItems: "center",
                  opacity: activeMode === "source" ? 1 : 0.25,
                }}
              >
                <strong>Count:</strong>
                <label>
                  <input
                    type="radio"
                    name="sourceCountMode"
                    checked={sourceCountMode === "average"}
                    disabled={activeMode !== "source"}
                    onChange={() => setSourceCountMode("average")}
                  />
                  Average per day
                </label>
                <label>
                  <input
                    type="radio"
                    name="sourceCountMode"
                    checked={sourceCountMode === "total"}
                    disabled={activeMode !== "source"}
                    onChange={() => setSourceCountMode("total")}
                  />
                  Total
                </label>
              </div>
            </div>
            <div
              style={{flex: "1 1 auto", minHeight: 0, overflow: "hidden", position: "relative", padding: "var(--space-2)", boxSizing: "border-box", width: "100%", display: "flex", flexDirection: "column", gap: "var(--space-2)"}}
            >
                {/* Map area 1*/}
                <div
                  style={{height: MAP_H, width: "100%", overflow: "hidden"}}
                >
                  <MapBoxMap
                    geo={geo}
                    crimeCounts={leftCountsForMap}
                    legendTitle={
                      activeMode === "source"
                        ? sourceCountMode === "average"
                          ? "Avg crimes per day"
                          : "Crime Count"
                        : activeMode === "instance"
                          ? isSourceMode
                            ? leftActiveSelectedId
                              ? "SAGE Attribution (source → all targets)"
                              : "Select a community to see its influence"
                            : shapError
                              ? "SHAP Error"
                              : relationTargetCommunityReady
                                ? `SHAP Attribution (horizon ${shapHorizon})`
                                : "Select a community on the Predicted map"
                          : relationDataMode === "sage"
                            ? "SAGE (model attribution)"
                            : "MI (data relation)"
                    }
                    layer={layer}
                    highlights={sourceHighlight}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    onHover={(h) => setHover(h ? { ...h, which: "left" } : null)}
                    recenterTrigger={recenterTrigger}
                    isRelationMap={activeMode === "relation" || activeMode === "instance"}
                    isInstanceShapMap={activeMode === "instance"}
                    isSageMap={
                      (relationDataMode === "sage" && (activeMode === "relation" || activeMode === "instance"))
                      || (!isSourceMode && activeMode === "instance") // SHAP only in target mode
                    }
                    loading={
                      activeMode === "source"
                        ? leftTotalsLoading
                        : activeMode === "instance"
                          ? isSourceMode
                            ? leftTotalsLoading  // source mode: left map shows past crime as picker
                            : shapLoading || instanceSourceLoading
                          : relationLoading
                    }
                  />
                </div>
            </div>
            {/*slider row (source, relation, and instance use date range for left/right map data)*/}
            <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", width: "100%", height: "10%" }}>
              <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", width: "100%", height: "100%", justifyContent: "left" }}>
                <label htmlFor="pastEnd" style={{ flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)", width: "100%", height: "100%" }}>
                    Source date: {pastEnd} days before start <br/>({anchorDate})
                  </div>
                </label>
                <span aria-hidden />
                <label htmlFor="futureRange" style={{ flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--space-3)", width: "100%", height: "100%" }}>
                    <span style={{ alignSelf: "center" }}>
                      Target window: {addDaysISO(anchorDate, futureStart)} – {addDaysISO(anchorDate, futureEnd - 1)}
                      <br />
                      ({futureSpanDays} days; offsets {futureStart}–{futureEnd} from {anchorDate})
                    </span>
                  </div>
                </label>
              </div>
              <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%", justifyContent: "left" }}>
                <ThemeProvider theme={RTL_THEME}>
                  <div dir="rtl" style={{ width: "100%" }}>
                    <Slider
                      id="pastDays"
                      aria-label="Days before start"
                      value={pastDays}
                      onChange={(_e, value) => {
                        if (value[1] - value[0] < 1) return;
                        setPastDays(value);
                      }}
                      valueLabelDisplay="auto"
                      getAriaValueText={(v) => `${v} days ago`}
                      min={0}
                      max={90}
                      sx={{
                        width: "100%",
                        "& .MuiSlider-rail": { height: 10, borderRadius: 0, backgroundColor: "var(--color-slider-rail)", strokeWidth: 2 },
                        "& .MuiSlider-track": { height: 10, borderRadius: 0, backgroundColor: "var(--color-slider-track)", strokeWidth: 2 },
                        "& .MuiSlider-thumb": {
                          width: 14,
                          height: 26,
                          borderRadius: 9999,
                          backgroundColor: "white",
                          border: "3px solid var(--color-slider-thumb-border)",
                          marginRight: -1.7,
                        },
                      }}
                    />
                  </div>
                </ThemeProvider>
                <div
                  style={{display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, minWidth: 25}}
                  title={`Anchor date: ${anchorDate}`}
                  aria-hidden
                >
                  <div style={{ width: 4, minHeight: 32, backgroundColor: "var(--color-slider-thumb-border)", borderRadius: 2 }} />
                  <span style={{ fontSize: 10, color: "var(--color-slider-thumb-border)", marginTop: 2 }} />
                </div>
                <Slider
                  id="futureRange"
                  aria-label="Target window after anchor date"
                  value={futureRange}
                  onChange={(_e, value) => {
                    if (value[1] - value[0] < 1) return;
                    setFutureRange(value);
                  }}
                  valueLabelDisplay="auto"
                  getAriaValueText={(v) =>
                    Array.isArray(v) ? `${v[0]}–${v[1]} days after anchor` : `${v} days after anchor`
                  }
                  step={1}
                  min={0}
                  max={30}
                  sx={{
                    width: "100%",
                    "& .MuiSlider-rail": { height: 10, borderRadius: 0, backgroundColor: "var(--color-slider-rail)" },
                    "& .MuiSlider-track": { height: 10, borderRadius: 0, backgroundColor: "var(--color-slider-track)" },
                    "& .MuiSlider-thumb": {
                      width: 14,
                      height: 26,
                      borderRadius: 9999,
                      backgroundColor: "white",
                      border: "3px solid var(--color-slider-thumb-border)",
                    },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Target Map */}
          <div style={{ flex: "1", flexDirection: "column", padding: "var(--space-4)", display: "flex", alignItems: "center" }}>
            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", alignItems: "flex-start", width: "100%" }}>
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", flexWrap: "wrap" }}>
                <strong>Map:</strong>
                <button
                  type="button"
                  onClick={() => setSecondaryMode("target")}
                  disabled={secondaryMode === "target"}
                  style={mapTabButtonStyle(secondaryMode === "target")}
                >
                  Predicted
                </button>
                <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", opacity: canShowActualError ? 1 : 0.25 }}>
                  <button
                    type="button"
                    onClick={() => setSecondaryMode("actual")}
                    disabled={secondaryMode === "actual" || !canShowActualError}
                    style={mapTabButtonStyle(secondaryMode === "actual")}
                  >
                    Actual
                  </button>
                </div>
                <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", opacity: canShowActualError ? 1 : 0.25 }}>
                  <button
                    type="button"
                    onClick={() => setSecondaryMode("error")}
                    disabled={secondaryMode === "error" || !canShowActualError}
                    style={mapTabButtonStyle(secondaryMode === "error")}
                  >
                    Error
                  </button>
                </div>
                {/* Relation tab — only visible in source mode */}
                {isSourceMode && (
                  <button
                    type="button"
                    onClick={() => setSecondaryMode("relation")}
                    disabled={secondaryMode === "relation" || !(activeMode === "relation" || activeMode === "instance")}
                    title={!(activeMode === "relation" || activeMode === "instance") ? "Select a relation tab on the left map first" : undefined}
                    style={mapTabButtonStyle(secondaryMode === "relation", {
                      opacity: !(activeMode === "relation" || activeMode === "instance") ? 0.25 : 1,
                    })}
                  >
                    Relation
                  </button>
                )}
              </div>
              {forecastErrorText && targetForecastEligible ? (
                <span
                  style={{ color: "var(--color-danger-strong)", fontSize: 11, maxWidth: "100%", wordBreak: "break-word" }}
                  title={forecastErrorText}
                >
                  {forecastErrorText.length > 160 ? `${forecastErrorText.slice(0, 160)}…` : forecastErrorText}
                </span>
              ) : null}
              {anchorIsClamped && (
                <span style={{ fontSize: 15.5, color: "var(--color-warning)" }}>
                  Predicted Anchor Date: {forecastAnchorDate} (model max)
                </span>
              )}
              {activeMode === "instance" && relationTargetCommunityReady && (
                <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center", fontSize: 12, opacity: 0.0, cursor: 'default', userSelect: 'none' }}>
                  <strong>SHAP horizon</strong>
                </div>
              )}
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                <strong>Layer:</strong>
                <label>
                  <input
                    type="radio"
                    name="secondaryLayer"
                    checked={secondaryLayer === "community"}
                    onChange={() => {
                      setSecondaryLayer("community");
                      setSecondarySelectedId(null);
                    }}
                  />
                  Community
                </label>
                <label style={{ opacity: (secondaryMode !== "actual") ? 0.25 : 1 }}>
                  <input
                    type="radio"
                    name="secondaryLayer"
                    checked={secondaryLayer === "beat"}
                    disabled={secondaryMode !== "actual"}
                    onChange={() => {
                      setSecondaryLayer("beat");
                      setSecondarySelectedId(null);
                    }}
                  />
                  Beat
                </label>
                <label style={{ opacity: (secondaryMode !== "actual") ? 0.25 : 1 }}>
                  <input
                    type="radio"
                    name="secondaryLayer"
                    checked={secondaryLayer === "district"}
                    disabled={secondaryMode !== "actual"}
                    onChange={() => {
                      setSecondaryLayer("district");
                      setSecondarySelectedId(null);
                    }}
                  />
                  District
                </label>
              </div>
              {/* Right map: total vs average preference (averaging applies when Actual map is active) */}
              <div style={{ display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
                <strong>Count:</strong>
                <label>
                  <input
                    type="radio"
                    name="targetCountMode"
                    checked={targetCountMode === "average"}
                    onChange={() => setTargetCountMode("average")}
                  />
                  Average per day
                </label>
                <label>
                  <input
                    type="radio"
                    name="targetCountMode"
                    checked={targetCountMode === "total"}
                    onChange={() => setTargetCountMode("total")}
                  />
                  Total
                </label>
              </div>
            </div>
            <div
              style={{flex: "1 1 auto", minHeight: 0, overflow: "hidden", position: "relative", padding: "var(--space-2)", boxSizing: "border-box", width: "100%", display: "flex", flexDirection: "column", gap: "var(--space-2)"}}
            >
                {/* Map area 2*/}
                <div
                  style={{height: MAP_H, width: "100%", overflow: "hidden"}}
                >
                  <MapBoxMap
                    geo={secondaryGeo}
                    crimeCounts={rightCountsForMap}
                    legendTitle={rightMapLegendTitle}
                    layer={secondaryLayer}
                    selectedId={secondarySelectedId}
                    onSelectId={setSecondarySelectedId}
                    onHover={(h) => setHover(h ? { ...h, which: "right" } : null)}
                    recenterTrigger={recenterTrigger}
                    loading={rightMapLoading}
                    isErrorMap={secondaryMode === "error"}
                    isRelationMap={secondaryMode === "relation" && isSourceMode}
                    isSageMap={secondaryMode === "relation" && isSourceMode && relationDataMode === "sage"}
                  />
                </div>
            </div>
          </div>
        </div>
      </div>
      {showMapHoverTooltip &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: hover.x + 12,
              top: hover.y + 12,
              background: "var(--color-tooltip-bg)",
              color: "white",
              padding: "8px 10px",
              borderRadius: 6,
              fontSize: 12,
              pointerEvents: "none",
              /* Above side column + header; below AppHeaderHelp modal (z-index 2000) */
              zIndex: 1500,
              width: "420px",
              maxWidth: "calc(100vw - 24px)",
            }}
          >
            <div
              style={{
                fontWeight: 600,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {hover.text}
            </div>
            {canShowHoverData && (
              <>
                {hoverDailyLoading && (
                  <div style={{ marginTop: 6, opacity: 0.75 }}>Loading...</div>
                )}
                {!hoverDailyLoading && hoverDaily && hoverDaily.length > 0 && (
                  <TooltipMap
                    days={hoverDaily}
                    isRelationMap={
                      (activeMode === "relation" || activeMode === "instance") && hover.which === "left"
                    }
                    isSageMap={
                      ((relationDataMode === "sage" && (activeMode === "relation" || activeMode === "instance"))
                      || activeMode === "instance")
                      && hover.which === "left"
                    }
                  />
                )}
              </>
            )}
          </div>,
          document.body
        )}
    </Panel>
  );
}