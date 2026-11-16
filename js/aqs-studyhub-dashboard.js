/* StudyHub dashboard layer — presentation only; preserves existing feature engines. */
(function () {
  'use strict';
  var labels = {
    overview: 'Overview', guided: 'Guided Study', notes: 'AI Notes',
    flashcards: 'Flashcards', gpa: 'GPA Calculator'
  };
  var tools = [
    {id:'guided',icon:'🎓',name:'Guided Study',desc:'Build a structured learning plan and study one topic at a time.',tag:'AI tutor'},
    {id:'notes',icon:'📝',name:'AI Notes',desc:'Generate organised, exam-ready notes from a topic.',tag:'Study notes'},
    {id:'flashcards',icon:'🗂️',name:'Flashcards',desc:'Create revision decks and practise with spaced repetition.',tag:'Active recall'},
    {id:'gpa',icon:'📊',name:'GPA Calculator',desc:'Calculate semester GPA and review course performance.',tag:'Grade tracker'}
  ];
  function el(tag, cls, text) { var n=document.createElement(tag); if(cls)n.className=cls; if(text!==undefined)n.textContent=text; return n; }
  function countDecks(){try{var a=JSON.parse(localStorage.getItem('aqs_flashcard_decks_v1')||'[]');return Array.isArray(a)?a.length:0;}catch(_){return 0;}}
  function makeToolCard(t){
    var b=el('button','sh-home-tool'); b.type='button'; b.addEventListener('click',function(){window.shTab(t.id);});
    var top=el('span','sh-home-tool-icon',t.icon), badge=el('span','sh-home-tool-tag',t.tag);
    var h=el('strong','',t.name), p=el('span','',t.desc), action=el('span','sh-home-tool-action','Open workspace →');
    b.append(top,badge,h,p,action); return b;
  }
  function addPanelIntro(id, eyebrow, title, desc, icon){
    var panel=document.getElementById('sh-panel-'+id); if(!panel || panel.querySelector('.sh-tool-hero'))return;
    var hero=el('section','sh-tool-hero'); hero.append(el('span','sh-tool-hero-icon',icon),el('span','sh-tool-hero-eyebrow',eyebrow),el('h1','',title),el('p','',desc));
    panel.insertBefore(hero,panel.firstChild);
  }
  function install(){
    var guided=document.getElementById('sh-panel-guided'), tabs=document.querySelector('.sh-tabbar');
    if(!guided || !tabs || document.getElementById('sh-panel-overview'))return;
    var overview=el('section','sh-panel sh-panel-overview active'); overview.id='sh-panel-overview'; overview.setAttribute('role','tabpanel');
    var hero=el('section','sh-home-hero');
    var copy=el('div','sh-home-hero-copy');
    copy.append(el('span','sh-home-eyebrow','YOUR PERSONAL LEARNING SPACE'),el('h1','','Make every study session count.'),el('p','','Your learning tools, study plans and academic progress — organised in one workspace.'));
    var cta=el('button','sh-btn sh-btn-primary','＋ Create a study plan'); cta.type='button';cta.addEventListener('click',function(){window.shTab('guided');var f=document.getElementById('sg-subject');if(f)f.focus();});
    copy.append(cta); hero.append(copy);
    var visual=el('div','sh-home-hero-art');visual.append(el('span','','✦'),el('strong','','STUDY'),el('small','','LEARN • REVIEW • GROW'));hero.append(visual);
    overview.append(hero);
    var stats=el('div','sh-home-stats');
    [['Study plans','sg-stat-plans'],['Topics organised','sg-stat-topics'],['Topics completed','sg-stat-completed']].forEach(function(x){var c=el('div','sh-home-stat');c.append(el('span','',x[0]),el('strong','',document.getElementById(x[1])?.textContent||'0'));c.dataset.source=x[1];stats.append(c);});
    overview.append(stats);
    var heading=el('div','sh-home-section-head');heading.append(el('div',''));heading.firstChild.append(el('h2','','Your learning workspace'),el('p','','Choose a tool to continue or start something new.'));overview.append(heading);
    var grid=el('div','sh-home-tools');tools.forEach(function(t){grid.append(makeToolCard(t));});overview.append(grid);
    var tip=el('div','sh-home-tip');tip.append(el('strong','','A simple study routine'),el('p','','Organise your material in Guided Study, create quick revision cards, then use AI Notes to reinforce difficult concepts.'));overview.append(tip);
    guided.parentNode.insertBefore(overview,guided);
    var btn=document.createElement('button');btn.type='button';btn.className='sh-tab-btn active';btn.dataset.tab='overview';btn.setAttribute('role','tab');btn.setAttribute('aria-selected','true');btn.textContent='⌂ Overview';tabs.insertBefore(btn,tabs.firstChild);btn.addEventListener('click',function(){window.shTab('overview');});
    tabs.querySelectorAll('.sh-tab-btn[data-tab="guided"]').forEach(function(n){n.classList.remove('active');n.setAttribute('aria-selected','false');});
    guided.classList.remove('active');
    addPanelIntro('notes','YOUR AI NOTEBOOK','Turn topics into clear study notes.','Generate structured explanations, key definitions and exam-focused revision material.','📝');
    addPanelIntro('flashcards','ACTIVE RECALL WORKSPACE','Remember more with flashcards.','Build decks from topics, your notes or PDFs, then practise with review scheduling.','🗂️');
    addPanelIntro('gpa','ACADEMIC PERFORMANCE','Know where you stand.','Calculate your grades with a clear course-by-course GPA breakdown.','📊');
    var original=window.shTab;
    window.shTab=function(name){
      if(name==='overview'){
        document.querySelectorAll('.sh-panel').forEach(function(p){p.classList.remove('active');});
        overview.classList.add('active');
        document.querySelectorAll('.sh-tab-btn').forEach(function(n){var on=n.dataset.tab==='overview';n.classList.toggle('active',on);n.setAttribute('aria-selected',on?'true':'false');});
        document.querySelectorAll('.sh-nav-item').forEach(function(n){n.classList.remove('active');});
        var badge=document.getElementById('sh-hdr-active-tab');if(badge)badge.textContent='Overview';
        refreshStats();return;
      }
      original(name);
    };
    var navItem=document.createElement('div');navItem.className='sh-nav-item';navItem.dataset.tab='overview';navItem.innerHTML='<span class="nav-icon">⌂</span><span class="nav-label">Overview</span>';navItem.addEventListener('click',function(){window.shTab('overview');if(window.shMenuClose)window.shMenuClose();});
    var nav=document.querySelector('.sh-nav-items');if(nav)nav.insertBefore(navItem,nav.firstChild);
    refreshStats();
    document.addEventListener('visibilitychange',function(){if(!document.hidden)refreshStats();});
  }
  function refreshStats(){
    document.querySelectorAll('.sh-home-stat').forEach(function(n){var src=n.dataset.source, target=document.getElementById(src);if(target)n.querySelector('strong').textContent=target.textContent;});
  }
  document.addEventListener('DOMContentLoaded',install);
  if(document.readyState!=='loading')install();
})();