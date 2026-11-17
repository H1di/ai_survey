// Roadmap-draw harness. The path is the app's own (motion/path/RoadmapPath,
// the life-path graph's roadmap node); this page only feeds the reveal a
// scrubbable clock through RevealContext — in the product, GraphView's
// RoadmapReveal plays the same timeline once. Below the width of the desktop
// path it shows the phone layout, as the app does.
import { useEffect, useMemo, useRef, useState } from "react";
import RoadmapPath from "../../src/motion/path/RoadmapPath";
import { RevealContext } from "../../src/motion/roadmap/revealContext";
import { timelineDuration } from "../../src/motion/roadmap/roadmapTimeline";
import "./roadmap-draw.css";

// The horizontal path node's full width (plot + panel + padding).
const WIDE_MIN_PX = 1260;

export default function RoadmapDemo({ T, reducedMotion, onReplay, chosen, steps, timeline, scores }) {
  const boxRef = useRef(null);
  const [width, setWidth] = useState(null);

  useEffect(() => {
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    ro.observe(boxRef.current);
    return () => ro.disconnect();
  }, []);

  // Reduced motion: the whole path at once, whatever stage the clock parks on.
  const reveal = useMemo(
    () => ({ T: reducedMotion ? timelineDuration(timeline) : T, timeline }),
    [T, reducedMotion, timeline]
  );

  return (
    <div className="rd-stage">
      <div ref={boxRef} className="rd-box">
        {width ? (
          <RevealContext.Provider value={reveal}>
            <RoadmapPath
              stages={steps}
              jobTitle={chosen.title}
              bigFive={scores.bigFive}
              riasec={scores.riasec}
              compact={width < WIDE_MIN_PX}
            />
          </RevealContext.Provider>
        ) : null}
      </div>
      <button type="button" className="demo-btn rd-replay" onClick={onReplay}>
        Replay
      </button>
    </div>
  );
}
