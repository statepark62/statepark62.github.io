/* ============================================================
   Service Worker — 앱 셸은 캐시 우선, 문제 데이터는 네트워크 우선
   버전을 올리면(CACHE_NAME 변경) 새 배포분이 자동 반영됩니다.
   ============================================================ */

const CACHE_NAME = "hangeuksa-v3";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/style.css",
  "./js/app.js",
  "./js/db.js",
  "./icon-192.png",
  "./icon-512.png",
  "./apple-touch-icon.png",
  "./data/questions.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isDataRequest = url.pathname.endsWith(".json") && !url.pathname.endsWith("manifest.json");

  if (isDataRequest) {
    // 문제 데이터: 네트워크 우선, 실패 시 캐시(오프라인 대비)
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // 앱 셸: 캐시 우선, 없으면 네트워크
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
