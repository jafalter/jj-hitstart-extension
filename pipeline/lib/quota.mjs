// Decade x region x genre quota sampling. See PLAN.md §5.
import { normalizeArtist } from "./normalize.mjs";

export function decadeKeyOf(year) {
  return `${Math.floor(year / 10) * 10}s`;
}

// Pop/rock are always eligible; electronic/hiphop only from their configured
// decade onward (soft — used as a fill preference, not a hard filter).
export function eligibleGenresForDecade(decadeKey, genresCfg) {
  const decadeStart = parseInt(decadeKey, 10);
  const genres = ["pop", "rock"];
  if (decadeStart >= parseInt(genresCfg.electronicFromDecade, 10)) genres.push("electronic");
  if (decadeStart >= parseInt(genresCfg.hiphopFromDecade, 10)) genres.push("hiphop");
  return genres;
}

// Greedily fills `target` slots from `candidates` (already sorted by chart
// strength, best first), honoring soft region + genre sub-targets and a hard
// per-artist cap — relaxing genre first, then region, when the strict pass
// can't fill the bucket. `artistCounts` is shared/mutated across decades so
// the per-artist cap applies pipeline-wide, not just within one decade.
export function selectForDecade(decadeKey, candidates, target, quotas, artistCounts) {
  const eligibleGenres = eligibleGenresForDecade(decadeKey, quotas.genres);
  const regionTargets = {
    AT: Math.round(target * quotas.region.austria),
    DE: Math.round(target * quotas.region.germany),
  };
  regionTargets.INTL = Math.max(0, target - regionTargets.AT - regionTargets.DE);
  const genreCap = Math.max(1, Math.ceil((target / eligibleGenres.length) * 1.6));

  const picked = [];
  const pickedSet = new Set();
  const regionCounts = { AT: 0, DE: 0, INTL: 0 };
  const genreCounts = {};

  function tryFill(relaxRegion, relaxGenre) {
    for (const c of candidates) {
      if (picked.length >= target) return;
      if (pickedSet.has(c)) continue;
      const artistKey = normalizeArtist(c.artist);
      if ((artistCounts.get(artistKey) || 0) >= quotas.maxSongsPerArtist) continue;
      if (!relaxRegion && regionCounts[c.region] >= regionTargets[c.region]) continue;
      if (!relaxGenre && c.genre !== "unknown" && (genreCounts[c.genre] || 0) >= genreCap) continue;
      picked.push(c);
      pickedSet.add(c);
      regionCounts[c.region]++;
      genreCounts[c.genre] = (genreCounts[c.genre] || 0) + 1;
      artistCounts.set(artistKey, (artistCounts.get(artistKey) || 0) + 1);
    }
  }

  // Strict -> relax genre -> relax region+genre (PLAN.md §5: "relax genre
  // first, then region"). Artist cap is never relaxed.
  tryFill(false, false);
  tryFill(false, true);
  tryFill(true, true);

  return { picked, regionCounts, genreCounts };
}

// Fills any remaining shortfall (adjacent-decade borrow, PLAN.md §5) from a
// pooled leftover list, honoring only the artist cap.
export function borrowFill(need, leftovers, artistCounts, maxPerArtist) {
  const extra = [];
  const pickedSet = new Set();
  for (const c of leftovers) {
    if (need <= 0) break;
    if (pickedSet.has(c)) continue;
    const artistKey = normalizeArtist(c.artist);
    if ((artistCounts.get(artistKey) || 0) >= maxPerArtist) continue;
    extra.push(c);
    pickedSet.add(c);
    artistCounts.set(artistKey, (artistCounts.get(artistKey) || 0) + 1);
    need--;
  }
  return extra;
}
