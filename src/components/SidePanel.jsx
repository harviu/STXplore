import Panel from "./Panel.jsx";

// convert mode to a title
function titleForMode(mode) {
  switch (mode) {
    case "source":
      return "Source";
    case "relation":
      return "Model Level Relation";
    case "instance":
      return "Instance Level Relation";
    case "target":
      return "Target";
    case "actual":
      return "Actual Crime Counts";
    case "error":
      return "Error between Predicted (Target) and Actual";
    default:
      return " ";
  }
}

// subcomponent for showing details of a selection, including API status and summary if available
function SelectionBlock({ heading, payload, showApi = true, isLeft }) {
  // payload shape: { selection, summary, loading, error, range }
  const selection = payload?.selection ?? null;
  const summary = payload?.summary ?? null;
  const loading = !!payload?.loading;
  const error = payload?.error ?? null;
  const range = payload?.range ?? null;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <strong>{heading}</strong>
      </div>

      {!selection ? (
        <p style={{ opacity: 0.8, marginTop: 8 }}>Click a boundary to see details.</p>
      ) : (
        <>
          <div style={{ marginTop: 8 }}>
            <div>
              <strong>Map Type:</strong> {titleForMode(selection.mode)}
            </div>
            <div>
              <strong>Layer:</strong> {selection.layer}
            </div>
            <div>
              <strong>ID:</strong> {selection.id}
            </div>
            <div>
              <strong>Name:</strong> {selection.name}
            </div>
              {summary && (
                <div>
                  <strong>
                    # Days {isLeft ? 'before ' + summary.end : 'after ' + summary.start}: 
                  </strong>
                  {" " + selection.days}
                </div>
              )}
          </div>

          {showApi && selection.mode !== "target" ? (
            <>
              <hr style={{ margin: "12px 0", opacity: 0.1 }} />

              <div>
                <strong>API:</strong>{" "}
                {loading ? "Loading..." : error ? `Error: ${String(error)}` : "OK"}
              </div>

              {loading ? (
                <p style={{ opacity: 0.6, marginTop: 8, fontSize: 13 }}>Loading Data...</p>
              ) : summary ? (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  <div>
                    <strong>Starting Date:</strong> {summary.start}
                  </div>
                  <div>
                    <strong>Ending Date:</strong> {summary.end}
                  </div>
                  <div>
                    <strong>Total Crimes:</strong> {summary.total_crimes}
                  </div>
                  {summary.top_types?.[0] ? (<div>
                    <br />
                    <strong>Top Crimes:</strong>
                    <br />
                    <strong>{summary.top_types?.[0]?.primary_type}:</strong> {summary.top_types?.[0]?.count}
                  </div>) : null}
                  {summary.top_types?.[1] ? (<div>
                    <strong>{summary.top_types?.[1]?.primary_type}:</strong> {summary.top_types?.[1]?.count}
                  </div>) : null}
                  {summary.top_types?.[2] ? (<div>
                    <strong>{summary.top_types?.[2]?.primary_type}:</strong> {summary.top_types?.[2]?.count}
                  </div>) : null}
                  {summary.top_types?.[3] ? (<div>
                    <strong>{summary.top_types?.[3]?.primary_type}:</strong> {summary.top_types?.[3]?.count}
                  </div>) : null}
                  {summary.top_types?.[4] ? (<div>
                    <strong>{summary.top_types?.[4]?.primary_type}:</strong> {summary.top_types?.[4]?.count}
                  </div>) : null}
                  {summary.top_types?.[5] ? (<div>
                    <strong>{summary.top_types?.[5]?.primary_type}:</strong> {summary.top_types?.[5]?.count}
                  </div>) : null}
                  {summary.top_types?.[6] ? (<div>
                    <strong>{summary.top_types?.[6]?.primary_type}:</strong> {summary.top_types?.[6]?.count}
                  </div>) : null}
                  {summary.top_types?.[7] ? (<div>
                    <strong>{summary.top_types?.[7]?.primary_type}:</strong> {summary.top_types?.[7]?.count}
                  </div>) : null}
                  {summary.top_types?.[8] ? (<div>
                    <strong>{summary.top_types?.[8]?.primary_type}:</strong> {summary.top_types?.[8]?.count}
                  </div>) : null}
                  {summary.top_types?.[9] ? (<div>
                    <strong>{summary.top_types?.[9]?.primary_type}:</strong> {summary.top_types?.[9]?.count}
                  </div>) : null}
                </pre>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

//The main side panel holds the potential for two summaries, one for the source maps on the left and one for the target maps on the right.
export default function SidePanel({ left, right }) {
  const hasAnySelection = !!left?.selection || !!right?.selection;

  return (
    <Panel title="Current Selection" fill style={{ minHeight: 0}}>
      <div
        style={{
          padding: 12,
          boxSizing: "border-box",
          overflow: "auto",
          flex: 1,
          minHeight: 0,
        }}
      >
        {!hasAnySelection ? (
          <p style={{ opacity: 0.8, marginTop: 0 }}>
            Click a boundary on either map to see details.
          </p>
        ) : (
          <>
            <SelectionBlock heading="Left Map" payload={left} showApi={true} isLeft={true} />
            <hr style={{ margin: "12px 0", opacity: 0.7 }} />
            <SelectionBlock heading="Right Map" payload={right} showApi={true} isLeft={false} />
          </>
        )}
      </div>
    </Panel>
  );
}