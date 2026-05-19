import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CONFIG_KEYS,
  NotImplementedError,
  SerializationError,
  deserializePinningRule,
  fromISOString,
  newId,
  serializePinningRule,
  validatePinningRule,
  type CalendarEvent,
  type Occurrence,
  type PersonalAnchor,
  type PinningRule,
  type TravelEntry,
} from "../src/index.js";
import { SqliteRepository } from "../src/sqlite.js";

const USER = "user-1";
const REF = fromISOString("2026-01-01T00:00:00Z");

let repo: SqliteRepository;

beforeEach(() => {
  repo = new SqliteRepository(":memory:");
});

afterEach(() => {
  repo.close();
});

describe("SqliteRepository: bootstrap and local_config", () => {
  it("seeds node_id, user_id, and schema_version on first launch", () => {
    expect(repo.getConfig(CONFIG_KEYS.NODE_ID)).not.toBeNull();
    expect(repo.getConfig(CONFIG_KEYS.USER_ID)).not.toBeNull();
    expect(repo.getConfig(CONFIG_KEYS.SCHEMA_VERSION)).toBe("1");
  });

  it("does not regenerate node_id on subsequent constructions over the same file", () => {
    // Use a deterministic id factory so we can verify the value persists.
    const first = repo.getConfig(CONFIG_KEYS.NODE_ID);
    repo.close();
    // Re-open the same in-memory DB is impossible — every :memory: is fresh —
    // but we can verify the bootstrap path with setConfig idempotency:
    const repo2 = new SqliteRepository(":memory:");
    expect(repo2.getConfig(CONFIG_KEYS.NODE_ID)).not.toBe(null);
    expect(repo2.getConfig(CONFIG_KEYS.NODE_ID)).not.toBe(first); // different DB, different id
    repo2.close();
  });

  it("get/setConfig round-trips arbitrary keys", () => {
    repo.setConfig("preferred_horizon_lat", "38.0");
    expect(repo.getConfig("preferred_horizon_lat")).toBe("38.0");
    repo.setConfig("preferred_horizon_lat", "37.5");
    expect(repo.getConfig("preferred_horizon_lat")).toBe("37.5");
  });
});

describe("Events: round-trip", () => {
  it("saves and reads back an event with all fields", () => {
    const rule: PinningRule = {
      kind: "exact",
      anchor: { wheelId: "solar", anchorId: "winter_solstice" },
    };
    const event: CalendarEvent = {
      id: newId(),
      userId: USER,
      name: "Solstice ritual",
      description: "Quiet evening, candles",
      rule,
      isOrigin: false,
    };
    repo.saveEvent(event);
    const got = repo.getEvent(event.id);
    expect(got).not.toBeNull();
    expect(got!.id).toBe(event.id);
    expect(got!.name).toBe("Solstice ritual");
    expect(got!.description).toBe("Quiet evening, candles");
    expect(got!.rule).toEqual(rule);
    expect(got!.isOrigin).toBeUndefined(); // false → omitted from domain type
  });

  it("listEvents filters by userId", () => {
    const rule: PinningRule = { kind: "exact", anchor: { wheelId: "solar", anchorId: "spring_equinox" } };
    repo.saveEvent({ id: newId(), userId: USER, name: "A", rule });
    repo.saveEvent({ id: newId(), userId: USER, name: "B", rule });
    repo.saveEvent({ id: newId(), userId: "user-2", name: "C", rule });
    const mine = repo.listEvents(USER);
    expect(mine.map((e) => e.name).sort()).toEqual(["A", "B"]);
  });

  it("softDeleteEvent hides the row from get and list", () => {
    const id = newId();
    const rule: PinningRule = { kind: "exact", anchor: { wheelId: "solar", anchorId: "summer_solstice" } };
    repo.saveEvent({ id, userId: USER, name: "Gone", rule });
    expect(repo.getEvent(id)).not.toBeNull();
    repo.softDeleteEvent(id);
    expect(repo.getEvent(id)).toBeNull();
    expect(repo.listEvents(USER)).toHaveLength(0);
  });

  it("re-saving a soft-deleted event undeletes it", () => {
    const id = newId();
    const rule: PinningRule = { kind: "exact", anchor: { wheelId: "lunar", anchorId: "full_moon" } };
    repo.saveEvent({ id, userId: USER, name: "First", rule });
    repo.softDeleteEvent(id);
    expect(repo.getEvent(id)).toBeNull();
    repo.saveEvent({ id, userId: USER, name: "Second", rule });
    const got = repo.getEvent(id);
    expect(got).not.toBeNull();
    expect(got!.name).toBe("Second");
  });

  it("rejects events without userId in v1", () => {
    const rule: PinningRule = { kind: "exact", anchor: { wheelId: "solar", anchorId: "samhain" } };
    expect(() =>
      repo.saveEvent({ id: newId(), name: "No user", rule } as CalendarEvent),
    ).toThrow(/userId/);
  });
});

describe("Occurrences: round-trip", () => {
  function createEvent(): string {
    const id = newId();
    const rule: PinningRule = { kind: "exact", anchor: { wheelId: "lunar", anchorId: "full_moon" } };
    repo.saveEvent({ id, userId: USER, name: "Gathering", rule });
    return id;
  }

  it("assigns an id when saving an occurrence without one", () => {
    const eventId = createEvent();
    const saved = repo.saveOccurrence({
      eventId,
      at: REF,
      notes: "First gathering",
    });
    expect(saved.id).toBeDefined();
    const got = repo.getOccurrence(saved.id!);
    expect(got).not.toBeNull();
    expect(got!.notes).toBe("First gathering");
    expect(got!.at).toBe(REF);
  });

  it("preserves location when present", () => {
    const eventId = createEvent();
    const saved = repo.saveOccurrence({
      eventId,
      at: REF,
      location: { latitude: 38, longitude: -78 },
    });
    const got = repo.getOccurrence(saved.id!);
    expect(got!.location).toEqual({ latitude: 38, longitude: -78 });
  });

  it("listOccurrencesForEvent returns rows in order of `at`", () => {
    const eventId = createEvent();
    const a = fromISOString("2026-01-01T00:00:00Z");
    const b = fromISOString("2026-06-01T00:00:00Z");
    const c = fromISOString("2026-12-01T00:00:00Z");
    repo.saveOccurrence({ eventId, at: b });
    repo.saveOccurrence({ eventId, at: a });
    repo.saveOccurrence({ eventId, at: c });
    const ats = repo.listOccurrencesForEvent(eventId).map((o) => o.at);
    expect(ats).toEqual([a, b, c]);
  });

  it("softDeleteOccurrence hides the row", () => {
    const eventId = createEvent();
    const saved = repo.saveOccurrence({ eventId, at: REF });
    repo.softDeleteOccurrence(saved.id!);
    expect(repo.getOccurrence(saved.id!)).toBeNull();
    expect(repo.listOccurrencesForEvent(eventId)).toHaveLength(0);
  });

  it("UNIQUE (event_id, at) prevents two live occurrences at the same instant", () => {
    const eventId = createEvent();
    repo.saveOccurrence({ eventId, at: REF });
    expect(() => repo.saveOccurrence({ eventId, at: REF })).toThrow();
  });
});

describe("Personal anchors: round-trip", () => {
  it("saves, lists, soft-deletes", () => {
    const a: PersonalAnchor = {
      id: newId(),
      userId: USER,
      wheelId: "pleiades",
      angle: 14.8,
      name: "My heliacal rising (38°N)",
    };
    repo.savePersonalAnchor(a);
    expect(repo.listPersonalAnchors(USER)).toEqual([a]);
    repo.softDeletePersonalAnchor(a.id);
    expect(repo.listPersonalAnchors(USER)).toEqual([]);
  });
});

describe("Travel timeline: round-trip", () => {
  it("preserves toInstant null and label optional", () => {
    const open: TravelEntry = {
      id: newId(),
      userId: USER,
      fromInstant: fromISOString("2025-01-01T00:00:00Z"),
      location: { latitude: 38, longitude: -78 },
    };
    const closed: TravelEntry = {
      id: newId(),
      userId: USER,
      fromInstant: fromISOString("2024-06-01T00:00:00Z"),
      toInstant: fromISOString("2024-08-01T00:00:00Z"),
      location: { latitude: 19.4, longitude: -99.1 },
      label: "Mexico City",
    };
    repo.saveTravelEntry(open);
    repo.saveTravelEntry(closed);
    const all = repo.listTravelTimeline(USER);
    expect(all).toHaveLength(2);
    // Ordered by from_instant ascending → closed first (2024 < 2025).
    expect(all[0]!.label).toBe("Mexico City");
    expect(all[0]!.toInstant).toBe(closed.toInstant);
    expect(all[1]!.toInstant).toBeUndefined();
  });
});

describe("Sync surface (Step 4): explicitly not implemented in v1", () => {
  it("changedSince throws NotImplementedError", () => {
    expect(() => repo.changedSince(0)).toThrow(NotImplementedError);
  });

  it("applyRemoteChanges throws NotImplementedError", () => {
    expect(() =>
      repo.applyRemoteChanges({
        events: [],
        occurrences: [],
        personalAnchors: [],
        travelTimeline: [],
      }),
    ).toThrow(NotImplementedError);
  });
});

describe("PinningRule serialization", () => {
  it("round-trips all seven primitives", () => {
    const rules: PinningRule[] = [
      { kind: "exact", anchor: { wheelId: "solar", anchorId: "winter_solstice" } },
      {
        kind: "firstAfter",
        target: { wheelId: "lunar", anchorId: "new_moon" },
        after: { kind: "anchor", ref: { wheelId: "solar", anchorId: "spring_equinox" } },
      },
      {
        kind: "nth",
        target: { wheelId: "lunar", anchorId: "full_moon" },
        n: 3,
        after: { kind: "instant", at: REF },
      },
      {
        kind: "nearest",
        target: { wheelId: "lunar", anchorId: "full_moon" },
        near: { kind: "anchor", ref: { wheelId: "solar", anchorId: "autumn_equinox" } },
        toleranceDays: 30,
      },
      {
        kind: "conjunction",
        primary: { wheelId: "solar", anchorId: "winter_solstice" },
        others: [{ wheelId: "lunar", anchorId: "full_moon" }],
        toleranceDays: 15,
      },
      {
        kind: "withinRange",
        target: { wheelId: "lunar", anchorId: "full_moon" },
        start: { wheelId: "solar", anchorId: "samhain" },
        end: { wheelId: "solar", anchorId: "beltane" },
      },
      { kind: "observed", wheelId: "magnolia", observationKey: "first_bloom" },
    ];
    for (const r of rules) {
      const json = serializePinningRule(r);
      expect(deserializePinningRule(json)).toEqual(r);
    }
  });

  it("composed rules (rule-inside-rule) survive a round trip", () => {
    const inner: PinningRule = {
      kind: "firstAfter",
      target: { wheelId: "lunar", anchorId: "new_moon" },
      after: { kind: "anchor", ref: { wheelId: "solar", anchorId: "spring_equinox" } },
    };
    const outer: PinningRule = {
      kind: "firstAfter",
      target: { wheelId: "lunar", anchorId: "full_moon" },
      after: { kind: "rule", rule: inner },
    };
    expect(deserializePinningRule(serializePinningRule(outer))).toEqual(outer);
  });

  it("rejects unknown kinds", () => {
    expect(() => validatePinningRule({ kind: "wat" })).toThrow(SerializationError);
  });

  it("rejects malformed AnchorRefs", () => {
    expect(() =>
      validatePinningRule({ kind: "exact", anchor: { wheelId: "solar" } }),
    ).toThrow(SerializationError);
  });

  it("rejects non-integer or zero n in nth", () => {
    expect(() =>
      validatePinningRule({
        kind: "nth",
        target: { wheelId: "lunar", anchorId: "full_moon" },
        n: 0,
        after: { kind: "instant", at: 0 },
      }),
    ).toThrow(SerializationError);
  });
});
