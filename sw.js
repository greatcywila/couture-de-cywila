/**
 * Service Worker: sw.js
 * Progressive Web App (PWA) Engine for Couture dé Cywila
 */

const CACHE_NAME = 'couture-cywila-v1';
const PRECACHE_ASSETS = [
    '/',
    '/style.css',
    '/manifest.json',
    '/images/icon-192.svg',
    '/images/icon-512.svg'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Bypass API and functions completely
    if (url.pathname.startsWith('/api') || url.pathname.startsWith('/.netlify')) {
        return;
    }

    // Network-first strategy for dynamic pages, cache fallback
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200 && event.request.method === 'GET') {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});
