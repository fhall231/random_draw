importScripts("items.js");

const CACHE = "random-draw-v5";    // bumped, since the file changes
const CORE  = ["./", "./index.html", "./items.js", "./manifest.json", "./icon-192.png", "./icon-512.png"];
const FILES = [...CORE, ...DEFAULTS.photos.map(p => "./" + p)];

self.addEventListener("install", e => {
  self.skipWaiting();  // don't wait for old tabs to close
  e.waitUntil(
    caches.open(CACHE).then(c =>
      Promise.all(FILES.map(f => c.add(f).catch(() => {})))   // a missing file no longer breaks the install
    )
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())  // take over open pages right away
  );
});

self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    fetch(e.request, { cache: "no-cache" })       // always ask the server first
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));  // refresh the cache
        return res;
      })
      .catch(() => caches.match(e.request))       // offline: use the cache
  );
});
