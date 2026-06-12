/* ═══════════════════════════════════════════════════════════════════
   AQS Library  —  Core Logic
   Cascade: Institution Type → School → Course → Level → Books
   AI: Dedicated 10-slot Groq pool, round-robin with fallback
═══════════════════════════════════════════════════════════════════ */

import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged }
    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, increment
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

/* Cloudinary direct-upload config (no server required) */
var _CLD_CLOUD = 'du7misvms';
var _CLD_THUMB_PRESET = 'smartquiz_thumbs';
var _CLD_FILE_PRESET  = 'smartquiz_docs';

function _waitFirebase() {
  return new Promise(function(res){
    if(window._aqsFirebaseReady){ res(); return; }
    document.addEventListener('aqs:firebase:ready', function(){ res(); }, { once:true });
  });
}

/* ══════════════════════════════════════════════════════
   10-SLOT LIBRARY GROQ KEY POOL (round-robin + fallback)
   Paste reversed key (gsk_… reversed) into each slot.
   To reverse in console: "gsk_yourkey".split('').reverse().join('')
══════════════════════════════════════════════════════ */
(function(){
  var URL_  = 'https://api.groq.com/openai/v1/chat/completions';
  var IDX   = 'aqs_lib_groq_idx';
  var RL_MS = 62000;
  var _rl   = {};

  var _SLOTS = [
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
  ].map(function(r){ return r ? r.split('').reverse().join('') : ''; })
   .filter(function(k){ return k.length > 20; });

  function _h(k){ return k ? k.slice(-8) : '?'; }
  function _isRL(k){ return (_rl[_h(k)]||0) > Date.now(); }
  function _markRL(k){ _rl[_h(k)] = Date.now() + RL_MS; }
  function _idx(){ var i=0; try{ i=parseInt(localStorage.getItem(IDX)||'0')||0; }catch(e){} return (isNaN(i)||i>=Math.max(1,_SLOTS.length))?0:i; }
  function _setIdx(i){ try{ localStorage.setItem(IDX, String(i%Math.max(1,_SLOTS.length))); }catch(e){} }

  window.setLibGroqKeys = function(arr){
    _SLOTS.length=0;
    (arr||[]).map(function(r){ return r?r.split('').reverse().join(''):'' })
             .filter(function(k){ return k.length>20 })
             .forEach(function(k){ _SLOTS.push(k); });
    try{ localStorage.setItem(IDX,'0'); }catch(e){}
  };
  window.getLibGroqKeyCount = function(){ return _SLOTS.length; };

  window.libGroqFetch = async function(bodyObj){
    var model = 'llama-3.3-70b-versatile';
    if(_SLOTS.length){
      var start=_idx();
      for(var i=0;i<_SLOTS.length;i++){
        var idx=(start+i)%_SLOTS.length, key=_SLOTS[idx];
        if(_isRL(key)){ _setIdx(idx+1); continue; }
        try{
          var res=await fetch(URL_,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},body:JSON.stringify(Object.assign({},bodyObj,{model:model}))});
          if(res.status===429){ _markRL(key); _setIdx(idx+1); continue; }
          if(res.status===413){ _setIdx(idx+1); continue; }
          _setIdx(idx+1); return res;
        }catch(e){ console.warn('[lib-ai] slot '+(idx+1)+' err',e.message); }
      }
    }
    if(typeof window.groqFetch==='function'){ console.warn('[lib-ai] falling back to main pool'); return window.groqFetch(bodyObj); }
    throw new Error('No AI keys configured. Add keys to Slots 1–10 in js/aqs-library.js');
  };
})();

/* ══════════════════════════════════════════════════════
   NIGERIAN INSTITUTIONS — Schools List
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
    "Afe Babalola University, Ado-Ekiti","African University of Science and Technology, Abuja",
    "Al-Hikmah University, Ilorin","American University of Nigeria, Yola",
    "Babcock University, Ilishan-Remo","Baze University, Abuja",
    "Bells University of Technology, Ota","Benson Idahosa University, Benin City",
    "Bowen University, Iwo","Caleb University, Lagos","Caritas University, Enugu",
    "Chrisland University, Abeokuta","Covenant University, Ota","Crawford University, Igbesa",
    "Crescent University, Abeokuta","Elizade University, Ilara-Mokin",
    "Fountain University, Osogbo","Hallmark University, Ijebu-Itele",
    "Joseph Ayo Babalola University, Ikeji-Arakeji","Landmark University, Omu-Aran",
    "Lead City University, Ibadan","Madonna University, Okija",
    "McPherson University, Seriki Sotayo","Mountain Top University, Ogun",
    "Oduduwa University, Ipetumodu","Pan-Atlantic University, Lagos",
    "Paul University, Awka","Redeemer's University, Ede","Salem University, Lokoja",
    "Summit University, Offa","Veritas University, Abuja","Wesley University, Ondo",
    "Western Delta University, Oghara","Westland University, Iwo"
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

/* ══════════════════════════════════════════════════════
   COURSES PER INSTITUTION TYPE
   All common courses/departments taught in Nigerian institutions
══════════════════════════════════════════════════════ */
window.LIB_COURSES = {
  university: [
    /* Engineering & Technology */
    "Aerospace Engineering","Agricultural Engineering","Chemical Engineering",
    "Civil Engineering","Computer Engineering","Electrical/Electronic Engineering",
    "Marine Engineering","Mechanical Engineering","Metallurgical Engineering",
    "Mining Engineering","Petroleum Engineering","Production Engineering",
    "Systems Engineering","Survey and Geoinformatics",
    /* Computing & Mathematics */
    "Computer Science","Cyber Security","Data Science","Information Technology",
    "Industrial Mathematics","Mathematics","Pure and Applied Mathematics","Statistics",
    "Software Engineering",
    /* Natural Sciences */
    "Biochemistry","Botany","Chemistry","Environmental Biology","Genetics",
    "Geology","Meteorology and Climate Science","Microbiology","Physics","Physics with Electronics",
    "Plant Biology","Zoology",
    /* Medicine & Health Sciences */
    "Dentistry","Medical Laboratory Science","Medical Rehabilitation",
    "Medicine and Surgery","Nursing Science","Pharmacy","Physiotherapy","Radiography",
    /* Agriculture & Veterinary */
    "Agricultural Economics and Extension","Animal Science","Aquaculture and Fisheries",
    "Crop Science","Food Science and Technology","Horticulture",
    "Soil Science and Land Management","Veterinary Medicine",
    /* Environmental Sciences */
    "Architecture","Building","Estate Management","Quantity Surveying",
    "Urban and Regional Planning",
    /* Law */
    "Law (LLB)",
    /* Business & Management */
    "Accounting","Actuarial Science","Banking and Finance","Business Administration",
    "Entrepreneurship and Innovation","Finance","Hotel and Tourism Management",
    "Insurance","Marketing","Public Administration",
    /* Social Sciences */
    "Criminology and Security Studies","Development Studies","Economics",
    "Industrial Relations and Personnel Management","International Relations",
    "Mass Communication","Political Science","Psychology","Sociology","Social Work",
    /* Arts & Humanities */
    "Arabic and Islamic Studies","Christian Religious Studies",
    "Communication Arts","English","Fine Arts","French","Geography",
    "History and International Studies","Linguistics","Mass Communication",
    "Music","Philosophy","Religious Studies","Theatre Arts",
    /* Education */
    "Adult Education","Early Childhood Education",
    "Education and Biology","Education and Chemistry","Education and Computer Science",
    "Education and English","Education and Mathematics","Education and Physics",
    "Educational Administration and Planning","Educational Technology",
    "Guidance and Counselling","Human Kinetics and Health Education",
    "Library and Information Science",
    /* Pharmaceutical Sciences */
    "Pharmacognosy","Pharmacology","Pharmaceutical Chemistry"
  ],
  polytechnic: [
    /* Engineering Technology */
    "Agricultural Engineering Technology","Chemical Engineering Technology",
    "Civil Engineering Technology","Computer Engineering Technology",
    "Electrical Engineering Technology","Industrial Maintenance Engineering",
    "Mechanical Engineering Technology","Mechatronics Engineering Technology",
    "Metallurgical Engineering Technology","Mineral and Petroleum Resources Engineering",
    "Science Laboratory Technology","Welding and Fabrication Engineering Technology",
    /* ICT & Computing */
    "Computer Science","Cyber Security Technology","Information Communication Technology",
    "Software Engineering Technology","Statistics",
    /* Business Studies */
    "Accountancy","Banking and Finance","Business Administration and Management",
    "Insurance","Marketing","Office Technology and Management",
    "Purchasing and Supply","Public Administration",
    /* Art, Design & Printing */
    "Art and Design","Graphic Arts Technology","Printing Technology",
    /* Environmental Studies */
    "Architecture","Building Technology","Estate Management and Valuation",
    "Quantity Surveying","Urban and Regional Planning",
    /* Applied Sciences */
    "Applied Chemistry","Food Technology","Hospitality Management",
    "Library and Information Science","Mass Communication","Tourism",
    /* Social Development */
    "Social Development","Cooperative Economics and Management"
  ],
  college_of_education: [
    /* Core NCE Subjects */
    "Agricultural Science","Arabic Studies","Biology","Business Education",
    "Chemistry","Christian Religious Studies","Civic Education","Computer Science",
    "Early Childhood Education","Economics","English Studies","Fine Arts",
    "French","Geography","Government","Health Education",
    "History","Home Economics","Integrated Science","Islamic Studies",
    "Library and Information Science","Mathematics","Music",
    "Physical and Health Education","Physics","Political Science",
    "Primary Education Studies","Social Studies","Technical Drawing",
    "Vocational and Technical Education","Yoruba/Hausa/Igbo Language Studies"
  ]
};

window.LIB_LEVELS = {
  university: ['100 Level','200 Level','300 Level','400 Level','500 Level','600 Level','Postgraduate (PGD)','Masters (MSc/MA/MEd)','Doctorate (PhD)'],
  polytechnic: ['ND 1','ND 2','HND 1','HND 2'],
  college_of_education: ['Year 1 (NCE 1)','Year 2 (NCE 2)','Year 3 (NCE 3)']
};

/* ══════════════════════════════════════════════════════
   FIRESTORE
══════════════════════════════════════════════════════ */
let _db=null, _auth=null;
async function _init(){ if(_db) return; await _waitFirebase(); const a=getApp(); _db=getFirestore(a); _auth=getAuth(a); }

window.libToast=function(msg,dur){ let el=document.getElementById('lib-toast'); if(!el){el=document.createElement('div');el.id='lib-toast';el.className='lib-toast';document.body.appendChild(el);} el.textContent=msg;el.style.display='block';clearTimeout(el._t);el._t=setTimeout(function(){el.style.display='none';},dur||3000); };
window.libOnAuth=function(cb){ _init().then(function(){ onAuthStateChanged(_auth,cb); }); };
window.libGetProfile=async function(uid){ await _init(); const s=await getDoc(doc(_db,'library_profiles',uid)); return s.exists()?{id:s.id,...s.data()}:null; };
window.libSaveProfile=async function(uid,data){ await _init(); await setDoc(doc(_db,'library_profiles',uid),{...data,updatedAt:serverTimestamp()},{merge:true}); };
window.libAddBook=async function(data){ await _init(); const r=await addDoc(collection(_db,'library_books'),{...data,createdAt:serverTimestamp(),views:0,likes:0,commentCount:0,status:'approved'}); return r.id; };
window.libUpdateBook=async function(id,data){ await _init(); await updateDoc(doc(_db,'library_books',id),data); };
window.libDeleteBook=async function(id){ await _init(); await deleteDoc(doc(_db,'library_books',id)); };
window.libGetBook=async function(id){ await _init(); const s=await getDoc(doc(_db,'library_books',id)); return s.exists()?{id:s.id,...s.data()}:null; };

/* Smart search — avoids composite indexes by sorting client-side */
window.libSearchBooks=async function(f){
  await _init();
  /* Single-field server filters only (no orderBy on server = no composite index needed) */
  const constraints=[where('status','==','approved'),limit(300)];
  if(f.institution) constraints.push(where('institution','==',f.institution));
  else if(f.institutionType) constraints.push(where('institutionType','==',f.institutionType));
  let docs=(await getDocs(query(collection(_db,'library_books'),...constraints))).docs.map(function(d){return{id:d.id,...d.data()};});
  /* Client-side filters */
  if(f.course)  docs=docs.filter(function(b){ return b.course===f.course; });
  if(f.level)   docs=docs.filter(function(b){ return b.level===f.level; });
  if(f.keyword){
    const kw=f.keyword.toLowerCase();
    docs=docs.filter(function(b){ return (b.title||'').toLowerCase().includes(kw)||(b.course||'').toLowerCase().includes(kw)||(b.author||'').toLowerCase().includes(kw); });
  }
  /* Sort newest first client-side */
  docs.sort(function(a,b){ return ((b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0))-((a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0)); });
  return docs;
};

/* No orderBy on server = no composite index needed; sort client-side */
window.libGetMyBooks=async function(uid){
  await _init();
  const s=await getDocs(query(collection(_db,'library_books'),where('uploaderUid','==',uid),limit(200)));
  return s.docs.map(function(d){return{id:d.id,...d.data()};}).sort(function(a,b){
    return ((b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0))-((a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0));
  });
};
window.libGetMyStats=async function(uid){ await _init(); const s=await getDocs(query(collection(_db,'library_books'),where('uploaderUid','==',uid))); let b=0,r=0,l=0,c=0; s.docs.forEach(function(d){const x=d.data();b++;r+=x.views||0;l+=x.likes||0;c+=x.commentCount||0;}); return{books:b,readers:r,likes:l,comments:c}; };
window.libToggleLike=async function(bookId,uid){ await _init(); const lRef=doc(_db,'library_likes',bookId+'_'+uid); const s=await getDoc(lRef); if(s.exists()){await deleteDoc(lRef);await updateDoc(doc(_db,'library_books',bookId),{likes:increment(-1)});return false;}else{await setDoc(lRef,{bookId,uid,createdAt:serverTimestamp()});await updateDoc(doc(_db,'library_books',bookId),{likes:increment(1)});return true;} };
window.libHasLiked=async function(bookId,uid){ await _init(); return(await getDoc(doc(_db,'library_likes',bookId+'_'+uid))).exists(); };
window.libAddComment=async function(bookId,uid,name,text){ await _init(); await addDoc(collection(_db,'library_comments'),{bookId,uid,displayName:name,text,createdAt:serverTimestamp()}); await updateDoc(doc(_db,'library_books',bookId),{commentCount:increment(1)}); };
window.libGetComments=async function(bookId){ await _init(); const s=await getDocs(query(collection(_db,'library_comments'),where('bookId','==',bookId),orderBy('createdAt','desc'),limit(50))); return s.docs.map(function(d){return{id:d.id,...d.data()};}); };
window.libRecordView=async function(bookId, uid){
  await _init();
  try {
    if (uid) {
      // Logged-in user: use Firestore doc keyed by bookId+uid so each person counts once
      const viewRef = doc(_db, 'library_views', bookId + '_' + uid);
      const snap = await getDoc(viewRef);
      if (snap.exists()) return; // Already counted this user
      await setDoc(viewRef, { bookId, uid, viewedAt: serverTimestamp() });
    } else {
      // Anonymous user: use localStorage so the same browser session only counts once
      const lsKey = 'lib_view_' + bookId;
      if (localStorage.getItem(lsKey)) return; // Already counted this browser
      localStorage.setItem(lsKey, '1');
    }
    // Only reaches here on the very first view — safe to increment
    await updateDoc(doc(_db,'library_books',bookId),{views:increment(1)});
  } catch(e) {}
};


window.libUploadFile=async function(file,bookId,type){
  const isThumb=(type==='thumb');
  const preset=isThumb?_CLD_THUMB_PRESET:_CLD_FILE_PRESET;
  const resourceType=isThumb?'image':'auto';
  const formData=new FormData();
  formData.append('file',file);
  formData.append('upload_preset',preset);
  if(isThumb) formData.append('public_id','library/thumbnails/'+bookId);
  const url='https://api.cloudinary.com/v1_1/'+_CLD_CLOUD+'/'+resourceType+'/upload';
  const res=await fetch(url,{method:'POST',body:formData});
  if(!res.ok){
    let msg='Upload failed ('+res.status+')';
    try{const d=await res.json();if(d.error&&d.error.message)msg=d.error.message;}catch(e){}
    throw new Error(msg);
  }
  const data=await res.json();
  if(!data.secure_url) throw new Error('No URL returned from Cloudinary');
  return data.secure_url;
};
window.libExtractPdfText=async function(pdfUrl,maxPages){
  maxPages=maxPages||10; if(typeof pdfjsLib==='undefined') return '';
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({url:pdfUrl,withCredentials:false}).promise;
  const pages=Math.min(pdf.numPages,maxPages); let text='';
  for(let i=1;i<=pages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();text+=c.items.map(function(s){return s.str;}).join(' ')+'\n';if(text.length>12000)break;}
  return text.substring(0,12000);
};
window.libAiExplain=async function(pdfUrl,title){
  const text=await window.libExtractPdfText(pdfUrl,8); if(!text.trim()) throw new Error('Could not extract text from this document.');
  const res=await window.libGroqFetch({messages:[{role:'user',content:'You are an expert academic tutor. A student is reading: "'+title+'".\n\nDocument:\n\n'+text+'\n\n---\nExplain with:\n1. **Overview** (2-3 sentences)\n2. **Key Concepts** (5-7 ideas explained simply)\n3. **Summary** (concise paragraph)\n4. **Study Tips** (3 tips)'}],max_tokens:2000});
  if(!res.ok) throw new Error('AI request failed ('+res.status+')');
  const d=await res.json(); return d.choices[0].message.content;
};
window.libAiMCQ=async function(pdfUrl,title){
  const text=await window.libExtractPdfText(pdfUrl,6); if(!text.trim()) throw new Error('Could not extract text from this document.');
  const res=await window.libGroqFetch({messages:[{role:'user',content:'Generate 10 multiple-choice exam questions from "'+title+'":\n\n'+text+'\n\nReturn ONLY valid JSON array, no markdown:\n[{"q":"Question","opts":["A. opt1","B. opt2","C. opt3","D. opt4"],"ans":0}]'}],max_tokens:2000});
  if(!res.ok) throw new Error('AI request failed');
  const d=await res.json(); let raw=d.choices[0].message.content.trim().replace(/^```(?:json)?/,'').replace(/```$/,'').trim();
  return JSON.parse(raw);
};

window.libFormatTime=function(ts){if(!ts) return '';const d=ts.toDate?ts.toDate():new Date(ts);const diff=Date.now()-d.getTime();if(diff<60000) return 'just now';if(diff<3600000) return Math.floor(diff/60000)+'m ago';if(diff<86400000) return Math.floor(diff/3600000)+'h ago';return Math.floor(diff/86400000)+'d ago';};

/* ── Cascade helpers (used by both library.html and library-upload.html) ── */
window.libPopulateSchools=function(sel,type){
  const m={university:window.LIB_NIGERIA.universities,polytechnic:window.LIB_NIGERIA.polytechnics,college_of_education:window.LIB_NIGERIA.colleges_of_education};
  const schools=(m[type]||[]);
  sel.innerHTML='<option value="">— All Schools —</option>';
  [...schools].sort().forEach(function(s){const o=document.createElement('option');o.value=s;o.textContent=s;sel.appendChild(o);});
};
window.libPopulateCourses=function(sel,type){
  const courses=(window.LIB_COURSES[type]||[]);
  sel.innerHTML='<option value="">— All Courses —</option>';
  [...courses].sort().forEach(function(c){const o=document.createElement('option');o.value=c;o.textContent=c;sel.appendChild(o);});
};
window.libPopulateLevels=function(sel,type){
  const levels=(window.LIB_LEVELS[type]||window.LIB_LEVELS.university);
  sel.innerHTML='<option value="">— All Levels —</option>';
  levels.forEach(function(l){const o=document.createElement('option');o.value=l;o.textContent=l;sel.appendChild(o);});
};

window.libBookCardHTML=function(b){
  const thumb=b.thumbnailUrl?`<img src="${b.thumbnailUrl}" alt="" loading="lazy">`:`<div class="lib-card-thumb-placeholder"><div class="lib-card-thumb-icon">📖</div><div class="lib-card-thumb-label">${(b.course||b.subject||'').substring(0,18)}</div></div>`;
  return `<div class="lib-card" onclick="location.href='library-read.html?id=${b.id}'"><div class="lib-card-thumb">${thumb}</div><div class="lib-card-body"><div class="lib-card-title">${b.title||'Untitled'}</div><div class="lib-card-meta"><div><span class="lib-card-level">${b.level||''}</span></div><div style="margin-top:3px;font-size:.68rem">${(b.course||b.subject||'').substring(0,24)}</div><div style="font-size:.65rem;margin-top:2px;color:#475569">${(b.institution||'').substring(0,26)}</div></div><div class="lib-card-stats"><span class="lib-card-stat">👁️ ${b.views||0}</span><span class="lib-card-stat">❤️ ${b.likes||0}</span><span class="lib-card-stat">💬 ${b.commentCount||0}</span></div></div></div>`;
};

console.log('[aqs-library] loaded — lib Groq slots: '+window.getLibGroqKeyCount());

/* ══════════════════════════════════════════════════════
   PARSED CONTENT UPLOAD — stores JSON in Cloudinary
   (avoids Firebase bandwidth limits for large docs)
══════════════════════════════════════════════════════ */
window.libUploadParsed=async function(pages,bookId){
  const payload=JSON.stringify({totalPages:pages.length,pages:pages});
  const blob=new Blob([payload],{type:'application/json'});
  const formData=new FormData();
  formData.append('file',blob,bookId+'_parsed.json');
  formData.append('upload_preset',_CLD_FILE_PRESET);
  formData.append('public_id','library/parsed/'+bookId);
  const res=await fetch('https://api.cloudinary.com/v1_1/'+_CLD_CLOUD+'/raw/upload',{method:'POST',body:formData});
  if(!res.ok){
    let msg='Parsed upload failed ('+res.status+')';
    try{const d=await res.json();if(d.error&&d.error.message)msg=d.error.message;}catch(e){}
    throw new Error(msg);
  }
  const data=await res.json();
  if(!data.secure_url) throw new Error('No URL returned for parsed content');
  return data.secure_url;
};
