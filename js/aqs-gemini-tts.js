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

    /* ── Deterministic voice picker ────────────────────────────────
       Maps each of the site's 82 named characters onto a stable
       Gemini voice, so "Brian" always sounds like Brian.           */
    function voiceFor(voiceObj) {
        if (!voiceObj) return 'Kore';
        if (voiceObj.geminiVoice) return voiceObj.geminiVoice;
        var pool = voiceObj.gender === 'male' ? VOICES.male : VOICES.female;
        var id = String(voiceObj.id || voiceObj.name || 'x');
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

    /* ── Public: synthesize with automatic key rotation ───────────── */
    async function synth(text, voiceName, style, opts) {
        opts = opts || {};
        var keys = activeKeys();
        if (!keys.length) throw new Error('NO_KEYS');
        var lastErr = '';
        for (var i = 0; i < keys.length; i++) {
            try {
                return await callOnce(text, voiceName, style, keys[i], opts.model);
            } catch (e) {
                lastErr = e.message || String(e);
                if (lastErr === 'RATE_LIMITED') { _cooldown[keys[i]] = Date.now() + COOLDOWN_MS; continue; }
                if (lastErr === 'INVALID_KEY') continue;
                if (lastErr === 'MODEL_UNAVAILABLE' || lastErr.indexOf('HTTP_5') === 0) continue;
                break; /* EMPTY / BAD_REQUEST — retrying other keys won't help */
            }
        }
        if (lastErr === 'RATE_LIMITED') throw new Error('All Gemini TTS keys are rate-limited — wait a minute or add more keys in Admin Settings.');
        if (lastErr === 'INVALID_KEY')  throw new Error('Gemini TTS key invalid — update it in Admin Settings → Gemini TTS.');
        if (lastErr === 'NO_KEYS')      throw new Error('No Gemini TTS key — add one in Admin Settings → Gemini TTS.');
        throw new Error('Gemini TTS failed: ' + lastErr);
    }

    window.geminiTTS = {
        MODEL: MODEL,
        MODEL_HQ: MODEL_HQ,
        VOICES: VOICES,
        hasKeys: hasKeys,
        setKeys: setKeys,
        loadKeys: loadKeys,
        voiceFor: voiceFor,
        synth: synth,
        pcmToWav: pcmToWav
    };

    /* Auto-load keys once Firebase is ready */
    if (window._aqsFirebaseReady) {
        loadKeys();
    } else {
        document.addEventListener('aqs:firebase:ready', function () { loadKeys(); }, { once: true });
    }
})();
