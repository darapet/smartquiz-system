/* ============================================================
   AQS Puzzle Battle — aqs-puzzle.js
   4 modes: quiz, word, crossword, jigsaw
   Up to 10 real-time players via Firebase RTDB
   ============================================================ */
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getDatabase, ref, set, get, update, onValue, off, serverTimestamp as rtSts }
    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const app  = getApp();
const rtdb = getDatabase(app);
const auth = getAuth(app);

/* ── State ─────────────────────────────────────────────── */
let G = {
    myPos: null, myName: '', roomCode: '', isHost: false,
    mode: 'quiz', subject: '', numQ: 10, timePerQ: 30, maxPlayers: 10,
    players: {}, questions: [], currentQ: 0,
    myScore: 0, myAnswers: {}, correctInRow: 0,
    qTimerInterval: null, timerLeft: 30,
    listeners: {}, wordCorrectOrder: 0,
    cwActive: null, cwSolved: {}, // crossword
    jigsawPieces: {}, // pos -> Set of piece indices
    status: 'idle',
};

/* ── Helpers ────────────────────────────────���───────────── */
function $(id){ return document.getElementById(id); }
function showScreen(name){
    document.querySelectorAll('.pz-screen').forEach(function(s){ s.classList.remove('active'); });
    var s = document.getElementById('pz-screen-'+name);
    if(s){ s.classList.add('active'); window.scrollTo(0,0); }
}
function toast(msg, dur){
    var ct = $('pz-toast');
    if(!ct) return;
    var el = document.createElement('div');
    el.className = 'pz-toast-item';
    el.textContent = msg;
    ct.appendChild(el);
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, dur||2800);
}
function avatar(name){ return (name||'?').charAt(0).toUpperCase(); }
function genCode(){
    var c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r='';
    for(var i=0;i<6;i++) r+=c[Math.floor(Math.random()*c.length)];
    return r;
}
function rtRef(path){ return ref(rtdb, path); }
function offListener(key){
    if(G.listeners[key]){ off(G.listeners[key].r, 'value', G.listeners[key].fn); delete G.listeners[key]; }
}
function addListener(key, path, fn){
    offListener(key);
    var r = rtRef(path);
    G.listeners[key] = { r, fn };
    onValue(r, fn);
}

/* ── DOM Init ───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', function(){
    setupSetupScreen();
    setupLobbyScreen();
    setupChatInput();

    /* Prefill name from auth or localStorage */
    setTimeout(function(){
        var u = auth.currentUser || window._aqsFirebaseUser;
        var saved = localStorage.getItem('pz_player_name') || (u && (u.displayName || '')) || '';
        var inp = $('pz-host-name'); if(inp && saved) inp.value = saved;
        var jnp = $('pz-join-name'); if(jnp && saved) jnp.value = saved;
    }, 800);
});

/* ══════════════════════════════════════════════════════════
   SETUP SCREEN
══════════════════════════════════════════════════════════ */
function setupSetupScreen(){
    /* Mode cards */
    document.querySelectorAll('.pz-mode-card').forEach(function(c){
        c.addEventListener('click', function(){
            document.querySelectorAll('.pz-mode-card').forEach(function(x){ x.classList.remove('selected'); });
            c.classList.add('selected');
            G.mode = c.dataset.mode;
        });
    });
    /* Default select first mode */
    var first = document.querySelector('.pz-mode-card');
    if(first){ first.classList.add('selected'); G.mode = first.dataset.mode; }

    /* Segment controls */
    document.querySelectorAll('.pz-seg').forEach(function(seg){
        seg.querySelectorAll('.pz-seg-btn').forEach(function(btn){
            btn.addEventListener('click', function(){
                seg.querySelectorAll('.pz-seg-btn').forEach(function(b){ b.classList.remove('active'); });
                btn.classList.add('active');
                var key = seg.dataset.key, val = btn.dataset.val;
                if(key === 'numQ') G.numQ = parseInt(val);
                if(key === 'timePerQ') G.timePerQ = parseInt(val);
                if(key === 'maxPlayers') G.maxPlayers = parseInt(val);
            });
        });
        /* Activate first button by default */
        var firstBtn = seg.querySelector('.pz-seg-btn');
        if(firstBtn) firstBtn.classList.add('active');
    });

    /* Tab: Create / Join */
    ['pz-tab-create','pz-tab-join'].forEach(function(id){
        $(id) && $(id).addEventListener('click', function(){
            $('pz-tab-create').classList.toggle('active', id==='pz-tab-create');
            $('pz-tab-join').classList.toggle('active', id==='pz-tab-join');
            $('pz-create-panel').classList.toggle('pz-hide', id!=='pz-tab-create');
            $('pz-join-panel').classList.toggle('pz-hide', id==='pz-tab-create');
        });
    });

    /* Create room */
    $('pz-btn-create') && $('pz-btn-create').addEventListener('click', createRoom);
    /* Join room */
    $('pz-btn-join') && $('pz-btn-join').addEventListener('click', joinRoom);

    /* Enter key on join */
    $('pz-join-code') && $('pz-join-code').addEventListener('keydown', function(e){
        if(e.key==='Enter') joinRoom();
    });
}

/* ══════════════════════════════════════════════════════════
   CREATE ROOM (HOST)
══════════════════════════════════════════════════════════ */
async function createRoom(){
    var name = ($('pz-host-name')||{}).value.trim();
    var subj = ($('pz-subject-inp')||{}).value.trim();
    if(!name){ toast('Enter your name first'); return; }
    if(!subj){ toast('Enter a subject'); return; }

    var btn = $('pz-btn-create');
    btn.disabled = true; btn.textContent = 'Creating…';

    try {
        G.myName = name; G.subject = subj; G.isHost = true;
        G.myPos  = 0; G.roomCode = genCode();
        localStorage.setItem('pz_player_name', name);

        var roomData = {
            mode: G.mode, subject: G.subject,
            numQ: G.numQ, timePerQ: G.timePerQ,
            maxPlayers: G.maxPlayers,
            status: 'waiting',
            hostPos: 0, hostName: G.myName,
            created: rtSts(),
            players: { '0': { name: G.myName, score: 0, pos: 0, joined: Date.now() } }
        };
        await set(rtRef('puzzle_rooms/' + G.roomCode), roomData);

        enterLobby();
    } catch(e) {
        toast('Could not create room: ' + e.message);
        btn.disabled = false; btn.textContent = 'Create Room';
    }
}

/* ══════════════════════════════════════════════════════════
   JOIN ROOM (PLAYER)
══════════════════════════════════════════════════════════ */
async function joinRoom(){
    var name = ($('pz-join-name')||{}).value.trim();
    var code = ($('pz-join-code')||{}).value.trim().toUpperCase();
    if(!name){ toast('Enter your name'); return; }
    if(code.length < 4){ toast('Enter the 6-character room code'); return; }

    var btn = $('pz-btn-join');
    btn.disabled = true; btn.textContent = 'Joining…';

    try {
        var snap = await get(rtRef('puzzle_rooms/' + code));
        if(!snap.exists()){ throw new Error('Room not found. Check the code.'); }
        var room = snap.val();
        if(room.status !== 'waiting'){ throw new Error('Game already started.'); }

        var players = room.players || {};
        var taken   = Object.keys(players).map(Number);
        if(taken.length >= room.maxPlayers){ throw new Error('Room is full.'); }

        /* Pick lowest free position */
        var pos = 0;
        while(taken.includes(pos)) pos++;

        G.myName = name; G.subject = room.subject; G.isHost = false;
        G.myPos  = pos;  G.roomCode = code;
        G.mode   = room.mode; G.numQ = room.numQ;
        G.timePerQ = room.timePerQ; G.maxPlayers = room.maxPlayers;
        localStorage.setItem('pz_player_name', name);

        await set(rtRef('puzzle_rooms/'+code+'/players/'+pos),
            { name: G.myName, score: 0, pos: pos, joined: Date.now() });

        enterLobby();
    } catch(e) {
        toast(e.message);
        btn.disabled = false; btn.textContent = 'Join Room';
    }
}

/* ══════════════════════════════════════════════════════════
   LOBBY
══════════════════════════════════════════════════════════ */
function setupLobbyScreen(){
    $('pz-copy-code') && $('pz-copy-code').addEventListener('click', function(){
        navigator.clipboard && navigator.clipboard.writeText(G.roomCode);
        toast('Room code copied! 📋');
    });
    $('pz-lobby-leave') && $('pz-lobby-leave').addEventListener('click', leaveRoom);
    $('pz-btn-start')  && $('pz-btn-start').addEventListener('click', startGame);
}

function enterLobby(){
    showScreen('lobby');
    $('pz-lobby-code').textContent  = G.roomCode;
    $('pz-lobby-mode').textContent  = modeLabel(G.mode);
    $('pz-lobby-subj').textContent  = G.subject;
    $('pz-btn-start') && ($('pz-btn-start').style.display = G.isHost ? '' : 'none');
    $('pz-lobby-wait-msg') && ($('pz-lobby-wait-msg').style.display = G.isHost ? 'none' : '');

    listenChat();
    /* Listen for room changes */
    addListener('room', 'puzzle_rooms/'+G.roomCode, function(snap){
        if(!snap.exists()){ toast('Room closed'); showScreen('setup'); return; }
        var room = snap.val();
        G.players = room.players || {};
        renderLobbyPlayers();
        if(room.status === 'generating') showGenerating();
        if(room.status === 'playing')    enterGame(room);
        if(room.status === 'results')    showResults(room);
    });
}

function modeLabel(m){
    return {quiz:'⚡ Quiz Battle',word:'🔤 Word Hunt',crossword:'📝 Crossword',jigsaw:'🧩 Jigsaw'}[m] || m;
}

function renderLobbyPlayers(){
    var grid = $('pz-lobby-players');
    if(!grid) return;
    var slots = [];
    for(var i=0; i<G.maxPlayers; i++){
        var p = G.players[i];
        if(p){
            var cls = (i===G.myPos) ? 'pz-player-slot filled me-slot' :
                      (i===0) ? 'pz-player-slot filled host-slot' : 'pz-player-slot filled';
            slots.push('<div class="'+cls+'">' +
                '<div class="pz-player-avatar">'+avatar(p.name)+'</div>' +
                '<div class="pz-player-name">'+esc(p.name)+'</div>' +
                '<div class="pz-player-badge">'+(i===0?'Host':'Player'+(i+1))+(i===G.myPos?' (you)':'')+'</div>' +
                '</div>');
        } else {
            slots.push('<div class="pz-player-slot pz-empty-slot">' +
                '<div class="pz-player-avatar">+</div>' +
                '<div class="pz-player-name" style="color:#475569">Empty</div>' +
                '</div>');
        }
    }
    grid.innerHTML = slots.join('');
    var cnt = Object.keys(G.players).length;
    var el = $('pz-lobby-count');
    if(el) el.textContent = cnt + '/' + G.maxPlayers + ' player'+(cnt!==1?'s':'')+' ready';
}

function leaveRoom(){
    if(G.roomCode && G.myPos !== null){
        /* Remove player from room */
        set(rtRef('puzzle_rooms/'+G.roomCode+'/players/'+G.myPos), null).catch(function(){});
        if(G.isHost){
            set(rtRef('puzzle_rooms/'+G.roomCode+'/status'), 'closed').catch(function(){});
        }
    }
    Object.keys(G.listeners).forEach(offListener);
    showScreen('setup');
}

/* ══════════════════════════════════════════════════════════
   START GAME (host only) → AI GENERATE
══════════════════════════════════════════════════════════ */
async function startGame(){
    var cnt = Object.keys(G.players).length;
    if(cnt < 1){ toast('Need at least 1 player'); return; }

    var btn = $('pz-btn-start');
    btn.disabled = true; btn.textContent = 'Generating…';

    /* Signal generating state */
    await update(rtRef('puzzle_rooms/'+G.roomCode), { status: 'generating' });
    showGenerating();
    updateGenBar(10);

    try {
        G.questions = await generateQuestions();
        updateGenBar(90);

        /* Store questions in RTDB */
        var qObj = {};
        G.questions.forEach(function(q, i){ qObj[i] = q; });

        updateGenBar(95);
        await update(rtRef('puzzle_rooms/'+G.roomCode), {
            status: 'playing',
            questions: qObj,
            currentQ: 0,
            qStart: Date.now()
        });
    } catch(e) {
        toast('AI error: ' + e.message + '. Please try again.');
        btn.disabled = false; btn.textContent = 'Start Game';
        await update(rtRef('puzzle_rooms/'+G.roomCode), { status: 'waiting' });
    }
}

function showGenerating(){
    showScreen('generating');
}

function updateGenBar(pct){
    var bar = $('pz-gen-bar');
    if(bar) bar.style.width = pct + '%';
    var lbl = $('pz-gen-label');
    if(lbl) lbl.textContent = pct < 50 ? 'Connecting to AI…' : pct < 85 ? 'Generating questions…' : 'Almost ready…';
}

async function generateQuestions(){
    if(typeof window.groqFetch !== 'function') throw new Error('AI not ready');

    var prompts = {
        quiz: 'Generate ' + G.numQ + ' multiple-choice quiz questions about "' + G.subject + '". ' +
              'Return ONLY a JSON array with no markdown: [{q:"question",options:["A","B","C","D"],answer:0,explanation:"why"}]. ' +
              'answer is 0-indexed. Make questions engaging and varied in difficulty.',

        word: 'Generate ' + G.numQ + ' word-guessing clues about "' + G.subject + '". ' +
              'Return ONLY a JSON array: [{word:"ANSWER",clue:"description of the word",category:"category"}]. ' +
              'Words must be single English words, 3-10 letters, ALL CAPS. Clues should be descriptive but not give the word away.',

        crossword: 'Generate ' + G.numQ + ' crossword clue-answer pairs about "' + G.subject + '". ' +
                   'Return ONLY a JSON array: [{clue:"clue text",answer:"WORD",direction:"across"|"down",num:1}]. ' +
                   'Answers must be single words, 3-10 letters, ALL CAPS. Number them 1-' + G.numQ + '.',

        jigsaw: 'Generate 9 trivia questions about "' + G.subject + '" with short one-word or one-number answers. ' +
                'Return ONLY a JSON array: [{q:"question?",answer:"WORD",hint:"one-word hint"}]. ' +
                'Answers must be single words or numbers, ALL CAPS.'
    };

    var prompt = prompts[G.mode] || prompts.quiz;

    var res  = await window.groqFetch({ model: 'llama-3.3-70b-versatile', messages:[
        {role:'system',content:'You are a quiz question generator. Output ONLY valid JSON arrays, no markdown, no explanation.'},
        {role:'user',  content: prompt}
    ], max_tokens: 3000, temperature: 0.7 });
    var data = await res.json();
    var text = (((data.choices||[])[0]||{}).message||{}).content || '';

    /* Extract JSON array */
    var match = text.match(/\[[\s\S]*\]/);
    if(!match) throw new Error('AI returned invalid format');
    var arr = JSON.parse(match[0]);
    if(!Array.isArray(arr) || arr.length < 1) throw new Error('No questions generated');

    /* Sanitize */
    if(G.mode === 'jigsaw') return arr.slice(0, 9);
    return arr.slice(0, G.numQ);
}

/* ══════════════════════════════════════════════════════════
   GAME SCREENS
══════════════════════════════════════════════════════════ */
function enterGame(room){
    G.questions = Object.values(room.questions || {});
    G.currentQ  = room.currentQ || 0;
    G.myScore   = (G.players[G.myPos]||{}).score || 0;
    G.myAnswers = {};

    showScreen('game');
    renderScoreboard();
    renderQProgress();
    $('pz-game-mode-lbl') && ($('pz-game-mode-lbl').textContent = modeLabel(G.mode));

    /* Listen for question changes (host advances) */
    addListener('room_game', 'puzzle_rooms/'+G.roomCode, function(snap){
        if(!snap.exists()) return;
        var roomData = snap.val();  /* FIXED: use snapshot not stale closure var */
        G.players = roomData.players || {};
        renderScoreboard();

        if(roomData.status === 'results'){ showResults(roomData); return; }
        if(roomData.status !== 'playing') return;

        var newQ = roomData.currentQ || 0;
        G.questions = Object.values(roomData.questions || {});
        renderQProgress();

        if(newQ !== G.currentQ || !G.renderedFirstQ){
            G.currentQ = newQ;
            G.renderedFirstQ = true;
            G.myAnswers[newQ] = undefined;
            renderQuestion();
        }
    });

    G.renderedFirstQ = false;
}

function renderQuestion(){
    if(G.qTimerInterval){ clearInterval(G.qTimerInterval); G.qTimerInterval = null; }
    var q = G.questions[G.currentQ];
    if(!q){ return; }

    $('pz-q-num-label') && ($('pz-q-num-label').textContent =
        'Question ' + (G.currentQ+1) + ' of ' + G.questions.length);

    if(G.mode === 'quiz')       renderQuizQ(q);
    else if(G.mode === 'word')  renderWordQ(q);
    else if(G.mode === 'crossword') renderCrosswordQ();
    else if(G.mode === 'jigsaw')    renderJigsawQ(q);

    startTimer();
}

/* ─── TIMER ────────────────────────────────────────────── */
function startTimer(){
    G.timerLeft = (G.mode === 'word' || G.mode === 'crossword') ? G.timePerQ * 2 : G.timePerQ;
    updateTimer(G.timerLeft);
    G.qTimerInterval = setInterval(function(){
        G.timerLeft--;
        updateTimer(G.timerLeft);
        if(G.timerLeft <= 0){
            clearInterval(G.qTimerInterval);
            G.qTimerInterval = null;
            onTimerEnd();
        }
    }, 1000);
}

function updateTimer(t){
    var val = $('pz-timer-val'); if(val) val.textContent = Math.max(0,t);
    var R = 32, C = 2*Math.PI*R, used = Math.max(0, G.timerLeft);
    var max = (G.mode==='word'||G.mode==='crossword') ? G.timePerQ*2 : G.timePerQ;
    var pct = Math.max(0, used/max);
    var fg = $('pz-timer-fg');
    if(fg){
        fg.style.strokeDashoffset = C - pct*C;
        if(t <= 5) fg.classList.add('urgent'); else fg.classList.remove('urgent');
    }
}

function onTimerEnd(){
    /* Show correct answer briefly, then advance if host */
    revealAnswer();
    if(G.isHost){
        setTimeout(function(){
            if(G.mode === 'crossword'){
                /* Crossword has one timer for the whole puzzle - end the game */
                update(rtRef('puzzle_rooms/'+G.roomCode), { status: 'results' }).catch(function(){});
            } else {
                advanceQuestion();
            }
        }, 2500);
    }
}

function revealAnswer(){
    var q = G.questions[G.currentQ];
    if(!q) return;
    if(G.mode === 'quiz'){
        var opts = document.querySelectorAll('.pz-option');
        opts.forEach(function(opt, i){
            opt.disabled = true;
            if(i === q.answer) opt.classList.add('correct');
            else if(opt.classList.contains('selected')) opt.classList.add('wrong');
        });
        /* Show explanation */
        if(q.explanation){
            var ex = $('pz-explanation');
            if(ex){ ex.textContent = '💡 ' + q.explanation; ex.style.display = ''; }
        }
    }
    if(G.mode === 'word' || G.mode === 'crossword' || G.mode === 'jigsaw'){
        var wFb = $('pz-word-feedback');
        if(wFb && G.myAnswers[G.currentQ] === undefined){
            wFb.textContent = '⏰ Time! Answer was: ' + (q.word || q.answer);
            wFb.className = 'pz-word-feedback wrong';
        }
        /* Reveal letters in blank cells */
        if(G.mode === 'word' && q.word){
            revealAllBlanks(q.word);
        }
    }
}

/* ─── QUIZ MODE ─────────────────────────────────────────── */
function renderQuizQ(q){
    var zone = $('pz-mode-quiz');
    if(!zone) return;
    $('pz-mode-word') && ($('pz-mode-word').style.display='none');
    $('pz-mode-crossword') && ($('pz-mode-crossword').style.display='none');
    $('pz-mode-jigsaw') && ($('pz-mode-jigsaw').style.display='none');
    zone.style.display = '';

    $('pz-q-text').textContent = q.q || '';
    var ex = $('pz-explanation'); if(ex){ ex.textContent=''; ex.style.display='none'; }

    var cont = $('pz-options');
    if(!cont) return;
    var letters = ['A','B','C','D'];
    cont.innerHTML = (q.options||[]).map(function(opt, i){
        return '<button class="pz-option" data-idx="'+i+'">' +
               '<span class="pz-option-letter">'+letters[i]+'</span>' +
               esc(opt) + '</button>';
    }).join('');
    cont.querySelectorAll('.pz-option').forEach(function(btn){
        btn.addEventListener('click', function(){
            if(G.myAnswers[G.currentQ] !== undefined) return;
            var idx = parseInt(btn.dataset.idx);
            submitAnswer(idx);
            btn.classList.add('selected');
            cont.querySelectorAll('.pz-option').forEach(function(b){ b.disabled = true; });
            /* Immediate visual feedback */
            if(idx === G.questions[G.currentQ].answer){
                btn.classList.add('correct');
                showAnswerOverlay('✅');
            } else {
                btn.classList.add('wrong');
                cont.querySelectorAll('.pz-option')[G.questions[G.currentQ].answer].classList.add('correct');
                showAnswerOverlay('❌');
            }
        });
    });
}

/* ─── WORD HUNT MODE ────────────────────────────────────── */
function renderWordQ(q){
    var zone = $('pz-mode-word');
    if(!zone) return;
    $('pz-mode-quiz') && ($('pz-mode-quiz').style.display='none');
    $('pz-mode-crossword') && ($('pz-mode-crossword').style.display='none');
    $('pz-mode-jigsaw') && ($('pz-mode-jigsaw').style.display='none');
    zone.style.display = '';
    G.wordCorrectOrder = 0;

    $('pz-word-clue').textContent = q.clue || '';
    if(q.category) $('pz-word-clue').textContent = '[' + q.category + '] ' + q.clue;

    /* Blanks */
    var word = (q.word||'').toUpperCase();
    var blanks = $('pz-blanks');
    if(blanks){
        blanks.innerHTML = word.split('').map(function(ch, i){
            return '<div class="pz-blank-cell" id="pz-blank-'+i+'">_</div>';
        }).join('');
    }

    var inp = $('pz-word-input');
    if(inp){ inp.value=''; inp.disabled=false; inp.focus(); }

    var fb = $('pz-word-feedback');
    if(fb){ fb.className='pz-word-feedback'; fb.textContent=''; }

    /* Submit on enter or button */
    var sendFn = function(){
        if(G.myAnswers[G.currentQ] !== undefined) return;
        var typed = (inp.value||'').trim().toUpperCase();
        if(!typed) return;
        if(typed === word){
            submitAnswer(typed);
            inp.disabled = true;
            fb.textContent = '✅ Correct! +'+calcWordPoints()+' points';
            fb.className = 'pz-word-feedback correct';
            revealAllBlanks(word);
            showAnswerOverlay('✅');
        } else {
            fb.textContent = '❌ Not quite — try again!';
            fb.className = 'pz-word-feedback wrong';
            inp.value = '';
            setTimeout(function(){ if(fb) fb.className='pz-word-feedback'; },1200);
        }
    };

    inp && inp.addEventListener('keydown', function(e){
        if(e.key==='Enter') sendFn();
    });
    var sendBtn = $('pz-word-send');
    if(sendBtn){
        var newBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newBtn, sendBtn);
        newBtn.addEventListener('click', sendFn);
    }

    /* Reveal one letter every 8 seconds as hint */
    var revIdx = 0;
    var revInt = setInterval(function(){
        if(G.myAnswers[G.currentQ] !== undefined){ clearInterval(revInt); return; }
        if(revIdx >= word.length){ clearInterval(revInt); return; }
        var cell = $('pz-blank-'+revIdx);
        if(cell){ cell.textContent = word[revIdx]; cell.classList.add('revealed'); }
        revIdx++;
    }, 8000);
}

function calcWordPoints(){
    /* Fewer players answered → more points */
    var answered = Object.values(G.players).filter(function(p){
        return (p.score || 0) > (G.players[G.myPos]||{}).score || false;
    }).length;
    return Math.max(5, 20 - answered*3);
}

function revealAllBlanks(word){
    word.split('').forEach(function(ch,i){
        var cell = $('pz-blank-'+i);
        if(cell){ cell.textContent = ch; cell.classList.add('revealed'); }
    });
}

/* ─── CROSSWORD MODE ────────────────────────────────────── */
function renderCrosswordQ(){
    var zone = $('pz-mode-crossword');
    if(!zone) return;
    $('pz-mode-quiz') && ($('pz-mode-quiz').style.display='none');
    $('pz-mode-word') && ($('pz-mode-word').style.display='none');
    $('pz-mode-jigsaw') && ($('pz-mode-jigsaw').style.display='none');
    zone.style.display = '';
    G.cwSolved = {};

    /* Build clue lists */
    var across = G.questions.filter(function(q){ return q.direction==='across'; });
    var down   = G.questions.filter(function(q){ return q.direction==='down'; });
    /* Fallback: split questions evenly */
    if(!across.length && !down.length){
        G.questions.forEach(function(q,i){
            q.direction = (i%2===0) ? 'across' : 'down';
            q.num = i+1;
        });
        across = G.questions.filter(function(q){ return q.direction==='across'; });
        down   = G.questions.filter(function(q){ return q.direction==='down'; });
    }

    var buildList = function(qs, dir){
        return qs.map(function(q){
            return '<div class="pz-cw-clue-item" data-qidx="'+G.questions.indexOf(q)+'" id="pz-cw-'+dir+'-'+q.num+'">' +
                   '<span class="pz-cw-num">'+q.num+'</span>' +
                   '<span class="pz-cw-clue-text">'+esc(q.clue||'')+'</span>' +
                   '</div>';
        }).join('');
    };

    var acrossEl = $('pz-cw-across'); if(acrossEl) acrossEl.innerHTML = buildList(across,'across');
    var downEl   = $('pz-cw-down');   if(downEl)   downEl.innerHTML   = buildList(down,'down');

    /* Click clue to activate */
    zone.querySelectorAll('.pz-cw-clue-item').forEach(function(item){
        item.addEventListener('click', function(){
            if(item.classList.contains('solved')) return;
            zone.querySelectorAll('.pz-cw-clue-item').forEach(function(x){ x.classList.remove('active'); });
            item.classList.add('active');
            G.cwActive = parseInt(item.dataset.qidx);
            var q = G.questions[G.cwActive];
            var lbl = $('pz-cw-active-clue');
            if(lbl) lbl.textContent = (q.num||'?') + ' ' + (q.direction||'') + ': ' + (q.clue||'');
            var inp = $('pz-cw-answer-inp');
            if(inp){ inp.value=''; inp.focus(); }
        });
    });

    var cwSubmit = function(){
        if(G.cwActive === null) return;
        var inp = $('pz-cw-answer-inp');
        var typed = (inp.value||'').trim().toUpperCase();
        var q = G.questions[G.cwActive];
        if(!q || !typed) return;
        if(typed === (q.answer||'').toUpperCase()){
            G.cwSolved[G.cwActive] = true;
            var itemEl = zone.querySelector('[data-qidx="'+G.cwActive+'"]');
            if(itemEl) itemEl.classList.add('solved');
            var pts = 12;
            G.myScore += pts;
            G.myAnswers[G.cwActive] = typed;
            updateMyScore();
            toast('✅ Correct! +'+pts+' pts');
            inp.value = '';
            G.cwActive = null;
            var lbl = $('pz-cw-active-clue'); if(lbl) lbl.textContent='Select a clue to answer';
            showAnswerOverlay('✅');
            /* Check if all solved */
            if(Object.keys(G.cwSolved).length >= G.questions.length){
                toast('🎉 You solved the crossword!');
                if(G.isHost) setTimeout(advanceQuestion, 2000);
            }
        } else {
            toast('❌ Wrong! Try another clue');
            inp.value='';
        }
    };

    var cwBtn = $('pz-cw-submit');
    if(cwBtn){
        var nb = cwBtn.cloneNode(true);
        cwBtn.parentNode.replaceChild(nb, cwBtn);
        nb.addEventListener('click', cwSubmit);
    }
    var cwInp = $('pz-cw-answer-inp');
    if(cwInp){
        cwInp.addEventListener('keydown', function(e){ if(e.key==='Enter') cwSubmit(); });
    }
}

/* ─── JIGSAW MODE ───────────────────────────────────────── */
function renderJigsawQ(q){
    var zone = $('pz-mode-jigsaw');
    if(!zone) return;
    $('pz-mode-quiz') && ($('pz-mode-quiz').style.display='none');
    $('pz-mode-word') && ($('pz-mode-word').style.display='none');
    $('pz-mode-crossword') && ($('pz-mode-crossword').style.display='none');
    zone.style.display = '';

    $('pz-jigsaw-q-text').textContent = q.q || '';
    if(q.hint) $('pz-jigsaw-hint').textContent = 'Hint: ' + q.hint;

    var inp = $('pz-jigsaw-input');
    if(inp){ inp.value=''; inp.focus(); }
    var fb = $('pz-jigsaw-feedback'); if(fb){ fb.className='pz-word-feedback'; fb.textContent=''; }

    /* My puzzle grid */
    renderJigsawGrid(G.myPos);

    var submitFn = function(){
        if(G.myAnswers[G.currentQ] !== undefined) return;
        var typed = (inp.value||'').trim().toUpperCase();
        var correct = (q.answer||'').toUpperCase();
        if(!typed) return;
        if(typed === correct || levenshtein(typed,correct) <= 1){
            submitAnswer(typed);
            inp.disabled = true;
            if(fb){ fb.textContent='✅ Piece unlocked! +10 pts'; fb.className='pz-word-feedback correct'; }
            /* Unlock piece on board */
            if(!G.jigsawPieces[G.myPos]) G.jigsawPieces[G.myPos] = new Set();
            G.jigsawPieces[G.myPos].add(G.currentQ);
            renderJigsawGrid(G.myPos);
            showAnswerOverlay('🧩');
            updateMyScore();
        } else {
            if(fb){ fb.textContent='❌ Not quite! Try again'; fb.className='pz-word-feedback wrong'; }
            inp.value='';
            setTimeout(function(){ if(fb) fb.className='pz-word-feedback'; },1200);
        }
    };

    inp && inp.addEventListener('keydown', function(e){ if(e.key==='Enter') submitFn(); });
    var jBtn = $('pz-jigsaw-submit');
    if(jBtn){
        var nb = jBtn.cloneNode(true);
        jBtn.parentNode.replaceChild(nb, jBtn);
        nb.addEventListener('click', submitFn);
    }
}

function renderJigsawGrid(myPos){
    var grid = $('pz-jigsaw-grid');
    if(!grid) return;
    var pieces = G.jigsawPieces[myPos] || new Set();
    var html = '';
    for(var i=0;i<9;i++){
        var unlocked = pieces.has(i);
        html += '<div class="pz-jigsaw-piece '+(unlocked?'unlocked':'locked')+'" id="pz-piece-'+i+'"></div>';
    }
    grid.innerHTML = html;
}

function levenshtein(a,b){
    var m=a.length,n=b.length,dp=[];
    for(var i=0;i<=m;i++){ dp[i]=[i]; for(var j=1;j<=n;j++){ dp[i][j]=i?0:j; } }
    for(var i=1;i<=m;i++) for(var j=1;j<=n;j++)
        dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1]);
    return dp[m][n];
}

/* ══════════════════════════════════════════════════════════
   ANSWER SUBMISSION
══════════════════════════════════════════════════════════ */
async function submitAnswer(val){
    G.myAnswers[G.currentQ] = val;
    var tLeft = G.timerLeft;
    var maxT  = (G.mode==='word'||G.mode==='crossword') ? G.timePerQ*2 : G.timePerQ;

    /* Score for quiz mode */
    var pts = 0;
    if(G.mode === 'quiz'){
        var correct = val === G.questions[G.currentQ].answer;
        if(correct){
            pts = 10 + Math.round((tLeft/maxT)*5); /* speed bonus up to 5 */
            G.myScore += pts;
            G.correctInRow++;
        } else {
            G.correctInRow = 0;
        }
        /* Combo bonus */
        if(G.correctInRow >= 3) pts += 3;
    }

    if(pts > 0) updateMyScore();

    /* Write answer to RTDB */
    try {
        var ansData = { val: String(val), t: Date.now() };
        if(G.mode === 'quiz') ansData.pts = pts;
        await set(rtRef('puzzle_rooms/'+G.roomCode+'/answers/'+G.myPos+'/q'+G.currentQ), ansData);
        if(pts > 0){
            await set(rtRef('puzzle_rooms/'+G.roomCode+'/players/'+G.myPos+'/score'), G.myScore);
        }
    } catch(e) {
        console.warn('[PZ] RTDB write failed:', e);
    }
}

async function updateMyScore(){
    /* Only syncs to RTDB - score is already updated in submitAnswer/caller */
    await set(rtRef('puzzle_rooms/'+G.roomCode+'/players/'+G.myPos+'/score'), G.myScore).catch(function(){});
    renderScoreboard();
}

/* ══════════════════════════════════════════════════════════
   ADVANCE QUESTION (host only)
══════════════════════════════════════════════════════════ */
async function advanceQuestion(){
    if(!G.isHost) return;
    var next = G.currentQ + 1;
    if(next >= G.questions.length){
        /* Game over */
        await update(rtRef('puzzle_rooms/'+G.roomCode), { status: 'results' });
    } else {
        await update(rtRef('puzzle_rooms/'+G.roomCode), { currentQ: next, qStart: Date.now() });
    }
}

/* ══════════════════════════════════════════════════════════
   SCOREBOARD
═════��════════════════════════════════════════════════════ */
function renderScoreboard(){
    var el = $('pz-scoreboard');
    if(!el) return;
    var sorted = Object.values(G.players).sort(function(a,b){ return (b.score||0)-(a.score||0); });
    el.innerHTML = sorted.map(function(p, i){
        var rankCls = i===0?'r1':i===1?'r2':i===2?'r3':'';
        var meCls   = p.pos===G.myPos?' me':'';
        return '<div class="pz-score-row'+meCls+'">' +
            '<div class="pz-score-rank '+rankCls+'">'+(i===0?'🥇':i===1?'🥈':i===2?'🥉':(i+1))+'</div>' +
            '<div class="pz-score-avatar">'+avatar(p.name)+'</div>' +
            '<div class="pz-score-name">'+esc(p.name)+(p.pos===G.myPos?' (you)':'')+'</div>' +
            '<div class="pz-score-pts">'+(p.score||0)+'</div>' +
            '</div>';
    }).join('');
}

function renderQProgress(){
    var el = $('pz-q-progress');
    if(!el || !G.questions.length) return;
    var limit = G.mode === 'jigsaw' ? 9 : G.questions.length;
    el.innerHTML = Array.from({length:limit}).map(function(_,i){
        var cls = i < G.currentQ ? (G.myAnswers[i]!==undefined?'done-correct':'done-wrong') :
                  i === G.currentQ ? 'current' : '';
        return '<div class="pz-q-dot '+cls+'"></div>';
    }).join('');
}

/* ══════════════════════════════════════════════════════════
   RESULTS
══════════════════════════════════════════════════════════ */
function showResults(room){
    offListener('room_game');
    if(G.qTimerInterval){ clearInterval(G.qTimerInterval); G.qTimerInterval = null; }
    showScreen('results');

    var players = Object.values(room.players||{}).sort(function(a,b){ return (b.score||0)-(a.score||0); });
    var winner  = players[0] || {};

    /* Winner banner */
    var isMe = winner.pos === G.myPos;
    var wb = $('pz-winner-banner');
    if(wb){
        $('pz-winner-name').textContent = winner.name || 'Unknown';
        $('pz-winner-pts').textContent  = (winner.score||0) + ' points';
        if(isMe) showCelebration(winner);
    }

    /* Podium (top 3) */
    renderPodium(players);

    /* Full table */
    var tbl = $('pz-results-table-body');
    if(tbl){
        tbl.innerHTML = players.map(function(p,i){
            var meCls = p.pos===G.myPos?' class="me"':'';
            var medal = i===0?'🥇':i===1?'🥈':i===2?'🥉':'';
            return '<tr'+meCls+'><td>'+medal+(i+1)+'</td><td>'+esc(p.name||'?')+(p.pos===G.myPos?' ⭐':'')+'</td><td>'+(p.score||0)+' pts</td></tr>';
        }).join('');
    }

    /* Buttons */
    $('pz-results-play-again') && ($('pz-results-play-again').onclick = function(){
        showScreen('setup');
    });
    $('pz-results-home') && ($('pz-results-home').onclick = function(){
        window.location.href = 'index.html';
    });
}

function renderPodium(sorted){
    var el = $('pz-podium');
    if(!el) return;
    var order = [sorted[1], sorted[0], sorted[2]]; // 2nd, 1st, 3rd visual order
    var heights = ['70px','100px','50px'];
    var crowns  = ['🥈','🥇','🥉'];
    var rankCls = ['rank-2','rank-1','rank-3'];

    el.innerHTML = order.map(function(p, i){
        if(!p) return '';
        return '<div class="pz-podium-step '+rankCls[i]+'">' +
            '<span class="pz-podium-crown">'+crowns[i]+'</span>' +
            '<div class="pz-podium-avatar">'+avatar(p.name)+'</div>' +
            '<div class="pz-podium-block" style="height:'+heights[i]+'"></div>' +
            '<div class="pz-podium-name">'+esc(p.name||'?')+'</div>' +
            '<div class="pz-podium-pts">'+(p.score||0)+' pts</div>' +
            '</div>';
    }).join('');
}

function showCelebration(winner){
    var cel = $('pz-celebration');
    if(!cel) return;
    $('pz-cel-winner').textContent = '🏆 ' + (winner.name||'You') + ' wins!';
    $('pz-cel-pts').textContent    = (winner.score||0) + ' points';
    cel.classList.add('show');
    $('pz-cel-close').onclick = function(){ cel.classList.remove('show'); };
    setTimeout(function(){ cel.classList.remove('show'); }, 6000);
}

/* ══════════════════════════════════════════════════════════
   CHAT
══════════════════════════════════════════════════════════ */
function setupChatInput(){
    var sendFn = function(){
        var inp = $('pz-chat-inp');
        var msg = (inp||{}).value.trim();
        if(!msg || !G.roomCode) return;
        var key = Date.now();
        set(rtRef('puzzle_rooms/'+G.roomCode+'/chat/'+key),
            {name: G.myName, msg: msg, t: key}).catch(function(){});
        inp.value = '';
    };
    $('pz-chat-send') && $('pz-chat-send').addEventListener('click', sendFn);
    $('pz-chat-inp') && $('pz-chat-inp').addEventListener('keydown', function(e){
        if(e.key==='Enter') sendFn();
    });
    /* Listen for chat */
    addListener('chat', 'puzzle_rooms/dummy/chat', function(){}); /* stub, replaced on room join */
}

function listenChat(){
    addListener('chat', 'puzzle_rooms/'+G.roomCode+'/chat', function(snap){
        if(!snap.exists()) return;
        var msgs = snap.val();
        var el = $('pz-chat-msgs');
        if(!el) return;
        var arr = Object.values(msgs).sort(function(a,b){ return a.t-b.t; }).slice(-30);
        el.innerHTML = arr.map(function(m){
            return '<div class="pz-chat-msg"><span class="pz-chat-name">'+esc(m.name||'?')+': </span>'+esc(m.msg||'')+'</div>';
        }).join('');
        el.scrollTop = el.scrollHeight;
    });
}

/* ══════════════════════════════════════════════════════════
   ANSWER OVERLAY FLASH
══════════════════════════════════════════════════════════ */
function showAnswerOverlay(emoji){
    var ov = $('pz-answer-overlay');
    if(!ov) return;
    $('pz-answer-overlay-inner').textContent = emoji;
    ov.classList.add('show');
    setTimeout(function(){ ov.classList.remove('show'); }, 700);
}

/* ══════════════════════════════════════════════════════════
   UTILITY
══════════════��═══════════════════════════════════════════ */
function esc(s){ var d=document.createElement('div'); d.textContent=s; return d.innerHTML; }
