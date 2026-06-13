/* aqs-feedback-admin.js — Admin Questionnaire Manager v1.252 */
(function(){
    'use strict';
    var COL_FB='aqsFeedbacks',COL_RESP='aqsFeedbackResponses_',COL_SYS='aqsSystem';
    var _editId=null,_questions=[],_allFBs=[];
    function _esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

    function mountTab(cid){
        var el=document.getElementById(cid);if(!el)return;
        el.innerHTML=
        '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;margin-bottom:20px;">'+
          '<div><h3 style="margin:0 0 4px;color:#f1f5f9;font-size:1.05rem;font-weight:800;">📋 Feedback & Questionnaires</h3>'+
          '<p style="margin:0;font-size:.8rem;color:#64748b;">Create questions that pop up for all users — no app update needed.</p></div>'+
          '<button id="_fbadm-new-btn" style="background:linear-gradient(135deg,#6366f1,#a855f7);border:none;border-radius:12px;color:#fff;font-weight:700;font-size:.88rem;padding:11px 22px;cursor:pointer;">+ Create New</button></div>'+
        '<div id="_fbadm-list" style="display:flex;flex-direction:column;gap:12px;"><div style="color:#475569;font-size:.85rem;text-align:center;padding:24px;">Loading…</div></div>'+
        /* Create/Edit Modal */
        '<div id="_fbadm-modal" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(4,4,16,.93);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:16px;box-sizing:border-box;">'+
          '<div style="background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:22px;max-width:640px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 40px 90px rgba(0,0,0,.7);">'+
            '<div style="padding:24px 28px 0;display:flex;align-items:center;justify-content:space-between;">'+
              '<h3 id="_fbadm-mtitle" style="margin:0;color:#f1f5f9;font-size:1.1rem;font-weight:800;">Create Questionnaire</h3>'+
              '<button id="_fbadm-mclose" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#94a3b8;width:32px;height:32px;border-radius:50%;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button></div>'+
            '<div style="padding:20px 28px 28px;">'+
              '<label style="display:block;color:#94a3b8;font-size:.78rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px;">Feedback Title</label>'+
              '<input id="_fbadm-title" placeholder="e.g. Monthly User Experience Survey" style="width:100%;background:rgba(255,255,255,.05);border:1.5px solid rgba(255,255,255,.09);border-radius:10px;color:#f1f5f9;font-size:.9rem;padding:11px 14px;box-sizing:border-box;margin-bottom:20px;outline:none;font-family:inherit;">'+
              '<div id="_fbadm-ql"></div>'+
              '<button id="_fbadm-addq" style="width:100%;padding:11px;background:rgba(99,102,241,.1);border:1.5px dashed rgba(99,102,241,.3);border-radius:10px;color:#818cf8;font-size:.88rem;font-weight:600;cursor:pointer;margin-bottom:20px;font-family:inherit;">+ Add Question (max 10)</button>'+
              '<div style="display:flex;gap:10px;flex-wrap:wrap;">'+
                '<button id="_fbadm-draft" style="flex:1;min-width:120px;padding:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);border-radius:11px;color:#94a3b8;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;">💾 Save Draft</button>'+
                '<button id="_fbadm-activate-save" style="flex:2;min-width:160px;padding:12px;background:linear-gradient(135deg,#059669,#10b981);border:none;border-radius:11px;color:#fff;font-size:.88rem;font-weight:700;cursor:pointer;font-family:inherit;">🚀 Save & Activate</button>'+
              '</div></div></div></div>'+
        /* Responses Modal */
        '<div id="_fbadm-rmodal" style="display:none;position:fixed;inset:0;z-index:99999;background:rgba(4,4,16,.93);backdrop-filter:blur(8px);align-items:center;justify-content:center;padding:16px;box-sizing:border-box;">'+
          '<div style="background:#0f172a;border:1px solid rgba(255,255,255,.1);border-radius:22px;max-width:720px;width:100%;max-height:90vh;overflow-y:auto;box-shadow:0 40px 90px rgba(0,0,0,.7);">'+
            '<div style="padding:24px 28px 0;display:flex;align-items:center;justify-content:space-between;">'+
              '<h3 id="_fbadm-rtitle" style="margin:0;color:#f1f5f9;font-size:1.05rem;font-weight:800;">Responses</h3>'+
              '<button onclick="document.getElementById(\'_fbadm-rmodal\').style.display=\'none\';" style="background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#94a3b8;width:32px;height:32px;border-radius:50%;font-size:1rem;cursor:pointer;display:flex;align-items:center;justify-content:center;">✕</button></div>'+
            '<div id="_fbadm-rbody" style="padding:20px 28px 28px;"></div></div></div>';

        el.querySelector('#_fbadm-new-btn').addEventListener('click',function(){openModal(null);});
        el.querySelector('#_fbadm-mclose').addEventListener('click',function(){document.getElementById('_fbadm-modal').style.display='none';});
        el.querySelector('#_fbadm-addq').addEventListener('click',function(){if(_questions.length>=10){alert('Maximum 10 questions.');return;}_questions.push({text:'',type:'options',options:['','','','']});renderQ();});
        el.querySelector('#_fbadm-draft').addEventListener('click',function(){save(false);});
        el.querySelector('#_fbadm-activate-save').addEventListener('click',function(){save(true);});
        loadList();
    }

    function renderQ(){
        var c=document.getElementById('_fbadm-ql');if(!c)return;c.innerHTML='';
        _questions.forEach(function(q,i){
            var div=document.createElement('div');
            div.style.cssText='background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:16px;margin-bottom:12px;';
            var opts=q.type==='options'?'<div>'+(q.options||['','']).map(function(o,j){return'<input placeholder="Option '+String.fromCharCode(65+j)+'" value="'+_esc(o)+'" data-qi="'+i+'" data-oi="'+j+'" class="_fbadm-oi" style="width:100%;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px;color:#e2e8f0;padding:8px 12px;margin-bottom:6px;box-sizing:border-box;font-family:inherit;outline:none;">';}).join('')+'<button data-qi="'+i+'" class="_fbadm-ao" style="background:none;border:1px dashed rgba(99,102,241,.3);border-radius:7px;color:#818cf8;font-size:.78rem;padding:5px 12px;cursor:pointer;font-family:inherit;">+ Add Option</button></div>':'';
            div.innerHTML='<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;"><span style="background:rgba(99,102,241,.15);color:#818cf8;font-size:.72rem;font-weight:800;padding:4px 10px;border-radius:20px;">Q'+(i+1)+'</span><input class="_fbadm-qt" data-qi="'+i+'" value="'+_esc(q.text||'')+'" placeholder="Enter your question…" style="flex:1;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);border-radius:8px;color:#f1f5f9;padding:8px 12px;font-family:inherit;outline:none;font-size:.88rem;"><select class="_fbadm-qtype" data-qi="'+i+'" style="background:#1e293b;border:1px solid rgba(255,255,255,.1);border-radius:8px;color:#94a3b8;padding:8px 10px;font-family:inherit;cursor:pointer;font-size:.82rem;"><option value="options"'+(q.type==='options'?' selected':'')+'>A-D Options</option><option value="text"'+(q.type==='text'?' selected':'')+'>Free Text</option></select><button class="_fbadm-dq" data-qi="'+i+'" style="background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.2);color:#f87171;width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:.9rem;">✕</button></div>'+opts;
            c.appendChild(div);
        });
        c.querySelectorAll('._fbadm-qt').forEach(function(inp){inp.addEventListener('input',function(){_questions[+inp.dataset.qi].text=inp.value;});});
        c.querySelectorAll('._fbadm-qtype').forEach(function(sel){sel.addEventListener('change',function(){_questions[+sel.dataset.qi].type=sel.value;if(sel.value==='options'&&!_questions[+sel.dataset.qi].options)_questions[+sel.dataset.qi].options=['','','',''];renderQ();});});
        c.querySelectorAll('._fbadm-dq').forEach(function(btn){btn.addEventListener('click',function(){_questions.splice(+btn.dataset.qi,1);renderQ();});});
        c.querySelectorAll('._fbadm-oi').forEach(function(inp){inp.addEventListener('input',function(){_questions[+inp.dataset.qi].options[+inp.dataset.oi]=inp.value;});});
        c.querySelectorAll('._fbadm-ao').forEach(function(btn){btn.addEventListener('click',function(){var q=_questions[+btn.dataset.qi];if((q.options||[]).length<4){q.options=q.options||[];q.options.push('');renderQ();}});});
    }

    function openModal(fb){
        _editId=fb?fb.id:null;
        _questions=fb?JSON.parse(JSON.stringify(fb.questions||[])):[{text:'',type:'options',options:['','','','']}];
        document.getElementById('_fbadm-mtitle').textContent=fb?'Edit Questionnaire':'Create Questionnaire';
        document.getElementById('_fbadm-title').value=fb?(fb.title||''):'';
        renderQ();document.getElementById('_fbadm-modal').style.display='flex';
    }

    async function save(activate){
        document.querySelectorAll('._fbadm-qt').forEach(function(i){if(_questions[+i.dataset.qi])_questions[+i.dataset.qi].text=i.value;});
        document.querySelectorAll('._fbadm-oi').forEach(function(i){if(_questions[+i.dataset.qi])_questions[+i.dataset.qi].options[+i.dataset.oi]=i.value;});
        var title=(document.getElementById('_fbadm-title').value||'').trim();
        if(!title){alert('Please enter a title.');return;}
        var qs=_questions.filter(function(q){return(q.text||'').trim();}).map(function(q){return{text:q.text.trim(),type:q.type||'text',options:(q.options||[]).filter(function(o){return(o||'').trim();})};});
        if(!qs.length){alert('Add at least one question.');return;}
        var data={title:title,questions:qs,active:!!activate,createdAt:Date.now(),updatedAt:Date.now()};
        var id;
        if(_editId&&window._aqsFS){data.id=_editId;await window._aqsFS.set(COL_FB,_editId,data);id=_editId;}
        else if(window._aqsFS){id=await window._aqsFS.add(COL_FB,data);if(id){data.id=id;await window._aqsFS.set(COL_FB,id,data);}}
        if(activate&&id&&window._aqsFS)await window._aqsFS.set(COL_SYS,'feedback',{activeId:id});
        document.getElementById('_fbadm-modal').style.display='none';
        loadList();
    }

    async function loadList(){
        var listEl=document.getElementById('_fbadm-list');if(!listEl||!window._aqsFS)return;
        listEl.innerHTML='<div style="color:#475569;font-size:.85rem;text-align:center;padding:24px;">Loading…</div>';
        var sys=await window._aqsFS.get(COL_SYS,'feedback');var activeId=sys&&sys.activeId;
        _allFBs=await window._aqsFS.getAll(COL_FB);_allFBs.sort(function(a,b){return(b.updatedAt||0)-(a.updatedAt||0);});
        if(!_allFBs.length){listEl.innerHTML='<div style="color:#475569;font-size:.85rem;text-align:center;padding:32px;">No questionnaires yet. Create one to get started.</div>';return;}
        listEl.innerHTML='';
        _allFBs.forEach(function(fb){
            var isActive=fb.id===activeId;var dt=fb.updatedAt?new Date(fb.updatedAt).toLocaleDateString():'';
            var card=document.createElement('div');
            card.style.cssText='background:'+(isActive?'rgba(5,150,105,.08)':'rgba(255,255,255,.03)')+';border:1.5px solid '+(isActive?'rgba(16,185,129,.25)':'rgba(255,255,255,.07)')+';border-radius:14px;padding:16px 20px;display:flex;align-items:center;gap:14px;flex-wrap:wrap;';
            card.innerHTML='<div style="flex:1;min-width:160px;"><div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;"><span style="font-weight:800;color:#f1f5f9;font-size:.95rem;">'+_esc(fb.title||'Untitled')+'</span>'+(isActive?'<span style="background:rgba(16,185,129,.2);border:1px solid rgba(16,185,129,.3);color:#6ee7b7;font-size:.68rem;font-weight:800;padding:2px 10px;border-radius:20px;">● ACTIVE</span>':'<span style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#475569;font-size:.68rem;padding:2px 10px;border-radius:20px;font-weight:700;">DRAFT</span>')+'</div><div style="font-size:.78rem;color:#64748b;">'+(fb.questions||[]).length+' question(s) · '+dt+'</div></div>'
            +'<div style="display:flex;gap:8px;flex-shrink:0;"><button class="_fbadm-vr" data-id="'+fb.id+'" data-title="'+_esc(fb.title||'')+'" style="background:rgba(99,102,241,.1);border:1px solid rgba(99,102,241,.2);border-radius:9px;color:#818cf8;font-size:.78rem;font-weight:700;padding:7px 14px;cursor:pointer;">👁 Responses</button>'
            +(isActive?'<button class="_fbadm-deact" style="background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.15);border-radius:9px;color:#f87171;font-size:.78rem;font-weight:700;padding:7px 14px;cursor:pointer;">⏹ Deactivate</button>':'<button class="_fbadm-act" data-id="'+fb.id+'" style="background:rgba(5,150,105,.12);border:1px solid rgba(16,185,129,.2);border-radius:9px;color:#34d399;font-size:.78rem;font-weight:700;padding:7px 14px;cursor:pointer;">▶ Activate</button>')
            +'<button class="_fbadm-edit" data-id="'+fb.id+'" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:9px;color:#94a3b8;font-size:.78rem;font-weight:700;padding:7px 14px;cursor:pointer;">✏️ Edit</button></div>';
            listEl.appendChild(card);
            card.querySelectorAll('._fbadm-act').forEach(function(btn){btn.addEventListener('click',async function(){await window._aqsFS.set(COL_SYS,'feedback',{activeId:btn.dataset.id});await window._aqsFS.set(COL_FB,btn.dataset.id,{active:true,updatedAt:Date.now()},{merge:true});loadList();});});
            card.querySelectorAll('._fbadm-deact').forEach(function(btn){btn.addEventListener('click',async function(){await window._aqsFS.set(COL_SYS,'feedback',{activeId:''});loadList();});});
            card.querySelectorAll('._fbadm-edit').forEach(function(btn){btn.addEventListener('click',function(){var f=_allFBs.find(function(x){return x.id===btn.dataset.id;});if(f)openModal(f);});});
            card.querySelectorAll('._fbadm-vr').forEach(function(btn){btn.addEventListener('click',function(){viewResp(btn.dataset.id,btn.dataset.title);});});
        });
    }

    async function viewResp(fbId,title){
        document.getElementById('_fbadm-rtitle').textContent='📊 Responses — '+(title||fbId);
        var body=document.getElementById('_fbadm-rbody');body.innerHTML='<div style="color:#475569;text-align:center;padding:24px;">Loading…</div>';
        document.getElementById('_fbadm-rmodal').style.display='flex';
        var fb=_allFBs.find(function(x){return x.id===fbId;})||{};
        var resps=window._aqsFS?await window._aqsFS.getAll(COL_RESP+fbId):[];
        resps.sort(function(a,b){return(b.submittedAt||0)-(a.submittedAt||0);});
        if(!resps.length){body.innerHTML='<div style="color:#475569;text-align:center;padding:32px;">No responses yet.</div>';return;}
        var html='<div style="color:#94a3b8;font-size:.8rem;margin-bottom:16px;">'+resps.length+' response(s)</div>';
        resps.forEach(function(r){
            var dt=r.submittedAt?new Date(r.submittedAt).toLocaleString():'';
            html+='<div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:12px;padding:14px 16px;margin-bottom:10px;"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;"><span style="font-weight:700;color:#e2e8f0;font-size:.88rem;">'+_esc(r.userName||'Anonymous')+'</span><span style="color:#64748b;font-size:.75rem;">'+_esc(dt)+'</span></div>';
            (fb.questions||[]).forEach(function(q,qi){var ans=r.answers&&r.answers[qi];html+='<div style="margin-bottom:7px;"><span style="color:#64748b;font-size:.78rem;">Q'+(qi+1)+' — '+_esc(q.text||'')+'</span><br><span style="color:#c4b5fd;font-size:.85rem;font-weight:600;">'+_esc(ans||'—')+'</span></div>';});
            html+='</div>';
        });
        body.innerHTML=html;
    }

    document.addEventListener('aqs:firebase:ready',function(){if(document.getElementById('_fbadm-container'))mountTab('_fbadm-container');},{once:true});
    window._aqsFeedbackAdmin={mount:mountTab};
})();
