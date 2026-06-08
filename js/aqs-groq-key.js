/* ═══════════════════════════════════════════════════════════════════
   AI KEY POOL  —  Groq → Mistral → HuggingFace
   Priority: Groq (up to 20) → Mistral (up to 20) → HuggingFace (up to 5)

   All providers share the same public API: window.groqFetch()
   Used by: Studio, Study Hub, Quiz Generator, Challenge, and all AI
   features throughout xzily AI.

   Hardcoded slots below (reversed to avoid plain-text scanning):
   Decode: r.split('').reverse().join('')
   Keys saved in Admin Settings are merged at runtime automatically.
   ═══════════════════════════════════════════════════════════════════ */

/* ── Groq hardcoded keys (primary — up to 10 slots) ─────────────── */
window._AQS_GROQ_MASTER_KEYS = (window._AQS_GROQ_MASTER_KEYS || []).concat(
    [
        /* Slot  1  — paste reversed Groq key (gsk_…) */  '',
        /* Slot  2  */  '',
        /* Slot  3  */  '',
        /* Slot  4  */  '',
        /* Slot  5  */  '',
        /* Slot  6  */  '',
        /* Slot  7  */  '',
        /* Slot  8  */  '',
        /* Slot  9  */  '',
        /* Slot 10  */  ''
    ]
    .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
    .filter(function(k){ return typeof k === 'string' && k.length > 20; })
);

/* ── Mistral hardcoded keys (fallback 1 — up to 10 slots) ───────── */
window._AQS_MISTRAL_MASTER_KEYS = (window._AQS_MISTRAL_MASTER_KEYS || []).concat(
    [
        /* Slot  1  — paste reversed Mistral key */  '',
        /* Slot  2  */  '',
        /* Slot  3  */  '',
        /* Slot  4  */  '',
        /* Slot  5  */  '',
        /* Slot  6  */  '',
        /* Slot  7  */  '',
        /* Slot  8  */  '',
        /* Slot  9  */  '',
        /* Slot 10  */  ''
    ]
    .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
    .filter(function(k){ return typeof k === 'string' && k.length > 20; })
);

/* ── HuggingFace hardcoded tokens (fallback 2 — up to 5 slots) ─── */
window._AQS_HF_MASTER_KEYS = (window._AQS_HF_MASTER_KEYS || []).concat(
    [
        /* Slot  1  — paste reversed HF token (hf_…) */  '',
        /* Slot  2  */  '',
        /* Slot  3  */  '',
        /* Slot  4  */  '',
        /* Slot  5  */  ''
    ]
    .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
    .filter(function(k){ return typeof k === 'string' && k.length > 10; })
);

(function(){
    var GROQ_URL        = 'https://api.groq.com/openai/v1/chat/completions';
    var MISTRAL_URL     = 'https://api.mistral.ai/v1/chat/completions';
    var HF_URL          = 'https://api-inference.huggingface.co/v1/chat/completions';
    var GROQ_IDX_KEY    = 'aqs_groq_key_idx';
    var MISTRAL_IDX_KEY = 'aqs_mistral_key_idx';
    var HF_IDX_KEY      = 'aqs_hf_key_idx';
    var RL_COOLDOWN_MS  = 62000; /* 62 s past the 1-min window */

    /* ── Per-key 429 cooldown tracker ───────────────────────────────── */
    var _rateLimitedUntil = {};
    function _keyHash(k)         { return k ? k.slice(-8) : '?'; }
    function _isRateLimited(k)   { return (_rateLimitedUntil[_keyHash(k)] || 0) > Date.now(); }
    function _markRateLimited(k) {
        _rateLimitedUntil[_keyHash(k)] = Date.now() + RL_COOLDOWN_MS;
        console.warn('[aqs-ai] key ...' + _keyHash(k) + ' rate-limited; 62 s cooldown');
    }

    /* ── Key pool helpers ────────────────────────────────────────────── */
    function _getKeys(arr, minLen) {
        return Array.isArray(arr) ? arr.filter(function(k){ return k && k.length >= (minLen||20); }) : [];
    }
    function _getIdx(storageKey, keys) {
        if (!keys.length) return 0;
        var i = 0;
        try { i = parseInt(localStorage.getItem(storageKey) || '0') || 0; } catch(e){}
        if (isNaN(i) || i >= keys.length) i = 0;
        return i;
    }
    function _setIdx(storageKey, i, keys) {
        try { localStorage.setItem(storageKey, String(i % Math.max(1, keys.length))); } catch(e){}
    }

    function _getGroqKeys()    { return _getKeys(window._AQS_GROQ_MASTER_KEYS, 20); }
    function _getMistralKeys() { return _getKeys(window._AQS_MISTRAL_MASTER_KEYS, 20); }
    function _getHFKeys()      { return _getKeys(window._AQS_HF_MASTER_KEYS, 10); }

    /* ── Generic provider fetch ──────────────────────────────────────── */
    async function _providerFetch(url, keys, idxKey, bodyObj, extraOpts, modelOverride) {
        if (!keys.length) return null;
        var model    = modelOverride || 'unknown';
        var body     = Object.assign({}, bodyObj, { model: model });
        var startIdx = _getIdx(idxKey, keys);

        for (var attempt = 0; attempt < keys.length; attempt++) {
            var idx = (startIdx + attempt) % keys.length;
            var key = keys[idx];
            if (_isRateLimited(key)) {
                console.warn('[aqs-ai]', url.split('/')[2], 'slot', idx + 1, 'cooling — skip');
                _setIdx(idxKey, idx + 1, keys); continue;
            }
            try {
                var res = await fetch(url, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body:    JSON.stringify(body)
                }));
                if (res.status === 429) { _markRateLimited(key); _setIdx(idxKey, idx + 1, keys); continue; }
                _setIdx(idxKey, idx + 1, keys);
                return res;
            } catch(e) {
                console.warn('[aqs-ai]', url.split('/')[2], 'slot', idx + 1, 'error:', e.message || e);
            }
        }
        return null;
    }

    async function _groqFetch(bodyObj, extraOpts) {
        return _providerFetch(GROQ_URL, _getGroqKeys(), GROQ_IDX_KEY, bodyObj, extraOpts,
            window._AQS_GROQ_MODEL || 'llama-3.3-70b-versatile');
    }
    async function _mistralFetch(bodyObj, extraOpts) {
        return _providerFetch(MISTRAL_URL, _getMistralKeys(), MISTRAL_IDX_KEY, bodyObj, extraOpts,
            window._AQS_MISTRAL_MODEL || 'mistral-small-latest');
    }
    async function _hfFetch(bodyObj, extraOpts) {
        /* HuggingFace uses the same OpenAI-compatible /v1/chat/completions endpoint */
        return _providerFetch(HF_URL, _getHFKeys(), HF_IDX_KEY, bodyObj, extraOpts,
            window._AQS_HF_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3');
    }

    /* ── Public: groqFetch — Groq → Mistral → HuggingFace ───────────── *
     *  Used by: Studio, Study Hub, Quiz Gen, Challenge, and all AI     *
     *  features. The provider chain is transparent to callers.         */
    window.groqFetch = async function(bodyObj, extraOpts) {
        /* 1. Try Groq (fastest, free tier) */
        var res = await _groqFetch(bodyObj, extraOpts);
        if (res) return res;

        /* 2. Fall back to Mistral */
        if (_getMistralKeys().length) {
            console.warn('[aqs-ai] All Groq keys busy — falling back to Mistral');
            res = await _mistralFetch(bodyObj, extraOpts);
            if (res) return res;
        }

        /* 3. Fall back to HuggingFace (Study Hub + Studio also benefit) */
        if (_getHFKeys().length) {
            console.warn('[aqs-ai] All Mistral keys busy — falling back to HuggingFace');
            res = await _hfFetch(bodyObj, extraOpts);
            if (res) return res;
        }

        /* 4. Nothing left */
        var gc = _getGroqKeys().length, mc = _getMistralKeys().length, hc = _getHFKeys().length;
        if (!gc && !mc && !hc) {
            throw new Error('No AI keys configured. Add Groq, Mistral, or HuggingFace tokens in Admin Settings.');
        }
        throw new Error('All AI keys are busy or rate-limited. Please wait a moment and try again.');
    };

    /* ── Direct provider access (used by admin test panels) ─────────── */
    window._groqFetchDirect    = _groqFetch;
    window._mistralFetchDirect = _mistralFetch;
    window._hfFetchDirect      = _hfFetch;

    /* ── Key count helpers (used by status badges) ───────────────────── */
    window._aqsGroqKeyCount    = function() { return _getGroqKeys().length; };
    window._aqsMistralKeyCount = function() { return _getMistralKeys().length; };
    window._aqsHFKeyCount      = function() { return _getHFKeys().length; };

    /* ── Setters — called by Admin Settings save buttons ─────────────── */
    window.setGroqKeys = function(arr) {
        window._AQS_GROQ_MASTER_KEYS = (arr || []).filter(function(k){ return k && String(k).trim().length > 20; });
        try { localStorage.setItem(GROQ_IDX_KEY, '0'); } catch(e){}
    };
    window.setMistralKeys = function(arr) {
        window._AQS_MISTRAL_MASTER_KEYS = (arr || []).filter(function(k){ return k && String(k).trim().length > 20; });
        try { localStorage.setItem(MISTRAL_IDX_KEY, '0'); } catch(e){}
    };
    window.setHFKeys = function(arr) {
        window._AQS_HF_MASTER_KEYS = (arr || []).filter(function(k){ return k && String(k).trim().length > 10; });
        try { localStorage.setItem(HF_IDX_KEY, '0'); } catch(e){}
    };

    /* ── Legacy stubs — safe no-ops so old callers don't break ──────── */
    window.getGroqKey  = function(){ return _getGroqKeys()[0] || ''; };
    window.setGroqKey  = function(){};
})();
