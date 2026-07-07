// Shared paths + small IO helpers. Everything under data/ is git-ignored (spoiler zone).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");
export const DATA = path.join(ROOT, "data");
export const EDITIONS = path.join(ROOT, "editions");
export const CONFIG = path.join(ROOT, "pipeline", "config");
export const TEMPLATES = path.join(ROOT, "templates");

export function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
  return p;
}

export function readJSON(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

export function writeJSON(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2));
  return p;
}

export function loadConfig(name) {
  return readJSON(path.join(CONFIG, name));
}
