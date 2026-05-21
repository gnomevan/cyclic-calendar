import {
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { MoonGlyph } from "./MoonGlyph.js";

/**
 * DayCard — a single day in any view (moonth, week, Gregorian month).
 *
 * The hierarchy of marks: day-in-moonth number is the dominant figure,
 * moon glyph is the close companion, Gregorian date is a tiny corner
 * stamp (demoted, as discussed). Event titles list below, capped so
 * the card stays readable.
 */

interface DayCardProps {
  /** Day number within the moonth (1..28). */
  moonthDay: number;
  /** Phase angle of the moon at this day, degrees [0, 360). */
  moonAngle: number;
  /** The Gregorian date this card represents. */
  at: Instant;
  /** Whether this card is today. */
  isToday?: boolean;
  /** Events that fall on this day. */
  events: CalendarEvent[];
  /** Pixel size of the card (square). */
  size?: number;
}

export function DayCard({
  moonthDay,
  moonAngle,
  at,
  isToday = false,
  events,
  size = 110,
}: DayCardProps) {
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const gregorian = `${pad(g.month)}/${pad(g.day)}`;

  return (
    <div className={`day-card${isToday ? " day-card-today" : ""}`} style={{ width: size, height: size }}>
      <div className="day-card-head">
        <MoonGlyph angle={moonAngle} size={Math.round(size * 0.18)} />
        <span className="day-card-gregorian">{gregorian}</span>
      </div>
      <div className="day-card-number">{moonthDay}</div>
      <ul className="day-card-events">
        {events.slice(0, 2).map((e) => (
          <li key={e.id} title={e.description ?? ""}>
            {e.name}
          </li>
        ))}
        {events.length > 2 && <li className="day-card-overflow">+{events.length - 2} more</li>}
      </ul>
    </div>
  );
}
