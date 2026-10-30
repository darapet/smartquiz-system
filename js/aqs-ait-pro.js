/* aqs-ait-pro.js  v1.0 — AI Teacher Pro
 * Tesla intro overlay · Voice-only onboarding · Filler filter
 * Tap-to-interrupt · Practice vs Exam mode chooser
 *
 * All hooks are wired via window.aitPro* callbacks set by this file.
 * The main aqs-study.js calls those callbacks at key lifecycle points.
 */
(function () {
'use strict';

/* ══════════════════════════════════════════════════════════════
   STYLES
   ══════════════════════════════════════════════════════════════ */
function _injectCSS() {
    if (document.getElementById('ait-pro-css')) return;
    var s = document.createElement('style');
    s.id = 'ait-pro-css';
    s.textContent = [
        /* ── TESLA FULL-SCREEN INTRO ── */
        '#ait-tesla-overlay{position:fixed;inset:0;z-index:999999;background:#060410;display:none;flex-direction:column;align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;opacity:1;transition:opacity .6s ease}',
        '#ait-tesla-overlay.show{display:flex}',
        '#ait-tesla-overlay.fade-out{opacity:0;pointer-events:none}',
        '#ait-tesla-canvas{position:absolute;inset:0;width:100%;height:100%}',
        '#ait-tesla-content{position:relative;z-index:2;display:flex;flex-direction:column;align-items:center;gap:18px;padding:24px;max-width:640px;width:100%;text-align:center}',
        '#ait-tesla-logo{font-size:2.2rem;color:#a78bfa;text-shadow:0 0 30px rgba(139,92,246,.8);letter-spacing:.08em;font-weight:900;margin-bottom:4px}',
        '#ait-tesla-status{font-size:.72rem;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:#7c3aed;opacity:.9;min-height:18px}',
        '#ait-tesla-ai-text{font-size:clamp(1rem,2.8vw,1.4rem);font-weight:700;color:#e2e8f0;line-height:1.55;min-height:72px;max-width:560px;text-shadow:0 0 16px rgba(139,92,246,.35)}',
        '#ait-tesla-you-said{font-size:.82rem;font-weight:600;color:#06b6d4;font-style:italic;min-height:22px}',
        '#ait-tesla-voice-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(80px,1fr));gap:10px;width:100%;max-width:500px;margin-top:4px}',
        '.ait-tv-card{background:rgba(99,102,241,.08);border:2px solid rgba(99,102,241,.22);border-radius:14px;padding:13px 6px 10px;cursor:pointer;text-align:center;transition:all .2s ease;color:#c4b5fd}',
        '.ait-tv-card:hover{background:rgba(99,102,241,.2);border-color:#6366f1;transform:translateY(-3px)}',
        '.ait-tv-card.selected{background:rgba(99,102,241,.35)!important;border-color:#a78bfa!important;box-shadow:0 0 18px rgba(139,92,246,.55)}',
        '.ait-tv-card .tv-num{font-size:1.3rem;font-weight:900;display:block;margin-bottom:3px}',
        '.ait-tv-card .tv-name{font-size:.6rem;font-weight:700;color:#94a3b8;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
        '#ait-tesla-close{position:absolute;top:18px;right:18px;z-index:3;width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.07);border:1.5px solid rgba(255,255,255,.15);color:#94a3b8;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:background .2s;font-family:inherit}',
        '#ait-tesla-close:hover{background:rgba(239,68,68,.22);color:#fca5a5;border-color:rgba(239,68,68,.4)}',

        /* ── INTERRUPT BUTTON ── */
        '#ait-interrupt-btn{position:fixed;bottom:90px;right:24px;z-index:99997;background:rgba(245,158,11,.12);border:2px solid rgba(245,158,11,.45);border-radius:50px;color:#fcd34d;font-size:.76rem;font-weight:800;padding:10px 18px;cursor:pointer;display:none;align-items:center;gap:7px;letter-spacing:.03em;box-shadow:0 0 12px rgba(245,158,11,.25);transition:all .2s;animation:ait-int-pulse 2.2s ease-in-out infinite;font-family:inherit}',
        '#ait-interrupt-btn:hover{background:rgba(245,158,11,.32);border-color:#fcd34d}',
        '@keyframes ait-int-pulse{0%,100%{box-shadow:0 0 8px rgba(245,158,11,.25)}50%{box-shadow:0 0 22px rgba(245,158,11,.55)}}',

        /* ── PRACTICE / EXAM MODE CHOOSER ── */
        '#ait-mode-chooser{position:fixed;inset:0;z-index:999998;background:rgba(0,0,0,.72);display:none;align-items:center;justify-content:center;backdrop-filter:blur(5px)}',
        '#ait-mode-chooser.show{display:flex}',
        '#ait-mode-card-wrap{background:#0f0c23;border:1px solid rgba(139,92,246,.32);border-radius:20px;padding:28px 24px;max-width:400px;width:92%;box-shadow:0 24px 80px rgba(0,0,0,.7);animation:ait-mc-in .28s cubic-bezier(.4,0,.2,1)}',
        '@keyframes ait-mc-in{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}',
        '#ait-mode-card-wrap h3{font-size:1.05rem;font-weight:900;color:#e2e8f0;text-align:center;margin:0 0 5px}',
        '#ait-mode-card-wrap .mc-sub{font-size:.76rem;color:#64748b;text-align:center;margin:0 0 20px}',
        '.ait-mode-opt{background:rgba(255,255,255,.04);border:1.5px solid rgba(139,92,246,.18);border-radius:14px;padding:17px;cursor:pointer;margin-bottom:10px;transition:all .2s ease}',
        '.ait-mode-opt:hover{background:rgba(99,102,241,.12);border-color:#6366f1;transform:translateY(-2px)}',
        '.ait-mode-opt h4{font-size:.9rem;font-weight:800;color:#c4b5fd;margin:0 0 4px}',
        '.ait-mode-opt p{font-size:.73rem;color:#64748b;margin:0;line-height:1.4}',
        '#ait-mc-cancel-btn{width:100%;padding:10px;background:none;border:none;color:#475569;font-size:.76rem;cursor:pointer;margin-top:2px;font-family:inherit}',
        '#ait-mc-cancel-btn:hover{color:#94a3b8}',

        /* ── EXAM RESULTS ── */
        '.ait-exam-res-item{padding:12px;border-radius:10px;margin-bottom:10px}',
        '.ait-exam-correct{background:rgba(34,197,94,.07);border:1px solid rgba(34,197,94,.2)}',
        '.ait-exam-wrong{background:rgba(239,68,68,.07);border:1px solid rgba(239,68,68,.2)}',
    ].join('');
    document.head.appendChild(s);
}

/* ══════════════════════════════════════════════════════════════
   TESLA CANVAS ANIMATION
   ══════════════════════════════════════════════════════════════ */
var _T = { canvas: null, ctx: null, raf: null, state: 'idle' };

function _teslaInit() {
    _T.canvas = document.getElementById('ait-tesla-canvas');
    if (!_T.canvas) return;
    _T.ctx = _T.canvas.getContext('2d');
    _resizeCanvas();
    window.addEventListener('resize', _resizeCanvas);
    _draw();
}

function _resizeCanvas() {
    if (!_T.canvas) return;
    _T.canvas.width  = window.innerWidth;
    _T.canvas.height = window.innerHeight;
}

function _draw() {
    if (!_T.ctx || !_T.canvas) return;
    var ctx = _T.ctx;
    var W = _T.canvas.width, H = _T.canvas.height;
    var cx = W / 2, cy = H * 0.38;   /* orb sits upper-centre */
    var t  = Date.now() / 1000;

    ctx.clearRect(0, 0, W, H);

    /* Background gradient */
    var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    bg.addColorStop(0, 'rgba(20,10,50,.95)');
    bg.addColorStop(1, 'rgba(4,2,14,1)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    var isSpeaking  = _T.state === 'speaking';
    var isListening = _T.state === 'listening';
    var isThinking  = _T.state === 'thinking';

    /* Pick theme colour */
    var rc = isSpeaking  ? '139,92,246'  :
             isListening ? '6,182,212'   :
             isThinking  ? '245,158,11'  : '99,102,241';

    /* Pulse scale */
    var ps = isSpeaking  ? 1 + 0.18 * Math.abs(Math.sin(t * 9))  :
             isListening ? 1 + 0.09 * Math.abs(Math.sin(t * 5))  :
             isThinking  ? 1 + 0.06 * Math.abs(Math.sin(t * 4))  :
                           1 + 0.03 * Math.sin(t * 2);

    /* Ambient glow rings */
    var nRings = isSpeaking ? 6 : 4;
    for (var ri = nRings; ri >= 1; ri--) {
        var rAlpha  = 0.03 + (nRings - ri) * 0.025;
        var rRadius = (90 + ri * 38) * ps;
        var rg = ctx.createRadialGradient(cx, cy, rRadius * 0.3, cx, cy, rRadius);
        rg.addColorStop(0, 'rgba(' + rc + ',' + rAlpha + ')');
        rg.addColorStop(1, 'rgba(' + rc + ',0)');
        ctx.beginPath(); ctx.arc(cx, cy, rRadius, 0, Math.PI * 2);
        ctx.fillStyle = rg; ctx.fill();
    }

    /* Tesla arcs when speaking */
    if (isSpeaking) {
        var nArcs = 7;
        for (var ai = 0; ai < nArcs; ai++) {
            var ang = (ai / nArcs) * Math.PI * 2 + t * 1.8 + ai * 0.7;
            var alen = 55 + Math.sin(t * 3 + ai) * 40;
            _arc(ctx, cx, cy, ang, alen, 'rgba(167,139,250,0.38)');
        }
        /* Occasional bright arc */
        if (Math.sin(t * 17 + 1.2) > 0.7) {
            _arc(ctx, cx, cy, Math.random() * Math.PI * 2, 30 + Math.random() * 55, 'rgba(216,180,254,0.7)');
        }
    }

    /* Listening concentric wave rings */
    if (isListening) {
        for (var lri = 0; lri < 4; lri++) {
            var prog = ((t * 0.75 + lri * 0.25) % 1);
            var lr   = 55 + prog * 160;
            var la   = (1 - prog) * 0.38;
            ctx.beginPath(); ctx.arc(cx, cy, lr, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(6,182,212,' + la + ')';
            ctx.lineWidth = 2; ctx.stroke();
        }
    }

    /* Thinking orbit dot */
    if (isThinking) {
        var orbitR = 65 * ps;
        var ox = cx + Math.cos(t * 4) * orbitR;
        var oy = cy + Math.sin(t * 4) * orbitR * 0.35;
        ctx.beginPath(); ctx.arc(ox, oy, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(245,158,11,0.85)'; ctx.fill();
    }

    /* Core orb */
    var orbR = 50 * ps;
    var og = ctx.createRadialGradient(cx - orbR * 0.3, cy - orbR * 0.3, orbR * 0.08, cx, cy, orbR);
    if (isSpeaking) {
        og.addColorStop(0, '#ddd6fe'); og.addColorStop(0.4, '#7c3aed'); og.addColorStop(1, '#3b0764');
    } else if (isListening) {
        og.addColorStop(0, '#a5f3fc'); og.addColorStop(0.4, '#06b6d4'); og.addColorStop(1, '#0c4a6e');
    } else if (isThinking) {
        og.addColorStop(0, '#fef08a'); og.addColorStop(0.4, '#f59e0b'); og.addColorStop(1, '#78350f');
    } else {
        og.addColorStop(0, '#c7d2fe'); og.addColorStop(0.4, '#6366f1'); og.addColorStop(1, '#1e1b4b');
    }
    ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.fillStyle = og; ctx.fill();

    /* Orb highlight */
    var hg = ctx.createRadialGradient(cx - orbR * 0.33, cy - orbR * 0.33, 0, cx, cy, orbR);
    hg.addColorStop(0, 'rgba(255,255,255,0.38)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    hg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.beginPath(); ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.fillStyle = hg; ctx.fill();

    _T.raf = requestAnimationFrame(_draw);
}

function _arc(ctx, cx, cy, angle, len, color) {
    ctx.beginPath(); ctx.moveTo(cx, cy);
    var steps = 7;
    for (var i = 1; i <= steps; i++) {
        var frac = i / steps;
        var jitter = (Math.random() - 0.5) * 18;
        ctx.lineTo(
            cx + Math.cos(angle) * len * frac + Math.sin(angle) * jitter,
            cy + Math.sin(angle) * len * frac - Math.cos(angle) * jitter
        );
    }
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke();
}

function _teslaStop() {
    if (_T.raf) { cancelAnimationFrame(_T.raf); _T.raf = null; }
    window.removeEventListener('resize', _resizeCanvas);
    _T.ctx = null; _T.canvas = null;
}

/* ══════════════════════════════════════════════════════════════
   TESLA OVERLAY DOM
   ══════════════════════════════════════════════════════════════ */
function _buildTesla() {
    if (document.getElementById('ait-tesla-overlay')) return;
    var el = document.createElement('div');
    el.id = 'ait-tesla-overlay';
    el.innerHTML =
        '<canvas id="ait-tesla-canvas"></canvas>' +
        '<button id="ait-tesla-close" title="Close">✕</button>' +
        '<div id="ait-tesla-content">' +
          '<div id="ait-tesla-logo">✦ XZILY AI</div>' +
          '<div id="ait-tesla-status">Initializing…</div>' +
          '<div id="ait-tesla-ai-text"></div>' +
          '<div id="ait-tesla-voice-grid" style="display:none"></div>' +
          '<div id="ait-tesla-you-said"></div>' +
        '</div>';
    document.body.appendChild(el);

    document.getElementById('ait-tesla-close').addEventListener('click', function () {
        _teslaHide();
        /* Also hide the summon side panel */
        var ol = document.getElementById('std-summon-overlay');
        if (ol) ol.classList.remove('open');
    });
}

function _teslaShow() {
    _buildTesla();
    var el = document.getElementById('ait-tesla-overlay');
    if (!el) return;
    el.classList.add('show');
    el.classList.remove('fade-out');
    /* Re-init canvas each time since canvas may have been GC'd */
    _T.state = 'idle';
    _teslaInit();
}

function _teslaHide() {
    var el = document.getElementById('ait-tesla-overlay');
    if (!el) return;
    el.classList.add('fade-out');
    setTimeout(function () {
        el.classList.remove('show', 'fade-out');
        _teslaStop();
    }, 700);
}

function _teslaSetStatus(state) {
    _T.state = state;
    var el = document.getElementById('ait-tesla-status');
    if (!el) return;
    var map = { idle: '● READY', speaking: '▶ SPEAKING', listening: '◉ LISTENING', thinking: '⟳ THINKING' };
    el.textContent = map[state] || state.toUpperCase();
}

function _teslaSetText(text) {
    var el = document.getElementById('ait-tesla-ai-text');
    if (!el) return;
    /* Strip HTML tags for display */
    var tmp = document.createElement('div');
    tmp.innerHTML = text || '';
    var plain = (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
    el.textContent = plain.length > 220 ? plain.slice(0, 220) + '…' : plain;
}

function _teslaSetYouSaid(text) {
    var el = document.getElementById('ait-tesla-you-said');
    if (el) el.textContent = text ? '🎙 You said: ' + text : '';
}

function _teslaShowVoiceGrid(voices) {
    var grid = document.getElementById('ait-tesla-voice-grid');
    if (!grid) return;
    grid.innerHTML = voices.map(function (v, i) {
        var name = v && (v.name || v.id) ? (v.name || v.id).split(' ')[0].slice(0, 8) : 'Voice';
        return '<button class="ait-tv-card" onclick="window._aitTvPick(' + (i + 1) + ')">' +
               '<span class="tv-num">' + (i + 1) + '</span>' +
               '<span class="tv-name">' + name + '</span>' +
               '</button>';
    }).join('');
    grid.style.display = 'grid';
}

function _teslaHideVoiceGrid() {
    var grid = document.getElementById('ait-tesla-voice-grid');
    if (grid) grid.style.display = 'none';
}

/* Global handler for voice card taps in the Tesla overlay */
window._aitTvPick = function (n) {
    /* Highlight card */
    document.querySelectorAll('.ait-tv-card').forEach(function (c) { c.classList.remove('selected'); });
    var cards = document.querySelectorAll('#ait-tesla-voice-grid .ait-tv-card');
    if (cards[n - 1]) cards[n - 1].classList.add('selected');
    /* Route through the existing summon text input → send */
    var inp = document.getElementById('std-summon-text');
    if (inp) inp.value = String(n);
    var btn = document.getElementById('std-summon-send');
    if (btn) btn.click();
};

/* ══════════════════════════════════════════════════════════════
   INTERRUPT BUTTON
   ══════════════════════════════════════════════════════════════ */
function _buildInterruptBtn() {
    if (document.getElementById('ait-interrupt-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'ait-interrupt-btn';
    btn.innerHTML = '✋&nbsp;&nbsp;Tap to Speak';
    btn.title = 'Stop AI and speak';
    btn.addEventListener('click', function () {
        if (typeof window._summonInterrupt === 'function') {
            window._summonInterrupt();
        } else {
            /* Fallback: click the existing mic button */
            var micBtn = document.getElementById('std-summon-mic-btn');
            if (micBtn) micBtn.click();
        }
    });
    document.body.appendChild(btn);
}

function _updateInterruptBtn(state) {
    var btn = document.getElementById('ait-interrupt-btn');
    if (!btn) return;
    var ol = document.getElementById('std-summon-overlay');
    var isOpen = ol && ol.classList.contains('open');
    /* Show only when side panel is open AND AI is speaking */
    btn.style.display = (isOpen && state === 'speaking') ? 'flex' : 'none';
}

/* ══════════════════════════════════════════════════════════════
   FILLER WORD FILTER
   ══════════════════════════════════════════════════════════════ */
window.aitProFilterText = function (text) {
    if (!text) return text;
    var out = text
        /* Common filler sounds */
        .replace(/\b(um+|uh+|er+|ah+|eh+|hmm+|hm+|mm+)\b/gi, '')
        /* Immediate word repetition: "go go" → "go", "the the" → "the" */
        .replace(/\b(\w+)( \1){1,3}\b/gi, '$1')
        /* Clean up resulting extra spaces */
        .replace(/\s{2,}/g, ' ')
        .trim();
    return out || text.trim();
};

/* ══════════════════════════════════════════════════════════════
   PRACTICE vs EXAM MODE CHOOSER
   ══════════════════════════════════════════════════════════════ */
var _modePendingCb = null;

function _buildModeChooser() {
    if (document.getElementById('ait-mode-chooser')) return;
    var el = document.createElement('div');
    el.id = 'ait-mode-chooser';
    el.innerHTML =
        '<div id="ait-mode-card-wrap">' +
          '<h3>📝 Practice Questions</h3>' +
          '<p class="mc-sub">How would you like to be tested?</p>' +
          '<div class="ait-mode-opt" id="ait-mode-practice">' +
            '<h4>🟢 Practice Mode</h4>' +
            '<p>Answer one question at a time. See if you got it right — plus a full explanation — before moving on.</p>' +
          '</div>' +
          '<div class="ait-mode-opt" id="ait-mode-exam">' +
            '<h4>🔴 Exam Mode</h4>' +
            '<p>Answer all questions without hints, then submit. Get your score, per-question results, and explanations at the end.</p>' +
          '</div>' +
          '<button id="ait-mc-cancel-btn">Cancel</button>' +
        '</div>';
    document.body.appendChild(el);

    el.addEventListener('click', function (e) { if (e.target === el) _hideModeChooser(); });
    document.getElementById('ait-mc-cancel-btn').addEventListener('click', _hideModeChooser);

    document.getElementById('ait-mode-practice').addEventListener('click', function () {
        _hideModeChooser();
        if (_modePendingCb) { _modePendingCb('practice'); _modePendingCb = null; }
    });
    document.getElementById('ait-mode-exam').addEventListener('click', function () {
        _hideModeChooser();
        if (_modePendingCb) { _modePendingCb('exam'); _modePendingCb = null; }
    });
}

function _showModeChooser(cb) {
    _buildModeChooser();
    _modePendingCb = cb;
    var el = document.getElementById('ait-mode-chooser');
    if (el) el.classList.add('show');
}

function _hideModeChooser() {
    var el = document.getElementById('ait-mode-chooser');
    if (el) el.classList.remove('show');
}

/* ── Patch openTest to show mode chooser first ── */
function _patchOpenTest() {
    if (!window._stdOpenTestOrig) return; /* not exposed yet */
    window._stdOpenTestWrapped = window._stdOpenTestOrig; /* keep backup */
    /* Replace the FAB/click handler on the test buttons */
    var patchBtn = function (id) {
        var btn = document.getElementById(id);
        if (!btn) return;
        /* Remove old listeners by cloning */
        var clone = btn.cloneNode(true);
        btn.parentNode.replaceChild(clone, btn);
        clone.addEventListener('click', function () {
            _showModeChooser(function (mode) {
                if (mode === 'practice') {
                    window._stdOpenTestOrig();
                } else {
                    _openExamMode();
                }
            });
        });
    };
    patchBtn('std-test-btn');
    patchBtn('std-test-hdr-btn');
}

/* ── EXAM MODE ── */
function _openExamMode() {
    var modal = document.getElementById('std-test-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    /* Determine chapter */
    var S = window.S;
    var ch = (S && S.chapters && S.activeIdx >= 0) ? S.chapters[S.activeIdx] : null;
    var chTitle = ch ? ch.title : (S && S.title ? S.title : 'the topic');
    var content = (S && S.cache && S.activeIdx >= 0 && S.cache[S.activeIdx]) ? S.cache[S.activeIdx].slice(0, 3000) : '';

    modal.innerHTML = '<div class="std-test-inner"><div class="std-test-loading"><div class="std-spinner lg"></div><h3>📝 Building Exam</h3><p><strong>' + _esc(chTitle) + '</strong></p><div class="std-test-load-sub">Generating 10 exam-level questions…</div></div></div>';

    var aiChat = window.aiChat;
    if (!aiChat) {
        modal.innerHTML = '<div class="std-test-inner"><p style="color:#ef4444;padding:20px">AI not available. Please try again.</p></div>';
        return;
    }

    var sys = 'You are an exam question generator. Your ENTIRE response must be a single valid JSON array. No other text, no markdown fences.';
    var usr = 'Generate exactly 10 multiple-choice exam questions about "' + chTitle + '"' +
              (S && S.title ? ' from the subject "' + S.title + '"' : '') +
              (content ? '. Relevant material: ' + content : '') +
              '. Format each item as: {"q":"question text","opts":["A","B","C","D"],"ans":0,"exp":"explanation"}. ' +
              '"ans" is the 0-based index of the correct option. Return ONLY the JSON array.';

    aiChat([{ role: 'system', content: sys }, { role: 'user', content: usr }], 0.3)
        .then(function (raw) {
            var qs;
            try {
                var m = raw.match(/\[[\s\S]*\]/);
                qs = JSON.parse(m ? m[0] : raw);
                if (!Array.isArray(qs) || !qs.length) throw new Error('empty');
            } catch (e) {
                modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:2.5rem">❌</div><h3>Could Not Build Exam</h3><p>Please try again.</p><button class="std-btn std-btn-ghost" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">Close</button></div></div>';
                return;
            }
            _renderExam(qs, chTitle, modal);
        })
        .catch(function (err) {
            modal.innerHTML = '<div class="std-test-inner"><div class="std-test-error"><div style="font-size:2.5rem">❌</div><h3>AI Error</h3><p>' + _esc((err && err.message) || 'Please try again.') + '</p><button class="std-btn std-btn-ghost" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">Close</button></div></div>';
        });
}

function _renderExam(qs, chTitle, modal) {
    var html = '<div class="std-test-inner" style="overflow-y:auto;max-height:90vh">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:14px;border-bottom:1px solid rgba(139,92,246,.2);margin-bottom:18px">' +
          '<div>' +
            '<div style="font-size:.98rem;font-weight:900;color:#e2e8f0">📝 Exam Mode</div>' +
            '<div style="font-size:.73rem;color:#64748b;margin-top:2px">' + _esc(chTitle) + ' · ' + qs.length + ' questions</div>' +
          '</div>' +
          '<button onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'" style="background:rgba(255,255,255,.07);border:none;color:#94a3b8;border-radius:50%;width:32px;height:32px;cursor:pointer;font-size:.95rem;display:flex;align-items:center;justify-content:center">✕</button>' +
        '</div>';

    qs.forEach(function (q, i) {
        html += '<div style="margin-bottom:16px;padding:14px;background:rgba(99,102,241,.05);border:1px solid rgba(99,102,241,.14);border-radius:12px">' +
            '<div style="font-size:.84rem;font-weight:700;color:#e2e8f0;margin-bottom:10px"><span style="color:#818cf8">Q' + (i + 1) + '.&nbsp;</span>' + _esc(q.q || '') + '</div>' +
            (q.opts || []).map(function (opt, oi) {
                return '<label style="display:flex;align-items:flex-start;gap:9px;padding:8px 10px;border-radius:8px;cursor:pointer;margin-bottom:4px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);transition:background .15s">' +
                       '<input type="radio" name="eq' + i + '" value="' + oi + '" style="margin-top:2px;flex-shrink:0;accent-color:#6366f1">' +
                       '<span style="font-size:.8rem;color:#cbd5e1">' + _esc(opt) + '</span>' +
                       '</label>';
            }).join('') +
            '</div>';
    });

    html += '<button id="ait-exam-submit-btn" style="width:100%;padding:13px;background:linear-gradient(135deg,#6366f1,#7c3aed);border:none;border-radius:12px;color:#fff;font-size:.88rem;font-weight:800;cursor:pointer;letter-spacing:.02em;font-family:inherit">Submit Exam →</button></div>';

    modal.innerHTML = html;
    document.getElementById('ait-exam-submit-btn').addEventListener('click', function () {
        _scoreExam(qs, modal);
    });
}

function _scoreExam(qs, modal) {
    var correct = 0;
    var answers = qs.map(function (q, i) {
        var sel = modal.querySelector('input[name="eq' + i + '"]:checked');
        var picked = sel ? parseInt(sel.value, 10) : -1;
        var isRight = picked === (typeof q.ans === 'number' ? q.ans : 0);
        if (isRight) correct++;
        return { q: q, picked: picked, right: isRight };
    });

    var pct   = Math.round((correct / qs.length) * 100);
    var col   = pct >= 70 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
    var emoji = pct >= 80 ? '🏆' : pct >= 60 ? '✅' : pct >= 40 ? '📚' : '💪';
    var msg   = pct >= 80 ? 'Excellent work!' : pct >= 60 ? 'Good effort — keep going!' : pct >= 40 ? 'Keep studying!' : 'More practice will help!';

    var html = '<div class="std-test-inner" style="overflow-y:auto;max-height:90vh">' +
        '<div class="std-test-res-head">' +
          '<div class="std-test-score-circle" style="border-color:' + col + '">' +
            '<div class="std-test-score-pct">' + pct + '%</div>' +
            '<div class="std-test-score-sub">' + correct + '/' + qs.length + '</div>' +
          '</div>' +
          '<div style="font-size:2.8rem">' + emoji + '</div>' +
          '<p style="color:' + col + ';font-weight:700;font-size:.95rem;margin:0">' + _esc(msg) + '</p>' +
        '</div>' +
        '<div class="std-test-res-actions">' +
          '<button class="std-btn std-btn-primary" id="ait-exam-retry">🔄 Try Again</button>' +
          '<button class="std-btn std-btn-ghost" onclick="document.getElementById(\'std-test-modal\').style.display=\'none\'">✕ Close</button>' +
        '</div>' +
        '<div class="std-test-res-list"><h3>Results &amp; Explanations</h3>';

    answers.forEach(function (a, i) {
        var q         = a.q;
        var picked    = a.picked >= 0 ? _esc(q.opts[a.picked] || '—') : 'No answer';
        var correctOp = _esc(q.opts[typeof q.ans === 'number' ? q.ans : 0] || '—');
        html += '<div class="ait-exam-res-item ' + (a.right ? 'ait-exam-correct' : 'ait-exam-wrong') + '">' +
            '<div style="font-size:.82rem;font-weight:700;color:#e2e8f0;margin-bottom:5px"><span style="color:#818cf8">Q' + (i + 1) + '.&nbsp;</span>' + _esc(q.q || '') + '</div>' +
            '<div style="font-size:.76rem;font-weight:700;color:' + (a.right ? '#22c55e' : '#ef4444') + ';margin-bottom:3px">' + (a.right ? '✅ Correct' : '❌ Wrong') + '</div>' +
            (a.right ? '' : '<div style="font-size:.74rem;color:#94a3b8;margin-bottom:2px">Your answer: ' + picked + '</div>') +
            '<div style="font-size:.74rem;color:#4ade80;margin-bottom:3px">Correct: ' + correctOp + '</div>' +
            (q.exp ? '<div style="font-size:.73rem;color:#94a3b8;font-style:italic">' + _esc(q.exp) + '</div>' : '') +
            '</div>';
    });

    html += '</div></div>';
    modal.innerHTML = html;
    var retryBtn = document.getElementById('ait-exam-retry');
    if (retryBtn) retryBtn.addEventListener('click', _openExamMode);
}

function _esc(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/* ══════════════════════════════════════════════════════════════
   LIFECYCLE HOOKS  (called from aqs-study.js)
   ══════════════════════════════════════════════════════════════ */

window.aitProOnShow = function () {
    _teslaShow();
};

window.aitProOnState = function (state) {
    /* Update Tesla overlay if visible */
    var ol = document.getElementById('ait-tesla-overlay');
    if (ol && ol.classList.contains('show')) _teslaSetStatus(state);
    /* Update interrupt button */
    _updateInterruptBtn(state);
};

window.aitProOnAiText = function (text) {
    var ol = document.getElementById('ait-tesla-overlay');
    if (ol && ol.classList.contains('show') && text) _teslaSetText(text);
};

window.aitProOnTranscript = function (text) {
    var ol = document.getElementById('ait-tesla-overlay');
    if (ol && ol.classList.contains('show')) {
        _teslaSetYouSaid(text ? text.replace(/^🎙 You: /, '') : '');
    }
};

window.aitProOnSetupDone = function () {
    /* Hide Tesla overlay with a brief delay so user sees the final greeting */
    _teslaHideVoiceGrid();
    setTimeout(_teslaHide, 1800);
};

window.aitProOnVoiceGrid = function (voices) {
    var ol = document.getElementById('ait-tesla-overlay');
    if (ol && ol.classList.contains('show')) _teslaShowVoiceGrid(voices);
};

window.aitProOnVoiceGridHide = function () {
    _teslaHideVoiceGrid();
};

/* ══════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════ */
function _init() {
    _injectCSS();
    _buildInterruptBtn();
    _buildModeChooser();

    /* Patch test buttons once the DOM is ready */
    function _tryPatchTest() {
        if (typeof window._stdOpenTestOrig === 'function') {
            _patchOpenTest();
        } else {
            setTimeout(_tryPatchTest, 400);
        }
    }
    setTimeout(_tryPatchTest, 600);
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
} else {
    _init();
}

})();
