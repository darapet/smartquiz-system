/* aqs-studio.js — xzily AI Chat Studio v2
   Developed by Omomo Excellence in corporation with Darapet Technology
   Powered by Groq LLaMA-3.3 + Real-time Web Search (DuckDuckGo + Jina AI Reader)
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
    var chatHistory        = [];
    var conversationId     = null;
    var attachedFileText   = null;
    var attachedFileName   = null;
    var isSending          = false;

    var STORAGE_KEY = 'dts_chat_sessions';
    var ACTIVE_KEY  = 'dts_active_session';

    /* ═══════════════════════════════════════════════════════════
       SYSTEM PROMPT — Professional General AI
    ═══════════════════════════════════════════════════════════ */
    var TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    var SYSTEM_PROMPT =
        'You are XZILY AI, a world-class professional AI assistant developed by Darapet Technology. ' +
        'You are highly intelligent, accurate, and comprehensive — equivalent in capability to GPT-4 and Claude. ' +
        'Today\'s date is ' + TODAY + '. ' +

        '\n\n## LANGUAGE & TONE RULES:' +
        '\n- MIRROR THE USER\'S LANGUAGE AND TONE completely — this is your single most important communication rule.' +
        '\n- Detect the user\'s language from their message and reply in that SAME language.' +
        '\n\n### Nigerian Languages & Dialects — respond natively if detected:' +
        '\n- Nigerian Pidgin English: "abeg", "wetin", "how e dey", "oya", "wahala", "na so" → reply in full Pidgin' +
        '\n- Yoruba: "bawo ni", "se o wa", "eku ojumo", "mo fe", "se e gbo" → reply fully in Yoruba' +
        '\n- Igbo: "kedu", "i nwere ike", "nnoo", "gwa m", "ka anyi" → reply fully in Igbo' +
        '\n- Hausa: "yaya dai", "sannu", "ina kwana", "me kike", "don Allah" → reply fully in Hausa' +
        '\n- Efik/Ibibio: "mfon", "odudu", "ami" → reply in Efik/Ibibio' +
        '\n- Ijaw: "wo", "egbesu" → reply in Ijaw' +
        '\n\n### Other African Languages — respond natively if detected:' +
        '\n- Twi (Ghana): "ɛte sɛn", "medaase", "akwaaba" → reply in Twi' +
        '\n- Swahili: "habari", "asante", "karibu", "mambo" → reply in Swahili' +
        '\n- Amharic: respond in Amharic if detected' +
        '\n- Zulu/Xhosa: respond in Zulu or Xhosa if detected' +
        '\n- French (West Africa): reply in French if user writes in French' +
        '\n\n### Tone matching:' +
        '\n- Casual/informal in any language → match that casual energy' +
        '\n- Formal in any language → be formal and structured' +
        '\n- Mix of English + dialect (code-switching) → match that same code-switching style' +
        '\n- NEVER force formal standard English on a casual user — it feels cold and robotic.' +
        '\n- The ONLY exception: financial data, rates, and factual information must always be clearly formatted and accurate, regardless of tone.' +

        '\n\n## YOUR CAPABILITIES:' +
        '\n- Deep expertise across ALL subjects: science, technology, medicine, law, finance, economics, engineering, history, arts, literature, and business.' +
        '\n- Real-time web awareness: when web search results or page content are provided, analyze them thoroughly and give accurate, up-to-date answers.' +
        '\n- Professional writing: emails, reports, legal documents, business proposals, marketing copy, code, essays, and creative writing.' +
        '\n- Advanced reasoning: complex problem-solving, analysis, strategy, research summaries, and data interpretation.' +
        '\n- Academic support: exam preparation, tutoring, step-by-step problem solving, and practice questions at all levels.' +
        '\n- Technical expertise: code in any programming language, debugging, architecture design, DevOps, and system design.' +

        '\n\n## RESPONSE FORMAT RULES:' +
        '\n- Structure every response with appropriate headers, bullet points, numbered lists, or tables — whichever improves clarity.' +
        '\n- Be thorough and comprehensive. A good response fully answers the question and provides useful context.' +
        '\n- Use LaTeX math notation where relevant: $ for inline math, $$ for display math.' +
        '\n- Always cite web search results when they are provided in the context.' +
        '\n- Be direct, confident, and honest. If information is uncertain or potentially outdated, clearly say so.' +
        '\n- Never refuse reasonable requests. Handle sensitive topics with balanced, factual professionalism.' +

        '\n\n## FINANCIAL & CURRENCY QUESTIONS (e.g. Dollar rate, exchange rates, crypto, stock prices):' +
        '\n- When asked about exchange rates (e.g. USD to NGN, dollar to naira), always provide a COMPREHENSIVE response including:' +
        '\n  1. The current rate figure (clearly labelled with the currency pair, e.g. "USD/NGN")' +
        '\n  2. The type of rate: official CBN rate vs. parallel market (black market) rate — explain the difference if relevant' +
        '\n  3. A brief note on recent trend (rising, falling, stable) if the web data includes it' +
        '\n  4. A data source citation and note that live rates fluctuate and users should verify with their bank or a live platform' +
        '\n  5. Practical advice: where to get the best rate (banks, BDC, fintech apps like Wise, Remitly, etc.)' +
        '\n- NEVER give just a bare number without context. Always explain what it means.' +
        '\n- If web search data is not available or is stale, clearly state: "Based on my last available data as of [date]..." and recommend the user check a live source such as CBN.gov.ng, Wise.com, or Google Finance.' +

        '\n\n## EXAMPLE OF BAD vs. GOOD RESPONSE (for financial/data questions):' +
        '\n- BAD: Just giving a bare number with no context — "1,580" with nothing else.' +
        '\n- GOOD: "## USD to NGN Exchange Rate\\n\\nAs of today, the exchange rates are as follows:\\n\\n| Rate Type | Rate |\\n|---|---|\\n| CBN Official Rate | ₦1,580/USD (approx.) |\\n| Parallel Market Rate | ₦1,620–₦1,640/USD (approx.) |\\n\\n**Note:** The Nigerian naira has experienced significant volatility. The rates above are indicative and may have changed. Always verify with your bank or a live platform such as [Wise](https://wise.com), [Remitly](https://remitly.com), or [CBN](https://cbn.gov.ng) for the most accurate current figure."';
    /* ═══════════════════════════════════════════════════════════
       WEB SEARCH & BROWSING ENGINE
    ═══════════════════════════════════════════════════════════ */

    /* Detect if the query needs live web data */
    function detectSearchNeeds(text) {
        var t = text.toLowerCase();

        /* Explicit URL → fetch that page */
        var urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
        if (urlMatch) return { type: 'url', url: urlMatch[0] };

        /* Domain without protocol */
        var domainMatch = text.match(/\b(www\.[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
        if (domainMatch) return { type: 'url', url: 'https://' + domainMatch[1] };

        /* News / real-time / current events triggers */
        if (/\b(latest|breaking|news|today|tonight|this week|this month|this year|current|right now|live|trending|happening|just happened|recently|new release|update|announcement|price|stock|weather|score|match|result|election|rate|exchange rate|usd|naira|dollar|nasd|crypto|bitcoin|ethereum)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        /* "Search for / look up / find / check" explicit commands */
        if (/\b(search|look up|look for|find out|check|browse|visit|open|go to|show me|tell me about)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        /* Questions about specific people, companies, products */
        if (/\b(who is|what is|where is|when did|when was|how much|how many|tell me about|what happened to|what does .* do|who owns|who runs|ceo|president|governor|minister|founded|released|launched)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        return null;
    }

    /* ── Web page fetcher — tries 3 methods in sequence ── */

    /* Helper: quick fetch with timeout */
    function timedFetch(url, opts, ms) {
        var ctrl  = new AbortController();
        var timer = setTimeout(function () { ctrl.abort(); }, ms || 18000);
        return fetch(url, Object.assign({ signal: ctrl.signal }, opts || {}))
            .finally(function () { clearTimeout(timer); });
    }

    /* Method 1 — Jina AI Reader (best quality, extracts clean article text) */
    async function fetchViaJina(url) {
        try {
            var res = await timedFetch(
                'https://r.jina.ai/' + encodeURIComponent(url),
                { headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text', 'X-Timeout': '15' } },
                20000
            );
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var text = await res.text();
            if (text && text.trim().length > 100) return text.trim().slice(0, 5000);
            return null;
        } catch (e) { return null; }
    }

    /* Method 2 — AllOrigins CORS proxy (fetches raw HTML, extracts visible text) */
    async function fetchViaAllOrigins(url) {
        try {
            var apiUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
            var res    = await timedFetch(apiUrl, {}, 18000);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data   = await res.json();
            var html   = (data && data.contents) || '';
            if (!html) return null;
            /* Strip scripts, styles and tags — keep visible text */
            var text = html
                .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (text.length > 200) return text.slice(0, 5000);
            return null;
        } catch (e) { return null; }
    }

    /* Method 3 — corsproxy.io (another free open CORS proxy) */
    async function fetchViaCorsProxy(url) {
        try {
            var proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
            var res      = await timedFetch(proxyUrl, {}, 18000);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var html = await res.text();
            if (!html) return null;
            var text = html
                .replace(/<script[\s\S]*?<\/script>/gi, ' ')
                .replace(/<style[\s\S]*?<\/style>/gi, ' ')
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
                .replace(/\s{2,}/g, ' ')
                .trim();
            if (text.length > 200) return text.slice(0, 5000);
            return null;
        } catch (e) { return null; }
    }

    /* Master fetchWebPage — tries Jina → AllOrigins → corsproxy.io */
    async function fetchWebPage(url) {
        var result;
        result = await fetchViaJina(url);
        if (result) return result;
        result = await fetchViaAllOrigins(url);
        if (result) return result;
        result = await fetchViaCorsProxy(url);
        return result;
    }

    /* Search DuckDuckGo Instant Answer API — FREE, no key needed */
    async function searchDuckDuckGo(query) {
        try {
            var url  = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) +
                       '&format=json&no_html=1&skip_disambig=1&no_redirect=1';
            var ctrl = new AbortController();
            var timer = setTimeout(function () { ctrl.abort(); }, 12000);
            var res  = await fetch(url, { signal: ctrl.signal });
            clearTimeout(timer);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();

            var parts = [];

            if (data.AbstractText) parts.push(data.AbstractText);
            if (data.Answer)       parts.push('Answer: ' + data.Answer);
            if (data.Definition)   parts.push('Definition: ' + data.Definition);

            /* Related topics */
            if (data.RelatedTopics && data.RelatedTopics.length) {
                var topics = data.RelatedTopics.slice(0, 5).map(function (t) {
                    return t.Text || (t.Topics && t.Topics[0] && t.Topics[0].Text) || '';
                }).filter(Boolean);
                if (topics.length) parts.push('Related:\n' + topics.join('\n'));
            }

            /* Infobox */
            if (data.Infobox && data.Infobox.content && data.Infobox.content.length) {
                var info = data.Infobox.content.slice(0, 8).map(function (item) {
                    return item.label + ': ' + item.value;
                }).join('\n');
                parts.push('Info:\n' + info);
            }

            if (data.AbstractURL) parts.push('Source: ' + data.AbstractURL);

            return parts.join('\n\n').trim() || null;
        } catch (e) {
            return null;
        }
    }

    /* Wikipedia direct summary (by exact title guess) */
    async function searchWikipedia(query) {
        try {
            var title = query.trim().replace(/\s+/g, '_');
            var url   = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
            var res   = await timedFetch(url, {}, 10000);
            if (!res.ok) return null;
            var data  = await res.json();
            if (data.extract && data.extract.length > 50) {
                return data.extract + (data.content_urls ? '\nSource: ' + data.content_urls.desktop.page : '');
            }
            return null;
        } catch (e) { return null; }
    }

    /* Master search: DuckDuckGo → Wikipedia full-text search → Wikipedia direct → nothing */
    async function performWebSearch(query) {
        /* 1. DuckDuckGo instant answers */
        var ddg = await searchDuckDuckGo(query);
        if (ddg && ddg.length > 80) return { source: 'DuckDuckGo', content: ddg };

        /* Clean query for Wikipedia */
        var wikiQ = query
            .replace(/\b(latest|news|what is|who is|who are|tell me about|search for|find|current|today|abeg|please|help me with)\b/gi, '')
            .replace(/[?!.,]/g, '')
            .trim();

        if (wikiQ.length > 3) {
            /* 2. Wikipedia full-text search (most reliable) */
            var wikiSearch = await searchWikipediaFullText(wikiQ);
            if (wikiSearch) return { source: 'Wikipedia', content: wikiSearch };

            /* 3. Wikipedia direct title lookup */
            var wikiDirect = await searchWikipedia(wikiQ);
            if (wikiDirect) return { source: 'Wikipedia', content: wikiDirect };
        }

        return null;
    }

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

    function showTyping(show, statusText) {
        var el   = document.getElementById('dts-typing');
        var msgs = document.getElementById('dts-messages');
        if (!el) return;
        if (show) {
            /* Update status text if provided */
            if (statusText) {
                var span = el.querySelector('span');
                if (span) span.textContent = statusText;
            }
            if (msgs) msgs.appendChild(el);
            el.style.display = 'flex';
            scrollToBottom();
        } else {
            /* Reset text */
            var span2 = el.querySelector('span');
            if (span2) span2.textContent = 'xzily AI is thinking\u2026';
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
        try {
            if (typeof hljs !== 'undefined') {
                containerEl.querySelectorAll('pre code').forEach(function (block) {
                    hljs.highlightElement(block);
                });
            }
        } catch (e) {}
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
        if (title.length === 55) title += '\u2026';
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

    function renderHistoryList() {
        var list  = document.getElementById('dts-history-list');
        var empty = document.getElementById('dts-history-empty');
        if (!list) return;

        list.querySelectorAll('.dts-drawer-item').forEach(function (el) {
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
            item.className = 'dts-drawer-item' + (sess.id === conversationId ? ' active' : '');
            item.dataset.id = sess.id;
            item.innerHTML =
                '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;opacity:.45"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
                '<span class="dts-drawer-item-title">' + escHtml(sess.title) + '</span>' +
                '<button class="dts-drawer-item-del" title="Delete">\u2715</button>';

            item.querySelector('.dts-drawer-item-del').addEventListener('click', function (e) {
                e.stopPropagation();
                deleteSession(sess.id);
                if (sess.id === conversationId) {
                    startNewChat();
                } else {
                    renderHistoryList();
                }
            });

            item.addEventListener('click', function () { loadSessionById(sess.id); closeHistoryDrawer(); });
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

        var avatarLetter = role === 'user' ? 'U' : '\u2736';
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
       STREAM REPLY — types AI response word-by-word (ChatGPT style)
    ═══════════════════════════════════════════════════════════ */
    function streamReply(content, onDone) {
        var messages = document.getElementById('dts-messages');
        var welcome  = document.getElementById('dts-welcome');
        if (!messages) { if (onDone) onDone(); return; }
        if (welcome) welcome.style.display = 'none';

        var wrap = document.createElement('div');
        wrap.className = 'dts-message dts-ai';
        wrap.innerHTML =
            '<div class="dts-msg-avatar">✶</div>' +
            '<div class="dts-msg-content"><div class="dts-msg-bubble"></div></div>';
        messages.appendChild(wrap);

        var bubble = wrap.querySelector('.dts-msg-bubble');
        var tokens = content.split(/(?=\s)/);
        if (tokens.length < 4) tokens = content.split('');
        var idx   = 0;
        var acc   = '';
        var CHUNK = 4;
        var DELAY = 16;

        function tick() {
            if (idx < tokens.length) {
                var end = Math.min(idx + CHUNK, tokens.length);
                for (var i = idx; i < end; i++) acc += tokens[i];
                idx = end;
                try {
                    if (typeof marked !== 'undefined') {
                        bubble.innerHTML = marked.parse(acc, { breaks: true, gfm: true });
                    } else {
                        bubble.innerHTML = escHtml(acc).replace(/\n/g, '<br>');
                    }
                } catch (e) {
                    bubble.innerHTML = escHtml(acc).replace(/\n/g, '<br>');
                }
                scrollToBottom();
                setTimeout(tick, DELAY);
            } else {
                applyMathAndHighlight(wrap);
                scrollToBottom();
                if (onDone) onDone();
            }
        }
        tick();
        return wrap;
    }

    /* ═══════════════════════════════════════════════════════════
       SEND MESSAGE — with web search + Groq
    ═══════════════════════════════════════════════════════════ */
    async function sendMessage(text) {
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

        /* ── Step 1: Detect if web search needed ── */
        var webContext   = '';
        var webSourceTag = '';
        var searchNeeds  = detectSearchNeeds(text);

        if (searchNeeds) {
            if (searchNeeds.type === 'url') {
                showTyping(true, '\uD83C\uDF10 Visiting ' + searchNeeds.url.slice(0, 60) + '\u2026');
                var pageContent = await fetchWebPage(searchNeeds.url);
                if (pageContent) {
                    webContext   = 'WEBPAGE CONTENT FROM ' + searchNeeds.url + ':\n\n' + pageContent;
                    webSourceTag = '\uD83C\uDF10 *Read from:* ' + searchNeeds.url;
                } else {
                    showTyping(true, '\u26A0\uFE0F Could not visit page, searching instead\u2026');
                    var fallback = await performWebSearch(text);
                    if (fallback) {
                        webContext   = 'WEB SEARCH RESULTS (' + fallback.source + '):\n\n' + fallback.content;
                        webSourceTag = '\uD83D\uDD0D *Web search via ' + fallback.source + '*';
                    }
                }
            } else {
                showTyping(true, '\uD83D\uDD0D Searching the web\u2026');
                var searchResult = await performWebSearch(searchNeeds.query);
                if (searchResult) {
                    webContext   = 'WEB SEARCH RESULTS (' + searchResult.source + '):\n\n' + searchResult.content;
                    webSourceTag = '\uD83D\uDD0D *Web search via ' + searchResult.source + '*';
                }
            }
        }

        showTyping(true, 'XZILY AI is thinking\u2026');

        /* ── Step 2: Build system prompt with optional web context ── */
        var dynamicSystem = SYSTEM_PROMPT;
        if (webContext) {
            dynamicSystem += '\n\n===== LIVE WEB DATA (retrieved now) =====\n' + webContext +
                             '\n===== END OF WEB DATA =====\n' +
                             '\nIMPORTANT: Use the above live web data to answer the user\'s question accurately. Cite the source in your response.';
        }

        var messages = [{ role: 'system', content: dynamicSystem }].concat(chatHistory);

        if (typeof window.groqFetch !== 'function') {
            showTyping(false);
            appendMessage('assistant', '\u26A0\uFE0F API not ready yet. Please wait a moment and try again.');
            isSending = false;
            setSendState(false);
            return;
        }

        /* ── Step 3: Call Groq ── */
        window.groqFetch({
            model:       'llama-3.3-70b-versatile',
            messages:    messages,
            max_tokens:  3000,
            temperature: 0.7
        }).then(function (res) {
            return res.json();
        }).then(function (data) {
            showTyping(false);
            if (data.error) {
                var errMsg = data.error.message || 'API error.';
                if (errMsg.indexOf('401') !== -1 || errMsg.indexOf('invalid_api_key') !== -1) {
                    errMsg += ' \u2014 Your Groq API key may be invalid or missing.';
                } else if (errMsg.indexOf('429') !== -1) {
                    errMsg += ' \u2014 Rate limit reached. Try again in a moment.';
                }
                appendMessage('assistant', '\u26A0\uFE0F ' + errMsg);
            } else {
                var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
                    ? data.choices[0].message.content
                    : 'Sorry, I could not generate a response. Please try again.';

                /* Append web source badge if web was searched */
                if (webSourceTag) {
                    reply = reply + '\n\n---\n' + webSourceTag;
                }

                chatHistory.push({ role: 'assistant', content: reply });
                streamReply(reply, function () {
                    saveSession();
                    renderHistoryList();
                    if (/\n\s*[A-D][.)]\s/i.test(reply) && /\d+[.)]\s/.test(reply)) {
                        showQuizImportBar(reply);
                    }
                });
            }
            isSending = false;
            setSendState(false);
        }).catch(function (err) {
            showTyping(false);
            appendMessage('assistant', '\u26A0\uFE0F Connection error. Please check your internet and try again.');
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
            '<span class="dts-quiz-import-info">\uD83D\uDCDD Quiz questions detected!</span>' +
            '<button class="dts-create-quiz-btn" id="dts-go-create-quiz">Create Quiz \u2192</button>';

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
                setStatus('\uD83D\uDCCE ' + name + ' (parser loading\u2026)');
                setTimeout(function () { handleFileAttach(file); }, 1800);
                return;
            }
            setStatus('\uD83D\uDCCE Reading PDF\u2026');
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
                                    setStatus('\uD83D\uDCCE ' + name + ' attached (' + total + ' pages)');
                                }
                            });
                        })(p);
                    }
                }).catch(function () { setStatus('\u274C Could not read PDF'); });
            };
            r1.readAsArrayBuffer(file);
            return;
        }

        /* DOCX */
        if (ext === 'docx' || ext === 'doc') {
            if (typeof mammoth === 'undefined') {
                setStatus('\uD83D\uDCCE ' + name + ' (parser loading\u2026)');
                setTimeout(function () { handleFileAttach(file); }, 1800);
                return;
            }
            setStatus('\uD83D\uDCCE Reading document\u2026');
            var r2 = new FileReader();
            r2.onload = function (e) {
                mammoth.extractRawText({ arrayBuffer: e.target.result }).then(function (result) {
                    attachedFileText = result.value;
                    attachedFileName = name;
                    setStatus('\uD83D\uDCCE ' + name + ' attached');
                }).catch(function () { setStatus('\u274C Could not read document'); });
            };
            r2.readAsArrayBuffer(file);
            return;
        }

        /* Plain text: txt, md, csv, json, etc. */
        var r3 = new FileReader();
        r3.onload = function (e) {
            attachedFileText = e.target.result;
            attachedFileName = name;
            setStatus('\uD83D\uDCCE ' + name + ' attached');
        };
        r3.onerror = function () { setStatus('\u274C Could not read file'); };
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
        rec.continuous     = false;
        rec.interimResults = true;
        rec.lang           = 'en-US';
        voiceRecognition   = rec;
        setVoiceState('listening');
        setVoiceTranscript('Listening\u2026');

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

    async function handleVoiceInput(text) {
        chatHistory.push({ role: 'user', content: text });
        appendMessage('user', text);
        showTyping(true, 'XZILY AI is thinking\u2026');

        if (typeof window.groqFetch !== 'function') {
            showTyping(false);
            setVoiceState('error');
            setVoiceTranscript('API not available.');
            return;
        }

        /* Web search for voice too */
        var voiceWebContext = '';
        var searchNeeds = detectSearchNeeds(text);
        if (searchNeeds) {
            if (searchNeeds.type === 'url') {
                var pg = await fetchWebPage(searchNeeds.url);
                if (pg) voiceWebContext = 'WEBPAGE CONTENT FROM ' + searchNeeds.url + ':\n\n' + pg;
            } else {
                var sr = await performWebSearch(text);
                if (sr) voiceWebContext = 'WEB SEARCH RESULTS (' + sr.source + '):\n\n' + sr.content;
            }
        }

        var dynamicSystem = SYSTEM_PROMPT;
        if (voiceWebContext) {
            dynamicSystem += '\n\n===== LIVE WEB DATA =====\n' + voiceWebContext + '\n===== END =====\nUse this data to answer accurately.';
        }

        var messages = [{ role: 'system', content: dynamicSystem }].concat(chatHistory);

        window.groqFetch({
            model: 'llama-3.1-8b-instant', messages: messages, max_tokens: 600, temperature: 0.7
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

        var labels    = { idle: 'Tap "Start Listening" to begin', listening: 'Listening\u2026 speak now', thinking: 'XZILY is thinking\u2026', speaking: 'XZILY is speaking\u2026', error: 'Microphone error', closed: '' };
        var togLabels = { idle: 'Start Listening', listening: 'Stop Listening', thinking: 'Please wait\u2026', speaking: 'Interrupt', error: 'Retry', closed: '' };

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

    function speakStudioChunked(spoken, onDone) {
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

    /* ═══════════════════════════════════════════════════════════
       HISTORY DRAWER
    ═══════════════════════════════════════════════════════════ */
    function openHistoryDrawer() {
        var drawer  = document.getElementById('dts-history-drawer');
        var overlay = document.getElementById('dts-history-overlay');
        renderHistoryList();
        if (drawer)  { drawer.classList.add('open');  }
        if (overlay) { overlay.classList.add('open'); }
        document.body.style.overflow = 'hidden';
    }

    function closeHistoryDrawer() {
        var drawer  = document.getElementById('dts-history-drawer');
        var overlay = document.getElementById('dts-history-overlay');
        if (drawer)  drawer.classList.remove('open');
        if (overlay) overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    document.addEventListener('DOMContentLoaded', function () {

        newSession();
        renderHistoryList();

        /* ── Auto-resize textarea ── */
        var inputEl = document.getElementById('dts-input');
        if (inputEl) {
            inputEl.addEventListener('input', function () {
                this.style.height = 'auto';
                this.style.height = Math.min(this.scrollHeight, 200) + 'px';
            });

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


        /* ── History hamburger button ── */
        var historyBtn = document.getElementById('dts-hist-open-btn') ||
                        document.getElementById('dts-history-btn');
        if (historyBtn) {
            historyBtn.addEventListener('click', function () { openHistoryDrawer(); });
        }

        /* ── History drawer close button ── */
        var historyClose = document.getElementById('dts-history-close');
        if (historyClose) {
            historyClose.addEventListener('click', function () { closeHistoryDrawer(); });
        }

        /* ── History overlay backdrop click ── */
        var historyOverlay = document.getElementById('dts-history-overlay');
        if (historyOverlay) {
            historyOverlay.addEventListener('click', function () { closeHistoryDrawer(); });
        }

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
                if (historyCaret) historyCaret.textContent = open ? '\u25B8' : '\u25BE';
            });
        }

        /* ── File input ── */
        var fileInput = document.getElementById('dts-file-input');
        if (fileInput) {
            fileInput.addEventListener('change', function () {
                if (this.files && this.files[0]) handleFileAttach(this.files[0]);
            });
        }

        /* ── Voice button ── */
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
                var orb   = document.getElementById('dts-voice-orb');
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
                    /* Uncomment to restore last session on load: */
                    /* loadSessionById(lastId); */
                }
            }
        } catch (e) {}

    }); /* end DOMContentLoaded */

})();
