import { useEffect, useRef, useMemo, useState } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getBoundaryId, getBoundaryLabel } from "../lib/boundaries.js";
import { CHOROPLETH_STOPS, RELATION_STOPS, SAGE_STOPS, ERROR_STOPS } from "../lib/colors.js"

export const CHICAGO_CENTER = [-87.70, 41.84]; // Approximate center of Chicago
export const CHICAGO_ZOOM = 9.1; // Initial zoom level to show the whole city
const BOUNDARIES_SOURCE_ID = "boundaries";
const BOUNDARIES_LAYER_ID = "boundaries-fill";
const BOUNDARIES_SELECTED_LAYER_ID = "boundaries-selected";

const getMapboxToken = () => import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "";


const LEGEND_TITLE = "Crime count";

// Mapbox style URLs for different base map styles. More styles can be added here as needed.
const mapStyles = {
  streets: 'mapbox://styles/mapbox/streets-v12',
  satellite: 'mapbox://styles/mapbox/satellite-streets-v12',
  dark: 'mapbox://styles/mapbox/dark-v11'
};

/** Build legend steps: array of { color, low, high } for vertical swatch legend */
function getLegendSteps(minCount, maxCount, stops = CHOROPLETH_STOPS, isRelationMap = false) {
  const range = maxCount - minCount || 0.001;
  const step = range / stops.length;
  return stops.map((color, i) => {
    const low = minCount + i * step;
    const high = minCount + (i + 1) * step;
    return {
      color,
      low: !isRelationMap ? Math.round(low) : low,
      high: !isRelationMap ? Math.round(high) : high,
    };
  });
}

//Boolean function to check if there are any crime counts
function hasAnyCounts(crimeCounts){
  if (!crimeCounts) return false;
  if(crimeCounts instanceof Map) return crimeCounts.size > 0;
  return Object.keys(crimeCounts).length > 0;
}

//A getter for crime counts, returns crime count if it exists or 0
function getCount(crimeCounts, id) {
  if (!crimeCounts) return 0;
  const key = String(id);
  if (crimeCounts instanceof Map) return crimeCounts.get(key) ?? crimeCounts.get(id) ?? 0;
  return crimeCounts[key] ?? crimeCounts[id] ?? 0;
}

//Adds crime count data to map data
function buildMergedGeo(geo, crimeCounts, layer, isRelationMap = false) {
  if (!geo?.features?.length) return { mergedGeo: geo, minCount: 0, maxCount: 1 };
  const hasCounts = hasAnyCounts(crimeCounts);
  const features = geo.features.map((f) => {
    const id = getBoundaryId(layer, f);
    const count = hasCounts ? getCount(crimeCounts, id) : 0;
    return {
      ...f,
      properties: { ...f.properties, boundary_id: String(id), count },
    };
  });
  const counts = features.map((f) => f.properties.count);
  const minCount = isRelationMap ? 0 : (counts.length ? Math.min(...counts) : 0);
  const maxCount = isRelationMap ? 100 : (counts.length ? Math.max(...counts, 1) : 1);
  return {
    mergedGeo: { type: "FeatureCollection", features },
    minCount,
    maxCount,
  };
}

//gives the coloring to the maps sections
function getFillColorPaint(crimeCounts, minCount, maxCount, stops = CHOROPLETH_STOPS) {
  const any = hasAnyCounts(crimeCounts);
  if (!any) return "#e07c3c";
  const range = maxCount - minCount || 0.001;
  const stopsArray = stops.map((color, i) => {
    const t = i / (stops.length - 1);
    const value = minCount + t * range;
    return [value, color];
  });
  return ["interpolate", ["linear"], ["get", "count"], ...stopsArray.flat()];
}

//The Mapbox component
export default function MapBoxMap({
  width = 900,
  height = 650,
  geo = null,
  crimeCounts = null,
  legendTitle = LEGEND_TITLE,
  layer = "community",
  selectedId = null,
  onSelectId = null,
  onHover = null,
  recenterTrigger = null,
  isRelationMap = false,
  isSageMap = false,
  isErrorMap = false,
  loading = false,
}) {
  // SAGE uses a signed diverging scale (red=suppressive, white=zero, green=amplifying).
  // Relation uses a sequential scale (low=cool, high=warm).
  // Source/target uses the choropleth scale.
  const stops = isSageMap ? SAGE_STOPS : isRelationMap ? RELATION_STOPS : isErrorMap ? ERROR_STOPS : CHOROPLETH_STOPS;
  //Hooks to ensure updates
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const initialRecenterDoneRef = useRef(false);
  const geoRef = useRef(geo);
  const crimeCountsRef = useRef(crimeCounts);
  const layerRef = useRef(layer);
  const onSelectIdRef = useRef(onSelectId);
  const onHoverRef = useRef(onHover);
  const selectedIdRef = useRef(selectedId);
  const isRelationMapRef = useRef(isRelationMap);
  const [mapStyle, setMapStyle] = useState('streets');
  const lastHoverStateRef = useRef(null); 
  
  useEffect(() => {
    onSelectIdRef.current = onSelectId;
  }, [onSelectId]);
  useEffect(() => {
    onHoverRef.current = onHover;
  }, [onHover]);
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    geoRef.current = geo;
  }, [geo]);
  useEffect(() => {
    crimeCountsRef.current = crimeCounts;
  }, [crimeCounts]);
  useEffect(() => {
    layerRef.current = layer;
  }, [layer]);
  useEffect(() => {
    isRelationMapRef.current = isRelationMap;
  }, [isRelationMap]);
  useEffect(() => {
  const map = mapRef.current;
  if (!map) return;
  map.setStyle(mapStyles[mapStyle]);
  map.once('style.load', () => {
    if (!map.getSource(BOUNDARIES_SOURCE_ID)) {
      map.addSource(BOUNDARIES_SOURCE_ID, {
        type: "geojson",
        data: mergedGeo ?? { type: "FeatureCollection", features: [] },
      });
      
      map.addLayer({
        id: BOUNDARIES_LAYER_ID,
        type: "fill",
        source: BOUNDARIES_SOURCE_ID,
        paint: {
          "fill-color": fillColorPaint,
          "fill-opacity": 0.65,
          "fill-outline-color": "#ffffff",
        },
      });

      map.addLayer({
        id: BOUNDARIES_SELECTED_LAYER_ID,
        type: "line",
        source: BOUNDARIES_SOURCE_ID,
        filter: ["==", ["get", "boundary_id"], selectedId ?? ""],
        paint: {
          "line-color": "#2563eb",
          "line-width": 3,
        },
      });
    }
  });
}, [mapStyle]);

  const [showLoadingOverlay, setShowLoadingOverlay] = useState(false);
  const loadingHideTimerRef = useRef(null);
  useEffect(() => {
    if (loading) {
      if (loadingHideTimerRef.current) clearTimeout(loadingHideTimerRef.current);
      setShowLoadingOverlay(true);
    } else {
      loadingHideTimerRef.current = setTimeout(() => setShowLoadingOverlay(false), 400);
    }
    return () => { if (loadingHideTimerRef.current) clearTimeout(loadingHideTimerRef.current); };
  }, [loading])


  const { mergedGeo, minCount, maxCount } = useMemo(
    () => buildMergedGeo(geo, crimeCounts, layer, isRelationMap && !isSageMap),
    [geo, crimeCounts, layer, isRelationMap, isSageMap]
  );

  const fillColorPaint = useMemo(
    () => getFillColorPaint(crimeCounts, minCount, maxCount, stops),
    [crimeCounts, minCount, maxCount, stops]
  );

  const legendSteps = useMemo(
    () => getLegendSteps(minCount, maxCount, stops, isRelationMap || isSageMap),
    [minCount, maxCount, stops, isRelationMap, isSageMap]
  );

  //Create the Mapbox
  useEffect(() => {
    if (!containerRef.current) return;

    const token = getMapboxToken().trim();
    if (!token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: mapStyles.streets,
      center: CHICAGO_CENTER,
      zoom: CHICAGO_ZOOM,
    });

    map.addControl(new mapboxgl.NavigationControl(), "bottom-left");

    map.on("load", () => {
      if (!map.getSource(BOUNDARIES_SOURCE_ID)) {
        const { mergedGeo: initial, minCount: minC, maxCount: maxC } =
          buildMergedGeo(geoRef.current, crimeCountsRef.current, layerRef.current, isRelationMapRef.current);
        const paint = getFillColorPaint(
          crimeCountsRef.current,
          minC,
          maxC
        );
        map.addSource(BOUNDARIES_SOURCE_ID, {
          type: "geojson",
          data: initial ?? { type: "FeatureCollection", features: [] },
        });
        map.addLayer({
          id: BOUNDARIES_LAYER_ID,
          type: "fill",
          source: BOUNDARIES_SOURCE_ID,
          paint: {
            "fill-color": paint,
            "fill-opacity": 0.65,
            "fill-outline-color": "#ffffff",
          },
        });
        map.addLayer({
          id: BOUNDARIES_SELECTED_LAYER_ID,
          type: "line",
          source: BOUNDARIES_SOURCE_ID,
          filter: ["==", ["get", "boundary_id"], ""],
          paint: {
            "line-color": "#2563eb",
            "line-width": 3,
          },
        });
      }
    });

    //handles clicking on layers
    const handleClick = (e) => {
      if (!map.getLayer(BOUNDARIES_LAYER_ID)) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: [BOUNDARIES_LAYER_ID],
      });
      if (features.length > 0 && onSelectIdRef.current) {
        const feature = features[0];
        const idRaw = feature.properties?.boundary_id ?? getBoundaryId(layerRef.current, feature);
        const id = String(idRaw);
        const current = selectedIdRef.current == null ? null : String(selectedIdRef.current);
        onSelectIdRef.current(id === current ? null : id);
      }
    };

    //gets the community the user is hovering over
    const handleMouseMove = (e) => {
      if (!map.getLayer(BOUNDARIES_LAYER_ID)) return;
      const features = map.queryRenderedFeatures(e.point, {
        layers: [BOUNDARIES_LAYER_ID],
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
      if (onHoverRef.current) {
        if (features.length > 0) {
          const feature = features[0];
          const idRaw = feature.properties?.boundary_id ?? getBoundaryId(layerRef.current, feature);
          const id = String(idRaw);
          const count = (isRelationMapRef.current && crimeCountsRef.current)
            ? Number(crimeCountsRef.current[id] ?? 0)
            : (feature.properties?.count ?? 0);
            
          let text = getBoundaryLabel(layerRef.current, feature);
          if (crimeCountsRef.current != null && !isRelationMapRef.current) {
            text += ` — ${count} crime${count !== 1 ? "s" : ""}`;
          }
          if (isRelationMapRef.current && crimeCountsRef.current && selectedIdRef.current) {
            text += ` - ${count} relation`;
          }
          lastHoverStateRef.current = { x: e.originalEvent.clientX, y: e.originalEvent.clientY, feature };
          onHoverRef.current({
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
            text,
            id,
            layer: layerRef.current,
          });
        } else {
          lastHoverStateRef.current = null;
          onHoverRef.current(null);
        }
      }
    };

    map.on("click", BOUNDARIES_LAYER_ID, handleClick);
    map.on("mousemove", handleMouseMove);
    map.on("mouseleave", BOUNDARIES_LAYER_ID, () => {
      map.getCanvas().style.cursor = "";
      if (onHoverRef.current) onHoverRef.current(null);
    });

    mapRef.current = map;
    const container = containerRef.current;

    // Recenter when the container first gets real dimensions (after layout).
    // Initial map creation often runs when the div is 0-sized, so the view is wrong.
    const ro = new ResizeObserver(() => {
      if (initialRecenterDoneRef.current) return;
      const m = mapRef.current;
      if (!m) return;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        initialRecenterDoneRef.current = true;
        m.resize();
        m.jumpTo({ center: CHICAGO_CENTER, zoom: CHICAGO_ZOOM });
      }
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Resize the map when the width or height change
  useEffect(() => {
    const container = containerRef.current;
    const map = mapRef.current;
    if(!container || !map) return;
    const ro = new ResizeObserver(() => {
      //prevent resize spam from causing layout jitter
      requestAnimationFrame(() => {
        if (!mapRef.current) return;
        mapRef.current.resize();
      });
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Draw the geo information onto Mapbox (layer, selected community, etc.)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mergedGeo) return;

    const source = map.getSource(BOUNDARIES_SOURCE_ID);
    if (source) {
      source.setData(mergedGeo);
      if (map.getLayer(BOUNDARIES_LAYER_ID)) {
        map.setPaintProperty(BOUNDARIES_LAYER_ID, "fill-color", fillColorPaint);
      }
    } else if (map.isStyleLoaded()) {
      map.addSource(BOUNDARIES_SOURCE_ID, {
        type: "geojson",
        data: mergedGeo,
      });
      map.addLayer({
        id: BOUNDARIES_LAYER_ID,
        type: "fill",
        source: BOUNDARIES_SOURCE_ID,
        paint: {
          "fill-color": fillColorPaint,
          "fill-opacity": 0.65,
          "fill-outline-color": "#ffffff",
        },
      });
      map.addLayer({
        id: BOUNDARIES_SELECTED_LAYER_ID,
        type: "line",
        source: BOUNDARIES_SOURCE_ID,
        filter: ["==", ["get", "boundary_id"], ""],
        paint: {
          "line-color": "#2563eb",
          "line-width": 3,
        },
      });
    }
  }, [mergedGeo, fillColorPaint]);

  // Update selected feature outline when selectedId changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(BOUNDARIES_SELECTED_LAYER_ID)) return;
    map.setFilter(BOUNDARIES_SELECTED_LAYER_ID, [
      "==",
      ["get", "boundary_id"],
      selectedId ?? "",
    ]);
  }, [selectedId]);

  // Recenter to Chicago when parent triggers (e.g. "Recenter" button)
  useEffect(() => {
    if (recenterTrigger == null) return;
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: CHICAGO_CENTER, zoom: CHICAGO_ZOOM });
  }, [recenterTrigger]);

  useEffect(() => {
    const h = lastHoverStateRef.current;
    if (!h || !onHoverRef.current) return;
    const { x, y, feature } = h;
    const idRaw = feature.properties?.boundary_id ?? getBoundaryId(layerRef.current, feature);
    const id = String(idRaw);
    const count = (isRelationMapRef.current && crimeCountsRef.current)
      ? Number(crimeCountsRef.current[id] ?? 0)
      : (feature.properties?.count ?? 0);
    let text = getBoundaryLabel(layerRef.current, feature);
    if (crimeCountsRef.current != null && !isRelationMapRef.current) {
      text += ` — ${count} crime${count !== 1 ? "s" : ""}`;
    }
    if (isRelationMapRef.current && crimeCountsRef.current && selectedIdRef.current) {
      text += ` - ${count} relation`;
    }
    onHoverRef.current({ x, y, text, id, layer: layerRef.current });
  }, [crimeCounts, loading]);

  //Make sure user can use Mapbox otherswise show message to add token in .env file. This should be for devs only, add a permanent token for production use.
  const token = getMapboxToken().trim();
  if (!token) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minWidth: `${width}px`,
          minHeight: `${height}px`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#eee",
          color: "#666",
          fontSize: 14,
          padding: 24,
          textAlign: "center",
        }}
      >
        Add <code>VITE_MAPBOX_ACCESS_TOKEN</code> to your <code>.env</code> file
        and restart the dev server.
      </div>
    );
  }

  // The map container. Mapbox GL will take over this div; legend overlay on top.
  // Wrapper has pointer-events: none so only the map receives clicks; map has pointer-events: auto.
  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        pointerEvents: "none",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "auto",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 10,
          right: 10,
          background: "white",
          borderRadius: 4,
          boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
          padding: "10px 12px",
          fontFamily: "sans-serif",
          fontSize: 12,
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            fontWeight: 600,
            marginBottom: 8,
            color: "#333",
          }}
        >
          {legendTitle}
        </div>
        {legendSteps.map(({ color, low, high }, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              marginBottom: i < legendSteps.length - 1 ? 4 : 0,
            }}
          >
            <div
              style={{
                width: 16,
                height: 16,
                backgroundColor: color,
                borderRadius: 2,
                flexShrink: 0,
              }}
            />
            <span style={{ color: "#333" }}>
              {isRelationMap ? Math.round(low) : low} - {isRelationMap ? Math.round(high) : high}
            </span>
          </div>
        ))}
      </div>
      {/* Loading Overlay */}
      {showLoadingOverlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(36, 36, 36, 0.75)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
            pointerEvents: "none",
          }}
        >
          <span style={{ color: "#fff", fontSize: 15, fontWeight: 600, letterSpacing: "0.03em", opacity: 0.9 }}>
            Loading...
          </span>
        </div>
      )}
      {/* Style Selector Dropdown */}
<div
  style={{
    position: "absolute",
    top: 10,
    left: 10,
    background: "white",
    borderRadius: 4,
    boxShadow: "0 1px 4px rgba(0,0,0,0.15)",
    padding: "8px",
    pointerEvents: "auto",
    zIndex: 1,
  }}
>
  <select
    id="map-style-select"
    value={mapStyle}
    onChange={(e) => setMapStyle(e.target.value)}
    style={{
      padding: "4px 8px",
      borderRadius: "4px",
      border: "1px solid #ccc",
      fontSize: "13px",
      cursor: "pointer",
      outline: "none",
      width: "120px"
    }}
  >
    {Object.keys(mapStyles).map((styleKey) => (
      <option key={styleKey} value={styleKey}>
        {styleKey.charAt(0).toUpperCase() + styleKey.slice(1)}
      </option>
    ))}
  </select>
</div>
    </div>
  );
}
