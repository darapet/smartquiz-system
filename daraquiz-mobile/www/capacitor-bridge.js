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
  /* ── FIX: Mic permission — getUserMedia triggers Android's native dialog ──
     Removed failing @capacitor/permissions call (plugin not installed).
     getUserMedia is the correct way to trigger Android mic permission dialog. */
  function requestMicPermission() {
    if (micRequested) return;
    micRequested = true;
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          stream.getTracks().forEach(function (t) { t.stop(); });
          window._aqsMicPermissionGranted = true;
          var b = document.getElementById('_aqsMicBanner');
          if (b) b.remove();
        })
        .catch(function () {
          window._aqsMicPermissionGranted = false;
          /* FIX: Show a visible banner when mic is blocked so user can fix it */
          if (document.getElementById('_aqsMicBanner')) return;
          var banner = document.createElement('div');
          banner.id = '_aqsMicBanner';
          banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:99998;background:#c0392b;' +
            'color:#fff;padding:12px 14px;font-size:13px;font-family:sans-serif;' +
            'display:flex;align-items:center;justify-content:space-between;box-shadow:0 -2px 8px rgba(0,0,0,.3)';
          banner.innerHTML = '<span>&#127908; Mic blocked &mdash; go to <b>Settings &rsaquo; Apps &rsaquo; ' +
            (document.title || 'App') + ' &rsaquo; Permissions</b> and allow Microphone</span>' +
            '<button id="_aqsMicRetry" style="margin-left:10px;background:#fff;color:#c0392b;' +
            'border:none;border-radius:6px;padding:5px 10px;font-size:12px;cursor:pointer">Retry</button>';
          document.body.appendChild(banner);
          document.getElementById('_aqsMicRetry').addEventListener('click', function () {
            micRequested = false; requestMicPermission();
          });
        });
    }
  }

  /* Request on first touch — triggers the Android permission dialog */
  document.addEventListener('touchstart', requestMicPermission, { once: true });

  /* Also try early on page load (for pages that auto-start voice) */
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () { if (!micRequested) requestMicPermission(); }, 1000);
  });

  window.AQSRequestMicPermission = requestMicPermission;

  /* ── FIX: Unlock ALL audio on first touch ──
     Must unlock BOTH AudioContext (Web Audio API) AND <audio> element
     because Android blocks them separately. TTS uses <audio> element.
     Both unlocks MUST happen inside the touchstart user-gesture context. */
  var audioUnlocked = false;
  function _unlockAllAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    /* Unlock AudioContext */
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(0);
      ctx.resume().catch(function () {});
    } catch (e) {}
    /* FIX: Unlock <audio> element playback with a silent audio clip */
    try {
      var sil = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
      sil.volume = 0;
      sil.play().catch(function () {});
    } catch (e2) {}
    window._aqsAudioUnlocked = true;
  }
  document.addEventListener('touchstart', _unlockAllAudio, { once: true });
  window.AQSUnlockAudio = _unlockAllAudio;

  /* ── Expose platform info globally ── */
  window.AQSPlatform = { isNative: isCapacitor, platform: platform };

})();
