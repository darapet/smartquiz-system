const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const FIREBASE_SIGNUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';
const BREVO_CONFIG_KEY = 'brevo';
const REGISTRATION_KEY_PREFIX = 'registration:';
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

  const result = await sendBrevoMessage(env, {
    recipient: email,
    subject: 'Your SmartQuiz verification code',
    htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Verify your SmartQuiz email</h2><p>Enter this code to continue creating your account:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#4f46e5">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`,
    textContent: `Your SmartQuiz verification code is ${code}. It expires in 10 minutes.`,
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
  return { created: true, email, uid: body.localId };
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
    emailVerified: user.emailVerified !== false,
  };
}

async function sendBrevoMessage(env, { recipient, subject, htmlContent, textContent }) {
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
      const result = await sendBrevoMessage(env, {
        recipient: user.email,
        subject,
        htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>SmartQuiz security verification</h2><p>${intro}</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#4f46e5">${code}</p><p>This code expires in 10 minutes. If you did not request this, you can ignore this email.</p></div>`,
        textContent: `Your SmartQuiz verification code is ${code}. It expires in 10 minutes.`,
      });
      return json(request, env, { sent: true, accepted: true, ...result });
    }

    return json(request, env, { error: 'Unknown email action.' }, 400);
  } catch (error) {
    console.error('Cloudflare Brevo Worker error:', error);
    return json(request, env, { error: error.message || 'Email service is unavailable.' }, 502);
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