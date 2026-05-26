/* aqs-study.js — AI Study v4 | Groq · KaTeX · File Upload · Voice AI
   ─────────────────────────────────────────────────────────────────────
   Uses window.groqFetch() from aqs-groq-key.js — no manual key needed.
   ─────────────────────────────────────────────────────────────────────── */
(function () {
'use strict';

/* ── CONFIG ─────────────────────────────────────────────────── */
var CFG        = window.AQS_CONFIG || {};
var GROQ_MODEL = CFG.groqModel || 'llama-3.3-70b-versatile';

/* ── CONSTANTS ─────────────────────────────────────────────── */
var WIKI_API  = 'https://en.wikipedia.org/w/api.php';
var BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
var HIST_KEY  = 'aqs_study_hist';
var MAX_HIST  = 15;
var CHECKPOINT_PHRASE = 'Does that make sense? Say yes to continue or no if you want me to explain again.';
var SUMMON_KEY_NAME   = 'xzily_ai_name';
var SUMMON_KEY_VOICE  = 'xzily_ai_voice_index';

/* ── STUDY STATE ────────────────────────────────────────────── */
var S = {
    query:'', title:'', source:'', description:'', wikiTitle:'',
    chapters:[], activeIdx:-1, cache:{},
    testQ:null, testAns:[], testIdx:0,
    uploadedContent:null, uploadedFileName:null,
    uploadedBase64:null, uploadedMime:null,
    aiReady: false,
};

/* ── VOICE STATE ────────────────────────────────────────────── */
var VS = {
    active:false, listening:false, speaking:false,
    recognition:null, synth:window.speechSynthesis || null,
    silenceTimer:null, transcript:'', history:[], voice:null,
    aiName:null, voiceIndex:-1, _setupDone:false, _inSetup:false, _setupStep:0,
    responseCount:0, waitingCheckpnt:false, lastExplanation:'',
    sentenceQueue:[], speakingQueue:false, _queueRunning:false,
    _interimSnapshot:'', _pausedQueue:[],
};

/* ── INIT ───────────────────────────────────────────────────── */
/* ROOT-CAUSE FIX: scripts at end of <body> run AFTER the DOM is built.
   On some browsers DOMContentLoaded has already fired by then, so a plain
   addEventListener('DOMContentLoaded') listener is never called.
   The readyState check handles both cases safely. */
function _stdInit() {
    injectKaTeX();
    setupSearch();
    setupFileUpload();
    setupEvents();
    renderHistory();
    injectSummonStyles();
    injectSummonUI();
    initSummonVoices();
    /* Start AI badge check: try at 500 ms, 2 s, and 5 s to cover slow Firebase loads */
    setTimeout(checkAI, 500);
    setTimeout(checkAI, 2000);
    setTimeout(checkAI, 5000);
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _stdInit);
} else {
    _stdInit(); /* DOM already ready — run immediately */
}

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
            delimiters:[
                {left:'$$',right:'$$',display:true},
                {left:'$', right:'$', display:false},
                {left:'\\(',right:'\\)',display:false},
                {left:'\\[',right:'\\]',display:true}
            ],
            throwOnError:false
        });
    } catch(e) {}
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
    S.uploadedFileName = file.name; S.uploadedBase64 = null;
    S.uploadedContent = null; S.uploadedMime = file.type;
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
    window.pdfjsLib.getDocument({data:buf}).promise.then(function (pdf) {
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
                {role:'system', content:'You are an expert tutor. Return ONLY valid JSON.'},
                {role:'user', content:[
                    {type:'text', text:'Analyse this image and create a study guide. Return ONLY JSON:\n{"description":"2-3 sentences","chapters":[{"title":"Chapter Name","summary":"2-3 sentence overview"}]}'},
                    {type:'image_url', image_url:{url:S.uploadedBase64}}
                ]}
            ];
        } else {
            var snippet = (S.uploadedContent || '').slice(0, 7000);
            msgs = [
                {role:'system', content:'You are an expert tutor. Return ONLY valid JSON.'},
                {role:'user', content:'Create a study guide with 8-12 chapters for this content.\n\nTitle: "' + name + '"\n\nContent:\n' + snippet + '\n\nReturn ONLY JSON:\n{"description":"2-3 sentences","chapters":[{"title":"Chapter Name","summary":"2-3 sentence overview"}]}'}
            ];
        }
        var raw  = await aiChat(msgs, 0.5);
        var m    = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').match(/\{[\s\S]*\}/);
        var data = m ? JSON.parse(m[0]) : null;
        if (data && data.chapters && data.chapters.length) {
            S.source = type; S.description = data.description || '';
            S.chapters = data.chapters.map(function (c, i) { return {title:c.title, index:i, summary:c.summary}; });
            S.cache = {};
            saveHist({query:name, title:S.title, type:type, chapters:S.chapters.map(function (c) { return c.title; })});
            renderStudy(); selectChapter(0);
        } else {
            S.source = type; S.description = 'Uploaded: ' + name;
            S.chapters = [{title:'Full Document', index:0}];
            S.cache = {0:S.uploadedContent || ''};
            renderStudy(); selectChapter(0);
        }
    } catch(e) { showErr('Could not analyse document: ' + e.message); setView('home'); }
}

/* ── SEARCH ─────────────────────────────────────────────────── */
function setupSearch() {
    var form = document.getElementById('std-search-form');
    var inp  = document.getElementById('std-search-input');
    var btn  = form ? form.querySelector('button[type="submit"]') : null;
    function _doSearch() {
        var q = (inp ? inp.value : '').trim();
        if (q) doSearch(q);
    }
    if (form) form.addEventListener('submit', function (e) {
        e.preventDefault();
        _doSearch();
    });
    /* Backup: direct click on button in case form submit is swallowed */
    if (btn) btn.addEventListener('click', function (e) {
        e.preventDefault();
        _doSearch();
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
    var r = await fetch(WIKI_API + '?action=query&list=search&srsearch=' + encodeURIComponent(q) + '&srlimit=6&format=json&origin=*', {signal:AbortSignal.timeout(8000)});
    if (!r.ok) throw new Error('Wiki error');
    var d = await r.json();
    return ((d.query && d.query.search) || []).map(function (x) {
        return {title:x.title, desc:(x.snippet||'').replace(/<[^>]*>/g,''), type:'wiki'};
    });
}

async function bookSearch(q) {
    var r = await fetch(BOOKS_API + '?q=' + encodeURIComponent(q) + '&maxResults=6&orderBy=relevance', {signal:AbortSignal.timeout(8000)});
    if (!r.ok) return [];
    var d = await r.json();
    return (d.items || []).map(function (b) {
        var v = b.volumeInfo || {};
        return {id:b.id, title:v.title||'Unknown', authors:(v.authors||[]).join(', '), desc:(v.description||'').slice(0,300), thumb:v.imageLinks?v.imageLinks.thumbnail:null, year:(v.publishedDate||'').slice(0,4), type:'book'};
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
            html += '<div class="std-res-card" data-type="book" data-bookid="' + esc(b.id) + '" data-title="' + esc(b.title) + '" data-desc="' + esc(b.desc) + '">' + img + '<div class="std-res-info"><div class="std-res-title">' + esc(b.title) + '</div><div class="std-res-meta">' + (b.authors?'by '+esc(b.authors):'') + (b.year?' · '+b.year:'') + '</div><div class="std-res-desc">' + esc(b.desc) + '</div></div></div>';
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
            fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g,'_')), {signal:AbortSignal.timeout(10000)}),
            fetch(WIKI_API + '?action=parse&page=' + encodeURIComponent(title) + '&prop=sections&format=json&origin=*', {signal:AbortSignal.timeout(10000)})
        ]);
        var sum = await sumRes.json();
        var sec = await secRes.json();
        var rawSecs  = (sec.parse && sec.parse.sections) ? sec.parse.sections : [];
        var chapters = [{title:'Introduction', index:0, level:1}];
        rawSecs.filter(function (s) { return parseInt(s.toclevel) <= 2 && s.line; }).slice(0, 20)
            .forEach(function (s) { chapters.push({title:s.line.replace(/<[^>]*>/g,''), index:parseInt(s.index), level:parseInt(s.toclevel)}); });
        S.source = 'wiki'; S.title = title; S.wikiTitle = title;
        S.description = sum.extract || sum.description || '';
        S.chapters = chapters; S.cache = {}; S.cache[0] = S.description;
        saveHist({query:S.query, title:title, type:'wiki', chapters:chapters.map(function (c) { return c.title; })});
        renderStudy(); selectChapter(0);
    } catch(e) { await loadAI(title); }
}

/* ── LOAD BOOK ──────────────────────────────────────────────── */
async function loadBook(bookId, title, desc) {
    setView('loading');
    setLoadMsg('🤖 Generating chapters for "' + esc(title) + '"…');
    try {
        var raw = await aiChat([
            {role:'system', content:'You are an expert curriculum designer. Return ONLY valid JSON, no markdown.'},
            {role:'user', content:'Create a comprehensive chapter structure for the textbook "' + title + '".\n' + (desc?'Description: '+desc+'\n':'') + 'Return ONLY JSON array:\n[{"title":"Chapter Name","level":1}]  — 10-14 chapters.'}
        ], 0.4);
        var m = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').match(/\[[\s\S]*\]/);
        if (!m) throw new Error('No chapters');
        var chapters = JSON.parse(m[0]).map(function (c, i) { return {title:c.title, index:i, level:c.level||1}; });
        S.source = 'book'; S.title = title; S.description = desc;
        S.chapters = chapters; S.cache = {};
        saveHist({query:S.query, title:title, type:'book', chapters:chapters.map(function (c) { return c.title; })});
        renderStudy(); selectChapter(0);
    } catch(e) { await loadAI(title); }
}

/* ── LOAD AI ────────────────────────────────────────────────── */
async function loadAI(q) {
    setView('loading');
    setLoadMsg('🤖 Generating AI study guide for "' + esc(q) + '"…');
    try {
        var raw = await aiChat([
            {role:'system', content:'You are an expert academic content creator. Return ONLY valid JSON, no markdown.'},
            {role:'user', content:'Create a comprehensive study guide for: "' + q + '"\n\nReturn ONLY this JSON:\n{"description":"2-3 sentence overview","chapters":[{"title":"Chapter Name","summary":"2-3 sentence preview"}]}\n\nRules:\n- 10-14 chapters\n- Logical progression: intro → core → advanced → applications\n- Include Glossary at the end\n- Note if topic involves math/science/engineering'}
        ], 0.5);
        var m    = raw.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').match(/\{[\s\S]*\}/);
        var data = m ? JSON.parse(m[0]) : null;
        if (!data || !data.chapters) throw new Error('Parse failed');
        S.source = 'ai'; S.title = q; S.description = data.description || '';
        S.chapters = data.chapters.map(function (c, i) { return {title:c.title, index:i, summary:c.summary}; });
        S.cache = {};
        saveHist({query:q, title:q, type:'ai', chapters:S.chapters.map(function (c) { return c.title; })});
        renderStudy(); selectChapter(0);
    } catch(e) { showErr('Could not generate guide: ' + e.message); setView('home'); }
}

/* ── RENDER STUDY VIEW ──────────────────────────────────────── */
function renderStudy() {
    var titleEl = document.getElementById('std-topic-title');
    var chList  = document.getElementById('std-chapters-list');
    if (titleEl) titleEl.textContent = S.title;
    if (chList) {
        chList.innerHTML = S.chapters.map(function (c, i) {
            var cls = 'std-ch-item' + (c.level === 2 ? ' std-ch-sub' : '');
            return '<div class="' + cls + '" data-idx="' + i + '"><span class="std-ch-num">' + (i+1) + '</span><span class="std-ch-label">' + esc(c.title) + '</span></div>';
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
    if (contentArea) contentArea.innerHTML = '<div class="std-content-loading"><div class="std-spinner"></div><p>Loading content…</p></div>';
    if (S.cache[idx]) { showContent(idx, S.cache[idx]); return; }
    try {
        var text = '';
        if (S.source === 'wiki') {
            text = await fetchWikiSection(S.wikiTitle, ch.index);
        } else if (S.source === 'text' && S.uploadedContent) {
            text = await aiChat([
                {role:'system', content:'You are an expert tutor. Use $...$ for inline math and $$...$$ for display math.'},
                {role:'user', content:'Based on this document, write a detailed educational explanation of the section "' + ch.title + '" from "' + S.title + '".\n\nDocument:\n' + S.uploadedContent.slice(0,10000) + '\n\nWrite 400-700 words with clear explanations, examples, and key points. Include LaTeX math where relevant.'}
            ], 0.6);
        } else if (S.source === 'img' && S.uploadedBase64) {
            text = await aiChatVision([
                {role:'system', content:'You are an expert tutor. Write clear educational content with LaTeX math where relevant.'},
                {role:'user', content:[
                    {type:'text', text:'Write a detailed educational explanation of "' + ch.title + '" based on this image. 400-700 words. Use $...$ inline math and $$...$$ display math where relevant.'},
                    {type:'image_url', image_url:{url:S.uploadedBase64}}
                ]}
            ], 0.6);
        } else {
            text = await aiChat([
                {role:'system', content:'You are an expert academic author. Write detailed, engaging educational content. Use $...$ for inline math and $$...$$ for block/display math. Use clear structure.'},
                {role:'user', content:'Write a comprehensive educational chapter on "' + ch.title + '" from the study guide "' + S.title + '".' + (ch.summary?'\nChapter overview: '+ch.summary:'') + '\n\nRequirements:\n- 500-800 words\n- Clear introduction, core concepts, examples\n- Use LaTeX math notation where applicable\n- Key takeaways at end\n- Write as a high-quality textbook chapter'}
            ], 0.65);
        }
        S.cache[idx] = text;
        showContent(idx, text);
    } catch(e) {
        /* FIX: use window._stdRetry instead of bare loadChapterContent (which is not global) */
        if (contentArea) contentArea.innerHTML = '<div class="std-content-empty"><p>⚠️ Could not load content: ' + esc(e.message) + '</p><button class="std-btn std-btn-primary" onclick="window._stdRetry(' + idx + ')">🔄 Retry</button></div>';
    }
}

async function fetchWikiSection(title, sectionIdx) {
    if (sectionIdx === 0) {
        var r = await fetch('https://en.wikipedia.org/api/rest_v1/page/summary/' + encodeURIComponent(title.replace(/ /g,'_')), {signal:AbortSignal.timeout(10000)});
        var d = await r.json();
        return d.extract || d.description || '';
    }
    var r2 = await fetch(WIKI_API + '?action=parse&page=' + encodeURIComponent(title) + '&prop=wikitext&section=' + sectionIdx + '&format=json&origin=*', {signal:AbortSignal.timeout(10000)});
    var d2 = await r2.json();
    var wt = (d2.parse && d2.parse.wikitext && d2.parse.wikitext['*']) || '';
    return wt.replace(/\{\{[^}]*\}\}/g,'').replace(/\[\[([^\]|]+\|)?([^\]]+)\]\]/g,'$2').replace(/'{2,3}/g,'').replace(/==+[^=]+=+/g,'').replace(/\n{3,}/g,'\n\n').trim().slice(0, 4000);
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
            {role:'system', content:'You are an expert tutor. Create clear summaries. Use $...$ for inline math and $$...$$ for block math.'},
            {role:'user', content:'Summarise "' + ch.title + '" from "' + S.title + '"' + (content?' using:\n'+content.slice(0,3000):'') + '\n\n1. Key concepts (bullet points)\n2. Main takeaways (2-3 sentences)\n3. Important formulas or definitions\n\nUse LaTeX math where relevant.'}
        ], 0.6);
        showAIPanel('📝 Summary — ' + ch.title, null, res);
    } catch(e) { showAIPanel('📝 Summary', null, '⚠️ Error: ' + e.message); }
}

async function doExplain() {
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx], content = S.cache[S.activeIdx] || '';
    showAIPanel('💡 Explanation', 'Generating explanation…', null);
    try {
        var res = await aiChat([
            {role:'system', content:'You are an expert tutor. Write detailed explanations. Use $...$ inline math and $$...$$ for display math.'},
            {role:'user', content:'Write a comprehensive explanation of "' + ch.title + '" from "' + S.title + '".\n' + (content?'Reference:\n'+content.slice(0,2500)+'\n\n':'') + 'Include:\n1. Clear breakdown of complex ideas\n2. Real-world analogies and examples\n3. Why and how, not just what\n4. Common misconceptions\n5. All relevant math with LaTeX\n\nWrite 400-600 words.'}
        ], 0.7);
        showAIPanel('💡 Explanation — ' + ch.title, null, res);
    } catch(e) { showAIPanel('💡 Explanation', null, '⚠️ Error: ' + e.message); }
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
    setTimeout(function () { if (p.scrollIntoView) p.scrollIntoView({behavior:'smooth', block:'start'}); }, 80);
}

function hideAIPanel() {
    var p = document.getElementById('std-ai-panel');
    if (p) p.style.display = 'none';
}

/* ── PRACTICE TEST ──────────────────────────────────────────── */
async function openTest() {
    if (S.activeIdx < 0) {
        if (S.chapters && S.chapters.length > 0) { selectChapter(0); }
        else { showErr('Search a topic first, then open a chapter before taking a test.'); return; }
    }
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }
    var ch      = S.chapters[S.activeIdx];
    var content = (S.cache && S.cache[S.activeIdx]) ? S.cache[S.activeIdx] : '';
    var modal   = document.getElementById('std-test-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-loading"><div class="std-spinner lg"></div><h3>🤖 Generating 20 Practice Questions</h3><p>Chapter: <strong>' + esc(ch.title) + '</strong></p><div class="std-test-load-sub">Using Groq AI — please wait…</div></div></div>';

    var PROMPT = [
        {role:'system', content:'You are an expert educator. Return ONLY valid JSON, no markdown, no extra text.'},
        {role:'user', content:'Generate exactly 20 multiple-choice questions for:\nTopic: "' + S.title + '"\nSection: "' + ch.title + '"\n' + (content?'Material:\n'+content.slice(0,3500)+'\n\n':'') + 'Return ONLY this JSON array:\n[{"q":"question","opts":["A","B","C","D"],"ans":0,"exp":"Thorough explanation minimum 10 lines."}]\n\nRules: Exactly 20. Mix difficulty. Include math in LaTeX where relevant.'}
    ];

    var qStr;
    try { qStr = await aiChat(PROMPT, 0.35); }
    catch(e) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Failed to Generate Questions</h3><p>' + esc(e.message) + '</p><button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button></div></div>';
        return;
    }

    var qs = [];
    try {
        var cleaned = qStr.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').trim();
        var m = cleaned.match(/\[[\s\S]*\]/);
        if (m) qs = JSON.parse(m[0]);
    } catch(e) {
        try {
            var retry = [
                {role:'system', content:'Output ONLY a JSON array. Nothing else before or after.'},
                {role:'user', content:'Generate 20 multiple-choice questions about "' + ch.title + '" from "' + S.title + '". Return ONLY:\n[{"q":"...","opts":["A. ...","B. ...","C. ...","D. ..."],"ans":0,"exp":"..."}]'}
            ];
            var qStr2 = await aiChat(retry, 0.3);
            var m2 = qStr2.replace(/```json\s*/gi,'').replace(/```\s*/gi,'').match(/\[[\s\S]*\]/);
            if (m2) qs = JSON.parse(m2[0]);
        } catch(e2) {}
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
    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-header"><div class="std-test-prog-bar"><div class="std-test-prog-fill" style="width:' + prog + '%"></div></div><div class="std-test-meta">Question ' + (idx+1) + ' of ' + S.testQ.length + '</div></div><div class="std-test-body"><div class="std-test-q">' + esc(q.q) + '</div><div class="std-test-opts">' +
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
        if (nxt) nxt.addEventListener('click', function () { if (isLast) showTestResults(); else renderTestQ(qIdx+1); });
    }
}

function showTestResults() {
    var qs = S.testQ, ans = S.testAns; if (!qs) return;
    var correct = ans.filter(function (a, i) { return a === qs[i].ans; }).length;
    var pct = Math.round(correct / qs.length * 100);
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
        html += '<div class="std-res-item ' + (ok?'correct':'wrong') + '"><div class="std-res-item-head"><span class="std-res-num">' + (i+1) + '</span><span>' + (ok?'✅':'❌') + '</span><div class="std-res-q">' + esc(q.q) + '</div></div><div class="std-res-ans"><span style="color:#10b981">Correct: </span><strong>' + ['A','B','C','D'][q.ans] + '. ' + esc(((q.opts||[])[q.ans])||'') + '</strong>' + (ua>=0&&!ok?'<br><span style="color:#ef4444">Your answer: </span>'+['A','B','C','D'][ua]+'. '+esc(((q.opts||[])[ua])||''):'') + '</div><div class="std-res-exp"><strong>Explanation:</strong>' + renderParagraphs(q.exp||'No explanation.') + '</div></div>';
    });
    html += '</div></div>';
    modal.innerHTML = html;
    var rb = document.getElementById('std-retry-btn');
    if (rb) rb.addEventListener('click', function () { S.testQ = null; openTest(); });
    setTimeout(function () { renderMath(modal); }, 150);
}

/* ── AI HELPERS ─────────────────────────────────────────────── */
function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function aiChat(messages, temp) {
    if (typeof window.groqFetch === 'function') {
        try {
            var rg = await window.groqFetch(
                {model:GROQ_MODEL, messages:messages, temperature:temp||0.7, max_tokens:3000},
                {signal:AbortSignal.timeout(60000)}
            );
            if (!rg.ok) {
                var errTxt = '';
                try { var errJ = await rg.json(); errTxt = (errJ.error && errJ.error.message) || ''; } catch(e) {}
                throw new Error('Groq ' + rg.status + (errTxt ? ': ' + errTxt : ''));
            }
            var dg = await rg.json();
            if (!dg.choices || !dg.choices[0]) throw new Error('Empty Groq response');
            return dg.choices[0].message.content || '';
        } catch(e) { /* fall through to free fallback */ }
    }
    for (var pa = 0; pa < 2; pa++) {
        try {
            var rp = await fetch('https://text.pollinations.ai/openai', {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({model:'openai', messages:messages, temperature:temp||0.7, max_tokens:2000}),
                signal:AbortSignal.timeout(60000)
            });
            if (rp.status === 429) { await sleep((pa+1)*3000); continue; }
            if (!rp.ok) throw new Error('AI error ' + rp.status);
            var dp = await rp.json();
            if (!dp.choices || !dp.choices[0]) throw new Error('No AI response');
            return dp.choices[0].message.content || '';
        } catch(e) { if (pa < 1) { await sleep(3000); continue; } throw e; }
    }
    throw new Error('AI unavailable. Please try again in a moment.');
}

async function aiChatVision(messages, temp) {
    var r = await fetch('https://text.pollinations.ai/openai', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({model:'openai', messages:messages, temperature:temp||0.7, max_tokens:2000}),
        signal:AbortSignal.timeout(60000)
    });
    if (!r.ok) throw new Error('Vision AI error ' + r.status);
    var d = await r.json();
    if (!d.choices || !d.choices[0]) throw new Error('No vision response');
    return d.choices[0].message.content || '';
}

/* FIX: checkAI now re-checks itself until the key is confirmed ready */
function checkAI() {
    var badge = document.querySelector('.std-groq-badge');
    if (!badge) return;
    var hasKey = typeof window.getGroqKey === 'function' ? !!window.getGroqKey() : false;
    if (hasKey) {
        badge.className = 'std-groq-badge ok';
        badge.textContent = '✓ Groq AI Ready';
        S.aiReady = true;
    } else {
        badge.className = 'std-groq-badge warn';
        badge.textContent = '⚠ Using free AI (no Groq key)';
        S.aiReady = false;
        /* Re-check after 3 s — key may still be loading from Firebase */
        setTimeout(checkAI, 3000);
    }
}

/* ── EVENTS ─────────────────────────────────────────────────── */
function setupEvents() {
    var $ = function (id) { return document.getElementById(id); };

    $('std-back-btn')     && $('std-back-btn').addEventListener('click', function () { setView('home'); });
    $('std-results-back') && $('std-results-back').addEventListener('click', function () { setView('home'); });

    $('std-summary-btn')  && $('std-summary-btn').addEventListener('click', doSummarise);
    $('std-explain-btn')  && $('std-explain-btn').addEventListener('click', doExplain);
    $('std-test-btn')     && $('std-test-btn').addEventListener('click', openTest);
    $('std-test-hdr-btn') && $('std-test-hdr-btn').addEventListener('click', openTest);
    $('std-voice-btn')    && $('std-voice-btn').addEventListener('click', summonToggle);
    $('std-voice-hdr-btn')&& $('std-voice-hdr-btn').addEventListener('click', summonToggle);

    $('std-close-ai-btn') && $('std-close-ai-btn').addEventListener('click', hideAIPanel);

    $('std-test-close-btn') && $('std-test-close-btn').addEventListener('click', function () {
        var m = $('std-test-modal'); if (m) m.style.display = 'none';
    });

    document.addEventListener('click', function (e) {
        var btn = e.target.closest('[data-std-action]');
        if (!btn) return;
        var a = btn.dataset.stdAction;
        if (a === 'summarise') doSummarise();
        else if (a === 'explain') doExplain();
        else if (a === 'test') openTest();
        else if (a === 'voice') summonToggle();
    });

    var histList = $('std-history-list');
    if (histList) histList.addEventListener('click', function (e) {
        var del = e.target.closest('.std-hist-del');
        if (del) { e.stopPropagation(); deleteHist(parseInt(del.dataset.id)); }
    });

    var tm = $('std-test-modal');
    if (tm) tm.addEventListener('click', function (e) { if (e.target === tm) tm.style.display = 'none'; });
}

/* ── HISTORY ────────────────────────────────────────────────── */
function saveHist(item) {
    try {
        var h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
        h = h.filter(function (x) { return x.title !== item.title; });
        h.unshift(Object.assign({id:Date.now()}, item));
        if (h.length > MAX_HIST) h = h.slice(0, MAX_HIST);
        localStorage.setItem(HIST_KEY, JSON.stringify(h));
        renderHistory();
    } catch(e) {}
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
        var icons = {wiki:'📖', book:'📚', ai:'🤖', text:'📄', img:'🖼'};
        c.innerHTML = h.map(function (x) {
            return '<div class="std-hist-item" data-q="' + esc(x.query||x.title) + '"><span class="std-hist-icon">' + (icons[x.type]||'📝') + '</span><div class="std-hist-info"><div class="std-hist-title">' + esc(x.title) + '</div><div class="std-hist-meta">' + (x.chapters?x.chapters.length+' chapters · ':'') + new Date(x.id).toLocaleDateString() + '</div></div><button class="std-hist-del" data-id="' + x.id + '" title="Remove">✕</button></div>';
        }).join('');
        c.querySelectorAll('.std-hist-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (!e.target.classList.contains('std-hist-del')) doSearch(el.dataset.q);
            });
        });
    } catch(e) { c.innerHTML = ''; }
}

function deleteHist(id) {
    try {
        var h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
        localStorage.setItem(HIST_KEY, JSON.stringify(h.filter(function (x) { return x.id !== id; })));
        renderHistory();
    } catch(e) {}
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
    var el = document.getElementById('std-loading-msg');
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
    return '<p>' + esc(text).replace(/\n{2,}/g,'</p><p>').replace(/\n/g,'<br>') + '</p>';
}

function esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ══════════════════════════════════════════════════════════════
   VOICE AI — XZILY SUMMON
   ══════════════════════════════════════════════════════════════ */

/* ── SETTINGS (saved to localStorage) ───────────────────────── */
function summonLoadSettings() {
    VS.aiName     = localStorage.getItem(SUMMON_KEY_NAME)  || null;
    VS.voiceIndex = parseInt(localStorage.getItem(SUMMON_KEY_VOICE) || '-1', 10);
    VS.voice      = null;
    VS._setupDone = !!(VS.aiName && VS.voiceIndex >= 0);
}

function summonSaveSettings() {
    if (VS.aiName)          localStorage.setItem(SUMMON_KEY_NAME,  VS.aiName);
    if (VS.voiceIndex >= 0) localStorage.setItem(SUMMON_KEY_VOICE, String(VS.voiceIndex));
}

function summonGetEnglishVoices() {
    var voices = VS.synth ? VS.synth.getVoices() : [];
    return voices.filter(function (v) { return v.lang && v.lang.startsWith('en'); }).slice(0, 10);
}

function summonPickVoice() {
    var voices = summonGetEnglishVoices();
    if (VS.voiceIndex >= 0 && voices[VS.voiceIndex]) { VS.voice = voices[VS.voiceIndex]; return; }
    var all = VS.synth ? VS.synth.getVoices() : [];
    var preferred = ['Google US English','Microsoft Guy Online (Natural) - English (United States)','Samantha','Google UK English Male','Daniel'];
    for (var i = 0; i < preferred.length; i++) {
        var found = all.find(function (v) { return v.name === preferred[i]; });
        if (found) { VS.voice = found; return; }
    }
    var en = all.find(function (v) { return v.lang && v.lang.startsWith('en'); });
    if (en) VS.voice = en;
}

function initSummonVoices() {
    if (!VS.synth) return;
    VS.synth.getVoices();
    if (VS.synth.onvoiceschanged !== undefined) VS.synth.onvoiceschanged = function () { summonPickVoice(); };
    summonLoadSettings();
    summonPickVoice();
}

/* ── FIRST-RUN SETUP (voice picker + name) ──────────────────── */
function summonStartSetup() {
    VS._inSetup = true; VS._setupStep = 1; VS._setupDone = false;
    var voices = summonGetEnglishVoices();
    if (!voices.length) { setTimeout(summonStartSetup, 800); return; }
    var list  = voices.map(function (v, i) { return (i+1) + ', ' + v.name; }).join('. ');
    var intro = 'Hello! Before we begin let me personalise your experience. ' +
                'I have ' + voices.length + ' voice options available. ' + list + '. ' +
                'Please say the number of the voice you would like me to use.';
    summonSetAiText(intro);
    summonSpeak(intro, function () { summonSetState('listening'); summonStartListening(); });
}

function summonHandleSetup(q) {
    var voices = summonGetEnglishVoices();
    if (VS._setupStep === 1) {
        var num = parseInt(q.replace(/[^0-9]/g,''), 10);
        if (!num || num < 1 || num > voices.length) {
            var retry = 'I did not catch a valid number. Please say a number between 1 and ' + voices.length + '.';
            summonSetAiText(retry);
            return summonSpeak(retry, function () { summonSetState('listening'); summonStartListening(); });
        }
        VS.voiceIndex = num - 1; VS.voice = voices[VS.voiceIndex]; VS._setupStep = 2;
        var nameQ = 'Great choice! Now, what would you like to name me? You can call me anything you like.';
        summonSetAiText(nameQ);
        return summonSpeak(nameQ, function () { summonSetState('listening'); summonStartListening(); });
    }
    if (VS._setupStep === 2) {
        var name = q.trim().replace(/[^a-zA-Z0-9\s\-_']/g,'').trim();
        if (!name) {
            var retryName = 'I did not catch a name. Please say what you would like to call me.';
            summonSetAiText(retryName);
            return summonSpeak(retryName, function () { summonSetState('listening'); summonStartListening(); });
        }
        VS.aiName = name.replace(/\b\w/g, function (c) { return c.toUpperCase(); });
        summonSaveSettings(); VS._inSetup = false; VS._setupDone = true;
        var done = 'Perfect. From now on my name is ' + VS.aiName + '. I am ready to help you learn. What would you like to explore today?';
        summonSetAiText(done);
        return summonSpeak(done, function () { summonSetState('listening'); summonStartListening(); });
    }
}

/* ── PASSIVE VOICE DETECTOR (auto-pause AI while user speaks) ── */
var _pvd = { active:false, rec:null, paused:false, silenceTimer:null };

function summonStartPassiveDetect() {
    if (_pvd.active || !window.SpeechRecognition && !window.webkitSpeechRecognition) return;
    _pvd.active = true;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    _pvd.rec = new SR();
    _pvd.rec.continuous = true; _pvd.rec.interimResults = true;
    _pvd.rec.onresult = function () {
        if (!_pvd.paused) {
            _pvd.paused = true;
            if (VS.synth) { try { VS.synth.pause(); } catch(e) {} }
            VS._pausedQueue = VS.sentenceQueue.slice();
        }
        clearTimeout(_pvd.silenceTimer);
        _pvd.silenceTimer = setTimeout(function () {
            _pvd.paused = false;
            if (VS.synth) { try { VS.synth.resume(); } catch(e) {} }
            if (!VS._queueRunning && VS._pausedQueue.length) {
                VS.sentenceQueue = VS._pausedQueue.concat(VS.sentenceQueue);
                VS._pausedQueue = [];
                summonRunQueue();
            }
        }, 900);
    };
    try { _pvd.rec.start(); } catch(e) {}
}

function summonStopPassiveDetect() {
    _pvd.active = false; _pvd.paused = false;
    clearTimeout(_pvd.silenceTimer); _pvd.silenceTimer = null;
    if (_pvd.rec) { try { _pvd.rec.abort(); } catch(e) {} _pvd.rec = null; }
}

/* ── RECOGNITION ─────────────────────────────────────────────── */
var _recDisabled = false, _recRetryTimer = null, _recWatchdog = null, _recLastEvent = 0;

function _doStartRecognition() {
    if (_recDisabled) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    VS.recognition = new SR();
    VS.recognition.continuous = true;
    VS.recognition.interimResults = true;
    VS.recognition.lang = 'en-US';

    VS.recognition.onstart = function () { VS.listening = true; _recLastEvent = Date.now(); };
    VS.recognition.onend = function () {
        VS.listening = false; _recStopWatchdog();
        if (!_recDisabled && !VS.speakingQueue) {
            _recRetryTimer = setTimeout(_doStartRecognition, 400);
        }
    };
    VS.recognition.onerror = function (e) {
        _recLastEvent = Date.now();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { _recDisabled = true; return; }
        VS.listening = false; _recStopWatchdog();
        if (!_recDisabled) _recRetryTimer = setTimeout(_doStartRecognition, 800);
    };
    VS.recognition.onresult = function (e) {
        _recLastEvent = Date.now();
        var interim = '', final = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) final += e.results[i][0].transcript;
            else interim += e.results[i][0].transcript;
        }
        VS._interimSnapshot = interim;
        if (interim) summonShowInterim(interim);
        if (final) {
            VS.transcript += ' ' + final;
            VS._interimSnapshot = '';
            summonResetSilence();
        }
    };

    try { VS.recognition.start(); _recStartWatchdog(); } catch(e) {}
}

function summonStartListening() {
    _recDisabled = false;
    clearTimeout(_recRetryTimer); _recStopWatchdog();
    VS.transcript = ''; VS._interimSnapshot = '';
    summonStopPassiveDetect();
    _doStartRecognition();
}

function _recStartWatchdog() {
    _recLastEvent = Date.now();
    _recWatchdog = setInterval(function () {
        if (!VS.listening || VS.speakingQueue || _pvd.paused) { _recStopWatchdog(); return; }
        if (Date.now() - _recLastEvent > 12000) {
            if (VS.recognition) { try { VS.recognition.abort(); } catch(e) {} VS.recognition = null; }
            VS.listening = false; _recStopWatchdog();
            _recRetryTimer = setTimeout(_doStartRecognition, 400);
        }
    }, 4000);
}

function _recStopWatchdog() {
    if (_recWatchdog) { clearInterval(_recWatchdog); _recWatchdog = null; }
}

function summonStopListening() {
    _recDisabled = true;
    clearTimeout(_recRetryTimer); clearTimeout(VS.silenceTimer); _recStopWatchdog();
    VS.listening = false;
    if (VS.recognition) { try { VS.recognition.abort(); } catch(e) {} VS.recognition = null; }
}

/* ── SILENCE TIMER ───────────────────────────────────────────── */
function summonResetSilence() {
    clearTimeout(VS.silenceTimer);
    VS.silenceTimer = setTimeout(function () {
        var q = (VS.transcript || VS._interimSnapshot || '').trim();
        VS.transcript = ''; VS._interimSnapshot = '';
        summonShowInterim('');
        if (q) summonHandleQuery(q);
    }, 1500);
}

function summonShowInterim(text) { summonSetTranscript(text); }

/* ── TEXT SEND ───────────────────────────────────────────────── */
function summonSendText() {
    var inp = document.getElementById('std-summon-text');
    var q   = (inp ? inp.value : '').trim();
    if (!q) return;
    if (inp) inp.value = '';
    if (!VS.active) { VS.active = true; }
    summonHandleQuery(q);
}

/* ── CHECKPOINT DETECTION ────────────────────────────────────── */
function summonIsYes(q) { return /\b(yes|yeah|yep|yea|sure|ok|okay|correct|right|go on|continue|i get|i got|understood|alright)\b/i.test(q); }
function summonIsNo(q)  { return /\b(no|nope|nah|don'?t|not really|i don'?t|confused|again|repeat|explain|what|huh)\b/i.test(q); }

/* ── MAIN QUERY HANDLER ──────────────────────────────────────── */
async function summonHandleQuery(q) {
    if (!VS._setupDone || VS._inSetup) {
        if (!VS._inSetup) summonStartSetup(); else summonHandleSetup(q);
        return;
    }
    if (/\b(change voice|switch voice|new voice|rename (you|yourself|ai)|change (your )?name)\b/i.test(q)) {
        summonStopListening(); summonStopQueue();
        VS._setupDone = false; summonStartSetup(); return;
    }
    if (VS.waitingCheckpnt) {
        VS.waitingCheckpnt = false;
        if (summonIsNo(q)) {
            summonSetTranscript(q);
            var reExp = 'Of course. Let me approach that from a different angle. ' + (VS.lastExplanation || '');
            summonSetAiText(reExp); return summonSpeakStream(reExp, true);
        } else if (summonIsYes(q)) {
            summonSetTranscript(q);
            var cont = 'Excellent. Let us continue. What would you like to explore next?';
            summonSetAiText(cont); return summonSpeakStream(cont, false);
        }
    }

    summonSetTranscript(q); summonSetAiText('...'); summonSetState('thinking');
    summonStopListening(); summonStopQueue();

    var context = '';
    if (S.title) context += 'The student is currently studying: "' + S.title + '". ';
    if (S.chapters && S.chapters[S.activeIdx]) context += 'Active chapter: "' + S.chapters[S.activeIdx].title + '". ';
    if (S.activeIdx >= 0 && S.cache && S.cache[S.activeIdx]) context += 'Relevant excerpt: ' + S.cache[S.activeIdx].slice(0, 600) + ' ';

    VS.history.push({role:'user', content:q});
    if (VS.history.length > 14) VS.history = VS.history.slice(-14);

    VS.responseCount = (VS.responseCount || 0) + 1;
    var addCheckpoint = (VS.responseCount % 3 === 0);
    var aiDisplayName = VS.aiName || 'XZILY AI';

    var sysPrompt =
        'You are ' + aiDisplayName + ', a professional and thorough voice-based academic tutor. ' +
        context +
        'Your responses must always be clear, natural spoken sentences. ' +
        'Never use markdown, bullet points, asterisks, symbols, or any abbreviation that cannot be pronounced aloud. ' +
        'For mathematics, physics, and chemistry questions: always work through the complete solution step by step. ' +
        'Begin every calculation by stating the relevant formula or principle in full spoken words before applying it. ' +
        'Speak every number, unit, and operation in full words — say "nine point eight metres per second squared" not "9.8 m/s", ' +
        'say "force equals mass times acceleration" not "F equals m a". ' +
        'After each calculation step, briefly explain in plain language why that step was taken. ' +
        'For other subjects: give a complete, structured explanation with concrete examples. ' +
        'Never truncate or rush an answer. Maintain a professional, warm, and patient tone throughout. ' +
        (addCheckpoint ? 'At the very end of your response add exactly: "' + CHECKPOINT_PHRASE + '"' : '');

    var messages = [{role:'system', content:sysPrompt}].concat(VS.history);

    try {
        var fullText = await summonStreamResponse(messages);
        VS.lastExplanation = fullText;
        var historyText = fullText.replace(CHECKPOINT_PHRASE, '').trim();
        VS.history.push({role:'assistant', content:historyText});
        if (VS.history.length > 14) VS.history = VS.history.slice(-14);
        if (addCheckpoint) VS.waitingCheckpnt = true;
    } catch(e) {
        summonSetAiText('There was a connection error. Please try again.');
        summonSetState('listening'); summonStartListening();
    }
}

/* ── STREAMING FETCH ─────────────────────────────────────────── */
async function summonStreamResponse(messages) {
    var GROQ_STREAM_URL = 'https://api.groq.com/openai/v1/chat/completions';
    var key = (typeof window.getGroqKey === 'function') ? window.getGroqKey() : null;

    if (!key) {
        var text = await aiChat(messages, 0.7);
        summonSetAiText(text); summonSpeakStream(text, VS.waitingCheckpnt); return text;
    }

    var res = await fetch(GROQ_STREAM_URL, {
        method:'POST',
        headers:{'Content-Type':'application/json', 'Authorization':'Bearer ' + key},
        body:JSON.stringify({model:GROQ_MODEL, messages:messages, temperature:0.7, max_tokens:1200, stream:true}),
        signal:AbortSignal.timeout(45000)
    });

    if (!res.ok) {
        var text2 = await aiChat(messages, 0.7);
        summonSetAiText(text2); summonSpeakStream(text2, VS.waitingCheckpnt); return text2;
    }

    var reader = res.body.getReader(), decoder = new TextDecoder();
    var full = '', sentenceBuf = '';
    summonSetState('speaking'); VS.speakingQueue = true; VS.sentenceQueue = [];
    summonStartPassiveDetect();

    while (true) {
        var chunk = await reader.read();
        if (chunk.done) break;
        var lines = decoder.decode(chunk.value, {stream:true}).split('\n');
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            if (!line || line === 'data: [DONE]') continue;
            if (line.startsWith('data: ')) {
                try {
                    var delta = JSON.parse(line.slice(6));
                    var token = (delta.choices[0].delta.content) || '';
                    full += token; sentenceBuf += token;
                    summonSetAiText(full);
                    var sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                    while (sentenceEnd !== -1) {
                        var sentence = sentenceBuf.slice(0, sentenceEnd+1).trim();
                        sentenceBuf = sentenceBuf.slice(sentenceEnd+1);
                        if (sentence) summonQueueSentence(sentence);
                        sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                    }
                } catch(ex) {}
            }
        }
    }

    if (sentenceBuf.trim()) summonQueueSentence(sentenceBuf.trim());
    summonFlushQueue(function () {
        VS.speakingQueue = false; _pvd.paused = false; VS._pausedQueue = [];
        summonSetState('listening'); summonStartListening();
    });
    return full;
}

/* ── SENTENCE QUEUE ──────────────────────────────────────────── */
function summonQueueSentence(text) {
    VS.sentenceQueue = VS.sentenceQueue || [];
    VS.sentenceQueue.push(text);
    if (!VS._queueRunning) summonRunQueue();
}

function summonRunQueue() {
    if (!VS.sentenceQueue || !VS.sentenceQueue.length) { VS._queueRunning = false; return; }
    if (_pvd.paused) { VS._queueRunning = false; return; }
    VS._queueRunning = true;
    var sentence = VS.sentenceQueue.shift();
    summonSpeakOne(sentence, function () {
        if (VS.speakingQueue && !_pvd.paused) summonRunQueue(); else VS._queueRunning = false;
    });
}

function summonFlushQueue(onAllDone) {
    var check = setInterval(function () {
        if (!VS._queueRunning && (!VS.sentenceQueue || !VS.sentenceQueue.length) && !_pvd.paused) {
            clearInterval(check); if (onAllDone) onAllDone();
        }
    }, 150);
}

function summonStopQueue() {
    VS.speakingQueue = false; VS._queueRunning = false;
    VS.sentenceQueue = []; VS._pausedQueue = []; VS.speaking = false;
    _pvd.paused = false; clearTimeout(_pvd.silenceTimer); _pvd.silenceTimer = null;
    if (VS.synth) { try { VS.synth.cancel(); } catch(e) {} }
}

function summonSpeakOne(text, onDone) {
    if (!VS.synth || !text) { if (onDone) onDone(); return; }
    summonPickVoice(); VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    if (VS.voice) u.voice = VS.voice;
    u.onend  = function () { VS.speaking = false; if (onDone) onDone(); };
    u.onerror = function () { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

function summonSpeakStream(text, isCheckpoint) {
    var sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    VS.speakingQueue = true;
    VS.sentenceQueue = sentences.map(function (s) { return s.trim(); }).filter(Boolean);
    summonStartPassiveDetect(); summonRunQueue();
    summonFlushQueue(function () {
        VS.speakingQueue = false;
        if (isCheckpoint) VS.waitingCheckpnt = true;
        summonSetState('listening'); summonStartListening();
    });
}

function summonSpeak(text, onDone) {
    if (!VS.synth) { if (onDone) onDone(); return; }
    try { VS.synth.cancel(); } catch(e) {}
    summonPickVoice(); summonSetState('speaking'); VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    if (VS.voice) u.voice = VS.voice;
    u.onend = u.onerror = function () { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

/* ── INJECT STYLES ───────────────────────────────────────────── */
function injectSummonStyles() {
    if (document.getElementById('std-summon-css')) return;
    var s = document.createElement('style');
    s.id = 'std-summon-css';
    /* FIX: added !important to position/display/z-index on FAB so page CSS cannot override it */
    s.textContent = [
        '#std-summon-fab{position:fixed!important;bottom:24px!important;right:24px!important;z-index:99998!important;width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#a78bfa,#7c3aed 60%,#4c1d95);display:flex!important;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 18px 4px rgba(139,92,246,.5);animation:sfab-pulse 3s ease-in-out infinite;transition:transform .18s;font-size:1.5rem;color:#fff;user-select:none}',
        '#std-summon-fab:hover{transform:scale(1.1)}',
        '@keyframes sfab-pulse{0%,100%{box-shadow:0 0 14px 3px rgba(139,92,246,.4)}50%{box-shadow:0 0 32px 12px rgba(139,92,246,.65)}}',
        '#std-summon-overlay{position:fixed!important;inset:0;z-index:99999!important;display:none;flex-direction:column;align-items:center;justify-content:center;background:rgba(5,4,18,.92);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:24px;box-sizing:border-box}',
        '#std-summon-overlay.open{display:flex!important;animation:sovl-in .28s ease-out}',
        '@keyframes sovl-in{from{opacity:0}to{opacity:1}}',
        '#std-summon-close{position:absolute;top:18px;right:18px;background:rgba(255,255,255,.08);border:none;color:#c8c2f0;font-size:1.2rem;width:38px;height:38px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s}',
        '#std-summon-close:hover{background:rgba(255,255,255,.15)}',
        '#std-summon-big-orb{position:relative;width:130px;height:130px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#a78bfa,#7c3aed 60%,#4c1d95);display:flex;align-items:center;justify-content:center;font-size:3rem;color:#fff;box-shadow:0 0 40px 10px rgba(139,92,246,.5);transition:background .4s,box-shadow .4s;animation:sorb-idle 3s ease-in-out infinite;flex-shrink:0}',
        '@keyframes sorb-idle{0%,100%{box-shadow:0 0 30px 8px rgba(139,92,246,.4)}50%{box-shadow:0 0 60px 20px rgba(139,92,246,.65)}}',
        '.sorb-ring{position:absolute;border-radius:50%;border:2px solid rgba(139,92,246,.25);top:50%;left:50%;transform:translate(-50%,-50%);opacity:0;pointer-events:none}',
        '.sorb-ring.r1{width:170px;height:170px}',
        '.sorb-ring.r2{width:210px;height:210px}',
        '.sorb-ring.r3{width:255px;height:255px}',
        '#std-summon-overlay[data-state=listening] #std-summon-big-orb{background:radial-gradient(circle at 35% 35%,#67e8f9,#06b6d4 60%,#0e7490);animation:sorb-listen 1.3s ease-in-out infinite}',
        '@keyframes sorb-listen{0%,100%{box-shadow:0 0 40px 10px rgba(6,182,212,.45)}50%{box-shadow:0 0 80px 28px rgba(6,182,212,.8)}}',
        '#std-summon-overlay[data-state=listening] .sorb-ring{animation:sorb-ring-out 1.8s ease-out infinite;border-color:rgba(6,182,212,.35);opacity:1}',
        '#std-summon-overlay[data-state=listening] .r1{animation-delay:0s}',
        '#std-summon-overlay[data-state=listening] .r2{animation-delay:.5s}',
        '#std-summon-overlay[data-state=listening] .r3{animation-delay:1s}',
        '@keyframes sorb-ring-out{0%{transform:translate(-50%,-50%) scale(.8);opacity:.6}100%{transform:translate(-50%,-50%) scale(1.4);opacity:0}}',
        '#std-summon-overlay[data-state=thinking] #std-summon-big-orb{background:radial-gradient(circle at 35% 35%,#fde68a,#f59e0b 60%,#b45309);animation:sorb-think .8s ease-in-out infinite alternate}',
        '@keyframes sorb-think{0%{box-shadow:0 0 30px 8px rgba(245,158,11,.4);transform:scale(1)}100%{box-shadow:0 0 70px 22px rgba(245,158,11,.7);transform:scale(1.05)}}',
        '#std-summon-overlay[data-state=speaking] #std-summon-big-orb{background:radial-gradient(circle at 35% 35%,#6ee7b7,#10b981 60%,#065f46);animation:sorb-speak .5s ease-in-out infinite alternate}',
        '@keyframes sorb-speak{0%{box-shadow:0 0 30px 8px rgba(16,185,129,.4);transform:scale(1)}100%{box-shadow:0 0 80px 28px rgba(16,185,129,.75);transform:scale(1.08)}}',
        '#std-summon-overlay[data-state=speaking] .sorb-ring{animation:sorb-ring-out .8s ease-in-out infinite alternate;border-color:rgba(16,185,129,.4);opacity:1}',
        '#std-summon-state-txt{margin-top:28px;font-size:1rem;font-weight:700;color:#eeeaff;letter-spacing:.06em;text-transform:uppercase;opacity:.85;min-height:24px;text-align:center}',
        '#std-summon-transcript{margin-top:16px;font-size:1.05rem;color:#06b6d4;font-style:italic;text-align:center;min-height:28px;max-width:600px;line-height:1.5;word-break:break-word}',
        '#std-summon-ai-text{margin-top:12px;font-size:1.05rem;color:#c8c2f0;text-align:center;max-width:600px;min-height:32px;line-height:1.6;word-break:break-word;transition:opacity .3s}',
        '#std-summon-input-row{position:absolute;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px;width:min(480px,90vw)}',
        '#std-summon-text{flex:1;background:rgba(255,255,255,.07);border:1.5px solid rgba(139,92,246,.4);border-radius:24px;color:#eeeaff;font-size:.9rem;padding:10px 18px;outline:none;font-family:inherit;transition:border-color .2s;backdrop-filter:blur(6px)}',
        '#std-summon-text:focus{border-color:#8b5cf6}',
        '#std-summon-text::placeholder{color:#8c84b8}',
        '#std-summon-send{background:#7c3aed;border:none;border-radius:50%;color:#fff;font-size:1rem;width:42px;height:42px;cursor:pointer;flex-shrink:0;transition:background .15s;display:flex;align-items:center;justify-content:center}',
        '#std-summon-send:hover{background:#6d28d9}',
        '@media(max-width:480px){#std-summon-fab{bottom:14px!important;right:14px!important}#std-summon-big-orb{width:100px;height:100px;font-size:2.3rem}#std-summon-ai-text,#std-summon-transcript{font-size:.92rem}}',
    ].join('');
    document.head.appendChild(s);
}

/* ── INJECT UI ───────────────────────────────────────────────── */
function injectSummonUI() {
    if (document.getElementById('std-summon-fab')) return;
    var fab = document.createElement('div');
    fab.id = 'std-summon-fab'; fab.title = 'XZILY AI Voice'; fab.textContent = '✦';
    document.body.appendChild(fab);
    fab.addEventListener('click', summonToggle);

    var overlay = document.createElement('div');
    overlay.id = 'std-summon-overlay';
    overlay.setAttribute('data-state', 'idle');
    overlay.innerHTML = [
        '<button id="std-summon-close">&#x2715;</button>',
        '<div id="std-summon-big-orb">',
          '<div class="sorb-ring r1"></div>',
          '<div class="sorb-ring r2"></div>',
          '<div class="sorb-ring r3"></div>',
          '<span>✦</span>',
        '</div>',
        '<div id="std-summon-state-txt">XZILY AI</div>',
        '<div id="std-summon-transcript"></div>',
        '<div id="std-summon-ai-text"></div>',
        '<div id="std-summon-input-row">',
          '<input id="std-summon-text" type="text" placeholder="Or type here…" autocomplete="off">',
          '<button id="std-summon-send">&#x27A4;</button>',
        '</div>',
    ].join('');
    document.body.appendChild(overlay);
    document.getElementById('std-summon-close').addEventListener('click', summonHide);
    document.getElementById('std-summon-send').addEventListener('click', summonSendText);
    document.getElementById('std-summon-text').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') summonSendText();
    });
}

/* ── OVERLAY CONTROLS ────────────────────────────────────────── */
function summonSetState(state) {
    var overlay = document.getElementById('std-summon-overlay');
    var txt     = document.getElementById('std-summon-state-txt');
    if (!overlay) return;
    overlay.setAttribute('data-state', state);
    var labels = {idle:'XZILY AI', listening:'Listening…', thinking:'Thinking…', speaking:'Speaking…'};
    if (txt) txt.textContent = labels[state] || 'XZILY AI';
}

function summonToggle() { if (VS.active) summonHide(); else summonShow(); }

function summonShow() {
    VS.active = true;
    var overlay = document.getElementById('std-summon-overlay');
    if (overlay) overlay.classList.add('open');
    summonSetState('speaking');
    summonSetAiText(''); summonSetTranscript('');
    if (!VS._setupDone) {
        setTimeout(function () {
            if (!VS._inSetup) summonStartSetup();
        }, 300);
        return;
    }
    var name = VS.aiName || 'XZILY AI';
    var greeting = S.title
        ? 'Hello! I am ' + name + '. You are studying ' + S.title + '. Ask me anything!'
        : 'Hello! I am ' + name + '. How can I help you study today?';
    summonSetAiText(greeting);
    summonSpeak(greeting, function () {
        summonSetAiText(''); summonSetState('listening'); summonStartListening();
    });
}

function summonSetTranscript(text) {
    var el = document.getElementById('std-summon-transcript');
    if (el) el.textContent = text ? '🎙 ' + text : '';
}

function summonSetAiText(text) {
    var el = document.getElementById('std-summon-ai-text');
    if (el) el.textContent = text;
}

function summonHide() {
    VS.active = false;
    summonStopListening(); summonStopQueue(); summonStopPassiveDetect();
    var overlay = document.getElementById('std-summon-overlay');
    if (overlay) overlay.classList.remove('open');
    summonSetState('idle');
}

/* ── EXPOSE INTERNALS NEEDED BY INLINE onclick HANDLERS ─────── */
/* FIX: functions inside an IIFE are not global — expose only what onclick HTML needs */
window._stdRetry = loadChapterContent;

})();
