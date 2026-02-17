import Panel from "./Panel.jsx";

export default function SidePanel({
  selection,
  inactiveSelection,
  summary,
  summaryLoading,
  summaryError,
}) {
  return (
    <Panel title="Current Selection" fill style={{ minHeight: 0, maxHeight: "625px" }}>
      <div
        style={{
          padding: "5%",
          boxSizing: "border-box",
          overflow: "auto",
          flex: 1,
          minHeight: 0,
        }}
      >
        {!selection && !inactiveSelection ? (
          <p style={{ opacity: 0.8, marginTop: 0 }}>Click a boundary to see details.</p>
        ) : !inactiveSelection ? (
          <div>
            {selection.mode === "source" ? (
            <div>
              <strong>Source Selection:</strong> {selection.mode}
            </div>
            ):(
              <div>
              <strong>Relation Selection:</strong> {selection.mode}
            </div>
            )}
            <div>
              <strong>Mode:</strong> {selection.mode}
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

            <hr style={{ margin: "12px 0", opacity: 0.2 }} />

            <div>
              <strong>API:</strong>{" "}
              {summaryLoading
                ? "Loading..."
                : summaryError
                ? `Error: ${summaryError}`
                : "OK"}
            </div>

            {summary && (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                {JSON.stringify(summary, null, 2)}
              </pre>
            )}

            <hr style={{ margin: "12px 0", opacity: 0.2 }} />

            <details>
              <summary style={{ cursor: "pointer" }}>Raw properties</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  maxHeight: 240,
                  overflow: "auto",
                  marginTop: 8,
                }}
              >
                {JSON.stringify(selection.feature?.properties ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        ) : !selection ? (
          <div>
            <div>
              <strong>Target Selection:</strong> {inactiveSelection.mode}
            </div>
            <div>
              <strong>Mode:</strong> {inactiveSelection.mode}
            </div>
            <div>
              <strong>Layer:</strong> {inactiveSelection.layer}
            </div>
            <div>
              <strong>ID:</strong> {inactiveSelection.id}
            </div>
            <div>
              <strong>Name:</strong> {inactiveSelection.name}
            </div>
            <div>
              <strong>Days:</strong> {inactiveSelection.days}
            </div>

            <hr style={{ margin: "12px 0", opacity: 0.2 }} />

            <div>
              <strong>API:</strong>{" "}
              {summaryLoading
                ? "Loading..."
                : summaryError
                ? `Error: ${summaryError}`
                : "OK"}
            </div>

            {summary && (
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  marginTop: 8,
                }}
              >
                {JSON.stringify(summary, null, 2)}
              </pre>
            )}

            <hr style={{ margin: "12px 0", opacity: 0.2 }} />

            <details>
              <summary style={{ cursor: "pointer" }}>Raw properties</summary>
              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  fontSize: 12,
                  maxHeight: 240,
                  overflow: "auto",
                  marginTop: 8,
                }}
              >
                {JSON.stringify(inactiveSelection.feature?.properties ?? {}, null, 2)}
              </pre>
            </details>
          </div>
        ) : (
          <div>
            <div>
              {selection.mode === "source" ? (
              <div>
                <strong>Source Selection:</strong> {selection.mode}
              </div>
              ):(
                <div>
                <strong>Relation Selection:</strong> {selection.mode}
              </div>
              )}
              <div>
                <strong>Mode:</strong> {selection.mode}
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

              <hr style={{ margin: "12px 0", opacity: 0.2 }} />

              <div>
                <strong>API:</strong>{" "}
                {summaryLoading
                  ? "Loading..."
                  : summaryError
                  ? `Error: ${summaryError}`
                  : "OK"}
              </div>

              {summary && (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  {JSON.stringify(summary, null, 2)}
                </pre>
              )}

              <hr style={{ margin: "12px 0", opacity: 0.2 }} />

              <details>
                <summary style={{ cursor: "pointer" }}>Raw properties</summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    maxHeight: 240,
                    overflow: "auto",
                    marginTop: 8,
                  }}
                >
                  {JSON.stringify(selection.feature?.properties ?? {}, null, 2)}
                </pre>
              </details>
            </div>
            <div>
              <div>
                <strong>Target Selection:</strong> {inactiveSelection.mode}
              </div>
              <div>
                <strong>Mode:</strong> {inactiveSelection.mode}
              </div>
              <div>
                <strong>Layer:</strong> {inactiveSelection.layer}
              </div>
              <div>
                <strong>ID:</strong> {inactiveSelection.id}
              </div>
              <div>
                <strong>Name:</strong> {inactiveSelection.name}
              </div>
              <div>
                <strong>Days:</strong> {inactiveSelection.days}
              </div>

              <hr style={{ margin: "12px 0", opacity: 0.2 }} />

              <div>
                <strong>API:</strong>{" "}
                {summaryLoading
                  ? "Loading..."
                  : summaryError
                  ? `Error: ${summaryError}`
                  : "OK"}
              </div>

              {summary && (
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    marginTop: 8,
                  }}
                >
                  {JSON.stringify(summary, null, 2)}
                </pre>
              )}

              <hr style={{ margin: "12px 0", opacity: 0.2 }} />

              <details>
                <summary style={{ cursor: "pointer" }}>Raw properties</summary>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    maxHeight: 240,
                    overflow: "auto",
                    marginTop: 8,
                  }}
                >
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
