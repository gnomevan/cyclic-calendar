/**
 * The set of wheels the UI knows about, plus a shared registry.
 *
 * `ALL_WHEELS` is the iteration source for pickers (wheel dropdown,
 * etc.); `wheelRegistry` is what the resolver needs to turn a pinning
 * rule into a concrete occurrence.
 *
 * When a new wheel is added under `src/wheels/`, register it here too.
 * Forgetting that is the kind of thing that makes events silently fail
 * to resolve, so this file is the single point to remember.
 */

import {
  SimpleWheelRegistry,
  lunarWheel,
  pleiadesWheel,
  solarWheel,
  type Wheel,
} from "../src/index.js";

export const ALL_WHEELS: readonly Wheel[] = [
  solarWheel,
  lunarWheel,
  pleiadesWheel,
];

export const wheelRegistry = new SimpleWheelRegistry([...ALL_WHEELS]);
