// 서비스 워커: 한 번 열어 두면 오프라인에서도 동작한다.
const CACHE = 'prayer-20261122-211532';
const ASSETS = ['./', './index.html', './prayers.js', './config.js', './manifest.webmanifest',
  './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // 시트 CSV 등 외부 요청은 건드리지 않음
  // 네트워크 우선, 실패하면 캐시 (데이터 갱신을 빨리 반영하기 위함)
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req).then(m => m || caches.match('./index.html')))
  );
});
