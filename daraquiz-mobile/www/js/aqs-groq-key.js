(function(){
    var GROQ_URL    = 'https://api.groq.com/openai/v1/chat/completions';
    var STORAGE_KEY = 'aqs_groq_key';
    var IDX_KEY     = 'aqs_groq_key_idx';

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

        var startIdx = _getIdx();

        for (var attempt = 0; attempt < keys.length; attempt++) {
            var idx = (startIdx + attempt) % keys.length;
            var key = keys[idx];
            var res = await fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                method:  'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                body:    JSON.stringify(bodyObj)
            }));

            if (res.status === 429) {
                console.warn('[groqFetch] key slot', idx, 'rate-limited (429), trying next…');
                _setIdx(idx + 1);
                continue;
            }

            _setIdx(idx + 1);
            return res;
        }

        throw new Error('All Groq keys rate-limited (429). Try again in a moment.');
    };

    window.setGroqKey = function(k){
        if (k && k.startsWith('gsk_'))
            try { localStorage.setItem(STORAGE_KEY, k.trim()); } catch(e) {}
    };

    window.setGroqKeys = function(arr){
        window._AQS_GROQ_MASTER_KEYS = (arr || []).filter(function(k){ return k && k.startsWith('gsk_'); });
        _setIdx(0);
    };
})();
