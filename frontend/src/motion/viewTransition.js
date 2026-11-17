import { flushSync } from "react-dom";

// Runs a state update as a view transition where the browser has them, plainly
// where it does not. flushSync makes React commit inside the callback, so the
// browser's "after" snapshot is the new slide. The CSS (ui.css) decides what
// moves; this only opens the window for it.
//
// Returns a promise that settles once the update has been committed. The
// browser runs the callback a task later (after the old snapshot), so a caller
// that clears state after the update — e.g. a busy flag in a `finally` — must
// await this, or it lands first and the old screen flickers back to life.
export function withViewTransition(update) {
  if (typeof document === "undefined" || !document.startViewTransition) {
    update();
    return Promise.resolve();
  }
  return document.startViewTransition(() => flushSync(update)).updateCallbackDone;
}
