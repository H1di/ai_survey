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
