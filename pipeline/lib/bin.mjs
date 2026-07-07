// Resolves an external CLI (yt-dlp, typst) that may not be on PATH yet within
// this process — e.g. right after a winget install, since PATH broadcasts
// don't reach already-running parent processes until they restart. Falls
// back to a bounded search under the winget package cache on Windows.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const execFileAsync = promisify(execFile);
const cache = new Map();

function findInWingetPackages(exeName) {
  const base = path.join(os.homedir(), "AppData", "Local", "Microsoft", "WinGet", "Packages");
  if (!fs.existsSync(base)) return null;
  const stack = [base];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.toLowerCase() === exeName.toLowerCase()) return full;
    }
  }
  return null;
}

// Returns the resolved command (name or absolute path) if the binary works,
// else null. Cached per name for the lifetime of the process.
export async function resolveBinary(name, { exeName = `${name}.exe`, versionFlag = "--version" } = {}) {
  if (cache.has(name)) return cache.get(name);
  try {
    await execFileAsync(name, [versionFlag], { timeout: 5000 });
    cache.set(name, name);
    return name;
  } catch {
    if (process.platform === "win32") {
      const found = findInWingetPackages(exeName);
      if (found) {
        try {
          await execFileAsync(found, [versionFlag], { timeout: 5000 });
          cache.set(name, found);
          return found;
        } catch {
          // fall through
        }
      }
    }
    cache.set(name, null);
    return null;
  }
}
