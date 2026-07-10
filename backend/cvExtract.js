// CV file → plain text. Small on purpose: three formats, hard failures
// become 400s so the route never 500s on a user's weird file.
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");

function httpErr(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

async function extractCvText({ originalname = "", mimetype = "", buffer }) {
  const name = originalname.toLowerCase();
  try {
    if (name.endsWith(".txt") || mimetype === "text/plain") {
      return buffer.toString("utf8");
    }
    if (name.endsWith(".pdf") || mimetype === "application/pdf") {
      const { text } = await pdfParse(buffer);
      return text;
    }
    if (
      name.endsWith(".docx") ||
      mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) {
      const { value } = await mammoth.extractRawText({ buffer });
      return value;
    }
  } catch (_error) {
    throw httpErr(400, "Could not read the file. Try pasting the text instead.");
  }
  throw httpErr(400, "Unsupported file type. Upload .pdf, .docx, or .txt — or paste the text.");
}

module.exports = { extractCvText };
