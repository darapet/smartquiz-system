/* aqs-study.js — AI Study v3 | KaTeX · File Upload · Voice Orb · Streaming */
(function () {
'use strict';

/* ── CONSTANTS ─────────────────────────────────────────────── */
var POLL_URL     = 'https://text.pollinations.ai/openai';
var WIKI_API     = 'https://en.wikipedia.org/w/api.php';
var BOOKS_API    = 'https://www.googleapis.com/books/v1/volumes';
var HIST_KEY     = 'aqs_study_hist';
var ORB_HIST_KEY = 'aqs_orb_sessions';
var MAX_HIST     = 15;
var SILENCE_MS   = 1600;
var WAKE_WORDS   = ['ai assist','hey assistant','ai help','assistant activate','hey ai'];

/* ── STATE ──────────────────────────────────────────────────── */
var S = {
    query:'', title:'', source:'', description:'', wikiTitle:'',
    chapters:[], activeIdx:-1, cache:{},
    testQ:null, testAns:[], testIdx:0,
    uploadedContent:null, uploadedFileName:null,
    uploadedBase64:null, uploadedMime:null,
    orbState:'closed',
    isResponding:false,
    voiceHist:[],
    pendingText:'',
    silenceTimer:null,
    streamEl:null,
    recog:null,
    synth: window.speechSynthesis || null,
};

/* ── INIT ───────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function () {
    injectKaTeX();
    injectOrbHTML();
    setupSearch();
    setupFileUpload();
    setupVoiceOrb();
    setupEvents();
    renderHistory();
    checkAI();
});

/* ── KATEX ──────────────────────────────────────────────────── */
function injectKaTeX() {
    if (document.getElementById('katex-css')) return;
    var link = document.createElement('link');
    link.id  = 'katex-css';
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
    document.head.appendChild(link);

    var script = document.createElement('script');
    script.src  = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
    script.defer = true;
    document.head.appendChild(script);

    var auto = document.createElement('script');
    auto.src  = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js';
    auto.defer = true;
    auto.onload = function () {
        /* Auto-render any existing math on the page */
        renderPageMath();
    };
    document.head.appendChild(auto);
}

function renderPageMath() {
    if (typeof renderMathInElement === 'undefined') return;
    var targets = document.querySelectorAll('.std-content-body, .std-ai-panel-body, .std-orb-msg-text');
    targets.forEach(function (el) {
        try {
            renderMathInElement(el, {
                delimiters:[
                    {left:'$$',right:'$$',display:true},
                    {left:'$',right:'$',display:false},
                    {left:'\\(',right:'\\)',display:false},
                    {left:'\\[',right:'\\]',display:true}
                ],
                throwOnError:false
            });
        } catch(e){}
    });
}

function renderMath(el) {
    if (typeof renderMathInElement === 'undefined') return;
    try {
        renderMathInElement(el, {
            delimiters:[
                {left:'$$',right:'$$',display:true},
                {left:'$',right:'$',display:false}
            ],
            throwOnError:false
        });
    } catch(e){}
}

/* ── FILE UPLOAD ────────────────────────────────────────────── */
function setupFileUpload() {
    /* Inject upload button after search form */
    var searchSection = document.querySelector('.std-search-section');
    if (!searchSection || document.getElementById('std-upload-wrap')) return;

    var wrap = document.createElement('div');
    wrap.id = 'std-upload-wrap';
    wrap.className = 'std-upload-wrap';
    wrap.innerHTML =
        '<label class="std-upload-btn" for="std-file-input" title="Upload a textbook, document or image">' +
        '<span>📎</span><span>Upload Textbook / Image</span>' +
        '<input type="file" id="std-file-input" accept=".txt,.md,.csv,.pdf,image/*" style="display:none">' +
        '</label>' +
        '<div id="std-upload-info" class="std-upload-info" style="display:none"></div>';
    searchSection.appendChild(wrap);

    var input = document.getElementById('std-file-input');
    if (input) input.addEventListener('change', function () {
        var file = input.files[0];
        if (!file) return;
        handleFileUpload(file);
        input.value = '';
    });
}

function handleFileUpload(file) {
    var info = document.getElementById('std-upload-info');
    if (info) { info.style.display = 'flex'; info.textContent = '⏳ Reading ' + file.name + '…'; }

    var mime = file.type;
    S.uploadedFileName = file.name;
    S.uploadedBase64   = null;
    S.uploadedContent  = null;
    S.uploadedMime     = mime;

    if (mime.startsWith('image/')) {
        /* Read image as base64 for vision */
        var reader = new FileReader();
        reader.onload = function (e) {
            S.uploadedBase64 = e.target.result; /* data:image/...;base64,... */
            S.uploadedContent = '[Image uploaded: ' + file.name + ']';
            if (info) { info.style.display = 'flex'; info.textContent = '🖼 ' + file.name + ' — AI can now see this image'; }
            showUploadStudy(file.name, 'image');
        };
        reader.readAsDataURL(file);
    } else if (mime === 'application/pdf') {
        /* Use pdf.js if available, else prompt to copy text */
        if (window.pdfjsLib) {
            var reader2 = new FileReader();
            reader2.onload = function (e) { extractPDFText(e.target.result, file.name); };
            reader2.readAsArrayBuffer(file);
        } else {
            /* Fallback: ask user to paste content */
            S.uploadedContent = '';
            if (info) { info.style.display = 'flex'; info.textContent = '📄 ' + file.name + ' — PDF detected. Tip: copy-paste text into the search box for best results.'; }
        }
    } else {
        /* Text, markdown, CSV */
        var reader3 = new FileReader();
        reader3.onload = function (e) {
            var text = e.target.result || '';
            S.uploadedContent = text.slice(0, 80000); /* cap at 80k chars */
            if (info) { info.style.display = 'flex'; info.textContent = '📄 ' + file.name + ' loaded (' + Math.round(text.length/1000) + 'k chars)'; }
            showUploadStudy(file.name, 'text');
        };
        reader3.onerror = function () {
            if (info) { info.textContent = '❌ Could not read file.'; }
        };
        reader3.readAsText(file);
    }
}

function extractPDFText(arrayBuffer, filename) {
    var info = document.getElementById('std-upload-info');
    window.pdfjsLib.getDocument({data: arrayBuffer}).promise.then(function (pdf) {
        var textPromises = [];
        for (var i = 1; i <= pdf.numPages; i++) {
            textPromises.push(pdf.getPage(i).then(function (page) {
                return page.getTextContent().then(function (tc) {
                    return tc.items.map(function (item) { return item.str; }).join(' ');
                });
            }));
        }
        return Promise.all(textPromises);
    }).then(function (pages) {
        var text = pages.join('\n');
        S.uploadedContent = text.slice(0, 80000);
        if (info) { info.textContent = '📄 ' + filename + ' (' + pdf.numPages + ' pages loaded)'; }
        showUploadStudy(filename, 'text');
    }).catch(function () {
        if (info) { info.textContent = '❌ Could not parse PDF.'; }
    });
}

function showUploadStudy(filename, type) {
    /* Treat uploaded file as a study topic */
    S.query = filename;
    S.title = filename.replace(/\.[^.]+$/, '');
    setView('loading');
    setLoadMsg('🤖 Analysing "' + esc(S.title) + '"…');
    loadUploadedDoc(S.title, type);
}

async function loadUploadedDoc(name, type) {
    try {
        var contextSnippet = S.uploadedContent ? S.uploadedContent.slice(0, 6000) : '';
        var imageMsg = null;
        if (S.uploadedBase64) {
            imageMsg = {
                role: 'user',
                content: [
                    { type: 'text', text: 'Analyse this document/image and create a comprehensive study guide with 8-12 chapters. The title is "' + name + '".\n\nReturn ONLY valid JSON:\n{"chapters":[{"title":"Chapter Title","summary":"2-3 sentence overview"}],"description":"Overall topic description 2-3 sentences"}' },
                    { type: 'image_url', image_url: { url: S.uploadedBase64 } }
                ]
            };
        }

        var prompt = imageMsg ? [
            { role: 'system', content: 'You are an expert academic tutor. Return ONLY valid JSON.' },
            imageMsg
        ] : [
            { role: 'system', content: 'You are an expert academic tutor. Return ONLY valid JSON.' },
            { role: 'user', content: 'Based on this content, create a comprehensive study guide with 8-12 chapters.\n\nContent:\n' + contextSnippet + '\n\nTitle: "' + name + '"\n\nReturn ONLY valid JSON:\n{"chapters":[{"title":"Chapter Title","summary":"2-3 sentence overview"}],"description":"Overall description 2-3 sentences"}' }
        ];

        var raw = await aiChat(prompt, 0.5);
        var m = raw.match(/\{[\s\S]*\}/);
        var data = m ? JSON.parse(m[0]) : null;

        if (data && data.chapters && data.chapters.length) {
            S.source      = type === 'image' ? 'img' : 'upload';
            S.description = data.description || '';
            S.chapters    = data.chapters.map(function (c, i) { return { title: c.title, index: i, summary: c.summary }; });
            S.cache       = {};
            saveHist({ query: name, title: S.title, type: type === 'image' ? 'img' : 'upload', chapters: S.chapters.map(function(c){ return c.title; }) });
            renderStudy();
            selectChapter(0);
        } else {
            /* Fallback: single chapter */
            S.source      = 'upload';
            S.description = 'Uploaded document: ' + name;
            S.chapters    = [{ title: 'Full Document', index: 0 }];
            S.cache       = { 0: S.uploadedContent || '' };
            renderStudy();
            selectChapter(0);
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
    var wiki  = results[0].status === 'fulfilled' ? results[0].value : [];
    var books = results[1].status === 'fulfilled' ? results[1].value : [];
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
        return {
            id: b.id, title: v.title || 'Unknown Title',
            authors: (v.authors || []).join(', '),
            desc: (v.description || '').slice(0, 300),
            thumb: v.imageLinks ? v.imageLinks.thumbnail : null,
            year: (v.publishedDate || '').slice(0, 4),
            type: 'book'
        };
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
        html += '<div class="std-res-sec"><div class="std-res-sec-lbl">📚 Textbooks &amp; Books</div><div class="std-res-grid">';
        books.forEach(function (b) {
            var img = b.thumb ? '<img src="' + b.thumb + '" class="std-res-thumb" alt="" loading="lazy">' : '<div class="std-res-thumb-ph">📚</div>';
            html += '<div class="std-res-card" data-type="book" data-bookid="' + esc(b.id) + '" data-title="' + esc(b.title) + '" data-desc="' + esc(b.desc) + '">' + img + '<div class="std-res-info"><div class="std-res-title">' + esc(b.title) + '</div><div class="std-res-meta">' + (b.authors ? 'by ' + esc(b.authors) : '') + (b.year ? ' · ' + b.year : '') + '</div><div class="std-res-desc">' + esc(b.desc) + '</div></div></div>';
        });
        html += '</div></div>';
    }
    html += '<div class="std-res-sec"><div class="std-res-sec-lbl">🤖 AI-Generated Study Guide</div><div class="std-res-grid"><div class="std-res-card std-res-ai" data-type="ai" data-title="' + esc(q) + '"><div class="std-res-icon">🤖</div><div class="std-res-info"><div class="std-res-title">AI Study Guide: ' + esc(q) + '</div><div class="std-res-desc">Full study guide with chapters, KaTeX math rendering, summaries, practice tests, and voice AI.</div></div></div></div></div>';

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
        var rawSecs = (sec.parse && sec.parse.sections) ? sec.parse.sections : [];
        var chapters = [{ title: 'Introduction', index: 0, level: 1 }];
        rawSecs.filter(function (s) { return parseInt(s.toclevel) <= 2 && s.line; }).slice(0, 20)
            .forEach(function (s) { chapters.push({ title: s.line.replace(/<[^>]*>/g, ''), index: parseInt(s.index), level: parseInt(s.toclevel) }); });
        S.source = 'wiki'; S.title = title; S.wikiTitle = title;
        S.description = sum.extract || sum.description || '';
        S.chapters = chapters; S.cache = {}; S.cache[0] = S.description;
        saveHist({ query: S.query, title: title, type: 'wiki', chapters: chapters.map(function(c){return c.title;}) });
        renderStudy(); selectChapter(0);
    } catch (e) { await loadAI(title); }
}

/* ── LOAD BOOK ──────────────────────────────────────────────── */
async function loadBook(bookId, title, desc) {
    setView('loading');
    setLoadMsg('🤖 Generating chapters for "' + esc(title) + '"…');
    try {
        var chapters = await genBookChapters(title, desc);
        S.source = 'book'; S.title = title; S.description = desc;
        S.chapters = chapters; S.cache = {};
        saveHist({ query: S.query, title: title, type: 'book', chapters: chapters.map(function(c){return c.title;}) });
        renderStudy(); selectChapter(0);
    } catch (e) { await loadAI(title); }
}

async function genBookChapters(title, desc) {
    var raw = await aiChat([
        { role: 'system', content: 'You are an expert academic curriculum designer. Return ONLY valid JSON, no markdown.' },
        { role: 'user', content: 'Create a comprehensive chapter structure for the textbook "' + title + '".\n' + (desc ? 'Description: ' + desc + '\n' : '') + 'Return ONLY JSON:\n[{"title":"Chapter Name","level":1},...]  — 10-14 chapters, mix of main and sub-chapters (level 1 or 2).' }
    ], 0.4);
    var m = raw.match(/\[[\s\S]*\]/);
    if (!m) throw new Error('No chapters');
    var parsed = JSON.parse(m[0]);
    return parsed.map(function (c, i) { return { title: c.title, index: i, level: c.level || 1 }; });
}

/* ── LOAD AI ────────────────────────────────────────────────── */
async function loadAI(q) {
    setView('loading');
    setLoadMsg('🤖 Generating AI study guide for "' + esc(q) + '"…');
    try {
        var raw = await aiChat([
            { role: 'system', content: 'You are an expert academic content creator. Return ONLY valid JSON, no markdown, no extra text.' },
            { role: 'user', content: 'Create a comprehensive study guide for: "' + q + '"\n\nReturn ONLY this JSON:\n{"description":"2-3 sentence overview","chapters":[{"title":"Chapter Name","summary":"2-3 sentence chapter preview"}]}\n\nRules:\n- 10-14 chapters\n- Chapters should progress logically (introduction → core concepts → advanced topics → applications)\n- Include a Glossary chapter at the end\n- If the topic involves math, science, or engineering, note that in the description' }
        ], 0.5);
        var m = raw.match(/\{[\s\S]*\}/);
        var data = m ? JSON.parse(m[0]) : null;
        if (!data || !data.chapters) throw new Error('Parse failed');
        S.source = 'ai'; S.title = q; S.description = data.description || '';
        S.chapters = data.chapters.map(function (c, i) { return { title: c.title, index: i, summary: c.summary }; });
        S.cache = {};
        saveHist({ query: q, title: q, type: 'ai', chapters: S.chapters.map(function(c){return c.title;}) });
        renderStudy(); selectChapter(0);
    } catch (e) {
        showErr('AI study guide generation failed: ' + e.message);
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
            var indent = (c.level === 2) ? ' std-ch-sub' : '';
            return '<div class="std-ch-item' + indent + '" data-idx="' + i + '">' +
                   '<span class="std-ch-num">' + (i + 1) + '</span>' +
                   '<span class="std-ch-label">' + esc(c.title) + '</span></div>';
        }).join('');
        chList.querySelectorAll('.std-ch-item').forEach(function (el) {
            el.addEventListener('click', function () { selectChapter(parseInt(el.dataset.idx)); });
        });
    }
    setView('study');
}

function selectChapter(idx) {
    S.activeIdx = idx;
    var items = document.querySelectorAll('.std-ch-item');
    items.forEach(function (el, i) { el.classList.toggle('active', i === idx); });
    hideAIPanel();
    loadChapterContent(idx);
    var panel = document.querySelector('.std-chapters-panel');
    if (panel) panel.classList.remove('open');
}

async function loadChapterContent(idx) {
    var ch = S.chapters[idx];
    if (!ch) return;
    var contentArea = document.getElementById('std-chapter-content');
    var titleEl     = document.getElementById('std-content-title');
    if (titleEl) titleEl.textContent = ch.title;
    if (contentArea) contentArea.innerHTML = '<div class="std-content-loading"><div class="std-spinner"></div><p>Loading…</p></div>';

    if (S.cache[idx]) {
        showContent(idx, S.cache[idx]);
        return;
    }

    try {
        var text = '';
        if (S.source === 'wiki') {
            text = await fetchWikiSection(S.wikiTitle, ch.index);
        } else if (S.source === 'upload' && S.uploadedContent) {
            /* For uploaded text: ask AI to explain the relevant portion */
            var portion = S.uploadedContent.slice(0, 12000);
            text = await aiChat([
                { role: 'system', content: 'You are an expert tutor. Generate clear educational content. If relevant, use $...$ for inline math and $$...$$ for display math.' },
                { role: 'user', content: 'Based on this document content, write a detailed educational explanation of the section "' + ch.title + '" from "' + S.title + '".\n\nDocument:\n' + portion + '\n\nWrite 400-700 words with clear explanations, examples, and key points. Use LaTeX math notation where relevant ($...$ inline, $$...$$ display).' }
            ], 0.6);
        } else if (S.source === 'img' && S.uploadedBase64) {
            text = await aiChatVision([
                { role: 'system', content: 'You are an expert tutor. Write clear educational content with LaTeX math where relevant.' },
                { role: 'user', content: [
                    { type: 'text', text: 'Write a detailed educational explanation of "' + ch.title + '" based on this image/document. 400-700 words. Use $...$ for inline math and $$...$$ for display math.' },
                    { type: 'image_url', image_url: { url: S.uploadedBase64 } }
                ]}
            ], 0.6);
        } else {
            text = await aiChat([
                { role: 'system', content: 'You are an expert academic author. Write detailed, engaging educational content. Use $...$ for inline math and $$...$$ for block/display math when relevant. Use clear headings and structured paragraphs.' },
                { role: 'user', content: 'Write a comprehensive educational chapter on "' + ch.title + '" from the textbook/study guide "' + S.title + '".' + (ch.summary ? '\nChapter overview: ' + ch.summary : '') + '\n\nRequirements:\n- 500-800 words\n- Start with a clear introduction\n- Cover key concepts, definitions, examples\n- Use LaTeX math notation where applicable ($...$ inline, $$...$$ display)\n- End with key takeaways\n- Write as a high-quality textbook chapter' }
            ], 0.65);
        }
        S.cache[idx] = text;
        showContent(idx, text);
    } catch (e) {
        if (contentArea) contentArea.innerHTML = '<div class="std-content-empty"><p>⚠️ Could not load content: ' + esc(e.message) + '</p></div>';
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
    var wikitext = (d2.parse && d2.parse.wikitext && d2.parse.wikitext['*']) || '';
    /* Strip wiki markup for clean text */
    return wikitext.replace(/\{\{[^}]*\}\}/g, '').replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g, '$2').replace(/'{2,3}/g, '').replace(/==+[^=]+=+/g, '').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3500);
}

function showContent(idx, text) {
    var contentArea = document.getElementById('std-chapter-content');
    if (!contentArea) return;
    contentArea.innerHTML = '<div class="std-content-body">' + renderParagraphs(text) + '</div>';
    /* Render math after inserting HTML */
    var body = contentArea.querySelector('.std-content-body');
    if (body) renderMath(body);
}

/* ── AI PANEL (Explain / Summarise) ────────────────────────── */
async function doSummarise() {
    if (S.activeIdx < 0) { showErr('Please select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx];
    var content = S.cache[S.activeIdx] || '';
    showAIPanel('📝 Summary', 'Generating summary…', null);
    try {
        var res = await aiChat([
            { role: 'system', content: 'You are an expert tutor. Create clear, concise summaries. Use $...$ for inline math and $$...$$ for block math.' },
            { role: 'user', content: 'Summarise "' + ch.title + '" from "' + S.title + '"' + (content ? ' using this content:\n' + content.slice(0, 3000) : '') + '\n\nProvide:\n1. Key concepts (3-5 bullet points)\n2. Main takeaways (2-3 sentences)\n3. Important formulas or definitions if applicable\n\nUse LaTeX math where relevant.' }
        ], 0.6);
        showAIPanel('📝 Summary — ' + ch.title, null, res);
    } catch (e) { showAIPanel('📝 Summary', null, '⚠️ Error: ' + e.message); }
}

async function doExplain() {
    if (S.activeIdx < 0) { showErr('Please select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx];
    var content = S.cache[S.activeIdx] || '';
    showAIPanel('💡 Deep Explanation', 'Generating explanation…', null);
    try {
        var res = await aiChat([
            { role: 'system', content: 'You are an expert tutor. Write detailed, clear explanations. Use $...$ for inline math and $$...$$ for block/display math.' },
            { role: 'user', content: 'Write a comprehensive explanation of "' + ch.title + '" from "' + S.title + '".\n' + (content ? 'Reference content:\n' + content.slice(0, 2500) + '\n\n' : '') + 'Include:\n1. Clear breakdown of complex ideas\n2. Real-world analogies and examples\n3. Why and how, not just what\n4. Common misconceptions addressed\n5. All relevant math with LaTeX notation\n\nWrite 400-600 words. Be thorough and educational.' }
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
            renderMath(bE);
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
    if (S.activeIdx < 0) { showErr('Please select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx];
    var content = S.cache[S.activeIdx] || '';
    var modal = document.getElementById('std-test-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-loading"><div class="std-spinner lg"></div><h3>🤖 Generating 20 Practice Questions</h3><p>Creating questions for:<br><strong>' + esc(ch.title) + '</strong></p><div class="std-test-load-sub" id="std-test-status-msg">This may take about 20 seconds…</div></div></div>';

    var PROMPT = [
        { role: 'system', content: 'You are an expert educator. Create comprehensive practice questions. Return ONLY valid JSON.' },
        { role: 'user', content: 'Generate exactly 20 multiple-choice questions for:\nTopic: "' + S.title + '"\nSection: "' + ch.title + '"\n' + (content ? 'Material:\n' + content.slice(0, 3500) + '\n\n' : '') + 'Return ONLY this JSON array:\n[{"q":"question","opts":["A","B","C","D"],"ans":0,"exp":"Thorough explanation, minimum 10 lines. Explain why correct answer is right and wrong answers are wrong."}]\n\nRules: Exactly 20 questions. Mix difficulty. Include math where relevant (use LaTeX in questions/explanations).' }
    ];

    var qStr;
    try { qStr = await aiChat(PROMPT, 0.35); } catch (e) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Failed to Generate Questions</h3><p>' + esc(e.message) + '</p><button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button></div></div>';
        return;
    }

    var qs = [];
    try {
        var jsonMatch = qStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) qs = JSON.parse(jsonMatch[0]);
    } catch (e) {
        try { var c2 = qStr.replace(/```json\n?/g,'').replace(/```\n?/g,''); var m2 = c2.match(/\[[\s\S]*\]/); if (m2) qs = JSON.parse(m2[0]); } catch(e2){}
    }

    if (!qs || qs.length < 4) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Could Not Parse Questions</h3><p>Please try again.</p><button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button></div></div>';
        return;
    }

    qs = qs.slice(0, 20);
    S.testQ = qs; S.testAns = new Array(qs.length).fill(-1); S.testIdx = 0;
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
    /* Render math in question */
    var q_el = modal.querySelector('.std-test-q');
    if (q_el) renderMath(q_el);
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
            '<div class="std-test-exp-prev">' + esc((q.exp||'').slice(0,300)) + ((q.exp||'').length>300?'…':'') + '</div>';
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
    var pct = Math.round(correct / qs.length * 100);
    var emoji, msg, col;
    if (pct >= 90)      { emoji='🏆'; msg='Outstanding! Mastered!';         col='#10b981'; }
    else if (pct >= 70) { emoji='🌟'; msg='Great job! Solid understanding!'; col='#7c3aed'; }
    else if (pct >= 50) { emoji='👍'; msg='Good effort! Keep reviewing!';    col='#f59e0b'; }
    else if (pct >= 30) { emoji='💪'; msg='Keep going! Practice makes perfect!'; col='#f59e0b'; }
    else                { emoji='📚'; msg='Review the chapters carefully.';  col='#ef4444'; }

    var modal = document.getElementById('std-test-modal'); if (!modal) return;
    var html = '<div class="std-test-inner" style="overflow-y:auto;max-height:90vh"><div class="std-test-res-head"><div class="std-test-score-circle" style="border-color:' + col + '"><div class="std-test-score-pct">' + pct + '%</div><div class="std-test-score-sub">' + correct + '/' + qs.length + '</div></div><div style="font-size:2.6rem">' + emoji + '</div><p style="color:' + col + ';font-weight:700;font-size:1rem;margin:0;max-width:320px;text-align:center">' + esc(msg) + '</p></div><div class="std-test-res-actions"><button class="std-btn std-btn-primary" id="std-retry-btn">🔄 Retry</button><button class="std-btn std-btn-ghost" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">✕ Close</button></div><div class="std-test-res-list"><h3>Full Results &amp; Explanations</h3>';
    qs.forEach(function (q, i) {
        var ua = ans[i], ok = ua === q.ans;
        html += '<div class="std-res-item ' + (ok?'correct':'wrong') + '"><div class="std-res-item-head"><span class="std-res-num">' + (i+1) + '</span><span>' + (ok?'✅':'❌') + '</span><div class="std-res-q">' + esc(q.q) + '</div></div><div class="std-res-ans"><span style="color:#10b981">Correct: </span><strong>' + ['A','B','C','D'][q.ans] + '. ' + esc(((q.opts||[])[q.ans])||'') + '</strong>' + (ua>=0&&!ok?'<br><span style="color:#ef4444">Your answer: </span>' + ['A','B','C','D'][ua] + '. ' + esc(((q.opts||[])[ua])||''):'') + '</div><div class="std-res-exp"><strong>Explanation:</strong>' + renderParagraphs(q.exp||'No explanation.') + '</div></div>';
    });
    html += '</div></div>';
    modal.innerHTML = html;
    var rb = document.getElementById('std-retry-btn');
    if (rb) rb.addEventListener('click', function () { S.testQ = null; openTest(); });
    /* Render math in results */
    setTimeout(function () { if (modal.querySelector) renderMath(modal); }, 100);
}

/* ── AI HELPERS ─────────────────────────────────────────────── */
async function aiChat(messages, temp) {
    var r = await fetch(POLL_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:'openai', messages: messages, temperature: temp || 0.7, max_tokens: 2000 })
    });
    if (!r.ok) throw new Error('AI error ' + r.status);
    var d = await r.json();
    if (!d.choices || !d.choices[0]) throw new Error('No AI response');
    return d.choices[0].message.content || '';
}

async function aiChatVision(messages, temp) {
    /* Same endpoint, vision supported via image_url content type */
    var r = await fetch(POLL_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:'openai', messages: messages, temperature: temp || 0.7, max_tokens: 2000 })
    });
    if (!r.ok) throw new Error('Vision AI error ' + r.status);
    var d = await r.json();
    if (!d.choices || !d.choices[0]) throw new Error('No response');
    return d.choices[0].message.content || '';
}

/* Stream AI response — calls onChunk with each text delta, returns full text */
async function streamChat(messages, temp, onChunk) {
    var r = await fetch(POLL_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ model:'openai', messages: messages, stream: true, temperature: temp || 0.8 })
    });
    if (!r.ok) throw new Error('Stream error ' + r.status);

    var reader  = r.body.getReader();
    var decoder = new TextDecoder();
    var full    = '';

    while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        var text  = decoder.decode(chunk.value, { stream: true });
        var lines = text.split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
                try {
                    var json  = JSON.parse(line.slice(6));
                    var delta = json.choices && json.choices[0] && json.choices[0].delta;
                    if (delta && delta.content) { full += delta.content; onChunk(delta.content); }
                } catch (e) {}
            }
        }
    }
    /* If streaming didn't deliver content, fall back */
    if (!full) { full = await aiChat(messages, temp); onChunk(full); }
    return full;
}

function checkAI() {
    fetch(POLL_URL, {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ model:'openai', messages:[{role:'user',content:'hi'}], max_tokens:5 })
    }).then(function (r) {
        var ok = r.ok;
        var badge = document.querySelector('.std-groq-badge');
        if (badge) { badge.className = 'std-groq-badge ' + (ok?'ok':'warn'); badge.textContent = ok ? '✓ AI Ready' : '⚠ AI Unavailable'; }
    }).catch(function () {
        var badge = document.querySelector('.std-groq-badge');
        if (badge) { badge.className = 'std-groq-badge warn'; badge.textContent = '⚠ Offline'; }
    });
}

/* ── VOICE ORB ──────────────────────────────────────────────── */
var ORB_HTML =
'<div id="std-orb-overlay" aria-label="AI Voice Assistant" role="dialog">' +
  '<div class="std-orb-inner">' +
    '<div class="std-orb-sphere-wrap">' +
      '<div class="std-orb-core"></div>' +
      '<div class="std-orb-ring r1"></div>' +
      '<div class="std-orb-ring r2"></div>' +
      '<div class="std-orb-ring r3"></div>' +
    '</div>' +
    '<div class="std-orb-status-lbl" id="std-orb-status">Initialising…</div>' +
    '<div class="std-orb-transcript-wrap">' +
      '<div class="std-orb-transcript" id="std-orb-transcript"></div>' +
    '</div>' +
    '<div class="std-orb-footer">' +
      '<button class="std-orb-pill danger" id="std-orb-end-btn">✕ End</button>' +
      '<button class="std-orb-pill" id="std-orb-mute-btn">🔇 Pause</button>' +
      '<button class="std-orb-pill" id="std-orb-hist-btn">📜 History</button>' +
    '</div>' +
  '</div>' +
'</div>';

function injectOrbHTML() {
    if (document.getElementById('std-orb-overlay')) return;
    var div = document.createElement('div');
    div.innerHTML = ORB_HTML;
    document.body.appendChild(div.firstElementChild);

    /* Floating trigger button — always visible on study pages */
    if (!document.getElementById('std-orb-float')) {
        var fb = document.createElement('button');
        fb.id        = 'std-orb-float';
        fb.className = 'std-orb-float-btn';
        fb.title     = 'Open AI Voice Tutor';
        fb.innerHTML = '🤖';
        fb.addEventListener('click', function () { openOrb(true); });
        document.body.appendChild(fb);
    }
}

function setupVoiceOrb() {
    var endBtn  = document.getElementById('std-orb-end-btn');
    var muteBtn = document.getElementById('std-orb-mute-btn');
    var histBtn = document.getElementById('std-orb-hist-btn');
    if (endBtn)  endBtn.addEventListener('click', closeOrb);
    if (muteBtn) muteBtn.addEventListener('click', toggleMute);
    if (histBtn) histBtn.addEventListener('click', showOrbHistory);

    /* Wire any [data-std-voice] triggers and the study view voice button */
    document.querySelectorAll('[data-std-voice], #std-voice-btn').forEach(function (el) {
        el.addEventListener('click', function () { openOrb(true); });
    });

    /* Hide old panel — orb replaces it */
    var old = document.getElementById('std-voice-panel');
    if (old) old.style.display = 'none';

    initRecog();
}

function initRecog() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    S.recog = new SR();
    S.recog.continuous     = true;
    S.recog.interimResults = true;
    S.recog.lang           = 'en-US';
    S.recog.maxAlternatives = 1;

    S.recog.onresult = onSpeechResult;

    S.recog.onerror = function (e) {
        if (e.error === 'not-allowed') {
            setOrbStatus('⚠ Microphone access denied');
            closeOrb();
        } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
            setOrbStatus('⚠ Mic error: ' + e.error);
        }
    };

    S.recog.onend = function () {
        /* Auto-restart unless closed or responding/speaking */
        if (S.orbState !== 'closed' && S.orbState !== 'thinking' && S.orbState !== 'speaking') {
            restartRecog();
        }
    };
}

function onSpeechResult(e) {
    if (S.orbState === 'closed') return;

    var interim = '', finalText = '';
    for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else                      interim   += e.results[i][0].transcript;
    }

    /* STANDBY — only check for wake word */
    if (S.orbState === 'standby') {
        var combined = (finalText || interim).toLowerCase();
        if (checkWakeWord(combined)) {
            setOrbState('listening');
            setOrbStatus('Listening — speak now');
        }
        return;
    }

    /* SPEAKING — user started talking, interrupt AI */
    if (S.orbState === 'speaking') {
        var words = (finalText || interim).trim();
        if (words.length > 2) {
            stopSpeak();
            setOrbState('listening');
            setOrbStatus('Listening — speak now');
        }
        return;
    }

    if (S.orbState !== 'listening') return;

    /* Show interim text in transcript */
    if (interim) updateInterim(interim);

    if (finalText) {
        var t = finalText.trim();
        removeInterim();
        addOrbMsg('user', t);
        S.pendingText = (S.pendingText + ' ' + t).trim();
        resetSilenceTimer();
    }
}

function resetSilenceTimer() {
    if (S.silenceTimer) clearTimeout(S.silenceTimer);
    S.silenceTimer = setTimeout(onSilenceDetected, SILENCE_MS);
}

function onSilenceDetected() {
    var text = S.pendingText.trim();
    S.pendingText  = '';
    S.silenceTimer = null;
    if (!text || S.isResponding) return;
    stopRecog();
    askOrb(text);
}

async function askOrb(text) {
    if (S.isResponding) return;
    S.isResponding = true;
    setOrbState('thinking');
    setOrbStatus('AI is thinking…');

    /* Build conversation history */
    S.voiceHist.push({ role:'user', content:text });
    var msgs = [{ role:'system', content: buildOrbSystem() }].concat(S.voiceHist.slice(-24));

    /* Create streaming transcript element */
    var streamNode = createStreamNode();

    try {
        var full = await streamChat(msgs, 0.82, function (chunk) {
            if (streamNode) {
                streamNode.textContent += chunk;
                scrollOrbTranscript();
            }
        });
        if (streamNode) streamNode.classList.remove('std-orb-cursor');
        S.voiceHist.push({ role:'assistant', content:full });
        saveOrbSession();
        setOrbState('speaking');
        speakOrb(full);
    } catch (e) {
        if (streamNode) { streamNode.textContent = 'Sorry, I had trouble connecting. Please try again.'; streamNode.classList.remove('std-orb-cursor'); }
        S.isResponding = false;
        setOrbState('listening');
        setOrbStatus('Listening — speak now');
        restartRecog();
    }
}

function buildOrbSystem() {
    var ctx = 'You are a brilliant, warm AI study tutor. Respond conversationally — clear, friendly, and concise (2-4 sentences unless more detail is needed). You speak in a natural flowing way.';
    if (S.title) ctx += ' The student is studying: "' + S.title + '".';
    if (S.uploadedFileName) ctx += ' They uploaded: "' + S.uploadedFileName + '".';
    if (S.uploadedContent)  ctx += ' Document excerpt: ' + S.uploadedContent.slice(0, 2000);
    return ctx;
}

function speakOrb(text) {
    if (!S.synth) {
        afterSpeak();
        return;
    }
    S.synth.cancel();

    /* Split into sentences for faster start */
    var parts = text.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g) || [text];
    var idx   = 0;

    setOrbStatus('Speaking…  say something to interrupt');

    function next() {
        if (idx >= parts.length || S.orbState !== 'speaking') { afterSpeak(); return; }
        var u = new SpeechSynthesisUtterance(parts[idx++].trim());
        u.rate = 1.0; u.pitch = 1; u.volume = 1;
        var voices = S.synth.getVoices();
        var voice  = voices.find(function(v){ return v.lang==='en-US' && v.localService; }) ||
                     voices.find(function(v){ return /^en/i.test(v.lang); });
        if (voice) u.voice = voice;
        u.onend   = next;
        u.onerror = afterSpeak;
        S.synth.speak(u);
    }

    function afterSpeak() {
        S.isResponding = false;
        if (S.orbState !== 'closed') {
            setOrbState('listening');
            setOrbStatus('Listening — speak now');
            S.pendingText = '';
            setTimeout(restartRecog, 350);
        }
    }

    if (S.synth.getVoices().length > 0) { next(); }
    else { S.synth.onvoiceschanged = function() { S.synth.onvoiceschanged = null; next(); }; }
}

function stopSpeak() {
    if (S.synth) S.synth.cancel();
}

function openOrb(autoListen) {
    if (!isLoggedIn()) { showLoginPrompt(); return; }
    if (S.silenceTimer) clearTimeout(S.silenceTimer);
    S.voiceHist   = [];
    S.pendingText = '';
    S.isResponding = false;

    var transcript = document.getElementById('std-orb-transcript');
    if (transcript) transcript.innerHTML = '';

    var overlay = document.getElementById('std-orb-overlay');
    if (overlay) overlay.classList.add('active');

    if (autoListen) {
        setOrbState('listening');
        setOrbStatus('Listening — speak now');
        /* Welcome spoken first */
        var welcome = S.title ?
            'Hello! I\'m ready to help you study ' + S.title + '. What would you like to know?' :
            'Hello! I\'m your AI study tutor. What would you like to discuss?';
        S.voiceHist.push({ role:'assistant', content: welcome });
        addOrbMsg('ai', welcome);
        S.isResponding = true;
        setOrbState('speaking');
        speakOrb(welcome);
    } else {
        setOrbState('standby');
        setOrbStatus('Say "AI assist" to start');
        setTimeout(restartRecog, 200);
    }
}

function closeOrb() {
    if (S.silenceTimer) clearTimeout(S.silenceTimer);
    S.silenceTimer  = null;
    S.isResponding  = false;
    S.pendingText   = '';
    stopSpeak();
    stopRecog();
    S.orbState = 'closed';
    var overlay = document.getElementById('std-orb-overlay');
    if (overlay) { overlay.classList.remove('active','standby','listening','thinking','speaking'); }
}

function setOrbState(state) {
    S.orbState = state;
    var overlay = document.getElementById('std-orb-overlay');
    if (!overlay) return;
    overlay.className = 'active ' + state;
}

function setOrbStatus(text) {
    var el = document.getElementById('std-orb-status');
    if (el) el.textContent = text;
}

function startListening() {
    if (!S.recog) { setOrbStatus('⚠ Voice recognition not supported in this browser'); return; }
    setOrbState('listening');
    setOrbStatus('Listening — speak now');
    restartRecog();
}

function stopRecog() {
    try { if (S.recog) S.recog.stop(); } catch(e) {}
}

function restartRecog() {
    if (!S.recog || S.orbState === 'closed') return;
    try { S.recog.start(); } catch(e) { /* already running */ }
}

var S_muted = false;
function toggleMute() {
    S_muted = !S_muted;
    var btn = document.getElementById('std-orb-mute-btn');
    if (btn) btn.textContent = S_muted ? '🎤 Resume' : '🔇 Pause';
    if (S_muted) {
        stopRecog();
        setOrbStatus('Paused — tap Resume to continue');
    } else {
        restartRecog();
        setOrbStatus('Listening — speak now');
    }
}

/* Transcript helpers */
function addOrbMsg(role, text) {
    var transcript = document.getElementById('std-orb-transcript');
    if (!transcript) return;
    var isAI = (role === 'ai' || role === 'assistant');
    var d = document.createElement('div');
    d.className = 'std-orb-msg ' + (isAI ? 'ai' : 'user');
    d.innerHTML = '<span class="std-orb-msg-who">' + (isAI ? 'AI' : 'You') + '</span>' +
                  '<span class="std-orb-msg-text">' + esc(text) + '</span>';
    transcript.appendChild(d);
    scrollOrbTranscript();
}

function createStreamNode() {
    var transcript = document.getElementById('std-orb-transcript');
    if (!transcript) return null;
    var d = document.createElement('div');
    d.className = 'std-orb-msg ai';
    var who  = document.createElement('span'); who.className = 'std-orb-msg-who'; who.textContent = 'AI';
    var text = document.createElement('span'); text.className = 'std-orb-msg-text std-orb-cursor';
    d.appendChild(who);
    d.appendChild(text);
    transcript.appendChild(d);
    scrollOrbTranscript();
    return text;
}

function updateInterim(text) {
    var el = document.getElementById('std-orb-interim');
    if (!el) {
        var t = document.getElementById('std-orb-transcript');
        if (!t) return;
        el = document.createElement('div');
        el.id = 'std-orb-interim';
        el.className = 'std-orb-interim';
        t.appendChild(el);
    }
    el.textContent = text;
    scrollOrbTranscript();
}

function removeInterim() {
    var el = document.getElementById('std-orb-interim');
    if (el) el.remove();
}

function scrollOrbTranscript() {
    var t = document.getElementById('std-orb-transcript');
    if (t) t.scrollTop = t.scrollHeight;
}

function checkWakeWord(text) {
    for (var i = 0; i < WAKE_WORDS.length; i++) {
        if (text.indexOf(WAKE_WORDS[i]) !== -1) return true;
    }
    return false;
}

function isLoggedIn() {
    /* Check common auth signals — adapt to your auth system */
    return !!localStorage.getItem('aqs_user') ||
           !!sessionStorage.getItem('aqs_user') ||
           !!document.cookie.match(/user_session|logged_in|auth_token|user_id/);
}

function showLoginPrompt() {
    var existing = document.getElementById('std-login-prompt');
    if (existing) existing.remove();
    var p = document.createElement('div');
    p.id = 'std-login-prompt';
    p.className = 'std-login-prompt';
    p.innerHTML = '<div class="std-login-prompt-box">' +
        '<span style="font-size:2.4rem">🔒</span>' +
        '<h3>Login Required</h3>' +
        '<p>Please log in to use the AI Voice Tutor.</p>' +
        '<button class="std-btn std-btn-primary" onclick="document.getElementById(\'std-login-prompt\').remove()">Got it</button>' +
        '</div>';
    document.body.appendChild(p);
    setTimeout(function () { if (p.parentNode) p.remove(); }, 5000);
}

function saveOrbSession() {
    try {
        var sessions = JSON.parse(localStorage.getItem(ORB_HIST_KEY) || '[]');
        sessions.unshift({ id: Date.now(), topic: S.title || 'General', messages: S.voiceHist.slice() });
        if (sessions.length > 10) sessions = sessions.slice(0, 10);
        localStorage.setItem(ORB_HIST_KEY, JSON.stringify(sessions));
    } catch(e) {}
}

function showOrbHistory() {
    try {
        var sessions = JSON.parse(localStorage.getItem(ORB_HIST_KEY) || '[]');
        if (!sessions.length) { setOrbStatus('No conversation history yet.'); return; }
        var transcript = document.getElementById('std-orb-transcript');
        if (!transcript) return;
        transcript.innerHTML = '';
        var header = document.createElement('div');
        header.className = 'std-orb-hist-header';
        header.textContent = '📜 Past Sessions';
        transcript.appendChild(header);
        sessions.forEach(function (s, i) {
            var d = document.createElement('div');
            d.className = 'std-orb-hist-item';
            var date = new Date(s.id).toLocaleDateString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
            d.innerHTML = '<span class="std-orb-hist-topic">' + esc(s.topic) + '</span><span class="std-orb-hist-date">' + date + '</span>';
            d.addEventListener('click', function () { loadOrbSession(s); });
            transcript.appendChild(d);
        });
    } catch(e) {}
}

function loadOrbSession(session) {
    S.voiceHist = session.messages ? session.messages.slice() : [];
    var transcript = document.getElementById('std-orb-transcript');
    if (!transcript) return;
    transcript.innerHTML = '';
    S.voiceHist.forEach(function (m) {
        if (m.role !== 'system') addOrbMsg(m.role === 'assistant' ? 'ai' : 'user', m.content);
    });
    setOrbStatus('Session loaded — speak to continue');
}

/* ── EVENTS ─────────────────────────────────────────────────── */
function setupEvents() {
    var $ = function (id) { return document.getElementById(id); };

    /* Back buttons */
    $('std-back-btn') && $('std-back-btn').addEventListener('click', function () { setView('home'); });
    $('std-results-back') && $('std-results-back').addEventListener('click', function () { setView('home'); });

    /* Study view buttons */
    $('std-summarise-btn') && $('std-summarise-btn').addEventListener('click', doSummarise);
    $('std-explain-btn')   && $('std-explain-btn').addEventListener('click', doExplain);
    $('std-test-btn')      && $('std-test-btn').addEventListener('click', openTest);
    $('std-voice-btn')     && $('std-voice-btn').addEventListener('click', function () { openOrb(true); });

    /* AI panel close */
    $('std-ai-panel-close') && $('std-ai-panel-close').addEventListener('click', hideAIPanel);

    /* Test modal close */
    $('std-test-close-btn') && $('std-test-close-btn').addEventListener('click', function () {
        var m = $('std-test-modal'); if (m) m.style.display = 'none';
    });

    /* Action bar (in chapter view) */
    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-std-action]');
        if (!btn) return;
        var action = btn.dataset.stdAction;
        if (action === 'summarise') doSummarise();
        else if (action === 'explain') doExplain();
        else if (action === 'test') openTest();
        else if (action === 'voice') openOrb(true);
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

    /* Test modal backdrop close */
    var testModal = $('std-test-modal');
    if (testModal) testModal.addEventListener('click', function (e) {
        if (e.target === testModal) testModal.style.display = 'none';
    });
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
        var icons = { wiki:'📖', book:'📚', ai:'🤖', upload:'📄', img:'🖼' };
        c.innerHTML = h.map(function (x) {
            return '<div class="std-hist-item" data-q="' + esc(x.query || x.title) + '">' +
                   '<span class="std-hist-icon">' + (icons[x.type] || '📝') + '</span>' +
                   '<div class="std-hist-info"><div class="std-hist-title">' + esc(x.title) + '</div>' +
                   '<div class="std-hist-meta">' + (x.chapters ? x.chapters.length + ' chapters · ' : '') + new Date(x.id).toLocaleDateString() + '</div></div>' +
                   '<button class="std-hist-del" data-id="' + x.id + '" title="Remove">✕</button></div>';
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
    setTimeout(function () { el.style.display = 'none'; }, 4500);
}

function renderParagraphs(text) {
    if (!text) return '';
    /* Preserve line breaks and create proper paragraphs */
    return '<p>' + esc(text).replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br>') + '</p>';
}

function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

})();
