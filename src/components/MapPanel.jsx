import { useMemo, useRef, useState, useEffect } from "react";
import Panel from "./Panel.jsx";
import GeoMap from "./GeoMap.jsx";
import { BOUNDARY_GEO, getBoundaryId, getBoundaryLabel } from "../lib/boundaries.js";
import { indexById } from "../lib/indexById.js";

function useResizeObserverSize() {
  const ref = useRef(null);
  const [size, setSize] = useState({ width: 900, height: 650 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      const w = Math.max(0, Math.floor(rect.width));
      const h = Math.max(0, Math.floor(rect.height)); // IMPORTANT: no forced 400px min
      setSize({ width: w, height: h });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

export default function MapPanel({ onSelectionChange }) {
  const [activeMode, setActiveMode] = useState("source"); // "source" | "target"

  const [sourceLayer, setSourceLayer] = useState("community");
  const [targetLayer, setTargetLayer] = useState("community");

  const [sourceSelectedId, setSourceSelectedId] = useState(null);
  const [targetSelectedId, setTargetSelectedId] = useState(null);

  const [pastDays, setPastDays] = useState(90);
  const [futureDays, setFutureDays] = useState(30);

  const [hover, setHover] = useState(null);

  // Bind controls to the active entity
  const layer = activeMode === "source" ? sourceLayer : targetLayer;
  const setLayer = activeMode === "source" ? setSourceLayer : setTargetLayer;

  const selectedId = activeMode === "source" ? sourceSelectedId : targetSelectedId;
  const setSelectedId = activeMode === "source" ? setSourceSelectedId : setTargetSelectedId;

  const geo = BOUNDARY_GEO[layer];

  const getId = useMemo(() => (f) => getBoundaryId(layer, f), [layer]);
  const getLabel = useMemo(() => (f) => getBoundaryLabel(layer, f), [layer]);

  function makeSelection(mode, layerX, idX, daysX) {
    if (!idX) return null;
    const geoX = BOUNDARY_GEO[layerX];

    const getIdxId = (f) => getBoundaryId(layerX, f);
    const idx = indexById(geoX.features, getIdxId);
    const feature = idx.get(idX);
    if (!feature) return null;

    return {
      mode,
      layer: layerX,
      id: idX,
      name: getBoundaryLabel(layerX, feature),
      days: daysX,
      feature,
    };
  }

  const sourceSelection = useMemo(
    () => makeSelection("source", sourceLayer, sourceSelectedId, pastDays),
    [sourceLayer, sourceSelectedId, pastDays]
  );

  const targetSelection = useMemo(
    () => makeSelection("target", targetLayer, targetSelectedId, futureDays),
    [targetLayer, targetSelectedId, futureDays]
  );

  useEffect(() => {
    onSelectionChange?.({
      activeMode,
      source: sourceSelection,
      target: targetSelection,
    });
  }, [activeMode, sourceSelection, targetSelection, onSelectionChange]);

  const { ref: mapWrapRef, size } = useResizeObserverSize();

  return (
    <Panel title="Map" fill style={{ minHeight: 0 }}>
      {/* Controls */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <strong>Entity:</strong>
        <button onClick={() => setActiveMode("source")} disabled={activeMode === "source"}>
          Source
        </button>
        <button onClick={() => setActiveMode("target")} disabled={activeMode === "target"}>
          Target
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

      {/* ONE padded content box for: map + slider (so slider never "falls outside") */}
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
        {/* Map area shrinks/grows; slider stays visible */}
        <div
          ref={mapWrapRef}
          style={{
            flex: "1 1 auto",
            minHeight: 0,
            width: "100%",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <GeoMap
            geo={geo}
            width={size.width}
            height={size.height}
            selectedId={selectedId}
            getId={getId}
            getLabel={getLabel}
            onSelectId={setSelectedId}
            onHover={setHover}
          />
        </div>

        {/* Slider row */}
        <div style={{ flex: "0 0 auto" }}>
          {activeMode === "source" ? (
            <>
              <label htmlFor="pastDays">View {pastDays} days ago</label>
              <input
                id="pastDays"
                type="range"
                min="1"
                max="365"
                value={pastDays}
                onChange={(e) => setPastDays(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </>
          ) : (
            <>
              <label htmlFor="futureDays">Predict {futureDays} days from now</label>
              <input
                id="futureDays"
                type="range"
                min="1"
                max="365"
                value={futureDays}
                onChange={(e) => setFutureDays(Number(e.target.value))}
                style={{ width: "100%" }}
              />
            </>
          )}
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
    </Panel>
  );
}
