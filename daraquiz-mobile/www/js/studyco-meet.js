import { auth, db } from './aqs-firebase.js';
import { signOut } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, doc, getDoc, getDocs, setDoc, addDoc, updateDoc, deleteDoc, query, where, orderBy, documentId, startAfter, limit, onSnapshot, serverTimestamp, Timestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
const MAX_STORY_VIDEO_SIZE = 5 * 1024 * 1024;
const MAX_STORY_VIDEO_SECONDS = 40;

const state = {
  user: null, profile: null, profiles: new Map(), posts: [], stories: [],
  viewedProfileUid: null, viewedProfile: null, viewedProfilePosts: [], viewedProfileRelation: 'none', activeProfileTab: 'posts',
  friends: [], requests: [], sentRequests: [], activeView: 'home', selectedTemplate: 'indigo',
  dismissedSuggestions: new Set(), postPreferences: new Map(),
  storyColor: '#5b5bd6', storyIndex: 0, storyViewerOpen: false, storyPreviousHash: '#home', pendingStoryId: '', postImage: null, postFile: null, storyFile: null, storyPreviewUrl: '', storyVideoDuration: 0, storySelectionToken: 0, wired: false,
  feedUnsub: null, scheduleTimer: null, storyUnsub: null, privateStoryUnsub: null, publicStories: [], privateStories: [], requestUnsub: null, chatListUnsub: null, chatListOwner: null, messageUnsub: null, notificationUnsub: null, chatSettingsUnsub: null, blockedUsersUnsub: null, chatSettingsOwner: null, blockedUsersOwner: null,
  notifications: [],
  friendRequestSort: 'newest',
  incomingCallUnsub: null, callUnsub: null, candidateUnsub: null, callHistoryUnsubs: [],
  callHistory: [], incomingCallTimers: new Map(), incomingCallIds: new Set(),
  presence: new Map(), presenceUnsubs: new Map(), presenceHeartbeat: null,
  conversations: [], chatSettings: new Map(), chatSettingsReady: false, blockedUserIds: new Set(), showArchivedChats: false, chatRecorder: null, chatRecordingStream: null, chatRecordedChunks: [], chatRecordingTimer: null, chatRecordingStartedAt: 0, chatRecordingElapsedMs: 0, chatRecordingStarting: false, chatRecordingAttemptId: 0, chatRecordingSession: null, chatReceiptRefreshTimer: null, activeChatUid: null, activeChatId: null, activeCallId: null, searchTimer: null, searchRequestId: 0, feedRenderTokens: new WeakMap(),
  pendingIncomingCall: null, incomingPreviewPromise: null, rtc: null, localStream: null, callTimeout: null, callProfile: null, callIncoming: false, callMinimized: false,
  ringToneTimer: null, audioContext: null, presenceWired: false, callStartedAt: 0,
  callElapsedTimer: null, muted: false, speakerOn: true, callSpeakerOn: true, callMode: 'audio', callConnected: false, mediaRecorder: null,
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
const avatar = (profile, size = '') => {
  const photoURL = profile?.photoURL || profile?.photoUrl || '';
  const fallback = esc(initials(profile));
  return `<div class="studyco-avatar ${size}">${photoURL ? `<img src="${esc(photoURL)}" alt="" data-avatar-fallback="${fallback}" loading="lazy" decoding="async">` : fallback}</div>`;
};
function handleAvatarImageError(event) {
  const image = event.target;
  if (!image?.matches?.('.studyco-avatar img')) return;
  const avatarElement = image.closest?.('.studyco-avatar');
  if (avatarElement) avatarElement.textContent = image.dataset.avatarFallback || 'SC';
}
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
function visibleNotifications() {
  return state.notifications.filter((item) => {
    if (item.type !== 'message' || !item.conversationId) return true;
    if (!state.chatSettingsReady) return false;
    return state.chatSettings.get(item.conversationId)?.muted !== true;
  });
}

function refreshNavCounts() {
  if (!state.user) return;
  setNavBadge('studyco-home-badge', state.posts.filter((post) => post.userId === state.user.uid).length);
  setNavBadge('studyco-friend-badge', state.requests.length);
  setNavBadge('studyco-notification-badge', visibleNotifications().filter((item) => item.read !== true).length);
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
  const visible = visibleNotifications();
  const unread = visible.filter((item) => item.read !== true).length;
  $('studyco-notification-count').textContent = String(unread);
  setNavBadge('studyco-notification-badge', unread);
  target.innerHTML = visible.length
    ? visible.map((notification) => {
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
      refreshNavCounts();
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

async function uploadStoryMedia(file, path, mediaType) {
  if (mediaType === 'image') return uploadImage(file, path);
  if (mediaType !== 'video') return '';
  if (!file.type.startsWith('video/')) throw new Error('Choose a valid video for your story.');
  if (file.size > MAX_STORY_VIDEO_SIZE) throw new Error('Videos must be 5 MB or smaller.');
  if (typeof window.aqsUploadFile === 'function') return window.aqsUploadFile(file, path);
  throw new Error('Cloudinary storage is not ready. Please ask the administrator to configure it.');
}

async function uploadAttachment(file, path) {
  if (!file) return '';
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file below 25 MB.');
  if (typeof window.aqsUploadFile === 'function') return window.aqsUploadFile(file, path);
  throw new Error('File storage is not ready. Please ask the administrator to configure it.');
}

function publicProfile(profile) {
  if (!profile) return profile;
  const visible = profile.profileVisibility || {};
  const result = { ...profile };
  delete result.storyPrivacy;
  if (visible.displayName === false) result.displayName = '';
  if (visible.photoURL === false) {
    delete result.photoURL;
    delete result.coverURL;
  }
  if (visible.bio === false) result.bio = '';
  if (visible.education === false) {
    ['institution', 'institutionType', 'school', 'department', 'major', 'educationLevel', 'educationStatus'].forEach((field) => { delete result[field]; });
  }
  if (visible.location === false) {
    delete result.location;
    delete result.address;
  }
  if (visible.phone === false) delete result.phone;
  if (visible.email === false) delete result.email;
  if (visible.dateOfBirth === false) delete result.dateOfBirth;
  if (visible.relationship === false) {
    delete result.maritalStatus;
    delete result.relationshipName;
  }
  return result;
}

async function getProfile(uid) {
  if (!uid) return null;
  if (state.profiles.has(uid)) return state.profiles.get(uid);
  const snap = await getDoc(doc(db, 'social_profiles', uid));
  if (!snap.exists()) return null;
  const data = snap.data();
  const profile = { id: snap.id, ...data };
  if (!profile.photoURL) profile.photoURL = profile.photoUrl || (uid === state.user?.uid ? state.user?.photoURL : '') || '';
  delete profile.photoUrl;
  const visibleProfile = uid === state.user?.uid ? profile : publicProfile(profile);
  state.profiles.set(uid, visibleProfile); return visibleProfile;
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
  let legacy = {};
  try { const snap = await getDoc(doc(db, 'users', user.uid)); if (snap.exists()) legacy = snap.data(); } catch (_) {}
  if (existing) {
    const backfill = {};
    const legacyValues = {
      displayName: legacy.name || legacy.displayName || user.displayName || '',
      username: legacy.username || '',
      phone: legacy.phone || legacy.phoneNumber || '',
      school: legacy.institution || legacy.school || legacy.school_name || '',
      department: legacy.department || '',
      major: legacy.major || '',
      gender: legacy.gender || legacy.sex || '',
      location: legacy.location || legacy.city || '',
      photoURL: legacy.photoURL || legacy.photoUrl || legacy.profile_picture || legacy.avatar || user.photoURL || '',
      email: legacy.email || user.email || ''
    };
    Object.entries(legacyValues).forEach(([key, value]) => {
      if (!existing[key] && value) backfill[key] = value;
    });
    if (Object.keys(backfill).length) {
      await setDoc(doc(db, 'social_profiles', user.uid), backfill, { merge: true });
    }
    state.profile = { ...existing, ...backfill };
    state.profiles.set(user.uid, state.profile);
    return state.profile;
  }
  const fallback = {
    uid: user.uid, displayName: user.displayName || legacy.name || legacy.displayName || user.email?.split('@')[0] || 'StudyCo learner',
    username: legacy.username || (user.email || 'learner').split('@')[0].replace(/[^a-z0-9_-]/gi, '').slice(0, 24) || 'learner',
    email: user.email || '', loginIdentifier: user.email || '', phone: legacy.phone || legacy.phoneNumber || '', bio: '', studentStatus: '',
    school: legacy.institution || legacy.school || legacy.school_name || '', department: legacy.department || '', major: legacy.major || '',
    gender: legacy.gender || legacy.sex || '', location: legacy.location || legacy.city || '',
    photoURL: user.photoURL || legacy.photoURL || legacy.photoUrl || legacy.profile_picture || legacy.avatar || '', coverURL: '', createdAt: serverTimestamp(), updatedAt: serverTimestamp()
  };
  await setDoc(doc(db, 'social_profiles', user.uid), fallback, { merge: true });
  state.profile = { ...fallback, id: user.uid }; state.profiles.set(user.uid, state.profile);
  return state.profile;
}

function showAuth() {
  $('studyco-boot-screen')?.remove();
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
  $('studyco-boot-screen')?.remove();
  const composerPrompt = $('studyco-open-composer');
  if (composerPrompt) composerPrompt.textContent = "What's on your mind?";
  const composerAvatar = $('studyco-composer-avatar');
  if (composerAvatar && !composerAvatar.childElementCount) {
    composerAvatar.innerHTML = '<div class="studyco-avatar small" aria-label="Your profile picture">SC</div>';
  }
  $('studyco-auth-screen').hidden = true; $('studyco-app-screen').hidden = false;
}

function renderProfileActions(uid, isOwnProfile) {
  const ownerActions = $('studyco-profile-owner-actions');
  const publicActions = $('studyco-profile-public-actions');
  if (!ownerActions || !publicActions) return;
  ownerActions.hidden = !isOwnProfile;
  publicActions.hidden = isOwnProfile;
  if (isOwnProfile) { publicActions.innerHTML = ''; return; }
  const isFriend = state.friends.some((friend) => friend.uid === uid);
  const incoming = state.requests.some((request) => request.requesterId === uid);
  const outgoing = state.sentRequests.some((request) => request.recipientId === uid);
  const relation = isFriend ? 'friends' : incoming ? 'incoming' : outgoing ? 'outgoing' : (state.viewedProfileRelation || 'none');
  const safeUid = esc(uid || '');
  let action = '';
  if (relation === 'friends') action = '<button class="studyco-button primary" type="button" data-friend-action="message" data-uid="' + safeUid + '">Message</button>';
  else if (relation === 'incoming') action = '<button class="studyco-button primary" type="button" data-friend-action="accept" data-uid="' + safeUid + '">Accept request</button>';
  else if (relation === 'outgoing') action = '<button class="studyco-button soft" type="button" disabled>Request sent</button>';
  else action = '<button class="studyco-button primary" type="button" data-friend-action="request" data-uid="' + safeUid + '">Add friend</button>';
  const more = '<div class="studyco-profile-more-wrap"><button class="studyco-button soft studyco-profile-more-toggle" type="button" data-profile-more-toggle aria-expanded="false" aria-haspopup="menu">More <span aria-hidden="true">⋯</span></button><div class="studyco-profile-more-menu" data-profile-more-menu role="menu" hidden><button type="button" role="menuitem" data-profile-more-action="view-details">View full profile</button></div></div>';
  publicActions.innerHTML = action + more;
}

async function renderProfileTab(tab) {
  const allowedTabs = ['posts', 'photos'];
  if (!allowedTabs.includes(tab)) tab = 'posts';
  state.activeProfileTab = tab;
  document.querySelectorAll('#studyco-profile-tabs [data-profile-tab]').forEach((button) => {
    const selected = button.dataset.profileTab === tab;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  document.querySelectorAll('#studyco-view-profile [data-profile-panel]').forEach((panel) => {
    panel.hidden = panel.dataset.profilePanel !== tab;
  });
  const profileUid = state.viewedProfileUid || state.user?.uid;
  const includePrivate = profileUid === state.user?.uid;
  const posts = state.viewedProfilePosts || [];
  const target = tab === 'photos' ? $('studyco-profile-photos') : $('studyco-profile-posts');
  const visiblePosts = tab === 'photos' ? posts.filter((post) => Boolean(post.imageUrl)) : posts;
  await renderFeed(target, visiblePosts, { includePrivate, showAuthor: false });
}

function renderProfileDetailEditButtons(isOwnProfile) {
  const fields = [
    ['studyco-profile-detail-name', 'studyco-edit-name', 'full name'],
    ['studyco-profile-about-copy', 'studyco-edit-bio', 'short bio'],
    ['studyco-profile-status-detail', 'studyco-edit-status', 'student status'],
    ['studyco-profile-education-level', 'studyco-edit-education-level', 'education level'],
    ['studyco-profile-education-status', 'studyco-edit-education-status', 'education status'],
    ['studyco-profile-school', 'studyco-edit-school', 'school'],
    ['studyco-profile-department', 'studyco-edit-department', 'department'],
    ['studyco-profile-major', 'studyco-edit-major', 'major'],
    ['studyco-profile-gender', 'studyco-edit-gender', 'gender'],
    ['studyco-profile-date-of-birth', 'studyco-edit-date-of-birth', 'date of birth'],
    ['studyco-profile-marital-status', 'studyco-edit-marital-status', 'marital status'],
    ['studyco-profile-relationship-name', 'studyco-edit-relationship-name', 'partner name'],
    ['studyco-profile-address', 'studyco-edit-address', 'address'],
    ['studyco-profile-location', 'studyco-edit-location', 'location'],
    ['studyco-profile-phone', 'studyco-edit-contact', 'phone number'],
    ['studyco-profile-email', 'studyco-edit-email', 'email']
  ];
  fields.forEach(([valueId, inputId, label]) => {
    const value = $(valueId);
    const row = value?.closest('.studyco-profile-detail');
    if (!row) return;
    let button = row.querySelector('.studyco-profile-field-edit');
    if (!button) {
      button = document.createElement('button');
      button.className = 'studyco-profile-field-edit';
      button.type = 'button';
      button.dataset.editInput = inputId;
      button.setAttribute('aria-label', 'Edit ' + label);
      button.title = 'Edit ' + label;
      button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.7 6.3 3 3M4 20l4.3-.9L19.2 8.2a2.1 2.1 0 0 0-3-3L5.3 16.1 4 20Z"/></svg>';
      row.appendChild(button);
    }
    button.hidden = !isOwnProfile;
  });
}

function handleProfileMoreClick(event) {
  const toggle = event.target.closest('[data-profile-more-toggle]');
  if (toggle) {
    event.preventDefault();
    const menu = toggle.parentElement.querySelector('[data-profile-more-menu]');
    if (!menu) return;
    menu.hidden = !menu.hidden;
    toggle.setAttribute('aria-expanded', String(!menu.hidden));
    return;
  }
  const actionButton = event.target.closest('[data-profile-more-action]');
  if (!actionButton) return;
  event.preventDefault();
  const action = actionButton.dataset.profileMoreAction;
  const menu = actionButton.closest('[data-profile-more-menu]');
  if (menu) menu.hidden = true;
  const parentToggle = actionButton.closest('.studyco-profile-more-wrap')?.querySelector('[data-profile-more-toggle]');
  parentToggle?.setAttribute('aria-expanded', 'false');
  if (action === 'edit-details') { window.openStudyCoProfileEditor(); return; }
  if (action === 'change-photo' && state.viewedProfileUid === state.user?.uid) { $('studyco-inline-profile-photo')?.click(); return; }
  if (action === 'change-cover' && state.viewedProfileUid === state.user?.uid) { $('studyco-inline-cover-photo')?.click(); return; }
  if (action === 'view-details') $('studyco-profile-about-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderProfile() {
  const p = state.viewedProfile || state.profile || {};
  const uid = state.viewedProfileUid || state.user?.uid;
  const isOwnProfile = uid === state.user?.uid;
  const profileNameText = profileName(p);
  renderProfileActions(uid, isOwnProfile);
  const profilePostCount = state.posts.filter((post) => post.userId === uid).length;
  $('studyco-top-name').textContent = profileName(p);
  $('studyco-hello-name').textContent = `, ${profileName(p).split(' ')[0] || 'there'}`;
  $('studyco-mini-profile').innerHTML = `${avatar(p, 'small')}<div><strong>${esc(profileName(p))}</strong><span>${esc(p.username ? `@${p.username}` : 'Complete your profile')}</span></div>`;
  $('studyco-composer-avatar').innerHTML = avatar(p, 'small');
  $('studyco-top-avatar').innerHTML = avatar(p, 'small');
  $('studyco-profile-avatar').innerHTML = `${avatar(p, 'large')}${isOwnProfile ? '<label class="studyco-profile-media-edit studyco-profile-avatar-edit" title="Change profile photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13" r="3.2"/></svg><input id="studyco-inline-profile-photo" type="file" accept="image/*"></label>' : ''}`;
  $('studyco-profile-name').textContent = profileName(p);
  $('studyco-profile-handle').textContent = p.username ? `@${p.username}` : '';
  $('studyco-profile-bio').textContent = p.bio || 'Tell your study circle about yourself.';
  $('studyco-profile-status').textContent = p.studentStatus || 'Learning';
  $('studyco-profile-about-copy').textContent = p.bio || (isOwnProfile ? 'Add a short bio so classmates know what you are learning and how they can connect with you.' : 'No bio added yet.');
  $('studyco-profile-gender').textContent = p.gender || 'Not added yet';
  $('studyco-profile-status-detail').textContent = p.studentStatus || 'Not added yet';
  $('studyco-profile-education-level').textContent = p.educationLevel || 'Not added yet';
  $('studyco-profile-education-status').textContent = p.educationStatus || 'Not added yet';
  $('studyco-profile-school').textContent = p.school || 'Not added yet';
  $('studyco-profile-department').textContent = p.department || 'Not added yet';
  $('studyco-profile-major').textContent = p.major || 'Not added yet';
  $('studyco-profile-detail-name').textContent = profileName(p);
  $('studyco-profile-date-of-birth').textContent = isOwnProfile ? (p.dateOfBirth || 'Not added yet') : 'Not shared';
  $('studyco-profile-marital-status').textContent = p.maritalStatus || 'Not added yet';
  $('studyco-profile-relationship-name').textContent = isOwnProfile ? (p.relationshipName || 'Not added yet') : 'Not shared';
  $('studyco-profile-relationship-name-detail').hidden = !isOwnProfile;
  $('studyco-profile-address').textContent = isOwnProfile ? (p.address || 'Not added yet') : 'Not shared';
  $('studyco-profile-location').textContent = p.location || 'Not added yet';
  $('studyco-profile-phone').textContent = isOwnProfile ? (p.phone || 'Not added yet') : 'Not shared';
  $('studyco-profile-email').textContent = isOwnProfile ? (p.email || 'Not added yet') : 'Not shared';
  renderProfileDetailEditButtons(isOwnProfile);
  const profileFields = [p.displayName, p.bio, p.photoURL, p.coverURL, p.studentStatus, p.educationLevel, p.educationStatus, p.school, p.department || p.major, p.gender, p.dateOfBirth, p.maritalStatus, p.address, p.location, p.phone, p.email];
  const complete = profileFields.filter(Boolean).length;
  const completion = Math.round((complete / profileFields.length) * 100);
  $('studyco-profile-completion').textContent = `${completion}%`;
  $('studyco-profile-progress-label').textContent = `${complete} of ${profileFields.length} details`;
  $('studyco-profile-progress-bar').style.width = `${completion}%`;
  $('studyco-profile-progress').hidden = !isOwnProfile;
  $('studyco-profile-completion-stat').hidden = !isOwnProfile;
  $('studyco-profile-post-count').textContent = String(profilePostCount);
  $('studyco-profile-friend-count').textContent = isOwnProfile ? String(state.friends.length) : String(p.friendCount || 0);
  $('studyco-profile-stats').classList.toggle('is-public', !isOwnProfile);
  const cover = $('studyco-profile-cover');
  cover.innerHTML = `${p.coverURL ? `<img src="${esc(p.coverURL)}" alt="Cover banner">` : ''}<div class="studyco-profile-cover-shade"></div>${!p.coverURL ? '<span class="studyco-profile-cover-label">Your learning space</span>' : ''}${isOwnProfile ? '<label class="studyco-profile-media-edit studyco-profile-cover-edit" title="Change cover photo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><circle cx="12" cy="13" r="3.2"/></svg><input id="studyco-inline-cover-photo" type="file" accept="image/*"></label>' : ''}`;
  const coverLabel = cover.querySelector('.studyco-profile-cover-label');
  if (coverLabel) coverLabel.textContent = isOwnProfile ? 'Your learning space' : 'StudyCo learning profile';
  $('studyco-profile-posts-heading').hidden = false;
  $('studyco-profile-posts-title').textContent = isOwnProfile ? 'Your posts' : `Posts by ${profileNameText}`;
  $('studyco-profile-posts-copy').textContent = isOwnProfile ? 'Updates you have shared with StudyCo.' : `Updates shared by ${profileNameText}.`;
  const profileNext = $('studyco-profile-next');
  if (profileNext) profileNext.hidden = !isOwnProfile;
}

function viewHash(view, identifier = '') {
  return ((view === 'messages' || view === 'profile') && identifier)
    ? `#${view}/${encodeURIComponent(identifier)}`
    : `#${view}`;
}

function profileUidFromPath() {
  const match = window.location.pathname.match(/\/studyco-meet\/profile\/([^/]+)/i);
  if (!match) return '';
  try { return decodeURIComponent(match[1]); } catch (_) { return match[1]; }
}

function setView(view, { updateUrl = true, chatUid = view === 'messages' ? null : state.activeChatUid, profileUid = view === 'profile' ? state.viewedProfileUid : null } = {}) {
  if (view !== 'home' && !$('studyco-post-editor')?.hidden) closePostEditor();
  if (view === 'messages' && !chatUid && state.activeChatUid) {
    state.activeChatUid = null;
    state.activeChatId = null;
    state.messageUnsub?.();
    state.messageUnsub = null;
  }
  state.activeView = view;
  document.body.dataset.studycoView = view;
  const routeIdentifier = view === 'messages' ? chatUid : view === 'profile' ? profileUid : '';
  if (updateUrl && window.location.hash !== viewHash(view, routeIdentifier)) {
    window.history.pushState({ studycoView: view, chatUid, profileUid }, '', viewHash(view, routeIdentifier));
  }
  const messagesShell = document.querySelector('.studyco-messages-shell');
  if (messagesShell) messagesShell.classList.toggle('chat-open', view === 'messages' && Boolean(chatUid));
  scheduleChatViewportSync();
  const layout = document.querySelector('.studyco-layout');
  if (layout) layout.classList.toggle('profile-view', view === 'profile');
  document.querySelectorAll('[data-studyco-view]').forEach((button) => button.classList.toggle('active', button.dataset.studycoView === view));
  document.querySelectorAll('.studyco-view').forEach((section) => section.classList.toggle('active', section.id === `studyco-view-${view}`));
  const menu = $('studyco-menu-panel');
  if (menu) menu.hidden = true;
  if (view === 'friends') loadSocialLists();
  if (view === 'profile') loadProfileView(profileUid || state.user.uid);
  if (view === 'messages') loadChats();
  if (view === 'notifications') renderNotifications();
}

function syncChatViewport() {
  const shell = document.querySelector('.studyco-messages-shell.chat-open');
  if (!shell || !document.querySelector('#studyco-view-messages.active')) {
    document.body.classList.remove('studyco-chat-keyboard-open');
    document.querySelector('.studyco-messages-shell')?.style.removeProperty('--studyco-chat-panel-height');
    return;
  }
  const viewport = window.visualViewport;
  const keyboardInset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
  const touchInputFocused = document.activeElement?.id === 'studyco-chat-input' && window.matchMedia?.('(pointer: coarse)')?.matches;
  const keyboardOpen = keyboardInset > 120 || touchInputFocused;
  document.body.classList.toggle('studyco-chat-keyboard-open', keyboardOpen);
  const bottomNav = document.querySelector('.aqs-bottom-nav');
  const navHeight = !keyboardOpen && bottomNav ? bottomNav.getBoundingClientRect().height : 0;
  const viewportBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const shellTop = Math.max(0, shell.getBoundingClientRect().top);
  const panelHeight = Math.max(160, viewportBottom - shellTop - navHeight);
  shell.style.setProperty('--studyco-chat-panel-height', panelHeight + 'px');
}

function scheduleChatViewportSync() {
  if (window.requestAnimationFrame) window.requestAnimationFrame(syncChatViewport);
  else window.setTimeout(syncChatViewport, 0);
}
async function syncRoute() {
  const pathProfileUid = profileUidFromPath();
  if (pathProfileUid) {
    if (state.storyViewerOpen) closeStoryViewer({ restoreRoute: false });
    setView('profile', { updateUrl: false, profileUid: pathProfileUid });
    return;
  }
  const parts = window.location.hash.replace(/^#/, '').split('/');
  if (parts[0] === 'story' && parts[1]) {
    setView('home', { updateUrl: false });
    let storyId = '';
    try { storyId = decodeURIComponent(parts[1]); } catch (_) { storyId = parts[1]; }
    const story = activeStories().find((item) => item.id === storyId);
    if (story) showStory(story, { updateUrl: false });
    else state.pendingStoryId = storyId;
    return;
  }
  if (state.storyViewerOpen) closeStoryViewer({ restoreRoute: false });
  state.pendingStoryId = '';
  const view = ['search', 'friends', 'messages', 'notifications', 'profile'].includes(parts[0]) ? parts[0] : 'home';
  const identifier = parts[1] ? decodeURIComponent(parts[1]) : '';
  setView(view, { updateUrl: false, chatUid: view === 'messages' ? identifier : '', profileUid: view === 'profile' ? identifier || state.user.uid : null });
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

async function findPeople(term = '', { broad = false, shouldContinue = () => true } = {}) {
  const needle = term.trim().toLowerCase();
  const results = [];
  let cursor = null;
  const pageSize = 120;
  while (results.length < 12 && shouldContinue()) {
    const constraints = [orderBy(documentId())];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    const snap = await getDocs(query(collection(db, 'social_profiles'), ...constraints));
    if (!snap.docs.length) break;
    cursor = snap.docs[snap.docs.length - 1];
    const pageProfiles = snap.docs.map((item) => publicProfile({ id: item.id, ...item.data() }))
      .filter((profile) => profile.id !== state.user.uid
        && (Boolean(needle) || !state.dismissedSuggestions.has(profile.id))
        && (!needle || [profileName(profile), profile.username, ...(broad ? [profile.school, profile.department, profile.major] : [])].filter(Boolean).join(' ').toLowerCase().includes(needle)));
    results.push(...pageProfiles);
    if (snap.docs.length < pageSize) break;
  }
  return results.slice(0, 12);
}

async function findPosts(term, { shouldContinue = () => true } = {}) {
  const needle = term.trim().toLowerCase();
  const results = [];
  let cursor = null;
  const pageSize = 30;
  while (results.length < 30 && shouldContinue()) {
    const constraints = [orderBy('createdAt', 'desc')];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    const snap = await getDocs(query(collection(db, 'studyco_posts'), ...constraints));
    if (!snap.docs.length) break;
    cursor = snap.docs[snap.docs.length - 1];
    const pageMatches = await Promise.all(snap.docs.map(async (item) => {
      const post = { id: item.id, ...item.data() };
      if (!isPublicPost(post) || !shouldContinue()) return null;
      const postText = [post.content || '', post.fileName || '', post.linkUrl || ''].join(' ').toLowerCase();
      if (postText.includes(needle)) return post;
      const author = await getProfile(post.userId);
      if (!shouldContinue()) return null;
      const authorText = [profileName(author), author?.username || '', author?.school || '', author?.department || ''].join(' ').toLowerCase();
      return authorText.includes(needle) ? post : null;
    }));
    results.push(...pageMatches.filter(Boolean));
    if (snap.docs.length < pageSize) break;
  }
  return results.slice(0, 30);
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

  const isCurrentSearch = () => requestId === state.searchRequestId && $('studyco-page-search')?.value.trim() === term;
  const [profiles, posts] = await Promise.all([
    findPeople(term, { broad: true, shouldContinue: isCurrentSearch }),
    findPosts(term, { shouldContinue: isCurrentSearch })
  ]);
  if (!isCurrentSearch()) return;
  profiles.forEach((profile) => state.profiles.set(profile.id, profile));
  await renderPeople(profiles, $('studyco-search-people-results'));
  await renderFeed($('studyco-search-post-results'), posts);
  $('studyco-search-people-group').hidden = !profiles.length;
  $('studyco-search-posts-group').hidden = !posts.length;
  $('studyco-search-empty').hidden = Boolean(profiles.length || posts.length);
}

function isPublicPost(post) {
  const status = post.status || 'published';
  if (status === 'hidden' || status === 'paused') return false;
  if (status === 'scheduled') return timeMs(post.scheduledAt) <= Date.now();
  return true;
}

function postStatusLabel(post) {
  const status = post.status || 'published';
  if (status === 'scheduled') return timeMs(post.scheduledAt) > Date.now() ? `Scheduled for ${new Date(timeMs(post.scheduledAt)).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}` : 'Published';
  if (status === 'hidden') return 'Hidden from your circle';
  if (status === 'paused') return 'Paused';
  if (status === 'failed') return 'Needs retry';
  return '';
}

function postPreferenceControls(post) {
  if (post.userId === state.user.uid) return '';
  const preference = state.postPreferences.get(post.id);
  return `<details class="studyco-profile-post-management studyco-profile-post-management-viewer"><summary aria-label="More post options" title="More options">•••</summary><div class="studyco-post-preferences" role="group" aria-label="Post preferences"><span>See more like this?</span><button class="${preference === 'interested' ? 'selected' : ''}" data-post-action="interested" data-post-id="${esc(post.id)}" type="button">Interested</button><button class="${preference === 'not_interested' ? 'selected' : ''}" data-post-action="not-interested" data-post-id="${esc(post.id)}" type="button">Not interested</button><button class="close" data-post-action="close-preferences" data-post-id="${esc(post.id)}" type="button" aria-label="Close post preferences">×</button></div></details>`;
}

function profilePostManagement(post) {
  if (post.userId !== state.user.uid) return postPreferenceControls(post);
  const pauseLabel = post.status === 'paused' ? 'Resume post' : 'Pause post';
  const hideLabel = post.status === 'hidden' ? 'Show post' : 'Hide post';
  return `<details class="studyco-profile-post-management studyco-profile-post-management-owner"><summary aria-label="More post options" title="More options">•••</summary><div class="studyco-profile-post-management-actions"><button data-post-action="edit" data-post-id="${esc(post.id)}" type="button">Edit post</button><button data-post-action="reschedule" data-post-id="${esc(post.id)}" type="button">Reschedule</button><button data-post-action="pause" data-post-id="${esc(post.id)}" type="button">${pauseLabel}</button><button data-post-action="hide" data-post-id="${esc(post.id)}" type="button">${hideLabel}</button><button data-post-action="retry" data-post-id="${esc(post.id)}" type="button">Retry / publish</button><button class="danger" data-post-action="delete" data-post-id="${esc(post.id)}" type="button">Delete post</button></div></details>`;
}

const MAX_POST_CHARACTERS = 200000;
const POST_PREVIEW_WORD_LIMIT = 150;

function postTextPreview(content) {
  const value = String(content || '');
  const words = value.trim().split(/\s+/, POST_PREVIEW_WORD_LIMIT + 1);
  const hasMore = words.length > POST_PREVIEW_WORD_LIMIT;
  return { preview: hasMore ? words.slice(0, POST_PREVIEW_WORD_LIMIT).join(' ') : value, hasMore };
}

async function openPostImageViewer(postId) {
  const post = state.posts.find((item) => item.id === postId);
  const viewer = $('studyco-image-viewer-modal');
  const image = $('studyco-image-viewer-image');
  const saveButton = $('studyco-save-post-image');
  if (!post?.imageUrl || !viewer || !image || !saveButton || !state.user) return;
  viewer.dataset.postId = post.id;
  image.src = post.imageUrl;
  image.alt = 'Expanded image from a post';
  saveButton.disabled = true;
  saveButton.textContent = 'Checking save status…';
  openModal('studyco-image-viewer-modal');
  try {
    const saved = await getDoc(doc(db, 'users', state.user.uid, 'savedImages', post.id));
    saveButton.dataset.saved = String(saved.exists());
    saveButton.textContent = saved.exists() ? 'Saved to account' : 'Save to account';
  } catch (error) {
    saveButton.dataset.saved = 'false';
    saveButton.textContent = 'Save to account';
    toast(error.message || 'Saved image status could not load.', true);
  } finally { saveButton.disabled = false; }
}

async function toggleSavedPostImage() {
  const viewer = $('studyco-image-viewer-modal');
  const button = $('studyco-save-post-image');
  const post = state.posts.find((item) => item.id === viewer?.dataset.postId);
  if (!post?.imageUrl || !state.user || !button) return;
  const savedRef = doc(db, 'users', state.user.uid, 'savedImages', post.id);
  const remove = button.dataset.saved === 'true';
  button.disabled = true;
  try {
    if (remove) await deleteDoc(savedRef);
    else await setDoc(savedRef, { postId: post.id, imageUrl: post.imageUrl, savedAt: serverTimestamp() });
    button.dataset.saved = String(!remove);
    button.textContent = remove ? 'Save to account' : 'Saved to account';
    toast(remove ? 'Image removed from saved items.' : 'Image saved to your account.');
  } catch (error) {
    toast(error.message || 'The image could not be saved.', true);
  } finally { button.disabled = false; }
}

async function downloadPostImage() {
  const image = $('studyco-image-viewer-image');
  const button = $('studyco-download-post-image');
  if (!image?.src || !button) return;
  button.disabled = true;
  try {
    const response = await fetch(image.src, { mode: 'cors' });
    if (!response.ok) throw new Error('The image could not be downloaded.');
    const blob = await response.blob();
    const extension = (blob.type.split('/')[1] || 'jpg').split(';')[0].replace(/[^a-z0-9]/gi, '') || 'jpg';
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = `studyco-image-${Date.now()}.${extension}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(downloadUrl), 30000);
    toast('Image download started.');
  } catch (_) {
    window.open(image.src, '_blank', 'noopener,noreferrer');
    toast('The image opened in your browser. Use its Save or Download option.');
  } finally { button.disabled = false; }
}
function renderPost(post, { showAuthor = true } = {}) {
  /* Render the Facebook-style feed card without adding author or comment reads to the initial paint. */
  const author = state.profiles.get(post.userId) || null;
  const liked = false;
  const { preview, hasMore } = postTextPreview(post.content);
  const text = post.content ? `<div class="studyco-post-body" data-post-body>${esc(preview)}</div>${hasMore ? `<button class="studyco-post-read-more" data-post-action="read-more" data-post-id="${esc(post.id)}" type="button">Read more</button>` : ''}` : '';
  const image = post.imageUrl ? `<button class="studyco-post-image-button" type="button" data-open-post-image data-post-id="${esc(post.id)}" aria-label="Open post image"><img class="studyco-post-image" src="${esc(post.imageUrl)}" alt="Post attachment" loading="lazy" decoding="async"></button>` : '';
  const file = post.fileUrl ? `<a class="studyco-post-file" href="${esc(post.fileUrl)}" target="_blank" rel="noopener">📎 ${esc(post.fileName || 'Open attached file')}</a>` : '';
  const linkUrl = normalizeUrl(post.linkUrl);
  const link = linkUrl ? `<a class="studyco-post-link" href="${esc(linkUrl)}" target="_blank" rel="noopener">${esc(linkUrl)}</a>` : '';
  const likeCount = Number(post.likeCount) || 0;
  const commentCount = Number(post.commentCount) || 0;
  const status = postStatusLabel(post);
  const likeIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10v10H4V10h3Zm3 10h6.7c.9 0 1.7-.6 2-1.4l1.8-5.5A1.7 1.7 0 0 0 18.9 11H15l.5-3.1c.2-1.1-.5-2.2-1.6-2.5L13 5l-3 5v10Z"/></svg>';
  const commentIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4 2v-4.2a7.5 7.5 0 1 1 16-5.3Z"/></svg>';
  const authorMeta = [author?.school || author?.username, timeText(post.createdAt)].filter(Boolean).join(' · ');
  const authorHead = showAuthor ? `<a class="studyco-post-author" href="${viewHash('profile', post.userId)}" data-profile-uid="${esc(post.userId)}" aria-label="View ${esc(profileName(author))}'s profile">${avatar(author, 'small')}<span><strong>${esc(profileName(author))}</strong><small>${esc(authorMeta)}</small></span></a>` : '';
  const postHead = authorHead ? `<div class="studyco-post-head">${authorHead}</div>` : '';
  const profilePostClass = showAuthor ? '' : ' studyco-profile-post';
  const postManagement = profilePostManagement(post);
  const engagement = `<div class="studyco-post-engagement" aria-label="Post reactions and comments"${likeCount || commentCount ? '' : ' hidden'}><div class="studyco-post-reaction-summary"${likeCount ? '' : ' hidden'}><span class="studyco-post-reaction-icon" aria-hidden="true">👍</span><span class="studyco-post-reaction-count">${likeCount}</span></div><button class="studyco-post-comment-summary" data-post-action="comments" data-post-id="${esc(post.id)}" type="button"${commentCount ? '' : ' hidden'}><span class="studyco-post-comment-count">${commentCount}</span> <span class="studyco-post-comment-label">${commentCount === 1 ? 'Comment' : 'Comments'}</span></button></div>`;
  return `<article class="studyco-card studyco-post${profilePostClass}" data-post-id="${esc(post.id)}">${postHead}<div class="studyco-post-management-slot">${postManagement}</div>${status ? `<span class="studyco-post-status">${esc(status)}</span>` : ''}${text}${image}${file}${link}${engagement}<div class="studyco-post-actions"><button type="button" class="${liked ? 'liked' : ''}" data-post-action="like" data-post-id="${esc(post.id)}"><span class="studyco-action-icon">${likeIcon}</span><span>Like</span></button><button type="button" data-post-action="comments" data-post-id="${esc(post.id)}"><span class="studyco-action-icon">${commentIcon}</span><span>Comment</span></button><button type="button" data-post-action="share" data-post-id="${esc(post.id)}"><span class="studyco-action-icon">↗</span><span>Share</span></button></div><div class="studyco-comments" data-comments-panel hidden></div><form class="studyco-comment-form" data-comment-post="${esc(post.id)}" hidden><input type="text" maxlength="500" placeholder="Write a comment..."><button type="submit">Send</button></form></article>`;
}
async function loadPostComments(postId, article) {
  const panel = article?.querySelector('[data-comments-panel]') || $('studyco-comments-list');
  const form = article?.querySelector('[data-comment-post]');
  if (!panel) return;
  panel.innerHTML = '<div class="studyco-empty">Loading comments...</div>';
  panel.hidden = false;
  if (form) form.hidden = false;
  const snapshot = await getDocs(collection(db, 'studyco_posts', postId, 'comments'));
  const comments = await Promise.all(snapshot.docs
    .sort((a, b) => timeMs(a.data().createdAt) - timeMs(b.data().createdAt))
    .map(async (item) => {
      const data = item.data(); const commenter = await getProfile(data.userId);
      return `<div class="studyco-comment">${avatar(commenter, 'small')}<div><strong>${esc(profileName(commenter))}</strong><span>${esc(data.text)}</span><small>${esc(timeText(data.createdAt))}</small></div></div>`;
    }));
  panel.innerHTML = comments.join('') || '<div class="studyco-empty">No comments yet. Start the conversation.</div>';
  panel.dataset.loaded = 'true';
}

async function openComments(postId) {
  const post = state.posts.find((item) => item.id === postId);
  const author = post ? state.profiles.get(post.userId) || await getProfile(post.userId) : null;
  const title = $('studyco-comments-title');
  const form = $('studyco-comments-form');
  const list = $('studyco-comments-list');
  if (!form || !list) throw new Error('Comments are unavailable on this page.');
  if (title) title.textContent = author ? `Comments on ${profileName(author)}’s post` : 'Comments';
  form.dataset.commentPost = postId;
  form.reset();
  openModal('studyco-comments-modal');
  try {
    await loadPostComments(postId);
  } catch (error) {
    list.innerHTML = `<div class="studyco-empty">${esc(error.message || 'Comments could not load.')}</div>`;
  }
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

async function renderFeed(target = $('studyco-post-feed'), posts = state.posts, { includePrivate = false, showAuthor = true } = {}) {
  if (!includePrivate) {
    posts = posts
      .filter((post) => isPublicPost(post) && state.postPreferences.get(post.id) !== 'not_interested')
      .sort((a, b) => Number(state.postPreferences.get(b.id) === 'interested') - Number(state.postPreferences.get(a.id) === 'interested'));
  }
  if (!posts.length) {
    target.innerHTML = '<div class="studyco-card studyco-empty">No post yet.</div>';
    return;
  }
  const renderToken = (state.feedRenderTokens.get(target) || 0) + 1;
  state.feedRenderTokens.set(target, renderToken);
  target.innerHTML = '<div class="studyco-card studyco-empty">Loading your circle...</div>';
  const firstBatch = posts.slice(0, 8);
  const firstMarkup = firstBatch.map((post) => renderPost(post, { showAuthor }));
  if (state.feedRenderTokens.get(target) !== renderToken) return;
  target.innerHTML = firstMarkup.join('');
  if (posts.length <= firstBatch.length) return;
  const renderRemaining = async () => {
    const remainingMarkup = posts.slice(firstBatch.length).map((post) => renderPost(post, { showAuthor }));
    if (state.feedRenderTokens.get(target) !== renderToken) return;
    target.insertAdjacentHTML('beforeend', remainingMarkup.join(''));
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(renderRemaining, { timeout: 700 });
  else window.setTimeout(renderRemaining, 0);
}

function scheduleNextFeedRefresh() {
  clearTimeout(state.scheduleTimer);
  const next = state.posts
    .filter((post) => post.status === 'scheduled' && timeMs(post.scheduledAt) > Date.now())
    .sort((a, b) => timeMs(a.scheduledAt) - timeMs(b.scheduledAt))[0];
  if (!next) return;
  state.scheduleTimer = setTimeout(() => {
    renderFeed();
    if (state.activeView === 'profile') loadProfileView(state.viewedProfileUid || state.user.uid);
    scheduleNextFeedRefresh();
  }, Math.max(1000, timeMs(next.scheduledAt) - Date.now() + 100));
}

async function loadProfileView(uid = state.user.uid) {
  const profileUid = uid || state.user.uid;
  if (profileUid !== state.viewedProfileUid) state.activeProfileTab = 'posts';
  const profile = profileUid === state.user.uid ? state.profile : await getProfile(profileUid);
  if (!profile) {
    toast('That profile could not be found.', true);
    setView('home');
    return;
  }
  state.viewedProfileUid = profileUid;
  state.viewedProfile = profile;
  if (profileUid !== state.user.uid) {
    const [sent, received, relation] = await Promise.all([
      getDocs(query(collection(db, 'social_friend_requests'), where('requesterId', '==', profileUid), limit(100))).catch(() => null),
      getDocs(query(collection(db, 'social_friend_requests'), where('recipientId', '==', profileUid), limit(100))).catch(() => null),
      relationship(profileUid).catch(() => 'none')
    ]);
    state.viewedProfileRelation = relation;
    profile.friendCount = [...(sent?.docs || []), ...(received?.docs || [])]
      .filter((item) => item.data().status === 'accepted').length;
  } else {
    state.viewedProfileRelation = 'self';
  }
  state.viewedProfilePosts = state.posts.filter((post) => post.userId === profileUid && (profileUid === state.user.uid || isPublicPost(post)));
  renderProfile();
  await renderProfileTab(state.activeProfileTab || 'posts');
}

async function loadPostPreferences() {
  if (!state.user) return;
  try {
    const snapshot = await getDocs(query(
      collection(db, 'studyco_post_preferences'),
      where('userId', '==', state.user.uid),
      limit(500)
    ));
    state.postPreferences = new Map(snapshot.docs.map((item) => [item.data().postId, item.data().preference]));
  } catch (error) {
    state.postPreferences = new Map();
    toast(error.message || 'Post preferences could not load.', true);
  }
}

async function setPostPreference(postId, preference) {
  if (!state.user || !postId || !['interested', 'not_interested'].includes(preference)) return;
  const preferenceRef = doc(db, 'studyco_post_preferences', `${state.user.uid}_${postId}`);
  await setDoc(preferenceRef, {
    userId: state.user.uid,
    postId,
    preference,
    updatedAt: serverTimestamp()
  }, { merge: true });
  state.postPreferences.set(postId, preference);
  if (preference === 'not_interested') toast('You will see fewer posts like this.');
  else toast('We will show you more posts like this.');
  if (state.activeView === 'search') await renderSearchResults($('studyco-page-search')?.value || '');
  else if (state.activeView === 'profile') await loadProfileView(state.viewedProfileUid || state.user.uid);
  else await renderFeed();
}

function subscribeFeed(useFallback = false) {
  state.feedUnsub?.();
  const feedQuery = useFallback
    ? query(collection(db, 'studyco_posts'), limit(30))
    : query(collection(db, 'studyco_posts'), orderBy('createdAt', 'desc'), limit(30));
  state.feedUnsub = onSnapshot(feedQuery, (snapshot) => {
    state.posts = snapshot.docs.map((item) => ({ id: item.id, ...item.data() })).sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt));
    const postsAtLoad = state.posts;
    renderFeed().catch((error) => renderFeedError(error));
    scheduleNextFeedRefresh(); if (state.activeView === 'profile') loadProfileView(state.viewedProfileUid || state.user.uid); refreshNavCounts();
    const authorIds = [...new Set(postsAtLoad.slice(0, 8).map((post) => post.userId).filter((uid) => uid && !state.profiles.has(uid)))];
    if (authorIds.length) {
      Promise.all(authorIds.map((uid) => getProfile(uid).catch(() => null))).then(() => {
        if (state.posts === postsAtLoad) renderFeed();
      });
    }
  }, (error) => {
    if (!useFallback) {
      /* A missing Firestore index or a partially migrated post can reject the
         ordered query. Retry without orderBy and sort the small result locally. */
      subscribeFeed(true);
      return;
    }
    renderFeedError(error);
    toast(error.message || 'The feed could not load.', true);
  });
}

async function publishPost() {
  const content = $('studyco-post-text').value.trim(); const image = state.postImage; const file = state.postFile;
  const linkUrl = normalizeUrl($('studyco-post-url').value);
  if (!content && !image && !file && !linkUrl) { toast('Write something, add an attachment, or add a URL first.', true); return; }
  const button = $('studyco-publish-post'); button.disabled = true;
  try {
    const imageUrl = image ? await uploadImage(image, `studyco/${state.user.uid}/posts/${Date.now()}-${image.name.replace(/[^a-z0-9._-]/gi, '')}`) : '';
    const fileUrl = file ? await uploadAttachment(file, `studyco/${state.user.uid}/posts/files/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '')}`) : '';
    await addDoc(collection(db, 'studyco_posts'), { userId: state.user.uid, content: content.slice(0, MAX_POST_CHARACTERS), imageUrl, fileUrl, fileName: file?.name || '', linkUrl, bgTemplateId: content.length <= 240 ? state.selectedTemplate : '', status: 'published', likeCount: 0, commentCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    $('studyco-post-text').value = ''; $('studyco-post-image').value = ''; $('studyco-post-file').value = ''; $('studyco-post-url').value = ''; $('studyco-post-url-row').hidden = true; $('studyco-post-attachment-status').hidden = true; state.postImage = null; state.postFile = null; $('studyco-post-preview').hidden = true; closePostEditor(); toast('Posted to StudyCo Meet.');
  } catch (error) { toast(error.message || 'Your post could not be published.', true); } finally { button.disabled = false; }
}

function localDateTimeValue(value) {
  const ms = timeMs(value);
  if (!ms) return '';
  const date = new Date(ms);
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openPostManage(postId, mode = 'edit') {
  const post = state.posts.find((item) => item.id === postId);
  if (!post || post.userId !== state.user.uid) return;
  $('studyco-manage-post-id').value = postId;
  $('studyco-manage-post-text').value = post.content || '';
  $('studyco-manage-post-schedule').value = localDateTimeValue(post.scheduledAt);
  $('studyco-post-manage-title').textContent = mode === 'reschedule' ? 'Reschedule post' : 'Edit post';
  openModal('studyco-post-manage-modal');
  if (mode === 'reschedule') $('studyco-manage-post-schedule').focus();
  else $('studyco-manage-post-text').focus();
}

async function savePostChanges(event) {
  event.preventDefault();
  const postId = $('studyco-manage-post-id').value;
  const post = state.posts.find((item) => item.id === postId);
  if (!post || post.userId !== state.user.uid) return;
  const content = $('studyco-manage-post-text').value.trim();
  const scheduleValue = $('studyco-manage-post-schedule').value;
  if (!content && !post.imageUrl && !post.fileUrl && !post.linkUrl) {
    toast('A post needs text or an attachment.', true);
    return;
  }
  const scheduledDate = scheduleValue ? new Date(scheduleValue) : null;
  const isFuture = scheduledDate && !Number.isNaN(scheduledDate.getTime()) && scheduledDate.getTime() > Date.now();
  const update = {
    content: content.slice(0, MAX_POST_CHARACTERS),
    status: isFuture ? 'scheduled' : 'published',
    scheduledAt: isFuture ? Timestamp.fromDate(scheduledDate) : null,
    updatedAt: serverTimestamp()
  };
  try {
    await updateDoc(doc(db, 'studyco_posts', postId), update);
    closeModal('studyco-post-manage-modal');
    toast(isFuture ? 'Post rescheduled.' : 'Post updated.');
  } catch (error) {
    toast(error.message || 'The post could not be updated.', true);
  }
}

async function managePost(postId, action) {
  const post = state.posts.find((item) => item.id === postId);
  if (!post || post.userId !== state.user.uid) return;
  if (action === 'edit' || action === 'reschedule') {
    openPostManage(postId, action);
    return;
  }
  if (action === 'delete') {
    if (!window.confirm('Delete this post permanently?')) return;
    try {
      await deleteDoc(doc(db, 'studyco_posts', postId));
      toast('Post deleted.');
    } catch (error) {
      toast(error.message || 'The post could not be deleted.', true);
    }
    return;
  }
  const update = { updatedAt: serverTimestamp() };
  if (action === 'pause') update.status = post.status === 'paused' ? 'published' : 'paused';
  if (action === 'hide') update.status = post.status === 'hidden' ? 'published' : 'hidden';
  if (action === 'retry') {
    update.status = 'published';
    update.scheduledAt = null;
    update.retryCount = Number(post.retryCount || 0) + 1;
  }
  try {
    await updateDoc(doc(db, 'studyco_posts', postId), update);
    toast(action === 'retry' ? 'Post published again.' : 'Post status updated.');
  } catch (error) {
    toast(error.message || 'That post action could not be completed.', true);
  }
}

async function toggleLike(postId) {
  const likeRef = doc(db, 'studyco_posts', postId, 'likes', state.user.uid);
  const existing = await getDoc(likeRef);
  if (existing.exists()) await deleteDoc(likeRef); else await setDoc(likeRef, { userId: state.user.uid, createdAt: serverTimestamp() });
  const likes = await getDocs(collection(db, 'studyco_posts', postId, 'likes'));
  await updateDoc(doc(db, 'studyco_posts', postId), { likeCount: likes.size });
  const post = state.posts.find((item) => item.id === postId);
  if (post) post.likeCount = likes.size;
  return { liked: !existing.exists(), count: likes.size };
}

async function addComment(postId, text) {
  if (!text.trim()) return;
  await addDoc(collection(db, 'studyco_posts', postId, 'comments'), { userId: state.user.uid, text: text.trim().slice(0, 500), createdAt: serverTimestamp() });
  const comments = await getDocs(collection(db, 'studyco_posts', postId, 'comments'));
  await updateDoc(doc(db, 'studyco_posts', postId), { commentCount: comments.size });
  const post = state.posts.find((item) => item.id === postId);
  if (post) post.commentCount = comments.size;
  return comments.size;
}

function renderStories() {
  const active = state.stories.filter((story) => timeMs(story.expiresAt) > Date.now());
  $('studyco-story-list').innerHTML = `<button class="studyco-story add" id="studyco-story-add-card" type="button"><span>Add a story</span></button>${active.map((story) => `<button class="studyco-story" data-story-id="${esc(story.id)}" style="background:${esc(story.bgColor || '#5b5bd6')}">${story.imageUrl ? `<img src="${esc(story.imageUrl)}" alt="">` : ''}<span>${esc(initials(state.profiles.get(story.userId)))}</span><strong>${esc(profileName(state.profiles.get(story.userId)))}<br><small>${esc(timeText(story.createdAt))}</small></strong></button>`).join('')}`;
}

function subscribeStories() {
  state.storyUnsub?.();
  state.privateStoryUnsub?.();
  state.publicStories = [];
  state.privateStories = [];
  const refreshStories = async () => {
    state.stories = [...state.publicStories, ...state.privateStories]
      .filter((story) => timeMs(story.expiresAt) > Date.now())
      .sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt));
    await Promise.all([...new Set(state.stories.map((story) => story.userId))].map((uid) => getProfile(uid)));
    renderStories();
    const routeParts = window.location.hash.replace(/^#/, '').split('/');
    if (routeParts[0] === 'story' && routeParts[1]) {
      let routeStoryId = '';
      try { routeStoryId = decodeURIComponent(routeParts[1]); } catch (_) { routeStoryId = routeParts[1]; }
      const routeStory = state.stories.find((item) => item.id === routeStoryId);
      if (state.storyViewerOpen) {
        if (routeStory && state.storyIndex < state.stories.length) state.storyIndex = state.stories.findIndex((item) => item.id === routeStoryId);
        renderStoryViewer();
      } else if (routeStory) showStory(routeStory, { updateUrl: false });
    }
  };
  state.storyUnsub = onSnapshot(query(collection(db, 'studyco_stories'), limit(100)), async (snapshot) => {
    state.publicStories = snapshot.docs.map((item) => ({ id: item.id, ...item.data(), isPrivate: false }));
    await refreshStories();
  }, (error) => toast(error.message || 'Stories could not load.', true));
  state.privateStoryUnsub = onSnapshot(query(collection(db, 'studyco_private_stories'), where('userId', '==', state.user.uid), limit(100)), async (snapshot) => {
    state.privateStories = snapshot.docs.map((item) => ({ id: item.id, ...item.data(), isPrivate: true }));
    await refreshStories();
  }, (error) => toast(error.message || 'Private stories could not load.', true));
}

function clearStoryMediaPreview() {
  if (state.storyPreviewUrl) {
    URL.revokeObjectURL(state.storyPreviewUrl);
    state.storyPreviewUrl = '';
  }
  const imagePreview = $('studyco-story-preview');
  if (imagePreview) imagePreview.style.backgroundImage = '';
  const videoPreview = $('studyco-story-video-preview');
  if (videoPreview) {
    videoPreview.pause();
    videoPreview.removeAttribute('src');
    videoPreview.load();
    videoPreview.hidden = true;
  }
}

function readStoryVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const probe = document.createElement('video');
    const objectUrl = URL.createObjectURL(file);
    let settled = false;
    let timeoutId = 0;
    const finish = (error, duration) => {
      if (settled) return;
      settled = true;
      if (timeoutId) window.clearTimeout(timeoutId);
      probe.onloadedmetadata = null;
      probe.onerror = null;
      probe.removeAttribute('src');
      probe.load();
      URL.revokeObjectURL(objectUrl);
      if (error) reject(error);
      else resolve(duration);
    };
    timeoutId = window.setTimeout(() => finish(new Error('Could not read this video duration. Choose a playable video.')), 10000);
    probe.preload = 'metadata';
    probe.onloadedmetadata = () => {
      const duration = Number(probe.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        finish(new Error('Could not read this video duration. Choose a playable video.'));
        return;
      }
      finish(null, duration);
    };
    probe.onerror = () => finish(new Error('This video format could not be read. Choose a playable video.'));
    probe.src = objectUrl;
    probe.load();
  });
}

async function validateStoryMedia(file) {
  if (!file) return { mediaType: 'text', duration: 0 };
  if (file.type.startsWith('image/')) return { mediaType: 'image', duration: 0 };
  if (!file.type.startsWith('video/')) throw new Error('Choose an image or video for your story.');
  if (file.size > MAX_STORY_VIDEO_SIZE) throw new Error('Videos must be 5 MB or smaller.');
  const duration = file === state.storyFile && state.storyVideoDuration > 0
    ? state.storyVideoDuration
    : await readStoryVideoDuration(file);
  if (duration > MAX_STORY_VIDEO_SECONDS) throw new Error('Videos must be 40 seconds or shorter.');
  return { mediaType: 'video', duration };
}

async function handleStoryMediaSelection(event) {
  const input = event.target;
  const file = input.files?.[0] || null;
  state.storySelectionToken += 1;
  const selectionToken = state.storySelectionToken;
  state.storyFile = file;
  state.storyVideoDuration = 0;
  clearStoryMediaPreview();
  if (!file) return;

  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    state.storyFile = null;
    input.value = '';
    toast('Choose an image or video for your story.', true);
    return;
  }
  if (isVideo && file.size > MAX_STORY_VIDEO_SIZE) {
    state.storyFile = null;
    input.value = '';
    toast('Videos must be 5 MB or smaller.', true);
    return;
  }

  const previewUrl = URL.createObjectURL(file);
  state.storyPreviewUrl = previewUrl;
  if (isImage) {
    $('studyco-story-preview').style.backgroundImage = 'url("' + previewUrl + '")';
    return;
  }

  const videoPreview = $('studyco-story-video-preview');
  videoPreview.src = previewUrl;
  videoPreview.hidden = false;
  videoPreview.load();
  try {
    const duration = await readStoryVideoDuration(file);
    if (selectionToken !== state.storySelectionToken) return;
    if (duration > MAX_STORY_VIDEO_SECONDS) throw new Error('Videos must be 40 seconds or shorter.');
    state.storyVideoDuration = duration;
  } catch (error) {
    if (selectionToken !== state.storySelectionToken) return;
    state.storyFile = null;
    state.storyVideoDuration = 0;
    input.value = '';
    clearStoryMediaPreview();
    toast(error.message || 'This video could not be checked.', true);
  }
}

async function createStory(event) {
  event.preventDefault();
  const text = $('studyco-story-text').value.trim(); const file = state.storyFile;
  if (!text && !file) { toast('Add a caption or an image/video to create a story.', true); return; }
  try {
    const media = file ? await validateStoryMedia(file) : { mediaType: 'text', duration: 0 };
    let defaultAudience = 'public';
    try {
      const settingsSnapshot = await getDoc(doc(db, 'social_profiles', state.user.uid));
      if (settingsSnapshot.exists() && settingsSnapshot.data().storyPrivacy?.defaultAudience === 'only_me') defaultAudience = 'only_me';
    } catch (_) { /* Keep the existing public-story behavior if settings are unavailable. */ }
    const storageRoot = defaultAudience === 'only_me' ? 'studyco-private' : 'studyco';
    const mediaUrl = file ? await uploadStoryMedia(file, `${storageRoot}/${state.user.uid}/stories/${Date.now()}-${file.name.replace(/[^a-z0-9._-]/gi, '')}`, media.mediaType) : '';
    const storyData = { userId: state.user.uid, content: text.slice(0, 240), imageUrl: media.mediaType === 'image' ? mediaUrl : '', videoUrl: media.mediaType === 'video' ? mediaUrl : '', mediaType: media.mediaType, bgColor: state.storyColor, audience: defaultAudience, expiresAt: Timestamp.fromDate(new Date(Date.now() + 86400000)), createdAt: serverTimestamp() };
    const storyCollection = defaultAudience === 'only_me' ? 'studyco_private_stories' : 'studyco_stories';
    await addDoc(collection(db, storyCollection), storyData);
    $('studyco-story-form').reset(); state.storyFile = null; state.storyVideoDuration = 0; state.storySelectionToken += 1; clearStoryMediaPreview(); closeModal('studyco-story-modal'); toast(defaultAudience === 'only_me' ? 'Private story saved. Only you can see it.' : 'Story shared for 24 hours.');
  } catch (error) { toast(error.message || 'Story could not be shared.', true); }
}

function activeStories() {
  return state.stories
    .filter((story) => timeMs(story.expiresAt) > Date.now())
    .sort((a, b) => timeMs(b.createdAt) - timeMs(a.createdAt));
}

function updateStoryRoute(story) {
  if (!story) return;
  const nextHash = '#story/' + encodeURIComponent(story.id);
  if (window.location.hash !== nextHash) {
    window.history.replaceState({ studycoView: 'story', storyId: story.id }, '', nextHash);
  }
}

function showStory(story, { updateUrl = true } = {}) {
  if (!story) return;
  const stories = activeStories();
  const index = stories.findIndex((item) => item.id === story.id);
  if (index < 0) return;
  if (!state.storyViewerOpen && updateUrl) {
    const currentHash = window.location.hash;
    state.storyPreviousHash = currentHash && !currentHash.startsWith('#story/') ? currentHash : '#home';
    window.history.pushState({ studycoView: 'story', storyId: story.id }, '', '#story/' + encodeURIComponent(story.id));
  }
  state.storyIndex = index;
  state.storyViewerOpen = true;
  state.pendingStoryId = '';
  document.body.classList.add('studyco-story-open');
  $('studyco-story-viewer').hidden = false;
  renderStoryViewer();
}

function renderStoryViewer() {
  const stories = activeStories();
  const isComplete = state.storyIndex >= stories.length;
  const story = isComplete ? null : stories[state.storyIndex];
  const profile = story ? (state.profiles.get(story.userId) || {}) : (state.profile || {});
  const progress = $('studyco-story-progress');
  const avatar = $('studyco-story-viewer-avatar');
  const author = $('studyco-story-viewer-author');
  const detail = $('studyco-story-viewer-detail');
  const stage = $('studyco-story-viewer-stage');
  const content = $('studyco-story-viewer-content');
  if (!progress || !avatar || !author || !detail || !stage || !content) return;

  progress.replaceChildren();
  stories.forEach((item, index) => {
    const segment = document.createElement('span');
    segment.className = 'studyco-story-progress-segment';
    if (isComplete || index < state.storyIndex) segment.classList.add('is-complete');
    else if (index === state.storyIndex) {
      segment.classList.add('is-current');
      if (item.videoUrl || item.mediaType === 'video') segment.classList.add('is-playing');
    }
    progress.appendChild(segment);
  });

  const previousVideo = content.querySelector('video');
  if (previousVideo) previousVideo.pause();

  avatar.replaceChildren();
  const photoUrl = profile.photoURL || profile.avatarURL || profile.imageURL || '';
  if (photoUrl) {
    const image = document.createElement('img');
    image.src = photoUrl;
    image.alt = '';
    avatar.appendChild(image);
  } else {
    avatar.textContent = initials(profile);
  }
  author.textContent = isComplete ? 'You’re all caught up' : profileName(profile);
  detail.textContent = isComplete ? 'Your friends’ stories are finished' : timeText(story.createdAt);
  stage.style.backgroundColor = story ? (story.bgColor || '#5b5bd6') : '#111827';
  content.replaceChildren();
  content.classList.toggle('is-end-card', isComplete);

  if (isComplete) {
    const card = document.createElement('div');
    card.className = 'studyco-story-end-card';
    const heading = document.createElement('h2');
    heading.textContent = 'Your turn, ' + profileName(profile);
    const message = document.createElement('p');
    message.textContent = 'Share a moment with your friends.';
    const create = document.createElement('button');
    create.type = 'button';
    create.id = 'studyco-story-create-own';
    create.className = 'studyco-story-create-own';
    create.textContent = 'Create your story';
    create.addEventListener('click', (event) => {
      event.stopPropagation();
      closeStoryViewer();
      openModal('studyco-story-modal');
    });
    const hint = document.createElement('small');
    hint.textContent = 'Tap the screen to replay stories';
    card.append(heading, message, create, hint);
    content.appendChild(card);
  } else {
    const videoUrl = story.videoUrl || (story.mediaType === 'video' ? story.imageUrl : '');
    const isVideoStory = !!videoUrl || story.mediaType === 'video';
    if (videoUrl) {
      const video = document.createElement('video');
      video.className = 'studyco-story-viewer-video';
      video.src = videoUrl;
      video.autoplay = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.addEventListener('timeupdate', () => {
        const segment = progress.children[state.storyIndex];
        if (segment && video.duration > 0) segment.style.setProperty('--story-progress', Math.min(100, video.currentTime / video.duration * 100) + '%');
      });
      video.addEventListener('ended', () => {
        if (state.storyViewerOpen && activeStories()[state.storyIndex]?.id === story.id) stepStory(1);
      }, { once: true });
      content.appendChild(video);
      try {
        const playback = video.play();
        if (playback?.catch) playback.catch(() => {});
      } catch (_) { /* Some embedded browsers reject autoplay; story navigation remains available. */ }
    } else if (story.imageUrl) {
      const image = document.createElement('img');
      image.className = 'studyco-story-viewer-image';
      image.src = story.imageUrl;
      image.alt = '';
      content.appendChild(image);
    }
    if (story.content) {
      const caption = document.createElement('div');
      caption.className = 'studyco-story-message' + (story.imageUrl || isVideoStory ? '' : ' is-text-only');
      caption.textContent = story.content;
      content.appendChild(caption);
    }
  }
  updateStoryRoute(story);
}

function stepStory(direction) {
  if (!state.storyViewerOpen) return;
  const count = activeStories().length;
  if (direction > 0) state.storyIndex = state.storyIndex >= count ? 0 : state.storyIndex + 1;
  else state.storyIndex = Math.max(0, state.storyIndex - 1);
  renderStoryViewer();
}

function closeStoryViewer({ restoreRoute = true } = {}) {
  const viewer = $('studyco-story-viewer');
  if (!viewer || (!state.storyViewerOpen && viewer.hidden)) return;
  state.storyViewerOpen = false;
  viewer.hidden = true;
  document.body.classList.remove('studyco-story-open');
  if (restoreRoute && window.location.hash.startsWith('#story/')) {
    const previousHash = state.storyPreviousHash || '#home';
    window.history.replaceState({ studycoView: 'home' }, '', previousHash);
    void syncRoute();
  }
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
     return `<article class="studyco-person">${avatar(profile)}<strong data-profile-uid="${esc(profile.id)}">${esc(profileName(profile))}</strong><span>${esc([profile.school, profile.department || profile.major, profile.location].filter(Boolean).join(' · ') || (profile.username ? `@${profile.username}` : 'StudyCo learner'))}</span><div class="studyco-person-actions">${action}</div></article>`;
  }).join('');
}

async function loadPeople(term = '') {
  const target = $('studyco-people-results'); target.innerHTML = '<div class="studyco-card studyco-empty">Finding classmates...</div>';
  const normalized = term.trim().toLowerCase();
  if (!normalized) { target.innerHTML = ''; return; }
  const isCurrentSearch = () => state.activeView === 'friends' && $('studyco-global-search')?.value.trim().toLowerCase() === normalized;
  const profiles = await findPeople(term, { shouldContinue: isCurrentSearch });
  if (!isCurrentSearch()) return;
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
    await loadPeople(''); await loadSocialLists(); refreshNavCounts();
    if (state.activeView === 'profile' && state.viewedProfileUid === uid) renderProfileActions(uid, uid === state.user.uid);
    toast(action === 'request' ? 'Friend request sent.' : 'Friendships updated.');
  } catch (error) { toast(error.message || 'That action could not be completed.', true); }
}

async function loadSocialLists() {
  const uid = state.user?.uid;
  if (!uid) return;
  const suggestionList = $('studyco-suggestion-list');
  const rightSuggestionList = $('studyco-right-suggestions');
  const rejectedByFilter = { invalid: 0, self: 0, dismissed: 0, friends: 0, incomingRequests: 0, sentRequests: 0 };
  let profilesReturned = 0;
  let pagesRead = 0;
  let suggestions = [];
  let suggestionHtml = '';
  try {
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
    const orderedIncomingRequests = [...state.requests].sort((a, b) => {
      const difference = timeMs(a.createdAt) - timeMs(b.createdAt);
      return state.friendRequestSort === 'oldest' ? difference : -difference;
    });
    const incomingRequestHtml = orderedIncomingRequests.map((item) => {
      const requestContext = [item.profile?.school, item.profile?.department || item.profile?.major]
        .filter(Boolean)
        .join(' · ') || 'Sent you a friend request';
      return '<article class="studyco-list-row studyco-friend-row studyco-incoming-request" data-request-time="' + timeMs(item.createdAt) + '">' +
        avatar(item.profile, 'small') + '<div><strong>' + esc(profileName(item.profile)) + '</strong><span>' + esc(requestContext) + '</span></div>' +
        '<time class="studyco-friend-request-time">' + esc(timeText(item.createdAt)) + '</time>' +
        '<button class="studyco-button success" data-friend-action="accept" data-uid="' + esc(item.requesterId) + '">Confirm</button>' +
        '<button class="studyco-button danger" data-friend-action="reject" data-uid="' + esc(item.requesterId) + '">Delete</button></article>';
    }).join('');
    const sentRequestHtml = state.sentRequests.map((item) => `<div class="studyco-list-row studyco-friend-row studyco-sent-request">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>Friend request sent</span></div><button class="studyco-button danger" data-friend-action="cancel" data-uid="${esc(item.recipientId)}">Remove</button></div>`).join('');
    const hasRequests = Boolean(incomingRequestHtml || sentRequestHtml);
    const friendsHeading = $('studyco-friends-heading');
    if (friendsHeading) friendsHeading.textContent = hasRequests ? 'Requests' : 'Suggestions';
    const sentRequestHeading = state.sentRequests.length ? '<div class="studyco-sent-request-heading">Sent requests</div>' : '';
    const requestHtml = hasRequests ? incomingRequestHtml + sentRequestHeading + sentRequestHtml : '';
    suggestions = [];
    let cursor = null;
    const pageSize = 20;
    for (let page = 0; page < 5 && suggestions.length < 6; page += 1) {
      const constraints = [orderBy(documentId())];
      if (cursor) constraints.push(startAfter(cursor));
      constraints.push(limit(pageSize));
      const snapshot = await getDocs(query(collection(db, 'social_profiles'), ...constraints));
      pagesRead += 1;
      profilesReturned += snapshot.docs.length;
      if (!snapshot.docs.length) break;
      cursor = snapshot.docs[snapshot.docs.length - 1];
      for (const item of snapshot.docs) {
        const profile = publicProfile({ id: item.id, ...item.data() });
        if (!profile?.id) { rejectedByFilter.invalid += 1; continue; }
        if (profile.id === uid) { rejectedByFilter.self += 1; continue; }
        if (state.dismissedSuggestions.has(profile.id)) { rejectedByFilter.dismissed += 1; continue; }
        if (state.friends.some((friend) => friend.uid === profile.id)) { rejectedByFilter.friends += 1; continue; }
        if (state.requests.some((request) => request.requesterId === profile.id)) { rejectedByFilter.incomingRequests += 1; continue; }
        if (state.sentRequests.some((request) => request.recipientId === profile.id)) { rejectedByFilter.sentRequests += 1; continue; }
        suggestions.push(profile);
        if (suggestions.length >= 6) break;
      }
      if (snapshot.docs.length < pageSize) break;
    }
    suggestions.forEach((item) => state.profiles.set(item.id, item));
    suggestionHtml = suggestions.map((item) => `<div class="studyco-list-row studyco-friend-row">${avatar(item, 'small')}<div><strong>${esc(profileName(item))}</strong><span>${esc(item.school || item.username ? (item.school || `@${item.username}`) : 'StudyCo learner')}</span></div><button class="studyco-button primary" data-friend-action="request" data-uid="${esc(item.id)}">Add friend</button><button class="studyco-button danger" data-friend-action="dismiss" data-uid="${esc(item.id)}">Remove</button></div>`).join('') || '<div class="studyco-empty">Suggestions will appear here.</div>';
    $('studyco-request-section').hidden = !hasRequests;
    $('studyco-right-request-section').hidden = state.requests.length === 0;
    $('studyco-request-list').innerHTML = requestHtml; $('studyco-request-count').textContent = String(state.requests.length);
    if (suggestionList) suggestionList.innerHTML = suggestionHtml;
    else console.error('[StudyCo social] #studyco-suggestion-list is missing', { uid });
    setNavBadge('studyco-friend-badge', state.requests.length);
    $('studyco-right-requests').innerHTML = state.requests.slice(0, 3).map((item) => `<div class="studyco-list-row studyco-friend-row">${avatar(item.profile, 'small')}<div><strong>${esc(profileName(item.profile))}</strong><span>Friend request</span></div><button class="studyco-button success" data-friend-action="accept" data-uid="${esc(item.requesterId)}">Confirm</button><button class="studyco-button danger" data-friend-action="reject" data-uid="${esc(item.requesterId)}">Remove</button></div>`).join('') || '<div class="studyco-empty">No new requests.</div>';
    if (rightSuggestionList) $('studyco-right-suggestions').innerHTML = suggestions.slice(0, 4).map((item) => `<div class="studyco-list-row studyco-friend-row">${avatar(item, 'small')}<div><strong>${esc(profileName(item))}</strong></div><button class="studyco-button primary" data-friend-action="request" data-uid="${esc(item.id)}">Add friend</button><button class="studyco-button danger" data-friend-action="dismiss" data-uid="${esc(item.id)}">Remove</button></div>`).join('') || '<div class="studyco-empty">Suggestions will appear here.</div>';
    else console.warn('[StudyCo social] #studyco-right-suggestions is missing', { uid });
    console.debug('[StudyCo social] Suggestion scan', { uid, profilesReturned, pagesRead, rejectedByFilter, finalSuggestionCount: suggestions.length, suggestionHtmlGenerated: Boolean(suggestionHtml), suggestionListExists: Boolean(suggestionList), rightSuggestionListExists: Boolean(rightSuggestionList) });
    if (state.activeView === 'profile') renderProfile();
    if (state.activeView === 'messages') renderChatList();
  } catch (error) {
    console.debug('[StudyCo social] Suggestion scan', { uid, profilesReturned, pagesRead, rejectedByFilter, finalSuggestionCount: suggestions.length, suggestionHtmlGenerated: Boolean(suggestionHtml), suggestionListExists: Boolean(suggestionList), rightSuggestionListExists: Boolean(rightSuggestionList) });
    console.error('[StudyCo social] Failed to load social lists', { uid, code: error?.code || '', message: error?.message || String(error) });
    const errorHtml = '<div class="studyco-empty">Suggestions could not be loaded. Please try again.</div>';
    if (suggestionList) suggestionList.innerHTML = errorHtml;
    if (rightSuggestionList) rightSuggestionList.innerHTML = errorHtml;
  }
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
    .filter((chat) => {
      const archived = state.chatSettings.get(chat.id)?.archived === true;
      const matchesSearch = !term || (profileName(chat.profile) + ' ' + (chat.data.lastMessageText || '')).toLowerCase().includes(term);
      return archived === state.showArchivedChats && matchesSearch;
    })
    .sort((a, b) => timeMs(b.data.lastMessageAt || b.data.updatedAt) - timeMs(a.data.lastMessageAt || a.data.updatedAt) || profileName(a.profile).localeCompare(profileName(b.profile)));
  const archivedCount = validChats.filter((chat) => state.chatSettings.get(chat.id)?.archived === true).length;
  const unreadChats = validChats.filter((chat) => state.chatSettings.get(chat.id)?.markedUnread === true || (chat.data.lastSenderId && chat.data.lastSenderId !== state.user.uid && chat.data.lastReadBy?.[state.user.uid] !== true));
  $('studyco-chat-count').textContent = String(validChats.length);
  $('studyco-message-badge').hidden = unreadChats.length < 1;
  $('studyco-message-badge').textContent = unreadChats.length > 99 ? '99+' : String(unreadChats.length || '');
  const filterLabel = state.showArchivedChats ? '‹ Inbox' : 'Archived (' + archivedCount + ')';
  const filterButton = '<button class="studyco-chat-archive-filter" data-chat-archived-toggle type="button"><span aria-hidden="true">' + (state.showArchivedChats ? '‹' : '▣') + '</span>' + esc(filterLabel) + '</button>';
  const chatButtons = visibleChats.map((chat) => {
    const setting = state.chatSettings.get(chat.id) || {};
    const unread = setting.markedUnread === true || (chat.data.lastSenderId && chat.data.lastSenderId !== state.user.uid && chat.data.lastReadBy?.[state.user.uid] !== true);
    const status = [setting.muted ? 'Muted' : '', state.blockedUserIds.has(chat.uid) ? 'Blocked' : ''].filter(Boolean).join(' · ');
    return '<button class="' + (chat.uid === state.activeChatUid ? 'active ' : '') + (unread ? 'unread' : '') + '" data-chat-uid="' + esc(chat.uid) + '" type="button">' + avatarWithPresence(chat.profile, chat.uid, 'small') + '<div><strong>' + esc(profileName(chat.profile)) + '</strong><span>' + esc(chat.data.lastMessageText || lastSeenText(state.presence.get(chat.uid))) + '</span>' + (status ? '<small class="studyco-chat-list-status">' + esc(status) + '</small>' : '') + '</div><time>' + esc(timeText(chat.data.lastMessageAt || chat.data.updatedAt)) + '</time></button>';
  }).join('');
  const empty = state.showArchivedChats ? 'No archived chats.' : 'Your accepted friends will appear here.';
  $('studyco-chat-list').innerHTML = filterButton + (chatButtons || '<div class="studyco-empty">' + empty + '</div>');
}


const CHAT_RECEIPT_SINGLE_MARK = '<svg viewBox="0 0 14 12" aria-hidden="true"><path d="m2 6 3 3 7-7"></path></svg>';
const CHAT_RECEIPT_DOUBLE_MARK = '<svg viewBox="0 0 22 12" aria-hidden="true"><path d="m1 6 3 3 7-7"></path><path d="m7 6 3 3 10-8"></path></svg>';

function messageReceiptStatus(isRead, recipientOnline) {
  return isRead ? 'read' : (recipientOnline ? 'online' : 'sent');
}

function messageReceiptLabel(status) {
  return status === 'read' ? 'Read' : (status === 'online' ? 'Recipient online' : 'Sent');
}

function messageReceiptIcon(status) {
  return status === 'sent' ? CHAT_RECEIPT_SINGLE_MARK : CHAT_RECEIPT_DOUBLE_MARK;
}

function messageReceiptMarkup(message) {
  if (message.senderId !== state.user?.uid) return '';
  const isRead = message.is_read === true;
  const status = messageReceiptStatus(isRead, presenceIsOnline(state.presence.get(state.activeChatUid)));
  const label = messageReceiptLabel(status);
  return '<span class="studyco-message-receipt is-' + status + '" data-message-receipt data-read="' + (isRead ? 'true' : 'false') + '" role="img" aria-label="' + esc(label) + '" title="' + esc(label) + '">' + messageReceiptIcon(status) + '</span>';
}

function updateChatReceiptIndicators(recipientOnline = presenceIsOnline(state.presence.get(state.activeChatUid))) {
  document.querySelectorAll('#studyco-chat-panel [data-message-receipt]').forEach((receipt) => {
    const status = messageReceiptStatus(receipt.dataset.read === 'true', recipientOnline);
    const label = messageReceiptLabel(status);
    receipt.className = 'studyco-message-receipt is-' + status;
    receipt.innerHTML = messageReceiptIcon(status);
    receipt.setAttribute('aria-label', label);
    receipt.title = label;
  });
}

function updateActiveChatPresence() {
  const presence = state.activeChatUid ? state.presence.get(state.activeChatUid) : null;
  updateChatReceiptIndicators(presenceIsOnline(presence));
  const status = $('studyco-chat-presence');
  if (!status || !state.activeChatUid) return;
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
  state.chatListOwner = state.user.uid;
  state.chatListUnsub = onSnapshot(query(collection(db, 'social_conversations'), where('participantIds', 'array-contains', state.user.uid), limit(80)), async (snapshot) => {
    const chats = await Promise.all(snapshot.docs.map(async (item) => {
    const data = item.data(); const uid = data.participantIds.find((value) => value !== state.user.uid);
    return { id: item.id, uid, profile: await getProfile(uid), data };
    }));
    state.conversations = chats.sort((a, b) => timeMs(b.data.lastMessageAt || b.data.updatedAt) - timeMs(a.data.lastMessageAt || a.data.updatedAt));
    renderChatList();
  }, (error) => toast(error.message || 'Messages could not load.', true));
}

function chatSettingsDocumentId(conversationId, userId = state.user.uid) {
  return conversationId + '_' + userId;
}

function subscribeChatSettings() {
  if (!state.user) return;
  state.chatSettingsUnsub?.();
  const uid = state.user.uid;
  state.chatSettingsOwner = uid;
  state.chatSettingsReady = false;
  state.chatSettings = new Map();
  state.chatSettingsUnsub = onSnapshot(query(collection(db, 'social_chat_settings'), where('userId', '==', uid), limit(500)), (snapshot) => {
    state.chatSettings = new Map(snapshot.docs.map((item) => [item.data().conversationId, item.data()]));
    state.chatSettingsReady = true;
    renderChatList();
    renderNotifications();
    refreshNavCounts();
    updateChatSettingsMenu();
    updateActiveChatControls();
  }, (error) => {
    state.chatSettingsReady = true;
    renderNotifications();
    refreshNavCounts();
    toast(error.message || 'Chat settings could not load.', true);
  });
}

function subscribeBlockedUsers() {
  if (!state.user) return;
  state.blockedUsersUnsub?.();
  const uid = state.user.uid;
  state.blockedUsersOwner = uid;
  state.blockedUserIds = new Set();
  state.blockedUsersUnsub = onSnapshot(query(collection(db, 'social_user_blocks', uid, 'blocked'), limit(500)), (snapshot) => {
    state.blockedUserIds = new Set(snapshot.docs.map((item) => item.id));
    renderChatList();
    updateChatSettingsMenu();
    updateActiveChatControls();
  }, (error) => toast(error.message || 'Blocked contacts could not load.', true));
}

function loadChats() {
  if (!state.chatListUnsub || state.chatListOwner !== state.user.uid) subscribeChats();
  else renderChatList();
  if (!state.chatSettingsUnsub || state.chatSettingsOwner !== state.user.uid) subscribeChatSettings();
  if (!state.blockedUsersUnsub || state.blockedUsersOwner !== state.user.uid) subscribeBlockedUsers();
}


async function markMessagesRead(messages) {
  if (state.chatSettings.get(state.activeChatId)?.markedUnread === true) await saveChatSettings({ markedUnread: false }).catch(() => {});
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

function formatVoiceDuration(value) {
  const total = Math.max(0, Math.floor(Number(value) || 0));
  return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
}

function voiceWaveformMarkup(seed, count = 42) {
  const text = String(seed || 'voice');
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619) >>> 0;
  return Array.from({ length: count }, () => {
    hash = (Math.imul(hash, 1664525) + 1013904223) >>> 0;
    return '<i style="height:' + (20 + (hash % 78)) + '%"></i>';
  }).join('');
}

function voicePlayerMarkup(message, src) {
  const duration = Math.max(0, Math.floor(Number(message.attachmentDuration || message.duration) || 0));
  const filename = String(message.attachmentName || ('voice-message-' + (message.id || 'audio') + '.webm')).replace(/[^a-z0-9._-]/gi, '-');
  return '<div class="studyco-voice-note" data-voice-message-id="' + esc(message.id || '') + '">' +
    '<button class="studyco-voice-note-play" type="button" data-chat-voice-play aria-label="Play voice message" title="Play voice message">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>' +
    '</button>' +
    '<div class="studyco-voice-note-track">' +
      '<div class="studyco-voice-note-wave" role="img" aria-label="Voice message waveform">' + voiceWaveformMarkup((message.id || '') + src) + '</div>' +
      '<span class="studyco-voice-note-time" data-chat-voice-time>' + (duration ? formatVoiceDuration(duration) : 'Voice message') + '</span>' +
    '</div>' +
    '<button class="studyco-voice-note-download" type="button" data-chat-voice-download="' + src + '" data-filename="' + esc(filename) + '" aria-label="Download voice message" title="Download voice message">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M5 17v3h14v-3"></path></svg>' +
    '</button>' +
    '<audio class="studyco-voice-note-audio" src="' + src + '" preload="none" data-duration="' + duration + '" aria-label="Voice message audio"></audio>' +
  '</div>';
}

function updateVoicePlayer(audio) {
  const player = audio?.closest('.studyco-voice-note');
  if (!player) return;
  const playing = !audio.paused && !audio.ended;
  const button = player.querySelector('[data-chat-voice-play]');
  if (button) {
    button.setAttribute('aria-label', playing ? 'Pause voice message' : 'Play voice message');
    button.title = playing ? 'Pause voice message' : 'Play voice message';
    button.innerHTML = playing
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h3v14H8zm5 0h3v14h-3z"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
  }
  const total = Number.isFinite(audio.duration) ? audio.duration : Number(audio.dataset.duration || 0);
  const ratio = total > 0 ? Math.min(1, audio.currentTime / total) : 0;
  const bars = player.querySelectorAll('.studyco-voice-note-wave i');
  bars.forEach((bar, index) => bar.classList.toggle('played', index < Math.round(ratio * bars.length)));
  const time = player.querySelector('[data-chat-voice-time]');
  if (time) time.textContent = total > 0
    ? (audio.currentTime > 0 ? formatVoiceDuration(audio.currentTime) + ' / ' : '') + formatVoiceDuration(total)
    : 'Voice message';
  player.classList.toggle('is-playing', playing);
}

function renderMessages(messages, profile) {
  const target = document.querySelector('.studyco-chat-messages'); if (!target) return;
  target.innerHTML = messages.length ? messages.map((message) => {
    const rawBody = String(message.messageText || message.text || '');
    const body = esc(rawBody).replace(/\n/g, '<br>');
    const attachmentType = String(message.attachmentType || '').toLowerCase();
    const attachmentUrl = esc(message.attachmentUrl || '');
    const isVoiceMessage = !!attachmentUrl && attachmentType.startsWith('audio/');
    let attachment = '';
    if (isVoiceMessage) {
      attachment = voicePlayerMarkup(message, attachmentUrl);
    } else if (attachmentUrl && attachmentType.startsWith('image/')) {
      attachment = '<a class="studyco-message-image" href="' + attachmentUrl + '" target="_blank" rel="noopener"><img src="' + attachmentUrl + '" alt="' + esc(message.attachmentName || 'Shared image') + '" loading="lazy" decoding="async"></a>';
    } else if (attachmentUrl) {
      attachment = '<a class="studyco-message-attachment" href="' + attachmentUrl + '" target="_blank" rel="noopener"><span>↧</span><b>' + esc(message.attachmentName || 'Shared file') + '</b><small>' + esc(message.attachmentType || 'Attachment') + '</small></a>';
    }
    const visibleBody = isVoiceMessage && /^voice message$/i.test(rawBody.trim()) ? '' : body;
    const bubbleClass = isVoiceMessage ? 'bubble audio-bubble' : 'bubble';
    return '<div class="studyco-message ' + (message.senderId === state.user.uid ? 'mine' : '') + '">' + (message.senderId === state.user.uid ? '' : avatar(profile, 'small')) + '<div class="' + bubbleClass + '">' + visibleBody + attachment + '<div class="studyco-message-meta"><time>' + esc(timeText(message.createdAt)) + '</time>' + messageReceiptMarkup(message) + '</div></div></div>';
  }).join('') : '<div class="studyco-chat-empty">Say hello to your study friend.</div>';
  target.querySelectorAll('.studyco-voice-note-audio').forEach((audio) => {
    ['timeupdate', 'loadedmetadata', 'durationchange', 'play', 'pause', 'ended'].forEach((eventName) => audio.addEventListener(eventName, () => updateVoicePlayer(audio)));
    updateVoicePlayer(audio);
  });
  target.scrollTop = target.scrollHeight;
  updateChatReceiptIndicators();
}

function stopChatRecordingPreview(session = state.chatRecordingSession) {
  if (!session?.previewAudio) return;
  session.previewAudio.pause();
  session.previewAudio.currentTime = 0;
  session.previewAudio.onended = null;
  session.previewAudio = null;
  if (session.previewUrl) URL.revokeObjectURL(session.previewUrl);
  session.previewUrl = '';
  updateChatRecordingUI();
}

function stopChatRecordingVisualization(session) {
  if (!session) return;
  if (session.waveFrame) cancelAnimationFrame(session.waveFrame);
  session.waveFrame = 0;
  try { session.waveSource?.disconnect(); } catch (error) {}
  try { session.analyser?.disconnect(); } catch (error) {}
  if (session.audioContext && session.audioContext.state !== 'closed') {
    session.audioContext.close().catch(() => {});
  }
  if (state.chatRecordingSession === session || !state.chatRecordingSession) document.querySelector('.studyco-chat-record-wave')?.classList.remove('is-live', 'is-fallback');
  session.audioContext = null;
  session.analyser = null;
}

function startChatRecordingVisualization(stream, session) {
  const AudioContextType = window.AudioContext || window.webkitAudioContext;
  const wave = document.querySelector('.studyco-chat-record-wave');
  if (!wave) return;
  wave.classList.remove('is-fallback');
  wave.classList.add('is-live');
  if (!AudioContextType) { wave.classList.add('is-fallback'); return; }
  try {
    const context = new AudioContextType();
    const analyser = context.createAnalyser();
    analyser.fftSize = 128;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    session.audioContext = context;
    session.analyser = analyser;
    session.waveSource = source;
    const values = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      if (state.chatRecordingSession !== session || session.cancelled || !session.analyser) return;
      const currentWave = document.querySelector('.studyco-chat-record-wave');
      if (!currentWave) return;
      analyser.getByteFrequencyData(values);
      const bars = currentWave.querySelectorAll('i');
      bars.forEach((bar, index) => {
        const valueIndex = Math.min(values.length - 1, Math.floor((index / Math.max(1, bars.length)) * values.length));
        const strength = values[valueIndex] / 255;
        bar.style.height = Math.max(12, Math.round(14 + strength * 86)) + '%';
      });
      session.waveFrame = requestAnimationFrame(draw);
    };
    if (context.state === 'suspended') context.resume().catch(() => {});
    session.waveFrame = requestAnimationFrame(draw);
  } catch (error) {
    wave.classList.add('is-fallback');
  }
}

function currentChatRecordingDuration(session) {
  if (!session) return 0;
  const liveElapsed = session.recorder.state === 'recording' ? Date.now() - session.startedAt : 0;
  return Math.max(0, session.elapsedMs + liveElapsed);
}

function updateChatRecordingUI() {
  const form = $('studyco-chat-form');
  const button = $('studyco-chat-record');
  const controls = form?.querySelector('.studyco-chat-recording-controls');
  const session = state.chatRecordingSession;
  const waitingForMic = state.chatRecordingStarting;
  const recordingMode = !!session || waitingForMic;
  form?.classList.toggle('is-recording', recordingMode);
  if (controls) controls.hidden = !recordingMode;
  if (button) {
    button.classList.toggle('is-recording', !!session && session.recorder.state === 'recording');
    button.setAttribute('aria-label', recordingMode ? 'Recording voice message' : 'Record a voice note');
    button.title = recordingMode ? 'Recording voice message' : 'Record a voice note';
  }
  const status = form?.querySelector('[data-chat-recording-status]');
  const elapsedNode = form?.querySelector('[data-chat-recording-time]');
  const pauseButton = form?.querySelector('[data-chat-record-pause]');
  const replayButton = form?.querySelector('[data-chat-record-preview]');
  const sendButton = form?.querySelector('[data-chat-record-send]');
  const paused = !!session && session.recorder.state === 'paused';
  if (status) status.textContent = waitingForMic ? 'Connecting to microphone…' : session?.sendRequested ? 'Preparing voice message…' : paused ? 'Recording paused' : recordingMode ? 'Recording voice message' : '';
  if (elapsedNode) elapsedNode.textContent = formatVoiceDuration(Math.floor(currentChatRecordingDuration(session) / 1000));
  if (pauseButton) {
    pauseButton.disabled = !session || session.sendRequested || session.recorder.state === 'inactive';
    pauseButton.setAttribute('aria-label', paused ? 'Resume recording' : 'Pause recording');
    pauseButton.title = paused ? 'Resume recording' : 'Pause recording';
    pauseButton.innerHTML = paused
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"></path></svg>';
  }
  if (replayButton) {
    replayButton.disabled = !session || session.recorder.state !== 'paused' || !session.chunks.length || session.sendRequested;
    const previewPlaying = !!session?.previewAudio && !session.previewAudio.paused;
    replayButton.setAttribute('aria-label', previewPlaying ? 'Pause voice preview' : 'Replay voice preview');
    replayButton.title = previewPlaying ? 'Pause voice preview' : 'Replay voice preview';
    replayButton.innerHTML = previewPlaying
      ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"></path></svg>'
      : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';
  }
  if (sendButton) {
    sendButton.disabled = !session || session.sendRequested;
    sendButton.textContent = session?.sendRequested ? 'Sending…' : 'Send';
  }
}

async function sendMessage(event, attachmentOverride = null, isVoiceNote = false, voiceDuration = 0, voiceChatUid = null, voiceChatId = null) {
  event?.preventDefault();
  const input = $('studyco-chat-input'); const fileInput = $('studyco-chat-file');
  const button = $('studyco-chat-send') || event?.target?.querySelector('button[type="submit"]');
  const text = input?.value.trim() || ''; const file = attachmentOverride || fileInput?.files?.[0];
  if (!text && !file) return;
  const chatUid = voiceChatUid || state.activeChatUid;
  if (!chatUid) { toast('Choose a friend before sending a message.', true); return; }
  if (state.blockedUserIds.has(chatUid)) { toast('Unblock this person in chat settings before sending a message.', true); return; }
  if (button) button.disabled = true;
  try {
    const conversationId = voiceChatId || (state.activeChatUid === chatUid ? state.activeChatId : null) || await ensureConversation(chatUid);
    if (state.activeChatUid === chatUid) state.activeChatId = conversationId;
    const attachmentUrl = file ? await uploadAttachment(file, 'studyco/' + state.user.uid + '/messages/' + Date.now() + '-' + file.name.replace(/[^a-z0-9._-]/gi, '')) : '';
    const messageText = text.slice(0, 2000) || (isVoiceNote ? 'Voice message' : (file ? 'Shared ' + file.name : ''));
    await addDoc(collection(db, 'social_conversations', conversationId, 'messages'), { senderId: state.user.uid, receiverId: chatUid, messageText, attachmentUrl, attachmentName: file?.name || '', attachmentType: file?.type || '', attachmentKind: isVoiceNote ? 'voice' : '', attachmentSize: file?.size || 0, attachmentDuration: isVoiceNote ? Math.max(0, Math.floor(Number(voiceDuration) || 0)) : 0, createdAt: serverTimestamp(), is_read: false });
    await updateDoc(doc(db, 'social_conversations', conversationId), { lastMessageText: messageText.slice(0, 120), lastMessageAt: serverTimestamp(), lastSenderId: state.user.uid, ['lastReadBy.' + state.user.uid]: true, updatedAt: serverTimestamp() });
    await createNotification(chatUid, 'message', conversationId, conversationId).catch(() => {});
    if (!isVoiceNote) {
      if (input) { input.value = ''; input.style.height = ''; }
      if (fileInput) fileInput.value = '';
      if ($('studyco-chat-file-name')) $('studyco-chat-file-name').textContent = '';
    }
  } catch (error) {
    toast(error.message || 'Your message could not be sent.', true);
  } finally {
    if (button) button.disabled = false;
  }
}

function beginSendingChatRecording(session) {
  if (!session || session.cancelled || session.sendRequested) return;
  if (session.recorder.state === 'recording') {
    session.elapsedMs += Date.now() - session.startedAt;
    session.startedAt = 0;
  }
  session.sendRequested = true;
  stopChatRecordingPreview(session);
  updateChatRecordingUI();
  if (session.recorder.state !== 'inactive') session.recorder.stop();
}

function toggleChatRecordingPause() {
  const session = state.chatRecordingSession;
  if (!session || session.sendRequested) return;
  try {
    if (session.recorder.state === 'recording') {
      session.recorder.pause();
      session.elapsedMs += Date.now() - session.startedAt;
      session.startedAt = 0;
    } else if (session.recorder.state === 'paused') {
      session.startedAt = Date.now();
      session.recorder.resume();
    }
    updateChatRecordingUI();
  } catch (error) { toast(error.message || 'Recording could not be paused.', true); }
}

function replayChatRecordingPreview() {
  const session = state.chatRecordingSession;
  if (!session || session.recorder.state !== 'paused' || session.sendRequested || !session.chunks.length) return;
  if (session.previewAudio && !session.previewAudio.paused) {
    session.previewAudio.pause();
    session.previewAudio.currentTime = 0;
    updateChatRecordingUI();
    return;
  }
  stopChatRecordingPreview(session);
  const type = session.recorder.mimeType || session.chunks.find((chunk) => chunk.type)?.type || 'audio/webm';
  const blob = new Blob(session.chunks, { type });
  if (!blob.size) { toast('There is no recorded audio to preview yet.', true); return; }
  session.previewUrl = URL.createObjectURL(blob);
  session.previewAudio = new Audio(session.previewUrl);
  session.previewAudio.onended = () => stopChatRecordingPreview(session);
  session.previewAudio.play().then(updateChatRecordingUI).catch((error) => {
    stopChatRecordingPreview(session);
    toast(error.message || 'The voice preview could not play.', true);
  });
  updateChatRecordingUI();
}

function discardChatVoiceRecording() {
  const session = state.chatRecordingSession;
  if (!session) {
    if (state.chatRecordingStarting) {
      state.chatRecordingAttemptId += 1;
      state.chatRecordingStarting = false;
      updateChatRecordingUI();
    }
    return;
  }
  session.cancelled = true;
  stopChatRecordingPreview(session);
  stopChatRecordingVisualization(session);
  if (state.chatRecordingSession === session) {
    window.clearInterval(state.chatRecordingTimer);
    state.chatRecordingTimer = null;
    state.chatRecordingSession = null;
    state.chatRecorder = null;
    state.chatRecordingStream = null;
    state.chatRecordedChunks = [];
  }
  if (session.recorder.state !== 'inactive') session.recorder.stop();
  else session.stream.getTracks().forEach((track) => track.stop());
  updateChatRecordingUI();
}

function downloadVoiceMessage(button) {
  const source = button?.dataset.chatVoiceDownload || '';
  if (!source) return;
  const filename = button.dataset.filename || 'voice-message.webm';
  button.disabled = true;
  fetch(source).then((response) => {
    if (!response.ok) throw new Error('Download failed (' + response.status + ').');
    return response.blob();
  }).then((blob) => {
    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    button.classList.add('is-downloaded');
    button.setAttribute('aria-label', 'Voice message downloaded');
    button.title = 'Voice message downloaded';
  }).catch((error) => {
    const fallback = document.createElement('a');
    fallback.href = source;
    fallback.download = filename;
    fallback.target = '_blank';
    fallback.rel = 'noopener';
    document.body.appendChild(fallback);
    fallback.click();
    fallback.remove();
    toast(error.message || 'The audio could not be downloaded directly. Opening the file instead.', true);
  }).finally(() => { button.disabled = false; });
}

async function toggleChatVoiceRecording() {
  if (state.chatRecordingSession || state.chatRecordingStarting) return;
  if (!state.activeChatUid || !$('studyco-chat-form')) { toast('Open a conversation before recording a voice note.', true); return; }
  if (state.blockedUserIds.has(state.activeChatUid)) { toast('Unblock this person in chat settings before sending a voice note.', true); return; }
  if ($('studyco-chat-file')?.files?.length) { toast('Send or remove the attached file before recording a voice note.', true); return; }
  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    toast('Voice recording is not supported on this device.', true);
    return;
  }
  const attemptId = (state.chatRecordingAttemptId || 0) + 1;
  const chatUid = state.activeChatUid;
  const chatId = state.activeChatId;
  state.chatRecordingAttemptId = attemptId;
  state.chatRecordingStarting = true;
  updateChatRecordingUI();
  let stream = null;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (state.chatRecordingAttemptId !== attemptId || state.activeChatUid !== chatUid || !$('studyco-chat-form')) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const Recorder = window.MediaRecorder;
    const supportedTypes = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mimeType = supportedTypes.find((type) => !Recorder.isTypeSupported || Recorder.isTypeSupported(type));
    const recorder = mimeType ? new Recorder(stream, { mimeType }) : new Recorder(stream);
    const session = { recorder, stream, chunks: [], startedAt: Date.now(), elapsedMs: 0, cancelled: false, sendRequested: false, chatUid, chatId, previewAudio: null, previewUrl: '', audioContext: null, analyser: null, waveSource: null, waveFrame: 0 };
    state.chatRecordingSession = session;
    state.chatRecorder = recorder;
    state.chatRecordingStream = stream;
    state.chatRecordedChunks = session.chunks;
    state.chatRecordingStartedAt = session.startedAt;
    state.chatRecordingStarting = false;
    recorder.ondataavailable = (event) => {
      if (event.data?.size) session.chunks.push(event.data);
      if (state.chatRecordingSession === session && session.recorder.state === 'paused') updateChatRecordingUI();
    };
    recorder.onpause = () => updateChatRecordingUI();
    recorder.onresume = () => updateChatRecordingUI();
    recorder.onstop = () => {
      const wasCurrentSession = state.chatRecordingSession === session;
      if (wasCurrentSession) {
        window.clearInterval(state.chatRecordingTimer);
        state.chatRecordingTimer = null;
      }
      stopChatRecordingPreview(session);
      stopChatRecordingVisualization(session);
      session.stream.getTracks().forEach((track) => track.stop());
      const chunks = session.chunks.slice();
      if (wasCurrentSession) {
        state.chatRecordingSession = null;
        state.chatRecorder = null;
        state.chatRecordingStream = null;
        state.chatRecordedChunks = [];
        state.chatRecordingStartedAt = 0;
        state.chatRecordingElapsedMs = 0;
        state.chatRecordingStarting = false;
        updateChatRecordingUI();
      }
      if (session.cancelled || !session.sendRequested) return;
      const type = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (!blob.size) { toast('No audio was captured. Try recording again.', true); return; }
      const extension = type.includes('mp4') ? 'm4a' : (type.includes('ogg') ? 'ogg' : 'webm');
      const file = new File([blob], 'voice-note-' + Date.now() + '.' + extension, { type });
      const duration = Math.ceil(currentChatRecordingDuration(session) / 1000);
      void sendMessage(null, file, true, duration, session.chatUid, session.chatId);
    };
    recorder.start(250);
    startChatRecordingVisualization(stream, session);
    updateChatRecordingUI();
    state.chatRecordingTimer = window.setInterval(() => {
      updateChatRecordingUI();
      if (currentChatRecordingDuration(session) >= 180000 && session.recorder.state === 'recording' && !session.sendRequested) {
        toast('Voice notes are limited to 3 minutes. Sending this recording now.');
        beginSendingChatRecording(session);
      }
    }, 500);
  } catch (error) {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    if (state.chatRecordingAttemptId === attemptId) {
      state.chatRecordingStarting = false;
      state.chatRecorder = null;
      state.chatRecordingStream = null;
      updateChatRecordingUI();
    }
    toast(error.message || 'Voice recording could not start.', true);
  }
}

function clearUserChatState() {
  window.clearInterval(state.chatReceiptRefreshTimer);
  state.chatReceiptRefreshTimer = null;
  if (state.chatRecordingSession || state.chatRecordingStarting) discardChatVoiceRecording();
  ['chatListUnsub', 'messageUnsub', 'chatSettingsUnsub', 'blockedUsersUnsub', 'notificationUnsub'].forEach((key) => {
    state[key]?.();
    state[key] = null;
  });
  state.chatListOwner = null;
  state.chatSettingsOwner = null;
  state.blockedUsersOwner = null;
  state.activeChatUid = null;
  state.activeChatId = null;
  state.conversations = [];
  state.chatSettings = new Map();
  state.chatSettingsReady = false;
  state.blockedUserIds = new Set();
  state.showArchivedChats = false;
  state.notifications = [];
}

function updateChatSettingsMenu() {
  if (!state.activeChatId) return;
  const settings = state.chatSettings.get(state.activeChatId) || {};
  const muteAction = $('studyco-chat-action-mute');
  const archiveAction = $('studyco-chat-action-archive');
  const blockAction = $('studyco-chat-action-block');
  if (muteAction) muteAction.textContent = settings.muted ? 'Turn off mute' : 'Mute notifications';
  if (archiveAction) archiveAction.textContent = settings.archived ? 'Unarchive conversation' : 'Archive conversation';
  if (blockAction) blockAction.textContent = state.blockedUserIds.has(state.activeChatUid) ? 'Unblock this person' : 'Block this person';
}

function updateActiveChatControls() {
  if (!state.activeChatUid) return;
  const blocked = state.blockedUserIds.has(state.activeChatUid);
  const notice = $('studyco-chat-blocked-notice');
  if (notice) notice.hidden = !blocked;
  ['studyco-chat-input', 'studyco-chat-file', 'studyco-chat-record', 'studyco-chat-send'].forEach((id) => {
    const control = $(id);
    if (control) control.disabled = blocked;
  });
  document.querySelectorAll('#studyco-chat-panel [data-start-call]').forEach((button) => { button.disabled = blocked; });
  updateChatSettingsMenu();
}

function closeChatSettingsMenu() {
  const menu = $('studyco-chat-settings-menu');
  const toggle = document.querySelector('[data-chat-settings-toggle]');
  if (menu) menu.hidden = true;
  if (toggle) toggle.setAttribute('aria-expanded', 'false');
}

async function saveChatSettings(patch) {
  if (!state.user || !state.activeChatId) throw new Error('Open a conversation to change its settings.');
  const conversationId = state.activeChatId;
  const current = state.chatSettings.get(conversationId) || {};
  const next = {
    conversationId,
    userId: state.user.uid,
    muted: patch.muted ?? (current.muted === true),
    archived: patch.archived ?? (current.archived === true),
    markedUnread: patch.markedUnread ?? (current.markedUnread === true)
  };
  await setDoc(doc(db, 'social_chat_settings', chatSettingsDocumentId(conversationId)), { ...next, updatedAt: serverTimestamp() }, { merge: true });
  state.chatSettings.set(conversationId, next);
  renderChatList();
  renderNotifications();
  refreshNavCounts();
  updateChatSettingsMenu();
}

async function toggleActiveChatBlock() {
  if (!state.user || !state.activeChatUid) return;
  const uid = state.activeChatUid;
  const blocking = !state.blockedUserIds.has(uid);
  const name = profileName(state.conversations.find((chat) => chat.uid === uid)?.profile || state.profiles.get(uid));
  if (blocking && !window.confirm('Block ' + name + '? They will no longer be able to message or call you from this chat.')) return;
  const blockRef = doc(db, 'social_user_blocks', state.user.uid, 'blocked', uid);
  if (blocking) await setDoc(blockRef, { blockedUid: uid, createdAt: serverTimestamp() });
  else await deleteDoc(blockRef);
  const blocked = new Set(state.blockedUserIds);
  if (blocking) blocked.add(uid); else blocked.delete(uid);
  state.blockedUserIds = blocked;
  renderChatList();
  updateActiveChatControls();
  toast(blocking ? 'This person is blocked from messaging or calling you.' : 'This person is unblocked.');
}

function openChatReportDialog() {
  const panel = $('studyco-chat-panel');
  if (!panel || !state.activeChatId || !state.activeChatUid) return;
  let dialog = $('studyco-chat-report-dialog');
  if (!dialog) {
    panel.insertAdjacentHTML('beforeend', '<dialog id="studyco-chat-report-dialog" class="studyco-chat-report-dialog" aria-labelledby="studyco-chat-report-title"><form id="studyco-chat-report-form"><h2 id="studyco-chat-report-title">Report this conversation</h2><p>Reports are private and reviewed by StudyCo moderators.</p><label>Reason<select name="category" required><option value="spam">Spam</option><option value="harassment">Harassment or bullying</option><option value="inappropriate">Inappropriate content</option><option value="threat">Threat or safety concern</option><option value="other">Other</option></select></label><label>Details (optional)<textarea name="details" maxlength="500" rows="4" placeholder="Add context for the moderator"></textarea></label><div class="studyco-chat-report-actions"><button class="studyco-button soft" type="button" data-chat-report-cancel>Cancel</button><button class="studyco-button danger" type="submit">Submit report</button></div></form></dialog>');
    dialog = $('studyco-chat-report-dialog');
  }
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else { dialog.hidden = false; dialog.setAttribute('open', ''); }
}

function closeChatReportDialog() {
  const dialog = $('studyco-chat-report-dialog');
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else { dialog.hidden = true; dialog.removeAttribute('open'); }
}

async function submitChatReport(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const category = form.elements.category?.value || '';
  const details = (form.elements.details?.value || '').trim().slice(0, 500);
  const allowedCategories = ['spam', 'harassment', 'inappropriate', 'threat', 'other'];
  if (!allowedCategories.includes(category)) { toast('Choose a report reason.', true); return; }
  try {
    await addDoc(collection(db, 'social_chat_reports'), {
      reporterId: state.user.uid,
      reportedUserId: state.activeChatUid,
      conversationId: state.activeChatId,
      category,
      details,
      status: 'open',
      createdAt: serverTimestamp()
    });
    form.reset();
    closeChatReportDialog();
    closeChatSettingsMenu();
    toast('Report sent to StudyCo moderators.');
  } catch (error) { toast(error.message || 'Your report could not be submitted.', true); }
}

async function handleChatSettingsAction(action) {
  try {
    const settings = state.chatSettings.get(state.activeChatId) || {};
    if (action === 'mute') {
      const muted = !settings.muted;
      await saveChatSettings({ muted });
      toast(muted ? 'Notifications muted for this conversation.' : 'Notifications restored for this conversation.');
      return;
    }
    if (action === 'archive') {
      const archived = !settings.archived;
      await saveChatSettings({ archived });
      state.showArchivedChats = false;
      closeChat();
      toast(archived ? 'Conversation archived. Find it in Archived chats.' : 'Conversation restored to your inbox.');
      return;
    }
    if (action === 'unread') {
      await saveChatSettings({ markedUnread: true });
      closeChat();
      toast('Conversation marked unread.');
      return;
    }
    if (action === 'block') { await toggleActiveChatBlock(); return; }
    if (action === 'report') { closeChatSettingsMenu(); openChatReportDialog(); }
  } catch (error) { toast(error.message || 'Chat settings could not be saved.', true); }
}

async function openChat(uid, { updateUrl = true } = {}) {
  if ((state.chatRecordingSession || state.chatRecordingStarting) && uid !== state.activeChatUid) discardChatVoiceRecording();
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
    $('studyco-chat-panel').innerHTML = `<div class="studyco-chat-head"><button class="studyco-chat-back" data-chat-back type="button" aria-label="Back to messages">‹</button>${avatarWithPresence(profile, uid, 'small')}<div class="studyco-chat-identity"><strong>${esc(profileName(profile))}</strong><span id="studyco-chat-presence" class="studyco-chat-presence-text"></span></div><span id="studyco-chat-presence-dot" class="studyco-presence-dot" aria-hidden="true"></span><div class="studyco-chat-call-actions"><button class="studyco-button soft studyco-chat-icon-action" data-start-call="${esc(uid)}" data-call-kind="audio" type="button" aria-label="Start voice call" title="Voice call"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4m-4 0h8"/></svg></button><button class="studyco-button primary studyco-chat-icon-action" data-start-call="${esc(uid)}" data-call-kind="video" type="button" aria-label="Start video call" title="Video call"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/></svg></button><button class="studyco-button light studyco-chat-icon-action" data-call-history type="button" aria-label="Open recent call activity" title="Call history"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg></button></div><div class="studyco-chat-settings"><button class="studyco-chat-settings-toggle" type="button" data-chat-settings-toggle aria-haspopup="menu" aria-expanded="false" aria-label="Chat settings">•••</button><div class="studyco-chat-settings-menu" id="studyco-chat-settings-menu" role="menu" hidden><button type="button" role="menuitem" id="studyco-chat-action-mute" data-chat-action="mute">Mute notifications</button><button type="button" role="menuitem" id="studyco-chat-action-archive" data-chat-action="archive">Archive conversation</button><button type="button" role="menuitem" id="studyco-chat-action-unread" data-chat-action="unread">Mark as unread</button><button type="button" role="menuitem" id="studyco-chat-action-block" data-chat-action="block">Block this person</button><button type="button" role="menuitem" data-chat-action="report">Report conversation</button></div></div></div><div class="studyco-chat-messages"></div><div id="studyco-chat-blocked-notice" class="studyco-chat-blocked-notice" hidden>You blocked this person. Unblock them in chat settings to send messages or call.</div><form class="studyco-chat-compose" id="studyco-chat-form"><textarea id="studyco-chat-input" class="studyco-message-input" maxlength="2000" rows="1" placeholder="Message..." aria-label="Message"></textarea><div class="studyco-chat-compose-actions"><label class="studyco-attachment-button" title="Attach a file"><input id="studyco-chat-file" type="file" accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.ppt,.pptx,.txt"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7 9m5-5 5 5"/><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/></svg><span class="studyco-visually-hidden">Attach a file</span></label><span id="studyco-chat-file-name" class="studyco-chat-file-name"></span><button id="studyco-chat-record" class="studyco-chat-record-button" data-chat-record type="button" aria-label="Record a voice note" title="Record a voice note"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="2.5" width="6" height="12" rx="3"></rect><path d="M5 11a7 7 0 0 0 14 0M12 18v3m-4 0h8"></path></svg></button><button id="studyco-chat-send" class="studyco-button primary" type="submit" aria-label="Send message" title="Send message"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 3l-8.5 18-1.8-7.7L3 11.5Zm7.7 1.8L21 3"/></svg></button></div>` + '<div class="studyco-chat-recording-controls" hidden aria-live="polite">' + '<button class="studyco-chat-record-action delete" type="button" data-chat-record-delete aria-label="Delete recording" title="Delete recording"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-.8 13H6.8L6 7m3 3v7m6-7v7"></path></svg></button>' + '<div class="studyco-chat-recording-main"><div class="studyco-chat-recording-label"><span data-chat-recording-status>Recording voice message</span><time data-chat-recording-time>0:00</time></div><div class="studyco-chat-record-wave" role="img" aria-label="Live recording waveform">' + voiceWaveformMarkup('recording', 24) + '</div></div><div class="studyco-chat-recording-transport"><button class="studyco-chat-record-action" type="button" data-chat-record-pause aria-label="Pause recording" title="Pause recording"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zm6 0h4v14h-4z"></path></svg></button><button class="studyco-chat-record-action replay" type="button" data-chat-record-preview aria-label="Replay voice preview" title="Replay voice preview" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg></button></div>' + '<button class="studyco-chat-record-send" type="button" data-chat-record-send>Send</button></div>' + `</form>`;
    scheduleChatViewportSync();
    updateActiveChatPresence();
    window.clearInterval(state.chatReceiptRefreshTimer);
    state.chatReceiptRefreshTimer = window.setInterval(() => {
      if (state.activeChatUid === uid) updateActiveChatPresence();
    }, 15000);
    updateChatSettingsMenu();
    updateActiveChatControls();
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
  window.clearInterval(state.chatReceiptRefreshTimer);
  state.chatReceiptRefreshTimer = null;
  if (state.chatRecordingSession || state.chatRecordingStarting) discardChatVoiceRecording();
  state.activeChatUid = null;
  state.activeChatId = null;
  state.messageUnsub?.();
  state.messageUnsub = null;
  setView('messages', { chatUid: '' });
  renderChatList();
}

function getCallAudioConstraints() {
  return {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    channelCount: { ideal: 1 }
  };
}

function prepareCallAudioStream(stream) {
  const track = stream?.getAudioTracks?.()[0];
  if (!track) return;
  track.contentHint = 'speech';
}

function isNativeCallEnvironment() {
  try {
    return Boolean(window.Capacitor?.isNativePlatform?.() && window.AqsPermissionsBridge);
  } catch (_) {
    return false;
  }
}

function defaultCallSpeakerRoute() {
  /*
   * The Android WebView does not reliably expose the earpiece as a
   * communication device on every handset. Speaker is the audible default;
   * the call control can still switch to earpiece when it is available.
   */
  return true;
}

function setNativeCallSpeaker(enabled) {
  try {
    window.AqsPermissionsBridge?.setCallSpeaker?.(Boolean(enabled));
  } catch (_) {
    /* Speaker routing is optional outside the native mobile shell. */
  }
}

function setNativeCallAudio(enabled, mode = state.callMode) {
  try {
    const bridge = window.AqsPermissionsBridge;
    if (!bridge) return;
    if (enabled) {
      bridge.beginCallAudio?.(mode === 'video');
      setNativeCallSpeaker(state.callSpeakerOn);
    } else bridge.endCallAudio?.();
  } catch (_) {
    /* The website has no native bridge; Web Audio remains browser-controlled. */
  }
}

function showRemoteAudioUnlock(show) {
  const button = $('studyco-call-enable-audio');
  if (button) button.hidden = !show;
}

function primeStudyCoRemoteAudio() {
  const remoteAudio = $('studyco-call-remote-audio');
  if (!remoteAudio) return;
  remoteAudio.autoplay = true;
  remoteAudio.playsInline = true;
  remoteAudio.muted = true;
  try {
    remoteAudio.srcObject = new MediaStream();
    remoteAudio.play()?.catch(() => {});
  } catch (_) {
    /* Playback can be retried when the remote track arrives. */
  }
}

function callPeer(callId, remoteUid) {
  const pc = new RTCPeerConnection({
    sdpSemantics: 'unified-plan',
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ],
    iceCandidatePoolSize: 10
  });
  const remoteStream = new MediaStream();
  const remoteAudio = $('studyco-call-remote-audio');
  const remoteVideo = $('studyco-call-remote-video');
  let browserRemoteStream = null;
  const pendingCandidates = [];
  const pendingCandidateIds = new Set();
  const addedCandidateIds = new Set();
  let remoteDescriptionReady = false;

  const playRemoteVideo = () => {
    if (!remoteVideo) return;
    remoteVideo.autoplay = true;
    remoteVideo.playsInline = true;
    remoteVideo.muted = true;
    remoteVideo.controls = false;
    remoteVideo.play().catch(() => {});
  };

  const playRemoteAudio = () => {
    if (!remoteAudio) return;
    remoteAudio.autoplay = true;
    remoteAudio.playsInline = true;
    remoteAudio.setAttribute('disableRemotePlayback', '');
    remoteAudio.muted = !state.callConnected || !state.speakerOn;
    remoteAudio.volume = 1;
    const playPromise = remoteAudio.play();
    if (playPromise?.then) {
      playPromise
        .then(() => showRemoteAudioUnlock(false))
        .catch(() => showRemoteAudioUnlock(true));
    }
  };

  const syncRemoteMedia = () => {
    const hasAudio = remoteStream.getAudioTracks().length > 0;
    const hasVideo = remoteStream.getVideoTracks().length > 0;
    if (remoteAudio && hasAudio) {
      /*
       * Android WebView can deliver a populated event stream before the
       * synthetic stream has finished accepting addTrack(). Prefer the
       * browser-owned stream when it exists, with the synthetic stream as a
       * fallback for browsers that omit event.streams.
       */
      remoteAudio.srcObject = browserRemoteStream || remoteStream;
      playRemoteAudio();
    }
    if (remoteVideo && hasVideo) {
      remoteVideo.srcObject = remoteStream;
      remoteVideo.hidden = false;
      $('studyco-call-stage')?.classList.add('has-remote-video');
      playRemoteVideo();
    }
  };

  /*
   * Arm the audio element while the call button is still the active user
   * gesture. Android WebView can reject the first play() call if playback is
   * started only after the remote WebRTC track arrives asynchronously.
   * Playback stays muted until the call is connected, then setCallConnected()
   * unmutes it.
   */
  if (remoteAudio) {
    remoteAudio.srcObject = remoteStream;
    playRemoteAudio();
  }

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
    if (event.streams?.[0]) browserRemoteStream = event.streams[0];
    tracks.forEach((track) => {
      track.enabled = true;
      if (!remoteStream.getTracks().some((existing) => existing.id === track.id)) remoteStream.addTrack(track);
      track.onunmute = syncRemoteMedia;
    });
    syncRemoteMedia();
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

  pc.onicecandidateerror = (event) => {
    if (state.activeCallId !== callId) return;
    const code = Number(event?.errorCode);
    $('studyco-call-presence').textContent = code
      ? 'ICE route check failed (' + code + '); trying available routes'
      : 'Checking network connection';
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
  const value = state.callStartedAt ? callDurationText(Date.now() - state.callStartedAt) : '00:00';
  if (elapsed) elapsed.textContent = value;
  const minimizedElapsed = $('studyco-call-minimized-elapsed');
  if (minimizedElapsed) minimizedElapsed.textContent = value;
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

function updateMinimizedCallBar() {
  const bar = $('studyco-call-minimized-bar');
  if (!bar) return;
  const active = Boolean(state.activeCallId || state.pendingIncomingCall);
  bar.hidden = !active || !state.callMinimized;
  if (!active) return;
  const name = $('studyco-call-minimized-name');
  const status = $('studyco-call-minimized-status');
  const avatarEl = $('studyco-call-minimized-avatar');
  if (name) name.textContent = profileName(state.callProfile);
  if (avatarEl) avatarEl.textContent = initials(state.callProfile);
  if (status) {
    status.textContent = state.callIncoming && state.pendingIncomingCall
      ? `Incoming ${state.callMode} call`
      : `${state.callMode === 'video' ? 'Video' : 'Voice'} call in progress`;
  }
  updateCallElapsed();
}

function setCallMinimized(minimized) {
  const active = Boolean(state.activeCallId || state.pendingIncomingCall);
  state.callMinimized = Boolean(minimized && active);
  const modal = $('studyco-call-modal');
  if (modal) modal.hidden = state.callMinimized;
  document.body.classList.toggle('studyco-call-hidden', state.callMinimized);
  updateMinimizedCallBar();
}

function resumeCallMedia() {
  if (!state.activeCallId) return;
  const remoteAudio = $('studyco-call-remote-audio');
  const remoteVideo = $('studyco-call-remote-video');
  if (remoteAudio?.srcObject) remoteAudio.play().catch(() => {});
  if (remoteVideo?.srcObject) {
    remoteVideo.hidden = false;
    remoteVideo.play().catch(() => {});
  }
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
  const speaker = $('studyco-call-speaker');
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
  if (speaker) {
    speaker.classList.toggle('active', state.callSpeakerOn);
    speaker.querySelector('b').textContent = isNativeCallEnvironment()
      ? (state.callSpeakerOn ? 'Speaker' : 'Earpiece')
      : (state.callSpeakerOn ? 'Speaker' : 'Muted');
  }
}

function openCallModal(profile, incoming = false, targetOnline = true, presence = null, mode = 'audio') {
  state.callProfile = profile || {};
  state.callIncoming = incoming;
  state.callMode = mode === 'video' ? 'video' : 'audio';
  state.callConnected = false;
  const modal = $('studyco-call-modal');
  modal?.classList.toggle('is-incoming-call', incoming);
  modal?.classList.remove('is-call-connected');
  setCallMinimized(false);
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
  $('studyco-call-minimized-name').textContent = profileName(profile);
  $('studyco-call-minimized-avatar').textContent = initials(profile);
  $('studyco-call-minimized-status').textContent = incoming
    ? `Incoming ${state.callMode} call`
    : `${state.callMode === 'video' ? 'Video' : 'Voice'} call in progress`;
  showRemoteAudioUnlock(false);
  updateCallModeUi();
  if (modal) modal.hidden = false;
  updateCallControls();
}

function setCallConnected() {
  state.callConnected = true;
  $('studyco-call-modal')?.classList.add('is-call-connected');
  stopRingingTone();
  clearTimeout(state.callTimeout);
  state.callTimeout = null;
  $('studyco-call-status').textContent = 'Connected';
  $('studyco-call-presence').textContent = state.callMode === 'video' ? 'Live video connection' : 'Live audio connection';
  $('studyco-call-minimized-status').textContent = `${state.callMode === 'video' ? 'Video' : 'Voice'} call in progress`;
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

async function prepareIncomingVideoPreview(incoming) {
  if (incoming.data.callType !== 'video' || !navigator.mediaDevices?.getUserMedia) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: getCallAudioConstraints(),
      video: getCallVideoConstraints()
    });
    if (state.pendingIncomingCall?.id !== incoming.id || state.callConnected) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    state.callMode = 'video';
    state.callSpeakerOn = defaultCallSpeakerRoute();
    state.speakerOn = true;
    state.muted = false;
    setNativeCallAudio(true, 'video');
    state.localStream = stream;
    prepareCallAudioStream(stream);
    bindLocalVideo(stream);
    updateCallModeUi();

    /*
     * Establish the media path while the incoming screen is ringing so the
     * caller's camera can be previewed before the recipient taps Accept.
     * Audio playback stays muted until setCallConnected().
     */
    state.activeCallId = incoming.id;
    state.rtc = callPeer(incoming.id, incoming.data.callerId);
    stream.getTracks().forEach((track) => state.rtc.addTrack(track, stream));
    await state.rtc.setRemoteDescription(new RTCSessionDescription(incoming.data.offer));
    await state.rtc.flushRemoteCandidates?.();
    const answer = await state.rtc.createAnswer();
    await state.rtc.setLocalDescription(answer);
    await updateDoc(doc(db, 'studyco_calls', incoming.id), {
      answer: { type: answer.type, sdp: answer.sdp },
      updatedAt: serverTimestamp()
    });
    state.callUnsub = onSnapshot(doc(db, 'studyco_calls', incoming.id), (snapshot) => {
      if (['declined', 'ended', 'missed'].includes(snapshot.data()?.status)) finishCall();
    });
  } catch (_) {
    if (state.pendingIncomingCall?.id !== incoming.id || state.callConnected) return;
    state.callUnsub?.();
    state.candidateUnsub?.();
    state.callUnsub = null;
    state.candidateUnsub = null;
    state.rtc?.close();
    state.rtc = null;
    state.activeCallId = null;
    state.localStream?.getTracks().forEach((track) => track.stop());
    state.localStream = null;
    bindLocalVideo(null);
  }
}

async function startCall(uid, requestedMode = 'audio') {
  if (state.blockedUserIds.has(uid)) { toast('Unblock this person in chat settings before calling.', true); return; }
  primeStudyCoRemoteAudio();
  const profile = await getProfile(uid); if (!profile) return;
  try {
    state.callMode = requestedMode === 'video' ? 'video' : 'audio';
    state.speakerOn = true;
    state.callSpeakerOn = defaultCallSpeakerRoute();
    state.muted = false;
    const targetPresence = await getPresence(uid);
    const targetOnline = presenceIsOnline(targetPresence);
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone calls.');
    setNativeCallAudio(true, state.callMode);
    state.localStream = await getCallMediaStream(state.callMode);
    /* getUserMedia can reset the WebView audio route; apply call audio
       settings again after capture is fully established. */
    setNativeCallAudio(true, state.callMode);
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
        if (data.status === 'accepted') setCallConnected();
      }
      if (data.status === 'accepted' && !state.callConnected) setCallConnected();
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
  primeStudyCoRemoteAudio();
  try {
    const previewPromise = state.incomingPreviewPromise;
    if (previewPromise) await previewPromise.catch(() => {});
    if (state.pendingIncomingCall?.id !== incoming.id) return;
    clearTimeout(state.incomingCallTimers.get(incoming.id));
    state.incomingCallTimers.delete(incoming.id);
    state.speakerOn = true;
    state.callSpeakerOn = defaultCallSpeakerRoute();
    state.muted = false;
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('This browser does not support microphone calls.');
    state.callMode = incoming.data.callType === 'video' ? 'video' : 'audio';
    setNativeCallAudio(true, state.callMode);
    if (state.activeCallId === incoming.id && state.rtc && state.localStream?.getVideoTracks?.().length) {
      await updateDoc(doc(db, 'studyco_calls', incoming.id), { status: 'accepted', updatedAt: serverTimestamp() });
      stopRingingTone();
      setCallConnected();
      return;
    }
    state.localStream = await getCallMediaStream(state.callMode);
    /* Reapply the native route after WebView capture initialization. */
    setNativeCallAudio(true, state.callMode);
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
  const callId = state.pendingIncomingCall?.id || state.activeCallId;
  const status = state.pendingIncomingCall
    ? (timedOut ? 'missed' : 'declined')
    : (timedOut ? 'missed' : 'ended');
  const finishPromise = finishCall();
  if (callId) {
    await updateDoc(doc(db, 'studyco_calls', callId), { status, updatedAt: serverTimestamp() }).catch(() => {});
  }
  await finishPromise;
}

function stopMediaTracks(stream) {
  stream?.getTracks?.().forEach((track) => {
    track.enabled = false;
    track.stop();
  });
}

function releaseCallMedia() {
  const peer = state.rtc;
  peer?.getSenders?.().forEach((sender) => {
    sender.track?.stop?.();
  });
  peer?.getReceivers?.().forEach((receiver) => receiver.track?.stop?.());
  peer?.close?.();
  stopMediaTracks(state.localStream);
  state.localStream = null;

  const remoteAudio = $('studyco-call-remote-audio');
  if (remoteAudio) {
    remoteAudio.pause();
    remoteAudio.srcObject = null;
    remoteAudio.muted = true;
  }
  const remoteVideo = $('studyco-call-remote-video');
  if (remoteVideo) {
    remoteVideo.pause();
    remoteVideo.srcObject = null;
    remoteVideo.hidden = true;
  }
  const localVideo = $('studyco-call-local-video');
  if (localVideo) {
    localVideo.pause();
    localVideo.srcObject = null;
    localVideo.hidden = true;
  }
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
  state.callUnsub?.(); state.candidateUnsub?.(); state.callUnsub = null; state.candidateUnsub = null;
  releaseCallMedia();
  state.rtc = null;
  state.activeCallId = null; state.pendingIncomingCall = null; state.incomingPreviewPromise = null; state.callProfile = null; state.callIncoming = false; state.callMode = 'audio'; state.callConnected = false; state.muted = false; state.speakerOn = true; state.callSpeakerOn = true; state.translation.enabled = false;
  const callModal = $('studyco-call-modal');
  callModal?.classList.remove('is-incoming-call', 'is-call-connected');
  if (callModal) callModal.hidden = true;
  updateCallControls();
  state.callMinimized = false;
  document.body.classList.remove('studyco-call-hidden');
  $('studyco-call-minimized-bar').hidden = true;
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
    state.incomingPreviewPromise = call.data.callType === 'video' ? prepareIncomingVideoPreview(call) : null;
    state.incomingCallTimers.set(call.id, setTimeout(async () => {
      state.incomingCallTimers.delete(call.id);
      const current = await getDoc(doc(db, 'studyco_calls', call.id)).catch(() => null);
      if (current?.data()?.status === 'ringing') {
        const shouldFinishActiveCall = state.pendingIncomingCall?.id === call.id;
        if (shouldFinishActiveCall) void finishCall();
        await updateDoc(doc(db, 'studyco_calls', call.id), { status: 'missed', updatedAt: serverTimestamp() }).catch(() => {});
        await createNotification(call.data.callerId, 'call_missed', call.id).catch(() => {});
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

function openModal(id) { const modal = $(id); if (modal) modal.hidden = false; }
function closeModal(id) { const modal = $(id); if (modal) modal.hidden = true; }

function wire() {
  if (state.wired) return; state.wired = true;
  document.addEventListener('error', handleAvatarImageError, true);
  window.addEventListener('resize', scheduleChatViewportSync, { passive: true });
  window.addEventListener('scroll', scheduleChatViewportSync, { passive: true });
  window.visualViewport?.addEventListener('resize', scheduleChatViewportSync, { passive: true });
  window.visualViewport?.addEventListener('scroll', scheduleChatViewportSync, { passive: true });
  document.addEventListener('focusin', (event) => { if (event.target?.id === 'studyco-chat-input') scheduleChatViewportSync(); });
  document.addEventListener('focusout', (event) => { if (event.target?.id === 'studyco-chat-input') scheduleChatViewportSync(); });
  const openOwnProfile = () => {
    if (state.user) setView('profile', { profileUid: state.user.uid });
  };
  document.querySelectorAll('[data-studyco-view]').forEach((button) => button.addEventListener('click', () => {
    const view = button.dataset.studycoView;
    if (view === 'profile') openOwnProfile();
    else setView(view);
  }));
  $('studyco-mini-profile')?.addEventListener('click', openOwnProfile);
  $('studyco-open-composer').addEventListener('click', openPostEditor);
  $('studyco-top-create')?.addEventListener('click', openPostEditor);
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
window.addEventListener('hashchange', syncRoute);
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
  $('studyco-refresh-feed').addEventListener('click', () => renderFeed().catch((error) => renderFeedError(error)));
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
  $('studyco-story-previous').addEventListener('click', () => stepStory(-1));
  $('studyco-story-next').addEventListener('click', () => stepStory(1));
  $('studyco-story-close').addEventListener('click', () => closeStoryViewer());
  document.addEventListener('keydown', (event) => { if (!state.storyViewerOpen) return; if (event.key === 'Escape') closeStoryViewer(); else if (event.key === 'ArrowRight') stepStory(1); else if (event.key === 'ArrowLeft') stepStory(-1); });
  $('studyco-story-image').addEventListener('change', handleStoryMediaSelection); $('studyco-story-video').addEventListener('change', handleStoryMediaSelection);
  document.querySelectorAll('[data-story-color]').forEach((button) => button.addEventListener('click', () => { state.storyColor = button.dataset.storyColor; document.querySelectorAll('[data-story-color]').forEach((item) => item.classList.toggle('selected', item === button)); }));
  $('studyco-story-form').addEventListener('submit', createStory);
  $('studyco-profile-add-story')?.addEventListener('click', () => openModal('studyco-story-modal'));
  $('studyco-profile-tabs')?.addEventListener('click', (event) => { const tab = event.target.closest('[data-profile-tab]'); if (tab) void renderProfileTab(tab.dataset.profileTab); });
  $('studyco-profile-public-actions')?.addEventListener('click', (event) => { handleProfileMoreClick(event); const button = event.target.closest('[data-friend-action]'); if (button) void handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-profile-owner-actions')?.addEventListener('click', handleProfileMoreClick);
  $('studyco-profile-about-panel')?.addEventListener('click', (event) => { const button = event.target.closest('.studyco-profile-field-edit'); if (button) window.openStudyCoProfileEditor(button.dataset.editInput); });
  document.addEventListener('click', (event) => { if (event.target.closest('.studyco-profile-more-wrap')) return; document.querySelectorAll('[data-profile-more-menu]').forEach((menu) => { menu.hidden = true; }); document.querySelectorAll('[data-profile-more-toggle]').forEach((button) => button.setAttribute('aria-expanded', 'false')); });
  $('studyco-edit-profile')?.addEventListener('click', () => window.openStudyCoProfileEditor());
  [$('studyco-profile-complete-action'), $('studyco-profile-next-action')].filter(Boolean).forEach((button) => button.addEventListener('click', () => { fillEditForm(); openModal('studyco-edit-modal'); }));
  $('studyco-profile-form').addEventListener('submit', saveProfile);
  $('studyco-edit-marital-status')?.addEventListener('change', toggleRelationshipNameField);
  $('studyco-post-manage-form').addEventListener('submit', savePostChanges);
  $('studyco-profile-photo')?.addEventListener('change', (event) => previewFile(event.target.files[0], 'studyco-photo-preview'));
  $('studyco-cover-photo')?.addEventListener('change', (event) => previewFile(event.target.files[0], 'studyco-cover-preview'));
  $('studyco-inline-profile-photo')?.addEventListener('change', (event) => uploadProfileMedia(event, 'photoURL', 'profile photo'));
  $('studyco-inline-cover-photo')?.addEventListener('change', (event) => uploadProfileMedia(event, 'coverURL', 'cover photo'));
  document.addEventListener('change', (event) => {
    if (event.target.id === 'studyco-inline-profile-photo') void uploadProfileMedia(event, 'photoURL', 'profile photo');
    if (event.target.id === 'studyco-inline-cover-photo') void uploadProfileMedia(event, 'coverURL', 'cover photo');
  });
  document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(button.closest('.studyco-modal-backdrop').id)));
  $('studyco-image-viewer-modal')?.addEventListener('click', (event) => { if (event.target.id === 'studyco-image-viewer-modal') closeModal('studyco-image-viewer-modal'); });
  document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && $('studyco-image-viewer-modal') && !$('studyco-image-viewer-modal').hidden) closeModal('studyco-image-viewer-modal'); });
  $('studyco-new-message')?.addEventListener('click', () => { setView('friends'); $('studyco-global-search')?.focus(); });
  $('studyco-message-search')?.addEventListener('input', () => loadChats());
  $('studyco-mark-all-notifications')?.addEventListener('click', markAllNotificationsRead);
  $('studyco-notification-list')?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-notification-id]');
    if (row) openNotification(row.dataset.notificationId);
  });
  document.addEventListener('click', async (event) => {
    const imageTrigger = event.target.closest('[data-open-post-image]');
    if (imageTrigger) { event.preventDefault(); void openPostImageViewer(imageTrigger.dataset.postId); return; }
    if (event.target.closest('#studyco-save-post-image')) { void toggleSavedPostImage(); return; }
    if (event.target.closest('#studyco-download-post-image')) { void downloadPostImage(); return; }
    const profileLink = event.target.closest('[data-profile-uid]');
    if (profileLink) {
      if (profileLink.tagName === 'A' && (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
      event.preventDefault();
      setView('profile', { profileUid: profileLink.dataset.profileUid });
      return;
    }
    const button = event.target.closest('[data-post-action]');
    if (!button) return;
    const article = button.closest('.studyco-post'); const action = button.dataset.postAction;
    if (!article) return;
    if (action === 'read-more') {
      const post = state.posts.find((item) => item.id === article.dataset.postId);
      const body = article.querySelector('[data-post-body]');
      if (!post || !body) return;
      const expanded = button.dataset.expanded === 'true';
      body.textContent = expanded ? postTextPreview(post.content).preview : (post.content || '');
      button.dataset.expanded = String(!expanded);
      button.textContent = expanded ? 'Read more' : 'Show less';
      return;
    }
    if (action === 'close-preferences') {
      button.closest('details')?.removeAttribute('open');
      return;
    }
    if (['interested', 'not-interested'].includes(action)) {
      button.disabled = true;
      try {
        await setPostPreference(button.dataset.postId, action === 'interested' ? 'interested' : 'not_interested');
      } catch (error) {
        toast(error.message || 'Your post preference could not be saved.', true);
      } finally {
        button.disabled = false;
      }
      return;
    }
    if (['edit', 'reschedule', 'pause', 'hide', 'retry', 'delete'].includes(action)) {
      await managePost(button.dataset.postId, action);
      return;
    }
    if (action === 'like') {
      button.disabled = true;
      try {
        const result = await toggleLike(button.dataset.postId);
        button.classList.toggle('liked', result.liked);
        const reactionSummary = article.querySelector('.studyco-post-reaction-summary');
        const reactionCount = article.querySelector('.studyco-post-reaction-count');
        if (reactionCount) reactionCount.textContent = String(result.count);
        if (reactionSummary) reactionSummary.hidden = result.count === 0;
        const commentSummary = article.querySelector('.studyco-post-comment-summary');
        const engagement = article.querySelector('.studyco-post-engagement');
        if (engagement) engagement.hidden = result.count === 0 && (!commentSummary || commentSummary.hidden);
      } catch (error) {
        toast(error.message || 'The post could not be liked.', true);
      } finally {
        button.disabled = false;
      }
    }
    if (action === 'share') await sharePost(button.dataset.postId);
    if (action === 'comments') {
      button.disabled = true;
      try { await openComments(button.dataset.postId); } catch (error) { toast(error.message || 'Comments could not load.', true); }
      button.disabled = false;
    }
  });
  document.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-comment-post]')) return;
    event.preventDefault();
    const form = event.target;
    const submit = form.querySelector('button[type="submit"]');
    const input = form.querySelector('input, textarea');
    const postId = form.dataset.commentPost;
    if (!postId || !input) {
      toast('The comment form is unavailable. Please try again.', true);
      return;
    }
    if (submit) submit.disabled = true;
    try {
      const count = await addComment(postId, input.value);
      form.reset();
      const article = form.closest('.studyco-post');
      if (article && count != null) {
        const commentSummary = article.querySelector('.studyco-post-comment-summary');
        const commentCount = article.querySelector('.studyco-post-comment-count');
        const commentLabel = article.querySelector('.studyco-post-comment-label');
        const engagement = article.querySelector('.studyco-post-engagement');
        if (commentCount) commentCount.textContent = String(count);
        if (commentLabel) commentLabel.textContent = count === 1 ? 'Comment' : 'Comments';
        if (commentSummary) commentSummary.hidden = false;
        if (engagement) engagement.hidden = false;
      }
      const post = state.posts.find((item) => item.id === postId);
      if (post && count != null) post.commentCount = count;
      await loadPostComments(postId, article);
      if (!article) await renderFeed();
    } catch (error) {
      toast(error.message || 'The comment could not be sent.', true);
    } finally {
      if (submit) submit.disabled = false;
    }
  });
  $('studyco-people-results').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-search-people-results')?.addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-request-list').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-request-sort')?.addEventListener('click', (event) => {
    state.friendRequestSort = state.friendRequestSort === 'newest' ? 'oldest' : 'newest';
    const button = event.currentTarget;
    const list = $('studyco-request-list');
    const rows = [...list.querySelectorAll('.studyco-incoming-request')];
    rows.sort((a, b) => {
      const difference = Number(a.dataset.requestTime || 0) - Number(b.dataset.requestTime || 0);
      return state.friendRequestSort === 'oldest' ? difference : -difference;
    });
    const sentStart = list.querySelector('.studyco-sent-request-heading, .studyco-sent-request');
    rows.forEach((row) => list.insertBefore(row, sentStart));
    button.setAttribute('aria-label', 'Sort friend requests, ' + state.friendRequestSort + ' first. Activate to reverse order.');
    button.title = state.friendRequestSort === 'newest' ? 'Newest requests first' : 'Oldest requests first';
  });
  $('studyco-suggestion-list').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-right-requests').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-right-suggestions').addEventListener('click', (event) => { const button = event.target.closest('[data-friend-action]'); if (button) handleFriendAction(button.dataset.uid, button.dataset.friendAction); });
  $('studyco-chat-list').addEventListener('click', (event) => { const archiveToggle = event.target.closest('[data-chat-archived-toggle]'); if (archiveToggle) { state.showArchivedChats = !state.showArchivedChats; renderChatList(); return; } const button = event.target.closest('[data-chat-uid]'); if (button) void openChat(button.dataset.chatUid); });
  $('studyco-chat-panel').addEventListener('submit', (event) => { if (event.target.id === 'studyco-chat-form') sendMessage(event); else if (event.target.id === 'studyco-chat-report-form') void submitChatReport(event); });
  $('studyco-chat-panel').addEventListener('change', (event) => {
    if (event.target.id === 'studyco-chat-file') $('studyco-chat-file-name').textContent = event.target.files[0]?.name || '';
  });
  $('studyco-chat-panel').addEventListener('input', (event) => {
    if (event.target.id !== 'studyco-chat-input') return;
    event.target.style.height = 'auto';
    event.target.style.height = Math.min(event.target.scrollHeight, 144) + 'px';
    scheduleChatViewportSync();
  });
  $('studyco-chat-panel').addEventListener('click', (event) => {
    const settingsToggle = event.target.closest('[data-chat-settings-toggle]');
    if (settingsToggle) { const menu = $('studyco-chat-settings-menu'); const opening = !!menu && menu.hidden; if (menu) menu.hidden = !opening; settingsToggle.setAttribute('aria-expanded', String(opening)); if (opening) menu.querySelector('[role=menuitem]')?.focus(); return; }
    const settingsAction = event.target.closest('[data-chat-action]');
    if (settingsAction) { closeChatSettingsMenu(); void handleChatSettingsAction(settingsAction.dataset.chatAction); return; }
    if (event.target.closest('[data-chat-report-cancel]')) { event.preventDefault(); closeChatReportDialog(); return; }
    if (!event.target.closest('.studyco-chat-settings')) closeChatSettingsMenu();
    if (event.target.closest('[data-chat-record-delete]')) { event.preventDefault(); discardChatVoiceRecording(); return; }
    if (event.target.closest('[data-chat-record-pause]')) { event.preventDefault(); toggleChatRecordingPause(); return; }
    if (event.target.closest('[data-chat-record-preview]')) { event.preventDefault(); replayChatRecordingPreview(); return; }
    if (event.target.closest('[data-chat-record-send]')) { event.preventDefault(); beginSendingChatRecording(state.chatRecordingSession); return; }
    const voicePlayButton = event.target.closest('[data-chat-voice-play]');
    if (voicePlayButton) {
      const currentAudio = voicePlayButton.closest('.studyco-voice-note')?.querySelector('.studyco-voice-note-audio');
      if (currentAudio) {
        if (currentAudio.paused) {
          document.querySelectorAll('.studyco-voice-note-audio').forEach((audio) => { if (audio !== currentAudio) audio.pause(); });
          currentAudio.play().catch((error) => toast(error.message || 'This voice message could not play.', true));
        } else currentAudio.pause();
      }
      return;
    }
    const voiceDownloadButton = event.target.closest('[data-chat-voice-download]');
    if (voiceDownloadButton) { event.preventDefault(); void downloadVoiceMessage(voiceDownloadButton); return; }
    if (event.target.closest('[data-chat-record]')) { event.preventDefault(); void toggleChatVoiceRecording(); return; }
    const callButton = event.target.closest('[data-start-call]');
    if (callButton) { void startCall(callButton.dataset.startCall, callButton.dataset.callKind || 'audio'); return; }
    if (event.target.closest('[data-call-history]')) { renderCallHistory(); openModal('studyco-call-history-modal'); }
  });
  $('studyco-chat-panel').addEventListener('click', (event) => { if (event.target.closest('[data-chat-back]')) closeChat(); });
  document.addEventListener('click', (event) => { if (!event.target.closest('.studyco-chat-settings')) closeChatSettingsMenu(); });
  $('studyco-call-accept').addEventListener('click', acceptIncomingCall); $('studyco-call-decline').addEventListener('click', declineCall);
  $('studyco-call-minimize').addEventListener('click', () => setCallMinimized(true));
  $('studyco-call-restore').addEventListener('click', () => setCallMinimized(false));
  $('studyco-call-minimized-end').addEventListener('click', () => { void declineCall(); });
  document.addEventListener('visibilitychange', resumeCallMedia);
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
    remoteAudio.volume = 1;
    remoteAudio.play()
      .then(() => showRemoteAudioUnlock(false))
      .catch(() => toast('The browser still blocked call audio. Check the site sound permission.', true));
    updateCallControls();
  });
  $('studyco-call-speaker').addEventListener('click', () => {
    state.callSpeakerOn = !state.callSpeakerOn;
    if (!isNativeCallEnvironment()) state.speakerOn = state.callSpeakerOn;
    setNativeCallSpeaker(state.callSpeakerOn);
    const remoteAudio = $('studyco-call-remote-audio');
    if (remoteAudio) {
      remoteAudio.muted = !state.speakerOn;
      remoteAudio.volume = 1;
    }
    updateCallControls();
  });
  $('studyco-call-translation-toggle').addEventListener('change', (event) => toggleVoiceTranslation(event.target.checked));
  $('studyco-call-language').addEventListener('change', () => {
    state.translation.language = $('studyco-call-language').value;
    if (state.translation.enabled) startVoiceTranslation();
  });
  $('studyco-logout').addEventListener('click', async () => { await setPresence(false); await signOut(auth); });
}

function previewFile(file, targetId) {
  if (!file) return;
  if (!file.type.startsWith('image/')) { toast('Only image attachments are allowed.', true); return; }
  const target = $(targetId);
  if (!target) return;
  let image = target.querySelector('img');
  if (!image) {
    image = document.createElement('img');
    target.prepend(image);
  }
  image.src = URL.createObjectURL(file);
  image.alt = 'Selected image';
  const caption = target.querySelector('[data-upload-caption]');
  if (caption) caption.textContent = 'Change image';
}

function renderUploadPreview(targetId, url, emptyText) {
  const target = $(targetId);
  if (!target) return;
  let image = target.querySelector('img');
  if (url) {
    if (!image) {
      image = document.createElement('img');
      target.prepend(image);
    }
    image.src = url;
    image.alt = 'Current profile image';
  } else if (image) {
    image.remove();
  }
  let caption = target.querySelector('[data-upload-caption]');
  if (!caption) {
    caption = target.querySelector('span');
    if (caption) caption.dataset.uploadCaption = '';
  }
  if (!caption) {
    caption = document.createElement('span');
    caption.dataset.uploadCaption = '';
    target.append(caption);
  }
  caption.textContent = url ? 'Change image' : emptyText;
}

function toggleRelationshipNameField() {
  const status = $('studyco-edit-marital-status')?.value;
  const field = $('studyco-relationship-name-field');
  const input = $('studyco-edit-relationship-name');
  const required = status === 'Engaged' || status === 'In a relationship';
  if (field) field.hidden = !required;
  if (input) {
    input.required = required;
    if (!required) input.value = '';
  }
}

function fillEditForm() {
  const p = state.profile || {};
  const gender = String(p.gender || '').trim().toLowerCase();
  const genderValue = gender === 'm' || gender === 'male' ? 'Male' : gender === 'f' || gender === 'female' ? 'Female' : gender === 'non-binary' || gender === 'nonbinary' ? 'Non-binary' : gender === 'prefer not to say' ? 'Prefer not to say' : '';
  const marital = String(p.maritalStatus || '').trim().toLowerCase();
  const maritalValue = marital === 'single' ? 'Single' : marital === 'in a relationship' || marital === 'in_relationship' ? 'In a relationship' : marital === 'engaged' ? 'Engaged' : marital === 'married' ? 'Married' : marital === 'divorced' ? 'Divorced' : '';
  $('studyco-edit-name').value = p.displayName || ''; $('studyco-edit-contact').value = p.phone || '';
  $('studyco-edit-email').value = p.email || state.user?.email || '';
  $('studyco-edit-date-of-birth').value = p.dateOfBirth || '';
  $('studyco-edit-bio').value = p.bio || ''; $('studyco-edit-status').value = p.studentStatus || '';
  $('studyco-edit-address').value = p.address || '';
  $('studyco-edit-education-level').value = p.educationLevel || '';
  $('studyco-edit-education-status').value = p.educationStatus || '';
  $('studyco-edit-school').value = p.school || ''; $('studyco-edit-department').value = p.department || '';
  $('studyco-edit-major').value = p.major || ''; $('studyco-edit-gender').value = genderValue;
  $('studyco-edit-marital-status').value = maritalValue; $('studyco-edit-relationship-name').value = p.relationshipName || '';
  $('studyco-edit-location').value = p.location || '';
  toggleRelationshipNameField();
  renderUploadPreview('studyco-photo-preview', p.photoURL, 'Profile photo');
  renderUploadPreview('studyco-cover-preview', p.coverURL, 'Cover banner');
  $('studyco-profile-photo').value = '';
  $('studyco-cover-photo').value = '';
}

async function uploadProfileMedia(event, field, label) {
  const input = event.target;
  const file = input.files?.[0];
  if (!file) return;
  input.disabled = true;
  try {
    const url = await uploadImage(file, `studyco/${state.user.uid}/${field === 'photoURL' ? 'profile' : 'cover'}-${Date.now()}`);
    const update = { [field]: url, updatedAt: serverTimestamp() };
    await setDoc(doc(db, 'social_profiles', state.user.uid), update, { merge: true });
    state.profile = { ...state.profile, ...update, [field]: url };
    state.profiles.set(state.user.uid, state.profile);
    state.viewedProfile = state.profile;
    renderProfile();
    toast(`${label[0].toUpperCase()}${label.slice(1)} updated.`);
  } catch (error) {
    toast(error.message || `${label} could not be updated.`, true);
  } finally {
    input.disabled = false;
    input.value = '';
  }
}

async function saveProfile(event) {
  event.preventDefault();
  if (!state.user || (state.activeView === 'profile' && state.viewedProfileUid && state.viewedProfileUid !== state.user.uid)) { toast('You can only edit your own profile.', true); return; }
  try {
    const phone = $('studyco-edit-contact').value.trim();
    const email = $('studyco-edit-email').value.trim().toLowerCase();
    const maritalStatus = $('studyco-edit-marital-status').value.trim();
    const relationshipName = $('studyco-edit-relationship-name').value.trim();
    if (!phone) { toast('Phone number is required.', true); $('studyco-edit-contact').focus(); return; }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address.', true); $('studyco-edit-email').focus(); return; }
    if (['Engaged', 'In a relationship'].includes(maritalStatus) && !relationshipName) { toast('Add the person’s name for this marital status.', true); $('studyco-edit-relationship-name').focus(); return; }
    const update = {
      displayName: $('studyco-edit-name').value.trim(),
      phone,
      email,
      dateOfBirth: $('studyco-edit-date-of-birth').value,
      bio: $('studyco-edit-bio').value.trim(),
      address: $('studyco-edit-address').value.trim(),
      studentStatus: $('studyco-edit-status').value.trim(),
      educationLevel: $('studyco-edit-education-level').value.trim(),
      educationStatus: $('studyco-edit-education-status').value.trim(),
      school: $('studyco-edit-school').value.trim(),
      department: $('studyco-edit-department').value.trim(),
      major: $('studyco-edit-major').value.trim(),
      gender: $('studyco-edit-gender').value.trim(),
      maritalStatus,
      relationshipName: ['Engaged', 'In a relationship'].includes(maritalStatus) ? relationshipName : '',
      location: $('studyco-edit-location').value.trim(),
      updatedAt: serverTimestamp()
    };
    const photo = $('studyco-profile-photo')?.files?.[0]; const cover = $('studyco-cover-photo')?.files?.[0];
    if (photo) update.photoURL = await uploadImage(photo, `studyco/${state.user.uid}/profile-${Date.now()}`);
    if (cover) update.coverURL = await uploadImage(cover, `studyco/${state.user.uid}/cover-${Date.now()}`);
    await setDoc(doc(db, 'social_profiles', state.user.uid), update, { merge: true }); state.profile = { ...state.profile, ...update }; state.profiles.set(state.user.uid, state.profile); state.viewedProfile = state.profile; renderProfile(); closeModal('studyco-edit-modal'); toast('Profile updated.');
  } catch (error) { toast(error.message || 'Profile could not be updated.', true); }
}

window.openStudyCoProfileEditor = function openStudyCoProfileEditor(focusInputId) {
  if (!state.user || (state.activeView === 'profile' && state.viewedProfileUid && state.viewedProfileUid !== state.user.uid)) return;
  fillEditForm();
  openModal('studyco-edit-modal');
  if (focusInputId) setTimeout(() => $(focusInputId)?.focus(), 0);
};

async function bootApp() {
  /* Show the native app shell before profile and social-list reads finish. */
  showApp();
  renderProfile();
  const profileReady = ensureProfile(state.user).then((profile) => {
    state.viewedProfile = profile;
    renderProfile();
    return profile;
  });
  const preferencesReady = loadPostPreferences().then(() => renderFeed());
  try { state.dismissedSuggestions = new Set(JSON.parse(localStorage.getItem(`studyco-dismissed-suggestions:${state.user.uid}`) || '[]')); } catch (_) {}
  startPresence(); subscribeFeed(); subscribeStories(); subscribeNotifications(); listenForCalls(); subscribeCallHistory(); loadPeople(); loadChats();
  await Promise.allSettled([profileReady, preferencesReady, loadSocialLists()]);
  await syncRoute();
  refreshNavCounts();
}

wire();
window.onAqsAuthChange(async (user) => {
  if (!user || user.isAnonymous) {
    if (state.user) setPresence(false);
    stopPresenceHeartbeat(); stopPresenceWatchers();
    clearUserChatState();
    state.user = null; showAuth(); return;
  }
  if (state.user && state.user.uid !== user.uid) clearUserChatState();
  state.user = user;
  try { await bootApp(); } catch (error) { toast(error.message || 'StudyCo Meet could not load.', true); }
});