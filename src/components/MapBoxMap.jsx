import { useEffect, useRef, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getBoundaryId, getBoundaryLabel } from "../lib/boundaries.js";

export const CHICAGO_CENTER = [-87.70, 41.84]; // Approximate center of Chicago
export const CHICAGO_ZOOM = 9.3; // Initial zoom level to show the whole city
const BOUNDARIES_SOURCE_ID = "boundaries";
const BOUNDARIES_LAYER_ID = "boundaries-fill";
const BOUNDARIES_SELECTED_LAYER_ID = "boundaries-selected";

const getMapboxToken = () => import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "";

//array of colors for the choropleth map
/** Yellow → orange → red choropleth colors */
const CHOROPLETH_STOPS = [
  "#ffffb2", // light yellow (low)
  "#fecc5c",
  "#fd8d3c",
  "#f03b20",
  "#bd0026", // dark red (high)
];

const RELATION_STOPS = [
  "#0acaff", //light blue (low)
  "#4ae4e4",
  "#66c2a4",
  "#2ca25f",
  "#006d2c", //dark green (high)
];

const LEGEND_TITLE = "Crime count";

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
  const minCount = counts.length ? Math.min(...counts) : 0;
  const maxCount = counts.length && isRelationMap ? Math.max(...counts, 0) : counts.length ? Math.max(...counts, 1) : 1;
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
}) {
  const stops = isRelationMap ? RELATION_STOPS : CHOROPLETH_STOPS;
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

  const { mergedGeo, minCount, maxCount } = useMemo(
    () => buildMergedGeo(geo, crimeCounts, layer, isRelationMap),
    [geo, crimeCounts, layer, isRelationMap]
  );

  const fillColorPaint = useMemo(
    () => getFillColorPaint(crimeCounts, minCount, maxCount, stops),
    [crimeCounts, minCount, maxCount, stops]
  );

  const legendSteps = useMemo(
    () => getLegendSteps(minCount, maxCount, stops, isRelationMap),
    [minCount, maxCount, stops, isRelationMap]
  );

  //Create the Mapbox
  useEffect(() => {
    if (!containerRef.current) return;

    const token = getMapboxToken().trim();
    if (!token) return;

    mapboxgl.accessToken = token;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: "mapbox://styles/mapbox/streets-v12",
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
      const features = map.queryRenderedFeatures(e.point, {
        layers: [BOUNDARIES_LAYER_ID],
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
      if (onHoverRef.current) {
        if (features.length > 0) {
          const feature = features[0];
          const idRaw = feature.properties?.boundary_id ?? getBoundaryId(layerRef.current, feature);
          const id = String(idRaw);
          const count = feature.properties?.count ?? 0;
          let text = getBoundaryLabel(layerRef.current, feature);
          if (crimeCountsRef.current != null && !isRelationMapRef.current) {
            text += ` — ${count} crime${count !== 1 ? "s" : ""}`;
          }
          if (isRelationMapRef.current && crimeCountsRef.current) {
            text += ` - ${count} relation`;
          }
          onHoverRef.current({
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
            text,
            id,
            layer: layerRef.current,
          });
        } else {
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
              {isRelationMap ? low.toFixed(4) : low} – {isRelationMap ? high.toFixed(4) : high}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
