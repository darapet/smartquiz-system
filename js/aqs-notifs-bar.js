/* ============================================================
   XZILY AI — Shared Notifications Bar (Ticker + Countdown)
   Auto-injects ticker and countdown HTML on every page.
   Admin configures via admin panel → saved to Firestore
   settings/notifications document.
   Include this script on every page AFTER aqs-firebase.js.
   Layout:
   - Countdown : position:fixed; top:0  (very top of page)
   - Ticker    : position:fixed; BOTTOM of page (scrolling text footer)
   ============================================================ */
(function () {
    'use strict';

    /* ── Inject required CSS ──────────────────────────────────── */
    var style = document.createElement('style');
    style.id = 'aqs-notifs-bar-css';
    style.textContent = [
        /* ── COUNTDOWN — fixed at very top ── */
        '#aqs-countdown-bar{display:none;text-align:center;padding:8px 20px;font-size:.88rem;position:fixed;top:0;left:0;right:0;z-index:9990;border-bottom:1px solid rgba(255,255,255,.15);}',
        '#aqs-countdown-bar .aqs-cd-label{font-weight:700;margin-right:12px;opacity:.9;}',
        '#aqs-countdown-digits{display:inline-flex;gap:6px;align-items:center;font-variant-numeric:tabular-nums;}',
        '.aqs-cd-block{background:rgba(255,255,255,.18);border-radius:6px;padding:3px 9px;font-size:1rem;font-weight:800;min-width:40px;text-align:center;}',
        '.aqs-cd-sep{opacity:.6;font-weight:300;font-size:1rem;}',

        /* ── NEWS TICKER — scrolling bottom footer ── */
        '#aqs-news-ticker-bar{display:none;overflow:hidden;height:36px;line-height:36px;font-size:.82rem;font-weight:500;position:fixed;bottom:0;left:0;right:0;z-index:9989;border-top:1px solid rgba(255,255,255,.12);}',
        '#aqs-news-ticker-bar .aqs-ticker-label{display:inline-flex;align-items:center;height:36px;padding:0 14px;font-weight:700;font-size:.78rem;letter-spacing:.06em;text-transform:uppercase;flex-shrink:0;position:relative;z-index:2;}',
        '#aqs-ticker-scroll-wrap{overflow:hidden;flex:1;display:inline-block;vertical-align:top;}',
        '#aqs-ticker-track{display:inline-block;white-space:nowrap;padding-left:100%;animation:aqsTickerScroll 120s linear infinite;}',
        '#aqs-ticker-track:hover{animation-play-state:paused;}',
        '@keyframes aqsTickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-100%)}}',

        /* ── Responsive ── */
        '@media(max-width:480px){#aqs-news-ticker-bar{height:30px;line-height:30px;font-size:.75rem;}#aqs-news-ticker-bar .aqs-ticker-label{font-size:.7rem;padding:0 10px;}#aqs-countdown-bar{font-size:.8rem;padding:6px 10px;}.aqs-cd-block{font-size:.82rem;padding:2px 7px;min-width:32px;}}'
    ].join('');
    document.head.appendChild(style);

    /* ── Build HTML elements ─────────────────────────────────── */
    function buildBars() {
        /* Countdown bar — fixed at very top */
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

        document.body.insertBefore(cdBar, document.body.firstChild);
        document.body.appendChild(tickerBar);
    }

    /* ── Push site header + page body below the fixed bars ───── */
    function _applyOffsets() {
        var ticker = document.getElementById('aqs-news-ticker-bar');
        var cd     = document.getElementById('aqs-countdown-bar');

        /* Ticker: pad body bottom so content is flush, not hidden */
        if (ticker && ticker.style.display !== 'none') {
            var tkH = ticker.offsetHeight || 36;
            document.body.style.paddingBottom = (tkH + 4) + 'px';
            document.querySelectorAll('.aqs-admin-content').forEach(function (c) {
                c.style.paddingBottom = (tkH + 4) + 'px';
            });
        }

        /* Countdown: shift everything flush below it — no white gap */
        if (cd && cd.style.display !== 'none') {
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    setTimeout(function () {
                        var cdH = cd.getBoundingClientRect().height || cd.offsetHeight || 40;

                        document.documentElement.style.setProperty('--aqs-cd-bar-h', cdH + 'px');

                        /* body paddingTop fills the exact space the fixed bar occupies,
                           so all content sits flush directly below it — zero white gap. */
                        document.body.style.paddingTop = cdH + 'px';

                        /* Sticky site headers: just move the snap-point, no marginTop */
                        document.querySelectorAll('.aqs-site-header').forEach(function (h) {
                            h.style.marginTop = '0px';
                            h.style.top       = cdH + 'px';
                        });

                        /* Admin sticky sidebar: snap below countdown, shrink height */
                        document.querySelectorAll('.aqs-admin-sidebar').forEach(function (s) {
                            s.style.top    = cdH + 'px';
                            s.style.height = 'calc(100vh - ' + cdH + 'px)';
                        });

                        /* Mobile hamburger toggle */
                        document.querySelectorAll('.aqs-sidebar-mobile-toggle').forEach(function (btn) {
                            btn.style.setProperty('top', (cdH + 8) + 'px', 'important');
                        });

                        /* Mobile sidebar body */
                        if (window.innerWidth <= 768) {
                            document.querySelectorAll('.aqs-sidebar-body').forEach(function (b) {
                                b.style.setProperty('padding-top', (cdH + 60) + 'px', 'important');
                            });
                            document.querySelectorAll('.std-main').forEach(function (el) {
                                el.style.height = 'calc(100dvh - ' + (cdH + 60) + 'px)';
                            });
                        }
                    }, 80);
                });
            });
        }
    }

        /* ── Countdown: shift everything below it ── */
        if (cd && cd.style.display !== 'none') {
            /* Double-rAF + 80ms so layout is fully stable before we measure */
            requestAnimationFrame(function () {
                requestAnimationFrame(function () {
                    setTimeout(function () {
                        var cdH = cd.getBoundingClientRect().height || cd.offsetHeight || 40;

                        /* Publish as CSS variable so rules can react */
                        document.documentElement.style.setProperty('--aqs-cd-bar-h', cdH + 'px');

                        /* Move site headers (index.html / home-style pages) */
                        document.querySelectorAll('.aqs-site-header').forEach(function (h) {
                            h.style.marginTop = cdH + 'px';
                            h.style.top       = cdH + 'px';
                        });

                        /* Move hamburger toggle — use setProperty+important to beat
                           the `top:8px !important` that may exist in sidebar CSS */
                        document.querySelectorAll('.aqs-sidebar-mobile-toggle').forEach(function (btn) {
                            btn.style.setProperty('top', (cdH + 8) + 'px', 'important');
                        });

                        /* On mobile, push sidebar body content down so it clears
                           the countdown bar. Desktop sidebar is full-height fixed
                           so it does not need this treatment.                    */
                        if (window.innerWidth <= 768) {
                            document.querySelectorAll('.aqs-sidebar-body').forEach(function (body) {
                                /* Add to existing baseline padding-top (60px set by CSS) */
                                body.style.setProperty('padding-top', (cdH + 60) + 'px', 'important');
                            });
                            /* Shrink std-main so 100vh still fits inside the offset body */
                            document.querySelectorAll('.std-main').forEach(function (el) {
                                el.style.height = 'calc(100dvh - ' + (cdH + 60) + 'px)';
                            });
                        }
                    }, 80);
                });
            });
        }
    }

    /* ── Reset offsets when countdown bar hides ──────────────── */
    function _resetOffsets() {
        document.documentElement.style.removeProperty('--aqs-cd-bar-h');
        document.body.style.paddingTop    = '';
        document.body.style.paddingBottom = '';
        document.querySelectorAll('.aqs-site-header').forEach(function (h) {
            h.style.marginTop = '';
            h.style.top       = '';
        });
        document.querySelectorAll('.aqs-admin-sidebar').forEach(function (s) {
            s.style.top = ''; s.style.height = '';
        });
        document.querySelectorAll('.aqs-admin-content').forEach(function (c) {
            c.style.paddingBottom = '';
        });
        document.querySelectorAll('.aqs-sidebar-mobile-toggle').forEach(function (btn) {
            btn.style.removeProperty('top');
        });
        document.querySelectorAll('.aqs-sidebar-body').forEach(function (b) {
            b.style.removeProperty('padding-top');
        });
        document.querySelectorAll('.std-main').forEach(function (el) {
            el.style.height = '';
        });
    }

    /* ── Ticker logic — scrolling text ───────────────────────── */
    function startTicker(text, speed, label, bg, color) {
        var bar   = document.getElementById('aqs-news-ticker-bar');
        var track = document.getElementById('aqs-ticker-track');
        var lbl   = document.getElementById('aqs-ticker-label');
        if (!bar || !track || !text) return;

        bar.style.background = bg    || '#1e1b4b';
        bar.style.color      = color || '#e0e7ff';
        if (lbl) {
            lbl.style.background = bg    || '#1e1b4b';
            lbl.style.color      = color || '#e0e7ff';
            lbl.style.filter     = 'brightness(1.3)';
            lbl.textContent      = label || '📢 NEWS';
        }

        var msgs = text.split('·').map(function(s){ return s.trim(); }).filter(Boolean);
        if (!msgs.length) msgs = [text];
        var fullText = msgs.join('   ·   ') + '          ';
        track.textContent = fullText + fullText + fullText;

        var spd = parseInt(speed) || 40;
        var dur = Math.round(track.textContent.length * 35 / spd);
        dur = Math.max(90, Math.min(700, dur));
        track.style.animationDuration = dur + 's';

        bar.style.display = 'flex';
        bar.style.alignItems = 'center';
        _applyOffsets();
    }

    /* ── Countdown logic ─────────────────────────────────────── */
    var _cdInterval = null;
    function startCountdown(label, target, bg, color, accent) {
        var bar = document.getElementById('aqs-countdown-bar');
        if (!bar || !target) return;

        var targetDate = new Date(target);
        if (isNaN(targetDate.getTime()) || targetDate <= new Date()) return;

        bar.style.background = bg    || 'linear-gradient(90deg,#7c3aed,#4f46e5)';
        bar.style.color      = color || '#ffffff';

        var lbl = document.getElementById('aqs-cd-label-text');
        if (lbl) lbl.textContent = label || 'Upcoming Event';

        bar.style.display = 'block';
        _applyOffsets();
        if (_cdInterval) clearInterval(_cdInterval);

        function pad2(n) { return String(n).padStart(2,'0'); }
        function tick() {
            var diff = targetDate - new Date();
            if (diff <= 0) {
                clearInterval(_cdInterval);
                bar.style.display = 'none';
                _resetOffsets();
                return;
            }
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
        _fetchViaRestApi();
    }

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
        loadNotifSettings();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
