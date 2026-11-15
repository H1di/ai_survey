import { flushSync } from "react-dom";

// Runs a state update as a view transition where the browser has them, plainly
// where it does not. flushSync makes React commit inside the callback, so the
// browser's "after" snapshot is the new slide. The CSS (ui.css) decides what
// moves; this only opens the window for it.
export function withViewTransition(update) {
  if (typeof document === "undefined" || !document.startViewTransition) {
    update();
    return;
  }
  document.startViewTransition(() => flushSync(update));
}
