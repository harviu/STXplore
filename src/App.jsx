import { useState } from "react";
import "./App.css";

import MapPanel from "./components/MapPanel.jsx";
import SidePanel from "./components/SidePanel.jsx";
import DashboardPanel from "./components/DashboardPanel.jsx";
import HealthCheck from "./components/ApiHealthCheck.jsx";

export default function App() {
  const [state, setState] = useState({
    activeMode: "source",
    secondaryMode: "target",
    source: null,
    target: null,
    summary: null,
    summaryLoading: null,
    summaryError: "",
  });

  const activeSelection = state[state.activeMode];
  const secondarySelection = state[state.secondaryMode];
  console.log("state.summary =", state.summary);


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
            <SidePanel selection={activeSelection} inactiveSelection={secondarySelection} summary={state.summary} summaryLoading={state.summaryLoading} summaryError={state.summaryError}/>
          </div>
        </section>

        <section className="dashRow">
          <DashboardPanel mode={state.activeMode} selection={activeSelection} inactiveSelection={secondarySelection}/>
          {/*<HealthCheck />*/}
        </section>
      </main>
    </div>
  );
}