/**
 * Repository — the persistence boundary.
 *
 * The rest of the codebase imports this interface, not SQLite. The v1
 * implementation (`SqliteRepository` in `sqlite.ts`) is local-first and
 * offline-only. The interface deliberately includes `changedSince` and
 * `applyRemoteChanges` from day one, even though they throw "not yet
 * implemented" in v1, because consumers must not be able to develop
 * patterns that assume the sync hooks do not exist. See ADR-011.
 *
 * Sync-readiness invariants enforced by every implementation:
 *
 *   1. Primary keys are UUIDs on user-scoped entities.
 *   2. Deletes are soft — tombstones (`deleted_at`) hide rows from reads
 *      but preserve them for sync.
 *   3. Every write stamps `updated_at` (epoch ms) and `node_id` (the
 *      device that produced the change) into the row.
 *   4. `user_id` is required on every user-scoped row.
 *
 * Domain types (`CalendarEvent`, `Occurrence`, `PersonalAnchor`,
 * `TravelEntry`) stay clean of sync metadata. The metadata lives on
 * disk and inside the repository; it is not exposed on the values
 * returned to the rest of the codebase. The exception is `id` — that
 * leaks out because callers need it to address rows for deletes.
 */

import type { Instant } from "./instant.js";
import type { CalendarEvent, Occurrence } from "./events.js";
import type { Location } from "./wheel.js";

/* ------------------------------------------------------------------------- *
 *  Stored entities not already defined in events.ts
 * ------------------------------------------------------------------------- */

/**
 * A user-declared anchor on a wheel. Universal anchors live on the wheel
 * itself; personal anchors are stored against the user (e.g. "my Saturn
 * return position", "the angle of the Pleiades wheel at which heliacal
 * rising happens for my latitude").
 */
export interface PersonalAnchor {
  id: string;
  userId: string;
  wheelId: string;
  angle: number;
  name: string;
}

/**
 * A segment of the user's travel timeline. `toInstant` is undefined if
 * the user is still in this location ("still there"). Travel matters
 * because location-dependent wheels (like Pleiades heliacal events at a
 * given latitude) need to know where the observer was.
 */
export interface TravelEntry {
  id: string;
  userId: string;
  fromInstant: Instant;
  toInstant?: Instant;
  location: Location;
  label?: string;
}

/* ------------------------------------------------------------------------- *
 *  Sync types — reserved for the future sync layer (ADR-011, Step 4)
 * ------------------------------------------------------------------------- */

/**
 * A single changed row in a sync feed. Carries the entity itself plus
 * the sync metadata needed to order writes (`updatedAt`, `nodeId`) and
 * to express deletions (`deletedAt`).
 */
export interface SyncRecord<T> {
  entity: T;
  updatedAt: number;
  nodeId: string;
  deletedAt: number | null;
}

/**
 * A bundle of changes for transport between devices. v1 does not produce
 * or consume these; the type exists so the Repository interface can name
 * the sync methods without ambiguity.
 */
export interface ChangeSet {
  events: SyncRecord<CalendarEvent>[];
  occurrences: SyncRecord<Occurrence>[];
  personalAnchors: SyncRecord<PersonalAnchor>[];
  travelTimeline: SyncRecord<TravelEntry>[];
}

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} is not implemented in v1 (see ADR-011, Step 4)`);
    this.name = "NotImplementedError";
  }
}

/* ------------------------------------------------------------------------- *
 *  The Repository interface
 * ------------------------------------------------------------------------- */

export interface Repository {
  // ---- Events ----------------------------------------------------------
  saveEvent(e: CalendarEvent): void;
  getEvent(id: string): CalendarEvent | null;
  listEvents(userId: string): CalendarEvent[];
  softDeleteEvent(id: string): void;

  // ---- Occurrences -----------------------------------------------------
  /**
   * Persist an occurrence. If `o.id` is not set, the repository assigns
   * one. Returns the persisted occurrence with `id` populated.
   */
  saveOccurrence(o: Occurrence): Occurrence;
  getOccurrence(id: string): Occurrence | null;
  listOccurrencesForEvent(eventId: string): Occurrence[];
  softDeleteOccurrence(id: string): void;

  // ---- Personal anchors -------------------------------------------------
  savePersonalAnchor(a: PersonalAnchor): void;
  listPersonalAnchors(userId: string): PersonalAnchor[];
  softDeletePersonalAnchor(id: string): void;

  // ---- Travel timeline --------------------------------------------------
  saveTravelEntry(t: TravelEntry): void;
  listTravelTimeline(userId: string): TravelEntry[];
  softDeleteTravelEntry(id: string): void;

  // ---- Local config (device-scoped, NEVER syncs) ------------------------
  getConfig(key: string): string | null;
  setConfig(key: string, value: string): void;

  // ---- Sync surface (reserved for Step 4) -------------------------------
  /**
   * Returns the set of rows changed strictly after the given `updatedAt`
   * watermark. v1 throws NotImplementedError.
   */
  changedSince(updatedAt: number): ChangeSet;

  /**
   * Applies a remote change set against local state, resolving conflicts
   * by last-write-wins on `(updatedAt, nodeId)`. v1 throws
   * NotImplementedError.
   */
  applyRemoteChanges(changes: ChangeSet): void;

  // ---- Lifecycle --------------------------------------------------------
  /** Releases the underlying resource (closes the DB connection, etc). */
  close(): void;
}

/* ------------------------------------------------------------------------- *
 *  Helpers
 * ------------------------------------------------------------------------- */

/**
 * A fresh UUID suitable for an entity primary key. Uses the Web Crypto API,
 * which is available on Node 19+ (via globalThis.crypto) and every modern
 * browser. This keeps the persistence interface importable from browser
 * bundles, even though `SqliteRepository` itself is Node-only.
 */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** Standard local_config keys. Hard-code rather than stringly-typed at sites. */
export const CONFIG_KEYS = {
  /** UUID for this device, minted once on first launch. */
  NODE_ID: "node_id",
  /** Opaque id for the single local user in v1. */
  USER_ID: "user_id",
  /** Schema version most recently applied. Maintained by the migration system. */
  SCHEMA_VERSION: "schema_version",
} as const;
