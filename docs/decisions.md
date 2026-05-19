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

---

## ADR-010: Observer-dependence in stellar wheels lives outside the core interface

**Decided**: For the Pleiades wheel (and stellar wheels generally), the
wheel's `positionAt` and `nextCrossing` are observer-independent. The
wheel measures a single well-defined astronomical quantity — for Pleiades,
the ecliptic separation between Sun and cluster — and its universal
anchors are the latitude-independent positions on that cycle
(conjunction, acronychal rising). Latitude-dependent events (heliacal
rising and setting) are exposed as **helper functions** that return a
target angle, which callers feed into `nextCrossing` directly.

**Alternatives considered**:

1. Make `Anchor.angle` a function of observer (universal anchors that
   compute their angle from a `Location`). This would push observer
   awareness into the anchor type itself.
2. Move all heliacal logic into the wheel: `positionAt(at, observer)`
   returns a latitude-corrected angle such that fixed anchor positions
   (`heliacal_rising` at 11°, etc.) correspond to real events at any
   observer. Latitude correction lives inside the wheel.
3. Give the wheel a richer constructor: `pleiadesWheelFor(observer)`
   returns a `Wheel` with latitude-baked anchors.

**Reasoning**:

- The Wheel interface is the load-bearing decision in this codebase.
  Pleiades is the first stellar wheel and the first test of whether the
  interface holds for observer-dependent cycles. The honest answer is
  that the interface holds **as written** — no amendment needed — provided
  we are careful about which observer-dependence is the wheel's
  responsibility and which isn't.
- The Sun-Pleiades ecliptic geometry is the same for every observer.
  Putting observer into `positionAt` would be a lie: the angle does not
  actually depend on where you are standing. The cultural significance
  of certain angles (when the cluster is *visible*) does — but visibility
  is a separate concern from position on the wheel.
- Alternative 1 (per-observer anchors) breaks a useful invariant:
  anchors are simple, addressable, identifier-keyed positions. Making
  their angle a function destabilizes the abstraction and complicates
  the resolver, which currently looks up anchors by id and reads
  `.angle` directly.
- Alternative 2 (latitude correction inside `positionAt`) requires a
  piecewise mapping because heliacal rising and acronychal rising depend
  on latitude in completely different ways (heliacal events shift,
  acronychal events don't). Building this into the position function
  would invent a new coordinate system whose semantics are not
  immediately obvious, harming readability and forcing the same trick
  into every future stellar wheel.
- Alternative 3 (per-observer wheel instances) defeats the registry
  model — wheels are supposed to be singletons looked up by id.
- Helpers that return a target angle keep the simple structure intact.
  A user writing a personal anchor for "my heliacal rising of the
  Pleiades" computes the angle once (`heliacalRisingAngle(38)`), stores
  it in their personal anchor record, and references it by id like any
  other anchor.

**What this means in practice**:

- Universal anchors on a wheel are latitude-independent astronomical
  positions only.
- Latitude-dependent events become personal anchors, computed by
  per-wheel helper functions, and stored against the user (multi-user
  scaffolding from ADR-009 already supports this).
- The `requiresObserver` flag on a wheel signals whether the **core
  methods** (`positionAt`, `nextCrossing`) need an observer to compute,
  not whether any of the wheel's culturally meaningful events do. For
  Pleiades, the core methods are pure geometry — `requiresObserver:
  false`. A wheel like "sunrise time at my location" would be `true`.

**Would force a revisit**: a wheel whose core *position quantity*
genuinely depends on the observer in a way that cannot be factored out
— for example, a horizon-altitude wheel for a specific star, where the
angle itself only exists relative to a location. At that point
`positionAt` legitimately needs an observer and `requiresObserver: true`
becomes meaningful at the method level too. The interface already
accepts this — `positionAt(at, observer?)` makes the parameter
available. No code change required, just a wheel that uses it.

---

## ADR-011: Local-first persistence, sync-ready schema, sync engine deferred

**Decided**: v1 persistence is SQLite, single-device, offline-only. The
schema and the `Repository` interface are designed so that a future
sync layer drops in without migration — UUID primary keys, soft deletes
via tombstones, an `updated_at` clock and a `node_id` on every
user-scoped row. The sync engine itself is **not** built in v1.

**Alternatives considered**:

1. Pure local — single-device only, no sync forethought. Smallest
   schema, smallest now-cost, biggest later-cost.
2. Build sync in v1 — CouchDB/PouchDB, Electric SQL, PowerSync,
   Replicache, or a hand-rolled engine. Delivers multi-device on day
   one but front-loads infrastructure decisions before the model has
   been used in anger.
3. Server-authoritative with local cache — Google Calendar pattern.
   Conflicts with the stated offline-first requirement.

**Reasoning**:

- The user wants offline use **and** eventual multi-device sync (the
  "log in and see your stuff anywhere" model). These two requirements
  together name a local-first architecture as the only honest fit —
  server-authoritative caches degrade offline; pure local can't sync.
- Because of ADR-007 (events are patterns, occurrences resolved on
  demand), the *actual persisted data* is tiny: events, past
  occurrences with notes, personal anchors, origins, travel timeline,
  preferences. No dense per-day storage. Sync engines that would be
  overkill for a "real" calendar are tractable here.
- The cost of "sync-ready schema, no sync engine yet" is ~5 extra
  columns per user-scoped table and a discipline rule. The cost of
  retrofitting sync onto a schema that wasn't built for it is invasive
  surgery — `INTEGER AUTOINCREMENT` keys collide across devices, hard
  deletes can't propagate, and there is no way to order concurrent
  writes after the fact.
- Building the sync engine itself in v1 would mean choosing an
  ecosystem (CouchDB? Electric? Postgres + custom?) before we know what
  the UI needs or how often users actually edit from a second device.
  That decision is cheap to defer and expensive to undo.

**The five sync-readiness rules** (enforced at the schema layer):

1. **UUIDs for all primary keys.** Two offline devices can create
   events without coordinating. No autoincrement integers anywhere
   user-scoped. (Astronomy data — wheels, universal anchors — is code,
   not stored, so it does not need UUIDs.)
2. **Tombstones, not hard deletes.** Every user-scoped table carries
   `deleted_at INTEGER` (NULL = live). Deletion sets the column;
   queries filter on `deleted_at IS NULL`. Sync requires this — a row
   that just disappears from one device cannot be told apart from a
   row the device never had.
3. **`updated_at INTEGER` on every user-scoped row.** Epoch
   milliseconds when the row was last written. Sync uses this to
   determine winners under last-write-wins, and to compute "what
   changed since I last synced."
4. **`node_id TEXT` on every user-scoped row.** A UUID minted once per
   device on first launch, stored in a `local_config` table that
   itself is **not** synced. Tie-breaks LWW comparisons that share an
   `updated_at` and identifies the origin device of any change.
5. **`user_id TEXT NOT NULL` on every user-scoped row.** ADR-009
   already reserved this as optional; making it NOT NULL on persisted
   rows is the form that survives sync. v1 hard-codes a single local
   `user_id` in `local_config`; auth maps remote identity → `user_id`
   when sync ships.

**Conflict resolution model**: last-write-wins on
`(updated_at, node_id)`, evaluated per row. For a single-user multi-
device deployment this is honest — there are no genuinely concurrent
edits to reconcile, only stale reads. If we ever go collaborative
(shared calendars across users), we revisit and likely move to a CRDT
or operational-transform model. The schema accommodates either:
the columns we are adding are a strict prefix of what CRDTs need.

**The Repository interface**: storage is hidden behind a single
`Repository` interface so the rest of the codebase imports the interface,
not SQLite. v1 ships a `SqliteRepository`. When sync ships, a
`SyncingRepository` wraps the SQLite one and adds push/pull plus
`changedSince(updatedAt)` and `applyRemoteChanges(changes)` methods —
which the interface already reserves as no-ops in v1.

**Auth model**: deferred. v1 reads `user_id` from `local_config`,
treated as opaque. When sync ships, a thin auth layer (email + magic
link, or OAuth) maps remote identity to `user_id`. Nothing in the data
model changes; only the bootstrap path does.

**Sync engine choice**: explicitly **not** decided here. When the
moment comes, the candidates (in approximate order of complexity) are:

- A hand-rolled REST endpoint with push/pull by `updated_at` and LWW
  — realistic given the data size and single-user model.
- CouchDB / PouchDB — proven multi-master replication, costs an extra
  service.
- Electric SQL or PowerSync — Postgres ↔ SQLite, real-time, both still
  maturing in early 2026.
- A CRDT library (Automerge, Yjs) — only if we go collaborative.

The schema we are committing to here works with any of them.

**Would force a revisit**:

- A real use case for collaborative editing (shared calendars across
  *different* users on the same event). LWW would no longer be
  honest; a CRDT or OT layer becomes the right answer. The columns we
  are adding now do not have to be undone — CRDT metadata extends them.
- Sync turning out to be premature even as scaffolding (user remains
  single-device forever). The columns still cost essentially nothing,
  so the downside is small even in that case.
