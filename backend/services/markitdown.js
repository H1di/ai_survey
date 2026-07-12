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
