/* aqs-study.js — AI Study Feature */
(function () {
'use strict';

var POLL_URL  = 'https://text.pollinations.ai/openai';
var WIKI_API  = 'https://en.wikipedia.org/w/api.php';
var BOOKS_API = 'https://www.googleapis.com/books/v1/volumes';
var HIST_KEY  = 'aqs_study_hist';
var MAX_HIST  = 15;

var S = {
    query:'', title:'', source:'', description:'', wikiTitle:'',
    chapters:[], activeIdx:-1, cache:{},
    testQ:null, testAns:[], testIdx:0,
    voiceHist:[], voiceActive:false, recog:null,
    synth: window.speechSynthesis || null
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', function () {
    setupSearch();
    setupEvents();
    setupSpeech();
    renderHistory();
    checkAI();
});

/* ============================================================
   SEARCH
   ============================================================ */
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
    setLoadMsg('🔍 Searching the internet for "' + esc(q) + '"…');

    var results = await Promise.allSettled([wikiSearch(q), bookSearch(q)]);
    var wiki  = results[0].status === 'fulfilled' ? results[0].value : [];
    var books = results[1].status === 'fulfilled' ? results[1].value : [];

    if (!wiki.length && !books.length) {
        await loadAI(q);
    } else {
        showResults(wiki, books, q);
    }
}

async function wikiSearch(q) {
    var r = await fetch(
        WIKI_API + '?action=query&list=search&srsearch=' + encodeURIComponent(q) +
        '&srlimit=5&format=json&origin=*',
        { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) throw new Error('Wikipedia error');
    var d = await r.json();
    return (d.query && d.query.search ? d.query.search : []).map(function (x) {
        return { title: x.title, desc: (x.snippet || '').replace(/<[^>]*>/g, ''), type: 'wiki' };
    });
}

async function bookSearch(q) {
    var r = await fetch(
        BOOKS_API + '?q=' + encodeURIComponent(q) + '&maxResults=5&orderBy=relevance',
        { signal: AbortSignal.timeout(8000) }
    );
    if (!r.ok) return [];
    var d = await r.json();
    return (d.items || []).map(function (b) {
        var v = b.volumeInfo || {};
        return {
            id: b.id,
            title: v.title || 'Unknown Title',
            authors: (v.authors || []).join(', '),
            desc: (v.description || '').slice(0, 280),
            thumb: v.imageLinks ? v.imageLinks.thumbnail : null,
            year: (v.publishedDate || '').slice(0, 4),
            type: 'book'
        };
    });
}

function showResults(wiki, books, q) {
    var html = '<div class="std-results-head"><h2>Results for "' + esc(q) + '"</h2>' +
               '<p>Select what you want to study</p></div>';

    if (wiki.length) {
        html += '<div class="std-res-sec"><div class="std-res-sec-lbl">📖 Wikipedia Topics</div>' +
                '<div class="std-res-grid">';
        wiki.forEach(function (r) {
            html += '<div class="std-res-card" data-type="wiki" data-title="' + esc(r.title) + '">' +
                    '<div class="std-res-icon">📖</div><div class="std-res-info">' +
                    '<div class="std-res-title">' + esc(r.title) + '</div>' +
                    '<div class="std-res-desc">' + esc(r.desc) + '</div></div></div>';
        });
        html += '</div></div>';
    }

    if (books.length) {
        html += '<div class="std-res-sec"><div class="std-res-sec-lbl">📚 Books</div>' +
                '<div class="std-res-grid">';
        books.forEach(function (b) {
            var img = b.thumb
                ? '<img src="' + b.thumb + '" class="std-res-thumb" alt="" loading="lazy">'
                : '<div class="std-res-thumb-ph">📚</div>';
            html += '<div class="std-res-card" data-type="book" data-bookid="' + esc(b.id) +
                    '" data-title="' + esc(b.title) + '" data-desc="' + esc(b.desc) + '">' +
                    img + '<div class="std-res-info">' +
                    '<div class="std-res-title">' + esc(b.title) + '</div>' +
                    '<div class="std-res-meta">' + (b.authors ? 'by ' + esc(b.authors) : '') +
                    (b.year ? ' · ' + b.year : '') + '</div>' +
                    '<div class="std-res-desc">' + esc(b.desc) + '</div></div></div>';
        });
        html += '</div></div>';
    }

    html += '<div class="std-res-sec"><div class="std-res-sec-lbl">🤖 AI-Generated Study Guide</div>' +
            '<div class="std-res-grid"><div class="std-res-card std-res-ai" data-type="ai" data-title="' + esc(q) + '">' +
            '<div class="std-res-icon">🤖</div><div class="std-res-info">' +
            '<div class="std-res-title">AI Study Guide: ' + esc(q) + '</div>' +
            '<div class="std-res-desc">Let AI generate a full study guide with chapters, summaries, practice tests, and voice chat.</div>' +
            '</div></div></div></div>';

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

/* ============================================================
   LOAD WIKIPEDIA ARTICLE
   ============================================================ */
async function loadWiki(title) {
    setView('loading');
    setLoadMsg('📖 Loading "' + esc(title) + '" from Wikipedia…');
    try {
        var sumRes = await fetch(
            'https://en.wikipedia.org/api/rest_v1/page/summary/' +
            encodeURIComponent(title.replace(/ /g, '_')),
            { signal: AbortSignal.timeout(10000) }
        );
        var secRes = await fetch(
            WIKI_API + '?action=parse&page=' + encodeURIComponent(title) +
            '&prop=sections&format=json&origin=*',
            { signal: AbortSignal.timeout(10000) }
        );
        var sum = await sumRes.json();
        var sec = await secRes.json();

        var rawSecs = (sec.parse && sec.parse.sections) ? sec.parse.sections : [];
        var chapters = [{ title: 'Introduction', index: 0, level: 1 }];
        rawSecs.filter(function (s) {
            return parseInt(s.toclevel) <= 2 && s.line;
        }).slice(0, 18).forEach(function (s) {
            chapters.push({
                title: s.line.replace(/<[^>]*>/g, ''),
                index: parseInt(s.index),
                level: parseInt(s.toclevel)
            });
        });

        S.source      = 'wiki';
        S.title       = title;
        S.wikiTitle   = title;
        S.description = sum.extract || sum.description || '';
        S.chapters    = chapters;
        S.cache       = {};
        S.cache[0]    = S.description;

        saveHist({ query: S.query, title: title, type: 'wiki', chapters: chapters.map(function (c) { return c.title; }) });
        renderStudy();
        selectChapter(0);
    } catch (e) {
        await loadAI(title);
    }
}

/* ============================================================
   LOAD BOOK
   ============================================================ */
async function loadBook(bookId, title, desc) {
    setView('loading');
    setLoadMsg('🤖 Generating chapters for "' + esc(title) + '"…');
    try {
        var chapters = await genBookChapters(title, desc);
        S.source      = 'book';
        S.title       = title;
        S.description = desc;
        S.chapters    = chapters;
        S.cache       = {};
        saveHist({ query: S.query, title: title, type: 'book', chapters: chapters.map(function (c) { return c.title; }) });
        renderStudy();
        selectChapter(0);
    } catch (e) {
        await loadAI(title);
    }
}

async function genBookChapters(title, desc) {
    var res = await aiChat([
        { role: 'system', content: 'You are a book analyst. Create a chapter study outline.' },
        { role: 'user', content: 'Create a study chapter outline for the book "' + title + '".\nContext: ' +
          (desc || '').slice(0, 500) + '\nReturn ONLY a JSON array: ["Chapter 1: Title","Chapter 2: Title",...]\n8-14 chapters.' }
    ], 0.5);
    var titles = [];
    try { var m = res.match(/\[[\s\S]*?\]/); if (m) titles = JSON.parse(m[0]); } catch (e) {}
    if (!titles.length) titles = ['Introduction & Overview','Part 1: Foundations','Part 2: Core Content','Part 3: Advanced Themes','Analysis & Critique','Key Takeaways'];
    return titles.map(function (t, i) { return { title: t, index: i, level: 1 }; });
}

/* ============================================================
   LOAD AI TOPIC
   ============================================================ */
async function loadAI(query) {
    setView('loading');
    setLoadMsg('🤖 AI is building a comprehensive study guide for "' + esc(query) + '"…');
    try {
        var res = await aiChat([
            { role: 'system', content: 'You are a curriculum expert. Generate chapter titles for a study guide.' },
            { role: 'user', content: 'Generate 8-12 study chapter titles for: "' + query + '"\nReturn ONLY a JSON array: ["Chapter 1","Chapter 2",...]\nChapters must flow from basics to advanced.' }
        ], 0.5);
        var titles = [];
        try { var m = res.match(/\[[\s\S]*?\]/); if (m) titles = JSON.parse(m[0]); } catch (e) {}
        if (!titles.length) titles = ['Introduction','Core Concepts','Key Principles','Practical Applications','Advanced Topics','Summary & Review'];

        S.source      = 'ai';
        S.title       = query;
        S.description = '';
        S.chapters    = titles.map(function (t, i) { return { title: t, index: i, level: 1 }; });
        S.cache       = {};
        saveHist({ query: query, title: query, type: 'ai', chapters: titles });
        renderStudy();
        selectChapter(0);
    } catch (e) {
        setView('home');
        showErr('Failed to generate study guide. Please check your connection and try again.');
    }
}

/* ============================================================
   RENDER STUDY VIEW
   ============================================================ */
function renderStudy() {
    var t = document.getElementById('std-topic-title');
    var s = document.getElementById('std-topic-source');
    if (t) t.textContent = S.title;
    if (s) s.textContent = { wiki: '📖 Wikipedia', book: '📚 Google Books', ai: '🤖 AI Generated' }[S.source] || '';
    renderChapters();
    setView('study');
}

function renderChapters() {
    var list = document.getElementById('std-chapters-list');
    if (!list) return;
    list.innerHTML = S.chapters.map(function (c, i) {
        return '<button class="std-ch-item' + (i === S.activeIdx ? ' active' : '') +
               '" data-idx="' + i + '">' +
               '<span class="std-ch-num">' + (i + 1) + '</span>' +
               '<span class="std-ch-title">' + esc(c.title) + '</span></button>';
    }).join('');
    list.querySelectorAll('.std-ch-item').forEach(function (b) {
        b.addEventListener('click', function () { selectChapter(parseInt(b.dataset.idx)); });
    });
}

function updActiveChapter() {
    document.querySelectorAll('.std-ch-item').forEach(function (b) {
        b.classList.toggle('active', parseInt(b.dataset.idx) === S.activeIdx);
    });
}

/* ============================================================
   SELECT CHAPTER
   ============================================================ */
async function selectChapter(idx) {
    S.activeIdx = idx;
    updActiveChapter();
    hideAIPanel();

    var ch = S.chapters[idx];
    if (!ch) return;

    if (S.cache[idx] !== undefined) { showContent(ch.title, S.cache[idx]); return; }

    var el = document.getElementById('std-chapter-content');
    if (el) el.innerHTML = '<div class="std-content-loading"><div class="std-spinner"></div><p>Loading content…</p></div>';

    try {
        var content = '';
        if (S.source === 'wiki' && ch.index !== undefined) {
            content = ch.index === 0 ? S.description : await fetchWikiSection(S.wikiTitle, ch.index);
        } else {
            content = await genChapterContent(ch.title, S.title, S.description);
        }
        if (!content || content.length < 20) throw new Error('empty response');
        S.cache[idx] = content;
        showContent(ch.title, content);
    } catch (e) {
        try {
            var fb = await genChapterContent(ch.title, S.title, S.description);
            S.cache[idx] = fb;
            showContent(ch.title, fb);
        } catch (e2) {
            if (el) el.innerHTML = '<div class="std-content-error">⚠️ Could not load this section. Please try another chapter or go back and search again.</div>';
        }
    }
}

async function fetchWikiSection(pageTitle, sectionIdx) {
    var r = await fetch(
        WIKI_API + '?action=parse&page=' + encodeURIComponent(pageTitle) +
        '&section=' + sectionIdx + '&prop=wikitext&format=json&origin=*',
        { signal: AbortSignal.timeout(12000) }
    );
    if (!r.ok) throw new Error('Wiki section unavailable');
    var d = await r.json();
    var wt = (d.parse && d.parse.wikitext) ? d.parse.wikitext['*'] : '';
    var stripped = stripWiki(wt);
    if (stripped.length < 40) throw new Error('Section too short');
    return stripped;
}

async function genChapterContent(chTitle, topicTitle, desc) {
    return await aiChat([
        { role: 'system', content: 'You are an expert educator. Write clear, comprehensive, well-structured educational content.' },
        { role: 'user', content: 'Write comprehensive educational content about "' + chTitle + '" as part of studying "' + topicTitle + '".\n' +
          (desc ? 'Context: ' + desc.slice(0, 500) + '\n\n' : '') +
          'Include:\n- Clear introduction to the topic\n- Key concepts and definitions\n- Detailed explanations with examples\n- Important points to remember\n- Real-world applications or significance\n\nWrite 400-600 words. Be educational, clear, and engaging.' }
    ], 0.7);
}

function showContent(title, content) {
    var el = document.getElementById('std-chapter-content');
    if (!el) return;
    var html = '<h2 class="std-ch-heading">' + esc(title) + '</h2><div class="std-ch-body">' +
        renderParagraphs(content) + '</div>';
    el.innerHTML = html;
}

function renderParagraphs(text) {
    return (text || '').split(/\n{2,}/).filter(function (p) { return p.trim(); }).map(function (p) {
        var t = p.trim();
        var lines = t.split('\n');
        var isList = lines.length > 1 && lines.every(function (l) { return /^[•\-\*\d]/.test(l.trim()); });
        if (isList) {
            return '<ul>' + lines.filter(Boolean).map(function (l) {
                return '<li>' + esc(l.replace(/^[•\-\*\d\.]+\s*/, '')) + '</li>';
            }).join('') + '</ul>';
        }
        return '<p>' + esc(t) + '</p>';
    }).join('');
}

/* ============================================================
   SUMMARY
   ============================================================ */
async function doSummary() {
    if (S.activeIdx < 0) { showErr('Please select a chapter first.'); return; }
    var ch      = S.chapters[S.activeIdx];
    var content = S.cache[S.activeIdx] || '';
    showAIPanel('📋 Summary', 'Generating summary…', null);
    try {
        var res = await aiChat([
            { role: 'system', content: 'You are an expert educator. Write comprehensive, well-organised summaries.' },
            { role: 'user', content: 'Write a comprehensive summary of "' + ch.title + '" from the topic "' + S.title + '".\n' +
              (content ? 'Content to summarise:\n' + content.slice(0, 2500) + '\n\n' : '') +
              'Your summary must cover:\n1. Main idea and purpose\n2. Key concepts and definitions\n3. Important points and facts\n4. Key takeaways\n\nUse bullet points where helpful. Be thorough and clear.' }
        ], 0.6);
        showAIPanel('📋 Summary — ' + ch.title, null, res);
    } catch (e) {
        showAIPanel('📋 Summary', null, '⚠️ Error: ' + e.message);
    }
}

/* ============================================================
   EXPLANATION
   ============================================================ */
async function doExplain() {
    if (S.activeIdx < 0) { showErr('Please select a chapter first.'); return; }
    var ch      = S.chapters[S.activeIdx];
    var content = S.cache[S.activeIdx] || '';
    showAIPanel('💡 Explanation', 'Generating detailed explanation…', null);
    try {
        var res = await aiChat([
            { role: 'system', content: 'You are an expert tutor. Write detailed, clear explanations that help students truly understand concepts.' },
            { role: 'user', content: 'Write a comprehensive explanation of "' + ch.title + '" from "' + S.title + '".\n' +
              (content ? 'Reference content:\n' + content.slice(0, 2500) + '\n\n' : '') +
              'Your explanation should:\n1. Break down complex ideas into simple parts\n2. Use analogies and real-world examples\n3. Explain WHY and HOW, not just WHAT\n4. Address common misconceptions\n5. Connect concepts to broader context\n\nWrite 400-600 words. Be clear and engaging.' }
        ], 0.7);
        showAIPanel('💡 Explanation — ' + ch.title, null, res);
    } catch (e) {
        showAIPanel('💡 Explanation', null, '⚠️ Error: ' + e.message);
    }
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
        }
    }
    setTimeout(function () { p.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
}

function hideAIPanel() {
    var p = document.getElementById('std-ai-panel');
    if (p) p.style.display = 'none';
}

/* ============================================================
   PRACTICE TEST
   ============================================================ */
async function openTest() {
    if (S.activeIdx < 0) { showErr('Please select a chapter first.'); return; }
    var ch      = S.chapters[S.activeIdx];
    var content = S.cache[S.activeIdx] || '';
    var modal   = document.getElementById('std-test-modal');
    if (!modal) return;

    modal.style.display = 'flex';
    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-loading">' +
        '<div class="std-spinner lg"></div>' +
        '<h3>🤖 Generating 20 Practice Questions</h3>' +
        '<p>Creating questions for:<br><strong>' + esc(ch.title) + '</strong></p>' +
        '<div class="std-test-load-sub" id="std-test-status-msg">Using AI — please wait about 20 seconds…</div>' +
        '</div></div>';

    var PROMPT = [
        { role: 'system', content: 'You are an expert educator. Create comprehensive practice test questions. IMPORTANT: Return ONLY valid JSON, absolutely no other text before or after.' },
        { role: 'user', content: 'Generate exactly 20 multiple-choice practice questions for:\nTopic: "' + S.title + '"\nSection: "' + ch.title + '"\n' +
          (content ? 'Study material:\n' + content.slice(0, 3500) + '\n\n' : '') +
          'Return ONLY this JSON array (no markdown, no extra text):\n[{"q":"question","opts":["Option A","Option B","Option C","Option D"],"ans":0,"exp":"Comprehensive explanation at least 20 lines long. Must explain WHY the correct answer is right, WHY each wrong option is wrong, provide context, examples, and deeper educational insights. This MUST be very thorough."}]\n\nRules:\n- Exactly 20 questions\n- Mix easy/medium/hard difficulty\n- All 4 options must be plausible\n- ans is 0-based index of correct option\n- exp must be minimum 20 lines' }
    ];

    var qStr;
    try {
        qStr = await groqChat(PROMPT, 0.35);
    } catch (groqErr) {
        var msg = document.getElementById('std-test-status-msg');
        if (msg) msg.textContent = 'Groq unavailable — using backup AI…';
        try {
            qStr = await aiChat(PROMPT, 0.35);
        } catch (e2) {
            modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error">' +
                '<div style="font-size:3rem">❌</div><h3>Failed to Generate Questions</h3>' +
                '<p>' + esc(e2.message) + '</p>' +
                '<button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button>' +
                '</div></div>';
            return;
        }
    }

    var qs = [];
    try {
        var jsonMatch = qStr.match(/\[[\s\S]*\]/);
        if (jsonMatch) qs = JSON.parse(jsonMatch[0]);
    } catch (e) {
        try {
            var cleaned = qStr.replace(/```json\n?/g, '').replace(/```\n?/g, '');
            var m2 = cleaned.match(/\[[\s\S]*\]/);
            if (m2) qs = JSON.parse(m2[0]);
        } catch (e2) {}
    }

    if (!qs || qs.length < 4) {
        modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error">' +
            '<div style="font-size:3rem">❌</div><h3>Could Not Parse Questions</h3>' +
            '<p>The AI response could not be read. Please try again.</p>' +
            '<button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" class="std-btn std-btn-primary">Close</button>' +
            '</div></div>';
        return;
    }

    qs = qs.slice(0, 20);
    S.testQ   = qs;
    S.testAns = new Array(qs.length).fill(-1);
    S.testIdx = 0;
    renderTestQ(0);
}

function renderTestQ(idx) {
    var q = S.testQ[idx];
    if (!q) { showTestResults(); return; }
    var modal = document.getElementById('std-test-modal');
    if (!modal) return;

    var prog = Math.round((idx / S.testQ.length) * 100);
    modal.innerHTML = '<div class="std-test-inner">' +
        '<div class="std-test-header">' +
        '<div class="std-test-prog-bar"><div class="std-test-prog-fill" style="width:' + prog + '%"></div></div>' +
        '<div class="std-test-meta">Question ' + (idx + 1) + ' of ' + S.testQ.length + '</div></div>' +
        '<div class="std-test-body">' +
        '<div class="std-test-q">' + esc(q.q) + '</div>' +
        '<div class="std-test-opts">' +
        (q.opts || []).map(function (o, oi) {
            return '<button class="std-test-opt" data-i="' + oi + '">' +
                   '<span class="std-test-opt-ltr">' + ['A','B','C','D'][oi] + '</span>' +
                   '<span class="std-test-opt-txt">' + esc(o) + '</span></button>';
        }).join('') + '</div></div>' +
        '<div class="std-test-footer">' +
        '<span class="std-test-ch-tag">' + esc((S.chapters[S.activeIdx] || {}).title || '') + '</span>' +
        '</div></div>';

    modal.querySelectorAll('.std-test-opt').forEach(function (btn) {
        btn.addEventListener('click', function () { handleAnswer(idx, parseInt(btn.dataset.i)); });
    });
}

function handleAnswer(qIdx, sel) {
    var q  = S.testQ[qIdx];
    S.testAns[qIdx] = sel;
    var ok = sel === q.ans;
    var modal = document.getElementById('std-test-modal');
    if (!modal) return;

    modal.querySelectorAll('.std-test-opt').forEach(function (btn) {
        var i = parseInt(btn.dataset.i);
        btn.disabled = true;
        if (i === q.ans) btn.classList.add('correct');
        else if (i === sel && !ok) btn.classList.add('wrong');
    });

    var body = modal.querySelector('.std-test-body');
    if (body) {
        var fb = document.createElement('div');
        fb.className = 'std-test-fb ' + (ok ? 'correct' : 'wrong');
        fb.innerHTML = (ok ? '✅ Correct!' : '❌ Incorrect. Correct answer: <strong>' + ['A','B','C','D'][q.ans] + '</strong>') +
            '<div class="std-test-exp-prev">' + esc((q.exp || '').slice(0, 280)) +
            ((q.exp || '').length > 280 ? '…' : '') + '</div>';
        body.appendChild(fb);
    }

    var footer = modal.querySelector('.std-test-footer');
    var isLast = qIdx === S.testQ.length - 1;
    if (footer) {
        footer.innerHTML = '<button class="std-btn std-btn-primary" id="std-nxt-btn">' +
                           (isLast ? '🏁 See Results' : 'Next Question →') + '</button>';
        var nxt = document.getElementById('std-nxt-btn');
        if (nxt) nxt.addEventListener('click', function () {
            if (isLast) showTestResults(); else renderTestQ(qIdx + 1);
        });
    }
}

function showTestResults() {
    var qs  = S.testQ;
    var ans = S.testAns;
    if (!qs) return;

    var correct = ans.filter(function (a, i) { return a === qs[i].ans; }).length;
    var pct     = Math.round(correct / qs.length * 100);
    var emoji, msg, col;

    if (pct >= 90)      { emoji = '🏆'; msg = 'Outstanding! You have mastered this topic excellently!'; col = '#10b981'; }
    else if (pct >= 70) { emoji = '🌟'; msg = 'Great job! You have a solid understanding of this material!'; col = '#7c3aed'; }
    else if (pct >= 50) { emoji = '👍'; msg = 'Good effort! Keep reviewing and you\'ll master it very soon!'; col = '#f59e0b'; }
    else if (pct >= 30) { emoji = '💪'; msg = 'Keep going! Practice makes perfect — review the chapters and try again!'; col = '#f59e0b'; }
    else                { emoji = '📚'; msg = 'This topic needs more study. Go through the chapters carefully, then try again!'; col = '#ef4444'; }

    var modal = document.getElementById('std-test-modal');
    if (!modal) return;

    var html = '<div class="std-test-inner" style="overflow-y:auto;max-height:90vh">' +
        '<div class="std-test-res-head">' +
        '<div class="std-test-score-circle" style="border-color:' + col + '">' +
        '<div class="std-test-score-pct">' + pct + '%</div>' +
        '<div class="std-test-score-sub">' + correct + '/' + qs.length + '</div></div>' +
        '<div style="font-size:2.6rem">' + emoji + '</div>' +
        '<p style="color:' + col + ';font-weight:700;font-size:1rem;margin:0;max-width:320px;text-align:center">' + esc(msg) + '</p>' +
        '</div>' +
        '<div class="std-test-res-actions">' +
        '<button class="std-btn std-btn-primary" id="std-retry-btn">🔄 Try Again</button>' +
        '<button class="std-btn std-btn-ghost" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">✕ Close</button>' +
        '</div>' +
        '<div class="std-test-res-list"><h3>Full Results &amp; Explanations</h3>';

    qs.forEach(function (q, i) {
        var ua = ans[i], ok = ua === q.ans;
        html += '<div class="std-res-item ' + (ok ? 'correct' : 'wrong') + '">' +
            '<div class="std-res-item-head">' +
            '<span class="std-res-num">' + (i + 1) + '</span>' +
            '<span>' + (ok ? '✅' : '❌') + '</span>' +
            '<div class="std-res-q">' + esc(q.q) + '</div></div>' +
            '<div class="std-res-ans">' +
            '<span style="color:#10b981">Correct: </span><strong>' + ['A','B','C','D'][q.ans] + '. ' +
            esc(((q.opts || [])[q.ans]) || '') + '</strong>' +
            (ua >= 0 && !ok ? '<br><span style="color:#ef4444">Your answer: </span>' +
            ['A','B','C','D'][ua] + '. ' + esc(((q.opts || [])[ua]) || '') : '') + '</div>' +
            '<div class="std-res-exp"><strong>Explanation:</strong>' +
            renderParagraphs(q.exp || 'No explanation provided.') + '</div></div>';
    });

    html += '</div></div>';
    modal.innerHTML = html;

    var retryBtn = document.getElementById('std-retry-btn');
    if (retryBtn) retryBtn.addEventListener('click', function () {
        S.testQ = null; openTest();
    });
}

/* ============================================================
   VOICE CHAT
   ============================================================ */
function setupSpeech() {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    S.recog = new SR();
    S.recog.continuous     = false;
    S.recog.interimResults = false;
    S.recog.lang           = 'en-US';
    S.recog.onresult = function (e) {
        var t = e.results[0][0].transcript;
        addVMsg('user', t);
        sendAIMsg();           /* message is already in S.voiceHist via addVMsg */
        setMic(false);
    };
    S.recog.onerror = function () { setMic(false); };
    S.recog.onend   = function () { setMic(false); };
}

function openVoice() {
    if (S.activeIdx < 0) { showErr('Please select a chapter first.'); return; }
    var ch = S.chapters[S.activeIdx];
    S.voiceHist = [{
        role: 'system',
        content: 'You are an expert, friendly AI tutor helping a student study "' + S.title + '".' +
                 (ch ? ' The student is currently on chapter: "' + ch.title + '".' : '') +
                 ' Be warm, encouraging, and educational. Explain concepts clearly and simply. ' +
                 'Ask follow-up questions to check understanding. ' +
                 'Keep responses to 3-5 sentences so they are easy to read and hear aloud.'
    }];

    var panel = document.getElementById('std-voice-panel');
    var msgs  = document.getElementById('std-voice-msgs');
    if (!panel || !msgs) return;
    panel.style.display = 'flex';
    msgs.innerHTML = '';

    var welcome = 'Hello! I\'m your AI tutor for "' + S.title + '".' +
                  (ch ? ' We\'re on "' + ch.title + '".' : '') +
                  ' What would you like to know? Feel free to type or speak your question!';
    addVMsg('ai', welcome);
    speak(welcome);
}

function addVMsg(role, text) {
    /* Always push both user and assistant messages into the conversation history */
    if (role === 'user' || role === 'assistant') {
        S.voiceHist.push({ role: role, content: text });
    }
    var msgs = document.getElementById('std-voice-msgs');
    if (!msgs) return;
    var d = document.createElement('div');
    d.className = 'std-vmsg std-vmsg-' + (role === 'assistant' ? 'ai' : role);
    d.innerHTML = '<div class="std-vbubble">' + esc(text) + '</div>';
    msgs.appendChild(d);
    msgs.scrollTop = msgs.scrollHeight;
}

/* sendAIMsg — the user message is ALREADY in S.voiceHist before this is called */
async function sendAIMsg() {
    var msgs = document.getElementById('std-voice-msgs');

    /* Typing indicator */
    var tp = document.createElement('div');
    tp.className = 'std-vmsg std-vmsg-ai';
    tp.innerHTML = '<div class="std-vbubble std-vtyping">● ● ●</div>';
    if (msgs) { msgs.appendChild(tp); msgs.scrollTop = msgs.scrollHeight; }

    try {
        var resp = await aiChat(S.voiceHist, 0.8);

        if (msgs && msgs.contains(tp)) msgs.removeChild(tp);
        addVMsg('assistant', resp);
        speak(resp);
    } catch (e) {
        if (msgs && msgs.contains(tp)) msgs.removeChild(tp);
        var errMsg = 'I had a little trouble connecting. Please try again in a moment!';
        addVMsg('assistant', errMsg);
    }
}

/* speak — waits for voices to load, picks the best English voice */
function speak(text) {
    if (!S.synth) return;
    S.synth.cancel();

    function doSpeak() {
        S.voiceActive = true;
        var u = new SpeechSynthesisUtterance(text);
        u.rate   = 0.95;
        u.pitch  = 1;
        u.volume = 1;

        /* Prefer a local (device) English voice for reliability */
        var voices  = S.synth.getVoices();
        var picked  = voices.find(function (v) { return v.lang === 'en-US' && v.localService; }) ||
                      voices.find(function (v) { return v.lang === 'en-GB' && v.localService; }) ||
                      voices.find(function (v) { return /^en/i.test(v.lang); });
        if (picked) u.voice = picked;

        u.onend   = function () { S.voiceActive = false; setSpeakBtn(false); };
        u.onerror = function () { S.voiceActive = false; setSpeakBtn(false); };
        S.synth.speak(u);
        setSpeakBtn(true);
    }

    /* Voices may not have loaded yet on first call */
    if (S.synth.getVoices().length > 0) {
        doSpeak();
    } else {
        S.synth.onvoiceschanged = function () {
            S.synth.onvoiceschanged = null;
            doSpeak();
        };
    }
}

function stopSpeak() {
    if (S.synth) S.synth.cancel();
    S.voiceActive = false;
    setSpeakBtn(false);
}

function startListen() {
    if (!S.recog) { alert('Voice recognition is not supported in this browser. Please type your question.'); return; }
    stopSpeak();
    setMic(true);
    try { S.recog.start(); } catch (e) { setMic(false); }
}

function setMic(on) {
    var b = document.getElementById('std-voice-mic-btn');
    if (b) { b.classList.toggle('active', on); b.textContent = on ? '🔴 Listening…' : '🎤 Speak'; }
}

function setSpeakBtn(on) {
    var b = document.getElementById('std-voice-stop-btn');
    if (b) b.style.display = on ? 'inline-flex' : 'none';
}

/* ============================================================
   HISTORY
   ============================================================ */
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
            c.innerHTML = '<div class="std-hist-empty">No recent topics yet. Search something above to get started!</div>';
            return;
        }
        var icons = { wiki: '📖', book: '📚', ai: '🤖' };
        c.innerHTML = h.map(function (x) {
            return '<div class="std-hist-item" data-q="' + esc(x.query || x.title) + '">' +
                   '<span class="std-hist-icon">' + (icons[x.type] || '📝') + '</span>' +
                   '<div class="std-hist-info">' +
                   '<div class="std-hist-title">' + esc(x.title) + '</div>' +
                   '<div class="std-hist-meta">' + (x.chapters ? x.chapters.length + ' chapters · ' : '') +
                   new Date(x.id).toLocaleDateString() + '</div></div>' +
                   '<button class="std-hist-del" data-id="' + x.id + '" title="Remove">✕</button></div>';
        }).join('');
        c.querySelectorAll('.std-hist-item').forEach(function (el) {
            el.addEventListener('click', function (e) {
                if (!e.target.classList.contains('std-hist-del')) doSearch(el.dataset.q);
            });
        });
        c.querySelectorAll('.std-hist-del').forEach(function (b) {
            b.addEventListener('click', function (e) {
                e.stopPropagation();
                delHist(parseInt(b.dataset.id));
            });
        });
    } catch (e) {}
}

function delHist(id) {
    try {
        var h = JSON.parse(localStorage.getItem(HIST_KEY) || '[]');
        localStorage.setItem(HIST_KEY, JSON.stringify(h.filter(function (x) { return x.id !== id; })));
        renderHistory();
    } catch (e) {}
}

/* ============================================================
   VIEWS
   ============================================================ */
function setView(name) {
    var IDS = ['std-home', 'std-loading-view', 'std-results-view', 'std-study-view'];
    IDS.forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    var MAP = { home: 'std-home', loading: 'std-loading-view', results: 'std-results-view', study: 'std-study-view' };
    var target = document.getElementById(MAP[name]);
    if (target) target.style.display = (name === 'study') ? 'flex' : '';
}

function setLoadMsg(m) { var el = document.getElementById('std-loading-msg'); if (el) el.textContent = m; }

function showErr(m) {
    var el = document.getElementById('std-global-error');
    if (el) { el.textContent = m; el.style.display = 'block'; setTimeout(function () { el.style.display = 'none'; }, 5000); }
}

/* ============================================================
   AI UTILITIES
   ============================================================ */

/*
 * aiChat — calls the Pollinations OpenAI-compatible endpoint.
 *
 * The endpoint returns a standard OpenAI JSON object:
 *   { choices: [{ message: { role, content } }] }
 *
 * We parse the JSON and extract choices[0].message.content.
 * If parsing fails for any reason we fall back to the raw text
 * so the rest of the app still works.
 */
async function aiChat(msgs, temp) {
    var r = await fetch(POLL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'openai',
            temperature: temp !== undefined ? temp : 0.7,
            messages: msgs,
            stream: false
        }),
        signal: AbortSignal.timeout(50000)
    });
    if (!r.ok) throw new Error('AI service unavailable (' + r.status + ')');

    var rawText = await r.text();

    /* Try to parse as OpenAI JSON and extract the message content */
    try {
        var d = JSON.parse(rawText);
        if (d && d.choices && d.choices[0] && d.choices[0].message) {
            return d.choices[0].message.content;
        }
    } catch (e) { /* Not JSON — fall through to return raw text */ }

    return rawText;
}

async function groqChat(msgs, temp) {
    if (typeof window.groqFetch !== 'function') throw new Error('Groq not available');
    var r = await window.groqFetch({
        model: 'llama-3.3-70b-versatile',
        temperature: temp !== undefined ? temp : 0.4,
        max_tokens: 8000,
        messages: msgs
    });
    if (!r.ok) {
        var errBody = await r.json().catch(function () { return {}; });
        throw new Error((errBody.error && errBody.error.message) || 'Groq error ' + r.status);
    }
    var d = await r.json();
    return d.choices[0].message.content;
}

/* ============================================================
   UTILITIES
   ============================================================ */
function stripWiki(t) {
    return (t || '')
        .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
        .replace(/\{\{[^}]*\}\}/g, '')
        .replace(/'{2,3}/g, '')
        .replace(/==+[^=]*==+\n?/g, '')
        .replace(/<ref[^>]*>[\s\S]*?<\/ref>/gi, '')
        .replace(/<[^>]+>/g, '')
        .replace(/^\*+\s*/gm, '• ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function esc(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function checkAI() {
    var el = document.getElementById('std-groq-badge');
    if (!el) return;
    var ok = typeof window.getGroqKey === 'function' && !!window.getGroqKey();
    el.className  = 'std-groq-badge ' + (ok ? 'ok' : 'warn');
    el.textContent = ok ? '🤖 AI Ready' : '⚠️ Backup AI';
    el.title       = ok ? 'Groq AI active — all features ready'
                        : 'Groq key not found. Using Pollinations AI as backup — all features still work.';
}

/* ============================================================
   EVENT SETUP
   ============================================================ */
function setupEvents() {
    var $ = function (id) { return document.getElementById(id); };

    $('std-summary-btn')   && $('std-summary-btn').addEventListener('click', doSummary);
    $('std-explain-btn')   && $('std-explain-btn').addEventListener('click', doExplain);
    $('std-test-btn')      && $('std-test-btn').addEventListener('click', openTest);
    $('std-voice-btn')     && $('std-voice-btn').addEventListener('click', openVoice);
    $('std-test-hdr-btn')  && $('std-test-hdr-btn').addEventListener('click', openTest);
    $('std-voice-hdr-btn') && $('std-voice-hdr-btn').addEventListener('click', openVoice);
    $('std-close-ai-btn')  && $('std-close-ai-btn').addEventListener('click', hideAIPanel);

    $('std-back-btn') && $('std-back-btn').addEventListener('click', function () {
        var rv = $('std-results-view');
        setView(rv && rv.innerHTML.trim() ? 'results' : 'home');
    });
    $('std-results-back') && $('std-results-back').addEventListener('click', function () { setView('home'); });

    $('std-chapters-toggle') && $('std-chapters-toggle').addEventListener('click', function () {
        var cp = $('std-chapters-panel');
        if (cp) cp.classList.toggle('open');
    });

    $('std-voice-mic-btn')   && $('std-voice-mic-btn').addEventListener('click', startListen);
    $('std-voice-stop-btn')  && $('std-voice-stop-btn').addEventListener('click', stopSpeak);
    $('std-voice-close-btn') && $('std-voice-close-btn').addEventListener('click', function () {
        stopSpeak();
        var p = $('std-voice-panel');
        if (p) p.style.display = 'none';
    });

    var inp = $('std-voice-text-input');
    var snd = $('std-voice-send-btn');
    function sendText() {
        var t = inp ? inp.value.trim() : '';
        if (!t) return;
        inp.value = '';
        addVMsg('user', t);     /* adds to S.voiceHist and renders the bubble */
        sendAIMsg();            /* sends S.voiceHist as-is — no duplication */
    }
    if (snd) snd.addEventListener('click', sendText);
    if (inp) inp.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText(); }
    });
}

})();
