// Service Worker with cache versioning and quick activation
// Update this version when deploying new changes (keep in sync with APP_CACHE_VERSION in cache.ts)
const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `app-cache-${CACHE_VERSION}`;

// Assets to cache on install
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.ico'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log(`[Service Worker] Installing version ${CACHE_VERSION}`);
  
  // Force the new service worker to activate immediately
  self.skipWaiting();
  
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching static assets');
      return cache.addAll(STATIC_ASSETS).catch(err => {
        console.warn('[Service Worker] Failed to cache some assets:', err);
        // Continue even if some assets fail to cache
        return Promise.resolve();
      });
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log(`[Service Worker] Activating version ${CACHE_VERSION}`);
  
  event.waitUntil(
    (async () => {
      // Clean up old caches
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith('app-cache-') && name !== CACHE_NAME)
          .map((name) => {
            console.log(`[Service Worker] Deleting old cache: ${name}`);
            return caches.delete(name);
          })
      );
      
      // Take control of all clients immediately
      await self.clients.claim();
      console.log('[Service Worker] Now controlling all clients');
    })()
  );
});

// Fetch event - network first, fallback to cache
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests
  if (event.request.method !== 'GET') {
    return;
  }
  
  // Skip API requests - always fetch fresh
  if (event.request.url.includes('/api/')) {
    return;
  }
  
  event.respondWith(
    (async () => {
      try {
        // Try network first
        const networkResponse = await fetch(event.request);
        
        // Cache successful responses
        if (networkResponse.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(event.request, networkResponse.clone());
        }
        
        return networkResponse;
      } catch (error) {
        // Network failed, try cache
        const cachedResponse = await caches.match(event.request);
        
        if (cachedResponse) {
          console.log('[Service Worker] Serving from cache:', event.request.url);
          return cachedResponse;
        }
        
        // If it's a navigation request, return the cached index.html
        if (event.request.mode === 'navigate') {
          const indexResponse = await caches.match('/index.html');
          if (indexResponse) {
            return indexResponse;
          }
        }
        
        throw error;
      }
    })()
  );
});

// Message event - handle update requests from client
self.addEventListener('message', (event) => {
  console.log('[Service Worker] Message received:', event.data);
  
  if (event.data && event.data.type === 'SKIP_WAITING') {
    console.log('[Service Worker] Skip waiting requested by client');
    self.skipWaiting();
  }
  
  if (event.data && event.data.type === 'CHECK_VERSION') {
    // Send current version back to client
    event.ports[0].postMessage({
      type: 'VERSION_INFO',
      version: CACHE_VERSION
    });
  }
  
  if (event.data && event.data.type === 'CLEAR_CACHE') {
    console.log('[Service Worker] Clear cache requested');
    caches.keys().then(cacheNames => {
      Promise.all(
        cacheNames.map(cacheName => caches.delete(cacheName))
      ).then(() => {
        event.ports[0].postMessage({
          type: 'CACHE_CLEARED',
          success: true
        });
      });
    });
  }
});

// Handle service worker updates
self.addEventListener('controllerchange', () => {
  console.log('[Service Worker] Controller changed, reloading page');
  window.location.reload();
});