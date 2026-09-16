const CACHE_NAME = 'train-cache-v1';

// Paths are relative to the location of this sw.js file
const ASSETS_TO_CACHE = [
   'index.html',
   'manifest.json',
   'TrainEngine.svg'
];

// 1. Install Event: Create the cache and inject the app shell files
self.addEventListener('install', (event) => {
   event.waitUntil(
      caches.open(CACHE_NAME).then((cache) => {
         console.log('Train PWA: Caching app assets');
         return cache.addAll(ASSETS_TO_CACHE);
      }).then(() => self.skipWaiting()) // Force the waiting service worker to become active immediately
   );
});

// 2. Activate Event: Clean up legacy caches from older versions
self.addEventListener('activate', (event) => {
   event.waitUntil(
      caches.keys().then((cacheNames) => {
         return Promise.all(
            cacheNames.map((cache) => {
               if (cache !== CACHE_NAME) {
                  console.log('Train PWA: Clearing old cache versions');
                  return caches.delete(cache);
               }
            })
         );
      }).then(() => self.clients.claim()) // Take control of open pages immediately
   );
});

// 3. Fetch Event: Intercept network requests (Cache-First strategy)
self.addEventListener('fetch', (event) => {
   // Only handle standard HTTP/HTTPS requests (ignores browser extensions)
   if (!event.request.url.startsWith(self.location.origin)) return;

   event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
         // If the file is in the cache, serve it instantly. Otherwise, fetch from network.
         return cachedResponse || fetch(event.request);
      })
   );
});
