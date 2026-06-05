/* ═══════════════════════════════════════════════════════════════════
   MISTRAL HARDCODED KEYS  (primary AI — Groq removed)
   Add up to 10 Mistral API keys below (console.mistral.ai).
   These load INSTANTLY — no Firebase / Admin Settings needed.
   Keys saved in Admin Settings are MERGED on top automatically.

   Store reversed to avoid plain-text secret scanning.
   Decoded at runtime: r.split('').reverse().join('')
   ═══════════════════════════════════════════════════════════════════ */
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

(function(){
    var MISTRAL_URL     = 'https://api.mistral.ai/v1/chat/completions';
    var MISTRAL_IDX_KEY = 'aqs_mistral_key_idx';

    /* ── Per-key 429 cooldown tracker ───────────────────────────────── */
    var _rateLimitedUntil = {};
    var RL_COOLDOWN_MS    = 62000; /* 62 s past the 1-min window */

    function _keyHash(k)         { return k ? k.slice(-8) : '?'; }
    function _isRateLimited(k)   { return (_rateLimitedUntil[_keyHash(k)] || 0) > Date.now(); }
    function _markRateLimited(k) {
        _rateLimitedUntil[_keyHash(k)] = Date.now() + RL_COOLDOWN_MS;
        console.warn('[mistralFetch] key ...' + _keyHash(k) + ' rate-limited; 62 s cooldown');
    }

    /* ── Key pool helpers ────────────────────────────────────────────── */
    function _getKeys() {
        var wk = window._AQS_MISTRAL_MASTER_KEYS;
        return Array.isArray(wk) ? wk.filter(function(k){ return k && k.length > 20; }) : [];
    }
    function _getIdx() {
        var keys = _getKeys(); if (!keys.length) return 0;
        var i = 0;
        try { i = parseInt(localStorage.getItem(MISTRAL_IDX_KEY) || '0') || 0; } catch(e){}
        if (isNaN(i) || i >= keys.length) i = 0;
        return i;
    }
    function _setIdx(i) {
        var keys = _getKeys();
        try { localStorage.setItem(MISTRAL_IDX_KEY, String(i % Math.max(1, keys.length))); } catch(e){}
    }

    /* ── Core Mistral fetch: rotate keys, skip cooled-down ones ─────── */
    async function _mistralFetch(bodyObj, extraOpts) {
        var keys = _getKeys();
        if (!keys.length) return null;

        var model       = window._AQS_MISTRAL_MODEL || 'mistral-small-latest';
        var mBody       = Object.assign({}, bodyObj, { model: model });
        var startIdx    = _getIdx();

        for (var attempt = 0; attempt < keys.length; attempt++) {
            var idx = (startIdx + attempt) % keys.length;
            var key = keys[idx];
            if (_isRateLimited(key)) {
                console.warn('[mistralFetch] slot', idx + 1, 'cooling down — skip');
                _setIdx(idx + 1); continue;
            }
            try {
                var res = await fetch(MISTRAL_URL, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body:    JSON.stringify(mBody)
                }));
                if (res.status === 429) { _markRateLimited(key); _setIdx(idx + 1); continue; }
                _setIdx(idx + 1);
                return res;
            } catch(e) {
                console.warn('[mistralFetch] slot', idx + 1, 'error:', e.message || e);
            }
        }
        return null; /* all keys exhausted or cooling down */
    }

    /* ── Public: groqFetch — name kept for backward compat ──────────── *
     *  All chat AI (streaming + non-streaming) now routes to Mistral.  *
     *  Groq has been fully removed from the chat AI path.              */
    window.groqFetch = async function(bodyObj, extraOpts) {
        var res = await _mistralFetch(bodyObj, extraOpts);
        if (res) return res;

        var keys = _getKeys();
        if (!keys.length) {
            throw new Error('No Mistral keys configured. Add keys in Admin Settings.');
        }
        throw new Error('All Mistral keys are busy. Please wait a moment and try again.');
    };

    /* ── Admin key-health monitor helper ────────────────────────────── */
    window._mistralFetchDirect = _mistralFetch;

    /* ── Count available keys (used by status badge) ─────────────────── */
    window._aqsMistralKeyCount = function() { return _getKeys().length; };

    /* ── Legacy stubs — safe no-ops so old callers don't break ──────── */
    window.getGroqKey  = function(){ return ''; };
    window.setGroqKey  = function(){};
    window.setGroqKeys = function(){};

    window.setMistralKeys = function(arr){
        window._AQS_MISTRAL_MASTER_KEYS = (arr||[]).filter(function(k){ return k && String(k).trim().length > 20; });
        _setIdx(0);
    };
})();
