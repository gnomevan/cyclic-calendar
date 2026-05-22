import type { Instant } from "./instant.js";

/** An angle on a wheel, in degrees. Always normalized to [0, 360). */
export type Angle = number;

export function normalizeAngle(a: number): Angle {
  const x = a % 360;
  return x < 0 ? x + 360 : x;
}

/** The shortest signed distance from angle `from` to angle `to`, in (-180, 180]. */
export function angleDelta(from: Angle, to: Angle): number {
  const d = ((to - from + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** An optional observer location for wheels that require one. */
export interface Location {
  latitude: number;  // degrees, -90 to 90
  longitude: number; // degrees, -180 to 180
}

/**
 * A named position on a wheel.
 *
 * Anchors are "universal" by default (winter solstice, full moon — properties
 * of the wheel itself). A user may additionally declare personal anchors on
 * any wheel; those carry a userId. A wheel's `anchors` array contains only
 * its universal anchors; personal anchors are stored separately and merged
 * by the resolver when needed.
 */
export interface Anchor {
  id: string;            // stable identifier, e.g. "winter_solstice"
  name: string;          // human label, e.g. "Winter Solstice"
  wheelId: string;       // which wheel this anchor belongs to
  angle: Angle;          // position on the wheel
  userId?: string;       // present iff this is a personal anchor
}

/**
 * A wheel. Every cycle in the system — solar, lunar, sidereal, Pleiades,
 * Saturn, the week, the Tzolk'in, your magnolia tree — implements this.
 *
 * Two flavors:
 *   - Predictive (astronomical): nextCrossing computes future positions
 *     from ephemeris.
 *   - Observational (ecological): nextCrossing returns an estimate or null,
 *     and the wheel expects observations to be logged through other means.
 *
 * The two flavors share this interface; the `kind` field discriminates.
 */
export type WheelKind = "predictive" | "observational";

export interface Wheel {
  readonly id: string;
  readonly name: string;
  readonly kind: WheelKind;
  readonly requiresObserver: boolean;
  readonly anchors: readonly Anchor[];

  /** The wheel's angular position at the given instant. */
  positionAt(at: Instant, observer?: Location): Angle;

  /**
   * The next instant after `after` at which the wheel reaches `targetAngle`.
   * For observational wheels, may return null if no estimate is possible.
   */
  nextCrossing(
    targetAngle: Angle,
    after: Instant,
    observer?: Location,
  ): Instant | null;
}

/* ------------------------------------------------------------------------- *
 *  Pinning rule algebra
 *
 *  Events are not dates. An event is a *pattern* over wheels — a description
 *  of "when on the torus" the event occurs. The resolver turns a pattern into
 *  an occurrence (a specific Instant) on demand.
 *
 *  Seven primitives, plus composition. Composition is achieved by making the
 *  `after` reference of a rule optionally another rule whose resolution is
 *  used as the reference instant.
 * ------------------------------------------------------------------------- */

/** A reference to an anchor by id. */
export interface AnchorRef {
  wheelId: string;
  anchorId: string;
}

/**
 * A reference point in time for rules that need one ("first X after Y").
 * Can be a concrete instant, a named anchor (= the next time that anchor
 * occurs after the resolver's `from` reference), or another pinning rule
 * (whose resolution provides the reference) — this is how rules compose.
 */
export type TimeReference =
  | { kind: "instant"; at: Instant }
  | { kind: "anchor"; ref: AnchorRef }
  | { kind: "rule"; rule: PinningRule };

export type PinningRule =
  /** Exactly when this anchor next occurs. */
  | { kind: "exact"; anchor: AnchorRef }

  /**
   * The occurrence of `target` that falls nearest in time to `near`.
   * Tolerance is the maximum allowed separation in days; if exceeded, the
   * rule yields no occurrence in that cycle.
   */
  | {
      kind: "nearest";
      target: AnchorRef;
      near: TimeReference;
      toleranceDays: number;
    }

  /** The first time `target` occurs after `after`. */
  | { kind: "firstAfter"; target: AnchorRef; after: TimeReference }

  /** The nth (1-indexed) occurrence of `target` after `after`. */
  | { kind: "nth"; target: AnchorRef; n: number; after: TimeReference }

  /**
   * Multiple anchors must occur within `toleranceDays` of each other,
   * anchored at the next occurrence of `primary`. Yields no occurrence
   * when the alignment is missed.
   */
  | {
      kind: "conjunction";
      primary: AnchorRef;
      others: AnchorRef[];
      toleranceDays: number;
    }

  /**
   * The next occurrence of `target` that falls between the anchor `start`
   * and the anchor `end` (in their next occurrences after the reference).
   * Used for "the full moon within the dark half of the year".
   */
  | {
      kind: "withinRange";
      target: AnchorRef;
      start: AnchorRef;
      end: AnchorRef;
    }

  /**
   * The event happens when the user logs it. The resolver does not predict
   * these; it surfaces logged observations as occurrences. `wheelId` is the
   * observational wheel; `observationKey` identifies which kind of logged
   * observation feeds this event.
   */
  | { kind: "observed"; wheelId: string; observationKey: string }

  /**
   * Recurs each time `wheelId` reaches `angle`. Generalizes `exact` to
   * arbitrary angles — `exact` references a *named* anchor on a wheel;
   * `atAngle` references any angle. Used for events created from a click
   * on a day card, where the captured lunar/solar position rarely lands
   * exactly on a named anchor (see ADR-012).
   */
  | { kind: "atAngle"; wheelId: string; angle: number }

  /**
   * Recurs annually on a specific Gregorian calendar date. The single
   * Gregorian-aware rule kind, in keeping with `src/gregorian.ts` being
   * the lone Gregorian translation point. Used for events whose
   * recurrence is best expressed in civil terms — birthdays, anniversaries,
   * national holidays. See ADR-012.
   */
  | { kind: "gregorianDate"; month: number; day: number }

  /**
   * Composite: occurs each time *any* of the inner rules fires. Lets a
   * single event be attached to multiple cycles (lunar phase, solar
   * position, Gregorian date) simultaneously, with each attachment being
   * its own recurrence pattern. See ADR-013.
   */
  | { kind: "anyOf"; rules: PinningRule[] };
