// Normalization for fuzzy artist/title matching. See PLAN.md §4.

// Umlaut/eszett equivalence, applied in the "expanded" direction (ü -> ue) so both
// spellings collapse to the same normalized form.
const UMLAUT_MAP = [
  [/ä/g, "ae"],
  [/ö/g, "oe"],
  [/ü/g, "ue"],
  [/ß/g, "ss"],
];

// Featuring / version qualifiers to strip from titles.
const FEAT_RE = /\s*[\(\[]?\s*(feat\.?|ft\.?|featuring)\b.*$/i;
const QUALIFIER_RE =
  /\s*[\(\[][^\)\]]*(remaster|remastered|version|mono|stereo|edit|mix|live|deluxe|bonus|radio|single|album)[^\)\]]*[\)\]]/gi;

function stripDiacritics(s) {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

export function normalizeText(input) {
  if (input == null) return "";
  let s = String(input).toLowerCase();
  for (const [re, rep] of UMLAUT_MAP) s = s.replace(re, rep);
  s = stripDiacritics(s);
  s = s.replace(QUALIFIER_RE, " ");
  s = s.replace(/&/g, " and ");
  s = s.replace(/[^a-z0-9]+/g, " "); // drop punctuation
  return s.trim().replace(/\s+/g, " ");
}

export function normalizeArtist(artist) {
  // Drop leading "The", normalize "and"/"&".
  return normalizeText(String(artist ?? "").replace(/^the\s+/i, ""));
}

export function normalizeTitle(title) {
  let s = String(title ?? "").replace(FEAT_RE, "");
  return normalizeText(s);
}

// Canonical match key for a song.
export function songKey(artist, title) {
  return `${normalizeArtist(artist)} | ${normalizeTitle(title)}`;
}
