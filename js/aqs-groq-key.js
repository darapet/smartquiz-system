(function(){
    var GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
    var POLL_URL    = 'https://text.pollinations.ai/openai';
    var STORAGE_KEY = 'aqs_groq_key';
    var IDX_KEY     = 'aqs_groq_key_idx';

    /* Per-key cooldown tracking. Maps key index → timestamp (ms) when it
       becomes available again. Stored in memory only (resets on page load). */
    var _keyCooldowns = {};

    /* Global inter-call throttle. A small gap prevents Groq from seeing
       simultaneous bursts. Pollinations catches anything that still 429s,
       so the gap can stay small. */
    var _lastCallTime = 0;
    var MIN_CALL_GAP_MS = 500;

    /* Master keys are loaded at runtime from Firestore (via aqs-firebase.js).
       They are NEVER hardcoded here so the file is safe to push to GitHub.
       window._AQS_GROQ_MASTER_KEYS is set by aqs-firebase.js after it loads
       the site settings. Until that happens the array is empty and the site
       will use any personally-saved browser key instead. */
    function _getMasterKeys() {
        var wk = window._AQS_GROQ_MASTER_KEYS;
        if (Array.isArray(wk) && wk.length) return wk;
        return [];
    }

    function _getIdx() {
        var keys = _getMasterKeys();
        if (!keys.length) return 0;
        var i = 0;
        try { i = parseInt(localStorage.getItem(IDX_KEY) || '0') || 0; } catch(e) {}
        if (isNaN(i) || i >= keys.length) i = 0;
        return i;
    }
    function _setIdx(i) {
        var keys = _getMasterKeys();
        try { localStorage.setItem(IDX_KEY, String(i % Math.max(1, keys.length))); } catch(e) {}
    }

    /* Mark key slot as rate-limited. Parses Retry-After header when available. */
    function _markCooldown(idx, retryAfterHeader) {
        var waitSec = 60;
        if (retryAfterHeader) {
            var parsed = parseInt(retryAfterHeader, 10);
            if (!isNaN(parsed) && parsed > 0) waitSec = Math.min(parsed, 300);
        }
        _keyCooldowns[idx] = Date.now() + waitSec * 1000;
    }

    /* Returns true if the key slot is still in cooldown. */
    function _isCooling(idx) {
        var until = _keyCooldowns[idx];
        return until && Date.now() < until;
    }

    /* ── Pollinations silent fallback ──────────────────────────────────────
       Called automatically when all Groq keys are busy.
       - always sends private:true and nologo:true (no ads, no branding)
       - strips Groq-specific fields Pollinations doesn't understand
       - tries three models in order: large → standard → fast
       - returns a fetch Response so callers work identically to Groq path  */
    var _POLL_MODELS = ['openai-large', 'openai', 'openai-fast'];

    function _mapToPollModel(groqModel) {
        if (!groqModel) return 'openai';
        var g = String(groqModel).toLowerCase();
        if (g.indexOf('70b') !== -1 || g.indexOf('large') !== -1 || g.indexOf('scout') !== -1) return 'openai-large';
        if (g.indexOf('8b') !== -1  || g.indexOf('fast')  !== -1 || g.indexOf('instant') !== -1) return 'openai-fast';
        return 'openai';
    }

    async function _pollFetch(bodyObj, signal) {
        /* Build a clean body — remove Groq-only fields, force private mode */
        var body = {
            messages:    bodyObj.messages,
            temperature: bodyObj.temperature || 0.7,
            max_tokens:  Math.min(bodyObj.max_tokens || 1500, 2000),
            private:     true,
            nologo:      true
        };

        /* Try models in preference order, starting with the best match */
        var preferred = _mapToPollModel(bodyObj.model);
        var order = [preferred];
        for (var i = 0; i < _POLL_MODELS.length; i++) {
            if (_POLL_MODELS[i] !== preferred) order.push(_POLL_MODELS[i]);
        }

        for (var mi = 0; mi < order.length; mi++) {
            try {
                var res = await fetch(POLL_URL, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(Object.assign({}, body, { model: order[mi] })),
                    signal:  signal || undefined
                });
                if (res.ok) return res;
            } catch(e) {
                /* AbortError or network issue — stop trying */
                if (e && e.name === 'AbortError') throw e;
            }
        }

        /* All Pollinations models failed — return a synthetic ok response
           with an empty choices array so callers degrade gracefully */
        var fallbackJson = JSON.stringify({ choices: [] });
        return new Response(fallbackJson, { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    window.getGroqKey = function(){
        var stored = '';
        try { stored = (localStorage.getItem(STORAGE_KEY) || '').trim(); } catch(e) {}
        if (stored && stored.startsWith('gsk_')) return stored;
        var keys = _getMasterKeys();
        if (!keys.length) return '';
        var idx = _getIdx();
        _setIdx(idx + 1);
        return keys[idx];
    };

    window.groqFetch = async function(bodyObj, extraOpts) {
        var signal = (extraOpts || {}).signal;

        /* ── Personal key path (user's own Groq key stored in browser) ── */
        var personal = '';
        try { personal = (localStorage.getItem(STORAGE_KEY) || '').trim(); } catch(e) {}
        if (personal && personal.startsWith('gsk_')) {
            return fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + personal },
                body:    JSON.stringify(bodyObj)
            }));
        }

        var keys = _getMasterKeys();

        /* ── No Groq keys at all → go straight to Pollinations ── */
        if (!keys.length) {
            return _pollFetch(bodyObj, signal);
        }

        /* Enforce minimum inter-call gap to stay within RPM limits. */
        var now = Date.now();
        var gap = _lastCallTime + MIN_CALL_GAP_MS - now;
        if (gap > 0) await new Promise(function(r){ setTimeout(r, gap); });
        _lastCallTime = Date.now();

        /* ── Try each Groq key, skipping ones still in cooldown ── */
        var startIdx = _getIdx();

        for (var attempt = 0; attempt < keys.length; attempt++) {
            var idx = (startIdx + attempt) % keys.length;

            if (_isCooling(idx)) continue;

            var key = keys[idx];
            try {
                var res = await fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body:    JSON.stringify(bodyObj)
                }));

                if (res.status === 429) {
                    var retryAfter = res.headers ? res.headers.get('Retry-After') : null;
                    _markCooldown(idx, retryAfter);
                    _setIdx(idx + 1);
                    continue;
                }

                _setIdx(idx + 1);
                return res;
            } catch(e) {
                if (e && e.name === 'AbortError') throw e;
                /* Network error on this key — try next */
                continue;
            }
        }

        /* ── All Groq keys busy → silently fall back to Pollinations ── */
        return _pollFetch(bodyObj, signal);
    };

    window.setGroqKey = function(k){
        if (k && k.startsWith('gsk_'))
            try { localStorage.setItem(STORAGE_KEY, k.trim()); } catch(e) {}
    };

    window.setGroqKeys = function(arr){
        window._AQS_GROQ_MASTER_KEYS = (arr || []).filter(function(k){ return k && k.startsWith('gsk_'); });
        _keyCooldowns = {};
        _setIdx(0);
    };
})();
