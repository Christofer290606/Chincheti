const CACHE_NAME = 'almacen-pwa-v1';
const assetsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/cettcenlog-192x192.png',
  '/icons/cettcenlog-512x512.png'
];

self.addEventListener('install', (event) => {
  // RQNF33.4: Asegurar instalación rápida
  self.skipWaiting(); 
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(assetsToCache);
    })
  );
});

// Limpiar cachés antiguas para no superar límites de almacenamiento
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});