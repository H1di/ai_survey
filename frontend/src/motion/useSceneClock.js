import { useCallback, useEffect, useRef, useState } from "react";
import { clamp, stageAt, totalDuration } from "./timeline";

// How long the finished frame holds before a playing scene loops.
const LOOP_HOLD_S = 1.6;
// A long frame (tab switch, debugger) must not teleport the scene.
const MAX_DT_S = 0.1;

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

// End of the stage T falls in — where reduced motion parks the clock.
const stageEnd = (T, stages) => stageAt(T, stages).end;

// One requestAnimationFrame loop driving a scene clock T (seconds).
//
// - Pauses while `targetRef` is off-screen (IntersectionObserver) or the tab is
//   hidden (visibilitychange), without dropping the viewer's play intent.
// - Reduced motion (OS setting or the toggle): no loop. T parks at the end of
//   the current stage; Play steps to the end of the next stage.
// - Options seed deterministic screenshots: initialT, paused, reducedMotion.
export function useSceneClock(
  stages,
  { targetRef, initialT, paused = false, reducedMotion: rmOption, speed: initialSpeed = 1 } = {}
) {
  const duration = totalDuration(stages);
  const [reducedMotion, setRm] = useState(() => rmOption ?? prefersReducedMotion());
  const [T, setT] = useState(() => {
    if (reducedMotion) return stageEnd(clamp(initialT ?? duration, 0, duration), stages);
    return clamp(initialT ?? 0, 0, duration);
  });
  const [playing, setPlaying] = useState(!paused && !reducedMotion);
  const [speed, setSpeed] = useState(initialSpeed);
  const [onScreen, setOnScreen] = useState(true);
  const [pageVisible, setPageVisible] = useState(
    () => typeof document === "undefined" || !document.hidden
  );
  const holdRef = useRef(0);

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

  const setReducedMotion = useCallback(
    (on) => {
      setRm(on);
      if (on) {
        setPlaying(false);
        setT((t) => stageEnd(t, stages));
      }
    },
    [stages]
  );

  // Follow the OS setting live unless the URL pinned it.
  useEffect(() => {
    if (rmOption !== undefined || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReducedMotion(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [rmOption, setReducedMotion]);

  useEffect(() => {
    if (!playing || reducedMotion || !onScreen || !pageVisible) return undefined;
    let raf = 0;
    let last = performance.now();
    const tick = (now) => {
      const dt = Math.min(MAX_DT_S, (now - last) / 1000) * speed;
      last = now;
      setT((t) => {
        if (t < duration) return Math.min(duration, t + dt);
        holdRef.current += dt;
        if (holdRef.current < LOOP_HOLD_S) return t;
        holdRef.current = 0;
        return 0;
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, reducedMotion, onScreen, pageVisible, speed, duration]);

  const play = useCallback(() => {
    if (reducedMotion) {
      setT((t) => (t >= duration ? stageEnd(0, stages) : stageEnd(Math.min(duration, t + 1e-6), stages)));
      return;
    }
    holdRef.current = 0;
    setT((t) => (t >= duration ? 0 : t));
    setPlaying(true);
  }, [reducedMotion, duration, stages]);

  const pause = useCallback(() => setPlaying(false), []);

  const restart = useCallback(() => {
    holdRef.current = 0;
    setT(reducedMotion ? stageEnd(0, stages) : 0);
    setPlaying(!reducedMotion);
  }, [reducedMotion, stages]);

  const seek = useCallback(
    (t) => {
      holdRef.current = 0;
      setT(clamp(t, 0, duration));
    },
    [duration]
  );

  return {
    T,
    duration,
    playing: playing && !reducedMotion,
    running: playing && !reducedMotion && onScreen && pageVisible,
    speed,
    reducedMotion,
    current: stageAt(T, stages),
    play,
    pause,
    toggle: () => (playing && !reducedMotion ? pause() : play()),
    restart,
    seek,
    setSpeed,
    setReducedMotion,
  };
}
