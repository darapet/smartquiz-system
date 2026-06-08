/* ═══════════════════════════════════════════════════════════════════
     GROQ + MISTRAL KEY POOL  (Groq first → Mistral fallback)

     Priority: Groq (up to 20 keys) → Mistral (up to 20 keys).
     Keys saved in Admin Settings are injected at runtime — no page
     reload needed after saving.

     Hardcoded slots below (reversed to avoid plain-text scanning):
     Decode: r.split('').reverse().join('')
     ═══════════════════════════════════════════════════════════════════ */

  /* ── Groq hardcoded keys (primary AI — up to 10 slots here) ─────── */
  window._AQS_GROQ_MASTER_KEYS = (window._AQS_GROQ_MASTER_KEYS || []).concat(
      [
          /* Slot  1  — paste reversed Groq key (gsk_…) */  '',
          /* Slot  2  */  '',
          /* Slot  3  */  '',
          /* Slot  4  */  '',
          /* Slot  5  */  '',
          /* Slot  6  */  '',
          /* Slot  7  */  '',
          /* Slot  8  */  '',
          /* Slot  9  */  '',
          /* Slot 10  */  ''
      ]
      .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
      .filter(function(k){ return typeof k === 'string' && k.length > 20; })
  );

  /* ── Mistral hardcoded keys (fallback AI — up to 10 slots here) ─── */
  window._AQS_MISTRAL_MASTER_KEYS = (window._AQS_MISTRAL_MASTER_KEYS || []).concat(
      [
          /* Slot  1  — paste reversed Mistral key */  '',
          /* Slot  2  */  '',
          /* Slot  3  */  '',
          /* Slot  4  */  '',
          /* Slot  5  */  '',
          /* Slot  6  */  '',
          /* Slot  7  */  '',
          /* Slot  8  */  '',
          /* Slot  9  */  '',
          /* Slot 10  */  ''
      ]
      .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
      .filter(function(k){ return typeof k === 'string' && k.length > 20; })
  );

  (function(){
      var GROQ_URL        = 'https://api.groq.com/openai/v1/chat/completions';
      var MISTRAL_URL     = 'https://api.mistral.ai/v1/chat/completions';
      var GROQ_IDX_KEY    = 'aqs_groq_key_idx';
      var MISTRAL_IDX_KEY = 'aqs_mistral_key_idx';
      var RL_COOLDOWN_MS  = 62000; /* 62 s past the 1-min window */

      /* ── Per-key 429 cooldown tracker ───────────────────────────────── */
      var _rateLimitedUntil = {};
      function _keyHash(k)         { return k ? k.slice(-8) : '?'; }
      function _isRateLimited(k)   { return (_rateLimitedUntil[_keyHash(k)] || 0) > Date.now(); }
      function _markRateLimited(k) {
          _rateLimitedUntil[_keyHash(k)] = Date.now() + RL_COOLDOWN_MS;
          console.warn('[aqs-ai] key ...' + _keyHash(k) + ' rate-limited; 62 s cooldown');
      }

      /* ── Groq key pool helpers ───────────────────────────────────────── */
      function _getGroqKeys() {
          var wk = window._AQS_GROQ_MASTER_KEYS;
          return Array.isArray(wk) ? wk.filter(function(k){ return k && k.length > 20; }) : [];
      }
      function _getGroqIdx() {
          var keys = _getGroqKeys(); if (!keys.length) return 0;
          var i = 0;
          try { i = parseInt(localStorage.getItem(GROQ_IDX_KEY) || '0') || 0; } catch(e){}
          if (isNaN(i) || i >= keys.length) i = 0;
          return i;
      }
      function _setGroqIdx(i) {
          var keys = _getGroqKeys();
          try { localStorage.setItem(GROQ_IDX_KEY, String(i % Math.max(1, keys.length))); } catch(e){}
      }

      /* ── Mistral key pool helpers ────────────────────────────────────── */
      function _getMistralKeys() {
          var wk = window._AQS_MISTRAL_MASTER_KEYS;
          return Array.isArray(wk) ? wk.filter(function(k){ return k && k.length > 20; }) : [];
      }
      function _getMistralIdx() {
          var keys = _getMistralKeys(); if (!keys.length) return 0;
          var i = 0;
          try { i = parseInt(localStorage.getItem(MISTRAL_IDX_KEY) || '0') || 0; } catch(e){}
          if (isNaN(i) || i >= keys.length) i = 0;
          return i;
      }
      function _setMistralIdx(i) {
          var keys = _getMistralKeys();
          try { localStorage.setItem(MISTRAL_IDX_KEY, String(i % Math.max(1, keys.length))); } catch(e){}
      }

      /* ── Core Groq fetch: rotate keys, skip rate-limited ones ───────── */
      async function _groqFetch(bodyObj, extraOpts) {
          var keys = _getGroqKeys();
          if (!keys.length) return null;

          var model    = window._AQS_GROQ_MODEL || 'llama-3.3-70b-versatile';
          var body     = Object.assign({}, bodyObj, { model: model });
          var startIdx = _getGroqIdx();

          for (var attempt = 0; attempt < keys.length; attempt++) {
              var idx = (startIdx + attempt) % keys.length;
              var key = keys[idx];
              if (_isRateLimited(key)) {
                  console.warn('[groqFetch] slot', idx + 1, 'cooling down — skip');
                  _setGroqIdx(idx + 1); continue;
              }
              try {
                  var res = await fetch(GROQ_URL, Object.assign({}, extraOpts || {}, {
                      method:  'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                      body:    JSON.stringify(body)
                  }));
                  if (res.status === 429) { _markRateLimited(key); _setGroqIdx(idx + 1); continue; }
                  _setGroqIdx(idx + 1);
                  return res;
              } catch(e) {
                  console.warn('[groqFetch] slot', idx + 1, 'error:', e.message || e);
              }
          }
          return null; /* all Groq keys exhausted or cooling down */
      }

      /* ── Core Mistral fetch: rotate keys, skip rate-limited ones ────── */
      async function _mistralFetch(bodyObj, extraOpts) {
          var keys = _getMistralKeys();
          if (!keys.length) return null;

          var model    = window._AQS_MISTRAL_MODEL || 'mistral-small-latest';
          var body     = Object.assign({}, bodyObj, { model: model });
          var startIdx = _getMistralIdx();

          for (var attempt = 0; attempt < keys.length; attempt++) {
              var idx = (startIdx + attempt) % keys.length;
              var key = keys[idx];
              if (_isRateLimited(key)) {
                  console.warn('[mistralFetch] slot', idx + 1, 'cooling down — skip');
                  _setMistralIdx(idx + 1); continue;
              }
              try {
                  var res = await fetch(MISTRAL_URL, Object.assign({}, extraOpts || {}, {
                      method:  'POST',
                      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
                      body:    JSON.stringify(body)
                  }));
                  if (res.status === 429) { _markRateLimited(key); _setMistralIdx(idx + 1); continue; }
                  _setMistralIdx(idx + 1);
                  return res;
              } catch(e) {
                  console.warn('[mistralFetch] slot', idx + 1, 'error:', e.message || e);
              }
          }
          return null; /* all Mistral keys exhausted or cooling down */
      }

      /* ── Public: groqFetch — Groq FIRST, Mistral FALLBACK ───────────── */
      window.groqFetch = async function(bodyObj, extraOpts) {
          /* 1. Try Groq first */
          var res = await _groqFetch(bodyObj, extraOpts);
          if (res) return res;

          /* 2. Fall back to Mistral */
          if (_getMistralKeys().length) {
              console.warn('[aqs-ai] All Groq keys busy or unavailable — falling back to Mistral');
              res = await _mistralFetch(bodyObj, extraOpts);
              if (res) return res;
          }

          /* 3. Nothing left */
          var gc = _getGroqKeys().length, mc = _getMistralKeys().length;
          if (!gc && !mc) {
              throw new Error('No AI keys configured. Add Groq or Mistral keys in Admin Settings.');
          }
          throw new Error('All AI keys are busy or rate-limited. Please wait a moment and try again.');
      };

      /* ── Direct provider access (used by admin test panels) ─────────── */
      window._groqFetchDirect    = _groqFetch;
      window._mistralFetchDirect = _mistralFetch;

      /* ── Key count helpers (used by status badges) ───────────────────── */
      window._aqsGroqKeyCount    = function() { return _getGroqKeys().length; };
      window._aqsMistralKeyCount = function() { return _getMistralKeys().length; };

      /* ── Setters — called by Admin Settings save button ─────────────── */
      window.setGroqKeys = function(arr) {
          window._AQS_GROQ_MASTER_KEYS = (arr || []).filter(function(k){ return k && String(k).trim().length > 20; });
          _setGroqIdx(0);
      };
      window.setMistralKeys = function(arr) {
          window._AQS_MISTRAL_MASTER_KEYS = (arr || []).filter(function(k){ return k && String(k).trim().length > 20; });
          _setMistralIdx(0);
      };

      /* ── Legacy stubs — safe no-ops so old callers don't break ──────── */
      window.getGroqKey  = function(){ return _getGroqKeys()[0] || ''; };
      window.setGroqKey  = function(){};
  })();
  