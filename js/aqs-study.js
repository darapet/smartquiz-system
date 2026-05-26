/* aqs-study.js — AI Study v4 | Groq · KaTeX · File Upload
   ─────────────────────────────────────────────────────────
   Uses window.groqFetch() from aqs-groq-key.js — no manual key needed.
   ─────────────────────────────────────────────────────────── */
(function () {
'use strict';

/* ── CONFIG ─────────────────────────────────────────────────── */
var CFG        = window.AQS_CONFIG || {};
var GROQ_MODEL = CFG.groqModel || 'llama-3.3-70b-versatile';

/* ── CONSTANTS ─────────────────────────────────────────────── */
var POLL_URL  = 'https://text.pollinations.ai/openai';
var WIKI_API  = 'https://en.wikipedia.org/w/api.php';
var BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
var HIST_KEY  = 'aqs_study_hist';
var MAX_HIST  = 15;

/* ── STATE ──────────────────────────────────────────────────── */
var S = {
    query:'', title:'', source:'', description:'', wikiTitle:'',
    chapters:[], activeIdx:-1, cache:{},
    testQ:null, testAns:[], testIdx:0,
    uploadedContent:null, uploadedFileName:null,
    uploadedBase64:null, uploadedMime:null,
    aiReady: false,
};

/* ── SUMMON STATE ───────────────────────────────────────────── */
var VS = {
    active: false, listening: false, speaking: false,
    recognition: null, synth: window.speechSynthesis || null,
    silenceTimer: null, transcript: '', history: [], voice: null,
};

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    injectKaTeX();
    setupSearch();
    setupFileUpload();
    setupEvents();
    renderHistory();
    checkAI();
    injectSummonStyles();
    injectSummonUI();
    initSummonVoices();
});

/* ── KATEX ──────────────────────────────────────────────────── */
function injectKaTeX() {
    if (document.getElementById('katex-css')) return;
    var link   = document.createElement('link');
    link.id    = 'katex-css';
    link.rel   = 'stylesheet';
    link.href  = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    document.head.appendChild(link);
    loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js', function () {
        loadScript('https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js', function () {
            renderPageMath();
        });
    });
}

function loadScript(src, cb) {
    var s = document.createElement('script');
    s.src = src;
    s.onload = cb || function () {};
    document.head.appendChild(s);
}

function renderPageMath() {
    if (typeof renderMathInElement === 'undefined') return;
    document.querySelectorAll('.std-content-body,.std-ai-panel-body,.std-test-q,.std-res-exp').forEach(renderMath);
}

function renderMath(el) {
    if (!el || typeof renderMathInElement === 'undefined') return;
    try {
        renderMathInElement(el, {
            delimiters: [
                { left: '$$', right: '$$', display: true },
                { left: '$',  right: '$',  display: false },
                { left: '\\(', right: '\\)', display: false },
                { left: '\\[', right: '\\]', display: true }
            ],
            throwOnError: false
        });
    } catch (e) {}
}

/* ── FILE UPLOAD ────────────────────────────────────────────── */
function setupFileUpload() {
    var searchSection = document.querySelector('.std-search-section');
    if (!searchSection || document.getElementById('std-upload-wrap')) return;

    var wrap = document.createElement('div');
    wrap.id = 'std-upload-wrap';
    wrap.className = 'std-upload-wrap';
    wrap.innerHTML =
        '<label class="std-upload-btn" for="std-file-input">' +
        '📎 Upload Textbook / Image' +
        '<input type="file" id="std-file-input" accept=".txt,.md,.csv,.pdf,image/*" style="display:none">' +
        '</label>' +
        '<span id="std-upload-info" class="std-upload-info"></span>';
    searchSection.appendChild(wrap);

    var input = document.getElementById('std-file-input');
    if (input) input.addEventListener('change', function () {
        if (input.files[0]) { handleFileUpload(input.files[0]); input.value = ''; }
    });
}

function handleFileUpload(file) {
    var info = document.getElementById('std-upload-info');
    var setInfo = function (t) { if (info) info.textContent = t; };
    S.uploadedFileName = file.name;
    S.uploadedBase64   = null;
    S.uploadedContent  = null;
    S.uploadedMime     = file.type;

    if (file.type.startsWith('image/')) {
        setInfo('⏳ Reading image…');
        var r = new FileReader();
        r.onload = function (e) {
            S.uploadedBase64  = e.target.result;
            S.uploadedContent = '[Image: ' + file.name + ']';
            setInfo('🖼 ' + file.name + ' ready');
            showUploadStudy(file.name, 'img');
        };
        r.readAsDataURL(file);
    } else if (file.type === 'application/pdf' && window.pdfjsLib) {
        setInfo('⏳ Extracting PDF…');
        var r2 = new FileReader();
        r2.onload = function (e) { extractPDFText(e.target.result, file.name, setInfo); };
        r2.readAsArrayBuffer(file);
    } else {
        setInfo('⏳ Reading…');
        var r3 = new FileReader();
        r3.onload = function (e) {
            S.uploadedContent = (e.target.result || '').slice(0, 80000);
            setInfo('📄 ' + file.name + ' (' + Math.round(S.uploadedContent.length / 1000) + 'k chars)');
            showUploadStudy(file.name, 'text');
        };
        r3.onerror = function () { setInfo('❌ Could not read file.'); };
        r3.readAsText(file);
    }
}

function extractPDFText(buf, filename, setInfo) {
    window.pdfjsLib.getDocument({ data: buf }).promise.then(function (pdf) {
        var pp = [];
        for (var i = 1; i <= pdf.numPages; i++) pp.push(pdf.getPage(i).then(function (p) {
            return p.getTextContent().then(function (tc) { return tc.items.map(function (x) { return x.str; }).join(' '); });
        }));
        return Promise.all(pp).then(function (pages) {
            S.uploadedContent = pages.join('\n').slice(0, 80000);
            setInfo('📄 ' + filename + ' (' + pdf.numPages + ' pages)');
            showUploadStudy(filename, 'text');
        });
    }).catch(function () { setInfo('❌ PDF parse failed. Try copy-pasting text.'); });
}

function showUploadStudy(filename, type) {
    S.query = filename;
    S.title = filename.replace(/\.[^.]+$/, '');
    setView('loading');
    setLoadMsg('🤖 Analysing "' + esc(S.title) + '"…');
    loadUploadedDoc(S.title, type);
}

async function loadUploadedDoc(name, type) {
    try {
        var msgs;
        if (type === 'img' && S.uploadedBase64) {
            msgs = [
                { role: 'system', content: 'You are an expert tutor. Return ONLY valid JSON.' },
                { role: 'user', content: [
                    { type: 'text', text: 'Analyse this image and create a study guide. Return ONLY JSON:\n{"description":"2-3 sentences","chapters":[{"title":"Chapter Name","summary":"2-3 sentence overview"}]}' },
                    { type: 'image_url', image_url: { url: S.uploadedBase64 } }
                ]}
            ];
        } else {
            var snippet = (S.uploadedContent || '').slice(0, 7000);
            msgs = [
                { role: 'system', content: 'You are an expert tutor. Return ONLY valid JSON.' },
                { role: 'user', content: 'Create a study guide with 8-12 chapters for this content.\n\nTitle: "' + name + '"\n\nContent:\n' + snippet + '\n\nReturn ONLY JSON:\n{"description":"2-3 sentences","chapters":[{"title":"Chapter Name","summary":"2-3 sentence overview"}]}' }
            ];
        }
        var raw  = await aiChat(msgs, 0.5);
        var m    = raw.match(/\{[\s\S]*\}/);
        var data = m ? JSON.parse(m[0]) : null;
        if (data && data.chapters && data.chapters.length) {
            S.source      = type;
            S.description = data.description || '';
            S.chapters    = data.chapters.map(function (c, i) { return { title: c.title, index: i, summary: c.summary }; });
            S.cache       = {};
            saveHist({ query: name, title: S.title, type: type, chapters: S.chapters.map(function (c) { return c.title; }) });
            renderStudy();
            selectChapter(0);
        } else {
            S.source = type; S.description = 'Uploaded: ' + name;
            S.chapters = [{ title: 'Full Document', index: 0 }];
            S.cache = { 0: S.uploadedContent || '' };
            renderStudy(); selectChapter(0);
        }
    } catch (e) {
        showErr('Could not analyse document: ' + e.message);
        setView('home');
    }
}

/* ── SEARCH ─────────────────────────────────────────────────── */
function setupSearch() {
    var form = document.getElementById('std-search-form');
    var inp  = document.getElementById('std-search-input');
    if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        var q = (inp ? inp.value : '').trim();
        if (q) doSearch(q);
    });
}

async function doSearch(q) {
    S.query = q;
    setView('loading');
    setLoadMsg('🔍 Searching for "' + esc(q) + '"…');
    var results = await Promise.allSettled([wikiSearch(q), bookSearch(q)]);
    var wiki    = results[0].status === 'fulfilled' ? results[0].value : [];
    var books   = results[1].status === 'fulfilled' ? results[1].value : [];
    if (!wiki.length && !books.length) { await loadAI(q); } else { showResults(wiki, books, q); }
}

async function wikiSearch(q) {
    var r = await fetch(WIKI_API + '?action=query&list=search&srsearch=' + encodeURIComponent(q) + '&srlimit=6&format=json&origin=*', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new Error('Wiki error');
    var d = await r.json();
    return ((d.query && d.query.search) || []).map(function (x) {
        return { title: x.title, desc: (x.snippet || '').replace(/<[^>]*>/g, ''), type: 'wiki' };
    });
}

async function bookSearch(q) {
    var r = await fetch(BOOKS_API + '?q=' + encodeURIComponent(q) + '&maxResults=6&orderBy=relevance', { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return [];
    var d = await r.json();
    return (d.items || []).map(function (b) {
        var v = b.volumeInfo || {};
        return { id: b.id, title: v.title || 'Unknown', authors: (v.authors || []).join(', '), desc: (v.description || '').slice(0, 300), thumb: v.imageLinks ? v.imageLinks.thumbnail : null, year: (v.publishedDate || '').slice(0, 4), type: 'book' };
    });
}

function showResults(wiki, books, q) {
    var html = '<div class="std-results-head"><h2>Results for "' + esc(q) + '"</h2><p>Select a source to study</p></div>';
    if (wiki.length) {
        html += '<div class="std-res-sec"><div class="std-res-sec-lbl">📖 Wikipedia Topics</div><div class="std-res-grid">';
        wiki.forEach(function (r) {
            html += '<div class="std-res-card" data-type="wiki" data-title="' + esc(r.title) + '"><div class="std-res-icon">📖</div><div class="std-res-info"><div class="std-res-title">' + esc(r.title) + '</div><div class="std-res-desc">' + esc(r.desc) + '</div></div></div>';
        });
        html += '</div></div>';
    }
    if (books.length) {
        html += '<div class="std-res-sec"><div class="std-res-sec-lbl">📚 Books &amp; Textbooks</div><div class="std-res-grid">';
        books.forEach(function (b) {
            var img = b.thumb ? '<img src="' + b.thumb + '" class="std-res-thumb" alt="" loading="lazy">' : '<div class="std-res-thumb-ph">📚</div>';
            html += '<div class="std-res-card" data-type="book" data-bookid="' + esc(b.id) + '" data-title="' + esc(b.title) + '" data-desc="' + esc(b.desc) + '">' + img + '<div class="std-res-info"><div class="std-res-title">' + esc(b.title) + '</div><div class="std-res-meta">' + (b.authors ? 'by ' + esc(b.authors) : '') + (b.year ? ' · ' + b.year : '') + '</div><div class="std-res-desc">' + esc(b.desc) + '</div></div></div>';
        });
        html += '</div></div>';
    }
    html += '<div class="std-res-sec"><div class="std-res-sec-lbl">🤖 AI-Generated Study Guide</div><div class="std-res-grid"><div class="std-res-card std-res-ai" data-type="ai" data-title="' + esc(q) + '"><div class="std-res-icon">🤖</div><div class="std-res-info"><div class="std-res-title">AI Study Guide: ' + esc(q) + '</div><div class="std-res-desc">Full guide with chapters, KaTeX math, summaries &amp; practice tests — powered by Groq AI.</div></div></div></div></div>';
    var c = document.getElementById('std-results-container');
    if (c) {
        c.innerHTML = html;
        c.querySelectorAll('.std-res-card').forEach(function (card) {
            card.addEventListener('click', function () {
                var t = card.dataset.type;
                if (t === 'wiki') loadWiki(card.dataset.title);
                else if (t === 'book') loadBook(card.dataset.bookid, card.dataset.title, card.dataset.desc);
                else loadAI(card.dataset.title);
            });
        });
    }
    setView('results');
}

/* ── LOAD WIKIPEDIA ─────────────────────────────────────────── */
async function loadWiki(title) {
    setView('loading');
    setLoadMsg('📖 Loading "' + esc(title) + '" from Wikipedia…');
    try {
        var [sumRes, secRes] = await Promise.all([
            fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')), { signal: AbortSignal.timeout(10000) }),
            fetch(WIKI_API + '?action=parse&page=' + encodeURIComponent(title) + '&prop=sections&format=json&origin=*', { signal: AbortSignal.timeout(10000) })
        ]);
        var sum = await sumRes.json();
        var sec = await secRes.json();
        var rawSecs  = (sec.parse && sec.parse.sections) ? sec.parse.sections : [];
        var chapters = [{ title: 'Introduction', index: 0, level: 1 }];
        rawSecs.filter(function (s) { return parseInt(s.toclevel) <= 2 && s.line; }).slice(0, 20)
            .forEach(function (s) { chapters.push({ title: s.line.replace(/<[^>]*>/g, ''), index: parseInt(s.index), level: parseInt(s.toclevel) }); });
        S.source = 'wiki'; S.title = title; S.wikiTitle = title;
        S.description = sum.extract || sum.description || '';
        S.chapters = chapters; S.cache = {}; S.cache[0] = S.description;
        saveHist({ query: S.query, title: title, type: 'wiki', chapters: chapters.map(function (c) { return c.title; }) });
        renderStudy(); selectChapter(0);
    } catch (e) { await loadAI(title); }
}

/* ── LOAD BOOK ──────────────────────────────────────────────── */
async function loadBook(bookId, title, desc) {
    setView('loading');
    setLoadMsg('🤖 Generating chapters for "' + esc(title) + '"…');
    try {
        var raw = await aiChat([
            { role: 'system', content: 'You are an expert curriculum designer. Return ONLY valid JSON, no markdown.' },
            { role: 'user', content: 'Create a comprehensive chapter structure for the textbook "' + title + '".\n' + (desc ? 'Description: ' + desc + '\n' : '') + 'Return ONLY JSON array:\n[{"title":"Chapter Name","level":1}]  — 10-14 chapters.' }
        ], 0.4);
        var m   = raw.match(/\[[\s\S]*\]/);
        if (!m) throw new Error('No chapters');
        var chapters = JSON.parse(m[0]).map(function (c, i) { return { title: c.title, index: i, level: c.level || 1 }; });
        S.source = 'book'; S.title = title; S.description = desc;
        S.chapters = chapters; S.cache = {};
        saveHist({ query: S.query, title: title, type: 'book', chapters: chapters.map(function (c) { return c.title; }) });
        renderStudy(); selectChapter(0);
    } catch (e) { await loadAI(title); }
}

/* ── LOAD AI ────────────────────────────────────────────────── */
async function loadAI(q) {
    setView('loading');
    setLoadMsg('🤖 Generating AI study guide for "' + esc(q) + '"…');
    try {
        var raw = await aiChat([
            { role: 'system', content: 'You are an expert academic content creator. Return ONLY valid JSON, no markdown.' },
            { role: 'user', content: 'Create a comprehensive study guide for: "' + q + '"\n\nReturn ONLY this JSON:\n{"description":"2-3 sentence overview","chapters":[{"title":"Chapter Name","summary":"2-3 sentence preview"}]}\n\nRules:\n- 10-14 chapters\n- Logical progression: intro → core → advanced → applications\n- Include Glossary at the end\n- Note if topic involves math/science/engineering' }
        ], 0.5);
        var m    = raw.match(/\{[\s\S]*\}/);
        var data = m ? JSON.parse(m[0]) : null;
        if (!data || !data.chapters) throw new Error('Parse failed');
        S.source = 'ai'; S.title = q; S.description = data.description || '';
        S.chapters = data.chapters.map(function (c, i) { return { title: c.title, index: i, summary: c.summary }; });
        S.cache    = {};
        saveHist({ query: q, title: q, type: 'ai', chapters: S.chapters.map(function (c) { return c.title; }) });
        renderStudy(); selectChapter(0);
    } catch (e) {
        showErr('Could not generate guide: ' + e.message);
        setView('home');
    }
}

/* ── RENDER STUDY VIEW ──────────────────────────────────────── */
function renderStudy() {
    var titleEl = document.getElementById('std-study-title');
    var chList  = document.getElementById('std-chapters-list');
    if (titleEl) titleEl.textContent = S.title;
    if (chList) {
        chList.innerHTML = S.chapters.map(function (c, i) {
            var cls = 'std-ch-item' + (c.level === 2 ? ' std-ch-sub' : '');
            return '<div class="' + cls + '" data-idx="' + i + '"><span class="std-ch-num">' + (i + 1) + '</span><span class="std-ch-label">' + esc(c.title) + '</span></div>';
        }).join('');
        chList.querySelectorAll('.std-ch-item').forEach(function (el) {
            el.addEventListener('click', function () { selectChapter(parseInt(el.dataset.idx)); });
        });
    }
    setView('study');
}

function selectChapter(idx) {
    S.activeIdx = idx;
    document.querySelectorAll('.std-ch-item').forEach(function (el, i) { el.classList.toggle('active', i === idx); });
    hideAIPanel();
    loadChapterContent(idx);
    var panel = document.querySelector('.std-chapters-panel');
    if (panel) panel.classList.remove('open');
}

async function loadChapterContent(idx) {
    var ch = S.chapters[idx]; if (!ch) return;
    var contentArea = document.getElementById('std-chapter-content');
    var titleEl     = document.getElementById('std-content-title');
    if (titleEl) titleEl.textContent = ch.title;
    if (contentArea) contentArea.innerHTML = '<div class="std-content-loading"><div class="std-spinner"></div><p>Loading content…</p></div>';
    if (S.cache[idx]) { showContent(idx, S.cache[idx]); return; }
    try {
        var text = '';
        if (S.source === 'wiki') {
            text = await fetchWikiSection(S.wikiTitle, ch.index);
        } else if (S.source === 'text' && S.uploadedContent) {
            text = await aiChat([
                { role: 'system', content: 'You are an expert tutor. Use $...$ for inline math and $$...$$ for display math.' },
                { role: 'user', content: 'Based on this document, write a detailed educational explanation of the section "' + ch.title + '" from "' + S.title + '".\n\nDocument:\n' + S.uploadedContent.slice(0, 10000) + '\n\nWrite 400-700 words with clear explanations, examples, and key points. Include LaTeX math where relevant.' }
            ], 0.6);
        } else if (S.source === 'img' && S.uploadedBase64) {
            text = await aiChatVision([
                { role: 'system', content: 'You are an expert tutor. Write clear educational content with LaTeX math where relevant.' },
                { role: 'user', content: [
                    { type: 'text', text: 'Write a detailed educational explanation of "' + ch.title + '" based on this image. 400-700 words. Use $...$ inline math and $$...$$ display math where relevant.' },
                    { type: 'image_url', image_url: { url: S.uploadedBase64 } }
                ]}
            ], 0.6);
        } else {
            text = await aiChat([
                { role: 'system', content: 'You are an expert academic author. Write detailed, engaging educational content. Use $...$ for inline math and $$...$$ for block/display math. Use clear structure.' },
                { role: 'user', content: 'Write a comprehensive educational chapter on "' + ch.title + '" from the study guide "' + S.title + '".' + (ch.summary ? '\nChapter overview: ' + ch.summary : '') + '\n\nRequirements:\n- 500-800 words\n- Clear introduction, core concepts, examples\n- Use LaTeX math notation where applicable\n- Key takeaways at end\n- Write as a high-quality textbook chapter' }
            ], 0.65);
        }
        S.cache[idx] = text;
        showContent(idx, text);
    } catch (e) {
        if (contentArea) contentArea.innerHTML = '<div class="std-content-empty"><p>⚠️ Could not load content: ' + esc(e.message) + '</p><button class="std-btn std-btn-primary" onclick="loadChapterContent(' + idx + ')">🔄 Retry</button></div>';
    }
}

async function fetchWikiSection(title, sectionIdx) {
    if (sectionIdx === 0) {
        var r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g, '_')), { signal: AbortSignal.timeout(10000) });
        var d = await r.json();
        return d.extract || d.description || '';
    }
    var r2 = await fetch(WIKI_API + '?action=parse&page=' + encodeURIComponent(title) + '&prop=wikitext&section=' + sectionIdx + '&format=json&origin=*', { signal: AbortSignal.timeout(10000) });
    var d2 = await r2.json();
    var wt = (d2.parse && d2.parse.wikitext && d2.parse.wikitext['*']) || '';
    return wt.replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').replace(/'{2,3}/g, '').replace(/==+[^=]+=+/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 4000);
}

function showContent(idx, text) {
    var contentArea = document.getElementById('std-chapter-content');
    if (!contentArea) return;
    contentArea.innerHTML = '<div class="std-content-body">' + renderParagraphs(text) + '</div>';
    var body = contentArea.querySelector('.std-content-body');
    if (body) setTimeout(function () { renderMath(body); }, 100);
}

/* ── STUDY FEATURES ─────────────────────────────────────────── */
async function doSummarise() {
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx], content = S.cache[S.activeIdx] || '';
    showAIPanel('📝 Summary', 'Generating summary…', null);
    try {
        var res = await aiChat([
            { role: 'system', content: 'You are an expert tutor. Create clear summaries. Use $...$ for inline math and $$...$$ for block math.' },
            { role: 'user', content: 'Summarise "' + ch.title + '" from "' + S.title + '"' + (content ? ' using:\n' + content.slice(0, 3000) : '') + '\n\n1. Key concepts (bullet points)\n2. Main takeaways (2-3 sentences)\n3. Important formulas or definitions\n\nUse LaTeX math where relevant.' }
        ], 0.6);
        showAIPanel('📝 Summary — ' + ch.title, null, res);
    } catch (e) { showAIPanel('📝 Summary', null, '⚠️ Error: ' + e.message); }
}

async function doExplain() {
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx], content = S.cache[S.activeIdx] || '';
    showAIPanel('💡 Explanation', 'Generating explanation…', null);
    try {
        var res = await aiChat([
            { role: 'system', content: 'You are an expert tutor. Write detailed explanations. Use $...$ inline math and $$...$$ for display math.' },
            { role: 'user', content: 'Write a comprehensive explanation of "' + ch.title + '" from "' + S.title + '".\n' + (content ? 'Reference:\n' + content.slice(0, 2500) + '\n\n' : '') + 'Include:\n1. Clear breakdown of complex ideas\n2. Real-world analogies and examples\n3. Why and how, not just what\n4. Common misconceptions\n5. All relevant math with LaTeX\n\nWrite 400-600 words.' }
        ], 0.7);
        showAIPanel('💡 Explanation — ' + ch.title, null, res);
    } catch (e) { showAIPanel('💡 Explanation', null, '⚠️ Error: ' + e.message); }
}

function showAIPanel(title, loading, content) {
    var p  = document.getElementById('std-ai-panel');
    var tE = document.getElementById('std-ai-panel-title');
    var bE = document.getElementById('std-ai-panel-body');
    if (!p) return;
    p.style.display = 'block';
    if (tE) tE.textContent = title;
    if (bE) {
        if (loading) {
            bE.innerHTML = '<div class="std-ai-loading"><div class="std-spinner"></div><span>' + esc(loading) + '</span></div>';
        } else if (content) {
            bE.innerHTML = renderParagraphs(content);
            setTimeout(function () { renderMath(bE); }, 100);
        }
    }
    setTimeout(function () { if (p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
}

function hideAIPanel() {
    var p = document.getElementById('std-ai-panel');
    if (p) p.style.display = 'none';
}

/* ── PRACTICE TEST ──────────────────────────────────────────── */
async function openTest() {
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }
    var ch      = S.chapters[S.activeIdx];
    var content = S.cache[S.activeIdx] || '';
    var modal   = document.getElementById('std-test-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-loading"><div class="std-spinner lg"></div><h3>🤖 Generating 20 Practice Questions</h3><p>Chapter: <strong>' + esc(ch.title) + '</strong></p><div class="std-test-load-sub">Using Groq AI — please wait…</div></div></div>';

    var PROMPT = [
        { role: 'system', content: 'You are an expert educator. Return ONLY valid JSON, no markdown, no extra text.' },
        { role: 'user', content: 'Generate exactly 20 multiple-choice questions for:\nTopic: "' + S.title + '"\nSection: "' + ch.title + '"\n' + (content ? 'Material:\n' + content.slice(0, 3500) + '\n\n' : '') + 'Return ONLY this JSON array:\n[{"q":"question","opts":["A","B","C","D"],"ans":0,"exp":"Thorough explanation minimum 10 lines."}]\n\nRules: Exactly 20. Mix difficulty. Include math in LaTeX where relevant.' }
    ];

    var qStr;
    try { qStr = await aiChat(PROMPT, 0.35); }
    catch (e) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Failed to Generate Questions</h3><p>' + esc(e.message) + '</p><button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button></div></div>';
        return;
    }

    var qs = [];
    try {
        var m = qStr.match(/\[[\s\S]*\]/);
        if (m) qs = JSON.parse(m[0]);
    } catch (e) {
        try { var c2 = qStr.replace(/```json\n?/g,'').replace(/```\n?/g,''); var m2 = c2.match(/\[[\s\S]*\]/); if (m2) qs = JSON.parse(m2[0]); } catch(e2){}
    }

    if (!qs || qs.length < 4) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Could Not Parse Questions</h3><p>Please try again.</p><button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button></div></div>';
        return;
    }

    qs = qs.slice(0, 20);
    S.testQ = qs; S.testAns = new Array(qs.length).fill(-1);
    renderTestQ(0);
}

function renderTestQ(idx) {
    var q = S.testQ[idx]; if (!q) { showTestResults(); return; }
    var modal = document.getElementById('std-test-modal'); if (!modal) return;
    var prog = Math.round((idx / S.testQ.length) * 100);
    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-header"><div class="std-test-prog-bar"><div class="std-test-prog-fill" style="width:' + prog + '%"></div></div><div class="std-test-meta">Question ' + (idx + 1) + ' of ' + S.testQ.length + '</div></div><div class="std-test-body"><div class="std-test-q">' + esc(q.q) + '</div><div class="std-test-opts">' +
        (q.opts || []).map(function (o, oi) {
            return '<button class="std-test-opt" data-i="' + oi + '"><span class="std-test-opt-ltr">' + ['A','B','C','D'][oi] + '</span><span class="std-test-opt-txt">' + esc(o) + '</span></button>';
        }).join('') + '</div></div><div class="std-test-footer"><span class="std-test-ch-tag">' + esc((S.chapters[S.activeIdx]||{}).title||'') + '</span></div></div>';
    modal.querySelectorAll('.std-test-opt').forEach(function (btn) {
        btn.addEventListener('click', function () { handleAnswer(idx, parseInt(btn.dataset.i)); });
    });
    setTimeout(function () { var q_el = modal.querySelector('.std-test-q'); if (q_el) renderMath(q_el); }, 80);
}

function handleAnswer(qIdx, sel) {
    var q = S.testQ[qIdx]; S.testAns[qIdx] = sel;
    var ok = sel === q.ans;
    var modal = document.getElementById('std-test-modal'); if (!modal) return;
    modal.querySelectorAll('.std-test-opt').forEach(function (btn) {
        var i = parseInt(btn.dataset.i); btn.disabled = true;
        if (i === q.ans) btn.classList.add('correct');
        else if (i === sel && !ok) btn.classList.add('wrong');
    });
    var body = modal.querySelector('.std-test-body');
    if (body) {
        var fb = document.createElement('div');
        fb.className = 'std-test-fb ' + (ok ? 'correct' : 'wrong');
        fb.innerHTML = (ok ? '✅ Correct!' : '❌ Wrong. Correct: <strong>' + ['A','B','C','D'][q.ans] + '</strong>') +
            '<div class="std-test-exp-prev">' + esc((q.exp||'').slice(0,320)) + ((q.exp||'').length>320?'…':'') + '</div>';
        body.appendChild(fb);
        renderMath(fb);
    }
    var footer = modal.querySelector('.std-test-footer');
    var isLast = qIdx === S.testQ.length - 1;
    if (footer) {
        footer.innerHTML = '<button class="std-btn std-btn-primary" id="std-nxt-btn">' + (isLast ? '🏁 See Results' : 'Next →') + '</button>';
        var nxt = document.getElementById('std-nxt-btn');
        if (nxt) nxt.addEventListener('click', function () { if (isLast) showTestResults(); else renderTestQ(qIdx + 1); });
    }
}

function showTestResults() {
    var qs = S.testQ, ans = S.testAns; if (!qs) return;
    var correct = ans.filter(function (a, i) { return a === qs[i].ans; }).length;
    var pct     = Math.round(correct / qs.length * 100);
    var emoji, msg, col;
    if (pct >= 90)      { emoji='🏆'; msg='Outstanding! You\'ve mastered this!';    col='#10b981'; }
    else if (pct >= 70) { emoji='🌟'; msg='Great job! Solid understanding!';         col='#7c3aed'; }
    else if (pct >= 50) { emoji='👍'; msg='Good effort! Keep reviewing!';            col='#f59e0b'; }
    else if (pct >= 30) { emoji='💪'; msg='Keep going! Practice makes perfect!';     col='#f59e0b'; }
    else                { emoji='📚'; msg='Review the chapters carefully, then retry.'; col='#ef4444'; }
    var modal = document.getElementById('std-test-modal'); if (!modal) return;
    var html = '<div class="std-test-inner" style="overflow-y:auto;max-height:90vh"><div class="std-test-res-head"><div class="std-test-score-circle" style="border-color:' + col + '"><div class="std-test-score-pct">' + pct + '%</div><div class="std-test-score-sub">' + correct + '/' + qs.length + '</div></div><div style="font-size:2.6rem">' + emoji + '</div><p style="color:' + col + ';font-weight:700;font-size:1rem;margin:0;max-width:320px;text-align:center">' + esc(msg) + '</p></div><div class="std-test-res-actions"><button class="std-btn std-btn-primary" id="std-retry-btn">🔄 Retry</button><button class="std-btn std-btn-ghost" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">✕ Close</button></div><div class="std-test-res-list"><h3>Results &amp; Explanations</h3>';
    qs.forEach(function (q, i) {
        var ua = ans[i], ok = ua === q.ans;
        html += '<div class="std-res-item ' + (ok?'correct':'wrong') + '"><div class="std-res-item-head"><span class="std-res-num">' + (i+1) + '</span><span>' + (ok?'✅':'❌') + '</span><div class="std-res-q">' + esc(q.q) + '</div></div><div class="std-res-ans"><span style="color:#10b981">Correct: </span><strong>' + ['A','B','C','D'][q.ans] + '. ' + esc(((q.opts||[])[q.ans])||'') + '</strong>' + (ua>=0&&!ok?'<br><span style="color:#ef4444">Your answer: </span>' + ['A','B','C','D'][ua] + '. ' + esc(((q.opts||[])[ua])||''):'') + '</div><div class="std-res-exp"><strong>Explanation:</strong>' + renderParagraphs(q.exp||'No explanation.') + '</div></div>';
    });
    html += '</div></div>';
    modal.innerHTML = html;
    var rb = document.getElementById('std-retry-btn');
    if (rb) rb.addEventListener('click', function () { S.testQ = null; openTest(); });
    setTimeout(function () { renderMath(modal); }, 150);
}

/* ── AI HELPERS ─────────────────────────────────────────────── */
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

/* Primary: window.groqFetch() — uses keys from Firebase admin (aqs-groq-key.js).
   Fallback: Pollinations (free, no key needed).                               */
async function aiChat(messages, temp) {
    /* ── Groq via shared key manager (aqs-groq-key.js) ── */
    if (typeof window.groqFetch === 'function') {
        try {
            var rg = await window.groqFetch(
                { model: GROQ_MODEL, messages: messages, temperature: temp || 0.7, max_tokens: 3000 },
                { signal: AbortSignal.timeout(60000) }
            );
            if (!rg.ok) {
                var errTxt = '';
                try { var errJ = await rg.json(); errTxt = (errJ.error && errJ.error.message) || ''; } catch(e){}
                throw new Error('Groq ' + rg.status + (errTxt ? ': ' + errTxt : ''));
            }
            var dg = await rg.json();
            if (!dg.choices || !dg.choices[0]) throw new Error('Empty Groq response');
            return dg.choices[0].message.content || '';
        } catch (e) {
            /* Fall through to Pollinations fallback */
            console.warn('[aqs-study] Groq failed, using fallback:', e.message);
        }
    }

    /* ── Pollinations fallback ── */
    for (var pa = 0; pa < 2; pa++) {
        try {
            var rp = await fetch('https://text.pollinations.ai/openai', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'openai', messages: messages, temperature: temp || 0.7, max_tokens: 2000 }),
                signal: AbortSignal.timeout(60000)
            });
            if (rp.status === 429) { await sleep((pa + 1) * 3000); continue; }
            if (!rp.ok) throw new Error('AI error ' + rp.status);
            var dp = await rp.json();
            if (!dp.choices || !dp.choices[0]) throw new Error('No AI response');
            return dp.choices[0].message.content || '';
        } catch (e) {
            if (pa < 1) { await sleep(3000); continue; }
            throw e;
        }
    }
    throw new Error('AI unavailable. Please try again in a moment.');
}

/* Vision — uses Pollinations (supports image_url content type) */
async function aiChatVision(messages, temp) {
    var r = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'openai', messages: messages, temperature: temp || 0.7, max_tokens: 2000 }),
        signal: AbortSignal.timeout(60000)
    });
    if (!r.ok) throw new Error('Vision AI error ' + r.status);
    var d = await r.json();
    if (!d.choices || !d.choices[0]) throw new Error('No vision response');
    return d.choices[0].message.content || '';
}

function checkAI() {
    var badge = document.querySelector('.std-groq-badge');
    if (badge) {
        var hasKey = typeof window.getGroqKey === 'function' ? !!window.getGroqKey() : false;
        if (hasKey) {
            badge.className = 'std-groq-badge ok';
            badge.textContent = '✓ Groq Ready';
        } else {
            badge.className = 'std-groq-badge warn';
            badge.textContent = '⚠ No Groq Key (using fallback)';
        }
    }
}

/* ── EVENTS ─────────────────────────────────────────────────── */
function setupEvents() {
    var $ = function (id) { return document.getElementById(id); };

    /* Navigation */
    $('std-back-btn')     && $('std-back-btn').addEventListener('click', function () { setView('home'); });
    $('std-results-back') && $('std-results-back').addEventListener('click', function () { setView('home'); });

    /* Study action buttons */
    $('std-summarise-btn') && $('std-summarise-btn').addEventListener('click', doSummarise);
    $('std-explain-btn')   && $('std-explain-btn').addEventListener('click', doExplain);
    $('std-test-btn')      && $('std-test-btn').addEventListener('click', openTest);

    /* AI panel close */
    $('std-ai-panel-close') && $('std-ai-panel-close').addEventListener('click', hideAIPanel);

    /* Test modal close */
    $('std-test-close-btn') && $('std-test-close-btn').addEventListener('click', function () {
        var m = $('std-test-modal'); if (m) m.style.display = 'none';
    });

    /* Action bar data attributes */
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-std-action]');
        if (!btn) return;
        var a = btn.dataset.stdAction;
        if (a === 'summarise') doSummarise();
        else if (a === 'explain') doExplain();
        else if (a === 'test') openTest();
    });

    /* Mobile chapter toggle */
    $('std-ch-toggle') && $('std-ch-toggle').addEventListener('click', function () {
        var p = document.querySelector('.std-chapters-panel');
        if (p) p.classList.toggle('open');
    });

    /* History delete */
    var histList = $('std-history-list');
    if (histList) histList.addEventListener('click', function (e) {
        var del = e.target.closest('.std-hist-del');
        if (del) { e.stopPropagation(); deleteHist(parseInt(del.dataset.id)); }
    });

    /* Test modal backdrop */
    var tm = $('std-test-modal');
    if (tm) tm.addEventListener('click', function (e) { if (e.target === tm) tm.style.display = 'none'; });
}

/* ── HISTORY ────────────────────────────────────────────────── */
function saveHist(item) {
    try {
        var h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
        h = h.filter(function (x) { return x.title !== item.title; });
        h.unshift(Object.assign({ id: Date.now() }, item));
        if (h.length > MAX_HIST) h = h.slice(0, MAX_HIST);
        localStorage.setItem(HIST_KEY, JSON.stringify(h));
        renderHistory();
    } catch (e) {}
}

function renderHistory() {
    var c = document.getElementById('std-history-list');
    if (!c) return;
    try {
        var h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
        if (!h.length) {
            c.innerHTML = '<div class="std-hist-empty">No recent topics yet. Search above or upload a file to get started!</div>';
            return;
        }
        var icons = { wiki:'📖', book:'📚', ai:'🤖', text:'📄', img:'🖼' };
        c.innerHTML = h.map(function (x) {
            return '<div class="std-hist-item" data-q="' + esc(x.query || x.title) + '"><span class="std-hist-icon">' + (icons[x.type]||'📝') + '</span><div class="std-hist-info"><div class="std-hist-title">' + esc(x.title) + '</div><div class="std-hist-meta">' + (x.chapters ? x.chapters.length + ' chapters · ' : '') + new Date(x.id).toLocaleDateString() + '</div></div><button class="std-hist-del" data-id="' + x.id + '" title="Remove">✕</button></div>';
        }).join('');
        c.querySelectorAll('.std-hist-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (!e.target.classList.contains('std-hist-del')) doSearch(el.dataset.q);
            });
        });
    } catch (e) { c.innerHTML = ''; }
}

function deleteHist(id) {
    try {
        var h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
        localStorage.setItem(HIST_KEY, JSON.stringify(h.filter(function (x) { return x.id !== id; })));
        renderHistory();
    } catch (e) {}
}

/* ── UTILS ──────────────────────────────────────────────────── */
function setView(v) {
    var views = {
        home:    document.getElementById('std-home'),
        loading: document.getElementById('std-loading-view'),
        results: document.getElementById('std-results-view'),
        study:   document.getElementById('std-study-view')
    };
    Object.keys(views).forEach(function (k) {
        if (views[k]) views[k].style.display = (k === v) ? '' : 'none';
    });
}

function setLoadMsg(msg) {
    var el = document.getElementById('std-load-msg');
    if (el) el.textContent = msg;
}

function showErr(msg) {
    var el = document.getElementById('std-global-error');
    if (!el) return;
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(function () { el.style.display = 'none'; }, 5000);
}

function renderParagraphs(text) {
    if (!text) return '';
    return '<p>' + esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════════════════
   FLOATING VOICE AI SUMMON — built into study page
   ══════════════════════════════════════════════════════════════ */

function injectSummonStyles() {
    if (document.getElementById('std-summon-css')) return;
    var s = document.createElement('style');
    s.id = 'std-summon-css';
    s.textContent = [
        '#std-summon-root{position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;align-items:flex-end;gap:10px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}',
        '#std-summon-orb{width:58px;height:58px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#a78bfa,#7c3aed 60%,#4c1d95);display:flex;align-items:center;justify-content:center;cursor:pointer;position:relative;transition:transform .2s;box-shadow:0 0 18px 4px rgba(139,92,246,.45);animation:summon-idle 3s ease-in-out infinite;flex-shrink:0}',
        '#std-summon-orb:hover{transform:scale(1.09)}',
        '#std-summon-orb-icon{color:#fff;font-size:1.55rem;user-select:none;pointer-events:none}',
        '.summon-ring{position:absolute;border-radius:50%;border:2px solid rgba(139,92,246,.3);top:50%;left:50%;transform:translate(-50%,-50%);opacity:0;pointer-events:none}',
        '.summon-ring.r1{width:76px;height:76px}',
        '.summon-ring.r2{width:96px;height:96px}',
        '.summon-ring.r3{width:118px;height:118px}',
        '@keyframes summon-idle{0%,100%{box-shadow:0 0 14px 3px rgba(139,92,246,.35)}50%{box-shadow:0 0 30px 10px rgba(139,92,246,.6)}}',
        '#std-summon-root[data-state=listening] #std-summon-orb{background:radial-gradient(circle at 35% 35%,#67e8f9,#06b6d4 60%,#0e7490);box-shadow:0 0 24px 8px rgba(6,182,212,.6);animation:summon-listen 1.4s ease-in-out infinite}',
        '@keyframes summon-listen{0%,100%{box-shadow:0 0 20px 5px rgba(6,182,212,.4)}50%{box-shadow:0 0 38px 14px rgba(6,182,212,.75)}}',
        '#std-summon-root[data-state=listening] .summon-ring{animation:summon-ring-out 2s ease-out infinite;border-color:rgba(6,182,212,.4);opacity:1}',
        '#std-summon-root[data-state=listening] .r1{animation-delay:0s}',
        '#std-summon-root[data-state=listening] .r2{animation-delay:.5s}',
        '#std-summon-root[data-state=listening] .r3{animation-delay:1s}',
        '@keyframes summon-ring-out{0%{transform:translate(-50%,-50%) scale(.85);opacity:.6}100%{transform:translate(-50%,-50%) scale(1.35);opacity:0}}',
        '#std-summon-root[data-state=thinking] #std-summon-orb{background:radial-gradient(circle at 35% 35%,#fde68a,#f59e0b 60%,#b45309);box-shadow:0 0 22px 7px rgba(245,158,11,.55);animation:summon-think .9s ease-in-out infinite alternate}',
        '@keyframes summon-think{0%{transform:scale(1)}100%{transform:scale(1.06)}}',
        '#std-summon-root[data-state=speaking] #std-summon-orb{background:radial-gradient(circle at 35% 35%,#6ee7b7,#10b981 60%,#065f46);box-shadow:0 0 22px 7px rgba(16,185,129,.55);animation:summon-speak .55s ease-in-out infinite alternate}',
        '@keyframes summon-speak{0%{transform:scale(1);box-shadow:0 0 18px 4px rgba(16,185,129,.4)}100%{transform:scale(1.1);box-shadow:0 0 38px 14px rgba(16,185,129,.7)}}',
        '#std-summon-root[data-state=speaking] .summon-ring{animation:summon-ring-out .85s ease-in-out infinite alternate;border-color:rgba(16,185,129,.5);opacity:1}',
        '#std-summon-panel{display:none;flex-direction:column;width:310px;max-height:440px;background:#0e0c20;border:1.5px solid #342d62;border-radius:16px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.65);animation:summon-panel-in .2s ease-out}',
        '#std-summon-root.open #std-summon-panel{display:flex}',
        '@keyframes summon-panel-in{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}',
        '#std-summon-panel-hdr{display:flex;align-items:center;gap:8px;padding:10px 13px;background:#141128;border-bottom:1px solid #252048;flex-shrink:0}',
        '#std-summon-dot{width:8px;height:8px;border-radius:50%;background:#8b5cf6;flex-shrink:0;transition:background .3s}',
        '#std-summon-root[data-state=listening] #std-summon-dot{background:#06b6d4;animation:summon-dot .9s ease-in-out infinite}',
        '#std-summon-root[data-state=thinking]  #std-summon-dot{background:#f59e0b;animation:summon-dot .45s ease-in-out infinite}',
        '#std-summon-root[data-state=speaking]  #std-summon-dot{background:#10b981;animation:summon-dot .55s ease-in-out infinite alternate}',
        '@keyframes summon-dot{0%,100%{opacity:1}50%{opacity:.25}}',
        '#std-summon-state-txt{flex:1;font-size:.78rem;font-weight:700;color:#eeeaff;letter-spacing:.02em}',
        '#std-summon-close{background:none;border:none;color:#8c84b8;cursor:pointer;font-size:.88rem;padding:2px 5px;border-radius:4px;transition:color .15s,background .15s}',
        '#std-summon-close:hover{color:#eeeaff;background:#1c1837}',
        '#std-summon-msgs{flex:1;overflow-y:auto;padding:11px 12px;display:flex;flex-direction:column;gap:7px;min-height:100px}',
        '#std-summon-msgs::-webkit-scrollbar{width:3px}',
        '#std-summon-msgs::-webkit-scrollbar-thumb{background:#342d62;border-radius:2px}',
        '.summon-msg{max-width:88%;padding:7px 11px;border-radius:11px;font-size:.81rem;line-height:1.55;word-break:break-word}',
        '.summon-msg-user{align-self:flex-end;background:#3b1f8c;color:#ede9fe;border-bottom-right-radius:3px}',
        '.summon-msg-ai{align-self:flex-start;background:#141128;color:#c8c2f0;border:1px solid #252048;border-bottom-left-radius:3px}',
        '.summon-msg-sys{align-self:center;background:none;color:#8c84b8;font-size:.71rem;font-style:italic}',
        '#std-summon-interim{align-self:flex-end;font-size:.73rem;color:#06b6d4;font-style:italic;padding:2px 6px;min-height:16px}',
        '#std-summon-input-row{display:flex;gap:6px;padding:8px 11px;border-top:1px solid #252048;background:#141128;flex-shrink:0}',
        '#std-summon-text{flex:1;background:#0e0c20;border:1.5px solid #342d62;border-radius:7px;color:#eeeaff;font-size:.8rem;padding:6px 10px;outline:none;font-family:inherit;transition:border-color .2s}',
        '#std-summon-text:focus{border-color:#8b5cf6}',
        '#std-summon-text::placeholder{color:#8c84b8}',
        '#std-summon-send{background:#7c3aed;border:none;border-radius:7px;color:#fff;font-size:.95rem;width:34px;height:34px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}',
        '#std-summon-send:hover{background:#6d28d9}',
        '@media(max-width:480px){#std-summon-root{bottom:14px;right:10px}#std-summon-panel{width:calc(100vw - 20px)}}',
    ].join('');
    document.head.appendChild(s);
}

function injectSummonUI() {
    if (document.getElementById('std-summon-root')) return;
    var wrap = document.createElement('div');
    wrap.id = 'std-summon-root';
    wrap.setAttribute('data-state', 'idle');
    wrap.innerHTML = [
        '<div id="std-summon-panel">',
          '<div id="std-summon-panel-hdr">',
            '<span id="std-summon-dot"></span>',
            '<span id="std-summon-state-txt">XZILY AI</span>',
            '<button id="std-summon-close">&#x2715;</button>',
          '</div>',
          '<div id="std-summon-msgs"><div id="std-summon-interim"></div></div>',
          '<div id="std-summon-input-row">',
            '<input id="std-summon-text" type="text" placeholder="Or type here…" autocomplete="off">',
            '<button id="std-summon-send">&#x27A4;</button>',
          '</div>',
        '</div>',
        '<div id="std-summon-orb">',
          '<div class="summon-ring r1"></div>',
          '<div class="summon-ring r2"></div>',
          '<div class="summon-ring r3"></div>',
          '<span id="std-summon-orb-icon">&#x2726;</span>',
        '</div>',
    ].join('');
    document.body.appendChild(wrap);

    document.getElementById('std-summon-orb').addEventListener('click', summonToggle);
    document.getElementById('std-summon-close').addEventListener('click', summonHide);
    document.getElementById('std-summon-send').addEventListener('click', summonSendText);
    document.getElementById('std-summon-text').addEventListener('keydown', function(e) {
        if (e.key === 'Enter') summonSendText();
    });
}

function summonSetState(state) {
    var root = document.getElementById('std-summon-root');
    var txt  = document.getElementById('std-summon-state-txt');
    if (!root) return;
    root.setAttribute('data-state', state);
    var labels = { idle:'XZILY AI', listening:'Listening…', thinking:'Thinking…', speaking:'Speaking…' };
    if (txt) txt.textContent = labels[state] || 'XZILY AI';
}

function summonToggle() {
    if (VS.active) summonHide(); else summonShow();
}

function summonShow() {
    VS.active = true;
    var root = document.getElementById('std-summon-root');
    if (root) root.classList.add('open');
    summonSetState('speaking');
    var greeting = S.title
        ? 'Hello! I am XZILY AI. You are studying ' + S.title + '. Ask me anything!'
        : 'Hello! I am XZILY AI. How can I help you study today?';
    summonSpeak(greeting, function() {
        summonSetState('listening');
        summonStartListening();
    });
}

function summonHide() {
    VS.active = false;
    summonStopListening();
    summonStopSpeaking();
    var root = document.getElementById('std-summon-root');
    if (root) root.classList.remove('open');
    summonSetState('idle');
}

function summonStartListening() {
    if (VS.listening) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { summonAddMsg('sys', '⚠ Voice not supported. Use the text box.'); return; }
    var rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    VS.recognition = rec;
    VS.listening = true;
    VS.transcript = '';

    rec.onresult = function(e) {
        var interim = '', final = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript;
            else interim += e.results[i][0].transcript;
        }
        if (final) {
            VS.transcript += ' ' + final;
            summonShowInterim('');
            if (VS.speaking) summonStopSpeaking();
        } else {
            summonShowInterim(interim);
        }
        summonResetSilence();
    };

    rec.onend = function() {
        VS.listening = false;
        if (VS.active && !VS.speaking) setTimeout(function() { if (VS.active) summonStartListening(); }, 300);
    };

    rec.onerror = function(e) {
        VS.listening = false;
        if ((e.error === 'no-speech' || e.error === 'audio-capture') && VS.active) {
            setTimeout(function() { summonStartListening(); }, 500);
        }
    };

    try { rec.start(); } catch(err) { VS.listening = false; }
    summonResetSilence();
}

function summonStopListening() {
    clearTimeout(VS.silenceTimer);
    VS.listening = false;
    if (VS.recognition) { try { VS.recognition.stop(); } catch(e) {} VS.recognition = null; }
}

function summonResetSilence() {
    clearTimeout(VS.silenceTimer);
    VS.silenceTimer = setTimeout(function() {
        var q = VS.transcript.trim();
        VS.transcript = '';
        summonShowInterim('');
        if (q) summonHandleQuery(q);
    }, 10000);
}

function summonShowInterim(text) {
    var el = document.getElementById('std-summon-interim');
    if (el) el.textContent = text ? '🎙 ' + text : '';
}

function summonSendText() {
    var inp = document.getElementById('std-summon-text');
    var q = (inp ? inp.value : '').trim();
    if (!q) return;
    if (inp) inp.value = '';
    if (!VS.active) {
        VS.active = true;
        var root = document.getElementById('std-summon-root');
        if (root) root.classList.add('open');
    }
    summonHandleQuery(q);
}

async function summonHandleQuery(q) {
    summonAddMsg('user', q);
    summonSetState('thinking');
    summonStopListening();

    var context = '';
    if (S.title) context += 'The user is currently studying: "' + S.title + '". ';
    if (S.chapters[S.activeIdx]) context += 'Current chapter: "' + S.chapters[S.activeIdx].title + '". ';
    if (S.activeIdx >= 0 && S.cache[S.activeIdx]) context += 'Chapter content excerpt: ' + S.cache[S.activeIdx].slice(0, 800) + ' ';

    VS.history.push({ role: 'user', content: q });
    if (VS.history.length > 16) VS.history = VS.history.slice(-16);

    var messages = [
        { role: 'system', content: 'You are XZILY AI, a helpful, friendly voice study assistant. ' + context + 'Give clear, natural spoken answers. Keep responses under 100 words unless the user asks for detail. Use plain conversational sentences — no markdown, no bullet symbols.' }
    ].concat(VS.history);

    try {
        var text = await aiChat(messages, 0.7);
        VS.history.push({ role: 'assistant', content: text });
        if (VS.history.length > 16) VS.history = VS.history.slice(-16);
        summonAddMsg('ai', text);
        summonSpeak(text, function() {
            summonSetState('listening');
            summonStartListening();
        });
    } catch(e) {
        summonAddMsg('sys', '⚠ ' + e.message);
        summonSetState('listening');
        summonStartListening();
    }
}

function initSummonVoices() {
    if (!VS.synth) return;
    VS.synth.getVoices();
    if (VS.synth.onvoiceschanged !== undefined) VS.synth.onvoiceschanged = summonPickVoice;
}

function summonPickVoice() {
    if (VS.voice) return;
    var voices = VS.synth ? VS.synth.getVoices() : [];
    var preferred = ['Google US English', 'Microsoft Guy Online (Natural) - English (United States)', 'Samantha', 'Google UK English Male', 'Daniel'];
    for (var i = 0; i < preferred.length; i++) {
        var v = voices.find(function(vv) { return vv.name === preferred[i]; });
        if (v) { VS.voice = v; return; }
    }
    var en = voices.find(function(vv) { return vv.lang && vv.lang.startsWith('en'); });
    if (en) VS.voice = en;
}

function summonSpeak(text, onDone) {
    if (!VS.synth) { if (onDone) onDone(); return; }
    summonStopSpeaking();
    summonPickVoice();
    summonSetState('speaking');
    VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    if (VS.voice) u.voice = VS.voice;
    u.onend = u.onerror = function() { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

function summonStopSpeaking() {
    VS.speaking = false;
    if (VS.synth) { try { VS.synth.cancel(); } catch(e) {} }
}

function summonAddMsg(role, text) {
    var wrap = document.getElementById('std-summon-msgs');
    var interim = document.getElementById('std-summon-interim');
    if (!wrap) return;
    var div = document.createElement('div');
    div.className = 'summon-msg summon-msg-' + role;
    div.textContent = text;
    wrap.insertBefore(div, interim);
    wrap.scrollTop = wrap.scrollHeight;
}

})();
