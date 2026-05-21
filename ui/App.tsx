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
  // Currently-edited event id. The form reads it (to pre-populate) and
  // the list writes it (when the user clicks Edit). Lives at App-level
  // because both children need to see and change it.
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

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
        <EventForm
          editingEventId={editingEventId}
          onClearEdit={() => setEditingEventId(null)}
        />
        <EventList
          editingEventId={editingEventId}
          onEdit={(id) => setEditingEventId(id)}
        />
      </main>
    </div>
  );
}
