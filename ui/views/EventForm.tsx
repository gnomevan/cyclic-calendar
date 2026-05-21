import { useState } from "react";
import {
  type AnchorRef,
  type PinningRule,
  type TimeReference,
} from "../../src/index.js";
import { AnchorPicker } from "../components/AnchorPicker.js";
import { TimeRefPicker } from "../components/TimeRefPicker.js";
import { addEvent } from "../store.js";

/**
 * Event creation form. The seven pinning-rule kinds map onto seven
 * conditional field groups; picking a kind shows the fields for that
 * kind only.
 *
 * The form's working state is a single `RuleDraft` with every possible
 * field optional. On submit, `buildRule` walks the active kind and
 * either returns a `PinningRule` or `null` (= still incomplete).
 *
 * Composition (TimeReference "rule") is not exposed in the picker;
 * users who need it can author the rule JSON directly in storage once
 * we add an import flow, or wait for the recursive form in 3.c.5.
 */

const KIND_LABELS: Record<PinningRule["kind"], string> = {
  exact: "Exact — at this anchor",
  firstAfter: "First after — first X after Y",
  nth: "Nth — the Nth X after Y",
  nearest: "Nearest — X closest to Y",
  conjunction: "Conjunction — multiple anchors aligned",
  withinRange: "Within range — X between two anchors",
  observed: "Observed — logged by hand",
};

interface RuleDraft {
  kind: PinningRule["kind"];
  anchor?: AnchorRef;
  target?: AnchorRef;
  after?: TimeReference;
  n?: number;
  near?: TimeReference;
  toleranceDays?: number;
  primary?: AnchorRef;
  others?: AnchorRef[];
  start?: AnchorRef;
  end?: AnchorRef;
  wheelId?: string;
  observationKey?: string;
}

export function EventForm() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isOrigin, setIsOrigin] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>({ kind: "exact" });
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function reset() {
    setName("");
    setDescription("");
    setIsOrigin(false);
    setDraft({ kind: "exact" });
    setError(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    const rule = buildRule(draft);
    if (!rule) {
      setError("Rule is incomplete — fill every field for the chosen kind.");
      return;
    }
    addEvent({
      name: name.trim(),
      ...(description.trim() && { description: description.trim() }),
      rule,
      ...(isOrigin && { isOrigin: true }),
    });
    reset();
  }

  return (
    <section className="wheel-card event-form">
      <div className="wheel-kind">create</div>
      <h2>New Event</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Solstice gathering"
            required
          />
        </label>

        <label>
          Description (optional)
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
          />
        </label>

        <label className="inline">
          <input
            type="checkbox"
            checked={isOrigin}
            onChange={(e) => setIsOrigin(e.target.checked)}
          />
          Treat as origin (this event can anchor counts)
        </label>

        <label>
          Rule
          <select
            value={draft.kind}
            onChange={(e) => setDraft({ kind: e.target.value as PinningRule["kind"] })}
          >
            {Object.entries(KIND_LABELS).map(([kind, label]) => (
              <option key={kind} value={kind}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <RuleFields draft={draft} update={update} />

        {error && <p className="error">{error}</p>}

        <button type="submit">Add event</button>
      </form>
    </section>
  );
}

interface RuleFieldsProps {
  draft: RuleDraft;
  update: <K extends keyof RuleDraft>(key: K, value: RuleDraft[K]) => void;
}

function RuleFields({ draft, update }: RuleFieldsProps) {
  switch (draft.kind) {
    case "exact":
      return (
        <AnchorPicker
          label="Anchor"
          value={draft.anchor}
          onChange={(v) => update("anchor", v)}
        />
      );

    case "firstAfter":
      return (
        <>
          <AnchorPicker
            label="Target anchor (the X)"
            value={draft.target}
            onChange={(v) => update("target", v)}
          />
          <TimeRefPicker
            label="After (the Y)"
            value={draft.after}
            onChange={(v) => update("after", v)}
          />
        </>
      );

    case "nth":
      return (
        <>
          <AnchorPicker
            label="Target anchor (the X)"
            value={draft.target}
            onChange={(v) => update("target", v)}
          />
          <label>
            N (1 = the first occurrence)
            <input
              type="number"
              min={1}
              step={1}
              value={draft.n ?? ""}
              onChange={(e) => update("n", e.target.value ? Number(e.target.value) : undefined)}
            />
          </label>
          <TimeRefPicker
            label="After (the Y)"
            value={draft.after}
            onChange={(v) => update("after", v)}
          />
        </>
      );

    case "nearest":
      return (
        <>
          <AnchorPicker
            label="Target anchor (the X)"
            value={draft.target}
            onChange={(v) => update("target", v)}
          />
          <TimeRefPicker
            label="Near (centerpoint)"
            value={draft.near}
            onChange={(v) => update("near", v)}
          />
          <label>
            Tolerance (days)
            <input
              type="number"
              min={0}
              step={1}
              value={draft.toleranceDays ?? ""}
              onChange={(e) =>
                update("toleranceDays", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        </>
      );

    case "conjunction":
      return (
        <>
          <AnchorPicker
            label="Primary anchor"
            value={draft.primary}
            onChange={(v) => update("primary", v)}
          />
          <OthersPicker
            others={draft.others ?? []}
            onChange={(v) => update("others", v)}
          />
          <label>
            Tolerance (days)
            <input
              type="number"
              min={0}
              step={1}
              value={draft.toleranceDays ?? ""}
              onChange={(e) =>
                update("toleranceDays", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        </>
      );

    case "withinRange":
      return (
        <>
          <AnchorPicker
            label="Target anchor"
            value={draft.target}
            onChange={(v) => update("target", v)}
          />
          <AnchorPicker
            label="Range start"
            value={draft.start}
            onChange={(v) => update("start", v)}
          />
          <AnchorPicker
            label="Range end"
            value={draft.end}
            onChange={(v) => update("end", v)}
          />
        </>
      );

    case "observed":
      return (
        <>
          <label>
            Wheel id
            <input
              type="text"
              value={draft.wheelId ?? ""}
              onChange={(e) => update("wheelId", e.target.value || undefined)}
              placeholder="e.g. magnolia"
            />
          </label>
          <label>
            Observation key
            <input
              type="text"
              value={draft.observationKey ?? ""}
              onChange={(e) => update("observationKey", e.target.value || undefined)}
              placeholder="e.g. first_bloom"
            />
          </label>
        </>
      );
  }
}

interface OthersPickerProps {
  others: AnchorRef[];
  onChange: (next: AnchorRef[]) => void;
}

function OthersPicker({ others, onChange }: OthersPickerProps) {
  function addSlot() {
    onChange([...others, { wheelId: "", anchorId: "" }]);
  }
  function removeAt(i: number) {
    onChange(others.filter((_, idx) => idx !== i));
  }
  function setAt(i: number, ref: AnchorRef | undefined) {
    if (!ref) return;
    onChange(others.map((o, idx) => (idx === i ? ref : o)));
  }
  return (
    <div className="others-picker">
      <div className="others-header">
        <span>Other anchors (must coincide)</span>
        <button type="button" onClick={addSlot}>
          + add
        </button>
      </div>
      {others.length === 0 && <p className="hint">No additional anchors yet.</p>}
      {others.map((ref, i) => (
        <div key={i} className="others-row">
          <AnchorPicker value={ref.wheelId ? ref : undefined} onChange={(v) => setAt(i, v)} />
          <button type="button" onClick={() => removeAt(i)}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

function buildRule(draft: RuleDraft): PinningRule | null {
  switch (draft.kind) {
    case "exact":
      return draft.anchor ? { kind: "exact", anchor: draft.anchor } : null;

    case "firstAfter":
      return draft.target && draft.after
        ? { kind: "firstAfter", target: draft.target, after: draft.after }
        : null;

    case "nth":
      return draft.target && draft.after && draft.n !== undefined && draft.n >= 1
        ? { kind: "nth", target: draft.target, n: draft.n, after: draft.after }
        : null;

    case "nearest":
      return draft.target && draft.near && typeof draft.toleranceDays === "number"
        ? {
            kind: "nearest",
            target: draft.target,
            near: draft.near,
            toleranceDays: draft.toleranceDays,
          }
        : null;

    case "conjunction":
      if (!draft.primary || typeof draft.toleranceDays !== "number") return null;
      if (!draft.others || draft.others.length === 0) return null;
      if (draft.others.some((o) => !o.wheelId || !o.anchorId)) return null;
      return {
        kind: "conjunction",
        primary: draft.primary,
        others: draft.others,
        toleranceDays: draft.toleranceDays,
      };

    case "withinRange":
      return draft.target && draft.start && draft.end
        ? { kind: "withinRange", target: draft.target, start: draft.start, end: draft.end }
        : null;

    case "observed":
      return draft.wheelId && draft.observationKey
        ? { kind: "observed", wheelId: draft.wheelId, observationKey: draft.observationKey }
        : null;
  }
}
