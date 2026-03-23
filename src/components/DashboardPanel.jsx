import Panel from "./Panel.jsx";
import ClusterHeatmap from "./ClusterHeatmap.jsx";
import { select } from 'https://esm.sh/d3-selection';
import { useRef, useEffect } from "react";

function renderBarChart(barsRef, labelsRef, countsRef, data, color, isAverage = false ) {
  if (!data || data.lenght === 0) return;

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

/** Literally just capitalizes the first letter of a string for better formatting */
function capitalizeFirst(string) {
  if (!string) return "";
  return string.charAt(0).toUpperCase() + string.slice(1);
}

export default function DashboardPanel({ mode, selection, inactiveMode, inactiveSelection, activeSummary, inactiveSummary, pastDays, futureDays, heatData, targetHeatData, activeLoading, inactiveLoading }) {
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

  const summary = activeSummary?.top_types ?? null;
  const actual = inactiveSummary?.top_types ?? null;
  const averageSummary = activeSummary?.top_types?.map((t) => ({ ...t, count: t.count / pastDays })) ?? null;
  const averageActual = inactiveSummary?.top_types?.map((t) => ({ ...t, count: t.count / futureDays })) ?? null;

  //maps the source data to the source map graph in source map stats below
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
      <div style={{ padding: "5%", boxSizing: "border-box" }}>
        {!hasActive && !hasInactive ? (
          <div style={{display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 8}}>
            {/* Message when no selection is made */}
            <p style={{ opacity: 0.8, marginTop: 0 }}>
            This will show analytics (crime counts, trends, etc.) derived from selection + time range.
            </p>
            <p style={{ opacity: 0.8 }}>Select a boundary to begin.</p>
          </div>
        ) : (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 16 }}>
          <div style={{ display: "flex", flex: "1 1 430px", flexDirection: "row", width: "100%", justifyContent: "space-between", flexWrap: "wrap", overflow: "visible", gap: 8}}>
            <div style={{ display: "flex", flex: "1 1 430px", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {hasActive && selection.mode === "source"? (
                <div>
                  {/* Source Map Stats */}
                  <p style={{ opacity: 0.95, margin: 0 }}>
                    <strong>{capitalizeFirst(selection.mode)}:</strong> Current stats for{" "}
                    <strong>{selection.name}</strong>.
                    </p>
                    {activeLoading ? (
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
              ) : hasActive && selection.mode === "relation" ? (
                <div>
                  {/* Relation Map Stats */}
                  <p style={{ opacity: 0.9, margin: 0 }}>
                    <strong>{capitalizeFirst(selection.mode)}</strong> ready to compute stats for{" "}
                    <strong>{selection.name}</strong>.
                  </p>
                </div>
              ) : hasActive && selection.mode === "instance" ? (
                <div>
                  {/* Instance Map Stats */}
                  <p style={{ opacity: 0.9, margin: 0 }}>
                    <strong>{capitalizeFirst(selection.mode)}-level</strong> ready to compute stats for{" "}
                    <strong>{selection.name}</strong>.
                  </p>
                </div>
              ) : (
                <p style={{ opacity: 0.8, margin: 0 }}>
                  {mode === "source" ? (<strong>Source</strong>):(<strong>Relation</strong>)} selection not chosen yet.
                </p>
              )}
            </div>
            <div style={{ display: "flex", flex: "1 1 430px", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {/* Actual Data Map Stats */}
              {hasInactive ? (inactiveSelection.mode === "actual" ? (
                <div>
                  <p  style={{ opacity: 0.9, margin: 0 }}>
                    <strong>{capitalizeFirst(inactiveSelection.mode)}</strong> stats for{" "}
                    <strong>{inactiveSelection.name}</strong>.
                  </p>
                  {inactiveLoading ? (
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
              ):(
                <p  style={{ opacity: 0.9, margin: 0 }}>
                  {/* Target or Error Maps */}
                  <strong>{capitalizeFirst(inactiveSelection.mode)}</strong> ready to {inactiveSelection.mode === "target" ? "predict" : "compute"} stats for{" "}
                  <strong>{inactiveSelection.name}</strong>.
                </p>
              )) : (
                <p style={{ opacity: 0.8, margin: 0 }}>
                  {inactiveMode === "target" ? (<strong>Target</strong>): inactiveMode === "actual" ? (<strong>Actual</strong>): (<strong>Error Map </strong>)} selection not chosen yet.
                </p>
              )}
            </div>
          </div>
        </div>
        )}
      </div>
      {/* Cluster Heatmaps */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 16 }}>
        {heatData && (selection?.id || mode === "source") && <p style={{ opacity: 1, margin: 0, fill: "white" }}> Past map cluster heatmap </p>}
        {heatData && (selection?.id || mode === "source") && <ClusterHeatmap data={heatData} selectedId={selection?.id || null} isRelationMap= {mode !== "source"} />}
        {targetHeatData && inactiveMode === "actual" && <p style={{ opacity: 1, margin: 0, fill: "white" }}> Future map cluster heatmap </p>}
        {targetHeatData && inactiveMode === "actual" && <ClusterHeatmap data={targetHeatData} selectedId={inactiveSelection?.id || null} isRelationMap= {false} isFuture={true} />}
      </div>
    </Panel>
  );
}
