// AI925 service worker
// - Pages: network first, so a new release reaches phones on the next open (cached page only when offline)
// - Hashed build files (/assets/*) and icons: cache first; they never change under the same name
// - API answers and uploaded files: never cached on the device, so customer, order and user data cannot be
//   read back from the browser cache by the next person using the phone
const CACHE_NAME = 'ai925-shell-v8';
const SHELL = ['/', '/manifest.json', '/logo.png', '/oraani-logo.png', '/oraani-logo.svg', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png', '/icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

// Removes every older cache, including the old one that held API answers
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isStaticAsset = (url) =>
  url.pathname.startsWith('/assets/') || /^\/(logo|oraani-logo|oraani-logo@2x|icon-192|icon-512|apple-touch-icon)\.(png|svg|jpg)$|^\/icon\.svg$|^\/manifest\.json$/.test(url.pathname);

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Private data: straight to the network
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put('/', copy));
          }
          return response;
        })
        .catch(() => caches.match('/'))
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      }))
    );
  }
});
