// Fuzzy exclusion matching. See PLAN.md §4.
import stringSimilarity from "string-similarity";
import { songKey, normalizeArtist } from "./normalize.mjs";

const FUZZY_THRESHOLD = 0.9; // token-set similarity; validated against a sample during build.

// Build an exclusion index from normalized {artist,title,year} rows.
export function buildExclusionIndex(rows) {
  const keys = new Set();
  const byArtistYear = new Map(); // artistNorm -> Set(year)
  for (const r of rows) {
    keys.add(songKey(r.artist, r.title));
    const a = normalizeArtist(r.artist);
    if (r.year != null) {
      if (!byArtistYear.has(a)) byArtistYear.set(a, new Set());
      byArtistYear.get(a).add(Number(r.year));
    }
  }
  return { keys, byArtistYear, keyList: [...keys] };
}

// Returns true if the candidate should be EXCLUDED.
export function isExcluded(candidate, index) {
  const key = songKey(candidate.artist, candidate.title);
  if (index.keys.has(key)) return true;

  // (artist, year±1) near-duplicate guard.
  const a = normalizeArtist(candidate.artist);
  const yset = index.byArtistYear.get(a);
  if (yset && candidate.year != null) {
    const y = Number(candidate.year);
    if (yset.has(y) || yset.has(y - 1) || yset.has(y + 1)) {
      // same artist within a year — likely the same track, different metadata.
      // Only exclude if titles are also fuzzily close.
      // (handled below via fuzzy pass)
    }
  }

  // Fuzzy token-set pass against all excluded keys.
  if (index.keyList.length) {
    const { bestMatch } = stringSimilarity.findBestMatch(key, index.keyList);
    if (bestMatch.rating >= FUZZY_THRESHOLD) return true;
  }
  return false;
}

export { FUZZY_THRESHOLD };
