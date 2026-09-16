/* ═══════════════════════════════════════════════════════════════════
   aqs-gemini-tts.js — Google Gemini Text-to-Speech engine
   Real neural voices, free tier, no credit card.

   • Key pool: up to 5 keys, managed in Admin Settings → Gemini TTS
     (Firestore field: gemini_tts_keys)
   • Auto-rotates keys on 401 / 403 / 429 / quota errors
   • Returns a playable + downloadable WAV ArrayBuffer
     (Gemini returns raw 24 kHz 16-bit mono PCM — we wrap it in a
      WAV header so <audio> and downloads work everywhere)

   Public API:
     window.geminiTTS.hasKeys()                      -> boolean
     window.geminiTTS.setKeys(arrayOfKeys)           -> void
     window.geminiTTS.loadKeys()                     -> Promise
     window.geminiTTS.voiceFor(voiceObj)             -> 'Kore'
     window.geminiTTS.synth(text, voiceName, style)  -> Promise<ArrayBuffer wav>
     window.geminiTTS.VOICES                         -> { male:[], female:[] }
   ═══════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    /* ── Hardcoded fallback slots (optional, normally left empty) ──
       Keys are managed from Admin Settings → Gemini TTS.            */
    window._AQS_GEMINI_TTS_KEYS = (window._AQS_GEMINI_TTS_KEYS || []).concat(
        [
            /* Slot 1 — paste reversed Gemini key (AIza…) */ '',
            /* Slot 2 */ '',
            /* Slot 3 */ '',
            /* Slot 4 */ '',
            /* Slot 5 */ ''
        ]
        .map(function (r) { return r ? r.split('').reverse().join('') : ''; })
        .filter(function (k) { return typeof k === 'string' && k.length > 20; })
    );

    var API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
    var MODEL    = 'gemini-2.5-flash-preview-tts';
    var MODEL_HQ = 'gemini-2.5-pro-preview-tts';

    var _keys = [];
    var _cooldown = {};              /* key -> timestamp until which it's parked */
    var COOLDOWN_MS = 65000;

    /* ── Gemini's 30 prebuilt voices, grouped by perceived gender ── */
    var VOICES = {
        male: [
            'Puck', 'Charon', 'Fenrir', 'Orus', 'Enceladus', 'Iapetus',
            'Umbriel', 'Algieba', 'Algenib', 'Rasalgethi', 'Alnilam',
            'Schedar', 'Gacrux', 'Achird', 'Zubenelgenubi', 'Sadaltager'
        ],
        female: [
            'Zephyr', 'Kore', 'Leda', 'Aoede', 'Callirrhoe', 'Autonoe',
            'Despina', 'Erinome', 'Laomedeia', 'Achernar', 'Pulcherrima',
            'Vindemiatrix', 'Sadachbia', 'Sulafat'
        ]
    };

    /* ── Key management ───────────────────────────────────────────── */
    function setKeys(arr) {
        if (!Array.isArray(arr)) return;
        _keys = arr.filter(function (k) { return k && String(k).trim().length > 20; })
                   .map(function (k) { return String(k).trim(); });
        window._AQS_GEMINI_TTS_KEYS = _keys;
    }

    function activeKeys() {
        var now = Date.now();
        var pool = _keys.length ? _keys : (window._AQS_GEMINI_TTS_KEYS || []);
        var ready = pool.filter(function (k) { return !_cooldown[k] || _cooldown[k] < now; });
        return ready.length ? ready : pool;   /* if all cooling, try anyway */
    }

    function hasKeys() {
        var pool = _keys.length ? _keys : (window._AQS_GEMINI_TTS_KEYS || []);
        return pool.length > 0;
    }

    function loadKeys() {
        return new Promise(function (resolve) {
            if (Array.isArray(window._AQS_GEMINI_TTS_KEYS) && window._AQS_GEMINI_TTS_KEYS.length) {
                setKeys(window._AQS_GEMINI_TTS_KEYS);
                resolve(_keys);
                return;
            }
            if (typeof window.aqsAjax !== 'function') { resolve([]); return; }
            var done = false;
            setTimeout(function () { if (!done) { done = true; resolve(_keys); } }, 6000);
            window.aqsAjax({ action: 'aqs_get_settings' }, function (res) {
                if (done) return;
                done = true;
                var s = (res && res.success && res.data && res.data.settings) || {};
                setKeys(Array.isArray(s.gemini_tts_keys) ? s.gemini_tts_keys : []);
                resolve(_keys);
            });
        });
    }

    /* ── Curated character → Gemini voice table ───────────────────
       Every one of the site's 82 characters is locked to one neural
       voice, so a character always sounds the same, and no two
       characters of the same language + gender collide.            */
    var CHARACTER_VOICES = {
        'Brian': 'Puck',
        'Matthew': 'Charon',
        'Joey': 'Fenrir',
        'Justin': 'Orus',
        'Russell': 'Enceladus',
        'Daniel': 'Iapetus',
        'Kevin': 'Umbriel',
        'Geraint': 'Algieba',
        'Arthur': 'Algenib',
        'Ryan': 'Rasalgethi',
        'Amy': 'Zephyr',
        'Emma': 'Kore',
        'Joanna': 'Leda',
        'Salli': 'Aoede',
        'Kimberly': 'Callirrhoe',
        'Kendra': 'Autonoe',
        'Nicole': 'Despina',
        'Olivia': 'Erinome',
        'Aria': 'Laomedeia',
        'Jane': 'Achernar',
        'Enrique': 'Alnilam',
        'Miguel': 'Schedar',
        'Pablo': 'Gacrux',
        'Carlos': 'Achird',
        'Conchita': 'Pulcherrima',
        'Lucia': 'Vindemiatrix',
        'Penelope': 'Sadachbia',
        'Valentina': 'Sulafat',
        'Mathieu': 'Zubenelgenubi',
        'Pierre': 'Sadaltager',
        'Jacques': 'Puck',
        'Celine': 'Zephyr',
        'Isabelle': 'Kore',
        'Chantal': 'Leda',
        'Hans': 'Charon',
        'Klaus': 'Fenrir',
        'Wolfgang': 'Orus',
        'Marlene': 'Aoede',
        'Vicki': 'Callirrhoe',
        'Petra': 'Autonoe',
        'Cristiano': 'Enceladus',
        'Ricardo': 'Iapetus',
        'Eduardo': 'Umbriel',
        'Ines': 'Despina',
        'Vitoria': 'Erinome',
        'Ana': 'Laomedeia',
        'Giorgio': 'Algieba',
        'Marco': 'Algenib',
        'Carla': 'Achernar',
        'Bianca': 'Pulcherrima',
        'Takumi': 'Rasalgethi',
        'Kenji': 'Alnilam',
        'Mizuki': 'Vindemiatrix',
        'Yuki': 'Sadachbia',
        'Khalid': 'Schedar',
        'Omar': 'Gacrux',
        'Zeina': 'Sulafat',
        'Fatima': 'Zephyr',
        'Wei': 'Achird',
        'Zhang': 'Zubenelgenubi',
        'Zhiyu': 'Kore',
        'Mei': 'Leda',
        'Maxim': 'Sadaltager',
        'Dmitri': 'Puck',
        'Tatyana': 'Aoede',
        'Natasha': 'Callirrhoe',
        'Arjun': 'Charon',
        'Raj': 'Fenrir',
        'Aditi': 'Autonoe',
        'Priya': 'Despina',
        'Ruben': 'Orus',
        'Willem': 'Enceladus',
        'Lotte': 'Erinome',
        'Lisa': 'Laomedeia',
        'Junho': 'Iapetus',
        'Seoyeon': 'Achernar',
        'Erik': 'Umbriel',
        'Astrid': 'Pulcherrima',
        'Mehmet': 'Algieba',
        'Filiz': 'Vindemiatrix',
        'Jacek': 'Algenib',
        'Maja': 'Sadachbia'
    };

    function voiceFor(voiceObj) {
        if (!voiceObj) return 'Kore';
        if (voiceObj.geminiVoice) return voiceObj.geminiVoice;
        var id = String(voiceObj.id || voiceObj.name || '');
        if (CHARACTER_VOICES[id]) return CHARACTER_VOICES[id];
        var pool = voiceObj.gender === 'male' ? VOICES.male : VOICES.female;
        var h = 0;
        for (var i = 0; i < id.length; i++) { h = ((h << 5) - h + id.charCodeAt(i)) | 0; }
        return pool[Math.abs(h) % pool.length];
    }

    /* ── PCM (24 kHz, 16-bit, mono) → WAV ─────────────────────────── */
    function pcmToWav(pcmBytes, sampleRate) {
        sampleRate = sampleRate || 24000;
        var numChannels = 1, bitsPerSample = 16;
        var byteRate   = sampleRate * numChannels * bitsPerSample / 8;
        var blockAlign = numChannels * bitsPerSample / 8;
        var buffer = new ArrayBuffer(44 + pcmBytes.length);
        var view   = new DataView(buffer);
        function wstr(off, str) { for (var i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); }
        wstr(0, 'RIFF');
        view.setUint32(4, 36 + pcmBytes.length, true);
        wstr(8, 'WAVE');
        wstr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        wstr(36, 'data');
        view.setUint32(40, pcmBytes.length, true);
        new Uint8Array(buffer).set(pcmBytes, 44);
        return buffer;
    }

    function b64ToBytes(b64) {
        var bin = atob(b64);
        var out = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
        return out;
    }

    function sampleRateFrom(mime) {
        var m = /rate=(\d+)/i.exec(mime || '');
        return m ? parseInt(m[1], 10) : 24000;
    }

    /* ── One request against one key ──────────────────────────────── */
    async function callOnce(text, voiceName, style, apiKey, model) {
        var prompt = style ? (style + ': ' + text) : text;
        var url = API_BASE + (model || MODEL) + ':generateContent?key=' + encodeURIComponent(apiKey);
        var r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    responseModalities: ['AUDIO'],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: voiceName || 'Kore' } }
                    }
                }
            })
        });

        if (r.status === 400) {
            var b400 = await r.text();
            if (/API key not valid|API_KEY_INVALID/i.test(b400)) throw new Error('INVALID_KEY');
            throw new Error('BAD_REQUEST:' + b400.slice(0, 180));
        }
        if (r.status === 401 || r.status === 403) throw new Error('INVALID_KEY');
        if (r.status === 429) throw new Error('RATE_LIMITED');
        if (r.status === 404) throw new Error('MODEL_UNAVAILABLE');
        if (!r.ok) throw new Error('HTTP_' + r.status);

        var data = await r.json();
        var part = data && data.candidates && data.candidates[0] &&
                   data.candidates[0].content && data.candidates[0].content.parts &&
                   data.candidates[0].content.parts[0];
        var inline = part && (part.inlineData || part.inline_data);
        var b64  = inline && (inline.data);
        var mime = inline && (inline.mimeType || inline.mime_type) || '';
        if (!b64) throw new Error('EMPTY');

        var bytes = b64ToBytes(b64);
        /* Some responses already carry a WAV container — pass through. */
        if (bytes.length > 12 &&
            bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
            return bytes.buffer;
        }
        return pcmToWav(bytes, sampleRateFrom(mime));
    }

    /* ── Model candidates + discovery ─────────────────────────────── */
    var MODEL_CANDIDATES = [
        MODEL,
        'gemini-2.5-flash-preview-tts',
        'gemini-2.5-pro-preview-tts',
        'gemini-2.5-flash-tts',
        'gemini-2.5-pro-tts'
    ].filter(function (v, i, a) { return a.indexOf(v) === i; });

    var _discovered = null;

    async function discoverModels(apiKey) {
        if (_discovered) return _discovered;
        try {
            var r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?key=' +
                                encodeURIComponent(apiKey) + '&pageSize=200');
            if (!r.ok) return [];
            var d = await r.json();
            var list = (d && d.models) || [];
            _discovered = list.map(function (m) {
                return String(m.name || '').replace(/^models\//, '');
            }).filter(function (n) { return /tts/i.test(n); });
            return _discovered;
        } catch (e) { return []; }
    }

    /* Try every candidate model for one key; returns audio buffer. */
    async function callKey(text, voiceName, style, key, forcedModel) {
        var models = forcedModel ? [forcedModel] : MODEL_CANDIDATES.slice();
        var lastErr = '';
        for (var m = 0; m < models.length; m++) {
            try {
                var buf = await callOnce(text, voiceName, style, key, models[m]);
                MODEL = models[m]; /* remember the one that works */
                return buf;
            } catch (e) {
                lastErr = e.message || String(e);
                if (lastErr === 'INVALID_KEY' || lastErr === 'RATE_LIMITED') throw e;
                /* EMPTY / MODEL_UNAVAILABLE / BAD_REQUEST → try next model */
            }
        }
        if (!forcedModel) {
            var found = await discoverModels(key);
            for (var i = 0; i < found.length; i++) {
                if (models.indexOf(found[i]) !== -1) continue;
                try {
                    var b2 = await callOnce(text, voiceName, style, key, found[i]);
                    MODEL = found[i];
                    if (MODEL_CANDIDATES.indexOf(found[i]) === -1) MODEL_CANDIDATES.unshift(found[i]);
                    return b2;
                } catch (e2) {
                    lastErr = e2.message || String(e2);
                    if (lastErr === 'INVALID_KEY' || lastErr === 'RATE_LIMITED') throw e2;
                }
            }
        }
        throw new Error(lastErr || 'EMPTY');
    }

    /* ── Public: synthesize with automatic key rotation ───────────── */
    async function synth(text, voiceName, style, opts) {
        opts = opts || {};
        var keys = activeKeys();
        if (!keys.length) throw new Error('NO_KEYS');
        var lastErr = '';
        for (var i = 0; i < keys.length; i++) {
            try {
                return await callKey(text, voiceName, style, keys[i], opts.model);
            } catch (e) {
                lastErr = e.message || String(e);
                if (lastErr === 'RATE_LIMITED') { _cooldown[keys[i]] = Date.now() + COOLDOWN_MS; continue; }
                continue; /* try the next key */
            }
        }
        if (lastErr === 'RATE_LIMITED') throw new Error('All Gemini TTS keys are rate-limited — wait a minute or add more keys in Admin Settings.');
        if (lastErr === 'INVALID_KEY')  throw new Error('Gemini TTS key invalid — update it in Admin Settings → Gemini TTS.');
        if (lastErr === 'NO_KEYS')      throw new Error('No Gemini TTS key — add one in Admin Settings → Gemini TTS.');
        throw new Error('Gemini TTS failed: ' + lastErr);
    }

    /* ── Public: test a single key the exact same way playback works ─ */
    async function testKey(key) {
        try {
            var buf = await callKey('Hello', 'Kore', '', String(key || '').trim(), null);
            return { ok: true, bytes: buf.byteLength, model: MODEL };
        } catch (e) {
            var msg = e.message || String(e);
            if (msg === 'INVALID_KEY')   return { ok: false, reason: 'invalid', message: 'Invalid key' };
            if (msg === 'RATE_LIMITED')  return { ok: false, reason: 'quota',   message: 'Quota / rate-limited' };
            if (msg === 'EMPTY')         return { ok: false, reason: 'nomodel', message: 'No TTS model available for this key (try a new key from aistudio.google.com)' };
            return { ok: false, reason: 'error', message: msg };
        }
    }

    window.geminiTTS = {
        get MODEL() { return MODEL; },
        MODEL_HQ: MODEL_HQ,
        MODEL_CANDIDATES: MODEL_CANDIDATES,
        VOICES: VOICES,
        hasKeys: hasKeys,
        setKeys: setKeys,
        loadKeys: loadKeys,
        voiceFor: voiceFor,
        CHARACTER_VOICES: CHARACTER_VOICES,
        synth: synth,
        testKey: testKey,
        discoverModels: discoverModels,
        pcmToWav: pcmToWav
    };


    /* Auto-load keys once Firebase is ready */
    if (window._aqsFirebaseReady) {
        loadKeys();
    } else {
        document.addEventListener('aqs:firebase:ready', function () { loadKeys(); }, { once: true });
    }
})();
