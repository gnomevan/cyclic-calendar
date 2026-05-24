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
const YEAR_DAYS = 365.25;

// Show the whole year for now so the torus shape is obvious.
// We can zoom in on a smaller window once the geometry is right.
const VISIBLE_HALF_DAYS = Math.floor(YEAR_DAYS / 2); // ≈ 182 days each side = full year

const CARD_WIDTH = 50;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.618);

// Torus geometry. The torus is on its side — its axis runs left/right
// (X axis), perpendicular to the camera. The donut sits with the
// hole facing left and right; the camera sees its outer profile as a
// circular ring.
//
//   R_MAJOR — distance from torus center to the cross-section center
//             (= "year-circle radius"). 13 moonth-cross-sections sit
//             around this major circle.
//   R_MINOR — radius of each cross-section circle (the donut tube).
//             Cards going around each cross-section represent the
//             ~28 days of one moonth.
//
// The card helix:
//   φ (major-angle)  = π/2 + daysFromFocus · (2π / YEAR_DAYS)
//                      — focus sits at φ=π/2, the front of the torus
//                        (closest to camera). Past goes up-and-back,
//                        future goes down-and-back.
//   ψ (minor-angle)  = (moonSiderealAngle − focusSiderealAngle) [rad]
//                      — focused day at ψ=0 (cross-section's outward
//                        side = front of focus moonth's cross-section).
//
// Card 3D position on the torus surface:
//   X =  R_minor · sin(ψ)
//   Y = (R_major + R_minor · cos(ψ)) · cos(φ)   [+Y is up in math; flip for CSS]
//   Z = (R_major + R_minor · cos(ψ)) · sin(φ)
//
// CSS `perspective` on the parent does the depth foreshortening.
// R_MAJOR / R_MINOR sets the donut shape. Hole diameter = 2·(R_MAJOR−R_MINOR);
// outer diameter = 2·(R_MAJOR+R_MINOR). Cross-section circumference =
// 2π·R_MINOR, which has to fit ~28 cards per moonth — so wider tube
// (bigger R_MINOR) = less card overlap, but R_MAJOR has to grow even
// faster to keep the hole opening up.
const R_MAJOR = 500;
const R_MINOR = 200;

const PERSPECTIVE_PX = 1600;

const VISIBLE_DAYS_TOTAL = VISIBLE_HALF_DAYS * 2 + 1;
const CANVAS_WIDTH = 1440;
const CANVAS_HEIGHT = 1440;

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
    const out: DayInfo[] = [];
    const focusG = toGregorianUTC(focusInstant);
    const focusNoonMs = Date.UTC(focusG.year, focusG.month - 1, focusG.day, 12);
    for (let k = -VISIBLE_HALF_DAYS; k <= VISIBLE_HALF_DAYS; k++) {
      const ms = focusNoonMs + k * 86_400_000;
      const at = instantFromEpochMs(ms);
      out.push({
        at,
        moonAngle: lunarWheel.positionAt(at),
        moonSiderealAngle: lunarSiderealWheel.positionAt(at),
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

      // φ — major-angle around the year-circle. Focus at π/2 puts the
      // focused moonth at the FRONT of the torus (closest to camera).
      // Past = smaller φ (curves up-and-back); future = larger φ
      // (down-and-back).
      const phi = Math.PI / 2 - daysFromFocus * (2 * Math.PI / YEAR_DAYS);

      // ψ — minor-angle around the moonth-cross-section. Driven by
      // moon's sidereal longitude relative to focus, so the focused
      // day always lands at ψ=0 (outer face of cross-section, pointing
      // away from torus axis — at focus that's straight toward camera).
      const deltaLong = normalizeAngle(d.moonSiderealAngle - focusSiderealAngle);
      const signedDelta = deltaLong > 180 ? deltaLong - 360 : deltaLong;
      const psi = (signedDelta * Math.PI) / 180;

      // Torus surface point: helix the (φ, ψ) coordinates.
      const radial = R_MAJOR + R_MINOR * Math.cos(psi);
      const xMath = R_MINOR * Math.sin(psi);
      const yMath = radial * Math.cos(phi);
      const zMath = radial * Math.sin(phi);

      // Map math → CSS. Math Y is up; CSS y is down.
      const x = CENTER_X + xMath;
      const y = CENTER_Y - yMath;
      const z = zMath;

      return { day: d, x, y, z, daysFromFocus, phi, psi };
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
          height={CANVAS_HEIGHT}
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
          {placed.map(({ day, x, y, z }) => {
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
                  />
                </div>
              );
            })}
        </div>
      </div>

      <p className="moonth-footer">
        Torus: R_major={R_MAJOR}px · R_minor={R_MINOR}px · one moonth = {SIDEREAL_CYCLE_DAYS.toFixed(2)}{" "}
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
