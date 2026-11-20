// Offline-first Service Worker v2 for Maicitos ERP
const RAW_CACHE_VERSION = '__CACHE_VERSION__';
const CACHE_NAME = RAW_CACHE_VERSION.startsWith('__')
  ? 'maicitos-erp-v2'
  : RAW_CACHE_VERSION;

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/corn-logo.svg'
  /*__PRECACHE_ASSETS__*/
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

function fetchWithTimeout(request, ms = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(request)
      .then((res) => {
        clearTimeout(timer);
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('/index.html', copy));
        }
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never intercept cross-origin requests or backend API routes
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // Navigation requests (SPA routes like /, /tablet, /oficina, /ruta, /admin, /pedido-rapido)
  // Network-First with 3s timeout so weak warehouse WiFi never blocks opening the app
  if (request.mode === 'navigate') {
    event.respondWith(
      fetchWithTimeout(request, 3000).catch(() =>
        caches.match('/index.html').then((res) => res || caches.match('/'))
      )
    );
    return;
  }

  // Hashed Vite assets under /assets/ -> Cache-First for instant offline startup
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Other same-origin static files -> Network-First with cache fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
