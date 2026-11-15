const test = require("node:test");
const assert = require("node:assert/strict");
const { scrubPii, scrubCvHeader } = require("../engine/piiScrub");

test("emails become [email], plus-addressing included", () => {
  assert.equal(scrubPii("write to olena.k+work@example.com.ua now"), "write to [email] now");
});

test("phones become [phone]", () => {
  assert.equal(scrubPii("call +380 (67) 123-45-67 ok"), "call [phone] ok");
  assert.equal(scrubPii("call 067 123 45 67 ok"), "call [phone] ok");
  assert.equal(scrubPii("call +1-202-555-0143 ok"), "call [phone] ok");
  assert.equal(scrubPii("+380671234567"), "[phone]");
});

test("years, durations, ranges, salaries and percentages are untouched", () => {
  for (const s of [
    "since 2019",
    "5 years of work",
    "2019-2023",
    "2019–2023",
    "worked 2015 - 2020",
    "earned 120000 a year, up 35%",
    "2015 - 2018 - 2020",
  ]) {
    assert.equal(scrubPii(s), s);
  }
});

test("links become [link]", () => {
  assert.equal(scrubPii("see https://linkedin.com/in/olena today"), "see [link] today");
  assert.equal(scrubPii("see www.site.ua/cv today"), "see [link] today");
});

test("@handle becomes [handle]; an email is not turned into a handle", () => {
  assert.equal(scrubPii("ping @olena_k"), "ping [handle]");
  const out = scrubPii("mail olena@example.com");
  assert.equal(out, "mail [email]");
  assert.ok(!out.includes("[handle]"));
});

test("scrubCvHeader replaces a Latin or Cyrillic name line", () => {
  assert.ok(scrubCvHeader("Olena Kovalenko\nProduct designer").startsWith("[name]\nProduct designer"));
  assert.ok(scrubCvHeader("Олена Коваленко\nДизайнер").startsWith("[name]\n"));
});

test("scrubCvHeader leaves headlines and long lines alone", () => {
  const a = "PRODUCT DESIGNER WITH 5 YEARS\nmore";
  assert.equal(scrubCvHeader(a), a);
  const b = "Senior Product Designer At Large Company Today\nmore";
  assert.equal(scrubCvHeader(b), b);
});

test("a name inside a sentence passes unchanged (documented limit)", () => {
  assert.equal(scrubPii("My name is Olena Kovalenko"), "My name is Olena Kovalenko");
});

test("non-string input returns an empty string", () => {
  for (const v of [undefined, null, 42, {}]) {
    assert.equal(scrubPii(v), "");
    assert.equal(scrubCvHeader(v), "");
  }
});

test("CV date ranges, GPAs and number ranges are not phones", () => {
  for (const s of [
    "01.2019 - 03.2021 Designer at X",
    "GPA 3.85 (2016-2020)",
    "Revenue grew 150000-200000 USD",
    "06.2015 – 09.2018, 10.2018 - 02.2022",
    "2019-06 - 2021-08",
    "Salary 100 000 - 150 000",
    "GPA 3.9\n2019 - 2021 KPI",
    "team of 12\n345 67 89 units",
  ]) {
    assert.equal(scrubPii(s), s);
  }
});

test("a plus-prefixed or single-run number is still a phone", () => {
  assert.equal(scrubPii("tel +380 67 123 2019"), "tel [phone]");
  assert.equal(scrubPii("call 0671234567"), "call [phone]");
  assert.equal(scrubPii("call 067 1234567"), "call [phone]");
});

test("scrubCvHeader finds the name under a document heading", () => {
  assert.equal(scrubCvHeader("Curriculum Vitae\nOlena Kovalenko\nKyiv"), "Curriculum Vitae\n[name]\nKyiv");
  assert.equal(scrubCvHeader("Resume\n\nOlena Kovalenko\n"), "Resume\n\n[name]\n");
  assert.equal(scrubCvHeader("Резюме\nОлена Коваленко"), "Резюме\n[name]");
});

test("scrubCvHeader replaces only the name before a separator", () => {
  assert.equal(scrubCvHeader("Olena Kovalenko, Kyiv\nx"), "[name], Kyiv\nx");
  assert.equal(scrubCvHeader("Olena Kovalenko | Product Designer"), "[name] | Product Designer");
  assert.equal(scrubCvHeader("Olena Kovalenko - Designer"), "[name] - Designer");
});

test("scrubCvHeader keeps a job-title first line", () => {
  assert.equal(scrubCvHeader("Senior Product Designer\nKyiv"), "Senior Product Designer\nKyiv");
  assert.equal(scrubCvHeader("PRODUCT DESIGNER\nx"), "PRODUCT DESIGNER\nx");
});

test("scrubCvHeader looks no further than the third non-empty line", () => {
  const text = "a b c d e\nf g h i j\nk l m n o\nOlena Kovalenko";
  assert.equal(scrubCvHeader(text), text);
});
