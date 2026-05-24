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

const VISIBLE_HALF_DAYS = 68; // ~2.5 sidereal cycles each side; 5 visible total
const SIDEREAL_CYCLE_DAYS = 27.32;
const VERTICAL_PER_DAY = 8; // target px-per-day pitch *at focus* (along the arc tangent)

const RX = 420;
const RY = 65;
const CARD_WIDTH = 105;
const CARD_HEIGHT = Math.round(CARD_WIDTH * 1.618);

const SCALE_MIN = 0.42;
const OPACITY_MIN = 0.32;

// The year is one closed circle of TURNS_PER_YEAR sidereal lunar cycles.
// Each card's ring-center sits at a real angular position θ on this
// year-circle and gets real 3D (y, z) coordinates from it. Extending the
// same parameterization past the visible 5 rings genuinely closes back
// to itself after 13 — not a normalized 0→1 arc, but the real geometry.
//
// At θ=0 the tangent is vertical, so dy/dθ = R_arc; we pick R_arc so the
// pitch at focus matches VERTICAL_PER_DAY, keeping the year track on the
// left lined up at the focus and only diverging as the arc curves.
const TURNS_PER_YEAR = 13;
const RADIANS_PER_DAY =
  (2 * Math.PI) / (TURNS_PER_YEAR * SIDEREAL_CYCLE_DAYS);
const ARC_RADIUS_PX = VERTICAL_PER_DAY / RADIANS_PER_DAY; // ≈ 452 px

const PERSPECTIVE_PX = 1400; // CSS perspective focal distance

const VISIBLE_DAYS_TOTAL = VISIBLE_HALF_DAYS * 2 + 1;
const CANVAS_WIDTH = 1060;
const CANVAS_HEIGHT = VISIBLE_DAYS_TOTAL * VERTICAL_PER_DAY + 220;

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

  // Compute each card's geometry. Sorted by depth so back cards render first.
  const placed = useMemo(() => {
    const arr = days.map((d) => {
      const cardMs = epochMs(d.at);
      // angle: 180° at the focused-moon-longitude, decreasing as
      // sidereal longitude increases.
      const deltaLong = normalizeAngle(d.moonSiderealAngle - focusSiderealAngle);
      // Use signed delta in (-180, 180] for a clean "shortest forward
      // distance" from focus longitude.
      const signedDelta = deltaLong > 180 ? deltaLong - 360 : deltaLong;
      const angleDeg = 180 - signedDelta;
      const angleRad = (angleDeg * Math.PI) / 180;

      // Days from animated focus, converted to an angular position on
      // the year-circle. Past = θ < 0 (rings curve up-and-back); future
      // = θ > 0 (down-and-back). Extending the same formula for
      // |daysFromFocus| past 6.5 cycles would carry the ring all the
      // way around to the other side of the year-circle.
      const daysFromFocus = (cardMs - animatedMs) / 86_400_000;
      const theta = daysFromFocus * RADIANS_PER_DAY;
      const ringCenterY = ARC_RADIUS_PX * Math.sin(theta);
      const ringCenterZ = ARC_RADIUS_PX * (Math.cos(theta) - 1);

      // X / Y in the 2D plane of the card slot. These describe the
      // CARD CENTER on the rendered surface; the actual perspective
      // foreshortening (cards far from focus appearing smaller and
      // more central) is applied in 3D via the Z below.
      const x = CENTER_X + RX * Math.sin(angleRad);
      const y = CENTER_Y + ringCenterY - RY * Math.cos(angleRad);
      const z = ringCenterZ;

      // Normalized arc-depth for opacity fading — 0 at focus, ~1 at
      // the visible extremes. Independent of the 3D depth above.
      const arcDepth = Math.min(1, Math.abs(daysFromFocus) / VISIBLE_HALF_DAYS);

      // Angular scale — front-vs-back of the local turn. This is the
      // within-ring foreshortening (the back of each ring's ellipse
      // looks smaller). It stays as a manual scale because the ring's
      // 2D ellipse is itself a stylized projection; cards across the
      // ring are at the same Z, so CSS perspective doesn't differentiate
      // them on its own.
      const t = (1 - Math.cos((angleDeg - 180) * Math.PI / 180)) / 2;
      const angularScale = 1 - (1 - SCALE_MIN) * t;

      // Opacity — combine the angular fade with a depth-based fade so
      // the back cards of far-away rings recede atmospherically too.
      const opacity =
        (1 - (1 - OPACITY_MIN) * t) *
        Math.max(OPACITY_MIN, 1 - 0.30 * arcDepth);

      return { day: d, x, y, z, scale: angularScale, opacity, daysFromFocus, angleDeg };
    });
    // Back cards first — depth (z) wins over 2D y for stacking, since
    // CSS preserve-3d composites by actual 3D z order. Sort low-to-high
    // z so deeper cards render first and front cards land on top.
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
          {placed.map(({ day, x, y, z, scale, opacity }) => {
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
                      `translate3d(${x - CARD_WIDTH / 2}px, ${y - CARD_HEIGHT / 2}px, ${z}px)` +
                      ` scale(${scale})`,
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
                  />
                </div>
              );
            })}
        </div>
      </div>

      <p className="moonth-footer">
        Helix pitch: {VERTICAL_PER_DAY}px / day · one turn = {SIDEREAL_CYCLE_DAYS.toFixed(2)}{" "}
        days (sidereal) · {VISIBLE_DAYS_TOTAL} cards visible.
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
