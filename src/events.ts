import type { Instant } from "./instant.js";
import type { Location, PinningRule } from "./wheel.js";

/**
 * An event is a stored pattern. It is NOT a date. It is a description
 * of a position on the torus, expressed as a pinning rule. Resolving an
 * event to a specific moment is something the resolver does on demand.
 */
export interface CalendarEvent {
  id: string;
  userId?: string;        // events are user-scoped; absent = system-defined
  name: string;
  description?: string;
  rule: PinningRule;
  /** If true, this event is also usable as an origin for counts. */
  isOrigin?: boolean;

  // --- Presentation metadata, optional. Don't affect resolution or
  // --- counts; the rule alone determines WHEN. These describe HOW
  // --- the event appears once it resolves to a moment.

  /** Local clock time the event starts, "HH:MM" (24-h). */
  startTime?: string;
  /** Local clock time the event ends, "HH:MM". */
  endTime?: string;
  /**
   * How many days the event spans from its start day. 0 (or omitted)
   * means single-day; 1 = ends on the next day at endTime; etc.
   */
  durationDays?: number;
  /** CSS color string for the event's dot/badge on cards. */
  color?: string;
}

/**
 * An occurrence is a specific realization of an event at a moment on the
 * torus. Past occurrences are persisted because they carry accumulated
 * meaning ("the 14th gathering is the 1st gathering, spiraled forward").
 * Future occurrences are computed on demand and not persisted.
 *
 * `id` is optional in the type because in-memory constructions (the demo,
 * tests) don't always need one. The repository assigns and requires a
 * UUID when an occurrence is persisted.
 */
export interface Occurrence {
  id?: string;
  eventId: string;
  at: Instant;
  /** Where this occurrence happened — for events whose place matters. */
  location?: Location;
  /** Free-form notes accumulated about this specific iteration. */
  notes?: string;
}

/**
 * An origin is just an event with isOrigin=true. We expose this view to make
 * the conceptual role clear: any event can serve as an origin from which
 * counts are measured. Many origins coexist; none is privileged.
 */
export interface Origin extends CalendarEvent {
  isOrigin: true;
}

/**
 * A count is a relational measurement between an origin and a target instant,
 * expressed as completed cycles of a given wheel. Counts are computed, never
 * stored. The most common count is "completed solar circuits since origin X".
 *
 * Importantly, the Gregorian "year number" is just one such count, taken
 * against the Gregorian-civil origin. It has no privileged status in the
 * model.
 */
export interface Count {
  originId: string;
  wheelId: string;
  completedCycles: number;
  /** Fractional position into the current cycle, 0 to 1. */
  fractionalCycle: number;
}
