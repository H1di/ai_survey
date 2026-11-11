// Roadmap draw — the accepted occupation's plan, walked one step at a time.
import DemoShell from "../kit/DemoShell";
import profile from "../data/demo-profile.json";
import { buildStages, buildTimeline } from "./roadmapTimeline";
import RoadmapDemo from "./RoadmapDemo";

const steps = profile.roadmap.stages;
const timeline = buildTimeline(steps.length);
const STAGES = buildStages(steps, timeline);

const chosen = {
  title: profile.chosen.title,
  field: profile.topDirections.find((d) => d.id === profile.chosen.directionId)?.label ?? "",
  fit: profile.valuesFit.overall,
  stepCount: steps.length,
};

export default function Demo() {
  return (
    <DemoShell
      slug="roadmap-draw"
      title="Roadmap draw"
      explains="The plan is a sequence you walk, not a wall of text: each step follows from the one before."
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
        />
      )}
    </DemoShell>
  );
}
