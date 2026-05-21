import { useEffect, useMemo, useState } from "react";
import {
  epochMs,
  instantFromEpochMs,
  now,
  type Instant,
} from "../../src/index.js";
import {
  MoonthRing,
  RING_RX,
  RING_RY,
  CARD_HEIGHT,
  moonthStartFromOffset,
  formatShort,
} from "../components/MoonthRing.js";
import { SolarYearTrack } from "../components/SolarYearTrack.js";
import { findRecentNewMoon } from "../components/ConcentricOverview.js";
import { useEvents } from "../store.js";

/**
 * MoonthView — five stacked moonth rings, viewed as a torus laid on
 * its side.
 *
 * Each ring is a flattened ellipse (rx=420, ry=100) — the perspective
 * tilt is steep enough that adjacent moonth rings can stack without
 * cards overlapping between them, but gentle enough that the front
 * and back of each individual ring read as the same ring. The
 * focused (current) ring sits in the middle of the stack with warm
 * accent coloring; the two rings above (past) and two below (future)
 * are cool-toned and partially transparent.
 *
 * Vertically, each ring's bottom-card date aligns with the
 * corresponding mark on the solar year track on the left. Ring
 * spacing in pixels = 28 days on the track, so the track is a true
 * year-spine connecting the rings.
 */

const RINGS_BEFORE = 2;
const RINGS_AFTER = 2;
const STACK_TOTAL_RINGS = RINGS_BEFORE + 1 + RINGS_AFTER;

// Stack-perspective scales. Linear −0.08 per step from focus, so the
// scaling is consistent with imagining 13 rings around a torus's
// solar circumference — the visible 5 are gentle slices of that
// larger geometry, not a steep drop at the edges.
const SCALE_FOCUS = 1.0;
const SCALE_NEIGHBOR_NEAR = 0.92;
const SCALE_NEIGHBOR_FAR = 0.84;

const PERSPECTIVE_BACK_SCALE = 0.42; // matches SCALE_MIN inside MoonthRing

// The visual top of a ring at the back (angle 0°), measured from
// the ring's center, accounting for both the ring radius and the
// back card's perspective scale.
const RING_BACK_EXTENT =
  RING_RY + (CARD_HEIGHT * PERSPECTIVE_BACK_SCALE) / 2;
// The visual bottom of a ring at the front (angle 180°).
const RING_FRONT_EXTENT = RING_RY + CARD_HEIGHT / 2;

function scaleForOffset(offset: number): number {
  if (offset === 0) return SCALE_FOCUS;
  if (Math.abs(offset) === 1) return SCALE_NEIGHBOR_NEAR;
  return SCALE_NEIGHBOR_FAR;
}

/**
 * Distance between the centers of two adjacent rings such that the
 * upper ring's front-bottom touches the lower ring's back-top with no
 * gap or overlap. Both scales need to be accounted for: front extent
 * scales by the upper ring's slot scale, back extent by the lower
 * ring's slot scale.
 */
function spacingBetween(upperScale: number, lowerScale: number): number {
  return RING_FRONT_EXTENT * upperScale + RING_BACK_EXTENT * lowerScale;
}

/** Cumulative center-y offset from the focus ring. */
function ringCenterOffset(offset: number): number {
  if (offset === 0) return 0;
  const dir = Math.sign(offset);
  let cumulative = 0;
  for (let i = 0; i < Math.abs(offset); i++) {
    cumulative += spacingBetween(
      scaleForOffset(dir * i),
      scaleForOffset(dir * (i + 1)),
    );
  }
  return dir * cumulative;
}

// Pre-compute the ring layout once. STACK_HEIGHT is the actual extent
// from the topmost back-top to the bottommost front-bottom.
const RING_OFFSETS = Array.from(
  { length: STACK_TOTAL_RINGS },
  (_, i) => i - RINGS_BEFORE,
);
const RING_CENTERS_REL = RING_OFFSETS.map((o) => ringCenterOffset(o));
const TOP_EDGE =
  RING_CENTERS_REL[0]! -
  RING_BACK_EXTENT * scaleForOffset(RING_OFFSETS[0]!);
const BOTTOM_EDGE =
  RING_CENTERS_REL[RING_CENTERS_REL.length - 1]! +
  RING_FRONT_EXTENT * scaleForOffset(RING_OFFSETS[RING_OFFSETS.length - 1]!);
const STACK_HEIGHT = BOTTOM_EDGE - TOP_EDGE;
const FOCUS_STACK_Y = -TOP_EDGE; // ring-0 center, in stack coordinates

// Canvas wide enough to fit the wheel — side cards at x = ±RX, plus
// half a card width of overhang on each side.
const RING_WIDTH = 1060;
const RING_HEIGHT = RING_RY * 2 + 100; // headroom for the taller cards

// Solar year track shows enough of the year to cover roughly the
// rings on display. We approximate the px-per-day from the
// focus↔neighbor spacing (the average is similar for nearby pairs).
const PX_PER_DAY = spacingBetween(SCALE_FOCUS, SCALE_NEIGHBOR_NEAR) / 28;
const TRACK_HALF_RANGE_DAYS = Math.max(RINGS_BEFORE, RINGS_AFTER) * 28 + 14;

export function MoonthView() {
  const events = useEvents();
  const [nowInstant, setNowInstant] = useState<Instant>(() => now());

  useEffect(() => {
    const id = window.setInterval(() => setNowInstant(now()), 300_000);
    return () => window.clearInterval(id);
  }, []);

  const currentMoonthStart = useMemo(() => findRecentNewMoon(nowInstant), [nowInstant]);

  // Today's day-in-moonth (1..28). Every ring uses this same focus
  // day at its bottom — so reading vertically across rings shows
  // "this same lunar phase position, N moonths ago/ahead".
  const focusDay = useMemo(() => {
    const dayIndex = Math.floor(
      (epochMs(nowInstant) - epochMs(currentMoonthStart)) / 86_400_000,
    );
    return Math.max(1, Math.min(28, dayIndex + 1));
  }, [nowInstant, currentMoonthStart]);

  // Use the module-level RING_OFFSETS so we don't recompute per render.
  const ringOffsets = RING_OFFSETS;

  return (
    <section className="moonth-view">
      <header className="moonth-header">
        <h2>Your year</h2>
        <p className="moonth-caption">
          {STACK_TOTAL_RINGS} moonths stacked along the solar year, viewed as a
          torus on its side. The focused ring (warm) is the current moonth;
          rings above are previous moonths, rings below are upcoming. Reading
          vertically through the rings at any column gives you the same lunar
          phase across cycles.
        </p>
      </header>

      <div className="moonth-layout">
        <SolarYearTrack
          height={STACK_HEIGHT}
          halfRangeDays={TRACK_HALF_RANGE_DAYS}
        />

        <div
          className="moonth-stack"
          style={{ width: RING_WIDTH, height: STACK_HEIGHT }}
        >
          {ringOffsets.map((offset) => {
            const moonthStart = moonthStartFromOffset(currentMoonthStart, offset);
            const variant =
              offset === 0 ? "focus" :
              Math.abs(offset) === 1 ? "neighbor-near" :
              "neighbor-far";
            const stackScale = scaleForOffset(offset);
            // Variable spacing: ring center positions are precomputed
            // so adjacent rings exactly touch (no gap, no overlap)
            // regardless of which scales are at the boundary.
            const ringCenterY = FOCUS_STACK_Y + ringCenterOffset(offset);
            const ringTop = ringCenterY - RING_HEIGHT / 2;
            const moonthEndExclusive = instantFromEpochMs(
              epochMs(moonthStart) + 28 * 86_400_000,
            );
            return (
              <div
                key={offset}
                className="moonth-ring-slot"
                style={{
                  top: ringTop,
                  left: 0,
                  width: RING_WIDTH,
                  height: RING_HEIGHT,
                  transform: `scale(${stackScale})`,
                  transformOrigin: "center center",
                }}
              >
                <div className="moonth-ring-label">
                  <span className="moonth-ring-offset">
                    {offset === 0 ? "this moonth" :
                     offset < 0 ? `${-offset} moonth${offset === -1 ? "" : "s"} ago` :
                     `${offset} moonth${offset === 1 ? "" : "s"} ahead`}
                  </span>
                  <span className="moonth-ring-dates">
                    {formatShort(moonthStart)} – {formatShort(
                      instantFromEpochMs(epochMs(moonthEndExclusive) - 86_400_000),
                    )}
                  </span>
                </div>
                <MoonthRing
                  moonthStart={moonthStart}
                  focusDay={focusDay}
                  variant={variant}
                  events={events}
                  width={RING_WIDTH}
                  height={RING_HEIGHT}
                />
              </div>
            );
          })}
        </div>
      </div>

      <p className="moonth-footer">
        Solar year on the left: {(TRACK_HALF_RANGE_DAYS / 30).toFixed(1)} months in either direction.
        Each ring = 28 days; ring spacing matches {PX_PER_DAY.toFixed(1)}px/day on the track.
      </p>
    </section>
  );
}
