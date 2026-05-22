import { SunPosition, SearchSunLongitude } from "../astronomy.js";
import type { Instant } from "../instant.js";
import { instantToDate, dateToInstant, epochMs } from "../instant.js";
import type { Anchor, Wheel, Angle } from "../wheel.js";

/**
 * The solar wheel: apparent ecliptic longitude of the Sun, 0° at the spring
 * (vernal) equinox, increasing through the year. Cycle is one tropical year.
 *
 * This is the same convention used by the tropical zodiac. The eight anchors
 * are the cardinal solar positions: four quarters (equinoxes + solstices) and
 * four cross-quarters (the 45° midpoints — the Celtic fire-festival positions).
 *
 * Cross-quarter names use the Celtic vocabulary since it has the most
 * complete and ritually-developed set; users are free to rename.
 */
export const SOLAR_ANCHORS: readonly Anchor[] = [
  { id: "spring_equinox",  name: "Spring Equinox",  wheelId: "solar", angle: 0   },
  { id: "beltane",         name: "Beltane",         wheelId: "solar", angle: 45  },
  { id: "summer_solstice", name: "Summer Solstice", wheelId: "solar", angle: 90  },
  { id: "lughnasadh",      name: "Lughnasadh",      wheelId: "solar", angle: 135 },
  { id: "autumn_equinox",  name: "Autumn Equinox",  wheelId: "solar", angle: 180 },
  { id: "samhain",         name: "Samhain",         wheelId: "solar", angle: 225 },
  { id: "winter_solstice", name: "Winter Solstice", wheelId: "solar", angle: 270 },
  { id: "imbolc",          name: "Imbolc",          wheelId: "solar", angle: 315 },
];

export const solarWheel: Wheel = {
  id: "solar",
  name: "Solar",
  kind: "predictive",
  requiresObserver: false,
  anchors: SOLAR_ANCHORS,

  positionAt(at: Instant): Angle {
    const sp = SunPosition(instantToDate(at));
    return sp.elon;
  },

  nextCrossing(targetAngle: Angle, after: Instant): Instant | null {
    // SearchSunLongitude is the primitive: find when sun reaches a given
    // ecliptic longitude after a given start time, within a time limit.
    // A tropical year is ~365.25 days, so 370 days is a safe upper bound
    // that always contains exactly one crossing.
    const start = instantToDate(after);
    const result = SearchSunLongitude(targetAngle, start, 370);
    if (!result) return null;
    const ms = result.date.getTime();
    // The library can return the crossing AT `after` — we want strictly after.
    if (ms <= epochMs(after)) {
      const nudged = new Date(ms + 1000);
      const second = SearchSunLongitude(targetAngle, nudged, 370);
      return second ? dateToInstant(second.date) : null;
    }
    return dateToInstant(result.date);
  },

  previousCrossing(targetAngle: Angle, before: Instant): Instant | null {
    // The sun reaches any given ecliptic longitude once per year. To
    // find the most recent crossing strictly before `before`, walk a
    // forward search from one full cycle earlier and take the latest
    // result that lands before `before`.
    const beforeMs = epochMs(before);
    let cursor = new Date(beforeMs - 1.5 * 365.25 * 86_400_000);
    let latest: Date | null = null;
    for (let i = 0; i < 3; i++) {
      const result = SearchSunLongitude(targetAngle, cursor, 370);
      if (!result) break;
      const ms = result.date.getTime();
      if (ms >= beforeMs) break;
      latest = result.date;
      cursor = new Date(ms + 1000);
    }
    return latest ? dateToInstant(latest) : null;
  },
};
