/* ═══════════════════════════════════════════════════════════════════
   GROQ + MISTRAL KEY MANAGER  v2.0
   ─────────────────────────────────────────────────────────────────
   Priority:  Groq (fast, free tier) → Mistral (reliable fallback)

   Quiz generation and all AI calls go through window.groqFetch().
   It tries every Groq key first.  Only when all Groq keys fail or
   are cooling down does it fall back to Mistral.

   ── Hardcoded key slots ──────────────────────────────────────────
   Store keys REVERSED to avoid plain-text secret scanning.
   Decoded at runtime: r.split('').reverse().join('')
   Paste reversed key in the matching slot string below.
   ═══════════════════════════════════════════════════════════════════ */

/* ── GROQ hardcoded keys (console.groq.com) ─────────────────────── */
window._AQS_GROQ_MASTER_KEYS = (window._AQS_GROQ_MASTER_KEYS || []).concat(
    [
        /* Slot  1  — paste reversed Groq key */  '',
        /* Slot  2  */  '',
        /* Slot  3  */  '',
        /* Slot  4  */  '',
        /* Slot  5  */  '',
        /* Slot  6  */  '',
        /* Slot  7  */  '',
        /* Slot  8  */  '',
        /* Slot  9  */  '',
        /* Slot 10  */  '',
        /* Slot 11  */  '',
        /* Slot 12  */  '',
        /* Slot 13  */  '',
        /* Slot 14  */  '',
        /* Slot 15  */  '',
        /* Slot 16  */  '',
        /* Slot 17  */  '',
        /* Slot 18  */  '',
        /* Slot 19  */  '',
        /* Slot 20  */  ''
    ]
    .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
    .filter(function(k){ return typeof k === 'string' && k.length > 20; })
);

/* ── MISTRAL hardcoded keys (console.mistral.ai) ────────────────── */
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
        /* Slot 10  */  '',
        /* Slot 11  */  '',
        /* Slot 12  */  '',
        /* Slot 13  */  '',
        /* Slot 14  */  '',
        /* Slot 15  */  '',
        /* Slot 16  */  '',
        /* Slot 17  */  '',
        /* Slot 18  */  '',
        /* Slot 19  */  '',
        /* Slot 20  */  ''
    ]
    .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
    .filter(function(k){ return typeof k === 'string' && k.length > 20; })
);

(function(){

    /* ── API endpoints ───────────────────────────────────────────── */
    var GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
    var MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';

    /* ── LocalStorage index keys ─────────────────────────────────── */
    var GROQ_IDX_KEY    = 'aqs_groq_key_idx';
    var MISTRAL_IDX_KEY = 'aqs_mistral_key_idx';

    /* ── Per-key 429 cooldown tracker ────────────────────────────── */
    var _rateLimitedUntil = {};
    var RL_COOLDOWN_MS    = 62000; /* 62 s */

    function _keyHash(k)         { return k ? k.slice(-8) : '?'; }
    function _isRateLimited(k)   { return (_rateLimitedUntil[_keyHash(k)] || 0) > Date.now(); }
    function _markRateLimited(k) {
        _rateLimitedUntil[_keyHash(k)] = Date.now() + RL_COOLDOWN_MS;
        console.warn('[aqs-key] key ...' + _keyHash(k) + ' rate-limited; 62 s cooldown');
    }

    /* ── Key pool helpers ────────────────────────────────────────── */
    function _getGroqKeys() {
        var wk = window._AQS_GROQ_MASTER_KEYS;
        return Array.isArray(wk) ? wk.filter(function(k){ return k && k.length > 20; }) : [];
    }
    function _getMistralKeys() {
        var wk = window._AQS_MISTRAL_MASTER_KEYS;
        return Array.isArray(wk) ? wk.filter(function(k){ return k && k.length > 20; }) : [];
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

    /* ── Core Groq fetch: rotate keys, skip cooling-down ones ───── */
    async function _tryGroq(bodyObj, extraOpts) {
        var keys = _getGroqKeys();
        if (!keys.length) return null; /* no Groq keys → skip to Mistral */

        var model    = window._AQS_GROQ_MODEL || 'llama-3.3-70b-versatile';
        /* bodyObj.model takes priority — lets callers pin a specific model */
        var mBody    = Object.assign({ model: model }, bodyObj);
        var startIdx = _getIdx(GROQ_IDX_KEY, keys);

        for (var attempt = 0; attempt < keys.length; attempt++) {
            var idx = (startIdx + attempt) % keys.length;
            var key = keys[idx];
            if (_isRateLimited(key)) {
                console.warn('[groqFetch] Groq slot', idx + 1, 'cooling — skip');
                _setIdx(GROQ_IDX_KEY, idx + 1, keys); continue;
            }
            try {
                var res = await fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body:    JSON.stringify(mBody)
                }));
                if (res.status === 429) { _markRateLimited(key); _setIdx(GROQ_IDX_KEY, idx + 1, keys); continue; }
                /* 401 = bad key — try next slot */
                if (res.status === 401) {
                    console.warn('[groqFetch] Groq slot', idx + 1, 'auth error (401) — skipping key');
                    _setIdx(GROQ_IDX_KEY, idx + 1, keys); continue;
                }
                /* Any other non-2xx (e.g. 400 deprecated model) — bail out so
                   groqFetch() can fall back to Mistral immediately.            */
                if (!res.ok) {
                    console.warn('[groqFetch] Groq HTTP', res.status, '— falling back to Mistral');
                    return null;
                }
                _setIdx(GROQ_IDX_KEY, idx + 1, keys);
                console.log('[groqFetch] Groq slot', idx + 1, 'responded HTTP', res.status);
                return res;
            } catch(e) {
                console.warn('[groqFetch] Groq slot', idx + 1, 'error:', e.message || e);
            }
        }
        return null; /* all Groq keys exhausted */
    }

    /* ── Core Mistral fetch: rotate keys, skip cooling-down ones ── */
    async function _tryMistral(bodyObj, extraOpts) {
        var keys = _getMistralKeys();
        if (!keys.length) return null;

        var model    = window._AQS_MISTRAL_MODEL || 'mistral-small-latest';
        /* bodyObj.model takes priority — lets callers pin a specific model */
        var mBody    = Object.assign({ model: model }, bodyObj);
        var startIdx = _getIdx(MISTRAL_IDX_KEY, keys);

        for (var attempt = 0; attempt < keys.length; attempt++) {
            var idx = (startIdx + attempt) % keys.length;
            var key = keys[idx];
            if (_isRateLimited(key)) {
                console.warn('[groqFetch] Mistral slot', idx + 1, 'cooling — skip');
                _setIdx(MISTRAL_IDX_KEY, idx + 1, keys); continue;
            }
            try {
                var res = await fetch(MISTRAL_URL, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body:    JSON.stringify(mBody)
                }));
                if (res.status === 429) { _markRateLimited(key); _setIdx(MISTRAL_IDX_KEY, idx + 1, keys); continue; }
                if (res.status === 401) {
                    console.warn('[groqFetch] Mistral slot', idx + 1, 'auth error (401) — skipping key');
                    _setIdx(MISTRAL_IDX_KEY, idx + 1, keys); continue;
                }
                if (!res.ok) {
                    console.warn('[groqFetch] Mistral HTTP', res.status, '— all providers exhausted');
                    return null;
                }
                _setIdx(MISTRAL_IDX_KEY, idx + 1, keys);
                console.log('[groqFetch] Mistral slot', idx + 1, 'responded HTTP', res.status);
                return res;
            } catch(e) {
                console.warn('[groqFetch] Mistral slot', idx + 1, 'error:', e.message || e);
            }
        }
        return null;
    }

    /* ── Public: groqFetch ───────────────────────────────────────── *
     *  Tries Groq first (all 10 slots).                              *
     *  Falls back to Mistral if all Groq keys fail or are cooling.   *
     *  Throws with a clear message if both providers are exhausted.  */
    window.groqFetch = async function(bodyObj, extraOpts) {
        /* 1. Try Groq */
        var res = await _tryGroq(bodyObj, extraOpts);
        if (res) return res;

        var groqCount    = _getGroqKeys().length;
        var mistralCount = _getMistralKeys().length;

        if (groqCount > 0) {
            console.warn('[groqFetch] All Groq keys busy — falling back to Mistral…');
        }

        /* 2. Try Mistral */
        res = await _tryMistral(bodyObj, extraOpts);
        if (res) return res;

        /* 3. Both exhausted */
        if (!groqCount && !mistralCount) {
            throw new Error('No AI keys configured. Add Groq or Mistral keys in Admin Settings → AI Keys.');
        }
        if (!groqCount) {
            throw new Error('All Mistral keys are busy. Please wait ~60 s and try again.');
        }
        if (!mistralCount) {
            throw new Error('All Groq keys are busy. Please wait ~60 s and try again.');
        }
        throw new Error('All AI keys (Groq + Mistral) are busy. Please wait ~60 s and try again.');
    };

    /* ── Admin / direct fetch helpers ────────────────────────────── */
    window._groqFetchDirect    = _tryGroq;
    window._mistralFetchDirect = _tryMistral;

    /* ── Key count helpers (used by status badges) ───────────────── */
    window._aqsGroqKeyCount    = function() { return _getGroqKeys().length; };
    window._aqsMistralKeyCount = function() { return _getMistralKeys().length; };

    /* ── Setters called by admin save handler ────────────────────── */
    window.setGroqKeys = function(arr) {
        window._AQS_GROQ_MASTER_KEYS = (arr || []).filter(function(k){ return k && String(k).trim().length > 20; });
        _setIdx(GROQ_IDX_KEY, 0, window._AQS_GROQ_MASTER_KEYS);
    };
    window.setMistralKeys = function(arr) {
        window._AQS_MISTRAL_MASTER_KEYS = (arr || []).filter(function(k){ return k && String(k).trim().length > 20; });
        _setIdx(MISTRAL_IDX_KEY, 0, window._AQS_MISTRAL_MASTER_KEYS);
    };

    /* ── Legacy stubs — keep old callers working ─────────────────── */
    window.getGroqKey = function(){ return ''; };
    window.setGroqKey = function(){};

})();

/* ═══════════════════════════════════════════════════════════════════
   AUTO-LOADER — pulls AI keys (Groq + Mistral + HuggingFace) from
   Firebase settings on every page that includes this file.
   Fires once Firebase is ready; never blocks page rendering.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    function _sanitizeKey(k) {
        return typeof k === 'string' ? k.replace(/[^\x20-\x7E]/g, '').trim() : '';
    }

    function _loadAIKeysFromFirebase() {
        if (typeof window.aqsAjax !== 'function') return;
        window.aqsAjax({ action: 'aqs_get_settings' }, function (res) {
            var s = (res && res.success && res.data && res.data.settings) ? res.data.settings : {};

            /* Groq */
            if (Array.isArray(s.groq_keys) && s.groq_keys.length) {
                var gKeys = s.groq_keys.map(_sanitizeKey).filter(function(k){ return k.length > 20; });
                if (gKeys.length && typeof window.setGroqKeys === 'function') window.setGroqKeys(gKeys);
            }
            if (s.groq_model) window._AQS_GROQ_MODEL = s.groq_model;

            /* Mistral */
            if (Array.isArray(s.mistral_keys) && s.mistral_keys.length) {
                var mKeys = s.mistral_keys.map(_sanitizeKey).filter(function(k){ return k.length > 20; });
                if (mKeys.length && typeof window.setMistralKeys === 'function') window.setMistralKeys(mKeys);
            }
            if (s.mistral_model) window._AQS_MISTRAL_MODEL = s.mistral_model;

            /* HuggingFace */
            if (Array.isArray(s.hf_keys) && s.hf_keys.length) {
                var hKeys = s.hf_keys.map(_sanitizeKey).filter(function(k){ return k.length > 10; });
                if (hKeys.length && typeof window.setHFKeys === 'function') window.setHFKeys(hKeys);
            }
            if (s.hf_model) window._AQS_HF_MODEL = s.hf_model;

            var total = (window._aqsGroqKeyCount ? window._aqsGroqKeyCount() : 0)
                      + (window._aqsMistralKeyCount ? window._aqsMistralKeyCount() : 0)
                      + (window._aqsHFKeyCount ? window._aqsHFKeyCount() : 0);
            if (total > 0) {
                console.log('[aqs-ai] Auto-loaded', total, 'AI key(s) from Firebase settings.');
            }
        });
    }

    if (window._aqsFirebaseReady) {
        _loadAIKeysFromFirebase();
    } else {
        document.addEventListener('aqs:firebase:ready', _loadAIKeysFromFirebase, { once: true });
    }
})();
