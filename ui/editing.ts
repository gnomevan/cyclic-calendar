/**
 * Editing state — a tiny external store for "which event is the user
 * currently editing or creating?"
 *
 * Lives outside React state and the events store because it's UI-only
 * and cross-cutting: the form reads it to populate fields, the event
 * list reads it to highlight the row, and any day card on the moonth
 * wheel can write it when the user clicks an event or an empty area
 * of a card. Threading it through props would require passing it
 * through MoonthView → MoonthRing → DayCard, which is more noise than
 * the problem deserves.
 *
 * Two modes:
 *   - editingEventId set → the form is editing an existing event
 *   - creatingFromDay set → the form is creating a new event seeded
 *     from a specific day's cycle positions (lunar phase, solar angle,
 *     and Gregorian date are all captured from the click)
 *   - both null → idle (form shows the standard advanced kind picker)
 *
 * Setting one mode clears the other so the form is always in exactly
 * one state.
 */

import { useSyncExternalStore } from "react";
import type { Instant } from "../src/index.js";

interface State {
  editingEventId: string | null;
  creatingFromDay: Instant | null;
}

let state: State = { editingEventId: null, creatingFromDay: null };
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getEditingSnapshot(): string | null {
  return state.editingEventId;
}

function getCreatingSnapshot(): Instant | null {
  return state.creatingFromDay;
}

/** React hook that re-renders whenever the edited id changes. */
export function useEditingEventId(): string | null {
  return useSyncExternalStore(subscribe, getEditingSnapshot, getEditingSnapshot);
}

/** React hook that re-renders whenever a day-click-create is triggered. */
export function useCreatingFromDay(): Instant | null {
  return useSyncExternalStore(subscribe, getCreatingSnapshot, getCreatingSnapshot);
}

/** Imperative setter — usable from event handlers anywhere. */
export function setEditingEventId(next: string | null): void {
  if (
    state.editingEventId === next &&
    state.creatingFromDay === null
  ) return;
  state = { editingEventId: next, creatingFromDay: null };
  notify();
}

/** Start creating a new event seeded from the cycle positions at this day. */
export function startCreatingFromDay(at: Instant): void {
  state = { editingEventId: null, creatingFromDay: at };
  notify();
}

/** Clear both edit and create modes; the form returns to idle. */
export function clearEditingState(): void {
  if (state.editingEventId === null && state.creatingFromDay === null) return;
  state = { editingEventId: null, creatingFromDay: null };
  notify();
}
