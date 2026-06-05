(function(){
    var GROQ_URL        = 'https://api.groq.com/openai/v1/chat/completions';
    var MISTRAL_URL     = 'https://api.mistral.ai/v1/chat/completions';
    var STORAGE_KEY     = 'aqs_groq_key';
    var IDX_KEY         = 'aqs_groq_key_idx';
    var MISTRAL_IDX_KEY = 'aqs_mistral_key_idx';

    /* ── Groq helpers ─────────────────────────────────────────────────────── */
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

    /* ── Mistral helpers ──────────────────────────────────────────────────── */
    function _getMistralKeys() {
        var wk = window._AQS_MISTRAL_MASTER_KEYS;
        if (Array.isArray(wk) && wk.length) return wk;
        return [];
    }
    function _getMistralIdx() {
        var keys = _getMistralKeys();
        if (!keys.length) return 0;
        var i = 0;
        try { i = parseInt(localStorage.getItem(MISTRAL_IDX_KEY) || '0') || 0; } catch(e) {}
        if (isNaN(i) || i >= keys.length) i = 0;
        return i;
    }
    function _setMistralIdx(i) {
        var keys = _getMistralKeys();
        try { localStorage.setItem(MISTRAL_IDX_KEY, String(i % Math.max(1, keys.length))); } catch(e) {}
    }

    /* ── Internal: try all Mistral keys silently ──────────────────────────── */
    async function _mistralFetch(bodyObj, extraOpts) {
        var mistralKeys = _getMistralKeys();
        if (!mistralKeys.length) return null;

        /* Use fastest Mistral model unless admin overrides */
        var mistralModel = window._AQS_MISTRAL_MODEL || 'mistral-small-latest';
        var mistralBody  = Object.assign({}, bodyObj, { model: mistralModel });

        var startIdx = _getMistralIdx();
        for (var attempt = 0; attempt < mistralKeys.length; attempt++) {
            var idx = (startIdx + attempt) % mistralKeys.length;
            var key = mistralKeys[idx];
            try {
                var res = await fetch(MISTRAL_URL, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body:    JSON.stringify(mistralBody)
                }));
                if (res.status === 429) {
                    console.warn('[mistralFetch] slot', idx, 'rate-limited — trying next…');
                    _setMistralIdx(idx + 1);
                    continue;
                }
                _setMistralIdx(idx + 1);
                return res;
            } catch(e) {
                console.warn('[mistralFetch] slot', idx, 'error:', e.message || e);
            }
        }
        return null;
    }

    /* ── Public API ───────────────────────────────────────────────────────── */

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

    /* ── Per-key 429 cooldown tracker ───────────────────────────────────── */
    /* When a key gets rate-limited we record it and skip it for 62 s so the  */
    /* next request doesn't hammer the same key again immediately.             */
    var _rateLimitedUntil = {};   /* last-8-chars of key → expiry timestamp   */
    var RL_COOLDOWN_MS = 62000;   /* 62 s — just past the Groq 1-min window   */

    function _keyHash(k) { return k ? k.slice(-8) : '?'; }
    function _isRateLimited(k) { return (_rateLimitedUntil[_keyHash(k)] || 0) > Date.now(); }
    function _markRateLimited(k) {
        _rateLimitedUntil[_keyHash(k)] = Date.now() + RL_COOLDOWN_MS;
        console.warn('[groqFetch] key …' + _keyHash(k) + ' is rate-limited; cooldown 62 s');
    }

    /* groqFetch — tries Groq (all keys, skipping cooling-down ones), then
       silently falls back to Mistral. No visible error until both fail.     */
    window.groqFetch = async function(bodyObj, extraOpts) {

        /* Personal browser-saved key — highest priority; skip if cooling down */
        var personal = '';
        try { personal = (localStorage.getItem(STORAGE_KEY) || '').trim(); } catch(e) {}
        if (personal && personal.startsWith('gsk_') && !_isRateLimited(personal)) {
            try {
                var pRes = await fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + personal },
                    body:    JSON.stringify(bodyObj)
                }));
                if (pRes.status === 429) { _markRateLimited(personal); }
                else { return pRes; }
            } catch(e) { /* fall through */ }
        }

        /* Try all Groq master keys (rotating, skip keys still in cooldown) */
        var groqKeys = _getMasterKeys();
        if (groqKeys.length) {
            var startIdx = _getIdx();
            for (var attempt = 0; attempt < groqKeys.length; attempt++) {
                var idx = (startIdx + attempt) % groqKeys.length;
                var key = groqKeys[idx];
                if (_isRateLimited(key)) {
                    console.warn('[groqFetch] slot', idx, 'still cooling down — skipping');
                    _setIdx(idx + 1);
                    continue;
                }
                try {
                    var res = await fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                        body:    JSON.stringify(bodyObj)
                    }));
                    if (res.status === 429) {
                        _markRateLimited(key);
                        _setIdx(idx + 1);
                        continue;
                    }
                    _setIdx(idx + 1);
                    return res;
                } catch(e) {
                    console.warn('[groqFetch] slot', idx, 'error:', e.message || e);
                }
            }
            console.warn('[groqFetch] All Groq keys exhausted — switching to Mistral…');
        }

        /* Silent Mistral fallback */
        var mistralRes = await _mistralFetch(bodyObj, extraOpts);
        if (mistralRes) return mistralRes;

        /* Both providers failed — throw so callers can handle gracefully */
        if (!groqKeys.length && !_getMistralKeys().length) {
            throw new Error('No AI keys configured. Ask the admin to add keys in Settings.');
        }
        throw new Error('AI temporarily unavailable. Please try again in a moment.');
    };

    window.setGroqKey = function(k){
        if (k && k.startsWith('gsk_'))
            try { localStorage.setItem(STORAGE_KEY, k.trim()); } catch(e) {}
    };

    window.setGroqKeys = function(arr){
        window._AQS_GROQ_MASTER_KEYS = (arr || []).filter(function(k){ return k && k.startsWith('gsk_'); });
        _setIdx(0);
    };

    window.setMistralKeys = function(arr){
        window._AQS_MISTRAL_MASTER_KEYS = (arr || []).filter(function(k){ return k && k.trim().length > 20; });
        _setMistralIdx(0);
    };
})();
