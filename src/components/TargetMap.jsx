
import { useEffect, useMemo, useRef, useState } from "react";
import { select, geoPath, geoMercator } from "d3";

import comm from "../../data/Chicago-Data/Boundries/CommAreas_20250306/chicagoComm.json";
import beat from "../../data/Chicago-Data/Boundries/PoliceBeatDec2012_20250225/beats.json";
import district from "../../data/Chicago-Data/Boundries/PoliceDistrictDec2012_20250128/district.json";

function TargetMap() {
  console.log("Map component rendered");  
  const wrapperRef = useRef(null);
  const svgRef = useRef(null);

  const maps = useMemo(() => ({ c: comm, b: beat, d: district }), []);

  console.log("COMM SAMPLE:", comm.features[0].properties);
  console.log("BEAT SAMPLE:", beat.features[0].properties);
  console.log("DISTRICT SAMPLE:", district.features[0].properties);

  const [selectedMap, setSelectedMap] = useState("c");

  // Responsive sizing (updates when window size changes)
  const [size, setSize] = useState({ width: 900, height: 650 });

  // Tooltip state
  const [tooltip, setTooltip] = useState({
    visible: false,
    x: 0,
    y: 0,
    text: "",
  });

  // Click-selected feature id (so selection persists)
  const [selectedId, setSelectedId] = useState(null);

  //Slider for future date
  const [futureSliderValue, setFutureSliderValue] = useState(30);

  const handleFutureSlider = (event) => {
    setFutureSliderValue(event.target.value);
  };

  const mapChange = (event) => {
    setSelectedMap(event.target.value);
    setSelectedId(null); // reset selection when switching map type
  };

  // Update size on resize
  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      // Keep some reasonable minimums so projection doesn't get weird
      const w = Math.max(320, Math.floor(rect.width));
      const h = Math.max(400, Math.floor(rect.height));
      setSize({ width: w, height: h });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!svgRef.current) return;

    const data = maps[selectedMap];
    const svg = select(svgRef.current);
    const g = svg.select(".map");


    // Make svg scale to container
    svg.attr("viewBox", `0 0 ${size.width} ${size.height}`).attr("preserveAspectRatio", "xMidYMid meet");

    const projection = geoMercator().fitSize([size.width, size.height], data);
    const pathGen = geoPath(projection);


    // Helper to get a stable id + label for any feature
    const getFeatureId = (d) => {
      if (selectedMap === "c") return d.properties.area_num_1;
      if (selectedMap === "b") return d.properties.beat_num;
      if (selectedMap === "d") return d.properties.dist_num;
    };

    const getFeatureLabel = (d) => {
      if (selectedMap === "c")
        return `${d.properties.community} (Community Area ${d.properties.area_num_1})`;
    
      if (selectedMap === "b")
        return `Beat ${d.properties.beat_num} — District ${d.properties.district}`;
    
      if (selectedMap === "d")
        return `District ${d.properties.dist_label}`;
    
      return "Unknown";
    };

    // Draw
    g.selectAll("path")
      .data(data.features, (d) => getFeatureId(d))
      .join("path")
      .attr("d", pathGen)
      .attr("fill", (d) => (getFeatureId(d) === selectedId ? "#2563eb" : "#ccc"))
      .attr("stroke", "#fff")
      .attr("stroke-width", (d) => (getFeatureId(d) === selectedId ? 2.5 : 1.2))
      .style("cursor", "pointer")
      .on("mouseenter", (event, d) => {
        // highlight on hover (without breaking selected highlight)
        const id = getFeatureId(d);
        if (id !== selectedId) select(event.currentTarget).attr("fill", "#e72");

        setTooltip({
          visible: true,
          x: event.clientX,
          y: event.clientY,
          text: getFeatureLabel(d),
        });
      })
      .on("mousemove", (event) => {
        setTooltip((t) => ({
          ...t,
          x: event.clientX,
          y: event.clientY,
        }));
      })
      .on("mouseleave", (event, d) => {
        const id = getFeatureId(d);
        // restore correct fill
        select(event.currentTarget).attr("fill", id === selectedId ? "#2563eb" : "#ccc");

        setTooltip((t) => ({ ...t, visible: false }));
      })
      .on("click", (event, d) => {
        const id = getFeatureId(d);
        setSelectedId((prev) => (prev === id ? null : id));
      });
  }, [maps, selectedMap, selectedId, size.width, size.height]);

  return (
    <>
      <div style={{ textAlign: "center", marginBottom: 8 }}>
        <h2>Target Map</h2>
        <div>
          <input
            type="radio"
            id="Community"
            name="Maps"
            value="c"
            checked={selectedMap === "c"}
            onChange={mapChange}
          />
          <label htmlFor="Community"> Community Area Map</label>
        </div>
        <div>
          <input
            type="radio"
            id="Beats"
            name="Maps"
            value="b"
            checked={selectedMap === "b"}
            onChange={mapChange}
          />
          <label htmlFor="Beats"> Police Beats Map</label>
        </div>
        <div>
          <input
            type="radio"
            id="Districts"
            name="Maps"
            value="d"
            checked={selectedMap === "d"}
            onChange={mapChange}
          />
          <label htmlFor="Districts"> Police Districts Map</label>
        </div>

        {selectedId && (
          <div style={{ marginTop: 8, opacity: 0.9 }}>
            <strong>Selected:</strong> {selectedId}
          </div>
        )}
      </div>

      <div
        ref={wrapperRef}
        style={{
          width: "100%",
          height: "100%",
          minHeight: 400,
          position: "relative",
        }}
      >
        <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}>
          <g className="map" />
        </svg>

        {/* Tooltip */}
        {tooltip.visible && (
          <div
            style={{
              position: "fixed",
              left: tooltip.x + 12,
              top: tooltip.y + 12,
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
            {tooltip.text}
          </div>
        )}
      </div>
      <div className="futureSlider">
          <label htmlFor="futureSliderBar"> Predict {futureSliderValue} days from now</label>
          <input type="range" id="futureSliderBar" min="1" max="30" value={futureSliderValue} onChange={handleFutureSlider}/>
        </div>
    </>
  );
}

export default TargetMap;
