const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const FIREBASE_SIGNUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_CONFIG_KEY = 'brevo';
const REGISTRATION_KEY_PREFIX = 'registration:';
const EMAIL_PREFERENCES_PREFIX = 'email-preferences:';
const EMAIL_UNSUBSCRIBE_PREFIX = 'email-unsubscribe:';
const WELCOME_SENT_PREFIX = 'welcome-sent:';
const WELCOME_LOCK_PREFIX = 'welcome-lock:';
const SMARTQUIZ_BASE_URL = 'https://darapet.github.io/smartquiz-system';
const EMAIL_PREFERENCES_URL = `${SMARTQUIZ_BASE_URL}/email-preferences.html`;
const REGISTRATION_TTL_SECONDS = 10 * 60;
const REGISTRATION_RESEND_WAIT_MS = 60 * 1000;
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;
const REGISTRATION_MAX_PER_WINDOW = 5;
const REGISTRATION_MAX_ATTEMPTS = 5;

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!configured.length) return '*';
  return configured.includes(origin) ? origin : 'null';
}

function corsHeaders(request, env) {
  return {
    'Access-Control-Allow-Origin': allowedOrigin(request, env),
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

function json(request, env, body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function bearerToken(request) {
  const header = String(request.headers.get('Authorization') || '');
  return header.replace(/^Bearer\s+/i, '').trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || '').trim());
}

function registrationEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (!isEmail(email)) throw registrationError('Enter a valid email address.');
  if (email === 'daramolapeter98@gmail.com') {
    throw registrationError('Use the admin sign-in account instead.');
  }
  return email;
}

function registrationError(message, status = 400) {
  const error = new Error(message);
  error.httpStatus = status;
  return error;
}

async function digestHex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

function randomRegistrationCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(100000 + (values[0] % 900000));
}

async function registrationStorageKey(email) {
  return `${REGISTRATION_KEY_PREFIX}${await digestHex(email)}`;
}

async function readRegistrationChallenge(env, email) {
  if (!env.EMAIL_CONFIG) {
    throw new Error('Registration storage is not configured on the Cloudflare Worker.');
  }
  const key = await registrationStorageKey(email);
  const data = await env.EMAIL_CONFIG.get(key, 'json');
  return { key, data: data || {} };
}

async function sendRegistrationOtp(env, payload) {
  const email = registrationEmail(payload && payload.email);
  const { key, data: previous } = await readRegistrationChallenge(env, email);
  const now = Date.now();
  const lastSentAt = Number(previous.lastSentAt || 0);

  if (lastSentAt && now - lastSentAt < REGISTRATION_RESEND_WAIT_MS) {
    const waitSeconds = Math.ceil((REGISTRATION_RESEND_WAIT_MS - (now - lastSentAt)) / 1000);
    throw registrationError(`Please wait ${waitSeconds} seconds before requesting another code.`, 429);
  }

  const windowStart = Number(previous.windowStart || 0);
  const withinWindow = windowStart && now - windowStart < REGISTRATION_WINDOW_MS;
  const sendCount = withinWindow ? Number(previous.sendCount || 0) : 0;
  if (sendCount >= REGISTRATION_MAX_PER_WINDOW) {
    throw registrationError('Too many codes were requested. Please try again later.', 429);
  }

  const challengeId = crypto.randomUUID();
  const code = randomRegistrationCode();
  const expiresAt = now + REGISTRATION_TTL_SECONDS * 1000;
  const nextWindowStart = withinWindow ? windowStart : now;

  await env.EMAIL_CONFIG.put(key, JSON.stringify({
    email,
    challengeId,
    codeHash: await digestHex(`${challengeId}:${code}`),
    expiresAt,
    attempts: 0,
    verified: false,
    consumed: false,
    createdAt: now,
    lastSentAt: now,
    windowStart: nextWindowStart,
    sendCount: sendCount + 1,
  }), { expirationTtl: REGISTRATION_TTL_SECONDS });

  const unsubscribeUrl = await emailUnsubscribeUrl(env, email);
  const content = otpEmailContent({
    code,
    intro: 'Enter this code to continue creating your SmartQuiz account:',
    unsubscribeUrl,
  });
  const result = await sendBrevoMessage(env, {
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
    expiresIn: REGISTRATION_TTL_SECONDS,
    resendAfter: Math.floor(REGISTRATION_RESEND_WAIT_MS / 1000),
  };
}

async function verifyRegistrationOtp(env, payload) {
  const email = registrationEmail(payload && payload.email);
  const challengeId = String(payload && payload.challengeId || '').trim();
  const code = String(payload && payload.otp || '').replace(/\D/g, '');
  if (!challengeId || code.length !== 6) {
    throw registrationError('Enter the six-digit verification code.');
  }

  const { key, data: challenge } = await readRegistrationChallenge(env, email);
  const now = Date.now();
  if (!challenge.challengeId || challenge.challengeId !== challengeId || challenge.consumed) {
    throw registrationError('This verification request is no longer valid. Request a new code.');
  }
  if (challenge.verified) return { verified: true, challengeId, expiresIn: REGISTRATION_TTL_SECONDS };
  if (now > Number(challenge.expiresAt || 0)) {
    throw registrationError('That code has expired. Request a new one.');
  }

  const attempts = Number(challenge.attempts || 0);
  if (attempts >= REGISTRATION_MAX_ATTEMPTS) {
    throw registrationError('Too many incorrect attempts. Request a new code.', 429);
  }

  const receivedHash = await digestHex(`${challengeId}:${code}`);
  if (receivedHash !== challenge.codeHash) {
    await env.EMAIL_CONFIG.put(key, JSON.stringify({
      ...challenge,
      attempts: attempts + 1,
    }), { expirationTtl: Math.max(60, Math.ceil((challenge.expiresAt - now) / 1000)) });
    if (attempts + 1 >= REGISTRATION_MAX_ATTEMPTS) {
      throw registrationError('Too many incorrect attempts. Request a new code.', 429);
    }
    throw registrationError('Incorrect code. Please try again.');
  }

  await env.EMAIL_CONFIG.put(key, JSON.stringify({
    ...challenge,
    verified: true,
    verifiedAt: now,
  }), { expirationTtl: Math.max(60, Math.ceil((challenge.expiresAt - now) / 1000)) });
  return { verified: true, challengeId, expiresIn: Math.floor((challenge.expiresAt - now) / 1000) };
}

async function createRegistrationAccount(env, payload) {
  const email = registrationEmail(payload && payload.email);
  const password = String(payload && payload.password || '');
  const challengeId = String(payload && payload.challengeId || '').trim();
  if (password.length < 8) throw registrationError('Password must be at least 8 characters.');
  if (!challengeId) throw registrationError('Verify your email before creating the account.');

  const { key, data: challenge } = await readRegistrationChallenge(env, email);
  if (!challenge.challengeId || challenge.challengeId !== challengeId || challenge.consumed) {
    throw registrationError('This verification request is no longer valid. Request a new code.');
  }
  if (!challenge.verified || Date.now() > Number(challenge.expiresAt || 0)) {
    throw registrationError('Verify your email before creating the account.');
  }

  const apiKey = String(env.FIREBASE_WEB_API_KEY || '').trim();
  if (!apiKey) throw new Error('Firebase authentication is not configured on the email Worker.');
  const response = await fetch(`${FIREBASE_SIGNUP_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const firebaseError = String(body && body.error && body.error.message || '');
    if (firebaseError === 'EMAIL_EXISTS') {
      throw registrationError('That email is already registered. Sign in instead.', 409);
    }
    throw new Error(firebaseError || 'Firebase could not create the account.');
  }

  await env.EMAIL_CONFIG.put(key, JSON.stringify({
    ...challenge,
    consumed: true,
    consumedAt: Date.now(),
  }), { expirationTtl: 60 });
  let welcomeEmailSent = false;
  try {
    const welcome = await sendWelcomeEmail(env, {
      uid: body.localId,
      email,
      name: body.displayName || email.split('@')[0],
    });
    welcomeEmailSent = welcome.sent === true;
  } catch (error) {
    console.warn('SmartQuiz welcome email could not be sent:', error.message);
  }
  return { created: true, email, uid: body.localId, welcomeEmailSent };
}

async function verifyFirebaseUser(request, env) {
  const token = bearerToken(request);
  if (!token) throw new Error('Authentication required.');

  const apiKey = String(env.FIREBASE_WEB_API_KEY || '').trim();
  if (!apiKey) throw new Error('Firebase authentication is not configured on the email Worker.');

  const response = await fetch(`${FIREBASE_LOOKUP_URL}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: token }),
  });
  const body = await response.json().catch(() => ({}));
  const user = body && Array.isArray(body.users) ? body.users[0] : null;

  if (!response.ok || !user || !user.email) {
    throw new Error('Your Firebase session is invalid or expired. Sign in again.');
  }
  return {
    email: String(user.email).trim().toLowerCase(),
    uid: String(user.localId || ''),
    displayName: String(user.displayName || ''),
    emailVerified: user.emailVerified !== false,
  };
}

async function sendBrevoMessage(env, { recipient, subject, htmlContent, textContent, headers }) {
  const config = await getBrevoConfig(env);
  const apiKey = config.apiKey;
  const fromEmail = config.fromEmail;
  const fromName = config.fromName;

  if (!apiKey || !fromEmail) {
    throw new Error('Brevo is not configured on the Cloudflare Worker.');
  }
  const normalizedRecipient = String(recipient || '').trim().toLowerCase();
  if (!isEmail(normalizedRecipient)) {
    throw new Error('A valid recipient email address is required.');
  }

  const response = await fetch(BREVO_EMAIL_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: normalizedRecipient }],
      subject,
      htmlContent,
      textContent,
      ...(headers && Object.keys(headers).length ? { headers } : {}),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && body.message ? ` ${body.message}` : '';
    throw new Error(`Brevo rejected the email.${detail}`);
  }
  if (!body || !body.messageId) {
    throw new Error('Brevo accepted the request without returning a message ID. Check the Brevo activity log.');
  }
  return {
    messageId: String(body.messageId),
    recipient: normalizedRecipient,
    sender: fromEmail,
  };
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

async function emailUnsubscribeUrl(env, email) {
  if (!env.EMAIL_CONFIG) throw new Error('Email preference storage is not configured on the Cloudflare Worker.');
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!isEmail(normalizedEmail)) throw new Error('A valid recipient email address is required.');
  const preferenceKey = `${EMAIL_PREFERENCES_PREFIX}${await digestHex(normalizedEmail)}`;
  const preferences = await env.EMAIL_CONFIG.get(preferenceKey, 'json') || {
    email: normalizedEmail,
    productUpdatesOptOut: false,
  };
  let token = String(preferences.unsubscribeToken || '');
  if (!token) {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    token = Array.from(bytes).map((byte) => byte.toString(16).padStart(2, '0')).join('');
    preferences.unsubscribeToken = token;
    await env.EMAIL_CONFIG.put(preferenceKey, JSON.stringify(preferences));
    await env.EMAIL_CONFIG.put(
      `${EMAIL_UNSUBSCRIBE_PREFIX}${await digestHex(token)}`,
      JSON.stringify({ preferenceKey }),
    );
  }
  return `${EMAIL_PREFERENCES_URL}?token=${encodeURIComponent(token)}`;
}

async function unsubscribeFromProductUpdates(env, tokenValue) {
  const token = String(tokenValue || '').trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw registrationError('This unsubscribe link is invalid or incomplete.', 400);
  }
  if (!env.EMAIL_CONFIG) throw new Error('Email preference storage is not configured on the Cloudflare Worker.');
  const tokenRecord = await env.EMAIL_CONFIG.get(
    `${EMAIL_UNSUBSCRIBE_PREFIX}${await digestHex(token)}`,
    'json',
  );
  if (!tokenRecord || !tokenRecord.preferenceKey) {
    throw registrationError('This unsubscribe link is invalid or has expired.', 404);
  }
  const preferences = await env.EMAIL_CONFIG.get(tokenRecord.preferenceKey, 'json');
  if (!preferences) throw registrationError('This unsubscribe link is invalid or has expired.', 404);
  await env.EMAIL_CONFIG.put(tokenRecord.preferenceKey, JSON.stringify({
    ...preferences,
    productUpdatesOptOut: true,
    productUpdatesUnsubscribedAt: Date.now(),
  }));
  return { unsubscribed: true };
}

async function sendWelcomeEmail(env, user) {
  const uid = String(user && user.uid || '').trim();
  const email = String(user && user.email || '').trim().toLowerCase();
  if (!uid || !isEmail(email)) throw new Error('A valid account is required to send the welcome email.');
  if (!env.EMAIL_CONFIG) throw new Error('Email preference storage is not configured on the Cloudflare Worker.');

  const id = await digestHex(uid);
  const sentKey = `${WELCOME_SENT_PREFIX}${id}`;
  if (await env.EMAIL_CONFIG.get(sentKey)) return { sent: true, alreadySent: true };
  const lockKey = `${WELCOME_LOCK_PREFIX}${id}`;
  if (await env.EMAIL_CONFIG.get(lockKey)) return { sent: false, inProgress: true };
  const claimId = crypto.randomUUID();
  await env.EMAIL_CONFIG.put(lockKey, claimId, { expirationTtl: 120 });

  try {
    const unsubscribeUrl = await emailUnsubscribeUrl(env, email);
    const name = String(user.name || user.displayName || email.split('@')[0]).trim();
    const content = welcomeEmailContent({ name, unsubscribeUrl });
    const result = await sendBrevoMessage(env, {
      recipient: email,
      subject: 'Welcome to SmartQuiz — let’s get started',
      htmlContent: content.html,
      textContent: content.text,
      headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
    });
    await env.EMAIL_CONFIG.put(sentKey, JSON.stringify({
      email,
      messageId: result.messageId,
      sentAt: Date.now(),
    }));
    await env.EMAIL_CONFIG.delete(lockKey);
    return { sent: true, accepted: true, ...result };
  } catch (error) {
    const activeClaim = await env.EMAIL_CONFIG.get(lockKey);
    if (activeClaim === claimId) await env.EMAIL_CONFIG.delete(lockKey);
    throw error;
  }
}

async function getBrevoConfig(env) {
  let stored = {};
  if (env.EMAIL_CONFIG) {
    stored = await env.EMAIL_CONFIG.get(BREVO_CONFIG_KEY, 'json').catch(() => ({})) || {};
  }
  return {
    apiKey: String(stored.apiKey || env.BREVO_API_KEY || '').trim(),
    fromEmail: String(stored.fromEmail || env.BREVO_FROM_EMAIL || '').trim(),
    fromName: String(stored.fromName || env.BREVO_FROM_NAME || 'SmartQuiz').trim(),
  };
}

async function saveBrevoConfig(env, payload) {
  if (!env.EMAIL_CONFIG) {
    throw new Error('Admin-managed email storage is not configured on the Cloudflare Worker.');
  }
  const apiKey = String(payload && payload.apiKey || '').trim();
  const fromEmail = String(payload && payload.fromEmail || '').trim();
  const fromName = String(payload && payload.fromName || 'SmartQuiz').trim();
  if (!apiKey) throw new Error('Add a Brevo API key in Admin Settings first.');
  if (!isEmail(fromEmail)) throw new Error('Add a valid verified sender email in Admin Settings first.');
  await env.EMAIL_CONFIG.put(BREVO_CONFIG_KEY, JSON.stringify({ apiKey, fromEmail, fromName }));
  return { saved: true, configured: true, sender: fromEmail };
}

async function handleEmail(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method !== 'POST') {
    return json(request, env, { error: 'Use POST for email actions.' }, 405);
  }

  try {
    const payload = await request.json().catch(() => ({}));
    const kind = String(payload && payload.kind || '');
    if (kind === 'unsubscribe') {
      return json(request, env, await unsubscribeFromProductUpdates(env, payload.token));
    }
    if (kind === 'registration_otp_send') {
      return json(request, env, await sendRegistrationOtp(env, payload));
    }
    if (kind === 'registration_otp_verify') {
      return json(request, env, await verifyRegistrationOtp(env, payload));
    }
    if (kind === 'registration_create') {
      return json(request, env, await createRegistrationAccount(env, payload));
    }

    const user = await verifyFirebaseUser(request, env);
    const adminEmail = String(env.ADMIN_EMAIL || 'daramolapeter98@gmail.com').trim().toLowerCase();

    if (kind === 'welcome') {
      return json(request, env, await sendWelcomeEmail(env, user));
    }

    if (kind === 'config') {
      if (user.email !== adminEmail) {
        return json(request, env, { error: 'Admin access required.' }, 403);
      }
      const result = await saveBrevoConfig(env, payload);
      return json(request, env, result);
    }

    if (kind === 'test') {
      if (user.email !== adminEmail) {
        return json(request, env, { error: 'Admin access required.' }, 403);
      }
      const recipient = String(payload && payload.recipient || user.email).trim().toLowerCase();
      if (!isEmail(recipient)) {
        return json(request, env, { error: 'Enter a valid test recipient email.' }, 400);
      }
      const result = await sendBrevoMessage(env, {
        recipient,
        subject: 'SmartQuiz Brevo test email',
        htmlContent: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Brevo is connected</h2><p>Your SmartQuiz email configuration is working correctly.</p></div>',
        textContent: 'Brevo is connected. Your SmartQuiz email configuration is working correctly.',
      });
      return json(request, env, { sent: true, accepted: true, ...result });
    }

    if (kind === 'otp') {
      const code = String(payload && payload.code || '').replace(/\D/g, '');
      if (code.length !== 6) {
        return json(request, env, { error: 'A valid six-digit OTP is required.' }, 400);
      }
      const passwordChange = String(payload && payload.purpose || '') === 'password_change';
      const subject = passwordChange ? 'Your SmartQuiz password change code' : 'Your SmartQuiz verification code';
      const intro = passwordChange
        ? 'Enter this code to continue changing your SmartQuiz password:'
        : 'Enter this code to finish verifying your SmartQuiz account:';
      const unsubscribeUrl = await emailUnsubscribeUrl(env, user.email);
      const content = otpEmailContent({ code, intro, unsubscribeUrl });
      const result = await sendBrevoMessage(env, {
        recipient: user.email,
        subject,
        htmlContent: content.html,
        textContent: content.text,
        headers: { 'List-Unsubscribe': `<${unsubscribeUrl}>` },
      });
      return json(request, env, { sent: true, accepted: true, ...result });
    }

    return json(request, env, { error: 'Unknown email action.' }, 400);
  } catch (error) {
    console.error('Cloudflare Brevo Worker error:', error);
    return json(request, env, { error: error.message || 'Email service is unavailable.' }, Number(error && error.httpStatus) || 502);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    /*
     * Keep the current route plus the legacy function-shaped routes. This
     * prevents cached/older SmartQuiz admin pages from turning a valid Worker
     * deployment into a misleading 404 while they refresh.
     */
    if (
      url.pathname === '/api/email'
      || url.pathname === '/api/email/'
      || url.pathname === '/brevoEmail'
      || url.pathname === '/brevoEmail/'
    ) {
      return handleEmail(request, env);
    }
    return new Response('Not found', { status: 404 });
  },
};