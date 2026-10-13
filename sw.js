/**
 * TAURUS TRACK PRO - SERVICE WORKER OFICIAL PWA (OFFLINE-FIRST)
 * Desarrollado por Fernando Rodriguez 2026 - Versión Blindada v9
 */

const CACHE_NAME = 'taurus-track-pro-v9';

const STATIC_ASSETS = [
  './',
  'index.html',
  'pc.html',
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
  // 1. Filtrado riguroso de métodos y esquemas soportados
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  const url = new URL(event.request.url);

  // 2. Excluir explícitamente túneles de comunicación en vivo y APIs en streaming
  if (
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('openrouter.ai') ||
    url.origin.includes('onesignal.com') ||
    url.pathname.includes('/channel') ||
    url.pathname.includes('/google.firestore.v1.')
  ) {
    return;
  }

  // 3. Estrategia Network-First con fallback resiliente para navegación HTML
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = await caches.match(event.request);
          if (cached) return cached;
          return (await caches.match('./')) || (await caches.match('index.html')) || (await caches.match('pc.html'));
        })
    );
    return;
  }

  // 4. Estrategia Cache-First con actualización en segundo plano y respuesta de fallback segura
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Revalidar en segundo plano si hay red disponible
        fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, networkResponse);
            });
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const reqUrl = event.request.url || '';
          const isImage = event.request.destination === 'image' ||
                          /\.(png|jpg|jpeg|gif|svg|ico|webp)$/i.test(reqUrl) ||
                          reqUrl.includes('img.os-content.com');

          if (isImage) {
            const fallbackImg = await caches.match('gemini-svg.png');
            return fallbackImg || new Response('', { status: 404, statusText: 'Imagen no disponible offline' });
          }
          return new Response('', { status: 503, statusText: 'Recurso no disponible offline' });
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
