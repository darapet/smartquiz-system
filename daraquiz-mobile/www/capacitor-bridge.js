/**
 * DaraSmart — Capacitor Bridge v3
 * Handles: back button, network banner, splash, mic permission, audio unlock
 *
 * PERMISSION FIX NOTES:
 * – RECORD_AUDIO must be declared in AndroidManifest.xml (see android-config/).
 * – getUserMedia() is the correct API to trigger Android's runtime mic dialog.
 * – We request mic on the FIRST user touch (touchstart) — this is a user-gesture
 *   context so Android will show the permission dialog immediately.
 * – We also hook every known mic/voice button so tapping them re-triggers the
 *   request if it was somehow missed.
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

  /* ══════════════════════════════════════════════════════════════
     MICROPHONE PERMISSION
     getUserMedia({ audio:true }) is how Android Capacitor WebView
     triggers the runtime RECORD_AUDIO permission dialog.
     RECORD_AUDIO must also be declared in AndroidManifest.xml.
     We call this:
       1. On first touchstart (user-gesture → OS shows dialog)
       2. When any mic/voice button is tapped
       3. As an early DOMContentLoaded attempt (registers intent;
          on Android 12+ this alone may show the dialog)
  ══════════════════════════════════════════════════════════════ */
  var micRequested = false;
  var micGranted   = false;

  function requestMicPermission() {
    if (micGranted) return Promise.resolve(true);
    micRequested = true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve(false);
    }

    return navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        micGranted = true;
        window._aqsMicPermissionGranted = true;
        var b = document.getElementById('_aqsMicBanner');
        if (b) b.remove();
        return true;
      })
      .catch(function (err) {
        window._aqsMicPermissionGranted = false;
        /* Show a visible banner so the user knows how to fix it */
        if (document.getElementById('_aqsMicBanner')) return false;
        var appName = document.title || 'this app';
        var banner = document.createElement('div');
        banner.id = '_aqsMicBanner';
        banner.style.cssText =
          'position:fixed;bottom:0;left:0;right:0;z-index:99998;background:#c0392b;' +
          'color:#fff;padding:12px 14px;font-size:13px;font-family:sans-serif;' +
          'display:flex;align-items:center;justify-content:space-between;' +
          'box-shadow:0 -2px 8px rgba(0,0,0,.3)';
        banner.innerHTML =
          '<span>&#127908; Microphone blocked &mdash; go to ' +
          '<b>Settings &rsaquo; Apps &rsaquo; ' + appName +
          ' &rsaquo; Permissions</b> and allow Microphone, then tap Retry.</span>' +
          '<button id="_aqsMicRetry" style="margin-left:10px;background:#fff;color:#c0392b;' +
          'border:none;border-radius:6px;padding:6px 12px;font-size:12px;' +
          'font-weight:bold;cursor:pointer;flex-shrink:0">Retry</button>';
        document.body.appendChild(banner);
        document.getElementById('_aqsMicRetry').addEventListener('click', function () {
          micGranted = false;
          micRequested = false;
          var b2 = document.getElementById('_aqsMicBanner');
          if (b2) b2.remove();
          requestMicPermission();
        });
        return false;
      });
  }

  /* ── 1. Request on first touch (guaranteed user-gesture context) ── */
  document.addEventListener('touchstart', function () {
    if (!micGranted) requestMicPermission();
  }, { once: true });

  /* ── 2. Hook all known mic / voice buttons so tapping them
          always triggers the permission request first ── */
  var MIC_BTN_IDS = [
    'dts-voice-btn',       /* studio.html  — main voice button      */
    'dts-voice-toggle',    /* studio.html  — toggle listen button    */
    'std-voice-mic-btn',   /* study.html   — speak button            */
    'std-voice-btn',       /* study.html   — voice chat open button  */
    'std-voice-hdr-btn',   /* study.html   — header voice button     */
    'tts-speak-btn',       /* tts.html     — speak button            */
    'tts-generate-btn',    /* tts.html     — generate button         */
  ];

  document.addEventListener('DOMContentLoaded', function () {
    MIC_BTN_IDS.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', function () {
          if (!micGranted) requestMicPermission();
        }, true); /* capture phase so we run BEFORE the app's own handler */
      }
    });

    /* Also hook any element with class containing "voice" or "mic" */
    var selectors = [
      '.dts-voice-btn', '.std-voice-mic-btn', '.tts-speak-btn',
      '[data-action="mic"]', '[data-action="voice"]'
    ];
    selectors.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(function (el) {
          el.addEventListener('click', function () {
            if (!micGranted) requestMicPermission();
          }, true);
        });
      } catch (e) {}
    });

    /* ── 3. Early attempt on load — on many Android versions this
            alone is enough to show the dialog even without a gesture ── */
    setTimeout(function () {
      if (!micGranted) requestMicPermission();
    }, 1200);
  });

  /* Expose globally so pages can call it directly */
  window.AQSRequestMicPermission = requestMicPermission;
  window.AQSMicGranted = function () { return micGranted; };

  /* ══════════════════════════════════════════════════════════════
     AUDIO UNLOCK
     Android blocks AudioContext + <audio> playback until a user
     gesture occurs. We unlock both on the very first touchstart
     so TTS audio plays without a "play() failed" error.
  ══════════════════════════════════════════════════════════════ */
  var audioUnlocked = false;

  function _unlockAllAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;

    /* Unlock Web Audio API (AudioContext) */
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume().catch(function () {});
    } catch (e) {}

    /* Unlock <audio> element playback (needed by TTS page) */
    try {
      var sil = new Audio(
        'data:audio/wav;base64,' +
        'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      );
      sil.volume = 0;
      sil.play().catch(function () {});
    } catch (e2) {}

    window._aqsAudioUnlocked = true;
  }

  /* Unlock on first touch (same gesture as mic request) */
  document.addEventListener('touchstart', _unlockAllAudio, { once: true });

  /* Also unlock when TTS generate / speak buttons are tapped */
  document.addEventListener('DOMContentLoaded', function () {
    var ttsBtns = ['tts-generate-btn', 'tts-speak-btn', 'tts-play-btn'];
    ttsBtns.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', _unlockAllAudio, { once: true });
    });
  });

  window.AQSUnlockAudio = _unlockAllAudio;

  /* ── Expose platform info globally ── */
  window.AQSPlatform = { isNative: isCapacitor, platform: platform };

})();
