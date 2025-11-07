const CACHE_NAME = 'audio-notes-v1';
const urlsToCache = [
  '/',
  '/manifest.json',
];

// Install service worker and precache core assets
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Caching core assets');
      return cache.addAll(urlsToCache).catch((err) => {
        console.error('Failed to cache:', err);
      });
    })
  );
  self.skipWaiting();
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip API calls and only cache GET requests for static assets
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache successful responses
        if (response.status === 200) {
          const responseToCache = response.clone();
          
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        
        return response;
      })
      .catch(() => {
        // Fallback to cache if offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // For navigation requests, return cached index.html
          if (event.request.mode === 'navigate') {
            return caches.match('/');
          }
          return new Response('Offline - resource not cached', {
            status: 503,
            statusText: 'Service Unavailable'
          });
        });
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Background sync for offline recordings
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-recordings') {
    event.waitUntil(syncRecordings());
  }
});

async function syncRecordings() {
  // This will be called when the app comes back online
  console.log('Syncing recordings...');
  
  // Send message to client to trigger sync
  const clients = await self.clients.matchAll();
  clients.forEach((client) => {
    client.postMessage({
      type: 'SYNC_RECORDINGS',
    });
  });
}
