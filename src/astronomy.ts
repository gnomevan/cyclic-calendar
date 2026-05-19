/**
 * Thin shim around astronomy-engine to normalize CJS/ESM interop.
 *
 * astronomy-engine is published as CJS. Different runtimes (tsx, vitest,
 * Node ESM) expose it differently — sometimes as a default export, sometimes
 * as a namespace. This module flattens both into a single import surface.
 *
 * If we swap the astronomy library later, this is the only file that
 * changes. The wheels import from here, not from the library directly.
 */

import * as _Astronomy from "astronomy-engine";

// In some runtimes the named exports are on the namespace directly; in
// others they live on `.default`. Prefer namespace, fall back to default.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ns = _Astronomy as any;
const Astronomy = (
  typeof ns.SunPosition === "function" ? ns : ns.default
);

export const SunPosition: (
  date: Date,
) => { elon: number; elat: number } = Astronomy.SunPosition;

export const MoonPhase: (date: Date) => number = Astronomy.MoonPhase;

export const SearchSunLongitude: (
  targetLon: number,
  startDate: Date,
  limitDays: number,
) => { date: Date } | null = Astronomy.SearchSunLongitude;

export const SearchMoonPhase: (
  targetLon: number,
  startDate: Date,
  limitDays: number,
) => { date: Date } | null = Astronomy.SearchMoonPhase;
