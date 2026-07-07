// Stage 4 — Resolve YouTube links (verify + fallback). See PLAN.md §2 (Stage 4), §7.
//
// Search order: YT Music "song" search (canonical audio-only uploads) first,
// falling back to a plain video search for tracks YT Music doesn't index
// (common for the genre/era-exempt friend picks). Candidates are ranked with
// lib/youtube.mjs scoreCandidate(); the top pick is verified playable via
// `yt-dlp` when it's installed (best-effort — degrades to unverified, not
// fatal, when it isn't). Idempotent: rows already {verified:true} are skipped.
//
// Logs counts only — never artist/title (spoiler hygiene, PLAN.md §8).
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Innertube } from "youtubei.js";
import { DATA, ensureDir, readJSON, writeJSON } from "./lib/paths.mjs";
import { sleep } from "./lib/http.mjs";
import { scoreCandidate, chorusStartSeconds, buildWatchUrl } from "./lib/youtube.mjs";
import { resolveBinary } from "./lib/bin.mjs";

const execFileAsync = promisify(execFile);
const SELECTION_PATH = path.join(DATA, "selection.json");
const CACHE_DIR = path.join(DATA, "raw", "youtube");
ensureDir(CACHE_DIR);

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// ---------------------------------------------------------------------------
// yt-dlp verification (optional external CLI — degrades gracefully if absent)
// ---------------------------------------------------------------------------
let ytDlpBin = undefined;
async function checkYtDlpAvailable() {
  if (ytDlpBin === undefined) ytDlpBin = await resolveBinary("yt-dlp");
  return ytDlpBin !== null;
}

async function verifyPlayable(videoId) {
  try {
    await execFileAsync(
      ytDlpBin,
      ["--skip-download", "--simulate", "--print", "id", `https://www.youtube.com/watch?v=${videoId}`],
      { timeout: 20000 },
    );
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Search (cached to data/raw/youtube/ so re-runs don't re-hit YouTube)
// ---------------------------------------------------------------------------
async function searchCandidates(yt, artist, title) {
  const cachePath = path.join(CACHE_DIR, `search-${slug(artist)}-${slug(title)}.json`);
  if (fs.existsSync(cachePath)) return readJSON(cachePath);

  const candidates = [];
  const query = `${artist} ${title}`;

  try {
    const musicResults = await yt.music.search(query, { type: "song" });
    for (const item of musicResults?.songs?.contents || []) {
      if (item.item_type !== "song" || !item.id) continue;
      candidates.push({
        videoId: item.id,
        title: item.title,
        author: (item.artists || []).map((a) => a.name).join(", "),
        durationSec: item.duration?.seconds ?? null,
        kind: "music",
      });
    }
  } catch (e) {
    console.warn(`[04_resolve] music search failed for a row: ${e.message}`);
  }

  if (candidates.length === 0) {
    try {
      const videoResults = await yt.search(`${query} official audio`, { type: "video" });
      for (const v of (videoResults?.videos || videoResults?.results || []).slice(0, 10)) {
        if (!v.id) continue;
        candidates.push({
          videoId: v.id,
          title: v.title?.toString?.() || String(v.title || ""),
          author: v.author?.name || "",
          durationSec: v.duration?.seconds ?? null,
          kind: "video",
        });
      }
    } catch (e) {
      console.warn(`[04_resolve] video search fallback failed for a row: ${e.message}`);
    }
  }

  writeJSON(cachePath, candidates);
  return candidates;
}

// ---------------------------------------------------------------------------
async function main() {
  if (!fs.existsSync(SELECTION_PATH)) {
    console.error("[04_resolve] data/selection.json not found — run stage 3 first.");
    process.exit(1);
  }
  const selection = readJSON(SELECTION_PATH);

  const ytDlpOk = await checkYtDlpAvailable();
  if (!ytDlpOk) {
    console.warn(
      "[04_resolve] yt-dlp not found on PATH — link verification will be skipped for all rows " +
        "(videoId/url are still resolved). Install yt-dlp and re-run to verify + catch link rot.",
    );
  }

  const yt = await Innertube.create({ generate_session_locally: true });

  let resolved = 0;
  let alreadyDone = 0;
  let unresolved = 0;
  let verifiedCount = 0;

  for (const entry of selection) {
    if (entry.verified) {
      alreadyDone++;
      continue;
    }

    const candidates = await searchCandidates(yt, entry.artist, entry.title);
    if (candidates.length === 0) {
      unresolved++;
      await sleep(250);
      continue;
    }

    const expected = { artist: entry.artist, durationSec: null };
    const ranked = [...candidates].sort((a, b) => scoreCandidate(b, expected) - scoreCandidate(a, expected));

    let primary = ranked[0];
    let fallback = ranked[1] || null;

    if (ytDlpOk) {
      if (await verifyPlayable(primary.videoId)) {
        entry.verified = true;
        verifiedCount++;
      } else if (fallback && (await verifyPlayable(fallback.videoId))) {
        [primary, fallback] = [fallback, primary];
        entry.verified = true;
        verifiedCount++;
      } else {
        entry.verified = false;
      }
    } else {
      entry.verified = false;
    }

    entry.videoId = primary.videoId;
    entry.fallbackVideoId = fallback?.videoId || null;
    entry.startSeconds = chorusStartSeconds(primary.durationSec);
    entry.url = buildWatchUrl(primary.videoId, entry.startSeconds);
    resolved++;

    await sleep(250); // pace requests against YouTube's internal API
  }

  writeJSON(SELECTION_PATH, selection);
  console.log(
    `[04_resolve] resolved ${resolved} row(s) (${verifiedCount} verified via yt-dlp), ` +
      `${alreadyDone} already done, ${unresolved} unresolved (no search hit).`,
  );
}

main().catch((e) => {
  console.error("[04_resolve] fatal:", e.message);
  process.exit(1);
});
