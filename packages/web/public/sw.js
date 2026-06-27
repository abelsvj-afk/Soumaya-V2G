/*
 * Soumaya service worker — makes the app installable + resilient offline.
 *
 * Deliberately conservative so it can never serve stale/incorrect data:
 *  - /api/* is NEVER cached (always hits the network — it's per-brain, live data).
 *  - Navigations are network-first, falling back to the cached shell when offline.
 *  - Other same-origin GETs (JS/CSS/images/models/decoder) are cache-first with a
 *    background network fill, so the galaxy loads instantly and works offline.
 * CACHE is stamped with a unique build id at build time (scripts/stamp-sw.mjs),
 * so every deploy gets a fresh cache name and `activate` evicts the old one —
 * no installed PWA can keep serving a stale shell.
 */
const CACHE = "soumaya-__BUILD_ID__";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // let cross-origin pass through
  if (url.pathname.startsWith("/api/")) return; // never cache live brain data

  // App navigations: network-first so deploys show up; cached shell when offline.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || caches.match(req))),
    );
    return;
  }

  // Static assets: cache-first, fill the cache in the background.
  e.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
