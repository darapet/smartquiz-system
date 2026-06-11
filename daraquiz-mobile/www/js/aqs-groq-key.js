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

    /* ── Silent AI logger ── visible only when _AQS_ADMIN_MODE is set ──── */
    window._aqsAIErrorLog = window._aqsAIErrorLog || [];
    function _aqsLog(level, msg) {
        var entry = { t: new Date().toISOString(), level: level, msg: [].slice.call(arguments, 1).join(' ') };
        window._aqsAIErrorLog.unshift(entry);
        if (window._aqsAIErrorLog.length > 60) window._aqsAIErrorLog.length = 60;
        if (window._AQS_ADMIN_MODE) {
            if (level === 'error') console.error('[aqs-ai]', entry.msg);
            else console.warn('[aqs-ai]', entry.msg);
        }
    }
    /* ── Professional user error modal ─────────────────────────────────── */
    var _aqsLastErrTime = 0;
    function _aqsShowUserError(type) {
        var now = Date.now(); if (now - _aqsLastErrTime < 4000) return; _aqsLastErrTime = now;
        var old = document.getElementById('_aqs-err-modal'); if (old) old.remove();
        var isNet = type==='network', isCfg = type==='config';
        var icon  = isNet ? '📡' : '🤖';
        var title = isNet ? 'Connection Issue' : (isCfg ? 'AI Not Configured' : 'AI Unavailable');
        var msg   = isNet
            ? 'Your internet connection seems unstable. Please check your network and try again.'
            : (isCfg ? 'AI features have not been configured. Please contact the admin.'
                     : 'There is a network issue with the AI connection. The service may be temporarily unavailable.');
        var footer = !isNet ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);text-align:center;"><p style="margin:0 0 8px;font-size:.72rem;color:#64748b;letter-spacing:.05em;text-transform:uppercase;font-weight:700;">Contact Admin to Report This</p><div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;"><a href="https://wa.me/2349134873694" target="_blank" style="display:inline-flex;align-items:center;gap:5px;background:rgba(37,211,102,.1);border:1px solid rgba(37,211,102,.22);border-radius:8px;color:#4ade80;font-size:.8rem;font-weight:700;padding:7px 13px;text-decoration:none;">📱 WhatsApp</a><a href="tel:+2349134873694" style="display:inline-flex;align-items:center;gap:5px;background:rgba(14,165,233,.08);border:1px solid rgba(14,165,233,.18);border-radius:8px;color:#38bdf8;font-size:.8rem;font-weight:700;padding:7px 13px;text-decoration:none;">📞 Call</a><a href="mailto:daramolapeter98@gmail.com" style="display:inline-flex;align-items:center;gap:5px;background:rgba(249,115,22,.08);border:1px solid rgba(249,115,22,.18);border-radius:8px;color:#fb923c;font-size:.8rem;font-weight:700;padding:7px 13px;text-decoration:none;">✉️ Email</a></div></div>' : '';
        var modal = document.createElement('div'); modal.id = '_aqs-err-modal';
        modal.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:999997;max-width:430px;width:calc(100% - 32px);background:rgba(10,10,25,.97);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:20px 22px;box-shadow:0 20px 60px rgba(0,0,0,.75);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;animation:_aqsErrIn .4s cubic-bezier(.22,1,.36,1) both;';
        modal.innerHTML = '<style>@keyframes _aqsErrIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style><div style="display:flex;align-items:flex-start;gap:13px;"><div style="width:40px;height:40px;border-radius:10px;background:rgba(249,115,22,.13);border:1px solid rgba(249,115,22,.27);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">' + icon + '</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;"><span style="font-weight:800;color:#f1f5f9;font-size:.93rem;">' + title + '</span><button onclick="document.getElementById('_aqs-err-modal').remove();" style="background:none;border:none;color:#475569;font-size:1.05rem;cursor:pointer;padding:0;line-height:1;">✕</button></div><p style="margin:0;font-size:.82rem;color:#94a3b8;line-height:1.55;">' + msg + '</p>' + footer + '</div></div>';
        document.body.appendChild(modal);
        if (isNet) setTimeout(function(){ var m=document.getElementById('_aqs-err-modal'); if(m)m.remove(); }, 7000);
    }
    window._aqsShowUserError = _aqsShowUserError;


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
        var mBody    = Object.assign({}, bodyObj, { model: model });
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
        var mBody    = Object.assign({}, bodyObj, { model: model });
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
