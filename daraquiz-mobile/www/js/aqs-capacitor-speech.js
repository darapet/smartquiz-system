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
        var ctx = new AC();
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

  console.log('[AQS] Capacitor/mobile speech guard v2 active — SpeechRecognition disabled, TTS pre-unlock enabled.');
})();
