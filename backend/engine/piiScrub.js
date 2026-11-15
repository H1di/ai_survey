// Strips contact PII from user free text before it enters an AI prompt.
// Applied at the prompt boundary only (prompts.js); stored answers stay
// verbatim. Known limit: a name inside a sentence ("My name is Olena
// Kovalenko") is NOT detected — the CV-header name line is the only name
// heuristic.

const EMAIL_RE = /[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+/g;
const LINK_RE =
  /(?:\b(?:https?|ftp):\/\/|\bwww\.|\b(?:linkedin|github|gitlab|facebook|instagram|twitter|t)\.(?:com|me|co)\/)[^\s<>"')]+/gi;
const HANDLE_RE = /(?<![\w@.])@[A-Za-z0-9_.]{2,}/g;
const PHONE_RE = /(?<![\w+])\+?\(?\d[\d\s().-]{6,}\d(?![\w])/g;
const YEAR_RANGE_RE = /^(?:(?:19|20)\d{2}[\s–—-]*)+$/;

function scrubPhone(match) {
  const digits = match.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) return match;
  if (YEAR_RANGE_RE.test(match)) return match;
  return "[phone]";
}

function scrubPii(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(EMAIL_RE, "[email]")
    .replace(LINK_RE, "[link]")
    .replace(HANDLE_RE, "[handle]")
    .replace(PHONE_RE, scrubPhone);
}

const NAME_WORD_RE = /^\p{Lu}[\p{L}'’.-]*$/u;

function scrubCvHeader(text) {
  if (typeof text !== "string") return "";
  const match = /^(\s*)([^\r\n]*\S[^\r\n]*)/.exec(text);
  if (!match) return text;
  const line = match[2].trim();
  const words = line.split(/\s+/);
  const looksLikeName =
    words.length >= 2 &&
    words.length <= 4 &&
    !/\d/.test(line) &&
    words.every((w) => NAME_WORD_RE.test(w));
  if (!looksLikeName) return text;
  return match[1] + "[name]" + text.slice(match[0].length);
}

module.exports = { scrubPii, scrubCvHeader };
