import { useRef, useState } from "react";
import { useSceneClock } from "./useSceneClock";
import { DEMO_WIDTHS, readDemoParams } from "./params";
import { totalDuration } from "./timeline";
import "./demo.css";

const SPEEDS = [0.5, 1, 2];
const params = readDemoParams();

const fmt = (s) => s.toFixed(2).padStart(5, "0");

// Page chrome every demo shares: title, one-line "what this explains", the
// stage box, stage label, and the playback controls. The scene is a render
// prop receiving the clock — it never owns time.
//
//   <DemoShell slug title explains stages footnote>
//     {(clock) => <MyScene T={clock.T} reducedMotion={clock.reducedMotion} />}
//   </DemoShell>
export default function DemoShell({ slug, title, explains, stages, footnote, children }) {
  const stageRef = useRef(null);
  const [width, setWidth] = useState(params.width ?? DEMO_WIDTHS[DEMO_WIDTHS.length - 1]);
  const clock = useSceneClock(stages, {
    targetRef: stageRef,
    initialT: params.t,
    paused: params.paused,
    reducedMotion: params.reducedMotion,
  });
  const { T, duration, current } = clock;

  const ticks = stages
    .slice(0, -1)
    .map((s, i) => ({ id: s.id, at: totalDuration(stages.slice(0, i + 1)) / duration }));

  return (
    <div className="demo-page">
      <header className="demo-head">
        <a className="demo-back" href="/demos/">
          Demos
        </a>
        <span className="demo-slug">{slug}</span>
        <h1 className="demo-title">{title}</h1>
        <p className="demo-explains">{explains}</p>
      </header>

      <main className="demo-stage-wrap">
        <div className="demo-stage" ref={stageRef} style={{ maxWidth: width }}>
          {children(clock)}
        </div>
        {footnote ? (
          <p className="demo-footnote" style={{ maxWidth: width }}>
            {footnote}
          </p>
        ) : null}
      </main>

      <section className="demo-controls" aria-label="Playback">
        <div className="demo-stage-label" aria-live="polite">
          <span className="demo-stage-index">
            {String(current.index + 1).padStart(2, "0")} / {String(stages.length).padStart(2, "0")}
          </span>
          <span className="demo-stage-name">{current.stage.label}</span>
          <span className="demo-time">
            {fmt(T)} / {fmt(duration)} s
          </span>
        </div>

        <div className="demo-scrub">
          <input
            type="range"
            min={0}
            max={duration}
            step={0.01}
            value={T}
            onChange={(e) => {
              clock.pause();
              clock.seek(Number(e.target.value));
            }}
            aria-label="Scene time"
          />
          <div className="demo-ticks" aria-hidden="true">
            {ticks.map((tick) => (
              <span key={tick.id} style={{ left: `${tick.at * 100}%` }} />
            ))}
          </div>
        </div>

        <div className="demo-buttons">
          <button type="button" className="demo-btn demo-btn-primary" onClick={clock.toggle}>
            {clock.reducedMotion ? "Next stage" : clock.playing ? "Pause" : "Play"}
          </button>
          <button type="button" className="demo-btn" onClick={clock.restart}>
            Restart
          </button>

          <div className="demo-group" role="group" aria-label="Speed">
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                className="demo-btn demo-seg"
                aria-pressed={clock.speed === s}
                onClick={() => clock.setSpeed(s)}
              >
                {s}×
              </button>
            ))}
          </div>

          <button
            type="button"
            className="demo-btn"
            aria-pressed={clock.reducedMotion}
            onClick={() => clock.setReducedMotion(!clock.reducedMotion)}
          >
            Reduced motion
          </button>

          <div className="demo-group" role="group" aria-label="Stage width">
            {DEMO_WIDTHS.map((w) => (
              <button
                key={w}
                type="button"
                className="demo-btn demo-seg"
                aria-pressed={width === w}
                onClick={() => setWidth(w)}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
