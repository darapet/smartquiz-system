(function () {
  'use strict';
  var ACT='aqs_sh_act_log_v1', NOTES='aqs_notes_v1', GPA='aqs_gpa_v1',
      DECKS='aqs_flashcard_decks_v1', GUIDED='aqs_sh_guided_seen',
      AI='aqs_ai_teacher_chats_v2';
  var rangeDays=30, quizAttempts=[], quizStats={}, quizState='loading';
  var $=function(s,r){return (r||document).querySelector(s);};
  var $$=function(s,r){return Array.prototype.slice.call((r||document).querySelectorAll(s));};
  function read(key){try{var v=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(v)?v:[];}catch(e){return [];}}
  function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function time(v){if(typeof v==='number')return v;var n=Date.parse(v);return Number.isFinite(n)?n:0;}
  function plans(){return read(GUIDED);}
  function decks(){return read(DECKS);}
  function notes(){return read(NOTES);}
  function gpas(){return read(GPA);}
  function chats(){return read(AI).filter(function(x){return x&&Array.isArray(x.messages);});}
  function cards(){return decks().reduce(function(n,d){return n+(Array.isArray(d.cards)?d.cards.length:0);},0);}
  function mastered(){return decks().reduce(function(n,d){return n+(Array.isArray(d.cards)?d.cards.filter(function(c){return c&&c.status==='mastered';}).length:0);},0);}
  function topics(){var p=plans();return p.reduce(function(n,x){return n+(Array.isArray(x.topics)?x.topics.length:0);},0);}
  function completed(){return plans().reduce(function(n,x){return n+(Array.isArray(x.completedTopics)?x.completedTopics.length:0);},0);}
  function pct(a){return Number(a&&a.total)>0?Math.round((Number(a.score)||0)/Number(a.total)*100):0;}
  function call(action,data){
    return new Promise(function(resolve,reject){
      var done=false;
      function send(){if(done)return;done=true;if(!window.aqsAjax){reject(new Error('Quiz connection is unavailable'));return;}
        window.aqsAjax(Object.assign({action:action},data||{}),function(r){
          if(r&&r.success===false){reject(new Error(r.data||'Quiz request failed'));return;}
          resolve(r&&r.data!==undefined?r.data:r);
        },reject);
      }
      if(window.aqsAjax)send();else document.addEventListener('aqs:firebase:ready',send,{once:true});
      setTimeout(function(){if(!done){done=true;reject(new Error('Quiz records took too long to load'));}},12000);
    });
  }
  function events(){
    var out=read(ACT).filter(function(x){return x&&time(x.at)>0;}).map(function(x){return {kind:x.k||'study',at:time(x.at),label:activityLabel(x.k),detail:x.detail||''};});
    chats().forEach(function(s){var at=time(s.updatedAt||s.createdAt);if(at)out.push({kind:'ai-teacher',at:at,label:'AI Assistant conversation'});});
    quizAttempts.forEach(function(a){var at=time(a.finished_at||a.finished_at_ms||a.created_at);if(at)out.push({kind:'quiz',at:at,label:'Practice quiz completed',detail:a.quiz_title||a.subject||''});});
    var seen={};out=out.filter(function(e){var k=e.kind+'|'+e.at+'|'+e.detail;if(seen[k])return false;seen[k]=1;return true;});
    return out.sort(function(a,b){return b.at-a.at;});
  }
  function activityLabel(k){
    var labels={guided:'Guided Study plan created', 'topic-completed':'Guided Study topic completed',
      notes:'AI Notes saved',flashcards:'Flashcards updated',gpa:'GPA calculation saved',
      'ai-teacher':'AI Assistant conversation',edit:'StudyHub material updated',del:'StudyHub material removed'};
    return labels[k]||'StudyHub learning activity';
  }
  function filteredEvents(){
    var cut=Date.now()-rangeDays*86400000;
    return events().filter(function(e){return e.at>=cut;});
  }
  function streak(ev){
    var days={};ev.forEach(function(e){var d=new Date(e.at);days[d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()]=1;});
    var d=new Date(),n=0,key=function(x){return x.getFullYear()+'-'+x.getMonth()+'-'+x.getDate();};
    if(!days[key(d)])d.setDate(d.getDate()-1);
    while(days[key(d)]){n++;d.setDate(d.getDate()-1);}
    return n;
  }
  function featureData(){
    var p=plans(),d=decks(),n=notes(),g=gpas(),a=chats(),q=quizAttempts;
    return [
      {name:'Guided Study',icon:'🎓',value:p.length,sub:completed()+' topics completed of '+topics()+' planned',href:'studyhub-guided-dashboard.html'},
      {name:'Practice Quiz',icon:'☑️',value:q.length,sub:q.length+' completed attempts',href:'quiz-dashboard.html'},
      {name:'Flashcards',icon:'🗂️',value:d.length,sub:cards()+' cards · '+mastered()+' mastered',href:'studyhub-flashcards-dashboard.html'},
      {name:'AI Notes',icon:'📝',value:n.length,sub:'Saved study notes',href:'studyhub-notes-dashboard.html'},
      {name:'Study Planner',icon:'🗓️',value:p.length,sub:'Saved study plans',href:'studyhub-guided-dashboard.html'},
      {name:'AI Assistant',icon:'✧',value:a.length,sub:'Saved conversations',href:'ai-teacher.html'},
      {name:'GPA Calculator',icon:'📊',value:g.length,sub:'Saved GPA calculations',href:'studyhub.html'}
    ];
  }
  function chartBars(ev){
    var now=new Date(),labels=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'],vals=[];
    for(var i=6;i>=0;i--){var d=new Date(now);d.setHours(0,0,0,0);d.setDate(d.getDate()-i);var start=d.getTime(),end=start+86400000;vals.push({day:labels[d.getDay()],count:ev.filter(function(e){return e.at>=start&&e.at<end;}).length});}
    var max=Math.max(1,...vals.map(function(x){return x.count;}));
    return '<div class="shtrk-chart" role="img" aria-label="Recorded learning activity over the last seven days">'+vals.map(function(x){var h=Math.max(4,x.count/max*100);return '<div class="shtrk-bar-col"><b>'+x.count+'</b><div class="shtrk-bar" style="height:'+h+'%"></div><span>'+x.day+'</span></div>';}).join('')+'</div>';
  }
  function featureBars(){
    var data=featureData(),max=Math.max(1,...data.map(function(x){return x.value;}));
    return '<div class="shtrk-feature-bars">'+data.map(function(x){var w=x.value?Math.max(3,x.value/max*100):0;return '<div class="shtrk-feature-row"><div class="shtrk-feature-meta"><span>'+x.icon+' '+esc(x.name)+'</span><strong>'+x.value+'</strong></div><div class="shtrk-track"><i style="width:'+w+'%"></i></div></div>';}).join('')+'</div>';
  }
  function recent(ev){
    if(!ev.length)return '<div class="shtrk-empty">No recorded activity in this period yet. Your tracker will update as you use StudyHub and complete quizzes.</div>';
    return '<div class="shtrk-recent">'+ev.slice(0,6).map(function(e){return '<div class="shtrk-recent-row"><span class="shtrk-recent-icon">'+(e.kind==='quiz'?'☑️':e.kind==='ai-teacher'?'✧':'📘')+'</span><span><strong>'+esc(e.label)+'</strong><small>'+esc(e.detail||'StudyHub')+'</small></span><time>'+new Date(e.at).toLocaleString(undefined,{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})+'</time></div>';}).join('')+'</div>';
  }
  function render(){
    var root=$('#studyhubTracker');if(!root)return;
    var allEvents=events(),ev=allEvents.filter(function(e){return e.at>=Date.now()-rangeDays*86400000;}),p=plans(),total=topics(),done=completed(),completion=total?Math.round(done/total*100):null;
    var questions=quizAttempts.reduce(function(n,a){return n+(Number(a.total)||0);},0);
    var best=quizAttempts.reduce(function(n,a){return Math.max(n,pct(a));},0);
    var average=quizAttempts.length?Math.round(quizAttempts.reduce(function(n,a){return n+pct(a);},0)/quizAttempts.length):0;
    var f=featureData();
    root.innerHTML='<div class="shtrk-head"><div><h2>📈 Learning Analytics</h2><p>Your activity and progress across StudyHub features, using saved records.</p></div><select id="shtrk-range" aria-label="Analytics date range"><option value="7" '+(rangeDays===7?'selected':'')+'>Last 7 days</option><option value="30" '+(rangeDays===30?'selected':'')+'>Last 30 days</option><option value="90" '+(rangeDays===90?'selected':'')+'>Last 90 days</option></select></div>'+
    '<div class="shtrk-kpis"><article><span>🔥</span><small>Learning streak</small><strong>'+streak(allEvents)+' days</strong></article><article><span>☑️</span><small>Quiz attempts</small><strong>'+quizAttempts.length+'</strong></article><article><span>🎓</span><small>Topics completed</small><strong>'+done+' / '+total+'</strong></article><article><span>⭐</span><small>Best quiz score</small><strong>'+(quizAttempts.length?best+'%':'—')+'</strong></article></div>'+
    '<div class="shtrk-grid"><article class="shtrk-card"><div class="shtrk-card-head"><div><h3>Weekly activity</h3><p>Recorded actions and completed quizzes · last 7 days</p></div><b>'+ev.length+' events</b></div>'+chartBars(events().filter(function(e){return e.at>=Date.now()-7*86400000;}))+'</article>'+
    '<article class="shtrk-card"><div class="shtrk-card-head"><div><h3>Feature records</h3><p>Saved items and completed quiz attempts</p></div></div>'+featureBars()+'</article></div>'+
    '<div class="shtrk-grid shtrk-grid-bottom"><article class="shtrk-card"><div class="shtrk-card-head"><div><h3>Guided Study progress</h3><p>Completed topics across your saved plans</p></div><strong>'+(completion===null?'—':completion+'%')+'</strong></div><div class="shtrk-progress"><div><span style="width:'+(completion||0)+'%"></span></div><small>'+done+' completed · '+Math.max(0,total-done)+' remaining</small></div><div class="shtrk-mini-stats"><span><b>'+p.length+'</b> Plans</span><span><b>'+total+'</b> Topics</span><span><b>'+done+'</b> Completed</span></div></article>'+
    '<article class="shtrk-card"><div class="shtrk-card-head"><div><h3>Practice performance</h3><p>Based on your saved quiz attempts</p></div></div><div class="shtrk-quiz-stats"><div><small>Average score</small><strong>'+(quizAttempts.length?average+'%':'—')+'</strong></div><div><small>Questions practised</small><strong>'+questions+'</strong></div><div><small>Best score</small><strong>'+(quizAttempts.length?best+'%':'—')+'</strong></div></div>'+(quizState==='error'?'<p class="shtrk-note">Quiz records could not be loaded. Open Practice Quiz to check your connection.</p>':'')+'</article></div>'+
    '<article class="shtrk-card shtrk-feature-card"><div class="shtrk-card-head"><div><h3>Every StudyHub feature</h3><p>Live totals from the saved records available on this device and your quiz account.</p></div></div><div class="shtrk-feature-grid">'+f.map(function(x){return '<a href="'+x.href+'"><span>'+x.icon+'</span><div><strong>'+esc(x.name)+'</strong><small>'+esc(x.sub)+'</small></div><b>'+x.value+'</b></a>';}).join('')+'</div></article>'+
    '<article class="shtrk-card shtrk-recent-card"><div class="shtrk-card-head"><div><h3>Recent activity</h3><p>Most recent recorded learning actions</p></div></div>'+recent(ev)+'</article>'+
    '<p class="shtrk-footnote">Study time is not displayed because the current app records do not yet measure time spent reliably. Feature totals update when saved records change or you return to this dashboard.</p>';
    var select=$('#shtrk-range',root);if(select)select.addEventListener('change',function(){rangeDays=Number(this.value)||30;render();});
    updateLegacy(p,total,done,completion,questions,best);
  }
  function updateLegacy(p,total,done,completion,questions,best){
    var ring=$('.ring');if(ring&&completion!==null){ring.style.background='conic-gradient(#12a66a 0 '+completion+'%, #e5e8f2 '+completion+'% 100%)';var n=$('.ring strong');if(n)n.textContent=completion+'%';}
    var metrics=$$('.metric b');if(metrics[0])metrics[0].textContent=done;if(metrics[1])metrics[1].textContent=questions;if(metrics[2])metrics[2].textContent='—';
    var stats=$$('.stat strong');if(stats[0])stats[0].textContent=done;if(stats[1])stats[1].textContent=questions;if(stats[2])stats[2].textContent='—';if(stats[3])stats[3].textContent=quizAttempts.length?best+'%':'—';
    var empty=$('.bottom-grid .empty-row');if(empty)empty.outerHTML=recent(events().slice(0,6));
    var success=$('.success');if(success){var title=$('strong',success),copy=$('p',success);if(title)title.textContent=completion===null?'Start your learning journey':'You are making progress';if(copy)copy.textContent=completion===null?'Create a Guided Study plan or complete a quiz to begin building your learning record.':done+' of '+total+' Guided Study topics completed.';}
  }
  async function loadQuiz(force){
    if(quizLoading||(!force&&Date.now()-lastQuizLoad<30000))return;
    quizLoading=true;
    try{var result=await call('aqs_get_my_attempts',{limit:100});quizAttempts=Array.isArray(result)?result:[];quizState='ready';}
    catch(e){quizAttempts=[];quizState='error';}
    finally{quizLoading=false;lastQuizLoad=Date.now();}
    render();
  }
  var quizLoading=false,lastQuizLoad=0;
  function boot(){
    render();
    loadQuiz();
    window.addEventListener('storage',function(e){if([ACT,NOTES,GPA,DECKS,GUIDED,AI].indexOf(e.key)>=0)render();});
    window.addEventListener('aqs:studyhub:activity',render);
    window.addEventListener('aqs:guided-plans-updated',render);
    document.addEventListener('aqs:authchange',function(){loadQuiz(true);});
    window.addEventListener('focus',function(){render();if(Date.now()-lastQuizLoad>30000)loadQuiz(true);});
    document.addEventListener('visibilitychange',function(){if(!document.hidden){render();if(Date.now()-lastQuizLoad>30000)loadQuiz(true);}});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();