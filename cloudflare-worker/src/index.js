const FIREBASE_LOOKUP_URL = 'https://identitytoolkit.googleapis.com/v1/accounts:lookup';
const BREVO_EMAIL_URL = 'https://api.brevo.com/v3/smtp/email';

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
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const fromEmail = String(env.BREVO_FROM_EMAIL || '').trim();
  const fromName = String(env.BREVO_FROM_NAME || 'SmartQuiz').trim();

  if (!apiKey || !fromEmail) {
    throw new Error('Brevo is not configured on the Cloudflare Worker.');
  }

  const response = await fetch(BREVO_EMAIL_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: fromName, email: fromEmail },
      to: [{ email: recipient }],
      subject,
      htmlContent,
      textContent,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const detail = body && body.message ? ` ${body.message}` : '';
    throw new Error(`Brevo rejected the email.${detail}`);
  }
  return response.json();
}

async function handleEmail(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders(request, env) });
  }
  if (request.method !== 'POST') {
    return json(request, env, { error: 'Use POST for email actions.' }, 405);
  }

  try {
    const user = await verifyFirebaseUser(request, env);
    const payload = await request.json().catch(() => ({}));
    const kind = String(payload && payload.kind || '');
    const adminEmail = String(env.ADMIN_EMAIL || 'daramolapeter98@gmail.com').trim().toLowerCase();

    if (kind === 'test') {
      if (user.email !== adminEmail) {
        return json(request, env, { error: 'Admin access required.' }, 403);
      }
      const recipient = String(payload && payload.recipient || user.email).trim().toLowerCase();
      if (!isEmail(recipient)) {
        return json(request, env, { error: 'Enter a valid test recipient email.' }, 400);
      }
      await sendBrevoMessage(env, {
        recipient,
        subject: 'SmartQuiz Brevo test email',
        htmlContent: '<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Brevo is connected</h2><p>Your SmartQuiz email configuration is working correctly.</p></div>',
        textContent: 'Brevo is connected. Your SmartQuiz email configuration is working correctly.',
      });
      return json(request, env, { sent: true });
    }

    if (kind === 'otp') {
      if (!user.emailVerified) {
        return json(request, env, { error: 'Verify your email before requesting an OTP.' }, 403);
      }
      const code = String(payload && payload.code || '').replace(/\D/g, '');
      if (code.length !== 6) {
        return json(request, env, { error: 'A valid six-digit OTP is required.' }, 400);
      }
      await sendBrevoMessage(env, {
        recipient: user.email,
        subject: 'Your SmartQuiz verification code',
        htmlContent: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h2>Verify your SmartQuiz account</h2><p>Enter this code to finish registration:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700;color:#4f46e5">${code}</p><p>This code expires in 10 minutes. If you did not create this account, you can ignore this email.</p></div>`,
        textContent: `Your SmartQuiz verification code is ${code}. It expires in 10 minutes.`,
      });
      return json(request, env, { sent: true });
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