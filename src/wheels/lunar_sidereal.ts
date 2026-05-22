import { EclipticGeoMoon } from "../astronomy.js";
import type { Instant } from "../instant.js";
import {
  epochMs,
  instantFromEpochMs,
  instantToDate,
} from "../instant.js";
import {
  normalizeAngle,
  type Anchor,
  type Angle,
  type Wheel,
} from "../wheel.js";

/**
 * The sidereal lunar wheel — the moon's angular position against the
 * fixed stars (ecliptic longitude in the sidereal frame).
 *
 * Distinct from `src/wheels/lunar.ts`, which measures the moon's *phase*
 * (sun-relative elongation, synodic cycle ~29.53 days). This wheel
 * measures the moon's *position* (sidereal cycle ~27.32 days). Both
 * track the same celestial body but capture different facets — ADR-003
 * established that one body can drive multiple wheels and this is that
 * case made concrete.
 *
 * Anchors are the 27 nakshatras — equal 13°20′ slices of the sidereal
 * ecliptic, starting at Ashvini (0°). The 27-fold lunar zodiac is the
 * cross-cultural Vedic / Chinese xiu / Arabic manazil division, all of
 * which historically track this sidereal cycle rounded.
 *
 * The wheel is sidereal-primary by design (ADR-014). The tropical
 * (of-date) longitude that `astronomy-engine` reports is converted by
 * subtracting the ayanamsa — the precession-driven offset between
 * tropical and sidereal frames. We use the Lahiri convention.
 *
 * `nextCrossing` and `previousCrossing` are implemented by sampling +
 * bisection because the underlying library exposes longitude search
 * only for the sun, not the moon.
 */

const NAKSHATRA_NAMES: readonly string[] = [
  "Ashvini",        "Bharani",          "Krittika",
  "Rohini",         "Mrigashira",       "Ardra",
  "Punarvasu",      "Pushya",           "Ashlesha",
  "Magha",          "Purva Phalguni",   "Uttara Phalguni",
  "Hasta",          "Chitra",           "Swati",
  "Vishakha",       "Anuradha",         "Jyeshtha",
  "Mula",           "Purva Ashadha",    "Uttara Ashadha",
  "Shravana",       "Dhanishta",        "Shatabhisha",
  "Purva Bhadrapada","Uttara Bhadrapada","Revati",
];

const NAKSHATRA_IDS: readonly string[] = NAKSHATRA_NAMES.map((n) =>
  n.toLowerCase().replace(/ /g, "_"),
);

/** Width of each nakshatra in degrees (360° / 27). */
export const NAKSHATRA_WIDTH = 360 / 27;

export const LUNAR_SIDEREAL_ANCHORS: readonly Anchor[] = NAKSHATRA_NAMES.map(
  (name, i) => ({
    id: NAKSHATRA_IDS[i]!,
    name,
    wheelId: "lunar_sidereal",
    angle: i * NAKSHATRA_WIDTH,
  }),
);

/* ----- Ayanamsa (tropical → sidereal offset) -------------------------- *
 *
 *  Lahiri (Chitra-paksha) ayanamsa. Linear approximation anchored at
 *  J2000.0 (Jan 1 2000, 12:00 UT), drift ~50.29″/year.
 *
 *  At J2000.0: ayanamsa ≈ 23.852°
 *  Annual rate: 50.29″ / 3600 ≈ 0.013969°/yr
 *  Therefore at 2026: ~24.215° (matches the spec's "~24.2° in 2026").
 *
 *  A higher-order polynomial would track Lahiri more precisely across
 *  centuries; the linear form is accurate to better than 0.01° over
 *  ±100 years from J2000, which is plenty for a calendar.
 * ---------------------------------------------------------------------- */

const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);
const AYANAMSA_J2000_DEG = 23.852;
const AYANAMSA_ANNUAL_RATE_DEG = 50.29 / 3600; // ≈ 0.013969 deg/year
const MS_PER_YEAR = 365.25 * 86_400_000;

export function ayanamsa(at: Instant): number {
  const yearsSinceJ2000 = (epochMs(at) - J2000_MS) / MS_PER_YEAR;
  return AYANAMSA_J2000_DEG + yearsSinceJ2000 * AYANAMSA_ANNUAL_RATE_DEG;
}

/* ----- positionAt as a pure function (used by both methods) ----------- */

function siderealLongitudeAt(at: Instant): Angle {
  const tropical = EclipticGeoMoon(instantToDate(at)).lon;
  return normalizeAngle(tropical - ayanamsa(at));
}

/* ----- Search primitives ---------------------------------------------- *
 *
 *  The moon moves ~13.18°/day in sidereal longitude (a touch over ½° per
 *  hour). Sampling at 12-hour intervals advances ~6.6° per step — safely
 *  under the 180° per-step bound for unambiguous bracketing, and dense
 *  enough that a single sidereal cycle is covered in ~55 samples.
 *
 *  After locating the bracketing interval, bisect to 1-second precision.
 * ---------------------------------------------------------------------- */

const SAMPLE_STEP_MS = 12 * 60 * 60 * 1000;
const BISECT_PRECISION_MS = 1000;
const STRICTLY_AFTER_NUDGE_MS = 30 * 60 * 1000; // 30 min
const ONE_CYCLE_DAYS = 28; // a safe upper bound — actual is ~27.32

/**
 * Returns true if the target angle lies strictly after `a` and at or
 * before `b`, when walking the moon's natural forward (increasing
 * longitude) direction. Handles wrap from ~360° back through 0°.
 */
function bracketsTarget(a: number, b: number, target: number): boolean {
  const interval = normalizeAngle(b - a);
  const offset = normalizeAngle(target - a);
  return offset > 0 && offset <= interval;
}

function bisectForCrossing(
  loMs: number,
  hiMs: number,
  target: number,
): number {
  let lo = loMs;
  let hi = hiMs;
  let loAngle = siderealLongitudeAt(instantFromEpochMs(lo));
  while (hi - lo > BISECT_PRECISION_MS) {
    const midMs = Math.floor((lo + hi) / 2);
    const midAngle = siderealLongitudeAt(instantFromEpochMs(midMs));
    if (bracketsTarget(loAngle, midAngle, target)) {
      hi = midMs;
    } else {
      lo = midMs;
      loAngle = midAngle;
    }
  }
  return Math.floor((lo + hi) / 2);
}

function forwardSearch(targetAngle: Angle, afterMs: number): Instant | null {
  const target = normalizeAngle(targetAngle);
  const startMs = afterMs + STRICTLY_AFTER_NUDGE_MS;
  let prevMs = startMs;
  let prevAngle = siderealLongitudeAt(instantFromEpochMs(prevMs));
  const limitMs = startMs + ONE_CYCLE_DAYS * 86_400_000 + SAMPLE_STEP_MS;
  let curMs = startMs + SAMPLE_STEP_MS;
  while (curMs <= limitMs) {
    const curAngle = siderealLongitudeAt(instantFromEpochMs(curMs));
    if (bracketsTarget(prevAngle, curAngle, target)) {
      return instantFromEpochMs(bisectForCrossing(prevMs, curMs, target));
    }
    prevMs = curMs;
    prevAngle = curAngle;
    curMs += SAMPLE_STEP_MS;
  }
  return null;
}

function backwardSearch(targetAngle: Angle, beforeMs: number): Instant | null {
  // Walk forward from one cycle before `before`, accept the latest
  // crossing strictly less than `before`.
  const target = normalizeAngle(targetAngle);
  const windowStartMs = beforeMs - (ONE_CYCLE_DAYS + 1) * 86_400_000;
  let prevMs = windowStartMs;
  let prevAngle = siderealLongitudeAt(instantFromEpochMs(prevMs));
  let latest: number | null = null;
  let curMs = windowStartMs + SAMPLE_STEP_MS;
  while (curMs <= beforeMs + SAMPLE_STEP_MS) {
    const curAngle = siderealLongitudeAt(instantFromEpochMs(curMs));
    if (bracketsTarget(prevAngle, curAngle, target)) {
      const found = bisectForCrossing(prevMs, curMs, target);
      if (found < beforeMs) {
        latest = found;
      } else {
        // We've crossed past `before`; the previous `latest` is our answer.
        break;
      }
    }
    prevMs = curMs;
    prevAngle = curAngle;
    curMs += SAMPLE_STEP_MS;
  }
  return latest !== null ? instantFromEpochMs(latest) : null;
}

/* ----- The wheel ------------------------------------------------------ */

export const lunarSiderealWheel: Wheel = {
  id: "lunar_sidereal",
  name: "Lunar Sidereal",
  kind: "predictive",
  requiresObserver: false,
  anchors: LUNAR_SIDEREAL_ANCHORS,

  positionAt(at: Instant): Angle {
    return siderealLongitudeAt(at);
  },

  nextCrossing(targetAngle: Angle, after: Instant): Instant | null {
    return forwardSearch(targetAngle, epochMs(after));
  },

  previousCrossing(targetAngle: Angle, before: Instant): Instant | null {
    return backwardSearch(targetAngle, epochMs(before));
  },
};
