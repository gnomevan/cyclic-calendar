/**
 * Focus state — which instant on the helix is currently centered.
 *
 * The calendar is a continuous spiral, not a stack of discrete rings,
 * so focus is a single Instant rather than a `{moonth, day}` pair. The
 * focused card sits at the front-bottom of the helix; surrounding
 * cards drape away both above (past) and below (future) as the spiral
 * winds.
 *
 * Module-level state so DayCard click handlers can update focus
 * without thread-the-prop. MoonthView reads it to drive the helix
 * layout, EventForm reads it to know what date the user is "on" for
 * click-from-day creation.
 */

import { useSyncExternalStore } from "react";
import type { Instant } from "../src/index.js";

let state: Instant | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Instant | null {
  return state;
}

function notify(): void {
  for (const l of listeners) l();
}

/** Read the focused instant, or null if not yet initialized. */
export function useFocus(): Instant | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Imperative setter — usable from any click handler. */
export function setFocus(next: Instant): void {
  if (state !== null && state === next) return;
  state = next;
  notify();
}

/** Initialize once; subsequent calls are no-ops. */
export function ensureFocus(initial: Instant): void {
  if (state !== null) return;
  state = initial;
  notify();
}
