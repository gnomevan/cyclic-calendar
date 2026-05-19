/**
 * Instant — a point on the celestial torus.
 *
 * Conceptually this is a coordinate into wheel-space. Mechanically it is a
 * UTC millisecond count, because that is what astronomy libraries consume and
 * what the Gregorian translation layer needs to interoperate with the outside
 * world. But the API here deliberately exposes NO date-like operations.
 *
 * You cannot ask an Instant what year it is. You cannot add days to it. You
 * cannot compare two Instants by calendar date. You can only:
 *   - construct one (from now, from another instant + a duration, from the
 *     Gregorian translation layer)
 *   - pass it to a wheel's positionAt() to learn the angle of that wheel
 *   - pass it to the resolver to find occurrences
 *   - hand it to the translation layer when you need to talk to civil systems
 *
 * This discipline is the load-bearing wall that keeps the Gregorian facade
 * from leaking into the core. If you find yourself wanting to add a method
 * here that does "calendar math", stop — the right answer is almost always
 * to express the operation in terms of a wheel and a pinning rule instead.
 */

declare const InstantBrand: unique symbol;

export type Instant = number & { readonly [InstantBrand]: true };

/** Construct an Instant for the current moment. */
export function now(): Instant {
  return Date.now() as Instant;
}

/** Construct an Instant from a raw UTC millisecond count. Internal use. */
export function instantFromEpochMs(ms: number): Instant {
  if (!Number.isFinite(ms)) {
    throw new Error("Instant must be a finite number of milliseconds");
  }
  return ms as Instant;
}

/** Extract the underlying epoch milliseconds. For library boundaries only. */
export function epochMs(i: Instant): number {
  return i as number;
}

/**
 * Add a duration (in seconds) to an Instant, producing a new Instant.
 *
 * This is the only "math" operation Instant exposes, and it is deliberately
 * coarse-grained: it does not know what a day, month, or year is. It only
 * knows seconds. If you want "the same wheel position one solar cycle later",
 * use the wheel's nextCrossing — do not try to add a year here.
 */
export function plusSeconds(i: Instant, seconds: number): Instant {
  return (epochMs(i) + seconds * 1000) as Instant;
}

/** Compare two Instants. Returns negative, zero, or positive. */
export function compareInstants(a: Instant, b: Instant): number {
  return epochMs(a) - epochMs(b);
}

/** Convert to a JavaScript Date — for use ONLY at the astronomy boundary. */
export function instantToDate(i: Instant): Date {
  return new Date(epochMs(i));
}

/** Convert from a JavaScript Date — for use ONLY at the astronomy boundary. */
export function dateToInstant(d: Date): Instant {
  return d.getTime() as Instant;
}
