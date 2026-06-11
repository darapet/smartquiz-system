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
