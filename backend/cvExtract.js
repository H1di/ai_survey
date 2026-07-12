// CV file → plain text. MarkItDown (optional Python CLI) is the primary
// converter when its binary is present; the Node parsers below are the
// fallback so hosts without Python (e.g. Render) keep working. Hard failures
// become 400s so the route never 500s on a user's weird file.
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const { convertToMarkdown, isMarkitdownAvailable } = require("./services/markitdown");

const BASE_EXTENSIONS = [".pdf", ".docx", ".txt", ".html", ".htm"];
const MARKITDOWN_ONLY_EXTENSIONS = [".pptx"];

function httpErr(status, message) {
  const err = new Error(message);
  err.statusCode = status;
  return err;
}

function fileKind({ originalname = "", mimetype = "" }) {
  const name = originalname.toLowerCase();
  if (name.endsWith(".txt") || mimetype === "text/plain") return "txt";
  if (name.endsWith(".pdf") || mimetype === "application/pdf") return "pdf";
  if (
    name.endsWith(".docx") ||
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    return "docx";
  }
  if (
    name.endsWith(".pptx") ||
    mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation"
  ) {
    return "pptx";
  }
  if (name.endsWith(".html") || name.endsWith(".htm") || mimetype === "text/html") return "html";
  return null;
}

// Dependency-free HTML fallback: enough for LinkedIn exports and saved pages.
function stripHtml(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^ +| +$/gm, "")
    .trim();
}

async function nativeExtract(kind, buffer) {
  if (kind === "pdf") {
    const { text } = await pdfParse(buffer);
    return text;
  }
  if (kind === "docx") {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }
  if (kind === "html") return stripHtml(buffer.toString("utf8"));
  return null; // pptx has no native path
}

async function extractCvText(file) {
  const kind = fileKind(file);
  if (!kind) {
    throw httpErr(
      400,
      "Unsupported file type. Upload .pdf, .docx, .pptx, .html, or .txt — or paste the text."
    );
  }
  if (kind === "txt") return file.buffer.toString("utf8");

  if (await isMarkitdownAvailable()) {
    try {
      return await convertToMarkdown(file.buffer, file.originalname);
    } catch (error) {
      // Broken/hung binary must not take the request down with it.
      console.error("[markitdown fallback]", error.message);
    }
  }

  let text;
  try {
    text = await nativeExtract(kind, file.buffer);
  } catch (_error) {
    throw httpErr(400, "Could not read the file. Try pasting the text instead.");
  }
  if (text !== null) return text;
  throw httpErr(
    400,
    ".pptx uploads need MarkItDown on the server. Convert to PDF or paste the text instead."
  );
}

async function getCvUploadExtensions() {
  return (await isMarkitdownAvailable())
    ? [...BASE_EXTENSIONS, ...MARKITDOWN_ONLY_EXTENSIONS]
    : BASE_EXTENSIONS;
}

module.exports = { extractCvText, getCvUploadExtensions };
