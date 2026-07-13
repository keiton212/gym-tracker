const CACHE_NAME = 'gym-tracker-v17';
const urlsToCache = [
    './',
    './index.html',
    './css/style.css',
    './js/storage.js',
    './js/utils.js',
    './js/milestones.js',
    './js/migration.js',
    './js/weather.js',
    './js/timer.js',
    './js/history.js',
    './js/tips.js',
    './js/menu.js',
    './js/main.js',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(urlsToCache);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// ネットワーク優先：オンライン時は常に最新版を取得し、オフライン時のみキャッシュを使う
self.addEventListener('fetch', event => {
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then(response => {
                if (response && response.status === 200 && response.type === 'basic') {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                return caches.match(event.request).then(cached => {
                    return cached || caches.match('./index.html');
                });
            })
    );
});
