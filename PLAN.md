# PLAN — DIY Hitster Extension

> **Status:** Build plan, derived from `RESEARCH.md`. Concrete enough to implement.
>
> **⚠️ Spoiler rule (hard constraint, unchanged):** No concrete song selections,
> artist/title lists, or "answer" data appear in this file, in commits, or in
> assistant logs/reasoning. All selected-song artifacts live only in **generated,
> git-ignored** data files (see §8) that are never opened/echoed.

---

## 0. Locked decisions (from research + planning)

| Area | Decision |
|---|---|
| Playback | **Direct YouTube video links** in the QR. Spoiler on scan accepted. No hosting. |
| Toolchain | **Node.js** pipeline end-to-end. |
| YouTube resolution | **`youtubei.js`** (keyless YT Music search) → `videoId`; **`yt-dlp`** shelled out for verification. |
| PDF | **Typst** — generate `.typ`, compile with the `typst` CLI. Duplex A4, 65×65 mm cards, crop marks. |
| Link robustness | **Verify each link + store a fallback `videoId`** per card. |
| Exclusion scope | **German (DE/AT) market** "Hitster" base + "Hitster Rock" only. Source in §2. |
| Era / genres | 1950→today; Pop, Rock, Electronic, Hip Hop (+ friends' forced picks, genre-exempt). |
| Distribution | Roughly balanced soft quotas over decade × region × genre; **1950s under-weighted**. |
| Region mix | **~10% Austria + ~10% Germany ≈ 20% German-language**, rest international. |
| Chorus start | **Heuristic offset** (fixed fraction of track), no per-song work. |
| Card count | **~500** total, incl. **13** reserved friends'-band picks. |
| Final songlist | **Encrypted + committed** (`/editions/*.enc`) so future editions can exclude past picks; plaintext stays git-ignored & never echoed. |

## 1. Repository layout

```
/pipeline            # Node.js build pipeline (source, committed)
  01_charts.mjs        # scrape/normalize popularity sources → data/charts/*
  02_exclusions.mjs    # fetch Hitster DE/AT decks → data/exclusions.json
  03_select.mjs        # filter + quota sampling + friends injection → data/selection.json
  04_resolve.mjs       # (artist,title) → YouTube videoId + fallback + verify
  05_render.mjs        # selection → cards.typ → cards.pdf (via typst CLI)
  06_seal.mjs          # encrypt final selection → /editions/<name>.enc (committed)
  lib/                 # normalize.mjs, match.mjs, quota.mjs, youtube.mjs, qr.mjs, crypto.mjs
  config/
    quotas.json        # decade × region × genre soft targets (NO songs)
    friends.json       # 13 band names only (names are inputs, not spoilers)
    sources.json       # chart source URLs / years, Hitster playlist IDs
/data                  # GENERATED, GIT-IGNORED (spoiler zone) — see §8
/editions              # COMMITTED encrypted songlists (*.enc) — past editions' picks
/templates
  card.typ             # Typst layout: front (QR) / back (year+artist+title)
PLAN.md  RESEARCH.md  .gitignore  package.json
```

**`.gitignore` must include `/data/` and `cards.pdf`/`cards.typ`** so no plaintext
song data or answer sheet is ever committed. `/editions/*.enc` **is** committed
(encrypted, §8).

## 2. Pipeline stages

### Stage 1 — Acquire popularity data (`01_charts.mjs`)
- Sources (all keyless/scrapeable, confirmed in research §10.2):
  - **US** Billboard Hot 100 year-end — via ready JSON dataset (1958→; pre-1958 thin).
  - **UK** Official Charts (1952→).
  - **DE** Offizielle Deutsche Charts (offiziellecharts.de, chart-streak approach).
  - **AT** Ö3 / Austria Top 40 (austriancharts.at year-end by decade).
- HTTP via `undici`/`fetch`; HTML parsing via **`cheerio`**.
- Enrich year/metadata gaps via **Deezer** API (free, no auth).
- Output: normalized rows `{ artist, title, year, region, sourceRank, sources[] }`
  into `data/charts/<source>.json`. **Cache raw responses** in `data/raw/` so
  re-runs don't re-hit sources.
- Tag each row with a coarse **genre** (from source section / Deezer genre where
  available; best-effort — genre quotas are soft).

### Stage 2 — Acquire exclusions (`02_exclusions.mjs`)
- **Primary source: scrape** the **DE/AT-market** "Hitster" base + "Hitster Rock"
  track listings (hitster.store DE + community listings). Spotify's official
  playlists (`26zIHVncgI9HmHlgYWwnDi`, `4oYTRg0JI48jucsJOLily1`) are kept in
  `config/sources.json` **for reference only** — the Web API is unavailable for new
  apps (Spotify froze new integrations), so we do not read them programmatically.
- HTML parse via `cheerio`; sanity-check scraped counts against the known deck sizes.
- **Prior editions:** decrypt any `/editions/*.enc` (§8) and add their normalized
  keys to the exclusion set, so a new edition never repeats past picks.
- Normalize (§4) and write `data/exclusions.json` (normalized keys only).

### Stage 3 — Select (`03_select.mjs`)
1. Load all chart rows; dedupe to canonical `(artistNorm, titleNorm)`, keep best
   rank / merge source list; attach year, region, genre.
2. **Filter:** drop rows matching `exclusions.json` (fuzzy, §4); drop outside
   1950–present; keep only target genres (unknown-genre allowed if well-known).
3. **Quota sampling** (§5) to ~488 general picks.
4. **Inject friends' bands** (§6): for each of the 12, pick 1 best non-excluded
   song → 12 picks. Total ≈ 500.
5. Write `data/selection.json`: `{ id, artist, title, year, region, genre, source,
   isFriendPick }[]`. **This is the primary spoiler file.**

### Stage 4 — Resolve YouTube links (`04_resolve.mjs`)
- For each selection, `youtubei.js` YT Music `search(type:"song")` for
  `"<artist> <title>"`.
- **Quality ranking:** prefer official / auto-generated **"Topic"** channel;
  penalize titles containing live/cover/remix/karaoke/8-bit/loop/hour, mismatched
  artist, or duration far from Deezer/expected length.
- **Verify + fallback (locked):** confirm the top pick is playable via `yt-dlp`
  (metadata fetch, not download); if it fails, promote next candidate. Store
  `videoId` **and** a second `fallbackVideoId`.
- **Chorus offset (§7):** compute `startSeconds` per track.
- Build the final URL: `https://www.youtube.com/watch?v=<id>&t=<startSeconds>s`.
- Write back into `data/selection.json` (`videoId`, `fallbackVideoId`,
  `startSeconds`, `verified`, `url`). Idempotent: skip already-verified rows so
  re-runs are cheap.

### Stage 5 — Render PDF (`05_render.mjs`)
- Generate one QR PNG per card (`qrcode` npm) into `data/qr/` — encodes `url`.
- Emit `cards.typ` from `templates/card.typ` with the card data, then run
  `typst compile cards.typ cards.pdf`.
- Layout in §9.

### Stage 6 — Seal (`06_seal.mjs`)
- Encrypt the final enriched `data/selection.json` → `/editions/<name>.enc`
  (committed) using AES-256-GCM (Node built-in `crypto`, no dependency); key from
  `EDITION_KEY` env var (§8). Casual reading blocked; future editions decrypt it in
  Stage 2 for exclusion.

## 3. Config (no songs, safe to commit)

- `config/quotas.json` — the numeric allocation table (§5).
- `config/friends.json` — the **13 band names** from RESEARCH §12 (names only).
- `config/sources.json` — chart source URLs, year ranges, Hitster playlist IDs.

## 4. Normalization & fuzzy matching (`lib/normalize.mjs`, `lib/match.mjs`)
- Lowercase; strip diacritics **and** provide umlaut-aware equivalence
  (ü↔ue, ö↔oe, ä↔ae, ß↔ss) both directions.
- Strip `feat.`/`ft.`/`featuring …`, `(Remastered …)`, `(… Version)`, bracketed
  qualifiers, punctuation; collapse whitespace.
- Match key = `artistNorm + " | " + titleNorm`.
- Exclusion match = exact normalized key **OR** token-set fuzzy ratio ≥ threshold
  (e.g. `fast-levenshtein`/`string-similarity`), plus an `(artistNorm, year±1)`
  near-duplicate guard. Threshold validated against a sample during build.

## 5. Distribution / quota model (`config/quotas.json`, `lib/quota.mjs`)

Decade buckets with 1950s under-weighted; 2020s partial. **Proposed** general-pool
targets (sum ≈ 488; tunable in config, not code):

| Decade | Target |
|---|---:|
| 1950s | 30 |
| 1960s | 63 |
| 1970s | 65 |
| 1980s | 68 |
| 1990s | 68 |
| 2000s | 68 |
| 2010s | 68 |
| 2020s (partial) | 58 |

Within each decade, soft sub-quotas:
- **Region:** ~10% Austria + ~10% Germany (≈20% German-language), rest
  international.
- **Genre:** Pop/Rock/Electronic/Hip Hop, **decade-aware** — Electronic mainly
  1980s→, Hip Hop mainly late-1980s→; early decades fill from Pop/Rock. Genre is a
  *soft* target; unknown-genre well-known tracks are eligible.

**Sampling algorithm:** rank each decade's candidates by chart strength / source
count; greedily fill quotas honoring region+genre sub-targets; **cap songs per
artist** (e.g. ≤ 2–3) to spread variety; if a sub-bucket underfills (thin data),
**relax** genre first, then region, then borrow from an adjacent decade, logging
only *counts* (never titles). Deterministic given a fixed seed.

## 6. Friends' bands (`config/friends.json`)
- 13 band names (RESEARCH §12). For each: search resolved chart/catalog data (or
  Deezer) for that artist's best-known non-excluded track; pick 1.
- **Forced & rule-exempt:** ignore genre/era/popularity constraints (covers jazz /
  Austrian mundart entries). Still apply **exclusion** — if the obvious song is in
  the owned decks, choose a different one by that artist.
- Marked `isFriendPick: true`; counts toward the ~500.

## 7. Chorus-start heuristic (`lib/youtube.mjs`)
- Rule: `startSeconds = clamp(round(0.40 * durationSec), 30, 75)` — ~40% in,
  floored at 30 s (skip long intros), capped at 75 s (stay in-song for short
  tracks). Duration from `yt-dlp`/Deezer metadata; if unknown, fixed **45 s**.
- Validate the constants against a handful of tracks during build; tune in one
  place. No per-song manual work, no most-replayed dependency.

## 8. Spoiler / data hygiene & encryption
- Everything under `/data/` is **git-ignored** and **never Read/echoed** by the
  assistant once populated: `charts/`, `raw/`, `exclusions.json`, `selection.json`,
  `qr/`, plus `cards.typ`/`cards.pdf`.
- Pipeline logs emit **counts and IDs only**, never artist/title. A lint check in
  CI/precommit greps staged files for accidental song data.
- **Encrypted committed songlist (`/editions/<name>.enc`):**
  - AES-256-GCM via Node's built-in `crypto` (no dependency). File format:
    `salt | iv | authTag | ciphertext`; key derived from `EDITION_KEY` via scrypt.
  - Purpose: reusable cross-edition exclusion (Stage 2 decrypts prior editions),
    while staying **not casually readable** by the user — matches the "encrypt so
    it's not straightforward to read" ask.
  - **Key management:** `EDITION_KEY` lives only in `.env` (git-ignored) and the
    user's password manager. **If lost, the edition's picks can't be decrypted**
    for future exclusion — call this out in the README.
- Secrets: only **`EDITION_KEY`** via `.env` (git-ignored), read with
  `node --env-file`. No Spotify/Google credentials needed — the pipeline is
  credential-free apart from the local encryption key.

## 9. Print layout (`templates/card.typ`)
- **Paper:** A4 (210 × 297 mm). **Card:** 65 × 65 mm square (matches Hitster).
- **Grid:** 3 columns × 4 rows = **12 cards/sheet** (195 mm wide, 260 mm tall;
  fits with ~7 mm side / ~18 mm top-bottom margins). ~500 cards → ~42 duplex sheets.
- **Front sheet:** QR centered per cell, quiet zone preserved, error-correction
  **level Q** for print robustness; small card index in a corner for pairing.
- **Back sheet:** **column order mirrored** (left↔right) so year/artist/title lands
  on the correct card after long-edge duplex flip. Back shows **year** (large),
  **artist**, **title**.
- **Crop marks / cut grid** between cells; thin registration marks at sheet corners
  to check front/back alignment before cutting.
- Print guidance documented in README: duplex = *flip on long edge*, 100% scale
  (no "fit to page").

## 10. Build order & commands
```
npm run charts      # 01 — populates data/charts (cached)
npm run exclusions  # 02 — data/exclusions.json (+ decrypt prior /editions/*.enc)
npm run select      # 03 — data/selection.json
npm run resolve     # 04 — YouTube ids + verify + fallback (idempotent)
npm run render      # 05 — cards.pdf
npm run seal        # 06 — /editions/<name>.enc (encrypted, committed)
```
Each stage is independently re-runnable and reads the previous stage's output.

## 11. Dependencies (Node)
`youtubei.js`, `cheerio`, `undici` (or native fetch), `qrcode`,
`string-similarity`/`fast-levenshtein`; `yt-dlp` and `typst` as external CLIs
(document install). Encryption uses Node's built-in `crypto` (no dependency). No
Spotify/Google SDKs.

## 12. Risks / mitigations
- **YouTube link rot / geo-block** → verify + fallback id + re-runnable resolve.
- **Thin 1950–57 & niche Electronic/Hip-Hop** → "well-known is enough", soft-quota
  relaxation, adjacent-decade borrow.
- **Genre tagging is coarse** → treated as soft target only.
- **Duplex misalignment** → registration marks + a 1-sheet test print before the
  full run.
- **Scraped exclusion list drift / market mismatch** → cross-check hitster.store DE
  against community listings and known deck sizes; confirm it matches the owned
  editions. (Spotify Web API unavailable — new-app integrations frozen.)

## 13. Open items to confirm before/at implementation
1. **Quota numbers** in §5 are a proposal — accept as-is or adjust the balance?

**Resolved since first draft:** exclusion = **scrape** hitster.store DE (Spotify Web
API frozen for new apps) (§2) · region mix 10% AT + 10% DE (§5) · card back = year →
artist → title (§9) · final songlist encrypted + committed, `EDITION_KEY` set (§8) ·
13th friend band added (RESEARCH §12) · YouTube needs no API key · no external
credentials required (§0).
```
