import { useEffect, useRef, useState } from "react";
import "./App.css";

import MapPanel from "./components/MapPanel.jsx";
import SidePanel from "./components/SidePanel.jsx";
import DashboardPanel from "./components/DashboardPanel.jsx";
import AppHeaderHelp from "./components/AppHeaderHelp.jsx";

function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    mql.addEventListener?.("change", handler) ?? mql.addListener(handler);
    setMatches(mql.matches);
    return () => {
      mql.removeEventListener?.("change", handler) ?? mql.removeListener(handler);
    };
  }, [query]);

  return matches;
}

/**
 * Main application component that renders the overall layout of the app, including the MapPanel, SidePanel, and DashboardPanel.
 * It manages the state for the active and secondary modes, selections, summaries, and heatmap data. It also handles responsive layout adjustments based on screen size.
 * It also dirstibutes the state to child components
 * 
 * @returns {JSX.Element}
 */
export default function App() {
  const [state, setState] = useState({
    activeMode: "source",
    secondaryMode: "target",
    anchorDate: null,

    source: null,
    relation: null,
    instance: null,
    target: null,
    actual: null,
    error: null,

    heatData: null,
    targetHeatData: null,
  });
  const [summaries, setSummaries] = useState({ 
    left: { selection: null, summary: null, loading: false, error: null, range: null, days: null },
    right: { selection: null, summary: null, loading: false, error: null, range: null, days: null, offset: null },
  });
  const [sourceHighlights, setSourceHighlights] = useState({community: null, date: null}); // For highlights coming from source cluster heatmap
  const [targetHighlights, setTargetHighlights] = useState({community: null, date: null}); // For highlights coming from target cluster heatmap

  const activeSelection = state[state.activeMode];
  const secondarySelection = state[state.secondaryMode];

  const mapCellRef = useRef(null);
  const [mapCellHeight, setMapCellHeight] = useState(null);
  const isStacked = useMediaQuery("(max-width: 900px)");

  useEffect(() => {
    const el = mapCellRef.current;
    if (!el) return;

    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const h = Math.max(0, Math.round(rect.height));
        setMapCellHeight((prev) => (prev === h ? prev : h));
      });
    });

    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  const sideCellStyle = isStacked
    ? { height: "auto", overflow: "visible" }
    : mapCellHeight != null
      ? { height: `${mapCellHeight}px`, overflow: "hidden" } // SidePanel will scroll inside
      : { height: "auto", overflow: "visible" };

  return (
    <div className="app">
      <header className="appHeader">
        <div className="appHeader__brand">
          <span className="appHeader__mark" aria-hidden="true" />
          <div className="appHeader__titles">
            <h1 className="appHeader__title">CrimeSight AI</h1>
            <p className="appHeader__tagline">Chicago crime maps and model exploration</p>
          </div>
        </div>
        <div className="appHeader__actions">
          <AppHeaderHelp />
        </div>
      </header>

      <main className="appMain">
        <section className="topRow">
          <div className="mapCell" ref={mapCellRef}>
            <MapPanel onSelectionChange={setState} onSummaryChange={setSummaries} sourceHighlight={sourceHighlights} targetHighlight={targetHighlights} />
          </div>

          <div className="sideCell" style={sideCellStyle}>
            <SidePanel left={summaries?.left} right={summaries?.right} />
          </div>
        </section>

        <section className="dashRow">
          <DashboardPanel
            mode={state.activeMode}
            selection={activeSelection}
            inactiveMode={state.secondaryMode}
            inactiveSelection={secondarySelection}
            left={summaries.left}
            right={summaries.right}
            heatData={state.heatData}
            targetHeatData={state.targetHeatData}
            isSageMap={state.relationDataMode === "sage"}
            onSourceHighlight={setSourceHighlights}
            onTargetHighlight={setTargetHighlights}
            anchorDate={state.anchorDate}
            forecastAnchorDate={state.forecastAnchorDate}
            shapHorizon={state.shapHorizon}
            model={state.model}
            relationDataMode={state.relationDataMode}
            pastStart={state.pastStart ?? 0}
            pastEnd={state.pastEnd ?? 90}
          />
        </section>
      </main>
    </div>
  );
}