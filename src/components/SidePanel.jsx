import Panel from "./Panel.jsx";

function titleForMode(mode) {
  switch (mode) {
    case "source":
      return "Source Selection";
    case "relation":
      return "Relation Selection";
    case "target":
      return "Target Selection";
    case "actual":
      return "Actual Selection";
    case "error":
      return "Error Map Selection";
    default:
      return "Selection";
  }
}

function SelectionBlock({ heading, payload, showApi = true }) {
  // payload shape: { selection, summary, loading, error, range }
  const selection = payload?.selection ?? null;
  const summary = payload?.summary ?? null;
  const loading = !!payload?.loading;
  const error = payload?.error ?? null;
  const range = payload?.range ?? null;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <strong>{heading}</strong>
        {selection?.mode ? <span style={{ opacity: 0.75, fontSize: 12 }}>{selection.mode}</span> : null}
      </div>

      {!selection ? (
        <p style={{ opacity: 0.8, marginTop: 8 }}>Click a boundary to see details.</p>
      ) : (
        <>
          <div style={{ marginTop: 8 }}>
            <div>
              <strong>{titleForMode(selection.mode)}:</strong>
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
            <div>
              <strong>Days:</strong> {selection.days}
            </div>
          </div>

          {showApi && selection.mode !== "target" ? (
            <>
              <hr style={{ margin: "12px 0", opacity: 0.2 }} />

              <div>
                <strong>API:</strong>{" "}
                {loading ? "Loading..." : error ? `Error: ${String(error)}` : "OK"}
              </div>

              {summary && (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  <div>
                    <strong>Layer:</strong> {summary.layer}
                  </div>
                  <div>
                    <strong>ID:</strong> {summary.id}
                  </div>
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
              )}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

export default function SidePanel({ left, right }) {
  const hasAnySelection = !!left?.selection || !!right?.selection;

  return (
    <Panel title="Current Selection" fill style={{ minHeight: 0, maxHeight: "95%" }}>
      <div
        style={{
          padding: "5%",
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
            <SelectionBlock heading="Left Map" payload={left} showApi={true} />
            <hr style={{ margin: "12px 0", opacity: 0.7 }} />
            <SelectionBlock heading="Right Map" payload={right} showApi={true} />
          </>
        )}
      </div>
    </Panel>
  );
}