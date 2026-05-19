# Next Steps

The order, in increasing scope. Each step's purpose is to validate or
build on the previous; do not skip.

---

## Step 1: Add the Pleiades wheel

**Why this first**: The wheel interface is the load-bearing decision in
the entire architecture. Two wheels (solar and lunar, both ecliptic-
based, both location-independent) is not enough to validate it.
Pleiades is the next case from the research because:

- It is location-aware (requires observer latitude — exercises
  `requiresObserver: true` and `observer?: Location`)
- It is a stellar wheel, not a solar/lunar one (different angle
  computation — exercises that the interface is genuinely general)
- The research doc found it to be the most universal cross-cultural
  stellar anchor

**What it tests**: whether the `Wheel` interface needs amendment for
real third-party wheels, before persistence and UI get poured on top.

**Implementation sketch**:

The wheel's angle should be something computable that cycles annually
with the Pleiades' visibility. Two candidates:

1. **Angular separation between the Pleiades and the Sun** along the
   ecliptic. This cycles annually as Earth orbits. Heliacal rising
   happens at a specific separation value (modulated slightly by
   latitude). `astronomy-engine` can compute the ecliptic position of
   any star given its J2000 coordinates.

2. **Altitude of the Pleiades at a specific local time** (e.g. astronomical
   midnight). This is more directly visibility-related but introduces
   diurnal rotation, which is a different kind of cycle.

Option 1 is cleaner — same wheel cycle as solar (one year), just a
different angle measured. Anchors would be:

- Heliacal rising (~separation 11° from sun)
- Acronychal rising (rises at sunset, separation 180°)
- Heliacal setting (last visible before invisibility, separation ~-11°)
- Zenith at midnight (if relevant for the user's latitude)

Latitude affects exact angle values, so the anchor's `angle` may need to
be computed per-observer rather than fixed. This is the architecture
question worth resolving: does `Anchor.angle` become a function of
observer? Or does the wheel's `positionAt` already absorb the latitude
correction so that anchors stay fixed-angle?

**The architecture decision Pleiades forces**: predictive wheels with
observer-dependent anchors. Resolving this is the actual value of doing
this step before the easier ones.

**Acceptance criteria**:

- `src/wheels/pleiades.ts` exists and implements `Wheel`
- A test verifies the wheel reports a position at the current instant
- A test verifies the wheel finds the next heliacal rising for at least
  one specific latitude (say, 38°N, the project owner's reported area)
- The resolver runs `exact`, `firstAfter`, `nearest`, and `conjunction`
  rules against the Pleiades wheel without modification
- If the interface needed amendment, ADR-010 is added to
  `docs/decisions.md` documenting why and what changed

---

## Step 2: Persistence (local-first, sync-ready)

**Why second**: only after we are confident the wheel interface is
right.

**Approach**: SQLite (offline requirement). Use `better-sqlite3` or
similar synchronous library — async storage adds complexity not needed
for a single-user planner. v1 is **single-device, offline-only**. The
schema is designed so that a future sync layer drops in without
migration; see [ADR-011](docs/decisions.md) for the reasoning. The
sync engine itself is **not** built in this step.

**The five sync-readiness rules** (from ADR-011, enforced at the
schema):

1. **UUIDs for all primary keys** on user-scoped tables. No
   autoincrement integers — two offline devices must be able to
   create rows without coordinating.
2. **Tombstones, not hard deletes**: every user-scoped table carries
   `deleted_at INTEGER` (NULL = live). All queries filter on
   `deleted_at IS NULL`.
3. **`updated_at INTEGER NOT NULL`** on every user-scoped row (epoch
   milliseconds).
4. **`node_id TEXT NOT NULL`** on every user-scoped row — a device
   UUID, minted once on first launch and stored in `local_config`.
5. **`user_id TEXT NOT NULL`** on every user-scoped row. v1 hard-codes
   a single local user; auth maps to this when sync ships.

**Schema**:

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,                      -- UUID
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  rule_json TEXT NOT NULL,                  -- serialized PinningRule
  is_origin INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,              -- epoch ms
  updated_at INTEGER NOT NULL,              -- epoch ms, sync clock
  deleted_at INTEGER,                       -- NULL = live
  node_id TEXT NOT NULL                     -- device that last wrote
);
CREATE INDEX events_user_live ON events(user_id) WHERE deleted_at IS NULL;
CREATE INDEX events_updated_at ON events(updated_at);

CREATE TABLE occurrences (
  id TEXT PRIMARY KEY,                      -- UUID
  event_id TEXT NOT NULL,
  at INTEGER NOT NULL,                      -- Instant (epoch ms)
  location_lat REAL,
  location_lon REAL,
  notes TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  node_id TEXT NOT NULL,
  UNIQUE (event_id, at),                    -- one occurrence per event per instant
  FOREIGN KEY (event_id) REFERENCES events(id)
);
CREATE INDEX occurrences_event_live ON occurrences(event_id) WHERE deleted_at IS NULL;
CREATE INDEX occurrences_updated_at ON occurrences(updated_at);

CREATE TABLE personal_anchors (
  id TEXT PRIMARY KEY,                      -- UUID
  user_id TEXT NOT NULL,
  wheel_id TEXT NOT NULL,
  angle REAL NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  node_id TEXT NOT NULL
);
CREATE INDEX personal_anchors_user_live ON personal_anchors(user_id) WHERE deleted_at IS NULL;
CREATE INDEX personal_anchors_updated_at ON personal_anchors(updated_at);

CREATE TABLE travel_timeline (
  id TEXT PRIMARY KEY,                      -- UUID
  user_id TEXT NOT NULL,
  from_instant INTEGER NOT NULL,
  to_instant INTEGER,                       -- NULL = "still there"
  location_lat REAL NOT NULL,
  location_lon REAL NOT NULL,
  label TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  node_id TEXT NOT NULL
);
CREATE INDEX travel_user_from ON travel_timeline(user_id, from_instant) WHERE deleted_at IS NULL;
CREATE INDEX travel_updated_at ON travel_timeline(updated_at);

-- Device-local config. NEVER syncs. Seeded on first launch.
CREATE TABLE local_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
-- Required keys at first launch:
--   node_id  — UUID for this device
--   user_id  — single local user for v1 (opaque)
--   schema_version — for the migration system

-- Migrations table.
CREATE TABLE migrations (
  version INTEGER PRIMARY KEY,
  applied_at INTEGER NOT NULL
);
```

**Why a separate `id` on `occurrences` instead of the composite
`(event_id, at)` key**: each occurrence becomes a discrete syncable
row with its own tombstone. Composite primary keys complicate
soft-delete semantics and conflict resolution; a UUID id plus a
`UNIQUE (event_id, at)` constraint preserves the invariant without
those complications.

**`PinningRule` serialization** is JSON — the discriminated union
maps cleanly. Deserialization must validate the structure (reject
unknown `kind` values, type-check fields per branch).

**`Wheel` is NOT stored** — wheels are code. The registry is built at
startup from the available wheel modules. Personal anchors *are*
stored (they reference a wheel by id but live in the database).

**Conflict resolution** (for the future sync layer, recorded now so
the schema commitment is honest): last-write-wins on
`(updated_at, node_id)`, evaluated per row. Single-user multi-device
has no genuinely concurrent edits, only stale reads — LWW is correct
for that. Going collaborative across users would mean revisiting; the
columns we are adding are a strict prefix of what CRDTs need.

**The `Repository` interface** hides storage so the rest of the
codebase imports the interface, not SQLite:

```typescript
export interface Repository {
  // Events
  saveEvent(e: CalendarEvent): void;
  getEvent(id: string): CalendarEvent | null;
  listEvents(userId: string): CalendarEvent[];
  softDeleteEvent(id: string): void;

  // Occurrences
  saveOccurrence(o: Occurrence): void;
  listOccurrencesForEvent(eventId: string): Occurrence[];
  softDeleteOccurrence(id: string): void;

  // Personal anchors
  savePersonalAnchor(a: PersonalAnchor): void;
  listPersonalAnchors(userId: string): PersonalAnchor[];
  softDeletePersonalAnchor(id: string): void;

  // Travel timeline
  saveTravelEntry(t: TravelEntry): void;
  listTravelTimeline(userId: string): TravelEntry[];
  softDeleteTravelEntry(id: string): void;

  // Local config (never syncs)
  getConfig(key: string): string | null;
  setConfig(key: string, value: string): void;

  // Reserved for the future sync layer. v1 may throw "not implemented".
  changedSince(updatedAt: number): ChangeSet;
  applyRemoteChanges(changes: ChangeSet): void;
}
```

v1 ships `SqliteRepository`. The sync methods are declared on the
interface from day one so consumers cannot drift in a way that
assumes they don't exist; they throw a clear error until Step 4.

**Acceptance criteria**:

- A `Repository` interface that hides storage details, including the
  reserved sync methods.
- A SQLite implementation (`SqliteRepository`) that:
  - Enforces the five sync-readiness rules (UUID PKs, tombstones,
    `updated_at`, `node_id`, `user_id`).
  - Stamps `created_at`, `updated_at`, and `node_id` on every write.
  - Filters `deleted_at IS NULL` on every read.
  - Seeds `local_config` with `node_id`, `user_id`, and
    `schema_version` on first launch if absent.
- A migration system that records applied versions in the
  `migrations` table. One initial migration is fine.
- A `PinningRule` JSON validator (rejects unknown `kind`, type-checks
  each branch).
- Tests that round-trip events, occurrences, personal anchors, and
  travel entries — including verifying tombstones hide deleted rows
  from list queries.

**Explicitly out of scope for this step**:

- The sync engine itself (Step 4).
- Auth (paired with Step 4).
- Any network code.

---

## Step 3: UI

**Why third**: needs the model and a storage layer to be useful.

**Recommended stack**: Electron or Tauri. Tauri is lighter and uses the
system webview, Electron is more familiar to most developers. Either
works.

**Initial views**:

1. **The current torus**: solar angle and lunar angle right now, with
   the next few anchors on each wheel labeled.
2. **The annual ring**: a circular rendering of the next 12 months with
   solar anchors, lunar anchors, and user events placed on it.
3. **Event creation**: a form for building a `PinningRule`. The
   discriminated union maps directly to a UI — pick a rule kind, then
   the fields render.
4. **Occurrence log**: the historical occurrences of a recurring event,
   with notes per occurrence.

The visual torus and spiral are explicitly deferred to a later phase
per the foundation document. v1 UI is functional, not contemplative.

---

## Step 4: Sync and auth

**Why last (for now)**: the schema from Step 2 is sync-ready, but the
sync engine itself benefits from existing after the UI has shaken out
what users actually do with their data across devices.

**Approach**: deferred — the engine choice is not made here. See
ADR-011 for the candidate list (hand-rolled REST + LWW, CouchDB/
PouchDB, Electric SQL, PowerSync, CRDT-based). The schema works with
any of them.

**Auth pairs with this step**. v1 hard-codes a local `user_id`. When
sync ships, a thin auth layer (email + magic link or OAuth) maps a
remote identity to that `user_id`. No data model changes; only the
bootstrap path.

**The work this step will do**:

1. Implement `Repository.changedSince(updatedAt)` and
   `Repository.applyRemoteChanges(changes)`.
2. Wrap `SqliteRepository` in a `SyncingRepository` that pushes/pulls
   on a schedule and on demand.
3. Add an auth boundary (sign-in flow on first launch, token storage,
   logout).
4. Decide and document the server-side architecture (own server vs.
   hosted Couch vs. Electric/PowerSync vs. etc.) in a fresh ADR at
   that time.

**Out of scope for this step's planning**: which sync engine. We
commit to that when the moment comes, with the real constraints we
will have then. The cost of waiting is approximately zero because the
schema is already shaped to accept any of them.

---

## When in doubt

- Read the relevant ADR in `docs/decisions.md`
- Run the tests after every change
- Prefer doing less and getting it right over doing more and getting it
  wrong
