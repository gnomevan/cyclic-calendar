import { AnnualRing } from "./views/AnnualRing.js";
import { CurrentTorus } from "./views/CurrentTorus.js";
import { EventForm } from "./views/EventForm.js";
import { EventList } from "./views/EventList.js";

export function App() {
  return (
    <div className="app">
      <header>
        <h1>Cyclic</h1>
        <p className="subtitle">Native time is wheel position, not Gregorian.</p>
      </header>
      <main>
        <AnnualRing />
        <EventForm />
        <EventList />
        <CurrentTorus />
      </main>
    </div>
  );
}
