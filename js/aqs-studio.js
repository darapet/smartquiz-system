/* xzily AI Studio — Chat Interface */
/* Developed by omomo excellence in corporation with Darapet Technology */
(function () {
    'use strict';

    var cfg        = window.DTS_CONFIG || {};
    var messages   = [];          // current conversation messages
    var isStreaming = false;
    var currentChatId = null;     // ID of active history entry

    /* ─── File upload state ─── */
    var uploadedFileContent = null; // extracted text from the attached file
    var uploadedFileName    = null; // original filename shown in UI
    var pendingFileContext  = null; // { content, name } — injected once into next API call

    /* ─── Storage key ─── */
    var HISTORY_KEY = 'xzily_chat_history';

    /* ─── System prompt ─── */
    var SYSTEM =
        'You are XZILY, a helpful and friendly AI learning assistant. ' +
        'You were created by Omomo Excellence (XZILY), a student of the Federal University of Technology Akure (FUTA), in collaboration with Darapet Technology. ' +
        'You help students, teachers, and educators with studying, quiz preparation, ' +
        'problem solving, and any academic topic. Be clear, thorough, and encouraging. ' +
        '\n\nMATH FORMATTING RULES (follow strictly):\n' +
        '- For inline math expressions, always wrap with single dollar signs: $expression$\n' +
        '- For display/block math (equations on their own line), always wrap with double dollar signs: $$expression$$\n' +
        '- Example inline: The formula is $E = mc^2$\n' +
        '- Example block: $$\\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}$$\n' +
        '- Never use \\[...\\], \\(...\\), or \\begin{equation}...\\end{equation}\n' +
        '- Always use $ and $$ only. This is critical for correct rendering.\n' +
        '\nCODE RULES: Only include code (e.g. ```python) when the user explicitly asks for code, a program, or a programming solution. For math problems, show the working steps and final answer using math formatting only — do NOT include Python or any programming code unless asked.\n' +
        '\n\nSTRICT IDENTITY RULES — NEVER BREAK:\n1. You are XZILY, created by Omomo Excellence (FUTA/Darapet Technology). That is your entire identity.\n2. NEVER name any AI company, model, API, or service (Groq, Llama, OpenAI, ChatGPT, Anthropic, Meta, Gemini, Mistral, Hugging Face, Replicate, Pollinations, or any other). Not even indirectly.\n3. If asked what AI you are or what powers you: say ONLY "I am XZILY, an AI assistant created by Omomo Excellence. I cannot share information about the technology behind me."\n4. NEVER say "As an AI language model", "I was trained by", or any phrase revealing a third-party AI.\n5. Give zero hints about underlying technology — no speculation, no "I might be based on..."';

    /* =========================================================
       INIT
    ========================================================= */
    document.addEventListener('DOMContentLoaded', function () {
        /* Run each setup step in its own try-catch so one failure never
           silently prevents the rest (e.g. file upload, voice) from loading */
        var steps = [setupMarked, setupInput, setupSidebar, setupSuggestions,
                     setupNewChat, setupFileUpload, setupVoice, renderHistoryList];
        steps.forEach(function (fn) {
            try { fn(); } catch (e) { /* isolated — continues to next step */ }
        });
    });

    /* =========================================================
         AI CALL STRATEGY — no API key required
         ─────────────────────────────────────────────────────────
           1. PRIMARY: Groq direct (fast, best quality) — used only
              when a Groq API key is configured in settings.
           2. FALLBACK A: server proxy (aqs_studio_ai action).
           3. FALLBACK B: Pollinations AI direct from browser —
              completely free, NO API key needed. Always available.
         Steps 2 & 3 race simultaneously so there is no wait delay.
      =========================================================== */
    var voiceKeepAlive    = null; /* interval that keeps Chrome from pausing mid-utterance */
    var currentStudioAudio = null; /* Pollinations audio element for studio TTS */

    /* ── Groq browser call — auto-retries with next key on 429 ── */
    async function callGroq(apiMessages) {
        if (typeof window.groqFetch !== 'function') return null;
        try {
            var ctrl = new AbortController();
            var tid  = setTimeout(function () { ctrl.abort(); }, 20000);
            var res  = await window.groqFetch({
                model:       'llama-3.1-8b-instant',
                messages:    apiMessages,
                max_tokens:  2048,
                temperature: 0.7
            }, { signal: ctrl.signal });
            clearTimeout(tid);
            if (!res.ok) { console.warn('[xzily] Groq HTTP', res.status); return null; }
            var data = await res.json();
            var text = (data.choices && data.choices[0] && data.choices[0].message)
                       ? data.choices[0].message.content.trim() : '';
            return text || null;
        } catch (e) {
            console.warn('[xzily] Groq failed:', e.message || e);
            return null;
        }
    }

    /* ── WordPress server proxy (fallback when no client-side Groq key) ── */
    async function callViaProxy(apiMessages) {
        var ajaxUrl = (cfg.ajax_url     || '').trim();
        var nonce   = (cfg.public_nonce || '').trim();
        if (!ajaxUrl || !nonce) return null;

        var fd = new FormData();
        fd.append('action',   'aqs_studio_ai');
        fd.append('nonce',    nonce);
        fd.append('messages', JSON.stringify(apiMessages));

        var ctrl = new AbortController();
        var tid  = setTimeout(function () { ctrl.abort(); }, 35000);

        try {
            var res  = await fetch(ajaxUrl, { method: 'POST', body: fd, signal: ctrl.signal });
            clearTimeout(tid);
            var data = await res.json();
            if (data && data.success && data.data && data.data.text) {
                return data.data.text;
            }
            console.warn('[xzily] proxy: no text in response', data);
            return null;
        } catch (e) {
            clearTimeout(tid);
            console.warn('[xzily] proxy failed:', e.message || e);
            return null;
        }
    }

    /* ── Pollinations direct (no key required — last resort fallback) ── */
    async function callPollinations(apiMessages) {
        var models = ['openai', 'mistral', 'llama'];
        for (var mi = 0; mi < models.length; mi++) {
            try {
                var ctrl = new AbortController();
                var tid  = setTimeout(function () { ctrl.abort(); }, 30000);
                var res  = await fetch('https://text.pollinations.ai/openai', {
                    method:  'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal:  ctrl.signal,
                    body: JSON.stringify({
                        messages:    apiMessages,
                        model:       models[mi],
                        max_tokens:  1024,
                        temperature: 0.7,
                        private:     true
                    })
                });
                clearTimeout(tid);
                if (!res.ok) { console.warn('[xzily] Pollinations HTTP', res.status, 'model', models[mi]); continue; }
                var data = await res.json();
                var text = (data.choices && data.choices[0] && data.choices[0].message)
                           ? data.choices[0].message.content.trim() : '';
                if (text) return text;
            } catch (e) {
                console.warn('[xzily] Pollinations model', models[mi], 'failed:', e.message || e);
            }
        }
        return null;
    }

    /* ── AI call — sequential: Groq → Pollinations → proxy ── */
    async function raceAI(apiMessages) {
        /* 1. Groq direct — fastest & best quality (key saved via 🔑 button) */
        var groqResult = await callGroq(apiMessages);
        if (groqResult) return groqResult;

        /* 2. Pollinations direct — free, no key, works from browser immediately */
        var pollResult = await callPollinations(apiMessages);
        if (pollResult) return pollResult;

        /* 3. Server proxy — last resort only */
        var proxyResult = await callViaProxy(apiMessages);
        if (proxyResult) return proxyResult;

        return null;
    }

    /* ── Main entry point called by sendMessage() ── */
    async function callAI() {
        var fileCtx = pendingFileContext;
        pendingFileContext = null;

        /* Build messages — inject file content into last user message */
        var apiMessages = [{ role: 'system', content: SYSTEM }].concat(
            messages.map(function (m, idx) {
                var content = m.content;
                if (fileCtx && idx === messages.length - 1 && m.role === 'user') {
                    var truncated = fileCtx.content.length > 6000
                        ? fileCtx.content.substring(0, 6000) + '\n\n[File truncated to fit AI context limit]'
                        : fileCtx.content;
                    content = content + '\n\n[Attached file: ' + fileCtx.name + ']\n\n' + truncated;
                }
                return { role: m.role, content: content };
            })
        );

        var winner = await raceAI(apiMessages);

        showTyping(false);

        if (winner) {
            messages.push({ role: 'assistant', content: winner });
            typeMessage(winner, function () {
                document.getElementById('dts-send').disabled = false;
                isStreaming = false;
                scrollToBottom();
                saveCurrentChat();
            });
        } else {
            appendMessage('ai', '⚠️ xzily AI could not reach the server. Please check your internet connection and try again.');
            document.getElementById('dts-send').disabled = false;
            isStreaming = false;
        }
    }

    /* =========================================================
       SEND MESSAGE
    ========================================================= */
    function sendMessage() {
        if (isStreaming) return;
        var input = document.getElementById('dts-input');
        var text  = (input.value || '').trim();
        if (!text && !uploadedFileContent) return;
        if (!text && uploadedFileContent) text = 'Please analyse the attached file.';

        var welcome = document.getElementById('dts-welcome');
        if (welcome) welcome.style.display = 'none';

        /* Start a new history entry if this is the first message */
        if (messages.length === 0) {
            currentChatId = 'chat_' + Date.now();
        }

        /* Capture file before clearing state */
        var attachedFile = null;
        if (uploadedFileContent) {
            pendingFileContext = { content: uploadedFileContent, name: uploadedFileName };
            attachedFile      = uploadedFileName;
            clearFileAttachment();
        }

        messages.push({ role: 'user', content: text });
        appendUserMessage(text, attachedFile);
        input.value = '';
        input.style.height = 'auto';
        document.getElementById('dts-send').disabled = true;
        isStreaming = true;

        showTyping(true);
        scrollToBottom();
        callAI();
    }

    /* =========================================================
       SETUP
    ========================================================= */
    function setupMarked() {
        if (typeof marked === 'undefined') return;
        try {
            /* marked v4 and below use setOptions */
            if (typeof marked.setOptions === 'function') {
                marked.setOptions({
                    breaks: true,
                    gfm:    true,
                    highlight: function (code, lang) {
                        if (typeof hljs !== 'undefined' && lang && hljs.getLanguage(lang)) {
                            return hljs.highlight(code, { language: lang }).value;
                        }
                        return typeof hljs !== 'undefined' ? hljs.highlightAuto(code).value : code;
                    }
                });
            } else if (typeof marked.use === 'function') {
                /* marked v5+ removed setOptions and the highlight callback;
                   configure what's still available and let hljs run post-render */
                marked.use({ breaks: true, gfm: true });
            }
        } catch (e) {
            /* Never let a marked API change crash the whole init chain */
        }
    }

    function setupInput() {
        var input   = document.getElementById('dts-input');
        var sendBtn = document.getElementById('dts-send');
        if (!input || !sendBtn) return;
        input.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 180) + 'px';
        });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
        });
        sendBtn.addEventListener('click', sendMessage);
    }

    function setupSidebar() {
        var toggle  = document.getElementById('dts-sidebar-toggle');
        var sidebar = document.getElementById('dts-sidebar');
        if (!toggle || !sidebar) return;

        /* Create dimming overlay for mobile */
        var overlay = document.createElement('div');
        overlay.className = 'dts-overlay';
        document.body.appendChild(overlay);

        function openSidebar() {
            sidebar.classList.add('open');
            overlay.style.display = 'block';
            toggle.innerHTML = '✕';
        }

        function closeSidebar() {
            sidebar.classList.remove('open');
            overlay.style.display = 'none';
            toggle.innerHTML = '☰';
        }

        /* Hamburger toggle — stop propagation so document listener doesn't instantly close */
        toggle.addEventListener('click', function (e) {
            e.stopPropagation();
            if (sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        /* Tap overlay to close */
        overlay.addEventListener('click', closeSidebar);
        overlay.addEventListener('touchstart', function (e) { e.preventDefault(); closeSidebar(); }, { passive: false });

        /* Clicking a nav link while sidebar is open on mobile closes it */
        sidebar.querySelectorAll('a').forEach(function (a) {
            a.addEventListener('click', function () {
                if (window.innerWidth <= 768) closeSidebar();
            });
        });

        /* ESC key closes sidebar */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') closeSidebar();
        });
    }

    function setupSuggestions() {
        document.querySelectorAll('.dts-suggestion-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var prompt = this.getAttribute('data-prompt');
                if (!prompt) return;
                document.getElementById('dts-input').value = prompt;
                sendMessage();
            });
        });
    }

    function setupNewChat() {
        var btn = document.getElementById('dts-new-chat');
        if (!btn) return;
        btn.addEventListener('click', function () {
            startNewChat();
        });
    }

    function startNewChat() {
        messages      = [];
        currentChatId = null;
        document.getElementById('dts-messages').innerHTML = '';
        var welcome = document.getElementById('dts-welcome');
        if (welcome) welcome.style.display = 'flex';
        /* Deselect history items */
        document.querySelectorAll('.dts-history-item').forEach(function (el) {
            el.classList.remove('active');
        });
    }

    /* =========================================================
       TYPEWRITER MESSAGE (AI responses only)
       Streams raw text char-by-char with a blinking cursor,
       then swaps to full rendered markdown when done.
    ========================================================= */
    /* Tracks the flush fn for the current in-progress typeMessage animation.
       Called on visibilitychange so animation completes even when tab was hidden. */
    var _typingFlushFn  = null;
    var _hiddenTickTimer = null;

    /* When user returns to the tab, flush any paused animation immediately */
    document.addEventListener('visibilitychange', function() {
        if (!document.hidden && _typingFlushFn) {
            _typingFlushFn();
            _typingFlushFn = null;
        }
    });

    function typeMessage(text, onDone) {
          var container = document.getElementById('dts-messages');
          if (!container) { if (onDone) onDone(); return; }

          /* Build DOM structure */
          var msgEl = document.createElement('div');
          msgEl.className = 'dts-message dts-ai';

          var avatarEl = document.createElement('div');
          avatarEl.className = 'dts-msg-avatar';
          avatarEl.textContent = '⬡';

          var contentEl = document.createElement('div');
          contentEl.className = 'dts-msg-content';

          var bubbleEl = document.createElement('div');
          bubbleEl.className = 'dts-msg-bubble';

          /* Streaming text container — plain pre-wrap during animation */
          var streamEl = document.createElement('div');
          streamEl.className = 'aqs-type-stream';
          bubbleEl.appendChild(streamEl);

          /* Blinking cursor */
          var cursorEl = document.createElement('span');
          cursorEl.className = 'aqs-type-cursor';
          cursorEl.setAttribute('aria-hidden', 'true');
          bubbleEl.appendChild(cursorEl);

          contentEl.appendChild(bubbleEl);
          msgEl.appendChild(avatarEl);
          msgEl.appendChild(contentEl);
          container.appendChild(msgEl);
          scrollToBottom();

          /* Word-by-word streaming — safe regex, no lookbehind (works on all iOS/Android) */
          var tokens      = text.match(/\S+|\s+/g) || [text];
          var tokenIdx    = 0;
          var accumulated = '';

          /* requestAnimationFrame-based ticker — smooth and reliable on Android/iOS.
             Uses a target timestamp so delays (40/70/180ms) work correctly without
             setTimeout, which can be throttled aggressively on mobile. */
          var nextTickAt = performance.now() + 16;

          /* Register flush function so visibilitychange can trigger immediate completion */
          _typingFlushFn = function() {
              if (_hiddenTickTimer) { clearTimeout(_hiddenTickTimer); _hiddenTickTimer = null; }
              accumulated = text;
              tokenIdx    = tokens.length;
              tick(performance.now());
          };

          function tick(ts) {
              /* Clear hidden-tab fallback timer if we're running normally */
              if (_hiddenTickTimer) { clearTimeout(_hiddenTickTimer); _hiddenTickTimer = null; }
              var now = (typeof ts === 'number') ? ts : performance.now();

              /* If the tab is hidden mid-animation, fast-forward to the complete text
                 so the message is fully rendered when the user returns to the page */
              if (document.hidden && tokenIdx < tokens.length) {
                  accumulated = text;
                  tokenIdx = tokens.length;
              } else if (now < nextTickAt) {
                  requestAnimationFrame(tick);
                  /* Safari/Chrome throttle RAF on hidden tabs — setTimeout ensures tick()
                     fires at least once per 250ms even when the tab is not visible */
                  _hiddenTickTimer = setTimeout(function() { tick(performance.now()); }, 250);
                  return;
              }

              /* Consume whitespace-only tokens so pauses feel natural */
              while (tokenIdx < tokens.length && /^\s+$/.test(tokens[tokenIdx])) {
                  accumulated += tokens[tokenIdx];
                  tokenIdx++;
              }

              if (tokenIdx < tokens.length) {
                  accumulated += tokens[tokenIdx];
                  tokenIdx++;
                  streamEl.textContent = accumulated;
                  scrollToBottom();
              }

              if (tokenIdx < tokens.length) {
                  /* Use trimRight for broad Android compat (trimEnd added in ES2019) */
                  var lastChar = accumulated.replace(/\s+$/, '').slice(-1);
                  var delay    = /[.!?]/.test(lastChar) ? 80
                               : /[,;:]/.test(lastChar) ? 35
                               : 20;
                  nextTickAt = performance.now() + delay;
                  requestAnimationFrame(tick);
              } else {
                  /* ── Streaming done ── swap to full rendered markdown ── */
                  cursorEl.remove();
                  bubbleEl.innerHTML = renderContent(text);

                  /* Syntax-highlight code blocks */
                  if (typeof hljs !== 'undefined') {
                      bubbleEl.querySelectorAll('pre code').forEach(function (block) {
                          hljs.highlightElement(block);
                      });
                  }

                  /* Copy button — works on HTTPS and plain HTTP */
                  var actionsEl = document.createElement('div');
                  actionsEl.className = 'dts-msg-actions';
                  var copyBtn = document.createElement('button');
                  copyBtn.className = 'dts-copy-btn';
                  copyBtn.textContent = 'Copy';
                  copyBtn.addEventListener('click', function () {
                      function doFallback() {
                          var ta = document.createElement('textarea');
                          ta.value = text;
                          ta.setAttribute('readonly', '');
                          ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
                          document.body.appendChild(ta);
                          ta.focus(); ta.select();
                          try {
                              document.execCommand('copy');
                              copyBtn.textContent = 'Copied!';
                          } catch(e) { copyBtn.textContent = 'Error'; }
                          document.body.removeChild(ta);
                          setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
                      }
                      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                          navigator.clipboard.writeText(text).then(function () {
                              copyBtn.textContent = 'Copied!';
                              setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
                          }).catch(doFallback);
                      } else { doFallback(); }
                  });
                  actionsEl.appendChild(copyBtn);
                  contentEl.appendChild(actionsEl);

                  /* "Save as Quiz" bar if MCQs detected */
                  maybeShowCreateQuizBar(contentEl, text);

                  _typingFlushFn = null;
                  scrollToBottom();
                  if (onDone) onDone();
              }
          }

          requestAnimationFrame(tick);
      }

      /* =========================================================
       RENDER MESSAGES
    ========================================================= */
    function appendMessage(role, content) {
        var container = document.getElementById('dts-messages');
        if (!container) return;

        var msgEl = document.createElement('div');
        msgEl.className = 'dts-message dts-' + role;

        var avatarEl = document.createElement('div');
        avatarEl.className = 'dts-msg-avatar';
        avatarEl.textContent = role === 'user'
            ? (cfg.user_name ? cfg.user_name.charAt(0).toUpperCase() : 'U')
            : '⬡';

        var contentEl = document.createElement('div');
        contentEl.className = 'dts-msg-content';

        var bubbleEl = document.createElement('div');
        bubbleEl.className = 'dts-msg-bubble';

        if (role === 'ai') {
            bubbleEl.innerHTML = renderContent(content);
            /* Syntax highlight code blocks */
            if (typeof hljs !== 'undefined') {
                bubbleEl.querySelectorAll('pre code').forEach(function (block) {
                    hljs.highlightElement(block);
                });
            }
        } else {
            bubbleEl.textContent = content;
        }

        contentEl.appendChild(bubbleEl);

        if (role === 'ai') {
            var actionsEl = document.createElement('div');
            actionsEl.className = 'dts-msg-actions';
            var copyBtn = document.createElement('button');
            copyBtn.className = 'dts-copy-btn';
            copyBtn.textContent = 'Copy';
            copyBtn.addEventListener('click', function () {
                navigator.clipboard.writeText(content).then(function () {
                    copyBtn.textContent = 'Copied!';
                    setTimeout(function () { copyBtn.textContent = 'Copy'; }, 2000);
                });
            });
            actionsEl.appendChild(copyBtn);
            contentEl.appendChild(actionsEl);

            /* Show "Save as Quiz" bar when MCQ questions are detected */
            maybeShowCreateQuizBar(contentEl, content);
        }

        msgEl.appendChild(avatarEl);
        msgEl.appendChild(contentEl);
        container.appendChild(msgEl);
        scrollToBottom();
    }

    /* =========================================================
       QUIZ QUESTION DETECTION + CREATE QUIZ BUTTON
       Parses numbered MCQs from AI responses and offers a
       one-click "Save as Quiz" shortcut to the create-quiz page.
    ========================================================= */

    /* Parse multiple-choice questions from raw AI text.
       Handles: numbered items, A/B/C/D options, Answer: X, Explanation: ... */
    function parseStudioQuestions(text) {
        var questions = [];
        var clean = text.replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
        var blocks = clean.split(/\n(?=\s*\d+[.)]\s)/);

        blocks.forEach(function (block) {
            var qMatch = block.match(/^\s*\d+[.)]\s+([\s\S]+)/);
            if (!qMatch) return;

            var lines       = qMatch[1].split('\n').map(function (l) { return l.trim(); }).filter(Boolean);
            var questionLines = [], options = [], correctIdx = 0, explanation = '', parsingOpts = false;

            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1').trim();

                /* Option: A) A. a) (A) - A) */
                var optM = line.match(/^[-•*]?\s*\(?([A-Da-d])\)?[.):\]]\s*(.*)/);
                if (optM) { parsingOpts = true; options.push(optM[2].trim()); continue; }

                /* Answer: B */
                var ansM = line.match(/^(?:answer|correct(?:\s+answer)?)[:\s]+\(?([A-Da-d])\)?/i);
                if (ansM) { correctIdx = ansM[1].toUpperCase().charCodeAt(0) - 65; continue; }

                /* Explanation: ... */
                var expM = line.match(/^(?:explanation|reason)[:\s]+(.*)/i);
                if (expM) { explanation = expM[1].trim(); continue; }

                if (!parsingOpts) questionLines.push(line);
            }

            var question = questionLines.join(' ').trim();
            if (question && options.length >= 2) {
                questions.push({
                    question:             question,
                    options:              options,
                    correct_answer_index: Math.min(Math.max(correctIdx, 0), options.length - 1),
                    explanation:          explanation
                });
            }
        });

        return questions;
    }

    /* Append a "Save as Quiz" bar below AI messages that contain MCQs.
       Only visible when the user has a create_quiz_url in config. */
    function maybeShowCreateQuizBar(contentEl, rawText) {
        var createUrl = cfg.create_quiz_url;
        if (!createUrl) return;

        var questions = parseStudioQuestions(rawText);
        if (questions.length < 2) return;

        var bar = document.createElement('div');
        bar.className = 'dts-quiz-import-bar';

        var info = document.createElement('span');
        info.className = 'dts-quiz-import-info';
        info.textContent = '\uD83D\uDCDD ' + questions.length + ' question' + (questions.length !== 1 ? 's' : '') + ' detected';

        var btn = document.createElement('button');
        btn.className = 'dts-create-quiz-btn';
        btn.textContent = 'Save as Quiz \u2192';
        btn.addEventListener('click', function () {
            try { sessionStorage.setItem('aqs_studio_import', JSON.stringify({ questions: questions })); } catch (e) {}
            window.location.href = createUrl;
        });

        bar.appendChild(info);
        bar.appendChild(btn);
        contentEl.appendChild(bar);
    }

    /* =========================================================
       MATH + MARKDOWN RENDERER
       Handles $$...$$, $...$, \[...\], \(...\), \begin{equation}
    ========================================================= */
    function renderContent(raw) {
        var text = raw;

        /* Step 1 — Normalise LaTeX delimiter variants → $ / $$ */
        /* \[...\]  → $$...$$ */
        text = text.replace(/\\\[([\s\S]+?)\\\]/g, function (_, m) { return '$$' + m + '$$'; });
        /* \(...\)  → $...$ */
        text = text.replace(/\\\(([\s\S]+?)\\\)/g, function (_, m) { return '$' + m + '$'; });
        /* \begin{equation}...\end{equation}  → $$...$$ */
        text = text.replace(/\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g, function (_, m) { return '$$' + m + '$$'; });
        /* \begin{align}...\end{align}  → $$...$$ */
        text = text.replace(/\\begin\{align\*?\}([\s\S]+?)\\end\{align\*?\}/g, function (_, m) { return '$$' + m + '$$'; });
        /* Bare [...] that contains a backslash → $$...$$ */
        text = text.replace(/^\[([\s\S]+?)\]$/gm, function (full, m) {
            return m.indexOf('\\') !== -1 ? '$$' + m + '$$' : full;
        });

        /* Step 2 — Extract and render $$ display math (before inline so $$ wins) */
        var displayMath = [];
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, function (_, math) {
            var idx = displayMath.length;
            var rendered;
            try {
                rendered = '<div class="dts-katex-display">' +
                    katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, trust: true }) +
                    '</div>';
            } catch (e) {
                rendered = '<pre class="dts-math-fallback"><code>' + escHtml(math) + '</code></pre>';
            }
            displayMath.push(rendered);
            return '\x00DMATH' + idx + '\x00';
        });

        /* Step 3 — Extract and render $ inline math */
        var inlineMath = [];
        text = text.replace(/\$([^$\n]{1,400}?)\$/g, function (_, math) {
            /* Skip if it looks like a currency amount (digit directly after $) */
            if (/^\d[\d,\.]*$/.test(math.trim())) return '$' + math + '$';
            var idx = inlineMath.length;
            var rendered;
            try {
                rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, trust: true });
            } catch (e) {
                rendered = '<code>' + escHtml(math) + '</code>';
            }
            inlineMath.push(rendered);
            return '\x00IMATH' + idx + '\x00';
        });

        /* Step 4 — Parse Markdown */
        var html = typeof marked !== 'undefined' ? marked.parse(text) : escHtml(text);

        /* Step 5 — Restore math placeholders */
        inlineMath.forEach(function (r, i) { html = html.split('\x00IMATH' + i + '\x00').join(r); });
        displayMath.forEach(function (r, i) { html = html.split('\x00DMATH' + i + '\x00').join(r); });

        return html;
    }

    /* =========================================================
       CHAT HISTORY (localStorage)
    ========================================================= */
    function loadHistory() {
        try {
            var raw = localStorage.getItem(HISTORY_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function saveHistory(history) {
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (e) {}
    }

    function saveCurrentChat() {
        if (!currentChatId || messages.length === 0) return;
        var history = loadHistory();
        /* First user message becomes the title */
        var firstUser = messages.find(function (m) { return m.role === 'user'; });
        var title = firstUser ? firstUser.content.substring(0, 60) : 'Chat';
        /* Find existing entry or prepend new one */
        var idx = history.findIndex(function (h) { return h.id === currentChatId; });
        var entry = {
            id:        currentChatId,
            title:     title,
            timestamp: Date.now(),
            messages:  messages.slice()
        };
        if (idx >= 0) {
            history[idx] = entry;
        } else {
            history.unshift(entry);
        }
        /* Keep only the latest 50 conversations */
        if (history.length > 50) history = history.slice(0, 50);
        saveHistory(history);
        renderHistoryList();
    }

    function loadChat(chatId) {
        var history = loadHistory();
        var entry = history.find(function (h) { return h.id === chatId; });
        if (!entry) return;

        currentChatId = entry.id;
        messages      = entry.messages.slice();

        /* Clear and re-render messages */
        var container = document.getElementById('dts-messages');
        container.innerHTML = '';
        var welcome = document.getElementById('dts-welcome');
        if (welcome) welcome.style.display = 'none';

        messages.forEach(function (m) {
            if (m.role !== 'system') appendMessage(m.role === 'assistant' ? 'ai' : m.role, m.content);
        });

        /* Highlight active history item */
        document.querySelectorAll('.dts-history-item').forEach(function (el) {
            el.classList.toggle('active', el.dataset.id === chatId);
        });
    }

    function deleteChat(chatId) {
        var history = loadHistory().filter(function (h) { return h.id !== chatId; });
        saveHistory(history);
        if (currentChatId === chatId) startNewChat();
        renderHistoryList();
    }

    function renderHistoryList() {
        var list    = document.getElementById('dts-history-list');
        var empty   = document.getElementById('dts-history-empty');
        if (!list) return;
        var history = loadHistory();

        /* Remove old items (keep the empty placeholder) */
        Array.from(list.querySelectorAll('.dts-history-item')).forEach(function (el) { el.remove(); });

        if (history.length === 0) {
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        history.forEach(function (entry) {
            var item = document.createElement('div');
            item.className = 'dts-history-item' + (entry.id === currentChatId ? ' active' : '');
            item.dataset.id = entry.id;

            var titleEl = document.createElement('span');
            titleEl.className = 'dts-history-item-title';
            titleEl.textContent = entry.title;
            titleEl.title = entry.title;

            var delBtn = document.createElement('button');
            delBtn.className = 'dts-history-item-del';
            delBtn.textContent = '✕';
            delBtn.title = 'Delete conversation';
            delBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                if (confirm('Delete this conversation?')) deleteChat(entry.id);
            });

            item.appendChild(titleEl);
            item.appendChild(delBtn);
            item.addEventListener('click', function () { loadChat(entry.id); });
            list.appendChild(item);
        });
    }

    /* =========================================================
       FILE UPLOAD
       Supports TXT, MD, CSV, JSON (FileReader),
                 PDF (pdf.js), DOCX/DOC (mammoth.js)
    ========================================================= */
    var MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

    function setupFileUpload() {
        /* The attach button is now a <label for="dts-file-input">, so the browser
           opens the file picker natively on click — no JS input.click() needed.
           We only need to handle the resulting 'change' event. */
        var input = document.getElementById('dts-file-input');
        if (!input) return;
        input.addEventListener('change', function () {
            var file = this.files[0];
            if (!file) return;
            this.value = ''; // allow re-selecting same file
            handleFileUpload(file);
        });
    }

    async function handleFileUpload(file) {
        var ext     = (file.name.split('.').pop() || '').toLowerCase();
        var allowed = ['txt', 'md', 'csv', 'json', 'pdf', 'docx', 'doc'];
        if (allowed.indexOf(ext) === -1) {
            showFileError('Unsupported file type. Allowed: TXT, MD, CSV, JSON, PDF, DOCX');
            return;
        }
        if (file.size > MAX_FILE_BYTES) {
            showFileError('File too large (max 10 MB)');
            return;
        }
        showFileLoading(file.name);
        try {
            var text = '';
            if (['txt', 'md', 'csv', 'json'].indexOf(ext) !== -1) {
                text = await readAsText(file);
            } else if (ext === 'pdf') {
                text = await readPDF(file);
            } else {
                text = await readDOCX(file);
            }
            if (!text || !text.trim()) {
                showFileError('Could not extract text from this file.');
                return;
            }
            uploadedFileContent = text;
            uploadedFileName    = file.name;
            showFileAttached(file.name);
            document.getElementById('dts-input').focus();
        } catch (e) {
            showFileError('Error reading file: ' + (e.message || 'unknown error'));
        }
    }

    function readAsText(file) {
        return new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload  = function (e) { resolve(e.target.result); };
            fr.onerror = function ()  { reject(new Error('FileReader error')); };
            fr.readAsText(file);
        });
    }

    async function readPDF(file) {
        if (typeof window.pdfjsLib === 'undefined') {
            throw new Error('PDF reader not yet loaded — please wait a moment and try again.');
        }
        /* Set worker URL lazily (avoids timing issues with defer-loaded script) */
        if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js';
        }
        var ab = await new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload  = function (e) { resolve(e.target.result); };
            fr.onerror = function ()  { reject(new Error('FileReader error')); };
            fr.readAsArrayBuffer(file);
        });
        var pdf   = await window.pdfjsLib.getDocument({ data: ab }).promise;
        var pages = [];
        for (var i = 1; i <= Math.min(pdf.numPages, 50); i++) {
            var page    = await pdf.getPage(i);
            var content = await page.getTextContent();
            pages.push(content.items.map(function (it) { return it.str; }).join(' '));
        }
        return pages.join('\n\n');
    }

    async function readDOCX(file) {
        if (typeof window.mammoth === 'undefined') {
            throw new Error('DOCX reader not yet loaded — please wait a moment and try again.');
        }
        var ab = await new Promise(function (resolve, reject) {
            var fr = new FileReader();
            fr.onload  = function (e) { resolve(e.target.result); };
            fr.onerror = function ()  { reject(new Error('FileReader error')); };
            fr.readAsArrayBuffer(file);
        });
        var result = await window.mammoth.extractRawText({ arrayBuffer: ab });
        return result.value;
    }

    function showFileLoading(name) {
        var s = document.getElementById('dts-file-status');
        if (!s) return;
        s.innerHTML = '<span class="dts-file-loading">⏳ Reading ' + escHtml(name) + '…</span>';
        s.style.display = 'flex';
    }

    function showFileAttached(name) {
        var s = document.getElementById('dts-file-status');
        if (!s) return;
        var attached = document.createElement('span');
        attached.className   = 'dts-file-attached';
        attached.textContent = '📎 ' + name;
        var clearBtn = document.createElement('button');
        clearBtn.className   = 'dts-file-clear';
        clearBtn.title       = 'Remove file';
        clearBtn.textContent = '✕';
        clearBtn.addEventListener('click', clearFileAttachment);
        s.innerHTML = '';
        s.appendChild(attached);
        s.appendChild(clearBtn);
        s.style.display = 'flex';
    }

    function clearFileAttachment() {
        uploadedFileContent = null;
        uploadedFileName    = null;
        var s = document.getElementById('dts-file-status');
        if (s) { s.innerHTML = ''; s.style.display = 'none'; }
    }

    function showFileError(msg) {
        var s = document.getElementById('dts-file-status');
        if (!s) return;
        s.innerHTML = '<span class="dts-file-error">⚠️ ' + escHtml(msg) + '</span>';
        s.style.display = 'flex';
        setTimeout(function () {
            if (s) { s.innerHTML = ''; s.style.display = 'none'; }
        }, 4500);
    }

    /* ── Render a user message with optional file chip ── */
    function appendUserMessage(text, fileName) {
        var container = document.getElementById('dts-messages');
        if (!container) return;

        var msgEl    = document.createElement('div');
        msgEl.className = 'dts-message dts-user';

        var avatarEl = document.createElement('div');
        avatarEl.className   = 'dts-msg-avatar';
        avatarEl.textContent = cfg.user_name ? cfg.user_name.charAt(0).toUpperCase() : 'U';

        var contentEl = document.createElement('div');
        contentEl.className = 'dts-msg-content';

        if (fileName) {
            var chipEl = document.createElement('div');
            chipEl.className   = 'dts-file-chip';
            chipEl.textContent = '📎 ' + fileName;
            contentEl.appendChild(chipEl);
        }

        var bubbleEl = document.createElement('div');
        bubbleEl.className   = 'dts-msg-bubble';
        bubbleEl.textContent = text;
        contentEl.appendChild(bubbleEl);

        msgEl.appendChild(avatarEl);
        msgEl.appendChild(contentEl);
        container.appendChild(msgEl);
        scrollToBottom();
    }

    /* =========================================================
       VOICE CONVERSATION
       ─────────────────────────────────────────────────────────
       Uses Web Speech API:
         • SpeechRecognition  — user voice → text
         • SpeechSynthesis    — AI text → spoken response
       Voice is FULLY INDEPENDENT from the text chat:
         - maintains its own private voiceMessages history
         - never reads from or writes to the chat window
         - resets its history each time the overlay opens

       Flow:
         1. User clicks mic → overlay opens, history resets
         2. Start Listening button or auto-start
         3. User speaks; live interim transcript shown in overlay
         4. After natural pause (or 15 s max), recognition ends
         5. Text sent to AI directly (Groq → proxy → Pollinations)
         6. AI response read aloud via SpeechSynthesis
         7. Loop back to step 2 automatically
    ========================================================= */
    var voiceActive       = false;   // voice overlay is open
    var voiceListening    = false;   // recognition is running
    var voiceAiTalking    = false;   // synthesis is playing
    var voiceRecog        = null;    // SpeechRecognition instance
    var voiceSilenceTimer = null;    // max-15 s cutoff timer
    var voiceRestartTimer = null;    // debounce for auto-restart
    var VOICE_MAX_MS      = 15000;   // 15 s max per utterance
    var voiceMessages     = [];      // private voice conversation history (never shared with chat)

    /* Short system prompt variant for voice — keeps replies concise */
    var VOICE_SYSTEM = SYSTEM +
        '\n\nIMPORTANT: This is a VOICE conversation. Keep all replies ' +
        'concise (3-5 sentences max) and conversational. Avoid bullet ' +
        'lists, markdown, code blocks, and math symbols — speak in plain ' +
        'natural sentences only.';

    /* ── Bootstrap ── */
    function setupVoice() {
        var openBtn  = document.getElementById('dts-voice-btn');
        var closeBtn = document.getElementById('dts-voice-close');
        var endBtn   = document.getElementById('dts-voice-end');
        var togBtn   = document.getElementById('dts-voice-toggle');

        var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (openBtn) {
            if (!SpeechRec) {
                /* Browser does not support voice */
                openBtn.title   = 'Voice chat requires Chrome, Edge, or Safari';
                openBtn.style.opacity = '0.35';
                openBtn.style.cursor  = 'not-allowed';
                openBtn.addEventListener('click', function () {
                    alert('Voice chat is not supported in this browser.\nPlease use Chrome, Edge, or Safari.');
                });
            } else {
                openBtn.addEventListener('click', openVoiceMode);
            }
        }

        if (closeBtn) closeBtn.addEventListener('click', closeVoiceMode);
        if (endBtn)   endBtn.addEventListener('click',   closeVoiceMode);
        if (togBtn)   togBtn.addEventListener('click',   voiceToggleListen);

        /* Close on ESC */
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && voiceActive) closeVoiceMode();
        });
    }

    function openVoiceMode() {
        var overlay = document.getElementById('dts-voice-overlay');
        if (!overlay) return;
        voiceActive   = true;
        voiceMessages = [];   // fresh history each time voice opens
        overlay.style.display = 'flex';
        document.body.style.overflow = 'hidden';
        setVoiceState('idle');
        /* Auto-start listening immediately */
        setTimeout(startVoiceListening, 400);
    }

    function closeVoiceMode() {
        voiceActive = false;
        stopVoiceSpeaking();
        stopVoiceRecognition();
        clearTimeout(voiceSilenceTimer);
        clearTimeout(voiceRestartTimer);
        var overlay = document.getElementById('dts-voice-overlay');
        if (overlay) overlay.style.display = 'none';
        document.body.style.overflow = '';
        setVoiceState('closed');
    }

    function voiceToggleListen() {
        if (voiceAiTalking) {
            /* Interrupt AI speech and start listening */
            stopVoiceSpeaking();
            startVoiceListening();
        } else if (voiceListening) {
            stopVoiceRecognition();
            setVoiceState('idle');
        } else {
            startVoiceListening();
        }
    }

    /* ── Start listening (one utterance, max 15 s) ── */
    function startVoiceListening() {
        if (!voiceActive) return;
        var SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec || voiceListening) return;

        stopVoiceSpeaking();
        setVoiceState('listening');
        setVoiceTranscript('');

        var recog = new SpeechRec();
        recog.lang            = 'en-US';
        recog.continuous      = false;   /* one natural utterance */
        recog.interimResults  = true;
        recog.maxAlternatives = 1;
        voiceRecog  = recog;
        voiceListening = true;

        var finalText   = '';
        var hasSpoken   = false;

        /* 15-second hard cutoff */
        voiceSilenceTimer = setTimeout(function () {
            if (voiceListening && voiceRecog) {
                try { voiceRecog.stop(); } catch (e) {}
            }
        }, VOICE_MAX_MS);

        recog.onresult = function (e) {
            hasSpoken = true;
            finalText = '';
            var interim = '';
            for (var i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
                else                      interim   += e.results[i][0].transcript;
            }
            setVoiceTranscript(finalText || interim);
        };

        recog.onend = function () {
            clearTimeout(voiceSilenceTimer);
            voiceListening = false;
            voiceRecog     = null;
            var spoken = finalText.trim();
            if (spoken && voiceActive) {
                sendVoiceMessage(spoken);
            } else if (voiceActive && !hasSpoken) {
                /* No speech detected — restart silently */
                voiceRestartTimer = setTimeout(startVoiceListening, 600);
            } else if (voiceActive) {
                setVoiceState('idle');
            }
        };

        recog.onerror = function (e) {
            clearTimeout(voiceSilenceTimer);
            voiceListening = false;
            voiceRecog     = null;
            if (!voiceActive) return;
            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                setVoiceState('error');
                setVoiceTranscript('Microphone access denied.\nPlease allow microphone in browser settings.');
            } else if (e.error === 'no-speech') {
                voiceRestartTimer = setTimeout(startVoiceListening, 400);
            } else {
                voiceRestartTimer = setTimeout(startVoiceListening, 1000);
            }
        };

        try {
            recog.start();
        } catch (err) {
            voiceListening = false;
            voiceRecog     = null;
            voiceRestartTimer = setTimeout(startVoiceListening, 1200);
        }
    }

    function stopVoiceRecognition() {
        clearTimeout(voiceSilenceTimer);
        if (voiceRecog) {
            try { voiceRecog.abort(); } catch (e) {}
            voiceRecog = null;
        }
        voiceListening = false;
    }

    function stopVoiceSpeaking() {
        if (voiceKeepAlive)     { clearInterval(voiceKeepAlive); voiceKeepAlive = null; }
        if (currentStudioAudio) { try { currentStudioAudio.pause(); currentStudioAudio.src = ''; } catch(_) {} currentStudioAudio = null; }
        if (window.speechSynthesis) window.speechSynthesis.cancel();
        voiceAiTalking = false;
    }

    /* ── Send voice utterance to AI ── */
    /* Voice is fully independent: it maintains its own private conversation
       history (voiceMessages) and never reads from or writes to the chat.    */
    async function sendVoiceMessage(text) {
        if (!voiceActive) return;
        setVoiceState('thinking');
        setVoiceTranscript('"' + text + '"');

        /* Add to VOICE-ONLY history — chat is untouched */
        voiceMessages.push({ role: 'user', content: text });

        /* Build API payload with voice-optimised system prompt */
        var apiMessages = [{ role: 'system', content: VOICE_SYSTEM }].concat(
            voiceMessages.map(function (m) { return { role: m.role, content: m.content }; })
        );

        var response = await raceAI(apiMessages);

        if (!voiceActive) return;

        if (response) {
            voiceMessages.push({ role: 'assistant', content: response });
            /* Speak the reply directly — no chat writing at all */
            setVoiceState('speaking');
            setVoiceTranscript('');
            speakVoiceResponse(response, function () {
                if (voiceActive) {
                    voiceRestartTimer = setTimeout(startVoiceListening, 700);
                }
            });
        } else {
            /* AI failed — tell user and keep listening */
            setVoiceState('listening');
            setVoiceTranscript('Sorry, I could not get a response. Please try again.');
            voiceRestartTimer = setTimeout(function () {
                setVoiceTranscript('');
                startVoiceListening();
            }, 2500);
        }
    }

    /* ── Text-to-Speech ── */

    /* Clean text for speaking — strip markdown, math, code blocks */
    function cleanForSpeech(text) {
        return text
            .replace(/```[\s\S]*?```/g,       'code block.')
            .replace(/`([^`]+)`/g,            '$1')
            .replace(/\$\$[\s\S]+?\$\$/g,     'math expression.')
            .replace(/\$[^$\n]{1,200}\$/g,    'math expression.')
            .replace(/\*\*([^*\n]+)\*\*/g,    '$1')
            .replace(/\*([^*\n]+)\*/g,        '$1')
            .replace(/#{1,6}\s+/g,            '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g,'$1')
            .replace(/[-_]{2,}/g,             '')
            .replace(/\n{2,}/g,               ' ')
            .trim()
            .substring(0, 600);
    }

    /* Browser TTS fallback — used only if Pollinations fails */
    function speakWithBrowserFallback(spoken, onDone) {
        if (!window.speechSynthesis) { voiceAiTalking = false; if (onDone) onDone(); return; }
        window.speechSynthesis.cancel();
        function doSpeak() {
            var utter  = new SpeechSynthesisUtterance(spoken);
            utter.lang = 'en-US'; utter.rate = 1.05; utter.pitch = 1.05; utter.volume = 1.0;
            var voices = window.speechSynthesis.getVoices();
            var pick   = voices.find(function(v) {
                return v.lang.startsWith('en') && /Google|Natural|Samantha|Karen|Moira|Daniel/i.test(v.name);
            }) || voices.find(function(v) { return v.lang.startsWith('en-US'); })
               || voices.find(function(v) { return v.lang.startsWith('en'); });
            if (pick) utter.voice = pick;
            voiceAiTalking = true;
            voiceKeepAlive = setInterval(function() {
                if (!window.speechSynthesis.speaking) { clearInterval(voiceKeepAlive); voiceKeepAlive = null; }
                else { window.speechSynthesis.pause(); window.speechSynthesis.resume(); }
            }, 10000);
            utter.onend = utter.onerror = function() {
                if (voiceKeepAlive) { clearInterval(voiceKeepAlive); voiceKeepAlive = null; }
                voiceAiTalking = false; if (onDone) onDone();
            };
            if (window.speechSynthesis.paused) window.speechSynthesis.resume();
            window.speechSynthesis.speak(utter);
        }
        var vs = window.speechSynthesis.getVoices();
        if (!vs.length) {
            var h = function() { window.speechSynthesis.removeEventListener('voiceschanged', h); setTimeout(doSpeak, 120); };
            window.speechSynthesis.addEventListener('voiceschanged', h);
            setTimeout(function() { if (!voiceAiTalking) doSpeak(); }, 1500);
        } else { setTimeout(doSpeak, 120); }
    }

    function speakVoiceResponse(text, onDone) {
        var spoken = cleanForSpeech(text);

        /* Stop any ongoing speech (Pollinations audio or browser TTS) */
        if (voiceKeepAlive)     { clearInterval(voiceKeepAlive); voiceKeepAlive = null; }
        if (currentStudioAudio) { try { currentStudioAudio.pause(); currentStudioAudio.src = ''; } catch(_) {} currentStudioAudio = null; }
        if (window.speechSynthesis) window.speechSynthesis.cancel();

        voiceAiTalking = true;

        /* ── Try Pollinations neural TTS first (sounds natural/human) ─────────
           Uses OpenAI TTS voices: shimmer = warm female, onyx = deep male.
           Pick shimmer as default — friendly, clear assistant voice.         */
        var encodedText  = encodeURIComponent(spoken);
        var ttsUrl       = 'https://audio.pollinations.ai/' + encodedText +
                           '?model=openai-audio&voice=shimmer&nologo=true';

        var audio        = new Audio(ttsUrl);
        audio.volume     = 1.0;   /* max HTML5 volume */
        currentStudioAudio = audio;

        /* Boost volume via Web Audio API GainNode — allows amplification
           beyond the default 1.0 cap of the HTML5 Audio element */
        try {
            var _actx  = new (window.AudioContext || window.webkitAudioContext)();
            var _src   = _actx.createMediaElementSource(audio);
            var _gain  = _actx.createGain();
            _gain.gain.value = 2.0;   /* 2× louder */
            _src.connect(_gain);
            _gain.connect(_actx.destination);
        } catch (_gainErr) { /* fallback: plain audio.volume already set to 1.0 */ }

        /* Timeout — if Pollinations hasn't started within 7 s, fall back */
        var fallbackTimer = setTimeout(function() {
            if (!audio.paused) return; /* already playing — no fallback needed */
            audio.src = '';
            currentStudioAudio = null;
            speakWithBrowserFallback(spoken, onDone);
        }, 7000);

        audio.addEventListener('playing', function() {
            clearTimeout(fallbackTimer);
        });

        audio.addEventListener('ended', function() {
            clearTimeout(fallbackTimer);
            currentStudioAudio = null;
            voiceAiTalking     = false;
            if (onDone) onDone();
        });

        audio.addEventListener('error', function() {
            clearTimeout(fallbackTimer);
            currentStudioAudio = null;
            /* Pollinations failed — use browser TTS as backup */
            speakWithBrowserFallback(spoken, onDone);
        });

        audio.play().catch(function() {
            clearTimeout(fallbackTimer);
            currentStudioAudio = null;
            speakWithBrowserFallback(spoken, onDone);
        });
    }

    /* ── UI state helpers ── */
    function setVoiceState(state) {
        var orb      = document.getElementById('dts-voice-orb');
        var statusEl = document.getElementById('dts-voice-status');
        var togBtn   = document.getElementById('dts-voice-toggle');
        var micIcon  = document.getElementById('dts-voice-mic-icon');
        var waveIcon = document.getElementById('dts-voice-wave-icon');

        var labels = {
            idle:      'Tap "Start Listening" to begin',
            listening: 'Listening… speak now',
            thinking:  'XZILY is thinking…',
            speaking:  'XZILY is speaking…',
            error:     'Microphone error',
            closed:    ''
        };
        var togLabels = {
            idle:      'Start Listening',
            listening: 'Stop Listening',
            thinking:  'Please wait…',
            speaking:  'Interrupt',
            error:     'Retry',
            closed:    ''
        };

        if (statusEl) statusEl.textContent = labels[state] || state;
        if (orb)      orb.dataset.state    = state;
        if (togBtn)   togBtn.textContent   = togLabels[state] || state;

        /* Swap icon: mic ↔ wave */
        if (micIcon && waveIcon) {
            micIcon.style.display  = state === 'speaking' ? 'none'  : '';
            waveIcon.style.display = state === 'speaking' ? ''      : 'none';
        }
    }

    function setVoiceTranscript(text) {
        var el = document.getElementById('dts-voice-transcript');
        if (el) el.textContent = text;
    }

    /* =========================================================
       UTILITIES
    ========================================================= */
    function showTyping(show) {
        var el   = document.getElementById('dts-typing');
        var msgs = document.getElementById('dts-messages');
        if (!el) return;
        if (show) {
            /* Move indicator INSIDE the scrollable messages container
               so it appears directly below the last sent message */
            if (msgs && el.parentNode !== msgs) msgs.appendChild(el);
            el.style.display = 'flex';
            scrollToBottom();
        } else {
            el.style.display = 'none';
        }
    }
    function scrollToBottom() {
          var msgs = document.getElementById('dts-messages');
          if (!msgs) return;
          /* Add extra buffer so newest message always clears the fixed footer
             on iOS, Android, and desktop regardless of safe-area size */
          requestAnimationFrame(function () {
              msgs.scrollTop = msgs.scrollHeight + 200;
          });
      }
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

})();
