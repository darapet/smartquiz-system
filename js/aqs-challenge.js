/* AQS Challenge Mode v2 — aqs-challenge.js */
  (function($){
  'use strict';

  /* ── Inject feedback + timebar styles once ────────────────────────── */
  (function(){
      if(document.getElementById('aqs-ch-extra-styles')) return;
      var css=
          '.aqs-ch-timebar-wrap{width:100%;background:rgba(255,255,255,.12);border-radius:6px;height:7px;margin:8px 0 14px;overflow:hidden}'+
          '.aqs-ch-timebar{height:100%;border-radius:6px;background:linear-gradient(90deg,#6366f1,#8b5cf6);transition:width .95s linear}'+
          '.aqs-ch-timebar.danger{background:linear-gradient(90deg,#ef4444,#f97316)}'+
          '.aqs-ch-feedback{margin-top:14px;padding:14px 16px;border-radius:10px;font-size:.93rem;line-height:1.55;animation:aqsFbIn .25s ease}'+
          '.aqs-ch-feedback.correct{background:rgba(74,222,128,.15);border:1px solid rgba(74,222,128,.4);color:#4ade80}'+
          '.aqs-ch-feedback.wrong{background:rgba(239,68,68,.15);border:1px solid rgba(239,68,68,.4);color:#fca5a5}'+
          '.aqs-ch-feedback .aqs-fb-expl{margin-top:7px;color:rgba(255,255,255,.8);font-size:.87rem}'+
          '.aqs-ch-feedback .aqs-fb-next{margin-top:8px;font-size:.8rem;color:rgba(255,255,255,.45)}'+
          '@keyframes aqsFbIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}';
      var s=document.createElement('style');
      s.id='aqs-ch-extra-styles'; s.textContent=css;
      document.head.appendChild(s);
  })();

  var CH = {
      code:'', playerToken:'', position:-1, isHost:false, playerName:'',
      numPlayers:2, numQuestions:5, numRounds:1, qpr:5, timePerQ:30,
      title:'', hostName:'',
      pollTimer:null, countdownTimer:null,
      lastRound:-1, lastAttemptIdx:-1, lastPhase:'', answered:false,
      chatSeenCount:0, musicUnlocked:false, musicPlaying:false,
      serverOffset:0,  /* ms offset between client and server clocks */
      selectedAnswerIdx:-1,  /* -1 = no selection; ≥0 = pending selection not yet confirmed */
      prevScores:{},   /* scores snapshot from the previous question — used to compute deltas */
      prevRanks:{},    /* rank snapshot from the previous question — used to compute rank changes */
      resultsShown:false  /* guard: prevents showResults() firing more than once per game */
  };

  /* ── Challenge host question pool ─────────────────────────────────── */
  var chQuestions    = [];   /* accumulated question objects for the challenge */
  var _chRetryFn     = null; /* last generation function — used by Retry button */
  var _chUploadFile  = null; /* file selected in Upload panel */
  var _chUploadMode  = '';   /* 'mcq' | 'ai' — chosen after file selected */
  var _chDocText     = '';   /* cached extracted text from uploaded file */

  /* ── Audio engine ──────────────────────────────────────────────────── */
  var _bgAudio = null;
  function initMusic(){
      if(_bgAudio) return;
      _bgAudio = new Audio();
      _bgAudio.loop = true;
      _bgAudio.volume = 0.3;
      /* Try plugin file first, fall back to CDN loopable track */
      var srcs = [
          (window.AQS_CH_MUSIC_URL||''),
          'https://cdn.pixabay.com/audio/2024/01/13/audio_b5e4cbf73b.mp3',
          'https://cdn.pixabay.com/audio/2022/10/16/audio_12a1a84e3f.mp3'
      ].filter(Boolean);
      var idx=0;
      function tryNext(){
          if(idx>=srcs.length) return;
          _bgAudio.src=srcs[idx++];
          _bgAudio.load();
      }
      _bgAudio.onerror=function(){ tryNext(); };
      tryNext();
  }
  function playMusic(){
      if(!_bgAudio||CH.musicPlaying) return;
      _bgAudio.play().then(function(){ CH.musicPlaying=true; $('#aqs-ch-music-btn').text('🔇 Mute'); }).catch(function(){});
  }
  function pauseMusic(){ if(_bgAudio){ _bgAudio.pause(); CH.musicPlaying=false; $('#aqs-ch-music-btn').text('🎵 Music'); } }
  function toggleMusic(){ CH.musicPlaying?pauseMusic():playMusic(); }
  /* Unlock on first user gesture (needed for autoplay policy on mobile/http) */
  function unlockMusic(){
      if(CH.musicUnlocked) return;
      CH.musicUnlocked=true;
      initMusic();
      playMusic();
      document.removeEventListener('click',unlockMusic);
      document.removeEventListener('keydown',unlockMusic);
      document.removeEventListener('touchstart',unlockMusic);
  }
  document.addEventListener('click',unlockMusic,{once:true});
  document.addEventListener('keydown',unlockMusic,{once:true});
  document.addEventListener('touchstart',unlockMusic,{once:true,passive:true});

  /* ── Voice Chat module ─────────────────────────────────────────────── */
  var _voiceEnabled    = false;
  var _mediaRecorder   = null;
  var _micStream       = null;
  var _voiceChunkHashes= {};
  var _voiceInitDone   = false;

  function initVoiceChat(){
      _voiceEnabled=false; _mediaRecorder=null; _micStream=null; _voiceChunkHashes={};
      $('#aqs-ch-mic-btn').show()
          .removeClass('active')
          .off('click').on('click', toggleMic)
          .text('🎤 Voice');
  }
  function toggleMic(){ _voiceEnabled ? stopMic() : startMic(); }
  function startMic(){
      if(!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia){
          flash('Voice chat is not supported in this browser.'); return;
      }
      navigator.mediaDevices.getUserMedia({audio:true,video:false}).then(function(stream){
          _micStream=stream; _voiceEnabled=true;
          $('#aqs-ch-mic-btn').text('🔴 Stop Mic').addClass('active');
          var mime=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
              ?'audio/webm;codecs=opus'
              :(MediaRecorder.isTypeSupported('audio/ogg')?'audio/ogg':'audio/webm');
          _mediaRecorder=new MediaRecorder(stream,{mimeType:mime});
          _mediaRecorder.ondataavailable=function(e){
              if(e.data.size<100) return;
              /* Voice push disabled on static hosting — no backend available */
              void e.data;
          };
          _mediaRecorder.start(500); /* 500ms chunks for smoother voice */
      }).catch(function(err){ flash('Mic access denied: '+err.message); });
  }
  function stopMic(){
      _voiceEnabled=false;
      if(_mediaRecorder&&_mediaRecorder.state!=='inactive') _mediaRecorder.stop();
      if(_micStream){ _micStream.getTracks().forEach(function(t){t.stop();}); _micStream=null; }
      _mediaRecorder=null;
      $('#aqs-ch-mic-btn').text('🎤 Voice').removeClass('active');
  }
  function pollVoice(){
      /* Voice chat requires a server backend — disabled on static hosting */
      return;
  }
  /* Voice playback queue — prevents gaps and cracking between chunks */
    var _voiceQueue=[];var _voicePlaying=false;var _voiceAudioCtx=null;
    function getVoiceCtx(){if(!_voiceAudioCtx||_voiceAudioCtx.state==='closed'){_voiceAudioCtx=new(window.AudioContext||window.webkitAudioContext)();}if(_voiceAudioCtx.state==='suspended')_voiceAudioCtx.resume();return _voiceAudioCtx;}
    function drainVoiceQueue(){if(!_voiceQueue.length){_voicePlaying=false;return;}_voicePlaying=true;var ab=_voiceQueue.shift();try{var ctx=getVoiceCtx();ctx.decodeAudioData(ab.slice(0),function(audioBuffer){var src=ctx.createBufferSource();src.buffer=audioBuffer;src.connect(ctx.destination);src.onended=function(){drainVoiceQueue();};src.start(0);},function(){var blob=new Blob([ab],{type:'audio/webm'});var url=URL.createObjectURL(blob);var aud=new Audio(url);aud.onended=function(){URL.revokeObjectURL(url);drainVoiceQueue();};aud.onerror=function(){URL.revokeObjectURL(url);drainVoiceQueue();};aud.play().catch(function(){URL.revokeObjectURL(url);drainVoiceQueue();});});}catch(e){_voicePlaying=false;}}
    function playVoiceChunk(pos,b64data){
        var hash=b64data.slice(-24);
        if(_voiceChunkHashes[pos]===hash) return;
        _voiceChunkHashes[pos]=hash;
        try{
            var byteStr=atob(b64data);
            var ab=new ArrayBuffer(byteStr.length);
            var ia=new Uint8Array(ab);
            for(var i=0;i<byteStr.length;i++) ia[i]=byteStr.charCodeAt(i);
            _voiceQueue.push(ab);
            if(!_voicePlaying) drainVoiceQueue();
        } catch(e){}
    }

  /* ── Sound FX ──────────────────────────────────────────────────────── */
  function beep(f,d,t,v){try{var ctx=new(window.AudioContext||window.webkitAudioContext)(),o=ctx.createOscillator(),g=ctx.createGain();o.type=t||'sine';o.frequency.value=f;g.gain.setValueAtTime(v||.4,ctx.currentTime);g.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+d);o.connect(g);g.connect(ctx.destination);o.start();o.stop(ctx.currentTime+d);}catch(e){}}
  function playCorrect(){beep(880,.08,'sine',.3);setTimeout(function(){beep(1320,.2,'sine',.25);},80);}
  function playWrong(){beep(180,.3,'sawtooth',.2);}
  function playReveal(){beep(440,.06,'sine',.2);setTimeout(function(){beep(660,.15,'sine',.2);},60);}
  function playCelebrate(){[523,659,784,1047].forEach(function(f,i){setTimeout(function(){beep(f,.15,'sine',.28);},i*90);});}
  function playTick(){beep(880,.04,'square',.15);}

  /* ── Utils ─────────────────────────────────────────────────────────── */
  function esc(s){return $('<div>').text(s||'').html();}

  /* ── Math pre-renderer ───────────────────────────────────────────────
     Walks the raw text, locates every $...$ and $$...$$ token, renders
     each with KaTeX.renderToString() *before* the result touches the DOM,
     and HTML-escapes all surrounding plain text.  Fully synchronous.
     Falls back to esc() if KaTeX hasn't loaded yet.
  ──────────────────────────────────────────────────────────────────── */
  function chRenderMath(raw){
      if(!raw) return '';
      if(typeof katex==='undefined') return esc(raw);

      /* Normalise alternate delimiter variants the AI sometimes uses */
      var t=String(raw);
      t=t.replace(/\\\[([\s\S]+?)\\\]/g,  function(_,m){ return '$$'+m+'$$'; });
      t=t.replace(/\\\(([\s\S]+?)\\\)/g,  function(_,m){ return '$'+m+'$';   });
      t=t.replace(/\\begin\{equation\*?\}([\s\S]+?)\\end\{equation\*?\}/g,
                  function(_,m){ return '$$'+m+'$$'; });
      t=t.replace(/\\begin\{align\*?\}([\s\S]+?)\\end\{align\*?\}/g,
                  function(_,m){ return '$$'+m+'$$'; });

      var out='';
      /* Match $$...$$ (display) OR $...$ (inline) — display tested first */
      var pattern=/(\$\$[\s\S]+?\$\$|\$[^$\n]{1,400}?\$)/g;
      var last=0, m;
      raw=t; /* operate on normalised string */

      while((m=pattern.exec(raw))!==null){
          /* Plain text segment before this math token */
          if(m.index>last) out+=esc(raw.slice(last,m.index));

          var full=m[0];
          var isDisplay=full.slice(0,2)==='$$';
          var math=(isDisplay?full.slice(2,-2):full.slice(1,-1)).trim();

          /* Skip bare currency amounts like $5 or $1,200 */
          if(!isDisplay&&/^\d[\d,\.]*$/.test(math)){
              out+=esc(full);
          } else {
              try{
                  var rendered=katex.renderToString(math,{displayMode:isDisplay,throwOnError:false,trust:true});
                  out+=isDisplay?'<span class="aqs-ch-katex-block">'+rendered+'</span>':rendered;
              } catch(e){
                  out+='<code>'+esc(math)+'</code>';
              }
          }
          last=m.index+full.length;
      }
      /* Remaining plain text */
      if(last<raw.length) out+=esc(raw.slice(last));
      return out;
  }
  function avatar(name,sz,charId,pos){
      sz=sz||36;
      if(charId && window.AQS_AVATARS){
          /* Delegate to AQS_AVATARS.avatar() which correctly handles both
             photo characters (img) and SVG fallback characters (svg method) */
          return window.AQS_AVATARS.avatar(name,sz,charId,pos);
      }
      var cols=['#6366f1','#8b5cf6','#06b6d4','#f59e0b','#10b981','#ef4444','#ec4899','#f97316'];
      var c=cols[(name||'?').charCodeAt(0)%cols.length];
      return '<div style="width:'+sz+'px;height:'+sz+'px;border-radius:50%;background:'+c+';display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:'+(sz*.42)+'px;flex-shrink:0">'+esc((name||'?')[0].toUpperCase())+'</div>';
  }
  function showScreen(id){$('.aqs-ch-screen').removeClass('active');$('#'+id).addClass('active');}
  function flash(msg,type){var cls='aqs-ch-alert-'+(type||'error');var $a=$('<div class="aqs-ch-alert '+cls+'">'+esc(msg)+'</div>');$('#aqs-ch-alerts').empty().append($a);setTimeout(function(){$a.fadeOut(400,function(){$a.remove();});},5000);}
  function btnLoading($b,t){$b.prop('disabled',true).text(t||'Please wait…');}
  function btnRestore($b,t){$b.prop('disabled',false).text(t);}
  function getUrlParam(k){return new URLSearchParams(window.location.search).get(k)||'';}
  function setUrlCode(c){var u=new URL(window.location.href);u.searchParams.set('aqs_challenge',c);window.history.replaceState({},'',u.toString());}
  function challengeUrl(c){var u=new URL(window.location.href);u.searchParams.set('aqs_challenge',c);return u.toString();}
  function getPlayerName(players,pos){var p=(players||[]).find(function(x){return parseInt(x.position)===parseInt(pos);});return p?p.player_name:'Player '+(parseInt(pos)+1);}

  /* ── Rounds preview helper ─────────────────────────────────────────── */
  function updateRoundsPreview(){
      var qpr    = parseInt($('#aqs-ch-qpr').val())  || 5;
      var rounds = parseInt($('#aqs-ch-rounds').val())|| 1;
      var n      = parseInt($('#aqs-ch-players').val())|| 2;
      var isLeague = $('#aqs-ch-league-toggle').is(':checked');
      /* In league mode, rounds are always (players-1) — recalculate to reflect locked value */
      if(isLeague) rounds = Math.max(1, n - 1);
      var perPlayer  = qpr * rounds;
      var totalQuest = isLeague ? (qpr * n * rounds) : (perPlayer * n);
      /* League mode shares a single question pool so the even-number rule doesn't apply */
      var valid = perPlayer >= 5 && (isLeague || (perPlayer % 2 === 0));
      var modeLabel = isLeague
          ? ' &nbsp;<span style="color:#a5b4fc">&#9876; League mode — '+rounds+' elimination round'+(rounds>1?'s':'')+', '+n+' players</span>'
          : ( valid ? '' : ' &nbsp;<span style="color:#f87171">&#9888; Questions per player must be even and ≥ 5</span>' );
      $('#aqs-ch-rounds-preview').html(
          '&#128202; <strong>'+n+'</strong> players &times; '+
          '<strong>'+perPlayer+'</strong> questions each = '+
          '<strong>'+totalQuest+'</strong> total questions to generate &nbsp;|&nbsp; '+
          '<strong>'+rounds+'</strong> round'+(rounds>1?'s':'')+', <strong>'+qpr+'</strong> questions per round'+
          modeLabel
      );
      $('#aqs-ch-create-btn').prop('disabled', !valid);
  }

  /* ══════════════════════════════════════════════════════════════════
     HOME SCREEN
  ══════════════════════════════════════════════════════════════════ */
  function initHomeScreen(){
      function switchTab(t){
          $('.aqs-ch-tab-btn').removeClass('active');$('[data-tab="'+t+'"]').addClass('active');
          $('.aqs-ch-tab-pane').hide();$('#aqs-ch-pane-'+t).show();
      }
      $('#aqs-ch-tab-join,#aqs-ch-tab-host').on('click',function(){
          switchTab($(this).data('tab'));
      });
      /* touchend fallback for iOS Safari — prevents 300 ms ghost-click delay */
      $('#aqs-ch-tab-join,#aqs-ch-tab-host').on('touchend',function(e){
          e.preventDefault();
          switchTab($(this).data('tab'));
      });
      /* Rounds preview live update */
      $('#aqs-ch-qpr,#aqs-ch-rounds,#aqs-ch-players').on('change',updateRoundsPreview);
      updateRoundsPreview();

      /* JOIN */
      /* Build character picker on home screen — JOIN pane */
      if(window.AQS_AVATARS){
          var $picker=$('#aqs-ch-char-picker-home');
          if($picker.length){
              var savedChar=localStorage.getItem('aqs_ch_char')||'koda';
              $picker.html(window.AQS_AVATARS.buildPickerHTML(savedChar));
              $picker.on('click','.aqs-av-card',function(){
                  var id=$(this).data('avId');
                  $picker.find('.aqs-av-card').removeClass('av-selected');
                  $(this).addClass('av-selected');
                  localStorage.setItem('aqs_ch_char',id);
              });
          }
          /* Build character picker — HOST pane (separate localStorage key) */
          var $hpicker=$('#aqs-ch-char-picker-host');
          if($hpicker.length){
              var savedHostChar=localStorage.getItem('aqs_ch_char_host')||localStorage.getItem('aqs_ch_char')||'koda';
              $hpicker.html(window.AQS_AVATARS.buildPickerHTML(savedHostChar));
              $hpicker.on('click','.aqs-av-card',function(){
                  var id=$(this).data('avId');
                  $hpicker.find('.aqs-av-card').removeClass('av-selected');
                  $(this).addClass('av-selected');
                  localStorage.setItem('aqs_ch_char_host',id);
              });
          }
      }
      $('#aqs-ch-join-btn').on('click',function(){
          var code=$('#aqs-ch-join-code').val().trim().toUpperCase();
          var name=$('#aqs-ch-join-name').val().trim();
          if(!code){flash('Enter the 6-character challenge code.');return;}
          if(!name){flash('Enter your name to join.');return;}
          var $b=$(this); btnLoading($b,'Joining…');
          var joinChar=localStorage.getItem('aqs_ch_char')||'koda';
          $.post(AQS.ajax_url,{action:'aqs_ch_join',nonce:AQS.public_nonce,code:code,player_name:name,character_id:joinChar},function(res){
              btnRestore($b,'Join Challenge ⚡');
              if(!res.success){flash(res.data||'Failed.');return;}
              var d=res.data;
              CH.code=code;CH.playerToken=d.player_token;CH.position=parseInt(d.position);
              CH.isHost=(d.is_host==1||d.is_host===true);CH.playerName=d.player_name;
              CH.numPlayers=parseInt(d.num_players)||2;CH.title=d.title||code;CH.hostName=d.host_name||'Host';
              CH.numRounds=parseInt(d.num_rounds)||1;CH.qpr=parseInt(d.questions_per_round)||5;
              CH.numQuestions=CH.qpr*CH.numRounds;CH.timePerQ=parseInt(d.time_per_question)||30;
              CH.myCharId=localStorage.getItem('aqs_ch_char_'+CH.code)||localStorage.getItem('aqs_ch_char')||'koda';
              setUrlCode(code);saveSession();
              if(d.joined_mid_game){
                  flash('Game already in progress — jumping you in!','success');
                  CH.lastPhase='waiting'; /* poll will transition to game screen */
                  startPolling();
              } else {
                  initWaitingRoom();
              }
          }).fail(function(){btnRestore($b,'Join Challenge ⚡');flash('Network error.');});
      });

      /* HOST — delegate to initHostPane() */
      initHostPane();
  }

  /* ══════════════════════════════════════════════════════════════════
     WAITING ROOM
  ══════════════════════════════════════════════════════════════════ */
  function initWaitingRoom(){
      showScreen('aqs-ch-screen-waiting');
      $('#aqs-ch-topbar-code').text(CH.code).show();
      $('#aqs-ch-lobby-title').text(CH.title||('Challenge: '+CH.code));
      $('#aqs-ch-lobby-host').html('Hosted by <strong>'+esc(CH.hostName)+'</strong> &nbsp;&#8226;&nbsp; '+CH.numPlayers+' players &nbsp;&#8226;&nbsp; '+CH.numRounds+' round'+(CH.numRounds>1?'s':'')+' &times; '+CH.qpr+' questions each');
      var inviteUrl=challengeUrl(CH.code);
      $('#aqs-ch-code-value').text(CH.code);
      $('#aqs-ch-invite-link-input').val(inviteUrl);
      /* Copy button */
      $(document).off('click','#aqs-ch-copy-link').on('click','#aqs-ch-copy-link',function(){
          var url=challengeUrl(CH.code);
          var $btn=$(this);
          function fallback(){
              var ta=document.createElement('textarea');ta.value=url;
              document.body.appendChild(ta);ta.select();
              try{document.execCommand('copy');}catch(e){}
              document.body.removeChild(ta);
              $btn.text('✓ Copied!');setTimeout(function(){$btn.text('📋 Copy');},2000);
          }
          if(navigator.clipboard){
              navigator.clipboard.writeText(url).then(function(){
                  $btn.text('✓ Copied!');setTimeout(function(){$btn.text('📋 Copy');},2000);
              }).catch(fallback);
          } else { fallback(); }
          flash('Invite link copied!','success');
      });
      if(CH.isHost){
          $('#aqs-ch-start-btn').show().off('click').on('click',function(){
              var $b=$(this);btnLoading($b,'Starting…');
              $.post(AQS.ajax_url,{action:'aqs_ch_start',nonce:AQS.nonce,code:CH.code},function(res){
                  if(!res.success){btnRestore($b,'▶ Start Challenge');flash(res.data||'Error');}
                  /* On success the poll loop will detect phase='active' and transition the screen */
                  else{ showLobbyCountdown(5, function(){ $b.text('✓ Started!'); }, CH._lastPlayers||[]);  }
              }).fail(function(){btnRestore($b,'▶ Start Challenge');});
          });

          /* ── Edit Settings panel (host only) ── */
          $('#aqs-ch-host-controls').show();
          /* Pre-fill inputs with current values */
          $('#aqs-ch-edit-title').val(CH.title||'');
          $('#aqs-ch-edit-time').val(CH.timePerQ||30);

          /* Toggle form open/closed */
          $(document).off('click','#aqs-ch-toggle-settings-btn').on('click','#aqs-ch-toggle-settings-btn',function(){
              var $form=$('#aqs-ch-edit-settings');
              if($form.is(':visible')){
                  $form.slideUp(200);
              } else {
                  /* Refresh inputs with latest values before expanding */
                  $('#aqs-ch-edit-title').val(CH.title||'');
                  $('#aqs-ch-edit-time').val(CH.timePerQ||30);
                  $form.slideDown(200);
              }
          });

          /* Cancel button */
          $(document).off('click','#aqs-ch-cancel-settings-btn').on('click','#aqs-ch-cancel-settings-btn',function(){
              $('#aqs-ch-edit-settings').slideUp(200);
          });

          /* Save button */
          $(document).off('click','#aqs-ch-save-settings-btn').on('click','#aqs-ch-save-settings-btn',function(){
              var newTitle=$('#aqs-ch-edit-title').val().trim();
              var newTime=parseInt($('#aqs-ch-edit-time').val())||30;
              if(!newTitle){ flash('Title cannot be empty.'); return; }
              var $b=$(this); btnLoading($b,'Saving…');
              $.post(AQS.ajax_url,{
                  action:'aqs_ch_update_settings',
                  nonce:AQS.nonce,
                  code:CH.code,
                  player_token:CH.playerToken,
                  title:newTitle,
                  time_per_question:newTime
              },function(res){
                  btnRestore($b,'💾 Save Settings');
                  if(!res.success){ flash(res.data||'Error saving settings.'); return; }
                  /* Update local state */
                  CH.title=res.data.title;
                  CH.timePerQ=res.data.time_per_question;
                  saveSession();
                  /* Refresh displayed title */
                  $('#aqs-ch-lobby-title').text(CH.title);
                  $('#aqs-ch-edit-settings').slideUp(200);
                  flash('Settings updated! All players will see the new title and timer.','success');
              }).fail(function(){btnRestore($b,'💾 Save Settings');flash('Network error.');});
          });

      } else {
          $('#aqs-ch-start-btn').hide();
          $('#aqs-ch-host-controls').hide();
      }
      startPolling();
  }

  function renderLobbyPlayers(players,n){
      CH._lastPlayers = players.slice(); /* cache for hype screen */
      var $g=$('#aqs-ch-players-grid').empty();
      for(var p=0;p<n;p++){
          var pl=players.find(function(x){return parseInt(x.position)===p;});
          if(pl){
              var isH=parseInt(pl.is_host)===1;
              $g.append('<div class="aqs-ch-player-slot filled'+(isH?' is-host':'')+'">'+avatar(pl.player_name,44,pl.character_id,pl.position)+'<div class="aqs-ch-player-name">'+esc(pl.player_name)+'</div><div class="aqs-ch-player-badge">'+(isH?'👑 Host':'Player '+(p+1))+'</div></div>');
          } else {
              $g.append('<div class="aqs-ch-player-slot empty"><div class="aqs-ch-player-avatar" style="background:rgba(255,255,255,.06);width:44px;height:44px;border-radius:50%;margin:0 auto;display:flex;align-items:center;justify-content:center;font-size:1.2rem">⏳</div><div class="aqs-ch-player-name" style="color:#475569">Waiting…</div></div>');
          }
      }
      var joined=players.length,need=n-joined;
      $('#aqs-ch-lobby-wait').html('<span class="aqs-ch-waiting-dot"></span>'+joined+'/'+n+' joined'+(need>0?' — need '+need+' more':'  ✓ Ready!'));
      if(CH.isHost) $('#aqs-ch-start-btn').prop('disabled',joined<2).text(joined>=2?'▶ Start Challenge':'▶ Need '+(2-joined)+' more player'+(joined<1?'s':''));
  }

  /* ══════════════════════════════════════════════════════════════════
     POLLING
  ══════════════════════════════════════════════════════════════════ */
  function startPolling(){ if(CH.pollTimer)clearInterval(CH.pollTimer); doPoll(); CH.pollTimer=setInterval(doPoll,1500); }
  function stopPolling(){ if(CH.pollTimer){clearInterval(CH.pollTimer);CH.pollTimer=null;} }

    /* ── Hype screen countdown before game begins ─────────────────────── */
    function showLobbyCountdown(secs, onDone, players){
        var existing=document.getElementById('aqs-ch-lobby-cd');
        if(existing) existing.remove();

        var overlay=document.createElement('div');
        overlay.id='aqs-ch-lobby-cd';
        overlay.className='aqs-hype-overlay';
        document.body.appendChild(overlay);

        /* Build hype screen with characters if AQS_AVATARS is loaded */
        var knownPlayers=players||CH._lastPlayers||[];
        if(window.AQS_AVATARS && knownPlayers.length){
            overlay.innerHTML=window.AQS_AVATARS.buildHypeScreen(knownPlayers, secs);
            /* Staggered idle + immediate dance burst */
            setTimeout(function(){ window.AQS_AVATARS.triggerHypeDance(overlay); }, 300);
        } else {
            overlay.innerHTML='<div class="aqs-hype-wrap"><div class="aqs-hype-title">⚡ Get Ready!</div><div id="aqs-hype-num" class="aqs-hype-num">'+secs+'</div><div class="aqs-hype-hint">Challenge is starting…</div></div>';
        }

        var left=secs;
        var $num=$('#aqs-hype-num',overlay);

        function tick(){
            /* Update countdown number with pulse */
            $num.text(left<=0?'GO!':left);
            $num.removeClass('aqs-hype-pulse').off('animationend');
            void overlay.offsetWidth; /* reflow to restart animation */
            $num.addClass('aqs-hype-pulse');

            if(left<=0){
                /* GO! — one more dance burst then exit */
                if(window.AQS_AVATARS) window.AQS_AVATARS.triggerHypeDance(overlay);
                overlay.classList.add('aqs-hype-go');
                setTimeout(function(){
                    overlay.remove();
                    if(typeof onDone==='function') onDone();
                }, 700);
            } else {
                left--;
                setTimeout(tick,1000);
            }
        }
        tick();
    }

  function doPoll(){
      $.get(AQS.ajax_url,{action:'aqs_ch_poll',nonce:AQS.public_nonce,code:CH.code},function(res){
          if(!res.success) return;
          var d=res.data;
          /* Sync server clock offset */
          if(d.server_time) CH.serverOffset=(d.server_time*1000)-Date.now();
          CH.numPlayers=parseInt(d.num_players)||CH.numPlayers;
          CH.numRounds=parseInt(d.num_rounds)||CH.numRounds;
          CH.qpr=parseInt(d.questions_per_round)||CH.qpr;
          CH.numQuestions=parseInt(d.num_questions)||CH.numQuestions;
          CH.timePerQ=parseInt(d.time_per_question)||CH.timePerQ;
          CH.title=d.title||CH.title; CH.hostName=d.host_name||CH.hostName;
          updateChat(d.chat||[]);

          if(d.status==='waiting'){
              if(CH.lastPhase==='finished'||CH.resultsShown){
                  /* Host triggered Play Again — all players go back to lobby */
                  CH.resultsShown=false; CH.lastPhase='';
                  $('#aqs-ch-play-again').remove();
                  showScreen('aqs-ch-screen-waiting'); initWaitingRoom();
              }
              CH.lastPhase='waiting'; renderLobbyPlayers(d.players||[],CH.numPlayers); return;
          }
          if(d.status==='finished'||d.phase==='finished'||d.phase==='tiebreaker_finished'){
              stopPolling(); pauseMusic(); showResults(d); return;
          }
          if(d.phase==='tiebreaker'||d.phase==='tb_reveal'){
              if(CH.lastPhase==='waiting'||CH.lastPhase===''){showScreen('aqs-ch-screen-game');initGameLayout(d);}
              renderTiebreaker(d); CH.lastPhase=d.phase; return;
          }
          if(d.phase==='league_elimination'){
              if(CH.lastPhase!=='league_elimination'){
                  stopCountdown();
                  $('#aqs-ch-reveal').remove();
                  showLeagueEliminationOverlay(d);
              }
              CH.lastPhase=d.phase;
              return;
          }
          if(d.phase==='active'||d.phase==='reveal'){
              if(CH.lastPhase==='waiting'||CH.lastPhase===''){showScreen('aqs-ch-screen-game');initGameLayout(d);}
              /* Coming back from league elimination — remove overlay and reset answered */
              if(CH.lastPhase==='league_elimination'){
                  $('#aqs-ch-league-elim').remove();
                  CH.answered=false;
              }
              renderGameState(d);
          }
          CH.lastPhase=d.phase;
      });
  }

  /* ══════════════════════════════════════════════════════════════════
     GAME SCREEN
  ══════════════════════════════════════════════════════════════════ */
  function initGameLayout(d){
      CH.lastRound=-1;CH.lastAttemptIdx=-1;CH.lastActivePos=-1;CH.answered=false;
      buildScoreboard(d);buildRoundDots(d.total_rounds||0);
      initChatInput();
      /* Start music */
      initMusic(); setTimeout(playMusic,800);
      /* Music toggle button */
      $('#aqs-ch-music-btn').off('click').on('click',toggleMusic);
  }

  function renderGameState(d){
      /* Init voice on first game state render */
      if(!_voiceInitDone){ _voiceInitDone=true; initVoiceChat(); }
      /* Poll for incoming voice chunks from other players */
      pollVoice();
      /* Resolve current question from per-player assignment if not already set.
         IMPORTANT: use primary_pos (whose round it is), NOT CH.position (local player).
         This ensures ALL players (not just the host) see the correct question. */
      if(!d.question && d.player_questions){
          var _primaryPos = d.primary_pos !== undefined ? d.primary_pos : 0;
          var _qList = d.player_questions[_primaryPos] || d.player_questions[String(_primaryPos)] || null;
          if(_qList){
              var qIdx=(parseInt(d.q_in_round)||1)-1+((parseInt(d.round)||1)-1)*(parseInt(d.questions_per_round)||CH.qpr);
              d.question = Array.isArray(_qList)
                  ? (_qList[qIdx] || null)
                  : (_qList[String(qIdx)] || _qList[qIdx] || null);
          }
      }
      /* Firebase RTDB converts JS arrays to objects ({0:..,1:..}) — normalize back */
      if(d.question && d.question.options && !Array.isArray(d.question.options)){
          d.question.options = Object.values(d.question.options);
      }
      var newRound=parseInt(d.round);
      var newAttemptIdx=parseInt(d.attempt_idx)||0;
      var newActivePos=parseInt(d.active_pos)||0;
      if(newRound!==CH.lastRound || newAttemptIdx!==CH.lastAttemptIdx || newActivePos!==CH.lastActivePos){
          CH.lastRound=newRound; CH.lastAttemptIdx=newAttemptIdx; CH.lastActivePos=newActivePos;
          CH.answered=(newActivePos!==CH.position); /* only reset answered for the NEW active player */
          CH.selectedAnswerIdx=-1;
          if(d.phase==='active') renderQuestion(d);
      }
      renderPlayerStatusBar(d);
      if(d.phase==='reveal') showRevealOverlay(d);
      else $('#aqs-ch-reveal').remove();
      updateScoreboard(d);
      updateRoundDots(parseInt(d.round),d.total_rounds);
      updateRoundBadge(d);
  }

  function updateRoundBadge(d){
      var rn=parseInt(d.current_round_num)||1;
      var qi=parseInt(d.q_in_round)||1;
      var qpr=parseInt(d.questions_per_round)||CH.qpr;
      var nr=parseInt(d.num_rounds)||CH.numRounds;
      $('#aqs-ch-round-badge-top').text('Round '+rn+' of '+nr+'  •  Q '+qi+' of '+qpr);
  }


  /* ── Per-question player status bar ──────────────────────────────────── */
  function renderPlayerStatusBar(d) {
      var players      = d.players || [];
      var answersThisQ = d.answers_this_q || {};
      var activePos    = parseInt(d.active_pos) || 0;
      var isSteal      = !!(d.steal_mode);
      var html = '<div class="aqs-ch-status-bar">';
      players.forEach(function(p) {
          var pos    = p.position;
          var ans    = answersThisQ[pos] || answersThisQ[String(pos)];
          var cls, icon, label;
          if (ans) {
              if (ans.answer_idx === -1) {
                  cls = 'st-missed';  icon = '⏰'; label = 'Timed out';
              } else if (ans.is_steal) {
                  cls = ans.is_correct ? 'st-steal-hit' : 'st-steal-miss';
                  icon = ans.is_correct ? '⚡' : '⚡';
                  label = ans.is_correct ? 'Stole! +' + (ans.pts || 3) + 'pts' : 'Missed steal';
              } else if (ans.is_correct) {
                  cls = 'st-correct'; icon = '✅'; label = '+' + (ans.pts || 10) + 'pts';
              } else {
                  cls = 'st-wrong';   icon = '❌'; label = 'Wrong';
              }
          } else if (pos === activePos) {
              cls = isSteal ? 'st-stealing' : 'st-answering';
              icon = isSteal ? '⚡' : '⏳';
              label = isSteal ? 'Stealing…' : 'Answering…';
          } else {
              cls = 'st-waiting'; icon = '·'; label = 'Waiting';
          }
          var isMe = (pos === CH.position);
          var name = esc(p.player_name.length > 11 ? p.player_name.slice(0,10) + '…' : p.player_name);
          html += '<div class="aqs-ch-status-pill ' + cls + (isMe ? ' st-me' : '') + '">';
          html += '<span class="st-icon">' + icon + '</span>';
          html += '<span class="st-name">' + name + '</span>';
          html += '<span class="st-label">' + label + '</span>';
          html += '</div>';
      });
      html += '</div>';
      var $bar = $('#aqs-ch-status-bar');
      if ($bar.length) {
          $bar.html(html);
      } else {
          $('#aqs-ch-question-area').append('<div id="aqs-ch-status-bar"></div>');
          $('#aqs-ch-status-bar').html(html);
      }
  }

  function renderQuestion(d){
      var q=d.question; if(!q) return;
      CH.currentQuestion=q;  /* store for feedback in submitAnswer */
      var myTurn=(parseInt(d.active_pos)===CH.position);
      var isPrimary=(parseInt(d.primary_pos)===CH.position);
      var activeName=getPlayerName(d.players,d.active_pos);
      var primaryName=getPlayerName(d.players,d.primary_pos);
      var ai=parseInt(d.attempt_idx)||0;
      var isSteal=!!(d.steal_mode);

      var html='<div class="aqs-ch-q-header">';
      html+='<span class="aqs-ch-q-round-badge" id="aqs-ch-q-round-badge">Q '+(parseInt(d.q_in_round)||1)+' / '+CH.qpr+'</span>';
      html+='<div class="aqs-ch-q-whose">'+(isSteal?'⚡ Steal! <strong>'+esc(activeName)+'</strong> — answer for <strong>+3 pts</strong>':'<strong>'+esc(primaryName)+'</strong>\'s turn')+'</div>';
      html+='<div id="aqs-ch-timer-wrap" class="aqs-ch-timer"><div class="aqs-ch-timer-ring"><svg viewBox="0 0 44 44" width="44" height="44"><circle class="track" cx="22" cy="22" r="18" stroke-dasharray="113"/><circle class="fill" cx="22" cy="22" r="18" id="aqs-ch-timer-circle" stroke-dasharray="113" stroke-dashoffset="0"/></svg><div class="aqs-ch-timer-val" id="aqs-ch-timer-val">'+CH.timePerQ+'</div></div></div>';
      html+='</div>';
      html+='<p class="aqs-ch-question-text">'+chRenderMath(q.question)+'</p>';
      var letters=['A','B','C','D'];
      html+='<div class="aqs-ch-options">';
      (q.options||[]).forEach(function(opt,i){
          html+='<button class="aqs-ch-option" data-idx="'+i+'"'+(myTurn&&!CH.answered?'':' disabled')+'>';
          html+='<span class="aqs-ch-option-letter">'+letters[i]+'</span>';
          html+='<span class="aqs-ch-option-ripple"></span>';
          html+=chRenderMath(opt)+'</button>';
      });
      html+='</div>';
      if(!myTurn){
          html+='<div class="aqs-ch-spectator-note">👀 Watching <strong>'+esc(activeName)+'</strong>…</div>';
      } else {
          if(isSteal) html+='<div class="aqs-ch-steal-note">⚡ Steal opportunity! +3 bonus points if correct!</div>';
          html+='<div class="aqs-ch-confirm-hint" style="margin-top:8px;color:rgba(255,255,255,.55);font-size:.83rem;text-align:center;">Tap an answer to submit instantly — timer auto-submits at 0</div>';
      }
      $('#aqs-ch-question-area').html(html);
      renderPlayerStatusBar(d);

      /* Start server-synced timer */
      var qStart=(d.question_started_at||d.question_start||0);
      startSyncedCountdown(CH.timePerQ, qStart);

      /* Click = instant submit — no confirm step */
      $('#aqs-ch-question-area').off('click','.aqs-ch-option').on('click','.aqs-ch-option',function(){
          if(CH.answered||!myTurn) return;
          CH.selectedAnswerIdx=parseInt($(this).data('idx'));
          $('.aqs-ch-option').removeClass('selected');
          $(this).addClass('selected');
          submitAnswer(CH.selectedAnswerIdx);
      });
      /* ── Skill bar: show for active player ── */
      if(window.AQS_SKILLS){
          AQS_SKILLS.resetPerQuestion();
          if(myTurn) AQS_SKILLS.initSkillBar(CH.myCharId||'blaze');
          else AQS_SKILLS.hideBar();
      }
  }

  /* ── Submit a confirmed (or auto-submitted) answer ─────────────────── */
  function submitAnswer(idx){
      CH.answered=true;
      stopCountdown(); /* stop timer the moment an answer is locked in — no waiting for timer to expire */
      $('.aqs-ch-option').prop('disabled',true);
      $('.aqs-ch-option[data-idx="'+idx+'"]').addClass('selected');

            /* Read skill state before consuming */
      var _skillBoost  = window.AQS_SKILLS ? AQS_SKILLS.consumeBoost()       : 1;
      var _skillShield = window.AQS_SKILLS ? AQS_SKILLS.consumeShield()      : false;
      var _skillD2     = window.AQS_SKILLS ? AQS_SKILLS.consumeDoubleSteal() : false;
      $.post(AQS.ajax_url,{action:'aqs_ch_answer',nonce:AQS.public_nonce,
          code:CH.code,player_token:CH.playerToken,answer_idx:idx,
          skill_boost:_skillBoost,skill_shield:(_skillShield?1:0),skill_d2steal:(_skillD2?1:0)},function(res){
          if(!res.success){ flash(res.data||'Error'); CH.answered=false; return; }
          var q=CH.currentQuestion||{};
          /* Use the AI-set correct_answer_index as source of truth, fall back to server */
          var aiCorrectIdx = (q.correct_answer_index !== undefined && q.correct_answer_index !== null && q.correct_answer_index >= 0)
              ? parseInt(q.correct_answer_index) : -1;
          var serverCorrectIdx = (res.data.correct_idx !== undefined && res.data.correct_idx >= 0)
              ? parseInt(res.data.correct_idx) : -1;
          var correctIdx = aiCorrectIdx >= 0 ? aiCorrectIdx : serverCorrectIdx;
          /* Determine correctness from the highlighted answer (AI source of truth) */
          var correct = (idx >= 0 && correctIdx >= 0 && idx === correctIdx) || !!(res.data.is_correct);
          var explanation=q.explanation||'';
          var correctText=(q.options&&correctIdx>=0)?chRenderMath(q.options[correctIdx]):'';

          /* Highlight correct option in green */
          if(correctIdx>=0) $('.aqs-ch-option[data-idx="'+correctIdx+'"]').addClass('correct');

          /* ── Instant visual feedback — highlight options only, character speaks in reveal ── */
          $('.aqs-ch-wait-msg').remove();
          var _myCharId = CH.myCharId || localStorage.getItem('aqs_ch_char') || 'blaze';
          if(correct){
              playCorrect();
              if(window.AQS_AVATARS) AQS_AVATARS.triggerDance(CH.position);
              $('.aqs-ch-option[data-idx="'+idx+'"]').addClass('correct');
              var _boostLabel=(_skillBoost&&_skillBoost>1)?' <span style="color:#FFD700;font-weight:900">🔥 '+_skillBoost+'× SKILL BOOST!</span>':'';
              var fbHtml='<div class="aqs-ch-feedback correct">';
              fbHtml+='<strong>✅ Correct!</strong>'+_boostLabel;
              if(explanation) fbHtml+='<div class="aqs-fb-expl">💡 '+chRenderMath(explanation)+'</div>';
              fbHtml+='</div>';
              $('#aqs-ch-question-area').append(fbHtml);
          } else {
              playWrong();
              $('.aqs-ch-option[data-idx="'+idx+'"]').addClass('wrong');
              var _shieldLabel=(_skillShield)?' <span style="color:#4ade80;font-weight:900">💫 SHIELD: +3pts!</span>':'';
              var fbHtml='<div class="aqs-ch-feedback wrong">';
              fbHtml+='<strong>❌ Wrong!</strong>'+_shieldLabel;
              if(correctText) fbHtml+=' Correct answer: <strong>'+correctText+'</strong>';
              if(explanation) fbHtml+='<div class="aqs-fb-expl">💡 '+chRenderMath(explanation)+'</div>';
              fbHtml+='</div>';
              $('#aqs-ch-question-area').append(fbHtml);
          }

          /* Auto-advance — poll for next state after a short read window (no need to wait for timer) */
          setTimeout(function(){ doPoll(); }, 2200);
      }).fail(function(){ CH.answered=false; flash('Network error.'); });
  }

  /* ── Server-synced countdown ─────────────────────────────────────── */
  function startSyncedCountdown(totalSecs, serverStart){
      stopCountdown();
      var circumference=113;
      var _autoSubmitted=false;
      function tick(){
          var now=Date.now()+CH.serverOffset;
          var elapsed=Math.max(0,(now - serverStart*1000)/1000);
          var _extra=(window.CH&&CH._extraTimeSecs)||0;
          var left=Math.max(0, Math.round(totalSecs+_extra-elapsed));
          var pct=left/totalSecs;
          var offset=circumference*(1-pct);
          $('#aqs-ch-timer-circle').attr('stroke-dashoffset',offset);
          $('#aqs-ch-timer-val').text(left);
          if(left<=5) {$('#aqs-ch-timer-val').css('color','#ef4444'); if(left>0) playTick();}
          else $('#aqs-ch-timer-val').css('color','');
          if(left<=0){
              stopCountdown();
              /* Auto-submit when timer expires — submit pending selection OR send timeout
                 (-1) so the server scores 0 and moves on without waiting for this player.
                 CH.answered is pre-set to true for spectators so they never fire here. */
              if(!CH.answered && !_autoSubmitted){
                  _autoSubmitted=true;
                  submitAnswer(CH.selectedAnswerIdx >= 0 ? CH.selectedAnswerIdx : -1);
              }
          }
      }
      CH.countdownTimer=setInterval(tick,1000); tick();
  }
  function stopCountdown(){ if(CH.countdownTimer){clearInterval(CH.countdownTimer);CH.countdownTimer=null;} }

  /* ── Tiebreaker ──────────────────────────────────────────────────── */
  function renderTiebreaker(d){
      if(d.phase==='tb_reveal'){ showRevealOverlay(d); return; }
      $('#aqs-ch-reveal').remove();
      var tb=d.tb_players||[];
      var tbNames=tb.map(function(pos){return getPlayerName(d.players,pos);}).join(' vs ');
      var q=d.question; if(!q) return;
      /* Normalize Firebase RTDB object-array back to a real array */
      if(q.options && !Array.isArray(q.options)) q.options = Object.values(q.options);
      var myTurn=(parseInt(d.active_pos)===CH.position);
      var myInTb=tb.indexOf(CH.position)>-1;
      var activeName=getPlayerName(d.players,d.active_pos);

      var html='<div class="aqs-ch-q-header">';
      html+='<span class="aqs-ch-q-round-badge" style="background:rgba(239,68,68,.3);border-color:rgba(239,68,68,.5);color:#fca5a5">⚡ SUDDEN DEATH</span>';
      html+='<div class="aqs-ch-q-whose"><strong>'+esc(tbNames)+'</strong> — tied!</div>';
      html+='<div id="aqs-ch-timer-wrap" class="aqs-ch-timer"><div class="aqs-ch-timer-ring"><svg viewBox="0 0 44 44" width="44" height="44"><circle class="track" cx="22" cy="22" r="18" stroke-dasharray="113"/><circle class="fill" cx="22" cy="22" r="18" id="aqs-ch-timer-circle" stroke-dasharray="113" stroke-dashoffset="0"/></svg><div class="aqs-ch-timer-val" id="aqs-ch-timer-val">'+CH.timePerQ+'</div></div></div>';
      html+='</div>';
      html+='<p class="aqs-ch-question-text">'+chRenderMath(q.question)+'</p>';
      var letters=['A','B','C','D'];
      html+='<div class="aqs-ch-options">';
      (q.options||[]).forEach(function(opt,i){
          html+='<button class="aqs-ch-option" data-idx="'+i+'"'+(myTurn&&!CH.answered?'':' disabled')+'>';
          html+='<span class="aqs-ch-option-letter">'+letters[i]+'</span>';
          html+='<span class="aqs-ch-option-ripple"></span>';
          html+=chRenderMath(opt)+'</button>';
      });
      html+='</div>';
      if(!myInTb){
          html+='<div class="aqs-ch-spectator-note">👀 Watching tiebreaker…</div>';
      } else if(!myTurn){
          html+='<div class="aqs-ch-steal-note">⏳ Wait for your tiebreaker turn…</div>';
      } else {
          html+='<div class="aqs-ch-steal-note" style="border-color:rgba(239,68,68,.5);background:rgba(239,68,68,.1);color:#fca5a5">⚡ It\'s your turn! Answer first to win!</div>';
          html+='<div class="aqs-ch-confirm-hint" style="margin-top:8px;color:rgba(255,255,255,.55);font-size:.83rem;text-align:center;">Tap an answer to submit instantly</div>';
      }
      $('#aqs-ch-question-area').html(html);
      startSyncedCountdown(CH.timePerQ,d.question_started_at||d.question_start||0);

      /* Instant submit on click — no confirm step */
      $('#aqs-ch-question-area').off('click','.aqs-ch-option').on('click','.aqs-ch-option',function(){
          if(CH.answered||!myTurn) return;
          CH.selectedAnswerIdx=parseInt($(this).data('idx'));
          $('.aqs-ch-option').removeClass('selected');
          $(this).addClass('selected');
          submitAnswer(CH.selectedAnswerIdx);
      });
      updateScoreboard(d); updateRoundDots(parseInt(d.round),d.total_rounds);
  }

  /* ── Reveal overlay ──────────────────────────────────────────────── */
  function showRevealOverlay(d){
      stopCountdown(); /* sync: stop timer for all players when reveal shows */
      if($('#aqs-ch-reveal').length) return;
      var lr=d.last_result; if(!lr) return;
      var skipped=lr.skipped;
      var winPos=parseInt(lr.winner_pos);
      var winName=getPlayerName(d.players,winPos);
      var pts=parseInt(lr.pts)||0;
      var isTb=lr.is_tiebreaker;
      playReveal();
      var correctIdx=parseInt(lr.correct_idx);
      $('.aqs-ch-option').prop('disabled',true).each(function(){
          if(parseInt($(this).data('idx'))===correctIdx) $(this).addClass('correct');
          else if($(this).hasClass('selected')) $(this).addClass('wrong');
      });
      /* Trigger winner's character dance in scoreboard */
      if(lr && lr.winner_pos >= 0 && window.AQS_AVATARS) AQS_AVATARS.triggerDance(lr.winner_pos);

      /* ── Character moment — only the ANSWERING player's character appears ──
         Correct: celebrity shine + character speaks (audio only, no text shown)
         Wrong:   dull/grey + motivational speech (audio only)
         This shows on ALL players' screens simultaneously via the reveal phase. ── */
      if(!skipped && window.AQS_AVATARS && AQS_AVATARS.showCharacterMoment && CH._playerChars){
          var ansPos  = parseInt(lr.player_pos);   /* the player who answered */
          var winP    = parseInt(lr.winner_pos);
          var ansCorrect = (!skipped && winP === ansPos && ansPos >= 0);
          var ansCharId  = CH._playerChars[ansPos] || 'blaze';
          AQS_AVATARS.showCharacterMoment(ansCharId, ansCorrect, pts);
      }

      var icon=skipped?'😔':(winPos===CH.position?'🎉':'👏');
      var title=skipped?'⏰ No answer!':(winPos===CH.position?(isTb?'You win the tiebreaker! 🔥':'Correct! 🔥'):'Correct!');
      var winnerTxt=skipped?'':(winName+(isTb?' wins!':(pts>0?' +'+pts+' pts':'')));

      /* ── Build per-question leaderboard ── */
      var scores=d.scores||{};
      /* Sort players by current score descending */
      var sorted=(d.players||[]).slice().sort(function(a,b){
          return (scores[b.position]||0)-(scores[a.position]||0);
      });
      /* Compute new ranks (0-based) */
      var newRanks={};
      sorted.forEach(function(p,i){ newRanks[p.position]=i; });
      var MEDALS=['🥇','🥈','🥉'];
      var lbHtml='<div class="aqs-ch-reveal-lb">';
      lbHtml+='<div class="aqs-ch-reveal-lb-title">📊 Live Standings</div>';
      sorted.forEach(function(p,rank){
          var pos=p.position;
          var score=scores[pos]||0;
          var prev=CH.prevScores[pos]||0;
          var delta=score-prev;
          var prevRank= (CH.prevRanks[pos]!==undefined) ? CH.prevRanks[pos] : rank;
          var rankChange=prevRank-rank; /* positive = moved up, negative = moved down */
          var isMe=(pos===CH.position);
          var gained=(delta>0);

          var rowCls='aqs-ch-reveal-lb-row'+(isMe?' lb-me':'')+(gained?' lb-gainer':'');
          var medal=rank<3?MEDALS[rank]:'<span style="color:var(--ch-muted);font-size:.78rem;">'+(rank+1)+'</span>';
          var arrow=rankChange>0
              ?'<span class="aqs-ch-reveal-lb-arrow arr-up">▲</span>'
              :(rankChange<0
                  ?'<span class="aqs-ch-reveal-lb-arrow arr-down">▼</span>'
                  :'<span class="aqs-ch-reveal-lb-arrow arr-same">—</span>');
          var deltaHtml=delta>0
              ?'<span class="aqs-ch-reveal-lb-delta delta-pos">+'+delta+'</span>'
              :'<span class="aqs-ch-reveal-lb-delta delta-zero">+0</span>';
          var nameStr=esc(p.player_name.length>14?p.player_name.substring(0,13)+'…':p.player_name);
          lbHtml+='<div class="'+rowCls+'">';
          lbHtml+='<div class="aqs-ch-reveal-lb-medal">'+medal+'</div>';
          lbHtml+='<div class="aqs-ch-reveal-lb-name">'+nameStr+(isMe?' <span style="opacity:.5;font-size:.7rem;">(you)</span>':'')+'</div>';
          lbHtml+=deltaHtml;
          lbHtml+='<div class="aqs-ch-reveal-lb-score">'+score+'</div>';
          lbHtml+=arrow;
          lbHtml+='</div>';
      });
      lbHtml+='</div>';

      var html='<div id="aqs-ch-reveal" class="aqs-ch-reveal"><div class="aqs-ch-reveal-card">';
      html+='<div class="aqs-ch-reveal-icon">'+icon+'</div>';
      html+='<div class="aqs-ch-reveal-title">'+esc(title)+'</div>';
      if(!skipped) html+='<div class="aqs-ch-reveal-pts">+'+pts+' points</div>';
      html+='<div class="aqs-ch-reveal-winner">'+esc(winnerTxt)+'</div>';
      if(lr.explanation) html+='<div class="aqs-ch-reveal-explanation"><strong>💡 Explanation:</strong> '+chRenderMath(lr.explanation)+'</div>';
      html+=lbHtml;
      html+='</div></div>';
      $('body').append(html);

      /* Save scores & ranks for the next question's delta calculation */
      CH.prevScores=$.extend({},scores);
      CH.prevRanks=$.extend({},newRanks);

      setTimeout(function(){$('#aqs-ch-reveal').remove();CH.answered=false;},5800);
  }

  /* ── League elimination overlay ──────────────────────────────────── */
  function showLeagueEliminationOverlay(d){
      $('#aqs-ch-league-elim').remove();
      CH.answered = true; /* prevent any pending auto-submit during overlay */

      var elimPos  = parseInt(d.league_eliminated_pos);
      var elimName = d.league_eliminated_name || 'Player';
      var elimChar = d.league_eliminated_char  || 'koda';
      var activePlayers = d.league_active_players
          ? (Array.isArray(d.league_active_players)
              ? d.league_active_players
              : Object.values(d.league_active_players).map(Number))
          : [];
      var isMe     = (elimPos === CH.position);
      var hasNext  = activePlayers.length > 1;

      /* Speak an elimination message for the eliminated character */
      var msgs = [
          elimName+'! Keep pushing — every champion faces setbacks!',
          elimName+'! You gave it your all. Come back stronger!',
          elimName+'! This isn\'t the end — it\'s just the beginning!',
          elimName+'! A setback is just a setup for a comeback!',
          elimName+'! The path to greatness is paved with lessons like this!'
      ];
      var msg = msgs[Math.floor(Math.random() * msgs.length)];
      if(window.AQS_AVATARS && AQS_AVATARS.showCharacterMoment){
          AQS_AVATARS.showCharacterMoment(elimChar, false, 0);
      }
      if(window.speechSynthesis){
          try{
              window.speechSynthesis.cancel();
              var utt = new SpeechSynthesisUtterance(msg);
              utt.rate = 0.92; utt.pitch = 1;
              window.speechSynthesis.speak(utt);
          }catch(e){}
      }

      /* Avatar HTML — use existing avatar() helper or a fallback emoji */
      var avatarHtml = (window.AQS_AVATARS && AQS_AVATARS.getCharacterEmoji)
          ? ('<span style="font-size:4rem">' + AQS_AVATARS.getCharacterEmoji(elimChar) + '</span>')
          : avatar(elimName, 80, elimChar, elimPos);

      /* Scores snapshot for context */
      var scores  = d.scores || {};
      var players = d.players || [];
      var sorted  = players.slice().sort(function(a,b){return (scores[b.position]||0)-(scores[a.position]||0);});

      var lbHtml = '';
      sorted.forEach(function(p, rank){
          var pos    = parseInt(p.position);
          var sc     = scores[pos] || 0;
          var isElim = (pos === elimPos);
          var medal  = ['🥇','🥈','🥉'][rank] || (rank+1);
          lbHtml += '<div style="display:flex;align-items:center;gap:10px;padding:7px 0;'+(isElim?'opacity:.4;text-decoration:line-through;':'')+'">';
          lbHtml += '<div style="width:26px;text-align:center;font-size:.9rem">'+medal+'</div>';
          lbHtml += avatar(p.player_name, 24, p.character_id, pos);
          lbHtml += '<div style="flex:1;font-size:.85rem;color:#e2e8f0">'+esc(p.player_name)+(isElim?' <span style="color:#f87171;font-size:.7rem">eliminated</span>':'')+'</div>';
          lbHtml += '<div style="font-weight:800;color:#f59e0b;font-size:.9rem">'+sc+'</div>';
          lbHtml += '</div>';
      });

      var cdText = hasNext ? '<div style="font-size:.8rem;color:#64748b;margin-bottom:6px">Next round begins in</div><div id="aqs-ch-elim-cd" style="font-size:3.2rem;font-weight:900;color:#a5b4fc;line-height:1">5</div>' : '<div style="font-size:1rem;color:#f59e0b;font-weight:700;margin-top:8px">🏆 Revealing the winner…</div>';

      var html = '<div id="aqs-ch-league-elim" style="position:fixed;inset:0;z-index:9998;background:rgba(5,5,20,.97);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;overflow-y:auto;">';
      html += '<div style="max-width:420px;width:100%">';
      html += '<div style="margin-bottom:16px;filter:grayscale(0.7)">'+avatarHtml+'</div>';
      html += '<div style="font-size:.95rem;font-weight:900;letter-spacing:.18em;color:#f87171;margin-bottom:6px;">ELIMINATED</div>';
      html += '<div style="font-size:1.8rem;font-weight:900;color:#e2e8f0;margin-bottom:6px">'+esc(elimName)+'</div>';
      if(isMe) html += '<div style="font-size:1rem;color:#fca5a5;margin-bottom:14px">😔 Better luck next time!</div>';
      else      html += '<div style="font-size:.9rem;color:#94a3b8;margin-bottom:14px">'+esc(msg)+'</div>';
      html += '<div style="background:rgba(255,255,255,.04);border-radius:12px;padding:14px 16px;margin-bottom:20px;text-align:left">'+lbHtml+'</div>';
      html += cdText;
      html += '</div></div>';

      $('body').append(html);

      /* Countdown to next round — or auto-dismiss on final elimination */
      if(hasNext){
          var countdown = 5;
          var cdTimer = setInterval(function(){
              countdown--;
              var $cd = $('#aqs-ch-elim-cd');
              if(countdown <= 0){
                  clearInterval(cdTimer);
                  $cd.text('GO!').css('color','#86efac');
                  /* Don't force-remove here — let the backend phase change trigger removal
                     (phase: league_elimination → active). Overlay will be removed by poller. */
              } else {
                  $cd.text(countdown);
              }
          }, 1000);
      } else {
          /* Last player was eliminated — game ending in ~7 s (server-side timer).
             Auto-dismiss the overlay after 8 s so the winner screen can show through. */
          setTimeout(function(){
              $('#aqs-ch-league-elim').remove();
          }, 8000);
      }
  }

  /* ── Scoreboard ──────────────────────────────────────────────────── */
  function buildScoreboard(d){
      /* Cache char IDs for speech system */
      CH._playerChars = {};
      (d.players||[]).forEach(function(p){ CH._playerChars[parseInt(p.position)] = p.character_id||'koda'; });
      var $sb=$('#aqs-ch-scoreboard').empty();
      (d.players||[]).forEach(function(p){
          var pos=parseInt(p.position);
          $sb.append('<div class="aqs-ch-score-player" id="aqs-ch-sp-'+pos+'">'+
              '<div class="aqs-ch-score-rank" id="aqs-ch-rank-'+pos+'">'+( pos+1 )+'</div>'+
              avatar(p.player_name,28,p.character_id,parseInt(p.position))+
              '<div class="aqs-ch-score-name" title="'+esc(p.player_name)+'">'+esc(p.player_name.length>12?p.player_name.substring(0,11)+'…':p.player_name)+'</div>'+
              '<div class="aqs-ch-score-pts" id="aqs-ch-pts-'+pos+'">0</div></div>');
      });
  }
  function updateScoreboard(d){
      var scores=d.scores||{};
      var ap=parseInt(d.active_pos);var pp=parseInt(d.primary_pos);
      $('.aqs-ch-score-player').removeClass('active-turn primary-turn');
      Object.keys(scores).forEach(function(pos){
          $('#aqs-ch-pts-'+pos).text(scores[pos]);
          var row=$('#aqs-ch-sp-'+pos);
          if(parseInt(pos)===ap) row.addClass('active-turn');
          if(parseInt(pos)===pp) row.addClass('primary-turn');
      });
      var sorted=Object.keys(scores).sort(function(a,b){return scores[b]-scores[a];});
      sorted.forEach(function(pos,i){
          var $r=$('#aqs-ch-rank-'+pos);
          $r.text(i+1).removeClass('rank-1 rank-2 rank-3');
          if(i===0)$r.addClass('rank-1'); else if(i===1)$r.addClass('rank-2'); else if(i===2)$r.addClass('rank-3');
      });
  }
  function buildRoundDots(total){
      var $d=$('#aqs-ch-round-dots').empty();
      for(var i=0;i<Math.min(total,48);i++) $d.append('<div class="aqs-ch-round-dot" id="aqs-ch-dot-'+i+'"></div>');
  }
  function updateRoundDots(current,total){
      for(var i=0;i<Math.min(total,48);i++){
          $('#aqs-ch-dot-'+i).removeClass('done current');
          if(i<current)$('#aqs-ch-dot-'+i).addClass('done');
          else if(i===current)$('#aqs-ch-dot-'+i).addClass('current');
      }
  }

  /* ── Chat ────────────────────────────────────────────────────────── */
  function initChatInput(){
      $('#aqs-ch-chat-send').off('click').on('click',sendChat);
      $('#aqs-ch-chat-input').off('keydown').on('keydown',function(e){if(e.key==='Enter')sendChat();});
  }
  function sendChat(){
      var msg=$('#aqs-ch-chat-input').val().trim();
      if(!msg||!CH.playerToken) return;
      $('#aqs-ch-chat-input').val('');
      $.post(AQS.ajax_url,{action:'aqs_ch_chat',nonce:AQS.public_nonce,code:CH.code,player_token:CH.playerToken,message:msg});
  }
  function updateChat(msgs){
      var $msgs=$('#aqs-ch-chat-msgs'); if(!$msgs.length) return;
      if(msgs.length===CH.chatSeenCount) return;
      var newMsgs=msgs.slice(CH.chatSeenCount); CH.chatSeenCount=msgs.length;
      newMsgs.forEach(function(m){ $msgs.append('<div class="aqs-ch-chat-msg"><span class="aqs-ch-chat-msg-name">'+esc(m.name)+':</span> '+esc(m.msg)+'</div>'); });
      $msgs.scrollTop($msgs[0]?$msgs[0].scrollHeight:0);
  }

  /* ══════════════════════════════════════════════════════════════════
     SESSION PERSISTENCE (reconnect on refresh)
  ══════════════════════════════════════════════════════════════════ */
  var AQS_SESSION_KEY = 'aqs_ch_session';

  function saveSession(){
      try {
          localStorage.setItem(AQS_SESSION_KEY, JSON.stringify({
              code:        CH.code,
              playerToken: CH.playerToken,
              position:    CH.position,
              isHost:      CH.isHost,
              playerName:  CH.playerName,
              numPlayers:  CH.numPlayers,
              numRounds:   CH.numRounds,
              qpr:         CH.qpr,
              numQuestions:CH.numQuestions,
              timePerQ:    CH.timePerQ,
              title:       CH.title,
              hostName:    CH.hostName
          }));
      } catch(e){}
  }

  function clearSession(){
      if(window.AQS_SKILLS) AQS_SKILLS.resetForGame(CH.myCharId||'blaze');
      try { localStorage.removeItem(AQS_SESSION_KEY); } catch(e){}
      CH.resultsShown = false;
  }

  function loadSession(){
      try {
          var raw = localStorage.getItem(AQS_SESSION_KEY);
          return raw ? JSON.parse(raw) : null;
      } catch(e){ return null; }
  }

  /* Restore CH state from a saved session object */
  function restoreSession(s){
      CH.code        = s.code;
      CH.playerToken = s.playerToken;
      CH.position    = parseInt(s.position);
      CH.isHost      = !!s.isHost;
      CH.playerName  = s.playerName;
      CH.numPlayers  = parseInt(s.numPlayers) || 2;
      CH.numRounds   = parseInt(s.numRounds)  || 1;
      CH.qpr         = parseInt(s.qpr)        || 5;
      CH.numQuestions= parseInt(s.numQuestions)|| 5;
      CH.timePerQ    = parseInt(s.timePerQ)   || 30;
      CH.title       = s.title  || s.code;
      CH.hostName    = s.hostName || 'Host';
  }

  /*
   * Called on page boot — checks for a saved session and asks the user
   * whether they want to rejoin. Never auto-enters; the user must click
   * the Rejoin button. This prevents a stale session from hijacking the
   * Create Challenge flow when the host wants to start a new game.
   */
  function tryReconnect(onFail){
      var s = loadSession();
      if(!s || !s.code || !s.playerToken){ onFail(); return; }

      /* Show a slim "checking" banner while we poll the server */
      var $banner = $('<div id="aqs-ch-reconnect-banner" style="'+
          'position:fixed;top:0;left:0;right:0;z-index:99998;'+
          'background:rgba(15,15,30,.97);border-bottom:1px solid rgba(99,102,241,.35);'+
          'color:#fff;text-align:center;padding:12px 16px;font-size:.86rem;'+
          'font-weight:600;box-shadow:0 4px 24px rgba(0,0,0,.5);'+
          'display:flex;align-items:center;justify-content:center;gap:12px">'+
          '<div class="aqs-ch-spinner" style="width:15px;height:15px;border-width:2px;flex-shrink:0"></div>'+
          '<span style="color:#94a3b8">Checking previous session for <strong style="color:#a5b4fc">'+s.code+'</strong>…</span>'+
          '</div>');
      $('body').prepend($banner);

      /* Poll the server to check current challenge status */
      $.get(AQS.ajax_url, {action:'aqs_ch_poll', nonce:AQS.public_nonce, code:s.code}, function(res){
          $banner.remove();

          /* Challenge is finished or gone — clear stale session and go home */
          if(!res.success || res.data.status==='finished'){
              clearSession();
              /* Also strip stale code from URL */
              window.history.replaceState({}, '', window.location.pathname);
              onFail();
              return;
          }

          /* Challenge is still alive — ask the user what they want to do */
          var d = res.data;
          var statusLabel = d.status==='waiting' ? 'still in the lobby' : 'in progress';

          var $prompt = $('<div id="aqs-ch-rejoin-prompt" style="'+
              'position:fixed;inset:0;z-index:99999;background:rgba(10,10,24,.93);'+
              'display:flex;align-items:center;justify-content:center;padding:20px">'+
              '<div style="background:#12121f;border:1px solid rgba(99,102,241,.4);'+
              'border-radius:20px;padding:30px 24px;max-width:400px;width:100%;'+
              'text-align:center;box-shadow:0 24px 64px rgba(0,0,0,.75)">'+
              '<div style="font-size:2.6rem;margin-bottom:12px">🎮</div>'+
              '<h3 style="color:#a5b4fc;margin:0 0 8px;font-size:1.1rem;font-weight:800">Active Challenge Found</h3>'+
              '<p style="color:#64748b;font-size:.84rem;margin:0 0 4px">Challenge '+
              '<strong style="color:#94a3b8;font-family:monospace;letter-spacing:.1em">'+s.code+'</strong>'+
              ' is '+statusLabel+'.</p>'+
              '<p style="color:#64748b;font-size:.82rem;margin:0 0 22px">Welcome back, '+
              '<strong style="color:#c4b5fd">'+esc(s.playerName||'Player')+'</strong>! '+
              'Tap below to continue or start fresh.</p>'+
              '<div style="display:flex;flex-direction:column;gap:10px">'+
              '<button id="aqs-ch-rejoin-btn" class="aqs-ch-btn aqs-ch-btn-primary aqs-ch-btn-full" style="padding:13px 20px;font-size:.95rem">'+
              '⚡ Rejoin Challenge</button>'+
              '<button id="aqs-ch-rejoin-cancel" class="aqs-ch-btn aqs-ch-btn-ghost aqs-ch-btn-full" style="padding:11px 20px;font-size:.88rem">'+
              '✕ Leave & Start Fresh</button>'+
              '</div></div></div>');
          $('body').append($prompt);

          /* ── Rejoin ── */
          $('#aqs-ch-rejoin-btn').on('click', function(){
              $prompt.remove();
              restoreSession(s);
              setUrlCode(s.code);

              CH.numPlayers  = parseInt(d.num_players)        || CH.numPlayers;
              CH.numRounds   = parseInt(d.num_rounds)         || CH.numRounds;
              CH.qpr         = parseInt(d.questions_per_round)|| CH.qpr;
              CH.numQuestions= parseInt(d.num_questions)      || CH.numQuestions;
              CH.timePerQ    = parseInt(d.time_per_question)  || CH.timePerQ;
              CH.title       = d.title    || CH.title;
              CH.hostName    = d.host_name|| CH.hostName;

              flash('Welcome back, <strong>'+esc(CH.playerName)+'</strong>! Reconnected to challenge <strong>'+CH.code+'</strong>.','success');

              if(d.status==='waiting'){
                  CH.lastPhase='waiting';
                  initWaitingRoom();
              } else if(d.phase==='active'||d.phase==='reveal'||d.phase==='tiebreaker'||d.phase==='tb_reveal'){
                  showScreen('aqs-ch-screen-game');
                  initGameLayout(d);
                  if(d.phase==='tiebreaker'||d.phase==='tb_reveal') renderTiebreaker(d);
                  else renderGameState(d);
                  CH.lastPhase=d.phase;
                  startPolling();
              } else {
                  initWaitingRoom();
              }
          });

          /* ── Leave & go to home screen ── */
          $('#aqs-ch-rejoin-cancel').on('click', function(){
              $prompt.remove();
              clearSession();
              window.history.replaceState({}, '', window.location.pathname);
              onFail();
          });

      }).fail(function(){
          $banner.remove();
          clearSession();
          onFail();
      });
  }

  /* ══════════════════════════════════════════════════════════════════
     RESULTS
  ══════════════════════════════════════════════════════════════════ */
  function showResults(d){
      if(CH.resultsShown) return;
      CH.resultsShown = true;
      /* Always clear any lingering league elimination overlay before showing results */
      $('#aqs-ch-league-elim').remove();
      clearSession();
      showScreen('aqs-ch-screen-results');
      playCelebrate();
      var players=d.players||[];var scores=d.scores||{};
      var ranked=players.slice().sort(function(a,b){return (scores[b.position]||0)-(scores[a.position]||0);});
      ranked.forEach(function(p,i){p._rank=i+1;p._score=scores[p.position]||0;});
      var winner=ranked[0];
      /* Fill winner header */
      $('#aqs-ch-win-name').text(winner?winner.player_name:'');
      $('#aqs-ch-win-score').text(winner?winner._score+' points':'');
      buildPodium(ranked);

      /* ── Full-screen winner character celebration (BOOYAH!) ─────────── */
      if(window.AQS_AVATARS && AQS_AVATARS.showWinnerCelebration){
          AQS_AVATARS.showWinnerCelebration(winner, ranked, scores, function(){
              /* After celebration dismisses, show curtain confetti too */
              launchCelebration();
          });
      } else {
          setTimeout(function(){ launchCelebration(); }, 400);
      }

      /* ── Per-character result portraits ──────────────────────────────── */
      if(window.AQS_AVATARS && AQS_AVATARS.buildResultsReaction){
          var $reactTarget = $('#aqs-ch-win-score');
          if($reactTarget.length){
              /* Remove any previous portraits */
              $reactTarget.next('.aqs-results-chars').remove();
              var reactHtml = AQS_AVATARS.buildResultsReaction(ranked, scores);
              $reactTarget.after(reactHtml);
              /* Trigger winner dance burst after a short delay */
              setTimeout(function(){
                  if(ranked[0]) AQS_AVATARS.triggerDance(parseInt(ranked[0].position));
              }, 800);
          }
      }

      var $tb=$('#aqs-ch-results-table tbody').empty();
      ranked.forEach(function(p,i){
          var medal=['🥇','🥈','🥉'][i]||(i+1);
          $tb.append('<tr><td>'+medal+'</td><td style="display:flex;align-items:center;gap:8px;padding:12px">'+avatar(p.player_name,28,p.character_id,parseInt(p.position))+esc(p.player_name)+(parseInt(p.is_host)?'<sup style="color:#f59e0b;font-size:.7rem"> HOST</sup>':'')+'</td><td style="text-align:center;font-weight:800;color:#f59e0b">'+p._score+'</td><td style="text-align:center;color:#94a3b8">'+(d.total_rounds||0)+'</td></tr>');
      });
      if(CH.playerName){
          var myData=ranked.find(function(p){return p.player_name===CH.playerName;});
          if(myData) buildCertificate(myData,d,ranked.length);
      }
      $('#aqs-ch-print-cert').off('click').on('click',function(){window.print();});
      $('#aqs-ch-print-all').off('click').on('click',function(){window.print();});
      /* Play Again (host only) */
      if(CH.isHost){
          var $pa=$('<button id="aqs-ch-play-again" class="aqs-ch-btn aqs-ch-btn-primary" style="margin:24px auto 0;display:block;min-width:220px;font-size:1.05rem;padding:14px 28px">🔁 Play Again</button>');
          $('#aqs-ch-screen-results').append($pa);
          $pa.off('click').on('click',function(){
              var $b=$(this); $b.prop('disabled',true).text('Restarting…');
              $.post(AQS.ajax_url,{action:'aqs_ch_play_again',nonce:AQS.public_nonce,code:CH.code,player_token:CH.playerToken},function(res){
                  if(!res.success){$b.prop('disabled',false).text('🔁 Play Again');flash(res.data||'Failed.');return;}
                  CH.resultsShown=false;
                  $pa.remove();
                  showScreen('aqs-ch-screen-waiting');
                  initWaitingRoom();
              }).fail(function(){$b.prop('disabled',false).text('🔁 Play Again');flash('Network error.');});
          });
      }
      /* Per-player question analysis — appended below the certificate */
      buildQuestionAnalysis(d, players, ranked);
  }

  /*
   * buildQuestionAnalysis — renders a tabbed per-player breakdown of every
   * question that was played, who answered it, and the explanation.
   * Uses d.results (array of round outcomes) + d.question_log (round→q text).
   */
  function buildQuestionAnalysis(d, players, ranked){
      var results  = d.results      || [];
      var qlog     = d.question_log || {};
      var n        = parseInt(d.num_players) || players.length;
      /* Remove any previous analysis block */
      $('#aqs-ch-q-analysis').remove();
      if(!results.length || !Object.keys(qlog).length) return;

      var letters  = ['A','B','C','D'];

      /* Outer card */
      var $wrap = $('<div id="aqs-ch-q-analysis" class="aqs-ch-card" style="margin-top:16px">');
      $wrap.append('<p class="aqs-ch-card-title" style="margin:0 0 16px">📊 Question-by-Question Analysis</p>');

      /* Player tabs */
      var $tabs  = $('<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px">');
      var $panes = $('<div>');

      players.forEach(function(p, idx){
          var pos      = parseInt(p.position);
          var isFirst  = (idx === 0);

          /* Tab button */
          var $tab = $('<button type="button" style="'+
              'display:flex;align-items:center;gap:6px;padding:7px 13px;'+
              'border-radius:8px;font-size:.8rem;font-weight:700;cursor:pointer;font-family:inherit;'+
              'transition:all .15s;border:1px solid rgba(255,255,255,.13);'+
              (isFirst
                  ? 'background:rgba(99,102,241,.25);border-color:rgba(99,102,241,.5);color:#a5b4fc'
                  : 'background:transparent;color:#64748b')+
              '" data-pos="'+pos+'">'+
              avatar(p.player_name, 18)+
              '<span>'+esc(p.player_name)+'</span>'+
              '</button>');
          $tabs.append($tab);

          /* Pane — questions assigned to this player (rounds where round % n === pos) */
          var playerResults = results.filter(function(r){
              return (parseInt(r.round) % n) === pos;
          });

          var $pane = $('<div class="aqs-ch-analysis-pane" data-pos="'+pos+'"'+(isFirst?'':' style="display:none"')+'>');

          if(!playerResults.length){
              $pane.append('<p style="color:#64748b;font-size:.85rem;padding:8px 0">No questions recorded for this player.</p>');
          } else {
              playerResults.forEach(function(r, qi){
                  var rnd         = parseInt(r.round);
                  var qdata       = qlog[rnd] || qlog[String(rnd)];
                  var winnerPos   = parseInt(r.winner_pos);
                  var correctIdx  = parseInt(r.correct_ans);
                  var explanation = r.explanation || '';
                  var skipped     = !!r.skipped;
                  var pts         = parseInt(r.pts) || 0;

                  /* Who got it? */
                  var winnerName = '';
                  if(!skipped && winnerPos >= 0){
                      var wp = players.find(function(x){ return parseInt(x.position)===winnerPos; });
                      winnerName = wp ? wp.player_name : 'Player '+(winnerPos+1);
                  }

                  /* Status badge */
                  var $status;
                  if(skipped){
                      $status = $('<span style="color:#64748b">😔 No one answered</span>');
                  } else if(winnerPos === pos){
                      $status = $('<span style="color:#86efac">✅ '+esc(winnerName)+' answered correctly <em style="color:#4ade80;font-style:normal">(+'+pts+' pts)</em></span>');
                  } else {
                      $status = $('<span style="color:#93c5fd">🔄 Stolen by '+esc(winnerName)+' <em style="color:#60a5fa;font-style:normal">(+'+pts+' pts)</em></span>');
                  }

                  var $q = $('<div style="border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:12px 14px;margin-bottom:10px;background:rgba(255,255,255,.02)">');

                  /* Question text */
                  var qText = qdata ? chRenderMath(qdata.question) : '<em style="color:#475569">Question text unavailable</em>';
                  $q.append('<div style="font-size:.83rem;font-weight:700;color:#e2e8f0;margin-bottom:9px;line-height:1.55">Q'+(qi+1)+'. '+qText+'</div>');

                  /* Options grid */
                  if(qdata && qdata.options){
                      var $opts = $('<div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:9px">');
                      qdata.options.forEach(function(opt, oi){
                          var isCorrect = (oi === correctIdx);
                          $opts.append(
                              '<div style="padding:5px 8px;border-radius:7px;font-size:.75rem;'+
                              (isCorrect
                                  ? 'background:rgba(16,185,129,.14);color:#86efac;border:1px solid rgba(16,185,129,.3);font-weight:700'
                                  : 'background:rgba(255,255,255,.04);color:#64748b;border:1px solid rgba(255,255,255,.07)')+
                              '">'+letters[oi]+'. '+chRenderMath(opt)+'</div>'
                          );
                      });
                      $q.append($opts);
                  }

                  /* Status line */
                  $q.append($('<div style="font-size:.8rem;margin-bottom:4px">').append($status));

                  /* Explanation */
                  if(explanation){
                      $q.append('<div style="font-size:.76rem;color:#94a3b8;margin-top:7px;padding:6px 10px;'+
                          'background:rgba(99,102,241,.07);border-left:2px solid rgba(99,102,241,.4);border-radius:0 6px 6px 0;line-height:1.55">'+
                          '💡 '+chRenderMath(explanation)+'</div>');
                  }

                  $pane.append($q);
              });
          }

          $panes.append($pane);
      });

      /* Tab switching */
      $tabs.on('click', 'button', function(){
          var pos = $(this).data('pos');
          $tabs.find('button').css({background:'transparent',color:'#64748b','border-color':'rgba(255,255,255,.13)'});
          $(this).css({background:'rgba(99,102,241,.25)',color:'#a5b4fc','border-color':'rgba(99,102,241,.5)'});
          $panes.find('.aqs-ch-analysis-pane').hide();
          $panes.find('.aqs-ch-analysis-pane[data-pos="'+pos+'"]').show();
      });

      $wrap.append($tabs).append($panes);
      $('#aqs-ch-cert-wrap').after($wrap);
  }

  function buildPodium(ranked){
      var $p=$('#aqs-ch-podium').empty();
      var order=ranked.length>=3?[1,0,2]:(ranked.length===2?[1,0]:[0]);
      order.forEach(function(ri){
          var p=ranked[ri]; if(!p) return;
          var h=[80,55,38][ri]||28;
          var sz=ri===0?72:56;
          var avatarHtml=avatar(p.player_name,sz,p.character_id,parseInt(p.position));
          $p.append('<div class="aqs-ch-podium-step rank-'+(ri+1)+'">'+(ri===0?'<div class="aqs-ch-podium-crown">👑</div>':'')+avatarHtml+'<div class="aqs-ch-podium-name">'+esc(p.player_name)+'</div><div class="aqs-ch-podium-pts">'+p._score+' pts</div><div class="aqs-ch-podium-block" style="height:'+h+'px;width:80px;margin:0 auto"></div></div>');
      });
  }
  function buildCertificate(myData,d,totalPlayers){
      var date=new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'});
      var rank=myData._rank;var rs=['st','nd','rd'][rank-1]||'th';
      var html='<div class="aqs-ch-cert"><div class="aqs-ch-cert-header">Certificate of Achievement</div><div class="aqs-ch-cert-title">AI Quiz Challenge</div><div class="aqs-ch-cert-sub">This certifies that</div><div class="aqs-ch-cert-name">'+esc(myData.player_name)+'</div><div class="aqs-ch-cert-body">participated in the <strong>'+esc(d.title||CH.code)+'</strong> challenge on <strong>'+esc(date)+'</strong>, achieving <strong>'+rank+rs+' place</strong> out of '+totalPlayers+' players.</div><div class="aqs-ch-cert-score">Score: '+myData._score+' points &nbsp;|&nbsp; '+CH.numRounds+' round'+(CH.numRounds>1?'s':'')+', '+CH.qpr+' Q/round</div><div class="aqs-ch-cert-footer">Powered by Darapet Technology AI Quiz System</div></div>';
      $('#aqs-ch-cert-wrap').html(html);
  }
  function launchCelebration(){
      var $cel=$('#aqs-ch-celebration').show();
      setTimeout(function(){$cel.find('.aqs-ch-curtain-left').addClass('open');$cel.find('.aqs-ch-curtain-right').addClass('open');$cel.find('.aqs-ch-winner-center').css('opacity','1');spawnConfetti($cel.find('.aqs-ch-confetti')[0]);},200);
      /* Auto-dismiss after 8 s; user can also close immediately with the ✕ button */
      var _auto=setTimeout(function(){$cel.fadeOut(700,function(){$cel.css('display','none');});},8000);
      $('#aqs-ch-cel-close').off('click').on('click',function(){
          clearTimeout(_auto);
          $cel.fadeOut(350,function(){$cel.css('display','none');});
      });
  }
  function spawnConfetti(el){
      if(!el) return;
      var cols=['#f59e0b','#6366f1','#10b981','#ef4444','#ec4899','#60a5fa','#a78bfa','#fff'];
      for(var i=0;i<90;i++){var c=document.createElement('div');c.className='aqs-conf-p';c.style.cssText='left:'+Math.random()*100+'%;background:'+cols[i%cols.length]+';animation-duration:'+(2+Math.random()*3)+'s;animation-delay:'+Math.random()*1.5+'s;width:'+(5+Math.random()*8)+'px;height:'+(5+Math.random()*8)+'px;border-radius:'+(Math.random()>.5?'50%':'2px');el.appendChild(c);}
  }

  /* ══════════════════════════════════════════════════════════════════
     HOST PANE — 3-SOURCE QUESTION GENERATION
  ══════════════════════════════════════════════════════════════════ */
  function initHostPane(){
      /* Source tab switching — click + touchend for full mobile support */
      $(document).on('click','.aqs-ch-source-tab',function(){
          switchChSource($(this).data('src'));
      });
      /* touchend handler ensures taps register on iOS Safari even inside
         previously-hidden containers (prevents ghost-click delay issues) */
      $(document).on('touchend','.aqs-ch-source-tab',function(e){
          e.preventDefault();
          switchChSource($(this).data('src'));
      });

      /* File browse & drag-drop — use delegation so they always fire */
      $(document).on('click','#aqs-ch-browse-btn',function(){ $('#aqs-ch-file-input').click(); });
      $(document).on('change','#aqs-ch-file-input',function(){ if(this.files[0]) setChFile(this.files[0]); });
      $(document).on('click','#aqs-ch-remove-file',clearChFile);
      var dz=document.getElementById('aqs-ch-upload-zone');
      if(dz){
          dz.addEventListener('dragover',function(e){ e.preventDefault(); dz.style.borderColor='rgba(99,102,241,.8)'; });
          dz.addEventListener('dragleave',function(){ dz.style.borderColor='rgba(99,102,241,.4)'; });
          dz.addEventListener('drop',function(e){
              e.preventDefault(); dz.style.borderColor='rgba(99,102,241,.4)';
              if(e.dataTransfer.files[0]) setChFile(e.dataTransfer.files[0]);
          });
      }

      /* Action buttons — use delegation so they fire regardless of display state */
      $(document).on('click','#aqs-ch-generate-btn',chGenerateFromTopic);
      $(document).on('click','#aqs-ch-parse-btn',chParseFile);
      $(document).on('click','#aqs-ch-gen-from-doc-btn',chGenerateFromDoc);
      $(document).on('click','#aqs-ch-gen-from-paste-btn',chGenerateFromPaste);
      $(document).on('click','#aqs-ch-gen-from-readdoc-btn',chGenerateFromReadDoc);
      $(document).on('click','#aqs-ch-manual-start-btn',chAddManualQuestion);
      $(document).on('click','#aqs-ch-retry-btn',function(){ if(_chRetryFn) _chRetryFn(); });

      /* Read Document tab — browse, drop, remove */
      $(document).on('click','#aqs-ch-readdoc-browse-btn',function(){ $('#aqs-ch-readdoc-file-input').click(); });
      $(document).on('change','#aqs-ch-readdoc-file-input',function(){
          if(this.files[0]) setChReadDocFile(this.files[0]);
      });
      $(document).on('click','#aqs-ch-readdoc-remove-file',clearChReadDocFile);
      var rdz=document.getElementById('aqs-ch-readdoc-upload-zone');
      if(rdz){
          rdz.addEventListener('dragover',function(e){ e.preventDefault(); rdz.style.borderColor='rgba(99,102,241,.8)'; });
          rdz.addEventListener('dragleave',function(){ rdz.style.borderColor='rgba(99,102,241,.4)'; });
          rdz.addEventListener('drop',function(e){
              e.preventDefault(); rdz.style.borderColor='rgba(99,102,241,.4)';
              if(e.dataTransfer.files[0]) setChReadDocFile(e.dataTransfer.files[0]);
          });
      }

      /* Live character counter for paste textarea */
      $(document).on('input','#aqs-ch-paste-text',function(){
          $('#aqs-ch-paste-char-count').text($(this).val().length.toLocaleString());
      });

      /* Upload mode card selection */
      $(document).on('click','#aqs-ch-mode-mcq',function(){ selectUploadMode('mcq'); });
      $(document).on('click','#aqs-ch-mode-ai', function(){ selectUploadMode('ai');  });

      /* Add question from review card header */
      $(document).on('click','#aqs-ch-add-q-btn',chAddManualQuestion);

      /* Delete a question from review list */
      $(document).on('click','.aqs-ch-del-q',function(){
          var qi=parseInt($(this).data('qi'));
          chQuestions.splice(qi,1);
          renderChQList();
      });

      /* Move question up */
      $(document).on('click','.aqs-ch-move-up',function(){
          var qi=parseInt($(this).data('qi'));
          if(qi===0) return;
          var tmp=chQuestions[qi-1];
          chQuestions[qi-1]=chQuestions[qi];
          chQuestions[qi]=tmp;
          renderChQList();
          /* keep scroll position roughly in place */
          $('#aqs-ch-q-list').scrollTop(function(_,v){ return v-60; });
      });

      /* Move question down */
      $(document).on('click','.aqs-ch-move-dn',function(){
          var qi=parseInt($(this).data('qi'));
          if(qi>=chQuestions.length-1) return;
          var tmp=chQuestions[qi+1];
          chQuestions[qi+1]=chQuestions[qi];
          chQuestions[qi]=tmp;
          renderChQList();
          $('#aqs-ch-q-list').scrollTop(function(_,v){ return v+60; });
      });

      /* Shuffle all questions randomly */
      $(document).on('click','#aqs-ch-shuffle-btn',function(){
          if(chQuestions.length<2) return;
          for(var i=chQuestions.length-1;i>0;i--){
              var j=Math.floor(Math.random()*(i+1));
              var tmp=chQuestions[i]; chQuestions[i]=chQuestions[j]; chQuestions[j]=tmp;
          }
          renderChQList();
          flash('Questions shuffled into a new random order!','success');
      });

      /* League mode toggle — auto-lock rounds and update info text */
      $(document).on('change','#aqs-ch-league-toggle',function(){
          var isLeague=$(this).is(':checked');
          var players=parseInt($('#aqs-ch-players').val())||2;
          var $roundsRow=$('#aqs-ch-rounds').closest('.aqs-ch-setting-row');
          if(isLeague){
              var leagueRounds=Math.max(1,players-1);
              $('#aqs-ch-rounds').val(leagueRounds).prop('disabled',true);
              $roundsRow.css('opacity','.5');
              $('#aqs-ch-league-info').slideDown(180);
          } else {
              $('#aqs-ch-rounds').prop('disabled',false);
              $roundsRow.css('opacity','1');
              $('#aqs-ch-league-info').slideUp(180);
          }
          updateRoundsPreview();
      });

      /* Recalculate league rounds when players count changes */
      $(document).on('change','#aqs-ch-players',function(){
          if($('#aqs-ch-league-toggle').is(':checked')){
              var players=parseInt($(this).val())||2;
              $('#aqs-ch-rounds').val(Math.max(1,players-1));
              updateRoundsPreview();
          }
      });

      /* Host challenge button */
      $(document).on('click','#aqs-ch-create-btn',chHostChallenge);

      /* Ensure correct initial state for panels and action buttons */
      switchChSource('topic');
  }

  /* ── Source tab switch ───────────────────────────────────────────── */
  function switchChSource(src){
      $('.aqs-ch-source-tab').removeClass('active');
      $('[data-src="'+src+'"].aqs-ch-source-tab').addClass('active');
      $('.aqs-ch-src-panel').hide();
      $('#aqs-ch-src-'+src).show();
      /* Show the correct action button for the active source */
      $('#aqs-ch-generate-btn').toggle(src==='topic');
      $('#aqs-ch-gen-from-paste-btn').toggle(src==='paste');
      $('#aqs-ch-gen-from-readdoc-btn').toggle(src==='readdoc'&&!!_chReadDocFile);
      /* For upload: action buttons depend on which sub-mode card was selected */
      if(src==='upload'){
          $('#aqs-ch-parse-btn').toggle(_chUploadMode==='mcq');
          $('#aqs-ch-gen-from-doc-btn').toggle(_chUploadMode==='ai');
      } else {
          $('#aqs-ch-parse-btn').hide();
          $('#aqs-ch-gen-from-doc-btn').hide();
      }
      $('#aqs-ch-manual-start-btn').toggle(src==='manual');
  }

  /* ── Read Document file helpers ─────────────────────────────────────── */
  var _chReadDocFile = null;
  var _chReadDocText = '';
  function setChReadDocFile(file){
      _chReadDocFile=file; _chReadDocText='';
      $('#aqs-ch-readdoc-file-name').text(file.name);
      $('#aqs-ch-readdoc-upload-zone').hide();
      $('#aqs-ch-readdoc-file-info').show().css('display','flex');
      $('#aqs-ch-gen-from-readdoc-btn').show();
  }
  function clearChReadDocFile(){
      _chReadDocFile=null; _chReadDocText='';
      $('#aqs-ch-readdoc-file-input').val('');
      $('#aqs-ch-readdoc-upload-zone').show();
      $('#aqs-ch-readdoc-file-info').hide();
      $('#aqs-ch-gen-from-readdoc-btn').hide();
  }

  /* ── File helpers ────────────────────────────────────────────────── */
  function setChFile(file){
      _chUploadFile=file;
      _chUploadMode='';
      _chDocText='';
      $('#aqs-ch-file-name').text(file.name);
      $('#aqs-ch-upload-zone').hide();
      $('#aqs-ch-file-info').show().css('display','flex');
      $('#aqs-ch-upload-mode-choice').show();
      $('#aqs-ch-upload-ai-settings').hide();
      $('#aqs-ch-parse-btn').hide();
      $('#aqs-ch-gen-from-doc-btn').hide();
      /* Reset mode card styles */
      $('#aqs-ch-mode-mcq,#aqs-ch-mode-ai').css({
          'border-color':'rgba(255,255,255,.12)',
          'background':'transparent'
      });
  }
  function clearChFile(){
      _chUploadFile=null;
      _chUploadMode='';
      _chDocText='';
      $('#aqs-ch-file-input').val('');
      $('#aqs-ch-upload-zone').show();
      $('#aqs-ch-file-info').hide();
      $('#aqs-ch-upload-mode-choice').hide();
      $('#aqs-ch-upload-ai-settings').hide();
      $('#aqs-ch-parse-btn').hide();
      $('#aqs-ch-gen-from-doc-btn').hide();
  }

  /* ── Upload mode card selection ──────────────────────────────────── */
  function selectUploadMode(mode){
      _chUploadMode=mode;
      /* Highlight selected card */
      $('#aqs-ch-mode-mcq').css({
          'border-color': mode==='mcq' ? 'rgba(99,102,241,.7)' : 'rgba(255,255,255,.12)',
          'background':   mode==='mcq' ? 'rgba(99,102,241,.18)' : 'transparent'
      });
      $('#aqs-ch-mode-ai').css({
          'border-color': mode==='ai' ? 'rgba(99,102,241,.7)' : 'rgba(255,255,255,.12)',
          'background':   mode==='ai' ? 'rgba(99,102,241,.18)' : 'transparent'
      });
      /* Show appropriate settings and action button */
      $('#aqs-ch-upload-ai-settings').toggle(mode==='ai');
      $('#aqs-ch-parse-btn').toggle(mode==='mcq');
      $('#aqs-ch-gen-from-doc-btn').toggle(mode==='ai');
  }

  /* ── Shared helper: prep progress panel for generation ──────────── */
  function chGenStart(retryFn, statusText){
      _chRetryFn = retryFn;
      $('#aqs-ch-retry-btn').hide();
      $('#aqs-ch-gen-spinner').show();
      $('#aqs-ch-gen-progress').show();
      $('#aqs-ch-gen-status').text(statusText || 'Starting…');
      $('#aqs-ch-gen-bar').css('width','0%');
      $('#aqs-ch-gen-count').text(chQuestions.length+' saved');
      /* On mobile, scroll the progress bar into view so the user
         can see that generation has started (button is now hidden) */
      setTimeout(function(){
          var el = document.getElementById('aqs-ch-gen-progress');
          if(el) el.scrollIntoView({behavior:'smooth', block:'nearest'});
      }, 80);
  }
  function chGenDone(totalNeeded, hideSelector){
      chQuestions = chQuestions.slice(0, totalNeeded);
      $('#aqs-ch-gen-status').text('✓ Done! '+chQuestions.length+' questions ready.');
      $('#aqs-ch-gen-bar').css('width','100%');
      $('#aqs-ch-gen-count').text(chQuestions.length+' / '+totalNeeded);
      $('#aqs-ch-retry-btn').hide();
      renderChQList();
      setTimeout(function(){
          $('#aqs-ch-gen-progress').hide();
          if(hideSelector) $(hideSelector).show();
      }, 1500);
  }
  function chGenFail(e){
      $('#aqs-ch-gen-spinner').hide();
      $('#aqs-ch-gen-status').text('⚠ Stopped at '+chQuestions.length+' questions — '+e.message);
      $('#aqs-ch-retry-btn').show();
      renderChQList();
      flash('Paused after error — '+chQuestions.length+' questions saved. Click "↩ Retry & Add More" to continue.');
  }

  /* ── Generate questions from topic (AI) ─────────────────────────── */
  async function chGenerateFromTopic(){
      var topic=$('#aqs-ch-topic').val().trim();
      if(!topic){ flash('Enter a topic first.'); return; }
      var players=parseInt($('#aqs-ch-players').val())||2;
      var qpr=parseInt($('#aqs-ch-qpr').val())||5;
      var isLeague=$('#aqs-ch-league-toggle').is(':checked');
      var rounds=isLeague?Math.max(1,players-1):(parseInt($('#aqs-ch-rounds').val())||1);
      var perPlayer=qpr*rounds;
      if(perPlayer<2){ flash('Need at least 2 questions per player per round.'); return; }
      /* League mode shares questions across all players; standard mode assigns per-player */
      var totalNeeded=isLeague?(qpr*(players-1)+3):(players*perPlayer+3);
      var difficulty=$('#aqs-ch-difficulty').val()||'medium';
      if(chQuestions.length>=totalNeeded){ flash('Already have enough questions!','success'); return; }

      $('#aqs-ch-generate-btn').hide();
      chGenStart(chGenerateFromTopic, 'Connecting to AI…');

      try{
          var BATCH=15;
          while(chQuestions.length<totalNeeded){
              var remaining=totalNeeded-chQuestions.length;
              var batchSize=Math.min(BATCH,remaining);
              var avoid=chQuestions.length>0
                  ? '\n\nAlready generated — do NOT repeat:\n'+chQuestions.map(function(q,i){ return (i+1)+'. '+q.question; }).join('\n')
                  : '';
              var prompt=
                  'You are a quiz question generator. Generate exactly '+batchSize+' multiple-choice questions.\n'+
                  'Topic: '+topic+'\nDifficulty: '+difficulty+avoid+'\n\n'+
                  'Rules:\n'+
                  '- Each question must have exactly 4 answer options.\n'+
                  '- Use LaTeX notation for any math (e.g. $x^2$).\n'+
                  '- "correct_answer_index" must be 0, 1, 2, or 3.\n'+
                  '- "explanation" should be a short, clear sentence.\n\n'+
                  'Return ONLY a valid JSON array. Example:\n'+
                  '[{"question":"What is 2+2?","options":["3","4","5","6"],"correct_answer_index":1,"explanation":"2+2 equals 4."}]';

              var batchNum=Math.floor(chQuestions.length/BATCH)+1;
              var totalBatches=Math.ceil(totalNeeded/BATCH);
              $('#aqs-ch-gen-status').text('Generating batch '+batchNum+' of '+totalBatches+'…');
              $('#aqs-ch-gen-bar').css('width',Math.round(chQuestions.length/totalNeeded*100)+'%');
              $('#aqs-ch-gen-count').text(chQuestions.length+' / '+totalNeeded);

              var text=await chCallAI(prompt);
              var batch=chParseJSON(text);
              if(!batch||!batch.length) throw new Error('AI returned no valid questions. Try rephrasing the topic.');
              chQuestions=chQuestions.concat(batch);
              renderChQList(); /* show questions as each batch arrives */
          }
          chGenDone(totalNeeded,'#aqs-ch-generate-btn');
      } catch(e){
          $('#aqs-ch-generate-btn').show();
          chGenFail(e);
      }
  }

  /* ── Parse questions from uploaded file ─────────────────────────── */
  async function chParseFile(){
      if(!_chUploadFile){ flash('Select a file first.'); return; }
      $('#aqs-ch-parse-btn').prop('disabled',true).text('⏳ Parsing…');
      $('#aqs-ch-gen-progress').show();
      $('#aqs-ch-gen-status').text('Extracting text from file…');
      $('#aqs-ch-gen-bar').css('width','30%');
      $('#aqs-ch-gen-count').text('');
      try{
          var text=await chExtractText(_chUploadFile);
          $('#aqs-ch-gen-status').text('Detecting questions…');
          $('#aqs-ch-gen-bar').css('width','70%');
          var parsed=chParseTextQuestions(text);
          if(!parsed.length) throw new Error('No MCQ questions detected. Ensure your file has numbered questions with A) B) C) D) options.');
          chQuestions=parsed;
          $('#aqs-ch-gen-progress').hide();
          $('#aqs-ch-gen-bar').css('width','100%');
          $('#aqs-ch-parse-btn').prop('disabled',false).text('🔍 Parse Questions from File');
          renderChQList();
          flash(parsed.length+' question'+(parsed.length!==1?'s':'')+' parsed from file!','success');
      } catch(e){
          $('#aqs-ch-gen-progress').hide();
          $('#aqs-ch-parse-btn').prop('disabled',false).text('🔍 Parse Questions from File');
          flash('Parse failed: '+e.message);
      }
  }

  /* ── Generate questions from uploaded notes/document (AI) ───────── */
  async function chGenerateFromDoc(){
      if(!_chUploadFile){ flash('Select a file first.'); return; }
      var players   = parseInt($('#aqs-ch-players').val())  || 2;
      var qpr       = parseInt($('#aqs-ch-qpr').val())      || 5;
      var isLeague  = $('#aqs-ch-league-toggle').is(':checked');
      var rounds    = isLeague ? Math.max(1, players-1) : (parseInt($('#aqs-ch-rounds').val()) || 1);
      var perPlayer = qpr * rounds;
      if(perPlayer < 2){ flash('Need at least 2 questions per player per round.'); return; }
      var totalNeeded = isLeague ? (qpr*(players-1)+3) : (players * perPlayer + 3);
      var subject     = $('#aqs-ch-doc-subject').val().trim() || 'General';
      var difficulty  = $('#aqs-ch-doc-difficulty').val()     || 'medium';
      if(chQuestions.length >= totalNeeded){ flash('Already have enough questions!','success'); return; }

      var $btn = $('#aqs-ch-gen-from-doc-btn');
      $btn.prop('disabled', true).text('⏳ Reading document…');
      chGenStart(chGenerateFromDoc, 'Extracting text from document…');

      try {
          if(!_chDocText) _chDocText = await chExtractText(_chUploadFile);
          var excerpt = _chDocText.substring(0, 8000);

          var BATCH = 15;
          while(chQuestions.length < totalNeeded){
              var remaining  = totalNeeded - chQuestions.length;
              var batchSize  = Math.min(BATCH, remaining);
              var avoidBlock = chQuestions.length > 0
                  ? '\n\nAlready generated — do NOT repeat these:\n' +
                    chQuestions.map(function(q,i){ return (i+1)+'. '+q.question; }).join('\n')
                  : '';
              var prompt =
                  'You are an expert quiz maker. Read the following study notes/text and create exactly '+batchSize+' multiple-choice questions based on the content.\n\n'+
                  'Subject: '+subject+'\nDifficulty: '+difficulty+avoidBlock+'\n\n'+
                  '--- DOCUMENT TEXT (use this as your source) ---\n'+excerpt+'\n--- END OF TEXT ---\n\n'+
                  'Rules:\n'+
                  '- Questions must be based ONLY on the text provided above.\n'+
                  '- Each question must have exactly 4 answer options.\n'+
                  '- Use LaTeX notation for any math expressions (e.g. $x^2$).\n'+
                  '- "correct_answer_index" is 0-based (0=A, 1=B, 2=C, 3=D).\n'+
                  '- "explanation" is a short sentence explaining why the answer is correct.\n\n'+
                  'Return ONLY a valid JSON array with NO markdown or code fences. Example:\n'+
                  '[{"question":"What is ...?","options":["Option A","Option B","Option C","Option D"],"correct_answer_index":1,"explanation":"Because..."}]';

              var batchNum     = Math.floor(chQuestions.length / BATCH) + 1;
              var totalBatches = Math.ceil(totalNeeded / BATCH);
              $('#aqs-ch-gen-status').text('AI generating batch '+batchNum+' of '+totalBatches+'…');
              $('#aqs-ch-gen-bar').css('width', Math.round(chQuestions.length / totalNeeded * 100)+'%');
              $('#aqs-ch-gen-count').text(chQuestions.length+' / '+totalNeeded);

              var aiText = await chCallAI(prompt);
              var batch  = chParseJSON(aiText);
              if(!batch || !batch.length) throw new Error('AI returned no valid questions. Try again.');
              chQuestions = chQuestions.concat(batch);
              renderChQList(); /* show each batch as it arrives */
          }
          $btn.prop('disabled', false).text('🤖 Generate Questions from Notes');
          chGenDone(totalNeeded);
      } catch(e){
          $btn.prop('disabled', false).text('🤖 Generate Questions from Notes');
          chGenFail(e);
      }
  }

  /* ── Generate questions from pasted notes (AI) ──────────────────── */
  async function chGenerateFromPaste(){
      var pasteText = $('#aqs-ch-paste-text').val().trim();
      if(!pasteText){ flash('Please paste some notes text first.'); return; }
      if(pasteText.length < 80){ flash('Notes are too short — paste more content for better results.'); return; }

      var players   = parseInt($('#aqs-ch-players').val())  || 2;
      var qpr       = parseInt($('#aqs-ch-qpr').val())      || 5;
      var isLeague  = $('#aqs-ch-league-toggle').is(':checked');
      var rounds    = isLeague ? Math.max(1, players-1) : (parseInt($('#aqs-ch-rounds').val()) || 1);
      var perPlayer = qpr * rounds;
      if(perPlayer < 2){ flash('Need at least 2 questions per player per round.'); return; }
      var totalNeeded = isLeague ? (qpr*(players-1)+3) : (players * perPlayer + 3);
      var subject    = $('#aqs-ch-paste-subject').val().trim() || 'General';
      var difficulty = $('#aqs-ch-paste-difficulty').val()     || 'medium';
      var excerpt    = pasteText.substring(0, 8000);
      if(chQuestions.length >= totalNeeded){ flash('Already have enough questions!','success'); return; }

      var $btn = $('#aqs-ch-gen-from-paste-btn');
      $btn.prop('disabled', true).text('⏳ Generating…');
      chGenStart(chGenerateFromPaste, 'Sending notes to AI…');

      try {
          var BATCH = 15;
          while(chQuestions.length < totalNeeded){
              var remaining  = totalNeeded - chQuestions.length;
              var batchSize  = Math.min(BATCH, remaining);
              var avoidBlock = chQuestions.length > 0
                  ? '\n\nAlready generated — do NOT repeat these:\n' +
                    chQuestions.map(function(q,i){ return (i+1)+'. '+q.question; }).join('\n')
                  : '';
              var prompt =
                  'You are an expert quiz maker. Read the following notes and create exactly '+batchSize+' multiple-choice questions based on the content.\n\n'+
                  'Subject: '+subject+'\nDifficulty: '+difficulty+avoidBlock+'\n\n'+
                  '--- NOTES (use this as your source) ---\n'+excerpt+'\n--- END OF NOTES ---\n\n'+
                  'Rules:\n'+
                  '- Questions must be based ONLY on the notes provided above.\n'+
                  '- Each question must have exactly 4 answer options.\n'+
                  '- Use LaTeX notation for any math expressions (e.g. $x^2$).\n'+
                  '- "correct_answer_index" is 0-based (0=A, 1=B, 2=C, 3=D).\n'+
                  '- "explanation" is a short sentence explaining why the answer is correct.\n\n'+
                  'Return ONLY a valid JSON array with NO markdown or code fences. Example:\n'+
                  '[{"question":"What is ...?","options":["Option A","Option B","Option C","Option D"],"correct_answer_index":1,"explanation":"Because..."}]';

              var batchNum     = Math.floor(chQuestions.length / BATCH) + 1;
              var totalBatches = Math.ceil(totalNeeded / BATCH);
              $('#aqs-ch-gen-status').text('AI generating batch '+batchNum+' of '+totalBatches+'…');
              $('#aqs-ch-gen-bar').css('width', Math.round(chQuestions.length / totalNeeded * 100)+'%');
              $('#aqs-ch-gen-count').text(chQuestions.length+' / '+totalNeeded);

              var aiText = await chCallAI(prompt);
              var batch  = chParseJSON(aiText);
              if(!batch || !batch.length) throw new Error('AI returned no valid questions. Try again.');
              chQuestions = chQuestions.concat(batch);
              renderChQList(); /* show each batch as it arrives */
          }
          $btn.prop('disabled', false).text('📋 Generate Questions from Pasted Notes');
          chGenDone(totalNeeded);
      } catch(e){
          $btn.prop('disabled', false).text('📋 Generate Questions from Pasted Notes');
          chGenFail(e);
      }
  }

  /* ── Generate questions from standalone "Read Document" tab (AI) ─── */
  async function chGenerateFromReadDoc(){
      if(!_chReadDocFile){ flash('Select a document first.'); return; }
      var players   = parseInt($('#aqs-ch-players').val())        || 2;
      var qpr       = parseInt($('#aqs-ch-qpr').val())            || 5;
      var isLeague  = $('#aqs-ch-league-toggle').is(':checked');
      var rounds    = isLeague ? Math.max(1, players-1) : (parseInt($('#aqs-ch-rounds').val()) || 1);
      var perPlayer = qpr * rounds;
      if(perPlayer < 2){ flash('Need at least 2 questions per player per round.'); return; }
      var totalNeeded = isLeague ? (qpr*(players-1)+3) : (players * perPlayer + 3);
      var subject     = $('#aqs-ch-readdoc-subject').val().trim()    || 'General';
      var difficulty  = $('#aqs-ch-readdoc-difficulty').val()         || 'medium';
      if(chQuestions.length >= totalNeeded){ flash('Already have enough questions!','success'); return; }

      var $btn = $('#aqs-ch-gen-from-readdoc-btn');
      $btn.prop('disabled',true).text('⏳ Reading document…');
      chGenStart(chGenerateFromReadDoc,'Extracting text from document…');

      try{
          if(!_chReadDocText) _chReadDocText = await chExtractText(_chReadDocFile);
          var excerpt = _chReadDocText.substring(0, 8000);

          var BATCH = 15;
          while(chQuestions.length < totalNeeded){
              var remaining  = totalNeeded - chQuestions.length;
              var batchSize  = Math.min(BATCH, remaining);
              var avoidBlock = chQuestions.length > 0
                  ? '\n\nAlready generated — do NOT repeat:\n'+
                    chQuestions.map(function(q,i){ return (i+1)+'. '+q.question; }).join('\n')
                  : '';
              var prompt =
                  'You are an expert quiz maker. Read the following document and create exactly '+batchSize+' multiple-choice questions that test understanding of the content.\n\n'+
                  'Subject: '+subject+'\nDifficulty: '+difficulty+avoidBlock+'\n\n'+
                  '--- DOCUMENT CONTENT ---\n'+excerpt+'\n--- END ---\n\n'+
                  'Rules:\n'+
                  '- Questions must be based ONLY on the document above.\n'+
                  '- Each question must have exactly 4 answer options.\n'+
                  '- Use LaTeX ($x^2$) for any mathematical expressions.\n'+
                  '- "correct_answer_index" is 0-based (0=A, 1=B, 2=C, 3=D).\n'+
                  '- "explanation" briefly explains the correct answer.\n\n'+
                  'Return ONLY a valid JSON array with NO markdown fences:\n'+
                  '[{"question":"...","options":["A","B","C","D"],"correct_answer_index":0,"explanation":"..."}]';

              var batchNum     = Math.floor(chQuestions.length / BATCH) + 1;
              var totalBatches = Math.ceil(totalNeeded / BATCH);
              $('#aqs-ch-gen-status').text('AI generating batch '+batchNum+' of '+totalBatches+'…');
              $('#aqs-ch-gen-bar').css('width', Math.round(chQuestions.length / totalNeeded * 100)+'%');
              $('#aqs-ch-gen-count').text(chQuestions.length+' / '+totalNeeded);

              var aiText = await chCallAI(prompt);
              var batch  = chParseJSON(aiText);
              if(!batch||!batch.length) throw new Error('AI returned no valid questions. Try again.');
              chQuestions = chQuestions.concat(batch);
              renderChQList();
          }
          $btn.prop('disabled',false).text('📖 Generate Questions from Document');
          chGenDone(totalNeeded);
      } catch(e){
          $btn.prop('disabled',false).text('📖 Generate Questions from Document');
          chGenFail(e);
      }
  }

  /* ── Text extraction helpers (PDF.js + Mammoth) ──────────────────── */
  function chExtractText(file){
      var name=file.name.toLowerCase();
      if(name.endsWith('.pdf')) return chExtractPDF(file);
      if(name.endsWith('.docx')||name.endsWith('.doc')) return chExtractDocx(file);
      return Promise.reject(new Error('Unsupported file type. Use PDF or DOCX.'));
  }
  function chExtractPDF(file){
      return new Promise(function(resolve,reject){
          var reader=new FileReader();
          reader.onload=async function(e){
              try{
                  if(typeof pdfjsLib==='undefined') throw new Error('PDF.js library is not loaded. Please refresh the page.');
                  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                  var pdf=await pdfjsLib.getDocument({data:e.target.result}).promise;
                  var pages=[];
                  for(var i=1;i<=pdf.numPages;i++){
                      var page=await pdf.getPage(i);
                      var content=await page.getTextContent();
                      /* Join items; insert newline when y-position changes significantly */
                      var pageText='';
                      var lastY=null;
                      content.items.forEach(function(item){
                          if(lastY!==null && Math.abs(item.transform[5]-lastY)>5) pageText+='\n';
                          pageText+=item.str;
                          lastY=item.transform[5];
                      });
                      pages.push(pageText);
                  }
                  var full=pages.join('\n\n');
                  if(!full.trim()) throw new Error('PDF appears to be empty or image-only. Try a text-based PDF.');
                  resolve(full);
              } catch(err){ reject(err); }
          };
          reader.onerror=function(){ reject(new Error('Could not read file.')); };
          reader.readAsArrayBuffer(file);
      });
  }
  function chExtractDocx(file){
      return new Promise(function(resolve,reject){
          var reader=new FileReader();
          reader.onload=async function(e){
              try{
                  if(typeof mammoth==='undefined') throw new Error('Mammoth.js library is not loaded. Please refresh the page.');
                  var result=await mammoth.extractRawText({arrayBuffer:e.target.result});
                  if(!result.value||!result.value.trim()) throw new Error('Document appears to be empty or could not be read.');
                  resolve(result.value);
              } catch(err){ reject(err); }
          };
          reader.onerror=function(){ reject(new Error('Could not read file.')); };
          reader.readAsArrayBuffer(file);
      });
  }

  /* ── MCQ text parser (mirrors aqs-file-parser.js parseQuestions) ─── */
  function chParseTextQuestions(text){
      var questions=[];
      var clean=text.replace(/\*\*([^*\n]+)\*\*/g,'$1').replace(/\*([^*\n]+)\*/g,'$1');
      var blocks=clean.split(/\n(?=\s*\d+[.)]\s)/);
      blocks.forEach(function(block){
          var qMatch=block.match(/^\s*\d+[.)]\s+([\s\S]+)/);
          if(!qMatch) return;
          var lines=qMatch[1].split('\n').map(function(l){return l.trim();}).filter(Boolean);
          var questionLines=[],options=[],correctIdx=-1,explanation='',parsingOpts=false;
          for(var i=0;i<lines.length;i++){
              var line=lines[i].replace(/\*\*([^*]+)\*\*/g,'$1').replace(/\*([^*]+)\*/g,'$1').trim();
              var optM=line.match(/^[-•*]?\s*\(?([A-Da-d])\)?[.):\]]\s*(.*)/);
              if(optM){ parsingOpts=true; options.push(optM[2].trim()); continue; }
              var ansM=line.match(/^(?:answer|correct(?:\s+answer)?|ans)[:\s]+\(?([A-Da-d])\)?/i);
              if(ansM){ correctIdx=ansM[1].toUpperCase().charCodeAt(0)-65; continue; }
              var expM=line.match(/^(?:explanation|reason|note)[:\s]+(.*)/i);
              if(expM){ explanation=expM[1].trim(); continue; }
              if(!parsingOpts) questionLines.push(line);
          }
          var question=questionLines.join(' ').trim();
          if(question&&options.length>=2){
              questions.push({
                  question:question,
                  options:options,
                  correct_answer_index:correctIdx>=0?Math.min(correctIdx,options.length-1):-1,
                  explanation:explanation
              });
          }
      });
      return questions;
  }

  /* ── AI AJAX helper — matches aqs-main.js multi-model retry logic ── */
  var CH_AI_MODELS = [
      'openai','openai-large','openai-fast',
      'mistral','mistral-large',
      'qwen-coder','llama','phi','gemma',
      'deepseek','command-r'
  ];
  function chCallGroqDirect(prompt){
      if(typeof window.groqFetch !== 'function') return Promise.reject(new Error('No Groq key'));
      return window.groqFetch({
          model:'llama-3.1-8b-instant',
          messages:[
              {role:'system',content:'You are an expert quiz maker. Output ONLY raw valid JSON. No markdown, no code fences.'},
              {role:'user',content:prompt}
          ],
          max_tokens:4096,temperature:0.3,
          response_format:{type:'json_object'}
      }).then(function(r){
          if(!r.ok) return Promise.reject(new Error('Groq '+r.status));
          return r.json();
      }).then(function(data){
          var text=(((data.choices||[])[0]||{}).message||{}).content||'';
          if(text.trim().length>20) return text.trim();
          return Promise.reject(new Error('Groq empty'));
      });
  }

  function chCallAI(prompt){
      /* Generation order:
         1. Groq direct — fastest, best quality (groqFetch handles key rotation)
         2. Pollinations direct — free, no key needed, always available
         3. Server AJAX — last resort, only when proxy URL is configured       */
      var step1 = typeof window.groqFetch === 'function'
          ? chCallGroqDirect(prompt)
          : Promise.reject(new Error('no key'));
      return step1.catch(function(){
          return chCallAIDirect(prompt);
      }).catch(function(directErr){
          /* Only try server proxy when an ajax_url is actually configured */
          if (!AQS.ajax_url) return Promise.reject(directErr);
          return new Promise(function(resolve, reject){
              $.ajax({
                  url:AQS.ajax_url, type:'POST', timeout:30000,
                  data:{action:'aqs_ai_generate',nonce:AQS.nonce,
                        prompt:prompt,model:'openai',seed:Math.floor(Math.random()*99999)},
                  success:function(res){
                      if(res.success && res.data && res.data.text && res.data.text.trim().length>10)
                          resolve(res.data.text);
                      else
                          reject(new Error('Server returned no content'));
                  },
                  error:function(){ reject(new Error('Server error')); }
              });
          });
      });
  }
  function chCallAIDirect(prompt){
      /* Browser-direct Pollinations fallback — races multiple models simultaneously */
      var raceModels = ['openai','openai-fast','mistral','openai-large'];
      var controllers = raceModels.map(function(){ return new AbortController(); });
      var promises = raceModels.map(function(model, idx){
          var tid = setTimeout(function(){ controllers[idx].abort(); }, 22000);
          return fetch('https://text.pollinations.ai/openai',{
              method:'POST', signal:controllers[idx].signal,
              headers:{'Content-Type':'application/json'},
              body:JSON.stringify({
                  model:model, seed:Math.floor(Math.random()*99999), temperature:0.4, private:true,
                  messages:[
                      {role:'system',content:'You are an expert quiz maker. Output ONLY a raw valid JSON array. No markdown, no code fences.'},
                      {role:'user',content:prompt}
                  ]
              })
          }).then(function(r){ clearTimeout(tid); if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
            .then(function(data){
              var text=(((data.choices||[])[0]||{}).message||{}).content||'';
              text=text.trim();
              if(!text||text.length<20) throw new Error('empty');
              /* abort the other racing models */
              controllers.forEach(function(c){ try{c.abort();}catch(e2){} });
              return text;
          }).catch(function(e){ clearTimeout(tid); return null; });
      });
      return new Promise(function(resolve,reject){
          var remaining=promises.length;
          promises.forEach(function(p){
              p.then(function(val){
                  if(val!==null){ resolve(val); }
                  else{ remaining--; if(remaining===0) reject(new Error('All AI models failed. Please check your connection and try again.')); }
              });
          });
      });
  }

  /* ── JSON question parser ────────────────────────────────────────── */
  function chParseJSON(text){
      text=text.replace(/```json[\r\n]*/gi,'').replace(/```[\r\n]*/g,'').trim();
      var m=text.match(/\[[\s\S]*\]/);
      if(m){
          try{
              var arr=JSON.parse(m[0]);
              if(Array.isArray(arr)) return arr.filter(function(q){
                  return q&&q.question&&Array.isArray(q.options)&&q.options.length>=2&&typeof q.correct_answer_index==='number';
              });
          } catch(e){}
      }
      return null;
  }

  /* ── Render question review list ─────────────────────────────────── */
  function renderChQList(){
      var $list=$('#aqs-ch-q-list').empty();
      var letters=['A','B','C','D'];
      var total=chQuestions.length;
      chQuestions.forEach(function(q,i){
          var opts=(q.options||[]).map(function(opt,oi){
              var isCorrect=oi===q.correct_answer_index;
              return '<div style="padding:3px 8px;border-radius:4px;font-size:.8rem;color:'+(isCorrect?'#86efac':'#64748b')+';background:'+(isCorrect?'rgba(16,185,129,.12)':'transparent')+'">'+letters[oi]+'. '+chRenderMath(opt)+'</div>';
          }).join('');
          var $card=$('<div draggable="true" '+
              'data-qi="'+i+'" '+
              'style="border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:10px 12px;'+
              'background:rgba(255,255,255,.03);cursor:default;transition:background .15s,opacity .15s">'+
              '<div style="display:flex;align-items:flex-start;gap:8px">'+
                  /* Drag handle */
                  '<span class="aqs-ch-drag-handle" title="Drag to reorder" '+
                  'style="color:#334155;font-size:1rem;cursor:grab;flex-shrink:0;padding-top:2px;user-select:none">≡</span>'+
                  /* Question text — pre-rendered math */
                  '<span style="font-size:.83rem;font-weight:600;color:#e2e8f0;flex:1;line-height:1.4">Q'+(i+1)+'. '+chRenderMath(q.question)+'</span>'+
                  /* Controls */
                  '<div style="display:flex;gap:4px;flex-shrink:0;align-items:center">'+
                      '<button class="aqs-ch-btn aqs-ch-btn-sm aqs-ch-move-up" data-qi="'+i+'" type="button" '+
                      'style="padding:1px 7px;font-size:.75rem;background:rgba(99,102,241,.12);border-color:rgba(99,102,241,.3);color:#a5b4fc'+(i===0?';opacity:.3;pointer-events:none':'')+'" title="Move up">▲</button>'+
                      '<button class="aqs-ch-btn aqs-ch-btn-sm aqs-ch-move-dn" data-qi="'+i+'" type="button" '+
                      'style="padding:1px 7px;font-size:.75rem;background:rgba(99,102,241,.12);border-color:rgba(99,102,241,.3);color:#a5b4fc'+(i===total-1?';opacity:.3;pointer-events:none':'')+'" title="Move down">▼</button>'+
                      '<button class="aqs-ch-btn aqs-ch-btn-sm aqs-ch-del-q" data-qi="'+i+'" type="button" '+
                      'style="padding:1px 7px;font-size:.75rem;background:rgba(239,68,68,.15);border-color:rgba(239,68,68,.3);color:#fca5a5" title="Remove">✕</button>'+
                  '</div>'+
              '</div>'+
              '<div style="margin-top:6px">'+opts+'</div>'+
              '</div>');

          /* HTML5 drag-and-drop */
          $card[0].addEventListener('dragstart',function(e){
              e.dataTransfer.effectAllowed='move';
              e.dataTransfer.setData('text/plain',i);
              $(this).css('opacity','.4');
              _chDragSrc=i;
          });
          $card[0].addEventListener('dragend',function(){
              $(this).css('opacity','1');
              $('#aqs-ch-q-list .aqs-ch-drag-over').removeClass('aqs-ch-drag-over')
                  .css('border-color','rgba(255,255,255,.08)');
          });
          $card[0].addEventListener('dragover',function(e){
              e.preventDefault();
              e.dataTransfer.dropEffect='move';
              $('#aqs-ch-q-list .aqs-ch-drag-over').removeClass('aqs-ch-drag-over')
                  .css('border-color','rgba(255,255,255,.08)');
              $(this).addClass('aqs-ch-drag-over').css('border-color','#6366f1');
          });
          $card[0].addEventListener('drop',function(e){
              e.preventDefault();
              var to=parseInt($(this).data('qi'));
              if(_chDragSrc===to) return;
              var moved=chQuestions.splice(_chDragSrc,1)[0];
              chQuestions.splice(to,0,moved);
              renderChQList();
          });

          $list.append($card);
      });
      $('#aqs-ch-q-badge').text(total);
      var has=total>0;
      $('#aqs-ch-q-list-card').toggle(has);
      $('#aqs-ch-create-btn,#aqs-ch-host-hint').toggle(has);
  }
  var _chDragSrc=-1;

  /* ── Manual question entry ───────────────────────────────────────── */
  function chAddManualQuestion(){
      if($('#aqs-ch-manual-form').length) return; /* only one at a time */
      var html=
          '<div id="aqs-ch-manual-form" style="background:rgba(255,255,255,.04);border:1px solid rgba(99,102,241,.3);border-radius:12px;padding:16px;margin-top:12px">'+
          '<div class="aqs-ch-form-group"><label style="color:#a5b4fc;font-size:.82rem;font-weight:600">Question</label>'+
          '<textarea id="aqs-ch-mq-text" class="aqs-ch-input" rows="2" placeholder="Type your question…" style="resize:vertical"></textarea></div>'+
          '<div class="aqs-ch-form-group"><label style="color:#a5b4fc;font-size:.82rem;font-weight:600">Options — one per line. Prefix the correct answer with <code style="color:#fcd34d">*</code></label>'+
          '<textarea id="aqs-ch-mq-opts" class="aqs-ch-input" rows="4" placeholder="*Correct answer\nWrong choice 1\nWrong choice 2\nWrong choice 3"></textarea></div>'+
          '<div class="aqs-ch-form-group"><label style="color:#a5b4fc;font-size:.82rem;font-weight:600">Explanation (optional)</label>'+
          '<input id="aqs-ch-mq-exp" type="text" class="aqs-ch-input" placeholder="Brief explanation of the correct answer"></div>'+
          '<div style="display:flex;gap:8px;justify-content:flex-end">'+
          '<button id="aqs-ch-mq-cancel" class="aqs-ch-btn aqs-ch-btn-ghost aqs-ch-btn-sm" type="button">Cancel</button>'+
          '<button id="aqs-ch-mq-save" class="aqs-ch-btn aqs-ch-btn-primary aqs-ch-btn-sm" type="button">✓ Add Question</button>'+
          '</div></div>';

      /* Append to manual src panel if visible, else to review card */
      if($('#aqs-ch-src-manual').is(':visible')){
          $('#aqs-ch-src-manual').append(html);
      } else {
          $('#aqs-ch-q-list-card').append(html);
      }

      $('#aqs-ch-mq-cancel').on('click',function(){ $('#aqs-ch-manual-form').remove(); });
      $('#aqs-ch-mq-save').on('click',function(){
          var question=$('#aqs-ch-mq-text').val().trim();
          var optsRaw=$('#aqs-ch-mq-opts').val().split('\n').map(function(l){return l.trim();}).filter(Boolean);
          var explanation=$('#aqs-ch-mq-exp').val().trim();
          if(!question||optsRaw.length<2){ alert('Enter a question and at least 2 options.'); return; }
          var correctIdx=-1;
          var options=optsRaw.map(function(o,i){
              if(o.charAt(0)==='*'){ correctIdx=i; return o.slice(1).trim(); }
              return o;
          });
          chQuestions.push({question:question,options:options,correct_answer_index:correctIdx,explanation:explanation});
          $('#aqs-ch-manual-form').remove();
          renderChQList();
      });
  }

  /* ── Host challenge (send pre-generated questions to server) ─────── */
  function chHostChallenge(){
      if(!chQuestions.length){ flash('Generate or add questions first.'); return; }
      var players=parseInt($('#aqs-ch-players').val())||2;
      var qpr=parseInt($('#aqs-ch-qpr').val())||5;
      var isLeague=$('#aqs-ch-league-toggle').is(':checked');
      var rounds=isLeague?Math.max(1,players-1):(parseInt($('#aqs-ch-rounds').val())||1);
      var perPlayer=qpr*rounds;
      if(perPlayer<2){ flash('Need at least 2 questions per player per round.'); return; }
      var tpq=parseInt($('#aqs-ch-timelimit').val())||30;
      var title=$('#aqs-ch-title').val().trim();
      var topic=$('#aqs-ch-topic').val().trim()||title||'Challenge';
      var $b=$('#aqs-ch-create-btn');
      btnLoading($b,'🚀 Creating challenge…');
      $('#aqs-ch-alerts').html('<div class="aqs-ch-alert aqs-ch-alert-info">⚡ Setting up your challenge with <strong>'+chQuestions.length+'</strong> questions…</div>');
      var hostName=$('#aqs-ch-host-name-inp').val().trim()||AQS.current_user_name||'Host';
      $.post(AQS.ajax_url,{
          action:'aqs_ch_create', nonce:AQS.nonce,
          topic:topic, title:title,
          host_name:hostName,
          num_players:players, questions_per_round:qpr, num_rounds:rounds, time_per_question:tpq,
          questions_json:JSON.stringify(chQuestions),
          league_mode:isLeague?1:0,
          character_id:localStorage.getItem('aqs_ch_char_host')||localStorage.getItem('aqs_ch_char')||'koda'
      },function(res){
          btnRestore($b,'🚀 Host Challenge with These Questions');
          if(!res.success){ flash(res.data||'Failed.'); return; }
          var d=res.data;
          CH.code=d.code; CH.numPlayers=d.num_players; CH.numRounds=d.num_rounds;
          CH.qpr=d.questions_per_round; CH.numQuestions=CH.qpr*CH.numRounds;
          CH.title=d.title; CH.timePerQ=tpq; CH.isHost=true;
          setUrlCode(d.code);
          /* Host is already registered at position 0 by aqs_ch_create — no second join needed */
          var hn=AQS.current_user_name||'Host';
          CH.playerToken=d.player_token; CH.position=0; CH.playerName=hn;
          CH.myCharId=localStorage.getItem('aqs_ch_char_host')||localStorage.getItem('aqs_ch_char')||'koda';
          saveSession();initWaitingRoom();
      }).fail(function(){ btnRestore($b,'🚀 Host Challenge with These Questions'); flash('Request failed.'); });
  }

  /* ══════════════════════════════════════════════════════════════════
     BOOT
  ══════════════════════════════════════════════════════════════════ */
  $(function(){
      if(!$('#aqs-ch-page').length) return;
      var code=getUrlParam('aqs_challenge');
      initHomeScreen();

      /* ── Studio import: questions arriving from AI Studio ─────────── */
      (function(){
          var raw='';
          try{ raw=sessionStorage.getItem('aqs_studio_challenge_import')||''; }catch(e){}
          if(!raw) return;
          var imported=null;
          try{ imported=JSON.parse(raw); sessionStorage.removeItem('aqs_studio_challenge_import'); }catch(e){ return; }
          var qs=(imported&&Array.isArray(imported.questions)&&imported.questions.length)?imported.questions:null;
          if(!qs) return;
          chQuestions=qs;
          /* Switch to host tab and show questions */
          $('#aqs-ch-tab-host').trigger('click');
          renderChQList();
          /* Insert a green import banner above the review card */
          var $banner=$('<div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px 16px;display:flex;align-items:flex-start;gap:10px;margin-bottom:14px;">' +
              '<span style="font-size:20px;">&#128229;</span>' +
              '<div><strong style="color:#166534;">Questions imported from AI Studio</strong>' +
              '<p style="margin:3px 0 0;color:#166534;font-size:.83rem;">' +
              qs.length+' question'+(qs.length!==1?'s':'')+
              ' loaded \u2014 set your players &amp; rounds below, then click Host Challenge.</p></div></div>');
          $('#aqs-ch-q-list-card').before($banner);
          /* Scroll host panel into view */
          setTimeout(function(){
              var $panel=$('#aqs-ch-pane-host');
              if($panel.length) $('html,body').animate({scrollTop:$panel.offset().top-20},400);
          },150);
      })();

      /* Try to reconnect to an existing session first.
         If no saved session, fall back to normal home screen init. */
      tryReconnect(function onFail(){
          /* No saved session (or it expired) — normal home screen */
          if(code){
              /* Arriving via a shareable link — simplify the join form */
              $('#aqs-ch-join-code').val(code.toUpperCase());
              $('#aqs-ch-invite-banner').show();
              $('#aqs-ch-code-group').hide();
              $('#aqs-ch-join-subtitle').hide();
              $('#aqs-ch-tab-join').trigger('click');
          } else if(!chQuestions.length){
              /* Only default to join tab if we haven't imported studio questions */
              $('#aqs-ch-tab-join').trigger('click');
          }
      });
  });

  })(jQuery);
  