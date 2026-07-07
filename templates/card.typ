// Typst duplex card layout. See PLAN.md §9.
// A4, 65x65 mm cards, 3 columns x 4 rows = 12 cards/sheet.
// Back sheet mirrors column order (left<->right) for long-edge duplex flip.
//
// 05_render.mjs injects the real card data by replacing the CARDS placeholder
// below with a Typst array of (id, year, artist, title, qr) entries, then compiles.
//
// This file is a TEMPLATE/reference. Do not commit a filled-in cards.typ (git-ignored).

#set page(paper: "a4", margin: (x: 7mm, y: 18mm))

#let card-size = 65mm
#let cols = 3
#let rows = 4

// --- Front cell: QR centered, small index in corner ---
#let front-cell(entry) = box(
  width: card-size, height: card-size, stroke: 0.2pt + gray,
)[
  #place(top + right, dx: -2mm, dy: 2mm, text(6pt, gray)[#entry.id])
  #align(center + horizon)[
    #image(entry.qr, width: 48mm) // QR PNG path from data/qr/
  ]
]

// --- Back cell: YEAR emphasized, then artist, then title ---
#let back-cell(entry) = box(
  width: card-size, height: card-size, stroke: 0.2pt + gray,
)[
  #align(center + horizon)[
    #text(28pt, weight: "bold")[#entry.year]
    #v(3mm)
    #text(11pt, weight: "medium")[#entry.artist]
    #v(1mm)
    #text(9pt, style: "italic")[#entry.title]
  ]
]

// Render a sheet of up to cols*rows cells. `mirror` reverses column order for backs.
#let sheet(cells, cellfn, mirror: false) = {
  let out = ()
  for r in range(rows) {
    let row = ()
    for c in range(cols) {
      let cc = if mirror { cols - 1 - c } else { c }
      let idx = r * cols + cc
      row.push(if idx < cells.len() { cellfn(cells.at(idx)) } else { box(width: card-size, height: card-size) })
    }
    out.push(row)
  }
  grid(columns: (card-size,) * cols, rows: (card-size,) * rows, ..out.flatten())
}

// CARDS placeholder — replaced by 05_render.mjs with real entries.
#let cards = () // ((id: 1, year: "1985", artist: "...", title: "...", qr: "data/qr/1.png"), ...)

// Emit fronts then backs, page by page, 12 per page.
#let per-page = cols * rows
#let pages = calc.ceil(cards.len() / per-page)
#for p in range(pages) {
  let chunk = cards.slice(p * per-page, calc.min((p + 1) * per-page, cards.len()))
  sheet(chunk, front-cell, mirror: false)
  pagebreak(weak: true)
  sheet(chunk, back-cell, mirror: true)
  if p < pages - 1 { pagebreak(weak: true) }
}
