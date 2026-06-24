/* aqs-tts.js — XZILY AI Text-to-Speech v4
   82 professional voices · ElevenLabs audio · Download
   ─────────────────────────────────────────────────────────────────────────── */
(function () {
    'use strict';

    /* ══════════════════════════════════════════════════════════════
       ELEVENLABS KEYS
       Keys are loaded automatically from Admin Settings → ElevenLabs section.
       You can also hardcode a fallback key below — it is used only if no key
       is found in settings (useful for local dev / first-time setup).
       Get a free key at: https://elevenlabs.io  (10,000 chars/month free)
    ══════════════════════════════════════════════════════════════ */
    var ELEVENLABS_API_KEY = 'sk_e131aff66357411f0a986e0a20d64b95af90e87f6c976fa9';   /* fallback — override via Admin Settings → ElevenLabs */
    var _elKeys = [];              /* loaded from Firebase admin settings */

    /* ElevenLabs multilingual voice IDs — these are free-tier voices that
       support all major languages via the multilingual-v2 model.
       10 distinct voices cover all 82 named characters below.             */
    var EL_VOICES = {
        /* Male */
        ADAM:    'pNInz6obpgDQGcFmaJgB',   /* deep, authoritative          */
        ARNOLD:  'VR6AewLTigWG4xSOukaG',   /* bold, confident              */
        CALLUM:  'N2lVS1w4EtoT3dr4eOWO',   /* warm, conversational         */
        CHARLIE: 'IKne3meq5aSn9XLyUdCD',   /* casual, friendly             */
        DANIEL:  'onwK4e9ZLuTAKqWW03F9',   /* british, refined             */
        /* Female */
        RACHEL:  '21m00Tcm4TlvDq8ikWAM',   /* clear, professional          */
        DOMI:    'AZnzlk1XvdvUeBnXmlld',   /* bright, energetic            */
        BELLA:   'EXAVITQu4vr4xnSDxMaL',   /* warm, natural                */
        ELLI:    'MF3mGyEYCl7XYWbV9V6O',   /* expressive, dynamic          */
        GRACE:   'oWAxZDx7w5VEj9dCyTzz',   /* elegant, composed            */
    };

    var HISTORY_KEY = 'xzily_tts_history';
    var MAX_CHARS   = 5000;
    var CHUNK_SIZE  = 400;   /* ElevenLabs handles longer chunks fine */

    var selectedVoice    = '';
    var currentAudioBlob = null;
    var currentAudioUrl  = null;
    var browserModeText  = null;
    var browserModeVoice = null;
    var browserModeSpeed = 1;
    var genderFilter     = '';

    /* ══════════════════════════════════════════════════════════════
       82 PROFESSIONAL VOICES
       elVoice → key from EL_VOICES above (maps to real ElevenLabs voice ID)
       voiceSpeed → applied as audio.playbackRate for acoustic differentiation
    ══════════════════════════════════════════════════════════════ */
    var VOICES = [
        /* ── ENGLISH MALE (10) ─────────────────────────────────── */
        { id:'Brian',      name:'Brian',      lang:'en', locale:'en-GB', region:'UK',            gender:'male',   elVoice:'ADAM',    voiceSpeed:0.92, desc:'Deep & authoritative' },
        { id:'Matthew',    name:'Matthew',    lang:'en', locale:'en-US', region:'US',            gender:'male',   elVoice:'ARNOLD',  voiceSpeed:0.96, desc:'Bold & professional'  },
        { id:'Joey',       name:'Joey',       lang:'en', locale:'en-US', region:'US',            gender:'male',   elVoice:'CALLUM',  voiceSpeed:0.88, desc:'Friendly & clear'     },
        { id:'Justin',     name:'Justin',     lang:'en', locale:'en-US', region:'US',            gender:'male',   elVoice:'CHARLIE', voiceSpeed:1.00, desc:'Casual & conversational'},
        { id:'Russell',    name:'Russell',    lang:'en', locale:'en-AU', region:'AU',            gender:'male',   elVoice:'CALLUM',  voiceSpeed:0.94, desc:'Australian accent'    },
        { id:'Daniel',     name:'Daniel',     lang:'en', locale:'en-GB', region:'UK',            gender:'male',   elVoice:'DANIEL',  voiceSpeed:1.00, desc:'British & refined'    },
        { id:'Kevin',      name:'Kevin',      lang:'en', locale:'en-US', region:'US',            gender:'male',   elVoice:'ARNOLD',  voiceSpeed:1.05, desc:'Crisp & energetic'    },
        { id:'Geraint',    name:'Geraint',    lang:'en', locale:'en-GB', region:'Wales',         gender:'male',   elVoice:'ADAM',    voiceSpeed:1.08, desc:'Welsh character'      },
        { id:'Arthur',     name:'Arthur',     lang:'en', locale:'en-GB', region:'UK',            gender:'male',   elVoice:'DANIEL',  voiceSpeed:0.92, desc:'Classic British'      },
        { id:'Ryan',       name:'Ryan',       lang:'en', locale:'en-CA', region:'Canada',        gender:'male',   elVoice:'CHARLIE', voiceSpeed:1.05, desc:'Canadian & neutral'   },
        /* ── ENGLISH FEMALE (10) ────────────────────────────────── */
        { id:'Amy',        name:'Amy',        lang:'en', locale:'en-GB', region:'UK',            gender:'female', elVoice:'RACHEL',  voiceSpeed:0.92, desc:'Bright & professional'},
        { id:'Emma',       name:'Emma',       lang:'en', locale:'en-GB', region:'UK',            gender:'female', elVoice:'GRACE',   voiceSpeed:0.96, desc:'Confident & clear'    },
        { id:'Joanna',     name:'Joanna',     lang:'en', locale:'en-US', region:'US',            gender:'female', elVoice:'BELLA',   voiceSpeed:0.92, desc:'Warm & articulate'    },
        { id:'Salli',      name:'Salli',      lang:'en', locale:'en-US', region:'US',            gender:'female', elVoice:'ELLI',    voiceSpeed:1.00, desc:'Engaging & natural'   },
        { id:'Kimberly',   name:'Kimberly',   lang:'en', locale:'en-US', region:'US',            gender:'female', elVoice:'DOMI',    voiceSpeed:0.94, desc:'Neutral & versatile'  },
        { id:'Kendra',     name:'Kendra',     lang:'en', locale:'en-US', region:'US',            gender:'female', elVoice:'RACHEL',  voiceSpeed:1.05, desc:'Conversational tone'  },
        { id:'Nicole',     name:'Nicole',     lang:'en', locale:'en-AU', region:'AU',            gender:'female', elVoice:'BELLA',   voiceSpeed:1.08, desc:'Australian & friendly'},
        { id:'Olivia',     name:'Olivia',     lang:'en', locale:'en-AU', region:'AU',            gender:'female', elVoice:'DOMI',    voiceSpeed:0.88, desc:'Australian & bright'  },
        { id:'Aria',       name:'Aria',       lang:'en', locale:'en-US', region:'US',            gender:'female', elVoice:'ELLI',    voiceSpeed:1.08, desc:'Expressive & dynamic' },
        { id:'Jane',       name:'Jane',       lang:'en', locale:'en-GB', region:'UK',            gender:'female', elVoice:'GRACE',   voiceSpeed:0.88, desc:'Elegant & composed'   },
        /* ── SPANISH MALE (4) ───────────────────────────────────── */
        { id:'Enrique',    name:'Enrique',    lang:'es', locale:'es-ES', region:'Spain',         gender:'male',   elVoice:'ADAM',    voiceSpeed:0.96, desc:'Spanish Castilian'    },
        { id:'Miguel',     name:'Miguel',     lang:'es', locale:'es-US', region:'US-Latino',     gender:'male',   elVoice:'CALLUM',  voiceSpeed:1.00, desc:'Latino US accent'     },
        { id:'Pablo',      name:'Pablo',      lang:'es', locale:'es-MX', region:'Mexico',        gender:'male',   elVoice:'CHARLIE', voiceSpeed:1.08, desc:'Mexican accent'       },
        { id:'Carlos',     name:'Carlos',     lang:'es', locale:'es-AR', region:'Argentina',     gender:'male',   elVoice:'ARNOLD',  voiceSpeed:0.92, desc:'Argentine accent'     },
        /* ── SPANISH FEMALE (4) ─────────────────────────────────── */
        { id:'Conchita',   name:'Conchita',   lang:'es', locale:'es-ES', region:'Spain',         gender:'female', elVoice:'RACHEL',  voiceSpeed:0.96, desc:'Spanish Castilian'    },
        { id:'Lucia',      name:'Lucía',      lang:'es', locale:'es-ES', region:'Spain',         gender:'female', elVoice:'GRACE',   voiceSpeed:1.05, desc:'Bright & precise'     },
        { id:'Penelope',   name:'Penélope',   lang:'es', locale:'es-US', region:'US-Latino',     gender:'female', elVoice:'BELLA',   voiceSpeed:1.00, desc:'Neutral Latino'       },
        { id:'Valentina',  name:'Valentina',  lang:'es', locale:'es-MX', region:'Mexico',        gender:'female', elVoice:'ELLI',    voiceSpeed:0.92, desc:'Warm Mexican tone'    },
        /* ── FRENCH MALE (3) ────────────────────────────────────── */
        { id:'Mathieu',    name:'Mathieu',    lang:'fr', locale:'fr-FR', region:'France',        gender:'male',   elVoice:'DANIEL',  voiceSpeed:0.96, desc:'Deep Parisian'        },
        { id:'Pierre',     name:'Pierre',     lang:'fr', locale:'fr-FR', region:'France',        gender:'male',   elVoice:'ADAM',    voiceSpeed:1.05, desc:'Sophisticated'        },
        { id:'Jacques',    name:'Jacques',    lang:'fr', locale:'fr-CA', region:'Canada',        gender:'male',   elVoice:'CALLUM',  voiceSpeed:0.92, desc:'Québécois accent'     },
        /* ── FRENCH FEMALE (3) ──────────────────────────────────── */
        { id:'Celine',     name:'Céline',     lang:'fr', locale:'fr-FR', region:'France',        gender:'female', elVoice:'GRACE',   voiceSpeed:0.92, desc:'Elegant Parisian'     },
        { id:'Isabelle',   name:'Isabelle',   lang:'fr', locale:'fr-FR', region:'France',        gender:'female', elVoice:'BELLA',   voiceSpeed:1.05, desc:'Clear & fluid'        },
        { id:'Chantal',    name:'Chantal',    lang:'fr', locale:'fr-CA', region:'Canada',        gender:'female', elVoice:'DOMI',    voiceSpeed:1.00, desc:'Québécois warmth'     },
        /* ── GERMAN MALE (3) ────────────────────────────────────── */
        { id:'Hans',       name:'Hans',       lang:'de', locale:'de-DE', region:'Germany',       gender:'male',   elVoice:'ADAM',    voiceSpeed:0.88, desc:'Bold & precise'       },
        { id:'Klaus',      name:'Klaus',      lang:'de', locale:'de-DE', region:'Germany',       gender:'male',   elVoice:'ARNOLD',  voiceSpeed:1.08, desc:'Authoritative'        },
        { id:'Wolfgang',   name:'Wolfgang',   lang:'de', locale:'de-AT', region:'Austria',       gender:'male',   elVoice:'DANIEL',  voiceSpeed:1.05, desc:'Austrian dialect'     },
        /* ── GERMAN FEMALE (3) ──────────────────────────────────── */
        { id:'Marlene',    name:'Marlene',    lang:'de', locale:'de-DE', region:'Germany',       gender:'female', elVoice:'RACHEL',  voiceSpeed:1.00, desc:'Warm & professional'  },
        { id:'Vicki',      name:'Vicki',      lang:'de', locale:'de-DE', region:'Germany',       gender:'female', elVoice:'ELLI',    voiceSpeed:0.94, desc:'Bright & energetic'   },
        { id:'Petra',      name:'Petra',      lang:'de', locale:'de-AT', region:'Austria',       gender:'female', elVoice:'BELLA',   voiceSpeed:1.08, desc:'Austrian clarity'     },
        /* ── PORTUGUESE MALE (3) ────────────────────────────────── */
        { id:'Cristiano',  name:'Cristiano',  lang:'pt', locale:'pt-PT', region:'Portugal',      gender:'male',   elVoice:'CALLUM',  voiceSpeed:0.96, desc:'European Portuguese'  },
        { id:'Ricardo',    name:'Ricardo',    lang:'pt', locale:'pt-BR', region:'Brazil',        gender:'male',   elVoice:'CHARLIE', voiceSpeed:0.92, desc:'Brazilian warmth'     },
        { id:'Eduardo',    name:'Eduardo',    lang:'pt', locale:'pt-BR', region:'Brazil',        gender:'male',   elVoice:'ARNOLD',  voiceSpeed:1.00, desc:'Deep & confident'     },
        /* ── PORTUGUESE FEMALE (3) ──────────────────────────────── */
        { id:'Ines',       name:'Inês',       lang:'pt', locale:'pt-PT', region:'Portugal',      gender:'female', elVoice:'DOMI',    voiceSpeed:0.96, desc:'European Portuguese'  },
        { id:'Vitoria',    name:'Vitória',    lang:'pt', locale:'pt-BR', region:'Brazil',        gender:'female', elVoice:'ELLI',    voiceSpeed:1.05, desc:'Brazilian vivacity'   },
        { id:'Ana',        name:'Ana',        lang:'pt', locale:'pt-PT', region:'Portugal',      gender:'female', elVoice:'GRACE',   voiceSpeed:1.00, desc:'Clear & precise'      },
        /* ── ITALIAN MALE (2) ───────────────────────────────────── */
        { id:'Giorgio',    name:'Giorgio',    lang:'it', locale:'it-IT', region:'Italy',         gender:'male',   elVoice:'DANIEL',  voiceSpeed:0.88, desc:'Rich & expressive'    },
        { id:'Marco',      name:'Marco',      lang:'it', locale:'it-IT', region:'Italy',         gender:'male',   elVoice:'CALLUM',  voiceSpeed:1.05, desc:'Warm & natural'       },
        /* ── ITALIAN FEMALE (2) ─────────────────────────────────── */
        { id:'Carla',      name:'Carla',      lang:'it', locale:'it-IT', region:'Italy',         gender:'female', elVoice:'RACHEL',  voiceSpeed:1.08, desc:'Clear & flowing'      },
        { id:'Bianca',     name:'Bianca',     lang:'it', locale:'it-IT', region:'Italy',         gender:'female', elVoice:'BELLA',   voiceSpeed:0.94, desc:'Bright & musical'     },
        /* ── JAPANESE MALE (2) ──────────────────────────────────── */
        { id:'Takumi',     name:'Takumi',     lang:'ja', locale:'ja-JP', region:'Japan',         gender:'male',   elVoice:'ADAM',    voiceSpeed:1.00, desc:'Clear & formal'       },
        { id:'Kenji',      name:'Kenji',      lang:'ja', locale:'ja-JP', region:'Japan',         gender:'male',   elVoice:'ARNOLD',  voiceSpeed:0.88, desc:'Deep & steady'        },
        /* ── JAPANESE FEMALE (2) ────────────────────────────────── */
        { id:'Mizuki',     name:'Mizuki',     lang:'ja', locale:'ja-JP', region:'Japan',         gender:'female', elVoice:'DOMI',    voiceSpeed:1.00, desc:'Warm & natural'       },
        { id:'Yuki',       name:'Yuki',       lang:'ja', locale:'ja-JP', region:'Japan',         gender:'female', elVoice:'ELLI',    voiceSpeed:1.05, desc:'Bright & friendly'    },
        /* ── ARABIC MALE (2) ────────────────────────────────────── */
        { id:'Khalid',     name:'Khalid',     lang:'ar', locale:'ar-SA', region:'Saudi Arabia',  gender:'male',   elVoice:'ADAM',    voiceSpeed:0.92, desc:'Deep & formal'        },
        { id:'Omar',       name:'Omar',       lang:'ar', locale:'ar-EG', region:'Egypt',         gender:'male',   elVoice:'CHARLIE', voiceSpeed:1.00, desc:'Egyptian dialect'     },
        /* ── ARABIC FEMALE (2) ──────────────────────────────────── */
        { id:'Zeina',      name:'Zeina',      lang:'ar', locale:'ar-SA', region:'Saudi Arabia',  gender:'female', elVoice:'GRACE',   voiceSpeed:0.96, desc:'Clear & flowing'      },
        { id:'Fatima',     name:'Fatima',     lang:'ar', locale:'ar-EG', region:'Egypt',         gender:'female', elVoice:'BELLA',   voiceSpeed:1.00, desc:'Warm & expressive'    },
        /* ── CHINESE MALE (2) ───────────────────────────────────── */
        { id:'Wei',        name:'Wei',        lang:'zh', locale:'zh-CN', region:'China',         gender:'male',   elVoice:'CALLUM',  voiceSpeed:1.05, desc:'Mandarin standard'    },
        { id:'Zhang',      name:'Zhang',      lang:'zh', locale:'zh-CN', region:'China',         gender:'male',   elVoice:'DANIEL',  voiceSpeed:0.94, desc:'Authoritative tone'   },
        /* ── CHINESE FEMALE (2) ─────────────────────────────────── */
        { id:'Zhiyu',      name:'Zhiyu',      lang:'zh', locale:'zh-CN', region:'China',         gender:'female', elVoice:'RACHEL',  voiceSpeed:1.05, desc:'Clear Mandarin'       },
        { id:'Mei',        name:'Mei',        lang:'zh', locale:'zh-TW', region:'Taiwan',        gender:'female', elVoice:'ELLI',    voiceSpeed:0.94, desc:'Taiwanese Mandarin'   },
        /* ── RUSSIAN MALE (2) ───────────────────────────────────── */
        { id:'Maxim',      name:'Maxim',      lang:'ru', locale:'ru-RU', region:'Russia',        gender:'male',   elVoice:'ADAM',    voiceSpeed:1.05, desc:'Deep & formal'        },
        { id:'Dmitri',     name:'Dmitri',     lang:'ru', locale:'ru-RU', region:'Russia',        gender:'male',   elVoice:'ARNOLD',  voiceSpeed:0.96, desc:'Expressive tone'      },
        /* ── RUSSIAN FEMALE (2) ─────────────────────────────────── */
        { id:'Tatyana',    name:'Tatyana',    lang:'ru', locale:'ru-RU', region:'Russia',        gender:'female', elVoice:'DOMI',    voiceSpeed:1.08, desc:'Clear & precise'      },
        { id:'Natasha',    name:'Natasha',    lang:'ru', locale:'ru-RU', region:'Russia',        gender:'female', elVoice:'BELLA',   voiceSpeed:0.92, desc:'Warm & natural'       },
        /* ── HINDI MALE (2) ─────────────────────────────────────── */
        { id:'Arjun',      name:'Arjun',      lang:'hi', locale:'hi-IN', region:'India',         gender:'male',   elVoice:'CHARLIE', voiceSpeed:0.96, desc:'Clear & professional' },
        { id:'Raj',        name:'Raj',        lang:'hi', locale:'hi-IN', region:'India',         gender:'male',   elVoice:'CALLUM',  voiceSpeed:1.08, desc:'Warm Indian tone'     },
        /* ── HINDI FEMALE (2) ───────────────────────────────────── */
        { id:'Aditi',      name:'Aditi',      lang:'hi', locale:'hi-IN', region:'India',         gender:'female', elVoice:'RACHEL',  voiceSpeed:0.92, desc:'Clear & natural'      },
        { id:'Priya',      name:'Priya',      lang:'hi', locale:'hi-IN', region:'India',         gender:'female', elVoice:'ELLI',    voiceSpeed:1.08, desc:'Bright & warm'        },
        /* ── DUTCH MALE (2) ─────────────────────────────────────── */
        { id:'Ruben',      name:'Ruben',      lang:'nl', locale:'nl-NL', region:'Netherlands',   gender:'male',   elVoice:'DANIEL',  voiceSpeed:1.00, desc:'Clear & direct'       },
        { id:'Willem',     name:'Willem',     lang:'nl', locale:'nl-NL', region:'Netherlands',   gender:'male',   elVoice:'ADAM',    voiceSpeed:0.94, desc:'Warm Dutch tone'      },
        /* ── DUTCH FEMALE (2) ───────────────────────────────────── */
        { id:'Lotte',      name:'Lotte',      lang:'nl', locale:'nl-NL', region:'Netherlands',   gender:'female', elVoice:'GRACE',   voiceSpeed:1.00, desc:'Precise & clear'      },
        { id:'Lisa',       name:'Lisa',       lang:'nl', locale:'nl-BE', region:'Belgium',       gender:'female', elVoice:'DOMI',    voiceSpeed:0.94, desc:'Belgian Dutch'        },
        /* ── KOREAN (2) ─────────────────────────────────────────── */
        { id:'Junho',      name:'Junho',      lang:'ko', locale:'ko-KR', region:'Korea',         gender:'male',   elVoice:'CHARLIE', voiceSpeed:0.92, desc:'Clear & formal'       },
        { id:'Seoyeon',    name:'Seoyeon',    lang:'ko', locale:'ko-KR', region:'Korea',         gender:'female', elVoice:'BELLA',   voiceSpeed:1.05, desc:'Bright & natural'     },
        /* ── SWEDISH (2) ────────────────────────────────────────── */
        { id:'Erik',       name:'Erik',       lang:'sv', locale:'sv-SE', region:'Sweden',        gender:'male',   elVoice:'CALLUM',  voiceSpeed:1.00, desc:'Nordic clarity'       },
        { id:'Astrid',     name:'Astrid',     lang:'sv', locale:'sv-SE', region:'Sweden',        gender:'female', elVoice:'RACHEL',  voiceSpeed:0.96, desc:'Scandinavian warmth'  },
        /* ── TURKISH (2) ────────────────────────────────────────── */
        { id:'Mehmet',     name:'Mehmet',     lang:'tr', locale:'tr-TR', region:'Turkey',        gender:'male',   elVoice:'ARNOLD',  voiceSpeed:1.05, desc:'Warm & expressive'    },
        { id:'Filiz',      name:'Filiz',      lang:'tr', locale:'tr-TR', region:'Turkey',        gender:'female', elVoice:'ELLI',    voiceSpeed:1.00, desc:'Clear & melodic'      },
        /* ── POLISH (2) ─────────────────────────────────────────── */
        { id:'Jacek',      name:'Jacek',      lang:'pl', locale:'pl-PL', region:'Poland',        gender:'male',   elVoice:'DANIEL',  voiceSpeed:0.96, desc:'Bold & steady'        },
        { id:'Maja',       name:'Maja',       lang:'pl', locale:'pl-PL', region:'Poland',        gender:'female', elVoice:'GRACE',   voiceSpeed:1.08, desc:'Clear & natural'      },
    ];

    /* ── Voice render ─────────────────────────────────────────── */
    function renderVoices() {
        var filterLang = (document.getElementById('tts-lang-filter') || {}).value || '';
        var list = VOICES.filter(function(v) {
            var langOk   = !filterLang   || v.lang   === filterLang;
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
        var note     = document.getElementById('tts-translate-note');
        var noteText = document.getElementById('tts-translate-note-text');
        var toggle   = document.getElementById('tts-translate-toggle');
        var label    = document.getElementById('tts-translate-label');
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

    /* ── ElevenLabs TTS fetch ─────────────────────────────────────
       Uses multilingual-v2 model — supports all major languages.
       Tries each key in _elKeys in order; skips 401/429 keys automatically.
       Falls back to browser TTS if no working key is found.
    ── */
    function _getActiveKeys() {
        /* Priority: admin-loaded keys → hardcoded fallback → empty */
        var keys = _elKeys.length ? _elKeys.slice() : [];
        if (ELEVENLABS_API_KEY && keys.indexOf(ELEVENLABS_API_KEY) === -1) {
            keys.unshift(ELEVENLABS_API_KEY);
        }
        return keys;
    }

    async function _tryOneKey(text, elVoiceKey, apiKey) {
        var voiceId = EL_VOICES[elVoiceKey] || EL_VOICES.ADAM;
        var url = 'https://api.elevenlabs.io/v1/text-to-speech/' + voiceId;
        var ctrl = new AbortController();
        var tid  = setTimeout(function() { ctrl.abort(); }, 30000);
        try {
            var r = await fetch(url, {
                method: 'POST',
                signal: ctrl.signal,
                headers: {
                    'xi-api-key':   apiKey,
                    'Content-Type': 'application/json',
                    'Accept':       'audio/mpeg'
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: { stability: 0.5, similarity_boost: 0.75, style: 0.0, use_speaker_boost: true }
                })
            });
            clearTimeout(tid);
            if (r.status === 401) throw new Error('INVALID_KEY');
            if (r.status === 429) throw new Error('RATE_LIMITED');
            if (!r.ok) throw new Error('HTTP_' + r.status);
            var buf = await r.arrayBuffer();
            if (!buf || buf.byteLength < 50) throw new Error('EMPTY');
            return buf;
        } catch(e) {
            clearTimeout(tid);
            throw e;
        }
    }

    async function fetchChunkElevenLabs(text, elVoiceKey) {
        var keys = _getActiveKeys();
        if (!keys.length) throw new Error('No ElevenLabs API key — add one in Admin Settings → ElevenLabs');
        var lastErr = '';
        for (var ki = 0; ki < keys.length; ki++) {
            try {
                return await _tryOneKey(text, elVoiceKey, keys[ki]);
            } catch(e) {
                lastErr = e.message || String(e);
                /* Don't retry on empty audio — that's a content issue, not a key issue */
                if (lastErr === 'EMPTY') break;
                /* Continue to next key for auth/rate-limit errors */
            }
        }
        /* Surface a human-readable error */
        if (lastErr === 'INVALID_KEY') throw new Error('ElevenLabs key invalid — update in Admin Settings → ElevenLabs');
        if (lastErr === 'RATE_LIMITED') throw new Error('All ElevenLabs keys are rate-limited — add more keys in Admin Settings');
        throw new Error('ElevenLabs audio failed: ' + lastErr);
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

        /* Warn early if no API key */
        if (!ELEVENLABS_API_KEY) {
            showError('ElevenLabs API key not set. Using browser voice as fallback. Add your key inside aqs-tts.js to enable AI voices.');
        } else {
            hideError();
        }

        setGenerating(true);
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

        /* Step 2: TTS via ElevenLabs */
        var chunks   = splitText(ttsText);
        var buffers  = [];
        var usedBrowser = false;
        var errorMsg = '';

        if (ELEVENLABS_API_KEY) {
            for (var i = 0; i < chunks.length; i++) {
                setStatus('Generating audio… (' + (i + 1) + '/' + chunks.length + ')', true);
                try {
                    var buf = await fetchChunkElevenLabs(chunks[i], voiceObj.elVoice);
                    buffers.push(buf);
                } catch(e) {
                    errorMsg = e.message || 'Audio generation failed';
                    usedBrowser = true;
                    break;
                }
            }
        } else {
            usedBrowser = true;
        }

        setGenerating(false);
        setStatus('', false);

        if (usedBrowser || !buffers.length) {
            if (errorMsg) showError(errorMsg);
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
            /* voiceSpeed creates acoustic differentiation between characters */
            var baseRate = parseFloat((voiceObj && voiceObj.voiceSpeed) || 1.0);
            audio.playbackRate = Math.min(Math.max(baseRate * speed, 0.1), 4.0);
            audio.play().catch(function() {});
        }

        var bp = document.getElementById('tts-browser-player');
        if (bp) bp.style.display = 'none';

        /* Download button with file size */
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
        if (info) info.textContent = voiceObj.desc + ' · ' + voiceObj.locale.toUpperCase() + ' · ElevenLabs';

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
        if (info) info.textContent = 'Add an ElevenLabs key in aqs-tts.js to enable AI voices & downloads';

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

    /* ── Char count ───────────────────────────────────────────── */
    function updateCharCount() {
        var ta  = document.getElementById('tts-text');
        var cc  = document.getElementById('tts-char-count');
        if (!ta || !cc) return;
        var n = ta.value.length;
        cc.textContent = n + ' / ' + MAX_CHARS;
        cc.style.color = n > MAX_CHARS * 0.9 ? '#e74c3c' : '';
        if (ta.value.length > MAX_CHARS) ta.value = ta.value.slice(0, MAX_CHARS);
    }

    /* ── Status / Error helpers ───────────────────────────────── */
    function setStatus(msg, spin) {
        var s = document.getElementById('tts-status');
        if (!s) return;
        s.textContent = msg;
        s.style.display = msg ? 'flex' : 'none';
        var icon = s.querySelector('.tts-spinner');
        if (icon) icon.style.display = spin ? 'inline-block' : 'none';
    }

    function setGenerating(on) {
        var btn = document.getElementById('tts-generate-btn');
        if (!btn) return;
        btn.disabled = on;
        btn.textContent = on ? 'Generating…' : 'Generate Speech';
    }

    function showError(msg) {
        var e = document.getElementById('tts-error');
        if (!e) return;
        e.textContent = msg;
        e.style.display = 'block';
    }

    function hideError() {
        var e = document.getElementById('tts-error');
        if (e) e.style.display = 'none';
    }

    function esc(s) {
        return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    /* ── Speed slider ─────────────────────────────────────────── */
    function initSpeedSlider() {
        var slider = document.getElementById('tts-speed');
        var label  = document.getElementById('tts-speed-label');
        if (!slider) return;
        function update() {
            if (label) label.textContent = parseFloat(slider.value).toFixed(1) + '×';
            /* Update live if audio is playing */
            var audio = document.getElementById('tts-audio');
            if (audio && audio.src && currentAudioBlob) {
                var voiceObj = VOICES.find(function(v) { return v.id === selectedVoice; });
                var baseRate = parseFloat((voiceObj && voiceObj.voiceSpeed) || 1.0);
                audio.playbackRate = Math.min(Math.max(baseRate * parseFloat(slider.value), 0.1), 4.0);
            }
        }
        slider.addEventListener('input', update);
        update();
    }

    /* ── Browser player controls ──────────────────────────────── */
    function initBrowserPlayer() {
        var playBtn  = document.getElementById('tts-bp-play');
        var pauseBtn = document.getElementById('tts-bp-pause');
        var stopBtn  = document.getElementById('tts-bp-stop');
        if (playBtn)  playBtn.addEventListener('click',  function() { if (browserModeText) speakWithBrowser(browserModeText, browserModeSpeed, browserModeVoice).catch(function(){}); });
        if (pauseBtn) pauseBtn.addEventListener('click', function() { if (window.speechSynthesis) window.speechSynthesis.pause(); });
        if (stopBtn)  stopBtn.addEventListener('click',  function() { if (window.speechSynthesis) window.speechSynthesis.cancel(); });
    }

    /* ── Gender filter ────────────────────────────────────────── */
    function initGenderFilter() {
        document.querySelectorAll('[data-gender-filter]').forEach(function(btn) {
            btn.addEventListener('click', function() {
                genderFilter = btn.dataset.genderFilter || '';
                document.querySelectorAll('[data-gender-filter]').forEach(function(b) { b.classList.remove('active'); });
                btn.classList.add('active');
                renderVoices();
            });
        });
    }

    /* ── Load ElevenLabs keys from Firebase admin settings ───────
       Called once Firebase is ready. Populates _elKeys so that
       generate() can use the key without any manual config.
    ── */
    function _loadELKeys() {
        /* Option 1: keys already loaded by admin-settings page into window */
        if (Array.isArray(window._AQS_EL_KEYS) && window._AQS_EL_KEYS.length) {
            _elKeys = window._AQS_EL_KEYS;
            _updateKeyNotice();
            return;
        }
        /* Option 2: load directly from Firebase via aqsAjax */
        if (typeof window.aqsAjax !== 'function') return;
        window.aqsAjax({ action: 'aqs_get_settings' }, function(res) {
            var s = (res && res.success && res.data && res.data.settings) || {};
            var keys = Array.isArray(s.elevenlabs_keys) ? s.elevenlabs_keys : [];
            _elKeys = keys.filter(function(k) { return k && k.length > 20; });
            window._AQS_EL_KEYS = _elKeys;
            _updateKeyNotice();
        });
    }

    function _updateKeyNotice() {
        var notice = document.getElementById('tts-api-notice');
        if (!notice) return;
        var hasKey = _elKeys.length > 0 || ELEVENLABS_API_KEY.length > 20;
        if (!hasKey) {
            notice.style.display = 'block';
            notice.innerHTML =
                '⚠️ <strong>No ElevenLabs key configured.</strong> ' +
                'AI voices are disabled — using browser built-in voice. ' +
                'Go to <a href="admin-settings.html" style="color:#fbbf24;font-weight:700;">Admin Settings</a> ' +
                '→ ElevenLabs section to add your free key.';
        } else {
            notice.style.display = 'none';
        }
    }

    /* ── Init ─────────────────────────────────────────────────── */
    function init() {
        var gen  = document.getElementById('tts-generate-btn');
        var dl   = document.getElementById('tts-download-btn');
        var ta   = document.getElementById('tts-text');
        var lf   = document.getElementById('tts-lang-filter');
        var clr  = document.getElementById('tts-clear-history-btn');

        if (gen) gen.addEventListener('click', generate);
        if (dl)  dl.addEventListener('click', download);
        if (ta)  ta.addEventListener('input', updateCharCount);
        if (lf)  lf.addEventListener('change', renderVoices);
        if (clr) clr.addEventListener('click', function() {
            try { localStorage.removeItem(HISTORY_KEY); } catch(e) {}
            renderHistory();
        });

        initSpeedSlider();
        initBrowserPlayer();
        initGenderFilter();
        renderVoices();
        renderHistory();
        updateCharCount();
        updateVoiceBadge(null);

        /* Load ElevenLabs keys from Firebase admin settings */
        if (window._aqsFirebaseReady) {
            _loadELKeys();
        } else {
            document.addEventListener('aqs:firebase:ready', _loadELKeys, { once: true });
            /* Show notice immediately while waiting; will hide once keys load */
            _updateKeyNotice();
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
