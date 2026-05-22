// Core time primitive
export type { Instant } from "./instant.js";
export {
  now,
  plusSeconds,
  compareInstants,
  instantFromEpochMs,
  epochMs,
  instantToDate,
  dateToInstant,
} from "./instant.js";

// Wheels, anchors, pinning rules
export type {
  Angle,
  Location,
  Anchor,
  Wheel,
  WheelKind,
  AnchorRef,
  TimeReference,
  PinningRule,
} from "./wheel.js";
export { normalizeAngle, angleDelta } from "./wheel.js";

// Events, occurrences, origins, counts
export type {
  CalendarEvent,
  Occurrence,
  Origin,
  Count,
} from "./events.js";

// Resolver
export type {
  WheelRegistry,
  ResolveContext,
  ResolvedOccurrence,
} from "./resolver.js";
export { SimpleWheelRegistry, resolve } from "./resolver.js";

// Counts
export { countCycles, solarYearsSinceOrigin } from "./counts.js";

// Gregorian translation layer — outward and inward only
export type { GregorianDate } from "./gregorian.js";
export {
  toGregorianUTC,
  toGregorianInZone,
  fromGregorianUTC,
  toISOString,
  fromISOString,
} from "./gregorian.js";

// Initial wheels
export { solarWheel, SOLAR_ANCHORS } from "./wheels/solar.js";
export { lunarWheel, LUNAR_ANCHORS } from "./wheels/lunar.js";
export {
  pleiadesWheel,
  PLEIADES_ANCHORS,
  PLEIADES_ECLIPTIC_LON_J2000,
  heliacalRisingAngle,
  heliacalSettingAngle,
} from "./wheels/pleiades.js";
export {
  lunarSiderealWheel,
  LUNAR_SIDEREAL_ANCHORS,
  NAKSHATRA_WIDTH,
  ayanamsa,
} from "./wheels/lunar_sidereal.js";

// Serialization (boundary between trusted PinningRule values and untrusted JSON)
export {
  serializePinningRule,
  deserializePinningRule,
  validatePinningRule,
  SerializationError,
} from "./serialize.js";

// Persistence — interface only. The concrete SqliteRepository lives in
// `./sqlite.js` and must be imported from there directly. It depends on
// `better-sqlite3`, a Node native module, and pulling it through this
// barrel would poison browser bundles. Keep this entry point browser-safe.
export type {
  Repository,
  PersonalAnchor,
  TravelEntry,
  ChangeSet,
  SyncRecord,
} from "./repository.js";
export { CONFIG_KEYS, NotImplementedError, newId } from "./repository.js";
