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

  /* ── App-wide mobile bottom navigation ───────────────────────────────── */
  function installBottomNavigation() {
    var page = (location.pathname || '').split('/').pop() || 'index.html';
    if (/^(login|register|unauthorized|admin(?:-|\.|$))/.test(page)) return;
    if (document.getElementById('aqs-bottom-nav')) return;

    var nav = document.createElement('nav');
    nav.id = 'aqs-bottom-nav';
    nav.className = 'aqs-bottom-nav';
    nav.setAttribute('aria-label', 'Main navigation');
    var links = [
      ['index.html', '⌂', 'Home', /^(index|$)/.test(page)],
      ['studyhub.html', '▣', 'Study', page === 'studyhub.html' || page === 'study.html'],
      ['studio.html', '✦', 'Studio', page === 'studio.html'],
      ['create-quiz.html', '+', 'Create', page === 'create-quiz.html'],
      ['library.html', '▤', 'Library', page === 'library.html']
    ];
    nav.innerHTML = links.map(function (item) {
      return '<a class="aqs-bottom-nav-link' + (item[3] ? ' active' : '') +
        '" href="' + item[0] + '"' + (item[3] ? ' aria-current="page"' : '') + '>' +
        '<span class="aqs-bottom-nav-icon" aria-hidden="true">' + item[1] + '</span>' +
        '<span class="aqs-bottom-nav-label">' + item[2] + '</span></a>';
    }).join('');
    document.body.appendChild(nav);
    document.body.classList.add('aqs-has-bottom-nav');
    if (document.getElementById('dts-app')) {
      document.body.classList.add('aqs-studio-shell');
    }
  }

  var bottomNavStyle = document.createElement('style');
  bottomNavStyle.id = 'aqs-bottom-nav-style';
  bottomNavStyle.textContent =
    ':root{--aqs-bottom-nav-h:74px;}' +
    '.aqs-bottom-nav{position:relative;width:100%;height:calc(var(--aqs-bottom-nav-h) + env(safe-area-inset-bottom,0px));' +
      'padding:6px 8px env(safe-area-inset-bottom,0px);display:grid;grid-template-columns:repeat(5,1fr);' +
      'gap:4px;background:rgba(12,10,30,.97);border-top:1px solid rgba(148,163,184,.2);' +
      'box-shadow:0 -8px 24px rgba(0,0,0,.28);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);' +
      'box-sizing:border-box;flex-shrink:0;z-index:10000;}' +
    '.aqs-bottom-nav-link{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;' +
      'min-width:0;border-radius:10px;color:#94a3b8;text-decoration:none;font:600 11px/1.1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}' +
    '.aqs-bottom-nav-link.active{color:#c4b5fd;background:rgba(99,102,241,.2);}' +
    '.aqs-bottom-nav-link:active{background:rgba(99,102,241,.28);}' +
    '.aqs-bottom-nav-icon{font-size:22px;line-height:1;font-weight:700;}' +
    '.aqs-bottom-nav-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}' +
    'body.aqs-has-bottom-nav{padding-bottom:0!important;}' +
    '@media(max-width:768px){body.aqs-studio-shell{display:flex;flex-direction:column;height:100vh;}' +
      'body.aqs-studio-shell #dts-app{height:calc(100dvh - var(--aqs-bottom-nav-h) - env(safe-area-inset-bottom,0px) - var(--aqs-cd-bar-h,0px))!important;flex:0 0 calc(100dvh - var(--aqs-bottom-nav-h) - env(safe-area-inset-bottom,0px) - var(--aqs-cd-bar-h,0px));}}' +
    '@media(min-width:769px){.aqs-bottom-nav{display:none!important;}body.aqs-has-bottom-nav{padding-bottom:0!important;}}' +
    '@media(max-width:768px){body.aqs-studio-shell #dts-footer{bottom:calc(var(--aqs-bottom-nav-h) + env(safe-area-inset-bottom,0px) + var(--aqs-ticker-bar-h,0px))!important;}' +
      'body.aqs-studio-shell #dts-main{padding-bottom:calc(var(--dts-footer-h,80px) + var(--aqs-ticker-bar-h,0px))!important;}' +
      'body.aqs-studio-shell #dts-messages{padding-bottom:calc(100px + env(safe-area-inset-bottom,0px))!important;}}';
  document.head.appendChild(bottomNavStyle);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installBottomNavigation, { once: true });
  } else {
    installBottomNavigation();
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

  function _unlockAudio(fromGesture) {
    var existingCtx = window._aqsAudioCtx;
    if (_audioUnlocked && existingCtx && existingCtx.state === 'running') return;
    var ctx = null;
    try {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        /* Save context globally so TTS can reuse it after async responses */
        ctx = window._aqsAudioCtx || new AC();
        window._aqsAudioCtx = ctx;
        /* Create and immediately discard a zero-length silent buffer */
        var buf = ctx.createBuffer(1, 1, 22050);
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.connect(ctx.destination);
        src.start(0);
        var resumeResult = ctx.state === 'suspended' && typeof ctx.resume === 'function'
          ? ctx.resume()
          : null;
        if (resumeResult && typeof resumeResult.then === 'function') {
          resumeResult.then(function () {
            _audioUnlocked = true;
          }).catch(function () {});
        } else if (ctx.state === 'running') {
          _audioUnlocked = true;
        }
      }
    } catch (e) {}
    /* A resume attempted during page load may be rejected by Android. Only
       consider the pipeline unlocked after a real user gesture or a running
       context, so the next gesture can retry it. */
    if (fromGesture && ctx) _audioUnlocked = true;

    /* Also play a truly silent Audio element so future Audio() calls work */
    try {
      /* 44-byte WAV: 1 sample of silence */
      var sil = new Audio(
        'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'
      );
      sil.setAttribute('playsinline', '');
      sil.setAttribute('webkit-playsinline', '');
       /* Do not let the unlock probe become the only audible sound on
          Android devices whose TTS engine is silent. */
       sil.muted = true;
       sil.volume = 0;
      sil.play().catch(function () {});
    } catch (e) {}
  }

  function _unlockSynth() {
    if (_synthUnlocked) return;
    /* The Capacitor Android bridge uses cloud audio/MediaPlayer through
       aqs-voice.js. Starting a zero-length native TTS utterance here is not
       needed and some Android engines emit an audible pop when it starts. */
    if (window.AqsNativeVoice) return;
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
    _unlockAudio(true);
    _unlockSynth();
  }

  /* Listen on both touch and click to catch the first user interaction */
  document.addEventListener('touchstart', _onFirstGesture, { once: true, passive: true });
  document.addEventListener('click',      _onFirstGesture, { once: true });

  /* Also try immediately (may already be inside a gesture if this script
     loaded during a user-initiated page open on some Android versions) */
  try { _unlockAudio(false); } catch (e) {}

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
    var source = window._aqsCurrentSource;
    window._aqsCurrentSource = null;
    if (source) {
      /* A cancelled source must not fire the previous chunk's onended
         callback and advance the Studio voice session unexpectedly. */
      try { source.onended = null; } catch (e) {}
      try { source.stop(0); } catch (e) {}
      try { source.disconnect(); } catch (e) {}
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

    /* Stop any previous source */
    window.aqsStopCurrentAudio();

    /* Android can resolve resume() asynchronously. Decoding and starting the
       source before it resolves produces a completely silent player even
       though the Promise returned by HTMLMediaElement.play() would succeed. */
    function startDecodedAudio() {
      if (ctx.state !== 'running') {
        if (onError) onError(new Error('Audio output is suspended'));
        return;
      }
      var reader = new FileReader();
      reader.onload = function (e) {
        var arrBuf = e.target.result;
        ctx.decodeAudioData(arrBuf, function (audioBuffer) {
          if (ctx.state !== 'running') {
            if (onError) onError(new Error('Audio output was suspended'));
            return;
          }
          var source = ctx.createBufferSource();
          window._aqsCurrentSource = source;
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          source.onended = function () {
             if (window._aqsCurrentSource !== source) return;
            if (window._aqsCurrentSource === source) window._aqsCurrentSource = null;
            if (onEnd) onEnd();
          };
          try { source.start(0); } catch (startErr) {
             if (window._aqsCurrentSource === source) window._aqsCurrentSource = null;
            if (onError) onError(startErr);
          }
        }, function (decodeErr) {
          console.warn('[AQS] decodeAudioData failed:', decodeErr);
          if (onError) onError(decodeErr);
        });
      };
      reader.onerror = function () {
        if (onError) onError(new Error('Audio file could not be read'));
      };
      reader.readAsArrayBuffer(blob);
    }

    if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      try {
        var resumeResult = ctx.resume();
        if (resumeResult && typeof resumeResult.then === 'function') {
          resumeResult.then(startDecodedAudio).catch(function (resumeErr) {
            if (onError) onError(resumeErr);
          });
        } else {
          startDecodedAudio();
        }
      } catch (resumeErr) {
        if (onError) onError(resumeErr);
      }
    } else {
      startDecodedAudio();
    };
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
        if (onError) onError('Microphone is not available on this device.');
        return;
      }

      /* ── Pre-check permission state so we can give a clear message ── */
      function _openMic() {
        var ideal = { audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } };
        return navigator.mediaDevices.getUserMedia(ideal).catch(function (err) {
          var n = err.name || '';
          /* Some WebViews reject the 16 kHz / optional constraints — fall back to plain audio */
          if (n === 'OverconstrainedError' || n === 'NotReadableError' || n === 'TrackStartError' || n === 'NotFoundError' || n === 'DevicesNotFoundError') {
            return navigator.mediaDevices.getUserMedia({ audio: true });
          }
          throw err;
        });
      }
      function _doRecord() {
        _openMic()
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
          var n = err.name || '';
          var msg;
          if (n === 'NotAllowedError' || n === 'PermissionDeniedError' || n === 'SecurityError') {
            msg = 'Microphone blocked by Android.\n\n'
                + 'To fix:\n'
                + '1. Open your phone \u2699\uFE0F Settings\n'
                + '2. Tap Apps \u2192 DaraQuiz\n'
                + '3. Tap Permissions \u2192 Microphone \u2192 Allow\n'
                + '4. Come back and try again.';
          } else if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'OverconstrainedError') {
            msg = 'Could not start microphone \u2014 another app may be using it.\n'
                + 'Close other apps (calls, voice recorders) and try again.';
          } else {
            msg = 'Microphone error: ' + (err.message || String(err));
          }
          if (onError) onError(msg);
        });
      } /* end _doRecord */

      /* ── Check permission state before calling getUserMedia ── */
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'microphone' })
          .then(function (status) {
            if (status.state === 'denied') {
              _active = false;
              if (onError) onError(
                'Microphone is blocked in Android settings.\n\n'
                + 'To fix:\n'
                + '1. Open your phone \u2699\uFE0F Settings\n'
                + '2. Tap Apps \u2192 DaraQuiz\n'
                + '3. Tap Permissions \u2192 Microphone \u2192 Allow\n'
                + '4. Come back and try again.'
              );
            } else {
              _doRecord(); /* 'granted' or 'prompt' — proceed */
            }
          })
          .catch(function () {
            _doRecord(); /* Permissions API not supported — try anyway */
          });
      } else {
        _doRecord();
      }
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


/* ── AQS_MEDIA_PLAY_FALLBACK ───────────────────────────────────────────────
   Android WebView often resolves/rejects <audio>.play() without producing
   sound for blob/data URLs. Route those through the unlocked AudioContext
   player (window.aqsPlayAudioBlob) so TTS and quiz voices stay audible.
   ─────────────────────────────────────────────────────────────────────── */
(function () {
  if (typeof window === 'undefined' || !window.HTMLMediaElement) return;
  var origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    var el = this;
    var res;
    try { res = origPlay.apply(el, arguments); } catch (e) { res = Promise.reject(e); }
    if (!res || typeof res.catch !== 'function') return res;
    return res.catch(function (err) {
      try {
        var src = el.currentSrc || el.src || '';
        if (window.aqsPlayAudioBlob && /^(blob:|data:)/.test(src)) {
          return fetch(src).then(function (r) { return r.blob(); }).then(function (b) {
            window.aqsPlayAudioBlob(b, function () {
              try { el.dispatchEvent(new Event('ended')); } catch (e) {}
            }, function () {});
          });
        }
      } catch (e) {}
      throw err;
    });
  };
})();
