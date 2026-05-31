/**
 * DaraSmart — Capacitor Bridge v4
 * Handles: back button, network banner, splash, mic permission, audio unlock
 *
 * PERMISSION FIX NOTES:
 * – RECORD_AUDIO must be declared in AndroidManifest.xml (see android-config/).
 * – getUserMedia() is the correct API to trigger Android's runtime mic dialog.
 * – SILENT vs EXPLICIT mode:
 *     Auto-calls (page load, first touch) are SILENT — they try silently and
 *     never show the red banner on failure. This prevents false "Mic blocked"
 *     banners when the user hasn't interacted with a mic feature yet.
 *     Explicit button taps call requestMicPermission(false) — banner shown only
 *     if the user actively tried to use the microphone.
 * – App-resume listener clears stale banners when user returns from Settings.
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

     KEY FIX: requestMicPermission(silent)
       silent=true  → try quietly; NEVER show the red banner on failure.
                      Used by auto-calls (page load, first touch) so that
                      pages without a mic feature don't show a false "blocked"
                      warning before the user has tapped anything mic-related.
       silent=false → show the red banner if denied. Used only when the user
                      explicitly taps a mic or voice button.

     App-resume listener: when the user returns from Android Settings after
     granting permission, we silently retry and dismiss any stale banner.
  ══════════════════════════════════════════════════════════════ */
  var micGranted   = false;

  function removeMicBanner() {
    var b = document.getElementById('_aqsMicBanner');
    if (b) b.remove();
  }

  function requestMicPermission(silent) {
    if (micGranted) { removeMicBanner(); return Promise.resolve(true); }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve(false);
    }

    return navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        micGranted = true;
        window._aqsMicPermissionGranted = true;
        removeMicBanner(); /* clear any stale banner immediately */
        return true;
      })
      .catch(function () {
        window._aqsMicPermissionGranted = false;

        /* SILENT MODE: don't show the banner — used for auto/background calls */
        if (silent) return false;

        /* EXPLICIT MODE: user tapped a mic button — show the actionable banner */
        if (document.getElementById('_aqsMicBanner')) return false;
        var appName = document.title || 'this app';
        var banner = document.createElement('div');
        banner.id = '_aqsMicBanner';
        banner.style.cssText =
          'position:fixed;bottom:0;left:0;right:0;z-index:99998;background:#c0392b;' +
          'color:#fff;padding:12px 14px;font-size:13px;font-family:sans-serif;' +
          'display:flex;align-items:center;gap:8px;' +
          'box-shadow:0 -2px 8px rgba(0,0,0,.3)';
        banner.innerHTML =
          '<span style="flex:1">&#127908; Microphone blocked &mdash; go to ' +
          '<b>Settings &rsaquo; Apps &rsaquo; ' + appName +
          ' &rsaquo; Permissions</b> and allow Microphone, then tap Retry.</span>' +
          '<button id="_aqsMicRetry" style="background:#fff;color:#c0392b;' +
          'border:none;border-radius:6px;padding:6px 12px;font-size:12px;' +
          'font-weight:bold;cursor:pointer;flex-shrink:0">Retry</button>' +
          '<button id="_aqsMicDismiss" style="background:rgba(255,255,255,.25);color:#fff;' +
          'border:none;border-radius:6px;padding:6px 10px;font-size:14px;' +
          'font-weight:bold;cursor:pointer;flex-shrink:0;line-height:1">&#x2715;</button>';
        document.body.appendChild(banner);

        document.getElementById('_aqsMicRetry').addEventListener('click', function () {
          removeMicBanner();
          micGranted = false;
          requestMicPermission(false); /* explicit retry — show banner again if still denied */
        });
        document.getElementById('_aqsMicDismiss').addEventListener('click', removeMicBanner);
        return false;
      });
  }

  /* ── 1. First touch: try silently (user gesture context, but not mic-intent) ── */
  document.addEventListener('touchstart', function () {
    if (!micGranted) requestMicPermission(true /* silent */);
  }, { once: true });

  /* ── 2. Hook all known mic / voice buttons — EXPLICIT mode (show banner if denied) ── */
  var MIC_BTN_IDS = [
    'dts-voice-btn',       /* studio.html  — main voice button      */
    'dts-voice-toggle',    /* studio.html  — toggle listen button    */
    'std-voice-mic-btn',   /* study.html   — speak button            */
    'std-voice-btn',       /* study.html   — voice chat open button  */
    'std-voice-hdr-btn',   /* study.html   — header voice button     */
    'std-summon-fab',      /* study.html   — summon AI FAB button    */
    'tts-speak-btn',       /* tts.html     — speak button            */
    'tts-generate-btn',    /* tts.html     — generate button         */
  ];

  document.addEventListener('DOMContentLoaded', function () {
    MIC_BTN_IDS.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) {
        btn.addEventListener('click', function () {
          if (!micGranted) requestMicPermission(false /* explicit — may show banner */);
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
            if (!micGranted) requestMicPermission(false /* explicit */);
          }, true);
        });
      } catch (e) {}
    });

    /* ── 3. Background attempt on load — SILENT so no false "blocked" banner.
            On many Android versions a previously-granted permission succeeds here
            even without a gesture, which lets us skip the first-touch check.   ── */
    setTimeout(function () {
      if (!micGranted) requestMicPermission(true /* silent */);
    }, 1200);
  });

  /* ── 4. App-resume listener: user may have gone to Settings and granted permission.
          When they come back, silently retry and dismiss any stale banner.        ── */
  if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appStateChange', function (state) {
      if (state.isActive && !micGranted) {
        requestMicPermission(true /* silent */).then(function (granted) {
          if (granted) removeMicBanner();
        });
      }
    });
  }

  /* Expose globally so pages can call it directly */
  window.AQSRequestMicPermission = function () { return requestMicPermission(false); };
  window.AQSMicGranted = function () { return micGranted; };

  /* ══════════════════════════════════════════════════════════════
     AUDIO UNLOCK
     Android blocks AudioContext + <audio> playback until a user
     gesture occurs. We unlock both on the very first touchstart
     so TTS audio plays without a "play() failed" error.

     KEY FIX: volume must be 0.001, NOT 0.
     Some Android WebViews skip the autoplay unlock entirely when
     volume=0, treating it as a non-audio event. 0.001 is inaudible
     but registers as real audio and triggers the unlock properly.
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

    /* Unlock <audio> element playback.
       volume=0.001 (not 0) — see note above. */
    try {
      var sil = new Audio(
        'data:audio/wav;base64,' +
        'UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA='
      );
      sil.volume = 0.001;
      sil.play().then(function () {
        sil.pause();
        sil.src = '';
        window._aqsAudioUnlocked = true;
      }).catch(function () {});
    } catch (e2) {}

    window._aqsAudioUnlocked = true;
  }

  /* Unlock on first touch (same gesture as mic request) */
  document.addEventListener('touchstart', _unlockAllAudio, { once: true });

  /* Also unlock when any audio-producing button is tapped */
  document.addEventListener('DOMContentLoaded', function () {
    var audioBtns = [
      'tts-generate-btn', 'tts-speak-btn', 'tts-play-btn',
      'std-summon-fab',   /* study.html — summon AI voice */
      'dts-voice-btn',    /* studio.html — main voice button */
    ];
    audioBtns.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', _unlockAllAudio, { once: true });
    });
  });

  window.AQSUnlockAudio = _unlockAllAudio;

  /* ── Expose platform info globally ── */
  window.AQSPlatform = { isNative: isCapacitor, platform: platform };

})();
