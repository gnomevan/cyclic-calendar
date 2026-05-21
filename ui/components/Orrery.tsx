import { useEffect, useState } from "react";
import {
  lunarWheel,
  now,
  solarWheel,
  type Instant,
} from "../../src/index.js";
import { phaseName } from "./MoonGlyph.js";

/**
 * Orrery — the geometry of *right now*.
 *
 * Sun fixed at center. Earth on its (circular for clarity) orbit,
 * positioned at the solar wheel's current angle. Moon orbits Earth at
 * a much smaller radius, positioned at the lunar wheel's current phase
 * angle and drawn with its lit hemisphere facing the Sun — so the
 * geometry of phases is visible in the diagram itself.
 *
 * Sized to live in a corner of the page, always-on. The smallest
 * possible answer to "where are we right now in all the cycles" —
 * a glance gives both rotations at once.
 */

interface OrreryProps {
  size?: number;
}

export function Orrery({ size = 140 }: OrreryProps) {
  const [at, setAt] = useState<Instant>(() => now());

  useEffect(() => {
    // Refresh every five minutes — Earth moves ~1°/day, Moon ~12°/day;
    // finer than this is invisible at this scale.
    const id = window.setInterval(() => setAt(now()), 300_000);
    return () => window.clearInterval(id);
  }, []);

  const solarAngle = solarWheel.positionAt(at);
  const lunarAngle = lunarWheel.positionAt(at);

  const cx = size / 2;
  const cy = size / 2;
  const earthOrbitR = size * 0.34;
  const moonOrbitR = size * 0.12;
  const sunR = size * 0.06;
  const earthR = size * 0.025;
  const moonR = size * 0.05;

  // Earth's heliocentric position. Solar wheel = sun's ecliptic
  // longitude as seen from Earth, so Earth is opposite from the Sun in
  // the heliocentric frame: earth's angle around sun = solarAngle + 180°.
  const earthAngle = solarAngle + 180;
  const earth = polar(cx, cy, earthOrbitR, earthAngle);

  // Moon's position around Earth. Phase angle = elongation. At phase 0
  // (new), moon sits between earth and sun. At 180 (full), opposite.
  // So moon's angle around earth, measured from "toward the sun", is
  // (lunarAngle). In our coordinate system (degrees-from-top of the
  // overall diagram), the "toward the sun" direction at earth is
  // (earthAngle + 180), i.e. back toward sun. So:
  const sunFromEarthAngle = earthAngle + 180;
  const moonAngle = sunFromEarthAngle + lunarAngle;
  const moon = polar(earth.x, earth.y, moonOrbitR, moonAngle);

  return (
    <div className="orrery">
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Sun-Earth-Moon geometry now">
        <title>{`Earth at solar longitude ${earthAngle.toFixed(0)}°, ${phaseName(lunarAngle)}`}</title>

        {/* Earth's orbit */}
        <circle cx={cx} cy={cy} r={earthOrbitR} fill="none" stroke="#2a2f38" strokeWidth={0.5} strokeDasharray="2 3" />

        {/* Moon's orbit (small, around Earth) */}
        <circle cx={earth.x} cy={earth.y} r={moonOrbitR} fill="none" stroke="#2a2f38" strokeWidth={0.5} strokeDasharray="1 2" />

        {/* Sun */}
        <circle cx={cx} cy={cy} r={sunR} fill="#f4a261" />
        <g opacity={0.4}>
          {Array.from({ length: 8 }, (_, i) => i * 45).map((deg) => {
            const a = polar(cx, cy, sunR + 2, deg);
            const b = polar(cx, cy, sunR + 5, deg);
            return <line key={deg} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="#f4a261" strokeWidth={0.6} />;
          })}
        </g>

        {/* Earth */}
        <circle cx={earth.x} cy={earth.y} r={earthR} fill="#82a6cd" />

        {/* Moon — phase-aware glyph, drawn in place */}
        <MoonOnSVG cx={moon.x} cy={moon.y} r={moonR} angle={lunarAngle} />
      </svg>
    </div>
  );
}

/**
 * Inline moon drawing that lives inside a parent <svg>. Same math as
 * `MoonGlyph` but emits raw <circle>/<path> rather than its own <svg>.
 */
function MoonOnSVG({ cx, cy, r, angle }: { cx: number; cy: number; r: number; angle: number }) {
  const a = ((angle % 360) + 360) % 360;
  const rx = Math.abs(Math.cos((a * Math.PI) / 180)) * r;
  const waxing = a < 180;
  const moreThanHalfLit = a > 90 && a < 270;

  const topX = cx;
  const topY = cy - r;
  const bottomX = cx;
  const bottomY = cy + r;

  const halfDisc = waxing
    ? `A ${r} ${r} 0 0 0 ${bottomX} ${bottomY}`
    : `A ${r} ${r} 0 0 1 ${bottomX} ${bottomY}`;

  const sweep: 0 | 1 = waxing ? (moreThanHalfLit ? 0 : 1) : moreThanHalfLit ? 1 : 0;
  const terminator = `A ${rx} ${r} 0 0 ${sweep} ${topX} ${topY}`;
  const shadowPath = `M ${topX} ${topY} ${halfDisc} ${terminator} Z`;

  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#e6e6e6" stroke="#2a2f38" strokeWidth={0.5} />
      <path d={shadowPath} fill="#0f1115" />
    </g>
  );
}

function polar(cx: number, cy: number, r: number, degreesFromTop: number) {
  const rad = (degreesFromTop * Math.PI) / 180;
  return { x: cx + r * Math.sin(rad), y: cy - r * Math.cos(rad) };
}
