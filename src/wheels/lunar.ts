import { MoonPhase, SearchMoonPhase } from "../astronomy.js";
import type { Instant } from "../instant.js";
import { instantToDate, dateToInstant, epochMs } from "../instant.js";
import type { Anchor, Wheel, Angle } from "../wheel.js";

/**
 * The lunar wheel: phase angle, defined as (moon ecliptic longitude − sun
 * ecliptic longitude) mod 360°. 0° = new moon (conjunction), 180° = full
 * moon (opposition). One cycle is one synodic month (~29.5 days).
 *
 * This is the "phase wheel" specifically. The moon's sidereal position
 * (against the fixed stars) is a different wheel that we'll add later for
 * the lunar mansions (nakshatras / xiu / manazil). One celestial body,
 * multiple wheels — as we discussed.
 *
 * Four primary anchors for v1. The eight-anchor variant (adding first/last
 * crescent and the gibbous quarters) is a trivial extension when needed.
 */
export const LUNAR_ANCHORS: readonly Anchor[] = [
  { id: "new_moon",      name: "New Moon",      wheelId: "lunar", angle: 0   },
  { id: "first_quarter", name: "First Quarter", wheelId: "lunar", angle: 90  },
  { id: "full_moon",     name: "Full Moon",     wheelId: "lunar", angle: 180 },
  { id: "last_quarter",  name: "Last Quarter",  wheelId: "lunar", angle: 270 },
];

export const lunarWheel: Wheel = {
  id: "lunar",
  name: "Lunar",
  kind: "predictive",
  requiresObserver: false,
  anchors: LUNAR_ANCHORS,

  positionAt(at: Instant): Angle {
    return MoonPhase(instantToDate(at));
  },

  nextCrossing(targetAngle: Angle, after: Instant): Instant | null {
    // SearchMoonPhase: find when the moon reaches the given phase angle
    // after the given start, within a time limit. One lunation is ~29.5
    // days, so 35 days is a safe upper bound for exactly one crossing.
    const start = instantToDate(after);
    const result = SearchMoonPhase(targetAngle, start, 35);
    if (!result) return null;
    const ms = result.date.getTime();
    if (ms <= epochMs(after)) {
      const nudged = new Date(ms + 1000);
      const second = SearchMoonPhase(targetAngle, nudged, 35);
      return second ? dateToInstant(second.date) : null;
    }
    return dateToInstant(result.date);
  },

  previousCrossing(targetAngle: Angle, before: Instant): Instant | null {
    // The moon reaches any given phase angle once per synodic month
    // (~29.5 days). Walk a forward search from ~1.5 cycles earlier and
    // take the latest crossing that lands strictly before `before`.
    const beforeMs = epochMs(before);
    let cursor = new Date(beforeMs - 1.5 * 29.53 * 86_400_000);
    let latest: Date | null = null;
    for (let i = 0; i < 3; i++) {
      const result = SearchMoonPhase(targetAngle, cursor, 35);
      if (!result) break;
      const ms = result.date.getTime();
      if (ms >= beforeMs) break;
      latest = result.date;
      cursor = new Date(ms + 1000);
    }
    return latest ? dateToInstant(latest) : null;
  },
};
