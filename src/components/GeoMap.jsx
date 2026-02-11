import { useEffect, useRef, useMemo } from "react";
import { select, geoPath, geoMercator, scaleSequential, interpolateYlOrRd } from "d3";

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
    crimeCounts, // Map<string, number> - boundary ID to crime count
}) {
    const svgRef = useRef(null);

    // Create color scale based on crime counts
    const colorScale = useMemo(() => {
        if (!crimeCounts || crimeCounts.size === 0) {
            return null;
        }
        
        const counts = Array.from(crimeCounts.values());
        const maxCount = Math.max(...counts, 1);
        const minCount = Math.min(...counts, 0);
        
        // Use yellow-orange-red color scheme for heat map
        return scaleSequential(interpolateYlOrRd)
            .domain([minCount, maxCount]);
    }, [crimeCounts]);

    useEffect(() => {
        if (!svgRef.current || !geo) return;

        const svg = select(svgRef.current);
        const g = svg.select(".map");

        svg.attr("viewBox", `0 0 ${width} ${height}`).attr("preserveAspectRatio", "xMidYMid meet");

        const projection = geoMercator().fitSize([width, height], geo);
        const pathGen = geoPath(projection);

        const fillFor = (d) => {
            const id = getId(d);
            if (id === selectedId) return "#2563eb";
            
            // Use heat map color if available, otherwise default gray
            if (colorScale && crimeCounts) {
                const count = crimeCounts.get(id) || 0;
                return colorScale(count);
            }
            return "#ccc";
        };
        
        const strokeWFor = (d) => (getId(d) === selectedId ? 2.5 : 1.2);

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
                if (id !== selectedId) {
                    // Darken on hover - use opacity for heat map colors
                    const currentFill = select(event.currentTarget).attr("fill");
                    if (currentFill !== "#ccc") {
                        select(event.currentTarget).attr("opacity", "0.8");
                    } else {
                        select(event.currentTarget).attr("fill", "#e72");
                    }
                }
                
                // Update tooltip with crime count if available
                let tooltipText = getLabel(d);
                if (crimeCounts) {
                    const count = crimeCounts.get(id) || 0;
                    tooltipText += ` - ${count} crime${count !== 1 ? 's' : ''}`;
                }
                onHover?.({ x: event.clientX, y: event.clientY, text: tooltipText });
            })
            .on("mousemove", (event, d) => {
                const id = getId(d);
                let tooltipText = getLabel(d);
                if (crimeCounts) {
                    const count = crimeCounts.get(id) || 0;
                    tooltipText += ` - ${count} crime${count !== 1 ? 's' : ''}`;
                }
                onHover?.({ x: event.clientX, y: event.clientY, text: tooltipText });
            })
            .on("mouseleave", (event, d) => {
                // restore correct fill and opacity
                select(event.currentTarget).attr("fill", fillFor(d));
                select(event.currentTarget).attr("opacity", "1");
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
    }, [geo, width, height, selectedId, getId, getLabel, onSelectId, onHover, colorScale, crimeCounts]);

    return (
        <svg ref={svgRef} style={{ width: "100%", height: "100%", display: "block" }}>
            <g className="map" />
        </svg>
    );
}
