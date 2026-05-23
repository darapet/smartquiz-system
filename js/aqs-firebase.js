/* ============================================================
   AQS Firebase Integration Layer
   Replaces: smartquiz-jjls.onrender.com backend
   Auth:     Firebase Authentication (email/password)
   Data:     Firestore (quizzes, attempts, challenge, ads, notifications)
   Realtime: Firebase Realtime Database (challenge polling)
   ============================================================ */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
    getAuth,
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    sendEmailVerification,
    signOut,
    onAuthStateChanged,
    updateProfile,
    GoogleAuthProvider,
    signInWithPopup
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
    getFirestore,
    collection,
    doc,
    addDoc,
    setDoc,
    getDoc,
    getDocs,
    updateDoc,
    deleteDoc,
    query,
    where,
    orderBy,
    limit,
    serverTimestamp,
    Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
    getDatabase,
    ref,
    set,
    get,
    update,
    push,
    onValue,
    off,
    serverTimestamp as rtServerTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
    apiKey: "AIzaSyCFVx82QXdKdufbUIHBBOOzDefNoFBYxtY",
    authDomain: "smartquiz-darapet.firebaseapp.com",
    databaseURL: "https://smartquiz-darapet-default-rtdb.firebaseio.com",
    projectId: "smartquiz-darapet",
    storageBucket: "smartquiz-darapet.firebasestorage.app",
    messagingSenderId: "915234258423",
    appId: "1:915234258423:web:0c8fc183e9e3ce0852c2f2",
    measurementId: "G-W4G9C4X9H0"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);
const rtdb = getDatabase(app);

/* ── Base URL helper: works on GitHub Pages subfolders ──
   e.g. https://user.github.io/repo/create-quiz.html → https://user.github.io/repo/
   So generated quiz/challenge links point to the right subfolder. */
function _baseUrl() {
    var href = window.location.href.split('?')[0].split('#')[0];
    return href.substring(0, href.lastIndexOf('/') + 1);
}

/* ── Helpers ── */
function generateToken(len) {
    len = len || 8;
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    var t = '';
    for (var i = 0; i < len; i++) t += chars[Math.floor(Math.random() * chars.length)];
    return t;
}

function nowStr() {
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function tsToStr(ts) {
    if (!ts) return '';
    if (ts.toDate) return ts.toDate().toISOString().replace('T', ' ').substring(0, 19);
    return String(ts);
}

/* ── Auth state cache ── */
window._aqsFirebaseUser = null;
onAuthStateChanged(auth, function(user) {
    window._aqsFirebaseUser = user;
    /* Dispatch event so pages can react */
    document.dispatchEvent(new CustomEvent('aqs:authchange', { detail: { user: user } }));
});

function requireAuth() {
    var user = auth.currentUser || window._aqsFirebaseUser;
    if (!user) throw new Error('Not authenticated');
    return user;
}

/* ============================================================
   AJAX DISPATCHER
   Replaces all $.post(AQS.ajax_url, { action: '...' })
   ============================================================ */
window.aqsAjax = async function(data, successFn, failFn) {
    try {
        var res = await handleAction(data);
        if (successFn) successFn({ success: true, data: res });
    } catch(e) {
        console.error('[AQS Firebase]', data.action, e);
        if (failFn) failFn(e);
        else if (successFn) successFn({ success: false, data: e.message || 'Error' });
    }
};

/* ── File upload to Firebase Storage (used by admin pages) ──────────────
   Usage: window.aqsUploadFile(file, 'uploads/music/track.mp3')
          .then(function(url){ ... })
   Returns: promise resolving to the public download URL              */
window.aqsUploadFile = async function(file, storagePath) {
    var user = auth.currentUser || window._aqsFirebaseUser;
    if (!user) throw new Error('You must be signed in as admin to upload files.');
    var token     = await user.getIdToken();
    var bucket    = 'smartquiz-darapet.firebasestorage.app';
    var encoded   = encodeURIComponent(storagePath);
    var uploadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + bucket +
                    '/o?uploadType=media&name=' + encoded;
    var res = await fetch(uploadUrl, {
        method:  'POST',
        headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': file.type || 'application/octet-stream' },
        body:    file
    });
    if (!res.ok) {
        var errBody = await res.text();
        throw new Error('Upload failed (' + res.status + '): ' + errBody);
    }
    var json        = await res.json();
    var downloadUrl = 'https://firebasestorage.googleapis.com/v0/b/' + bucket +
                      '/o/' + encoded + '?alt=media&token=' + json.downloadTokens;
    return downloadUrl;
};

/* Patch jQuery $.post and $.ajax to intercept AQS AJAX calls */
(function patchJQuery() {
    if (typeof jQuery === 'undefined') {
        document.addEventListener('DOMContentLoaded', patchJQuery);
        return;
    }
    var _origAjax = jQuery.ajax.bind(jQuery);
    function _isAqsUrl(url) {
        if (typeof url !== 'string') return false;
        if (url.indexOf('smartquiz-jjls.onrender.com') !== -1) return true;
        if (url === 'firebase' || url === '') return true;
        if (typeof AQS !== 'undefined' && AQS.ajax_url && url === AQS.ajax_url) return true;
        return false;
    }

    jQuery.ajax = function(settings) {
        var url  = settings.url || '';
        var data = settings.data || {};
        /* Intercept all AQS backend calls */
        if (_isAqsUrl(url) && data.action) {
            return _interceptJqueryCall(settings, data);
        }
        return _origAjax(settings);
    };

    var _origPost = jQuery.post.bind(jQuery);
    jQuery.post = function(url, data, callback, type) {
        if (_isAqsUrl(url) && data && data.action) {
            var deferred = jQuery.Deferred();
            handleAction(data).then(function(res) {
                var result = { success: true, data: res };
                if (callback) callback(result);
                deferred.resolve(result);
            }).catch(function(e) {
                var result = { success: false, data: e.message || 'Error' };
                if (callback) callback(result);
                deferred.resolve(result);
            });
            return deferred.promise();
        }
        return _origPost(url, data, callback, type);
    };

    jQuery.get = function(url, data, callback) {
        if (_isAqsUrl(url) && data && data.action) {
            var deferred = jQuery.Deferred();
            handleAction(data).then(function(res) {
                var result = { success: true, data: res };
                if (callback) callback(result);
                deferred.resolve(result);
            }).catch(function(e) {
                var result = { success: false, data: e.message || 'Error' };
                if (callback) callback(result);
                deferred.resolve(result);
            });
            return deferred.promise();
        }
        var dfd = jQuery.Deferred();
        fetch(url + (data ? '?' + new URLSearchParams(data) : ''))
            .then(function(r) { return r.json(); })
            .then(function(res) { if (callback) callback(res); dfd.resolve(res); })
            .catch(function(e) { dfd.reject(e); });
        return dfd.promise();
    };

    /* Signal that Firebase+jQuery patch is ready — pages waiting on this can now make AJAX calls */
    window._aqsFirebaseReady = true;
    document.dispatchEvent(new CustomEvent('aqs:firebase:ready'));
})();

function _interceptJqueryCall(settings, data) {
    var deferred = jQuery.Deferred();
    handleAction(data).then(function(res) {
        var result = { success: true, data: res };
        if (settings.success) settings.success(result);
        deferred.resolve(result);
    }).catch(function(e) {
        var result = { success: false, data: e.message || 'Error' };
        if (settings.success) settings.success(result);
        deferred.resolve(result);
    });
    return deferred.promise();
}

/* ============================================================
   ACTION HANDLERS
   ============================================================ */
async function handleAction(data) {
    var action = data.action || '';
    switch(action) {
        /* ── AUTH ── */
        case 'aqs_login':            return await actionLogin(data);
        case 'aqs_register':         return await actionRegister(data);
        case 'aqs_social_login':     return await actionSocialLogin(data);
        case 'aqs_logout':           return await actionLogout(data);
        case 'aqs_send_otp':         return await actionSendOtp(data);
        case 'aqs_verify_otp':       return await actionVerifyOtp(data);

        /* ── QUIZ CRUD ── */
        case 'aqs_save_quiz':        return await actionSaveQuiz(data);
        case 'aqs_get_quizzes':      return await actionGetQuizzes(data);
        case 'aqs_get_quiz_public':  return await actionGetQuizPublic(data);
        case 'aqs_get_quiz_for_pdf':  return await actionGetQuizForPdf(data);
        case 'aqs_get_quiz_for_edit': return await actionGetQuizForEdit(data);
        case 'aqs_publish_quiz':      return await actionPublishQuiz(data);
        case 'aqs_delete_quiz':      return await actionDeleteQuiz(data);
        case 'aqs_toggle_quiz_status': return await actionToggleQuizStatus(data);
        case 'aqs_get_quiz_activity':  return await actionGetQuizActivity(data);
        case 'aqs_get_deleted_quizzes': return await actionGetDeletedQuizzes(data);

        /* ── ATTEMPTS ── */
        case 'aqs_check_retake':     return await actionCheckRetake(data);
        case 'aqs_submit_attempt':   return await actionSubmitAttempt(data);
        case 'aqs_get_attendance':   return await actionGetAttendance(data);
        case 'aqs_get_attempt_analysis': return await actionGetAttemptAnalysis(data);
        case 'aqs_get_leaderboard':  return await actionGetLeaderboard(data);
        case 'aqs_get_my_attempts':  return await actionGetMyAttempts(data);
        case 'aqs_get_user_dashboard': return await actionGetUserDashboard(data);

        /* ── AI GENERATE (proxy — deprecated, keep as fallback) ── */
        case 'aqs_ai_generate':      return await actionAiGenerate(data);

        /* ── CHALLENGE ── */
        case 'aqs_ch_create':        return await actionChCreate(data);
        case 'aqs_ch_join':          return await actionChJoin(data);
        case 'aqs_ch_start':         return await actionChStart(data);
        case 'aqs_ch_poll':          return await actionChPoll(data);
        case 'aqs_ch_answer':        return await actionChAnswer(data);
        case 'aqs_ch_play_again':    return await actionChPlayAgain(data);
        case 'aqs_ch_chat':          return await actionChChat(data);
        case 'aqs_ch_update_settings': return await actionChUpdateSettings(data);
        case 'aqs_ch_voice_push':    return { ok: true };
        case 'aqs_ch_voice_poll':    return { chunks: [] };

        /* ── NOTIFICATIONS & ADS ── */
        case 'aqs_get_pub_notifications': return await actionGetNotifications();
        case 'aqs_get_active_ads':        return await actionGetActiveAds(data);
        case 'aqs_track_impression':      return { ok: true };

        /* ── STUDIO AI PROXY (forwards to Pollinations) ── */
        case 'aqs_studio_ai':     return await actionAiGenerate(data);

        /* ── ADMIN SETTINGS ── */
        case 'aqs_get_settings':       return await actionGetSettings();
        case 'aqs_save_settings':      return await actionSaveSettings(data);
        case 'aqs_get_about_settings': return await actionGetAboutSettings();
        case 'aqs_save_about_settings':return await actionSaveAboutSettings(data);

        default:
            console.warn('[AQS Firebase] Unknown action:', action);
            return {};
    }
}

/* ============================================================
   AUTH ACTIONS
   ============================================================ */
async function actionLogin(data) {
    var identifier = (data.username || '').trim();
    var password   = (data.password || '').trim();

    /* identifier may be email or username — try email first, then look up by username */
    var email = identifier;
    if (identifier.indexOf('@') === -1) {
        /* Look up email by username */
        var uSnap = await getDocs(query(collection(db, 'users'), where('username', '==', identifier)));
        if (uSnap.empty) throw new Error('User not found. Please check your username or email.');
        email = uSnap.docs[0].data().email;
    }

    var cred = await signInWithEmailAndPassword(auth, email, password);
    var user = cred.user;

    /* Get user profile from Firestore */
    var profileDoc = await getDoc(doc(db, 'users', user.uid));
    var profile = profileDoc.exists() ? profileDoc.data() : {};

    /* Update AQS globals */
    _updateAqsGlobals(user, profile);

    var redirect = _dashboardUrl(profile.role);
    return {
        logged_in:    true,
        redirect:     redirect,
        otp_required: false,
        otp_verified: true,
        user_name:    profile.name || user.displayName || user.email
    };
}

async function actionRegister(data) {
    var name     = (data.name || '').trim();
    var username = (data.username || '').trim();
    var email    = (data.email || '').trim();
    var role     = (data.role || 'student').trim();
    var password = (data.password || '').trim();

    /* Check username uniqueness via public /usernames collection
       (avoids a permission error — users collection requires auth) */
    var usernameSnap = await getDoc(doc(db, 'usernames', username));
    if (usernameSnap.exists()) throw new Error('Username already taken. Please choose another.');

    /* Create Firebase Auth user */
    window._aqsIsRegistering = true;
    var cred = await createUserWithEmailAndPassword(auth, email, password);
    var user = cred.user;

    /* Force token refresh so Firestore immediately recognises the new user */
    try { await user.getIdToken(true); } catch(_) {}

    /* Update display name */
    await updateProfile(user, { displayName: name });

    /* Save profile to Firestore */
    var profile = {
        uid: user.uid, name: name, username: username, email: email,
        role: role, created_at: serverTimestamp(), status: 'active'
    };
    await setDoc(doc(db, 'users', user.uid), profile);

    /* Reserve username in public lookup map */
    await setDoc(doc(db, 'usernames', username), { uid: user.uid });

    /* Send email verification */
    await sendEmailVerification(user);

    _updateAqsGlobals(user, profile);

    var redirect = _dashboardUrl(role);
    return {
        message:      '✓ Account created! Please verify your email.',
        redirect:     redirect,
        otp_required: false,
        otp_sent:     false
    };
}

/* ── Google / Social Sign-In ── */
async function actionSocialLogin(data) {
    var provider = data.provider || 'google';
    var authProvider;
    if (provider === 'google') {
        authProvider = new GoogleAuthProvider();
        authProvider.addScope('email');
        authProvider.addScope('profile');
    } else {
        throw new Error('Unsupported social provider: ' + provider);
    }

    var cred = await signInWithPopup(auth, authProvider);
    var user = cred.user;

    /* Check if user doc already exists */
    var profileRef = doc(db, 'users', user.uid);
    var profileDoc = await getDoc(profileRef);
    var profile;

    if (profileDoc.exists()) {
        /* Returning user — just update last login */
        profile = profileDoc.data();
        await updateDoc(profileRef, { last_login: serverTimestamp() });
    } else {
        /* New user via Google — auto-create profile */
        var displayName = user.displayName || '';
        var emailLocal  = (user.email || '').split('@')[0];
        /* Generate a unique username from display name or email local part */
        var baseUsername = (displayName.replace(/\s+/g, '').toLowerCase() || emailLocal).substring(0, 20);
        /* Check for username collision and append random digits if needed */
        var finalUsername = baseUsername;
        /* Check collision via public usernames collection */
        var collision = await getDoc(doc(db, 'usernames', finalUsername));
        if (collision.exists()) finalUsername = baseUsername + Math.floor(1000 + Math.random() * 9000);

        profile = {
            uid:        user.uid,
            name:       displayName,
            username:   finalUsername,
            email:      user.email,
            role:       'student',
            avatar:     user.photoURL || '',
            provider:   provider,
            status:     'active',
            created_at: serverTimestamp(),
            last_login: serverTimestamp()
        };
        await setDoc(profileRef, profile);
        /* Reserve username in public lookup map */
        await setDoc(doc(db, 'usernames', finalUsername), { uid: user.uid });
    }

    _updateAqsGlobals(user, profile);

    return {
        logged_in:    true,
        redirect:     _dashboardUrl(profile.role),
        otp_required: false,
        otp_verified: true,
        user_name:    profile.name || user.displayName || user.email
    };
}

async function actionLogout() {
    await signOut(auth);
    window._aqsFirebaseUser = null;
    if (typeof AQS !== 'undefined') {
        AQS.is_logged_in = false;
        AQS.is_host = false;
        AQS.is_admin = false;
    }
    return { redirect: 'login.html' };
}

async function actionSendOtp() {
    /* Firebase uses email verification links, not numeric OTPs.
       We store a 6-digit code in the user's Firestore doc as a workaround. */
    var user = requireAuth();
    var otp  = String(Math.floor(100000 + Math.random() * 900000));
    var exp  = Date.now() + 10 * 60 * 1000; /* 10 minutes */
    await updateDoc(doc(db, 'users', user.uid), { otp: otp, otp_exp: exp });
    /* In production you'd email the code — here we just store it.
       The UI will auto-verify since Firebase handles real email verification. */
    return { sent: true };
}

async function actionVerifyOtp(data) {
    var user = requireAuth();
    var code = (data.otp || '').trim();
    var snap = await getDoc(doc(db, 'users', user.uid));
    if (!snap.exists()) throw new Error('User not found.');
    var profile = snap.data();
    if (!profile.otp || profile.otp !== code) throw new Error('Incorrect code. Please try again.');
    if (Date.now() > (profile.otp_exp || 0)) throw new Error('Code expired. Please request a new one.');
    await updateDoc(doc(db, 'users', user.uid), { otp: null, otp_exp: null, email_verified: true });
    return { verified: true };
}

/* ============================================================
   QUIZ ACTIONS
   ============================================================ */
async function actionSaveQuiz(data) {
    var user = requireAuth();
    var questions = [];
    try { questions = JSON.parse(data.questions_json || data.questions || '[]'); } catch(_) {}
    var customForm = [];
    try { customForm = JSON.parse(data.custom_form || '[]'); } catch(_) {}

    var quizId   = data.quiz_id && data.quiz_id !== '0' ? String(data.quiz_id) : null;
    var token    = quizId ? null : generateToken(8);
    var nowTs    = serverTimestamp();

    var quizData = {
        host_uid:      user.uid,
        title:         data.title || '',
        subject:       data.subject || '',
        num_questions: parseInt(data.num_questions) || questions.length,
        time_limit:    parseInt(data.time_limit) || 30,
        mode:          data.mode || 'exam',
        allow_retakes: parseInt(data.allow_retakes) || 0,
        quiz_note:     data.quiz_note || '',
        show_results:  data.show_results !== 'no' && data.show_results !== false && data.show_results !== 0,
        questions:     questions,
        custom_form:   customForm,
        status:        'draft',
        host_status:   'active',
        updated_at:    nowTs
    };

    var finalId;
    if (quizId) {
        await updateDoc(doc(db, 'quizzes', quizId), quizData);
        finalId = quizId;
    } else {
        quizData.quiz_token  = token;
        quizData.created_at  = nowTs;
        quizData.quiz_url    = '';
        var ref = await addDoc(collection(db, 'quizzes'), quizData);
        finalId = ref.id;
        /* Set quiz_url now we have the ID */
        var quizUrl = _baseUrl() + 'take-quiz.html?token=' + token;
        await updateDoc(doc(db, 'quizzes', finalId), { quiz_url: quizUrl });
    }

    return { quiz_id: finalId };
}

async function actionGetQuizzes(data) {
    var user = requireAuth();
    /* No orderBy to avoid requiring a Firestore composite index — we sort client-side */
    var snap = await getDocs(
        query(collection(db, 'quizzes'),
              where('host_uid', '==', user.uid))
    );
    var items = snap.docs.map(function(d) {
        var q = d.data();
        return {
            id:            d.id,
            title:         q.title,
            subject:       q.subject,
            num_questions: q.num_questions || (q.questions || []).length,
            time_limit:    q.time_limit,
            mode:          q.mode,
            status:        q.status,
            host_status:   q.host_status || 'active',
            quiz_token:    q.quiz_token || '',
            quiz_url:      q.quiz_url || '',
            created_at_ms: q.created_at && q.created_at.toDate ? q.created_at.toDate().getTime() : 0
        };
    });
    /* Sort newest first client-side */
    items.sort(function(a, b) { return b.created_at_ms - a.created_at_ms; });
    return items;
}

async function actionGetQuizPublic(data) {
    var token = data.token || '';
    var snap  = await getDocs(query(collection(db, 'quizzes'), where('quiz_token', '==', token)));
    if (snap.empty) throw new Error('Quiz not found.');
    var d = snap.docs[0];
    var q = d.data();
    if (q.status !== 'published') throw new Error('This quiz is not yet published.');
    if (q.host_status === 'disabled') throw new Error('This quiz has been disabled by the host.');

    /* Check expiry */
    if (q.expires_at) {
        var expTs = q.expires_at.toDate ? q.expires_at.toDate() : new Date(q.expires_at);
        if (Date.now() > expTs.getTime()) throw new Error('This quiz has expired.');
    }

    return {
        quiz_id:       d.id,
        title:         q.title,
        subject:       q.subject,
        num_questions: q.num_questions || (q.questions || []).length,
        time_limit:    q.time_limit,
        mode:          q.mode,
        allow_retakes: q.allow_retakes || 0,
        quiz_token:    q.quiz_token,
        quiz_note:     q.quiz_note || '',
        show_results:  q.show_results !== false,
        custom_form:   q.custom_form || [],
        questions:     q.questions || []
    };
}

async function actionGetQuizForPdf(data) {
    var quizId = data.quiz_id || '';
    var snap   = await getDoc(doc(db, 'quizzes', quizId));
    if (!snap.exists()) throw new Error('Quiz not found.');
    var q = snap.data();
    return {
        title:     q.title,
        subject:   q.subject,
        mode:      q.mode,
        questions: q.questions || []
    };
}

async function actionPublishQuiz(data) {
    var user   = requireAuth();
    var quizId = String(data.quiz_id || '');
    var snap   = await getDoc(doc(db, 'quizzes', quizId));
    if (!snap.exists()) throw new Error('Quiz not found.');
    var q = snap.data();
    if (q.host_uid !== user.uid) throw new Error('Permission denied.');

    var updateData = { status: 'published', updated_at: serverTimestamp() };

    /* Expiry */
    var expiryType = data.expiry_type || 'none';
    if (expiryType === 'datetime' && data.expiry_datetime) {
        updateData.expires_at = Timestamp.fromDate(new Date(data.expiry_datetime));
    } else if (expiryType === 'duration') {
        var ms = ((parseInt(data.expiry_days) || 0) * 86400 + (parseInt(data.expiry_hours) || 0) * 3600) * 1000;
        if (ms > 0) updateData.expires_at = Timestamp.fromDate(new Date(Date.now() + ms));
    }

    /* Ensure quiz_url and token */
    var token   = q.quiz_token || generateToken(8);
    var quizUrl = _baseUrl() + 'take-quiz.html?token=' + token;
    var chalUrl = _baseUrl() + 'challenge.html?quiz_token=' + token;
    var dashUrl = _baseUrl() + 'dashboard.html';
    updateData.quiz_token = token;
    updateData.quiz_url   = quizUrl;

    await updateDoc(doc(db, 'quizzes', quizId), updateData);

    return {
        quiz_url:      quizUrl,
        challenge_url: chalUrl,
        dashboard_url: dashUrl,
        expires_at:    updateData.expires_at ? updateData.expires_at.toDate().toISOString().replace('T',' ').substring(0,19) : null,
        print_quiz:    { title: q.title, subject: q.subject, mode: q.mode, questions: q.questions || [] }
    };
}

async function actionDeleteQuiz(data) {
    var user   = requireAuth();
    var quizId = String(data.quiz_id || '');
    var snap   = await getDoc(doc(db, 'quizzes', quizId));
    if (!snap.exists()) throw new Error('Quiz not found.');
    var qData  = snap.data();
    if (qData.host_uid !== user.uid) throw new Error('Permission denied.');
    var hostName = user.email || user.uid;
    try {
        var uSnap = await getDoc(doc(db, 'users', user.uid));
        if (uSnap.exists()) hostName = uSnap.data().name || uSnap.data().email || user.uid;
    } catch(_) {}
    var attSnap = await getDocs(query(collection(db, 'attempts'), where('quiz_id', '==', quizId)));
    var attArchive = attSnap.docs.map(function(d) {
        var a = d.data();
        var customRaw = a.custom_form_data || a.custom_data || {};
        return {
            id:               d.id,
            participant_name: a.participant_name || 'Anonymous',
            score:            a.score,
            total:            a.total,
            custom_form_data: typeof customRaw === 'string' ? customRaw : JSON.stringify(customRaw),
            finished_at:      tsToStr(a.finished_at)
        };
    });
    await addDoc(collection(db, 'deleted_quizzes'), {
        original_id:    quizId,
        deleted_by:     user.uid,
        host_name:      hostName,
        deleted_at:     serverTimestamp(),
        title:          qData.title || '',
        subject:        qData.subject || '',
        num_questions:  qData.num_questions || (qData.questions || []).length,
        status:         qData.status || 'draft',
        mode:           qData.mode || 'exam',
        quiz_token:     qData.quiz_token || '',
        quiz_url:       qData.quiz_url || '',
        created_at_str: tsToStr(qData.created_at),
        custom_form:    qData.custom_form || [],
        total_attempts: attArchive.length,
        attempts:       attArchive
    });
    await deleteDoc(doc(db, 'quizzes', quizId));
    return { deleted: true };
}

async function actionGetDeletedQuizzes(data) {
    var user = requireAuth();
    var uSnap2 = await getDoc(doc(db, 'users', user.uid));
    if (!uSnap2.exists() || uSnap2.data().role !== 'admin') throw new Error('Admin access required.');
    var delSnap = await getDocs(query(collection(db, 'deleted_quizzes'), orderBy('deleted_at', 'desc'), limit(200)));
    return delSnap.docs.map(function(d) {
        var q = d.data();
        return {
            id:             d.id,
            original_id:    q.original_id || '',
            title:          q.title || '',
            subject:        q.subject || '',
            mode:           q.mode || 'exam',
            host_name:      q.host_name || 'Unknown',
            deleted_by:     q.deleted_by || '',
            total_attempts: q.total_attempts || 0,
            num_questions:  q.num_questions || 0,
            status:         q.status || 'draft',
            quiz_token:     q.quiz_token || '',
            created_at_str: q.created_at_str || '',
            deleted_at:     tsToStr(q.deleted_at),
            attempts:       q.attempts || []
        };
    });
}

async function actionToggleQuizStatus(data) {
    var user         = requireAuth();
    var quizId       = String(data.quiz_id || '');
    var toggleAction = data.toggle_action || 'disable';
    var snap         = await getDoc(doc(db, 'quizzes', quizId));
    if (!snap.exists()) throw new Error('Quiz not found.');
    if (snap.data().host_uid !== user.uid) throw new Error('Permission denied.');
    var newStatus = toggleAction === 'enable' ? 'active' : 'disabled';
    await updateDoc(doc(db, 'quizzes', quizId), { host_status: newStatus, updated_at: serverTimestamp() });
    return { host_status: newStatus };
}

async function actionGetQuizActivity(data) {
    var quizId = String(data.quiz_id || '');
    var quizSnap = await getDoc(doc(db, 'quizzes', quizId));
    var qData = quizSnap.exists() ? quizSnap.data() : {};
    /* No orderBy — avoids composite index requirement; sort client-side */
    var attSnap2 = await getDocs(query(collection(db, 'attempts'), where('quiz_id', '==', quizId)));
    var acts = attSnap2.docs.map(function(d) {
        var a = d.data();
        var ms = a.finished_at && a.finished_at.toDate ? a.finished_at.toDate().getTime() : 0;
        return { id: d.id, participant: a.participant_name || 'Anonymous', score: a.score, total: a.total, finished_at: tsToStr(a.finished_at), _ms: ms };
    });
    acts.sort(function(a, b) { return b._ms - a._ms; });
    return {
        quiz_id: quizId,
        quiz: {
            title:         qData.title || '',
            subject:       qData.subject || '',
            num_questions: qData.num_questions || (qData.questions || []).length,
            status:        qData.status || 'draft',
            host_status:   qData.host_status || 'active',
            created_at:    tsToStr(qData.created_at)
        },
        attempts: acts
    };
}

async function actionGetQuizForEdit(data) {
    var user   = requireAuth();
    var quizId = String(data.quiz_id || '');
    var snap   = await getDoc(doc(db, 'quizzes', quizId));
    if (!snap.exists()) throw new Error('Quiz not found.');
    var q = snap.data();
    if (q.host_uid !== user.uid) throw new Error('Permission denied — you do not own this quiz.');
    return {
        quiz_id:       quizId,
        title:         q.title         || '',
        subject:       q.subject       || '',
        num_questions: q.num_questions || (q.questions || []).length,
        time_limit:    q.time_limit    || 30,
        mode:          q.mode          || 'exam',
        allow_retakes: q.allow_retakes !== undefined ? q.allow_retakes : 1,
        show_results:  q.show_results  !== false,
        quiz_note:     q.quiz_note     || '',
        custom_form:   q.custom_form   || [],
        questions:     q.questions     || [],
        status:        q.status        || 'draft'
    };
}

/* ============================================================
   ATTEMPT ACTIONS
   ============================================================ */
async function actionCheckRetake(data) {
    var token = data.token || '';
    var name  = (data.participant_name || '').trim();

    /* Get quiz */
    var snap = await getDocs(query(collection(db, 'quizzes'), where('quiz_token', '==', token)));
    if (snap.empty) throw new Error('Quiz not found.');
    var quizDoc = snap.docs[0];
    var q = quizDoc.data();

    if (q.allow_retakes === 0) {
        /* Single where only — avoids composite index; filter name client-side */
        var aSnap = await getDocs(
            query(collection(db, 'attempts'), where('quiz_id', '==', quizDoc.id))
        );
        var alreadyTaken = aSnap.docs.some(function(d) {
            return (d.data().participant_name || '').trim().toLowerCase() === name.toLowerCase();
        });
        if (alreadyTaken) throw new Error('You have already taken this quiz and retakes are not allowed.');
    }

    return {
        allowed:       true,
        quiz_id:       quizDoc.id,
        title:         q.title,
        subject:       q.subject,
        num_questions: q.num_questions || (q.questions || []).length,
        time_limit:    q.time_limit,
        mode:          q.mode,
        quiz_token:    q.quiz_token,
        custom_form:   q.custom_form || [],
        quiz_note:     q.quiz_note || '',
        questions:     q.questions || [],
        show_results:  q.show_results !== false
    };
}

async function actionSubmitAttempt(data) {
    var quizId          = String(data.quiz_id || '');
    var quizToken       = data.quiz_token || '';
    var participantName = (data.participant_name || 'Anonymous').trim();
    var answersMap      = {};
    var customData      = {};

    try { answersMap  = JSON.parse(data.answers          || '{}'); } catch(_) {}
    try { customData  = JSON.parse(data.custom_form_data || data.custom_data || '{}'); } catch(_) {}

    /* Resolve quizId from token if needed */
    if (!quizId && quizToken) {
        var tSnap = await getDocs(query(collection(db, 'quizzes'), where('quiz_token', '==', quizToken)));
        if (!tSnap.empty) quizId = tSnap.docs[0].id;
    }

    if (!quizId) throw new Error('Quiz ID missing — cannot submit.');

    /* Fetch quiz to compute score and build results */
    var quizSnap = await getDoc(doc(db, 'quizzes', quizId));
    if (!quizSnap.exists()) throw new Error('Quiz not found.');
    var quizData  = quizSnap.data();
    var questions = quizData.questions || [];

    /* Score the attempt */
    var score   = 0;
    var total   = questions.length;
    var results = questions.map(function(q, i) {
        var raw        = answersMap[i] !== undefined ? answersMap[i] : answersMap[String(i)];
        var userAnswer = (raw !== undefined && raw !== null && raw !== '') ? parseInt(raw) : null;
        if (userAnswer !== null && isNaN(userAnswer)) userAnswer = null;
        var correct    = parseInt(q.correct_answer_index);
        var isCorrect  = (userAnswer !== null && userAnswer === correct);
        if (isCorrect) score++;
        return {
            question:    q.question,
            options:     q.options || [],
            user_answer: userAnswer,
            correct:     correct,
            is_correct:  isCorrect,
            explanation: q.explanation || ''
        };
    });

    var takerEmail = (data.taker_email || '').trim();

    /* Save attempt */
    var attemptDoc = {
        quiz_id:          quizId,
        quiz_token:       quizToken || quizData.quiz_token || '',
        participant_name: participantName,
        custom_form_data: typeof customData === 'string' ? customData : JSON.stringify(customData),
        score:            score,
        total:            total,
        answers:          answersMap,
        finished_at:      serverTimestamp()
    };
    if (takerEmail) attemptDoc.taker_email = takerEmail;
    var attemptRef = await addDoc(collection(db, 'attempts'), attemptDoc);

    return {
        attempt_id: attemptRef.id,
        quiz_title: quizData.title   || '',
        subject:    quizData.subject || '',
        score:      score,
        total:      total,
        results:    results,
        mode:       quizData.mode || 'exam'
    };
}

async function actionGetAttendance(data) {
    var quizId = String(data.quiz_id || '');
    /* No orderBy — avoids composite index requirement; sort client-side instead */
    var attSnap3 = await getDocs(query(collection(db, 'attempts'), where('quiz_id', '==', quizId)));
    var quizSnap3 = await getDoc(doc(db, 'quizzes', quizId));
    var quizData3 = quizSnap3.exists() ? quizSnap3.data() : {};
    var attempts = attSnap3.docs.map(function(d) {
        var a = d.data();
        var customRaw = a.custom_form_data || a.custom_data || {};
        return {
            id:               d.id,
            participant_name: a.participant_name || 'Anonymous',
            score:            a.score,
            total:            a.total,
            custom_form_data: typeof customRaw === 'string' ? customRaw : JSON.stringify(customRaw),
            finished_at:      tsToStr(a.finished_at),
            finished_at_ms:   a.finished_at && a.finished_at.toDate ? a.finished_at.toDate().getTime() : 0
        };
    });
    /* Sort newest first client-side */
    attempts.sort(function(a, b) { return b.finished_at_ms - a.finished_at_ms; });
    return {
        quiz_id:      quizId,
        quiz_title:   quizData3.title || '',
        quiz_subject: quizData3.subject || '',
        custom_form:  quizData3.custom_form || [],
        attempts:     attempts
    };
}

async function actionGetAttemptAnalysis(data) {
    var attemptId = data.attempt_id || '';
    var snap = await getDoc(doc(db, 'attempts', attemptId));
    if (!snap.exists()) throw new Error('Attempt not found.');
    var a = snap.data();

    /* Get quiz questions for analysis */
    var quizSnap = await getDoc(doc(db, 'quizzes', a.quiz_id));
    var quizData = quizSnap.exists() ? quizSnap.data() : {};
    var questions = quizData.questions || [];
    var answers   = a.answers || [];

    var analysis = questions.map(function(q, i) {
        var given   = answers[i];
        var correct = q.correct_answer_index;
        return {
            question:     q.question,
            options:      q.options,
            correct:      correct,
            given:        given !== undefined ? given : -1,
            is_correct:   given === correct,
            explanation:  q.explanation || ''
        };
    });

    return {
        attempt_id:       attemptId,
        participant_name: a.participant_name,
        score:            a.score,
        total:            a.total,
        quiz_title:       quizData.title || '',
        subject:          quizData.subject || '',
        analysis:         analysis,
        finished_at:      tsToStr(a.finished_at)
    };
}

async function actionGetLeaderboard(data) {
    var token  = data.token || '';
    var snap   = await getDocs(query(collection(db, 'quizzes'), where('quiz_token', '==', token)));
    if (snap.empty) throw new Error('Quiz not found.');
    var quizId = snap.docs[0].id;
    var quizTitle = snap.docs[0].data().title || '';
    var total  = snap.docs[0].data().num_questions || 0;

    /* No orderBy — avoids composite index requirement; sort client-side instead */
    var aSnap = await getDocs(
        query(collection(db, 'attempts'), where('quiz_id', '==', quizId))
    );

    var rows = aSnap.docs.map(function(d) {
        var a = d.data();
        var pct = total > 0 ? Math.round((a.score / total) * 100) : 0;
        return {
            participant_name: a.participant_name || 'Anonymous',
            score:            typeof a.score === 'number' ? a.score : 0,
            total:            total,
            percent:          pct,
            finished_at:      tsToStr(a.finished_at)
        };
    });
    /* Sort by score descending, take top 20, assign rank */
    rows.sort(function(a, b) { return b.score - a.score; });
    rows = rows.slice(0, 20);
    rows.forEach(function(r, i) { r.rank = i + 1; });

    return { quiz_title: quizTitle, leaderboard: rows };
}

async function actionGetMyAttempts(data) {
    var user = auth.currentUser || window._aqsFirebaseUser;
    if (!user) return [];

    /* Get user profile to find name */
    var profileSnap = await getDoc(doc(db, 'users', user.uid));
    var profile = profileSnap.exists() ? profileSnap.data() : {};
    var name = profile.name || user.displayName || user.email || '';

    /* Single where only — avoids composite index; sort + limit client-side */
    var snap = await getDocs(
        query(collection(db, 'attempts'), where('participant_name', '==', name))
    );

    var results = [];
    for (var d of snap.docs) {
        var a = d.data();
        var quizSnap = await getDoc(doc(db, 'quizzes', a.quiz_id));
        var quizData = quizSnap.exists() ? quizSnap.data() : {};
        results.push({
            attempt_id:  d.id,
            quiz_title:  quizData.title || 'Unknown Quiz',
            subject:     quizData.subject || '',
            score:       a.score,
            total:       a.total,
            finished_at: tsToStr(a.finished_at),
            finished_at_ms: a.finished_at && a.finished_at.toDate ? a.finished_at.toDate().getTime() : 0
        });
    }
    /* Sort newest first, keep last 30 */
    results.sort(function(a, b) { return b.finished_at_ms - a.finished_at_ms; });
    return results.slice(0, 30);
}

async function actionGetUserDashboard(data) {
    /* Single where only — avoids composite index; filter host_status client-side */
    var snap = await getDocs(query(collection(db, 'quizzes'), where('status', '==', 'published')));
    var quizzes = snap.docs
        .filter(function(d) {
            var hs = d.data().host_status;
            /* Include if host_status is 'active' or not set (legacy quizzes) */
            return !hs || hs === 'active';
        })
        .map(function(d) {
            var q = d.data();
            return {
                id:            d.id,
                title:         q.title,
                subject:       q.subject,
                num_questions: q.num_questions || (q.questions || []).length,
                time_limit:    q.time_limit,
                mode:          q.mode,
                quiz_url:      q.quiz_url || ('take-quiz.html?token=' + q.quiz_token)
            };
        });
    return { quizzes: quizzes };
}

/* ============================================================
   AI GENERATE (proxy fallback — forwards to Pollinations)
   ============================================================ */
async function actionAiGenerate(data) {
    var prompt = data.prompt || '';
    var model  = data.model  || 'openai-fast';
    var res = await fetch('https://text.pollinations.ai/openai', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model:    model,
            seed:     data.seed || Math.floor(Math.random() * 99999),
            temperature: 0.4,
            messages: [
                { role: 'system', content: 'You are an expert quiz maker. Output ONLY raw valid JSON.' },
                { role: 'user',   content: prompt }
            ]
        })
    });
    if (!res.ok) throw new Error('AI proxy error: ' + res.status);
    var json = await res.json();
    var text = (((json.choices || [])[0] || {}).message || {}).content || '';
    if (!text.trim()) throw new Error('Empty AI response');
    return { text: text.trim() };
}

/* ============================================================
   CHALLENGE MODE (Firebase Realtime Database)
   ============================================================ */
async function actionChCreate(data) {
    /* Challenge creation is public — no login required.
       Use Firebase uid if logged in, else a generated anonymous host id. */
    var firebaseUser = auth.currentUser || window._aqsFirebaseUser;
    var hostUid = firebaseUser ? firebaseUser.uid : ('anon_' + generateToken(12));

    var code       = generateToken(6);
    var numPlayers = parseInt(data.num_players) || 2;
    var numRounds  = parseInt(data.num_rounds) || 1;
    var qpr        = parseInt(data.questions_per_round) || 5;
    var timePerQ   = parseInt(data.time_per_question) || 30;
    var title      = data.title || ('Challenge ' + code);
    var playerName = data.host_name || 'Host';
    var leagueMode = !!(parseInt(data.league_mode));
    var questions  = [];
    try { questions = JSON.parse(data.questions_json || data.questions || '[]'); } catch(_) {}

    /* In league mode, number of rounds = numPlayers - 1 (one per elimination) */
    if (leagueMode) numRounds = Math.max(1, numPlayers - 1);
    /* Each player must have their own unique question slice so no two players
       see the same question. Total pool = numPlayers × qpr (one full set per player).
       Standard mode also needs numPlayers × qpr per round × numRounds. */
    var numQ = numPlayers * qpr * numRounds;
    var challengeData = {
        code:                code,
        host_uid:            hostUid,
        title:               title,
        status:              'waiting',
        phase:               'waiting',
        num_players:         numPlayers,
        num_rounds:          numRounds,
        questions_per_round: qpr,
        time_per_question:   timePerQ,
        num_questions:       numQ,
        questions:           questions,
        players:             [],
        chat:                [],
        round:               0,
        attempt_idx:         0,
        scores:              {},
        league_mode:         leagueMode,
        created_at:          Date.now(),
        server_time:         Date.now() / 1000
    };

    await set(ref(rtdb, 'challenges/' + code), challengeData);

    /* Join as host (position 0) */
    var playerToken = generateToken(12);
    var hostPlayer = {
        position:     0,
        player_name:  playerName,
        player_token: playerToken,
        character_id: (data.character_id || 'koda').trim(),
        is_host:      1,
        score:        0,
        joined_at:    Date.now()
    };
    await update(ref(rtdb, 'challenges/' + code), {
        ['players/0']: hostPlayer
    });

    return {
        code:                code,
        player_token:        playerToken,
        position:            0,
        is_host:             true,
        num_players:         numPlayers,
        num_rounds:          numRounds,
        questions_per_round: qpr,
        time_per_question:   timePerQ,
        num_questions:       numQ,
        title:               title,
        host_name:           playerName
    };
}

async function actionChJoin(data) {
    var code       = (data.code || '').toUpperCase();
    var playerName = (data.player_name || '').trim();

    var snap = await get(ref(rtdb, 'challenges/' + code));
    if (!snap.exists()) throw new Error('Challenge not found. Check the code and try again.');
    var ch = snap.val();

    if (ch.status === 'finished') throw new Error('This challenge has already ended.');

    var players = ch.players ? Object.values(ch.players) : [];
    if (players.length >= ch.num_players && ch.status === 'waiting') throw new Error('This challenge is full.');

    /* Find first empty position */
    var takenPositions = players.map(function(p) { return parseInt(p.position); });
    var position = -1;
    for (var i = 0; i < ch.num_players; i++) {
        if (takenPositions.indexOf(i) === -1) { position = i; break; }
    }
    if (position === -1) throw new Error('No available slots.');

    var playerToken = generateToken(12);
    var characterId = (data.character_id || 'koda').trim();
    var playerData = {
        position:     position,
        player_name:  playerName,
        player_token: playerToken,
        character_id: characterId,
        is_host:      0,
        score:        0,
        joined_at:    Date.now()
    };
    await update(ref(rtdb, 'challenges/' + code), {
        ['players/' + position]: playerData
    });

    var joinedMidGame = ch.status !== 'waiting';

    return {
        code:                code,
        player_token:        playerToken,
        position:            position,
        is_host:             false,
        num_players:         ch.num_players,
        num_rounds:          ch.num_rounds,
        questions_per_round: ch.questions_per_round,
        time_per_question:   ch.time_per_question,
        num_questions:       ch.num_questions,
        title:               ch.title,
        host_name:           players.find(function(p) { return p.is_host; }) ? players.find(function(p) { return p.is_host; }).player_name : 'Host',
        joined_mid_game:     joinedMidGame
    };
}

async function actionChStart(data) {
    var code = (data.code || '').toUpperCase();
    var snap = await get(ref(rtdb, 'challenges/' + code));
    if (!snap.exists()) throw new Error('Challenge not found.');
    var ch = snap.val();

    /* Distribute questions among players — handle Firebase object-arrays */
    var rawQ = ch.questions || [];
    var questions = Array.isArray(rawQ) ? rawQ : Object.values(rawQ);
    var numPlayers = ch.num_players || 2;
    var qpr        = ch.questions_per_round || 5;
    var nr         = ch.num_rounds || 1;
    var perPlayer  = qpr * nr;
    var leagueMode = !!(ch.league_mode);

    var assignments = {};
    var qLen = questions.length || 1;

    if (leagueMode) {
        /* League mode: each player gets their OWN unique slice of the question pool
           so no two players are shown the same question.
           Player p gets questions offset by p*qpr within each league round.
           This means when primary_pos rotates to player p, everyone sees that
           player's unique question set — fair head-to-head competition. */
        var leagueRounds = Math.max(1, numPlayers - 1);
        var leaguePerPlayer = qpr * leagueRounds;
        for (var p = 0; p < numPlayers; p++) {
            var playerQs = [];
            for (var lr = 0; lr < leagueRounds; lr++) {
                for (var qi = 0; qi < qpr; qi++) {
                    /* Offset: league round × pool-width + player-slot × qpr + question index */
                    var poolOffset = (lr * numPlayers * qpr) + (p * qpr) + qi;
                    playerQs.push(questions[poolOffset % qLen]);
                }
            }
            assignments['player_questions/' + p] = playerQs;
        }
        /* All positions start as active */
        var initActive = [];
        for (var ap = 0; ap < numPlayers; ap++) initActive.push(ap);

        await update(ref(rtdb, 'challenges/' + code), Object.assign(assignments, {
            status:                'active',
            phase:                 'active',
            round:                 1,
            attempt_idx:           0,
            q_in_round:            1,
            answers_this_q:        {},
            started_at:            Date.now(),
            question_started_at:   Date.now(),
            server_time:           Date.now() / 1000,
            total_rounds:          1,   /* grows by 1 after each league elimination */
            active_pos:            0,
            primary_pos:           0,
            league_round:          1,
            league_active_players: initActive
        }));
    } else {
        /* Standard mode: interleaved per-player questions */
        for (var p = 0; p < numPlayers; p++) {
            var playerQs = [];
            for (var qi = 0; qi < perPlayer; qi++) {
                playerQs.push(questions[(p + qi * numPlayers) % qLen]);
            }
            assignments['player_questions/' + p] = playerQs;
        }

        await update(ref(rtdb, 'challenges/' + code), Object.assign(assignments, {
            status:              'active',
            phase:               'active',
            round:               1,
            attempt_idx:         0,
            q_in_round:          1,
            answers_this_q:      {},
            started_at:          Date.now(),
            question_started_at: Date.now(),
            server_time:         Date.now() / 1000,
            total_rounds:        nr,
            active_pos:          0,
            primary_pos:         0
        }));
    }

    return { started: true };
}

async function actionChPoll(data) {
    var code = (data.code || '').toUpperCase();
    if (!code) return { status: 'error' };

    var snap = await get(ref(rtdb, 'challenges/' + code));
    if (!snap.exists()) return { status: 'error', error: 'Not found' };
    var ch = snap.val();

    var players = ch.players ? Object.values(ch.players) : [];

    /* Time-based auto-advance: if active player's timer expired, record a no-answer and move on */
    if (ch.status === 'active' && ch.phase === 'active') {
        var elapsed    = (Date.now() - (ch.question_started_at || Date.now())) / 1000;
        var timeLimit  = (ch.time_per_question || 30);
        if (elapsed >= timeLimit + 2) {
            /* Active player timed out — record no-answer (answerIdx=-1) and advance */
            var activePos  = ch.active_pos !== undefined ? parseInt(ch.active_pos) : 0;
            var numPlayers = ch.num_players || 2;
            var answersThisQ  = Object.assign({}, ch.answers_this_q || {});
            var isStealNow    = !!(ch.steal_mode);
            var stealOfNow    = ch.steal_of_pos !== undefined ? parseInt(ch.steal_of_pos) : -1;
            if (!answersThisQ[activePos]) {
                answersThisQ[activePos] = {
                    answer_idx: -1, is_correct: false,
                    time_ms: elapsed * 1000, is_steal: isStealNow, pts: 0
                };
            }
            var timedAttempt = (ch.attempt_idx || 0) + 1;
            var players2     = ch.players ? Object.values(ch.players) : [];

            /* Player timed out → reveal and advance to next turn (no steal) */
            await update(ref(rtdb, 'challenges/' + code), {
                answers_this_q:  answersThisQ,
                steal_mode:      false,
                steal_of_pos:    null,
                phase:           'reveal',
                last_result: {
                    player_pos: activePos, winner_pos: -1,
                    is_correct: false, answer_idx: -1, correct_idx: -1,
                    pts: 0, skipped: true, steal_offered: false
                },
                server_time: Date.now() / 1000
            });
            setTimeout(async function() {
                var snap3 = await get(ref(rtdb, 'challenges/' + code));
                if (snap3.exists()) await _advanceNextOrQuestion(code, snap3.val());
            }, 2000);
            var snap2 = await get(ref(rtdb, 'challenges/' + code));
            ch = snap2.val();
        }
    }

    /* Resolve active players list for league mode */
    var leagueActive = null;
    if (ch.league_active_players) {
        leagueActive = Array.isArray(ch.league_active_players)
            ? ch.league_active_players
            : Object.values(ch.league_active_players).map(Number);
    }

    return {
        code:                   ch.code || code,
        status:                 ch.status,
        phase:                  ch.phase,
        round:                  ch.round || 1,
        attempt_idx:            ch.attempt_idx || 0,
        q_in_round:             ch.q_in_round || 1,
        num_players:            ch.num_players,
        num_rounds:             ch.num_rounds,
        num_questions:          ch.num_questions,
        questions_per_round:    ch.questions_per_round,
        time_per_question:      ch.time_per_question,
        total_rounds:           ch.total_rounds || ch.num_rounds,
        title:                  ch.title,
        host_name:              (players.find(function(p) { return p.is_host; }) || {}).player_name || 'Host',
        players:                players,
        scores:                 ch.scores || {},
        player_questions:       ch.player_questions || {},
        active_pos:             ch.active_pos !== undefined ? ch.active_pos : 0,
        primary_pos:            ch.primary_pos !== undefined ? ch.primary_pos : 0,
        steal_mode:             ch.steal_mode || false,
        steal_of_pos:           ch.steal_of_pos !== undefined ? ch.steal_of_pos : null,
        answers_this_q:         ch.answers_this_q || {},
        last_result:            ch.last_result || null,
        current_question:       ch.current_question || null,
        reveal_answer:          ch.reveal_answer || null,
        chat:                   ch.chat ? (Array.isArray(ch.chat) ? ch.chat : Object.values(ch.chat)) : [],
        server_time:            Date.now() / 1000,
        question_started_at:    (ch.question_started_at || Date.now()) / 1000,
        /* League mode fields */
        league_mode:            ch.league_mode || false,
        league_round:           ch.league_round || 1,
        league_active_players:  leagueActive,
        league_eliminated_pos:  ch.league_eliminated_pos !== undefined ? ch.league_eliminated_pos : null,
        league_eliminated_name: ch.league_eliminated_name || null,
        league_eliminated_char: ch.league_eliminated_char || null
    };
}

async function _advanceQuestion(code, ch) {
    var qInRound   = (ch.q_in_round || 1) + 1;
    var round      = ch.round || 1;
    var qpr        = ch.questions_per_round || 5;
    var totalR     = ch.total_rounds || ch.num_rounds || 1;
    var leagueMode = !!(ch.league_mode);

    /* Resolve active players for league mode */
    var activePlayers = null;
    if (leagueMode && ch.league_active_players) {
        activePlayers = Array.isArray(ch.league_active_players)
            ? ch.league_active_players.slice()
            : Object.values(ch.league_active_players).map(Number);
    }
    var firstActive = activePlayers ? activePlayers[0] : 0;

    if (qInRound > qpr) {
        qInRound = 1;
        round++;
    }

    if (round > totalR) {
        if (leagueMode && activePlayers && activePlayers.length > 1) {
            /* League round finished — eliminate the lowest scorer */
            await _leagueEliminate(code, ch);
            return;
        }
        /* Game over */
        await update(ref(rtdb, 'challenges/' + code), {
            status: 'finished',
            phase:  'finished',
            server_time: Date.now() / 1000
        });
        return;
    }

    /* New question */
    await update(ref(rtdb, 'challenges/' + code), {
        phase:               'active',
        round:               round,
        q_in_round:          qInRound,
        attempt_idx:         (ch.attempt_idx || 0) + 1,
        answers_this_q:      {},
        active_pos:          firstActive,
        primary_pos:         firstActive,
        question_started_at: Date.now(),
        server_time:         Date.now() / 1000
    });
}

/* ── League Mode: eliminate lowest scorer, then start the next round ── */
async function _leagueEliminate(code, ch) {
    var activePlayers = Array.isArray(ch.league_active_players)
        ? ch.league_active_players.slice()
        : Object.values(ch.league_active_players || {}).map(Number);
    var scores  = ch.scores || {};
    var players = ch.players ? Object.values(ch.players) : [];

    /* Find player(s) with the lowest score among active participants */
    var lowestScore = Infinity;
    activePlayers.forEach(function(pos) {
        var s = scores[pos] !== undefined ? scores[pos] : 0;
        if (s < lowestScore) lowestScore = s;
    });
    var tiedLowest = activePlayers.filter(function(pos) {
        return (scores[pos] !== undefined ? scores[pos] : 0) === lowestScore;
    });
    /* If tied at the bottom, eliminate the one with the highest position index
       (arbitrary but deterministic) */
    var eliminatedPos = tiedLowest[tiedLowest.length - 1];

    var newActivePlayers = activePlayers.filter(function(pos) { return pos !== eliminatedPos; });
    var newLeagueRound   = (ch.league_round || 1) + 1;
    var newTotalRounds   = (ch.total_rounds || 1) + 1;

    /* Fetch eliminated player's display info */
    var elim = players.find(function(p) { return parseInt(p.position) === eliminatedPos; });
    var elimName = elim ? elim.player_name : ('Player ' + (eliminatedPos + 1));
    var elimChar = elim ? (elim.character_id || 'koda') : 'koda';

    /* Set elimination phase — clients will show an animated overlay */
    await update(ref(rtdb, 'challenges/' + code), {
        phase:                    'league_elimination',
        league_eliminated_pos:    eliminatedPos,
        league_eliminated_name:   elimName,
        league_eliminated_char:   elimChar,
        league_round:             newLeagueRound,
        league_active_players:    newActivePlayers,
        server_time:              Date.now() / 1000
    });

    if (newActivePlayers.length <= 1) {
        /* Only one player left — announce game over after overlay displays */
        setTimeout(async function() {
            await update(ref(rtdb, 'challenges/' + code), {
                status: 'finished',
                phase:  'finished',
                server_time: Date.now() / 1000
            });
        }, 7000);
    } else {
        /* Start next league round after clients have had time to view the overlay */
        setTimeout(async function() {
            var s2 = await get(ref(rtdb, 'challenges/' + code));
            if (!s2.exists()) return;
            var ch2 = s2.val();
            var nextActive = Array.isArray(ch2.league_active_players)
                ? ch2.league_active_players
                : Object.values(ch2.league_active_players || {}).map(Number);
            var firstNext = nextActive.length ? nextActive[0] : 0;
            await update(ref(rtdb, 'challenges/' + code), {
                phase:               'active',
                round:               newTotalRounds,
                total_rounds:        newTotalRounds,
                q_in_round:          1,
                attempt_idx:         (ch2.attempt_idx || 0) + 1,
                answers_this_q:      {},
                steal_mode:          false,
                steal_of_pos:        null,
                active_pos:          firstNext,
                primary_pos:         firstNext,
                question_started_at: Date.now(),
                server_time:         Date.now() / 1000
            });
        }, 7000);
    }
}

async function actionChAnswer(data) {
    var code        = (data.code || '').toUpperCase();
    var playerToken = data.player_token || '';
    var answerIdx   = parseInt(data.answer_idx !== undefined ? data.answer_idx : data.answer_index);
    if (isNaN(answerIdx)) answerIdx = -1;

    var snap = await get(ref(rtdb, 'challenges/' + code));
    if (!snap.exists()) throw new Error('Challenge not found.');
    var ch = snap.val();

    var players    = ch.players ? Object.values(ch.players) : [];
    var player     = players.find(function(p) { return p.player_token === playerToken; });
    if (!player) throw new Error('Player not found.');

    var pos        = player.position;
    var activePos  = ch.active_pos !== undefined ? parseInt(ch.active_pos) : 0;
    var numPlayers = ch.num_players || 2;

    /* Only the active player's answer is accepted */
    if (pos !== activePos) {
        return { is_correct: false, score: ((ch.scores || {})[pos] || 0), time_bonus: 0 };
    }

    var isStealMode = !!(ch.steal_mode);
    var stealOfPos  = ch.steal_of_pos !== undefined ? parseInt(ch.steal_of_pos) : -1;

    var elapsed   = (Date.now() - (ch.question_started_at || Date.now())) / 1000;
    var timeBonus = Math.max(0, Math.round((1 - elapsed / (ch.time_per_question || 30)) * 100));

    /* In steal mode the question belongs to the player who originally missed */
    var questionOwner = isStealMode ? stealOfPos : pos;
    var rawPQ         = (ch.player_questions || {})[questionOwner] || (ch.player_questions || {})[String(questionOwner)] || {};
    var pQuestions    = Array.isArray(rawPQ) ? rawPQ : Object.values(rawPQ);
    var qIdx          = ((ch.q_in_round || 1) - 1) + ((ch.round || 1) - 1) * (ch.questions_per_round || 5);
    var currentQ      = pQuestions[qIdx] || null;

    var isCorrect  = false;
    var correctIdx = -1;
    if (currentQ) {
        correctIdx = typeof currentQ.correct_answer_index === 'number'
            ? currentQ.correct_answer_index
            : parseInt(currentQ.correct_answer_index);
        isCorrect  = (answerIdx >= 0 && answerIdx === correctIdx);
    }

    /* Skill modifiers from client */
    var skillBoost  = (data.skill_boost  && parseInt(data.skill_boost)  > 1) ? parseInt(data.skill_boost)  : 1;
    var skillShield = !!(data.skill_shield && parseInt(data.skill_shield) === 1);
    var skillD2     = !!(data.skill_d2steal && parseInt(data.skill_d2steal) === 1);
    var STEAL_PTS   = skillD2 ? 6 : 3;
    var baseCorrect = isStealMode ? STEAL_PTS : (10 + Math.round(timeBonus / 10));
    var scoreIncrease = isCorrect
        ? baseCorrect * skillBoost
        : (skillShield ? 3 : 0);
    var newScore = (((ch.scores || {})[pos]) || 0) + scoreIncrease;

    var updates = {};
    updates['scores/' + pos]         = newScore;
    updates['server_time']           = Date.now() / 1000;
    updates['answers_this_q/' + pos] = {
        answer_idx: answerIdx, is_correct: isCorrect,
        time_ms: elapsed * 1000, is_steal: isStealMode, pts: scoreIncrease
    };

    /* ── CASE 1: Wrong answer ── */
    if (!isCorrect) {
        /* Offer steal to the next player who hasn't given their primary answer yet.
           Steals only chain once — if we're already IN steal mode, just advance. */
        var canSteal    = false;
        var nextStealer = -1;
        if (!isStealMode) {
            /* Resolve active (non-eliminated) players for steal candidate search */
            var stealActivePlayers;
            if (ch.league_mode && ch.league_active_players) {
                stealActivePlayers = Array.isArray(ch.league_active_players)
                    ? ch.league_active_players.slice()
                    : Object.values(ch.league_active_players).map(Number);
            } else {
                stealActivePlayers = [];
                for (var si2 = 0; si2 < numPlayers; si2++) stealActivePlayers.push(si2);
            }
            var atq = Object.assign({}, ch.answers_this_q || {});
            atq[String(pos)] = { is_steal: false }; /* treat current player as primary-done */
            var posIdx = stealActivePlayers.indexOf(pos);
            if (posIdx < 0) posIdx = 0;
            for (var si = 1; si <= stealActivePlayers.length; si++) {
                var checkPos = stealActivePlayers[(posIdx + si) % stealActivePlayers.length];
                var entry    = atq[checkPos] !== undefined ? atq[checkPos] : atq[String(checkPos)];
                /* Can steal if they haven't done a primary answer yet */
                if (!entry || entry.is_steal) { nextStealer = checkPos; canSteal = true; break; }
            }
        }

        updates['phase']       = 'reveal';
        updates['last_result'] = {
            player_pos: pos, player_name: player.player_name, winner_pos: -1,
            is_correct: false, answer_idx: answerIdx, correct_idx: correctIdx,
            pts: 0, skipped: false, steal_offered: canSteal,
            explanation: currentQ ? (currentQ.explanation || '') : ''
        };

        if (canSteal) {
            /* Keep primary_pos unchanged so all players still see the same question.
               Only active_pos changes to the stealer. */
            updates['steal_mode']   = true;
            updates['steal_of_pos'] = pos;
            await update(ref(rtdb, 'challenges/' + code), updates);
            var _nextStealer = nextStealer;
            setTimeout(async function() {
                var s2 = await get(ref(rtdb, 'challenges/' + code));
                if (!s2.exists()) return;
                await update(ref(rtdb, 'challenges/' + code), {
                    phase:               'active',
                    active_pos:          _nextStealer,
                    attempt_idx:         (s2.val().attempt_idx || 0) + 1,
                    question_started_at: Date.now(),
                    server_time:         Date.now() / 1000
                });
            }, 2000);
        } else {
            /* No steal available (already in steal mode, or no players left) — advance normally */
            updates['steal_mode']   = false;
            updates['steal_of_pos'] = null;
            await update(ref(rtdb, 'challenges/' + code), updates);
            setTimeout(async function() {
                var s2 = await get(ref(rtdb, 'challenges/' + code));
                if (s2.exists()) await _advanceNextOrQuestion(code, s2.val());
            }, 2000);
        }
        return { is_correct: false, score: newScore, time_bonus: 0, correct_idx: correctIdx };
    }

    /* ── CASE 2: Correct answer ── */
    updates['steal_mode']   = false;
    updates['steal_of_pos'] = null;
    updates['phase']        = 'reveal';
    updates['last_result']  = {
        player_pos: pos, player_name: player.player_name, winner_pos: pos,
        is_correct: true, answer_idx: answerIdx, correct_idx: correctIdx,
        pts: scoreIncrease, skipped: false, is_steal: isStealMode,
        explanation: currentQ ? (currentQ.explanation || '') : ''
    };
    await update(ref(rtdb, 'challenges/' + code), updates);
    setTimeout(async function() {
        var s2 = await get(ref(rtdb, 'challenges/' + code));
        if (s2.exists()) await _advanceNextOrQuestion(code, s2.val());
    }, 2000);
    return { is_correct: true, score: newScore, time_bonus: timeBonus, correct_idx: correctIdx };
}

/* Find next player needing a primary turn, or advance the question if all done */
async function _advanceNextOrQuestion(code, ch) {
    var numPlayers   = ch.num_players || 2;
    var answersThisQ = ch.answers_this_q || {};

    /* Resolve the set of active (non-eliminated) players */
    var activePlayers;
    if (ch.league_mode && ch.league_active_players) {
        activePlayers = Array.isArray(ch.league_active_players)
            ? ch.league_active_players.slice()
            : Object.values(ch.league_active_players).map(Number);
    } else {
        activePlayers = [];
        for (var i = 0; i < numPlayers; i++) activePlayers.push(i);
    }
    var numActive = activePlayers.length;

    /* primary done = has an entry with is_steal !== true */
    var primaryDone = new Set();
    Object.keys(answersThisQ).forEach(function(k) {
        if (!answersThisQ[k].is_steal) primaryDone.add(parseInt(k));
    });

    /* Count only active players who have completed their primary turn */
    var activePrimaryDone = activePlayers.filter(function(p) { return primaryDone.has(p); }).length;
    if (activePrimaryDone >= numActive) {
        await _advanceQuestion(code, ch);
        return;
    }

    /* Find next active player after current active_pos who still needs primary */
    var start    = ch.active_pos !== undefined ? parseInt(ch.active_pos) : activePlayers[0];
    var startIdx = activePlayers.indexOf(start);
    if (startIdx < 0) startIdx = 0;

    var next = -1;
    for (var j = 1; j <= numActive; j++) {
        var check = activePlayers[(startIdx + j) % numActive];
        if (!primaryDone.has(check)) { next = check; break; }
    }
    if (next === -1) { await _advanceQuestion(code, ch); return; }

    await update(ref(rtdb, 'challenges/' + code), {
        phase:               'active',
        active_pos:          next,
        primary_pos:         next,
        steal_mode:          false,
        steal_of_pos:        null,
        attempt_idx:         (ch.attempt_idx || 0) + 1,
        question_started_at: Date.now(),
        server_time:         Date.now() / 1000
    });
}


async function actionChPlayAgain(data) {
    var code        = (data.code || '').toUpperCase();
    var playerToken = data.player_token || '';

    var snap = await get(ref(rtdb, 'challenges/' + code));
    if (!snap.exists()) throw new Error('Challenge not found.');
    var ch   = snap.val();

    var players = ch.players ? Object.values(ch.players) : [];
    var player  = players.find(function(p) { return p.player_token === playerToken; });
    if (!player || !player.is_host) throw new Error('Only the host can restart.');

    /* Reset scores */
    var scores = {};
    players.forEach(function(p) { scores[p.position] = 0; });

    await update(ref(rtdb, 'challenges/' + code), {
        status:              'waiting',
        phase:               'waiting',
        round:               1,
        q_in_round:          1,
        attempt_idx:         0,
        active_pos:          0,
        primary_pos:         0,
        steal_mode:          false,
        steal_of_pos:        null,
        answers_this_q:      {},
        scores:              scores,
        last_result:         null,
        question_started_at: null,
        server_time:         Date.now() / 1000
    });

    return { ok: true };
}

async function actionChChat(data) {
    var code        = (data.code || '').toUpperCase();
    var playerToken = data.player_token || '';
    var message     = (data.message || '').trim();
    if (!message) return { ok: true };

    var snap = await get(ref(rtdb, 'challenges/' + code));
    if (!snap.exists()) throw new Error('Challenge not found.');
    var ch = snap.val();

    var players = ch.players ? Object.values(ch.players) : [];
    var player  = players.find(function(p) { return p.player_token === playerToken; });
    var name    = player ? player.player_name : 'Player';

    var chatRef = push(ref(rtdb, 'challenges/' + code + '/chat'));
    await set(chatRef, { player_name: name, message: message, ts: Date.now() });

    return { ok: true };
}

async function actionChUpdateSettings(data) {
    var code    = (data.code || '').toUpperCase();
    var title   = (data.title || '').trim();
    var timePerQ = parseInt(data.time_per_question) || 30;

    await update(ref(rtdb, 'challenges/' + code), {
        title:             title,
        time_per_question: timePerQ,
        server_time:       Date.now() / 1000
    });

    return { title: title, time_per_question: timePerQ };
}

/* ============================================================
   ADMIN SETTINGS (Firestore — stored at settings/main)
   ============================================================ */
async function actionGetSettings() {
    try {
        var snap = await getDoc(doc(db, 'settings', 'main'));
        if (snap.exists()) return { settings: snap.data() };
    } catch(_) {}
    return { settings: {} };
}

async function actionSaveSettings(data) {
    var user = auth.currentUser || window._aqsFirebaseUser;
    if (!user) throw new Error('Not authenticated.');
    var payload = {};
    var allowed = [
        'groq_api_key','groq_model','groq_keys','bg_music_url',
        'splash_enabled','splash_logo_url',
        'brevo_api_key','brevo_from_name','brevo_from_email',
        'countdown_enabled','countdown_label','countdown_date','countdown_hour','countdown_minute',
        'ticker_text',
        'google_client_id','google_client_secret',
        'github_client_id','github_client_secret',
        'microsoft_client_id','microsoft_client_secret',
        'yahoo_client_id','yahoo_client_secret'
    ];
    allowed.forEach(function(k) { if (k in data) payload[k] = data[k]; });
    /* If groq_keys array is provided, keep it clean */
    if (Array.isArray(payload.groq_keys)) {
        payload.groq_keys = payload.groq_keys.filter(function(k) { return k && k.startsWith('gsk_'); });
    }
    await setDoc(doc(db, 'settings', 'main'), payload, { merge: true });
    /* Immediately expose the updated keys to aqs-groq-key.js */
    if (Array.isArray(payload.groq_keys)) {
        window._AQS_GROQ_MASTER_KEYS = payload.groq_keys;
    }
    return { success: true, message: 'Settings saved.' };
}

/* ============================================================
   ABOUT PAGE SETTINGS (Firestore — stored at settings/about)
   ============================================================ */
async function actionGetAboutSettings() {
    try {
        var snap = await getDoc(doc(db, 'settings', 'about'));
        if (snap.exists()) return snap.data();
    } catch(_) {}
    return {};
}

async function actionSaveAboutSettings(data) {
    var user = auth.currentUser || window._aqsFirebaseUser;
    if (!user) throw new Error('Not authenticated.');
    var allowed = [
        'about_plugin_desc',
        'dev_main_name','dev_main_title','dev_main_bio','dev_main_skills','dev_main_email','dev_main_github','dev_main_image',
        'dev_asst_name','dev_asst_title','dev_asst_bio','dev_asst_skills','dev_asst_email','dev_asst_github','dev_asst_image'
    ];
    var payload = {};
    allowed.forEach(function(k) { if (k in data) payload[k] = data[k]; });
    await setDoc(doc(db, 'settings', 'about'), payload, { merge: true });
    return { success: true, message: 'About settings saved.' };
}

/* ============================================================
   NOTIFICATIONS & ADS (Firestore — optional admin setup)
   ============================================================ */
async function actionGetNotifications() {
    try {
        var snap = await getDoc(doc(db, 'settings', 'notifications'));
        if (snap.exists()) return snap.data();
    } catch(_) {}
    return { countdown: { enabled: false }, ticker: { enabled: false } };
}

async function actionGetActiveAds(data) {
    try {
        var snap = await getDocs(query(collection(db, 'ads'), where('active', '==', true)));
        return snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()); });
    } catch(_) {}
    return [];
}

/* ============================================================
   HELPERS
   ============================================================ */
function _dashboardUrl(role) {
    if (role === 'admin')  return 'admin-dashboard.html';
    if (role === 'host')   return 'dashboard.html';
    return 'user-dashboard.html';
}

function _updateAqsGlobals(user, profile) {
    if (typeof AQS === 'undefined') return;
    AQS.is_logged_in      = true;
    AQS.is_host           = profile.role === 'host' || profile.role === 'admin';
    AQS.is_admin          = profile.role === 'admin';
    AQS.current_user_name = profile.name || user.displayName || '';
    AQS.current_user_id   = user.uid;
}

/* ============================================================
   AUTO AUTH-GUARD: redirect to login if page requires auth
   ============================================================ */
(function() {
    var page = window.location.pathname.split('/').pop() || 'index.html';
    var protectedPages = ['dashboard.html', 'user-dashboard.html', 'create-quiz.html', 'quiz-results.html'];
    var authPages      = ['login.html', 'register.html'];

    if (protectedPages.indexOf(page) !== -1) {
        onAuthStateChanged(auth, function(user) {
            if (!user) window.location.href = 'login.html';
        });
    }
    if (authPages.indexOf(page) !== -1) {
        onAuthStateChanged(auth, async function(user) {
            /* Do NOT redirect while a registration is in progress — the register
               success callback will do its own role-aware redirect. */
            if (window._aqsIsRegistering) return;
            if (user) {
                var redirectUrl = new URLSearchParams(window.location.search).get('redirect') || '';
                if (redirectUrl) { window.location.href = redirectUrl; return; }
                /* Look up the user's role so hosts go to the correct dashboard */
                try {
                    var profileSnap = await getDoc(doc(db, 'users', user.uid));
                    var role = profileSnap.exists() ? (profileSnap.data().role || 'student') : 'student';
                    window.location.href = _dashboardUrl(role);
                } catch(_) {
                    window.location.href = 'user-dashboard.html';
                }
            }
        });
    }

    /* ── Wire up Google sign-in buttons on login/register pages ── */
    document.addEventListener('DOMContentLoaded', function() {
        var googleBtn = document.getElementById('aqs-google-login');
        if (!googleBtn) return;

        googleBtn.addEventListener('click', async function() {
            googleBtn.disabled = true;
            googleBtn.textContent = 'Connecting…';
            try {
                var result = await handleAction({ action: 'aqs_social_login', provider: 'google' });
                if (result && result.redirect) {
                    window.location.href = result.redirect;
                }
            } catch(e) {
                googleBtn.disabled = false;
                googleBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.35-8.16 2.35-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continue with Google';
                /* Show error in alert box if present */
                var alertBox = document.getElementById('aqs-login-alert') || document.getElementById('aqs-register-alert');
                if (alertBox) {
                    alertBox.textContent = e.message || 'Google sign-in failed. Please try again.';
                    alertBox.style.display = 'block';
                    alertBox.style.background = 'rgba(239,68,68,0.12)';
                    alertBox.style.color = '#f87171';
                    alertBox.style.padding = '10px 14px';
                    alertBox.style.borderRadius = '8px';
                    alertBox.style.marginBottom = '12px';
                }
            }
        });
    });
})();

/* ============================================================
   AUTO-INIT: load Groq master keys from Firestore into global
   so aqs-groq-key.js can use them without any hardcoded secrets.
   Settings/main is publicly readable per the Firestore rules.
   ============================================================ */
(function _loadGroqKeys() {
    getDoc(doc(db, 'settings', 'main')).then(function(snap) {
        if (!snap.exists()) return;
        var s = snap.data();
        /* Support both the new groq_keys array AND the legacy single key field */
        var keys = [];
        if (Array.isArray(s.groq_keys) && s.groq_keys.length) {
            keys = s.groq_keys.filter(function(k) { return k && k.startsWith('gsk_'); });
        } else if (s.groq_api_key && s.groq_api_key.startsWith('gsk_')) {
            keys = [s.groq_api_key];
        }
        if (keys.length) window._AQS_GROQ_MASTER_KEYS = keys;
    }).catch(function() { /* silently ignore — no keys available */ });
    /* Note: _aqsFirebaseReady and aqs:firebase:ready are already set/dispatched
       by the patchJQuery IIFE above — no need to duplicate them here. */
})();

export { auth, db, rtdb, requireAuth, generateToken };
