self.addEventListener('install', (e) => {
  console.log('[Service Worker] Instalado exitosamente.');
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // Manejo de red directo, ideal para que siempre baje tu última versión
  e.respondWith(fetch(e.request).catch(() => console.log('Offline request fallido')));
});