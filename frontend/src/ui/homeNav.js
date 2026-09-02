import { createContext, useContext } from "react";

// The wordmark doubles as the site's home link, but it is rendered deep inside
// every screen (App → ScreenShell → Wordmark). Threading a handler through a
// dozen screen components would be noise, so App publishes it here instead.
// A null value means "there is nowhere to go": the mark renders as plain text.
export const HomeNavContext = createContext(null);

export function useHomeNav() {
  return useContext(HomeNavContext);
}
