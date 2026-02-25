import Panel from "./Panel.jsx";
import { select } from 'https://esm.sh/d3-selection';
import { useRef, useEffect } from "react";

export default function DashboardPanel({ mode, selection, inactiveMode, inactiveSelection, activeSummary, inactiveSummary }) {
  const barsRef = useRef();
  const actualBarsRef = useRef();
  const hasActive = Boolean(selection);
  const hasInactive = Boolean(inactiveSelection);

  const cFL = (string) => {
    if (!string) return ''; // Handle empty or null strings
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  const summary = activeSummary?.top_types ?? null;
  const actual = inactiveSummary?.top_types ?? null;

  console.log("Summary for Dashboard", actual);

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

  return (
    <Panel title="Dashboard">
      <div style={{ padding: "5%", boxSizing: "border-box" }}>
        {!hasActive && !hasInactive ? (
          <div style={{display: "flex", flexDirection: "column", alignItems: "center", width: "100%", gap: 8}}>
            <p style={{ opacity: 0.8, marginTop: 0 }}>
            This will show analytics (crime counts, trends, etc.) derived from selection + time range.
            </p>
            <p style={{ opacity: 0.8 }}>Select a boundary to begin.</p>
          </div>
        ) : (
         <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", width: "100%", justifyContent: "space-between", gap: 8}}>
            <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {hasActive && selection.mode === "source"? (
                <div>
                  {/* Source Map Stats */}
                  <p style={{ opacity: 0.95, margin: 0 }}>
                    <strong>{cFL(selection.mode)}:</strong> Current stats for{" "}
                    <strong>{selection.name}</strong>.
                    </p>
                    {summary && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Top Crime Types:</strong>
                        <br/>
                        <svg width="560" height="240">
                          <g className="bars" ref={barsRef} transform="translate(210, 30)"></g>
                          <g className="labels" transform="translate(198, 30)" style={{fill: "white"}}></g>
                          <g className="counts" transform="translate(220, 32)" style={{fill: "white"}}></g>
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
              ) : (
                <p style={{ opacity: 0.8, margin: 0 }}>
                  {mode === "source" ? (<strong>Source</strong>):(<strong>Relation</strong>)} selection not chosen yet.
                </p>
              )}
            </div>
            <div style={{ width: 0, backgroundColor: "rgba(255, 255, 255, 0.7)", border: "1px solid rgba(255, 255, 255, 0.7)", alignSelf: "stretch",margin: 16, gap: 8 }} />
            <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {hasInactive ? (inactiveSelection.mode === "actual" ? (
                <div>
                  <p  style={{ opacity: 0.9, margin: 0 }}>
                    <strong>{cFL(inactiveSelection.mode)}</strong> stats for{" "}
                    <strong>{inactiveSelection.name}</strong>.
                  </p>
                  {actual && (
                      <div style={{ marginTop: 8 }}>
                        <strong>Top Crime Types:</strong>
                        <svg width="760" height="240">
                          <g className="actualBars" ref={actualBarsRef} transform="translate(210, 30)"></g>
                          <g className="actualLabels" transform="translate(198, 30)" style={{fill: "white"}}></g>
                          <g className="actualCounts" transform="translate(220, 32)" style={{fill: "white"}}></g>
                        </svg>
                      </div>
                    )}
                </div>
              ):(
                <p  style={{ opacity: 0.9, margin: 0 }}>
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
        )}
      </div>
    </Panel>
  );
}
