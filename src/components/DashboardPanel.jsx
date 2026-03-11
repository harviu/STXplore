import { sum } from "d3";
import Panel from "./Panel.jsx";
import ClusterHeatmap from "./ClusterHeatmap.jsx";
import { select } from 'https://esm.sh/d3-selection';
import { useRef, useEffect, use } from "react";

export default function DashboardPanel({ mode, selection, inactiveMode, inactiveSelection, activeSummary, inactiveSummary, pastDays, futureDays, heatData }) {
  const barsRef = useRef();
  const actualBarsRef = useRef();
  const averageBarsRef = useRef();
  const averageActualBarsRef = useRef();
  const hasActive = Boolean(selection);
  const hasInactive = Boolean(inactiveSelection);

  //Literally just capitalizes the first letter of a string for better formatting
  const cFL = (string) => {
    if (!string) return ''; // Handle empty or null strings
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  //move inputs to constants to stop errors when null
  const summary = activeSummary?.top_types ?? null;
  const actual = inactiveSummary?.top_types ?? null;
  const averageSummary = activeSummary?.top_types.map(type => ({ ...type, count: type.count / pastDays })) ?? null;
  const averageActual = inactiveSummary?.top_types.map(type => ({ ...type, count: type.count / futureDays })) ?? null;

  //get all the actual data from both past and "future" (Our past but future from anchor date perspective)
  const combined = summary && actual ? (Object.values(summary.concat(actual).reduce((acc, {primary_type, count}) => {
    acc[primary_type] = acc[primary_type] 
    ? { ...acc[primary_type], count: acc[primary_type].count + count }
    : { primary_type, count };
  return acc;
}, {})).sort((a, b) => b.count - a.count).slice(0, 10)) : null;
  //console.log("Combined Summary", combined);;

  //maps the source data to the source map graph in source map stats below
  useEffect(() => { if (!summary) return;
     const bars = select(barsRef.current);
      bars.selectAll("rect").data(summary).join("rect").attr("height", 19).attr("width", d => d.count * 200/summary[0].count).attr("y", (d, i) => i * 20).attr("fill", "steelblue");
      select('.labels').selectAll('text').data(summary).join('text').attr('y', function(d, i) {
		    return i * 20 + 13;
	    })
	    .text(function(d) {
		    return d.primary_type;
	    }).attr("text-anchor", "end");
      select('.counts').selectAll('text').data(summary).join('text').attr('y', function(d, i) {
		    return i * 20 + 13;
	    })
	    .text(function(d) {
		    return d.count;
	    }).attr("text-anchor", "start");
    }, [summary]);

  //maps the actual data to the actual map graph in Actual Data Map Stats below
  useEffect(() => { if (!actual) return;
     const bars = select(actualBarsRef.current);
      bars.selectAll("rect").data(actual).join("rect").attr("height", 19).attr("width", d => d.count * 200/actual[0].count).attr("y", (d, i) => i * 20).attr("fill", "lightcoral");
      select('.actualLabels').selectAll('text').data(actual).join('text').attr('y', function(d, i) {
		    return i * 20 + 13;
	    })
	    .text(function(d) {
		    return d.primary_type;
	    }).attr("text-anchor", "end");
      select('.actualCounts').selectAll('text').data(actual).join('text').attr('y', function(d, i) {
		    return i * 20 + 13;
	    })
	    .text(function(d) {
		    return d.count;
	    }).attr("text-anchor", "start");
    }, [actual]);

  useEffect(() => { if (!averageSummary) return;
     const bars = select(averageBarsRef.current);
      bars.selectAll("rect").data(averageSummary).join("rect").attr("height", 19).attr("width", d => {if (d.count === 0) return 0; return d.count * 200/averageSummary[0].count;}).attr("y", (d, i) => i * 20).attr("fill", "steelblue");
      select('.averageLabels').selectAll('text').data(averageSummary).join('text').attr('y', function(d, i) {
        return i * 20 + 13;
      })
      .text(function(d) {
        return d.primary_type;
      }).attr("text-anchor", "end");
      select('.averageCounts').selectAll('text').data(averageSummary).join('text').attr('y', function(d, i) {
        return i * 20 + 13;
      })
      .text(function(d) {
        return d.count.toFixed(2);
      }).attr("text-anchor", "start");
    }, [averageSummary]);

  useEffect(() => { if (!averageActual) return;
      const bars = select(averageActualBarsRef.current);
      bars.selectAll("rect").data(averageActual).join("rect").attr("height", 19).attr("width", d => {if (d.count === 0) return 0; return d.count * 200/averageActual[0].count;}).attr("y", (d, i) => i * 20).attr("fill", "lightcoral");
      select('.averageActualLabels').selectAll('text').data(averageActual).join('text').attr('y', function(d, i) {
        return i * 20 + 13;
      })
      .text(function(d) {
        return d.primary_type;
      }).attr("text-anchor", "end");
      select('.averageActualCounts').selectAll('text').data(averageActual).join('text').attr('y', function(d, i) {
        return i * 20 + 13;
      })
      .text(function(d) {
        return d.count.toFixed(2);
      }).attr("text-anchor", "start");
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
                    <strong>{cFL(selection.mode)}:</strong> Current stats for{" "}
                    <strong>{selection.name}</strong>.
                    </p>
                    {summary && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Top Crime Types by count:</strong>
                        <br/>
                        <svg width="430" height="240">
                          <g className="bars" ref={barsRef} transform="translate(210, 30)"></g>
                          <g className="labels" transform="translate(198, 30)" style={{fill: "white"}}></g>
                          <g className="counts" transform="translate(220, 32)" style={{fill: "white"}}></g>
                        </svg>
                      </div>
                    )}
                    {averageSummary && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Top Crime Types by average/day:</strong>
                        <br/>
                        <svg width="430" height="240">
                          <g className="averageBars" ref={averageBarsRef} transform="translate(210, 30)"></g>
                          <g className="averageLabels" transform="translate(198, 30)" style={{fill: "white"}}></g>
                          <g className="averageCounts" transform="translate(220, 32)" style={{fill: "white"}}></g>
                        </svg>
                      </div>
                    )}
                </div>
              ) : hasActive && selection.mode === "relation" ? (
                <div>
                  {/* Relation Map Stats */}
                  <p style={{ opacity: 0.9, margin: 0 }}>
                    <strong>{cFL(selection.mode)}</strong> ready to compute stats for{" "}
                    <strong>{selection.name}</strong>.
                  </p>
                </div>
              ) : hasActive && selection.mode === "instance" ? (
                <div>
                  {/* Instance Map Stats */}
                  <p style={{ opacity: 0.9, margin: 0 }}>
                    <strong>{cFL(selection.mode)}-level</strong> ready to compute stats for{" "}
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
                    <strong>{cFL(inactiveSelection.mode)}</strong> stats for{" "}
                    <strong>{inactiveSelection.name}</strong>.
                  </p>
                  {actual && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Top Crime Types by count:</strong>
                        <br/>
                        <svg width="430" height="240">
                          <g className="actualBars" ref={actualBarsRef} transform="translate(210, 30)"></g>
                          <g className="actualLabels" transform="translate(198, 30)" style={{fill: "white"}}></g>
                          <g className="actualCounts" transform="translate(220, 32)" style={{fill: "white"}}></g>
                        </svg>
                      </div>
                    )}
                    {averageActual && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Top Crime Types by average/day:</strong>
                        <br/>
                        <svg width="430" height="240">
                          <g className="averageActualBars" ref={averageActualBarsRef} transform="translate(210, 30)"></g>
                          <g className="averageActualLabels" transform="translate(198, 30)" style={{fill: "white"}}></g>
                          <g className="averageActualCounts" transform="translate(220, 32)" style={{fill: "white"}}></g>
                        </svg>
                      </div>
                    )}
                </div>
              ):(
                <p  style={{ opacity: 0.9, margin: 0 }}>
                  {/* Target or Error Maps */}
                  <strong>{cFL(inactiveSelection.mode)}</strong> ready to {inactiveSelection.mode === "target" ? "predict" : "compute"} stats for{" "}
                  <strong>{inactiveSelection.name}</strong>.
                </p>
              )) : (
                <p style={{ opacity: 0.8, margin: 0 }}>
                  {inactiveMode === "target" ? (<strong>Target</strong>): inactiveMode === "actual" ? (<strong>Actual</strong>): (<strong>Error Map </strong>)} selection not chosen yet.
                </p>
              )}
            </div>
          </div>
          {heatData && mode !== "source" && <ClusterHeatmap data={heatData} selectedId={selection.id} isRelationMap= {mode !== "source"}/>}
        </div>
        )}
      </div>
    </Panel>
  );
}
