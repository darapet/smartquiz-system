import { auth, db } from './aqs-firebase.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, limit, onSnapshot, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const state = {
  user: null, profile: null, profiles: new Map(), posts: [], stories: [],
  friends: [], requests: [], sentRequests: [], activeView: 'home', selectedTemplate: 'indigo',
  dismissedSuggestions: new Set(),
  storyColor: '#5b5bd6', postImage: null, postFile: null, storyImage: null, wired: false,
  feedUnsub: null, storyUnsub: null, requestUnsub: null, chatListUnsub: null, messageUnsub: null, notificationUnsub: null,
  notifications: [],
  incomingCallUnsub: null, callUnsub: null, candidateUnsub: null, callHistoryUnsubs: [],
  callHistory: [], incomingCallTimers: new Map(), incomingCallIds: new Set(),
  presence: new Map(), presenceUnsubs: new Map(), presenceHeartbeat: null,
  conversations: [], activeChatUid: null, activeChatId: null, activeCallId: null, searchTimer: null, searchRequestId: 0,
  pendingIncomingCall: null, rtc: null, localStream: null, callTimeout: null, callProfile: null, callIncoming: false,
  ringToneTimer: null, audioContext: null, presenceWired: false, callStartedAt: 0,
  callElapsedTimer: null, muted: false, speakerOn: true, callMode: 'audio', mediaRecorder: null,
  recordedChunks: [], recording: false, recordingCallId: null, translation: { enabled: false, language: 'en', recognition: null, busy: false }
};

const $ = (id) => document.getElementById(id);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const profileName = (profile) => profile?.displayName || profile?.name || 'StudyCo learner';
const initials = (profile) => profileName(profile).split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'SC';
const pairId = (a, b) => [a, b].sort().join('_');
const timeMs = (value) => value?.toMillis?.() || (value ? new Date(value).getTime() : 0);
const timeText = (value) => {
  const ms = timeMs(value); if (!ms) return 'Just now';
  const diff = Math.max(0, Date.now() - ms); const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now'; if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60); if (hours < 24) return `${hours}h`;
  return new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const presenceIsOnline = (presence) => {
  if (!presence?.online) return false;
  const updatedAt = timeMs(presence.updatedAt);
  return !updatedAt || Date.now() - updatedAt < 90000;
};
const lastSeenText = (presence) => {
  if (presenceIsOnline(presence)) return 'Online now';
  const ms = timeMs(presence?.lastSeen);
  if (!ms) return 'Last seen unavailable';
  const diff = Math.max(0, Date.now() - ms);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Last seen just now';
  if (mins < 60) return `Last seen ${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Last seen ${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Last seen ${days}d ago`;
  return `Last seen ${new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}`;
};
const avatar = (profile, size = '') => `<div class="studyco-avatar ${size}">${profile?.photoURL ? `<img src="${esc(profile.photoURL)}" alt="">` : esc(initials(profile))}</div>`;
const avatarWithPresence = (profile, uid, size = '') => {
  const presence = state.presence.get(uid);
  return `<span class="studyco-presence-wrap">${avatar(profile, size)}<i class="studyco-presence-dot${presenceIsOnline(presence) ? ' online' : ''}" title="${esc(lastSeenText(presence))}" aria-label="${esc(lastSeenText(presence))}"></i></span>`;
};
const toast = (message, error = false) => {
  const el = $('studyco-toast'); if (!el) return;
  el.textContent = message; el.className = `studyco-toast show${error ? ' error' : ''}`;
  clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.className = 'studyco-toast'; }, 3600);
};
function setNavBadge(id, count) {
  const badge = $(id); if (!badge) return;
  const value = Number(count) || 0;
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.hidden = value < 1;
}
async function refreshNavCounts() {
  if (!state.user) return;
  const [ownPosts, notifications] = await Promise.all([
    getDocs(query(collection(db, 'studyco_posts'), where('userId', '==', state.user.uid), limit(1000))).catch(() => null),
    getDocs(query(collection(db, 'studyco_notifications'), where('recipientId', '==', state.user.uid), limit(100))).catch(() => null)
  ]);
  setNavBadge('studyco-home-badge', ownPosts?.size ?? state.posts.filter((post) => post.userId === state.user.uid).length);
  setNavBadge('studyco-friend-badge', state.requests.length);
  setNavBadge('studyco-notification-badge', notifications
    ? notifications.docs.filter((item) => item.data().read !== true).length
    : state.requests.length);
}

async function createNotification(recipientId, type, entityId = '', conversationId = '') {
  if (!state.user || !recipientId || recipientId === state.user.uid) return;
  await addDoc(collection(db, 'studyco_notifications'), {
    recipientId, actorId: state.user.uid, type, entityId, conversationId,
    read: false, createdAt: serverTimestamp()
  });
}

function notificationCopy(notification) {
  const actor = notification.actor ? profileName(notification.actor) : 'A StudyCo learner';
  if (notification.type === 'friend_request') return { title: actor, body: 'sent you a friend request.', icon: '＋' };
  if (notification.type === 'friend_accepted') return { title: actor, body: 'accepted your friend request.', icon: '✓' };
  if (notification.type === 'message') return { title: actor, body: 'sent you a new message.', icon: '✉' };
  if (notification.type === 'call_missed') return { title: actor, body: 'missed your call.', icon: '☎' };
  return { title: actor, body: notification.message || 'shared an update with you.', icon: '✦' };
}

function renderNotifications() {
  const target = $('studyco-notification-list');
  if (!target) return;
  const unread = state.notifications.filter((item) => item.read !== true).length;
  $('studyco-notification-count').textContent = String(unread);
  setNavBadge('studyco-notification-badge', unread);
  target.innerHTML = state.notifications.length
    ? state.notifications.map((notification) => {
      const copy = notificationCopy(notification);
      return `<button class="studyco-notification-row${notification.read === true ? '' : ' unread'}" data-notification-id="${esc(notification.id)}" type="button"><span class="studyco-notification-icon">${copy.icon}</span><span class="studyco-notification-copy"><strong>${esc(copy.title)}</strong><span>${esc(copy.body)}</span><time>${esc(timeText(notification.createdAt))}</time></span>${notification.read === true ? '' : '<i class="studyco-notification-unread" aria-label="Unread"></i>'}</button>`;
    }).join('')
    : '<div class="studyco-empty">You are all caught up. New activity will appear here.</div>';
}

function subscribeNotifications() {
  state.notificationUnsub?.();
  state.notificationUnsub = onSnapshot(
    query(collection(db, 'studyco_notifications'), where('recipientId', '==', state.user.uid), limit(100)),
    async (snapshot) => {
      const notifications = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }))
        .sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt));
      await Promise.all(notifications.map(async (notification) => {
        notification.actor = await getProfile(notification.actorId);
      }));
      state.notifications = notifications;
      renderNotifications();
    },
    (error) => toast(error.message || 'Notifications could not load.', true)
  );
}

async function markNotificationRead(id) {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification || notification.read === true) return;
  await updateDoc(doc(db, 'studyco_notifications', id), { read: true }).catch(() => {});
}

async function markAllNotificationsRead() {
  const unread = state.notifications.filter((item) => item.read !== true);
  if (!unread.length) { toast('You are all caught up.'); return; }
  await Promise.all(unread.map((item) => updateDoc(doc(db, 'studyco_notifications', item.id), { read: true }).catch(() => {})));
  toast('All notifications marked as read.');
}

async function openNotification(id) {
  const notification = state.notifications.find((item) => item.id === id);
  if (!notification) return;
  await markNotificationRead(id);
  if (notification.type === 'message' && notification.actorId) {
    const relation = await relationship(notification.actorId);
    if (relation === 'friends') { await openChat(notification.actorId); return; }
  }
  setView('friends');
}

const templateClass = (name) => `template-${['indigo', 'sunset', 'ocean', 'gold', 'night', 'berry'].includes(name) ? name : 'indigo'}`;
async function uploadImage(file, path) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('StudyCo Meet accepts images only. Video uploads are disabled.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image below 25 MB.');
  if (typeof window.aqsUploadFile === 'function') return window.aqsUploadFile(file, path);
  throw new Error('Cloudinary storage is not ready. Please ask the administrator to configure it.');
}

async function uploadAttachment(file, path) {
  if (!file) return '';
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file below 25 MB.');
  if (typeof window.aqsUploadFile === 'function') return window.aqsUploadFile(file, path);
  throw new Error('File storage is not ready. Please ask the administrator to configure it.');
}

async function getProfile(uid) {
  if (!uid) return null;
  if (state.profiles.has(uid)) return state.profiles.get(uid);
  const snap = await getDoc(doc(db, 'social_profiles', uid));
  if (!snap.exists()) return null;
  const profile = { id: snap.id, ...snap.data() };
  state.profiles.set(uid, profile); return profile;
}

async function getPresence(uid) {
  if (!uid) return null;
  if (state.presence.has(uid)) return state.presence.get(uid);
  try {
    const snap = await getDoc(doc(db, 'studyco_presence', uid));
    const presence = snap.exists() ? snap.data() : null;
    if (presence) state.presence.set(uid, presence);
    return presence;
  } catch (_) {
    return null;
  }
}

function watchPresence(uid) {
  if (!uid || state.presenceUnsubs.has(uid)) return;
  const unsubscribe = onSnapshot(doc(db, 'studyco_presence', uid), (snapshot) => {
    state.presence.set(uid, snapshot.exists() ? snapshot.data() : null);
    renderChatList();
    if (uid === state.activeChatUid) updateActiveChatPresence();
  }, () => {
    state.presence.set(uid, null);
    renderChatList();
    if (uid === state.activeChatUid) updateActiveChatPresence();
  });
  state.presenceUnsubs.set(uid, unsubscribe);
}

function stopPresenceWatchers() {
  state.presenceUnsubs.forEach((unsubscribe) => unsubscribe());
  state.presenceUnsubs.clear();
  state.presence.clear();
}

async function setPresence(online) {
  if (!state.user) return;
  const presence = {
    uid: state.user.uid,
    online: Boolean(online),
    updatedAt: serverTimestamp()
  };
  if (!online) presence.lastSeen = serverTimestamp();
  try {
    await setDoc(doc(db, 'studyco_presence', state.user.uid), presence, { merge: true });
  } catch (_) {
    /* Presence must never block chat or calls if rules are being deployed. */
  }
}

function startPresence() {
  clearInterval(state.presenceHeartbeat);
  setPresence(true);
  state.presenceHeartbeat = setInterval(() => {
    if (document.visibilityState === 'visible') setPresence(true);
  }, 30000);
  if (!state.presenceWired) {
    state.presenceWired = true;
    document.addEventListener('visibilitychange', () => setPresence(document.visibilityState === 'visible'));
    window.addEventListener('beforeunload', () => { setPresence(false); });
  }
}

function stopPresenceHeartbeat() {
  clearInterval(state.presenceHeartbeat);
  state.presenceHeartbeat = null;
}

async function ensureProfile(user) {
  const existing = await getProfile(user.uid);
  if (existing) { state.profile = existing; return existing; }
  let legacy = {};
  try { const snap = await getDoc(doc(db, 'users', user.uid)); if (snap.exists()) legacy = snap.data(); } catch (_) {}
  const fallback = {
    uid: user.uid, displayName: user.displayName || legacy.name || user.email?.split('@')[0] || 'StudyCo learner',
    username: legacy.username || (user.email || 'learner').split('@')[0].replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'learner',
    email: user.email || '', loginIdentifier: user.email || '', bio: '', studentStatus: '',
    school: legacy.institution || '', department: legacy.department || '', major: '',
    photoURL: user.photoURL || '', coverURL: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'social_profiles', user.uid), fallback, { merge: true });
  state.profile = { ...fallback, id: user.uid }; state.profiles.set(user.uid, state.profile);
  return state.profile;
}

function showAuth() {
  $('studyco-auth-screen').hidden = false; $('studyco-app-screen').hidden = true;
  const returnPath = `${window.location.pathname.split('/').pop() || 'studyco-meet.html'}${window.location.search}`;
  const loginUrl = `login.html?redirect=${encodeURIComponent(returnPath)}`;
  const link = $('studyco-auth-link');
  if (link) link.href = loginUrl;
  /* The social area never owns authentication. Send signed-out users to the
     single SmartQuiz login page, preserving their destination for return. */
  window.setTimeout(() => window.location.replace(loginUrl), 250);
}

function showApp() {
  $('studyco-auth-screen').hidden = true; $('studyco-app-screen').hidden = false;
}

function renderProfile() {
  const p = state.profile || {};
  $('studyco-top-name').textContent = profileName(p);
  $('studyco-hello-name').textContent = `, ${profileName(p).split(' ')[0] || 'there'}`;
  $('studyco-mini-profile').innerHTML = `${avatar(p, 'small')}<div><strong>${esc(profileName(p))}</strong><span>${esc(p.username ? `@${p.username}` : 'Complete your profile')}</span></div>`;
  $('studyco-composer-avatar').innerHTML = avatar(p, 'small');
  $('studyco-top-avatar').innerHTML = avatar(p, 'small');
  $('studyco-profile-avatar').innerHTML = avatar(p, 'large');
  $('studyco-profile-name').textContent = profileName(p);
  $('studyco-profile-handle').textContent = p.username ? `@${p.username}` : '';
  $('studyco-profile-bio').textContent = p.bio || 'Tell your study circle about yourself.';
  $('studyco-profile-school').textContent = p.school ? `School: ${p.school}` : '';
  $('studyco-profile-major').textContent = [p.department, p.major].filter(Boolean).join(' · ');
  $('studyco-profile-location').textContent = p.location || '';
  $('studyco-profile-contact').textContent = p.loginIdentifier || p.email || '';
  $('studyco-profile-status').textContent = p.studentStatus || 'Learning';
  $('studyco-profile-about-copy').textContent = p.bio || 'Add a short bio so classmates know what you are learning and how they can connect with you.';
  const profileFields = [p.displayName, p.bio, p.photoURL, p.school, p.department || p.major, p.location];
  const complete = profileFields.filter(Boolean).length;
  const completion = Math.round((complete / profileFields.length) * 100);
  $('studyco-profile-completion').textContent = `${completion}%`;
  $('studyco-profile-progress-label').textContent = `${complete} of ${profileFields.length} details`;
  $('studyco-profile-progress-bar').style.width = `${completion}%`;
  $('studyco-profile-post-count').textContent = String(state.posts.filter((post) => post.userId === state.user.uid).length);
  $('studyco-profile-friend-count').textContent = String(state.friends.length);
  const cover = $('studyco-profile-cover');
  cover.innerHTML = `${p.coverURL ? `<img src="${esc(p.coverURL)}" alt="Cover banner">` : ''}<div class="studyco-profile-cover-shade"></div>`;
}

function viewHash(view, chatUid = '') {
  return view === 'messages' && chatUid ? `#messages/${encodeURIComponent(chatUid)}` : `#${view}`;
}

function setView(view, { updateUrl = true, chatUid = view === 'messages' ? null : state.activeChatUid } = {}) {
  if (view !== 'home' && !$('studyco-post-editor')?.hidden) closePostEditor();
  if (view === 'messages' && !chatUid && state.activeChatUid) {
    state.activeChatUid = null;
    state.activeChatId = null;
    state.messageUnsub?.();
    state.messageUnsub = null;
  }
  state.activeView = view;
  if (updateUrl && window.location.hash !== viewHash(view, chatUid)) {
    window.history.pushState({ studycoView: view, chatUid }, '', viewHash(view, chatUid));
  }
  const messagesShell = document.querySelector('.studyco-messages-shell');
  if (messagesShell) messagesShell.classList.toggle('chat-open', view === 'messages' && Boolean(chatUid));
  document.querySelectorAll('[data-studyco-view]').forEach((button) => button.classList.toggle('active', button.dataset.studycoView === view));
  document.querySelectorAll('.studyco-view').forEach((section) => section.classList.toggle('active', section.id === `studyco-view-${view}`));
  const menu = $('studyco-menu-panel');
  if (menu) menu.hidden = true;
  if (view === 'friends') loadSocialLists();
  if (view === 'profile') { renderProfile(); renderProfilePosts(); }
  if (view === 'messages') loadChats();
  if (view === 'notifications') renderNotifications();
}

async function syncRoute() {
  const parts = window.location.hash.replace(/^#/, '').split('/');
  const view = ['search', 'friends', 'messages', 'notifications', 'profile'].includes(parts[0]) ? parts[0] : 'home';
  setView(view, { updateUrl: false, chatUid: parts[1] ? decodeURIComponent(parts[1]) : '' });
  if (view === 'messages' && parts[1] && state.user) {
    await openChat(decodeURIComponent(parts[1]), { updateUrl: false });
  }
}

function renderPostPreview() {
  const preview = $('studyco-post-preview'); const text = $('studyco-post-text').value.trim();
  const hasContent = Boolean(text || state.postImage);
  preview.hidden = !hasContent; preview.className = `studyco-post-preview ${templateClass(state.selectedTemplate)}`;
  preview.innerHTML = `${text ? `<span>${esc(text)}</span>` : ''}${state.postImage ? `<img src="${esc(URL.createObjectURL(state.postImage))}" alt="Selected study image">` : ''}`;
}

function renderPostAttachmentStatus() {
  const status = $('studyco-post-attachment-status');
  if (!status) return;
  const attachments = [state.postImage?.name ? `Photo: ${state.postImage.name}` : '', state.postFile?.name ? `File: ${state.postFile.name}` : ''].filter(Boolean);
  status.textContent = attachments.join(' · ');
  status.hidden = attachments.length === 0;
}

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) {
    return '';
  }
}

function openPostEditor() {
  const editor = $('studyco-post-editor'); const composer = $('studyco-composer');
  if (!editor || !composer) return;
  $('studyco-post-editor-body').appendChild(composer);
  editor.hidden = false;
  composer.classList.add('is-open');
  document.body.classList.add('studyco-post-editor-open');
  $('studyco-post-text').focus();
}

function closePostEditor() {
  const editor = $('studyco-post-editor'); const composer = $('studyco-composer');
  if (!editor || !composer) return;
  $('studyco-composer-slot').appendChild(composer);
  editor.hidden = true;
  composer.classList.remove('is-open');
  document.body.classList.remove('studyco-post-editor-open');
}

async function findPeople(term = '', { broad = false } = {}) {
  const needle = term.trim().toLowerCase();
  const snap = await getDocs(query(collection(db, 'social_profiles'), limit(120)));
  return snap.docs.map((item) => ({ id: item.id, ...item.data() }))
    .filter((profile) => profile.id !== state.user.uid && !state.dismissedSuggestions.has(profile.id)
      && (!needle || [profileName(profile), profile.username, ...(broad ? [profile.school, profile.department, profile.major] : [])].filter(Boolean).join(' ').toLowerCase().includes(needle)))
    .slice(0, 12);
}

async function findPosts(term) {
  const needle = term.trim().toLowerCase();
  const matches = await Promise.all(state.posts.map(async (post) => {
    const author = await getProfile(post.userId);
    const searchable = `${post.content || ''} ${post.fileName || ''} ${post.linkUrl || ''} ${profileName(author)} ${author?.username || ''} ${author?.school || ''} ${author?.department || ''}`.toLowerCase();
    return searchable.includes(needle) ? post : null;
  }));
  return matches.filter(Boolean);
}

async function renderSearchResults(value) {
  const term = value.trim();
  const panel = $('studyco-search-results');
  if (!panel) return;
  if (!term) {
    panel.hidden = true;
    $('studyco-search-people-group').hidden = true;
    $('studyco-search-posts-group').hidden = true;
    return;
  }

  const requestId = ++state.searchRequestId;
  panel.hidden = false;
  $('studyco-search-title').textContent = `Results for “${term}”`;
  $('studyco-search-empty').hidden = true;
  $('studyco-search-people-group').hidden = false;
  $('studyco-search-posts-group').hidden = false;
  $('studyco-search-people-results').innerHTML = '<div class="studyco-card studyco-empty">Finding people...</div>';
  $('studyco-search-post-results').innerHTML = '<div class="studyco-card studyco-empty">Finding posts...</div>';

  const [profiles, posts] = await Promise.all([findPeople(term, { broad: true }), findPosts(term)]);
  if (requestId !== state.searchRequestId || $('studyco-page-search')?.value.trim() !== term) return;
  profiles.forEach((profile) => state.profiles.set(profile.id, profile));
  await renderPeople(profiles, $('studyco-search-people-results'));
  await renderFeed($('studyco-search-post-results'), posts);
  $('studyco-search-people-group').hidden = !profiles.length;
  $('studyco-search-posts-group').hidden = !posts.length;
  $('studyco-search-empty').hidden = Boolean(profiles.length || posts.length);
}

async function renderPost(post) {
  const [author, likesSnap, commentsSnap] = await Promise.all([
    getProfile(post.userId), getDocs(collection(db, 'studyco_posts', post.id, 'likes')),
    post.commentCount == null ? getDocs(query(collection(db, 'studyco_posts', post.id, 'comments'), limit(1))) : Promise.resolve(null)
  ]);
  const liked = likesSnap.docs.some((item) => item.id === state.user.uid);
  const text = post.content ? `<div class="studyco-post-body">${esc(post.content)}</div>` : '';
  const image = post.imageUrl ? `<img class="studyco-post-image" src="${esc(post.imageUrl)}" alt="Post attachment">` : '';
  const file = post.fileUrl ? `<a class="studyco-post-file" href="${esc(post.fileUrl)}" target="_blank" rel="noopener">📎 ${esc(post.fileName || 'Open attached file')}</a>` : '';
  const linkUrl = normalizeUrl(post.linkUrl);
  const link = linkUrl ? `<a class="studyco-post-link" href="${esc(linkUrl)}" target="_blank" rel="noopener">${esc(linkUrl)}</a>` : '';
  const commentCount = Number(post.commentCount ?? commentsSnap?.size ?? 0);
  const likeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H4V10h3Zm3 10h6.7c.9 0 1.7-.6 2-1.4l1.8-5.5A1.7 1.7 0 0 0 18.9 11H15l.5-3.1c.2-1.1-.5-2.2-1.6-2.5L13 5l-3 5v10Z"/></svg>';
  const commentIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2v-4.2a7.5 7.5 0 1 1 16-5.3Z"/></svg>';
  return `<article class="studyco-card studyco-post" data-post-id="${esc(post.id)}"><div class="studyco-post-head">${avatar(author, 'small')}<div><strong>${esc(profileName(author))}</strong><span>${esc(author?.school || author?.username || 'StudyCo learner')} · ${timeText(post.createdAt)}</span></div><button class="studyco-post-menu" type="button" aria-label="More options">•••</button></div>${text}${image}${file}${link}<div class="studyco-post-actions"><button class="${liked ? 'liked' : ''}" data-post-action="like" data-post-id="${esc(post.id)}"><span class="studyco-action-icon">${likeIcon}</span><span>Like</span><span class="studyco-action-count">${likesSnap.size}</span></button><button data-post-action="comments" data-post-id="${esc(post.id)}"><span class="studyco-action-icon">${commentIcon}</span><span>Comment</span><span class="studyco-action-count">${commentCount}</span></button><button data-post-action="share" data-post-id="${esc(post.id)}"><span class="studyco-action-icon">↗</span><span>Share</span></button></div><div class="studyco-comments" data-comments-panel hidden></div><form class="studyco-comment-form" data-comment-post="${esc(post.id)}" hidden><input type="text" maxlength="500" placeholder="Write a comment..."><button type="submit">Send</button></form></article>`;
}

async function loadPostComments(postId, article) {
  const panel = article.querySelector('[data-comments-panel]');
  const form = article.querySelector('[data-comment-post]');
  if (!panel || !form) return;
  panel.innerHTML = '<div class="studyco-empty">Loading comments...</div>';
  panel.hidden = false;
  form.hidden = false;
  const snapshot = await getDocs(collection(db, 'studyco_posts', postId, 'comments'));
  const comments = await Promise.all(snapshot.docs
    .sort((a, b) => timeMs(a.data().createdAt) - timeMs(b.data().createdAt))
    .map(async (item) => {
      const data = item.data(); const commenter = await getProfile(data.userId);
      return `<div class="studyco-comment">${avatar(commenter, 'small')}<div><strong>${esc(profileName(commenter))}</strong><span>${esc(data.text)}</span></div></div>`;
    }));
  panel.innerHTML = comments.join('') || '<div class="studyco-empty">No comments yet. Start the conversation.</div>';
  panel.dataset.loaded = 'true';
}

async function sharePost(postId) {
  const url = window.location.href.split('#')[0] + `#post/${encodeURIComponent(postId)}`;
  try {
    if (navigator.share) await navigator.share({ title: 'StudyCo post', url });
    else if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(url); toast('Post link copied.'); }
    else toast(url);
  } catch (error) {
    if (error?.name !== 'AbortError') toast('The post could not be shared.', true);
  }
}

async function renderFeed(target = $('studyco-post-feed'), posts = state.posts) {
  if (!posts.length) { target.innerHTML = '<div class="studyco-card studyco-empty">No post yet.</div>'; return; }
  target.innerHTML = '<div class="studyco-card studyco-empty">Loading your circle...</div>';
  target.innerHTML = (await Promise.all(posts.map(renderPost))).join('');
}

async function renderProfilePosts() {
  await renderFeed($('studyco-profile-posts'), state.posts.filter((post) => post.userId === state.user.uid));
}

function subscribeFeed() {
  state.feedUnsub?.();
  state.feedUnsub = onSnapshot(query(collection(db, 'studyco_posts'), limit(60)), (snapshot) => {
    state.posts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt));
    renderFeed(); if (state.activeView === 'profile') renderProfilePosts(); refreshNavCounts();
  }, (error) => toast(error.message || 'The feed could not load.', true));
}

async function publishPost() {
  const content = $('studyco-post-text').value.trim(); const image = state.postImage; const file = state.postFile;
  const linkUrl = normalizeUrl($('studyco-post-url').value);
  if (!content && !image && !file && !linkUrl) { toast('Write something, add an attachment, or add a URL first.', true); return; }
  const button = $('studyco-publish-post'); button.disabled = true;
  try {
    const imageUrl = image ? await uploadImage(image, `studyco/${state.user.uid}/posts/${Date.now()}-${image.name.replace(/[^a-z0-9._-]/gi, '')}`) : '';
    const fileUrl = file ? await uploadAttachment(file, `studyco/${state.user.uid}/posts/files/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '')}`) : '';
    await addDoc(collection(db, 'studyco_posts'), { userId: state.user.uid, content: content.slice(0, 1000), imageUrl, fileUrl, fileName: file?.name || '', linkUrl, bgTemplateId: content.length <= 240 ? state.selectedTemplate : '', likeCount: 0, commentCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $('studyco-post-text').value = ''; $('studyco-post-image').value = ''; $('studyco-post-file').value = ''; $('studyco-post-url').value = ''; $('studyco-post-url-row').hidden = true; $('studyco-post-attachment-status').hidden = true; state.postImage = null; state.postFile = null; $('studyco-post-preview').hidden = true; closePostEditor(); toast('Posted to StudyCo Meet.');
  } catch (error) { toast(error.message || 'Your post could not be published.', true); } finally { button.disabled = false; }
}

async function toggleLike(postId) {
  const likeRef = doc(db, 'studyco_posts', postId, 'likes', state.user.uid);
  const existing = await getDoc(likeRef);
  if (existing.exists()) await deleteDoc(likeRef); else await setDoc(likeRef, { userId: state.user.uid, createdAt: serverTimestamp() });
  const likes = await getDocs(collection(db, 'studyco_posts', postId, 'likes'));
  await updateDoc(doc(db, 'studyco_posts', postId), { likeCount: likes.size });
}

async function addComment(postId, text) {
  if (!text.trim()) return;
  await addDoc(collection(db, 'studyco_posts', postId, 'comments'), { userId: state.user.uid, text: text.trim().slice(0, 500), createdAt: serverTimestamp() });
  const comments = await getDocs(collection(db, 'studyco_posts', postId, 'comments'));
  await updateDoc(doc(db, 'studyco_posts', postId), { commentCount: comments.size });
}

function renderStories() {
  const active = state.stories.filter((story) => timeMs(story.expiresAt) > Date.now());
  $('studyco-story-list').innerHTML = `<button class="studyco-story add" id="studyco-story-add-card" type="button"><span>Add a story</span></button>${active.map((story) => `<button class="studyco-story" data-story-id="${esc(story.id)}" style="background:${esc(story.bgColor || '#5b5bd6')}">${story.imageUrl ? `<img src="${esc(story.imageUrl)}" alt="">` : ''}<span>${esc(initials(state.profiles.get(story.userId)))}</span><strong>${esc(profileName(state.profiles.get(story.userId)))}<br><small>${esc(timeText(story.createdAt))}</small></strong></button>`).join('')}`;
}

function subscribeStories() {
  state.storyUnsub?.();
  state.storyUnsub = onSnapshot(query(collection(db, 'studyco_stories'), limit(100)), async (snapshot) => {
    state.stories = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).filter((story) => timeMs(story.expiresAt) > Date.now()).sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt));
    await Promise.all(state.stories.map((story) => getProfile(story.userId))); renderStories();
  }, (error) => toast(error.message || 'Stories could not load.', true));
}

async function createStory(event) {
  event.preventDefault();
  const text = $('studyco-story-text').value.trim(); const file = state.storyImage;
  if (!text && !file) { toast('Add a caption or an image to create a story.', true); return; }
  try {
    const imageUrl = file ? await uploadImage(file, `studyco/${state.user.uid}/stories/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '')}`) : '';
    await addDoc(collection(db, 'studyco_stories'), { userId: state.user.uid, content: text.slice(0, 240), imageUrl, bgColor: state.storyColor, expiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)), createdAt: serverTimestamp() });
    $('studyco-story-form').reset(); state.storyImage = null; $('studyco-story-preview').style.backgroundImage = ''; closeModal('studyco-story-modal'); toast('Story shared for 24 hours.');
  } catch (error) { toast(error.message || 'Story could not be shared.', true); }
}

function showStory(story) {
  const author = state.profiles.get(story.userId) || {};
  $('studyco-story-viewer-content').innerHTML = `${story.imageUrl ? `<img src="${esc(story.imageUrl)}" alt="">` : ''}<div class="story-caption">${esc(story.content || '')}<small><br>${esc(profileName(author))}</small></div>`;
  $('studyco-story-viewer').hidden = false;
}

async function relationship(uid) {
  const snap = await getDoc(doc(db, 'social_friend_requests', pairId(state.user.uid, uid)));
  if (!snap.exists()) return 'none'; const data = snap.data();
  if (data.status === 'accepted') return 'friends';
  return data.recipientId === state.user.uid ? 'incoming' : 'outgoing';
}

async function renderPeople(profiles, target) {
  if (!profiles.length) { target.innerHTML = '<div class="studyco-card studyco-empty">No classmates matched that search.</div>'; return; }
  const relations = await Promise.all(profiles.map((profile) => relationship(profile.id)));
  target.innerHTML = profiles.map((profile, index) => {
    const relation = relations[index]; let action = '';
    if (relation === 'none') action = `<button class="studyco-button primary" data-friend-action="request" data-uid="${esc(profile.id)}">Add friend</button><button class="studyco-button soft" data-friend-action="dismiss" data-uid="${esc(profile.id)}">Remove</button>`;
    if (relation === 'outgoing') action = '<button class="studyco-button soft" disabled>Requested</button>';
    if (relation === 'incoming') action = `<button class="studyco-button success" data-friend-action="accept" data-uid="${esc(profile.id)}">Accept</button>`;
    if (relation === 'friends') action = `<button class="studyco-button soft" data-friend-action="message" data-uid="${esc(profile.id)}">Message</button><button class="studyco-button danger" data-friend-action="unfriend" data-uid="${esc(profile.id)}">Unfriend</button>`;
    return `<article class="studyco-person">${avatar(profile)}<strong>${esc(profileName(profile))}</strong><span>${esc([profile.school, profile.department || profile.major, profile.location].filter(Boolean).join(' · ') || (profile.username ? `@${profile.username}` : 'StudyCo learner'))}</span><div class="studyco-person-actions">${action}</div></article>`;
  }).join('');
}

async function loadPeople(term = '') {
  const target = $('studyco-people-results'); target.innerHTML = '<div class="studyco-card studyco-empty">Finding classmates...</div>';
  if (!term.trim()) { target.innerHTML = ''; return; }
  const profiles = await findPeople(term);
  profiles.forEach((profile) => state.profiles.set(profile.id, profile)); await renderPeople(profiles, target);
}

async function handleFriendAction(uid, action) {
  const ref = doc(db, 'social_friend_requests', pairId(state.user.uid, uid));
  try {
    if (action === 'dismiss') {
      state.dismissedSuggestions.add(uid);
      try { localStorage.setItem(`studyco-dismissed-suggestions:${state.user.uid}`, JSON.stringify([...state.dismissedSuggestions])); } catch (_) {}
      await loadPeople('');
      toast('Suggestion removed.');
      return;
    }
    if (action === 'request') {
      await setDoc(ref, { requesterId: state.user.uid, recipientId: uid, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      await createNotification(uid, 'friend_request', ref.id).catch(() => {});
    }
    if (action === 'accept') {
      await updateDoc(ref, { status: 'accepted', updatedAt: serverTimestamp() });
      await createNotification(uid, 'friend_accepted', ref.id).catch(() => {});
    }
    if (action === 'unfriend' || action === 'reject' || action === 'cancel') await deleteDoc(ref);
    if (action === 'message') { setView('messages'); openChat(uid); return; }
    await loadPeople(''); await loadSocialLists(); refreshNavCounts(); toast(action === 'request' ? 'Friend request sent.' : 'Friendships updated.');
  } catch (error) { toast(error.message || 'That action could not be completed.', true); }
}

async function loadSocialLists() {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, 'social_friend_requests'), where('requesterId', '==', state.user.uid), limit(100))),
    getDocs(query(collection(db, 'social_friend_requests'), where('recipientId', '==', state.user.uid), limit(100)))
  ]);
  const requests = received.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === 'pending');
  const sentRequests = sent.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === 'pending');
  const friendIds = [...sent.docs, ...received.docs].map((item) => item.data()).filter((item) => item.status === 'accepted').map((item) => item.requesterId === state.user.uid ? item.recipientId : item.requesterId);
  state.requests = await Promise.all(requests.map(async (item) => ({ ...item, profile: await getProfile(item.requesterId) })));
  state.sentRequests = await Promise.all(sentRequests.map(async (item) => ({ ...item, profile: await getProfile(item.recipientId) })));
  state.friends = (await Promise.all([...new Set(friendIds)].map(async (uid) => ({ uid, profile: await getProfile(uid) })))).filter((item) => item.profile);
  const incomingRequestHtml = state.requests.map((item) => `<div class="studyco-list-row studyco-friend-row">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>Wants to be your friend</span></div><button class="studyco-button success" data-friend-action="accept" data-uid="${esc(item.requesterId)}">Confirm</button><button class="studyco-button danger" data-friend-action="reject" data-uid="${esc(item.requesterId)}">Remove</button></div>`).join('');
  const sentRequestHtml = state.sentRequests.map((item) => `<div class="studyco-list-row studyco-friend-row studyco-sent-request">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>Friend request sent</span></div><button class="studyco-button danger" data-friend-action="cancel" data-uid="${esc(item.recipientId)}">Remove</button></div>`).join('');
  const hasRequests = Boolean(incomingRequestHtml || sentRequestHtml);
  const requestHtml = hasRequests ? `${incomingRequestHtml}${sentRequestHtml}` : '';
  const suggestions = (await getDocs(query(collection(db, 'social_profiles'), limit(20)))).docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.id !== state.user.uid && !state.dismissedSuggestions.has(item.id) && !state.friends.some((friend) => friend.uid === item.id) && !state.requests.some((request) => request.requesterId === item.id) && !state.sentRequests.some((request) => request.recipientId === item.id)).slice(0, 6);
  suggestions.forEach((item) => state.profiles.set(item.id, item));
  const suggestionHtml = suggestions.map((item) => `<div class="studyco-list-row studyco-friend-row">${avatar(item, 'small')}<div><strong>${esc(profileName(item))}</strong><span>${esc(item.school || item.username ? (item.school || `@${item.username}`) : 'StudyCo learner')}</span></div><button class="studyco-button primary" data-friend-action="request" data-uid="${esc(item.id)}">Add friend</button><button class="studyco-button danger" data-friend-action="dismiss" data-uid="${esc(item.id)}">Remove</button></div>`).join('') || '<div class="studyco-empty">Suggestions will appear here.</div>';
  $('studyco-request-section').hidden = !hasRequests;
  $('studyco-right-request-section').hidden = state.requests.length === 0;
  $('studyco-request-list').innerHTML = requestHtml; $('studyco-request-count').textContent = String(state.requests.length);
  $('studyco-suggestion-list').innerHTML = suggestionHtml;
  setNavBadge('studyco-friend-badge', state.requests.length);
  $('studyco-right-requests').innerHTML = state.requests.slice(0, 3).map((item) => `<div class="studyco-list-row studyco-friend-row">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>Friend request</span></div><button class="studyco-button success" data-friend-action="accept" data-uid="${esc(item.requesterId)}">Confirm</button><button class="studyco-button danger" data-friend-action="reject" data-uid="${esc(item.requesterId)}">Remove</button></div>`).join('') || '<div class="studyco-empty">No new requests.</div>';
  $('studyco-right-suggestions').innerHTML = suggestions.slice(0, 4).map((item) => `<div class="studyco-list-row studyco-friend-row">${avatar(item, 'small')}<div><strong>${esc(profileName(item))}</strong></div><button class="studyco-button primary" data-friend-action="request" data-uid="${esc(item.id)}">Add friend</button><button class="studyco-button danger" data-friend-action="dismiss" data-uid="${esc(item.id)}">Remove</button></div>`).join('') || '<div class="studyco-empty">Suggestions will appear here.</div>';
  if (state.activeView === 'profile') renderProfile();
  if (state.activeView === 'messages') renderChatList();
}

async function ensureConversation(uid) {
  const id = pairId(state.user.uid, uid);
  const conversationRef = doc(db, 'social_conversations', id);
  const existing = await getDoc(conversationRef);
  if (existing.exists()) {
    const participantIds = existing.data().participantIds;
    if (Array.isArray(participantIds) && participantIds.includes(state.user.uid) && participantIds.includes(uid)) return id;
    throw new Error('This conversation has invalid participants.');
  }
  await setDoc(conversationRef, {
    participantIds: [state.user.uid, uid].sort(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  return id;
}

function renderChatList() {
  const term = $('studyco-message-search')?.value.trim().toLowerCase() || '';
  const conversationsByUid = new Map(state.conversations.filter((chat) => chat.profile).map((chat) => [chat.uid, chat]));
  const validChats = state.friends.map((friend) => conversationsByUid.get(friend.uid) || {
    id: pairId(state.user.uid, friend.uid),
    uid: friend.uid,
    profile: friend.profile,
    data: {}
  });
  validChats.forEach((chat) => watchPresence(chat.uid));
  const visibleChats = validChats
    .filter((chat) => !term || `${profileName(chat.profile)} ${chat.data.lastMessageText || ''}`.toLowerCase().includes(term))
    .sort((a, b) => timeMs(b.data.lastMessageAt || b.data.updatedAt) - timeMs(a.data.lastMessageAt || a.data.updatedAt) || profileName(a.profile).localeCompare(profileName(b.profile)));
  const unreadChats = validChats.filter((chat) => chat.data.lastSenderId && chat.data.lastSenderId !== state.user.uid && chat.data.lastReadBy?.[state.user.uid] !== true);
  $('studyco-chat-count').textContent = String(validChats.length);
  $('studyco-message-badge').hidden = unreadChats.length < 1;
  $('studyco-message-badge').textContent = unreadChats.length > 99 ? '99+' : String(unreadChats.length || '');
  $('studyco-chat-list').innerHTML = visibleChats.map((chat) => `<button class="${chat.uid === state.activeChatUid ? 'active' : ''}${chat.data.lastSenderId && chat.data.lastSenderId !== state.user.uid && chat.data.lastReadBy?.[state.user.uid] !== true ? ' unread' : ''}" data-chat-uid="${esc(chat.uid)}" type="button">${avatarWithPresence(chat.profile, chat.uid, 'small')}<div><strong>${esc(profileName(chat.profile))}</strong><span>${esc(chat.data.lastMessageText || lastSeenText(state.presence.get(chat.uid)))}</span></div><time>${esc(timeText(chat.data.lastMessageAt || chat.data.updatedAt))}</time></button>`).join('') || '<div class="studyco-empty">Your accepted friends will appear here.</div>';
}

function updateActiveChatPresence() {
  const status = $('studyco-chat-presence');
  if (!status || !state.activeChatUid) return;
  const presence = state.presence.get(state.activeChatUid);
  status.textContent = lastSeenText(presence);
  status.classList.toggle('online', presenceIsOnline(presence));
  const dot = $('studyco-chat-presence-dot');
  if (dot) {
    dot.classList.toggle('online', presenceIsOnline(presence));
    dot.title = lastSeenText(presence);
  }
}

function subscribeChats() {
  state.chatListUnsub?.();
  state.chatListUnsub = onSnapshot(query(collection(db, 'social_conversations'), where('participantIds', 'array-contains', state.user.uid), limit(80)), async (snapshot) => {
    const chats = await Promise.all(snapshot.docs.map(async (item) => {
    const data = item.data(); const uid = data.participantIds.find((value) => value !== state.user.uid);
    return { id: item.id, uid, profile: await getProfile(uid), data };
    }));
    state.conversations = chats.sort((a, b) => timeMs(b.data.lastMessageAt || b.data.updatedAt) - timeMs(a.data.lastMessageAt || a.data.updatedAt));
    renderChatList();
  }, (error) => toast(error.message || 'Messages could not load.', true));
}

function loadChats() {
  if (!state.chatListUnsub) subscribeChats();
  else renderChatList();
}

async function markMessagesRead(messages) {
  const unread = messages.filter((message) => message.senderId !== state.user.uid && message.is_read !== true);
  if (!unread.length) return;
  await Promise.all(unread.slice(-50).map((message) => updateDoc(
    doc(db, 'social_conversations', state.activeChatId, 'messages', message.id),
    { is_read: true, readAt: serverTimestamp() }
  ).catch(() => {})));
  await updateDoc(doc(db, 'social_conversations', state.activeChatId), {
    [`lastReadBy.${state.user.uid}`]: true
  }).catch(() => {});
}

function renderMessages(messages, profile) {
  const target = document.querySelector('.studyco-chat-messages'); if (!target) return;
  target.innerHTML = messages.length ? messages.map((message) => {
    const body = esc(message.messageText || message.text || '').replace(/\n/g, '<br>');
    const attachment = message.attachmentUrl
      ? `<a class="studyco-message-attachment" href="${esc(message.attachmentUrl)}" target="_blank" rel="noopener"><span>${message.attachmentType?.startsWith('image/') ? '▧' : '↧'}</span><b>${esc(message.attachmentName || 'Shared file')}</b><small>${esc(message.attachmentType || 'Attachment')}</small></a>`
      : '';
    return `<div class="studyco-message ${message.senderId === state.user.uid ? 'mine' : ''}">${message.senderId === state.user.uid ? '' : avatar(profile, 'small')}<div class="bubble">${body}${attachment}<time>${esc(timeText(message.createdAt))}</time></div></div>`;
  }).join('') : '<div class="studyco-chat-empty">Say hello to your study friend.</div>';
  target.scrollTop = target.scrollHeight;
}

async function openChat(uid, { updateUrl = true } = {}) {
  try {
    const profile = await getProfile(uid);
    if (!profile) { toast('That friend profile could not be found.', true); return; }
    const isAcceptedFriend = state.friends.some((friend) => friend.uid === uid);
    if (!isAcceptedFriend && await relationship(uid) !== 'friends') {
      toast('You can message accepted friends only.', true);
      return;
    }
    state.activeChatUid = uid;
    state.activeChatId = pairId(state.user.uid, uid);
    try {
      state.activeChatId = await ensureConversation(uid);
    } catch (error) {
      toast(error.message || 'The chat opened, but Firestore rules are blocking conversation setup.', true);
    }
    watchPresence(uid);
    setView('messages', { updateUrl, chatUid: uid });
    $('studyco-chat-panel').innerHTML = `<div class="studyco-chat-head"><button class="studyco-chat-back" data-chat-back type="button" aria-label="Back to friends">‹</button>${avatarWithPresence(profile, uid, 'small')}<div><strong>${esc(profileName(profile))}</strong><span id="studyco-chat-presence" class="studyco-chat-presence-text"></span></div><span id="studyco-chat-presence-dot" class="studyco-presence-dot" aria-hidden="true"></span><div class="studyco-chat-call-actions"><button class="studyco-button soft" data-start-call="${esc(uid)}" data-call-kind="audio" type="button">Voice</button><button class="studyco-button primary" data-start-call="${esc(uid)}" data-call-kind="video" type="button">Video</button><button class="studyco-button light" data-call-history type="button" aria-label="Open recent call activity">History</button></div></div><div class="studyco-chat-messages"></div><form class="studyco-chat-compose" id="studyco-chat-form"><textarea id="studyco-chat-input" maxlength="2000" placeholder="Write a message..."></textarea><div class="studyco-chat-compose-actions"><label class="studyco-attachment-button" title="Attach a file"><input id="studyco-chat-file" type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.txt"><span>↗</span><b>File</b></label><span id="studyco-chat-file-name" class="studyco-chat-file-name"></span><button class="studyco-button primary" type="submit">Send</button></div></form>`;
    updateActiveChatPresence();
    state.messageUnsub?.(); state.messageUnsub = onSnapshot(query(collection(db, 'social_conversations', state.activeChatId, 'messages'), limit(150)), async (snapshot) => {
      const messages = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => timeMs(a.createdAt) - timeMs(b.createdAt));
      renderMessages(messages, profile);
      await markMessagesRead(messages);
    }, (error) => toast(error.message || 'This conversation could not load.', true));
    renderChatList();
  } catch (error) {
    toast(error.message || 'This chat could not be opened.', true);
  }
}

function closeChat() {
  state.activeChatUid = null;
  state.activeChatId = null;
  state.messageUnsub?.();
  state.messageUnsub = null;
  setView('messages', { chatUid: '' });
  renderChatList();
}

async function sendMessage(event) {
  event.preventDefault();
  const input = $('studyco-chat-input'); const fileInput = $('studyco-chat-file');
  const button = event.target.querySelector('button[type="submit"]'); const text = input.value.trim(); const file = fileInput?.files?.[0];
  if (!text && !file) return;
  if (!state.activeChatUid) { toast('Choose a friend before sending a message.', true); return; }
  button.disabled = true;
  try {
    if (!state.activeChatId) state.activeChatId = await ensureConversation(state.activeChatUid);
    const attachmentUrl = file ? await uploadAttachment(file, `studyco/${state.user.uid}/messages/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '')}`) : '';
    const messageText = text.slice(0, 2000) || `Shared ${file?.name || 'a file'}`;
    await addDoc(collection(db, 'social_conversations', state.activeChatId, 'messages'), { senderId: state.user.uid, receiverId: state.activeChatUid, messageText, attachmentUrl, attachmentName: file?.name || '', attachmentType: file?.type || '', attachmentSize: file?.size || 0, createdAt: serverTimestamp(), is_read: false });
    await updateDoc(doc(db, 'social_conversations', state.activeChatId), { lastMessageText: messageText.slice(0, 120), lastMessageAt: serverTimestamp(), lastSenderId: state.user.uid, [`lastReadBy.${state.user.uid}`]: true, updatedAt: serverTimestamp() });
    await createNotification(state.activeChatUid, 'message', state.activeChatId, state.activeChatId).catch(() => {});
    input.value = ''; if (fileInput) fileInput.value = ''; if ($('studyco-chat-file-name')) $('studyco-chat-file-name').textContent = '';
  } catch (error) {
    toast(error.message || 'Your message could not be sent.', true);
  } finally {
    button.disabled = false;
  }
}

function getCallAudioConstraints() {
  return {
    echoCancellation: { ideal: true },
    noiseSuppression: { ideal: true },
    autoGainControl: { ideal: true },
    voiceIsolation: { ideal: true },
    channelCount: { ideal: 1, max: 1 },
    sampleRate: { ideal: 48000 },
    sampleSize: { ideal: 16 },
    latency: { ideal: 0 }
  };
}

function prepareCallAudioStream(stream) {
  const track = stream?.getAudioTracks?.()[0];
  if (!track) return;
  track.contentHint = 'speech';
  track.applyConstraints(getCallAudioConstraints()).catch(() => {});
}

function setNativeCallAudio(enabled) {
  try {
    const bridge = window.AqsPermissionsBridge;
    if (!bridge) return;
    if (enabled) bridge.beginCallAudio?.();
    else bridge.endCallAudio?.();
  } catch (_) {
    /* The website has no native bridge; Web Audio remains browser-controlled. */
  }
}

function showRemoteAudioUnlock(show) {
  const button = $('studyco-call-enable-audio');
  if (button) button.hidden = !show;
}

function callPeer(callId, remoteUid) {
  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  });
  const remoteStream = new MediaStream();
  const remoteAudio = $('studyco-call-remote-audio');
  const remoteVideo = $('studyco-call-remote-video');
  const pendingCandidates = [];
  const pendingCandidateIds = new Set();
  const addedCandidateIds = new Set();
  let remoteDescriptionReady = false;

  const playRemoteVideo = () => {
    if (!remoteVideo) return;
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.muted = true;
    remoteVideo.play().catch(() => {});
  };

  const playRemoteAudio = () => {
    if (!remoteAudio) return;
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.setAttribute('disableRemotePlayback', '');
    remoteAudio.muted = !state.speakerOn;
    remoteAudio.volume = 0.88;
    const playPromise = remoteAudio.play();
    if (playPromise?.then) {
      playPromise
        .then(() => showRemoteAudioUnlock(false))
        .catch(() => showRemoteAudioUnlock(true));
    }
  };

  const syncRemoteMedia = () => {
    if (remoteAudio && remoteStream.getAudioTracks().length) {
      remoteAudio.srcObject = remoteStream;
      playRemoteAudio();
    }
    if (remoteVideo && remoteStream.getVideoTracks().length) {
      remoteVideo.srcObject = remoteStream;
      remoteVideo.hidden = false;
      $('studyco-call-stage')?.classList.add('has-remote-video');
      playRemoteVideo();
    }
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) return;
    addDoc(collection(db, 'studyco_calls', callId, 'candidates'), {
      from: state.user.uid,
      candidate: event.candidate.toJSON(),
      createdAt: serverTimestamp()
    }).catch(() => {});
  };

  pc.ontrack = (event) => {
    /* Some WebViews deliver a stream with no tracks yet, while others only
       populate event.track. Keep both paths so audio is never dropped. */
    const tracks = [
      ...(event.streams?.[0]?.getTracks?.() || []),
      ...(event.track ? [event.track] : [])
    ];
    tracks.forEach((track) => {
      track.enabled = true;
      if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) remoteStream.addTrack(track);
      track.onunmute = syncRemoteMedia;
    });
    syncRemoteMedia();
    const incomingStream = event.streams?.[0];
    if (incomingStream) {
      if (remoteAudio && incomingStream.getAudioTracks?.().length) remoteAudio.srcObject = incomingStream;
      if (remoteVideo && incomingStream.getVideoTracks?.().length) {
        remoteVideo.srcObject = incomingStream;
        remoteVideo.hidden = false;
      }
    }
    if (remoteAudio) {
      remoteAudio.onloadedmetadata = playRemoteAudio;
      remoteAudio.oncanplay = playRemoteAudio;
    }
    if (remoteVideo) {
      remoteVideo.onloadedmetadata = playRemoteVideo;
      remoteVideo.oncanplay = playRemoteVideo;
    }
  };

  pc.onconnectionstatechange = () => {
    if (['failed', 'disconnected'].includes(pc.connectionState) && state.activeCallId === callId) {
      $('studyco-call-status').textContent = 'Connection interrupted. Trying to recover…';
    }
  };

  pc.oniceconnectionstatechange = () => {
    if (state.activeCallId !== callId) return;
    if (pc.iceConnectionState === 'failed') {
      $('studyco-call-status').textContent = 'Network could not connect the call.';
    }
  };

  const addRemoteCandidate = async (candidate) => {
    if (!candidate) return;
    const candidateId = [
      candidate.sdpMid || '',
      candidate.sdpMLineIndex ?? '',
      candidate.candidate || ''
    ].join(':');
    if (addedCandidateIds.has(candidateId) || pendingCandidateIds.has(candidateId)) return;
    if (!remoteDescriptionReady) {
      pendingCandidates.push(candidate);
      pendingCandidateIds.add(candidateId);
      return;
    }
    addedCandidateIds.add(candidateId);
    await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
  };

  pc.flushRemoteCandidates = async () => {
    remoteDescriptionReady = true;
    const candidates = pendingCandidates.splice(0);
    pendingCandidateIds.clear();
    await Promise.all(candidates.map(async (candidate) => {
      const candidateId = [
        candidate.sdpMid || '',
        candidate.sdpMLineIndex ?? '',
        candidate.candidate || ''
      ].join(':');
      if (addedCandidateIds.has(candidateId)) return;
      addedCandidateIds.add(candidateId);
      await pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
    }));
  };

  state.candidateUnsub?.();
  state.candidateUnsub = onSnapshot(
    collection(db, 'studyco_calls', callId, 'candidates'),
    (snapshot) => snapshot.docChanges().forEach((change) => {
      if (change.type !== 'removed') {
        const data = change.doc.data();
        if (data.from !== state.user.uid && data.candidate) addRemoteCandidate(data.candidate);
      }
    })
  );
  return pc;
}

function callDurationText(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function updateCallElapsed() {
  const elapsed = $('studyco-call-elapsed');
  if (elapsed && state.callStartedAt) elapsed.textContent = callDurationText(Date.now() - state.callStartedAt);
}

function startCallElapsed() {
  clearInterval(state.callElapsedTimer);
  state.callStartedAt = Date.now();
  updateCallElapsed();
  state.callElapsedTimer = setInterval(updateCallElapsed, 1000);
}

function stopCallElapsed() {
  clearInterval(state.callElapsedTimer);
  state.callElapsedTimer = null;
  state.callStartedAt = 0;
}

function stopRingingTone() {
  clearInterval(state.ringToneTimer);
  state.ringToneTimer = null;
  if (state.audioContext) {
    state.audioContext.close().catch(() => {});
    state.audioContext = null;
  }
}

function startRingingTone(kind = 'online') {
  stopRingingTone();
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const context = new AudioContext();
    state.audioContext = context;
    const play = () => {
      const now = context.currentTime;
       const notes = kind === 'online'
         ? [{ frequency: 520, offset: 0, duration: .7 }, { frequency: 660, offset: .78, duration: .82 }]
         : [{ frequency: 210, offset: 0, duration: .85 }, { frequency: 160, offset: .94, duration: .9 }];
      notes.forEach(({ frequency, offset, duration }) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = kind === 'online' ? 'sine' : 'triangle';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(.0001, now + offset);
         gain.gain.exponentialRampToValueAtTime(.2, now + offset + .045);
        gain.gain.exponentialRampToValueAtTime(.0001, now + offset + duration);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + duration + .02);
      });
    };
    context.resume().then(play).catch(() => {});
     state.ringToneTimer = setInterval(play, kind === 'online' ? 2800 : 2500);
  } catch (_) {
    /* A blocked audio context must not stop the call from connecting. */
  }
}

function getCallVideoConstraints() {
  return {
    width: { ideal: 1280, max: 1920 },
    height: { ideal: 720, max: 1080 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: 'user'
  };
}

async function getCallMediaStream(mode) {
  if (mode === 'video') {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: getCallAudioConstraints(),
        video: getCallVideoConstraints()
      });
    } catch (videoError) {
      try {
        const audioStream = await navigator.mediaDevices.getUserMedia({ audio: getCallAudioConstraints() });
        state.callMode = 'audio';
        toast('Camera access was unavailable, so the call continued as voice only.');
        return audioStream;
      } catch (_) {
        throw videoError;
      }
    }
  }
  return navigator.mediaDevices.getUserMedia({ audio: getCallAudioConstraints() });
}

function bindLocalVideo(stream) {
  const localVideo = $('studyco-call-local-video');
  const hasVideo = Boolean(stream?.getVideoTracks?.().length);
  const stage = $('studyco-call-stage');
  if (stage) stage.classList.toggle('has-local-video', hasVideo);
  if (!localVideo) return;
  localVideo.srcObject = hasVideo ? stream : null;
  localVideo.hidden = !hasVideo;
  if (hasVideo) {
    localVideo.muted = true;
    localVideo.playsInline = true;
    localVideo.play().catch(() => {});
  }
}

function updateCallModeUi() {
  const modal = $('studyco-call-modal');
  const isVideo = state.callMode === 'video';
  modal?.classList.toggle('is-video-call', isVideo);
  const camera = $('studyco-call-camera');
  if (camera) camera.hidden = !isVideo;
}

function updateCallControls() {
  const mute = $('studyco-call-mute');
  const camera = $('studyco-call-camera');
  const record = $('studyco-call-record');
  const translation = $('studyco-call-translation-toggle');
  if (mute) { mute.classList.toggle('active', state.muted); mute.querySelector('b').textContent = state.muted ? 'Unmute' : 'Mute'; }
  if (camera) {
    const track = state.localStream?.getVideoTracks?.()[0];
    camera.hidden = state.callMode !== 'video';
    camera.classList.toggle('active', Boolean(track?.enabled));
    camera.querySelector('b').textContent = track?.enabled ? 'Camera' : 'Camera off';
  }
  if (record) { record.classList.toggle('active', state.recording); record.querySelector('b').textContent = state.recording ? 'Stop recording' : 'Record'; }
  if (translation) {
    translation.checked = state.translation.enabled;
    translation.parentElement.querySelector('b').textContent = state.translation.enabled ? 'On' : 'Off';
  }
}

function openCallModal(profile, incoming = false, targetOnline = true, presence = null, mode = 'audio') {
  state.callProfile = profile || {};
  state.callIncoming = incoming;
  state.callMode = mode === 'video' ? 'video' : 'audio';
  $('studyco-call-label').textContent = incoming
    ? `Incoming ${state.callMode} call`
    : `Starting ${state.callMode} call`;
  $('studyco-call-name').textContent = profileName(profile);
  $('studyco-call-avatar').textContent = initials(profile);
  $('studyco-call-presence').textContent = incoming ? 'StudyCo call' : (targetOnline ? 'Online now' : 'Waiting for answer');
  $('studyco-call-status').textContent = incoming ? 'Your study friend is calling.' : 'Calling — waiting for answer.';
  $('studyco-call-last-seen').textContent = incoming || targetOnline ? '' : lastSeenText(presence);
  $('studyco-call-accept').hidden = !incoming;
  $('studyco-call-decline').textContent = incoming ? 'Decline' : 'End call';
  showRemoteAudioUnlock(false);
  updateCallModeUi();
  $('studyco-call-modal').hidden = false;
  updateCallControls();
}

function setCallConnected() {
  stopRingingTone();
  clearTimeout(state.callTimeout);
  state.callTimeout = null;
  $('studyco-call-status').textContent = 'Connected';
  $('studyco-call-presence').textContent = state.callMode === 'video' ? 'Live video connection' : 'Live audio connection';
  $('studyco-call-accept').hidden = true;
  const remoteAudio = $('studyco-call-remote-audio');
  if (remoteAudio) {
    remoteAudio.muted = !state.speakerOn;
    remoteAudio.volume = 1;
    const playPromise = remoteAudio.play();
    if (playPromise?.then) {
      playPromise
        .then(() => showRemoteAudioUnlock(false))
        .catch(() => showRemoteAudioUnlock(true));
    }
  }
  startCallElapsed();
}

function startRecording() {
  if (!state.localStream || !window.MediaRecorder) {
    toast('Audio recording is not supported on this device.', true);
    return;
  }
  try {
    state.recordedChunks = [];
    state.mediaRecorder = new MediaRecorder(state.localStream);
    state.mediaRecorder.ondataavailable = (event) => { if (event.data.size) state.recordedChunks.push(event.data); };
    state.mediaRecorder.onstop = () => { void saveCallRecording(); };
    state.mediaRecorder.start(1000);
    state.recordingCallId = state.activeCallId;
    state.recording = true;
    updateCallControls();
    toast('Call recording started. Use Stop recording when you are done.');
  } catch (error) {
    toast(error.message || 'Call recording could not start.', true);
  }
}

async function saveCallRecording() {
  const chunks = state.recordedChunks.splice(0);
  const callId = state.recordingCallId || state.activeCallId;
  state.recording = false;
  state.recordingCallId = null;
  updateCallControls();
  if (!chunks.length || !callId) return;
  try {
    const blob = new Blob(chunks, { type: state.mediaRecorder?.mimeType || 'audio/webm' });
    const file = new File([blob], `studyco-call-${callId}.webm`, { type: blob.type });
    const recordingUrl = await uploadAttachment(file, `studyco/${state.user.uid}/call-recordings/${callId}`);
    await updateDoc(doc(db, 'studyco_calls', callId), { recordingUrl, recordingType: blob.type, recordedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    toast('Audio recording saved to this call.');
  } catch (error) {
    toast(error.message || 'The audio recording could not be saved.', true);
  }
}

function stopRecording() {
  if (!state.mediaRecorder || state.mediaRecorder.state === 'inactive') return;
  state.mediaRecorder.stop();
  state.mediaRecorder = null;
}

async function translatePhrase(phrase) {
  const language = state.translation.language;
  if (!phrase || language === 'en' || state.translation.busy) return;
  state.translation.busy = true;
  const status = $('studyco-call-translation-status');
  if (status) status.textContent = `Translating voice to ${$('studyco-call-language').selectedOptions[0].text}…`;
  try {
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(phrase)}&langpair=en|${encodeURIComponent(language)}`);
    const result = await response.json();
    const translated = result?.responseData?.translatedText;
    if (!translated) throw new Error('No translation returned.');
    const utterance = new SpeechSynthesisUtterance(translated);
    utterance.lang = language;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
    if (status) status.textContent = 'Translated audio is playing on this device.';
  } catch (error) {
    if (status) status.textContent = 'Translation is unavailable right now.';
    toast(error.message || 'Voice translation could not start.', true);
  } finally {
    state.translation.busy = false;
  }
}

function stopVoiceTranslation() {
  state.translation.recognition?.stop?.();
  state.translation.recognition = null;
  window.speechSynthesis?.cancel?.();
}

function startVoiceTranslation() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) {
    toast('Voice translation needs a browser with speech recognition support.', true);
    state.translation.enabled = false;
    updateCallControls();
    return;
  }
  stopVoiceTranslation();
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = false;
  recognition.lang = 'en-US';
  recognition.onresult = (event) => {
    const phrase = Array.from(event.results).slice(event.resultIndex).map((result) => result[0].transcript).join(' ');
    void translatePhrase(phrase);
  };
  recognition.onerror = () => {
    if (state.translation.enabled) setTimeout(() => state.translation.enabled && startVoiceTranslation(), 900);
  };
  recognition.onend = () => {
    if (state.translation.enabled) setTimeout(() => state.translation.enabled && startVoiceTranslation(), 500);
  };
  state.translation.recognition = recognition;
  recognition.start();
  const status = $('studyco-call-translation-status');
  if (status) status.textContent = `Listening for English voice and translating to ${$('studyco-call-language').selectedOptions[0].text}.`;
}

function toggleVoiceTranslation(enabled) {
  state.translation.enabled = enabled;
  state.translation.language = $('studyco-call-language').value;
  if (enabled) startVoiceTranslation(); else {
    stopVoiceTranslation();
    $('studyco-call-translation-status').textContent = '';
  }
  updateCallControls();
}

async function startCall(uid, requestedMode = 'audio') {
  const profile = await getProfile(uid); if (!profile) return;
  try {
    state.callMode = requestedMode === 'video' ? 'video' : 'audio';
    state.speakerOn = true;
    state.muted = false;
    const targetPresence = await getPresence(uid);
    const targetOnline = presenceIsOnline(targetPresence);
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone calls.');
    setNativeCallAudio(true);
    state.localStream = await getCallMediaStream(state.callMode);
    prepareCallAudioStream(state.localStream);
    bindLocalVideo(state.localStream);
    const callRef = doc(collection(db, 'studyco_calls'));
    state.activeCallId = callRef.id;
    /*
     * Create the parent before WebRTC starts trickling ICE candidates.
     * Firestore candidate rules use get() on this document; starting
     * callPeer first makes early candidates/listeners fail with permission
     * denied, which is why the reverse call direction could lose audio.
     */
    await setDoc(callRef, {
      callerId: state.user.uid,
      receiverId: uid,
      status: 'preparing',
      callType: state.callMode,
      targetOnline,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    state.rtc = callPeer(callRef.id, uid);
    state.localStream.getTracks().forEach((track) => state.rtc.addTrack(track, state.localStream));
    const offer = await state.rtc.createOffer(); await state.rtc.setLocalDescription(offer);
    openCallModal(profile, false, targetOnline, targetPresence, state.callMode); startRingingTone(targetOnline ? 'online' : 'offline');
    state.callTimeout = setTimeout(() => declineCall(true), 45000);
    state.callUnsub = onSnapshot(callRef, async (snapshot) => {
      const data = snapshot.data(); if (!data) return;
      if (data.answer && !state.rtc.remoteDescription) {
        await state.rtc.setRemoteDescription(new RTCSessionDescription(data.answer));
        await state.rtc.flushRemoteCandidates?.();
        setCallConnected();
      }
      if (['declined', 'ended', 'missed'].includes(data.status)) finishCall();
    });
    /* Publish the offer last, atomically changing the call to ringable.
       The receiver cannot accept until the offer is present. */
    await updateDoc(callRef, {
      status: 'ringing',
      offer: { type: offer.type, sdp: offer.sdp },
      updatedAt: serverTimestamp()
    });
  } catch (error) { toast(error.message || 'Microphone and camera permission are needed for calls.', true); finishCall(); }
}

async function acceptIncomingCall() {
  const incoming = state.pendingIncomingCall; if (!incoming) return;
  try {
    clearTimeout(state.incomingCallTimers.get(incoming.id));
    state.incomingCallTimers.delete(incoming.id);
    state.speakerOn = true;
    state.muted = false;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone calls.');
    setNativeCallAudio(true);
    state.callMode = incoming.data.callType === 'video' ? 'video' : 'audio';
    state.localStream = await getCallMediaStream(state.callMode);
    prepareCallAudioStream(state.localStream);
    bindLocalVideo(state.localStream);
    updateCallModeUi();
    state.activeCallId = incoming.id; state.rtc = callPeer(incoming.id, incoming.data.callerId);
    state.localStream.getTracks().forEach((track) => state.rtc.addTrack(track, state.localStream));
    await state.rtc.setRemoteDescription(new RTCSessionDescription(incoming.data.offer));
    await state.rtc.flushRemoteCandidates?.();
    const answer = await state.rtc.createAnswer(); await state.rtc.setLocalDescription(answer);
    await updateDoc(doc(db, 'studyco_calls', incoming.id), { status: 'accepted', answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
    stopRingingTone();
    setCallConnected();
    state.callUnsub = onSnapshot(doc(db, 'studyco_calls', incoming.id), (snapshot) => { if (['declined', 'ended', 'missed'].includes(snapshot.data()?.status)) finishCall(); });
  } catch (error) { toast(error.message || 'Could not accept the call.', true); finishCall(); }
}

async function declineCall(timedOut = false) {
  if (state.pendingIncomingCall) await updateDoc(doc(db, 'studyco_calls', state.pendingIncomingCall.id), { status: timedOut ? 'missed' : 'declined', updatedAt: serverTimestamp() }).catch(() => {});
  else if (state.activeCallId) await updateDoc(doc(db, 'studyco_calls', state.activeCallId), { status: timedOut ? 'missed' : 'ended', updatedAt: serverTimestamp() }).catch(() => {});
  finishCall();
}

async function finishCall() {
  const finishedIncomingCallId = state.pendingIncomingCall?.id;
  stopRingingTone(); stopCallElapsed(); clearTimeout(state.callTimeout); state.callTimeout = null;
  if (finishedIncomingCallId) {
    clearTimeout(state.incomingCallTimers.get(finishedIncomingCallId));
    state.incomingCallTimers.delete(finishedIncomingCallId);
  }
  setNativeCallAudio(false);
  stopVoiceTranslation();
  if (state.recording) stopRecording();
  state.callUnsub?.(); state.candidateUnsub?.(); state.callUnsub = null; state.candidateUnsub = null; state.rtc?.close(); state.rtc = null;
  state.localStream?.getTracks().forEach((track) => track.stop()); state.localStream = null; state.activeCallId = null; state.pendingIncomingCall = null; state.callProfile = null; state.callIncoming = false; state.callMode = 'audio'; state.muted = false; state.speakerOn = true; state.translation.enabled = false; $('studyco-call-modal').hidden = true; updateCallControls();
  const remoteAudio = $('studyco-call-remote-audio');
  if (remoteAudio) { remoteAudio.pause(); remoteAudio.srcObject = null; remoteAudio.muted = false; remoteAudio.volume = 0.88; }
  const remoteVideo = $('studyco-call-remote-video');
  if (remoteVideo) { remoteVideo.pause(); remoteVideo.srcObject = null; remoteVideo.hidden = true; }
  const localVideo = $('studyco-call-local-video');
  if (localVideo) { localVideo.pause(); localVideo.srcObject = null; localVideo.hidden = true; }
  $('studyco-call-stage')?.classList.remove('has-remote-video', 'has-local-video');
  updateCallModeUi();
  showRemoteAudioUnlock(false);
}

function listenForCalls() {
  state.incomingCallUnsub?.();
  state.incomingCallUnsub = onSnapshot(query(collection(db, 'studyco_calls'), where('receiverId', '==', state.user.uid), limit(20)), async (snapshot) => {
    const call = snapshot.docs.map((item) => ({ id: item.id, data: item.data() })).find((item) => item.data.status === 'ringing');
    if (!call || state.activeCallId) return;
    if (state.incomingCallIds.has(call.id)) return;
    state.incomingCallIds.add(call.id);
    state.pendingIncomingCall = call; const profile = await getProfile(call.data.callerId); const presence = await getPresence(call.data.callerId); openCallModal(profile || {}, true, presenceIsOnline(presence), presence, call.data.callType || 'audio'); startRingingTone('online');
    state.incomingCallTimers.set(call.id, setTimeout(async () => {
      state.incomingCallTimers.delete(call.id);
      const current = await getDoc(doc(db, 'studyco_calls', call.id)).catch(() => null);
      if (current?.data()?.status === 'ringing') {
        await updateDoc(doc(db, 'studyco_calls', call.id), { status: 'missed', updatedAt: serverTimestamp() }).catch(() => {});
        await createNotification(call.data.callerId, 'call_missed', call.id).catch(() => {});
        if (state.pendingIncomingCall?.id === call.id) finishCall();
      }
    }, 45000));
  });
}

function mergeCallHistory(snapshot) {
  const merged = new Map(state.callHistory.map((call) => [call.id, call]));
  snapshot.docs.forEach((item) => merged.set(item.id, { id: item.id, ...item.data() }));
  state.callHistory = [...merged.values()].sort((a, b) => timeMs(b.createdAt || b.updatedAt) - timeMs(a.createdAt || a.updatedAt)).slice(0, 40);
  renderCallHistory();
}

async function renderCallHistory() {
  const target = $('studyco-call-history');
  if (!target) return;
  const calls = state.callHistory;
  $('studyco-call-history-count').textContent = String(calls.length);
  const rows = await Promise.all(calls.slice(0, 12).map(async (call) => {
    const uid = call.callerId === state.user.uid ? call.receiverId : call.callerId;
    const profile = await getProfile(uid);
    const outgoing = call.callerId === state.user.uid;
    const missed = call.status === 'missed' || call.status === 'declined' && !outgoing;
    const callLabel = call.callType === 'video' ? 'Video call' : 'Voice call';
    const label = missed ? 'Missed call' : call.status === 'accepted' ? callLabel : outgoing ? `${callLabel} placed` : `${callLabel} ended`;
    const action = call.recordingUrl ? `<a class="studyco-call-recording" href="${esc(call.recordingUrl)}" target="_blank" rel="noopener">Listen to recording</a>` : '';
    return `<div class="studyco-call-history-row">${avatarWithPresence(profile, uid, 'small')}<div><strong>${esc(profileName(profile))}</strong><span>${missed ? 'Missed call' : label} · ${esc(timeText(call.createdAt || call.updatedAt))}</span></div><div class="studyco-call-history-meta"><i class="${missed ? 'missed' : outgoing ? 'outgoing' : 'incoming'}">${missed ? '↙' : outgoing ? '↗' : '↙'}</i>${action}</div></div>`;
  }));
  target.innerHTML = rows.join('') || '<div class="studyco-empty">Your call activity will appear here.</div>';
}

function subscribeCallHistory() {
  state.callHistoryUnsubs.forEach((unsubscribe) => unsubscribe());
  state.callHistoryUnsubs = [
    onSnapshot(query(collection(db, 'studyco_calls'), where('callerId', '==', state.user.uid), limit(40)), mergeCallHistory),
    onSnapshot(query(collection(db, 'studyco_calls'), where('receiverId', '==', state.user.uid), limit(40)), mergeCallHistory)
  ];
}

function openModal(id) { $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }

function wire() {
  if (state.wired) return; state.wired = true;
  document.querySelectorAll('[data-studyco-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.studycoView)));
  $('studyco-open-composer').addEventListener('click', openPostEditor);
  $('studyco-close-post-editor')?.addEventListener('click', closePostEditor);
  $('studyco-editor-publish-post')?.addEventListener('click', publishPost);
  $('studyco-friend-search-action').addEventListener('click', () => openContactsSearch());
  $('studyco-menu-button').addEventListener('click', () => {
    const menu = $('studyco-menu-panel');
    menu.hidden = !menu.hidden;
    $('studyco-menu-button').setAttribute('aria-expanded', String(!menu.hidden));
  });
  window.addEventListener('hashchange', syncRoute);
  window.addEventListener('popstate', syncRoute);
  document.addEventListener('click', (event) => {
    const menu = $('studyco-menu-panel');
    if (!menu.hidden && !event.target.closest('.studyco-top-actions')) {
      menu.hidden = true;
      $('studyco-menu-button').setAttribute('aria-expanded', 'false');
    }
  });
  const openContactsSearch = () => {
    setView('friends');
    $('studyco-top-search')?.classList.add('is-open');
    $('studyco-global-search')?.focus();
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadPeople($('studyco-global-search')?.value || '').catch((error) => toast(error.message, true)), 0);
  };
  const openSearchPage = () => {
    $('studyco-top-search')?.classList.remove('is-open');
    setView('search');
    const input = $('studyco-page-search');
    input?.focus();
    if (input?.value.trim()) renderSearchResults(input.value).catch((error) => toast(error.message, true));
  };
  const searchContacts = (value) => {
    const term = value.trim();
    if (state.activeView !== 'friends') setView('friends');
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadPeople(term).catch((error) => toast(error.message, true)), 220);
  };
  const searchPostsAndPeople = (value) => {
    const term = value.trim();
    if (state.activeView !== 'search') setView('search');
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => renderSearchResults(term).catch((error) => toast(error.message, true)), 220);
  };
  $('studyco-global-search')?.addEventListener('input', (event) => searchContacts(event.target.value));
  $('studyco-global-search')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); searchContacts(event.target.value); }
    if (event.key === 'Escape') { event.preventDefault(); $('studyco-top-search')?.classList.remove('is-open'); event.target.blur(); }
  });
  $('studyco-top-search')?.addEventListener('click', (event) => {
    if (event.target !== $('studyco-global-search')) openContactsSearch();
  });
  document.querySelectorAll('.studyco-search-action').forEach((button) => button.addEventListener('click', () => {
    openSearchPage();
  }));
  $('studyco-page-search')?.addEventListener('input', (event) => searchPostsAndPeople(event.target.value));
  $('studyco-page-search')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); searchPostsAndPeople(event.target.value); }
    if (event.key === 'Escape') { event.preventDefault(); $('studyco-clear-search')?.click(); }
  });
  $('studyco-clear-search')?.addEventListener('click', () => {
    $('studyco-page-search').value = '';
    state.searchRequestId += 1;
    renderSearchResults('');
    $('studyco-page-search').focus();
  });
  $('studyco-refresh-feed').addEventListener('click', () => renderFeed());
  $('studyco-post-text').addEventListener('input', renderPostPreview);
  document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => { state.selectedTemplate = button.dataset.template; document.querySelectorAll('[data-template]').forEach((item) => item.classList.toggle('selected', item === button)); renderPostPreview(); }));
  $('studyco-post-image').addEventListener('change', (event) => { const file = event.target.files[0]; if (file && !file.type.startsWith('image/')) { toast('Only image attachments are allowed.', true); event.target.value = ''; return; } state.postImage = file || null; renderPostPreview(); renderPostAttachmentStatus(); });
  $('studyco-post-file').addEventListener('change', (event) => { state.postFile = event.target.files[0] || null; renderPostAttachmentStatus(); });
  $('studyco-add-url').addEventListener('click', () => { $('studyco-post-url-row').hidden = false; $('studyco-post-url').focus(); });
  $('studyco-remove-url').addEventListener('click', () => { $('studyco-post-url').value = ''; $('studyco-post-url-row').hidden = true; });
  $('studyco-go-live').addEventListener('click', () => { closePostEditor(); openModal('studyco-story-modal'); toast('Live update composer opened.'); });
  $('studyco-make-call').addEventListener('click', () => { closePostEditor(); setView('friends'); toast('Choose a friend to start a call.'); });
  $('studyco-publish-post').addEventListener('click', publishPost);
  $('studyco-create-story').addEventListener('click', () => openModal('studyco-story-modal'));
  $('studyco-story-list').addEventListener('click', (event) => { const card = event.target.closest('[data-story-id]'); if (card) showStory(state.stories.find((story) => story.id === card.dataset.storyId)); else if (event.target.closest('#studyco-story-add-card')) openModal('studyco-story-modal'); });
  $('studyco-story-image').addEventListener('change', (event) => { const file = event.target.files[0]; if (file && !file.type.startsWith('image/')) { toast('Only image attachments are allowed.', true); event.target.value = ''; return; } state.storyImage = file || null; if (file) $('studyco-story-preview').style.backgroundImage = `url(${URL.createObjectURL(file)})`; });
  document.querySelectorAll('[data-story-color]').forEach((button) => button.addEventListener('click', () => { state.storyColor = button.dataset.storyColor; document.querySelectorAll('[data-story-color]').forEach((item) => item.classList.toggle('selected', item === button)); }));
  $('studyco-story-form').addEventListener('submit', createStory);
  [$('studyco-edit-profile'), $('studyco-profile-edit-small')].forEach((button) => button.addEventListener('click', () => { fillEditForm(); openModal('studyco-edit-modal'); }));
  [$('studyco-profile-complete-action'), $('studyco-profile-next-action')].forEach((button) => button.addEventListener('click', () => { fillEditForm(); openModal('studyco-edit-modal'); }));
  $('studyco-profile-form').addEventListener('submit', saveProfile);
  $('studyco-profile-photo').addEventListener('change', (event) => previewFile(event.target.files[0], 'studyco-photo-preview'));
  $('studyco-cover-photo').addEventListener('change', (event) => previewFile(event.target.files[0], 'studyco-cover-preview'));
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.closest('.studyco-modal-backdrop').id)));
  $('studyco-new-message')?.addEventListener('click', () => { setView('friends'); $('studyco-global-search')?.focus(); });
  $('studyco-message-search')?.addEventListener('input', () => loadChats());
  $('studyco-mark-all-notifications')?.addEventListener('click', markAllNotificationsRead);
  $('studyco-notification-list')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-notification-id]');
    if (row) openNotification(row.dataset.notificationId);
  });
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-post-action]');
    if (!button) return;
    const article = button.closest('.studyco-post'); const action = button.dataset.postAction;
    if (!article) return;
    if (action === 'like') await toggleLike(button.dataset.postId);
    if (action === 'share') await sharePost(button.dataset.postId);
    if (action === 'comments') {
      const panel = article.querySelector('[data-comments-panel]');
      if (panel?.dataset.loaded === 'true') {
        panel.hidden = !panel.hidden;
        const form = article.querySelector('[data-comment-post]');
        if (form) form.hidden = panel.hidden;
      } else {
        button.disabled = true;
        try { await loadPostComments(button.dataset.postId, article); } catch (error) { toast(error.message || 'Comments could not load.', true); }
        button.disabled = false;
      }
    }
  });
  document.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-comment-post]')) return;
    event.preventDefault();
    await addComment(event.target.dataset.commentPost, event.target.querySelector('input').value);
    event.target.reset();
    const article = event.target.closest('.studyco-post');
    if (article) await loadPostComments(event.target.dataset.commentPost, article);
  });
  $('studyco-people-results').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-search-people-results')?.addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-request-list').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-suggestion-list').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-right-requests').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-right-suggestions').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-chat-list').addEventListener('click', (event) => { const button = event.target.closest('[data-chat-uid]'); if (button) void openChat(button.dataset.chatUid); });
  $('studyco-chat-panel').addEventListener('submit', (event) => { if (event.target.id === 'studyco-chat-form') sendMessage(event); });
  $('studyco-chat-panel').addEventListener('change', (event) => {
    if (event.target.id === 'studyco-chat-file') $('studyco-chat-file-name').textContent = event.target.files[0]?.name || '';
  });
  $('studyco-chat-panel').addEventListener('click', (event) => {
    const callButton = event.target.closest('[data-start-call]');
    if (callButton) { void startCall(callButton.dataset.startCall, callButton.dataset.callKind || 'audio'); return; }
    if (event.target.closest('[data-call-history]')) { renderCallHistory(); openModal('studyco-call-history-modal'); }
  });
  $('studyco-chat-panel').addEventListener('click', (event) => { if (event.target.closest('[data-chat-back]')) closeChat(); });
  $('studyco-call-accept').addEventListener('click', acceptIncomingCall); $('studyco-call-decline').addEventListener('click', declineCall);
  $('studyco-call-mute').addEventListener('click', () => {
    state.muted = !state.muted;
    state.localStream?.getAudioTracks().forEach((track) => { track.enabled = !state.muted; });
    updateCallControls();
  });
  $('studyco-call-camera').addEventListener('click', () => {
    const track = state.localStream?.getVideoTracks?.()[0];
    if (!track) {
      toast('Camera video is not available for this call.', true);
      return;
    }
    track.enabled = !track.enabled;
    updateCallControls();
  });
  $('studyco-call-record').addEventListener('click', () => state.recording ? stopRecording() : startRecording());
  $('studyco-call-enable-audio').addEventListener('click', () => {
    const remoteAudio = $('studyco-call-remote-audio');
    if (!remoteAudio) return;
    state.speakerOn = true;
    remoteAudio.muted = false;
    remoteAudio.play()
      .then(() => showRemoteAudioUnlock(false))
      .catch(() => toast('The browser still blocked call audio. Check the site sound permission.', true));
    $('studyco-call-speaker').classList.add('active');
  });
  $('studyco-call-speaker').addEventListener('click', () => {
    state.speakerOn = !state.speakerOn;
    $('studyco-call-remote-audio').muted = !state.speakerOn;
    $('studyco-call-speaker').classList.toggle('active', state.speakerOn);
  });
  $('studyco-call-translation-toggle').addEventListener('change', (event) => toggleVoiceTranslation(event.target.checked));
  $('studyco-call-language').addEventListener('change', () => {
    state.translation.language = $('studyco-call-language').value;
    if (state.translation.enabled) startVoiceTranslation();
  });
  $('studyco-logout').addEventListener('click', async () => { await setPresence(false); await signOut(auth); });
}

function previewFile(file, targetId) {
  if (!file) return; if (!file.type.startsWith('image/')) { toast('Only image attachments are allowed.', true); return; }
  $(targetId).innerHTML = `<img src="${URL.createObjectURL(file)}" alt="Selected image"><span>Change image</span>`;
}

function fillEditForm() {
  const p = state.profile || {};
  $('studyco-edit-name').value = p.displayName || ''; $('studyco-edit-contact').value = p.phone || p.loginIdentifier || '';
  $('studyco-edit-bio').value = p.bio || ''; $('studyco-edit-status').value = p.studentStatus || '';
  $('studyco-edit-school').value = p.school || ''; $('studyco-edit-department').value = p.department || '';
  $('studyco-edit-major').value = p.major || ''; $('studyco-edit-gender').value = p.gender || ''; $('studyco-edit-location').value = p.location || '';
  $('studyco-photo-preview').innerHTML = p.photoURL ? `<img src="${esc(p.photoURL)}" alt=""><span>Change image</span>` : '<span>Profile photo</span>';
  $('studyco-cover-preview').innerHTML = p.coverURL ? `<img src="${esc(p.coverURL)}" alt=""><span>Change image</span>` : '<span>Cover banner</span>';
}

async function saveProfile(event) {
  event.preventDefault();
  try {
    const update = { displayName: $('studyco-edit-name').value.trim(), phone: $('studyco-edit-contact').value.trim(), bio: $('studyco-edit-bio').value.trim(), studentStatus: $('studyco-edit-status').value.trim(), school: $('studyco-edit-school').value.trim(), department: $('studyco-edit-department').value.trim(), major: $('studyco-edit-major').value.trim(), gender: $('studyco-edit-gender').value.trim(), location: $('studyco-edit-location').value.trim(), updatedAt: serverTimestamp() };
    const photo = $('studyco-profile-photo').files[0]; const cover = $('studyco-cover-photo').files[0];
    if (photo) update.photoURL = await uploadImage(photo, `studyco/${state.user.uid}/profile-${Date.now()}`);
    if (cover) update.coverURL = await uploadImage(cover, `studyco/${state.user.uid}/cover-${Date.now()}`);
    await updateDoc(doc(db, 'social_profiles', state.user.uid), update); state.profile = { ...state.profile, ...update }; state.profiles.set(state.user.uid, state.profile); renderProfile(); closeModal('studyco-edit-modal'); toast('Profile updated.');
  } catch (error) { toast(error.message || 'Profile could not be updated.', true); }
}

async function bootApp() {
  await ensureProfile(state.user);
  try { state.dismissedSuggestions = new Set(JSON.parse(localStorage.getItem(`studyco-dismissed-suggestions:${state.user.uid}`) || '[]')); } catch (_) {}
  showApp(); renderProfile(); startPresence(); subscribeFeed(); subscribeStories(); subscribeNotifications(); listenForCalls(); subscribeCallHistory(); loadPeople(); await loadSocialLists(); await refreshNavCounts(); loadChats(); await syncRoute();
}

wire();
window.onAqsAuthChange(async (user) => {
  if (!user || user.isAnonymous) {
    if (state.user) setPresence(false);
    stopPresenceHeartbeat(); stopPresenceWatchers();
    state.user = null; showAuth(); return;
  }
  state.user = user;
  try { await bootApp(); } catch (error) { toast(error.message || 'StudyCo Meet could not load.', true); }
});