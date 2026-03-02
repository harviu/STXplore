import { useMemo, useRef, useState, useEffect } from "react";
import Panel from "./Panel.jsx";
import MapBoxMap, { CHICAGO_ZOOM } from "./MapBoxMap.jsx";
import { BOUNDARY_GEO, getBoundaryId, getBoundaryLabel } from "../lib/boundaries.js";
import { indexById } from "../lib/indexById.js";
import { loadDummyCrimeCounts } from "../lib/dummyCrimeData.js";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";
import TooltipMap from "./tooltipMap.jsx";
import Slider from "@mui/material/Slider";
import { createTheme, ThemeProvider } from "@mui/material/styles";

const RTL_THEME = createTheme({ direction: "rtl" });

const UI_TO_API_LAYER = {
  community: "community_area",
  beat: "beat",
  district: "district",
};

function isoRangeDays(startISO, endISO) {
  const out = [];
  const d = new Date(startISO + "T00:00:00");
  const end = new Date(endISO + "T00:00:00");
  while (d < end) {
    out.push(toYYYYMMDD(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

function fillDaily(start, end, rows) {
  const by = new Map((rows ?? []).map((r) => [r.date, Number(r.count) || 0]));
  const dates = isoRangeDays(start, end);
  return dates.map((dt) => ({ date: dt, count: by.get(dt) ?? 0 }));
}

function responseToCounts(resp){
  // backend returns { start, end, date: [{ feature_id, count }, ...]}
  const rows = resp?.data ?? [];
  const out = {};
  for (const r of rows) {
    if (r?.feature_id == null) continue;
    out[String(r.feature_id)] = Number(r.count) || 0;
  }
  return out;
}

function addDaysISO(iso, days) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return toYYYYMMDD(d);
}

function toYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function sourceRange(pastDays, anchorISO) {
  const start = addDaysISO(anchorISO, -pastDays);
  const end = addDaysISO(anchorISO, 1);
  return { start, end: end}
}

 function targetRange(futureDays, anchorISO){
  const start = anchorISO;
  const end = addDaysISO(anchorISO, futureDays + 1);
  return { start, end: end};
 }

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function useResizeObserverSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let raf = 0;

    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const w = Math.max(0, Math.floor(rect.width));
        const h = Math.max(0, Math.floor(rect.height));
        setSize((prev) => {
          if (prev.width === w && prev.height === h) return prev;
          return { width: w, height: h};
        });
      });
    });

    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    }
  }, []);

  return { ref, size };
}

export default function MapPanel({ onSelectionChange }) {
  const MAP_H = "clamp(450px, 55vh, 550px)";
  const [activeMode, setActiveMode] = useState("source"); // "source" | "relation" | "instance"
  const [secondaryMode, setSecondaryMode] = useState("target"); // "target" | "actual" | "error"

  //community, beat, or district for each map
  const [sourceLayer, setSourceLayer] = useState("community");
  const [relationLayer, setRelationLayer] = useState("community");
  const [instanceLayer, setInstanceLayer] = useState("community");
  const [targetLayer, setTargetLayer] = useState("community"); //target is the prexicted layer
  const [actualLayer, setActualLayer] = useState("community");
  const [errorLayer, setErrorLayer] = useState("community"); // actual - predicted layer

  // Selected boundary IDs for each map
  const [sourceSelectedId, setSourceSelectedId] = useState(null);
  const [relationSelectedId, setRelationSelectedId] = useState(null);
  const [instanceSelectedId, setInstanceSelectedId] = useState(null);
  const [targetSelectedId, setTargetSelectedId] = useState(null);
  const [actualSelectedId, setActualSelectedId] = useState(null);
  const [errorSelectedId, setErrorSelectedId] = useState(null);

  //date sliders
  const [pastDays, setPastDays] = useState(90);
  const [futureDays, setFutureDays] = useState(30);

  // Anchor date — defaults to latest date in dataset once loaded; user can pick another via calendar
  const [anchorDate, setAnchorDate] = useState(() => todayISO());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef(null);

  const [hover, setHover] = useState(null);

  // Increment to recenter both maps to CHICAGO_ZOOM
  const [recenterTrigger, setRecenterTrigger] = useState(0);
  
  // Crime counts state (using dummy data for visualization)
  const [crimeCounts, setCrimeCounts] = useState(null);

  // Bind controls to the active entity
  const layer = activeMode === "source" ? sourceLayer : activeMode === "relation" ? relationLayer : instanceLayer;
  const setLayer = activeMode === "source" ? setSourceLayer : activeMode === "relation" ? setRelationLayer : setInstanceLayer;
  //then for the target map 
  const secondaryLayer = secondaryMode === "target" ? targetLayer : secondaryMode === "actual" ? actualLayer : errorLayer;
  const setSecondaryLayer = secondaryMode === "target" ? setTargetLayer : secondaryMode === "actual" ? setActualLayer : setErrorLayer;

  //The community/beat/district ID that's currently selected on the source/relation map
  const selectedId = activeMode === "source" ? sourceSelectedId : activeMode === "relation" ? relationSelectedId : instanceSelectedId;
  const setSelectedId = activeMode === "source" ? setSourceSelectedId : activeMode === "relation" ? setRelationSelectedId : setInstanceSelectedId;
  //and the one for the target/actual/error map
  const secondarySelectedId = secondaryMode === "target" ? targetSelectedId : secondaryMode === "actual" ? actualSelectedId : errorSelectedId;
  const setSecondarySelectedId = secondaryMode === "target" ? setTargetSelectedId : secondaryMode === "actual" ? setActualSelectedId : setErrorSelectedId;

  const geo = BOUNDARY_GEO[layer];
  const secondaryGeo = BOUNDARY_GEO[secondaryLayer];

  const getId = useMemo(() => (f) => getBoundaryId(layer, f), [layer]);
  const getLabel = useMemo(() => (f) => getBoundaryLabel(layer, f), [layer]);

  //Tooltip Map
  const [hoverDaily, setHoverDaily] = useState(null);
  const [hoverDailyLoading, setHoverDailyLoading] = useState(false);

  const hoverCacheRef = useRef(new Map()); // key -> filled daily array
  const hoverAbortRef = useRef(null);
  const hoverTimerRef = useRef(null);

  //Relation (model-level) counts for right map when activeMode === "relation"
  const [relationCounts, setRelationCounts] = useState(null); // { "1": num, ... , "77" : num}
  const [relationLoading, setRelationLoading] = useState(false);
  const [relationError, setRelationError] = useState(null);

  // Relation mode is community-only for now
  useEffect(() => {
    if (activeMode === "relation") {
      setRelationLayer("community"); // left layer for relation tab
      setSecondaryMode("target"); // ensure right map is on target tab
      setTargetLayer("community"); // right layer for target tab
    }
  }, [activeMode]);

  //Fetch relation weights only when in relation mode AND a community is selected
  useEffect(() => {
    // reset if not relation
    if (activeMode !== "relation") {
      setRelationCounts(null);
      setRelationLoading(false);
      setRelationError(null);
      return;
    }

    // Only community layer
    if (layer !== "community") {
      setRelationCounts(null);
      setRelationLoading(false);
      setRelationError("Model-level relation is only available for community layer right now.");
      return;
    }

    //reset if no commmunity selected 
    if (!relationSelectedId) {
      setRelationCounts(null);
      setRelationLoading(false);
      setRelationError(null);
      return;
    }

    //Make right map clearly show the same selected community
    setSecondaryMode("target");
    setTargetLayer("community");
    setTargetSelectedId(relationSelectedId);

    // Guard rail for invalid community id's
    const sourceIdx = Number(relationSelectedId) - 1; // "1..77" -> "0...76"
    if (!Number.isFinite(sourceIdx) || sourceIdx < 0 || sourceIdx > 76) {
      setRelationError("Invalid community id for relation mapping.");
      setRelationCounts(null);
      setRelationLoading(false);
      return;
    }
    // fetch weights under valid conditions
    let cancelled = false;
    const ac = new AbortController();
    setRelationLoading(true);
    setRelationError(null);
    api.relationalModel(sourceIdx, { signal: ac.signal })
      .then((data) => {
        //check if cancelled
        if (cancelled) return;

        // ensure valid array
        const targets = data?.targets;
        if(!Array.isArray(targets) || targets.length != 77) {
          throw new Error("Relation API returned invalid targets array.")
        }

        // Convert targets [0..76] -> { "1": v0, ... , "77" : v76 }
        const out = {};
        for (let j = 0; j < 77; j++) out[String(j + 1)] = Number(targets[j]) || 0;
        setRelationCounts(out);
        setRelationLoading(false);
      })
      // handle errors
      .catch((err) => {
        if (err?.name === "AbortError") return;
        if (cancelled) return;
        console.error("relationModel failed:", err);
        setRelationError(String(err?.message ?? err));
        setRelationCounts(null);
        setRelationLoading(false);
      });
      return () => {
        cancelled = true;
        ac.abort();
      };
  }, [activeMode, layer, relationSelectedId]);

  
  useEffect(() => {
    // Only build the strip for Left map hover
    if (!hover || hover.which !== "left" || !hover.id || !hover.layer) {
      setHoverDaily(null);
      setHoverDailyLoading(false);
      return;
    }

    const { start, end } = sourceRange(pastDays, anchorDate);
    const key = `${hover.layer}:${hover.id}:${start}:${end}`;

    const cached = hoverCacheRef.current.get(key);
    if (cached) {
      setHoverDaily(cached);
      setHoverDailyLoading(false);
      return;
    }

    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);

    hoverTimerRef.current = setTimeout(() => {
      if (hoverAbortRef.current) hoverAbortRef.current.abort();
      const ac = new AbortController();
      hoverAbortRef.current = ac;

      setHoverDaily(null);
      setHoverDailyLoading(true);

      api
        .selectionDaily(hover.layer, hover.id, start, end, { signal: ac.signal })
        .then((data) => {
          const filled = fillDaily(start, end, data?.daily).slice(0, 90);
          hoverCacheRef.current.set(key, filled);
          setHoverDaily(filled);
          setHoverDailyLoading(false);
        })
        .catch((err) => {
          if (err?.name === "AbortError") return;
          console.error("selectionDaily failed:", err);
          setHoverDaily(null);
          setHoverDailyLoading(false);
        });
    }, 200);

    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, [hover?.which, hover?.id, hover?.layer, pastDays, anchorDate]);

  //Get Data for Source HeatMap
  const {
    data: leftTotalsResp,
    loading: leftTotalsLoading,
    error: leftTotalsError,
  } = useApi(
    ({ signal }) => {
      const { start, end } = sourceRange(pastDays, anchorDate);
      const apiLayer = UI_TO_API_LAYER[layer];
      return api.mapTotals(apiLayer, start, end, { signal });
    },
    [layer, pastDays, anchorDate]
  );

  const leftCrimeCounts = useMemo(
    () => responseToCounts(leftTotalsResp),
    [leftTotalsResp]
  );

  //Get Data for Actual Heatmap
  const {
    data: rightTotalsResp,
    loading: rightTotalsLoading,
    error: rightTotalsError,
  } = useApi(
    ({ signal }) => {
      const { start, end } = targetRange(futureDays, anchorDate);
      const apiLayer = UI_TO_API_LAYER[secondaryLayer];
      return api.mapTotals(apiLayer, start, end, { signal });
    },
    [secondaryLayer, anchorDate, futureDays]
  );
  const rightCrimeCounts = useMemo(
    () => responseToCounts(rightTotalsResp),
    [rightTotalsResp]
  );

  // Load dummy crime counts for source mode
  useEffect(() => {
    if (activeMode !== "relation") {//Is source
      setCrimeCounts(null);
      return;
    }
    
    let mounted = true;
    
    loadDummyCrimeCounts(pastDays, layer)
      .then(counts => {
        if (mounted) {
          setCrimeCounts(counts);
        }
      })
      .catch(error => {
        console.error('Error loading dummy crime data:', error);
        if (mounted) {
          setCrimeCounts(null);
        }
      });
    
    return () => {
      mounted = false;
    };
  }, [activeMode, layer, pastDays]);

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

    return {
      mode,
      layer: layerX,
      id: idX,
      name: getBoundaryLabel(layerX, feature),
      days: daysX,
      dateISO,
      feature,
    };
  }

  const sourceSelection = useMemo(() => makeSelection("source", sourceLayer, sourceSelectedId, pastDays, anchorDate, -pastDays), [sourceLayer, sourceSelectedId, pastDays, anchorDate]);
  const relationSelection = useMemo(() => makeSelection("relation", relationLayer, relationSelectedId, pastDays, anchorDate, -pastDays), [relationLayer, relationSelectedId, pastDays, anchorDate]);
  const instanceSelection = useMemo(() => makeSelection("instance", instanceLayer, instanceSelectedId, pastDays, anchorDate, -pastDays), [instanceLayer, instanceSelectedId, pastDays, anchorDate]);
  const targetSelection = useMemo(() => makeSelection("target", targetLayer, targetSelectedId, futureDays, anchorDate, futureDays),[targetLayer, targetSelectedId, futureDays, anchorDate]);
  const actualSelection = useMemo(() => makeSelection("actual", actualLayer, actualSelectedId, futureDays, anchorDate, futureDays),[actualLayer, actualSelectedId, futureDays, anchorDate]);
  const errorSelection = useMemo(() => makeSelection("error", errorLayer, errorSelectedId, futureDays, anchorDate, futureDays),[errorLayer, errorSelectedId, futureDays, anchorDate]);

  //Chooses what selection should drive the Left map summary
  const leftSelection = activeMode === "source" ? sourceSelection: activeMode === "relation" ? relationSelection : instanceSelection;

  //Chooses what selection should drive the Right map summary
  const rightSelection = secondaryMode === "target" ? targetSelection : secondaryMode === "actual" ? actualSelection : errorSelection;

  const {
    data: leftSummary,
    loading: leftSummaryLoading,
    error: leftSummaryError,
  } = useApi (
    ({ signal }) => {
      if (!leftSelection) return Promise.resolve(null);

      const { start, end } = sourceRange(pastDays, anchorDate);
      return api.selectionSummary(leftSelection.layer, leftSelection.id, start, end, { signal });
    },
    [
      leftSelection?.mode,
      leftSelection?.layer,
      leftSelection?.id,
      pastDays,
      anchorDate,
    ]
  );

  const {
    data: rightSummary,
    loading: rightSummaryLoading,
    error: rightSummaryError,
  } = useApi (
    ({ signal }) => {
      if (!rightSelection) return Promise.resolve(null);

      const { start, end } = targetRange(futureDays, anchorDate);
      return api.selectionSummary(rightSelection.layer, rightSelection.id, start, end, { signal });
    },
    [
      rightSelection?.mode,
      rightSelection?.layer,
      rightSelection?.id,
      futureDays,
      anchorDate,
    ]
  );

  const { data: dateRange } = useApi(({ signal }) => api.dateRange({ signal }), []);

  // Disable dates after the latest date in the DB. Use start of next day (local) so "after" disables that day and all later.
  const maxDataDate = useMemo(() => {
    if (!dateRange?.max) return new Date(); // fallback: at least disable future if API not loaded
    const dateOnly = dateRange.max.slice(0, 10); // in case API returns "YYYY-MM-DD HH:mm:ss"
    const [y, m, d] = dateOnly.split("-").map(Number);
    return new Date(y, m - 1, d + 1); // 00:00:00 on the day after max
  }, [dateRange?.max]);

  // Default anchor date to latest date in dataset when date range loads (store date-only, no time)
  useEffect(() => {
    if (dateRange?.max) setAnchorDate(dateRange.max.slice(0, 10));
  }, [dateRange?.max]);

  useEffect(() => {
    onSelectionChange?.({
      activeMode,
      secondaryMode,
      anchorDate,

      //selections
      source: sourceSelection,
      relation: relationSelection,
      instance: instanceSelection,
      target: targetSelection,
      actual: actualSelection,
      error: errorSelection,
      //summaries (split)
      left: {
        selection: leftSelection,
        summary: leftSummary,
        loading: leftSummaryLoading,
        error: leftSummaryError,
        range: sourceRange(pastDays, anchorDate),
      },
      right: {
        selection: rightSelection,
        summary: rightSummary,
        loading: rightSummaryLoading,
        error: rightSummaryError,
        range: targetRange(futureDays, anchorDate),
      },
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

    leftSelection,
    leftSummary,
    leftSummaryLoading,
    leftSummaryError,
    pastDays,

    rightSelection,
    rightSummary,
    rightSummaryLoading,
    rightSummaryError,
    futureDays,

    onSelectionChange,
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

 /* useEffect(() => {
  console.log("LEFT size", leftSize);
}, [leftSize]);
*/
useEffect(() => {
  console.log("relation count", relationCounts);
}, [relationCounts]);

  const thirtyDaysAgo = new Date(); // fallback to today if max date not loaded yet
  if (maxDataDate) thirtyDaysAgo.setTime(maxDataDate.getTime());
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  return (
    <Panel title="Crime Map" fill style={{ minHeight: 0 }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: "1 1 auto", minHeight: 0 }}>
        {/* Top toolbar: Anchor date + Recenter */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 16,
            rowGap: 10,
            width: "100%",
            padding: "10px 0 6px",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontWeight: 600, opacity: 0.95 }}>Anchor date</strong>
            <div ref={calendarRef} style={{ position: "relative" }}>
              <button
                type="button"
                onClick={() => setCalendarOpen((open) => !open)}
                title="Pick start date (anchor for source/target days)"
                style={{
                  padding: "6px 14px",
                  cursor: "pointer",
                  border: "1px solid rgba(255,255,255,0.25)",
                  borderRadius: 8,
                  background: "rgba(255,255,255,0.1)",
                  color: "inherit",
                  fontSize: "inherit",
                  fontWeight: 500,
                  minWidth: 120,
                }}
              >
                {anchorDate?.slice(0, 10) ?? anchorDate}
              </button>
              {calendarOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    marginTop: 6,
                    zIndex: 1000,
                    background: "var(--panel-bg, #1e1e1e)",
                    borderRadius: 8,
                    boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
                    padding: 8,
                  }}
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
                    disabled={{ before: new Date(2001, 3, 2), after: new Date((dateRange?.max) + "T12:00:00") }}
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
            style={{
              width: 1,
              height: 22,
              background: "rgba(255,255,255,0.2)",
              borderRadius: 1,
              flexShrink: 0,
            }}
            aria-hidden
          />

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <strong style={{ fontWeight: 600, opacity: 0.95 }}>Recenter</strong>
            <button
              type="button"
              onClick={() => setRecenterTrigger((t) => t + 1)}
              title={`Recenter both maps to Chicago (zoom ${CHICAGO_ZOOM})`}
              style={{
                padding: "6px 14px",
                cursor: "pointer",
                border: "1px solid rgba(255,255,255,0.25)",
                borderRadius: 8,
                background: "rgba(255,255,255,0.1)",
                color: "inherit",
                fontSize: "inherit",
                fontWeight: 500,
              }}
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
              style={{
                width: "100%",
                marginTop: 6,
                marginBottom: 6,
                minHeight: 25,
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", width: "100%" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>Map:</strong>
                <button onClick={() => setActiveMode("source")} disabled={activeMode === "source"}>
                  Source
                </button>
                <button onClick={() => { setActiveMode("relation"); setSecondaryMode("target"); }} disabled={activeMode === "relation"} style={{fontSize:"0.65rem"}}>
                  Model-Level <br/>
                  Relation
                </button>
                <button onClick={() => setActiveMode("instance")} disabled={activeMode === "instance"} style={{fontSize:"0.65rem"}}>
                  Instance <br/> Level
                </button>
              </div>
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
                {activeMode !== "relation" ? (
                  <label>
                    <input
                      type="radio"
                      name="layer"
                      checked={layer === "beat"}
                      // disable when relation mode
                      disabled={activeMode === "relation"}
                      onChange={() => {
                        setLayer("beat");
                        setSelectedId(null);
                      }}
                    />
                    Beat
                  </label>
                ):(<></>)}
                {activeMode !== "relation" ? (
                  <label>
                    <input
                      type="radio"
                      name="layer"
                      checked={layer === "district"}
                      // disable when relation mode
                      disabled={activeMode === "relation"}
                      onChange={() => {
                        setLayer("district");
                        setSelectedId(null);
                      }}
                    />
                    District
                  </label>
                ):(<></>)}
              </div>
            </div>
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overflow: "hidden",
                position: "relative",
                padding: 12,
                boxSizing: "border-box",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
                {/* Map area 1*/}
                <div
                  style={{
                    height: MAP_H,
                    width: "100%",
                    overflow: "hidden",
                  }}
                >
                  <MapBoxMap
                    geo={geo}
                    crimeCounts={activeMode === "relation" ? relationCounts :leftCrimeCounts}
                    legendTitle={activeMode === "source" ? "Crime Count" : "Relation Weight"}
                    layer={layer}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    onHover={(h) => setHover(h ? { ...h, which: "left" } : null)}
                    recenterTrigger={recenterTrigger}
                    isRelationMap={activeMode === "relation"}
                  />
                </div>
            </div>
            {/*slider row(only appears on source)*/}
            {activeMode === "source" ? (
            <div style={{ display: "flex", flex:"1 1 auto", flexDirection: "column", width: "100%", height: "10%"}}>
              <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", width: "100%", height: "100%", justifyContent: "left" }}>
                <label htmlFor="pastDays" style={{flex: 1}}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%" , height: "100%" }}>
                  Source date: {pastDays} days before start <br/> ({anchorDate})
                  </div>
                </label>
                <span
                  
                  aria-hidden
                />
                <label htmlFor="futureDays" style={{flex: 1}}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, width: "100%", height: "100%" }}>
                  <span style={{alignSelf: "center"}}>Target date: {futureDays} days after start <br/>({anchorDate})</span>
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
                          "& .MuiSlider-rail": { height: 10, borderRadius: 0, backgroundColor: "rgb(255, 255, 255)", strokeWidth: 2},
                          "& .MuiSlider-track": { height: 10, borderRadius: 0, backgroundColor: "rgb(100, 100, 255)", strokeWidth: 2},
                          "& .MuiSlider-thumb": { width: 22, height: 22, backgroundColor: "white", border: "3px solid rgb(92, 92, 92)", marginRight: -2.5 },
                        }}
                      />
                    </div>
                  </ThemeProvider>
                  <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flexShrink: 0,
                    minWidth: 12,
                  }}
                  title={`Anchor date: ${anchorDate}`}
                  aria-hidden
                >
                  <div
                    style={{
                      width: 4,
                      minHeight: 32,
                      backgroundColor: "rgb(92, 92, 92)",
                      borderRadius: 2,
                    }}
                  />
                  <span style={{ fontSize: 10, color: "rgb(92, 92, 92)", marginTop: 2 }}></span>
                </div>
                <Slider
                    id="futureDays"
                    aria-label="Days after start"
                    value={futureDays}
                    onChange={(_e, value) => setFutureDays(value)}
                    valueLabelDisplay="auto"
                    getAriaValueText={(v) => `${v} days from now`}
                    step={1}
                    min={1}
                    max={30}
                    sx={{
                      width: "100%",
                      "& .MuiSlider-rail": { height: 10, borderRadius: 0, backgroundColor: "rgb(255, 255, 255)" },
                      "& .MuiSlider-track": { height: 10, borderRadius: 0 , backgroundColor: "rgb(100, 100, 255)"},
                      "& .MuiSlider-thumb": { width: 22, height: 22, backgroundColor: "white", border: "3px solid rgb(92, 92, 92)" },
                    }}
                  />
              </div>
            </div>) : null}
          </div>

          {/* Target Map */}
          <div style={{ flex: "1", flexDirection: "column", padding: "1em", display: "flex", alignItems: "center" }}>
            {/* Controls */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-start", width: "100%" }}>
              {/* Model Level Relation Messages */}
                <div
                  style={{
                    width: "100%",
                    marginTop: 6,
                    marginBottom: 6,
                    minHeight: 18, // reserves a line even when empty
                    fontSize: 13,
                    fontWeight: 500,
                    color: relationError ? "#ff6b6b" : "#ccc",
                  }}
                >
                  {activeMode === "relation" && secondaryMode === "target" ? (
                    <>
                      {relationLoading && "Loading model-level relation..."}
                      {!relationLoading && relationError && relationError}
                      {!relationLoading && !relationError && relationSelectedId && (
                        <>Showing relation from Community Area {relationSelectedId}</>
                      )}
                    </>
                  ) : null}
                </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <strong>Map:</strong>
                <button onClick={() => setSecondaryMode("target")} disabled={secondaryMode === "target"}>
                  Target                </button>
                {thirtyDaysAgo > new Date(anchorDate) && activeMode !== "relation" ? (
                  <div>
                    <button onClick={() => setSecondaryMode("actual")} disabled={secondaryMode === "actual"}>
                      Actual
                    </button>
                    <span style={{ opacity: 0.5, padding: "0 4px" }}></span>
                    <button onClick={() => setSecondaryMode("error")} disabled={secondaryMode === "error"}>
                      Error
                    </button>
                  </div>
                ):(<></>)}
              </div>
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
                {activeMode !== "relation" ? (
                  <label>
                    <input
                      type="radio"
                      name="secondaryLayer"
                      checked={secondaryLayer === "beat"}
                      // disable when using target as relation view
                      disabled={activeMode === "relation" && secondaryMode === "target"}
                      onChange={() => {
                        setSecondaryLayer("beat");
                        setSecondarySelectedId(null);
                      }}
                    />
                    Beat
                  </label>
                ):(<></>)}
                {activeMode !== "relation" ? (
                  <label>
                    <input
                      type="radio"
                      name="secondaryLayer"
                      checked={secondaryLayer === "district"}
                      disabled={activeMode === "relation" && secondaryMode === "target"}
                      onChange={() => {
                        setSecondaryLayer("district");
                        setSecondarySelectedId(null);
                      }}
                    />
                    District
                  </label>
                ):(<></>)}
              </div>
            </div>
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overflow: "hidden",
                position: "relative",
                padding: 12,
                boxSizing: "border-box",
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
                {/* Map area 2*/}
                <div
                  style={{
                    height: MAP_H,
                    width: "100%",
                    overflow: "hidden",
                  }}
                >
                  <MapBoxMap
                    geo={secondaryGeo}
                    crimeCounts={secondaryMode === "actual" ? rightCrimeCounts : null }
                    legendTitle={secondaryMode === "error" ? "Difference (actual - target)" : secondaryMode === "target" && activeMode === "relation" ? "Model Predicted Crime Count": secondaryMode === "target" ? "Predicted Crime Count" :"Crime Count"}
                    layer={secondaryLayer}
                    selectedId={secondarySelectedId}
                    onSelectId={setSecondarySelectedId}
                    onHover={(h) => setHover(h ? { ...h, which: "right" } : null)}
                    recenterTrigger={recenterTrigger}
                  />
                </div>
              {/* Tooltip */}
              {hover && (
                <div
                  style={{
                    position: "fixed",
                    left: hover.x + 12,
                    top: hover.y + 12,
                    background: "rgba(0,0,0,0.85)",
                    color: "white",
                    padding: "8px 10px",
                    borderRadius: 6,
                    fontSize: 12,
                    pointerEvents: "none",
                    zIndex: 9999,
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
                {hover.which === "left" && (
                  <>
                  {hoverDailyLoading && (
                    <div style={{ margintop: 6, opacity: 0.75 }}>Loading...</div>
                  )}
                  {!hoverDailyLoading && hoverDaily && hoverDaily.length > 0 && (
                    <TooltipMap days={hoverDaily}/>
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
