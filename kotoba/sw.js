/* ことば帖 Service Worker — © 2026 박상태 (Sangtae Park). All rights reserved.
 *
 * index.html과 words.json은 네트워크 우선:
 * 서버에 새 파일이 있으면 즉시 사용하고, 오프라인일 때만 캐시를 사용합니다.
 *
 * 아이콘·manifest 등 정적 파일은 캐시 우선으로 처리합니다.
 *
 * 앱 파일을 크게 수정할 때는 CACHE 이름을
 * kotoba-v9, kotoba-v10처럼 변경하세요.
 */

const CACHE = 'kotoba-v8';

const SHELL = [
  './',
  './index.html',
  './manifest.json',
  './icon-B-48.png',
  './icon-B-180.png',
  './icon-B-192.png',
  './icon-B-512.png',
];

/* 설치 */
self.addEventListener('install', event => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

/* 이전 캐시 삭제 */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key !== CACHE)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

/* 네트워크 우선 함수 */
async function networkFirst(request) {
  const cache = await caches.open(CACHE);

  try {
    const response = await fetch(request, {
      cache: 'no-store'
    });

    if (response && response.ok) {
      await cache.put(request, response.clone());
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);

    if (cached) {
      return cached;
    }

    throw error;
  }
}

/* 캐시 우선 함수 */
async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);

  if (cached) {
    return cached;
  }

  const response = await fetch(request);

  if (response && response.ok) {
    await cache.put(request, response.clone());
  }

  return response;
}

/* 요청 처리 */
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') {
    return;
  }

  /*
   * HTML 페이지 이동 요청:
   * 항상 서버의 최신 index.html을 먼저 확인
   */
  if (
    request.mode === 'navigate' ||
    url.pathname.endsWith('/') ||
    url.pathname.endsWith('/index.html')
  ) {
    event.respondWith(
      networkFirst(request).catch(() => caches.match('./index.html'))
    );
    return;
  }

  /*
   * 단어 데이터:
   * 최신 데이터를 먼저 확인하고 오프라인 시 캐시 사용
   */
  if (url.pathname.endsWith('/words.json')) {
    event.respondWith(networkFirst(request));
    return;
  }

  /*
   * 같은 사이트의 정적 파일과 Google Fonts:
   * 캐시 우선
   */
  if (
    url.origin === self.location.origin ||
    url.hostname.includes('gstatic.com') ||
    url.hostname.includes('googleapis.com')
  ) {
    event.respondWith(cacheFirst(request));
  }
});
