/* aqs-quotes.js — Daily Motivational Quote System v1.253
   Dedicated quote-generation keys loaded from Firebase admin settings.
   Stored under settings/main → quoteGroqKeys (array of strings).
   Never exposed in source code. */
(function () {
    'use strict';

    /* ── Quote keys loaded at runtime from Firebase settings ──────────── */
    var _QK = [];   /* filled by _loadQuoteKeys() */
    var _QK_READY = false;
    var _QK_IDX_LS = 'aqs_qk_idx';
    var _QK_RL    = {};   /* rate-limit timestamps per key */

    async function _loadQuoteKeys() {
        if (_QK_READY) return;
        try {
            if (window._aqsFS) {
                var cfg = await window._aqsFS.get('settings', 'main');
                if (cfg && Array.isArray(cfg.quoteGroqKeys) && cfg.quoteGroqKeys.length) {
                    _QK = cfg.quoteGroqKeys.filter(function(k){ return (k||'').trim().length > 10; });
                }
            }
            /* Fallback: also accept window._AQS_QUOTE_KEYS if set inline */
            if (!_QK.length && Array.isArray(window._AQS_QUOTE_KEYS)) {
                _QK = window._AQS_QUOTE_KEYS.filter(function(k){ return (k||'').trim().length > 10; });
            }
        } catch(e) {}
        _QK_READY = true;
    }

    async function _quoteFetch(prompt) {
        await _loadQuoteKeys();
        var total = _QK.length;
        if (!total) return null; /* no keys configured — fail silently */
        var start;
        try { start = parseInt(localStorage.getItem(_QK_IDX_LS) || '0') || 0; } catch(e) { start = 0; }

        for (var attempt = 0; attempt < total; attempt++) {
            var idx = (start + attempt) % total;
            var key = _QK[idx];
            if (_QK_RL[idx] && Date.now() < _QK_RL[idx]) continue;

            try {
                var res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body: JSON.stringify({
                        model: 'llama3-8b-8192',
                        messages: [{ role: 'user', content: prompt }],
                        max_tokens: 5500,
                        temperature: 1.1
                    })
                });
                if (res.status === 429) { _QK_RL[idx] = Date.now() + 65000; continue; }
                if (res.status === 401) { continue; }
                if (!res.ok) continue;
                try { localStorage.setItem(_QK_IDX_LS, String((idx + 1) % total)); } catch(e) {}
                return await res.json();
            } catch (e) { continue; }
        }
        return null;
    }

    /* ── Constants ───────────────────────────────────────────────────────── */
    var COL      = 'aqsDailyQuotes';
    var LS_SEEN  = 'aqs_quote_seen_';
    var LS_ANON  = 'aqs_anon_qid';
    var LS_CACHE = 'aqs_dq_';

    function todayKey() {
        var d = new Date();
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    }
    function getAnonId() {
        try {
            var id = localStorage.getItem(LS_ANON);
            if (!id) { id = Date.now().toString(36) + Math.random().toString(36).substr(2, 7); localStorage.setItem(LS_ANON, id); }
            return id;
        } catch (e) { return 'anon' + Math.random().toString(36).substr(2, 5); }
    }
    function hasSeenToday() { try { return localStorage.getItem(LS_SEEN + todayKey()) === '1'; } catch (e) { return false; } }
    function markSeen()     { try { localStorage.setItem(LS_SEEN + todayKey(), '1'); } catch (e) {} }
    function hashIdx(seed, max) {
        var h = 0;
        for (var i = 0; i < seed.length; i++) { h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0; }
        return Math.abs(h) % max;
    }

    /* ── Quote generation / retrieval ─────────────────────────────────────── */
    async function getOrGenerate() {
        var key = todayKey();

        /* 1 — Firebase (generated earlier today, shared across all users) */
        if (window._aqsFS) {
            var cached = await window._aqsFS.get(COL, key);
            if (cached && Array.isArray(cached.quotes) && cached.quotes.length >= 10) return cached.quotes;
        }

        /* 2 — localStorage fallback */
        try {
            var ls = JSON.parse(localStorage.getItem(LS_CACHE + key) || 'null');
            if (Array.isArray(ls) && ls.length >= 10) return ls;
        } catch (e) {}

        /* 3 — Generate 50 quotes using dedicated keys */
        var prompt = 'Generate exactly 50 diverse motivational and educational quotes. Use real people: scientists, philosophers, athletes, leaders, entrepreneurs, authors.\n\nReturn ONLY a valid JSON array, no other text:\n[{"text":"Quote here.","author":"Full Name","cat":"education"}]\n\nCategories: education | motivation | wisdom | success | life\nKeep each quote under 180 characters. Vary the era and background of authors. Every quote must be genuinely inspiring.';

        var raw_res = await _quoteFetch(prompt);
        if (!raw_res) return null;

        try {
            var raw = raw_res.choices[0].message.content.trim();
            var s = raw.indexOf('['), e = raw.lastIndexOf(']');
            if (s < 0 || e < 0) return null;
            var arr = JSON.parse(raw.slice(s, e + 1));
            if (!Array.isArray(arr) || arr.length < 5) return null;
            arr = arr.slice(0, 50);

            /* Store in Firebase so other users get same pool today without regenerating */
            if (window._aqsFS) window._aqsFS.set(COL, key, { quotes: arr, generatedAt: Date.now() });
            try { localStorage.setItem(LS_CACHE + key, JSON.stringify(arr)); } catch (e2) {}
            return arr;
        } catch (e) { return null; }
    }

    /* ── Popup UI ─────────────────────────────────────────────────────────── */
    var ICONS = { education: '📚', motivation: '🔥', wisdom: '🧠', success: '🏆', life: '🌟' };
    function _esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

    function showPopup(quote, name) {
        if (document.getElementById('_aqs-quote-overlay')) return;

        var hour     = new Date().getHours();
        var greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';
        var icon     = ICONS[quote.cat] || '✨';
        var cat      = (quote.cat || 'wisdom');
        var catLabel = cat.charAt(0).toUpperCase() + cat.slice(1);

        var style = document.createElement('style');
        style.id  = '_aqs-quote-style';
        style.textContent = [
            '@keyframes _aqsB1{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(45px,-65px) scale(1.18)}66%{transform:translate(-30px,28px) scale(.88)}}',
            '@keyframes _aqsB2{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(-55px,75px) scale(1.22)}66%{transform:translate(38px,-42px) scale(.82)}}',
            '@keyframes _aqsB3{0%,100%{transform:translate(0,0) scale(1)}33%{transform:translate(65px,35px) scale(.88)}66%{transform:translate(-28px,-55px) scale(1.12)}}',
            '@keyframes _aqsFI{from{opacity:0;transform:translateY(34px) scale(.95)}to{opacity:1;transform:translateY(0) scale(1)}}',
            '@keyframes _aqsQI{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}',
            '@keyframes _aqsPS{0%,100%{opacity:.55}50%{opacity:1}}',
            '#_aqs-quote-overlay{position:fixed;inset:0;z-index:999999;display:flex;align-items:center;justify-content:center;background:rgba(4,4,16,.96);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
            '#_aqs-quote-overlay ._aqsblob{position:absolute;border-radius:50%;filter:blur(90px);opacity:.32;pointer-events:none;}',
            '#_aqs-quote-overlay ._aqsb1{width:560px;height:560px;background:radial-gradient(circle,#f97316,#ea580c,transparent 68%);top:-100px;left:-120px;animation:_aqsB1 13s ease-in-out infinite;}',
            '#_aqs-quote-overlay ._aqsb2{width:520px;height:520px;background:radial-gradient(circle,#7c3aed,#4f46e5,transparent 68%);bottom:-70px;right:-90px;animation:_aqsB2 16s ease-in-out infinite;}',
            '#_aqs-quote-overlay ._aqsb3{width:440px;height:440px;background:radial-gradient(circle,#0ea5e9,#06b6d4,transparent 68%);top:50%;left:50%;margin:-220px 0 0 -220px;animation:_aqsB3 19s ease-in-out infinite;}',
            '#_aqs-qcard{position:relative;z-index:2;max-width:600px;width:calc(100% - 36px);background:rgba(12,12,30,.82);backdrop-filter:blur(30px) saturate(160%);-webkit-backdrop-filter:blur(30px);border:1px solid rgba(255,255,255,.1);border-radius:26px;padding:40px 44px 36px;text-align:center;box-shadow:0 40px 90px rgba(0,0,0,.65),inset 0 1px 0 rgba(255,255,255,.07);animation:_aqsFI .6s cubic-bezier(.22,1,.36,1) both;}',
            '#_aqs-qcard ._aqsg{font-size:.78rem;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:rgba(253,186,116,.75);margin-bottom:5px;}',
            '#_aqs-qcard ._aqsn{font-size:1.3rem;font-weight:800;color:#f1f5f9;margin-bottom:22px;}',
            '#_aqs-qcard ._aqsdiv{width:52px;height:3px;background:linear-gradient(90deg,#f97316,#7c3aed);border-radius:4px;margin:0 auto 26px;}',
            '#_aqs-qcard ._aqsico{font-size:3rem;display:block;margin-bottom:18px;animation:_aqsPS 3.5s ease-in-out infinite;}',
            '#_aqs-qcard ._aqsqt{font-size:1.17rem;font-style:italic;line-height:1.72;color:#e2e8f0;margin-bottom:22px;font-family:Georgia,serif;animation:_aqsQI .7s .25s both;}',
            '#_aqs-qcard ._aqsqt::before{content:open-quote;font-size:3.2rem;line-height:0;vertical-align:-.6em;color:rgba(249,115,22,.38);margin-right:3px;}',
            '#_aqs-qcard ._aqsqt::after{content:close-quote;font-size:3.2rem;line-height:0;vertical-align:-.6em;color:rgba(249,115,22,.38);margin-left:3px;}',
            '#_aqs-qcard ._aqsau{font-size:.87rem;font-weight:700;color:#94a3b8;letter-spacing:.04em;margin-bottom:12px;animation:_aqsQI .7s .4s both;}',
            '#_aqs-qcard ._aqsbadge{display:inline-block;background:rgba(124,58,237,.18);border:1px solid rgba(124,58,237,.3);color:#c4b5fd;font-size:.7rem;font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:4px 13px;border-radius:20px;margin-bottom:30px;}',
            '#_aqs-qcard ._aqsbtn{width:100%;padding:14px;background:linear-gradient(135deg,#f97316,#dc2626);color:#fff;border:none;border-radius:13px;font-size:.97rem;font-weight:800;cursor:pointer;letter-spacing:.03em;transition:opacity .15s,transform .15s;box-shadow:0 5px 28px rgba(249,115,22,.38);}',
            '#_aqs-qcard ._aqsbtn:hover{opacity:.9;transform:translateY(-2px);}',
            '#_aqs-qclose{position:absolute;top:18px;right:20px;z-index:3;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.11);color:#64748b;font-size:1rem;width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,color .15s;line-height:1;}',
            '#_aqs-qclose:hover{background:rgba(255,255,255,.14);color:#f1f5f9;}'
        ].join('');
        document.head.appendChild(style);

        var overlay = document.createElement('div');
        overlay.id  = '_aqs-quote-overlay';
        overlay.innerHTML = [
            '<div class="_aqsblob _aqsb1"></div>',
            '<div class="_aqsblob _aqsb2"></div>',
            '<div class="_aqsblob _aqsb3"></div>',
            '<div id="_aqs-qcard">',
            '  <button id="_aqs-qclose" title="Close">✕</button>',
            '  <div class="_aqsg">' + greeting + ', Scholar ✨</div>',
            '  <div class="_aqsn">Welcome back, ' + _esc(name) + '!</div>',
            '  <div class="_aqsdiv"></div>',
            '  <span class="_aqsico">' + icon + '</span>',
            '  <div class="_aqsqt">' + _esc(quote.text) + '</div>',
            '  <div class="_aqsau">— ' + _esc(quote.author || 'Unknown') + '</div>',
            '  <span class="_aqsbadge">' + catLabel + '</span>',
            '  <button class="_aqsbtn">Start Learning 🚀</button>',
            '</div>'
        ].join('');
        document.body.appendChild(overlay);

        function dismiss() {
            var el = document.getElementById('_aqs-quote-overlay');
            var st = document.getElementById('_aqs-quote-style');
            if (el) el.remove();
            if (st) st.remove();
        }
        overlay.querySelector('#_aqs-qclose').addEventListener('click', dismiss);
        overlay.querySelector('._aqsbtn').addEventListener('click', dismiss);
    }

    /* ── Main ─────────────────────────────────────────────────────────────── */
    async function run() {
        if (hasSeenToday()) return;
        markSeen();
        var quotes = await getOrGenerate();
        if (!quotes || !quotes.length) return; /* fail silently — never blocks the app */

        var uid   = (window._aqsFirebaseUser && window._aqsFirebaseUser.uid) || getAnonId();
        var idx   = hashIdx(uid + todayKey(), quotes.length);
        var quote = quotes[idx] || quotes[0];
        var u     = window._aqsFirebaseUser;
        var name  = (u && (u.displayName || (u.email || '').split('@')[0])) || 'Scholar';

        setTimeout(function () { showPopup(quote, name); }, 900);
    }

    document.addEventListener('aqs:firebase:ready', run, { once: true });
})();
