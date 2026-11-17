// Roadmap draw — the accepted occupation's plan, walked one step at a time.
// Shipped in the life-path graph: GraphView's RoadmapReveal plays this timeline
// once when the roadmap arrives.
import DemoShell from "../kit/DemoShell";
import profile from "../data/demo-profile.json";
import { buildStages, buildTimeline } from "../../src/motion/roadmap/roadmapTimeline";
import RoadmapDemo from "./RoadmapDemo";

const steps = profile.roadmap.stages;
const timeline = buildTimeline(steps.length);
const STAGES = buildStages(steps, timeline);

const chosen = { title: profile.chosen.title };
const scores = { bigFive: profile.bigFiveScores, riasec: profile.riasecScores };

export default function Demo() {
  return (
    <DemoShell
      slug="roadmap-draw"
      title="Roadmap draw"
      explains="The plan is a path through the months ahead, not a wall of text: each stage follows from the one before."
      stages={STAGES}
      footnote={profile.onetAttribution}
    >
      {(clock) => (
        <RoadmapDemo
          T={clock.T}
          reducedMotion={clock.reducedMotion}
          onReplay={clock.restart}
          chosen={chosen}
          steps={steps}
          timeline={timeline}
          scores={scores}
        />
      )}
    </DemoShell>
  );
}
