import { useState } from "react";
import "./App.css";

import MapPanel from "./components/MapPanel.jsx";
import SidePanel from "./components/SidePanel.jsx";
import DashboardPanel from "./components/DashboardPanel.jsx";
import HealthCheck from "./components/ApiHealthCheck.jsx";
import { SelectionState } from "react-day-picker";

export default function App() {
  const [state, setState] = useState({
    activeMode: "source",
    secondaryMode: "target",
    anchorDate: null,

    source: null,
    relation: null,
    target: null,
    actual: null,
    error: null,
    left : { selection: null, summary: null, loading: false, error: null, range: null},
    right: { selection: null, summary: null, loading: false, error: null, range: null}
  });

  const activeSelection = state[state.activeMode];
  const secondarySelection = state[state.secondaryMode];


  return (
    <div className="app">
      <header className="appHeader">
        <h1>The Zhuang Project</h1>
      </header>

      <main className="appMain">
        <section className="topRow">
          <div className="mapCell">
            <MapPanel onSelectionChange={setState} />
          </div>

          <div className="sideCell">
            <SidePanel left={state?.left} right={state?.right}/>
          </div>
        </section>

        <section className="dashRow">
          <DashboardPanel mode={state.activeMode} selection={activeSelection} inactiveMode={state.secondaryMode} inactiveSelection={secondarySelection} activeSummary={state.left?.summary} inactiveSummary={state.right?.summary}/>
          {/*<HealthCheck />*/}
        </section>
      </main>
    </div>
  );
}