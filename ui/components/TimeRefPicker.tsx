import {
  instantFromEpochMs,
  type AnchorRef,
  type TimeReference,
} from "../../src/index.js";
import { AnchorPicker } from "./AnchorPicker.js";

/**
 * Picker that produces a `TimeReference`. Supports `instant` and
 * `anchor` variants. The `rule` variant (a nested PinningRule) is
 * intentionally omitted in v1 — supporting it cleanly needs a
 * recursive form, and `instant` + `anchor` covers nearly all simple
 * authoring cases.
 *
 * Datetime input is read as the user's local time and converted to a
 * UTC epoch Instant — the same convention as `new Date(localString)`.
 */

interface TimeRefPickerProps {
  value: TimeReference | undefined;
  onChange: (next: TimeReference | undefined) => void;
  label?: string;
}

export function TimeRefPicker({ value, onChange, label }: TimeRefPickerProps) {
  function handleKind(kind: TimeReference["kind"]) {
    if (kind === "instant") {
      // Default the field to "now" so the form is in a valid state.
      onChange({ kind: "instant", at: instantFromEpochMs(Date.now()) });
    } else if (kind === "anchor") {
      onChange(undefined);
    }
  }

  return (
    <fieldset className="timeref-picker">
      {label && <legend>{label}</legend>}
      <select
        value={value?.kind ?? ""}
        onChange={(e) => handleKind(e.target.value as TimeReference["kind"])}
      >
        <option value="" disabled>
          reference…
        </option>
        <option value="anchor">A wheel anchor</option>
        <option value="instant">A specific date/time</option>
      </select>

      {value?.kind === "instant" && (
        <input
          type="datetime-local"
          value={toDatetimeLocal(value.at)}
          onChange={(e) => {
            const parsed = new Date(e.target.value);
            if (Number.isNaN(parsed.getTime())) return;
            onChange({ kind: "instant", at: instantFromEpochMs(parsed.getTime()) });
          }}
        />
      )}

      {value?.kind === "anchor" && (
        <AnchorPicker
          value={value.ref}
          onChange={(ref: AnchorRef | undefined) => {
            if (!ref) return;
            onChange({ kind: "anchor", ref });
          }}
        />
      )}
    </fieldset>
  );
}

function toDatetimeLocal(at: number): string {
  // datetime-local wants YYYY-MM-DDTHH:mm in *local* time, no zone suffix.
  const d = new Date(at);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}
