import { useEffect, useMemo, useRef, useState } from "react";
import {
  epochMs,
  instantFromEpochMs,
  lunarSiderealWheel,
  lunarWheel,
  now,
  normalizeAngle,
  resolve,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
} from "../../src/index.js";
import { DayCard, type DayEventOccurrence } from "../components/DayCard.js";
import { findRecentNewMoon } from "../components/ConcentricOverview.js";
import { SolarYearTrack } from "../components/SolarYearTrack.js";
import { ensureFocus, useFocus } from "../focus.js";
import { useEvents } from "../store.js";
import { wheelRegistry } from "../wheels.js";

/**
 * MoonthView — the continuous helix of cards.
 *
 * No discrete rings. Every card is on one continuous spiral whose
 * angular axis is the moon's sidereal longitude and whose vertical
 * axis is time. As the user moves through the year, the helix winds
 * downward; one full turn corresponds to one sidereal lunar cycle
 * (~27.32 days). Five turns are visible at once, with the focused
 * day at the front-bottom of the central turn.
 *
 * Card positions are derived directly from the moon's *actual*
 * sidereal longitude at each card's instant — so the same lunar
 * phase position always sits at the same angular position on the
 * spiral, and cycle-to-cycle drift relative to the sun-zodiac year
 * track is what naturally appears.
 *
 * The solar year track stays on the left as a separate strip, with
 * the same vertical span as the helix so anchors and zodiac labels
 * align horizontally with the corresponding helix moments.
 *
 * Animation: when the user clicks a card, the focus instant is
 * interpolated in JS over 900 ms (ease-in-out cubic). Card positions
 * re-derive each frame, so every card traces the rim continuously.
 */

const SIDEREAL_CYCLE_DAYS = 27.32;

// "One ring" of the torus now spans 100 years instead of 1. This is a
// readability cheat: the visible 5-cycle window covers only ~0.4 % of
// the major circle, so its arc is essentially flat on screen, while
// the math still closes back to itself — just at 100 years instead
// of 1. R_MAJOR scales proportionally below so the per-day pitch
// stays matched to the live wheel's 8 px/day.
const YEAR_DAYS = 365.25 * 100;

// 5 sidereal cycles visible at a time — same window as the live
// version. The remaining ~8 cycles' worth of cards live off-screen on
// the torus, behind us; we just don't render them.
const VISIBLE_HALF_DAYS = 68;

// Card width matches the live version (readable).
const CARD_WIDTH = 105;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.618);

// Torus geometry — axis along X (horizontal, perpendicular to view).
// Major circle lives in the YZ plane; the donut's hole points left/
// right (out of view). We see the torus edge-on: a vertical band
// where the top and bottom lobes hold the cards from the upper and
// lower arcs of the year-circle, and the visible "hole" is the gap
// between those lobes near vertical center.
//
//   R_MAJOR — distance from torus center to each cross-section center.
//             Bigger ⇒ top/bottom lobes farther apart ⇒ bigger gap.
//   R_MINOR — cross-section radius (donut tube thickness). Bigger ⇒
//             cards spread more horizontally and less overlap.
//
// The card helix is a (1, ~13) torus knot — one major revolution per
// year, ~13 minor revolutions (one per sidereal lunar cycle):
//
//   φ (major) = π/2 + daysFromFocus · (2π / YEAR_DAYS)
//               — focus at φ=π/2 sits at the front of the edge-on
//                 torus (z = +(R+r), closest to camera). Past = larger
//                 φ (curves up); future = smaller φ (curves down).
//   ψ (minor) = (moonSiderealAngle − focusSiderealAngle)
//               — focused day at ψ=0, on the outer face of its
//                 cross-section (pointing away from torus axis).
//
// Torus surface point:
//   X =  R_MINOR · sin(ψ)
//   Y = (R_MAJOR + R_MINOR · cos(ψ)) · cos(φ)
//   Z = (R_MAJOR + R_MINOR · cos(ψ)) · sin(φ)
//
// CSS `perspective` on the parent handles depth foreshortening.
// Torus dimensions. With YEAR_DAYS now 36 525, the visible 5-cycle
// window subtends only ~0.023 rad of the major circle, so sin(N·RATE)
// ≈ N·RATE and per-day pitch dy/dt = R_MAJOR · 2π / YEAR_DAYS. R_MAJOR
// is the lever for vertical separation between moonth-rings:
//
//   pitch (px/day) = R_MAJOR · 2π / YEAR_DAYS
//   For 10 px/day:  R_MAJOR ≈ 58 000  (cycle-to-cycle vertical = 273 px)
//   For  8 px/day:  R_MAJOR ≈ 46 500  (cycle-to-cycle vertical = 218 px)
//
// Cross-section is an ELLIPSOID, not a circle:
//
//   R_MINOR_X: horizontal extent. Wider ⇒ cards spread more around the
//              ring; tighter ⇒ cards bump into each other at the front.
//   R_MINOR_Y: vertical extent (the tilted-ellipse look) — the focused
//              day at ψ=0 sits below ring centre by R_MINOR_Y, back of
//              cycle (ψ=π) sits above by the same. Smaller R_MINOR_Y =
//              less ring-to-ring vertical overlap.
//   R_MINOR_Z: depth extent for the CSS perspective foreshortening.
//
// PERSPECTIVE_PX controls the strength of the 3D effect. Larger
// distance ⇒ flatter projection, less foreshortening. The front-to-
// back scale ratio inside one ring is P / (P + 2·R_MINOR_Z).
const R_MAJOR = Math.round((10 * YEAR_DAYS) / (2 * Math.PI));
const R_MINOR_X = 540;
const R_MINOR_Y = 65;
const R_MINOR_Z = 345;
const PERSPECTIVE_PX = 1000;

// Visible vertical extent of the helix — distance from the topmost
// ring centre (focus − VISIBLE_HALF_DAYS) to the bottommost. The
// solar year track is sized to match this so it doesn't stick out
// above or below the wheel, and its per-day scale matches the
// helix's per-day pitch one-to-one.
const VISIBLE_Y_RANGE =
  2 * R_MAJOR * Math.sin((VISIBLE_HALF_DAYS * 2 * Math.PI) / YEAR_DAYS);

const VISIBLE_DAYS_TOTAL = VISIBLE_HALF_DAYS * 2 + 1;
const CANVAS_WIDTH = 1100;
const CANVAS_HEIGHT = 1900;

const CENTER_X = CANVAS_WIDTH / 2;
const CENTER_Y = CANVAS_HEIGHT / 2;

export function MoonthView() {
  const events = useEvents();
  const [nowInstant, setNowInstant] = useState<Instant>(() => now());

  useEffect(() => {
    const id = window.setInterval(() => setNowInstant(now()), 300_000);
    return () => window.clearInterval(id);
  }, []);

  // Today, snapped to noon UTC so the card grid aligns to day-midpoints.
  const todayNoon = useMemo<Instant>(
    () =>
      instantFromEpochMs(
        Math.floor(epochMs(nowInstant) / 86_400_000) * 86_400_000 +
          12 * 60 * 60 * 1000,
      ),
    [nowInstant],
  );

  // Initialize focus to today on first render. After that the user
  // drives focus by clicking cards.
  useEffect(() => {
    ensureFocus(todayNoon);
  }, [todayNoon]);

  const focusInstant = useFocus() ?? todayNoon;

  // Smoothly animate the focus instant so card positions re-derive
  // every frame and trace the rim continuously.
  const animatedFocus = useAnimatedInstant(focusInstant, 900);

  // For "today glow" — does the visible range include today?
  // (Always yes for ±68 days; this is here for clarity, and also lets
  // future zoom-out hide the glow when today is off-screen.)
  const animatedFocusDays = (epochMs(animatedFocus) - epochMs(todayNoon)) / 86_400_000;
  void animatedFocusDays; // future hook for "you're N days from today" UI

  // Build the visible card window: VISIBLE_DAYS_TOTAL cards centered
  // on the target focus (not the animated one — keeps the window
  // stable while rotation animates around it).
  const focusMs = epochMs(focusInstant);
  const days = useMemo(() => {
    const focusG = toGregorianUTC(focusInstant);
    const focusNoonMs = Date.UTC(focusG.year, focusG.month - 1, focusG.day, 12);
    const startMs = focusNoonMs - (VISIBLE_HALF_DAYS + 1) * 86_400_000;
    const endMs = focusNoonMs + (VISIBLE_HALF_DAYS + 1) * 86_400_000;

    // Pre-compute every phase crossing in the visible window so each
    // card can be tagged with its own primary phase event (if any)
    // in O(1) by binning into day-midnight buckets.
    const phaseEvents = collectPhaseEvents(startMs, endMs);
    const phaseByDayBucket = new Map<
      number,
      { kind: "new" | "first_quarter" | "full" | "last_quarter"; at: Instant }
    >();
    for (const e of phaseEvents) {
      // Bucket key = midnight-UTC of the day containing the crossing.
      const midnight = Math.floor(e.ms / 86_400_000) * 86_400_000;
      // If a day has multiple crossings somehow, prefer the earliest
      // (rare — phases are ~7 days apart, so this is just defensive).
      if (!phaseByDayBucket.has(midnight)) {
        phaseByDayBucket.set(midnight, { kind: e.kind, at: e.at });
      }
    }

    const out: DayInfo[] = [];
    for (let k = -VISIBLE_HALF_DAYS; k <= VISIBLE_HALF_DAYS; k++) {
      const ms = focusNoonMs + k * 86_400_000;
      const at = instantFromEpochMs(ms);
      const midnight = Math.floor(ms / 86_400_000) * 86_400_000;
      const phaseEvent = phaseByDayBucket.get(midnight);
      out.push({
        at,
        moonAngle: lunarWheel.positionAt(at),
        moonSiderealAngle: lunarSiderealWheel.positionAt(at),
        ...(phaseEvent ? { phaseEvent } : {}),
      });
    }
    return out;
  }, [focusMs, focusInstant]);

  // Sidereal longitude of the moon at the (animated) focus — used as
  // the angular reference so the focused card sits at angular 180°.
  const focusSiderealAngle = useMemo(
    () => lunarSiderealWheel.positionAt(animatedFocus),
    [animatedFocus],
  );

  const targetMs = epochMs(focusInstant);
  const animatedMs = epochMs(animatedFocus);

  // Helper: today's noon-UTC day index relative to focus (for the today glow).
  const todayMs = epochMs(todayNoon);

  // Resolve events to per-day buckets within the visible window.
  const eventsByDayMs = useMemo(() => groupEventsByDayMs(events, days), [events, days]);

  // Compute each card's geometry on the torus surface.
  // Sort by z so back cards render first (CSS preserve-3d composites
  // by real 3D z order; the sort still matters for ties).
  const placed = useMemo(() => {
    const arr = days.map((d) => {
      const cardMs = epochMs(d.at);
      const daysFromFocus = (cardMs - animatedMs) / 86_400_000;

      // φ — major-angle around the year-circle. Focus at π/2 sits at
      // the front of the (edge-on) torus, closest to camera before
      // the tilt is applied. Past = larger φ (curves up); future =
      // smaller φ (curves down).
      const phi = Math.PI / 2 + daysFromFocus * (2 * Math.PI / YEAR_DAYS);

      // ψ — minor-angle around the moonth-cross-section. Driven by
      // moon's sidereal longitude relative to focus, so the focused
      // day lands at ψ=0 (outer face of cross-section).
      const deltaLong = normalizeAngle(d.moonSiderealAngle - focusSiderealAngle);
      const signedDelta = deltaLong > 180 ? deltaLong - 360 : deltaLong;
      const psi = (signedDelta * Math.PI) / 180;

      // Card position on the ellipsoidal-cross-section torus.
      //
      // Cross-section components (independent X, Y, Z extents):
      //   x_within = R_MINOR_X · sin(ψ)   horizontal spread
      //   y_within = −R_MINOR_Y · cos(ψ)  vertical tilt — focused day
      //                                    (ψ=0) sits below ring center,
      //                                    back of cycle (ψ=π) sits above
      //   z_within = R_MINOR_Z · cos(ψ)   depth: front of ring closer
      //                                    to camera, back further away
      //
      // Major-circle: at this scale (100-year ring) sin(phi) ≈ 1 over
      // the whole visible window, so the major contribution is mostly
      // a small phi-dependent y shift and a near-constant z bias.
      const xMath = R_MINOR_X * Math.sin(psi);
      const yMath = R_MAJOR * Math.cos(phi) - R_MINOR_Y * Math.cos(psi);
      // Shift z so the front of focus ring (ψ=0, phi=π/2) lands at
      // z=0. Without the shift, cards would be tens of thousands of
      // pixels in front of the CSS perspective focal plane and the
      // projection would invert.
      const zMath =
        R_MAJOR * Math.sin(phi) +
        R_MINOR_Z * Math.cos(psi) -
        (R_MAJOR + R_MINOR_Z);

      // Map math → CSS. Math Y is up; CSS y is down.
      const x = CENTER_X + xMath;
      const y = CENTER_Y - yMath;
      const z = zMath;

      // Opacity gradient (matches the live wheel) — front of ring full
      // opaque, back fades to OPACITY_MIN so it stays visible without
      // dominating. The cross-section's Y tilt already separates front-
      // and back-cards on screen, so this gradient is the icing.
      const t = (1 - Math.cos(psi)) / 2; // 0 at front, 1 at back
      const opacity = 1 - (1 - 0.32) * t;

      return { day: d, x, y, z, opacity, daysFromFocus, phi, psi };
    });
    arr.sort((a, b) => a.z - b.z);
    return arr;
  }, [days, focusSiderealAngle, animatedMs]);

  return (
    <section className="moonth-view">
      <header className="moonth-header">
        <h2>The year, helixed</h2>
        <p className="moonth-caption">
          Five sidereal lunar cycles visible at once. The focused card is at
          the front; the helix winds vertically through time and rotates
          per cycle. Click any card to spin it into focus.
        </p>
        <p className="moonth-viewing">
          Viewing: <strong>{formatShort(focusInstant)}</strong>
          {Math.abs(epochMs(focusInstant) - todayMs) < 86_400_000 / 2
            ? " (today)"
            : null}
        </p>
      </header>

      <div className="moonth-layout">
        <SolarYearTrack
          height={VISIBLE_Y_RANGE}
          halfRangeDays={VISIBLE_HALF_DAYS}
          referenceInstant={focusInstant}
          nowInstant={nowInstant}
        />

        <div
          className="helix-canvas"
          style={{
            width: CANVAS_WIDTH,
            height: CANVAS_HEIGHT,
            position: "relative",
            perspective: `${PERSPECTIVE_PX}px`,
            perspectiveOrigin: "50% 50%",
          }}
        >
          {placed.map(({ day, x, y, z, opacity }) => {
              const cardMs = epochMs(day.at);
              const isFocus = cardMs === targetMs;
              const isToday =
                Math.abs(cardMs - todayMs) < 86_400_000 / 2;
              const moonthDay = computeDayInSynodicMoonth(day.at);
              return (
                <div
                  key={cardMs}
                  className="moonth-card-slot"
                  style={{
                    transform:
                      `translate3d(${x - CARD_WIDTH / 2}px, ${y - CARD_HEIGHT / 2}px, ${z}px)`,
                    opacity,
                  }}
                >
                  <DayCard
                    moonthDay={moonthDay}
                    moonAngle={day.moonAngle}
                    moonSiderealAngle={day.moonSiderealAngle}
                    at={day.at}
                    isFocus={isFocus}
                    isToday={isToday}
                    events={eventsByDayMs.get(cardMs) ?? []}
                    width={CARD_WIDTH}
                    variant="focus"
                    {...(day.phaseEvent ? { phaseEvent: day.phaseEvent } : {})}
                  />
                </div>
              );
            })}
        </div>
      </div>

      <p className="moonth-footer">
        Torus: R_major={R_MAJOR}px · R_minor={R_MINOR_X}/{R_MINOR_Y}/{R_MINOR_Z}px · one moonth = {SIDEREAL_CYCLE_DAYS.toFixed(2)}{" "}
        sidereal days · {VISIBLE_DAYS_TOTAL} cards visible (whole year).
      </p>
    </section>
  );
}

/* ----- helpers ------------------------------------------------------- */

interface DayInfo {
  at: Instant;
  moonAngle: number;
  moonSiderealAngle: number;
  /**
   * If the day contains a primary moon-phase crossing (new / first
   * quarter / full / last quarter), the exact instant of that
   * crossing and which phase it is. Otherwise undefined.
   */
  phaseEvent?: { kind: "new" | "first_quarter" | "full" | "last_quarter"; at: Instant };
}

const PHASE_ANCHOR_KINDS = [
  { kind: "new" as const, angle: 0 },
  { kind: "first_quarter" as const, angle: 90 },
  { kind: "full" as const, angle: 180 },
  { kind: "last_quarter" as const, angle: 270 },
];

/** All synodic phase crossings within [startMs, endMs]. */
function collectPhaseEvents(
  startMs: number,
  endMs: number,
): { kind: DayInfo["phaseEvent"] extends infer T ? T extends { kind: infer K } ? K : never : never; at: Instant; ms: number }[] {
  const out: { kind: "new" | "first_quarter" | "full" | "last_quarter"; at: Instant; ms: number }[] = [];
  for (const anchor of PHASE_ANCHOR_KINDS) {
    let cursor = instantFromEpochMs(startMs);
    // At most ~5 crossings of each phase in a ±6-month window.
    for (let i = 0; i < 8; i++) {
      const hit = lunarWheel.nextCrossing(anchor.angle, cursor);
      if (!hit) break;
      const ms = epochMs(hit);
      if (ms > endMs) break;
      out.push({ kind: anchor.kind, at: hit, ms });
      cursor = instantFromEpochMs(ms + 60_000); // skip 1 minute to avoid re-finding same crossing
    }
  }
  out.sort((a, b) => a.ms - b.ms);
  return out;
}

function formatShort(at: Instant): string {
  const g = toGregorianUTC(at);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[g.month - 1]} ${g.day}, ${g.year}`;
}

/**
 * Day-in-moonth label for the card — derived for display from the
 * card's instant and the most recent synodic new moon. Not a stored
 * primary attribute on the card.
 */
function computeDayInSynodicMoonth(at: Instant): number {
  const newMoon = findRecentNewMoon(at);
  const days = (epochMs(at) - epochMs(newMoon)) / 86_400_000;
  return Math.max(1, Math.floor(days) + 1);
}

/**
 * Bucket events into per-day-instant maps. Keys are the card's
 * `at` epoch-ms (noon-UTC midpoints of each visible day).
 */
function groupEventsByDayMs(
  events: CalendarEvent[],
  days: DayInfo[],
): Map<number, DayEventOccurrence[]> {
  const result = new Map<number, DayEventOccurrence[]>();
  if (days.length === 0) return result;
  const startMs = epochMs(days[0]!.at) - 12 * 60 * 60 * 1000; // midnight of first day
  const endMs = epochMs(days[days.length - 1]!.at) + 12 * 60 * 60 * 1000; // midnight after last day
  for (const event of events) {
    let cursor = instantFromEpochMs(startMs);
    for (let i = 0; i < 200; i++) {
      let r;
      try {
        r = resolve(event.rule, { registry: wheelRegistry, from: cursor });
      } catch {
        break;
      }
      if (!r) break;
      const ms = epochMs(r.at);
      if (ms >= endMs) break;
      // Bucket to the day card whose noon is within ±12h.
      const dayMidpointMs = Math.floor((ms - startMs) / 86_400_000) * 86_400_000 + startMs + 12 * 60 * 60 * 1000;
      if (dayMidpointMs >= startMs && dayMidpointMs <= endMs) {
        const list = result.get(dayMidpointMs) ?? [];
        list.push({ event, at: r.at });
        result.set(dayMidpointMs, list);
      }
      if (ms <= epochMs(cursor)) break;
      cursor = instantFromEpochMs(ms + 1000);
    }
  }
  for (const occurrences of result.values()) {
    occurrences.sort((a, b) => epochMs(a.at) - epochMs(b.at));
  }
  return result;
}

/* ----- focus-instant animation -------------------------------------- */

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/**
 * Animates an Instant value toward a target over `duration` ms with
 * ease-in-out cubic. Card positions re-derive each frame, so the
 * helix rotates continuously rather than via CSS linear interpolation.
 */
function useAnimatedInstant(target: Instant, duration: number): Instant {
  const [value, setValue] = useState<Instant>(target);
  const valueRef = useRef<Instant>(target);
  valueRef.current = value;

  useEffect(() => {
    const fromMs = epochMs(valueRef.current);
    const toMs = epochMs(target);
    if (fromMs === toMs) return;
    const startTime = performance.now();
    let raf = 0;
    function tick(time: number) {
      const t = Math.min((time - startTime) / duration, 1);
      const nextMs = fromMs + (toMs - fromMs) * easeInOutCubic(t);
      setValue(instantFromEpochMs(nextMs));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);

  return value;
}
