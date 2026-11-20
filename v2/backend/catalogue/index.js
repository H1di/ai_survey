// The course catalogue the roadmap is built from. Loads a real import from
// data/ie-courses.json when one exists (array of courses in the shape below),
// otherwise the clearly marked sample catalogue. The AI never adds to this
// list: every path step must reference a course id that is in it.
//
// Course shape:
//   { id, title, provider, providerType, award, nfqLevel, kind, directionIds[],
//     city, mode: full_time|part_time|online, durationMonths, feeEur (per year),
//     totalFeeEur, startMonth 1-12, skills[], url|null, sample?: true }

const fs = require("node:fs");
const path = require("node:path");
const { buildSampleCatalogue } = require("./sampleCatalogue");

const IMPORT_PATH = path.join(__dirname, "..", "data", "ie-courses.json");
const COURSE_KINDS = ["short", "plc", "higher_cert", "undergrad", "postgrad"];
const COURSE_MODES = ["full_time", "part_time", "online"];

function isValidCourse(c) {
  return (
    c &&
    typeof c.id === "string" &&
    typeof c.title === "string" &&
    typeof c.provider === "string" &&
    COURSE_KINDS.includes(c.kind) &&
    COURSE_MODES.includes(c.mode) &&
    Number.isFinite(c.nfqLevel) &&
    Number.isFinite(c.feeEur) &&
    Number.isFinite(c.durationMonths) &&
    Array.isArray(c.directionIds) &&
    Array.isArray(c.skills)
  );
}

function loadCatalogue({ importPath = IMPORT_PATH } = {}) {
  if (fs.existsSync(importPath)) {
    const raw = JSON.parse(fs.readFileSync(importPath, "utf8"));
    const courses = (Array.isArray(raw) ? raw : raw.courses || []).filter(isValidCourse);
    if (courses.length) return { source: "import", courses };
    console.error(`[catalogue] ${importPath} has no valid courses — using the sample catalogue.`);
  }
  return { source: "sample", courses: buildSampleCatalogue() };
}

function createCatalogue(options) {
  const { source, courses } = loadCatalogue(options);
  const byId = new Map(courses.map((c) => [c.id, c]));

  return {
    source,
    courses,
    count: courses.length,
    get: (id) => byId.get(id) || null,
    has: (id) => byId.has(id),
    // Browse/search for the course picker (add, swap, compare). Plain filters,
    // no scoring — the user is choosing, so nothing is hidden by fit.
    search({ q, field, city, mode, kind, maxFee, limit = 60 } = {}) {
      const needle = typeof q === "string" ? q.trim().toLowerCase() : "";
      const cap = Number.isFinite(Number(maxFee)) && maxFee !== "" && maxFee !== null ? Number(maxFee) : Infinity;
      return courses
        .filter((c) => !field || c.directionIds.includes(field))
        .filter((c) => !city || c.city === city)
        .filter((c) => !mode || c.mode === mode)
        .filter((c) => !kind || c.kind === kind)
        .filter((c) => c.feeEur <= cap)
        .filter(
          (c) =>
            !needle ||
            c.title.toLowerCase().includes(needle) ||
            c.provider.toLowerCase().includes(needle) ||
            c.skills.some((s) => s.toLowerCase().includes(needle))
        )
        .slice(0, Math.max(1, Math.min(200, Number(limit) || 60)));
    },
    describe() {
      return {
        source,
        count: courses.length,
        notice:
          source === "sample"
            ? "Sample catalogue: these courses and providers are placeholders, not real Irish courses. The Qualifax/FETCH import replaces them."
            : null,
      };
    },
  };
}

module.exports = { createCatalogue, loadCatalogue, isValidCourse, COURSE_KINDS, COURSE_MODES };
