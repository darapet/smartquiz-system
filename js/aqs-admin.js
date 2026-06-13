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

/* ── Tracks which deleted-quiz docs have been printed/exported ── */
var _printedDocs = new Set();

/* ── Current quiz data loaded in the view modal ── */
var _currentViewData = null;

/* ── Safe event-bind helper ── */
function bind(id, evt, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener(evt, fn);
}

/* ── Auth guard ── */
var _authResolved = false;
var _authFallback = setTimeout(function() {
    if (!_authResolved) showGate('not-logged-in');
}, 10000);

onAuthStateChanged(auth, async function(user) {
    _authResolved = true;
    clearTimeout(_authFallback);
    if (!user) { showGate('not-logged-in'); return; }
    if (user.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
        await signOut(auth);
        showGate('not-admin');
        return;
    }
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

        var hostUids = [...new Set(snap.docs.map(function(d) { return d.data().host_uid; }))];
        var hostNames = {};
        await Promise.all(hostUids.map(async function(uid) {
            if (!uid) return;
            try {
                var uSnap = await getDoc(doc(db, 'users', uid));
                hostNames[uid] = uSnap.exists() ? (uSnap.data().name || uSnap.data().email || uid) : uid;
            } catch(_) { hostNames[uid] = uid; }
        }));

        /* Populate year filter */
        var years = new Set();
        snap.docs.forEach(function(d) {
            var ca = d.data().created_at;
            if (ca && ca.toDate) years.add(ca.toDate().getFullYear());
        });
        populateDateFilter('adm-quiz-year', years);

        var html = '<table class="adm-table"><thead><tr><th>Title</th><th>Host</th><th>Questions</th><th>Status</th><th>Created</th><th>Token</th><th>Actions</th></tr></thead><tbody>';
        snap.docs.forEach(function(d) {
            var q = d.data();
            var statusCls = q.status === 'published' ? 'adm-badge-green' : 'adm-badge-yellow';
            var hostName  = hostNames[q.host_uid] || 'Unknown';
            var numQ      = q.num_questions || (q.questions || []).length;
            var dt = q.created_at && q.created_at.toDate ? q.created_at.toDate() : null;
            var createdStr = dt ? dt.toLocaleDateString() : '—';
            var yr  = dt ? dt.getFullYear() : '';
            var mon = dt ? (dt.getMonth()+1) : '';
            var day = dt ? dt.getDate() : '';
            html += '<tr data-year="' + yr + '" data-month="' + mon + '" data-day="' + day + '">' +
                '<td><strong>' + esc(q.title) + '</strong><br><small style="color:#94a3b8">' + esc(q.subject) + '</small></td>' +
                '<td>' + esc(hostName) + '</td>' +
                '<td>' + numQ + '</td>' +
                '<td><span class="adm-badge ' + statusCls + '">' + (q.status || 'draft') + '</span>' +
                    (q.host_status === 'disabled' ? ' <span class="adm-badge adm-badge-red">disabled</span>' : '') + '</td>' +
                '<td style="font-size:.75rem;color:#94a3b8">' + esc(createdStr) + '</td>' +
                '<td><code style="font-size:.75rem">' + esc(q.quiz_token || '—') + '</code></td>' +
                '<td style="display:flex;gap:6px;flex-wrap:wrap;">' +
                    '<button class="adm-btn adm-btn-sm" onclick="adminToggleQuiz(\'' + d.id + '\',\'' + q.status + '\')">Toggle Status</button>' +
                    '<button class="adm-btn adm-btn-sm adm-btn-danger" onclick="adminDeleteQuiz(\'' + d.id + '\',\'' + esc(q.title) + '\')">Delete</button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
        applyQuizDateFilter();
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
        var qSnap = await getDoc(doc(db, 'quizzes', quizId));
        if (qSnap.exists()) {
            var qData = qSnap.data();
            var hostName = 'Unknown';
            try {
                var uSnap = await getDoc(doc(db, 'users', qData.host_uid||''));
                if (uSnap.exists()) hostName = uSnap.data().name || uSnap.data().email || qData.host_uid;
            } catch(_) {}
            var aSnap = await getDocs(query(collection(db, 'attempts'), where('quiz_id', '==', quizId)));
            /* Save FULL attempt data for the activity view */
            var attArchive = aSnap.docs.map(function(d) {
                var a = d.data();
                var copy = Object.assign({}, a);
                /* Serialize timestamps */
                ['finished_at','started_at','created_at'].forEach(function(k) {
                    if (copy[k] && copy[k].toDate) copy[k] = copy[k].toDate().toISOString().replace('T',' ').substring(0,19);
                });
                copy._doc_id = d.id;
                return copy;
            });
            await addDoc(collection(db, 'deleted_quizzes'), {
                original_id: quizId, deleted_by: 'admin', host_name: hostName,
                host_uid: qData.host_uid || '', host_email: qData.host_email || '',
                deleted_at: serverTimestamp(),
                title: qData.title||'', subject: qData.subject||'',
                num_questions: qData.num_questions||(qData.questions||[]).length,
                status: qData.status||'draft', mode: qData.mode||'exam',
                quiz_token: qData.quiz_token||'', quiz_url: qData.quiz_url||'',
                custom_form: qData.custom_form||[], questions: qData.questions||[],
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
            var roleCls   = u.role === 'admin' ? 'adm-badge-purple' : (u.role === 'host' ? 'adm-badge-blue' : 'adm-badge-gray');
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
    try { await updateDoc(doc(db, 'users', uid), { role: role }); loadUsers(); } catch(e) { alert('Error: ' + e.message); }
};

window.adminToggleUser = async function(uid, currentStatus) {
    var newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    try { await updateDoc(doc(db, 'users', uid), { status: newStatus }); loadUsers(); } catch(e) { alert('Error: ' + e.message); }
};

window.adminDeleteUser = async function(uid, name) {
    if (!confirm('Delete user "' + name + '"? This cannot be undone.')) return;
    try { await deleteDoc(doc(db, 'users', uid)); loadUsers(); loadDashboardStats(); } catch(e) { alert('Error: ' + e.message); }
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
    try { await deleteDoc(doc(db, 'attempts', attemptId)); loadAttempts(); loadDashboardStats(); } catch(e) { alert('Error: ' + e.message); }
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
    var title    = document.getElementById('ad-title').value.trim();
    var imageUrl = document.getElementById('ad-image-url').value.trim();
    var linkUrl  = document.getElementById('ad-link-url').value.trim();
    var adType   = document.getElementById('ad-type').value;
    if (!title || !imageUrl) { alert('Title and Image URL are required.'); return; }
    try {
        await addDoc(collection(db, 'ads'), { title: title, image_url: imageUrl, link_url: linkUrl, type: adType, active: true, created_at: serverTimestamp() });
        document.getElementById('ad-title').value = '';
        document.getElementById('ad-image-url').value = '';
        document.getElementById('ad-link-url').value = '';
        loadAds();
    } catch(e) { alert('Error adding ad: ' + e.message); }
});

window.adminToggleAd = async function(adId, currentActive) {
    try { await updateDoc(doc(db, 'ads', adId), { active: !currentActive }); loadAds(); } catch(e) { alert('Error: ' + e.message); }
};
window.adminDeleteAd = async function(adId) {
    if (!confirm('Delete this ad?')) return;
    try { await deleteDoc(doc(db, 'ads', adId)); loadAds(); } catch(e) { alert('Error: ' + e.message); }
};

/* ─────────────────────────────────────────────
   NOTIFICATIONS
───────────────────────────────────────────── */
async function loadNotifications() {
    try {
        var snap = await getDoc(doc(db, 'settings', 'notifications'));
        var cfg  = snap.exists() ? snap.data() : {};
        var cd = cfg.countdown || {}, tk = cfg.ticker || {};
        document.getElementById('notif-cd-enabled').checked = !!cd.enabled;
        document.getElementById('notif-cd-label').value      = cd.label  || '';
        document.getElementById('notif-cd-target').value     = cd.target || '';
        document.getElementById('notif-cd-bg').value         = cd.bg     || '#1e1b4b';
        document.getElementById('notif-cd-color').value      = cd.color  || '#ffffff';
        document.getElementById('notif-cd-accent').value     = cd.accent || '#6366f1';
        document.getElementById('notif-tk-enabled').checked  = !!tk.enabled;
        document.getElementById('notif-tk-label').value      = tk.label  || '';
        document.getElementById('notif-tk-text').value       = tk.text   || '';
        document.getElementById('notif-tk-speed').value      = tk.speed  || '40';
        document.getElementById('notif-tk-bg').value         = tk.bg     || '#1e1b4b';
        document.getElementById('notif-tk-color').value      = tk.color  || '#ffffff';
    } catch(e) { console.error('Notif load error:', e); }
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


/* ═══════════════════════════════════════════════════════════════
   DELETED QUIZZES — Archive / Restore / View / Export / Delete
═══════════════════════════════════════════════════════════════ */
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

        /* Populate year filter */
        var years = new Set();
        snap.docs.forEach(function(d) {
            var da = d.data().deleted_at;
            if (da && da.toDate) years.add(da.toDate().getFullYear());
        });
        populateDateFilter('adm-del-year', years);

        var html = '<table class="adm-table"><thead><tr>' +
            '<th>Title</th><th>Host</th><th>Questions</th>' +
            '<th>Attempts</th><th>Mode</th><th>Deleted</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        snap.docs.forEach(function(d) {
            var q = d.data();
            var deletedAt = '—';
            var yr = '', mon = '', day = '';
            try {
                if (q.deleted_at && q.deleted_at.toDate) {
                    var dt = q.deleted_at.toDate();
                    deletedAt = dt.toISOString().replace('T',' ').substring(0,16);
                    yr  = dt.getFullYear();
                    mon = dt.getMonth()+1;
                    day = dt.getDate();
                } else if (q.deleted_at) {
                    deletedAt = String(q.deleted_at);
                }
            } catch(_) {}

            html += '<tr data-year="' + yr + '" data-month="' + mon + '" data-day="' + day + '">' +
                '<td><strong>' + esc(q.title || '—') + '</strong>' +
                '<br><small style="color:#94a3b8">' + esc(q.subject || '') + '</small></td>' +
                '<td>' + esc(q.host_name || 'Unknown') + '</td>' +
                '<td>' + (q.num_questions || 0) + '</td>' +
                '<td>' + (q.total_attempts || 0) + '</td>' +
                '<td><span class="adm-badge adm-badge-gray">' + esc(q.mode || 'exam') + '</span></td>' +
                '<td style="font-size:.75rem;color:#94a3b8">' + esc(deletedAt) + '</td>' +
                '<td style="display:flex;gap:5px;flex-wrap:wrap;">' +
                    '<button class="adm-btn adm-btn-sm adm-btn-primary" ' +
                        'onclick="adminViewDeletedQuiz(\'' + d.id + '\')">👁 View</button>' +
                    '<button class="adm-btn adm-btn-sm adm-btn-success" ' +
                        'onclick="adminRestoreQuiz(\'' + d.id + '\',\'' + esc(q.title || '') + '\')">♻ Restore</button>' +
                    '<button class="adm-btn adm-btn-sm adm-btn-danger" ' +
                        'onclick="adminPermanentDelete(\'' + d.id + '\',\'' + esc(q.title || '') + '\')">🗑 Remove</button>' +
                '</td>' +
            '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
        applyDelDateFilter();
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

/* ── Permanent delete — requires print/export first ── */
window.adminPermanentDelete = async function(deletedDocId, title) {
    if (!_printedDocs.has(deletedDocId)) {
        alert('⚠️  You must View and Print (or Export) this quiz activity first before permanently deleting it.\n\nClick "👁 View" → then use 🖨️ Print or ⬇️ Export → then you can remove it.');
        return;
    }
    if (!confirm('Permanently remove "' + title + '" from archive?\n\nThis CANNOT be undone.')) return;
    try {
        await deleteDoc(doc(db, 'deleted_quizzes', deletedDocId));
        _printedDocs.delete(deletedDocId);
        loadDeletedQuizzes();
        alert('Removed from archive.');
    } catch(e) { alert('Error: ' + e.message); }
};

/* ═══════════════════════════════════════════════════════════════
   ACTIVITY VIEW MODAL
═══════════════════════════════════════════════════════════════ */

/* Open the modal and load quiz activity */
window.adminViewDeletedQuiz = async function(docId) {
    var modal = document.getElementById('adm-activity-modal');
    if (!modal) return;

    /* Reset */
    document.getElementById('adm-modal-title').textContent = 'Loading…';
    document.getElementById('adm-modal-info').innerHTML    = '<div class="adm-loading">Loading quiz info…</div>';
    document.getElementById('adm-modal-table-wrap').innerHTML = '<div class="adm-loading">Loading attendance…</div>';
    document.getElementById('adm-modal-doc-id').value = docId;
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    try {
        var snap = await getDoc(doc(db, 'deleted_quizzes', docId));
        if (!snap.exists()) { alert('Record not found.'); adminCloseModal(); return; }
        var q = snap.data();
        _currentViewData = { id: docId, quiz: q };

        /* Header */
        document.getElementById('adm-modal-title').textContent = '📋 ' + (q.title || 'Untitled Quiz');

        /* Info grid */
        var deletedAtStr = '—';
        if (q.deleted_at && q.deleted_at.toDate) deletedAtStr = q.deleted_at.toDate().toLocaleString();
        var infoItems = [
            { label: 'Quiz Title',  val: q.title    || '—' },
            { label: 'Subject',     val: q.subject   || '—' },
            { label: 'Host',        val: q.host_name || 'Unknown' },
            { label: 'Host Email',  val: q.host_email|| '—' },
            { label: 'Mode',        val: q.mode      || '—' },
            { label: 'Questions',   val: q.num_questions || 0 },
            { label: 'Attendees',   val: q.total_attempts || 0 },
            { label: 'Token',       val: q.quiz_token|| '—' },
            { label: 'Deleted On',  val: deletedAtStr }
        ];
        document.getElementById('adm-modal-info').innerHTML = infoItems.map(function(item) {
            return '<div class="adm-modal-info-item">' +
                '<div class="adm-modal-info-label">' + esc(item.label) + '</div>' +
                '<div class="adm-modal-info-val">'   + esc(String(item.val)) + '</div>' +
                '</div>';
        }).join('');

        /* Attendance table */
        var attempts = q.attempts || [];
        if (!attempts.length) {
            document.getElementById('adm-modal-table-wrap').innerHTML =
                '<div class="adm-empty" style="padding:20px">No attendance recorded for this quiz.</div>';
        } else {
            /* Detect extra form fields dynamically */
            var knownKeys = new Set(['participant_name','score','total','finished_at','started_at','quiz_id','host_uid','host_email','_doc_id','created_at']);
            var extraKeys = [];
            attempts.forEach(function(a) {
                Object.keys(a).forEach(function(k) {
                    if (!knownKeys.has(k) && extraKeys.indexOf(k) === -1) extraKeys.push(k);
                });
            });

            var thead = '<tr><th>#</th><th>Participant Name</th><th>Score</th><th>%</th><th>Submitted</th>' +
                extraKeys.map(function(k) { return '<th>' + esc(k.replace(/_/g,' ')) + '</th>'; }).join('') +
                '</tr>';

            var tbody = attempts.map(function(a, idx) {
                var pct  = (a.total > 0) ? Math.round((a.score / a.total) * 100) : '—';
                var pctCls = pct >= 70 ? 'adm-badge-green' : (pct >= 40 ? 'adm-badge-yellow' : 'adm-badge-red');
                var pctHtml = (typeof pct === 'number') ? '<span class="adm-badge ' + pctCls + '">' + pct + '%</span>' : '—';
                return '<tr>' +
                    '<td>' + (idx+1) + '</td>' +
                    '<td><strong>' + esc(a.participant_name || 'Anonymous') + '</strong></td>' +
                    '<td>' + esc(String(a.score || 0)) + '/' + esc(String(a.total || 0)) + '</td>' +
                    '<td>' + pctHtml + '</td>' +
                    '<td style="font-size:.75rem">' + esc(a.finished_at || '—') + '</td>' +
                    extraKeys.map(function(k) {
                        var val = a[k];
                        if (val === null || val === undefined) return '<td>—</td>';
                        if (typeof val === 'object') val = JSON.stringify(val);
                        return '<td style="max-width:200px;word-break:break-word;font-size:.78rem">' + esc(String(val)) + '</td>';
                    }).join('') +
                    '</tr>';
            }).join('');

            document.getElementById('adm-modal-table-wrap').innerHTML =
                '<table class="adm-table"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>';
        }
    } catch(e) {
        document.getElementById('adm-modal-table-wrap').innerHTML =
            '<div class="adm-error">Error loading data: ' + esc(e.message) + '</div>';
    }
};

window.adminCloseModal = function() {
    var modal = document.getElementById('adm-activity-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    /* Close export dropdown if open */
    var menu = document.getElementById('adm-export-menu');
    if (menu) menu.classList.remove('open');
};

/* ── Print activity (opens a clean print window) ── */
window.adminPrintActivity = function() {
    if (!_currentViewData) return;
    var q        = _currentViewData.quiz;
    var docId    = _currentViewData.id;
    var attempts = q.attempts || [];

    var deletedAtStr = '—';
    if (q.deleted_at && q.deleted_at.toDate) deletedAtStr = q.deleted_at.toDate().toLocaleString();

    /* Detect extra keys */
    var knownKeys = new Set(['participant_name','score','total','finished_at','started_at','quiz_id','host_uid','host_email','_doc_id','created_at']);
    var extraKeys = [];
    attempts.forEach(function(a) {
        Object.keys(a).forEach(function(k) {
            if (!knownKeys.has(k) && extraKeys.indexOf(k) === -1) extraKeys.push(k);
        });
    });

    var tableRows = attempts.map(function(a, idx) {
        var pct = (a.total > 0) ? Math.round((a.score/a.total)*100) + '%' : '—';
        return '<tr>' +
            '<td>' + (idx+1) + '</td>' +
            '<td>' + esc(a.participant_name || 'Anonymous') + '</td>' +
            '<td>' + esc(String(a.score||0)) + '/' + esc(String(a.total||0)) + '</td>' +
            '<td>' + pct + '</td>' +
            '<td>' + esc(a.finished_at || '—') + '</td>' +
            extraKeys.map(function(k) {
                var val = a[k];
                if (val === null || val === undefined) return '<td>—</td>';
                if (typeof val === 'object') val = JSON.stringify(val);
                return '<td>' + esc(String(val)) + '</td>';
            }).join('') +
            '</tr>';
    }).join('');

    var extraHeaders = extraKeys.map(function(k) { return '<th>' + esc(k.replace(/_/g,' ')) + '</th>'; }).join('');

    var win = window.open('', '_blank', 'width=1000,height=700');
    win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8">' +
        '<title>Quiz Activity — ' + esc(q.title) + '</title>' +
        '<style>' +
        'body{font-family:Arial,sans-serif;font-size:12px;color:#111;padding:20px;background:#fff;}' +
        'h1{font-size:18px;margin-bottom:4px;color:#1e1b4b;}' +
        'h2{font-size:13px;color:#4f46e5;margin:18px 0 8px;}' +
        '.meta-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0 20px;border:1px solid #ddd;border-radius:6px;padding:12px;}' +
        '.meta-item{} .meta-label{font-size:10px;font-weight:700;text-transform:uppercase;color:#666;} .meta-val{font-weight:600;margin-top:2px;}' +
        'table{width:100%;border-collapse:collapse;margin-top:8px;}' +
        'th{background:#1e1b4b;color:#fff;padding:8px 10px;font-size:11px;text-align:left;}' +
        'td{padding:7px 10px;border-bottom:1px solid #eee;font-size:11px;}' +
        'tr:nth-child(even) td{background:#f8f8ff;}' +
        '.footer{margin-top:24px;font-size:10px;color:#888;border-top:1px solid #ddd;padding-top:8px;}' +
        '</style></head><body>' +
        '<h1>📋 Quiz Activity Report</h1>' +
        '<div class="meta-grid">' +
        '<div class="meta-item"><div class="meta-label">Title</div><div class="meta-val">' + esc(q.title||'—') + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Subject</div><div class="meta-val">' + esc(q.subject||'—') + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Host</div><div class="meta-val">' + esc(q.host_name||'Unknown') + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Host Email</div><div class="meta-val">' + esc(q.host_email||'—') + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Mode</div><div class="meta-val">' + esc(q.mode||'—') + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Questions</div><div class="meta-val">' + (q.num_questions||0) + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Total Attendees</div><div class="meta-val">' + (q.total_attempts||0) + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Quiz Token</div><div class="meta-val">' + esc(q.quiz_token||'—') + '</div></div>' +
        '<div class="meta-item"><div class="meta-label">Deleted On</div><div class="meta-val">' + esc(deletedAtStr) + '</div></div>' +
        '</div>' +
        '<h2>Attendance & Activity</h2>' +
        '<table><thead><tr><th>#</th><th>Participant Name</th><th>Score</th><th>%</th><th>Submitted</th>' + extraHeaders + '</tr></thead>' +
        '<tbody>' + (tableRows || '<tr><td colspan="' + (5+extraKeys.length) + '" style="text-align:center;padding:20px">No attendance recorded.</td></tr>') + '</tbody></table>' +
        '<div class="footer">Printed by xzily AI Admin Panel — ' + new Date().toLocaleString() + '</div>' +
        '</body></html>');
    win.document.close();
    win.focus();
    setTimeout(function() { win.print(); }, 600);

    /* Mark this doc as printed — permanent delete is now unlocked */
    _printedDocs.add(docId);
};

/* ═══════════════════════════════════════════════════════════════
   EXPORT — 11 formats
═══════════════════════════════════════════════════════════════ */
window.adminExportActivity = function(format) {
    if (!_currentViewData) return;
    var q        = _currentViewData.quiz;
    var docId    = _currentViewData.id;
    var attempts = q.attempts || [];

    /* Close export dropdown */
    var menu = document.getElementById('adm-export-menu');
    if (menu) menu.classList.remove('open');

    /* Detect extra form fields */
    var knownKeys = new Set(['participant_name','score','total','finished_at','started_at','quiz_id','host_uid','host_email','_doc_id','created_at']);
    var extraKeys = [];
    attempts.forEach(function(a) {
        Object.keys(a).forEach(function(k) {
            if (!knownKeys.has(k) && extraKeys.indexOf(k) === -1) extraKeys.push(k);
        });
    });

    var baseHeaders = ['#','Participant Name','Score','Total','Percentage','Submitted'];
    var allHeaders  = baseHeaders.concat(extraKeys.map(function(k){ return k.replace(/_/g,' '); }));

    function getRows() {
        return attempts.map(function(a, idx) {
            var pct = a.total > 0 ? Math.round((a.score/a.total)*100) + '%' : '—';
            var base = [idx+1, a.participant_name||'Anonymous', a.score||0, a.total||0, pct, a.finished_at||'—'];
            var extra = extraKeys.map(function(k) {
                var v = a[k];
                if (v === null || v === undefined) return '';
                if (typeof v === 'object') return JSON.stringify(v);
                return String(v);
            });
            return base.concat(extra);
        });
    }

    var quizMeta = {
        title:       q.title || '—',
        subject:     q.subject || '—',
        host:        q.host_name || 'Unknown',
        host_email:  q.host_email || '—',
        mode:        q.mode || '—',
        questions:   String(q.num_questions || 0),
        attendees:   String(q.total_attempts || 0),
        quiz_token:  q.quiz_token || '—'
    };

    var fileName = (q.title || 'quiz').replace(/[^a-z0-9]/gi,'_').toLowerCase() + '_activity';

    /* ── CSV ── */
    if (format === 'csv') {
        var csvLines = [];
        csvLines.push('Quiz Activity Report');
        Object.keys(quizMeta).forEach(function(k) { csvLines.push(k + ',' + csvQuote(quizMeta[k])); });
        csvLines.push('');
        csvLines.push(allHeaders.map(csvQuote).join(','));
        getRows().forEach(function(row) { csvLines.push(row.map(csvQuote).join(',')); });
        downloadText(csvLines.join('\r\n'), fileName + '.csv', 'text/csv;charset=utf-8;');
    }

    /* ── TSV ── */
    else if (format === 'tsv') {
        var tsvLines = [allHeaders.join('\t')];
        getRows().forEach(function(row) { tsvLines.push(row.join('\t')); });
        downloadText(tsvLines.join('\r\n'), fileName + '.tsv', 'text/tab-separated-values;charset=utf-8;');
    }

    /* ── JSON ── */
    else if (format === 'json') {
        var jsonObj = { quiz: quizMeta, attendance: attempts };
        downloadText(JSON.stringify(jsonObj, null, 2), fileName + '.json', 'application/json;charset=utf-8;');
    }

    /* ── XML ── */
    else if (format === 'xml') {
        var xml = ['<?xml version="1.0" encoding="UTF-8"?>', '<quiz_activity>'];
        xml.push('  <info>');
        Object.keys(quizMeta).forEach(function(k) { xml.push('    <' + k + '>' + xmlEsc(quizMeta[k]) + '</' + k + '>'); });
        xml.push('  </info>');
        xml.push('  <attendance>');
        attempts.forEach(function(a) {
            xml.push('    <attempt>');
            xml.push('      <participant>' + xmlEsc(a.participant_name||'Anonymous') + '</participant>');
            xml.push('      <score>' + (a.score||0) + '</score>');
            xml.push('      <total>' + (a.total||0) + '</total>');
            xml.push('      <submitted>' + xmlEsc(a.finished_at||'') + '</submitted>');
            extraKeys.forEach(function(k) { xml.push('      <' + k + '>' + xmlEsc(String(a[k]||'')) + '</' + k + '>'); });
            xml.push('    </attempt>');
        });
        xml.push('  </attendance>');
        xml.push('</quiz_activity>');
        downloadText(xml.join('\n'), fileName + '.xml', 'application/xml;charset=utf-8;');
    }

    /* ── HTML ── */
    else if (format === 'html') {
        var rows = getRows();
        var trs  = rows.map(function(r) {
            return '<tr>' + r.map(function(c) { return '<td>' + esc(String(c)) + '</td>'; }).join('') + '</tr>';
        }).join('');
        var htmlStr = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(q.title) + ' — Activity</title>' +
            '<style>body{font-family:Arial,sans-serif;font-size:13px;padding:24px;}h1{color:#1e1b4b;}table{border-collapse:collapse;width:100%;}th{background:#1e1b4b;color:#fff;padding:8px;}td{border:1px solid #ccc;padding:7px;}</style>' +
            '</head><body>' +
            '<h1>' + esc(q.title) + ' — Activity Report</h1>' +
            '<p><strong>Host:</strong> ' + esc(q.host_name||'—') + ' | <strong>Attendees:</strong> ' + (q.total_attempts||0) + '</p>' +
            '<table><thead><tr>' + allHeaders.map(function(h){return '<th>'+esc(h)+'</th>';}).join('') + '</tr></thead>' +
            '<tbody>' + trs + '</tbody></table>' +
            '</body></html>';
        downloadText(htmlStr, fileName + '.html', 'text/html;charset=utf-8;');
    }

    /* ── Markdown ── */
    else if (format === 'md') {
        var md = ['# ' + (q.title||'Quiz') + ' — Activity Report', ''];
        Object.keys(quizMeta).forEach(function(k) { md.push('**' + k + ':** ' + quizMeta[k]); });
        md.push('');
        md.push('## Attendance');
        md.push('');
        md.push('| ' + allHeaders.join(' | ') + ' |');
        md.push('| ' + allHeaders.map(function(){return '---';}).join(' | ') + ' |');
        getRows().forEach(function(r) { md.push('| ' + r.join(' | ') + ' |'); });
        downloadText(md.join('\n'), fileName + '.md', 'text/markdown;charset=utf-8;');
    }

    /* ── Plain Text ── */
    else if (format === 'txt') {
        var lines = ['QUIZ ACTIVITY REPORT', '===================', ''];
        Object.keys(quizMeta).forEach(function(k) { lines.push(k.toUpperCase().replace(/_/g,' ') + ': ' + quizMeta[k]); });
        lines.push('', 'ATTENDANCE', '----------', allHeaders.join(' | '));
        lines.push(allHeaders.map(function(h){return '-'.repeat(h.length);}).join('-|-'));
        getRows().forEach(function(r) { lines.push(r.join(' | ')); });
        lines.push('', 'Exported: ' + new Date().toLocaleString());
        downloadText(lines.join('\n'), fileName + '.txt', 'text/plain;charset=utf-8;');
    }

    /* ── PDF — use the print window approach ── */
    else if (format === 'pdf') {
        adminPrintActivity();
        return; /* Print already marks it */
    }

    /* ── Excel (.xlsx) via SheetJS ── */
    else if (format === 'xlsx' || format === 'ods') {
        if (typeof XLSX === 'undefined') {
            alert('Excel/ODS export is loading — please try again in a moment.');
            return;
        }
        var wsData = [allHeaders].concat(getRows());
        var ws = XLSX.utils.aoa_to_sheet(wsData);
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Attendance');

        /* Meta sheet */
        var metaWs = XLSX.utils.aoa_to_sheet([['Field','Value']].concat(Object.keys(quizMeta).map(function(k){ return [k, quizMeta[k]]; })));
        XLSX.utils.book_append_sheet(wb, metaWs, 'Quiz Info');

        var ext = format === 'ods' ? '.ods' : '.xlsx';
        var bType = format === 'ods' ? 'ods' : 'xlsx';
        XLSX.writeFile(wb, fileName + ext, { bookType: bType });
    }

    /* ── PowerPoint (.pptx) via PptxGenJS ── */
    else if (format === 'pptx') {
        if (typeof PptxGenJS === 'undefined') {
            alert('PowerPoint export is loading — please try again in a moment.');
            return;
        }
        var pptx = new PptxGenJS();
        pptx.layout = 'LAYOUT_WIDE';

        /* Slide 1 — Title / Info */
        var slide1 = pptx.addSlide();
        slide1.addText('Quiz Activity Report', { x:0.5, y:0.3, w:12, h:0.7, fontSize:28, bold:true, color:'1e1b4b' });
        slide1.addText(q.title||'—', { x:0.5, y:1.0, w:12, h:0.5, fontSize:20, color:'4f46e5' });
        var infoText = Object.keys(quizMeta).map(function(k){ return k.replace(/_/g,' ').toUpperCase() + ':  ' + quizMeta[k]; }).join('\n');
        slide1.addText(infoText, { x:0.5, y:1.7, w:12, h:4, fontSize:12, color:'333333', valign:'top' });

        /* Slide 2 — Attendance table */
        var slide2 = pptx.addSlide();
        slide2.addText('Attendance & Activity', { x:0.5, y:0.2, w:12, h:0.5, fontSize:20, bold:true, color:'1e1b4b' });

        var tableData = [allHeaders.map(function(h){ return { text: h, options: { bold:true, color:'FFFFFF', fill:{color:'1e1b4b'} } }; })];
        getRows().forEach(function(r, idx) {
            tableData.push(r.map(function(c) { return { text: String(c), options: { fill:{ color: idx%2===0?'F8F8FF':'FFFFFF' } } }; }));
        });

        slide2.addTable(tableData, { x:0.5, y:0.8, w:12, colW: allHeaders.map(function(_,i){ return i===1?2.5:1.2; }), fontSize:9 });

        pptx.writeFile({ fileName: fileName + '.pptx' });
    }

    /* Mark as printed/exported — unlocks permanent delete */
    _printedDocs.add(docId);
};

/* ── Download helper ── */
function downloadText(content, filename, mime) {
    var blob = new Blob([content], { type: mime });
    var url  = URL.createObjectURL(blob);
    var a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
}

function csvQuote(v) {
    v = String(v === null || v === undefined ? '' : v);
    if (v.indexOf(',') !== -1 || v.indexOf('"') !== -1 || v.indexOf('\n') !== -1) {
        return '"' + v.replace(/"/g, '""') + '"';
    }
    return v;
}

function xmlEsc(v) {
    return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ─────────────────────────────────────────────
   DATE FILTER HELPERS
───────────────────────────────────────────── */
function populateDateFilter(yearSelId, yearsSet) {
    var sel = document.getElementById(yearSelId);
    if (!sel) return;
    var prev = sel.value;
    sel.innerHTML = '<option value="">All Years</option>';
    Array.from(yearsSet).sort(function(a,b){return b-a;}).forEach(function(y) {
        var opt = document.createElement('option');
        opt.value = y; opt.textContent = y;
        if (String(y) === prev) opt.selected = true;
        sel.appendChild(opt);
    });
}

function applyQuizDateFilter() {
    var yr  = (document.getElementById('adm-quiz-year')  || {}).value || '';
    var mon = (document.getElementById('adm-quiz-month') || {}).value || '';
    var day = (document.getElementById('adm-quiz-day')   || {}).value || '';
    var q   = (document.getElementById('adm-quiz-search')|| {}).value || '';
    q = q.toLowerCase();
    document.querySelectorAll('#quizzes-list tbody tr').forEach(function(row) {
        var yrMatch  = !yr  || row.dataset.year  === yr;
        var monMatch = !mon || row.dataset.month === mon;
        var dayMatch = !day || row.dataset.day   === day;
        var txtMatch = !q   || row.textContent.toLowerCase().includes(q);
        row.style.display = (yrMatch && monMatch && dayMatch && txtMatch) ? '' : 'none';
    });
}

function applyDelDateFilter() {
    var yr  = (document.getElementById('adm-del-year')  || {}).value || '';
    var mon = (document.getElementById('adm-del-month') || {}).value || '';
    var day = (document.getElementById('adm-del-day')   || {}).value || '';
    var q   = (document.getElementById('adm-deleted-search')|| {}).value || '';
    q = q.toLowerCase();
    document.querySelectorAll('#deleted-list tbody tr').forEach(function(row) {
        var yrMatch  = !yr  || row.dataset.year  === yr;
        var monMatch = !mon || row.dataset.month === mon;
        var dayMatch = !day || row.dataset.day   === day;
        var txtMatch = !q   || row.textContent.toLowerCase().includes(q);
        row.style.display = (yrMatch && monMatch && dayMatch && txtMatch) ? '' : 'none';
    });
}

/* ─────────────────────────────────────────────
   SEARCH / FILTER BINDINGS
───────────────────────────────────────────── */
bind('adm-quiz-search',  'input', applyQuizDateFilter);
bind('adm-quiz-year',    'change', applyQuizDateFilter);
bind('adm-quiz-month',   'change', applyQuizDateFilter);
bind('adm-quiz-day',     'change', applyQuizDateFilter);

bind('adm-deleted-search', 'input',  applyDelDateFilter);
bind('adm-del-year',       'change', applyDelDateFilter);
bind('adm-del-month',      'change', applyDelDateFilter);
bind('adm-del-day',        'change', applyDelDateFilter);

bind('adm-user-search', 'input', function() {
    var q = this.value.toLowerCase();
    document.querySelectorAll('#users-list tbody tr').forEach(function(row) {
        row.style.display = row.textContent.toLowerCase().includes(q) ? '' : 'none';
    });
});

/* Close export dropdown when clicking outside */
document.addEventListener('click', function(e) {
    var menu = document.getElementById('adm-export-menu');
    if (!menu) return;
    if (!menu.contains(e.target) && e.target.id !== 'adm-modal-export-btn') {
        menu.classList.remove('open');
    }
});

/* Close modal on backdrop click */
document.addEventListener('click', function(e) {
    var modal = document.getElementById('adm-activity-modal');
    if (modal && e.target === modal) adminCloseModal();
});

/* ─────────────────────────────────────────────
   HOST ACTIVITY
───────────────────────────────────────────── */
async function loadHostActivity() {
    var container = document.getElementById('hosts-list');
    if (!container) return;
    container.innerHTML = '<div class="adm-loading">Loading host activity…</div>';
    try {
        var [quizSnap, attemptSnap, usersSnap] = await Promise.all([
            getDocs(query(collection(db, 'quizzes'), orderBy('created_at', 'desc'))),
            getDocs(collection(db, 'attempts')),
            getDocs(query(collection(db, 'users'), where('role', '==', 'host')))
        ]);

        /* Build uid → profile map from users collection */
        var uidToProfile = {};
        usersSnap.docs.forEach(function(d) {
            uidToProfile[d.id] = d.data();
        });

        if (quizSnap.empty && usersSnap.empty) {
            container.innerHTML = '<div class="adm-empty">No host quiz activity yet.</div>';
            return;
        }

        /* Collect hosts keyed by uid (prefer uid over email to avoid dupes) */
        var hosts = {};
        quizSnap.docs.forEach(function(d) {
            var q = d.data();
            var uid   = q.host_uid || '';
            var email = q.host_email || q.created_by || 'Unknown';
            var key   = uid || email;
            if (!hosts[key]) {
                var prof = uid && uidToProfile[uid];
                hosts[key] = {
                    uid:        uid,
                    name:       (prof && prof.name) || q.host_name || email,
                    email:      (prof && prof.email) || email,
                    status:     (prof && prof.status) || 'active',
                    quizzes:    0,
                    attempts:   0,
                    lastActive: null
                };
            }
            hosts[key].quizzes++;
            if (q.created_at) {
                var t = q.created_at.toDate ? q.created_at.toDate() : new Date(q.created_at);
                if (!hosts[key].lastActive || t > hosts[key].lastActive) hosts[key].lastActive = t;
            }
        });

        /* Also add hosts who are registered but haven't created quizzes yet */
        usersSnap.docs.forEach(function(d) {
            if (!hosts[d.id]) {
                var p = d.data();
                hosts[d.id] = { uid: d.id, name: p.name || p.email, email: p.email, status: p.status || 'active', quizzes: 0, attempts: 0, lastActive: null };
            }
        });

        attemptSnap.docs.forEach(function(d) {
            var a   = d.data();
            var uid = a.host_uid || '';
            var key = uid || a.host_email || '';
            if (key && hosts[key]) hosts[key].attempts++;
        });

        var rows = Object.values(hosts).sort(function(a,b) { return b.quizzes - a.quizzes; });
        var html = '<table class="adm-table"><thead><tr>' +
            '<th>Host</th><th>Email</th><th>Quizzes</th><th>Attempts</th><th>Last Active</th><th>Actions</th>' +
            '</tr></thead><tbody>';
        rows.forEach(function(h) {
            var lastActive = h.lastActive ? h.lastActive.toISOString().replace('T',' ').substring(0,16) : '—';
            var deleteBtn  = h.uid
                ? '<button class="adm-btn adm-btn-danger adm-btn-sm" onclick="confirmDeleteHost(' +
                  JSON.stringify(h.uid) + ',' + JSON.stringify(h.name) + ',' + JSON.stringify(h.email) +
                  ')">🗑 Delete</button>'
                : '<span style="color:#94a3b8;font-size:.75rem">No UID</span>';
            html += '<tr>' +
                '<td><strong>' + esc(h.name) + '</strong></td>' +
                '<td>' + esc(h.email) + '</td>' +
                '<td><span class="adm-badge adm-badge-green">' + h.quizzes + '</span></td>' +
                '<td>' + h.attempts + '</td>' +
                '<td style="font-size:.75rem;color:#94a3b8">' + esc(lastActive) + '</td>' +
                '<td>' + deleteBtn + '</td>' +
                '</tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<div class="adm-error">Error: ' + esc(e.message) + '</div>';
    }
}

async function confirmDeleteHost(uid, name, email) {
    if (!uid) { alert('Cannot delete — this host has no UID on record.'); return; }
    var confirmed = window.confirm(
        '⚠️ DELETE HOST: ' + name + ' (' + email + ')\n\n' +
        'This will:\n' +
        '  • Remove their account profile from the database\n' +
        '  • Mark all their quizzes as deleted\n\n' +
        'Their Firebase Auth login is NOT deleted (contact Firebase Console to fully revoke access).\n\n' +
        'Type OK to confirm.'
    );
    if (!confirmed) return;
    try {
        /* Mark all their quizzes as deleted */
        var quizSnap = await getDocs(query(collection(db, 'quizzes'), where('host_uid', '==', uid)));
        var batch = [];
        quizSnap.docs.forEach(function(d) {
            batch.push(updateDoc(doc(db, 'quizzes', d.id), { status: 'deleted', deleted_by: 'admin', deleted_at: serverTimestamp() }));
        });
        await Promise.all(batch);

        /* Delete the user profile document */
        await deleteDoc(doc(db, 'users', uid));

        /* Remove their username reservation if available */
        try {
            var userDoc = quizSnap.docs.length > 0 ? quizSnap.docs[0].data() : null;
            var username = userDoc && userDoc.host_username;
            if (username) await deleteDoc(doc(db, 'usernames', username));
        } catch(_) {}

        alert('✓ Host "' + name + '" has been deleted. Their ' + quizSnap.size + ' quiz(zes) have been marked as deleted.');
        loadHostActivity(); /* Refresh the list */
    } catch(e) {
        alert('Error deleting host: ' + (e.message || e));
    }
}

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
