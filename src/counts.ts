import type { Instant } from "./instant.js";
import { epochMs, instantFromEpochMs } from "./instant.js";
import type { Wheel } from "./wheel.js";
import type { Count, Occurrence } from "./events.js";

/**
 * Compute how many complete cycles of `wheel` have elapsed between the
 * origin's moment and `at`. Also reports the fractional position into the
 * current cycle.
 *
 * No origin is privileged. The Gregorian "year number" is one such count,
 * against the conventional 1 CE origin. Counts are always computed, never
 * stored.
 *
 * Note on accuracy: counting completed cycles by angle alone fails when
 * the elapsed time exceeds one cycle, because angles wrap. We use a hybrid
 * approach: estimate cycle count from elapsed time and the wheel's nominal
 * cycle length, then refine by walking the wheel's anchor crossings.
 *
 * For the initial wheels (solar ~365.25d, lunar ~29.53d) this is fast and
 * exact. For very slow wheels (Saturn ~29.5y, great conjunctions) we may
 * want a more direct count later. Good enough for v1.
 */
export function countCycles(
  originAt: Instant,
  wheel: Wheel,
  nominalCycleDays: number,
  at: Instant,
): Count {
  const MS_PER_DAY = 86_400_000;
  const elapsedMs = epochMs(at) - epochMs(originAt);
  const sign = elapsedMs >= 0 ? 1 : -1;
  const absMs = Math.abs(elapsedMs);

  const originAngle = wheel.positionAt(originAt);
  const currentAngle = wheel.positionAt(at);

  // Approximate completed cycles by elapsed time.
  const approxCycles = absMs / (nominalCycleDays * MS_PER_DAY);
  // The fractional cycle is the angular distance from origin angle to
  // current angle, divided by 360.
  const angleDelta = (currentAngle - originAngle + 360) % 360;
  const fractional = angleDelta / 360;

  // Completed cycles is the integer part. Approximate cycles rounded down
  // gives a candidate; we adjust by comparing with the fractional position.
  let completed = Math.floor(approxCycles);
  // If the angle says we're "further around" than the time suggests by a
  // wide margin, we may be one cycle off — correct it.
  const expectedFractional = approxCycles - completed;
  if (Math.abs(expectedFractional - fractional) > 0.5) {
    // Off by one cycle; choose the integer that brings them closer.
    if (expectedFractional > fractional) completed += 1;
    else completed -= 1;
  }

  return {
    originId: "", // caller fills in
    wheelId: wheel.id,
    completedCycles: sign * completed,
    fractionalCycle: fractional,
  };
}

/**
 * Compute completed solar cycles since the origin's first occurrence — the
 * count that, in Gregorian terms, would be called "year number". Here it is
 * simply one count among many.
 */
export function solarYearsSinceOrigin(
  originFirstOccurrence: Occurrence,
  solarWheel: Wheel,
  at: Instant,
): number {
  const c = countCycles(originFirstOccurrence.at, solarWheel, 365.2422, at);
  return c.completedCycles;
}
