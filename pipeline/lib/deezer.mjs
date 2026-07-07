// Deezer enrichment (free, no auth). Used to fill a coarse genre tag for chart
// rows and to look up a friend band's best-known track. See PLAN.md §2 Stage 1, §6.
import path from "node:path";
import { DATA } from "./paths.mjs";
import { fetchJSONCached, sleep } from "./http.mjs";

const RAW = path.join(DATA, "raw", "deezer");

function slug(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Deezer's free-text genre names, mapped to our coarse taxonomy.
const GENRE_MAP = [
  [/hip[\s-]?hop|rap/i, "hiphop"],
  [/electro|dance|house|techno|trance|edm/i, "electronic"],
  [/rock|metal|punk|grunge/i, "rock"],
  [/pop/i, "pop"],
];

export function mapGenre(names) {
  for (const n of names) {
    for (const [re, g] of GENRE_MAP) {
      if (re.test(n)) return g;
    }
  }
  return "unknown";
}

export async function deezerSearchTrack(artist, title) {
  const q = encodeURIComponent(`artist:"${artist}" track:"${title}"`);
  const cache = path.join(RAW, `search-${slug(artist)}-${slug(title)}.json`);
  const r = await fetchJSONCached(`https://api.deezer.com/search?q=${q}&limit=1`, cache, {
    timeoutMs: 10000,
    retries: 1,
  });
  if (!r.ok || !r.json?.data?.length) return null;
  return r.json.data[0];
}

// Full album lookup: genres + release year, cached per album id.
export async function deezerAlbumInfo(albumId) {
  if (!albumId) return { genres: [], year: null };
  const cache = path.join(RAW, `album-${albumId}.json`);
  const r = await fetchJSONCached(`https://api.deezer.com/album/${albumId}`, cache, {
    timeoutMs: 10000,
    retries: 1,
  });
  if (!r.ok) return { genres: [], year: null };
  const genres = (r.json?.genres?.data || []).map((g) => g.name);
  const year = r.json?.release_date ? Number(String(r.json.release_date).slice(0, 4)) : null;
  return { genres, year: Number.isFinite(year) ? year : null };
}

// Best-effort: search the track, fetch its album's genres, map to our taxonomy.
// Returns "unknown" on any miss/failure — genre is a soft target (PLAN.md §5).
export async function deezerEnrichGenre(artist, title) {
  try {
    const track = await deezerSearchTrack(artist, title);
    if (!track?.album?.id) return { genre: "unknown", durationSec: track?.duration || null, year: null };
    const { genres, year } = await deezerAlbumInfo(track.album.id);
    return { genre: mapGenre(genres), durationSec: track.duration || null, year };
  } catch {
    return { genre: "unknown", durationSec: null, year: null };
  }
}

export async function deezerSearchArtist(name) {
  const cache = path.join(RAW, `artist-${slug(name)}.json`);
  const r = await fetchJSONCached(`https://api.deezer.com/search/artist?q=${encodeURIComponent(name)}&limit=1`, cache, {
    timeoutMs: 10000,
    retries: 1,
  });
  if (!r.ok || !r.json?.data?.length) return null;
  return r.json.data[0];
}

export async function deezerArtistTopTracks(artistId, limit = 10) {
  const cache = path.join(RAW, `artist-top-${artistId}.json`);
  const r = await fetchJSONCached(`https://api.deezer.com/artist/${artistId}/top?limit=${limit}`, cache, {
    timeoutMs: 10000,
    retries: 1,
  });
  if (!r.ok) return [];
  return r.json?.data || [];
}

export { sleep };
