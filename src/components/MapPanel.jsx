import { useMemo, useRef, useState, useEffect } from "react";
import Panel from "./Panel.jsx";
import MapBoxMap from "./MapBoxMap.jsx";
import { BOUNDARY_GEO, getBoundaryId, getBoundaryLabel } from "../lib/boundaries.js";
import { indexById } from "../lib/indexById.js";
import { loadDummyCrimeCounts } from "../lib/dummyCrimeData.js";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { api } from "../lib/api.js";
import { useApi } from "../hooks/useApi.js";

function toYYYYMMDD(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function rangeFromPastDays(pastDays, anchorDate, futureDays){
  const start = new Date(anchorDate);
  start.setDate(start.getDate() - pastDays);
  const end = new Date(anchorDate);
  end.setDate(end.getDate() + futureDays);
  return { start: toYYYYMMDD(start), end: toYYYYMMDD(end) };
}


function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function useResizeObserverSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 650 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height));
      setSize({ width: w, height: h });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

export default function MapPanel({ onSelectionChange }) {
  const [activeMode, setActiveMode] = useState("source"); // "source" | "relation"

  //community, beat, or district for each map
  const [sourceLayer, setSourceLayer] = useState("community");
  const [targetLayer, setTargetLayer] = useState("community");
  const [relationLayer, setRelationLayer] = useState("community");

  // Selected boundary IDs for each map
  const [sourceSelectedId, setSourceSelectedId] = useState(null);
  const [targetSelectedId, setTargetSelectedId] = useState(null);
  const [relationSelectedId, setRelationSelectedId] = useState(null);

  //date sliders
  const [pastDays, setPastDays] = useState(90);
  const [futureDays, setFutureDays] = useState(30);

  // Anchor date for "today" — default is current date; user can pick another via calendar
  const [anchorDate, setAnchorDate] = useState(() => todayISO());
  const [calendarOpen, setCalendarOpen] = useState(false);
  const calendarRef = useRef(null);

  const [hover, setHover] = useState(null);
  
  // Crime counts state (using dummy data for visualization)
  const [crimeCounts, setCrimeCounts] = useState(null);

  // Bind controls to the active entity
  const layer = activeMode === "source" ? sourceLayer : relationLayer;
  const setLayer = activeMode === "source" ? setSourceLayer : setRelationLayer;

  const selectedId = activeMode === "source" ? sourceSelectedId : relationSelectedId;
  const setSelectedId = activeMode === "source" ? setSourceSelectedId : setRelationSelectedId;

  const geo = BOUNDARY_GEO[layer];

  const getId = useMemo(() => (f) => getBoundaryId(layer, f), [layer]);
  const getLabel = useMemo(() => (f) => getBoundaryLabel(layer, f), [layer]);

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

  const targetSelection = useMemo(() => makeSelection("target", targetLayer, targetSelectedId, futureDays, anchorDate, futureDays),[targetLayer, targetSelectedId, futureDays, anchorDate]);

  const relationSelection = useMemo(() => makeSelection("relation", relationLayer, relationSelectedId, pastDays, anchorDate, -pastDays), [relationLayer, relationSelectedId, pastDays, anchorDate]);
   const activeSelection = activeMode === "source" ? sourceSelection : targetSelection;

  const { data: selectionSummary, loading: summaryLoading, error: summaryError } = useApi(
    ({ signal }) => {
      if (!activeSelection) return Promise.resolve(null);
      const { start, end } = rangeFromPastDays(pastDays, anchorDate, futureDays);
      return api.selectionSummary(
        activeSelection.layer,
        activeSelection.id,
        start,
        end,
        { signal }
      );
    },
    [activeSelection?.mode, activeSelection?.layer, activeSelection?.id, pastDays]
  );

  useEffect(() => {
    onSelectionChange?.({
      activeMode,
      inactiveMode: "target",
      anchorDate,
      inactiveMode: activeMode === "source" ? "target" : "source",
      source: sourceSelection,
      target: targetSelection,
      summary: selectionSummary,
      summaryLoading,
      summaryError,
      relation: relationSelection,
    });
  }, [
    activeMode,
    anchorDate, sourceSelection,
    targetSelection,
    selectionSummary,
    summaryLoading,
    summaryError,
    relationSelection, onSelectionChange,
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

  const { ref: mapWrapRef, size } = useResizeObserverSize();

  return (
    <Panel title="Crime Map" fill style={{ minHeight: 0, maxHeight: "95%" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", height: "85%"}}>
        {/* Date Picker */}
        <strong>Anchor date:</strong>
        <div ref={calendarRef} style={{ position: "relative", display: "inline-block" }}>
          <button
            type="button"
            onClick={() => setCalendarOpen((open) => !open)}
            title="Pick start date (anchor for source/target days)"
            style={{
              padding: "4px 10px",
              cursor: "pointer",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 6,
              background: "rgba(255,255,255,0.08)",
              color: "inherit",
              fontSize: "inherit",
            }}
          >
            {anchorDate}
          </button>
          {calendarOpen && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                marginTop: 4,
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
                selected={anchorDate ? new Date(anchorDate + "T12:00:00") : undefined}
                onSelect={(date) => {
                  if (date) {
                    setAnchorDate(date.toISOString().slice(0, 10));
                    setCalendarOpen(false);
                  }
                }}
                navLayout="around"
                startMonth={new Date(2001, 0)}
                showOutsideDays
                animate
                captionLayout="dropdown"
              />
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "row", width: "100%", height: "100%"}}>
          {/* Source/Relation Map */}
          <div style={{ flex: "1 1 auto", flexDirection: "column", padding: "0 8px", display: "flex", alignItems: "center" }}>
            {/* Controls */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong>Map:</strong>
              <button onClick={() => setActiveMode("source")} disabled={activeMode === "source"}>
                Source
              </button>
              <button onClick={() => setActiveMode("relation")} disabled={activeMode === "relation"}>
                Relation
              </button>

              <span style={{ opacity: 0.5, padding: "0 8px" }}>|</span>

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
              <label>
                <input
                  type="radio"
                  name="layer"
                  checked={layer === "beat"}
                  onChange={() => {
                    setLayer("beat");
                    setSelectedId(null);
                  }}
                />
                Beat
              </label>
              <label>
                <input
                  type="radio"
                  name="layer"
                  checked={layer === "district"}
                  onChange={() => {
                    setLayer("district");
                    setSelectedId(null);
                  }}
                />
                District
              </label>
            </div>
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overflow: "hidden",
                position: "relative",
                padding: "2.5%",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                ref={mapWrapRef}
                style={{
                  display: "flex",
                  flex: "1 1 auto",
                  flexDirection: "row",
                  gap: 16,
                  height: "100%",
                  minHeight: 0,
                }}
              >
                {/* Map area 1*/}
                <div
                  style={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <MapBoxMap
                    width={Math.max(0, Math.floor(size.width / 2))}
                    height={size.height}
                    geo={geo}
                    crimeCounts={crimeCounts}
                    layer={layer}
                    selectedId={selectedId}
                    onSelectId={setSelectedId}
                    onHover={setHover}
                  />
                </div>
              </div>
              

              {/* Slider row */}
              <div style={{ flex: "0 0 auto" }}>
                <>
                  <label htmlFor="pastDays">
                    Source date: {pastDays} days before start ({anchorDate})
                  </label>
                  <input
                    id="pastDays"
                    type="range"
                    min="1"
                    max="90"
                    value={pastDays}
                    onChange={(e) => setPastDays(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </>
              </div>

              {/* Tooltip */}
              {hover && (
                <div
                  style={{
                    position: "fixed",
                    left: hover.x + 12,
                    top: hover.y + 12,
                    background: "rgba(0,0,0,0.8)",
                    color: "white",
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    pointerEvents: "none",
                    maxWidth: 280,
                    zIndex: 9999,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {hover.text}
                </div>
              )}
            </div>
          </div>
          {/* Target Map */}
          <div style={{ flex: "1 1 auto", flexDirection: "column", padding: "0 8px", display: "flex", alignItems: "center" }}>
            {/* Controls */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <strong>Map:</strong>
              <button disabled>
                Target
              </button>

              <span style={{ opacity: 0.5, padding: "0 8px" }}>|</span>

              <strong>Layer:</strong>
              <label>
                <input
                  type="radio"
                  name="targetLayer"
                  checked={targetLayer === "community"}
                  onChange={() => {
                    setTargetLayer("community");
                    setTargetSelectedId(null);
                  }}
                />
                Community
              </label>
              <label>
                <input
                  type="radio"
                  name="targetLayer"
                  checked={targetLayer === "beat"}
                  onChange={() => {
                    setTargetLayer("beat");
                    setTargetSelectedId(null);
                  }}
                />
                Beat
              </label>
              <label>
                <input
                  type="radio"
                  name="targetLayer"
                  checked={targetLayer === "district"}
                  onChange={() => {
                    setTargetLayer("district");
                    setTargetSelectedId(null);
                  }}
                />
                District
              </label>
            </div>
            <div
              style={{
                flex: "1 1 auto",
                minHeight: 0,
                overflow: "hidden",
                position: "relative",
                padding: "2.5%",
                boxSizing: "border-box",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                ref={mapWrapRef}
                style={{
                  display: "flex",
                  flex: "1 1 auto",
                  flexDirection: "row",
                  gap: 16,
                  height: "100%",
                  minHeight: 0,
                }}
              >
                {/* Map area 2*/}
                <div
                  style={{
                    flex: "1 1 auto",
                    minHeight: 0,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <MapBoxMap
                    width={Math.max(0, Math.floor(size.width / 2))}
                    height={size.height}
                    geo={BOUNDARY_GEO[targetLayer]}
                    crimeCounts={null}
                    layer={targetLayer}
                    selectedId={targetSelectedId}
                    onSelectId={setTargetSelectedId}
                    onHover={setHover}
                  />
                </div>
              </div>
              

              {/* Slider row */}
              <div style={{ flex: "0 0 auto" }}>
                <>
                  <label htmlFor="futureDays">
                    Target date: {futureDays} days after start ({anchorDate})
                  </label>
                  <input
                    id="futureDays"
                    type="range"
                    min="1"
                    max="30"
                    value={futureDays}
                    onChange={(e) => setFutureDays(Number(e.target.value))}
                    style={{ width: "100%" }}
                  />
                </>
              </div>

              {/* Tooltip */}
              {hover && (
                <div
                  style={{
                    position: "fixed",
                    left: hover.x + 12,
                    top: hover.y + 12,
                    background: "rgba(0,0,0,0.8)",
                    color: "white",
                    padding: "6px 8px",
                    borderRadius: 6,
                    fontSize: 12,
                    pointerEvents: "none",
                    maxWidth: 280,
                    zIndex: 9999,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {hover.text}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </Panel>
  );
}
