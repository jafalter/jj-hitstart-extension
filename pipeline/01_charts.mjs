// Stage 1 — Acquire popularity data. See PLAN.md §2 (Stage 1), §10.2.
// STATUS: STUB. Scrapers/dataset fetch not yet implemented.
import { loadConfig, DATA, ensureDir } from "./lib/paths.mjs";
import path from "node:path";

const sources = loadConfig("sources.json");
ensureDir(path.join(DATA, "charts"));
ensureDir(path.join(DATA, "raw"));

// TODO:
//  - US Billboard Hot 100 year-end (dataset JSON, 1958+).
//  - UK Official Charts (scrape, 1952+).
//  - DE Offizielle Deutsche Charts (scrape).
//  - AT austriancharts.at year-end by decade (scrape).
//  - Enrich year/genre/duration via Deezer (api.deezer.com).
//  - Cache raw responses in data/raw/; emit normalized rows to data/charts/<source>.json:
//      { artist, title, year, region, genre, sourceRank, sources[] }
console.log("[01_charts] STUB — sources configured:", Object.keys(sources.charts).join(", "));
console.log("[01_charts] Not yet implemented. No rows written.");
