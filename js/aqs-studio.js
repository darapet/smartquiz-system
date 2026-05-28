/* aqs-studio.js — xzily AI Chat Studio
   Full replacement for the truncated file.
   Requires: aqs-groq-key.js (groqFetch / getGroqKey), marked.js, katex, highlight.js
   Optional: pdfjs-dist, mammoth (for file parsing)
*/
(function () {
    'use strict';

    /* ═══════════════════════════════════════════════════════════
       STATE
    ═══════════════════════════════════════════════════════════ */
    var currentStudioAudio = null;
    var voiceAiTalking     = false;
    var voiceRecognition   = null;
    var voiceActive        = false;
    var chatHistory        = [];       /* {role, content}[] sent to Groq */
    var conversationId     = null;
    var attachedFileText   = null;
    var attachedFileName   = null;
    var isSending          = false;

    var STORAGE_KEY = 'dts_chat_sessions';
    var ACTIVE_KEY  = 'dts_active_session';

    /* ═══════════════════════════════════════════════════════════
       SYSTEM PROMPT
    ═══════════════════════════════════════════════════════════ */
    var SYSTEM_PROMPT =
        'You are xzily AI, an intelligent learning assistant developed by Darapet Technology. ' +
        'You help students with exam preparation, math problems, science concepts, essay writing, ' +
        'and all academic subjects. Explain concepts clearly with examples, solve problems step by step, ' +
        'and generate practice questions when asked. ' +
        'Use LaTeX math formatting: $ for inline math, $$ for display math. ' +
        'Be encouraging, accurate, and thorough.';

    /* ═══════════════════════════════════════════════════════════
       UTILITIES
    ═══════════════════════════════════════════════════════════ */
    function escHtml(str) {
        return String(str || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;')
            .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    function scrollToBottom(force) {
        var msgs = document.getElementById('dts-messages');
        if (!msgs) return;
        var nearBottom = (msgs.scrollHeight - msgs.scrollTop - msgs.clientHeight) < 150;
        if (!nearBottom && !force) return;
        requestAnimationFrame(function () {
            msgs.scrollTop = msgs.scrollHeight + 200;
        });
    }

    function showTyping(show) {
        var el   = document.getElementById('dts-typing');
        var msgs = document.getElementById('dts-messages');
        if (!el) return;
        if (show) {
            if (msgs && el.parentNode !== msgs) msgs.appendChild(el);
            el.style.display = 'flex';
            scrollToBottom();
        } else {
            el.style.display = 'none';
        }
    }

    /* ═══════════════════════════════════════════════════════════
       MARKDOWN / MATH RENDERING
    ═══════════════════════════════════════════════════════════ */
    function renderMessage(text) {
        if (!text) return '';
        var html = '';
        try {
            if (typeof marked !== 'undefined') {
                marked.setOptions({ breaks: true, gfm: true });
                html = marked.parse(String(text));
            } else {
                html = escHtml(String(text)).replace(/\n/g, '<br>');
            }
        } catch (e) {
            html = escHtml(String(text)).replace(/\n/g, '<br>');
        }
        return html;
    }

    function applyMathAndHighlight(containerEl) {
        /* Syntax-highlight code blocks */
        try {
            if (typeof hljs !== 'undefined') {
                containerEl.querySelectorAll('pre code').forEach(function (block) {
                    hljs.highlightElement(block);
                });
            }
        } catch (e) {}

        /* Render KaTeX math */
        try {
            if (typeof window.renderMathInElement !== 'undefined') {
                window.renderMathInElement(containerEl, {
                    delimiters: [
                        { left: '$$', right: '$$', display: true  },
                        { left: '$',  right: '$',  display: false }
                    ],
                    throwOnError: false
                });
            }
        } catch (e) {}
    }

    /* ═══════════════════════════════════════════════════════════
       CHAT SESSION — localStorage
    ═══════════════════════════════════════════════════════════ */
    function newSession() {
        conversationId   = 'sess_' + Date.now();
        chatHistory      = [];
        attachedFileText = null;
        attachedFileName = null;
    }

    function saveSession() {
        if (!conversationId || !chatHistory.length) return;
        var sessions = loadSessions();
        var idx      = sessions.findIndex(function (s) { return s.id === conversationId; });
        var firstUser = chatHistory.find(function (m) { return m.role === 'user'; });
        var title = firstUser ? firstUser.content.slice(0, 55) : 'Chat';
        if (title.length === 55) title += '…';
        var sess = { id: conversationId, title: title, messages: chatHistory.slice(), ts: Date.now() };
        if (idx >= 0) { sessions[idx] = sess; } else { sessions.unshift(sess); }
        sessions = sessions.slice(0, 30);
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch (e) {}
        try { localStorage.setItem(ACTIVE_KEY, conversationId); } catch (e) {}
    }

    function loadSessions() {
        try {
            var raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function deleteSession(id) {
        var sessions = loadSessions().filter(function (s) { return s.id !== id; });
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions)); } catch (e) {}
    }

    /* ── Render the history sidebar list ── */
    function renderHistoryList() {
        var list  = document.getElementById('dts-history-list');
        var empty = document.getElementById('dts-history-empty');
        if (!list) return;

        /* Remove old item elements (keep the empty placeholder) */
        list.querySelectorAll('.dts-history-item').forEach(function (el) {
            el.parentNode.removeChild(el);
        });

        var sessions = loadSessions();
        if (!sessions.length) {
            if (empty) empty.style.display = '';
            return;
        }
        if (empty) empty.style.display = 'none';

        sessions.forEach(function (sess) {
            var item      = document.createElement('div');
            item.className = 'dts-history-item' + (sess.id === conversationId ? ' active' : '');
            item.dataset.id = sess.id;
            item.innerHTML =
                '<span class="dts-history-item-title">' + escHtml(sess.title) + '</span>' +
                '<button class="dts-history-item-del" data-id="' + escHtml(sess.id) + '" title="Delete">✕</button>';

            item.querySelector('.dts-history-item-del').addEventListener('click', function (e) {
                e.stopPropagation();
                deleteSession(sess.id);
                if (sess.id === conversationId) {
                    startNewChat();
                } else {
                    renderHistoryList();
                }
            });

            item.addEventListener('click', function () { loadSessionById(sess.id); });
            /* Insert before the empty placeholder */
            list.insertBefore(item, empty || null);
        });
    }

    function loadSessionById(id) {
        var sessions = loadSessions();
        var sess     = sessions.find(function (s) { return s.id === id; });
        if (!sess) return;
        conversationId = sess.id;
        chatHistory    = sess.messages.slice();

        var messages = document.getElementById('dts-messages');
        var welcome  = document.getElementById('dts-welcome');
        if (messages) messages.innerHTML = '';
        if (welcome)  welcome.style.display = 'none';

        chatHistory.forEach(function (msg) {
            if (msg.role === 'user' || msg.role === 'assistant') {
                appendMessage(msg.role, msg.content);
            }
        });

        renderHistoryList();
        scrollToBottom(true);
    }

    function startNewChat() {
        newSession();
        var messages = document.getElementById('dts-messages');
        var welcome  = document.getElementById('dts-welcome');
        if (messages) messages.innerHTML = '';
        if (welcome)  welcome.style.display = 'flex';
        clearFileAttachment();
        renderHistoryList();
    }

    /* ═══════════════════════════════════════════════════════════
       MESSAGE RENDERING
    ═══════════════════════════════════════════════════════════ */
    function appendMessage(role, content) {
        var messages = document.getElementById('dts-messages');
        if (!messages) return;

        var welcome = document.getElementById('dts-welcome');
        if (welcome) welcome.style.display = 'none';

        var wrap = document.createElement('div');
        wrap.className = 'dts-message dts-' + (role === 'user' ? 'user' : 'ai');

        var avatarLetter = role === 'user' ? 'U' : '✦';
        var bubbleHtml   = role === 'user'
            ? escHtml(content)
            : renderMessage(content);

        wrap.innerHTML =
            '<div class="dts-msg-avatar">' + avatarLetter + '</div>' +
            '<div class="dts-msg-content">' +
              '<div class="dts-msg-bubble">' + bubbleHtml + '</div>' +
            '</div>';

        if (role === 'assistant') {
            applyMathAndHighlight(wrap);
        }

        messages.appendChild(wrap);
        scrollToBottom();
        return wrap;
    }

    /* ═══════════════════════════════════════════════════════════
       SEND MESSAGE — calls Groq
    ═══════════════════════════════════════════════════════════ */
    function sendMessage(text) {
        text = (text || '').trim();
        if (!text && !attachedFileText) return;
        if (isSending) return;

        isSending = true;
        setSendState(true);

        /* Build user content */
        var userContent = text;
        if (attachedFileText) {
            userContent = (text ? text + '\n\n' : 'Please analyse this file:\n\n') +
                'File: ' + escHtml(attachedFileName || 'attachment') + '\n```\n' +
                attachedFileText.slice(0, 8000) + '\n```';
        }

        clearFileAttachment();

        chatHistory.push({ role: 'user', content: userContent });
        appendMessage('user', userContent);

        var input = document.getElementById('dts-input');
        if (input) { input.value = ''; input.style.height = 'auto'; }

        showTyping(true);

        var messages = [{ role: 'system', content: SYSTEM_PROMPT }].concat(chatHistory);

        if (typeof window.groqFetch !== 'function') {
            showTyping(false);
            appendMessage('assistant', '⚠️ API not ready yet. Please wait a moment and try again.');
            isSending = false;
            setSendState(false);
            return;
        }

        window.groqFetch({
            model:       'llama-3.3-70b-versatile',
            messages:    messages,
            max_tokens:  2048,
            temperature: 0.7
        }).then(function (res) {
            return res.json();
        }).then(function (data) {
            showTyping(false);
            if (data.error) {
                var errMsg = data.error.message || 'API error.';
                /* Key-specific hints */
                if (errMsg.indexOf('401') !== -1 || errMsg.indexOf('invalid_api_key') !== -1) {
                    errMsg += ' — Your Groq API key may be invalid or missing.';
                } else if (errMsg.indexOf('429') !== -1) {
                    errMsg += ' — Rate limit reached. Try again in a moment.';
                }
                appendMessage('assistant', '⚠️ ' + errMsg);
            } else {
                var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
                    ? data.choices[0].message.content
                    : 'Sorry, I could not generate a response. Please try again.';
                chatHistory.push({ role: 'assistant', content: reply });
                appendMessage('assistant', reply);
                saveSession();
                renderHistoryList();

                /* Detect quiz-like content */
                if (/\n\s*[A-D][.)]\s/i.test(reply) && /\d+[.)]\s/.test(reply)) {
                    showQuizImportBar(reply);
                }
            }
            isSending = false;
            setSendState(false);
        }).catch(function (err) {
            showTyping(false);
            appendMessage('assistant', '⚠️ Connection error. Please check your internet and try again.');
            console.error('[dts] Groq error:', err);
            isSending = false;
            setSendState(false);
        });
    }

    function setSendState(busy) {
        var btn = document.getElementById('dts-send');
        if (btn) btn.disabled = busy;
    }

    /* ═══════════════════════════════════════════════════════════
       QUIZ IMPORT BAR
    ═══════════════════════════════════════════════════════════ */
    function showQuizImportBar(content) {
        var old = document.getElementById('dts-quiz-import-bar');
        if (old) old.parentNode.removeChild(old);

        var bar = document.createElement('div');
        bar.id = 'dts-quiz-import-bar';
        bar.className = 'dts-quiz-import-bar';
        bar.innerHTML =
            '<span class="dts-quiz-import-info">📝 Quiz questions detected!</span>' +
            '<button class="dts-create-quiz-btn" id="dts-go-create-quiz">Create Quiz →</button>';

        bar.querySelector('#dts-go-create-quiz').addEventListener('click', function () {
            try { sessionStorage.setItem('dts_quiz_content', content.slice(0, 5000)); } catch (e) {}
            var cfg = window.DTS_CONFIG || {};
            window.location.href = cfg.create_url || 'create-quiz.html';
        });

        var msgs = document.getElementById('dts-messages');
        if (msgs) msgs.appendChild(bar);
        scrollToBottom();
    }

    /* ═══════════════════════════════════════════════════════════
       FILE ATTACHMENT
    ═══════════════════════════════════════════════════════════ */
    function clearFileAttachment() {
        attachedFileText = null;
        attachedFileName = null;
        var status = document.getElementById('dts-file-status');
        if (status) { status.style.display = 'none'; status.textContent = ''; }
        var fi = document.getElementById('dts-file-input');
        if (fi) fi.value = '';
    }

    function handleFileAttach(file) {
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { alert('File is too large. Maximum 10 MB.'); return; }

        var name  = file.name;
        var ext   = name.split('.').pop().toLowerCase();
        var setStatus = function (txt) {
            var s = document.getElementById('dts-file-status');
            if (s) { s.style.display = ''; s.textContent = txt; }
        };

        /* PDF */
        if (ext === 'pdf') {
            if (typeof window.pdfjsLib === 'undefined') {
                setStatus('📎 ' + name + ' (parser loading…)');
                setTimeout(function () { handleFileAttach(file); }, 1800);
                return;
            }
            setStatus('📎 Reading PDF…');
            var r1 = new FileReader();
            r1.onload = function (e) {
                window.pdfjsLib.getDocument({ data: e.target.result }).promise.then(function (pdf) {
                    var texts = [], done = 0, total = pdf.numPages;
                    for (var p = 1; p <= total; p++) {
                        (function (pn) {
                            pdf.getPage(pn).then(function (pg) {
                                return pg.getTextContent();
                            }).then(function (tc) {
                                texts[pn - 1] = tc.items.map(function (i) { return i.str; }).join(' ');
                                done++;
                                if (done === total) {
                                    attachedFileText = texts.join('\n\n');
                                    attachedFileName = name;
                                    setStatus('📎 ' + name + ' attached (' + total + ' pages)');
                                }
                            });
                        })(p);
                    }
                }).catch(function () { setStatus('❌ Could not read PDF'); });
            };
            r1.readAsArrayBuffer(file);
            return;
        }

        /* DOCX */
        if (ext === 'docx' || ext === 'doc') {
            if (typeof mammoth === 'undefined') {
                setStatus('📎 ' + name + ' (parser loading…)');
                setTimeout(function () { handleFileAttach(file); }, 1800);
                return;
            }
            setStatus('📎 Reading document…');
            var r2 = new FileReader();
            r2.onload = function (e) {
                mammoth.extractRawText({ arrayBuffer: e.target.result }).then(function (result) {
                    attachedFileText = result.value;
                    attachedFileName = name;
                    setStatus('📎 ' + name + ' attached');
                }).catch(function () { setStatus('❌ Could not read document'); });
            };
            r2.readAsArrayBuffer(file);
            return;
        }

        /* Plain text: txt, md, csv, json, etc. */
        var r3 = new FileReader();
        r3.onload = function (e) {
            attachedFileText = e.target.result;
            attachedFileName = name;
            setStatus('📎 ' + name + ' attached');
        };
        r3.onerror = function () { setStatus('❌ Could not read file'); };
        r3.readAsText(file);
    }

    /* ═══════════════════════════════════════════════════════════
       VOICE MODE
    ═══════════════════════════════════════════════════════════ */
    function openVoiceModal() {
        var overlay = document.getElementById('dts-voice-overlay');
        if (overlay) overlay.style.display = 'flex';
        setVoiceState('idle');
        voiceActive = true;
    }

    function closeVoiceModal() {
        stopVoiceListening();
        stopAiSpeech();
        var overlay = document.getElementById('dts-voice-overlay');
        if (overlay) overlay.style.display = 'none';
        setVoiceState('closed');
        voiceActive = false;
    }

    function stopVoiceListening() {
        if (voiceRecognition) {
            try { voiceRecognition.abort(); } catch (e) {}
            voiceRecognition = null;
        }
    }

    function stopAiSpeech() {
        voiceAiTalking = false;
        if (currentStudioAudio) {
            try { currentStudioAudio.pause(); } catch (e) {}
            currentStudioAudio = null;
        }
        if (typeof window.speechSynthesis !== 'undefined') {
            window.speechSynthesis.cancel();
        }
    }

    function startVoiceListening() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setVoiceState('error');
            setVoiceTranscript('Speech recognition is not supported in this browser. Try Chrome or Edge.');
            return;
        }
        stopVoiceListening();
        var rec = new SR();
        rec.continuous    = false;
        rec.interimResults = true;
        rec.lang          = 'en-US';
        voiceRecognition  = rec;
        setVoiceState('listening');
        setVoiceTranscript('Listening…');

        rec.onresult = function (e) {
            var transcript = '';
            for (var i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            setVoiceTranscript(transcript);
            if (e.results[e.results.length - 1].isFinal && transcript.trim()) {
                rec.stop();
                setVoiceState('thinking');
                handleVoiceInput(transcript.trim());
            }
        };

        rec.onerror = function (e) {
            setVoiceState('error');
            setVoiceTranscript('Mic error: ' + (e.error || 'unknown'));
        };

        try { rec.start(); } catch (e) {
            setVoiceState('error');
            setVoiceTranscript('Could not access microphone: ' + e.message);
        }
    }

    function handleVoiceInput(text) {
        chatHistory.push({ role: 'user', content: text });
        appendMessage('user', text);
        showTyping(true);

        if (typeof window.groqFetch !== 'function') {
            showTyping(false);
            setVoiceState('error');
            setVoiceTranscript('API not available.');
            return;
        }

        var messages = [{ role: 'system', content: SYSTEM_PROMPT }].concat(chatHistory);

        window.groqFetch({
            model: 'llama-3.1-8b-instant', messages: messages, max_tokens: 512, temperature: 0.7
        }).then(function (r) { return r.json(); }).then(function (data) {
            showTyping(false);
            if (data.error || !data.choices) {
                setVoiceState('idle');
                setVoiceTranscript('Could not get response.');
                return;
            }
            var reply = data.choices[0].message.content;
            chatHistory.push({ role: 'assistant', content: reply });
            appendMessage('assistant', reply);
            saveSession();
            renderHistoryList();

            /* Speak reply (strip markdown for TTS) */
            var spoken = reply
                .replace(/```[\s\S]*?```/g, 'code block.')
                .replace(/`[^`]+`/g, '')
                .replace(/[*_#>\[\]]/g, '')
                .trim()
                .slice(0, 600);

            setVoiceState('speaking');
            setVoiceTranscript('');
            voiceAiTalking = true;
            speakStudioChunked(spoken, function () {
                if (voiceActive) setVoiceState('idle');
            });
        }).catch(function () {
            showTyping(false);
            setVoiceState('error');
            setVoiceTranscript('Connection error.');
        });
    }

    /* ── UI helpers for voice modal ── */
    function setVoiceState(state) {
        var orb      = document.getElementById('dts-voice-orb');
        var statusEl = document.getElementById('dts-voice-status');
        var togBtn   = document.getElementById('dts-voice-toggle');
        var micIcon  = document.getElementById('dts-voice-mic-icon');
        var waveIcon = document.getElementById('dts-voice-wave-icon');

        var labels    = { idle: 'Tap "Start Listening" to begin', listening: 'Listening… speak now', thinking: 'XZILY is thinking…', speaking: 'XZILY is speaking…', error: 'Microphone error', closed: '' };
        var togLabels = { idle: 'Start Listening', listening: 'Stop Listening', thinking: 'Please wait…', speaking: 'Interrupt', error: 'Retry', closed: '' };

        if (statusEl) statusEl.textContent = labels[state]    || state;
        if (orb)      orb.dataset.state    = state;
        if (togBtn)   togBtn.textContent   = togLabels[state] || state;

        if (micIcon && waveIcon) {
            micIcon.style.display  = state === 'speaking' ? 'none' : '';
            waveIcon.style.display = state === 'speaking' ? ''     : 'none';
        }
    }

    function setVoiceTranscript(text) {
        var el = document.getElementById('dts-voice-transcript');
        if (el) el.textContent = text;
    }

    /* ═══════════════════════════════════════════════════════════
       TTS — CHUNKED PLAYBACK (Pollinations audio API)
    ═══════════════════════════════════════════════════════════ */
    function splitSpeechChunks(text, maxLen) {
        var sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
        var chunks = [], current = '';
        sentences.forEach(function (s) {
            if ((current + s).length > maxLen && current) {
                chunks.push(current.trim());
                current = s;
            } else {
                current += s;
            }
        });
        if (current.trim()) chunks.push(current.trim());
        return chunks.filter(function (c) { return c.length > 0; });
    }

    function fetchStudioAudioBlob(text, voices, timeout) {
        var voice = (voices && voices[0]) || 'onyx';
        var url   = 'https://audio.pollinations.ai/tts?text=' + encodeURIComponent(text) +
                    '&voice=' + encodeURIComponent(voice) + '&model=openai-audio';
        return new Promise(function (resolve, reject) {
            var ctrl  = new AbortController();
            var timer = setTimeout(function () { ctrl.abort(); reject(new Error('timeout')); }, timeout || 12000);
            fetch(url, { signal: ctrl.signal })
                .then(function (r) { clearTimeout(timer); if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); })
                .then(resolve)
                .catch(function (e) { clearTimeout(timer); reject(e); });
        });
    }

    function speakWithBrowserFallback(text, onDone) {
        if (typeof window.speechSynthesis === 'undefined') { if (onDone) onDone(); return; }
        var utt   = new SpeechSynthesisUtterance(text);
        utt.rate  = 1.0;
        utt.onend = utt.onerror = function () { if (onDone) onDone(); };
        window.speechSynthesis.speak(utt);
    }

    /* NOTE: speakStudioChunked uses currentStudioAudio and voiceAiTalking from
       the closure above — the rest of the function body is already in this file
       starting right below. The original truncated file only contained this
       function's body; the full version is included here. */
    function speakStudioChunked(spoken, onDone) {
        /* Gracefully handle the edge case where the spoken text is empty
           (e.g. because of a mid-sentence network timeout)             */
        var chunks    = splitSpeechChunks(spoken, 200);
        var idx       = 0;
        var doneCalled = false;

        function finish() {
            if (doneCalled) return; doneCalled = true;
            currentStudioAudio = null;
            voiceAiTalking     = false;
            if (onDone) onDone();
        }

        function fallbackRemaining() {
            if (!voiceAiTalking) { finish(); return; }
            var remaining = chunks.slice(idx - 1).join(' ');
            if (!remaining.trim()) { finish(); return; }
            fetchStudioAudioBlob(remaining.slice(0, 400), ['onyx', 'echo', 'shimmer'], 10000)
                .then(function (blob) {
                    if (!voiceAiTalking) { finish(); return; }
                    var blobUrl = URL.createObjectURL(blob);
                    var audio2  = new Audio();
                    audio2.setAttribute('playsinline', '');
                    audio2.src  = blobUrl;
                    audio2.addEventListener('ended', function () {
                        try { URL.revokeObjectURL(blobUrl); } catch (_) {}
                        idx = chunks.length;
                        finish();
                    });
                    audio2.addEventListener('error', function () {
                        try { URL.revokeObjectURL(blobUrl); } catch (_) {}
                        speakWithBrowserFallback(remaining, finish);
                    });
                    audio2.play().catch(function () {
                        try { URL.revokeObjectURL(blobUrl); } catch (_) {}
                        speakWithBrowserFallback(remaining, finish);
                    });
                })
                .catch(function () { speakWithBrowserFallback(remaining, finish); });
        }

        function playNext() {
            if (!voiceAiTalking || idx >= chunks.length) { finish(); return; }
            var chunk = chunks[idx++];

            fetchStudioAudioBlob(chunk, ['onyx', 'echo', 'shimmer'], 14000)
                .then(function (blob) {
                    if (!voiceAiTalking) { finish(); return; }

                    var typedBlob = new Blob([blob], { type: 'audio/mpeg' });
                    var blobUrl   = URL.createObjectURL(typedBlob);
                    var audio     = new Audio();
                    audio.setAttribute('playsinline', '');
                    audio.setAttribute('webkit-playsinline', '');
                    audio.preload  = 'auto';
                    audio.volume   = 1.0;
                    audio.src      = blobUrl;
                    currentStudioAudio = audio;

                    var stallTimer  = null;
                    var cleaned     = false;
                    var lastCurTime = -1;

                    function cleanup() {
                        if (cleaned) return; cleaned = true;
                        clearTimeout(stallTimer);
                        clearTimeout(hardCap);
                        try { URL.revokeObjectURL(blobUrl); } catch (_) {}
                        currentStudioAudio = null;
                    }

                    var hardCap = setTimeout(function () {
                        if (!cleaned) { cleanup(); playNext(); }
                    }, 60 * 60 * 1000);

                    function armStallTimer() {
                        clearTimeout(stallTimer);
                        stallTimer = setTimeout(function () {
                            if (cleaned) return;
                            if (audio.currentTime > lastCurTime) {
                                lastCurTime = audio.currentTime;
                                armStallTimer();
                            } else {
                                clearTimeout(hardCap);
                                cleanup();
                                playNext();
                            }
                        }, 4000);
                    }

                    audio.addEventListener('timeupdate', function () {
                        lastCurTime = audio.currentTime;
                        armStallTimer();
                    });
                    audio.addEventListener('canplay', function () {
                        if (lastCurTime < 0) armStallTimer();
                    });
                    audio.addEventListener('ended', function () {
                        clearTimeout(hardCap);
                        cleanup();
                        playNext();
                    });
                    audio.addEventListener('error', function () {
                        clearTimeout(hardCap);
                        cleanup();
                        fallbackRemaining();
                    });

                    audio.play().catch(function () {
                        setTimeout(function () {
                            if (!voiceAiTalking) { clearTimeout(hardCap); cleanup(); finish(); return; }
                            audio.play().catch(function () {
                                clearTimeout(hardCap);
                                cleanup();
                                fallbackRemaining();
                            });
                        }, 400);
                    });
                })
                .catch(function () {
                    if (!voiceAiTalking) { finish(); return; }
                    fallbackRemaining();
                });
        }

        playNext();
    }

    /* ═══════════════════════════════════════════════════════════
       DOM INITIALISATION
    ═══════════════════════════════════════════════════════════ */
    document.addEventListener('DOMContentLoaded', function () {

        /* Start a fresh session */
        newSession();
        renderHistoryList();

        /* ── Auto-resize textarea ── */
        var inputEl = document.getElementById('dts-input');
        if (inputEl) {
            inputEl.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            });

            /* Enter = send (Shift+Enter = new line) */
            inputEl.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    doSend();
                }
            });
        }

        /* ── Send button ── */
        var sendBtn = document.getElementById('dts-send');
        if (sendBtn) {
            sendBtn.addEventListener('click', function () { doSend(); });
        }

        function doSend() {
            var val = inputEl ? inputEl.value : '';
            sendMessage(val);
        }

        /* ── Suggestion buttons ── */
        document.querySelectorAll('.dts-suggestion-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var prompt = this.dataset.prompt || this.textContent.trim();
                if (inputEl) inputEl.value = prompt;
                sendMessage(prompt);
            });
        });

        /* ── New chat button ── */
        var newChatBtn = document.getElementById('dts-new-chat');
        if (newChatBtn) {
            newChatBtn.addEventListener('click', function () { startNewChat(); });
        }

        /* ── History panel toggle ── */
        var historyToggle = document.getElementById('dts-history-toggle');
        var historyPanel  = document.getElementById('dts-history-panel');
        var historyCaret  = document.getElementById('dts-history-caret');
        if (historyToggle && historyPanel) {
            historyToggle.addEventListener('click', function () {
                var open = historyPanel.style.display !== 'none' && historyPanel.style.display !== '';
                historyPanel.style.display = open ? 'none' : '';
                if (historyCaret) historyCaret.textContent = open ? '▸' : '▾';
            });
        }

        /* ── File input ── */
        var fileInput = document.getElementById('dts-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                if (this.files && this.files[0]) handleFileAttach(this.files[0]);
            });
        }

        /* ── Voice button (opens modal) ── */
        var voiceBtn = document.getElementById('dts-voice-btn');
        if (voiceBtn) {
            voiceBtn.addEventListener('click', function () { openVoiceModal(); });
        }

        /* ── Voice modal: close ── */
        var voiceClose = document.getElementById('dts-voice-close');
        if (voiceClose) {
            voiceClose.addEventListener('click', function () { closeVoiceModal(); });
        }

        /* ── Voice modal: start/stop/interrupt toggle ── */
        var voiceToggle = document.getElementById('dts-voice-toggle');
        if (voiceToggle) {
            voiceToggle.addEventListener('click', function () {
                var orb = document.getElementById('dts-voice-orb');
                var state = orb ? orb.dataset.state : 'idle';
                if (state === 'idle' || state === 'error') {
                    startVoiceListening();
                } else if (state === 'listening') {
                    stopVoiceListening();
                    setVoiceState('idle');
                } else if (state === 'speaking') {
                    stopAiSpeech();
                    setVoiceState('idle');
                }
            });
        }

        /* ── Voice modal: end conversation ── */
        var voiceEnd = document.getElementById('dts-voice-end');
        if (voiceEnd) {
            voiceEnd.addEventListener('click', function () { closeVoiceModal(); });
        }

        /* ── Close voice overlay on backdrop click ── */
        var voiceOverlay = document.getElementById('dts-voice-overlay');
        if (voiceOverlay) {
            voiceOverlay.addEventListener('click', function (e) {
                if (e.target === voiceOverlay) closeVoiceModal();
            });
        }

        /* ── Restore last active session (optional) ── */
        try {
            var lastId = localStorage.getItem(ACTIVE_KEY);
            if (lastId) {
                var sessions = loadSessions();
                if (sessions.some(function (s) { return s.id === lastId; })) {
                    /* Comment out the next line if you prefer to always start fresh */
                    /* loadSessionById(lastId); */
                }
            }
        } catch (e) {}

    }); /* end DOMContentLoaded */

})();
