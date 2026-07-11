const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SCHWARTZ_ORDER,
  SCHWARTZ_VALUE_META,
  deriveHigherOrder,
  deriveAxes,
  deriveTopValues,
  dominantPole,
  valuesFit,
} = require("../schwartzValues");

const V = (over = {}) => ({
  self_direction: 50, stimulation: 50, hedonism: 50, achievement: 50, power: 50,
  security: 50, conformity: 50, tradition: 50, benevolence: 50, universalism: 50,
  ...over,
});

test("order and meta cover the 10 values in circular order", () => {
  assert.deepEqual(SCHWARTZ_ORDER, [
    "self_direction", "stimulation", "hedonism", "achievement", "power",
    "security", "conformity", "tradition", "benevolence", "universalism",
  ]);
  assert.deepEqual(SCHWARTZ_VALUE_META.map((m) => m.id), SCHWARTZ_ORDER);
  for (const m of SCHWARTZ_VALUE_META) assert.ok(m.label);
});

test("deriveHigherOrder splits hedonism 50/50 and averages members", () => {
  const h = deriveHigherOrder(V({ self_direction: 100, stimulation: 100, hedonism: 100 }));
  // openness = (100 + 100 + 100*0.5) / 2.5 = 100
  assert.equal(h.openness_to_change, 100);
  // enhancement = (50 + 50 + 100*0.5) / 2.5 = 60
  assert.equal(h.self_enhancement, 60);
  // conservation = mean(50,50,50) = 50; transcendence = mean(50,50) = 50
  assert.equal(h.conservation, 50);
  assert.equal(h.self_transcendence, 50);
});

test("deriveAxes: x = openness - conservation, y = transcendence - enhancement", () => {
  const axes = deriveAxes({
    openness_to_change: 80, conservation: 30,
    self_transcendence: 20, self_enhancement: 70,
  });
  assert.equal(axes.x_open_vs_conserv, 50);
  assert.equal(axes.y_transc_vs_enhance, -50);
});

test("deriveTopValues returns top-3 with circular-order tie-break; dominantPole picks the max", () => {
  const top = deriveTopValues(V({ universalism: 90, power: 85, security: 85 }));
  assert.deepEqual(top, ["universalism", "power", "security"]);
  // full tie -> first three of the circular order
  assert.deepEqual(deriveTopValues(V()), ["self_direction", "stimulation", "hedonism"]);
  assert.equal(
    dominantPole({ openness_to_change: 10, self_enhancement: 40, conservation: 90, self_transcendence: 30 }),
    "conservation"
  );
});

test("valuesFit: identical varied vectors score 100 overall", () => {
  const v = V({ self_direction: 90, stimulation: 75, power: 20, tradition: 15, universalism: 70 });
  const fit = valuesFit(v, v);
  assert.equal(fit.overall, 100);
  assert.equal(fit.axisFit, 100);
  assert.equal(fit.detailFit, 100);
  assert.deepEqual(fit.userPoint, fit.jobPoint);
});

test("valuesFit: opposed patterns score low; fit is symmetric", () => {
  const open = V({ self_direction: 95, stimulation: 85, security: 10, conformity: 10, tradition: 5 });
  const conservative = V({ self_direction: 10, stimulation: 5, security: 95, conformity: 90, tradition: 85 });
  const fit = valuesFit(open, conservative);
  assert.ok(fit.overall < 40, `expected < 40, got ${fit.overall}`);
  assert.equal(fit.overall, valuesFit(conservative, open).overall);
});

test("valuesFit tolerates flat vectors (zero-norm cosine -> neutral, no crash)", () => {
  const fit = valuesFit(V(), V({ power: 90 }));
  assert.ok(Number.isFinite(fit.overall));
  assert.ok(fit.overall >= 0 && fit.overall <= 100);
});

// --- direction prototypes + deterministic fallbacks ---

const {
  SCHWARTZ_DIRECTION_PROTOTYPES,
  buildFallbackProfessionValues,
  inferUserValuesFallback,
} = require("../schwartzValues");
const { DIRECTION_IDS } = require("../directions");

function spread(v) {
  const nums = SCHWARTZ_ORDER.map((k) => v[k]);
  return Math.max(...nums) - Math.min(...nums);
}

test("every catalog direction has a valid, non-flat, circumplex-respecting prototype", () => {
  assert.deepEqual(Object.keys(SCHWARTZ_DIRECTION_PROTOTYPES).sort(), [...DIRECTION_IDS].sort());
  for (const [id, proto] of Object.entries(SCHWARTZ_DIRECTION_PROTOTYPES)) {
    for (const key of SCHWARTZ_ORDER) {
      assert.ok(proto[key] >= 0 && proto[key] <= 100, `${id}.${key} out of range`);
    }
    assert.ok(spread(proto) >= 25, `${id} prototype too flat (${spread(proto)})`);
    assert.ok(
      !(proto.self_direction > 70 && proto.tradition > 70),
      `${id}: self_direction and tradition both high`
    );
    assert.ok(
      !(proto.power > 70 && proto.universalism > 70),
      `${id}: power and universalism both high`
    );
  }
});

test("buildFallbackProfessionValues pulls the prototype toward jobChar targets", () => {
  const jc = { compensation: 50, work_mode: 50, job_security: 50, career_growth: 50, complexity: 50, meaning_impact: 95, social: 50 };
  const base = SCHWARTZ_DIRECTION_PROTOTYPES.tech;
  const adjusted = buildFallbackProfessionValues("tech", jc);
  assert.ok(adjusted.universalism > base.universalism, "meaning target raises universalism");
  for (const key of SCHWARTZ_ORDER) {
    assert.ok(adjusted[key] >= 0 && adjusted[key] <= 100);
  }
  // unknown direction still yields a usable non-flat profile
  const unknown = buildFallbackProfessionValues("nope", jc);
  assert.ok(spread(unknown) >= 15);
});

test("inferUserValuesFallback: varied profile -> in-range non-flat; empty -> all 50", () => {
  const varied = inferUserValuesFallback({
    bigFiveScores: { O: 90, C: 30, E: 65, A: 75, N: 40 },
    riasecScores: { R: 20, I: 70, A: 85, S: 60, E: 40, C: 25 },
    jobCharProfile: { compensation: 30, work_mode: 85, job_security: 20, career_growth: 45, complexity: 80, meaning_impact: 90, social: 60 },
  });
  for (const key of SCHWARTZ_ORDER) {
    assert.ok(varied[key] >= 0 && varied[key] <= 100, `${key} out of range`);
  }
  assert.ok(spread(varied) >= 15, `too flat: ${spread(varied)}`);

  assert.deepEqual(inferUserValuesFallback({}), V());
});
