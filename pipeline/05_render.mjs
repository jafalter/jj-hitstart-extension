// Stage 5 — Render duplex PDF via Typst. See PLAN.md §2 (Stage 5), §9.
// STATUS: STUB. Depends on Stage 4 output (resolved data/selection.json).
// Wiring notes:
//   - Generate one QR PNG per card (lib/qr.mjs) into data/qr/.
//   - Emit cards.typ from templates/card.typ with card rows (front QR / back meta).
//   - Run `typst compile cards.typ cards.pdf`.
console.log("[05_render] STUB — QR + Typst rendering not yet implemented.");
console.log("[05_render] Needs Stage 4 (resolved data/selection.json) and `typst` CLI.");
