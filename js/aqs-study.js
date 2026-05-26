/* ── XZILY AI — v3 (pause/resume + robust mic + full explanations) ── */

/* ═══════════════════════════════════════════════════════════════════
   STORAGE KEYS
═══════════════════════════════════════════════════════════════════ */
var SUMMON_STORAGE_KEY_NAME  = 'xzily_ai_name';
var SUMMON_STORAGE_KEY_VOICE = 'xzily_ai_voice_index';
var CHECKPOINT_PHRASE        = 'Does that make sense? Say yes to continue or no if you want me to explain again.';

/* ═══════════════════════════════════════════════════════════════════
   SETTINGS  (load / save / voices)
═══════════════════════════════════════════════════════════════════ */
function summonLoadSettings() {
    VS.aiName     = localStorage.getItem(SUMMON_STORAGE_KEY_NAME)  || null;
    VS.voiceIndex = parseInt(localStorage.getItem(SUMMON_STORAGE_KEY_VOICE) || '-1', 10);
    VS.voice      = null;
    VS._setupDone = !!(VS.aiName && VS.voiceIndex >= 0);
}

function summonSaveSettings() {
    if (VS.aiName)          localStorage.setItem(SUMMON_STORAGE_KEY_NAME,  VS.aiName);
    if (VS.voiceIndex >= 0) localStorage.setItem(SUMMON_STORAGE_KEY_VOICE, String(VS.voiceIndex));
}

function summonGetEnglishVoices() {
    var voices = VS.synth ? VS.synth.getVoices() : [];
    return voices.filter(function(v) { return v.lang && v.lang.startsWith('en'); }).slice(0, 10);
}

function summonPickVoice() {
    var voices = summonGetEnglishVoices();
    if (VS.voiceIndex >= 0 && voices[VS.voiceIndex]) {
        VS.voice = voices[VS.voiceIndex];
        return;
    }
    var all = VS.synth ? VS.synth.getVoices() : [];
    var preferred = [
        'Google US English',
        'Microsoft Guy Online (Natural) - English (United States)',
        'Samantha',
        'Google UK English Male',
        'Daniel'
    ];
    for (var i = 0; i < preferred.length; i++) {
        var found = all.find(function(v) { return v.name === preferred[i]; });
        if (found) { VS.voice = found; return; }
    }
    var en = all.find(function(v) { return v.lang && v.lang.startsWith('en'); });
    if (en) VS.voice = en;
}

function initSummonVoices() {
    if (!VS.synth) return;
    VS.synth.getVoices();
    if (VS.synth.onvoiceschanged !== undefined) VS.synth.onvoiceschanged = summonPickVoice;
    summonLoadSettings();
    summonPickVoice();
}

/* ═══════════════════════════════════════════════════════════════════
   FIRST-RUN SETUP  (voice picker + AI naming)
═══════════════════════════════════════════════════════════════════ */
function summonStartSetup() {
    VS._inSetup   = true;
    VS._setupStep = 1;
    VS._setupDone = false;
    var voices = summonGetEnglishVoices();
    if (!voices.length) { setTimeout(summonStartSetup, 800); return; }

    var list  = voices.map(function(v, i) { return (i + 1) + ', ' + v.name; }).join('. ');
    var intro = 'Hello! Before we begin let me personalise your experience. ' +
                'I have ' + voices.length + ' voice options available. ' + list + '. ' +
                'Please say the number of the voice you would like me to use.';
    summonSetAiText(intro);
    summonSpeak(intro, function() { summonSetState('listening'); summonStartListening(); });
}

function summonHandleSetup(q) {
    var voices = summonGetEnglishVoices();
    if (VS._setupStep === 1) {
        var num = parseInt(q.replace(/[^0-9]/g, ''), 10);
        if (!num || num < 1 || num > voices.length) {
            var retry = 'I did not catch a valid number. Please say a number between 1 and ' + voices.length + '.';
            summonSetAiText(retry);
            return summonSpeak(retry, function() { summonSetState('listening'); summonStartListening(); });
        }
        VS.voiceIndex = num - 1;
        VS.voice      = voices[VS.voiceIndex];
        VS._setupStep = 2;
        var nameQ = 'Great choice! Now, what would you like to name me? You can call me anything you like.';
        summonSetAiText(nameQ);
        return summonSpeak(nameQ, function() { summonSetState('listening'); summonStartListening(); });
    }
    if (VS._setupStep === 2) {
        var name = q.trim().replace(/[^a-zA-Z0-9\s\-_']/g, '').trim();
        if (!name) {
            var retryName = 'I did not catch a name. Please say what you would like to call me.';
            summonSetAiText(retryName);
            return summonSpeak(retryName, function() { summonSetState('listening'); summonStartListening(); });
        }
        VS.aiName     = name.replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        summonSaveSettings();
        VS._inSetup   = false;
        VS._setupDone = true;
        var done = 'Perfect. From now on my name is ' + VS.aiName + '. I am ready to help you learn. What would you like to explore today?';
        summonSetAiText(done);
        return summonSpeak(done, function() { summonSetState('listening'); summonStartListening(); });
    }
}

/* ═══════════════════════════════════════════════════════════════════
   PASSIVE VOICE DETECTOR
   Uses AudioContext + AnalyserNode — no speech recognition involved.
   Runs only while the AI is speaking (speakingQueue = true).
   When your voice is detected:
     - AI speech pauses immediately (remaining sentences saved)
     - 4-second silence timer starts
     - If still quiet after 4 s, AI resumes from exactly where it stopped
═══════════════════════════════════════════════════════════════════ */
var _pvd = {
    ctx:          null,
    analyser:     null,
    source:       null,
    stream:       null,
    raf:          null,
    silenceTimer: null,
    active:       false,
    paused:       false,
    THRESHOLD:    18,
    VOICE_MS:     250
};
var _pvdVoiceStart = 0;

function summonStartPassiveDetect() {
    if (_pvd.active) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function(stream) {
            _pvd.stream   = stream;
            _pvd.ctx      = new (window.AudioContext || window.webkitAudioContext)();
            _pvd.analyser = _pvd.ctx.createAnalyser();
            _pvd.analyser.fftSize = 256;
            _pvd.source   = _pvd.ctx.createMediaStreamSource(stream);
            _pvd.source.connect(_pvd.analyser);
            _pvd.active   = true;
            _pvdVoiceStart = 0;
            _pvdLoop();
        })
        .catch(function() {});
}

function summonStopPassiveDetect() {
    _pvd.active = false;
    if (_pvd.raf)   { cancelAnimationFrame(_pvd.raf); _pvd.raf = null; }
    clearTimeout(_pvd.silenceTimer);
    _pvd.silenceTimer = null;
    if (_pvd.source) { try { _pvd.source.disconnect(); }  catch(e) {} _pvd.source = null; }
    if (_pvd.ctx)    { try { _pvd.ctx.close(); }           catch(e) {} _pvd.ctx = null; }
    if (_pvd.stream) { _pvd.stream.getTracks().forEach(function(t) { t.stop(); }); _pvd.stream = null; }
    _pvd.paused = false;
}

function _pvdLoop() {
    if (!_pvd.active) return;
    _pvd.raf = requestAnimationFrame(_pvdLoop);

    if (!VS.speakingQueue) {
        _pvdVoiceStart = 0;
        if (_pvd.paused) { _pvd.paused = false; clearTimeout(_pvd.silenceTimer); }
        return;
    }

    var data = new Uint8Array(_pvd.analyser.frequencyBinCount);
    _pvd.analyser.getByteTimeDomainData(data);

    var sum = 0;
    for (var i = 0; i < data.length; i++) {
        var diff = data[i] - 128;
        sum += diff * diff;
    }
    var rms = Math.sqrt(sum / data.length);

    if (rms > _pvd.THRESHOLD) {
        if (!_pvd.paused) {
            if (_pvdVoiceStart === 0) {
                _pvdVoiceStart = Date.now();
            } else if (Date.now() - _pvdVoiceStart > _pvd.VOICE_MS) {
                _pvdPauseAI();
            }
        } else {
            clearTimeout(_pvd.silenceTimer);
            _pvd.silenceTimer = setTimeout(_pvdResumeAI, 4000);
        }
    } else {
        _pvdVoiceStart = 0;
        if (_pvd.paused && !_pvd.silenceTimer) {
            _pvd.silenceTimer = setTimeout(_pvdResumeAI, 4000);
        }
    }
}

function _pvdPauseAI() {
    if (_pvd.paused) return;
    _pvd.paused      = true;
    _pvdVoiceStart   = 0;

    VS._pausedQueue  = (VS.sentenceQueue || []).slice();
    VS.speakingQueue = false;
    VS._queueRunning = false;
    VS.sentenceQueue = [];
    if (VS.synth) { try { VS.synth.pause(); } catch(e) { try { VS.synth.cancel(); } catch(e2) {} } }

    summonSetState('listening');
    clearTimeout(_pvd.silenceTimer);
    _pvd.silenceTimer = setTimeout(_pvdResumeAI, 4000);
}

function _pvdResumeAI() {
    clearTimeout(_pvd.silenceTimer);
    _pvd.silenceTimer = null;
    _pvd.paused       = false;
    _pvdVoiceStart    = 0;

    var remaining = VS._pausedQueue || [];
    VS._pausedQueue = [];

    if (!remaining.length) {
        summonSetState('listening');
        summonStartListening();
        return;
    }

    summonSetState('speaking');
    VS.speakingQueue = true;
    VS.sentenceQueue = remaining;
    if (VS.synth) { try { VS.synth.resume(); } catch(e) {} }

    summonRunQueue();
    summonFlushQueue(function() {
        VS.speakingQueue = false;
        summonSetState('listening');
        summonStartListening();
    });
}

/* ═══════════════════════════════════════════════════════════════════
   ROBUST SPEECH RECOGNITION
   - Every error type handled — no more silent death
   - Backoff timer prevents rapid restart loop (the pop sound)
   - Watchdog restarts recognition if it goes dead for 12 seconds
   - Never starts while AI is speaking or paused
═══════════════════════════════════════════════════════════════════ */
var _recRetryDelay = 300;
var _recRetryTimer = null;
var _recWatchdog   = null;
var _recLastEvent  = 0;
var _recDisabled   = false;

function summonStartListening() {
    if (VS.speakingQueue || _pvd.paused) return;
    if (VS.listening) return;
    if (!VS.active) return;
    clearTimeout(_recRetryTimer);
    _recDisabled = false;
    _doStartRecognition();
}

function _doStartRecognition() {
    if (_recDisabled || VS.speakingQueue || _pvd.paused) return;
    if (VS.listening) return;

    var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    VS.listening  = true;
    VS.transcript = '';
    _recLastEvent = Date.now();

    var rec = new SpeechRecognition();
    rec.continuous      = true;
    rec.interimResults  = true;
    rec.lang            = 'en-US';
    rec.maxAlternatives = 1;
    VS.recognition      = rec;

    rec.onstart = function() {
        _recRetryDelay = 300;
        _recLastEvent  = Date.now();
        _recStartWatchdog();
    };

    rec.onresult = function(e) {
        _recLastEvent = Date.now();
        if (VS.speakingQueue || _pvd.paused) return;

        var interim = '', final = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
            var t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t;
            else interim += t;
        }
        if (interim) {
            VS._interimSnapshot = interim;
            summonShowInterim(interim);
            summonResetSilence();
        }
        if (final) {
            VS.transcript += final;
            VS._interimSnapshot = '';
            summonShowInterim(VS.transcript);
            summonResetSilence();
        }
    };

    rec.onspeechend = function() {
        _recLastEvent = Date.now();
    };

    rec.onend = function() {
        VS.listening   = false;
        VS.recognition = null;
        _recStopWatchdog();
        if (_recDisabled || VS.speakingQueue || _pvd.paused || !VS.active) return;
        _recRetryTimer = setTimeout(_doStartRecognition, _recRetryDelay);
    };

    rec.onerror = function(e) {
        _recLastEvent  = Date.now();
        VS.listening   = false;
        VS.recognition = null;
        _recStopWatchdog();

        var err = e.error || '';
        if (err === 'not-allowed' || err === 'service-not-allowed') {
            VS.active = false;
            return;
        }
        if (_recDisabled || VS.speakingQueue || _pvd.paused || !VS.active) return;
        _recRetryDelay = Math.min(_recRetryDelay * 2, 5000);
        _recRetryTimer = setTimeout(_doStartRecognition, _recRetryDelay);
    };

    try {
        rec.start();
    } catch(e) {
        VS.listening   = false;
        VS.recognition = null;
        _recRetryDelay = Math.min(_recRetryDelay * 2, 5000);
        _recRetryTimer = setTimeout(_doStartRecognition, _recRetryDelay);
    }
}

function _recStartWatchdog() {
    _recStopWatchdog();
    _recWatchdog = setInterval(function() {
        if (!VS.listening || VS.speakingQueue || _pvd.paused) { _recStopWatchdog(); return; }
        if (Date.now() - _recLastEvent > 12000) {
            if (VS.recognition) { try { VS.recognition.abort(); } catch(e) {} VS.recognition = null; }
            VS.listening = false;
            _recStopWatchdog();
            _recRetryTimer = setTimeout(_doStartRecognition, 400);
        }
    }, 4000);
}

function _recStopWatchdog() {
    if (_recWatchdog) { clearInterval(_recWatchdog); _recWatchdog = null; }
}

function summonStopListening() {
    _recDisabled = true;
    clearTimeout(_recRetryTimer);
    clearTimeout(VS.silenceTimer);
    _recStopWatchdog();
    VS.listening = false;
    if (VS.recognition) {
        try { VS.recognition.abort(); } catch(e) {}
        VS.recognition = null;
    }
}

/* ═══════════════════════════════════════════════════════════════════
   SILENCE TIMER
═══════════════════════════════════════════════════════════════════ */
function summonResetSilence() {
    clearTimeout(VS.silenceTimer);
    VS.silenceTimer = setTimeout(function() {
        var q = (VS.transcript || VS._interimSnapshot || '').trim();
        VS.transcript       = '';
        VS._interimSnapshot = '';
        summonShowInterim('');
        if (q && !VS._speechFired) summonHandleQuery(q);
    }, 1500);
}

function summonShowInterim(text) { summonSetTranscript(text); }

/* ═══════════════════════════════════════════════════════════════════
   TEXT SEND (typed input)
═══════════════════════════════════════════════════════════════════ */
function summonSendText() {
    var inp = document.getElementById('std-summon-text');
    var q   = (inp ? inp.value : '').trim();
    if (!q) return;
    if (inp) inp.value = '';
    if (!VS.active) {
        VS.active = true;
        var root = document.getElementById('std-summon-root');
        if (root) root.classList.add('open');
    }
    summonHandleQuery(q);
}

/* ═══════════════════════════════════════════════════════════════════
   CHECKPOINT
═══════════════════════════════════════════════════════════════════ */
function summonIsYes(q) { return /\b(yes|yeah|yep|yea|sure|ok|okay|correct|right|go on|continue|i get|i got|understood|alright)\b/i.test(q); }
function summonIsNo(q)  { return /\b(no|nope|nah|don'?t|not really|i don'?t|confused|again|repeat|explain|what|huh)\b/i.test(q); }

/* ═══════════════════════════════════════════════════════════════════
   MAIN QUERY HANDLER
═══════════════════════════════════════════════════════════════════ */
async function summonHandleQuery(q) {

    if (!VS._setupDone || VS._inSetup) {
        if (!VS._inSetup) summonStartSetup();
        else summonHandleSetup(q);
        return;
    }

    if (/\b(change voice|switch voice|new voice|rename (you|yourself|ai)|change (your )?name)\b/i.test(q)) {
        summonStopListening();
        summonStopQueue();
        VS._setupDone = false;
        summonStartSetup();
        return;
    }

    if (VS.waitingCheckpnt) {
        VS.waitingCheckpnt = false;
        if (summonIsNo(q)) {
            summonSetTranscript(q);
            var reExp = 'Of course. Let me approach that from a different angle. ' + (VS.lastExplanation || '');
            summonSetAiText(reExp);
            return summonSpeakStream(reExp, true);
        } else if (summonIsYes(q)) {
            summonSetTranscript(q);
            var cont = 'Excellent. Let us continue. What would you like to explore next?';
            summonSetAiText(cont);
            return summonSpeakStream(cont, false);
        }
    }

    summonSetTranscript(q);
    summonSetAiText('...');
    summonSetState('thinking');
    summonStopListening();
    summonStopQueue();

    var context = '';
    if (typeof S !== 'undefined') {
        if (S.title) context += 'The student is currently studying: "' + S.title + '". ';
        if (S.chapters && S.chapters[S.activeIdx]) context += 'Active chapter: "' + S.chapters[S.activeIdx].title + '". ';
        if (S.activeIdx >= 0 && S.cache && S.cache[S.activeIdx]) context += 'Relevant excerpt: ' + S.cache[S.activeIdx].slice(0, 600) + ' ';
    }

    VS.history.push({ role: 'user', content: q });
    if (VS.history.length > 14) VS.history = VS.history.slice(-14);

    VS.responseCount = (VS.responseCount || 0) + 1;
    var addCheckpoint = (VS.responseCount % 3 === 0);
    var aiDisplayName = VS.aiName || 'XZILY AI';

    var sysPrompt =
        'You are ' + aiDisplayName + ', a professional and thorough voice-based academic tutor. ' +
        context +
        'Your responses must always be clear, natural spoken sentences. ' +
        'Never use markdown, bullet points, asterisks, symbols, or any abbreviation that cannot be pronounced aloud. ' +
        'For mathematics, physics, and chemistry questions: always work through the complete solution step by step. ' +
        'Begin every calculation by stating the relevant formula or principle in full spoken words before applying it. ' +
        'Speak every number, unit, and operation in full words — say "nine point eight metres per second squared" not "9.8 m/s squared", ' +
        'say "force equals mass times acceleration" not "F equals m a", ' +
        'say "the square root of sixteen is four" not "sqrt 16 equals 4", ' +
        'say "x squared plus two x minus three equals zero" not "x^2 + 2x - 3 = 0". ' +
        'After each calculation step, briefly explain in plain language why that step was taken. ' +
        'For biology, history, literature, and all other subjects: give a complete structured explanation with concrete examples. ' +
        'Never truncate or rush an answer. A student deserves the full picture. ' +
        'Maintain a professional, warm, and patient tone throughout. ' +
        (addCheckpoint
            ? 'At the very end of your response add exactly: "' + CHECKPOINT_PHRASE + '"'
            : '');

    var messages = [{ role: 'system', content: sysPrompt }].concat(VS.history);

    try {
        var fullText = await summonStreamResponse(messages);
        VS.lastExplanation = fullText;

        /* Strip checkpoint phrase before saving — stops the AI echoing it unprompted */
        var historyText = fullText.replace(CHECKPOINT_PHRASE, '').trim();
        VS.history.push({ role: 'assistant', content: historyText });
        if (VS.history.length > 14) VS.history = VS.history.slice(-14);

        if (addCheckpoint) VS.waitingCheckpnt = true;
    } catch(e) {
        summonSetAiText('There was a connection error. Please try again.');
        summonSetState('listening');
        summonStartListening();
    }
}

/* ═══════════════════════════════════════════════════════════════════
   STREAMING FETCH
═══════════════════════════════════════════════════════════════════ */
async function summonStreamResponse(messages) {
    var GROQ_STREAM_URL = 'https://api.groq.com/openai/v1/chat/completions';
    var key = (typeof window.getGroqKey === 'function') ? window.getGroqKey() : null;

    if (!key) {
        var text = await aiChat(messages, 0.7);
        summonSetAiText(text);
        summonSpeakStream(text, VS.waitingCheckpnt);
        return text;
    }

    var res = await fetch(GROQ_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({
            model:       GROQ_MODEL,
            messages:    messages,
            temperature: 0.7,
            max_tokens:  1200,
            stream:      true
        }),
        signal: AbortSignal.timeout(45000)
    });

    if (!res.ok) {
        var text2 = await aiChat(messages, 0.7);
        summonSetAiText(text2);
        summonSpeakStream(text2, VS.waitingCheckpnt);
        return text2;
    }

    var reader      = res.body.getReader();
    var decoder     = new TextDecoder();
    var full        = '';
    var sentenceBuf = '';
    summonSetState('speaking');
    VS.speakingQueue = true;
    VS.sentenceQueue = [];

    summonStartPassiveDetect();

    while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        var lines = decoder.decode(chunk.value, { stream: true }).split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
                try {
                    var delta = JSON.parse(line.slice(6));
                    var token = (delta.choices[0].delta.content) || '';
                    full        += token;
                    sentenceBuf += token;
                    summonSetAiText(full);

                    var sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                    while (sentenceEnd !== -1) {
                        var sentence = sentenceBuf.slice(0, sentenceEnd + 1).trim();
                        sentenceBuf  = sentenceBuf.slice(sentenceEnd + 1);
                        if (sentence) summonQueueSentence(sentence);
                        sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                    }
                } catch(ex) {}
            }
        }
    }

    if (sentenceBuf.trim()) summonQueueSentence(sentenceBuf.trim());
    summonFlushQueue(function() {
        VS.speakingQueue = false;
        _pvd.paused      = false;
        VS._pausedQueue  = [];
        summonSetState('listening');
        summonStartListening();
    });

    return full;
}

/* ═══════════════════════════════════════════════════════════════════
   SENTENCE QUEUE
═══════════════════════════════════════════════════════════════════ */
function summonQueueSentence(text) {
    VS.sentenceQueue = VS.sentenceQueue || [];
    VS.sentenceQueue.push(text);
    if (!VS._queueRunning) summonRunQueue();
}

function summonRunQueue() {
    if (!VS.sentenceQueue || !VS.sentenceQueue.length) { VS._queueRunning = false; return; }
    if (_pvd.paused) { VS._queueRunning = false; return; }

    VS._queueRunning = true;
    var sentence = VS.sentenceQueue.shift();
    summonSpeakOne(sentence, function() {
        if (VS.speakingQueue && !_pvd.paused) summonRunQueue();
        else VS._queueRunning = false;
    });
}

function summonFlushQueue(onAllDone) {
    var check = setInterval(function() {
        if (!VS._queueRunning && (!VS.sentenceQueue || !VS.sentenceQueue.length) && !_pvd.paused) {
            clearInterval(check);
            if (onAllDone) onAllDone();
        }
    }, 150);
}

function summonStopQueue() {
    VS.speakingQueue  = false;
    VS._queueRunning  = false;
    VS.sentenceQueue  = [];
    VS._pausedQueue   = [];
    VS.speaking       = false;
    _pvd.paused       = false;
    clearTimeout(_pvd.silenceTimer);
    _pvd.silenceTimer = null;
    if (VS.synth) { try { VS.synth.cancel(); } catch(e) {} }
}

/* ═══════════════════════════════════════════════════════════════════
   SPEAK ONE SENTENCE
═══════════════════════════════════════════════════════════════════ */
function summonSpeakOne(text, onDone) {
    if (!VS.synth || !text) { if (onDone) onDone(); return; }
    summonPickVoice();
    VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    if (VS.voice) u.voice = VS.voice;
    u.onend  = function() { VS.speaking = false; if (onDone) onDone(); };
    u.onerror = function() { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

/* ═══════════════════════════════════════════════════════════════════
   SPEAK FULL TEXT (non-streaming fallback)
═══════════════════════════════════════════════════════════════════ */
function summonSpeakStream(text, isCheckpoint) {
    var sentences    = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    VS.speakingQueue = true;
    VS.sentenceQueue = sentences.map(function(s) { return s.trim(); }).filter(Boolean);
    summonStartPassiveDetect();
    summonRunQueue();
    summonFlushQueue(function() {
        VS.speakingQueue = false;
        if (isCheckpoint) VS.waitingCheckpnt = true;
        summonSetState('listening');
        summonStartListening();
    });
}

/* ═══════════════════════════════════════════════════════════════════
   WELCOME / SETUP GREETING  (one-shot, not queued)
═══════════════════════════════════════════════════════════════════ */
function summonSpeak(text, onDone) {
    if (!VS.synth) { if (onDone) onDone(); return; }
    try { VS.synth.cancel(); } catch(e) {}
    summonPickVoice();
    summonSetState('speaking');
    VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    if (VS.voice) u.voice = VS.voice;
    u.onend = u.onerror = function() { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

function summonAddMsg(role, text) {
    if (role === 'user') summonSetTranscript(text);
    else summonSetAiText(text);
}
