// Spoiler guard: fail if staged files look like they contain plaintext song data.
// See PLAN.md §8. Run via `npm run guard` (wire into a pre-commit hook).
import { execSync } from "node:child_process";

function stagedFiles() {
  const out = execSync("git diff --cached --name-only", { encoding: "utf8" });
  return out.split("\n").map((s) => s.trim()).filter(Boolean);
}

const files = stagedFiles();
const offenders = [];

for (const f of files) {
  // Never allow anything under data/ to be staged.
  if (/^data\//.test(f)) {
    offenders.push(`${f} (spoiler zone — data/ must not be committed)`);
    continue;
  }
  if (f === ".env") offenders.push(`${f} (secret file)`);
}

if (offenders.length) {
  console.error("Spoiler guard BLOCKED commit. Offending staged files:");
  for (const o of offenders) console.error("  - " + o);
  process.exit(1);
}
console.log(`Spoiler guard OK (${files.length} staged file(s) checked).`);
