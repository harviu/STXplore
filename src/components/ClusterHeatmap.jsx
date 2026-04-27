import { useEffect, useRef, useState, useMemo } from 'react';
import * as d3 from 'd3';
import { CHOROPLETH_STOPS, RELATION_STOPS, SAGE_STOPS } from "../lib/colors.js"
import { se } from 'date-fns/locale';

const EMPTY_CELL_FILL = "rgba(255, 255, 255, 0.2)"; // subtle gray for zero/missing, reads cleaner than black

//distance function for clustering
// Uses Euclidean distance between two community (or date) vectors.
// Missing values in b default to 0 via `|| 0` to handle ragged arrays.
const getDistance = (a, b) => {
    return Math.sqrt(a.reduce((sum, val, i) => sum + Math.pow(val - (b[i] || 0), 2), 0)); // Euclidean distance
};

//clustering function
// Agglomerative (bottom-up) hierarchical clustering using single-linkage with Euclidean distance.
// Starts with every item in its own cluster, then repeatedly merges the closest pair until
// one root node remains. The returned tree is consumed by d3.hierarchy to draw the dendrogram.
// The merged cluster's data vector is the element-wise mean of its two children — this is used
// as the representative vector for subsequent distance comparisons (average-linkage approximation).
const getClusterOrder = (matrix, ids) => {
    if (matrix.length < 1) return null; //handle empty data

    let nodes = matrix.map((data, i) => ({ id: ids[i], data: data, isLeaf: true })); //initially all are their own cluster
    while (nodes.length > 1) {
        let minDist = Infinity;
        let toMerge = [0, 0];
        //find closest pair of clusters
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const dist = getDistance(nodes[i].data, nodes[j].data);
                if (dist < minDist) {
                    minDist = dist;
                    toMerge = [i, j];
                }
            }
        }
        const [i, j] = toMerge;
        const nodeA = nodes[i];
        const nodeB = nodes[j];
        //Create new merged cluster
        const newNode = {
            id: `${nodeA.id}-${nodeB.id}`,
            data: nodeA.data.map((val, idx) => (val + (nodeB.data[idx] || 0)) / 2), 
            children: [nodeA, nodeB]
        };
        //Remove merged nodes and add new cluster
        nodes = nodes.filter((_, idx) => idx !== i && idx !== j);
        nodes.push(newNode);
    }

    return nodes[0];

};

/**
 * The cluster heatmap component shows the data across communities and days.
 * It is basically a collection of the tooltip bars for all communities.
 * 
 * @param {Object} props 
 * @param {Array|Object} props.data For relation map, a 2D array of counts by community (outer) and day (inner). For source/target map, an array of objects with shape {id: communityId, date: date, count: count}
 * @param {string|number|null} props.selectedId Currently selected community ID to highlight (1-based for relation map, numeric for source/target). Null if no selection.
 * @param {boolean} [props.isRelationMap=false] Whether this heatmap is for relation data (true) or source/target data (false). Affects color scheme and formatting.
 * @param {boolean} [props.isFuture=false] Whether the date axis represents future days (true) or past days (false). Affects date sorting and axis label.
 * @param {number} [props.offset=0] Offset for the date axis.
 * @returns {JSX.Element}
 */
export default function ClusterHeatmap({ data, selectedId, isRelationMap = false, isSageMap = false, isFuture = false, offset = 0, onHighlight, anchorDate = null, endOffset = null }) {
    const svgRef = useRef(null);
    const divRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(document.documentElement.clientWidth);
    const [isSelected, setIsSelected] = useState(false); //for toggle community clustering
    const [dateCluster, setDateCluster] = useState(false); //for toggle date clustering
    const [selectedBranch, setSelectedBranch] = useState(null); //for storing selected branch in cluster
    const [selectedDateBranch, setSelectedDateBranch] = useState(null); //for storing selected branch in cluster

    //Auto resize with webpage
    useEffect(() => {
        const handleResize = () => {
            setContainerWidth(document.documentElement.clientWidth);
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const interpolate = useMemo(() => {
        // SAGE uses a diverging scale: red (suppressive/negative) → white (zero) → green (amplifying/positive)
        return d3.interpolateRgbBasis(isSageMap ? SAGE_STOPS : isRelationMap ? RELATION_STOPS : CHOROPLETH_STOPS);
    }, [isRelationMap, isSageMap]);

    //2D array of counts for each community and day, ensuring day is a num
    // Normalizes the two different data shapes the component receives into a flat
    // array of {id, date, count} objects that D3 can bind to rect elements:
    //   - Relation/SHAP mode: data is a 2D array (community × day) — flatten with index as id/date
    //   - Source/past mode: data is {id, date, count}[] — fill in missing (id, date) pairs with 0
    //     so the heatmap grid is always fully populated even when some days had no crime
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

    //get present community IDs
    // When clustering is off, returns a plain sorted array of IDs for the y-axis scale.
    // When clustering is on, returns [leafOrder, rootNode] — leafOrder is the reordered ID array
    // after clustering (used for the y-axis scale), rootNode is the full tree for drawing the dendrogram.
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
        const root = getClusterOrder(matrix, ids);
        const hierarchy = d3.hierarchy(root);
        return [hierarchy.leaves().map(d => d.data.id), root];
    }, [heatmapData, isSelected, isRelationMap]);

    //get present dates
    const clusteredDates = useMemo(() => {
        if (!heatmapData || heatmapData.length === 0) return [];
        const ids = Array.from(new Set(heatmapData.map(d => d.id))).sort((a, b) => a - b);
        const dates = Array.from(new Set(heatmapData.map(d => d.date))).sort((a,b) => d3.ascending(b,a));
        if (isRelationMap) dates.sort((a,b) => d3.ascending(Number(a), Number(b)));
        if(!dateCluster) return dates; //dont cluster
        const matrix = dates.map(date => {
            return ids.map(id => {
                const entry = heatmapData.find(d => d.id === id && d.date === date);
                return entry ? entry.count : 0;
            });
        });
        const root = getClusterOrder(matrix, dates);
        const hierarchy = d3.hierarchy(root);
        return [hierarchy.leaves().map(d => d.data.id), root];
    }, [heatmapData, dateCluster, isFuture, isRelationMap]);

    //identify highlighted communities
    // Walks the cluster tree from the clicked branch node downward to collect all leaf IDs
    // under it. This is what gets highlighted in cyan on the heatmap cells and passed up
    // to the parent via onHighlight for driving the temporal line charts below.
    const selectedCommunities = useMemo(() => {
        if (!selectedBranch || !clusteredIds[1]) return [];
        const root = d3.hierarchy(clusteredIds[1]);
        const selectedNode = root.descendants().find(n => n.data.id === selectedBranch);
        return selectedNode ? selectedNode.descendants().map(n => n.data.id) : [];
    }, [selectedBranch, clusteredIds]);
    //identify highlighted dates
    const selectedDates = useMemo(() => {
        if (!selectedDateBranch || !clusteredDates[1]) return [];
        const root = d3.hierarchy(clusteredDates[1]);
        const selectedNode = root.descendants().find(n => n.data.id === selectedDateBranch);
        return selectedNode ? selectedNode.descendants().map(n => n.data.id) : [];
    }, [selectedDateBranch, clusteredDates]);
    //ensure correct ID
    // Relation map uses 0-based tensor indices internally; convert back to 1-based community IDs
    // before passing up to the parent, which expects 1-based IDs matching the UI and DB.
    useEffect(() => {
        const mapCommunities = isRelationMap
            ? selectedCommunities.map(id => (typeof id === 'number' || !String(id).includes('-')) ? String(Number(id) + 1) : id)
            : selectedCommunities;
        onHighlight?.({community: mapCommunities, date: selectedDates});
    }, [selectedCommunities, selectedDates, onHighlight, isRelationMap]);
    //use d3 to create the cluster heatmap
    useEffect(() => {
        if (heatmapData.length > 0 && svgRef.current) { //isRelation
            const matchesSelected = (d) => 
                selectedId !== null &&
                String(isRelationMap ? d.id + 1 : Number(d.id)) === String(selectedId);

            const N = isRelationMap ? Array.from(new Set(heatmapData.map(h => h.date))).length : 0;
            // xTickFormat converts the raw date/index value on the x-axis to a human-readable label:
            //   - Relation map + future: day index → days ahead (d + 1 + offset)
            //   - Source map + future: ISO date → days ahead from earliest date in data + offset
            //   - Relation map + past: day index → "days ago" label, anchored to endOffset if provided
            //   - Source map + past: ISO date → days before anchor date (positive = older)
            const xTickFormat = 
            isFuture && isRelationMap
                ? (d) => d+ 1 + offset
                : isFuture ? (d) => Math.abs(Math.round((d3.min(heatmapData.map(d => new Date(d.date).getTime())) - new Date(d).getTime()) / (1000 * 60 * 60 * 24)))+offset : isRelationMap
                ? (d) => endOffset !== null ? d + endOffset - N + 1 : d + offset + 1
                : (d) => {
                    const ref = anchorDate ? new Date(anchorDate + "T00:00:00").getTime() : d3.max(heatmapData.map(d => new Date(d.date).getTime()));
                    return Math.round((ref - new Date(d).getTime()) / (1000 * 60 * 60 * 24));
                  };

            const hoverStrokeColor = isRelationMap ? "magenta" : "darkgreen";
            const hoverstrokeWidth = isRelationMap ? 2: 3;

            const tooltipHtml = (d) => 
                `Community: ${isRelationMap ? d.id + 1 : d.id}<br>` +
                `${isRelationMap ? "Days Ago: " : "Date: "}${isRelationMap ? (endOffset !== null ? d.date + endOffset - Array.from(new Set(heatmapData.map(h => h.date))).length + 1 : d.date + offset + 1) : d.date}<br>` +
                `${isRelationMap ? "Relation" : "Count"}: ${d.count}`; 

            d3.select(svgRef.current).selectAll("*").remove();
            const margin = { top: dateCluster ? 140 : 40, right: 30, bottom: 30, left: isSelected ? 150 : 50 };
            const width = containerWidth - margin.left - margin.right;
            const height = 1200 - margin.top - margin.bottom;
            const svg = d3.select(svgRef.current)
                .attr("width", width + margin.left + margin.right)
                .attr("height", height + margin.top + margin.bottom)
                .append("g")
                .attr("transform", `translate(${margin.left},${margin.top})`);
            const xScale = d3.scaleBand().domain(dateCluster ? clusteredDates[0] : clusteredDates).range([width, isRelationMap ? 0 : 10]).padding(0.12);
            svg.append("g").style("font-size", "11px").style("fill", "#b0b0b0").call(d3.axisBottom(xScale).tickSize(0).tickFormat(xTickFormat)).select(".domain").remove();
            const yScale = d3.scaleBand().domain(isSelected ? clusteredIds[0] : clusteredIds).range([10, height]).padding(0.12);
            svg.append("g").style("font-size", "11px").style("fill", "#b0b0b0").call(d3.axisLeft(yScale).tickSize(0).tickFormat(d => isRelationMap ? d+1 : d)).select(".domain").remove();
            if (isSelected) {
                const rootNode = clusteredIds[1];
                const root = d3.hierarchy(rootNode);
                const clusterLayout = d3.cluster().size([height, margin.left - 60]);
                clusterLayout(root);
                root.leaves().forEach(leaf => {leaf.x = yScale(leaf.data.id) + yScale.bandwidth() / 2; });
                root.eachAfter(node => {
                    if (node.children) {
                        node.x = d3.mean(node.children, d => d.x);
                    }
                });
                // A custom generator for "elbow" or square connections
                const linkGenerator = (d) => {
                    const startX = d.source.y - margin.left + 40;
                    const startY = d.source.x;
                    const endX = d.target.y - margin.left + 40;
                    const endY = d.target.x;

                    // Move to source, draw horizontal to target's x, then vertical to target's y
                    return `M${startX},${startY}V${endY}H${endX}`;
                };
                const links = svg.append("g")
                    .attr("class", "community-links")
                    .selectAll("g")
                    .data(root.links())
                    .join("g")
                    .style("cursor", "pointer")
                    .on("click", (event, d) => {
                        event.stopPropagation();
                        setSelectedBranch(selectedBranch === d.target.data.id ? null : d.target.data.id);
                    });
                links.append("path")
                    .attr("d", linkGenerator)
                    .style("fill", "none")
                    .style("stroke", "transparent")
                    .style("stroke-width", 10);  // wide transparent path makes branches easier to click
                links.append("path")
                    .attr("d", linkGenerator)
                    .style("fill", "none")
                    .style("stroke", d => {
                        if(!selectedBranch) return "#888";
                        const selected = root.descendants().find(n => n.data.id === selectedBranch);
                        const inBranch = selected && (d.target.data.id === selectedBranch || (selected.descendants().map(a => a.data.id).includes(d.target.data.id)));
                        return inBranch ? "#00d4ff" : "#888"
                    })
                    .style("stroke-width", d => {
                        if(!selectedBranch) return 1;
                        const selected = root.descendants().find(n => n.data.id === selectedBranch);
                        const inBranch = selected && (d.target.data.id === selectedBranch || (selected.descendants().map(a => a.data.id).includes(d.target.data.id)));
                        return inBranch ? 2 : 1;
                    });
            }
            if (dateCluster) {
                const rootNode = clusteredDates[1];
                const root = d3.hierarchy(rootNode);
                const clusterLayout = d3.cluster().size([width, margin.top -30]);
                clusterLayout(root);
                root.leaves().forEach(leaf => {leaf.x = xScale(leaf.data.id) + xScale.bandwidth() / 2; });
                root.eachAfter(node => {
                    if (node.children) {
                        node.x = d3.mean(node.children, d => d.x);
                    }
                });
                const linkGenerator = (d) => {
                    const startX = d.source.x;
                    const startY = d.source.y - margin.top + 25;
                    const endX = d.target.x;
                    const endY = d.target.y - margin.top + 25;
                    return `M${startX},${startY}H${endX}V${endY}`;
                };
                const dLinks = svg.append("g")
                    .attr("class", "date-links")
                    .selectAll("g")
                    .data(root.links())
                    .join("g")
                    .style("cursor", "pointer")
                    .on("click", (event, d) => {
                        event.stopPropagation();
                        setSelectedDateBranch(selectedDateBranch === d.target.data.id ? null : d.target.data.id);
                    });
                dLinks.append("path")
                    .attr("d", linkGenerator)
                    .style("fill", "none")
                    .style("stroke", "transparent")
                    .style("stroke-width", 10);
                dLinks.append("path")
                    .attr("d", linkGenerator)
                    .style("fill", "none")
                    .style("stroke", d => {
                        if(!selectedDateBranch) return "#888";
                        const selected = root.descendants().find(n => n.data.id === selectedDateBranch);
                        const inBranch = selected && (d.target.data.id === selectedDateBranch || (selected.descendants().map(a => a.data.id).includes(d.target.data.id)));
                        return inBranch ? "#00d4ff" : "#888"
                    })
                    .style("stroke-width", d => {
                        if(!selectedDateBranch) return 1;
                        const selected = root.descendants().find(n => n.data.id === selectedDateBranch);
                        const inBranch = selected && (d.target.data.id === selectedDateBranch || (selected.descendants().map(a => a.data.id).includes(d.target.data.id)));
                        return inBranch ? 2 : 1;
                    });
            }
            const maxCount = d3.max(heatmapData, d => d.count);
            const minCount = d3.min(heatmapData, d => d.count);
            // SAGE values are signed: use diverging domain [min, max] so negative=red, zero=white, positive=green
            // For MI/choropleth: domain starts at 0
            // Note: for SAGE/SHAP the domain should ideally be symmetric ([-absMax, absMax]) so zero
            // always maps to white — this is a known issue with the current heatmap color scale.
            const colorScale = isSageMap
                ? d3.scaleSequential().interpolator(interpolate).domain([minCount, maxCount])
                : d3.scaleSequential().interpolator(interpolate).domain([maxCount > 0 ? 0 : 0, maxCount || 1]);
            const tooltip = d3.select(divRef.current);
            const mouseover = function(event, d) {
                tooltip.style("opacity", 1);
                d3.select(this).style("stroke", hoverStrokeColor).style("stroke-width", hoverstrokeWidth).style("opacity", 1);
            };
            const mousemove = function(event, d) {
                const [x, y] = d3.pointer(event);
                const dy = dateCluster ? y + 110 : y + 10;
                const dx = x + (isSelected ? 100 : 0) + (x < containerWidth - (isSelected ? 220 : 120) ? 10 : -60);
                tooltip.html(tooltipHtml(d))
                    .style("left", (dx) + "px")
                    .style("top", (dy) + "px")
                    .style("overflow", "wrap");
            };
            const mouseleave = function(event, d) {
                tooltip.style("opacity", 0);
                const isSelected = selectedId !== null && matchesSelected(d);
                d3.select(this).style("stroke", d => {
                    if(isSelected) return "blue";
                    if(selectedCommunities.includes(d.id) && selectedDates.includes(d.date)) {
                        return "grey";
                    }
                    if (selectedDates.includes(d.date)) {
                        return "magenta";
                    }
                    if (selectedCommunities.includes(d.id)) {
                        return "cyan";
                    }
                    return "none";
                }).style("stroke-width", d => {
                    if (isSelected) return 2;
                    if (selectedCommunities.includes(d.id) || selectedDates.includes(d.date)) {
                        return 2;
                    }
                    return 0;
                }).style("opacity", 0.92);
            };
            svg.selectAll().data(heatmapData, d => d.id + ':' + d.date)
                .join("rect")
                .attr("x", d => xScale(d.date))
                .attr("y", d => yScale(d.id))
                .attr("rx", 2)
                .attr("ry", 2)
                .attr("width", xScale.bandwidth())
                .attr("height", yScale.bandwidth())
                // Zero cells in non-SAGE modes render as EMPTY_CELL_FILL (subtle gray) rather than
                // the bottom of the color scale, so missing/zero data is visually distinct from
                // low-but-nonzero values. SAGE/SHAP cells always use the color scale because zero
                // is a meaningful value (no influence) — it should render as white, not gray.
                .style("fill", d => (d.count == null || (!isSageMap && d.count === 0)) ? EMPTY_CELL_FILL : colorScale(d.count))
                .style("stroke", d => {
                    if(selectedId !== null && String(isRelationMap ? d.id+1 : Number(d.id)) === String(selectedId)) {
                        return "blue";
                    }
                    if(selectedCommunities.includes(d.id) && selectedDates.includes(d.date)) {
                        return "grey";
                    }
                    if (selectedDates.includes(d.date)) {
                        return "magenta";
                    }
                    if (selectedCommunities.includes(d.id)) {
                        return "cyan";
                    }
                    return "none";
                })
                .style("stroke-width", d => {
                    if(selectedId !== null && String(isRelationMap ? d.id+1 : Number(d.id)) === String(selectedId)) {
                        return 2;
                    }
                    if (selectedCommunities.includes(d.id)) {
                        return 2;
                    }
                    if (selectedDates.includes(d.date)) {
                        return 2;
                    }
                    return 0;
                })
                .style("opacity", 0.92)
                .on("mouseover", mouseover)
                .on("mousemove", mousemove)
                .on("mouseleave", mouseleave);
            svg.append("text")
                .attr("x", width / 2)
                .attr("y", -margin.top + 20)
                .style("text-anchor", "middle")
                .style("font-size", "13px")
                .style("fill", "#e0e0e0")
                .style("font-weight", "500")
                .text(isFuture ? "Days Ahead" : "Days Ago");
            svg.append("text")
                .attr("transform", "rotate(-90)")
                .attr("x", -height / 2)
                .attr("y", -margin.left +30)
                .style("text-anchor", "middle")
                .style("font-size", "13px")
                .style("fill", "#e0e0e0")
                .style("font-weight", "500")
                .text("Community Number");
        }
    }, [heatmapData, selectedId, interpolate, containerWidth, isSelected, dateCluster, isFuture, isRelationMap, selectedBranch, selectedDateBranch, selectedCommunities, selectedDates, offset, endOffset, anchorDate]);
        

    return (
        <div id="cluster-heatmap" style={{ position: "relative" }}>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "center",  }}>
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
                    {isSelected ? "Clear Community Clustering" : "Cluster by Community"}
                </button>
                <div style={{ width: 8 }} /> {/* spacer */}
                <button
                    onClick={() => setDateCluster(!dateCluster)}
                    style={{
                        padding: "6px 12px",
                        backgroundColor: dateCluster ? "#013d83" : "#333",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer"
                    }}
                >
                    {dateCluster ? "Clear Date Clustering" : "Cluster by Date"}
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