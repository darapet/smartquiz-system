/**
 * aqs-update-check.js
 * ─────────────────────────────────────────────────────────────────────────────
 * IN-APP UPDATE CHECKER — downloads APK inside the app, no browser needed.
 *
 * HOW IT WORKS:
 *   1. App opens → waits 4 seconds (lets splash screen finish)
 *   2. Fetches version.json from GitHub to get the latest version info
 *   3. Compares the remote versionCode with AQS_APP_VERSION_CODE below
 *   4. If remote is newer → shows update popup
 *   5. On Android: uses native DownloadManager bridge for in-app download + progress
 *   6. When download completes → Android installer is triggered automatically
 *   7. User taps "Remind Me Later" → waits 24 hours before asking again
 * ─────────────────────────────────────────────────────────────────────────────
 */

/* ══ CHANGE THIS NUMBER EVERY TIME YOU INSTALL A NEW APK ═══════════════════ */
var AQS_APP_VERSION_CODE = 124;
/* ══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var VERSION_JSON_URL =
    'https://raw.githubusercontent.com/darapet/smartquiz-system/main/daraquiz-mobile/www/version.json';

  var DISMISSED_KEY = 'aqs_update_dismissed_ver';  /* set only after download starts */
  var SNOOZE_KEY    = 'aqs_update_snooze_time';    /* set when user taps X or Remind me later */
  var SNOOZE_VER_KEY = 'aqs_update_snooze_ver';    /* which versionCode was snoozed */
  var SNOOZE_WAIT   = 24 * 60 * 60 * 1000;         /* 24 hours */

  /* ── Inject styles ────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '#aqs-upd-overlay{display:none;position:fixed;inset:0;z-index:99999;',
      'background:rgba(0,0,0,0.72);backdrop-filter:blur(6px);',
      '-webkit-backdrop-filter:blur(6px);',
      'align-items:center;justify-content:center;padding:20px;}',
    '#aqs-upd-overlay.aqs-upd-show{display:flex;}',

    '#aqs-upd-card{background:linear-gradient(145deg,#1e1b4b,#1a1035);',
      'border:1px solid rgba(139,92,246,0.4);border-radius:22px;',
      'padding:32px 28px 28px;max-width:360px;width:100%;',
      'box-shadow:0 0 0 1px rgba(139,92,246,0.2),0 30px 80px rgba(0,0,0,0.7);',
      'position:relative;text-align:center;',
      'font-family:-apple-system,BlinkMacSystemFont,"Inter","Segoe UI",sans-serif;',
      'animation:aqs-upd-pop .35s cubic-bezier(.34,1.56,.64,1) both;}',

    '@keyframes aqs-upd-pop{',
      'from{opacity:0;transform:scale(.82) translateY(20px)}',
      'to{opacity:1;transform:scale(1) translateY(0)}}',

    '#aqs-upd-close{position:absolute;top:14px;right:16px;',
      'background:rgba(255,255,255,0.08);border:none;',
      'color:rgba(255,255,255,0.5);font-size:1.2rem;',
      'width:30px;height:30px;border-radius:50%;cursor:pointer;',
      'display:flex;align-items:center;justify-content:center;',
      'transition:background .15s,color .15s;}',
    '#aqs-upd-close:hover{background:rgba(255,255,255,0.15);color:#fff;}',

    '#aqs-upd-icon{font-size:3rem;margin-bottom:14px;line-height:1;}',

    '#aqs-upd-title{font-size:1.25rem;font-weight:800;color:#fff;',
      'margin:0 0 6px;letter-spacing:-.02em;}',

    '#aqs-upd-ver{display:inline-flex;align-items:center;gap:6px;',
      'background:rgba(139,92,246,0.2);border:1px solid rgba(139,92,246,0.35);',
      'border-radius:100px;padding:4px 14px;',
      'font-size:.78rem;font-weight:700;color:#c4b5fd;',
      'margin-bottom:14px;letter-spacing:.03em;}',

    '#aqs-upd-notes{font-size:.88rem;color:rgba(255,255,255,0.65);',
      'line-height:1.6;margin:0 0 22px;',
      'background:rgba(255,255,255,0.05);',
      'border-radius:10px;padding:12px 14px;text-align:left;}',

    '#aqs-upd-btn-now{display:block;width:100%;',
      'background:linear-gradient(135deg,#7c3aed,#4f46e5);',
      'color:#fff;border:none;border-radius:12px;',
      'padding:15px 20px;font-size:1rem;font-weight:700;',
      'cursor:pointer;margin-bottom:10px;',
      'box-shadow:0 4px 20px rgba(124,58,237,0.5);',
      'transition:transform .15s,box-shadow .15s;font-family:inherit;}',
    '#aqs-upd-btn-now:hover{transform:translateY(-2px);box-shadow:0 8px 28px rgba(124,58,237,0.65);}',
    '#aqs-upd-btn-now:disabled{opacity:0.6;cursor:not-allowed;transform:none;}',

    '#aqs-upd-btn-later{display:block;width:100%;',
      'background:transparent;color:rgba(255,255,255,0.45);',
      'border:none;font-size:.85rem;cursor:pointer;',
      'padding:8px;font-family:inherit;transition:color .15s;}',
    '#aqs-upd-btn-later:hover{color:rgba(255,255,255,0.7);}',

    '#aqs-upd-progress-wrap{display:none;margin-bottom:16px;}',
    '#aqs-upd-progress-wrap.aqs-upd-dl-active{display:block;}',
    '#aqs-upd-progress-label{font-size:.82rem;color:rgba(255,255,255,0.6);',
      'margin-bottom:8px;text-align:left;}',
    '#aqs-upd-progress-track{width:100%;height:8px;',
      'background:rgba(255,255,255,0.1);border-radius:99px;overflow:hidden;}',
    '#aqs-upd-progress-fill{height:100%;width:0%;border-radius:99px;',
      'background:linear-gradient(90deg,#7c3aed,#6366f1);',
      'transition:width .3s ease;}',
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
      '<div id="aqs-upd-progress-wrap">',
        '<div id="aqs-upd-progress-label">Downloading… 0%</div>',
        '<div id="aqs-upd-progress-track">',
          '<div id="aqs-upd-progress-fill"></div>',
        '</div>',
      '</div>',
      '<button id="aqs-upd-btn-now">⬇️ Download Update</button>',
      '<button id="aqs-upd-btn-later">Remind me later</button>',
    '</div>',
  ].join('');
  document.body.appendChild(overlay);

  /* ── Helpers ────────────────────────────────────────────────────────────── */
  function showPopup(data) {
    document.getElementById('aqs-upd-ver-num').textContent = data.version || '';
    document.getElementById('aqs-upd-notes').textContent   = data.notes   || 'Bug fixes and improvements.';
    overlay.classList.add('aqs-upd-show');
  }

  function hidePopup() {
    overlay.classList.remove('aqs-upd-show');
    document.getElementById('aqs-upd-progress-wrap').classList.remove('aqs-upd-dl-active');
    document.getElementById('aqs-upd-progress-fill').style.width = '0%';
    document.getElementById('aqs-upd-progress-label').textContent = 'Downloading… 0%';
    document.getElementById('aqs-upd-btn-now').disabled = false;
    document.getElementById('aqs-upd-btn-now').textContent = '⬇️ Download Update';
    document.getElementById('aqs-upd-btn-later').style.display = '';
    window.aqsNativeProgress = null;
  }

  function setProgress(pct) {
    document.getElementById('aqs-upd-progress-fill').style.width  = pct + '%';
    document.getElementById('aqs-upd-progress-label').textContent = 'Downloading… ' + pct + '%';
  }

  /* ── Native Android bridge download (no browser) ────────────────────────── */
  function downloadNative(url) {
    var btn      = document.getElementById('aqs-upd-btn-now');
    var btnLater = document.getElementById('aqs-upd-btn-later');
    var progWrap = document.getElementById('aqs-upd-progress-wrap');

    btn.disabled = true;
    btn.textContent = '⏳ Starting download…';
    btnLater.style.display = 'none';
    progWrap.classList.add('aqs-upd-dl-active');
    setProgress(0);

    /* Progress callback invoked by MainActivity.java */
    window.aqsNativeProgress = function (pct) {
      if (pct < 0) {
        /* Error */
        btn.disabled = false;
        btn.textContent = '⬇️ Retry Download';
        btnLater.style.display = '';
        progWrap.classList.remove('aqs-upd-dl-active');
        alert('Download failed. Please check your connection and try again.');
        return;
      }
      setProgress(pct);
      if (pct >= 100) {
        btn.textContent = '✅ Installing…';
        setTimeout(hidePopup, 4000);
      }
    };

    /* Call native bridge — MainActivity registers this on the WebView */
    window.AqsDownloadBridge.startDownload(url, 'daraquiz-update.apk');
  }

  /* ── Download dispatcher — native bridge only, no browser fallback ──────── */
  function downloadInApp(url) {
    var btn      = document.getElementById('aqs-upd-btn-now');
    var btnLater = document.getElementById('aqs-upd-btn-later');

    /* Try native bridge immediately */
    if (window.AqsDownloadBridge && typeof window.AqsDownloadBridge.startDownload === 'function') {
      downloadNative(url);
      return;
    }

    /* Bridge not ready yet — wait up to 3 seconds then retry */
    var waited = 0;
    var interval = setInterval(function () {
      waited += 200;
      if (window.AqsDownloadBridge && typeof window.AqsDownloadBridge.startDownload === 'function') {
        clearInterval(interval);
        downloadNative(url);
        return;
      }
      if (waited >= 3000) {
        clearInterval(interval);
        btn.disabled = false;
        btn.textContent = '⬇️ Download Update';
        btnLater.style.display = '';
        alert('Download not ready yet. Please close and reopen the app, then try again.');
      }
    }, 200);
  }

  /* ── Button events ──────────────────────────────────────────────────────── */
  var _apkUrl = '';

  /* Snooze — show again in 24 h (user hasn't downloaded yet) */
  function snoozeUpdate() {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
    localStorage.setItem(SNOOZE_VER_KEY, String(_remoteCode));  /* remember WHICH version was snoozed */
    hidePopup();
  }

  /* Permanent dismiss — only called once download actually starts */
  function permanentDismiss() {
    localStorage.setItem(DISMISSED_KEY, String(_remoteCode));
    localStorage.removeItem(SNOOZE_KEY);
  }

  document.getElementById('aqs-upd-close').addEventListener('click', snoozeUpdate);

  document.getElementById('aqs-upd-btn-now').addEventListener('click', function () {
    if (!_apkUrl || _apkUrl.indexOf('releases/latest') !== -1) {
      alert('⚠️ Download link not ready yet. Please try again in a few minutes.');
      return;
    }
    permanentDismiss();
    downloadInApp(_apkUrl);
  });

  document.getElementById('aqs-upd-btn-later').addEventListener('click', snoozeUpdate);

  /* ── Main check ─────────────────────────────────────────────────────────── */
  var _remoteCode = 0;

  function runCheck() {
    fetch(VERSION_JSON_URL + '?_=' + Date.now())
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        _remoteCode = parseInt(data.versionCode, 10) || 0;
        console.log('[AQS-UPD] Local:', AQS_APP_VERSION_CODE, '| Remote:', _remoteCode);

        /* No update needed — already on latest */
        if (_remoteCode <= AQS_APP_VERSION_CODE) return;

        /* Permanently dismissed only if user downloaded AND is actually on that version.
           If they dismissed but still have an older build, treat as snoozed instead. */
        var dismissedVer = parseInt(localStorage.getItem(DISMISSED_KEY) || '0', 10);
        if (dismissedVer >= _remoteCode && AQS_APP_VERSION_CODE >= dismissedVer) {
          console.log('[AQS-UPD] Already installed v' + _remoteCode);
          return;
        }

        /* User tapped X or Remind me later — snooze for 24 h then show again.
           BUT if a NEWER version came out since the snooze, skip the wait and show immediately. */
        var snoozeTime = parseInt(localStorage.getItem(SNOOZE_KEY) || '0', 10);
        var snoozeVer  = parseInt(localStorage.getItem(SNOOZE_VER_KEY) || '0', 10);
        var withinSnoozeWindow = snoozeTime && (Date.now() - snoozeTime) < SNOOZE_WAIT;
        var snoozedSameVersion = snoozeVer === _remoteCode;
        if (withinSnoozeWindow && snoozedSameVersion) {
          console.log('[AQS-UPD] Snoozed — will remind again in 24 h');
          return;
        }

        _apkUrl = data.apkUrl || data.downloadUrl || '';
        showPopup(data);
      })
      .catch(function (err) {
        console.warn('[AQS-UPD] Check failed:', err.message || err);
      });
  }

  setTimeout(runCheck, 4000);

})();
