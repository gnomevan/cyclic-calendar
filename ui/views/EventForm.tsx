import { useEffect, useMemo, useRef, useState } from "react";
import {
  fromGregorianUTC,
  lunarWheel,
  now,
  resolve,
  solarWheel,
  toGregorianUTC,
  type AnchorRef,
  type Instant,
  type PinningRule,
  type TimeReference,
} from "../../src/index.js";
import { AnchorPicker } from "../components/AnchorPicker.js";
import { phaseName } from "../components/MoonGlyph.js";
import { TimeRefPicker } from "../components/TimeRefPicker.js";
import {
  clearEditingState,
  setEditingEventId,
  useCreatingFromDay,
  useEditingEventId,
} from "../editing.js";
import { addEvent, updateEvent, useEvents } from "../store.js";
import { wheelRegistry } from "../wheels.js";

/**
 * Event creation form. Two modes:
 *
 * 1. **Simple (click-from-day)**: pre-checked checkboxes for attaching
 *    the event to the lunar phase, solar position, and Gregorian date
 *    at the clicked moment. Each checked attachment becomes a rule,
 *    and the resulting event's `rule` is the union (`anyOf`) of all
 *    attachments.
 *
 * 2. **Advanced (kind picker)**: the original interface — pick one of
 *    the seven pinning-rule kinds and configure its fields. Still
 *    available via the "Add event" entry and for editing rules that
 *    don't fit the simple shape.
 *
 * The form's working state is a single `RuleDraft` with every possible
 * field optional. On submit, `buildRule` walks the active kind and
 * either returns a `PinningRule` or `null` (= still incomplete).
 */

const KIND_LABELS: Record<PinningRule["kind"], string> = {
  exact: "Exact — at this anchor",
  firstAfter: "First after — first X after Y",
  nth: "Nth — the Nth X after Y",
  nearest: "Nearest — X closest to Y",
  conjunction: "Conjunction — multiple anchors aligned",
  withinRange: "Within range — X between two anchors",
  observed: "Observed — logged by hand",
  atAngle: "At angle — pin to a wheel angle directly",
  gregorianDate: "Gregorian date — recur on a calendar date",
  anyOf: "Any of — union of multiple rules",
};

interface AttachmentChecks {
  lunar: boolean;
  solar: boolean;
  gregorian: boolean;
}

const DEFAULT_ATTACHMENTS: AttachmentChecks = {
  lunar: true,
  solar: true,
  gregorian: true,
};

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

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
  angle?: number;      // atAngle
  month?: number;      // gregorianDate
  day?: number;        // gregorianDate
}

export function EventForm() {
  const events = useEvents();
  const editingEventId = useEditingEventId();
  const creatingFromDay = useCreatingFromDay();
  const editingEvent = editingEventId
    ? events.find((e) => e.id === editingEventId) ?? null
    : null;

  const isEditing = editingEventId !== null;
  const isOpen = editingEventId !== null || creatingFromDay !== null;

  const dialogRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Close on Escape while the modal is open.
  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        clearEditingState();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen]);

  // Focus the name input when the modal opens.
  useEffect(() => {
    if (isOpen) {
      const id = window.setTimeout(() => nameRef.current?.focus(), 30);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [isOpen]);

  function handleBackdropClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) clearEditingState();
  }

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isOrigin, setIsOrigin] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>({ kind: "exact" });
  const [attachments, setAttachments] = useState<AttachmentChecks>(DEFAULT_ATTACHMENTS);
  const [error, setError] = useState<string | null>(null);

  // Decide whether the form should show the simple checkbox UI or the
  // advanced kind picker. Simple mode kicks in when:
  //   - the user clicked an empty day to create (creatingFromDay set)
  //   - they're editing an event whose rule matches the click-from-day
  //     shape (atAngle on lunar/solar and/or gregorianDate, optionally
  //     wrapped in anyOf)
  const simpleSnapshot = useMemo(() => {
    if (editingEvent) {
      return extractSimpleShape(editingEvent.rule);
    }
    if (creatingFromDay) {
      return {
        attachments: DEFAULT_ATTACHMENTS,
        dayCycles: computeDayCycles(creatingFromDay),
      };
    }
    return null;
  }, [editingEvent, creatingFromDay]);

  const isSimpleMode = simpleSnapshot !== null;
  const dayCycles = simpleSnapshot?.dayCycles ?? null;

  // When the editing target changes, pull fields into the form. If the
  // rule matches the simple shape, populate attachments; otherwise
  // populate the advanced draft.
  useEffect(() => {
    if (editingEvent) {
      setName(editingEvent.name);
      setDescription(editingEvent.description ?? "");
      setIsOrigin(editingEvent.isOrigin ?? false);
      const simple = extractSimpleShape(editingEvent.rule);
      if (simple) {
        setAttachments(simple.attachments);
        setDraft({ kind: "exact" }); // advanced draft idle
      } else {
        setDraft(ruleToDraft(editingEvent.rule));
      }
      setError(null);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => nameRef.current?.focus(), 350);
    } else if (!creatingFromDay) {
      reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingEventId]);

  // When click-from-day creation starts, reset the form and seed
  // attachments to all-checked.
  useEffect(() => {
    if (creatingFromDay) {
      reset();
      setAttachments(DEFAULT_ATTACHMENTS);
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      window.setTimeout(() => nameRef.current?.focus(), 350);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatingFromDay]);

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

  function handleCancel() {
    clearEditingState();
    reset();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    let rule: PinningRule | null;
    if (isSimpleMode && dayCycles) {
      rule = buildAttachmentRule(attachments, dayCycles);
      if (!rule) {
        setError("Pick at least one cycle to attach the event to.");
        return;
      }
    } else {
      rule = buildRule(draft);
      if (!rule) {
        setError("Rule is incomplete — fill every field for the chosen kind.");
        return;
      }
    }

    const input = {
      name: name.trim(),
      ...(description.trim() && { description: description.trim() }),
      rule,
      ...(isOrigin && { isOrigin: true }),
    };
    if (editingEventId) {
      updateEvent(editingEventId, input);
    } else {
      addEvent(input);
    }
    clearEditingState();
    reset();
  }

  const headingKind = isEditing
    ? "edit"
    : creatingFromDay
    ? "new on day"
    : "create";
  const headingTitle = isEditing ? "Edit event" : "New event";

  // The form is now a popup modal. Render nothing when the user
  // hasn't picked an event to edit or a day to create on.
  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="event-form-backdrop"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="event-form-title"
    >
    <section ref={formRef} className="wheel-card event-form">
      <button
        type="button"
        className="event-form-close"
        aria-label="Close"
        onClick={() => clearEditingState()}
      >
        ×
      </button>
      <div className="wheel-kind">{headingKind}</div>
      <h2 id="event-form-title">{headingTitle}</h2>
      <form onSubmit={handleSubmit}>
        <label>
          Name
          <input
            ref={nameRef}
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

        {isSimpleMode && dayCycles ? (
          <AttachmentChecklist
            cycles={dayCycles}
            attachments={attachments}
            onChange={setAttachments}
          />
        ) : (
          <>
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
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="event-form-buttons">
          <button type="submit">
            {isEditing ? "Update event" : "Add event"}
          </button>
          <button type="button" className="event-form-cancel" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
    </div>
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

    case "atAngle":
      return (
        <>
          <label>
            Wheel id
            <input
              type="text"
              value={draft.wheelId ?? ""}
              onChange={(e) => update("wheelId", e.target.value || undefined)}
              placeholder="solar / lunar / pleiades"
            />
          </label>
          <label>
            Angle (degrees, 0–360)
            <input
              type="number"
              min={0}
              max={360}
              step={0.1}
              value={draft.angle ?? ""}
              onChange={(e) =>
                update("angle", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        </>
      );

    case "gregorianDate":
      return (
        <>
          <label>
            Month (1–12)
            <input
              type="number"
              min={1}
              max={12}
              step={1}
              value={draft.month ?? ""}
              onChange={(e) =>
                update("month", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
          <label>
            Day (1–31)
            <input
              type="number"
              min={1}
              max={31}
              step={1}
              value={draft.day ?? ""}
              onChange={(e) =>
                update("day", e.target.value ? Number(e.target.value) : undefined)
              }
            />
          </label>
        </>
      );

    case "anyOf":
      return (
        <p className="hint">
          This event is attached to multiple cycles. Editing the attachment
          set isn't supported in advanced mode yet — delete and recreate
          if you need to change which cycles it lives on.
        </p>
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

    case "atAngle":
      return draft.wheelId && typeof draft.angle === "number"
        ? { kind: "atAngle", wheelId: draft.wheelId, angle: draft.angle }
        : null;

    case "gregorianDate":
      return typeof draft.month === "number" &&
        typeof draft.day === "number" &&
        draft.month >= 1 &&
        draft.month <= 12 &&
        draft.day >= 1 &&
        draft.day <= 31
        ? { kind: "gregorianDate", month: draft.month, day: draft.day }
        : null;

    case "anyOf":
      // anyOf is currently authored only via the simple click-from-day
      // flow. In advanced mode the user can pick this kind, but we
      // don't yet expose a sub-rule editor — so the rule stays
      // unbuildable from this path.
      return null;
  }
}

/**
 * Decompose a saved PinningRule back into draft fields so the form
 * can edit an existing event. The form's draft has every possible
 * field as optional; this picks the ones for the rule's kind and
 * leaves the rest unset.
 */
function ruleToDraft(rule: PinningRule): RuleDraft {
  switch (rule.kind) {
    case "exact":
      return { kind: "exact", anchor: rule.anchor };
    case "firstAfter":
      return { kind: "firstAfter", target: rule.target, after: rule.after };
    case "nth":
      return { kind: "nth", target: rule.target, n: rule.n, after: rule.after };
    case "nearest":
      return {
        kind: "nearest",
        target: rule.target,
        near: rule.near,
        toleranceDays: rule.toleranceDays,
      };
    case "conjunction":
      return {
        kind: "conjunction",
        primary: rule.primary,
        others: rule.others,
        toleranceDays: rule.toleranceDays,
      };
    case "withinRange":
      return {
        kind: "withinRange",
        target: rule.target,
        start: rule.start,
        end: rule.end,
      };
    case "observed":
      return {
        kind: "observed",
        wheelId: rule.wheelId,
        observationKey: rule.observationKey,
      };
    case "atAngle":
      return { kind: "atAngle", wheelId: rule.wheelId, angle: rule.angle };
    case "gregorianDate":
      return { kind: "gregorianDate", month: rule.month, day: rule.day };
    case "anyOf":
      // The advanced kind picker doesn't support editing anyOf (the
      // form would need a recursive list). For now we surface it as a
      // read-only kind label; the user can delete and recreate.
      return { kind: "anyOf" };
  }
}

/* ----- Simple click-from-day creation helpers ------------------------ */

interface DayCycles {
  lunarAngle: number;
  solarAngle: number;
  month: number;
  day: number;
}

function computeDayCycles(at: Instant): DayCycles {
  const g = toGregorianUTC(at);
  return {
    lunarAngle: lunarWheel.positionAt(at),
    solarAngle: solarWheel.positionAt(at),
    month: g.month,
    day: g.day,
  };
}

/**
 * Recognize the click-from-day rule shape: a (possibly anyOf-wrapped)
 * collection of atAngle-on-lunar, atAngle-on-solar, and/or
 * gregorianDate rules. Returns the implied attachments and a
 * representative DayCycles, or null if the rule isn't this shape.
 *
 * Missing cycle values (e.g. solarAngle when the rule has only a
 * lunar attachment) are computed from a reference instant — either
 * noon UTC on the gregorianDate this year, or the first resolution
 * of the rule from now. That way checking a previously-unchecked
 * attachment gives a sensible default value.
 */
function extractSimpleShape(rule: PinningRule): {
  attachments: AttachmentChecks;
  dayCycles: DayCycles;
} | null {
  const inner: PinningRule[] = rule.kind === "anyOf" ? rule.rules : [rule];

  let lunar: { angle: number } | null = null;
  let solar: { angle: number } | null = null;
  let gregorian: { month: number; day: number } | null = null;

  for (const r of inner) {
    if (r.kind === "atAngle" && r.wheelId === "lunar") lunar = { angle: r.angle };
    else if (r.kind === "atAngle" && r.wheelId === "solar") solar = { angle: r.angle };
    else if (r.kind === "gregorianDate") gregorian = { month: r.month, day: r.day };
    else return null; // anything else means this isn't the simple shape
  }

  if (!lunar && !solar && !gregorian) return null;

  // Pick a representative instant to fill in missing cycle values.
  const ref = deriveReferenceInstant(rule, gregorian);
  const base = computeDayCycles(ref);

  return {
    attachments: {
      lunar: lunar !== null,
      solar: solar !== null,
      gregorian: gregorian !== null,
    },
    dayCycles: {
      lunarAngle: lunar?.angle ?? base.lunarAngle,
      solarAngle: solar?.angle ?? base.solarAngle,
      month: gregorian?.month ?? base.month,
      day: gregorian?.day ?? base.day,
    },
  };
}

function deriveReferenceInstant(
  rule: PinningRule,
  gregorian: { month: number; day: number } | null,
): Instant {
  // Prefer the gregorian-date noon if available — it's a stable
  // reference that doesn't depend on when "now" is.
  if (gregorian) {
    const todayG = toGregorianUTC(now());
    return fromGregorianUTC({
      year: todayG.year,
      month: gregorian.month,
      day: gregorian.day,
      hour: 12,
      minute: 0,
      second: 0,
    });
  }
  // Otherwise resolve the rule from now and use the first occurrence.
  const r = resolve(rule, { registry: wheelRegistry, from: now() });
  return r?.at ?? now();
}

function buildAttachmentRule(
  attachments: AttachmentChecks,
  cycles: DayCycles,
): PinningRule | null {
  const subRules: PinningRule[] = [];
  if (attachments.lunar) {
    subRules.push({ kind: "atAngle", wheelId: "lunar", angle: cycles.lunarAngle });
  }
  if (attachments.solar) {
    subRules.push({ kind: "atAngle", wheelId: "solar", angle: cycles.solarAngle });
  }
  if (attachments.gregorian) {
    subRules.push({ kind: "gregorianDate", month: cycles.month, day: cycles.day });
  }
  if (subRules.length === 0) return null;
  if (subRules.length === 1) return subRules[0]!;
  return { kind: "anyOf", rules: subRules };
}

interface AttachmentChecklistProps {
  cycles: DayCycles;
  attachments: AttachmentChecks;
  onChange: (next: AttachmentChecks) => void;
}

function AttachmentChecklist({ cycles, attachments, onChange }: AttachmentChecklistProps) {
  function toggle(key: keyof AttachmentChecks) {
    onChange({ ...attachments, [key]: !attachments[key] });
  }

  const lunarLabel = `${phaseName(cycles.lunarAngle)} (${cycles.lunarAngle.toFixed(1)}°)`;
  const solarLabel = `${cycles.solarAngle.toFixed(1)}° on the solar wheel`;
  const gregorianLabel = `${MONTH_NAMES[cycles.month - 1]} ${cycles.day} (recurs annually)`;

  return (
    <fieldset className="attachment-checklist">
      <legend>Attach to (recurs at each checked cycle)</legend>
      <label className="inline">
        <input
          type="checkbox"
          checked={attachments.lunar}
          onChange={() => toggle("lunar")}
        />
        <span>
          <strong>Lunar phase</strong> · {lunarLabel}
        </span>
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={attachments.solar}
          onChange={() => toggle("solar")}
        />
        <span>
          <strong>Solar position</strong> · {solarLabel}
        </span>
      </label>
      <label className="inline">
        <input
          type="checkbox"
          checked={attachments.gregorian}
          onChange={() => toggle("gregorian")}
        />
        <span>
          <strong>Gregorian date</strong> · {gregorianLabel}
        </span>
      </label>
    </fieldset>
  );
}
