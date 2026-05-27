/* AI Quiz System — Document Generator
   Upload PDF/DOCX → extract text → AI generates summary/study guide/FAQ/etc.
   Developed by Omomo Excellence in corporation with Darapet Technology */
(function () {
    'use strict';

    var $wrap = document.getElementById('aqs-docsgen-wrap');
    if (!$wrap) return;

    var cfg     = window.AQS || {};
    var ajaxUrl = cfg.ajax_url || '';
    var nonce   = cfg.public_nonce || cfg.nonce || '';

    /* AQS_LOCAL: set to a local backend URL to enable it; empty = cloud AI only */
    var AQS_LOCAL = '';

    /* ── Local Node.js backend endpoint — only used when AQS_LOCAL is set ── */

    async function callLocalDocsBackend(text, type, detail, topic) {
        if (!AQS_LOCAL) throw new Error('no local backend');
        var res = await fetch(AQS_LOCAL + '/api/generate-docs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: text, type: type, detail: detail, topic: topic })
        });
        if (!res.ok) throw new Error('local backend error ' + res.status);
        var data = await res.json();
        var out = data.result || data.text || data.content || (typeof data === 'string' ? data : '');
        if (!out || out.length < 10) throw new Error('empty response from local backend');
        return out;
    }

    var uploadedFile  = null;
    var extractedText = '';
    var selectedType  = 'summary';
    var lastOutput    = '';

    /* ── DOM refs ── */
    var $uploadZone  = document.getElementById('aqs-dg-upload-zone');
    var $fileInput   = document.getElementById('aqs-dg-file-input');
    var $fileInfo    = document.getElementById('aqs-dg-file-info');
    var $fileName    = document.getElementById('aqs-dg-file-name');
    var $fileSize    = document.getElementById('aqs-dg-file-size');
    var $removeFile  = document.getElementById('aqs-dg-remove-file');
    var $controls    = document.getElementById('aqs-dg-controls');
    var $genBtn      = document.getElementById('aqs-dg-generate-btn');
    var $detailSel   = document.getElementById('aqs-dg-detail');
    var $topicInput  = document.getElementById('aqs-dg-topic');
    var $pbarWrap    = document.getElementById('aqs-dg-pbar-wrap');
    var $pbarFill    = document.getElementById('aqs-dg-pbar-fill');
    var $statusTxt   = document.getElementById('aqs-dg-status-text');
    var $errorDiv    = document.getElementById('aqs-dg-error');
    var $outputSec   = document.getElementById('aqs-dg-output-section');
    var $outputTitle = document.getElementById('aqs-dg-output-title');
    var $outputBody  = document.getElementById('aqs-dg-output-body');
    var $copyBtn     = document.getElementById('aqs-dg-copy-btn');
    var $dlBtn       = document.getElementById('aqs-dg-download-btn');
    var $typCards    = document.querySelectorAll('.aqs-dg-type-card');

    /* ── Type selector ── */
    $typCards.forEach(function (card) {
        card.addEventListener('click', function () {
            $typCards.forEach(function (c) { c.classList.remove('active'); });
            card.classList.add('active');
            selectedType = card.getAttribute('data-type') || 'summary';
        });
    });

    /* ── Upload zone ── */
    $uploadZone.addEventListener('click', function () { $fileInput.click(); });
    $fileInput.addEventListener('change', function () { if (this.files[0]) setFile(this.files[0]); });
    $uploadZone.addEventListener('dragover', function (e) { e.preventDefault(); $uploadZone.classList.add('drag-over'); });
    $uploadZone.addEventListener('dragleave', function () { $uploadZone.classList.remove('drag-over'); });
    $uploadZone.addEventListener('drop', function (e) {
        e.preventDefault();
        $uploadZone.classList.remove('drag-over');
        if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]);
    });

    function setFile(file) {
        var nameLow = file.name.toLowerCase();
        var isSupported = nameLow.endsWith('.pdf') || nameLow.endsWith('.docx') ||
                          nameLow.endsWith('.doc') || nameLow.endsWith('.txt') ||
                          nameLow.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/);
        if (!isSupported) { showError('Unsupported file. Upload a PDF, DOCX, TXT, or image file (JPG, PNG, etc.).'); return; }
        if (file.size > 20 * 1024 * 1024) { showError('File too large. Maximum 20 MB.'); return; }

        uploadedFile  = file;
        extractedText = '';
        $fileName.textContent = file.name;
        $fileSize.textContent = formatBytes(file.size);
        $fileInfo.style.display  = 'flex';
        $controls.style.display  = 'block';
        $outputSec.style.display = 'none';
        $outputBody.textContent  = '';
        hideError();
    }

    $removeFile.addEventListener('click', function () {
        uploadedFile = null; extractedText = '';
        $fileInput.value = '';
        $fileInfo.style.display  = 'none';
        $controls.style.display  = 'none';
        $outputSec.style.display = 'none';
        hideError();
    });

    /* ─────────────────────────────────────────────────────────────
       FILE PARSING — PDF.js + Mammoth
    ───────────────────────────────────────────────────────────── */
    function extractTextFromFile(file) {
        var name = file.name.toLowerCase();
        if (name.endsWith('.pdf'))  return extractPDF(file);
        if (name.endsWith('.docx') || name.endsWith('.doc')) return extractDocx(file);
        if (name.endsWith('.txt'))  return extractTxt(file);
        if (name.match(/\.(jpg|jpeg|png|gif|webp|bmp)$/)) return extractImage(file);
        return Promise.reject(new Error('Unsupported file type. Supported: PDF, DOCX, TXT, JPG, PNG, WEBP.'));
    }

    function extractPDF(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    if (typeof pdfjsLib === 'undefined') throw new Error('PDF library not loaded. Please refresh and try again.');
                    pdfjsLib.GlobalWorkerOptions.workerSrc =
                        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    var pdf  = await pdfjsLib.getDocument({ data: e.target.result }).promise;
                    var text = '';
                    var sparsePages = []; /* pages with little/no selectable text → scanned images */

                    for (var i = 1; i <= pdf.numPages; i++) {
                        var page    = await pdf.getPage(i);
                        var content = await page.getTextContent();
                        var pageText = content.items.map(function (s) { return s.str; }).join(' ').trim();
                        text += pageText + '\n';

                        /* If a page has less than 80 chars it's probably a scanned image */
                        if (pageText.length < 80) {
                            try {
                                var vp     = page.getViewport({ scale: 1.5 });
                                var canvas = document.createElement('canvas');
                                canvas.width  = vp.width;
                                canvas.height = vp.height;
                                await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
                                sparsePages.push({ num: i, dataUrl: canvas.toDataURL('image/jpeg', 0.85) });
                            } catch (_) { /* skip render errors */ }
                        }
                    }

                    var finalText = text.trim();

                    /* If most pages are scanned, run OCR via vision AI */
                    if (sparsePages.length > 0 && finalText.length < pdf.numPages * 80) {
                        setStatus('Scanned document detected — using AI vision to read text…');
                        var ocrParts = [];
                        var limit = Math.min(sparsePages.length, 10); /* max 10 pages OCR */
                        for (var j = 0; j < limit; j++) {
                            var ocrText = await ocrWithVision(sparsePages[j].dataUrl);
                            if (ocrText) ocrParts.push('--- Page ' + sparsePages[j].num + ' ---\n' + ocrText);
                        }
                        if (ocrParts.length > 0) finalText = ocrParts.join('\n\n');
                    }

                    resolve(finalText);
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    function extractDocx(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    if (typeof mammoth === 'undefined') throw new Error('Word library not loaded. Please refresh and try again.');
                    var result = await mammoth.extractRawText({ arrayBuffer: e.target.result });
                    resolve(result.value.trim());
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsArrayBuffer(file);
        });
    }

    function extractTxt(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload  = function (e) { resolve(e.target.result.trim()); };
            reader.onerror = reject;
            reader.readAsText(file);
        });
    }

    /* Read an image file and OCR it via vision AI */
    function extractImage(file) {
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = async function (e) {
                try {
                    var dataUrl = e.target.result;
                    setStatus('Reading image with AI vision…');
                    var text = await ocrWithVision(dataUrl);
                    if (!text || text.trim().length < 5)
                        reject(new Error('Could not read text from this image. Make sure it contains visible text.'));
                    else
                        resolve(text.trim());
                } catch (err) { reject(err); }
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /* OCR a base64 data URL using Groq vision → Pollinations vision fallback */
    async function ocrWithVision(dataUrl) {
        var visionMsg = [{
            role: 'user',
            content: [
                { type: 'text', text: 'Extract ALL text from this image exactly as it appears. Preserve headings, paragraphs, lists and tables. Output ONLY the raw extracted text, nothing else.' },
                { type: 'image_url', image_url: { url: dataUrl } }
            ]
        }];

        /* Try Groq vision first (meta-llama/llama-4-scout supports vision) */
        if (typeof window.groqFetch === 'function') {
            try {
                var ctrl = new AbortController();
                setTimeout(function () { ctrl.abort(); }, 30000);
                var res = await window.groqFetch({
                    model: 'meta-llama/llama-4-scout-17b-16e-instruct',
                    messages: visionMsg,
                    max_tokens: 4096,
                    temperature: 0.1
                }, { signal: ctrl.signal });
                if (res.ok) {
                    var d = await res.json();
                    var t = (((d.choices || [])[0] || {}).message || {}).content || '';
                    if (t.trim().length > 5) return t.trim();
                }
            } catch (_) {}
        }

        /* Pollinations vision fallback — free, no key */
        try {
            var ctrl2 = new AbortController();
            setTimeout(function () { ctrl2.abort(); }, 35000);
            var res2 = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: ctrl2.signal,
                body: JSON.stringify({
                    model: 'openai',
                    messages: visionMsg,
                    max_tokens: 2000,
                    temperature: 0.1,
                    private: true
                })
            });
            if (res2.ok) {
                var d2 = await res2.json();
                var t2 = (((d2.choices || [])[0] || {}).message || {}).content || '';
                if (t2.trim().length > 5) return t2.trim();
            }
        } catch (_) {}

        return null;
    }

    /* ─────────────────────────────────────────────────────────────
       AI CALL — sequential: Groq first → Pollinations → proxy
    ───────────────────────────────────────────────────────────── */
    function callDirect(messages) {
        var ctrl = new AbortController();
        var tid  = setTimeout(function () { ctrl.abort(); }, 35000);
        return fetch('https://text.pollinations.ai/openai', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            referrerPolicy: 'no-referrer',
            signal: ctrl.signal,
            body: JSON.stringify({ messages: messages, model: 'openai', max_tokens: 2000, temperature: 0.5, private: true })
        })
        .then(function (r) { clearTimeout(tid); return r.json(); })
        .then(function (d) {
            var t = (((d.choices || [])[0] || {}).message || {}).content || '';
            if (t.trim().length > 10) return t.trim();
            throw new Error('empty');
        })
        .catch(function (e) { clearTimeout(tid); throw e; });
    }

    function callProxy(messages) {
        if (!ajaxUrl || !nonce) return Promise.reject(new Error('no proxy'));
        var fd = new FormData();
        fd.append('action',   'aqs_studio_ai');
        fd.append('nonce',    nonce);
        fd.append('messages', JSON.stringify(messages));
        var ctrl = new AbortController();
        var tid  = setTimeout(function () { ctrl.abort(); }, 45000);
        return fetch(ajaxUrl, { method: 'POST', body: fd, signal: ctrl.signal })
        .then(function (r) { clearTimeout(tid); return r.json(); })
        .then(function (data) {
            if (data && data.success && data.data && data.data.text) return data.data.text;
            throw new Error('proxy empty');
        })
        .catch(function (e) { clearTimeout(tid); throw e; });
    }

    /* Groq direct — auto-retries with next key on 429 */
    function callGroq(messages) {
        if (typeof window.groqFetch !== 'function') return Promise.reject(new Error('no groq'));
        var ctrl = new AbortController();
        var tid  = setTimeout(function () { ctrl.abort(); }, 25000);
        return window.groqFetch(
            { model: 'llama-3.1-8b-instant', messages: messages, max_tokens: 2000, temperature: 0.5 },
            { signal: ctrl.signal }
        )
        .then(function (r) { clearTimeout(tid); return r.json(); })
        .then(function (d) {
            var t = (((d.choices || [])[0] || {}).message || {}).content || '';
            if (t.trim().length > 10) return t.trim();
            throw new Error('empty');
        })
        .catch(function (e) { clearTimeout(tid); throw e; });
    }

    /* Sequential: Groq first → Pollinations direct → proxy last resort */
    async function raceAI(messages) {
        /* 1. Groq direct — fastest & best quality (groqFetch handles key rotation) */
        try {
            if (typeof window.groqFetch === 'function') {
                var gt = await callGroq(messages);
                if (gt) return gt;
            }
        } catch(e) {}

        /* 2. Pollinations direct — free, no key, browser-direct */
        try {
            var pt = await callDirect(messages);
            if (pt) return pt;
        } catch(e) {}

        /* 3. Server proxy — last resort */
        try {
            var st = await callProxy(messages);
            if (st) return st;
        } catch(e) {}

        throw new Error('All AI connections failed. Check your internet and try again.');
    }

    /* ─────────────────────────────────────────────────────────────
       PROMPT BUILDERS per output type
    ───────────────────────────────────────────────────────────── */
    var TYPE_CONFIG = {
        summary: {
            title: 'Document Summary',
            system: 'You are an expert document analyst. Create a clear, well-structured summary.',
            instruction: function (detail, topic) {
                return 'Create a ' + detail + ' summary of the following document.' +
                       (topic ? ' Focus on: ' + topic + '.' : '') +
                       '\n\nFormat:\n- Opening paragraph with main thesis/purpose\n- Key sections summarized\n- Closing with main conclusions\n\nBe informative and clear. Use proper headings and paragraphs.';
            }
        },
        study_guide: {
            title: 'Study Guide',
            system: 'You are an expert educator. Create comprehensive, exam-ready study materials.',
            instruction: function (detail, topic) {
                return 'Create a ' + detail + ' study guide from the following document.' +
                       (topic ? ' Focus on: ' + topic + '.' : '') +
                       '\n\nInclude:\n- Learning objectives\n- Key concepts with explanations\n- Important definitions\n- Summary of main points\n- Review questions (with answers)\n\nUse clear headings, bullet points, and numbered lists.';
            }
        },
        faq: {
            title: 'FAQ — Frequently Asked Questions',
            system: 'You are an expert at distilling information into clear Q&A format.',
            instruction: function (detail, topic) {
                return 'Create ' + (detail === 'brief' ? '8–12' : detail === 'comprehensive' ? '20–30' : '12–18') + ' frequently asked questions (with detailed answers) based on the following document.' +
                       (topic ? ' Focus on: ' + topic + '.' : '') +
                       '\n\nFormat each as:\nQ: [question]\nA: [detailed answer]\n\nCover the most important topics, common confusions, and key insights.';
            }
        },
        key_points: {
            title: 'Key Points & Highlights',
            system: 'You are an expert at extracting the most important information from documents.',
            instruction: function (detail, topic) {
                return 'Extract the ' + (detail === 'brief' ? 'top 10' : detail === 'comprehensive' ? '25–35' : '15–20') + ' most important key points from the following document.' +
                       (topic ? ' Focus on: ' + topic + '.' : '') +
                       '\n\nFormat:\n- Group by theme/section with bold headings\n- Each point as a clear, standalone bullet\n- Include statistics, dates, or specific facts when relevant\n- Mark the 3 most critical points with ★';
            }
        },
        glossary: {
            title: 'Glossary — Terms & Definitions',
            system: 'You are an expert lexicographer and subject matter expert.',
            instruction: function (detail, topic) {
                return 'Create a comprehensive glossary of all important terms, concepts, and acronyms from the following document.' +
                       (topic ? ' Focus on terms related to: ' + topic + '.' : '') +
                       '\n\nFormat each term as:\n**Term**: Definition in clear, plain language. Include context or examples where helpful.\n\nSort alphabetically. Include ' + (detail === 'brief' ? '10–15' : detail === 'comprehensive' ? '30+' : '15–25') + ' terms.';
            }
        },
        outline: {
            title: 'Document Outline',
            system: 'You are an expert at structural analysis and information architecture.',
            instruction: function (detail, topic) {
                return 'Create a detailed hierarchical outline of the following document.' +
                       (topic ? ' Focus on: ' + topic + '.' : '') +
                       '\n\nFormat:\nI. Main Section\n   A. Subsection\n      1. Key point\n      2. Key point\n   B. Subsection\nII. Main Section\n...\n\nInclude a brief description (1–2 sentences) for each main section.';
            }
        }
    };

    /* ─────────────────────────────────────────────────────────────
       GENERATE
    ───────────────────────────────────────────────────────────── */
    $genBtn.addEventListener('click', async function () {
        if (!uploadedFile) { showError('Please upload a document first.'); return; }

        var detail = $detailSel.value || 'standard';
        var topic  = $topicInput.value.trim();
        var typeConf = TYPE_CONFIG[selectedType] || TYPE_CONFIG.summary;

        hideError();
        $genBtn.disabled = true;
        $genBtn.innerHTML = '<svg class="aqs-ig-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg> Generating…';
        $pbarWrap.style.display = 'block';
        setPbar(5);
        setStatus('Reading document…');

        try {
            if (!extractedText) {
                extractedText = await extractTextFromFile(uploadedFile);
                if (!extractedText || extractedText.length < 50) {
                    throw new Error('Could not extract readable text from this file. Please try a different file.');
                }
            }

            setPbar(20);
            setStatus('Analyzing with AI (' + typeConf.title + ')…');

            /* Clip text to avoid huge prompts — first 8000 chars is usually enough */
            var excerpt = extractedText.substring(0, 8000);

            var instruction = typeConf.instruction(detail, topic);
            var messages = [
                { role: 'system', content: typeConf.system + ' Never mention any AI service or API. Output plain text with clean formatting — no HTML tags.' },
                { role: 'user',   content: instruction + '\n\n---\nDOCUMENT:\n' + excerpt }
            ];

            setPbar(40);
            setStatus('Contacting AI server…');

            var result = null;
            /* Try local Node.js backend first (only active when AQS_LOCAL is set);
               otherwise goes straight to Groq + Pollinations cloud AI */
            try {
                result = await callLocalDocsBackend(excerpt, selectedType, detail, topic);
            } catch (localErr) {
                result = await raceAI(messages);
            }
            setPbar(100);

            lastOutput = result;
            $outputTitle.textContent = typeConf.title;
            $outputBody.innerHTML    = renderMarkdown(result);
            $outputBody.classList.remove('streaming');
            $outputSec.style.display = 'block';
            setStatus('Done!');
            setTimeout(function () { setStatus(''); $pbarWrap.style.display = 'none'; }, 1500);

            $outputSec.scrollIntoView({ behavior: 'smooth', block: 'start' });

        } catch (err) {
            $pbarWrap.style.display = 'none';
            setStatus('');
            showError(err.message || 'Generation failed. Please try again.');
        }

        $genBtn.disabled = false;
        $genBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/></svg> Generate Document';
    });

    /* ── Copy ── */
    $copyBtn.addEventListener('click', function () {
        if (!lastOutput) return;
        navigator.clipboard.writeText(lastOutput).then(function () {
            $copyBtn.textContent = '✓ Copied!';
            setTimeout(function () {
                $copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
            }, 2000);
        }).catch(function () {
            /* Fallback */
            var ta = document.createElement('textarea');
            ta.value = lastOutput;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            $copyBtn.textContent = '✓ Copied!';
            setTimeout(function () {
                $copyBtn.innerHTML = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy';
            }, 2000);
        });
    });

    /* ── Download ── */
    $dlBtn.addEventListener('click', function () {
        if (!lastOutput) return;
        var blob = new Blob([lastOutput], { type: 'text/plain;charset=utf-8' });
        var url  = URL.createObjectURL(blob);
        var a    = document.createElement('a');
        var conf = TYPE_CONFIG[selectedType] || TYPE_CONFIG.summary;
        a.href     = url;
        a.download = 'darapet-' + (selectedType || 'document') + '.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    /* ── Markdown → HTML renderer ── */
    function renderMarkdown(text) {
        /* Escape HTML special chars first */
        var s = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        var lines = s.split('\n');
        var out   = [];
        var inUl  = false;
        var inOl  = false;

        function closeList() {
            if (inUl) { out.push('</ul>'); inUl = false; }
            if (inOl) { out.push('</ol>'); inOl = false; }
        }

        function inlineFmt(line) {
            return line
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/__(.+?)__/g,     '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g,     '<em>$1</em>')
                .replace(/★/g, '<span style="color:#f59e0b;font-size:1.1em;">★</span>');
        }

        lines.forEach(function (raw) {
            var line = raw.trimEnd();

            /* Blank line — close any open list, add spacer */
            if (!line.trim()) {
                closeList();
                out.push('<div style="height:6px;"></div>');
                return;
            }

            /* H1 # */
            if (/^# (.+)/.test(line)) {
                closeList();
                out.push('<h2 style="font-size:1.15rem;font-weight:800;color:#1e1b4b;margin:18px 0 6px;">' + inlineFmt(line.replace(/^# /, '')) + '</h2>');
                return;
            }
            /* H2 ## */
            if (/^## (.+)/.test(line)) {
                closeList();
                out.push('<h3 style="font-size:1rem;font-weight:700;color:#1e1b4b;margin:14px 0 5px;">' + inlineFmt(line.replace(/^## /, '')) + '</h3>');
                return;
            }
            /* H3 ### */
            if (/^### (.+)/.test(line)) {
                closeList();
                out.push('<h4 style="font-size:.95rem;font-weight:700;color:#374151;margin:12px 0 4px;">' + inlineFmt(line.replace(/^### /, '')) + '</h4>');
                return;
            }
            /* Roman numeral section: I. II. III. etc */
            if (/^(X{0,3})(IX|IV|V?I{0,3})\. .+/.test(line) && line.indexOf('. ') < 8) {
                closeList();
                out.push('<h3 style="font-size:1rem;font-weight:700;color:#1e1b4b;margin:14px 0 5px;">' + inlineFmt(line) + '</h3>');
                return;
            }
            /* Lettered sub-section: A. B. C. */
            if (/^[A-Z]\. .+/.test(line) && line.indexOf('. ') < 4) {
                closeList();
                out.push('<h4 style="font-size:.9rem;font-weight:700;color:#374151;margin:10px 0 4px;padding-left:14px;">' + inlineFmt(line) + '</h4>');
                return;
            }
            /* Q: — FAQ question */
            if (/^Q: /.test(line)) {
                closeList();
                out.push('<div style="font-weight:700;color:#4f46e5;margin-top:16px;font-size:.93rem;">❓ ' + inlineFmt(line.replace(/^Q: /, '')) + '</div>');
                return;
            }
            /* A: — FAQ answer */
            if (/^A: /.test(line)) {
                closeList();
                out.push('<div style="padding:8px 0 10px 14px;border-left:3px solid #6366f1;margin-bottom:4px;color:#374151;">' + inlineFmt(line.replace(/^A: /, '')) + '</div>');
                return;
            }
            /* Bullet: - or • or * (not bold) */
            if (/^[-•]\s/.test(line) || (/^\* /.test(line) && !/^\*\*/.test(line))) {
                if (inOl) { out.push('</ol>'); inOl = false; }
                if (!inUl) { out.push('<ul style="margin:6px 0;padding-left:22px;">'); inUl = true; }
                out.push('<li style="margin:3px 0;">' + inlineFmt(line.replace(/^[-•*]\s/, '')) + '</li>');
                return;
            }
            /* Indented bullet */
            if (/^\s{2,}[-•]\s/.test(raw)) {
                if (!inUl) { out.push('<ul style="margin:6px 0;padding-left:22px;">'); inUl = true; }
                out.push('<li style="margin:3px 0;list-style-type:circle;margin-left:18px;">' + inlineFmt(line.replace(/^\s+[-•]\s/, '')) + '</li>');
                return;
            }
            /* Numbered list */
            if (/^\d+\.\s/.test(line)) {
                if (inUl) { out.push('</ul>'); inUl = false; }
                if (!inOl) { out.push('<ol style="margin:6px 0;padding-left:24px;">'); inOl = true; }
                out.push('<li style="margin:3px 0;">' + inlineFmt(line.replace(/^\d+\.\s/, '')) + '</li>');
                return;
            }
            /* Numbered sub-item: 1. 2. indented */
            if (/^\s{2,}\d+\.\s/.test(raw)) {
                if (!inOl) { out.push('<ol style="margin:6px 0;padding-left:24px;">'); inOl = true; }
                out.push('<li style="margin:3px 0;margin-left:16px;">' + inlineFmt(line.replace(/^\s+\d+\.\s/, '')) + '</li>');
                return;
            }
            /* Glossary term: **Term**: definition */
            if (/^\*\*(.+?)\*\*:/.test(line)) {
                closeList();
                out.push('<div style="margin:10px 0 2px;"><strong style="color:#1e1b4b;">' + inlineFmt(line.replace(/^\*\*(.+?)\*\*:?\s*/, function(m,t){ return t + ': '; })) + '</strong></div>');
                return;
            }
            /* Plain paragraph line */
            closeList();
            out.push('<p style="margin:5px 0;line-height:1.75;">' + inlineFmt(line) + '</p>');
        });

        closeList();
        return out.join('');
    }

    /* ── Helpers ── */
    function setPbar(pct) { $pbarFill.style.width = Math.min(100, pct) + '%'; }
    function setStatus(msg) { $statusTxt.textContent = msg; }
    function showError(msg) {
        $errorDiv.textContent = msg;
        $errorDiv.style.display = 'block';
        setTimeout(function () { $errorDiv.style.display = 'none'; }, 8000);
    }
    function hideError() { $errorDiv.style.display = 'none'; }
    function formatBytes(b) {
        if (b < 1024) return b + ' B';
        if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
        return (b / (1024 * 1024)).toFixed(1) + ' MB';
    }

})();
