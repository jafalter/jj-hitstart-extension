// Stage 5 — Render duplex PDF via Typst. See PLAN.md §2 (Stage 5), §9.
//
// Generates one QR PNG per card (data/qr/<id>.png, encoding the resolved
// YouTube URL), fills templates/card.typ's CARDS placeholder with the real
// card data, writes the result to ROOT/cards.typ (git-ignored), then shells
// out to the `typst` CLI to compile ROOT/cards.pdf.
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { DATA, ROOT, TEMPLATES, ensureDir, readJSON } from "./lib/paths.mjs";
import { writeQrPng } from "./lib/qr.mjs";
import { resolveBinary } from "./lib/bin.mjs";

const execFileAsync = promisify(execFile);
const SELECTION_PATH = path.join(DATA, "selection.json");
const QR_DIR = path.join(DATA, "qr");

// Typst string-literal escaping (double-quoted strings: backslash then quote).
function typstStr(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function generateQrCodes(selection) {
  ensureDir(QR_DIR);
  let generated = 0;
  for (const entry of selection) {
    if (!entry.url) continue;
    const outPath = path.join(QR_DIR, `${entry.id}.png`);
    if (fs.existsSync(outPath)) continue;
    await writeQrPng(entry.url, outPath);
    generated++;
  }
  return generated;
}

function buildCardsTypst(selection) {
  const entries = selection
    .filter((e) => e.url)
    .map((e) => {
      const qrRel = path.join("data", "qr", `${e.id}.png`).replace(/\\/g, "/");
      return (
        `  (id: ${e.id}, year: "${typstStr(e.year)}", artist: "${typstStr(e.artist)}", ` +
        `title: "${typstStr(e.title)}", qr: "${qrRel}"),`
      );
    });
  return `#let cards = (\n${entries.join("\n")}\n)`;
}

async function writeCardsTyp(selection) {
  const template = fs.readFileSync(path.join(TEMPLATES, "card.typ"), "utf8");
  const cardsBlock = buildCardsTypst(selection);
  const placeholderRe = /^#let cards = \(\).*$/m;
  if (!placeholderRe.test(template)) {
    throw new Error("templates/card.typ: CARDS placeholder not found — did the template change shape?");
  }
  const filled = template.replace(placeholderRe, cardsBlock);
  const outPath = path.join(ROOT, "cards.typ");
  fs.writeFileSync(outPath, filled, "utf8");
  return outPath;
}

async function compilePdf(typPath) {
  const typst = await resolveBinary("typst");
  if (!typst) {
    console.warn(
      "[05_render] typst CLI not found on PATH — cards.typ was written but not compiled. " +
        "Install typst (https://typst.app) and run: typst compile cards.typ cards.pdf",
    );
    return false;
  }
  const pdfPath = path.join(ROOT, "cards.pdf");
  await execFileAsync(typst, ["compile", typPath, pdfPath], { cwd: ROOT, timeout: 120000 });
  return true;
}

async function main() {
  if (!fs.existsSync(SELECTION_PATH)) {
    console.error("[05_render] data/selection.json not found — run stages 3-4 first.");
    process.exit(1);
  }
  const selection = readJSON(SELECTION_PATH);
  const withUrl = selection.filter((e) => e.url).length;
  if (withUrl < selection.length) {
    console.warn(
      `[05_render] ${selection.length - withUrl}/${selection.length} row(s) have no resolved URL yet ` +
        `(run stage 4) — rendering the ${withUrl} that do.`,
    );
  }

  console.log("[05_render] generating QR codes...");
  const generated = await generateQrCodes(selection);
  console.log(`[05_render] QR codes: ${generated} generated, ${withUrl - generated} already cached.`);

  console.log("[05_render] writing cards.typ...");
  const typPath = await writeCardsTyp(selection);

  console.log("[05_render] compiling PDF via typst...");
  const compiled = await compilePdf(typPath);
  if (compiled) {
    console.log(`[05_render] done — cards.pdf compiled (${withUrl} cards).`);
  } else {
    console.log(`[05_render] cards.typ written (${withUrl} cards) — compile manually once typst is installed.`);
  }
}

main().catch((e) => {
  console.error("[05_render] fatal:", e.message);
  process.exit(1);
});
