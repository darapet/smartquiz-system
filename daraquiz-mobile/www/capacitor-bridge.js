/**
 * DaraSmart — Capacitor Bridge v2
 * Handles: back button, network banner, splash, mic permission, audio unlock
 */
(function () {
  'use strict';

  var isCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  var platform    = isCapacitor ? (window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'web') : 'web';

  /* ── Platform class on body for CSS targeting ── */
  document.addEventListener('DOMContentLoaded', function () {
    document.body.classList.add('platform-' + platform);
    if (isCapacitor) document.body.classList.add('is-native');
  });

  /* ── Android back button ── */
  document.addEventListener('ionBackButton', function () { if (history.length > 1) history.back(); });

  if (isCapacitor && platform === 'android') {
    document.addEventListener('backbutton', function () {
      var href = window.location.href;
      var isHome = href.endsWith('index.html') || href.endsWith('/') || window.location.pathname === '/';
      if (isHome) {
        if (confirm('Exit DaraSmart?')) {
          if (window.Capacitor.Plugins && window.Capacitor.Plugins.App)
            window.Capacitor.Plugins.App.exitApp();
        }
      } else {
        history.back();
      }
    }, false);
  }

  /* ── Network banner ── */
  function showOfflineBanner(show) {
    var banner = document.getElementById('aqsOfflineBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'aqsOfflineBanner';
      banner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;text-align:center;padding:8px 16px;font-size:14px;font-family:sans-serif;display:none;box-shadow:0 2px 6px rgba(0,0,0,.3)';
      banner.textContent = '⚠ No internet connection';
      document.body.appendChild(banner);
    }
    banner.style.display = show ? 'block' : 'none';
    document.body.style.paddingTop = show ? '38px' : '';
  }
  window.addEventListener('offline', function () { showOfflineBanner(true); });
  window.addEventListener('online',  function () { showOfflineBanner(false); });
  if (!navigator.onLine) showOfflineBanner(true);

  if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Network) {
    var Net = window.Capacitor.Plugins.Network;
    Net.addListener('networkStatusChange', function (s) { showOfflineBanner(!s.connected); });
    Net.getStatus().then(function (s) { showOfflineBanner(!s.connected); }).catch(function () {});
  }

  /* ── Splash screen hide ── */
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.SplashScreen)
        window.Capacitor.Plugins.SplashScreen.hide({ fadeOutDuration: 500 });
    }, 600);
  });

  /* ── Microphone permission — request on first user interaction ──
     Android WebView requires the app to request RECORD_AUDIO before
     getUserMedia() can work. We request it proactively so mic is
     ready when Studio/Study/TTS needs it.                          */
  var micRequested = false;
  function requestMicPermission() {
    if (micRequested) return;
    micRequested = true;
    if (isCapacitor && platform === 'android') {
      /* Use native Permissions API if available */
      if (window.Capacitor.Plugins && window.Capacitor.Plugins.Permissions) {
        window.Capacitor.Plugins.Permissions.request({ permissions: ['microphone'] })
          .catch(function () {});
      }
    }
    /* Also request via Web API to ensure browser-level permission */
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          /* Got permission — immediately stop the stream, we just needed the grant */
          stream.getTracks().forEach(function (t) { t.stop(); });
          window._aqsMicPermissionGranted = true;
        })
        .catch(function (err) {
          console.warn('[DaraQuiz] Mic permission denied:', err.message);
          window._aqsMicPermissionGranted = false;
        });
    }
  }

  /* Request mic when user first touches the screen */
  document.addEventListener('touchstart', function onFirstTouch() {
    requestMicPermission();
    document.removeEventListener('touchstart', onFirstTouch);
  }, { once: true });

  /* Also expose for manual trigger (Studio/Study can call this) */
  window.AQSRequestMicPermission = requestMicPermission;

  /* ── Audio context unlock (Android autoplay policy fix) ──
     Android blocks audio until after a user gesture. We create
     and resume an AudioContext on first touch to unlock it.    */
  var audioUnlocked = false;
  document.addEventListener('touchstart', function unlockAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume().catch(function () {});
    } catch (e) {}
    document.removeEventListener('touchstart', unlockAudio);
  }, { once: true });

  /* ── Expose platform info globally ── */
  window.AQSPlatform = { isNative: isCapacitor, platform: platform };

})();
