import {
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
} from "recharts";
import { useMemo } from "react";
import { bigFiveTakeaways, WORK_VALUE_AXES } from "../lifePath";
import { readChartPalette } from "../theme/chartPalette";
import "./ProfileCharts.css";

// recharts wants colours as props, so the tokens are resolved off the document
// once per mount instead of being copied into this file. See theme/chartPalette.js.
function useChartPalette() {
  return useMemo(() => readChartPalette(), []);
}

// N renders inverted as Emotional Steadiness (100 - N); the stored score keeps
// raw N everywhere.
const BIG_FIVE_AXES = [
  { key: "O", label: "Openness" },
  { key: "C", label: "Conscientiousness" },
  { key: "E", label: "Extraversion" },
  { key: "A", label: "Agreeableness" },
  { key: "N", label: "Emotional Steadiness" },
];

export function PersonalityRadarChart({ scores }) {
  const palette = useChartPalette();
  if (!scores) return null;

  const data = BIG_FIVE_AXES.map((axis) => ({
    key: axis.key,
    trait: axis.label,
    value: axis.key === "N" ? 100 - (scores.N ?? 0) : scores[axis.key] ?? 0,
  }));

  return (
    <div className="profile-chart">
      <p className="profile-chart-title">Personality (Big Five)</p>
      <ResponsiveContainer width="100%" height={210}>
        {/* cx nudged left so the right-anchored "Conscientiousness" label fits the panel */}
        <RadarChart data={data} outerRadius="62%" cx="46%">
          <PolarGrid stroke={palette.grid} />
          <PolarAngleAxis dataKey="trait" tick={{ fontSize: 10, fill: palette.muted }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke={palette.accent}
            fill={palette.accentSoft}
            fillOpacity={1}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
      <ul className="profile-takeaways">
        {bigFiveTakeaways(scores).map((row) => (
          <li key={row.key}>
            <span className="profile-takeaway-score">
              {row.label} {row.value}
            </span>
            {" — "}
            {row.line}
          </li>
        ))}
      </ul>
    </div>
  );
}

const RIASEC_AXES = [
  { key: "R", label: "Realistic (hands-on)" },
  { key: "I", label: "Investigative (thinking)" },
  { key: "A", label: "Artistic (creating)" },
  { key: "S", label: "Social (helping)" },
  { key: "E", label: "Enterprising (leading)" },
  { key: "C", label: "Conventional (organizing)" },
];

function RiasecBarChart({ scores, code, inferred }) {
  const palette = useChartPalette();
  if (!scores) return null;

  const data = RIASEC_AXES.map((axis) => ({
    id: axis.key,
    name: axis.label,
    value: scores[axis.key] ?? 0,
  }));

  return (
    <div className="profile-chart">
      <p className="profile-chart-title">
        Interests (Holland{code ? ` · ${code}` : ""}{inferred ? " · estimated" : ""})
      </p>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <XAxis
            type="number"
            domain={[0, 100]}
            tickCount={6}
            tick={{ fontSize: 10, fill: palette.muted }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={158}
            interval={0}
            tick={{ fontSize: 11, fill: palette.muted }}
            tickLine={false}
            axisLine={false}
          />
          <Bar dataKey="value" barSize={10} radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.id} fill={entry.value >= 65 ? palette.accent : palette.accentSoft} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      {inferred && (
        <p className="profile-panel-note">
          Estimated from your personality answers — take it as a sketch.
        </p>
      )}
    </div>
  );
}

// Six-axis Minnesota Work Values radar of the person's confirmed hierarchy.
export function WorkValuesRadar({ user, title = "Work values" }) {
  const palette = useChartPalette();
  if (!user) return null;
  const data = WORK_VALUE_AXES.map((axis) => ({
    key: axis.key,
    label: axis.label,
    you: user[axis.key] ?? 0,
  }));

  return (
    <div className="profile-chart">
      <p className="profile-chart-title">{title}</p>
      <ResponsiveContainer width="100%" height={230}>
        <RadarChart data={data} outerRadius="64%" cx="50%">
          <PolarGrid stroke={palette.grid} />
          <PolarAngleAxis dataKey="label" tick={{ fontSize: 10, fill: palette.muted }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            name="You"
            dataKey="you"
            stroke={palette.accent}
            fill={palette.accentSoft}
            fillOpacity={1}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ProfilePanel({ profile, userValues, onClose }) {
  const { bigFiveScores, derivedTraits, personaSummary, riasecScores, riasecCode, riasecInferred } =
    profile || {};

  if (!bigFiveScores && !riasecScores) return null;

  return (
    <aside className="profile-panel">
      <div className="profile-panel-header">
        <p className="profile-panel-title">Preliminary profile</p>
        <button type="button" className="profile-panel-close" onClick={onClose}>
          ×
        </button>
      </div>
      <PersonalityRadarChart scores={bigFiveScores} />
      <p className="profile-panel-note">
        Based on a 20-item short screen — a rough sketch, not a measured verdict.
      </p>
      {personaSummary && (
        <div className="profile-persona">
          <p className="profile-chart-title">Who you are</p>
          <p className="profile-persona-text">{personaSummary}</p>
        </div>
      )}
      <RiasecBarChart scores={riasecScores} code={riasecCode} inferred={riasecInferred} />
      {userValues?.scores && <WorkValuesRadar user={userValues.scores} title="Your work values" />}
      {derivedTraits?.summary && <p className="profile-panel-summary">{derivedTraits.summary}</p>}
      <p className="profile-panel-note">
        Directions and professions are picked from these survey scores — your dream answer only
        colours the story.
      </p>
      <p className="profile-panel-note">
        This is an exploratory self-reflection tool, not professional career counseling or a
        psychological assessment.
      </p>
    </aside>
  );
}
