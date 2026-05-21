import {
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { MoonGlyph } from "./MoonGlyph.js";

/**
 * DayCard — a portrait-oriented day card sized for a tight wheel
 * arrangement. The `variant` prop drives color treatment so a single
 * card can serve the focused moonth ring (warm accent), the
 * immediately adjacent moonths (cool neighbor), or moonths further
 * out (more muted).
 */

export type DayCardVariant = "focus" | "neighbor-near" | "neighbor-far";

interface DayCardProps {
  /** Day number within the moonth (1..28). */
  moonthDay: number;
  /** Phase angle of the moon at this day, degrees [0, 360). */
  moonAngle: number;
  /** The Gregorian date this card represents. */
  at: Instant;
  /** Whether this card is today (only meaningful in the focused ring). */
  isToday?: boolean;
  /** Events that fall on this day. */
  events: CalendarEvent[];
  /** Pixel width of the card. Height = width * 1.55 by convention. */
  width?: number;
  /** Color variant. Default "focus". */
  variant?: DayCardVariant;
}

export function DayCard({
  moonthDay,
  moonAngle,
  at,
  isToday = false,
  events,
  width = 72,
  variant = "focus",
}: DayCardProps) {
  const height = Math.round(width * 1.55);
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const gregorian = `${months[g.month - 1]} ${pad(g.day)}`;

  const classes = ["day-card", `day-card-${variant}`];
  if (isToday) classes.push("day-card-today");

  return (
    <div className={classes.join(" ")} style={{ width, height }}>
      <MoonGlyph angle={moonAngle} size={Math.round(width * 0.36)} />
      <div className="day-card-number">{moonthDay}</div>
      <div className="day-card-gregorian">{gregorian}</div>
      <ul className="day-card-events">
        {events.slice(0, 3).map((e) => (
          <li key={e.id} title={e.description ?? ""}>
            {e.name}
          </li>
        ))}
        {events.length > 3 && <li className="day-card-overflow">+{events.length - 3}</li>}
      </ul>
    </div>
  );
}
