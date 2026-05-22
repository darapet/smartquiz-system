/* XZILY AI Studio — Service Worker */
var CACHE = 'xzily-v1';
var SHELL = [
    '/',
];

self.addEventListener('install', function(e) {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE).then(function(c) { return c.addAll(SHELL); }).catch(function(){})
    );
});

self.addEventListener('activate', function(e) {
    e.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(keys.filter(function(k){ return k !== CACHE; }).map(function(k){ return caches.delete(k); }));
        }).then(function(){ return self.clients.claim(); })
    );
});

self.addEventListener('fetch', function(e) {
    var req = e.request;
    /* Only handle GET; skip admin-ajax, wp-admin, non-http */
    if (req.method !== 'GET') return;
    var url = req.url;
    if (url.indexOf('admin-ajax.php') !== -1) return;
    if (url.indexOf('wp-admin') !== -1) return;
    if (url.indexOf('wp-login') !== -1) return;
    if (!url.startsWith('http')) return;

    /* Network-first for HTML pages (always fresh content) */
    var dest = req.destination;
    if (dest === 'document' || dest === '') {
        e.respondWith(
            fetch(req).catch(function() {
                return caches.match(req).then(function(r) {
                    return r || caches.match('/');
                });
            })
        );
        return;
    }

    /* Cache-first for static assets (CSS, JS, fonts, images) */
    e.respondWith(
        caches.match(req).then(function(cached) {
            if (cached) return cached;
            return fetch(req).then(function(resp) {
                if (!resp || resp.status !== 200 || resp.type === 'opaque') return resp;
                var clone = resp.clone();
                caches.open(CACHE).then(function(c) { c.put(req, clone); });
                return resp;
            });
        })
    );
});
