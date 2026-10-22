let taurusSesionActiva = true;

try {
  importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");
} catch (e) {}

const CACHE_NAME = 'taurus-track-pro-v29';

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
      return Promise.allSettled(STATIC_ASSETS.map((u) => cache.add(u).catch(() => {})));
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.accion === 'estado_sesion') {
    taurusSesionActiva = Boolean(event.data.activa);
  }
});

self.addEventListener('push', (event) => {
  if (!taurusSesionActiva) {
    event.stopImmediatePropagation();
    return;
  }
  if (!event.data) return;
  try {
    const data = event.data.json();
    if (data && data.custom && data.custom.i) return;
    const title = data.title || (data.headings && (data.headings.es || data.headings.en)) || 'Taurus Track Pro';
    const body = data.body || data.alert || (data.contents && (data.contents.es || data.contents.en)) || '';
    if (body) {
      event.waitUntil(
        self.registration.showNotification(title, {
          body: body,
          icon: 'gemini-svg.png',
          badge: 'gemini-svg.png',
          vibrate: [200, 100, 200]
        })
      );
    }
  } catch (err) {
    const text = event.data.text();
    if (text) {
      event.waitUntil(
        self.registration.showNotification('Taurus Track Pro', {
          body: text,
          icon: 'gemini-svg.png',
          badge: 'gemini-svg.png'
        })
      );
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
    })
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http://') && !event.request.url.startsWith('https://')) return;

  const url = new URL(event.request.url);

  if (
    url.origin.includes('firestore.googleapis.com') ||
    url.origin.includes('identitytoolkit.googleapis.com') ||
    url.origin.includes('securetoken.googleapis.com') ||
    url.origin.includes('onesignal.com') ||
    url.origin.includes('script.google.com') ||
    url.origin.includes('script.googleusercontent.com') ||
    url.pathname.includes('/channel') ||
    url.pathname.includes('/google.firestore.v1.')
  ) {
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      caches.match(event.request).then(async (cachedNav) => {
        const networkUpdate = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
              const responseClone = networkResponse.clone();
              caches.open(CACHE_NAME).then((cache) => {
                cache.put(event.request, responseClone);
              });
            }
            return networkResponse;
          })
          .catch(() => null);

        if (cachedNav) {
          return cachedNav;
        }
        const isPc = url.pathname.endsWith('pc.html');
        const fallbackCached = isPc
          ? ((await caches.match('pc.html')) || (await caches.match('index.html')) || (await caches.match('./')))
          : ((await caches.match('./')) || (await caches.match('index.html')) || (await caches.match('pc.html')));
        if (fallbackCached) {
          return fallbackCached;
        }
        const netResp = await networkUpdate;
        if (netResp) return netResp;
        return new Response('', { status: 503, statusText: 'Offline' });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
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
