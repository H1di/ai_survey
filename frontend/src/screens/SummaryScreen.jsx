import ScreenShell from "../ui/ScreenShell";
import { PersonalityRadarChart, WorkValuesRadar } from "../components/ProfileCharts";
import ArchetypeEmblem from "../motion/emblem/ArchetypeEmblem";
import { canBuildEmblem } from "../motion/emblem/emblemEngine";
import "./screens.css";

export default function SummaryScreen({
  archetype,
  bigFiveScores,
  riasecScores,
  riasecCode,
  personaSummary,
  userValues,
  busy,
  onContinue,
  footer,
  reducedMotion,
}) {
  // The three measured layers as one mark — only when all three exist.
  const emblemProfile = {
    bigFiveScores,
    riasecScores,
    riasecCode,
    valuesOrder: userValues?.order,
  };

  return (
    <ScreenShell
      eyebrow="step 6 · summary"
      title="Who you are"
      sub="A deterministic named archetype, a Big Five radar chart, AI persona prose, and your confirmed work-values radar — brought together into one profile."
      glow="center"
      footer={footer}
    >
      {canBuildEmblem(emblemProfile) && (
        <ArchetypeEmblem profile={emblemProfile} reducedMotion={reducedMotion} />
      )}
      <p className="summary-archetype">{archetype.name}</p>
      <p className="summary-tagline">{archetype.tagline}</p>

      {bigFiveScores && <PersonalityRadarChart scores={bigFiveScores} />}
      {personaSummary && <p className="summary-persona">{personaSummary}</p>}
      {userValues?.scores && (
        <WorkValuesRadar user={userValues.scores} title="What matters to you" />
      )}

      <button type="button" className="btn btn--primary summary-cta" onClick={onContinue} disabled={busy}>
        {busy ? "Preparing…" : "Enter the Life Path Engine"}
      </button>

      <p className="screen-footnote">
        A preliminary sketch from a short self-report — not a clinical assessment.
      </p>
    </ScreenShell>
  );
}
