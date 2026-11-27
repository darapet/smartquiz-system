(function(){
'use strict';
var page=document.body.getAttribute('data-dashboard');
var isNotes=page==='notes';
var STORE=isNotes?'aqs_notes_v1':'aqs_flashcard_decks_v1';
var host=document.getElementById('dashboard-items');
var search=document.getElementById('dashboard-search');
var modal=document.getElementById('note-modal');
var currentNote=null;
function read(){try{var v=JSON.parse(localStorage.getItem(STORE)||'[]');return Array.isArray(v)?v:[]}catch(_){return[]}}
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])})}
function date(v){var n=Number(v||0);return n?new Date(n).toLocaleDateString(undefined,{day:'numeric',month:'short',year:'numeric'}):'Date not recorded'}
function short(v,n){v=String(v||'').replace(/\s+/g,' ').trim();return v.length>n?v.slice(0,n-1)+'…':v}
function openMenu(){document.getElementById('sidebar').classList.add('open');document.getElementById('mobile-overlay').classList.add('show')}
function closeMenu(){document.getElementById('sidebar').classList.remove('open');document.getElementById('mobile-overlay').classList.remove('show')}
document.getElementById('menu-btn').addEventListener('click',openMenu);
document.getElementById('mobile-overlay').addEventListener('click',closeMenu);
document.addEventListener('keydown',function(e){if(e.key==='Escape'){closeMenu();closeNote()}});
function closeNote(){modal.classList.remove('open');modal.setAttribute('aria-hidden','true')}
function showNote(note){currentNote=note;document.getElementById('note-modal-title').textContent=note.title||'Saved study note';document.getElementById('note-modal-body').textContent=note.body||'No note content was saved.';modal.classList.add('open');modal.setAttribute('aria-hidden','false')}
document.getElementById('note-modal-close').addEventListener('click',closeNote);
modal.addEventListener('click',function(e){if(e.target===modal)closeNote()});
document.getElementById('note-copy').addEventListener('click',function(){if(!currentNote)return;var text=String(currentNote.body||'');if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(function(){this.textContent='Copied';}.bind(this)).catch(function(){alert('Copy is not available in this browser.');})}});
document.getElementById('note-print').addEventListener('click',function(){if(!currentNote)return;var w=window.open('','_blank');if(!w)return;var safe=esc(currentNote.body||'').replace(/\n/g,'<br>');w.document.write('<!doctype html><html><head><title>'+esc(currentNote.title||'Study notes')+'</title><style>body{font:15px/1.8 Georgia,serif;max-width:800px;margin:40px auto;padding:0 20px;color:#18233d}h1{font:700 24px Arial}</style></head><body><h1>'+esc(currentNote.title||'Study notes')+'</h1>'+safe+'</body></html>');w.document.close();w.focus();w.print()});
function setStats(items){
 var second=0,third=0,fourth=0;
 if(isNotes){
  second=items.reduce(function(sum,x){return sum+String(x.body||'').trim().split(/\s+/).filter(Boolean).length},0);
  third=items.filter(function(x){return x.depth==='detailed'}).length;
  fourth=items.length?date(items[0].at):'—';
  document.getElementById('stat-one').textContent=items.length;
  document.getElementById('stat-two').textContent=second.toLocaleString();
  document.getElementById('stat-three').textContent=third;
  document.getElementById('stat-four').textContent=fourth;
 }else{
  second=items.reduce(function(sum,x){return sum+(Array.isArray(x.cards)?x.cards.length:0)},0);
  third=items.reduce(function(sum,x){return sum+(Array.isArray(x.cards)?x.cards.filter(function(c){return c.status==='mastered'||c.status==='known'}).length:0)},0);
  fourth=items.reduce(function(sum,x){return sum+(Array.isArray(x.cards)?x.cards.filter(function(c){return !c.dueAt||Number(c.dueAt)<=Date.now()}).length:0)},0);
  document.getElementById('stat-one').textContent=items.length;
  document.getElementById('stat-two').textContent=second;
  document.getElementById('stat-three').textContent=third;
  document.getElementById('stat-four').textContent=fourth;
 }
}
function setActivity(items){
 var days=[];for(var i=6;i>=0;i--){var d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-i);var key=d.toDateString();var count=items.filter(function(x){var t=Number(isNotes?x.at:x.updatedAt||0);return t&&new Date(t).toDateString()===key}).length;days.push({label:d.toLocaleDateString(undefined,{weekday:'short'}),count:count})}
 var max=Math.max.apply(null,days.map(function(x){return x.count}).concat([1]));
 document.getElementById('activity-bars').innerHTML=days.map(function(d){var h=d.count?Math.max(8,Math.round(d.count/max*100)):3;return '<div class="bar-day"><div class="bar-track"><div class="bar-fill" style="height:'+h+'%"></div></div><strong>'+d.count+'</strong><span>'+d.label+'</span></div>'}).join('');
}
function render(){
 var items=read().sort(function(a,b){return Number(isNotes?b.at||0:b.updatedAt||0)-Number(isNotes?a.at||0:a.updatedAt||0)});
 setStats(items);setActivity(items);
 var q=(search.value||'').trim().toLowerCase();
 var filtered=items.filter(function(x){return !q||(String(x.title||'').toLowerCase().includes(q)||(isNotes?String(x.body||''):JSON.stringify(x.cards||[])).toLowerCase().includes(q))});
 if(!filtered.length){host.innerHTML='<div class="empty"><strong>'+(items.length?'No matching items':'Your '+(isNotes?'saved notes':'flashcard decks')+' will appear here')+'</strong>'+(items.length?'Try another search.':'Create your first '+(isNotes?'set of AI notes':'revision deck')+' to start building your library.')+'<br><a class="secondary" style="margin-top:12px" href="studyhub.html#sh-panel-'+(isNotes?'notes':'flashcards')+'">'+(isNotes?'Create study notes':'Create a flashcard deck')+' →</a></div>';return}
 host.innerHTML=filtered.map(function(x){
  var title=esc(x.title|| (isNotes?'Untitled notes':'Untitled deck'));
  if(isNotes){
   var words=String(x.body||'').trim().split(/\s+/).filter(Boolean).length;
   return '<article class="item"><div class="item-top"><h3>'+title+'</h3><span class="pill">'+esc(x.depth||'standard')+'</span></div><p>'+esc(short(x.body||'No preview available',175))+'</p><p>'+words.toLocaleString()+' words · '+esc(x.level||'Level not set')+' · '+date(x.at)+'</p><div class="item-actions"><button class="action-primary" type="button" data-view="'+esc(x.id||'')+'">Read notes</button><a href="studyhub.html#sh-panel-notes">Create more</a></div></article>';
  }
  var cards=Array.isArray(x.cards)?x.cards:[];
  var due=cards.filter(function(c){return !c.dueAt||Number(c.dueAt)<=Date.now()}).length;
  var mastered=cards.filter(function(c){return c.status==='mastered'||c.status==='known'}).length;
  return '<article class="item"><div class="item-top"><h3>'+title+'</h3><span class="pill">'+cards.length+' cards</span></div><p>'+due+' due for review · '+mastered+' mastered · Updated '+date(x.updatedAt)+'</p><div class="item-actions"><a class="action-primary" href="studyhub.html#sh-panel-flashcards">Open flashcards</a><a href="studyhub.html#sh-panel-flashcards">Continue learning →</a></div></article>';
 }).join('');
 if(isNotes){host.querySelectorAll('[data-view]').forEach(function(btn){btn.addEventListener('click',function(){var note=filtered.find(function(x){return String(x.id||'')===btn.getAttribute('data-view')});if(note)showNote(note)})})}
}
search.addEventListener('input',render);
window.addEventListener('storage',function(e){if(!e.key||e.key===STORE)render()});
window.addEventListener('pageshow',render);
render();
})();