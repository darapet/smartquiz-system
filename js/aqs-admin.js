/* ============================================================
   XZILY AI — Admin Panel JS
   Locked to: daramolapeter98@gmail.com ONLY
   All other users are immediately redirected out.
   ============================================================ */

const ADMIN_EMAIL = 'daramolapeter98@gmail.com';

import {
    getAuth, onAuthStateChanged, signOut
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    getFirestore, collection, doc, getDoc, getDocs, updateDoc, deleteDoc,
    setDoc, addDoc, query, orderBy, where, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';

const firebaseConfig = {
    apiKey: "AIzaSyCFVx82QXdKdufbUIHBBOOzDefNoFBYxtY",
    authDomain: "smartquiz-darapet.firebaseapp.com",
    databaseURL: "https://smartquiz-darapet-default-rtdb.firebaseio.com",
    projectId: "smartquiz-darapet",
    storageBucket: "smartquiz-darapet.firebasestorage.app",
    messagingSenderId: "915234258423",
    appId: "1:915234258423:web:0c8fc183e9e3ce0852c2f2"
};

const app  = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ── Safe event-bind helper (prevents null crash on missing elements) ── */
function bind(id, evt, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
}

/* ── Auth guard ── */
/* Timeout fallback: if Firebase auth takes >10s, show sign-in button */
var _authResolved = false;
var _authFallback = setTimeout(function() {
    if (!_authResolved) showGate('not-logged-in');
}, 10000);

onAuthStateChanged(auth, async function(user) {
    _authResolved = true;
    clearTimeout(_authFallback);
    if (!user) {
        showGate('not-logged-in');
        return;
    }
    if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        await signOut(auth);
        showGate('not-admin');
        return;
    }
    /* Verified admin */
    try {
        document.getElementById('admin-gate').style.display    = 'none';
        document.getElementById('admin-panel').style.display   = 'block';
        document.getElementById('admin-email-badge').textContent = user.email;
        await loadDashboardStats();
        loadSection('quizzes');
    } catch(e) {
        console.error('[Admin] Panel init error:', e);
    }
});

function showGate(type) {
    document.getElementById('admin-panel').style.display = 'none';
    var gate = document.getElementById('admin-gate');
    gate.style.display = 'flex';
    if (type === 'not-logged-in') {
        gate.innerHTML = '<div class="gate-box"><div class="gate-icon">🔒</div><h2>Admin Access</h2><p>You must be signed in with the admin account.</p><a href="login.html?redirect=admin.html" class="adm-btn adm-btn-primary">Sign In</a></div>';
    } else {
        gate.innerHTML = '<div class="gate-box"><div class="gate-icon">⛔</div><h2>Access Denied</h2><p>This panel is restricted to the site administrator only.</p><a href="index.html" class="adm-btn">Go Home</a></div>';
    }
}

/* ── Sidebar navigation ── */
var currentSection = 'quizzes';
document.querySelectorAll('.adm-nav-link').forEach(function(link) {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        var section = this.dataset.section;
        document.querySelectorAll('.adm-nav-link').forEach(function(l) { l.classList.remove('active'); });
        this.classList.add('active');
        document.querySelectorAll('.adm-section').forEach(function(s) { s.style.display = 'none'; });
        var secEl = document.getElementById('section-' + section);
        if (secEl) secEl.style.display = 'block';
        currentSection = section;
        var titles = { quizzes:'All Quizzes', users:'All Users', attempts:'Quiz Results', ads:'Ads Management', notifs:'Notifications', deleted:'Deleted Quizzes Archive', hosts:'Host Activity' };
        var titleEl = document.getElementById('adm-section-title');
        if (titleEl && titles[section]) titleEl.textContent = titles[section];
        loadSection(section);
    });
});

bind('adm-logout-btn', 'click', async function() {
    await signOut(auth);
    window.location.href = 'login.html';
});

function loadSection(section) {
    switch(section) {
        case 'quizzes':   loadQuizzes();        break;
        case 'users':     loadUsers();          break;
        case 'attempts':  loadAttempts();       break;
        case 'ads':       loadAds();            break;
        case 'notifs':    loadNotifications();  break;
        case 'deleted':   loadDeletedQuizzes(); break;
        case 'hosts':     loadHostActivity();   break;
    }
}

/* ─────────────────────────────────────────────
   DASHBOARD STATS
───────────────────────────────────────────── */
async function loadDashboardStats() {
    try {
        var [quizzesSnap, usersSnap, attemptsSnap] = await Promise.all([
            getDocs(collection(db, 'quizzes')),
            getDocs(collection(db, 'users')),
            getDocs(collection(db, 'attempts'))
        ]);
        document.getElementById('stat-quizzes').textContent  = quizzesSnap.size;
        document.getElementById('stat-users').textContent    = usersSnap.size;
        document.getElementById('stat-attempts').textContent = attemptsSnap.size;

        var published = quizzesSnap.docs.filter(function(d) { return d.data().status === 'published'; }).length;
        document.getElementById('stat-published').textContent = published;
    } catch(e) {
        console.error('Stats error:', e);
    }
}

/* ─────────────────────────────────────────────
   QUIZZES
───────────────────────────────────────────── */
async function loadQuizzes() {
    var container = document.getElementById('quizzes-list');
    container.innerHTML = '<div class="adm-loading">Loading quizzes…</div>';

    try {
        var snap = await getDocs(query(collection(db, 'quizzes'), orderBy('created_at', 'desc')));

        if (snap.empty) { container.innerHTML = '<div class="adm-empty">No quizzes yet.</div>'; return; }

        /* Get unique host UIDs */
        var hostUids = [...new Set(snap.docs.map(function(d) { return d.data().host_uid; }))];
        var hostNames = {};
        await Promise.all(hostUids.map(async function(uid) {
            if (!uid) return;
            try {
                var uSnap = await getDoc(doc(db, 'users', uid));
                hostNames[uid] = uSnap.exists() ? (uSnap.data().name || uSnap.data().email || uid) : uid;
            } catch(_) { hostNames[uid] = uid; }
        }));

        var html = '<table class="adm-table"><thead><tr><th>Title</th><th>Host</th><th>Questions</th><th>Status</th><th>Token</th><th>Actions</th></tr></thead><tbody>';
        snap.docs.forEach(function(d) {
            var q = d.data();
            var statusCls = q.status === 'published' ? 'adm-badge-green' : 'adm-badge-yellow';
            var hostCls   = q.host_status === 'disabled' ? ' adm-badge-red' : '';
            var hostName  = hostNames[q.host_uid] || 'Unknown';
            var numQ      = q.num_questions || (q.questions || []).length;
            html += '<tr>' +
                '<td><strong>' + esc(q.title) + '</strong><br><small style="color:#94a3b8">' + esc(q.subject) + '</small></td>' +
                '<td>' + esc(hostName) + '</td>' +
                '<td>' + numQ + '</td>' +
                '<td><span class="adm-badge ' + statusCls + '">' + (q.status || 'draft') + '</span>' +
                    (q.host_status === 'disabled' ? ' <span class="adm-badge adm-badge-red">disabled</span>' : '') + '</td>' +
                '<td><code style="font-size:.75rem">' + esc(q.quiz_token || '—') + '</code></td>' +
                '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button class="adm-btn adm-btn-sm" onclick="adminToggleQuiz(\'' + d.id + '\',\'' + q.status + '\')">Toggle Status</button>' +
                    '<button class="adm-btn adm-btn-sm adm-btn-danger" onclick="adminDeleteQuiz(\'' + d.id + '\',\'' + esc(q.title) + '\')">Delete</button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="adm-error">Error loading quizzes: ' + esc(e.message) + '</div>';
    }
}

window.adminToggleQuiz = async function(quizId, currentStatus) {
    var newStatus = currentStatus === 'published' ? 'draft' : 'published';
    try {
        await updateDoc(doc(db, 'quizzes', quizId), { status: newStatus, updated_at: serverTimestamp() });
        loadQuizzes();
        loadDashboardStats();
    } catch(e) { alert('Error: ' + e.message); }
};

window.adminDeleteQuiz = async function(quizId, title) {
    if (!confirm('Delete quiz "' + title + '"?\n\nThis archives the quiz then removes it permanently.')) return;
    try {
        /* Archive quiz data before deleting */
        var qSnap = await getDoc(doc(db, 'quizzes', quizId));
        if (qSnap.exists()) {
            var qData = qSnap.data();
            var hostName = 'Unknown';
            try { var uSnap = await getDoc(doc(db, 'users', qData.host_uid||'')); if (uSnap.exists()) hostName = uSnap.data().name || uSnap.data().email || qData.host_uid; } catch(_) {}
            var aSnap = await getDocs(query(collection(db, 'attempts'), where('quiz_id', '==', quizId)));
            var attArchive = aSnap.docs.map(function(d) {
                var a = d.data();
                return { id: d.id, participant_name: a.participant_name || 'Anonymous', score: a.score, total: a.total, finished_at: a.finished_at && a.finished_at.toDate ? a.finished_at.toDate().toISOString().replace('T',' ').substring(0,19) : String(a.finished_at||'') };
            });
            await addDoc(collection(db, 'deleted_quizzes'), {
                original_id: quizId, deleted_by: 'admin', host_name: hostName, deleted_at: serverTimestamp(),
                title: qData.title||'', subject: qData.subject||'', num_questions: qData.num_questions||(qData.questions||[]).length,
                status: qData.status||'draft', mode: qData.mode||'exam', quiz_token: qData.quiz_token||'',
                total_attempts: attArchive.length, attempts: attArchive
            });
            await Promise.all(aSnap.docs.map(function(d) { return deleteDoc(doc(db, 'attempts', d.id)); }));
        }
        await deleteDoc(doc(db, 'quizzes', quizId));
        loadQuizzes();
        loadDashboardStats();
    } catch(e) { alert('Error deleting: ' + e.message); }
};

/* ─────────────────────────────────────────────
   USERS
───────────────────────────────────────────── */
async function loadUsers() {
    var container = document.getElementById('users-list');
    container.innerHTML = '<div class="adm-loading">Loading users…</div>';
    try {
        var snap = await getDocs(query(collection(db, 'users'), orderBy('created_at', 'desc')));
        if (snap.empty) { container.innerHTML = '<div class="adm-empty">No users yet.</div>'; return; }

        var html = '<table class="adm-table"><thead><tr><th>Name</th><th>Username</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>';
        snap.docs.forEach(function(d) {
            var u = d.data();
            var roleCls = u.role === 'admin' ? 'adm-badge-purple' : (u.role === 'host' ? 'adm-badge-blue' : 'adm-badge-gray');
            var statusCls = u.status === 'active' ? 'adm-badge-green' : 'adm-badge-red';
            html += '<tr>' +
                '<td><strong>' + esc(u.name || '—') + '</strong></td>' +
                '<td>' + esc(u.username || '—') + '</td>' +
                '<td>' + esc(u.email || '—') + '</td>' +
                '<td><span class="adm-badge ' + roleCls + '">' + esc(u.role || 'student') + '</span></td>' +
                '<td><span class="adm-badge ' + statusCls + '">' + esc(u.status || 'active') + '</span></td>' +
                '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<select class="adm-select-sm" onchange="adminSetRole(\'' + d.id + '\',this.value)">' +
                        '<option value="">Change role…</option>' +
                        '<option value="student">Student</option>' +
                        '<option value="teacher">Teacher</option>' +
                        '<option value="host">Host</option>' +
                        '<option value="admin">Admin</option>' +
                    '</select>' +
                    '<button class="adm-btn adm-btn-sm adm-btn-' + (u.status === 'active' ? 'warn' : 'success') + '" ' +
                        'onclick="adminToggleUser(\'' + d.id + '\',\'' + (u.status || 'active') + '\')">' +
                        (u.status === 'active' ? 'Suspend' : 'Activate') +
                    '</button>' +
                    '<button class="adm-btn adm-btn-sm adm-btn-danger" onclick="adminDeleteUser(\'' + d.id + '\',\'' + esc(u.name || u.email) + '\')">Delete</button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="adm-error">Error: ' + esc(e.message) + '</div>';
    }
}

window.adminSetRole = async function(uid, role) {
    if (!role) return;
    if (!confirm('Change this user\'s role to "' + role + '"?')) return;
    try {
        await updateDoc(doc(db, 'users', uid), { role: role });
        loadUsers();
    } catch(e) { alert('Error: ' + e.message); }
};

window.adminToggleUser = async function(uid, currentStatus) {
    var newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try {
        await updateDoc(doc(db, 'users', uid), { status: newStatus });
        loadUsers();
    } catch(e) { alert('Error: ' + e.message); }
};

window.adminDeleteUser = async function(uid, name) {
    if (!confirm('Delete user "' + name + '"? This cannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'users', uid));
        loadUsers();
        loadDashboardStats();
    } catch(e) { alert('Error: ' + e.message); }
};

/* ─────────────────────────────────────────────
   ATTEMPTS
───────────────────────────────────────────── */
async function loadAttempts() {
    var container = document.getElementById('attempts-list');
    container.innerHTML = '<div class="adm-loading">Loading attempts…</div>';
    try {
        var snap = await getDocs(query(collection(db, 'attempts'), orderBy('finished_at', 'desc'), limit(100)));
        if (snap.empty) { container.innerHTML = '<div class="adm-empty">No attempts yet.</div>'; return; }

        /* Get quiz titles */
        var quizIds = [...new Set(snap.docs.map(function(d) { return d.data().quiz_id; }).filter(Boolean))];
        var quizTitles = {};
        await Promise.all(quizIds.map(async function(qid) {
            try {
                var qSnap = await getDoc(doc(db, 'quizzes', qid));
                quizTitles[qid] = qSnap.exists() ? qSnap.data().title : qid;
            } catch(_) { quizTitles[qid] = qid; }
        }));

        var html = '<table class="adm-table"><thead><tr><th>Participant</th><th>Quiz</th><th>Score</th><th>Date</th><th>Actions</th></tr></thead><tbody>';
        snap.docs.forEach(function(d) {
            var a = d.data();
            var pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
            var scoreCls = pct >= 70 ? 'adm-badge-green' : (pct >= 40 ? 'adm-badge-yellow' : 'adm-badge-red');
            var date = '';
            if (a.finished_at && a.finished_at.toDate) date = a.finished_at.toDate().toLocaleDateString();
            html += '<tr>' +
                '<td><strong>' + esc(a.participant_name || 'Anonymous') + '</strong></td>' +
                '<td>' + esc(quizTitles[a.quiz_id] || '—') + '</td>' +
                '<td><span class="adm-badge ' + scoreCls + '">' + a.score + '/' + a.total + ' (' + pct + '%)</span></td>' +
                '<td>' + date + '</td>' +
                '<td><button class="adm-btn adm-btn-sm adm-btn-danger" onclick="adminDeleteAttempt(\'' + d.id + '\')">Delete</button></td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="adm-error">Error: ' + esc(e.message) + '</div>';
    }
}

window.adminDeleteAttempt = async function(attemptId) {
    if (!confirm('Delete this attempt record?')) return;
    try {
        await deleteDoc(doc(db, 'attempts', attemptId));
        loadAttempts();
        loadDashboardStats();
    } catch(e) { alert('Error: ' + e.message); }
};

/* ─────────────────────────────────────────────
   ADS MANAGEMENT
───────────────────────────────────────────── */
async function loadAds() {
    var container = document.getElementById('ads-list');
    container.innerHTML = '<div class="adm-loading">Loading ads…</div>';
    try {
        var snap = await getDocs(collection(db, 'ads'));
        if (snap.empty) { container.innerHTML = '<div class="adm-empty">No ads yet. Add one below.</div>'; return; }

        var html = '<table class="adm-table"><thead><tr><th>Title</th><th>Image URL</th><th>Link</th><th>Active</th><th>Actions</th></tr></thead><tbody>';
        snap.docs.forEach(function(d) {
            var a = d.data();
            html += '<tr>' +
                '<td><strong>' + esc(a.title || '—') + '</strong></td>' +
                '<td><a href="' + esc(a.image_url || '') + '" target="_blank" style="font-size:.75rem">' + (a.image_url ? 'View Image' : '—') + '</a></td>' +
                '<td><a href="' + esc(a.link_url || '') + '" target="_blank" style="font-size:.75rem">' + (a.link_url ? 'Visit Link' : '—') + '</a></td>' +
                '<td><span class="adm-badge ' + (a.active ? 'adm-badge-green' : 'adm-badge-gray') + '">' + (a.active ? 'Active' : 'Inactive') + '</span></td>' +
                '<td style="display:flex;gap:6px">' +
                    '<button class="adm-btn adm-btn-sm" onclick="adminToggleAd(\'' + d.id + '\',' + !!a.active + ')">' + (a.active ? 'Deactivate' : 'Activate') + '</button>' +
                    '<button class="adm-btn adm-btn-sm adm-btn-danger" onclick="adminDeleteAd(\'' + d.id + '\')">Delete</button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="adm-error">Error: ' + esc(e.message) + '</div>';
    }
}

bind('adm-add-ad-btn', 'click', async function() {
    var title     = document.getElementById('ad-title').value.trim();
    var imageUrl  = document.getElementById('ad-image-url').value.trim();
    var linkUrl   = document.getElementById('ad-link-url').value.trim();
    var adType    = document.getElementById('ad-type').value;
    if (!title || !imageUrl) { alert('Title and Image URL are required.'); return; }
    try {
        await addDoc(collection(db, 'ads'), {
            title: title, image_url: imageUrl, link_url: linkUrl,
            type: adType, active: true, created_at: serverTimestamp()
        });
        document.getElementById('ad-title').value = '';
        document.getElementById('ad-image-url').value = '';
        document.getElementById('ad-link-url').value = '';
        loadAds();
    } catch(e) { alert('Error adding ad: ' + e.message); }
});

window.adminToggleAd = async function(adId, currentActive) {
    try {
        await updateDoc(doc(db, 'ads', adId), { active: !currentActive });
        loadAds();
    } catch(e) { alert('Error: ' + e.message); }
};

window.adminDeleteAd = async function(adId) {
    if (!confirm('Delete this ad?')) return;
    try {
        await deleteDoc(doc(db, 'ads', adId));
        loadAds();
    } catch(e) { alert('Error: ' + e.message); }
};

/* ─────────────────────────────────────────────
   NOTIFICATIONS (Countdown + Ticker)
───────────────────────────────────────────── */
async function loadNotifications() {
    try {
        var snap = await getDoc(doc(db, 'settings', 'notifications'));
        var cfg  = snap.exists() ? snap.data() : {};
        var cd   = cfg.countdown || {};
        var tk   = cfg.ticker    || {};

        document.getElementById('notif-cd-enabled').checked  = !!cd.enabled;
        document.getElementById('notif-cd-label').value       = cd.label   || '';
        document.getElementById('notif-cd-target').value      = cd.target  || '';
        document.getElementById('notif-cd-bg').value          = cd.bg      || '#1e1b4b';
        document.getElementById('notif-cd-color').value       = cd.color   || '#ffffff';
        document.getElementById('notif-cd-accent').value      = cd.accent  || '#6366f1';

        document.getElementById('notif-tk-enabled').checked   = !!tk.enabled;
        document.getElementById('notif-tk-label').value       = tk.label   || '';
        document.getElementById('notif-tk-text').value        = tk.text    || '';
        document.getElementById('notif-tk-speed').value       = tk.speed   || '40';
        document.getElementById('notif-tk-bg').value          = tk.bg      || '#1e1b4b';
        document.getElementById('notif-tk-color').value       = tk.color   || '#ffffff';
    } catch(e) {
        console.error('Notif load error:', e);
    }
}

bind('adm-save-notifs-btn', 'click', async function() {
    var cfg = {
        countdown: {
            enabled: document.getElementById('notif-cd-enabled').checked,
            label:   document.getElementById('notif-cd-label').value.trim(),
            target:  document.getElementById('notif-cd-target').value.trim(),
            bg:      document.getElementById('notif-cd-bg').value,
            color:   document.getElementById('notif-cd-color').value,
            accent:  document.getElementById('notif-cd-accent').value
        },
        ticker: {
            enabled: document.getElementById('notif-tk-enabled').checked,
            label:   document.getElementById('notif-tk-label').value.trim(),
            text:    document.getElementById('notif-tk-text').value.trim(),
            speed:   parseInt(document.getElementById('notif-tk-speed').value) || 40,
            bg:      document.getElementById('notif-tk-bg').value,
            color:   document.getElementById('notif-tk-color').value
        }
    };
    try {
        await setDoc(doc(db, 'settings', 'notifications'), cfg);
        document.getElementById('adm-notif-save-msg').style.display = 'inline';
        setTimeout(function() { document.getElementById('adm-notif-save-msg').style.display = 'none'; }, 3000);
    } catch(e) { alert('Error saving: ' + e.message); }
});


/* ─────────────────────────────────────────────
   DELETED QUIZZES (Archive / Restore)
───────────────────────────────────────────── */
async function loadDeletedQuizzes() {
    var container = document.getElementById('deleted-list');
    if (!container) return;
    container.innerHTML = '<div class="adm-loading">Loading deleted quizzes…</div>';
    try {
        var snap = await getDocs(query(
            collection(db, 'deleted_quizzes'),
            orderBy('deleted_at', 'desc'),
            limit(200)
        ));
        if (snap.empty) {
            container.innerHTML = '<div class="adm-empty">No deleted quizzes in archive.</div>';
            return;
        }
        var html = '<table class="adm-table"><thead><tr>' +
            '<th>Title</th><th>Host</th><th>Questions</th>' +
            '<th>Attempts</th><th>Mode</th><th>Deleted</th><th>Actions</th>' +
            '</tr></thead><tbody>';
        snap.docs.forEach(function(d) {
            var q = d.data();
            var deletedAt = '';
            try {
                deletedAt = q.deleted_at && q.deleted_at.toDate
                    ? q.deleted_at.toDate().toISOString().replace('T',' ').substring(0,16)
                    : String(q.deleted_at || '');
            } catch(_) {}
            html += '<tr>' +
                '<td><strong>' + esc(q.title || '—') + '</strong>' +
                '<br><small style="color:#94a3b8">' + esc(q.subject || '') + '</small></td>' +
                '<td>' + esc(q.host_name || 'Unknown') + '</td>' +
                '<td>' + (q.num_questions || 0) + '</td>' +
                '<td>' + (q.total_attempts || 0) + '</td>' +
                '<td><span class="adm-badge adm-badge-gray">' + esc(q.mode || 'exam') + '</span></td>' +
                '<td style="font-size:.75rem;color:#94a3b8">' + esc(deletedAt) + '</td>' +
                '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
                '<button class="adm-btn adm-btn-sm adm-btn-success" ' +
                'onclick="adminRestoreQuiz(\'' + d.id + '\',\'' + esc(q.title || '') + '\')">♻ Restore</button>' +
                '<button class="adm-btn adm-btn-sm adm-btn-danger" ' +
                'onclick="adminPermanentDelete(\'' + d.id + '\',\'' + esc(q.title || '') + '\')">🗑 Remove</button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="adm-error">Error loading deleted quizzes: ' + esc(e.message) + '</div>';
    }
}

window.adminRestoreQuiz = async function(deletedDocId, title) {
    if (!confirm('Restore quiz "' + title + '" back to active quizzes?')) return;
    try {
        var delSnap = await getDoc(doc(db, 'deleted_quizzes', deletedDocId));
        if (!delSnap.exists()) { alert('Archive record not found.'); return; }
        var q = delSnap.data();
        var restoreData = {
            title: q.title || '', subject: q.subject || '',
            num_questions: q.num_questions || 0, status: 'draft',
            mode: q.mode || 'exam', quiz_token: q.quiz_token || '',
            quiz_url: q.quiz_url || '', custom_form: q.custom_form || [],
            restored_at: serverTimestamp(), created_at: serverTimestamp()
        };
        if (q.original_id) {
            await setDoc(doc(db, 'quizzes', q.original_id), restoreData, { merge: true });
        } else {
            await addDoc(collection(db, 'quizzes'), restoreData);
        }
        await deleteDoc(doc(db, 'deleted_quizzes', deletedDocId));
        loadDeletedQuizzes();
        loadDashboardStats();
        alert('Quiz "' + title + '" restored as a draft.');
    } catch(e) { alert('Restore error: ' + e.message); }
};

window.adminPermanentDelete = async function(deletedDocId, title) {
    if (!confirm('Permanently remove "' + title + '" from archive?\n\nCannot be undone.')) return;
    try {
        await deleteDoc(doc(db, 'deleted_quizzes', deletedDocId));
        loadDeletedQuizzes();
        alert('Removed from archive.');
    } catch(e) { alert('Error: ' + e.message); }
};

/* ─────────────────────────────────────────────
   SEARCH / FILTER
───────────────────────────────────────────── */
bind('adm-quiz-search', 'input', function() {
    var q = this.value.toLowerCase();
    document.querySelectorAll('#quizzes-list tbody tr').forEach(function(row) {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
});

bind('adm-user-search', 'input', function() {
    var q = this.value.toLowerCase();
    document.querySelectorAll('#users-list tbody tr').forEach(function(row) {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
});

var delSearch = document.getElementById('adm-deleted-search');
if (delSearch) {
    delSearch.addEventListener('input', function() {
        var q = this.value.toLowerCase();
        document.querySelectorAll('#deleted-list tbody tr').forEach(function(row) {
            row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
}


/* ─────────────────────────────────────────────
   HOST ACTIVITY
───────────────────────────────────────────── */
async function loadHostActivity() {
    var container = document.getElementById('hosts-list');
    if (!container) return;
    container.innerHTML = '<div class="adm-loading">Loading host activity…</div>';
    try {
        /* Get all quizzes grouped by host */
        var [quizSnap, attemptSnap] = await Promise.all([
            getDocs(query(collection(db, 'quizzes'), orderBy('created_at', 'desc'))),
            getDocs(collection(db, 'attempts'))
        ]);
        if (quizSnap.empty) {
            container.innerHTML = '<div class="adm-empty">No host quiz activity yet.</div>';
            return;
        }
        /* Aggregate by host email */
        var hosts = {};
        quizSnap.docs.forEach(function(d) {
            var q = d.data();
            var email = q.host_email || q.created_by || 'Unknown';
            if (!hosts[email]) hosts[email] = { name: q.host_name || email, email: email, quizzes: 0, attempts: 0, lastActive: null };
            hosts[email].quizzes++;
            if (q.created_at) {
                var t = q.created_at.toDate ? q.created_at.toDate() : new Date(q.created_at);
                if (!hosts[email].lastActive || t > hosts[email].lastActive) hosts[email].lastActive = t;
            }
        });
        attemptSnap.docs.forEach(function(d) {
            var a = d.data();
            var email = a.host_email || '';
            if (email && hosts[email]) hosts[email].attempts++;
        });

        var rows = Object.values(hosts).sort(function(a,b) { return b.quizzes - a.quizzes; });
        var html = '<table class="adm-table"><thead><tr>'
            + '<th>Host</th><th>Email</th><th>Quizzes</th><th>Attempts</th><th>Last Active</th>'
            + '</tr></thead><tbody>';
        rows.forEach(function(h) {
            var lastActive = h.lastActive ? h.lastActive.toISOString().replace('T',' ').substring(0,16) : '—';
            html += '<tr>'
                + '<td><strong>' + esc(h.name) + '</strong></td>'
                + '<td>' + esc(h.email) + '</td>'
                + '<td><span class="adm-badge adm-badge-green">' + h.quizzes + '</span></td>'
                + '<td>' + h.attempts + '</td>'
                + '<td style="font-size:.75rem;color:#94a3b8">' + esc(lastActive) + '</td>'
                + '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="adm-error">Error: ' + esc(e.message) + '</div>';
    }
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
