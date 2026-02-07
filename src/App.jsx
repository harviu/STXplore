import { useState } from "react";
import "./App.css";

import MapPanel from "./components/MapPanel.jsx";
import SidePanel from "./components/SidePanel.jsx";
import DashboardPanel from "./components/DashboardPanel.jsx";

export default function App() {
  const [state, setState] = useState({
    activeMode: "source",
    source: null,
    target: null,
  });

  const activeSelection = state[state.activeMode];

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
            <SidePanel selection={activeSelection} />
          </div>
        </section>

        <section className="dashRow">
          <DashboardPanel selection={activeSelection} />
        </section>
      </main>
    </div>
  );
}