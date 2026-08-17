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
  micWanted:false, thinking:false, started:false, recog:null,
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
  while(picked.length < 15 && (i < females.length || i < males.length)){
    if(i < females.length) picked.push(females[i]);
    if(picked.length < 15 && i < males.length) picked.push(males[i]);
    i++;
  }
  for(var k=0; picked.length<15 && k<others.length; k++) picked.push(others[k]);
  T.voices = picked;
  renderVoices();
}
function renderVoices(){
  var box = $('ait-voice-list'); if(!box) return;
  if(!T.voices.length){ box.innerHTML = '<div class="ait-sub">No system voices detected — the AI will still write everything on screen.</div>'; return; }
  box.innerHTML = T.voices.map(function(v,i){
    return '<div class="ait-voice'+(v.voiceURI===T.voiceURI?' sel':'')+'" data-i="'+i+'">'+
      '<b>'+escapeHtml(shortName(v.name))+'</b><span>'+guessGender(v.name)+' · '+v.lang+'</span>'+
      '<div class="play">▶ Preview</div></div>';
  }).join('');
  Array.prototype.forEach.call(box.querySelectorAll('.ait-voice'), function(el){
    el.onclick = function(){
      var v = T.voices[+el.dataset.i];
      T.voiceURI = v.voiceURI;
      renderVoices();
      speak('Hello, I am ' + (T.teacherName || shortName(v.name)) + '. I will be your teacher today.', true);
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
  stopSpeak();
  T.pendingChunks = chunkText(speechClean(text));
  T.speaking = true;
  setStatusIdle();
  nextChunk(isPreview);
}
function nextChunk(){
  if(!T.pendingChunks.length){ T.speaking = false; setStatusIdle(); maybeAutoListen(); return; }
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
  try{ if(T.recog) T.recog.stop(); }catch(e){}
}
function maybeAutoListen(){ if(T.micWanted && !T.listening && T.started){ try{ T.recog && T.recog.start(); }catch(e){} } }
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
function aiFetch(messages){
  var body = { messages: messages, temperature: 0.6, max_tokens: 900 };
  if(typeof window.studyhubGroqFetch === 'function') return window.studyhubGroqFetch(body);
  if(typeof window.groqFetch === 'function') return window.groqFetch(body);
  return Promise.reject(new Error('AI service unavailable'));
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
  aiFetch(msgs).then(function(res){
    var txt = extractText(res) || 'Sorry, I lost my train of thought. Could you say that again?';
    T.history.push({ role:'assistant', content: txt });
    T.thinking = false;
    addMsg('ai', txt);
    renderBoard(txt);
    speak(stripBoard(txt));
  }).catch(function(err){
    T.thinking = false; setStatusIdle();
    addMsg('ai', 'I could not reach the lesson service just now. Please try again in a moment.');
    console.error('[AITeacher]', err);
  });
}

/* ── Onboarding flow ────────────────────────────────────── */
function show(id){
  ['ait-s0','ait-s1','ait-s2','ait-s3','ait-room'].forEach(function(s){
    var el = $(s); if(el) el.classList.toggle('hidden', s !== id);
  });
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
  speak('Welcome to your personal A I classroom. Before we begin, what would you like to call me?');
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

  $('ait-next1').onclick = function(){
    T.teacherName = ($('ait-teacher-name').value || 'Professor Ada').trim();
    show('ait-s2');
    speak('Lovely. And what should I call you?');
  };
  $('ait-next2').onclick = function(){
    T.studentName = ($('ait-student-name').value || 'Student').trim();
    show('ait-s3');
    renderVoices();
    speak('Now choose the voice you would like me to use, and set how fast I should speak.');
  };
  $('ait-rate').oninput = function(){
    T.rate = parseFloat(this.value);
    $('ait-rate-val').textContent = T.rate.toFixed(2) + '×';
  };
  $('ait-rate-test').onclick = function(){
    speak('This is how fast I will be speaking during our lesson, ' + (T.studentName||'') + '.');
  };
  $('ait-finish').onclick = function(){ enterClassroom(); };

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
