/**
 * Editing state — a tiny external store for "which event is the user
 * currently editing?"
 *
 * Lives outside React state and `events` (which is the persistent
 * store) because it's UI-only and cross-cutting: the form reads it to
 * populate fields, the list reads it to highlight the row, and any
 * day card on the moonth wheel can write it when the user clicks an
 * event. Putting it through props would require threading it through
 * MoonthView → MoonthRing → DayCard, which is more noise than the
 * problem deserves.
 */

import { useSyncExternalStore } from "react";

let currentEditingId: string | null = null;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): string | null {
  return currentEditingId;
}

/** React hook that re-renders the caller whenever the edited id changes. */
export function useEditingEventId(): string | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/** Imperative setter — usable from event handlers anywhere. */
export function setEditingEventId(next: string | null): void {
  if (currentEditingId === next) return;
  currentEditingId = next;
  for (const l of listeners) l();
}
