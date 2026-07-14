const test = require("node:test");
const assert = require("node:assert/strict");
const {
  mapSocToDirection,
  parseTsv,
  transform,
} = require("../scripts/build-onet-snapshot");
const { DIRECTION_IDS } = require("../directions");

test("mapSocToDirection: major groups land on catalog families", () => {
  assert.equal(mapSocToDirection("11-1011.00"), "business");
  assert.equal(mapSocToDirection("15-1252.00"), "tech");
  assert.equal(mapSocToDirection("17-2051.00"), "tech");
  assert.equal(mapSocToDirection("19-1013.00"), "science");
  assert.equal(mapSocToDirection("21-1021.00"), "social");
  assert.equal(mapSocToDirection("23-2011.00"), "law");
  assert.equal(mapSocToDirection("25-2021.00"), "education");
  assert.equal(mapSocToDirection("29-1141.00"), "healthcare");
  assert.equal(mapSocToDirection("31-9092.00"), "healthcare");
  assert.equal(mapSocToDirection("33-3051.00"), "law");
  assert.equal(mapSocToDirection("35-1011.00"), "hospitality");
  assert.equal(mapSocToDirection("41-2031.00"), "business");
  assert.equal(mapSocToDirection("45-2092.00"), "agriculture");
  assert.equal(mapSocToDirection("47-2111.00"), "trades");
  assert.equal(mapSocToDirection("49-9021.00"), "trades");
  assert.equal(mapSocToDirection("51-4121.00"), "trades");
  assert.equal(mapSocToDirection("53-3032.00"), "trades");
});

test("mapSocToDirection: longest-prefix overrides split mixed major groups", () => {
  // 13: business ops specialists vs financial specialists
  assert.equal(mapSocToDirection("13-1111.00"), "business");
  assert.equal(mapSocToDirection("13-2011.00"), "finance");
  // 15-2 math occupations lean science, but actuaries are a finance archetype
  assert.equal(mapSocToDirection("15-2041.00"), "science");
  assert.equal(mapSocToDirection("15-2011.00"), "finance");
  // 27 spans arts / design / sports / media
  assert.equal(mapSocToDirection("27-1013.00"), "arts"); // fine artists
  assert.equal(mapSocToDirection("27-1024.00"), "design"); // graphic designers
  assert.equal(mapSocToDirection("27-2011.00"), "arts"); // actors
  assert.equal(mapSocToDirection("27-2022.00"), "sports"); // coaches and scouts
  assert.equal(mapSocToDirection("27-3023.00"), "media"); // journalists
  assert.equal(mapSocToDirection("27-4021.00"), "arts"); // photographers
  // 29/39 fitness overrides
  assert.equal(mapSocToDirection("29-9091.00"), "sports"); // athletic trainers
  assert.equal(mapSocToDirection("39-9031.00"), "sports"); // fitness trainers
  // 37 grounds maintenance is agriculture-family work, cleaning is trades
  assert.equal(mapSocToDirection("37-3011.00"), "agriculture");
  assert.equal(mapSocToDirection("37-2011.00"), "trades");
  // 39 splits: animal care, childcare, personal service
  assert.equal(mapSocToDirection("39-2021.00"), "agriculture");
  assert.equal(mapSocToDirection("39-9011.00"), "social");
  assert.equal(mapSocToDirection("39-5012.00"), "hospitality");
  // 43-3 financial clerks vs generic office support
  assert.equal(mapSocToDirection("43-3031.00"), "finance");
  assert.equal(mapSocToDirection("43-6014.00"), "business");
});

test("mapSocToDirection: unknown major group returns null, all results are catalog ids", () => {
  assert.equal(mapSocToDirection("99-9999.00"), null);
  const socs = ["11-1011.00", "13-2011.00", "27-2022.00", "39-2021.00", "53-3032.00"];
  for (const soc of socs) {
    assert.ok(DIRECTION_IDS.includes(mapSocToDirection(soc)), soc);
  }
});

test("parseTsv turns a header row + data rows into keyed objects", () => {
  const rows = parseTsv("A\tB\n1\tx\n2\ty\n");
  assert.deepEqual(rows, [
    { A: "1", B: "x" },
    { A: "2", B: "y" },
  ]);
});

const OI = [
  ["1.B.1.a", "Realistic"],
  ["1.B.1.b", "Investigative"],
  ["1.B.1.c", "Artistic"],
  ["1.B.1.d", "Social"],
  ["1.B.1.e", "Enterprising"],
  ["1.B.1.f", "Conventional"],
];

function interestRows(soc, values) {
  return OI.map(([id, name], i) => ({
    "O*NET-SOC Code": soc,
    "Element ID": id,
    "Element Name": name,
    "Scale ID": "OI",
    "Data Value": String(values[i]),
  }));
}

function skillRow(soc, name, im, suppress = "N") {
  return {
    "O*NET-SOC Code": soc,
    "Element Name": name,
    "Scale ID": "IM",
    "Data Value": String(im),
    "Recommend Suppress": suppress,
  };
}

function fixtureTables() {
  return {
    occupationData: [
      {
        "O*NET-SOC Code": "15-1252.00",
        Title: "Software Developers",
        Description:
          "Research, design, and develop computer software. Analyze user needs and develop solutions.",
      },
      {
        "O*NET-SOC Code": "29-1141.00",
        Title: "Registered Nurses",
        Description: "Assess patient health problems and needs.",
      },
      {
        "O*NET-SOC Code": "11-1011.00",
        Title: "Chief Executives",
        Description: "No interest data for this one — must be dropped.",
      },
    ],
    interests: [
      ...interestRows("15-1252.00", [4, 7, 1, 1, 2.5, 4]),
      ...interestRows("29-1141.00", [2, 4, 1, 7, 2, 3]),
    ],
    jobZones: [
      { "O*NET-SOC Code": "15-1252.00", "Job Zone": "4" },
      { "O*NET-SOC Code": "29-1141.00", "Job Zone": "3" },
    ],
    essentialSkills: [
      skillRow("15-1252.00", "Programming", 4.5),
      skillRow("15-1252.00", "Reading Comprehension", 4.0),
      skillRow("15-1252.00", "Suppressed Skill", 5.0, "Y"),
      // LV rows must be ignored even with big values
      { ...skillRow("15-1252.00", "Level Row", 6.8), "Scale ID": "LV" },
    ],
    transferableSkills: [
      skillRow("15-1252.00", "Critical Thinking", 4.2),
      skillRow("15-1252.00", "Skill A", 3.0),
      skillRow("15-1252.00", "Skill B", 3.1),
      skillRow("15-1252.00", "Skill C", 3.2),
      skillRow("15-1252.00", "Skill D", 3.3),
      skillRow("15-1252.00", "Skill E", 3.4),
      skillRow("15-1252.00", "Skill F", 3.5),
      skillRow("29-1141.00", "Service Orientation", 4.1),
    ],
    softwareSkills: [
      { "O*NET-SOC Code": "15-1252.00", "Workplace Example": "Apache Kafka", "Hot Technology": "N", "In Demand": "N" },
      { "O*NET-SOC Code": "15-1252.00", "Workplace Example": "Git", "Hot Technology": "Y", "In Demand": "Y" },
      { "O*NET-SOC Code": "15-1252.00", "Workplace Example": "Python", "Hot Technology": "Y", "In Demand": "N" },
    ],
    relatedOccupations: [
      { "O*NET-SOC Code": "15-1252.00", "Related O*NET-SOC Code": "15-1253.00", "Relatedness Tier": "Primary-Short", Index: "2" },
      { "O*NET-SOC Code": "15-1252.00", "Related O*NET-SOC Code": "15-1251.00", "Relatedness Tier": "Primary-Short", Index: "1" },
      { "O*NET-SOC Code": "15-1252.00", "Related O*NET-SOC Code": "15-1299.00", "Relatedness Tier": "Supplemental", Index: "1" },
    ],
  };
}

test("transform builds compact snapshot entries", () => {
  const { occupations } = transform(fixtureTables());
  assert.equal(occupations.length, 2); // no-interest occupation dropped

  const dev = occupations.find((o) => o.soc === "15-1252.00");
  assert.equal(dev.title, "Software Developers");
  assert.equal(dev.blurb, "Research, design, and develop computer software.");
  assert.equal(dev.jobZone, 4);
  assert.equal(dev.directionId, "tech");
  // OI 1-7 -> 0-100: (v - 1) / 6 * 100, rounded
  assert.deepEqual(dev.riasec, { R: 50, I: 100, A: 0, S: 0, E: 25, C: 50 });
  // IM-ranked, suppressed + LV rows ignored, capped at 8
  assert.equal(dev.skills.length, 8);
  assert.deepEqual(dev.skills.slice(0, 3), ["Programming", "Critical Thinking", "Reading Comprehension"]);
  assert.ok(!dev.skills.includes("Suppressed Skill"));
  assert.ok(!dev.skills.includes("Level Row"));
  // Hot tech first, then in-demand, then the rest
  assert.deepEqual(dev.tech, ["Git", "Python", "Apache Kafka"]);
  // Primary-Short only, ordered by Index
  assert.deepEqual(dev.related, ["15-1251.00", "15-1253.00"]);

  const nurse = occupations.find((o) => o.soc === "29-1141.00");
  assert.equal(nurse.directionId, "healthcare");
  assert.deepEqual(nurse.skills, ["Service Orientation"]);
  assert.deepEqual(nurse.tech, []);
  assert.deepEqual(nurse.related, []);
});

test("transform fails loudly when a SOC maps to no direction", () => {
  const tables = fixtureTables();
  tables.occupationData.push({
    "O*NET-SOC Code": "98-0000.00",
    Title: "Mystery Job",
    Description: "Unmappable.",
  });
  tables.interests.push(...interestRows("98-0000.00", [4, 4, 4, 4, 4, 4]));
  assert.throws(() => transform(tables), /98-0000\.00/);
});
