import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "../motion/usePlayOnce";
import "./ui.css";

// How long a pick stays on the scale once the next item is up: the swell and
// the settle (~300 ms) finish on the live ring while the statement swaps.
export const PICK_HOLD_MS = 320;

// Five rings on one hairline, the scale's two ends in mono at either side.
// Picking a ring is the answer — there is no separate Continue, because twelve
// or twenty items make that a click tax.
//
// Every ring keeps its full anchor ("Moderately accurate") as its accessible
// name; on screen only the ends are written out, and the anchor of the ring
// under the pointer, under focus or chosen is shown once, small, under the
// scale — so the meaning of each point stays discoverable without five
// permanent captions.
//
// The ring fills the moment it is picked, before the answer has round-tripped.
// `picked` remembers that choice and the item it was made on (`itemKey`):
// - on the same item it stands in for `value` while the answer is in flight
//   (`disabled`), and is dropped when it settles — a failed save falls back to
//   `value`;
// - when the next item arrives (the answer saved) it is held for PICK_HOLD_MS
//   so the swell finishes on the live ring, then the scale is fresh. The new
//   item is clickable throughout; reduced motion holds nothing.
// The scale is one instance across items — the screen passes `itemKey`, not a
// React key — which is what lets the pick outlive the swap.
export default function LikertScale({
  anchors,
  value = null,
  onSelect,
  disabled = false,
  ends = null,
  label,
  itemKey = null,
}) {
  const [picked, setPicked] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [focused, setFocused] = useState(null);
  const [wasDisabled, setWasDisabled] = useState(disabled);
  const buttons = useRef([]);

  if (wasDisabled !== disabled) {
    setWasDisabled(disabled);
    if (!disabled && picked && picked.key === itemKey) setPicked(null);
  }

  const carried = picked && picked.key !== itemKey;
  useEffect(() => {
    if (!carried) return undefined;
    const hold = prefersReducedMotion() ? 0 : PICK_HOLD_MS;
    const id = setTimeout(() => setPicked((p) => (p === picked ? null : p)), hold);
    return () => clearTimeout(id);
  }, [carried, picked]);

  const chosen = picked ? picked.value : value;
  const shown = hovered ?? focused ?? chosen;
  const caption = anchors.find((a) => a.value === shown)?.label ?? "";

  const pick = (v) => {
    setPicked({ value: v, key: itemKey });
    onSelect(v);
  };

  // Arrow keys walk the rings (focus only — Enter/Space answers), as in a
  // radio group; Tab still reaches each ring.
  const onKeyDown = (event) => {
    const i = buttons.current.indexOf(document.activeElement);
    if (i < 0) return;
    const last = anchors.length - 1;
    const next = {
      ArrowRight: Math.min(last, i + 1),
      ArrowDown: Math.min(last, i + 1),
      ArrowLeft: Math.max(0, i - 1),
      ArrowUp: Math.max(0, i - 1),
      Home: 0,
      End: last,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    buttons.current[next]?.focus();
  };

  return (
    <div className="likert" role="group" aria-label={label}>
      <div className={`likert-row${ends ? " likert-row--ends" : ""}`}>
        {ends && (
          <span className="likert-end likert-end--low" aria-hidden="true">
            {ends.low}
          </span>
        )}
        <div className="likert-options" onKeyDown={onKeyDown}>
          {anchors.map((anchor, i) => {
            const on = chosen === anchor.value;
            return (
              <button
                key={anchor.value}
                ref={(el) => {
                  buttons.current[i] = el;
                }}
                type="button"
                className={`likert-option${on ? " likert-option--on" : ""}${
                  on && picked ? " likert-option--picked" : ""
                }`}
                aria-label={anchor.label}
                // A carried pick is decoration; the new item's own answer is
                // what is announced.
                aria-pressed={carried ? value === anchor.value : on}
                disabled={disabled}
                onClick={() => pick(anchor.value)}
                onMouseEnter={() => setHovered(anchor.value)}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setFocused(anchor.value)}
                onBlur={() => setFocused(null)}
              >
                <span className="likert-ring" aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {ends && (
          <span className="likert-end likert-end--high" aria-hidden="true">
            {ends.high}
          </span>
        )}
      </div>
      <p className="likert-caption" aria-hidden="true">
        {caption}
      </p>
    </div>
  );
}
