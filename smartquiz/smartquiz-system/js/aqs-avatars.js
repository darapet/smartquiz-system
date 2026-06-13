/* ═══════════════════════════════════════════════════════════════════════════
   AQS AVATARS v3  —  Free Fire Style Characters + Voice
   CSS lives in css/aqs-avatars.css
   ═══════════════════════════════════════════════════════════════════════════ */
(function(window){
  'use strict';

  /* ══════════════════════════════════════════════════════════
     VOICE ENGINE (Web Speech API)
  ══════════════════════════════════════════════════════════ */
  var _voices = [];
  function _loadVoices(){ _voices = (window.speechSynthesis && window.speechSynthesis.getVoices()) || []; }
  if(window.speechSynthesis){ window.speechSynthesis.onvoiceschanged = _loadVoices; setTimeout(_loadVoices, 200); }

  function _stripEmoji(t){ return (t||'').replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}⚔️🔥🌀🌊💪🎯⚡💥🌑✨✈️🦖👑🏆🎵🎤🏅🐍👻💫🎸]/gu,'').trim(); }

  function speakLine(text, charId, onEnd){
    if(!text||!window.speechSynthesis){ if(onEnd) onEnd(); return; }
    var synth=window.speechSynthesis; synth.cancel();
    var ch=getChar(charId);
    var vc=(ch&&ch.voice)?ch.voice:{pitch:1,rate:1,female:false};
    var utt=new SpeechSynthesisUtterance(_stripEmoji(text));
    var enV=_voices.filter(function(v){return v.lang&&v.lang.startsWith('en');});
    if(!enV.length) enV=_voices;
    if(enV.length){
      var idx=CHARS.findIndex(function(c){return c.id===(ch?ch.id:'');});
      if(idx<0) idx=0;
      if(vc.female){
        var fv=enV.find(function(v){return /female|samantha|zira|karen|victoria|susan|tessa|moira/i.test(v.name);});
        utt.voice=fv||enV[idx%enV.length];
      } else {
        var mv=enV.find(function(v){return /male|david|mark|daniel|alex|james|fred/i.test(v.name);});
        utt.voice=mv||enV[idx%enV.length];
      }
    }
    utt.pitch=vc.pitch||1; utt.rate=vc.rate||1; utt.volume=0.92;
    if(onEnd){ utt.onend=function(){onEnd();}; utt.onerror=function(){onEnd();}; }
    synth.speak(utt);
  }

  /* ══════════════════════════════════════════════════════════
     SVG helpers (for fallback characters)
  ══════════════════════════════════════════════════════════ */
  var arms=function(sk){return '<rect x="8" y="55" width="14" height="9" rx="4" fill="'+sk+'"/><rect x="58" y="55" width="14" height="9" rx="4" fill="'+sk+'"/>';};
  var blush=function(){return '<ellipse cx="29" cy="41" rx="4" ry="2.5" fill="#f9a8d4" opacity=".45"/><ellipse cx="51" cy="41" rx="4" ry="2.5" fill="#f9a8d4" opacity=".45"/>';};
  var eyesDot=function(c){return '<circle cx="33" cy="35" r="3" fill="'+c+'"/><circle cx="47" cy="35" r="3" fill="'+c+'"/><circle cx="34" cy="34" r="1" fill="white"/><circle cx="48" cy="34" r="1" fill="white"/>';};
  var eyesWide=function(c){return '<ellipse cx="33" cy="35" rx="3.5" ry="4" fill="'+c+'"/><ellipse cx="47" cy="35" rx="3.5" ry="4" fill="'+c+'"/><circle cx="34" cy="33.5" r="1.5" fill="white"/><circle cx="48" cy="33.5" r="1.5" fill="white"/>';};
  var eyesSquint=function(c){return '<path d="M30,34 Q33,31 36,34" stroke="'+c+'" stroke-width="2.5" fill="none" stroke-linecap="round"/><path d="M44,34 Q47,31 50,34" stroke="'+c+'" stroke-width="2.5" fill="none" stroke-linecap="round"/>';};

  /* ══════════════════════════════════════════════════════════
     CHARACTER ROSTER
  ══════════════════════════════════════════════════════════ */
  var CHARS = [
    {id:'blaze',img:'img/chars/char-blaze.jpg',voice:{pitch:1.25,rate:1.05,female:false},dance:'av-spin',skill:'🔥 Fire Burst — 2× points if answered fast!',name:'Blaze',subtitle:'Fire Striker',themeColor:'#f97316',speech:'I already know the answer. Watch! 🔥',dialogue:{correct:['Burned it! 🔥 Too easy!','Fire always wins! 🔥','That answer was MINE! 🔥'],wrong:['Even fire needs fuel… I\'ll bounce back!','Tactical retreat. Just tactical.'],taunt:['You\'re playing WITH FIRE now! 🔥','Blaze never misses twice!'],steal_win:['Stolen like fire spreads! 🔥'],steal_miss:['Not this time… but I\'m watching. 🔥'],victory:['BLAZE WINS! The arena burns! 🔥 Nobody could stop me!','Fire Lord stands alone! 🔥 CHAMPION!'],defeat:['You lit up today. I\'ll train harder. 🔥']}},
    {id:'nova',img:'img/chars/char-nova.jpg',voice:{pitch:0.95,rate:1.12,female:false},dance:'av-bounce',skill:'⚡ Tech Override — eliminates 2 wrong answers!',name:'Nova',subtitle:'Tech Genius',themeColor:'#06b6d4',speech:'My algorithm says I dominate this quiz. ⚡',dialogue:{correct:['Algorithm confirmed. ⚡','Calculated with precision! ⚡'],wrong:['Data anomaly... recalibrating. ⚡','99% accuracy — this was the 1%.'],taunt:['Error 404: your answers not found. ⚡'],steal_win:['Gap in your code — I patched it! ⚡'],steal_miss:['Insufficient data. Next time.'],victory:['NOVA ONLINE — all others: 404 NOT FOUND! ⚡ Champion!'],defeat:['You outperformed my model. Impressive data point.']}},
    {id:'cyber',img:'img/chars/char-cyber.jpg',voice:{pitch:1.55,rate:1.0,female:true},dance:'av-wave',skill:'💫 Cyber Surge — wrong answer still earns 3pts!',name:'Cyber',subtitle:'Power Queen',themeColor:'#10b981',speech:'My power says I own this quiz! 💫',dialogue:{correct:['Surge accepted! 💫 That\'s mine!','Power flows — and so does knowledge! 💫'],wrong:['Even the most powerful stumble. I rise.','A queen learns from everything. 💫'],taunt:['My energy is rising and your chances are FALLING! 💫'],steal_win:['Cyber takes what the weak leave behind! 💫'],steal_miss:['The orb chose not to cooperate… yet.'],victory:['CYBER REIGNS! The queen is undefeated! 💫 CHAMPION!'],defeat:['The queen bows to a stronger energy today. 💫']}},
    {id:'reaper',img:'img/chars/char-reaper.jpg',voice:{pitch:0.75,rate:0.9,female:false},dance:'av-shake',skill:'🎯 Precision — 2× points on next correct answer!',name:'Reaper',subtitle:'Strategist',themeColor:'#94a3b8',speech:'I\'ve been planning this since the lobby. 🎯',dialogue:{correct:['As planned. 🎯','Strategy confirmed. Flawless.'],wrong:['...A calculated variance. Adjusting.','No plan survives contact — adapting.'],taunt:['You\'re moving predictably. 🎯'],steal_win:['Precision eliminates hesitation. 🎯'],steal_miss:['I chose not to engage. Believe that.'],victory:['The strategist wins again. 🎯 REAPER IS CHAMPION!'],defeat:['A worthy opponent. Well played. 🎯']}},
    {id:'inferno',img:'img/chars/char-inferno.jpg',voice:{pitch:1.1,rate:1.15,female:false},dance:'av-flex',skill:'🎸 Rock Rage — +10 seconds added to timer!',name:'Inferno',subtitle:'Rock Warrior',themeColor:'#ef4444',speech:'This quiz better be ready for INFERNO! 🎸',dialogue:{correct:['ROCK AND ROLL ANSWER! 🎸','That\'s how legends play!'],wrong:['Even rock legends miss a note! 🎸','Feedback! Adjusting my amp! 🎸'],taunt:['Can you keep up with the tempo? 🎸','YOUR SCORE IS MY WARM-UP! 🎸'],steal_win:['STAGE DIVE — point STOLEN! 🎸'],steal_miss:['Missed the beat on that one. 🎸'],victory:['INFERNO DESTROYS THE QUIZ! 🎸 CROWD GOES WILD! CHAMPION!'],defeat:['You played a great set today. Respect.']}},
    {id:'ember',img:'img/chars/char-ember.jpg',voice:{pitch:0.9,rate:1.0,female:false},dance:'av-wave',skill:'🔥 Flame Step — +10 seconds added to timer!',name:'Ember',subtitle:'Street Fighter',themeColor:'#f59e0b',speech:'Street smart always beats book smart! 🔥',dialogue:{correct:['Street knowledge never fails! 🔥','Smooth like flames! 🔥'],wrong:['Everyone slips on the street sometimes.','Recalibrating my street wisdom. 🔥'],taunt:['You\'re FUEL to my fire! 🔥'],steal_win:['Fast hands, fast mind! 🔥'],steal_miss:['Almost — but almost doesn\'t count on the street. 🔥'],victory:['EMBER BURNS THROUGH THE COMPETITION! 🔥 CHAMPION!'],defeat:['The fire never goes out. I\'ll be back. 🔥']}},
    {id:'samurai',img:'img/chars/char-samurai.jpg',voice:{pitch:0.7,rate:0.88,female:false},dance:'av-stomp',skill:'⚔️ Bushido — 2× points on next correct answer!',name:'Samurai',subtitle:'Code of Honor',themeColor:'#8b5cf6',speech:'The way of the warrior knows no wrong answer. ⚔️',dialogue:{correct:['The blade strikes true! ⚔️','Honor achieved! ⚔️'],wrong:['Even the samurai must reflect… ⚔️','The blade was not ready. It will be. ⚔️'],taunt:['Face me with honor! ⚔️'],steal_win:['The blade sees every opening! ⚔️'],steal_miss:['I chose to let you have that one. Bushido demands honor.'],victory:['SAMURAI STANDS VICTORIOUS! ⚔️ THE WAY OF KNOWLEDGE IS MINE!'],defeat:['The warrior accepts defeat with honor. Until next time. ⚔️']}},
    {id:'phantom',img:'img/chars/char-phantom.jpg',voice:{pitch:0.8,rate:0.95,female:false},dance:'av-float',skill:'👻 Phantom Shift — eliminates 2 wrong answers!',name:'Phantom',subtitle:'The Unknown',themeColor:'#7c3aed',speech:'They never saw Phantom coming… 👻',dialogue:{correct:['Phantom strikes from the shadows! 👻','Nobody saw that coming! 👻'],wrong:['The mask slips only once. 👻','Phantom recalculates in the dark…'],taunt:['Fear the player you cannot predict! 👻'],steal_win:['Snatched from the void! 👻'],steal_miss:['The shadow missed this one. Unusual.'],victory:['PHANTOM EMERGES FROM THE DARKNESS — CHAMPION! 👻'],defeat:['You played brilliantly. Phantom acknowledges.']}},
    {id:'viper',img:'img/chars/char-viper.jpg',voice:{pitch:1.0,rate:1.05,female:false},dance:'av-shake',skill:'🐍 Viper Strike — next steal = 2× points!',name:'Viper',subtitle:'Smooth Operator',themeColor:'#10b981',speech:'Cool, calm, and always correct. That\'s Viper. 🐍',dialogue:{correct:['Smooth like a viper strike. 🐍','Cool under pressure — always. 🐍'],wrong:['Even the viper needs to recalibrate…','A stumble, not a fall. 🐍'],taunt:['You can\'t rattle a viper. 🐍'],steal_win:['Swift strike! Point acquired. 🐍'],steal_miss:['Patient as always. 🐍'],victory:['VIPER NEVER LOSES THEIR COOL — OR THE MATCH! 🐍 CHAMPION!'],defeat:['Class act performance. Well done.']}},
    /* SVG fallback characters */
    {id:'koda',img:null,voice:{pitch:1.2,rate:1.0,female:false},dance:'av-spin',skill:'⚔️ Warrior Spirit — 2× points on next correct!',name:'Koda',subtitle:'Warrior',themeColor:'#ef4444',speech:'Blade first, questions later! ⚔️',dialogue:{correct:['That\'s how warriors answer! ⚔️'],wrong:['A warrior learns from defeat!'],taunt:['The battlefield shifts my way! ⚔️'],steal_win:['Stolen! That point is MINE! ⚔️'],steal_miss:['Not this time… but I\'m watching.'],victory:['KODA WINS! ⚔️','Victory belongs to the prepared! ⚔️'],defeat:['I\'ll train harder for our rematch.']},svg:function(){var sk='#FDDBB4';return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" class="aqs-av-svg"><circle cx="40" cy="14" r="9" fill="#1a0505"/><ellipse cx="40" cy="27" rx="21" ry="14" fill="#1a0505"/><circle cx="40" cy="35" r="19" fill="'+sk+'"/>'+eyesDot('#1a0505')+blush()+'<rect x="22" y="52" width="36" height="32" rx="8" fill="#dc2626"/>'+arms(sk)+'<rect x="65" y="22" width="4" height="32" rx="2" fill="#9ca3af"/><circle cx="67" cy="22" r="4" fill="#f59e0b"/></svg>';}},
    {id:'luna',img:null,voice:{pitch:1.6,rate:0.95,female:true},dance:'av-float',skill:'✨ Moonlight — wrong answer still earns 3pts!',name:'Luna',subtitle:'Mystic',themeColor:'#ec4899',speech:'The stars have already told me… ✨',dialogue:{correct:['The stars wrote it! ✨'],wrong:['The cosmos will realign…'],taunt:['The moon smiles on ME! ✨'],steal_win:['Destiny delivered it! ✨'],steal_miss:['The universe tests me. ✨'],victory:['Luna REIGNS! ✨ CHAMPION!'],defeat:['The cosmos chose well. ✨']},svg:function(){var sk='#FDDBB4';return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" class="aqs-av-svg"><ellipse cx="40" cy="25" rx="21" ry="13" fill="#e2e8f0"/><path d="M24,22 L28,13 L34,19 L40,9 L46,19 L52,13 L56,22 L24,22Z" fill="#ec4899"/><circle cx="40" cy="11" r="3" fill="#fbbf24"/><circle cx="40" cy="35" r="19" fill="'+sk+'"/>'+eyesWide('#4c1d95')+blush()+'<rect x="22" y="52" width="36" height="32" rx="8" fill="#7e22ce"/>'+arms(sk)+'</svg>';}},
    {id:'aang',img:null,voice:{pitch:1.3,rate:1.05,female:false},dance:'av-float',skill:'🌀 Airbend — +10 seconds added to timer!',name:'Aang',subtitle:'Airbender',themeColor:'#6366f1',speech:'Let the quiz flow through you like air! 🌀',dialogue:{correct:['Balance restored! 🌀'],wrong:['Every mistake is a lesson! 🌀'],taunt:['Be like the wind! 🌀'],steal_win:['The wind guided my hand! 🌀'],steal_miss:['The air carried it away… 🌀'],victory:['Peace, knowledge, victory! 🌀 CHAMPION!'],defeat:['Every champion was a student first!']},svg:function(){var sk='#E8B88A';return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 100" class="aqs-av-svg"><circle cx="40" cy="35" r="19" fill="'+sk+'"/>'+eyesWide('#1a0a0a')+blush()+'<rect x="22" y="52" width="36" height="32" rx="8" fill="#d97706"/>'+arms(sk)+'</svg>';}}
  ];

  var _idAlias={toph:'samurai',katara:'cyber',titan:'inferno',shadow:'phantom',rex:'viper',ace:'blaze'};

  function getChar(id){ id=_idAlias[id]||id; return CHARS.find(function(c){return c.id===id;})||CHARS[0]; }

  function _charImgEl(ch,w,h,cls){
    w=w||80; h=h||100; cls=cls||'';
    if(ch.img) return '<img src="'+ch.img+'" class="'+cls+'" style="width:'+w+'px;height:'+h+'px;object-fit:cover;object-position:top;border-radius:8px" loading="lazy" alt="'+ch.name+'" onerror="this.style.display=\'none\'">';
    if(ch.svg) return '<div style="width:'+w+'px;height:'+h+'px;display:flex;align-items:center;justify-content:center">'+ch.svg()+'</div>';
    return '<div style="width:'+w+'px;height:'+h+'px;background:'+ch.themeColor+'33;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:2rem;color:#fff">'+ch.name[0]+'</div>';
  }

  function buildSVG(id,size){
    var ch=getChar(id); size=size||80;
    return '<div class="aqs-av-wrap" data-av-id="'+ch.id+'" data-dance="'+ch.dance+'" style="width:'+size+'px;height:'+(size*1.2)+'px;border-radius:8px;overflow:hidden;flex-shrink:0">'+_charImgEl(ch,size,size*1.2)+'</div>';
  }

  function buildCard(id,isSelected){
    var ch=getChar(id);
    var inner=ch.img?'<img src="'+ch.img+'" class="aqs-av-card-img" alt="'+ch.name+'" onerror="this.style.background=\'#1e1b4b\'">'
      :'<div class="aqs-av-card-svg">'+(ch.svg?ch.svg():'')+'</div>';
    return '<div class="aqs-av-card'+(isSelected?' av-selected':'')+'" data-av-id="'+ch.id+'" tabindex="0" role="button">'
      +inner+'<div class="aqs-av-card-name">'+ch.name+'</div>'
      +'<div class="aqs-av-card-sub">'+ch.subtitle+'</div>'
      +'<div class="aqs-av-card-check">✓</div></div>';
  }

  function buildPickerHTML(selectedId){
    var html='<div class="aqs-av-picker"><div class="aqs-av-picker-title">🔥 BOOYAH! — Choose Your Fighter</div><div class="aqs-av-picker-grid">';
    CHARS.forEach(function(ch){ html+=buildCard(ch.id,ch.id===selectedId); });
    html+='</div></div>';
    return html;
  }

  function avatar(name,sz,charId,pos){
    sz=sz||36;
    if(charId&&charId!==''){
      var ch=getChar(charId);
      if(ch.img) return '<div class="aqs-av-wrap" data-av-id="'+ch.id+'" data-dance="'+ch.dance+'"'+(pos!==undefined?' data-av-pos="'+pos+'"':'')+' style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;overflow:hidden;border:2px solid '+ch.themeColor+'55;flex-shrink:0"><img src="'+ch.img+'" style="width:100%;height:100%;object-fit:cover;object-position:top" alt="'+ch.name+'"></div>';
      if(ch.svg) return '<div class="aqs-av-wrap" data-av-id="'+ch.id+'" data-dance="'+ch.dance+'"'+(pos!==undefined?' data-av-pos="'+pos+'"':'')+' style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;overflow:hidden;background:'+ch.themeColor+'22;border:2px solid '+ch.themeColor+'55;flex-shrink:0">'+ch.svg()+'</div>';
    }
    var cols=['#6366f1','#8b5cf6','#06b6d4','#f59e0b','#10b981','#ef4444','#ec4899','#f97316'];
    var c=cols[(name||'?').charCodeAt(0)%cols.length];
    return '<div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:'+(sz*.42)+'px;flex-shrink:0">'+((name||'?')[0].toUpperCase())+'</div>';
  }

  function triggerDance(posOrEl){
    var $el=typeof posOrEl==='number'?$('.aqs-av-wrap[data-av-pos="'+posOrEl+'"]'):$(posOrEl);
    if(!$el.length) return;
    var dClass=$el.data('dance')||'av-spin';
    $el.addClass(dClass+' av-dancing');
    setTimeout(function(){$el.removeClass(dClass+' av-dancing');},1800);
  }

  function getRandomLine(charId,dtype){
    var ch=getChar(charId||'blaze');
    if(!ch||!ch.dialogue) return '';
    var lines=ch.dialogue[dtype];
    if(!lines||!lines.length) return '';
    return lines[Math.floor(Math.random()*lines.length)];
  }

  function showScoreboardSpeech(pos,text,duration,charId){
    if(!text) return;
    /* Speak the line with character voice — AUDIO ONLY, no text bubble shown */
    if(charId) speakLine(text, charId);
    /* Show a floating character portrait (no text bubble) */
    var ch = charId ? getChar(charId) : null;
    $('#aqs-char-popup').remove();
    if(!ch) return;
    var imgHtml = _charImgEl(ch, 70, 96, 'aqs-char-popup-img');
    var $popup = $('<div id="aqs-char-popup" class="aqs-char-popup-wrap"></div>');
    $popup.html('<div class="aqs-char-popup-inner"><div class="aqs-char-popup-portrait">'+imgHtml+'</div></div>');
    $('body').append($popup);
    var popupMs = duration||2600;
    setTimeout(function(){
      $popup.css({opacity:0,transition:'opacity .4s'});
      setTimeout(function(){ $popup.remove(); }, 420);
    }, popupMs);
  }

  function showAnswerReaction(charId,isCorrect,line){
    /* Audio-only reaction — character speaks but no text is displayed.
       The full character moment is handled by showCharacterMoment during reveal. */
    var text=line||getRandomLine(charId,isCorrect?'correct':'wrong');
    if(text) speakLine(text,charId);
  }

  /* ── Celebrity character moment — shown on ALL screens during reveal ────
     Correct: golden glow, sparkle particles, character speaks (audio only)
     Wrong:   desaturated/dim, motivational speech (audio only)
     No text is ever displayed — only the spoken audio line. ── */
  function showCharacterMoment(charId, isCorrect, pts) {
    var ch = getChar(charId || 'blaze');
    var lineType = isCorrect ? 'correct' : 'wrong';
    var line = getRandomLine(charId, lineType);

    $('#aqs-char-moment').remove();

    var imgCls = 'aqs-char-moment-img' + (isCorrect ? ' char-moment-correct' : ' char-moment-wrong');
    var imgHtml = _charImgEl(ch, 150, 210, imgCls);

    var innerCls = 'aqs-char-moment-inner' + (isCorrect ? ' char-moment-inner-correct' : ' char-moment-inner-wrong');
    var html = '<div class="' + innerCls + '">';
    if (isCorrect) {
      html += '<div class="char-moment-shine-ring"></div>';
      html += '<div class="char-moment-particles" id="aqs-moment-particles"></div>';
      html += '<div class="char-moment-label char-moment-label-correct">✨ CORRECT!</div>';
    } else {
      html += '<div class="char-moment-label char-moment-label-wrong">Keep going…</div>';
    }
    html += imgHtml;
    if (isCorrect && pts > 0) {
      html += '<div class="char-moment-pts">+' + pts + ' pts</div>';
    }
    html += '</div>';

    var $moment = $('<div id="aqs-char-moment" class="aqs-char-moment-wrap"></div>').html(html);
    $('body').append($moment);

    /* Spawn golden sparkle particles for correct answer */
    if (isCorrect) {
      var el = document.getElementById('aqs-moment-particles');
      if (el) _spawnMomentParticles(el);
    }

    /* Speak the line — AUDIO ONLY, no text shown */
    if (line) speakLine(line, charId);

    /* Auto-dismiss after 3.5s with fade */
    setTimeout(function() {
      $moment.css({ opacity: 0, transition: 'opacity .5s' });
      setTimeout(function() { $moment.remove(); }, 520);
    }, 3500);
  }

  function _spawnMomentParticles(el) {
    var cols = ['#FFD700','#FFA500','#FFEC80','#fff','#FF6A00','#FFB800'];
    for (var i = 0; i < 32; i++) {
      var p = document.createElement('div');
      p.className = 'char-moment-particle';
      p.style.cssText = 'left:'+(18+Math.random()*64)+'%;'
        +'animation-duration:'+(.55+Math.random()*.9)+'s;'
        +'animation-delay:'+(Math.random()*.6)+'s;'
        +'background:'+cols[Math.floor(Math.random()*cols.length)]+';'
        +'width:'+(4+Math.random()*7)+'px;height:'+(4+Math.random()*7)+'px;'
        +'border-radius:'+(Math.random()>.5?'50%':'2px')+';';
      el.appendChild(p);
    }
  }

  function buildHypeScreen(players,secs){
    players=players||[];
    var html='<div class="aqs-ff-booyah">BOOYAH!</div>';
    html+='<div class="aqs-ff-lobby-badge"><span class="aqs-ff-lobby-badge-icon">🔥</span><span class="aqs-ff-lobby-badge-text">Quiz Showdown</span></div>';
    html+='<div class="aqs-ff-lobby-sub">⚡ SQUAD · SELECT YOUR CHARACTER ⚡</div>';
    html+='<div class="aqs-ff-chars-row" id="aqs-ff-chars-row">';
    players.forEach(function(p){
      var ch=getChar(p.character_id||'blaze');
      var isHost=p.is_host==1||p.is_host===true;
      html+='<div class="aqs-ff-char-slot" data-pos="'+p.position+'" data-char="'+ch.id+'">';
      html+='<div class="aqs-ff-char-img-wrap'+(isHost?' is-host':'')+'">';
      if(ch.img) html+='<img src="'+ch.img+'" class="aqs-ff-char-img" alt="'+ch.name+'">';
      else if(ch.svg) html+='<div class="aqs-ff-char-img-svg">'+ch.svg()+'</div>';
      html+='</div>';
      html+='<div class="aqs-ff-char-name">'+(p.player_name||'Player')+(isHost?' 👑':'')+'</div>';
      html+='<div class="aqs-ff-char-tag">'+ch.name+' · '+ch.subtitle+'</div>';
      html+='<div class="aqs-ff-skill-badge">'+ch.skill+'</div>';
      html+='</div>';
    });
    html+='</div>';
    html+='<div id="aqs-hype-num" class="aqs-hype-num">'+secs+'</div>';
    return '<div class="aqs-hype-wrap">'+html+'</div>';
  }

  function triggerHypeDance(overlay){
    if(!overlay) return;
    overlay.querySelectorAll('.aqs-ff-char-img').forEach(function(img){
      img.style.animation='cel-char-flex 1.6s ease infinite';
    });
  }

  function triggerSequentialSpeech(players,overlay){
    players=players||[];
    if(!players.length) return;
    players.forEach(function(p,i){
      setTimeout(function(){
        if(!document.contains(overlay)) return;
        var ch=getChar(p.character_id||'blaze');
        var line=ch.speech||getRandomLine(ch.id,'taunt');
        var slot=overlay?overlay.querySelector('[data-pos="'+p.position+'"]'):null;
        if(slot){
          var old=slot.querySelector('.aqs-ff-speech'); if(old) old.remove();
          var bub=document.createElement('div'); bub.className='aqs-ff-speech'; bub.textContent=line;
          slot.appendChild(bub);
          setTimeout(function(){if(bub.parentNode) bub.remove();},2600);
        }
        speakLine(line,ch.id);
      }, 400+i*3000);
    });
  }

  function showWinnerCelebration(winner,allPlayers,scores,onDone){
    if(!winner){if(onDone) onDone(); return;}
    var ch=getChar(winner.character_id||'blaze');
    var winScore=scores?(scores[winner.position]||0):0;
    var victoryLine=getRandomLine(ch.id,'victory')||(ch.name+' WINS!');
    var $cel=$('<div id="aqs-winner-cel"></div>');
    $cel.html(
      '<div class="cel-bg-glow"></div>'+
      '<div class="cel-booyah">BOOYAH!</div>'+
      '<div class="cel-title">🏆 Squad Winner</div>'+
      '<div class="cel-name">'+winner.player_name+'</div>'+
      '<div class="cel-score">🔥 '+winScore+' points</div>'+
      '<div class="cel-char-wrap">'+
        '<div class="cel-crown">👑</div>'+
        _charImgEl(ch,155,215,'cel-char-img')+
      '</div>'+
      '<div class="cel-speech">'+victoryLine+'</div>'+
      '<div style="text-align:center;position:relative;z-index:1">'+
        '<div class="cel-progress"><div class="cel-progress-bar" id="aqs-cel-pbar" style="width:100%"></div></div>'+
        '<div class="cel-progress-label" id="aqs-cel-label">Moving to leaderboard in 10s…</div>'+
      '</div>'
    );
    $('body').append($cel);
    /* Confetti */
    var cols=['#FF6A00','#FFD700','#FF2400','#10b981','#ef4444','#ec4899','#60a5fa','#fff'];
    for(var i=0;i<80;i++){
      var c=document.createElement('div'); c.className='aqs-conf-p';
      c.style.cssText='left:'+Math.random()*100+'%;background:'+cols[i%cols.length]+';animation-duration:'+(3+Math.random()*4)+'s;animation-delay:'+Math.random()*2+'s;width:'+(6+Math.random()*8)+'px;height:'+(6+Math.random()*8)+'px;border-radius:'+(Math.random()>.5?'50%':'2px');
      $cel[0].appendChild(c);
    }
    speakLine(victoryLine,ch.id);
    var secs=10;
    var $bar=$('#aqs-cel-pbar'); var $lbl=$('#aqs-cel-label');
    var tick=setInterval(function(){
      secs--;
      $bar.css('width',(secs/10*100)+'%');
      $lbl.text('Moving to leaderboard in '+secs+'s…');
      if(secs<=0){
        clearInterval(tick);
        $cel.css({opacity:0,transition:'opacity .6s'});
        setTimeout(function(){$cel.remove();if(onDone) onDone();},650);
      }
    },1000);
  }

  function buildResultsReaction(players,scores){
    var sorted=players.slice().sort(function(a,b){return (scores[b.position]||0)-(scores[a.position]||0);});
    var html='<div class="aqs-results-chars">';
    sorted.forEach(function(p,rank){
      var ch=getChar(p.character_id||'blaze');
      var isWinner=rank===0;
      var line=isWinner?getRandomLine(ch.id,'victory'):getRandomLine(ch.id,'defeat');
      html+='<div class="aqs-results-char">';
      if(isWinner) html+='<div class="aqs-results-crown">👑</div>';
      html+=_charImgEl(ch,78,108,'aqs-results-char-img'+(isWinner?' winner-char':''));
      html+='<div class="aqs-results-char-name">'+p.player_name+'</div>';
      html+='<div class="aqs-results-char-line">'+line+'</div>';
      html+='</div>';
    });
    html+='</div>';
    return html;
  }

  window.AQS_AVATARS={
    getChar:getChar, buildSVG:buildSVG, buildCard:buildCard,
    buildPickerHTML:buildPickerHTML, avatar:avatar,
    triggerDance:triggerDance, triggerHypeDance:triggerHypeDance,
    buildHypeScreen:buildHypeScreen, triggerSequentialSpeech:triggerSequentialSpeech,
    getRandomLine:getRandomLine, showScoreboardSpeech:showScoreboardSpeech,
    showAnswerReaction:showAnswerReaction, showCharacterMoment:showCharacterMoment,
    buildResultsReaction:buildResultsReaction,
    showWinnerCelebration:showWinnerCelebration, speakLine:speakLine, CHARS:CHARS
  };
})(window);
