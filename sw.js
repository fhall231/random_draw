importScripts("items.js");

const CACHE = "random-draw-v4";
const FILES = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png","./items.js",
               "./img/snail.png","./img/smail.png","./img/eg1.png","./img/ms.svg","./img/equation.svg"       
              ];

self.addEventListener("install", e => {
  self.skipWaiting();  // don't wait for old tabs to close
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)));
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
