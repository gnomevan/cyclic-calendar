# CLAUDE.md

This file is for Claude Code (or any AI assistant) working on this project.

## What this project is

A planning system whose native time is celestial rather than civil. Read
[`ARCHITECTURE.md`](ARCHITECTURE.md) first — it names the five discipline
rules the codebase is built around. Then [`docs/decisions.md`](docs/decisions.md)
for the reasoning behind those rules. Then [`docs/foundation.md`](docs/foundation.md)
and [`docs/research.md`](docs/research.md) if you need deeper context.

## Working agreements

**Read `ARCHITECTURE.md` before making structural changes.** The five rules
are load-bearing and reflect real deliberation. If a change would violate
one, that is a signal to either find a different approach or to argue
explicitly for amending the rule (which means a new entry in
`docs/decisions.md`, not a silent edit).

**Tests must pass after every change.** Run `npm test` and `npm run
typecheck` before declaring work done. The test suite is the proof that
the architecture works — keep it green.

**Prefer composition over new primitives.** If a new pinning pattern is
needed, first try composing the existing seven. The bar for adding an
eighth primitive is high — see ADR-004.

**Do not import `astronomy-engine` directly.** Use the shim at
`src/astronomy.ts`. If you need a function the shim does not expose,
add it to the shim. This isolates us from library changes.

**Do not add date-like methods to `Instant`.** See discipline rule #1 in
`ARCHITECTURE.md`. The `Instant` type is deliberately impoverished. If
you find yourself wanting calendar math on instants, the operation
should probably be a wheel and a pinning rule instead.

**Gregorian concepts live in `src/gregorian.ts` only.** No other file
imports anything from there for internal use — `gregorian.ts` is for the
boundary with the outside world. If you are adding a feature that needs
year/month/day reasoning, ask yourself whether it really needs Gregorian
or whether it needs a wheel.

## What's next

See [`next-steps.md`](next-steps.md) for the concrete agenda. In order:

1. **Add a third wheel** (Pleiades is the leading candidate). This
   stress-tests the extension interface under real use.
2. **Persistence** (SQLite, since offline). Events, occurrences, origins,
   travel timeline.
3. **UI** (Electron or Tauri). Visual wheel rendering and event creation.

## Conventions

- Strict TypeScript (`strict: true`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`). Take type errors seriously.
- Tests in `tests/`, source in `src/`. Vitest, not Jest.
- Imports use `.js` extensions on local paths (ESM convention) even
  though the source files are `.ts`. This is correct, not a bug.
- Comments explain *why*, not *what*. The types and names should explain
  what.

## Things that have already been considered and rejected

Before suggesting one of these, check `docs/decisions.md` — the
rationale is already recorded:

- Using Python or Rust (ADR-001)
- Calling an external astronomy service (ADR-002)
- Adding date methods to `Instant` (ADR-005)
- Treating the Gregorian origin as special (ADR-006)
- Precomputing future occurrences (ADR-007)
- Building UI first (ADR-008)

If you have a reason to revisit one, that is a real conversation worth
having — but start by reading the ADR.
