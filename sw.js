const CACHE_NAME = 'taurus-cache-v2';
const urlsToCache = [
  '/',
  '/index.html',
  '/mobiletest.html',
  '/pc.html',
  '/taurusadmin.html',
  '/taurusadminmobile.html',
  '/taurus_control_corregido.html',
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

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Caching app shell');
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  // Ignorar OneSignal y APIs de Google Scripts
  if (e.request.url.includes('onesignal.com') || e.request.url.includes('script.google.com')) {
    return;
  }

  // Network First, falling back to cache
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Guarda en cache si es una respuesta válida y no es de una extensión (ej. chrome-extension)
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        console.log('[Service Worker] Fetch falló, intentando desde caché:', e.request.url);
        return caches.match(e.request);
      })
  );
});
