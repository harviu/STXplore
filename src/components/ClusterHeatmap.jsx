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

export default function ClusterHeatmap({ data, selectedId, isRelationMap = false }) {
    const svgRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(document.documentElement.clientWidth);

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
            return data.map(d => ({ 
                ...d,
                count: Number(d.count) || 0
            }));
        }
    }, [data]);

    useEffect(() => {
        if (heatmapData.length > 0 && svgRef.current && isRelationMap) {
            d3.select(svgRef.current).selectAll("*").remove();
            const margin = { top: 20, right: 30, bottom: 30, left: 50 };
            const width = containerWidth - margin.left - margin.right;
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
                .attr("y", d => yScale(d.id+1))
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .style("fill", d => colorScale(d.count))
                .style("stroke", d => (selectedId !== null && String(d.id+1) === String(selectedId)) ? "blue" : "none")
                .style("stroke-width", d => (selectedId !== null && String(d.id+1) === String(selectedId)) ? 2 : 0)
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
        if (heatmapData.length > 0 && svgRef.current && !isRelationMap) {
            d3.select(svgRef.current).selectAll("*").remove();
            const margin = { top: 20, right: 30, bottom: 30, left: 50 };
            const width = containerWidth - margin.left - margin.right;
            const height = 740 - margin.top - margin.bottom;
            const svg = d3.select(svgRef.current)
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            const id = Array.from(new Set(heatmapData.map(d => d.id))).sort((a,b) => d3.ascending(Number(a), Number(b)));
            const dates = Array.from(new Set(heatmapData.map(d => d.date))).sort((a,b) => d3.ascending(b,a));
            const xScale = d3.scaleBand().domain(dates).range([0, width]).padding(0.05);
            svg.append("g").style("font-size", "10px").call(d3.axisBottom(xScale).tickSize(0).tickFormat(d => {return dates.indexOf(d)+1})).select(".domain").remove();
            const yScale = d3.scaleBand().domain(id).range([10, height]).padding(0.05);
            svg.append("g").style("font-size", "10px").call(d3.axisLeft(yScale).tickSize(0)).select(".domain").remove();
            const colorScale = d3.scaleSequential().interpolator(interpolate).domain([0, d3.max(heatmapData, d => d.count)]);
            const tooltip = d3.select("#tooltip");
            const mouseover = function(event, d) {
                tooltip.style("opacity", 1);
                d3.select(this).style("stroke", "blue").style("stroke-width", 3).style("opacity", 1);
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
                const isSelected = selectedId !== null && String(d.id+1) === String(selectedId);
                d3.select(this).style("stroke", d => isSelected ? "blue" : "none").style("stroke-width", d => isSelected ? 2 : 0).style("opacity", 0.8);
            };
            svg.selectAll().data(heatmapData, d => d.id + ':' + d.date)
                .join("rect")
                .attr("x", d => xScale(d.date))
                .attr("y", d => yScale(d.id))
                .attr("rx", 4)
                .attr("ry", 4)
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                .style("fill", d => colorScale(d.count))
                .style("stroke", d => (selectedId !== null && String(d.id+1) === String(selectedId)) ? "blue" : "none")
                .style("stroke-width", d => (selectedId !== null && String(d.id+1) === String(selectedId)) ? 2 : 0)
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
    }, [heatmapData, selectedId, interpolate, containerWidth]);
        

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