/**
 * MoonGlyph — draws the Moon at a given phase angle.
 *
 * The phase angle is the same quantity the lunar wheel reports: the
 * elongation between Sun and Moon, mod 360°. Conventions:
 *
 *   0°   = new moon       (fully dark)
 *   90°  = first quarter  (right half lit, in the northern hemisphere)
 *   180° = full moon      (fully lit)
 *   270° = last quarter   (left half lit)
 *
 * The lit fraction is `(1 − cos(angle)) / 2`. We render a disc and a
 * shadow path drawn as a half-disc (the terminator side) plus an
 * ellipse whose width and direction depend on the phase. The math is
 * the same as the classic moon-phase SVG trick — half the disc is
 * always one half-disc, and the *other* half is the projection of the
 * terminator as an ellipse whose minor axis is `|cos(angle)|` of the
 * radius.
 *
 * Northern-hemisphere convention is hard-coded. A southern observer
 * would see the lit side mirrored — a future polish item if needed.
 */

interface MoonGlyphProps {
  /** Phase angle in degrees, mod 360. */
  angle: number;
  /** Pixel size of the glyph. Default 24. */
  size?: number;
  /** Color of the lit portion. */
  lit?: string;
  /** Color of the dark portion. */
  dark?: string;
  /** Stroke around the disc, for legibility on busy backgrounds. */
  ring?: string;
}

export function MoonGlyph({
  angle,
  size = 24,
  lit = "#e6e6e6",
  dark = "#0f1115",
  ring = "#2a2f38",
}: MoonGlyphProps) {
  const r = size / 2 - 1;
  const cx = size / 2;
  const cy = size / 2;

  // Normalize to [0, 360)
  const a = ((angle % 360) + 360) % 360;

  // Lit fraction: 0 at new, 1 at full, mirrored on the way back.
  // The terminator is an ellipse whose horizontal radius rx = |cos(a)| * r.
  const rx = Math.abs(Math.cos((a * Math.PI) / 180)) * r;

  // Which half is fully lit depends on which side of full/new we are.
  // Waxing (0..180): right half is the "leading" side.
  // Waning (180..360): left half is the "leading" side.
  // The terminator ellipse arcs either toward the lit side or the dark side.
  const waxing = a < 180;

  // Build the shadow path. We start at the top of the disc, sweep a
  // half-circle down to the bottom (the static half-shadow), then come
  // back up via an ellipse (the terminator).
  //
  //   - Waxing, less than half lit (0..90):    shadow = right half + ellipse from inside (right side dark)
  //   - Waxing, more than half lit (90..180):  shadow = left half + ellipse from inside
  //   - Waning, more than half lit (180..270): shadow = right half + ellipse from inside (left side dark)
  //   - Waning, less than half lit (270..360): shadow = left half + ellipse from inside
  //
  // Cleaner formulation: the dark side is on the right when (a >= 180 && a < 360),
  // i.e. waning. Wait — that's wrong. Let me think again.
  //
  // Northern hemisphere: as the moon waxes, the lit side grows from
  // the right. So when waxing and lit < half (0..90), the dark side
  // is on the LEFT. When waxing and lit > half (90..180), the dark
  // side is on the LEFT but only as a thin sliver. When waning
  // (180..360), the lit side is on the LEFT, so the dark side is on
  // the RIGHT.
  //
  // So:
  //   - waxing  → dark side is LEFT  (right has full disc visible)
  //   - waning  → dark side is RIGHT (left has full disc visible)
  //
  // The terminator ellipse:
  //   - 0..90:    less than half lit; terminator bulges INTO the lit (right) side
  //   - 90..180:  more than half lit; terminator bulges INTO the dark (left) side
  //   - 180..270: more than half lit (lit on left); terminator bulges INTO the dark (right) side
  //   - 270..360: less than half lit (lit on left); terminator bulges INTO the lit (left) side
  //
  // The "bulge direction" is which way the ellipse's flat side faces.

  const shadowPath = buildShadowPath({
    cx,
    cy,
    r,
    rx,
    waxing,
    moreThanHalfLit: (a > 90 && a < 270),
  });

  const phaseLabel = describePhase(a);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={phaseLabel}>
      <title>{phaseLabel}</title>
      <circle cx={cx} cy={cy} r={r} fill={lit} stroke={ring} strokeWidth={0.5} />
      <path d={shadowPath} fill={dark} />
    </svg>
  );
}

interface ShadowPathArgs {
  cx: number;
  cy: number;
  r: number;
  rx: number;
  waxing: boolean;
  moreThanHalfLit: boolean;
}

function buildShadowPath({ cx, cy, r, rx, waxing, moreThanHalfLit }: ShadowPathArgs): string {
  // We always traverse from top point to bottom point of the disc.
  const top = `${cx} ${cy - r}`;
  const bottom = `${cx} ${cy + r}`;

  // The half-disc arc.
  // - When waxing (dark side LEFT), the half-disc is the LEFT half:
  //   arc sweep going counterclockwise from top to bottom along the left edge.
  // - When waning (dark side RIGHT), the half-disc is the RIGHT half:
  //   arc going clockwise from top to bottom along the right edge.
  // In SVG arc params: A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  const halfDisc = waxing
    ? `A ${r} ${r} 0 0 0 ${bottom}` // counterclockwise (left half)
    : `A ${r} ${r} 0 0 1 ${bottom}`; // clockwise (right half)

  // The terminator ellipse, drawn back from bottom to top, with the
  // appropriate sweep based on whether it bulges into the lit or dark side.
  //
  // When (waxing && !moreThanHalfLit) — early waxing — terminator bulges
  // into the right (lit) side, so going from bottom→top, the arc should
  // be on the right side of the chord, sweep-flag = 1 (clockwise).
  //
  // When (waxing && moreThanHalfLit) — late waxing — terminator bulges
  // into the left (dark) side, so going from bottom→top, the arc is on
  // the left, sweep-flag = 0.
  //
  // Symmetric for waning.
  let sweep: 0 | 1;
  if (waxing) {
    sweep = moreThanHalfLit ? 0 : 1;
  } else {
    sweep = moreThanHalfLit ? 1 : 0;
  }

  const terminator = `A ${rx} ${r} 0 0 ${sweep} ${top}`;

  return `M ${top} ${halfDisc} ${terminator} Z`;
}

function describePhase(angle: number): string {
  if (angle < 11.25 || angle >= 348.75) return "New Moon";
  if (angle < 78.75) return "Waxing Crescent";
  if (angle < 101.25) return "First Quarter";
  if (angle < 168.75) return "Waxing Gibbous";
  if (angle < 191.25) return "Full Moon";
  if (angle < 258.75) return "Waning Gibbous";
  if (angle < 281.25) return "Last Quarter";
  return "Waning Crescent";
}

export function phaseName(angle: number): string {
  return describePhase(((angle % 360) + 360) % 360);
}
