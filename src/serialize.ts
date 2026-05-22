/**
 * JSON serialization for PinningRule and its references.
 *
 * The rules in `wheel.ts` form a closed discriminated union, which means
 * the JSON form is just `JSON.stringify(rule)` — but the JSON form is
 * untyped, and untrusted bytes (from storage, from a future sync feed,
 * from import) must not be allowed to flow back in as a PinningRule
 * without being checked first. This module is the type boundary.
 *
 * The validator walks the union exhaustively. Adding a new primitive
 * (ADR-004) means adding a branch here; the type system will not warn,
 * so the rule "if you add a rule kind, add a validator branch" lives in
 * the resolver's switch statement and in this file.
 */

import { instantFromEpochMs } from "./instant.js";
import type {
  AnchorRef,
  PinningRule,
  TimeReference,
} from "./wheel.js";

export class SerializationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SerializationError";
  }
}

/** Serialize a PinningRule to a JSON string. Trivial; the rule is plain data. */
export function serializePinningRule(rule: PinningRule): string {
  return JSON.stringify(rule);
}

/**
 * Parse a JSON string back into a validated PinningRule. Throws
 * SerializationError if the input is not a well-formed rule of a kind
 * the system recognizes.
 */
export function deserializePinningRule(json: string): PinningRule {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new SerializationError(
      `PinningRule JSON is not valid JSON: ${(err as Error).message}`,
    );
  }
  return validatePinningRule(parsed);
}

/**
 * Validate that an unknown value is a PinningRule. Returns the value
 * narrowed to the type on success; throws SerializationError otherwise.
 *
 * This is the single point of truth for "is this thing a real rule." All
 * untrusted PinningRule entry points (storage reads, sync inputs, user
 * imports) must pass through here.
 */
export function validatePinningRule(value: unknown): PinningRule {
  if (!isObject(value) || typeof value.kind !== "string") {
    throw new SerializationError("PinningRule must be an object with a `kind` field");
  }
  switch (value.kind) {
    case "exact":
      return {
        kind: "exact",
        anchor: validateAnchorRef(value.anchor, "exact.anchor"),
      };
    case "firstAfter":
      return {
        kind: "firstAfter",
        target: validateAnchorRef(value.target, "firstAfter.target"),
        after: validateTimeReference(value.after, "firstAfter.after"),
      };
    case "nth":
      if (typeof value.n !== "number" || !Number.isInteger(value.n) || value.n < 1) {
        throw new SerializationError("nth.n must be a positive integer");
      }
      return {
        kind: "nth",
        target: validateAnchorRef(value.target, "nth.target"),
        n: value.n,
        after: validateTimeReference(value.after, "nth.after"),
      };
    case "nearest":
      if (typeof value.toleranceDays !== "number" || value.toleranceDays < 0) {
        throw new SerializationError("nearest.toleranceDays must be a non-negative number");
      }
      return {
        kind: "nearest",
        target: validateAnchorRef(value.target, "nearest.target"),
        near: validateTimeReference(value.near, "nearest.near"),
        toleranceDays: value.toleranceDays,
      };
    case "conjunction":
      if (!Array.isArray(value.others)) {
        throw new SerializationError("conjunction.others must be an array");
      }
      if (typeof value.toleranceDays !== "number" || value.toleranceDays < 0) {
        throw new SerializationError("conjunction.toleranceDays must be a non-negative number");
      }
      return {
        kind: "conjunction",
        primary: validateAnchorRef(value.primary, "conjunction.primary"),
        others: value.others.map((ref, i) =>
          validateAnchorRef(ref, `conjunction.others[${i}]`),
        ),
        toleranceDays: value.toleranceDays,
      };
    case "withinRange":
      return {
        kind: "withinRange",
        target: validateAnchorRef(value.target, "withinRange.target"),
        start: validateAnchorRef(value.start, "withinRange.start"),
        end: validateAnchorRef(value.end, "withinRange.end"),
      };
    case "observed":
      if (typeof value.wheelId !== "string" || typeof value.observationKey !== "string") {
        throw new SerializationError("observed requires string wheelId and observationKey");
      }
      return {
        kind: "observed",
        wheelId: value.wheelId,
        observationKey: value.observationKey,
      };
    case "atAngle":
      if (typeof value.wheelId !== "string") {
        throw new SerializationError("atAngle.wheelId must be a string");
      }
      if (typeof value.angle !== "number" || !Number.isFinite(value.angle)) {
        throw new SerializationError("atAngle.angle must be a finite number");
      }
      return { kind: "atAngle", wheelId: value.wheelId, angle: value.angle };
    case "gregorianDate":
      if (
        typeof value.month !== "number" ||
        !Number.isInteger(value.month) ||
        value.month < 1 ||
        value.month > 12
      ) {
        throw new SerializationError("gregorianDate.month must be an integer 1..12");
      }
      if (
        typeof value.day !== "number" ||
        !Number.isInteger(value.day) ||
        value.day < 1 ||
        value.day > 31
      ) {
        throw new SerializationError("gregorianDate.day must be an integer 1..31");
      }
      return { kind: "gregorianDate", month: value.month, day: value.day };
    case "anyOf":
      if (!Array.isArray(value.rules) || value.rules.length === 0) {
        throw new SerializationError("anyOf.rules must be a non-empty array");
      }
      return {
        kind: "anyOf",
        rules: value.rules.map((r) => validatePinningRule(r)),
      };
    default:
      throw new SerializationError(`Unknown PinningRule kind: ${String(value.kind)}`);
  }
}

function validateAnchorRef(value: unknown, path: string): AnchorRef {
  if (!isObject(value) || typeof value.wheelId !== "string" || typeof value.anchorId !== "string") {
    throw new SerializationError(`${path} must be { wheelId: string, anchorId: string }`);
  }
  return { wheelId: value.wheelId, anchorId: value.anchorId };
}

function validateTimeReference(value: unknown, path: string): TimeReference {
  if (!isObject(value) || typeof value.kind !== "string") {
    throw new SerializationError(`${path} must be an object with a 'kind' field`);
  }
  switch (value.kind) {
    case "instant":
      if (typeof value.at !== "number" || !Number.isFinite(value.at)) {
        throw new SerializationError(`${path}.at must be a finite number (epoch ms)`);
      }
      return { kind: "instant", at: instantFromEpochMs(value.at) };
    case "anchor":
      return { kind: "anchor", ref: validateAnchorRef(value.ref, `${path}.ref`) };
    case "rule":
      return { kind: "rule", rule: validatePinningRule(value.rule) };
    default:
      throw new SerializationError(`Unknown TimeReference kind at ${path}: ${String(value.kind)}`);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
