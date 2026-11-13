const CACHE_STATIC_NAME = 'MusifyStar-static-v126';
const CACHE_DATA_NAME = 'MusifyStar-api-v126';
const CACHE_AUDIO_NAME = 'musifystar-audio-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/logo.png',
  '/banner.png',
  '/player.js',
  '/auth.js',
  '/home.js',
  '/search.js',
  '/liked.js',
  '/library.js',
  '/profile.js',
  '/miniplayer.js',
  '/fullplayer.js',
  '/artist.js',
  '/album.js',
  '/islamic-clock.js',
  '/global-chat.js',
  '/global-stats.js',
  '/admin-chat.js',
  '/dynamic-island.js',
  '/app.js',
  'https://cdn.tailwindcss.com',
  'https://unpkg.com/lucide@latest'
];

function fetchWithTimeout(req, timeoutMs) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return Promise.reject(new Error('Offline'));
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Network timeout')), timeoutMs || 2800);
    fetch(req).then((res) => {
      clearTimeout(timer);
      resolve(res);
    }).catch((err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

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

// Activate Event - Clean Up Old Caches (preserve offline audio cache) & Claim Immediately
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_STATIC_NAME && key !== CACHE_DATA_NAME && key !== CACHE_AUDIO_NAME) {
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

  // Never intercept sw.js itself to avoid update race conditions
  if (url.pathname === '/sw.js') {
    return;
  }

  // 0. Offline Audio Binary Cache (/offline-audio/<videoId>)
  if (url.pathname.startsWith('/offline-audio/')) {
    event.respondWith(
      caches.open(CACHE_AUDIO_NAME).then((cache) => {
        return cache.match(url.pathname, { ignoreSearch: true });
      }).then((cachedAudio) => {
        if (cachedAudio) return cachedAudio;
        return new Response('Offline audio not found', { status: 404 });
      })
    );
    return;
  }

  // 1. Navigation requests and local JS scripts -> Fast network first, fallback to cached version (ignoring ?v= query)
  const isScript = url.pathname.endsWith('.js');
  const isNavigation = request.mode === 'navigate';

  if (isNavigation || isScript) {
    event.respondWith(
      fetchWithTimeout(request, 2800)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            const responseForBase = networkResponse.clone();
            caches.open(CACHE_STATIC_NAME).then((cache) => {
              cache.put(request, responseToCache);
              if (isScript && url.search) {
                cache.put(url.pathname, responseForBase);
              }
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const exactMatch = await caches.match(request);
          if (exactMatch) return exactMatch;

          const cleanPathMatch = await caches.match(url.pathname, { ignoreSearch: true });
          if (cleanPathMatch) return cleanPathMatch;

          const ignoreSearchMatch = await caches.match(request, { ignoreSearch: true });
          if (ignoreSearchMatch) return ignoreSearchMatch;

          if (isNavigation) {
            const idxMatch = await caches.match('/index.html', { ignoreSearch: true });
            if (idxMatch) return idxMatch;
            const rootMatch = await caches.match('/', { ignoreSearch: true });
            if (rootMatch) return rootMatch;
          }
          return new Response('', { status: 503, statusText: 'Offline' });
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
