/* ============================================================
   AQS Video Splash Screen — v2
   DaraQuiz AI — Darapet Technology
   Full-screen video intro with branded overlay
   Fix: video now plays to full completion before dismissing.
============================================================ */
(function () {
  'use strict';

  var VIDEO_SRC   = 'video/splash.mp4';
  var APP_NAME    = 'DaraQuiz AI';
  var TAGLINE     = 'Powered by Darapet Technology';
  var FADE_MS     = 700;
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
      'opacity:1;',
      'transition:opacity ' + (FADE_MS/1000) + 's ease;',
    '}',

    '#aqs-vsplash video{',
      'position:absolute;inset:0;',
      'width:100%;height:100%;',
      'object-fit:cover;',
      'opacity:0;',
      'transition:opacity 0.5s ease;',
    '}',
    '#aqs-vsplash video.aqs-vs-ready{opacity:1;}',

    /* Dark gradient overlay for readability */
    '#aqs-vs-overlay{',
      'position:absolute;inset:0;',
      'background:linear-gradient(',
        '180deg,',
        'rgba(0,0,0,0.55) 0%,',
        'rgba(0,0,0,0.0) 35%,',
        'rgba(0,0,0,0.0) 60%,',
        'rgba(0,0,0,0.72) 100%',
      ');',
      'display:flex;',
      'flex-direction:column;',
      'align-items:center;',
      'justify-content:space-between;',
      'padding:env(safe-area-inset-top,32px) 0 env(safe-area-inset-bottom,40px);',
    '}',

    /* Top: logo ring */
    '#aqs-vs-top{',
      'padding:20px 28px 0;',
      'width:100%;',
      'display:flex;align-items:center;justify-content:center;',
      'opacity:0;transform:translateY(-14px);',
      'transition:opacity 0.6s ease 0.4s, transform 0.6s ease 0.4s;',
    '}',
    '#aqs-vs-top.aqs-vs-in{opacity:1;transform:translateY(0);}',

    '#aqs-vs-logo-ring{',
      'width:64px;height:64px;',
      'border-radius:50%;',
      'background:linear-gradient(135deg,rgba(99,102,241,0.92),rgba(139,92,246,0.92));',
      'display:flex;align-items:center;justify-content:center;',
      'box-shadow:0 0 0 3px rgba(255,255,255,0.18), 0 10px 40px rgba(99,102,241,0.55);',
      'flex-shrink:0;',
    '}',

    /* Bottom: app name + tagline + progress */
    '#aqs-vs-bottom{',
      'padding:0 28px 4px;',
      'width:100%;',
      'text-align:center;',
      'opacity:0;transform:translateY(18px);',
      'transition:opacity 0.7s ease 0.6s, transform 0.7s ease 0.6s;',
    '}',
    '#aqs-vs-bottom.aqs-vs-in{opacity:1;transform:translateY(0);}',

    '#aqs-vs-app-name{',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'font-size:2.1rem;font-weight:900;',
      'color:#fff;',
      'letter-spacing:-0.02em;',
      'text-shadow:0 2px 24px rgba(0,0,0,0.55);',
      'margin-bottom:5px;',
    '}',
    '#aqs-vs-app-name span{',
      'background:linear-gradient(90deg,#818cf8,#a78bfa,#60a5fa);',
      '-webkit-background-clip:text;',
      '-webkit-text-fill-color:transparent;',
      'background-clip:text;',
    '}',

    '#aqs-vs-tagline{',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'font-size:0.78rem;font-weight:600;',
      'color:rgba(255,255,255,0.6);',
      'letter-spacing:0.06em;',
      'text-transform:uppercase;',
      'margin-bottom:18px;',
    '}',

    /* Progress bar */
    '#aqs-vs-progress{',
      'width:90px;height:3px;',
      'background:rgba(255,255,255,0.15);',
      'border-radius:99px;',
      'overflow:hidden;',
      'margin:0 auto;',
    '}',
    '#aqs-vs-progress-fill{',
      'height:100%;width:0%;',
      'background:linear-gradient(90deg,#818cf8,#a78bfa,#60a5fa);',
      'border-radius:99px;',
      'transition:width 0.25s ease;',
    '}',

    /* Skip button */
    '#aqs-vs-skip{',
      'position:absolute;top:max(env(safe-area-inset-top,16px),16px);right:16px;',
      'background:rgba(0,0,0,0.35);',
      'border:1px solid rgba(255,255,255,0.18);',
      'color:rgba(255,255,255,0.8);',
      'font-family:-apple-system,Inter,sans-serif;',
      'font-size:0.72rem;font-weight:700;',
      'padding:7px 16px;border-radius:99px;',
      'cursor:pointer;',
      'opacity:0;',
      'transition:opacity 0.4s ease 2s, background 0.2s;',
      'letter-spacing:0.05em;',
      '-webkit-tap-highlight-color:transparent;',
      'text-transform:uppercase;',
    '}',
    '#aqs-vs-skip.aqs-vs-in{opacity:1;}',
    '#aqs-vs-skip:active{background:rgba(255,255,255,0.2);}',

    '#aqs-vsplash.aqs-vs-fade{opacity:0;}',
  ].join('');
  document.head.appendChild(style);

  /* Build DOM */
  var splash = document.createElement('div');
  splash.id = 'aqs-vsplash';
  splash.innerHTML = [
    '<video id="aqs-vs-vid" src="' + VIDEO_SRC + '" playsinline muted preload="auto"></video>',

    '<div id="aqs-vs-overlay">',
      '<div id="aqs-vs-top">',
        '<div id="aqs-vs-logo-ring">',
          '<svg width="30" height="30" viewBox="0 0 36 36" fill="none">',
            '<polygon points="18,2 34,10 34,26 18,34 2,26 2,10" fill="white" opacity="0.95"/>',
            '<circle cx="18" cy="18" r="6" fill="#6366f1"/>',
          '</svg>',
        '</div>',
      '</div>',

      '<div id="aqs-vs-bottom">',
        '<div id="aqs-vs-app-name"><span>' + APP_NAME + '</span></div>',
        '<div id="aqs-vs-tagline">' + TAGLINE + '</div>',
        '<div id="aqs-vs-progress">',
          '<div id="aqs-vs-progress-fill"></div>',
        '</div>',
      '</div>',
    '</div>',

    '<button id="aqs-vs-skip">Skip</button>',
  ].join('');
  document.body.appendChild(splash);

  var vid     = document.getElementById('aqs-vs-vid');
  var fill    = document.getElementById('aqs-vs-progress-fill');
  var top     = document.getElementById('aqs-vs-top');
  var bottom  = document.getElementById('aqs-vs-bottom');
  var skipBtn = document.getElementById('aqs-vs-skip');
  var done    = false;
  var fallbackTimer = null;

  function dismiss() {
    if (done) return;
    done = true;
    clearTimeout(fallbackTimer);
    fill.style.transition = 'width 0.18s ease';
    fill.style.width = '100%';
    setTimeout(function () {
      splash.classList.add('aqs-vs-fade');
      setTimeout(function () {
        if (splash.parentNode) splash.parentNode.removeChild(splash);
      }, FADE_MS);
    }, 220);
  }

  function onReady() {
    vid.classList.add('aqs-vs-ready');
    top.classList.add('aqs-vs-in');
    bottom.classList.add('aqs-vs-in');
    skipBtn.classList.add('aqs-vs-in');
  }

  /* Track progress via timeupdate */
  vid.addEventListener('timeupdate', function () {
    if (!vid.duration || vid.duration === Infinity) return;
    var pct = Math.min(98, (vid.currentTime / vid.duration) * 100);
    fill.style.width = pct + '%';
  });

  vid.addEventListener('canplay', onReady);
  vid.addEventListener('playing', onReady);

  /* Dismiss ONLY when video ends naturally */
  vid.addEventListener('ended', function () {
    fill.style.width = '100%';
    setTimeout(dismiss, 100);
  });

  /* Fallback: if video never loads/plays within 12s, dismiss */
  fallbackTimer = setTimeout(dismiss, 12000);

  /* Skip button */
  skipBtn.addEventListener('click', dismiss);
  skipBtn.addEventListener('touchend', function (e) { e.preventDefault(); dismiss(); });

  /* Start playback */
  var playPromise = vid.play();
  if (playPromise && typeof playPromise.then === 'function') {
    playPromise.then(function () {
      onReady();
    }).catch(function () {
      /* Autoplay blocked — show branding overlay and use fallback timer */
      onReady();
      /* Animate progress bar over 5 seconds since we can't play the video */
      var t = 0;
      var iv = setInterval(function () {
        t += 100;
        var pct = Math.min(98, (t / 5000) * 100);
        fill.style.width = pct + '%';
        if (t >= 5000) { clearInterval(iv); dismiss(); }
      }, 100);
    });
  }

})();
