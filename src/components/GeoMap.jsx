import { useEffect, useRef } from "react";
import { select, geoPath, geoMercator } from "d3";

/**
 * Controlled D3 Geo map.
 * - parent owns selectedId and tooltip state
 * - this component only renders and emits events
*/

export default function GeoMap({
    geo,
    width,
    height,
    selectedId,
    getId,
    getLabel,
    onSelectId,
    onHover,
}) {
    const svgRef = useRef(null);

    useEffect(() => {
        if (!svgRef.current || !geo) return;

        const svg = select(svgRef.current);
        const g = svg.select(".map");

        svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

        const projection = geoMercator().fitSize([width, height], geo);
        const pathGen = geoPath(projection);

        const fillFor = (d) => (getId(d) === selectedId ? "#ff9f1c" : "#ccc");
        const strokeWFor = (d) => (getId(d) === selectedId ? 1.5 : 0.6);

        g.selectAll("path")
            .data(geo.features, (d) => getId(d))
            .join("path")
            .attr("d", pathGen)
            .attr("fill", fillFor)
            .attr("stroke", "#fff")
            .attr("stroke-width", strokeWFor)
            .style("cursor", "pointer")
            .on("mouseenter", (event, d) => {
                const id = getId(d);
                if (id !== selectedId) select(event.currentTarget).attr("fill", "#e72");
                onHover?.({ x: event.clientX, y: event.clientY, text: getLabel(d) });
            })
            .on("mousemove", (event, d) => {
                onHover?.({ x: event.clientX, y: event.clientY, text: getLabel(d) });
            })
            .on("mouseleave", (event, d) => {
                // restore correct fill
                select(event.currentTarget).attr("fill", fillFor(d));
                onHover?.(null);
            })
            .on("click", (event, d) => {
                event.stopPropagation();
                const id = getId(d);
                onSelectId(id === selectedId ? null : id); // toggle
            });

            // click background clears selection
        svg.on("click", () => onSelectId(null));

        return () => {
            svg.on("click", null);
        };
    }, [geo, width, height, selectedId, getId, getLabel, onSelectId, onHover]);

    return (
        <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}>
            <g className="map" />
        </svg>
    );
}
