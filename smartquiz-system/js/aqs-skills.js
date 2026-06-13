/* ═══════════════════════════════════════════════════════════════════════════
   AQS SKILLS  —  One-per-game character abilities
   CSS lives in css/aqs-skills.css
   ═══════════════════════════════════════════════════════════════════════════ */
(function(window){
  'use strict';

  var SKILLS={
    blaze:  {name:'Fire Burst',    icon:'🔥',color:'#FF6A00',rgb:'255,106,0',  effect:'double',     desc:'Next correct answer = 2× points!'},
    nova:   {name:'Tech Override', icon:'⚡',color:'#06b6d4',rgb:'6,182,212',  effect:'fiftyfifty', desc:'Eliminates 2 wrong options!'},
    cyber:  {name:'Cyber Surge',   icon:'💫',color:'#10b981',rgb:'16,185,129', effect:'shield',     desc:'Wrong answer still earns 3pts!'},
    reaper: {name:'Precision',     icon:'🎯',color:'#94a3b8',rgb:'148,163,184',effect:'double',     desc:'Next correct answer = 2× points!'},
    inferno:{name:'Rock Rage',     icon:'🎸',color:'#ef4444',rgb:'239,68,68',  effect:'timeboost',  desc:'+10 seconds added to timer!'},
    ember:  {name:'Flame Step',    icon:'🔥',color:'#f59e0b',rgb:'245,158,11', effect:'timeboost',  desc:'+10 seconds added to timer!'},
    samurai:{name:'Bushido Code',  icon:'⚔️',color:'#8b5cf6',rgb:'139,92,246', effect:'double',     desc:'Next correct answer = 2× points!'},
    phantom:{name:'Phantom Shift', icon:'👻',color:'#7c3aed',rgb:'124,58,237', effect:'fiftyfifty', desc:'Eliminates 2 wrong options!'},
    viper:  {name:'Viper Strike',  icon:'🐍',color:'#10b981',rgb:'16,185,129', effect:'doublesteal',desc:'Next steal = 2× points!'},
    koda:   {name:'Warrior Spirit',icon:'⚔️',color:'#ef4444',rgb:'239,68,68',  effect:'double',     desc:'Next correct answer = 2× points!'},
    luna:   {name:'Moonlight',     icon:'✨',color:'#ec4899',rgb:'236,72,153',  effect:'shield',     desc:'Wrong answer still earns 3pts!'},
    aang:   {name:'Airbend',       icon:'🌀',color:'#6366f1',rgb:'99,102,241', effect:'timeboost',  desc:'+10 seconds added to timer!'}
  };

  var _S={charId:'blaze',used:false,boostNext:false,shieldNext:false,doubleSteal:false,timeBoostPending:0};

  function _sk(id){return SKILLS[id]||SKILLS.blaze;}

  function initSkillBar(charId){
    _S.charId=charId||_S.charId;
    var sk=_sk(_S.charId);
    var ch=window.AQS_AVATARS?AQS_AVATARS.getChar(_S.charId):null;
    $('#aqs-skill-bar').remove();
    var $bar=$('<div id="aqs-skill-bar"></div>');
    var $btn=$('<div id="aqs-skill-btn" title="'+sk.desc+'"></div>');
    $btn[0].style.setProperty('--skc',sk.color);
    $btn[0].style.setProperty('--skr',sk.rgb);
    var imgHtml=(ch&&ch.img)?'<img src="'+ch.img+'" class="sk-char-img" alt="">':'<span class="sk-icon">'+sk.icon+'</span>';
    if(_S.used){
      $btn.addClass('sk-used');
      $btn.html(imgHtml+'<div class="sk-name">'+sk.icon+' '+sk.name+'</div><div class="sk-used-label">✓ USED</div>');
    } else {
      $btn.addClass('sk-ready');
      $btn.html(imgHtml+'<div class="sk-name">'+sk.icon+' '+sk.name+'</div><div class="sk-use-label">TAP TO USE</div>');
      $btn.on('click',function(){if(!_S.used) _activate();});
    }
    $bar.append($btn);
    $('body').append($bar);
    $bar.css('display','flex');
  }

  function _activate(){
    if(_S.used) return;
    _S.used=true;
    var sk=_sk(_S.charId);
    var ch=window.AQS_AVATARS?AQS_AVATARS.getChar(_S.charId):null;
    $('#aqs-skill-btn').removeClass('sk-ready').addClass('sk-activating sk-used').find('.sk-use-label').replaceWith('<div class="sk-used-label">✓ USED</div>');
    /* Flash overlay */
    var $fl=$('<div id="aqs-skill-flash"></div>');
    $fl[0].style.setProperty('--skc',sk.color); $fl[0].style.setProperty('--skr',sk.rgb);
    var cImg=(ch&&ch.img)?'<img src="'+ch.img+'" class="sk-flash-char" alt="">'
      :'<div class="sk-flash-char" style="display:flex;align-items:center;justify-content:center;font-size:5rem">'+sk.icon+'</div>';
    $fl.html('<div class="sk-flash-bg"></div>'+cImg
      +'<div class="sk-flash-badge">'+sk.icon+' '+sk.name+' ACTIVATED!</div>'
      +'<div class="sk-flash-desc">'+sk.desc+'</div>');
    $('body').append($fl);
    if(window.AQS_AVATARS) AQS_AVATARS.speakLine(sk.name+' activated! '+sk.desc,_S.charId);
    setTimeout(function(){$fl.css({opacity:0,transition:'opacity .4s'});setTimeout(function(){$fl.remove();},430);},1700);
    _applyEffect(sk);
  }

  function _applyEffect(sk){
    if(sk.effect==='double'){
      _S.boostNext=true; _banner(sk.icon+' 2× POINTS ARMED!',sk);
    } else if(sk.effect==='shield'){
      _S.shieldNext=true; _banner(sk.icon+' PENALTY SHIELD ON — WRONG STILL EARNS 3pts!',sk);
    } else if(sk.effect==='timeboost'){
      _S.timeBoostPending=10;
      if(window.CH) CH._extraTimeSecs=(CH._extraTimeSecs||0)+10;
      var $v=$('#aqs-ch-timer-val'); if($v.length){var cur=parseInt($v.text())||0;$v.text(cur+10).css('color','#4ade80');setTimeout(function(){$v.css('color','');},1200);}
      _banner(sk.icon+' +10 SECONDS ADDED!',sk,2500);
    } else if(sk.effect==='fiftyfifty'){
      var $opts=$('.aqs-ch-option:not(.sk-eliminated):not([disabled])');
      if($opts.length>2){
        var pool=[];$opts.each(function(i){pool.push(i);});
        pool.sort(function(){return Math.random()-.5;});
        pool.slice(0,2).forEach(function(i){$($opts[i]).addClass('sk-eliminated').prop('disabled',true);});
      }
      _banner(sk.icon+' 2 WRONG OPTIONS ELIMINATED!',sk,2500);
    } else if(sk.effect==='doublesteal'){
      _S.doubleSteal=true; _banner(sk.icon+' NEXT STEAL = 2× POINTS!',sk);
    }
  }

  function _banner(text,sk,dur){
    $('#aqs-skill-active-banner').remove();
    var $b=$('<div id="aqs-skill-active-banner">'+text+'</div>');
    $b[0].style.setProperty('--skc',sk.color); $b[0].style.setProperty('--skr',sk.rgb);
    $('body').append($b);
    setTimeout(function(){$b.css({opacity:0,transition:'opacity .4s'});setTimeout(function(){$b.remove();},430);},dur||2300);
  }

  function resetPerQuestion(){
    _S.timeBoostPending=0;
    $('.sk-eliminated').removeClass('sk-eliminated').prop('disabled',false);
    $('#aqs-skill-active-banner').remove();
    if(window.CH) CH._extraTimeSecs=0;
  }

  function resetForGame(charId){
    _S={charId:charId||'blaze',used:false,boostNext:false,shieldNext:false,doubleSteal:false,timeBoostPending:0};
    $('#aqs-skill-bar,#aqs-skill-flash,#aqs-skill-active-banner').remove();
    if(window.CH) CH._extraTimeSecs=0;
  }

  function consumeBoost(){if(!_S.boostNext) return 1;_S.boostNext=false;$('#aqs-skill-active-banner').remove();return 2;}
  function consumeShield(){if(!_S.shieldNext) return false;_S.shieldNext=false;$('#aqs-skill-active-banner').remove();return true;}
  function consumeDoubleSteal(){if(!_S.doubleSteal) return false;_S.doubleSteal=false;$('#aqs-skill-active-banner').remove();return true;}
  function hideBar(){$('#aqs-skill-bar').hide();}
  function showBar(){if(_S.charId) $('#aqs-skill-bar').show();}

  window.AQS_SKILLS={
    initSkillBar:initSkillBar,resetPerQuestion:resetPerQuestion,resetForGame:resetForGame,
    consumeBoost:consumeBoost,consumeShield:consumeShield,consumeDoubleSteal:consumeDoubleSteal,
    hideBar:hideBar,showBar:showBar,SKILLS:SKILLS,state:_S
  };
})(window);
