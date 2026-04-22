const CACHE_NAME = "alarm-radio-pwa-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./sw.js",
  "./icons/icon-192.png",
  "./icons/icon-512.png",

  "./icons/ui/play.png",
  "./icons/ui/pause.png",
  "./icons/ui/stop.png",
  "./icons/ui/snooze.png",
  "./icons/ui/alarm.png",
  "./icons/ui/radio.png",
  "./icons/ui/clock.png",
  "./icons/ui/volume.png",
  "./icons/ui/refresh.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) return cached;

      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (e) {
        // fallback to app shell
        return caches.match("./index.html");
      }
    })()
  );
});