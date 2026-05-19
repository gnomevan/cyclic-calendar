/**
 * SqliteRepository — the v1 persistence implementation.
 *
 * Single-device, offline-only. Local-first by design; the schema and
 * the runtime invariants (UUID PKs, tombstones, updated_at, node_id)
 * are sized to admit a sync layer later without migration. See ADR-011
 * for the reasoning.
 *
 * Use `better-sqlite3` because it is synchronous: a single-user planner
 * does not need async I/O, and synchronous calls eliminate a category
 * of bugs (interleaved writes, partial reads) that async would invite.
 *
 * The repository is the only file that imports `better-sqlite3`. Other
 * code imports the `Repository` interface from `./repository.js`.
 */

import Database, { type Database as Db } from "better-sqlite3";
import type { Instant } from "./instant.js";
import { instantFromEpochMs, epochMs } from "./instant.js";
import type { CalendarEvent, Occurrence } from "./events.js";
import {
  type ChangeSet,
  type PersonalAnchor,
  type Repository,
  type TravelEntry,
  CONFIG_KEYS,
  NotImplementedError,
  newId,
} from "./repository.js";
import {
  deserializePinningRule,
  serializePinningRule,
} from "./serialize.js";

/* ------------------------------------------------------------------------- *
 *  Migrations
 *
 *  The migration list is append-only. Each entry has a monotonically
 *  increasing version number and the SQL to bring the schema from
 *  (version - 1) to (version). Applied versions are recorded in the
 *  `migrations` table.
 *
 *  The migrations table itself is created before consulting it — it's
 *  the bootstrap, not a migration.
 * ------------------------------------------------------------------------- */

interface Migration {
  version: number;
  sql: string;
}

const MIGRATIONS: Migration[] = [
  {
    version: 1,
    sql: `
      CREATE TABLE events (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        rule_json TEXT NOT NULL,
        is_origin INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        node_id TEXT NOT NULL
      );
      CREATE INDEX events_user_live ON events(user_id) WHERE deleted_at IS NULL;
      CREATE INDEX events_updated_at ON events(updated_at);

      CREATE TABLE occurrences (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        at INTEGER NOT NULL,
        location_lat REAL,
        location_lon REAL,
        notes TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        node_id TEXT NOT NULL,
        UNIQUE (event_id, at),
        FOREIGN KEY (event_id) REFERENCES events(id)
      );
      CREATE INDEX occurrences_event_live ON occurrences(event_id) WHERE deleted_at IS NULL;
      CREATE INDEX occurrences_updated_at ON occurrences(updated_at);

      CREATE TABLE personal_anchors (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        wheel_id TEXT NOT NULL,
        angle REAL NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        node_id TEXT NOT NULL
      );
      CREATE INDEX personal_anchors_user_live ON personal_anchors(user_id) WHERE deleted_at IS NULL;
      CREATE INDEX personal_anchors_updated_at ON personal_anchors(updated_at);

      CREATE TABLE travel_timeline (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        from_instant INTEGER NOT NULL,
        to_instant INTEGER,
        location_lat REAL NOT NULL,
        location_lon REAL NOT NULL,
        label TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        deleted_at INTEGER,
        node_id TEXT NOT NULL
      );
      CREATE INDEX travel_user_from ON travel_timeline(user_id, from_instant) WHERE deleted_at IS NULL;
      CREATE INDEX travel_updated_at ON travel_timeline(updated_at);

      CREATE TABLE local_config (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `,
  },
];

/* ------------------------------------------------------------------------- *
 *  Row shapes — what SQLite hands back. Camel-case conversion happens at
 *  the boundary so the rest of the codebase never sees snake_case.
 * ------------------------------------------------------------------------- */

interface EventRow {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  rule_json: string;
  is_origin: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  node_id: string;
}

interface OccurrenceRow {
  id: string;
  event_id: string;
  at: number;
  location_lat: number | null;
  location_lon: number | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  node_id: string;
}

interface PersonalAnchorRow {
  id: string;
  user_id: string;
  wheel_id: string;
  angle: number;
  name: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  node_id: string;
}

interface TravelRow {
  id: string;
  user_id: string;
  from_instant: number;
  to_instant: number | null;
  location_lat: number;
  location_lon: number;
  label: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
  node_id: string;
}

/* ------------------------------------------------------------------------- *
 *  The repository
 * ------------------------------------------------------------------------- */

export interface SqliteRepositoryOptions {
  /** Optional fixed clock for tests; defaults to `Date.now`. */
  now?: () => number;
  /** Optional fixed UUID source for tests; defaults to `crypto.randomUUID`. */
  newId?: () => string;
}

export class SqliteRepository implements Repository {
  private readonly db: Db;
  private readonly nowFn: () => number;
  private readonly idFn: () => string;
  /** Cached node_id from local_config; populated lazily on first write. */
  private cachedNodeId: string | null = null;

  constructor(filename: string, options: SqliteRepositoryOptions = {}) {
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.nowFn = options.now ?? Date.now;
    this.idFn = options.newId ?? newId;
    this.bootstrap();
  }

  /* ----- Bootstrap --------------------------------------------------- */

  private bootstrap(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
    `);
    const applied = new Set<number>(
      this.db
        .prepare("SELECT version FROM migrations")
        .all()
        .map((row) => (row as { version: number }).version),
    );
    const insertMigration = this.db.prepare(
      "INSERT INTO migrations (version, applied_at) VALUES (?, ?)",
    );
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.version)) continue;
      const apply = this.db.transaction(() => {
        this.db.exec(migration.sql);
        insertMigration.run(migration.version, this.nowFn());
      });
      apply();
    }

    // Seed local_config defaults if missing. The node_id and user_id
    // are device-local — synced devices each have their own — and are
    // generated here on first launch.
    this.ensureConfigDefault(CONFIG_KEYS.NODE_ID, () => this.idFn());
    this.ensureConfigDefault(CONFIG_KEYS.USER_ID, () => this.idFn());
    this.setConfig(
      CONFIG_KEYS.SCHEMA_VERSION,
      String(MIGRATIONS.length === 0 ? 0 : MIGRATIONS[MIGRATIONS.length - 1]!.version),
    );
  }

  private ensureConfigDefault(key: string, makeValue: () => string): void {
    if (this.getConfig(key) === null) {
      this.setConfig(key, makeValue());
    }
  }

  /** Lazy accessor — reads from local_config the first time, then caches. */
  private nodeId(): string {
    if (this.cachedNodeId !== null) return this.cachedNodeId;
    const v = this.getConfig(CONFIG_KEYS.NODE_ID);
    if (v === null) {
      throw new Error(
        "local_config.node_id is missing — bootstrap should have seeded it",
      );
    }
    this.cachedNodeId = v;
    return v;
  }

  /* ----- Events ----------------------------------------------------- */

  saveEvent(e: CalendarEvent): void {
    if (!e.id) throw new Error("saveEvent requires e.id");
    if (!e.userId) throw new Error("saveEvent requires e.userId (no system events in v1)");
    const now = this.nowFn();
    const nodeId = this.nodeId();
    const ruleJson = serializePinningRule(e.rule);
    const existing = this.db
      .prepare("SELECT created_at FROM events WHERE id = ?")
      .get(e.id) as { created_at: number } | undefined;
    const createdAt = existing?.created_at ?? now;
    this.db
      .prepare(
        `INSERT INTO events
           (id, user_id, name, description, rule_json, is_origin,
            created_at, updated_at, deleted_at, node_id)
         VALUES
           (@id, @user_id, @name, @description, @rule_json, @is_origin,
            @created_at, @updated_at, NULL, @node_id)
         ON CONFLICT(id) DO UPDATE SET
           user_id    = excluded.user_id,
           name       = excluded.name,
           description= excluded.description,
           rule_json  = excluded.rule_json,
           is_origin  = excluded.is_origin,
           updated_at = excluded.updated_at,
           deleted_at = NULL,
           node_id    = excluded.node_id`,
      )
      .run({
        id: e.id,
        user_id: e.userId,
        name: e.name,
        description: e.description ?? null,
        rule_json: ruleJson,
        is_origin: e.isOrigin ? 1 : 0,
        created_at: createdAt,
        updated_at: now,
        node_id: nodeId,
      });
  }

  getEvent(id: string): CalendarEvent | null {
    const row = this.db
      .prepare("SELECT * FROM events WHERE id = ? AND deleted_at IS NULL")
      .get(id) as EventRow | undefined;
    return row ? rowToEvent(row) : null;
  }

  listEvents(userId: string): CalendarEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at",
      )
      .all(userId) as EventRow[];
    return rows.map(rowToEvent);
  }

  softDeleteEvent(id: string): void {
    const now = this.nowFn();
    this.db
      .prepare(
        `UPDATE events SET deleted_at = ?, updated_at = ?, node_id = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, this.nodeId(), id);
  }

  /* ----- Occurrences ------------------------------------------------ */

  saveOccurrence(o: Occurrence): Occurrence {
    const id = o.id ?? this.idFn();
    const now = this.nowFn();
    const nodeId = this.nodeId();
    const existing = this.db
      .prepare("SELECT created_at FROM occurrences WHERE id = ?")
      .get(id) as { created_at: number } | undefined;
    const createdAt = existing?.created_at ?? now;
    this.db
      .prepare(
        `INSERT INTO occurrences
           (id, event_id, at, location_lat, location_lon, notes,
            created_at, updated_at, deleted_at, node_id)
         VALUES
           (@id, @event_id, @at, @location_lat, @location_lon, @notes,
            @created_at, @updated_at, NULL, @node_id)
         ON CONFLICT(id) DO UPDATE SET
           event_id     = excluded.event_id,
           at           = excluded.at,
           location_lat = excluded.location_lat,
           location_lon = excluded.location_lon,
           notes        = excluded.notes,
           updated_at   = excluded.updated_at,
           deleted_at   = NULL,
           node_id      = excluded.node_id`,
      )
      .run({
        id,
        event_id: o.eventId,
        at: epochMs(o.at),
        location_lat: o.location?.latitude ?? null,
        location_lon: o.location?.longitude ?? null,
        notes: o.notes ?? null,
        created_at: createdAt,
        updated_at: now,
        node_id: nodeId,
      });
    return { ...o, id };
  }

  getOccurrence(id: string): Occurrence | null {
    const row = this.db
      .prepare("SELECT * FROM occurrences WHERE id = ? AND deleted_at IS NULL")
      .get(id) as OccurrenceRow | undefined;
    return row ? rowToOccurrence(row) : null;
  }

  listOccurrencesForEvent(eventId: string): Occurrence[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM occurrences WHERE event_id = ? AND deleted_at IS NULL ORDER BY at",
      )
      .all(eventId) as OccurrenceRow[];
    return rows.map(rowToOccurrence);
  }

  softDeleteOccurrence(id: string): void {
    const now = this.nowFn();
    this.db
      .prepare(
        `UPDATE occurrences SET deleted_at = ?, updated_at = ?, node_id = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, this.nodeId(), id);
  }

  /* ----- Personal anchors ------------------------------------------- */

  savePersonalAnchor(a: PersonalAnchor): void {
    if (!a.id) throw new Error("savePersonalAnchor requires a.id");
    const now = this.nowFn();
    const nodeId = this.nodeId();
    const existing = this.db
      .prepare("SELECT created_at FROM personal_anchors WHERE id = ?")
      .get(a.id) as { created_at: number } | undefined;
    const createdAt = existing?.created_at ?? now;
    this.db
      .prepare(
        `INSERT INTO personal_anchors
           (id, user_id, wheel_id, angle, name,
            created_at, updated_at, deleted_at, node_id)
         VALUES
           (@id, @user_id, @wheel_id, @angle, @name,
            @created_at, @updated_at, NULL, @node_id)
         ON CONFLICT(id) DO UPDATE SET
           user_id    = excluded.user_id,
           wheel_id   = excluded.wheel_id,
           angle      = excluded.angle,
           name       = excluded.name,
           updated_at = excluded.updated_at,
           deleted_at = NULL,
           node_id    = excluded.node_id`,
      )
      .run({
        id: a.id,
        user_id: a.userId,
        wheel_id: a.wheelId,
        angle: a.angle,
        name: a.name,
        created_at: createdAt,
        updated_at: now,
        node_id: nodeId,
      });
  }

  listPersonalAnchors(userId: string): PersonalAnchor[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM personal_anchors WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at",
      )
      .all(userId) as PersonalAnchorRow[];
    return rows.map(rowToPersonalAnchor);
  }

  softDeletePersonalAnchor(id: string): void {
    const now = this.nowFn();
    this.db
      .prepare(
        `UPDATE personal_anchors SET deleted_at = ?, updated_at = ?, node_id = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, this.nodeId(), id);
  }

  /* ----- Travel timeline -------------------------------------------- */

  saveTravelEntry(t: TravelEntry): void {
    if (!t.id) throw new Error("saveTravelEntry requires t.id");
    const now = this.nowFn();
    const nodeId = this.nodeId();
    const existing = this.db
      .prepare("SELECT created_at FROM travel_timeline WHERE id = ?")
      .get(t.id) as { created_at: number } | undefined;
    const createdAt = existing?.created_at ?? now;
    this.db
      .prepare(
        `INSERT INTO travel_timeline
           (id, user_id, from_instant, to_instant, location_lat, location_lon, label,
            created_at, updated_at, deleted_at, node_id)
         VALUES
           (@id, @user_id, @from_instant, @to_instant, @location_lat, @location_lon, @label,
            @created_at, @updated_at, NULL, @node_id)
         ON CONFLICT(id) DO UPDATE SET
           user_id      = excluded.user_id,
           from_instant = excluded.from_instant,
           to_instant   = excluded.to_instant,
           location_lat = excluded.location_lat,
           location_lon = excluded.location_lon,
           label        = excluded.label,
           updated_at   = excluded.updated_at,
           deleted_at   = NULL,
           node_id      = excluded.node_id`,
      )
      .run({
        id: t.id,
        user_id: t.userId,
        from_instant: epochMs(t.fromInstant),
        to_instant: t.toInstant !== undefined ? epochMs(t.toInstant) : null,
        location_lat: t.location.latitude,
        location_lon: t.location.longitude,
        label: t.label ?? null,
        created_at: createdAt,
        updated_at: now,
        node_id: nodeId,
      });
  }

  listTravelTimeline(userId: string): TravelEntry[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM travel_timeline
         WHERE user_id = ? AND deleted_at IS NULL
         ORDER BY from_instant`,
      )
      .all(userId) as TravelRow[];
    return rows.map(rowToTravelEntry);
  }

  softDeleteTravelEntry(id: string): void {
    const now = this.nowFn();
    this.db
      .prepare(
        `UPDATE travel_timeline SET deleted_at = ?, updated_at = ?, node_id = ?
         WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(now, now, this.nodeId(), id);
  }

  /* ----- Local config ----------------------------------------------- */

  getConfig(key: string): string | null {
    const row = this.db
      .prepare("SELECT value FROM local_config WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  setConfig(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO local_config (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
    if (key === CONFIG_KEYS.NODE_ID) {
      this.cachedNodeId = value;
    }
  }

  /* ----- Sync surface (Step 4) -------------------------------------- */

  changedSince(_updatedAt: number): ChangeSet {
    throw new NotImplementedError("Repository.changedSince");
  }

  applyRemoteChanges(_changes: ChangeSet): void {
    throw new NotImplementedError("Repository.applyRemoteChanges");
  }

  /* ----- Lifecycle -------------------------------------------------- */

  close(): void {
    this.db.close();
  }
}

/* ------------------------------------------------------------------------- *
 *  Row → domain conversions
 * ------------------------------------------------------------------------- */

function rowToEvent(row: EventRow): CalendarEvent {
  const e: CalendarEvent = {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    rule: deserializePinningRule(row.rule_json),
  };
  if (row.description !== null) e.description = row.description;
  if (row.is_origin === 1) e.isOrigin = true;
  return e;
}

function rowToOccurrence(row: OccurrenceRow): Occurrence {
  const o: Occurrence = {
    id: row.id,
    eventId: row.event_id,
    at: instantFromEpochMs(row.at),
  };
  if (row.location_lat !== null && row.location_lon !== null) {
    o.location = { latitude: row.location_lat, longitude: row.location_lon };
  }
  if (row.notes !== null) o.notes = row.notes;
  return o;
}

function rowToPersonalAnchor(row: PersonalAnchorRow): PersonalAnchor {
  return {
    id: row.id,
    userId: row.user_id,
    wheelId: row.wheel_id,
    angle: row.angle,
    name: row.name,
  };
}

function rowToTravelEntry(row: TravelRow): TravelEntry {
  const t: TravelEntry = {
    id: row.id,
    userId: row.user_id,
    fromInstant: instantFromEpochMs(row.from_instant),
    location: { latitude: row.location_lat, longitude: row.location_lon },
  };
  if (row.to_instant !== null) t.toInstant = instantFromEpochMs(row.to_instant);
  if (row.label !== null) t.label = row.label;
  return t;
}

// Re-export so callers do not need to suppress Instant type imports.
export type { Instant };
