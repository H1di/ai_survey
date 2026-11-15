// Strips contact PII from user free text before it enters an AI prompt.
// Applied at the prompt boundary only (prompts.js); stored answers stay
// verbatim. Known limit: a name inside a sentence ("My name is Olena
// Kovalenko") is NOT detected — the CV-header name line is the only name
// heuristic.

const EMAIL_RE = /[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[^\s@<>()[\]",;:]+/g;
const LINK_RE =
  /(?:\b(?:https?|ftp):\/\/|\bwww\.|\b(?:linkedin|github|gitlab|facebook|instagram|twitter|t)\.(?:com|me|co)\/)[^\s<>"')]+/gi;
const HANDLE_RE = /(?<![\w@.])@[A-Za-z0-9_.]{2,}/g;
// Horizontal whitespace only: a phone never spans lines.
const PHONE_RE = /(?<![\w+])\+?\(?\d[\d \t().-]{6,}\d(?![\w])/g;
const YEAR_GROUP_RE = /^(?:19|20)\d{2}$/;
const SPACED_DASH_RE = /\s[-–—]\s/;

// CVs are full of digit runs that are not phones: "01.2019 - 03.2021",
// "GPA 3.85 (2016-2020)", "100 000 - 150 000". A leading "+" settles it;
// otherwise a year-shaped group, a spaced dash (a range) or two long groups
// (a number range) mean "not a phone".
function scrubPhone(match) {
  const groups = match.match(/\d+/g) || [];
  const digits = groups.join("").length;
  if (digits < 9 || digits > 15) return match;
  if (match.startsWith("+")) return "[phone]";
  if (groups.some((g) => YEAR_GROUP_RE.test(g))) return match;
  if (SPACED_DASH_RE.test(match)) return match;
  if (groups.filter((g) => g.length >= 6).length > 1) return match;
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
// Words that mark a heading or a job title, not a person. Never complete: a
// title outside this list is still replaced, which costs one line of signal
// (the role is repeated in the experience section) and leaks nothing.
const NOT_A_NAME_RE =
  /^(?:cv|resume|résumé|curriculum|vitae|profile|summary|contact|contacts|experience|education|skills|about|portfolio|senior|junior|middle|lead|head|chief|director|manager|designer|developer|engineer|analyst|specialist|consultant|teacher|student|officer|assistant|intern|architect|product|project|software|data|marketing|sales|резюме|досвід|опыт|освіта|образование|навички|навыки|контакти|контакты)$/i;
const HEADER_LINES = 3;

function looksLikeName(part) {
  const words = part.split(/\s+/).filter(Boolean);
  return (
    words.length >= 2 &&
    words.length <= 4 &&
    !/\d/.test(part) &&
    words.every((w) => NAME_WORD_RE.test(w) && !NOT_A_NAME_RE.test(w))
  );
}

// Replaces the name in a CV header with [name]: the first of the top three
// non-empty lines whose leading part (up to a comma, pipe, semicolon or spaced
// dash) is 2–4 capitalised words with no digits and no heading/title word.
function scrubCvHeader(text) {
  if (typeof text !== "string") return "";
  const lineRe = /[^\r\n]+/g;
  let seen = 0;
  let m;
  while (seen < HEADER_LINES && (m = lineRe.exec(text))) {
    if (!m[0].trim()) continue;
    seen += 1;
    const lead = m[0].length - m[0].trimStart().length;
    const rest = m[0].slice(lead);
    const cut = rest.search(/\s*[,|;]|\s+[-–—]\s/);
    const head = (cut === -1 ? rest : rest.slice(0, cut)).trimEnd();
    if (!looksLikeName(head)) continue;
    const start = m.index + lead;
    return text.slice(0, start) + "[name]" + text.slice(start + head.length);
  }
  return text;
}

module.exports = { scrubPii, scrubCvHeader };
