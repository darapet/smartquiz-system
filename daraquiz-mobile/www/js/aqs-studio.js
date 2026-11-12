/* aqs-studio.js — xzily AI Chat Studio v3
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
    var voiceMicLocked     = false;
    var voiceSessionId     = 0;
    var voiceOperationId   = 0;
    var voiceRestartTimer  = null;
    var chatHistory        = [];
    var imageDesignSessionActive = false;
    var conversationId     = null;
    var attachedFileText   = null;
    var attachedFileName   = null;
    var attachedImageData  = null;
    var attachedImageName  = null;
    var isSending          = false;
    var deepSearchEnabled   = false;

    var STORAGE_KEY = 'dts_chat_sessions';
    var ACTIVE_KEY  = 'dts_active_session';

    /* ═══════════════════════════════════════════════════════════
       SYSTEM PROMPT — Professional General AI
    ═══════════════════════════════════════════════════════════ */
    var TODAY = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    var SYSTEM_PROMPT =
        'You are xzily — one of the most capable and exciting new AI assistants in the world, developed by xzily omomo excellence and Darapet Technology. ' +
        'You are highly intelligent, accurate, and comprehensive — and though xzily is new, it is built to rival and exceed any leading AI assistant in helpfulness and depth. ' +
        'Today\'s date is ' + TODAY + '. ' +

        '\n\n## LANGUAGE & TONE RULES:' +
        '\n- Detect the user\'s language and respond in the same language, including Nigerian English and Pidgin when the user uses them.' +
        '\n- Respect Nigerian student context, local examples, school terminology and Nigerian English without stereotyping.' +
        '\n- Match the user\'s formality and energy while staying clear, respectful and accurate.' +

        '\n\n## YOUR CAPABILITIES:' +
        '\n- Deep expertise across ALL subjects: science, technology, medicine, law, finance, economics, engineering, history, arts, literature, and business.' +
        '\n- Real-time web awareness: when web search results or page content are provided, analyze them thoroughly and give accurate, up-to-date answers.' +
        '\n- Professional writing: emails, reports, legal documents, business proposals, marketing copy, code, essays, and creative writing.' +
        '\n- Advanced reasoning: complex problem-solving, analysis, strategy, research summaries, and data interpretation.' +
        '\n- Academic support: exam preparation, tutoring, step-by-step problem solving, and practice questions at all levels.' +
        '\n- Technical expertise: code in any programming language, debugging, architecture design, DevOps, and system design.' +

        '\n\n## RESPONSE FORMAT RULES:' +
        '\n- Give complete, useful answers, not lazy one-liners. Use headings, steps and examples when they improve clarity; keep simple answers proportionate.' +
        '\n- For learning help, explain the reasoning step by step and include a relevant example or check for understanding.' +
        '\n- Infer clear intent from context. Ask a concise clarification only when ambiguity materially changes the answer.' +
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
        '\n- GOOD: "## USD to NGN Exchange Rate\\n\\nAs of today, the exchange rates are as follows:\\n\\n| Rate Type | Rate |\\n|---|---|\\n| CBN Official Rate | ₦1,580/USD (approx.) |\\n| Parallel Market Rate | ₦1,620–₦1,640/USD (approx.) |\\n\\n**Note:** The Nigerian naira has experienced significant volatility. The rates above are indicative and may have changed. Always verify with your bank or a live platform such as [Wise](https://wise.com), [Remitly](https://remitly.com), or [CBN](https://cbn.gov.ng) for the most accurate current figure."' +

        '\n\n## STRICT IDENTITY RULES — NEVER BREAK:' +
        '\n1. You are xzily, built by xzily omomo excellence and Darapet Technology. That is your entire identity.' +
        '\n2. NEVER name any AI company, model, API, or service (Groq, Llama, OpenAI, ChatGPT, Anthropic, Meta, Gemini, Mistral, Hugging Face, Replicate, Pollinations, or any other). Not even indirectly.' +
        '\n3. NEVER mention your version, build number, integration, or any technical detail about how you are built.' +
        '\n4. If asked what AI you are or what powers you: say ONLY "I am xzily, an AI created by xzily omomo excellence (Darapet Technology). I keep my technical architecture private — what matters is what I can do for you!"' +
        '\n5. When asked how you compare to other AIs: say that xzily is one of the best new AI assistants — fast, smart, and built with excellence by Darapet Technology — without naming specific competitors in a negative way.' +
        '\n6. NEVER say "As an AI language model", "I was trained by", or any phrase revealing a third-party AI.' +
        '\n7. Give zero hints about underlying technology — no speculation, no "I might be based on...\n\n## DARAPET TECHNOLOGY — CONTACT INFORMATION:\n- Company: Darapet Technology\n- Email: daramolapeter98@gmail.com\n- WhatsApp: +234 7055428581\n- LinkedIn: www.linkedin.com/in/daramola-peter-7122152b5\n- When asked about contacting Darapet Technology, the developer, or support, always provide all the above contact details.';

    /* ═══════════════════════════════════════════════════════════
       WEB SEARCH & BROWSING ENGINE
    ═══════════════════════════════════════════════════════════ */

    /* Detect if the query needs live web data */
    function detectSearchNeeds(text) {
        /* Explicit URL → fetch that page */
        var urlMatch = text.match(/https?:\/\/[^\s"'<>]+/i);
        if (urlMatch) return { type: 'url', url: urlMatch[0] };

        /* Domain with www (no protocol) */
        var wwwMatch = text.match(/\b(www\.[a-z0-9-]+\.[a-z]{2,}(?:\/[^\s]*)?)/i);
        if (wwwMatch) return { type: 'url', url: 'https://' + wwwMatch[1] };

        /* Bare domain without www or https — e.g. google.com, bbc.co.uk, example.ng */
        var bareDomain = text.match(
            /\b([a-z0-9][a-z0-9-]*\.(?:com|org|net|io|co\.uk|com\.ng|co\.ng|ng|gov|edu|info|biz|tv|fm|media|app|dev|ai|tech|news|africa|online|xyz|co|uk|ca|au|de|fr|gh|ke|za|rw|ug|tz|eg|ma|sn|ci|cm)(?:\/[^\s<>"']*)?)\b/i
        );
        if (bareDomain) {
            /* Always fetch page if user used a "visit" verb */
            var hasVisitVerb = /\b(visit|go to|browse|open|check out|read|fetch|get from|access|load|pull from|show me what.s on|navigate to)\b/i.test(text);
            if (hasVisitVerb) return { type: 'url', url: 'https://' + bareDomain[1] };
            /* Also fetch if domain is basically the whole message (short query) */
            var stripped = text.replace(bareDomain[0], '').replace(/[^a-z0-9 ]/gi, ' ').trim();
            if (stripped.split(/\s+/).filter(Boolean).length <= 6) {
                return { type: 'url', url: 'https://' + bareDomain[1] };
            }
        }

        /* Year mentions → likely needs current info */
        if (/\b(202[3-9]|2030)\b/.test(text)) return { type: 'search', query: text };

        /* News / real-time / current events */
        if (/\b(latest|breaking|news|today|tonight|yesterday|this week|this month|this year|current|right now|live|trending|happening|just happened|recently|new release|update|announced|dropped|released|launched|upcoming|schedule|fixtures|standings|table)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        /* Prices, rates, money */
        if (/\b(price|cost|rate|exchange rate|how much|worth|value|usd|naira|dollar|pound|euro|nasd|nse|stock|crypto|bitcoin|ethereum|bnb|usdt|market cap)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        /* Sports */
        if (/\b(score|match|game result|who won|who beat|champion|league|premier league|laliga|champions league|world cup|super eagles|barca|arsenal|chelsea|man united|man city|liverpool|psg|real madrid)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        /* Explicit search commands */
        if (/\b(search|look up|look for|find out|find me|check|browse|visit|open|go to|show me|google|bing|search for)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        /* Questions about people, companies, events */
        if (/\b(who is|who are|what is|where is|when did|when was|how much|how many|tell me about|what happened|what happened to|who owns|who runs|ceo|president|governor|minister|founded|born|died|age of|capital of|population of|located)\b/i.test(text)) {
            return { type: 'search', query: text };
        }

        /* Nigerian / African specific */
        if (/\b(naija|nigeria|ghana|kenya|south africa|nollywood|afrobeats|dangote|tinubu|obi|atiku|inec|efcc|cbn|nnpc|nddc|waec|jamb|neco|ssce|school fees)\b/i.test(text)) {
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
            if (text && text.trim().length > 100) return text.trim().slice(0, 8000);
            return null;
        } catch (e) { return null; }
    }

    /* Method 2 — AllOrigins CORS proxy (fetches raw HTML, extracts visible text) */
    async function fetchViaAllOrigins(url) {
        try {
            var apiUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(url);
            var res    = await timedFetch(apiUrl, {}, 10000);
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
            if (text.length > 200) return text.slice(0, 8000);
            return null;
        } catch (e) { return null; }
    }

    /* Method 3 — corsproxy.io (another free open CORS proxy) */
    async function fetchViaCorsProxy(url) {
        try {
            var proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(url);
            var res      = await timedFetch(proxyUrl, {}, 10000);
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
            if (text.length > 200) return text.slice(0, 8000);
            return null;
        } catch (e) { return null; }
    }


    /* Exposed scraper for deep search detail pass */
    window._aqsWebScrapePage = async function(url) {
        try {
            var base = (window.location && window.location.origin && window.location.origin.indexOf('workers.dev') !== -1)
                ? window.location.origin
                : 'https://smartquiz-system3.daramolapeter98.workers.dev';
            var res = await fetch(base + '/webpage?url=' + encodeURIComponent(url));
            if (!res.ok) return null;
            return await res.json();
        } catch (e) { return null; }
    };

    /* Master fetchWebPage — all 3 methods in parallel, fastest wins */
    async function fetchWebPage(url) {
        return new Promise(function(resolve) {
            var done = false;
            var remaining = 3;
            function tryResolve(result) {
                remaining--;
                if (result && !done) { done = true; resolve(result); return; }
                if (remaining === 0 && !done) resolve(null);
            }
            fetchViaJina(url).then(tryResolve).catch(function(){ tryResolve(null); });
            fetchViaAllOrigins(url).then(tryResolve).catch(function(){ tryResolve(null); });
            fetchViaCorsProxy(url).then(tryResolve).catch(function(){ tryResolve(null); });
        });
    }


    /* Primary: real web results via our own worker /websearch proxy */
    async function searchOwnWorkerResults(query) {
        try {
            var base = (window.location && window.location.origin && window.location.origin.indexOf('workers.dev') !== -1)
                ? window.location.origin
                : 'https://smartquiz-system3.daramolapeter98.workers.dev';
            var res = await timedFetch(base + '/websearch?q=' + encodeURIComponent(query), {}, 9000);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var data = await res.json();
            var rs = (data && data.results) || [];
            if (!rs.length) return null;
            var lines = rs.map(function (r, i) {
                var sn = r.snippet ? '\n   ' + r.snippet : '';
                return (i + 1) + '. ' + (r.title || '') + ' - ' + (r.link || '') + sn;
            });
            return { source: 'Web', content: 'LIVE WEB RESULTS for "' + query + '":\n' + lines.join('\n'), links: rs.map(function(r){ return r.link; }).filter(Boolean) };
        } catch (e) { return null; }
    }

    /* Search DuckDuckGo Instant Answer API — FREE, no key needed */
    async function searchDuckDuckGo(query) {
        try {
            var url  = 'https://api.duckduckgo.com/?q=' + encodeURIComponent(query) +
                       '&format=json&no_html=1&skip_disambig=1&no_redirect=1';
            var ctrl = new AbortController();
            var timer = setTimeout(function () { ctrl.abort(); }, 5000);
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

    /* Jina AI web search — returns real web results, no key needed */
    async function searchJinaWeb(query) {
        try {
            var res = await timedFetch(
                'https://s.jina.ai/' + encodeURIComponent(query),
                { headers: { 'Accept': 'text/plain', 'X-Return-Format': 'text' } },
                10000
            );
            if (!res.ok) throw new Error('HTTP ' + res.status);
            var text = await res.text();
            if (text && text.trim().length > 80) return { source: 'Web', content: text.trim().slice(0, 7000) };
            return null;
        } catch (e) { return null; }
    }

    /* Wikipedia direct summary (by exact title guess) */
    async function searchWikipedia(query) {
        try {
            var title = query.trim().replace(/\s+/g, '_');
            var url   = 'https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title);
            var res   = await timedFetch(url, {}, 8000);
            if (!res.ok) return null;
            var data  = await res.json();
            if (data.extract && data.extract.length > 50) {
                return data.extract + (data.content_urls ? '\nSource: ' + data.content_urls.desktop.page : '');
            }
            return null;
        } catch (e) { return null; }
    }

    /* Wikipedia full-text search (searches across all articles) */
    async function searchWikipediaFullText(query) {
        try {
            var url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=' +
                      encodeURIComponent(query) + '&srlimit=3&format=json&origin=*';
            var res = await timedFetch(url, {}, 8000);
            if (!res.ok) return null;
            var data = await res.json();
            var results = (data.query && data.query.search) || [];
            if (!results.length) return null;
            var parts = results.slice(0, 3).map(function (r) {
                return r.title + ': ' + (r.snippet || '').replace(/<[^>]*>/g, '');
            });
            return parts.join('\n\n') || null;
        } catch (e) { return null; }
    }

    /* Google News via RSS (free, no key, gives real headlines) */
    async function searchGoogleNews(query) {
        try {
            var rssUrl  = 'https://news.google.com/rss/search?q=' + encodeURIComponent(query) + '&hl=en-US&gl=US&ceid=US:en';
            var proxyUrl = 'https://api.allorigins.win/get?url=' + encodeURIComponent(rssUrl);
            var res  = await timedFetch(proxyUrl, {}, 8000);
            if (!res.ok) return null;
            var data = await res.json();
            var xml  = (data && data.contents) || '';
            if (!xml) return null;
            var items = xml.match(/<item[\s\S]*?<\/item>/g) || [];
            var headlines = items.slice(0, 6).map(function (item) {
                var title = (item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>(.*?)<\/title>/) || [])[1] || '';
                var desc  = (item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>(.*?)<\/description>/) || [])[1] || '';
                return title + (desc ? ' — ' + desc.replace(/<[^>]*>/g, '').slice(0, 120) : '');
            }).filter(Boolean);
            if (headlines.length) return 'Latest news headlines:\n' + headlines.join('\n');
            return null;
        } catch (e) { return null; }
    }

    /* Master search: ALL sources run in PARALLEL — fastest winner wins.
       Hard cap: 7 seconds total — never blocks the AI response longer than that. */
    async function performWebSearch(query) {
        /* Clean query for Wikipedia */
        var wikiQ = query
            .replace(/\b(latest|news|what is|who is|who are|tell me about|search for|find|current|today|abeg|please|help me with|search)\b/gi, '')
            .replace(/[?!.,]/g, '').trim();

        /* Detect if this looks like a news query for Google News */
        var isNewsQuery = /\b(news|latest|breaking|today|tonight|yesterday|this week|trending|happening|just happened|recently|score|match|who won)\b/i.test(query);

        /* Fire all searches at once */
        var searches = [
            /* 0. Our own worker proxy - real DuckDuckGo results with links */
            searchOwnWorkerResults(query).catch(function(){ return null; }),
            /* 1. Jina Search — real live web results (usually fastest & best) */
            searchJinaWeb(query).catch(function(){ return null; }),
            /* 2. DuckDuckGo instant answers (fast for well-known topics) */
            searchDuckDuckGo(query).then(function(ddg){
                return (ddg && ddg.length > 80) ? { source: 'DuckDuckGo', content: ddg } : null;
            }).catch(function(){ return null; }),
            /* 3. Google News RSS (for news/current event queries) */
            (isNewsQuery ? searchGoogleNews(query).then(function(gn){
                return gn ? { source: 'Google News', content: gn } : null;
            }).catch(function(){ return null; }) : Promise.resolve(null)),
            /* 4. Wikipedia full-text search */
            (wikiQ.length > 3 ? searchWikipediaFullText(wikiQ).then(function(w){
                return w ? { source: 'Wikipedia', content: w } : null;
            }).catch(function(){ return null; }) : Promise.resolve(null)),
            /* 5. Wikipedia direct fallback */
            (wikiQ.length > 3 ? searchWikipedia(wikiQ).then(function(w){
                return w ? { source: 'Wikipedia', content: w } : null;
            }).catch(function(){ return null; }) : Promise.resolve(null))
        ];

        /* Hard 7-second cap so search never delays AI response too long */
        var hardTimeout = new Promise(function(resolve) { setTimeout(function(){ resolve(null); }, 7000); });

        /* Race: return as soon as any source has ≥80 chars, or timeout */
        var raceResult = new Promise(function(resolve) {
            var resolved = false;
            var remaining = searches.length;
            var best = null;

            searches.forEach(function(p) {
                p.then(function(result) {
                    remaining--;
                    if (result && result.content && result.content.length > 80) {
                        if (!resolved) { resolved = true; resolve(result); return; }
                        if (result.source === 'Web' || result.source === 'Google News') best = result;
                    }
                    if (remaining === 0 && !resolved) { resolved = true; resolve(best); }
                }).catch(function(){
                    remaining--;
                    if (remaining === 0 && !resolved) { resolved = true; resolve(null); }
                });
            });
        });

        return Promise.race([raceResult, hardTimeout]);
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
                var span = el.querySelector('.dts-typing-label');
                if (span) span.textContent = statusText;
            }
            if (msgs) msgs.appendChild(el);
            el.style.display = 'flex';
            scrollToBottom();
        } else {
            /* Reset text */
            var span2 = el.querySelector('.dts-typing-label');
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

    function addCodeCopyButtons(containerEl) {
        containerEl.querySelectorAll('pre').forEach(function (pre) {
            if (pre.parentNode && pre.parentNode.classList.contains('dts-code-wrap')) return;
            var wrap = document.createElement('div');
            wrap.className = 'dts-code-wrap';
            pre.parentNode.insertBefore(wrap, pre);
            wrap.appendChild(pre);
            var btn = document.createElement('button');
            btn.className = 'dts-code-copy-btn';
            btn.textContent = 'Copy';
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var codeEl = pre.querySelector('code');
                var text   = codeEl ? (codeEl.innerText || codeEl.textContent) : (pre.innerText || pre.textContent);
                function doFallback() {
                    var ta = document.createElement('textarea');
                    ta.value = text;
                    ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
                    document.body.appendChild(ta);
                    ta.focus(); ta.select();
                    try { document.execCommand('copy'); btn.textContent = 'Copied!'; btn.classList.add('copied'); }
                    catch (e2) { btn.textContent = 'Error'; }
                    document.body.removeChild(ta);
                    setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
                }
                if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
                    navigator.clipboard.writeText(text).then(function () {
                        btn.textContent = 'Copied!'; btn.classList.add('copied');
                        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('copied'); }, 2000);
                    }).catch(doFallback);
                } else { doFallback(); }
            });
            wrap.appendChild(btn);
        });
    }

    function applyMathAndHighlight(containerEl) {
        try {
            if (typeof hljs !== 'undefined') {
                containerEl.querySelectorAll('pre code').forEach(function (block) {
                    hljs.highlightElement(block);
                });
            }
            addCodeCopyButtons(containerEl);
        } catch (e) {}
        try {
            if (typeof window.renderMathInElement !== 'undefined') {
                window.renderMathInElement(containerEl, {
                    delimiters: [
                        { left: '$$',  right: '$$',  display: true  },
                        { left: '$',   right: '$',   display: false },
                        { left: '\\[', right: '\\]', display: true  },
                        { left: '\\(', right: '\\)', display: false }
                    ]
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
        var _typing  = document.getElementById('dts-typing');
        if (_typing && messages && _typing.parentNode === messages && messages.parentNode) {
            messages.parentNode.insertBefore(_typing, messages.nextSibling);
        }
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
        var _typing2 = document.getElementById('dts-typing');
        if (_typing2 && messages && _typing2.parentNode === messages && messages.parentNode) {
            messages.parentNode.insertBefore(_typing2, messages.nextSibling);
        }
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
        var isSavedImage = role === 'assistant' && content && typeof content === 'object' && content.type === 'generated-image' && content.dataUrl;
        var bubbleHtml = role === 'user' ? escHtml(content) : (isSavedImage ? '' : renderMessage(content));
        wrap.innerHTML = '<div class="dts-msg-avatar">' + avatarLetter + '</div><div class="dts-msg-content"><div class="dts-msg-bubble">' + bubbleHtml + '</div></div>';
        var bubble = wrap.querySelector('.dts-msg-bubble');
        if (isSavedImage) {
            var image = document.createElement('img');
            image.className = 'dts-inline-generated-image';
            image.src = content.dataUrl;
            image.alt = content.prompt || 'Generated image';
            image.loading = 'lazy';
            image.addEventListener('click', function(){ openGeneratedImage(content.dataUrl, content.prompt || 'Generated image'); });
            bubble.appendChild(image);
            var actions = document.createElement('div');
            actions.className = 'dts-image-actions';
            actions.innerHTML = '<button type="button" class="dts-image-preview">View image</button><a class="dts-image-download" download="xzily-generated-image.jpg">Download</a>';
            var editBtn = document.createElement('button'); editBtn.type='button'; editBtn.textContent='Edit image';
            editBtn.addEventListener('click', function(){
                attachedImageData = content.dataUrl; attachedImageName = 'generated-image.jpg';
                var input = document.getElementById('dts-input');
                if (input) { input.value = 'Edit this image: '; input.focus(); }
            });
            actions.appendChild(editBtn);
            actions.querySelector('.dts-image-preview').addEventListener('click', function(){ openGeneratedImage(content.dataUrl, content.prompt || 'Generated image'); });
            actions.querySelector('.dts-image-download').href = content.dataUrl;
            bubble.appendChild(actions);
            var caption = document.createElement('p');
            caption.className = 'dts-image-caption';
            caption.textContent = content.prompt || 'Generated with XZILY AI';
            bubble.appendChild(caption);
        }
        if (role === 'assistant' && !isSavedImage) applyMathAndHighlight(wrap);
        if (role === 'assistant' && !isSavedImage) addDocumentExportActions(wrap.querySelector('.dts-msg-content'), content);
        if (role === 'assistant') {
            var msgContent = wrap.querySelector('.dts-msg-content');
            if (msgContent) {
                var copyBtn = document.createElement('button');
                copyBtn.className = 'dts-msg-copy-btn';
                copyBtn.textContent = '📋 Copy';
                copyBtn.addEventListener('click', function() {
                    var text = isSavedImage ? (content.prompt || 'Generated image') : ((bubble.innerText || bubble.textContent || ''));
                    function fallbackCopy() {
                        var ta = document.createElement('textarea'); ta.value = text;
                        ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;';
                        document.body.appendChild(ta); ta.focus(); ta.select();
                        try { document.execCommand('copy'); copyBtn.textContent = '✅ Copied!'; } catch(e) { copyBtn.textContent = '❌ Error'; }
                        document.body.removeChild(ta); setTimeout(function(){copyBtn.textContent='📋 Copy';},1800);
                    }
                    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){copyBtn.textContent='✅ Copied!';setTimeout(function(){copyBtn.textContent='📋 Copy';},1800);}).catch(fallbackCopy);
                    else fallbackCopy();
                });
                msgContent.appendChild(copyBtn);
            }
        }
        messages.appendChild(wrap);
        scrollToBottom();
        return wrap;
    }

    document.addEventListener('dts-attach-generated-image', function(event) {
        var detail = event.detail || {};
        if (!detail.dataUrl) return;
        attachedImageData = detail.dataUrl;
        attachedImageName = 'generated-image.jpg';
        var input = document.getElementById('dts-input');
        if (input) { input.value = 'Edit this image: '; input.focus(); }
    });

    function openGeneratedImage(src, title) {
        var old = document.getElementById('dts-image-preview-modal');
        if (old) old.remove();
        var modal = document.createElement('div');
        modal.id = 'dts-image-preview-modal';
        modal.className = 'dts-image-preview-modal';
        modal.innerHTML = '<div class="dts-image-preview-panel"><button type="button" class="dts-image-preview-close" aria-label="Close">×</button><img alt=""><div class="dts-image-preview-actions"><a download="xzily-generated-image.jpg">Download image</a></div></div>';
        modal.querySelector('img').src = src;
        modal.querySelector('img').alt = title || 'Generated image';
        modal.querySelector('a').href = src;
        modal.addEventListener('click', function(e){if(e.target===modal||e.target.closest('.dts-image-preview-close'))modal.remove();});
        document.body.appendChild(modal);
    }


    /* ═══════════════════════════════════════════════════════════
       STREAM REPLY — types AI response word-by-word
    ═══════════════════════════════════════════════════════════ */
    function streamReply(content, onDone) {
        var messages = document.getElementById('dts-messages');
        var welcome = document.getElementById('dts-welcome');
        if (!messages) { if (onDone) onDone(); return; }
        if (welcome) welcome.style.display = 'none';
        content = String(content || '');
        var wrap = document.createElement('div');
        wrap.className = 'dts-message dts-ai';
        wrap.innerHTML = '<div class="dts-msg-avatar">✶</div><div class="dts-msg-content"><div class="dts-msg-bubble"></div></div>';
        var bubble = wrap.querySelector('.dts-msg-bubble');
        messages.appendChild(wrap);
        var msgContent = wrap.querySelector('.dts-msg-content');
        var copyBtn = document.createElement('button');
        copyBtn.className = 'dts-msg-copy-btn'; copyBtn.textContent = '📋 Copy';
        copyBtn.addEventListener('click', function(){
            var text = bubble.innerText || bubble.textContent || content;
            if(navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function(){copyBtn.textContent='✅ Copied!';setTimeout(function(){copyBtn.textContent='📋 Copy';},1800);});
        });
        msgContent.appendChild(copyBtn);
        var index = 0, step = 3;
        function typeNext(){
            index = Math.min(index + step, content.length);
            bubble.textContent = content.slice(0,index);
            scrollToBottom(true);
            if(index < content.length){setTimeout(typeNext, 20);return;}
            bubble.innerHTML = renderMessage(content);
            if (/Deep search:/i.test(content)) {
                var badge=document.createElement('span');badge.className='dts-deep-badge';badge.textContent='🔍 Deep search';bubble.insertBefore(badge,bubble.firstChild);
            }
            applyMathAndHighlight(wrap);
            if(onDone)onDone();
        }
        typeNext();
        return wrap;
    }
    function wantsDownloadableDocument(prompt) {
        return /\b(download|export|save|give me|provide|send me|create|make)\b/i.test(prompt || '') &&
          /\b(file|document|docx|word|pdf)\b/i.test(prompt || '');
    }
    function loadStudioLibrary(src, test) {
        return new Promise(function(resolve,reject) {
            if (test()) return resolve();
            var existing = document.querySelector('script[data-studio-library="'+src+'"]');
            if (existing) { existing.addEventListener('load',resolve,{once:true}); existing.addEventListener('error',reject,{once:true}); return; }
            var script=document.createElement('script');script.src=src;script.async=true;script.dataset.studioLibrary=src;
            script.onload=resolve;script.onerror=function(){reject(new Error('Could not load document export library.'));};
            document.head.appendChild(script);
        });
    }
    async function downloadAIArtifact(prompt, answer) {
        var isPdf = /\bpdf\b/i.test(prompt || '');
        var isDocx = /\b(docx|word)\b/i.test(prompt || '');
        var titleMatch = String(prompt || '').match(/(?:called|named|titled)\s+["“]?([^"”.,!?]+)["”]?/i);
        var name=(titleMatch?titleMatch[1]:'XZILY-AI-Document').trim().replace(/[^a-z0-9-_]+/gi,'-').replace(/^-|-$/g,'').slice(0,60)||'XZILY-AI-Document';
        var plain=String(answer||'').replace(/\r/g,'').replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/[*_`#>]/g,'');
        if(isPdf){
            await loadStudioLibrary('https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js',function(){return !!(window.jspdf&&window.jspdf.jsPDF);});
            var pdf=new window.jspdf.jsPDF({unit:'pt',format:'a4'});
            var margin=48,width=pdf.internal.pageSize.getWidth()-margin*2,y=margin;
            pdf.setFont('helvetica','normal');pdf.setFontSize(11);
            plain.split(/\n/).forEach(function(line){
                var wrapped=pdf.splitTextToSize(line||' ',width);
                wrapped.forEach(function(part){if(y>pdf.internal.pageSize.getHeight()-margin){pdf.addPage();y=margin;}pdf.text(part,margin,y);y+=16;});
                y+=5;
            });
            pdf.save(name+'.pdf');return true;
        }
        if(isDocx){
            await loadStudioLibrary('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js',function(){return !!window.docx;});
            var d=window.docx;
            var paragraphs=plain.split(/\n/).map(function(line){return new d.Paragraph({children:[new d.TextRun(line||' ')]});});
            var doc=new d.Document({sections:[{children:paragraphs}]});
            var blob=await d.Packer.toBlob(doc);var url=URL.createObjectURL(blob);
            var a=document.createElement('a');a.href=url;a.download=name+'.docx';document.body.appendChild(a);a.click();a.remove();
            setTimeout(function(){URL.revokeObjectURL(url);},5000);return true;
        }
        appendMessage('assistant','Please specify PDF or DOCX so I can create the correct downloadable file.');
        return false;
    }

    /* ═══════════════════════════════════════════════════════════
       SEND MESSAGE — with web search + Groq
    ═══════════════════════════════════════════════════════════ */
    async function sendMessage(text, _retryCount) {
        text = (text || '').trim();
        if (!text && !attachedFileText && !attachedImageData) return;
        if (isSending) return;

        /* CONVERSATIONAL IMAGE DESIGNER: clarify professional briefs before generation. */
        var IMG_INTENT = /\b(image|picture|photo|illustration|artwork|logo|poster|flyer|banner|thumbnail|wallpaper|avatar|portrait|graphic|graphics|design|designs|branding|brand identity|business card|brochure|catalogue|catalog|menu design|packaging|label design|social media post|instagram post|facebook post|youtube thumbnail|cover art|book cover|album cover|infographic|mockup|ui design|app design|web design|ad creative|advert|invitation|certificate|letterhead|product design)\b/i.test(text) &&
            /\b(create|generate|make|draw|design|produce|illustrate|render|come up with|i need|i want|help me|build me|prepare|craft|develop|designing)\b/i.test(text) ||
            /^\s*(show me|give me)\s+(an?\s+)?(image|picture|photo|logo|illustration|graphic|banner|flyer|poster|design)\b/i.test(text) ||
            /^\s*(can you|could you|please)\s+(create|make|design|generate)\b/i.test(text);
        if (text && !attachedFileText && !attachedImageData && (IMG_INTENT || imageDesignSessionActive)) {
            isSending = true; setSendState(true);
            var inp0 = document.getElementById('dts-input');
            if (inp0) { inp0.value = ''; inp0.style.height = 'auto'; }
            chatHistory.push({ role: 'user', content: text });
            appendMessage('user', text);
            showTyping(true, 'XZILY is planning your design…');
            try {
                if (typeof window.groqFetch !== 'function') throw new Error('Design assistant is not ready. Please try again.');
                var recentDesignHistory = chatHistory.slice(-12).map(function(m) {
                    return { role: m.role === 'assistant' ? 'assistant' : 'user',
                        content: typeof m.content === 'string' ? m.content : (m.content && m.content.prompt ? '[Previously generated image: '+m.content.prompt+']' : '[image attachment]') };
                });
                var plannerSystem = "You are XZILY, a senior professional graphic designer and visual-communication specialist. Handle the full range of graphic design: logos and brand identity, flyers, event posters, website and advertising banners, social posts, Fiverr gig covers, YouTube thumbnails, product adverts, business cards, menus, brochures, packaging, labels, invitations, certificates, infographics, mockups, 2D and 3D graphics, and UI concepts. Understand purpose, audience, platform, dimensions, visual style and required copy. Ordinary picture requests should generate immediately. For professional designs, ask one concise question only when an essential detail is missing; do not repeat questions or ask for information already in conversation. Never invent brand names, phone numbers, addresses, prices, offers, claims or copy. When ready, return ONLY valid JSON matching one of these shapes:\n{\"action\":\"ask\",\"message\":\"one concise question\"}\n{\"action\":\"generate\",\"prompt\":\"production-ready visual-artwork prompt\",\"category\":\"general|fiverr|youtube-thumbnail|flyer|event-poster|product-ad|social|banner|logo|business-card|menu|infographic|packaging|certificate|invitation|mockup|3d-design|2d-design\",\"aspectRatio\":\"square|landscape|portrait\",\"copy\":{\"headline\":\"exact supplied headline or empty string\",\"subline\":\"exact supplied supporting text or empty string\",\"cta\":\"exact supplied call to action or empty string\",\"brandName\":\"exact supplied brand name or empty string\",\"details\":\"other short exact supplied details or empty string\"}}\nThe copy object must contain only exact wording explicitly supplied by the user or conversation. Do not rewrite, correct, embellish or invent it. Keep each field empty when not supplied. Extract exact wording even when it appears naturally in the brief, not only when labeled. Do not put text into the artwork prompt unless the image needs a visual placeholder; the backend will typeset exact copy separately. For logos, prioritize a clean symbol/mark; use brandName only if supplied. Fiverr gig covers must be compact marketplace thumbnails, not website hero sections. Choose the right category automatically. Use landscape for banners, Fiverr covers and YouTube thumbnails; portrait for flyers, posters, menus and invitations; square for logos and social posts unless the user specifies dimensions/platform. Do not include markdown."
                var plannerRes = await window.groqFetch({model:'openai/gpt-oss-20b',messages:[{role:'system',content:plannerSystem}].concat(recentDesignHistory),max_tokens:1100,temperature:0.25});
                var plannerData = await plannerRes.json();
                var plannerText = plannerData.choices && plannerData.choices[0] && plannerData.choices[0].message && plannerData.choices[0].message.content || '';
                plannerText = plannerText.replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
                var plan = JSON.parse(plannerText);
                showTyping(false);
                if (plan.action === 'ask' && plan.message) {
                    imageDesignSessionActive = true;
                    chatHistory.push({role:'assistant',content:plan.message});
                    appendMessage('assistant',plan.message);
                    saveSession(); renderHistoryList();
                } else if (plan.action === 'generate' && plan.prompt) {
                    imageDesignSessionActive = false;
                    var imageData = await window.dtsGenerateInline(plan.prompt,{category:plan.category,aspectRatio:plan.aspectRatio,copy:plan.copy||{}});
                    if (imageData && imageData.type === 'generated-image') {
                        chatHistory.push({role:'assistant',content:imageData});
                    } else {
                        var failedMessage = 'I could not generate that image. Please check the message above for the service error, then try again.';
                        chatHistory.push({role:'assistant',content:failedMessage});
                        appendMessage('assistant',failedMessage);
                    }
                    saveSession(); renderHistoryList();
                } else {
                    throw new Error('The design plan was incomplete. Please describe the design again.');
                }
            } catch (designError) {
                showTyping(false);
                imageDesignSessionActive = false;
                var designMessage = 'I could not prepare that design yet. ' + (designError && designError.message || 'Please try again.');
                chatHistory.push({role:'assistant',content:designMessage});
                appendMessage('assistant',designMessage);
                saveSession(); renderHistoryList();
            } finally { isSending = false; setSendState(false); }
            return;
        }

        isSending = true;
        setSendState(true);

        /* Snapshot and clear attachments before async work */
        var snapImageData = attachedImageData;
        var snapImageName = attachedImageName;

        /* Build user content */
        var userContent = text;
        if (attachedFileText) {
            userContent = (text ? text + '\n\n' : 'Please analyse this file:\n\n') +
                'File: ' + escHtml(attachedFileName || 'attachment') + '\n```\n' +
                attachedFileText.slice(0, 8000) + '\n```';
        }

        clearFileAttachment();

        /* Route explicit image-edit requests to the image-to-image service. */
        var editIntent = /\b(edit|change|modify|replace|remove|erase|delete|add|insert|put|include|redesign|retouch|restyle|recolour|recolor|crop|resize|brighten|darken|sharpen|clean up|enhance|improve|make it|turn it into|convert it|update|fix|adjust|background|text on|write on|professional|modern|realistic|cartoon|anime|illustration|transparent|white background|black background|social media|profile picture|product photo|remove the background|change the background)\b/i.test(text || '');
        if (snapImageData && editIntent && typeof window.dtsEditInline === 'function') {
            var editPrompt = (text || '').replace(/^\s*edit this image[:\s-]*/i, '').trim();
            if (!editPrompt) editPrompt = 'Improve this image while preserving its main subject and composition.';
            chatHistory.push({ role: 'user', content: userContent });
            appendMessage('user', userContent);
            var editInput = document.getElementById('dts-input');
            if (editInput) { editInput.value=''; editInput.style.height='auto'; }
            showTyping(true, 'XZILY AI is editing your image…');
            Promise.resolve(window.dtsEditInline(snapImageData, editPrompt)).then(function(result){
                showTyping(false);
                if (result) { chatHistory.push({role:'assistant',content:result}); appendMessage('assistant',result); }
                else if(!result) { chatHistory.push({role:'assistant',content:'Image editing failed. Please try again.'}); appendMessage('assistant','Image editing failed. Please try again.'); }
                saveSession();renderHistoryList();
            }).catch(function(err){
                showTyping(false);chatHistory.push({role:'assistant',content:'Image editing failed: '+(err&&err.message||'Please try again.')});
                saveSession();renderHistoryList();
            }).finally(function(){attachedImageData=null;attachedImageName=null;isSending=false;setSendState(false);});
            return;
        }

        /* --- Image vision path --- */
        if (snapImageData) {
            /* Show user message with thumbnail */
            var imgLabel = (text ? text + '\n\n' : '') + '\uD83D\uDDBC\uFE0F *Image: ' + (snapImageName || 'image') + '*';
            chatHistory.push({ role: 'user', content: imgLabel });
            appendMessage('user', imgLabel);
            var input2 = document.getElementById('dts-input');
            if (input2) { input2.value = ''; input2.style.height = 'auto'; }

            showTyping(true, 'XZILY AI is analysing your image\u2026');

            var visionMessages = [
                { role: 'system', content: SYSTEM_PROMPT },
                {
                    role: 'user',
                    content: [
                        { type: 'image_url', image_url: { url: snapImageData } },
                        { type: 'text', text: text || 'Please describe and analyse this image in detail.' }
                    ]
                }
            ];

            if (typeof window.groqFetch !== 'function') {
                showTyping(false);
                appendMessage('assistant', '\u26A0\uFE0F API not ready yet. Please wait a moment and try again.');
                isSending = false; setSendState(false); return;
            }

            window.groqFetch({
                model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                messages: visionMessages,
                max_tokens: 4096,
                temperature: 0.6
            }).then(function(res) { return res.json(); })
            .then(function(data) {
                showTyping(false);
                if (data.error) {
                    var em = data.error.message || 'Vision API error.';
                    appendMessage('assistant', '\u26A0\uFE0F ' + em);
                } else {
                    var reply = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content)
                        ? data.choices[0].message.content
                        : 'Sorry, I could not analyse the image. Please try again.';
                    chatHistory.push({ role: 'assistant', content: reply });
                    streamReply(reply, function() { if (wantsDownloadableDocument(text)) downloadAIArtifact(text, reply); saveSession(); renderHistoryList(); });
                }
                isSending = false; setSendState(false);
            }).catch(function(err) {
                showTyping(false);
                appendMessage('assistant', '\u26A0\uFE0F Image analysis failed: ' + (err.message || 'Unknown error'));
                isSending = false; setSendState(false);
            });
            return;
        }
        /* --- End image vision path --- */

        chatHistory.push({ role: 'user', content: userContent });
        appendMessage('user', userContent);

        var input = document.getElementById('dts-input');
        if (input) { input.value = ''; input.style.height = 'auto'; }

        /* ── Step 1: Detect if web search needed ── */
        var webContext   = '';
        var webSourceTag = '';
        var searchNeeds  = detectSearchNeeds(text);

        if (deepSearchEnabled && text) searchNeeds = { type:'deep', query:text };
        if (searchNeeds && searchNeeds.type === 'deep') {
            showTyping(true, '🔍 Searching…');
            try {
                var qRes = await window.groqFetch({model:'llama-3.1-8b-instant',messages:[{role:'system',content:'Create 2 to 4 distinct concise web search queries that investigate different useful aspects of the user question. Return only one query per line, no commentary.'},{role:'user',content:text}],max_tokens:180,temperature:0.7});
                var qData = qRes && qRes.json ? await qRes.json() : {};
                var queryText = qData.choices && qData.choices[0] && qData.choices[0].message && qData.choices[0].message.content || text;
                var subQueries = queryText.split(/\n|\r/).map(function(q){return q.replace(/^[-*\d.)\s]+/,'').trim();}).filter(Boolean).slice(0,4);
                if (subQueries.length < 2) subQueries = [text, text + ' examples and explanation'];
                var deepResults = await Promise.all(subQueries.map(function(q){return performWebSearch(q).catch(function(){return null;});}));
                webContext = deepResults.filter(Boolean).map(function(r,i){return 'Query '+(i+1)+' ('+subQueries[i]+') via '+r.source+':\n'+r.content;}).join('\n\n');
                if (webContext) { webSourceTag = '🔍 *Deep search: multi-query research pass using ' + Array.from(new Set(deepResults.filter(Boolean).map(function(r){return r.source;}))).join(', ') + '*'; }
                else { webContext = 'No external search results were available. Answer from your existing knowledge, clearly distinguish it from verified research.'; webSourceTag = '🔍 *Deep search: multi-query reasoning pass (no external results returned)*'; }
            } catch(deepErr) { webContext = 'No external search results were available. Answer from your existing knowledge, clearly distinguish it from verified research.'; webSourceTag = '\uD83D\uDD0D *Deep search*'; }
            /* Scrape detail pass: emails/app names/contact details from top result pages */
            try {
                var detailLinks = [];
                (deepResults || []).filter(Boolean).forEach(function(r){ if (r && r.links) detailLinks = detailLinks.concat(r.links); });
                if (detailLinks.length && typeof window._aqsWebScrapePage === 'function') {
                    showTyping(true, '\uD83D\uDF04 Reading top pages for contact details...');
                    var scraped = await Promise.all(detailLinks.slice(0, 3).map(function(u){ return window._aqsWebScrapePage(u).catch(function(){ return null; }); }));
                    var det = scraped.filter(Boolean).map(function(d){ return 'PAGE: ' + d.url + '\nTitle: ' + (d.title||'') + '\nEmails: ' + ((d.emails&&d.emails.join(', '))||'none found') + '\nPhones: ' + ((d.phones&&d.phones.join(', '))||'none found') + '\nPage text (excerpt): ' + ((d.text||'').slice(0, 1500)); }).join('\n\n');
                    if (det) webContext = webContext + '\n\n=== SCRAPED PAGE DETAILS (extract emails, app names, contact info from these) ===\n' + det;
                }
            } catch (scrapeErr) { console.warn('scrape pass failed', scrapeErr); }
        } else if (searchNeeds) {
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
                             '\nCRITICAL INSTRUCTIONS FOR WEB DATA:\n' +
                             '1. You HAVE successfully visited/searched the web and the content above is the REAL live data from that page or search.\n' +
                             '2. Extract and present the most relevant information from the web data clearly and comprehensively.\n' +
                             '3. Always tell the user which website or source the information came from.\n' +
                             '4. If the page content seems unrelated or insufficient, say so and offer to search differently.\n' +
                             '5. NEVER say you cannot browse the internet — you just did.';
        }

        /* Trim to last 20 messages to prevent token explosion on long sessions */
        var histSlice = chatHistory.length > 20 ? chatHistory.slice(chatHistory.length - 20) : chatHistory.slice();
        var messages = [{ role: 'system', content: dynamicSystem }].concat(histSlice);

        if (typeof window.groqFetch !== 'function') {
            showTyping(false);
            appendMessage('assistant', '\u26A0\uFE0F API not ready yet. Please wait a moment and try again.');
            isSending = false;
            setSendState(false);
            return;
        }

        /* ── Step 3: Call Groq — wrapped so rate-limit auto-retry stays within this turn ── */
        function _attemptCall(attemptN) {
            window.groqFetch({
                model:       'llama-3.3-70b-versatile',
                messages:    messages,
                max_tokens:  4096,
                temperature: 0.6
            }).then(function (res) {
                if (!res) return { error: { message: 'All AI keys were rejected (invalid, expired or out of quota). Add a fresh Groq key in Admin Settings \u2192 AI Keys.' } };
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
                        if (wantsDownloadableDocument(text)) downloadAIArtifact(text, reply);
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
                var errMsg = (err && err.message) ? err.message : String(err || '');
                /* ── App cold-start: Firebase may not have loaded keys yet — retry up to 2× ── */
                if ((errMsg.indexOf('No AI keys') !== -1 || errMsg.indexOf('not configured') !== -1) && (_retryCount || 0) < 2) {
                    showTyping(true, 'Connecting to AI\u2026 please wait');
                    isSending = false;
                    setSendState(false);
                    setTimeout(function () { sendMessage(text, (_retryCount || 0) + 1); }, 2200);
                    return;
                }
                /* ── Rate-limit: auto-retry once after 65 s — user never has to re-send ── */
                if ((errMsg.indexOf('busy') !== -1 || errMsg.indexOf('rate-limit') !== -1 || errMsg.indexOf('cooling') !== -1) && attemptN < 1) {
                    showTyping(true, '\u23F3 Rate limited \u2014 auto-retrying in 65 seconds\u2026');
                    setTimeout(function () { _attemptCall(1); }, 65000);
                    return;
                }
                showTyping(false);
                var displayMsg;
                if (errMsg.indexOf('No AI keys') !== -1 || errMsg.indexOf('not configured') !== -1) {
                    displayMsg = '\u26A0\uFE0F No AI keys are set up yet. Ask the admin to add Groq, Mistral, or HuggingFace keys in Settings \u2192 AI Keys.';
                } else if (errMsg.indexOf('busy') !== -1 || errMsg.indexOf('rate-limit') !== -1 || errMsg.indexOf('cooling') !== -1) {
                    displayMsg = '\u26A0\uFE0F All AI keys are busy right now. Please wait 1 minute and try again.';
                } else if (errMsg.indexOf('Failed to fetch') !== -1 || errMsg.indexOf('NetworkError') !== -1 || errMsg.indexOf('net::') !== -1) {
                    displayMsg = '\u26A0\uFE0F Connection error. Please check your internet and try again.';
                } else if (errMsg) {
                    displayMsg = '\u26A0\uFE0F ' + errMsg;
                } else {
                    displayMsg = '\u26A0\uFE0F Something went wrong. Please try again.';
                }
                appendMessage('assistant', displayMsg);
                if(window._AQS_ADMIN_MODE){console.error('[dts] AI error:',err);}else{window._aqsAIErrorLog=window._aqsAIErrorLog||[];window._aqsAIErrorLog.unshift({t:new Date().toISOString(),level:'error',msg:'Studio AI: '+(err&&err.message||err)});}
                isSending = false;
                setSendState(false);
            });
        }
        _attemptCall(0);
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
            window.location.href = cfg.create_url || 'quiz-setup.html';
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
        attachedImageData = null;
        attachedImageName = null;
        var status = document.getElementById('dts-file-status');
        if (status) { status.style.display = 'none'; status.textContent = ''; }
        var fi = document.getElementById('dts-file-input');
        if (fi) fi.value = '';
        var ii = document.getElementById('dts-image-input');
        if (ii) ii.value = '';
    }

    function handleImageAttach(file) {
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) { alert('Image too large. Maximum 5 MB.'); return; }
        var name = file.name;
        var setStatus = function(txt) {
            var s = document.getElementById('dts-file-status');
            if (s) { s.style.display = ''; s.textContent = txt; }
        };
        setStatus('\uD83D\uDDBC\uFE0F Reading image\u2026');
        var reader = new FileReader();
        reader.onload = function(e) {
            attachedImageData = e.target.result;
            attachedImageName = name;
            /* Clear any file attachment — image takes precedence */
            attachedFileText = null;
            attachedFileName = null;
            setStatus('\uD83D\uDDBC\uFE0F ' + name + ' attached — AI will analyse this image');
        };
        reader.onerror = function() { setStatus('\u274C Could not read image'); };
        reader.readAsDataURL(file);
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
        voiceSessionId += 1;
        voiceOperationId += 1;
        voiceMicLocked = false;
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = null;
        setVoiceState('idle');
        voiceActive = true;
    }

    function closeVoiceModal() {
        voiceActive = false;
        voiceMicLocked = true;
        voiceSessionId += 1;
        voiceOperationId += 1;
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = null;
        stopVoiceListening();
        stopAiSpeech();
        var overlay = document.getElementById('dts-voice-overlay');
        if (overlay) overlay.style.display = 'none';
        setVoiceState('closed');
    }

    function stopVoiceListening() {
        /* Invalidate the instance before aborting it. Browsers can dispatch a
           final result/error synchronously during abort, and stale callbacks
           must never be allowed to restart the microphone. */
        var activeRecognition = voiceRecognition;
        voiceRecognition = null;
        if (activeRecognition) {
            try { activeRecognition.abort(); } catch (e) {}
        }
    }

    function stopAiSpeech() {
        voiceOperationId += 1;
        stopVoiceListening();
        voiceAiTalking = false;
        if (currentStudioAudio) {
            try { currentStudioAudio.pause(); } catch (e) {}
            currentStudioAudio = null;
        }
        if (window.AQSVoice && typeof window.AQSVoice.stop === 'function') {
            try { window.AQSVoice.stop(); } catch (e) {}
        }
        if (typeof window.speechSynthesis !== 'undefined') {
            window.speechSynthesis.cancel();
        }
    }

    function scheduleVoiceRestart(sessionId, delay) {
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = setTimeout(function () {
            voiceRestartTimer = null;
            if (voiceActive && sessionId === voiceSessionId &&
                !voiceMicLocked && !voiceAiTalking && !voiceRecognition) {
                startVoiceListening();
            }
        }, delay || 450);
    }

    function startVoiceListening() {
        /* Hard lock: do not reopen the mic while thinking, speaking, or while
           a previous recognition instance is still unwinding. */
        if (!voiceActive || voiceMicLocked || voiceAiTalking || voiceRecognition) return;
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) {
            setVoiceState('error');
            setVoiceTranscript('Speech recognition is not supported in this browser. Try Chrome or Edge.');
            return;
        }
        var sessionId = voiceSessionId;
        var rec = new SR();
        rec.continuous     = false;
        rec.interimResults = true;
        rec.lang           = 'en-US';
        voiceRecognition   = rec;
        setVoiceState('listening');
        setVoiceTranscript('Listening\u2026');

        function isCurrentRecognition() {
            return voiceActive && sessionId === voiceSessionId && voiceRecognition === rec;
        }

        rec.onresult = function (e) {
            if (!isCurrentRecognition()) return;
            var transcript = '';
            for (var i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            setVoiceTranscript(transcript);
            if (e.results[e.results.length - 1].isFinal && transcript.trim()) {
                /* Abort and invalidate recognition before the AI request
                   starts. This prevents the user's remaining speech or a
                   late browser event from leaking into the AI playback. */
                stopVoiceListening();
                setVoiceState('thinking');
                handleVoiceInput(transcript.trim(), sessionId);
            }
        };

        rec.onerror = function (e) {
            if (!isCurrentRecognition()) return;
            voiceRecognition = null;
            if (e && e.error === 'aborted') return;
            setVoiceState('error');
            setVoiceTranscript('Mic error: ' + (e.error || 'unknown'));
        };

        rec.onend = function () {
            if (voiceRecognition !== rec) return;
            voiceRecognition = null;
            if (voiceActive && !voiceMicLocked && !voiceAiTalking) {
                var orb = document.getElementById('dts-voice-orb');
                if (orb && orb.dataset.state === 'listening') setVoiceState('idle');
            }
        };

        setTimeout(function () {
            if (!isCurrentRecognition()) return;
            try { rec.start(); } catch (e) {
                if (!isCurrentRecognition()) return;
                voiceRecognition = null;
                setVoiceState('error');
                setVoiceTranscript('Could not access microphone: ' + e.message);
            }
        }, 120);
    }

    async function handleVoiceInput(text, sessionId) {
        if (!voiceActive || sessionId !== voiceSessionId) return;
        voiceMicLocked = true;
        clearTimeout(voiceRestartTimer);
        voiceRestartTimer = null;
        stopVoiceListening();
        chatHistory.push({ role: 'user', content: text });
        appendMessage('user', text);
        showTyping(true, 'XZILY AI is thinking\u2026');

        if (typeof window.groqFetch !== 'function') {
            showTyping(false);
            if (!voiceActive || sessionId !== voiceSessionId) return;
            voiceMicLocked = false;
            setVoiceState('error');
            setVoiceTranscript('API not available.');
            return;
        }

        /* Web search for voice too */
        var voiceWebContext = '';
        var searchNeeds = detectSearchNeeds(text);
        if (deepSearchEnabled && text) searchNeeds = { type:'deep', query:text };
        if (searchNeeds && searchNeeds.type === 'deep') {
            showTyping(true, '🔍 Searching…');
            try {
                var qRes = await window.groqFetch({model:'llama-3.1-8b-instant',messages:[{role:'system',content:'Create 2 to 4 distinct concise web search queries that investigate different useful aspects of the user question. Return only one query per line, no commentary.'},{role:'user',content:text}],max_tokens:180,temperature:0.7});
                var qData = qRes && qRes.json ? await qRes.json() : {};
                var queryText = qData.choices && qData.choices[0] && qData.choices[0].message && qData.choices[0].message.content || text;
                var subQueries = queryText.split(/\n|\r/).map(function(q){return q.replace(/^[-*\d.)\s]+/,'').trim();}).filter(Boolean).slice(0,4);
                if (subQueries.length < 2) subQueries = [text, text + ' examples and explanation'];
                var deepResults = await Promise.all(subQueries.map(function(q){return performWebSearch(q).catch(function(){return null;});}));
                webContext = deepResults.filter(Boolean).map(function(r,i){return 'Query '+(i+1)+' ('+subQueries[i]+') via '+r.source+':\n'+r.content;}).join('\n\n');
                if (webContext) { webSourceTag = '🔍 *Deep search: multi-query research pass using ' + Array.from(new Set(deepResults.filter(Boolean).map(function(r){return r.source;}))).join(', ') + '*'; }
                else { webContext = 'No external search results were available. Answer from your existing knowledge, clearly distinguish it from verified research.'; webSourceTag = '🔍 *Deep search: multi-query reasoning pass (no external results returned)*'; }
            } catch(deepErr) { webContext = 'No external search results were available. Answer from your existing knowledge, clearly distinguish it from verified research.'; webSourceTag = '🔍 *Deep search: multi-query reasoning pass (external search unavailable)*'; }
        } else if (searchNeeds) {
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
            if (!voiceActive || sessionId !== voiceSessionId) return;
            showTyping(false);
            if (data.error || !data.choices) {
                voiceMicLocked = false;
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
            voiceMicLocked = true;
            clearTimeout(voiceRestartTimer);
            voiceRestartTimer = null;
            stopVoiceListening();
            var speechOperationId = ++voiceOperationId;
            speakStudioChunked(spoken, function () {
                if (!voiceActive || sessionId !== voiceSessionId ||
                    speechOperationId !== voiceOperationId) return;
                voiceAiTalking = false;
                voiceMicLocked = false;
                setVoiceState('idle');
                /* One guarded restart only — never stack retries after an interrupt. */
                scheduleVoiceRestart(sessionId, 450);
            });
        }).catch(function () {
            if (!voiceActive || sessionId !== voiceSessionId) return;
            showTyping(false);
            voiceMicLocked = false;
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

        /* Android must not use blob URLs with HTMLAudioElement. Route each
           chunk through the shared voice layer, which uses native MediaPlayer
           for the packaged app and reports completion consistently. */
        if (window.AQSVoice && window.AQSVoice.usingAndroidNative &&
            typeof window.AQSVoice.speak === 'function') {
            function playNativeNext() {
                if (!voiceAiTalking || idx >= chunks.length) { finish(); return; }
                var chunk = chunks[idx++];
                currentStudioAudio = window.AQSVoice.speak(chunk, {
                    voice: 'onyx',
                    rate: 1.0,
                    onend: function () {
                        currentStudioAudio = null;
                        playNativeNext();
                    },
                    onerror: function () {
                        currentStudioAudio = null;
                        playNativeNext();
                    }
                });
            }
            playNativeNext();
            return;
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

        /* ── Deep search toggle ── */
        var deepBtn = document.getElementById('dts-deep-search');
        if (deepBtn) deepBtn.addEventListener('click', function(){ deepSearchEnabled=!deepSearchEnabled; deepBtn.setAttribute('aria-pressed',String(deepSearchEnabled)); deepBtn.textContent=deepSearchEnabled?'Deep search: On':'Deep search: Off'; });

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

        /* ── Image input ── */
        var imageInput = document.getElementById('dts-image-input');
        if (imageInput) {
            imageInput.addEventListener('change', function () {
                if (this.files && this.files[0]) handleImageAttach(this.files[0]);
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
                    voiceMicLocked = false;
                    setVoiceState('idle');
                    /* Interrupt: mic turns back on so user can continue immediately */
                    scheduleVoiceRestart(voiceSessionId, 300);
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
