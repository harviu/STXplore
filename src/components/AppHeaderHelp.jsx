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
                overflow: "auto",
                background: "var(--color-surface-popover)",
                borderRadius: 12,
                boxShadow: "var(--shadow-modal)",
                border: "1px solid var(--color-panel-border)",
                padding: "18px 20px 20px",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 14,
                  position: "sticky",
                  top: 0,
                  background: "var(--color-surface-popover)",
                  paddingBottom: 8,
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <h2 id="map-help-title" style={{ margin: 0, fontSize: "1.05rem", fontWeight: 600 }}>
                  Crime map help
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
              <div style={{ fontSize: "0.92rem", lineHeight: 1.5, opacity: 0.95 }}>
                <p>Anchor Date: the anchor date is the day in which the prediction starts. It is also the point where past data starts to be collected for prediction.</p>
                <p>Recenter: clicking this button will recenter both maps to Chicago at a predefined zoom level.</p>
                <p>Past: This shows the map of historical data.</p>
                <p>Model Level: This shows the map of the mutual information between communities and the selected community in the right map.</p>
                <p>Data Level: This shows the map of the SHAP values for the selected community in the right map.</p>
                <p>Prediction: This shows the map of the predicted crimes by the AI.</p>
                <p>Actual: This shows the map of the actual crimes if they are available.</p>
                <p>Error: This shows the map of the error between the predicted and actual crimes.</p>
                <p>Relation Model: This is selection for the model of AI used to make the predictions.</p>
                <p>Source Date Slider: Controls the date range for the source data used in making a prediction.</p>
                <p>Target Date Slider: Controls the date range the AI will try making a prediction for.</p>
                <p>Detailed information about each selected community can be found by clicking on it and will be displayed in the sidebar.</p>
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
