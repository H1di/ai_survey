const test = require("node:test");
const assert = require("node:assert/strict");
const { createAiEngine, normalizePathPayload, normalizeGuidancePayload } = require("../engine/aiEngine");
const { buildPathPrompt } = require("../engine/prompts");
const { createCatalogue } = require("../catalogue");
const { slotsFor } = require("../path/caseEngine");
const { buildCandidateSets } = require("../path/pathEngine");

const catalogue = createCatalogue({ importPath: "/nonexistent.json" });
const PROFILE = {
  status: "school_leaver",
  age: 17,
  field: "healthcare",
  level: "bachelor",
  goal: "Become a physio. Email me at someone@example.com",
  location: "anywhere",
  budget: "any",
  time: "either",
  start: "september",
};
const CASE = { id: "first_course", label: "Choosing a first course", summary: "Summary." };
const sets = buildCandidateSets(catalogue, slotsFor("first_course", PROFILE), PROFILE, { nowMonth: 6 });

// A fake Responses client that returns a fixed JSON reply and records the call.
function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    responses: {
      create: async (args) => {
        calls.push(args);
        if (reply instanceof Error) throw reply;
        return { output_text: typeof reply === "string" ? reply : JSON.stringify(reply) };
      },
    },
  };
}

test("path prompt lists only catalogue candidates and scrubs PII from the goal", () => {
  const { user, system } = buildPathPrompt({ profile: PROFILE, caseInfo: CASE, sets });
  assert.match(system, /Never invent a course/);
  assert.ok(!user.includes("someone@example.com"));
  for (const { candidates } of sets) {
    for (const c of candidates) assert.ok(user.includes(c.course.id));
  }
});

test("normalizePathPayload keeps listed picks only, once per slot", () => {
  const listed = sets[1].candidates[1].course.id;
  const out = normalizePathPayload(
    {
      summary: "  A path.  ",
      steps: [
        { slot: "main", courseId: listed, why: "Fits your goal." },
        { slot: "main", courseId: sets[1].candidates[0].course.id, why: "dup slot" },
        { slot: "prepare", courseId: "invented-course", why: "made up" },
      ],
    },
    sets
  );
  assert.deepEqual(out.picks, { main: listed });
  assert.equal(out.whyBySlot.main, "Fits your goal.");
  assert.equal(out.summary, "A path.");
  assert.throws(() => normalizePathPayload({ steps: [{ slot: "main", courseId: "nope" }] }, sets), /No listed course/);
});

test("generatePath with a client: sends store:false and a token cap", async () => {
  const client = fakeClient({ summary: "S", steps: [{ slot: "main", courseId: sets[1].candidates[0].course.id, why: "W" }] });
  const ai = createAiEngine({ model: "m", client });
  const out = await ai.generatePath({ profile: PROFILE, caseInfo: CASE, sets });
  assert.equal(out.source, "ai");
  assert.equal(client.calls[0].store, false);
  assert.ok(client.calls[0].max_output_tokens > 0);
});

test("generatePath falls back to rules on an error or a junk reply", async () => {
  for (const reply of [new Error("timeout"), "not json", { steps: [{ slot: "main", courseId: "fake" }] }]) {
    const ai = createAiEngine({ model: "m", client: fakeClient(reply) });
    const original = console.error;
    console.error = () => {};
    try {
      const out = await ai.generatePath({ profile: PROFILE, caseInfo: CASE, sets });
      assert.equal(out.source, "rules");
      assert.ok(Object.values(out.picks).every(Boolean));
    } finally {
      console.error = original;
    }
  }
});

test("keyless engine never calls out", async () => {
  const ai = createAiEngine({ model: "m" });
  assert.equal(ai.enabled, false);
  const out = await ai.generatePath({ profile: PROFILE, caseInfo: CASE, sets });
  assert.equal(out.source, "rules");
});

test("normalizeGuidancePayload keeps notes only for known scenarios", () => {
  const facts = { scenarios: [{ id: "fastest" }, { id: "cheapest" }] };
  const out = normalizeGuidancePayload(
    { explanation: "Because.", points: ["a", "b", "c", "d", "e"], scenarioNotes: { fastest: "Quick.", bogus: "x" } },
    facts
  );
  assert.equal(out.points.length, 4);
  assert.deepEqual(out.scenarioNotes, { fastest: "Quick." });
  assert.throws(() => normalizeGuidancePayload({ explanation: "" }, facts));
});
