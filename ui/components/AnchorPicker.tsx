import { useMemo } from "react";
import type { AnchorRef } from "../../src/index.js";
import { ALL_WHEELS } from "../wheels.js";

/**
 * A two-step picker that produces an `AnchorRef`: pick a wheel, then
 * pick an anchor on that wheel. Universal anchors only — personal
 * anchors are not in scope until they have a creation flow of their own.
 */

interface AnchorPickerProps {
  value: AnchorRef | undefined;
  onChange: (next: AnchorRef | undefined) => void;
  /** Optional label rendered above the controls. */
  label?: string;
}

export function AnchorPicker({ value, onChange, label }: AnchorPickerProps) {
  const wheel = useMemo(
    () => ALL_WHEELS.find((w) => w.id === value?.wheelId),
    [value?.wheelId],
  );

  function handleWheel(wheelId: string) {
    const next = ALL_WHEELS.find((w) => w.id === wheelId);
    if (!next || next.anchors.length === 0) {
      onChange(undefined);
      return;
    }
    onChange({ wheelId: next.id, anchorId: next.anchors[0]!.id });
  }

  function handleAnchor(anchorId: string) {
    if (!value) return;
    onChange({ wheelId: value.wheelId, anchorId });
  }

  return (
    <fieldset className="anchor-picker">
      {label && <legend>{label}</legend>}
      <select
        value={value?.wheelId ?? ""}
        onChange={(e) => handleWheel(e.target.value)}
      >
        <option value="" disabled>
          wheel…
        </option>
        {ALL_WHEELS.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </select>
      <select
        value={value?.anchorId ?? ""}
        onChange={(e) => handleAnchor(e.target.value)}
        disabled={!wheel}
      >
        <option value="" disabled>
          anchor…
        </option>
        {wheel?.anchors.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
    </fieldset>
  );
}
