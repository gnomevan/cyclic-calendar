# Architecture

This document names the load-bearing decisions and the discipline rules
that the codebase is built around. If a future change (by a human or by
Claude) violates one of these, this is what gets pointed at.

For the *why* behind these decisions, see [`docs/decisions.md`](docs/decisions.md).
For the philosophical foundation, see [`docs/foundation.md`](docs/foundation.md).

---

## The five rules

### 1. Native time is wheel position, not Gregorian

`Instant` is a coordinate into the celestial torus. Mechanically it is a
UTC millisecond count (because astronomy libraries consume that), but it
exposes **no date-like API**. You cannot ask an `Instant` what year it is.
You cannot add days to it. You cannot compare two `Instant`s by calendar
date.

The only path from an `Instant` to a calendar concept goes through
`src/gregorian.ts`. That module is the **single point of Gregorian
contact** with the rest of the system. Everything else speaks wheel
positions.

**If you find yourself wanting to add a date-like method to `Instant`**:
stop. The right answer is almost always to express the operation as a
wheel and a pinning rule instead. "Same date next year" is not a thing in
this system; "next time the solar wheel returns to this angle" is.

### 2. Wheels are an interface, not a list

Every cycle in the system — solar, lunar, sidereal, Pleiades, Saturn, the
week, the Tzolk'in, your magnolia tree — implements the same five-method
`Wheel` interface defined in `src/wheel.ts`. The resolver in
`src/resolver.ts` uses *only* that interface. It does not know which
wheels exist.

**Consequence**: adding a new wheel never touches the resolver. You
create a new file in `src/wheels/`, register it with a `WheelRegistry`,
and every pinning rule that can be expressed against the new wheel just
works.

**Two flavors of wheel** share the interface:
- *Predictive* (astronomical): `nextCrossing` computes from ephemeris.
- *Observational* (ecological): `nextCrossing` returns an estimate or
  `null`, and the wheel relies on logged observations.

The `kind` field discriminates. The interface is the same.

### 3. No origin is privileged

Origins are events with `isOrigin: true`. The Gregorian "year number" is
one count among many, taken against the conventional 1 CE origin. The
demo proves this by counting the same `Instant` against three different
origins and producing three different valid answers.

**If you find yourself hard-coding the Gregorian origin** as special:
stop. If a feature needs to compare against "this year", it needs to
either ask the user which origin defines its year, or default to a named
origin that can be swapped.

### 4. Events are patterns, not dates

A `CalendarEvent` carries a `PinningRule` — a description of where on the
torus the event occurs. It is **resolved** to an `Occurrence` (a specific
`Instant`) only when asked. Future occurrences are computed on demand
and not persisted; past occurrences are persisted because they carry
accumulated meaning ("the 14th gathering is the 1st gathering, spiraled
forward").

**If you find yourself wanting to store a `Date` field on an event**:
stop. Store the rule. Resolve it when you need an instant.

### 5. Pinning rules form an algebra, not a menu

There are seven primitives: `exact`, `firstAfter`, `nth`, `nearest`,
`conjunction`, `withinRange`, `observed`. They compose via
`TimeReference`: any rule's "after Y" reference can itself be a rule
whose resolution provides the reference instant. This is how the Paschal
full moon ("first full moon after the first new moon after the spring
equinox") works without a special primitive.

**If you find yourself wanting an eighth primitive**: maybe. But first
check whether it can be expressed by composing the existing seven. Most
patterns can. The bar for adding a primitive is that it expresses
something the seven *fundamentally cannot*.

---

## Layering

```
┌──────────────────────────────────────────────────┐
│  UI (not in v1)                                  │
├──────────────────────────────────────────────────┤
│  Persistence (not in v1)                         │
├──────────────────────────────────────────────────┤
│  events.ts  counts.ts                            │  ← what users build with
├──────────────────────────────────────────────────┤
│  resolver.ts                                     │  ← agnostic to wheels
├──────────────────────────────────────────────────┤
│  wheel.ts (interface)  wheels/*.ts (impls)       │
├──────────────────────────────────────────────────┤
│  astronomy.ts (library shim)  instant.ts         │  ← lowest layer
├──────────────────────────────────────────────────┤
│  gregorian.ts                                    │  ← isolated translation
└──────────────────────────────────────────────────┘
```

`gregorian.ts` is drawn as its own pipe because it does not participate
in the layering of the rest of the system. It is a translator that the
upper layers call only when they need to talk to the outside world.

---

## Things that look like they should be wheels but aren't

- **Linear counts** ("years since the project began"). These don't repeat;
  they're computed from an origin and an instant. They live in `counts.ts`,
  not in `wheels/`.
- **Eclipses**. Not a wheel — a conjunction across three wheels (sun,
  moon, lunar node). When we add eclipse support, it will be a pinning
  pattern over wheel positions, not a new wheel.

---

## When the rules should change

The rules above are firm but not eternal. The honest signal that one
needs revisiting is a real use case that none of the existing patterns
can express cleanly — not theoretical concern about flexibility.
[`docs/decisions.md`](docs/decisions.md) records the deliberation behind
each rule; revising one should mean a new entry there, not a silent edit.
