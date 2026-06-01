/**
 * aqs-update-check.js
 * ─────────────────────────────────────────────────────────────────────────────
 * IN-APP UPDATE CHECKER
 *
 * HOW IT WORKS:
 *   1. App opens → waits 4 seconds (lets splash screen finish)
 *   2. Fetches version.json from GitHub to get the latest version info
 *   3. Compares the remote versionCode with AQS_APP_VERSION_CODE below
 *   4. If remote is newer → shows a beautiful update popup
 *   5. User taps "Update Now" → opens the APK download link
 *   6. User taps "Remind Me Later" → waits 24 hours before asking again
 *
 * THE ONLY THING YOU EVER NEED TO CHANGE:
 *   When you build a new APK, update AQS_APP_VERSION_CODE below to match
 *   the new versionCode you pushed via admin-update.html.
 *   e.g. if you pushed versionCode 6, set AQS_APP_VERSION_CODE = 6
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ══ CHANGE THIS NUMBER EVERY TIME YOU INSTALL A NEW APK ═══════════════════ */
var AQS_APP_VERSION_CODE = 6;
/* ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var VERSION_JSON_URL =
    'https://raw.githubusercontent.com/darapet/smartquiz-system/main/daraquiz-mobile/www/version.json';

  var REMIND_KEY  = 'aqs_update_remind_time';
  var REMIND_WAIT = 24 * 60 * 60 * 1000; /* 24 hours in ms */

  /* ── Inject styles ──────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '#aqs-upd-overlay{',
      'display:none;position:fixed;inset:0;z-index:99999;',
      'background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);',
      '-webkit-backdrop-filter:blur(6px);',
      'align-items:center;justify-content:center;padding:20px;',
    '}',
    '#aqs-upd-overlay.aqs-upd-show{display:flex;}',

    '#aqs-upd-card{',
      'background:linear-gradient(145deg,#1e1b4b,#1a1035);',
      'border:1px solid rgba(139,92,246,0.4);',
      'border-radius:22px;',
      'padding:32px 28px 28px;',
      'max-width:360px;width:100%;',
      'box-shadow:0 0 0 1px rgba(139,92,246,0.2),0 30px 80px rgba(0,0,0,0.7);',
      'position:relative;',
      'text-align:center;',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'animation:aqs-upd-pop .35s cubic-bezier(.34,1.56,.64,1) both;',
    '}',

    '@keyframes aqs-upd-pop{',
      'from{opacity:0;transform:scale(.82) translateY(20px)}',
      'to{opacity:1;transform:scale(1) translateY(0)}',
    '}',

    '#aqs-upd-close{',
      'position:absolute;top:14px;right:16px;',
      'background:rgba(255,255,255,0.08);border:none;',
      'color:rgba(255,255,255,0.5);font-size:1.2rem;',
      'width:30px;height:30px;border-radius:50%;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;',
      'transition:background .15s,color .15s;',
    '}',
    '#aqs-upd-close:hover{background:rgba(255,255,255,0.15);color:#fff;}',

    '#aqs-upd-icon{font-size:3rem;margin-bottom:14px;line-height:1;}',

    '#aqs-upd-title{',
      'font-size:1.25rem;font-weight:800;color:#fff;',
      'margin:0 0 6px;letter-spacing:-.02em;',
    '}',

    '#aqs-upd-ver{',
      'display:inline-flex;align-items:center;gap:6px;',
      'background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.35);',
      'border-radius:100px;padding:4px 14px;',
      'font-size:.78rem;font-weight:700;color:#c4b5fd;',
      'margin-bottom:14px;letter-spacing:.03em;',
    '}',

    '#aqs-upd-notes{',
      'font-size:.88rem;color:rgba(255,255,255,0.65);',
      'line-height:1.6;margin:0 0 22px;',
      'background:rgba(255,255,255,0.05);',
      'border-radius:10px;padding:12px 14px;',
      'text-align:left;',
    '}',

    '#aqs-upd-btn-now{',
      'display:block;width:100%;',
      'background:linear-gradient(135deg,#7c3aed,#4f46e5);',
      'color:#fff;border:none;border-radius:12px;',
      'padding:15px 20px;font-size:1rem;font-weight:700;',
      'cursor:pointer;margin-bottom:10px;',
      'box-shadow:0 4px 20px rgba(124,58,237,0.5);',
      'transition:transform .15s,box-shadow .15s;',
      'font-family:inherit;',
    '}',
    '#aqs-upd-btn-now:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(124,58,237,0.65);}',
    '#aqs-upd-btn-now:active{transform:translateY(0);}',

    '#aqs-upd-btn-later{',
      'display:block;width:100%;',
      'background:transparent;color:rgba(255,255,255,0.45);',
      'border:none;font-size:.85rem;cursor:pointer;',
      'padding:8px;font-family:inherit;',
      'transition:color .15s;',
    '}',
    '#aqs-upd-btn-later:hover{color:rgba(255,255,255,0.7);}',
  ].join('');
  document.head.appendChild(style);

  /* ── Inject HTML ────────────────────────────────────────────────────────── */
  var overlay = document.createElement('div');
  overlay.id = 'aqs-upd-overlay';
  overlay.innerHTML = [
    '<div id="aqs-upd-card">',
      '<button id="aqs-upd-close" title="Close">✕</button>',
      '<div id="aqs-upd-icon">🚀</div>',
      '<h2 id="aqs-upd-title">Update Available!</h2>',
      '<div id="aqs-upd-ver">✨ Version <span id="aqs-upd-ver-num">—</span></div>',
      '<p id="aqs-upd-notes">Loading…</p>',
      '<button id="aqs-upd-btn-now">⬇️ Download Update</button>',
      '<button id="aqs-upd-btn-later">Remind me later</button>',
    '</div>',
  ].join('');
  document.body.appendChild(overlay);

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function showPopup(data) {
    document.getElementById('aqs-upd-ver-num').textContent  = data.version || '';
    document.getElementById('aqs-upd-notes').textContent    = data.notes   || 'Bug fixes and improvements.';
    overlay.classList.add('aqs-upd-show');
  }

  function hidePopup() {
    overlay.classList.remove('aqs-upd-show');
  }

  function openDownload(url) {
    if (!url || url.indexOf('admin-update') !== -1) {
      alert('⚠️ Download link not configured yet. Please contact the developer.');
      return;
    }
    /* Open in system browser so Android can download the APK */
    try {
      if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Browser) {
        window.Capacitor.Plugins.Browser.open({ url: url });
      } else {
        window.open(url, '_system') || window.open(url, '_blank');
      }
    } catch (e) {
      window.open(url, '_blank');
    }
  }

  /* ── Button events ──────────────────────────────────────────────────────── */
  var _apkUrl = '';

  document.getElementById('aqs-upd-close').addEventListener('click', function () {
    hidePopup();
    /* Dismissed for this session — don't ask again until app is restarted */
  });

  document.getElementById('aqs-upd-btn-now').addEventListener('click', function () {
    openDownload(_apkUrl);
    hidePopup();
  });

  document.getElementById('aqs-upd-btn-later').addEventListener('click', function () {
    /* Remind in 24 hours */
    localStorage.setItem(REMIND_KEY, String(Date.now()));
    hidePopup();
  });

  /* ── Main check ─────────────────────────────────────────────────────────── */
  function runCheck() {
    /* Skip if user chose "Later" within the last 24 hours */
    var remindTime = parseInt(localStorage.getItem(REMIND_KEY) || '0', 10);
    if (remindTime && (Date.now() - remindTime) < REMIND_WAIT) {
      console.log('[AQS-UPD] Skipping — user snoozed update.');
      return;
    }

    fetch(VERSION_JSON_URL + '?_=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        var remoteCode = parseInt(data.versionCode, 10) || 0;
        console.log('[AQS-UPD] Local:', AQS_APP_VERSION_CODE, '| Remote:', remoteCode);

        if (remoteCode > AQS_APP_VERSION_CODE) {
          _apkUrl = data.apkUrl || data.downloadUrl || '';
          showPopup(data);
        }
      })
      .catch(function (err) {
        /* Silent fail — never block the user if update check fails */
        console.warn('[AQS-UPD] Check failed:', err.message || err);
      });
  }

  /* Wait for splash to finish before checking (4 seconds) */
  setTimeout(runCheck, 4000);

})();
