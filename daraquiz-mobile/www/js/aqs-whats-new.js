/**
 * aqs-whats-new.js
 * ─────────────────────────────────────────────────────────────────────────────
 * "WHAT'S NEW" SCREEN
 *
 * HOW IT WORKS:
 *   - When the app opens, it compares the LAST version the user saw
 *     against the current APK version (AQS_APP_VERSION_CODE from aqs-update-check.js)
 *   - If the version is NEW (they just installed an update) → shows a
 *     beautiful "What's New" popup with the release notes from version.json
 *   - Once seen, it won't show again until the NEXT update is installed
 *   - Brand new installs: silently records the version, no popup shown
 *
 * NO CHANGES NEEDED — this works automatically using the version code
 * already set in aqs-update-check.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

(function () {
  'use strict';

  var VERSION_JSON_URL =
    'https://raw.githubusercontent.com/darapet/smartquiz-system/main/daraquiz-mobile/www/version.json';

  var SEEN_KEY = 'aqs_last_seen_version_code';

  /* ── Inject styles ──────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '#aqs-wn-overlay{',
      'display:none;position:fixed;inset:0;z-index:99998;',
      'background:rgba(0,0,0,0.75);backdrop-filter:blur(8px);',
      '-webkit-backdrop-filter:blur(8px);',
      'align-items:flex-end;justify-content:center;',
      'padding:0 0 0 0;',
    '}',
    '#aqs-wn-overlay.aqs-wn-show{display:flex;}',

    '#aqs-wn-sheet{',
      'background:linear-gradient(160deg,#1e1b4b 0%,#12112a 100%);',
      'border:1px solid rgba(139,92,246,0.35);',
      'border-bottom:none;',
      'border-radius:24px 24px 0 0;',
      'padding:28px 26px 40px;',
      'width:100%;max-width:480px;',
      'box-shadow:0 -20px 60px rgba(0,0,0,0.6);',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'animation:aqs-wn-slide .4s cubic-bezier(.32,1.25,.55,1) both;',
      'position:relative;',
    '}',

    '@keyframes aqs-wn-slide{',
      'from{transform:translateY(100%);opacity:0}',
      'to{transform:translateY(0);opacity:1}',
    '}',

    '#aqs-wn-handle{',
      'width:40px;height:4px;',
      'background:rgba(255,255,255,0.2);',
      'border-radius:100px;',
      'margin:0 auto 20px;',
    '}',

    '#aqs-wn-badge{',
      'display:inline-flex;align-items:center;gap:6px;',
      'background:linear-gradient(135deg,rgba(124,58,237,0.3),rgba(79,70,229,0.3));',
      'border:1px solid rgba(139,92,246,0.4);',
      'border-radius:100px;padding:5px 14px;',
      'font-size:.75rem;font-weight:700;color:#c4b5fd;',
      'letter-spacing:.06em;text-transform:uppercase;',
      'margin-bottom:14px;',
    '}',

    '#aqs-wn-title{',
      'font-size:1.5rem;font-weight:900;color:#fff;',
      'margin:0 0 6px;letter-spacing:-.03em;line-height:1.2;',
    '}',

    '#aqs-wn-ver-line{',
      'font-size:.82rem;color:rgba(255,255,255,0.4);',
      'margin:0 0 20px;',
    '}',

    '#aqs-wn-divider{',
      'height:1px;background:rgba(255,255,255,0.08);margin:0 0 18px;',
    '}',

    '#aqs-wn-notes-wrap{',
      'margin-bottom:24px;',
      'max-height:180px;overflow-y:auto;',
      'scrollbar-width:thin;scrollbar-color:rgba(139,92,246,0.3) transparent;',
    '}',

    '#aqs-wn-notes-wrap::-webkit-scrollbar{width:4px;}',
    '#aqs-wn-notes-wrap::-webkit-scrollbar-track{background:transparent;}',
    '#aqs-wn-notes-wrap::-webkit-scrollbar-thumb{background:rgba(139,92,246,0.4);border-radius:4px;}',

    '.aqs-wn-note-item{',
      'display:flex;align-items:flex-start;gap:10px;',
      'padding:10px 14px;',
      'background:rgba(255,255,255,0.04);',
      'border:1px solid rgba(255,255,255,0.07);',
      'border-radius:12px;margin-bottom:8px;',
      'font-size:.88rem;color:rgba(255,255,255,0.8);line-height:1.5;',
    '}',

    '.aqs-wn-note-dot{',
      'width:8px;height:8px;min-width:8px;',
      'background:linear-gradient(135deg,#7c3aed,#4f46e5);',
      'border-radius:50%;margin-top:5px;',
      'box-shadow:0 0 8px rgba(124,58,237,0.6);',
    '}',

    '#aqs-wn-btn{',
      'display:block;width:100%;',
      'background:linear-gradient(135deg,#7c3aed,#4f46e5);',
      'color:#fff;border:none;border-radius:14px;',
      'padding:16px 20px;font-size:1rem;font-weight:700;',
      'cursor:pointer;',
      'box-shadow:0 4px 24px rgba(124,58,237,0.5);',
      'transition:transform .15s,box-shadow .15s;',
      'font-family:inherit;letter-spacing:.01em;',
    '}',
    '#aqs-wn-btn:hover{transform:translateY(-2px);box-shadow:0 8px 30px rgba(124,58,237,0.65);}',
    '#aqs-wn-btn:active{transform:translateY(0);}',
  ].join('');
  document.head.appendChild(style);

  /* ── Inject HTML ────────────────────────────────────────────────────────── */
  var overlay = document.createElement('div');
  overlay.id = 'aqs-wn-overlay';
  overlay.innerHTML = [
    '<div id="aqs-wn-sheet">',
      '<div id="aqs-wn-handle"></div>',
      '<div id="aqs-wn-badge">🎉 &nbsp;Just Updated</div>',
      '<h2 id="aqs-wn-title">What\'s New</h2>',
      '<p id="aqs-wn-ver-line">Version <span id="aqs-wn-ver">—</span> &nbsp;·&nbsp; <span id="aqs-wn-date">—</span></p>',
      '<div id="aqs-wn-divider"></div>',
      '<div id="aqs-wn-notes-wrap"></div>',
      '<button id="aqs-wn-btn">✓ &nbsp;Got it!</button>',
    '</div>',
  ].join('');
  document.body.appendChild(overlay);

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function buildNotes(notesText) {
    var wrap = document.getElementById('aqs-wn-notes-wrap');
    wrap.innerHTML = '';

    /* Split by newline or bullet/dash/• separators */
    var lines = notesText
      .split(/\n|•|\.\s+(?=[A-Z])/)
      .map(function (l) { return l.replace(/^[-•*]\s*/, '').trim(); })
      .filter(function (l) { return l.length > 2; });

    if (lines.length === 0) {
      lines = ['Bug fixes and performance improvements.'];
    }

    lines.forEach(function (line) {
      var item = document.createElement('div');
      item.className = 'aqs-wn-note-item';
      item.innerHTML = '<div class="aqs-wn-note-dot"></div><span>' + line + '</span>';
      wrap.appendChild(item);
    });
  }

  function showSheet(data) {
    document.getElementById('aqs-wn-ver').textContent  = data.version    || '';
    document.getElementById('aqs-wn-date').textContent = data.releaseDate || '';
    buildNotes(data.notes || 'Bug fixes and improvements.');
    overlay.classList.add('aqs-wn-show');
  }

  function hideSheet() {
    overlay.classList.remove('aqs-wn-show');
  }

  /* ── Dismiss button ─────────────────────────────────────────────────────── */
  document.getElementById('aqs-wn-btn').addEventListener('click', function () {
    hideSheet();
  });

  /* Tap outside the sheet to dismiss */
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) hideSheet();
  });

  /* ── Main logic ─────────────────────────────────────────────────────────── */
  function runWhatsNew() {
    /* AQS_APP_VERSION_CODE is set in aqs-update-check.js (must load first) */
    var currentCode = (typeof AQS_APP_VERSION_CODE !== 'undefined')
      ? AQS_APP_VERSION_CODE : 0;

    if (!currentCode) return; /* safety: can't compare if unknown */

    var lastSeen = parseInt(localStorage.getItem(SEEN_KEY) || '0', 10);

    /* Brand-new install: just record silently, no popup */
    if (lastSeen === 0) {
      localStorage.setItem(SEEN_KEY, String(currentCode));
      console.log('[AQS-WN] First install — recorded version', currentCode);
      return;
    }

    /* Same version as last time — nothing to show */
    if (lastSeen >= currentCode) {
      console.log('[AQS-WN] Already seen version', currentCode);
      return;
    }

    /* User just updated! Fetch notes and show the sheet */
    console.log('[AQS-WN] Updated from', lastSeen, '→', currentCode, '— showing What\'s New');

    fetch(VERSION_JSON_URL + '?_=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        /* Mark as seen before showing (in case user kills app mid-popup) */
        localStorage.setItem(SEEN_KEY, String(currentCode));
        showSheet(data);
      })
      .catch(function (err) {
        /* If fetch fails, still mark as seen so it doesn't loop */
        localStorage.setItem(SEEN_KEY, String(currentCode));
        console.warn('[AQS-WN] Could not fetch notes:', err.message || err);
      });
  }

  /* Wait 2.5s after app opens (after splash, before update check) */
  setTimeout(runWhatsNew, 2500);

})();
