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

## Step 2: Persistence

**Why second**: only after we are confident the wheel interface is
right.

**Approach**: SQLite (offline requirement). Use `better-sqlite3` or
similar synchronous library — async storage adds complexity not needed
for a single-user planner.

**Schema** follows the existing types directly:

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL,
  description TEXT,
  rule_json TEXT NOT NULL,        -- serialized PinningRule
  is_origin INTEGER DEFAULT 0
);

CREATE TABLE occurrences (
  event_id TEXT NOT NULL,
  at INTEGER NOT NULL,             -- Instant (epoch ms)
  location_lat REAL,
  location_lon REAL,
  notes TEXT,
  PRIMARY KEY (event_id, at),
  FOREIGN KEY (event_id) REFERENCES events(id)
);

CREATE TABLE personal_anchors (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  wheel_id TEXT NOT NULL,
  angle REAL NOT NULL,
  name TEXT NOT NULL
);

CREATE TABLE travel_timeline (
  user_id TEXT NOT NULL,
  from_instant INTEGER NOT NULL,
  to_instant INTEGER,              -- nullable: "still there"
  location_lat REAL NOT NULL,
  location_lon REAL NOT NULL,
  label TEXT,
  PRIMARY KEY (user_id, from_instant)
);
```

`PinningRule` serialization is just JSON — the discriminated union maps
cleanly. Deserialization should validate the structure.

`Wheel` is NOT stored — wheels are code. The registry is built at
startup from the available wheel modules.

**Acceptance criteria**:

- A `Repository` interface that hides storage details
- A SQLite implementation
- A migration system (one initial migration is fine)
- Tests that round-trip events, occurrences, anchors

---

## Step 3: UI

**Why last**: needs the model and a storage layer to be useful.

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

## When in doubt

- Read the relevant ADR in `docs/decisions.md`
- Run the tests after every change
- Prefer doing less and getting it right over doing more and getting it
  wrong
