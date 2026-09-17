import { auth, db } from './aqs-firebase.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, limit, onSnapshot, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const state = {
  user: null, profile: null, profiles: new Map(), posts: [], stories: [],
  friends: [], requests: [], activeView: 'home', selectedTemplate: 'indigo',
  dismissedSuggestions: new Set(),
  storyColor: '#5b5bd6', postImage: null, storyImage: null, wired: false,
  feedUnsub: null, storyUnsub: null, requestUnsub: null, messageUnsub: null,
  incomingCallUnsub: null, callUnsub: null, candidateUnsub: null,
  activeChatUid: null, activeChatId: null, activeCallId: null, searchTimer: null,
  pendingIncomingCall: null, rtc: null, localStream: null
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
const avatar = (profile, size = '') => `<div class="studyco-avatar ${size}">${profile?.photoURL ? `<img src="${esc(profile.photoURL)}" alt="">` : esc(initials(profile))}</div>`;
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
  /* Until the notifications screen is migrated, pending requests are the
     account's visible notification activity when that collection is absent. */
  setNavBadge('studyco-notification-badge', notifications
    ? notifications.docs.filter((item) => item.data().read !== true).length
    : state.requests.length);
}
const templateClass = (name) => `template-${['indigo', 'sunset', 'ocean', 'gold', 'night', 'berry'].includes(name) ? name : 'indigo'}`;
async function uploadImage(file, path) {
  if (!file) return '';
  if (!file.type.startsWith('image/')) throw new Error('StudyCo Meet accepts images only. Video uploads are disabled.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose an image below 25 MB.');
  if (typeof window.aqsUploadFile === 'function') return window.aqsUploadFile(file, path);
  throw new Error('Cloudinary storage is not ready. Please ask the administrator to configure it.');
}

async function getProfile(uid) {
  if (!uid) return null;
  if (state.profiles.has(uid)) return state.profiles.get(uid);
  const snap = await getDoc(doc(db, 'social_profiles', uid));
  if (!snap.exists()) return null;
  const profile = { id: snap.id, ...snap.data() };
  state.profiles.set(uid, profile); return profile;
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
  const cover = $('studyco-profile-cover');
  cover.innerHTML = `${p.coverURL ? `<img src="${esc(p.coverURL)}" alt="Cover banner">` : ''}<div class="studyco-profile-cover-shade"></div>`;
}

function setView(view) {
  state.activeView = view;
  document.querySelectorAll('[data-studyco-view]').forEach((button) => button.classList.toggle('active', button.dataset.studycoView === view));
  document.querySelectorAll('.studyco-view').forEach((section) => section.classList.toggle('active', section.id === `studyco-view-${view}`));
  if (view === 'friends') loadSocialLists();
  if (view === 'profile') { renderProfile(); renderProfilePosts(); }
  if (view === 'messages') loadChats();
}

function renderPostPreview() {
  const preview = $('studyco-post-preview'); const text = $('studyco-post-text').value.trim();
  const hasContent = Boolean(text || state.postImage);
  preview.hidden = !hasContent; preview.className = `studyco-post-preview ${templateClass(state.selectedTemplate)}`;
  preview.innerHTML = `${text ? `<span>${esc(text)}</span>` : ''}${state.postImage ? `<img src="${esc(URL.createObjectURL(state.postImage))}" alt="Selected study image">` : ''}`;
}

async function renderPost(post) {
  const [author, likesSnap, commentsSnap] = await Promise.all([
    getProfile(post.userId), getDocs(collection(db, 'studyco_posts', post.id, 'likes')),
    getDocs(query(collection(db, 'studyco_posts', post.id, 'comments'), limit(3)))
  ]);
  const liked = likesSnap.docs.some((item) => item.id === state.user.uid);
  const comments = await Promise.all(commentsSnap.docs.sort((a, b) => timeMs(a.data().createdAt) - timeMs(b.data().createdAt)).map(async (item) => {
    const data = item.data(); const commenter = await getProfile(data.userId);
    return `<div class="studyco-comment">${avatar(commenter, 'small')}<div><strong>${esc(profileName(commenter))}</strong>${esc(data.text)}</div></div>`;
  }));
  const text = post.content ? `<div class="studyco-post-body">${esc(post.content)}</div>` : '';
  const visual = post.bgTemplateId && post.content && post.content.length <= 240 ? `<div class="studyco-post-visual ${templateClass(post.bgTemplateId)}">${esc(post.content)}</div>` : '';
  const image = post.imageUrl ? `<img class="studyco-post-image" src="${esc(post.imageUrl)}" alt="Post attachment">` : '';
  return `<article class="studyco-card studyco-post" data-post-id="${esc(post.id)}"><div class="studyco-post-head">${avatar(author, 'small')}<div><strong>${esc(profileName(author))}</strong><span>${esc(author?.school || author?.username || 'StudyCo learner')} · ${timeText(post.createdAt)}</span></div><button class="studyco-post-menu" type="button" aria-label="More options">•••</button></div>${visual || text}${image}<div class="studyco-post-actions"><button class="${liked ? 'liked' : ''}" data-post-action="like" data-post-id="${esc(post.id)}">${liked ? 'Liked' : 'Like'} · ${likesSnap.size}</button><button data-post-action="focus-comment" data-post-id="${esc(post.id)}">Comment · ${post.commentCount || commentsSnap.size}</button></div><div class="studyco-comments">${comments.join('')}</div><form class="studyco-comment-form" data-comment-post="${esc(post.id)}"><input type="text" maxlength="500" placeholder="Write a comment..."><button type="submit">Send</button></form></article>`;
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
  const content = $('studyco-post-text').value.trim(); const file = state.postImage;
  if (!content && !file) { toast('Write something or add an image first.', true); return; }
  const button = $('studyco-publish-post'); button.disabled = true;
  try {
    const imageUrl = file ? await uploadImage(file, `studyco/${state.user.uid}/posts/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '')}`) : '';
    await addDoc(collection(db, 'studyco_posts'), { userId: state.user.uid, content: content.slice(0, 1000), imageUrl, bgTemplateId: content.length <= 240 ? state.selectedTemplate : '', likeCount: 0, commentCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $('studyco-post-text').value = ''; $('studyco-post-image').value = ''; state.postImage = null; $('studyco-post-preview').hidden = true; toast('Posted to StudyCo Meet.');
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
  const snap = await getDocs(query(collection(db, 'social_profiles'), limit(120)));
  const needle = term.trim().toLowerCase();
  const profiles = snap.docs.map((item) => ({ id: item.id, ...item.data() })).filter((profile) => profile.id !== state.user.uid && !state.dismissedSuggestions.has(profile.id) && (!needle || `${profileName(profile)} ${profile.username || ''} ${profile.school || ''} ${profile.department || ''}`.toLowerCase().includes(needle))).slice(0, 12);
  profiles.forEach((profile) => state.profiles.set(profile.id, profile)); await renderPeople(profiles, target);
}

async function handleFriendAction(uid, action) {
  const ref = doc(db, 'social_friend_requests', pairId(state.user.uid, uid));
  try {
    if (action === 'dismiss') {
      state.dismissedSuggestions.add(uid);
      try { localStorage.setItem(`studyco-dismissed-suggestions:${state.user.uid}`, JSON.stringify([...state.dismissedSuggestions])); } catch (_) {}
      await loadPeople($('studyco-people-search').value);
      toast('Suggestion removed.');
      return;
    }
    if (action === 'request') await setDoc(ref, { requesterId: state.user.uid, recipientId: uid, status: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (action === 'accept') {
      await updateDoc(ref, { status: 'accepted', updatedAt: serverTimestamp() });
    }
    if (action === 'unfriend' || action === 'reject') await deleteDoc(ref);
    if (action === 'message') { setView('messages'); openChat(uid); return; }
    await loadPeople($('studyco-people-search').value); await loadSocialLists(); refreshNavCounts(); toast(action === 'request' ? 'Friend request sent.' : 'Friendships updated.');
  } catch (error) { toast(error.message || 'That action could not be completed.', true); }
}

async function loadSocialLists() {
  const [sent, received] = await Promise.all([
    getDocs(query(collection(db, 'social_friend_requests'), where('requesterId', '==', state.user.uid), limit(100))),
    getDocs(query(collection(db, 'social_friend_requests'), where('recipientId', '==', state.user.uid), limit(100)))
  ]);
  const requests = received.docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.status === 'pending');
  const friendIds = [...sent.docs, ...received.docs].map((item) => item.data()).filter((item) => item.status === 'accepted').map((item) => item.requesterId === state.user.uid ? item.recipientId : item.requesterId);
  state.requests = await Promise.all(requests.map(async (item) => ({ ...item, profile: await getProfile(item.requesterId) })));
  state.friends = (await Promise.all([...new Set(friendIds)].map(async (uid) => ({ uid, profile: await getProfile(uid) })))).filter((item) => item.profile);
  const requestHtml = state.requests.map((item) => `<div class="studyco-list-row">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>Wants to be your friend</span></div><button class="studyco-button success" data-friend-action="accept" data-uid="${esc(item.requesterId)}">Confirm</button><button class="studyco-button danger" data-friend-action="reject" data-uid="${esc(item.requesterId)}">Delete</button></div>`).join('') || '<div class="studyco-empty">No pending requests.</div>';
  const friendHtml = state.friends.map((item) => `<div class="studyco-list-row">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>${esc(item.profile.school || item.profile.username || 'StudyCo friend')}</span></div><button class="studyco-button soft" data-friend-action="message" data-uid="${esc(item.uid)}">Message</button></div>`).join('') || '<div class="studyco-empty">Your friends list is empty.</div>';
  $('studyco-request-list').innerHTML = requestHtml; $('studyco-friend-list').innerHTML = friendHtml; $('studyco-request-count').textContent = String(state.requests.length);
  setNavBadge('studyco-friend-badge', state.requests.length);
  $('studyco-right-requests').innerHTML = state.requests.slice(0, 3).map((item) => `<div class="studyco-list-row">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>Friend request</span></div></div>`).join('') || '<div class="studyco-empty">No new requests.</div>';
  const suggestions = (await getDocs(query(collection(db, 'social_profiles'), limit(20)))).docs.map((item) => ({ id: item.id, ...item.data() })).filter((item) => item.id !== state.user.uid && !state.friends.some((friend) => friend.uid === item.id)).slice(0, 4);
  suggestions.forEach((item) => state.profiles.set(item.id, item));
  $('studyco-right-suggestions').innerHTML = suggestions.map((item) => `<div class="studyco-list-row">${avatar(item, 'small')}<div><strong>${esc(profileName(item))}</strong><span>${esc(item.school || 'StudyCo learner')}</span></div></div>`).join('') || '<div class="studyco-empty">Suggestions will appear here.</div>';
}

async function ensureConversation(uid) {
  const id = pairId(state.user.uid, uid);
  await setDoc(doc(db, 'social_conversations', id), { participantIds: [state.user.uid, uid], updatedAt: serverTimestamp() }, { merge: true });
  return id;
}

async function loadChats() {
  const snap = await getDocs(query(collection(db, 'social_conversations'), where('participantIds', 'array-contains', state.user.uid), limit(80)));
  const chats = await Promise.all(snap.docs.map(async (item) => {
    const data = item.data(); const uid = data.participantIds.find((value) => value !== state.user.uid);
    return { id: item.id, uid, profile: await getProfile(uid), data };
  }));
  const validChats = chats.filter((chat) => chat.profile);
  const term = $('studyco-message-search')?.value.trim().toLowerCase() || '';
  const visibleChats = validChats.filter((chat) => !term || `${profileName(chat.profile)} ${chat.data.lastMessageText || ''}`.toLowerCase().includes(term));
  $('studyco-chat-count').textContent = String(validChats.length);
  $('studyco-message-badge').hidden = !validChats.some((chat) => chat.data.lastSenderId && chat.data.lastSenderId !== state.user.uid);
  $('studyco-message-badge').textContent = String(validChats.filter((chat) => chat.data.lastSenderId && chat.data.lastSenderId !== state.user.uid).length || '');
  $('studyco-chat-list').innerHTML = visibleChats.map((chat) => `<button class="${chat.uid === state.activeChatUid ? 'active' : ''}" data-chat-uid="${esc(chat.uid)}">${avatar(chat.profile, 'small')}<div><strong>${esc(profileName(chat.profile))}</strong><span>${esc(chat.data.lastMessageText || 'Start a conversation')}</span></div><time>${esc(timeText(chat.data.lastMessageAt || chat.data.updatedAt))}</time></button>`).join('') || '<div class="studyco-empty">Open a friend profile to start chatting.</div>';
}

function renderMessages(messages, profile) {
  const target = document.querySelector('.studyco-chat-messages'); if (!target) return;
  target.innerHTML = messages.length ? messages.map((message) => `<div class="studyco-message ${message.senderId === state.user.uid ? 'mine' : ''}">${message.senderId === state.user.uid ? '' : avatar(profile, 'small')}<div class="bubble">${esc(message.messageText || message.text || '').replace(/\n/g, '<br>')}<time>${esc(timeText(message.createdAt))}</time></div></div>`).join('') : '<div class="studyco-chat-empty">Say hello to your study friend.</div>';
  target.scrollTop = target.scrollHeight;
}

async function openChat(uid) {
  const profile = await getProfile(uid); if (!profile) return;
  const relation = await relationship(uid); if (relation !== 'friends') { toast('You can message accepted friends only.', true); return; }
  setView('messages'); state.activeChatUid = uid; state.activeChatId = await ensureConversation(uid);
  $('studyco-chat-panel').innerHTML = `<div class="studyco-chat-head">${avatar(profile, 'small')}<div><strong>${esc(profileName(profile))}</strong><span>${esc(profile.username ? `@${profile.username}` : 'StudyCo friend')}</span></div><button class="studyco-button soft" data-start-call="${esc(uid)}" type="button">Call</button></div><div class="studyco-chat-messages"></div><form class="studyco-chat-compose" id="studyco-chat-form"><textarea id="studyco-chat-input" maxlength="2000" placeholder="Write a message..."></textarea><button class="studyco-button primary" type="submit">Send</button></form>`;
  state.messageUnsub?.(); state.messageUnsub = onSnapshot(query(collection(db, 'social_conversations', state.activeChatId, 'messages'), limit(150)), (snapshot) => renderMessages(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => timeMs(a.createdAt) - timeMs(b.createdAt)), profile));
  loadChats();
}

async function sendMessage(event) {
  event.preventDefault(); const text = $('studyco-chat-input').value.trim(); if (!text || !state.activeChatId) return;
  await addDoc(collection(db, 'social_conversations', state.activeChatId, 'messages'), { senderId: state.user.uid, receiverId: state.activeChatUid, messageText: text, createdAt: serverTimestamp(), is_read: false });
  await updateDoc(doc(db, 'social_conversations', state.activeChatId), { lastMessageText: text.slice(0, 120), lastMessageAt: serverTimestamp(), lastSenderId: state.user.uid, updatedAt: serverTimestamp() });
  $('studyco-chat-input').value = '';
}

function callPeer(callId, remoteUid) {
  const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  pc.onicecandidate = (event) => { if (event.candidate) addDoc(collection(db, 'studyco_calls', callId, 'candidates'), { from: state.user.uid, candidate: event.candidate.toJSON(), createdAt: serverTimestamp() }).catch(() => {}); };
  pc.ontrack = (event) => { $('studyco-call-remote-audio').srcObject = event.streams[0]; };
  state.candidateUnsub?.(); state.candidateUnsub = onSnapshot(collection(db, 'studyco_calls', callId, 'candidates'), (snapshot) => snapshot.docs.forEach((item) => { const data = item.data(); if (data.from !== state.user.uid && data.candidate) pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(() => {}); }));
  return pc;
}

function openCallModal(profile, incoming = false) {
  $('studyco-call-label').textContent = incoming ? 'Incoming audio call' : 'Audio call';
  $('studyco-call-name').textContent = profileName(profile); $('studyco-call-avatar').textContent = initials(profile);
  $('studyco-call-status').textContent = incoming ? 'Your StudyCo friend is calling.' : 'Calling...';
  $('studyco-call-accept').hidden = !incoming; $('studyco-call-modal').hidden = false;
}

async function startCall(uid) {
  const profile = await getProfile(uid); if (!profile) return;
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const callRef = doc(collection(db, 'studyco_calls')); state.activeCallId = callRef.id; state.rtc = callPeer(callRef.id, uid);
    state.localStream.getTracks().forEach((track) => state.rtc.addTrack(track, state.localStream));
    const offer = await state.rtc.createOffer(); await state.rtc.setLocalDescription(offer);
    await setDoc(callRef, { callerId: state.user.uid, receiverId: uid, status: 'ringing', offer: { type: offer.type, sdp: offer.sdp }, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    openCallModal(profile); state.callUnsub = onSnapshot(callRef, async (snapshot) => { const data = snapshot.data(); if (!data) return; if (data.answer && !state.rtc.currentRemoteDescription) await state.rtc.setRemoteDescription(new RTCSessionDescription(data.answer)); if (['declined', 'ended'].includes(data.status)) finishCall(); });
  } catch (error) { toast(error.message || 'Microphone permission is needed for calls.', true); finishCall(); }
}

async function acceptIncomingCall() {
  const incoming = state.pendingIncomingCall; if (!incoming) return;
  try {
    state.localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    state.activeCallId = incoming.id; state.rtc = callPeer(incoming.id, incoming.data.callerId);
    state.localStream.getTracks().forEach((track) => state.rtc.addTrack(track, state.localStream));
    await state.rtc.setRemoteDescription(new RTCSessionDescription(incoming.data.offer));
    const answer = await state.rtc.createAnswer(); await state.rtc.setLocalDescription(answer);
    await updateDoc(doc(db, 'studyco_calls', incoming.id), { status: 'accepted', answer: { type: answer.type, sdp: answer.sdp }, updatedAt: serverTimestamp() });
    $('studyco-call-status').textContent = 'Connected'; $('studyco-call-accept').hidden = true;
    state.callUnsub = onSnapshot(doc(db, 'studyco_calls', incoming.id), (snapshot) => { if (['declined', 'ended'].includes(snapshot.data()?.status)) finishCall(); });
  } catch (error) { toast(error.message || 'Could not accept the call.', true); finishCall(); }
}

async function declineCall() {
  if (state.pendingIncomingCall) await updateDoc(doc(db, 'studyco_calls', state.pendingIncomingCall.id), { status: 'declined', updatedAt: serverTimestamp() }).catch(() => {});
  else if (state.activeCallId) await updateDoc(doc(db, 'studyco_calls', state.activeCallId), { status: 'ended', updatedAt: serverTimestamp() }).catch(() => {});
  finishCall();
}

function finishCall() {
  state.callUnsub?.(); state.candidateUnsub?.(); state.callUnsub = null; state.candidateUnsub = null; state.rtc?.close(); state.rtc = null;
  state.localStream?.getTracks().forEach((track) => track.stop()); state.localStream = null; state.activeCallId = null; state.pendingIncomingCall = null; $('studyco-call-modal').hidden = true;
}

function listenForCalls() {
  state.incomingCallUnsub?.();
  state.incomingCallUnsub = onSnapshot(query(collection(db, 'studyco_calls'), where('receiverId', '==', state.user.uid), limit(20)), async (snapshot) => {
    const call = snapshot.docs.map((item) => ({ id: item.id, data: item.data() })).find((item) => item.data.status === 'ringing');
    if (!call || state.activeCallId) return;
    state.pendingIncomingCall = call; const profile = await getProfile(call.data.callerId); openCallModal(profile || {}, true);
  });
}

function openModal(id) { $(id).hidden = false; }
function closeModal(id) { $(id).hidden = true; }

function wire() {
  if (state.wired) return; state.wired = true;
  document.querySelectorAll('[data-studyco-view]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.studycoView)));
  $('studyco-open-composer').addEventListener('click', () => {
    $('studyco-composer').classList.add('is-open');
    $('studyco-post-text').focus();
  });
  $('studyco-friend-search-action').addEventListener('click', () => {
    $('studyco-people-search').focus();
    $('studyco-people-search').scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  $('studyco-menu-button').addEventListener('click', () => {
    const menu = $('studyco-menu-panel');
    menu.hidden = !menu.hidden;
    $('studyco-menu-button').setAttribute('aria-expanded', String(!menu.hidden));
  });
  document.addEventListener('click', (event) => {
    const menu = $('studyco-menu-panel');
    if (!menu.hidden && !event.target.closest('.studyco-top-actions')) {
      menu.hidden = true;
      $('studyco-menu-button').setAttribute('aria-expanded', 'false');
    }
  });
  const searchCircle = (value) => {
    const term = value.trim();
    setView('friends');
    $('studyco-people-search').value = value;
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => loadPeople(term).catch((error) => toast(error.message, true)), 220);
  };
  $('studyco-global-search')?.addEventListener('input', (event) => searchCircle(event.target.value));
  $('studyco-global-search')?.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); searchCircle(event.target.value); $('studyco-people-search').focus(); }
  });
  $('studyco-top-search')?.addEventListener('click', (event) => {
    if (event.target !== $('studyco-global-search')) { setView('friends'); $('studyco-people-search').focus(); }
  });
  document.querySelectorAll('.studyco-search-action').forEach((button) => button.addEventListener('click', () => {
    setView('friends');
    $('studyco-people-search').value = $('studyco-global-search')?.value || '';
    $('studyco-people-search').focus();
    $('studyco-people-search').scrollIntoView({ behavior: 'smooth', block: 'center' });
  }));
  $('studyco-people-search').addEventListener('input', (event) => searchCircle(event.target.value));
  $('studyco-refresh-feed').addEventListener('click', () => renderFeed());
  $('studyco-post-text').addEventListener('input', renderPostPreview);
  document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => { state.selectedTemplate = button.dataset.template; document.querySelectorAll('[data-template]').forEach((item) => item.classList.toggle('selected', item === button)); renderPostPreview(); }));
  $('studyco-post-image').addEventListener('change', (event) => { const file = event.target.files[0]; if (file && !file.type.startsWith('image/')) { toast('Only image attachments are allowed.', true); event.target.value = ''; return; } state.postImage = file || null; renderPostPreview(); });
  $('studyco-publish-post').addEventListener('click', publishPost);
  $('studyco-create-story').addEventListener('click', () => openModal('studyco-story-modal'));
  $('studyco-story-list').addEventListener('click', (event) => { const card = event.target.closest('[data-story-id]'); if (card) showStory(state.stories.find((story) => story.id === card.dataset.storyId)); else if (event.target.closest('#studyco-story-add-card')) openModal('studyco-story-modal'); });
  $('studyco-story-image').addEventListener('change', (event) => { const file = event.target.files[0]; if (file && !file.type.startsWith('image/')) { toast('Only image attachments are allowed.', true); event.target.value = ''; return; } state.storyImage = file || null; if (file) $('studyco-story-preview').style.backgroundImage = `url(${URL.createObjectURL(file)})`; });
  document.querySelectorAll('[data-story-color]').forEach((button) => button.addEventListener('click', () => { state.storyColor = button.dataset.storyColor; document.querySelectorAll('[data-story-color]').forEach((item) => item.classList.toggle('selected', item === button)); }));
  $('studyco-story-form').addEventListener('submit', createStory);
  [$('studyco-edit-profile'), $('studyco-profile-edit-small')].forEach((button) => button.addEventListener('click', () => { fillEditForm(); openModal('studyco-edit-modal'); }));
  $('studyco-profile-form').addEventListener('submit', saveProfile);
  $('studyco-profile-photo').addEventListener('change', (event) => previewFile(event.target.files[0], 'studyco-photo-preview'));
  $('studyco-cover-photo').addEventListener('change', (event) => previewFile(event.target.files[0], 'studyco-cover-preview'));
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.closest('.studyco-modal-backdrop').id)));
  $('studyco-new-message')?.addEventListener('click', () => { setView('friends'); $('studyco-people-search').focus(); });
  $('studyco-message-search')?.addEventListener('input', () => loadChats());
  $('studyco-post-feed').addEventListener('click', async (event) => { const button = event.target.closest('[data-post-action]'); if (!button) return; if (button.dataset.postAction === 'like') await toggleLike(button.dataset.postId); if (button.dataset.postAction === 'focus-comment') button.closest('.studyco-post').querySelector('input')?.focus(); });
  $('studyco-post-feed').addEventListener('submit', async (event) => { if (!event.target.matches('[data-comment-post]')) return; event.preventDefault(); await addComment(event.target.dataset.commentPost, event.target.querySelector('input').value); event.target.reset(); });
  $('studyco-people-results').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-request-list').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-friend-list').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-chat-list').addEventListener('click', (event) => { const button = event.target.closest('[data-chat-uid]'); if (button) openChat(button.dataset.chatUid); });
  $('studyco-chat-panel').addEventListener('submit', (event) => { if (event.target.id === 'studyco-chat-form') sendMessage(event); });
  $('studyco-chat-panel').addEventListener('click', (event) => { const button = event.target.closest('[data-start-call]'); if (button) startCall(button.dataset.startCall); });
  $('studyco-call-accept').addEventListener('click', acceptIncomingCall); $('studyco-call-decline').addEventListener('click', declineCall);
  $('studyco-logout').addEventListener('click', () => signOut(auth));
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
  showApp(); renderProfile(); subscribeFeed(); subscribeStories(); listenForCalls(); loadPeople(); await loadSocialLists(); await refreshNavCounts(); loadChats();
}

wire();
window.onAqsAuthChange(async (user) => {
  if (!user || user.isAnonymous) { state.user = null; showAuth(); return; }
  state.user = user;
  try { await bootApp(); } catch (error) { toast(error.message || 'StudyCo Meet could not load.', true); }
});