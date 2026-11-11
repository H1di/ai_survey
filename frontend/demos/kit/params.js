// URL parameters for deterministic screenshots:
//   ?t=<sec>   start at T     ?paused=1   do not play
//   ?w=<px>    stage width    ?rm=1 / rm=0  force reduced motion on / off
export const DEMO_WIDTHS = [360, 768, 1280];

export function readDemoParams(search = window.location.search) {
  const q = new URLSearchParams(search);
  const num = (key) => {
    const v = Number.parseFloat(q.get(key));
    return Number.isFinite(v) ? v : undefined;
  };
  return {
    t: num("t"),
    paused: q.get("paused") === "1",
    width: num("w"),
    reducedMotion: q.has("rm") ? q.get("rm") === "1" : undefined,
  };
}
