/* Firebase Cloud Functions for SmartQuiz */
'use strict';

const crypto = require('crypto');
const admin = require('firebase-admin');
const { onRequest } = require('firebase-functions/v2/https');

admin.initializeApp();

const db = admin.firestore();
const CREATOR_IMAGE_WINDOW_MS = 24 * 60 * 60 * 1000;
const CREATOR_IMAGE_LIMIT = 5;
const CREATOR_IMAGE_COOLDOWN_MS = 62 * 1000;
const DEFAULT_CREATOR_IMAGE_MODEL = 'black-forest-labs/FLUX.1-schnell';
const REGISTRATION_OTP_COLLECTION = 'registration_otp_challenges';
const REGISTRATION_OTP_TTL_MS = 10 * 60 * 1000;
const REGISTRATION_OTP_RESEND_WAIT_MS = 60 * 1000;
const REGISTRATION_OTP_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_OTP_MAX_PER_WINDOW = 5;
const REGISTRATION_OTP_MAX_ATTEMPTS = 5;
const SMARTQUIZ_BASE_URL = 'https://darapet.github.io/smartquiz-system';
const EMAIL_PREFERENCES_URL = `${SMARTQUIZ_BASE_URL}/email-preferences.html`;

function setCors(response) {
  response.set('Access-Control-Allow-Origin', '*');
  response.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

async function verifyBearerUser(request) {
  const header = String(request.get('authorization') || '');
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new Error('Authentication required.');
  return admin.auth().verifyIdToken(token);
}

async function brevoConfiguration() {
  const [mainSnapshot, privateSnapshot] = await Promise.all([
    db.doc('settings/main').get(),
    db.doc('settings/private').get(),
  ]);
  const main = mainSnapshot.exists ? mainSnapshot.data() : {};
  const privateSettings = privateSnapshot.exists ? privateSnapshot.data() : {};
  return {
    apiKey: String(privateSettings.brevo_api_key || '').trim(),
    fromName: String(main.brevo_from_name || 'SmartQuiz').trim(),
    fromEmail: String(main.brevo_from_email || '').trim(),
  };
}

async function sendBrevoMessage({ recipient, subject, htmlContent, textContent, headers }) {
  const config = await brevoConfiguration();
  if (!config.apiKey || !config.fromEmail) {
    throw new Error('Brevo is not configured. Add an API key and sender email in Admin Settings.');
  }
  const normalizedRecipient = String(recipient || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedRecipient)) {
    throw new Error('A valid recipient email address is required.');
  }
  const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': config.apiKey,
    },
    body: JSON.stringify({
      sender: { name: config.fromName, email: config.fromEmail },
      to: [{ email: normalizedRecipient }],
      subject,
      htmlContent,
      textContent,
      ...(headers && Object.keys(headers).length ? { headers } : {}),
    }),
  });
  let responseBody = {};
  try {
    responseBody = await brevoResponse.json();
  } catch (_) {}
  if (!brevoResponse.ok) {
    const details = responseBody.message ? ` ${responseBody.message}` : '';
    throw new Error(`Brevo rejected the email.${details}`);
  }
  if (!responseBody.messageId) {
    throw new Error('Brevo accepted the request without returning a message ID. Check the Brevo activity log.');
  }
  return {
    messageId: String(responseBody.messageId),
    recipient: normalizedRecipient,
    sender: config.fromEmail,
  };
}

function registrationEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid email address.');
  }
  if (email === 'daramolapeter98@gmail.com') {
    throw new Error('Use the admin sign-in account instead.');
  }
  return email;
}

function registrationEmailId(email) {
  return crypto.createHash('sha256').update(email).digest('hex');
}

function registrationCodeHash(challengeId, code) {
  return crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex');
}

function escapeEmailHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[character]);
}

function emailShell(preheader, content, unsubscribeUrl) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f3f4f8;font-family:Arial,Helvetica,sans-serif;color:#1f2437">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeEmailHtml(preheader)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#f3f4f8;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:#ffffff;border:1px solid #e5e7ef;border-radius:18px;overflow:hidden">
<tr><td style="padding:24px 32px;background:#25235b;color:#ffffff">
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td align="center" width="38" height="38" style="width:38px;height:38px;border-radius:12px;background:#7770f2;color:#ffffff;font-size:17px;font-weight:700">S</td>
<td style="padding-left:12px;font-size:19px;font-weight:700;letter-spacing:.2px">SmartQuiz</td>
</tr></table></td></tr>
<tr><td style="padding:32px">${content}</td></tr>
<tr><td style="padding:20px 32px;border-top:1px solid #eceef4;background:#fafaff;color:#70758a;font-size:12px;line-height:1.7">
<p style="margin:0 0 8px">You received this email because you used SmartQuiz.</p>
<a href="${unsubscribeUrl}" style="color:#5953c9;text-decoration:underline">Unsubscribe from optional product updates</a>
<span style="color:#70758a">. Account and security emails, such as verification codes, may still be sent when needed.</span>
</td></tr></table>
<p style="margin:18px 0 0;color:#8b8fa0;font-size:11px;line-height:1.6">SmartQuiz · Learn, practise, and create with confidence</p>
</td></tr></table></body></html>`;
}

function otpEmailContent({ code, intro, unsubscribeUrl }) {
  const html = emailShell(
    'Your SmartQuiz verification code is ready.',
    `<p style="margin:0 0 8px;color:#6b6f82;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Security check</p>
<h1 style="margin:0 0 14px;color:#20233a;font-size:26px;line-height:1.25">Your verification code</h1>
<p style="margin:0 0 24px;color:#62677c;font-size:15px;line-height:1.7">${intro}</p>
<div style="margin:0 0 22px;padding:20px 12px;border:1px solid #e4e5f6;border-radius:14px;background:#f6f6ff;text-align:center">
<span style="color:#38358d;font-family:Arial,Helvetica,sans-serif;font-size:34px;font-weight:700;letter-spacing:10px">${escapeEmailHtml(code)}</span>
</div>
<p style="margin:0 0 8px;color:#62677c;font-size:14px;line-height:1.7">This code expires in <strong style="color:#292d43">10 minutes</strong>. For your security, never share it with anyone.</p>
<p style="margin:0;color:#8a8ea0;font-size:13px;line-height:1.7">If you didn’t request this code, you can safely ignore this email.</p>`,
    unsubscribeUrl,
  );
  return {
    html,
    text: `${intro}\n\nYour SmartQuiz verification code is ${code}. It expires in 10 minutes. Never share this code. If you did not request it, ignore this email.\n\nUnsubscribe from optional product updates: ${unsubscribeUrl}\nAccount and security emails may still be sent when needed.`,
  };
}

function welcomeEmailContent({ name, unsubscribeUrl }) {
  const safeName = escapeEmailHtml(name || 'there');
  const loginUrl = `${SMARTQUIZ_BASE_URL}/login.html`;
  const quizUrl = `${SMARTQUIZ_BASE_URL}/quiz-setup.html`;
  const studyUrl = `${SMARTQUIZ_BASE_URL}/studyhub.html`;
  const tutorUrl = `${SMARTQUIZ_BASE_URL}/ai-teacher.html`;
  const libraryUrl = `${SMARTQUIZ_BASE_URL}/library.html`;
  const docsUrl = `${SMARTQUIZ_BASE_URL}/docs-gen.html`;
  const html = emailShell(
    'Welcome to SmartQuiz. Here is how to get started.',
    `<p style="margin:0 0 8px;color:#6b6f82;font-size:13px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase">Your learning workspace is ready</p>
<h1 style="margin:0 0 14px;color:#20233a;font-size:27px;line-height:1.25">Welcome to SmartQuiz, ${safeName}</h1>
<p style="margin:0 0 22px;color:#62677c;font-size:15px;line-height:1.7">Your account has been created. Use SmartQuiz to turn what you’re learning into practice, clearer explanations, and a study routine that works for you.</p>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 22px">
<tr><td style="padding:13px 0;border-bottom:1px solid #eceef4"><a href="${quizUrl}" style="color:#38358d;font-size:15px;font-weight:700;text-decoration:none">Create an AI quiz</a><p style="margin:5px 0 0;color:#70758a;font-size:13px;line-height:1.6">Enter a topic or use your study material, then review and share your quiz.</p></td></tr>
<tr><td style="padding:13px 0;border-bottom:1px solid #eceef4"><a href="${studyUrl}" style="color:#38358d;font-size:15px;font-weight:700;text-decoration:none">Build a study routine</a><p style="margin:5px 0 0;color:#70758a;font-size:13px;line-height:1.6">Use study notes, flashcards, a Pomodoro timer, and mock exams in the Study Hub.</p></td></tr>
<tr><td style="padding:13px 0;border-bottom:1px solid #eceef4"><a href="${tutorUrl}" style="color:#38358d;font-size:15px;font-weight:700;text-decoration:none">Ask the AI Teacher</a><p style="margin:5px 0 0;color:#70758a;font-size:13px;line-height:1.6">Get explanations, ask follow-up questions, and work through difficult topics.</p></td></tr>
<tr><td style="padding:13px 0;border-bottom:1px solid #eceef4"><a href="${docsUrl}" style="color:#38358d;font-size:15px;font-weight:700;text-decoration:none">Turn documents into study resources</a><p style="margin:5px 0 0;color:#70758a;font-size:13px;line-height:1.6">Upload a PDF or Word document to create summaries, study guides, FAQs, and key points.</p></td></tr>
<tr><td style="padding:13px 0"><a href="${libraryUrl}" style="color:#38358d;font-size:15px;font-weight:700;text-decoration:none">Explore the learning library</a><p style="margin:5px 0 0;color:#70758a;font-size:13px;line-height:1.6">Browse learning resources and keep useful materials close to your studies.</p></td></tr>
</table>
<p style="margin:0 0 12px;color:#20233a;font-size:15px;font-weight:700">Getting started</p>
<ol style="margin:0 0 24px;padding-left:20px;color:#62677c;font-size:14px;line-height:1.8">
<li>Sign in with the email and password you just created.</li>
<li>Choose a quiz, the Study Hub, or the AI Teacher from the app navigation.</li>
<li>Start with a topic you’re studying, then save or share what you make.</li>
</ol>
<table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="border-radius:10px;background:#514bd0">
<a href="${loginUrl}" style="display:inline-block;padding:13px 22px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Sign in to SmartQuiz</a>
</td></tr></table>
<p style="margin:22px 0 0;color:#85899a;font-size:12px;line-height:1.6">You can return to your account setup any time if you haven’t finished your learning profile yet.</p>`,
    unsubscribeUrl,
  );
  return {
    html,
    text: `Welcome to SmartQuiz, ${name || 'there'}!\n\nYour account has been created. Here are some ways to get started:\n\n• Create AI quizzes from a topic or study material, then review and share them: ${quizUrl}\n• Use study notes, flashcards, a Pomodoro timer, and mock exams in the Study Hub: ${studyUrl}\n• Ask the AI Teacher for explanations and help with difficult topics: ${tutorUrl}\n• Turn PDF and Word files into summaries, study guides, FAQs, and key points: ${docsUrl}\n• Browse study resources in the learning library: ${libraryUrl}\n\nSign in with your new email and password: ${loginUrl}\n\nUnsubscribe from optional product updates: ${unsubscribeUrl}\nAccount and security emails may still be sent when needed.`,
  };
}

async function emailUnsubscribeUrl(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('A valid recipient email address is required.');
  }
  const preferenceId = registrationEmailId(normalizedEmail);
  const preferenceRef = db.doc(`email_preferences/${preferenceId}`);
  const token = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(preferenceRef);
    const preferences = snapshot.exists ? snapshot.data() : {};
    if (preferences.unsubscribe_token) return String(preferences.unsubscribe_token);

    const newToken = crypto.randomBytes(32).toString('hex');
    transaction.set(preferenceRef, {
      email: normalizedEmail,
      unsubscribe_token: newToken,
      product_updates_opt_out: false,
    }, { merge: true });
    transaction.set(db.doc(`email_unsubscribe_tokens/${registrationEmailId(newToken)}`), {
      preferenceId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return newToken;
  });
  return `${EMAIL_PREFERENCES_URL}?token=${encodeURIComponent(token)}`;
}

async function unsubscribeFromProductUpdates(tokenValue) {
  const token = String(tokenValue || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw registrationError('This unsubscribe link is invalid or incomplete.', 400);
  }
  const tokenSnapshot = await db.doc(`email_unsubscribe_tokens/${registrationEmailId(token)}`).get();
  if (!tokenSnapshot.exists) throw registrationError('This unsubscribe link is invalid or has expired.', 404);
  const preferenceId = String(tokenSnapshot.data().preferenceId || '');
  if (!/^[a-f0-9]{64}$/.test(preferenceId)) {
    throw registrationError('This unsubscribe link is invalid or has expired.', 404);
  }
  await db.doc(`email_preferences/${preferenceId}`).set({
    product_updates_opt_out: true,
    product_updates_unsubscribed_at: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return { unsubscribed: true };
}

async function sendWelcomeEmail(user) {
  const uid = String(user && user.uid || '').trim();
  const email = String(user && user.email || '').trim().toLowerCase();
  if (!uid || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('A valid account is required to send the welcome email.');
  }

  const reference = db.doc(`welcome_email_deliveries/${uid}`);
  const claimId = crypto.randomUUID();
  const now = Date.now();
  const claim = await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const current = snapshot.exists ? snapshot.data() : {};
    if (current.sentAt) return 'sent';
    if (Number(current.claimUntil || 0) > now) return 'in_progress';
    transaction.set(reference, { email, claimId, claimUntil: now + 2 * 60 * 1000 }, { merge: true });
    return 'claimed';
  });
  if (claim === 'sent') return { sent: true, alreadySent: true };
  if (claim === 'in_progress') return { sent: false, inProgress: true };

  try {
    const unsubscribeUrl = await emailUnsubscribeUrl(email);
    const name = String(user.name || user.displayName || email.split('@')[0]).trim();
    const content = welcomeEmailContent({ name, unsubscribeUrl });
    const result = await sendBrevoMessage({
      recipient: email,
      subject: 'Welcome to SmartQuiz — let’s get started',
      htmlContent: content.html,
      textContent: content.text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
    });
    await reference.set({
      email,
      sentAt: admin.firestore.FieldValue.serverTimestamp(),
      claimId: admin.firestore.FieldValue.delete(),
      claimUntil: admin.firestore.FieldValue.delete(),
    }, { merge: true });
    return { sent: true, accepted: true, ...result };
  } catch (error) {
    const snapshot = await reference.get().catch(() => null);
    if (snapshot && snapshot.exists && snapshot.data().claimId === claimId) {
      await reference.set({
        claimId: admin.firestore.FieldValue.delete(),
        claimUntil: admin.firestore.FieldValue.delete(),
      }, { merge: true }).catch(() => {});
    }
    throw error;
  }
}

function registrationError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}

async function sendRegistrationOtp(payload) {
  const email = registrationEmail(payload.email);
  const reference = db.collection(REGISTRATION_OTP_COLLECTION).doc(registrationEmailId(email));
  const now = Date.now();
  const code = String(crypto.randomInt(100000, 1000000));
  const challengeId = crypto.randomBytes(24).toString('hex');
  let expiresAt = now + REGISTRATION_OTP_TTL_MS;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const previous = snapshot.exists ? snapshot.data() : {};
    const lastSentAt = Number(previous.lastSentAt || 0);
    if (lastSentAt && now - lastSentAt < REGISTRATION_OTP_RESEND_WAIT_MS) {
      const waitSeconds = Math.ceil((REGISTRATION_OTP_RESEND_WAIT_MS - (now - lastSentAt)) / 1000);
      throw registrationError(`Please wait ${waitSeconds} seconds before requesting another code.`, 429);
    }

    const windowStart = Number(previous.windowStart || 0);
    const withinWindow = windowStart && now - windowStart < REGISTRATION_OTP_WINDOW_MS;
    const sendCount = withinWindow ? Number(previous.sendCount || 0) : 0;
    if (sendCount >= REGISTRATION_OTP_MAX_PER_WINDOW) {
      throw registrationError('Too many codes were requested. Please try again later.', 429);
    }

    const nextWindowStart = withinWindow ? windowStart : now;
    transaction.set(reference, {
      email,
      challengeId,
      codeHash: registrationCodeHash(challengeId, code),
      expiresAt,
      attempts: 0,
      verified: false,
      consumed: false,
      createdAt: now,
      lastSentAt: now,
      windowStart: nextWindowStart,
      sendCount: sendCount + 1,
    });
  });

  try {
    const unsubscribeUrl = await emailUnsubscribeUrl(email);
    const content = otpEmailContent({
      code,
      intro: 'Enter this code to continue creating your SmartQuiz account:',
      unsubscribeUrl,
    });
    const result = await sendBrevoMessage({
      recipient: email,
      subject: 'Your SmartQuiz verification code',
      htmlContent: content.html,
      textContent: content.text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
    });
    return {
      sent: true,
      accepted: true,
      challengeId,
      recipient: result.recipient,
      messageId: result.messageId,
      expiresIn: Math.floor(REGISTRATION_OTP_TTL_MS / 1000),
      resendAfter: Math.floor(REGISTRATION_OTP_RESEND_WAIT_MS / 1000),
    };
  } catch (error) {
    // Keep the throttle record after a provider failure. A caller can retry
    // after the cooldown without turning this public endpoint into an email
    // flooder.
    throw error;
  }
}

async function findRegistrationChallenge(email, challengeId) {
  const normalizedEmail = registrationEmail(email);
  const reference = db.collection(REGISTRATION_OTP_COLLECTION).doc(registrationEmailId(normalizedEmail));
  const snapshot = await reference.get();
  if (!snapshot.exists || snapshot.data().challengeId !== String(challengeId || '')) {
    throw registrationError('This verification request is no longer valid. Request a new code.');
  }
  return { email: normalizedEmail, reference, data: snapshot.data() };
}

async function verifyRegistrationOtp(payload) {
  const code = String(payload.otp || '').replace(/\D/g, '');
  if (code.length !== 6) throw registrationError('Enter the six-digit verification code.');
  const challenge = await findRegistrationChallenge(payload.email, payload.challengeId);
  const now = Date.now();
  let verified = false;
  let verificationError = null;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(challenge.reference);
    if (!snapshot.exists || snapshot.data().challengeId !== challenge.data.challengeId) {
      throw registrationError('This verification request is no longer valid. Request a new code.');
    }
    const current = snapshot.data();
    if (current.consumed) throw registrationError('This verification request has already been used.');
    if (current.verified) {
      verificationError = null;
      verified = true;
      return;
    }
    if (now > Number(current.expiresAt || 0)) {
      throw registrationError('That code has expired. Request a new one.');
    }
    const attempts = Number(current.attempts || 0);
    if (attempts >= REGISTRATION_OTP_MAX_ATTEMPTS) {
      throw registrationError('Too many incorrect attempts. Request a new code.', 429);
    }
    const expected = Buffer.from(String(current.codeHash || ''), 'hex');
    const received = Buffer.from(registrationCodeHash(current.challengeId, code), 'hex');
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) {
      transaction.update(challenge.reference, { attempts: attempts + 1 });
      verificationError = attempts + 1 >= REGISTRATION_OTP_MAX_ATTEMPTS
        ? registrationError('Too many incorrect attempts. Request a new code.', 429)
        : registrationError('Incorrect code. Please try again.');
      return;
    }
    transaction.update(challenge.reference, { verified: true, verifiedAt: now });
    verified = true;
  });

  if (verificationError) throw verificationError;
  return { verified, challengeId: challenge.data.challengeId, expiresIn: 600 };
}

async function createRegistrationAccount(payload) {
  const email = registrationEmail(payload.email);
  const password = String(payload.password || '');
  if (password.length < 8) throw registrationError('Password must be at least 8 characters.');
  const challenge = await findRegistrationChallenge(email, payload.challengeId);
  const current = challenge.data;
  if (current.consumed) {
    const existingUser = await admin.auth().getUserByEmail(email).catch(() => null);
    const existingProfile = existingUser
      ? await db.doc(`users/${existingUser.uid}`).get()
      : null;
    const profile = existingProfile && existingProfile.exists ? existingProfile.data() : {};
    if (existingUser
      && profile.registration_challenge_id === current.challengeId
      && profile.registration_status === 'profile_pending') {
      let welcomeEmailSent = false;
      try {
        const welcome = await sendWelcomeEmail({
          uid: existingUser.uid,
          email,
          name: existingUser.displayName || email.split('@')[0],
        });
        welcomeEmailSent = welcome.sent === true;
      } catch (error) {
        console.warn('SmartQuiz welcome email could not be sent:', error.message);
      }
      return { created: true, existing: true, email, uid: existingUser.uid, welcomeEmailSent };
    }
    throw registrationError('This verification request has already been used.');
  }
  if (!current.verified || Date.now() > Number(current.expiresAt || 0)) {
    throw registrationError('Verify your email before creating the account.');
  }

  let user;
  try {
    user = await admin.auth().createUser({
      email,
      password,
      emailVerified: true,
    });
  } catch (error) {
    if (error && error.code === 'auth/email-already-exists') {
      throw registrationError('That email is already registered. Sign in instead.', 409);
    }
    throw error;
  }

  try {
    await db.doc(`users/${user.uid}`).set({
      uid: user.uid,
      email,
      role: 'student',
      created_at: admin.firestore.FieldValue.serverTimestamp(),
      status: 'pending',
      registration_status: 'profile_pending',
      otp_verified: true,
      email_verified: true,
      registration_challenge_id: challenge.data.challengeId,
    });
    await challenge.reference.update({ consumed: true, consumedAt: Date.now() });
  } catch (error) {
    await admin.auth().deleteUser(user.uid).catch(() => {});
    throw error;
  }

  let welcomeEmailSent = false;
  try {
    const welcome = await sendWelcomeEmail({
      uid: user.uid,
      email,
      name: user.displayName || email.split('@')[0],
    });
    welcomeEmailSent = welcome.sent === true;
  } catch (error) {
    console.warn('SmartQuiz welcome email could not be sent:', error.message);
  }
  return { created: true, email, uid: user.uid, welcomeEmailSent };
}

exports.brevoEmail = onRequest(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (request, response) => {
    setCors(response);
    if (request.method === 'OPTIONS') return response.status(204).send('');
    if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST for email actions.' });

    try {
      const payload = request.body && typeof request.body === 'object' ? request.body : {};
      const kind = String(payload.kind || '');
      if (kind === 'unsubscribe') {
        return response.json(await unsubscribeFromProductUpdates(payload.token));
      }
      if (kind === 'registration_otp_send') {
        return response.json(await sendRegistrationOtp(payload));
      }
      if (kind === 'registration_otp_verify') {
        return response.json(await verifyRegistrationOtp(payload));
      }
      if (kind === 'registration_create') {
        return response.json(await createRegistrationAccount(payload));
      }

      const user = await verifyBearerUser(request);
      const isAdmin = String(user.email || '').toLowerCase() === 'daramolapeter98@gmail.com';

      if (kind === 'welcome') {
        return response.json(await sendWelcomeEmail(user));
      }

      if (kind === 'test') {
        if (!isAdmin) return response.status(403).json({ error: 'Admin access required.' });
        const result = await sendBrevoMessage({
          recipient: payload.recipient || user.email,
          subject: 'SmartQuiz Brevo test email',
          htmlContent: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Brevo is connected</h2><p>Your SmartQuiz email configuration is working correctly.</p></div>',
          textContent: 'Brevo is connected. Your SmartQuiz email configuration is working correctly.',
        });
        return response.json({ sent: true, accepted: true, ...result });
      }

      if (kind === 'otp') {
        const code = String(payload.code || '').replace(/\D/g, '');
        if (code.length !== 6) return response.status(400).json({ error: 'A valid six-digit OTP is required.' });
        const passwordChange = String(payload.purpose || '') === 'password_change';
        const subject = passwordChange ? 'Your SmartQuiz password change code' : 'Your SmartQuiz verification code';
        const intro = passwordChange
          ? 'Enter this code to continue changing your SmartQuiz password:'
          : 'Enter this code to finish verifying your SmartQuiz account:';
        const unsubscribeUrl = await emailUnsubscribeUrl(user.email);
        const content = otpEmailContent({ code, intro, unsubscribeUrl });
        const result = await sendBrevoMessage({
          recipient: user.email,
          subject,
          htmlContent: content.html,
          textContent: content.text,
          headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
        });
        return response.json({ sent: true, accepted: true, ...result });
      }

      return response.status(400).json({ error: 'Unknown email action.' });
    } catch (error) {
      console.error('Brevo email error:', error);
      const status = Number(error && error.httpStatus)
        || (error && error.code === 'auth/id-token-expired' ? 401 : 502);
      return response.status(status).json({ error: error.message || 'Email service is unavailable.' });
    }
  },
);

function requestIp(request) {
  const forwarded = request.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim().slice(0, 128);
  return String(request.ip || 'unknown').slice(0, 128);
}

function quotaDocumentId(ipAddress) {
  return crypto.createHash('sha256').update(ipAddress).digest('hex').slice(0, 40);
}

class QuotaExceededError extends Error {
  constructor(resetsAt) {
    super('You have used all five image generations for this rolling 24-hour window.');
    this.name = 'QuotaExceededError';
    this.resetsAt = resetsAt;
  }
}

async function reserveCreatorImageCredit(ipAddress) {
  const reference = db.collection('creator_image_quota').doc(quotaDocumentId(ipAddress));
  const now = Date.now();
  const cutoff = now - CREATOR_IMAGE_WINDOW_MS;
  let result;

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const existing = snapshot.exists && Array.isArray(snapshot.data().events)
      ? snapshot.data().events
      : [];
    const events = existing
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value >= cutoff);

    if (events.length >= CREATOR_IMAGE_LIMIT) {
      throw new QuotaExceededError(new Date(Math.min(...events) + CREATOR_IMAGE_WINDOW_MS).toISOString());
    }

    events.push(now);
    const resetsAt = new Date(Math.min(...events) + CREATOR_IMAGE_WINDOW_MS).toISOString();
    transaction.set(reference, { events, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    result = {
      used: events.length,
      limit: CREATOR_IMAGE_LIMIT,
      remaining: Math.max(0, CREATOR_IMAGE_LIMIT - events.length),
      resetsAt,
      plan: 'Free',
    };
  });

  return result;
}

async function creatorImageQuota(ipAddress) {
  const reference = db.collection('creator_image_quota').doc(quotaDocumentId(ipAddress));
  const now = Date.now();
  const cutoff = now - CREATOR_IMAGE_WINDOW_MS;
  const snapshot = await reference.get();
  const existing = snapshot.exists && Array.isArray(snapshot.data().events)
    ? snapshot.data().events
    : [];
  const events = existing
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value >= cutoff);
  const resetsAt = events.length
    ? new Date(Math.min(...events) + CREATOR_IMAGE_WINDOW_MS).toISOString()
    : new Date(now + CREATOR_IMAGE_WINDOW_MS).toISOString();
  return {
    used: events.length,
    limit: CREATOR_IMAGE_LIMIT,
    remaining: Math.max(0, CREATOR_IMAGE_LIMIT - events.length),
    resetsAt,
    plan: 'Free',
  };
}

function cleanImageKeys(value) {
  return Array.isArray(value)
    ? value
        .filter((key) => typeof key === 'string')
        .map((key) => key.replace(/[^\x20-\x7E]/g, '').trim())
        .filter((key) => key.length > 10)
        .slice(0, 5)
    : [];
}

async function creatorImageSettings() {
  const snapshot = await db.doc('settings/main').get();
  const settings = snapshot.exists ? snapshot.data() : {};
  return {
    keys: cleanImageKeys(settings.creator_image_keys),
    model: typeof settings.creator_image_model === 'string' && settings.creator_image_model.trim()
      ? settings.creator_image_model.trim()
      : DEFAULT_CREATOR_IMAGE_MODEL,
  };
}

function keyHash(key) {
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

async function imageKeyOrder(keys) {
  const reference = db.doc('creator_image_runtime/pool');
  const now = Date.now();
  let order = [];

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const state = snapshot.exists ? snapshot.data() : {};
    const start = Number.isInteger(state.nextIndex) ? state.nextIndex % keys.length : 0;
    const cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? state.cooldowns : {};
    const available = [];

    for (let offset = 0; offset < keys.length; offset += 1) {
      const index = (start + offset) % keys.length;
      if (Number(cooldowns[keyHash(keys[index])] || 0) <= now) available.push(index);
    }
    order = available.length
      ? available
      : Array.from({ length: keys.length }, (_, offset) => (start + offset) % keys.length);

    transaction.set(reference, {
      nextIndex: (start + 1) % keys.length,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  });

  return order;
}

async function coolDownImageKey(key) {
  const reference = db.doc('creator_image_runtime/pool');
  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(reference);
    const state = snapshot.exists ? snapshot.data() : {};
    const cooldowns = state.cooldowns && typeof state.cooldowns === 'object' ? { ...state.cooldowns } : {};
    cooldowns[keyHash(key)] = Date.now() + CREATOR_IMAGE_COOLDOWN_MS;
    transaction.set(reference, { cooldowns, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
  });
}

function dimensionsFor(aspectRatio) {
  if (aspectRatio === 'square') return { width: 1024, height: 1024 };
  if (aspectRatio === 'portrait') return { width: 576, height: 1024 };
  return { width: 1024, height: 576 };
}

function enhancedCreatorImagePrompt(prompt, category) {
  const brief = String(prompt || '').replace(/\s+/g, ' ').trim();
  const direction = {
    logo: 'Design a clean, scalable logo mark with one clear focal symbol and intentional negative space. Use a plain background. Do not invent a brand name or lettering unless the brief explicitly requests it.',
    banner: 'Design a deliberate banner composition with a strong focal subject, readable visual hierarchy, and intentional open space where the brief implies it. Do not add unrelated objects or text.',
    avatar: 'Create one centered avatar subject with a clear silhouette, readable face or emblem, and a simple uncluttered background. Do not add extra people or competing subjects.',
    general: 'Create one coherent scene or composition. Keep the main subject, object count, setting, colors, and action exactly aligned with the brief.',
  }[category] || 'Create one coherent scene or composition.';
  return `Faithful image interpretation. Primary brief: "${brief}". ${direction} Preserve the specific nouns, relationships, colors, mood, and constraints in the brief. High detail, crisp edges, natural anatomy, intentional composition.`;
}

function pollinationsUrl(prompt, dimensions) {
  const negativePrompt = 'extra subjects, unrelated objects, duplicate objects, distorted anatomy, extra fingers, bad hands, blurry, pixelated, watermark, unwanted text';
  return `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?model=flux&width=${dimensions.width}&height=${dimensions.height}&nologo=true&enhance=false&negative_prompt=${encodeURIComponent(negativePrompt)}&seed=${Math.floor(Math.random() * 1000000000)}`;
}

function ownerKey(request, clientId) {
  return crypto.createHash('sha256')
    .update(`${requestIp(request)}:${String(clientId || '').slice(0, 128)}`)
    .digest('hex')
    .slice(0, 40);
}

async function persistImageBytes(dataUrl, generationId) {
  const match = /^data:([^;,]+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return dataUrl;

  const contentType = match[1];
  const extension = contentType.split('/')[1] === 'jpeg' ? 'jpg' : contentType.split('/')[1] || 'png';
  const file = admin.storage().bucket().file(`creator-studio/${generationId}.${extension}`);
  await file.save(Buffer.from(match[2], 'base64'), {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: 'public,max-age=31536000,immutable',
    },
  });
  const [signedUrl] = await file.getSignedUrl({
    action: 'read',
    expires: '2035-01-01T00:00:00.000Z',
  });
  return signedUrl;
}

async function persistCreatorGeneration(request, clientId, result) {
  const generationId = result.id;
  let persistedUrl = result.url;
  if (String(result.url || '').startsWith('data:')) {
    persistedUrl = await persistImageBytes(result.url, generationId);
  }

  await db.collection('creator_generations').doc(generationId).set({
    ownerKey: ownerKey(request, clientId),
    prompt: result.prompt,
    mediaType: result.mediaType,
    url: persistedUrl,
    provider: result.provider,
    fallbackUsed: Boolean(result.fallbackUsed),
    qualityNotes: result.qualityNotes || [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return persistedUrl;
}

async function listCreatorGenerations(request, clientId) {
  const snapshot = await db.collection('creator_generations')
    .where('ownerKey', '==', ownerKey(request, clientId))
    .limit(20)
    .get();
  return snapshot.docs
    .map((document) => {
      const data = document.data();
      const createdAt = data.createdAt && typeof data.createdAt.toDate === 'function'
        ? data.createdAt.toDate().toISOString()
        : new Date().toISOString();
      return {
        id: document.id,
        mediaType: data.mediaType || 'image',
        url: data.url,
        provider: data.provider || 'unknown',
        prompt: data.prompt || '',
        createdAt,
        qualityNotes: Array.isArray(data.qualityNotes) ? data.qualityNotes : [],
        fallbackUsed: Boolean(data.fallbackUsed),
      };
    })
    .filter((item) => item.url)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 12);
}

async function generateWithCreatorImagePool(prompt, dimensions, keys, model) {
  if (!keys.length) return null;

  const order = await imageKeyOrder(keys);
  const endpoint = `https://api-inference.huggingface.co/models/${model.split('/').map(encodeURIComponent).join('/')}`;

  for (const index of order) {
    const key = keys[index];
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          inputs: prompt,
          parameters: {
            width: dimensions.width,
            height: dimensions.height,
            num_inference_steps: 4,
            negative_prompt: 'extra subjects, unrelated objects, duplicate objects, distorted anatomy, extra fingers, bad hands, blurry, pixelated, watermark, unwanted text',
          },
        }),
      });

      if (response.status === 429 || response.status === 503 || response.status === 504) {
        await coolDownImageKey(key);
        continue;
      }
      if (response.status === 401 || response.status === 403 || !response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) continue;

      const base64 = Buffer.from(await response.arrayBuffer()).toString('base64');
      return {
        mediaType: 'image',
        url: `data:${contentType.split(';')[0]};base64,${base64}`,
        provider: 'huggingface image pool',
        fallbackUsed: false,
      };
    } catch (_) {
      /* The next configured token or public fallback gets the request. */
    }
  }

  return null;
}

async function checkCreatorImagePool(keys, model) {
  if (!keys.length) return [];
  const endpoint = `https://api-inference.huggingface.co/models/${model.split('/').map(encodeURIComponent).join('/')}`;
  const results = [];

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    try {
      const startedAt = Date.now();
      const providerResponse = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          inputs: 'A simple blue circle on a clean white background',
          parameters: { width: 256, height: 256, num_inference_steps: 4 },
        }),
      });
      const contentType = providerResponse.headers.get('content-type') || '';
      const rateLimited = providerResponse.status === 429 || providerResponse.status === 503 || providerResponse.status === 504;
      if (rateLimited) await coolDownImageKey(key);
      results.push({
        slot: index + 1,
        status: providerResponse.ok && contentType.startsWith('image/')
          ? 'healthy'
          : rateLimited
            ? 'rate_limited'
            : providerResponse.status === 401 || providerResponse.status === 403
              ? 'invalid'
              : 'unavailable',
        httpStatus: providerResponse.status,
        latencyMs: Date.now() - startedAt,
      });
    } catch (_) {
      results.push({ slot: index + 1, status: 'unavailable', httpStatus: 0, latencyMs: 0 });
    }
  }

  return results;
}

exports.creatorImageGenerate = onRequest(
  { region: 'us-central1', timeoutSeconds: 120, memory: '512MiB' },
  async (request, response) => {
    setCors(response);
    if (request.method === 'OPTIONS') return response.status(204).send('');
    const route = String(request.path || request.url || '').split('?')[0];
    if (request.method === 'GET') {
      try {
        if (route.endsWith('/healthz')) return response.json({ status: 'ok' });
        if (route.endsWith('/quota')) return response.json(await creatorImageQuota(requestIp(request)));
        return response.json(await listCreatorGenerations(request, request.query.clientId));
      } catch (error) {
        console.error('Creator Studio read error:', error);
        return response.status(500).json({ error: 'Creator Studio data could not be loaded.' });
      }
    }
    if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST for image generation.' });

    const payload = request.body && typeof request.body === 'object' ? request.body : {};
    const prompt = String(payload.prompt || '').trim();
    const testOnly = Boolean(payload.testOnly);
    if (!testOnly && prompt.length < 3) return response.status(400).json({ error: 'Enter a prompt with at least 3 characters.' });

    let settings;
    try {
      settings = await creatorImageSettings();
    } catch (error) {
      console.error('Creator image settings error:', error);
      return response.status(500).json({ error: 'Image settings could not be loaded.' });
    }

    if (testOnly) {
      return response.json({
        model: settings.model,
        configuredTokens: settings.keys.length,
        health: await checkCreatorImagePool(settings.keys, settings.model),
      });
    }

    let quota;
    try {
      quota = await reserveCreatorImageCredit(requestIp(request));
    } catch (error) {
      if (error instanceof QuotaExceededError) {
        return response.status(429).json({
          error: error.message,
          code: 'QUOTA_EXHAUSTED',
          remaining: 0,
          limit: CREATOR_IMAGE_LIMIT,
          resetsAt: error.resetsAt,
          plan: 'Free',
        });
      }
      console.error('Creator image quota error:', error);
      return response.status(500).json({ error: 'Image quota could not be checked.' });
    }

    try {
      const dimensions = dimensionsFor(payload.aspectRatio);
      const enhancedPrompt = enhancedCreatorImagePrompt(prompt, payload.category);
      const generated = await generateWithCreatorImagePool(enhancedPrompt, dimensions, settings.keys, settings.model);
      const result = generated || {
        mediaType: 'image',
        url: pollinationsUrl(enhancedPrompt, dimensions),
        provider: 'pollinations',
        fallbackUsed: true,
      };
      const generationId = `creator-image-${Date.now()}-${crypto.randomUUID()}`;
      const responseResult = {
        id: generationId,
        ...result,
        prompt,
        createdAt: new Date().toISOString(),
        qualityNotes: [
          result.fallbackUsed
            ? 'Public fallback engine used because no managed image token succeeded.'
            : 'Dedicated Creator Studio image-token pool used.',
          'Automatic quality and anatomy safeguards applied.',
        ],
        quota,
      };
      try {
        responseResult.url = await persistCreatorGeneration(request, payload.clientId, responseResult);
      } catch (persistenceError) {
        console.error('Creator generation persistence error:', persistenceError);
        if (String(responseResult.url || '').startsWith('data:')) {
          return response.status(502).json({ error: 'The image was generated but could not be saved. Please try again.' });
        }
      }

      return response.json(responseResult);
    } catch (error) {
      console.error('Creator image generation error:', error);
      return response.status(502).json({ error: 'The image providers are temporarily unavailable.' });
    }
  },
);
