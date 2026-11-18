const CACHE_NAME = 'sellora-v57';
const APP_SHELL = ['./', './index.html', './css/style.css', './js/api.js', './js/app.js', './manifest.json', './icons/favicon-192.png?v=20261029-4', './icons/favicon-512.png?v=20261029-4', './icons/favicon-512-maskable.png?v=20261029-4', './icons/apple-touch-icon.png?v=20261029-4'];
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});
self.addEventListener('message', (event) => { if (event.data?.type === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('activate', (event) => event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // Les données et l'authentification doivent toujours venir du serveur.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;
  event.respondWith(fetch(event.request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
    }
    return response;
  }).catch(() => caches.match(event.request)));
});
