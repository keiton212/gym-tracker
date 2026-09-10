const CACHE_NAME = 'gym-tracker-v40';
const urlsToCache = [
    './',
    './index.html',
    './voice-test.html',
    './css/voice-test.css',
    './js/ai-voice-config.js',
    './js/ai-voice-model.js',
    './js/ai-voice-db.js',
    './js/ai-voice-capture.js',
    './js/ai-voice-audio.js',
    './js/ai-voice-menu.js',
    './js/ai-voice-history.js',
    './js/ai-voice.js',
    './css/style.css',
    './js/storage.js',
    './js/utils.js',
    './js/milestones.js',
    './js/migration.js',
    './js/backup.js',
    './js/weather.js',
    './js/timer.js',
    './js/history.js',
    './js/tips.js',
    './js/menu.js',
    './js/lockscreen.js',
    './js/focus.js',
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
        fetch(event.request, { cache: 'no-store' })
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
