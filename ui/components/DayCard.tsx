import {
  epochMs,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { setEditingEventId, startCreatingFromDay } from "../editing.js";
import { setFocus } from "../focus.js";
import { MoonGlyph } from "./MoonGlyph.js";

/**
 * DayCard — landscape day cell sized so that adjacent cards along the
 * front of the moonth ring sit flush against each other.
 *
 * Click semantics:
 *   - Clicking the card body when *not focused* → rotate the wheel to
 *     bring this card to the bottom-center. No form opens.
 *   - Clicking the body when *already focused* → open the create form
 *     pre-seeded with this day's cycles.
 *   - Clicking an event row → focus the card AND open that event in
 *     the edit form.
 *
 * Visual flags:
 *   - `variant`: ring-level color tone (focus / neighbor-near / -far).
 *   - `isFocus`: true if this is the card the wheel is currently
 *     rotated onto. Warm accent border.
 *   - `isToday`: true if this card represents today's actual date,
 *     independent of focus. Soft glow outline so the user can always
 *     find today even after navigating away.
 */

export type DayCardVariant = "focus" | "neighbor-near" | "neighbor-far";

export interface DayEventOccurrence {
  event: CalendarEvent;
  at: Instant;
}

const MAX_VISIBLE_EVENTS = 3;

interface DayCardProps {
  /** Day number within the moonth (1..28). */
  moonthDay: number;
  /** Which moonth this card belongs to, as offset from today's moonth. */
  moonthOffset: number;
  /** Phase angle of the moon at this day, degrees [0, 360). */
  moonAngle: number;
  /** The Gregorian date this card represents. */
  at: Instant;
  /** True if this card is the currently focused (bottom-center) one. */
  isFocus?: boolean;
  /** True if this card represents today's actual date. */
  isToday?: boolean;
  /** Events for this day. */
  events: DayEventOccurrence[];
  /** Pixel width. Default 105 — set so cards bump at the front. */
  width?: number;
  /** Ring-level color variant. */
  variant?: DayCardVariant;
}

export function DayCard({
  moonthDay,
  moonthOffset,
  moonAngle,
  at,
  isFocus = false,
  isToday = false,
  events,
  width = 105,
  variant = "focus",
}: DayCardProps) {
  const height = Math.round(width * 1.618);
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const greMonth = months[g.month - 1]!;
  const greDay = pad(g.day);

  const classes = ["day-card", `day-card-${variant}`];
  if (isFocus) classes.push("day-card-focused");
  if (isToday) classes.push("day-card-today");

  const visible = events.slice(0, MAX_VISIBLE_EVENTS);
  const overflow = events.length - visible.length;

  function focusThisCard() {
    setFocus({ moonthOffset, day: moonthDay });
  }

  function handleBodyClick(e: React.MouseEvent<HTMLDivElement>) {
    // Click on an existing event button shouldn't trigger create.
    if ((e.target as HTMLElement).closest(".day-card-event-btn")) return;
    if (isFocus) {
      // Already focused — second click commits to creation.
      startCreatingFromDay(at);
    } else {
      focusThisCard();
    }
  }

  function handleEventClick(eventId: string) {
    if (!isFocus) focusThisCard();
    setEditingEventId(eventId);
  }

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
      <div
        className="day-card-body"
        onClick={handleBodyClick}
        title={isFocus ? "Click to add an event here" : "Click to focus this day"}
      >
        {events.length === 0 ? (
          <div className="day-card-empty" aria-hidden="true" />
        ) : (
          <ul className="day-card-events">
            {visible.map(({ event, at: occurrenceAt }) => (
              <li key={event.id}>
                <button
                  type="button"
                  className="day-card-event-btn"
                  title={event.description ?? event.name}
                  onClick={() => handleEventClick(event.id)}
                >
                  <time>{formatTime(occurrenceAt)}</time>
                  <span className="day-card-event-name">{event.name}</span>
                </button>
              </li>
            ))}
            {overflow > 0 && (
              <li className="day-card-overflow">+{overflow} more</li>
            )}
          </ul>
        )}
      </div>
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
