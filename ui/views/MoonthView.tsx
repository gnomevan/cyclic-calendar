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

// Stack: ring centers spaced ~290 px apart so cards don't collide
// between rings. CARD_HEIGHT/2 above the top card and below the
// bottom card determines the safe vertical gap.
const RING_SPACING = 300;
const RINGS_BEFORE = 2;
const RINGS_AFTER = 2;

const RING_WIDTH = 960;
const RING_HEIGHT = RING_RY * 2 + 80; // a touch of headroom for card half-heights

// Solar year track height matches the total ring-stack height plus
// the half-card extents on top and bottom.
const STACK_TOTAL_RINGS = RINGS_BEFORE + 1 + RINGS_AFTER;
const STACK_HEIGHT =
  (STACK_TOTAL_RINGS - 1) * RING_SPACING + // spacing between centers
  RING_RY * 2 +                            // top and bottom ring's vertical extent
  CARD_HEIGHT;                             // card extents beyond the ring edges

// The solar track shows ±(RINGS_BEFORE/AFTER moonths) of context.
// 28 days per ring at RING_SPACING pixels each → pxPerDay = RING_SPACING/28.
const PX_PER_DAY = RING_SPACING / 28;
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

  // Build the array of ring offsets: -RINGS_BEFORE .. +RINGS_AFTER.
  const ringOffsets = useMemo(
    () => Array.from({ length: STACK_TOTAL_RINGS }, (_, i) => i - RINGS_BEFORE),
    [],
  );

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
            // Position the ring vertically. ring 0 sits in the
            // middle; offsets above are higher on the page.
            const centerOffsetPx = offset * RING_SPACING;
            const stackCenterY = STACK_HEIGHT / 2;
            const ringTop = stackCenterY + centerOffsetPx - RING_HEIGHT / 2;
            const moonthEndExclusive = instantFromEpochMs(
              epochMs(moonthStart) + 28 * 86_400_000,
            );
            return (
              <div
                key={offset}
                className="moonth-ring-slot"
                style={{ top: ringTop, left: 0, width: RING_WIDTH, height: RING_HEIGHT }}
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
