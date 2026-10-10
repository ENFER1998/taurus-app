/**
 * TAURUS CONTROL - SERVICE WORKER OFICIAL PWA (OFFLINE-FIRST)
 * Desarrollado por Fernando Rodriguez 2026
 */

const CACHE_NAME = 'taurus-control-v6';

const STATIC_ASSETS = [
  './',
  'index.html',
  'pc.html',
  'taurusadmin.html',
  'taurusadminmobile.html',
  'gemini-svg.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore-compat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Taurus SW] Precalentando caché offline con recursos estáticos...');
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('[Taurus SW] Advertencia al precachear algunos recursos:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('[Taurus SW] Purgando caché obsoleta:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Excluir solicitudes directas a APIs en vivo (OpenRouter, OneSignal, Firestore Live)
  if (
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('openrouter.ai') ||
    url.origin.includes('onesignal.com') ||
    url.pathname.includes('/channel')
  ) {
    return;
  }

  // Navegación HTML: Network-first con fallback a caché
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch(() => {
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) return cachedResponse;
          return caches.match('./') || caches.match('index test posible mejora.html');
        });
      })
    );
    return;
  }

  // Recursos estáticos y CDN: Cache-first con actualización en segundo plano
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // En segundo plano revalidar con la red si está disponible
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return networkResponse;
      }).catch((fetchErr) => {
        console.warn('[Taurus SW] Fallo de red offline para:', event.request.url);
      });
    })
  );
});

// Soporte de sincronización en segundo plano si el navegador lo admite
self.addEventListener('sync', (event) => {
  if (event.tag === 'taurus-sync-pendientes') {
    event.waitUntil(
      self.clients.matchAll().then((clients) => {
        clients.forEach((client) => {
          client.postMessage({ accion: 'sincronizar_pendientes' });
        });
      })
    );
  }
});
