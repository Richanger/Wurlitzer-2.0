// service-worker.js
const CACHE = 'jukebox-swiper-cache-v11';
const CORE = [
  './',
  './index.html',
  './app.js',
  './data.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  // Optional: keep if you want Swiper offline after first visit
  'https://unpkg.com/swiper@11/swiper-bundle.min.css',
  'https://unpkg.com/swiper@11/swiper-bundle.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE ? caches.delete(k) : Promise.resolve())))
  );
  self.clients.claim();
});

// Helpers
async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const resp = await fetch(req, { mode: 'cors' });
  cache.put(req, resp.clone());
  return resp;
}
async function networkFirst(req) {
  try {
    const resp = await fetch(req);
    const cache = await caches.open(CACHE);
    cache.put(req, resp.clone());
    return resp;
  } catch {
    const cached = await caches.match(req);
    return cached || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error());
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle http(s) requests and only from allowed origins
  const allowed = [self.location.origin, 'https://unpkg.com'];
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;      // ignore chrome-extension:, data:, etc.
  if (!allowed.includes(url.origin)) return;                               // ignore other cross-origins

  // Images from our origin: cache-first
  if (url.origin === self.location.origin && /\.(png|jpe?g|webp|gif|avif)$/i.test(url.pathname)) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // All other allowed assets: network-first with cache fallback
  event.respondWith(networkFirst(req));
});
