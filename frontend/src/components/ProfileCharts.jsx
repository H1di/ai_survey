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
import "./ProfileCharts.css";

const ACCENT = "#863bff";
const ACCENT_SOFT = "rgba(134, 59, 255, 0.25)";
const MUTED = "#666666";

// Axis keys mirror the O/C/E/A/N naming the backend sends to the AI, and the
// trait names AI texts (whyFit, refine reasons) use — so a mentioned trait can
// be matched to its axis and highlighted via `highlightKeys` later.
const BIG_FIVE_AXES = [
  { key: "O", label: "Openness" },
  { key: "C", label: "Conscientiousness" },
  { key: "E", label: "Extraversion" },
  { key: "A", label: "Agreeableness" },
  { key: "N", label: "Neuroticism" },
];

// Must match VALUES_DIMENSIONS ids/labels in backend/questionPool.js.
const VALUES_DIMENSIONS = [
  { id: "economic_return", label: "Economic Return", emoji: "💰" },
  { id: "lifestyle", label: "Lifestyle", emoji: "🧘" },
  { id: "achievement", label: "Achievement", emoji: "🚀" },
  { id: "intellectual_stimulation", label: "Intellectual Stimulation", emoji: "🧠" },
  { id: "meaning_impact", label: "Meaning / Impact", emoji: "❤️" },
  { id: "independence", label: "Independence", emoji: "🧭" },
  { id: "structure", label: "Structure", emoji: "🏢" },
  { id: "social_environment", label: "Social Environment", emoji: "👥" },
];

function RadarTick({ payload, x, y, textAnchor, highlighted }) {
  return (
    <text
      x={x}
      y={y}
      textAnchor={textAnchor}
      fontSize={10}
      fill={highlighted.has(payload.value) ? ACCENT : MUTED}
      fontWeight={highlighted.has(payload.value) ? 600 : 400}
    >
      {payload.value}
    </text>
  );
}

export function PersonalityRadarChart({ scores, highlightKeys = [] }) {
  if (!scores) return null;

  const data = BIG_FIVE_AXES.map((axis) => ({
    key: axis.key,
    trait: axis.label,
    value: scores[axis.key] ?? 0,
  }));
  const highlighted = new Set(
    BIG_FIVE_AXES.filter((a) => highlightKeys.includes(a.key)).map((a) => a.label)
  );

  return (
    <div className="profile-chart">
      <p className="profile-chart-title">Personality (Big Five)</p>
      <ResponsiveContainer width="100%" height={210}>
        {/* cx nudged left so the right-anchored "Conscientiousness" label fits the panel */}
        <RadarChart data={data} outerRadius="62%" cx="46%">
          <PolarGrid stroke="#e0e0e0" />
          <PolarAngleAxis
            dataKey="trait"
            tick={(props) => <RadarTick {...props} highlighted={highlighted} />}
          />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          <Radar
            dataKey="value"
            stroke={ACCENT}
            fill={ACCENT_SOFT}
            fillOpacity={1}
            isAnimationActive={false}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ValuesBarChart({ scores }) {
  if (!scores) return null;

  const data = VALUES_DIMENSIONS.map((dim) => ({
    id: dim.id,
    name: `${dim.emoji} ${dim.label}`,
    value: scores[dim.id] ?? 0,
  }));

  return (
    <div className="profile-chart">
      <p className="profile-chart-title">Values (alignment per dimension)</p>
      <ResponsiveContainer width="100%" height={248}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <XAxis type="number" domain={[0, 5]} tickCount={6} tick={{ fontSize: 10, fill: MUTED }} />
          <YAxis
            type="category"
            dataKey="name"
            width={158}
            interval={0}
            tick={{ fontSize: 11, fill: MUTED }}
            tickLine={false}
            axisLine={false}
          />
          <Bar dataKey="value" barSize={10} radius={[0, 2, 2, 0]} isAnimationActive={false}>
            {data.map((entry) => (
              <Cell key={entry.id} fill={entry.value >= 4 ? ACCENT : ACCENT_SOFT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function ProfilePanel({ profile, onClose }) {
  const { bigFiveScores, derivedTraits, valuesScores, bigFiveDepth } = profile || {};

  if (!bigFiveScores && !valuesScores) return null;

  return (
    <aside className="profile-panel">
      <div className="profile-panel-header">
        <p className="profile-panel-title">Preliminary profile</p>
        <button type="button" className="profile-panel-close" onClick={onClose}>
          ×
        </button>
      </div>
      <PersonalityRadarChart scores={bigFiveScores} />
      {bigFiveDepth === "short" && (
        <p className="profile-panel-note">
          Based on a 20-item short screen — a rough sketch, not a measured verdict.
        </p>
      )}
      <ValuesBarChart scores={valuesScores} />
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
