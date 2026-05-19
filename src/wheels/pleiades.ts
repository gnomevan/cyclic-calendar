import { SunPosition, SearchSunLongitude } from "../astronomy.js";
import type { Instant } from "../instant.js";
import { instantToDate, dateToInstant, epochMs } from "../instant.js";
import {
  normalizeAngle,
  type Anchor,
  type Angle,
  type Wheel,
} from "../wheel.js";

/**
 * The Pleiades wheel: angular separation between the Sun and the Pleiades
 * cluster along the ecliptic. The angle increases as the Sun moves east of
 * the cluster (which it does ~1°/day), completing one full cycle per
 * tropical year. Zero means the Sun is at the Pleiades — conjunction,
 * invisible.
 *
 * This wheel exists to validate the Wheel interface against a *stellar*
 * cycle (as opposed to the solar/lunar wheels that are both Sun-anchored).
 * The discipline question it raises — how should observer latitude be
 * carried, since the culturally meaningful events (heliacal rising and
 * setting) shift with latitude — is recorded in ADR-010.
 *
 * The conclusion: the wheel's core methods are observer-independent, and
 * latitude-dependent events are exposed as helper functions
 * (`heliacalRisingAngle`, `heliacalSettingAngle`) that return target angles
 * to feed into `nextCrossing`. The Wheel interface did not need amendment.
 */

/**
 * Ecliptic longitude of Alcyone (η Tauri), the brightest Pleiad, J2000.0.
 *
 * Computed from Alcyone's J2000 equatorial coordinates (RA 03h47m29s,
 * Dec +24°06'18") rotated through the obliquity of the ecliptic. We use
 * a constant rather than a per-instant calculation because the Pleiades'
 * ecliptic longitude shifts by ~50 arcseconds per year due to precession
 * — about 1.1° per century, negligible across the timespans this calendar
 * is asked to reason about. If we ever need eclipse-grade precision over
 * deep time, the constant becomes a function of the instant.
 */
export const PLEIADES_ECLIPTIC_LON_J2000: Angle = 60.0;

/**
 * The latitude-independent anchors. Conjunction and acronychal rising are
 * defined purely by Sun-Pleiades ecliptic geometry; they do not shift with
 * observer latitude.
 *
 * Heliacal rising and setting are intentionally NOT in this list. They
 * depend on the observer's latitude (the Pleiades are dim, so the Sun must
 * be deeper below the horizon at higher latitudes for them to be seen),
 * and that observer-dependence belongs to the helper functions below, not
 * to the wheel's universal anchor set.
 */
export const PLEIADES_ANCHORS: readonly Anchor[] = [
  { id: "conjunction",       name: "Conjunction",       wheelId: "pleiades", angle: 0   },
  { id: "acronychal_rising", name: "Acronychal Rising", wheelId: "pleiades", angle: 180 },
];

export const pleiadesWheel: Wheel = {
  id: "pleiades",
  name: "Pleiades",
  kind: "predictive",
  requiresObserver: false,
  anchors: PLEIADES_ANCHORS,

  positionAt(at: Instant): Angle {
    const sp = SunPosition(instantToDate(at));
    return normalizeAngle(sp.elon - PLEIADES_ECLIPTIC_LON_J2000);
  },

  nextCrossing(targetAngle: Angle, after: Instant): Instant | null {
    // The wheel angle is (sunLon − pleiadesLon) mod 360, so the sun
    // longitude we need to search for is (pleiadesLon + targetAngle) mod 360.
    const targetSunLon = normalizeAngle(
      PLEIADES_ECLIPTIC_LON_J2000 + targetAngle,
    );
    const start = instantToDate(after);
    const result = SearchSunLongitude(targetSunLon, start, 370);
    if (!result) return null;
    const ms = result.date.getTime();
    if (ms <= epochMs(after)) {
      const nudged = new Date(ms + 1000);
      const second = SearchSunLongitude(targetSunLon, nudged, 370);
      return second ? dateToInstant(second.date) : null;
    }
    return dateToInstant(result.date);
  },
};

/**
 * The ecliptic separation between Sun and Pleiades at which the cluster
 * becomes visible at dawn for an observer at the given latitude — i.e.,
 * the wheel angle at heliacal rising for that observer.
 *
 * Heliacal rising requires the cluster to clear the horizon while the Sun
 * is still far enough below it that the dimmest member stars are not lost
 * in twilight. The required solar depression — the "arcus visionis" — is
 * a few degrees larger for the faint Pleiades than for, say, Sirius, and
 * grows with latitude because the ecliptic intersects the horizon at a
 * shallower angle there, drawing out twilight.
 *
 * The formula below is a linear approximation, calibrated so that low
 * latitudes give ~11° (matching the classical Mediterranean value used by
 * Hesiod and others). It is good enough to put events in the right week.
 * If we ever need observatory-grade timing, replace this with a proper
 * arcus visionis calculation (Schaefer 1985 et al.).
 */
export function heliacalRisingAngle(latitude: number): Angle {
  return 11 + Math.abs(latitude) * 0.1;
}

/**
 * The ecliptic separation at which the Pleiades are last visible at dusk
 * before the period of invisibility around conjunction. Symmetric to
 * heliacal rising — same physics, opposite side of the cycle.
 */
export function heliacalSettingAngle(latitude: number): Angle {
  return normalizeAngle(-(11 + Math.abs(latitude) * 0.1));
}
