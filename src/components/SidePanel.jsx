import Panel from "./Panel.jsx";
import { LineChart, MultiLineChart } from "./lineChartTooltip.jsx";
import { fillDaily } from "../lib/crimeAggregates.js";
import "./SidePanel.css";

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

function KvRow({ label, children }) {
  return (
    <div className="sidePanel__kv">
      <dt className="sidePanel__label">{label}</dt>
      <dd className="sidePanel__value">{children}</dd>
    </div>
  );
}

/**
 * The SelectionBlock component is a subcomponent used within the SidePanel to display details about a specific selection on either the left or right map.
 * It takes in a heading, a payload containing the selection and summary data, and flags for whether to show API status and whether it's for the left map.
 * The component conditionally renders the selection details, API status, and summary information based on the provided data.
 *
 * @param {Object} props
 * @param {string} props.heading The title to display for this selection block (e.g., "Left Map" or "Right Map")
 * @param {Object} props.payload The data for this selection block
 * @param {boolean} [props.showApi=true] Whether to show API status
 * @param {boolean} props.isLeft Whether this block is for the left map
 * @returns {JSX.Element}
 */
function SelectionBlock({ heading, payload, showApi = true, isLeft }) {
  const headingId = `sidepanel-heading-${heading.replace(/\s+/g, "-").toLowerCase()}`;
  const selection = payload?.selection ?? null;
  const summary = payload?.summary ?? null;
  const loading = !!payload?.loading;
  const error = payload?.error ?? null;
  const range = payload?.range ?? null;
  const daily = payload?.daily ?? null;
  const days = payload?.days ?? null;

  const topTypes = summary?.top_types?.filter(Boolean) ?? [];

  return (
    <section className="sidePanel__block" aria-labelledby={headingId}>
      <h4 className="sidePanel__blockTitle" id={headingId}>
        {heading}
      </h4>

      {!selection ? (
        <p className="sidePanel__helper">Click a boundary to see details.</p>
      ) : (
        <>
          <dl className="sidePanel__kvList">
            <KvRow label="Map type">{titleForMode(selection.mode)}</KvRow>
            <KvRow label="Layer">{selection.layer}</KvRow>
            <KvRow label="ID">{selection.id}</KvRow>
            <KvRow label="Name">{selection.name}</KvRow>
            {summary ? (
              <KvRow label={isLeft ? `Range of Days:` : `Range of Days:`}>
                {selection.days}
              </KvRow>
            ) : null}
          </dl>

          {showApi && selection.mode !== "target" ? (
            <div className="sidePanel__section">
              {error ? (
                <p className="sidePanel__error" role="alert">
                  API error: {String(error)}
                </p>
              ) : null}

              {loading ? (
                <p className="sidePanel__loading">Loading data…</p>
              ) : summary ? (
                <>
                  <p className="sidePanel__subhead">Crime summary</p>
                  <dl className="sidePanel__kvList">
                    <KvRow label="Starting date">{summary.start}</KvRow>
                    <KvRow label="Ending date">{summary.end}</KvRow>
                    <KvRow label="Total crimes">{summary.total_crimes}</KvRow>
                    {days > 0 && summary.total_crimes != null ? (
                      <KvRow label="Avg per day">{(summary.total_crimes / days).toFixed(2)}</KvRow>
                    ) : null}
                  </dl>

                  {topTypes.length > 0 ? (
                    <>
                      <p className="sidePanel__subhead sidePanel__subhead--spaced">Top crime types</p>
                      <ul className="sidePanel__topList">
                        {topTypes.slice(0, 10).map((t, i) => (
                          <li key={`${t.primary_type}-${i}`} className="sidePanel__topItem">
                            <span className="sidePanel__topType">{t.primary_type}</span>
                            <span className="sidePanel__topCount">{t.count}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}

          {isLeft && daily && range?.start && range?.end ? (
            <div className="sidePanel__chartBlock">
              <p className="sidePanel__chartCaption">Daily crime counts</p>
              <div className="sidePanel__chartMeta">
                {payload?.summary?.total_crimes != null ? (
                  <>
                    <div>
                      {selection.days} days total: {payload.summary.total_crimes}
                    </div>
                    {selection.days > 0 ? (
                      <div>
                        {selection.days} days average:{" "}
                        {(payload.summary.total_crimes / selection.days).toFixed(2)}
                      </div>
                    ) : null}
                  </>
                ) : null}
              </div>
              <div className="sidePanel__chartPlot">
                <LineChart days={fillDaily(range.start, range.end, daily)} height={74} />
              </div>
            </div>
          ) : null}

          {!isLeft && payload?.forecastDaily ? (
            <div className="sidePanel__chartBlock">
              <p className="sidePanel__chartCaption">{selection?.mode === "target" ? "Predicted daily counts" : selection?.mode === "error" ? "Daily counts" : "Actual daily counts"}</p>
              {payload.forecastTotal != null ? (
                <div className="sidePanel__chartMeta">30-day  total: {Math.round(payload.forecastTotal)}</div>
              ) : null}
              {selection?.mode === "error" ? (
                <div>
                    <MultiLineChart days={payload.forecastDaily} isRelationMap={false} height={74} />
                </div>) : (
                <div className="sidePanel__chartPlot">
                  <LineChart days={payload.forecastDaily} isRelationMap={false} height={74} />
                </div>
              )}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

/**
 * The SidePanel component displays details about the current selections on the left and right maps, including API loading status and summary information if available.
 *
 * @param {Object} props
 * @param {Object} props.left The data for the left map selection and summary, with shape: {selection, summary, loading, error, range}
 * @param {Object} props.right The data for the right map selection and summary, with shape: {selection, summary, loading, error, range}
 * @returns {JSX.Element}
 */
export default function SidePanel({ left, right }) {
  const hasAnySelection = !!left?.selection || !!right?.selection;

  return (
    <Panel title="Current Selection" fill style={{ minHeight: 0 }}>
      <div className="sidePanel__scroll">
        {!hasAnySelection ? (
          <p className="sidePanel__helper">Click a boundary on either map to see details.</p>
        ) : (
          <>
            <SelectionBlock heading="Left Map" payload={left} showApi={true} isLeft={true} />
            <hr className="sidePanel__divider" />
            <SelectionBlock heading="Right Map" payload={right} showApi={true} isLeft={false} />
          </>
        )}
      </div>
    </Panel>
  );
}
