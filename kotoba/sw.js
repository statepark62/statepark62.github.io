/* ことば帖 Service Worker — © 2026 박상태 (Sangtae Park). All rights reserved.
 * 앱 껍데기(HTML·아이콘)는 캐시 우선, words.json은 네트워크 우선(오프라인 시 캐시).
 * index.html 등을 수정해 올릴 때는 아래 CACHE 버전을 v2, v3...으로 올려야 반영됩니다. */
const CACHE = 'kotoba-v2';
const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-B-48.png',
  './icon-B-180.png',
  './icon-B-192.png',
  './icon-B-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // 단어 데이터: 항상 최신을 시도하고, 실패(오프라인) 시 캐시 사용
  if (url.pathname.endsWith('/words.json')) {
    e.respondWith(
      fetch(e.request)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }

  // 나머지(앱 껍데기·폰트 등): 캐시 우선, 없으면 네트워크 후 캐시에 저장
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      if (res.ok && (url.origin === location.origin || url.hostname.includes('gstatic') || url.hostname.includes('googleapis'))) {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }))
  );
});
