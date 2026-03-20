import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { da, he, sv } from 'date-fns/locale';

const CHOROPLETH_STOPS = [
  "#ffffb2",
  "#fecc5c",
  "#fd8d3c",
  "#f03b20",
  "#bd0026",
];
const RELATION_STOPS = [
  "#0acaff", //light blue (low)
  "#4ae4e4",
  "#66c2a4",
  "#2ca25f",
  "#006d2c", //dark green (high)
``];
const EMPTY_CELL_FILL = "rgba(255, 255, 255, 0.2)"; // subtle gray for zero/missing, reads cleaner than black

//distance function for clustering
const getDistance = (a, b) => {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - (b[i] || 0), 2), 0)); // Euclidean distance
};

//clustering function
const getClusterOrder = (matrix, ids) => {
    if (matrix.length <= 1) return ids;
    let remaining = [...matrix.map((data, i) => ({ data, id: ids[i] }))];
    const orderedIds = [remaining.shift().id]; // start with first id
    while (remaining.length > 0) {
        const lastData = matrix[ids.indexOf(orderedIds[orderedIds.length - 1])];
        remaining.sort((a, b) => getDistance(lastData, a.data) - getDistance(lastData, b.data)); //sort by distance
        orderedIds.push(remaining.shift().id); // add closest next
    }
    return orderedIds;
};

export default function ClusterHeatmap({ data, selectedId, isRelationMap = false, isFuture = false }) {
    const svgRef = useRef(null);
    const divRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(document.documentElement.clientWidth);
    const [isSelected, setIsSelected] = useState(false); //for toggle

    useEffect(() => {
        const handleResize = () => {
            setContainerWidth(document.documentElement.clientWidth);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const interpolate = useMemo(() => {
        return d3.interpolateRgbBasis(isRelationMap ? RELATION_STOPS : CHOROPLETH_STOPS);
    }, [isRelationMap]);

    //2D array of counts for each community and day, ensuring day is a num
    const heatmapData = useMemo(() => {
        if(isRelationMap){
            if (!data) return;
            return data.flatMap((community, cid) => 
                community.map((day, did) => ({ id: cid, date: did, count: Number(day) || 0 }))
            );
        } else {
            if (!data || !Array.isArray(data)) {return [];}
            const processed =  data.map(d => ({ 
                ...d,
                count: Number(d.count) || 0
            }));
            const allIds = Array.from(new Set(processed.map(d => d.id)));
            const allDates = Array.from(new Set(processed.map(d => d.date)));
            const dataMap = new Map(processed.map(d => [`${d.id}-${d.date}`, d.count]));
            const completeData = [];
            allIds.forEach(id => {
                allDates.forEach(date => {
                    const key = `${id}-${date}`;
                    if (dataMap.has(key)) {
                        completeData.push( {id, date, count: dataMap.get(key) });
                    } else {
                        completeData.push({ id, date, count: 0 });
                    }
                })
            });
            return completeData;
        }
    }, [data]);

    const clusteredIds = useMemo(() => {
        if (!heatmapData || heatmapData.length === 0) return [];
        const ids = Array.from(new Set(heatmapData.map(d => d.id))).sort((a, b) => a - b);
        const dates = Array.from(new Set(heatmapData.map(d => d.date))).sort();
        if (isRelationMap) ids.sort((a,b) => d3.ascending(Number(a), Number(b)));
        if(!isSelected) return ids; //dont cluster
        const matrix = ids.map(id => {
            return dates.map(date => {
                const entry = heatmapData.find(d => d.id === id && d.date === date);
                return entry ? entry.count : 0;
            });
        });
        return getClusterOrder(matrix, ids);

    }, [heatmapData, isSelected]);

    useEffect(() => {
        if (isRelationMap && heatmapData.length > 0 && svgRef.current) {
            d3.select(svgRef.current).selectAll("*").remove();
            const margin = { top: 20, right: 30, bottom: 30, left: 50 };
            const width = containerWidth - margin.left - margin.right;
            const height = 1200 - margin.top - margin.bottom;
            const svg = d3.select(svgRef.current)
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            const days = Array.from(new Set(heatmapData.map(d => d.date+1)));
            const xScale = d3.scaleBand().domain(days).range([0, width]).padding(0.12);
            svg.append("g").style("font-size", "11px").style("fill", "#b0b0b0").call(d3.axisBottom(xScale).tickSize(0)).select(".domain").remove();
            const yScale = d3.scaleBand().domain(clusteredIds).range([10, height]).padding(0.12);
            svg.append("g").style("font-size", "11px").style("fill", "#b0b0b0").call(d3.axisLeft(yScale).tickSize(0).tickFormat(d => d+1)).select(".domain").remove();
            const maxCount = d3.max(heatmapData, d => d.count);
            const colorScale = d3.scaleSequential().interpolator(interpolate).domain([maxCount > 0 ? 0 : 0, maxCount || 1]);
            const tooltip = d3.select(divRef.current);
            const mouseover = function(event, d) {
                tooltip.style("opacity", 1);
                d3.select(this).style("stroke", "magenta").style("stroke-width", 2).style("opacity", 1);
            };
            const mousemove = function(event, d) {
                const [x, y] = d3.pointer(event);
                tooltip.html(`Community: ${d.id+1}<br>Days Ago: ${d.date+1}<br>${isRelationMap ? "Relation" : "Count"}: ${d.count}`)
                    .style("left", (x + (x < containerWidth - 120 ? 10 : -80)) + "px")
                    .style("top", (y - 38) + "px")
                    .style("overflow", "wrap");
            };
            const mouseleave = function(event, d) {
                tooltip.style("opacity", 0);
                const isSelected = selectedId !== null && String(d.id+1) === String(selectedId);
                d3.select(this).style("stroke", d => isSelected ? "blue" : "none").style("stroke-width", d => isSelected ? 2 : 0).style("opacity", 0.8);
            };
            svg.selectAll().data(heatmapData, d => d.id + ':' + d.date)
                .join("rect")
                .attr("x", d => xScale(d.date+1))
                .attr("y", d => yScale(d.id))
                .attr("rx", 2)
                .attr("ry", 2)
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .style("fill", d => (d.count == null || d.count === 0) ? EMPTY_CELL_FILL : colorScale(d.count))
                .style("stroke", d => (selectedId !== null && String(d.id+1) === String(selectedId)) ? "blue" : "none")
                .style("stroke-width", d => (selectedId !== null && String(d.id+1) === String(selectedId)) ? 2 : 0)
                .style("opacity", 0.92)
                .on("mouseover", mouseover)
                .on("mousemove", mousemove)
                .on("mouseleave", mouseleave);
            svg.append("text")
                .attr("x", width / 2)
                .attr("y",  0 )
                .style("text-anchor", "middle")
                .style("font-size", "13px")
                .style("fill", "#e0e0e0")
                .style("font-weight", "500")
                .text("Days Ago");
            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("x", -height / 2)
                .attr("y", -20)
                .style("text-anchor", "middle")
                .style("font-size", "13px")
                .style("fill", "#e0e0e0")
                .style("font-weight", "500")
                .text("Community Number");
        }
        if (!isRelationMap && heatmapData.length > 0 && svgRef.current) {
            d3.select(svgRef.current).selectAll("*").remove();
            const margin = { top: 40, right: 30, bottom: 30, left: 50 };
            const width = containerWidth - margin.left - margin.right;
            const height = 1200 - margin.top - margin.bottom;
            const svg = d3.select(svgRef.current)
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            const dates = Array.from(new Set(heatmapData.map(d => d.date))).sort((a,b) => isFuture ? d3.ascending(a,b) : d3.ascending(b,a));
            const xScale = d3.scaleBand().domain(dates).range([10, width]).padding(0.12);
            svg.append("g").style("font-size", "11px").style("fill", "#b0b0b0").call(d3.axisBottom(xScale).tickSize(0).tickFormat(d => dates.indexOf(d))).select(".domain").remove();
            const yScale = d3.scaleBand().domain(clusteredIds.map(id => id)).range([10, height]).padding(0.12);
            svg.append("g").style("font-size", "11px").style("fill", "#b0b0b0").call(d3.axisLeft(yScale).tickSize(0)).select(".domain").remove();
            const maxCount = d3.max(heatmapData, d => d.count);
            const colorScale = d3.scaleSequential().interpolator(interpolate).domain([maxCount > 0 ? 0 : 0, maxCount || 1]);
            const tooltip = d3.select(divRef.current);
            const mouseover = function(event, d) {
                tooltip.style("opacity", 1);
                d3.select(this).style("stroke", "darkgreen").style("stroke-width", 3).style("opacity", 1);
            };
            const mousemove = function(event, d) {
                const [x, y] = d3.pointer(event);
                tooltip.html(`Community: ${d.id}<br>Date: ${d.date}<br>${isRelationMap ? "Relation" : "Count"}: ${d.count}`)
                    .style("left", (x + (x < containerWidth - 120 ? 10 : -80)) + "px")
                    .style("top", (y - 38) + "px")
                    .style("overflow", "wrap");
            };
            const mouseleave = function(event, d) {
                tooltip.style("opacity", 0);
                const isSelected = selectedId !== null && String(Number(d.id)) === String(selectedId);
                d3.select(this).style("stroke", d => isSelected ? "blue" : "none").style("stroke-width", d => isSelected ? 2 : 0).style("opacity", 0.8);
            };
            svg.selectAll().data(heatmapData, d => d.id + ':' + d.date)
                .join("rect")
                .attr("x", d => xScale(d.date))
                .attr("y", d => yScale(d.id))
                .attr("rx", 2)
                .attr("ry", 2)
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .style("fill", d => (d.count == null || d.count === 0) ? EMPTY_CELL_FILL : colorScale(d.count))
                .style("stroke", d => (selectedId !== null && String(Number(d.id)) === String(selectedId)) ? "blue" : "none")
                .style("stroke-width", d => (selectedId !== null && String(Number(d.id)) === String(selectedId)) ? 2 : 0)
                .style("opacity", 0.92)
                .on("mouseover", mouseover)
                .on("mousemove", mousemove)
                .on("mouseleave", mouseleave);
            svg.append("text")
                .attr("x", width / 2)
                .attr("y",  -10 )
                .style("text-anchor", "middle")
                .style("font-size", "13px")
                .style("fill", "#e0e0e0")
                .style("font-weight", "500")
                .text( isFuture ? "Days Ahead" : "Days Ago");
            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("x", -height / 2)
                .attr("y", -20)
                .style("text-anchor", "middle")
                .style("font-size", "13px")
                .style("fill", "#e0e0e0")
                .style("font-weight", "500")
                .text("Community Number");
        }
    }, [heatmapData, selectedId, interpolate, containerWidth, isSelected]);
        

    return (
        <div id="cluster-heatmap" style={{ position: "relative" }}>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "center" }}>
                <button 
                    onClick={() => setIsSelected(!isSelected)}
                    style={{
                        padding: "6px 12px",
                        backgroundColor: isSelected ? "#013d83" : "#333",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer"
                    }}
                >
                    {isSelected ? "Clear Clustering" : "Cluster by Similarity"}
                </button>
            </div>
            <svg ref={svgRef} />
            <div ref={divRef} style={{
                position: "absolute",
                backgroundColor: "white",
                border: "solid",
                borderWidth: "1px",
                borderRadius: "4px",
                padding: "4px",
                pointerEvents: "none",
                color: "black",
                fontSize: "10px",
                opacity: 0
            }}/>
        </div>
    );
}