// Archetype emblem — the summary screen as one personal mark. Shipped on
// SummaryScreen (ArchetypeEmblem). Three measured layers (Big Five lobes,
// RIASEC ring, work-value ticks) draw in order, then the archetype name lands
// under them. The geometry is a pure function of the profile: switch profiles
// to see three different marks, reload to see the same one again. "Save PNG"
// exports the final frame at 1080×1350.
import { useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import profile from "../data/demo-profile.json";
import "./emblem-demo.css";
import { EmblemScene } from "../../src/motion/emblem/ArchetypeEmblem";
import { STAGES, SYNTHETIC_PROFILES, buildEmblem, frameAt } from "../../src/motion/emblem/emblemEngine";
import { saveEmblemPng } from "../../src/motion/emblem/savePng";

const PROFILES = [{ id: "dev", kind: "Dev persona", ...profile }, ...SYNTHETIC_PROFILES].map((p) => ({
  ...p,
  emblem: buildEmblem(p),
}));

function Scene({ clock, profileId, setProfileId }) {
  const p = PROFILES.find((x) => x.id === profileId);
  const frame = useMemo(() => frameAt(clock.T), [clock.T]);

  const choose = (id) => {
    if (id === profileId) return;
    setProfileId(id);
    if (!clock.reducedMotion) clock.restart();
  };

  return (
    <EmblemScene emblem={p.emblem} frame={frame}>
      <div className="emb-controls">
        <div className="emb-profiles" role="group" aria-label="Profile">
          {PROFILES.map((x) => (
            <button
              key={x.id}
              type="button"
              className="demo-btn"
              aria-pressed={x.id === profileId}
              onClick={() => choose(x.id)}
            >
              {x.kind}: {x.riasecCode}
            </button>
          ))}
        </div>
        <button type="button" className="demo-btn demo-btn-primary" onClick={() => saveEmblemPng(p.emblem)}>
          Save PNG
        </button>
      </div>
    </EmblemScene>
  );
}

export default function Demo() {
  const [profileId, setProfileId] = useState("dev");
  return (
    <DemoShell
      slug="archetype-emblem"
      title="One person, three measured layers"
      explains="Personality, interests and priorities from the assessment, drawn as one mark — same profile, same emblem."
      stages={STAGES}
    >
      {(clock) => <Scene clock={clock} profileId={profileId} setProfileId={setProfileId} />}
    </DemoShell>
  );
}
