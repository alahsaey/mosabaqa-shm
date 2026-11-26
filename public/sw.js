const CACHE_VERSION = 'abf-pwa-v4';

const NEVER_CACHE_PATTERNS = [
  /\/manifest\.(json|webmanifest)(\?.*)?$/i,
  /\/api\//i,
  /\/pwa-(192x192|512x512|maskable-512x512)\.png/i,
  /\/apple-touch-icon\.png/i,
  /\/favicon\.(ico|png|svg)/i,
  /[?&]v=\d+/i,
];

function shouldBypassCache(urlStr) {
  return NEVER_CACHE_PATTERNS.some((pattern) => pattern.test(urlStr));
}

async function purgeIconAndManifestCaches() {
  const keys = await caches.keys();
  await Promise.all(
    keys.map(async (key) => {
      const cache = await caches.open(key);
      const requests = await cache.keys();
      await Promise.all(
        requests.map((req) => {
          if (shouldBypassCache(req.url) || /\.(png|jpg|jpeg|webp|ico|svg)(\?|$)/i.test(req.url)) {
            return cache.delete(req);
          }
          return Promise.resolve(false);
        })
      );
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key)))
      )
      .then(() => purgeIconAndManifestCaches())
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'INVALIDATE_PWA_ICONS') {
    event.waitUntil(
      purgeIconAndManifestCaches().then(() => {
        if (self.registration && typeof self.registration.update === 'function') {
          return self.registration.update().catch(() => {});
        }
      })
    );
  } else if (data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = request.url;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;

  // Always fetch manifests, icons, cache-busted assets, and API routes fresh from network
  if (shouldBypassCache(url)) {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() => caches.match(request))
    );
    return;
  }

  // Only handle same-origin navigation/static requests with Network-First fallback
  if (new URL(url).origin !== self.location.origin) {
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response &&
          response.status === 200 &&
          response.type === 'basic' &&
          !shouldBypassCache(url)
        ) {
          const clone = response.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request))
  );
});
