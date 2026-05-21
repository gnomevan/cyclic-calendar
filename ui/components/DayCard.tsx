import {
  epochMs,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { MoonGlyph } from "./MoonGlyph.js";

/**
 * DayCard — landscape day cell sized so that adjacent cards along the
 * front of the moonth ring sit flush against each other.
 *
 * Top row: moon glyph · day-in-moonth · stacked "MON / DD" Gregorian.
 * Body: up to 3 real event occurrences for the day, with times in the
 * user's local timezone. Empty days render no body rows so the card
 * visibly says "nothing here." Days with more than 3 events get an
 * "+N" indicator on the third line.
 */

export type DayCardVariant = "focus" | "neighbor-near" | "neighbor-far";

/**
 * A resolved event occurrence for a specific day — the event itself
 * plus the exact instant on which it falls. Sorted by `at` ascending
 * before display.
 */
export interface DayEventOccurrence {
  event: CalendarEvent;
  at: Instant;
}

const MAX_VISIBLE_EVENTS = 3;

interface DayCardProps {
  /** Day number within the moonth (1..28). */
  moonthDay: number;
  /** Phase angle of the moon at this day, degrees [0, 360). */
  moonAngle: number;
  /** The Gregorian date this card represents. */
  at: Instant;
  /** Whether this card is today. */
  isToday?: boolean;
  /** Events for this day, with their resolved occurrence times. */
  events: DayEventOccurrence[];
  /** Pixel width. Default 105 — set so cards bump at the front. */
  width?: number;
  /** Color variant. */
  variant?: DayCardVariant;
}

export function DayCard({
  moonthDay,
  moonAngle,
  at,
  isToday = false,
  events,
  width = 105,
  variant = "focus",
}: DayCardProps) {
  // Golden-ratio portrait card.
  const height = Math.round(width * 1.618);
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const greMonth = months[g.month - 1]!;
  const greDay = pad(g.day);

  const classes = ["day-card", `day-card-${variant}`];
  if (isToday) classes.push("day-card-today");

  const visible = events.slice(0, MAX_VISIBLE_EVENTS);
  const overflow = events.length - visible.length;

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
      {events.length === 0 ? (
        <div className="day-card-empty" aria-hidden="true" />
      ) : (
        <ul className="day-card-events">
          {visible.map(({ event, at: occurrenceAt }) => (
            <li key={event.id} title={event.description ?? event.name}>
              <time>{formatTime(occurrenceAt)}</time>
              <span className="day-card-event-name">{event.name}</span>
            </li>
          ))}
          {overflow > 0 && (
            <li className="day-card-overflow">+{overflow} more</li>
          )}
        </ul>
      )}
    </div>
  );
}

function formatTime(at: Instant): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epochMs(at)));
}
