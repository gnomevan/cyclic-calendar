/**
 * Focus state — which day-of-moonth is currently rotated to the
 * bottom-center of the wheel, in which moonth.
 *
 * Lives as a tiny external store (same pattern as editing.ts) because
 * it's read by MoonthView and MoonthRing for placement, and written by
 * DayCard click handlers anywhere on the wheel. Threading the setter
 * through props would mean four levels of drilling.
 *
 *   focus.moonthOffset  — how many moonths from "today's moonth" the
 *                          user has navigated. 0 = current moonth.
 *   focus.day            — which day-of-moonth sits at the bottom of
 *                          every visible ring.
 *
 * Initialized lazily by MoonthView via `ensureFocus` on first render,
 * once today's day-of-moonth is known. After that, only user clicks
 * change the focus — time progression does not. There's no automatic
 * "snap back to today" behavior; if we want that later, it should be
 * an explicit affordance.
 */

import { useSyncExternalStore } from "react";

export interface FocusState {
  moonthOffset: number;
  day: number;
}

let state: FocusState | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): FocusState | null {
  return state;
}

function notify(): void {
  for (const l of listeners) l();
}

/** Read the current focus, or null if not yet initialized. */
export function useFocus(): FocusState | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Imperative setter — called from card click handlers. */
export function setFocus(next: FocusState): void {
  if (
    state !== null &&
    state.moonthOffset === next.moonthOffset &&
    state.day === next.day
  ) return;
  state = next;
  notify();
}

/** Initialize once; subsequent calls are no-ops. */
export function ensureFocus(initial: FocusState): void {
  if (state !== null) return;
  state = initial;
  notify();
}
