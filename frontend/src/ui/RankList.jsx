import { useLayoutEffect, useRef, useState } from "react";
import "./ui.css";

const GLIDE_MS = 220;

// Rows glide to their new slot after a reorder (FLIP: measure, then play the
// difference with the Web Animations API). Native <li>s on purpose — the list
// uses HTML5 drag, which a motion element would swallow. No-ops where there is
// nothing to animate with (jsdom) and under reduced motion.
function useReorderGlide(listRef, order) {
  const tops = useRef(new Map());
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // --ease-out lives in tokens.css; WAAPI takes the same string.
    const easing = getComputedStyle(list).getPropertyValue("--ease-out").trim() || "ease-out";
    const next = new Map();
    for (const row of list.children) {
      const id = row.dataset.rankId;
      const top = row.getBoundingClientRect().top;
      next.set(id, top);
      const before = tops.current.get(id);
      if (reduced || before === undefined || before === top || !row.animate) continue;
      row.animate(
        [{ transform: `translateY(${before - top}px)` }, { transform: "none" }],
        { duration: GLIDE_MS, easing }
      );
    }
    tops.current = next;
  }, [listRef, order]);
}

// A reorderable ranking. Drag is the advertised interaction; the arrow keys
// are the one that works without a mouse, so both go through the same
// onReorder(from, to) callback.
export default function RankList({
  items,
  onReorder,
  disabled = false,
  hint = "drag to reorder",
}) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  // Spec section 8: reordering has to be announced. A keyboard move changes
  // nothing a screen reader reads on its own — the row keeps its label and its
  // focus, and only the silent visual order changes.
  const [announcement, setAnnouncement] = useState("");
  const listRef = useRef(null);
  useReorderGlide(listRef, items.map((item) => item.id).join("|"));

  const reorder = (from, to) => {
    if (from === to) return;
    const item = items[from];
    onReorder(from, to);
    if (item)
      setAnnouncement(`${item.label}, position ${to + 1} of ${items.length}`);
  };

  const keyMove = (event, index) => {
    if (disabled) return;
    const targets = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: items.length - 1,
    };
    if (!(event.key in targets)) return;
    event.preventDefault();
    const to = Math.max(0, Math.min(items.length - 1, targets[event.key]));
    reorder(index, to);
  };

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <ol
        ref={listRef}
        className="rank-list"
        role="listbox"
        aria-label="Your work values, ranked"
      >
        {items.map((item, index) => (
          <li
            key={item.id}
            data-rank-id={item.id}
            role="option"
            aria-selected={dragFrom === index}
            tabIndex={0}
            draggable={!disabled}
            className={[
              "rank-row",
              dragOver === index && dragFrom !== null ? "rank-row--over" : "",
              dragFrom === index ? "rank-row--dragging" : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onDragStart={(event) => {
              if (disabled) return;
              // Firefox refuses to start a drag with no payload, and jsdom's
              // synthetic events carry no dataTransfer at all — hence the guard.
              event.dataTransfer?.setData?.("text/plain", String(index));
              setDragFrom(index);
            }}
            onDragOver={(event) => {
              if (disabled || dragFrom === null) return;
              event.preventDefault();
              setDragOver(index);
            }}
            onDrop={(event) => {
              if (disabled || dragFrom === null) return;
              event.preventDefault();
              reorder(dragFrom, index);
              setDragFrom(null);
              setDragOver(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDragOver(null);
            }}
            onKeyDown={(event) => keyMove(event, index)}
          >
            <span className="rank-number">{index + 1}</span>
            <span className="rank-label">{item.label}</span>
            <span className="rank-hint">{hint}</span>
          </li>
        ))}
      </ol>
    </>
  );
}
