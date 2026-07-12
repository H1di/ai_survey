const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const {
  convertToMarkdown,
  cleanMarkdown,
  isMarkitdownAvailable,
} = require("../services/markitdown");

const FAKE_BIN = path.join(__dirname, "fixtures", "fake-markitdown");
const FAKE_FAIL_BIN = path.join(__dirname, "fixtures", "fake-markitdown-fail");
const MISSING_BIN = "/nonexistent/markitdown-none";

test("cleanMarkdown strips images, unwraps links, collapses blank runs", () => {
  const out = cleanMarkdown("A\n\n\n\n![x](y)\n\n[text](url)\n\n\nB");
  assert.equal(out, "A\n\ntext\n\nB");
});

test("isMarkitdownAvailable: true for the stub, false for a missing binary", async () => {
  process.env.MARKITDOWN_BIN = FAKE_BIN;
  assert.equal(await isMarkitdownAvailable(), true);
  process.env.MARKITDOWN_BIN = MISSING_BIN;
  assert.equal(await isMarkitdownAvailable(), false);
});

test("convertToMarkdown spawns the binary and cleans its stdout", async () => {
  process.env.MARKITDOWN_BIN = FAKE_BIN;
  const md = await convertToMarkdown(Buffer.from("x"), "cv.pptx");
  assert.match(md, /^# Jane Doe/);
  assert.match(md, /Senior nurse at City Hospital/);
  assert.doesNotMatch(md, /!\[/);
  assert.doesNotMatch(md, /\n{3,}/);
});

test("convertToMarkdown rejects when the binary exits non-zero", async () => {
  process.env.MARKITDOWN_BIN = FAKE_FAIL_BIN;
  await assert.rejects(convertToMarkdown(Buffer.from("x"), "cv.pdf"), /boom/);
});

test("convertToMarkdown rejects when the binary is missing", async () => {
  process.env.MARKITDOWN_BIN = MISSING_BIN;
  await assert.rejects(convertToMarkdown(Buffer.from("x"), "cv.pdf"));
});
