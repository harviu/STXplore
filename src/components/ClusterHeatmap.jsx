import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { sv } from 'date-fns/locale';

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
            const margin = { top: 20, right: 30, bottom: 30, left: 50 };
            const width = document.documentElement.clientWidth - margin.left - margin.right;
            const height = 740 - margin.top - margin.bottom;
            const svg = d3.select(svgRef.current)
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            const ids = Array.from(new Set(heatmapData.map(d => d.id+1)));
            const days = Array.from(new Set(heatmapData.map(d => d.date+1)));
            const xScale = d3.scaleBand().domain(days).range([0, width]).padding(0.05);
            svg.append("g").style("font-size", "10px").call(d3.axisBottom(xScale).tickSize(0)).select(".domain").remove();
            const yScale = d3.scaleBand().domain(ids).range([10, height]).padding(0.05);
            svg.append("g").style("font-size", "10px").call(d3.axisLeft(yScale).tickSize(0)).select(".domain").remove();
            const colorScale = d3.scaleSequential().interpolator(interpolate).domain([0, d3.max(heatmapData, d => d.count)]);
            const tooltip = d3.select("#tooltip");
            const mouseover = function(event, d) {
                tooltip.style("opacity", 1);
                d3.select(this).style("stroke", "black").style("opacity", 1);
            };
            const mousemove = function(event, d) {
                const [x, y] = d3.pointer(event);
                tooltip.html(`Community: ${d.id}<br>Days Ago: ${d.date+1}<br>Count: ${d.count}`)
                    .style("left", (x + (x < document.documentElement.clientWidth - 120 ? 10 : -80)) + "px")
                    .style("top", (y - 38) + "px")
                    .style("overflow", "wrap");
            };
            const mouseleave = function(event, d) {
                tooltip.style("opacity", 0);
                d3.select(this).style("stroke", "none").style("opacity", 0.8);
            };
            svg.selectAll().data(heatmapData, d => d.id + ':' + d.date)
                .join("rect")
                .attr("x", d => xScale(d.date+1))
                .attr("y", d => yScale(d.id+1))
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .style("fill", d => colorScale(d.count))
                .style("stroke", "none")
                .style("opacity", 0.8)
                .on("mouseover", mouseover)
                .on("mousemove", mousemove)
                .on("mouseleave", mouseleave);
            svg.append("text")
                .attr("x", width / 2)
                .attr("y",  0 )
                .style("text-anchor", "middle")
                .style("font-size", "12px")
                .style("fill", "#ffffff")
                .text("Days Ago");
            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("x", -height / 2)
                .attr("y", -20)
                .style("text-anchor", "middle")
                .style("font-size", "12px")
                .style("fill", "#ffffff")
                .text("Community Number");
        }
    }, [heatmapData, interpolate, document.documentElement.clientWidth]);
        

    return (
        <div id="cluster-heatmap" style={{ position: "relative" }}>
            <svg ref={svgRef} />
            <div id="tooltip" style={{
                opacity: 0,
                position: "absolute",
                backgroundColor: "white",
                border: "solid",
                borderWidth: "1px",
                borderRadius: "4px",
                padding: "4px",
                pointerEvents: "none",
                color: "black",
                fontSize: "10px"
            }}/>
        </div>
    );
}