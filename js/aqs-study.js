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

/* Streams a Groq response word-by-word directly into the AI panel */
async function streamToPanel(panelTitle, messages, temp) {
      showAIPanel(panelTitle, 'Generating…', null);
      var bE = document.getElementById('std-ai-panel-body');
      if (!bE) return;

      function showPanelError(msg, retryFn) {
          var bErr = document.getElementById('std-ai-panel-body');
          if (!bErr) return;
          bErr.innerHTML =
              '<div style="text-align:center;padding:24px 16px">' +
              '<div style="font-size:2rem;margin-bottom:8px">⚠️</div>' +
              '<p style="color:#ef4444;font-weight:600;margin:0 0 14px">' + msg + '</p>' +
              '<button id="std-panel-retry-btn" class="std-btn std-btn-primary" style="font-size:.85rem">🔄 Try Again</button>' +
              '</div>';
          var rb = document.getElementById('std-panel-retry-btn');
          if (rb && retryFn) rb.addEventListener('click', retryFn);
      }

      var GROQ_STREAM_URL = 'https://api.groq.com/openai/v1/chat/completions';
      var key = (typeof window.getGroqKey === 'function') ? window.getGroqKey() : null;

      if (key) {
          try {
              var res = await fetch(GROQ_STREAM_URL, {
                  method: 'POST',
                  headers: {'Content-Type':'application/json','Authorization':'Bearer ' + key},
                  body: JSON.stringify({model:GROQ_MODEL, messages:messages, temperature:temp||0.7, max_tokens:2000, stream:true}),
                  signal: AbortSignal.timeout(30000)
              });
              if (res.ok) {
                  var reader = res.body.getReader(), decoder = new TextDecoder(), full = '';
                  bE.innerHTML = '<div class="std-stream-body"></div>';
                  var bodyDiv = bE.querySelector('.std-stream-body');
                  while (true) {
                      var chunk = await reader.read();
                      if (chunk.done) break;
                      var lines = decoder.decode(chunk.value, {stream:true}).split('
');
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
          } catch(e) { /* fall through to non-streaming */ }
      }

      /* non-streaming fallback */
      try {
          var txt = await aiChat(messages, temp);
          var bE2 = document.getElementById('std-ai-panel-body');
          if (bE2) { bE2.innerHTML = renderParagraphs(txt); setTimeout(function () { renderMath(bE2); }, 80); }
          var p2 = document.getElementById('std-ai-panel');
          if (p2 && p2.scrollIntoView) p2.scrollIntoView({behavior:'smooth', block:'start'});
      } catch(e) {
          var _retryMsg = messages, _retryTemp = temp, _retryTitle = panelTitle;
          showPanelError(
              'Could not load — check your internet connection.',
              function () { streamToPanel(_retryTitle, _retryMsg, _retryTemp); }
          );
      }
  }

  
async function doSummarise() {
      if (!S.title)       { showErr('Search a topic first.'); return; }
      if (S.activeIdx < 0){ showErr('Select a chapter first.'); return; }
      var ch = S.chapters[S.activeIdx], content = S.cache[S.activeIdx] || '';
      streamToPanel('📝 Summary — ' + ch.title, [
          {role:'system', content:'You are an expert tutor. Create clear summaries. Use $...$ for inline math and $...$ for block math.'},
          {role:'user', content:'Summarise "' + ch.title + '" from "' + S.title + '"' + (content?' using:
'+content.slice(0,3000):'') + '

1. Key concepts (bullet points)
2. Main takeaways (2-3 sentences)
3. Important formulas or definitions

Use LaTeX math where relevant.'}
      ], 0.6);
  }

  
async function doExplain() {
      if (!S.title)       { showErr('Search a topic first.'); return; }
      if (S.activeIdx < 0){ showErr('Select a chapter first.'); return; }
      var ch = S.chapters[S.activeIdx], content = S.cache[S.activeIdx] || '';
      streamToPanel('💡 Explanation — ' + ch.title, [
          {role:'system', content:'You are an expert tutor. Write detailed explanations. Use $...$ inline math and $...$ for display math.'},
          {role:'user', content:'Write a comprehensive explanation of "' + ch.title + '" from "' + S.title + '".
' + (content?'Reference:
'+content.slice(0,2500)+'

':'') + 'Include:
1. Clear breakdown of complex ideas
2. Real-world analogies and examples
3. Why and how, not just what
4. Common misconceptions
5. All relevant math with LaTeX

Write 400-600 words.'}
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

  /* Timer state — lives outside openTest so renderTestQ + handleAnswer can reach it */
  var _testTimer = null, _testSecondsLeft = 0, _testTotalSecs = 0;

  function _clearTestTimer() {
      if (_testTimer) { clearInterval(_testTimer); _testTimer = null; }
  }

  function _updateTimerDisplay() {
      var el = document.getElementById('std-test-timer');
      if (!el) { _clearTestTimer(); return; }
      var m = Math.floor(_testSecondsLeft / 60);
      var s = _testSecondsLeft % 60;
      el.textContent = '⏱ ' + m + ':' + (s < 10 ? '0' : '') + s;
      /* Turn red when < 30 s remain */
      el.style.color = _testSecondsLeft < 30 ? '#ef4444' : '';
      el.style.fontWeight = _testSecondsLeft < 30 ? '700' : '';
  }

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
      _clearTestTimer();

      /* ── Step 1: Show setup dialog ── */
      modal.style.display = 'flex';
      modal.innerHTML =
          '<div class="std-test-inner" style="overflow-y:auto;max-height:90vh;padding:28px 20px">' +
          '<h2 style="margin:0 0 4px;font-size:1.2rem;font-weight:700">🎯 Practice Test Setup</h2>' +
          '<p style="margin:0 0 22px;font-size:.85rem;color:#6b7280">Chapter: <strong>' + esc(ch.title) + '</strong></p>' +

          '<div style="margin-bottom:20px">' +
          '<label style="display:block;font-weight:600;margin-bottom:8px;font-size:.9rem">Number of questions</label>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          ['5','10','15','20'].map(function(n) {
              return '<button class="std-test-setup-btn" data-numq="' + n + '" style="flex:1;min-width:56px;padding:10px 0;border-radius:8px;border:2px solid #e5e7eb;background:#fff;font-weight:600;cursor:pointer;font-size:1rem">' + n + '</button>';
          }).join('') +
          '</div></div>' +

          '<div style="margin-bottom:28px">' +
          '<label style="display:block;font-weight:600;margin-bottom:8px;font-size:.9rem">Time limit</label>' +
          '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
          [['No limit','0'],['5 min','300'],['10 min','600'],['15 min','900'],['30 min','1800']].map(function(t) {
              return '<button class="std-test-setup-btn" data-secs="' + t[1] + '" style="flex:1;min-width:70px;padding:10px 0;border-radius:8px;border:2px solid #e5e7eb;background:#fff;font-weight:600;cursor:pointer;font-size:.85rem">' + t[0] + '</button>';
          }).join('') +
          '</div></div>' +

          '<div style="display:flex;gap:10px">' +
          '<button id="std-test-start-btn" class="std-btn std-btn-primary" style="flex:1;opacity:.5;pointer-events:none" disabled>Start Test →</button>' +
          '<button class="std-btn std-btn-ghost" onclick="document.getElementById('std-test-modal').style.display='none'">Cancel</button>' +
          '</div></div>';

      /* Selection state */
      var selNumQ = 0, selSecs = -1;

      function refreshStart() {
          var btn = document.getElementById('std-test-start-btn');
          if (!btn) return;
          var ready = selNumQ > 0 && selSecs >= 0;
          btn.disabled = !ready;
          btn.style.opacity = ready ? '1' : '.5';
          btn.style.pointerEvents = ready ? '' : 'none';
      }

      modal.querySelectorAll('.std-test-setup-btn[data-numq]').forEach(function(b) {
          b.addEventListener('click', function() {
              modal.querySelectorAll('.std-test-setup-btn[data-numq]').forEach(function(x) {
                  x.style.borderColor = '#e5e7eb'; x.style.background = '#fff'; x.style.color = '';
              });
              b.style.borderColor = '#7c3aed'; b.style.background = '#7c3aed'; b.style.color = '#fff';
              selNumQ = parseInt(b.dataset.numq);
              refreshStart();
          });
      });

      modal.querySelectorAll('.std-test-setup-btn[data-secs]').forEach(function(b) {
          b.addEventListener('click', function() {
              modal.querySelectorAll('.std-test-setup-btn[data-secs]').forEach(function(x) {
                  x.style.borderColor = '#e5e7eb'; x.style.background = '#fff'; x.style.color = '';
              });
              b.style.borderColor = '#7c3aed'; b.style.background = '#7c3aed'; b.style.color = '#fff';
              selSecs = parseInt(b.dataset.secs);
              refreshStart();
          });
      });

      document.getElementById('std-test-start-btn').addEventListener('click', function() {
          _generateTest(ch, content, selNumQ, selSecs);
      });
  }

  async function _generateTest(ch, content, numQ, timeSecs) {
      var modal = document.getElementById('std-test-modal');
      if (!modal) return;
      modal.innerHTML =
          '<div class="std-test-inner"><div class="std-test-loading"><div class="std-spinner lg"></div>' +
          '<h3>🤖 Generating ' + numQ + ' Practice Questions</h3>' +
          '<p>Chapter: <strong>' + esc(ch.title) + '</strong></p>' +
          '<div class="std-test-load-sub">Using Groq AI — please wait…</div></div></div>';

      /* Robust JSON extraction */
      function extractQs(raw) {
          if (!raw) return null;
          var s = raw.replace(/```jsons*/gi, '').replace(/```s*/gi, '').trim();
          var start = s.indexOf('['), end = s.lastIndexOf(']');
          if (start === -1 || end === -1 || end <= start) return null;
          try {
              var arr = JSON.parse(s.slice(start, end + 1));
              if (!Array.isArray(arr) || arr.length < 2) return null;
              return arr.filter(function(q) {
                  return q && q.q && Array.isArray(q.opts) && q.opts.length >= 2;
              }).map(function(q) {
                  return {
                      q: String(q.q),
                      opts: q.opts.slice(0, 4).map(String),
                      ans: Math.max(0, Math.min(parseInt(q.ans) || 0, q.opts.length - 1)),
                      exp: String(q.exp || '')
                  };
              });
          } catch(e) { return null; }
      }

      var snippet = content ? content.slice(0, 3000) : '';
      var sysMsg  = 'You are an exam question generator. Output ONLY a raw JSON array — no markdown fences, no explanation, no text before or after the array.';
      var userMsg = 'Generate ' + numQ + ' multiple-choice questions about "' + ch.title + '" from the subject "' + (S.title||ch.title) + '".' +
          (snippet ? '
Use this material:
' + snippet : '') +
          '

Output ONLY a JSON array in this exact format:
' +
          '[{"q":"Full question","opts":["Option A","Option B","Option C","Option D"],"ans":0,"exp":"Short explanation"}]' +
          '

Rules: ans is the 0-based index of the correct option. Mix easy and hard. Use LaTeX ($...$) for any maths.';

      var qStr;
      try { qStr = await aiChat([{role:'system',content:sysMsg},{role:'user',content:userMsg}], 0.3); }
      catch(e) {
          if (!modal) return;
          modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Failed to Generate Questions</h3><p>' + esc(e.message) + '</p><button onclick="openTest()" class="std-btn std-btn-primary" style="margin-right:8px">← Back</button><button onclick="document.getElementById('std-test-modal').style.display='none'" class="std-btn std-btn-ghost">Close</button></div></div>';
          return;
      }

      var qs = extractQs(qStr);

      /* single retry with simpler prompt */
      if (!qs) {
          try {
              var r2 = await aiChat([
                  {role:'system', content:'Output ONLY a JSON array, no markdown.'},
                  {role:'user',   content:numQ + ' multiple-choice questions about "' + ch.title + '".
[{"q":"...","opts":["A","B","C","D"],"ans":0,"exp":"..."}]'}
              ], 0.2);
              qs = extractQs(r2);
          } catch(e2) {}
      }

      if (!qs || !qs.length) {
          modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:3rem">❌</div><h3>Could Not Generate Questions</h3><p>The AI returned an unexpected format. Please try again.</p><button onclick="openTest()" class="std-btn std-btn-primary" style="margin-right:8px">← Back</button><button onclick="document.getElementById('std-test-modal').style.display='none'" class="std-btn std-btn-ghost">Close</button></div></div>';
          return;
      }

      S.testQ = qs; S.testAns = new Array(qs.length).fill(-1);

      /* Start timer if user selected one */
      _clearTestTimer();
      if (timeSecs > 0) {
          _testSecondsLeft = timeSecs;
          _testTotalSecs   = timeSecs;
          _testTimer = setInterval(function() {
              _testSecondsLeft--;
              _updateTimerDisplay();
              if (_testSecondsLeft <= 0) {
                  _clearTestTimer();
                  showTestResults();
              }
          }, 1000);
      } else {
          _testSecondsLeft = 0;
          _testTotalSecs   = 0;
      }

      renderTestQ(0);
  }

  
function renderTestQ(idx) {
      var q = S.testQ[idx]; if (!q) { showTestResults(); return; }
      var modal = document.getElementById('std-test-modal'); if (!modal) return;
      var prog = Math.round((idx / S.testQ.length) * 100);
      var timerHtml = (_testTotalSecs > 0)
          ? '<div id="std-test-timer" style="font-size:.85rem;padding:3px 10px;background:#f3f4f6;border-radius:20px;white-space:nowrap">⏱ Loading…</div>'
          : '';
      modal.innerHTML =
          '<div class="std-test-inner">' +
          '<div class="std-test-header" style="display:flex;align-items:center;gap:10px">' +
          '<div style="flex:1"><div class="std-test-prog-bar"><div class="std-test-prog-fill" style="width:' + prog + '%"></div></div>' +
          '<div class="std-test-meta">Question ' + (idx+1) + ' of ' + S.testQ.length + '</div></div>' +
          timerHtml +
          '</div>' +
          '<div class="std-test-body"><div class="std-test-q">' + esc(q.q) + '</div>' +
          '<div class="std-test-opts">' +
          (q.opts || []).map(function(o, oi) {
              return '<button class="std-test-opt" data-i="' + oi + '"><span class="std-test-opt-ltr">' + ['A','B','C','D'][oi] + '</span><span class="std-test-opt-txt">' + esc(o) + '</span></button>';
          }).join('') +
          '</div></div>' +
          '<div class="std-test-footer"><span class="std-test-ch-tag">' + esc((S.chapters[S.activeIdx]||{}).title||'') + '</span></div>' +
          '</div>';

      modal.querySelectorAll('.std-test-opt').forEach(function(btn) {
          btn.addEventListener('click', function() { handleAnswer(idx, parseInt(btn.dataset.i)); });
      });
      setTimeout(function() {
          var inner = modal.querySelector('.std-test-inner');
          if (inner) renderMath(inner);
          /* Sync timer display immediately after render */
          if (_testTotalSecs > 0) _updateTimerDisplay();
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
    _clearTestTimer();
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
      /* Groq-only — no Pollinations fallback */
      if (typeof window.groqFetch === 'function') {
          try {
              var rg = await window.groqFetch(
                  {model:GROQ_MODEL, messages:messages, temperature:temp||0.7, max_tokens:3000},
                  {signal:AbortSignal.timeout(45000)}
              );
              if (!rg.ok) {
                  var errTxt = '';
                  try { var errJ = await rg.json(); errTxt = (errJ.error && errJ.error.message) || ''; } catch(e) {}
                  throw new Error('Groq error ' + rg.status + (errTxt ? ': ' + errTxt : ''));
              }
              var dg = await rg.json();
              if (!dg.choices || !dg.choices[0]) throw new Error('Empty Groq response');
              return dg.choices[0].message.content || '';
          } catch(e) {
              /* Re-throw with a friendly message if it's a key/config issue */
              if (e.message && (e.message.includes('No Groq API keys') || e.message.includes('rate-limited'))) {
                  throw e;
              }
              throw new Error('AI request failed: ' + e.message);
          }
      }
      /* groqFetch not ready yet — likely still loading */
      throw new Error('Groq is not ready yet. Please wait a moment and try again.');
  }

  
