/* ============================================================
   AQS Video Splash Screen
   DaraQuiz AI — Darapet Technology
   Full-screen video intro with branded overlay
============================================================ */
(function () {
  'use strict';

  var VIDEO_SRC   = 'video/splash.mp4';
  var APP_NAME    = 'DaraQuiz AI';
  var TAGLINE     = 'Powered by Darapet Technology';
  var MAX_WAIT    = 5000;
  var FADE_MS     = 600;
  var SESSION_KEY = 'aqs_vsplash_shown';

  /* Only show once per session */
  if (sessionStorage.getItem(SESSION_KEY)) return;
  sessionStorage.setItem(SESSION_KEY, '1');

  /* Inject styles */
  var style = document.createElement('style');
  style.textContent = [
    '#aqs-vsplash{',
      'position:fixed;inset:0;z-index:999999;',
      'background:#000;',
      'display:flex;align-items:center;justify-content:center;',
      'overflow:hidden;',
      'transition:opacity ' + (FADE_MS/1000) + 's ease;',
    '}',

    '#aqs-vsplash video{',
      'position:absolute;inset:0;',
      'width:100%;height:100%;',
      'object-fit:cover;',
      'opacity:0;',
      'transition:opacity 0.4s ease;',
    '}',
    '#aqs-vsplash video.aqs-vs-ready{opacity:1;}',

    '#aqs-vs-overlay{',
      'position:absolute;inset:0;',
      'background:linear-gradient(',
        '0deg,',
        'rgba(0,0,0,0.75) 0%,',
        'rgba(0,0,0,0.1) 45%,',
        'rgba(0,0,0,0.1) 60%,',
        'rgba(0,0,0,0.65) 100%',
      ');',
      'display:flex;',
      'flex-direction:column;',
      'align-items:center;',
      'justify-content:space-between;',
      'padding:env(safe-area-inset-top,24px) 0 env(safe-area-inset-bottom,36px);',
    '}',

    '#aqs-vs-top{',
      'padding:28px 28px 0;',
      'width:100%;',
      'display:flex;align-items:center;justify-content:center;',
      'opacity:0;transform:translateY(-16px);',
      'transition:opacity 0.6s ease 0.3s, transform 0.6s ease 0.3s;',
    '}',
    '#aqs-vs-top.aqs-vs-in{opacity:1;transform:translateY(0);}',

    '#aqs-vs-logo-ring{',
      'width:72px;height:72px;',
      'border-radius:50%;',
      'background:linear-gradient(135deg,rgba(99,102,241,0.9),rgba(139,92,246,0.9));',
      'display:flex;align-items:center;justify-content:center;',
      'box-shadow:0 0 0 3px rgba(255,255,255,0.15), 0 8px 32px rgba(99,102,241,0.5);',
      'font-size:2rem;',
      'flex-shrink:0;',
    '}',

    '#aqs-vs-bottom{',
      'padding:0 28px 8px;',
      'width:100%;',
      'text-align:center;',
      'opacity:0;transform:translateY(20px);',
      'transition:opacity 0.7s ease 0.5s, transform 0.7s ease 0.5s;',
    '}',
    '#aqs-vs-bottom.aqs-vs-in{opacity:1;transform:translateY(0);}',

    '#aqs-vs-app-name{',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'font-size:2rem;font-weight:900;',
      'color:#fff;',
      'letter-spacing:-0.02em;',
      'text-shadow:0 2px 20px rgba(0,0,0,0.6);',
      'margin-bottom:6px;',
    '}',
    '#aqs-vs-app-name span{',
      'background:linear-gradient(90deg,#818cf8,#a78bfa,#60a5fa);',
      '-webkit-background-clip:text;',
      '-webkit-text-fill-color:transparent;',
      'background-clip:text;',
    '}',

    '#aqs-vs-tagline{',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'font-size:0.82rem;font-weight:500;',
      'color:rgba(255,255,255,0.65);',
      'letter-spacing:0.06em;',
      'text-transform:uppercase;',
    '}',

    '#aqs-vs-progress{',
      'width:80px;height:3px;',
      'background:rgba(255,255,255,0.18);',
      'border-radius:99px;',
      'overflow:hidden;',
      'margin:14px auto 0;',
    '}',
    '#aqs-vs-progress-fill{',
      'height:100%;width:0%;',
      'background:linear-gradient(90deg,#818cf8,#a78bfa);',
      'border-radius:99px;',
      'transition:width 0.3s ease;',
    '}',

    '#aqs-vs-skip{',
      'position:absolute;top:16px;right:16px;',
      'background:rgba(255,255,255,0.12);',
      'border:1px solid rgba(255,255,255,0.2);',
      'color:rgba(255,255,255,0.7);',
      'font-family:-apple-system,Inter,sans-serif;',
      'font-size:0.75rem;font-weight:600;',
      'padding:6px 14px;border-radius:99px;',
      'cursor:pointer;',
      'opacity:0;',
      'transition:opacity 0.4s ease 1.5s, background 0.2s;',
      'letter-spacing:0.04em;',
      '-webkit-tap-highlight-color:transparent;',
    '}',
    '#aqs-vs-skip.aqs-vs-in{opacity:1;}',
    '#aqs-vs-skip:active{background:rgba(255,255,255,0.25);}',

    '#aqs-vsplash.aqs-vs-fade{opacity:0;}',
  ].join('');
  document.head.appendChild(style);

  /* Build DOM */
  var splash = document.createElement('div');
  splash.id = 'aqs-vsplash';
  splash.innerHTML = [
    '<video id="aqs-vs-vid" src="' + VIDEO_SRC + '" playsinline muted autoplay preload="auto"></video>',

    '<div id="aqs-vs-overlay">',
      '<div id="aqs-vs-top">',
        '<div id="aqs-vs-logo-ring">🎯</div>',
      '</div>',

      '<div id="aqs-vs-bottom">',
        '<div id="aqs-vs-app-name"><span>' + APP_NAME + '</span></div>',
        '<div id="aqs-vs-tagline">' + TAGLINE + '</div>',
        '<div id="aqs-vs-progress">',
          '<div id="aqs-vs-progress-fill"></div>',
        '</div>',
      '</div>',
    '</div>',

    '<button id="aqs-vs-skip">Skip ›</button>',
  ].join('');
  document.body.appendChild(splash);

  var vid      = document.getElementById('aqs-vs-vid');
  var fill     = document.getElementById('aqs-vs-progress-fill');
  var top      = document.getElementById('aqs-vs-top');
  var bottom   = document.getElementById('aqs-vs-bottom');
  var skipBtn  = document.getElementById('aqs-vs-skip');
  var done     = false;
  var timer    = null;

  function dismiss() {
    if (done) return;
    done = true;
    clearTimeout(timer);
    fill.style.width = '100%';
    setTimeout(function () {
      splash.classList.add('aqs-vs-fade');
      setTimeout(function () { splash.remove(); }, FADE_MS);
    }, 180);
  }

  /* Animate in UI elements once video starts */
  function onReady() {
    vid.classList.add('aqs-vs-ready');
    top.classList.add('aqs-vs-in');
    bottom.classList.add('aqs-vs-in');
    skipBtn.classList.add('aqs-vs-in');
  }

  /* Progress bar tracks video playback */
  vid.addEventListener('timeupdate', function () {
    if (!vid.duration) return;
    var pct = Math.min(99, (vid.currentTime / vid.duration) * 100);
    fill.style.width = pct + '%';
  });

  vid.addEventListener('canplay', onReady);
  vid.addEventListener('playing', onReady);

  vid.addEventListener('ended', dismiss);

  /* Fallback: max wait */
  timer = setTimeout(dismiss, MAX_WAIT);

  /* Skip button */
  skipBtn.addEventListener('click', dismiss);
  skipBtn.addEventListener('touchend', function (e) { e.preventDefault(); dismiss(); });

  /* Try playing */
  var playPromise = vid.play();
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise.then(onReady).catch(function () {
      /* Autoplay blocked — show static splash and auto-dismiss */
      onReady();
      var t = 0;
      var iv = setInterval(function () {
        t += 100;
        fill.style.width = Math.min(99, (t / MAX_WAIT) * 100) + '%';
        if (t >= MAX_WAIT) { clearInterval(iv); dismiss(); }
      }, 100);
    });
  }

})();
