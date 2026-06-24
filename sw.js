const CACHE_NAME = 'pdfiller2-cache-v4';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './index.css',
  './manifest.json',
  './icon.svg',
  './assets/sample_invoice.pdf',
  './js/app.js',
  './js/core/pdf_render.js',
  './js/core/text_parser.js',
  './js/modules/editor.js',
  './js/modules/fill_tools.js',
  './js/modules/signatures.js',
  './js/modules/export.js',
  './js/utils/gestures.js',
  // CDN Libraries for offline execution
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js',
  'https://cdn.jsdelivr.net/npm/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js',
  'https://cdn.jsdelivr.net/npm/interactjs/dist/interact.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Outfit:wght@400;500;600;700;800&family=Quicksand:wght@400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.css',
  'https://cdnjs.cloudflare.com/ajax/libs/cropperjs/1.6.1/cropper.min.js',
  // Fonts TTF for offline compilation
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/carlito/Carlito-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/dejavu-fonts/dejavu-fonts@version_2_37/resources/ttf/DejaVuSans.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/quicksand/Quicksand-Regular.ttf',
  'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/inter/static/Inter-Regular.ttf'
];

// Install Event
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching active assets');
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Removing old cache', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event (Network-First for local files, Cache-First for CDNs)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') {
    return;
  }

  const url = new URL(e.request.url);
  const isLocalAsset = url.origin === self.location.origin;

  if (isLocalAsset) {
    // Network-First for local app files (ensures updates are live immediately)
    e.respondWith(
      fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(e.request);
        })
    );
  } else {
    // Cache-First for static third-party CDNs (high performance, offline support)
    e.respondWith(
      caches.match(e.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }
        return fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(e.request, responseClone);
            });
          }
          return networkResponse;
        });
      })
    );
  }
});
