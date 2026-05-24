/**
 * Zodiac labels and colors — the labeling layer over a sidereal angle.
 *
 * Two simultaneous palettes share the same underlying frame (sidereal,
 * 0° = start of Ashvini / sidereal Aries):
 *
 *   - The Western 12 signs (30° wide each). Familiar to most users.
 *   - The Vedic 27 nakshatras (13°20′ = 360/27 wide each). Finer
 *     granularity; the cross-culturally consistent 27-fold lunar
 *     zodiac (also Chinese xiu, Arabic manazil), all of which track
 *     this same sidereal cycle.
 *
 * Both are labels of the *same* sidereal angle — there is no separate
 * tropical Western frame in this system (ADR-014). The UI picks which
 * label to display where; this module only provides the data.
 *
 * Colors are presentation-layer and live here (not on the wheel) so
 * the wheel stays a pure geometric / astronomical concept.
 */

/* ----- Planets and their colors --------------------------------------- *
 *
 *  The Vedic 9-planet (graha) system: the seven classical bodies plus
 *  Rahu and Ketu (the lunar nodes, treated as planets in Vedic
 *  astrology). The 27 nakshatras cycle through these 9 rulers in the
 *  Vimshottari order (Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter,
 *  Saturn, Mercury) three times, with one ruler per nakshatra.
 * ---------------------------------------------------------------------- */

export type Planet =
  | "sun" | "moon" | "mars" | "mercury" | "jupiter"
  | "venus" | "saturn" | "rahu" | "ketu";

export interface PlanetColor {
  planet: Planet;
  colorKey: string;
  colorHex: string;
}

export const PLANET_COLORS: Record<Planet, PlanetColor> = {
  sun:     { planet: "sun",     colorKey: "copper",            colorHex: "#B87333" },
  moon:    { planet: "moon",    colorKey: "pearl_white",       colorHex: "#EDEAE0" },
  mars:    { planet: "mars",    colorKey: "red",               colorHex: "#D7263D" },
  mercury: { planet: "mercury", colorKey: "green",             colorHex: "#3E8E41" },
  jupiter: { planet: "jupiter", colorKey: "yellow_gold",       colorHex: "#E2A23B" },
  venus:   { planet: "venus",   colorKey: "iridescent",        colorHex: "#EAD8C0" },
  saturn:  { planet: "saturn",  colorKey: "indigo_black",      colorHex: "#1E1E2E" },
  rahu:    { planet: "rahu",    colorKey: "smoke_grey",        colorHex: "#6B6F76" },
  ketu:    { planet: "ketu",    colorKey: "variegated_brown",  colorHex: "#7A5B3E" },
};

/* ----- Western 12 signs (sidereal-aligned) ---------------------------- *
 *
 *  ADR-015: these are referenced to the actual fixed-star constellation
 *  boundaries (Aries starts at 0° sidereal, i.e. at the start of
 *  Ashvini), NOT to the spring equinox the way tropical Western
 *  astrology uses them. The 12 signs are equal 30° slices of the
 *  sidereal ecliptic.
 *
 *  Ruling planets follow the traditional (pre-outer-planet) attribution
 *  — Mars rules Aries and Scorpio, Saturn rules Capricorn and Aquarius,
 *  Jupiter rules Sagittarius and Pisces. This keeps the seven-and-two
 *  Vedic planet set self-contained.
 * ---------------------------------------------------------------------- */

export type Element = "fire" | "earth" | "air" | "water";

export interface WesternSign {
  id: string;
  name: string;
  element: Element;
  rulingPlanet: Planet;
  colorKey: string;
  colorHex: string;
  /** Unicode zodiac symbol (U+2648–U+2653). */
  symbol: string;
  /** Index 0..11; multiply by 30 to get the start angle in degrees. */
  index: number;
}

export const WESTERN_SIGN_WIDTH = 30;

// The trailing "︎" on each `symbol` is the U+FE0E variation
// selector (VS15). It forces TEXT presentation of the zodiac
// codepoints — otherwise macOS/iOS render them as emoji (a colored
// sign on a rounded-square background). We want the line-art glyph.
export const WESTERN_SIGNS: readonly WesternSign[] = [
  { index: 0,  id: "aries",       name: "Aries",       element: "fire",  rulingPlanet: "mars",    colorKey: "red",           colorHex: "#D7263D", symbol: "♈︎" },
  { index: 1,  id: "taurus",      name: "Taurus",      element: "earth", rulingPlanet: "venus",   colorKey: "green",         colorHex: "#3E8E41", symbol: "♉︎" },
  { index: 2,  id: "gemini",      name: "Gemini",      element: "air",   rulingPlanet: "mercury", colorKey: "yellow",        colorHex: "#F2C744", symbol: "♊︎" },
  { index: 3,  id: "cancer",      name: "Cancer",      element: "water", rulingPlanet: "moon",    colorKey: "silver",        colorHex: "#C0C5CE", symbol: "♋︎" },
  { index: 4,  id: "leo",         name: "Leo",         element: "fire",  rulingPlanet: "sun",     colorKey: "gold",          colorHex: "#E2A23B", symbol: "♌︎" },
  { index: 5,  id: "virgo",       name: "Virgo",       element: "earth", rulingPlanet: "mercury", colorKey: "forest_green",  colorHex: "#2E5339", symbol: "♍︎" },
  { index: 6,  id: "libra",       name: "Libra",       element: "air",   rulingPlanet: "venus",   colorKey: "rose",          colorHex: "#D49AAB", symbol: "♎︎" },
  { index: 7,  id: "scorpio",     name: "Scorpio",     element: "water", rulingPlanet: "mars",    colorKey: "deep_red",      colorHex: "#5C0A1E", symbol: "♏︎" },
  { index: 8,  id: "sagittarius", name: "Sagittarius", element: "fire",  rulingPlanet: "jupiter", colorKey: "purple",        colorHex: "#6F2DA8", symbol: "♐︎" },
  { index: 9,  id: "capricorn",   name: "Capricorn",   element: "earth", rulingPlanet: "saturn",  colorKey: "slate",         colorHex: "#3D3D3D", symbol: "♑︎" },
  { index: 10, id: "aquarius",    name: "Aquarius",    element: "air",   rulingPlanet: "saturn",  colorKey: "electric_blue", colorHex: "#1C7ED6", symbol: "♒︎" },
  { index: 11, id: "pisces",      name: "Pisces",      element: "water", rulingPlanet: "jupiter", colorKey: "sea_green",     colorHex: "#2A9D8F", symbol: "♓︎" },
];

/* ----- Nakshatras (27, 13°20′ each) ----------------------------------- *
 *
 *  Vimshottari ruler order, starting at Ashvini (0° sidereal). Each
 *  nakshatra is 360°/27 = 13°20′ wide. Symbols and presiding deities
 *  are the common traditional attributions; rulers cycle through the
 *  nine grahas three times in the Ketu → Venus → Sun → Moon → Mars →
 *  Rahu → Jupiter → Saturn → Mercury order.
 * ---------------------------------------------------------------------- */

export interface Nakshatra {
  /** 0..26. */
  index: number;
  id: string;
  name: string;
  rulingPlanet: Planet;
  symbol: string;
  deity: string;
}

export const NAKSHATRA_COUNT = 27;
export const NAKSHATRA_WIDTH = 360 / NAKSHATRA_COUNT;

export const NAKSHATRAS: readonly Nakshatra[] = [
  { index: 0,  id: "ashvini",            name: "Ashvini",            rulingPlanet: "ketu",    symbol: "horse's head",            deity: "Ashvini Kumaras"        },
  { index: 1,  id: "bharani",            name: "Bharani",            rulingPlanet: "venus",   symbol: "yoni",                    deity: "Yama"                   },
  { index: 2,  id: "krittika",           name: "Krittika",           rulingPlanet: "sun",     symbol: "razor / flame",           deity: "Agni"                   },
  { index: 3,  id: "rohini",             name: "Rohini",             rulingPlanet: "moon",    symbol: "ox-cart",                 deity: "Brahma / Prajapati"     },
  { index: 4,  id: "mrigashira",         name: "Mrigashira",         rulingPlanet: "mars",    symbol: "deer's head",             deity: "Soma"                   },
  { index: 5,  id: "ardra",              name: "Ardra",              rulingPlanet: "rahu",    symbol: "teardrop / diamond",      deity: "Rudra"                  },
  { index: 6,  id: "punarvasu",          name: "Punarvasu",          rulingPlanet: "jupiter", symbol: "quiver of arrows",        deity: "Aditi"                  },
  { index: 7,  id: "pushya",             name: "Pushya",             rulingPlanet: "saturn",  symbol: "cow's udder / flower",    deity: "Brihaspati"             },
  { index: 8,  id: "ashlesha",           name: "Ashlesha",           rulingPlanet: "mercury", symbol: "coiled serpent",          deity: "the Nagas"              },
  { index: 9,  id: "magha",              name: "Magha",              rulingPlanet: "ketu",    symbol: "royal throne",            deity: "the Pitris (ancestors)" },
  { index: 10, id: "purva_phalguni",     name: "Purva Phalguni",     rulingPlanet: "venus",   symbol: "front of a bed",          deity: "Bhaga"                  },
  { index: 11, id: "uttara_phalguni",    name: "Uttara Phalguni",    rulingPlanet: "sun",     symbol: "back of a bed",           deity: "Aryaman"                },
  { index: 12, id: "hasta",              name: "Hasta",              rulingPlanet: "moon",    symbol: "open hand",               deity: "Savitar"                },
  { index: 13, id: "chitra",             name: "Chitra",             rulingPlanet: "mars",    symbol: "bright jewel",            deity: "Tvashtar"               },
  { index: 14, id: "swati",              name: "Swati",              rulingPlanet: "rahu",    symbol: "young shoot in wind",     deity: "Vayu"                   },
  { index: 15, id: "vishakha",           name: "Vishakha",           rulingPlanet: "jupiter", symbol: "triumphal arch",          deity: "Indra-Agni"             },
  { index: 16, id: "anuradha",           name: "Anuradha",           rulingPlanet: "saturn",  symbol: "lotus / staff",           deity: "Mitra"                  },
  { index: 17, id: "jyeshtha",           name: "Jyeshtha",           rulingPlanet: "mercury", symbol: "earring / umbrella",      deity: "Indra"                  },
  { index: 18, id: "mula",               name: "Mula",               rulingPlanet: "ketu",    symbol: "bundle of roots",         deity: "Nirriti"                },
  { index: 19, id: "purva_ashadha",      name: "Purva Ashadha",      rulingPlanet: "venus",   symbol: "fan / winnowing basket",  deity: "Apas"                   },
  { index: 20, id: "uttara_ashadha",     name: "Uttara Ashadha",     rulingPlanet: "sun",     symbol: "elephant tusk",           deity: "the Vishvadevas"        },
  { index: 21, id: "shravana",           name: "Shravana",           rulingPlanet: "moon",    symbol: "ear / three footprints",  deity: "Vishnu"                 },
  { index: 22, id: "dhanishta",          name: "Dhanishta",          rulingPlanet: "mars",    symbol: "drum / flute",            deity: "the eight Vasus"        },
  { index: 23, id: "shatabhisha",        name: "Shatabhisha",        rulingPlanet: "rahu",    symbol: "empty circle",            deity: "Varuna"                 },
  { index: 24, id: "purva_bhadrapada",   name: "Purva Bhadrapada",   rulingPlanet: "jupiter", symbol: "two-faced man / cot",     deity: "Aja Ekapada"            },
  { index: 25, id: "uttara_bhadrapada",  name: "Uttara Bhadrapada",  rulingPlanet: "saturn",  symbol: "back of a funeral cot",   deity: "Ahirbudhnya"            },
  { index: 26, id: "revati",             name: "Revati",             rulingPlanet: "mercury", symbol: "fish",                    deity: "Pushan"                 },
];

/* ----- Lookups -------------------------------------------------------- */

function normalizeDegrees(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/** Which Western sign contains the given sidereal angle. */
export function westernSignAt(angle: number): WesternSign {
  const a = normalizeDegrees(angle);
  const index = Math.floor(a / WESTERN_SIGN_WIDTH);
  // Guard against floating-point edge cases at 360°.
  return WESTERN_SIGNS[Math.min(index, 11)]!;
}

/** Which nakshatra contains the given sidereal angle. */
export function nakshatraAt(angle: number): Nakshatra {
  const a = normalizeDegrees(angle);
  const index = Math.floor(a / NAKSHATRA_WIDTH);
  return NAKSHATRAS[Math.min(index, NAKSHATRA_COUNT - 1)]!;
}

/* ----- The combined label function ----------------------------------- *
 *
 *  The single shape callers should reach for. Given any sidereal angle,
 *  returns both labeling palettes (Western and Vedic) and the color
 *  derived from the nakshatra's ruling planet. The UI decides which
 *  pieces to display where.
 * --------------------------------------------------------------------- */

export interface ZodiacLabels {
  westernSign: WesternSign;
  nakshatra: Nakshatra;
  nakshatraColor: PlanetColor;
}

export function labelsFor(angle: number): ZodiacLabels {
  const ws = westernSignAt(angle);
  const nak = nakshatraAt(angle);
  return {
    westernSign: ws,
    nakshatra: nak,
    nakshatraColor: PLANET_COLORS[nak.rulingPlanet],
  };
}
