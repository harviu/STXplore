import Panel from "./Panel.jsx";

export default function DashboardPanel({ mode, selection, inactiveMode, inactiveSelection }) {
  const hasActive = Boolean(selection);
  const hasInactive = Boolean(inactiveSelection);

  const cFL = (string) => {
    if (!string) return ''; // Handle empty or null strings
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

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
         <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "row", width: "100%", gap: 8}}>
            <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {hasActive && selection.mode === "source"? (
                <div>
                  {/* Source Map Stats */}
                  <p style={{ opacity: 0.95, margin: 0 }}>
                    <strong>{cFL(selection.mode)}</strong> ready to compute stats for{" "}
                    <strong>{selection.name}</strong>.
                  </p>
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
            <div style={{ width: 0, backgroundColor: "rgba(255, 255, 255, 0.7)", border: "1px solid rgba(255, 255, 255, 0.7)", alignSelf: "stretch", gap: 8 }} />
            <div style={{ display: "flex", flex: "1 1 auto", flexDirection: "column", alignItems: "center", width: "100%", gap: 8 }}>
              {hasInactive ? (
                <p  style={{ opacity: 0.9, margin: 0 }}>
                  <strong>{cFL(inactiveSelection.mode)}</strong> ready to compute stats for{" "}
                  <strong>{inactiveSelection.name}</strong>.
                </p>
              ) : (
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
