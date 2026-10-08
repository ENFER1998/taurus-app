// Taurus Control - Service Worker PWA (Offline 100%)
const CACHE_NAME = 'taurus-cache-v3';

const urlsToCache = [
  './',
  '/index.html',
  '/test.html',
  '/pc.html',
  '/taurusadmin.html',
  '/taurusadminmobile.html',
  '/taurus_control_corregido.html',
  '/taurus_control_reparado.html',
  '/manifest.json',
  '/gemini-svg.png',
  '/launchericon-48x48.png',
  '/launchericon-72x72.png',
  '/launchericon-96x96.png',
  '/launchericon-144x144.png',
  '/launchericon-192x192.png',
  '/launchericon-512x512.png',
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
      // Se agregan uno por uno para que si falta un archivo opcional, los demás se guarden
      await Promise.allSettled(
        urlsToCache.map(url => 
          cache.add(url).catch(err => console.warn(`[Taurus SW] Omitiendo archivo no encontrado: ${url}`))
        )
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
  // A. Solo cachear peticiones GET (evita errores con POST / PUT)
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // B. Ignorar extensiones de navegador y servicios de streaming / push
  if (!url.protocol.startsWith('http')) return;
  if (
    url.hostname.includes('onesignal.com') ||
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('firebaseinstallations.googleapis.com')
  ) {
    return;
  }

  // C. Estrategia para NAVEGACIÓN (Páginas HTML): Network First con Respaldo a cualquier HTML en caché
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
          // Buscar coincidencia exacta
          const match = await caches.match(e.request, { ignoreSearch: true });
          if (match) return match;

          // Si la ruta exacta no está, servir cualquier vista principal disponible en caché
          const fallback = await caches.match('./') || 
                           await caches.match('/index.html') || 
                           await caches.match('/taurus_control_reparado.html') ||
                           await caches.match('/taurus_control_corregido.html');
          return fallback;
        })
    );
    return;
  }

  // D. Estrategia para ACTIVOS ESTÁTICOS (JS, CSS, Imágenes, Librerías CDN): Cache First con actualización en fondo
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Si hay conexión, refrescar en segundo plano para la próxima vez
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

      // Si no estaba en caché, pedir a la red y almacenar
      return fetch(e.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(e.request, copy));
          }
          return networkResponse;
        })
        .catch(() => {
          // Si falló por completo y era una imagen, evitar romper la página
          return cachedResponse;
        });
    })
  );
});
