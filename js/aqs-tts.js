/* xzily AI — Text to Speech */
/* Developed by Omomo Excellence in corporation with Darapet Technology */
(function () {
    'use strict';

    var cfg = window.AQS_TTS_CONFIG || {};
    var HISTORY_KEY = 'xzily_tts_history';
    var PREF_KEY    = 'xzily_tts_pref';
    var MAX_CHARS   = 5000;
    var CHUNK_SIZE  = 200;

    var selectedVoice    = '';        /* empty — user must pick a voice each session */
    var currentAudioUrl  = null;
    var currentAudioBlob = null;
    var browserModeText  = null;   /* stored text for browser-speech replay */
    var browserModeSpeed = 1;

    /* ── Voice list ── */
    var VOICES = [
        /* English */
        { id:'Brian',    name:'Brian',    lang:'en', region:'UK',       gender:'male'   },
        { id:'Amy',      name:'Amy',      lang:'en', region:'UK',       gender:'female' },
        { id:'Emma',     name:'Emma',     lang:'en', region:'UK',       gender:'female' },
        { id:'Geraint',  name:'Geraint',  lang:'en', region:'Welsh',    gender:'male'   },
        { id:'Ivy',      name:'Ivy',      lang:'en', region:'US',       gender:'female' },
        { id:'Joanna',   name:'Joanna',   lang:'en', region:'US',       gender:'female' },
        { id:'Joey',     name:'Joey',     lang:'en', region:'US',       gender:'male'   },
        { id:'Justin',   name:'Justin',   lang:'en', region:'US',       gender:'male'   },
        { id:'Kendra',   name:'Kendra',   lang:'en', region:'US',       gender:'female' },
        { id:'Kimberly', name:'Kimberly', lang:'en', region:'US',       gender:'female' },
        { id:'Matthew',  name:'Matthew',  lang:'en', region:'US',       gender:'male'   },
        { id:'Salli',    name:'Salli',    lang:'en', region:'US',       gender:'female' },
        { id:'Nicole',   name:'Nicole',   lang:'en', region:'AU',       gender:'female' },
        { id:'Russell',  name:'Russell',  lang:'en', region:'AU',       gender:'male'   },
        { id:'Aditi',    name:'Aditi',    lang:'hi', region:'IN/EN',    gender:'female' },
        { id:'Raveena',  name:'Raveena',  lang:'hi', region:'IN',       gender:'female' },
        /* French */
        { id:'Celine',   name:'Céline',   lang:'fr', region:'FR',       gender:'female' },
        { id:'Mathieu',  name:'Mathieu',  lang:'fr', region:'FR',       gender:'male'   },
        { id:'Chantal',  name:'Chantal',  lang:'fr', region:'CA',       gender:'female' },
        /* German */
        { id:'Hans',     name:'Hans',     lang:'de', region:'DE',       gender:'male'   },
        { id:'Marlene',  name:'Marlene',  lang:'de', region:'DE',       gender:'female' },
        { id:'Vicki',    name:'Vicki',    lang:'de', region:'DE',       gender:'female' },
        /* Spanish */
        { id:'Conchita', name:'Conchita', lang:'es', region:'ES',       gender:'female' },
        { id:'Enrique',  name:'Enrique',  lang:'es', region:'ES',       gender:'male'   },
        { id:'Lucia',    name:'Lucia',    lang:'es', region:'ES',       gender:'female' },
        { id:'Miguel',   name:'Miguel',   lang:'es', region:'US',       gender:'male'   },
        { id:'Penelope', name:'Penélope', lang:'es', region:'US',       gender:'female' },
        /* Italian */
        { id:'Carla',    name:'Carla',    lang:'it', region:'IT',       gender:'female' },
        { id:'Giorgio',  name:'Giorgio',  lang:'it', region:'IT',       gender:'male'   },
        /* Portuguese */
        { id:'Cristiano',name:'Cristiano',lang:'pt', region:'PT',       gender:'male'   },
        { id:'Ines',     name:'Inês',     lang:'pt', region:'PT',       gender:'female' },
        { id:'Vitoria',  name:'Vitória',  lang:'pt', region:'BR',       gender:'female' },
        /* Japanese */
        { id:'Mizuki',   name:'Mizuki',   lang:'ja', region:'JP',       gender:'female' },
        { id:'Takumi',   name:'Takumi',   lang:'ja', region:'JP',       gender:'male'   },
        /* Korean */
        { id:'Seoyeon',  name:'Seoyeon',  lang:'ko', region:'KR',       gender:'female' },
        /* Chinese */
        { id:'Zhiyu',    name:'Zhiyu',    lang:'zh', region:'CN',       gender:'female' },
        /* Dutch */
        { id:'Lotte',    name:'Lotte',    lang:'nl', region:'NL',       gender:'female' },
        { id:'Ruben',    name:'Ruben',    lang:'nl', region:'NL',       gender:'male'   },
        /* Polish */
        { id:'Ewa',      name:'Ewa',      lang:'pl', region:'PL',       gender:'female' },
        { id:'Jacek',    name:'Jacek',    lang:'pl', region:'PL',       gender:'male'   },
        { id:'Maja',     name:'Maja',     lang:'pl', region:'PL',       gender:'female' },
        /* Russian */
        { id:'Maxim',    name:'Maxim',    lang:'ru', region:'RU',       gender:'male'   },
        { id:'Tatyana',  name:'Tatyana',  lang:'ru', region:'RU',       gender:'female' },
        /* Turkish */
        { id:'Filiz',    name:'Filiz',    lang:'tr', region:'TR',       gender:'female' },
        /* Swedish */
        { id:'Astrid',   name:'Astrid',   lang:'sv', region:'SE',       gender:'female' },
        /* Danish */
        { id:'Naja',     name:'Naja',     lang:'da', region:'DK',       gender:'female' },
        { id:'Mads',     name:'Mads',     lang:'da', region:'DK',       gender:'male'   },
        /* Norwegian */
        { id:'Liv',      name:'Liv',      lang:'nb', region:'NO',       gender:'female' },
        /* Romanian */
        { id:'Carmen',   name:'Carmen',   lang:'ro', region:'RO',       gender:'female' },
        /* Welsh */
        { id:'Gwyneth',  name:'Gwyneth',  lang:'cy', region:'UK',       gender:'female' },
        /* Arabic */
        { id:'Zeina',    name:'Zeina',    lang:'ar', region:'AR',       gender:'female' },
    ];

    /* ── Render voice grid ── */
    function renderVoices(filterLang) {
        var grid    = document.getElementById('tts-voice-grid');
        var voices  = filterLang ? VOICES.filter(function(v) { return v.lang === filterLang; }) : VOICES;
        grid.innerHTML = '';
        voices.forEach(function(v) {
            var card = document.createElement('button');
            card.className = 'tts-voice-card' + (v.id === selectedVoice ? ' selected' : '');
            card.dataset.voice = v.id;
            card.innerHTML =
                '<div class="tts-voice-name">' + escHtml(v.name) + '</div>' +
                '<div class="tts-voice-meta">' + escHtml(v.region) + '</div>' +
                '<span class="tts-voice-gender ' + v.gender + '">' + (v.gender === 'male' ? '♂ Male' : '♀ Female') + '</span>';
            card.addEventListener('click', function() {
                selectedVoice = v.id;
                document.querySelectorAll('.tts-voice-card').forEach(function(c) { c.classList.remove('selected'); });
                card.classList.add('selected');
                updateVoiceBadge();
                /* Auto-enable translation for non-English voices so the
                   voice speaks in its own language naturally */
                var tt = document.getElementById('tts-translate-toggle');
                if (tt) tt.checked = (v.lang && v.lang !== 'en');
                /* Update translate label to hint user */
                var tLabel = document.getElementById('tts-translate-label');
                if (tLabel) {
                    tLabel.textContent = (v.lang && v.lang !== 'en')
                        ? '🌐 Auto-translate to ' + v.region + ' (recommended — keeps voice natural)'
                        : '🌐 Translate to another language';
                }
            });
            grid.appendChild(card);
        });
    }

    function updateVoiceBadge() {
        var badge = document.getElementById('tts-voice-badge');
        if (!badge) return;
        var voice = VOICES.find(function(v) { return v.id === selectedVoice; });
        badge.textContent = voice ? ('🎙 ' + voice.name + ' · ' + voice.region) : 'Select a voice →';
    }

    /* ── Backend endpoint & voice map ── */

    /* Map named voices → Pollinations TTS engine voices
       6 distinct neural voices: alloy (neutral F), echo (medium M),
       fable (warm M), onyx (deep M), nova (warm F), shimmer (bright F)
       Spread deliberately so adjacent names sound different */
    var POLLY_TO_POLLINATIONS = {
        /* English male — 3 distinct male voices */
        Brian:'fable',   Geraint:'echo',  Joey:'echo',
        Justin:'fable',  Matthew:'onyx',  Russell:'onyx',
        /* English female — 3 distinct female voices */
        Amy:'shimmer',   Emma:'alloy',    Ivy:'nova',
        Joanna:'shimmer',Kendra:'alloy',  Kimberly:'nova',
        Salli:'shimmer', Nicole:'alloy',
        /* Hindi */
        Aditi:'nova',    Raveena:'shimmer',
        /* French */
        Celine:'shimmer',Mathieu:'onyx',  Chantal:'alloy',
        /* German */
        Hans:'onyx',     Marlene:'nova',  Vicki:'shimmer',
        /* Spanish */
        Conchita:'nova', Enrique:'echo',  Lucia:'shimmer',
        Miguel:'fable',  Penelope:'alloy',
        /* Italian */
        Carla:'alloy',   Giorgio:'onyx',
        /* Portuguese */
        Cristiano:'fable',Ines:'nova',    Vitoria:'shimmer',
        /* Japanese */
        Mizuki:'nova',   Takumi:'echo',
        /* Korean */
        Seoyeon:'shimmer',
        /* Chinese */
        Zhiyu:'nova',
        /* Dutch */
        Lotte:'alloy',   Ruben:'echo',
        /* Polish */
        Ewa:'nova',      Jacek:'onyx',    Maja:'shimmer',
        /* Russian */
        Maxim:'onyx',    Tatyana:'alloy',
        /* Turkish */
        Filiz:'shimmer',
        /* Swedish */
        Astrid:'nova',
        /* Danish */
        Naja:'alloy',    Mads:'fable',
        /* Norwegian */
        Liv:'nova',
        /* Romanian */
        Carmen:'shimmer',
        /* Welsh */
        Gwyneth:'alloy',
        /* Arabic */
        Zeina:'nova'
    };

    async function fetchChunk(text, voice, langCode) {
        var pollinationsVoice = POLLY_TO_POLLINATIONS[voice] || 'alloy';

        /* Pollinations TTS — free, no key, works from any browser */
        var encodedText = encodeURIComponent(text);
        /* Add voice + lang hint so the API uses the correct language accent.
           Cache-buster (_t) prevents browser from reusing a cached response from
           a previous voice — different voice → new request even for same text. */
        var pollinationsUrl = 'https://audio.pollinations.ai/' + encodedText +
            '?model=openai-audio&voice=' + pollinationsVoice + '&nologo=true' +
            (langCode ? '&language=' + encodeURIComponent(langCode) : '') +
            '&_v=' + pollinationsVoice;
        try {
            var pCtrl = new AbortController();
            var pTid  = setTimeout(function() { pCtrl.abort(); }, 45000);
            var audioRes = await fetch(pollinationsUrl, { signal: pCtrl.signal, cache: 'no-store' });
            clearTimeout(pTid);
            if (audioRes.ok) return await audioRes.arrayBuffer();
        } catch (pErr) { /* fall through to browser speech */ }

        throw new Error('TTS service unavailable. Using browser voice instead.');
    }
      function speakWithBrowser(text,speed){return new Promise(function(resolve,reject){if(!window.speechSynthesis){reject(new Error('Not supported'));return;}window.speechSynthesis.cancel();var u=new SpeechSynthesisUtterance(text);u.rate=Math.min(Math.max(parseFloat(speed)||1,0.1),10);u.onend=resolve;u.onerror=function(e){reject(new Error('Speech error: '+(e.error||'unknown')));};window.speechSynthesis.speak(u);});}

    /* Split text into sentence-aware chunks ≤ CHUNK_SIZE chars */
    function splitText(text) {
        if (text.length <= CHUNK_SIZE) return [text];
        var chunks = [];
        var sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
        var current = '';
        sentences.forEach(function(s) {
            if ((current + s).length > CHUNK_SIZE) {
                if (current) chunks.push(current.trim());
                /* Sentence itself may be too long — hard split */
                while (s.length > CHUNK_SIZE) {
                    chunks.push(s.substring(0, CHUNK_SIZE).trim());
                    s = s.substring(CHUNK_SIZE);
                }
                current = s;
            } else {
                current += s;
            }
        });
        if (current.trim()) chunks.push(current.trim());
        return chunks.filter(function(c) { return c.length > 0; });
    }

    /* Concatenate ArrayBuffers (for multi-chunk audio) */
    function concatBuffers(buffers) {
        var total = buffers.reduce(function(acc, b) { return acc + b.byteLength; }, 0);
        var result = new Uint8Array(total);
        var offset = 0;
        buffers.forEach(function(b) {
            result.set(new Uint8Array(b), offset);
            offset += b.byteLength;
        });
        return result.buffer;
    }

    /* ── Switch between real audio player and browser-speech player ── */
    function showRealPlayer(url, blob, voiceName, speed, text) {
        currentAudioUrl  = url;
        currentAudioBlob = blob;
        browserModeText  = null;

        var audio = document.getElementById('tts-audio');
        audio.src = url;
        audio.load();
        audio.playbackRate = speed;
        audio.play().catch(function() {});

        document.getElementById('tts-audio').style.display = '';
        var bp = document.getElementById('tts-browser-player');
        if (bp) bp.style.display = 'none';

        var dlBtn = document.getElementById('tts-download-btn');
        if (dlBtn) dlBtn.style.display = '';

        document.getElementById('tts-player-info').textContent =
            'Voice: ' + voiceName + ' · Speed: ' + speed + '× · ' + text.length + ' characters';
        document.getElementById('tts-player').classList.add('visible');
    }

    function showBrowserPlayer(text, speed) {
        currentAudioUrl  = null;
        currentAudioBlob = null;
        browserModeText  = text;
        browserModeSpeed = speed;

        /* Hide the real <audio> element — it has no src so play would do nothing */
        document.getElementById('tts-audio').style.display = 'none';

        var bp = document.getElementById('tts-browser-player');
        if (bp) bp.style.display = 'flex';

        var dlBtn = document.getElementById('tts-download-btn');
        if (dlBtn) dlBtn.style.display = 'none';

        document.getElementById('tts-player-info').textContent =
            'Voice: Browser built-in · Speed: ' + speed + '× · ' + text.length + ' characters — (download unavailable in browser mode)';
        document.getElementById('tts-player').classList.add('visible');
    }

    /* ── Generate ── */
    async function generate() {
        var text  = (document.getElementById('tts-text').value || '').trim();
        var speed = parseFloat(document.getElementById('tts-speed').value) || 1;
        if (!text) { document.getElementById('tts-text').focus(); return; }

        if (!selectedVoice) {
            showError('Please select a voice first by clicking one of the voice cards on the right.');
            return;
        }

        setGenerating(true);
        hideError();
        document.getElementById('tts-player').classList.remove('visible');

        /* Resolve voice FIRST (fix: was referenced before declaration) */
        var voice = selectedVoice;

        /* Translation step — translate text to the selected voice's language if requested */
        var translateToggle = document.getElementById('tts-translate-toggle');
        /* Determine the language to translate into: prefer the voice's own language,
           fall back to the language filter dropdown */
        var voiceObj2   = VOICES.find(function(v) { return v.id === voice; });
        var voiceLang   = voiceObj2 ? voiceObj2.lang : '';
        var langEl      = document.getElementById('tts-lang-filter');
        var filterLang  = langEl ? (langEl.value || '') : '';
        var lang        = voiceLang || filterLang;
        /* Always translate when the selected voice is non-English — the OpenAI TTS model
           speaks in whatever language the input text is in, so we must send the
           translated text to hear speech in that language.
           The toggle is kept as a user override but non-English voices force translation. */
        var voiceIsNonEnglish = voiceLang && voiceLang !== 'en';
        var shouldTranslate = lang && lang !== 'en' && (voiceIsNonEnglish || (translateToggle && translateToggle.checked));
        var textToSpeak = text;

        if (shouldTranslate) {
            var _LANG_NAMES2 = {
                'fr':'French','de':'German','es':'Spanish','it':'Italian','pt':'Portuguese',
                'ar':'Arabic','hi':'Hindi','ja':'Japanese','ko':'Korean','zh':'Chinese',
                'ru':'Russian','nl':'Dutch','pl':'Polish','tr':'Turkish','sv':'Swedish',
                'da':'Danish','nb':'Norwegian','ro':'Romanian','cy':'Welsh'
            };
            var langLabel = _LANG_NAMES2[lang] || lang.toUpperCase();
            setStatus('Translating to ' + langLabel + '…', true);
            var translated = await translateText(text, lang);
            /* Only use translation if it actually returned different text */
            if (translated && translated.trim() && translated.trim() !== text.trim()) {
                textToSpeak = translated;
            } else {
                /* Translation failed — warn user */
                setStatus('Translation unavailable, generating in English…', true);
                await new Promise(function(r) { setTimeout(r, 1200); });
            }
        }

        setStatus('Generating audio…', true);
        var chunks = splitText(textToSpeak);

        try {
            var buffers = [];
            for (var i = 0; i < chunks.length; i++) {
                setStatus('Generating audio… (' + (i + 1) + '/' + chunks.length + ')', true);
                buffers.push(await fetchChunk(chunks[i], voice, lang));
            }
            var combined = chunks.length > 1 ? concatBuffers(buffers) : buffers[0];
            var blob = new Blob([combined], { type: 'audio/mpeg' });
            var url  = URL.createObjectURL(blob);

            var voiceObj  = VOICES.find(function(v) { return v.id === voice; });
            var voiceName = voiceObj ? (voiceObj.name + ' · ' + voiceObj.region) : voice;

            showRealPlayer(url, blob, voiceName, speed, textToSpeak);
            setStatus('', false);
            saveToHistory(textToSpeak, url, voiceName, speed);
            renderHistory();

        } catch (apiErr) {
            setStatus('Using browser voice…', true);
            try {
                await speakWithBrowser(textToSpeak, speed);
                showBrowserPlayer(textToSpeak, speed);
                setStatus('', false);
            } catch (speechErr) {
                setStatus('', false);
                showError('Audio unavailable. Check your internet connection and try again. (' + (apiErr.message || 'Error') + ')');
            }
        }

        setGenerating(false);
    }

    /* ── Download ── */
    function download() {
        if (!currentAudioBlob) return;
        var url = URL.createObjectURL(currentAudioBlob);
        var a   = document.createElement('a');
        a.href  = url;
        a.download = 'xzily-tts-' + Date.now() + '.mp3';
        a.click();
        URL.revokeObjectURL(url);
    }

    /* ── Save preferences ── */
    function savePreferences() {
        var voice = selectedVoice;
        var speed = document.getElementById('tts-speed').value;
        var lang  = document.getElementById('tts-lang-filter').value || 'en';

        /* Always save to localStorage */
        try {
            localStorage.setItem(PREF_KEY, JSON.stringify({ voice: voice, speed: speed, lang: lang }));
        } catch(e) {}

        /* Sync to user meta if logged in */
        var ajaxUrl = (cfg.ajax_url     || '').trim();
        var nonce   = (cfg.public_nonce || '').trim();
        if (cfg.is_logged_in && ajaxUrl && nonce) {
            var fd = new FormData();
            fd.append('action', 'aqs_tts_save_pref');
            fd.append('nonce',  nonce);
            fd.append('voice',  voice);
            fd.append('speed',  speed);
            fd.append('lang',   lang);
            fetch(ajaxUrl, { method: 'POST', body: fd }).catch(function() {});
        }

        var saved = document.getElementById('tts-pref-saved');
        if (saved) {
            saved.style.display = 'block';
            setTimeout(function() { saved.style.display = 'none'; }, 3000);
        }
    }

    /* ── Load preferences ── */
    function loadPreferences() {
        var serverVoice = (cfg.saved_voice || '').trim();
        var serverSpeed = (cfg.saved_speed || '').trim();
        var serverLang  = (cfg.saved_lang  || '').trim();

        if (serverVoice) {
            selectedVoice = serverVoice;
        }
        if (serverSpeed) {
            var speedEl = document.getElementById('tts-speed');
            if (speedEl) {
                speedEl.value = serverSpeed;
                var valEl = document.getElementById('tts-speed-val');
                if (valEl) valEl.textContent = parseFloat(serverSpeed).toFixed(1) + '×';
            }
        }
        if (serverLang) {
            var langEl = document.getElementById('tts-lang-filter');
            if (langEl) { langEl.value = serverLang; langEl.dispatchEvent(new Event('change')); }
        }

        /* Fallback to localStorage */
        if (!serverVoice && !serverSpeed && !serverLang) {
            try {
                var saved = localStorage.getItem(PREF_KEY);
                if (saved) {
                    var p = JSON.parse(saved);
                    if (p.voice) selectedVoice = p.voice;
                    if (p.speed) {
                        var speedEl2 = document.getElementById('tts-speed');
                        if (speedEl2) {
                            speedEl2.value = p.speed;
                            var valEl2 = document.getElementById('tts-speed-val');
                            if (valEl2) valEl2.textContent = parseFloat(p.speed).toFixed(1) + '×';
                        }
                    }
                    if (p.lang) {
                        var langEl2 = document.getElementById('tts-lang-filter');
                        if (langEl2) { langEl2.value = p.lang; langEl2.dispatchEvent(new Event('change')); }
                    }
                }
            } catch(e) {}
        }
    }

    /* ── Translate text — backend first, then direct Pollinations ── */
    async function translateText(text, lang) {
        var langNames = {
            'fr':'French','de':'German','es':'Spanish','it':'Italian','pt':'Portuguese',
            'ar':'Arabic','hi':'Hindi','ja':'Japanese','ko':'Korean','zh':'Chinese',
            'ru':'Russian','nl':'Dutch','pl':'Polish','tr':'Turkish','sv':'Swedish',
            'da':'Danish','nb':'Norwegian','ro':'Romanian','cy':'Welsh'
        };
        var langName = langNames[lang] || lang;
        var sysMsg = 'You are a professional translator. Translate the text into ' + langName +
            '. Output ONLY the translated text — no explanations, no quotes, no extra formatting.';

        /* 1️⃣  Try backend translate proxy (Render server) */
        try {
            var localRes = await fetch(AQS_LOCAL + '/api/translate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text, lang: lang, langName: langName })
            });
            if (localRes.ok) {
                var localData = await localRes.json();
                var t1 = localData.translated || localData.text || localData.result || '';
                if (t1 && t1.length > 0) return t1;
            }
        } catch (localErr) { /* fall through */ }

        /* 2️⃣  Direct Pollinations translate — free, works without backend */
        try {
            var pRes = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: 'openai-fast',
                    temperature: 0.2,
                    messages: [
                        { role: 'system', content: sysMsg },
                        { role: 'user',   content: text }
                    ]
                }),
                signal: AbortSignal.timeout(25000)
            });
            if (pRes.ok) {
                var pData = await pRes.json();
                var t2 = ((pData.choices || [])[0] || {}).message && pData.choices[0].message.content || '';
                t2 = t2.trim();
                if (t2 && t2.length > 0) return t2;
            }
        } catch(pErr) { /* fall through — return original */ }

        return text;
    }

    /* ── History ── */
    function saveToHistory(text, url, voiceName, speed) {
        var h = loadHistory();
        h.unshift({ id: 'tts_' + Date.now(), text: text, url: url, voice: voiceName, speed: speed, ts: Date.now() });
        if (h.length > 15) h = h.slice(0, 15);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch(e) {}
    }

    function loadHistory() {
        try { var r = localStorage.getItem(HISTORY_KEY); return r ? JSON.parse(r) : []; } catch(e) { return []; }
    }

    function renderHistory() {
        var h    = loadHistory();
        var wrap = document.getElementById('tts-history-wrap');
        var list = document.getElementById('tts-history-list');
        if (!list) return;
        if (!h.length) { wrap.style.display = 'none'; return; }
        wrap.style.display = 'block';
        list.innerHTML = '';
        h.slice(0, 8).forEach(function(entry) {
            var item = document.createElement('div');
            item.className = 'tts-history-item';
            item.innerHTML =
                '<div class="tts-history-icon">🔊</div>' +
                '<div class="tts-history-info">' +
                    '<div class="tts-history-text" title="' + escHtml(entry.text) + '">' + escHtml(entry.text.substring(0, 60)) + (entry.text.length > 60 ? '…' : '') + '</div>' +
                    '<div class="tts-history-meta">' + escHtml(entry.voice) + ' · ' + entry.speed + '× · ' + new Date(entry.ts).toLocaleTimeString() + '</div>' +
                '</div>' +
                '<div class="tts-history-play">' +
                    '<button class="tts-btn tts-btn-sm tts-play-history" data-url="' + escAttr(entry.url) + '">▶</button>' +
                '</div>';
            item.addEventListener('click', function() {
                if (entry.url) {
                    document.getElementById('tts-text').value = entry.text;
                    updateCharCount();
                    var audio = document.getElementById('tts-audio');
                    audio.src = entry.url;
                    audio.load();
                    audio.play().catch(function() {});
                    document.getElementById('tts-player').classList.add('visible');
                    currentAudioUrl  = entry.url;
                    currentAudioBlob = null;
                }
            });
            list.appendChild(item);
        });
    }

    /* ── Char counter ── */
    function updateCharCount() {
        var text = document.getElementById('tts-text').value || '';
        var len  = text.length;
        var el   = document.getElementById('tts-char-count');
        if (!el) return;
        el.textContent = len.toLocaleString() + ' / 5,000 characters';
        el.className   = 'tts-char-count' + (len > 4500 ? (len >= 5000 ? ' over' : ' warn') : '');
    }

    /* ── UI helpers ── */
    function setGenerating(on) {
        var btn = document.getElementById('tts-generate-btn');
        if (btn) btn.disabled = on;
    }
    function setStatus(text, show) {
        var el = document.getElementById('tts-status');
        var tx = document.getElementById('tts-status-text');
        if (el) el.className = 'tts-status' + (show ? ' visible' : '');
        if (tx && text) tx.textContent = text;
    }
    function showError(msg) {
        var el = document.getElementById('tts-error');
        if (el) { el.textContent = '⚠️ ' + msg; el.className = 'tts-error visible'; }
    }
    function hideError() {
        var el = document.getElementById('tts-error');
        if (el) el.className = 'tts-error';
    }
    function escHtml(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }
    function escAttr(s) { return String(s || '').replace(/"/g,'&quot;'); }

    /* ── Init ── */
    document.addEventListener('DOMContentLoaded', function() {

        /* Load saved preferences before rendering voices */
        loadPreferences();

        /* Render voice grid */
        renderVoices('');
        updateVoiceBadge();

        /* Language filter */
        var langFilter = document.getElementById('tts-lang-filter');
        if (langFilter) {
            langFilter.addEventListener('change', function() {
                renderVoices(this.value);
                /* Re-mark selected */
                document.querySelectorAll('.tts-voice-card').forEach(function(c) {
                    if (c.dataset.voice === selectedVoice) c.classList.add('selected');
                });
            });
        }

        /* Speed slider */
        var speedEl = document.getElementById('tts-speed');
        var speedVal = document.getElementById('tts-speed-val');
        if (speedEl && speedVal) {
            speedEl.addEventListener('input', function() {
                speedVal.textContent = parseFloat(this.value).toFixed(1) + '×';
                /* Update playback rate live if audio is already loaded */
                var audio = document.getElementById('tts-audio');
                if (audio && audio.src) audio.playbackRate = parseFloat(this.value);
            });
        }

        /* Char counter */
        var ta = document.getElementById('tts-text');
        if (ta) {
            ta.addEventListener('input', updateCharCount);
            ta.addEventListener('keydown', function(e) {
                if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); generate(); }
            });
        }

        /* Generate */
        var genBtn = document.getElementById('tts-generate-btn');
        if (genBtn) genBtn.addEventListener('click', generate);

        /* Browser-speech play / stop buttons */
        var bPlayBtn = document.getElementById('tts-browser-play-btn');
        if (bPlayBtn) {
            bPlayBtn.addEventListener('click', function() {
                if (browserModeText) {
                    speakWithBrowser(browserModeText, browserModeSpeed).catch(function() {});
                }
            });
        }
        var bStopBtn = document.getElementById('tts-browser-stop-btn');
        if (bStopBtn) {
            bStopBtn.addEventListener('click', function() {
                if (window.speechSynthesis) window.speechSynthesis.cancel();
            });
        }

        /* Clear */
        var clearBtn = document.getElementById('tts-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                document.getElementById('tts-text').value = '';
                updateCharCount();
                document.getElementById('tts-player').classList.remove('visible');
                hideError();
                currentAudioUrl  = null;
                currentAudioBlob = null;
                browserModeText  = null;
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                /* Reset player to default state */
                document.getElementById('tts-audio').style.display = '';
                var bp = document.getElementById('tts-browser-player');
                if (bp) bp.style.display = 'none';
            });
        }

        /* Download */
        var dlBtn = document.getElementById('tts-download-btn');
        if (dlBtn) dlBtn.addEventListener('click', download);

        /* Regenerate */
        var regenBtn = document.getElementById('tts-regen-btn');
        if (regenBtn) regenBtn.addEventListener('click', generate);

        /* Save preferences */
        var savePrefBtn = document.getElementById('tts-save-pref-btn');
        if (savePrefBtn) savePrefBtn.addEventListener('click', savePreferences);

        /* Clear history */
        var clrHistBtn = document.getElementById('tts-clear-history-btn');
        if (clrHistBtn) {
            clrHistBtn.addEventListener('click', function() {
                if (confirm('Clear audio history?')) {
                    try { localStorage.removeItem(HISTORY_KEY); } catch(e) {}
                    renderHistory();
                }
            });
        }

        /* Load history */
        renderHistory();
    });

})();
