import Panel from "./Panel.jsx";

export default function DashboardPanel({ selection }) {
  return (
    <Panel title="Dashboard">
      <div style={{ padding: "5%", boxSizing: "border-box" }}>
        <p style={{ opacity: 0.8, marginTop: 0 }}>
          This will show analytics (crime counts, trends, etc.) derived from selection + time range.
        </p>

        {selection ? (
          <p style={{ opacity: 0.9 }}>
            Ready to compute stats for <strong>{selection.name}</strong>.
          </p>
        ) : (
          <p style={{ opacity: 0.8 }}>Select a boundary to begin.</p>
        )}
      </div>
    </Panel>
  );
}
