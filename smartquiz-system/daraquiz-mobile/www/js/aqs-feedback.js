/* aqs-feedback.js — User Feedback Popup v1.252
   Reads active questionnaire from Firebase. Shows once per activation.
   No login needed. Up to 10 questions: A-D options or free text. */
(function(){
    'use strict';
    var COL_FB='aqsFeedbacks',COL_RESP='aqsFeedbackResponses_',COL_SYS='aqsSystem',LS_PFX='aqs_fb_seen_';
    function hasSeen(id){try{return localStorage.getItem(LS_PFX+id)==='1';}catch(e){return false;}}
    function markSeen(id){try{localStorage.setItem(LS_PFX+id,'1');}catch(e){}}
    function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

    async function getActive(){
        if(!window._aqsFS)return null;
        var sys=await window._aqsFS.get(COL_SYS,'feedback');
        if(!sys||!sys.activeId)return null;
        var fb=await window._aqsFS.get(COL_FB,sys.activeId);
        if(!fb||!fb.active||!fb.questions||!fb.questions.length)return null;
        return fb;
    }

    function showFeedback(fb){
        if(document.getElementById('_aqsfb-overlay'))return;
        var answers={},current=0,total=fb.questions.length;
        var style=document.createElement('style');
        style.id='_aqsfb-style';
        style.textContent='@keyframes _fbFI{from{opacity:0;transform:translateY(28px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}#_aqsfb-overlay{position:fixed;inset:0;z-index:999998;display:flex;align-items:center;justify-content:center;background:rgba(5,5,20,.92);backdrop-filter:blur(6px);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;padding:16px;box-sizing:border-box;}#_aqsfb-card{background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:22px;max-width:560px;width:100%;box-shadow:0 40px 90px rgba(0,0,0,.7);overflow:hidden;animation:_fbFI .5s cubic-bezier(.22,1,.36,1) both;}#_aqsfb-hdr{background:linear-gradient(135deg,#1e1b4b,#14103a);padding:22px 26px 18px;position:relative;}#_aqsfb-hdr h2{margin:0 30px 4px 0;font-size:1.15rem;font-weight:800;color:#f1f5f9;}#_aqsfb-hdr p{margin:0;font-size:.8rem;color:#94a3b8;}#_aqsfb-pbar{height:4px;background:#1e293b;margin-top:16px;border-radius:4px;overflow:hidden;}#_aqsfb-pfill{height:100%;background:linear-gradient(90deg,#6366f1,#a855f7);border-radius:4px;transition:width .35s ease;}#_aqsfb-close-btn{position:absolute;top:16px;right:16px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#64748b;width:30px;height:30px;border-radius:50%;font-size:.9rem;cursor:pointer;display:flex;align-items:center;justify-content:center;}#_aqsfb-body{padding:28px 26px;}#_aqsfb-step{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#6366f1;margin-bottom:10px;}#_aqsfb-question{font-size:1rem;font-weight:700;color:#e2e8f0;margin-bottom:20px;line-height:1.5;}._aqsfb-opt{display:block;width:100%;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.08);border-radius:11px;padding:12px 16px;text-align:left;color:#cbd5e1;font-size:.9rem;cursor:pointer;margin-bottom:10px;transition:all .15s;font-family:inherit;}._aqsfb-opt:hover{background:rgba(99,102,241,.12);border-color:#6366f1;color:#e2e8f0;}._aqsfb-opt.selected{background:rgba(99,102,241,.2);border-color:#818cf8;color:#f1f5f9;font-weight:600;}#_aqsfb-ta{width:100%;background:rgba(255,255,255,.04);border:1.5px solid rgba(255,255,255,.08);border-radius:11px;color:#e2e8f0;font-size:.9rem;padding:14px 16px;resize:vertical;min-height:110px;font-family:inherit;box-sizing:border-box;outline:none;transition:border .15s;}#_aqsfb-ta:focus{border-color:#6366f1;}#_aqsfb-footer{display:flex;gap:10px;margin-top:22px;}._aqsfb-back{flex:1;padding:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);border-radius:11px;color:#94a3b8;font-size:.9rem;font-weight:600;cursor:pointer;font-family:inherit;}._aqsfb-next{flex:2;padding:12px;background:linear-gradient(135deg,#6366f1,#a855f7);border:none;border-radius:11px;color:#fff;font-size:.9rem;font-weight:700;cursor:pointer;font-family:inherit;}';
        document.head.appendChild(style);

        var overlay=document.createElement('div');overlay.id='_aqsfb-overlay';
        overlay.innerHTML='<div id="_aqsfb-card"><div id="_aqsfb-hdr"><button id="_aqsfb-close-btn">✕</button><h2>'+_esc(fb.title||'Quick Feedback')+'</h2><p>Help us improve your experience</p><div id="_aqsfb-pbar"><div id="_aqsfb-pfill"></div></div></div><div id="_aqsfb-body"></div></div>';
        document.body.appendChild(overlay);

        function dismiss(){['_aqsfb-overlay','_aqsfb-style'].forEach(function(id){var e=document.getElementById(id);if(e)e.remove();});}
        overlay.querySelector('#_aqsfb-close-btn').addEventListener('click',function(){markSeen(fb.id);dismiss();});

        function render(){
            var q=fb.questions[current];
            var body=overlay.querySelector('#_aqsfb-body');
            overlay.querySelector('#_aqsfb-pfill').style.width=Math.round((current/total)*100)+'%';
            var optHtml='';
            if(q.type==='options'&&Array.isArray(q.options)){
                q.options.forEach(function(opt,i){var l=String.fromCharCode(65+i),sel=answers[current]===opt?' selected':'';optHtml+='<button class="_aqsfb-opt'+sel+'" data-val="'+_esc(opt)+'">'+l+'. '+_esc(opt)+'</button>';});
            } else {
                optHtml='<textarea id="_aqsfb-ta" placeholder="Type your answer here…">'+_esc(answers[current]||'')+'</textarea>';
            }
            var isLast=current===total-1;
            body.innerHTML='<div id="_aqsfb-step">Question '+(current+1)+' of '+total+'</div><div id="_aqsfb-question">'+_esc(q.text)+'</div>'+optHtml+'<div id="_aqsfb-footer">'+(current>0?'<button class="_aqsfb-back">← Back</button>':'')+'<button class="_aqsfb-next">'+(isLast?'✅ Submit':'Next →')+'</button></div>';
            body.querySelectorAll('._aqsfb-opt').forEach(function(btn){btn.addEventListener('click',function(){body.querySelectorAll('._aqsfb-opt').forEach(function(b){b.classList.remove('selected');});btn.classList.add('selected');answers[current]=btn.dataset.val;});});
            var back=body.querySelector('._aqsfb-back');if(back)back.addEventListener('click',function(){current--;render();});
            body.querySelector('._aqsfb-next').addEventListener('click',function(){var ta=body.querySelector('#_aqsfb-ta');if(ta)answers[current]=ta.value.trim();isLast?submit():++current&&render();});
        }

        async function submit(){
            overlay.querySelector('#_aqsfb-pfill').style.width='100%';
            var u=window._aqsFirebaseUser;
            if(window._aqsFS)await window._aqsFS.add(COL_RESP+fb.id,{feedbackId:fb.id,feedbackTitle:fb.title||'',answers:answers,submittedAt:Date.now(),uid:(u&&u.uid)||'anonymous',userName:(u&&(u.displayName||u.email))||'Anonymous'});
            markSeen(fb.id);
            overlay.querySelector('#_aqsfb-body').innerHTML='<div style="padding:40px 0;text-align:center;"><span style="font-size:3.5rem;display:block;margin-bottom:16px;">🎉</span><h3 style="color:#f1f5f9;font-size:1.2rem;margin:0 0 10px;">Thank you for your feedback!</h3><p style="color:#94a3b8;font-size:.88rem;margin:0 0 24px;">Your response has been recorded. We really appreciate it!</p><button onclick="[\'_aqsfb-overlay\',\'_aqsfb-style\'].forEach(function(i){var e=document.getElementById(i);if(e)e.remove();});" style="padding:12px 32px;background:linear-gradient(135deg,#6366f1,#a855f7);border:none;border-radius:11px;color:#fff;font-weight:700;font-size:.9rem;cursor:pointer;font-family:inherit;">Close</button></div>';
        }
        render();
    }

    async function init(){
        var fb=await getActive();
        if(!fb||hasSeen(fb.id))return;
        setTimeout(function(){showFeedback(fb);},30000);
    }
    document.addEventListener('aqs:firebase:ready',init,{once:true});
})();
