import { useState } from "react";
import "./App.css";

import MapPanel from "./components/MapPanel.jsx";
import SidePanel from "./components/SidePanel.jsx";
import DashboardPanel from "./components/DashboardPanel.jsx";

export default function App() {
  const [state, setState] = useState({
    activeMode: "source",
    inactiveMode: "target",
    source: null,
    target: null,
  });

  const activeSelection = state[state.activeMode];
  const inactiveSelection = state[state.inactiveMode];

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
            <SidePanel selection={activeSelection} inactiveSelection={inactiveSelection} />
          </div>
        </section>

        <section className="dashRow">
          <DashboardPanel selection={activeSelection} inactiveSelection={inactiveSelection}/>
        </section>
      </main>
    </div>
  );
}