import { useEffect, useState } from "react";

// A long frame (tab switch, debugger) must not teleport the scene.
const MAX_DT_S = 0.1;

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// The OS setting, followed live. `override` (a prop, a test) pins it.
export function useReducedMotion(override) {
  const [rm, setRm] = useState(prefersReducedMotion);
  useEffect(() => {
    if (override !== undefined || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setRm(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [override]);
  return override ?? rm;
}

// The production scene clock: T runs once from 0 to `duration` seconds and
// stops — no loop, no controls. The shipped scenes are pure functions of T, so
// this is the only place time advances.
//
// - `duration` may be Infinity while a scene waits on a response (the engine
//   folds the hold out of T) and become finite once it lands.
// - Pauses while `targetRef` is off-screen or the tab is hidden.
// - Reduced motion: no loop at all; T reports the end (0 while the end is not
//   known yet) and scenes paint their static frame.
// - `restartKey` changing replays from 0.
export function usePlayOnce(duration, { targetRef, restartKey, reducedMotion: rmOption } = {}) {
  const reducedMotion = useReducedMotion(rmOption);
  const [T, setT] = useState(0);
  const [key, setKey] = useState(restartKey);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );

  // Reset during render, not in an effect: the first frame of the new run must
  // not paint the last frame of the old one.
  if (key !== restartKey) {
    setKey(restartKey);
    setT(0);
  }

  useEffect(() => {
    const el = targetRef?.current;
    if (!el || typeof IntersectionObserver === "undefined") return undefined;
    const io = new IntersectionObserver(([entry]) => setOnScreen(entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [targetRef]);

  useEffect(() => {
    const onVisibility = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const running = !reducedMotion && onScreen && pageVisible && T < duration;

  useEffect(() => {
    if (!running || typeof requestAnimationFrame !== "function") return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(MAX_DT_S, (now - last) / 1000);
      last = now;
      setT((t) => Math.min(duration, t + dt));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [running, duration]);

  const end = Number.isFinite(duration) ? duration : 0;
  return {
    T: reducedMotion ? end : T,
    done: Number.isFinite(duration) && (reducedMotion || T >= duration),
    reducedMotion,
  };
}
