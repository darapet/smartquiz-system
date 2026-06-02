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
    { id: 'nav-profile', label: 'Profile', href: 'profile.html', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>' }
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

  /* ══════════════════════════════════════════════════
     IN-APP UPDATE CHECKER
     Fetches version.json from GitHub on startup.
     Compares installed version (from Capacitor App.getInfo)
     with the latest published version.
     Shows a slide-up bottom-sheet if an update is available.
     Only runs on native Capacitor (Android/iOS).
  ══════════════════════════════════════════════════ */
  var _UPD_URL  = 'https://raw.githubusercontent.com/darapet/smartquiz-system/main/daraquiz-mobile/www/version.json';
  var _UPD_DKEY = '_aqsUpdDismissed_';

  function _semverGt(remote, local) {
    /* returns true if remote > local */
    var r = (remote || '0.0.0').split('.').map(Number);
    var l = (local  || '0.0.0').split('.').map(Number);
    for (var i = 0; i < 3; i++) {
      if ((r[i]||0) > (l[i]||0)) return true;
      if ((r[i]||0) < (l[i]||0)) return false;
    }
    return false;
  }

  function _showUpdateSheet(current, upd) {
    /* Inject styles once */
    if (!document.getElementById('_aqsUpdStyle')) {
      var s = document.createElement('style');
      s.id = '_aqsUpdStyle';
      s.textContent = [
        '._aqsUpdOverlay{position:fixed;inset:0;z-index:99994;',
        'background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);',
        'display:flex;align-items:flex-end;justify-content:center;',
        'animation:_aqsUpdFadeIn .25s ease;}',
        '@keyframes _aqsUpdFadeIn{from{opacity:0}to{opacity:1}}',
        '._aqsUpdSheet{background:linear-gradient(160deg,#0f172a,#1e1b4b);',
        'border:1px solid rgba(129,140,248,0.25);border-radius:24px 24px 0 0;',
        'padding:6px 24px 40px;max-width:480px;width:100%;',
        'box-shadow:0 -8px 40px rgba(0,0,0,0.6);',
        'animation:_aqsUpdSlide .35s cubic-bezier(.34,1.56,.64,1);}',
        '@keyframes _aqsUpdSlide{from{transform:translateY(100%)}to{transform:translateY(0)}}',
        '._aqsUpdHandle{width:36px;height:4px;background:rgba(255,255,255,.18);',
        'border-radius:2px;margin:10px auto 20px;}',
        '._aqsUpdBadge{display:inline-flex;align-items:center;gap:6px;',
        'background:rgba(52,211,153,0.15);border:1px solid rgba(52,211,153,0.4);',
        'border-radius:100px;padding:5px 14px;font-size:.75rem;font-weight:700;',
        'letter-spacing:.05em;color:#34d399;text-transform:uppercase;margin-bottom:14px;}',
        '._aqsUpdTitle{font-size:1.2rem;font-weight:800;color:#e0e7ff;margin-bottom:8px;',
        'font-family:-apple-system,Inter,sans-serif;}',
        '._aqsUpdMeta{font-size:.8rem;color:#64748b;margin-bottom:14px;',
        'font-family:-apple-system,Inter,sans-serif;}',
        '._aqsUpdNotes{font-size:.88rem;color:#94a3b8;line-height:1.7;',
        'background:rgba(255,255,255,0.04);border-radius:12px;padding:12px 14px;',
        'margin-bottom:20px;font-family:-apple-system,Inter,sans-serif;}',
        '._aqsUpdNotes b{color:#c7d2fe;}',
        '._aqsUpdDl{display:flex;align-items:center;justify-content:center;gap:9px;',
        'background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;',
        'border:none;border-radius:14px;padding:15px 24px;width:100%;',
        'font-size:1rem;font-weight:700;cursor:pointer;margin-bottom:10px;',
        'font-family:-apple-system,Inter,sans-serif;letter-spacing:.01em;',
        'box-shadow:0 4px 20px rgba(34,197,94,0.35);transition:transform .15s;}',
        '._aqsUpdDl:active{transform:scale(0.97);}',
        '._aqsUpdSkip{background:transparent;color:#475569;border:1px solid rgba(71,85,105,0.3);',
        'border-radius:14px;padding:12px 24px;width:100%;font-size:.85rem;',
        'cursor:pointer;font-family:-apple-system,Inter,sans-serif;transition:color .15s;}',
        '._aqsUpdSkip:active{color:#94a3b8;}',
        '._aqsUpdProgWrap{display:none;margin-bottom:14px;}',
        '._aqsUpdProgLabel{font-size:.82rem;color:rgba(255,255,255,0.6);margin-bottom:8px;text-align:left;',
        'font-family:-apple-system,Inter,sans-serif;}',
        '._aqsUpdProgTrack{width:100%;height:8px;background:rgba(255,255,255,0.1);',
        'border-radius:99px;overflow:hidden;}',
        '._aqsUpdProgFill{height:100%;width:0%;border-radius:99px;',
        'background:linear-gradient(90deg,#22c55e,#16a34a);transition:width .3s ease;}'
      ].join('');
      document.head.appendChild(s);
    }

    var overlay = document.createElement('div');
    overlay.className = '_aqsUpdOverlay';
    overlay.innerHTML = [
      '<div class="_aqsUpdSheet">',
        '<div class="_aqsUpdHandle"></div>',
        '<div class="_aqsUpdBadge">',
          '<svg width="10" height="10" viewBox="0 0 24 24" fill="#34d399"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
          'Update Available',
        '</div>',
        '<div class="_aqsUpdTitle">Version ' + upd.version + ' is ready!</div>',
        '<div class="_aqsUpdMeta">You have v' + current + ' &nbsp;→&nbsp; Latest: v' + upd.version + '</div>',
        '<div class="_aqsUpdNotes"><b>What\'s new:</b><br>' + (upd.notes || 'Bug fixes and improvements.') + '</div>',
        '<div class="_aqsUpdProgWrap" id="_aqsUpdProgWrap">',
          '<div class="_aqsUpdProgLabel" id="_aqsUpdProgLabel">Downloading… 0%</div>',
          '<div class="_aqsUpdProgTrack"><div class="_aqsUpdProgFill" id="_aqsUpdProgFill"></div></div>',
        '</div>',
        '<button class="_aqsUpdDl" id="_aqsUpdDlBtn">',
          '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>',
          'Download & Install Update',
        '</button>',
        '<button class="_aqsUpdSkip" id="_aqsUpdSkipBtn">Remind me later</button>',
      '</div>'
    ].join('');
    document.body.appendChild(overlay);

    document.getElementById('_aqsUpdDlBtn').addEventListener('click', function() {
      var url = upd.apkUrl || upd.downloadUrl || '';
      if (!url) {
        alert('Download link not available yet. Please try again later.');
        return;
      }

      var btn      = document.getElementById('_aqsUpdDlBtn');
      var skipBtn  = document.getElementById('_aqsUpdSkipBtn');
      var progWrap = document.getElementById('_aqsUpdProgWrap');
      var progFill = document.getElementById('_aqsUpdProgFill');
      var progLbl  = document.getElementById('_aqsUpdProgLabel');

      /* ── Native Android in-app download (no browser) ── */
      if (window.AqsDownloadBridge && typeof window.AqsDownloadBridge.startDownload === 'function') {
        btn.disabled = true;
        btn.textContent = '⏳ Starting download…';
        skipBtn.style.display = 'none';
        progWrap.style.display = 'block';
        progFill.style.width = '0%';
        progLbl.textContent = 'Downloading… 0%';

        window.aqsNativeProgress = function(pct) {
          if (pct < 0) {
            btn.disabled = false;
            btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Retry Download';
            skipBtn.style.display = '';
            progWrap.style.display = 'none';
            alert('Download failed. Please check your connection and try again.');
            window.aqsNativeProgress = null;
            return;
          }
          progFill.style.width = pct + '%';
          progLbl.textContent = pct >= 100 ? '✅ Installing…' : 'Downloading… ' + pct + '%';
          if (pct >= 100) {
            btn.textContent = '✅ Installing…';
            setTimeout(function() {
              overlay.remove();
              window.aqsNativeProgress = null;
            }, 4000);
          }
        };

        window.AqsDownloadBridge.startDownload(url, 'daraquiz-update.apk');

      /* ── Fallback: open in browser (iOS or web) ── */
      } else {
        if (isCapacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
          window.Capacitor.Plugins.Browser.open({ url: url });
        } else {
          window.open(url, '_blank');
        }
        overlay.remove();
      }
    });

    document.getElementById('_aqsUpdSkipBtn').addEventListener('click', function() {
      try { localStorage.setItem(_UPD_DKEY + upd.version, Date.now().toString()); } catch(e){}
      overlay.style.animation = '_aqsUpdFadeIn .2s ease reverse';
      setTimeout(function(){ overlay.remove(); }, 200);
    });

    overlay.addEventListener('click', function(e){
      if (e.target === overlay) document.getElementById('_aqsUpdSkipBtn').click();
    });
  }

  /* Also expose a floating badge for pages where the sheet was dismissed */
  function _showUpdateBadge(upd) {
    if (document.getElementById('_aqsUpdBadgeFloat')) return;
    var badge = document.createElement('div');
    badge.id = '_aqsUpdBadgeFloat';
    badge.title = 'Update available: v' + upd.version;
    badge.style.cssText = [
      'position:fixed;top:10px;right:12px;z-index:9993;',
      'background:linear-gradient(135deg,#22c55e,#16a34a);',
      'color:#fff;border-radius:100px;padding:6px 14px 6px 10px;',
      'font-size:.78rem;font-weight:700;cursor:pointer;',
      'display:flex;align-items:center;gap:6px;',
      'box-shadow:0 3px 14px rgba(34,197,94,0.45);',
      'font-family:-apple-system,Inter,sans-serif;',
      'animation:_aqsUpdPulse 2s ease infinite;'
    ].join('');
    var pulse = document.createElement('style');
    pulse.textContent = '@keyframes _aqsUpdPulse{0%,100%{box-shadow:0 3px 14px rgba(34,197,94,.45)}50%{box-shadow:0 3px 22px rgba(34,197,94,.75)}}';
    document.head.appendChild(pulse);
    badge.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> v' + upd.version + ' Update';
    badge.addEventListener('click', function() {
      badge.remove();
      try { localStorage.removeItem(_UPD_DKEY + upd.version); } catch(e){}
      _showUpdateSheet('?', upd);
    });
    document.body.appendChild(badge);
  }

  async function checkForUpdates() {
    if (!isCapacitor) return;
    try {
      var appPlugin = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
      var currentVer = '1.0.0';
      if (appPlugin && appPlugin.getInfo) {
        try { var info = await appPlugin.getInfo(); currentVer = info.version || '1.0.0'; } catch(e2){}
      }

      var res = await fetch(_UPD_URL + '?_=' + Date.now(), { cache: 'no-store' });
      if (!res.ok) return;
      var upd = await res.json();
      if (!upd || !upd.version) return;

      if (!_semverGt(upd.version, currentVer)) return; /* already up to date */

      var dismissed = false;
      try { dismissed = !!localStorage.getItem(_UPD_DKEY + upd.version); } catch(e){}

      if (dismissed) {
        _showUpdateBadge(upd);
      } else {
        _showUpdateSheet(currentVer, upd);
      }
    } catch(e) { /* silent fail */ }
  }

  /* Run update check 4 seconds after page load so it doesn't slow startup */
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(checkForUpdates, 4000);
  });


  /* ══════════════════════════════════════════════════
     NATIVE-ONLY FIRST-TIME DISCLAIMER POPUP
     Shows once on Studio and Study pages to tell users
     that TTS, voice chat and image generation need the web.
  ══════════════════════════════════════════════════ */
  var DISCLAIMER_PAGES = {
    'studio.html': {
      title: '🖥️ Some Features Need the Web App',
      body: 'On the <b>mobile app</b>, features like <b>Voice Conversation, Text-to-Speech (TTS) and Image Generation</b> require a stable internet connection and work best on the web version.<br><br>For the full experience, visit our web app anytime — it works on any browser, no download needed.',
      page: 'Studio'
    },
    'study.html': {
      title: '📚 Some Features Need the Web App',
      body: 'On the <b>mobile app</b>, features like <b>Voice Chat with the AI Tutor, Text-to-Speech</b> reading, and <b>Image Generation</b> work best on the web version.<br><br>For the full AI Study experience visit our web app — it's free and needs no download.',
      page: 'Study'
    }
  };

  var DISCLAIMER_KEY = '_aqsNativeDisclaimer_v1';
  var WEB_URL = 'https://darapet.github.io/smartquiz-system';

  function injectDisclaimerStyles() {
    if (document.getElementById('_aqsDclStyle')) return;
    var s = document.createElement('style');
    s.id = '_aqsDclStyle';
    s.textContent = [
      '._aqsDcl{position:fixed;inset:0;z-index:99995;display:flex;align-items:flex-end;',
      'justify-content:center;background:rgba(0,0,0,0.6);backdrop-filter:blur(4px);',
      'animation:_aqsDclFadeIn .25s ease;}',
      '@keyframes _aqsDclFadeIn{from{opacity:0}to{opacity:1}}',
      '._aqsDclCard{background:linear-gradient(160deg,#1e1b4b,#1e293b);',
      'border:1px solid rgba(129,140,248,0.3);border-radius:22px 22px 0 0;',
      'padding:28px 24px 36px;max-width:480px;width:100%;',
      'box-shadow:0 -8px 40px rgba(0,0,0,0.5);',
      'animation:_aqsDclSlideUp .3s cubic-bezier(.34,1.56,.64,1);}',
      '@keyframes _aqsDclSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}',
      '._aqsDclHandle{width:36px;height:4px;background:rgba(255,255,255,0.2);',
      'border-radius:2px;margin:0 auto 20px;}',
      '._aqsDclIcon{font-size:2.5rem;text-align:center;margin-bottom:12px;}',
      '._aqsDclTitle{font-size:1.1rem;font-weight:800;color:#e0e7ff;',
      'text-align:center;margin-bottom:12px;font-family:-apple-system,Inter,sans-serif;}',
      '._aqsDclBody{font-size:0.88rem;color:#94a3b8;line-height:1.7;',
      'text-align:center;margin-bottom:20px;font-family:-apple-system,Inter,sans-serif;}',
      '._aqsDclBody b{color:#c7d2fe;}',
      '._aqsDclBtns{display:flex;flex-direction:column;gap:10px;}',
      '._aqsDclWeb{display:flex;align-items:center;justify-content:center;gap:8px;',
      'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;',
      'border:none;border-radius:12px;padding:14px 24px;font-size:0.95rem;',
      'font-weight:700;cursor:pointer;text-decoration:none;',
      'font-family:-apple-system,Inter,sans-serif;',
      'box-shadow:0 4px 20px rgba(99,102,241,0.4);transition:transform .15s;}',
      '._aqsDclWeb:active{transform:scale(0.97);}',
      '._aqsDclDismiss{background:transparent;color:rgba(148,163,184,0.7);',
      'border:1px solid rgba(148,163,184,0.2);border-radius:12px;',
      'padding:12px 24px;font-size:0.85rem;cursor:pointer;',
      'font-family:-apple-system,Inter,sans-serif;transition:color .15s;}',
      '._aqsDclDismiss:active{color:#e2e8f0;}'
    ].join('');
    document.head.appendChild(s);
  }

  function showNativeDisclaimer(cfg) {
    injectDisclaimerStyles();

    var overlay = document.createElement('div');
    overlay.className = '_aqsDcl';
    overlay.innerHTML = [
      '<div class="_aqsDclCard">',
        '<div class="_aqsDclHandle"></div>',
        '<div class="_aqsDclTitle">' + cfg.title + '</div>',
        '<div class="_aqsDclBody">' + cfg.body + '</div>',
        '<div class="_aqsDclBtns">',
          '<a href="' + WEB_URL + '" target="_blank" class="_aqsDclWeb">',
            '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>',
            'Open Web App — Full Features',
          '</a>',
          '<button class="_aqsDclDismiss" id="_aqsDclDismissBtn">Continue in app (limited features)</button>',
        '</div>',
      '</div>'
    ].join('');

    document.body.appendChild(overlay);

    function close() {
      overlay.style.animation = '_aqsDclFadeIn .2s ease reverse';
      setTimeout(function(){ if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 200);
    }

    document.getElementById('_aqsDclDismissBtn').addEventListener('click', close);
    overlay.addEventListener('click', function(e){ if (e.target === overlay) close(); });

    try { localStorage.setItem(DISCLAIMER_KEY, '1'); } catch(e){}
  }

  function maybeShowDisclaimer() {
    if (!isCapacitor) return;
    try { if (localStorage.getItem(DISCLAIMER_KEY)) return; } catch(e){ return; }
    var page = (window.location.pathname.split('/').pop()) || 'index.html';
    var cfg = DISCLAIMER_PAGES[page];
    if (!cfg) return;
    setTimeout(function(){ showNativeDisclaimer(cfg); }, 1200);
  }

  document.addEventListener('DOMContentLoaded', maybeShowDisclaimer);

  /* ── Speed: prefetch likely next pages in the background ── */
  document.addEventListener('DOMContentLoaded', function() {
    var page = (window.location.pathname.split('/').pop()) || 'index.html';
    var prefetchMap = {
      'index.html':       ['create-quiz.html', 'studio.html', 'login.html'],
      'login.html':       ['user-dashboard.html', 'register.html'],
      'register.html':    ['login.html'],
      'user-dashboard.html': ['create-quiz.html', 'study.html', 'studio.html'],
      'create-quiz.html': ['take-quiz.html', 'user-dashboard.html'],
      'studio.html':      ['study.html', 'create-quiz.html'],
      'study.html':       ['studio.html', 'create-quiz.html']
    };
    var pages = prefetchMap[page] || [];
    pages.forEach(function(href) {
      var link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = href;
      document.head.appendChild(link);
    });
  });


})();
