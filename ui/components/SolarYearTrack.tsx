import { useMemo, type CSSProperties } from "react";
import {
  WESTERN_SIGNS,
  ayanamsa,
  epochMs,
  instantFromEpochMs,
  normalizeAngle,
  solarWheel,
  toGregorianUTC,
  type Instant,
  type WesternSign,
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

// Solar anchor labels. The cross-quarters keep their traditional
// names; equinoxes/solstices spell out the season + event type so
// the marker is clear ("Summer Solstice", not just "Summer").
const SOLAR_ANCHOR_SHORT: Record<string, string> = {
  spring_equinox: "Spring Equinox",
  beltane: "Beltane",
  summer_solstice: "Summer Solstice",
  lughnasadh: "Lughnasadh",
  autumn_equinox: "Autumn Equinox",
  samhain: "Samhain",
  winter_solstice: "Winter Solstice",
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

  const zodiacSpans = useMemo(
    () => collectZodiacSpans(referenceInstant, halfRangeDays),
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
        {/* The spine — translucent amber line that matches the helix
            cards and doesn't extend past either end of the wheel. */}
        <line
          x1={width / 2}
          y1={0}
          x2={width / 2}
          y2={height}
          stroke="rgba(160, 110, 60, 0.35)"
          strokeWidth={1}
        />

        {/* Month boundary ticks (subtle) */}
        {monthLabels.map((m) => {
          const y = yFor(m.ms) * height;
          if (y < 0 || y > height) return null;
          return (
            <g key={`month-${m.ms}`}>
              <line
                x1={width / 2 - 5} y1={y}
                x2={width / 2 + 5} y2={y}
                stroke="rgba(160, 110, 60, 0.2)"
                strokeWidth={0.8}
              />
              <text
                x={width / 2 - 10}
                y={y + 3}
                textAnchor="end"
                fontSize="10"
                fill="rgba(200, 152, 104, 0.55)"
                fontFamily="ui-monospace, monospace"
              >
                {m.label}
              </text>
            </g>
          );
        })}

        {/* Solar anchor marks (8 Celtic cross-quarters) */}
        {anchors.map((a) => {
          const y = a.yFrac * height;
          if (y < 0 || y > height) return null;
          return (
            <g key={a.id}>
              <line x1={width / 2 - 9} y1={y} x2={width / 2 + 9} y2={y} stroke="#c89868" strokeWidth={1.8} />
              <circle cx={width / 2} cy={y} r={3.5} fill="#c89868" />
              <text
                x={width / 2 + 14}
                y={y + 4}
                textAnchor="start"
                fontSize="12"
                fill="#c89868"
                fontFamily="ui-sans-serif, system-ui, sans-serif"
              >
                {a.label}
              </text>
            </g>
          );
        })}

        {/* Zodiac SPANS — vertical bars showing how long the sun is in
            each sidereal sign. The symbol sits at the midpoint of the
            span. Colored by the sign's traditional palette. */}
        {zodiacSpans.map((z) => {
          const yStartRaw = z.startYFrac * height;
          const yEndRaw = z.endYFrac * height;
          // Clip to the visible track region.
          const yStart = Math.max(0, yStartRaw);
          const yEnd = Math.min(height, yEndRaw);
          if (yEnd <= 0 || yStart >= height) return null;
          const yMid = (yStart + yEnd) / 2;
          return (
            <g key={z.id}>
              <line
                x1={width / 2 - 6} y1={yStart}
                x2={width / 2 - 6} y2={yEnd}
                stroke={z.sign.colorHex}
                strokeWidth={2}
                opacity={0.7}
              />
              <text
                x={width / 2 - 14}
                y={yMid + 5}
                textAnchor="end"
                fontSize="14"
                fill={z.sign.colorHex}
                fontFamily='"Times New Roman", "Cambria Math", "Symbola", ui-serif, serif'
                style={{ fontVariantEmoji: "text" } as CSSProperties}
              >
                <title>{`Sun in ${z.sign.name}`}</title>
                {z.sign.symbol}
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
        <text
          x={width / 2} y={14}
          textAnchor="middle" fontSize="10"
          fill="rgba(200, 152, 104, 0.55)"
        >
          past ↑
        </text>
        <text
          x={width / 2} y={height - 4}
          textAnchor="middle" fontSize="10"
          fill="rgba(200, 152, 104, 0.55)"
        >
          future ↓
        </text>
      </svg>
    </div>
  );
}

interface ZodiacSpan {
  id: string;
  sign: WesternSign;
  /** Sun-enters-sign moment. */
  startMs: number;
  /** Sun-enters-next-sign moment (= this span's end). */
  endMs: number;
  /** Vertical fractions on the track for start / midpoint / end. */
  startYFrac: number;
  endYFrac: number;
}

/**
 * The sun-in-sign SPANS that cover any part of the visible window.
 * For each visible sign, the span runs from the moment the sun enters
 * it (sidereal longitude reaches that 30° boundary) to the moment the
 * sun enters the next sign. The vertical bar shows the duration; the
 * symbol is placed at the midpoint.
 *
 * Sidereal longitude = tropical longitude − ayanamsa, so "sun enters
 * Aries (sidereal)" is when tropical longitude crosses (0° + ayanamsa).
 */
function collectZodiacSpans(
  referenceInstant: Instant,
  halfRangeDays: number,
): ZodiacSpan[] {
  const dayMs = 86_400_000;
  const referenceMs = epochMs(referenceInstant);
  const startMs = referenceMs - halfRangeDays * dayMs;
  const endMs = referenceMs + halfRangeDays * dayMs;
  const ay = ayanamsa(referenceInstant);

  // Find all sun-enters-sign moments within ±1 year of reference.
  // 12-13 entries per year per sign; we sort them chronologically to
  // pair each with the NEXT in time (= the next sign starting).
  const entries: { sign: WesternSign; ms: number }[] = [];
  const searchFrom = instantFromEpochMs(referenceMs - 380 * dayMs);
  for (const sign of WESTERN_SIGNS) {
    const tropicalTarget = normalizeAngle(sign.index * 30 + ay);
    let cursor = searchFrom;
    for (let i = 0; i < 2; i++) {
      const hit = solarWheel.nextCrossing(tropicalTarget, cursor);
      if (!hit) break;
      const ms = epochMs(hit);
      if (ms > referenceMs + 380 * dayMs) break;
      entries.push({ sign, ms });
      cursor = instantFromEpochMs(ms + 60_000);
    }
  }
  entries.sort((a, b) => a.ms - b.ms);

  // Pair each entry with the next chronological one. The duration
  // between them = the span this sign occupies on the track.
  const spans: ZodiacSpan[] = [];
  for (let i = 0; i < entries.length - 1; i++) {
    const start = entries[i]!;
    const next = entries[i + 1]!;
    // Skip spans entirely outside the visible window.
    if (next.ms < startMs || start.ms > endMs) continue;
    spans.push({
      id: `${start.sign.id}-${start.ms}`,
      sign: start.sign,
      startMs: start.ms,
      endMs: next.ms,
      startYFrac: 0.5 + (start.ms - referenceMs) / (halfRangeDays * 2 * dayMs),
      endYFrac: 0.5 + (next.ms - referenceMs) / (halfRangeDays * 2 * dayMs),
    });
  }
  return spans;
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
