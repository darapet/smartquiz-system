/* ═══════════════════════════════════════════════════════════════════
   AI KEY POOL  —  Groq → Mistral → HuggingFace
   Priority: Groq (up to 20) → Mistral (up to 20) → HuggingFace (up to 5)

   All providers share the same public API: window.groqFetch()
   Used by: Studio, Study Hub, Quiz Generator, Challenge, and all AI
   features throughout xzily AI.

   Hardcoded slots are intentionally empty — all keys are managed via
   Admin Settings (stored in Firestore, loaded at runtime automatically).
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

/* ── Keys-ready promise ──────────────────────────────────────────────
   Resolves once the Firebase auto-loader has finished (or after a
   5-second timeout). groqFetch() awaits this before deciding that no
   keys are configured, so a slow Firestore read no longer causes a
   false "AI Not Configured" error on page load.
   ─────────────────────────────────────────────────────────────────── */
window._aqsKeysReady = new Promise(function(resolve) {
    window._aqsKeysReadyResolve = resolve;
    /* Safety timeout: resolve after 5 s even if Firebase never fires */
    setTimeout(resolve, 5000);
});

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
    /* expose so the auto-loader IIFE below can also use it */
    window._aqsLog = _aqsLog;

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
        modal.innerHTML = '<style>@keyframes _aqsErrIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}</style><div style="display:flex;align-items:flex-start;gap:13px;"><div style="width:40px;height:40px;border-radius:10px;background:rgba(249,115,22,.13);border:1px solid rgba(249,115,22,.27);display:flex;align-items:center;justify-content:center;font-size:1.3rem;flex-shrink:0;">' + icon + '</div><div style="flex:1;min-width:0;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;"><span style="font-weight:800;color:#f1f5f9;font-size:.93rem;">' + title + '</span><button onclick="document.getElementById(\'_aqs-err-modal\').remove();" style="background:none;border:none;color:#475569;font-size:1.05rem;cursor:pointer;padding:0;line-height:1;">✕</button></div><p style="margin:0;font-size:.82rem;color:#94a3b8;line-height:1.55;">' + msg + '</p>' + footer + '</div></div>';
        document.body.appendChild(modal);
        if (isNet) setTimeout(function(){ var m=document.getElementById('_aqs-err-modal'); if(m)m.remove(); }, 7000);
    }
    window._aqsShowUserError = _aqsShowUserError;


    function _keyHash(k)         { return k ? k.slice(-8) : '?'; }
    function _isRateLimited(k)   { return (_rateLimitedUntil[_keyHash(k)] || 0) > Date.now(); }
    function _markRateLimited(k) {
        _rateLimitedUntil[_keyHash(k)] = Date.now() + RL_COOLDOWN_MS;
        _aqsLog('warn', 'key ...' + _keyHash(k) + ' rate-limited; 62 s cooldown');
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
            var key = _sanitizeKey ? _sanitizeKey(keys[idx]) : (keys[idx] || '').trim();
            if (_isRateLimited(key)) {
                _aqsLog('warn', url.split('/')[2] + ' slot ' + (idx + 1) + ' cooling — skip');
                _setIdx(idxKey, idx + 1, keys); continue;
            }
            try {
                var res = await fetch(url, Object.assign({}, extraOpts || {}, {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                    body:    JSON.stringify(body)
                }));
                if (res.status === 413) { _aqsLog('warn', url.split('/')[2] + ' slot ' + (idx + 1) + ' — 413 payload too large, skipping key'); _setIdx(idxKey, idx + 1, keys); continue; }
                if (res.status === 429) { _markRateLimited(key); _setIdx(idxKey, idx + 1, keys); continue; }
                _setIdx(idxKey, idx + 1, keys);
                return res;
            } catch(e) {
                if (!navigator.onLine || (e instanceof TypeError && /fetch|network/i.test(e.message||''))) { _aqsShowUserError('network'); } _aqsLog('error', url.split('/')[2] + ' slot ' + (idx + 1) + ' error: ' + (e.message || e));
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
        /* Wait for the Firebase key auto-loader to complete before checking
           key counts. This prevents false "not configured" errors that happen
           when groqFetch is called before the async Firestore read finishes.
           The promise resolves in ≤5 s (safety timeout) so we never hang. */
        if (!_getGroqKeys().length && !_getMistralKeys().length && !_getHFKeys().length) {
            await window._aqsKeysReady;
        }

        /* 1. Try Groq (fastest, free tier) */
        var res = await _groqFetch(bodyObj, extraOpts);
        if (res) return res;

        /* 2. Fall back to Mistral */
        if (_getMistralKeys().length) {
            _aqsLog('warn', 'All Groq keys busy — falling back to Mistral');
            res = await _mistralFetch(bodyObj, extraOpts);
            if (res) return res;
        }

        /* 3. Fall back to HuggingFace (Study Hub + Studio also benefit) */
        if (_getHFKeys().length) {
            _aqsLog('warn', 'All Mistral keys busy — falling back to HuggingFace');
            res = await _hfFetch(bodyObj, extraOpts);
            if (res) return res;
        }

        /* 4. Nothing left */
        var gc = _getGroqKeys().length, mc = _getMistralKeys().length, hc = _getHFKeys().length;
        if (!gc && !mc && !hc) {
            _aqsShowUserError('config'); throw new Error('AI features not configured.');
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
    /* Strip invisible / non-ASCII chars that can sneak in when copy-pasting keys */
    function _sanitizeKey(k) {
        return typeof k === 'string' ? k.replace(/[^\x20-\x7E]/g, '').trim() : '';
    }

    window.setGroqKeys = function(arr) {
        window._AQS_GROQ_MASTER_KEYS = (arr || []).map(_sanitizeKey).filter(function(k){ return k.length > 20; });
        try { localStorage.setItem(GROQ_IDX_KEY, '0'); localStorage.setItem('aqs_groq_saved_at', Date.now()); } catch(e){}
    };
    window.setMistralKeys = function(arr) {
        window._AQS_MISTRAL_MASTER_KEYS = (arr || []).map(_sanitizeKey).filter(function(k){ return k.length > 20; });
        try { localStorage.setItem(MISTRAL_IDX_KEY, '0'); localStorage.setItem('aqs_mistral_saved_at', Date.now()); } catch(e){}
    };
    window.setHFKeys = function(arr) {
        window._AQS_HF_MASTER_KEYS = (arr || []).map(_sanitizeKey).filter(function(k){ return k.length > 10; });
        try { localStorage.setItem(HF_IDX_KEY, '0'); localStorage.setItem('aqs_hf_saved_at', Date.now()); } catch(e){}
    };

    /* ── Legacy stubs — safe no-ops so old callers don't break ──────── */
    window.getGroqKey  = function(){ return _getGroqKeys()[0] || ''; };
    window.setGroqKey  = function(){};
})();

/* ═══════════════════════════════════════════════════════════════════
   AUTO-LOADER — pulls AI keys from Firebase settings on every page
   that includes this file + aqs-firebase.js (Studio, Study Hub, etc.)
   Fires once Firebase is ready; never blocks page rendering.
   Resolves window._aqsKeysReady when complete so groqFetch() can
   safely wait for keys before declaring "not configured".
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    function _loadAIKeysFromFirebase() {
        if (typeof window.aqsAjax !== 'function') {
            /* aqsAjax not available — resolve immediately so groqFetch
               doesn't wait forever on pages without aqs-firebase.js */
            if (typeof window._aqsKeysReadyResolve === 'function') {
                window._aqsKeysReadyResolve();
                window._aqsKeysReadyResolve = null;
            }
            return;
        }
        window.aqsAjax({ action: 'aqs_get_settings' }, function (res) {
            var s = (res && res.success && res.data && res.data.settings) ? res.data.settings : {};

            /* Groq */
            if (Array.isArray(s.groq_keys) && s.groq_keys.length) {
                window.setGroqKeys(s.groq_keys);
            }
            if (s.groq_model) window._AQS_GROQ_MODEL = s.groq_model;

            /* Mistral */
            if (Array.isArray(s.mistral_keys) && s.mistral_keys.length) {
                window.setMistralKeys(s.mistral_keys);
            }
            if (s.mistral_model) window._AQS_MISTRAL_MODEL = s.mistral_model;

            /* HuggingFace */
            if (Array.isArray(s.hf_keys) && s.hf_keys.length) {
                window.setHFKeys(s.hf_keys);
            }
            if (s.hf_model) window._AQS_HF_MODEL = s.hf_model;

            var total = (window._aqsGroqKeyCount ? window._aqsGroqKeyCount() : 0)
                      + (window._aqsMistralKeyCount ? window._aqsMistralKeyCount() : 0)
                      + (window._aqsHFKeyCount ? window._aqsHFKeyCount() : 0);
            if (total > 0 && typeof window._aqsLog === 'function') {
                window._aqsLog('info', 'Auto-loaded ' + total + ' AI key(s) from Firebase settings.');
            }

            /* Load feature-specific pools */
            var _fp = {
                quiz: 'quiz_groq_keys', challenge: 'challenge_groq_keys',
                studyhub: 'studyhub_groq_keys', textdocs: 'textdocs_groq_keys',
                puzzle: 'puzzle_groq_keys', quizstudio: 'quizstudio_groq_keys'
            };
            Object.keys(_fp).forEach(function(id) {
                var field = _fp[id];
                if (Array.isArray(s[field]) && s[field].length && typeof window.setFeatureGroqKeys === 'function') {
                    window.setFeatureGroqKeys(id, s[field]);
                }
            });

            /* Signal that keys are now available */
            if (typeof window._aqsKeysReadyResolve === 'function') {
                window._aqsKeysReadyResolve();
                window._aqsKeysReadyResolve = null;
            }
        });
    }

    if (window._aqsFirebaseReady) {
        _loadAIKeysFromFirebase();
    } else {
        document.addEventListener('aqs:firebase:ready', _loadAIKeysFromFirebase, { once: true });
    }
})();


/* ═══════════════════════════════════════════════════════════════════
   FEATURE-SPECIFIC GROQ KEY POOLS
   Each app feature has its own isolated 10-slot Groq key pool.
   Pools auto-load from Firebase admin settings and fall back to the
   main window.groqFetch (Groq → Mistral) if own keys are exhausted.
   Exposed as: window.quizGroqFetch, window.challengeGroqFetch, etc.
═══════════════════════════════════════════════════════════════════ */
(function () {
    var RL_MS = 62000;
    var _pools = {};

    function _createPool(id) {
        var slots = [], rl = {}, IDX = 'aqs_fp_' + id;
        function _h(k) { return k ? k.slice(-8) : '?'; }
        function _isRL(k) { return (rl[_h(k)] || 0) > Date.now(); }
        function _markRL(k) { rl[_h(k)] = Date.now() + RL_MS; }
        function _idx() {
            var i = 0;
            try { i = parseInt(localStorage.getItem(IDX) || '0') || 0; } catch(e) {}
            return (isNaN(i) || i >= Math.max(1, slots.length)) ? 0 : i;
        }
        function _setIdx(i) {
            try { localStorage.setItem(IDX, String(i % Math.max(1, slots.length))); } catch(e) {}
        }
        return {
            setKeys: function(arr) {
                slots.length = 0;
                (arr || []).map(function(k) { return (k || '').replace(/[^ -~]/g, '').trim(); })
                           .filter(function(k) { return k.length > 20; })
                           .forEach(function(k) { slots.push(k); });
                try { localStorage.setItem(IDX, '0'); } catch(e) {}
            },
            keyCount: function() { return slots.length; },
            getKey: function() {
                if (!slots.length) return null;
                var start = _idx();
                for (var i = 0; i < slots.length; i++) {
                    var k = slots[(start + i) % slots.length];
                    if (!_isRL(k)) return k;
                }
                return slots[start % slots.length]; /* all rate-limited — return current anyway */
            },
            fetch: async function(bodyObj) {
                var URL_ = 'https://api.groq.com/openai/v1/chat/completions';
                if (slots.length) {
                    var start = _idx();
                    for (var i = 0; i < slots.length; i++) {
                        var at = (start + i) % slots.length, key = slots[at];
                        if (_isRL(key)) { _setIdx(at + 1); continue; }
                        try {
                            var res = await fetch(URL_, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                                body: JSON.stringify(bodyObj)
                            });
                            if (res.status === 429) { _markRL(key); _setIdx(at + 1); continue; }
                            if (res.status === 413) { _setIdx(at + 1); continue; }
                            _setIdx(at + 1);
                            return res;
                        } catch(e) { console.warn('[' + id + '-pool] slot ' + (at + 1) + ':', e.message); }
                    }
                }
                /* No keys configured or all rate-limited — do NOT fall back to main pool */
                throw new Error('No AI keys configured for this feature. Add keys in Admin Settings → ' + id + ' pool.');
            }
        };
    }

    /* Initialise all feature pools */
    ['quiz', 'challenge', 'studyhub', 'textdocs', 'puzzle', 'quizstudio',
     'docsgen', 'imagegen', 'animate', 'designstudio', 'dashboard', 'tts', 'quotes'].forEach(function(id) {
        _pools[id] = _createPool(id);
    });

    /* Public key management API */
    window.setFeatureGroqKeys = function(id, arr) {
        if (_pools[id]) _pools[id].setKeys(arr);
    };
    window.getFeatureGroqKeyCount = function(id) {
        return _pools[id] ? _pools[id].keyCount() : 0;
    };
    /* Returns first available key from a feature pool, falling back to
       the main Groq pool — used for endpoints that need a raw key
       (e.g. Whisper audio/transcriptions). Never returns a hardcoded key. */
    window.getFeatureGroqKey = function(id) {
        if (_pools[id]) {
            var k = _pools[id].getKey();
            if (k) return k;
        }
        /* Fall back to main admin pool */
        return (typeof window.getGroqKey === 'function' ? window.getGroqKey() : null) || null;
    };

    /* Named fetch shortcuts (used by each feature JS file) */
    window.quizGroqFetch          = function(b) { return _pools.quiz.fetch(b); };
    window.challengeGroqFetch     = function(b) { return _pools.challenge.fetch(b); };
    window.studyhubGroqFetch      = function(b) { return _pools.studyhub.fetch(b); };
    window.textdocsGroqFetch      = function(b) { return _pools.textdocs.fetch(b); };
    window.puzzleGroqFetch        = function(b) { return _pools.puzzle.fetch(b); };
    window.quizstudioGroqFetch    = function(b) { return _pools.quizstudio.fetch(b); };
    window.docsgenGroqFetch       = function(b) { return _pools.docsgen.fetch(b); };
    window.imagegenGroqFetch      = function(b) { return _pools.imagegen.fetch(b); };
    window.animateGroqFetch       = function(b) { return _pools.animate.fetch(b); };
    window.designstudioGroqFetch  = function(b) { return _pools.designstudio.fetch(b); };
    window.dashboardGroqFetch     = function(b) { return _pools.dashboard.fetch(b); };
    window.ttsGroqFetch           = function(b) { return _pools.tts.fetch(b); };
    window.quotesGroqFetch        = function(b) { return _pools.quotes.fetch(b); };
})();
