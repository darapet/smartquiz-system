(function(){
  'use strict';
  var sections=[], generated=[], uid=0;
  var $=function(s,root){return (root||document).querySelector(s);};
  var $$=function(s,root){return Array.from((root||document).querySelectorAll(s));};
  function postAqs(data){
    return new Promise(function(resolve,reject){
      function send(){
        if(typeof window.aqsAjax==='function') return window.aqsAjax(data,resolve,reject);
        reject(new Error('Quiz service is still loading. Please try again.'));
      }
      if(typeof window.aqsAjax==='function'||window._aqsFirebaseReady) send();
      else {
        var done=false;
        function ready(){
          if(done)return;
          done=true;
          send();
        }
        document.addEventListener('aqs:firebase:ready',ready,{once:true});
        setTimeout(ready,10000);
      }
    });
  }
  function toast(msg){var el=$('#self-toast');el.textContent=msg;el.classList.add('show');setTimeout(function(){el.classList.remove('show');},4200);}
  function esc(s){return String(s||'').replace(/[&<>"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'})[c];});}
  async function requestQuizAI(body){
    if(typeof window.quizGroqFetch==='function'){
      try{var dedicated=await window.quizGroqFetch(body);if(dedicated)return dedicated;}catch(e){}
    }
    if(typeof window.groqFetch==='function')return window.groqFetch(body);
    throw new Error('AI service is not available. Please try again.');
  }
  /* Route this page through the dedicated quiz slots first, then the
     shared provider rotation (Groq, Mistral, and HuggingFace). */
  (function(){
    var shared=window.groqFetch;
    if(!shared)return;
    window.groqFetch=function(body){
      if(typeof window.quizGroqFetch==='function'){
        return window.quizGroqFetch(body).catch(function(){return shared(body);});
      }
      return shared(body);
    };
  }());
  function addSection(){var id=++uid;sections.push({id:id,source:'topic',topic:'',doc:'',type:'mixed',count:10,generated:false});renderSections();}
  function renderSections(){
    $('#section-list').innerHTML=sections.map(function(s,i){return '<article class="section-card '+(i>0&&!sections[i-1].generated?'is-locked':'')+'" data-id="'+s.id+'"><div class="section-top"><div><div class="section-number">SECTION '+String(i+1).padStart(2,'0')+'</div><div class="section-title">Build this section</div></div>'+(sections.length>1?'<button type="button" class="remove-section" data-remove="'+s.id+'" aria-label="Remove section">×</button>':'')+'</div><div class="source-switch"><button type="button" class="'+(s.source==='topic'?'active':'')+'" data-source="topic">✦ Topic</button><button type="button" class="'+(s.source==='doc'?'active':'')+'" data-source="doc">▧ Document</button></div><div class="source-pane '+(s.source==='topic'?'active':'')+'" data-pane="topic"><label class="aqs-field">What should this section cover?<textarea data-field="topic" placeholder="e.g. Cell division, Nigerian constitutional law, or the causes of World War I">'+esc(s.topic)+'</textarea></label></div><div class="source-pane '+(s.source==='doc'?'active':'')+'" data-pane="doc"><label class="upload-label">📄 <span>Choose a TXT, MD, PDF or DOCX file<input type="file" data-field="doc" accept=".txt,.md,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"></span></label><div class="file-name">'+esc(s.docName||'No document selected')+'</div></div><div class="section-controls"><label class="aqs-field" style="margin:0">Question style<select data-field="type"><option value="mixed" '+(s.type==='mixed'?'selected':'')+'>Combination</option><option value="mcq" '+(s.type==='mcq'?'selected':'')+'>Objective (MCQ)</option><option value="tf" '+(s.type==='tf'?'selected':'')+'>True or false</option><option value="short" '+(s.type==='short'?'selected':'')+'>German / written answer</option></select></label><label class="aqs-field" style="margin:0">Amount<input class="question-count" data-field="count" type="number" min="1" max="100" value="'+s.count+'"></label><span class="type-hint">Up to 100 questions per section</span><button type="button" class="aqs-btn aqs-btn-primary generate-section" data-generate="'+s.id+'" '+(i>0&&!sections[i-1].generated?'disabled':'')+'>'+ (s.generated?'✓ Generated — regenerate':'Generate section')+'</button></div><div class="section-status '+(s.generated?'success':'')+'" style="'+(s.generated?'display:block':'')+'">'+(s.generated?'Generated '+s.generated+' of '+s.count+' requested questions. These are ready to use.':'')+'</div></article>';}).join('');
    $$('#section-list article').forEach(function(card){var s=sections.find(function(x){return x.id==card.dataset.id;});$$('[data-source]',card).forEach(function(b){b.onclick=function(){s.source=b.dataset.source;renderSections();};});$$('[data-field]',card).forEach(function(el){el.onchange=el.oninput=function(){if(el.type==='file'){readFile(el,s);}else{s[el.dataset.field]=el.value;if(el.dataset.field==='count')s.count=Math.max(1,Math.min(100,parseInt(el.value)||1));};};});var btn=$('[data-generate]',card);if(btn)btn.onclick=function(){generateSection(s,card);};var rm=$('[data-remove]',card);if(rm)rm.onclick=function(){sections=sections.filter(function(x){return x.id!=rm.dataset.remove;});generated=sections.reduce(function(a,x){return a.concat(x.questions||[]);},[]);renderSections();};});
    $('#overall-status').textContent=sections.some(function(s){return !s.generated;})?'Generate each section in order.':'All sections are ready — start your quiz.';
  }
  async function readFile(input,s){var f=input.files&&input.files[0];if(!f)return;s.docName=f.name;s.doc='';try{if(/\.txt$|\.md$/i.test(f.name)){s.doc=await f.text();}else if(/\.pdf$/i.test(f.name)){var pdf=await pdfjsLib.getDocument({data:await f.arrayBuffer()}).promise;var pages=[];for(var p=1;p<=Math.min(pdf.numPages,30);p++){var page=await pdf.getPage(p),content=await page.getTextContent();pages.push(content.items.map(function(x){return x.str;}).join(' '));}s.doc=pages.join('\n');}else if(/\.docx$/i.test(f.name)){s.doc=(await mammoth.extractRawText({arrayBuffer:await f.arrayBuffer()})).value;}else{throw new Error('Use TXT, MD, PDF, or DOCX.');}if(s.doc.length>30000)s.doc=s.doc.slice(0,30000);renderSections();}catch(e){toast('Could not read that document: '+e.message);}}
  function promptFor(s){var source=s.source==='doc'?'Use this study document:\\n'+s.doc:'Generate from this topic:\\n'+s.topic;var style=s.type==='mcq'?'only objective multiple-choice questions':s.type==='tf'?'only true/false questions':s.type==='short'?'only written-answer questions (the learner types the answer; do not guess)': 'a balanced combination of objective, true/false, and written-answer questions';return 'You create rigorous study quizzes. '+source+'\\nCreate exactly '+s.count+' questions. Use '+style+'. Return ONLY one valid JSON object in this exact shape: {\"questions\":[...]}. Each item must contain question, type (mcq, tf, or short), options (for mcq exactly 4 strings; for tf exactly [\"True\",\"False\"]; for short []), correct_answer_index (for mcq/tf zero-based; for short use 0), answer (for short the exact answer string, otherwise the correct option string), and explanation. Escape all quotation marks inside strings. Do not include markdown, comments, or trailing commas. Avoid duplicates and ambiguous wording.\\nMATH FORMATTING IS REQUIRED: Every equation, formula, or mathematical expression must use KaTeX-compatible LaTeX delimiters. Use $...$ for inline math and $$...$$ for display math. Always write square roots as $\\\\sqrt{x}$ or $\\\\sqrt[n]{x}$, fractions as $\\\\frac{a}{b}$, powers as $x^{2}$, subscripts as $a_{n}$, and symbols/operators with LaTeX such as $\\\\pm$, $\\\\times$, $\\\\div$, $\\\\leq$, $\\\\geq$, $\\\\neq$, $\\\\approx$, $\\\\infty$, $\\\\sum$, $\\\\prod$, $\\\\int$, $\\\\lim$, $\\\\sin$, $\\\\cos$, $\\\\log$, $\\\\ln$, $\\\\alpha$, $\\\\beta$, $\\\\theta$, $\\\\pi$, $\\\\Delta$, $\\\\degree$, $\\\\vec{v}$, $\\\\overline{AB}$, $\\\\binom{n}{r}$, matrices, and systems of equations. Never write raw sqrt, x^2, a/b, or LaTeX commands outside delimiters. Keep LaTeX backslashes escaped correctly for JSON.';}
  function parseQuestions(raw){var text=String(raw||'').replace(/```(?:json)?/gi,'').replace(/```/g,'').trim(),parsed;try{parsed=JSON.parse(text);}catch(e){var start=text.indexOf('['),end=text.lastIndexOf(']');if(start<0||end<=start)throw e;var arrayText=text.slice(start,end+1).replace(/,\\s*([}\\]])/g,'$1');parsed=JSON.parse(arrayText);}var list=Array.isArray(parsed)?parsed:parsed.questions;return Array.isArray(list)?list:[];}
  async function generateSection(s,card){if(s.source==='topic'&&!s.topic.trim()){toast('Add a topic before generating this section.');return;}if(s.source==='doc'&&!s.doc){toast('Choose a readable document before generating this section.');return;}var btn=$('[data-generate]',card),status=$('.section-status',card);btn.disabled=true;btn.textContent='Generating…';status.style.display='block';status.className='section-status';status.textContent='AI is building section '+(sections.indexOf(s)+1)+'…';try{var res=await window.groqFetch({messages:[{role:'system',content:'You are a precise quiz generator. Output only valid JSON.'},{role:'user',content:promptFor(s)}],temperature:.15,response_format:{type:'json_object'}});var body=await res.json();var raw=body.choices&&body.choices[0]&&body.choices[0].message&&body.choices[0].message.content||'';var qs=parseQuestions(raw);if(!qs.length)throw new Error('AI returned an invalid question set.');qs=qs.slice(0,s.count).map(function(q){q.type=q.type||'mcq';q.options=Array.isArray(q.options)?q.options:[];q.correct_answer_index=parseInt(q.correct_answer_index)||0;q.answer=q.answer||q.options[q.correct_answer_index]||'';return q;});s.questions=qs;s.generated=qs.length;generated=sections.reduce(function(a,x){return a.concat(x.questions||[]);},[]);status.className='section-status success';status.textContent='Generated '+qs.length+' of '+s.count+' requested questions. You can use these now or regenerate for another set.';renderSections();}catch(e){status.className='section-status error';status.textContent=e.message||'Generation failed. Try again.';btn.disabled=false;btn.textContent='Generate section';}}
  $('#add-section').onclick=addSection;
  $('#self-quiz-form').onsubmit=async function(e){e.preventDefault();if(sections.some(function(s){return !s.generated;})){toast('Generate every section in order before starting.');return;}var btn=$('#start-quiz');btn.disabled=true;btn.textContent='Saving quiz…';try{var res=await postAqs({action:'aqs_save_quiz',title:$('#self-title').value.trim()||'My Self Quiz',subject:'Personal study quiz',num_questions:generated.length,time_limit:$('#self-time').value,mode:$('#self-mode').value,questions_json:JSON.stringify(generated),quiz_note:'Created in Self Quiz Studio',show_results:'yes'});if(!res.success)throw new Error(res.data||'Could not save quiz.');var pub=await postAqs({action:'aqs_publish_quiz',quiz_id:res.data.quiz_id});if(!pub.success)throw new Error(pub.data||'Could not prepare quiz.');toast('Your quiz is ready — opening it now.');setTimeout(function(){location.href=pub.data.quiz_url;},500);}catch(err){toast(err.message||'Could not start quiz.');btn.disabled=false;btn.innerHTML='Generate my quiz <span>→</span>';}}; 
  window.AQS=window.AQS||{ajax_url:''};addSection();
  /* Keep the UI language consistent with the actual short-answer type. */
  setTimeout(function(){
    document.querySelectorAll('option').forEach(function(option){
      if(option.textContent.indexOf('German / written answer')!==-1)
        option.textContent='Written answer';
    });
  },0);
})();