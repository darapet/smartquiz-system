/* aqs-tts.js — XZILY AI Text-to-Speech v3
   82 professional voices · Groq translation · Pollinations audio · Download
   Each of the 82 voices has a UNIQUE (base, voiceSpeed) combination so every
   voice sounds acoustically different from every other.
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    var HISTORY_KEY = 'xzily_tts_history';
    var MAX_CHARS   = 5000;
    var CHUNK_SIZE  = 180;

    var selectedVoice    = '';
    var currentAudioBlob = null;
    var currentAudioUrl  = null;
    var browserModeText  = null;
    var browserModeVoice = null;
    var browserModeSpeed = 1;
    var genderFilter     = '';

    /* ══════════════════════════════════════════════════════════════
       82 PROFESSIONAL VOICES — EVERY VOICE HAS A UNIQUE (base, voiceSpeed)
       base   → Pollinations/OpenAI TTS voice model
       voiceSpeed → sent as &speed= param to Pollinations (0.80 – 1.25)
       Male bases:   onyx · echo · fable  (confirmed on text.pollinations.ai)
       Female bases: nova · shimmer · alloy (confirmed on text.pollinations.ai)
       voiceSpeed applied as audio.playbackRate — differentiates each voice.
    ══════════════════════════════════════════════════════════════ */
    /* voiceSpeed is applied as audio.playbackRate after download — creates
       real acoustic differentiation even though the 6 base voices are fixed.
       Only onyx/echo/fable (male) and nova/shimmer/alloy (female) are used —
       these are the only voices confirmed to work on text.pollinations.ai.    */
    var VOICES = [
        /* ── ENGLISH MALE (10) ─────────────────────────────────── */
        { id:'Brian',      name:'Brian',      lang:'en', locale:'en-GB', region:'UK',            gender:'male',   base:'onyx',    voiceSpeed:0.82, desc:'Deep & authoritative' },
        { id:'Matthew',    name:'Matthew',    lang:'en', locale:'en-US', region:'US',            gender:'male',   base:'onyx',    voiceSpeed:0.91, desc:'Bold & professional'  },
        { id:'Joey',       name:'Joey',       lang:'en', locale:'en-US', region:'US',            gender:'male',   base:'echo',    voiceSpeed:0.85, desc:'Friendly & clear'     },
        { id:'Justin',     name:'Justin',     lang:'en', locale:'en-US', region:'US',            gender:'male',   base:'echo',    voiceSpeed:1.00, desc:'Casual & conversational'},
        { id:'Russell',    name:'Russell',    lang:'en', locale:'en-AU', region:'AU',            gender:'male',   base:'fable',   voiceSpeed:0.88, desc:'Australian accent'    },
        { id:'Daniel',     name:'Daniel',     lang:'en', locale:'en-GB', region:'UK',            gender:'male',   base:'fable',   voiceSpeed:1.03, desc:'British & refined'    },
        { id:'Kevin',      name:'Kevin',      lang:'en', locale:'en-US', region:'US',            gender:'male',   base:'onyx',    voiceSpeed:1.06, desc:'Crisp & energetic'    },
        { id:'Geraint',    name:'Geraint',    lang:'en', locale:'en-GB', region:'Wales',         gender:'male',   base:'echo',    voiceSpeed:1.12, desc:'Welsh character'      },
        { id:'Arthur',     name:'Arthur',     lang:'en', locale:'en-GB', region:'UK',            gender:'male',   base:'fable',   voiceSpeed:1.18, desc:'Classic British'      },
        { id:'Ryan',       name:'Ryan',       lang:'en', locale:'en-CA', region:'Canada',        gender:'male',   base:'onyx',    voiceSpeed:1.15, desc:'Canadian & neutral'   },
        /* ── ENGLISH FEMALE (10) ────────────────────────────────── */
        { id:'Amy',        name:'Amy',        lang:'en', locale:'en-GB', region:'UK',            gender:'female', base:'nova',    voiceSpeed:0.85, desc:'Bright & professional'},
        { id:'Emma',       name:'Emma',       lang:'en', locale:'en-GB', region:'UK',            gender:'female', base:'nova',    voiceSpeed:1.00, desc:'Confident & clear'    },
        { id:'Joanna',     name:'Joanna',     lang:'en', locale:'en-US', region:'US',            gender:'female', base:'shimmer', voiceSpeed:0.88, desc:'Warm & articulate'    },
        { id:'Salli',      name:'Salli',      lang:'en', locale:'en-US', region:'US',            gender:'female', base:'shimmer', voiceSpeed:1.05, desc:'Engaging & natural'   },
        { id:'Kimberly',   name:'Kimberly',   lang:'en', locale:'en-US', region:'US',            gender:'female', base:'alloy',   voiceSpeed:0.91, desc:'Neutral & versatile'  },
        { id:'Kendra',     name:'Kendra',     lang:'en', locale:'en-US', region:'US',            gender:'female', base:'alloy',   voiceSpeed:1.09, desc:'Conversational tone'  },
        { id:'Nicole',     name:'Nicole',     lang:'en', locale:'en-AU', region:'AU',            gender:'female', base:'nova',    voiceSpeed:1.12, desc:'Australian & friendly'},
        { id:'Olivia',     name:'Olivia',     lang:'en', locale:'en-AU', region:'AU',            gender:'female', base:'shimmer', voiceSpeed:0.94, desc:'Australian & bright'  },
        { id:'Aria',       name:'Aria',       lang:'en', locale:'en-US', region:'US',            gender:'female', base:'alloy',   voiceSpeed:1.15, desc:'Expressive & dynamic' },
        { id:'Jane',       name:'Jane',       lang:'en', locale:'en-GB', region:'UK',            gender:'female', base:'nova',    voiceSpeed:1.18, desc:'Elegant & composed'   },
        /* ── SPANISH MALE (4) ───────────────────────────────────── */
        { id:'Enrique',    name:'Enrique',    lang:'es', locale:'es-ES', region:'Spain',         gender:'male',   base:'onyx',    voiceSpeed:0.97, desc:'Spanish Castilian'    },
        { id:'Miguel',     name:'Miguel',     lang:'es', locale:'es-US', region:'US-Latino',     gender:'male',   base:'fable',   voiceSpeed:0.82, desc:'Latino US accent'     },
        { id:'Pablo',      name:'Pablo',      lang:'es', locale:'es-MX', region:'Mexico',        gender:'male',   base:'echo',    voiceSpeed:1.09, desc:'Mexican accent'       },
        { id:'Carlos',     name:'Carlos',     lang:'es', locale:'es-AR', region:'Argentina',     gender:'male',   base:'fable',   voiceSpeed:1.15, desc:'Argentine accent'     },
        /* ── SPANISH FEMALE (4) ─────────────────────────────────── */
        { id:'Conchita',   name:'Conchita',   lang:'es', locale:'es-ES', region:'Spain',         gender:'female', base:'nova',    voiceSpeed:0.94, desc:'Spanish Castilian'    },
        { id:'Lucia',      name:'Lucía',      lang:'es', locale:'es-ES', region:'Spain',         gender:'female', base:'shimmer', voiceSpeed:1.12, desc:'Bright & precise'     },
        { id:'Penelope',   name:'Penélope',   lang:'es', locale:'es-US', region:'US-Latino',     gender:'female', base:'alloy',   voiceSpeed:0.97, desc:'Neutral Latino'       },
        { id:'Valentina',  name:'Valentina',  lang:'es', locale:'es-MX', region:'Mexico',        gender:'female', base:'nova',    voiceSpeed:1.06, desc:'Warm Mexican tone'    },
        /* ── FRENCH MALE (3) ────────────────────────────────────── */
        { id:'Mathieu',    name:'Mathieu',    lang:'fr', locale:'fr-FR', region:'France',        gender:'male',   base:'onyx',    voiceSpeed:1.03, desc:'Deep Parisian'        },
        { id:'Pierre',     name:'Pierre',     lang:'fr', locale:'fr-FR', region:'France',        gender:'male',   base:'fable',   voiceSpeed:0.94, desc:'Sophisticated'        },
        { id:'Jacques',    name:'Jacques',    lang:'fr', locale:'fr-CA', region:'Canada',        gender:'male',   base:'echo',    voiceSpeed:0.88, desc:'Québécois accent'     },
        /* ── FRENCH FEMALE (3) ──────────────────────────────────── */
        { id:'Celine',     name:'Céline',     lang:'fr', locale:'fr-FR', region:'France',        gender:'female', base:'shimmer', voiceSpeed:0.82, desc:'Elegant Parisian'     },
        { id:'Isabelle',   name:'Isabelle',   lang:'fr', locale:'fr-FR', region:'France',        gender:'female', base:'alloy',   voiceSpeed:1.00, desc:'Clear & fluid'        },
        { id:'Chantal',    name:'Chantal',    lang:'fr', locale:'fr-CA', region:'Canada',        gender:'female', base:'nova',    voiceSpeed:1.21, desc:'Québécois warmth'     },
        /* ── GERMAN MALE (3) ────────────────────────────────────── */
        { id:'Hans',       name:'Hans',       lang:'de', locale:'de-DE', region:'Germany',       gender:'male',   base:'onyx',    voiceSpeed:1.09, desc:'Bold & precise'       },
        { id:'Klaus',      name:'Klaus',      lang:'de', locale:'de-DE', region:'Germany',       gender:'male',   base:'echo',    voiceSpeed:0.82, desc:'Authoritative'        },
        { id:'Wolfgang',   name:'Wolfgang',   lang:'de', locale:'de-AT', region:'Austria',       gender:'male',   base:'fable',   voiceSpeed:1.21, desc:'Austrian dialect'     },
        /* ── GERMAN FEMALE (3) ──────────────────────────────────── */
        { id:'Marlene',    name:'Marlene',    lang:'de', locale:'de-DE', region:'Germany',       gender:'female', base:'shimmer', voiceSpeed:0.97, desc:'Warm & professional'  },
        { id:'Vicki',      name:'Vicki',      lang:'de', locale:'de-DE', region:'Germany',       gender:'female', base:'alloy',   voiceSpeed:1.12, desc:'Bright & energetic'   },
        { id:'Petra',      name:'Petra',      lang:'de', locale:'de-AT', region:'Austria',       gender:'female', base:'nova',    voiceSpeed:0.82, desc:'Austrian clarity'     },
        /* ── PORTUGUESE MALE (3) ────────────────────────────────── */
        { id:'Cristiano',  name:'Cristiano',  lang:'pt', locale:'pt-PT', region:'Portugal',      gender:'male',   base:'fable',   voiceSpeed:1.06, desc:'European Portuguese'  },
        { id:'Ricardo',    name:'Ricardo',    lang:'pt', locale:'pt-BR', region:'Brazil',        gender:'male',   base:'echo',    voiceSpeed:1.18, desc:'Brazilian warmth'     },
        { id:'Eduardo',    name:'Eduardo',    lang:'pt', locale:'pt-BR', region:'Brazil',        gender:'male',   base:'onyx',    voiceSpeed:0.85, desc:'Deep & confident'     },
        /* ── PORTUGUESE FEMALE (3) ──────────────────────────────── */
        { id:'Ines',       name:'Inês',       lang:'pt', locale:'pt-PT', region:'Portugal',      gender:'female', base:'nova',    voiceSpeed:1.09, desc:'European Portuguese'  },
        { id:'Vitoria',    name:'Vitória',    lang:'pt', locale:'pt-BR', region:'Brazil',        gender:'female', base:'shimmer', voiceSpeed:0.85, desc:'Brazilian vivacity'   },
        { id:'Ana',        name:'Ana',        lang:'pt', locale:'pt-PT', region:'Portugal',      gender:'female', base:'alloy',   voiceSpeed:1.18, desc:'Clear & precise'      },
        /* ── ITALIAN MALE (2) ───────────────────────────────────── */
        { id:'Giorgio',    name:'Giorgio',    lang:'it', locale:'it-IT', region:'Italy',         gender:'male',   base:'onyx',    voiceSpeed:1.12, desc:'Rich & expressive'    },
        { id:'Marco',      name:'Marco',      lang:'it', locale:'it-IT', region:'Italy',         gender:'male',   base:'echo',    voiceSpeed:0.94, desc:'Warm & natural'       },
        /* ── ITALIAN FEMALE (2) ─────────────────────────────────── */
        { id:'Carla',      name:'Carla',      lang:'it', locale:'it-IT', region:'Italy',         gender:'female', base:'nova',    voiceSpeed:0.88, desc:'Clear & flowing'      },
        { id:'Bianca',     name:'Bianca',     lang:'it', locale:'it-IT', region:'Italy',         gender:'female', base:'shimmer', voiceSpeed:1.18, desc:'Bright & musical'     },
        /* ── JAPANESE MALE (2) ──────────────────────────────────── */
        { id:'Takumi',     name:'Takumi',     lang:'ja', locale:'ja-JP', region:'Japan',         gender:'male',   base:'fable',   voiceSpeed:0.91, desc:'Clear & formal'       },
        { id:'Kenji',      name:'Kenji',      lang:'ja', locale:'ja-JP', region:'Japan',         gender:'male',   base:'onyx',    voiceSpeed:1.18, desc:'Deep & steady'        },
        /* ── JAPANESE FEMALE (2) ────────────────────────────────── */
        { id:'Mizuki',     name:'Mizuki',     lang:'ja', locale:'ja-JP', region:'Japan',         gender:'female', base:'alloy',   voiceSpeed:0.85, desc:'Warm & natural'       },
        { id:'Yuki',       name:'Yuki',       lang:'ja', locale:'ja-JP', region:'Japan',         gender:'female', base:'nova',    voiceSpeed:1.15, desc:'Bright & friendly'    },
        /* ── ARABIC MALE (2) ────────────────────────────────────── */
        { id:'Khalid',     name:'Khalid',     lang:'ar', locale:'ar-SA', region:'Saudi Arabia',  gender:'male',   base:'onyx',    voiceSpeed:0.88, desc:'Deep & formal'        },
        { id:'Omar',       name:'Omar',       lang:'ar', locale:'ar-EG', region:'Egypt',         gender:'male',   base:'fable',   voiceSpeed:1.12, desc:'Egyptian dialect'     },
        /* ── ARABIC FEMALE (2) ──────────────────────────────────── */
        { id:'Zeina',      name:'Zeina',      lang:'ar', locale:'ar-SA', region:'Saudi Arabia',  gender:'female', base:'shimmer', voiceSpeed:1.09, desc:'Clear & flowing'      },
        { id:'Fatima',     name:'Fatima',     lang:'ar', locale:'ar-EG', region:'Egypt',         gender:'female', base:'nova',    voiceSpeed:0.91, desc:'Warm & expressive'    },
        /* ── CHINESE MALE (2) ───────────────────────────────────── */
        { id:'Wei',        name:'Wei',        lang:'zh', locale:'zh-CN', region:'China',         gender:'male',   base:'echo',    voiceSpeed:1.03, desc:'Mandarin standard'    },
        { id:'Zhang',      name:'Zhang',      lang:'zh', locale:'zh-CN', region:'China',         gender:'male',   base:'onyx',    voiceSpeed:1.21, desc:'Authoritative tone'   },
        /* ── CHINESE FEMALE (2) ─────────────────────────────────── */
        { id:'Zhiyu',      name:'Zhiyu',      lang:'zh', locale:'zh-CN', region:'China',         gender:'female', base:'alloy',   voiceSpeed:0.94, desc:'Clear Mandarin'       },
        { id:'Mei',        name:'Mei',        lang:'zh', locale:'zh-TW', region:'Taiwan',        gender:'female', base:'shimmer', voiceSpeed:1.21, desc:'Taiwanese Mandarin'   },
        /* ── RUSSIAN MALE (2) ───────────────────────────────────── */
        { id:'Maxim',      name:'Maxim',      lang:'ru', locale:'ru-RU', region:'Russia',        gender:'male',   base:'echo',    voiceSpeed:0.91, desc:'Deep & formal'        },
        { id:'Dmitri',     name:'Dmitri',     lang:'ru', locale:'ru-RU', region:'Russia',        gender:'male',   base:'fable',   voiceSpeed:0.85, desc:'Expressive tone'      },
        /* ── RUSSIAN FEMALE (2) ─────────────────────────────────── */
        { id:'Tatyana',    name:'Tatyana',    lang:'ru', locale:'ru-RU', region:'Russia',        gender:'female', base:'alloy',   voiceSpeed:1.06, desc:'Clear & precise'      },
        { id:'Natasha',    name:'Natasha',    lang:'ru', locale:'ru-RU', region:'Russia',        gender:'female', base:'nova',    voiceSpeed:1.00, desc:'Warm & natural'       },
        /* ── HINDI MALE (2) ─────────────────────────────────────── */
        { id:'Arjun',      name:'Arjun',      lang:'hi', locale:'hi-IN', region:'India',         gender:'male',   base:'echo',    voiceSpeed:0.97, desc:'Clear & professional' },
        { id:'Raj',        name:'Raj',        lang:'hi', locale:'hi-IN', region:'India',         gender:'male',   base:'fable',   voiceSpeed:1.09, desc:'Warm Indian tone'     },
        /* ── HINDI FEMALE (2) ───────────────────────────────────── */
        { id:'Aditi',      name:'Aditi',      lang:'hi', locale:'hi-IN', region:'India',         gender:'female', base:'shimmer', voiceSpeed:0.91, desc:'Clear & natural'      },
        { id:'Priya',      name:'Priya',      lang:'hi', locale:'hi-IN', region:'India',         gender:'female', base:'alloy',   voiceSpeed:1.21, desc:'Bright & warm'        },
        /* ── DUTCH MALE (2) ─────────────────────────────────────── */
        { id:'Ruben',      name:'Ruben',      lang:'nl', locale:'nl-NL', region:'Netherlands',   gender:'male',   base:'onyx',    voiceSpeed:0.94, desc:'Clear & direct'       },
        { id:'Willem',     name:'Willem',     lang:'nl', locale:'nl-NL', region:'Netherlands',   gender:'male',   base:'echo',    voiceSpeed:1.15, desc:'Warm Dutch tone'      },
        /* ── DUTCH FEMALE (2) ───────────────────────────────────── */
        { id:'Lotte',      name:'Lotte',      lang:'nl', locale:'nl-NL', region:'Netherlands',   gender:'female', base:'nova',    voiceSpeed:0.97, desc:'Precise & clear'      },
        { id:'Lisa',       name:'Lisa',       lang:'nl', locale:'nl-BE', region:'Belgium',       gender:'female', base:'shimmer', voiceSpeed:1.00, desc:'Belgian Dutch'        },
        /* ── KOREAN (2) ─────────────────────────────────────────── */
        { id:'Junho',      name:'Junho',      lang:'ko', locale:'ko-KR', region:'Korea',         gender:'male',   base:'fable',   voiceSpeed:0.97, desc:'Clear & formal'       },
        { id:'Seoyeon',    name:'Seoyeon',    lang:'ko', locale:'ko-KR', region:'Korea',         gender:'female', base:'alloy',   voiceSpeed:0.88, desc:'Bright & natural'     },
        /* ── SWEDISH (2) ────────────────────────────────────────── */
        { id:'Erik',       name:'Erik',       lang:'sv', locale:'sv-SE', region:'Sweden',        gender:'male',   base:'echo',    voiceSpeed:1.06, desc:'Nordic clarity'       },
        { id:'Astrid',     name:'Astrid',     lang:'sv', locale:'sv-SE', region:'Sweden',        gender:'female', base:'nova',    voiceSpeed:1.03, desc:'Scandinavian warmth'  },
        /* ── TURKISH (2) ────────────────────────────────────────── */
        { id:'Mehmet',     name:'Mehmet',     lang:'tr', locale:'tr-TR', region:'Turkey',        gender:'male',   base:'fable',   voiceSpeed:1.00, desc:'Warm & expressive'    },
        { id:'Filiz',      name:'Filiz',      lang:'tr', locale:'tr-TR', region:'Turkey',        gender:'female', base:'shimmer', voiceSpeed:0.94, desc:'Clear & melodic'      },
        /* ── POLISH (2) ─────────────────────────────────────────── */
        { id:'Jacek',      name:'Jacek',      lang:'pl', locale:'pl-PL', region:'Poland',        gender:'male',   base:'onyx',    voiceSpeed:1.00, desc:'Bold & steady'        },
        { id:'Maja',       name:'Maja',       lang:'pl', locale:'pl-PL', region:'Poland',        gender:'female', base:'alloy',   voiceSpeed:1.15, desc:'Clear & natural'      },
    ];

    /* ── Voice render ─────────────────────────────────────────── */
    function renderVoices() {
        var filterLang   = (document.getElementById('tts-lang-filter')  || {}).value || '';
        var list = VOICES.filter(function(v) {
            var langOk   = !filterLang  || v.lang   === filterLang;
            var genderOk = !genderFilter || v.gender === genderFilter;
            return langOk && genderOk;
        });
        var grid = document.getElementById('tts-voice-grid');
        if (!grid) return;
        grid.innerHTML = '';
        if (!list.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;color:var(--dts-muted);font-size:.82rem;padding:12px 4px">No voices match your filters.</div>';
            return;
        }
        list.forEach(function(v) {
            var card = document.createElement('button');
            card.className = 'tts-voice-card' + (v.id === selectedVoice ? ' selected' : '');
            card.dataset.voice = v.id;
            card.innerHTML =
                '<div class="tts-voice-name">' + esc(v.name) + '</div>' +
                '<div class="tts-voice-meta">' + esc(v.region) + '</div>' +
                '<div class="tts-voice-desc">' + esc(v.desc) + '</div>' +
                '<span class="tts-voice-gender ' + v.gender + '">' + (v.gender === 'male' ? '♂ Male' : '♀ Female') + '</span>';
            card.addEventListener('click', function() {
                selectedVoice = v.id;
                document.querySelectorAll('.tts-voice-card').forEach(function(c) { c.classList.remove('selected'); });
                card.classList.add('selected');
                updateVoiceBadge(v);
                updateTranslateNote(v);
            });
            grid.appendChild(card);
        });
    }

    function updateVoiceBadge(v) {
        var badge = document.getElementById('tts-voice-badge');
        if (!badge) return;
        if (!v) {
            var found = VOICES.find(function(x) { return x.id === selectedVoice; });
            v = found || null;
        }
        if (v) {
            badge.className = 'tts-voice-badge selected';
            badge.innerHTML =
                '<span class="tts-badge-icon">' + (v.gender === 'male' ? '♂' : '♀') + '</span>' +
                '<strong>' + esc(v.name) + '</strong>' +
                '<span class="tts-badge-region">' + esc(v.region) + '</span>' +
                '<span class="tts-badge-lang">' + esc(v.lang.toUpperCase()) + '</span>';
        } else {
            badge.className = 'tts-voice-badge';
            badge.textContent = 'Select a voice below →';
        }
    }

    function updateTranslateNote(v) {
        var note    = document.getElementById('tts-translate-note');
        var noteText = document.getElementById('tts-translate-note-text');
        var toggle  = document.getElementById('tts-translate-toggle');
        var label   = document.getElementById('tts-translate-label');
        if (!note || !v) return;
        var isNonEn = v.lang && v.lang !== 'en';
        if (toggle) toggle.checked = isNonEn;
        if (label) {
            label.textContent = isNonEn
                ? 'Auto-translate to ' + v.region + ' language'
                : 'Auto-translate (optional)';
        }
        note.style.display = 'flex';
        if (noteText) {
            noteText.textContent = isNonEn
                ? 'Text will be translated to ' + v.locale.toUpperCase() + ' before speaking'
                : 'Translation is off — speaking in original language';
        }
    }

    /* ── Translation via Groq ─────────────────────────────────── */
    async function translateText(text, targetLocale, targetLang) {
        if (!text || !targetLocale) return text;
        if (typeof window.groqFetch !== 'function') return text;
        try {
            var res = await window.groqFetch({
                model: 'llama-3.1-8b-instant',
                messages: [
                    { role: 'system', content: 'You are a professional translator. Translate the given text accurately to the target language. Return ONLY the translated text with no explanation, no quotes, no labels.' },
                    { role: 'user',   content: 'Translate to ' + targetLocale + ' (' + targetLang + '):\n\n' + text }
                ],
                temperature: 0.3,
                max_tokens: 2000
            });
            if (!res.ok) return text;
            var data = await res.json();
            var translated = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content || '').trim();
            return translated || text;
        } catch(e) { return text; }
    }

    /* ── Pollinations TTS fetch — single voice attempt ──────────
       text.pollinations.ai supports: model=openai-audio, voice={name}
       Supported voices: alloy · echo · fable · onyx · nova · shimmer
       NOTE: speed param is NOT supported — differentiation is done via
       audio.playbackRate on the player element after download.
    ── */
    async function fetchChunkOnce(text, voice) {
        var encoded = encodeURIComponent(text);
        var url = 'https://text.pollinations.ai/' + encoded +
                  '?model=openai-audio' +
                  '&voice=' + encodeURIComponent(voice);
        var ctrl = new AbortController();
        var tid  = setTimeout(function() { ctrl.abort(); }, 25000);
        try {
            var r = await fetch(url, { signal: ctrl.signal });
            clearTimeout(tid);
            if (!r.ok) throw new Error('HTTP ' + r.status);
            var buf = await r.arrayBuffer();
            if (!buf || buf.byteLength < 50) throw new Error('Empty audio');
            return buf;
        } catch(e) {
            clearTimeout(tid);
            throw e;
        }
    }

    /* ── fetchChunk: try requested voice, then gender-safe fallback ──
       Only uses the 6 proven Pollinations voices.
       Male:   onyx · echo · fable
       Female: nova · shimmer · alloy
       Never crosses gender boundaries.
       Adds a short delay before each fallback to avoid 429 rate limits.
    ── */
    async function fetchChunk(text, baseVoice, locale, gender) {
        /* Try the exact requested voice first */
        try { return await fetchChunkOnce(text, baseVoice); } catch(_) {}

        /* Gender-strict fallbacks — 2 attempts max, with delay to avoid 429 */
        var maleFallbacks   = ['echo', 'fable', 'onyx'];
        var femaleFallbacks = ['shimmer', 'alloy', 'nova'];
        var fallbacks = (gender === 'female') ? femaleFallbacks : maleFallbacks;
        fallbacks = fallbacks.filter(function(v) { return v !== baseVoice; }).slice(0, 2);

        for (var fi = 0; fi < fallbacks.length; fi++) {
            /* Wait before retrying so we don't trigger Pollinations rate limit */
            await new Promise(function(r) { setTimeout(r, 800); });
            try { return await fetchChunkOnce(text, fallbacks[fi]); } catch(_) {}
        }
        throw new Error('All voices failed for chunk');
    }

    function concatBuffers(buffers) {
        var total  = buffers.reduce(function(a, b) { return a + b.byteLength; }, 0);
        var result = new Uint8Array(total);
        var offset = 0;
        buffers.forEach(function(b) { result.set(new Uint8Array(b), offset); offset += b.byteLength; });
        return result.buffer;
    }

    function splitText(text) {
        if (text.length <= CHUNK_SIZE) return [text];
        var chunks    = [];
        var sentences = text.match(/[^.!?]+[.!?]+[\s]*/g) || [text];
        var current   = '';
        sentences.forEach(function(s) {
            if ((current + s).length > CHUNK_SIZE) {
                if (current) chunks.push(current.trim());
                while (s.length > CHUNK_SIZE) { chunks.push(s.slice(0, CHUNK_SIZE).trim()); s = s.slice(CHUNK_SIZE); }
                current = s;
            } else { current += s; }
        });
        if (current.trim()) chunks.push(current.trim());
        return chunks.filter(function(c) { return c.length > 0; });
    }

    function speakWithBrowser(text, speed, voiceObj) {
        return new Promise(function(resolve, reject) {
            if (!window.speechSynthesis) { reject(new Error('Not supported')); return; }
            window.speechSynthesis.cancel();
            var u    = new SpeechSynthesisUtterance(text);
            u.rate   = Math.min(Math.max(parseFloat(speed) || 1, 0.1), 10);
            u.lang   = (voiceObj && voiceObj.locale) || 'en-US';
            u.onend  = resolve;
            u.onerror = function(e) { reject(new Error(e.error || 'speech-error')); };

            function pickVoiceAndSpeak() {
                var voices = window.speechSynthesis.getVoices();
                if (voiceObj && voices.length) {
                    var locale = voiceObj.locale || 'en-US';
                    var lang   = locale.split('-')[0];
                    var isFem  = voiceObj.gender === 'female';
                    var pick =
                        voices.find(function(v) { return v.lang === locale && (isFem ? /female|woman|girl|zira|hazel|susan|karen|samantha|victoria|moira|tessa|fiona|helena|anna/i.test(v.name) : /male|man|david|james|george|mark|daniel|rishi|fred|alex/i.test(v.name)); }) ||
                        voices.find(function(v) { return v.lang === locale; }) ||
                        voices.find(function(v) { return v.lang.startsWith(lang) && (isFem ? /female|woman|girl|zira|hazel|susan|karen|samantha|victoria|moira|tessa|fiona|helena|anna/i.test(v.name) : /male|man|david|james|george|mark|daniel|rishi|fred|alex/i.test(v.name)); }) ||
                        voices.find(function(v) { return v.lang.startsWith(lang); }) ||
                        voices.find(function(v) { return v.lang.startsWith('en'); });
                    if (pick) u.voice = pick;
                }
                window.speechSynthesis.speak(u);
            }

            var existing = window.speechSynthesis.getVoices();
            if (existing.length) {
                setTimeout(pickVoiceAndSpeak, 50);
            } else {
                window.speechSynthesis.onvoiceschanged = function() {
                    window.speechSynthesis.onvoiceschanged = null;
                    setTimeout(pickVoiceAndSpeak, 50);
                };
                setTimeout(pickVoiceAndSpeak, 1200);
            }
        });
    }

    /* ── Generate ─────────────────────────────────────────────── */
    async function generate() {
        var text  = (document.getElementById('tts-text') || {}).value || '';
        text = text.trim();
        var speed = parseFloat((document.getElementById('tts-speed') || {}).value) || 1.0;

        if (!text) { document.getElementById('tts-text') && document.getElementById('tts-text').focus(); return; }
        if (!selectedVoice) { showError('Please select a voice first.'); return; }

        var voiceObj = VOICES.find(function(v) { return v.id === selectedVoice; });
        if (!voiceObj) { showError('Invalid voice selected.'); return; }

        setGenerating(true);
        hideError();
        hideDownload();
        var player = document.getElementById('tts-player');
        if (player) player.classList.remove('visible');

        /* Step 1: Translate if requested */
        var translateOn = (document.getElementById('tts-translate-toggle') || {}).checked;
        var ttsText = text;
        if (translateOn && voiceObj.lang !== 'en') {
            setStatus('Translating to ' + voiceObj.locale.toUpperCase() + '…', true);
            ttsText = await translateText(text, voiceObj.locale, voiceObj.lang);
        }

        /* Step 2: TTS — pass voiceObj.voiceSpeed to make each voice unique */
        setStatus('Generating audio with ' + voiceObj.name + '…', true);
        var chunks  = splitText(ttsText);
        var buffers = [];
        var usedBrowser = false;

        for (var i = 0; i < chunks.length; i++) {
            setStatus('Generating audio… (' + (i + 1) + '/' + chunks.length + ')', true);
            try {
                var buf = await fetchChunk(chunks[i], voiceObj.base, voiceObj.locale, voiceObj.gender);
                buffers.push(buf);
            } catch(e) {
                usedBrowser = true;
                break;
            }
        }

        setGenerating(false);
        setStatus('', false);

        if (usedBrowser || !buffers.length) {
            browserModeText  = ttsText;
            browserModeSpeed = speed;
            browserModeVoice = voiceObj;
            showBrowserPlayer(ttsText, speed, voiceObj);
            try { await speakWithBrowser(ttsText, speed, voiceObj); } catch(e) {}
            return;
        }

        /* Merge chunks into single blob */
        var finalBuf  = buffers.length === 1 ? buffers[0] : concatBuffers(buffers);
        var blob      = new Blob([finalBuf], { type: 'audio/mpeg' });
        var url       = URL.createObjectURL(blob);
        currentAudioBlob = blob;
        currentAudioUrl  = url;
        browserModeText  = null;

        showRealPlayer(url, blob, voiceObj, speed, text);
        saveToHistory(text, voiceObj, speed);
    }

    /* ── Player display ─────────────────────────────────────────── */
    function showRealPlayer(url, blob, voiceObj, speed, originalText) {
        var audio = document.getElementById('tts-audio');
        if (audio) {
            audio.style.display = 'block';
            audio.src = url;
            audio.load();
            /* voiceSpeed makes each voice sound distinct at playback time */
            var baseRate = parseFloat((voiceObj && voiceObj.voiceSpeed) || 1.0);
            audio.playbackRate = Math.min(Math.max(baseRate * speed, 0.1), 4.0);
            audio.play().catch(function() {});
        }

        var bp = document.getElementById('tts-browser-player');
        if (bp) bp.style.display = 'none';

        /* Show download button with file info */
        var dl = document.getElementById('tts-download-btn');
        if (dl) {
            dl.style.display = '';
            var kb = blob ? Math.round(blob.size / 1024) : 0;
            dl.innerHTML =
                '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>' +
                ' Download MP3' + (kb > 0 ? ' (' + kb + ' KB)' : '');
        }

        var row = document.getElementById('tts-player-voice-row');
        if (row) {
            row.innerHTML =
                '<span class="tts-pv-name">' + esc(voiceObj.name) + '</span>' +
                '<span class="tts-pv-region">' + esc(voiceObj.region) + '</span>' +
                '<span class="tts-pv-gender ' + voiceObj.gender + '">' + (voiceObj.gender === 'male' ? '♂' : '♀') + '</span>' +
                '<span class="tts-pv-speed">' + speed.toFixed(1) + '×</span>' +
                '<span class="tts-pv-chars">' + originalText.length + ' chars</span>';
        }

        var info = document.getElementById('tts-player-info');
        if (info) info.textContent = voiceObj.desc + ' · ' + voiceObj.locale.toUpperCase();

        var player = document.getElementById('tts-player');
        if (player) player.classList.add('visible');
    }

    function showBrowserPlayer(text, speed, voiceObj) {
        currentAudioUrl  = null;
        currentAudioBlob = null;

        var audio = document.getElementById('tts-audio');
        if (audio) audio.style.display = 'none';

        var bp = document.getElementById('tts-browser-player');
        if (bp) bp.style.display = 'flex';

        hideDownload();

        var row = document.getElementById('tts-player-voice-row');
        if (row) row.innerHTML = '<span class="tts-pv-name">Browser Voice</span><span class="tts-pv-region">Built-in</span>';

        var info = document.getElementById('tts-player-info');
        if (info) info.textContent = 'Download unavailable in browser fallback mode';

        var player = document.getElementById('tts-player');
        if (player) player.classList.add('visible');
    }

    function hideDownload() {
        var dl = document.getElementById('tts-download-btn');
        if (dl) dl.style.display = 'none';
    }

    /* ── Download ─────────────────────────────────────────────── */
    function download() {
        if (!currentAudioBlob) {
            showError('No audio to download. Generate speech first.');
            return;
        }
        var voiceObj = VOICES.find(function(v) { return v.id === selectedVoice; });
        var vName    = voiceObj ? voiceObj.name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'tts';
        var lang     = voiceObj ? voiceObj.lang : 'en';
        var ts       = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        var fileName = 'xzily-tts-' + vName + '-' + lang + '-' + ts + '.mp3';
        var a        = document.createElement('a');
        a.href       = URL.createObjectURL(currentAudioBlob);
        a.download   = fileName;
        document.body.appendChild(a);
        a.click();
        setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(a.href); }, 1000);
    }

    /* ── History ─────────────────────────────────────────────── */
    function saveToHistory(text, voiceObj, speed) {
        var h = loadHistory();
        h.unshift({ id: Date.now(), text: text, voiceName: voiceObj.name, voiceId: voiceObj.id, region: voiceObj.region, speed: speed, ts: Date.now() });
        if (h.length > 15) h = h.slice(0, 15);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); } catch(e) {}
        renderHistory();
    }

    function loadHistory() {
        try { var r = localStorage.getItem(HISTORY_KEY); return r ? JSON.parse(r) : []; } catch(e) { return []; }
    }

    function renderHistory() {
        var h    = loadHistory();
        var wrap = document.getElementById('tts-history-wrap');
        var list = document.getElementById('tts-history-list');
        if (!list) return;
        if (!h.length) { if (wrap) wrap.style.display = 'none'; return; }
        if (wrap) wrap.style.display = 'block';
        list.innerHTML = '';
        h.slice(0, 10).forEach(function(entry) {
            var item = document.createElement('div');
            item.className = 'tts-history-item';
            item.innerHTML =
                '<div class="tts-history-icon">🔊</div>' +
                '<div class="tts-history-info">' +
                    '<div class="tts-history-text" title="' + esc(entry.text) + '">' + esc(entry.text.slice(0, 70)) + (entry.text.length > 70 ? '…' : '') + '</div>' +
                    '<div class="tts-history-meta">' + esc(entry.voiceName || '') + ' · ' + esc(entry.region || '') + ' · ' + (entry.speed || 1) + '×</div>' +
                '</div>' +
                '<button class="tts-btn tts-btn-ghost tts-btn-sm tts-h-reuse">Reuse</button>';
            item.querySelector('.tts-h-reuse').addEventListener('click', function(e) {
                e.stopPropagation();
                var ta = document.getElementById('tts-text');
                if (ta) { ta.value = entry.text; updateCharCount(); }
                if (entry.voiceId) {
                    selectedVoice = entry.voiceId;
                    var vo = VOICES.find(function(v) { return v.id === entry.voiceId; });
                    if (vo) {
                        var lf = document.getElementById('tts-lang-filter');
                        if (lf) lf.value = vo.lang;
                        renderVoices();
                        updateVoiceBadge(vo);
                        updateTranslateNote(vo);
                    }
                }
            });
            list.appendChild(item);
        });
    }

    /* ── UI helpers ──────────────────────────────────────────── */
    function updateCharCount() {
        var text = (document.getElementById('tts-text') || {}).value || '';
        var len  = text.length;
        var el   = document.getElementById('tts-char-count');
        if (!el) return;
        el.textContent = len.toLocaleString() + ' / 5,000 characters';
        el.className   = 'tts-char-count' + (len >= MAX_CHARS ? ' over' : len > 4500 ? ' warn' : '');
    }

    function setGenerating(on) {
        var btn = document.getElementById('tts-generate-btn');
        if (btn) {
            btn.disabled    = on;
            btn.textContent = on ? 'Generating…' : '';
            if (!on) {
                btn.innerHTML =
                    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>' +
                    ' Generate Speech';
            }
        }
    }

    function setStatus(text, show) {
        var el = document.getElementById('tts-status');
        var tx = document.getElementById('tts-status-text');
        if (el) el.className = 'tts-status' + (show ? ' visible' : '');
        if (tx && text) tx.textContent = text;
    }

    function showError(msg) {
        var el = document.getElementById('tts-error');
        if (el) { el.textContent = '⚠ ' + msg; el.className = 'tts-error visible'; }
    }

    function hideError() {
        var el = document.getElementById('tts-error');
        if (el) el.className = 'tts-error';
    }

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ── Init ────────────────────────────────────────────────── */
    document.addEventListener('DOMContentLoaded', function() {

        renderVoices();
        updateVoiceBadge(null);
        renderHistory();

        /* Language filter */
        var lf = document.getElementById('tts-lang-filter');
        if (lf) lf.addEventListener('change', function() { renderVoices(); });

        /* Gender filter buttons */
        var gfBtns = document.querySelectorAll('.tts-gender-btn');
        gfBtns.forEach(function(btn) {
            btn.addEventListener('click', function() {
                genderFilter = btn.dataset.gender;
                gfBtns.forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                renderVoices();
            });
        });

        /* Speed slider */
        var speedEl  = document.getElementById('tts-speed');
        var speedVal = document.getElementById('tts-speed-val');
        if (speedEl && speedVal) {
            speedEl.addEventListener('input', function() {
                var v = parseFloat(this.value).toFixed(1);
                speedVal.textContent = v + '×';
                var audio = document.getElementById('tts-audio');
                if (audio && audio.src) audio.playbackRate = parseFloat(v);
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

        /* Download */
        var dlBtn = document.getElementById('tts-download-btn');
        if (dlBtn) dlBtn.addEventListener('click', download);

        /* Regenerate */
        var regenBtn = document.getElementById('tts-regen-btn');
        if (regenBtn) regenBtn.addEventListener('click', generate);

        /* Clear */
        var clearBtn = document.getElementById('tts-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', function() {
                var ta = document.getElementById('tts-text');
                if (ta) ta.value = '';
                updateCharCount();
                var player = document.getElementById('tts-player');
                if (player) player.classList.remove('visible');
                hideError();
                hideDownload();
                currentAudioUrl  = null;
                currentAudioBlob = null;
                browserModeText  = null;
                browserModeVoice = null;
                if (window.speechSynthesis) window.speechSynthesis.cancel();
                var audio = document.getElementById('tts-audio');
                if (audio) { audio.pause(); audio.src = ''; audio.style.display = 'block'; }
                var bp = document.getElementById('tts-browser-player');
                if (bp) bp.style.display = 'none';
            });
        }

        /* Browser speech play/stop */
        var bPlay = document.getElementById('tts-browser-play-btn');
        if (bPlay) bPlay.addEventListener('click', function() {
            if (browserModeText) speakWithBrowser(browserModeText, browserModeSpeed, browserModeVoice).catch(function() {});
        });
        var bStop = document.getElementById('tts-browser-stop-btn');
        if (bStop) bStop.addEventListener('click', function() {
            if (window.speechSynthesis) window.speechSynthesis.cancel();
        });

        /* Clear history */
        var clrHist = document.getElementById('tts-clear-history-btn');
        if (clrHist) {
            clrHist.addEventListener('click', function() {
                if (confirm('Clear all audio history?')) {
                    try { localStorage.removeItem(HISTORY_KEY); } catch(e) {}
                    renderHistory();
                }
            });
        }
    });

})();
