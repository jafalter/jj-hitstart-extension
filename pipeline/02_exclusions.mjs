// Stage 2 — Acquire exclusions (scrape hitster.store DE + decrypt prior editions).
// See PLAN.md §2 (Stage 2), §8.
//
// hitster.store publishes each edition's full track listing under
// /Welche-Lieder-sind-dabei/<Edition>/ as a single inline-styled <table> with
// columns Künstler | Titel | Jahr — no JS challenge, no auth needed.
import * as cheerio from "cheerio";
import fs from "node:fs";
import path from "node:path";
import { loadConfig, DATA, EDITIONS, writeJSON, ensureDir } from "./lib/paths.mjs";
import { decryptJSON } from "./lib/crypto.mjs";
import { songKey } from "./lib/normalize.mjs";
import { fetchCached } from "./lib/http.mjs";

const sources = loadConfig("sources.json");
ensureDir(DATA);

const excluded = []; // { artist, title, year }

const DECKS = [
  { slug: "Hitster-Classic", label: "hitster-base", expectedApprox: 300 },
  { slug: "Hitster-Rock", label: "hitster-rock", expectedApprox: 300 },
];

function parseTrackTable(html) {
  const $ = cheerio.load(html);
  const rows = [];
  $("table").first().find("tbody tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 3) return;
    const artist = $(tds[0]).text().trim();
    const title = $(tds[1]).text().trim();
    const year = parseInt($(tds[2]).text().trim(), 10);
    if (!artist || !title) return;
    rows.push({ artist, title, year: Number.isFinite(year) ? year : null });
  });
  return rows;
}

async function scrapeHitsterStore() {
  const base = sources.exclusions.primary.base;
  const rawDir = path.join(DATA, "raw", "hitster-store");
  let scraped = 0;
  for (const deck of DECKS) {
    const url = `${base}/Welche-Lieder-sind-dabei/${deck.slug}/`;
    const cachePath = path.join(rawDir, `${deck.slug}.html`);
    const r = await fetchCached(url, cachePath, { timeoutMs: 20000, retries: 2 });
    if (!r.ok) {
      console.warn(`[02_exclusions] ${deck.label}: fetch failed (${r.error?.message || r.status}) — skipped.`);
      continue;
    }
    const rows = parseTrackTable(r.text);
    if (Math.abs(rows.length - deck.expectedApprox) > deck.expectedApprox * 0.3) {
      console.warn(
        `[02_exclusions] ${deck.label}: scraped ${rows.length} tracks, expected ~${deck.expectedApprox} ` +
          `— page layout may have changed, double-check the scraper.`,
      );
    }
    excluded.push(...rows);
    scraped += rows.length;
  }
  console.log(`[02_exclusions] hitster.store: ${scraped} tracks scraped across ${DECKS.length} deck(s).`);
}

await scrapeHitsterStore();

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
    `(${priorCount} from prior editions, rest from hitster.store scrape).`,
);
