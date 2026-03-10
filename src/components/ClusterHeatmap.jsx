import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';

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
];

export default function ClusterHeatmap({ data, isRelationMap = false }) {
    const svgRef = useRef(null);

    const interpolate = useMemo(() => {
        return d3.interpolateRgbBasis(isRelationMap ? RELATION_STOPS : CHOROPLETH_STOPS);
    }, [isRelationMap]);

    //2D array of counts for each community and day, ensuring day is a num
    const heatmapData = useMemo(() => {
        if (!data) return;
        return data.flatMap((community, cid) => 
            community.map((day, did) => ({ id: cid, date: did, count: Number(day) || 0 }))
        );
        console.log("heatmap data updated:", processedData);
    }, [data]);

    useEffect(() => {
        if (heatmapData.length > 0 && svgRef.current) {
            d3.select(svgRef.current).selectAll("*").remove();
            const margin = { top: 20, right: 20, bottom: 30, left: 40 };
            const width = 430 - margin.left - margin.right;
            const height = 640 - margin.top - margin.bottom;
            const svg = d3.select(svgRef.current)
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            const ids = Array.from(new Set(heatmapData.map(d => d.id)));
            const days = Array.from(new Set(heatmapData.map(d => d.date)));
            const xScale = d3.scaleBand().domain(days).range([0, width]).padding(0.05);
            svg.append("g").style("font-size", "10px").call(d3.axisBottom(xScale).tickSize(0)).select(".domain").remove();
            const yScale = d3.scaleBand().domain(ids).range([0, height]).padding(0.05);
            svg.append("g").style("font-size", "10px").call(d3.axisLeft(yScale).tickSize(0)).select(".domain").remove();
            const colorScale = d3.scaleSequential().interpolator(interpolate).domain([0, d3.max(heatmapData, d => d.count)]);
            svg.selectAll().data(heatmapData, d => d.id + ':' + d.date)
                .join("rect")
                .attr("x", d => xScale(d.date))
                .attr("y", d => yScale(d.id))
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .style("fill", d => colorScale(d.count))
                .style("stroke", "none")
                .style("opacity", 0.8);
        }
    }, [heatmapData, interpolate]);
        

    return (
        <div id="cluster-heatmap" style={{ position: "relative" }}>
            <svg ref={svgRef} />
        </div>
    );
}