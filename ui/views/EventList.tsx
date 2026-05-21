import { useEffect, useMemo, useState } from "react";
import {
  now,
  resolve,
  toGregorianUTC,
  type CalendarEvent,
  type Instant,
  type PinningRule,
  type TimeReference,
} from "../../src/index.js";
import { setEditingEventId, useEditingEventId } from "../editing.js";
import { removeEvent, useEvents } from "../store.js";
import { wheelRegistry } from "../wheels.js";

/**
 * List of created events with each event's next resolved occurrence,
 * plus Edit and Remove buttons. Editing routes through the parent
 * component (App), which sets the editingEventId state that the form
 * reads. Re-resolves once an hour to keep "next occurrence" honest as
 * time passes.
 */

export function EventList() {
  const events = useEvents();
  const editingEventId = useEditingEventId();
  const [from, setFrom] = useState<Instant>(() => now());

  useEffect(() => {
    const id = window.setInterval(() => setFrom(now()), 3_600_000);
    return () => window.clearInterval(id);
  }, []);

  if (events.length === 0) {
    return (
      <section className="wheel-card event-list">
        <div className="wheel-kind">your events</div>
        <h2>No events yet</h2>
        <p className="hint">
          Use the form above to add one. Events appear on the Year Ahead ring
          and stay in your browser between visits.
        </p>
      </section>
    );
  }

  return (
    <section className="wheel-card event-list">
      <div className="wheel-kind">your events</div>
      <h2>Events</h2>
      <ul>
        {events.map((event) => (
          <EventRow
            key={event.id}
            event={event}
            from={from}
            isEditing={editingEventId === event.id}
          />
        ))}
      </ul>
    </section>
  );
}

interface EventRowProps {
  event: CalendarEvent;
  from: Instant;
  isEditing: boolean;
}

function EventRow({ event, from, isEditing }: EventRowProps) {
  const nextAt = useMemo(() => {
    try {
      return resolve(event.rule, { registry: wheelRegistry, from })?.at ?? null;
    } catch {
      return null;
    }
  }, [event.rule, from]);

  return (
    <li className={isEditing ? "event-row-editing" : ""}>
      <div className="event-row-main">
        <div>
          <div className="event-name">{event.name}</div>
          <div className="event-kind">{describeRule(event.rule)}</div>
          {event.description && <div className="event-desc">{event.description}</div>}
        </div>
        <div className="event-row-actions">
          <button type="button" className="edit" onClick={() => setEditingEventId(event.id)}>
            edit
          </button>
          <button type="button" className="remove" onClick={() => removeEvent(event.id)}>
            remove
          </button>
        </div>
      </div>
      <div className="event-next">
        Next: {nextAt ? formatGregorian(nextAt) : "no occurrence in the foreseeable window"}
      </div>
    </li>
  );
}

function describeRule(rule: PinningRule): string {
  switch (rule.kind) {
    case "exact":
      return `exact: ${ref(rule.anchor)}`;
    case "firstAfter":
      return `first ${ref(rule.target)} after ${timeRef(rule.after)}`;
    case "nth":
      return `${rule.n}th ${ref(rule.target)} after ${timeRef(rule.after)}`;
    case "nearest":
      return `${ref(rule.target)} nearest ${timeRef(rule.near)} (±${rule.toleranceDays}d)`;
    case "conjunction":
      return `${ref(rule.primary)} + ${rule.others.map(ref).join(" + ")} within ${rule.toleranceDays}d`;
    case "withinRange":
      return `${ref(rule.target)} between ${ref(rule.start)} and ${ref(rule.end)}`;
    case "observed":
      return `observed: ${rule.wheelId} / ${rule.observationKey}`;
  }
}

function ref(r: { wheelId: string; anchorId: string }): string {
  return `${r.wheelId}.${r.anchorId}`;
}

function timeRef(t: TimeReference): string {
  switch (t.kind) {
    case "instant":
      return formatGregorian(t.at);
    case "anchor":
      return ref(t.ref);
    case "rule":
      return "(composed rule)";
  }
}

function formatGregorian(at: Instant): string {
  const g = toGregorianUTC(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${g.year}-${pad(g.month)}-${pad(g.day)} ${pad(g.hour)}:${pad(g.minute)} UTC`;
}
