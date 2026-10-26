// 오프라인 사용을 위한 서비스 워커: 앱 파일은 캐시 우선, 데이터가 바뀌면 VERSION을 올린다.
var VERSION = 'kj-v4';
var FILES = ['./', 'index.html', 'style.css', 'app.js', 'data.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png', 'favicon.ico', 'favicon-16.png', 'favicon-32.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (res) {
      if (res && res.ok && new URL(e.request.url).origin === location.origin) { var copy = res.clone(); caches.open(VERSION).then(function (c) { c.put(e.request, copy); }); }
      return res;
    }).catch(function () { return caches.match('index.html'); });
  }));
});
