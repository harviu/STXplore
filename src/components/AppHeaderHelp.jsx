import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/** Help trigger + modal for crime map controls; lives in the app header bar. */
export default function AppHeaderHelp() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open help for the crime map"
        className="appHeaderHelpButton"
      >
        Help
      </button>
      {open &&
        createPortal(
          <div
            role="presentation"
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 2000,
              background: "var(--color-scrim)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: 16,
            }}
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="map-help-title"
              style={{
                maxWidth: 520,
                width: "100%",
                maxHeight: "min(85vh, 680px)",
                display: "flex",
                flexDirection: "column",
                background: "var(--color-surface-popover)",
                borderRadius: 12,
                boxShadow: "var(--shadow-modal)",
                border: "1px solid var(--color-panel-border)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "18px 20px 12px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  flexShrink: 0,
                }}
              >
                <h2 id="map-help-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                  CrimeSight AI help
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  style={{
                    padding: "6px 12px",
                    cursor: "pointer",
                    border: "1px solid var(--color-border-strong)",
                    borderRadius: 8,
                    background: "var(--color-surface-raised)",
                    color: "inherit",
                    fontSize: "0.9rem",
                    fontWeight: 500,
                    flexShrink: 0,
                  }}
                >
                  Close
                </button>
              </div>
              <div style ={{ overflow: "auto", padding: "14px 20px 20px", flex: "1 1 auto" }}>
                <div style={{ fontSize: "0.92rem", lineHeight: 1.6, opacity: 0.95 }}>

                  <p style={{ marginTop: 0 }}>
                    CrimeSight AI lets you explore historical crime data across Chicago and interact with an AI model trained to predict future crime. Here's how to get started and what everything means.
                  </p>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>General Layout</h3>
                  <p style={{ margin: 0 }}>
                    The screen is split into two maps side by side. The <strong>left map</strong> always shows something about the past — historical crime counts or attribution scores looking backward from the anchor date. The <strong>right map</strong> always shows something about the future — the model's predictions, actual crime that occurred, or the difference between the two.
                  </p>
                  <p style={{ marginBottom: 0 }}>
                    The <strong>side panel</strong> on the right shows details for whichever community you have clicked on. The <strong>cluster heatmap</strong> at the bottom shows patterns across all 77 Chicago community areas over time.
                  </p>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>Anchor Date</h3>
                  <p style={{ margin: 0 }}>
                    The anchor date <strong>D</strong> is the final model-input day. The model uses 90 days from <strong>D−89 through D</strong>, then predicts <strong>D+1 through D+30</strong>. You can change D using the date picker — only dates within the available data range are selectable.
                  </p>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>Sliders</h3>
                  <p style={{ margin: 0 }}>
                    The <strong>left slider</strong> controls which portion of D−89 through D is shown on the left map and used in attribution calculations. The <strong>right slider</strong> controls which portion of prediction days 1–30 (D+1 through D+30) is shown on the right map. Drag either handle to narrow or shift the window.
                  </p>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>Left Map Tabs</h3>
                  <ul style={{ margin: "0 0 0 16px", padding: 0 }}>
                    <li><strong>Past</strong> — shows real historical crime counts from the database. Use the layer selector to switch between community areas, police beats, or districts. Toggle between total count and average per day.</li>
                    <li><strong>Model Level</strong> — shows SAGE attribution scores (see below). Requires a community to be selected first.</li>
                    <li><strong>Instance Level</strong> — shows SHAP attribution scores for a specific prediction (see below). Requires a community to be selected first.</li>
                    <li><strong>Data Level</strong> — shows MI (Mutual Information) scores (see below). Requires a community to be selected first.</li>
                  </ul>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>Right Map Tabs</h3>
                  <ul style={{ margin: "0 0 0 16px", padding: 0 }}>
                    <li><strong>Predicted</strong> — the AI model's crime forecast for the selected future window.</li>
                    <li><strong>Actual</strong> — real crime counts from the same future window. Only available when the anchor date is far enough in the past that this data exists.</li>
                    <li><strong>Error</strong> — the difference between actual and predicted (actual minus predicted). Green communities had less crime than predicted, red had more. Only available when Actual is available.</li>
                    <li><strong>Relation</strong> — only visible in Source → All Targets mode. Shows how strongly the selected left-map community influences each other community.</li>
                  </ul>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>Relationship Mode</h3>
                  <p style={{ margin: 0 }}>
                    Controls the direction of attribution analysis. <strong>All Sources → Target</strong>: select a community on the right map, and the left map shows which communities most influenced its prediction. <strong>Source → All Targets</strong>: select a community on the left map, and the right map shows how much that community influences all others.
                  </p>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>What do SHAP, SAGE, and MI mean?</h3>
                  <p style={{ margin: 0 }}>
                    These are three different ways of measuring how communities influence each other's crime predictions.
                  </p>
                  <ul style={{ margin: "6px 0 0 16px", padding: 0 }}>
                    <li><strong>MI (Mutual Information)</strong> — a purely statistical measure of how related two communities' crime patterns are in the raw data, with no model involved. Higher value means stronger statistical relationship. Always non-negative.</li>
                    <li><strong>SAGE</strong> — a model-level measure of how much each source community's past crime systematically influences the model's predictions for a target community. Positive means it pushes predictions up, negative means it pulls them down. Precomputed across the full dataset.</li>
                    <li><strong>SHAP</strong> — similar to SAGE but specific to a single prediction at a specific date and horizon. It asks: for this particular forecast, how much did each community's recent crime history contribute? Takes a few seconds to compute because it runs live.</li>
                  </ul>
                  <p style={{ marginBottom: 0 }}>
                    On all attribution maps, <strong>white means no influence</strong>, <strong>green means positive/amplifying</strong>, and <strong>red means negative/suppressive</strong>.
                  </p>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>Typical Workflow</h3>
                  <ol style={{ margin: "0 0 0 16px", padding: 0 }}>
                    <li>Set the anchor date to a date of interest.</li>
                    <li>Use the <strong>Past</strong> tab to explore historical crime across communities.</li>
                    <li>Switch to <strong>Predicted</strong> on the right map to see what the model forecasts.</li>
                    <li>If the anchor date is in the past, switch to <strong>Actual</strong> or <strong>Error</strong> to compare the forecast against what really happened.</li>
                    <li>Click a community on the right map, then switch the left tab to <strong>Model Level</strong>, <strong>Instance Level</strong>, or <strong>Data Level</strong> to explore what influenced that community's prediction.</li>
                    <li>Use the sliders to narrow the time window and see how attribution changes over different periods.</li>
                    <li>Click communities on either map to see detailed stats in the side panel. Use the cluster heatmap at the bottom to explore patterns across all communities at once.</li>
                  </ol>

                  <h3 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: 4, marginTop: 16 }}>Other Controls</h3>
                  <ul style={{ margin: "0 0 0 16px", padding: 0 }}>
                    <li><strong>Model selector</strong> — switches between the Transformer and iTransformer AI models. Hidden in Data Level mode since MI does not depend on the model.</li>
                    <li><strong>Layer selector</strong> — switches the left map between community areas, police beats, and districts. Locked to community in attribution modes.</li>
                    <li><strong>Count toggle</strong> — switches the left map between total crime count and average per day over the selected window.</li>
                    <li><strong>Recenter</strong> — snaps both maps back to the default Chicago view if you have panned or zoomed away.</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
