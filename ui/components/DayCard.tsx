import {
  epochMs,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { setEditingEventId, startCreatingFromDay } from "../editing.js";
import { setFocus } from "../focus.js";
import { MoonGlyph, phaseName } from "./MoonGlyph.js";
import { ZodiacGlyph } from "./ZodiacGlyph.js";

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
  /**
   * The card's day-in-moonth label. With the helix model this is a
   * derived display value, not a primary attribute — it's computed
   * upstream as days-since-most-recent-new-moon for this card's date.
   */
  moonthDay: number;
  /** Synodic phase angle (sun-relative) at this day, degrees [0, 360). */
  moonAngle: number;
  /**
   * Moon's sidereal ecliptic longitude at this day, degrees [0, 360).
   * Used for the zodiac glyph next to the phase glyph — answers
   * "what sign is the moon in" alongside "what does the moon look like."
   */
  moonSiderealAngle: number;
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
  /**
   * If this day contains a primary moon-phase crossing (new / first
   * quarter / full / last quarter), the exact instant of that
   * crossing. Used to render a phase tag like "Full: 10:02pm" instead
   * of just "Waxing Gibbous".
   */
  phaseEvent?: {
    kind: "new" | "first_quarter" | "full" | "last_quarter";
    at: Instant;
  };
}

export function DayCard({
  moonthDay: _moonthDay, // retained in props for upstream callers, unused in the redesign
  moonAngle,
  moonSiderealAngle,
  at,
  isFocus = false,
  isToday = false,
  events,
  width = 105,
  variant = "focus",
  phaseEvent,
}: DayCardProps) {
  const height = Math.round(width * 1.618);
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const greMonth = months[g.month - 1]!;
  const greDay = pad(g.day);
  const weekday =
    weekdays[
      new Date(Date.UTC(g.year, g.month - 1, g.day)).getUTCDay()
    ]!;
  void _moonthDay;

  const classes = ["day-card", `day-card-${variant}`];
  if (isFocus) classes.push("day-card-focused");
  if (isToday) classes.push("day-card-today");

  const visible = events.slice(0, MAX_VISIBLE_EVENTS);
  const overflow = events.length - visible.length;

  function focusThisCard() {
    setFocus(at);
  }

  function handleBodyClick(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest(".day-card-event-btn")) return;
    if (isFocus) {
      startCreatingFromDay(at);
    } else {
      focusThisCard();
    }
  }

  function handleEventClick(eventId: string) {
    if (!isFocus) focusThisCard();
    setEditingEventId(eventId);
  }

  // Layout:
  //   ┌─────────────────────┐
  //   │ 🌙  Waxing Gibbous  │   ← moon (half size) + meta stack
  //   │     Mon May 25      │
  //   ├─────────────────────┤
  //   │ • event 1           │
  //   │ • event 2           │
  //   └─────────────────────┘
  // Moon sized so it takes up most of the row's horizontal space —
  // anything left over after the moon + 6-px gap is just enough for
  // the 3-line MON/MAY/25 stack to read cleanly.
  const moonGlyphSize = Math.round(width * 0.55);

  const phaseLabel = phaseEvent
    ? `${PHASE_KIND_LABEL[phaseEvent.kind]}: ${formatClockTime(phaseEvent.at)}`
    : phaseName(moonAngle);

  return (
    <div
      className={classes.join(" ")}
      style={{ width, height }}
      onClick={handleBodyClick}
      title={isFocus ? "Click to add an event here" : "Click to focus this day"}
    >
      <div className="day-card-top">
        <div className="day-card-moon-stage" aria-hidden="true">
          <MoonGlyph angle={moonAngle} size={moonGlyphSize} />
          <span className="day-card-moon-tattoo">
            <ZodiacGlyph
              angle={moonSiderealAngle}
              size={Math.round(moonGlyphSize * 0.5)}
              colorize={false}
            />
          </span>
        </div>
        <div className="day-card-meta">
          <span className="day-card-weekday">{weekday}</span>
          <span className="day-card-month">{greMonth}</span>
          <span className="day-card-day">{greDay}</span>
        </div>
      </div>
      <div
        className={
          phaseEvent
            ? "day-card-phase day-card-phase-anchor"
            : "day-card-phase"
        }
      >
        {phaseLabel}
      </div>
      {events.length > 0 && (
        <ul className="day-card-events">
          {visible.map(({ event, at: occurrenceAt }) => (
            <li key={event.id}>
              <button
                type="button"
                className="day-card-event-btn"
                title={event.description ?? event.name}
                onClick={(e) => {
                  e.stopPropagation();
                  handleEventClick(event.id);
                }}
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
  );
}

function formatTime(at: Instant): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(epochMs(at)));
}

const PHASE_KIND_LABEL: Record<NonNullable<DayCardProps["phaseEvent"]>["kind"], string> = {
  new: "New",
  first_quarter: "1st Q",
  full: "Full",
  last_quarter: "Last Q",
};

/** Local-time clock string like "10:02pm" (lowercase, no space). */
function formatClockTime(at: Instant): string {
  const parts = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(new Date(epochMs(at)));
  // Default formats look like "10:02 PM"; strip space, lowercase the
  // meridiem so it matches the user's spec.
  return parts
    .map((p) => (p.type === "dayPeriod" ? p.value.toLowerCase() : p.value))
    .join("")
    .replace(/\s+/g, "");
}
