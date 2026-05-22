import { westernSignAt } from "../../src/index.js";

/**
 * ZodiacGlyph — renders the Western (sidereal) zodiac symbol for a
 * given sidereal angle. Used on day cards next to the moon-phase
 * glyph: where MoonGlyph shows what the moon *looks like* (synodic
 * phase), this shows where the moon *is* (sidereal sign).
 *
 * The two are visually distinct by form: MoonGlyph is a moon-shape
 * (filled / unfilled disc), this is a Unicode zodiac symbol
 * (♈♉♊♋♌♍♎♏♐♑♒♓). Even when the moon happens to be in the same
 * sign as the card's nominal day-sign, there's no ambiguity about
 * which icon means which.
 */

interface ZodiacGlyphProps {
  /** Sidereal angle in degrees. */
  angle: number;
  /** Pixel font-size of the glyph. */
  size?: number;
  /** Whether to tint the glyph with the sign's traditional color. */
  colorize?: boolean;
}

export function ZodiacGlyph({ angle, size = 18, colorize = true }: ZodiacGlyphProps) {
  const sign = westernSignAt(angle);
  return (
    <span
      className="zodiac-glyph"
      style={{
        fontSize: size,
        lineHeight: 1,
        color: colorize ? sign.colorHex : undefined,
      }}
      title={`Moon in ${sign.name}`}
      aria-label={`Moon in ${sign.name}`}
    >
      {sign.symbol}
    </span>
  );
}
