/* aqs-session.js — Persistent user nav bar + 30-day inactivity auto-logout
   Works on ALL pages. Listens for aqs:authchange from aqs-firebase.js.
   Safe to include on any page — does nothing if user is not logged in. */
(function () {
    'use strict';

    /* Keep users logged in for 30 days on all platforms (native and web).
       NOTE: setTimeout max is ~24.8 days (2^31-1 ms). Using a rolling hourly check
       instead of one giant setTimeout to avoid the overflow-fires-instantly bug. */
    var _isNativeApp = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
    var TIMEOUT_DAYS  = 30;
    var ACTIVITY_KEY  = 'aqs_last_activity';
    var CHECK_MS      = 60 * 60 * 1000;   /* check every hour — safe for setTimeout */
    var _timer = null;

    /* Record activity timestamp in localStorage so it survives page navigations */
    function _touch() {
        try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch(_) {}
    }

    /* Hourly check: has 30 days of inactivity elapsed? */
    function _scheduleCheck() {
        clearTimeout(_timer);
        _timer = setTimeout(function () {
            try {
                var last  = parseInt(localStorage.getItem(ACTIVITY_KEY) || '0', 10);
                var limit = TIMEOUT_DAYS * 24 * 60 * 60 * 1000;
                if (last && (Date.now() - last) >= limit) {
                    doLogout(true);
                } else {
                    _scheduleCheck();   /* not yet — check again in an hour */
                }
            } catch(_) { _scheduleCheck(); }
        }, CHECK_MS);
    }

    /* resetTimer: record activity + restart the hourly check cycle */
    function resetTimer() {
        _touch();
        _scheduleCheck();
    }

    function startTracking() {
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (ev) {
            document.addEventListener(ev, resetTimer, { passive: true });
        });
        resetTimer();   /* record now as the start of the session */
    }

    function stopTracking() {
        clearTimeout(_timer);
        ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'].forEach(function (ev) {
            document.removeEventListener(ev, resetTimer);
        });
    }

    function doLogout(fromTimeout) {
        stopTracking();
        var go = function () {
            if (fromTimeout) {
                window.location.href = 'login.html?reason=timeout';
            } else {
                window.location.href = 'login.html';
            }
        };
        if (typeof window.aqsAjax === 'function') {
            window.aqsAjax({ action: 'aqs_logout' }, go, go);
        } else {
            go();
        }
    }

    /* ── build the user pill HTML ── */
    function buildPill(user) {
        var displayName = '';
        if (window.AQS && window.AQS.current_user_name && window.AQS.current_user_name !== 'User') {
            displayName = window.AQS.current_user_name;
        } else if (user.displayName) {
            displayName = user.displayName;
        } else if (user.email) {
            displayName = user.email.split('@')[0];
        } else {
            displayName = 'User';
        }

        var isHost  = window.AQS && (window.AQS.is_host === true || window.AQS.is_host === 'yes' || window.AQS.is_host === 1);
        var isAdmin = window.AQS && (window.AQS.is_admin === true || window.AQS.is_admin === 'yes' || window.AQS.is_admin === 1);
        var dashUrl = (isHost || isAdmin) ? 'dashboard.html' : 'user-dashboard.html';
        var initial = (displayName.charAt(0) || 'U').toUpperCase();

        var pill = document.createElement('div');
        pill.id = 'aqs-session-pill';
        pill.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0;';
        pill.innerHTML =
            '<a href="' + dashUrl + '" id="aqs-session-dash-link" style="'
            + 'display:inline-flex;align-items:center;gap:6px;'
            + 'background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);'
            + 'color:#4f46e5;padding:5px 12px;border-radius:8px;'
            + 'font-size:.84rem;font-weight:600;text-decoration:none;transition:background .15s;white-space:nowrap;">'
            + '<span style="width:22px;height:22px;border-radius:50%;background:#4f46e5;color:#fff;'
            + 'display:inline-flex;align-items:center;justify-content:center;'
            + 'font-size:.68rem;font-weight:700;flex-shrink:0;">' + initial + '</span>'
            + 'Dashboard'
            + '</a>'
            + '<button id="aqs-session-logout-btn" style="'
            + 'background:#fef2f2;border:1px solid #fecdd3;color:#e11d48;'
            + 'padding:5px 12px;border-radius:8px;font-size:.84rem;font-weight:600;'
            + 'cursor:pointer;transition:background .15s;white-space:nowrap;font-family:inherit;">'
            + '&#x1F512; Logout'
            + '</button>';

        pill.querySelector('#aqs-session-logout-btn').addEventListener('click', function () {
            doLogout(false);
        });
        return pill;
    }

    /* ── inject pill into the page header ── */
    function injectUserBar(user) {
        /* Remove any previously injected pill first */
        var old = document.getElementById('aqs-session-pill');
        if (old) old.parentNode.removeChild(old);
        var oldBar = document.getElementById('aqs-session-topbar');
        if (oldBar) oldBar.parentNode.removeChild(oldBar);

        var pill = buildPill(user);

        /* 1. Best target: .aqs-site-header-auth (index, create-quiz, etc.) */
        var authArea = document.querySelector('.aqs-site-header-auth');
        if (authArea) {
            authArea.innerHTML = '';
            authArea.appendChild(pill);
            _patchMobileNav(user);
            return;
        }

        /* 2. Simple header nav (dashboard.html, user-dashboard.html, take-quiz.html) */
        var headerNav = document.querySelector('.aqs-site-header nav');
        if (headerNav) {
            /* Remove any existing logout/dashboard link we might have added before */
            var existingPill = headerNav.querySelector('#aqs-session-pill');
            if (!existingPill) headerNav.appendChild(pill);
            return;
        }

        /* 3. Sidebar pages (studio.html etc) — inject Dashboard + Logout into .aqs-sidebar-footer */
        var sidebarFooter = document.querySelector('.aqs-sidebar-footer');
        if (sidebarFooter) {
            var isHost2  = window.AQS && (window.AQS.is_host === true || window.AQS.is_host === 'yes' || window.AQS.is_host === 1);
            var isAdmin2 = window.AQS && (window.AQS.is_admin === true || window.AQS.is_admin === 'yes' || window.AQS.is_admin === 1);
            var dashUrl2 = (isHost2 || isAdmin2) ? 'dashboard.html' : 'user-dashboard.html';
            var initial2 = (user.displayName || user.email || 'U').charAt(0).toUpperCase();
            var displayName2 = user.displayName || (user.email ? user.email.split('@')[0] : 'User');
            /* Update existing user avatar/name if present */
            var ava = sidebarFooter.querySelector('.aqs-sidebar-avatar');
            var nam = sidebarFooter.querySelector('.aqs-sidebar-user-name');
            if (ava) ava.textContent = initial2;
            if (nam) nam.textContent = displayName2;
            /* Add dashboard + logout links if not already present */
            if (!sidebarFooter.querySelector('#aqs-sidebar-dash-link')) {
                var dashLink = document.createElement('a');
                dashLink.id = 'aqs-sidebar-dash-link';
                dashLink.href = dashUrl2;
                dashLink.style.cssText = 'display:flex;align-items:center;gap:7px;padding:8px 12px;'
                    + 'margin-top:10px;border-radius:9px;background:rgba(99,102,241,.12);'
                    + 'color:#818cf8;font-size:.83rem;font-weight:600;text-decoration:none;transition:background .15s;';
                dashLink.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg> Dashboard';
                sidebarFooter.appendChild(dashLink);
            }
            if (!sidebarFooter.querySelector('#aqs-sidebar-logout-btn')) {
                var logoutBtn = document.createElement('button');
                logoutBtn.id = 'aqs-sidebar-logout-btn';
                logoutBtn.style.cssText = 'display:flex;align-items:center;gap:7px;padding:8px 12px;'
                    + 'margin-top:6px;border-radius:9px;background:rgba(225,29,72,.08);'
                    + 'color:#f87171;font-size:.83rem;font-weight:600;cursor:pointer;'
                    + 'border:none;width:100%;font-family:inherit;transition:background .15s;';
                logoutBtn.innerHTML = '&#x1F512; Logout';
                logoutBtn.addEventListener('click', function() { doLogout(false); });
                sidebarFooter.appendChild(logoutBtn);
            }
            return;
        }
        /* 3b. Fallback: fixed top-right bar (non-sidebar pages with no known header) */
        var wrap = document.createElement('div');
        wrap.id = 'aqs-session-topbar';
        wrap.style.cssText = 'position:fixed;top:10px;right:16px;z-index:9999;'
            + 'background:#fff;border:1px solid #e5e7eb;border-radius:10px;'
            + 'padding:4px 6px;box-shadow:0 2px 8px rgba(0,0,0,.1);';
        if(!document.getElementById('aqs-session-topbar-style')){
            var st = document.createElement('style');
            st.id = 'aqs-session-topbar-style';
            st.textContent = '@media(max-width:768px){#aqs-session-topbar{display:none!important}}';
            document.head.appendChild(st);
        }
        wrap.appendChild(pill);
        document.body.appendChild(wrap);
    }

    /* ── patch the mobile hamburger nav with dashboard + logout links ── */
    function _patchMobileNav(user) {
        var mobileAuth = document.querySelector('.aqs-site-nav-mobile-auth');
        if (!mobileAuth) return;
        var isHost  = window.AQS && (window.AQS.is_host === true || window.AQS.is_host === 'yes' || window.AQS.is_host === 1);
        var isAdmin = window.AQS && (window.AQS.is_admin === true || window.AQS.is_admin === 'yes' || window.AQS.is_admin === 1);
        var dashUrl = (isHost || isAdmin) ? 'dashboard.html' : 'user-dashboard.html';
        mobileAuth.innerHTML =
            '<a href="' + dashUrl + '" class="aqs-site-nav-link" style="color:#4f46e5;font-weight:600;">&#x1F4CA; Dashboard</a>'
            + '<a href="#" class="aqs-site-nav-link aqs-session-mobile-logout" style="color:#e11d48;font-weight:600;">&#x1F512; Logout</a>';
        mobileAuth.querySelector('.aqs-session-mobile-logout').addEventListener('click', function (e) {
            e.preventDefault();
            doLogout(false);
        });
    }

    /* ── remove bar on logout ── */
    function removeUserBar() {
        var pill = document.getElementById('aqs-session-pill');
        if (pill) pill.parentNode.removeChild(pill);
        var bar = document.getElementById('aqs-session-topbar');
        if (bar) bar.parentNode.removeChild(bar);
    }

    var _warnTimer = null;   /* unused — kept only so clearTimeout(_warnTimer) below is safe */

    /* ── Pause inactivity timer when app goes to background (native only) ── */
    if (_isNativeApp && typeof window.Capacitor !== 'undefined' &&
        window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
      window.Capacitor.Plugins.App.addListener('appStateChange', function(state) {
        if (state.isActive) {
          /* App came to foreground — restart timer fresh */
          resetTimer();
        } else {
          /* App went to background — pause the timer so background time doesn't count */
          clearTimeout(_timer);
          clearTimeout(_warnTimer);
        }
      });
    }

    /* ── wire existing logout buttons already in the DOM ── */
    function wireExistingLogoutBtns() {
        ['aqs-user-logout-btn', 'aqs-user-logout-btn2'].forEach(function (id) {
            var btn = document.getElementById(id);
            if (btn && !btn._aqsSessionWired) {
                btn._aqsSessionWired = true;
                btn.addEventListener('click', function (e) {
                    e.preventDefault();
                    doLogout(false);
                });
            }
        });
    }

    /* ── auth state listener ── */
    document.addEventListener('aqs:authchange', function (ev) {
        var user = ev.detail && ev.detail.user;
        if (user) {
            injectUserBar(user);
            wireExistingLogoutBtns();
            startTracking();
        } else {
            removeUserBar();
            stopTracking();
        }
    });

    /* login.html handles the timeout message in its own inline script */

})();
