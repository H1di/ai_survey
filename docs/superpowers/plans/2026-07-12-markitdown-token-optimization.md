# MarkItDown Upload + Token Caps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route CV uploads through the MarkItDown CLI when available (adding `.pptx`/`.html` support) with the existing Node parsers as fallback, extend the CV digest with `roles`/`keywords`, and put an explicit `max_tokens` ceiling on every OpenAI call.

**Architecture:** A new `backend/services/markitdown.js` wraps the optional Python CLI (spawn + timeout + cached availability probe). `backend/cvExtract.js` becomes a hybrid router: MarkItDown primary, pdf-parse/mammoth/tag-strip fallback. The server advertises supported extensions in every session snapshot (`cvUploadFormats`); the frontend builds its file-input `accept` from that. `runJsonCompletion` gains a `maxTokens` param set explicitly at all 11 call sites.

**Tech Stack:** Node + Express 5 (CommonJS), multer 2, node:test, React 19 + Vite, MarkItDown (optional external CLI, never a hard dependency).

**Spec:** `docs/superpowers/specs/2026-07-12-markitdown-token-optimization-design.md`

## Global Constraints

- Branch: `feat/markitdown-upload` (already created from `origin/main`).
- **No new npm dependencies.** multer, pdf-parse, mammoth are already in `backend/package.json`.
- The app must keep working with **no OpenAI key AND no markitdown binary** (Render's node runtime has neither Python nor markitdown). Every new path needs a deterministic fallback or an honest 400.
- Raw document text is never sent to the main prompts; converted text is capped at 6000 chars before the LLM (existing `server.js:399` behavior — do not change).
- Images are **rejected** (no OCR without an LLM client inside markitdown); `.pptx` without markitdown → 400 with guidance.
- `MARKITDOWN_BIN` env var overrides the binary path; the availability probe is cached **per bin path** (this is what lets tests flip between stub/absent without cache resets).
- Backend tests: `cd backend && npm test` (runs `node --test tests/*.test.js`; each file is its own process). Single file: `cd backend && node --test tests/<file>.test.js`.
- Frontend tests: `cd frontend && npm test -- --run`.
- All existing tests (110+ backend, frontend Vitest) must stay green after every task.
- Commit after every task; end commit messages with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: MarkItDown CLI wrapper (`services/markitdown.js`)

**Files:**
- Create: `backend/services/markitdown.js`
- Create: `backend/tests/fixtures/fake-markitdown` (executable)
- Create: `backend/tests/fixtures/fake-markitdown-fail` (executable)
- Test: `backend/tests/markitdown.test.js`

**Interfaces:**
- Consumes: nothing from this repo (only node stdlib).
- Produces:
  - `convertToMarkdown(buffer: Buffer, originalname: string) => Promise<string>` — writes a temp file, spawns the binary, returns **cleaned** markdown; rejects on non-zero exit, spawn error, or 20 s timeout.
  - `cleanMarkdown(md: string) => string` — strips markdown images, unwraps links to their text, collapses 3+ newlines to 2, trims.
  - `isMarkitdownAvailable() => Promise<boolean>` — `<bin> --version` probe, cached per bin path, never rejects.

- [ ] **Step 1: Create the fake-markitdown fixtures**

`backend/tests/fixtures/fake-markitdown`:

```js
#!/usr/bin/env node
// Stand-in for the MarkItDown CLI in tests: answers --version and prints
// canned markdown (with images/links/blank runs) for any file argument.
if (process.argv[2] === "--version") {
  console.log("markitdown 0.0.0-fake");
  process.exit(0);
}
process.stdout.write(
  "# Jane Doe\n\n\n\n![photo](data:image/png;base64,AAA)\n\nSenior [nurse](https://example.com) at City Hospital\n\n- Skill: triage\n- Skill: mentoring\n"
);
```

`backend/tests/fixtures/fake-markitdown-fail`:

```js
#!/usr/bin/env node
// Probe succeeds (--version), any conversion fails — exercises the
// "markitdown present but broken" degradation path.
if (process.argv[2] === "--version") {
  console.log("markitdown 0.0.0-fake");
  process.exit(0);
}
console.error("boom");
process.exit(1);
```

Make both executable (the mode bit must be committed):

```bash
chmod +x backend/tests/fixtures/fake-markitdown backend/tests/fixtures/fake-markitdown-fail
```

- [ ] **Step 2: Write the failing tests**

`backend/tests/markitdown.test.js`:

```js
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd backend && node --test tests/markitdown.test.js`
Expected: FAIL — `Cannot find module '../services/markitdown'`

- [ ] **Step 4: Implement `backend/services/markitdown.js`**

```js
// MarkItDown CLI wrapper. The binary is optional infrastructure: callers must
// survive it being absent (probe -> false) or broken (convert rejects), so a
// host without Python (e.g. Render's node runtime) degrades, never breaks.
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const PROBE_TIMEOUT_MS = 5_000;
const CONVERT_TIMEOUT_MS = 20_000;

function markitdownBin() {
  return process.env.MARKITDOWN_BIN || "markitdown";
}

function runProcess(bin, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stdout = "";
    let stderr = "";
    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      finish(reject, new Error(`${bin} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    proc.stdout.on("data", (d) => (stdout += d));
    proc.stderr.on("data", (d) => (stderr += d));
    proc.on("error", (err) => finish(reject, err));
    proc.on("close", (code) => {
      if (code !== 0) return finish(reject, new Error(stderr.trim() || `${bin} exited ${code}`));
      finish(resolve, stdout);
    });
  });
}

// Cached per bin path so tests can flip MARKITDOWN_BIN between a stub and a
// missing path without cache resets. Never rejects.
const probeCache = new Map();
function isMarkitdownAvailable() {
  const bin = markitdownBin();
  if (!probeCache.has(bin)) {
    probeCache.set(
      bin,
      runProcess(bin, ["--version"], PROBE_TIMEOUT_MS).then(
        () => true,
        () => false
      )
    );
  }
  return probeCache.get(bin);
}

function cleanMarkdown(md) {
  return md
    .replace(/!\[.*?\]\(.*?\)/g, "") // markdown images (base64 payloads eat tokens)
    .replace(/\[(.*?)\]\(.*?\)/g, "$1") // links -> just their text
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function convertToMarkdown(buffer, originalname) {
  // markitdown sniffs the format from the extension; keep it, drop the name
  // (a user filename must never influence the tmp path).
  const ext = path.extname(originalname).toLowerCase() || ".bin";
  const tmpPath = path.join(os.tmpdir(), `upload_${crypto.randomUUID()}${ext}`);
  await fs.writeFile(tmpPath, buffer);
  try {
    const output = await runProcess(markitdownBin(), [tmpPath], CONVERT_TIMEOUT_MS);
    return cleanMarkdown(output);
  } finally {
    await fs.unlink(tmpPath).catch(() => {});
  }
}

module.exports = { convertToMarkdown, cleanMarkdown, isMarkitdownAvailable };
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && node --test tests/markitdown.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/services/markitdown.js backend/tests/fixtures/fake-markitdown backend/tests/fixtures/fake-markitdown-fail backend/tests/markitdown.test.js
git commit -m "feat(cv): MarkItDown CLI wrapper with availability probe and markdown cleanup"
```

---

### Task 2: Hybrid extraction in `cvExtract.js`

**Files:**
- Modify: `backend/cvExtract.js` (full rewrite below)
- Test: `backend/tests/cvExtract.test.js` (append tests; existing 4 tests must stay green unchanged)

**Interfaces:**
- Consumes: `convertToMarkdown`, `isMarkitdownAvailable` from `../services/markitdown` (Task 1).
- Produces:
  - `extractCvText(file: {originalname, mimetype, buffer}) => Promise<string>` — same signature the route already awaits; now also handles `.pptx`/`.html`/`.htm`.
  - `getCvUploadExtensions() => Promise<string[]>` — `[".pdf",".docx",".txt",".html",".htm"]`, plus `".pptx"` when markitdown is available. Used by Task 3.

**Routing matrix (from the spec):** txt → utf8 directly (no spawn); pdf/docx/html → markitdown when available, else pdf-parse/mammoth/tag-strip; a markitdown *crash* falls back to the native parser within the same request; pptx → markitdown only, else 400; anything else (incl. images) → 400.

- [ ] **Step 1: Append the failing tests**

Append to `backend/tests/cvExtract.test.js` (also add to the top imports: `const path = require("path");` and `const { getCvUploadExtensions } = require("../cvExtract");` — extend the existing require line):

```js
const FAKE_BIN = path.join(__dirname, "fixtures", "fake-markitdown");
const FAKE_FAIL_BIN = path.join(__dirname, "fixtures", "fake-markitdown-fail");
const MISSING_BIN = "/nonexistent/markitdown-none";

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
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `cd backend && node --test tests/cvExtract.test.js`
Expected: existing 4 PASS, new 6 FAIL (unsupported type / `getCvUploadExtensions` not a function)

- [ ] **Step 3: Rewrite `backend/cvExtract.js`**

```js
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
```

- [ ] **Step 4: Run the file's tests, then the whole backend suite**

Run: `cd backend && node --test tests/cvExtract.test.js`
Expected: PASS (10 tests). Note: the "garbage pdf/docx → 400" tests stay green in both worlds — without markitdown they hit pdf-parse/mammoth directly; with a real markitdown installed globally, markitdown also fails on garbage and the native parser still produces the 400.

Run: `cd backend && npm test`
Expected: PASS (nothing else imports cvExtract's shape yet)

- [ ] **Step 5: Commit**

```bash
git add backend/cvExtract.js backend/tests/cvExtract.test.js
git commit -m "feat(cv): hybrid extraction — MarkItDown primary, Node parsers fallback, pptx/html support"
```

---

### Task 3: Route limits + `cvUploadFormats` in snapshots

**Files:**
- Modify: `backend/server.js:6` (import), `backend/server.js:138-148` (snapshot), `backend/server.js:383-401` (multer limit + message)
- Modify: `backend/tests/server.test.js:241-248` (oversized test) + one new test
- Create: `backend/tests/cvUploadMarkitdown.test.js`

**Interfaces:**
- Consumes: `getCvUploadExtensions` (Task 2).
- Produces: every session snapshot response now carries `cvUploadFormats: string[]` (next to `aiEnabled`). Task 6 (frontend) consumes it.

- [ ] **Step 1: Update the oversized-upload test and add the formats test**

In `backend/tests/server.test.js`, the test `"cv upload rejects oversized files with a 400"` currently sends 3 MB — under the new 5 MB cap that would succeed. Change the buffer to 6 MB:

```js
test("cv upload rejects oversized files with a 400", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", new Blob([Buffer.alloc(6 * 1024 * 1024, "a")], { type: "text/plain" }), "cv.txt");
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  assert.equal(res.status, 400);
});
```

Add next to it (this suite runs without markitdown, so `.pptx` must be absent):

```js
test("snapshots advertise cv upload formats (no pptx without markitdown)", async () => {
  const { data } = await post("/api/session/start", {
    entryChoice: "find",
    dreamAnswer: "x",
    cvIntent: "new",
  });
  assert.ok(Array.isArray(data.cvUploadFormats));
  assert.ok(data.cvUploadFormats.includes(".pdf"));
  assert.ok(!data.cvUploadFormats.includes(".pptx"));
});
```

- [ ] **Step 2: Run to verify failures**

Run: `cd backend && node --test tests/server.test.js`
Expected: the two touched tests FAIL (6 MB is also rejected today — but by the 2 MB limit, so it *passes* pre-change; the formats test FAILS on `cvUploadFormats` undefined). The oversized test genuinely proves the new limit only after Step 3 — that's fine, it's a regression guard, not a red-first test.

- [ ] **Step 3: Implement the server changes**

`backend/server.js:6` — extend the import:

```js
const { extractCvText, getCvUploadExtensions } = require("./cvExtract");
```

Below `const AI_ENABLED = ...` (line 122), add the capability cache (the probe is async; resolve it once at boot — by the first real request it is long settled):

```js
// Advertised CV upload formats. Resolved once at boot: the markitdown probe
// is async but settles in milliseconds, long before the first session starts.
let cvUploadFormats = [".pdf", ".docx", ".txt", ".html", ".htm"];
getCvUploadExtensions().then((list) => {
  cvUploadFormats = list;
});
```

In `sendSessionSnapshot` (line 138), add the field next to `aiEnabled`:

```js
  return res.json({
    ...store.serializeSessionState(session, progress, summary, { includeStatic }),
    // Lets the UI say honestly when suggestions come from fixed fallback
    // rules rather than AI (no key configured).
    aiEnabled: AI_ENABLED,
    // What the file input should accept — depends on markitdown availability.
    cvUploadFormats,
  });
```

At line 383-386, raise the multer cap:

```js
const cvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});
```

At line 401, refresh the message:

```js
      return res.status(400).json({ error: "Provide cvText or upload a supported file (.pdf/.docx/.pptx/.html/.txt)." });
```

- [ ] **Step 4: Run server tests**

Run: `cd backend && node --test tests/server.test.js`
Expected: PASS

- [ ] **Step 5: Write the markitdown-enabled route test file**

`backend/tests/cvUploadMarkitdown.test.js` — a separate file because `node --test` gives each file its own process, which is the only way to boot the server singleton with `MARKITDOWN_BIN` pointing at the stub:

```js
// Boots the server WITH a (fake) markitdown binary: pptx uploads succeed and
// snapshots advertise .pptx. Mirrors server.test.js env setup.
process.env.NODE_ENV = "test";
process.env.OPENAI_API_KEY = "";
process.env.RATE_LIMIT_GLOBAL_MAX = "1000000";
process.env.RATE_LIMIT_AI_MAX = "1000000";
process.env.MARKITDOWN_BIN = require("path").join(__dirname, "fixtures", "fake-markitdown");

const test = require("node:test");
const assert = require("node:assert/strict");
const { getCvUploadExtensions } = require("../cvExtract");
const { app } = require("../server");

let server;
let base;

test.before(async () => {
  server = app.listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
  // Let server.js's boot-time formats refresh settle before any assertions.
  await getCvUploadExtensions();
  await new Promise((resolve) => setImmediate(resolve));
});

test.after(() => server.close());

async function post(path, body) {
  const res = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

// Compact copy of server.test.js's walk (helpers are per-process; see there
// for the annotated version).
async function walkToCv() {
  let { data } = await post("/api/session/start", {
    entryChoice: "find",
    dreamAnswer: "build useful things",
    cvIntent: "new",
  });
  const sessionId = data.sessionId;
  const demoValues = { sex: "female", age: 30, country: "Testland", city: "Testville" };
  for (const q of data.demographicQuestions) {
    ({ data } = await post("/api/session/demographics", { sessionId, questionId: q.id, value: demoValues[q.id] }));
  }
  ({ data } = await post("/api/session/big-five-depth", { sessionId, depth: "short" }));
  for (const item of data.bigFiveItems) {
    ({ data } = await post("/api/big-five/answer", { sessionId, itemId: item.id, value: 3 }));
  }
  ({ data } = await post("/api/riasec/start", { sessionId }));
  for (const item of data.riasecItems) {
    ({ data } = await post("/api/riasec/answer", { sessionId, itemId: item.id, value: 4 }));
  }
  ({ data } = await post("/api/job-characteristics/rank", {
    sessionId,
    ranking: ["compensation", "work_mode", "job_security", "career_growth", "complexity", "meaning_impact", "social"],
    depth: 5,
  }));
  for (const item of data.jobCharItems) {
    ({ data } = await post("/api/job-characteristics/answer", { sessionId, itemId: item.id, value: item.options[0].value }));
  }
  assert.equal(data.step, "cv");
  return { sessionId };
}

test("snapshots advertise .pptx when markitdown is available", async () => {
  const { data } = await post("/api/session/start", {
    entryChoice: "find",
    dreamAnswer: "x",
    cvIntent: "new",
  });
  assert.ok(data.cvUploadFormats.includes(".pptx"), `got ${JSON.stringify(data.cvUploadFormats)}`);
});

test("a .pptx upload converts via markitdown and reaches tree", async () => {
  const { sessionId } = await walkToCv();
  const form = new FormData();
  form.append("sessionId", sessionId);
  form.append("file", new Blob([Buffer.from("pptx-bytes")], { type: "application/vnd.openxmlformats-officedocument.presentationml.presentation" }), "deck.pptx");
  const res = await fetch(`${base}/api/cv`, { method: "POST", body: form });
  const data = await res.json();
  assert.equal(res.status, 200);
  assert.equal(data.step, "tree");
  assert.equal(data.cvProvided, true);
});
```

- [ ] **Step 6: Run the new file and the whole suite**

Run: `cd backend && node --test tests/cvUploadMarkitdown.test.js`
Expected: PASS (2 tests)

Run: `cd backend && npm test`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/server.js backend/tests/server.test.js backend/tests/cvUploadMarkitdown.test.js
git commit -m "feat(api): 5MB CV uploads, cvUploadFormats capability in session snapshots"
```

---

### Task 4: `max_tokens` ceiling on every OpenAI call

**Files:**
- Modify: `backend/aiEngine.js:513-526` (`runJsonCompletion`), all 11 call sites, `backend/aiEngine.js:778-788` (exports)
- Test: `backend/tests/aiEngine.test.js` (one new test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `runJsonCompletion(client, { model, system, user, temperature, maxTokens }) => Promise<object>` — now exported (for the test); passes `max_tokens` only when `maxTokens` is a finite number.

**Why the numbers:** a ceiling that is too low truncates the JSON mid-object → parse error → silent fallback. Target ≈ 2× the typical payload (design doc table).

- [ ] **Step 1: Write the failing test**

Add to `backend/tests/aiEngine.test.js` (extend the existing require of `../aiEngine` with `runJsonCompletion`):

```js
test("runJsonCompletion forwards an explicit max_tokens ceiling", async () => {
  let captured;
  const fakeClient = {
    chat: {
      completions: {
        create: async (args) => {
          captured = args;
          return { choices: [{ message: { content: '{"ok":true}' } }] };
        },
      },
    },
  };
  const parsed = await runJsonCompletion(fakeClient, {
    model: "m",
    system: "s",
    user: "u",
    temperature: 0,
    maxTokens: 300,
  });
  assert.equal(captured.max_tokens, 300);
  assert.equal(captured.temperature, 0);
  assert.equal(parsed.ok, true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && node --test tests/aiEngine.test.js`
Expected: FAIL — `runJsonCompletion is not a function`

- [ ] **Step 3: Implement**

`backend/aiEngine.js:513` — new signature and body:

```js
async function runJsonCompletion(client, { model, system, user, temperature = 0.7, maxTokens }) {
  const completion = await client.chat.completions.create({
    model,
    temperature,
    // Explicit output ceiling on every call — an unbounded response is the
    // one OpenAI cost knob nothing else in this file controls.
    ...(Number.isFinite(maxTokens) ? { max_tokens: maxTokens } : {}),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });

  const content = completion?.choices?.[0]?.message?.content;
  return parseJsonObject(content);
}
```

Add `runJsonCompletion,` to `module.exports` (line 778 block).

Then add `maxTokens` to every call site (find each by function name; the numbers come from the design doc):

| Function (line) | add to the options object |
|---|---|
| `generateFirstOutput` (550) | `maxTokens: 1500,` |
| `refineOutput` (575) | `maxTokens: 1500,` |
| `generateOutputDetail` (601) | `maxTokens: 1500,` |
| `generateRoadmap` (629) | `maxTokens: 1500,` |
| `generateRiasecItems` (647) | `maxTokens: 800` |
| `inferRiasecProfile` (662) | `maxTokens: 400` |
| `generateJobCharQuestions` (674) | `maxTokens: 1200` |
| `analyzeCV` (689) | `maxTokens: 300` |
| `inferUserValues` (709) | `maxTokens: 400` |
| `scoreProfessionValues` (732) | `maxTokens: 400` |
| `generateBigFiveItems` (750) | `maxTokens: depth === "deep" ? 1800 : 900,` |

Single-line call sites become e.g. (`generateRiasecItems`):

```js
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0.85, maxTokens: 800 });
```

Multi-line call sites gain one line, e.g. (`generateFirstOutput`):

```js
      const parsed = await runJsonCompletion(client, {
        model,
        system: prompts.system,
        user: prompts.user,
        temperature: 0.8,
        maxTokens: 1500,
      });
```

- [ ] **Step 4: Sanity-check the ceilings against real fallback payloads**

Run:

```bash
cd backend && node -e "
const { getFallbackItems } = require('./bigFiveItems');
const { getFallbackRiasecItems } = require('./riasecItems');
for (const [name, cap, payload] of [
  ['bigfive-short', 900, getFallbackItems('short')],
  ['bigfive-deep', 1800, getFallbackItems('deep')],
  ['riasec-deep', 800, getFallbackRiasecItems('deep')],
]) {
  const est = Math.round(JSON.stringify(payload).length / 4);
  console.log(name, 'est', est, 'cap', cap, est * 2 <= cap ? 'OK' : 'RAISE THE CAP');
}
"
```

Expected: three `OK` lines. If any says `RAISE THE CAP`, raise that generator's `maxTokens` to ≥ 2× the estimate and re-run. (If the import names differ, check the requires at the top of `aiEngine.js` — use whatever it imports from `./bigFiveItems` / `./riasecItems`.)

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS (fallback-mode tests never reach `runJsonCompletion`, so only the new test exercises it)

- [ ] **Step 6: Commit**

```bash
git add backend/aiEngine.js backend/tests/aiEngine.test.js
git commit -m "perf(ai): explicit max_tokens ceiling on every OpenAI call"
```

---

### Task 5: CV digest schema — `roles` + `keywords`, temperature 0

**Files:**
- Modify: `backend/prompts.js:190-200` (`buildCvParsePrompt`), `backend/prompts.js:79-93` (`buildProfileDigest` CV block)
- Modify: `backend/aiEngine.js:470-483` (`normalizeCvAnalysisPayload`), `backend/aiEngine.js:684-695` (`analyzeCV`)
- Test: `backend/tests/prompts.test.js`, `backend/tests/aiEngine.test.js`, `backend/tests/server.test.js:211` (empty-shape assert)

**Interfaces:**
- Consumes: `maxTokens` support in `runJsonCompletion` (Task 4).
- Produces: `cvAnalysis` session field / snapshot shape is now `{roles: string[], skills: string[], domains: string[], seniority: string, keywords: string[]}` (this *is* the spec's `documentDigest`; the name stays). The keyless empty signal carries all five keys.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/prompts.test.js`, update the existing cv-parse test (line 144) and add a digest test:

```js
test("cv parse prompt embeds the text and the extended schema", () => {
  const { system, user } = prompts.buildCvParsePrompt("10 years as a nurse");
  assert.match(system, /"roles":\[/);
  assert.match(system, /"skills":\[/);
  assert.match(system, /"keywords":\[/);
  assert.match(user, /10 years as a nurse/);
});

test("profile digest includes roles and keywords when present", () => {
  const digest = prompts.buildProfileDigest({
    cvAnalysis: {
      roles: ["ICU nurse"],
      skills: ["triage"],
      domains: ["healthcare"],
      seniority: "senior",
      keywords: ["night shifts"],
    },
  });
  assert.match(digest, /roles \[ICU nurse\]/);
  assert.match(digest, /skills \[triage\]/);
  assert.match(digest, /keywords \[night shifts\]/);
});
```

In `backend/tests/aiEngine.test.js`, update the existing normalizer test (line 258 area) to the new shape:

```js
test("normalizeCvAnalysisPayload trims, caps, and requires at least one skill", () => {
  const parsed = normalizeCvAnalysisPayload({
    roles: Array.from({ length: 10 }, (_, i) => ` role ${i} `),
    skills: [" triage ", 42, "", "mentoring"],
    domains: ["healthcare"],
    seniority: " senior ",
    keywords: Array.from({ length: 10 }, (_, i) => `kw${i}`),
  });
  assert.deepEqual(parsed.skills, ["triage", "mentoring"]);
  assert.equal(parsed.roles.length, 6);
  assert.equal(parsed.keywords.length, 6);
  assert.equal(parsed.seniority, "senior");
  assert.throws(() => normalizeCvAnalysisPayload({ skills: [], domains: [], seniority: "" }), /skill/);
});
```

(Keep whatever assertions the current test makes about trimming/caps that still apply — merge, don't blindly replace.)

In `backend/tests/server.test.js:211`, the keyless empty signal gains keys:

```js
  assert.deepEqual(data.cvAnalysis, { roles: [], skills: [], domains: [], seniority: "", keywords: [] });
```

- [ ] **Step 2: Run to verify failures**

Run: `cd backend && node --test tests/prompts.test.js tests/aiEngine.test.js tests/server.test.js`
Expected: the three touched tests FAIL

- [ ] **Step 3: Implement**

`backend/prompts.js:190` — extended schema, still one-sentence instructions:

```js
function buildCvParsePrompt(cvText) {
  const system = [
    "You extract a structured career signal from a raw CV text.",
    "Return valid JSON only.",
    'JSON schema: {"roles":["..."],"skills":["..."],"domains":["..."],"seniority":"...","keywords":["..."]}',
    "roles: up to 6 job titles held, most recent first. skills: up to 12 concrete skills.",
    "domains: up to 6 industries/fields worked in. keywords: up to 6 short distinguishing terms.",
    'seniority: one of "student", "junior", "mid", "senior", "lead", "executive", or a short honest label.',
    "Each array item at most 8 words. Extract only what the text supports; do not invent.",
  ].join(" ");
  return { system, user: `CV text:\n${cvText}\n\nExtract the signal now.` };
}
```

`backend/prompts.js:79-93` — the CV block of `buildProfileDigest`:

```js
  const hasParsedCv =
    cvAnalysis &&
    (cvAnalysis.roles?.length ||
      cvAnalysis.skills?.length ||
      cvAnalysis.domains?.length ||
      cvAnalysis.seniority);
  if (hasParsedCv) {
    const segments = [];
    if (cvAnalysis.roles?.length) segments.push(`roles [${cvAnalysis.roles.join(", ")}]`);
    segments.push(`skills [${(cvAnalysis.skills || []).join(", ")}]`);
    segments.push(`domains [${(cvAnalysis.domains || []).join(", ")}]`);
    segments.push(`seniority "${cvAnalysis.seniority || "unknown"}"`);
    if (cvAnalysis.keywords?.length) segments.push(`keywords [${cvAnalysis.keywords.join(", ")}]`);
    lines.push(`CV signal: ${segments.join("; ")}`);
  } else if (cvText) {
```

(the `else if (cvText)` / journey branches at lines 86-93 stay as they are).

`backend/aiEngine.js:470` — normalizer:

```js
function normalizeCvAnalysisPayload(payload) {
  const strings = (list, max) =>
    (Array.isArray(list) ? list : [])
      .filter((s) => typeof s === "string" && s.trim())
      .map((s) => s.trim().slice(0, 60))
      .slice(0, max);
  const analysis = {
    roles: strings(payload?.roles, 6),
    skills: strings(payload?.skills, 12),
    domains: strings(payload?.domains, 6),
    seniority: cleanText(payload?.seniority, "").slice(0, 80),
    keywords: strings(payload?.keywords, 6),
  };
  if (!analysis.skills.length) throw new Error("CV analysis produced no skills.");
  return analysis;
}
```

`backend/aiEngine.js:684` — `analyzeCV`: new empty shape, temperature 0 (deterministic extraction — creative variance only costs retries):

```js
  async function analyzeCV({ cvText }) {
    const empty = { roles: [], skills: [], domains: [], seniority: "", keywords: [] };
    if (!client) return empty;
    try {
      const { system, user } = buildCvParsePrompt(cvText);
      const parsed = await runJsonCompletion(client, { model, system, user, temperature: 0, maxTokens: 300 });
      return normalizeCvAnalysisPayload(parsed);
    } catch (error) {
      console.error("[AI cv parse fallback]", error.message);
      return empty;
    }
  }
```

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && npm test`
Expected: PASS. If `sessionStore.test.js` or others assert the old 3-key `cvAnalysis` shape anywhere, update them to the 5-key shape (grep: `grep -rn "seniority" backend/tests/`).

- [ ] **Step 5: Commit**

```bash
git add backend/prompts.js backend/aiEngine.js backend/tests/prompts.test.js backend/tests/aiEngine.test.js backend/tests/server.test.js
git commit -m "feat(cv): extend CV digest with roles and keywords, temperature 0"
```

---

### Task 6: Frontend — dynamic upload formats, 5 MB copy

**Files:**
- Modify: `frontend/src/App.jsx:270-321` (`CvCard`), `~453-470` (state), `applySessionSnapshot` (~512), CvCard call site (~1421)

**Interfaces:**
- Consumes: `cvUploadFormats` from every snapshot (Task 3).
- Produces: UI only.

- [ ] **Step 1: Add the state**

Next to the other static banks (around `frontend/src/App.jsx:468`):

```js
  const [cvUploadFormats, setCvUploadFormats] = useState([".pdf", ".docx", ".txt"]);
```

- [ ] **Step 2: Merge it in `applySessionSnapshot`**

In the static-bank merge block (after the `careerJourneyQuestions` line, ~522):

```js
    if (data.cvUploadFormats) setCvUploadFormats(data.cvUploadFormats);
```

- [ ] **Step 3: Thread it through `CvCard`**

Signature (line 270):

```js
function CvCard({ mode, setMode, cvDraft, setCvDraft, busy, onSubmitText, onUploadFile, uploadFormats }) {
```

The upload label/input (lines 304-313):

```jsx
        <label className="option-button cv-upload">
          Upload a file ({uploadFormats.join(", ")} — max 5 MB)
          <input
            type="file"
            accept={uploadFormats.join(",")}
            hidden
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && onUploadFile(e.target.files[0])}
          />
        </label>
```

Call site (~1421) — add the prop:

```jsx
            <CvCard
              mode={cvMode}
              setMode={setCvMode}
              cvDraft={cvDraft}
              setCvDraft={setCvDraft}
              busy={busy.cv}
              onSubmitText={handleSubmitCvText}
              onUploadFile={handleUploadCv}
              uploadFormats={cvUploadFormats}
            />
```

- [ ] **Step 4: Verify frontend tests and build**

Run: `cd frontend && npm test -- --run`
Expected: PASS (Vitest covers `lifePath.js`; nothing asserts CvCard markup)

Run: `cd frontend && npm run build`
Expected: builds clean

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx
git commit -m "feat(front): dynamic CV upload formats from snapshot, 5 MB copy"
```

---

### Task 7: Docs & config sync

**Files:**
- Modify: `backend/.env.example`, `render.yaml`, `CLAUDE.md`, `README.md`, `PROJECT_STATUS.md`, `ARCHITECTURE.md`

- [ ] **Step 1: `backend/.env.example`** — append:

```
# Optional path to the MarkItDown CLI (adds .pptx/.html + better extraction).
# Without it the app falls back to built-in pdf/docx/txt/html parsing.
# Install locally: python3 -m venv ~/.venvs/markitdown && ~/.venvs/markitdown/bin/pip install "markitdown[all]"
# MARKITDOWN_BIN=~/.venvs/markitdown/bin/markitdown
```

- [ ] **Step 2: `render.yaml`** — under the backend service's `envVars`, add a comment (no value — the node runtime has no Python; this documents the upgrade path):

```yaml
      # MarkItDown is OPTIONAL: this node runtime has no Python, so the backend
      # serves pdf/docx/txt/html via its built-in parsers and hides .pptx from
      # the UI. To enable full MarkItDown support, switch the service to a
      # Docker runtime and set MARKITDOWN_BIN to the installed binary.
```

- [ ] **Step 3: `CLAUDE.md`** — update the CV bullet in "Assessment flow" (formats `.pdf/.docx/.pptx/.html/.txt`, 5 MB cap, digest `{roles, skills, domains, seniority, keywords}`), the `backend/cvExtract.js` line in "Backend modules" (hybrid MarkItDown-first), and add a module line:

```markdown
- `backend/services/markitdown.js` — optional MarkItDown CLI wrapper (probe + spawn + cleanup); absent binary = silent fallback to Node parsers
```

- [ ] **Step 4: `README.md`** — lines 35, 67, 122: same format/size/digest updates; add a short "Optional: MarkItDown" note in the setup section with the venv install command from Step 1.

- [ ] **Step 5: `PROJECT_STATUS.md` / `ARCHITECTURE.md`** — line 20 of PROJECT_STATUS (CV bullet: formats, 5 МБ, digest keys) and the `cvExtract.js` row of ARCHITECTURE's module table (MarkItDown-first hybrid). Keep each file's language (PROJECT_STATUS is Russian).

- [ ] **Step 6: Verify all references were caught**

Run: `grep -rn "2 MB\|2MB\|2 МБ\|\.pdf/\.docx/\.txt" README.md CLAUDE.md PROJECT_STATUS.md ARCHITECTURE.md DEPLOY.md backend/.env.example`
Expected: no stale hits (DEPLOY.md likely has none; fix any that show up)

- [ ] **Step 7: Commit**

```bash
git add backend/.env.example render.yaml CLAUDE.md README.md PROJECT_STATUS.md ARCHITECTURE.md
git commit -m "docs: MarkItDown setup, new CV formats and digest fields"
```

---

### Task 8: Final verification + optional real-binary smoke

- [ ] **Step 1: Full suites**

Run: `cd backend && npm test` → all PASS (expect ~120+ tests)
Run: `cd frontend && npm test -- --run` → all PASS
Run: `cd frontend && npm run build` → clean

- [ ] **Step 2 (optional, requires network): real MarkItDown smoke**

```bash
python3 -m venv ~/.venvs/markitdown
~/.venvs/markitdown/bin/pip install "markitdown[all]"
~/.venvs/markitdown/bin/markitdown --version
```

Then from the repo root: `MARKITDOWN_BIN=~/.venvs/markitdown/bin/markitdown npm run dev`, walk the assessment to the CV step in the browser (http://localhost:5173), upload a real `.pptx` or `.html`, and confirm the session reaches the tree and `cvAnalysis` in the network response contains only the five short digest fields — never raw document text.

- [ ] **Step 3: Use superpowers:verification-before-completion, then superpowers:finishing-a-development-branch**

The feature branch merges to `main` via PR (repo convention: PR into `main`).
