# The Cyclic Calendar Project — Conceptual Foundation

*Working document. Not a spec yet — the philosophical and structural decisions that any spec must rest on.*

---

## The Project, In One Paragraph

A planning system whose native time is celestial rather than civil. Two products in one: (1) a cosmological calendar that tracks real astronomical wheels — solar, lunar, and extensible to others — and (2) a personal pinning layer that lets a user attach life events to anchors on those wheels rather than to Gregorian dates. The Gregorian calendar exists only as a translation layer for talking to the outside world. The system is designed to support a nomadic life in which terrestrial location is contingent but celestial position is primary, and is built around the philosophical claim that ritual recurrence — returning to the same celestial position — is itself a form of conquering time.

---

## The Philosophical Frame

**Time as cyclical rather than linear.** Drawing on Eliade's *Myth of the Eternal Return*: traditional cyclic time isn't lesser than modern linear time; it's a different ontology. A festival isn't a commemoration of a past event but a re-enactment that brings participants ontologically present at the founding moment. Each iteration of an event re-creates the world of that event.

**The spiral as synthesis.** Pure cycle (Dharmic) is endless return without progress. Pure line (modern) is endless progress without return. The spiral holds both: the same position recurs, yet each return is at a different turn of the helix. The system must hold this duality.

**The torus as the actual geometry.** Two perpendicular circles — solar and lunar — generate a torus. Every moment is a coordinate on its surface. Solar position and lunar position drift against each other at incommensurable speeds, so the path traced winds around the torus forever and never exactly repeats. The spiral isn't a metaphor on top of the torus; the spiral *is* the path of a body whose two angular speeds don't divide evenly.

**Conquest of time, not space.** The animating ambition: instead of expanding outward into territory, expand inward into the quality of lived hours. More and more of the year spent inside ideal worlds, until the calendar no longer needs to mark them as exceptions.

---

## The Foundation: What Time Actually Is

This was the deepest decision, and the project depends on it being right.

**Time, in this system, is a position on a celestial torus.** Two circles: where the sun is (solar ecliptic longitude, 0°–360°), where the moon is relative to the sun (lunar phase, 0°–360°). Every moment is a coordinate pair. This is the *native time*. It is real, place-independent, observable, and computable from astronomy.

**Unix time is not the foundation.** A Unix timestamp is seconds since an arbitrary Christian-civil epoch, ticking in cesium-defined seconds disconnected from any natural cycle. To use it as the foundation would put a traditional facade on a modern engine. In this system, Gregorian dates are *computed from wheel positions*, not the other way around.

**There is no privileged origin.** This is the deepest piece. Counts of completed solar circuits ("years") are relational, not absolute. Many origins are equally valid; none is special. The Gregorian count is one origin among many — useful for talking to airlines, but no more fundamental than the day a person committed to the project, or the most recent winter solstice, or a particular eclipse. Origins are themselves events on the torus; "origin-ness" is a tag that can attach to any moment.

**This is closer to physics than to calendaring.** In general relativity, no reference frame is privileged; the same physical situation can be described from any frame, and the invariant reality is the same. Wheels are the invariant reality. Origins are reference frames. Counts are coordinates relative to a chosen frame.

---

## The Architecture

### Core Concepts

**Wheels.** The constituent circles of the torus. Each wheel is a real astronomical cycle with a current angular position. Wheels have named anchor positions (e.g. the solar wheel has 0°, 45°, 90°, ..., 315° as its eight major anchors). Wheels are not data containers; they are the time itself.

**Initial wheels for v1**: solar (8 anchors), lunar (at minimum 4 phase anchors).

**Extension wheels (future)**: Islamic lunar months, eclipses (location-aware), Pleiades and other stellar wheels, sidereal zodiac, lunar mansions (Nakshatras/Xiu/Manazil), planetary cycles (Saturn returns, Jupiter cycles), personal-ecological "wheels" whose anchors are observed rather than computed (first magnolia bud, first Pleiades sighting from current latitude).

**Wheel position.** Where a wheel currently is — an angle on its circle. The system always knows the current position of every active wheel.

**Anchors.** Named positions on a wheel. Solar wheel anchors include solstices, equinoxes, cross-quarters. Lunar wheel anchors include new moon, full moon, quarters. Anchors are wheel-specific. Adding a new wheel means defining its anchors.

**Events.** Patterns — descriptions of a moment in terms of wheel positions. An event is *not* a date. It is a *position description* like "solar near 90° AND lunar near 180°." The system resolves an event to a date when asked, by finding the next moment matching the description within tolerance.

**Occurrences.** Specific historical or scheduled traversals through an event's position. An event can have many occurrences (multiple iterations of an annual gathering). Each occurrence has a specific moment, a place where it happened, and accumulated meaning from previous iterations.

**Origins.** Named moments (themselves positions on the torus) from which counts can be measured. Many origins coexist; none is privileged. Each origin defines its own count of completed solar circuits, its own "year number" if you want to call it that. The Gregorian origin is one named origin. Personal origins are user-defined.

**Counts.** Relational measurements: "how many solar circuits from origin X to now." Counts are computed on demand from origin and current position. The system stores origins, not counts.

### The Pinning System

The architectural insight that has to be designed right from day one, even though most extensions aren't built yet:

A *wheel* is, abstractly: anything that, given a time window and (optionally) a location, produces a set of named anchor positions. This is the interface that all current and future wheels conform to. Solar wheel, lunar wheel, Islamic month-start wheel, eclipse wheel, personal-ecological wheel — all share this shape.

An *event* is pinned to one or more anchors, with a rule for resolution. Pinning rules anticipated:

- *Exact*: "this event happens exactly at this anchor" (e.g. ritual exactly on the winter solstice)
- *Nearest*: "this event happens at anchor X nearest to anchor Y" (e.g. the full moon nearest the autumn equinox)
- *First-after*: "this event happens at the first occurrence of anchor X after date/anchor Y"
- *Observed*: "this event happens when I personally log the anchor as occurring" (for ecological anchors)
- *Conjunction*: "this event requires multiple anchors to occur within a tolerance window" (e.g. full moon on or near solstice)

Get these primitives right and almost any pinning need can be expressed by combining them.

### The Translation Layer

The Gregorian calendar exists in the system only as a translation utility. Two directions:

- *Outward*: given a wheel position, project to a Gregorian date — for travel booking, communication with non-users, civil interaction.
- *Inward*: given a Gregorian date provided by someone else, ingest and place it on the torus.

The Gregorian layer is also one of many possible "origin-defined counts" — the Gregorian year is the count of completed solar circuits from a Christian-civil origin. It has no privileged status in the model.

### Visibility and Location

For wheels and events that have location-specific visibility (eclipses, Pleiades risings, anything stellar), the system supports observer location as a parameter. Single-user v1 supports "current location." Future multi-user version supports a *travel timeline* — a record of where the user has been and will be — so that "next eclipse visible to me" can be computed based on future location, not just current.

---

## What's Explicitly Deferred (Saved for Later)

These are pieces of the larger vision we surveyed but are intentionally not in v1:

- **Lunar mansions** (27 Nakshatras / 28 Xiu / 28 Manazil) — adds a finer-grained sidereal layer to the lunar wheel.
- **Sidereal zodiac integration** — additional wheel for tropical/sidereal distinction.
- **Eclipses with visibility paths** — wheel with location-aware anchors.
- **Planetary cycles** — Saturn returns, Jupiter cycles, great conjunctions.
- **Pleiades and other stellar anchors** — heliacal risings, settings, zeniths.
- **Personal-ecological wheels** — observed rather than computed.
- **Astrocartography integration** — given a celestial moment, which locations on Earth amplify it.
- **Multi-cyclic phase space (full planetary configuration as time)** — Option 3 in the foundational time-model survey.
- **Pure interval-only time (qualified periods without instants)** — Option 4 in the foundational time-model survey.
- **The visual torus / spiral interface** — beautiful contemplative rendering of the wheels and the user's accumulated history.
- **Multi-user support** — single user for v1; design accommodates expansion.

The architecture is designed so each of these can be added without rebuilding the core.

---

## What v1 Actually Is

A specification and data model — no UI — for a functional planner whose native time is celestial. Solar wheel and lunar wheel as initial wheels. Event pinning system with the primitive pinning rules above. Gregorian translation layer. Origin/count system with multiple coexisting origins. Extension interface designed so additional wheels can be plugged in without altering the core.

Single user for v1, with the data model designed to accommodate multi-user later.

Real astronomical accuracy is required even for v1 — we use existing libraries (the Daff Moon app handles the astronomy side already, so the planner can integrate with or read from such a source rather than reimplementing ephemeris calculations).

---

## Open Threads to Resolve When Spec'ing the Model

These will need to be addressed when we move from foundation to specification:

1. **Data representation of wheel position.** Float angle in degrees? Fixed precision? How is "current position" updated?

2. **Tolerance windows for pinning rules.** "The full moon nearest the autumn equinox" — what counts as "nearest"? Configurable per event?

3. **Storage of occurrences vs events.** Events are patterns; occurrences are realizations. What gets stored, what gets computed?

4. **Origin model.** Origins are events with a flag — but do they need to be persisted explicitly, or can any event optionally serve as an origin on demand?

5. **The extension interface contract.** What does a new wheel actually have to implement to plug in? This is the hardest design decision and the one most worth getting right.

6. **Multi-user data model.** How are events scoped to users? Are wheels shared across users (they're real astronomy, so yes) but pinning/occurrences private?

7. **Time representation in storage.** The model says native time is wheel position — but for persistence, do we store UTC timestamps and compute wheel positions from them, or store wheel positions directly?

---

## Closing Note

The work done in conversation up to this point establishes the *foundation*. Everything above is decided. What comes next is *specification* — turning the foundation into something an engineer could build from. The next phase is not more philosophy but more precision.
