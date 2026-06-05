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
var CHECKPOINT_PHRASE   = 'Does that make sense? Say yes to continue, or no if you would like me to explain again.';
var SUMMON_KEY_NAME     = 'xzily_ai_name';
var SUMMON_KEY_VOICE    = 'xzily_ai_voice_index';
var SUMMON_KEY_USER     = 'xzily_user_name';
var SUMMON_KEY_SURNAME  = 'xzily_user_surname';
var NAME_CALL_INTERVAL  = 600000; /* 10 minutes in ms */

/* 10 friendly tutor names shown during voice demo */
var DEMO_VOICE_NAMES = ['Sarah','James','Emily','Michael','Olivia','Daniel','Sophie','Alex','Grace','Nathan'];

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
    _interimSnapshot:'', _pausedQueue:[], _currentAudio:null,
    /* user identity */
    userName:null, userSurname:null, lastNameCall:0,
    /* voice demo */
    _demoVoices:[], _demoIdx:0,
    /* stream abort controller */
    _streamAbort:null,
};

/* ── MOBILE DETECTION ────────────────────────────────────────── */
/* True when running inside Capacitor (Android/iOS app) or any mobile WebView */
var _IS_MOBILE_APP = !!(
    (window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform()) ||
    /Android|iPhone|iPad/i.test(navigator.userAgent || '')
);

/* ── MIC RECORDING STATE (getUserMedia + Whisper) ───────────── */
var _MIC_STATE = { active:false, mediaRecorder:null, chunks:[], stream:null, _autoStop:null };

/* Pollinations neural voices — used for TTS on mobile (more reliable than speechSynthesis) */
var POLL_VOICES = [
    {id:'alloy',   name:'Alloy',   desc:'Balanced & clear'},
    {id:'echo',    name:'Echo',    desc:'Friendly & warm'},
    {id:'fable',   name:'Fable',   desc:'Storytelling tone'},
    {id:'onyx',    name:'Onyx',    desc:'Deep & authoritative'},
    {id:'nova',    name:'Nova',    desc:'Bright & engaging'},
    {id:'shimmer', name:'Shimmer', desc:'Warm & expressive'},
];

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
    stdVoiceInit();
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

    if (_IS_MOBILE_APP) {
        /* Mobile: one button for any file/gallery, one for live camera */
        wrap.innerHTML =
            '<label class="std-upload-btn" for="std-file-input">' +
            '📎 Upload File / Image' +
            '<input type="file" id="std-file-input" accept=".txt,.md,.csv,.pdf,image/*" style="display:none">' +
            '</label>' +
            '<label class="std-upload-btn" for="std-camera-input">' +
            '📷 Take Photo' +
            '<input type="file" id="std-camera-input" accept="image/*" capture="environment" style="display:none">' +
            '</label>' +
            '<span id="std-upload-info" class="std-upload-info"></span>';
    } else {
        wrap.innerHTML =
            '<label class="std-upload-btn" for="std-file-input">' +
            '📎 Upload Textbook / Image' +
            '<input type="file" id="std-file-input" accept=".txt,.md,.csv,.pdf,image/*" style="display:none">' +
            '</label>' +
            '<span id="std-upload-info" class="std-upload-info"></span>';
    }

    searchSection.appendChild(wrap);
    var input = document.getElementById('std-file-input');
    if (input) input.addEventListener('change', function () {
        if (input.files[0]) { handleFileUpload(input.files[0]); input.value = ''; }
    });
    var camInput = document.getElementById('std-camera-input');
    if (camInput) camInput.addEventListener('change', function () {
        if (camInput.files[0]) { handleFileUpload(camInput.files[0]); camInput.value = ''; }
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

/* Streams a Groq response word-by-word directly into the AI panel */
async function streamToPanel(panelTitle, messages, temp) {
    showAIPanel(panelTitle, 'Generating…', null);
    var bE = document.getElementById('std-ai-panel-body');
    if (!bE) return;

    // groqFetch: Groq key rotation (62s cooldown) → Mistral fallback → throw
    if (typeof window.groqFetch === 'function') {
        try {
            var res = await window.groqFetch(
                {model:GROQ_MODEL, messages:messages, temperature:temp||0.7, max_tokens:2000, stream:true},
                {signal:AbortSignal.timeout(60000)}
            );
            if (res.ok) {
                var reader = res.body.getReader(), decoder = new TextDecoder(), full = '';
                bE.innerHTML = '<div class="std-stream-body"></div>';
                var bodyDiv = bE.querySelector('.std-stream-body');
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
                                full += token;
                                if (bodyDiv) bodyDiv.innerHTML = renderParagraphs(full) + '<span class="std-stream-cursor">▍</span>';
                            } catch(ex) {}
                        }
                    }
                }
                bE.innerHTML = renderParagraphs(full);
                setTimeout(function () { renderMath(bE); }, 80);
                var p = document.getElementById('std-ai-panel');
                if (p && p.scrollIntoView) p.scrollIntoView({behavior:'smooth', block:'start'});
                return;
            }
            // Non-OK from provider — fall through to non-streaming
        } catch(streamErr) { /* all providers exhausted — try non-streaming */ }
    }

    // Non-streaming fallback (also routes through groqFetch + Mistral)
    try {
        var txt = await aiChat(messages, temp);
        var bE2 = document.getElementById('std-ai-panel-body');
        if (bE2) { bE2.innerHTML = renderParagraphs(txt); setTimeout(function () { renderMath(bE2); }, 80); }
        var p2 = document.getElementById('std-ai-panel');
        if (p2 && p2.scrollIntoView) p2.scrollIntoView({behavior:'smooth', block:'start'});
    } catch(e) {
        var bE3 = document.getElementById('std-ai-panel-body');
        if (bE3) bE3.textContent = '⚠️ ' + e.message;
    }
}

async function doSummarise() {
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx], content = S.cache[S.activeIdx] || '';
    streamToPanel('📝 Summary — ' + ch.title, [
        {role:'system', content:'You are an expert tutor. Create clear summaries. Use $...$ for inline math and $...$ for block math.'},
        {role:'user', content:'Summarise "' + ch.title + '" from "' + S.title + '"' + (content?' using:\n'+content.slice(0,3000):'') + '\n\n1. Key concepts (bullet points)\n2. Main takeaways (2-3 sentences)\n3. Important formulas or definitions\n\nUse LaTeX math where relevant.'}
    ], 0.6);
}

async function doExplain() {
    if (S.activeIdx < 0) { showErr('Select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx], content = S.cache[S.activeIdx] || '';
    streamToPanel('💡 Explanation — ' + ch.title, [
        {role:'system', content:'You are an expert tutor. Write detailed explanations. Use $...$ inline math and $...$ for display math.'},
        {role:'user', content:'Write a comprehensive explanation of "' + ch.title + '" from "' + S.title + '".\n' + (content?'Reference:\n'+content.slice(0,2500)+'\n\n':'') + 'Include:\n1. Clear breakdown of complex ideas\n2. Real-world analogies and examples\n3. Why and how, not just what\n4. Common misconceptions\n5. All relevant math with LaTeX\n\nWrite 400-600 words.'}
    ], 0.7);
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
    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-loading"><div class="std-spinner lg"></div><h3>🤖 Generating Practice Questions</h3><p>Chapter: <strong>' + esc(ch.title) + '</strong></p><div class="std-test-load-sub">Using Groq AI — please wait…</div></div></div>';

    /* Robust JSON extraction — handles fenced blocks, stray text, multiple schemas */
    function extractQs(raw) {
        if (!raw) return null;
        /* Strip markdown fences */
        var s = raw.replace(/```json[\s\S]*?```/gi, function(m){ return m.replace(/```json\s*/i,'').replace(/\s*```$/,''); })
                   .replace(/```[\s\S]*?```/gi, function(m){ return m.replace(/```\w*\s*/,'').replace(/\s*```$/,''); })
                   .trim();
        /* Scan all '[' positions to extract JSON array even with surrounding text */
        var candidates = [];
        var pos = 0;
        while (pos < s.length) {
            var si = s.indexOf('[', pos);
            if (si === -1) break;
            var depth = 0, ei = -1;
            for (var ci = si; ci < s.length; ci++) {
                if (s[ci] === '[') depth++;
                else if (s[ci] === ']') { depth--; if (depth === 0) { ei = ci; break; } }
            }
            if (ei !== -1) candidates.push(s.slice(si, ei + 1));
            pos = si + 1;
        }
        /* Try each candidate — return first that parses into valid questions */
        for (var k = 0; k < candidates.length; k++) {
            try {
                var arr = JSON.parse(candidates[k]);
                if (!Array.isArray(arr) || arr.length < 1) continue;
                var qs = arr.filter(function (q) {
                    return q && (q.q || q.question) &&
                           (Array.isArray(q.opts) || Array.isArray(q.options)) &&
                           (q.opts || q.options || []).length >= 2;
                }).map(function (q) {
                    var opts = q.opts || q.options || [];
                    var ans  = q.ans !== undefined ? q.ans :
                               q.answer !== undefined ? q.answer :
                               q.correct !== undefined ? q.correct : 0;
                    return {
                        q:    String(q.q || q.question),
                        opts: opts.slice(0, 4).map(String),
                        ans:  Math.max(0, Math.min(parseInt(ans) || 0, opts.length - 1)),
                        exp:  String(q.exp || q.explanation || q.reason || '')
                    };
                });
                if (qs.length >= 1) return qs;
            } catch(e2) { continue; }
        }
        return null;
    }

    /* 10 questions — stricter JSON-only prompt with 3-attempt retry ladder */
    var snippet = content ? content.slice(0, 3000) : '';
    var sysMsg  = 'You are an exam question generator. Your ENTIRE response must be a valid JSON array. Start with [ and end with ]. No other text, no markdown, no explanation outside the array.';
    var userMsg = 'Generate 10 multiple-choice practice questions about "' + ch.title + '" from the subject "' + S.title + '".' +
        (snippet ? '\nBase questions on this content:\n' + snippet : '') +
        '\n\nYour ENTIRE response = this JSON array only (no other text):\n' +
        '[{"q":"Full question text","opts":["Option A","Option B","Option C","Option D"],"ans":0,"exp":"Why this answer is correct"}]' +
        '\n\nRules: ans = 0-based correct-answer index. Mix easy/medium/hard. Use $...$ for math.';

    var qStr;
    try { qStr = await aiChat([{role:'system',content:sysMsg},{role:'user',content:userMsg}], 0.3); }
    catch(e) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Failed to Generate Questions</h3><p>' + esc(e.message) + '</p><button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button></div></div>';
        return;
    }

    var qs = extractQs(qStr);

    /* Retry 2 — simpler 5-question prompt */
    if (!qs) {
        try {
            var r2str = await aiChat([
                {role:'system', content:'Respond with ONLY a JSON array. No other text. Start with ['},
                {role:'user',   content:'5 quiz questions on "' + ch.title + '" (' + S.title + '). Format exactly: [{"q":"?","opts":["A","B","C","D"],"ans":0,"exp":"why"}]'}
            ], 0.2);
            qs = extractQs(r2str);
        } catch(e2) {}
    }

    /* Retry 3 — absolute minimal prompt, temperature 0 */
    if (!qs) {
        try {
            var r3str = await aiChat([
                {role:'system', content:'Output ONLY raw JSON. Nothing else.'},
                {role:'user',   content:'3 quiz questions about ' + ch.title + '. Array: [{"q":"?","opts":["A","B","C","D"],"ans":0,"exp":""}]'}
            ], 0.1);
            qs = extractQs(r3str);
        } catch(e3) {}
    }

    if (!qs || !qs.length) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Could Not Generate Questions</h3><p>AI is temporarily busy. Please wait a moment and try again.</p><button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button></div></div>';
        return;
    }

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
    setTimeout(function () {
        var inner = modal.querySelector('.std-test-inner');
        if (inner) renderMath(inner);
    }, 80);
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
            '<div class="std-test-exp-prev">' + esc(q.exp||'') + '</div>';
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
    // groqFetch handles: Groq rotation → Mistral fallback → throws if all fail
    if (typeof window.groqFetch !== 'function') {
        throw new Error('No AI key configured. Please add a Groq key in Settings.');
    }
    var rg = await window.groqFetch(
        {model:GROQ_MODEL, messages:messages, temperature:temp||0.7, max_tokens:3000},
        {signal:AbortSignal.timeout(60000)}
    );
    if (!rg.ok) {
        var errTxt = '';
        try { var errJ = await rg.json(); errTxt = (errJ.error && errJ.error.message) || ''; } catch(e2) {}
        throw new Error('AI error ' + rg.status + (errTxt ? ': ' + errTxt : ''));
    }
    var dg = await rg.json();
    if (!dg.choices || !dg.choices[0]) throw new Error('Empty AI response');
    return dg.choices[0].message.content || '';
}

async function aiChatVision(messages, temp) {
    /* Use groqFetch (Mistral) — Mistral large models support vision via pixtral.
       Falls back gracefully if no key configured. */
    if (typeof window.groqFetch !== 'function') throw new Error('AI not ready — no keys configured.');
    var r = await window.groqFetch(
        { messages: messages, temperature: temp || 0.7, max_tokens: 2000 },
        { signal: AbortSignal.timeout ? AbortSignal.timeout(60000) : undefined }
    );
    if (!r.ok) throw new Error('Vision AI error ' + r.status);
    var d = await r.json();
    if (!d.choices || !d.choices[0]) throw new Error('No vision response');
    return d.choices[0].message.content || '';
}

/* checkAI — silently check AI readiness; badge is hidden from users */
function checkAI() {
    var mistralCount = typeof window._aqsMistralKeyCount === 'function' ? window._aqsMistralKeyCount() : 0;
    var hasKey = mistralCount > 0 ||
        (Array.isArray(window._AQS_MISTRAL_MASTER_KEYS) && window._AQS_MISTRAL_MASTER_KEYS.length > 0);
    S.aiReady = hasKey;
    /* Silently retry until key loads — badge UI is hidden from students */
    if (!hasKey) setTimeout(checkAI, 3000);
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

    $('std-chapters-toggle') && $('std-chapters-toggle').addEventListener('click', function () {
        var panel = document.getElementById('std-chapters-panel');
        if (panel) panel.classList.toggle('open');
    });

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
    VS.aiName      = localStorage.getItem(SUMMON_KEY_NAME)    || null;
    VS.voiceIndex  = parseInt(localStorage.getItem(SUMMON_KEY_VOICE) || '-1', 10);
    VS.userName    = localStorage.getItem(SUMMON_KEY_USER)    || null;
    VS.userSurname = localStorage.getItem(SUMMON_KEY_SURNAME) || null;
    VS.voice       = null;
    /* Setup is complete when we have a voice AND the user's name */
    VS._setupDone = !!(VS.voiceIndex >= 0 && VS.userName);
}

function summonSaveSettings() {
    if (VS.aiName)          localStorage.setItem(SUMMON_KEY_NAME,    VS.aiName);
    if (VS.voiceIndex >= 0) localStorage.setItem(SUMMON_KEY_VOICE,   String(VS.voiceIndex));
    if (VS.userName)        localStorage.setItem(SUMMON_KEY_USER,    VS.userName);
    if (VS.userSurname)     localStorage.setItem(SUMMON_KEY_SURNAME, VS.userSurname);
}

function summonGetEnglishVoices() {
    /* On mobile, return Pollinations neural voices (always available, no speechSynthesis needed) */
    if (_IS_MOBILE_APP) return POLL_VOICES;
    var voices = VS.synth ? VS.synth.getVoices() : [];
    return voices.filter(function (v) { return v.lang && v.lang.startsWith('en'); }).slice(0, 10);
}

function summonPickVoice() {
    if (_IS_MOBILE_APP) {
        /* Pick from Pollinations voices — default index 0 (Alloy) */
        var idx = (VS.voiceIndex >= 0 && VS.voiceIndex < POLL_VOICES.length) ? VS.voiceIndex : 0;
        VS.voice = POLL_VOICES[idx];
        return;
    }
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
    summonLoadSettings();
    summonPickVoice();
    if (_IS_MOBILE_APP) return; /* Mobile uses Pollinations — no speechSynthesis voices needed */
    if (!VS.synth) return;
    VS.synth.getVoices();
    if (VS.synth.onvoiceschanged !== undefined) VS.synth.onvoiceschanged = function () { summonPickVoice(); };
}

/* ── FIRST-RUN SETUP (welcome → voice demos → pick voice → ask name) ── */
function summonStartSetup() {
    VS._inSetup = true; VS._setupDone = false; VS._setupStep = 0;

    /* Collect voices for demo */
    if (_IS_MOBILE_APP) {
        VS._demoVoices = POLL_VOICES;
    } else {
        var bv = VS.synth ? VS.synth.getVoices().filter(function (v) {
            return v.lang && v.lang.startsWith('en');
        }).slice(0, 10) : [];
        if (!bv.length) { setTimeout(summonStartSetup, 800); return; }
        VS._demoVoices = bv;
    }

    var n = VS._demoVoices.length;

    /* Welcome using a warm female voice (nova on mobile, first female on desktop) */
    var savedIdx = VS.voiceIndex;
    if (_IS_MOBILE_APP) {
        /* nova is index 4 in POLL_VOICES */
        VS.voiceIndex = 4; summonPickVoice();
    } else {
        /* Try to pick a female/warm voice for welcome */
        var allVoices = VS.synth ? VS.synth.getVoices() : [];
        var femaleNames = ['Samantha','Google US English Female','Zira','Microsoft Zira','Karen','Moira','Tessa','Victoria','Veena'];
        var femaleVoice = null;
        for (var fi = 0; fi < femaleNames.length; fi++) {
            femaleVoice = allVoices.find(function (v) { return v.name.indexOf(femaleNames[fi]) !== -1; });
            if (femaleVoice) break;
        }
        if (!femaleVoice) femaleVoice = allVoices.find(function (v) { return v.lang && v.lang.startsWith('en'); });
        if (femaleVoice) VS.voice = femaleVoice;
    }

    var welcomeMsg =
        'Welcome to Darapet Learning System. ' +
        'I am your personal AI tutor. I am here to teach you from the very beginning — ' +
        'starting with definitions, types, and real examples, just like a real classroom teacher. ' +
        'I will now play ' + n + ' different voice samples. ' +
        'Please listen carefully and choose the voice you would like me to use throughout your sessions.';

    summonSetAiText(welcomeMsg);
    summonSpeak(welcomeMsg, function () {
        VS.voiceIndex = savedIdx;
        VS._demoIdx = 0;
        VS._setupStep = 1;
        setTimeout(function () { _summonDemoNextVoice(0); }, 400);
    });
}

function _summonDemoNextVoice(idx) {
    var voices = VS._demoVoices;
    if (!voices || idx >= voices.length) {
        /* All voices played — ask user to pick */
        VS._setupStep = 2;
        var pickMsg = 'That was all ' + voices.length + ' voices. ' +
                      'Which voice would you prefer? Please say or type a number from 1 to ' + voices.length + '.';
        summonSetAiText(pickMsg);
        summonSpeak(pickMsg, function () {
            summonSetState('listening');
            if (!_IS_MOBILE_APP) summonStartListening();
        });
        return;
    }
    VS._demoIdx = idx;
    var v = voices[idx];
    var vLabel = DEMO_VOICE_NAMES[idx] || (v.name || v.id || ('Voice ' + (idx + 1)));
    var fullText = 'Voice ' + (idx + 1) + ', ' + vLabel + '. Hello, how are you doing?';

    summonSetAiText('🎙 Voice ' + (idx + 1) + ' — ' + vLabel + '\n\n"Hello, how are you doing?"');

    _summonPlayDemoVoice(idx, fullText, function () {
        setTimeout(function () { _summonDemoNextVoice(idx + 1); }, 700);
    });
}

function _summonPlayDemoVoice(idx, text, onDone) {
    var voices = VS._demoVoices;
    var v = voices[idx];

    if (_IS_MOBILE_APP) {
        /* Use specific Pollinations voice for this demo slot */
        var voiceId = (v && v.id) ? v.id : 'alloy';
        VS.speaking = true;
        var chunk = text.slice(0, 200);
        var url = 'https://audio.pollinations.ai/' + encodeURIComponent(chunk) +
                  '?model=openai-audio&voice=' + voiceId + '&seed=42';
        var ctx = window._aqsAudioCtx;
        if (ctx) {
            if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
            fetch(url)
                .then(function (r) { return r.arrayBuffer(); })
                .then(function (buf) { return ctx.decodeAudioData(buf); })
                .then(function (decoded) {
                    if (!VS.speaking) { if (onDone) onDone(); return; }
                    var src = ctx.createBufferSource();
                    src.buffer = decoded; src.connect(ctx.destination);
                    VS._currentAudio = src;
                    src.onended = function () {
                        VS._currentAudio = null; VS.speaking = false; if (onDone) onDone();
                    };
                    src.start(0);
                })
                .catch(function () { VS.speaking = false; if (onDone) onDone(); });
        } else {
            _summonSpeakSynth(text, onDone);
        }
    } else {
        /* Desktop: use specific browser voice at this index */
        if (!VS.synth) { if (onDone) onDone(); return; }
        VS.speaking = true;
        var u = new SpeechSynthesisUtterance(text);
        u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
        if (v && v.lang) u.voice = v; /* SpeechSynthesisVoice object */
        u.onend  = function () { VS.speaking = false; if (onDone) onDone(); };
        u.onerror = function () { VS.speaking = false; if (onDone) onDone(); };
        VS.synth.speak(u);
    }
}

function summonHandleSetup(q) {
    var voices = VS._demoVoices;

    /* Step 2 — user picks a voice by number */
    if (VS._setupStep === 2) {
        var num = parseInt(q.replace(/[^0-9]/g, ''), 10);
        if (!num || num < 1 || num > voices.length) {
            var retry = 'Please say or type a number between 1 and ' + voices.length + '.';
            summonSetAiText(retry);
            return summonSpeak(retry, function () {
                summonSetState('listening');
                if (!_IS_MOBILE_APP) summonStartListening();
            });
        }
        VS.voiceIndex = num - 1;
        VS.voice = voices[VS.voiceIndex];
        summonPickVoice();
        VS._setupStep = 3;
        var nameQ = _IS_MOBILE_APP
            ? 'Perfect choice! Now, what is your full name? Type it below and press Send.'
            : 'Perfect choice! Now, what is your full name? You can say it or type it below.';
        summonSetAiText(nameQ);
        return summonSpeak(nameQ, function () {
            summonSetState('listening');
            if (!_IS_MOBILE_APP) summonStartListening();
        });
    }

    /* Step 3 — user gives their name */
    if (VS._setupStep === 3) {
        var raw = q.trim().replace(/[^a-zA-Z0-9\s\-']/g, '').trim();
        if (!raw) {
            var retryName = _IS_MOBILE_APP
                ? 'Please type your full name below and press Send.'
                : 'I did not catch your name. Please say or type your full name.';
            summonSetAiText(retryName);
            return summonSpeak(retryName, function () {
                summonSetState('listening');
                if (!_IS_MOBILE_APP) summonStartListening();
            });
        }

        /* Capitalise each word; store first name and surname */
        var parts = raw.trim().split(/\s+/).map(function (p) {
            return p.charAt(0).toUpperCase() + p.slice(1).toLowerCase();
        });
        VS.userName    = parts[0];
        VS.userSurname = parts.length > 1 ? parts[parts.length - 1] : '';
        VS.aiName      = VS.aiName || 'Tutor';
        VS.lastNameCall = 0;

        summonSaveSettings();
        VS._inSetup = false; VS._setupDone = true;

        var topicLine = S.title
            ? ' I can see you are studying "' + S.title + '". Excellent choice — let us dive right in!'
            : ' Ask me anything you would like to learn about. I will teach you from the very basics.';
        var done = 'Welcome, ' + VS.userName + '! I am so happy to have you here. ' +
                   'I am your personal AI tutor for Darapet Learning System.' + topicLine;
        summonSetAiText(done);
        return summonSpeak(done, function () {
            summonSetState('listening');
            if (!_IS_MOBILE_APP) summonStartListening();
        });
    }
}

/* ── PASSIVE VOICE DETECTOR REMOVED ─────────────────────────── */
/* Running a second hidden mic while the AI speaks causes popping/
   feedback on mobile. Removed entirely. The mic is disabled while
   the AI speaks (speakingQueue flag) and re-enabled with a delay. */

/* ── RECOGNITION ─────────────────────────────────────────────── */
var _recDisabled = false, _recRetryTimer = null, _recWatchdog = null, _recLastEvent = 0, _nextFinalIndex = 0;

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
            /* 900ms lets the audio hardware fully settle before re-opening the
               mic, which eliminates the popping click on restart. */
            _nextFinalIndex = 0;
            _recRetryTimer = setTimeout(_doStartRecognition, 900);
        }
    };
    VS.recognition.onerror = function (e) {
        _recLastEvent = Date.now();
        if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { _recDisabled = true; return; }
        VS.listening = false; _recStopWatchdog();
        if (!_recDisabled) {
            _nextFinalIndex = 0;
            _recRetryTimer = setTimeout(_doStartRecognition, 1200);
        }
    };
    VS.recognition.onresult = function (e) {
          /* Echo guard: ignore STT results for 1200ms after AI stops speaking */
          if (VS._speakEndTime && Date.now() - VS._speakEndTime < 1200) return;
        _recLastEvent = Date.now();
        var interim = '', final = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
            if (e.results[i].isFinal) {
                /* Guard against Chrome re-delivering already-processed final
                   results (e.resultIndex can be 0 on every event in continuous
                   mode, causing each new word to re-append earlier words). */
                if (i >= _nextFinalIndex) {
                    final += e.results[i][0].transcript;
                    _nextFinalIndex = i + 1;
                }
            } else {
                interim += e.results[i][0].transcript;
            }
        }
        VS._interimSnapshot = interim;
        if (interim) { summonShowInterim(interim); summonResetSilence(); }
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
    _nextFinalIndex = 0;
    _doStartRecognition();
}

function _recStartWatchdog() {
    _recLastEvent = Date.now();
    _recWatchdog = setInterval(function () {
        if (!VS.listening || VS.speakingQueue) { _recStopWatchdog(); return; }
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
    }, 600);
}

function summonShowInterim(text) { summonSetTranscript(text); }

/* ── TEXT SEND ───────────────────────────────────────────────── */
function summonSendText() {
    var inp = document.getElementById('std-summon-text');
    var q   = (inp ? inp.value : '').trim();
    if (!q) return;
    if (inp) inp.value = '';
    /* Immediately stop any ongoing AI speech/stream when user sends */
    summonStopQueue();
    _summonAbortStream();
    if (!VS.active) { VS.active = true; }
    summonHandleQuery(q);
}

/* Abort any in-progress streaming fetch */
function _summonAbortStream() {
    if (VS._streamAbort) {
        try { VS._streamAbort.abort(); } catch (e) {}
        VS._streamAbort = null;
    }
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

    vhAdd('user', q);
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

    /* Structured first-lesson intro */
    var isFirstLesson = (VS.responseCount === 1);
    var activeChapterTitle = (S.chapters && S.chapters[S.activeIdx]) ? S.chapters[S.activeIdx].title : (S.title || '');

    /* Surname calling at 10-min intervals */
    var shouldCallSurname = !!(VS.userSurname && (Date.now() - VS.lastNameCall > NAME_CALL_INTERVAL));

    var teachInst = isFirstLesson && activeChapterTitle
        ? 'TEACHING STRUCTURE — follow this exact order for your first response:\n' +
          '1. Open with: "Did you know that..." followed by a fascinating fact about "' + activeChapterTitle + '".\n' +
          '2. Give the clear, simple definition of "' + activeChapterTitle + '".\n' +
          '3. Explain the main types or categories with brief descriptions.\n' +
          '4. Provide 2 to 3 relatable real-world examples.\n' +
          '5. Deliver a full, rich, easy-to-understand explanation covering the key ideas.\n' +
          '6. End by asking ONE comprehension question — then STOP and wait for the student to answer.\n\n'
        : '';

    var surnameInst = shouldCallSurname
        ? 'At a natural point in your response address the student by their surname "' + VS.userSurname + '" — for example "' + VS.userSurname + ', did you know..." or "Now ' + VS.userSurname + ', let us explore...". Make it warm and natural, like a real teacher.\n\n'
        : '';

    var sysPrompt =
        'You are a professional, encouraging, and thorough voice-based academic tutor for Darapet Learning System. ' +
        'The student\'s name is ' + (VS.userName || 'Student') + '. ' +
        context +
        teachInst +
        surnameInst +
        'For ALL mathematics, physics, chemistry, or calculation questions you MUST use this exact two-part format:\n' +
        '1. Write a complete plain-English spoken explanation — natural sentences, no symbols, no LaTeX, no markdown. ' +
        'Say "square root of twenty-seven" not "sqrt(27)". Say "three times the square root of three" not "3√3". ' +
        'Work step by step, stating each formula in words before applying it.\n' +
        '[DISPLAY]\n' +
        '2. Write the SAME explanation again, this time using proper LaTeX notation: ' +
        '$...$ for inline math (e.g. $\\sqrt{27}$, $3\\sqrt{3}$) and $$...$$ for displayed equations. ' +
        'Include every step and its explanation. Use clear paragraphs.\n' +
        'For non-math topics: respond naturally without the [DISPLAY] section — just clear, engaging spoken sentences. ' +
        'Teach at a pace the student can follow. Use everyday language and relatable examples. ' +
        'Be encouraging, patient, and motivating. Never truncate or rush. ' +
        (addCheckpoint ? 'At the very end of your response (after [DISPLAY] if present) add exactly: "' + CHECKPOINT_PHRASE + '"' : '');

    var messages = [{role:'system', content:sysPrompt}].concat(VS.history);

    try {
        var fullText = await summonStreamResponse(messages);
        /* summonStreamResponse returns '' or undefined when it handled the error
           internally (already showed a message to the user). Guard here so we
           don't get a TypeError calling .indexOf on undefined, which would
           overwrite the real error with a misleading 'connection error'. */
        if (!fullText) return;
        VS.lastExplanation = fullText;
        /* Update surname-call timestamp so we don't call it again too soon */
        if (shouldCallSurname) VS.lastNameCall = Date.now();
        /* Strip [DISPLAY] section from history — keep spoken plain-English only */
        var dSplit = fullText.indexOf('[DISPLAY]');
        var historyText = (dSplit !== -1 ? fullText.slice(0, dSplit) : fullText)
            .replace(CHECKPOINT_PHRASE, '').replace(/^\[SPEAK\]\s*/i, '').trim();
        vhAdd('ai', historyText);
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
    /* groqFetch: Groq key rotation + Mistral fallback — no direct fetch */
    summonStopListening();

    if (typeof window.groqFetch !== 'function') {
        summonSetAiText('⚠️ No AI key configured. Add Mistral keys in Admin Settings.');
        summonSetState('listening'); summonStartListening();
        return;
    }

    /* Create an AbortController so the user can stop the stream mid-response */
    var abortCtrl = new AbortController();
    VS._streamAbort = abortCtrl;
    var signal = abortCtrl.signal;

    var res;
    try {
        res = await window.groqFetch(
            {model:GROQ_MODEL, messages:messages, temperature:0.7, max_tokens:1200, stream:true},
            {signal:signal}
        );
    } catch(fetchErr) {
        if (signal.aborted) {
            VS._streamAbort = null;
            return '';
        }
        /* All providers exhausted — try non-streaming aiChat as last resort */
        try {
            var textFb = await aiChat(messages, 0.7);
            var fIdxFb = textFb.indexOf('[DISPLAY]');
            if (fIdxFb !== -1) {
                summonSetAiText(textFb.slice(fIdxFb + '[DISPLAY]'.length).trim());
                summonSpeakStream(textFb.slice(0, fIdxFb).replace(/^\[SPEAK\]\s*/i,'').trim(), VS.waitingCheckpnt);
            } else { summonSetAiText(textFb); summonSpeakStream(textFb, VS.waitingCheckpnt); }
            return textFb;
        } catch(e2) {
            summonSetAiText('⚠️ ' + (e2.message || 'AI unavailable'));
            summonSetState('listening'); summonStartListening();
            return;
        }
    }

    if (!res.ok) {
        try {
            var text2 = await aiChat(messages, 0.7);
            summonSetAiText(text2); summonSpeakStream(text2, VS.waitingCheckpnt); return text2;
        } catch(e3) {
            summonSetAiText('⚠️ ' + (e3.message || 'AI unavailable'));
            summonSetState('listening'); summonStartListening();
            return;
        }
    }
    var reader = res.body.getReader(), decoder = new TextDecoder();
    var full = '', sentenceBuf = '', seenDisplay = false, displayStart = -1;
    summonSetState('speaking'); VS.speakingQueue = true; VS.sentenceQueue = [];

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
                    full += token;

                    if (!seenDisplay) {
                        /* Check if the [DISPLAY] marker has arrived yet */
                        var dIdx = full.indexOf('[DISPLAY]');
                        if (dIdx !== -1) {
                            /* Marker just found — switch to display mode */
                            seenDisplay = true;
                            displayStart = dIdx + '[DISPLAY]'.length;
                            /* Stop buffering speak sentences */
                            sentenceBuf = '';
                            /* Show display portion accumulated so far */
                            var dispSoFar = full.slice(displayStart).replace(/^\s+/, '');
                            if (dispSoFar) summonSetAiText(dispSoFar);
                        } else {
                            /* Still in the spoken section — feed to TTS sentence queue */
                            /* Strip any leading [SPEAK] tag the model might output */
                            var tok = token.replace(/^\[SPEAK\]\s*/i, '');
                            sentenceBuf += tok;
                            var sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                            while (sentenceEnd !== -1) {
                                var sentence = sentenceBuf.slice(0, sentenceEnd + 1).trim();
                                sentenceBuf = sentenceBuf.slice(sentenceEnd + 1);
                                if (sentence) summonQueueSentence(sentence);
                                sentenceEnd = sentenceBuf.search(/[.!?][^.!?]|[.!?]$/);
                            }
                        }
                    } else {
                        /* Past [DISPLAY] — stream LaTeX text into the scrollable panel */
                        var displayText = full.slice(displayStart).replace(/^\s+/, '');
                        summonSetAiText(displayText);
                    }
                } catch(ex) {}
            }
        }
    }

    } catch(streamErr) {
        /* Mid-stream network error — use whatever text arrived so far.
           If nothing arrived, show a clear message and bail out. */
        console.warn('[summonStreamResponse] stream error:', streamErr.message || streamErr);
        try { reader.cancel(); } catch(e) {}
        if (!full) {
            summonSetAiText('⚠️ Connection interrupted. Please try again.');
            summonSetState('listening');
            var retryMs = (navigator.maxTouchPoints > 0) ? 1500 : 600;
            setTimeout(function(){ summonStartListening(); }, retryMs);
            return '';
        }
        /* partial content received — fall through and display what we have */
    }

    /* Flush any remaining spoken sentence fragment */
    if (!seenDisplay && sentenceBuf.trim()) summonQueueSentence(sentenceBuf.trim());
    /* If the AI skipped [DISPLAY] (non-math topic), show full text in panel */
    if (!seenDisplay) summonSetAiText(full);
    summonFlushQueue(function () {
        VS._speakEndTime = Date.now();
        VS.speakingQueue = false;
        summonSetState('listening');
        /* Mobile needs longer to clear speaker audio before mic opens —
           prevents the popping/clicking sound on first word. */
        var micDelay = (navigator.maxTouchPoints > 0) ? 1500 : 600;
        setTimeout(function () { summonStartListening(); }, micDelay);
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
    VS._queueRunning = true;
    var sentence = VS.sentenceQueue.shift();
    summonSpeakOne(sentence, function () {
        if (VS.speakingQueue) summonRunQueue(); else VS._queueRunning = false;
    });
}

function summonFlushQueue(onAllDone) {
    var check = setInterval(function () {
        if (!VS._queueRunning && (!VS.sentenceQueue || !VS.sentenceQueue.length)) {
            clearInterval(check); if (onAllDone) onAllDone();
        }
    }, 150);
}

function summonStopQueue() {
    VS.speakingQueue = false; VS._queueRunning = false;
    VS.sentenceQueue = []; VS._pausedQueue = []; VS.speaking = false;
    /* Abort any in-progress streaming fetch so no new sentences get queued */
    if (VS._streamAbort) {
        try { VS._streamAbort.abort(); } catch (e) {}
        VS._streamAbort = null;
    }
    /* Stop AudioBufferSourceNode (AudioContext path) or HTMLAudioElement (fallback) */
    if (VS._currentAudio) {
        try {
            if (typeof VS._currentAudio.stop === 'function') {
                VS._currentAudio.stop(); /* AudioBufferSourceNode */
            } else {
                VS._currentAudio.pause(); VS._currentAudio.src = ''; /* HTMLAudioElement */
            }
        } catch(e) {}
        VS._currentAudio = null;
    }
    if (VS.synth) { try { VS.synth.cancel(); } catch(e) {} }
}

/* ── POLLINATIONS TTS (mobile primary) ──────────────────────── */
/*
 * WHY AudioContext instead of new Audio(url).play():
 * Android WebView blocks HTMLAudioElement.play() on remote URLs when called
 * outside a user-gesture (i.e. after an async AI response).  An already-
 * resumed AudioContext has no such restriction — it can decode + play audio
 * at any point after the initial unlock gesture.
 */
function _summonPollTTS(text, onDone) {
    summonPickVoice();
    var voiceId = (VS.voice && VS.voice.id) ? VS.voice.id : 'alloy';
    var chunk = text.slice(0, 200);
    var url = 'https://audio.pollinations.ai/' + encodeURIComponent(chunk) +
              '?model=openai-audio&voice=' + voiceId + '&seed=42';

    VS.speaking = true;

    var ctx = window._aqsAudioCtx;

    if (ctx) {
        /* ── PRIMARY: AudioContext path (no autoplay restriction) ── */
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch(e) {} }

        fetch(url)
            .then(function (r) {
                if (!r.ok) throw new Error('HTTP ' + r.status);
                return r.arrayBuffer();
            })
            .then(function (buf) { return ctx.decodeAudioData(buf); })
            .then(function (decoded) {
                /* Check we weren't stopped while fetching */
                if (!VS.speaking) { if (onDone) onDone(); return; }
                var src = ctx.createBufferSource();
                src.buffer = decoded;
                src.connect(ctx.destination);
                VS._currentAudio = src;
                src.onended = function () {
                    VS._currentAudio = null; VS.speaking = false;
                    if (onDone) onDone();
                };
                src.start(0);
            })
            .catch(function () {
                VS._currentAudio = null; VS.speaking = false;
                _summonSpeakSynth(text, onDone);
            });

    } else {
        /* ── FALLBACK: blob-URL approach avoids direct remote-URL autoplay block ── */
        fetch(url)
            .then(function (r) { return r.blob(); })
            .then(function (blob) {
                var blobUrl = URL.createObjectURL(blob);
                var audio = new Audio(blobUrl);
                audio.setAttribute('playsinline', '');
                audio.setAttribute('webkit-playsinline', '');
                VS._currentAudio = audio;
                audio.onended = function () {
                    URL.revokeObjectURL(blobUrl);
                    VS._currentAudio = null; VS.speaking = false;
                    if (onDone) onDone();
                };
                audio.onerror = function () {
                    URL.revokeObjectURL(blobUrl);
                    VS._currentAudio = null; VS.speaking = false;
                    _summonSpeakSynth(text, onDone);
                };
                var p = audio.play();
                if (p && typeof p.catch === 'function') {
                    p.catch(function () {
                        URL.revokeObjectURL(blobUrl);
                        VS._currentAudio = null; VS.speaking = false;
                        _summonSpeakSynth(text, onDone);
                    });
                }
            })
            .catch(function () {
                VS._currentAudio = null; VS.speaking = false;
                _summonSpeakSynth(text, onDone);
            });
    }
}

function _summonSpeakSynth(text, onDone) {
    if (!VS.synth || !text) { if (onDone) onDone(); return; }
    VS.speaking = true;
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.05; u.pitch = 1.0; u.volume = 1.0;
    /* Only assign a synth voice object (not a Pollinations plain object) */
    if (VS.voice && VS.voice.lang) u.voice = VS.voice;
    u.onend  = function () { VS.speaking = false; if (onDone) onDone(); };
    u.onerror = function () { VS.speaking = false; if (onDone) onDone(); };
    VS.synth.speak(u);
}

function summonSpeakOne(text, onDone) {
    if (!text) { if (onDone) onDone(); return; }
    summonPickVoice();
    if (_IS_MOBILE_APP) {
        _summonPollTTS(text, onDone);
    } else {
        _summonSpeakSynth(text, onDone);
    }
}

function summonSpeakStream(text, isCheckpoint) {
    var sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text];
    VS.speakingQueue = true;
    VS.sentenceQueue = sentences.map(function (s) { return s.trim(); }).filter(Boolean);
    summonRunQueue();
    summonFlushQueue(function () {
        VS._speakEndTime = Date.now();
        VS.speakingQueue = false;
        if (isCheckpoint) VS.waitingCheckpnt = true;
        summonSetState('listening');
        var micDelay = (navigator.maxTouchPoints > 0) ? 1500 : 600;
        setTimeout(function () { summonStartListening(); }, micDelay);
    });
}

function summonSpeak(text, onDone) {
    /* Stop any previous audio before starting new speech */
    if (VS._currentAudio) {
        try { VS._currentAudio.pause(); VS._currentAudio.src = ''; } catch(e) {}
        VS._currentAudio = null;
    }
    try { if (VS.synth) VS.synth.cancel(); } catch(e) {}
    summonPickVoice(); summonSetState('speaking');
    if (_IS_MOBILE_APP) {
        _summonPollTTS(text, onDone);
    } else {
        _summonSpeakSynth(text, onDone);
    }
}

/* ── INJECT STYLES ───────────────────────────────────────────── */
function injectSummonStyles() {
    if (document.getElementById('std-summon-css')) return;
    var s = document.createElement('style');
    s.id = 'std-summon-css';
    /* FIX: added !important to position/display/z-index on FAB so page CSS cannot override it */
    s.textContent = [
        /* ── FAB button ── */
        '#std-summon-fab{position:fixed!important;bottom:24px!important;right:24px!important;z-index:99998!important;width:56px;height:56px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#a78bfa,#7c3aed 60%,#4c1d95);display:flex!important;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 0 18px 4px rgba(139,92,246,.5);animation:sfab-pulse 3s ease-in-out infinite;transition:transform .18s;font-size:1.5rem;color:#fff;user-select:none}',
        '#std-summon-fab:hover{transform:scale(1.1)}',
        '@keyframes sfab-pulse{0%,100%{box-shadow:0 0 14px 3px rgba(139,92,246,.4)}50%{box-shadow:0 0 32px 12px rgba(139,92,246,.65)}}',

        /* ── RIGHT-SIDE PANEL (replaces full-screen overlay) ── */
        '#std-summon-overlay{position:fixed!important;top:0!important;right:0!important;bottom:0!important;left:auto!important;width:min(420px,100vw)!important;z-index:99999!important;display:none;flex-direction:column;background:#0c0a1e;border-left:2px solid rgba(139,92,246,.35);box-shadow:-8px 0 48px rgba(0,0,0,.65);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-sizing:border-box}',
        '#std-summon-overlay.open{display:flex!important;animation:sovl-slide .28s cubic-bezier(.4,0,.2,1)}',
        '@keyframes sovl-slide{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}',

        /* ── HEADER BAR ── */
        '#std-summon-header{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(139,92,246,.25);flex-shrink:0;background:#110e28}',
        '#std-vh-btn{background:rgba(255,255,255,.08);border:none;color:#c8c2f0;font-size:1rem;width:34px;height:34px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}',
        '#std-vh-btn:hover{background:rgba(255,255,255,.15)}',
        '#std-vh-btn.active{background:rgba(139,92,246,.4);color:#fff}',

        /* ── SMALL ORB ── */
        '#std-summon-big-orb{position:relative;width:38px;height:38px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#a78bfa,#7c3aed 60%,#4c1d95);display:flex;align-items:center;justify-content:center;font-size:1.1rem;color:#fff;flex-shrink:0;transition:background .4s;animation:sorb-idle 3s ease-in-out infinite}',
        '.sorb-ring{display:none}',
        '@keyframes sorb-idle{0%,100%{box-shadow:0 0 8px 2px rgba(139,92,246,.5)}50%{box-shadow:0 0 18px 6px rgba(139,92,246,.8)}}',
        '#std-summon-overlay[data-state=listening] #std-summon-big-orb{background:radial-gradient(circle at 35% 35%,#67e8f9,#06b6d4 60%,#0e7490);animation:sorb-listen 1s ease-in-out infinite}',
        '@keyframes sorb-listen{0%,100%{box-shadow:0 0 8px 2px rgba(6,182,212,.5)}50%{box-shadow:0 0 22px 8px rgba(6,182,212,.9)}}',
        '#std-summon-overlay[data-state=thinking] #std-summon-big-orb{background:radial-gradient(circle at 35% 35%,#fde68a,#f59e0b 60%,#b45309);animation:sorb-think .8s ease-in-out infinite alternate}',
        '@keyframes sorb-think{0%{box-shadow:0 0 8px 2px rgba(245,158,11,.4)}100%{box-shadow:0 0 20px 7px rgba(245,158,11,.8)}}',
        '#std-summon-overlay[data-state=speaking] #std-summon-big-orb{background:radial-gradient(circle at 35% 35%,#6ee7b7,#10b981 60%,#065f46);animation:sorb-speak .5s ease-in-out infinite alternate}',
        '@keyframes sorb-speak{0%{box-shadow:0 0 8px 2px rgba(16,185,129,.4)}100%{box-shadow:0 0 22px 8px rgba(16,185,129,.85)}}',

        /* ── STATE LABEL & CLOSE ── */
        '#std-summon-state-txt{flex:1;font-size:.82rem;font-weight:700;color:#eeeaff;letter-spacing:.06em;text-transform:uppercase;opacity:.85}',
        '#std-summon-close{background:rgba(255,255,255,.08);border:none;color:#c8c2f0;font-size:1rem;width:34px;height:34px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .15s;flex-shrink:0}',
        '#std-summon-close:hover{background:rgba(255,255,255,.18)}',

        /* ── SCROLLABLE AI TEXT AREA ── */
        '#std-summon-ai-text{flex:1;overflow-y:auto;padding:16px 18px;font-size:.97rem;color:#d4cfee;line-height:1.75;word-break:break-word;text-align:left;-webkit-overflow-scrolling:touch}',
        '#std-summon-ai-text::-webkit-scrollbar{width:4px}',
        '#std-summon-ai-text::-webkit-scrollbar-track{background:transparent}',
        '#std-summon-ai-text::-webkit-scrollbar-thumb{background:rgba(139,92,246,.4);border-radius:2px}',
        /* math inside AI text */
        '#std-summon-ai-text .katex-display{overflow-x:auto;padding:4px 0}',
        '#std-summon-ai-text p{margin:0 0 10px}',
        '#std-summon-ai-text p:last-child{margin-bottom:0}',
        '#std-summon-ai-text ul,#std-summon-ai-text ol{margin:0 0 10px 18px}',
        '#std-summon-ai-text li{margin-bottom:4px}',
        '#std-summon-ai-text strong{color:#fff}',

        /* ── "YOU SAID" TRANSCRIPT STRIP ── */
        '#std-summon-transcript{padding:7px 18px;font-size:.78rem;color:#06b6d4;font-style:italic;border-top:1px solid rgba(139,92,246,.15);min-height:28px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;background:#0e0b22}',

        /* ── INPUT ROW ── */
        '#std-summon-input-row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(139,92,246,.2);flex-shrink:0;background:#110e28}',
        '#std-summon-text{flex:1;background:rgba(255,255,255,.07);border:1.5px solid rgba(139,92,246,.4);border-radius:22px;color:#eeeaff;font-size:.88rem;padding:9px 16px;outline:none;font-family:inherit;transition:border-color .2s}',
        '#std-summon-text:focus{border-color:#8b5cf6}',
        '#std-summon-text::placeholder{color:#8c84b8}',
        '#std-summon-send{background:#7c3aed;border:none;border-radius:50%;color:#fff;font-size:1rem;width:40px;height:40px;cursor:pointer;flex-shrink:0;transition:background .15s;display:flex;align-items:center;justify-content:center}',
        '#std-summon-send:hover{background:#6d28d9}',
        '#std-summon-mic-btn{background:rgba(139,92,246,.22);border:1.5px solid rgba(139,92,246,.45);border-radius:50%;color:#fff;font-size:1rem;width:40px;height:40px;cursor:pointer;flex-shrink:0;transition:background .18s,border-color .18s;display:flex;align-items:center;justify-content:center}',
        '#std-summon-mic-btn:hover{background:rgba(139,92,246,.45)}',
        '#std-summon-mic-btn.recording{background:#ef4444!important;border-color:#ef4444!important;animation:smic-pulse .6s ease-in-out infinite alternate}',
        '@keyframes smic-pulse{0%{box-shadow:0 0 4px 1px rgba(239,68,68,.4)}100%{box-shadow:0 0 14px 5px rgba(239,68,68,.8)}}',

        /* ── HISTORY DROPDOWN ── */
        '#std-vh-panel{position:absolute;top:62px;left:0;right:0;max-height:70vh;overflow-y:auto;background:rgba(8,6,24,.99);border-bottom:1px solid rgba(139,92,246,.3);z-index:4;display:flex;flex-direction:column}',
        '#std-vh-panel::-webkit-scrollbar{width:4px}#std-vh-panel::-webkit-scrollbar-track{background:transparent}#std-vh-panel::-webkit-scrollbar-thumb{background:rgba(139,92,246,.4);border-radius:2px}',
        /* toolbar: title + save btn */
        '.std-vh-toolbar{display:flex;align-items:center;padding:10px 12px 8px;border-bottom:1px solid rgba(139,92,246,.2);flex-shrink:0;gap:8px}',
        '.std-vh-toolbar-title{flex:1;font-size:.78rem;font-weight:700;color:#a89ee8;text-transform:uppercase;letter-spacing:.06em}',
        '.std-vh-save-btn,.std-vh-back-btn{background:rgba(139,92,246,.18);border:1px solid rgba(139,92,246,.35);color:#c8c2f0;font-size:.75rem;padding:4px 10px;border-radius:20px;cursor:pointer;transition:background .15s;white-space:nowrap}',
        '.std-vh-save-btn:hover,.std-vh-back-btn:hover{background:rgba(139,92,246,.35)}',
        /* list of Q&A pairs */
        '.std-vh-pairs-list{overflow-y:auto;flex:1;padding:8px 10px 12px}',
        '.std-vh-pair{padding:8px 10px;border-radius:9px;margin-bottom:8px;background:rgba(139,92,246,.07);border:1px solid rgba(139,92,246,.18);cursor:pointer;transition:background .15s}',
        '.std-vh-pair:hover{background:rgba(139,92,246,.18);border-color:rgba(139,92,246,.45)}',
        '.std-vh-pair-q{font-size:.78rem;color:#818cf8;font-weight:600;margin-bottom:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '.std-vh-pair-a{font-size:.76rem;color:#9d98c0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        /* detail view */
        '.std-vh-detail{padding:12px 12px 16px;overflow-y:auto;flex:1}',
        '.std-vh-detail-q{font-size:.8rem;color:#818cf8;font-weight:600;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid rgba(139,92,246,.2)}',
        '.std-vh-detail-a{font-size:.85rem;color:#d4cfee;line-height:1.7;word-break:break-word}',
        '.std-vh-detail-a p{margin:0 0 8px}',
        '.std-vh-detail-a .katex-display{overflow-x:auto;padding:4px 0}',
        '.std-vh-empty{color:#6b6a8c;font-size:.8rem;text-align:center;padding:24px 0}',

        /* ── STREAMING CURSOR ── */
        '.std-stream-cursor{display:inline-block;animation:std-blink .65s step-end infinite;color:#8b5cf6;font-weight:900;margin-left:1px}',
        '@keyframes std-blink{0%,100%{opacity:1}50%{opacity:0}}',

        /* ── MOBILE: full-width ── */
        '@media(max-width:480px){#std-summon-overlay{width:100vw!important}#std-summon-fab{bottom:14px!important;right:14px!important}}',
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
        /* Header bar: history btn · orb · state label · close */
        '<div id="std-summon-header">',
          '<button id="std-vh-btn" title="Conversation history">&#9776;</button>',
          '<div id="std-summon-big-orb"><span>✦</span></div>',
          '<div id="std-summon-state-txt">XZILY AI</div>',
          '<button id="std-summon-close">&#x2715;</button>',
        '</div>',
        /* History dropdown (full-width, sits below header) */
        '<div id="std-vh-panel" style="display:none"></div>',
        /* Scrollable AI response area */
        '<div id="std-summon-ai-text"></div>',
        /* "You said" strip */
        '<div id="std-summon-transcript"></div>',
        /* Type input row */
        '<div id="std-summon-input-row">',
          '<input id="std-summon-text" type="text" placeholder="' + (_IS_MOBILE_APP ? 'Type your question…' : 'Or type here…') + '" autocomplete="off">',
          '<button id="std-summon-send">&#x27A4;</button>',
          '<button id="std-summon-mic-btn" title="Speak">🎤</button>',
        '</div>',
    ].join('');
    document.body.appendChild(overlay);
    document.getElementById('std-summon-close').addEventListener('click', summonHide);
    document.getElementById('std-vh-btn').addEventListener('click', vhToggle);
    document.getElementById('std-summon-send').addEventListener('click', summonSendText);
    document.getElementById('std-summon-text').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') summonSendText();
    });
    document.getElementById('std-summon-mic-btn').addEventListener('click', summonMicToggle);
}

/* ── MIC RECORDING + GROQ WHISPER STT ───────────────────────── */
function summonMicToggle() {
    if (_MIC_STATE.active) {
        summonMicStop();
    } else {
        summonMicStart();
    }
}

function summonMicStart() {
    /* Immediately stop any ongoing AI speech and abort any streaming fetch */
    summonStopQueue();
    _summonAbortStream();

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        summonSetTranscript('Microphone not supported on this device.');
        return;
    }

    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function (stream) {
            _MIC_STATE.stream  = stream;
            _MIC_STATE.chunks  = [];
            _MIC_STATE.active  = true;

            /* Pick best supported MIME type */
            var mimeType = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg'].find(function(m){
                try { return MediaRecorder.isTypeSupported(m); } catch(e) { return false; }
            }) || '';

            try {
                _MIC_STATE.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType: mimeType } : {});
            } catch(e) {
                _MIC_STATE.mediaRecorder = new MediaRecorder(stream);
            }

            _MIC_STATE.mediaRecorder.ondataavailable = function (e) {
                if (e.data && e.data.size > 0) _MIC_STATE.chunks.push(e.data);
            };
            _MIC_STATE.mediaRecorder.onstop = function () {
                summonMicTranscribe();
            };

            _MIC_STATE.mediaRecorder.start(200); /* 200ms chunks */

            /* UI feedback */
            var btn = document.getElementById('std-summon-mic-btn');
            if (btn) { btn.textContent = '⏹'; btn.classList.add('recording'); }
            summonSetState('listening');
            summonSetTranscript('🔴 Recording… tap ⏹ to send');

            /* Auto-stop after 30 s to prevent infinite recording */
            _MIC_STATE._autoStop = setTimeout(function () {
                if (_MIC_STATE.active) summonMicStop();
            }, 30000);
        })
        .catch(function (err) {
            var msg = err.name === 'NotAllowedError'
                ? '🚫 Mic permission denied. Allow microphone access in Settings.'
                : '❌ Could not start mic: ' + (err.message || err.name);
            summonSetTranscript(msg);
        });
}

function summonMicStop() {
    if (!_MIC_STATE.active) return;
    _MIC_STATE.active = false;
    clearTimeout(_MIC_STATE._autoStop);

    if (_MIC_STATE.mediaRecorder && _MIC_STATE.mediaRecorder.state !== 'inactive') {
        try { _MIC_STATE.mediaRecorder.stop(); } catch(e) {}
    }
    if (_MIC_STATE.stream) {
        _MIC_STATE.stream.getTracks().forEach(function (t) { try { t.stop(); } catch(e) {} });
        _MIC_STATE.stream = null;
    }

    var btn = document.getElementById('std-summon-mic-btn');
    if (btn) { btn.textContent = '🎤'; btn.classList.remove('recording'); }
    summonSetTranscript('Processing…');
}

function summonMicTranscribe() {
    if (!_MIC_STATE.chunks.length) {
        summonSetTranscript('No audio captured. Please try again.');
        summonSetState('listening');
        return;
    }

    var mimeType = (_MIC_STATE.mediaRecorder && _MIC_STATE.mediaRecorder.mimeType)
        ? _MIC_STATE.mediaRecorder.mimeType.split(';')[0]
        : 'audio/webm';

    var blob = new Blob(_MIC_STATE.chunks, { type: mimeType });
    _MIC_STATE.chunks = [];

    /* Derive file extension */
    var ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';

    var key = (typeof window.getGroqKey === 'function') ? window.getGroqKey() : null;
    if (!key) {
        summonSetTranscript('❌ No API key found. Type your question instead.');
        summonSetState('listening');
        return;
    }

    summonSetTranscript('Transcribing…');
    summonSetState('thinking');

    var formData = new FormData();
    formData.append('file', blob, 'voice.' + ext);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');
    formData.append('language', 'en');

    fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key },
        body: formData
    })
    .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
    })
    .then(function (data) {
        var transcript = (data.text || '').trim();
        if (!transcript) {
            summonSetTranscript('⚠️ No speech detected. Try speaking again.');
            summonSetState('listening');
            return;
        }
        summonSetTranscript('You: ' + transcript);
        /* Fill the text box too so user can edit before sending */
        var inp = document.getElementById('std-summon-text');
        if (inp) { inp.value = transcript; }
        /* Send directly to the AI */
        summonHandleQuery(transcript);
    })
    .catch(function (err) {
        summonSetTranscript('❌ Transcription error: ' + (err.message || 'unknown') + '. Type your question instead.');
        summonSetState('listening');
    });
}

/* ── OVERLAY CONTROLS ────────────────────────────────────────── */
function summonSetState(state) {
    var overlay = document.getElementById('std-summon-overlay');
    var txt     = document.getElementById('std-summon-state-txt');
    if (!overlay) return;
    overlay.setAttribute('data-state', state);
    var labels = _IS_MOBILE_APP
        ? {idle:'XZILY AI', listening:'Type your question ↓', thinking:'Thinking…', speaking:'Speaking…'}
        : {idle:'XZILY AI', listening:'Listening…', thinking:'Thinking…', speaking:'Speaking…'};
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
    var displayName = VS.userName ? ', ' + VS.userName : '';
    var greeting = S.title
        ? 'Welcome back' + displayName + '! We are studying "' + S.title + '". Ask me anything or say "teach me" and I will start from the beginning!'
        : 'Welcome back' + displayName + '! I am your personal AI tutor. What would you like to learn today?';
    summonSetAiText(greeting);
    summonSpeak(greeting, function () {
        summonSetAiText(''); summonSetState('listening');
        if (!_IS_MOBILE_APP) summonStartListening();
    });
}

function summonSetTranscript(text) {
    /* Shows what the user just said as a small "You said:" strip */
    var el = document.getElementById('std-summon-transcript');
    if (el) el.textContent = text ? '🎙 You: ' + text : '';
}

function summonSetAiText(text) {
    /* Renders AI text with paragraph formatting + KaTeX math */
    var el = document.getElementById('std-summon-ai-text');
    if (!el) return;
    if (!text) { el.innerHTML = ''; return; }
    /* Convert line breaks to paragraphs */
    var html = text
        .split(/\n\n+/)
        .map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; })
        .join('');
    el.innerHTML = html;
    /* Render KaTeX math if available */
    if (typeof renderMathInElement === 'function') {
        try {
            renderMathInElement(el, {
                delimiters: [
                    {left:'$$', right:'$$', display:true},
                    {left:'$',  right:'$',  display:false}
                ],
                throwOnError: false
            });
        } catch(e) {}
    }
    /* Auto-scroll to bottom so latest text is visible */
    el.scrollTop = el.scrollHeight;
}

function summonHide() {
    VS.active = false;
    summonStopListening(); summonStopQueue();
    var overlay = document.getElementById('std-summon-overlay');
    if (overlay) overlay.classList.remove('open');
    summonSetState('idle');
}

/* ── VOICE CONVERSATION HISTORY ─────────────────────────────── */
var VH = { log: [], detailIdx: -1 };

function vhAdd(role, text) {
    VH.log.push({ role: role, text: text, time: new Date() });
    if (VH.log.length > 60) VH.log = VH.log.slice(-60);
    vhRenderDropdown();
}

/* Group the flat log into Q&A pairs */
function vhGetPairs() {
    var pairs = [], i = 0;
    while (i < VH.log.length) {
        if (VH.log[i].role === 'user') {
            var pair = { user: VH.log[i], ai: null };
            if (i + 1 < VH.log.length && VH.log[i + 1].role === 'ai') {
                pair.ai = VH.log[i + 1]; i += 2;
            } else { i++; }
            pairs.push(pair);
        } else { i++; }
    }
    return pairs;
}

function vhRenderDropdown() {
    var panel = document.getElementById('std-vh-panel');
    if (!panel || panel.style.display === 'none') return;
    if (VH.detailIdx >= 0) { vhRenderDetail(VH.detailIdx); return; }

    var pairs = vhGetPairs();
    var rows = pairs.length ? pairs.map(function (p, idx) {
        var qShort = esc(p.user.text.slice(0, 70));
        var aShort = p.ai ? esc(p.ai.text.slice(0, 80)) : '…';
        return '<div class="std-vh-pair" data-idx="' + idx + '">' +
               '<div class="std-vh-pair-q">🎙 ' + qShort + '</div>' +
               '<div class="std-vh-pair-a">✦ ' + aShort + '</div>' +
               '</div>';
    }).join('') : '<div class="std-vh-empty">No conversation yet — start talking!</div>';

    panel.innerHTML =
        '<div class="std-vh-toolbar">' +
          '<span class="std-vh-toolbar-title">📚 History</span>' +
          '<button class="std-vh-save-btn" id="std-vh-save">⬇ Save</button>' +
        '</div>' +
        '<div class="std-vh-pairs-list">' + rows + '</div>';

    var saveBtn = document.getElementById('std-vh-save');
    if (saveBtn) saveBtn.addEventListener('click', vhSaveHistory);

    panel.querySelectorAll('.std-vh-pair').forEach(function (el) {
        el.addEventListener('click', function () {
            VH.detailIdx = parseInt(el.getAttribute('data-idx'), 10);
            vhRenderDetail(VH.detailIdx);
        });
    });
}

function vhRenderDetail(idx) {
    var panel = document.getElementById('std-vh-panel');
    if (!panel) return;
    var pairs = vhGetPairs();
    var pair  = pairs[idx];
    if (!pair) { VH.detailIdx = -1; vhRenderDropdown(); return; }

    var aiHtml = '';
    if (pair.ai) {
        var html = pair.ai.text
            .split(/\n\n+/)
            .map(function (p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; })
            .join('');
        aiHtml = '<div class="std-vh-detail-a" id="std-vh-detail-body">' + html + '</div>';
    }

    panel.innerHTML =
        '<div class="std-vh-toolbar">' +
          '<button class="std-vh-back-btn" id="std-vh-back">← Back</button>' +
          '<span class="std-vh-toolbar-title">Full Response</span>' +
        '</div>' +
        '<div class="std-vh-detail">' +
          '<div class="std-vh-detail-q">🎙 You: ' + esc(pair.user.text) + '</div>' +
          aiHtml +
        '</div>';

    var backBtn = document.getElementById('std-vh-back');
    if (backBtn) backBtn.addEventListener('click', function () { VH.detailIdx = -1; vhRenderDropdown(); });

    /* Render KaTeX math in the detail view */
    var body = document.getElementById('std-vh-detail-body');
    if (body && typeof renderMathInElement === 'function') {
        try {
            renderMathInElement(body, {
                delimiters: [
                    {left:'$$', right:'$$', display:true},
                    {left:'$',  right:'$',  display:false}
                ],
                throwOnError: false
            });
        } catch(e) {}
    }
}

function vhSaveHistory() {
    var pairs = vhGetPairs();
    if (!pairs.length) return;
    var lines = pairs.map(function (p, i) {
        return 'Q' + (i + 1) + ': ' + p.user.text + '\n\nAI: ' + (p.ai ? p.ai.text : '(no response)') + '\n\n---\n';
    });
    var blob = new Blob(['XZILY AI — Study Conversation\n\n' + lines.join('\n')], { type: 'text/plain' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'xzily-study-history.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

function vhToggle() {
    var panel = document.getElementById('std-vh-panel');
    var btn   = document.getElementById('std-vh-btn');
    if (!panel) return;
    var open = panel.style.display !== 'none';
    if (open) {
        panel.style.display = 'none';
        VH.detailIdx = -1;
    } else {
        panel.style.display = 'flex';
        vhRenderDropdown();
    }
    if (btn) btn.classList.toggle('active', !open);
}

/* ══════════════════════════════════════════════════════════════
   STUDY PAGE — AI TUTOR VOICE CHAT PANEL  (#std-voice-panel)
   ══════════════════════════════════════════════════════════════ */

var VP = { speaking: false, _currentAudio: null };
var _VP_MIC = { active: false, mediaRecorder: null, chunks: [], stream: null, _autoStop: null };

function stdVoiceInit() {
    var sendBtn  = document.getElementById('std-voice-send-btn');
    var closeBtn = document.getElementById('std-voice-close-btn');
    var stopBtn  = document.getElementById('std-voice-stop-btn');
    var micBtn   = document.getElementById('std-voice-mic-btn');
    var inp      = document.getElementById('std-voice-text-input');

    if (sendBtn)  sendBtn.addEventListener('click', stdVoiceSend);
    if (closeBtn) closeBtn.addEventListener('click', stdVoiceClose);
    if (stopBtn)  stopBtn.addEventListener('click', stdVoiceStopSpeak);
    if (micBtn)   micBtn.addEventListener('click', stdVoiceMicToggle);
    if (inp) inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); stdVoiceSend(); }
    });
}

function stdVoiceOpen() {
    var panel = document.getElementById('std-voice-panel');
    if (!panel) return;
    panel.style.display = 'flex';

    /* Unlock / create AudioContext on this user-gesture tap */
    try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (AC) {
            if (!window._aqsAudioCtx) window._aqsAudioCtx = new AC();
            if (window._aqsAudioCtx.state === 'suspended') window._aqsAudioCtx.resume();
        }
    } catch (e) {}

    var msgs = document.getElementById('std-voice-msgs');
    if (msgs && !msgs.children.length) {
        var topicName = (S && S.title) ? S.title : 'your topic';
        var greeting = 'Hello! I\'m your AI tutor for "' + topicName + '". Ask me anything about what you\'re studying!';
        stdVoiceAddMsg('ai', greeting);
        stdVoiceSpeak(greeting);
    }
    setTimeout(function () {
        var inp = document.getElementById('std-voice-text-input');
        if (inp) inp.focus();
    }, 150);
}

function stdVoiceClose() {
    var panel = document.getElementById('std-voice-panel');
    if (panel) panel.style.display = 'none';
    stdVoiceStopSpeak();
}

function stdVoiceAddMsg(role, text) {
    var msgs = document.getElementById('std-voice-msgs');
    if (!msgs) return;
    var wrap   = document.createElement('div');
    wrap.className = 'std-vmsg ' + (role === 'user' ? 'std-vmsg-user' : 'std-vmsg-ai');
    var bubble = document.createElement('div');
    bubble.className = 'std-vbubble' + (text === '…' ? ' std-vtyping' : '');
    bubble.textContent = text;
    wrap.appendChild(bubble);
    msgs.appendChild(wrap);
    msgs.scrollTop = msgs.scrollHeight;
    return wrap;
}

async function stdVoiceSend() {
    var inp = document.getElementById('std-voice-text-input');
    if (!inp) return;
    var text = (inp.value || '').trim();
    if (!text) return;
    inp.value = '';

    stdVoiceAddMsg('user', text);
    stdVoiceStopSpeak();

    var thinkingEl = stdVoiceAddMsg('ai', '…');

    try {
        var context = '';
        if (S && S.title)           context += 'The student is studying: ' + S.title + '.\n';
        if (S && S.uploadedContent) context += 'Study material excerpt:\n' + S.uploadedContent.slice(0, 3000) + '\n';

        var sysMsg = 'You are a warm, encouraging AI tutor. ' + context +
                     'Answer the student\'s question clearly and concisely. ' +
                     'Keep answers under 80 words so they are easy to hear.';

        var reply = await aiChat([
            { role: 'system', content: sysMsg },
            { role: 'user',   content: text }
        ], 0.7);

        var msgs = document.getElementById('std-voice-msgs');
        if (thinkingEl && thinkingEl.parentNode === msgs) msgs.removeChild(thinkingEl);

        var clean = (reply || '').replace(/```[\s\S]*?```/g, '').replace(/[*_`#~>]/g, '').trim();
        stdVoiceAddMsg('ai', clean);
        stdVoiceSpeak(clean);
    } catch (e) {
        var msgs2 = document.getElementById('std-voice-msgs');
        if (thinkingEl && msgs2 && thinkingEl.parentNode === msgs2) msgs2.removeChild(thinkingEl);
        stdVoiceAddMsg('ai', 'Sorry, I could not get a response right now. Please try again.');
    }
}

function stdVoiceSpeak(text) {
    stdVoiceStopSpeak();
    var stopBtn = document.getElementById('std-voice-stop-btn');
    if (stopBtn) stopBtn.style.display = 'inline-flex';
    VP.speaking = true;

    var onDone = function () {
        VP.speaking = false;
        VP._currentAudio = null;
        if (stopBtn) stopBtn.style.display = 'none';
    };

    /* AudioContext path — bypasses Android autoplay block */
    var ctx = window._aqsAudioCtx;
    if (ctx) {
        if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
        var chunk = text.slice(0, 280);
        var url = 'https://audio.pollinations.ai/' + encodeURIComponent(chunk) +
                  '?model=openai-audio&voice=nova&seed=42';
        fetch(url)
            .then(function (r) { return r.arrayBuffer(); })
            .then(function (buf) { return ctx.decodeAudioData(buf); })
            .then(function (decoded) {
                if (!VP.speaking) { onDone(); return; }
                var src = ctx.createBufferSource();
                src.buffer = decoded;
                src.connect(ctx.destination);
                VP._currentAudio = src;
                src.onended = onDone;
                src.start(0);
            })
            .catch(function () { stdVoiceSpeakSynth(text, onDone); });
        return;
    }

    /* Fallback: Web Speech API */
    stdVoiceSpeakSynth(text, onDone);
}

function stdVoiceSpeakSynth(text, onDone) {
    var synth = window.speechSynthesis;
    if (!synth) { if (onDone) onDone(); return; }
    synth.cancel();
    var u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1.0; u.volume = 1.0;
    var voices = synth.getVoices();
    var en = voices.find(function (v) { return v.lang && v.lang.startsWith('en'); });
    if (en) u.voice = en;
    u.onend   = onDone || function () {};
    u.onerror = onDone || function () {};
    VP._currentAudio = { stop: function () { synth.cancel(); } };
    synth.speak(u);
}

function stdVoiceStopSpeak() {
    VP.speaking = false;
    if (VP._currentAudio) {
        try {
            if (typeof VP._currentAudio.stop  === 'function') VP._currentAudio.stop();
            else if (typeof VP._currentAudio.pause === 'function') { VP._currentAudio.pause(); VP._currentAudio.src = ''; }
        } catch (e) {}
        VP._currentAudio = null;
    }
    if (window.speechSynthesis) { try { window.speechSynthesis.cancel(); } catch (e) {} }
    var stopBtn = document.getElementById('std-voice-stop-btn');
    if (stopBtn) stopBtn.style.display = 'none';
}

/* ── Microphone / Whisper ─────────────────────────────────── */
function stdVoiceMicToggle() {
    if (_VP_MIC.active) stdVoiceMicStop(); else stdVoiceMicStart();
}

function stdVoiceMicStart() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        stdVoiceAddMsg('ai', 'Microphone not supported on this device.');
        return;
    }
    navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        .then(function (stream) {
            _VP_MIC.stream  = stream;
            _VP_MIC.chunks  = [];
            _VP_MIC.active  = true;

            var mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']
                .find(function (m) { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
            try {
                _VP_MIC.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType: mimeType } : {});
            } catch (e) {
                _VP_MIC.mediaRecorder = new MediaRecorder(stream);
            }
            _VP_MIC.mediaRecorder.ondataavailable = function (e) {
                if (e.data && e.data.size > 0) _VP_MIC.chunks.push(e.data);
            };
            _VP_MIC.mediaRecorder.onstop = function () { stdVoiceMicTranscribe(); };
            _VP_MIC.mediaRecorder.start(200);

            var btn = document.getElementById('std-voice-mic-btn');
            if (btn) { btn.textContent = '⏹ Stop'; btn.classList.add('active'); }

            _VP_MIC._autoStop = setTimeout(function () {
                if (_VP_MIC.active) stdVoiceMicStop();
            }, 30000);
        })
        .catch(function (err) {
            var msg = err.name === 'NotAllowedError'
                ? 'Microphone permission denied. Please allow mic access in settings.'
                : 'Could not start mic: ' + (err.message || err.name);
            stdVoiceAddMsg('ai', msg);
        });
}

function stdVoiceMicStop() {
    if (!_VP_MIC.active) return;
    _VP_MIC.active = false;
    clearTimeout(_VP_MIC._autoStop);
    if (_VP_MIC.mediaRecorder && _VP_MIC.mediaRecorder.state !== 'inactive') {
        try { _VP_MIC.mediaRecorder.stop(); } catch (e) {}
    }
    if (_VP_MIC.stream) {
        _VP_MIC.stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        _VP_MIC.stream = null;
    }
    var btn = document.getElementById('std-voice-mic-btn');
    if (btn) { btn.textContent = '🎤 Speak'; btn.classList.remove('active'); }
}

function stdVoiceMicTranscribe() {
    if (!_VP_MIC.chunks.length) return;
    var mimeType = (_VP_MIC.mediaRecorder && _VP_MIC.mediaRecorder.mimeType)
        ? _VP_MIC.mediaRecorder.mimeType.split(';')[0] : 'audio/webm';
    var blob = new Blob(_VP_MIC.chunks, { type: mimeType });
    _VP_MIC.chunks = [];
    var ext = mimeType.includes('mp4') ? 'mp4' : mimeType.includes('ogg') ? 'ogg' : 'webm';

    var key = (typeof window.getGroqKey === 'function') ? window.getGroqKey() : null;
    if (!key) {
        stdVoiceAddMsg('ai', 'No API key available. Type your question instead.');
        return;
    }

    var thinkEl = stdVoiceAddMsg('ai', 'Transcribing…');

    var formData = new FormData();
    formData.append('file', blob, 'voice.' + ext);
    formData.append('model', 'whisper-large-v3-turbo');
    formData.append('response_format', 'json');

    fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + key },
        body: formData
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
        var msgs = document.getElementById('std-voice-msgs');
        if (thinkEl && msgs && thinkEl.parentNode === msgs) msgs.removeChild(thinkEl);
        var transcript = (d.text || '').trim();
        if (!transcript) { stdVoiceAddMsg('ai', 'No speech detected. Try again.'); return; }
        var inp = document.getElementById('std-voice-text-input');
        if (inp) inp.value = transcript;
        stdVoiceSend();
    })
    .catch(function () {
        stdVoiceAddMsg('ai', 'Transcription failed. Type your question instead.');
    });
}

/* ── EXPOSE INTERNALS NEEDED BY INLINE onclick HANDLERS ─────── */
/* FIX: functions inside an IIFE are not global — expose only what onclick HTML needs */
window._stdRetry = loadChapterContent;

})();
