/**
 * service-worker.js — My Finance PWA
 * ────────────────────────────────────
 * Strategiya: Network-first məlumat, Cache-first statik assets
 * Offline rejim: App shell həmişə açılır
 */

const CACHE_NAME    = 'myfinance-v8';
const CACHE_STATIC  = 'myfinance-static-v8';

// Əsas app shell — bunlar offline halda açılmalıdır
const APP_SHELL = [
  './index.html',
  './Dashboard.html',
  './InputPad.html',
  './settings.html',
  './Kreditler.html',
  './Transfer.html',
  './Budget_Forecasting_Dashboard.html',
  './sync.js',
  './supabase-config.js',
  './mf-supabase.js',
  './receipt.js',
  './db.js',
  './backup.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── Install: app shell-i önbellekləşdir ──────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(cache => {
      console.log('[SW] App shell önbelleklənir...');
      // Her faylı ayrıca əlavə et — biri uğursuz olsa digərləri qalıb işləsin
      return Promise.allSettled(
        APP_SHELL.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Cache miss:', url, err.message))
        )
      );
    }).then(() => {
      console.log('[SW] Install tamamlandı');
      return self.skipWaiting();
    })
  );
});

// ── Activate: köhnə cache-ləri sil ───────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== CACHE_STATIC)
            .map(k => {
              console.log('[SW] Köhnə cache silindi:', k);
              return caches.delete(k);
            })
      );
    }).then(() => self.clients.claim())
  );
});

// ── Fetch: Network-first, fallback to cache ───────────────────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Yalnız eyni origin-dən gələn GET sorğularını idarə et
  if (event.request.method !== 'GET') return;
  if (url.origin !== location.origin && !url.hostname.includes('fonts.googleapis')) return;

  event.respondWith(
    // Əvvəlcə network-dən yüklə
    fetch(event.request)
      .then(response => {
        if (!response || response.status !== 200) return response;

        // Uğurlu cavabı cache-ə yaz
        const toCache = response.clone();
        caches.open(CACHE_STATIC).then(cache => {
          cache.put(event.request, toCache);
        });

        return response;
      })
      .catch(() => {
        // Network yoxdur — cache-dən ver
        return caches.match(event.request).then(cached => {
          if (cached) return cached;
          // Cache-də də yoxdur — app shell-i qaytar (offline fallback)
          if (event.request.headers.get('Accept') && event.request.headers.get('Accept').includes('text/html')) {
            return caches.match('./index.html');
          }
          return new Response('Offline', { status: 503 });
        });
      })
  );
});
