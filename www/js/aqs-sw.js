/* DaraQuiz AI — Service Worker v2
   Firebase-ready. No WordPress rules. Supports offline for static shell.
   Updated by bug audit: removed wp-admin/ajax bypass rules (no longer relevant). */

var CACHE_NAME = 'daraquiz-v2';

/* Static shell to precache — core UI files */
var PRECACHE = [
    './',
    './index.html',
    './login.html',
    './register.html',
    './css/style.css',
    './img/icon-192.png',
    './img/icon-512.png'
];

/* ── Install: precache the shell ── */
self.addEventListener('install', function (e) {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME)
            .then(function (cache) { return cache.addAll(PRECACHE); })
            .catch(function () { /* Precache failure is non-fatal */ })
    );
});

/* ── Activate: clean up old caches ── */
self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(
                keys.filter(function (k) { return k !== CACHE_NAME; })
                    .map(function (k) { return caches.delete(k); })
            );
        }).then(function () { return self.clients.claim(); })
    );
});

/* ── Fetch: network-first for HTML & Firebase, cache-first for static assets ── */
self.addEventListener('fetch', function (e) {
    var req = e.request;
    if (req.method !== 'GET') return;

    var url = req.url;
    if (!url.startsWith('http')) return;

    /* Always go network-first for Firebase, API, and CDN calls — never cache these */
    var networkOnly = [
        'firebaseio.com', 'firebaseapp.com', 'googleapis.com',
        'pollinations.ai', 'groq.com', 'accounts.google.com',
        'identitytoolkit', 'securetoken'
    ];
    if (networkOnly.some(function (d) { return url.indexOf(d) !== -1; })) return;

    /* Network-first for HTML pages — always try to get fresh content */
    if (req.destination === 'document' || req.destination === '') {
        e.respondWith(
            fetch(req).catch(function () {
                return caches.match(req).then(function (r) {
                    return r || caches.match('./index.html');
                });
            })
        );
        return;
    }

    /* Cache-first for static assets (CSS, JS, fonts, images) */
    e.respondWith(
        caches.match(req).then(function (cached) {
            if (cached) return cached;
            return fetch(req).then(function (resp) {
                if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
                var clone = resp.clone();
                caches.open(CACHE_NAME).then(function (c) { c.put(req, clone); });
                return resp;
            }).catch(function () { return cached || new Response('', { status: 503 }); });
        })
    );
});
