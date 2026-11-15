// Exports the finished emblem as a 1080×1350 PNG. It paints with the same
// drawEmblem as the live canvas, at the final frame, so the file is exactly
// what the screen settles on.
import { totalDuration } from "../timeline";
import { drawEmblem, readTokens } from "./drawEmblem";
import { STAGES, frameAt } from "./emblemEngine";

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function saveEmblemPng(emblem) {
  await document.fonts?.ready;
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const tk = readTokens();
  ctx.fillStyle = tk.bg;
  ctx.fillRect(0, 0, W, H);
  drawEmblem(ctx, { cx: W / 2, cy: 520, R: 400, emblem, frame: frameAt(totalDuration(STAGES)), tk });

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = tk.bone;
  ctx.font = `600 60px ${tk.body}`;
  ctx.fillText(emblem.archetype.name, W / 2, 1056);
  ctx.fillStyle = tk.text60;
  ctx.font = `400 28px ${tk.body}`;
  wrapLines(ctx, emblem.archetype.tagline, 820).forEach((line, i) => ctx.fillText(line, W / 2, 1110 + i * 40));
  ctx.fillStyle = tk.gold70;
  ctx.font = `500 22px ${tk.mono}`;
  ctx.fillText(`${emblem.riasecCode} · ${emblem.serial}`, W / 2, 1210);

  ctx.strokeStyle = tk.gold15;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(W / 2 - 40, 1262);
  ctx.lineTo(W / 2 + 40, 1262);
  ctx.stroke();
  ctx.fillStyle = tk.bone50;
  ctx.font = `500 20px ${tk.body}`;
  ctx.fillText("Invector", W / 2, 1300);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `invector-emblem-${emblem.serial}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
