const CACHE_STATIC_NAME = 'MusifyStar-static-v120';
const CACHE_DATA_NAME = 'MusifyStar-api-v120';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/verified_sections.json',
  '/logo.png',
  '/banner.png',
  '/app.js',
  '/player.js',
  '/fullplayer.js',
  '/miniplayer.js',
  '/home.js',
  '/library.js',
  '/liked.js',
  '/search.js',
  '/album.js',
  '/artist.js',
  '/profile.js',
  '/global-chat.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest'
];

// Install Event - Pre-cache Static Shell
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_STATIC_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets');
      return Promise.allSettled(
        STATIC_ASSETS.map((url) => {
          return fetch(url).then((res) => {
            if (res.status === 200 || res.type === 'opaque') {
              return cache.put(url, res);
            }
          }).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err);
          });
        })
      );
    })
  );
});

// Activate Event - Clean Up Old Caches & Claim Immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_STATIC_NAME && key !== CACHE_DATA_NAME) {
            console.log('[SW] Removing old cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Handle Offline & Caching
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Ignore non-GET requests or chrome-extension URLs
  if (request.method !== 'GET' || !url.protocol.startsWith('http')) {
    return;
  }

  // 1. Navigation requests and local JS scripts -> Network first, fallback to cached version
  const isScript = url.pathname.endsWith('.js');
  const isNavigation = request.mode === 'navigate';

  if (isNavigation || isScript) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_STATIC_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (isNavigation) {
              return caches.match('/index.html') || caches.match('/');
            }
          });
        })
    );
    return;
  }

  // 2. API Routes
  if (url.pathname.startsWith('/api/')) {
    const actionParam = url.searchParams.get('action') || '';

    // 2a. Immutable Binary Image Endpoints (/api/borders?action=image&id=... or /api/avatars?action=image&id=...)
    // Match by EXACT URL (including query string) so different border IDs never collide with each other or with JSON list endpoints
    if (actionParam === 'image' || actionParam === 'raw_image') {
      event.respondWith(
        caches.match(request, { ignoreSearch: false }).then((cachedImg) => {
          if (cachedImg) return cachedImg;
          return fetch(request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const clone = networkResponse.clone();
              caches.open(CACHE_STATIC_NAME).then((cache) => {
                cache.put(request, clone);
              });
            }
            return networkResponse;
          });
        })
      );
      return;
    }

    // 2b. Dynamic JSON API Routes -> Network first (no-store), canonical cache key without timestamp (?t=) so stale counts never accumulate
    const cleanParams = new URLSearchParams(url.searchParams);
    cleanParams.delete('t');
    cleanParams.delete('_');
    const canonicalQuery = cleanParams.toString();
    const canonicalCacheKey = url.origin + url.pathname + (canonicalQuery ? '?' + canonicalQuery : '');

    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_DATA_NAME).then((cache) => {
              cache.put(canonicalCacheKey, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(canonicalCacheKey, { ignoreSearch: false }).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({ status: false, offline: true, message: 'Anda sedang offline (PWA Offline Mode)' }),
              { headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // 3. Other Static Assets (PNG, WebP, CSS, Manifest, CDN scripts) -> Cache first, fallback to network
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Fetch background update for cache freshness if online
        if (navigator.onLine) {
          fetch(request).then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              caches.open(CACHE_STATIC_NAME).then((cache) => {
                cache.put(request, networkResponse);
              });
            }
          }).catch(() => {});
        }
        return cachedResponse;
      }

      return fetch(request).then((networkResponse) => {
        if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_STATIC_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => {
        // If image fails offline, fallback to logo or placeholder
        if (request.headers.get('accept')?.includes('image')) {
          return caches.match('/logo.png');
        }
      });
    })
  );
});

// Message listener for instant updates & skipWaiting
self.addEventListener('message', (event) => {
  if (event.data) {
    if (event.data.type === 'SKIP_WAITING' || event.data === 'skipWaiting') {
      self.skipWaiting();
    }
  }
});
