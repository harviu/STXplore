import Panel from "./Panel.jsx";
import ClusterHeatmap from "./ClusterHeatmap.jsx";
import { select } from 'https://esm.sh/d3-selection';
import { useRef, useEffect, useState, useMemo, useCallback } from "react";
import TooltipMap from "./tooltipMap.jsx";
import { useClusterDailySeries } from "../hooks/useClusterDailySeries.js";
import { addDaysISO } from "../lib/dates.js";

/**A function that renders a horizontal bar chart using D3 
 * 
 * @param {Object} props
 * @param {React.Ref} props.barsRef - Ref for the bars in the summary bar chart
 * @param {React.Ref} props.labelsRef - Ref for the labels in the summary bar chart
 * @param {React.Ref} props.countsRef - Ref for the counts in the summary bar chart
 * @param {Array} props.data - The data for the bar chart
 * @param {string} props.color - The color for the bars
 * @param {boolean} [props.isAverage=false] - Indicates if the chart should display average values
 * This function directly manipulates the ref props an does not return anything. 
 */
function renderBarChart(barsRef, labelsRef, countsRef, data, color, isAverage = false ) {
  if (!data || data.length === 0 || data[0]?.count == null) return;

  const maxCount = data[0].count;

  select(barsRef.current)
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("height", 19)
    .attr("width", (d) => (maxCount === 0 ? 0 : (d.count * 200) / maxCount))
    .attr("y", (_, i) => i * 20)
    .attr("fill", color);

  select(labelsRef.current)
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("y", (_, i) => i * 20 + 13)
    .text((d) => d.primary_type)
    .attr("text-anchor", "end");

  select(countsRef.current)
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("y", (_, i) => i * 20 + 13)
    .text((d) => (isAverage ? d.count.toFixed(2) : d.count))
    .attr("text-anchor", "start");
}

/** Literally just capitalizes the first letter of a string for better formatting
 * @param {string} string - The input string to capitalize
 * @return {string} - The input string with the first letter capitalized
 */
function capitalizeFirst(string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/**
 * DashboardPanel component that displays analytics based on the current selection and time range.
 * @param {Object} props - The props for the DashboardPanel component.
 * @param {string} props.mode - The current active mode of the selection (source, relation, instance). 
 * @param {Object} props.selection - The current selection object containing details about the active selected boundary.
 * @param {string} props.inactiveMode - The mode of the inactive selection (actual, target, error).
 * @param {Object} props.inactiveSelection - The current inactive selection object containing details about the inactive selected boundary.
 * @param {Object} props.left - The summary data for the active selection, including loading state and error information.
 * @param {Object} props.right - The summary data for the inactive selection, including loading state and error information.
 * @param {Object} props.heatData - The data for the past map cluster heatmap.
 * @param {Object} props.targetHeatData - The data for the future map cluster heatmap.
 * @returns {JSX.Element} The rendered DashboardPanel component
 */
export default function DashboardPanel({ mode, selection, inactiveMode, inactiveSelection, left, right, heatData, targetHeatData, isSageMap = false, onSourceHighlight, onTargetHighlight, anchorDate, forecastAnchorDate, shapHorizon, model, relationDataMode, pastStart = 0, pastEnd = 90}) {
  const barsRef = useRef();
  const labelsRef = useRef();
  const countsRef = useRef();

  const actualBarsRef = useRef();
  const actualLabelsRef = useRef();
  const actualCountsRef = useRef();

  const avgBarsRef = useRef();
  const avgLabelsRef = useRef();
  const avgCountsRef = useRef();

  const avgActualBarsRef = useRef();
  const avgActualLabelsRef = useRef();
  const avgActualCountsRef = useRef();

  const hasActive = Boolean(selection);
  const hasInactive = Boolean(inactiveSelection);

  const summary = left?.summary?.top_types ?? null;
  const actual = right?.summary?.top_types ?? null;
  const averageSummary = (left?.summary?.top_types && left?.days > 0)
      ? left?.summary?.top_types?.map((t) => ({ ...t, count: t.count / left?.days }))
      : null;
  const averageActual = (right?.summary?.top_types && right?.days > 0)
      ? right?.summary?.top_types?.map((t) => ({ ...t, count: t.count / right?.days }))
      : null;

  const [sourceHighlight, setSourceHighlight] = useState({ community: [], date: [] });
  const [targetHighlight, setTargetHighlight] = useState({ community: [], date: [] });

  const handleSourceHighlight = useCallback((highlight) => { setSourceHighlight(highlight); onSourceHighlight?.(highlight); }, [onSourceHighlight]);
  const handleTargetHighlight = useCallback((highlight) => { setTargetHighlight(highlight); onTargetHighlight?.(highlight); }, [onTargetHighlight]);

  const title = useMemo(()=>{
    if (inactiveMode === "target") return "Predicted";
    if (inactiveMode === "actual") return "Actual";
    if (inactiveMode === "error") return "Actual - Predicted";
    return null;
  },[inactiveMode]);

  // For each highlighted community, extract its data from heatData
  const { communitySeriesList, loading: communitySeriesLoading } = useClusterDailySeries({
    mode,
    relationDataMode: relationDataMode ?? "mi",
    selectedCommunities: sourceHighlight.community,
    heatData,
    targetCommunityId: right?.selection?.id ?? null,
    sourceCommunityId: mode === "instance" ? selection?.id ?? null : null,
    forecastAnchorDate: forecastAnchorDate ?? null,
    shapHorizon: shapHorizon ?? null,
    relationModel: model ?? null,
    pastDays: left?.days ?? 90,
    futureEnd: right?.offset ?? 30,
    anchorDate: anchorDate ?? null,
    rangeStart: left?.range?.start ?? null,
    rangeEnd: left?.range?.end ?? null,
  });

  // Global min/max from heatData — matches the cluster heatmap color scaling
  // Skipped in source mode because heatData there is a flat {id, date, count}[] array,
  // not a 2D array of rows, so iterating it as a matrix would give wrong results.
  // Source mode tooltips use per-slice min/max instead.
  const heatGlobalMin = useMemo(() => {
    if (!heatData || mode === "source") return null;
    let min = Infinity;
    for (const row of heatData) for (const v of row) if (v < min) min = v;
    return min === Infinity ? null : min;
  }, [heatData, mode]);
  const heatGlobalMax = useMemo(() => {
    if (!heatData || mode === "source") return null;
    let max = -Infinity;
    for (const row of heatData) for (const v of row) if (v > max) max = v;
    return max === -Infinity ? null : max;
  }, [heatData, mode]);


  //aps the source data to the source map graph in source map stats below
  useEffect(() => { 
    renderBarChart(barsRef, labelsRef, countsRef, summary, "steelblue");
    }, [summary]);

  //maps the actual data to the actual map graph in Actual Data Map Stats below
  useEffect(() => {
    renderBarChart(actualBarsRef, actualLabelsRef, actualCountsRef, actual, "lightcoral");
    }, [actual]);

  useEffect(() => { 
    renderBarChart(avgBarsRef, avgLabelsRef, avgCountsRef, averageSummary, "steelblue", true);
    }, [averageSummary]);

  useEffect(() => {
    renderBarChart(avgActualBarsRef, avgActualLabelsRef, avgActualCountsRef, averageActual, "lightcoral", true);
    }, [averageActual]);

  return (
    <Panel title="Dashboard">
      {/* Temporal graph panel — instance mode shows one on-demand 90-day SHAP row. */}
      <div style={{ padding: "0 5%", boxSizing: "border-box", width: "100%" }}>
        {mode === "instance" && right?.selection?.id && (
          <p style={{ opacity: 1, margin: "12px 0 0", textAlign: "center" }}>Past map SHAP history</p>
        )}
        {communitySeriesLoading ? (
          <p style={{ opacity: 0.7, margin: "12px 0", fontSize: 13, textAlign: "center" }}>
            Calculating the selected source community's 90-day SHAP history…
          </p>
        ) : communitySeriesList.length === 0 ? (
          <p style={{ opacity: 0.5, margin: "12px 0", fontSize: 13, textAlign: "center" }}>
            {mode === "instance"
              ? "Select a source community on the Past map to calculate its 90-day SHAP history."
              : "Select a dendrogram branch on the community axis to see temporal crime series."}
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)", paddingBottom: "var(--space-4)" }}>
            {communitySeriesList.map(({ id, series }) => {
              // Cluster tree internal node IDs are composite strings like "1-2-5" (hyphen-joined leaf IDs).
              // We only render temporal charts for actual communities, not intermediate cluster nodes.
              if (!String(id).includes("-")){
                return (
                  <div key={id}>
                    <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Community {id}</div>
                    <TooltipMap
                      globalMin={heatGlobalMin} 
                      globalMax={heatGlobalMax}
                      days={series}
                      height={14}
                      isRelationMap={mode !== "source"}
                      isSageMap={isSageMap && mode !== "source"}
                      highlightDates={
                        sourceHighlight.date?.length > 0
                          ? mode === "source"
                            ? sourceHighlight.date
                            : sourceHighlight.date.map(d => addDaysISO(anchorDate, -(Number(d) + 1)))
                          : null
                      }
                    />
                  </div>
                );
              }
            })}
          </div>
        )}
      </div>
      {/* Cluster Heatmaps */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: "var(--space-5)" }}>
        {heatData && (selection?.id || mode === "source") && <p style={{ opacity: 1, margin: 0, fill: "white" }}> Past map cluster heatmap </p>}
        {/* isSageMap is only true in non-source modes — source mode always shows raw crime counts
            which use the sequential choropleth scale, never the diverging SAGE/SHAP scale */}
        {heatData && (selection?.id || mode === "source" || (mode != "source" && right?.selection?.id)) && <ClusterHeatmap data={heatData} selectedId={selection?.id || null} isRelationMap={mode !== "source"} isSageMap={isSageMap && mode !== "source"} onHighlight={handleSourceHighlight} anchorDate={anchorDate} offset={pastStart} endOffset={pastEnd} />}
        {targetHeatData && (inactiveMode === "actual" || inactiveMode === "target") && <p style={{ opacity: 1, margin: 0, fill: "white" }}> Future map cluster heatmap ({title})</p>}
        {/* Future heatmap is always source-mode-style flat data (not relation), so isSageMap is never needed */}
        {targetHeatData && (inactiveMode === "actual" || inactiveMode === "target") && <ClusterHeatmap data={targetHeatData} selectedId={inactiveSelection?.id || null} isRelationMap={false} isFuture={true} offset={inactiveMode === "target"? (right?.offset + 1) : right?.offset} onHighlight={handleTargetHighlight} anchorDate={anchorDate} />}
      </div>
    {/* Bar Charts — crime type breakdowns for left and right map selections */}
      <div style={{ padding: "5%", boxSizing: "border-box" }}>
        {!hasActive && !hasInactive ? (
          <div style={{display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 8}}>
            <p style={{ opacity: 0.8, marginTop: 0 }}>
              This will show analytics (crime counts, trends, etc.) derived from selection + time range.
            </p>
            <p style={{ opacity: 0.8 }}>Select a boundary to begin.</p>
          </div>
        ) : (
          <div style={{ display: "flex", flex: "1 1 430px", flexDirection: "row", width: "100%", justifyContent: "space-between", flexWrap: "wrap", overflow: "visible", gap: 8 }}>
            {/* Left map bar charts */}
            <div style={{ display: "flex", flex: "1 1 430px", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {hasActive && selection.mode === "source" ? (
                <div>
                  <p style={{ opacity: 0.95, margin: 0 }}>
                    <strong>{capitalizeFirst(selection.mode)}:</strong> Current stats for{" "}
                    <strong>{selection.name}</strong>.
                  </p>
                  {left?.loading ? (
                    <p style={{ opacity: 0.6, marginTop: 8 }}>Loading...</p>
                  ) : (
                    <>
                      {summary && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Top Crime Types by count:</strong>
                          <br/>
                          <svg width="430" height="240">
                            <g ref={barsRef} transform="translate(210, 30)"/>
                            <g ref={labelsRef} transform="translate(198, 30)" style={{fill: "white"}}/>
                            <g ref={countsRef} transform="translate(220, 32)" style={{fill: "white"}}/>
                          </svg>
                        </div>
                      )}
                      {averageSummary && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Top Crime Types by average/day:</strong>
                          <br/>
                          <svg width="430" height="240">
                            <g ref={avgBarsRef} transform="translate(210, 30)"/>
                            <g ref={avgLabelsRef} transform="translate(198, 30)" style={{fill: "white"}}/>
                            <g ref={avgCountsRef} transform="translate(220, 32)" style={{fill: "white"}}/>
                          </svg>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : hasActive ? (
                <p style={{ opacity: 0.9, margin: 0 }}>
                  <strong>{capitalizeFirst(selection.mode)}</strong> ready to compute stats for{" "}
                  <strong>{selection.name}</strong>.
                </p>
              ) : (
                <p style={{ opacity: 0.8, margin: 0 }}>
                  {mode === "source" ? <strong>Source</strong> : <strong>Relation</strong>} selection not chosen yet.
                </p>
              )}
            </div>
            {/* Right map bar charts */}
            <div style={{ display: "flex", flex: "1 1 430px", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {hasInactive ? (inactiveSelection.mode === "actual" ? (
                <div>
                  <p style={{ opacity: 0.9, margin: 0 }}>
                    <strong>{capitalizeFirst(inactiveSelection.mode)}</strong> stats for{" "}
                    <strong>{inactiveSelection.name}</strong>.
                  </p>
                  {right?.loading ? (
                    <p style={{ opacity: 0.6, marginTop: 8 }}>Loading...</p>
                  ) : (
                    <>
                      {actual && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Top Crime Types by count:</strong>
                          <br/>
                          <svg width="430" height="240">
                            <g ref={actualBarsRef} transform="translate(210, 30)"/>
                            <g ref={actualLabelsRef} transform="translate(198, 30)" style={{fill: "white"}}/>
                            <g ref={actualCountsRef} transform="translate(220, 32)" style={{fill: "white"}}/>
                          </svg>
                        </div>
                      )}
                      {averageActual && (
                        <div style={{ marginTop: 8 }}>
                          <strong>Top Crime Types by average/day:</strong>
                          <br/>
                          <svg width="430" height="240">
                            <g ref={avgActualBarsRef} transform="translate(210, 30)"/>
                            <g ref={avgActualLabelsRef} transform="translate(198, 30)" style={{fill: "white"}}/>
                            <g ref={avgActualCountsRef} transform="translate(220, 32)" style={{fill: "white"}}/>
                          </svg>
                        </div>
                      )}
                    </>
                  )}
                </div>
              ) : (
                <p style={{ opacity: 0.9, margin: 0 }}>
                  <strong>{capitalizeFirst(inactiveSelection.mode)}</strong> ready to {inactiveSelection.mode === "target" ? "predict" : "compute"} stats for{" "}
                  <strong>{inactiveSelection.name}</strong>.
                </p>
              )) : (
                <p style={{ opacity: 0.8, margin: 0 }}>
                  {inactiveMode === "target" ? <strong>Target</strong> : inactiveMode === "actual" ? <strong>Actual</strong> : <strong>Error Map</strong>} selection not chosen yet.
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
