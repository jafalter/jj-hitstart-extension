# jj-hitster-extension

A DIY expansion for the **Hitster** music card game: build a duplex-printable deck
of ~500 cards. Front = QR code → opens a YouTube snippet; back = release year,
artist, title. See **[PLAN.md](PLAN.md)** for the full design and **[RESEARCH.md](RESEARCH.md)**
for the decisions behind it.

> **Spoiler rule:** the selected songs are kept out of the repo in plaintext. The
> final songlist lives only in `data/` (git-ignored) and as an **encrypted**
> `editions/*.enc` file. Don't open/print the answer data if you want to play.

## Setup

Requires **Node ≥ 20** and two external CLIs on PATH:

- **`yt-dlp`** — YouTube link verification.
- **`typst`** — PDF rendering.

```sh
npm install
cp .env.example .env      # then fill in EDITION_KEY (see below)
```

### EDITION_KEY

Encrypts the committed songlist so past picks can be excluded from future editions
without being casually readable.

```sh
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Put the value in `.env` **and your password manager**. If lost, past editions can't
be decrypted for exclusion — there's no recovery.

## Build pipeline

Each stage reads the previous stage's output and is independently re-runnable:

```sh
npm run charts      # 01 — scrape/normalize popularity data  -> data/charts/
npm run exclusions  # 02 — scrape owned Hitster decks + prior editions -> data/exclusions.json
npm run select      # 03 — filter + quota sampling + friends -> data/selection.json
npm run resolve     # 04 — YouTube videoId + verify + fallback (idempotent)
npm run render      # 05 — QR codes + cards.pdf (via typst)
npm run seal        # 06 — encrypt final list -> editions/<name>.enc (commit this)
# or:
npm run build       # all six in order
```

> Status: pipeline scaffold. Stages 01–05 are stubs pending live scraper/resolver
> implementation; stage 06 (seal) and the shared libs (normalize/crypto/match/
> youtube/qr) are functional.

## Printing

- **Paper:** A4. **Cards:** 65 × 65 mm, 12 per sheet (3 × 4).
- Print `cards.pdf` **double-sided**, flip on the **long edge**, at **100% scale**
  (disable "fit to page" / "shrink to fit").
- The back sheet's columns are pre-mirrored so year/artist/title land on the correct
  card after the flip.
- **Do a 1-sheet test print first** — check front/back registration marks align
  before running all ~42 sheets, then cut along the crop grid.
