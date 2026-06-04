(function(){
    var GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
    var STORAGE_KEY = 'aqs_groq_key';
    var IDX_KEY     = 'aqs_groq_key_idx';

    /* Per-key cooldown tracking. Maps key index → timestamp (ms) when it
       becomes available again. Stored in memory only (resets on page load). */
    var _keyCooldowns = {};

    /* Global inter-call throttle. Groq's free tier has ~30 RPM per key.
       Enforcing a 2-second minimum between calls keeps usage well under that. */
    var _lastCallTime = 0;
    var MIN_CALL_GAP_MS = 2000;

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
        console.warn('[groqFetch] key slot', idx, 'cooling down for', waitSec, 's');
    }

    /* Returns true if the key slot is still in cooldown. */
    function _isCooling(idx) {
        var until = _keyCooldowns[idx];
        return until && Date.now() < until;
    }

    /* Returns how many ms until the soonest key becomes available (0 = now). */
    function _msUntilNextKey(keys) {
        var now = Date.now();
        var soonest = Infinity;
        for (var i = 0; i < keys.length; i++) {
            var until = _keyCooldowns[i] || 0;
            if (until <= now) return 0;
            if (until < soonest) soonest = until;
        }
        return soonest === Infinity ? 0 : Math.max(0, soonest - now);
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
        if (!keys.length) throw new Error('No Groq API keys configured. Ask the site admin to add keys in Settings.');

        /* Enforce minimum inter-call gap to stay within RPM limits. */
        var now = Date.now();
        var gap = _lastCallTime + MIN_CALL_GAP_MS - now;
        if (gap > 0) await new Promise(function(r){ setTimeout(r, gap); });
        _lastCallTime = Date.now();

        /* Try each key, skipping ones still in their cooldown window. */
        var startIdx = _getIdx();

        for (var attempt = 0; attempt < keys.length; attempt++) {
            var idx = (startIdx + attempt) % keys.length;

            if (_isCooling(idx)) {
                console.warn('[groqFetch] key slot', idx, 'still cooling — skipping');
                continue;
            }

            var key = keys[idx];
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
        }

        /* All keys exhausted — report soonest available time */
        var waitMs  = _msUntilNextKey(keys);
        var waitSec = Math.ceil(waitMs / 1000);
        var msg = waitSec > 0
            ? 'All AI slots are busy right now. Please try again in ' + waitSec + ' seconds.'
            : 'All AI slots are busy right now. Please try again in a moment.';
        throw new Error(msg);
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
