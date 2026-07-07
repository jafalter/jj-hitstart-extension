// Stage 4 — Resolve YouTube links (verify + fallback). See PLAN.md §2 (Stage 4), §7.
// STATUS: STUB. Depends on Stage 3 output (data/selection.json).
// Wiring notes:
//   - Search via youtubei.js: Innertube.create({}) then yt.music.search(q, {type:"song"}).
//   - Rank candidates with lib/youtube.mjs scoreCandidate(); prefer "Topic"/official.
//   - Verify top pick playable via `yt-dlp --skip-download --print id <id>`; else next.
//   - Store videoId + fallbackVideoId + startSeconds (chorusStartSeconds) + url.
//   - Idempotent: skip rows already {verified:true}.
console.log("[04_resolve] STUB — youtubei.js + yt-dlp resolution not yet implemented.");
console.log("[04_resolve] Needs Stage 3 (data/selection.json).");
