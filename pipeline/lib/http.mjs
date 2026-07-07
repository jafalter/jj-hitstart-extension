// Shared HTTP fetch helper: disk-cached, browser-like headers, correct charset
// decoding (chart sites serve ISO-8859-1 despite fetch()'s text() assuming UTF-8).
import fs from "node:fs";
import path from "node:path";
import { ensureDir } from "./paths.mjs";

const DEFAULT_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  "Accept-Language": "de-DE,de;q=0.9,en;q=0.8",
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Fetches `url`, caching the decoded text at `cachePath` (skips the network
// entirely on a cache hit). Returns { ok, status, text, fromCache, error }
// instead of throwing, so callers can degrade gracefully per source.
export async function fetchCached(
  url,
  cachePath,
  { headers = {}, referer, timeoutMs = 20000, retries = 2, retryDelayMs = 1000, encoding = "utf-8" } = {},
) {
  if (cachePath && fs.existsSync(cachePath)) {
    return { ok: true, status: 200, text: fs.readFileSync(cachePath, "utf8"), fromCache: true };
  }
  const reqHeaders = { ...DEFAULT_HEADERS, ...headers };
  if (referer) reqHeaders.Referer = referer;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: reqHeaders, signal: controller.signal });
      const buf = await res.arrayBuffer();
      clearTimeout(timer);
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt < retries) await sleep(retryDelayMs);
        continue;
      }
      const text = new TextDecoder(encoding).decode(buf);
      if (cachePath) {
        ensureDir(path.dirname(cachePath));
        fs.writeFileSync(cachePath, text, "utf8");
      }
      return { ok: true, status: res.status, text, fromCache: false };
    } catch (e) {
      clearTimeout(timer);
      lastErr = e;
      if (attempt < retries) await sleep(retryDelayMs);
    }
  }
  return { ok: false, status: 0, text: "", error: lastErr, fromCache: false };
}

export async function fetchJSONCached(url, cachePath, opts) {
  const r = await fetchCached(url, cachePath, opts);
  if (!r.ok) return { ...r, json: null };
  try {
    return { ...r, json: JSON.parse(r.text) };
  } catch (e) {
    return { ...r, ok: false, error: e, json: null };
  }
}

export { sleep };
