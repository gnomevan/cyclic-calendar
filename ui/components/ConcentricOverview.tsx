import { useEffect, useState } from "react";
import {
  epochMs,
  instantFromEpochMs,
  lunarWheel,
  now,
  solarWheel,
  type Instant,
} from "../../src/index.js";

/**
 * ConcentricOverview — the "year + moonth" miniature.
 *
 * Two concentric rings:
 *
 *   - Outer (large, faint): the solar year, with the eight cardinal
 *     anchors marked. A tick at the current solar position.
 *   - Inner (smaller, slightly brighter): the current moonth, framed
 *     as an arc segment of the outer ring at the right angular spot.
 *     Today's position within the moonth is a brighter tick.
 *
 * Lives next to the Orrery. The two together answer "where on the
 * year and where in the moonth" — Orrery answers the same question in
 * actual geometry, this answers it in calendar terms.
 */

const SOLAR_ANCHOR_NAMES: Record<string, string> = {
  spring_equinox: "Spring",
  beltane: "Beltane",
  summer_solstice: "Summer",
  lughnasadh: "Lughnasadh",
  autumn_equinox: "Autumn",
  samhain: "Samhain",
  winter_solstice: "Winter",
  imbolc: "Imbolc",
};

interface ConcentricOverviewProps {
  size?: number;
}

export function ConcentricOverview({ size = 140 }: ConcentricOverviewProps) {
  const [at, setAt] = useState<Instant>(() => now());

  useEffect(() => {
    const id = window.setInterval(() => setAt(now()), 300_000);
    return () => window.clearInterval(id);
  }, []);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.42;
  const innerR = size * 0.22;

  const solarAngle = solarWheel.positionAt(at);
  const lunarAngle = lunarWheel.positionAt(at);

  // The moonth arc starts at the most recent new moon and extends 28 days.
  // We translate the arc onto the *year* ring: each day = ~360/365 degrees
  // on the outer ring. So we need to know where on the solar circle the
  // moonth-start lives, in solar-angle terms.
  const moonthStart = findRecentNewMoon(at);
  const moonthStartSolarAngle = solarWheel.positionAt(moonthStart);
  const dayDegrees = 360 / 365.2422;
  const moonthArcDeg = 28 * dayDegrees;
  const todayPositionInMoonth = (epochMs(at) - epochMs(moonthStart)) / 86_400_000;
  const todaySolarAngle = solarAngle;

  // Outer ring strokes
  const outerCircle = describeArc(cx, cy, outerR, 0, 359.99);

  // Inner ring: an arc segment of the outer ring representing the
  // current moonth on the year. We draw it as a tighter ring inside.
  const moonthArc = describeArc(cx, cy, innerR + (outerR - innerR) * 0.55, moonthStartSolarAngle, moonthStartSolarAngle + moonthArcDeg);

  return (
    <div className="concentric-overview">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Year with current moonth highlighted">
        <title>{`Solar ${solarAngle.toFixed(0)}°, lunar ${lunarAngle.toFixed(0)}°, today is day ${Math.floor(todayPositionInMoonth) + 1} of this moonth`}</title>

        {/* Outer ring — the year */}
        <path d={outerCircle} fill="none" stroke="#2a2f38" strokeWidth={1} />

        {/* Solar anchors on outer ring */}
        {solarWheel.anchors.map((a) => {
          const p = polar(cx, cy, outerR, a.angle);
          return (
            <circle key={a.id} cx={p.x} cy={p.y} r={2} fill="#5a5f6a">
              <title>{SOLAR_ANCHOR_NAMES[a.id] ?? a.name}</title>
            </circle>
          );
        })}

        {/* The moonth arc — projected onto the year ring */}
        <path d={moonthArc} fill="none" stroke="#d4a373" strokeWidth={2.5} strokeLinecap="round" opacity={0.85} />

        {/* Today's position on the year ring */}
        <Tick cx={cx} cy={cy} r={outerR} angle={todaySolarAngle} color="#d4a373" length={8} />

        {/* A small label inside */}
        <text x={cx} y={cy - 2} textAnchor="middle" fontSize="9" fill="#8a8f99">moonth</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize="10" fill="#d4a373" fontFamily="ui-monospace, monospace">
          {Math.floor(todayPositionInMoonth) + 1}/28
        </text>
      </svg>
    </div>
  );
}

function Tick({ cx, cy, r, angle, color, length }: { cx: number; cy: number; r: number; angle: number; color: string; length: number }) {
  const inner = polar(cx, cy, r - length / 2, angle);
  const outer = polar(cx, cy, r + length / 2, angle);
  return <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke={color} strokeWidth={2.5} strokeLinecap="round" />;
}

function polar(cx: number, cy: number, r: number, degreesFromTop: number) {
  const rad = (degreesFromTop * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}

/**
 * Build an SVG arc path between two angles (degrees from top, clockwise).
 * Used for partial-circle strokes.
 */
function describeArc(cx: number, cy: number, r: number, startDeg: number, endDeg: number): string {
  const start = polar(cx, cy, r, startDeg);
  const end = polar(cx, cy, r, endDeg);
  const sweep = endDeg - startDeg;
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

/**
 * Walk the lunar wheel backwards to find the most recent new moon
 * (phase angle 0°). We search the lunar wheel's nextCrossing from a
 * point ~30 days in the past, then accept the latest crossing that is
 * before `now`.
 */
export function findRecentNewMoon(now: Instant): Instant {
  const lookbackMs = 35 * 86_400_000;
  let cursor = instantFromEpochMs(epochMs(now) - lookbackMs);
  let last: Instant = cursor;
  for (let i = 0; i < 3; i++) {
    const next = lunarWheel.nextCrossing(0, cursor);
    if (next === null) break;
    if (epochMs(next) >= epochMs(now)) break;
    last = next;
    cursor = next;
  }
  return last;
}
