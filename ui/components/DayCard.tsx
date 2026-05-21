import {
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { MoonGlyph } from "./MoonGlyph.js";

/**
 * DayCard — landscape day cell sized so that adjacent cards along the
 * front of the moonth ring sit flush against each other (no gap).
 *
 * Layout, top to bottom:
 *
 *   Row 1 (head):  [moon glyph]  [day-in-moonth]  [month / Gregorian-day stack]
 *   Row 2-4 (events): three event rows, each with a time tag and label.
 *
 * Width is fixed at 94 px so that, at the front of the wheel with
 * rx=420 and 28 cards uniformly spaced angularly, adjacent cards just
 * touch (chord spacing = rx · sin(360°/28) ≈ 93.5).
 *
 * Events are placeholder data ("first", "second", "third") for now —
 * the real events pipeline from the store will hook back in once the
 * card design is settled.
 */

export type DayCardVariant = "focus" | "neighbor-near" | "neighbor-far";

interface DayCardProps {
  /** Day number within the moonth (1..28). */
  moonthDay: number;
  /** Phase angle of the moon at this day, degrees [0, 360). */
  moonAngle: number;
  /** The Gregorian date this card represents. */
  at: Instant;
  /** Whether this card is today. */
  isToday?: boolean;
  /** Events for this day. Currently unused; placeholders are shown. */
  events: CalendarEvent[];
  /** Pixel width. Default 94 so cards bump at the front. */
  width?: number;
  /** Color variant. */
  variant?: DayCardVariant;
}

interface DummyEvent {
  time: string;
  label: string;
}

const DUMMY_EVENTS: DummyEvent[] = [
  { time: "08:00", label: "first" },
  { time: "13:30", label: "second" },
  { time: "18:00", label: "third" },
];

export function DayCard({
  moonthDay,
  moonAngle,
  at,
  isToday = false,
  // events not used yet; placeholder data is rendered for now.
  events: _events,
  width = 105,
  variant = "focus",
}: DayCardProps) {
  // Golden-ratio portrait card: height = width × φ.
  const height = Math.round(width * 1.618);
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const greMonth = months[g.month - 1]!;
  const greDay = pad(g.day);

  const classes = ["day-card", `day-card-${variant}`];
  if (isToday) classes.push("day-card-today");

  return (
    <div className={classes.join(" ")} style={{ width, height }}>
      <div className="day-card-head">
        <MoonGlyph angle={moonAngle} size={22} />
        <span className="day-card-number">{moonthDay}</span>
        <div className="day-card-greg">
          <span className="day-card-greg-month">{greMonth}</span>
          <span className="day-card-greg-day">{greDay}</span>
        </div>
      </div>
      <ul className="day-card-events">
        {DUMMY_EVENTS.map((e) => (
          <li key={e.label}>
            <time>{e.time}</time>
            <span>{e.label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
