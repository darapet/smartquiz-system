/**
 * DaraSmart — Capacitor Bridge v5
 * Handles: back button, network banner, splash, mic permission, audio unlock,
 *          bottom navigation bar, speed/preconnect hints
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

  /* ── Speed: inject preconnect hints early so Firebase/Fonts load faster ── */
  (function injectPreconnects() {
    var hints = [
      'https://www.gstatic.com',
      'https://firestore.googleapis.com',
      'https://firebase.googleapis.com',
      'https://fonts.gstatic.com',
      'https://fonts.googleapis.com',
      'https://api.groq.com'
    ];
    var head = document.head;
    hints.forEach(function(href) {
      var link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = href;
      link.crossOrigin = 'anonymous';
      head.appendChild(link);
    });
  })();

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

  /* ══════════════════════════════════════════════════
     BOTTOM NAVIGATION BAR
     Injected into every page for easy mobile navigation.
     Active tab is highlighted based on current page URL.
  ══════════════════════════════════════════════════ */
  var NAV_ITEMS = [
    { id: 'nav-home',    label: 'Home',    href: 'index.html',        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { id: 'nav-quiz',    label: 'Quiz',    href: 'create-quiz.html',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>' },
    { id: 'nav-studio',  label: 'AI Chat', href: 'studio.html',       icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' },
    { id: 'nav-study',   label: 'Study',   href: 'study.html',        icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
    { id: 'nav-profile', label: 'Profile', href: 'user-dashboard.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' }
  ];

  function getCurrentPage() {
    var path = window.location.pathname;
    var page = path.split('/').pop() || 'index.html';
    if (!page || page === '') page = 'index.html';
    return page;
  }

  function getActiveNavId(page) {
    if (!page || page === 'index.html' || page === '') return 'nav-home';
    if (page === 'create-quiz.html') return 'nav-quiz';
    if (page === 'studio.html')      return 'nav-studio';
    if (page === 'study.html')       return 'nav-study';
    if (page === 'user-dashboard.html' || page === 'dashboard.html') return 'nav-profile';
    return null;
  }

  function injectBottomNav() {
    var page = getCurrentPage();
    /* Hide nav on auth pages */
    var noNavPages = ['login.html', 'register.html', 'unauthorized.html', 'take-quiz.html', 'challenge.html', 'quiz-results.html'];
    if (noNavPages.indexOf(page) !== -1) return;

    var activeId = getActiveNavId(page);

    /* Styles */
    var style = document.createElement('style');
    style.textContent = [
      '._aqsbn{position:fixed;bottom:0;left:0;right:0;z-index:9990;',
      'background:linear-gradient(180deg,rgba(15,12,41,0.97),rgba(13,46,125,0.99));',
      'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);',
      'border-top:1px solid rgba(99,102,241,0.25);',
      'display:flex;align-items:stretch;',
      'padding-bottom:env(safe-area-inset-bottom,0px);',
      'box-shadow:0 -4px 24px rgba(0,0,0,0.35);}',
      '._aqsbn-item{flex:1;display:flex;flex-direction:column;align-items:center;',
      'justify-content:center;gap:3px;padding:10px 4px 8px;',
      'text-decoration:none;color:rgba(148,163,184,0.8);',
      'font-family:-apple-system,BlinkMacSystemFont,Inter,sans-serif;',
      'font-size:10px;font-weight:600;letter-spacing:.03em;',
      'transition:color .2s,transform .15s;min-height:56px;',
      '-webkit-tap-highlight-color:transparent;cursor:pointer;}',
      '._aqsbn-item:active{transform:scale(0.92);}',
      '._aqsbn-item svg{width:22px;height:22px;transition:stroke .2s;}',
      '._aqsbn-item._active{color:#818cf8;}',
      '._aqsbn-item._active svg{filter:drop-shadow(0 0 6px rgba(129,140,248,0.6));}',
      '._aqsbn-dot{width:5px;height:5px;border-radius:50%;background:#818cf8;',
      'margin-top:1px;opacity:0;transition:opacity .2s;}',
      '._aqsbn-item._active ._aqsbn-dot{opacity:1;}',
      'body{padding-bottom:calc(64px + env(safe-area-inset-bottom,0px)) !important;}'
    ].join('');
    document.head.appendChild(style);

    /* Nav bar element */
    var nav = document.createElement('nav');
    nav.className = '_aqsbn';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', 'Main navigation');

    NAV_ITEMS.forEach(function(item) {
      var a = document.createElement('a');
      a.id = item.id;
      a.className = '_aqsbn-item' + (item.id === activeId ? ' _active' : '');
      a.href = item.href;
      a.setAttribute('aria-label', item.label);
      a.innerHTML = item.icon + '<span>' + item.label + '</span><span class="_aqsbn-dot"></span>';

      /* Speed: use replaceState so navigation feels instant */
      a.addEventListener('click', function(e) {
        /* Let default href navigate — just add active class instantly */
        nav.querySelectorAll('._aqsbn-item').forEach(function(el) { el.classList.remove('_active'); });
        a.classList.add('_active');
      });

      nav.appendChild(a);
    });

    document.body.appendChild(nav);
  }

  document.addEventListener('DOMContentLoaded', injectBottomNav);

  /* ══════════════════════════════════════════════════
     MICROPHONE PERMISSION
  ══════════════════════════════════════════════════ */
  var micGranted = false;

  function removeMicBanner() {
    var b = document.getElementById('_aqsMicBanner');
    if (b) b.remove();
  }

  function requestMicPermission(silent) {
    if (micGranted) { removeMicBanner(); return Promise.resolve(true); }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.resolve(false);

    return navigator.mediaDevices.getUserMedia({ audio: true })
      .then(function (stream) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        micGranted = true;
        window._aqsMicPermissionGranted = true;
        removeMicBanner();
        return true;
      })
      .catch(function () {
        window._aqsMicPermissionGranted = false;
        if (silent) return false;
        if (document.getElementById('_aqsMicBanner')) return false;
        var appName = document.title || 'this app';
        var banner = document.createElement('div');
        banner.id = '_aqsMicBanner';
        banner.style.cssText =
          'position:fixed;bottom:68px;left:0;right:0;z-index:99998;background:#c0392b;' +
          'color:#fff;padding:12px 14px;font-size:13px;font-family:sans-serif;' +
          'display:flex;align-items:center;gap:8px;box-shadow:0 -2px 8px rgba(0,0,0,.3)';
        banner.innerHTML =
          '<span style="flex:1">&#127908; Microphone blocked — go to ' +
          '<b>Settings › Apps › ' + appName + ' › Permissions</b> and allow Microphone, then tap Retry.</span>' +
          '<button id="_aqsMicRetry" style="background:#fff;color:#c0392b;border:none;border-radius:6px;' +
          'padding:6px 12px;font-size:12px;font-weight:bold;cursor:pointer;flex-shrink:0">Retry</button>' +
          '<button id="_aqsMicDismiss" style="background:rgba(255,255,255,.25);color:#fff;border:none;' +
          'border-radius:6px;padding:6px 10px;font-size:14px;font-weight:bold;cursor:pointer;flex-shrink:0">✕</button>';
        document.body.appendChild(banner);
        document.getElementById('_aqsMicRetry').addEventListener('click', function () {
          removeMicBanner(); micGranted = false; requestMicPermission(false);
        });
        document.getElementById('_aqsMicDismiss').addEventListener('click', removeMicBanner);
        return false;
      });
  }

  /* First touch: silent */
  document.addEventListener('touchstart', function () {
    if (!micGranted) requestMicPermission(true);
  }, { once: true });

  /* Hook known mic/voice buttons — explicit */
  var MIC_BTN_IDS = ['dts-voice-btn','dts-voice-toggle','std-voice-mic-btn','std-voice-btn','std-voice-hdr-btn','std-summon-fab','tts-speak-btn','tts-generate-btn'];
  document.addEventListener('DOMContentLoaded', function () {
    MIC_BTN_IDS.forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', function () { if (!micGranted) requestMicPermission(false); }, true);
    });
    ['.dts-voice-btn','.std-voice-mic-btn','.tts-speak-btn','[data-action="mic"]','[data-action="voice"]'].forEach(function (sel) {
      try { document.querySelectorAll(sel).forEach(function (el) {
        el.addEventListener('click', function () { if (!micGranted) requestMicPermission(false); }, true);
      }); } catch (e) {}
    });
    setTimeout(function () { if (!micGranted) requestMicPermission(true); }, 1200);
  });

  if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
    window.Capacitor.Plugins.App.addListener('appStateChange', function (state) {
      if (state.isActive && !micGranted) requestMicPermission(true).then(function (g) { if (g) removeMicBanner(); });
    });
  }

  window.AQSRequestMicPermission = function () { return requestMicPermission(false); };
  window.AQSMicGranted = function () { return micGranted; };

  /* ══════════════════════════════════════════════════
     AUDIO UNLOCK (speed: only run once, on first touch)
  ══════════════════════════════════════════════════ */
  var audioUnlocked = false;

  function _unlockAllAudio() {
    if (audioUnlocked) return;
    audioUnlocked = true;
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var src = ctx.createBufferSource();
      src.buffer = ctx.createBuffer(1, 1, 22050);
      src.connect(ctx.destination);
      src.start(0);
      ctx.resume().catch(function(){});
    } catch (e) {}
    try {
      var sil = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=');
      sil.volume = 0.001;
      sil.play().then(function(){ sil.pause(); sil.src=''; window._aqsAudioUnlocked=true; }).catch(function(){});
    } catch (e2) {}
    window._aqsAudioUnlocked = true;
  }

  document.addEventListener('touchstart', _unlockAllAudio, { once: true });
  document.addEventListener('DOMContentLoaded', function () {
    ['tts-generate-btn','tts-speak-btn','tts-play-btn','std-summon-fab','dts-voice-btn'].forEach(function (id) {
      var btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', _unlockAllAudio, { once: true });
    });
  });

  window.AQSUnlockAudio = _unlockAllAudio;
  window.AQSPlatform = { isNative: isCapacitor, platform: platform };

})();
