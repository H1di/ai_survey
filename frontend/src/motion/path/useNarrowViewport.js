import { useEffect, useState } from "react";

// The roadmap path turns vertical on a phone (time runs down the screen).
export const NARROW_QUERY = "(max-width: 640px)";

const matches = () =>
  typeof window !== "undefined" && window.matchMedia?.(NARROW_QUERY).matches === true;

// Followed live, so rotating a phone or resizing a window re-lays the path.
export function useNarrowViewport() {
  const [narrow, setNarrow] = useState(matches);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(NARROW_QUERY);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
