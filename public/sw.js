'use strict';

/* Service worker minimal : coquille hors ligne, API toujours en réseau. */
const CACHE = 'transit-shell-v4';
const SHELL = [
  '/',
  '/index.html',
  '/css/styles.css',
  '/js/api.js',
  '/js/ui.js',
  '/js/geo.js',
  '/js/app.js',
  '/data/cities.json',
  '/data/gazetteer.json',
  '/data/demo-content.json',
  '/img/icon.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  } catch (err) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw err;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(fetch(request));
    return;
  }
  const isShell =
    url.pathname === '/' ||
    url.pathname === '/index.html' ||
    url.pathname.startsWith('/js/') ||
    url.pathname.startsWith('/css/') ||
    url.pathname.endsWith('.webmanifest');
  if (isShell) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (url.pathname.startsWith('/img/') || url.pathname.startsWith('/uploads/')) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        });
      })
    );
    return;
  }
  event.respondWith(networkFirst(request));
});
