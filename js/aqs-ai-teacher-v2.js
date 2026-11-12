(function () {
'use strict';
var STORE_KEY='aqs_ai_teacher_chats_v2',VOICE_KEY='aqs_ai_teacher_voice_enabled',MAX_CONTEXT=24;
var app=document.getElementById('ait-app'),messagesEl=document.getElementById('ait-messages'),conversationEl=document.getElementById('ait-conversation');
var input=document.getElementById('ait-input'),statusEl=document.getElementById('ait-status'),stateLabel=document.getElementById('ait-state-label');
var orb=document.getElementById('ait-orb'),toastEl=document.getElementById('ait-toast'),historyDrawer=document.getElementById('ait-history-drawer');
var historyBackdrop=document.getElementById('ait-history-backdrop'),historyList=document.getElementById('ait-history-list');
var nativeVoice=window.AqsNativeVoice||null,activeRecognition=null,activeSpeechId=null,speechQueue=[];
var voiceEnabled=localStorage.getItem(VOICE_KEY)!=='false',thinking=false,listening=false,speaking=false,toastTimer=null,pendingNativeSpeech=null,ttsInitComplete=false;
var sessions=loadSessions(),currentId=sessions.length?sessions[0].id:makeId();
var currentSession=sessions.find(function(s){return s.id===currentId;})||makeSession();
if(!sessions.some(function(s){return s.id===currentId;}))sessions.unshift(currentSession);
var messages=Array.isArray(currentSession.messages)?currentSession.messages.slice():[];
function makeId(){return 'chat-'+Date.now()+'-'+Math.random().toString(36).slice(2,8);}
function makeSession(){var now=Date.now();return{id:makeId(),title:'New conversation',createdAt:now,updatedAt:now,messages:[]};}
function loadSessions(){try{var data=JSON.parse(localStorage.getItem(STORE_KEY)||'[]');return Array.isArray(data)?data.filter(function(s){return s&&s.id&&Array.isArray(s.messages);}):[];}catch(e){return[];}}
function persist(){
 currentSession.messages=messages.slice();currentSession.updatedAt=Date.now();
 var firstUser=messages.find(function(m){return m.role==='user';});
 currentSession.title=firstUser?String(firstUser.content).replace(/\s+/g,' ').slice(0,58):'New conversation';
 sessions=sessions.filter(function(s){return s.id!==currentSession.id;});sessions.unshift(currentSession);
 try{localStorage.setItem(STORE_KEY,JSON.stringify(sessions));updateHistoryCount();}
 catch(e){showToast('This device is running low on storage. Some history may not save.');}
}
function updateHistoryCount(){var el=document.getElementById('ait-history-count');if(el)el.textContent=String(sessions.length);}
function showToast(message){if(!toastEl)return;toastEl.textContent=message;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(function(){toastEl.classList.remove('show');},3200);}
function setState(state,message){
 if(orb){orb.classList.remove('listening','thinking','speaking','error');if(state)orb.classList.add(state);}
 if(stateLabel)stateLabel.textContent=message||'Ready';if(statusEl)statusEl.textContent=message||'Ask a question or tap the microphone to speak.';
 listening=state==='listening';thinking=state==='thinking';speaking=state==='speaking';
 var mic=document.getElementById('ait-mic');if(mic)mic.classList.toggle('listening',listening);
}
function scrollConversation(){requestAnimationFrame(function(){conversationEl.scrollTop=conversationEl.scrollHeight;});}
function renderMessage(message){
 var row=document.createElement('article');row.className='ait-message '+(message.role==='user'?'user':'assistant');
 var label=document.createElement('div');label.className='ait-message-label';label.textContent=message.role==='user'?'You':'AI Teacher';
 var bubble=document.createElement('div');bubble.className='ait-message-bubble';bubble.textContent=String(message.content||'');
 row.appendChild(label);row.appendChild(bubble);messagesEl.appendChild(row);
 if(window.MathJax&&window.MathJax.typesetPromise)window.MathJax.typesetPromise([bubble]).catch(function(){});
}
function renderMessages(){messagesEl.innerHTML='';messages.forEach(renderMessage);app.classList.toggle('has-messages',messages.length>0);scrollConversation();}
function addMessage(role,content){
 var message={role:role,content:String(content||''),at:Date.now()};messages.push(message);renderMessage(message);
 app.classList.add('has-messages');persist();scrollConversation();
}
function openHistory(){renderHistory();historyDrawer.classList.add('open');historyBackdrop.classList.add('open');historyDrawer.setAttribute('aria-hidden','false');}
function closeHistory(){historyDrawer.classList.remove('open');historyBackdrop.classList.remove('open');historyDrawer.setAttribute('aria-hidden','true');}
function renderHistory(){
 historyList.innerHTML='';updateHistoryCount();
 if(!sessions.length){var empty=document.createElement('div');empty.className='ait-history-empty';empty.textContent='Your conversations will appear here after your first question.';historyList.appendChild(empty);return;}
 sessions.slice().sort(function(a,b){return b.updatedAt-a.updatedAt;}).forEach(function(session){
  var button=document.createElement('button');button.type='button';button.className='ait-history-item';
  var title=document.createElement('strong');title.textContent=session.title||'Study conversation';
  var detail=document.createElement('span');detail.textContent=(session.messages?session.messages.length:0)+' messages · '+new Date(session.updatedAt||session.createdAt).toLocaleString();
  button.appendChild(title);button.appendChild(detail);button.addEventListener('click',function(){openSession(session.id);});historyList.appendChild(button);
 });
}
function openSession(id){
 stopListening();stopSpeaking();persist();var found=sessions.find(function(s){return s.id===id;});if(!found)return;
 currentSession=found;currentId=found.id;messages=found.messages.slice();renderMessages();closeHistory();
 setState('','Previous conversation opened. You can continue learning.');
}
function newChat(){
 stopListening();stopSpeaking();persist();currentSession=makeSession();currentId=currentSession.id;messages=[];
 sessions.unshift(currentSession);renderMessages();persist();closeHistory();input.value='';input.focus();
 setState('','New conversation. What would you like to learn?');
}
function waitForAIKeys(){
 return new Promise(function(resolve){
  var tries=0;function count(){try{return(window.getFeatureGroqKeyCount?window.getFeatureGroqKeyCount('studyhub'):0)+(window._aqsGroqKeyCount?window._aqsGroqKeyCount():0);}catch(e){return 0;}}
  if(count()>0){resolve(true);return;}var timer=setInterval(function(){tries++;if(count()>0||tries>=24){clearInterval(timer);resolve(count()>0);}},150);
 });
}
function readAIResponse(response){
 if(response&&typeof response.json==='function'&&'ok'in response){
  if(!response.ok)return response.json().catch(function(){return null;}).then(function(data){
   var detail=data&&data.error&&(data.error.message||data.error);
   throw new Error(response.status===429?'The AI service is busy. Please try again shortly.':'AI request failed ('+response.status+')'+(detail?': '+detail:'.'));
  });
  return response.json();
 }
 return Promise.resolve(response);
}
function extractAIText(data){
 if(typeof data==='string')return data;
 if(data&&data.choices&&data.choices[0]){var choice=data.choices[0];return(choice.message&&choice.message.content)||choice.text||'';}
 return data&&data.content?data.content:'';
}
function requestAI(){
 var fetcher=window.studyhubGroqFetch||window.groqFetch;
 if(typeof fetcher!=='function'){addMessage('assistant','The AI service is not ready yet. Please try again in a moment.');setState('','Ready');return;}
 setState('thinking','Thinking through your question…');
 var model=(window.AQS_CONFIG&&window.AQS_CONFIG.groqModel)||window._AQS_GROQ_MODEL||'openai/gpt-oss-20b';
 var body={model:model,messages:[{role:'system',content:'You are a patient, highly capable university study tutor. Explain ideas in clear, simple English. Break difficult concepts into numbered steps, define technical words, and use practical examples. Be accurate and honest when uncertain. Keep most answers focused and readable, and finish with one short question that checks the student understands. Use readable Markdown and LaTeX only when it helps.'}].concat(messages.filter(function(m){return m.role==='user'||m.role==='assistant';}).slice(-MAX_CONTEXT)),temperature:0.55,max_tokens:1200};
 waitForAIKeys().then(function(hasKeys){if(!hasKeys)throw new Error('The AI key pool is not ready. Please try again or contact the administrator.');return fetcher(body,{signal:(window.AbortSignal&&AbortSignal.timeout)?AbortSignal.timeout(60000):undefined});})
 .then(readAIResponse).then(function(data){var answer=extractAIText(data).trim();if(!answer)throw new Error('The AI returned an empty answer. Please try again.');addMessage('assistant',answer);setState('','Answer ready. You can ask a follow-up question.');if(voiceEnabled)speakAnswer(answer);})
 .catch(function(error){var message=error&&error.message?error.message:'Something went wrong.';addMessage('assistant','I could not answer that just now. '+message);setState('error','I could not complete that answer. Try again.');console.error('[AI Teacher]',error);});
}
function submitQuestion(value){
 var question=String(value||'').trim();if(!question||thinking)return;stopSpeaking();addMessage('user',question);input.value='';resizeInput();requestAI();
}
function resizeInput(){input.style.height='auto';input.style.height=Math.min(input.scrollHeight,132)+'px';}
function stopListening(){
 if(!listening&&!activeRecognition)return;
 try{if(nativeVoice&&typeof nativeVoice.stopListening==='function')nativeVoice.stopListening();if(activeRecognition)activeRecognition.stop();}catch(e){}
 activeRecognition=null;setState('','Ready');
}
function startBrowserRecognition(){
 var Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
 if(!Recognition){showToast('Speech recognition is not available in this browser. You can type your question instead.');setState('error','Voice input is unavailable here.');return;}
 var recognition=new Recognition();activeRecognition=recognition;recognition.lang='en-US';recognition.continuous=false;recognition.interimResults=true;
 recognition.onstart=function(){setState('listening','Listening… speak now.');};
 recognition.onresult=function(event){var text='';for(var i=event.resultIndex||0;i<event.results.length;i++){if(event.results[i].isFinal)text+=event.results[i][0].transcript;else{input.value=event.results[i][0].transcript;resizeInput();}}
  if(text.trim()){input.value=text.trim();submitQuestion(input.value);}};
 recognition.onerror=function(event){setState('error','Microphone error: '+(event.error||'unknown error'));showToast('Voice input failed. Check microphone permission and try again.');};
 recognition.onend=function(){activeRecognition=null;if(!thinking&&!speaking)setState('','Ready');};
 try{recognition.start();}catch(e){activeRecognition=null;setState('error','Could not start the microphone.');showToast('Could not start voice input. Please try again.');}
}
function onNativeVoice(event){
 var detail=event&&event.detail?event.detail:{};
 if(detail.type==='start'){setState('listening','Listening… speak now.');return;}
 if(detail.type==='partial'){input.value=detail.value||'';resizeInput();return;}
 if(detail.type==='result'){var spoken=String(detail.value||'').trim();if(spoken){input.value=spoken;resizeInput();submitQuestion(spoken);}return;}
 if(detail.type==='error'){var err=detail.value||'recognition-error';setState('error','Voice input error: '+err);showToast(err==='service-unavailable'?'Android speech recognition is not available. Enable a speech recognition service or type your question.':'Voice input did not work. Check microphone permission and try again.');return;}
 if(detail.type==='end'&&!thinking&&!speaking)setState('','Ready');
}
function startListening(){
 if(thinking||speaking||listening)return;nativeVoice=window.AqsNativeVoice||nativeVoice;
 if(nativeVoice&&typeof nativeVoice.startListening==='function'){
  try{if(typeof nativeVoice.isRecognitionAvailable==='function'&&!nativeVoice.isRecognitionAvailable()){showToast('Android speech recognition is not available. You can still type your question.');setState('error','Speech service unavailable.');return;}
   setState('listening','Waiting for microphone permission…');nativeVoice.startListening('en-US');
  }catch(e){setState('error','Could not start Android speech recognition.');showToast('Could not start the microphone. Check app permissions.');}
  return;
 }
 startBrowserRecognition();
}
function stopSpeaking(){
 speechQueue=[];pendingNativeSpeech=null;if(nativeVoice&&typeof nativeVoice.stopSpeaking==='function'){try{nativeVoice.stopSpeaking();}catch(e){}}
 if(window.speechSynthesis){try{window.speechSynthesis.cancel();}catch(e){}}
 activeSpeechId=null;if(speaking)setState('','Ready');
}
function speakBrowser(text){
 if(!window.speechSynthesis||!window.SpeechSynthesisUtterance){showToast('Text-to-speech is unavailable here. The written answer is saved.');return;}
 speechQueue=text.match(/[^.!?]+[.!?]*/g)||[text];
 function next(){if(!speechQueue.length){setState('','Answer ready.');return;}var part=speechQueue.shift();var utterance=new SpeechSynthesisUtterance(part);utterance.rate=1;utterance.onstart=function(){setState('speaking','AI Teacher is speaking…');};utterance.onend=next;utterance.onerror=function(){setState('','Answer ready.');};window.speechSynthesis.speak(utterance);}
 next();
}
function speakAnswer(text){
 var clean=String(text).replace(/\x60{3}[\s\S]*?\x60{3}/g,'Code block omitted from speech.').replace(/\[BOARD\][\s\S]*?\[\/BOARD\]/gi,'').replace(/[*_#>]/g,' ').replace(/\s+/g,' ').trim();
 if(!clean)return;nativeVoice=window.AqsNativeVoice||nativeVoice;
 if(nativeVoice&&typeof nativeVoice.speak==='function'){
  if(typeof nativeVoice.isTtsReady==='function'&&!nativeVoice.isTtsReady()){
   if(!ttsInitComplete){pendingNativeSpeech=clean;setState('','Preparing Android voice…');setTimeout(function(){if(pendingNativeSpeech&&!nativeVoice.isTtsReady()){pendingNativeSpeech=null;setState('','Answer ready.');showToast('Android Text-to-Speech is not ready. Enable or install a voice in Android settings. Your written answer is saved.');}},2800);}
   else showToast('Android Text-to-Speech is unavailable. Enable or install a voice in Android settings. Your written answer is saved.');
   return;
  }
  activeSpeechId='ait-speech-'+Date.now()+'-'+Math.random().toString(36).slice(2,7);setState('speaking','AI Teacher is speaking…');
  try{nativeVoice.speak(clean.slice(0,3800),1,1,activeSpeechId);}catch(e){activeSpeechId=null;setState('error','Android voice output could not start.');showToast('Voice output failed. Your written answer is still available.');}
  return;
 }
 speakBrowser(clean);
}
function onNativeSpeechEvent(event){
 var detail=event&&event.detail?event.detail:{};
 if(detail.type==='tts-ready'){
  ttsInitComplete=true;
  if(detail.value==='true'&&pendingNativeSpeech){var queued=pendingNativeSpeech;pendingNativeSpeech=null;speakAnswer(queued);}
  else if(detail.value!=='true'&&pendingNativeSpeech){pendingNativeSpeech=null;setState('','Answer ready.');showToast('Android Text-to-Speech is unavailable. Enable or install a voice in Android settings.');}
  return;
 }
 if(!activeSpeechId||detail.value!==activeSpeechId)return;
 if(detail.type==='speech-start')setState('speaking','AI Teacher is speaking…');
 if(detail.type==='speech-end'){activeSpeechId=null;setState('','Answer ready.');}
 if(detail.type==='speech-error'){activeSpeechId=null;setState('error','Android voice output failed.');showToast('Android voice output failed. Your written answer is saved.');}
}
function toggleVoice(){
 voiceEnabled=!voiceEnabled;localStorage.setItem(VOICE_KEY,voiceEnabled?'true':'false');
 var button=document.getElementById('ait-voice-toggle');button.textContent=voiceEnabled?'🔊':'🔇';button.title=voiceEnabled?'Voice on':'Voice off';button.setAttribute('aria-label',voiceEnabled?'Turn voice off':'Turn voice on');
 document.getElementById('ait-voice-state').textContent=voiceEnabled?'Voice enabled':'Voice muted';if(!voiceEnabled)stopSpeaking();
}
function syncViewport(){
 var inset=0;if(window.visualViewport)inset=Math.max(0,window.innerHeight-window.visualViewport.height-window.visualViewport.offsetTop);
 document.documentElement.style.setProperty('--ait-keyboard-inset',inset+'px');document.body.classList.toggle('ait-keyboard-open',inset>100||document.activeElement===input);
}
function setupKeyboard(){
 if(window.visualViewport){window.visualViewport.addEventListener('resize',syncViewport);window.visualViewport.addEventListener('scroll',syncViewport);}
 window.addEventListener('resize',syncViewport);input.addEventListener('focus',function(){document.body.classList.add('ait-keyboard-open');setTimeout(function(){input.scrollIntoView({block:'nearest',behavior:'smooth'});syncViewport();},120);});
 input.addEventListener('blur',function(){setTimeout(syncViewport,160);});
 try{var keyboard=window.Capacitor&&window.Capacitor.Plugins&&window.Capacitor.Plugins.Keyboard;if(keyboard&&keyboard.addListener){
  keyboard.addListener('keyboardWillShow',function(event){var height=event&&event.keyboardHeight?event.keyboardHeight:0;document.documentElement.style.setProperty('--ait-keyboard-inset',height+'px');document.body.classList.add('ait-keyboard-open');});
  keyboard.addListener('keyboardWillHide',function(){document.documentElement.style.setProperty('--ait-keyboard-inset','0px');document.body.classList.remove('ait-keyboard-open');});
 }}catch(e){}
 syncViewport();
}
function bindUI(){
 document.getElementById('ait-send').addEventListener('click',function(){submitQuestion(input.value);});
 document.getElementById('ait-mic').addEventListener('click',function(){if(listening)stopListening();else startListening();});
 document.getElementById('ait-voice-toggle').addEventListener('click',toggleVoice);
 document.getElementById('ait-new-chat').addEventListener('click',newChat);
 document.getElementById('ait-history-open').addEventListener('click',openHistory);
 document.getElementById('ait-history-close').addEventListener('click',closeHistory);
 historyBackdrop.addEventListener('click',closeHistory);
 document.querySelectorAll('.ait-starter').forEach(function(button){button.addEventListener('click',function(){submitQuestion(button.getAttribute('data-prompt'));});});
 input.addEventListener('input',resizeInput);
 input.addEventListener('keydown',function(event){if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();submitQuestion(input.value);}});
 window.addEventListener('aqs-native-voice',onNativeVoice);window.addEventListener('aqs-native-voice',onNativeSpeechEvent);
 window.addEventListener('beforeunload',function(){stopListening();stopSpeaking();});
 document.addEventListener('visibilitychange',function(){if(document.hidden){stopListening();stopSpeaking();}});
}
function init(){
 var button=document.getElementById('ait-voice-toggle');button.textContent=voiceEnabled?'🔊':'🔇';button.title=voiceEnabled?'Voice on':'Voice off';button.setAttribute('aria-label',voiceEnabled?'Turn voice off':'Turn voice on');
 document.getElementById('ait-voice-state').textContent=voiceEnabled?'Voice enabled':'Voice muted';
 currentSession=sessions.find(function(s){return s.id===currentId;})||currentSession;messages=Array.isArray(currentSession.messages)?currentSession.messages.slice():[];
 renderMessages();persist();bindUI();setupKeyboard();setState('',messages.length?'Welcome back. Continue your learning conversation.':'Ask a question or tap the microphone to speak.');
}
init();
})();