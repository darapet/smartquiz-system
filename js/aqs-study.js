/* ══════════════════════════════════════════════════════════════════════
   XZILY AI  —  Complete drop-in replacement
   Part 1 — Voice tutor (summon)
   Part 2 — Practice test
   ─────────────────────────────────────────────────────────────────────
   In your aqs-study.js, replace everything from the STORAGE KEYS
   constants down to the end of your openTest helpers with this.
══════════════════════════════════════════════════════════════════════ */


/* ══════════════════════════════════════════════════════════════════════
   PART 1 — VOICE TUTOR
══════════════════════════════════════════════════════════════════════ */

var SUMMON_STORAGE_KEY_NAME  = 'xzily_ai_name';
var SUMMON_STORAGE_KEY_VOICE = 'xzily_ai_voice_index';
var CHECKPOINT_PHRASE        = 'Does that make sense? Say yes to continue or no if you want me to explain again.';

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
    if (VS.voiceIndex >= 0 && voices[VS.voiceIndex]) { VS.voice = voices[VS.voiceIndex]; return; }
    var all = VS.synth ? VS.synth.getVoices() : [];
    var preferred = ['Google US English','Microsoft Guy Online (Natural) - English (United States)','Samantha','Google UK English Male','Daniel'];
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

/* ── PASSIVE VOICE DETECTOR ─────────────────────────────────────── */
var _pvd = {
    ctx: null, analyser: null, source: null, stream: null,
    raf: null, silenceTimer: null, active: false, paused: false,
    THRESHOLD: 18, VOICE_MS: 250
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
    if (_pvd.raf) { cancelAnimationFrame(_pvd.raf); _pvd.raf = null; }
    clearTimeout(_pvd.silenceTimer); _pvd.silenceTimer = null;
    if (_pvd.source) { try { _pvd.source.disconnect(); } catch(e) {} _pvd.source = null; }
    if (_pvd.ctx)    { try { _pvd.ctx.close(); }          catch(e) {} _pvd.ctx = null; }
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
    for (var i = 0; i < data.length; i++) { var diff = data[i] - 128; sum += diff * diff; }
    var rms = Math.sqrt(sum / data.length);
    if (rms > _pvd.THRESHOLD) {
        if (!_pvd.paused) {
            if (_pvdVoiceStart === 0) { _pvdVoiceStart = Date.now(); }
            else if (Date.now() - _pvdVoiceStart > _pvd.VOICE_MS) { _pvdPauseAI(); }
        } else {
            clearTimeout(_pvd.silenceTimer);
            _pvd.silenceTimer = setTimeout(_pvdResumeAI, 4000);
        }
    } else {
        _pvdVoiceStart = 0;
        if (_pvd.paused && !_pvd.silenceTimer) _pvd.silenceTimer = setTimeout(_pvdResumeAI, 4000);
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
    clearTimeout(_pvd.silenceTimer); _pvd.silenceTimer = null;
    _pvd.paused = false; _pvdVoiceStart = 0;
    var remaining = VS._pausedQueue || []; VS._pausedQueue = [];
    if (!remaining.length) { summonSetState('listening'); summonStartListening(); return; }
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

/* ── ROBUST SPEECH RECOGNITION ──────────────────────────────────── */
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
    rec.continuous = true; rec.interimResults = true;
    rec.lang = 'en-US'; rec.maxAlternatives = 1;
    VS.recognition = rec;

    rec.onstart = function() { _recRetryDelay = 300; _recLastEvent = Date.now(); _recStartWatchdog(); };

    rec.onresult = function(e) {
        _recLastEvent = Date.now();
        if (VS.speakingQueue || _pvd.paused) return;
        var interim = '', final = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
            var t = e.results[i][0].transcript;
            if (e.results[i].isFinal) final += t; else interim += t;
        }
        if (interim) { VS._interimSnapshot = interim; summonShowInterim(interim); summonResetSilence(); }
        if (final)   { VS.transcript += final; VS._interimSnapshot = ''; summonShowInterim(VS.transcript); summonResetSilence(); }
    };

    rec.onspeechend = function() { _recLastEvent = Date.now(); };

    rec.onend = function() {
        VS.listening = false; VS.recognition = null; _recStopWatchdog();
        if (_recDisabled || VS.speakingQueue || _pvd.paused || !VS.active) return;
        _recRetryTimer = setTimeout(_doStartRecognition, _recRetryDelay);
    };

    rec.onerror = function(e) {
        _recLastEvent = Date.now(); VS.listening = false; VS.recognition = null; _recStopWatchdog();
        var err = e.error || '';
        if (err === 'not-allowed' || err === 'service-not-allowed') { VS.active = false; return; }
        if (_recDisabled || VS.speakingQueue || _pvd.paused || !VS.active) return;
        _recRetryDelay = Math.min(_recRetryDelay * 2, 5000);
        _recRetryTimer = setTimeout(_doStartRecognition, _recRetryDelay);
    };

    try { rec.start(); } catch(e) {
        VS.listening = false; VS.recognition = null;
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
            VS.listening = false; _recStopWatchdog();
            _recRetryTimer = setTimeout(_doStartRecognition, 400);
        }
    }, 4000);
}

function _recStopWatchdog() {
    if (_recWatchdog) { clearInterval(_recWatchdog); _recWatchdog = null; }
}

function summonStopListening() {
    _recDisabled = true;
    clearTimeout(_recRetryTimer); clearTimeout(VS.silenceTimer); _recStopWatchdog();
    VS.listening = false;
    if (VS.recognition) { try { VS.recognition.abort(); } catch(e) {} VS.recognition = null; }
}

/* ── SILENCE TIMER ───────────────────────────────────────────────── */
function summonResetSilence() {
    clearTimeout(VS.silenceTimer);
    VS.silenceTimer = setTimeout(function() {
        var q = (VS.transcript || VS._interimSnapshot || '').trim();
        VS.transcript = ''; VS._interimSnapshot = '';
        summonShowInterim('');
        if (q && !VS._speechFired) summonHandleQuery(q);
    }, 1500);
}

function summonShowInterim(text) { summonSetTranscript(text); }

/* ── TEXT SEND ───────────────────────────────────────────────────── */
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

/* ── CHECKPOINT ──────────────────────────────────────────────────── */
function summonIsYes(q) { return /\b(yes|yeah|yep|yea|sure|ok|okay|correct|right|go on|continue|i get|i got|understood|alright)\b/i.test(q); }
function summonIsNo(q)  { return /\b(no|nope|nah|don'?t|not really|i don'?t|confused|again|repeat|explain|what|huh)\b/i.test(q); }

/* ── MAIN QUERY HANDLER ──────────────────────────────────────────── */
async function summonHandleQuery(q) {
    if (!VS._setupDone || VS._inSetup) {
        if (!VS._inSetup) summonStartSetup(); else summonHandleSetup(q);
        return;
    }
    if (/\b(change voice|switch voice|new voice|rename (you|yourself|ai)|change (your )?name)\b/i.test(q)) {
        summonStopListening(); summonStopQueue();
        VS._setupDone = false; summonStartSetup(); return;
    }
    if (VS.waitingCheckpnt) {
        VS.waitingCheckpnt = false;
        if (summonIsNo(q)) {
            summonSetTranscript(q);
            var reExp = 'Of course. Let me approach that from a different angle. ' + (VS.lastExplanation || '');
            summonSetAiText(reExp); return summonSpeakStream(reExp, true);
        } else if (summonIsYes(q)) {
            summonSetTranscript(q);
            var cont = 'Excellent. Let us continue. What would you like to explore next?';
            summonSetAiText(cont); return summonSpeakStream(cont, false);
        }
    }

    summonSetTranscript(q); summonSetAiText('...'); summonSetState('thinking');
    summonStopListening(); summonStopQueue();

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
        'For biology, history, literature, and other subjects: give a complete, structured explanation with concrete examples. ' +
        'Never truncate or rush an answer. A student deserves the full picture. ' +
        'Maintain a professional, warm, and patient tone throughout. ' +
        (addCheckpoint ? 'At the very end of your response add exactly: "' + CHECKPOINT_PHRASE + '"' : '');

    var messages = [{ role: 'system', content: sysPrompt }].concat(VS.history);

    try {
        var fullText = await summonStreamResponse(messages);
        VS.lastExplanation = fullText;
        var historyText = fullText.replace(CHECKPOINT_PHRASE, '').trim();
        VS.history.push({ role: 'assistant', content: historyText });
        if (VS.history.length > 14) VS.history = VS.history.slice(-14);
        if (addCheckpoint) VS.waitingCheckpnt = true;
    } catch(e) {
        summonSetAiText('There was a connection error. Please try again.');
        summonSetState('listening'); summonStartListening();
    }
}

/* ── STREAMING FETCH ─────────────────────────────────────────────── */
async function summonStreamResponse(messages) {
    var GROQ_STREAM_URL = 'https://api.groq.com/openai/v1/chat/completions';
    var key = (typeof window.getGroqKey === 'function') ? window.getGroqKey() : null;

    if (!key) {
        var text = await aiChat(messages, 0.7);
        summonSetAiText(text); summonSpeakStream(text, VS.waitingCheckpnt); return text;
    }

    var res = await fetch(GROQ_STREAM_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
        body: JSON.stringify({ model: GROQ_MODEL, messages: messages, temperature: 0.7, max_tokens: 1200, stream: true }),
        signal: AbortSignal.timeout(45000)
    });

    if (!res.ok) {
        var text2 = await aiChat(messages, 0.7);
        summonSetAiText(text2); summonSpeakStream(text2, VS.waitingCheckpnt); return text2;
    }

    var reader = res.body.getReader(), decoder = new TextDecoder();
    var full = '', sentenceBuf = '';
    summonSetState('speaking'); VS.speakingQueue = true; VS.sentenceQueue = [];
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
                    full += token; sentenceBuf += token;
                    summonSetAiText(full);
                    var sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                    while (sentenceEnd !== -1) {
                        var sentence = sentenceBuf.slice(0, sentenceEnd + 1).trim();
                        sentenceBuf = sentenceBuf.slice(sentenceEnd + 1);
                        if (sentence) summonQueueSentence(sentence);
                        sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                    }
                } catch(ex) {}
            }
        }
    }

    if (sentenceBuf.trim()) summonQueueSentence(sentenceBuf.trim());
    summonFlushQueue(function() {
        VS.speakingQueue = false; _pvd.paused = false; VS._pausedQueue = [];
        summonSetState('listening'); summonStartListening();
    });
    return full;
}

/* ── SENTENCE QUEUE ──────────────────────────────────────────────── */
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
        if (VS.speakingQueue && !_pvd.paused) summonRunQueue(); else VS._queueRunning = false;
    });
}

function summonFlushQueue(onAllDone) {
    var check = setInterval(function() {
        if (!VS._queueRunning && (!VS.sentenceQueue || !VS.sentenceQueue.length) && !_pvd.paused) {
            clearInterval(check); if (onAllDone) onAllDone();
        }
    }, 150);
}

function summonStopQueue() {
    VS.speakingQueue = false; VS._queueRunning = false;
    VS.sentenceQueue = []; VS._pausedQueue = []; VS.speaking = false;
    _pvd.paused = false; clearTimeout(_pvd.silenceTimer); _pvd.silenceTimer = null;
    if (VS.synth) { try { VS.synth.cancel(); } catch(e) {} }
}

function summonSpeakOne(text, onDone) {
    if (!VS.synth || !text) { if (onDone) onDone(); return; }
    summonPickVoice(); VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    if (VS.voice) u.voice = VS.voice;
    u.onend  = function() { VS.speaking = false; if (onDone) onDone(); };
    u.onerror = function() { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

function summonSpeakStream(text, isCheckpoint) {
    var sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    VS.speakingQueue = true;
    VS.sentenceQueue = sentences.map(function(s) { return s.trim(); }).filter(Boolean);
    summonStartPassiveDetect(); summonRunQueue();
    summonFlushQueue(function() {
        VS.speakingQueue = false;
        if (isCheckpoint) VS.waitingCheckpnt = true;
        summonSetState('listening'); summonStartListening();
    });
}

function summonSpeak(text, onDone) {
    if (!VS.synth) { if (onDone) onDone(); return; }
    try { VS.synth.cancel(); } catch(e) {}
    summonPickVoice(); summonSetState('speaking'); VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    if (VS.voice) u.voice = VS.voice;
    u.onend = u.onerror = function() { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

function summonAddMsg(role, text) {
    if (role === 'user') summonSetTranscript(text); else summonSetAiText(text);
}


/* ══════════════════════════════════════════════════════════════════════
   PART 2 — PRACTICE TEST
══════════════════════════════════════════════════════════════════════ */

async function openTest() {
    if (S.activeIdx < 0) {
        if (S.chapters && S.chapters.length > 0) { selectChapter(0); }
        else { showErr('Search a topic first, then open a chapter before taking a test.'); return; }
    }
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }

    var ch      = S.chapters[S.activeIdx];
    var content = (S.cache && S.cache[S.activeIdx]) ? S.cache[S.activeIdx] : '';
    var modal   = document.getElementById('std-test-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    modal.innerHTML = _testLoadingHTML('Generating your practice test\u2026');

    var topicLabel = (ch && ch.title) ? ch.title : (S.title || 'this topic');
    var context = (content && content.length > 50)
        ? content.slice(0, 2000)
        : 'Topic: ' + topicLabel + '. Generate general knowledge questions about this subject.';

    var questions = await _generateQuestions(topicLabel, context);

    if (!questions || !questions.length) {
        modal.innerHTML = _testErrorHTML('Could not generate questions. Please check your internet connection and try again.');
        return;
    }
    _renderTest(modal, topicLabel, questions);
}

async function _generateQuestions(topic, context) {
    var prompt =
        'You are a quiz generator. Based on the following content about "' + topic + '", ' +
        'generate exactly 10 multiple-choice questions. ' +
        'Each question must have 4 options labeled A, B, C, D, with exactly one correct answer. ' +
        'IMPORTANT: Your entire response must be ONLY a valid JSON array. ' +
        'Do not include any explanation, markdown, or code fences. ' +
        'Do not write ```json or ``` anywhere. Just output the raw JSON array and nothing else. ' +
        'Use this exact format:\n' +
        '[{"q":"Question text?","options":["A. option","B. option","C. option","D. option"],"answer":"A"},...]\n\n' +
        'Content:\n' + context;

    var messages = [
        { role: 'system', content: 'You output only raw valid JSON arrays. No markdown, no prose, no code fences. Raw JSON only.' },
        { role: 'user',   content: prompt }
    ];
    var raw = '';
    try {
        raw = await aiChat(messages, 0.4);
        return _parseQuestions(raw);
    } catch(e) {
        try {
            var retryMessages = [
                { role: 'system', content: 'Output ONLY a JSON array. Nothing else before or after.' },
                { role: 'user',   content: 'Generate 10 multiple-choice questions about "' + topic + '". Return ONLY this JSON:\n[{"q":"...","options":["A. ...","B. ...","C. ...","D. ..."],"answer":"A"},...]' }
            ];
            raw = await aiChat(retryMessages, 0.3);
            return _parseQuestions(raw);
        } catch(e2) { return null; }
    }
}

function _parseQuestions(raw) {
    if (!raw || typeof raw !== 'string') throw new Error('Empty response');
    var cleaned = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    try { return _validateQuestions(JSON.parse(cleaned)); } catch(e) {}
    var match = cleaned.match(/\[[\s\S]*\]/);
    if (match) { try { return _validateQuestions(JSON.parse(match[0])); } catch(e) {} }
    var objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) { try { return _validateQuestions(JSON.parse('[' + objMatch[0] + ']')); } catch(e) {} }
    throw new Error('Could not parse AI response as JSON');
}

function _validateQuestions(data) {
    if (!Array.isArray(data)) throw new Error('Not an array');
    var valid = data.filter(function(q) {
        return q && typeof q.q === 'string' && Array.isArray(q.options) && q.options.length >= 2;
    });
    if (!valid.length) throw new Error('No valid questions');
    return valid.slice(0, 10);
}

function _renderTest(modal, topic, questions) {
    var answers = new Array(questions.length).fill(null);
    modal.innerHTML =
        '<div class="std-test-box">' +
            '<div class="std-test-head">' +
                '<div class="std-test-title">\uD83C\uDFAF Practice Test \u2014 ' + _esc(topic) + '</div>' +
                '<button class="std-test-close" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">&#x2715;</button>' +
            '</div>' +
            '<div class="std-test-body" id="std-test-body">' +
                _questionsHTML(questions) +
                '<button class="std-test-submit" id="std-test-submit-btn">Submit Test</button>' +
            '</div>' +
        '</div>';
    _injectTestStyles();
    modal.querySelectorAll('.std-tq-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
            var qi = parseInt(this.getAttribute('data-qi'), 10);
            answers[qi] = this.getAttribute('data-letter');
            modal.querySelectorAll('.std-tq-option[data-qi="' + qi + '"]').forEach(function(b) { b.classList.remove('selected'); });
            this.classList.add('selected');
        });
    });
    document.getElementById('std-test-submit-btn').addEventListener('click', function() { _showResults(modal, questions, answers); });
}

function _questionsHTML(questions) {
    return questions.map(function(q, qi) {
        var opts = q.options.map(function(opt, oi) {
            var letter = String.fromCharCode(65 + oi);
            return '<button class="std-tq-option" data-qi="' + qi + '" data-letter="' + letter + '">' + _esc(opt) + '</button>';
        }).join('');
        return '<div class="std-tq-item"><div class="std-tq-num">Q' + (qi+1) + '</div><div class="std-tq-text">' + _esc(q.q) + '</div><div class="std-tq-opts">' + opts + '</div></div>';
    }).join('');
}

function _showResults(modal, questions, answers) {
    var score = 0;
    var details = questions.map(function(q, qi) {
        var userAns = answers[qi];
        var correct = (q.answer || '').toUpperCase().charAt(0);
        var isRight = userAns && userAns.toUpperCase() === correct;
        if (isRight) score++;
        var correctText = q.options[correct.charCodeAt(0) - 65] || correct;
        var userText    = userAns ? (q.options[userAns.charCodeAt(0) - 65] || userAns) : '';
        var cls = !userAns ? 'skipped' : (isRight ? 'correct' : 'wrong');
        var icon = !userAns ? '\u2014' : (isRight ? '\u2713' : '\u2717');
        return '<div class="std-tr-item ' + cls + '"><div class="std-tr-status">' + icon + '</div><div class="std-tr-content"><div class="std-tr-q">' + _esc(q.q) + '</div>' +
            (!userAns
                ? '<div class="std-tr-ans skipped">Not answered &nbsp;&middot;&nbsp; Correct: ' + _esc(correctText) + '</div>'
                : isRight
                    ? '<div class="std-tr-ans correct">Correct: ' + _esc(correctText) + '</div>'
                    : '<div class="std-tr-ans wrong">Your answer: ' + _esc(userText) + ' &nbsp;&middot;&nbsp; Correct: ' + _esc(correctText) + '</div>'
            ) + '</div></div>';
    }).join('');
    var pct    = Math.round((score / questions.length) * 100);
    var grade  = pct >= 80 ? '\uD83C\uDFC6 Excellent!' : pct >= 60 ? '\uD83D\uDC4D Good effort!' : pct >= 40 ? '\uD83D\uDCDA Keep studying!' : '\uD83D\uDCAA More practice needed.';
    var colour = pct >= 80 ? '#10b981' : pct >= 60 ? '#f59e0b' : '#ef4444';
    document.getElementById('std-test-body').innerHTML =
        '<div class="std-tr-score" style="color:' + colour + '">' + score + ' / ' + questions.length + '<span class="std-tr-pct"> (' + pct + '%)</span></div>' +
        '<div class="std-tr-grade">' + grade + '</div>' +
        '<div class="std-tr-list">' + details + '</div>' +
        '<div class="std-tr-actions"><button class="std-test-submit" onclick="openTest()">Try Again</button>' +
        '<button class="std-test-submit secondary" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">Close</button></div>';
}

function _testLoadingHTML(msg) {
    return '<div class="std-test-box std-test-loading"><div class="std-spinner"></div><p>' + _esc(msg) + '</p></div>';
}

function _testErrorHTML(msg) {
    return '<div class="std-test-box std-test-loading"><div style="font-size:2rem">\u26A0</div><p style="color:#ef4444">' + _esc(msg) + '</p>' +
        '<button class="std-test-submit" onclick="openTest()">Retry</button>' +
        '<button class="std-test-submit secondary" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">Close</button></div>';
}

function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function _injectTestStyles() {
    if (document.getElementById('std-test-styles')) return;
    var s = document.createElement('style');
    s.id  = 'std-test-styles';
    s.textContent = [
        '#std-test-modal{position:fixed;inset:0;z-index:9000;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(4px)}',
        '.std-test-box{background:#0e0c20;border:1px solid #342d62;border-radius:16px;width:100%;max-width:680px;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}',
        '.std-test-head{display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #252048;flex-shrink:0}',
        '.std-test-title{font-size:.95rem;font-weight:800;color:#eeeaff}',
        '.std-test-close{background:none;border:none;color:#8c84b8;font-size:1.2rem;cursor:pointer;padding:4px 8px;border-radius:6px}',
        '.std-test-close:hover{color:#ef4444}',
        '.std-test-body{overflow-y:auto;padding:18px 20px;flex:1}',
        '.std-test-body::-webkit-scrollbar{width:4px}',
        '.std-test-body::-webkit-scrollbar-thumb{background:#342d62;border-radius:2px}',
        '.std-tq-item{margin-bottom:20px;padding:14px;background:#141128;border:1px solid #252048;border-radius:12px}',
        '.std-tq-num{font-size:.68rem;font-weight:700;color:#8b5cf6;text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}',
        '.std-tq-text{font-size:.9rem;font-weight:600;color:#eeeaff;margin-bottom:10px;line-height:1.5}',
        '.std-tq-opts{display:flex;flex-direction:column;gap:6px}',
        '.std-tq-option{background:#1c1837;border:1.5px solid #252048;border-radius:8px;color:#c8c2f0;font-size:.84rem;padding:9px 13px;text-align:left;cursor:pointer;transition:all .15s;font-family:inherit}',
        '.std-tq-option:hover{border-color:#7c3aed;background:#251e45;color:#eeeaff}',
        '.std-tq-option.selected{border-color:#8b5cf6;background:rgba(139,92,246,.18);color:#c4b5fd;font-weight:600}',
        '.std-test-submit{display:block;width:100%;padding:12px;background:#7c3aed;border:none;border-radius:10px;color:#fff;font-size:.9rem;font-weight:700;cursor:pointer;margin-top:8px;font-family:inherit;transition:background .15s}',
        '.std-test-submit:hover{background:#6d28d9}',
        '.std-test-submit.secondary{background:transparent;border:1.5px solid #342d62;color:#c8c2f0;margin-top:6px}',
        '.std-test-submit.secondary:hover{background:#1c1837}',
        '.std-tr-score{font-size:2.4rem;font-weight:900;text-align:center;margin-bottom:4px}',
        '.std-tr-pct{font-size:1.2rem;font-weight:600}',
        '.std-tr-grade{text-align:center;font-size:1rem;font-weight:700;color:#c8c2f0;margin-bottom:18px}',
        '.std-tr-list{display:flex;flex-direction:column;gap:8px;margin-bottom:16px}',
        '.std-tr-item{display:flex;gap:10px;padding:10px 13px;border-radius:10px;border:1px solid transparent}',
        '.std-tr-item.correct{background:rgba(16,185,129,.08);border-color:rgba(16,185,129,.25)}',
        '.std-tr-item.wrong{background:rgba(239,68,68,.08);border-color:rgba(239,68,68,.25)}',
        '.std-tr-item.skipped{background:rgba(140,132,184,.06);border-color:#252048}',
        '.std-tr-status{font-size:1rem;flex-shrink:0;width:20px;padding-top:2px}',
        '.std-tr-item.correct .std-tr-status{color:#10b981}',
        '.std-tr-item.wrong .std-tr-status{color:#ef4444}',
        '.std-tr-item.skipped .std-tr-status{color:#8c84b8}',
        '.std-tr-content{flex:1;min-width:0}',
        '.std-tr-q{font-size:.84rem;font-weight:600;color:#eeeaff;margin-bottom:3px;line-height:1.4}',
        '.std-tr-ans{font-size:.78rem}',
        '.std-tr-ans.correct{color:#34d399}',
        '.std-tr-ans.wrong{color:#f87171}',
        '.std-tr-ans.skipped{color:#8c84b8}',
        '.std-tr-actions{display:flex;flex-direction:column;gap:6px}',
        '.std-test-loading{align-items:center;justify-content:center;gap:14px;min-height:200px;padding:40px}',
        '.std-test-loading p{color:#c8c2f0;font-size:.9rem;font-weight:600;margin:0;text-align:center}',
        '.std-spinner{width:38px;height:38px;border:3px solid rgba(139,92,246,.2);border-top-color:#8b5cf6;border-radius:50%;animation:std-spin .8s linear infinite;flex-shrink:0}',
        '@keyframes std-spin{to{transform:rotate(360deg)}}',
    ].join('');
    document.head.appendChild(s);
}
