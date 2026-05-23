/* ============================================================
   XZILY AI — Shared Notifications Bar (Ticker + Countdown)
   Auto-injects ticker and countdown HTML on every page.
   Admin configures via admin panel → saved to Firestore
   settings/notifications document.
   Include this script on every page AFTER aqs-firebase.js.

   Layout:
   - Countdown : position:fixed; TOP of page (banner)
   - Ticker    : position:fixed; BOTTOM of page (scrolling text footer)
   ============================================================ */
(function () {
    'use strict';

    /* ── Inject required CSS ──────────────────────────────────── */
    var style = document.createElement('style');
    style.id = 'aqs-notifs-bar-css';
    style.textContent = [
        /* ── COUNTDOWN — top banner ── */
        '#aqs-countdown-bar{display:none;text-align:center;padding:8px 20px;font-size:.88rem;position:fixed;top:0;left:0;right:0;z-index:9990;border-bottom:1px solid rgba(255,255,255,.15);}',
        '#aqs-countdown-bar .aqs-cd-label{font-weight:700;margin-right:12px;opacity:.9;}',
        '#aqs-countdown-digits{display:inline-flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums;}',
        '.aqs-cd-block{background:rgba(255,255,255,.18);border-radius:6px;padding:3px 9px;font-size:1rem;font-weight:800;min-width:40px;text-align:center;}',
        '.aqs-cd-sep{opacity:.6;font-weight:300;font-size:1rem;}',

        /* ── NEWS TICKER — scrolling bottom footer ── */
        '#aqs-news-ticker-bar{display:none;overflow:hidden;height:36px;line-height:36px;font-size:.82rem;font-weight:500;position:fixed;bottom:0;left:0;right:0;z-index:9989;border-top:1px solid rgba(255,255,255,.12);}',
        '#aqs-news-ticker-bar .aqs-ticker-label{display:inline-flex;align-items:center;height:36px;padding:0 14px;font-weight:700;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;flex-shrink:0;position:relative;z-index:2;}',
        '#aqs-ticker-scroll-wrap{overflow:hidden;flex:1;display:inline-block;vertical-align:top;}',
        '#aqs-ticker-track{display:inline-block;white-space:nowrap;padding-left:100%;animation:aqsTickerScroll 35s linear infinite;}',
        '#aqs-ticker-track:hover{animation-play-state:paused;}',
        '@keyframes aqsTickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}',

        /* ── Responsive ── */
        '@media(max-width:480px){#aqs-news-ticker-bar{height:30px;line-height:30px;font-size:.75rem;}#aqs-news-ticker-bar .aqs-ticker-label{font-size:.7rem;padding:0 10px;}#aqs-countdown-bar{font-size:.8rem;padding:6px 10px;}.aqs-cd-block{font-size:.82rem;padding:2px 7px;min-width:32px;}}'
    ].join('');
    document.head.appendChild(style);

    /* ── Build HTML elements ─────────────────────────────────── */
    function buildBars() {
        /* Countdown bar — top fixed banner */
        var cdBar = document.createElement('div');
        cdBar.id = 'aqs-countdown-bar';
        cdBar.innerHTML =
            '<span class="aqs-cd-label" id="aqs-cd-label-text">Upcoming Event</span>' +
            '<span id="aqs-countdown-digits">' +
            '<span class="aqs-cd-block" id="aqs-cd-days">00d</span>' +
            '<span class="aqs-cd-sep">:</span>' +
            '<span class="aqs-cd-block" id="aqs-cd-hours">00h</span>' +
            '<span class="aqs-cd-sep">:</span>' +
            '<span class="aqs-cd-block" id="aqs-cd-mins">00m</span>' +
            '<span class="aqs-cd-sep">:</span>' +
            '<span class="aqs-cd-block" id="aqs-cd-secs">00s</span>' +
            '</span>';

        /* Ticker bar — scrolling text fixed at bottom */
        var tickerBar = document.createElement('div');
        tickerBar.id = 'aqs-news-ticker-bar';
        tickerBar.innerHTML =
            '<span class="aqs-ticker-label" id="aqs-ticker-label">📢 NEWS</span>' +
            '<div id="aqs-ticker-scroll-wrap"><span id="aqs-ticker-track"></span></div>';

        /* Countdown goes at body top, ticker at body bottom */
        document.body.insertBefore(cdBar, document.body.firstChild);
        document.body.appendChild(tickerBar);
    }

    /* ── Add body padding so content isn't hidden behind fixed bars ── */
    function _updateBodyPadding() {
        var ticker = document.getElementById('aqs-news-ticker-bar');
        var cd     = document.getElementById('aqs-countdown-bar');

        if (ticker && ticker.style.display !== 'none') {
            var exB = parseInt(window.getComputedStyle(document.body).paddingBottom) || 0;
            document.body.style.paddingBottom = Math.max(exB, 42) + 'px';
        }
        if (cd && cd.style.display !== 'none') {
            var exT = parseInt(window.getComputedStyle(document.body).paddingTop) || 0;
            document.body.style.paddingTop = Math.max(exT, 50) + 'px';
        }
    }

    /* ── Ticker logic — scrolling text ───────────────────────── */
    function startTicker(text, speed, label, bg, color) {
        var bar   = document.getElementById('aqs-news-ticker-bar');
        var track = document.getElementById('aqs-ticker-track');
        var lbl   = document.getElementById('aqs-ticker-label');
        if (!bar || !track || !text) return;

        /* Apply admin colours */
        bar.style.background = bg    || '#1e1b4b';
        bar.style.color      = color || '#e0e7ff';
        if (lbl) {
            lbl.style.background = bg    || '#1e1b4b';
            lbl.style.color      = color || '#e0e7ff';
            lbl.style.filter     = 'brightness(1.3)';
            lbl.textContent      = label || '📢 NEWS';
        }

        /* Build scrolling text — repeat 3× so it loops seamlessly */
        var msgs = text.split('·').map(function(s){ return s.trim(); }).filter(Boolean);
        if (!msgs.length) msgs = [text];
        var fullText = msgs.join('   ·   ') + '          ';
        track.textContent = fullText + fullText + fullText;

        /* Speed: admin setting (words per minute-ish) → animation duration */
        var spd = parseInt(speed) || 40;
        var dur = Math.round(track.textContent.length * 8 / spd);
        dur = Math.max(10, Math.min(180, dur));
        track.style.animationDuration = dur + 's';

        bar.style.display = 'flex';
        bar.style.alignItems = 'center';
        _updateBodyPadding();
    }

    /* ── Countdown logic ─────────────────────────────────────── */
    var _cdInterval = null;
    function startCountdown(label, target, bg, color, accent) {
        var bar = document.getElementById('aqs-countdown-bar');
        if (!bar || !target) return;

        var targetDate = new Date(target);
        if (isNaN(targetDate.getTime()) || targetDate <= new Date()) return;

        /* Apply admin colours */
        bar.style.background = bg    || 'linear-gradient(90deg,#7c3aed,#4f46e5)';
        bar.style.color      = color || '#ffffff';

        var lbl = document.getElementById('aqs-cd-label-text');
        if (lbl) lbl.textContent = label || 'Upcoming Event';

        bar.style.display = 'block';
        _updateBodyPadding();
        if (_cdInterval) clearInterval(_cdInterval);

        function pad2(n) { return String(n).padStart(2,'0'); }
        function tick() {
            var diff = targetDate - new Date();
            if (diff <= 0) { clearInterval(_cdInterval); bar.style.display = 'none'; return; }
            var d = Math.floor(diff / 86400000);
            var h = Math.floor((diff % 86400000) / 3600000);
            var m = Math.floor((diff % 3600000) / 60000);
            var s = Math.floor((diff % 60000) / 1000);
            var days  = document.getElementById('aqs-cd-days');
            var hours = document.getElementById('aqs-cd-hours');
            var mins  = document.getElementById('aqs-cd-mins');
            var secs  = document.getElementById('aqs-cd-secs');
            if (days)  days.textContent  = d + 'd';
            if (hours) hours.textContent = pad2(h) + 'h';
            if (mins)  mins.textContent  = pad2(m) + 'm';
            if (secs)  secs.textContent  = pad2(s) + 's';
            if (accent) {
                document.querySelectorAll('.aqs-cd-block').forEach(function(el) {
                    el.style.background  = accent + '44';
                    el.style.borderColor = accent;
                });
            }
        }
        tick();
        _cdInterval = setInterval(tick, 1000);
    }

    /* ── Load settings from Firebase ─────────────────────────── */
    function loadNotifSettings() {
        /* Use the Firestore REST API for public reads — this works for ALL
           visitors (logged-in or not) without requiring aqsAjax to be ready. */
        _fetchViaRestApi();
    }

    /* ── Firestore REST helper: parses typed field values ── */
    function _parseField(f) {
        if (!f) return undefined;
        if (f.stringValue  !== undefined) return f.stringValue;
        if (f.booleanValue !== undefined) return f.booleanValue;
        if (f.integerValue !== undefined) return parseInt(f.integerValue, 10);
        if (f.doubleValue  !== undefined) return parseFloat(f.doubleValue);
        if (f.mapValue && f.mapValue.fields) {
            var obj = {};
            for (var k in f.mapValue.fields) {
                obj[k] = _parseField(f.mapValue.fields[k]);
            }
            return obj;
        }
        return undefined;
    }

    function _fetchViaRestApi() {
        var PROJECT = 'smartquiz-darapet';
        var API_KEY = 'AIzaSyCFVx82QXdKdufbUIHBBOOzDefNoFBYxtY';
        var url = 'https://firestore.googleapis.com/v1/projects/' + PROJECT +
                  '/databases/(default)/documents/settings/notifications?key=' + API_KEY;
        fetch(url)
            .then(function(r) { return r.ok ? r.json() : Promise.reject(r.status); })
            .then(function(doc) {
                var fields = (doc && doc.fields) || {};
                var tk = _parseField(fields.ticker)    || {};
                var cd = _parseField(fields.countdown) || {};
                if (tk.enabled && tk.text) {
                    startTicker(tk.text, tk.speed, tk.label, tk.bg, tk.color);
                }
                if (cd.enabled && cd.target) {
                    startCountdown(cd.label, cd.target, cd.bg, cd.color, cd.accent);
                }
            })
            .catch(function() {
                /* Fallback: if REST API fails try aqsAjax (requires Firebase SDK) */
                if (typeof window.aqsAjax === 'function') {
                    _fetchViaAjax();
                } else {
                    setTimeout(function() {
                        if (typeof window.aqsAjax === 'function') _fetchViaAjax();
                    }, 1200);
                }
            });
    }

    function _fetchViaAjax() {
        window.aqsAjax({ action: 'aqs_get_pub_notifications' }, function(res) {
            if (!res || !res.success) return;
            var d  = res.data || {};
            var tk = d.ticker    || {};
            var cd = d.countdown || {};
            if (tk.enabled && tk.text) {
                startTicker(tk.text, tk.speed, tk.label, tk.bg, tk.color);
            }
            if (cd.enabled && cd.target) {
                startCountdown(cd.label, cd.target, cd.bg, cd.color, cd.accent);
            }
        });
    }

    /* ── Bootstrap ───────────────────────────────────────────── */
    function init() {
        buildBars();
        /* Use REST API directly — no need to wait for Firebase SDK to be ready.
           This ensures the ticker appears for ALL visitors, including logged-out ones. */
        loadNotifSettings();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
