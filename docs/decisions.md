# Architecture Decision Records

Each entry captures *why* a decision was made, what alternatives were
considered, and what would force a revisit. The conclusions live in
[`ARCHITECTURE.md`](../ARCHITECTURE.md); the reasoning lives here.

---

## ADR-001: TypeScript as the implementation language

**Decided**: TypeScript.

**Alternatives considered**: Python, Rust.

**Reasoning**:

- Python wins on astronomy library maturity (skyfield, astropy) but loses
  on type system precision. The wheel interface and pinning-rule algebra
  are shaped exactly like discriminated unions — a TypeScript native
  feature, weaker in Python.
- Rust wins on type system strength and exhaustiveness, but adds friction
  during a design phase where iteration matters more than performance.
  Astronomy crates are sparse.
- TypeScript loses on astronomy: the ecosystem is weaker than Python's,
  and we rely on `astronomy-engine` (a JS port of NOVAS).
- The decisive factor was the stated requirement for UI soon. A two-
  language project (Python core + TS UI) adds complexity before the core
  is even complete. Same language for model, resolver, and UI is the
  simplest path.
- The data model expresses extremely well in TS. The schema *is* the
  spec; the types double as documentation.

**Would force a revisit**: discovering that `astronomy-engine` is
materially less accurate than `skyfield` for a wheel we care about
(plausible for eclipses; check before adding eclipse support). The shim
in `src/astronomy.ts` is the seam — swap or supplement the library
without touching the wheels.

---

## ADR-002: Offline astronomy via bundled library, not a service

**Decided**: `astronomy-engine`, bundled. The planner runs offline.

**Alternatives considered**: external astronomy service (Daff Moon or a
hosted API), per-platform native libraries.

**Reasoning**:

- "Works offline" was a stated requirement for the planner. That rules
  out network calls in the hot path.
- `astronomy-engine` is pure JS, ~150KB, arcminute accuracy for the
  bodies and operations we use. No native dependencies. Same code runs
  in Node, browser, Electron, Tauri, React Native.
- A thin shim in `src/astronomy.ts` isolates the library so the wheels
  don't depend on it directly.

**Would force a revisit**: a wheel that needs accuracy beyond
`astronomy-engine`'s capability (deep-time historical eclipses, very
high-precision planetary positions). At that point the shim accepts a
swap to a heavier library.

---

## ADR-003: Wheel as angle-over-time

**Decided**: Every wheel implements a five-method interface — `id`,
`name`, `kind`, `requiresObserver`, `anchors`, `positionAt(instant,
observer?)`, `nextCrossing(angle, after, observer?)`.

**Alternatives considered**: a richer per-wheel API (e.g. wheel-specific
methods for solar quarters); a thinner functional approach (no
interface, just pairs of functions).

**Reasoning**:

- We stress-tested the abstraction against ten cases from the research:
  solar, lunar phase, lunar mansions, eclipses, Pleiades heliacal,
  Saturn returns, personal-ecological observations, Tzolk'in, the week,
  linear time. The interface holds for all of them except linear time
  (which is correctly modeled as a count, not a wheel).
- Three clarifications emerged from the stress test and are encoded in
  the interface:
  1. A single celestial body can generate multiple wheels (lunar phase
     and lunar sidereal position are separate wheels — same moon,
     different measured angle).
  2. Anchors can be universal (winter solstice) or per-user (your
     Saturn return position). The `Anchor` type has an optional `userId`.
  3. Wheels come in two flavors — predictive (astronomical) and
     observational (ecological). They share the interface; the `kind`
     field discriminates how `nextCrossing` behaves.

**Would force a revisit**: a use case where the abstraction genuinely
breaks. The candidate to watch is personal-ecological wheels: their
`nextCrossing` is genuinely weaker than the predictive wheels'. If the
weakness becomes painful, an `ObservationalWheel` sibling interface may
be needed, with shared base methods.

---

## ADR-004: Seven pinning primitives plus composition

**Decided**: `exact`, `firstAfter`, `nth`, `nearest`, `conjunction`,
`withinRange`, `observed`. Rules compose via `TimeReference`, where any
"after Y" reference can itself be a rule.

**Alternatives considered**: a smaller starting set (just `exact`,
`firstAfter`, `observed`); a much larger set with explicit primitives
for every common pattern; a free-form expression language.

**Reasoning**:

- The seven were derived by stress-testing against patterns from the
  research doc: the eight solar anchors, the four lunar anchors, Hindu
  new year (`firstAfter` composed with `anchor`), harvest moon
  (`nearest`), Paschal full moon (composition of two `firstAfter`),
  solstice-full-moon alignment (`conjunction`), full moon during the
  dark half (`withinRange`), personal-ecological events (`observed`),
  and "the third X after Y" (`nth`).
- Composition is what keeps the primitive set small. Without it we would
  need many more primitives to cover real patterns. With it, the seven
  form an algebra.
- A free-form expression language was rejected as overkill for v1.
  Closed sum types give us exhaustive resolver coverage and clear UI
  affordances.

**Would force a revisit**: a real use case from the user's life that
none of the seven can express even when composed. Theoretical concern
about flexibility is not enough — we need a concrete pattern that fails.

---

## ADR-005: Gregorian as facade only

**Decided**: Gregorian calendar concepts appear only in
`src/gregorian.ts`. The `Instant` type has no date-like API. The rest
of the codebase speaks wheel positions.

**Alternatives considered**: a richer `Instant` type with date methods
(simpler ergonomically); using `Temporal` (the new JS date API) as the
primary time type.

**Reasoning**:

- The foundation document warns explicitly about putting "a traditional
  facade on a modern engine." A `Date` everywhere would invert that —
  modern facade, traditional engine. The discipline of having `Instant`
  carry no date semantics is what enforces the architectural intent at
  the type level.
- `Temporal` is the right tool when you actually want calendar
  semantics. We do not, except at the outermost boundary. Using it as
  the primary type would invite the leak we are trying to prevent.
- The brand type (`number & { [InstantBrand]: true }`) means any attempt
  to use an `Instant` as a regular number is a type error, while the
  runtime representation is just a number for cheap interop.

**Would force a revisit**: discovering that the discipline is causing
real friction in legitimate cases. So far it has not — every "I want
to add days to this instant" turns out to be expressible as a wheel
operation.

---

## ADR-006: No privileged origin

**Decided**: Origins are events with `isOrigin: true`. Any event can be
an origin. The Gregorian count is one origin among many, with no special
status in the model. Counts are computed on demand from
(origin, wheel, instant).

**Alternatives considered**: a single canonical origin (Gregorian) with
others as offsets; an "epoch" concept distinct from regular events.

**Reasoning**:

- The foundation document is unambiguous: "There is no privileged
  origin... origins are themselves events on the torus; 'origin-ness'
  is a tag that can attach to any moment." This is the deepest claim
  of the project; making the Gregorian origin special in code would
  contradict it.
- The demo proves the implementation honors the claim by counting the
  same `Instant` against three different origins.

**Would force a revisit**: nothing reasonable. This one is foundational
to the project's identity.

---

## ADR-007: Events stored as patterns; occurrences computed/stored as needed

**Decided**: `CalendarEvent` stores a `PinningRule`. Future occurrences
are resolved on demand (not persisted). Past occurrences ARE persisted
(in a future storage layer) because they accumulate meaning — notes,
location, what happened that iteration.

**Alternatives considered**: precompute all future occurrences and store
them (simpler queries); store only events, recompute past occurrences
on demand (simpler storage).

**Reasoning**:

- The Eliade frame in the research doc treats each iteration of an event
  as ontologically the same event — but the *participants* and the
  *context* differ. Past iterations therefore carry data that future
  ones do not yet have. Storing past occurrences honors this.
- Future occurrences are infinite (most events recur). Precomputing has
  no clean bound. On-demand resolution is the only model that scales.
- Past occurrences cannot be reliably recomputed because the user's
  observations (`observed` rule) and notes are part of the occurrence,
  not derivable from the rule.

**Would force a revisit**: discovering a performance issue with on-
demand future resolution at scale. Cache layer would address it without
changing the storage model.

---

## ADR-008: Defer persistence, defer UI, ship the core first

**Decided**: v1 is the spec, the wheels, the resolver, the translation
layer. No database, no UI.

**Alternatives considered**: ship everything together; ship UI first
against an in-memory model.

**Reasoning**:

- The core is the load-bearing decision space. Persistence and UI are
  consumers of the core; building them first would have meant making
  schema decisions before the wheel interface was settled.
- The current state is the smallest thing that proves the architecture.
  The tests demonstrate every primitive resolves to real astronomical
  moments. The demo prints them.
- Persistence is a straightforward layer on top of the existing types
  (events, occurrences, origins are already typed). UI is the next big
  piece of design work.

**Would force a revisit**: nothing — this is the v1 scope, by
definition. Subsequent versions add layers.

---

## ADR-009: Multi-user deferred but reserved

**Decided**: v1 is single-user, but `userId` is reserved as an optional
field on events, anchors, and (future) occurrences. Wheels are global
(real astronomy); anchors are global by default but can be per-user;
events and occurrences are user-scoped.

**Alternatives considered**: full multi-user from day one (premature);
no multi-user accommodation in the schema (expensive to retrofit).

**Reasoning**:

- Adding a user dimension to a schema later is invasive surgery. Adding
  the column day one is essentially free.
- Real astronomy is shared, so wheels do not need user scoping. Personal
  anchors and personal events do.

**Would force a revisit**: nothing in v1. When multi-user actually
arrives, an authentication and authorization layer is added; the schema
is already shaped for it.
