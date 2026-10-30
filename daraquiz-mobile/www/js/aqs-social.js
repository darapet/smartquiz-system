/* DaraQuiz Social
 * A small, client-side community layer on top of the existing Firebase app.
 * Phone numbers are collected for profile discovery only; no OTP is sent yet.
 */
import { auth, db } from './aqs-firebase.js';
import { getApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  onAuthStateChanged, signOut, updatePassword, sendPasswordResetEmail
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const storage = getStorage(getApp());
const state = {
  user: null,
  profile: null,
  profiles: new Map(),
  currentSection: 'feed',
  currentChatUid: null,
  currentConversationId: null,
  messageUnsub: null,
  conversations: [],
  onboardingStep: 1,
  onboarding: {},
  pendingPhoto: null,
  pendingCover: null,
  recorder: null,
  recorderStream: null,
  recorderChunks: []
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[c]));
const initials = (profile) => {
  const name = profile?.displayName || profile?.firstName || profile?.name || 'User';
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'U';
};
const profileName = (profile) => profile?.displayName || [profile?.firstName, profile?.lastName].filter(Boolean).join(' ') || profile?.name || 'DaraQuiz user';
const profileHandle = (profile) => profile?.username ? `@${profile.username}` : '';
const profileAvatar = (profile, size = '') => {
  const cls = `social-avatar ${size}`.trim();
  return profile?.photoURL
    ? `<div class="${cls}"><img src="${esc(profile.photoURL)}" alt=""></div>`
    : `<div class="${cls}">${esc(initials(profile))}</div>`;
};
const dateValue = (value) => {
  if (!value) return '';
  const date = value.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const sortedPair = (a, b) => [a, b].sort().join('_');
const show = (el, visible = true) => { if (el) el.style.display = visible ? '' : 'none'; };

const COUNTRIES = `Afghanistan|+93|AF
Albania|+355|AL
Algeria|+213|DZ
Andorra|+376|AD
Angola|+244|AO
Antigua and Barbuda|+1|AG
Argentina|+54|AR
Armenia|+374|AM
Australia|+61|AU
Austria|+43|AT
Azerbaijan|+994|AZ
Bahamas|+1|BS
Bahrain|+973|BH
Bangladesh|+880|BD
Barbados|+1|BB
Belarus|+375|BY
Belgium|+32|BE
Belize|+501|BZ
Benin|+229|BJ
Bhutan|+975|BT
Bolivia|+591|BO
Bosnia and Herzegovina|+387|BA
Botswana|+267|BW
Brazil|+55|BR
Brunei|+673|BN
Bulgaria|+359|BG
Burkina Faso|+226|BF
Burundi|+257|BI
Cambodia|+855|KH
Cameroon|+237|CM
Canada|+1|CA
Cape Verde|+238|CV
Central African Republic|+236|CF
Chad|+235|TD
Chile|+56|CL
China|+86|CN
Colombia|+57|CO
Comoros|+269|KM
Congo, Democratic Republic|+243|CD
Congo, Republic|+242|CG
Costa Rica|+506|CR
Croatia|+385|HR
Cuba|+53|CU
Cyprus|+357|CY
Czech Republic|+420|CZ
Denmark|+45|DK
Djibouti|+253|DJ
Dominica|+1|DM
Dominican Republic|+1|DO
Ecuador|+593|EC
Egypt|+20|EG
El Salvador|+503|SV
Equatorial Guinea|+240|GQ
Eritrea|+291|ER
Estonia|+372|EE
Eswatini|+268|SZ
Ethiopia|+251|ET
Fiji|+679|FJ
Finland|+358|FI
France|+33|FR
Gabon|+241|GA
Gambia|+220|GM
Georgia|+995|GE
Germany|+49|DE
Ghana|+233|GH
Greece|+30|GR
Grenada|+1|GD
Guatemala|+502|GT
Guinea|+224|GN
Guinea-Bissau|+245|GW
Guyana|+592|GY
Haiti|+509|HT
Honduras|+504|HN
Hong Kong|+852|HK
Hungary|+36|HU
Iceland|+354|IS
India|+91|IN
Indonesia|+62|ID
Iran|+98|IR
Iraq|+964|IQ
Ireland|+353|IE
Israel|+972|IL
Italy|+39|IT
Jamaica|+1|JM
Japan|+81|JP
Jordan|+962|JO
Kazakhstan|+7|KZ
Kenya|+254|KE
Kiribati|+686|KI
Kuwait|+965|KW
Kyrgyzstan|+996|KG
Laos|+856|LA
Latvia|+371|LV
Lebanon|+961|LB
Lesotho|+266|LS
Liberia|+231|LR
Libya|+218|LY
Liechtenstein|+423|LI
Lithuania|+370|LT
Luxembourg|+352|LU
Madagascar|+261|MG
Malawi|+265|MW
Malaysia|+60|MY
Maldives|+960|MV
Mali|+223|ML
Malta|+356|MT
Marshall Islands|+692|MH
Mauritania|+222|MR
Mauritius|+230|MU
Mexico|+52|MX
Micronesia|+691|FM
Moldova|+373|MD
Monaco|+377|MC
Mongolia|+976|MN
Montenegro|+382|ME
Morocco|+212|MA
Mozambique|+258|MZ
Myanmar|+95|MM
Namibia|+264|NA
Nauru|+674|NR
Nepal|+977|NP
Netherlands|+31|NL
New Zealand|+64|NZ
Nicaragua|+505|NI
Niger|+227|NE
Nigeria|+234|NG
North Korea|+850|KP
North Macedonia|+389|MK
Norway|+47|NO
Oman|+968|OM
Pakistan|+92|PK
Palau|+680|PW
Palestine|+970|PS
Panama|+507|PA
Papua New Guinea|+675|PG
Paraguay|+595|PY
Peru|+51|PE
Philippines|+63|PH
Poland|+48|PL
Portugal|+351|PT
Qatar|+974|QA
Romania|+40|RO
Russia|+7|RU
Rwanda|+250|RW
Saint Kitts and Nevis|+1|KN
Saint Lucia|+1|LC
Saint Vincent and the Grenadines|+1|VC
Samoa|+685|WS
San Marino|+378|SM
Sao Tome and Principe|+239|ST
Saudi Arabia|+966|SA
Senegal|+221|SN
Serbia|+381|RS
Seychelles|+248|SC
Sierra Leone|+232|SL
Singapore|+65|SG
Slovakia|+421|SK
Slovenia|+386|SI
Solomon Islands|+677|SB
Somalia|+252|SO
South Africa|+27|ZA
South Korea|+82|KR
South Sudan|+211|SS
Spain|+34|ES
Sri Lanka|+94|LK
Sudan|+249|SD
Suriname|+597|SR
Sweden|+46|SE
Switzerland|+41|CH
Syria|+963|SY
Taiwan|+886|TW
Tajikistan|+992|TJ
Tanzania|+255|TZ
Thailand|+66|TH
Timor-Leste|+670|TL
Togo|+228|TG
Tonga|+676|TO
Trinidad and Tobago|+1|TT
Tunisia|+216|TN
Turkey|+90|TR
Turkmenistan|+993|TM
Tuvalu|+688|TV
Uganda|+256|UG
Ukraine|+380|UA
United Arab Emirates|+971|AE
United Kingdom|+44|GB
United States|+1|US
Uruguay|+598|UY
Uzbekistan|+998|UZ
Vanuatu|+678|VU
Vatican City|+39|VA
Venezuela|+58|VE
Vietnam|+84|VN
Yemen|+967|YE
Zambia|+260|ZM
Zimbabwe|+263|ZW`;
const countries = COUNTRIES.split('\n').map((line) => {
  const [name, code, iso] = line.split('|');
  return { name, code, iso };
});

function toast(message, error = false) {
  const el = $('social-toast');
  if (!el) return;
  el.textContent = message;
  el.className = `social-toast show${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.className = 'social-toast'; }, 3600);
}

function setLoading(target, message = 'Loading…') {
  if (target) target.innerHTML = `<div class="social-loading">${esc(message)}</div>`;
}

async function getProfile(uid) {
  if (state.profiles.has(uid)) return state.profiles.get(uid);
  const snap = await getDoc(doc(db, 'social_profiles', uid));
  const profile = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  if (profile) state.profiles.set(uid, profile);
  return profile;
}

async function relationshipWith(uid) {
  if (!state.user || uid === state.user.uid) return 'self';
  const snap = await getDoc(doc(db, 'social_friend_requests', sortedPair(state.user.uid, uid)));
  if (!snap.exists()) return 'none';
  const data = snap.data();
  if (data.status === 'accepted') return 'friends';
  if (data.status === 'pending' && data.recipientId === state.user.uid) return 'incoming';
  if (data.status === 'pending') return 'outgoing';
  return 'none';
}

async function ensureProfile(user) {
  const existing = await getProfile(user.uid);
  if (existing) {
    state.profile = existing;
    return;
  }
  let old = {};
  try {
    const snap = await getDoc(doc(db, 'users', user.uid));
    if (snap.exists()) old = snap.data();
  } catch (_) {}
  state.profile = null;
  state.onboarding = {
    firstName: (old.name || user.displayName || '').split(/\s+/)[0] || '',
    lastName: (old.name || user.displayName || '').split(/\s+/).slice(1).join(' ') || '',
    username: old.username || '',
    email: user.email || ''
  };
  fillOnboarding();
  openModal('social-onboarding');
}

function fillCountrySelect(id, selected = 'NG') {
  const select = $(id);
  if (!select) return;
  select.innerHTML = countries.map((c) =>
    `<option value="${c.iso}" data-code="${c.code}" ${c.iso === selected ? 'selected' : ''}>${esc(c.name)} (${c.code})</option>`
  ).join('');
}

function selectedCountry(id = 'social-country') {
  const select = $(id);
  const option = select?.selectedOptions?.[0];
  return { iso: option?.value || 'NG', code: option?.dataset.code || '+234', name: option?.textContent?.replace(/\s*\([^)]*\)$/, '') || 'Nigeria' };
}

function fillOnboarding() {
  const d = state.onboarding || {};
  $('social-first-name').value = d.firstName || '';
  $('social-last-name').value = d.lastName || '';
  $('social-username').value = d.username || '';
  $('social-phone').value = d.phone || '';
  $('social-bio').value = d.bio || '';
  $('social-location').value = d.location || '';
  fillCountrySelect('social-country', d.countryIso || 'NG');
  $('social-contact-email').value = d.email || state.user?.email || '';
}

function openModal(id) { $(id)?.classList.add('open'); }
function closeModal(id) { $(id)?.classList.remove('open'); }

function setSection(section) {
  state.currentSection = section;
  document.querySelectorAll('.social-section').forEach((el) => el.classList.toggle('active', el.id === `social-${section}`));
  document.querySelectorAll('.social-side-link').forEach((el) => el.classList.toggle('active', el.dataset.section === section));
  if (section === 'feed') loadSuggestions();
  if (section === 'friends') loadFriends();
  if (section === 'messages') loadConversations();
  if (section === 'profile') renderOwnProfile();
}

function renderOwnProfile() {
  const p = state.profile || {};
  $('social-profile-cover').innerHTML = p.coverURL
    ? `<img src="${esc(p.coverURL)}" alt="Cover photo"><div class="social-cover-shade"></div>`
    : '<div class="social-cover-shade"></div>';
  $('social-profile-avatar').innerHTML = profileAvatar(p, 'lg');
  $('social-profile-name').textContent = profileName(p);
  $('social-profile-handle').textContent = profileHandle(p);
  $('social-profile-bio').textContent = p.bio || 'Tell your friends a little about yourself.';
  $('social-detail-phone').textContent = p.phoneDisplay || 'Not added';
  $('social-detail-email').textContent = p.email || state.user?.email || 'Not added';
  $('social-detail-location').textContent = p.location || 'Not added';
}

function renderCurrentUser() {
  const p = state.profile || {};
  $('social-side-profile').innerHTML = `${profileAvatar(p, 'sm')}<div><strong>${esc(profileName(p))}</strong><span>${esc(profileHandle(p) || 'Complete your profile')}</span></div>`;
  $('social-top-avatar').innerHTML = p.photoURL ? `<img src="${esc(p.photoURL)}" alt="">` : esc(initials(p));
  $('social-welcome-name').textContent = profileName(p).split(' ')[0] || 'there';
  renderOwnProfile();
}

async function saveOnboarding() {
  const firstName = $('social-first-name').value.trim();
  const lastName = $('social-last-name').value.trim();
  const username = $('social-username').value.trim().replace(/^@/, '').toLowerCase();
  const phone = $('social-phone').value.trim().replace(/[^\d]/g, '');
  const country = selectedCountry();
  const bio = $('social-bio').value.trim();
  const location = $('social-location').value.trim();
  if (!firstName || !lastName || !/^[a-z0-9._-]{3,24}$/.test(username)) {
    toast('Use your first and last name, plus a username with 3–24 letters or numbers.', true);
    goOnboarding(2); return;
  }
  if (phone.length < 5) { toast('Enter a valid phone number. OTP is not required at this stage.', true); goOnboarding(1); return; }
  const usernameQuery = await getDocs(query(collection(db, 'social_profiles'), where('usernameLower', '==', username), limit(2)));
  if (usernameQuery.docs.some((item) => item.id !== state.user.uid)) {
    toast('That username is already taken.', true); goOnboarding(2); return;
  }
  const button = $('social-onboarding-save');
  button.disabled = true; button.textContent = 'Saving…';
  try {
    const displayName = `${firstName} ${lastName}`;
    const photoURL = state.pendingPhoto
      ? await uploadMedia(state.pendingPhoto, `social/${state.user.uid}/profile-${Date.now()}`)
      : '';
    const coverURL = state.pendingCover
      ? await uploadMedia(state.pendingCover, `social/${state.user.uid}/cover-${Date.now()}`)
      : '';
    const payload = {
      uid: state.user.uid, firstName, lastName, displayName, username, usernameLower: username,
      phone, phoneDisplay: `${country.code} ${phone}`, country: country.name, countryIso: country.iso,
      bio, location, email: state.user.email || '', photoURL, coverURL,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
    };
    await setDoc(doc(db, 'social_profiles', state.user.uid), payload, { merge: true });
    state.profile = { ...payload, id: state.user.uid };
    state.profiles.set(state.user.uid, state.profile);
    closeModal('social-onboarding');
    renderCurrentUser();
    toast('Your social profile is ready.');
  } catch (error) {
    toast(error.message || 'Could not save your profile.', true);
  } finally {
    button.disabled = false; button.textContent = 'Finish profile';
  }
}

function goOnboarding(step) {
  state.onboardingStep = step;
  document.querySelectorAll('#social-onboarding .social-step').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) === step));
  document.querySelectorAll('#social-onboarding .social-step-dot').forEach((el) => el.classList.toggle('active', Number(el.dataset.step) <= step));
}

async function uploadMedia(file, path) {
  if (!file) return '';
  if (file.size > 7 * 1024 * 1024) throw new Error('Please choose an image or audio file below 7 MB.');
  if (typeof window.aqsUploadFile === 'function') return window.aqsUploadFile(file, path);
  const uploaded = await uploadBytes(storageRef(storage, path), file, { contentType: file.type || 'application/octet-stream' });
  return getDownloadURL(uploaded.ref);
}

async function saveProfileEdits() {
  const p = state.profile || {};
  const firstName = $('edit-first-name').value.trim();
  const lastName = $('edit-last-name').value.trim();
  const bio = $('edit-bio').value.trim();
  const location = $('edit-location').value.trim();
  if (!firstName || !lastName) { toast('First and last name are required.', true); return; }
  const button = $('social-edit-save');
  button.disabled = true; button.textContent = 'Saving…';
  try {
    const update = { firstName, lastName, displayName: `${firstName} ${lastName}`, bio, location, updatedAt: serverTimestamp() };
    const country = selectedCountry('edit-country');
    const phone = $('edit-phone').value.trim().replace(/[^\d]/g, '');
    if (phone) Object.assign(update, { phone, phoneDisplay: `${country.code} ${phone}`, country: country.name, countryIso: country.iso });
    if (state.pendingPhoto) update.photoURL = await uploadMedia(state.pendingPhoto, `social/${state.user.uid}/profile-${Date.now()}`);
    if (state.pendingCover) update.coverURL = await uploadMedia(state.pendingCover, `social/${state.user.uid}/cover-${Date.now()}`);
    await updateDoc(doc(db, 'social_profiles', state.user.uid), update);
    state.profile = { ...p, ...update };
    state.profiles.set(state.user.uid, state.profile);
    state.pendingPhoto = null; state.pendingCover = null;
    closeModal('social-edit');
    renderCurrentUser();
    toast('Profile updated.');
  } catch (error) {
    toast(error.message || 'Could not update your profile.', true);
  } finally {
    button.disabled = false; button.textContent = 'Save changes';
  }
}

function fillEditProfile() {
  const p = state.profile || {};
  $('edit-first-name').value = p.firstName || '';
  $('edit-last-name').value = p.lastName || '';
  $('edit-phone').value = p.phone || '';
  $('edit-bio').value = p.bio || '';
  $('edit-location').value = p.location || '';
  fillCountrySelect('edit-country', p.countryIso || 'NG');
  $('edit-email').value = p.email || state.user?.email || '';
  $('edit-photo-preview').innerHTML = p.photoURL ? `<img src="${esc(p.photoURL)}" alt="">` : '<span>Choose profile photo</span>';
  $('edit-cover-preview').innerHTML = p.coverURL ? `<img src="${esc(p.coverURL)}" alt="">` : '<span>Choose cover photo</span>';
  state.pendingPhoto = null; state.pendingCover = null;
}

async function loadSuggestions() {
  const container = $('social-suggestions');
  setLoading(container, 'Finding people on DaraQuiz…');
  try {
    const snap = await getDocs(query(collection(db, 'social_profiles'), limit(80)));
    const profiles = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) => p.id !== state.user.uid);
    profiles.forEach((p) => state.profiles.set(p.id, p));
    await renderPeople(profiles.slice(0, 12), container);
  } catch (error) {
    container.innerHTML = `<div class="social-empty"><strong>People are taking a moment to load</strong>${esc(error.message || 'Try again shortly.')}</div>`;
  }
}

async function renderPeople(profiles, container) {
  if (!profiles.length) {
    container.innerHTML = '<div class="social-empty"><strong>No people found yet</strong>Invite a friend to create a DaraQuiz social profile.</div>';
    return;
  }
  const relationships = await Promise.all(profiles.map((p) => relationshipWith(p.id)));
  container.innerHTML = profiles.map((p, index) => {
    const relation = relationships[index];
    const action = relation === 'friends' ? '<button class="social-button soft" data-action="message" data-uid="' + esc(p.id) + '">Message</button>'
      : relation === 'incoming' ? '<button class="social-button success" data-action="accept" data-uid="' + esc(p.id) + '">Accept</button>'
      : relation === 'outgoing' ? '<button class="social-button ghost" disabled>Requested</button>'
      : '<button class="social-button primary" data-action="request" data-uid="' + esc(p.id) + '">Add friend</button>';
    return `<div class="social-person">${profileAvatar(p)}<div class="social-person-name">${esc(profileName(p))}</div><div class="social-person-handle">${esc(profileHandle(p))}</div><div class="social-person-actions">${action}</div></div>`;
  }).join('');
}

async function searchPeople(term) {
  const target = $('social-search-results');
  const needle = term.trim().toLowerCase();
  if (!needle) { show(target, false); return; }
  show(target, true); setLoading(target, 'Searching…');
  const snap = await getDocs(query(collection(db, 'social_profiles'), limit(100)));
  const results = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((p) =>
    p.id !== state.user.uid && `${profileName(p)} ${p.username || ''}`.toLowerCase().includes(needle)
  ).slice(0, 16);
  results.forEach((p) => state.profiles.set(p.id, p));
  await renderPeople(results, target);
}

async function handlePersonAction(uid, action) {
  const relation = await relationshipWith(uid);
  const requestRef = doc(db, 'social_friend_requests', sortedPair(state.user.uid, uid));
  try {
    if (action === 'request' && relation === 'none') {
      await setDoc(requestRef, { requesterId: state.user.uid, recipientId: uid, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      toast('Friend request sent.');
    } else if (action === 'accept' && relation === 'incoming') {
      await updateDoc(requestRef, { status: 'accepted', updatedAt: serverTimestamp() });
      toast('Friend request accepted.');
    } else if (action === 'decline' && relation === 'incoming') {
      await deleteDoc(requestRef);
      toast('Friend request declined.');
    } else if (action === 'message' && relation === 'friends') {
      setSection('messages'); await openConversation(uid);
      return;
    }
    await loadSuggestions();
    if (state.currentSection === 'friends') await loadFriends();
  } catch (error) { toast(error.message || 'That action could not be completed.', true); }
}

async function loadRequests() {
  const target = $('social-requests-list');
  setLoading(target, 'Loading requests…');
  const snap = await getDocs(query(collection(db, 'social_friend_requests'), where('recipientId', '==', state.user.uid), limit(60)));
  const pending = snap.docs.filter((d) => d.data().status === 'pending');
  const rows = [];
  for (const item of pending) {
    const data = item.data(); const p = await getProfile(data.requesterId);
    if (p) rows.push(`<div class="social-list-row">${profileAvatar(p, 'sm')}<div class="social-list-copy"><strong>${esc(profileName(p))}</strong><span>${esc(profileHandle(p))} sent you a friend request</span></div><div class="social-row-actions"><button class="social-button success" data-action="accept" data-uid="${esc(data.requesterId)}">Accept</button><button class="social-button ghost" data-action="decline" data-uid="${esc(data.requesterId)}">Decline</button></div></div>`);
  }
  target.innerHTML = rows.join('') || '<div class="social-empty"><strong>No pending requests</strong>New friend requests will appear here.</div>';
  $('social-request-count').textContent = String(rows.length);
  $('social-request-count-side').textContent = rows.length ? String(rows.length) : '';
}

async function loadFriends() {
  const target = $('social-friends-list');
  setLoading(target, 'Loading friends…');
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, 'social_friend_requests'), where('requesterId', '==', state.user.uid), limit(100))),
    getDocs(query(collection(db, 'social_friend_requests'), where('recipientId', '==', state.user.uid), limit(100)))
  ]);
  const friendIds = new Set();
  [...sent.docs, ...received.docs].forEach((d) => {
    const data = d.data();
    if (data.status === 'accepted') friendIds.add(data.requesterId === state.user.uid ? data.recipientId : data.requesterId);
  });
  const rows = [];
  for (const uid of friendIds) {
    const p = await getProfile(uid);
    if (p) rows.push(`<div class="social-list-row">${profileAvatar(p, 'sm')}<div class="social-list-copy"><strong>${esc(profileName(p))}</strong><span>${esc(profileHandle(p))}</span></div><div class="social-row-actions"><button class="social-button soft" data-action="message" data-uid="${esc(uid)}">Message</button></div></div>`);
  }
  target.innerHTML = rows.join('') || '<div class="social-empty"><strong>Your friends list is empty</strong>Find a study partner from the Discover tab.</div>';
  await loadRequests();
}

async function loadConversations() {
  const target = $('social-conversation-list');
  setLoading(target, 'Loading chats…');
  const snap = await getDocs(query(collection(db, 'social_conversations'), where('participantIds', 'array-contains', state.user.uid), limit(80)));
  state.conversations = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => {
    const at = a.lastMessageAt?.toMillis?.() || 0; const bt = b.lastMessageAt?.toMillis?.() || 0; return bt - at;
  });
  const rows = [];
  for (const conversation of state.conversations) {
    const otherUid = conversation.participantIds.find((uid) => uid !== state.user.uid);
    const p = await getProfile(otherUid);
    if (!p) continue;
    rows.push(`<button class="social-conversation ${otherUid === state.currentChatUid ? 'active' : ''}" data-action="chat" data-uid="${esc(otherUid)}">${profileAvatar(p, 'sm')}<span class="social-conversation-copy"><strong>${esc(profileName(p))}</strong><span>${esc(conversation.lastMessageText || 'Start a conversation')}</span></span></button>`);
  }
  target.innerHTML = rows.join('') || '<div class="social-empty"><strong>No conversations yet</strong>Accept a friend request, then start a chat.</div>';
}

async function openConversation(uid) {
  state.currentChatUid = uid;
  const p = await getProfile(uid);
  $('social-chat-empty').style.display = 'none';
  $('social-chat-content').style.display = 'flex';
  $('social-chat-avatar').innerHTML = profileAvatar(p, 'sm');
  $('social-chat-name').textContent = profileName(p);
  $('social-chat-handle').textContent = profileHandle(p);
  const existing = state.conversations.find((c) => c.id === sortedPair(state.user.uid, uid));
  state.currentConversationId = existing?.id || sortedPair(state.user.uid, uid);
  if (state.messageUnsub) state.messageUnsub();
  const messagesRef = collection(db, 'social_conversations', state.currentConversationId, 'messages');
  state.messageUnsub = onSnapshot(query(messagesRef, orderBy('createdAt', 'asc'), limit(150)), (snap) => {
    renderMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  }, (error) => toast(error.message || 'Messages could not be loaded.', true));
  document.querySelectorAll('.social-conversation').forEach((el) => el.classList.toggle('active', el.dataset.uid === uid));
}

function renderMessages(messages) {
  const target = $('social-chat-messages');
  if (!messages.length) {
    target.innerHTML = '<div class="social-empty"><strong>Say hello</strong>Your messages with this friend will appear here.</div>';
    return;
  }
  target.innerHTML = messages.map((message) => {
    const mine = message.senderId === state.user.uid;
    let body = '';
    if (message.type === 'image' && message.mediaUrl) body += `<img src="${esc(message.mediaUrl)}" alt="Shared image">`;
    else if (message.type === 'audio' && message.mediaUrl) body += `<audio controls preload="metadata" src="${esc(message.mediaUrl)}"></audio>`;
    if (message.text) body += `<div>${esc(message.text).replace(/\n/g, '<br>')}</div>`;
    return `<div class="social-message ${mine ? 'mine' : ''}">${mine ? '' : profileAvatar(state.profiles.get(state.currentChatUid), 'sm')}<div class="social-bubble">${body}<span class="social-message-time">${esc(dateValue(message.createdAt))}</span></div></div>`;
  }).join('');
  target.scrollTop = target.scrollHeight;
}

async function ensureConversation(uid) {
  const id = sortedPair(state.user.uid, uid);
  await setDoc(doc(db, 'social_conversations', id), {
    participantIds: [state.user.uid, uid], updatedAt: serverTimestamp()
  }, { merge: true });
  return id;
}

async function sendChatMessage(type = 'text', payload = {}) {
  if (!state.currentChatUid) { toast('Choose a friend to message first.', true); return; }
  const relation = await relationshipWith(state.currentChatUid);
  if (relation !== 'friends') { toast('You can message friends after they accept your request.', true); return; }
  const text = payload.text || $('social-chat-text').value.trim();
  if (type === 'text' && !text) return;
  const conversationId = await ensureConversation(state.currentChatUid);
  const message = { senderId: state.user.uid, type, text: text.slice(0, 2000), createdAt: serverTimestamp() };
  if (payload.mediaUrl) message.mediaUrl = payload.mediaUrl;
  if (payload.duration) message.duration = payload.duration;
  await addDoc(collection(db, 'social_conversations', conversationId, 'messages'), message);
  await updateDoc(doc(db, 'social_conversations', conversationId), {
    lastMessageText: type === 'image' ? 'Shared an image' : type === 'audio' ? 'Sent a voice note' : text.slice(0, 120),
    lastMessageAt: serverTimestamp(), lastSenderId: state.user.uid, updatedAt: serverTimestamp()
  });
  $('social-chat-text').value = '';
  loadConversations();
}

async function sendImage(file) {
  if (!file) return;
  try {
    toast('Uploading image…');
    const url = await uploadMedia(file, `social/${state.user.uid}/messages/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '')}`);
    await sendChatMessage('image', { mediaUrl: url });
    toast('Image sent.');
  } catch (error) { toast(error.message || 'Image upload failed.', true); }
}

async function toggleRecording() {
  const button = $('social-record-button');
  if (state.recorder) {
    state.recorder.stop(); return;
  }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast('Voice notes are not supported by this browser.', true); return;
  }
  try {
    state.recorderStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((type) => MediaRecorder.isTypeSupported(type)) || '';
    state.recorder = mime ? new MediaRecorder(state.recorderStream, { mimeType: mime }) : new MediaRecorder(state.recorderStream);
    state.recorderChunks = [];
    state.recorder.ondataavailable = (event) => { if (event.data.size) state.recorderChunks.push(event.data); };
    state.recorder.onstop = async () => {
      const blob = new Blob(state.recorderChunks, { type: state.recorder.mimeType || 'audio/webm' });
      state.recorderStream?.getTracks().forEach((track) => track.stop());
      state.recorder = null; state.recorderStream = null;
      button.classList.remove('recording'); $('social-record-label').textContent = '';
      try {
        toast('Uploading voice note…');
        const url = await uploadMedia(blob, `social/${state.user.uid}/messages/${Date.now()}.webm`);
        await sendChatMessage('audio', { mediaUrl: url });
        toast('Voice note sent.');
      } catch (error) { toast(error.message || 'Voice note upload failed.', true); }
    };
    state.recorder.start();
    button.classList.add('recording'); $('social-record-label').textContent = 'Recording… tap again to send';
  } catch (error) { toast('Microphone permission is needed for voice notes.', true); }
}

async function changePassword(event) {
  event.preventDefault();
  const password = $('social-new-password').value;
  if (password.length < 6) { toast('Your new password must be at least 6 characters.', true); return; }
  try {
    await updatePassword(state.user, password);
    $('social-password-form').reset();
    toast('Password changed successfully.');
  } catch (error) {
    if (error.code === 'auth/requires-recent-login' && state.user.email) {
      await sendPasswordResetEmail(auth, state.user.email);
      toast('For security, a password reset link was sent to your email.');
    } else toast(error.message || 'Could not change password.', true);
  }
}

function wireEvents() {
  document.querySelectorAll('.social-side-link').forEach((button) => button.addEventListener('click', () => setSection(button.dataset.section)));
  $('social-search-input')?.addEventListener('input', (event) => searchPeople(event.target.value).catch((e) => toast(e.message, true)));
  $('social-suggestions')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]'); if (action) handlePersonAction(action.dataset.uid, action.dataset.action);
  });
  $('social-search-results')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]'); if (action) handlePersonAction(action.dataset.uid, action.dataset.action);
  });
  $('social-friends-list')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]'); if (action) handlePersonAction(action.dataset.uid, action.dataset.action);
  });
  $('social-requests-list')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action]'); if (action) handlePersonAction(action.dataset.uid, action.dataset.action).then(loadFriends);
  });
  $('social-conversation-list')?.addEventListener('click', (event) => {
    const action = event.target.closest('[data-action="chat"]'); if (action) openConversation(action.dataset.uid);
  });
  $('social-send-button')?.addEventListener('click', () => sendChatMessage());
  $('social-chat-text')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendChatMessage(); }
  });
  $('social-image-input')?.addEventListener('change', (event) => { sendImage(event.target.files[0]); event.target.value = ''; });
  $('social-record-button')?.addEventListener('click', toggleRecording);
  $('social-edit-profile')?.addEventListener('click', () => { fillEditProfile(); openModal('social-edit'); });
  $('social-password-form')?.addEventListener('submit', changePassword);
  $('social-edit-save')?.addEventListener('click', saveProfileEdits);
  $('social-edit-photo')?.addEventListener('change', (event) => {
    state.pendingPhoto = event.target.files[0]; if (state.pendingPhoto) $('edit-photo-preview').innerHTML = `<img src="${URL.createObjectURL(state.pendingPhoto)}" alt="">`;
  });
  $('social-edit-cover')?.addEventListener('change', (event) => {
    state.pendingCover = event.target.files[0]; if (state.pendingCover) $('edit-cover-preview').innerHTML = `<img src="${URL.createObjectURL(state.pendingCover)}" alt="">`;
  });
  $('social-onboarding-photo')?.addEventListener('change', (event) => {
    state.pendingPhoto = event.target.files[0];
    if (state.pendingPhoto) $('onboarding-photo-preview').innerHTML = `<img src="${URL.createObjectURL(state.pendingPhoto)}" alt="">`;
  });
  $('social-onboarding-cover')?.addEventListener('change', (event) => {
    state.pendingCover = event.target.files[0];
    if (state.pendingCover) $('onboarding-cover-preview').innerHTML = `<img src="${URL.createObjectURL(state.pendingCover)}" alt="">`;
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
  $('social-onboarding-next-1')?.addEventListener('click', () => {
    if (!$('social-phone').value.trim()) { toast('Please enter your phone number. OTP is not required for now.', true); return; }
    goOnboarding(2);
  });
  $('social-onboarding-next-2')?.addEventListener('click', () => {
    if (!$('social-first-name').value.trim() || !$('social-last-name').value.trim() || !$('social-username').value.trim()) { toast('Please complete your names and username.', true); return; }
    goOnboarding(3);
  });
  $('social-onboarding-back-2')?.addEventListener('click', () => goOnboarding(1));
  $('social-onboarding-back-3')?.addEventListener('click', () => goOnboarding(2));
  $('social-onboarding-save')?.addEventListener('click', saveOnboarding);
  $('social-logout')?.addEventListener('click', () => signOut(auth).then(() => { location.href = 'login.html'; }));
  $('social-refresh')?.addEventListener('click', () => loadSuggestions());
  $('social-friends-tab')?.addEventListener('click', () => {
    $('social-friends-tab').classList.add('active'); $('social-requests-tab').classList.remove('active');
    show($('social-friends-list')); show($('social-requests-list'), false); loadFriends();
  });
  $('social-requests-tab')?.addEventListener('click', () => {
    $('social-requests-tab').classList.add('active'); $('social-friends-tab').classList.remove('active');
    show($('social-requests-list')); show($('social-friends-list'), false); loadRequests();
  });
}

onAuthStateChanged(auth, async (user) => {
  if (!user || user.isAnonymous) { location.href = 'login.html?redirect=social.html'; return; }
  state.user = user;
  try {
    await ensureProfile(user);
    renderCurrentUser();
    wireEvents();
    setSection('feed');
  } catch (error) {
    toast(error.message || 'Could not load your social profile.', true);
  }
});