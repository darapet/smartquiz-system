import { db } from './aqs-firebase.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let accountsPromise = null;

function cleanAccounts(value) {
  if (!Array.isArray(value)) return [];
  return value.map((account) => ({
    name: String(account?.name || '').trim().slice(0, 60),
    cloudName: String(account?.cloudName || '').trim().replace(/[^a-zA-Z0-9_-]/g, ''),
    uploadPreset: String(account?.uploadPreset || '').trim().replace(/[^a-zA-Z0-9_-]/g, ''),
    folder: String(account?.folder || 'smartquiz').trim().replace(/[^a-zA-Z0-9_./-]/g, '').replace(/^\/+|\/+$/g, ''),
    enabled: account?.enabled !== false
  })).filter((account) => account.enabled && account.cloudName && account.uploadPreset).slice(0, 6);
}

async function getAccounts() {
  if (!accountsPromise) {
    accountsPromise = getDoc(doc(db, 'settings', 'cloudinary')).then((snapshot) => (
      snapshot.exists() ? cleanAccounts(snapshot.data().accounts) : []
    )).catch(() => []);
  }
  return accountsPromise;
}

window.aqsUploadFile = async function uploadFile(file, storagePath) {
  if (!file) throw new Error('Choose a file first.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a file below 25 MB.');
  const accounts = await getAccounts();
  if (!accounts.length) {
    throw new Error('Cloudinary storage is not configured yet. Ask an administrator to add an unsigned upload preset.');
  }

  let start = 0;
  try { start = Number(localStorage.getItem('aqs_cloudinary_rotation') || 0) % accounts.length; } catch (_) {}
  const errors = [];
  for (let attempt = 0; attempt < accounts.length; attempt += 1) {
    const account = accounts[(start + attempt) % accounts.length];
    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', account.uploadPreset);
    const safePath = String(storagePath || 'uploads').replace(/^\/+|\/+$/g, '').replace(/\.\./g, '');
    form.append('folder', [account.folder || 'smartquiz', safePath].filter(Boolean).join('/'));
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(account.cloudName)}/auto/upload`, {
        method: 'POST',
        body: form
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.secure_url) {
        throw new Error(result.error?.message || `Cloudinary rejected the upload (${response.status}).`);
      }
      try { localStorage.setItem('aqs_cloudinary_rotation', String((start + attempt + 1) % accounts.length)); } catch (_) {}
      return result.secure_url;
    } catch (error) {
      errors.push(`${account.name || account.cloudName}: ${error.message || 'upload failed'}`);
    }
  }
  throw new Error(`All configured Cloudinary accounts rejected the upload. ${errors.join(' | ')}`);
};

function useMainRegistration() {
  const registerForm = document.getElementById('studyco-register-form');
  const loginForm = document.getElementById('studyco-login-form');
  if (!loginForm) return;
  if (registerForm) registerForm.hidden = true;
  loginForm.hidden = false;
  const identifier = document.getElementById('studyco-login-identifier');
  if (identifier) {
    identifier.type = 'email';
    identifier.placeholder = 'you@example.com';
  }
  if (!document.querySelector('.studyco-mobile-register-note')) {
    const note = document.createElement('p');
    note.className = 'studyco-mobile-register-note';
    note.innerHTML = 'New to SmartQuiz? <a href="register.html">Create your account here</a>, then return to StudyCo Meet.';
    loginForm.insertAdjacentElement('afterend', note);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', useMainRegistration, { once: true });
} else {
  useMainRegistration();
}