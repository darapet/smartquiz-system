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
    var Perm = capPlugin('SpeechRecognition');
    var p = Promise.resolve();
    if (Perm && typeof Perm.requestPermissions === 'function') {
      p = Perm.requestPermissions().catch(function () {});
    }
    return p.then(function () {
      /* Use the shared request so mic prompts never overlap (median-bridge.js) */
      if (typeof window.AQSRequestMicrophone === 'function') {
        return window.AQSRequestMicrophone();
      }
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

  if (!hasNativeSR) {
    try {
      Object.defineProperty(window, 'SpeechRecognition', { value: ShimRecognition, writable: true, configurable: true });
      Object.defineProperty(window, 'webkitSpeechRecognition', { value: ShimRecognition, writable: true, configurable: true });
    } catch (e) {
      window.SpeechRecognition = ShimRecognition;
      window.webkitSpeechRecognition = ShimRecognition;
    }
    log('record-and-transcribe microphone enabled (no native speech engine)');
  }

  /* ── speaking fallback (online voices) ─────────────────────────────────── */
  var VOICE_MAP = {
    male: 'onyx', female: 'nova', default: 'nova',
    alloy: 'alloy', echo: 'echo', fable: 'fable', onyx: 'onyx', nova: 'nova', shimmer: 'shimmer'
  };
  var currentAudio = null;

  function speakOnline(text, opts) {
    opts = opts || {};
    var voice = VOICE_MAP[(opts.voice || '').toLowerCase()] || VOICE_MAP.default;
    var url = 'https://audio.pollinations.ai/' + encodeURIComponent(String(text).slice(0, 900)) +
              '?model=openai-audio&voice=' + encodeURIComponent(voice);
    stopSpeaking();
    var a = new Audio(url);
    a.playbackRate = Math.max(0.5, Math.min(2, opts.rate || 1));
    currentAudio = a;
    if (opts.onend) a.onended = opts.onend;
    if (opts.onerror) a.onerror = opts.onerror;
    var pr = a.play();
    if (pr && pr.catch) pr.catch(function (e) { if (opts.onerror) opts.onerror(e); });
    return a;
  }

  function stopSpeaking() {
    try { if (currentAudio) { currentAudio.pause(); currentAudio.src = ''; currentAudio = null; } } catch (e) {}
    try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
  }

  /* Route speechSynthesis.speak to the online voice when the device has none. */
  try {
    var synth = window.speechSynthesis;
    if (synth && typeof synth.speak === 'function') {
      var origSpeak = synth.speak.bind(synth);
      synth.speak = function (utt) {
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
    usingShim: !hasNativeSR,
    ensureMic: function () { return ensureMic().then(function (s) { try { s.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} return true; }); },
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

  log('ready — mic:', hasNativeSR ? 'native' : 'record+transcribe');
})();
