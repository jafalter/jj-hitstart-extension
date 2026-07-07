// Stage 6 — Encrypt the final songlist to /editions/<name>.enc (committed). See PLAN.md §8.
import fs from "node:fs";
import path from "node:path";
import { DATA, EDITIONS, ensureDir, readJSON } from "./lib/paths.mjs";
import { encryptJSON } from "./lib/crypto.mjs";

const key = process.env.EDITION_KEY;
if (!key) {
  console.error("[06_seal] EDITION_KEY is not set (.env). Aborting.");
  process.exit(1);
}

const name = process.env.EDITION_NAME || "edition-01";
const selectionPath = path.join(DATA, "selection.json");
if (!fs.existsSync(selectionPath)) {
  console.error("[06_seal] data/selection.json not found — run stages 3–4 first.");
  process.exit(1);
}

const selection = readJSON(selectionPath);
const songs = Array.isArray(selection) ? selection : selection.songs || [];
// Store only what future editions need for exclusion (+ full record for reuse).
const payload = {
  edition: name,
  sealedAt: new Date().toISOString(),
  count: songs.length,
  songs,
};

ensureDir(EDITIONS);
const outPath = path.join(EDITIONS, `${name}.enc`);
fs.writeFileSync(outPath, encryptJSON(payload, key));
// Log COUNT ONLY — never song data.
console.log(`[06_seal] sealed ${songs.length} songs -> editions/${name}.enc (encrypted).`);
