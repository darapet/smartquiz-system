/* ═══════════════════════════════════════════════════════════
   DaraQuiz — AI Teacher Pro (voice classroom engine)
   AI: window.studyhubGroqFetch() from aqs-groq-key.js (same slot).
   Voice: Web Speech API (speechSynthesis + SpeechRecognition).
   ═══════════════════════════════════════════════════════════ */
(function () {
'use strict';

function $(id){ return document.getElementById(id); }
var LS = 'aqs_ai_teacher_prefs_v2';

var T = {
  step:0, teacherName:'', studentName:'', voiceURI:'', rate:1,
  voices:[], history:[], speaking:false, paused:false, listening:false,
  micWanted:false, thinking:false, started:false, recog:null, setupMode:null,
  pendingChunks:[], interimEl:null, silenceTimer:null
};
window.AITeacher = T;

/* ── UI state helpers ───────────────────────────────────── */
function orb(state, label){
  var o = $('ait-orb'); if(!o) return;
  o.classList.remove('speaking','listening','thinking');
  if(state) o.classList.add(state);
  var s = $('ait-orb-state'); if(s) s.textContent = label || 'Ready';
}
function setStatusIdle(){
  if(T.speaking) orb('speaking', (T.teacherName||'Teacher')+' is speaking');
  else if(T.listening) orb('listening','Listening…');
  else if(T.thinking) orb('thinking','Thinking…');
  else orb('', 'Ready');
}

/* ── Voices ─────────────────────────────────────────────── */
function guessGender(name){
  var n = (name||'').toLowerCase();
  var f = ['female','woman','samantha','victoria','karen','moira','tessa','fiona','zira','susan','allison','ava','serena','joana','amelie','anna','google uk english female','emma','sara','lucy','nora','aria'];
  var m = ['male','man','daniel','alex','fred','david','george','thomas','oliver','james','mark','google uk english male','rishi','aaron','arthur','liam','ryan'];
  for(var i=0;i<f.length;i++) if(n.indexOf(f[i])>-1) return 'Female';
  for(var j=0;j<m.length;j++) if(n.indexOf(m[j])>-1) return 'Male';
  return 'Neutral';
}
function loadVoices(){
  var all = window.speechSynthesis ? speechSynthesis.getVoices() : [];
  var en = all.filter(function(v){ return /^en/i.test(v.lang); });
  if(!en.length) en = all;
  /* prefer a gender mix, cap at 15 */
  var females = [], males = [], others = [];
  en.forEach(function(v){
    var g = guessGender(v.name);
    (g==='Female'?females:g==='Male'?males:others).push(v);
  });
  var picked = [], i = 0;
  while(picked.length < 10 && (i < females.length || i < males.length)){
    if(i < females.length) picked.push(females[i]);
    if(picked.length < 10 && i < males.length) picked.push(males[i]);
    i++;
  }
  for(var k=0; picked.length<10 && k<others.length; k++) picked.push(others[k]);
  T.voices = picked;
  renderVoices();
}
function renderVoices(){
  var box = $('ait-voice-list'); if(!box) return;
  if(!T.voices.length){ box.innerHTML = '<div class="ait-sub">No system voices detected — the AI will still write everything on screen.</div>'; return; }
  box.innerHTML = T.voices.map(function(v,i){
    return '<div class="ait-voice'+(v.voiceURI===T.voiceURI?' sel':'')+'" data-i="'+i+'" data-number="'+(i+1)+'">'+
      '<b>'+escapeHtml(shortName(v.name))+'</b><span>'+guessGender(v.name)+' · '+v.lang+'</span>'+
      '<div class="play">▶ Preview</div></div>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('.ait-voice'), function(el){
    el.onclick = function(){
      var v = T.voices[+el.dataset.i];
      T.voiceURI = v.voiceURI;
      renderVoices();
      speak('Voice ' + (i+1) + '. My name is ' + shortName(v.name) + '. This is how I sound when I teach you.', true);
    };
  });
}
function shortName(n){ return String(n).replace(/\s*\(.*?\)\s*/g,'').replace(/^(Microsoft|Google)\s+/i,'').trim() || n; }
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,function(c){ return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]; }); }
function currentVoice(){
  if(!window.speechSynthesis) return null;
  var all = speechSynthesis.getVoices();
  for(var i=0;i<all.length;i++) if(all[i].voiceURI===T.voiceURI) return all[i];
  return null;
}

/* ── Speaking (with barge-in) ───────────────────────────── */
function stopSpeak(){
  T.pendingChunks = [];
  T.speaking = false; T.paused = false;
  try{ speechSynthesis.cancel(); }catch(e){}
  var b = $('ait-pause'); if(b){ b.textContent='⏸'; b.classList.remove('active'); }
  setStatusIdle();
}
function chunkText(t){
  var parts = String(t).replace(/\s+/g,' ').match(/[^.!?;:]+[.!?;:]*/g) || [t];
  var out = [], buf = '';
  parts.forEach(function(p){
    if((buf+p).length > 190){ if(buf) out.push(buf.trim()); buf = p; }
    else buf += p;
  });
  if(buf.trim()) out.push(buf.trim());
  return out;
}
function speak(text, isPreview){
  if(!window.speechSynthesis || !text) return;
  /* Mobile browsers keep SpeechRecognition alive while speechSynthesis
     speaks. Stop listening before the teacher talks or the microphone
     captures the teacher's own voice and creates an echo/restart loop. */
  stopListening();
  stopSpeak();
  T.pendingChunks = chunkText(speechClean(text));
  T.speaking = true;
  setStatusIdle();
  nextChunk(isPreview);
}
function nextChunk(){
  if(!T.pendingChunks.length){ T.speaking = false; setStatusIdle(); return; }
  var u = new SpeechSynthesisUtterance(T.pendingChunks.shift());
  var v = currentVoice(); if(v) u.voice = v;
  u.rate = T.rate; u.pitch = 1; u.volume = 1;
  u.onend = function(){ if(T.speaking && !T.paused) nextChunk(); };
  u.onerror = function(){ if(T.speaking && !T.paused) nextChunk(); };
  try{ speechSynthesis.speak(u); }catch(e){}
}
/* strip markup/latex noise so the voice reads naturally */
function speechClean(t){
  return String(t)
    .replace(/\[BOARD\][\s\S]*?\[\/BOARD\]/gi,' ')
    .replace(/```[\s\S]*?```/g,' ')
    .replace(/\$\$([\s\S]*?)\$\$/g, function(_,m){ return ' ' + mathToWords(m) + ' '; })
    .replace(/\$([^$]*)\$/g, function(_,m){ return ' ' + mathToWords(m) + ' '; })
    .replace(/[*_#`>]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function mathToWords(m){
  return String(m)
    .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g,'$1 over $2')
    .replace(/\\sqrt\{([^{}]*)\}/g,'square root of $1')
    .replace(/\^\{?2\}?/g,' squared').replace(/\^\{?3\}?/g,' cubed')
    .replace(/\^\{?([^{}\s]+)\}?/g,' to the power $1')
    .replace(/_\{?([^{}\s]+)\}?/g,' sub $1')
    .replace(/\\times/g,' times ').replace(/\\div/g,' divided by ')
    .replace(/\\pm/g,' plus or minus ').replace(/\\pi/g,' pi ')
    .replace(/\\left|\\right|\\,|\\!/g,' ')
    .replace(/[\\{}]/g,' ').replace(/=/g,' equals ')
    .replace(/\s+/g,' ').trim();
}

/* ── Listening ──────────────────────────────────────────── */
function SR(){ return window.SpeechRecognition || window.webkitSpeechRecognition; }
function initRecog(){
  var C = SR(); if(!C) return null;
  var r = new C();
  r.continuous = true; r.interimResults = true; r.lang = 'en-US';
  r.onstart = function(){ T.listening = true; micBtn(true); setStatusIdle(); };
  r.onend   = function(){ T.listening = false; micBtn(false); setStatusIdle();
                          if(T.micWanted && T.started){ setTimeout(function(){ try{ r.start(); }catch(e){} }, 350); } };
  r.onerror = function(){ T.listening = false; micBtn(false); setStatusIdle(); };
  r.onresult = function(e){
    var interim = '', final = '';
    for(var i=e.resultIndex;i<e.results.length;i++){
      var txt = e.results[i][0].transcript;
      if(e.results[i].isFinal) final += txt + ' '; else interim += txt;
    }
    /* BARGE-IN: user started talking → hush the teacher */
    if((interim.trim().length > 1 || final.trim()) && T.speaking){ stopSpeak(); }
    if(interim.trim()) showInterim(interim.trim());
    if(final.trim()){
      clearTimeout(T.silenceTimer);
      var said = final.trim();
      if(T.setupMode){
        var setup = T.setupMode;
        T.setupMode = null;
        stopListening();
        clearInterim();
        setup.done(said);
        return;
      }
      /* wait for the user to actually finish before replying */
      T.silenceTimer = setTimeout(function(){ clearInterim(); handleUser(said); }, 900);
    }
  };
  return r;
}
function micBtn(on){
  var b = $('ait-mic'); if(!b) return;
  b.classList.toggle('on', !!on);
  b.textContent = on ? '🎙️' : '🎤';
}
function startListening(){
  if(!SR()){ toast('Speech input is not supported on this browser — you can type instead.'); return; }
  T.micWanted = true;
  if(!T.recog) T.recog = initRecog();
  try{ T.recog.start(); }catch(e){}
}
function stopListening(){
  T.micWanted = false;
  T.setupMode = null;
  try{ if(T.recog) T.recog.stop(); }catch(e){}
}
function maybeAutoListen(){ if(T.micWanted && !T.listening && T.started){ try{ T.recog && T.recog.start(); }catch(e){} } }
function listenForSetup(done){
  if(!SR()){ toast('Speech input is not supported here. You can type your answer instead.'); return; }
  T.setupMode = { done: done };
  startListening();
}
function showInterim(t){
  if(!T.interimEl){
    T.interimEl = document.createElement('div');
    T.interimEl.className = 'ait-msg me interim';
    T.interimEl.innerHTML = '<div class="who">You</div><div class="tx"></div>';
    var box = $('ait-transcript'); if(box){ box.appendChild(T.interimEl); box.scrollTop = box.scrollHeight; }
  }
  T.interimEl.querySelector('.tx').textContent = t;
  var b = $('ait-transcript'); if(b) b.scrollTop = b.scrollHeight;
}
function clearInterim(){ if(T.interimEl){ T.interimEl.remove(); T.interimEl = null; } }

/* ── Transcript ─────────────────────────────────────────── */
function addMsg(who, text){
  var box = $('ait-transcript'); if(!box) return null;
  var d = document.createElement('div');
  d.className = 'ait-msg ' + (who==='ai'?'ai':'me');
  d.innerHTML = '<div class="who">'+escapeHtml(who==='ai'?(T.teacherName||'Teacher'):(T.studentName||'You'))+'</div>'+
                '<div class="tx"></div>';
  d.querySelector('.tx').innerHTML = mdLite(text);
  box.appendChild(d); box.scrollTop = box.scrollHeight;
  typeset(d);
  return d;
}
function mdLite(t){
  var s = escapeHtml(stripBoard(t));
  s = s.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/(^|\s)\*([^*]+)\*/g,'$1<i>$2</i>');
  return s.replace(/\n/g,'<br>');
}
function stripBoard(t){ return String(t).replace(/\[BOARD\][\s\S]*?(\[\/BOARD\]|$)/gi,'').trim(); }
function typeset(el){
  if(window.MathJax && MathJax.typesetPromise){ MathJax.typesetPromise(el?[el]:undefined).catch(function(){}); }
}

/* ── Visual board ───────────────────────────────────────── */
function renderBoard(raw){
  var m = String(raw).match(/\[BOARD\]([\s\S]*?)(?:\[\/BOARD\]|$)/i);
  if(!m) return;
  var board = $('ait-board'); if(!board) return;
  var lines = m[1].split('\n'), html = '', stepN = 0;
  lines.forEach(function(ln){
    var l = ln.trim(); if(!l) return;
    var mm;
    if((mm = l.match(/^TITLE:\s*(.+)$/i)))      html += '<h3>'+escapeHtml(mm[1])+'</h3>';
    else if((mm = l.match(/^STEP:\s*(.+)$/i)))  { stepN++; html += '<div class="step"><div class="step-n">Step '+stepN+'</div>'+inlineMath(mm[1])+'</div>'; }
    else if((mm = l.match(/^MATH:\s*(.+)$/i)))  html += '<div class="mathline">$$'+mm[1]+'$$</div>';
    else if((mm = l.match(/^NOTE:\s*(.+)$/i)))  html += '<div class="note">'+inlineMath(mm[1])+'</div>';
    else if((mm = l.match(/^BAR:\s*([^|]+)\|\s*(\d+)/i))) {
      var pct = Math.max(2, Math.min(100, +mm[2]));
      html += '<div class="bar"><i style="width:'+pct+'%"></i><span>'+escapeHtml(mm[1].trim())+' ('+pct+')</span></div>';
    }
    else if((mm = l.match(/^SVG:\s*([\s\S]+)$/i))) html += sanitizeSvg(mm[1]);
    else html += '<div>'+inlineMath(l)+'</div>';
  });
  board.innerHTML = html || '<div class="empty">Nothing on the board yet.</div>';
  typeset(board);
  board.scrollTop = 0;
}
function inlineMath(s){
  var parts = String(s).split(/(\$[^$]+\$)/);
  return parts.map(function(p){ return /^\$[^$]+\$$/.test(p) ? p : escapeHtml(p); }).join('')
    .replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>');
}
function sanitizeSvg(s){
  if(!/^<svg[\s>]/i.test(s.trim())) return escapeHtml(s);
  return s.replace(/<script[\s\S]*?<\/script>/gi,'').replace(/on\w+\s*=\s*"[^"]*"/gi,'');
}

/* ── AI call ────────────────────────────────────────────── */
function sysPrompt(){
  return 'You are '+(T.teacherName||'Teacher')+', a highly professional, warm, patient human-like tutor teaching '+
  (T.studentName||'the student')+'. Speak directly to them by name occasionally. Teach step by step, check understanding, '+
  'and ask a short follow-up question at the end of each explanation.\n'+
  'FORMAT RULES (strict):\n'+
  '1. First write what you SAY out loud — plain conversational sentences, no markdown headings, no LaTeX in the spoken part beyond simple wording.\n'+
  '2. Then, when a visual helps, append ONE block:\n'+
  '[BOARD]\nTITLE: short title\nSTEP: description with $inline latex$\nMATH: full display latex (no $ signs)\nNOTE: key reminder\nBAR: label | 70\nSVG: <svg ...>...</svg>\n[/BOARD]\n'+
  '3. Use MATH: lines for every equation and show full working, one step per STEP line.\n'+
  '4. Keep the spoken part under 130 words. Never mention the board syntax aloud.';
}
var AIT_MODEL = (window.AQS_CONFIG && window.AQS_CONFIG.groqModel) || 'llama-3.3-70b-versatile';

function aitSignal(ms){
  try{ if(typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms); }catch(e){}
  return undefined;
}
/* Keys load from Firebase after aqs:firebase:ready — wait briefly on first use */
function keysReady(){
  return new Promise(function(resolve){
    function count(){
      try{ return (window.getFeatureGroqKeyCount ? window.getFeatureGroqKeyCount('studyhub') : 0)
                 + (window._aqsGroqKeyCount ? window._aqsGroqKeyCount() : 0); }catch(e){ return 0; }
    }
    if(count() > 0) return resolve(true);
    var tries = 0;
    var iv = setInterval(function(){
      tries++;
      if(count() > 0 || tries > 20){ clearInterval(iv); resolve(count() > 0); }
    }, 150);
  });
}
function aiFetch(messages){
  var body = { model: AIT_MODEL, messages: messages, temperature: 0.6, max_tokens: 900 };
  var opts = { signal: aitSignal(60000) };
  return keysReady().then(function(hasKeys){
    if(typeof window.studyhubGroqFetch === 'function') return window.studyhubGroqFetch(body, opts);
    if(typeof window.groqFetch === 'function') return window.groqFetch(body, opts);
    throw new Error(hasKeys ? 'AI service unavailable.' : 'No Study Hub AI keys configured — add them in Admin Settings.');
  });
}
/* The key pools return a raw Response — read it properly */
function readResponse(res){
  if(res && typeof res === 'object' && typeof res.json === 'function' && 'ok' in res){
    if(!res.ok){
      return res.json().catch(function(){ return null; }).then(function(j){
        var m = (j && j.error && (j.error.message || j.error)) || '';
        if(res.status === 429) throw new Error('The lesson service is rate limited right now — please try again in a minute.');
        throw new Error('AI error ' + res.status + (m ? ': ' + m : ''));
      });
    }
    return res.json();
  }
  return Promise.resolve(res);
}
function extractText(res){
  try{
    if(typeof res === 'string') return res;
    if(res && res.choices && res.choices[0]){
      var c = res.choices[0];
      return (c.message && c.message.content) || c.text || '';
    }
    if(res && res.content) return res.content;
  }catch(e){}
  return '';
}
function handleUser(text){
  if(!text || T.thinking) return;
  addMsg('me', text);
  T.history.push({ role:'user', content:text });
  ask();
}
function ask(){
  T.thinking = true; setStatusIdle();
  var msgs = [{ role:'system', content: sysPrompt() }].concat(T.history.slice(-14));
  aiFetch(msgs).then(readResponse).then(function(data){
    var txt = extractText(data);
    if(!txt) throw new Error('The lesson service returned an empty response.');
    T.history.push({ role:'assistant', content: txt });
    T.thinking = false;
    addMsg('ai', txt);
    renderBoard(txt);
    speak(stripBoard(txt));
  }).catch(function(err){
    T.thinking = false; setStatusIdle();
    var msg = (err && err.message) ? err.message : 'Unknown error';
    if(/aborted|timeout/i.test(msg)) msg = 'That took too long to answer. Please try again.';
    addMsg('ai', 'Sorry — I could not answer that. (' + msg + ')');
    console.error('[AITeacher]', err);
  });
}

/* ── Onboarding flow ────────────────────────────────────── */
function show(id){
  ['ait-s0','ait-s1','ait-s2','ait-s3','ait-room'].forEach(function(s){
    var el = $(s); if(el) el.classList.toggle('hidden', s !== id);
  });
  document.body.classList.toggle('ait-welcome-mode', id === 'ait-s0');
  var dock = $('ait-dock'); if(dock) dock.classList.toggle('hidden', id !== 'ait-room');
}
function savePrefs(){
  try{ localStorage.setItem(LS, JSON.stringify({ teacherName:T.teacherName, studentName:T.studentName, voiceURI:T.voiceURI, rate:T.rate })); }catch(e){}
}
function loadPrefs(){
  try{
    var p = JSON.parse(localStorage.getItem(LS)||'{}');
    T.teacherName = p.teacherName||''; T.studentName = p.studentName||'';
    T.voiceURI = p.voiceURI||''; T.rate = p.rate||1;
  }catch(e){}
}
function toast(msg){
  var t = $('ait-toast'); if(!t){ console.log(msg); return; }
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(function(){ t.classList.add('hidden'); }, 3200);
}

function beginOnboarding(){
  show('ait-s1');
  speak('Welcome to the DARAPET Learning System. Before we proceed, let us customise your teacher. What would you like to name me?');
}
function enterClassroom(){
  T.started = true;
  savePrefs();
  show('ait-room');
  $('ait-room-teacher').textContent = T.teacherName || 'Teacher';
  $('ait-room-student').textContent = T.studentName || 'Student';
  var opener = 'Wonderful, ' + (T.studentName||'friend') + '. I am ' + (T.teacherName||'your teacher') +
    ', and I am ready to teach. Tell me the topic or question you want to work on, and I will explain it step by step on the board.';
  addMsg('ai', opener);
  T.history.push({ role:'assistant', content: opener });
  speak(opener);
}

/* ── Wire up ────────────────────────────────────────────── */
function init(){
  loadPrefs();
  if(window.speechSynthesis){
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  $('ait-start').onclick = function(){ beginOnboarding(); };
  var welcomeOrb = $('ait-orb-wrap');
  if(welcomeOrb){
    welcomeOrb.setAttribute('role','button');
    welcomeOrb.setAttribute('tabindex','0');
    welcomeOrb.setAttribute('aria-label','Start AI Teacher welcome');
    welcomeOrb.onclick = function(){ if($('ait-s0') && !$('ait-s0').classList.contains('hidden')) beginOnboarding(); };
    welcomeOrb.onkeydown = function(e){ if(e.key === 'Enter' || e.key === ' '){ e.preventDefault(); welcomeOrb.click(); } };
  }

  $('ait-next1').onclick = function(){
    T.teacherName = ($('ait-teacher-name').value || 'Professor Ada').trim();
    show('ait-s2');
    speak('Noted. May I know your name?');
  };
  $('ait-next2').onclick = function(){
    T.studentName = ($('ait-student-name').value || 'Student').trim();
    show('ait-s3');
    renderVoices();
    speak('Thank you, ' + T.studentName + '. I have ten voices for you. I will introduce each one. Choose by voice number or name.');
  };
  $('ait-rate').oninput = function(){
    T.rate = parseFloat(this.value);
    $('ait-rate-val').textContent = T.rate.toFixed(2) + '×';
  };
  $('ait-rate-test').onclick = function(){
    speak('This is how fast I will be speaking during our lesson, ' + (T.studentName||'') + '.');
  };
  $('ait-finish').onclick = function(){ enterClassroom(); };
  $('ait-setup-mic1').onclick = function(){
    listenForSetup(function(said){ $('ait-teacher-name').value = said; $('ait-next1').click(); });
  };
  $('ait-setup-mic2').onclick = function(){
    listenForSetup(function(said){ $('ait-student-name').value = said; $('ait-next2').click(); });
  };
  $('ait-voice-select').onclick = function(){
    var choice = ($('ait-voice-choice').value || '').trim().toLowerCase();
    if(!choice){ toast('Say or enter a voice number or name first.'); return; }
    var number = parseInt(choice.replace(/[^0-9]/g,''), 10);
    var idx = !isNaN(number) && number >= 1 && number <= T.voices.length ? number - 1 : -1;
    if(idx < 0) idx = T.voices.findIndex(function(v){ return shortName(v.name).toLowerCase().indexOf(choice) > -1; });
    if(idx < 0){ toast('I could not find that voice. Choose one of the ten listed voices.'); return; }
    T.voiceURI = T.voices[idx].voiceURI;
    renderVoices();
    speak('Noted. You chose voice ' + (idx + 1) + ', ' + shortName(T.voices[idx].name) + '. I will use this voice for your lessons.', true);
  };
  $('ait-voice-mic').onclick = function(){
    listenForSetup(function(said){ $('ait-voice-choice').value = said; $('ait-voice-select').click(); });
  };

  $('ait-mic').onclick = function(){ if(T.micWanted) stopListening(); else startListening(); };
  $('ait-send').onclick = sendTyped;
  $('ait-text').onkeydown = function(e){ if(e.key === 'Enter') sendTyped(); };
  function sendTyped(){
    var v = $('ait-text').value.trim(); if(!v) return;
    $('ait-text').value = '';
    stopSpeak();
    handleUser(v);
  }

  $('ait-pause').onclick = function(){
    if(!window.speechSynthesis) return;
    if(T.paused){ T.paused = false; speechSynthesis.resume(); this.textContent='⏸'; this.classList.remove('active'); }
    else if(T.speaking){ T.paused = true; speechSynthesis.pause(); this.textContent='▶'; this.classList.add('active'); }
    setStatusIdle();
  };
  $('ait-stop').onclick = function(){ stopSpeak(); };
  $('ait-reset').onclick = function(){
    stopSpeak(); stopListening();
    T.history = []; T.started = false;
    var tr = $('ait-transcript'); if(tr) tr.innerHTML = '';
    var bd = $('ait-board'); if(bd) bd.innerHTML = '<div class="empty">The board is clear.</div>';
    show('ait-s1');
  };
  $('ait-clear-board').onclick = function(){
    $('ait-board').innerHTML = '<div class="empty">The board is clear.</div>';
  };

  window.addEventListener('beforeunload', function(){ try{ speechSynthesis.cancel(); }catch(e){} });

  /* prefill saved prefs */
  if(T.teacherName) $('ait-teacher-name').value = T.teacherName;
  if(T.studentName) $('ait-student-name').value = T.studentName;
  $('ait-rate').value = T.rate;
  $('ait-rate-val').textContent = T.rate.toFixed(2) + '×';
  show('ait-s0');
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

})();
