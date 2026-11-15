// RIASEC settle — what the three-letter interest code means and where it
// comes from. Shipped on the interest-result screen (screens/RiasecResultScreen):
// after the quiz is finished, never while answering (live scores would bias
// the answers). This page drives the same scene with a scrubbable clock.
import { useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import profile from "../data/demo-profile.json";
import "./settle-demo.css";
import SettleScene from "../../src/motion/settle/SettleScene";
import { STAGES, buildProfiles, frameAt } from "../../src/motion/settle/settleEngine";

const PROFILES = buildProfiles(profile);
// ?profile=rci|sea opens on a synthetic profile (for screenshots).
const requested = new URLSearchParams(window.location.search).get("profile");
const START = PROFILES.some((p) => p.id === requested) ? requested : "persona";

function Scene({ clock, profileId, setProfileId }) {
  const p = PROFILES.find((x) => x.id === profileId);
  const frame = useMemo(() => frameAt(clock.T, p), [clock.T, p]);

  const choose = (id) => {
    if (id === profileId) return;
    setProfileId(id);
    // Reduced motion keeps the parked frame; otherwise replay from the start.
    if (!clock.reducedMotion) clock.restart();
  };

  return (
    <SettleScene profile={p} frame={frame}>
      <div className="rset-profiles" role="group" aria-label="Sample profile">
        {PROFILES.map((x) => (
          <button
            key={x.id}
            type="button"
            className="demo-btn"
            aria-pressed={x.id === profileId}
            onClick={() => choose(x.id)}
          >
            {x.code} · {x.tag}
          </button>
        ))}
      </div>
    </SettleScene>
  );
}

export default function Demo() {
  const [profileId, setProfileId] = useState(START);
  return (
    <DemoShell
      slug="riasec-settle"
      title="What your interest code means"
      explains="Your six interest scores, where their balance sits on Holland's hexagon, and the three highest types that make up your code."
      stages={STAGES}
    >
      {(clock) => <Scene clock={clock} profileId={profileId} setProfileId={setProfileId} />}
    </DemoShell>
  );
}
