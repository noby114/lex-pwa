// App-shell cache so the PWA still opens (and the already-loaded word data
// still works, since that lives in IndexedDB, not here) when there's no
// network -- e.g. offline, or the tunnel/PC scenario this whole rewrite was
// meant to get away from.

const CACHE_NAME = "lex-pwa-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/app.js",
  "./js/router.js",
  "./js/icons.js",
  "./js/components.js",
  "./js/db.js",
  "./js/sm2.js",
  "./js/dictionaryApi.js",
  "./js/tts.js",
  "./js/importExport.js",
  "./js/backup.js",
  "./js/screens/home.js",
  "./js/screens/addWord.js",
  "./js/screens/wordList.js",
  "./js/screens/wordDetail.js",
  "./js/screens/stats.js",
  "./js/screens/account.js",
  "./js/screens/studySession.js",
  "./data/toeicPresetWords.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Always go to the network for the dictionary API (fresh lookups only).
  if (url.hostname === "api.dictionaryapi.dev") return;

  // Network-first, falling back to the cache only when offline. We used to
  // do cache-first + background refresh ("stale-while-revalidate"), but
  // that meant every app-code update was invisible until a *second* reload
  // (the first reload got the stale cached copy while the fresh one loaded
  // in the background). Since this app is actively being updated and full
  // offline support is a nice-to-have rather than the main use case, always
  // prefer fresh network content when it's available.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && event.request.method === "GET") {
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
