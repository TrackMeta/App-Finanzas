// =============================================
// SERVICE WORKER – Coach Finanzas PWA
// =============================================

const CACHE_NAME = 'finanzas-v7';

const ASSETS = [
  '/App-Finanzas/',
  '/App-Finanzas/index.html',
  '/App-Finanzas/css/app.css',
  '/App-Finanzas/js/config.js',
  '/App-Finanzas/js/db.js',
  '/App-Finanzas/js/analytics.js',
  '/App-Finanzas/js/app.js',
  '/App-Finanzas/manifest.json',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  // CDNs → siempre red
  if (event.request.url.includes('cdn.jsdelivr')) {
    event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
    return;
  }
  // Assets locales → cache-first
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match('/App-Finanzas/index.html'));
    })
  );
});
