/* DaraQuiz AI — Capacitor Native Bridge
   Loaded on every page. Adds native-specific behaviour when running
   inside the Capacitor app (Android / iOS). Safe no-op in the browser.
   ------------------------------------------------------------------ */
(function () {
    'use strict';

    /* ── Detect environment ── */
    var isNative  = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
    var isAndroid = isNative && window.Capacitor.getPlatform() === 'android';
    var isIOS     = isNative && window.Capacitor.getPlatform() === 'ios';

    /* Expose globally so other scripts can branch */
    window.DARAQUIZ_NATIVE   = isNative;
    window.DARAQUIZ_ANDROID  = isAndroid;
    window.DARAQUIZ_IOS      = isIOS;

    if (!isNative) return; /* Browser: nothing else to do */

    /* ── 1. Import Capacitor plugins ── */
    var StatusBar, SplashScreen, Microphone;
    try {
        StatusBar   = Capacitor.Plugins.StatusBar;
        SplashScreen = Capacitor.Plugins.SplashScreen;
    } catch (e) {}

    /* ── 2. Configure status bar ── */
    if (StatusBar) {
        StatusBar.setStyle({ style: 'dark' }).catch(function () {});
        StatusBar.setBackgroundColor({ color: '#0d1b4b' }).catch(function () {});
    }

    /* ── 3. Hide Capacitor splash screen after DOM is ready ── */
    document.addEventListener('DOMContentLoaded', function () {
        if (SplashScreen) {
            setTimeout(function () {
                SplashScreen.hide({ fadeOutDuration: 500 }).catch(function () {});
            }, 3200); /* Matches aqs-splash.js duration */
        }
    });

    /* ── 4. Resume AudioContext on app foreground (Android power-save fix) ── */
    document.addEventListener('resume', function () {
        /* Resume any suspended AudioContexts when app returns from background */
        if (window._sharedBeepCtx && window._sharedBeepCtx.state === 'suspended') {
            window._sharedBeepCtx.resume().catch(function () {});
        }
        if (window._voiceAudioCtx && window._voiceAudioCtx.state === 'suspended') {
            window._voiceAudioCtx.resume().catch(function () {});
        }
    });

    /* ── 5. Handle hardware back button (Android) ── */
    document.addEventListener('backbutton', function (e) {
        e.preventDefault();
        /* Close any open modal first, then navigate back */
        var openModal = document.querySelector('.aqs-modal[style*="block"], .modal-overlay.open');
        if (openModal) {
            openModal.style.display = 'none';
            openModal.classList.remove('open');
            return;
        }
        /* If on login page, exit the app */
        if (window.location.pathname.indexOf('login') !== -1 ||
            window.location.pathname === '/' ||
            window.location.pathname === '/index.html') {
            if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
                window.Capacitor.Plugins.App.exitApp();
            }
        } else {
            window.history.back();
        }
    }, false);

    /* ── 6. Mic permission helper — request before getUserMedia on Android ── */
    window.daraquizRequestMic = function () {
        return new Promise(function (resolve, reject) {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
                reject(new Error('getUserMedia not supported'));
                return;
            }
            /* On Android, first check permission state */
            if (navigator.permissions && navigator.permissions.query) {
                navigator.permissions.query({ name: 'microphone' }).then(function (result) {
                    if (result.state === 'denied') {
                        reject(new Error('Microphone permission denied. Please enable it in Settings > Apps > DaraQuiz AI > Permissions.'));
                        return;
                    }
                    /* Granted or prompt — proceed */
                    navigator.mediaDevices.getUserMedia({
                        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                        video: false
                    }).then(resolve).catch(reject);
                }).catch(function () {
                    /* permissions.query not available — try directly */
                    navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(resolve).catch(reject);
                });
            } else {
                navigator.mediaDevices.getUserMedia({ audio: true, video: false }).then(resolve).catch(reject);
            }
        });
    };

    /* ── 7. Patch Google sign-in — redirect flow result handler ── */
    /* When signInWithRedirect completes, Firebase fires getRedirectResult on the
       NEXT page load. aqs-firebase.js already imports getRedirectResult, but we
       ensure the result is handled even before the module bootstraps fully. */
    document.addEventListener('DOMContentLoaded', function () {
        /* aqs-firebase.js will call getRedirectResult() itself via its init flow.
           We just ensure the page doesn't show a loading spinner forever. */
        var loadingOverlay = document.getElementById('aqs-loading') ||
                             document.getElementById('aqs-splash');
        if (loadingOverlay && isNative) {
            /* Give Firebase 8s to resolve redirect result before force-hiding the loader */
            setTimeout(function () {
                if (loadingOverlay && loadingOverlay.parentNode) {
                    loadingOverlay.style.opacity = '0';
                    setTimeout(function () {
                        if (loadingOverlay.parentNode) loadingOverlay.parentNode.removeChild(loadingOverlay);
                    }, 400);
                }
            }, 8000);
        }
    });

    /* ── 8. Viewport fix for iOS notch / safe areas ── */
    if (isIOS) {
        var meta = document.querySelector('meta[name="viewport"]');
        if (meta) {
            meta.content = 'width=device-width, initial-scale=1.0, viewport-fit=cover';
        }
        /* Inject safe-area CSS vars */
        var style = document.createElement('style');
        style.textContent =
            ':root{' +
            '--safe-top: env(safe-area-inset-top, 0px);' +
            '--safe-bottom: env(safe-area-inset-bottom, 0px);' +
            '--safe-left: env(safe-area-inset-left, 0px);' +
            '--safe-right: env(safe-area-inset-right, 0px);' +
            '}' +
            'body { padding-top: var(--safe-top); padding-bottom: var(--safe-bottom); }';
        document.head.appendChild(style);
    }

})();
