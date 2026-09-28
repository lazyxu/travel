const VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
const CACHE = `travel-shell-${VERSION}`;
const SHELL = [
  '/',
  '/app.css',
  '/app-core.js',
  '/app-extra.js',
  '/app-render.js',
  '/app-forms.js',
  '/app-item-editor.js',
  '/manifest.webmanifest',
  '/icons/icon-192.svg',
  '/icons/icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)));
});

self.addEventListener('message', event => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(request.mode === 'navigate' ? '/' : request, copy));
        }
        return response;
      })
      .catch(() => request.mode === 'navigate' ? caches.match('/') : caches.match(request))
  );
});
