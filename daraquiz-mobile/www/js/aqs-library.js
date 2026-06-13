/* ═══════════════════════════════════════════════════════════════════
   AQS Library  —  Core Logic  v2.0
   Cascade: Institution Type → School → Course → Level → Books
   AI: Dedicated 10-slot Groq pool, round-robin with fallback
   New v2.0: Follows, Comment Replies, Profile Photos, Host Profile
═══════════════════════════════════════════════════════════════════ */

import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, onAuthStateChanged }
    from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, setDoc, getDoc, getDocs,
  updateDoc, deleteDoc, query, where, orderBy, limit,
  serverTimestamp, increment, getCountFromServer
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

window.LIB_COURSES = {
  university: [
    "Aerospace Engineering","Agricultural Engineering","Chemical Engineering",
    "Civil Engineering","Computer Engineering","Electrical/Electronic Engineering",
    "Marine Engineering","Mechanical Engineering","Metallurgical Engineering",
    "Mining Engineering","Petroleum Engineering","Production Engineering",
    "Systems Engineering","Survey and Geoinformatics",
    "Computer Science","Cyber Security","Data Science","Information Technology",
    "Industrial Mathematics","Mathematics","Pure and Applied Mathematics","Statistics",
    "Software Engineering","Biochemistry","Botany","Chemistry","Environmental Biology",
    "Geology","Microbiology","Physics","Zoology",
    "Dentistry","Medical Laboratory Science","Medicine and Surgery","Nursing Science",
    "Pharmacy","Physiotherapy","Radiography",
    "Agricultural Economics and Extension","Animal Science","Aquaculture and Fisheries",
    "Crop Science","Food Science and Technology","Veterinary Medicine",
    "Architecture","Building","Estate Management","Quantity Surveying",
    "Urban and Regional Planning","Law (LLB)",
    "Accounting","Banking and Finance","Business Administration","Finance",
    "Insurance","Marketing","Public Administration","Economics",
    "International Relations","Mass Communication","Political Science","Psychology",
    "Sociology","English","History and International Studies","Philosophy",
    "Theatre Arts","Education and Biology","Education and Computer Science",
    "Education and English","Education and Mathematics","Library and Information Science"
  ],
  polytechnic: [
    "Agricultural Engineering Technology","Chemical Engineering Technology",
    "Civil Engineering Technology","Computer Engineering Technology",
    "Electrical Engineering Technology","Mechanical Engineering Technology",
    "Computer Science","Information Communication Technology","Statistics",
    "Accountancy","Banking and Finance","Business Administration and Management",
    "Marketing","Office Technology and Management","Public Administration",
    "Art and Design","Graphic Arts Technology","Architecture","Building Technology",
    "Estate Management and Valuation","Quantity Surveying",
    "Food Technology","Hospitality Management","Library and Information Science",
    "Mass Communication","Tourism","Social Development"
  ],
  college_of_education: [
    "Agricultural Science","Biology","Business Education","Chemistry",
    "Christian Religious Studies","Computer Science","Early Childhood Education",
    "Economics","English Studies","Fine Arts","Geography","Government",
    "Health Education","History","Home Economics","Integrated Science",
    "Islamic Studies","Library and Information Science","Mathematics","Music",
    "Physical and Health Education","Physics","Political Science",
    "Primary Education Studies","Social Studies","Yoruba/Hausa/Igbo Language Studies"
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

window.libToast=function(msg,dur){
  let el=document.getElementById('lib-toast');
  if(!el){el=document.createElement('div');el.id='lib-toast';el.className='lib-toast';document.body.appendChild(el);}
  el.textContent=msg;el.style.display='block';clearTimeout(el._t);
  el._t=setTimeout(function(){el.style.display='none';},dur||3000);
};
window.libOnAuth=function(cb){ _init().then(function(){ onAuthStateChanged(_auth,cb); }); };

/* ── PROFILES ── */
window.libGetProfile=async function(uid){
  await _init();
  const s=await getDoc(doc(_db,'library_profiles',uid));
  return s.exists()?{id:s.id,...s.data()}:null;
};
window.libSaveProfile=async function(uid,data){
  await _init();
  await setDoc(doc(_db,'library_profiles',uid),{...data,updatedAt:serverTimestamp()},{merge:true});
};
window.libUploadProfilePhoto=async function(uid,file){
  const formData=new FormData();
  formData.append('file',file);
  formData.append('upload_preset',_CLD_THUMB_PRESET);
  formData.append('public_id','library/avatars/'+uid);
  const res=await fetch('https://api.cloudinary.com/v1_1/'+_CLD_CLOUD+'/image/upload',{method:'POST',body:formData});
  if(!res.ok) throw new Error('Photo upload failed');
  const data=await res.json();
  if(!data.secure_url) throw new Error('No URL returned');
  await window.libSaveProfile(uid,{photoURL:data.secure_url});
  return data.secure_url;
};

/* ── BOOKS ── */
window.libAddBook=async function(data){
  await _init();
  const r=await addDoc(collection(_db,'library_books'),{...data,createdAt:serverTimestamp(),views:0,likes:0,commentCount:0,status:'approved'});
  return r.id;
};
window.libUpdateBook=async function(id,data){ await _init(); await updateDoc(doc(_db,'library_books',id),data); };
window.libDeleteBook=async function(id){ await _init(); await deleteDoc(doc(_db,'library_books',id)); };
window.libGetBook=async function(id){
  await _init();
  const s=await getDoc(doc(_db,'library_books',id));
  return s.exists()?{id:s.id,...s.data()}:null;
};

window.libSearchBooks=async function(f){
  await _init();
  const constraints=[where('status','==','approved'),limit(300)];
  if(f.institution) constraints.push(where('institution','==',f.institution));
  else if(f.institutionType) constraints.push(where('institutionType','==',f.institutionType));
  let docs=(await getDocs(query(collection(_db,'library_books'),...constraints))).docs.map(function(d){return{id:d.id,...d.data()};});
  if(f.course) docs=docs.filter(function(b){ return b.course===f.course; });
  if(f.level)  docs=docs.filter(function(b){ return b.level===f.level; });
  if(f.keyword){
    const kw=f.keyword.toLowerCase();
    docs=docs.filter(function(b){ return (b.title||'').toLowerCase().includes(kw)||(b.course||'').toLowerCase().includes(kw)||(b.author||'').toLowerCase().includes(kw); });
  }
  docs.sort(function(a,b){ return ((b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0))-((a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0)); });
  return docs;
};

window.libGetMyBooks=async function(uid){
  await _init();
  const s=await getDocs(query(collection(_db,'library_books'),where('uploaderUid','==',uid),limit(200)));
  return s.docs.map(function(d){return{id:d.id,...d.data()};}).sort(function(a,b){
    return ((b.createdAt&&b.createdAt.toMillis?b.createdAt.toMillis():0))-((a.createdAt&&a.createdAt.toMillis?a.createdAt.toMillis():0));
  });
};

window.libGetMyStats=async function(uid){
  await _init();
  const s=await getDocs(query(collection(_db,'library_books'),where('uploaderUid','==',uid)));
  let b=0,r=0,l=0,c=0;
  s.docs.forEach(function(d){const x=d.data();b++;r+=x.views||0;l+=x.likes||0;c+=x.commentCount||0;});
  return{books:b,readers:r,likes:l,comments:c};
};

/* ── LIKES ── */
window.libToggleLike=async function(bookId,uid){
  await _init();
  const lRef=doc(_db,'library_likes',bookId+'_'+uid);
  const s=await getDoc(lRef);
  if(s.exists()){
    await deleteDoc(lRef);
    await updateDoc(doc(_db,'library_books',bookId),{likes:increment(-1)});
    return false;
  } else {
    await setDoc(lRef,{bookId,uid,createdAt:serverTimestamp()});
    await updateDoc(doc(_db,'library_books',bookId),{likes:increment(1)});
    return true;
  }
};
window.libHasLiked=async function(bookId,uid){
  await _init();
  return(await getDoc(doc(_db,'library_likes',bookId+'_'+uid))).exists();
};

/* ── COMMENTS ── */
window.libAddComment=async function(bookId,uid,name,photoURL,text){
  await _init();
  const ref=await addDoc(collection(_db,'library_comments'),{bookId,uid,displayName:name,photoURL:photoURL||'',text,createdAt:serverTimestamp(),replyCount:0});
  await updateDoc(doc(_db,'library_books',bookId),{commentCount:increment(1)});
  return ref.id;
};
window.libGetComments=async function(bookId){
  await _init();
  const s=await getDocs(query(collection(_db,'library_comments'),where('bookId','==',bookId),orderBy('createdAt','desc'),limit(50)));
  return s.docs.map(function(d){return{id:d.id,...d.data()};});
};

/* ── REPLIES ── */
window.libAddReply=async function(commentId,uid,name,photoURL,text,isHost){
  await _init();
  await addDoc(collection(_db,'library_replies'),{commentId,uid,displayName:name,photoURL:photoURL||'',text,isHost:!!isHost,createdAt:serverTimestamp()});
  await updateDoc(doc(_db,'library_comments',commentId),{replyCount:increment(1)});
};
window.libGetReplies=async function(commentId){
  await _init();
  const s=await getDocs(query(collection(_db,'library_replies'),where('commentId','==',commentId),orderBy('createdAt','asc'),limit(30)));
  return s.docs.map(function(d){return{id:d.id,...d.data()};});
};

/* ── HOST: Get all comments on their books ── */
window.libGetHostComments=async function(uploaderUid){
  await _init();
  const books=await window.libGetMyBooks(uploaderUid);
  if(!books.length) return [];
  const result=[];
  for(const book of books){
    const snap=await getDocs(query(collection(_db,'library_comments'),where('bookId','==',book.id),orderBy('createdAt','desc'),limit(20)));
    if(snap.size) result.push({book,comments:snap.docs.map(function(d){return{id:d.id,...d.data()};})});
  }
  return result;
};

/* ── VIEWS ── */
window.libRecordView=async function(bookId,uid){
  await _init();
  try{
    if(uid){
      const viewRef=doc(_db,'library_views',bookId+'_'+uid);
      const snap=await getDoc(viewRef);
      if(snap.exists()) return;
      await setDoc(viewRef,{bookId,uid,viewedAt:serverTimestamp()});
    } else {
      const lsKey='lib_view_'+bookId;
      if(localStorage.getItem(lsKey)) return;
      localStorage.setItem(lsKey,'1');
    }
    await updateDoc(doc(_db,'library_books',bookId),{views:increment(1)});
  }catch(e){}
};

/* ── FOLLOWS ── */
window.libFollowToggle=async function(followerUid,hostUid){
  await _init();
  const fRef=doc(_db,'library_follows',followerUid+'_'+hostUid);
  const s=await getDoc(fRef);
  if(s.exists()){
    await deleteDoc(fRef);
    return false;
  } else {
    await setDoc(fRef,{followerUid,hostUid,createdAt:serverTimestamp()});
    return true;
  }
};
window.libIsFollowing=async function(followerUid,hostUid){
  await _init();
  return(await getDoc(doc(_db,'library_follows',followerUid+'_'+hostUid))).exists();
};
window.libGetFollowerCount=async function(hostUid){
  await _init();
  try{
    const snap=await getCountFromServer(query(collection(_db,'library_follows'),where('hostUid','==',hostUid)));
    return snap.data().count;
  }catch(e){
    const snap=await getDocs(query(collection(_db,'library_follows'),where('hostUid','==',hostUid)));
    return snap.size;
  }
};
window.libGetFollowers=async function(hostUid){
  await _init();
  const s=await getDocs(query(collection(_db,'library_follows'),where('hostUid','==',hostUid),limit(100)));
  return s.docs.map(function(d){return d.data().followerUid;});
};
window.libGetFollowingCount=async function(followerUid){
  await _init();
  try{
    const snap=await getCountFromServer(query(collection(_db,'library_follows'),where('followerUid','==',followerUid)));
    return snap.data().count;
  }catch(e){
    const snap=await getDocs(query(collection(_db,'library_follows'),where('followerUid','==',followerUid)));
    return snap.size;
  }
};

/* ── FILE UPLOADS ── */
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

/* ── AI ── */
window.libExtractPdfText=async function(pdfUrl,maxPages){
  maxPages=maxPages||10;
  if(typeof pdfjsLib==='undefined') return '';
  pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf=await pdfjsLib.getDocument({url:pdfUrl,withCredentials:false}).promise;
  const pages=Math.min(pdf.numPages,maxPages); let text='';
  for(let i=1;i<=pages;i++){const p=await pdf.getPage(i);const c=await p.getTextContent();text+=c.items.map(function(s){return s.str;}).join(' ')+'\n';if(text.length>12000)break;}
  return text.substring(0,12000);
};
window.libAiExplain=async function(pdfUrl,title){
  const text=await window.libExtractPdfText(pdfUrl,8);
  if(!text.trim()) throw new Error('Could not extract text from this document.');
  const res=await window.libGroqFetch({messages:[{role:'user',content:'You are an expert academic tutor. A student is reading: "'+title+'".\n\nDocument:\n\n'+text+'\n\n---\nExplain with:\n1. **Overview** (2-3 sentences)\n2. **Key Concepts** (5-7 ideas explained simply)\n3. **Summary** (concise paragraph)\n4. **Study Tips** (3 tips)'}],max_tokens:2000});
  if(!res.ok) throw new Error('AI request failed ('+res.status+')');
  const d=await res.json(); return d.choices[0].message.content;
};
window.libAiMCQ=async function(pdfUrl,title){
  const text=await window.libExtractPdfText(pdfUrl,6);
  if(!text.trim()) throw new Error('Could not extract text from this document.');
  const res=await window.libGroqFetch({messages:[{role:'user',content:'Generate 10 multiple-choice exam questions from "'+title+'":\n\n'+text+'\n\nReturn ONLY valid JSON array, no markdown:\n[{"q":"Question","opts":["A. opt1","B. opt2","C. opt3","D. opt4"],"ans":0}]'}],max_tokens:2000});
  if(!res.ok) throw new Error('AI request failed');
  const d=await res.json();
  let raw=d.choices[0].message.content.trim().replace(/^```(?:json)?/,'').replace(/```$/,'').trim();
  return JSON.parse(raw);
};

/* ── UTILS ── */
window.libFormatTime=function(ts){
  if(!ts) return '';
  const d=ts.toDate?ts.toDate():new Date(ts);
  const diff=Date.now()-d.getTime();
  if(diff<60000) return 'just now';
  if(diff<3600000) return Math.floor(diff/60000)+'m ago';
  if(diff<86400000) return Math.floor(diff/3600000)+'h ago';
  if(diff<604800000) return Math.floor(diff/86400000)+'d ago';
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
};

window.libInitials=function(name){
  if(!name) return '?';
  const parts=name.trim().split(' ');
  if(parts.length>=2) return (parts[0][0]+parts[1][0]).toUpperCase();
  return name.slice(0,2).toUpperCase();
};

window.libAvatarHtml=function(photoURL,name,size){
  size=size||32;
  if(photoURL) return '<img src="'+photoURL+'" alt="" style="width:'+size+'px;height:'+size+'px;border-radius:50%;object-fit:cover;">';
  return '<span style="font-size:'+(size*.35)+'px;font-weight:800;">'+window.libInitials(name)+'</span>';
};

/* ── CASCADE HELPERS ── */
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

/* ── BOOK CARD HTML ── */
window.libBookCardHTML=function(b,uploaderProfile){
  const thumb=b.thumbnailUrl
    ?`<img src="${b.thumbnailUrl}" alt="${b.title||''}" loading="lazy">`
    :`<div class="lib-card-thumb-placeholder">
        <div class="lib-card-thumb-icon">📖</div>
        <div class="lib-card-thumb-label">${(b.course||b.subject||'').substring(0,20)}</div>
      </div>`;
  const upName=uploaderProfile?uploaderProfile.displayName:(b.uploaderName||'Unknown');
  const upPhoto=uploaderProfile?uploaderProfile.photoURL:b.uploaderPhotoURL;
  const upAv=upPhoto
    ?`<img src="${upPhoto}" alt="">`
    :`<span style="font-size:.55rem;font-weight:800;">${window.libInitials(upName)}</span>`;
  return `<div class="lib-card" onclick="libCardClick(event,'${b.id}','${b.uploaderUid||''}')">
    <div class="lib-card-thumb">${thumb}</div>
    <div class="lib-card-body">
      <div class="lib-card-title">${b.title||'Untitled'}</div>
      <div class="lib-card-uploader" onclick="event.stopPropagation();libGoHostProfile('${b.uploaderUid||''}')">
        <div class="lib-card-uploader-av">${upAv}</div>
        <span class="lib-card-uploader-name">${upName}</span>
      </div>
      <div class="lib-card-meta">
        ${b.level?`<div><span class="lib-card-level">${b.level}</span></div>`:''}
        <div style="font-size:.67rem;color:#64748b;">${(b.course||b.subject||'').substring(0,26)}</div>
      </div>
      <div class="lib-card-stats">
        <span class="lib-card-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          ${b.views||0}
        </span>
        <span class="lib-card-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          ${b.likes||0}
        </span>
        <span class="lib-card-stat">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${b.commentCount||0}
        </span>
      </div>
    </div>
  </div>`;
};

/* Card click — goes to host profile page first */
window.libCardClick=function(e,bookId,uploaderUid){
  if(uploaderUid){
    location.href='library-host-profile.html?uid='+uploaderUid+'&book='+bookId;
  } else {
    location.href='library-read.html?id='+bookId;
  }
};

window.libGoHostProfile=function(uid){
  if(uid) location.href='library-host-profile.html?uid='+uid;
};

console.log('[aqs-library v2.0] loaded — lib Groq slots: '+window.getLibGroqKeyCount());
