import { useMemo } from "react";
import {
  epochMs,
  instantFromEpochMs,
  solarWheel,
  toGregorianUTC,
  type Instant,
} from "../../src/index.js";

/**
 * SolarYearTrack — the vertical solar-year axis.
 *
 * Time flows top-to-bottom: past at top, future at bottom. The
 * present moment sits at the vertical center. Solar anchors
 * (equinoxes, solstices, cross-quarters) appear as labeled tick
 * marks at their date positions. The track shows ±6 months of
 * context by default — far enough that several anchors are usually
 * visible, near enough that scale stays legible.
 *
 * Conceptually this is the spine the moonth wheels sit along. As we
 * grow the view to support multiple stacked moonths, each moonth's
 * 28-day range will align with a segment of this track.
 */

const SOLAR_ANCHOR_SHORT: Record<string, string> = {
  spring_equinox: "Spring",
  beltane: "Beltane",
  summer_solstice: "Summer",
  lughnasadh: "Lughnasadh",
  autumn_equinox: "Autumn",
  samhain: "Samhain",
  winter_solstice: "Winter",
  imbolc: "Imbolc",
};

interface SolarYearTrackProps {
  /** Total height in pixels. */
  height: number;
  /** Width in pixels. */
  width?: number;
  /** Days of past/future to include. Default ±183 (~6 months each way). */
  halfRangeDays?: number;
  /** What sits at the vertical center of the track. */
  referenceInstant: Instant;
  /** The actual "now" — used to draw the now-marker at its true position. */
  nowInstant: Instant;
}

interface AnchorMark {
  id: string;
  label: string;
  yFrac: number; // 0 = top, 1 = bottom
  ms: number;
}

export function SolarYearTrack({
  height,
  width = 120,
  halfRangeDays = 183,
  referenceInstant,
  nowInstant,
}: SolarYearTrackProps) {
  const anchors = useMemo(
    () => collectAnchors(referenceInstant, halfRangeDays),
    [referenceInstant, halfRangeDays],
  );

  // Convert ms → y position on the track. Center is at the
  // referenceInstant (= the focused day's instant), so the track
  // follows the user's navigation through time. The "now" marker
  // shifts above or below center to show where today sits relative
  // to the focused day.
  function yFor(ms: number): number {
    const dayMs = 86_400_000;
    const diffDays = (ms - epochMs(referenceInstant)) / dayMs;
    return 0.5 + diffDays / (halfRangeDays * 2);
  }

  // Month labels at first-of-month boundaries inside the window.
  const monthLabels = useMemo(
    () => monthBoundaries(referenceInstant, halfRangeDays),
    [referenceInstant, halfRangeDays],
  );

  const nowYFrac = yFor(epochMs(nowInstant));

  return (
    <div className="solar-year-track" style={{ width, height }}>
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        {/* The spine */}
        <line
          x1={width / 2}
          y1={0}
          x2={width / 2}
          y2={height}
          stroke="#1f232b"
          strokeWidth={1}
        />

        {/* Month boundary ticks (subtle) */}
        {monthLabels.map((m) => {
          const y = yFor(m.ms) * height;
          if (y < 0 || y > height) return null;
          return (
            <g key={`month-${m.ms}`}>
              <line x1={width / 2 - 5} y1={y} x2={width / 2 + 5} y2={y} stroke="#2a2f38" strokeWidth={0.8} />
              <text
                x={width / 2 - 10}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="#5a5f6a"
                fontFamily="ui-monospace, monospace"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Solar anchor marks */}
        {anchors.map((a) => {
          const y = a.yFrac * height;
          if (y < 0 || y > height) return null;
          return (
            <g key={a.id}>
              <line x1={width / 2 - 9} y1={y} x2={width / 2 + 9} y2={y} stroke="#cdd5e0" strokeWidth={1.8} />
              <circle cx={width / 2} cy={y} r={3.5} fill="#cdd5e0" />
              <text
                x={width / 2 + 14}
                y={y + 4}
                textAnchor="start"
                fontSize="12"
                fill="#cdd5e0"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {a.label}
              </text>
            </g>
          );
        })}

        {/* Center marker (= the focused day's instant) — accent-colored. */}
        {(() => {
          const y = height / 2;
          return (
            <g>
              <line
                x1={2} y1={y}
                x2={width - 2} y2={y}
                stroke="#d4a373"
                strokeWidth={1.5}
                strokeDasharray="2 3"
                opacity={0.6}
              />
              <circle cx={width / 2} cy={y} r={5} fill="#d4a373" />
              <circle cx={width / 2} cy={y} r={9} fill="none" stroke="#d4a373" strokeWidth={1} opacity={0.4} />
            </g>
          );
        })()}

        {/* "now" indicator — travels with the actual current moment.
            When the user navigates away, this marker shows them where
            today sits relative to the focused day. */}
        {nowYFrac >= 0 && nowYFrac <= 1 && (() => {
          const y = nowYFrac * height;
          const isAtCenter = Math.abs(nowYFrac - 0.5) < 0.005;
          return (
            <g>
              <line
                x1={width / 2 - 14} y1={y}
                x2={width / 2 + 14} y2={y}
                stroke="#9fc7e8"
                strokeWidth={1.5}
                opacity={isAtCenter ? 0 : 0.9}
              />
              <circle cx={width / 2} cy={y} r={4} fill="#9fc7e8" opacity={isAtCenter ? 0 : 1} />
              <text
                x={width / 2 + 18}
                y={y + 4}
                textAnchor="start"
                fontSize="11"
                fill="#9fc7e8"
                fontFamily="ui-monospace, monospace"
                opacity={isAtCenter ? 0 : 1}
              >
                now
              </text>
            </g>
          );
        })()}

        {/* Captions */}
        <text x={width / 2} y={14} textAnchor="middle" fontSize="10" fill="#5a5f6a">
          past ↑
        </text>
        <text x={width / 2} y={height - 4} textAnchor="middle" fontSize="10" fill="#5a5f6a">
          future ↓
        </text>
      </svg>
    </div>
  );
}

function collectAnchors(referenceInstant: Instant, halfRangeDays: number): AnchorMark[] {
  const dayMs = 86_400_000;
  const referenceMs = epochMs(referenceInstant);
  const startMs = referenceMs - halfRangeDays * dayMs;
  const endMs = referenceMs + halfRangeDays * dayMs;

  const out: AnchorMark[] = [];
  const start = instantFromEpochMs(startMs);

  for (const anchor of solarWheel.anchors) {
    let cursor = start;
    for (let i = 0; i < 3; i++) {
      const next = solarWheel.nextCrossing(anchor.angle, cursor);
      if (next === null) break;
      const ms = epochMs(next);
      if (ms > endMs) break;
      if (ms >= startMs) {
        out.push({
          id: `${anchor.id}-${ms}`,
          label: SOLAR_ANCHOR_SHORT[anchor.id] ?? anchor.name,
          yFrac: 0.5 + (ms - referenceMs) / (halfRangeDays * 2 * dayMs),
          ms,
        });
      }
      cursor = next;
    }
  }
  return out;
}

function monthBoundaries(referenceInstant: Instant, halfRangeDays: number): { ms: number; label: string }[] {
  const dayMs = 86_400_000;
  const referenceMs = epochMs(referenceInstant);
  const startMs = referenceMs - halfRangeDays * dayMs;
  const endMs = referenceMs + halfRangeDays * dayMs;

  const startG = toGregorianUTC(instantFromEpochMs(startMs));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const out: { ms: number; label: string }[] = [];

  let year = startG.year;
  let month = startG.month;
  while (true) {
    const ms = Date.UTC(year, month - 1, 1);
    if (ms > endMs) break;
    if (ms >= startMs) {
      out.push({ ms, label: months[month - 1]! });
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return out;
}
