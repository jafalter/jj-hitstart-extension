# RESEARCH — DIY Hitster Extension

> **Status:** Research / brainstorming. This document collects requirements, open
> questions, and candidate approaches. It is refined iteratively until we lock a
> final `PLAN.md`.
>
> **⚠️ Spoiler rule (hard constraint):** No concrete song selections, artist/title
> lists, or "answer" data may ever appear in this file, in `PLAN.md`, in commit
> messages, or in the assistant's visible reasoning/logs. The song set must stay
> unknown to the user so the game stays fun. Selection artifacts (song lists,
> chosen tracks) live only in generated data files that are *not* opened/echoed.

---

## 1. Goal

Build a personal extension to the **Hitster** music card game:

- A **printable PDF**, laid out for **double-sided printing**, that produces cards
  you cut out.
- **Front side:** a **QR code** that, when scanned with a phone, plays a **snippet
  of the song**.
- **Back side:** the **release year**, **artist**, and **song title**.
- Target quantity: **~500 cards**.

## 2. Song selection requirements

- **Exclude** songs already present in **Hitster Classic** and **Hitster Rock**
  editions (user already owns these).
- **Era:** 1950 → present day.
- **Genres:** popular music — **Pop, Rock, Electronic, Hip Hop**.
- **Regional mix:** German-language songs from **Austria** and **Germany**, plus
  **international** music. (User is based in Austria.)
- **Real data source required:** popularity/selection must come from an actual
  queryable source of popular songs per decade — *not* the assistant's training
  data / memory.
- **Distribution:** across decades (and likely across genre/region) should not be
  strictly even, but must avoid large deviations. Roughly balanced, with the
  **1950–1960 era slightly under-weighted** relative to later decades.
- **Friends' bands:** include **exactly 1 song** from each band in a pool of the
  user's friends' favorite bands. The band pool will be provided later.

## 3. Playback / QR architecture — KEY OPEN PROBLEM

The central technical challenge is: **scan QR → hear snippet → without revealing the
answer.**

**User decisions so far:**
- Prefers **direct streaming links** (YouTube / Spotify / iTunes) in the QR.
- Wants to **avoid hosting / running a server** if at all possible.
- The game is played **in person** ("offline" = around a table); phones have
  internet at play time, so **always-online at game time is acceptable**.

**Unresolved tension:** a *direct* streaming link **shows the title + artist on
screen** the moment it opens → the scanner is spoiled. This conflicts with the hard
spoiler rule. So "direct link" and "spoiler-free" cannot both be fully satisfied.

Candidate approaches (re-scoped to the no-server preference):

| Approach | How it works | Server? | Spoiler-safe? |
|---|---|---|---|
| **E. Direct streaming link** | QR → track opens in YouTube/Spotify app. | None | **No** — title shown on screen. |
| **A′. Single static "audio-only" page** | QR → one free static file (GitHub Pages) with `?v=<id>`; plays audio on a **blank screen**, no title/art. | One static file, no maintenance | **Yes** |
| **F. Neutral-DJ workaround** | Use direct links (E) but one non-guessing player ("the DJ") holds the phone and looks away. | None | Partial / social convention |

**DECISION:** approach **E — direct streaming links, spoiler accepted.** No hosting,
no static file. QR encodes a direct link to the track. The user accepts that the
scanner sees the title on screen and will rely on not-looking / not-guessing that
round. (The assistant's own spoiler rule — no song lists in logs/docs — still
applies regardless.)

Consequences:
- **Platform:** leaning **YouTube** direct video links (free, no login, widest
  catalog incl. older & German-language tracks). Spotify links need the app/account
  and premium for on-demand. → confirm YouTube vs Spotify with user.
- **Video-ID resolution** per song is now a required build step: map each chosen
  (artist, title) → a specific YouTube video. Options: YouTube Data API (daily
  quota) or search-result resolution, preferring official / "Topic" (auto-generated
  artist) uploads to avoid covers/live/wrong versions.
- **Snippet start:** direct link plays the full song; can optionally add a start
  time (e.g. YouTube `&t=`) to jump toward the chorus. Minor; decide later.

## 4. Data sources (candidates for "real popular songs per decade")

- **Charts APIs / datasets:**
  - Billboard Hot 100 year-end (US) — via datasets/scrapers.
  - Official Charts (UK).
  - **Offizielle Deutsche Charts** (Germany) & **Ö3 / Austria Top 40** (Austria) —
    for the German-language regional requirement.
- **Music metadata / popularity:**
  - **Spotify Web API** — track popularity score, search, (waning) previews.
  - **MusicBrainz** — canonical metadata, release years, no popularity.
  - **Last.fm API** — play counts / top tracks by tag & period.
  - **iTunes Search API** — metadata + 30s previews, free, no auth.
- **Preview audio (for QR playback):** iTunes Search API, Deezer API, Spotify
  `preview_url`.

We likely need **two** source types: (1) a **popularity/selection** source to pick
*which* songs, and (2) a **preview-audio** source for playback. They may differ.

Open: which combination gives best coverage for 1950s–1970s (charts data thinner,
preview coverage patchier) *and* for Austrian/German repertoire.

## 5. Exclusion data (Hitster Classic + Rock)

We need the **actual card lists** of Hitster Classic and Hitster Rock to exclude
their songs.

- Do these lists exist publicly (community spreadsheets, BGG, fan wikis)?
- Or does the user have them (the physical cards / an export)?
- Matching must be **fuzzy** (artist+title normalization) to catch spelling/feat.
  variations. Possibly also exclude by (artist, year) near-duplicates.

## 6. PDF / print layout

- **Paper:** A4 (EU default) assumed. Cards per sheet? (e.g., 3×3 = 9, or 4×2.)
- **Card size:** Hitster cards are ~**65 × 65 mm** square. Match, or custom?
- **Double-sided alignment:** back must mirror front so year/artist lands on the
  correct card after duplex printing. Needs mirrored column order + registration
  marks / cut guides / bleed.
- **QR:** error-correction level, quiet zone, size for reliable phone scanning.
- **Toolchain:** generate via HTML+CSS → print, or a library (e.g., Python
  `reportlab` / `weasyprint`, or JS). TBD.

## 7. Proposed high-level pipeline (draft)

1. **Acquire** decade/region/genre popularity lists from real source(s).
2. **Acquire** exclusion lists (Hitster Classic + Rock); normalize.
3. **Filter** out excluded songs; filter to target genres/eras/regions.
4. **Sample** ~500 with target distribution (decade × genre × region quotas,
   roughly balanced, not strictly even).
5. **Inject** 1 song per friend-band from the provided pool.
6. **Resolve** each pick to (a) verified year/artist/title and (b) a preview-audio
   source URL / hosted page.
7. **Generate** QR codes pointing at the spoiler-safe player.
8. **Render** the duplex-aligned printable PDF.
9. (Ongoing) keep the selected-song data out of logs/committed plaintext the user
   would see.

## 8. Open questions for the user

See the questions posed alongside this document. Summary of the big ones:

**Resolved:**
- Playback: **direct streaming links, spoiler accepted, no hosting** (§3, approach
  E). In-person play, online at game time OK.
- Preview/audio source: **YouTube** primary (assistant's pick for best coverage).
- Exclusion lists: **source from the community** (fan/BGG spreadsheets).
- Distribution: **roughly balanced with soft quotas** across decades / genres /
  region — even-ish, natural variation allowed, no big deviations. **Exception:**
  the **1950–1960** era gets a **slightly smaller** share than later decades
  (reflects thinner data/recognizability; still represented, just under-weighted).
- Print: **A4, ~65×65 mm square cards** (matches real Hitster), duplex-aligned with
  cut guides.
- Popularity bar: **"well-known is enough"** — charted OR widely-recognized
  classics / genre staples even if they didn't chart high.

- QR platform: **YouTube** direct video links.
- Friends' band pool: **12 artists** provided (1 song each → 12 of the ~500
  reserved). List in §12.
- Snippet start: **jump toward the chorus** (link opens near the recognizable part).

**Chorus-start — needs a feasible method (research item):** there is no free,
per-song "chorus timestamp" dataset with good coverage. Candidate approaches:
- **Heuristic offset:** open at a fixed fraction of the track (e.g. ~40–50% in) or a
  fixed offset (e.g. 45–60s). Cheap, no per-song work, roughly lands in-song.
- **Data-assisted:** use a "most-replayed"/highlights signal where available, else
  fall back to the heuristic.
- **Manual** per song: highest quality, not viable at 500 scale.
**DECISION:** use the **heuristic offset** (open the link at a fixed fraction /
offset into the track). No per-song chorus work. Exact rule validated during
planning.

**All user decisions captured.** Remaining items are assistant research tasks
(no user input needed) — see §9.

## 9. Assistant research tasks before PLAN.md

These require actual investigation (web / API feasibility), not user decisions:

1. **Exclusion lists** — locate reliable community lists of Hitster **Classic** and
   **Rock** card contents (BGG, fan wikis/spreadsheets); assess coverage & format.
2. **Popularity source(s)** — confirm best real per-decade sources covering
   1950→today across US/UK **and** AT/DE (Ö3/Austria Top 40, Offizielle Deutsche
   Charts), plus genre coverage for Electronic/Hip-Hop.
3. **YouTube resolution** — feasibility of mapping (artist, title) → correct video
   at ~500 scale without excessive API quota; preferring official/"Topic" uploads.
4. **Chorus-start heuristic** — validate a simple offset rule; check if a
   most-replayed signal is practically obtainable.
5. **Toolchain** — pick PDF generator (HTML/CSS print vs. Python reportlab/
   weasyprint) and QR library; confirm duplex mirroring approach for A4 / 65mm.

## 10. Research findings (2026-07-06)

### 10.1 Prior art / reusable toolchain
- **`fjlein/hitster`** — Python + **Typst**, pulls a Spotify playlist, generates QR
  codes, outputs a **duplex-printable PDF**. Spotify-only (QR → Spotify). Good
  layout reference; not YouTube.
- **`ruuda/hitsgame`** — Python, `qrcode` lib, **A4 duplex with crop marks/grid**,
  but self-hosted FLAC files. Good print-layout reference.
- **`Tehes/chart-streak`** — a Hitster-like timeline game built on **German charts**:
  ships `scrape-charts.js` (Top 100/year from **offiziellecharts.de**),
  `enrich-charts.js` (metadata via **Deezer**), `merge-charts.js`. Directly useful
  as a chart-scraping + enrichment reference and possibly a ready dataset.

  → **Approach:** likely build our own thin pipeline (we need YouTube links + custom
  distribution logic + exclusion), borrowing layout ideas from these. No single
  existing project matches (YouTube + multi-source popularity + exclusion).

### 10.2 Popularity / chart data sources (confirmed real, queryable)
- **US — Billboard Hot 100:** ready datasets `utdata/rwd-billboard-data`,
  `mhollingshead/billboard-hot-100` (JSON, all charts). **Starts 1958** (Hot 100
  inception) → pre-1958 needs older Billboard "Best Sellers"; **early-1950s coverage
  is thinner** everywhere.
- **UK — Official Charts:** `JackDanHollister/UkTop100Scrape` back to **1952**.
- **Germany — Offizielle Deutsche Charts:** scrapeable via `Tehes/chart-streak`
  tooling; also `chart-history.net/german-complete`.
- **Austria — Ö3 Austria Top 40:** no official API; **austriancharts.at** has
  year-end charts by decade (scrapeable). oe3.orf.at for recent.
- **Deezer** used by chart-streak for enrichment (year/metadata) — free, no auth.

  → Covers US/UK/DE/AT and 1952→today well; **1950–1957 and niche
  Electronic/Hip-Hop** are the thin spots (mitigated by "well-known is enough").

### 10.3 YouTube link resolution (for the QR)
- **`ytmusicapi`** `search()` → returns `videoId` for an (artist, title) query, **no
  API key** needed. Prefer official / auto-generated **"Topic"** channel uploads to
  avoid covers/live/wrong versions.
- `yt-dlp` `ytsearch` as fallback / verification (`--get-title`).
  → Feasible at ~500 scale without Google API quota. Needs a quality-check step
  (right artist, studio version, not a 10-hour loop / cover).

### 10.4 Exclusion lists (Hitster Classic + Rock)
- **Official Spotify playlists exist** per edition (e.g. base "HITSTER" and a Rock
  playlist) → cleanest machine-readable exclusion source via Spotify API.
- **hitster.store** and community pages also list edition contents.
- ⚠️ **Regional caveat:** Hitster's base ("Classic") deck **differs by country/market**.
  The Austrian/German-market deck ≠ the UK/US deck. We must exclude the **editions
  the user actually owns** → need to confirm which market/language version.

### 10.5 Exclusion scope — RESOLVED
- User owns the **German (DE/AT) market** editions.
- Exclude **only** the **German "Hitster" base ("Classic")** deck and **"Hitster
  Rock"** (DE/AT). No other expansions owned.
  → Source the DE/AT edition song lists (official Spotify playlists for the German
  market and/or hitster.store DE), normalize (artist+title, feat./umlaut-aware),
  fuzzy-match to exclude.

---

## 11. Status: research complete

All user decisions captured; data sources, toolchain, exclusion scope, and playback
approach validated. **Ready to draft `PLAN.md`** — a concrete build plan covering:
pipeline stages, chosen libraries, distribution/quota model, exclusion matching,
YouTube resolution + quality checks, the heuristic chorus offset, and the A4 /
65 mm duplex PDF layout. (Selected songs will live only in generated data files,
never echoed into docs, logs, or commits.)

## 12. Friends' band pool (12 artists — 1 song each, reserved)

Band **names** are inputs, not spoilers, so they're recorded here; the specific
song + year chosen per band is a spoiler and will **not** appear in any doc/log.

1. Bloodhound Gang
2. Einstürzende Neubauten
3. Agnes Obel  *(provided as "Agnes Obe" — corrected to Agnes Obel, confirmed)*
4. Queens of the Stone Age
5. Jonathan Coulton  *(provided as "Jonathan Caulton" — corrected to Jonathan Coulton, confirmed)*
6. Charles Mingus
7. Cypress Hill
8. Pink Floyd
9. Robbie Williams
10. Linkin Park
11. Nina Chuba
12. A Klana Indiana

**Notes:**
- These are **forced picks**, exempt from the genre/era/popularity rules — e.g.
  **Charles Mingus** is jazz (outside Pop/Rock/Electronic/Hip-Hop) and
  **A Klana Indiana** is Austrian mundart; both included regardless.
- **Nina Chuba** (DE) and **A Klana Indiana** (AT) also reinforce the
  German-language quota.
- Still apply the **exclusion** check: if a forced artist already appears in the
  owned Hitster Classic/Rock decks, pick a *different* song by that artist not in
  those decks.
- These 12 count toward the ~500 total.
