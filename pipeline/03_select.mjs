// Stage 3 — Filter + quota sampling + friends injection. See PLAN.md §3 (Stage 3), §5, §6.
// STATUS: STUB. Depends on Stage 1 output (data/charts/*).
import { loadConfig } from "./lib/paths.mjs";

const quotas = loadConfig("quotas.json");
const friends = loadConfig("friends.json");

// TODO:
//  1. Load + dedupe chart rows to canonical (artistNorm,titleNorm), merge sources.
//  2. Filter out exclusions (lib/match.mjs), restrict to era/genres.
//  3. Quota sampling per decade x region x genre (lib/quota.mjs), cap per artist,
//     relax genre -> region -> adjacent decade when a bucket underfills.
//  4. Inject 1 non-excluded song per friend band (forced, rule-exempt).
//  5. Write data/selection.json (primary spoiler file). Log COUNTS ONLY.
console.log(
  `[03_select] STUB — target ${quotas.generalTarget} general + ` +
    `${friends.bands.length} friend picks = ${quotas.totalCards} cards.`
);
console.log("[03_select] Not yet implemented (needs Stage 1 data).");
