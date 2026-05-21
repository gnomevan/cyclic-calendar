import { useState } from "react";
import { ConcentricOverview } from "./components/ConcentricOverview.js";
import { Orrery } from "./components/Orrery.js";
import { ViewSwitcher, type ViewMode } from "./components/ViewSwitcher.js";
import { AnnualRing } from "./views/AnnualRing.js";
import { EventForm } from "./views/EventForm.js";
import { EventList } from "./views/EventList.js";
import { MoonthView } from "./views/MoonthView.js";

export function App() {
  const [mode, setMode] = useState<ViewMode>("moonth");

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-titles">
          <h1>Cyclic</h1>
          <p className="subtitle">A calendar that lives on the cycles, not on the year number.</p>
        </div>
        <div className="app-dials">
          <Orrery size={140} />
          <ConcentricOverview size={140} />
        </div>
      </header>

      <div className="view-bar">
        <ViewSwitcher mode={mode} onChange={setMode} />
      </div>

      <main>
        {mode === "moonth" ? <MoonthView /> : <AnnualRing />}
        <EventForm />
        <EventList />
      </main>
    </div>
  );
}
