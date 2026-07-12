const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const { extractCvText, getCvUploadExtensions } = require("../cvExtract");

const FAKE_BIN = path.join(__dirname, "fixtures", "fake-markitdown");
const FAKE_FAIL_BIN = path.join(__dirname, "fixtures", "fake-markitdown-fail");
const MISSING_BIN = "/nonexistent/markitdown-none";

test("txt files pass through as utf8", async () => {
  const text = await extractCvText({
    originalname: "cv.txt",
    mimetype: "text/plain",
    buffer: Buffer.from("Nurse, 10 years"),
  });
  assert.equal(text, "Nurse, 10 years");
});

test("unsupported extension -> 400-coded error", async () => {
  await assert.rejects(
    extractCvText({ originalname: "cv.jpg", mimetype: "image/jpeg", buffer: Buffer.from("x") }),
    (e) => e.statusCode === 400
  );
});

test("garbage pdf bytes -> 400-coded error", async () => {
  await assert.rejects(
    extractCvText({ originalname: "cv.pdf", mimetype: "application/pdf", buffer: Buffer.from("not a pdf") }),
    (e) => e.statusCode === 400
  );
});

test("garbage docx bytes -> 400-coded error", async () => {
  await assert.rejects(
    extractCvText({
      originalname: "cv.docx",
      mimetype: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      buffer: Buffer.from("not a docx"),
    }),
    (e) => e.statusCode === 400
  );
});

test("html falls back to tag-strip when markitdown is absent", async () => {
  process.env.MARKITDOWN_BIN = MISSING_BIN;
  const text = await extractCvText({
    originalname: "cv.html",
    mimetype: "text/html",
    buffer: Buffer.from(
      "<html><style>p{color:red}</style><body><p>Nurse &amp; mentor</p><script>x()</script></body></html>"
    ),
  });
  assert.equal(text, "Nurse & mentor");
});

test("pptx without markitdown -> 400 with guidance", async () => {
  process.env.MARKITDOWN_BIN = MISSING_BIN;
  await assert.rejects(
    extractCvText({ originalname: "deck.pptx", mimetype: "", buffer: Buffer.from("x") }),
    (e) => e.statusCode === 400 && /MarkItDown/.test(e.message)
  );
});

test("pptx goes through markitdown when available", async () => {
  process.env.MARKITDOWN_BIN = FAKE_BIN;
  const text = await extractCvText({ originalname: "deck.pptx", mimetype: "", buffer: Buffer.from("x") });
  assert.match(text, /Jane Doe/);
});

test("a markitdown crash degrades to the native parser in the same request", async () => {
  process.env.MARKITDOWN_BIN = FAKE_FAIL_BIN;
  const text = await extractCvText({
    originalname: "cv.html",
    mimetype: "text/html",
    buffer: Buffer.from("<p>Plan B</p>"),
  });
  assert.equal(text, "Plan B");
});

test("txt never spawns markitdown (works even with a broken binary)", async () => {
  process.env.MARKITDOWN_BIN = FAKE_FAIL_BIN;
  const text = await extractCvText({
    originalname: "cv.txt",
    mimetype: "text/plain",
    buffer: Buffer.from("plain text cv"),
  });
  assert.equal(text, "plain text cv");
});

test("getCvUploadExtensions advertises pptx only with markitdown", async () => {
  process.env.MARKITDOWN_BIN = FAKE_BIN;
  assert.ok((await getCvUploadExtensions()).includes(".pptx"));
  process.env.MARKITDOWN_BIN = MISSING_BIN;
  const without = await getCvUploadExtensions();
  assert.ok(!without.includes(".pptx"));
  assert.deepEqual(without, [".pdf", ".docx", ".txt", ".html", ".htm"]);
});
