import { CurrentTorus } from "./views/CurrentTorus.js";

export function App() {
  return (
    <div className="app">
      <header>
        <h1>Cyclic</h1>
        <p className="subtitle">Native time is wheel position, not Gregorian.</p>
      </header>
      <main>
        <CurrentTorus />
      </main>
    </div>
  );
}
