/* StudyHub real dashboard architecture — separate overview and feature workspaces. */
(function () {
  'use strict';
  var labels={overview:'StudyHub',guided:'Guided Study',notes:'AI Notes',flashcards:'Flashcards',gpa:'GPA Calculator'};
  var tools=[
    {id:'guided',icon:'🎓',name:'Guided Study',desc:'Build a learning plan, follow lessons and check your understanding.',tag:'AI tutor',action:'Open study plans'},
    {id:'notes',icon:'📝',name:'AI Notes',desc:'Generate structured notes from your course topics and save your study material.',tag:'Smart notebook',action:'Open notes workspace'},
    {id:'flashcards',icon:'🗂️',name:'Flashcards',desc:'Create revision decks from topics, notes or PDFs and practise recall.',tag:'Active recall',action:'Open flashcards'},
    {id:'gpa',icon:'📊',name:'GPA Calculator',desc:'Calculate semester GPA and inspect your course performance.',tag:'Grade tracker',action:'Open calculator'}
  ];
  function el(tag,cls,txt){var n=document.createElement(tag);if(cls)n.className=cls;if(txt!==undefined)n.textContent=txt;return n;}
  function button(label,cls,fn){var b=el('button',cls||'sh-btn sh-btn-primary',label);b.type='button';b.addEventListener('click',fn);return b;}
  function decks(){try{var a=JSON.parse(localStorage.getItem('aqs_flashcard_decks_v1')||'[]');return Array.isArray(a)?a:[];}catch(_){return[];}}
  function statsFor(id){
    if(id==='guided')return [['Study plans',textOf('sg-stat-plans')],['Topics organised',textOf('sg-stat-topics')],['Topics completed',textOf('sg-stat-completed')]];
    if(id==='flashcards')return [['Saved decks',String(decks().length)],['Study mode','Ready'],['Review','Pick a deck']];
    if(id==='notes')return [['Workspace','Ready'],['Note depth','3 options'],['Study level','100–400+']];
    return [['GPA scale','5.0'],['Courses','Add your courses'],['Results','On demand']];
  }
  function textOf(id){var n=document.getElementById(id);return n?n.textContent.trim():'0';}
  function card(t){var b=el('button','sh-home-tool');b.type='button';b.addEventListener('click',function(){window.shTab(t.id);});b.append(el('span','sh-home-tool-icon',t.icon),el('span','sh-home-tool-tag',t.tag),el('strong','',t.name),el('span','',t.desc),el('span','sh-home-tool-action','Open workspace →'));return b;}
  function addStats(parent,id){var wrap=el('div','sh-home-stats');statsFor(id).forEach(function(s){var c=el('div','sh-home-stat');c.append(el('span','',s[0]),el('strong','',s[1]));wrap.append(c);});parent.append(wrap);return wrap;}
  function featureDashboard(id,panel){
    var dash=el('section','sh-feature-dashboard');dash.id='sh-'+id+'-dashboard';
    var t=tools.find(function(x){return x.id===id;});
    var hero=el('section','sh-feature-hero');
    hero.append(el('span','sh-home-eyebrow',t.tag.toUpperCase()),el('h1','',t.name),el('p','',t.desc));
    hero.append(button(id==='notes'?'＋ Create new notes':id==='flashcards'?'＋ Create a flashcard deck': '＋ Calculate GPA','sh-btn sh-btn-primary',function(){showWorkspace(id);}));
    dash.append(hero);
    var h=el('div','sh-home-section-head');h.append(el('h2','','Your '+t.name+' dashboard'),el('p','','Your workspace and tools in one place.'));dash.append(h);
    addStats(dash,id);
    var quick=el('div','sh-feature-quick');
    if(id==='notes'){
      quick.append(el('div','sh-feature-info-card','Start with a topic, choose the depth and academic level, then generate your notes. Your generated notes appear in the editor workspace.'));
      quick.append(button('Generate study notes →','sh-btn sh-btn-primary',function(){showWorkspace(id);var f=document.getElementById('notes-topic');if(f)f.focus();}));
    }else if(id==='flashcards'){
      var list=decks();quick.append(el('div','sh-feature-info-card',list.length?list.length+' saved deck'+(list.length===1?'':'s')+' available. Open your workspace to continue a deck or create another.':'No saved decks yet. Create your first deck from a topic, your notes, a PDF or manually.'));
      quick.append(button(list.length?'Open my decks →':'Create first deck →','sh-btn sh-btn-primary',function(){showWorkspace(id);}));
    }else{
      quick.append(el('div','sh-feature-info-card','Add your course names, credit units and grades. The calculator will produce your GPA and a course-by-course breakdown.'));
      quick.append(button('Open GPA calculator →','sh-btn sh-btn-primary',function(){showWorkspace(id);}));
    }
    dash.append(quick);
    panel.insertBefore(dash,panel.firstChild);
    var workspace=el('div','sh-feature-workspace');workspace.id='sh-'+id+'-workspace';
    var back=button('← Back to '+t.name+' dashboard','sh-btn sh-btn-ghost',function(){showDashboard(id);});
    back.className='sh-workspace-back sh-btn sh-btn-ghost';
    workspace.append(back);
    var nodes=Array.from(panel.childNodes).filter(function(n){return n!==dash;});
    nodes.forEach(function(n){workspace.append(n);});
    panel.append(workspace);
    return dash;
  }
  var panels={},dashboards={},overview;
  function showDashboard(id){var p=panels[id];if(!p)return;var d=dashboards[id],w=document.getElementById('sh-'+id+'-workspace');if(d)d.hidden=false;if(w)w.hidden=true;}
  function showWorkspace(id){var p=panels[id];if(!p)return;var d=dashboards[id],w=document.getElementById('sh-'+id+'-workspace');if(d)d.hidden=true;if(w)w.hidden=false;}
  function install(){
    var tabs=document.querySelector('.sh-tabbar'),guided=document.getElementById('sh-panel-guided');
    if(!tabs||!guided||document.getElementById('sh-panel-overview'))return;
    ['guided','notes','flashcards','gpa'].forEach(function(id){panels[id]=document.getElementById('sh-panel-'+id);});
    /* Guided Study's saved-plan list is its feature dashboard; the lesson room remains a separate working screen. */
    var guideIntro=guided.querySelector('.sg-intro');
    if(guideIntro){var gh=el('div','sh-feature-hero sh-guided-dashboard-hero');gh.append(el('span','sh-home-eyebrow','YOUR PERSONAL LEARNING SPACE'),el('h1','','Guided Study'),el('p','','Create and manage your study plans, continue lessons and track your learning progress.'));guided.insertBefore(gh,guided.firstChild);}
    ['notes','flashcards','gpa'].forEach(function(id){dashboards[id]=featureDashboard(id,panels[id]);showDashboard(id);});
    overview=el('section','sh-panel sh-panel-overview');overview.id='sh-panel-overview';overview.setAttribute('role','tabpanel');
    var hero=el('section','sh-home-hero'),copy=el('div','sh-home-hero-copy');
    copy.append(el('span','sh-home-eyebrow','YOUR PERSONAL LEARNING SPACE'),el('h1','','Make every study session count.'),el('p','','Your study plans, revision tools and academic progress — together in one place.'));
    copy.append(button('＋ Create a study plan','sh-btn sh-btn-primary',function(){window.shTab('guided');var f=document.getElementById('sg-subject');if(f)f.focus();}));
    hero.append(copy);var art=el('div','sh-home-hero-art');art.append(el('span','','✦'),el('strong','','STUDY'),el('small','','LEARN • REVIEW • GROW'));hero.append(art);overview.append(hero);
    var stats=el('div','sh-home-stats');
    [['Study plans','sg-stat-plans'],['Topics organised','sg-stat-topics'],['Topics completed','sg-stat-completed']].forEach(function(x){var c=el('div','sh-home-stat');c.dataset.source=x[1];c.append(el('span','',x[0]),el('strong','',textOf(x[1])));stats.append(c);});overview.append(stats);
    var head=el('div','sh-home-section-head');head.append(el('h2','','Your learning workspace'),el('p','','Choose a tool to continue or start something new.'));overview.append(head);
    var grid=el('div','sh-home-tools');tools.forEach(function(t){grid.append(card(t));});overview.append(grid);
    var tip=el('div','sh-home-tip');tip.append(el('strong','','A simple study routine'),el('p','','Organise your material in Guided Study, reinforce difficult concepts with AI Notes, then test your memory with Flashcards.'));overview.append(tip);
    guided.parentNode.insertBefore(overview,guided);
    var overviewTab=document.createElement('button');overviewTab.type='button';overviewTab.className='sh-tab-btn active';overviewTab.dataset.tab='overview';overviewTab.setAttribute('role','tab');overviewTab.setAttribute('aria-selected','true');overviewTab.textContent='⌂ Overview';tabs.insertBefore(overviewTab,tabs.firstChild);
    document.querySelectorAll('.sh-tab-btn[data-tab="guided"]').forEach(function(n){n.classList.remove('active');n.setAttribute('aria-selected','false');});
    guided.classList.remove('active');overviewTab.addEventListener('click',function(){window.shTab('overview');});
    var nav=document.querySelector('.sh-nav-items');
    if(nav){
      var items=[{id:'overview',icon:'⌂',name:'General dashboard'},...tools.map(function(t){return{id:t.id,icon:t.icon,name:t.name};})];
      nav.innerHTML='';
      items.forEach(function(t){var n=el('button','sh-nav-item',t.icon+'  '+t.name);n.type='button';n.dataset.tab=t.id;n.addEventListener('click',function(){window.shTab(t.id);if(window.shMenuClose)window.shMenuClose();});nav.append(n);});
      var divider=el('div','sh-nav-divider');nav.append(divider);
      var ai=el('a','sh-nav-item','🤖  AI Teacher');ai.href='ai-teacher.html';nav.append(ai);
    }
    var baseTab=window.shTab;
    window.shTab=function(name){
      if(name==='overview'){
        document.querySelectorAll('.sh-panel').forEach(function(p){p.classList.remove('active');});overview.classList.add('active');
        document.querySelectorAll('.sh-tab-btn').forEach(function(n){var on=n.dataset.tab==='overview';n.classList.toggle('active',on);n.setAttribute('aria-selected',on?'true':'false');});
        document.querySelectorAll('.sh-nav-item[data-tab]').forEach(function(n){n.classList.toggle('active',n.dataset.tab==='overview');});
        var badge=document.getElementById('sh-hdr-active-tab');if(badge)badge.textContent='Overview';refresh();return;
      }
      if(panels[name]){
        document.querySelectorAll('.sh-panel').forEach(function(p){p.classList.remove('active');});panels[name].classList.add('active');
        document.querySelectorAll('.sh-tab-btn').forEach(function(n){var on=n.dataset.tab===name;n.classList.toggle('active',on);n.setAttribute('aria-selected',on?'true':'false');});
        document.querySelectorAll('.sh-nav-item[data-tab]').forEach(function(n){n.classList.toggle('active',n.dataset.tab===name);});
        var badge=document.getElementById('sh-hdr-active-tab');if(badge)badge.textContent=labels[name];
        if(name==='guided'){showDashboard('guided');if(window.shGuidedLoadPlans)window.shGuidedLoadPlans();}
        else showDashboard(name);
        refresh();return;
      }
      baseTab(name);
    };
    var header=document.querySelector('.sh-hdr');if(header){var brand=header.querySelector('.sh-logo');if(brand)brand.textContent='📚 StudyHub';}
    window.shTab('overview');
    document.addEventListener('visibilitychange',function(){if(!document.hidden)refresh();});
  }
  function refresh(){
    document.querySelectorAll('.sh-home-stat[data-source]').forEach(function(n){var v=textOf(n.dataset.source);var strong=n.querySelector('strong');if(strong)strong.textContent=v;});
    var flash= document.querySelector('#sh-flashcards-dashboard .sh-home-stat strong');if(flash&&flash.parentElement&&flash.parentElement.querySelector('span')?.textContent==='Saved decks')flash.textContent=String(decks().length);
  }
  document.addEventListener('DOMContentLoaded',install);
  if(document.readyState!=='loading')install();
})();