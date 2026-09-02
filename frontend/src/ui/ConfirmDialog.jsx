import { useEffect, useRef } from "react";
import "./ui.css";

// A single modal question with a destructive answer. Nothing here is specific
// to leaving the assessment — the caller owns the copy — but the cancel button
// is the one that takes focus, so a stray Enter never destroys anything.
export default function ConfirmDialog({
  eyebrow,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}) {
  const cancelRef = useRef(null);

  useEffect(() => {
    cancelRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="confirm-overlay"
      // The backdrop cancels, but only when the click starts and ends on it:
      // a drag that began inside the card must not read as "leave".
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="confirm-card"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
      >
        {eyebrow && <p className="confirm-eyebrow">{eyebrow}</p>}
        <h2 className="confirm-title" id="confirm-title">
          {title}
        </h2>
        {body && <p className="confirm-body">{body}</p>}
        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn--ghost"
            onClick={onCancel}
            ref={cancelRef}
          >
            {cancelLabel}
          </button>
          <button type="button" className="btn btn--gold" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
