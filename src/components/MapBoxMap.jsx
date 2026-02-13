import { useEffect, useRef, useMemo } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import { getBoundaryId, getBoundaryLabel } from "../lib/boundaries.js";

const CHICAGO_CENTER = [-87.65, 41.85];
const CHICAGO_ZOOM = 10;
const BOUNDARIES_SOURCE_ID = "boundaries";
const BOUNDARIES_LAYER_ID = "boundaries-fill";
const BOUNDARIES_SELECTED_LAYER_ID = "boundaries-selected";

const getMapboxToken = () => import.meta.env.VITE_MAPBOX_ACCESS_TOKEN ?? "";

/** Yellow → orange → red choropleth colors */
const CHOROPLETH_STOPS = [
  "#ffffb2", // light yellow (low)
  "#fecc5c",
  "#fd8d3c",
  "#f03b20",
  "#bd0026", // dark red (high)
];

function buildMergedGeo(geo, crimeCounts, layer) {
  if (!geo?.features?.length) return { mergedGeo: geo, minCount: 0, maxCount: 1 };
  const hasCounts = crimeCounts && crimeCounts.size > 0;
  const features = geo.features.map((f) => {
    const id = getBoundaryId(layer, f);
    const count = hasCounts ? (crimeCounts.get(id) ?? 0) : 0;
    return {
      ...f,
      properties: { ...f.properties, boundary_id: id, count },
    };
  });
  const counts = features.map((f) => f.properties.count);
  const minCount = counts.length ? Math.min(...counts) : 0;
  const maxCount = counts.length ? Math.max(...counts, 1) : 1;
  return {
    mergedGeo: { type: "FeatureCollection", features },
    minCount,
    maxCount,
  };
}

function getFillColorPaint(crimeCounts, minCount, maxCount) {
  if (!crimeCounts || crimeCounts.size === 0) {
    return "#e07c3c";
  }
  const range = maxCount - minCount || 1;
  const stops = CHOROPLETH_STOPS.map((color, i) => {
    const t = i / (CHOROPLETH_STOPS.length - 1);
    const value = minCount + t * range;
    return [value, color];
  });
  return ["interpolate", ["linear"], ["get", "count"], ...stops.flat()];
}

export default function MapBoxMap({
  width = 900,
  height = 650,
  geo = null,
  crimeCounts = null,
  layer = "community",
  selectedId = null,
  onSelectId = null,
  onHover = null,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const geoRef = useRef(geo);
  const crimeCountsRef = useRef(crimeCounts);
  const layerRef = useRef(layer);
  const onSelectIdRef = useRef(onSelectId);
  const onHoverRef = useRef(onHover);
  const selectedIdRef = useRef(selectedId);
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

  const { mergedGeo, minCount, maxCount } = useMemo(
    () => buildMergedGeo(geo, crimeCounts, layer),
    [geo, crimeCounts, layer]
  );

  const fillColorPaint = useMemo(
    () => getFillColorPaint(crimeCounts, minCount, maxCount),
    [crimeCounts, minCount, maxCount]
  );

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
          buildMergedGeo(geoRef.current, crimeCountsRef.current, layerRef.current);
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

    const handleClick = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [BOUNDARIES_LAYER_ID],
      });
      if (features.length > 0 && onSelectIdRef.current) {
        const feature = features[0];
        const id = feature.properties?.boundary_id ?? getBoundaryId(layerRef.current, feature);
        const current = selectedIdRef.current;
        onSelectIdRef.current(id === current ? null : id);
      }
    };

    const handleMouseMove = (e) => {
      const features = map.queryRenderedFeatures(e.point, {
        layers: [BOUNDARIES_LAYER_ID],
      });
      map.getCanvas().style.cursor = features.length ? "pointer" : "";
      if (onHoverRef.current) {
        if (features.length > 0) {
          const feature = features[0];
          const count = feature.properties?.count ?? 0;
          let text = getBoundaryLabel(layerRef.current, feature);
          if (crimeCountsRef.current != null) {
            text += ` — ${count} crime${count !== 1 ? "s" : ""}`;
          }
          onHoverRef.current({
            x: e.originalEvent.clientX,
            y: e.originalEvent.clientY,
            text,
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
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (map && width > 0 && height > 0) {
      map.resize();
    }
  }, [width, height]);

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

  const token = getMapboxToken().trim();
  if (!token) {
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          minWidth: width,
          minHeight: height,
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

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "100%",
        minWidth: width,
        minHeight: height,
      }}
    />
  );
}
