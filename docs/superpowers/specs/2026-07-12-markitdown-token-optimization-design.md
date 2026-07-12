# MarkItDown document upload + OpenAI token caps — design

**Date:** 2026-07-12
**Status:** approved
**Source:** external spec `markitdown-token-optimization-spec.md` (written against an outdated
snapshot of the codebase), reconciled with the current repo and approved by Eugene.

## Problem

The external spec asks for a document-upload step whose file is converted via
MarkItDown, compressed into a short digest by one cheap LLM call, and then reused
in every downstream prompt — plus general token-spend hygiene (`max_tokens`
ceilings, stable system prompts).

Most of the spec already exists in this codebase: `POST /api/cv` (multer),
`cvExtract.js` (pdf-parse / mammoth / utf8), 6000-char truncation, one
`analyzeCV` call producing a compact `{skills, domains, seniority}` digest
stored in the session, and a single `CV signal:` line in `buildProfileDigest`.
Raw document text never reaches the main prompts.

The real delta, and the scope of this design:

1. **MarkItDown conversion path** — adds `.pptx` and `.html` support and better
   markdown-quality text for existing formats.
2. **Explicit `max_tokens` ceilings** — currently *no* AI call sets one.
3. **Digest schema extension** — add `roles` and `keywords` to the CV digest.

## Decisions (with Eugene, 2026-07-12)

- **Hybrid with fallback** — MarkItDown via `child_process` is the primary
  converter when its binary is available; the existing Node parsers remain as
  the fallback. Render's node runtime (no guaranteed Python) keeps working
  unchanged.
- **Upload stays in the `cv` step** — no early-upload stage; the current flow
  already satisfies "instead of part of the questions" via journey questions.
- **Extend the digest schema** — `{roles, skills, domains, seniority, keywords}`;
  keep the `cvAnalysis` name (it *is* the spec's `documentDigest`).
- **No image uploads** — MarkItDown without an LLM client extracts only EXIF
  from images; accepting them would promise OCR that doesn't exist.

## 1. Extraction pipeline

### `backend/services/markitdown.js` (new)

- `convertToMarkdown(buffer, originalname)`:
  - write buffer to a temp file in `os.tmpdir()`, `spawn` the binary
    (`process.env.MARKITDOWN_BIN || "markitdown"`), read stdout, delete the
    temp file in `finally`;
  - kill the process after a ~20 s timeout — a hung Python process must not pin
    the request;
  - non-zero exit or timeout → throw (caller falls back to Node parsers).
- `cleanMarkdown(md)`: collapse 3+ newlines, strip markdown images
  (`![..](..)`), reduce links to their text, trim.
- `isMarkitdownAvailable()`: one startup probe (`markitdown --version`),
  cached; exported so the capability can be serialized.

### `backend/cvExtract.js` (changed)

Routing per file, in order:

| Format | markitdown available | markitdown missing |
|---|---|---|
| .pdf | markitdown → fallback pdf-parse | pdf-parse |
| .docx | markitdown → fallback mammoth | mammoth |
| .txt | utf8 (no spawn needed) | utf8 |
| .pptx | markitdown | 400 "not supported on this server" |
| .html/.htm | markitdown | naive tag-strip (drop `<script>`/`<style>`, strip tags — no new deps) |
| images | rejected (400) | rejected (400) |

A markitdown *failure* (crash/timeout) on pdf/docx degrades to the Node parser
for that same request; on pptx it becomes a 400. Hard failures stay 400s — the
route must never 500 on a weird file.

### Limits

- multer `fileSize`: 2 MB → **5 MB** (spec).
- Converted text still truncated to 6000 chars before the LLM
  (existing `server.js` behavior, unchanged).

## 2. Digest schema extension

- `buildCvParsePrompt` returns schema
  `{"roles":[],"skills":[],"domains":[],"seniority":"...","keywords":[]}` —
  roles/domains/keywords ≤ 6 items, skills ≤ 12, each item short (~8 words max).
  One-sentence system prompt, no prose in output.
- `analyzeCV`: `temperature: 0` (was 0.2), `max_tokens: 300`.
- Normalizer clamps array lengths and string lengths; unknown keys dropped.
- Keyless fallback returns the empty extended shape
  (`{roles: [], skills: [], domains: [], seniority: "", keywords: []}`).
- `buildProfileDigest` `CV signal:` line gains `roles=…` and `keywords=…`
  segments (only when non-empty).

## 3. Server capability → frontend

- `serializeSessionState` gains `cvUploadFormats` (array of extensions derived
  from the markitdown probe, e.g. `[".pdf",".docx",".txt",".pptx",".html"]`).
- `App.jsx` builds the file input's `accept` from the snapshot instead of the
  hardcoded `".pdf,.docx,.txt"` — on a server without Python the user simply
  never sees `.pptx` offered.

## 4. Token ceilings on every AI call

`runJsonCompletion` accepts `maxTokens` and passes it as `max_tokens`. Every
call site sets an explicit ceiling. Starting values (to be validated against
measured fallback-payload sizes during implementation — a ceiling that's too
low truncates the JSON and silently degrades to the deterministic fallback, so
aim for ~2× the typical payload):

| Generator | max_tokens |
|---|---|
| generateFirstOutput / refineOutput / generateOutputDetail / generateRoadmap | 1500 |
| generateBigFiveItems | 900 (short) / 1800 (deep) |
| generateRiasecItems | 800 |
| generateJobCharQuestions | 1200 |
| analyzeCV | 300 |
| inferRiasecProfile / inferUserValues / scoreProfessionValues | 400 |

System prompts stay static (variable data only in `user`) to keep OpenAI
prefix caching effective — already true, preserved as an explicit constraint.

## 5. Install & deploy

- **Local (Arch/CachyOS, no pip):** `pipx install "markitdown[all]"`; fallback
  `python3 -m venv` + pip inside it. Documented in README/dev docs, plus
  optional `MARKITDOWN_BIN` in `backend/.env.example`.
- **Render:** no changes. The node runtime has no markitdown → the probe fails →
  fallback path serves pdf/docx/txt/html exactly as today; `cvUploadFormats`
  hides pptx. A comment in `render.yaml` notes how to enable full support
  later (Docker runtime or `MARKITDOWN_BIN`).

## 6. Testing

`backend/tests/`, node:test + supertest, markitdown mocked at the module
boundary (CI has no Python):

- `cleanMarkdown` unit tests (newline collapse, image strip, link reduction).
- Digest normalizer: clamps, empty fallback shape, unknown keys dropped.
- Route: pptx/html accepted when converter (mock) available; pptx → 400 when
  unavailable; pdf/docx/txt still work with converter unavailable.
- Converter failure on pdf degrades to pdf-parse for the same request.
- `runJsonCompletion` passes `max_tokens` (assert on a stubbed client).
- Existing 110+ tests stay green; frontend Vitest suite stays green.

## Out of scope

- Image uploads (EXIF-only extraction is not useful for CVs).
- FastAPI sidecar (spec's variant B).
- Early upload at the `entry` stage.
- Renaming `cvAnalysis` → `documentDigest`.
- Any change to how the digest is reused downstream (already correct: the
  document pays for tokens once; every branch/refine call sees only the
  ~20–40-token digest line).
