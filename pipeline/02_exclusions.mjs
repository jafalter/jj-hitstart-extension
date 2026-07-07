// Stage 2 — Acquire exclusions (scrape hitster.store DE + decrypt prior editions).
// See PLAN.md §2 (Stage 2), §8. STATUS: STUB (scrape not yet implemented).
import fs from "node:fs";
import path from "node:path";
import { loadConfig, DATA, EDITIONS, writeJSON, ensureDir } from "./lib/paths.mjs";
import { decryptJSON } from "./lib/crypto.mjs";
import { songKey } from "./lib/normalize.mjs";

const sources = loadConfig("sources.json");
ensureDir(DATA);

const excluded = []; // { artist, title, year }

// TODO: scrape hitster.store DE for hitster-base + hitster-rock decks (cheerio),
//       cross-check counts, push normalized {artist,title,year} into `excluded`.
console.log("[02_exclusions] STUB — scrape source:", sources.exclusions.primary.base);

// Prior editions: decrypt committed /editions/*.enc and add their picks.
const key = process.env.EDITION_KEY;
let priorCount = 0;
if (fs.existsSync(EDITIONS)) {
  for (const f of fs.readdirSync(EDITIONS).filter((f) => f.endsWith(".enc"))) {
    if (!key) {
      console.warn(`[02_exclusions] ${f} present but EDITION_KEY unset — skipping.`);
      continue;
    }
    try {
      const prior = decryptJSON(fs.readFileSync(path.join(EDITIONS, f)), key);
      for (const s of prior.songs || prior) {
        excluded.push({ artist: s.artist, title: s.title, year: s.year });
        priorCount++;
      }
    } catch (e) {
      console.error(`[02_exclusions] failed to decrypt ${f}: ${e.message}`);
    }
  }
}

const keys = [...new Set(excluded.map((e) => songKey(e.artist, e.title)))];
writeJSON(path.join(DATA, "exclusions.json"), { rows: excluded, keys });
console.log(
  `[02_exclusions] wrote ${keys.length} normalized keys ` +
    `(${priorCount} from prior editions; deck scrape TODO).`
);
