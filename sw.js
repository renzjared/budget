const CACHE_NAME = 'budget'; 
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './styles.css',
  './js/app.js',
  './js/state.js',
  './js/ledgers.js',
  './js/charts.js',
  './js/yield.js',
  './js/admin.js'
];

// Install Event: Cache our initial files
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Force the waiting service worker to become the active service worker
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Activate Event: Clean up old caches from previous versions
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch Event: NETWORK FIRST, fallback to CACHE
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        // If we get a valid response from the network, optionally update the cache here
        return networkResponse;
      })
      .catch(() => {
        // If the network fails (user is offline), serve from cache
        return caches.match(event.request);
      })
  );
});