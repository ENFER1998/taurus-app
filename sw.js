// Taurus Control - Service Worker PWA (Offline 100%)
const CACHE_NAME = 'taurus-cache-v4';

// NOTA PARA GITHUB PAGES / SUBDIRECTORIOS:
// Usamos rutas relativas (sin '/' inicial) para que funcionen tanto en https://dominio/taurus-app/ como en la raíz '/'
const urlsToCache = [
  './',
  'index.html',
  'test.html',
  'mobiletest.html',
  'pc.html',
  'taurusadmin.html',
  'taurusadminmobile.html',
  'taurus_control_corregido.html',
  'taurus_control_reparado.html',
  'manifest.json',
  'gemini-svg.png',
  'launchericon-48x48.png',
  'launchericon-72x72.png',
  'launchericon-96x96.png',
  'launchericon-144x144.png',
  'launchericon-192x192.png',
  'launchericon-512x512.png',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore-compat.js'
];

// 1. INSTALACIÓN RESILIENTE (Un 404 no anula el resto)
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[Taurus SW] Precachando archivos del sistema...');
      await Promise.allSettled(
        urlsToCache.map(async (url) => {
          try {
            await cache.add(url);
            console.log(`[Taurus SW] Guardado con éxito: ${url}`);
          } catch(err) {
            console.warn(`[Taurus SW] Omitiendo archivo no encontrado: ${url}`);
          }
        })
      );
    })
  );
});

// 2. ACTIVACIÓN Y PURGA DE VERSIONES ANTERIORES
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[Taurus SW] Limpiando caché anterior:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. INTERCEPTOR DE PETICIONES
self.addEventListener('fetch', (e) => {
  // Solo peticiones GET
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Ignorar protocolos no-http (ej: chrome-extension:)
  if (!url.protocol.startsWith('http')) return;

  // Ignorar OneSignal y APIs de Google / Firestore streaming
  if (
    url.hostname.includes('onesignal.com') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebaseinstallations.googleapis.com')
  ) {
    return;
  }

  // A. NAVEGACIÓN (Páginas HTML): Network First con Respaldo
  if (e.request.mode === 'navigate' || (e.request.headers.get('accept') && e.request.headers.get('accept').includes('text/html'))) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
          }
          return response;
        })
        .catch(async () => {
          console.log('[Taurus SW] Sin red, buscando pantalla en caché para:', e.request.url);
          const match = await caches.match(e.request, { ignoreSearch: true });
          if (match) return match;

          // Respaldo de navegación adaptable a cualquier ruta o subcarpeta
          const fallback = await caches.match('test.html') ||
                           await caches.match('taurus_control_reparado.html') ||
                           await caches.match('index.html') ||
                           await caches.match('./');
          return fallback;
        })
    );
    return;
  }

  // B. ACTIVOS ESTÁTICOS (JS, CSS, Imágenes, Librerías): Cache First con actualización en fondo
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        fetch(e.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
              const copy = networkResponse.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
            }
          })
          .catch(() => {});
        return cachedResponse;
      }

      return fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          return cachedResponse;
        });
    })
  );
});
