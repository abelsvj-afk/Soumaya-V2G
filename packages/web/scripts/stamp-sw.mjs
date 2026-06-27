/*
 * Post-build: stamp a unique build id into the service worker's CACHE name so
 * every deploy gets a new cache and the old one is evicted on activate. Without
 * this, an installed PWA can keep serving stale cached code after a deploy.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const swPath = resolve(process.cwd(), "dist", "sw.js");
if (!existsSync(swPath)) {
  console.warn("[stamp-sw] dist/sw.js not found — skipping (build may have failed)");
  process.exit(0);
}

// A short, monotonic id. (Date-based is enough — each build differs.)
const buildId = `b${Date.now().toString(36)}`;
const src = readFileSync(swPath, "utf8");
const out = src.replace(/__BUILD_ID__/g, buildId);
if (out === src) {
  console.warn("[stamp-sw] no __BUILD_ID__ placeholder found in sw.js — left unchanged");
} else {
  writeFileSync(swPath, out);
  console.log(`[stamp-sw] CACHE stamped → soumaya-${buildId}`);
}
