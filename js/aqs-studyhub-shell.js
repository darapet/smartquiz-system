/* StudyHub shell: sidebar, bottom tabs, home, progress, planner, activity, streak (local per-device data). */
(function(){'use strict';
var K='aqs_sh_',DAYS=['M','T','W','T','F','S','S'];
function jget(k,d){try{var v=JSON.parse(localStorage.getItem(K+k));return v==null?d:v;}catch(_){return d;}}
function jset(k,v){try{localStorage.setItem(K+k,JSON.stringify(v));}catch(_){}}
function $(id){return document.getElementById(id);}
function el(t,c,x){var n=document.createElement(t);if(c)n.className=c;if(x!==undefined)n.textContent=x;return n;}
function dkey(d){d=d||new Date();return d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate();}
function touch(){var a=jget('days',[]),k=dkey();if(a.indexOf(k)<0){a.push(k);jset('days',a.slice(-120));}}
function streak(){var a=jget('days',[]),n=0,d=new Date();if(a.indexOf(dkey(d))<0)d.setDate(d.getDate()-1);while(a.indexOf(dkey(d))>=0){n++;d.setDate(d.getDate()-1);}return n;}
function log(icon,text){var a=jget('act',[]);a.unshift({i:icon,t:text,at:Date.now()});jset('act',a.slice(0,30));touch();}
window.shLog=log;
function ago(ts){var m=Math.round((Date.now()-ts)/60000);if(m<1)return 'just now';if(m<60)return m+'m ago';var h=Math.round(m/60);if(h<24)return h+'h ago';return Math.round(h/24)+'d ago';}
function num(id){var n=$(id);return n?parseInt(n.textContent,10)||0:0;}
function decks(){try{return JSON.parse(localStorage.getItem('aqs_flashcard_decks_v1')||'[]')||[];}catch(_){return[];}}
var NAV=[['overview','🏠','Home'],['guided','🎓','Guided Study'],['notes','📝','AI Notes'],['flashcards','🗂️','Flashcards'],['gpa','📊','GPA Calculator'],['planner','📅','Planner'],['progress','📈','Progress']];
var TOOLS=[['guided','🎓','Guided Study','AI learning plans and lessons','c1'],['notes','📝','AI Notes','Structured notes on any topic','c2'],['flashcards','🗂️','Flashcards','Decks and spaced recall','c3'],['gpa','📊','GPA Calculator','5.0 scale GPA','c4'],['planner','📅','Planner','Goals and deadlines','c5'],['progress','📈','Progress','Streak, stats, activity','c6']];
var WORK=['guided','notes','flashcards','gpa','planner'];
function build(){
 if(document.body.classList.contains('shs')||!$('sh-panel-guided')||$('sh-panel-overview'))return;
 document.body.classList.add('shs');touch();
 var main=$('sh-panel-guided').parentNode;
 var side=el('aside','shs-side');var br=el('div','shs-brand','📚 StudyHub');br.append(el('small','','AI study companion'));side.append(br);
 NAV.forEach(function(n){var b=el('button','shs-nav',n[1]+'  '+n[2]);b.type='button';b.dataset.t=n[0];b.onclick=function(){go(n[0]);};side.append(b);});
 side.append(el('div','shs-sep'));
 [['ai-teacher.html','🤖 AI Teacher'],['library.html','📖 Library'],['index.html','🏠 SmartQuiz Home']].forEach(function(l){var a=el('a','shs-nav',l[1]);a.href=l[0];side.append(a);});
 var u=el('div','shs-user','Streak: 0 days');u.id='shs-user';side.append(u);
 document.body.append(side);
 var bt=el('nav','shs-bottom');[['overview','🏠','Home'],['tools','🧰','Tools'],['progress','📈','Progress'],['more','☰','More']].forEach(function(n){var b=el('button','');b.type='button';b.dataset.t=n[0];b.append(el('span','',n[1]),document.createTextNode(n[2]));b.onclick=function(){go(n[0]);};bt.append(b);});
 document.body.append(bt);
 ['overview','planner','progress','tools','more'].forEach(function(id){if(!$('sh-panel-'+id)){var p=el('section','sh-panel');p.id='sh-panel-'+id;main.insertBefore(p,$('sh-panel-guided'));}});
 window.shTab=go;
 function go(name){
  if(!$('sh-panel-'+name))name='overview';
  document.querySelectorAll('.sh-panel').forEach(function(p){p.classList.remove('active');});$('sh-panel-'+name).classList.add('active');
  var hl=(name==='tools')?'overview':(name==='more'?'':name);
  document.querySelectorAll('.shs-nav[data-t]').forEach(function(b){b.classList.toggle('active',b.dataset.t===hl);});
  document.querySelectorAll('.shs-bottom button').forEach(function(b){var t=b.dataset.t,on=t===name;if(WORK.indexOf(name)>=0)on=(t==='tools');b.classList.toggle('active',on);});
  if(name==='guided'&&window.shGuidedLoadPlans)window.shGuidedLoadPlans();
  if(name==='overview')renderHome();if(name==='progress')renderProgress();if(name==='planner')renderPlanner();if(name==='tools')renderTools();if(name==='more')renderMore();
  var uu=$('shs-user');if(uu)uu.textContent='Streak: '+streak()+' day'+(streak()===1?'':'s');
  try{history.replaceState(null,'','#'+name);}catch(_){}
  window.scrollTo(0,0);
 }
 function toolCards(list){var g=el('div','shs-grid shs-g3');list.forEach(function(t){var b=el('button','shs-tool '+t[4]);b.type='button';b.append(el('span','ic',t[1]),el('strong','',t[2]),el('span','d',t[3]));b.onclick=function(){go(t[0]);};g.append(b);});return g;}
 function weekStrip(){var days=jget('days',[]),w=el('div','shs-week'),now=new Date(),dow=(now.getDay()+6)%7;for(var i=0;i<7;i++){var d=new Date(now);d.setDate(now.getDate()-dow+i);var c=el('div','shs-day'+(days.indexOf(dkey(d))>=0?' on':''));c.append(el('i'),document.createTextNode(DAYS[i]));w.append(c);}return w;}
 function actList(n){var a=jget('act',[]).slice(0,n);if(!a.length)return el('div','shs-empty','No activity yet. Generate notes or save a deck and it shows here.');var ul=el('ul','shs-list');a.forEach(function(x){var li=el('li','',x.i+' '+x.t);li.append(el('small','',ago(x.at)));ul.append(li);});return ul;}
 function upcoming(n){var g=jget('goals',[]).filter(function(x){return !x.done;}).sort(function(a,b){return (a.due||'9')>(b.due||'9')?1:-1;}).slice(0,n);if(!g.length)return el('div','shs-empty','Nothing upcoming. Add a goal in Planner.');var ul=el('ul','shs-list');g.forEach(function(x){var li=el('li','','📌 '+x.t);li.append(el('small','',x.due||'no date'));ul.append(li);});return ul;}
 function barRow(c,label,a,b){var r=el('div','shs-row');r.append(el('span','',label),el('span','',a+' / '+b));c.append(r);var bar=el('div','shs-bar'),s=el('span');s.style.width=(b?Math.round(a/b*100):0)+'%';bar.append(s);c.append(bar);}
 function progressCard(){var c=el('div','shs-card');c.append(el('h3','','Study progress'));barRow(c,'Guided topics',num('sg-stat-completed'),num('sg-stat-topics'));var gs=jget('goals',[]);barRow(c,'Planner goals',gs.filter(function(x){return x.done;}).length,gs.length);return c;}
 function streakCard(){var c=el('div','shs-card');c.append(el('h3','','Study streak'));var s=el('div','shs-stat'),b=el('div');b.append(el('b','',String(streak())),el('small','','day streak'));s.append(el('span','ic','🔥'),b);c.append(s,weekStrip());return c;}
 function top(p,t,sub){var d=el('div','shs-top');d.append(el('h2','',t));if(sub)d.append(el('p','',sub));p.append(d);}
 function renderHome(){
  var p=$('sh-panel-overview');p.innerHTML='';
  var hero=el('section','shs-hero'),cp=el('div');cp.append(el('span','shs-eye','YOUR PERSONAL LEARNING SPACE'),el('h1','','Make every study session count.'),el('p','','Plans, notes, flashcards and grades together in one dashboard.'));
  var b=el('button','shs-btn','＋ Create a study plan');b.type='button';b.onclick=function(){go('guided');setTimeout(function(){var f=$('sg-subject');if(f)f.focus();},100);};cp.append(b);hero.append(cp);
  var st=el('div','st');st.append(el('b','','🔥'),el('strong','',streak()+' day streak'));hero.append(st);p.append(hero);
  p.append(el('h3','shs-h','Your tools'),toolCards(TOOLS.slice(0,4)));
  var g=el('div','shs-grid shs-g2');g.style.marginTop='20px';
  var l=el('div','shs-grid');l.append(progressCard());var rc=el('div','shs-card');rc.append(el('h3','','Recent activity'),actList(5));l.append(rc);
  var r=el('div','shs-grid');r.append(streakCard());var uc=el('div','shs-card');uc.append(el('h3','','Upcoming'),upcoming(4));r.append(uc);
  g.append(l,r);p.append(g);
 }
 function renderTools(){var p=$('sh-panel-tools');p.innerHTML='';top(p,'Tools','Everything in StudyHub.');p.append(toolCards(TOOLS));}
 function renderProgress(){var p=$('sh-panel-progress');p.innerHTML='';top(p,'Progress','Your activity on this device and saved plans.');
  var g=el('div','shs-grid shs-g4');[['🔥',streak(),'Day streak'],['🎓',num('sg-stat-plans'),'Study plans'],['✅',num('sg-stat-completed'),'Topics done'],['🗂️',decks().length,'Flashcard decks']].forEach(function(x){var c=el('div','shs-card shs-stat'),b=el('div');b.append(el('b','',String(x[1])),el('small','',x[2]));c.append(el('span','ic',x[0]),b);g.append(c);});p.append(g);
  var g2=el('div','shs-grid shs-g2');g2.style.marginTop='16px';var l=el('div','shs-grid');l.append(progressCard());var ac=el('div','shs-card');ac.append(el('h3','','Activity history'),actList(30));l.append(ac);var r=el('div','shs-grid');r.append(streakCard());g2.append(l,r);p.append(g2);}
 function renderPlanner(){var p=$('sh-panel-planner');p.innerHTML='';top(p,'Planner','Set goals and deadlines. Saved on this device.');
  var f=el('form','shs-form'),i1=el('input');i1.placeholder='e.g. Finish Thermodynamics notes';var i2=el('input');i2.type='date';i2.style.flex='0 0 160px';var bt=el('button','shs-btn','＋ Add goal');bt.type='submit';f.append(i1,i2,bt);
  f.onsubmit=function(e){e.preventDefault();var v=i1.value.trim();if(!v){if(window.shToast)window.shToast('Type a goal first');return;}var a=jget('goals',[]);a.push({id:Date.now(),t:v,due:i2.value,done:false});jset('goals',a);log('📌','Added goal: '+v);renderPlanner();};
  var c=el('div','shs-card');c.append(f);var a=jget('goals',[]);if(!a.length)c.append(el('div','shs-empty','No goals yet.'));var ul=el('ul','shs-list');
  a.forEach(function(x){var li=el('li',''),cb=el('input');cb.type='checkbox';cb.checked=x.done;cb.onchange=function(){x.done=cb.checked;jset('goals',a);if(x.done)log('✅','Completed goal: '+x.t);renderPlanner();};var s=el('span','',x.t);if(x.done)s.style.textDecoration='line-through';li.append(cb,s,el('small','',x.due||''));var del=el('button','','✕');del.type='button';del.onclick=function(){jset('goals',a.filter(function(y){return y.id!==x.id;}));renderPlanner();};li.append(del);ul.append(li);});
  c.append(ul);p.append(c);}
 function renderMore(){var p=$('sh-panel-more');p.innerHTML='';top(p,'More');var g=el('div','shs-grid shs-g3');
  [['planner','📅','Planner','Goals and deadlines','c5'],['ai-teacher.html','🤖','AI Teacher','Ask and learn','c2'],['library.html','📖','Library','Books and materials','c1'],['index.html','🏠','SmartQuiz Home','Back to main app','c3']].forEach(function(x){var b=el('button','shs-tool '+x[4]);b.type='button';b.append(el('span','ic',x[1]),el('strong','',x[2]),el('span','d',x[3]));b.onclick=function(){if(x[0].indexOf('.html')>0)location.href=x[0];else go(x[0]);};g.append(b);});
  var c=el('div','shs-card');c.style.marginTop='16px';c.append(el('h3','','Data on this device'));var b=el('button','shs-btn ghost','Clear activity, goals and streak');b.type='button';b.onclick=function(){if(confirm('Clear activity, goals and streak on this device? Flashcard decks and study plans are kept.')){['act','goals','days'].forEach(function(k){localStorage.removeItem(K+k);});go('more');if(window.shToast)window.shToast('Cleared');}};c.append(b);p.append(g,c);}
 function wrap(n,fn){var o=window[n];if(typeof o!=='function')return;window[n]=function(){var r=o.apply(this,arguments);try{fn.apply(this,arguments);}catch(_){}return r;};}
 wrap('shGenerateNotes',function(){var t=$('notes-topic');if(t&&t.value.trim())log('📝','Generated notes: '+t.value.trim());});
 wrap('shFC_saveDeck',function(){log('🗂️','Saved flashcard deck');});
 var start=(location.hash||'').slice(1);go($('sh-panel-'+start)?start:'overview');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(build,80);});else setTimeout(build,80);
})();
