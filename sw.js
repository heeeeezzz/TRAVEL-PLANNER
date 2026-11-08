/* 홈 화면 앱용 서비스 워커
   - 앱 파일(같은 사이트)은 "최신 우선": 인터넷 되면 항상 새로 받고, 안 되면 저장해 둔 것으로 열기
   - 구글 지도·검색 등 외부 요청은 건드리지 않음 */
const CACHE = 'tp-v1';
const SHELL = ['./', 'index.html', 'style.css', 'js/core.js', 'js/maps.js', 'js/planner.js', 'js/home.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, {ignoreSearch:true}).then(r => r || caches.match('index.html')))
  );
});
