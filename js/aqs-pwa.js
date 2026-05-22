/* XZILY AI Studio — PWA Install (sidebar button + modal + banner) */
(function () {
    'use strict';

    var deferredPrompt = null;
    var isIOS          = /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
    var isInStandalone = ('standalone' in navigator && navigator.standalone) ||
                         window.matchMedia('(display-mode: standalone)').matches;

    /* ── Register service worker ── */
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function () {
            var cfg     = window.DTS_CONFIG || {};
            var swUrl   = (cfg.sw_url   && cfg.sw_url.length)   ? cfg.sw_url   : '/aqs-sw.js';
            var swScope = (cfg.sw_scope && cfg.sw_scope.length) ? cfg.sw_scope : '/';
            navigator.serviceWorker.register(swUrl, { scope: swScope })
                .then(function (reg) { console.log('[XZILY PWA] SW registered:', reg.scope); })
                .catch(function (err) { console.warn('[XZILY PWA] SW error:', err); });
        });
    }

    /* ── Build the install modal once ── */
    function buildModal() {
        if (document.getElementById('aqs-pwa-modal-overlay')) return;

        var isChromeMobile = /android/i.test(navigator.userAgent) && /chrome/i.test(navigator.userAgent);
        var isEdge         = /edg/i.test(navigator.userAgent);
        var isSamsungBrowser = /samsungbrowser/i.test(navigator.userAgent);
        var isFirefox      = /firefox/i.test(navigator.userAgent);

        var overlay = document.createElement('div');
        overlay.id  = 'aqs-pwa-modal-overlay';
        overlay.innerHTML =
            '<div id="aqs-pwa-modal">' +
                '<button class="aqs-pwa-modal-close" id="aqs-pwa-modal-close-btn" aria-label="Close">✕</button>' +
                '<div class="aqs-pwa-modal-head">' +
                    '<div class="aqs-pwa-modal-icon">⬡</div>' +
                    '<div>' +
                        '<div class="aqs-pwa-modal-title">Install XZILY AI</div>' +
                        '<div class="aqs-pwa-modal-sub">Add to your home screen — works offline</div>' +
                    '</div>' +
                '</div>' +

                /* Tab bar */
                '<div class="aqs-pwa-modal-tabs">' +
                    '<button class="aqs-pwa-modal-tab active" data-tab="android">Android / PC</button>' +
                    '<button class="aqs-pwa-modal-tab" data-tab="ios">iPhone / iPad</button>' +
                '</div>' +

                /* Android / Desktop steps */
                '<div class="aqs-pwa-modal-steps active" id="aqs-pwa-steps-android">' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">1</div>' +
                        '<div class="aqs-pwa-step-text">Open this page in <strong>Chrome</strong>, <strong>Edge</strong>, or <strong>Samsung Browser</strong></div>' +
                    '</div>' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">2</div>' +
                        '<div class="aqs-pwa-step-text">Tap the browser menu <strong>⋮</strong> (top-right)</div>' +
                    '</div>' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">3</div>' +
                        '<div class="aqs-pwa-step-text">Tap <strong>"Add to Home Screen"</strong> or <strong>"Install App"</strong></div>' +
                    '</div>' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">4</div>' +
                        '<div class="aqs-pwa-step-text">Tap <strong>Install</strong> to confirm — the app icon will appear on your home screen</div>' +
                    '</div>' +
                '</div>' +

                /* iOS steps */
                '<div class="aqs-pwa-modal-steps" id="aqs-pwa-steps-ios">' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">1</div>' +
                        '<div class="aqs-pwa-step-text">Open this page in <strong>Safari</strong> (required on iPhone/iPad)</div>' +
                    '</div>' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">2</div>' +
                        '<div class="aqs-pwa-step-text">Tap the <strong>Share</strong> button <span class="aqs-pwa-share-icon"></span> at the bottom of the screen</div>' +
                    '</div>' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">3</div>' +
                        '<div class="aqs-pwa-step-text">Scroll down and tap <strong>"Add to Home Screen"</strong></div>' +
                    '</div>' +
                    '<div class="aqs-pwa-modal-step">' +
                        '<div class="aqs-pwa-step-num">4</div>' +
                        '<div class="aqs-pwa-step-text">Tap <strong>Add</strong> — the app icon appears on your home screen instantly</div>' +
                    '</div>' +
                '</div>' +

                /* Native prompt button — shown when browser supports direct install */
                '<button id="aqs-pwa-modal-native-btn">⬇ Install Now</button>' +
            '</div>';

        document.body.appendChild(overlay);

        /* Pre-select correct tab based on detected browser */
        if (isIOS) {
            switchTab('ios');
        }

        /* Tab click */
        overlay.addEventListener('click', function (e) {
            var tab = e.target.closest('.aqs-pwa-modal-tab');
            if (tab) switchTab(tab.dataset.tab);

            if (e.target.id === 'aqs-pwa-modal-close-btn') closeModal();
            if (e.target === overlay) closeModal();

            if (e.target.id === 'aqs-pwa-modal-native-btn') {
                if (deferredPrompt) {
                    closeModal();
                    deferredPrompt.prompt();
                    deferredPrompt.userChoice.then(function (r) {
                        if (r.outcome === 'accepted') markInstalled();
                        deferredPrompt = null;
                    });
                }
            }
        });
    }

    function switchTab(name) {
        var tabs  = document.querySelectorAll('.aqs-pwa-modal-tab');
        var steps = document.querySelectorAll('.aqs-pwa-modal-steps');
        tabs.forEach(function(t)  { t.classList.toggle('active', t.dataset.tab === name); });
        steps.forEach(function(s) { s.classList.toggle('active', s.id === 'aqs-pwa-steps-' + name); });
    }

    function openModal() {
        buildModal();
        var overlay = document.getElementById('aqs-pwa-modal-overlay');
        if (overlay) overlay.classList.add('open');

        /* Show native install button if prompt is ready */
        var nb = document.getElementById('aqs-pwa-modal-native-btn');
        if (nb) nb.style.display = deferredPrompt ? 'block' : 'none';
    }

    function closeModal() {
        var overlay = document.getElementById('aqs-pwa-modal-overlay');
        if (overlay) overlay.classList.remove('open');
    }

    /* ── Mark as installed ── */
    function markInstalled() {
        var btn = document.getElementById('aqs-pwa-nav-btn');
        if (btn) {
            btn.classList.add('aqs-pwa-installed');
            var label = btn.querySelector('.aqs-pwa-nav-label');
            var icon  = btn.querySelector('.aqs-pwa-nav-icon');
            if (label) label.textContent = 'App Installed ✓';
            if (icon)  icon.textContent  = '✅';
        }
        hideBanner();
        closeModal();
    }

    /* ── Bottom banner helpers ── */
    function hideBanner() {
        var b = document.getElementById('aqs-pwa-banner');
        if (b) b.style.display = 'none';
        try { sessionStorage.setItem('aqs_pwa_dismissed', '1'); } catch (e) {}
    }

    /* ── Capture browser install prompt (Android/Chrome/Edge) ── */
    window.addEventListener('beforeinstallprompt', function (e) {
        e.preventDefault();
        deferredPrompt = e;
        /* Show bottom banner once per session */
        try { if (sessionStorage.getItem('aqs_pwa_dismissed')) return; } catch (ex) {}
        var b = document.getElementById('aqs-pwa-banner');
        if (b) b.style.display = 'flex';
    });

    /* ── Sidebar install button click ── */
    document.addEventListener('click', function (e) {
        if (!e.target) return;

        /* Sidebar nav button */
        var navBtn = e.target.closest && e.target.closest('#aqs-pwa-nav-btn');
        if (navBtn) {
            if (isInStandalone) return; /* already installed */
            if (deferredPrompt) {
                /* Android/Chrome: fire native prompt directly */
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function (r) {
                    if (r.outcome === 'accepted') markInstalled();
                    deferredPrompt = null;
                });
            } else {
                /* iOS or browser without native prompt: show step-by-step modal */
                openModal();
            }
            return;
        }

        /* Bottom banner install button */
        if (e.target.id === 'aqs-pwa-install-btn') {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(function (r) {
                    if (r.outcome === 'accepted') markInstalled();
                    deferredPrompt = null;
                    hideBanner();
                });
            }
            hideBanner();
            return;
        }

        /* Banner dismiss */
        if (e.target.id === 'aqs-pwa-dismiss-btn' || e.target.id === 'aqs-pwa-ios-dismiss') {
            hideBanner();
            var ib = document.getElementById('aqs-pwa-ios-banner');
            if (ib) ib.style.display = 'none';
        }
    });

    /* ── App installed event ── */
    window.addEventListener('appinstalled', function () {
        markInstalled();
        console.log('[XZILY PWA] App installed!');
    });

    /* ── DOM ready setup ── */
    document.addEventListener('DOMContentLoaded', function () {

        /* Already running as installed app */
        if (isInStandalone) {
            markInstalled();
            return;
        }

        /* iOS: update button label to hint at the tap action */
        if (isIOS) {
            var btn = document.getElementById('aqs-pwa-nav-btn');
            if (btn) {
                var label = btn.querySelector('.aqs-pwa-nav-label');
                if (label) label.textContent = 'Install on iPhone / iPad';
            }
            return;
        }

        /* After 3s, if no native prompt fired, update button label to "How to Install" */
        setTimeout(function () {
            if (!deferredPrompt && !isInStandalone) {
                var btn2 = document.getElementById('aqs-pwa-nav-btn');
                if (btn2 && !btn2.classList.contains('aqs-pwa-installed')) {
                    var label2 = btn2.querySelector('.aqs-pwa-nav-label');
                    if (label2 && label2.textContent === 'Install App') {
                        label2.textContent = 'How to Install';
                    }
                }
            }
        }, 3000);
    });

})();
