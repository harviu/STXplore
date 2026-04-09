import { useMemo, useRef, useState, useEffect, useReducer } from "react";
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
import { active } from "d3";

const RTL_THEME = createTheme({ direction: "rtl" });

/** Visual emphasis for the active map tab (disabled when selected matches browser defaults poorly). */
function mapTabButtonStyle(selected, extra = {}) {
  const base = {
    padding: "6px 12px",
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
      background: "rgba(100, 115, 255, 0.42)",
      border: "2px solid rgb(155, 165, 255)",
      boxShadow: "0 0 14px rgba(120, 130, 255, 0.4)",
    };
  }
  return {
    ...base,
    background: "rgba(255, 255, 255, 0.07)",
    border: "1px solid rgba(255, 255, 255, 0.22)",
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
  const [secondaryMode, setSecondaryMode] = useState("target"); // "target" | "actual" | "error"

  // Per-tab layer + selection (left: source | relation | instance; right: target | actual | error)
  const [mapFaces, dispatchMapFaces] = useReducer(mapFacesReducer, initialMapFaces);

  const layer = mapFaces[activeMode].layer;
  const selectedId = mapFaces[activeMode].selectedId;
  const setLayer = (newLayer) =>
    dispatchMapFaces({ type: "SET_FACET_LAYER", facet: activeMode, layer: newLayer, clearSelection: true });
  const setSelectedId = (newId) =>
    dispatchMapFaces({ type: "SET_FACET_SELECTION", facet: activeMode, selectedId: newId });

  const secondaryLayer = mapFaces[secondaryMode].layer;
  const secondarySelectedId = mapFaces[secondaryMode].selectedId;
  const setSecondaryLayer = (newLayer) =>
    dispatchMapFaces({ type: "SET_FACET_LAYER", facet: secondaryMode, layer: newLayer, clearSelection: true });
  const setSecondarySelectedId = (newId) =>
    dispatchMapFaces({ type: "SET_FACET_SELECTION", facet: secondaryMode, selectedId: newId });

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
  const [pastDays, setPastDays] = useState(90);
  /** Inclusive start / exclusive end as day offsets after anchor (matches targetRange / tensor slice). */
  const [futureRange, setFutureRange] = useState([0, 30]);
  const [futureStart, futureEnd] = futureRange;
  const futureSpanDays = futureEnd - futureStart;

  // Source map: show total crime count vs average per day
  const [sourceCountMode, setSourceCountMode] = useState("average"); // "total" | "average"
  // Target/Actual map: show total crime count vs average per day
  const [targetCountMode, setTargetCountMode] = useState("average"); // "total" | "average"

  // Target map + Community: ML forecast loads automatically (API sums full model horizon)
  const [forecastModel, setForecastModel] = useState(FORECAST_MODEL_OPTIONS[0]);

  const [relationModel, setRelationModel] = useState(FORECAST_MODEL_OPTIONS[0]);

  // "mi" = mutual information (ground truth from data)
  // "sage" = model attribution (what the model learned to pay attention to)
  const [relationDataMode, setRelationDataMode] = useState("mi");

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
  
  // Crime counts state and relation values state (4D array) for heatmaps
  const [crimeCounts, setCrimeCounts] = useState(null);
  const [relationValues, setRelationValues] = useState(null);
  const [futureCounts, setFutureCounts] = useState(null);

  //Get boundary geometry
  const geo = BOUNDARY_GEO[layer];
  const secondaryGeo = BOUNDARY_GEO[secondaryLayer];

  const targetForecastEligible =
    secondaryMode === "target" || secondaryMode === "error" && secondaryLayer === "community";

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
  const { hoverDaily, hoverDailyLoading, canShowHoverData } = useHoverDailySeries({hover, activeMode, secondaryMode, tensorSourceId, model: relationModel, pastDays, futureStart, futureEnd, anchorDate, dataMode: relationDataMode, forecastAnchorDate, shapHorizon, });

  //Model relation counts
  const { counts: relationCounts, loading: relationLoading, error: relationError } = useModelRelationCounts(activeMode, layer, targetSelectedId, relationModel, relationDataMode);

  //Instance relation counts
  const { counts: instanceRelationCounts, loading: instanceRelationLoading, error: instanceRelationError } = useInstanceRelationCounts(activeMode, targetSelectedId, relationModel, pastDays, futureStart, futureEnd, relationDataMode);

  // Instance-level SHAP: target = right map selection, left map shows source attributions
  const { counts: shapCounts, loading: shapLoading, error: shapError, matrix: shapMatrix } = useInstanceShapCounts(
    activeMode, targetSelectedId, relationModel, forecastAnchorDate, shapHorizon
  );


  // Relation tab: community-only on both sides; snap right map to Target
  useEffect(() => {
    if (activeMode === "relation") {
      dispatchMapFaces({ type: "SET_FACET_LAYER", facet: "relation", layer: "community", clearSelection: false });
      setSecondaryMode("target");
      dispatchMapFaces({ type: "SET_FACET_LAYER", facet: "target", layer: "community", clearSelection: false });
    }
  }, [activeMode]);

  //get crime data for source heatmap
  useEffect(() => {
    if (activeMode === "source") {
      let cancelled = false;
      const ac = new AbortController();
      api.selectionAllDaily(layer, sourceRange(pastDays, anchorDate).start, sourceRange(pastDays, anchorDate).end, { signal: ac.signal })
      .then((data) => {
        if (cancelled) return;
        setCrimeCounts(data.daily);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (cancelled) return;
        console.error("selectionAllDaily failed:", err);
      });
      return () => {
        cancelled = true;
        ac.abort();
      };
    }
  }, [activeMode, layer, pastDays, anchorDate])

  //get data for relational heatmaps — fetches full horizon
  // and averages over the 30 horizon days to produce a (77 x pastDays) matrix
  useEffect(() => {
    if (activeMode === "source") return;
    if (!relationTargetCommunityReady || !targetSelectedId) {
      setRelationValues(null);
      return;
    }
      let cancelled = false;
      const ac = new AbortController();
            api.get4dData(pastDays, true, null, 30, true, Number(targetSelectedId) - 1, relationModel, relationDataMode, {
        signal: ac.signal,
        d3Start: 0,
        normalize: true,
      })
      .then((data) => {
        if (cancelled) return;
        setRelationValues(data);
      })
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (cancelled) return;
        console.error("get4dData failed:", err);
      });
      return () => {
        cancelled = true;
        ac.abort();
      };
  }, [activeMode, pastDays, targetSelectedId, relationModel, relationDataMode]);
  // Instance-level map on source side: 4D array → per-community time-averaged over slider date range.
  const {data: instanceSourceResp, loading: instanceSourceLoading, error: instanceSourceError} = useApi(({ signal }) => {
    if (activeMode !== "instance") return Promise.resolve(null);
    return api.instanceLevelSource(pastDays, futureStart, futureEnd, { signal });
  }, [activeMode, pastDays, futureStart, futureEnd]);

  //Get Data for Source HeatMap (used when activeMode is "source"; instance mode uses instanceSourceResp)
  const {data: leftTotalsResp, loading: leftTotalsLoading, error: leftTotalsError} = useApi(({ signal }) => {
    const { start, end } = sourceRange(pastDays, anchorDate);
    const apiLayer = UI_TO_API_LAYER[layer];
    return api.mapTotals(apiLayer, start, end, { signal });
  }, [layer, pastDays, anchorDate]);

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
        : activeMode === "instance" && relationTargetCommunityReady && shapCounts
          ? shapCounts
          : leftCrimeCounts;
    if (raw == null) return raw;
    if (
      activeMode === "source" &&
      sourceCountMode === "average" &&
      pastDays > 0
    ) {
      const out = {};
      for (const [id, val] of Object.entries(raw)) out[id] = val / pastDays;
      return out;
    }
    return raw;
  }, [activeMode, relationCounts, relationTargetCommunityReady, shapCounts, leftCrimeCounts, sourceCountMode, pastDays]);


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
    return api.predictionByDate(forecastAnchorDate, forecastModel, { signal });
  }, [targetForecastReady, forecastAnchorDate, forecastModel, secondarySelectedId]);
  
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
    targetForecastEligible,
    forecastCountsForMap,
    rightCrimeCounts,
    errorForMap,
    targetCountMode,
    futureSpanDays,
  ]);

  const rightMapLegendTitle = useMemo(() => {
    if (secondaryMode === "error") {
      return targetCountMode === "average"
        ? "Avg difference per day"
        : "Difference (actual - target)";
    }
    if (secondaryMode === "target") {
      if (targetForecastEligible) {
        return targetCountMode === "average"
          ? "Avg forecast per day"
          : `Forecast total (${forecastModel}, full horizon)`;
      }
      return targetCountMode === "average" ? "Avg predicted crimes per day" : "Predicted Crime Count";
    }
    if (secondaryMode === "actual") {
      return targetCountMode === "average" ? "Avg crimes per day" : "Crime Count";
    }
    return "Crime Count";
  }, [secondaryMode, targetCountMode, targetForecastEligible, forecastModel]);

  const rightMapLoading = targetForecastEligible
    ? predBoundsLoading || (targetForecastReady && forecastDailyLoading)
    : rightTotalsLoading;

  const forecastErrorText = predBoundsError || forecastDailyError;

  // Load dummy crime counts for source mode
  // NOT NEEDED ANYMORE, MAKING SINGLE LINE AND COMMENTING OUT
  //useEffect(() => { if (activeMode !== "relation") { setCrimeCounts(null); return; } let mounted = true; loadDummyCrimeCounts(pastDays, layer).then(counts => { if (mounted) { setCrimeCounts(counts); } }).catch(error => { console.error('Error loading dummy crime data:', error); if (mounted) { setCrimeCounts(null); } }); return () => { mounted = false; }; }, [activeMode, layer, pastDays]);


  function makeSelection(mode, layerX, idX, daysX, anchorISO, dateOffsetDays) {
    if (!idX) return null;
    const geoX = BOUNDARY_GEO[layerX];

    const getIdxId = (f) => getBoundaryId(layerX, f);
    const idx = indexById(geoX.features, getIdxId);
    const feature = idx.get(idX);
    if (!feature) return null;

    const anchor = new Date(anchorISO);
    const date = new Date(anchor);
    date.setDate(date.getDate() + dateOffsetDays);
    const dateISO = date.toISOString().slice(0, 10);

    return {mode, layer: layerX, id: idX, name: getBoundaryLabel(layerX, feature), days: daysX, dateISO, feature};
  }

  const sourceSelection = useMemo(() => makeSelection("source", sourceLayer, sourceSelectedId, pastDays, anchorDate, -pastDays), [sourceLayer, sourceSelectedId, pastDays, anchorDate]);
  const relationSelection = useMemo(() => makeSelection("relation", relationLayer, relationSelectedId, pastDays, anchorDate, -pastDays), [relationLayer, relationSelectedId, pastDays, anchorDate]);
  const instanceSelection = useMemo(() => makeSelection("instance", instanceLayer, instanceSelectedId, pastDays, anchorDate, -pastDays), [instanceLayer, instanceSelectedId, pastDays, anchorDate]);
  const targetSelection = useMemo(() => makeSelection("target", targetLayer, targetSelectedId, futureSpanDays, anchorDate, futureEnd),[targetLayer, targetSelectedId, futureSpanDays, futureEnd, anchorDate]);
  const actualSelection = useMemo(() => makeSelection("actual", actualLayer, actualSelectedId, futureSpanDays, anchorDate, futureEnd),[actualLayer, actualSelectedId, futureSpanDays, futureEnd, anchorDate]);
  const errorSelection = useMemo(() => makeSelection("error", errorLayer, errorSelectedId, futureSpanDays, anchorDate, futureEnd),[errorLayer, errorSelectedId, futureSpanDays, futureEnd, anchorDate]);

  //Chooses what selection should drive the Left map summary
  const leftSelection = activeMode === "source" ? sourceSelection: activeMode === "relation" ? relationSelection : instanceSelection;

  //Chooses what selection should drive the Right map summary
  const rightSelection = secondaryMode === "target" ? targetSelection : secondaryMode === "actual" ? actualSelection : errorSelection;

  const {data: leftSummary, loading: leftSummaryLoading, error: leftSummaryError} = useApi(({ signal }) => {
      if (!leftSelection) return Promise.resolve(null);

      const { start, end } = sourceRange(pastDays, anchorDate);
      return api.selectionSummary(leftSelection.layer, leftSelection.id, start, end, { signal });
    },
    [leftSelection?.mode, leftSelection?.layer, leftSelection?.id, pastDays, anchorDate],
    { keepPreviousData: false }
  );

  const {data: leftDailyResp} = useApi(({ signal }) => {
    if (!leftSelection) return Promise.resolve(null);
    const { start, end } = sourceRange(pastDays, anchorDate);
    return api.selectionDaily(leftSelection.layer, leftSelection.id, start, end, { signal });
  }, [leftSelection?.mode, leftSelection?.layer, leftSelection?.id, pastDays, anchorDate], { keepPreviousData: false });

  const {data: rightSummary, loading: rightSummaryLoading, error: rightSummaryError} = useApi(({ signal }) => {
      if (!rightSelection) return Promise.resolve(null);

      const { start, end } = targetRange(futureStart, futureEnd, anchorDate);
      return api.selectionSummary(rightSelection.layer, rightSelection.id, start, end, { signal });
    },
    [rightSelection?.mode, rightSelection?.layer, rightSelection?.id, futureStart, futureEnd, anchorDate],
    { keepPreviousData: false }
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

  useEffect(()=>{
    //use for error clusterheatmap
    //console.log(futureCounts);
    //console.log(dailyForHeatMap);
  },[futureCounts,dailyForHeatMap]);

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
      left: {selection: leftSelection, summary: leftSummary, loading: leftSummaryLoading, error: leftSummaryError, range: sourceRange(pastDays, anchorDate), days: pastDays, daily: leftDailyResp?.daily ?? null},
      right: {selection: rightSelection, summary: rightSummary, loading: rightSummaryLoading, error: rightSummaryError, range: targetRange(futureStart, futureEnd, anchorDate), days: futureSpanDays, offset: futureStart, forecastDaily: forecastDailySeries, forecastTotal,},
    });
  }, [
    leftSelection,
    leftSummary,
    leftSummaryLoading,
    leftSummaryError,
    leftDailyResp,
    pastDays,

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

  //
  const thirtyDaysAgo = new Date(); 
  // fallback to today if max date not loaded yet
  if (maxDataDate) thirtyDaysAgo.setTime(maxDataDate.getTime());
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const canShowActualError = maxDataDate && new Date(addDaysISO(anchorDate, futureEnd) + "T00:00:00") <= maxDataDate;

//Reset to target if invalid actual/error
  useEffect(() => {
    if (secondaryMode !== "target" && !canShowActualError) {
      setSecondaryMode("target");
    }
  }, [canShowActualError]);

   //get crime data for actual heatmap. Has to be done after canShowActualError is calculated for the first time
  useEffect(() => {
    if (secondaryMode === "actual" || secondaryMode === "error") {
      let cancelled = false;
      const ac = new AbortController();
      if (canShowActualError) {
        api.selectionAllDaily(secondaryLayer, targetRange(futureStart, futureEnd, anchorDate).start, targetRange(futureStart, futureEnd, anchorDate).end, { signal: ac.signal })
        .then((data) => {
          if (cancelled) return;
          setFutureCounts(data.daily);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          if (cancelled) return;
          console.error("selectionAllDaily for actual failed:", err);
        });
        return () => {
          cancelled = true;
          ac.abort();
        };
      } 
      
    }
  }, [secondaryMode, secondaryLayer, futureStart, futureEnd, anchorDate, canShowActualError]);

  const isLoadingLeft = activeMode === "source" 
    ? leftTotalsLoading 
    : activeMode === "relation" 
        ? relationLoading 
        : (shapLoading || instanceSourceLoading);

  return (
    <Panel title="Crime Map" fill style={{ minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 auto", minHeight: 0 }}>
        {/* Top toolbar: Anchor date + Recenter */}
        <div
          style={{display: "flex", flexWrap: "wrap", alignItems: "center", gap: 16, rowGap: 10, width: "100%", padding: "10px 0 6px", justifyContent: "center"}}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontWeight: 600, opacity: 0.95 }}>Anchor date</strong>
            <div ref={calendarRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setCalendarOpen((open) => !open)}
                title="Pick start date (anchor for source/target days)"
                style={{padding: "6px 14px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "inherit", fontSize: "inherit", fontWeight: 500, minWidth: 120}}
              >
                {anchorDate?.slice(0, 10) ?? anchorDate}
              </button>
              {calendarOpen && (
                <div
                  style={{position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 1000, background: "var(--panel-bg, #1e1e1e)", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.4)", padding: 8}}
                >
                  <DayPicker
                    mode="single"
                    autoFocus
                    defaultMonth={anchorDate ? new Date(anchorDate) : undefined}
                    selected={anchorDate ? new Date(anchorDate + "T12:00:00") : undefined}
                    onSelect={(date) => {
                      if (date) {
                        setAnchorDate(date.toISOString().slice(0, 10));
                        setCalendarOpen(false);
                        if (thirtyDaysAgo < date) {
                          setSecondaryMode("target");
                        }
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

          <span
            style={{width: 1, height: 22, background: "rgba(255,255,255,0.2)", borderRadius: 1, flexShrink: 0}}
            aria-hidden
          />

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontWeight: 600, opacity: 0.95 }}>Recenter</strong>
            <button
              type="button"
              onClick={() => setRecenterTrigger((t) => t + 1)}
              title={`Recenter both maps to Chicago (zoom ${CHICAGO_ZOOM})`}
              style={{padding: "6px 14px", cursor: "pointer", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 8, background: "rgba(255,255,255,0.1)", color: "inherit", fontSize: "inherit", fontWeight: 500}}
            >
              Recenter maps
            </button>
          </div>
        </div>

        <hr style={{ width: "100%", margin: "12px 0", opacity: 0.8 }} />

        <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", width: "100%", height: "100%", flexWrap: "wrap"}}>
          {/* Source/Relation Map */}
          <div style={{ flex: "1", flexDirection: "column", padding: "1em", display: "flex", alignItems: "center" }}>
            {/* Controls */}
            <div
              style={{width: "100%", marginTop: 6, marginBottom: 6, minHeight: 25}}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", width: "100%" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
                    onClick={() => setActiveMode("instance")}
                    disabled={activeMode === "instance" || !relationTargetCommunityReady}
                    title={!relationTargetCommunityReady && activeMode !== "instance" ? "Select a community on the Predicted map first." : undefined}
                    style={mapTabButtonStyle(activeMode === "instance", {
                      fontSize: "0.65rem",
                      lineHeight: 1.2,
                      opacity: !relationTargetCommunityReady ? 0.25 : 1,
                    })}
                  >
                    Instance <br/> Level
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveMode("relation"); setRelationDataMode("sage"); setSecondaryMode("target"); }}
                    disabled={(activeMode === "relation" && relationDataMode === "sage") || !relationTargetCommunityReady}
                    title={!relationTargetCommunityReady && activeMode !== "relation" ? "Select a community on the Predicted map first." : undefined}
                    style={mapTabButtonStyle(activeMode === "relation" && relationDataMode === "sage", {
                      fontSize: "0.65rem",
                      lineHeight: 1.2,
                      opacity: !relationTargetCommunityReady ? 0.25 : 1,
                    })}
                  >
                    Model <br/> Level
                  </button>
                  <button
                    type="button"
                    onClick={() => { setActiveMode("relation"); setRelationDataMode("mi"); setSecondaryMode("target"); }}
                    disabled={(relationDataMode === "mi" && activeMode === "relation") || !relationTargetCommunityReady}
                    title={!relationTargetCommunityReady && activeMode !== "relation" ? "Select a community on the Predicted map first." : undefined}
                    style={mapTabButtonStyle(activeMode === "relation" && relationDataMode === "mi", {
                      fontSize: "0.65rem",
                      lineHeight: 1.2,
                      opacity: !relationTargetCommunityReady ? 0.25 : 1,
                    })}
                  >
                    Data <br/> Level
                  </button>
              </div>
              {(activeMode === "relation" || activeMode === "instance" || secondaryMode === "target") && (
                <div style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 15 }}>
                  <strong>Relation model:</strong>
                  <select
                    value={relationModel}
                    onChange={(e) => setRelationModel(e.target.value)}
                    aria-label="Relation model"
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.25)",
                      background: "rgb(68, 68, 68)",
                      color: "inherit",
                      fontSize: "inherit",
                    }}
                  >
                    {FORECAST_MODEL_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              )}
              {activeMode === "instance" && relationTargetCommunityReady && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, opacity: 0.8 }}>
                  <strong>SHAP horizon:</strong>
                  <span>day {shapHorizon} (slider midpoint)</span>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
                  gap: 8,
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
              style={{flex: "1 1 auto", minHeight: 0, overflow: "hidden", position: "relative", padding: 12, boxSizing: "border-box", width: "100%", display: "flex", flexDirection: "column", gap: 10}}
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
                          ? shapError
                            ? "SHAP Error"
                            : relationTargetCommunityReady
                              ? `SHAP Attribution (horizon ${shapHorizon})`
                              : "Select a community on the Predicted map"
                          : relationDataMode === "sage"
                            ? "SAGE (red=suppressive, green=amplifying)"
                            : "Model Relation Weight"
                    }
                    layer={layer}
                    highlights={sourceHighlight}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    onHover={(h) => setHover(h ? { ...h, which: "left" } : null)}
                    recenterTrigger={recenterTrigger}
                    isRelationMap={activeMode === "relation" || activeMode === "instance"}
                    isSageMap={relationDataMode === "sage" && (activeMode === "relation" || activeMode === "instance")}
                    loading={
                      activeMode === "source"
                        ? leftTotalsLoading
                        : activeMode === "instance"
                          ? shapLoading || instanceSourceLoading
                          : relationLoading
                    }
                  />
                </div>
            </div>
            {/*slider row (source, relation, and instance use date range for left/right map data)*/}
            <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", width: "100%", height: "10%" }}>
              <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", width: "100%", height: "100%", justifyContent: "left" }}>
                <label htmlFor="pastDays" style={{ flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%", height: "100%" }}>
                    Source date: {pastDays} days before start <br/>({anchorDate})
                  </div>
                </label>
                <span aria-hidden />
                <label htmlFor="futureRange" style={{ flex: 1 }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%", height: "100%" }}>
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
                      onChange={(_e, value) => setPastDays(value)}
                      valueLabelDisplay="auto"
                      getAriaValueText={(v) => `${v} days ago`}
                      min={1}
                      max={90}
                      sx={{
                        width: "100%",
                        "& .MuiSlider-rail": { height: 10, borderRadius: 0, backgroundColor: "rgb(255, 255, 255)", strokeWidth: 2 },
                        "& .MuiSlider-track": { height: 10, borderRadius: 0, backgroundColor: "rgb(100, 100, 255)", strokeWidth: 2 },
                        "& .MuiSlider-thumb": {
                          width: 14,
                          height: 26,
                          borderRadius: 9999,
                          backgroundColor: "white",
                          border: "3px solid rgb(92, 92, 92)",
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
                  <div style={{ width: 4, minHeight: 32, backgroundColor: "rgb(92, 92, 92)", borderRadius: 2 }} />
                  <span style={{ fontSize: 10, color: "rgb(92, 92, 92)", marginTop: 2 }} />
                </div>
                <Slider
                  id="futureRange"
                  aria-label="Target window after anchor date"
                  value={futureRange}
                  onChange={(_e, value) => {
                    // Ensure the two thumbs are not the same
                    if (value[0] === value[1]) {
                      if (value[1] === 30) value[0] = 29;
                      else value[1] = value[0] + 1;
                    }
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
                    "& .MuiSlider-rail": { height: 10, borderRadius: 0, backgroundColor: "rgb(255, 255, 255)" },
                    "& .MuiSlider-track": { height: 10, borderRadius: 0, backgroundColor: "rgb(100, 100, 255)" },
                    "& .MuiSlider-thumb": {
                      width: 14,
                      height: 26,
                      borderRadius: 9999,
                      backgroundColor: "white",
                      border: "3px solid rgb(92, 92, 92)",
                    },
                  }}
                />
              </div>
            </div>
          </div>

          {/* Target Map */}
          <div style={{ flex: "1", flexDirection: "column", padding: "1em", display: "flex", alignItems: "center" }}>
            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", width: "100%" }}>
              {/* Model Level Relation Messages */}
                <div
                  style={{width: "100%", marginTop: 6, marginBottom: 6, minHeight: 18, fontSize: 13, fontWeight: 500, color: relationError ? "#ff6b6b" : "#ccc"}}
                >
                </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <strong>Map:</strong>
                <button
                  type="button"
                  onClick={() => setSecondaryMode("target")}
                  disabled={secondaryMode === "target"}
                  style={mapTabButtonStyle(secondaryMode === "target")}
                >
                  Predicted
                </button>
                <div style={{ display: "flex", gap: 8, alignItems: "center", opacity: canShowActualError ? 1 : 0.25 }}>
                  <button
                    type="button"
                    onClick={() => setSecondaryMode("actual")}
                    disabled={secondaryMode === "actual" || !canShowActualError}
                    style={mapTabButtonStyle(secondaryMode === "actual")}
                  >
                    Actual
                  </button>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", opacity: canShowActualError ? 1 : 0.25 }}>
                  <button
                    type="button"
                    onClick={() => setSecondaryMode("error")}
                    disabled={secondaryMode === "error" || !canShowActualError}
                    style={mapTabButtonStyle(secondaryMode === "error")}
                  >
                    Error
                  </button>
                </div>
              </div>
              {(activeMode === "relation" || activeMode === "instance" || secondaryMode === "target") && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 10,
                    alignItems: "center",
                    width: "100%",
                    fontSize: 15,
                  }}
                >
                  <select
                    value={forecastModel}
                    onChange={(e) => setForecastModel(e.target.value)}
                    disabled={secondaryLayer !== "community"}
                    aria-label="Forecast model"
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid rgba(255,255,255,0.25)",
                      background: "rgb(68, 68, 68)",
                      color: "inherit",
                      fontSize: "inherit",
                    }}
                  >
                    {FORECAST_MODEL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  {forecastErrorText && targetForecastEligible ? (
                    <span
                      style={{ color: "#ff6b6b", fontSize: 11, maxWidth: "100%", wordBreak: "break-word" }}
                      title={forecastErrorText}
                    >
                      {forecastErrorText.length > 160 ? `${forecastErrorText.slice(0, 160)}…` : forecastErrorText}
                    </span>
                  ) : null}
                  {anchorIsClamped && (
                    <span style={{ fontSize: 15.5, color: "#f0a500" }}>
                      Predicted Anchor Date: {forecastAnchorDate} (model max)
                    </span>
                  )}
                </div>
              )}
              {activeMode === "instance" && relationTargetCommunityReady && (
                <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, opacity: 0.0, cursor: 'default', userSelect: 'none' }}>
                  <strong>SHAP horizon</strong>
                </div>
              )}
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
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
              style={{flex: "1 1 auto", minHeight: 0, overflow: "hidden", position: "relative", padding: 12, boxSizing: "border-box", width: "100%", display: "flex", flexDirection: "column", gap: 10}}
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
                    isErrorMap={secondaryMode === "error"}
                    loading={rightMapLoading}
                  />
                </div>
              {/* Tooltip */}
              {hover && (hover.which === "right" ? !rightMapLoading : true) && (hover.which ==="left" ? !isLoadingLeft : true) && (
                <div
                  style={{position: "fixed", left: hover.x + 12, top: hover.y + 12, background: "rgba(0,0,0,0.85)", color: "white", padding: "8px 10px", borderRadius: 6, fontSize: 12, pointerEvents: "none", zIndex: 9999, width: "420px", maxWidth: "calc(100vw - 24px)"}}
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
                          isRelationMap={(activeMode === "relation" || activeMode === "instance")&&hover.which === "left"}
                          isSageMap={relationDataMode === "sage" && (activeMode === "relation" || activeMode === "instance") && hover.which === "left"}
                          />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}