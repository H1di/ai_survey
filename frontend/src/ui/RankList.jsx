import { useState } from "react";
import "./ui.css";

// A reorderable ranking. Drag is the advertised interaction; the arrow keys
// are the one that works without a mouse, so both go through the same
// onReorder(from, to) callback.
export default function RankList({ items, onReorder, disabled = false, hint = "drag to reorder" }) {
  const [dragFrom, setDragFrom] = useState(null);
  const [dragOver, setDragOver] = useState(null);

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
    onReorder(index, to);
  };

  return (
    <ol className="rank-list" role="listbox" aria-label="Your work values, ranked">
      {items.map((item, index) => (
        <li
          key={item.id}
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
          onDragStart={() => !disabled && setDragFrom(index)}
          onDragOver={(event) => {
            if (disabled || dragFrom === null) return;
            event.preventDefault();
            setDragOver(index);
          }}
          onDrop={(event) => {
            if (disabled || dragFrom === null) return;
            event.preventDefault();
            onReorder(dragFrom, index);
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
  );
}
