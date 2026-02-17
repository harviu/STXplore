import Panel from "./Panel.jsx";

export default function SidePanel({ selection, inactiveSelection }) {
  return (
    <Panel title="Current Selection" fill style={{ minHeight: 0, maxHeight: "95%"}}>
    <div style={{ padding: "5%", boxSizing: "border-box", overflow: "auto", flex: 1, minHeight: 0 }}>
      {!selection && !inactiveSelection ? (
        <p style={{ opacity: 0.8, marginTop: 0 }}>Click a boundary to see details.</p>
      ) : !inactiveSelection ? (
        <div>
          <div><strong>Source Selection:</strong></div>
          <div><strong>Mode:</strong> {selection.mode}</div>
          <div><strong>Layer:</strong> {selection.layer}</div>
          <div><strong>ID:</strong> {selection.id}</div>
          <div><strong>Name:</strong> {selection.name}</div>
          <div><strong>Days:</strong> {selection.days}</div>

          <hr style={{ margin: "12px 0", opacity: 0.2 }} />

          <details>
            <summary style={{ cursor: "pointer" }}>Raw properties</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: "95%", overflow: "auto", marginTop: 8, }}>
              {JSON.stringify(selection.feature?.properties ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      ) : !selection ? (
        <div>
          <div><strong>Target Selection:</strong></div>
          <div><strong>Mode:</strong> {inactiveSelection.mode}</div>
          <div><strong>Layer:</strong> {inactiveSelection.layer}</div>
          <div><strong>ID:</strong> {inactiveSelection.id}</div>
          <div><strong>Name:</strong> {inactiveSelection.name}</div>
          <div><strong>Days:</strong> {inactiveSelection.days}</div>

          <hr style={{ margin: "12px 0", opacity: 0.2 }} />

          <details>
            <summary style={{ cursor: "pointer" }}>Raw properties</summary>
            <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: "95%", overflow: "auto", marginTop: 8, }}>
              {JSON.stringify(inactiveSelection.feature?.properties ?? {}, null, 2)}
            </pre>
          </details>
        </div>
      ) : (
        <div>
          <div>
            <div><strong>Source Selection:</strong></div>
            <div><strong>Mode:</strong> {selection.mode}</div>
            <div><strong>Layer:</strong> {selection.layer}</div>
            <div><strong>ID:</strong> {selection.id}</div>
            <div><strong>Name:</strong> {selection.name}</div>
            <div><strong>Days:</strong> {selection.days}</div>

            <hr style={{ margin: "12px 0", opacity: 0.2 }} />

            <details>
              <summary style={{ cursor: "pointer" }}>Raw properties</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: "95%", overflow: "auto", marginTop: 8, }}>
                {JSON.stringify(selection.feature?.properties ?? {}, null, 2)}
              </pre>
            </details>
          </div>
          <hr style={{ margin: "16px 0", opacity: 0.8 }} />
          <div>
            <div><strong>Target Selection:</strong></div>
            <div><strong>Mode:</strong> {inactiveSelection.mode}</div>
            <div><strong>Layer:</strong> {inactiveSelection.layer}</div>
            <div><strong>ID:</strong> {inactiveSelection.id}</div>
            <div><strong>Name:</strong> {inactiveSelection.name}</div>
            <div><strong>Days:</strong> {inactiveSelection.days}</div>

            <hr style={{ margin: "12px 0", opacity: 0.2 }} />

            <details>
              <summary style={{ cursor: "pointer" }}>Raw properties</summary>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, maxHeight: "95%", overflow: "auto", marginTop: 8, }}>
                {JSON.stringify(inactiveSelection.feature?.properties ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}
    </div>
    </Panel>
  );
}
