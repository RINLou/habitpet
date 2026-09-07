// sw.js — PWA 离线缓存。铁律：绝不能让用户在改版后还跑旧代码。
// 策略：/api/ 一律不拦（永远走网络）；页面入口 network-first；
// 静态资源靠 ?v=N 版本号天然失效，缓存只是离线兜底。
// ⚠️ 每次改版发布时：把 CACHE 和 ASSETS 里的 ?v= 同步升到 index.html 的新版本号！
const CACHE = 'hp-v12';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js?v=12',
  '/audio.js?v=12',
  '/style.css?v=12',
  '/anim/player.js?v=12',
  '/manifest.json',
  '/lib/species.umd.js?v=12',
  '/lib/localstore.js?v=12',
  '/lib/engine.umd.js?v=12',
  '/lib/battle.umd.js?v=12',
  '/lib/local.js?v=12',
  '/anim/firam/contract.json',
  '/anim/firam/idle/frame-0.png', '/anim/firam/idle/frame-1.png', '/anim/firam/idle/frame-2.png', '/anim/firam/idle/frame-3.png',
  '/anim/firam/happy/frame-0.png', '/anim/firam/happy/frame-1.png', '/anim/firam/happy/frame-2.png', '/anim/firam/happy/frame-3.png',
  '/anim/firam/eat/frame-0.png', '/anim/firam/eat/frame-1.png', '/anim/firam/eat/frame-2.png', '/anim/firam/eat/frame-3.png',
  '/anim/firam/tired/frame-0.png', '/anim/firam/tired/frame-1.png', '/anim/firam/tired/frame-2.png', '/anim/firam/tired/frame-3.png',
  '/anim/firam/levelUp/frame-0.png', '/anim/firam/levelUp/frame-1.png', '/anim/firam/levelUp/frame-2.png', '/anim/firam/levelUp/frame-3.png', '/anim/firam/levelUp/frame-4.png', '/anim/firam/levelUp/frame-5.png',
  '/img/icon-192.png',
  '/img/icon-512.png',
  '/img/wishball.webp'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.pathname.startsWith('/api/')) return; // API 永远走网络
  if (e.request.mode === 'navigate' || url.pathname === '/' || url.pathname.endsWith('/index.html')) {
    // 页面入口：网络优先，离线才用缓存
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // 其他静态资源：缓存优先 + 后台静默更新
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const fresh = fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => hit);
      return hit || fresh;
    })
  );
});
