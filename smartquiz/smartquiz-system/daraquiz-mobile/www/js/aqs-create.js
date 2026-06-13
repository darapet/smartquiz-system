/* AI Quiz System — Frontend Create Quiz v2 (standalone, based on admin JS) */
/* AI quiz generation via Pollinations/Groq directly from browser */
(function ($) {
    'use strict';

    if (!$('#aqs-extract-btn').length) return;

    /* ── Local backend config ── */
    var AQS_LOCAL = '';

    /* ── Call local Node.js backend for quiz generation ── */
    async function callLocalQuizBackend(subject, topic, mode, questionCount) {
        var res = await fetch(AQS_LOCAL + '/api/generate-quiz', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subject: subject,
                topic: topic,
                mode: mode,
                questionCount: questionCount
            })
        });
        if (!res.ok) throw new Error('Local backend responded with status ' + res.status);
        var data = await res.json();
        var qs = Array.isArray(data) ? data : (data.questions || []);
        if (!qs.length) throw new Error('Local backend returned no questions');
        return qs;
    }

    /* ── Render quiz result in the #aqs-quiz-result container ── */
    function renderQuizResult(questions) {
        var $container = $('#aqs-quiz-result');
        if (!$container.length) return;
        var letters = ['A', 'B', 'C', 'D', 'E'];
        var html = '<div style="background:#fff;border:1.5px solid #e0e0f0;border-radius:16px;overflow:hidden;">' +
            '<div style="background:linear-gradient(90deg,#6366f1,#8b5cf6);padding:14px 20px;display:flex;align-items:center;justify-content:space-between;">' +
                '<strong style="color:#fff;font-size:1rem;">✦ AI-Generated Quiz Preview</strong>' +
                '<span style="color:rgba(255,255,255,.8);font-size:.82rem;">' + questions.length + ' question' + (questions.length !== 1 ? 's' : '') + ' from local backend</span>' +
            '</div>' +
            '<div style="padding:20px;display:flex;flex-direction:column;gap:20px;" id="aqs-qr-list">';

        questions.forEach(function(q, i) {
            var correctIdx = typeof q.correct_answer_index === 'number' ? q.correct_answer_index : 0;
            html += '<div style="background:#f8f8ff;border:1px solid #e8e8f5;border-radius:12px;padding:16px;">' +
                '<div style="font-weight:700;color:#1e1b4b;font-size:.95rem;margin-bottom:12px;">' +
                    '<span style="background:#6366f1;color:#fff;border-radius:6px;padding:2px 9px;font-size:.78rem;margin-right:8px;">Q' + (i + 1) + '</span>' +
                    escHtml(q.question || '') +
                '</div>' +
                '<div style="display:flex;flex-direction:column;gap:7px;">';
            (q.options || []).forEach(function(opt, oi) {
                var isCorrect = oi === correctIdx;
                html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-radius:8px;' +
                    (isCorrect ? 'background:#f0fdf4;border:1.5px solid #86efac;' : 'background:#fff;border:1px solid #e5e7eb;') + '">' +
                    '<span style="flex-shrink:0;width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.75rem;font-weight:700;' +
                        (isCorrect ? 'background:#22c55e;color:#fff;' : 'background:#e5e7eb;color:#555;') + '">' +
                        letters[oi] + '</span>' +
                    '<span style="font-size:.88rem;color:' + (isCorrect ? '#166534' : '#374151') + ';">' + escHtml(opt) + '</span>' +
                    (isCorrect ? '<span style="margin-left:auto;font-size:.75rem;color:#16a34a;font-weight:600;">✓ Correct</span>' : '') +
                '</div>';
            });
            html += '</div>';
            if (q.explanation) {
                html += '<div style="margin-top:10px;padding:8px 12px;background:#eff6ff;border-left:3px solid #6366f1;border-radius:0 6px 6px 0;font-size:.82rem;color:#1e40af;">' +
                    '<strong>Explanation:</strong> ' + escHtml(q.explanation) + '</div>';
            }
            html += '</div>';
        });

        html += '</div></div>';
        $container.html(html).show();
        $('html,body').animate({ scrollTop: $container.offset().top - 20 }, 500);
    }

    /* ── Studio import — check sessionStorage immediately on load ── */
    setTimeout(function() {
        var raw = '';
        try { raw = sessionStorage.getItem('aqs_studio_import') || ''; } catch(e) {}
        if (!raw) return;
        try {
            var imported = JSON.parse(raw);
            sessionStorage.removeItem('aqs_studio_import');
            var qs = (imported && Array.isArray(imported.questions) && imported.questions.length) ? imported.questions : null;
            if (!qs) return;
            extractedQuestions = qs;
            var banner = $('<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px 16px;display:flex;align-items:flex-start;gap:12px;margin-bottom:16px;">' +
                '<span style="font-size:22px;">&#128229;</span>' +
                '<div><strong style="color:#166534;">Questions imported from AI Studio</strong>' +
                '<p style="margin:4px 0 0;color:#166534;font-size:0.88rem;">' +
                qs.length + ' question' + (qs.length !== 1 ? 's' : '') +
                ' ready \u2014 review and edit below, then publish when ready.</p></div></div>');
            $('#aqs-create-form-wrap, .aqs-create-wrap').first().prepend(banner);
            renderQuestions(qs);
            $('#step-questions, #step-custom-form, #step-publish').show();
            setTimeout(function() {
                $('html,body').animate({ scrollTop: $('#step-questions').offset().top - 20 }, 500);
            }, 100);
        } catch(e) {}
    }, 0);

    /* ── State ──────────────────────────────────────────────── */
    var extractedQuestions = [];
    var currentSource = 'upload';
    var uploadedFile  = null;
    var currentQuizId = null;
    var quizFormat    = 'single';  /* 'single' | 'multi' */
    var customFormFields = []; /* [{label, type, required}] */
    var sections      = [];        /* [{name,source,file,topicText,difficulty,numQ,questions,generating}] */

    /* ── Helpers ─────────────────────────────────────────────── */
    function escHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    function hasMath(str) {
        return str && /\$|\\\[|\\\(|\\[a-z]/.test(str);
    }

    /* renderMath — same algorithm as admin, uses KaTeX */
    function renderMath(text) {
        if (!text) return '';
        if (typeof katex === 'undefined') return escHtml(text);
        var t = String(text);
        t = t.replace(/\\\[([\s\S]+?)\\\]/g, function(_, m) { return '$$' + m + '$$'; });
        t = t.replace(/\\\(([\s\S]+?)\\\)/g, function(_, m) { return '$'  + m + '$';  });
        t = t.replace(/\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g, function(_, m) { return '$$' + m + '$$'; });
        var displayMath = [];
        t = t.replace(/\$\$([\s\S]+?)\$\$/g, function(_, math) {
            var rendered;
            try { rendered = '<span class="aqs-katex-display">' + katex.renderToString(math.trim(), { displayMode: true, throwOnError: false, strict: 'ignore' }) + '</span>'; }
            catch(e) { rendered = escHtml('$$' + math + '$$'); }
            displayMath.push(rendered);
            return '\x00DM' + (displayMath.length - 1) + '\x00';
        });
        var inlineMath = [];
        t = t.replace(/\$([^$\n]{1,500}?)\$/g, function(_, math) {
            if (/^\d[\d,\.]*$/.test(math.trim())) return '$' + math + '$';
            var rendered;
            try { rendered = katex.renderToString(math.trim(), { displayMode: false, throwOnError: false, strict: 'ignore' }); }
            catch(e) { rendered = escHtml('$' + math + '$'); }
            inlineMath.push(rendered);
            return '\x00IM' + (inlineMath.length - 1) + '\x00';
        });
        var parts = t.split(/(\x00(?:DM|IM)\d+\x00)/);
        var html  = parts.map(function(chunk) {
            if (/^\x00(DM|IM)\d+\x00$/.test(chunk)) return chunk;
            return escHtml(chunk);
        }).join('');
        inlineMath.forEach(function(r, i)  { html = html.split('\x00IM' + i + '\x00').join(r); });
        displayMath.forEach(function(r, i) { html = html.split('\x00DM' + i + '\x00').join(r); });
        return html;
    }

    function mathPreviewHtml(text) {
        if (!hasMath(text)) return '';
        return '<div class="aqs-math-preview" style="margin-top:4px;padding:6px 10px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;font-size:.93em;color:#374151;">' +
            '<span style="font-size:.78em;color:#9ca3af;display:block;margin-bottom:2px;">Math preview:</span>' +
            renderMath(text) + '</div>';
    }

    /* ── Mode toggle ─────────────────────────────────────────── */
    $(document).on('click', '.aqs-toggle', function() {
        $('.aqs-toggle').removeClass('active');
        $(this).addClass('active');
        $('#aqs-mode').val($(this).data('mode'));
    });

    /* ── Source tabs ─────────────────────────────────────────── */
    /* ── Format card (Single vs Multi-Topic) ────────────────── */
    $(document).on('click', '.aqs-format-card[data-format]', function() {
        $('.aqs-format-card').removeClass('aqs-format-card--active');
        $(this).addClass('aqs-format-card--active');
        quizFormat = $(this).data('format');
        if (quizFormat === 'multi') {
            $('#step-source').hide();
            $('#step-multi-sections').show();
            if (!sections.length) initSections(2);
            $('html,body').animate({ scrollTop: $('#step-multi-sections').offset().top - 20 }, 400);
        } else {
            $('#step-source').show();
            $('#step-multi-sections').hide();
            $('#step-questions, #step-publish').hide();
        }
    });

    $(document).on('click', '.aqs-source-tab', function() {
        if ($(this).closest('.aqs-sec-tabs').length) return; /* handled by section tab handler */
        $(this).closest('.aqs-source-tabs').find('.aqs-source-tab').removeClass('active');
        $(this).addClass('active');
        currentSource = $(this).data('source');
        $('.aqs-source-panel').not('[data-sec]').hide();
        $('#source-' + currentSource).show();
        if (currentSource === 'manual') {
            $('#aqs-extract-btn').hide(); $('#aqs-manual-start-btn').show();
            $('#step-questions, #step-custom-form, #step-publish').show();
        } else {
            $('#aqs-extract-btn').show(); $('#aqs-manual-start-btn').hide();
            if (!extractedQuestions.length) { $('#step-questions, #step-publish').hide(); }
        }
    });

    /* ── File upload ─────────────────────────────────────────── */
    $('#aqs-browse-btn').on('click', function() { $('#aqs-file-input').click(); });

    var uploadZone = document.getElementById('aqs-upload-zone');
    if (uploadZone) {
        uploadZone.addEventListener('dragover', function(e) { e.preventDefault(); uploadZone.classList.add('drag-over'); });
        uploadZone.addEventListener('dragleave', function() { uploadZone.classList.remove('drag-over'); });
        uploadZone.addEventListener('drop', function(e) {
            e.preventDefault(); uploadZone.classList.remove('drag-over');
            if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
        });
    }

    $('#aqs-file-input').on('change', function() { if (this.files[0]) setFile(this.files[0]); });

    function setFile(file) {
        uploadedFile = file;
        $('#aqs-file-name').text(file.name);
        $('#aqs-upload-zone').hide(); $('#aqs-file-info').show();
    }

    $(document).on('click', '#aqs-remove-file', function() {
        uploadedFile = null; $('#aqs-file-input').val('');
        $('#aqs-upload-zone').show(); $('#aqs-file-info').hide();
    });

    /* ── File text extraction ────────────────────────────────── */
    async function extractTextFromFile(file) {
        if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) return extractPDF(file);
        return extractDocx(file);
    }

    async function extractPDF(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    if (typeof pdfjsLib === 'undefined') throw new Error('PDF.js library is not loaded. Please refresh the page.');
                    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    var pdf = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                    var pages = [];
                    for (var i = 1; i <= pdf.numPages; i++) {
                        var page = await pdf.getPage(i);
                        var content = await page.getTextContent();
                        var pageText = '';
                        var lastY = null;
                        content.items.forEach(function(item) {
                            if (lastY !== null && Math.abs(item.transform[5] - lastY) > 5) pageText += '\n';
                            pageText += item.str;
                            lastY = item.transform[5];
                        });
                        pages.push(pageText);
                    }
                    var full = pages.join('\n\n');
                    if (!full.trim()) throw new Error('PDF appears empty or is image-only. Try a text-based PDF.');
                    resolve(full);
                } catch(err) { reject(err); }
            };
            reader.onerror = function() { reject(new Error('Could not read file.')); };
            reader.readAsArrayBuffer(file);
        });
    }

    async function extractDocx(file) {
        return new Promise(function(resolve, reject) {
            var reader = new FileReader();
            reader.onload = async function(e) {
                try {
                    if (typeof mammoth === 'undefined') throw new Error('Mammoth.js library is not loaded. Please refresh the page.');
                    var result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                    if (!result.value || !result.value.trim()) throw new Error('Document appears to be empty or could not be read.');
                    resolve(result.value);
                } catch(err) { reject(err); }
            };
            reader.onerror = function() { reject(new Error('Could not read file.')); };
            reader.readAsArrayBuffer(file);
        });
    }

    async function callGroqDirect(prompt) {
        if (typeof window.groqFetch !== 'function') return null;
        var isMath = isMathPrompt(prompt);
        var groqModel  = isMath ? 'llama-3.3-70b-versatile' : 'llama-3.1-8b-instant';
        var groqTokens = isMath ? 6144 : 4096;
        var groqTimeout= isMath ? 45000 : 20000;
        setStatus(isMath ? 'Generating math questions via Groq (may take ~30s)…' : 'Generating questions via Groq...');
        /* Try up to 2 model attempts — if 70b times out, fall back to 8b.
           groqFetch handles 429 key rotation automatically within each attempt. */
        var modelsToTry = isMath ? [groqModel, 'llama-3.1-8b-instant'] : [groqModel];
        for (var mi = 0; mi < modelsToTry.length; mi++) {
            var m = modelsToTry[mi], tk = (m === 'llama-3.3-70b-versatile') ? groqTokens : 4096;
            var to = (m === 'llama-3.3-70b-versatile') ? groqTimeout : 20000;
            try {
                var ctrl = new AbortController();
                var tid  = setTimeout(function() { ctrl.abort(); }, to);
                var res  = await window.groqFetch({
                    model: m,
                    messages: [
                        { role: 'system', content: 'You are an expert quiz maker. Output ONLY raw valid JSON. No markdown, no code fences.' },
                        { role: 'user',   content: prompt }
                    ],
                    max_tokens: tk, temperature: 0.3,
                    response_format: { type: 'json_object' }
                }, { signal: ctrl.signal });
                clearTimeout(tid);
                if (!res.ok) continue;
                var data = await res.json();
                var text = (((data.choices || [])[0] || {}).message || {}).content || '';
                if (text.trim().length > 20) return text.trim();
            } catch(e) { /* retry next model */ }
        }
        return null;
    }

    /* ── AI: Pollinations race ───────────────────────────────── */
    async function callAIDirect(prompt) {
        var MODELS = ['openai-fast', 'openai', 'mistral', 'deepseek'];
        setStatus('Generating questions...');
        var controllers = MODELS.map(function() { return new AbortController(); });

        var modelPromises = MODELS.map(function(model, idx) {
            var tid = setTimeout(function() { controllers[idx].abort(); }, 20000);
            return fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controllers[idx].signal,
                body: JSON.stringify({
                    model: model, seed: Math.floor(Math.random() * 99999), temperature: 0.4, private: true,
                    messages: [
                        { role: 'system', content: 'You are an expert quiz maker. Output ONLY raw valid JSON. No markdown, no code fences.' },
                        { role: 'user',   content: prompt }
                    ]
                })
            })
            .then(function(resp) { clearTimeout(tid); if (!resp.ok) throw new Error('HTTP ' + resp.status); return resp.json(); })
            .then(function(data) {
                var text = ((((data.choices || [])[0] || {}).message) || {}).content || '';
                text = text.trim();
                if (!text || text.length < 20) throw new Error('Empty');
                controllers.forEach(function(c) { try { c.abort(); } catch(e2) {} });
                return text;
            })
            .catch(function(e) { clearTimeout(tid); return null; });
        });

        return new Promise(function(resolve, reject) {
            var remaining = modelPromises.length;
            modelPromises.forEach(function(p) {
                p.then(function(val) {
                    if (val !== null) { resolve(val); }
                    else { remaining--; if (remaining === 0) reject(new Error('All AI models failed. Please check your internet and try again.')); }
                });
            });
        });
    }

    /* ── AI: proxy → direct fallback ────────────────────────── */
    var PROXY_FAIL_KEY = 'aqs_proxy_fail_until';
    function proxyIsDown() { try { return Date.now() < parseInt(localStorage.getItem(PROXY_FAIL_KEY) || '0', 10); } catch(e) { return false; } }
    function markProxyDown() { try { localStorage.setItem(PROXY_FAIL_KEY, String(Date.now() + 4*60*60*1000)); } catch(e) {} }
    function markProxyUp()   { try { localStorage.removeItem(PROXY_FAIL_KEY); } catch(e) {} }

    /* Math topic keywords — proxy uses 70b model for these, which takes ~20-40s */
    var MATH_KW = ['math','algebra','geometry','calculus','trigonometry','statistics',
        'arithmetic','equation','physics','chemistry','biology','engineering','formula',
        'theorem','integral','derivative','probability','quantitative','numerical',
        'mechanics','electricity','magnetism','thermodynamics','quantum','nuclear'];
    function isMathPrompt(p){ var l=p.toLowerCase(); return MATH_KW.some(function(k){return l.indexOf(k)!==-1;}); }

    async function callAI(prompt) {
        if (proxyIsDown() || !AQS.ajax_url) return callAIDirect(prompt);
        var isMath = isMathPrompt(prompt);
        setStatus(isMath ? 'Generating math questions (this may take ~30s)…' : 'Generating questions...');
        try {
            var text = await new Promise(function(resolve, reject) {
                $.ajax({
                    url: AQS.ajax_url, type: 'POST', timeout: 55000,
                    data: { action: 'aqs_ai_generate', nonce: AQS.nonce, prompt: prompt, model: 'openai-fast', seed: Math.floor(Math.random() * 99999) },
                    success: function(res) {
                        if (res.success && res.data && res.data.text && res.data.text.trim().length > 20) resolve(res.data.text);
                        else reject(new Error('Empty proxy response'));
                    },
                    error: function(xhr, status) {
                        /* Only blacklist proxy on genuine network/server error, not timeout */
                        if (status !== 'timeout') markProxyDown();
                        reject(new Error('Proxy: ' + status));
                    }
                });
            });
            markProxyUp();
            return text;
        } catch(e) { /* fall through to direct */ }
        setStatus('Retrying via direct AI connection…');
        return callAIDirect(prompt);
    }

    /* ── Build AI prompt + parse response ───────────────────── */
    async function generateQuestionsWithAI(textContent, numQ, subject) {

        /* 1️⃣  Local backend — only tried when AQS_LOCAL is explicitly set */
        if (AQS_LOCAL) {
            try {
                var mode  = $('#aqs-mode').val() || 'exam';
                var topic = textContent.startsWith('__TOPIC__:')
                    ? textContent.replace('__TOPIC__:', '').trim()
                    : textContent.substring(0, 2000);
                setStatus('Connecting to local AI backend…');
                var localQs = await callLocalQuizBackend(subject, topic, mode, numQ);
                renderQuizResult(localQs);
                setStatus('Questions received from local backend ✓');
                return localQs;
            } catch (localErr) {
                setStatus('Local backend unavailable — using cloud AI…');
            }
        }

        /* 2️⃣  Fall back to existing cloud AI path */
        var difficulty = $('#aqs-difficulty').val() || 'medium';
        var mathRule = '- For any math use LaTeX: inline → $expression$, display → $$expression$$. Example: "Solve $x^2-5x+6=0$". Never use plain Unicode math symbols.\n';
        var schema   = '{"questions":[{"question":"...","options":["A","B","C","D"],"correct_answer_index":0,"explanation":"..."}]}';
        var prompt;

        if (textContent.startsWith('__TOPIC__:')) {
            var topic = textContent.replace('__TOPIC__:', '').trim();
            prompt = 'Generate exactly ' + numQ + ' multiple-choice questions.\nTopic: ' + topic +
                '\nSubject: ' + subject + '\nDifficulty: ' + difficulty +
                '\n\nRules:\n- Exactly 4 options per question, one correct answer\n- Include a brief explanation\n' +
                mathRule + 'Output RAW JSON ONLY, no markdown:\n' + schema;
        } else {
            var excerpt = textContent.substring(0, 6000);
            prompt = 'Create ' + numQ + ' multiple-choice questions from the text below.\nSubject: ' + subject +
                '\n\nContent:\n' + excerpt +
                '\n\nRules:\n- Exactly 4 options per question, one correct answer\n- Include a brief explanation\n' +
                mathRule + 'Output RAW JSON ONLY, no markdown:\n' + schema;
        }

        /* Generation order:
           1. Groq direct from browser (fast, best quality — only if key is configured)
           2. Pollinations direct from browser (free, NO API key needed — always works)
           3. Server proxy as last resort (slow if server is sleeping on free tier)       */
        var rawText = null;

        /* 1. Groq direct (skipped automatically if no key configured) */
        rawText = await callGroqDirect(prompt);

        /* 2. Pollinations direct — free, no key, works immediately from browser */
        if (!rawText) {
            setStatus('Generating questions via AI (free)…');
            try { rawText = await callAIDirect(prompt); } catch(_) { rawText = null; }
        }

        /* 3. Server proxy last resort */
        if (!rawText) {
            try { rawText = await callAI(prompt); } catch(_aiErr) { rawText = null; }
        }

        if (!rawText) throw new Error('All AI sources failed. Please check your internet connection and try again.');

        /* Bulletproof JSON extraction */
        var cleaned = rawText.replace(/```json[\r\n]*/gi, '').replace(/```[\r\n]*/g, '').trim();
        var ib = cleaned.indexOf('{'), ia = cleaned.indexOf('[');
        if (ib !== -1 && (ia === -1 || ib < ia)) cleaned = cleaned.substring(ib);
        else if (ia !== -1) cleaned = cleaned.substring(ia);

        var parsed = null;
        var om = cleaned.match(/\{[\s\S]*\}/);
        if (om) { try { parsed = JSON.parse(om[0]); } catch(_) {} }
        if (!parsed || !parsed.questions) {
            var am = cleaned.match(/\[[\s\S]*\]/);
            if (am) { try { var a = JSON.parse(am[0]); if (Array.isArray(a)) parsed = { questions: a }; } catch(_) {} }
        }
        if (!parsed || !parsed.questions) {
            try { var d = JSON.parse(cleaned); parsed = Array.isArray(d) ? { questions: d } : d; } catch(_) {}
        }
        if (!parsed || !Array.isArray(parsed.questions) || !parsed.questions.length)
            throw new Error('AI returned an unexpected format. Please try again.');

        return parsed.questions.filter(function(q) {
            return q && typeof q.question === 'string' && Array.isArray(q.options) && q.options.length >= 2;
        });
    }

    /* ── Math normaliser — applied AFTER full AI response received ── */
    /* Converts \( \) → $ $  and \[ \] → $$ $$ so KaTeX renders properly */
    function normalizeMath(text) {
        if (!text || typeof text !== 'string') return text || '';
        /* \[ ... \] → $$ ... $$ (display) */
        text = text.replace(/\\\[([\s\S]+?)\\\]/g, function(_, m) { return '$$' + m.trim() + '$$'; });
        /* \( ... \) → $ ... $ (inline) */
        text = text.replace(/\\\(([\s\S]+?)\\\)/g, function(_, m) { return '$' + m.trim() + '$'; });
        /* \begin{equation} ... \end{equation} → $$ ... $$ */
        text = text.replace(/\\begin\{(?:equation|align)\*?\}([\s\S]+?)\\end\{(?:equation|align)\*?\}/g, function(_, m) { return '$$' + m.trim() + '$$'; });
        return text;
    }
    function normalizeQuestionsMath(qs) {
        return qs.map(function(q) {
            return Object.assign({}, q, {
                question:    normalizeMath(q.question),
                options:     (q.options || []).map(normalizeMath),
                explanation: normalizeMath(q.explanation || '')
            });
        });
    }

    /* ── Render question editor ──────────────────────────────── */
    function renderQuestions(questions) {
        var html = '';
        questions.forEach(function(q, i) {
            var qPreview = mathPreviewHtml(q.question);
            var optPreviews = (q.options || []).map(function(opt) { return mathPreviewHtml(opt); });
            html += '<div class="aqs-question-edit" data-index="' + i + '">' +
                '<div class="aqs-question-edit-header">' +
                    '<span class="aqs-q-num-label">Q' + (i + 1) + '</span>' +
                    '<button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-remove-q" data-index="' + i + '">Remove</button>' +
                '</div>' +
                '<div class="aqs-field">' +
                    '<label>Question</label>' +
                    '<textarea class="aqs-q-text" data-index="' + i + '" rows="2">' + escHtml(q.question) + '</textarea>' +
                    qPreview +
                '</div>' +
                '<div class="aqs-options-edit">';
            (q.options || []).forEach(function(opt, oi) {
                html += '<div class="aqs-option-edit" style="flex-direction:column;align-items:flex-start;">' +
                    '<div style="display:flex;align-items:center;width:100%;">' +
                        '<input type="radio" name="correct_' + i + '" class="aqs-correct-radio" data-qi="' + i + '" data-oi="' + oi + '"' + (q.correct_answer_index === oi ? ' checked' : '') + ' title="Mark correct" />' +
                        '<input type="text" class="aqs-opt-text" data-qi="' + i + '" data-oi="' + oi + '" value="' + escHtml(opt) + '" placeholder="Option ' + String.fromCharCode(65 + oi) + '" style="flex:1;" />' +
                    '</div>' + optPreviews[oi] + '</div>';
            });
            html += '</div>' +
                '<div class="aqs-field">' +
                    '<label>Explanation (practice mode)</label>' +
                    '<input type="text" class="aqs-q-explanation" data-index="' + i + '" value="' + escHtml(q.explanation || '') + '" />' +
                    mathPreviewHtml(q.explanation || '') +
                '</div>' +
            '</div>';
        });
        $('#aqs-questions-list').html(html);
        $('#aqs-q-count').text(questions.length + ' question' + (questions.length !== 1 ? 's' : ''));
    }

    /* ── Live math preview while typing ─────────────────────── */
    $(document).on('input', '.aqs-q-text, .aqs-opt-text, .aqs-q-explanation', function() {
        var val = $(this).val();
        var $parent  = $(this).closest('.aqs-field, .aqs-option-edit');
        var $preview = $parent.find('.aqs-math-preview');
        if (hasMath(val)) {
            var inner = '<span style="font-size:.78em;color:#9ca3af;display:block;margin-bottom:2px;">Math preview:</span>' + renderMath(val);
            if ($preview.length) { $preview.html(inner); }
            else { $parent.append('<div class="aqs-math-preview" style="margin-top:4px;padding:6px 10px;background:#f8fafc;border-left:3px solid #6366f1;border-radius:4px;font-size:.93em;color:#374151;">' + inner + '</div>'); }
        } else { $preview.remove(); }
    });

    /* ── Progress helpers ────────────────────────────────────── */
    function showProgress(show) {
        if (show) { $('#aqs-ai-progress').show(); $('#aqs-extract-btn').prop('disabled', true); }
        else       { $('#aqs-ai-progress').hide(); $('#aqs-extract-btn').prop('disabled', false); }
    }
    function setStatus(msg) { $('#aqs-ai-status').text(msg); }

    /* ── Generate button ─────────────────────────────────────── */
    $('#aqs-extract-btn').on('click', async function() {
        var title   = $('#aqs-title').val().trim();
        var subject = $('#aqs-subject').val().trim();
        var numQ    = parseInt($('#aqs-num-questions').val()) || 10;
        if (!title || !subject) { alert('Please fill in the Quiz Title and Subject first.'); return; }

        var textContent = '';
        showProgress(true);

        if (currentSource === 'upload') {
            if (!uploadedFile) { showProgress(false); alert('Please upload a document first.'); return; }
            setStatus('Extracting text from document...');
            try { textContent = await extractTextFromFile(uploadedFile); }
            catch(e) { showProgress(false); alert('Could not read file: ' + e.message); return; }
        } else {
            var topic = $('#aqs-topic-input').val().trim();
            if (!topic) { showProgress(false); alert('Please enter a topic first.'); return; }
            textContent = '__TOPIC__:' + topic;
        }

        setStatus('Contacting AI...');
        try {
            var rawQs     = await generateQuestionsWithAI(textContent, numQ, subject);
            var questions = normalizeQuestionsMath(rawQs);
            extractedQuestions = questions;
            renderQuestions(questions);
            $('#step-questions, #step-custom-form, #step-publish').show();
            showProgress(false);
            $('html,body').animate({ scrollTop: $('#step-questions').offset().top - 20 }, 500);
        } catch(e) {
            showProgress(false);
            alert('AI error: ' + e.message);
        }
    });

    /* ── Manual mode ─────────────────────────────────────────── */
    $(document).on('click', '#aqs-manual-start-btn', function() {
        if (!extractedQuestions.length) {
            extractedQuestions.push({ question: '', options: ['', '', '', ''], correct_answer_index: 0, explanation: '' });
            renderQuestions(extractedQuestions);
        }
        $('#step-questions, #step-custom-form, #step-publish').show();
    });

    $(document).on('click', '#aqs-add-question-btn', function() {
        if (quizFormat === 'multi' && sections.length) {
            sections[sections.length - 1].questions.push({ question: '', options: ['', '', '', ''], correct_answer_index: 0, explanation: '' });
            renderMultiSectionQuestions();
        } else {
            extractedQuestions.push({ question: '', options: ['', '', '', ''], correct_answer_index: 0, explanation: '' });
            renderQuestions(extractedQuestions);
        }
        $('#step-questions, #step-custom-form, #step-publish').show();
    });

    $(document).on('click', '.aqs-remove-q', function() {
        var globalIdx = parseInt($(this).data('index'));
        if (quizFormat === 'multi') {
            var g = 0;
            for (var si = 0; si < sections.length; si++) {
                for (var qi = 0; qi < sections[si].questions.length; qi++) {
                    if (g === globalIdx) { sections[si].questions.splice(qi, 1); renderMultiSectionQuestions(); return; }
                    g++;
                }
            }
        } else {
            extractedQuestions.splice(globalIdx, 1);
            renderQuestions(extractedQuestions);
        }
    });

    /* ── Collect questions from editor ───────────────────────── */
    function collectQuestions() {
        var updated = [];
        if (quizFormat === 'multi' && sections.length) {
            sections.forEach(function(sec, si) {
                var domQs = [];
                $('#aqs-questions-list .aqs-question-edit[data-sec="' + si + '"]').each(function() {
                    var question = $(this).find('.aqs-q-text').val().trim();
                    var options = []; var correctIndex = 0;
                    $(this).find('.aqs-opt-text').each(function() { options.push($(this).val().trim()); });
                    $(this).find('.aqs-correct-radio:checked').each(function() { correctIndex = parseInt($(this).data('oi')); });
                    var explanation = $(this).find('.aqs-q-explanation').val().trim();
                    if (question) domQs.push({ question: question, options: options, correct_answer_index: correctIndex, explanation: explanation, section_label: sec.name });
                });
                var src = domQs.length ? domQs : sec.questions.map(function(q) { return Object.assign({}, q, { section_label: sec.name }); });
                updated = updated.concat(src);
            });
        } else {
            $('#aqs-questions-list .aqs-question-edit').each(function() {
                var question = $(this).find('.aqs-q-text').val().trim();
                var options  = [];
                var correctIndex = 0;
                $(this).find('.aqs-opt-text').each(function() { options.push($(this).val().trim()); });
                $(this).find('.aqs-correct-radio:checked').each(function() { correctIndex = parseInt($(this).data('oi')); });
                var explanation = $(this).find('.aqs-q-explanation').val().trim();
                if (question) updated.push({ question: question, options: options, correct_answer_index: correctIndex, explanation: explanation });
            });
        }
        return updated;
    }

    /* ── Save as draft ───────────────────────────────────────── */
    $('#aqs-save-draft-btn').on('click', function() {
        var qs = collectQuestions();
        if (!$('#aqs-title').val().trim() || !$('#aqs-subject').val().trim()) { alert('Title and subject are required.'); return; }
        if (!qs.length) { alert('Add at least one question.'); return; }
        $.post(AQS.ajax_url, {
            action: 'aqs_save_quiz', nonce: AQS.nonce, quiz_id: currentQuizId || 0,
            title: $('#aqs-title').val().trim(), subject: $('#aqs-subject').val().trim(),
            num_questions: $('#aqs-num-questions').val(), time_limit: $('#aqs-time-limit').val(),
            mode: $('#aqs-mode').val(), allow_retakes: parseInt($('#aqs-max-attempts').val()) || 0,
            show_results: $('input[name="aqs_show_results"]:checked').val() || 'yes',
            questions: JSON.stringify(qs),
            custom_form: JSON.stringify(customFormFields)
        }, function(res) {
            if (res.success) { currentQuizId = res.data.quiz_id; alert('Saved as draft!'); }
            else alert('Error: ' + (res.data || 'Unknown error'));
        });
    });

    /* ── Publish ─────────────────────────────────────────────── */
    $('#aqs-publish-btn').on('click', function() {
        var qs = collectQuestions();
        if (!$('#aqs-title').val().trim() || !$('#aqs-subject').val().trim()) { alert('Title and subject are required.'); return; }
        if (!qs.length) { alert('Add at least one question.'); return; }
        var $btn = $(this);
        $btn.prop('disabled', true).text('Publishing...');

        $.post(AQS.ajax_url, {
            action: 'aqs_save_quiz', nonce: AQS.nonce, quiz_id: currentQuizId || 0,
            title: $('#aqs-title').val().trim(), subject: $('#aqs-subject').val().trim(),
            num_questions: $('#aqs-num-questions').val(), time_limit: $('#aqs-time-limit').val(),
            mode: $('#aqs-mode').val(), allow_retakes: parseInt($('#aqs-max-attempts').val()) || 0,
            show_results: $('input[name="aqs_show_results"]:checked').val() || 'yes',
            questions: JSON.stringify(qs),
            custom_form: JSON.stringify(customFormFields)
        }, function(res) {
            if (!res.success) { $btn.prop('disabled', false).text('Publish & Get Links'); alert('Save error: ' + res.data); return; }
            currentQuizId = res.data.quiz_id;

            var pubPayload = { action: 'aqs_publish_quiz', nonce: AQS.nonce, quiz_id: currentQuizId };
            var expiryType = $('input[name="aqs_expiry_type"]:checked').val() || 'none';
            pubPayload.expiry_type = expiryType;
            if (expiryType === 'datetime')  pubPayload.expiry_datetime = $('#aqs-expiry-datetime').val();
            else if (expiryType === 'duration') {
                pubPayload.expiry_days  = parseInt($('#aqs-expiry-days').val(),  10) || 0;
                pubPayload.expiry_hours = parseInt($('#aqs-expiry-hours').val(), 10) || 0;
            }

            $.post(AQS.ajax_url, pubPayload, function(pubRes) {
                $btn.prop('disabled', false).text('Publish & Get Links');
                if (pubRes.success) {
                    var quizUrl = pubRes.data.quiz_url || '';
                    var challengeUrl = (AQS.challenge_url || '') + '?quiz=' + currentQuizId;
                    $('#aqs-quiz-link').val(quizUrl);
                    $('#aqs-challenge-link').val(challengeUrl);
                    if (pubRes.data.expires_at) {
                        $('#aqs-publish-result').find('.aqs-expiry-notice').remove();
                        $('#aqs-publish-result').append('<p class="aqs-expiry-notice" style="margin:8px 0 0;font-size:.85rem;color:#92400e;background:#fef3c7;padding:6px 12px;border-radius:5px;">&#x23f3; Expires: ' + pubRes.data.expires_at + '</p>');
                    }
                    $('#aqs-publish-result').show();
                    $btn.hide();
                    $('html,body').animate({ scrollTop: $('#aqs-publish-result').offset().top - 30 }, 500);
                } else { alert('Publish error: ' + pubRes.data); }
            });
        });
    });

    /* ── Copy links ──────────────────────────────────────────── */
    $(document).on('click', '#aqs-copy-quiz-link', function() {
        navigator.clipboard.writeText($('#aqs-quiz-link').val()).then(function() {
            var $b = $('#aqs-copy-quiz-link'); $b.text('Copied!'); setTimeout(function() { $b.text('Copy'); }, 2000);
        });
    });
    $(document).on('click', '#aqs-copy-challenge-link', function() {
        navigator.clipboard.writeText($('#aqs-challenge-link').val()).then(function() {
            var $b = $('#aqs-copy-challenge-link'); $b.text('Copied!'); setTimeout(function() { $b.text('Copy'); }, 2000);
        });
    });

    /* ══════════════════════════════════════════════════════════
       MULTI-TOPIC — section management
    ══════════════════════════════════════════════════════════ */

    function initSections(count) {
        sections = [];
        for (var i = 0; i < count; i++) {
            sections.push({ name: 'Topic ' + (i + 1), source: 'topic', file: null,
                topicText: '', difficulty: 'medium', numQ: 5, questions: [], generating: false });
        }
        renderSectionCards();
        renderCustomFormFields();
    }

    function renderSectionCards() {
        var html = '';
        sections.forEach(function(sec, i) {
            var badge = sec.questions.length
                ? '<span style="margin-left:8px;background:#dcfce7;color:#166534;border-radius:12px;padding:2px 10px;font-size:.78rem;font-weight:600;">&#10003; ' + sec.questions.length + ' questions</span>'
                : '';
            var topicStyle  = sec.source === 'topic'  ? '' : 'display:none;';
            var uploadStyle = sec.source === 'upload' ? '' : 'display:none;';
            var fileHtml = sec.file
                ? '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:.85rem;">&#128206; ' + escHtml(sec.file.name) + ' <button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-sec-remove-file" data-idx="' + i + '">Remove</button></div>'
                : '<div class="aqs-upload-zone aqs-sec-upload-zone" data-idx="' + i + '" style="padding:18px;text-align:center;cursor:pointer;margin-top:8px;border-radius:8px;">&#128196; Drop PDF or Word doc, or<br/><input type="file" class="aqs-sec-file-input" data-idx="' + i + '" accept=".pdf,.docx,.doc" style="display:none;" /><button class="aqs-btn aqs-btn-sm aqs-sec-browse-btn" data-idx="' + i + '" style="margin-top:8px;">Browse File</button></div>';
            var genBtn = '<button class="aqs-btn aqs-btn-primary aqs-sec-generate-btn" data-idx="' + i + '">' +
                (sec.generating
                    ? '<span class="aqs-spinner" style="display:inline-block;width:13px;height:13px;border-width:2px;vertical-align:middle;margin-right:6px;"></span>Generating...'
                    : '&#9889; Generate Questions') +
                '</button>';
            var qPreview = sec.questions.length
                ? '<div style="margin-top:10px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;padding:8px 12px;font-size:.83rem;color:#166534;"><strong>' + sec.questions.length + ' question(s) ready</strong> &mdash; ' +
                  sec.questions.slice(0, 2).map(function(q) { return '&ldquo;' + escHtml((q.question || '').substring(0, 55)) + ((q.question || '').length > 55 ? '&hellip;' : '') + '&rdquo;'; }).join(', ') +
                  '</div>'
                : '';
            html += '<div class="aqs-section-card" data-sec="' + i + '" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:14px;">' +
                '<div style="background:#f8fafc;border-bottom:1px solid #e5e7eb;border-radius:10px 10px 0 0;padding:12px 16px;display:flex;align-items:center;gap:10px;">' +
                    '<span class="aqs-step-num" style="width:24px;height:24px;font-size:.78rem;flex-shrink:0;">' + (i + 1) + '</span>' +
                    '<input type="text" class="aqs-section-name-input" data-idx="' + i + '" value="' + escHtml(sec.name) + '" placeholder="Section / Topic Name" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:5px 10px;font-size:.9rem;" />' +
                    badge +
                    (sections.length > 1 ? '<button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-sec-remove" data-idx="' + i + '" style="margin-left:auto;flex-shrink:0;">&#10005;</button>' : '') +
                '</div>' +
                '<div style="padding:16px;">' +
                    '<div class="aqs-source-tabs aqs-sec-tabs" data-sec="' + i + '" style="margin-bottom:12px;">' +
                        '<button class="aqs-source-tab' + (sec.source === 'topic'  ? ' active' : '') + '" data-source="topic"  data-sec="' + i + '">Type Topic</button>' +
                        '<button class="aqs-source-tab' + (sec.source === 'upload' ? ' active' : '') + '" data-source="upload" data-sec="' + i + '">Upload File</button>' +
                    '</div>' +
                    '<div class="aqs-source-panel aqs-sec-panel-topic" data-sec="' + i + '" style="' + topicStyle + '">' +
                        '<div class="aqs-field"><label>Topic or Subject Area</label>' +
                        '<textarea class="aqs-sec-topic-input" data-idx="' + i + '" rows="2" placeholder="e.g. Photosynthesis in plants...">' + escHtml(sec.topicText) + '</textarea></div>' +
                    '</div>' +
                    '<div class="aqs-source-panel aqs-sec-panel-upload" data-sec="' + i + '" style="' + uploadStyle + '">' + fileHtml + '</div>' +
                    '<div class="aqs-field-row" style="margin-top:12px;">' +
                        '<div class="aqs-field"><label>Difficulty</label>' +
                        '<select class="aqs-sec-difficulty" data-idx="' + i + '">' +
                            '<option value="easy"'   + (sec.difficulty === 'easy'   ? ' selected' : '') + '>Easy</option>' +
                            '<option value="medium"' + (sec.difficulty === 'medium' ? ' selected' : '') + '>Medium</option>' +
                            '<option value="hard"'   + (sec.difficulty === 'hard'   ? ' selected' : '') + '>Hard</option>' +
                        '</select></div>' +
                        '<div class="aqs-field"><label>Questions</label>' +
                        '<input type="number" class="aqs-sec-num-q" data-idx="' + i + '" value="' + sec.numQ + '" min="1" max="20" style="width:80px;" /></div>' +
                    '</div>' +
                    '<div style="margin-top:12px;">' + genBtn + '</div>' +
                    '<div class="aqs-sec-progress-wrap" data-idx="' + i + '" style="display:' + (sec.generating ? 'flex' : 'none') + ';align-items:center;gap:8px;margin-top:10px;">' +
                        '<div class="aqs-spinner" style="width:13px;height:13px;border-width:2px;flex-shrink:0;"></div>' +
                        '<span class="aqs-sec-status" data-idx="' + i + '" style="font-size:.82rem;color:#0369a1;"></span>' +
                    '</div>' +
                    qPreview +
                '</div>' +
            '</div>';
        });
        $('#aqs-sections-container').html(html);
    }


    /* ═══════════════════════════════════════════════
       CUSTOM FORM FIELDS BUILDER
    ═══════════════════════════════════════════════ */
    function renderCustomFormFields() {
        var c = $('#aqs-custom-form-container');
        if (!c.length) return;
        var html = '';
        if (!customFormFields.length) {
            html = '<p style="color:#6b7280;font-size:.85rem;margin:0 0 10px;">No custom fields yet. Participants will be asked to fill these before starting the quiz.</p>';
        }
        customFormFields.forEach(function(f, i) {
            var reqBadge = f.required
                ? '<span style="background:#fef2f2;color:#ef4444;border-radius:12px;padding:1px 8px;font-size:.72rem;font-weight:600;margin-left:6px;">Required</span>'
                : '<span style="background:#f1f5f9;color:#94a3b8;border-radius:12px;padding:1px 8px;font-size:.72rem;margin-left:6px;">Optional</span>';
            html += '<div style="display:flex;align-items:center;gap:8px;padding:9px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:7px;">' +
                '<span style="flex:1;font-size:.88rem;"><strong>' + escHtml(f.label) + '</strong>' +
                '<span style="color:#94a3b8;font-size:.8rem;margin-left:6px;">(' + escHtml(f.type) + ')</span>' + reqBadge + '</span>' +
                '<button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-remove-cf-btn" data-idx="' + i + '">✕ Remove</button>' +
                '</div>';
        });
        html += '<div style="margin-top:10px;"><button class="aqs-btn aqs-btn-sm aqs-btn-primary" id="aqs-add-cf-btn">+ Add Field</button></div>';
        c.html(html);
    }

    $(document).on('click', '#aqs-add-cf-btn', function() {
        var label = prompt('Field label shown to participants (e.g. "Student ID", "Department"):');
        if (!label || !label.trim()) return;
        var typeChoice = prompt(
            'Field type — enter one:\n' +
            '  text   → single line text\n' +
            '  email  → email address\n' +
            '  number → numeric only\n' +
            '  date   → date picker\n' +
            '  tel    → phone number\n',
            'text'
        );
        if (!typeChoice) return;
        var validTypes = ['text', 'email', 'number', 'date', 'tel'];
        var type = validTypes.indexOf(typeChoice.trim().toLowerCase()) !== -1 ? typeChoice.trim().toLowerCase() : 'text';
        var required = confirm('Is this field required?\n(OK = Required, Cancel = Optional)');
        customFormFields.push({ label: label.trim(), type: type, required: required });
        renderCustomFormFields();
    });

    $(document).on('click', '.aqs-remove-cf-btn', function() {
        var i = parseInt($(this).data('idx'));
        customFormFields.splice(i, 1);
        renderCustomFormFields();
    });

    async function generateSection(i) {
        var sec  = sections[i];
        var subj = ($('#aqs-title').val().trim() || 'Quiz') + ' \u2014 ' + sec.name;
        var textContent;
        if (sec.source === 'upload') {
            if (!sec.file) throw new Error('No file selected for "' + sec.name + '"');
            setSecStatus(i, 'Extracting text from file\u2026');
            try { textContent = await extractTextFromFile(sec.file); }
            catch(e) { throw new Error('Could not read file: ' + e.message); }
        } else {
            var topic = sec.topicText || $('.aqs-sec-topic-input[data-idx="' + i + '"]').val().trim();
            if (!topic) throw new Error('No topic entered for "' + sec.name + '"');
            sections[i].topicText = topic;
            textContent = '__TOPIC__:' + topic;
        }
        setSecStatus(i, 'Contacting AI\u2026');
        var rawQs = await generateQuestionsWithAI(textContent, sec.numQ, subj);
        sections[i].questions = normalizeQuestionsMath(rawQs);
    }

    function setSecStatus(i, msg) {
        $('.aqs-sec-status[data-idx="' + i + '"]').text(msg);
        $('.aqs-sec-progress-wrap[data-idx="' + i + '"]').show();
    }

    function checkAllSectionsReady(force) {
        var allReady = force || sections.every(function(s) { return s.questions.length > 0; });
        if (allReady) {
            renderMultiSectionQuestions();
            $('#step-questions, #step-custom-form, #step-publish').show();
            $('html,body').animate({ scrollTop: $('#step-questions').offset().top - 20 }, 500);
        }
    }

    function renderMultiSectionQuestions() {
        var html = ''; var g = 0;
        sections.forEach(function(sec, si) {
            if (!sec.questions.length) return;
            html += '<div class="aqs-section-review-header" data-sec="' + si + '">&#128218; ' + escHtml(sec.name) + '</div>';
            sec.questions.forEach(function(q) {
                html += buildFrontendQuestionHtml(q, g, si); g++;
            });
        });
        $('#aqs-questions-list').html(html);
        $('#aqs-q-count').text(g + ' question' + (g !== 1 ? 's' : ''));
    }

    function buildFrontendQuestionHtml(q, gi, si) {
        var secAttr  = si !== undefined ? ' data-sec="' + si + '"' : '';
        var qPreview = mathPreviewHtml(q.question);
        var opts = (q.options || []).map(function(opt, oi) {
            return '<div class="aqs-option-edit" style="flex-direction:column;align-items:flex-start;">' +
                '<div style="display:flex;align-items:center;width:100%;">' +
                    '<input type="radio" name="correct_' + gi + '" class="aqs-correct-radio" data-qi="' + gi + '" data-oi="' + oi + '"' + (q.correct_answer_index === oi ? ' checked' : '') + ' title="Mark correct" />' +
                    '<input type="text" class="aqs-opt-text" data-qi="' + gi + '" data-oi="' + oi + '" value="' + escHtml(opt) + '" placeholder="Option ' + String.fromCharCode(65 + oi) + '" style="flex:1;" />' +
                '</div>' + mathPreviewHtml(opt) + '</div>';
        }).join('');
        return '<div class="aqs-question-edit" data-index="' + gi + '"' + secAttr + '>' +
            '<div class="aqs-question-edit-header">' +
                '<span class="aqs-q-num-label">Q' + (gi + 1) + '</span>' +
                '<button class="aqs-btn aqs-btn-sm aqs-btn-danger aqs-remove-q" data-index="' + gi + '">Remove</button>' +
            '</div>' +
            '<div class="aqs-field"><label>Question</label>' +
                '<textarea class="aqs-q-text" data-index="' + gi + '" rows="2">' + escHtml(q.question) + '</textarea>' +
                qPreview + '</div>' +
            '<div class="aqs-options-edit">' + opts + '</div>' +
            '<div class="aqs-field"><label>Explanation (practice mode)</label>' +
                '<input type="text" class="aqs-q-explanation" data-index="' + gi + '" value="' + escHtml(q.explanation || '') + '" />' +
                mathPreviewHtml(q.explanation || '') +
            '</div>' +
        '</div>';
    }

    /* ── Section toolbar buttons ────────────────────────────── */
    $(document).on('click', '#aqs-add-section-btn', function() {
        if (sections.length >= 8) { alert('Maximum 8 topics.'); return; }
        sections.push({ name: 'Topic ' + (sections.length + 1), source: 'topic', file: null,
            topicText: '', difficulty: 'medium', numQ: 5, questions: [], generating: false });
        renderSectionCards();
    });

    $(document).on('click', '#aqs-generate-all-btn', async function() {
        if (!$('#aqs-title').val().trim()) { alert('Please fill in the Quiz Title first.'); return; }
        var eligible = sections.map(function(s, i) { return { s: s, i: i }; }).filter(function(x) { return !x.s.questions.length; });
        if (!eligible.length) { checkAllSectionsReady(true); return; }

        var $btn = $(this).prop('disabled', true).text('\u23f3 Generating all\u2026');
        eligible.forEach(function(x) { sections[x.i].generating = true; });
        renderSectionCards();

        var results = await Promise.allSettled(eligible.map(async function(x) {
            try {
                await generateSection(x.i);
                sections[x.i].generating = false;
            } catch(e) {
                sections[x.i].generating = false;
                throw e;
            }
            renderSectionCards();
        }));

        $btn.prop('disabled', false).html('&#9889; Generate All Topics');
        renderSectionCards();
        var failed = results.filter(function(r) { return r.status === 'rejected'; });
        if (failed.length) alert(failed.length + ' topic(s) failed to generate. Check topics and try individually.');
        checkAllSectionsReady();
    });

    /* ── Per-section generate button ────────────────────────── */
    $(document).on('click', '.aqs-sec-generate-btn', async function() {
        var i = +$(this).data('idx');
        if (!$('#aqs-title').val().trim()) { alert('Please fill in the Quiz Title first.'); return; }
        sections[i].generating = true;
        renderSectionCards();
        try {
            await generateSection(i);
            sections[i].generating = false;
            renderSectionCards();
            checkAllSectionsReady();
        } catch(e) {
            sections[i].generating = false;
            renderSectionCards();
            alert('Error for "' + sections[i].name + '": ' + e.message);
        }
    });

    /* ── Section remove ─────────────────────────────────────── */
    $(document).on('click', '.aqs-sec-remove', function() {
        sections.splice(+$(this).data('idx'), 1);
        renderSectionCards();
    });

    /* ── Section source-tab click ───────────────────────────── */
    $(document).on('click', '.aqs-sec-tabs .aqs-source-tab', function() {
        var i   = parseInt($(this).data('sec'));
        var src = $(this).data('source');
        sections[i].source = src;
        $(this).closest('.aqs-section-card').find('.aqs-sec-tabs .aqs-source-tab').removeClass('active');
        $(this).addClass('active');
        $(this).closest('.aqs-section-card').find('.aqs-source-panel').hide();
        $(this).closest('.aqs-section-card').find('.aqs-sec-panel-' + src).show();
    });

    /* ── Section field live-updates ─────────────────────────── */
    $(document).on('input',  '.aqs-section-name-input', function() { sections[+$(this).data('idx')].name       = $(this).val(); });
    $(document).on('input',  '.aqs-sec-topic-input',    function() { sections[+$(this).data('idx')].topicText  = $(this).val(); });
    $(document).on('change', '.aqs-sec-difficulty',     function() { sections[+$(this).data('idx')].difficulty = $(this).val(); });
    $(document).on('change', '.aqs-sec-num-q',          function() { sections[+$(this).data('idx')].numQ = parseInt($(this).val()) || 5; });

    /* ── Section file handling ──────────────────────────────── */
    $(document).on('click', '.aqs-sec-browse-btn', function() {
        $(this).siblings('.aqs-sec-file-input').click();
    });
    $(document).on('change', '.aqs-sec-file-input', function() {
        var i = +$(this).data('idx');
        if (this.files[0]) { sections[i].file = this.files[0]; renderSectionCards(); }
    });
    $(document).on('click', '.aqs-sec-remove-file', function() {
        sections[+$(this).data('idx')].file = null; renderSectionCards();
    });
    $(document).on('dragover',  '.aqs-sec-upload-zone', function(e) { e.preventDefault(); $(this).addClass('drag-over'); });
    $(document).on('dragleave', '.aqs-sec-upload-zone', function()  { $(this).removeClass('drag-over'); });
    $(document).on('drop', '.aqs-sec-upload-zone', function(e) {
        e.preventDefault(); $(this).removeClass('drag-over');
        var i = +$(this).data('idx');
        var f = e.originalEvent.dataTransfer.files[0];
        if (f) { sections[i].file = f; renderSectionCards(); }
    });

    /* ── Edit Quiz: pre-fill form if ?edit=QUIZ_ID in URL ─────── */
    (function() {
        var params  = new URLSearchParams(window.location.search);
        var editId  = params.get('edit');
        if (!editId) return;

        /* Wait for Firebase auth to be ready before fetching */
        function doLoad(user) {
            if (!user) { alert('You must be logged in to edit a quiz.'); return; }
            $.post(AQS.ajax_url, { action: 'aqs_get_quiz_for_edit', nonce: AQS.nonce, quiz_id: editId }, function(res) {
                if (!res.success) { alert('Could not load quiz for editing: ' + (res.data || 'Unknown error')); return; }
                var d = res.data;

                /* Set currentQuizId so Save/Publish overwrites the same doc */
                currentQuizId = d.quiz_id;

                /* Basic settings */
                $('#aqs-title').val(d.title);
                $('#aqs-subject').val(d.subject);
                $('#aqs-num-questions').val(d.num_questions || (d.questions || []).length);
                $('#aqs-time-limit').val(d.time_limit);
                /* Mode toggle */
                $('.aqs-toggle').removeClass('active');
                $('.aqs-toggle[data-mode="' + d.mode + '"]').addClass('active');
                $('#aqs-mode').val(d.mode);
                /* Max attempts */
                var retakes = d.allow_retakes !== undefined ? String(d.allow_retakes) : '1';
                if ($('#aqs-max-attempts option[value="' + retakes + '"]').length) {
                    $('#aqs-max-attempts').val(retakes);
                }
                /* Show/hide results */
                $('input[name="aqs_show_results"][value="' + (d.show_results ? 'yes' : 'no') + '"]').prop('checked', true);

                /* Questions */
                if (d.questions && d.questions.length) {
                    extractedQuestions = d.questions;
                    renderQuestions(d.questions);
                }

                /* Custom form fields */
                if (Array.isArray(d.custom_form) && d.custom_form.length) {
                    customFormFields = d.custom_form;
                    renderCustomFormFields();
                }

                /* Show all downstream steps */
                $('#step-questions, #step-custom-form, #step-publish').show();

                /* Banner at top of page */
                var $banner = $('<div style="background:#fef9c3;border:1px solid #fde047;border-radius:10px;padding:12px 18px;margin-bottom:18px;font-size:.93rem;color:#713f12;">' +
                    '✏️ <strong>Editing quiz:</strong> ' + $('<span>').text(d.title).html() +
                    ' — all changes will overwrite the original. ' +
                    (d.status === 'published' ? '<span style="color:#b45309;">⚠️ This quiz is already published — edits take effect immediately.</span>' : '') +
                    '</div>');
                $('form, .aqs-create-form, #aqs-extract-btn').first().closest('form, section, .aqs-card, .aqs-section').prepend($banner);
                if (!$banner.parent().length) { $('h1,h2').first().after($banner); }

                /* Scroll to top */
                $('html,body').animate({ scrollTop: 0 }, 300);
            });
        }

        /* Auth may already be resolved or pending */
        if (window._aqsFirebaseUser !== undefined) {
            doLoad(window._aqsFirebaseUser);
        } else {
            document.addEventListener('aqs:authchange', function handler(e) {
                document.removeEventListener('aqs:authchange', handler);
                doLoad(e.detail && e.detail.user ? e.detail.user : null);
            });
        }
    })();

})(jQuery);
