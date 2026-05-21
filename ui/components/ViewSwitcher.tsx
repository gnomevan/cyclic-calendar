/**
 * ViewSwitcher — a small row of buttons for switching the main canvas
 * between layouts (Moonth, Year, etc.). Persistent visual affordance,
 * no dropdown — clicking is one step.
 *
 * Modes are intentionally a small enum here. Gregorian month and Week
 * are stubbed for now (Step 3.e / 3.f) so the switcher's affordance is
 * present from day one — when those views land, only the modes array
 * changes.
 */

export type ViewMode = "moonth" | "year";

interface ViewSwitcherProps {
  mode: ViewMode;
  onChange: (next: ViewMode) => void;
}

const MODES: { id: ViewMode; label: string; title: string }[] = [
  { id: "moonth", label: "Moonth", title: "28 days from the most recent new moon" },
  { id: "year",   label: "Year",   title: "The full solar year, with anchors and events" },
];

export function ViewSwitcher({ mode, onChange }: ViewSwitcherProps) {
  return (
    <div className="view-switcher" role="tablist" aria-label="View mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          role="tab"
          aria-selected={mode === m.id}
          className={mode === m.id ? "active" : ""}
          title={m.title}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
