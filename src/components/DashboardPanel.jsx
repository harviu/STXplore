import Panel from "./Panel.jsx";

export default function DashboardPanel({ selection, inactiveSelection }) {
  const hasActive = Boolean(selection);
  const hasInactive = Boolean(inactiveSelection);

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
            {hasActive ? (
              <p style={{ opacity: 0.95, margin: 0 }}>
                <strong>{selection.mode.toUpperCase()}</strong> ready to compute stats for{" "}
                <strong>{selection.name}</strong>.
              </p>
            ) : (
              <p style={{ opacity: 0.75, margin: 0 }}>
                Active selection not chosen yet.
              </p>
            )}

            {hasInactive ? (
              <p style={{ opacity: 0.9, margin: 0 }}>
                <strong>{inactiveSelection.mode.toUpperCase()}</strong> ready to compute stats for{" "}
                <strong>{inactiveSelection.name}</strong>.
              </p>
            ) : (
              <p style={{ opacity: 0.75, margin: 0 }}>
                Inactive selection not chosen yet.
              </p>
            )}
          </div>
        )}
      </div>
    </Panel>
  );
}
