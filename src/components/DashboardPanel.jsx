import Panel from "./Panel.jsx";

export default function DashboardPanel({ mode, selection, inactiveSelection }) {
  const hasActive = Boolean(selection);
  const hasInactive = Boolean(inactiveSelection);

  const cFL = (string) => {
    if (!string) return ''; // Handle empty or null strings
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  return (
    <Panel title="Dashboard">
      <div style={{ padding: "5%", boxSizing: "border-box" }}>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          This will show analytics (crime counts, trends, etc.) derived from selection + time range.
        </p>

        {!hasActive && !hasInactive ? (
          <p style={{ opacity: 0.8 }}>Select a boundary to begin.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {hasActive && selection.mode === "source"? (
              <p style={{ opacity: 0.95, margin: 0 }}>
                <strong>{cFL(selection.mode)}</strong> ready to compute stats for{" "}
                <strong>{selection.name}</strong>.
              </p>
            ) : hasActive && selection.mode === "relation" ? (
              <p style={{ opacity: 0.9, margin: 0 }}>
                <strong>{cFL(selection.mode)}</strong> ready to compute stats for{" "}
                <strong>{selection.name}</strong>.
              </p>
            ) : (
              <p style={{ opacity: 0.8, margin: 0 }}>
                <strong>{mode === "source" ? (<span>Source</span>):(<span>Relation</span>)}</strong> selection not chosen yet.
              </p>
            )}

            {hasInactive ? (
              <p style={{ opacity: 0.9, margin: 0 }}>
                <strong>{cFL(inactiveSelection.mode)}</strong> ready to compute stats for{" "}
                <strong>{inactiveSelection.name}</strong>.
              </p>
            ) : (
              <p style={{ opacity: 0.8, margin: 0 }}>
                <strong>Target</strong> selection not chosen yet.
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
