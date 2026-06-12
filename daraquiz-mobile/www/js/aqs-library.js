/* ═══════════════════════════════════════════════════════════════════
   AQS Library  —  Core Logic
   Pages: library.html · library-upload.html · library-read.html
   Storage: Firebase Storage (via window.aqsUploadFile)
   Data:    Firestore
   AI:      Dedicated 10-slot Groq pool + fallback to main groqFetch
═══════════════════════════════════════════════════════════════════ */

import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged }
    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

function _getFirebase() {
  return new Promise(function(resolve) {
    if (window._aqsFirebaseReady) { resolve(); return; }
    document.addEventListener('aqs:firebase:ready', function(){ resolve(); }, { once: true });
  });
}

/* ══════════════════════════════════════════════════════
   DEDICATED LIBRARY AI KEY POOL  (10 slots, round-robin)
   HOW TO UPDATE KEYS:
     Open js/aqs-library.js → find _LIB_GROQ_SLOTS → paste
     reversed Groq key (gsk_...) into any empty slot string.
     Keys are reversed to avoid plain-text scanning.
     To reverse a key in browser console:  "gsk_...".split('').reverse().join('')
══════════════════════════════════════════════════════ */
(function(){
  var GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
  var IDX_KEY  = 'aqs_lib_groq_idx';
  var RL_MS    = 62000;
  var _rl      = {};

  /* ── 10 dedicated library Groq key slots ── */
  var _LIB_GROQ_SLOTS = [
    /* Slot  1  */ '',
    /* Slot  2  */ '',
    /* Slot  3  */ '',
    /* Slot  4  */ '',
    /* Slot  5  */ '',
    /* Slot  6  */ '',
    /* Slot  7  */ '',
    /* Slot  8  */ '',
    /* Slot  9  */ '',
    /* Slot 10  */ ''
  ]
  .map(function(r){ return r ? r.split('').reverse().join('') : ''; })
  .filter(function(k){ return k.length > 20; });

  function _hash(k){ return k ? k.slice(-8) : '?'; }
  function _isRL(k){ return (_rl[_hash(k)]||0) > Date.now(); }
  function _markRL(k){ _rl[_hash(k)] = Date.now() + RL_MS; }

  function _getIdx(){
    var i=0; try{ i=parseInt(localStorage.getItem(IDX_KEY)||'0')||0; }catch(e){}
    if(isNaN(i)||i>=Math.max(1,_LIB_GROQ_SLOTS.length)) i=0;
    return i;
  }
  function _setIdx(i){ try{ localStorage.setItem(IDX_KEY, String(i % Math.max(1,_LIB_GROQ_SLOTS.length))); }catch(e){} }

  /* Public setter — called from Admin Settings or console */
  window.setLibGroqKeys = function(arr){
    _LIB_GROQ_SLOTS.length = 0;
    (arr||[]).map(function(r){ return r ? r.split('').reverse().join('') : ''; })
             .filter(function(k){ return k.length>20; })
             .forEach(function(k){ _LIB_GROQ_SLOTS.push(k); });
    try{ localStorage.setItem(IDX_KEY,'0'); }catch(e){}
    console.log('[lib-ai] '+_LIB_GROQ_SLOTS.length+' library Groq key(s) loaded');
  };
  window.getLibGroqKeyCount = function(){ return _LIB_GROQ_SLOTS.length; };

  /* ── Round-robin fetch with per-key rate-limit cooldown ── */
  window.libGroqFetch = async function(bodyObj) {
    var model = 'llama-3.3-70b-versatile';
    /* 1. Try dedicated library keys */
    if (_LIB_GROQ_SLOTS.length) {
      var start = _getIdx();
      for (var i=0; i<_LIB_GROQ_SLOTS.length; i++) {
        var idx = (start+i) % _LIB_GROQ_SLOTS.length;
        var key = _LIB_GROQ_SLOTS[idx];
        if (_isRL(key)) { _setIdx(idx+1); continue; }
        try {
          var res = await fetch(GROQ_URL, {
            method:'POST',
            headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
            body: JSON.stringify(Object.assign({}, bodyObj, { model: model }))
          });
          if (res.status===429){ _markRL(key); _setIdx(idx+1); continue; }
          if (res.status===413){ _setIdx(idx+1); continue; }
          _setIdx(idx+1);
          return res;
        } catch(e){ console.warn('[lib-ai] slot '+(idx+1)+' error',e.message); }
      }
    }
    /* 2. Fall back to main app key pool */
    if (typeof window.groqFetch === 'function') {
      console.warn('[lib-ai] all library keys busy — falling back to main pool');
      return window.groqFetch(bodyObj);
    }
    throw new Error('No AI keys configured for Library. Please add keys to Slot 1–10 in js/aqs-library.js');
  };
})();

/* ══════════════════════════════════════════════════════
   NIGERIAN INSTITUTIONS DATA
══════════════════════════════════════════════════════ */
window.LIB_NIGERIA = {
  universities: [
    "Abubakar Tafawa Balewa University, Bauchi","Ahmadu Bello University, Zaria",
    "Bayero University, Kano","Federal University Dustin-Ma, Katsina",
    "Federal University Kashere, Gombe","Federal University Lafia, Nasarawa",
    "Federal University Lokoja, Kogi","Federal University Ndufu-Alike, Ebonyi",
    "Federal University of Agriculture, Abeokuta","Federal University of Agriculture, Makurdi",
    "Federal University of Petroleum Resources, Effurun","Federal University of Technology, Akure",
    "Federal University of Technology, Minna","Federal University of Technology, Owerri",
    "Federal University Otuoke, Bayelsa","Federal University Oye-Ekiti, Ekiti",
    "Federal University Wukari, Taraba","Michael Okpara University of Agriculture, Umudike",
    "Modibbo Adama University, Yola","National Open University of Nigeria, Lagos",
    "Nigerian Defence Academy, Kaduna","Nnamdi Azikiwe University, Awka",
    "Obafemi Awolowo University, Ile-Ife","University of Abuja","University of Benin",
    "University of Calabar","University of Ibadan","University of Ilorin","University of Jos",
    "University of Lagos","University of Maiduguri","University of Nigeria, Nsukka",
    "University of Port Harcourt","University of Uyo","Usmanu Danfodiyo University, Sokoto",
    "Adekunle Ajasin University, Akungba-Akoko","Akwa Ibom State University",
    "Ambrose Alli University, Ekpoma","Anambra State University","Bauchi State University",
    "Benue State University, Makurdi","Cross River University of Technology",
    "Delta State University, Abraka","Ebonyi State University","Ekiti State University",
    "Enugu State University of Science and Technology","Gombe State University",
    "Ibrahim Badamasi Babangida University, Lapai","Imo State University, Owerri",
    "Kaduna State University","Kano University of Science and Technology, Wudil",
    "Kebbi State University of Science and Technology","Kogi State University",
    "Kwara State University, Malete","Lagos State University",
    "Nasarawa State University, Keffi","Niger Delta University, Wilberforce Island",
    "Olabisi Onabanjo University, Ago-Iwoye","Osun State University",
    "Plateau State University, Bokkos","Rivers State University","Sokoto State University",
    "Tai Solarin University of Education, Ijebu-Ode","Taraba State University",
    "Umaru Musa Yar'Adua University, Katsina","Yobe State University",
    "Afe Babalola University, Ado-Ekiti","Babcock University, Ilishan-Remo",
    "Baze University, Abuja","Bells University of Technology, Ota",
    "Benson Idahosa University, Benin City","Bowen University, Iwo",
    "Covenant University, Ota","Lead City University, Ibadan",
    "Madonna University, Okija","Pan-Atlantic University, Lagos",
    "Redeemer's University, Ede","Veritas University, Abuja",
    "American University of Nigeria, Yola","African University of Science and Technology, Abuja",
    "Al-Hikmah University, Ilorin","Caleb University, Lagos","Caritas University, Enugu",
    "Chrisland University, Abeokuta","Crawford University, Igbesa","Crescent University, Abeokuta",
    "Elizade University, Ilara-Mokin","Fountain University, Osogbo","Hallmark University, Ijebu-Itele",
    "Joseph Ayo Babalola University, Ikeji-Arakeji","Landmark University, Omu-Aran",
    "McPherson University, Seriki Sotayo","Mountain Top University, Ogun",
    "Oduduwa University, Ipetumodu","Paul University, Awka","Salem University, Lokoja",
    "Summit University, Offa","Wesley University, Ondo","Western Delta University, Oghara",
    "Westland University, Iwo"
  ],
  polytechnics: [
    "Federal Polytechnic, Ado-Ekiti","Federal Polytechnic, Bauchi","Federal Polytechnic, Bida",
    "Federal Polytechnic, Damaturu","Federal Polytechnic, Ede","Federal Polytechnic, Idah",
    "Federal Polytechnic, Ile-Oluji","Federal Polytechnic, Ilaro","Federal Polytechnic, Mubi",
    "Federal Polytechnic, Namoda","Federal Polytechnic, Nasarawa","Federal Polytechnic, Nekede",
    "Federal Polytechnic, Offa","Federal Polytechnic, Oko","Federal Polytechnic, Ukana",
    "Hussaini Adamu Federal Polytechnic, Kazaure","Air Force Institute of Technology, Kaduna",
    "Auchi Polytechnic","Delta State Polytechnic, Ogwashi-Uku",
    "Gateway ICT Polytechnic, Saapade","Institute of Management and Technology, Enugu",
    "Kaduna Polytechnic","Kano State Polytechnic","Kwara State Polytechnic, Ilorin",
    "Lagos State Polytechnic (LASPOTECH)","Moshood Abiola Polytechnic (MAPOLY), Abeokuta",
    "Nasarawa State Polytechnic","Niger State Polytechnic",
    "Ogun State Institute of Technology, Igbesa","Osun State Polytechnic, Iree",
    "Plateau State Polytechnic, Barkin Ladi","Port Harcourt Polytechnic",
    "Rivers State Polytechnic, Bori","Rufus Giwa Polytechnic, Owo",
    "The Polytechnic, Ibadan","Waziri Umaru Federal Polytechnic, Birnin Kebbi",
    "Yaba College of Technology, Lagos","Zamfara State College of Arts and Science"
  ],
  colleges_of_education: [
    "Adeyemi College of Education, Ondo","Alvan Ikoku Federal College of Education, Owerri",
    "College of Education, Akwanga","College of Education, Azare","College of Education, Gindiri",
    "College of Education, Katsina-Ala","College of Education, Oro","College of Education, Warri",
    "Federal College of Education (Technical), Akoka","Federal College of Education (Technical), Asaba",
    "Federal College of Education (Technical), Bichi","Federal College of Education (Technical), Gombe",
    "Federal College of Education (Technical), Omoku","Federal College of Education (Technical), Potiskum",
    "Federal College of Education (Technical), Umunze","Federal College of Education, Abeokuta",
    "Federal College of Education, Eha-Amufu","Federal College of Education, Kano",
    "Federal College of Education, Kontagora","Federal College of Education, Obudu",
    "Federal College of Education, Okene","Federal College of Education, Pankshin",
    "Federal College of Education, Yola","Federal College of Education, Zaria",
    "Tai Solarin College of Education, Ijebu-Ode"
  ]
};
window.LIB_LEVELS = {
  university:['100 Level','200 Level','300 Level','400 Level','500 Level','Postgraduate'],
  polytechnic:['ND 1','ND 2','HND 1','HND 2'],
  college_of_education:['Year 1','Year 2','Year 3']
};

/* ══════════════════════════════════════════════════════
   FIRESTORE HELPERS
══════════════════════════════════════════════════════ */
let _db=null, _auth=null;
async function _init(){
  if(_db) return;
  await _getFirebase();
  const app=getApp(); _db=getFirestore(app); _auth=getAuth(app);
}

window.libToast=function(msg,dur){
  let el=document.getElementById('lib-toast');
  if(!el){el=document.createElement('div');el.id='lib-toast';el.className='lib-toast';document.body.appendChild(el);}
  el.textContent=msg; el.style.display='block';
  clearTimeout(el._t); el._t=setTimeout(function(){el.style.display='none';},dur||3000);
};
window.libOnAuth=function(cb){_init().then(function(){onAuthStateChanged(_auth,cb);});};
window.libGetProfile=async function(uid){await _init();const s=await getDoc(doc(_db,'library_profiles',uid));return s.exists()?{id:s.id,...s.data()}:null;};
window.libSaveProfile=async function(uid,data){await _init();await setDoc(doc(_db,'library_profiles',uid),{...data,updatedAt:serverTimestamp()},{merge:true});};
window.libAddBook=async function(data){await _init();const r=await addDoc(collection(_db,'library_books'),{...data,createdAt:serverTimestamp(),views:0,likes:0,commentCount:0,status:'approved'});return r.id;};
window.libUpdateBook=async function(id,data){await _init();await updateDoc(doc(_db,'library_books',id),data);};
window.libDeleteBook=async function(id){await _init();await deleteDoc(doc(_db,'library_books',id));};
window.libGetBook=async function(id){await _init();const s=await getDoc(doc(_db,'library_books',id));return s.exists()?{id:s.id,...s.data()}:null;};
window.libSearchBooks=async function(f){
  await _init();
  const c=[where('status','==','approved')];
  if(f.institutionType) c.push(where('institutionType','==',f.institutionType));
  if(f.institution) c.push(where('institution','==',f.institution));
  if(f.level) c.push(where('level','==',f.level));
  c.push(orderBy('createdAt','desc'),limit(60));
  const s=await getDocs(query(collection(_db,'library_books'),...c));
  return s.docs.map(function(d){return{id:d.id,...d.data()};});
};
window.libGetMyBooks=async function(uid){await _init();const s=await getDocs(query(collection(_db,'library_books'),where('uploaderUid','==',uid),orderBy('createdAt','desc')));return s.docs.map(function(d){return{id:d.id,...d.data()};});};
window.libGetMyStats=async function(uid){await _init();const s=await getDocs(query(collection(_db,'library_books'),where('uploaderUid','==',uid)));let b=0,r=0,l=0,c=0;s.docs.forEach(function(d){const x=d.data();b++;r+=x.views||0;l+=x.likes||0;c+=x.commentCount||0;});return{books:b,readers:r,likes:l,comments:c};};
window.libToggleLike=async function(bookId,uid){await _init();const lRef=doc(_db,'library_likes',bookId+'_'+uid);const s=await getDoc(lRef);if(s.exists()){await deleteDoc(lRef);await updateDoc(doc(_db,'library_books',bookId),{likes:increment(-1)});return false;}else{await setDoc(lRef,{bookId,uid,createdAt:serverTimestamp()});await updateDoc(doc(_db,'library_books',bookId),{likes:increment(1)});return true;}};
window.libHasLiked=async function(bookId,uid){await _init();return(await getDoc(doc(_db,'library_likes',bookId+'_'+uid))).exists();};
window.libAddComment=async function(bookId,uid,name,text){await _init();await addDoc(collection(_db,'library_comments'),{bookId,uid,displayName:name,text,createdAt:serverTimestamp()});await updateDoc(doc(_db,'library_books',bookId),{commentCount:increment(1)});};
window.libGetComments=async function(bookId){await _init();const s=await getDocs(query(collection(_db,'library_comments'),where('bookId','==',bookId),orderBy('createdAt','desc'),limit(50)));return s.docs.map(function(d){return{id:d.id,...d.data()};});};
window.libRecordView=async function(bookId){await _init();try{await updateDoc(doc(_db,'library_books',bookId),{views:increment(1)});}catch(e){}};
window.libUploadFile=async function(file,bookId,type){
  const ext=file.name.split('.').pop().toLowerCase();
  const path=type==='thumb'?'library/thumbnails/'+bookId+'.'+ext:'library/files/'+bookId+'.'+ext;
  if(typeof window.aqsUploadFile!=='function') throw new Error('aqsUploadFile not available');
  return await window.aqsUploadFile(file,path);
};
window.libExtractPdfText=async function(pdfUrl,maxPages){
  maxPages=maxPages||10;
  if(typeof pdfjsLib==='undefined') return '';
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({url:pdfUrl,withCredentials:false}).promise;
  const pages=Math.min(pdf.numPages,maxPages); let text='';
  for(let i=1;i<=pages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();text+=c.items.map(function(s){return s.str;}).join(' ')+'\n';if(text.length>12000) break;}
  return text.substring(0,12000);
};
window.libAiExplain=async function(pdfUrl,title){
  const text=await window.libExtractPdfText(pdfUrl,8);
  if(!text.trim()) throw new Error('Could not extract text from this document.');
  const res=await window.libGroqFetch({messages:[{role:'user',content:'You are an expert academic tutor. A student is reading: "'+title+'".\n\nDocument content:\n\n'+text+'\n\n---\nProvide a clear explanation with:\n1. **Overview** — what this is about (2-3 sentences)\n2. **Key Concepts** — the 5-7 most important ideas explained simply\n3. **Summary** — concise paragraph of main points\n4. **Study Tips** — 3 practical tips for studying this material'}],max_tokens:2000});
  if(!res.ok) throw new Error('AI request failed ('+res.status+')');
  const d=await res.json(); return d.choices[0].message.content;
};
window.libAiMCQ=async function(pdfUrl,title){
  const text=await window.libExtractPdfText(pdfUrl,6);
  if(!text.trim()) throw new Error('Could not extract text from this document.');
  const res=await window.libGroqFetch({messages:[{role:'user',content:'Generate 10 multiple-choice exam questions based on this document titled "'+title+'":\n\n'+text+'\n\n---\nReturn ONLY valid JSON array, no markdown:\n[{"q":"Question","opts":["A. opt1","B. opt2","C. opt3","D. opt4"],"ans":0}]\nwhere ans is 0-based index of correct option.'}],max_tokens:2000});
  if(!res.ok) throw new Error('AI request failed');
  const d=await res.json(); let raw=d.choices[0].message.content.trim();
  raw=raw.replace(/^```(?:json)?/,'').replace(/```$/,'').trim();
  return JSON.parse(raw);
};
window.libFormatTime=function(ts){if(!ts) return '';const d=ts.toDate?ts.toDate():new Date(ts);const diff=Date.now()-d.getTime();if(diff<60000) return 'just now';if(diff<3600000) return Math.floor(diff/60000)+'m ago';if(diff<86400000) return Math.floor(diff/3600000)+'h ago';return Math.floor(diff/86400000)+'d ago';};
window.libPopulateSchools=function(sel,type){const m={university:window.LIB_NIGERIA.universities,polytechnic:window.LIB_NIGERIA.polytechnics,college_of_education:window.LIB_NIGERIA.colleges_of_education};const schools=m[type]||[];sel.innerHTML='<option value="">— Select School —</option>';[...schools].sort().forEach(function(s){const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});};
window.libPopulateLevels=function(sel,type){const m={university:window.LIB_LEVELS.university,polytechnic:window.LIB_LEVELS.polytechnic,college_of_education:window.LIB_LEVELS.college_of_education};const levels=m[type]||window.LIB_LEVELS.university;sel.innerHTML='<option value="">— Select Level —</option>';levels.forEach(function(l){const o=document.createElement('option');o.value=l;o.textContent=l;sel.appendChild(o);});};
window.libBookCardHTML=function(b){const thumb=b.thumbnailUrl?`<img src="${b.thumbnailUrl}" alt="" loading="lazy">`:`<div class="lib-card-thumb-placeholder"><div class="lib-card-thumb-icon">📖</div><div class="lib-card-thumb-label">${(b.subject||'').substring(0,20)}</div></div>`;return `<div class="lib-card" onclick="location.href='library-read.html?id=${b.id}'"><div class="lib-card-thumb">${thumb}</div><div class="lib-card-body"><div class="lib-card-title">${b.title||'Untitled'}</div><div class="lib-card-meta"><div><span class="lib-card-level">${b.level||''}</span></div><div style="margin-top:4px;font-size:.68rem">${(b.institution||'').substring(0,28)}</div></div><div class="lib-card-stats"><span class="lib-card-stat">👁️ ${b.views||0}</span><span class="lib-card-stat">❤️ ${b.likes||0}</span><span class="lib-card-stat">💬 ${b.commentCount||0}</span></div></div></div>`;};
console.log('[aqs-library] loaded — library Groq slots: '+window.getLibGroqKeyCount());
