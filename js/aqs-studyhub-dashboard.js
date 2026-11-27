/* StudyHub overview and non-Guided workspaces. Guided Study lives on its own dashboard. */
(function(){
'use strict';
var labels={overview:'Overview',notes:'AI Notes',flashcards:'Flashcards',gpa:'GPA Calculator'};
var tools=[
 {id:'guided',icon:'🎓',name:'Guided Study',desc:'Create a learning plan, follow AI lessons and track your progress.',tag:'AI tutor',action:'Open Guided Study',href:'studyhub-guided-dashboard.html'},
 {id:'notes',icon:'📝',name:'AI Notes',desc:'Generate structured notes from your course topics and save your study material.',tag:'Smart notebook',href:'studyhub-notes-dashboard.html'},
 {id:'flashcards',icon:'🗂️',name:'Flashcards',desc:'Create revision decks from topics, notes or PDFs and practise recall.',tag:'Active recall',href:'studyhub-flashcards-dashboard.html'},
 {id:'gpa',icon:'📊',name:'GPA Calculator',desc:'Calculate semester GPA and inspect your course performance.',tag:'Grade tracker'}
];
function el(tag,cls,txt){var n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
function button(label,cls,fn){var b=el('button',cls||'sh-btn sh-btn-primary',label);b.type='button';b.addEventListener('click',fn);return b;}
function read(key){try{var a=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(a)?a:[]}catch(_){return[]}}
function decks(){return read('aqs_flashcard_decks_v1')}
function notes(){return read('aqs_notes_v1')}
function statsFor(id){
 if(id==='flashcards')return [['Saved decks',String(decks().length)],['Study mode','Ready'],['Review','Pick a deck']];
 if(id==='notes')return [['Saved notes',String(notes().length)],['Note depth','3 options'],['Study level','100–400+']];
 return [['GPA scale','5.0'],['Courses','Add your courses'],['Results','On demand']];
}
function card(t){
 var b=t.href?el('a','sh-home-tool'):el('button','sh-home-tool');
 if(t.href){b.href=t.href;b.style.textDecoration='none'}else{b.type='button';b.addEventListener('click',function(){window.shTab(t.id)})}
 b.append(el('span','sh-home-tool-icon',t.icon),el('span','sh-home-tool-tag',t.tag),el('strong','',t.name),el('span','',t.desc),el('span','sh-home-tool-action',t.href?'Open dashboard →':'Open workspace →'));
 return b;
}
function addStats(parent,id){
 var rows=id==='overview'?[['Study tools','4'],['Saved notes',String(notes().length)],['Flashcard decks',String(decks().length)]]:statsFor(id);
 var wrap=el('div','sh-home-stats');rows.forEach(function(s){var c=el('div','sh-home-stat');c.append(el('span','',s[0]),el('strong','',s[1]));wrap.append(c)});parent.append(wrap);return wrap;
}
function featureDashboard(id,panel){
 var dash=el('section','sh-feature-dashboard');dash.id='sh-'+id+'-dashboard';
 var t=tools.find(function(x){return x.id===id});
 var hero=el('section','sh-feature-hero');
 hero.append(el('span','sh-home-eyebrow',t.tag.toUpperCase()),el('h1','',t.name),el('p','',t.desc));
 hero.append(button(id==='notes'?'＋ Create new notes':id==='flashcards'?'＋ Create a flashcard deck':'＋ Calculate GPA','sh-btn sh-btn-primary',function(){showWorkspace(id);}));
 dash.append(hero);
 var h=el('div','sh-home-section-head');h.append(el('h2','','Your '+t.name+' dashboard'),el('p','','Your workspace and tools in one place.'));dash.append(h);
 addStats(dash,id);
 var quick=el('div','sh-feature-quick');
 if(id==='notes'){
  quick.append(el('div','sh-feature-info-card','Start with a topic, choose the depth and academic level, then generate your notes. Your generated notes appear in the editor workspace.'));
  quick.append(button('Generate study notes →','sh-btn sh-btn-primary',function(){showWorkspace(id);var f=document.getElementById('notes-topic');if(f)f.focus()}));
 }else if(id==='flashcards'){
  var list=decks();quick.append(el('div','sh-feature-info-card',list.length?list.length+' saved deck'+(list.length===1?'':'s')+' available. Open your workspace to continue a deck or create another.':'No saved decks yet. Create your first deck from a topic, your notes, a PDF or manually.'));
  quick.append(button(list.length?'Open my decks →':'Create first deck →','sh-btn sh-btn-primary',function(){showWorkspace(id)}));
 }else{
  quick.append(el('div','sh-feature-info-card','Add your course names, credit units and grades. The calculator will produce your GPA and a course-by-course breakdown.'));
  quick.append(button('Open GPA calculator →','sh-btn sh-btn-primary',function(){showWorkspace(id)}));
 }
 dash.append(quick);panel.insertBefore(dash,panel.firstChild);
 var workspace=el('div','sh-feature-workspace');workspace.id='sh-'+id+'-workspace';
 var back=button('← Back to '+t.name+' dashboard','sh-btn sh-btn-ghost',function(){showDashboard(id)});back.className='sh-workspace-back sh-btn sh-btn-ghost';workspace.append(back);
 Array.from(panel.childNodes).filter(function(n){return n!==dash}).forEach(function(n){workspace.append(n)});
 panel.append(workspace);return dash;
}
var panels={},dashboards={},overview;
function showDashboard(id){var d=dashboards[id],w=document.getElementById('sh-'+id+'-workspace');if(d)d.hidden=false;if(w)w.hidden=true}
function showWorkspace(id){var d=dashboards[id],w=document.getElementById('sh-'+id+'-workspace');if(d)d.hidden=true;if(w)w.hidden=false}
function install(){
 var tabs=document.querySelector('.sh-tabbar'),first=document.getElementById('sh-panel-notes');
 if(!tabs||!first||document.getElementById('sh-panel-overview'))return;
 ['notes','flashcards','gpa'].forEach(function(id){panels[id]=document.getElementById('sh-panel-'+id);dashboards[id]=featureDashboard(id,panels[id]);showDashboard(id)});
 overview=el('section','sh-panel sh-panel-overview');overview.id='sh-panel-overview';overview.setAttribute('role','tabpanel');
 var hero=el('section','sh-home-hero'),copy=el('div','sh-home-hero-copy');
 copy.append(el('span','sh-home-eyebrow','YOUR PERSONAL LEARNING SPACE'),el('h1','','Make every study session count.'),el('p','','Your AI learning guide, revision tools and academic progress — together in one place.'));
 copy.append(button('Open Guided Study →','sh-btn sh-btn-primary',function(){window.location.href='studyhub-guided-dashboard.html'}));hero.append(copy);
 var art=el('div','sh-home-hero-art');art.append(el('span','','✦'),el('strong','','STUDY'),el('small','','LEARN • REVIEW • GROW'));hero.append(art);overview.append(hero);
 addStats(overview,'overview');
 var head=el('div','sh-home-section-head');head.append(el('h2','','Your learning workspace'),el('p','','Choose a tool to continue or start something new.'));overview.append(head);
 var grid=el('div','sh-home-tools');tools.forEach(function(t){grid.append(card(t))});overview.append(grid);
 var tip=el('div','sh-home-tip');tip.append(el('strong','','A simple study routine'),el('p','','Build your learning plan in Guided Study, reinforce difficult concepts with AI Notes, then test your memory with Flashcards.'));overview.append(tip);
 first.parentNode.insertBefore(overview,first);
 var overviewTab=document.createElement('button');overviewTab.type='button';overviewTab.className='sh-tab-btn active';overviewTab.dataset.tab='overview';overviewTab.setAttribute('role','tab');overviewTab.setAttribute('aria-selected','true');overviewTab.textContent='⌂ Overview';tabs.insertBefore(overviewTab,tabs.firstChild);
 overviewTab.addEventListener('click',function(){window.shTab('overview')});
 var nav=document.querySelector('.sh-nav-items');
 if(nav){
  nav.innerHTML='';
  var home=el('button','sh-nav-item','⌂  Overview');home.type='button';home.dataset.tab='overview';home.addEventListener('click',function(){window.shTab('overview');if(window.shMenuClose)window.shMenuClose()});nav.append(home);
  var guide=el('a','sh-nav-item','🎓  Guided Study');guide.href='studyhub-guided-dashboard.html';nav.append(guide);
  ['notes','flashcards','gpa'].forEach(function(id){var t=tools.find(function(x){return x.id===id});if(t.href){var n=el('a','sh-nav-item',t.icon+'  '+t.name);n.href=t.href;nav.append(n)}else{var n=el('button','sh-nav-item',t.icon+'  '+t.name);n.type='button';n.dataset.tab=id;n.addEventListener('click',function(){window.shTab(id);if(window.shMenuClose)window.shMenuClose()});nav.append(n)}});
  nav.append(el('div','sh-nav-divider'));var ai=el('a','sh-nav-item','🤖  AI Teacher');ai.href='ai-teacher.html';nav.append(ai);
 }
 var baseTab=window.shTab;
 window.shTab=function(name){
  if(name==='guided'){window.location.href='studyhub-guided-dashboard.html';return}
  if(name==='overview'){
   document.querySelectorAll('.sh-panel').forEach(function(p){p.classList.remove('active')});overview.classList.add('active');
   document.querySelectorAll('.sh-tab-btn').forEach(function(n){var on=n.dataset.tab==='overview';n.classList.toggle('active',on);n.setAttribute('aria-selected',on?'true':'false')});
   document.querySelectorAll('.sh-nav-item[data-tab]').forEach(function(n){n.classList.toggle('active',n.dataset.tab==='overview')});
   var badge=document.getElementById('sh-hdr-active-tab');if(badge)badge.textContent='Overview';refresh();return;
  }
  if(panels[name]){
   document.querySelectorAll('.sh-panel').forEach(function(p){p.classList.remove('active')});panels[name].classList.add('active');
   document.querySelectorAll('.sh-tab-btn').forEach(function(n){var on=n.dataset.tab===name;n.classList.toggle('active',on);n.setAttribute('aria-selected',on?'true':'false')});
   document.querySelectorAll('.sh-nav-item[data-tab]').forEach(function(n){n.classList.toggle('active',n.dataset.tab===name)});
   var badge=document.getElementById('sh-hdr-active-tab');if(badge)badge.textContent=labels[name];showDashboard(name);refresh();return;
  }
  if(typeof baseTab==='function')baseTab(name);
 };
 var header=document.querySelector('.sh-hdr');if(header){var brand=header.querySelector('.sh-logo');if(brand)brand.textContent='📚 StudyHub'}
 window.shTab('overview');document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh()});
}
function refresh(){
 document.querySelectorAll('.sh-home-stat[data-source]').forEach(function(n){var v=document.getElementById(n.dataset.source);var strong=n.querySelector('strong');if(strong&&v)strong.textContent=v.textContent.trim()});
 var flash=document.querySelector('#sh-flashcards-dashboard .sh-home-stat strong');if(flash&&flash.parentElement&&flash.parentElement.querySelector('span')?.textContent==='Saved decks')flash.textContent=String(decks().length);
}
document.addEventListener('DOMContentLoaded',install);if(document.readyState!=='loading')install();
})();