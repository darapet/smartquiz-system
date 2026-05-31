/**
 * aqs-capacitor-speech.js
 * ─────────────────────────────────────────────────────────────────────────────
 * CAPACITOR SPEECH API GUARD  —  include BEFORE aqs-studio.js / aqs-study.js / aqs-tts.js
 *
 * ROOT CAUSE OF CRASH:
 *   window.webkitSpeechRecognition IS defined inside Android WebView (even in
 *   Capacitor), so the app's  if (!SpeechRec)  checks pass and don't block it.
 *   But when  .start()  is actually called, Android throws a native-level
 *   exception that bypasses JavaScript try/catch and closes the app entirely.
 *
 * HOW THIS FIX WORKS:
 *   1. Detects that we are running inside a Capacitor native app.
 *   2. Sets window.SpeechRecognition and window.webkitSpeechRecognition to null.
 *      This makes every existing  `if (!SpeechRec)`  guard in the codebase fire
 *      correctly — voice buttons are disabled with a friendly message instead of
 *      crashing the app.
 *   3. Wraps window.speechSynthesis.speak() so that if TTS silently fails (empty
 *      voice list, engine not ready), the utterance's onend callback is still
 *      fired — preventing the UI from freezing in a "speaking" state forever.
 *
 * HOW TO ADD TO YOUR PAGES:
 *   In studio.html, study.html, tts.html — add ONE line BEFORE the app script:
 *
 *       <script src="js/aqs-capacitor-speech.js"></script>
 *       <script src="js/aqs-studio.js"></script>   ← already there
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
(function () {
  'use strict';

  /* ── 1. Detect Capacitor native environment ─────────────────────────────── */
  var isCapacitor = !!(
    window.Capacitor &&
    typeof window.Capacitor.isNativePlatform === 'function' &&
    window.Capacitor.isNativePlatform()
  );

  /* Fallback detection: Capacitor sets a custom UA suffix on some builds */
  if (!isCapacitor && typeof navigator !== 'undefined') {
    isCapacitor = /Capacitor/i.test(navigator.userAgent);
  }

  if (!isCapacitor) {
    /* Running in a normal browser (GitHub Pages, Chrome, etc.) — do nothing */
    return;
  }

  /* ── 2. Nullify broken Speech Recognition APIs ──────────────────────────── */
  /*
   * Setting these to null/undefined makes every existing
   *   var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
   *   if (!SpeechRec) { ... show error message ... return; }
   * guard in aqs-studio.js, aqs-study.js, and aqs-quiz-studio.js fire
   * correctly — the buttons are disabled with a message, app does NOT crash.
   */
  try {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: null, writable: true, configurable: true
    });
  } catch (e) {
    window.SpeechRecognition = null;
  }

  try {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: null, writable: true, configurable: true
    });
  } catch (e) {
    window.webkitSpeechRecognition = null;
  }

  /* ── 3. Wrap speechSynthesis.speak() to prevent UI freeze ───────────────── */
  /*
   * window.speechSynthesis exists in Android WebView / Capacitor but:
   *   - The voices list is often empty on first call
   *   - speak() can silently do nothing, leaving the UI stuck in "AI speaking" state
   *
   * This wrapper retries once voices are loaded, and always fires utterance.onend
   * so the UI unblocks even if TTS fails silently.
   */
  if (window.speechSynthesis && typeof window.speechSynthesis.speak === 'function') {
    var _origSpeak = window.speechSynthesis.speak.bind(window.speechSynthesis);

    window.speechSynthesis.speak = function (utterance) {
      try {
        var synth = window.speechSynthesis;
        var voices = synth.getVoices();

        if (voices.length === 0) {
          /* Voices not loaded yet — wait for voiceschanged, then speak */
          var fired = false;
          var fireOnEnd = function () {
            if (fired) return;
            fired = true;
            try { synth.removeEventListener('voiceschanged', onVoicesChanged); } catch (e2) {}
            try { _origSpeak(utterance); } catch (e3) {
              /* If speak() itself throws, fire onend so UI unblocks */
              console.warn('[AQS-CAP] speechSynthesis.speak failed:', e3.message);
              try { if (utterance && typeof utterance.onend === 'function') utterance.onend({}); } catch (e4) {}
            }
          };
          var onVoicesChanged = function () { fireOnEnd(); };
          synth.addEventListener('voiceschanged', onVoicesChanged);
          /* Hard fallback: if voiceschanged never fires within 2 s, try anyway */
          setTimeout(fireOnEnd, 2000);
        } else {
          _origSpeak(utterance);
        }
      } catch (e) {
        console.warn('[AQS-CAP] speechSynthesis wrapper error:', e.message);
        /* Always fire onend so the UI does not stay frozen */
        try { if (utterance && typeof utterance.onend === 'function') utterance.onend({}); } catch (e2) {}
      }
    };
  }

  console.log('[AQS] Capacitor speech guard active. SpeechRecognition disabled (prevents crash). TTS wrapper applied.');
})();
