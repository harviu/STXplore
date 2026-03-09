import { useEffect, useRef, useState } from "react";
import "./App.css";

import MapPanel from "./components/MapPanel.jsx";
import SidePanel from "./components/SidePanel.jsx";
import DashboardPanel from "./components/DashboardPanel.jsx";

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

    left: { selection: null, summary: null, loading: false, error: null, range: null, days: null },
    right: { selection: null, summary: null, loading: false, error: null, range: null, days: null },
    heatData: null,
  });

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
        <h1>The Zhuang Project</h1>
      </header>

      <main className="appMain">
        <section className="topRow">
          <div className="mapCell" ref={mapCellRef}>
            <MapPanel onSelectionChange={setState} />
          </div>

          <div className="sideCell" style={sideCellStyle}>
            <SidePanel left={state?.left} right={state?.right} />
          </div>
        </section>

        <section className="dashRow">
          <DashboardPanel
            mode={state.activeMode}
            selection={activeSelection}
            inactiveMode={state.secondaryMode}
            inactiveSelection={secondarySelection}
            activeSummary={state.left?.summary}
            inactiveSummary={state.right?.summary}
            pastDays={state.left?.days}
            futureDays={state.right?.days}
            heatData={state.heatData}
          />
        </section>
      </main>
    </div>
  );
}