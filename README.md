# cyclic

A planning system whose native time is celestial rather than civil. The
core of v1 — schema, two initial wheels, the pinning rule resolver, and the
Gregorian translation layer. No UI yet.

## Run it

```bash
npm install
npm test       # 19 tests covering every pinning rule
npm run demo   # see the system print real astronomical moments
npm run typecheck
```

## What this is

The model decisions from the foundation doc, made concrete in TypeScript.

- **`src/instant.ts`** — `Instant` is a branded `number`. It carries no
  date-like API. You cannot ask an `Instant` what year it is. The only way
  to translate an instant to a calendar concept is through the Gregorian
  layer. This is the discipline that prevents the Gregorian facade from
  leaking back into the core.

- **`src/wheel.ts`** — The `Wheel` interface (angle-over-time, with optional
  observer location) and the seven-primitive pinning rule algebra. Rules
  compose: a `TimeReference` can be an instant, an anchor, *or another
  pinning rule whose resolution becomes the reference*. This is what makes
  patterns like the Paschal full moon expressible without adding new
  primitives.

- **`src/wheels/solar.ts`** — The solar wheel, with eight anchors (four
  quarters + four cross-quarters using Celtic names).

- **`src/wheels/lunar.ts`** — The lunar phase wheel, with four anchors. The
  moon's sidereal position (for nakshatras / xiu / manazil) is a *different*
  wheel that will be added later — one celestial body can generate multiple
  wheels.

- **`src/resolver.ts`** — The engine. It uses only the `Wheel` interface; it
  has no idea which wheels exist. Adding a new wheel never touches this
  file. Adding a new pinning primitive does, but the existing seven cover
  the cases that have come up in the research.

- **`src/events.ts`** — Events (stored patterns), occurrences (specific
  realizations, persisted because they accumulate meaning), and origins
  (events with a flag — no origin is privileged).

- **`src/counts.ts`** — Origin-relative counts. The "Gregorian year number"
  is one such count, taken against the conventional 1 CE origin. It has no
  special status in the model — see the demo for the same instant counted
  against three different origins.

- **`src/gregorian.ts`** — The translation layer. The *only* module in the
  system where Gregorian concepts appear. Two directions: outward (instant
  → Gregorian date for civil interaction) and inward (Gregorian date →
  instant for ingesting dates from outside the system).

- **`src/astronomy.ts`** — Thin shim around `astronomy-engine`. If we swap
  the astronomy library later, this is the only file that changes.

## The pinning rules

Seven primitives plus composition:

| Rule           | Meaning                                                 |
|----------------|---------------------------------------------------------|
| `exact`        | Precisely when this anchor next occurs                  |
| `firstAfter`   | The first occurrence of X after Y                       |
| `nth`          | The Nth occurrence of X after Y                         |
| `nearest`      | The occurrence of X nearest in time to Y (with tolerance) |
| `conjunction`  | Multiple anchors aligned within a tolerance window      |
| `withinRange`  | An occurrence of X falling between anchors A and B      |
| `observed`     | The event happens when the user logs it                 |

All "after Y" references can themselves be rules — composition is how more
complex patterns are expressed. See the `composition` test and the Paschal
full moon line in the demo for working examples.

## What is deliberately not here yet

The foundation doc lists everything deferred. The architecture is shaped
so each can be added without rebuilding the core:

- Lunar mansions (a second lunar wheel, sidereal rather than synodic)
- Sidereal zodiac
- Eclipse wheels (location-aware)
- Pleiades and other stellar wheels
- Personal-ecological wheels (observational)
- Planetary cycles (Saturn returns etc.)
- Per-user personal anchors (the schema reserves space for them on the
  `Anchor` type via the optional `userId` field; lookup support is left
  for when a real user model arrives)
- Persistence (events are types right now, not rows; storage is the next
  layer up)
- UI

The wheel interface is the load-bearing decision. Every deferred extension
implements it. The resolver is agnostic to which wheels exist.
