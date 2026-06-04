/**
 * aqs-capacitor-speech.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CAPACITOR SPEECH & AUDIO FIX — include BEFORE aqs-studio.js / aqs-study.js
 *
 * ROOT CAUSES FIXED:
 *
 *  A. SpeechRecognition crashes the app on Android WebView — nullified.
 *
 *  B. speechSynthesis produces NO SOUND on Android Capacitor.
 *     Android WebView silently blocks speechSynthesis.speak() unless it was
 *     first called inside a user-gesture handler. This file pre-unlocks it
 *     on the first touch/click so every subsequent call works.
 *
 *  C. new Audio() / fetch audio also needs an AudioContext unlock on Android
 *     to route to the speaker (not silently fail).
 *
 *  D. speechSynthesis.speak() silently does nothing when voices haven't
 *     loaded yet — wrapped to retry after voiceschanged fires.
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── 1. Detect Capacitor ────────────────────────────────────────────────── */
  var isCapacitor = !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );
  if (!isCapacitor && typeof navigator !== 'undefined') {
    isCapacitor = /Capacitor/i.test(navigator.userAgent);
  }

  /* Also apply to any mobile WebView even without Capacitor flag */
  var isMobileWebView = /Android|iPhone|iPad/i.test(navigator.userAgent || '');

  if (!isCapacitor && !isMobileWebView) {
    /* Normal desktop browser — nothing to fix */
    return;
  }

  /* ── 2. Nullify broken SpeechRecognition APIs ───────────────────────────── */
  /*
   * webkitSpeechRecognition exists in Android WebView but calling .start()
   * triggers a native crash that bypasses JS try/catch entirely.
   */
  try {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: null, writable: true, configurable: true
    });
  } catch (e) { window.SpeechRecognition = null; }

  try {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: null, writable: true, configurable: true
    });
  } catch (e) { window.webkitSpeechRecognition = null; }

  /* ── 3. Pre-unlock AudioContext + speechSynthesis on first user touch ────── */
  /*
   * Android WebView requires that BOTH AudioContext.resume() AND
   * speechSynthesis.speak() are first called inside a user-gesture handler.
   * After that single unlock, all subsequent calls (from async AI responses)
   * produce audio normally through the phone speaker.
   */
  var _audioUnlocked = false;
  var _synthUnlocked = false;

  function _unlockAudio() {
    if (_audioUnlocked) return;
    _audioUnlocked = true;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        /* Save context globally so TTS can reuse it after async responses */
        var ctx = window._aqsAudioCtx || new AC();
        window._aqsAudioCtx = ctx;
        /* Create and immediately discard a zero-length silent buffer */
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        ctx.resume();
      }
    } catch (e) {}

    /* Also play a truly silent Audio element so future Audio() calls work */
    try {
      /* 44-byte WAV: 1 sample of silence */
      var sil = new Audio(
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      );
      sil.setAttribute('playsinline', '');
      sil.setAttribute('webkit-playsinline', '');
      sil.volume = 0.001;
      sil.play().catch(function () {});
    } catch (e) {}
  }

  function _unlockSynth() {
    if (_synthUnlocked) return;
    if (!window.speechSynthesis) return;
    _synthUnlocked = true;

    /* Trigger voices load */
    window.speechSynthesis.getVoices();

    /* Speak a zero-length silent utterance to unlock the audio pipeline */
    try {
      var u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      u.rate   = 10; /* very fast — effectively instant */
      window._aqsOrigSpeak ? window._aqsOrigSpeak(u) : window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function _onFirstGesture() {
    _unlockAudio();
    _unlockSynth();
  }

  /* Listen on both touch and click to catch the first user interaction */
  document.addEventListener('touchstart', _onFirstGesture, { once: true, passive: true });
  document.addEventListener('click',      _onFirstGesture, { once: true });

  /* Also try immediately (may already be inside a gesture if this script
     loaded during a user-initiated page open on some Android versions) */
  try { _unlockAudio(); } catch (e) {}

  /* ── 4. Wrap speechSynthesis.speak() ────────────────────────────────────── */
  /*
   * Ensures voices are loaded before speaking, retries after voiceschanged,
   * and always fires utterance.onend so the UI never stays frozen.
   */
  if (window.speechSynthesis && typeof window.speechSynthesis.speak === 'function') {
    var _origSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);

    /* Expose so _unlockSynth() can call the original directly */
    window._aqsOrigSpeak = _origSpeak;

    window.speechSynthesis.speak = function (utterance) {
      try {
        var synth  = window.speechSynthesis;
        var voices = synth.getVoices();

        /* Auto-pick an English voice if none is assigned */
        if (!utterance.voice && voices.length > 0) {
          var enVoice = voices.find(function (v) {
            return v.lang && v.lang.startsWith('en');
          });
          if (enVoice) utterance.voice = enVoice;
        }

        if (voices.length === 0) {
          /* Voices not ready — wait up to 3 s for voiceschanged */
          var fired = false;
          var attempt = function () {
            if (fired) return;
            fired = true;
            try { synth.removeEventListener('voiceschanged', attempt); } catch (e2) {}
            /* Re-pick voice now that voices may be available */
            var vs2 = synth.getVoices();
            if (!utterance.voice && vs2.length > 0) {
              var enV2 = vs2.find(function (v) { return v.lang && v.lang.startsWith('en'); });
              if (enV2) utterance.voice = enV2;
            }
            try {
              _origSpeak(utterance);
            } catch (e3) {
              console.warn('[AQS-CAP] speak() threw:', e3.message);
              try {
                if (typeof utterance.onend === 'function') utterance.onend({});
              } catch (e4) {}
            }
          };
          synth.addEventListener('voiceschanged', attempt);
          setTimeout(attempt, 3000); /* hard timeout fallback */
        } else {
          _origSpeak(utterance);
        }

      } catch (e) {
        console.warn('[AQS-CAP] speechSynthesis wrapper error:', e.message);
        try { if (typeof utterance.onend === 'function') utterance.onend({}); } catch (e2) {}
      }
    };
  }

  /* ── 5. Poll-resume fix for Android (speechSynthesis.paused bug) ─────────── */
  /*
   * Android Chrome pauses speechSynthesis mid-utterance when the page loses
   * focus (e.g. notification shade pulled down). A global poll resumes it.
   */
  setInterval(function () {
    if (window.speechSynthesis &&
        window.speechSynthesis.speaking &&
        window.speechSynthesis.paused) {
      try { window.speechSynthesis.resume(); } catch (e) {}
    }
  }, 250);

  console.log('[AQS] Capacitor/mobile speech guard v3 active — SpeechRecognition disabled, TTS pre-unlock + AudioContext player + Whisper STT enabled.');

  /* ── 6. AudioContext blob player ─────────────────────────────────────────
   *
   * Plays a Blob via the already-unlocked AudioContext (window._aqsAudioCtx).
   * This bypasses new Audio().play() which silently fails on Android WebView
   * even after the audio unlock, because the audio is not routed to the speaker.
   *
   * window.aqsPlayAudioBlob(blob, onEnd, onError)
   * window.aqsStopCurrentAudio()
   * ─────────────────────────────────────────────────────────────────────── */
  window._aqsCurrentSource = null;

  window.aqsStopCurrentAudio = function () {
    if (window._aqsCurrentSource) {
      try { window._aqsCurrentSource.stop(0); } catch (e) {}
      window._aqsCurrentSource = null;
    }
  };

  window.aqsPlayAudioBlob = function (blob, onEnd, onError) {
    /* Ensure AudioContext exists and is running */
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { if (onError) onError(new Error('no AudioContext')); return; }
    if (!window._aqsAudioCtx) {
      try { window._aqsAudioCtx = new AC(); } catch (e) {
        if (onError) onError(e); return;
      }
    }
    var ctx = window._aqsAudioCtx;
    if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }

    /* Stop any previous source */
    window.aqsStopCurrentAudio();

    var reader = new FileReader();
    reader.onload = function (e) {
      var arrBuf = e.target.result;
      ctx.decodeAudioData(arrBuf, function (audioBuffer) {
        if (ctx.state === 'suspended') { ctx.resume().catch(function () {}); }
        var source = ctx.createBufferSource();
        window._aqsCurrentSource = source;
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = function () {
          if (window._aqsCurrentSource === source) window._aqsCurrentSource = null;
          if (onEnd) onEnd();
        };
        try { source.start(0); } catch (startErr) {
          if (onError) onError(startErr);
        }
      }, function (decodeErr) {
        console.warn('[AQS] decodeAudioData failed:', decodeErr);
        if (onError) onError(decodeErr);
      });
    };
    reader.onerror = function () {
      if (onError) onError(new Error('FileReader error'));
    };
    reader.readAsArrayBuffer(blob);
  };

  /* ── 7. MediaRecorder STT via Groq Whisper ──────────────────────────────
   *
   * Replaces the nullified SpeechRecognition API with a real-recording path:
   *   1. getUserMedia → MediaRecorder → collect chunks → stop → Blob
   *   2. POST blob to Groq /audio/transcriptions (whisper-large-v3-turbo)
   *   3. Fire onResult(text) or onError(message)
   *
   * window.aqsStartMicRecording(onResult, onError, maxMs)
   * window.aqsStopMicRecording()
   * ─────────────────────────────────────────────────────────────────────── */
  (function () {
    var _mr      = null;   /* MediaRecorder instance */
    var _chunks  = [];
    var _active  = false;
    var _stopTimer = null;

    window.aqsStopMicRecording = function () {
      _active = false;
      clearTimeout(_stopTimer);
      if (_mr && _mr.state !== 'inactive') {
        try { _mr.stop(); } catch (e) {}
      }
    };

    window.aqsStartMicRecording = function (onResult, onError, maxMs) {
      if (_active) { window.aqsStopMicRecording(); }
      _active = true;
      _chunks = [];

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        _active = false;
        if (onError) onError('Microphone not available on this device.');
        return;
      }

      navigator.mediaDevices.getUserMedia({ audio: true })
        .then(function (stream) {
          if (!_active) { stream.getTracks().forEach(function (t) { t.stop(); }); return; }

          /* Pick the best supported MIME type */
          var mimeType = '';
          var candidates = [
            'audio/webm;codecs=opus', 'audio/webm',
            'audio/ogg;codecs=opus',  'audio/ogg',
            'audio/mp4',              'audio/wav'
          ];
          for (var i = 0; i < candidates.length; i++) {
            if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(candidates[i])) {
              mimeType = candidates[i]; break;
            }
          }

          try {
            _mr = mimeType ? new MediaRecorder(stream, { mimeType: mimeType })
                           : new MediaRecorder(stream);
          } catch (e) {
            _mr = new MediaRecorder(stream);
            mimeType = '';
          }

          _mr.ondataavailable = function (ev) {
            if (ev.data && ev.data.size > 0) _chunks.push(ev.data);
          };

          _mr.onstop = function () {
            stream.getTracks().forEach(function (t) { t.stop(); });
            var finalType = mimeType || 'audio/webm';
            var audioBlob = new Blob(_chunks, { type: finalType });
            _chunks = [];
            _transcribe(audioBlob, finalType, onResult, onError);
          };

          _mr.start(250); /* collect a chunk every 250 ms */

          /* Auto-stop after maxMs (default 15 s) */
          _stopTimer = setTimeout(function () {
            if (_active) window.aqsStopMicRecording();
          }, maxMs || 15000);
        })
        .catch(function (err) {
          _active = false;
          if (onError) onError('Microphone access denied: ' + (err.message || String(err)));
        });
    };

    function _transcribe(blob, mimeType, onResult, onError) {
      var key = typeof window.getGroqKey === 'function' ? window.getGroqKey() : '';
      if (!key) { if (onError) onError('No API key — please add your Groq key in Settings.'); return; }

      /* Pick file extension from MIME type so Groq accepts the file */
      var ext = 'webm';
      if (mimeType.includes('ogg')) ext = 'ogg';
      else if (mimeType.includes('mp4')) ext = 'mp4';
      else if (mimeType.includes('wav')) ext = 'wav';

      var fd = new FormData();
      fd.append('file', blob, 'voice.' + ext);
      fd.append('model', 'whisper-large-v3-turbo');
      fd.append('response_format', 'json');
      fd.append('language', 'en');

      fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + key },
        body:    fd
      })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        var text = (data.text || '').trim();
        if (text) {
          if (onResult) onResult(text);
        } else {
          if (onError) onError('No speech detected — please try again.');
        }
      })
      .catch(function (err) {
        if (onError) onError('Transcription failed: ' + (err.message || String(err)));
      });
    }
  })();

})();
