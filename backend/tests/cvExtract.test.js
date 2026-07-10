const test = require("node:test");
const assert = require("node:assert/strict");
const { extractCvText } = require("../cvExtract");

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
