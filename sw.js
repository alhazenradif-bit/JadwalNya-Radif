// Service Worker - JadwalNya Radif
const CACHE_NAME = 'jadwal-radif-v1';

// Daftar aset inti yang di-precache saat instalasi pertama kali
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap'
];

// Event Install: Caching core assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching static assets...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[SW] Beberapa aset gagal di-precache:', err);
      });
    })
  );
  // Aktifkan Service Worker baru segera tanpa menunggu tab lama ditutup
  self.skipWaiting();
});

// Event Activate: Pembersihan cache versi lama
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[SW] Menghapus cache lama:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => {
      console.log('[SW] Cache versi aktif:', CACHE_NAME);
      return self.clients.claim();
    })
  );
});

// Event Fetch: Strategi Caching Cerdas
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Jangan tangani permintaan selain metode GET
  if (request.method !== 'GET') return;

  // Lewati chrome-extension atau skema lain yang bukan HTTP/HTTPS
  if (!url.protocol.startsWith('http')) return;

  // 1. STRATEGI UNTUK ASET CDN EKSTERNAL (Tailwind CSS, Google Fonts, fonts.gstatic)
  // Network-First with Cache Fallback (agar mendapatkan update font/css jika ada, tapi jika offline langsung pakai cache)
  const isExternalCDN = url.origin.includes('cdn.tailwindcss.com') || 
                        url.origin.includes('fonts.googleapis.com') || 
                        url.origin.includes('fonts.gstatic.com');

  if (isExternalCDN) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Jika offline atau jaringan gagal, ambil dari cache
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response('', { status: 408, statusText: 'Request timed out / Offline' });
          });
        })
    );
    return;
  }

  // 2. STRATEGI UNTUK ASET LOKAL (index.html, manifest.json, ikon)
  // Cache-First with Network Fallback & Dynamic Caching
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        // Ambil update di background secara silent untuk refresh berikutnya
        fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, networkResponse);
            });
          }
        }).catch(() => {/* Offline, biarkan tetap pakai cache */});

        return cachedResponse;
      }

      // Jika belum ada di cache, fetch dari jaringan dan simpan ke cache
      return fetch(request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }

        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        });

        return networkResponse;
      }).catch(() => {
        // Fallback untuk navigasi halaman jika offline
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
