/**
 * Browser event store — local, single-user, localStorage-backed.
 *
 * This is a deliberate stopgap. The "real" persistence story is the
 * SqliteRepository in `src/sqlite.ts`, which is Node-only. Until Step
 * 3.d resolves the SQLite-in-browser question (wa-sqlite, sql.js, or a
 * Tauri/Electron bridge), the UI keeps events in localStorage so they
 * survive a refresh without committing us to any particular browser DB.
 *
 * Writes serialize the PinningRule through the same `serializePinningRule`
 * the real repository uses; reads deserialize through `validatePinningRule`.
 * Bad data on disk is rejected at load time rather than silently kept,
 * so localStorage corruption can't poison the in-memory model.
 *
 * One hard-coded user ("local-user") matches the ADR-009 single-user v1.
 */

import { useSyncExternalStore } from "react";
import {
  SerializationError,
  deserializePinningRule,
  newId,
  serializePinningRule,
  type CalendarEvent,
} from "../src/index.js";

export const LOCAL_USER_ID = "local-user";

const STORAGE_KEY = "cyclic.events.v1";

interface StoredEvent {
  id: string;
  userId: string;
  name: string;
  description?: string;
  ruleJson: string;
  isOrigin?: boolean;
}

function load(): CalendarEvent[] {
  if (typeof localStorage === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn("cyclic: events in localStorage are not valid JSON, ignoring");
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const events: CalendarEvent[] = [];
  for (const s of parsed as StoredEvent[]) {
    try {
      const event: CalendarEvent = {
        id: s.id,
        userId: s.userId,
        name: s.name,
        rule: deserializePinningRule(s.ruleJson),
      };
      if (s.description !== undefined) event.description = s.description;
      if (s.isOrigin) event.isOrigin = true;
      events.push(event);
    } catch (err) {
      if (err instanceof SerializationError) {
        console.warn(`cyclic: dropping event ${s.id} with invalid rule:`, err.message);
        continue;
      }
      throw err;
    }
  }
  return events;
}

function persist(events: CalendarEvent[]): void {
  if (typeof localStorage === "undefined") return;
  const stored: StoredEvent[] = events.map((e) => {
    const out: StoredEvent = {
      id: e.id,
      userId: e.userId ?? LOCAL_USER_ID,
      name: e.name,
      ruleJson: serializePinningRule(e.rule),
    };
    if (e.description !== undefined) out.description = e.description;
    if (e.isOrigin) out.isOrigin = true;
    return out;
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
}

/* ----- subscription plumbing for useSyncExternalStore ------------------ */

let cache: CalendarEvent[] | null = null;
const listeners = new Set<() => void>();

function getSnapshot(): CalendarEvent[] {
  if (cache === null) cache = load();
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function commit(next: CalendarEvent[]): void {
  cache = next;
  persist(next);
  for (const l of listeners) l();
}

/* ----- public API ----------------------------------------------------- */

export function useEvents(): CalendarEvent[] {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface NewEventInput {
  name: string;
  description?: string;
  rule: CalendarEvent["rule"];
  isOrigin?: boolean;
}

export function addEvent(input: NewEventInput): CalendarEvent {
  const event: CalendarEvent = {
    id: newId(),
    userId: LOCAL_USER_ID,
    name: input.name,
    rule: input.rule,
  };
  if (input.description !== undefined) event.description = input.description;
  if (input.isOrigin) event.isOrigin = true;
  commit([...getSnapshot(), event]);
  return event;
}

/**
 * Replace an existing event in place. Keeps the same id and userId so
 * any references elsewhere stay valid. Returns the updated event, or
 * null if no event with that id exists.
 */
export function updateEvent(id: string, input: NewEventInput): CalendarEvent | null {
  const current = getSnapshot();
  const idx = current.findIndex((e) => e.id === id);
  if (idx === -1) return null;
  const existing = current[idx]!;
  const updated: CalendarEvent = {
    id: existing.id,
    userId: existing.userId ?? LOCAL_USER_ID,
    name: input.name,
    rule: input.rule,
  };
  if (input.description !== undefined) updated.description = input.description;
  if (input.isOrigin) updated.isOrigin = true;
  const next = [...current];
  next[idx] = updated;
  commit(next);
  return updated;
}

export function removeEvent(id: string): void {
  commit(getSnapshot().filter((e) => e.id !== id));
}
