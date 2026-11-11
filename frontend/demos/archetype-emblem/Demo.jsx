// Archetype emblem — the summary screen as one personal mark. Three measured
// layers (Big Five lobes, RIASEC ring, work-value ticks) draw in order, then
// the archetype name lands under them. The geometry is a pure function of the
// profile: switch profiles to see three different marks, reload to see the
// same one again. "Save PNG" exports the final frame at 1080×1350.
import { useMemo, useState } from "react";
import DemoShell from "../kit/DemoShell";
import { totalDuration } from "../kit/timeline";
import profile from "../data/demo-profile.json";
import EmblemCanvas, { drawEmblem, readTokens } from "./EmblemCanvas";
import { BIG_FIVE_AXES, STAGES, SYNTHETIC_PROFILES, WORK_VALUE_SLOTS, buildEmblem, frameAt } from "./emblemEngine";
import "./archetype-emblem.css";

const PROFILES = [{ id: "dev", kind: "Dev persona", ...profile }, ...SYNTHETIC_PROFILES].map((p) => ({
  ...p,
  emblem: buildEmblem(p),
}));
const END = totalDuration(STAGES);
const VALUE_LABEL = {
  achievement: "Achievement",
  independence: "Independence",
  recognition: "Recognition",
  relationships: "Relationships",
  support: "Support",
  working_conditions: "Working Conditions",
};

function ariaFor({ emblem: e }) {
  const lobes = e.lobes.map((l) => `${l.label} ${l.value}`).join(", ");
  const lead = [...e.ticks].sort((a, b) => a.rank - b.rank).slice(0, 2).map((t) => VALUE_LABEL[t.key]);
  return `Personal emblem for ${e.archetype.name}. Inner lobes: ${lobes}. Interest ring with ${e.riasecCode.split("").join(", ")} marked. Longest work-value ticks: ${lead.join(", then ")}.`;
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

async function savePng({ emblem }) {
  await document.fonts?.ready;
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  const tk = readTokens();
  ctx.fillStyle = tk.bg;
  ctx.fillRect(0, 0, W, H);
  drawEmblem(ctx, { cx: W / 2, cy: 520, R: 400, emblem, frame: frameAt(END), tk });

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = tk.bone;
  ctx.font = `600 60px ${tk.body}`;
  ctx.fillText(emblem.archetype.name, W / 2, 1056);
  ctx.fillStyle = tk.text60;
  ctx.font = `400 28px ${tk.body}`;
  wrapLines(ctx, emblem.archetype.tagline, 820).forEach((line, i) => ctx.fillText(line, W / 2, 1110 + i * 40));
  ctx.fillStyle = tk.gold70;
  ctx.font = `500 22px ${tk.mono}`;
  ctx.fillText(`${emblem.riasecCode} · ${emblem.serial}`, W / 2, 1210);

  ctx.strokeStyle = tk.gold15;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, 1262);
  ctx.lineTo(W / 2 + 40, 1262);
  ctx.stroke();
  ctx.fillStyle = tk.bone50;
  ctx.font = `500 20px ${tk.body}`;
  ctx.fillText("Invector", W / 2, 1300);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invector-emblem-${emblem.serial}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function Scene({ clock, profileId, setProfileId }) {
  const p = PROFILES.find((x) => x.id === profileId);
  const frame = useMemo(() => frameAt(clock.T), [clock.T]);
  const { archetype } = p.emblem;
  const lead = [...p.emblem.ticks].sort((a, b) => a.rank - b.rank)[0];

  const choose = (id) => {
    if (id === profileId) return;
    setProfileId(id);
    if (!clock.reducedMotion) clock.restart();
  };

  return (
    <div className="emb">
      <div className="emb-layout">
        <figure className="emb-figure">
          <EmblemCanvas emblem={p.emblem} frame={frame} ariaLabel={ariaFor(p)} />
          <figcaption className="emb-caption" aria-hidden="true">
            <p className="emb-name" style={{ opacity: frame.nameAlpha }}>
              {archetype.name}
            </p>
            <p className="emb-tagline" style={{ opacity: frame.taglineAlpha }}>
              {archetype.tagline}
            </p>
            <p className="emb-serial" style={{ opacity: frame.taglineAlpha }}>
              {p.emblem.riasecCode} · {p.emblem.serial}
            </p>
          </figcaption>
        </figure>

        <dl className="emb-legend">
          <div style={{ opacity: Math.max(0.35, frame.scaleAlpha) }}>
            <dt>Inner · Personality</dt>
            <dd>
              Five lobes, length = score.{" "}
              {BIG_FIVE_AXES.map((a) => `${a.abbr} ${a.label}`).join(", ")}. STB = 100 − Neuroticism.
            </dd>
          </div>
          <div style={{ opacity: Math.max(0.35, frame.ringAlpha) }}>
            <dt>Middle · Interests</dt>
            <dd>Six RIASEC segments, thickness = score. Your code {p.riasecCode} in gold.</dd>
          </div>
          <div style={{ opacity: Math.max(0.35, frame.tickAlpha) }}>
            <dt>Outer · Priorities</dt>
            <dd>
              Six work values, length = rank. Longest: {VALUE_LABEL[lead.key]}.{" "}
              {WORK_VALUE_SLOTS.map((s) => `${s.abbr} ${VALUE_LABEL[s.key]}`).join(", ")}.
            </dd>
          </div>
          <div>
            <dt>Seed</dt>
            <dd>A hash of the scores sets the orientation; same answers, same mark.</dd>
          </div>
        </dl>
      </div>

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
        <button type="button" className="demo-btn demo-btn-primary" onClick={() => savePng(p)}>
          Save PNG
        </button>
      </div>
    </div>
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
