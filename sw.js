self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado exitosamente.');
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(clients.claim());
});

self.addEventListener('fetch', (e) => {
  // CRUCIAL: Ignorar peticiones a OneSignal o cualquier dominio externo para evitar bloqueos
  if (e.request.url.includes('onesignal.com') || !e.request.url.startsWith(self.location.origin)) {
    return;
  }

  // Manejo de red directo con respuesta de respaldo obligatoria para evitar el error de Response
  e.respondWith(
    fetch(e.request).catch(() => {
      console.log('Offline request fallido para:', e.request.url);
      return new Response('Conexión perdida o recurso no disponible offline.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
      });
    })
  );
});
