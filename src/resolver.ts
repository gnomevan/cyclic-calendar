import type { Instant } from "./instant.js";
import { compareInstants, epochMs, instantFromEpochMs } from "./instant.js";
import { fromGregorianUTC, toGregorianUTC } from "./gregorian.js";
import type {
  Anchor,
  AnchorRef,
  Location,
  PinningRule,
  TimeReference,
  Wheel,
} from "./wheel.js";

/**
 * A registry of wheels, keyed by wheel id. The resolver receives this rather
 * than imports wheels directly — that is what keeps the resolver agnostic
 * to which wheels exist. Adding a new wheel never touches the resolver.
 */
export interface WheelRegistry {
  get(id: string): Wheel | undefined;
  /** Universal anchors are on each wheel; this exposes personal anchors. */
  personalAnchors?(userId: string): readonly Anchor[];
}

export class SimpleWheelRegistry implements WheelRegistry {
  private wheels = new Map<string, Wheel>();
  constructor(wheels: Wheel[]) {
    for (const w of wheels) this.wheels.set(w.id, w);
  }
  get(id: string): Wheel | undefined {
    return this.wheels.get(id);
  }
}

/** Result of resolving a rule. */
export interface ResolvedOccurrence {
  at: Instant;
}

export interface ResolveContext {
  registry: WheelRegistry;
  /** Reference instant: "next occurrence after this". */
  from: Instant;
  observer?: Location;
}

/* ------------------------------------------------------------------------- *
 *  Anchor lookup
 * ------------------------------------------------------------------------- */

function findAnchor(registry: WheelRegistry, ref: AnchorRef): Anchor {
  const wheel = registry.get(ref.wheelId);
  if (!wheel) {
    throw new Error(`Unknown wheel: ${ref.wheelId}`);
  }
  const anchor = wheel.anchors.find((a) => a.id === ref.anchorId);
  if (!anchor) {
    throw new Error(
      `Unknown anchor ${ref.anchorId} on wheel ${ref.wheelId}`,
    );
  }
  return anchor;
}

function wheelFor(registry: WheelRegistry, ref: AnchorRef): Wheel {
  const w = registry.get(ref.wheelId);
  if (!w) throw new Error(`Unknown wheel: ${ref.wheelId}`);
  return w;
}

/* ------------------------------------------------------------------------- *
 *  Resolving a TimeReference to a concrete Instant.
 *
 *  This is what makes composition work. A rule's reference point can be
 *  another rule, whose own resolution becomes the reference. Recursion is
 *  bounded by the rule structure — there are no cycles.
 * ------------------------------------------------------------------------- */

function resolveTimeReference(
  ref: TimeReference,
  ctx: ResolveContext,
): Instant | null {
  switch (ref.kind) {
    case "instant":
      return ref.at;
    case "anchor": {
      const anchor = findAnchor(ctx.registry, ref.ref);
      const wheel = wheelFor(ctx.registry, ref.ref);
      return wheel.nextCrossing(anchor.angle, ctx.from, ctx.observer);
    }
    case "rule": {
      const result = resolve(ref.rule, ctx);
      return result?.at ?? null;
    }
  }
}

/* ------------------------------------------------------------------------- *
 *  The resolver itself
 * ------------------------------------------------------------------------- */

const MS_PER_DAY = 86_400_000;

export function resolve(
  rule: PinningRule,
  ctx: ResolveContext,
): ResolvedOccurrence | null {
  switch (rule.kind) {
    case "exact": {
      const anchor = findAnchor(ctx.registry, rule.anchor);
      const wheel = wheelFor(ctx.registry, rule.anchor);
      const at = wheel.nextCrossing(anchor.angle, ctx.from, ctx.observer);
      return at ? { at } : null;
    }

    case "firstAfter": {
      const ref = resolveTimeReference(rule.after, ctx);
      if (ref === null) return null;
      const anchor = findAnchor(ctx.registry, rule.target);
      const wheel = wheelFor(ctx.registry, rule.target);
      const at = wheel.nextCrossing(anchor.angle, ref, ctx.observer);
      return at ? { at } : null;
    }

    case "nth": {
      if (rule.n < 1) throw new Error("nth: n must be >= 1");
      let cursor = resolveTimeReference(rule.after, ctx);
      if (cursor === null) return null;
      const anchor = findAnchor(ctx.registry, rule.target);
      const wheel = wheelFor(ctx.registry, rule.target);
      let last: Instant | null = null;
      for (let i = 0; i < rule.n; i++) {
        last = wheel.nextCrossing(anchor.angle, cursor, ctx.observer);
        if (last === null) return null;
        cursor = last;
      }
      return last ? { at: last } : null;
    }

    case "nearest": {
      // The "near" reference is the centerpoint. We search both forward
      // and backward from there for the next occurrence of `target` in
      // each direction, and pick whichever is closer in absolute time —
      // provided it is within the tolerance window.
      const near = resolveTimeReference(rule.near, ctx);
      if (near === null) return null;
      const anchor = findAnchor(ctx.registry, rule.target);
      const wheel = wheelFor(ctx.registry, rule.target);

      const forward = wheel.nextCrossing(anchor.angle, near, ctx.observer);
      // For the backward search, step back by the wheel's approximate cycle
      // and search forward from there. We can estimate cycle from the
      // forward search: it must be within one cycle of `near`.
      const backwardSearchStart = instantFromEpochMs(
        epochMs(near) - 400 * MS_PER_DAY, // wider than any wheel we use yet
      );
      // Find ALL crossings between backwardSearchStart and `near` by walking forward.
      let backward: Instant | null = null;
      let cursor = backwardSearchStart;
      while (true) {
        const next = wheel.nextCrossing(anchor.angle, cursor, ctx.observer);
        if (next === null) break;
        if (compareInstants(next, near) >= 0) break;
        backward = next;
        cursor = next;
      }

      const candidates: Instant[] = [];
      if (forward !== null) candidates.push(forward);
      if (backward !== null) candidates.push(backward);
      if (candidates.length === 0) return null;

      let best: Instant | null = null;
      let bestDist = Infinity;
      for (const c of candidates) {
        const dist = Math.abs(epochMs(c) - epochMs(near));
        if (dist < bestDist) {
          best = c;
          bestDist = dist;
        }
      }
      if (best === null) return null;
      if (bestDist > rule.toleranceDays * MS_PER_DAY) return null;
      return { at: best };
    }

    case "conjunction": {
      // Find the next occurrence of `primary`. Then check whether every
      // anchor in `others` reaches its angle within toleranceDays of that
      // primary moment (either before or after). If so, the occurrence is
      // the primary's moment. If any anchor is out of tolerance, this
      // cycle yields no occurrence — and we look at the next primary
      // crossing, repeating up to a generous bound (so a "conjunction
      // every few years" event eventually resolves).
      const primaryWheel = wheelFor(ctx.registry, rule.primary);
      const primaryAnchor = findAnchor(ctx.registry, rule.primary);

      let cursor: Instant = ctx.from;
      const MAX_ITERATIONS = 200; // safety bound
      for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
        const primaryAt = primaryWheel.nextCrossing(
          primaryAnchor.angle,
          cursor,
          ctx.observer,
        );
        if (primaryAt === null) return null;

        let allWithin = true;
        for (const ref of rule.others) {
          const w = wheelFor(ctx.registry, ref);
          const a = findAnchor(ctx.registry, ref);
          // Find the nearest occurrence of this anchor to primaryAt,
          // forward or backward, within tolerance.
          const forward = w.nextCrossing(
            a.angle,
            primaryAt,
            ctx.observer,
          );
          // Backward: search forward from a window before primaryAt and
          // take the last crossing strictly before primaryAt.
          const backStart = instantFromEpochMs(
            epochMs(primaryAt) - 400 * MS_PER_DAY,
          );
          let backward: Instant | null = null;
          let bc = backStart;
          while (true) {
            const n = w.nextCrossing(a.angle, bc, ctx.observer);
            if (n === null) break;
            if (compareInstants(n, primaryAt) >= 0) break;
            backward = n;
            bc = n;
          }

          let bestDist = Infinity;
          if (forward !== null) {
            bestDist = Math.min(
              bestDist,
              Math.abs(epochMs(forward) - epochMs(primaryAt)),
            );
          }
          if (backward !== null) {
            bestDist = Math.min(
              bestDist,
              Math.abs(epochMs(backward) - epochMs(primaryAt)),
            );
          }
          if (bestDist > rule.toleranceDays * MS_PER_DAY) {
            allWithin = false;
            break;
          }
        }

        if (allWithin) return { at: primaryAt };
        cursor = primaryAt;
      }
      return null;
    }

    case "withinRange": {
      // Resolve `start` and `end` to instants, then find the next `target`
      // that falls between them. If `start` > `end` we treat it as wrapping
      // through the cycle (e.g. Samhain → Beltane crosses the year boundary).
      const startWheel = wheelFor(ctx.registry, rule.start);
      const endWheel = wheelFor(ctx.registry, rule.end);
      const startAnchor = findAnchor(ctx.registry, rule.start);
      const endAnchor = findAnchor(ctx.registry, rule.end);

      const startAt = startWheel.nextCrossing(
        startAnchor.angle,
        ctx.from,
        ctx.observer,
      );
      if (startAt === null) return null;
      const endAt = endWheel.nextCrossing(
        endAnchor.angle,
        startAt,
        ctx.observer,
      );
      if (endAt === null) return null;

      const targetWheel = wheelFor(ctx.registry, rule.target);
      const targetAnchor = findAnchor(ctx.registry, rule.target);

      // Walk forward from startAt looking for a target crossing before endAt.
      let cursor = startAt;
      const SAFETY = 200;
      for (let i = 0; i < SAFETY; i++) {
        const next = targetWheel.nextCrossing(
          targetAnchor.angle,
          cursor,
          ctx.observer,
        );
        if (next === null) return null;
        if (compareInstants(next, endAt) > 0) return null;
        return { at: next };
      }
      return null;
    }

    case "observed": {
      // Observed events are surfaced from a separate observation log, not
      // computed here. The resolver returns null; callers handling observed
      // events should look up logged observations directly.
      return null;
    }

    case "atAngle": {
      const wheel = ctx.registry.get(rule.wheelId);
      if (!wheel) throw new Error(`Unknown wheel: ${rule.wheelId}`);
      const at = wheel.nextCrossing(rule.angle, ctx.from, ctx.observer);
      return at ? { at } : null;
    }

    case "gregorianDate": {
      // Find the next noon-UTC moment whose Gregorian month/day matches
      // the rule. Choosing noon keeps the resolution unambiguous across
      // time zones near midnight without committing to a particular zone.
      const fromG = toGregorianUTC(ctx.from);
      let year = fromG.year;
      const candidate = fromGregorianUTC({
        year,
        month: rule.month,
        day: rule.day,
        hour: 12,
        minute: 0,
        second: 0,
      });
      if (epochMs(candidate) > epochMs(ctx.from)) {
        return { at: candidate };
      }
      // Past for this year; roll to next year.
      year += 1;
      const next = fromGregorianUTC({
        year,
        month: rule.month,
        day: rule.day,
        hour: 12,
        minute: 0,
        second: 0,
      });
      return { at: next };
    }

    case "anyOf": {
      // The earliest occurrence across the inner rules. If all return
      // null, this rule returns null too.
      let earliest: ResolvedOccurrence | null = null;
      for (const inner of rule.rules) {
        const r = resolve(inner, ctx);
        if (r === null) continue;
        if (earliest === null || epochMs(r.at) < epochMs(earliest.at)) {
          earliest = r;
        }
      }
      return earliest;
    }
  }
}
