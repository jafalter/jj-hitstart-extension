// Stage 3 — Filter + quota sampling + friends injection. See PLAN.md §2 (Stage 3), §5, §6.
//
// Logs COUNTS ONLY (decade/region/genre distribution) — never artist/title.
// data/selection.json is the primary spoiler file (git-ignored, never echoed).
import fs from "node:fs";
import path from "node:path";
import { loadConfig, DATA, ensureDir, writeJSON, readJSON } from "./lib/paths.mjs";
import { songKey, normalizeArtist } from "./lib/normalize.mjs";
import { buildExclusionIndex, isExcluded } from "./lib/match.mjs";
import { decadeKeyOf, selectForDecade, borrowFill } from "./lib/quota.mjs";
import { deezerSearchArtist, deezerArtistTopTracks, deezerAlbumInfo, mapGenre } from "./lib/deezer.mjs";

const quotas = loadConfig("quotas.json");
const friends = loadConfig("friends.json");
const CHARTS = path.join(DATA, "charts");
const MIN_YEAR = 1950;
const MAX_YEAR = new Date().getFullYear();

// ---------------------------------------------------------------------------
// Load + dedupe chart rows to canonical (artistNorm, titleNorm) entries.
// ---------------------------------------------------------------------------
function regionFromSources(sourceList) {
  if (sourceList.includes("at_austriancharts")) return "AT";
  if (sourceList.includes("de_germancharts")) return "DE";
  return "INTL";
}

function loadAllChartRows() {
  if (!fs.existsSync(CHARTS)) return [];
  const rows = [];
  for (const f of fs.readdirSync(CHARTS).filter((f) => f.endsWith(".json"))) {
    rows.push(...readJSON(path.join(CHARTS, f)));
  }
  return rows;
}

function dedupeRows(allRows) {
  const map = new Map();
  for (const row of allRows) {
    const key = songKey(row.artist, row.title);
    const thisRegion = regionFromSources(row.sources || []);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, {
        artist: row.artist,
        title: row.title,
        year: row.year ?? null,
        genre: row.genre && row.genre !== "unknown" ? row.genre : "unknown",
        region: thisRegion,
        bestRank: row.sourceRank ?? 9999,
        sources: new Set(row.sources || []),
      });
      continue;
    }
    existing.sources = new Set([...existing.sources, ...(row.sources || [])]);
    if ((row.sourceRank ?? 9999) < existing.bestRank) existing.bestRank = row.sourceRank;
    if (existing.genre === "unknown" && row.genre && row.genre !== "unknown") existing.genre = row.genre;
    if (thisRegion !== "INTL") existing.region = thisRegion; // AT/DE presence wins over INTL-only
    if (row.year != null && (existing.year == null || row.year < existing.year)) existing.year = row.year;
  }
  return [...map.values()].map((e) => ({ ...e, sources: [...e.sources] }));
}

function filterCandidates(rows, exclusionIndex) {
  const allowedGenres = new Set([...quotas.genres.targets, "unknown"]);
  return rows.filter((r) => {
    if (r.year == null || r.year < MIN_YEAR || r.year > MAX_YEAR) return false;
    if (!allowedGenres.has(r.genre)) return false;
    if (isExcluded(r, exclusionIndex)) return false;
    return true;
  });
}

// ---------------------------------------------------------------------------
// Quota sampling across decades, with adjacent-decade borrow for shortfalls.
// ---------------------------------------------------------------------------
function runQuotaSampling(candidates) {
  const byDecade = new Map();
  for (const c of candidates) {
    const dk = decadeKeyOf(c.year);
    if (!byDecade.has(dk)) byDecade.set(dk, []);
    byDecade.get(dk).push(c);
  }
  for (const list of byDecade.values()) list.sort((a, b) => a.bestRank - b.bestRank);

  const artistCounts = new Map();
  const decadeKeys = Object.keys(quotas.decades);
  const perDecadePicks = new Map();
  const perDecadeLeftover = new Map();

  for (const dk of decadeKeys) {
    const target = quotas.decades[dk];
    const candidatesForDecade = byDecade.get(dk) || [];
    const { picked } = selectForDecade(dk, candidatesForDecade, target, quotas, artistCounts);
    perDecadePicks.set(dk, picked);
    const pickedSet = new Set(picked);
    perDecadeLeftover.set(
      dk,
      candidatesForDecade.filter((c) => !pickedSet.has(c)),
    );
  }

  // Adjacent-decade borrow for any decade that still fell short.
  const allLeftovers = decadeKeys.flatMap((dk) => perDecadeLeftover.get(dk));
  for (const dk of decadeKeys) {
    const target = quotas.decades[dk];
    const picked = perDecadePicks.get(dk);
    if (picked.length >= target) continue;
    const need = target - picked.length;
    const borrowed = borrowFill(need, allLeftovers, artistCounts, quotas.maxSongsPerArtist);
    picked.push(...borrowed);
  }

  const selected = decadeKeys.flatMap((dk) => perDecadePicks.get(dk));
  return selected;
}

// ---------------------------------------------------------------------------
// Friends' bands — 1 forced, exclusion-checked, genre/era/popularity-exempt pick each.
// ---------------------------------------------------------------------------
// Deezer's /artist/{id}/top occasionally leads with an unrelated artist's
// track (a cross-promoted/featured entry) rather than the requested artist —
// so the top result can't be trusted blindly; it must actually be by the band.
function artistMatches(bandName, trackArtistName) {
  if (!trackArtistName) return false;
  const a = normalizeArtist(bandName);
  const b = normalizeArtist(trackArtistName);
  return a === b || a.includes(b) || b.includes(a);
}

async function pickFriendTrack(bandName, exclusionIndex) {
  const artist = await deezerSearchArtist(bandName);
  if (!artist) return null;
  const tracks = await deezerArtistTopTracks(artist.id, 10);
  for (const t of tracks) {
    if (!artistMatches(bandName, t.artist?.name)) continue;
    const candidateArtist = t.artist?.name || bandName;
    const candidate = { artist: candidateArtist, title: t.title, year: null };
    if (isExcluded(candidate, exclusionIndex)) continue;
    const { genres, year } = await deezerAlbumInfo(t.album?.id);
    return {
      artist: candidateArtist,
      title: t.title,
      year: year ?? null,
      genre: mapGenre(genres),
      region: "INTL",
      bestRank: null,
      sources: ["deezer-artist-top"],
      isFriendPick: true,
    };
  }
  return null;
}

async function injectFriends(exclusionIndex, bands = friends.bands) {
  const picks = [];
  let resolved = 0;
  for (const band of bands) {
    const pick = await pickFriendTrack(band, exclusionIndex);
    if (pick) {
      picks.push(pick);
      resolved++;
    }
  }
  console.log(`[03_select] friend picks resolved: ${resolved}/${bands.length}.`);
  return picks;
}

// If data/selection.json already exists (e.g. resolved + rendered in a prior
// run), a plain re-run must not reshuffle or drop anything already built on
// top of it (videoId/url/verified from Stage 4). So this only appends any
// friends.json band that isn't represented yet — everything else is left
// byte-for-byte alone. Delete data/selection.json to force a full rebuild.
async function appendMissingFriends(exclusionIndex) {
  const selectionPath = path.join(DATA, "selection.json");
  const existing = readJSON(selectionPath);
  const existingArtists = new Set(existing.map((e) => normalizeArtist(e.artist)));
  const missingBands = friends.bands.filter((b) => !existingArtists.has(normalizeArtist(b)));

  if (missingBands.length === 0) {
    console.log("[03_select] selection.json already exists; no new friend bands to add.");
    return;
  }

  const newPicks = await injectFriends(exclusionIndex, missingBands);
  let nextId = existing.reduce((max, e) => Math.max(max, e.id), 0) + 1;
  const appended = newPicks.map((c) => ({
    id: nextId++,
    artist: c.artist,
    title: c.title,
    year: c.year,
    region: c.region,
    genre: c.genre,
    source: c.sources,
    isFriendPick: true,
  }));

  writeJSON(selectionPath, [...existing, ...appended]);
  console.log(
    `[03_select] appended ${appended.length}/${missingBands.length} new friend pick(s) to the existing ` +
      `${existing.length}-card selection.json (now ${existing.length + appended.length}).`,
  );
}

// ---------------------------------------------------------------------------
async function main() {
  const exclusions = readJSON(path.join(DATA, "exclusions.json"));
  const exclusionIndex = buildExclusionIndex(exclusions.rows || []);

  if (fs.existsSync(path.join(DATA, "selection.json"))) {
    await appendMissingFriends(exclusionIndex);
    return;
  }

  const allRows = loadAllChartRows();
  console.log(`[03_select] loaded ${allRows.length} raw chart rows.`);

  const deduped = dedupeRows(allRows);
  console.log(`[03_select] deduped to ${deduped.length} canonical songs.`);

  const filtered = filterCandidates(deduped, exclusionIndex);
  console.log(`[03_select] ${filtered.length} candidates after exclusion/era/genre filter.`);

  const general = runQuotaSampling(filtered);
  console.log(`[03_select] quota-sampled ${general.length}/${quotas.generalTarget} general picks.`);

  const friendPicks = await injectFriends(exclusionIndex);

  const combined = [
    ...general.map((c) => ({ ...c, isFriendPick: false })),
    ...friendPicks,
  ].map((c, i) => ({
    id: i + 1,
    artist: c.artist,
    title: c.title,
    year: c.year,
    region: c.region,
    genre: c.genre,
    source: c.sources,
    isFriendPick: !!c.isFriendPick,
  }));

  ensureDir(DATA);
  writeJSON(path.join(DATA, "selection.json"), combined);

  // Distribution summary — counts only, never titles.
  const decadeCounts = {};
  const regionCounts = {};
  const genreCounts = {};
  for (const c of combined) {
    const dk = decadeKeyOf(c.year);
    decadeCounts[dk] = (decadeCounts[dk] || 0) + 1;
    regionCounts[c.region] = (regionCounts[c.region] || 0) + 1;
    genreCounts[c.genre] = (genreCounts[c.genre] || 0) + 1;
  }
  console.log(`[03_select] wrote ${combined.length} cards to data/selection.json.`);
  console.log("[03_select] decade distribution:", decadeCounts);
  console.log("[03_select] region distribution:", regionCounts);
  console.log("[03_select] genre distribution:", genreCounts);
}

main().catch((e) => {
  console.error("[03_select] fatal:", e.message);
  process.exit(1);
});
