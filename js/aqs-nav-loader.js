/**
 * aqs-nav-loader.js — Page transition skeleton loader
 * ─────────────────────────────────────────────────────
 * • Shows a shimmer skeleton screen when the page starts loading
 * • Hides it smoothly once the page is ready
 * • Shows it again when the user taps a nav link (instant feedback)
 * • Skipped on index.html (which has its own splash screen)
 */
(function () {
  'use strict';

  var isIndex = (function () {
    var p = location.pathname;
    return p.endsWith('index.html') || p === '/' ||
           p.endsWith('/www/') || p.endsWith('/www');
  })();

  /* ── Inject styles ─────────────────────────────────────────────────── */
  var css = [
    '#_aqsNL{position:fixed;inset:0;z-index:99998;',
      'background:linear-gradient(155deg,#0f0c1d 0%,#1a1640 55%,#0f0c1d 100%);',
      'display:flex;flex-direction:column;align-items:center;',
      'padding-top:72px;opacity:1;pointer-events:all;',
      'transition:opacity .3s ease;}',
    '#_aqsNL.nl-out{opacity:0;pointer-events:none;}',

    /* Top progress bar */
    '#_aqsNLProg{position:absolute;top:0;left:0;height:3px;width:0%;',
      'background:linear-gradient(90deg,#6366f1 0%,#a855f7 50%,#6366f1 100%);',
      'background-size:200% 100%;',
      'border-radius:0 3px 3px 0;',
      'animation:_nlProgGrow 2.2s ease-out forwards,_nlProgShine 1.3s linear infinite;}',
    '@keyframes _nlProgGrow{0%{width:0%}30%{width:45%}70%{width:78%}100%{width:88%}}',
    '@keyframes _nlProgShine{0%{background-position:100% 0}100%{background-position:-100% 0}}',

    /* Logo */
    '#_aqsNLLogo{display:flex;align-items:center;gap:10px;margin-bottom:32px;',
      'opacity:.9;}',
    '#_aqsNLLogoIcon{width:36px;height:36px;border-radius:10px;',
      'background:rgba(99,102,241,.18);border:1.5px solid rgba(99,102,241,.35);',
      'display:flex;align-items:center;justify-content:center;}',
    '#_aqsNLLogoTxt{font-size:16px;font-weight:800;color:#e0e7ff;',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'letter-spacing:-.02em;}',

    /* Skeleton container */
    '#_aqsNLSkel{width:calc(100% - 48px);max-width:420px;',
      'display:flex;flex-direction:column;gap:11px;}',

    /* Individual skeleton bars */
    '._nlBar{border-radius:8px;',
      'background:linear-gradient(90deg,',
        'rgba(255,255,255,.05) 0%,',
        'rgba(255,255,255,.11) 50%,',
        'rgba(255,255,255,.05) 100%);',
      'background-size:200% 100%;',
      'animation:_nlShim 1.5s ease-in-out infinite;}',
    '@keyframes _nlShim{0%{background-position:200% 0}100%{background-position:-200% 0}}',

    /* Bar height and width variants */
    '._nlBar:nth-child(1){height:16px;width:72%;}',
    '._nlBar:nth-child(2){height:11px;width:46%;opacity:.7;}',
    '._nlBar:nth-child(3){height:14px;width:88%;margin-top:6px;}',
    '._nlBar:nth-child(4){height:14px;width:64%;}',
    '._nlBar:nth-child(5){height:14px;width:78%;}',
    '._nlBar:nth-child(6){height:11px;width:52%;opacity:.7;}',

    /* Stagger shimmer so each bar shines at a slightly different time */
    '._nlBar:nth-child(2){animation-delay:.1s;}',
    '._nlBar:nth-child(3){animation-delay:.2s;}',
    '._nlBar:nth-child(4){animation-delay:.3s;}',
    '._nlBar:nth-child(5){animation-delay:.15s;}',
    '._nlBar:nth-child(6){animation-delay:.25s;}',

    /* Destination hint */
    '#_aqsNLHint{margin-top:26px;font-size:11px;font-weight:600;',
      'color:rgba(255,255,255,.18);letter-spacing:.07em;text-transform:uppercase;',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;}',
  ].join('');

  var styleEl = document.createElement('style');
  styleEl.id = '_aqsNLStyle';
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ── Build overlay DOM ─────────────────────────────────────────────── */
  var overlay = document.createElement('div');
  overlay.id = '_aqsNL';
  overlay.innerHTML =
    '<div id="_aqsNLProg"></div>' +
    '<div id="_aqsNLLogo">' +
      '<div id="_aqsNLLogoIcon">' +
        '<svg width="20" height="20" viewBox="0 0 36 36" fill="none">' +
          '<polygon points="18,2 34,10 34,26 18,34 2,26 2,10" fill="#1e1b4b" stroke="#6366f1" stroke-width="2.5"/>' +
          '<circle cx="18" cy="18" r="6" fill="#6366f1"/>' +
        '</svg>' +
      '</div>' +
      '<span id="_aqsNLLogoTxt">xzily AI</span>' +
    '</div>' +
    '<div id="_aqsNLSkel">' +
      '<div class="_nlBar"></div>' +
      '<div class="_nlBar"></div>' +
      '<div class="_nlBar"></div>' +
      '<div class="_nlBar"></div>' +
      '<div class="_nlBar"></div>' +
      '<div class="_nlBar"></div>' +
    '</div>' +
    '<div id="_aqsNLHint">Loading…</div>';

  /* ── Mount ─────────────────────────────────────────────────────────── */
  function mount() {
    if (isIndex || overlay.parentNode) return;
    var body = document.body || document.documentElement;
    body.insertBefore(overlay, body.firstChild);
  }

  if (document.body) {
    mount();
  } else {
    document.addEventListener('DOMContentLoaded', mount);
  }

  /* ── Hide (smooth fade-out once page ready) ────────────────────────── */
  function hide() {
    if (!overlay.parentNode) return;
    var prog = document.getElementById('_aqsNLProg');
    if (prog) {
      prog.style.animation = 'none';
      prog.style.transition = 'width .18s ease';
      prog.style.width = '100%';
    }
    setTimeout(function () {
      overlay.classList.add('nl-out');
      setTimeout(function () {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 320);
    }, 120);
  }

  /* ── Show (on nav click — instant transition feel) ─────────────────── */
  function show(hintText) {
    var hint = document.getElementById('_aqsNLHint');
    if (hint) hint.textContent = hintText || 'Loading…';
    var prog = document.getElementById('_aqsNLProg');
    if (prog) {
      prog.style.cssText = '';
    }
    overlay.classList.remove('nl-out');
    if (!overlay.parentNode) mount();
  }

  /* ── Auto-hide when page is fully ready ────────────────────────────── */
  if (!isIndex) {
    if (document.readyState === 'complete') {
      setTimeout(hide, 60);
    } else {
      window.addEventListener('load', function () { setTimeout(hide, 60); });
    }
  }

  /* ── Intercept nav link clicks ──────────────────────────────────────── */
  var PAGE_LABELS = {
    'index':          'Home',
    'studio':         'AI Studio',
    'dashboard':      'Dashboard',
    'user-dashboard': 'My Dashboard',
    'create-quiz':    'Create Quiz',
    'challenge':      'Challenge',
    'study':          'AI Study',
    'studyhub':       'Study Hub',
    'text-to-docs':   'Word Processor',
    'docs-gen':       'AI Docs Generator',
    'image-gen':      'Image Creator',
    'image-editor':   'Image Editor',
    'tts':            'Text to Speech',
    'profile':        'Profile',
    'quiz-results':   'Results',
    'quiz-manage':    'Manage Quiz',
    'puzzle':         'Puzzle',
  };

  document.addEventListener('click', function (e) {
    var anchor = e.target.closest('a[href]');
    if (!anchor) return;
    var href = anchor.getAttribute('href') || '';
    if (href.charAt(0) === '#' ||
        href.indexOf('javascript') === 0 ||
        href.indexOf('mailto') === 0 ||
        href.indexOf('http') === 0 ||
        anchor.target === '_blank') return;

    var slug = href.replace(/\?.*$/, '').replace(/#.*$/, '')
                   .replace(/\.html$/, '').replace(/^.*\//, '');
    var label = PAGE_LABELS[slug] || (slug.charAt(0).toUpperCase() + slug.slice(1).replace(/-/g, ' '));
    show(label + '…');
  }, true);

  window.aqsNavLoader = { show: show, hide: hide };
})();
