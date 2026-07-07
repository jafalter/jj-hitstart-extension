// YouTube helpers: chorus-start offset + link building. Resolution (youtubei.js /
// yt-dlp) is wired up in 04_resolve.mjs. See PLAN.md §4, §7.

// Heuristic chorus offset: ~40% into the track, floored at 30s, capped at 75s.
// Falls back to 45s when duration is unknown. See PLAN.md §7.
export function chorusStartSeconds(durationSec) {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) return 45;
  const raw = Math.round(0.4 * durationSec);
  return Math.max(30, Math.min(75, raw));
}

export function buildWatchUrl(videoId, startSeconds) {
  const t = Math.max(0, Math.round(startSeconds || 0));
  return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${t}s`;
}

// Penalty keywords that suggest a wrong/undesirable video (cover, live, loop, etc.).
const BAD_KEYWORDS =
  /\b(live|cover|karaoke|remix|8[\- ]?bit|instrumental|reaction|lyrics?|sped up|slowed|nightcore|1 ?hour|10 ?hours?|loop|tribute)\b/i;

// Score a search candidate; higher is better. Prefers official / "Topic" uploads.
export function scoreCandidate(candidate, expected) {
  let score = 0;
  const title = (candidate.title || "").toLowerCase();
  const channel = (candidate.author || candidate.channel || "").toLowerCase();

  if (/ - topic$/.test(channel)) score += 5; // auto-generated artist channel
  if (candidate.isOfficial || /official/.test(channel)) score += 3;
  if (BAD_KEYWORDS.test(title)) score -= 5;

  if (expected?.artist && channel.includes(expected.artist.toLowerCase())) score += 2;

  // Duration proximity to expected (Deezer) length, if known.
  if (expected?.durationSec && candidate.durationSec) {
    const diff = Math.abs(candidate.durationSec - expected.durationSec);
    if (diff <= 5) score += 3;
    else if (diff <= 15) score += 1;
    else if (diff > 60) score -= 3;
  }
  return score;
}
