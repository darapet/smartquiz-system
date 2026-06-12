/* Firebase Cloud Functions — xzily AI email services
   Handles: OTP verification, Brevo contact add, newsletter send
   Deploy: firebase deploy --only functions
*/
'use strict';

const { onRequest } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');
const admin = require('firebase-admin');
const fetch = require('node-fetch');

admin.initializeApp();
const db = admin.firestore();

setGlobalOptions({ region: 'us-central1' });

const BREVO_API_URL = 'https://api.brevo.com/v3';
const BREVO_SENDER_EMAIL = 'daramolapeter98@gmail.com';
const BREVO_SENDER_NAME = 'xzily AI';
const BREVO_LIST_ID = 2;

/* ── CORS helper ── */
function setCors(req, res) {
    const allowed = [
        'https://darapet.github.io',
        'https://smartquiz-darapet.web.app',
        'https://smartquiz-darapet.firebaseapp.com',
    ];
    const origin = req.headers.origin || '';
    if (allowed.includes(origin) || origin.endsWith('.github.io') || origin.includes('localhost')) {
        res.set('Access-Control-Allow-Origin', origin);
    } else {
        res.set('Access-Control-Allow-Origin', '*');
    }
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
    return false;
}

/* ── Brevo API helper ── */
async function brevoFetch(path, body) {
    const apiKey = process.env.BREVO_API_KEY;
    const res = await fetch(`${BREVO_API_URL}${path}`, {
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(JSON.stringify(data));
    return data;
}

/* ── Generate 6-digit OTP ── */
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

/* ─────────────────────────────────────────────
   1. sendOtp — generate OTP, store in Firestore, email via Brevo
   POST { email }
───────────────────────────────────────────── */
exports.sendOtp = onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ success: false, message: 'Method not allowed' }); return; }

    const { email } = req.body;
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        res.status(400).json({ success: false, message: 'Valid email is required.' });
        return;
    }

    const otp = generateOTP();
    const expires = Date.now() + 10 * 60 * 1000; // 10 minutes

    try {
        /* Store OTP in Firestore */
        await db.collection('email_otps').doc(email.toLowerCase()).set({
            otp,
            expires,
            verified: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        /* Send branded OTP email via Brevo */
        await brevoFetch('/smtp/email', {
            sender: { name: BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
            to: [{ email }],
            subject: 'Your xzily AI verification code',
            htmlContent: `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0c29;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0c29;min-height:100vh;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="480" cellpadding="0" cellspacing="0" style="background:#1a1730;border-radius:20px;border:1px solid rgba(99,102,241,0.3);overflow:hidden;max-width:100%;">
      <tr>
        <td style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:32px 40px;text-align:center;border-bottom:1px solid rgba(99,102,241,0.2);">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(99,102,241,0.2);border-radius:14px;margin-bottom:16px;">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none">
              <polygon points="18,2 34,10 34,26 18,34 2,26 2,10" fill="white" opacity="0.9"/>
              <circle cx="18" cy="18" r="6" fill="#6366f1"/>
            </svg>
          </div>
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#e0e7ff;">xzily AI</h1>
          <p style="margin:6px 0 0;font-size:13px;color:#a5b4fc;">Email Verification</p>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;text-align:center;">
          <p style="margin:0 0 8px;font-size:15px;color:#94a3b8;">Your one-time verification code is</p>
          <div style="margin:20px auto;background:#0f0c29;border:2px solid rgba(99,102,241,0.4);border-radius:14px;padding:20px;display:inline-block;">
            <span style="font-size:40px;font-weight:800;letter-spacing:10px;color:#a5b4fc;font-family:monospace;">${otp}</span>
          </div>
          <p style="margin:20px 0 0;font-size:13px;color:#64748b;">This code expires in <strong style="color:#94a3b8;">10 minutes</strong>.<br>Never share this code with anyone.</p>
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;text-align:center;">
          <p style="font-size:12px;color:#475569;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;margin:0;">
            If you didn't request this, you can safely ignore this email.<br>
            &copy; ${new Date().getFullYear()} xzily AI — All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`,
        });

        res.json({ success: true, message: 'OTP sent to your email.' });
    } catch (err) {
        console.error('sendOtp error:', err);
        res.status(500).json({ success: false, message: 'Failed to send email. Please try again.' });
    }
});

/* ─────────────────────────────────────────────
   2. verifyOtp — check OTP against Firestore
   POST { email, otp }
───────────────────────────────────────────── */
exports.verifyOtp = onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ success: false }); return; }

    const { email, otp } = req.body;
    if (!email || !otp) {
        res.status(400).json({ success: false, message: 'Email and OTP are required.' });
        return;
    }

    try {
        const snap = await db.collection('email_otps').doc(email.toLowerCase()).get();

        if (!snap.exists) {
            res.status(400).json({ success: false, message: 'No OTP found. Please request a new one.' });
            return;
        }

        const record = snap.data();

        if (Date.now() > record.expires) {
            await snap.ref.delete();
            res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
            return;
        }

        if (record.otp !== otp.trim()) {
            res.status(400).json({ success: false, message: 'Incorrect code. Please try again.' });
            return;
        }

        /* Mark as verified */
        await snap.ref.update({ verified: true });

        res.json({ success: true, message: 'Email verified successfully.' });
    } catch (err) {
        console.error('verifyOtp error:', err);
        res.status(500).json({ success: false, message: 'Verification failed. Please try again.' });
    }
});

/* ─────────────────────────────────────────────
   3. addContact — add registered user to Brevo list
   POST { email, name }
───────────────────────────────────────────── */
exports.addContact = onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ success: false }); return; }

    const { email, name } = req.body;
    if (!email) {
        res.status(400).json({ success: false, message: 'Email is required.' });
        return;
    }

    try {
        const nameParts = (name || '').split(' ');
        await brevoFetch('/contacts', {
            email,
            attributes: {
                FIRSTNAME: nameParts[0] || '',
                LASTNAME: nameParts.slice(1).join(' ') || '',
            },
            listIds: [BREVO_LIST_ID],
            updateEnabled: true,
        });

        res.json({ success: true });
    } catch (err) {
        console.error('addContact error:', err);
        /* Don't block registration — just log */
        res.json({ success: false, message: 'Could not add to mailing list.' });
    }
});

/* ─────────────────────────────────────────────
   4. sendNewsletter — create & schedule Brevo campaign
   POST { subject, body, logoUrl, senderName }
───────────────────────────────────────────── */
exports.sendNewsletter = onRequest(async (req, res) => {
    if (setCors(req, res)) return;
    if (req.method !== 'POST') { res.status(405).json({ success: false }); return; }

    const { subject, body, logoUrl, senderName } = req.body;

    if (!subject || !body) {
        res.status(400).json({ success: false, message: 'Subject and body are required.' });
        return;
    }

    const logoHtml = logoUrl
        ? `<img src="${logoUrl}" alt="Logo" style="max-width:140px;height:auto;margin-bottom:16px;display:block;margin-left:auto;margin-right:auto;" />`
        : `<div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;background:rgba(99,102,241,0.2);border-radius:14px;margin:0 auto 16px;">
            <svg width="28" height="28" viewBox="0 0 36 36" fill="none"><polygon points="18,2 34,10 34,26 18,34 2,26 2,10" fill="white" opacity="0.9"/><circle cx="18" cy="18" r="6" fill="#6366f1"/></svg>
           </div>`;

    const paragraphs = body
        .split('\n')
        .filter(l => l.trim())
        .map(l => `<p style="margin:0 0 14px;font-size:15px;color:#94a3b8;line-height:1.7;">${l}</p>`)
        .join('');

    const htmlContent = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0c29;font-family:'Inter',Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#0f0c29;min-height:100vh;">
  <tr><td align="center" style="padding:40px 20px;">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#1a1730;border-radius:20px;border:1px solid rgba(99,102,241,0.3);overflow:hidden;max-width:100%;">
      <tr>
        <td style="background:linear-gradient(135deg,#1e1b4b,#312e81);padding:32px 40px;text-align:center;border-bottom:1px solid rgba(99,102,241,0.2);">
          ${logoHtml}
          <h1 style="margin:0;font-size:22px;font-weight:800;color:#e0e7ff;">${senderName || 'xzily AI'}</h1>
        </td>
      </tr>
      <tr>
        <td style="padding:36px 40px;">
          <h2 style="margin:0 0 20px;font-size:20px;font-weight:700;color:#e0e7ff;">${subject}</h2>
          ${paragraphs}
        </td>
      </tr>
      <tr>
        <td style="padding:0 40px 32px;text-align:center;">
          <p style="font-size:12px;color:#475569;border-top:1px solid rgba(255,255,255,0.06);padding-top:20px;margin:0;">
            You're receiving this because you're a member of xzily AI.<br>
            &copy; ${new Date().getFullYear()} xzily AI — All rights reserved.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;

    try {
        await brevoFetch('/emailCampaigns', {
            name: `Newsletter — ${subject} — ${new Date().toISOString().slice(0, 10)}`,
            subject,
            sender: { name: senderName || BREVO_SENDER_NAME, email: BREVO_SENDER_EMAIL },
            htmlContent,
            recipients: { listIds: [BREVO_LIST_ID] },
            scheduledAt: new Date(Date.now() + 60000).toISOString(),
        });

        res.json({ success: true, message: 'Newsletter sent to all subscribers.' });
    } catch (err) {
        console.error('sendNewsletter error:', err);
        res.status(500).json({ success: false, message: 'Failed to send newsletter. Check Brevo settings.' });
    }
});
