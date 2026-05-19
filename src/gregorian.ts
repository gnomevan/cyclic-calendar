import type { Instant } from "./instant.js";
import { dateToInstant, instantToDate } from "./instant.js";

/**
 * The Gregorian translation layer.
 *
 * This is the ONLY module in the system where Gregorian concepts appear.
 * Everywhere else, time is wheel position. Here, and only here, we translate
 * to and from the civil calendar — for booking travel, talking to non-users,
 * displaying dates to people who think in months and years.
 *
 * The Gregorian "year number" is, in the model's terms, simply a count
 * against the Gregorian-civil origin (the conventional 1 CE / Anno Domini
 * epoch). It is one origin among many; it has no privileged status in the
 * core. The fact that astronomy libraries return JavaScript Date objects
 * (which encode Gregorian internally) is an implementation detail of the
 * astronomy boundary — it does not promote Gregorian to a primary role.
 */

export interface GregorianDate {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;
  second: number;
  /** IANA time zone id, or "UTC". */
  zone: string;
}

/** Project an Instant outward to a Gregorian date in UTC. */
export function toGregorianUTC(at: Instant): GregorianDate {
  const d = instantToDate(at);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    zone: "UTC",
  };
}

/**
 * Project an Instant outward to a Gregorian date in a given IANA time zone.
 *
 * Uses the Intl API for zone offset lookup. For ambiguous moments around
 * DST transitions, this returns the local-time representation as the zone
 * itself would; callers needing more nuance should consult the zone rules
 * directly.
 */
export function toGregorianInZone(at: Instant, zone: string): GregorianDate {
  const d = instantToDate(at);
  // Intl.DateTimeFormat with formatToParts gives us the individual fields
  // in the target zone, which is the cleanest API for this in pure JS.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(d).map((p) => [p.type, p.value]),
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24, // Intl can return "24" for midnight in some locales
    minute: Number(parts.minute),
    second: Number(parts.second),
    zone,
  };
}

/** Ingest a Gregorian date from outside the system and place it on the torus. */
export function fromGregorianUTC(g: Omit<GregorianDate, "zone">): Instant {
  const d = new Date(
    Date.UTC(g.year, g.month - 1, g.day, g.hour, g.minute, g.second),
  );
  return dateToInstant(d);
}

/** Convenience: ISO 8601 string from an Instant in UTC. */
export function toISOString(at: Instant): string {
  return instantToDate(at).toISOString();
}

/** Convenience: parse an ISO 8601 string to an Instant. */
export function fromISOString(s: string): Instant {
  const d = new Date(s);
  if (isNaN(d.getTime())) {
    throw new Error(`Invalid ISO string: ${s}`);
  }
  return dateToInstant(d);
}
