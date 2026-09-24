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
const EMAIL_PREFERENCES_COLLECTION = 'email_preferences';
const EMAIL_UNSUBSCRIBE_TOKEN_COLLECTION = 'email_unsubscribe_tokens';
const APP_SIGN_IN_URL = 'https://darapet.github.io/smartquiz-system/login.html';

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

async function sendBrevoMessage({ recipient, subject, htmlContent, textContent }) {
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


async function createEmailUnsubscribeUrl(email) {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  await db.collection(EMAIL_UNSUBSCRIBE_TOKEN_COLLECTION).doc(tokenHash).set({
    emailHash: registrationEmailId(email),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  const projectId = process.env.GCLOUD_PROJECT || 'smartquiz-darapet';
  const endpoint = 'https://us-central1-' + projectId + '.cloudfunctions.net/brevoEmail';
  return endpoint + '?kind=unsubscribe&token=' + encodeURIComponent(token);
}

async function unsubscribeFromOptionalEmails(token, confirmChange) {
  const value = String(token || '').trim();
  if (!/^[0-9a-f]{64}$/i.test(value)) return false;
  const tokenHash = crypto.createHash('sha256').update(value).digest('hex');
  const tokenSnapshot = await db.collection(EMAIL_UNSUBSCRIBE_TOKEN_COLLECTION).doc(tokenHash).get();
  if (!tokenSnapshot.exists) return false;
  const emailHash = String(tokenSnapshot.data().emailHash || '');
  if (!/^[0-9a-f]{64}$/i.test(emailHash)) return false;
  if (!confirmChange) return true;
  await db.collection(EMAIL_PREFERENCES_COLLECTION).doc(emailHash).set({
    marketingUnsubscribed: true,
    marketingUnsubscribedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  return true;
}
function escapeEmailHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
  });
}

function emailBrandHeaderHtml() {
  return '<tr><td style="padding:24px 30px;background:#171a35"><table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>'
    + '<td style="width:40px;height:40px;background:#6862f5;border-radius:12px;color:#ffffff;text-align:center;vertical-align:middle;font-size:20px;font-weight:700">S</td>'
    + '<td style="padding-left:12px;color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.2px">SmartQuiz</td>'
    + '</tr></table></td></tr>';
}

function emailFooterHtml(unsubscribeUrl, reason) {
  return '<tr><td style="padding:20px 30px 26px;color:#737b8f;font-size:12px;line-height:1.7;text-align:center">'
    + escapeEmailHtml(reason) + ' <a href="' + escapeEmailHtml(unsubscribeUrl) + '" style="color:#5954d6;text-decoration:underline">Unsubscribe from optional product updates</a>.'
    + ' Essential account, verification, and security emails will still be sent.</td></tr>';
}

function otpEmailHtml(options) {
  const heading = escapeEmailHtml(options.heading || 'Verify your email');
  const intro = escapeEmailHtml(options.intro || 'Enter this code to continue.');
  const code = escapeEmailHtml(options.code);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f2f4fa;color:#20243a;font-family:Arial,Helvetica,sans-serif">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your SmartQuiz verification code is inside. It expires in 10 minutes.</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4fa"><tr><td align="center" style="padding:32px 14px">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">'
    + emailBrandHeaderHtml()
    + '<tr><td style="padding:34px 30px 12px"><p style="margin:0 0 10px;color:#625cf0;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Account security</p>'
    + '<h1 style="margin:0 0 14px;color:#20243a;font-size:26px;line-height:1.25">' + heading + '</h1>'
    + '<p style="margin:0;color:#626a7d;font-size:15px;line-height:1.7">' + intro + '</p></td></tr>'
    + '<tr><td style="padding:18px 30px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:22px 12px;background:#f3f2ff;border:1px solid #e3e1ff;border-radius:12px">'
    + '<span style="display:block;color:#737b8f;font-size:11px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase">Your one-time code</span>'
    + '<span style="display:block;margin-top:9px;color:#4944c8;font-size:34px;font-weight:700;letter-spacing:9px;line-height:1.2">' + code + '</span>'
    + '</td></tr></table></td></tr>'
    + '<tr><td style="padding:12px 30px 28px;color:#626a7d;font-size:14px;line-height:1.7">This code expires in <strong style="color:#20243a">10 minutes</strong>. For your safety, do not share it with anyone. If you did not request this code, you can ignore this email.</td></tr>'
    + emailFooterHtml(options.unsubscribeUrl, 'You received this email because a code was requested for your SmartQuiz account.')
    + '</table><p style="margin:18px 0 0;color:#8990a1;font-size:11px">SmartQuiz · Learn better, together</p></td></tr></table></body></html>';
}

function welcomeEmailHtml(unsubscribeUrl) {
  const startUrl = escapeEmailHtml(APP_SIGN_IN_URL);
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;padding:0;background:#f2f4fa;color:#20243a;font-family:Arial,Helvetica,sans-serif">'
    + '<div style="display:none;max-height:0;overflow:hidden;opacity:0">Your SmartQuiz account is ready. Create a quiz or start studying.</div>'
    + '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f4fa"><tr><td align="center" style="padding:32px 14px">'
    + '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden">'
    + emailBrandHeaderHtml()
    + '<tr><td style="padding:34px 30px 18px"><p style="margin:0 0 10px;color:#625cf0;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase">Your learning workspace</p>'
    + '<h1 style="margin:0 0 12px;color:#20243a;font-size:28px;line-height:1.25">Welcome to SmartQuiz</h1>'
    + '<p style="margin:0;color:#626a7d;font-size:15px;line-height:1.7">Your account is ready. Here are a few ways to make your next study session more useful.</p></td></tr>'
    + '<tr><td style="padding:4px 30px 10px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">'
    + '<tr><td style="padding:15px 0;border-bottom:1px solid #edf0f5"><strong style="color:#20243a;font-size:15px">Create an AI quiz</strong><br><span style="color:#626a7d;font-size:13px;line-height:1.7">Choose a topic or upload a document, generate questions, then review, edit, and share your quiz.</span></td></tr>'
    + '<tr><td style="padding:15px 0;border-bottom:1px solid #edf0f5"><strong style="color:#20243a;font-size:15px">Study with built-in tools</strong><br><span style="color:#626a7d;font-size:13px;line-height:1.7">Open Study Hub for notes, flashcards, mock exams, and a Pomodoro focus timer.</span></td></tr>'
    + '<tr><td style="padding:15px 0"><strong style="color:#20243a;font-size:15px">Challenge friends and follow your progress</strong><br><span style="color:#626a7d;font-size:13px;line-height:1.7">Play live head-to-head quiz rounds and check your scores from My Dashboard.</span></td></tr>'
    + '</table></td></tr>'
    + '<tr><td align="center" style="padding:10px 30px 8px"><a href="' + startUrl + '" style="display:inline-block;padding:14px 25px;background:#5b56e8;border-radius:9px;color:#ffffff;font-size:14px;font-weight:700;text-decoration:none">Sign in and get started</a></td></tr>'
    + '<tr><td style="padding:12px 30px 24px;color:#626a7d;font-size:13px;line-height:1.7">Start in three steps: sign in, choose <strong style="color:#20243a">Create Quiz</strong> to build your first practice set, then visit <strong style="color:#20243a">Study Hub</strong> or <strong style="color:#20243a">Challenge</strong> to keep going.</td></tr>'
    + emailFooterHtml(unsubscribeUrl, 'You received this welcome email after creating a SmartQuiz account.')
    + '</table><p style="margin:18px 0 0;color:#8990a1;font-size:11px">SmartQuiz · Learn better, together</p></td></tr></table></body></html>';
}

function unsubscribeConfirmationPageHtml(token) {
  const projectId = process.env.GCLOUD_PROJECT || 'smartquiz-darapet';
  const action = 'https://us-central1-' + projectId + '.cloudfunctions.net/brevoEmail?kind=unsubscribe';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Unsubscribe from SmartQuiz updates</title></head>'
    + '<body style="margin:0;padding:40px 16px;background:#f2f4fa;color:#20243a;font-family:Arial,Helvetica,sans-serif"><main style="max-width:520px;margin:8vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 12px 36px rgba(23,26,53,.08)"><p style="color:#625cf0;font-weight:700">SMARTQUIZ</p><h1 style="font-size:26px">Unsubscribe from optional updates?</h1><p style="color:#626a7d;line-height:1.7">Confirm below to stop optional product updates. Essential account, verification, and security emails will still be sent.</p>'
    + '<form method="post" action="' + action + '"><input type="hidden" name="kind" value="unsubscribe"><input type="hidden" name="token" value="' + escapeEmailHtml(token) + '"><button type="submit" style="padding:13px 20px;background:#5b56e8;border:0;border-radius:8px;color:#fff;font-weight:700;font-size:14px;cursor:pointer">Confirm unsubscribe</button></form></main></body></html>';
}

function unsubscribePageHtml(success) {
  const title = success ? 'You are unsubscribed' : 'This link is not valid';
  const copy = success
    ? 'You will no longer receive optional product updates. Essential account, verification, and security emails will still be sent.'
    : 'This unsubscribe link could not be verified. Use the link from a recent SmartQuiz email.';
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + title + '</title></head>'
    + '<body style="margin:0;padding:40px 16px;background:#f2f4fa;color:#20243a;font-family:Arial,Helvetica,sans-serif"><main style="max-width:520px;margin:8vh auto;padding:32px;background:#fff;border-radius:16px;box-shadow:0 12px 36px rgba(23,26,53,.08)"><p style="color:#625cf0;font-weight:700">SMARTQUIZ</p><h1 style="font-size:26px">' + title + '</h1><p style="color:#626a7d;line-height:1.7">' + copy + '</p></main></body></html>';
}
function registrationCodeHash(challengeId, code) {
  return crypto.createHash('sha256').update(`${challengeId}:${code}`).digest('hex');
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
    const unsubscribeUrl = await createEmailUnsubscribeUrl(email);
    const result = await sendBrevoMessage({
      recipient: email,
      subject: 'Your SmartQuiz verification code',
      htmlContent: otpEmailHtml({ heading: 'Verify your email', intro: 'Enter this code to continue creating your account.', code, unsubscribeUrl }),
      textContent: 'Your SmartQuiz verification code is ' + code + '. It expires in 10 minutes. If you did not request it, ignore this email. Unsubscribe from optional product updates: ' + unsubscribeUrl,
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


async function sendWelcomeEmail(recipient) {
  const unsubscribeUrl = await createEmailUnsubscribeUrl(recipient);
  return sendBrevoMessage({
    recipient,
    subject: 'Welcome to SmartQuiz — your study tools are ready',
    htmlContent: welcomeEmailHtml(unsubscribeUrl),
    textContent: 'Welcome to SmartQuiz! Your account is ready. Create AI quizzes from a topic or uploaded document, explore Study Hub for notes, flashcards, mock exams, and a Pomodoro timer, or challenge friends and follow your scores in My Dashboard. Start here: ' + APP_SIGN_IN_URL + '\n\nUnsubscribe from optional product updates: ' + unsubscribeUrl + '. Essential account and security emails will still be sent.',
  });
}

async function deliverRegistrationWelcomeEmail(email, uid) {
  const profileRef = db.doc('users/' + uid);
  try {
    const profileSnapshot = await profileRef.get();
    if (profileSnapshot.exists && profileSnapshot.data().welcome_email_sent_at) return true;
    const result = await sendWelcomeEmail(email);
    await profileRef.set({
      welcome_email_status: 'sent',
      welcome_email_sent_at: admin.firestore.FieldValue.serverTimestamp(),
      welcome_email_message_id: result.messageId,
    }, { merge: true });
    return true;
  } catch (error) {
    console.error('SmartQuiz welcome email could not be sent:', error);
    await profileRef.set({
      welcome_email_status: 'failed',
      welcome_email_last_attempt_at: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true }).catch(() => {});
    return false;
  }
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
      const welcomeEmailSent = await deliverRegistrationWelcomeEmail(email, existingUser.uid);
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

  const welcomeEmailSent = await deliverRegistrationWelcomeEmail(email, user.uid);
  return { created: true, email, uid: user.uid, welcomeEmailSent };
}

exports.brevoEmail = onRequest(
  { region: 'us-central1', timeoutSeconds: 30, memory: '256MiB' },
  async (request, response) => {
    setCors(response);
    if (request.method === 'OPTIONS') return response.status(204).send('');
    if (request.method === 'GET' && String(request.query.kind || '') === 'unsubscribe') {
      try {
        const validLink = await unsubscribeFromOptionalEmails(request.query.token, false);
        response.set('Cache-Control', 'no-store');
        response.set('Content-Type', 'text/html; charset=utf-8');
        return validLink
          ? response.status(200).send(unsubscribeConfirmationPageHtml(String(request.query.token || '')))
          : response.status(404).send(unsubscribePageHtml(false));
      } catch (error) {
        console.error('Email unsubscribe error:', error);
        response.set('Cache-Control', 'no-store');
        response.set('Content-Type', 'text/html; charset=utf-8');
        return response.status(500).send(unsubscribePageHtml(false));
      }
    }
    if (request.method !== 'POST') return response.status(405).json({ error: 'Use POST for email actions.' });

    try {
      const payload = request.body && typeof request.body === 'object' ? request.body : {};
      const kind = String(payload.kind || '');
      if (kind === 'unsubscribe') {
        const unsubscribed = await unsubscribeFromOptionalEmails(payload.token, true);
        response.set('Cache-Control', 'no-store');
        response.set('Content-Type', 'text/html; charset=utf-8');
        return response.status(unsubscribed ? 200 : 404).send(unsubscribePageHtml(unsubscribed));
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
        const unsubscribeUrl = await createEmailUnsubscribeUrl(user.email);
        const result = await sendBrevoMessage({
          recipient: user.email,
          subject,
          htmlContent: otpEmailHtml({ heading: passwordChange ? 'Confirm your password change' : 'Verify your account', intro, code, unsubscribeUrl }),
          textContent: 'Your SmartQuiz verification code is ' + code + '. It expires in 10 minutes. If you did not request it, ignore this email. Unsubscribe from optional product updates: ' + unsubscribeUrl,
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
