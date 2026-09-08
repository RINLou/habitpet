// sw.js — PWA 离线缓存。铁律：绝不能让用户在改版后还跑旧代码。
// 策略：/api/ 一律不拦（永远走网络）；页面入口 network-first；
// 静态资源靠 ?v=N 版本号天然失效，缓存只是离线兜底。
// ⚠️ 每次改版发布时：把 CACHE 和 ASSETS 里的 ?v= 同步升到 index.html 的新版本号！
const CACHE = 'hp-v15';
const ASSETS = [
  '/',
  '/index.html',
  '/app.js?v=15',
  '/audio.js?v=15',
  '/style.css?v=15',
  '/anim/player.js?v=15',
  '/manifest.json',
  '/lib/species.umd.js?v=15',
  '/lib/localstore.js?v=15',
  '/lib/engine.umd.js?v=15',
  '/lib/battle.umd.js?v=15',
  '/lib/local.js?v=15',
  '/anim/firam/contract.json',
  '/anim/firam/idle/frame-0.png', '/anim/firam/idle/frame-1.png', '/anim/firam/idle/frame-2.png', '/anim/firam/idle/frame-3.png',
  '/anim/firam/happy/frame-0.png', '/anim/firam/happy/frame-1.png', '/anim/firam/happy/frame-2.png', '/anim/firam/happy/frame-3.png',
  '/anim/firam/eat/frame-0.png', '/anim/firam/eat/frame-1.png', '/anim/firam/eat/frame-2.png', '/anim/firam/eat/frame-3.png',
  '/anim/firam/tired/frame-0.png', '/anim/firam/tired/frame-1.png', '/anim/firam/tired/frame-2.png', '/anim/firam/tired/frame-3.png',
  '/anim/firam/levelUp/frame-0.png', '/anim/firam/levelUp/frame-1.png', '/anim/firam/levelUp/frame-2.png', '/anim/firam/levelUp/frame-3.png', '/anim/firam/levelUp/frame-4.png', '/anim/firam/levelUp/frame-5.png',
  '/anim/volt/contract.json',
  '/anim/volt/idle/frame-0.png', '/anim/volt/idle/frame-1.png', '/anim/volt/idle/frame-2.png', '/anim/volt/idle/frame-3.png',
  '/anim/volt/happy/frame-0.png', '/anim/volt/happy/frame-1.png', '/anim/volt/happy/frame-2.png', '/anim/volt/happy/frame-3.png',
  '/anim/volt/levelUp/frame-0.png', '/anim/volt/levelUp/frame-1.png', '/anim/volt/levelUp/frame-2.png', '/anim/volt/levelUp/frame-3.png', '/anim/volt/levelUp/frame-4.png', '/anim/volt/levelUp/frame-5.png',
  '/anim/volt/eat/frame-0.png', '/anim/volt/eat/frame-1.png', '/anim/volt/eat/frame-2.png', '/anim/volt/eat/frame-3.png',
  '/anim/volt/tired/frame-0.png', '/anim/volt/tired/frame-1.png', '/anim/volt/tired/frame-2.png', '/anim/volt/tired/frame-3.png',
  '/anim/tidal/contract.json',
  '/anim/tidal/idle/frame-0.png', '/anim/tidal/idle/frame-1.png', '/anim/tidal/idle/frame-2.png', '/anim/tidal/idle/frame-3.png',
  '/anim/tidal/happy/frame-0.png', '/anim/tidal/happy/frame-1.png', '/anim/tidal/happy/frame-2.png', '/anim/tidal/happy/frame-3.png',
  '/anim/tidal/levelUp/frame-0.png', '/anim/tidal/levelUp/frame-1.png', '/anim/tidal/levelUp/frame-2.png', '/anim/tidal/levelUp/frame-3.png', '/anim/tidal/levelUp/frame-4.png', '/anim/tidal/levelUp/frame-5.png',
  '/anim/tidal/eat/frame-0.png', '/anim/tidal/eat/frame-1.png', '/anim/tidal/eat/frame-2.png', '/anim/tidal/eat/frame-3.png',
  '/anim/tidal/tired/frame-0.png', '/anim/tidal/tired/frame-1.png', '/anim/tidal/tired/frame-2.png', '/anim/tidal/tired/frame-3.png',
  '/anim/night/contract.json',
  '/anim/night/idle/frame-0.png', '/anim/night/idle/frame-1.png', '/anim/night/idle/frame-2.png', '/anim/night/idle/frame-3.png',
  '/anim/night/happy/frame-0.png', '/anim/night/happy/frame-1.png', '/anim/night/happy/frame-2.png', '/anim/night/happy/frame-3.png',
  '/anim/night/levelUp/frame-0.png', '/anim/night/levelUp/frame-1.png', '/anim/night/levelUp/frame-2.png', '/anim/night/levelUp/frame-3.png', '/anim/night/levelUp/frame-4.png', '/anim/night/levelUp/frame-5.png',
  '/anim/night/eat/frame-0.png', '/anim/night/eat/frame-1.png', '/anim/night/eat/frame-2.png', '/anim/night/eat/frame-3.png',
  '/anim/night/tired/frame-0.png', '/anim/night/tired/frame-1.png', '/anim/night/tired/frame-2.png', '/anim/night/tired/frame-3.png',
  '/anim/luna/contract.json',
  '/anim/luna/idle/frame-0.png', '/anim/luna/idle/frame-1.png', '/anim/luna/idle/frame-2.png', '/anim/luna/idle/frame-3.png',
  '/anim/luna/happy/frame-0.png', '/anim/luna/happy/frame-1.png', '/anim/luna/happy/frame-2.png', '/anim/luna/happy/frame-3.png',
  '/anim/luna/levelUp/frame-0.png', '/anim/luna/levelUp/frame-1.png', '/anim/luna/levelUp/frame-2.png', '/anim/luna/levelUp/frame-3.png', '/anim/luna/levelUp/frame-4.png', '/anim/luna/levelUp/frame-5.png',
  '/anim/luna/eat/frame-0.png', '/anim/luna/eat/frame-1.png', '/anim/luna/eat/frame-2.png', '/anim/luna/eat/frame-3.png',
  '/anim/luna/tired/frame-0.png', '/anim/luna/tired/frame-1.png', '/anim/luna/tired/frame-2.png', '/anim/luna/tired/frame-3.png',
  '/anim/mount/contract.json',
  '/anim/mount/idle/frame-0.png', '/anim/mount/idle/frame-1.png', '/anim/mount/idle/frame-2.png', '/anim/mount/idle/frame-3.png',
  '/anim/mount/happy/frame-0.png', '/anim/mount/happy/frame-1.png', '/anim/mount/happy/frame-2.png', '/anim/mount/happy/frame-3.png',
  '/anim/mount/levelUp/frame-0.png', '/anim/mount/levelUp/frame-1.png', '/anim/mount/levelUp/frame-2.png', '/anim/mount/levelUp/frame-3.png', '/anim/mount/levelUp/frame-4.png', '/anim/mount/levelUp/frame-5.png',
  '/anim/mount/eat/frame-0.png', '/anim/mount/eat/frame-1.png', '/anim/mount/eat/frame-2.png', '/anim/mount/eat/frame-3.png',
  '/anim/mount/tired/frame-0.png', '/anim/mount/tired/frame-1.png', '/anim/mount/tired/frame-2.png', '/anim/mount/tired/frame-3.png',
  '/anim/thorn/contract.json',
  '/anim/thorn/idle/frame-0.png', '/anim/thorn/idle/frame-1.png', '/anim/thorn/idle/frame-2.png', '/anim/thorn/idle/frame-3.png',
  '/anim/thorn/happy/frame-0.png', '/anim/thorn/happy/frame-1.png', '/anim/thorn/happy/frame-2.png', '/anim/thorn/happy/frame-3.png',
  '/anim/thorn/levelUp/frame-0.png', '/anim/thorn/levelUp/frame-1.png', '/anim/thorn/levelUp/frame-2.png', '/anim/thorn/levelUp/frame-3.png', '/anim/thorn/levelUp/frame-4.png', '/anim/thorn/levelUp/frame-5.png',
  '/anim/thorn/eat/frame-0.png', '/anim/thorn/eat/frame-1.png', '/anim/thorn/eat/frame-2.png', '/anim/thorn/eat/frame-3.png',
  '/anim/thorn/tired/frame-0.png', '/anim/thorn/tired/frame-1.png', '/anim/thorn/tired/frame-2.png', '/anim/thorn/tired/frame-3.png',
  '/anim/rime/contract.json',
  '/anim/rime/idle/frame-0.png', '/anim/rime/idle/frame-1.png', '/anim/rime/idle/frame-2.png', '/anim/rime/idle/frame-3.png',
  '/anim/rime/happy/frame-0.png', '/anim/rime/happy/frame-1.png', '/anim/rime/happy/frame-2.png', '/anim/rime/happy/frame-3.png',
  '/anim/rime/levelUp/frame-0.png', '/anim/rime/levelUp/frame-1.png', '/anim/rime/levelUp/frame-2.png', '/anim/rime/levelUp/frame-3.png', '/anim/rime/levelUp/frame-4.png', '/anim/rime/levelUp/frame-5.png',
  '/anim/rime/eat/frame-0.png', '/anim/rime/eat/frame-1.png', '/anim/rime/eat/frame-2.png', '/anim/rime/eat/frame-3.png',
  '/anim/rime/tired/frame-0.png', '/anim/rime/tired/frame-1.png', '/anim/rime/tired/frame-2.png', '/anim/rime/tired/frame-3.png',
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
