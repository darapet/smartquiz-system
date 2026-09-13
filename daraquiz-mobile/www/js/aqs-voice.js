/**
 * aqs-voice.js — Universal voice layer for DaraEdu / SmartQuiz
 * ─────────────────────────────────────────────────────────────────────────────
 * Load AFTER js/aqs-capacitor-speech.js and js/aqs-groq-key.js, BEFORE any
 * feature script (aqs-ai-teacher.js, aqs-study.js, aqs-studio.js,
 * aqs-quiz-studio.js, aqs-challenge.js).
 *
 * What it does — no per-page code changes required:
 *
 *  1. MICROPHONE: installs a drop-in window.SpeechRecognition /
 *     webkitSpeechRecognition shim whenever the real one is missing or has
 *     been disabled (Android WebView / Capacitor / iOS). The shim records with
 *     MediaRecorder and transcribes with Groq whisper-large-v3-turbo, then
 *     fires the same onresult / onend / onerror events. Every "this browser
 *     does not support speech recognition — use Chrome or Edge" branch
 *     therefore never runs again.
 *
 *  2. SPEAKING: if the device has no usable speechSynthesis voices (typical
 *     inside a WebView), speechSynthesis.speak() is transparently routed to
 *     the online voice service already used by Study Hub
 *     (audio.pollinations.ai), so the AI can always be heard.
 *
 *  3. PERMISSIONS: AQSVoice.ensureMic() asks for the microphone (native
 *     Capacitor permission first, then the web prompt) with a clear message.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';
  if (window.AQSVoice) return;

  var NativeSR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  var hasNativeSR = typeof NativeSR === 'function';
  var androidVoice = window.AqsNativeVoice || null;
  var hasAndroidRecognition = !!(androidVoice && typeof androidVoice.startListening === 'function');
  var nativeRecognition = null;
  var nativeSpeechCallbacks = {};

  window.addEventListener('aqs-native-voice', function (event) {
    var detail = (event && event.detail) || {};
    if (/^speech-/.test(detail.type || '')) {
      var cb = nativeSpeechCallbacks[detail.value];
      if (cb) {
        if (detail.type === 'speech-start' && cb.onstart) cb.onstart({});
        if (detail.type === 'speech-end' && cb.onend) cb.onend({});
        if (detail.type === 'speech-error' && cb.onerror) cb.onerror({ error: 'native-tts-error' });
        if (detail.type === 'speech-end' || detail.type === 'speech-error') delete nativeSpeechCallbacks[detail.value];
      }
      return;
    }
    if (nativeRecognition) nativeRecognition._handleNativeEvent(detail.type, detail.value);
  });

  /* ── helpers ───────────────────────────────────────────────────────────── */
  function log() { try { console.log.apply(console, ['[AQSVoice]'].concat([].slice.call(arguments))); } catch (e) {} }

  function capPlugin(name) {
    try {
      var C = window.Capacitor;
      if (C && C.Plugins && C.Plugins[name]) return C.Plugins[name];
    } catch (e) {}
    return null;
  }

  function groqKey() {
    try {
      if (typeof window.getFeatureGroqKey === 'function') {
        var k = window.getFeatureGroqKey('studyhub');
        if (k) return k;
      }
    } catch (e) {}
    try { if (typeof window.getGroqKey === 'function') return window.getGroqKey() || ''; } catch (e) {}
    return '';
  }

  /* ── microphone permission ─────────────────────────────────────────────── */
  function ensureMic() {
    if (hasAndroidRecognition) return Promise.resolve(true);
    var Perm = capPlugin('SpeechRecognition');
    var p = Promise.resolve();
    if (Perm && typeof Perm.requestPermissions === 'function') {
      p = Perm.requestPermissions().catch(function () {});
    }
    return p.then(function () {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone is not available on this device.');
      }
      return navigator.mediaDevices.getUserMedia({ audio: true });
    });
  }

  /* ── transcription (Groq whisper) ──────────────────────────────────────── */
  function transcribe(blob, mime) {
    var key = groqKey();
    if (!key) return Promise.reject(new Error('No AI key configured yet — please try again in a moment.'));
    var ext = mime.indexOf('mp4') > -1 ? 'mp4' : mime.indexOf('ogg') > -1 ? 'ogg' : 'webm';
    var fd = new FormData();
    fd.append('file', blob, 'voice.' + ext);
    fd.append('model', 'whisper-large-v3-turbo');
    fd.append('response_format', 'json');
    return fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + key },
      body: fd
    }).then(function (r) {
      if (!r.ok) return r.text().then(function (t) { throw new Error('Transcription failed (' + r.status + ') ' + t.slice(0, 120)); });
      return r.json();
    }).then(function (d) { return ((d && d.text) || '').trim(); });
  }

  /* ── recorder with silence detection ───────────────────────────────────── */
  function Recorder(opts) {
    this.opts = opts || {};
    this.stream = null; this.rec = null; this.chunks = [];
    this.ctx = null; this.timer = null; this.stopped = false;
  }
  Recorder.prototype.start = function () {
    var self = this;
    return ensureMic().then(function (stream) {
      self.stream = stream;
      var mime = '';
      var cands = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'];
      for (var i = 0; i < cands.length; i++) {
        try { if (window.MediaRecorder && MediaRecorder.isTypeSupported(cands[i])) { mime = cands[i]; break; } } catch (e) {}
      }
      self.rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      self.mime = (self.rec.mimeType || mime || 'audio/webm').split(';')[0];
      self.rec.ondataavailable = function (e) { if (e.data && e.data.size) self.chunks.push(e.data); };
      self.rec.onstop = function () { self._finish(); };
      self.rec.start();
      self._watchSilence();
      return true;
    });
  };

  /* ── Android native speech recognition bridge ─────────────────────────── */
  function NativeRecognition() {
    this.lang = 'en-US'; this.continuous = false; this.interimResults = false;
    this.maxAlternatives = 1; this.onstart = null; this.onresult = null;
    this.onerror = null; this.onend = null; this.onspeechend = null;
    this._running = false; this._aborted = false;
  }
  NativeRecognition.prototype._result = function (text, isFinal) {
    var alt = { transcript: text || '', confidence: isFinal ? 0.9 : 0.5 };
    var res = [alt]; res.isFinal = isFinal; res.length = 1;
    var list = [res]; list.length = 1;
    if (this.onresult) this.onresult({ results: list, resultIndex: 0, isTrusted: true });
  };
  NativeRecognition.prototype._handleNativeEvent = function (type, value) {
    if (this._aborted) return;
    if (type === 'start') { if (this.onstart) this.onstart({}); return; }
    if (type === 'partial') { if (this.interimResults) this._result(value, false); return; }
    if (type === 'result') { this._got = true; this._result(value, true); return; }
    if (type === 'speech-ended') { if (this.onspeechend) this.onspeechend({}); return; }
    if (type === 'error') {
      var err = value || 'audio-capture';
      /* Android's recogniser reports "no-speech" / service errors very eagerly
         (no Google voice data, offline, engine busy...). Instead of showing the
         user a mic error, record the audio ourselves and transcribe it. */
      if (err !== 'not-allowed' && !this._fellBack) { this._pendingErr = err; this._fellBack = true; return; }
      if (this.onerror) this.onerror({ error: err, message: err });
      return;
    }
    if (type === 'end') {
      if (this._fellBack && !this._got) { this._startShimFallback(); return; }
      this._finishRun();
    }
  };
  NativeRecognition.prototype._finishRun = function () {
    this._running = false;
    if (this.onend) this.onend({});
    if (nativeRecognition === this) nativeRecognition = null;
    if (this.continuous && !this._aborted) {
      var self = this; setTimeout(function () { self.start(); }, 250);
    }
  };
  /* Record with the microphone and transcribe with Groq when the Android
     speech service fails — keeps voice input working on every device. */
  NativeRecognition.prototype._startShimFallback = function () {
    var self = this;
    var shim = new ShimRecognition();
    this._shim = shim;
    shim.lang = this.lang;
    shim.interimResults = this.interimResults;
    shim.continuous = false;
    shim.onresult = function (e) { self._got = true; if (self.onresult) self.onresult(e); };
    shim.onerror = function (e) { self._shimErr = e; };
    shim.onend = function () {
      self._shim = null;
      if (!self._got && self.onerror) {
        self.onerror(self._shimErr || { error: self._pendingErr || 'no-speech', message: self._pendingErr || '' });
      }
      self._finishRun();
    };
    try { shim.start(); }
    catch (e) {
      this._shim = null;
      if (this.onerror) this.onerror({ error: this._pendingErr || 'audio-capture', message: e && e.message });
      this._finishRun();
    }
  };
  NativeRecognition.prototype.start = function () {
    if (this._running) return;
    if (nativeRecognition && nativeRecognition !== this) nativeRecognition.abort();
    this._running = true; this._aborted = false; nativeRecognition = this;
    this._got = false; this._fellBack = false; this._pendingErr = null; this._shimErr = null;
    try { androidVoice.startListening(this.lang || 'en-US'); }
    catch (err) {
      this._running = false; nativeRecognition = null;
      if (this.onerror) this.onerror({ error: 'audio-capture', message: err && err.message });
      if (this.onend) this.onend({});
    }
  };
  NativeRecognition.prototype.stop = function () {
    this.continuous = false;
    if (this._shim) { try { this._shim.stop(); } catch (e) {} return; }
    try { androidVoice.stopListening(); } catch (e) {}
  };
  NativeRecognition.prototype.abort = function () {
    this._aborted = true; this.continuous = false; this._running = false;
    if (this._shim) { try { this._shim.abort(); } catch (e) {} this._shim = null; }
    try { androidVoice.stopListening(); } catch (e) {}
    if (nativeRecognition === this) nativeRecognition = null;
  };
  NativeRecognition.prototype.addEventListener = function (type, fn) { this['on' + type] = fn; };
  NativeRecognition.prototype.removeEventListener = function (type) { this['on' + type] = null; };
  Recorder.prototype._watchSilence = function () {
    var self = this;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      self.ctx = ctx;
      var src = ctx.createMediaStreamSource(self.stream);
      var an = ctx.createAnalyser();
      an.fftSize = 1024;
      src.connect(an);
      var buf = new Uint8Array(an.fftSize);
      var lastLoud = Date.now();
      var spoke = false;
      var maxMs = self.opts.maxMs || 30000;
      var startedAt = Date.now();
      self.timer = setInterval(function () {
        an.getByteTimeDomainData(buf);
        var peak = 0;
        for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i] - 128); if (v > peak) peak = v; }
        if (peak > 6) { lastLoud = Date.now(); spoke = true; }
        var quietFor = Date.now() - lastLoud;
        if ((spoke && quietFor > (self.opts.silenceMs || 1400)) ||
            (!spoke && Date.now() - startedAt > 8000) ||
            (Date.now() - startedAt > maxMs)) {
          self.stop();
        }
      }, 150);
    } catch (e) { log('silence watch failed', e); }
  };
  Recorder.prototype.stop = function () {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    try { if (this.rec && this.rec.state !== 'inactive') this.rec.stop(); else this._finish(); } catch (e) { this._finish(); }
  };
  Recorder.prototype._cleanup = function () {
    try { if (this.stream) this.stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {}
    try { if (this.ctx) this.ctx.close(); } catch (e) {}
  };
  Recorder.prototype._finish = function () {
    if (this._done) return; this._done = true;
    this._cleanup();
    var self = this;
    var blob = new Blob(this.chunks, { type: this.mime || 'audio/webm' });
    this.chunks = [];
    if (blob.size < 2048) { if (this.opts.onerror) this.opts.onerror(new Error('no-speech')); if (this.opts.onend) this.opts.onend(); return; }
    transcribe(blob, this.mime || 'audio/webm').then(function (text) {
      if (text && self.opts.onfinal) self.opts.onfinal(text);
      else if (!text && self.opts.onerror) self.opts.onerror(new Error('no-speech'));
      if (self.opts.onend) self.opts.onend();
    }).catch(function (err) {
      if (self.opts.onerror) self.opts.onerror(err);
      if (self.opts.onend) self.opts.onend();
    });
  };

  /* ── SpeechRecognition shim (drop-in) ──────────────────────────────────── */
  function ShimRecognition() {
    this.lang = 'en-US';
    this.continuous = false;
    this.interimResults = false;
    this.maxAlternatives = 1;
    this.onstart = null; this.onresult = null; this.onerror = null;
    this.onend = null; this.onspeechend = null; this.onaudiostart = null;
    this._rec = null; this._running = false; this._abort = false;
  }
  ShimRecognition.prototype._emitResult = function (text) {
    var alt = { transcript: text, confidence: 0.9 };
    var res = [alt]; res.isFinal = true; res.length = 1; res[0] = alt;
    var list = [res]; list.length = 1; list[0] = res;
    var ev = { results: list, resultIndex: 0, isTrusted: true };
    if (this.onresult) { try { this.onresult(ev); } catch (e) { log(e); } }
  };
  ShimRecognition.prototype.start = function () {
    if (this._running) return;
    this._running = true; this._abort = false;
    var self = this;
    if (this.onstart) { try { this.onstart({}); } catch (e) {} }
    if (this.onaudiostart) { try { this.onaudiostart({}); } catch (e) {} }
    this._rec = new Recorder({
      silenceMs: 1400,
      onfinal: function (text) { if (!self._abort) self._emitResult(text); },
      onerror: function (err) {
        if (self._abort) return;
        if (self.onerror) { try { self.onerror({ error: (err && err.message === 'no-speech') ? 'no-speech' : 'audio-capture', message: err && err.message }); } catch (e) {} }
      },
      onend: function () {
        self._running = false;
        if (self.onspeechend) { try { self.onspeechend({}); } catch (e) {} }
        if (self.onend) { try { self.onend({}); } catch (e) {} }
        if (self.continuous && !self._abort) { setTimeout(function () { try { self.start(); } catch (e) {} }, 250); }
      }
    });
    this._rec.start().catch(function (err) {
      self._running = false;
      if (self.onerror) { try { self.onerror({ error: 'not-allowed', message: err && err.message }); } catch (e) {} }
      if (self.onend) { try { self.onend({}); } catch (e) {} }
    });
  };
  ShimRecognition.prototype.stop = function () {
    this.continuous = false;
    if (this._rec) this._rec.stop();
  };
  ShimRecognition.prototype.abort = function () {
    this._abort = true; this.continuous = false;
    if (this._rec) this._rec.stop();
    this._running = false;
  };
  ShimRecognition.prototype.addEventListener = function (type, fn) { this['on' + type] = fn; };
  ShimRecognition.prototype.removeEventListener = function (type) { this['on' + type] = null; };

  if (hasAndroidRecognition || !hasNativeSR) {
    var RecognitionImpl = hasAndroidRecognition ? NativeRecognition : ShimRecognition;
    try {
      Object.defineProperty(window, 'SpeechRecognition', { value: RecognitionImpl, writable: true, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: RecognitionImpl, writable: true, configurable: true });
    } catch (e) {
      window.SpeechRecognition = RecognitionImpl;
      window.webkitSpeechRecognition = RecognitionImpl;
    }
    log(hasAndroidRecognition ? 'Android native microphone enabled' : 'record-and-transcribe microphone enabled');
  }

  /* ── speaking fallback (online voices) ─────────────────────────────────── */
  var VOICE_MAP = {
    male: 'onyx', female: 'nova', default: 'nova',
    alloy: 'alloy', echo: 'echo', fable: 'fable', onyx: 'onyx', nova: 'nova', shimmer: 'shimmer'
  };
  var currentAudio = null;

  function nativeTtsUsable() {
    if (!androidVoice || typeof androidVoice.speak !== 'function') return false;
    try {
      if (typeof androidVoice.isTtsReady === 'function') return !!androidVoice.isTtsReady();
    } catch (e) {}
    return true;
  }

  /* Play a WAV/MP3 ArrayBuffer through the speaker. */
  function playBuffer(buf, opts) {
    opts = opts || {};
    var blob = new Blob([buf], { type: opts.mime || 'audio/wav' });
    stopSpeaking();

    /* Android WebView can resolve HTMLMediaElement.play() while emitting no
       sound for blob URLs. Use the unlocked AudioContext player first. */
    if (typeof window.aqsPlayAudioBlob === 'function') {
      var playback = {
        pause: function () {
          try { if (window.aqsStopCurrentAudio) window.aqsStopCurrentAudio(); } catch (e) {}
          if (currentAudio === playback) currentAudio = null;
        },
        play: function () {}
      };
      currentAudio = playback;
      if (opts.onstart) { try { opts.onstart(); } catch (e) {} }
      window.aqsPlayAudioBlob(blob, function () {
        if (currentAudio !== playback) return;
        currentAudio = null;
        if (opts.onend) opts.onend();
      }, function (err) {
        if (currentAudio !== playback) return;
        currentAudio = null;
        if (opts.onerror) opts.onerror(err);
      });
      return playback;
    }

    try {
      var url = URL.createObjectURL(blob);
      var a = new Audio(url);
      a.setAttribute('playsinline', '');
      a.playbackRate = Math.max(0.5, Math.min(2, opts.rate || 1));
      currentAudio = a;
      a.onended = function () { try { URL.revokeObjectURL(url); } catch (e) {} if (opts.onend) opts.onend(); };
      a.onerror = function (e) { if (opts.onerror) opts.onerror(e); };
      if (opts.onstart) { try { opts.onstart(); } catch (e) {} }
      var pr = a.play();
      if (pr && pr.catch) pr.catch(function (e) { if (opts.onerror) opts.onerror(e); });
      return a;
    } catch (e) {
      if (opts.onerror) opts.onerror(e);
      return null;
    }
  }

  /* Cloud voices: Gemini TTS first (real neural voice), then Pollinations. */
  function speakRemote(text, opts) {
    opts = opts || {};
    try {
      if (window.geminiTTS && typeof window.geminiTTS.synth === 'function' &&
          window.geminiTTS.hasKeys && window.geminiTTS.hasKeys()) {
        var gv = /male|onyx|echo|man|david|daniel|puck/i.test(opts.voice || '') ? 'Puck' : 'Kore';
        window.geminiTTS.synth(String(text).slice(0, 4000), gv, '')
          .then(function (buf) { playBuffer(buf, opts); })
          .catch(function (e) { log('Gemini voice failed, using online fallback', e && e.message); speakPollinations(text, opts); });
        return { pause: function () { stopSpeaking(); }, play: function () {} };
      }
    } catch (e) {}
    return speakPollinations(text, opts);
  }

  function speakOnline(text, opts) {
    opts = opts || {};
    if (nativeTtsUsable()) {
      stopSpeaking();
      var id = 'aqs-' + Date.now() + '-' + Math.random().toString(36).slice(2);
      var state = { started: false, done: false, fellBack: false };
      nativeSpeechCallbacks[id] = {
        onstart: function () { state.started = true; if (opts.onstart) opts.onstart(); },
        onend: function () { state.done = true; if (opts.onend) opts.onend(); },
        onerror: function () {
          if (state.done || state.fellBack) return;
          state.fellBack = true;
          speakRemote(text, opts);
        }
      };
      try {
        androidVoice.speak(String(text), Math.max(0.5, Math.min(2, opts.rate || 1)),
          /male|onyx|echo/i.test(opts.voice || '') ? 0.9 : 1.08, id);
        /* If the device engine produces nothing (missing voice data), switch
           to a cloud voice so the user always hears the answer. */
        setTimeout(function () {
          if (state.started || state.done || state.fellBack) return;
          state.fellBack = true;
          delete nativeSpeechCallbacks[id];
          try { androidVoice.stopSpeaking(); } catch (e) {}
          log('native TTS silent — switching to cloud voice');
          speakRemote(text, opts);
        }, 2500);
        return { pause: function () { stopSpeaking(); }, play: function () {} };
      } catch (err) {
        delete nativeSpeechCallbacks[id];
        log('native speaking failed, using online fallback', err);
      }
    }
    return speakRemote(text, opts);
  }

  function speakPollinations(text, opts) {
    opts = opts || {};
    var voice = VOICE_MAP[(opts.voice || '').toLowerCase()] || VOICE_MAP.default;
    var url = 'https://audio.pollinations.ai/' + encodeURIComponent(String(text).slice(0, 900)) +
              '?model=openai-audio&voice=' + encodeURIComponent(voice);
    stopSpeaking();

    /* Fetch remote audio and decode it through AudioContext on Android. This
       avoids the WebView blob/HTMLMediaElement path that can be silent even
       when play() resolves successfully. */
    if (typeof window.aqsPlayAudioBlob === 'function') {
      var playback = {
        pause: function () {
          try { if (window.aqsStopCurrentAudio) window.aqsStopCurrentAudio(); } catch (e) {}
          if (currentAudio === playback) currentAudio = null;
        },
        play: function () {}
      };
      currentAudio = playback;
      if (opts.onstart) { try { opts.onstart(); } catch (e) {} }
      fetch(url)
        .then(function (r) {
          if (!r.ok) throw new Error('TTS audio request failed (' + r.status + ')');
          return r.blob();
        })
        .then(function (blob) {
          if (currentAudio !== playback) return;
          window.aqsPlayAudioBlob(blob, function () {
            if (currentAudio !== playback) return;
            currentAudio = null;
            if (opts.onend) opts.onend();
          }, function (err) {
            if (currentAudio !== playback) return;
            currentAudio = null;
            if (opts.onerror) opts.onerror(err);
          });
        })
        .catch(function (err) {
          if (currentAudio !== playback) return;
          currentAudio = null;
          if (opts.onerror) opts.onerror(err);
        });
      return playback;
    }

    var a = new Audio(url);
    a.setAttribute('playsinline', '');
    a.playbackRate = Math.max(0.5, Math.min(2, opts.rate || 1));
    currentAudio = a;
    if (opts.onend) a.onended = opts.onend;
    if (opts.onerror) a.onerror = opts.onerror;
    if (opts.onstart) { try { opts.onstart(); } catch (e) {} }
    var pr = a.play();
    if (pr && pr.catch) pr.catch(function (e) { if (opts.onerror) opts.onerror(e); });
    return a;
  }

  function stopSpeaking() {
    try { if (androidVoice && typeof androidVoice.stopSpeaking === 'function') androidVoice.stopSpeaking(); } catch (e) {}
    try { if (window.aqsStopCurrentAudio) window.aqsStopCurrentAudio(); } catch (e) {}
    nativeSpeechCallbacks = {};
    try { if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; } } catch (e) {}
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }

  /* Route speechSynthesis.speak to the online voice when the device has none. */
  try {
    var synth = window.speechSynthesis;
    if (synth && typeof synth.speak === 'function') {
      var origSpeak = synth.speak.bind(synth);
      synth.speak = function (utt) {
        if (androidVoice && typeof androidVoice.speak === 'function') {
          var nativeName = (utt && utt.voice && utt.voice.name) || '';
          return speakOnline((utt && utt.text) || '', {
            voice: nativeName,
            rate: (utt && utt.rate) || 1,
            onstart: function () { if (utt && utt.onstart) try { utt.onstart({}); } catch (e) {} },
            onend: function () { if (utt && utt.onend) try { utt.onend({}); } catch (e) {} },
            onerror: function () { if (utt && utt.onerror) try { utt.onerror({ error: 'native-tts-error' }); } catch (e) {} }
          });
        }
        var voices = [];
        try { voices = synth.getVoices() || []; } catch (e) {}
        if (voices.length) return origSpeak(utt);
        var name = (utt && utt.voice && utt.voice.name) || '';
        var gender = /female|woman|zira|samantha|nova|karen/i.test(name) ? 'female'
                   : /male|man|david|daniel|onyx/i.test(name) ? 'male' : 'default';
        speakOnline((utt && utt.text) || '', {
          voice: gender,
          rate: (utt && utt.rate) || 1,
          onend: function () { if (utt && utt.onend) try { utt.onend({}); } catch (e) {} },
          onerror: function () { try { origSpeak(utt); } catch (e) {} }
        });
      };
    }
  } catch (e) { log('speak wrapper failed', e); }

  /* ── audio unlock on first gesture ─────────────────────────────────────── */
  (function () {
    var unlocked = false;
    function unlock() {
      if (unlocked) return; unlocked = true;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) { var c = window._aqsAudioCtx || new AC(); window._aqsAudioCtx = c; if (c.resume) c.resume(); }
      } catch (e) {}
      document.removeEventListener('touchstart', unlock, true);
      document.removeEventListener('click', unlock, true);
    }
    document.addEventListener('touchstart', unlock, true);
    document.addEventListener('click', unlock, true);
  })();

  /* ── public API ────────────────────────────────────────────────────────── */
  window.AQSVoice = {
    supported: true,
    usingShim: hasAndroidRecognition || !hasNativeSR,
    usingAndroidNative: hasAndroidRecognition,
    ensureMic: function () { return ensureMic().then(function (s) { try { if (s && s.getTracks) s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return true; }); },
    transcribe: transcribe,
    speak: speakOnline,
    stop: stopSpeaking,
    listen: function (opts) {
      opts = opts || {};
      var r = new (window.SpeechRecognition || ShimRecognition)();
      r.lang = opts.lang || 'en-US';
      r.continuous = !!opts.continuous;
      r.interimResults = !!opts.interim;
      r.onresult = function (e) {
        var t = '';
        try { t = e.results[e.results.length - 1][0].transcript; } catch (err) {}
        if (t && opts.onfinal) opts.onfinal(t.trim());
      };
      r.onerror = function (e) { if (opts.onerror) opts.onerror(e); };
      r.onend = function () { if (opts.onend) opts.onend(); };
      r.start();
      return r;
    }
  };

  log('ready — mic:', hasAndroidRecognition ? 'Android native' : hasNativeSR ? 'browser native' : 'record+transcribe');
})();
